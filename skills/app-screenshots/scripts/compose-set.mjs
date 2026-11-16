/**
 * Compose an App Store screenshot set from named layout templates.
 *
 *     node .agents/skills/app-screenshots/scripts/compose-set.mjs --spec <set.json> [--sheet <review.png>]
 *
 * `compose.mjs` sets one caption over one upright device, frame by frame. The
 * strongest sets do more than that: a device tilted and cropped by the frame
 * edge, a hero object that carries the idea, an object or device that crosses
 * the seam into the next frame so the set reads as one panorama. This script
 * renders those, as six templates (references/templates.md):
 *
 *   hero-object      the outcome headline over one big object, a device behind it
 *   tilted-device    one oversized device, rotated and cut by the frame edge
 *   panorama         continues its left neighbour: same ground, a device across the seam
 *   feature-callout  an upright device with the one element that is the feature lifted out
 *   before-after     the same real screen before and after the app did its job
 *   proof            a sourced rating or review, or honest specifics, never invented
 *
 * The whole set is drawn on ONE strip canvas (frames side by side) and cut into
 * frames at the end. That is what lets anything bleed: an element is never
 * clipped to its own frame, so an object placed over the seam is half in each.
 *
 * Geometry is in artboard units: every frame is 430 wide and 430 * h / w tall
 * (about 934), x and y are an element's centre relative to its own frame's
 * top-left corner, and the same numbers render every size. Copy is set as glyph
 * outlines (see compose.mjs), so nothing depends on an installed font.
 *
 * Deterministic and offline, like the other compositors: same spec, captures
 * and art in, same bytes out. sharp and fontkitten resolve from the working
 * directory, the spec's directory, then the repo root.
 */
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SIZES as ALL_SIZES,
  MAX_FRAMES,
  assertDimensions,
  formatSets,
  laurel,
  loadDeps,
  outline,
  readFont,
  readSpec,
  repoRoot,
  sizeErrors,
  slugify,
  star,
  tokens,
  wantedSizes,
} from './compose.mjs'

/** The artboard width every measure is given in. */
export const ART_W = 430

/** The phone sizes of the Dynamic Island and Face ID classes, which share the artboard's proportions. */
export const SIZES = { '6.9': ALL_SIZES['6.9'], '6.7': ALL_SIZES['6.7'], '6.5': ALL_SIZES['6.5'], '6.3': ALL_SIZES['6.3'] }

/** The artboard height of a size: 430 wide, the size's own proportions. */
export const artHeight = (size) => (ART_W * size.h) / size.w

export const TEMPLATES = ['hero-object', 'tilted-device', 'panorama', 'feature-callout', 'before-after', 'proof']

/**
 * Where each template puts its pieces unless the frame says otherwise. Units
 * are artboard units; `y` is the element's centre. Every number here was set by
 * rendering the example set and looking at it, the way a designer nudges a
 * layer, and every one can be overridden per frame.
 */
export const DEFAULTS = {
  'hero-object': {
    copy: 'top',
    object: { x: 215, y: 640, width: 330, rotate: -8 },
    device: { x: 290, y: 700, width: 250, rotate: -12 },
  },
  'tilted-device': { copy: 'top', device: { x: 235, y: 650, width: 330, rotate: -9 } },
  panorama: { copy: 'top', device: { x: 245, y: 650, width: 320, rotate: 8 } },
  'feature-callout': { copy: 'top', device: { x: 215, y: 680, width: 310, rotate: 0 } },
  'before-after': {
    copy: 'top',
    before: { x: 140, y: 665, width: 222, rotate: -6 },
    after: { x: 287, y: 640, width: 236, rotate: 4 },
  },
  proof: { copy: 'top', device: { x: 215, y: 845, width: 300, rotate: 0 } },
}

/** A device turned further than this is hard to read; objects may turn as they like. */
export const MAX_DEVICE_TILT = 15

/** WCAG's minimum for large text and graphics, which is what every word and mark on a frame is. */
export const MIN_CONTRAST = 3

/** The artboard height the defaults are drawn for; `copy: "bottom"` mirrors them about it. */
const DEFAULT_HEIGHT = 934

/** At most this many words in a headline, sub-line excluded. */
export const MAX_HEADLINE_WORDS = 6

// ---------------------------------------------------------------------------
// Honesty
// ---------------------------------------------------------------------------

/**
 * Words that put Apple's own recognitions or an unprovable rank on a frame.
 * Apple shows real recognitions itself and refuses invented ones.
 */
const RECOGNITION =
  /\b(editor'?s'? choice|app of the day|game of the day|apps? we love|apple design award|featured by apple|best of (?:the )?app store)\b|#\s?1\b|\bno\.?\s?1\b|\bnumber one\b|\b(?:best|top-rated|top rated) app\b/i
/** A price, an amount of money, a percentage or a multiplier: claims that need evidence. */
const MONEY = /[$€£¥₹]\s?\d|\d\s?[$€£¥₹]|\b\d[\d.,]*\s?(?:usd|eur|gbp|dollars?|euros?)\b/i
const STAT = /\d\s?%|\b(?:twice|double|triple|(?:two|three|four|five|six|seven|eight|nine|ten)\s+times)\s+(?:as\s+)?(?:fast|faster|more|better|cheaper|quick|quicker|much|many)\b|\b\d+(?:[.,]\d+)?\s?x\s+(?:faster|more|better|cheaper)\b|\b\d+(?:[.,]\d+)?[kKmM]\+?\s+(?:users|downloads|people|customers|ratings|reviews)\b/i
const RATING = /\b[0-5][.,]\d\s?(?:★|stars?)|★/i
const URL = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|app|io|net|org)\b/i
const LEGAL = /[©®™]/

/**
 * What is wrong with one piece of copy, by the honesty rules. A claim with a
 * number in it (money, a percentage, a multiplier, a user count, a rating) is
 * allowed only where the spec names its source, and never in a headline: the
 * headline is the benefit, the number goes in a sourced badge or sticker.
 *
 * @param {string} text
 * @param {{ at: string, sourced?: boolean, field?: string }} where
 * @returns {string[]}
 */
export function copyErrors(text, { at, sourced = false, field = 'copy' }) {
  if (typeof text !== 'string') return []
  const errors = []
  const say = (why) => errors.push(`${at}: ${field} "${text}" ${why}`)
  if (RECOGNITION.test(text)) say('names an Apple recognition or a rank; Apple shows real ones itself, and an invented one is a rejection')
  if (URL.test(text)) say('carries a URL; Apple refuses URLs in screenshots')
  if (LEGAL.test(text)) say('carries a ©, ® or ™ sign; leave legal marks to the listing')
  if (!sourced) {
    if (MONEY.test(text)) say('names an amount of money; prices are refused, and an earnings figure needs a "source" on a sticker or badge')
    if (STAT.test(text)) say('makes a measured claim (a percentage, a multiplier, a user count) without a "source"')
    if (RATING.test(text)) say('shows a rating without a "source"; put it in a badge with the App Store Connect figure and date')
  }
  return errors
}

const isText = (v) => typeof v === 'string' && v.trim() !== ''
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const plain = (headline) => headline.replace(/\*/g, '')
export const wordCount = (headline) => plain(headline).trim().split(/\s+/).filter(Boolean).length

/** "#RGB", "#RRGGBB" or "#RRGGBBAA" as [r, g, b, a] in 0..1; null for anything else. */
export function parseColour(c) {
  if (typeof c !== 'string') return null
  let h = c.trim().replace(/^#/, '')
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null
  if (h.length === 3) h = [...h].map((x) => x + x).join('')
  const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1]
}

/**
 * The WCAG contrast ratio of `fg` drawn on `bg`, with `fg`'s alpha blended
 * over `bg`. Null when either colour is not a hex colour.
 */
export function contrast(fg, bg) {
  const f = parseColour(fg)
  const b = parseColour(bg)
  if (!f || !b) return null
  const mix = [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]))
  const lum = (rgb) => {
    const [r, g, bl] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(mix), lum(b.slice(0, 3))].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Words and marks that would not read on their ground, at the set's large-text minimum. */
function contrastErrors(spec, frame, i, at) {
  const ground = groundOf(spec, i)
  const style = styleOf(spec, { ...frame, background: ground })
  const pairs = [['headline ink', style.ink, ground]]
  if (frame.sub) pairs.push(['sub-line ink', style.subInk, ground])
  if (style.emphasis === 'pill') pairs.push(['emphasised word on its pill', style.emphasisInk, style.pill])
  else if (isText(frame.headline) && frame.headline.includes('*')) pairs.push(['emphasised word (accent)', style.accent, ground])
  if (frame.template === 'proof') pairs.push(['proof marks (accent: laurel, stars, ticks)', style.accent, ground])
  const errors = []
  for (const [what, fg, bg] of pairs) {
    const ratio = contrast(fg, bg)
    if (ratio !== null && ratio < MIN_CONTRAST) {
      errors.push(`${at}: ${what} ${fg} on ${bg} has a contrast of ${ratio.toFixed(1)}:1; it needs ${MIN_CONTRAST}:1 to read at thumbnail size`)
    }
  }
  return errors
}

function placementErrors(p, at, need) {
  // null drops a template's default piece ("device": null on a proof frame).
  if (p === undefined || p === null) return []
  if (!p || typeof p !== 'object') return [`${at} must be an object`]
  const errors = []
  if (need && !isText(p[need])) errors.push(`${at} needs "${need}"`)
  for (const key of ['x', 'y', 'width', 'rotate']) {
    if (p[key] !== undefined && !isNum(p[key])) errors.push(`${at}.${key} must be a number`)
  }
  if (isNum(p.width) && p.width <= 0) errors.push(`${at}.width must be positive`)
  if (need === 'screen' && isNum(p.rotate) && Math.abs(p.rotate) > MAX_DEVICE_TILT) {
    errors.push(`${at}.rotate is ${p.rotate}°; a device turned more than ${MAX_DEVICE_TILT}° is hard to read (6° to 12° looks deliberate)`)
  }
  return errors
}

function sourced(item, at, kind, field) {
  if (item === undefined) return []
  if (!item || typeof item !== 'object') return [`${at}: "${kind}" must be an object`]
  const errors = []
  if (!isText(item[field])) errors.push(`${at}: ${kind} needs "${field}"`)
  if (!isText(item.source)) {
    errors.push(`${at}: ${kind} has no "source". A rating, review or figure goes in only with where it comes from (e.g. "App Store Connect, 4.8 from 212 ratings, <date>")`)
  }
  return errors
}

/**
 * Everything wrong with a set spec that can be known without touching the disk.
 *
 * @param {unknown} spec
 * @returns {string[]} one message per problem; empty when the spec is usable
 */
export function validateSetSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['the spec must be a JSON object']
  const errors = sizeErrors(spec, SIZES)
  for (const key of ['background', 'ink', 'font']) {
    if (!isText(spec[key])) errors.push(`"${key}" is required`)
  }
  if (spec.emphasis !== undefined && !['colour', 'pill'].includes(spec.emphasis)) errors.push('"emphasis" must be "colour" or "pill"')
  if (spec.headlineSize !== undefined && !['set', 'frame'].includes(spec.headlineSize)) errors.push('"headlineSize" must be "set" or "frame"')
  if (!Array.isArray(spec.frames) || spec.frames.length === 0) return [...errors, '"frames" must be a non-empty array']
  if (spec.frames.length > MAX_FRAMES) errors.push(`${spec.frames.length} frames; Apple takes at most ${MAX_FRAMES}`)

  for (const [i, frame] of spec.frames.entries()) {
    const at = `frames[${i}]`
    if (!frame || typeof frame !== 'object') {
      errors.push(`${at} must be an object`)
      continue
    }
    if (!TEMPLATES.includes(frame.template)) {
      errors.push(`${at}: "template" must be one of ${TEMPLATES.join(', ')}`)
      continue
    }
    if (!isText(frame.headline)) errors.push(`${at}: "headline" is required`)
    else {
      const words = wordCount(frame.headline)
      if (words > MAX_HEADLINE_WORDS) {
        errors.push(`${at}: headline has ${words} words; ${MAX_HEADLINE_WORDS} at most, three to five read best at thumbnail size`)
      }
      if ((frame.headline.match(/\*/g) ?? []).length > 2) errors.push(`${at}: emphasise one word or phrase per headline, not several`)
      errors.push(...copyErrors(frame.headline, { at, field: 'headline' }))
    }
    if (frame.sub !== undefined) {
      if (!isText(frame.sub)) errors.push(`${at}: "sub" must be text`)
      else if (wordCount(frame.sub) > 10) errors.push(`${at}: sub-line has ${wordCount(frame.sub)} words; keep it to one short line`)
      errors.push(...copyErrors(frame.sub, { at, field: 'sub' }))
    }
    if (frame.copy !== undefined && !['top', 'bottom'].includes(frame.copy)) errors.push(`${at}: "copy" must be "top" or "bottom"`)
    if (frame.align !== undefined && !['center', 'left'].includes(frame.align)) errors.push(`${at}: "align" must be "center" or "left"`)

    errors.push(...placementErrors(frame.device, `${at}.device`, frame.template === 'proof' ? undefined : 'screen'))
    errors.push(...placementErrors(frame.object, `${at}.object`, 'image'))

    const t = frame.template
    if (['tilted-device', 'panorama', 'feature-callout'].includes(t) && !isText(frame.device?.screen)) {
      errors.push(`${at}: ${t} needs "device": { "screen": "<capture>" }`)
    }
    if (t === 'hero-object' && !isText(frame.object?.image)) {
      errors.push(`${at}: hero-object needs "object": { "image": "<png or svg the app owns>" }`)
    }
    if (t === 'panorama') {
      if (i === 0) errors.push(`${at}: a panorama frame continues the frame before it, so it cannot be first`)
      else if (frame.background !== undefined && frame.background !== groundOf(spec, i - 1)) {
        errors.push(`${at}: a panorama frame shares its neighbour's ground; drop "background" or make them equal`)
      }
    }
    if (t === 'feature-callout' && !(Array.isArray(frame.callouts) && frame.callouts.length > 0)) {
      errors.push(`${at}: feature-callout needs "callouts": [{ "crop": [x, y, w, h] }] from the real capture`)
    }
    for (const [ci, c] of (Array.isArray(frame.callouts) ? frame.callouts : []).entries()) {
      const crop = c?.crop
      if (!Array.isArray(crop) || crop.length !== 4 || !crop.every((v) => Number.isInteger(v) && v >= 0)) {
        errors.push(`${at}: callouts[${ci}] needs "crop": [x, y, w, h] in capture pixels`)
      }
    }
    if (t === 'before-after') {
      errors.push(...placementErrors(frame.before ?? {}, `${at}.before`, 'screen'))
      errors.push(...placementErrors(frame.after ?? {}, `${at}.after`, 'screen'))
      for (const label of Object.values(frame.labels ?? {})) errors.push(...copyErrors(label, { at, field: 'label' }))
    }
    if (t === 'proof') {
      const any = frame.badge || frame.quote || (Array.isArray(frame.facts) && frame.facts.length > 0)
      if (!any) errors.push(`${at}: proof needs a sourced "badge" or "quote", or honest "facts"; with none of them, drop the frame`)
      errors.push(...sourced(frame.badge, at, 'badge', 'value'), ...sourced(frame.quote, at, 'quote', 'text'))
      if (frame.facts !== undefined && !Array.isArray(frame.facts)) errors.push(`${at}: "facts" must be an array of short lines`)
      for (const fact of Array.isArray(frame.facts) ? frame.facts : []) {
        if (!isText(fact)) errors.push(`${at}: every fact is a short line of text`)
        else {
          if (/\d/.test(fact)) errors.push(`${at}: fact "${fact}" has a number; a figure goes in a badge with its "source"`)
          errors.push(...copyErrors(fact, { at, field: 'fact' }))
        }
      }
    }
    errors.push(...contrastErrors(spec, frame, i, at))
    for (const [si, s] of (Array.isArray(frame.stickers) ? frame.stickers : []).entries()) {
      if (!isText(s?.text)) errors.push(`${at}: stickers[${si}] needs "text"`)
      else errors.push(...copyErrors(s.text, { at, field: 'sticker', sourced: isText(s.source) }))
      errors.push(...placementErrors({ x: s?.x, y: s?.y, rotate: s?.rotate }, `${at}.stickers[${si}]`))
    }
  }
  return errors
}

/** The ground a frame is drawn on: its own, its panorama neighbour's, or the set's. */
export function groundOf(spec, i) {
  const frame = spec.frames[i]
  if (frame?.template === 'panorama' && i > 0) return groundOf(spec, i - 1)
  return frame?.background ?? spec.background
}

/**
 * A frame's pieces with the template's defaults filled in.
 *
 * @param {object} frame
 * @returns {object}
 */
export function resolveFrame(frame) {
  const d = DEFAULTS[frame.template]
  const merge = (key) => (frame[key] === null ? undefined : frame[key] || d[key] ? { ...d[key], ...frame[key] } : undefined)
  const out = { ...frame, copy: frame.copy ?? d.copy, align: frame.align ?? 'center' }
  for (const key of ['device', 'object', 'before', 'after']) {
    const m = merge(key)
    // The defaults are drawn for copy at the top. With the copy at the bottom
    // the picture moves up: a default height is mirrored, a frame's own is kept.
    if (m && out.copy === 'bottom' && d[key] && frame[key]?.y === undefined) m.y = DEFAULT_HEIGHT - d[key].y
    // A default placement with nothing to place is not a piece.
    if (m && (key === 'object' ? m.image : m.screen)) out[key] = m
    else delete out[key]
  }
  return out
}

/**
 * The axis-aligned box of a w x h rectangle centred on (cx, cy) and turned by
 * `deg`. Used to warn when a device or object reaches into a headline.
 */
export function rotatedBox(cx, cy, w, h, deg) {
  const r = (deg * Math.PI) / 180
  const bw = Math.abs(w * Math.cos(r)) + Math.abs(h * Math.sin(r))
  const bh = Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r))
  return { left: cx - bw / 2, top: cy - bh / 2, right: cx + bw / 2, bottom: cy + bh / 2 }
}

/** The four corners of a w x h rectangle centred on (cx, cy) and turned by `deg`. */
export function rotatedCorners(cx, cy, w, h, deg) {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const sn = Math.sin(r)
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => [cx + x * c - y * sn, cy + x * sn + y * c])
}

const rectCorners = (b) => [
  [b.left, b.top],
  [b.right, b.top],
  [b.right, b.bottom],
  [b.left, b.bottom],
]

/** Whether two convex polygons overlap (separating axis test). Touching edges do not count. */
export function polygonsOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i]
      const [x2, y2] = poly[(i + 1) % poly.length]
      const axis = [y1 - y2, x2 - x1]
      const project = (q) => q.map(([x, y]) => x * axis[0] + y * axis[1])
      const pa = project(a)
      const pb = project(b)
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false
    }
  }
  return true
}

export const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/**
 * Split a headline into at most `maxLines` lines at the largest size that fits.
 * Of the splits that fit at a size, the most balanced wins, so no line is left
 * with an orphan.
 *
 * @param {Array<{ text: string, accent: boolean }>} toks
 * @param {(toks: Array<{ text: string, accent: boolean }>, px: number) => number} measure
 * @param {{ maxWidth: number, maxFont: number, minFont: number, maxLines: number }} limits
 * @returns {{ lines: Array<Array<{ text: string, accent: boolean }>>, fontSize: number }}
 */
export function fitTokens(toks, measure, { maxWidth, maxFont, minFont, maxLines, prefer = 0.85 }) {
  const n = toks.length
  const splits = (count) => {
    if (count === 1) return [[]]
    if (count === 2) return Array.from({ length: n - 1 }, (_, i) => [i + 1])
    const out = []
    for (let i = 1; i < n - 1; i++) for (let j = i + 1; j < n; j++) out.push([i, j])
    return out
  }
  // The most balanced split into exactly `count` lines at `px`, or null.
  const bestAt = (px, count) => {
    let best = null
    for (const cuts of splits(count)) {
      const bounds = [0, ...cuts, n]
      const lines = bounds.slice(1).map((end, k) => toks.slice(bounds[k], end))
      const widths = lines.map((l) => measure(l, px))
      if (widths.some((w) => w > maxWidth)) continue
      const imbalance = Math.max(...widths) - Math.min(...widths)
      if (!best || imbalance < best.imbalance) best = { lines, imbalance }
    }
    return best
  }
  // The largest size for each line count, then the fewest lines whose size is
  // close to the largest: "Watch it / come closer" over "Watch / it come / closer".
  const options = []
  for (let count = 1; count <= Math.min(maxLines, n); count++) {
    for (let px = maxFont; px >= minFont; px -= 2) {
      const best = bestAt(px, count)
      if (best) {
        options.push({ lines: best.lines, fontSize: px })
        break
      }
    }
  }
  if (options.length) {
    const largest = Math.max(...options.map((o) => o.fontSize))
    return options.find((o) => o.fontSize >= largest * prefer)
  }
  throw new Error(
    `headline will not fit ${maxLines} lines even at ${minFont}px: "${toks.map((t) => t.text).join(' ')}". Cut words; ` +
      'nobody reads past about five at thumbnail size',
  )
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** A run of words split into same-emphasis runs. */
function runsOf(toks) {
  const runs = []
  for (const t of toks) {
    const last = runs.at(-1)
    if (last && last.accent === t.accent) last.text += ` ${t.text}`
    else runs.push({ text: t.text, accent: t.accent })
  }
  return runs
}

/**
 * One headline line, emphasis included, as SVG. `pill` sets the emphasised
 * words on a filled, slightly turned pill; `colour` sets them in the accent.
 */
function headlineLine(font, toks, px, style) {
  const runs = runsOf(toks)
  const pad = style.emphasis === 'pill' ? px * 0.2 : 0
  const space = outline(font, ' ', px, '#000').width || px * 0.25
  const set = runs.map((r) => {
    const fill = r.accent && style.emphasis === 'colour' ? style.accent : r.accent ? style.emphasisInk : style.ink
    return { ...r, o: outline(font, r.text, px, fill) }
  })
  const width = set.reduce((sum, r) => sum + r.o.width + (r.accent ? pad * 2 : 0), 0) + space * (set.length - 1)
  const svg = (left, baseline) => {
    let x = left
    return set
      .map((r, i) => {
        if (i) x += space
        let s
        if (r.accent && style.emphasis === 'pill') {
          const w = r.o.width + pad * 2
          const top = baseline - px * 0.84
          const h = px * 1.06
          const cx = x + w / 2
          const cy = top + h / 2
          s =
            `<g transform="rotate(${style.pillRotate} ${cx.toFixed(1)} ${cy.toFixed(1)})">` +
            `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(px * 0.22).toFixed(1)}" fill="${style.pill}"/>` +
            `${r.o.svg(cx, baseline)}</g>`
          x += w
        } else {
          s = r.o.svg(x + r.o.width / 2, baseline)
          x += r.o.width
        }
        return s
      })
      .join('')
  }
  return { width, svg }
}

/** Measure a token line the way `headlineLine` will draw it. */
const measureLine = (font, style) => (toks, px) => headlineLine(font, toks, px, style).width

/**
 * The copy block of one frame: headline and sub-line, fitted and placed. All
 * coordinates are strip pixels.
 */
/** The headline's measure and size range at one size, in pixels. */
function headlineLimits(s, size) {
  return { maxWidth: size.w - 64 * s, maxFont: Math.round(58 * s), minFont: Math.round(30 * s), maxLines: 3 }
}

/**
 * One headline size for the whole set: the largest size at which every
 * headline fits in three lines. Frames whose headlines differ in length then
 * differ in line count, not in type size, which is what makes a set read as one.
 */
export function setHeadlineSize(frames, ctx) {
  const { s, size, font, spec } = ctx
  return Math.min(
    ...frames.map((frame) =>
      fitTokens(tokens(frame.headline), measureLine(font, styleOf(spec, frame)), { ...headlineLimits(s, size), prefer: 1 }).fontSize,
    ),
  )
}

function copyBlock(frame, ctx, frameLeft) {
  const { s, size, font, bodyFont, spec } = ctx
  const style = styleOf(spec, frame)
  const margin = 32 * s
  const limits = headlineLimits(s, size)
  const { maxWidth } = limits
  const toks = tokens(frame.headline)
  // At the set's size: the fewest lines that fit. Per frame: fitted on its own.
  const { lines, fontSize } = ctx.setPx
    ? fitTokens(toks, measureLine(font, style), { ...limits, maxFont: ctx.setPx, minFont: ctx.setPx, prefer: 0 })
    : fitTokens(toks, measureLine(font, style), limits)
  const lead = fontSize * 1.0
  const set = lines.map((l) => headlineLine(font, l, fontSize, style))
  let sub = null
  if (frame.sub) {
    const px = Math.round(19 * s)
    sub = outline(bodyFont, frame.sub, px, style.subInk)
    if (sub.width > maxWidth) throw new Error(`frame "${frame.headline}": sub-line is too long for one line; cut it`)
    sub.px = px
  }
  // The sub-line clears the pill's lower edge (about a quarter of the type size).
  const subDrop = sub ? fontSize * 0.24 + sub.px * 1.6 : 0
  const height = lead * (lines.length - 1) + fontSize * 0.86 + (sub ? subDrop + sub.px * 0.35 : 0)
  const AH = artHeight(size)
  const top = frame.copy === 'bottom' ? (AH - 56) * s - height : 64 * s
  const xFor = (w) => (frame.align === 'left' ? frameLeft + margin : frameLeft + (size.w - w) / 2)
  let svg = ''
  set.forEach((line, k) => {
    svg += line.svg(xFor(line.width), top + fontSize * 0.86 + k * lead)
  })
  if (sub) {
    const y = top + fontSize * 0.86 + lead * (lines.length - 1) + subDrop
    svg += sub.svg(xFor(sub.width) + sub.width / 2, y)
  }
  const widest = Math.max(...set.map((l) => l.width), sub?.width ?? 0)
  const box = { left: xFor(widest), right: xFor(widest) + widest, top, bottom: top + height }
  return { svg, box, lines: lines.map((l) => l.map((t) => t.text).join(' ')), fontSize }
}

function styleOf(spec, frame) {
  const ink = frame.ink ?? spec.ink
  return {
    ink,
    subInk: frame.subInk ?? spec.subInk ?? ink,
    accent: frame.accent ?? spec.accent ?? ink,
    emphasis: spec.emphasis ?? 'colour',
    pill: frame.pill ?? spec.pill ?? spec.accent ?? ink,
    emphasisInk: frame.pillInk ?? spec.pillInk ?? (spec.emphasis === 'pill' ? (frame.background ?? spec.background) : ink),
    pillRotate: spec.pillRotate ?? -3,
  }
}

/**
 * A generic phone around a real capture: a dark slab, the screen with rounded
 * corners, and a soft shadow when it floats. Deliberately no island, notch,
 * buttons or switches: Apple's marketing guidelines say a drawn device must not
 * carry details unique to Apple products, and a tilted or cropped Apple bezel
 * is not allowed either. Returns an upright PNG with room for the shadow.
 */
async function deviceImage(sharp, screenPath, widthPx, { shadow = true, mute = false } = {}) {
  if (!existsSync(screenPath)) throw new Error(`capture not found: ${screenPath}`)
  const meta = await sharp(screenPath).metadata()
  // Every portrait iPhone capture with a Face ID or Dynamic Island screen is
  // about 0.46 wide to 1 tall. Anything else would be squeezed into the device.
  const ratio = meta.width / meta.height
  if (Math.abs(ratio - CAPTURE_RATIO) > 0.01) {
    throw new Error(`${screenPath}: ${meta.width}x${meta.height} is not a portrait iPhone capture (about 1206x2622); capture the simulator, not a composed image`)
  }
  if (meta.hasAlpha && !(await sharp(screenPath).stats()).isOpaque) {
    throw new Error(`${screenPath}: has transparent pixels; a simulator capture is opaque`)
  }
  const bezel = Math.round(widthPx * 0.028)
  const innerW = widthPx - bezel * 2
  const innerH = Math.round((innerW / meta.width) * meta.height)
  const h = innerH + bezel * 2
  const r = Math.round(widthPx * 0.15)
  const ir = r - bezel
  const pad = shadow ? Math.round(widthPx * 0.14) : 0
  const W = widthPx + pad * 2
  const H = h + pad * 2

  let screen = sharp(screenPath).resize(innerW, innerH)
  if (mute) screen = screen.modulate({ saturation: 0.1, brightness: 0.92 })
  const mask = Buffer.from(`<svg width="${innerW}" height="${innerH}"><rect width="${innerW}" height="${innerH}" rx="${ir}" fill="#fff"/></svg>`)
  const screenBuf = await screen.composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()

  const blur = widthPx * 0.045
  const body =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    (shadow
      ? `<filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur.toFixed(1)}"/></filter>` +
        `<rect x="${pad}" y="${pad + blur * 0.9}" width="${widthPx}" height="${h}" rx="${r}" fill="#000" fill-opacity="0.28" filter="url(#s)"/>`
      : '') +
    `<rect x="${pad}" y="${pad}" width="${widthPx}" height="${h}" rx="${r}" fill="#121212"/>` +
    `<rect x="${pad + 1.5}" y="${pad + 1.5}" width="${widthPx - 3}" height="${h - 3}" rx="${r - 1.5}" fill="none" stroke="#3A3A3C" stroke-width="3"/>` +
    `</svg>`
  const buf = await sharp(Buffer.from(body))
    .composite([{ input: screenBuf, top: pad + bezel, left: pad + bezel }])
    .png()
    .toBuffer()
  return { buffer: buf, pad, width: widthPx, height: h, bezel, innerW, innerH, source: meta }
}

/** Width over height of a portrait iPhone capture (1206x2622 and its siblings). */
export const CAPTURE_RATIO = 1206 / 2622

/** An object image (PNG or SVG) scaled to `widthPx`, rasterised sharp. */
async function objectImage(sharp, imagePath, widthPx) {
  if (!existsSync(imagePath)) throw new Error(`object image not found: ${imagePath}`)
  const meta = await sharp(imagePath).metadata()
  const isSvg = /\.svg$/i.test(imagePath)
  const input = isSvg ? sharp(imagePath, { density: Math.max(72, Math.ceil((72 * widthPx) / meta.width) + 1) }) : sharp(imagePath)
  const buffer = await input.resize({ width: Math.round(widthPx) }).png().toBuffer()
  const m = await sharp(buffer).metadata()
  return { buffer, width: m.width, height: m.height }
}

/** Turn a PNG about its centre, keeping transparency. */
async function turned(sharp, buffer, deg) {
  if (!deg) {
    const m = await sharp(buffer).metadata()
    return { buffer, width: m.width, height: m.height }
  }
  const out = await sharp(buffer).rotate(deg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const m = await sharp(out).metadata()
  return { buffer: out, width: m.width, height: m.height }
}

/**
 * A layer placed by its centre, cut to `clip` (the whole strip, or one frame
 * for a piece that must not show in its neighbours). sharp composites only
 * inside the base image, so whatever hangs off is cut here.
 */
async function placed(sharp, img, cx, cy, clip) {
  const cl = clip.left ?? 0
  let left = Math.round(cx - img.width / 2)
  let top = Math.round(cy - img.height / 2)
  const x0 = Math.max(cl, left)
  const y0 = Math.max(0, top)
  const x1 = Math.min(cl + clip.w, left + img.width)
  const y1 = Math.min(clip.h, top + img.height)
  if (x1 <= x0 || y1 <= y0) return null
  let buffer = img.buffer
  if (x0 !== left || y0 !== top || x1 - x0 !== img.width || y1 - y0 !== img.height) {
    buffer = await sharp(img.buffer)
      .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
      .png()
      .toBuffer()
    left = x0
    top = y0
  }
  return { input: buffer, left, top }
}

/** Where a point on an upright device lands once the device is turned and placed. */
function onDevice(dev, p, cx, cy, deg, k) {
  // p is in capture pixels; k maps capture pixels to screen pixels.
  const lx = -dev.width / 2 + dev.bezel + p[0] * k
  const ly = -dev.height / 2 + dev.bezel + p[1] * k
  const r = (deg * Math.PI) / 180
  return [cx + lx * Math.cos(r) - ly * Math.sin(r), cy + lx * Math.sin(r) + ly * Math.cos(r)]
}

/** A floating chip: a short label on a filled, rounded shape. Strip pixels. */
function stickerSvg(st, ctx, frameLeft, defaults) {
  const { s, bodyFont } = ctx
  const px = (st.size ?? 17) * s
  const fill = st.fill ?? defaults.fill
  const ink = st.ink ?? defaults.ink
  const o = outline(bodyFont, st.text, px, ink)
  const w = o.width + px * 1.3
  const h = px * 2.1
  const cx = frameLeft + st.x * s
  const cy = st.y * s
  const blur = px * 0.35
  return {
    svg:
      `<g transform="rotate(${st.rotate ?? 0} ${cx.toFixed(1)} ${cy.toFixed(1)})">` +
      `<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2 + blur * 0.8).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="#000" fill-opacity="0.18" filter="url(#chip)"/>` +
      `<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${fill}"/>` +
      `${o.svg(cx, cy + px * 0.36)}</g>`,
    blur,
  }
}

/** The proof block: a laurel badge, a quote with stars, or a list of honest facts. */
function proofSvg(frame, ctx, frameLeft, top) {
  const { s, size, font, bodyFont, spec } = ctx
  const style = styleOf(spec, frame)
  const cx = frameLeft + size.w / 2
  let y = top
  let svg = ''
  if (frame.badge) {
    const v = outline(font, frame.badge.value, 64 * s, style.ink)
    const label = frame.badge.label ? outline(bodyFont, frame.badge.label, 17 * s, style.subInk) : null
    const h = 64 * s + (label ? 30 * s : 0)
    const rx = Math.max(v.width, label?.width ?? 0) / 2 + 44 * s
    const cy = y + h / 2
    svg += laurel(cx, cy, rx, h * 0.62, -1, style.accent) + laurel(cx, cy, rx, h * 0.62, 1, style.accent)
    svg += v.svg(cx, y + 56 * s) + (label ? label.svg(cx, y + 64 * s + 22 * s) : '')
    y += h + 34 * s
  }
  if (frame.quote) {
    const r = 10 * s
    svg += [-2, -1, 0, 1, 2].map((i) => star(cx + i * r * 2.5, y + r, r, style.accent)).join('')
    const q = outline(bodyFont, `“${frame.quote.text}”`, 24 * s, style.ink)
    if (q.width > size.w - 64 * s) throw new Error(`frame "${frame.headline}": the quote does not fit one line; pick a shorter one`)
    svg += q.svg(cx, y + r * 2 + 34 * s)
    if (frame.quote.author) svg += outline(bodyFont, frame.quote.author, 16 * s, style.subInk).svg(cx, y + r * 2 + 64 * s)
    y += r * 2 + 90 * s
  }
  if (Array.isArray(frame.facts) && frame.facts.length) {
    const px = 28 * s
    const rows = frame.facts.map((f) => outline(font, f, px, style.ink))
    const dot = px * 0.95
    const widest = Math.max(...rows.map((r) => r.width)) + dot + px * 0.7
    const left = cx - widest / 2
    rows.forEach((row, k) => {
      const ry = y + k * px * 2.0
      const dcx = left + dot / 2
      const dcy = ry + px * 0.62
      svg +=
        `<circle cx="${dcx.toFixed(1)}" cy="${dcy.toFixed(1)}" r="${(dot / 2).toFixed(1)}" fill="${style.accent}"/>` +
        `<path d="M${(dcx - dot * 0.22).toFixed(1)} ${dcy.toFixed(1)} l${(dot * 0.15).toFixed(1)} ${(dot * 0.16).toFixed(1)} l${(dot * 0.3).toFixed(1)} ${(-dot * 0.32).toFixed(1)}" fill="none" stroke="${style.emphasisInk}" stroke-width="${(dot * 0.12).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>` +
        row.svg(left + dot + px * 0.7 + row.width / 2, ry + px * 0.95)
    })
    y += rows.length * px * 2.0
  }
  return { svg, bottom: y }
}

/**
 * The whole set at one size, as one strip: every frame side by side, devices
 * and objects free to cross seams. Returns the strip PNG and what was placed,
 * so callers can cut frames and check overlaps.
 *
 * @param {object} spec a spec that passed `validateSetSpec`
 * @param {string} sizeKey
 * @param {{ base: string, sharp: Function, font: object, bodyFont: object, show?: boolean }} context
 */
export async function renderStrip(spec, sizeKey, { base, sharp, font, bodyFont, show = true }) {
  const size = SIZES[sizeKey]
  const s = size.w / ART_W
  const n = spec.frames.length
  const canvas = { w: size.w * n, h: size.h }
  const ctx = { s, size, font, bodyFont, spec }
  const frames = spec.frames.map(resolveFrame)
  if (spec.headlineSize !== 'frame') ctx.setPx = setHeadlineSize(frames, ctx)

  // Grounds, then each frame's art in order (so a later frame's device can sit
  // over an earlier frame's bleed), then every word on top of everything.
  let ground = ''
  frames.forEach((_, i) => {
    ground += `<rect x="${i * size.w}" y="0" width="${size.w}" height="${size.h}" fill="${groundOf(spec, i)}"/>`
  })
  const layers = []
  const boxes = []
  let words = ''
  let chipBlur = 6 * s
  const warnings = []

  for (const [i, frame] of frames.entries()) {
    const fl = i * size.w
    const at = (p) => [fl + p.x * s, p.y * s]
    const style = styleOf(spec, frame)
    // A device is cut by its own frame's edge unless it asks to bleed; an
    // object bleeds unless it asks not to.
    const own = { left: fl, w: size.w, h: size.h }

    const putDevice = async (p, opts = {}) => {
      const dev = await deviceImage(sharp, path.resolve(base, p.screen), Math.round(p.width * s), opts)
      const t = await turned(sharp, dev.buffer, p.rotate ?? 0)
      const [cx, cy] = at(p)
      const layer = await placed(sharp, t, cx, cy, p.bleed ? canvas : own)
      if (layer) layers.push(layer)
      boxes.push({
        frame: i,
        what: 'device',
        bleed: p.bleed === true,
        poly: rotatedCorners(cx, cy, dev.width, dev.height, p.rotate ?? 0),
        ...rotatedBox(cx, cy, dev.width, dev.height, p.rotate ?? 0),
      })
      return { dev, cx, cy }
    }

    if (frame.template === 'before-after') {
      const placedPair = {
        before: await putDevice(frame.before, { mute: true }),
        after: await putDevice(frame.after),
      }
      const labels = { before: 'Before', after: 'After', ...frame.labels }
      for (const key of ['before', 'after']) {
        const p = frame[key]
        // The label sits on the device's top edge, turned with it.
        const st = { text: labels[key], x: p.x, y: p.y - placedPair[key].dev.height / s / 2, rotate: p.rotate ?? 0, size: 16 }
        const chip = stickerSvg(st, ctx, fl, key === 'after' ? { fill: style.pill, ink: style.emphasisInk } : { fill: '#FFFFFF', ink: '#1C1C1E' })
        if (show) words += chip.svg
        chipBlur = chip.blur
      }
    } else if (frame.device) {
      const { dev, cx, cy } = await putDevice(frame.device)
      // Callouts: the real capture, cut, enlarged and lifted off the device.
      const k = dev.innerW / dev.source.width
      for (const [ci, c] of (frame.callouts ?? []).entries()) {
        const [x, y, w, h] = c.crop
        const scale = c.scale ?? 1.3
        const [dx, dy] = c.shift ?? [0, 0]
        const [ccx, ccy] = onDevice(dev, [x + w / 2, y + h / 2], cx, cy, frame.device.rotate ?? 0, k)
        const cw = Math.round(w * k * scale)
        const ch = Math.round(h * k * scale)
        const r = Math.round((c.radius ?? 14) * s)
        const blur = Math.round(14 * s)
        const pad = blur * 3
        const mask = Buffer.from(`<svg width="${cw}" height="${ch}"><rect width="${cw}" height="${ch}" rx="${r}" fill="#fff"/></svg>`)
        const cut = await sharp(path.resolve(base, frame.device.screen))
          .extract({ left: x, top: y, width: w, height: h })
          .resize(cw, ch)
          .composite([{ input: mask, blend: 'dest-in' }])
          .png()
          .toBuffer()
        const lifted = await sharp(
          Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${cw + pad * 2}" height="${ch + pad * 2}">` +
              `<filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${blur}"/></filter>` +
              `<rect x="${pad}" y="${pad + blur}" width="${cw}" height="${ch}" rx="${r}" fill="#000" fill-opacity="0.32" filter="url(#b)"/></svg>`,
          ),
        )
          .composite([{ input: cut, top: pad, left: pad }])
          .png()
          .toBuffer()
        const t = await turned(sharp, lifted, c.rotate ?? 0)
        const px = ccx + dx * s
        const py = ccy + dy * s
        if (px - cw / 2 < fl || px + cw / 2 > fl + size.w) {
          throw new Error(`frame ${i + 1}: callout ${ci + 1} leaves its frame; lower "scale" or change "shift"`)
        }
        const layer = await placed(sharp, t, px, py, own)
        if (layer) layers.push(layer)
      }
    }

    if (frame.object) {
      const p = frame.object
      const img = await objectImage(sharp, path.resolve(base, p.image), p.width * s)
      const t = await turned(sharp, img.buffer, p.rotate ?? 0)
      const [cx, cy] = at(p)
      const layer = await placed(sharp, t, cx, cy, p.bleed === false ? own : canvas)
      if (layer) layers.push(layer)
      // Objects are drawn with air around them; count the middle 80% only.
      boxes.push({
        frame: i,
        what: 'object',
        bleed: p.bleed !== false,
        poly: rotatedCorners(cx, cy, img.width * 0.8, img.height * 0.8, p.rotate ?? 0),
        ...rotatedBox(cx, cy, img.width * 0.8, img.height * 0.8, p.rotate ?? 0),
      })
    }

    const copy = copyBlock(frame, ctx, fl)
    if (show) words += copy.svg
    frame._wordBoxes = [{ what: 'headline', ...copy.box }]

    if (frame.template === 'proof') {
      // Below a top headline, or above a bottom one.
      const gap = 40 * s
      const height = proofSvg(frame, ctx, fl, 0).bottom
      const top = frame.copy === 'bottom' ? copy.box.top - gap - height : copy.box.bottom + gap
      const block = proofSvg(frame, ctx, fl, top)
      if (show) words += block.svg
      frame._wordBoxes.push({ what: 'proof block', left: fl + 32 * s, right: fl + size.w - 32 * s, top, bottom: top + height })
    }
    for (const st of frame.stickers ?? []) {
      const chip = stickerSvg(st, ctx, fl, { fill: '#FFFFFF', ink: '#1C1C1E' })
      chipBlur = chip.blur
      if (show) words += chip.svg
    }
  }
  // Nothing may lie on the words: words are drawn last, so a device under a
  // headline turns it into white type on a white screen. A piece cut by its
  // own frame can only reach that frame's words; a bleeding one, any frame's.
  const covered = []
  for (const [i, frame] of frames.entries()) {
    for (const w of frame._wordBoxes) {
      for (const b of boxes) {
        if (b.frame !== i && !b.bleed) continue
        if (polygonsOverlap(b.poly, rectCorners(w))) {
          const whose = b.frame === i ? `its ${b.what}` : `the ${b.what} of frame ${b.frame + 1}`
          covered.push(`frame ${i + 1}: ${whose} covers the ${w.what}; move it (\`y\`, \`width\`) or set the copy at the other end`)
        }
      }
    }
  }
  if (covered.length) throw new Error([...new Set(covered)].join('\n'))

  // The store shows frames as separate rounded cards with a gap between them,
  // so a screen across a seam is cut in half. Objects and grounds may cross; a
  // device should not.
  for (const b of boxes) {
    if (b.what !== 'device' || !b.bleed) continue
    for (let k = 1; k < n; k++) {
      const seam = k * size.w
      // A corner or bezel just touching the seam is fine; a screen across it is not.
      if (b.left < seam - size.w * 0.06 && b.right > seam + size.w * 0.06) {
        const other = b.frame + 1 === k + 1 ? k : k + 1
        warnings.push(`frame ${b.frame + 1}: its device crosses the seam into frame ${other}; the store's gap will cut the screen. Let an object or the ground carry the panorama instead`)
      }
    }
  }

  const base64 = (svg) => Buffer.from(svg)
  const top = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}"><filter id="chip" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="${chipBlur.toFixed(1)}"/></filter>${words}</svg>`
  const strip = await sharp(base64(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}">${ground}</svg>`))
    .composite([...layers, { input: base64(top), top: 0, left: 0 }])
    .flatten({ background: spec.background })
    .removeAlpha()
    .png()
    .toBuffer()
  return { strip, canvas, size, warnings: [...new Set(warnings)] }
}

/** The file name of a frame. */
export const frameFile = (frame, i) => `${String(i + 1).padStart(2, '0')}-${frame.slug ?? slugify(frame.headline)}.png`

/**
 * Cut a strip into frames and write them into `<out>/<size>/`.
 */
export async function writeFrames(spec, sizeKey, context) {
  const { sharp } = context
  const { strip, size, warnings } = await renderStrip(spec, sizeKey, context)
  const out = path.join(path.resolve(context.base, spec.out ?? '.'), sizeKey)
  mkdirSync(out, { recursive: true })
  const made = []
  for (const [i, frame] of spec.frames.entries()) {
    const buf = await sharp(strip).extract({ left: i * size.w, top: 0, width: size.w, height: size.h }).png({ compressionLevel: 9 }).toBuffer()
    const meta = await sharp(buf).metadata()
    const file = path.join(out, frameFile(frame, i))
    assertDimensions(meta, size, file)
    if (meta.hasAlpha) throw new Error(`${file}: has an alpha channel; Apple refuses it`)
    writeFileSync(file, buf)
    made.push({ file, width: meta.width, height: meta.height, bytes: buf.length })
  }
  return { frames: made, warnings }
}

/**
 * The review sheet: the whole set as the product page shows it (rounded
 * frames with gaps, so a panorama is judged with its seams), and beneath it the
 * same set with every word removed.
 */
export async function writeSetSheet(spec, file, context) {
  const { sharp } = context
  const H = 760
  const size = SIZES['6.9']
  const W = Math.round((H * size.w) / size.h)
  const g = 28
  const n = spec.frames.length
  const tiles = []
  for (const [row, show] of [
    [0, true],
    [1, false],
  ]) {
    const { strip } = await renderStrip(spec, '6.9', { ...context, show })
    for (let i = 0; i < n; i++) {
      const mask = Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="30" fill="#fff"/></svg>`)
      const tile = await sharp(strip)
        .extract({ left: i * size.w, top: 0, width: size.w, height: size.h })
        .resize(W, H)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer()
      tiles.push({ input: tile, top: g + row * (H + g), left: g + i * (W + g) })
    }
  }
  mkdirSync(path.dirname(file), { recursive: true })
  await sharp({ create: { width: g + n * (W + g), height: g + 2 * (H + g), channels: 3, background: spec.sheetBackground ?? '#E9E9EB' } })
    .composite(tiles)
    .png()
    .toFile(file)
  return file
}

/**
 * Compose every size a set spec asks for, and the review sheet when asked.
 *
 * @param {string} specPath
 * @param {{ sharp: Function, createFont: (data: Buffer) => any }} [deps]
 * @param {{ sheet?: string }} [options]
 */
export async function composeSet(specPath, deps, { sheet } = {}) {
  const { spec, base } = readSpec(specPath)
  const errors = validateSetSpec(spec)
  if (errors.length > 0) throw new Error(`${specPath}:\n  ${errors.join('\n  ')}`)
  const { sharp, createFont } = deps ?? (await loadDeps([process.cwd(), base, repoRoot]))
  const font = readFont(base, spec.font, createFont)
  const bodyFont = spec.bodyFont ? readFont(base, spec.bodyFont, createFont) : font
  const context = { base, sharp, font, bodyFont }
  const sets = []
  const warnings = new Set()
  for (const size of wantedSizes(spec, ['6.9'])) {
    const made = await writeFrames(spec, size, context)
    made.warnings.forEach((w) => warnings.add(w))
    sets.push({ size, frames: made.frames })
  }
  if (sheet) await writeSetSheet(spec, path.resolve(sheet), context)
  return { sets, warnings: [...warnings] }
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {Promise<number>} the exit status
 */
export async function main(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const specPath = flag('--spec')
  if (!specPath) {
    console.error('usage: compose-set.mjs --spec <set.json> [--sheet <review.png>]')
    return 2
  }
  const sheet = flag('--sheet')
  try {
    const { sets, warnings } = await composeSet(specPath, undefined, { sheet })
    console.log(formatSets(sets, SIZES))
    for (const w of warnings) console.log(`warning: ${w}`)
    if (sheet) console.log(`review sheet: ${sheet} (top: as the product page shows it; bottom: copy hidden)\n`)
    return 0
  } catch (error) {
    console.error(error.message)
    return 1
  }
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(await main(process.argv.slice(2)))
}
