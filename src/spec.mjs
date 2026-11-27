#!/usr/bin/env node
/**
 * OpenSpec changes, the kit's way (the `spec` skill, rules/spec-review.md).
 *
 *   agent-kit spec archive <name> [openspec archive options]   archive a shipped change; refuses while
 *                                                              its tasks.md has an unticked task
 *
 * Runs in the repo's root, with the repo's pinned OpenSpec (`npx --no-install openspec`), telemetry
 * and the update check off. Machine-wide like `review`: it needs no agent-kit.config.json.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OPENSPEC_ENV, openTasks } from './lib/spec.mjs'

const [sub, name, ...rest] = process.argv.slice(2)
const die = (msg, code = 1) => {
  console.error(msg)
  process.exit(code)
}

if (sub !== 'archive' || !name || name.startsWith('-')) die('agent-kit spec archive <name> [openspec archive options]', sub ? 1 : 0)

const change = join('openspec', 'changes', name)
const tasks = join(change, 'tasks.md')
if (!existsSync(change)) die(`No change at ${change} (run from the repo root)`)
if (!existsSync(tasks)) die(`${tasks} is missing: a change lists its tasks before it is archived`)
const open = openTasks(readFileSync(tasks, 'utf8'))
if (open.length) {
  die(`${tasks} has ${open.length} unticked task${open.length === 1 ? '' : 's'}; tick what landed, move the rest to a new change, then archive:\n${open.map((t) => `  ${t}`).join('\n')}`)
}
const args = ['--no-install', 'openspec', 'archive', name, ...(rest.includes('--yes') || rest.includes('-y') ? [] : ['--yes']), ...rest]
const run = spawnSync('npx', args, { stdio: 'inherit', env: { ...process.env, ...OPENSPEC_ENV } })
if (run.error) die(`npx openspec did not start: ${run.error.message}`, 2)
process.exit(run.status ?? 2)
