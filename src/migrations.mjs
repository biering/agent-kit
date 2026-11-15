/**
 * agent-kit migrations [--base <ref>] [--all] [--json]
 *
 * Checks every schema file changed against the base (default: the config's `schema.base`, else
 * origin/main) by the data-schema skill's rules, and names the reference and official skill each
 * file needs. Exit 1 on a failure; warnings do not fail.
 *
 * Runs on the checkout it is called from (AGENT_KIT_ROOT overrides), so a branch's own changes and
 * its own `schema` block in agent-kit.config.json are what is judged. The config file is optional
 * here: without a `schema` block the defaults in src/lib/migrations.mjs apply.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { check, format, summarize } from './lib/migrations.mjs'

const args = process.argv.slice(2)
const USAGE = 'agent-kit migrations [--base <ref>] [--all] [--json]'
if (args.includes('-h') || args.includes('--help')) {
  console.log(USAGE)
  process.exit(0)
}
const known = new Set(['--base', '--all', '--json'])
for (let i = 0; i < args.length; i++) {
  if (!known.has(args[i])) {
    console.error(`unknown argument ${args[i]}\n${USAGE}`)
    process.exit(1)
  }
  if (args[i] === '--base') i++
}
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
if (args.includes('--base') && !flag('--base')) {
  console.error(`--base needs a ref\n${USAGE}`)
  process.exit(1)
}

let repoDir
try {
  repoDir = process.env.AGENT_KIT_ROOT
    ? resolve(process.env.AGENT_KIT_ROOT)
    : execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
} catch {
  console.error('agent-kit migrations: run it inside a git checkout')
  process.exit(1)
}

try {
  const file = join(repoDir, 'agent-kit.config.json')
  const config = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).schema ?? {}) : {}
  const all = args.includes('--all')
  const result = check({ repoDir, config, base: flag('--base'), all })
  process.stdout.write(args.includes('--json') ? JSON.stringify({ ...result, ...summarize(result) }, null, 2) + '\n' : format(result, { all }))
  process.exit(summarize(result).fails ? 1 : 0)
} catch (e) {
  console.error(`agent-kit migrations: ${e.message}`)
  process.exit(1)
}
