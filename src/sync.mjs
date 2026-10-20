#!/usr/bin/env node
/**
 * Vendor this kit into a repo: `agent-kit sync <repo>` from the kit's own
 * checkout. Copies bin/, src/, hooks/ and the README to <repo>/vendor/agent-kit,
 * writes the repo's herdr plugin manifest (its own id; herdr needs ids
 * unique), and records the kit's commit in <repo>/agent-kit.lock.json.
 *
 * Vendored, not a git dependency: the kit's repository is private, and a
 * private dependency would break every CI install that cannot reach it. The
 * repo stays self-contained; an update is another sync, reviewed as a diff.
 *
 * This file does not load the repo's config through config.mjs (that reads the
 * repo the kit is vendored into); it reads the target's config directly.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const kit = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2] ? resolve(process.argv[2]) : undefined
if (!target || !existsSync(join(target, '.git'))) {
  console.error('usage: agent-kit sync <path to a git repo>')
  process.exit(1)
}
const configFile = join(target, 'agent-kit.config.json')
if (!existsSync(configFile)) {
  console.error(`${configFile} is missing: write it first (README.md, Config).`)
  process.exit(1)
}
const config = JSON.parse(readFileSync(configFile, 'utf8'))
const dest = join(target, 'vendor/agent-kit')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
for (const part of ['bin', 'src', 'hooks', 'README.md']) {
  if (existsSync(join(kit, part))) cpSync(join(kit, part), join(dest, part), { recursive: true })
}

// The herdr plugin, with this repo's id and paths relative to its folder.
// owner/repo from origin, so this repo's link handlers claim only its own PRs.
const origin = execFileSync('git', ['-C', target, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim()
const github = origin.match(/github\.com[:/](.+?)(\.git)?$/)?.[1] ?? ''
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')
const plugin = readFileSync(join(kit, 'herdr-plugin/herdr-plugin.toml'), 'utf8')
  .replaceAll('{{id}}', config.herdr?.plugin ?? `${config.name}.ops`)
  .replaceAll('{{name}}', config.name)
  .replaceAll('{{github}}', escape(github))
  .replaceAll('{{team}}', escape(config.linear?.team ?? '[A-Z]+'))
mkdirSync(join(dest, 'herdr-plugin'), { recursive: true })
writeFileSync(join(dest, 'herdr-plugin/herdr-plugin.toml'), plugin)

const commit = execFileSync('git', ['-C', kit, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const dirty = execFileSync('git', ['-C', kit, 'status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
writeFileSync(
  join(target, 'agent-kit.lock.json'),
  `${JSON.stringify({ repository: 'github.com/biering/agent-kit', commit, dirty, syncedAt: new Date().toISOString() }, null, 2)}\n`,
)
console.log(`vendored agent-kit ${commit.slice(0, 8)}${dirty ? ' (uncommitted changes!)' : ''} into ${dest}`)
