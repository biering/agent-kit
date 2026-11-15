#!/usr/bin/env node
// Checks a PR body file against the pr skill's budget. Prints problems, exits 1 when there are any.
// Usage: node pr-body-check.mjs <body.md>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const HEAD_BUDGET = 150 // Benefit + Review focus, in words
export const BODY_BUDGET = 300 // whole body, in words
const OPTIONAL = /^(changed|what changed|verified|test plan|needs a human|notes?)\b/i
const FOOTER = /^(🤖|co-authored-by:|generated with)/i

const words = (s) => (s.match(/\S+/g) ?? []).length

/** @param {string} body @returns {string[]} problems, empty when the body fits the budget */
export function checkBody(body) {
  const problems = []
  const lines = String(body).split('\n').filter((l) => !FOOTER.test(l.trim()))
  const heads = []
  let current = null
  let preface = []
  for (const line of lines) {
    const h = line.match(/^#{1,4}\s*(.+?)\s*$/)
    if (h) {
      current = { name: h[1], text: [] }
      heads.push(current)
    } else if (current) current.text.push(line)
    else preface.push(line)
  }
  const get = (re) => heads.find((h) => re.test(h.name))
  const benefit = get(/^benefits?\b/i)
  const focus = get(/^review focus\b/i)
  if (!benefit) problems.push('missing "## Benefit"')
  if (!focus) problems.push('missing "## Review focus"')

  // Everything before the first optional heading is the head of the body.
  const firstOptional = heads.findIndex((h) => OPTIONAL.test(h.name))
  const headSection = heads.slice(0, firstOptional === -1 ? heads.length : firstOptional)
  const head = words([...preface, ...headSection.flatMap((h) => h.text)].join(' '))
  if (head > HEAD_BUDGET) problems.push(`Benefit and Review focus are ${head} words; the budget is about 120 (hard cap ${HEAD_BUDGET})`)
  const total = words(lines.join(' '))
  if (total > BODY_BUDGET) problems.push(`body is ${total} words; the cap is ${BODY_BUDGET}`)

  if (focus) {
    const bullets = focus.text.filter((l) => /^\s*(?:[-*]|\d+\.)\s/.test(l))
    if (bullets.length < 1 || bullets.length > 3) problems.push(`Review focus has ${bullets.length} bullets; use 1 to 3`)
    if (!bullets.some((b) => /[\w./-]+\.\w+:\d+|[\w./-]+\.\w+/.test(b))) problems.push('Review focus names no path:line')
  }
  const changed = get(/^(what )?changed\b/i)
  if (changed) {
    const n = changed.text.filter((l) => /^\s*(?:[-*]|\d+\.)\s/.test(l)).length
    if (n > 5) problems.push(`Changed has ${n} bullets; at most 5`)
  }
  if (/[—–]/.test(body)) problems.push('contains an em or en dash; use a comma, colon or a new sentence')
  return problems
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: pr-body-check.mjs <body.md>')
    process.exit(2)
  }
  const problems = checkBody(readFileSync(file, 'utf8'))
  if (problems.length === 0) console.log('pr body: ok')
  else {
    for (const p of problems) console.log(`pr body: ${p}`)
    process.exit(1)
  }
}
