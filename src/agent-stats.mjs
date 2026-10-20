#!/usr/bin/env node
/**
 * What the agents did, per day: Claude Code and Cursor, from what each keeps
 * on this machine, plus what reached `main`.
 *
 *   pnpm stats                 # today and the six days before, as a table
 *   pnpm stats --json          # the same as JSON (the herdr panel, the CEO's report)
 *   pnpm stats --days 30
 *
 * Claude Code: its session transcripts (~/.claude/projects/**\/*.jsonl). Every
 * model response carries its token usage; responses are counted once by their
 * message id. Edit, MultiEdit and Write calls give the lines it wrote.
 * Cursor: ~/.cursor/ai-tracking/ai-code-tracking.db. One row per AI-written
 * line (source: tab or composer, the agent), and per scored commit how many
 * of its lines were the agent's, Tab's or a human's.
 * Shipped: commits on origin/main of Maelstrom and Leverage, with lines changed.
 *
 * Nothing here estimates money: token prices change, and a wrong number is
 * worse than none.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { config } from './config.mjs'

const args = process.argv.slice(2)
const asJson = args.includes('--json')
const days =
  Number(args[args.indexOf('--days') + 1]) > 0 && args.includes('--days')
    ? Number(args[args.indexOf('--days') + 1])
    : 7
// Whose `main` counts as shipped: agent-kit.config.json `stats.repos`.
const REPOS = config.stats.repos

/** A local calendar day, YYYY-MM-DD. */
const dayOf = (ms) => new Date(ms).toLocaleDateString('sv-SE')
const today = dayOf(Date.now())
const range = Array.from({ length: days }, (_, i) => dayOf(Date.now() - (days - 1 - i) * 86400000))
const since = Date.now() - days * 86400000

const blank = () => ({
  claude: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    thinking: 0,
    requests: 0,
    sessions: new Set(),
    linesWritten: 0,
    linesRemoved: 0,
    models: {},
  },
  cursor: {
    aiLines: 0,
    agentLines: 0,
    tabLines: 0,
    models: {},
    commits: 0,
    linesAdded: 0,
    agentAdded: 0,
    tabAdded: 0,
    humanAdded: 0,
  },
  shipped: { commits: 0, added: 0, deleted: 0, repos: {} },
})
const stats = Object.fromEntries(range.map((d) => [d, blank()]))
const lines = (s) => (typeof s === 'string' && s.length ? s.split('\n').length : 0)

function transcripts(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) transcripts(p, acc)
    else if (e.name.endsWith('.jsonl') && statSync(p).mtimeMs >= since) acc.push(p)
  }
  return acc
}

async function claude() {
  const seen = new Set()
  for (const file of transcripts(join(homedir(), '.claude/projects'))) {
    const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
    for await (const raw of rl) {
      if (!raw.includes('"assistant"') || (!raw.includes('"usage"') && !raw.includes('"tool_use"')))
        continue
      let row
      try {
        row = JSON.parse(raw)
      } catch {
        continue
      }
      const day = row.timestamp && dayOf(Date.parse(row.timestamp))
      const s = stats[day]?.claude
      const msg = row.message
      if (!s || !msg) continue
      if (row.sessionId) s.sessions.add(row.sessionId)
      const u = msg.usage
      if (u && msg.id && !seen.has(msg.id)) {
        seen.add(msg.id)
        s.requests += 1
        s.input += u.input_tokens ?? 0
        s.output += u.output_tokens ?? 0
        s.cacheRead += u.cache_read_input_tokens ?? 0
        s.cacheWrite += u.cache_creation_input_tokens ?? 0
        s.thinking += u.output_tokens_details?.thinking_tokens ?? 0
        if (msg.model) s.models[msg.model] = (s.models[msg.model] ?? 0) + (u.output_tokens ?? 0)
      }
      for (const block of Array.isArray(msg.content) ? msg.content : []) {
        if (block?.type !== 'tool_use') continue
        const i = block.input ?? {}
        if (block.name === 'Write') s.linesWritten += lines(i.content)
        if (block.name === 'Edit') {
          s.linesWritten += lines(i.new_string)
          s.linesRemoved += lines(i.old_string)
        }
        if (block.name === 'MultiEdit') {
          for (const ed of i.edits ?? []) {
            s.linesWritten += lines(ed.new_string)
            s.linesRemoved += lines(ed.old_string)
          }
        }
      }
    }
  }
}

function sqlite(db, sql) {
  const r = spawnSync('sqlite3', ['-readonly', '-separator', '\t', db, sql], { encoding: 'utf8' })
  return r.status === 0
    ? r.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => l.split('\t'))
    : []
}

function cursor() {
  const db = join(homedir(), '.cursor/ai-tracking/ai-code-tracking.db')
  if (!existsSync(db)) return
  for (const [ms, source, model, n] of sqlite(
    db,
    `select createdAt, source, coalesce(model,''), 1 from ai_code_hashes where createdAt >= ${Math.floor(since)}`,
  )) {
    const c = stats[dayOf(Number(ms))]?.cursor
    if (!c || source === 'human') continue
    c.aiLines += Number(n)
    if (source === 'tab') c.tabLines += 1
    else c.agentLines += 1
    if (model) c.models[model] = (c.models[model] ?? 0) + 1
  }
  for (const [scoredAt, added, agent, tab, human] of sqlite(
    db,
    `select scoredAt, linesAdded, composerLinesAdded, tabLinesAdded, humanLinesAdded from scored_commits where scoredAt >= ${Math.floor(since)}`,
  )) {
    const c = stats[dayOf(Number(scoredAt))]?.cursor
    if (!c) continue
    c.commits += 1
    c.linesAdded += Number(added)
    c.agentAdded += Number(agent)
    c.tabAdded += Number(tab)
    c.humanAdded += Number(human)
  }
}

function shipped() {
  for (const [name, dir] of Object.entries(REPOS)) {
    if (!existsSync(join(dir, '.git'))) continue
    let out = ''
    try {
      out = execFileSync(
        'git',
        [
          '-C',
          dir,
          'log',
          'origin/main',
          `--since=${days} days ago`,
          '--no-merges',
          '--format=@%ct',
          '--numstat',
        ],
        {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        },
      )
    } catch {
      continue
    }
    let day
    for (const l of out.split('\n')) {
      if (l.startsWith('@')) {
        day = dayOf(Number(l.slice(1)) * 1000)
        const s = stats[day]?.shipped
        if (s) {
          s.commits += 1
          s.repos[name] = (s.repos[name] ?? 0) + 1
        }
        continue
      }
      const [a, d] = l.split('\t')
      const s = stats[day]?.shipped
      if (s && /^\d+$/.test(a ?? '') && /^\d+$/.test(d ?? '')) {
        s.added += Number(a)
        s.deleted += Number(d)
      }
    }
  }
}

await claude()
cursor()
shipped()

const result = range.map((day) => {
  const s = stats[day]
  return { day, ...s, claude: { ...s.claude, sessions: s.claude.sessions.size } }
})

if (asJson) {
  console.log(JSON.stringify({ today, days: result }))
} else {
  const k = (n) =>
    n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`
  console.log(
    'day         claude tokens (out/in+cache)  req  sess  lines+/-    cursor AI lines (agent/tab)  shipped commits  +/-',
  )
  for (const r of result) {
    const c = r.claude
    const tokens = `${k(c.output)} / ${k(c.input + c.cacheRead + c.cacheWrite)}`
    console.log(
      `${r.day}  ${tokens.padEnd(28)} ${String(c.requests).padStart(4)} ${String(c.sessions).padStart(5)}  ${`+${k(c.linesWritten)}/-${k(c.linesRemoved)}`.padEnd(10)}  ${`${k(r.cursor.aiLines)} (${k(r.cursor.agentLines)}/${k(r.cursor.tabLines)})`.padEnd(28)} ${String(r.shipped.commits).padStart(15)}  +${k(r.shipped.added)}/-${k(r.shipped.deleted)}`,
    )
  }
}
