/**
 * agent-kit daylog collect [--date YYYY-MM-DD] [--budget <tokens>]
 *
 * Prints a compact digest of one UTC day (default: yesterday) for the daily-log skill.
 * No model runs here: this is the cheap, deterministic half of the routine.
 */
import { config, main } from './config.mjs'
import { collect } from './lib/daylog.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
if (args[0] !== 'collect') {
  console.error('agent-kit daylog collect [--date YYYY-MM-DD] [--budget <tokens>]')
  process.exit(args[0] ? 1 : 0)
}
const date = flag('--date') ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
try {
  process.stdout.write(
    collect({ repoDir: main, date, config: { name: config.name, owner: config.linear.owner, daylog: config.daylog }, budgetTokens: flag('--budget') !== undefined ? Number(flag('--budget')) : undefined }),
  )
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
