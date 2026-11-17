/**
 * What the CEO's launchd job runs and with which environment, kept apart from
 * `ceo-schedule.mjs` (which acts on import) so the choices are testable.
 *
 * The job must not depend on the shell that installed it: not its node (a
 * version-specific Cellar path breaks on `brew upgrade`; another tool's private
 * node vanishes with that tool) and not its PATH.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

/** Homebrew's version-independent symlinks, in order. Deliberately not resolved. */
export const STABLE_NODES = ['/opt/homebrew/bin/node', '/usr/local/bin/node']

/** The PATH of the job; the claude binary's folder is added when it lives elsewhere. */
export const BASE_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']

/** `ceo.node` if set, else the first stable node that exists. Throws with a fix, never guesses. */
export function chooseNode({ configured, exists = existsSync } = {}) {
  if (configured) {
    if (exists(configured)) return configured
    throw new Error(`ceo.node in agent-kit.config.json is ${configured}, which does not exist. Fix the path or remove the key.`)
  }
  const found = STABLE_NODES.find((p) => exists(p))
  if (found) return found
  throw new Error(
    `No node at ${STABLE_NODES.join(' or ')}. Install it with \`brew install node\`, or set ceo.node in agent-kit.config.json to a stable path (not one under a version manager or another tool's folder).`,
  )
}

export function pathFor(claudeBin) {
  const dir = claudeBin ? dirname(claudeBin) : null
  return [...BASE_PATH, ...(dir && !BASE_PATH.includes(dir) ? [dir] : [])].join(':')
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function plistText({ label, node, script, path, home, hour, log }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${esc(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(node)}</string>
    <string>${esc(script)}</string>
    <string>ceo-schedule</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${esc(path)}</string>
    <key>HOME</key><string>${esc(home)}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${esc(log)}</string>
  <key>StandardErrorPath</key><string>${esc(log)}</string>
</dict>
</plist>
`
}

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** The node, script and PATH an installed plist carries. */
export function readPlist(text) {
  const args = text.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/)?.[1] ?? ''
  const [node, script] = [...args.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => unesc(m[1]))
  const path = text.match(/<key>PATH<\/key>\s*<string>([^<]*)<\/string>/)?.[1]
  return { node, script, path: path === undefined ? undefined : unesc(path) }
}

const runs = (bin, args) => {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 15000 })
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : null
}

/**
 * Problems in an installed plist, one fix-line each: empty when the node and
 * claude it would use exist and run. claude is found the way launchd will, on the plist's PATH.
 */
export function checkPlist(text, { exists = existsSync, version = runs, install = 'pnpm ceo:schedule install' } = {}) {
  const { node, script, path } = readPlist(text)
  const problems = []
  if (!node) return [`the plist has no ProgramArguments; reinstall: ${install}`]
  if (!exists(node)) problems.push(`node ${node} does not exist; fix: ${install}`)
  else if (!version(node, ['-v'])) problems.push(`node ${node} does not run (node -v failed); fix: ${install}`)
  if (script && !script.endsWith('.mjs')) problems.push(`the second ProgramArguments entry is ${script}, not the agent-kit script (a stray extra argument?); fix: ${install}`)
  else if (script && !exists(script)) problems.push(`${script} does not exist; fix: ${install}`)
  const claude = (path ?? '')
    .split(':')
    .filter(Boolean)
    .map((d) => `${d}/claude`)
    .find((p) => exists(p))
  if (!claude) problems.push(`claude is not on the job's PATH (${path ?? 'none'}); fix: ${install}`)
  else if (!version(claude, ['--version'])) problems.push(`claude ${claude} does not run; fix: ${install}`)
  return problems
}
