/**
 * The repo this kit serves, and its `agent-kit.config.json`.
 *
 * The kit is vendored into each repo at `vendor/agent-kit/` (see README), so
 * the repo is two levels above the kit. AGENT_KIT_ROOT overrides that, for
 * running the kit from its own checkout against a repo.
 *
 * Everything that differs between repos is in the config; everything else is
 * derived from its `name`:
 *
 *   {
 *     "name": "maelstrom",                       // required
 *     "linear": { "team": "MAE", "workspace": "Maelstrom Lab", "owner": "Christoph",
 *                 "labels": ["needs-decision"] },             // existing queues to fold in
 *     "ceo": { "checkout": "../maelstrom-ceo", "launchd": "com.maelstrom.ceo", "hour": 8 },
 *     "sessions": { "dir": "../maelstrom-worktrees", "agent": "claude" },
 *     "stats": { "repos": { "maelstrom": ".", "leverage": "../../leverage/leverage" } },
 *     "mail": { "inbox": "maelstrom@agentmail.to" },
 *     "bootstrap": ["pnpm", "worktree:prepare"]          // prepares a new checkout
 *   }
 *
 * Paths are relative to the repo's main checkout.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mainCheckoutRoot } from './lib/repo-env.mjs'

/** The kit's own folder (vendor/agent-kit in a repo). */
export const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The repo the kit serves: this checkout, a worktree or the main one. */
export const repoRoot = process.env.AGENT_KIT_ROOT ? resolve(process.env.AGENT_KIT_ROOT) : resolve(kitRoot, '../..')

/** The repo's main checkout, also when the kit runs from a linked worktree. */
export const main = mainCheckoutRoot(repoRoot) ?? repoRoot

function load() {
  const file = join(main, 'agent-kit.config.json')
  if (!existsSync(file)) {
    console.error(`No agent-kit.config.json in ${main}. See vendor/agent-kit/README.md.`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

const raw = load()
const name = raw.name ?? (console.error('agent-kit.config.json needs a "name".'), process.exit(1))
const at = (p) => resolve(main, p)

export const config = {
  name,
  linear: {
    team: raw.linear?.team,
    workspace: raw.linear?.workspace ?? 'Linear',
    owner: raw.linear?.owner ?? 'the owner',
    group: raw.linear?.group ?? 'Human',
    view: raw.linear?.view ?? 'Needs me',
    labels: raw.linear?.labels ?? [],
    // State names per role (ask, task, start, done, canceled); unset roles go by state type.
    states: raw.linear?.states ?? {},
    // false where only people close issues: `close` then refuses.
    close: raw.linear?.close ?? true,
  },
  ceo: {
    checkout: at(raw.ceo?.checkout ?? `../${name}-ceo`),
    launchd: raw.ceo?.launchd ?? `com.${name}.ceo`,
    hour: raw.ceo?.hour ?? 8,
    logs: join(homedir(), 'Library/Logs', `${name}-ceo`),
    agent: raw.ceo?.agent ?? `${name}-ceo`,
    // Where the CEO's operating manual lives (Leverage keeps agent bodies in skills).
    manual: raw.ceo?.manual ?? 'ops/CEO.md',
    // The merge gate for the CEO alone; false when the repo's own settings gate every session.
    gate: raw.ceo?.gate ?? true,
  },
  sessions: {
    dir: at(raw.sessions?.dir ?? `../${name}-worktrees`),
    // AGENT_KIT_WORKER_AGENT=cursor in the root .env moves sessions to Cursor
    // while the Claude weekly limit is tight, without a flag on every call.
    agent: raw.sessions?.agent ?? 'claude',
  },
  herdr: { plugin: raw.herdr?.plugin ?? `${name}.ops`, source: `${name}-sessions` },
  stats: {
    repos: Object.fromEntries(Object.entries(raw.stats?.repos ?? { [name]: '.' }).map(([k, p]) => [k, at(p)])),
  },
  mail: { inbox: raw.mail?.inbox },
  bootstrap: raw.bootstrap,
}
