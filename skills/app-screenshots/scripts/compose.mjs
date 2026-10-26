/**
 * Compose App Store screenshots from simulator captures.
 *
 *     node .agents/skills/app-screenshots/scripts/compose.mjs --spec <spec.json> [--sheet <review.png>]
 *
 * Deterministic, and offline. Every frame is a brand-coloured canvas, a caption
 * set as glyph outlines, and the real screen inside a drawn device frame. No
 * image model, no API key, and the same input gives the same bytes, which is
 * what lets a regenerated set be diffed rather than eyeballed.
 *
 * The caption is outlines, not text: sharp's bundled libvips ignores
 * FONTCONFIG_FILE and FONTCONFIG_PATH, so a `<text>` element in a brand font
 * silently renders in DejaVu. `outline()` converts glyphs with fontkitten
 * instead, so nothing depends on an installed font.
 *
 * Spec shape (paths are relative to the spec file; every frame field past
 * `caption` and `screen` is optional, and a frame that uses none of them
 * renders as the plain caption-over-device frame):
 *
 *   {
 *     "sizes": ["6.3", "6.9", "6.7"],      // or "size": "6.9"; the default is 6.9 alone
 *     "background": "#0F172A",
 *     "ink": "#FFFFFF",
 *     "accent": "#FFC94D",                  // colour for *marked* words
 *     "subInk": "#FFFFFF99",                // sub-line and quote author; defaults to ink
 *     "font": "<path to a .ttf>",
 *     "bodyFont": "<path to a .ttf>",       // sub-line, badge label, quote; defaults to font
 *     "out": ".",                           // frames land in <out>/<size>/
 *     "frames": [
 *       {
 *         "caption": "Breathe with a *shape*",   // *...* = accent colour
 *         "screen": "caps/01.png",
 *         "slug": "shape",                        // file name; default is the caption, a-z0-9 only
 *         "hero": true,                           // oversized type, up to three lines
 *         "sub": "not a number",                  // one smaller line under the caption
 *         "layout": "bottom",                     // device on top, copy below
 *         "badge": { "value": "4.8", "label": "on the App Store", "source": "ASC rating, <n> ratings, <date>" },
 *         "quote": { "text": "Calmer in a minute", "author": "<name>", "source": "App Store review, <date>" },
 *         "callouts": [{ "crop": [x, y, w, h], "scale": 1.3, "shift": [-0.08, 0] }]
 *       }
 *     ]
 *   }
 *
 * `--sheet <png>` also writes a review sheet: the first three frames side by
 * side as they sit in a search result, and beneath them the same three with
 * every word removed. The second row is the "hide the copy" test.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * Four levels up from this file. When the skill is installed at
 * `<repo>/.agents/skills/app-screenshots/`, that is the repo root.
 */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

/**
 * Portrait sizes App Store Connect accepts, by spec key. Classes and dates are
 * in references/store-assets.md; re-check them every autumn.
 *
 * - "6.3": Dynamic Island (medium display), the iPhone class Apple requires,
 *   and the size a Pro-size simulator captures at.
 * - "6.9" / "6.7": Dynamic Island (large display). 6.7 (1290x2796) is the
 *   largest set `eas metadata:push` can address.
 * - "6.5": Face ID (large display), its own older slot. Never a substitute
 *   for the classes above.
 * - "duo-inner" / "duo-outer": iPhone Duo's two displays. Render them from Duo
 *   simulator captures, in their own spec: a phone capture inside a
 *   Duo-shaped canvas shows the wrong device.
 */
export const SIZES = {
  '6.9': { w: 1320, h: 2868 },
  '6.7': { w: 1290, h: 2796 },
  '6.5': { w: 1242, h: 2688 },
  '6.3': { w: 1206, h: 2622 },
  'duo-inner': { w: 2007, h: 2853 },
  'duo-outer': { w: 1398, h: 2034 },
}

/**
 * The App Store Connect display type a size key is uploaded under, where it is
 * verified. "6.3" most likely maps to APP_IPHONE_61 (push, then
 * `eas metadata:pull` to confirm); Duo has no display type in eas-cli yet.
 */
export const DISPLAY_TYPES = { '6.9': 'APP_IPHONE_67', '6.7': 'APP_IPHONE_67', '6.5': 'APP_IPHONE_65' }

/** Apple takes at most this many screenshots per set. */
export const MAX_FRAMES = 10

/**
 * The sizes a spec asks for: one caption list, rendered at every one of them,
 * so the sets cannot drift apart.
 *
 * @param {{ sizes?: string[], size?: string }} spec
 * @param {string[]} [fallback]
 * @returns {string[]}
 */
export function wantedSizes(spec, fallback = ['6.9']) {
  return spec.sizes ?? (spec.size ? [spec.size] : fallback)
}

/**
 * Size errors of a spec, against the sizes a compositor can render.
 *
 * @param {object} spec
 * @param {Record<string, { w: number, h: number }>} sizes
 * @param {string[]} [fallback]
 * @returns {string[]}
 */
export function sizeErrors(spec, sizes, fallback) {
  const wanted = wantedSizes(spec, fallback)
  if (!Array.isArray(wanted) || wanted.length === 0) return ['"sizes" must be a non-empty array']
  return wanted
    .filter((key) => !sizes[key])
    .map((key) => `unknown size "${key}"; use one of ${Object.keys(sizes).join(', ')}`)
}

const isText = (v) => typeof v === 'string' && v.trim() !== ''

/**
 * A trust signal must say where it comes from.
 *
 * Ratings, user counts and review quotes are the frames most tempting to
 * invent. Apple's asset rules forbid claims that can't be verified, and an
 * invented one makes a careful visitor distrust the rest of the page. So a
 * badge or quote without a `source` is refused, and the source lives in git
 * beside the frame.
 */
function trustErrors(kind, item, at, field) {
  if (item === undefined) return []
  if (!item || typeof item !== 'object') return [`${at}: "${kind}" must be an object`]
  const errors = []
  if (!isText(item[field])) errors.push(`${at}: ${kind} needs "${field}"`)
  if (!isText(item.source)) {
    errors.push(
      `${at}: ${kind} has no "source". Name where it comes from (e.g. "App Store rating, 4.8 from 212 ratings, <date>"); a trust signal that cannot be sourced does not go in the set`,
    )
  }
  return errors
}

/**
 * Everything wrong with a spec that can be known without touching the disk.
 *
 * @param {unknown} spec
 * @returns {string[]} one message per problem; empty when the spec is usable
 */
export function validateSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['the spec must be a JSON object']
  const errors = sizeErrors(spec, SIZES)
  for (const key of ['background', 'ink', 'font']) {
    if (!isText(spec[key])) errors.push(`"${key}" is required`)
  }
  if (!Array.isArray(spec.frames) || spec.frames.length === 0) {
    errors.push('"frames" must be a non-empty array')
    return errors
  }
  for (const [i, frame] of spec.frames.entries()) {
    const at = `frames[${i}]`
    for (const key of ['caption', 'screen']) {
      if (!isText(frame?.[key])) errors.push(`${at}: "${key}" is required`)
    }
    if (!frame || typeof frame !== 'object') continue
    if (frame.layout !== undefined && !['top', 'bottom'].includes(frame.layout)) {
      errors.push(`${at}: "layout" must be "top" or "bottom"`)
    }
    errors.push(...trustErrors('badge', frame.badge, at, 'value'), ...trustErrors('quote', frame.quote, at, 'text'))
    for (const [ci, c] of (Array.isArray(frame.callouts) ? frame.callouts : []).entries()) {
      const crop = c?.crop
      if (!Array.isArray(crop) || crop.length !== 4 || !crop.every((v) => Number.isInteger(v) && v >= 0)) {
        errors.push(`${at}: callouts[${ci}] needs "crop": [x, y, w, h] in capture pixels`)
      }
    }
  }
  return errors
}

/**
 * Where everything sits on a canvas of one size, in pixels, for a plain frame.
 *
 * The caption sits in the top fifth; the device below it, bleeding off the
 * bottom. `safeWidth` keeps captions inside the middle 70% of the canvas: Apple
 * crops between the accepted sizes of a class, and text near the edge is what
 * gets lost. 15% each side survives every one of them.
 *
 * @param {{ w: number, h: number }} size
 */
export function layoutFor(size) {
  const deviceW = Math.round(size.w * 0.78)
  return {
    captionTop: Math.round(size.h * 0.085),
    maxFont: Math.round(size.w * 0.068),
    minFont: Math.round(size.w * 0.04),
    safeWidth: Math.round(size.w * 0.7),
    deviceTop: Math.round(size.h * 0.27),
    deviceW,
    radius: Math.round(deviceW * 0.115),
    bezel: Math.round(deviceW * 0.022),
  }
}

const LINE_COUNT = ['zero', 'one line', 'two lines', 'three lines']

/**
 * Fit a caption to at most `maxLines` lines (two by default), shrinking the
 * type until it does.
 *
 * Two lines is the ceiling on purpose: a caption needing three is a sentence,
 * and it will not be read at thumbnail size in search results. A hero caption
 * is the exception because its lines are one or two words each, set large
 * enough to be the frame. The type shrinks rather than the caption being
 * rejected, because a set that reads beats a set at one exact type size.
 *
 * Below `minFont` it stops and throws. At that point the honest answer is that
 * the caption is too long, not that the renderer should keep going.
 *
 * @param {string} text
 * @param {(text: string, fontSize: number) => number} measure the width of a line, in pixels
 * @param {{ maxWidth: number, maxFont: number, minFont: number, maxLines?: number }} limits
 * @returns {{ lines: string[], fontSize: number }}
 */
export function fitCaption(text, measure, { maxWidth, maxFont, minFont, maxLines = 2 }) {
  const parts = text.split(' ')
  const width = (from, to, size) => measure(parts.slice(from, to).join(' '), size)
  for (let size = maxFont; size >= minFont; size -= 2) {
    if (measure(text, size) <= maxWidth) return { lines: [text], fontSize: size }
    if (maxLines < 2) continue

    // Of the splits that fit, take the most balanced rather than the first
    // found. Taking the first leaves an orphan ("One quiet nudge a / day"),
    // which reads as a mistake even though every line fits.
    let best = null
    for (let i = 1; i < parts.length; i++) {
      const a = width(0, i, size)
      const b = width(i, parts.length, size)
      if (a > maxWidth || b > maxWidth) continue
      const imbalance = Math.abs(a - b)
      if (!best || imbalance < best.imbalance) best = { cuts: [i], imbalance }
    }
    if (!best && maxLines >= 3) {
      for (let i = 1; i < parts.length - 1; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const ws = [width(0, i, size), width(i, j, size), width(j, parts.length, size)]
          if (ws.some((w) => w > maxWidth)) continue
          const imbalance = Math.max(...ws) - Math.min(...ws)
          if (!best || imbalance < best.imbalance) best = { cuts: [i, j], imbalance }
        }
      }
    }
    if (best) {
      const bounds = [0, ...best.cuts, parts.length]
      return { lines: bounds.slice(1).map((end, k) => parts.slice(bounds[k], end).join(' ')), fontSize: size }
    }
  }
  throw new Error(
    `caption will not fit ${LINE_COUNT[maxLines] ?? `${maxLines} lines`} even at ${minFont}px: "${text}". Shorten it; ` +
      'at thumbnail size nobody reads past about five words.',
  )
}

/**
 * Set a line as SVG outlines so the render never depends on an installed font.
 * Returns the width plus a placer, so the caller can centre it.
 *
 * @param {{ unitsPerEm: number, glyphsForString: (s: string) => Array<{ advanceWidth: number, path: { toSVG: () => string } }> }} font a fontkitten font
 * @param {string} text
 * @param {number} size font size in pixels
 * @param {string} fill
 * @returns {{ width: number, svg: (cx: number, y: number) => string }} `svg` centres the line on `cx`, baseline at `y`
 */
export function outline(font, text, size, fill) {
  const parts = []
  let x = 0
  for (const glyph of font.glyphsForString(text)) {
    const d = glyph.path.toSVG()
    if (d) parts.push(`<path d="${d}" transform="translate(${Math.round(x)} 0)"/>`)
    x += glyph.advanceWidth
  }
  const scale = size / font.unitsPerEm
  return {
    width: x * scale,
    svg: (cx, y) =>
      `<g fill="${fill}" transform="translate(${cx - (x * scale) / 2} ${y}) scale(${scale} ${-scale})">${parts.join('')}</g>`,
  }
}

const measureWith = (font) => (text, px) => outline(font, text, px, '#000').width

/**
 * The caption of one plain frame, fitted and centred, as SVG.
 *
 * @param {string} caption
 * @param {Parameters<typeof outline>[0]} font
 * @param {{ w: number, h: number }} size
 * @param {string} ink
 * @returns {{ lines: string[], fontSize: number, svg: string }}
 */
export function captionSvg(caption, font, size, ink) {
  const layout = layoutFor(size)
  const { lines, fontSize } = fitCaption(caption, measureWith(font), {
    maxWidth: layout.safeWidth,
    maxFont: layout.maxFont,
    minFont: layout.minFont,
  })
  const lineGap = Math.round(fontSize * 1.18)
  const svg = lines
    .map((line, li) => outline(font, line, fontSize, ink).svg(size.w / 2, layout.captionTop + fontSize + li * lineGap))
    .join('')
  return { lines, fontSize, svg }
}

/**
 * "Read *anything* aloud" to [{ text, accent }], one entry per word.
 *
 * @param {string} caption
 * @returns {Array<{ text: string, accent: boolean }>}
 */
export function tokens(caption) {
  const out = []
  let accent = false
  for (const raw of caption.split(' ')) {
    let text = raw
    const opens = text.startsWith('*')
    if (opens) text = text.slice(1)
    const closes = text.endsWith('*')
    if (closes) text = text.slice(0, -1)
    out.push({ text, accent: accent || opens })
    if (opens) accent = true
    if (closes) accent = false
  }
  return out
}

/**
 * A caption line with marked words in the accent colour, set as consecutive
 * runs. Kerning across a colour change is lost, which at caption sizes nobody sees.
 */
function accentLine(font, words, size, ink, accent) {
  if (!words.some((w) => w.accent) || !accent) return outline(font, words.map((w) => w.text).join(' '), size, ink)
  const runs = []
  for (const [i, w] of words.entries()) {
    const text = (i ? ' ' : '') + w.text
    const last = runs.at(-1)
    if (last && last.accent === w.accent) last.text += text
    else runs.push({ text, accent: w.accent })
  }
  const set = runs.map((r) => outline(font, r.text, size, r.accent ? accent : ink))
  const width = set.reduce((sum, r) => sum + r.width, 0)
  return {
    width,
    svg: (cx, y) => {
      let x = cx - width / 2
      return set
        .map((r) => {
          const s = r.svg(x + r.width / 2, y)
          x += r.width
          return s
        })
        .join('')
    },
  }
}

/** A laurel branch beside a badge. `side` is -1 (left) or 1 (right). */
function laurel(cx, cy, rx, ry, side, fill) {
  const leaves = []
  const leaf = ry * 0.32
  for (let i = 0; i < 6; i++) {
    const t = i / 5
    const a = (Math.PI / 180) * (side < 0 ? 212 - t * 92 : -32 + t * 92)
    const x = cx + Math.cos(a) * rx
    const y = cy - Math.sin(a) * ry
    // Each leaf points along the branch, tipped outward like a wreath.
    const along = (Math.atan2(-Math.cos(a) * ry, -Math.sin(a) * rx) * 180) / Math.PI
    const tilt = along + side * 28
    leaves.push(
      `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${leaf.toFixed(1)}" ry="${(leaf * 0.4).toFixed(1)}" transform="rotate(${tilt.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${fill}"/>`,
    )
  }
  return leaves.join('')
}

/** A five-point star centred on (cx, cy). */
function star(cx, cy, r, fill) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.45 : r
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`)
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`
}

/**
 * Lay out a designed frame's copy as a stack of blocks starting at `top` (a
 * number, or a function of the stack height). Returns the SVG and where the
 * stack starts and ends, so the device can be placed against it.
 */
function copyStack(spec, frame, size, top, { order, show, font, bodyFont }) {
  const ink = frame.ink ?? spec.ink
  const accent = frame.accent ?? spec.accent
  const subInk = frame.subInk ?? spec.subInk ?? ink
  const safeWidth = Math.round(size.w * 0.7)
  const hero = frame.hero === true
  const { badge, quote } = frame

  const blocks = {
    badge: () => {
      if (!badge) return null
      const vSize = Math.round(size.w * 0.075)
      const lSize = Math.round(size.w * 0.03)
      const value = outline(font, badge.value, vSize, ink)
      const label = badge.label ? outline(bodyFont, badge.label, lSize, subInk) : null
      const h = vSize + (label ? lSize * 1.5 : 0)
      const rx = Math.max(value.width, label?.width ?? 0) / 2 + size.w * 0.07
      const ry = h * 0.62
      return {
        h: h + size.w * 0.03,
        svg: (y) => {
          const cy = y + h / 2
          return (
            laurel(size.w / 2, cy, rx, ry, -1, ink) +
            laurel(size.w / 2, cy, rx, ry, 1, ink) +
            value.svg(size.w / 2, y + vSize * 0.85) +
            (label ? label.svg(size.w / 2, y + vSize + lSize * 1.2) : '')
          )
        },
      }
    },
    caption: () => {
      const toks = tokens(frame.caption)
      const plain = toks.map((t) => t.text).join(' ')
      const { lines, fontSize } = fitCaption(plain, measureWith(font), {
        maxWidth: safeWidth,
        maxFont: Math.round(size.w * (hero ? 0.11 : 0.068)),
        minFont: Math.round(size.w * 0.04),
        maxLines: hero ? 3 : 2,
      })
      const lineGap = Math.round(fontSize * (hero ? 1.04 : 1.18))
      let k = 0
      const set = lines.map((l) => {
        const count = l.split(' ').length
        const ws = toks.slice(k, k + count)
        k += count
        return accentLine(font, ws, fontSize, ink, accent)
      })
      return {
        h: fontSize + (lines.length - 1) * lineGap + Math.round(fontSize * 0.25),
        svg: (y) => set.map((s, li) => s.svg(size.w / 2, y + fontSize + li * lineGap)).join(''),
      }
    },
    sub: () => {
      if (!frame.sub) return null
      const { lines, fontSize } = fitCaption(frame.sub, measureWith(bodyFont), {
        maxWidth: safeWidth,
        maxFont: Math.round(size.w * 0.042),
        minFont: Math.round(size.w * 0.03),
        maxLines: 1,
      })
      const s = outline(bodyFont, lines[0], fontSize, subInk)
      return { h: Math.round(fontSize * 1.6), svg: (y) => s.svg(size.w / 2, y + fontSize * 1.15) }
    },
    quote: () => {
      if (!quote) return null
      const starR = size.w * 0.022
      const { lines, fontSize } = fitCaption(`“${quote.text}”`, measureWith(bodyFont), {
        maxWidth: safeWidth,
        maxFont: Math.round(size.w * 0.045),
        minFont: Math.round(size.w * 0.032),
      })
      const gap = Math.round(fontSize * 1.25)
      const set = lines.map((l) => outline(bodyFont, l, fontSize, ink))
      const author = quote.author ? outline(bodyFont, quote.author, Math.round(fontSize * 0.75), subInk) : null
      const h = starR * 3 + lines.length * gap + (author ? fontSize * 1.2 : 0)
      return {
        h,
        svg: (y) => {
          const stars = [-2, -1, 0, 1, 2].map((i) => star(size.w / 2 + i * starR * 2.4, y + starR, starR, accent ?? ink)).join('')
          const text = set.map((s, li) => s.svg(size.w / 2, y + starR * 3 + fontSize + li * gap)).join('')
          const by = author ? author.svg(size.w / 2, y + starR * 3 + lines.length * gap + fontSize * 0.9) : ''
          return stars + text + by
        },
      }
    },
  }

  const gap = Math.round(size.h * 0.018)
  const built = order.map((name) => blocks[name]()).filter(Boolean)
  const height = built.reduce((sum, b) => sum + b.h, 0) + gap * (built.length - 1)
  let y = typeof top === 'function' ? top(height) : top
  const start = y
  const svg = built
    .map((b) => {
      const s = b.svg(y)
      y += b.h + gap
      return s
    })
    .join('')
  return { svg: show ? svg : '', top: start, bottom: start + height }
}

/** Whether a frame uses nothing past caption and screen. */
export const isPlainFrame = (f) =>
  !f.hero && !f.sub && !f.badge && !f.quote && !f.callouts?.length && (f.layout ?? 'top') === 'top' && !f.caption.includes('*')

/**
 * A file-name slug for a caption.
 *
 * @param {string} s
 * @param {number} [max]
 * @returns {string}
 */
export function slugify(s, max = 40) {
  return s
    .replace(/\*/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
}

/**
 * Refuse an image whose dimensions are not exactly the size Apple takes.
 *
 * @param {{ width?: number, height?: number }} meta
 * @param {{ w: number, h: number }} size
 * @param {string} file named in the error
 */
export function assertDimensions(meta, size, file) {
  if (meta.width !== size.w || meta.height !== size.h) {
    throw new Error(`${file}: ${meta.width}x${meta.height}, expected ${size.w}x${size.h}`)
  }
}

/**
 * Import a dependency without a node_modules beside the skill.
 *
 * This script lives in `.agents/skills/`, which is not a package. Node resolves
 * a bare `import 'sharp'` by walking up from the importing file, which finds
 * nothing when the repo installs sharp only inside an app package. So it
 * resolves from each directory in turn: by default the working directory
 * (run it from a package that depends on sharp and fontkitten), then the repo
 * root (where they may be root devDependencies).
 *
 * @param {string} name
 * @param {string | string[]} [from] directories to resolve from, in order
 * @returns {Promise<any>} the module namespace
 */
export async function loadDependency(name, from = [process.cwd(), repoRoot]) {
  const dirs = Array.isArray(from) ? from : [from]
  for (const dir of dirs) {
    let resolved
    try {
      resolved = createRequire(path.join(dir, 'package.json')).resolve(name)
    } catch {
      continue
    }
    return import(pathToFileURL(resolved).href)
  }
  throw new Error(
    `missing dependency "${name}": not resolvable from ${dirs.join(', ')}. Add it as a devDependency of the repo root ` +
      'and run pnpm install (or npm install), or run this from a package that depends on it',
  )
}

/**
 * sharp and fontkitten, as the renderers take them.
 *
 * @param {string | string[]} [from] see `loadDependency`
 * @returns {Promise<{ sharp: Function, createFont: (data: Buffer) => any }>}
 */
export async function loadDeps(from) {
  const { default: sharp } = await loadDependency('sharp', from)
  const { create } = await loadDependency('fontkitten', from)
  return { sharp, createFont: create }
}

/**
 * An image scaled to `innerW` and cut to rounded corners, as a PNG buffer.
 *
 * @param {Function} sharp
 * @param {string} imagePath
 * @param {number} innerW
 * @param {number} radius
 * @param {number} [height] forced height; the image's own proportions when omitted
 * @returns {Promise<{ buffer: Buffer, height: number, sourceWidth: number }>}
 */
export async function roundedCapture(sharp, imagePath, innerW, radius, height) {
  if (!existsSync(imagePath)) throw new Error(`image not found: ${imagePath}`)
  const meta = await sharp(imagePath).metadata()
  const innerH = height ?? Math.round((innerW / meta.width) * meta.height)
  const mask = Buffer.from(
    `<svg width="${innerW}" height="${innerH}"><rect width="${innerW}" height="${innerH}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  )
  const buffer = await sharp(imagePath)
    .resize(innerW, innerH)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
  return { buffer, height: innerH, sourceWidth: meta.width }
}

/**
 * Flatten a canvas and its layers to an opaque PNG buffer.
 *
 * @param {Function} sharp
 * @param {{ canvas: Buffer, layers: object[], background: string }} frame
 * @returns {Promise<Buffer>}
 */
export function flattenFrame(sharp, { canvas, layers, background }) {
  return sharp(canvas).composite(layers).flatten({ background }).removeAlpha().png({ compressionLevel: 9 }).toBuffer()
}

/**
 * Flatten a canvas and its layers, and write it only if it has exactly the
 * dimensions Apple takes.
 *
 * @param {Function} sharp
 * @param {{ canvas: Buffer, layers: object[], background: string, size: { w: number, h: number }, file: string }} frame
 * @returns {Promise<{ file: string, width: number, height: number, bytes: number }>}
 */
export async function writeFrame(sharp, { canvas, layers, background, size, file }) {
  const buf = await flattenFrame(sharp, { canvas, layers, background })
  const meta = await sharp(buf).metadata()
  assertDimensions(meta, size, file)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, buf)
  return { file, width: meta.width, height: meta.height, bytes: buf.length }
}

/**
 * The canvas and layers of one frame at one size. `show: false` drops every
 * word (the hide-the-copy test of the review sheet).
 *
 * @param {object} spec a spec that passed `validateSpec`
 * @param {object} frame
 * @param {number} n the frame's 1-based position, for error messages
 * @param {string} sizeKey
 * @param {{ base: string, sharp: Function, font: object, bodyFont?: object, show?: boolean }} context
 * @returns {Promise<{ canvas: Buffer, layers: object[], background: string }>}
 */
export async function frameLayers(spec, frame, n, sizeKey, { base, sharp, font, bodyFont = font, show = true }) {
  const size = SIZES[sizeKey]
  const layout = layoutFor(size)
  const background = frame.background ?? spec.background
  const ink = frame.ink ?? spec.ink
  const screenPath = path.resolve(base, frame.screen)

  // The screen, rounded to sit inside the bezel, on a rounded black slab.
  const innerW = layout.deviceW - layout.bezel * 2
  const screen = await roundedCapture(sharp, screenPath, innerW, layout.radius - layout.bezel)
  const deviceH = screen.height + layout.bezel * 2
  const device = Buffer.from(
    `<svg width="${layout.deviceW}" height="${deviceH}"><rect width="${layout.deviceW}" height="${deviceH}" rx="${layout.radius}" ry="${layout.radius}" fill="#0B0B0B"/></svg>`,
  )
  const left = Math.round((size.w - layout.deviceW) / 2)
  const canvasWith = (text) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">` +
        `<rect width="${size.w}" height="${size.h}" fill="${background}"/>${text}</svg>`,
    )

  if (isPlainFrame(frame)) {
    const caption = captionSvg(frame.caption, font, size, ink)
    return {
      canvas: canvasWith(show ? caption.svg : ''),
      layers: [
        { input: device, top: layout.deviceTop, left },
        { input: screen.buffer, top: layout.deviceTop + layout.bezel, left: left + layout.bezel },
      ],
      background,
    }
  }

  // Copy, then the device against it: below the copy for "top", above it for "bottom".
  const ctx = { show, font, bodyFont }
  let copy
  let deviceTop
  if ((frame.layout ?? 'top') === 'top') {
    copy = copyStack(spec, frame, size, layout.captionTop, { ...ctx, order: ['badge', 'caption', 'sub', 'quote'] })
    deviceTop = Math.max(layout.deviceTop, Math.round(copy.bottom + size.h * 0.035))
    if (deviceTop > size.h * 0.5) throw new Error(`frame ${n}: the copy pushes the device below half the frame; cut a block`)
  } else {
    const margin = Math.round(size.h * 0.07)
    copy = copyStack(spec, frame, size, (h) => size.h - margin - h, { ...ctx, order: ['caption', 'sub', 'quote', 'badge'] })
    if (copy.top < size.h * 0.5) throw new Error(`frame ${n}: the copy rises above half the frame; cut a block`)
    deviceTop = Math.round(copy.top - size.h * 0.035) - deviceH
  }

  // Device and screen as one piece, cut to what is visible: sharp composites
  // only inside the canvas.
  let deviceBuf = await sharp(device)
    .composite([{ input: screen.buffer, top: layout.bezel, left: layout.bezel }])
    .png()
    .toBuffer()
  const visibleTop = Math.max(0, deviceTop)
  const visibleBottom = Math.min(size.h, deviceTop + deviceH)
  if (deviceTop < 0 || deviceTop + deviceH > size.h) {
    deviceBuf = await sharp(deviceBuf)
      .extract({ left: 0, top: visibleTop - deviceTop, width: layout.deviceW, height: visibleBottom - visibleTop })
      .png()
      .toBuffer()
  }
  const layers = [{ input: deviceBuf, top: visibleTop, left }]

  // Callouts: a region of the real capture, enlarged and lifted off the
  // device. Mockup UI is not allowed (2.3.3); a crop of the actual screen is the app.
  const k = innerW / screen.sourceWidth
  for (const [ci, c] of (frame.callouts ?? []).entries()) {
    const [x, y, w, h] = c.crop
    const scale = c.scale ?? 1.25
    const [dx, dy] = c.shift ?? [0, 0]
    const cw = Math.round(w * k * scale)
    const ch = Math.round(h * k * scale)
    const cx = left + layout.bezel + (x + w / 2) * k + dx * size.w
    const cy = deviceTop + layout.bezel + (y + h / 2) * k + dy * size.w
    const cl = Math.round(cx - cw / 2)
    const ct = Math.round(cy - ch / 2)
    const pad = Math.round(size.w * 0.04)
    if (cl - pad < 0 || ct - pad < 0 || cl + cw + pad > size.w || ct + ch + pad > size.h) {
      throw new Error(`frame ${n}: callout ${ci + 1} lands outside the canvas; reduce scale or shift`)
    }
    const r = Math.round(c.radius ?? size.w * 0.03)
    const cutMask = Buffer.from(`<svg width="${cw}" height="${ch}"><rect width="${cw}" height="${ch}" rx="${r}" ry="${r}" fill="#fff"/></svg>`)
    const cut = await sharp(screenPath)
      .extract({ left: x, top: y, width: w, height: h })
      .resize(cw, ch)
      .composite([{ input: cutMask, blend: 'dest-in' }])
      .png()
      .toBuffer()
    const blur = Math.round(size.w * 0.025)
    const shadow = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cw + pad * 2}" height="${ch + pad * 2}">` +
        `<filter id="s"><feGaussianBlur stdDeviation="${blur}"/></filter>` +
        `<rect x="${pad}" y="${pad + Math.round(blur * 0.6)}" width="${cw}" height="${ch}" rx="${r}" fill="#000" fill-opacity="0.35" filter="url(#s)"/></svg>`,
    )
    layers.push({ input: shadow, top: ct - pad, left: cl - pad }, { input: cut, top: ct, left: cl })
  }

  return { canvas: canvasWith(copy.svg), layers, background }
}

/**
 * Render every frame of a spec at one size, into `<out>/<size>/`.
 *
 * @param {object} spec a spec that passed `validateSpec`
 * @param {string} sizeKey a key of `SIZES`
 * @param {{ base: string, sharp: Function, font: object, bodyFont?: object }} context `base` is the spec's directory
 * @returns {Promise<Array<{ file: string, width: number, height: number, bytes: number }>>}
 */
export async function renderSize(spec, sizeKey, context) {
  const size = SIZES[sizeKey]
  const out = path.join(path.resolve(context.base, spec.out ?? '.'), sizeKey)
  const made = []
  for (const [i, frame] of spec.frames.entries()) {
    const n = String(i + 1).padStart(2, '0')
    const parts = await frameLayers(spec, frame, i + 1, sizeKey, context)
    made.push(
      await writeFrame(context.sharp, { ...parts, size, file: path.join(out, `${n}-${frame.slug ?? slugify(frame.caption)}.png`) }),
    )
  }
  return made
}

/**
 * The review sheet: frames 1 to 3 as a search result shows them, then the same
 * three with the copy removed. If the second row no longer says what the app
 * does, the visual idea is missing and the copy is carrying the frame alone.
 *
 * @param {object} spec
 * @param {string} file
 * @param {{ base: string, sharp: Function, font: object, bodyFont?: object }} context
 */
export async function writeSheet(spec, file, context) {
  const { sharp } = context
  const frames = spec.frames.slice(0, 3)
  const H = 900
  const W = Math.round((H * SIZES['6.9'].w) / SIZES['6.9'].h)
  const g = 40
  const tiles = []
  for (const [row, show] of [
    [0, true],
    [1, false],
  ]) {
    for (const [i, frame] of frames.entries()) {
      const buf = await flattenFrame(sharp, await frameLayers(spec, frame, i + 1, '6.9', { ...context, show }))
      const mask = Buffer.from(`<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="36" ry="36" fill="#fff"/></svg>`)
      const tile = await sharp(buf).resize(W, H).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
      tiles.push({ input: tile, top: g + row * (H + g), left: g + i * (W + g) })
    }
  }
  mkdirSync(path.dirname(file), { recursive: true })
  await sharp({
    create: { width: g + frames.length * (W + g), height: g + 2 * (H + g), channels: 3, background: spec.sheetBackground ?? '#E9E9EB' },
  })
    .composite(tiles)
    .png()
    .toFile(file)
  return file
}

/**
 * Read and parse a spec file.
 *
 * @param {string | undefined} specPath
 * @returns {{ spec: object, base: string }} `base` is the directory the spec's paths resolve against
 */
export function readSpec(specPath) {
  if (!specPath || !existsSync(specPath)) throw new Error(`spec not found: ${specPath ?? '(none given)'}`)
  let spec
  try {
    spec = JSON.parse(readFileSync(specPath, 'utf8'))
  } catch (error) {
    throw new Error(`${specPath} is not valid JSON: ${error.message}`)
  }
  return { spec, base: path.dirname(path.resolve(specPath)) }
}

/**
 * Parse a font named in the spec, relative to the spec.
 *
 * @param {string} base
 * @param {string} fontFile
 * @param {(data: Buffer) => any} createFont
 */
export function readFont(base, fontFile, createFont) {
  const fontPath = path.resolve(base, fontFile)
  if (!existsSync(fontPath)) throw new Error(`font not found: ${fontPath}`)
  return createFont(readFileSync(fontPath))
}

/**
 * Compose every size a spec file asks for, and the review sheet when asked.
 *
 * @param {string} specPath
 * @param {{ sharp: Function, createFont: (data: Buffer) => any }} [deps] resolved from the working directory, the spec, then the repo root when omitted
 * @param {{ sheet?: string }} [options]
 * @returns {Promise<Array<{ size: string, frames: Awaited<ReturnType<typeof renderSize>> }>>}
 */
export async function compose(specPath, deps, { sheet } = {}) {
  const { spec, base } = readSpec(specPath)
  const errors = validateSpec(spec)
  if (errors.length > 0) throw new Error(`${specPath}:\n  ${errors.join('\n  ')}`)
  const { sharp, createFont } = deps ?? (await loadDeps([process.cwd(), base, repoRoot]))
  const font = readFont(base, spec.font, createFont)
  const bodyFont = spec.bodyFont ? readFont(base, spec.bodyFont, createFont) : font
  const context = { base, sharp, font, bodyFont }
  const sets = []
  for (const size of wantedSizes(spec)) sets.push({ size, frames: await renderSize(spec, size, context) })
  if (sheet) await writeSheet(spec, path.resolve(sheet), context)
  return sets
}

/**
 * The lines `main` prints for the rendered sets.
 *
 * @param {Awaited<ReturnType<typeof compose>>} sets
 * @param {Record<string, { w: number, h: number }>} [sizes]
 * @returns {string}
 */
export function formatSets(sets, sizes = SIZES) {
  return sets
    .map(({ size, frames }) => {
      const rows = frames.map(
        (f) => `  ${path.relative(process.cwd(), f.file)}  ${f.width}x${f.height}  ${(f.bytes / 1024).toFixed(0)} KB`,
      )
      const over = frames.length > MAX_FRAMES ? `\nApple accepts at most ${MAX_FRAMES} per set; trim before uploading.\n` : ''
      return `\n${size}" (${sizes[size].w}x${sizes[size].h})\n${rows.join('\n')}\n${over}`
    })
    .join('')
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {Promise<number>} the exit status
 */
export async function main(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const specPath = flag('--spec')
  if (!specPath) {
    console.error('usage: compose.mjs --spec <spec.json> [--sheet <review.png>]')
    return 2
  }
  const sheet = flag('--sheet')
  try {
    console.log(formatSets(await compose(specPath, undefined, { sheet })))
    if (sheet) console.log(`review sheet: ${sheet} (top: as shipped; bottom: copy hidden)\n`)
    return 0
  } catch (error) {
    console.error(error.message)
    return 1
  }
}

// realpath: the skill is also reachable through .claude/skills and .codex/skills, and a guard that
// compared the symlink's path with this file's would make that call a silent no-op
if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(await main(process.argv.slice(2)))
}
