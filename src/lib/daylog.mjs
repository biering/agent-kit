/**
 * The digest behind `agent-kit daylog collect`: one UTC day of a repo, compact, no model involved.
 *
 * Pure functions plus an injectable `run(cmd, args)` so tests feed a fixture instead of GitHub.
 * Sections, in the order they are cut last to first when the digest is over budget:
 *   PRs merged, reverted or closed, CI failures fixed, board tasks, decisions, owner's words, extra.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderMcpNeeded } from './daystats.mjs'

export const DEFAULT_BUDGET_TOKENS = 6000
const CHARS_PER_TOKEN = 4

export const defaultRun = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })

const squash = (s, max) => {
  const t = String(s ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** UTC day bounds as ms. */
export function dayBounds(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`--date must be YYYY-MM-DD, got "${date}"`)
  const start = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(start) || new Date(start).toISOString().slice(0, 10) !== date) throw new Error(`Not a date: ${date}`)
  return { start, end: start + 86_400_000 }
}
const inDay = (iso, { start, end }) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= start && t < end
}

/** Only the Why / Benefits (or Value) sections of a PR body. */
export function whySections(body) {
  const lines = String(body ?? '').split('\n')
  const out = []
  let keep = null
  for (const line of lines) {
    const h = line.match(/^#{1,4}\s*(.+?)\s*$/)
    if (!h && keep && /^(tests?|how|notes?)\b[^.]{0,30}:/i.test(line.trim())) keep = null
    if (h) {
      keep = /^(why|benefits?|value|motivation)\b/i.test(h[1]) ? h[1] : null
      continue
    }
    if (keep) out.push(line)
  }
  return squash(out.join(' ').replace(/🤖?\s*Generated with \[Claude Code\]\([^)]*\)/g, '').replace(/Co-Authored-By:[^\n]*/gi, ''), 600)
}

function prs(run, repoDir, date, bounds, notes, base) {
  let list
  try {
    const from = new Date(bounds.start - 86_400_000).toISOString().slice(0, 10)
    list = JSON.parse(
      run('gh', ['pr', 'list', '--state', 'all', '--limit', '100', '--search', `updated:>=${from}`,
        '--json', 'number,title,body,state,mergedAt,closedAt,baseRefName'], repoDir),
    )
  } catch {
    notes.push('gh unavailable: PR and CI sections skipped')
    return { merged: [], reverted: [], closed: [] }
  }
  const merged = []
  const reverted = []
  const closed = []
  for (const p of list) {
    if (p.state === 'MERGED' && inDay(p.mergedAt, bounds) && (!p.baseRefName || p.baseRefName === base)) {
      const row = { n: p.number, title: squash(p.title, 120), why: whySections(p.body) }
      ;(/^revert\b/i.test(p.title) ? reverted : merged).push(row)
    } else if (p.state === 'CLOSED' && inDay(p.closedAt, bounds)) {
      closed.push({ n: p.number, title: squash(p.title, 120), why: whySections(p.body) })
    }
  }
  return { merged, reverted, closed }
}

/** A failing run followed, the same day, by a success of the same workflow on the same branch. */
function ciFixed(run, repoDir, date, notes) {
  let runs
  try {
    runs = JSON.parse(
      run('gh', ['run', 'list', '--limit', '100', '--created', date,
        '--json', 'conclusion,createdAt,headBranch,workflowName,displayTitle'], repoDir),
    )
  } catch {
    return []
  }
  const groups = new Map()
  for (const r of runs) {
    const k = `${r.workflowName}\u0000${r.headBranch}`
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const out = []
  for (const [, g] of groups) {
    g.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    const fail = g.find((r) => r.conclusion === 'failure')
    if (!fail) continue
    const fixed = g.find((r) => r.conclusion === 'success' && Date.parse(r.createdAt) > Date.parse(fail.createdAt))
    if (fixed) out.push({ workflow: fail.workflowName, branch: fail.headBranch, title: squash(fail.displayTitle, 100) })
  }
  return out
}

/** Added table rows, bullets and headings of the decisions file during the day. */
function decisions(run, repoDir, file, bounds, notes) {
  if (!file) return []
  try {
    const out = run('git', ['log', '--format=', '-p', `--since=${new Date(bounds.start).toISOString()}`,
      `--until=${new Date(bounds.end).toISOString()}`, '--', file], repoDir)
    return out.split('\n')
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1).trim())
      .filter((l) => l && !/^\|?[\s:|-]+\|?$/.test(l))
      .map((l) => squash(l, 400))
  } catch {
    notes.push(`decisions file unreadable: ${file}`)
    return []
  }
}

/** Quoted words in a task description that sit next to the owner's name. */
export function ownerWords(text, owner) {
  if (!owner) return []
  const name = owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // A quote ends at its own closing mark; an apostrophe inside a word (don't) does not end a single-quoted one.
  const re = new RegExp(
    `${name}[^'"“‘\\n]{0,30}(?:'((?:[^'\\n]|(?<=\\w)'(?=\\w)){25,400}?)'(?!\\w)|"([^"\\n]{25,400})"|“([^”\\n]{25,400})”|‘([^’\\n]{25,400})’(?!\\w))`,
    'g',
  )
  return [...String(text ?? '').matchAll(re)].map((m) => squash(m[1] ?? m[2] ?? m[3] ?? m[4], 300))
}

/** Tasks of the board folder (<dir>/<repo>/<n>/task.json) that finished on the day. */
function board(dir, repo, owner, bounds, notes) {
  const tasks = []
  const words = []
  if (!dir) return { tasks, words }
  const base = join(dir, repo)
  if (!existsSync(base)) {
    notes.push(`board folder missing: ${base}`)
    return { tasks, words }
  }
  for (const n of readdirSync(base)) {
    const file = join(base, n, 'task.json')
    if (!existsSync(file)) continue
    let t
    try { t = JSON.parse(readFileSync(file, 'utf8')) } catch { continue }
    const stage = String(t.stage ?? '')
    const at = Number(t.at)
    if (!['done', 'failed', 'stopped', 'canceled'].includes(stage)) continue
    if (!(at >= bounds.start && at < bounds.end)) continue
    let first = ''
    const closing = join(base, n, 'closing.md')
    if (existsSync(closing)) first = (readFileSync(closing, 'utf8').split('\n').find((l) => l.trim() && !/^#/.test(l.trim())) ?? '').trim()
    tasks.push({ id: t.id ?? `${repo}/${n}`, stage, title: squash(t.title, 120), first: squash(first || t.msg, 220) })
    for (const w of ownerWords(t.description, owner)) words.push({ id: t.id ?? `${repo}/${n}`, w })
  }
  return { tasks, words }
}

/** Extra sources: `{ "label": "...", "file": "path" }` prints a file's day diff; `{ "label", "cmd": [..] }` a command's first lines. */
function extras(run, repoDir, list, bounds, notes) {
  const out = []
  for (const s of list ?? []) {
    try {
      let text
      if (s.file) {
        text = decisions(run, repoDir, s.file, bounds, notes).join('\n')
      } else if (Array.isArray(s.cmd)) {
        text = run(s.cmd[0], s.cmd.slice(1), repoDir)
      } else continue
      const lines = text.split('\n').map((l) => squash(l, 300)).filter(Boolean).slice(0, s.max ?? 20)
      if (lines.length) out.push({ label: s.label ?? s.file ?? s.cmd[0], lines })
    } catch {
      notes.push(`extra source failed: ${s.label ?? s.file ?? s.cmd?.[0]}`)
    }
  }
  return out
}

/**
 * @param {{repoDir:string, date:string, config:{name?:string, owner?:string, daylog?:object}, run?:Function, budgetTokens?:number, stats?:{block:string, mcpNeeded?:object[]}}} o
 *   `stats` is the prebuilt Stats block (daystats.mjs; async because it reads over the network):
 *   printed first, never cut, and counted against the budget.
 * @returns {string} the digest
 */
export function collect({ repoDir, date, config, run = defaultRun, budgetTokens, stats }) {
  const bounds = dayBounds(date)
  const dl = config.daylog ?? {}
  if (budgetTokens !== undefined && !(budgetTokens > 0)) throw new Error('--budget must be a positive number of tokens')
  const statsText = stats?.block ? `\n${stats.block}\n` : ''
  const mcpText = renderMcpNeeded(stats?.mcpNeeded ?? [])
  const budget = (budgetTokens ?? dl.budgetTokens ?? DEFAULT_BUDGET_TOKENS) * CHARS_PER_TOKEN - statsText.length - mcpText.length
  const notes = []
  const p = prs(run, repoDir, date, bounds, notes, dl.base ?? 'main')
  const ci = ciFixed(run, repoDir, date, notes)
  const b = board(dl.board, config.name, config.owner, bounds, notes)
  const dec = decisions(run, repoDir, dl.decisions, bounds, notes)
  const ex = extras(run, repoDir, dl.extra, bounds, notes)

  // Sections in cut order: the first one listed is kept longest.
  const sections = [
    ['PRs merged', p.merged.map((x) => `#${x.n} ${x.title}${x.why ? `\n  Why/Benefits: ${x.why}` : ''}`)],
    ['Decisions (new rows)', dec.map((x) => `- ${x}`)],
    ['Reverted PRs', p.reverted.map((x) => `#${x.n} ${x.title}${x.why ? `\n  ${x.why}` : ''}`)],
    ['Closed unmerged PRs', p.closed.map((x) => `#${x.n} ${x.title}${x.why ? `\n  ${x.why}` : ''}`)],
    ['CI failed, then fixed', ci.map((x) => `${x.workflow} on ${x.branch}: ${x.title}`)],
    ['Board tasks', b.tasks.map((x) => `${x.id} [${x.stage}] ${x.title}${x.first ? `\n  ${x.first}` : ''}`)],
    ["Owner's words", b.words.map((x) => `${x.id}: "${x.w}"`)],
    ...ex.map((e) => [e.label, e.lines]),
  ]

  const head = `# Digest ${config.name ?? ''} ${date} (UTC)`.replace('  ', ' ')
  const render = (secs, cut) => {
    const parts = [head + statsText + mcpText]
    for (const [title, items] of secs) if (items.length) parts.push(`\n## ${title} (${items.length})\n${items.join('\n')}`)
    if (parts.length === 1) parts.push('\nNothing happened in the sources.')
    if (notes.length) parts.push(`\n## Notes\n${notes.map((n) => `- ${n}`).join('\n')}`)
    if (cut.length) parts.push(`\n## Cut for size\n${cut.join('\n')}`)
    return parts.join('\n') + '\n'
  }

  const work = sections.map(([t, items]) => [t, [...items]])
  const cut = []
  let out = render(work, cut)
  const dropped = new Map()
  // Drop items from the last section's end, one at a time, until it fits.
  for (let s = work.length - 1; out.length > budget && s >= 0; s--) {
    while (work[s][1].length && out.length > budget) {
      work[s][1].pop()
      dropped.set(work[s][0], (dropped.get(work[s][0]) ?? 0) + 1)
      cut.length = 0
      for (const [t, n] of dropped) cut.push(`- ${n} item(s) from "${t}"`)
      out = render(work, cut)
    }
  }
  return out
}
