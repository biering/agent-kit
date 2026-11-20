#!/usr/bin/env node
/**
 * Check an ad brief (templates/brief.md of the ad-creative skill) before writing and before launch.
 *
 *   node brief_check.mjs <brief.md> [--launch] [--today YYYY-MM-DD] [--json]
 *
 * Fails (exit 1) on:
 *   - a premise without a source or an as-of date, a duplicate premise id, no premises at all;
 *   - an empty target field, an unknown awareness level or ad format, buyer's words without a link;
 *   - an empty element of the 17, or "n/a" without a reason;
 *   - a cited premise ([P3]) that the table does not hold;
 *   - a number, an urgency word or a proof word in an element that cites no premise;
 *   - anchoring or an impulse element (risk reversal, gain now, loss later) that cites no premise;
 *   - a loss-later deadline that has passed;
 *   - a feature not tagged with its lever (odds, dream, effort, time);
 *   - an empty writing or batch field, an unknown risk level;
 *   - with --launch, an unticked launch check.
 * Warns (exit 0) on likely health claims and on a format asked to carry more than it can.
 *
 * Stdlib only. The rules are the skill's hard rules; fix the brief, not the check.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ELEMENTS = [
  ['Content sale', ['Format', 'Topic', 'Concept', 'Visual hook', 'Copy hook']],
  ['Hope sale', ['Identification', 'Point of contact', 'Problem mechanism', 'Function mechanism', 'Solution mechanism', 'Conditions']],
  ['Value sale', ['USP', 'Features', 'Anchoring']],
  ['Impulse sale', ['Risk reversal', 'Gain now', 'Loss later']],
]
export const TARGET = ['Market', 'Segment', 'Avatar', 'Awareness', 'Placement', 'Ad format', "Buyer's words", 'Research']
export const AWARENESS = ['unaware', 'problem-aware', 'solution-aware', 'product-aware', 'most-aware']
/** How many of the 17 elements a format can carry (references/elements.md, "What a format can carry"). */
export const CARRY = { 'video-6s': 5, post: 6, static: 8, search: 6, 'video-15-30s': 11, carousel: 12, 'video-30-90s': 17 }
export const RISK = ['conservative', 'moderate', 'aggressive']
const LEVERS = ['odds', 'dream', 'effort', 'time']
const MUST_CITE = ['Anchoring', 'Risk reversal', 'Gain now', 'Loss later']
const HOPE = ELEMENTS[1][1]

const CITE = /\[(P\d+)\]/g
const PLACEHOLDER = /^(?:|<[^>]*>|todo|tbd|tba|\?+|\.{2,}|…|-+)$/i
const NA = /^n\/a\b\s*:?\s*(.*)$/i
const ISO = /\b(\d{4}-\d{2}-\d{2})\b/g
const NUMBER = /\d/
const URGENCY = new RegExp(
  [
    'limited', 'only today', 'today only', 'last chance', '\\bends?\\b', 'ending', 'expires?', 'hurry', 'running out',
    '\\bleft\\b', 'sold out', 'deadline', 'countdown', 'while stocks', 'nur heute', 'begrenzt', 'letzte chance',
    'endet', 'läuft ab', 'nur noch', 'ausverkauft', 'solange', 'frist',
  ].join('|'),
  'i',
)
const PROOF = new RegExp(
  [
    // plural "reviews": "a client review" is a meeting, "4,000 reviews" is proof
    '\\breviews\\b', '\\brated\\b', '\\bratings?\\b', '\\bstars\\b', '\\busers\\b', '\\bcustomers\\b', '\\bdownloads\\b',
    'testimonials?', '#1', 'best-?selling', 'bestseller', 'trusted by', 'bewertungen', 'nutzer', 'kunden', 'sterne',
  ].join('|'),
  'i',
)
const HEALTH = /\b(?:cure[sd]?|heal|therap|diagnos|anxiety|depress|insomnia|adhd|burnout|stress-free|less stress|better sleep|symptom|heil|angst|schlaf|stressfrei)/i

const strip = (value) => value.replace(/<!--[\s\S]*?-->/g, '').trim()
const empty = (value) => PLACEHOLDER.test(strip(value))

/** Split the brief into sections (by "## ") holding their raw lines. */
export function sections(text) {
  const out = {}
  let current = null
  for (const line of strip(text).split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      current = heading[1]
      out[current] = []
    } else if (current) out[current].push(line)
  }
  return out
}

/** "- Name: value" fields of a section; indented lines below a field continue it. */
export function fields(lines = []) {
  const out = {}
  let current = null
  for (const line of lines) {
    const field = line.match(/^- ([^:[\]]+?):\s*(.*)$/)
    if (field) {
      current = field[1].trim()
      out[current] = { value: field[2].trim(), more: [] }
    } else if (current && /^\s+\S/.test(line)) out[current].more.push(line.trim())
    else if (!line.trim() || line.startsWith('|') || line.startsWith('#')) current = line.trim() ? null : current
  }
  return out
}

/** Premise rows: | P1 | fact | source | as of |. */
export function premises(lines = []) {
  return lines
    .filter((line) => /^\|\s*P\d*\s*\|/.test(line))
    .map((line) => {
      const [id, fact, source, asOf] = line.split('|').slice(1, -1).map((cell) => cell.trim())
      return { id, fact: fact ?? '', source: source ?? '', asOf: asOf ?? '' }
    })
}

export function checkBrief(text, { launch = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const errors = []
  const warnings = []
  const parts = sections(text)

  // Premises
  const rows = premises(parts.Premises)
  const known = new Map()
  if (!parts.Premises) errors.push('Premises: section missing')
  for (const row of rows) {
    if (!/^P\d+$/.test(row.id)) errors.push(`Premises: row "${row.id}" needs an id like P1`)
    else if (known.has(row.id)) errors.push(`Premises: ${row.id} is listed twice`)
    if (empty(row.fact) && empty(row.source) && empty(row.asOf)) {
      errors.push(`Premises: ${row.id || 'a row'} is empty`)
      continue
    }
    known.set(row.id, row)
    if (empty(row.fact)) errors.push(`Premises: ${row.id} has no fact`)
    if (empty(row.source)) errors.push(`Premises: ${row.id} has no source`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.asOf)) errors.push(`Premises: ${row.id} needs an as-of date (YYYY-MM-DD)`)
  }
  if (parts.Premises && known.size === 0) errors.push('Premises: no premise with a source; an ad with no facts has nothing to say')

  const citesOf = (value, where) => {
    const ids = [...value.matchAll(CITE)].map((match) => match[1])
    for (const id of ids) if (!known.has(id)) errors.push(`${where}: cites [${id}], which Premises does not hold`)
    return ids
  }

  // Target
  const target = fields(parts.Target)
  if (!parts.Target) errors.push('Target: section missing')
  for (const name of TARGET) {
    const value = [target[name]?.value ?? '', ...(target[name]?.more ?? [])].join(' ')
    if (empty(value)) errors.push(`Target: ${name} is empty`)
  }
  const awareness = (target.Awareness?.value ?? '').toLowerCase()
  if (awareness && !AWARENESS.includes(awareness)) errors.push(`Target: Awareness "${awareness}" is not one of ${AWARENESS.join(', ')}`)
  const format = (target['Ad format']?.value ?? '').toLowerCase()
  if (format && !(format in CARRY)) errors.push(`Target: Ad format "${format}" is not one of ${Object.keys(CARRY).join(', ')}`)
  const words = [target["Buyer's words"]?.value ?? '', ...(target["Buyer's words"]?.more ?? [])].join(' ')
  if (!empty(words) && !/https?:\/\/|\[P\d+\]/.test(words)) errors.push("Target: Buyer's words need the link they came from")

  // The 17 elements
  let carried = 0
  for (const [section, names] of ELEMENTS) {
    if (!parts[section]) {
      errors.push(`${section}: section missing`)
      continue
    }
    const found = fields(parts[section])
    for (const name of names) {
      const where = `${section}: ${name}`
      const field = found[name]
      const value = [field?.value ?? '', ...(field?.more ?? [])].join(' ').trim()
      if (empty(value)) {
        errors.push(`${where} is empty (write it, or "n/a: <reason>")`)
        continue
      }
      const na = value.match(NA)
      if (na) {
        if (na[1].trim().length < 3) errors.push(`${where}: "n/a" needs a reason`)
        if (section === 'Hope sale' && ['unaware', 'problem-aware'].includes(awareness) && format === 'video-30-90s') {
          warnings.push(`${where} is n/a for a ${awareness} audience in a long video: the hope sale is what a cold reader needs`)
        }
        continue
      }
      carried++
      const cites = citesOf(value, where)
      const bare = value.replace(CITE, '')
      if (name !== 'Format') {
        if (!cites.length && NUMBER.test(bare)) errors.push(`${where}: states a number without citing a premise`)
        if (!cites.length && URGENCY.test(bare)) errors.push(`${where}: urgency without citing the premise that makes it true`)
        if (!cites.length && PROOF.test(bare)) errors.push(`${where}: proof (reviews, users, ratings) without citing a premise`)
      }
      if (MUST_CITE.includes(name) && !cites.length) errors.push(`${where}: cites no premise; say only what the premises hold, or "n/a: <reason>"`)
      if (HEALTH.test(bare)) warnings.push(`${where}: reads like a health claim, which this skill never makes`)
      if (name === 'Loss later') {
        // A deadline is a date in this element, or in a cited premise that says something ends.
        const ending = cites.map((id) => known.get(id)?.fact ?? '').filter((fact) => URGENCY.test(fact) || /\buntil\b|\bbis\b/i.test(fact))
        const dates = new Set([bare, ...ending].flatMap((text) => [...text.matchAll(ISO)].map((match) => match[1])))
        for (const date of dates) if (date < today) errors.push(`${where}: the deadline ${date} has passed (today ${today})`)
      }
      if (name === 'Features') {
        const lever = new RegExp(`^(?:-\\s*)?(?:${LEVERS.join('|')}):`, 'i')
        const items = field.more.length ? field.more : value.split(/;\s*/)
        const untagged = items.filter((item) => item && !lever.test(item.trim()))
        if (untagged.length) errors.push(`${where}: tag each feature with its lever (${LEVERS.join(', ')}); untagged: "${untagged[0]}"`)
      }
    }
  }
  if (format in CARRY && carried > CARRY[format]) {
    warnings.push(`a ${format} carries about ${CARRY[format]} elements and this brief fills ${carried}: mark the rest n/a and leave them to the landing page`)
  }

  // Writing and batch
  const writing = fields(parts.Writing)
  if (!parts.Writing) errors.push('Writing: section missing')
  const why = { 'Reference ad': 'it gives the order and the rhythm', 'Mini-blocks': 'the reference cut into blocks by job', CTA: 'one wording, repeated by the landing page' }
  for (const [name, reason] of Object.entries(why)) {
    const value = [writing[name]?.value ?? '', ...(writing[name]?.more ?? [])].join(' ')
    if (empty(value)) errors.push(`Writing: ${name} is empty (${reason})`)
  }
  const batch = fields(parts.Batch)
  if (!parts.Batch) errors.push('Batch: section missing')
  for (const name of ['Risk', 'Bets', 'Variable']) if (empty(batch[name]?.value ?? '')) errors.push(`Batch: ${name} is empty`)
  const risk = (batch.Risk?.value ?? '').toLowerCase()
  if (risk && !RISK.includes(risk)) errors.push(`Batch: Risk "${risk}" is not one of ${RISK.join(', ')}`)

  // Launch checks
  if (launch) {
    const boxes = (parts['Launch checks'] ?? []).filter((line) => /^- \[[ xX]\]/.test(line))
    if (!boxes.length) errors.push('Launch checks: section missing or empty')
    for (const box of boxes) if (/^- \[ \]/.test(box)) errors.push(`Launch checks: not ticked: ${box.slice(6)}`)
  }

  return { errors, warnings }
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const file = args.find((arg) => !arg.startsWith('--') && args[args.indexOf(arg) - 1] !== '--today')
  const todayIndex = args.indexOf('--today')
  const today = todayIndex >= 0 ? args[todayIndex + 1] : undefined
  if (!file || (todayIndex >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(today ?? ''))) {
    console.error('usage: brief_check.mjs <brief.md> [--launch] [--today YYYY-MM-DD] [--json]')
    process.exit(2)
  }
  const result = checkBrief(readFileSync(file, 'utf8'), { launch: args.includes('--launch'), ...(today ? { today } : {}) })
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2))
  else {
    for (const warning of result.warnings) console.log(`warn  ${warning}`)
    for (const error of result.errors) console.log(`FAIL  ${error}`)
    console.log(result.errors.length ? `brief_check: ${result.errors.length} problem(s) in ${file}` : `brief_check: OK ${file}`)
  }
  process.exit(result.errors.length ? 1 : 0)
}
