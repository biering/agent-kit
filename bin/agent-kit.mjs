#!/usr/bin/env node
/**
 * agent-kit: the CEO agent and its tools, for any repo that vendors this kit.
 *
 *   agent-kit linear …        Linear human-in-the-loop inbox and work queue
 *   agent-kit herdr …         sessions, workers and the CEO as herdr panes
 *   agent-kit ceo-schedule …  the daily run (launchd)
 *   agent-kit stats …         daily numbers for Claude Code and Cursor
 *   agent-kit mail …          the agents' AgentMail inbox
 *   agent-kit daylog collect  one UTC day of a repo as a compact digest, with a per-product Stats block (daily-log skill)
 *   agent-kit migrations      check changed schema files against the data-schema rules
 *   agent-kit review …        the design review gate: the herdr pane, approve to build, send back
 *   agent-kit plan-review …   a plan or an OpenSpec change to the owner in Plannotator, over his tailnet
 *   agent-kit spec archive    archive a shipped OpenSpec change, never one with unticked tasks
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
  review: '../src/review.mjs',
  'plan-review': '../src/plan-review.mjs',
  spec: '../src/spec.mjs',
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
