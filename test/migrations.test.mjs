import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, it } from 'node:test'
import { check, classify, format, globToRegExp, lintFile, numberFindings, schemaConfig, summarize } from '../src/lib/migrations.mjs'

const fixture = (name) => readFileSync(new URL(`fixtures/schema/${name}`, import.meta.url), 'utf8')
const rules = (findings) => findings.map((f) => `${f.level} ${f.rule} ${f.line}`)

describe('globs and engines', () => {
  it('matches ** across folders and * within one', () => {
    assert.ok(globToRegExp('**/migrations/*.sql').test('migrations/0001_a.sql'))
    assert.ok(globToRegExp('**/migrations/*.sql').test('apps/api/migrations/0001_a.sql'))
    assert.ok(!globToRegExp('**/migrations/*.sql').test('apps/api/migrations/meta/0001.json'))
    assert.ok(!globToRegExp('apps/*/migrations/*.sql').test('apps/a/b/migrations/x.sql'))
    assert.ok(globToRegExp('convex/schema/**/*.ts').test('convex/schema/a/b.ts'))
  })

  it('takes the first engine that matches, defaults when there is no schema block', () => {
    const defaults = schemaConfig()
    assert.equal(classify('apps/web/supabase/migrations/20261101000000_a.sql', defaults), 'supabase')
    assert.equal(classify('packages/core/migrations/0001_a.sql', defaults), 'sql')
    assert.equal(classify('convex/schema.ts', defaults), 'convex')
    assert.equal(classify('src/index.ts', defaults), null)
    const cfg = schemaConfig({ engines: { d1: ['packages/core/migrations/*.sql'], sqlite: ['**/migrations/*.sql'] } })
    assert.equal(classify('packages/core/migrations/0001_a.sql', cfg), 'd1')
    assert.equal(classify('other/migrations/0001_a.sql', cfg), 'sqlite')
    assert.throws(() => schemaConfig({ engines: { mysql: ['*.sql'] } }), /unknown engine "mysql"/)
  })
})

describe('content rules', () => {
  it('passes a good D1 file: comments, strings and trigger bodies are not statements', () => {
    assert.deepEqual(lintFile({ engine: 'd1', text: fixture('d1-good.sql') }), [])
  })

  it('catches the six rules in a bad D1 file', () => {
    assert.deepEqual(rules(lintFile({ engine: 'd1', text: fixture('d1-bad.sql') })), [
      'fail header 1',
      'fail transaction 8',
      'fail transaction 12',
      'fail transaction 13',
      'fail money-float 3',
      'fail money-float 4',
      'warn json-valid 5',
      'warn json-valid 6',
      'fail money-float 9',
      'fail destructive 10',
      'fail destructive 11',
    ])
  })

  it('applies only the engine-neutral rules to SQL of an unknown engine', () => {
    const found = new Set(lintFile({ engine: 'sql', text: fixture('d1-bad.sql') }).map((f) => f.rule))
    assert.deepEqual([...found].sort(), ['destructive', 'header', 'money-float'])
  })

  it('on Postgres flags float and money types but not numeric, and only RENAME as destructive', () => {
    const found = lintFile({ engine: 'postgres', text: fixture('pg.sql') })
    assert.deepEqual(rules(found), ['fail money-float 5', 'fail money-float 6', 'fail money-float 11', 'fail destructive 14'])
    assert.match(found[0].message, /`amount money`/)
  })

  it('accepts a destructive statement once an Undo or Destructive line is there', () => {
    const text = '-- What: drop x\n-- Additive only? No. Destructive: drops orders.legacy\nALTER TABLE orders DROP COLUMN legacy;\nDROP TABLE old;\n'
    assert.deepEqual(lintFile({ engine: 'd1', text }), [])
    assert.deepEqual(rules(lintFile({ engine: 'd1', text: '-- What: drop\nDROP TABLE old;\nTRUNCATE t;\n' })), ['fail destructive 2', 'fail destructive 3'])
  })

  it('finds transaction statements in Durable Object SQL strings, not in prose', () => {
    assert.deepEqual(rules(lintFile({ engine: 'durable-objects', text: fixture('do.ts.txt') })), ['fail transaction 4', 'fail transaction 5'])
  })

  it('warns on v.any() in a Convex schema, not in a comment', () => {
    assert.deepEqual(rules(lintFile({ engine: 'convex', text: fixture('convex.ts.txt') })), ['warn any 5'])
  })
})

describe('numbers', () => {
  it('needs a number, a unique one, above the base', () => {
    assert.equal(numberFindings({ file: 'm/init.sql', added: true, siblings: [], baseHighest: null })[0].rule, 'number')
    assert.deepEqual(numberFindings({ file: 'm/0005_a.sql', added: true, siblings: ['0005_a.sql', '0004_b.sql'], baseHighest: 4n }), [])
    const clash = numberFindings({ file: 'm/0004_a.sql', added: true, siblings: ['0004_a.sql', '0004_b.sql'], baseHighest: 4n })
    assert.equal(clash.length, 2)
    assert.match(clash[0].message, /also used by 0004_b\.sql/)
    assert.match(clash[1].message, /renumber/)
    // An existing file is not held to the base's highest.
    assert.deepEqual(numberFindings({ file: 'm/0002_a.sql', added: false, siblings: ['0002_a.sql'], baseHighest: 4n }), [])
  })

  it('compares Supabase timestamps as numbers', () => {
    const below = numberFindings({ file: 's/20261101000000_a.sql', added: true, siblings: [], baseHighest: 20261107120000n })
    assert.match(below[0].message, /not above the base's highest/)
  })
})

/** A repo with `main` holding 0001..0003, a branch cut at 0002, then main moving on. */
const made = []
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'))
  made.push(dir)
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf8' })
  const write = (file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), text)
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a@example.com')
  git('config', 'user.name', 'a')
  const ok = (what) => `-- What: ${what}. Why: test. Task: t-1\n-- Undo: nothing to undo\n`
  write('db/migrations/0001_init.sql', ok('init') + 'CREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;\n')
  write('db/migrations/0002_b.sql', ok('b') + 'CREATE TABLE b (id INTEGER PRIMARY KEY) STRICT;\n')
  write('agent-kit.config.json', JSON.stringify({ name: 'demo', schema: { engines: { d1: ['db/migrations/*.sql'] }, allowlist: 'allow.json', base: 'main' } }))
  git('add', '.')
  git('commit', '-q', '-m', 'base')
  git('checkout', '-q', '-b', 'work')
  git('checkout', '-q', 'main')
  write('db/migrations/0003_c.sql', ok('c') + 'CREATE TABLE c (id INTEGER PRIMARY KEY) STRICT;\n')
  git('add', '.')
  git('commit', '-q', '-m', 'main moves on')
  git('checkout', '-q', 'work')
  return { dir, git, write }
}

describe('migrations check on a git repo', () => {
  it('judges only changed files, against the base tip', () => {
    const { dir, git, write } = repo()
    write('db/migrations/0003_late.sql', '-- What: late. Undo: drop it\nCREATE TABLE late (cost_usd REAL) STRICT;\n')
    git('add', '.')
    git('commit', '-q', '-m', 'late')
    write('db/migrations/0001_init.sql', '-- edited\nCREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;\n')
    write('db/migrations/0004_new.sql', 'CREATE TABLE d (state TEXT);\n') // untracked
    write('src/app.ts', 'export {}\n')
    const config = JSON.parse(readFileSync(join(dir, 'agent-kit.config.json'), 'utf8')).schema
    const result = check({ repoDir: dir, config })
    assert.deepEqual(result.files.map((f) => f.file), ['db/migrations/0001_init.sql', 'db/migrations/0003_late.sql', 'db/migrations/0004_new.sql'])
    const by = Object.fromEntries(result.files.map((f) => [f.file, f.findings.map((x) => x.rule)]))
    assert.deepEqual(by['db/migrations/0001_init.sql'], ['applied'])
    assert.deepEqual(by['db/migrations/0003_late.sql'], ['money-float', 'number', 'number'])
    assert.deepEqual(by['db/migrations/0004_new.sql'], ['header', 'json-valid'])
    assert.deepEqual(summarize(result), { fails: 4, warns: 2 })
    const text = format(result)
    assert.match(text, /changed against main/)
    assert.match(text, /read: data-schema\/references\/d1-sqlite\.md · first: cloudflare\/skills cloudflare/)
    assert.match(text, /4 failure\(s\), 2 warning\(s\)/)
  })

  it('honours the allowlist and reports entries that no longer fire', () => {
    const { dir, write } = repo()
    write('db/migrations/0001_init.sql', '-- edited\nCREATE TABLE a (id INTEGER PRIMARY KEY) STRICT;\n')
    write('allow.json', JSON.stringify({ allow: [
      { file: 'db/migrations/0001_init.sql', rule: 'applied', why: 'comment-only edit' },
      { file: 'db/migrations/0001_init.sql', rule: 'header', why: 'was missing once' },
      { file: 'db/migrations/0002_b.sql', rule: 'header', why: 'not judged in this run' },
    ] }))
    const result = check({ repoDir: dir, config: { engines: { d1: ['db/migrations/*.sql'] }, allowlist: 'allow.json', base: 'main' } })
    assert.deepEqual(result.files[0].findings, [])
    assert.deepEqual(result.stale.map((e) => e.rule), ['header'])
    assert.match(format(result), /stale allowlist entry \(remove it\): db\/migrations\/0001_init\.sql header/)
    write('allow.json', JSON.stringify([{ file: 'x', rule: 'header' }]))
    assert.throws(() => check({ repoDir: dir, config: { allowlist: 'allow.json', base: 'main' } }), /needs file, rule and why/)
  })

  it('treats renaming an applied file as deleting it', () => {
    const { dir, git } = repo()
    renameSync(join(dir, 'db/migrations/0002_b.sql'), join(dir, 'db/migrations/0009_b.sql'))
    git('add', '-A')
    const result = check({ repoDir: dir, config: { engines: { d1: ['db/migrations/*.sql'] }, base: 'main' } })
    const by = Object.fromEntries(result.files.map((f) => [f.file, f.findings.map((x) => x.rule)]))
    assert.deepEqual(by['db/migrations/0002_b.sql'], ['applied'])
    assert.deepEqual(by['db/migrations/0009_b.sql'], [])
  })

  it('--all judges every schema file; a missing base is a clear error', () => {
    const { dir } = repo()
    const result = check({ repoDir: dir, config: { engines: { d1: ['db/migrations/*.sql'] }, base: 'main' }, all: true })
    assert.deepEqual(result.files.map((f) => f.file), ['db/migrations/0001_init.sql', 'db/migrations/0002_b.sql'])
    assert.throws(() => check({ repoDir: dir, base: 'origin/nope' }), /base origin\/nope not found/)
  })

  it('runs as `agent-kit migrations` and exits 1 on a failure', () => {
    const { dir, write } = repo()
    const bin = new URL('../bin/agent-kit.mjs', import.meta.url).pathname
    const run = () => spawnSync(process.execPath, [bin, 'migrations'], { cwd: dir, encoding: 'utf8', env: { ...process.env, AGENT_KIT_ROOT: '' } })
    let out = run()
    assert.equal(out.status, 0, out.stderr)
    assert.match(out.stdout, /no schema files changed against main/)
    write('db/migrations/0004_x.sql', 'BEGIN;\nCREATE TABLE x (id INTEGER PRIMARY KEY);\nCOMMIT;\n')
    out = run()
    assert.equal(out.status, 1)
    assert.match(out.stdout, /FAIL transaction/)
    const json = spawnSync(process.execPath, [bin, 'migrations', '--json', '--base', 'main'], { cwd: dir, encoding: 'utf8', env: { ...process.env, AGENT_KIT_ROOT: '' } })
    assert.equal(JSON.parse(json.stdout).fails, 3)
  })
})

describe('data-schema skill', () => {
  const root = new URL('../skills/data-schema/', import.meta.url)
  const read = (file) => readFileSync(new URL(file, root), 'utf8')

  it('names every reference it routes to, and the check prints only those', async () => {
    const skill = read('SKILL.md')
    const description = skill.match(/description: >-\n\s+(.+)\n/)[1]
    assert.ok(description.length <= 350, `description is ${description.length} characters`)
    for (const ref of skill.matchAll(/`(references\/[a-z0-9-]+\.md)`/g)) assert.ok(read(ref[1]).length > 200, ref[1])
    const { ROUTES } = await import('../src/lib/migrations.mjs')
    for (const route of Object.values(ROUTES)) {
      for (const path of route.read) assert.ok(read(path.replace(/^data-schema\//, '')), path)
    }
    for (const official of ['supabase-postgres-best-practices', '--skill supabase', '--skill cloudflare', '--skill durable-objects', '--skill convex-migrate']) {
      assert.ok(skill.includes(official), official)
    }
  })

  it('credits the adapted Postgres text with pinned commits and the licence beside it', () => {
    const pg = read('references/postgres.md')
    assert.match(pg, /27fe45e0f71ea89a6eaf9ea4d2e4068957c81c26/)
    assert.match(pg, /1aef6e452b97fae580d57677a807fd0d601ddc7b/)
    assert.match(pg, /Changes made here/)
    assert.match(pg, /`now\(\)` is\s+(?:>\s+)?STABLE/)
    assert.match(read('references/LICENSE-Apache-2.0'), /Apache License\s+Version 2\.0/)
  })
})
