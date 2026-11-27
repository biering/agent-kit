/**
 * A plan or an OpenSpec change shown to the owner in Plannotator, reachable from his phone or
 * laptop (`agent-kit plan-review`, README "Plan review").
 *
 * Plannotator (https://plannotator.ai) opens a document in a browser review with Approve and
 * annotations and hands the decision back as JSON. Its page listens on 127.0.0.1 of the agent's
 * machine, so every review goes out over the owner's tailnet (`tailscale serve`, HTTPS, tailnet
 * devices only). A repo's own scripts (a schema review) import install, gatedReview, detach and
 * withoutDetach from here (`vendor/agent-kit/src/lib/plan-review.mjs`).
 */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

/** The release every machine installs; bump it on purpose, never float to latest. */
export const PLANNOTATOR_VERSION = '0.29.3'

/** The installer of that release's tag, fetched from GitHub rather than the plannotator.ai redirect. */
export const INSTALLER_URL = `https://raw.githubusercontent.com/backnotprop/plannotator/v${PLANNOTATOR_VERSION}/scripts/install.sh`

/** sha256 of INSTALLER_URL; bump it with the version after reading the new installer. */
export const INSTALLER_SHA256 = '899009f864c535370f13576cd73a3d15d9ca822526e5045c6a016453e1c2672c'

/** The Tailscale CLI: on PATH (Homebrew, the standalone package) or inside the Mac App Store app. */
const TAILSCALE_CANDIDATES = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']

/**
 * The binary's build provenance is checked with `gh attestation verify`. Claude is the only agent
 * wired; the installer would otherwise also write into Codex, Gemini and friends.
 */
const INSTALL_FLAGS = [
  '--verify-attestation',
  '--non-interactive',
  '--no-extras',
  '--skip-codex',
  '--skip-gemini',
  '--skip-kiro',
  '--skip-vibe',
  '--skip-opencode',
  '--skip-qwen',
]

const localBin = path.join(os.homedir(), '.local', 'bin', 'plannotator')
const plannotatorConfig = path.join(os.homedir(), '.plannotator', 'config.json')
const claudeSettings = path.join(os.homedir(), '.claude', 'settings.json')

/** The arguments of one gated review; `remote` publishes it over the tailnet. */
export function annotateArgs(file, { remote, resultFile, title }) {
  const args = ['annotate', file, '--gate', '--json', '--require-approval', '--result-file', resultFile]
  if (title) args.push('--title', title)
  if (remote) args.push('--tailscale')
  return args
}

/** `plannotator 0.29.3` → `0.29.3`; anything else → null. */
export function parseVersion(output) {
  return /plannotator\s+v?(\d+\.\d+\.\d+)/.exec(output ?? '')?.[1] ?? null
}

/** The plan's own `name:` from a leading frontmatter block (a Cursor plan), for the review's tab title. */
export function planTitle(markdown, fallback) {
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(markdown)?.[1] ?? ''
  const name = /^name:\s*["']?(.+?)["']?\s*$/m.exec(frontmatter)?.[1]
  return name || fallback
}

/**
 * The review's exit code from the `--result-file` JSON and Plannotator's own exit status:
 * 0 approved, 1 annotated (feedback), 3 dismissed, 2 when the run failed or left no readable decision.
 */
export function exitCodeFor(decisionJson, status) {
  if (status !== 0 && status !== 1) return 2
  let decision
  try {
    decision = JSON.parse(decisionJson)?.decision
  } catch {
    return 2
  }
  return { approved: 0, annotated: 1, dismissed: 3 }[decision] ?? 2
}

/** `~/.plannotator/config.json` with `tailscale: true`, so the plan-mode hook publishes over the tailnet too. */
export function withTailscale(configJson) {
  const config = configJson?.trim() ? JSON.parse(configJson) : {}
  return `${JSON.stringify({ ...config, tailscale: true }, null, 2)}\n`
}

/**
 * `~/.claude/settings.json` with the plannotator marketplace pinned to the release's tag. Unchanged
 * when the marketplace is absent: the plugin is never added where it is not.
 */
export function withPinnedMarketplace(settingsJson, version) {
  const settings = JSON.parse(settingsJson)
  const source = settings.extraKnownMarketplaces?.plannotator?.source
  if (!source) return settingsJson
  settings.extraKnownMarketplaces.plannotator.source = { ...source, ref: `v${version}` }
  return `${JSON.stringify(settings, null, 2)}\n`
}

/** The binary in `~/.local/bin` (where the installer puts it) first, else the one on PATH. */
export function binary() {
  for (const candidate of [localBin, 'plannotator']) {
    const run = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
    if (run.status === 0) return { path: candidate, version: parseVersion(run.stdout) }
  }
  return null
}

/** Write `transform(current contents or null)` to `file`, only when it changes something. */
function rewrite(file, transform) {
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null
  const after = transform(before)
  if (after === before) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, after)
}

function configure() {
  rewrite(plannotatorConfig, withTailscale)
  if (fs.existsSync(claudeSettings)) rewrite(claudeSettings, (json) => withPinnedMarketplace(json, PLANNOTATOR_VERSION))
}

function runInstaller() {
  // The installer is fetched to its own empty folder, checked against the pinned hash and run from there with bash, never piped.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plannotator-install-'))
  try {
    const script = path.join(dir, 'install.sh')
    execFileSync('curl', ['-fsSL', INSTALLER_URL, '-o', script], { stdio: 'inherit' })
    const hash = createHash('sha256').update(fs.readFileSync(script)).digest('hex')
    if (hash !== INSTALLER_SHA256) {
      throw new Error(`The installer at ${INSTALLER_URL} has sha256 ${hash}, not the pinned ${INSTALLER_SHA256}; refusing to run it.`)
    }
    execFileSync('bash', [script, '--version', `v${PLANNOTATOR_VERSION}`, ...INSTALL_FLAGS], { stdio: 'inherit' })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** The path of the pinned binary, installed first when it is missing or another version; configures this machine. */
export function install() {
  configure()
  const found = binary()
  if (found?.version === PLANNOTATOR_VERSION) return found.path
  runInstaller()
  const installed = binary()
  if (installed?.version !== PLANNOTATOR_VERSION) {
    throw new Error(`plannotator ${PLANNOTATOR_VERSION} did not install (found ${installed?.version ?? 'none'})`)
  }
  return installed.path
}

/** `tailscale status --json` → whether this machine is on the tailnet with HTTPS serve available. */
export function tailnetReady(statusJson) {
  try {
    const status = JSON.parse(statusJson)
    return status.BackendState === 'Running' && (status.CertDomains ?? []).length > 0
  } catch {
    return false
  }
}

export function tailscaleStatus() {
  for (const candidate of TAILSCALE_CANDIDATES) {
    const run = spawnSync(candidate, ['status', '--json'], { encoding: 'utf8' })
    if (!run.error) return run.stdout
  }
  return null
}

/**
 * Open one gated review of `file` over the tailnet and wait for the owner. Returns exitCodeFor's
 * code; Plannotator's decision JSON (with any feedback) goes to stdout, its startup errors to stderr.
 */
export function gatedReview(bin, file, { title } = {}) {
  const resultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-review-'))
  try {
    const resultFile = path.join(resultDir, 'decision.json')
    const run = spawnSync(bin, annotateArgs(file, { remote: true, resultFile, title }), {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: { ...process.env, PLANNOTATOR_BROWSER: 'none', PLANNOTATOR_SHARE: 'disabled' },
    })
    const decision = fs.existsSync(resultFile) ? fs.readFileSync(resultFile, 'utf8') : null
    return exitCodeFor(decision, run.status)
  } finally {
    fs.rmSync(resultDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------------------------
// An OpenSpec change as one document: the owner reads the whole change in one review.

/** The value-score skill's first line, `**Value 7/10 · Complexity 4/10**`, which opens a proposal. */
const SCORE_LINE = /^\*\*Value \d{1,2}\/10 · Complexity \d{1,2}\/10\*\*$/

/** `markdown` with every ATX heading one level deeper (capped at 6), code fences left alone. */
export function shiftHeadings(markdown) {
  let fence = null
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
      if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length))) {
        fence = fence ? null : marker
        return line
      }
      if (fence) return line
      return line.replace(/^(#{1,5})(?=\s)/, '#$1')
    })
    .join('\n')
}

/** Every `spec.md` under `dir`, as paths relative to it, sorted. */
function specFiles(dir) {
  if (!fs.existsSync(dir)) return []
  const found = []
  const walk = (at) => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(at, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'spec.md') found.push(path.relative(dir, full))
    }
  }
  walk(dir)
  return found
}

/** Whether `dir` is an OpenSpec change folder (it holds a `proposal.md`). */
export function isChange(dir) {
  return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() === true && fs.existsSync(path.join(dir, 'proposal.md'))
}

/**
 * An OpenSpec change folder as one Markdown document, titled with the change id: proposal.md, each
 * specs/<capability>/spec.md, design.md, tasks.md, in that order, each under a heading of its own
 * with its headings shifted one level. Throws when the proposal does not open with the value-score
 * lines: the owner decides on the score first.
 */
export function changeDocument(dir) {
  const id = path.basename(path.resolve(dir))
  const read = (file) => fs.readFileSync(path.join(dir, file), 'utf8').trim()
  const proposal = read('proposal.md')
  if (!SCORE_LINE.test(proposal.split('\n')[0].trim())) {
    throw new Error(`${path.join(dir, 'proposal.md')} does not open with the value-score lines (**Value N/10 · Complexity N/10**, the value-score skill)`)
  }
  const sections = [['Proposal', proposal]]
  for (const spec of specFiles(path.join(dir, 'specs'))) {
    sections.push([`Spec: ${path.dirname(spec).split(path.sep).join('/')}`, read(path.join('specs', spec))])
  }
  for (const [heading, file] of [['Design', 'design.md'], ['Tasks', 'tasks.md']]) {
    if (fs.existsSync(path.join(dir, file))) sections.push([heading, read(file)])
  }
  const body = sections.map(([heading, text]) => `## ${heading}\n\n${shiftHeadings(text)}`).join('\n\n')
  return { title: id, markdown: `# ${id}\n\n${body}\n` }
}

// ---------------------------------------------------------------------------------------------
// Detach: a review waits hours for the owner, longer than the agent session that starts it lives.

/** `argv` without `--detach <prefix>`: `{ prefix, argv }`, prefix null when it is not there. */
export function withoutDetach(argv) {
  const at = argv.indexOf('--detach')
  if (at === -1) return { prefix: null, argv }
  const prefix = argv[at + 1]
  if (!prefix || prefix.startsWith('-')) throw new Error('--detach needs a path prefix, e.g. --detach /tmp/plan-review-<name>')
  return { prefix, argv: [...argv.slice(0, at), ...argv.slice(at + 2)] }
}

/**
 * The `sh` arguments that run `command` and record it under `prefix`: its pid in `<prefix>.pid` at
 * start, its exit code in `<prefix>.exit` at the end. The prefix and the command reach the shell
 * as arguments, never as shell text.
 */
export function detachedShell(prefix, command) {
  return ['-c', 'p=$1; shift; echo $$ > "$p.pid"; "$@"; echo $? > "$p.exit"', 'sh', prefix, ...command]
}

/** The review's address, `https://<machine>.<tailnet>.ts.net:<port>…`, from Plannotator's output; else null. */
export function tailnetAddress(output) {
  return /https:\/\/[\w.-]+\.ts\.net(?::\d+)?(?:\/[^\s'"]*)?/.exec(output ?? '')?.[0] ?? null
}

/** How long detach() waits for the address: longer than an install plus a repo script's own reads. */
export const DETACH_DEADLINE_MS = 90_000

/** The pid in `<prefix>.pid` when that process still runs, else null. */
function livePid(base) {
  const pid = Number.parseInt(fs.existsSync(`${base}.pid`) ? fs.readFileSync(`${base}.pid`, 'utf8') : '', 10)
  if (!Number.isInteger(pid) || pid <= 0) return null
  try {
    process.kill(pid, 0)
    return pid
  } catch (error) {
    return error.code === 'EPERM' ? pid : null
  }
}

/**
 * Whether the last review on `base` was killed before it ended: a pid file, that process gone,
 * and no exit code. Seen in Claude Code remote-control sessions, which reap detached processes.
 */
export function wasReaped(base) {
  return fs.existsSync(`${base}.pid`) && !fs.existsSync(`${base}.exit`) && livePid(base) === null
}

/** What to do when a session reaps detached reviews (README "Plan review"). */
export const REAPED_HINT =
  'The last review on this prefix was killed before the owner decided. If this session reaps detached processes (a Claude Code remote-control session does), run the review without --detach as a tracked background task instead.'

/** The last `count` lines of a file, for a message. */
function tail(file, count = 5) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trimEnd() : ''
  return text ? text.split('\n').slice(-count).join('\n') : ''
}

/**
 * Run `script` with `argv` (no `--detach`) in a session and process group of its own (spawn's
 * `detached` calls setsid), so it outlives the session that started it: stdin closed, stdout and
 * stderr in `<prefix>.out` and `<prefix>.err`. Waits until `<prefix>.err` names the tailnet
 * address, prints it, and returns 0. When the command ends before a page opens (nothing to review,
 * a failure), returns its exit code, 2 when that is unreadable. Returns 4, the command left
 * running, when no address came within `deadlineMs`; 2 without starting anything when a review on
 * the same prefix still runs.
 */
export async function detach(script, argv, prefix, { deadlineMs = DETACH_DEADLINE_MS } = {}) {
  const base = path.resolve(prefix)
  const running = livePid(base)
  if (running) {
    console.error(`A review on ${base} still runs as pid ${running}: wait for it, cancel it (kill -- -${running}) or use another prefix`)
    return 2
  }
  if (wasReaped(base)) console.error(REAPED_HINT)
  fs.mkdirSync(path.dirname(base), { recursive: true })
  for (const stale of ['.pid', '.exit']) fs.rmSync(base + stale, { force: true })
  const out = fs.openSync(`${base}.out`, 'w')
  const err = fs.openSync(`${base}.err`, 'w')
  const child = spawn('sh', detachedShell(base, [process.execPath, script, ...argv]), {
    detached: true,
    stdio: ['ignore', out, err],
  })
  fs.closeSync(out)
  fs.closeSync(err)
  let ended = false
  let spawnError = null
  child.on('exit', () => (ended = true))
  child.on('error', (error) => {
    spawnError = error
    ended = true
  })
  child.unref()
  const deadline = Date.now() + deadlineMs
  for (;;) {
    const done = ended
    const address = tailnetAddress(fs.readFileSync(`${base}.err`, 'utf8'))
    if (address) {
      console.log(`review: ${address}`)
      console.log(`prefix: ${base} (pid in .pid, exit code in .exit once the owner decides, output in .out and .err)`)
      return 0
    }
    if (done) {
      if (spawnError) {
        console.error(`The review could not start: ${spawnError.message}`)
        return 2
      }
      const code = Number.parseInt(fs.existsSync(`${base}.exit`) ? fs.readFileSync(`${base}.exit`, 'utf8') : '', 10)
      const last = tail(`${base}.err`)
      console.error(`The command ended before a review opened; see ${base}.out and ${base}.err${last ? `:\n${last}` : ''}`)
      return Number.isInteger(code) ? code : 2
    }
    if (Date.now() > deadline) {
      console.error(`no address yet; pid in ${base}.pid, see ${base}.err`)
      return 4
    }
    await sleep(250)
  }
}
