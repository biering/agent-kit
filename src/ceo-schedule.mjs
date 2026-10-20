#!/usr/bin/env node
/**
 * The CEO agent's daily run on this Mac (ops/CEO.md).
 *
 *   pnpm ceo:schedule install     # launchd job, every day at 08:00
 *   pnpm ceo:schedule status      # is it loaded, when did it last run
 *   pnpm ceo:schedule run         # what launchd calls; also a manual run
 *   pnpm ceo:schedule uninstall
 *
 * launchd rather than cron: a job whose time passed while the Mac slept runs
 * on wake instead of being skipped.
 *
 * The run happens in its own worktree (config ceo.checkout), reset to origin/main
 * each time. The agent must read state as it is on main, and must never move
 * the branch Christoph has checked out in the main checkout while he works.
 * Logs go to ~/Library/Logs/<name>-ceo/<date>.log.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.mjs'
import { AGENT, main, prepareTree, scheduledPrompt, tree } from './lib/ceo.mjs'
import * as herdr from './lib/herdr.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const LABEL = config.ceo.launchd
const plist = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`)
const logDir = config.ceo.logs
// launchd runs the copy in the CEO worktree, so it is main's code even when
// this script runs from there; lib/ceo.mjs resolves the main checkout either way.
// launchd runs the copy vendored in the CEO checkout, so it is main's code.
const treeScript = join(tree, 'vendor/agent-kit/bin/agent-kit.mjs')

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim()
const which = (bin) => sh('/bin/zsh', ['-lc', `command -v ${bin}`])

function install() {
  const claude = which('claude')
  prepareTree()
  if (!existsSync(treeScript)) {
    console.error(`${treeScript} does not exist: origin/main has no CEO agent yet. Merge it first.`)
    process.exit(1)
  }
  mkdirSync(dirname(plist), { recursive: true })
  mkdirSync(logDir, { recursive: true })
  writeFileSync(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${treeScript}</string>
    <string>ceo-schedule</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${dirname(claude)}:${dirname(process.execPath)}:${process.env.PATH}</string>
    <key>HOME</key><string>${homedir()}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${config.ceo.hour}</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${join(logDir, 'launchd.log')}</string>
  <key>StandardErrorPath</key><string>${join(logDir, 'launchd.log')}</string>
</dict>
</plist>
`,
  )
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' })
  sh('launchctl', ['bootstrap', `gui/${process.getuid()}`, plist])
  console.log(`installed ${plist}\n  daily at ${String(config.ceo.hour).padStart(2, '0')}:00, runs in ${tree}\n  logs in ${logDir}`)
}

function uninstall() {
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' })
  rmSync(plist, { force: true })
  console.log(
    `removed ${LABEL}. The worktree ${tree} stays; remove it with: git worktree remove ${tree}`,
  )
}

function status() {
  const loaded = spawnSync('launchctl', ['print', `gui/${process.getuid()}/${LABEL}`], {
    encoding: 'utf8',
  })
  console.log(loaded.status === 0 ? `loaded: ${LABEL}` : `not loaded (pnpm ceo:schedule install)`)
  const last = spawnSync(
    '/bin/zsh',
    ['-c', `ls -t ${logDir}/*.log 2>/dev/null | grep -v launchd | head -3`],
    { encoding: 'utf8' },
  )
  console.log(last.stdout.trim() || 'no runs logged yet')
}

/**
 * With a herdr server running, the CEO runs as a visible pane (agent "ceo") that
 * Christoph can watch, take over, and that notifies when it is blocked. One
 * CEO: if it is already live, an idle one gets today's prompt and a busy one
 * keeps working, with a notification instead of a reset under its feet.
 * Without herdr, or if herdr refuses, the headless `claude -p` run.
 */
function run() {
  mkdirSync(logDir, { recursive: true })
  const now = new Date()
  const log = createWriteStream(
    join(logDir, `${now.toISOString().slice(0, 16).replace(':', '')}.log`),
  )
  const done = (text, code) => {
    log.write(`${text}\nexit ${code}\n`)
    log.end()
    process.exitCode = code
  }

  let prepared = false
  if (herdr.available()) {
    const live = herdr.agent(AGENT)
    if (live && !['idle', 'done'].includes(live.agent_status)) {
      herdr.notify(
        'CEO: daily run skipped',
        `The CEO is ${live.agent_status}; it keeps its current session.`,
      )
      return done(`herdr: CEO is ${live.agent_status}, skipped`, 0)
    }
    let ready = Boolean(live)
    if (!ready) {
      prepareTree()
      prepared = true
      const ws = herdr.openWorktree({ repo: main, path: tree, label: 'ceo' })
      ready = Boolean(
        ws?.pane &&
          herdr.startClaude(AGENT, ws.pane, [
            '--agent',
            'ceo',
            '--permission-mode',
            'auto',
            '--remote-control',
            AGENT,
          ]),
      )
    }
    if (ready) {
      // Wait for the turn so the log holds its report; a long run that outlives
      // the timeout keeps going in its pane.
      const r = herdr.prompt(AGENT, scheduledPrompt({ now }), {
        wait: true,
        timeoutMs: 3 * 60 * 60 * 1000,
      })
      if (r.status === 'blocked')
        herdr.notify('CEO needs you', 'The daily run is waiting at a prompt in herdr.')
      return done(`herdr: ${r.output}\nstate: ${r.status}\n\n${herdr.read(AGENT)}`, r.ok ? 0 : 1)
    }
    log.write('herdr could not start the CEO; falling back to headless.\n')
  }

  if (!prepared) prepareTree()
  const child = spawnSync(
    'claude',
    ['-p', '--agent', 'ceo', '--permission-mode', 'auto', scheduledPrompt({ now, headless: true })],
    {
      cwd: tree,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    },
  )
  done(`${child.stdout ?? ''}\n${child.stderr ?? ''}`, child.status ?? 1)
}

const commands = { install, uninstall, status, run }
const cmd = process.argv[2] ?? 'status'
if (!commands[cmd]) {
  console.error(`One of: ${Object.keys(commands).join(', ')}`)
  process.exit(1)
}
commands[cmd]()
