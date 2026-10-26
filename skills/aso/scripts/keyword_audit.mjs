/**
 * Audit an app's App Store keyword field against the rules Apple actually applies.
 *
 *     node .agents/skills/aso/scripts/keyword_audit.mjs <path to store.config.json> [locale]
 *
 * Without a locale it audits every locale under `apple.info`.
 *
 * The keyword field is 100 characters and invisible to users. Almost all of the
 * ways it gets wasted are mechanical, so they are worth checking rather than
 * eyeballing:
 *
 *   - Apple already indexes the app name and the subtitle. A word repeated
 *     from either buys nothing and costs its own length.
 *   - Plurals and stems count as the same word, so "tracker" and "trackers"
 *     are one keyword taking two slots.
 *   - The separator is a comma with no space. Every space beside a comma, or
 *     at either end of the field, is one character of the 100 spent on nothing.
 *   - The description is not indexed on the App Store at all. Keywords written
 *     into prose there do nothing for search.
 *
 * Exits 1 when it finds waste, so it can gate a metadata push, and 2 when it
 * could not audit at all (no file, no listing, unknown locale).
 */
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Apple's hard limit on the keyword field, in characters. */
export const KEYWORD_LIMIT = 100

/** Apple's hard limit on the subtitle, in characters. */
export const SUBTITLE_LIMIT = 30

/**
 * Crude English stemmer, deliberately.
 *
 * Apple's own matching is fuzzier than this, so the aim is to catch the
 * obvious collisions (plural, -es, -ing) without inventing false ones. A word
 * this misses is a missed warning, not a wrong edit. It knows no German
 * inflection: "kredit" and "kredite" pass, and are yours to catch.
 *
 * @param {string} w
 * @returns {string}
 */
export function stem(w) {
  return w
    .toLowerCase()
    .replace(/(ies)$/, 'y')
    .replace(/(sses|shes|ches|xes)$/, (m) => m.slice(0, -2))
    .replace(/([^s])s$/, '$1')
    .replace(/(ing|ed)$/, '')
}

/** The endings `stem` strips, as they appear on a word that keeps its stem whole. */
const INFLECTIONS = ['', 's', 'es', 'ing', 'ed']

/**
 * Whether `word` is `base` plus nothing or one plural/inflection ending
 * ("rechner" to "rechners", "property" to "properties").
 *
 * @param {string} word
 * @param {string} base
 * @returns {boolean}
 */
export function isInflectionOf(word, base) {
  return (
    INFLECTIONS.some((suffix) => word === base + suffix) ||
    (base.endsWith('y') && word === `${base.slice(0, -1)}ies`)
  )
}

/** The shortest shared stem that makes an in-field collision certain rather than likely. */
export const CERTAIN_STEM_LENGTH = 4

/**
 * Whether two keywords that stem alike are certainly one word to Apple.
 *
 * The stemmer is English and blunt, so a shared stem alone proves little:
 * "kurs" and "kur" share "kur", "eis" and "ei" share "ei", "ring" and "red"
 * both collapse to "r", and none of those pairs is one word. A collision is
 * certain only when the stem is a real word's length and each keyword is that
 * stem plus one ending. Anything weaker is a note, not a failed push.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function isCertainStemCollision(a, b) {
  const shared = stem(a)
  return (
    shared === stem(b) &&
    shared.length >= CERTAIN_STEM_LENGTH &&
    isInflectionOf(a.toLowerCase(), shared) &&
    isInflectionOf(b.toLowerCase(), shared)
  )
}

/**
 * The lowercased words of a field. Letters of any script: an ASCII class
 * splits "Tilgungspläne" at the umlaut and sees no Japanese at all.
 *
 * @param {string | undefined} s
 * @returns {string[]}
 */
export function words(s) {
  return (s ?? '').toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []
}

/**
 * The keyword field as Apple receives it. Apple's field is one comma-separated
 * string; `eas metadata` takes an array and joins it.
 *
 * @param {{ keywords?: string | string[] }} info
 * @returns {string}
 */
export function keywordField(info) {
  return Array.isArray(info.keywords) ? info.keywords.join(',') : (info.keywords ?? '')
}

/**
 * @typedef {{ severity: 'fail' | 'warn', rule: string, message: string }} Finding
 */

/**
 * Audit one locale's listing. Pure: takes the `apple.info[locale]` object.
 *
 * Two severities, because certainty differs. An exact repeat of a word from the
 * title or subtitle is waste, full stop. A stem-only collision ("listings"
 * against a subtitle's "listing") is
 * probably waste: Apple stems, but how far is not published, so it is reported
 * as a judgement call rather than a defect. Overstating this is how a tool
 * talks someone out of a keyword that was actually earning.
 *
 * @param {{ title?: string, subtitle?: string, keywords?: string | string[] }} info
 * @returns {{ raw: string, terms: string[], findings: Finding[], fails: Finding[] }}
 */
export function auditKeywords(info) {
  const raw = keywordField(info)
  const terms = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const exactElsewhere = new Map()
  const stemElsewhere = new Map()
  for (const [field, text] of [
    ['title', info.title],
    ['subtitle', info.subtitle],
  ]) {
    for (const w of words(text)) {
      if (!exactElsewhere.has(w)) exactElsewhere.set(w, field)
      if (!stemElsewhere.has(stem(w))) stemElsewhere.set(stem(w), { field, word: w })
    }
  }

  /** @type {Finding[]} */
  const findings = []
  const note = (severity, rule, message) => findings.push({ severity, rule, message })

  // 1. Length.
  if (raw.length > KEYWORD_LIMIT) {
    note('fail', 'length', `keyword field is ${raw.length} chars, over the ${KEYWORD_LIMIT} limit; it will be rejected`)
  }

  // 2. Spaces beside a comma or at either end. The array form leaks them too:
  // "cashflow " joins to "cashflow ,kaufpreis".
  const spaces = (raw.match(/^\s+|\s+$|\s+(?=,)|(?<=,)\s+/g) ?? []).join('').length
  if (spaces > 0) {
    note(
      'fail',
      'comma-space',
      `${spaces} space(s) beside a comma or at the ends of the field, wasting ${spaces} of the ${KEYWORD_LIMIT} characters`,
    )
  }

  // 3. Words already indexed by the title or subtitle.
  for (const term of terms) {
    for (const w of words(term)) {
      const exact = exactElsewhere.get(w)
      if (exact) {
        note('fail', 'indexed-elsewhere', `"${w}" (in "${term}") is already in the ${exact}; repeating it buys nothing`)
        continue
      }
      const near = stemElsewhere.get(stem(w))
      if (near) {
        note(
          'warn',
          'stem-elsewhere',
          `"${w}" (in "${term}") stems to the ${near.field}'s "${near.word}". Apple stems, so this ` +
            'is probably covered already: worth spending those characters elsewhere',
        )
      }
    }
  }

  // 4. Collisions inside the field itself.
  const seen = new Map()
  for (const term of terms) {
    for (const w of words(term)) {
      const s = stem(w)
      const first = seen.get(s)
      if (first && first !== w) {
        if (isCertainStemCollision(w, first)) {
          note('fail', 'stem-duplicate', `"${w}" and "${first}" stem to the same word; Apple treats them as one`)
        } else {
          note('warn', 'stem-near', `"${w}" and "${first}" may stem to the same word; keep both only if they are different words`)
        }
      } else if (first === w) {
        note('fail', 'repeat', `"${w}" appears more than once in the keyword field`)
      } else {
        seen.set(s, w)
      }
    }
  }

  // 5. Unused headroom. Only worth saying once there is a real amount left.
  const spare = KEYWORD_LIMIT - raw.length
  if (spare >= 10) {
    note('warn', 'headroom', `${spare} of ${KEYWORD_LIMIT} characters unused: room for roughly ${Math.floor(spare / 9)} more term(s)`)
  }

  // 6. Subtitle length, which is the other hard limit people miss.
  if ((info.subtitle ?? '').length > SUBTITLE_LIMIT) {
    note('fail', 'subtitle-length', `subtitle is ${info.subtitle.length} chars, over Apple's ${SUBTITLE_LIMIT}`)
  }

  return { raw, terms, findings, fails: findings.filter((f) => f.severity === 'fail') }
}

/**
 * Audit a `store.config.json` on disk.
 *
 * @param {string} file path to the config
 * @param {string} [locale] one locale; every locale under `apple.info` when omitted
 * @returns {{ status: 0 | 1 | 2, error?: string, file: string, locales: Array<{ locale: string, info: object } & ReturnType<typeof auditKeywords>> }}
 *   status 0 is clean, 1 is waste found, 2 is "could not audit" with `error` set
 */
export function auditFile(file, locale) {
  const unusable = (error) => ({ status: 2, error, file, locales: [] })
  let config
  try {
    config = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return unusable(error.code === 'ENOENT' ? `no such file: ${file}` : `cannot read ${file}: ${error.message}`)
  }
  const listing = config?.apple?.info
  if (!listing || typeof listing !== 'object' || Object.keys(listing).length === 0) {
    return unusable(`no apple.info in ${file}`)
  }
  if (locale && !(locale in listing)) return unusable(`no apple.info["${locale}"] in ${file}`)

  const keys = locale ? [locale] : Object.keys(listing)
  const broken = keys.find((key) => !listing[key] || typeof listing[key] !== 'object' || Array.isArray(listing[key]))
  if (broken) return unusable(`apple.info["${broken}"] is not an object in ${file}`)

  const locales = keys.map((key) => ({
    locale: key,
    info: listing[key],
    ...auditKeywords(listing[key]),
  }))
  return { status: locales.some((l) => l.fails.length > 0) ? 1 : 0, file, locales }
}

/**
 * The report `main` prints for one audited locale.
 *
 * @param {string} file
 * @param {ReturnType<typeof auditFile>['locales'][number]} result
 * @returns {string}
 */
export function formatReport(file, { locale, info, raw, terms, findings }) {
  const lines = [
    '',
    `keyword audit  ${file} [${locale}]`,
    '',
    `  title     ${info.title ?? '(unset)'}`,
    `  subtitle  ${info.subtitle ?? '(unset)'}  (${(info.subtitle ?? '').length}/${SUBTITLE_LIMIT})`,
    `  keywords  ${raw}`,
    `            ${raw.length}/${KEYWORD_LIMIT} characters, ${terms.length} term(s)`,
    '',
  ]
  if (findings.length === 0) lines.push('  nothing wasted')
  for (const f of findings) lines.push(`  ${f.severity === 'fail' ? 'waste' : 'note '}  ${f.message}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {number} the exit status
 */
export function main(argv) {
  const [file, locale] = argv
  if (!file) {
    console.error('usage: keyword_audit.mjs <store.config.json> [locale]')
    return 2
  }
  const result = auditFile(file, locale)
  if (result.error) {
    console.error(result.error)
    return result.status
  }
  for (const l of result.locales) console.log(formatReport(file, l))
  return result.status
}

// realpath: the skill is also reachable through .claude/skills and .codex/skills, and a guard that
// compared the symlink's path with this file's would make that call a silent no-op
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)))
}
