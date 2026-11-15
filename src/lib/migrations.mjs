/**
 * The migration check behind `agent-kit migrations` (data-schema skill, section 3).
 *
 * For every schema file changed against a base ref it applies the rules a reviewer would
 * otherwise have to remember, and names the reference and official skill the file needs.
 * Zero dependencies: a small SQL scanner, not a parser. It judges only changed files, so a repo
 * adopts it without fixing its history; the allowlist is a ratchet for the rest.
 *
 * Rules (id: level):
 *   header: fail        the file opens with a comment (what, why, task, Undo)
 *   number: fail        a leading number, unique in its folder, not below the base's highest
 *   transaction: fail   no BEGIN/COMMIT/ROLLBACK or PRAGMA foreign_keys (D1); none in Durable Object SQL strings
 *   money-float: fail   a money-like column is not REAL/float/double (or NUMERIC on SQLite, money on Postgres)
 *   json-valid: warn    JSON-looking text column without json_valid (D1, SQLite)
 *   destructive: fail   DROP TABLE/COLUMN, RENAME, TRUNCATE need an `Undo:` or `Destructive:` line
 *   applied: warn       a migration that exists on the base was edited or deleted
 *   any: warn           Convex `v.any()`
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

/** Engine name → what to read. Paths are relative to the installed skills folder. */
export const ROUTES = {
  postgres: { read: ['data-schema/references/postgres.md'], first: 'supabase/agent-skills supabase-postgres-best-practices' },
  supabase: {
    read: ['data-schema/references/supabase.md', 'data-schema/references/postgres.md'],
    first: 'supabase/agent-skills supabase + supabase-postgres-best-practices',
  },
  d1: { read: ['data-schema/references/d1-sqlite.md'], first: 'cloudflare/skills cloudflare (references/d1)' },
  sqlite: { read: ['data-schema/references/d1-sqlite.md'], first: null },
  'durable-objects': {
    read: ['data-schema/references/durable-objects.md', 'data-schema/references/d1-sqlite.md'],
    first: 'cloudflare/skills durable-objects',
  },
  convex: { read: ['data-schema/references/convex.md'], first: 'convex/agent-skills convex-migrate' },
  sql: { read: ['data-schema/SKILL.md'], first: null, note: 'engine unknown: name it in the schema block of agent-kit.config.json' },
}

/** Used when the config has no `schema.engines`: only what a path says unambiguously, plus generic SQL. */
export const DEFAULT_ENGINES = {
  supabase: ['**/supabase/migrations/*.sql'],
  convex: ['**/convex/schema.ts', '**/convex/schema/**/*.ts'],
  sql: ['**/migrations/*.sql'],
}

const SQL_ENGINES = new Set(['postgres', 'supabase', 'd1', 'sqlite', 'sql'])
const SQLITE = new Set(['d1', 'sqlite'])

/** A glob (`**`, `*`, `?`) as an anchored RegExp over `/`-separated paths. */
export function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/'
      re += slash ? '(?:.*/)?' : '.*'
      i += slash ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`)
}

/** The normalised `schema` block: engines in their written order, the first match wins. */
export function schemaConfig(raw = {}) {
  const engines = raw.engines ?? DEFAULT_ENGINES
  for (const name of Object.keys(engines)) {
    if (!ROUTES[name]) throw new Error(`schema.engines: unknown engine "${name}" (known: ${Object.keys(ROUTES).join(', ')})`)
  }
  return {
    engines: Object.entries(engines).map(([engine, globs]) => ({ engine, res: [].concat(globs).map(globToRegExp) })),
    allowlist: raw.allowlist ?? null,
    base: raw.base ?? 'origin/main',
  }
}

export function classify(file, cfg) {
  for (const { engine, res } of cfg.engines) if (res.some((re) => re.test(file))) return engine
  return null
}

/**
 * Blanks out comments (keeping newlines, so offsets keep their line) and returns the comment-free
 * text. String literals are kept as they are.
 */
export function stripSqlComments(text) {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') {
      const end = closing(text, i, c)
      out += text.slice(i, end + 1)
      i = end
    } else if (c === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') (out += ' '), i++
      if (i < text.length) out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end < 0 ? text.length : end + 2
      out += text.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop - 1
    } else out += c
  }
  return out
}

function closing(text, i, quote) {
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === quote) {
      if (text[j + 1] === quote) j++
      else return j
    }
  }
  return text.length - 1
}

/** Statements split on top-level `;`, each with its offset in the text. */
export function statements(clean) {
  const out = []
  let start = 0
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]
    if (c === "'" || c === '"' || c === '`') i = closing(clean, i, c)
    else if (c === ';') out.push({ text: clean.slice(start, i), at: start }), (start = i + 1)
  }
  if (clean.slice(start).trim()) out.push({ text: clean.slice(start), at: start })
  return out.map((s) => {
    const lead = s.text.length - s.text.trimStart().length
    return { text: s.text.trim(), at: s.at + lead }
  })
}

/** Splits on commas outside parentheses and quotes, with each part's offset. */
function topLevelSplit(text) {
  const parts = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') i = closing(text, i, c)
    else if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) parts.push({ text: text.slice(start, i), at: start }), (start = i + 1)
  }
  parts.push({ text: text.slice(start), at: start })
  return parts.map((p) => ({ text: p.text.trim(), at: p.at + (p.text.length - p.text.trimStart().length) }))
}

const IDENT = String.raw`(?:"[^"]+"|\x60[^\x60]+\x60|\[[^\]]+\]|[A-Za-z_][\w$]*)`
const unquote = (name) => name.replace(/^["`[]|["`\]]$/g, '')
const TABLE_CONSTRAINT = /^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|LIKE)\b/i

/** Column definitions from CREATE TABLE and ALTER TABLE ... ADD [COLUMN], with offsets. */
export function columns(stmt) {
  const out = []
  const create = stmt.text.match(new RegExp(String.raw`^CREATE\s+(?:(?:TEMP|TEMPORARY|UNLOGGED)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(${IDENT}(?:\.${IDENT})?)\s*\(`, 'i'))
  if (create) {
    const open = create[0].length - 1
    const close = matchParen(stmt.text, open)
    const body = stmt.text.slice(open + 1, close)
    for (const part of topLevelSplit(body)) {
      if (!part.text || TABLE_CONSTRAINT.test(part.text)) continue
      const col = parseColumn(part.text)
      if (col) out.push({ ...col, at: stmt.at + open + 1 + part.at, table: body })
    }
    return out
  }
  const alter = stmt.text.match(new RegExp(String.raw`^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${IDENT}(?:\.${IDENT})?\s+`, 'i'))
  if (!alter) return out
  for (const part of topLevelSplit(stmt.text.slice(alter[0].length))) {
    const add = part.text.match(/^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?/i)
    if (!add || TABLE_CONSTRAINT.test(part.text.slice(add[0].length))) continue
    const col = parseColumn(part.text.slice(add[0].length))
    if (col) out.push({ ...col, at: stmt.at + alter[0].length + part.at, table: part.text })
  }
  return out
}

function matchParen(text, open) {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const c = text[i]
    if (c === "'" || c === '"' || c === '`') i = closing(text, i, c)
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return i
  }
  return text.length
}

function parseColumn(def) {
  const m = def.match(new RegExp(String.raw`^(${IDENT})\s*([\s\S]*)$`))
  if (!m) return null
  const rest = m[2]
  const type = rest.match(/^([A-Za-z][\w]*(?:\s+(?:precision|varying))?)/i)?.[1] ?? ''
  return { name: unquote(m[1]), type: type.toLowerCase(), def }
}

const MONEY = /(?:^|_)(?:usd|eur|gbp|chf|jpy|cad|aud|price|prices|cost|costs|amount|amounts|fee|fees|revenue|budget|spend|payout|refund|tax|vat|balance|cents|micros)(?:_|$)/i
const FLOAT_TYPES = /^(?:real|float\d*|double(?: precision)?)$/
const JSONISH = /(?:^|_)(?:json|payload|meta|metadata|data|state|summary|settings|config|options|attributes|attrs|props|properties|extra)$|_json(?:_|$)/i

const lineAt = (text, offset) => text.slice(0, offset).split('\n').length

/**
 * Content rules for one file. Returns findings `{ rule, level, line, message }`.
 * `engine` is a key of ROUTES; `text` the file as it is now.
 */
export function lintFile({ engine, text }) {
  const findings = []
  const add = (rule, level, line, message) => findings.push({ rule, level, line, message })

  if (engine === 'convex') {
    text.split('\n').forEach((line, i) => {
      if (/\bv\.any\(\)/.test(line.replace(/\/\/.*$/, ''))) add('any', 'warn', i + 1, '`v.any()` accepts anything: write the validator (references/convex.md)')
    })
    return findings
  }
  if (engine === 'durable-objects') {
    text.split('\n').forEach((line, i) => {
      if (/(['"`])\s*(?:BEGIN(?:\s+(?:DEFERRED|IMMEDIATE|EXCLUSIVE))?(?:\s+TRANSACTION)?|COMMIT(?:\s+TRANSACTION)?|ROLLBACK(?:\s+TRANSACTION)?|SAVEPOINT\s+\w+|RELEASE(?:\s+SAVEPOINT)?\s+\w+)\s*(?:;|\1|$)/i.test(line)) {
        add('transaction', 'fail', i + 1, '`sql.exec()` cannot run transaction statements: use `ctx.storage.transactionSync()`')
      }
    })
    return findings
  }
  if (!SQL_ENGINES.has(engine)) return findings

  const first = text.split('\n').find((l) => l.trim())
  if (!first || !/^\s*(?:--|\/\*)/.test(first)) {
    add('header', 'fail', 1, 'open with a header comment: what, why, task, order, Undo (references/migration-file.md)')
  }

  const clean = stripSqlComments(text)
  const stmts = statements(clean)
  const sqlite = SQLITE.has(engine)

  if (engine === 'd1') {
    for (const s of stmts) {
      const compact = s.text.replace(/\s+/g, ' ')
      if (/^(?:BEGIN(?: (?:DEFERRED|IMMEDIATE|EXCLUSIVE))?(?: TRANSACTION)?|COMMIT(?: TRANSACTION)?|END TRANSACTION|ROLLBACK(?: TRANSACTION)?)$/i.test(compact)) {
        add('transaction', 'fail', lineAt(clean, s.at), `no \`${compact}\` on D1: each file already runs as one unit`)
      }
      if (/^PRAGMA foreign_keys\b/i.test(compact)) {
        add('transaction', 'fail', lineAt(clean, s.at), 'D1 cannot turn foreign keys off: use `PRAGMA defer_foreign_keys = on` (references/d1-sqlite.md)')
      }
    }
  }

  const destructive = []
  for (const s of stmts) {
    const compact = s.text.replace(/\s+/g, ' ')
    if (/^DROP TABLE\b/i.test(compact)) destructive.push([s, 'DROP TABLE'])
    else if (/^TRUNCATE\b/i.test(compact)) destructive.push([s, 'TRUNCATE'])
    else if (/^ALTER TABLE\b/i.test(compact)) {
      const head = compact.match(new RegExp(String.raw`^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?${IDENT}(?:\.${IDENT})? `, 'i'))
      if (head && /^RENAME\b/i.test(compact.slice(head[0].length))) destructive.push([s, 'RENAME'])
      else if (head) {
        for (const action of topLevelSplit(compact.slice(head[0].length))) {
          if (/^RENAME\b/i.test(action.text)) destructive.push([s, 'RENAME'])
          else if (/^DROP (?:COLUMN\b|(?!CONSTRAINT\b|DEFAULT\b|NOT\b|IDENTITY\b|EXPRESSION\b|INDEX\b|PRIMARY\b|FOREIGN\b)(?:IF EXISTS )?\S)/i.test(action.text)) destructive.push([s, 'DROP COLUMN'])
        }
      }
    }
    for (const col of columns(s)) {
      const line = lineAt(clean, col.at)
      const floaty = FLOAT_TYPES.test(col.type) || (sqlite && /^(?:numeric|decimal)$/.test(col.type)) || (!sqlite && col.type === 'money')
      if (MONEY.test(col.name) && floaty) {
        add('money-float', 'fail', line, `\`${col.name} ${col.type}\` looks like money: store an integer in minor or micro units, named for the unit (\`..._cents\`, \`..._micro_usd\`)`)
      }
      const texty = col.type === '' || /^(?:text|varchar|character|char|clob|json)/.test(col.type)
      const jsonDefault = /\bDEFAULT\s+'\s*[[{]/i.test(col.def)
      if (sqlite && texty && (JSONISH.test(col.name) || jsonDefault || col.type === 'json')) {
        const guarded = new RegExp(String.raw`json_valid\s*\(\s*["\x60\[]?${col.name}\b`, 'i').test(col.table)
        if (!guarded) add('json-valid', 'warn', line, `\`${col.name}\` looks like JSON text: add \`CHECK (${col.name} IS NULL OR json_valid(${col.name}))\``)
      }
    }
  }
  if (destructive.length && !/^\s*(?:--|\/\*|\*).*\b(?:Undo|Destructive)\s*:/im.test(text)) {
    for (const [s, what] of destructive) {
      add('destructive', 'fail', lineAt(clean, s.at), `${what} needs an \`-- Undo:\` or \`-- Destructive:\` line in the header`)
    }
  }
  return findings
}

/** The leading number of a migration file name, or null. */
export const migrationNumber = (file) => {
  const m = posix.basename(file).match(/^(\d+)/)
  return m ? BigInt(m[1]) : null
}

/**
 * The number rule for one file. `siblings` are the other file names in the same folder (on the
 * branch and on the base tip), `baseHighest` the base tip's highest number there (or null).
 */
export function numberFindings({ file, added, siblings, baseHighest }) {
  const n = migrationNumber(file)
  if (n === null) return [{ rule: 'number', level: 'fail', line: 1, message: 'a migration file name starts with its number (`0007_name.sql`)' }]
  const out = []
  const name = posix.basename(file)
  const clash = [...new Set(siblings)].filter((s) => s !== name && migrationNumber(s) === n)
  if (clash.length) out.push({ rule: 'number', level: 'fail', line: 1, message: `number ${n} is also used by ${clash.join(', ')}` })
  if (added && baseHighest !== null && n <= baseHighest) {
    out.push({ rule: 'number', level: 'fail', line: 1, message: `number ${n} is not above the base's highest (${baseHighest}); runners apply by name, so it would run after newer files: renumber it` })
  }
  return out
}

export function defaultGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
}

/** Files changed between the merge base and the working tree: `{ file, status, from? }`. */
function changedFiles(git, repoDir, mergeBase) {
  const out = []
  const rows = git(['diff', '--name-status', '-z', '--find-renames', mergeBase, '--'], repoDir).split('\0').filter(Boolean)
  for (let i = 0; i < rows.length; ) {
    const status = rows[i++]
    if (status.startsWith('R') || status.startsWith('C')) {
      const from = rows[i++]
      if (status.startsWith('R')) out.push({ file: from, status: 'D' })
      out.push({ file: rows[i++], status: 'A', from })
    } else out.push({ file: rows[i++], status: status[0] })
  }
  for (const file of git(['ls-files', '--others', '--exclude-standard', '-z'], repoDir).split('\0').filter(Boolean)) {
    out.push({ file, status: 'A' })
  }
  return out
}

function readAllowlist(repoDir, path) {
  if (!path) return []
  const full = join(repoDir, path)
  if (!existsSync(full)) return []
  const data = JSON.parse(readFileSync(full, 'utf8'))
  const entries = Array.isArray(data) ? data : (data.allow ?? [])
  for (const e of entries) {
    if (!e.file || !e.rule || !e.why) throw new Error(`${path}: every entry needs file, rule and why (${JSON.stringify(e)})`)
  }
  return entries
}

/**
 * Runs the check. `all` judges every schema file in the tree instead of the changed ones (to
 * seed an allowlist when adopting). Returns `{ base, files: [{ file, engine, status, findings }], stale }`.
 */
export function check({ repoDir, config = {}, base, all = false, git = defaultGit }) {
  const cfg = schemaConfig(config)
  base = base ?? cfg.base
  try {
    git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`], repoDir)
  } catch {
    throw new Error(`base ${base} not found: fetch it (git fetch origin) or pass --base <ref>`)
  }
  const mergeBase = git(['merge-base', base, 'HEAD'], repoDir).trim()
  const onBase = new Set(git(['ls-tree', '-r', '--name-only', '-z', base], repoDir).split('\0').filter(Boolean))
  const atMergeBase = new Set(git(['ls-tree', '-r', '--name-only', '-z', mergeBase], repoDir).split('\0').filter(Boolean))
  const tracked = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], repoDir).split('\0').filter(Boolean)
  const present = new Set(tracked.filter((f) => existsSync(join(repoDir, f))))

  const changes = all ? [...present].map((file) => ({ file, status: atMergeBase.has(file) ? 'M' : 'A' })) : changedFiles(git, repoDir, mergeBase)
  const allow = readAllowlist(repoDir, cfg.allowlist)
  const used = new Set()
  const files = []

  for (const change of changes) {
    const engine = classify(change.file, cfg)
    if (!engine) continue
    const findings = []
    const sql = SQL_ENGINES.has(engine)
    if (change.status === 'D') {
      if (sql && onBase.has(change.file)) findings.push({ rule: 'applied', level: 'warn', line: 1, message: 'deletes a migration that is on the base branch: applied files stay; write a new one' })
      files.push({ file: change.file, engine, status: 'D', findings })
      continue
    }
    if (!present.has(change.file)) continue
    const text = readFileSync(join(repoDir, change.file), 'utf8')
    findings.push(...lintFile({ engine, text }))
    if (sql) {
      const dir = posix.dirname(change.file)
      const inDir = (set) => [...set].filter((f) => posix.dirname(f) === dir && classify(f, cfg) === engine).map((f) => posix.basename(f))
      const baseNumbers = inDir(onBase).map(migrationNumber).filter((n) => n !== null)
      const baseHighest = baseNumbers.length ? baseNumbers.reduce((a, b) => (b > a ? b : a)) : null
      const added = change.status === 'A' && !onBase.has(change.file)
      findings.push(...numberFindings({ file: change.file, added, siblings: [...inDir(present), ...inDir(onBase)], baseHighest }))
      if (!all && change.status === 'M' && atMergeBase.has(change.file)) {
        findings.push({ rule: 'applied', level: 'warn', line: 1, message: 'edits a migration that is on the base branch: if it ran anywhere, write a new file instead' })
      }
    }
    files.push({ file: change.file, engine, status: change.status, findings })
  }

  for (const f of files) {
    f.findings = f.findings.filter((x) => {
      const hit = allow.findIndex((e) => e.file === f.file && e.rule === x.rule)
      if (hit < 0) return true
      used.add(hit)
      return false
    })
  }
  const judged = new Set(files.map((f) => f.file))
  // Only entries for files judged in this run can be found stale; the rest are simply not in scope.
  const stale = allow.filter((e, i) => !used.has(i) && (judged.has(e.file) || !present.has(e.file)))
  files.sort((a, b) => a.file.localeCompare(b.file))
  return { base, files, stale }
}

export function summarize(result) {
  const all = result.files.flatMap((f) => f.findings)
  return { fails: all.filter((f) => f.level === 'fail').length, warns: all.filter((f) => f.level === 'warn').length }
}

export function format(result, { all = false } = {}) {
  const { fails, warns } = summarize(result)
  const lines = []
  const scope = all ? 'in the tree' : `changed against ${result.base}`
  if (!result.files.length) lines.push(`migrations: no schema files ${scope}.`)
  else lines.push(`migrations: ${result.files.length} schema file(s) ${scope}`)
  for (const f of result.files) {
    const route = ROUTES[f.engine]
    lines.push('', `${f.file}  (${f.engine}${f.status === 'D' ? ', deleted' : ''})`)
    for (const x of f.findings) lines.push(`  ${x.level.toUpperCase().padEnd(4)} ${x.rule.padEnd(12)} line ${x.line}: ${x.message}`)
    lines.push(`  read: ${route.read.join(', ')}${route.first ? ` · first: ${route.first}` : ''}`)
    if (route.note) lines.push(`  note: ${route.note}`)
  }
  for (const e of result.stale) lines.push('', `stale allowlist entry (remove it): ${e.file} ${e.rule}`)
  lines.push('', `${fails} failure(s), ${warns} warning(s)${result.stale.length ? `, ${result.stale.length} stale allowlist entr${result.stale.length === 1 ? 'y' : 'ies'}` : ''}.`)
  return lines.join('\n') + '\n'
}
