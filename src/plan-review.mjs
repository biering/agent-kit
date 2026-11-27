#!/usr/bin/env node
/**
 * A plan or an OpenSpec change to the owner for approval, in Plannotator over his tailnet
 * (README "Plan review").
 *
 *   agent-kit plan-review <plan.md | openspec/changes/<name>>    install if needed, open the gated review, wait
 *   agent-kit plan-review <…> --detach <prefix>    the same in a session of its own; returns once the page is up
 *   agent-kit plan-review --install     install the pinned Plannotator if needed, configure this machine
 *   agent-kit plan-review --status      Plannotator's version and the tailnet's state; installs nothing
 *
 * A change folder is reviewed as one document: proposal, specs, design, tasks, titled with the
 * change id. Exit codes of a review come from the decision: 0 approved, 1 feedback (the decision
 * JSON on stdout), 2 the review could not start or left no decision, 3 dismissed. With --detach the
 * command exits 0 once the page is up and the review's own code lands in <prefix>.exit; 4 when no
 * address came within 90 s (the review keeps running).
 *
 * Machine-wide like `review`: it needs no agent-kit.config.json.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PLANNOTATOR_VERSION,
  binary,
  changeDocument,
  detach,
  gatedReview,
  install,
  isChange,
  planTitle,
  tailnetReady,
  tailscaleStatus,
  withoutDetach,
} from './lib/plan-review.mjs'

const KIT = fileURLToPath(new URL('../bin/agent-kit.mjs', import.meta.url))

/** The usage comment at the top of this file, without the shebang and the comment markers. */
function usage() {
  return fs
    .readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('*/')[0]
    .split('\n')
    .slice(2)
    .map((line) => line.replace(/^ \* ?/, ''))
    .join('\n')
    .trimEnd()
}

function status() {
  const found = binary()
  const state = !found ? 'not installed' : found.version === PLANNOTATOR_VERSION ? found.path : `mismatch (${found.path})`
  console.log(`plannotator ${found?.version ?? '-'} (pinned ${PLANNOTATOR_VERSION}): ${state}`)
  console.log(`Tailscale: ${tailnetReady(tailscaleStatus()) ? 'on the tailnet, HTTPS serve available' : 'not ready'}`)
}

/** Review a plan file, or a change folder assembled into one file for as long as the review runs. */
function review(target) {
  const absolute = path.resolve(target)
  if (!fs.existsSync(absolute)) throw new Error(`No plan or change at ${absolute}`)
  if (fs.statSync(absolute).isDirectory()) {
    if (!isChange(absolute)) throw new Error(`${absolute} is not an OpenSpec change folder (no proposal.md)`)
    const { title, markdown } = changeDocument(absolute)
    const bin = install()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-review-change-'))
    try {
      const file = path.join(dir, `${title}.md`)
      fs.writeFileSync(file, markdown)
      return gatedReview(bin, file, { title })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
  const bin = install()
  return gatedReview(bin, absolute, { title: planTitle(fs.readFileSync(absolute, 'utf8'), path.basename(absolute)) })
}

try {
  const { prefix, argv } = withoutDetach(process.argv.slice(2))
  const [first] = argv
  if (prefix) process.exitCode = await detach(KIT, ['plan-review', ...argv], prefix)
  else if (!first || first === '--help' || first === '-h') console.log(usage())
  else if (first === '--install') install()
  else if (first === '--status') status()
  else process.exitCode = review(first)
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
