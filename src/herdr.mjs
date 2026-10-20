#!/usr/bin/env node
/**
 * Sessions and agents as herdr workspaces (docs/herdr.md).
 *
 *   pnpm ceo                                  # = pnpm herdr ceo: open (or focus) the one CEO
 *   pnpm herdr new <slug> [--rc] [--brief <file>] [--branch <b>] [--base origin/main]
 *   pnpm herdr worker <slug> --brief <file>   # the CEO's: same, agent-driven, ends at a PR
 *   pnpm herdr list                           # every session: topic, issue, branch, agent, PR
 *   pnpm herdr sync                           # the same into herdr's sidebar
 *   pnpm herdr cleanup [--dry-run]            # remove finished sessions
 *   pnpm herdr notify "<title>" [--body "…"]  # a herdr notification; no-op without herdr
 *   pnpm herdr bootstrap                      # the plugin's worktree.created hook
 *
 * A session is one topic: a branch, a checkout in the repo's sessions folder,
 * a herdr workspace and a Claude Code pane, both named after the slug. Start the
 * slug with the Linear id (`mae-41-qr-redirect`) and the sidebar shows the issue
 * and its bet. Nothing ever works in the main checkout but you, and nothing is
 * left behind: `cleanup` removes sessions whose PR merged, and empty ones after a
 * day. The CEO runs `cleanup` and `sync` every run.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { config, kitRoot } from './config.mjs'
import { AGENT, CEO_ARGS, bootstrapCheckout, main, prepareTree, tree } from './lib/ceo.mjs'
import {
  agent,
  available,
  createWorktree,
  deliver,
  herdr,
  notify,
  openWorktree,
  prompt,
  startAgent,
  startClaude,
} from './lib/herdr.mjs'
import { envReader } from './lib/repo-env.mjs'

const PLUGIN_ID = config.herdr.plugin
/** Every session checkout lives here, so one folder shows all of them. */
const SESSIONS = config.sessions.dir
const DAY = 24 * 60 * 60 * 1000
const AGENTS = ['claude', 'cursor']
/** Which agent runs a session unless --agent says otherwise (config.mjs, sessions.agent). */
const defaultAgent = envReader(main)('AGENT_KIT_WORKER_AGENT') || config.sessions.agent

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
const run = (cmd, a, cwd = main) => spawnSync(cmd, a, { cwd, encoding: 'utf8' })

const WORKER_FOOTER = `

You are a worker for the CEO agent (${config.ceo.manual}, Delegation), in your own checkout on your own branch.
- Follow .agents/loops/dev-loop/SKILL.md and stop at a green PR. The CEO merges it.
- Anything only ${config.linear.owner} can do goes in the PR body under "Needs ${config.linear.owner}"; do not ask in this pane.
- Your last message is the PR URL, or one line on why there is none.`

function ceo() {
  if (!available()) {
    console.log('No herdr server: starting the CEO in this terminal.')
    const r = spawnSync('claude', CEO_ARGS, { stdio: 'inherit' })
    process.exit(r.status ?? 0)
  }
  if (agent(AGENT)) {
    herdr(['agent', 'focus', AGENT])
    return console.log(`The CEO is already running (agent "${AGENT}"); focused it.`)
  }
  prepareTree()
  const ws =
    openWorktree({ repo: main, path: tree, label: 'ceo' }) ??
    die('herdr could not open the CEO checkout.')
  // Remote Control: the CEO is reachable from claude.ai and the phone app too.
  startClaude(AGENT, ws.pane, [...CEO_ARGS, '--remote-control', AGENT]) ??
    die('herdr could not start Claude Code in the CEO pane.')
  herdr(['agent', 'focus', AGENT])
  prompt(
    AGENT,
    `${config.linear.owner} opened this session. Read your state as ${config.ceo.manual} says, give the five-line report, then wait.`,
  )
  console.log(`CEO started in ${tree} (agent "${AGENT}", workspace ${ws.workspace}).`)
}

/** One topic session: branch + checkout + workspace + Claude pane, all named <slug>. */
function startSession({ slug, branch, base, brief, owner, rc, kind }) {
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(slug)) die('The slug is 1 to 32 of a-z, 0-9 and -.')
  if (!available()) die('No herdr server: start herdr, or (CEO) delegate with the Agent tool.')
  if (agent(slug)) die(`A session "${slug}" is already running: herdr agent focus ${slug}`)
  const path = join(SESSIONS, slug)
  if (existsSync(path)) die(`${path} exists already. Open it in herdr, or pnpm herdr cleanup.`)
  mkdirSync(SESSIONS, { recursive: true })
  execFileSync('git', ['-C', main, 'fetch', '-q', 'origin'])
  const ws =
    createWorktree({
      repo: main,
      branch,
      base,
      path,
      label: owner === 'ceo' ? `🤖 ${slug}` : slug,
    }) ?? die(`herdr could not create ${path}.`)
  // The plugin's worktree.created hook bootstraps new checkouts; without it, do it here.
  if (!pluginLinked()) bootstrapCheckout(path)
  // Claude Code, or Cursor's agent so the work runs on the Cursor plan instead
  // of the Claude weekly limit. Cursor reads the same AGENTS.md and .cursor/.
  // Cursor asks to trust every new directory, and that dialog would swallow
  // the brief's keystrokes; these are our own checkouts, so trust up front.
  const agentArgs =
    kind === 'cursor'
      ? ['--trust', ...(owner === 'ceo' ? ['--auto-review'] : [])]
      : [
          ...(owner === 'ceo' ? ['--permission-mode', 'auto'] : []),
          ...(rc ? ['--remote-control', slug] : []),
        ]
  startAgent(slug, ws.pane, kind, agentArgs) ?? die(`herdr could not start ${kind} for ${slug}.`)
  if (brief) {
    const text = owner === 'ceo' ? `${brief.trim()}${WORKER_FOOTER}` : brief.trim()
    if (!deliver(slug, text))
      die(`${slug} did not start on its brief; look at its pane (herdr agent focus ${slug}).`)
  }
  if (owner !== 'ceo') herdr(['agent', 'focus', slug])
  syncOne({ slug, branch, workspace: ws.workspace, owner })
  console.log(`session ${slug}: ${branch} in ${path} (workspace ${ws.workspace})`)
}

function agentKind() {
  const kind = option('agent') ?? defaultAgent
  if (!AGENTS.includes(kind)) die(`--agent is one of ${AGENTS.join(', ')}`)
  return kind
}

function readBrief(file) {
  return file ? readFileSync(file === '-' ? 0 : file, 'utf8') : undefined
}

function newSession() {
  const slug = args.shift() ?? die('Which topic? pnpm herdr new <slug>, e.g. mae-41-qr-redirect')
  const rc = flag('rc')
  const kind = agentKind()
  const brief = readBrief(option('brief'))
  const branch = option('branch') ?? `feat/${slug}`
  startSession({
    slug,
    branch,
    base: option('base') ?? 'origin/main',
    brief,
    owner: 'you',
    rc,
    kind,
  })
}

function worker() {
  const slug = args.shift() ?? die('Which worker? pnpm herdr worker <slug> --brief <file>')
  const brief =
    readBrief(option('brief')) ?? die(`--brief <file> is required (${config.ceo.manual}, Delegation).`)
  const branch = option('branch') ?? `feat/${slug}`
  const kind = agentKind()
  // Remote Control on (Claude only): Christoph can look in from his phone.
  startSession({
    slug,
    branch,
    base: option('base') ?? 'origin/main',
    brief,
    owner: 'ceo',
    rc: true,
    kind,
  })
}

/** Every session checkout, with what herdr and git know about it. */
function sessions() {
  const list = herdr(['worktree', 'list', '--cwd', main])?.worktrees ?? []
  return list
    .filter((w) => dirname(w.path) === SESSIONS)
    .map((w) => {
      const slug = basename(w.path)
      return {
        ...w,
        slug,
        issue: slug
          .match(/^([a-z]+)-(\d+)-/)
          ?.slice(1)
          .join('-')
          .toUpperCase(),
      }
    })
}

function prFor(branch) {
  const r = run('gh', [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'all',
    '--json',
    'number,state,statusCheckRollup',
    '--limit',
    '1',
  ])
  const pr = r.status === 0 ? JSON.parse(r.stdout || '[]')[0] : undefined
  if (!pr) return undefined
  const checks = pr.statusCheckRollup ?? []
  const ci = checks.some((c) =>
    ['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT'].includes(c.conclusion),
  )
    ? 'red'
    : checks.some((c) => c.status && c.status !== 'COMPLETED')
      ? 'running'
      : checks.length
        ? 'green'
        : 'no CI'
  return { number: pr.number, state: pr.state.toLowerCase(), ci }
}

function linearIssue(id) {
  if (!id) return undefined
  const r = run('node', [join(kitRoot, 'src/linear.mjs'), 'issue', id, '--json'])
  try {
    return r.status === 0 ? JSON.parse(r.stdout) : undefined
  } catch {
    return undefined
  }
}

function describe(s) {
  const pr = prFor(s.branch)
  const issue = linearIssue(s.issue)
  return {
    pr,
    issue,
    prText: pr ? `#${pr.number} ${pr.state === 'open' ? pr.ci : pr.state}` : 'no PR',
    topic: issue?.project ?? 'no bet',
    issueText: issue ? `${issue.identifier} ${issue.state}` : (s.issue ?? 'no issue'),
  }
}

function syncOne({ slug, branch, workspace, owner }) {
  if (!workspace) return
  const d = describe({
    slug,
    branch,
    issue: slug
      .match(/^([a-z]+)-(\d+)-/)
      ?.slice(1)
      .join('-')
      .toUpperCase(),
  })
  herdr([
    'workspace',
    'report-metadata',
    workspace,
    '--source',
    config.herdr.source,
    '--token',
    `pr=${d.prText}`,
    '--token',
    `topic=${d.topic}`,
    '--token',
    `issue=${d.issueText}`,
    ...(owner ? ['--token', `owner=${owner === 'ceo' ? 'CEO' : 'you'}`] : []),
  ])
}

/**
 * A plain `workspace create` carries no worktree provenance: name the repo after
 * the checkout its first pane sits in (the main checkout, for a linked worktree).
 */
function repoOfPane(workspaceId) {
  const cwd = herdr(['pane', 'list', '--workspace', workspaceId])?.panes?.[0]?.cwd
  if (!cwd) return undefined
  const r = run('git', ['-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'], cwd)
  return r.status === 0 ? basename(dirname(r.stdout.trim())) : undefined
}

/**
 * $repo for every workspace in herdr, Maelstrom's or not (Leverage included),
 * so the sidebar can colour each repo the way its VS Code window is coloured.
 */
function syncRepos() {
  for (const w of herdr(['workspace', 'list'])?.workspaces ?? []) {
    const repo = w.worktree?.repo_name ?? repoOfPane(w.workspace_id)
    if (repo) {
      herdr([
        'workspace',
        'report-metadata',
        w.workspace_id,
        '--source',
        'repo',
        '--token',
        `repo=${repo}`,
      ])
    }
  }
}

/** The sidebar tokens: $repo everywhere, $topic $issue $pr $owner per session (docs/herdr.md). */
function sync() {
  syncRepos()
  // The plugin's workspace.created hook only needs the cheap part.
  if (flag('repos-only')) return
  for (const s of sessions()) {
    if (s.open_workspace_id)
      syncOne({ slug: s.slug, branch: s.branch, workspace: s.open_workspace_id })
  }
  const live = agent(AGENT)
  if (live?.workspace_id) {
    herdr([
      'workspace',
      'report-metadata',
      live.workspace_id,
      '--source',
      config.herdr.source,
      '--token',
      'topic=coordination',
      '--token',
      'owner=CEO',
    ])
  }
}

/** Sessions grouped by bet, so the big topics read first and the detail stays. */
function list() {
  const all = sessions().map((s) => ({ ...s, ...describe(s), live: agent(s.slug) }))
  const ceoAgent = agent(AGENT)
  console.log(`CEO: ${ceoAgent ? ceoAgent.agent_status : 'not running'}  (${tree})`)
  if (!all.length) return console.log('No sessions. pnpm herdr new <slug> starts one.')
  const byTopic = Map.groupBy(all, (s) => s.topic)
  for (const [topic, items] of byTopic) {
    console.log(`\n${topic}`)
    for (const s of items) {
      const state = s.live ? s.live.agent_status : s.open_workspace_id ? 'no agent' : 'closed'
      console.log(`  ${s.slug.padEnd(34)} ${state.padEnd(9)} ${s.issueText.padEnd(22)} ${s.prText}`)
    }
  }
}

/**
 * Remove sessions that are finished, and only those:
 *   - PR merged: remove the checkout (forced) and the local branch
 *   - PR closed unmerged, checkout clean: remove the checkout, keep the branch
 *   - no PR, clean, nothing committed beyond origin/main, untouched for a day: remove both
 * A working or blocked agent, uncommitted changes and unpushed commits always stay.
 */
function cleanup() {
  const dry = flag('dry-run')
  run('git', ['-C', main, 'fetch', '-q', 'origin'])
  run('git', ['-C', main, 'worktree', 'prune'])
  for (const s of sessions()) {
    const live = agent(s.slug)
    if (live && !['idle', 'done'].includes(live.agent_status)) {
      console.log(`keep    ${s.slug} (agent ${live.agent_status})`)
      continue
    }
    const pr = prFor(s.branch)
    const dirty = run('git', ['-C', s.path, 'status', '--porcelain']).stdout.trim() !== ''
    const ahead = Number(
      run('git', ['-C', s.path, 'rev-list', '--count', 'origin/main..HEAD']).stdout.trim() || 0,
    )
    const idle = Date.now() - statSync(s.path).mtimeMs > DAY

    let verdict
    if (pr?.state === 'merged') verdict = { why: `#${pr.number} merged`, force: true, branch: true }
    else if (pr?.state === 'closed' && !dirty)
      verdict = { why: `#${pr.number} closed`, force: false, branch: false }
    else if (!pr && !dirty && ahead === 0 && idle)
      verdict = { why: 'empty for a day', force: false, branch: true }
    if (!verdict) {
      const why = pr
        ? `#${pr.number} ${pr.state}`
        : dirty
          ? 'uncommitted changes'
          : ahead
            ? `${ahead} unpushed commit(s)`
            : 'new'
      console.log(`keep    ${s.slug} (${why})`)
      continue
    }
    console.log(`${dry ? 'would remove' : 'remove '} ${s.slug} (${verdict.why})`)
    if (dry) continue
    const removed =
      s.open_workspace_id &&
      herdr([
        'worktree',
        'remove',
        '--workspace',
        s.open_workspace_id,
        ...(verdict.force ? ['--force'] : []),
      ])
    if (!removed) {
      run('git', ['-C', main, 'worktree', 'remove', ...(verdict.force ? ['--force'] : []), s.path])
      if (s.open_workspace_id) herdr(['workspace', 'close', s.open_workspace_id])
    }
    // git can unregister the worktree yet leave files a still-running install was
    // writing. Once git no longer knows the folder, what is left is debris.
    run('git', ['-C', main, 'worktree', 'prune'])
    const known = run('git', ['-C', main, 'worktree', 'list', '--porcelain']).stdout.includes(
      `worktree ${s.path}\n`,
    )
    if (!known && existsSync(s.path)) rmSync(s.path, { recursive: true, force: true })
    if (verdict.branch) run('git', ['-C', main, 'branch', '-D', s.branch])
  }
}

function pluginLinked() {
  const r = spawnSync('herdr', ['plugin', 'list', '--plugin', PLUGIN_ID, '--json'], {
    encoding: 'utf8',
  })
  return r.status === 0 && r.stdout.includes(PLUGIN_ID) && !r.stdout.includes('"enabled":false')
}

/** worktree.created: prepare a new checkout of this repo for an agent. */
function bootstrap() {
  let event = {}
  try {
    event = JSON.parse(process.env.HERDR_PLUGIN_EVENT_JSON ?? '{}')
  } catch {}
  const path = event.worktree?.path ?? event.data?.worktree?.path
  if (!path || !existsSync(path)) return
  const common = run(
    'git',
    ['-C', path, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    path,
  ).stdout.trim()
  if (dirname(common) !== main) return // another repo's worktree
  bootstrapCheckout(path)
}

/**
 * Cursor's own hooks (~/.cursor/hooks.json, every repo) report each Cursor
 * chat to ~/.local/state/agent-kit/agents/cursor, where the control panel
 * reads it. Idempotent: re-running replaces our entries and leaves others
 * (herdr's, entire's) alone. The hook runs under the absolute node of this
 * install, since Cursor, a GUI app, may not see nvm's PATH.
 */
function installCursorHooks() {
  const cursorDir = join(homedir(), '.cursor')
  const target = join(cursorDir, 'agent-kit-agent-state.mjs')
  mkdirSync(cursorDir, { recursive: true })
  copyFileSync(join(kitRoot, 'src/hooks/cursor-agent-state.mjs'), target)
  const file = join(cursorDir, 'hooks.json')
  let config = { version: 1, hooks: {} }
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch {}
  config.hooks ??= {}
  for (const event of ['beforeSubmitPrompt', 'stop', 'sessionEnd']) {
    const others = (config.hooks[event] ?? []).filter(
      (h) => !/(maelstrom|agent-kit)-agent-state/.test(String(h.command)),
    )
    config.hooks[event] = [...others, { command: `'${process.execPath}' '${target}' ${event}` }]
  }
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  console.log(`Cursor hooks installed: ${file} (beforeSubmitPrompt, stop, sessionEnd)`)
}

function notifyCmd() {
  const body = option('body')
  const title = args.join(' ').trim() || die('A title is required.')
  notify(title, body)
}

const commands = {
  ceo,
  new: newSession,
  worker,
  list,
  workers: list,
  sync,
  cleanup,
  bootstrap,
  notify: notifyCmd,
  'install-cursor-hooks': installCursorHooks,
}
const cmd = args.shift() ?? 'list'
if (!commands[cmd]) die(`One of: ${Object.keys(commands).join(', ')}`)
commands[cmd]()
