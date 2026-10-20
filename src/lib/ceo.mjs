/**
 * The CEO agent's checkout and prompt, shared by the daily run
 * (scripts/ceo-schedule.mjs) and the herdr launcher (scripts/herdr.mjs), so
 * both prepare the same tree the same way. ops/CEO.md is the manual.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { config, main } from '../config.mjs'

export { main }



/** The CEO works in its own checkout of origin/main, never in Christoph's. */
export const tree = config.ceo.checkout

/** The herdr agent name of the one CEO. */
export const AGENT = config.ceo.agent

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts }).trim()

/**
 * Reset the CEO tree to origin/main. Whatever a previous run left behind goes:
 * call it only when no CEO session is working in the tree.
 */
export function prepareTree() {
  sh('git', ['-C', main, 'fetch', '-q', 'origin', 'main'])
  // A tree deleted with rm -rf stays registered and would block the add forever.
  sh('git', ['-C', main, 'worktree', 'prune'])
  if (!existsSync(tree))
    sh('git', ['-C', main, 'worktree', 'add', '-q', '--detach', tree, 'origin/main'])
  sh('git', ['-C', tree, 'checkout', '-q', '-f', '--detach', 'origin/main'])
  sh('git', ['-C', tree, 'reset', '-q', '--hard', 'origin/main'])
  sh('git', ['-C', tree, 'clean', '-fdq'])
  bootstrapCheckout(tree)
}

/**
 * What a fresh checkout of this repo needs before an agent can work in it.
 * A repo with its own preparation names it (config `bootstrap`, e.g. Leverage's
 * `pnpm worktree:prepare`). Otherwise: dependencies, and the per-machine
 * approvals of project MCP servers (Playwright), which are gitignored. `.env`
 * needs nothing: repo-env.mjs reads the main checkout's.
 */
export function bootstrapCheckout(dir) {
  if (config.bootstrap) {
    const [cmd, ...args] = config.bootstrap
    spawnSync(cmd, args, { cwd: dir, stdio: 'ignore' })
    return
  }
  const local = join(main, '.claude/settings.local.json')
  if (existsSync(local) && dir !== main)
    copyFileSync(local, join(dir, '.claude/settings.local.json'))
  spawnSync('pnpm', ['install', '--frozen-lockfile', '--silent'], { cwd: dir, stdio: 'ignore' })
}

/**
 * The prompt of a scheduled run. Headless (`claude -p`) ends with the process,
 * so its workers must run in the foreground; a CEO in a herdr pane lives on.
 */
export function scheduledPrompt({ now = new Date(), headless = false } = {}) {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' })
  return (
    `Scheduled run, ${weekday} ${now.toISOString().slice(0, 10)}. ` +
    'Nobody may be at the keyboard: ask only through Linear. ' +
    (headless ? 'Run workers in the foreground. ' : '') +
    'Follow ops/CEO.md' +
    (weekday === 'Monday' ? ', including the Monday review.' : '.')
  )
}
