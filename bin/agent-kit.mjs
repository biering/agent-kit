#!/usr/bin/env node
/**
 * agent-kit: the CEO agent and its tools, for any repo that vendors this kit.
 *
 *   agent-kit linear …        Linear human-in-the-loop inbox and work queue
 *   agent-kit herdr …         sessions, workers and the CEO as herdr panes
 *   agent-kit ceo-schedule …  the daily run (launchd)
 *   agent-kit stats …         daily numbers for Claude Code and Cursor
 *   agent-kit mail …          the agents' AgentMail inbox
 *   agent-kit daylog collect  one UTC day of a repo as a compact digest (daily-log skill)
 *   agent-kit migrations      check changed schema files against the data-schema rules
 *   agent-kit sync <repo>     vendor this kit into a repo (run from the kit's checkout)
 *
 * Each command is a module in src/ that reads its own arguments; this file
 * only picks it. Repo specifics come from the repo's agent-kit.config.json.
 */
const COMMANDS = {
  linear: '../src/linear.mjs',
  herdr: '../src/herdr.mjs',
  'ceo-schedule': '../src/ceo-schedule.mjs',
  stats: '../src/agent-stats.mjs',
  mail: '../src/agentmail.mjs',
  daylog: '../src/daylog.mjs',
  migrations: '../src/migrations.mjs',
  sync: '../src/sync.mjs',
}

const cmd = process.argv[2]
if (!COMMANDS[cmd]) {
  console.error(`agent-kit <${Object.keys(COMMANDS).join('|')}> …`)
  process.exit(cmd ? 1 : 0)
}
// The module sees its own arguments where it expects them, at argv[2].
process.argv.splice(2, 1)
await import(new URL(COMMANDS[cmd], import.meta.url).href)
