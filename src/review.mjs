#!/usr/bin/env node
/**
 * The review list in herdr (rules/spec-review.md, rules/result-review.md, rules/design-review.md, README "Review list").
 *
 *   agent-kit review [list] [--json]       everything that waits for you, newest first: specs, designs, results, PRs
 *   agent-kit review prs [--json]          only the PRs (open, not draft, where your approval blocks), across repos
 *   agent-kit review pane                  the review list pane (the plugin runs it)
 *   agent-kit review open-pane             open that pane below the work board (else beside the focused pane), or focus it
 *   agent-kit review approve <id> [--notes "…"]   approve: a spec or design builds, a result merges (the board's approve) and its drafts post after (repairs a stuck plan)
 *   agent-kit review owner <id>            exit 0 when the owner approves this task's result (not the CEO), 1 when not, 2 unknown
 *   agent-kit review back <id> <text…>     send the spec, design or result back to its agent with these words
 *   agent-kit review annotate <id>         the brief in Plannotator, in a new tab of the CEO's workspace
 *   agent-kit review doc                   what runs in that tab (the plugin's `doc` pane)
 *   agent-kit review check <file> [--kind spec|result]   what a spec brief or a result pitch still lacks (exit 1 on a gap)
 *   agent-kit review notify                the plugin's event hook: a herdr notification per new spec, design or result
 *
 * Machine-wide, not per repo: it reads the work board (herdr-projects) for every repo and needs no
 * agent-kit.config.json, so it does not load config.mjs. <id> is the board's (`repo/n` or `KEY-n`).
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { herdr, notify } from './lib/herdr.mjs'
import {
  age,
  approve,
  approverOf,
  briefDoc,
  boardBin,
  changeOf,
  boardClient,
  ceoWorkspace,
  collect,
  dataDir,
  fromAnnotation,
  merge,
  paneSpot,
  sendBack,
  toNotify,
} from './lib/review.mjs'
import { check, passes } from './lib/review-check.mjs'
import { collectPrs } from './lib/waiting-prs.mjs'

const PLUGIN = 'agent-kit.review'
const env = process.env
const home = homedir()
const STATE = join(env.XDG_STATE_HOME || join(home, '.local/state'), 'agent-kit', 'review')
const KIT = fileURLToPath(new URL('../bin/agent-kit.mjs', import.meta.url))
const NOTIFY_EVERY = 20 * 1000
const PASS = ['HERDR_PROJECTS_BIN', 'HERDR_PROJECTS_DATA_DIR', 'HERDR_PROJECTS_HOME', 'XDG_STATE_HOME', 'PLANNOTATOR_TUI_BIN', 'AGENT_KIT_REVIEW_WORKSPACE']

const args = process.argv.slice(2)
const die = (msg) => {
  console.error(msg)
  process.exit(1)
}
function option(name) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
function flag(name) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

const readFile = (p) => {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return null
  }
}
const mtime = (p) => {
  try {
    return statSync(p).mtimeMs
  } catch {
    return null
  }
}
const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}
const writeJson = (p, v) => {
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`)
}

const data = dataDir(env, home)
const board = boardClient(boardBin(env, home, existsSync), (bin, a) =>
  spawnSync(bin, a, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
)
const list = (dir) => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}
const waiting = () => collect({ board, data, readFile, mtime, exists: existsSync, list })
const run = promisify(execFile)
const gh = async (a) => (await run('gh', a, { maxBuffer: 32 * 1024 * 1024, timeout: 60 * 1000 })).stdout
const git = (root) => {
  const r = spawnSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout : ''
}
/** The task folder's closing note and report: where a gate-reviewer's sentences may be. */
function taskReport(id) {
  const dir = join(data, 'tasks', ...String(id).split('/'))
  return [readFile(join(dir, 'closing-note.md')), ...['report.md', 'report.txt'].map((f) => readFile(join(dir, 'artifacts', 'report', f)))].filter(Boolean).join('\n\n')
}
/** The PRs that wait for the owner, across the repos the board knows (its repos.json: name → checkout). */
async function waitingPrs() {
  const repos = Object.entries(readJson(join(data, 'repos.json'), {})).map(([name, root]) => ({ name, root }))
  const agent = readJson(join(data, 'gh-user.json'), {}).login
  return collectPrs({ gh, repos, remote: git, rows: board.list(), readReport: taskReport, env, agents: agent ? [agent] : [] })
}
/** The waiting list, or exit with why the board could not be read. */
const waitingOrDie = () => {
  try {
    return waiting()
  } catch (e) {
    return die(e.message)
  }
}
const slug = (id) => String(id).replace(/[^A-Za-z0-9_-]+/g, '-')
const statusFile = (id) => join(STATE, 'status', `${slug(id)}.json`)
const skipsFile = join(STATE, 'skipped.json')

/** The waiting task for `repo/n` or `KEY-n`, or exit with why not. */
function find(id) {
  if (!id) die('Which task? (repo/n or KEY-n)')
  const want = String(id).toLowerCase()
  const it = waitingOrDie().find((t) => t.id.toLowerCase() === want || t.key.toLowerCase() === want)
  return it ?? die(`${id} does not wait for you (agent-kit review list).`)
}

function status(id, s) {
  writeJson(statusFile(id), { ...s, at: Date.now() })
}

/** Run `review approve <id>` on its own, so a closed pane or tab does not cut it off. */
function approveDetached(id, notes = '') {
  mkdirSync(STATE, { recursive: true })
  status(id, { short: 'wait…', line: 'Approving…' })
  const child = spawn(process.execPath, [KIT, 'review', 'approve', id, ...(notes ? ['--notes', notes] : [])], {
    detached: true,
    stdio: 'ignore',
    env,
  })
  child.unref()
}

async function cmdApprove() {
  const notes = option('notes') ?? ''
  const it = find(args[0])
  // A result whose PR also waits on GitHub is approved there first (the board's merge would fail).
  if (it.kind === 'result' && it.prUrl) {
    try {
      const pr = (await waitingPrs()).items.find((p) => p.url === it.prUrl)
      if (pr) it.github = pr.key
    } catch {}
  }
  status(it.id, { short: 'wait…', line: it.kind === 'stuck' ? 'Repairing: stop, then delegate…' : 'Approving…' })
  const r = await approve(it, {
    board,
    notes,
    pollMs: Number(env.AGENT_KIT_REVIEW_POLL_MS) || 3000,
    sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
    log: (line) => {
      console.log(line)
      status(it.id, { short: 'wait…', line: line[0].toUpperCase() + line.slice(1) })
    },
  })
  if (r.ok) {
    const line = { told: 'Approved: the agent builds it now.', finishing: 'Back on the board: it returns as ready to approve, then approve it.', merging: r.posts ? 'Approved: the board merges it; the drafts post after the merge.' : r.warn ? `Approved: the board merges it; ${r.warn}.` : 'Approved: the board merges it.', built: 'Approved: building.', repaired: 'Building (it was stuck: stopped and delegated again).' }[r.how]
    status(it.id, { ok: true, short: r.how === 'merging' ? 'merge' : r.how === 'finishing' ? 'finish' : 'build', line })
    console.log(line)
  } else {
    status(it.id, { ok: false, short: 'fail', line: `Not building: ${r.error}` })
    die(`${it.key}: ${r.error}`)
  }
}

function cmdBack() {
  const it = find(args.shift())
  const r = sendBack(board, it, args.join(' '))
  if (!r.ok) die(`${it.key}: ${r.error}`)
  status(it.id, { ok: true, short: 'back', line: 'Sent back to its agent.' })
  console.log(`${it.key}: sent back.`)
}

/** The PRs, or exit with why GitHub could not be read for every repo. */
async function prsOrDie() {
  try {
    return await waitingPrs()
  } catch (e) {
    return die(e.message)
  }
}
const printItems = (items, head = true) => {
  for (const it of items) {
    if (head) console.log(`${it.key}  ${it.kind}  ${it.title}`)
    if (it.kind === 'pr') {
      console.log(`  ${it.url}`)
      console.log(`  ${it.draft ? 'DRAFT, mark it ready. ' : ''}why: ${it.why.join('; ')}. ${{ passing: 'CI green', failing: 'CI failing', pending: 'CI running', none: 'no CI' }[it.ci]}.`)
      if (it.sentences) console.log(`  ${it.sentences}`)
    } else {
      if (it.change) console.log(`  OpenSpec change: ${it.change}`)
      if (it.briefFile) console.log(`  Brief: ${it.briefFile}`)
      for (const l of it.links) console.log(`  ${l.type ?? 'link'}: ${l.label ? `${l.label}: ` : ''}${l.url}`)
    }
  }
}

/** One row of the list as text: kind, product, age, one line, then the key. */
const rowText = (it, now = Date.now()) =>
  `${(it.kind === 'pr' ? 'GitHub' : it.kind).padEnd(6)}  ${String(it.product ?? it.repo).padEnd(12)}  ${age(it.at, now).padStart(6)}  ${it.line || it.title}  (${it.key})`

async function cmdList() {
  const designs = waitingOrDie()
  const prs = await prsOrDie()
  const items = merge(designs, prs.items)
  // `designs` keeps its name for scripts that read it: every task kind (spec, design, result, plan, stuck).
  if (flag('json')) return console.log(JSON.stringify({ items, designs, prs: prs.items, errors: prs.errors }, null, 2))
  if (!items.length) console.log(prs.errors.length ? 'Nothing waits for you that could be read.' : 'Nothing waits for you: no spec, design, result or PR.')
  for (const it of items) {
    console.log(rowText(it))
    printItems([it], false)
  }
  for (const e of prs.errors) console.error(`PRs incomplete: ${e}`)
}

async function cmdPrs() {
  const { items, errors } = await prsOrDie()
  if (flag('json')) return console.log(JSON.stringify({ items, errors }, null, 2))
  if (!items.length && errors.length) die(`PRs not read: ${errors.join('; ')}`)
  if (!items.length) console.log('No PR waits for your review.')
  printItems(items)
  for (const e of errors) console.error(`incomplete: ${e}`)
}

/** The annotate plugin's Plannotator: PLANNOTATOR_TUI_BIN, else from herdr's plugin list, else on PATH. */
function plannotator() {
  if (env.PLANNOTATOR_TUI_BIN) return env.PLANNOTATOR_TUI_BIN
  const root = herdr(['plugin', 'list', '--plugin', 'annotate', '--json'])?.plugins?.[0]?.plugin_root
  const bin = root && join(root, 'bin', 'plannotator-tui.exe')
  return bin && existsSync(bin) ? bin : 'plannotator-tui'
}

/**
 * The brief for review: a new tab in the CEO's workspace (next to its chat and graph tabs). Plannotator
 * has no tab placement, so the pane opens as a split and moves to a new tab there.
 */
function openForReview(it) {
  const opened = herdr([
    'plugin', 'pane', 'open', '--plugin', PLUGIN, '--entrypoint', 'doc', '--placement', 'split',
    ...(env.HERDR_PANE_ID ? ['--target-pane', env.HERDR_PANE_ID] : []),
    '--env', `AGENT_KIT_REVIEW_ID=${it.id}`,
    // The tab reads the same board and state as this caller (herdr starts it with its server's environment).
    ...PASS.filter((k) => env[k]).flatMap((k) => ['--env', `${k}=${env[k]}`]),
    '--focus',
  ])
  const pane = opened?.plugin_pane?.pane
  if (!pane?.pane_id) return { ok: false, error: 'herdr did not open the review pane (is the plugin linked?)' }
  const ws = ceoWorkspace(herdr(['workspace', 'list'])?.workspaces, it.repo, { env, fallback: pane.workspace_id })
  const moved = herdr(['pane', 'move', pane.pane_id, '--new-tab', '--workspace', ws])
  const tab = moved?.move_result?.created_tab?.tab_id
  if (tab) {
    herdr(['tab', 'rename', tab, `review ${it.key}`])
    herdr(['workspace', 'focus', ws])
    herdr(['tab', 'focus', tab])
  }
  return { ok: true, pane: pane.pane_id, tab, workspace: ws }
}

/** What runs in the review tab: Plannotator on the brief, then what it decided. */
function cmdDoc() {
  const it = find(env.AGENT_KIT_REVIEW_ID || args[0])
  const dir = join(STATE, 'briefs')
  mkdirSync(join(STATE, 'results'), { recursive: true })
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${it.key}.md`)
  writeFileSync(file, briefDoc(it))
  const result = join(STATE, 'results', `${it.key}-${Date.now()}.json`)
  // Standalone, not `herdr open`, and without herdr's context: Plannotator would otherwise find an agent
  // pane (the one focused when the tab opened) and type the decision into it. The decision comes back
  // here only, as the result file, and goes to the board as approve or tell.
  const quiet = Object.fromEntries(
    Object.entries(env).filter(([k]) => !k.startsWith('HERDR_') && !/^PLANNOTATOR_TUI_(?!THEME|CONFIG)/.test(k)),
  )
  const r = spawnSync(plannotator(), [file, '--gate', '--json', '--result-file', result], { stdio: 'inherit', env: quiet })
  if (r.error) return pause(`Plannotator did not start (${r.error.message}). Is the annotate plugin installed?`)
  const what = fromAnnotation(readJson(result, null))
  if (what.action === 'approve') {
    approveDetached(it.id, what.notes)
    return pause(`${it.key}: approved. ${it.kind === 'result' ? 'The board merges it' : 'The build starts'}; the review list shows how it goes.`)
  }
  if (what.action === 'back') {
    const b = sendBack(board, it, what.text)
    if (b.ok) status(it.id, { ok: true, short: 'back', line: 'Sent back with your comments.' })
    return pause(b.ok ? `${it.key}: sent back with your comments.` : `${it.key}: not sent back: ${b.error}`)
  }
  return pause(`${it.key}: no decision, nothing sent.`)
}

function pause(line) {
  console.log(`\n${line}`)
  spawnSync('sleep', ['2'])
}

/**
 * Open the pane below the work board (the herdr-projects pane), or focus it when it is open already.
 * No board pane open: beside the focused pane, as before.
 */
function cmdOpenPane() {
  const known = readJson(join(STATE, 'pane.json'), {})
  if (known.pane && herdr(['pane', 'get', known.pane])) return herdr(['plugin', 'pane', 'focus', known.pane])
  let ctx = {}
  try {
    ctx = JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON || '{}')
  } catch {}
  const focused = ctx.focused_pane_id || env.HERDR_PANE_ID
  const where = paneSpot(herdr(['pane', 'list'])?.panes ?? [], { focused, workspace: ctx.workspace_id || env.HERDR_WORKSPACE_ID })
  herdr([
    'plugin', 'pane', 'open', '--plugin', PLUGIN, '--entrypoint', 'pane', '--placement', 'split',
    '--direction', where.direction, ...(where.target ? ['--target-pane', where.target] : []), '--focus',
  ])
}

/** The event hook: one herdr notification per design that is new or changed, at most every 20 s. */
function cmdNotify() {
  const stamp = join(STATE, 'notify-stamp')
  if (Date.now() - (mtime(stamp) ?? 0) < NOTIFY_EVERY) return
  mkdirSync(STATE, { recursive: true })
  writeFileSync(stamp, '')
  let items
  try {
    items = waiting()
  } catch {
    return // a hook stays quiet; the pane says why
  }
  const seenFile = join(STATE, 'notified.json')
  const seen = readJson(seenFile, {})
  const skipped = readJson(skipsFile, {})
  for (const it of toNotify(items, seen)) {
    if (skipped[it.id] === it.hash) continue
    notify({ spec: 'Spec ready for review', result: 'Result ready to approve', plan: 'Plan ready for design review' }[it.kind] ?? 'Design ready for review', `${it.key} ${it.title}`)
  }
  writeJson(seenFile, Object.fromEntries(items.map((it) => [it.id, it.hash])))
}

async function cmdPane() {
  const { runPane } = await import('./lib/review-pane.mjs')
  await runPane({ waiting, waitingPrs, board, data, STATE, statusFile, skipsFile, approveDetached, openForReview, sendBack })
}

/** Check a spec brief or a result pitch before the stop. The kind is --kind, else the title line's first word. */
function cmdCheck() {
  const kind = option('kind')
  const file = args[0]
  if (!file) die('agent-kit review check <closing-note.md> [--kind spec|result]')
  const text = readFile(file)
  if (text === null) die(`${file}: cannot read it`)
  const k = kind || (/^#\s+result\b/im.test(text) ? 'result' : /^#\s+spec\b/im.test(text) ? 'spec' : '')
  if (!k) die(`${file}: say --kind spec or --kind result (the title starts with neither "# Spec" nor "# Result")`)
  // Run in the repo's root (or the worktree): a change still under openspec/changes/ is not archived yet.
  const change = changeOf(text)
  const findings = check(k, text, { unarchived: k === 'result' && Boolean(change) && existsSync(join('openspec', 'changes', change)) })
  for (const f of findings) console.log(`${f.level === 'error' ? 'missing' : 'note   '}  ${f.what}`)
  if (!passes(findings)) process.exit(1)
  console.log(`ok: the ${k === 'spec' ? 'brief' : 'pitch'} has what the owner needs to decide${findings.length ? ' (notes above)' : ''}.`)
}

/**
 * Who approves this task's finished work (the merge gate asks before the CEO runs `herdr-projects approve`):
 * exit 0 and "owner" when it is a result the owner reviews in the review list, 1 and "ceo" when not, 2 when
 * the board cannot tell.
 */
function cmdOwner() {
  try {
    const r = approverOf(args[0], { board, data, readFile })
    console.log(r.who)
    process.exit(r.who === 'owner' ? 0 : 1)
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
}

const commands = {
  owner: cmdOwner,
  check: cmdCheck,
  list: cmdList,
  prs: cmdPrs,
  pane: cmdPane,
  'open-pane': cmdOpenPane,
  approve: cmdApprove,
  back: cmdBack,
  annotate: () => {
    const r = openForReview(find(args[0]))
    if (!r.ok) die(r.error)
  },
  doc: cmdDoc,
  notify: cmdNotify,
}
const name = args.shift() ?? 'list'
if (!commands[name]) die(`agent-kit review <${Object.keys(commands).join('|')}>`)
await commands[name]()
