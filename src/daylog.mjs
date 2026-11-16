/**
 * agent-kit daylog collect [--date YYYY-MM-DD] [--budget <tokens>] [--mcp <results.json>]
 *
 * Prints a compact digest of one UTC day (default: yesterday) for the daily-log skill, led by the
 * Stats block when `daylog.stats` is configured. No model runs here: this is the cheap,
 * deterministic half of the routine. `--mcp` hands in the results of MCP reads the first run asked for.
 */
import { readFileSync } from 'node:fs'
import { config, main } from './config.mjs'
import { collect, defaultRun } from './lib/daylog.mjs'
import { collectStats } from './lib/daystats.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
if (args[0] !== 'collect') {
  console.error('agent-kit daylog collect [--date YYYY-MM-DD] [--budget <tokens>] [--mcp <results.json>]')
  process.exit(args[0] ? 1 : 0)
}
const date = flag('--date') ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
try {
  const cfg = { name: config.name, owner: config.linear.owner, daylog: config.daylog }
  const stats = config.daylog.stats
    ? await collectStats({
        repoDir: main, date, stats: config.daylog.stats, logDir: config.daylog.log, run: defaultRun,
        mcp: flag('--mcp') ? JSON.parse(readFileSync(flag('--mcp'), 'utf8')) : undefined,
      })
    : undefined
  process.stdout.write(
    collect({ repoDir: main, date, config: cfg, stats, budgetTokens: flag('--budget') !== undefined ? Number(flag('--budget')) : undefined }),
  )
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
