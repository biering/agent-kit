#!/usr/bin/env node
/**
 * Check an ad brief (templates/brief.md of the ad-creative skill) before writing and before launch.
 *
 *   node brief_check.mjs <brief.md> [--launch] [--today YYYY-MM-DD] [--json]
 *
 * Fails (exit 1) on:
 *   - a premise without a fact, a source or an as-of date, a source that is existing copy or hearsay
 *     ("landing page", "headline", "chat"), an as-of date in the future, a duplicate
 *     id, no premises at all; with --launch, a premise read more than 7 days ago;
 *   - an empty target field, an unknown awareness level, ad format or risk, buyer's words without a link;
 *   - an empty element of the 17 ("missing: ..." and "TBD: ..." count as empty), "n/a" without a reason;
 *   - a cited premise ([P3]) that the table does not hold;
 *   - per clause (split at ";", ". " and list items): a number, an urgency word or a proof word
 *     without a cited premise in that same clause; urgency whose cited premises hold no date;
 *   - anchoring or risk reversal that cites no premise;
 *   - a deadline in gain now or loss later (or in the premises they cite) that has passed;
 *   - a feature not tagged with its lever (odds, dream, effort, time);
 *   - an empty writing or batch field; urgency or proof in the mini-blocks, the CTA or the script
 *     without a premise;
 *   - with --launch, an unticked launch check.
 * Warns (exit 0) on likely health claims, a question that asserts the reader's condition, and a
 * format asked to carry more than it can.
 *
 * It cannot tell whether a cited premise supports the claim, or spot a third-party character or
 * brand: those are the launch checks, read by a person.
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
export const CARRY = { 'video-6s': 5, post: 6, search: 6, static: 8, 'video-15-30s': 11, carousel: 12, 'video-30-90s': 17 }
export const RISK = ['conservative', 'moderate', 'aggressive']
const LEVERS = ['odds', 'dream', 'effort', 'time']
const MUST_CITE = ['Anchoring', 'Risk reversal']
const DEADLINES = ['Gain now', 'Loss later']
const LAUNCH_FRESH_DAYS = 7

const CITE = /\[(P\d+)\]/g
const PLACEHOLDER = /^(?:|<[^>]*>|todo|tbd|tba|\?+|\.{2,}|…|-+)$/i
const MISSING = /^(?:missing|todo|tbd|tba|unknown|fehlt|offen)\b/i
const NOT_A_SOURCE = /\b(?:landing page|homepage|website copy|marketing|headline|old ad|our ad|ad copy|chat|said so|from memory|everyone knows)\b/i
const NA = /^n\/a\b\s*:?\s*(.*)$/i
const ISO = /\b(\d{4}-\d{2}-\d{2})\b/g
const DATE = /\b\d{4}-\d{2}-\d{2}\b/ // ISO without the global flag, for .test()
const NUMBER = /\d/
const words = (list) => new RegExp(`(?:^|[^\\p{L}])(?:${list.join('|')})(?![\\p{L}])`, 'iu')
export const URGENCY = words([
  'limited', 'only today', 'today only', 'today', 'tonight', 'this week', 'last chance', 'ends?', 'ending', 'expires?',
  'hurry', 'running out', '\\d+ left', 'left in stock', 'sold out', 'deadline', 'countdown', 'while stocks last',
  'price goes up', 'until', 'nur heute', 'heute', 'diese woche', 'ab morgen', 'begrenzt', 'letzte chance', 'endet',
  'läuft ab', 'nur noch \\d+', 'ausverkauft', 'solange der vorrat reicht', 'frist', 'bald teurer',
])
export const PROOF = words([
  // plural "reviews": "a client review" is a meeting, "4,000 reviews" is proof
  'reviews', 'rated', 'ratings?', 'stars', 'five-star', '5-star', 'users', 'customers', 'downloads', 'testimonials?',
  '#1', 'best-?selling', 'bestseller', 'trusted by', 'loved by', 'thousands', 'millions', 'bewertungen', 'nutzer',
  'nutzerinnen', 'kunden', 'kundinnen', 'sterne', 'tausende', 'millionen', 'zufriedene?n?',
])
const HEALTH = words([
  'cure[sd]?', 'heals?', 'therapy', 'therapeutic', 'diagnos\\w*', 'anxiety', 'depression', 'insomnia', 'adhd', 'burnout',
  'stress-free', 'less stress', 'better sleep', 'sleep better', 'symptoms?', 'heilt', 'heilung', 'angst', 'schlafen',
  'besser schlafen', 'stressfrei', 'therapie',
])
const ATTRIBUTE = /(?:^|[.;!?]\s*)(?:are you|got|struggling with|do you (?:have|suffer)|bist du|sind sie|hast du|haben sie|leidest du|leiden sie)\b[^?]*\?/i

const strip = (value) => value.replace(/<!--[\s\S]*?-->/g, '').trim()
const empty = (value) => PLACEHOLDER.test(strip(value)) || MISSING.test(strip(value))
const first = (value) => (value ?? '').split('(')[0].trim().toLowerCase().replace(/\s+/g, '-')
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

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
    else if (line.trim()) current = null
  }
  return out
}

const text = (field) => [field?.value ?? '', ...(field?.more ?? [])].join(' ').trim()

/** The clauses a claim check runs on: list items, then sentences and ";" parts. */
export function clauses(field) {
  const items = [field?.value ?? '', ...(field?.more ?? [])].filter(Boolean)
  return items.flatMap((item) => item.split(/;\s+|(?<=[.!?])\s+(?=\S)/)).map((part) => part.trim()).filter(Boolean)
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

export function checkBrief(brief, { launch = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const errors = []
  const warnings = []
  const parts = sections(brief)

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
    else if (NOT_A_SOURCE.test(row.source)) errors.push(`Premises: ${row.id}: "${row.source}" is not a source; existing copy and what someone said are leads, read the fact where it lives`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.asOf)) errors.push(`Premises: ${row.id} needs an as-of date (YYYY-MM-DD)`)
    else if (row.asOf > today) errors.push(`Premises: ${row.id} is dated ${row.asOf}, after today (${today})`)
    else if (launch && daysBetween(row.asOf, today) > LAUNCH_FRESH_DAYS) {
      errors.push(`Premises: ${row.id} was read ${row.asOf}; read it again before launch (at most ${LAUNCH_FRESH_DAYS} days old)`)
    }
  }
  if (parts.Premises && known.size === 0) errors.push('Premises: no premise with a source; an ad with no facts has nothing to say')

  const citesOf = (value, where) => {
    const ids = [...value.matchAll(CITE)].map((match) => match[1])
    for (const id of ids) if (!known.has(id)) errors.push(`${where}: cites [${id}], which Premises does not hold`)
    return ids.filter((id) => known.has(id))
  }
  // A premise that can carry urgency says something ends, and when.
  const datedFacts = (ids) => ids.map((id) => known.get(id).fact).filter((fact) => URGENCY.test(fact) && DATE.test(fact))

  /** Number, urgency and proof, each needing a premise in its own clause. */
  const claimCheck = (field, where, { numbers = true } = {}) => {
    for (const clause of clauses(field)) {
      const cites = citesOf(clause, where)
      const bare = clause.replace(CITE, '')
      const quote = clause.length > 60 ? `${clause.slice(0, 57)}...` : clause
      if (numbers && !cites.length && NUMBER.test(bare)) errors.push(`${where}: a number without a premise in the same clause: "${quote}"`)
      if (URGENCY.test(bare)) {
        if (!cites.length) errors.push(`${where}: urgency without the premise that makes it true: "${quote}"`)
        else if (!datedFacts(cites).length && !DATE.test(bare)) errors.push(`${where}: urgency, but no cited premise holds an end date: "${quote}"`)
      }
      if (!cites.length && PROOF.test(bare)) errors.push(`${where}: proof (reviews, users, ratings) without a premise in the same clause: "${quote}"`)
      if (HEALTH.test(bare)) warnings.push(`${where}: reads like a health claim, which this skill never makes: "${quote}"`)
      if (ATTRIBUTE.test(bare)) warnings.push(`${where}: a question that may assert the reader's condition (personal attributes): "${quote}"`)
    }
  }

  // Target
  const target = fields(parts.Target)
  if (!parts.Target) errors.push('Target: section missing')
  for (const name of TARGET) if (empty(text(target[name]))) errors.push(`Target: ${name} is empty`)
  const awareness = first(target.Awareness?.value)
  if (!empty(text(target.Awareness)) && !AWARENESS.includes(awareness)) errors.push(`Target: Awareness "${awareness}" is not one of ${AWARENESS.join(', ')}`)
  const format = first(target['Ad format']?.value)
  if (!empty(text(target['Ad format'])) && !(format in CARRY)) errors.push(`Target: Ad format "${format}" is not one of ${Object.keys(CARRY).join(', ')}`)
  const buyer = text(target["Buyer's words"])
  if (!empty(buyer) && !/https?:\/\//.test(buyer)) errors.push("Target: Buyer's words need the link they came from")

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
      const value = text(field)
      if (empty(value)) {
        errors.push(`${where} is empty (write it, or "n/a: <reason>"; a fact we lack is a question for the user)`)
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
      // The Format element describes the asset ("40-second"), so its digits are not claims.
      claimCheck(field, where, { numbers: name !== 'Format' })
      const cites = citesOf(value, where)
      if (MUST_CITE.includes(name) && !cites.length) errors.push(`${where}: cites no premise; say only what the premises hold, or "n/a: <reason>"`)
      if (DEADLINES.includes(name)) {
        const dates = new Set([value.replace(CITE, ''), ...datedFacts(cites)].flatMap((t) => [...t.matchAll(ISO)].map((m) => m[1])))
        for (const date of dates) if (date < today) errors.push(`${where}: the date ${date} has passed (today ${today})`)
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

  // Writing: the reference gives structure; the CTA and the script are what ships, so they are checked too
  const writing = fields(parts.Writing)
  if (!parts.Writing) errors.push('Writing: section missing')
  const why = { 'Reference ad': 'it gives the order and the rhythm', 'Mini-blocks': 'the reference cut into blocks by job', CTA: 'one wording, repeated by the landing page' }
  for (const [name, reason] of Object.entries(why)) if (empty(text(writing[name]))) errors.push(`Writing: ${name} is empty (${reason})`)
  for (const name of ['Mini-blocks', 'CTA', 'Script']) if (writing[name] && !empty(text(writing[name]))) claimCheck(writing[name], `Writing: ${name}`, { numbers: name === 'CTA' })

  const batch = fields(parts.Batch)
  if (!parts.Batch) errors.push('Batch: section missing')
  for (const name of ['Risk', 'Bets', 'Variable']) if (empty(text(batch[name]))) errors.push(`Batch: ${name} is empty`)
  const risk = first(batch.Risk?.value)
  if (!empty(text(batch.Risk)) && !RISK.includes(risk)) errors.push(`Batch: Risk "${risk}" is not one of ${RISK.join(', ')}`)

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
  const todayIndex = args.indexOf('--today')
  const today = todayIndex >= 0 ? args[todayIndex + 1] : undefined
  const file = args.find((arg, index) => !arg.startsWith('--') && index !== todayIndex + 1)
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
