/**
 * herdr (https://herdr.dev), the terminal multiplexer the agents run in, from
 * Node. Every helper degrades to "not available" instead of throwing, so a
 * script that uses herdr when it is there still works on a machine, or in a
 * launchd run, without it.
 *
 * The CLI is the interface (`herdr agent|worktree|pane|notification …`); it
 * prints JSON with the useful part under `.result`. docs/herdr.md has the why.
 */
import { spawnSync } from 'node:child_process'

/** Run a herdr command; the parsed `.result`, or null when herdr is absent or refuses. */
export function herdr(args, { timeout } = {}) {
  const r = spawnSync('herdr', args, { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 })
  if (r.error || r.status !== 0) return null
  try {
    return JSON.parse(r.stdout).result ?? null
  } catch {
    return null
  }
}

/** True when a herdr server is running for the default session. */
export function available() {
  const r = spawnSync('herdr', ['status', 'server'], { encoding: 'utf8' })
  return !r.error && r.status === 0 && /status:\s*running/.test(r.stdout)
}

/** The live agent with this name, or undefined. */
export function agent(name) {
  return herdr(['agent', 'list'])?.agents?.find((a) => a.name === name)
}

/**
 * A notification in herdr's UI (and macOS, when the user's config delivers
 * toasts to the system). Silent no-op without herdr.
 */
export function notify(title, body, sound = 'request') {
  if (!available()) return false
  return (
    herdr(['notification', 'show', title, ...(body ? ['--body', body] : []), '--sound', sound]) !==
    null
  )
}

/** The root pane of a workspace herdr just created or opened. */
function rootPane(result) {
  if (result?.root_pane?.pane_id) return result.root_pane.pane_id
  const id = result?.workspace?.workspace_id
  if (!id) return null
  return herdr(['pane', 'list', '--workspace', id])?.panes?.[0]?.pane_id ?? null
}

/** Open an existing checkout as a herdr workspace grouped under its repo. */
export function openWorktree({ repo, path, label }) {
  const r = herdr([
    'worktree',
    'open',
    '--cwd',
    repo,
    '--path',
    path,
    '--label',
    label,
    '--no-focus',
  ])
  return r ? { workspace: r.workspace?.workspace_id, pane: rootPane(r) } : null
}

/** Create a branch + checkout and open it as a herdr workspace. */
export function createWorktree({ repo, branch, base, path, label }) {
  const r = herdr([
    'worktree',
    'create',
    '--cwd',
    repo,
    '--branch',
    branch,
    '--base',
    base,
    '--path',
    path,
    '--label',
    label,
    '--no-focus',
  ])
  return r ? { workspace: r.workspace?.workspace_id, pane: rootPane(r) } : null
}

/** Start a coding agent (herdr kind: claude, cursor, …) as a named agent in a shell pane. */
export function startAgent(name, pane, kind, agentArgs = []) {
  return herdr([
    'agent',
    'start',
    name,
    '--kind',
    kind,
    '--pane',
    pane,
    '--timeout',
    '60000',
    '--',
    ...agentArgs,
  ])
}

/** Start Claude Code as a named agent in a shell pane; extra args go to `claude`. */
export function startClaude(name, pane, claudeArgs = []) {
  return startAgent(name, pane, 'claude', claudeArgs)
}

/**
 * Submit a prompt. With `wait`, block until the agent settles (idle, done or
 * blocked) or the timeout passes; the agent's state comes back either way.
 */
export function prompt(name, text, { wait = false, timeoutMs } = {}) {
  const args = ['agent', 'prompt', name, text]
  if (wait) args.push('--wait')
  if (timeoutMs) args.push('--timeout', String(timeoutMs))
  const r = spawnSync('herdr', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  return {
    ok: r.status === 0,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim(),
    status: agent(name)?.agent_status,
  }
}

/**
 * Hand a freshly started agent its first task, and make sure it took it. An
 * agent that updates itself on launch (Cursor does) can look ready before its
 * input is, and the Enter that submits the brief gets lost. So: wait for idle,
 * prompt, wait for `working`; if it never starts, press Enter once more.
 */
export function deliver(name, text) {
  herdr(['agent', 'wait', name, '--until', 'idle', '--timeout', '60000'], { timeout: 70000 })
  const first = spawnSync(
    'herdr',
    ['agent', 'prompt', name, text, '--wait', '--until', 'working', '--timeout', '20000'],
    {
      encoding: 'utf8',
    },
  )
  if (first.status === 0 || agent(name)?.agent_status === 'working') return true
  herdr(['agent', 'send-keys', name, 'Enter'])
  herdr(['agent', 'wait', name, '--until', 'working', '--timeout', '20000'], { timeout: 30000 })
  return agent(name)?.agent_status === 'working'
}

/** The last lines an agent printed, for a log file. */
export function read(name, lines = 200) {
  const r = spawnSync(
    'herdr',
    ['agent', 'read', name, '--source', 'recent-unwrapped', '--lines', String(lines)],
    {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  return r.status === 0 ? r.stdout : ''
}
