// What makes a carousel an experiment rather than a post: the intake, three cover variants, the
// scorecard that gates shipping, one angle per carousel and the links that carry it into analytics.
// Pure functions: render.mjs validates and gates with them, batch.mjs scaffolds with them.

/** The scorecard: criterion → points available. 20 in all; see references/scorecard.md. */
export const SCORE_CRITERIA = { hook: 4, slide2: 3, promise: 3, oneIdea: 2, legibility: 2, cta: 2, honesty: 2, platformFit: 2 }
export const SCORE_TOTAL = Object.values(SCORE_CRITERIA).reduce((a, b) => a + b, 0)
export const SHIP_SCORE = 16

/** The one thing a batch changes. Everything else stays fixed so a winner means something. */
export const DIMENSIONS = ['problem', 'audience', 'hook', 'benefit']

const INTAKE = { selling: 'what you are selling', audience: 'who it is for', action: 'the one action we want', result: 'the one real result we can show' }
const COVER_TYPES = ['cover', 'photo']
/** Slide types that can stand as a second cover: a headline-sized claim, not a detail. */
const SECOND_COVER_TYPES = ['cover', 'photo', 'stat', 'listicle', 'lettered']
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** A template's `[placeholder]` stands for a value; the placeholder gate reports it, shape checks wait. */
const isPlaceholder = (v) => typeof v === 'string' && /^\[[^\]\n]{2,}\]/.test(v.trim())
const wordCount = (text) => String(text ?? '').replace(/\*+/g, '').split(/\s+/).filter(Boolean).length

/** The four intake answers. `result` names where the number or screenshot comes from. */
export function validateIntake(intake) {
  if (!intake || typeof intake !== 'object') return ['intake must hold the four answers: selling, audience, action, result']
  const errors = Object.entries(INTAKE).flatMap(([key, what]) => {
    const v = key === 'result' ? intake.result?.text ?? intake.result : intake[key]
    return typeof v === 'string' && v.trim() ? [] : [`intake.${key} is missing: ${what}`]
  })
  const result = intake.result
  if (result && typeof result === 'object' && (!result.text || !result.source))
    errors.push('intake.result needs "text" (the true number or screenshot) and "source" (where it comes from: analytics, changelog, a file in the repo)')
  else if (typeof result === 'string') errors.push('intake.result is {text, source}: a result without a source is how numbers get invented')
  return errors
}

/** Three cover variants to render and choose from; `cover` names the pick. */
export function validateCovers(doc) {
  const errors = []
  if (doc.covers === undefined) {
    if (doc.cover !== undefined) errors.push('"cover" names one of "covers", which is missing')
    return errors
  }
  if (!Array.isArray(doc.covers) || doc.covers.length !== 3) return ['covers must be three cover variants (a different hook each), got ' + (Array.isArray(doc.covers) ? doc.covers.length : 'no list')]
  const ids = doc.covers.map((c) => c?.id)
  if (ids.some((id) => !id || typeof id !== 'string') || new Set(ids).size !== 3) errors.push('covers need three different ids (a, b, c)')
  doc.covers.forEach((c, i) => {
    if (!COVER_TYPES.includes(c?.type)) errors.push(`cover ${ids[i] ?? i + 1}: type must be ${COVER_TYPES.join(' or ')}`)
    if (c && !c.headline) errors.push(`cover ${ids[i] ?? i + 1}: missing "headline"`)
  })
  if (doc.cover !== undefined && !ids.includes(doc.cover)) errors.push(`cover "${doc.cover}" is not one of ${ids.join(', ')}`)
  return errors
}

/** The deck as posted: the chosen cover in front of the slides. Without covers, the slides as they are. */
export function resolveDeck(doc) {
  if (!Array.isArray(doc.covers)) return doc
  const pick = doc.covers.find((c) => c.id === doc.cover) ?? doc.covers[0]
  const { id, ...cover } = pick
  return { ...doc, slides: [cover, ...doc.slides] }
}

/** The cover variants as one-slide decks, to render and compare side by side. */
export const coverDecks = (doc) => (doc.covers ?? []).map(({ id, ...cover }) => ({ id, deck: { ...doc, covers: undefined, cover: undefined, slides: [cover] } }))

/** Score shape: every criterion, a whole number from 0 to its maximum, a total that adds up. */
export function validateScore(score) {
  if (score === undefined) return []
  if (!score || typeof score !== 'object') return ['score must be an object with the eight criteria and a total']
  const errors = []
  for (const [key, max] of Object.entries(SCORE_CRITERIA))
    if (!Number.isInteger(score[key]) || score[key] < 0 || score[key] > max) errors.push(`score.${key} is a whole number from 0 to ${max}`)
  for (const key of Object.keys(score)) if (key !== 'total' && key !== 'notes' && !(key in SCORE_CRITERIA)) errors.push(`score.${key} is not a criterion (${Object.keys(SCORE_CRITERIA).join(', ')})`)
  if (!errors.length) {
    const sum = Object.keys(SCORE_CRITERIA).reduce((a, k) => a + score[k], 0)
    if (score.total !== sum) errors.push(`score.total is ${score.total ?? 'missing'}, the criteria add up to ${sum}`)
  }
  return errors
}

/** The experiment this carousel is a row of: slug, the one angle, where it runs. */
export function validateExperiment(experiment) {
  if (experiment === undefined) return []
  if (!experiment || typeof experiment !== 'object') return ['experiment must be {slug, angle: {dimension, value}}']
  const errors = []
  if (!SLUG.test(experiment.slug ?? '') && !isPlaceholder(experiment.slug)) errors.push('experiment.slug is lower-case words joined by hyphens: it becomes utm_content')
  const angle = experiment.angle
  if (!angle || !(DIMENSIONS.includes(angle.dimension) || isPlaceholder(angle.dimension)) || !angle.value) errors.push(`experiment.angle is {dimension: ${DIMENSIONS.join(' | ')}, value: the variant}`)
  return errors
}

/** Hooks and CTAs read off the slides. Warnings, not errors: strict turns them into a failed gate. */
export function lintDeck(doc) {
  const deck = resolveDeck(doc)
  const slides = deck.slides
  const warnings = []
  const second = slides[1]
  if (slides.length > 1 && !SECOND_COVER_TYPES.includes(second.type))
    warnings.push(`slide 2 is a ${second.type}: platforms show a carousel again from slide 2, so it is a second cover (${SECOND_COVER_TYPES.join(', ')}) with its own hook`)
  slides.forEach((s, i) => {
    const hook = s.headline ?? (s.type === 'listicle' ? s.title : null)
    if (i < 2 && hook && wordCount(hook) > 10) warnings.push(`slide ${i + 1}: the hook is ${wordCount(hook)} words, 10 at most`)
    if (s.type === 'stat' && !s.source) warnings.push(`slide ${i + 1} (stat): a number carries its source`)
    if (s.type === 'photo' && !s.alt) warnings.push(`slide ${i + 1} (photo): no alt text`)
  })
  const ctas = slides.filter((s) => s.type === 'cta' || (s.type === 'lettered' && s.url)).length
  if (ctas > 1) warnings.push(`${ctas} slides ask for something: exactly one call to action, then the closing slide says where`)
  const carry = slides.slice(0, -1).filter((s) => s.loop || s.type === 'listicle' || s.type === 'lettered' || (s.type === 'screen' && s.step)).length
  const need = Math.floor((slides.length - 1) / 2)
  if (slides.length >= 5 && carry < need) warnings.push(`only ${carry} of ${slides.length - 1} slides before the last tease the next one (a "loop", or numbering): at least ${need}, every slide earns the next swipe`)
  return warnings
}

/** What `--strict` asks of the spec on top of the layout checks: the intake, a pick, a score of 16, an experiment. */
export function specGate(doc) {
  const problems = [...validateIntake(doc.intake)]
  if (Array.isArray(doc.covers) && doc.cover === undefined) problems.push('three covers are rendered and none is picked: set "cover" to one id (the scorecard decides)')
  if (!doc.score) problems.push(`no score: rate the carousel on references/scorecard.md and record it as "score" (ships at ${SHIP_SCORE} of ${SCORE_TOTAL})`)
  else if (!validateScore(doc.score).length) {
    if (doc.score.total < SHIP_SCORE) problems.push(`score ${doc.score.total} of ${SCORE_TOTAL}: ships at ${SHIP_SCORE}, rework the weakest criterion`)
    if (doc.score.honesty < SCORE_CRITERIA.honesty) problems.push('honesty is not full marks: a claim or number that is not true stops the carousel, whatever the total')
  }
  if (!doc.experiment) problems.push('no experiment: every carousel is a row of the register (slug and angle)')
  return problems
}

/** A link in a caption or reply must carry the tracking, or the visit cannot be tied to the carousel. */
export function checkLinks(text, slug) {
  return [...String(text).matchAll(/https?:\/\/[^\s)>\]]+/g)]
    .map((m) => m[0].replace(/[.,;:!?]+$/, ''))
    .filter((url) => {
      const params = new URL(url).searchParams
      return params.get('utm_content') !== slug || !params.get('utm_source')
    })
    .map((url) => `${url} needs utm_source and utm_content=${slug}`)
}

/** `url` with the tracking every link out of a carousel carries. */
export function utmUrl(url, { source, slug, medium = 'social', campaign }) {
  const u = new URL(url)
  u.searchParams.set('utm_source', source)
  u.searchParams.set('utm_medium', medium)
  if (campaign) u.searchParams.set('utm_campaign', campaign)
  u.searchParams.set('utm_content', slug)
  return u.toString()
}

/**
 * An angle batch: one product, N carousels that differ in exactly one dimension. `fixed` holds the
 * other three, so the matrix reads as one row per angle and a winner is attributable.
 */
export function buildMatrix(batch, { date } = {}) {
  const errors = []
  if (!batch?.name || !SLUG.test(batch.name)) errors.push('name is lower-case words joined by hyphens')
  if (!DIMENSIONS.includes(batch?.dimension)) errors.push(`dimension is one of ${DIMENSIONS.join(', ')}: a batch varies one thing`)
  if (!Array.isArray(batch?.angles) || batch.angles.length < 2) errors.push('angles needs two or more variants of the dimension, or there is nothing to compare')
  const fixed = batch?.fixed ?? {}
  for (const d of DIMENSIONS) if (d !== batch?.dimension && !fixed[d]) errors.push(`fixed.${d} is missing: say what stays the same while ${batch?.dimension ?? 'one dimension'} varies`)
  if (fixed[batch?.dimension]) errors.push(`fixed.${batch.dimension} is the varying dimension: it belongs in angles`)
  const ids = (batch?.angles ?? []).map((a) => a?.id)
  if (ids.some((id) => !SLUG.test(id ?? '')) || new Set(ids).size !== ids.length) errors.push('every angle has its own id (lower-case words joined by hyphens)')
  if ((batch?.angles ?? []).some((a) => !a?.value)) errors.push('every angle has a value: the variant itself')
  if (errors.length) return { errors, rows: [] }
  const rows = batch.angles.map((a) => {
    const slug = `${batch.name}-${a.id}`
    return {
      slug,
      folder: `${date ? `${date}-` : ''}${slug}`,
      dimension: batch.dimension,
      value: a.value,
      fixed,
      platforms: batch.platforms ?? ['instagram', 'tiktok'],
      link: batch.link ? utmUrl(batch.link, { source: 'PLATFORM', slug, campaign: batch.name }).replace('utm_source=PLATFORM', 'utm_source={platform}') : null,
    }
  })
  return { errors, rows }
}

/** The matrix as a table to read and to paste into the experiment register. */
export function matrixMarkdown(batch, rows) {
  const lines = [`# ${batch.name}: angle matrix`, '', `One product, one varying dimension: **${batch.dimension}**. The rest stays fixed.`, '']
  lines.push('| Fixed | Value |', '|---|---|', ...Object.entries(batch.fixed).map(([k, v]) => `| ${k} | ${v} |`), '')
  lines.push(`| Slug (utm_content) | ${batch.dimension} | Platforms | Score |`, '|---|---|---|---|')
  for (const r of rows) lines.push(`| ${r.slug} | ${r.value} | ${r.platforms.join(', ')} | |`)
  return lines.join('\n') + '\n'
}
