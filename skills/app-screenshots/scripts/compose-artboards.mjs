/**
 * Compose App Store screenshots from designed artboards.
 *
 *     node .agents/skills/app-screenshots/scripts/compose-artboards.mjs --spec <artboards.json>
 *
 * The sibling `compose.mjs` is one caption over one device on one flat ground.
 * This one reproduces a designed set: a 430x932 artboard per frame with its
 * own ground colour, a headline where one word can sit in a tilted pill beside
 * a blob, and either a device, a stack of phase cards, or a checklist below
 * it. The geometry is read straight off the design's CSS (positions, radii,
 * the eight-value `border-radius` of every blob) and drawn as SVG, so the
 * result is pixel-faithful without a browser in the loop.
 *
 * What is NOT reproduced from the design: the screen inside the phone. The
 * design draws a mockup there; App Review wants the app as it runs (2.3.3), so
 * a real simulator capture goes in its place. The device chrome around it is
 * the design's.
 *
 * Deterministic and offline, like compose.mjs: same spec and captures in, same
 * bytes out. sharp and fontkitten resolve the same way (working directory,
 * then the spec, then the repo root).
 *
 * Spec shape (paths are relative to the spec file):
 *
 *   {
 *     "sizes": ["6.3", "6.9", "6.7"],
 *     "font": "<path to a bold .ttf>",
 *     "out": ".",
 *     "frames": [
 *       { "kind": "device", "background": "#FFF3E2", "ink": "#26211B",
 *         "eyebrow": "<app name>", "eyebrowInk": "#01684E",   // eyebrow ink defaults to the frame's ink
 *         "headline": ["One tiny", { "pill": "breath", "blob": "#8E96FE", "shape": "a", "rotate": -3 }, "at a time"],
 *         "screen": "caps/01-hero.png" },
 *       { "kind": "phases",    ..., "phases": [{ "label", "sub", "fill", "ink", "subInk", "blob": { "fill", "size", "shape" } }] },
 *       { "kind": "checklist", ..., "rows": [{ "text", "fill", "ink" }], "logo": "<png>", "wordmark": "<app name>" }
 *     ]
 *   }
 */
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  SIZES as CAPTION_SIZES,
  formatSets,
  loadDeps,
  readFont,
  readSpec,
  repoRoot,
  roundedCapture,
  sizeErrors,
  slugify,
  wantedSizes,
  writeFrame,
} from './compose.mjs'

/** The artboard the design was drawn on. Every measure below is in these units. */
export const ART = { w: 430, h: 932 }

/**
 * Apple's accepted portrait sizes that share the artboard's proportions: the
 * large Dynamic Island class (6.9, 6.7) and the required medium one (6.3).
 */
export const SIZES = { '6.9': CAPTION_SIZES['6.9'], '6.7': CAPTION_SIZES['6.7'], '6.3': CAPTION_SIZES['6.3'] }

/** Rendered when the spec names no sizes. */
export const DEFAULT_SIZES = ['6.9', '6.7']

/** What sits below the headline of a frame. */
export const FRAME_KINDS = ['device', 'phases', 'checklist']

/** The ink used when a frame or pill names none. */
const DEFAULT_INK = '#26211B'

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * A run of text as SVG outlines, in artboard units.
 *
 * Returns the width so callers can centre it, and the vertical metrics so a
 * line can be placed the way CSS places it: the glyph box centred inside a
 * line box of `lineHeight * size`.
 *
 * @param {{ unitsPerEm: number, ascent?: number, descent?: number, glyphsForString: (s: string) => Array<{ advanceWidth: number, path: { toSVG: () => string } }> }} font a fontkitten font
 * @param {string} str
 * @param {number} size
 * @param {string} fill
 * @param {{ tracking?: number }} [options] CSS letter-spacing, in artboard units
 * @returns {{ width: number, ascent: number, descent: number, at: (px: number, py: number, lh?: number) => string }}
 *   `at` places the line box's top-left at (px, py) with line height `lh`
 */
export function text(font, str, size, fill, { tracking = 0 } = {}) {
  const scale = size / font.unitsPerEm
  const parts = []
  let x = 0
  const glyphs = font.glyphsForString(str)
  for (const [i, glyph] of glyphs.entries()) {
    const d = glyph.path.toSVG()
    if (d) parts.push(`<path d="${d}" transform="translate(${x.toFixed(2)} 0)"/>`)
    x += glyph.advanceWidth
    // CSS letter-spacing is added after every glyph including the last; the
    // last one is trimmed here so a centred line is centred on its ink.
    if (i < glyphs.length - 1) x += tracking / scale
  }
  const width = x * scale
  const ascent = (font.ascent ?? font.unitsPerEm * 0.8) * scale
  const descent = Math.abs(font.descent ?? -font.unitsPerEm * 0.2) * scale
  return {
    width,
    ascent,
    descent,
    at: (px, py, lh = size * 1.02) => {
      const baseline = py + (lh - (ascent + descent)) / 2 + ascent
      return `<g fill="${fill}" transform="translate(${px.toFixed(2)} ${baseline.toFixed(2)}) scale(${scale} ${-scale})">${parts.join('')}</g>`
    },
  }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * The design's four blob silhouettes, as CSS eight-value border-radius:
 * horizontal radii TL TR BR BL, then vertical radii TL TR BR BL, in percent.
 */
export const SHAPES = {
  a: [[44, 56, 58, 42], [46, 42, 58, 54]],
  b: [[58, 42, 45, 55], [52, 58, 42, 48]],
  c: [[50, 50, 42, 58], [58, 46, 54, 42]],
  d: [[52, 48, 42, 58], [55, 46, 54, 45]],
}

/**
 * A rectangle with elliptical corners, exactly as CSS renders border-radius.
 *
 * Each corner is one elliptical arc. CSS scales every radius down by the same
 * factor when adjacent radii would overlap, which is what keeps a 58% + 45%
 * pair from folding the shape; the same rule is applied here.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {string} [shape] a key of `SHAPES`; anything else draws shape `a`
 * @returns {string} an SVG path `d`
 */
export function blobPath(x, y, w, h, shape) {
  const [hs, vs] = SHAPES[shape] ?? SHAPES.a
  let rx = hs.map((p) => (p / 100) * w)
  let ry = vs.map((p) => (p / 100) * h)
  const f = Math.min(1, w / (rx[0] + rx[1]), w / (rx[3] + rx[2]), h / (ry[0] + ry[3]), h / (ry[1] + ry[2]))
  rx = rx.map((r) => r * f)
  ry = ry.map((r) => r * f)
  const n = (v) => v.toFixed(2)
  return (
    `M ${n(x + rx[0])} ${n(y)} ` +
    `H ${n(x + w - rx[1])} A ${n(rx[1])} ${n(ry[1])} 0 0 1 ${n(x + w)} ${n(y + ry[1])} ` +
    `V ${n(y + h - ry[2])} A ${n(rx[2])} ${n(ry[2])} 0 0 1 ${n(x + w - rx[2])} ${n(y + h)} ` +
    `H ${n(x + rx[3])} A ${n(rx[3])} ${n(ry[3])} 0 0 1 ${n(x)} ${n(y + h - ry[3])} ` +
    `V ${n(y + ry[0])} A ${n(rx[0])} ${n(ry[0])} 0 0 1 ${n(x + rx[0])} ${n(y)} Z`
  )
}

const blob = (x, y, size, fill, shape) => `<path d="${blobPath(x, y, size, size, shape)}" fill="${fill}"/>`

const roundRect = (x, y, w, h, r, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}" ${extra}/>`

/** The design's checkmark: a 24-unit polyline, stroke 2.6, round caps. */
const check = (x, y, size, stroke) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})"><polyline points="20 6 9 17 4 12" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`

// ---------------------------------------------------------------------------
// The headline: lines of text, one of which is a tilted pill around a blob
// ---------------------------------------------------------------------------

const H_SIZE = 50
const H_LH = H_SIZE * 1.02
const H_TRACK = -0.025 * H_SIZE
const H_GAP = 4

/**
 * Lay out one headline, centred on the artboard, top edge at `top`.
 *
 * A line is a string, a pill object, or an array mixing both (`["Oder", pill]`).
 * Pill geometry is the CSS: padding 6/20/8/8, a 46px blob, 10px gap, rotated
 * about its own centre, with the soft shadow the design gives it.
 *
 * @param {Parameters<typeof text>[0]} font
 * @param {Array<string | object | Array<string | object>>} lines
 * @param {string} ink
 * @param {number} top
 * @returns {{ svg: string, height: number }} the height consumed, so what follows can be placed relative to it
 */
export function headline(font, lines, ink, top) {
  const out = []
  let y = top
  for (const line of lines) {
    const items = Array.isArray(line) ? line : [line]
    const measured = items.map((it) => {
      if (typeof it === 'string') {
        const t = text(font, it, H_SIZE, ink, { tracking: H_TRACK })
        return { kind: 'text', w: t.width, h: H_LH, t }
      }
      const size = it.size ?? H_SIZE
      const blobSize = it.blobSize ?? 46
      const t = text(font, it.pill, size, it.ink ?? DEFAULT_INK, { tracking: -0.025 * size })
      const lh = size * 1.02
      const w = 8 + blobSize + 10 + t.width + 20
      const h = 6 + Math.max(blobSize, lh) + 8
      return { kind: 'pill', w, h, t, blobSize, lh, it }
    })
    const gap = items.length > 1 ? 12 : 0
    const rowW = measured.reduce((s, m) => s + m.w, 0) + gap * (items.length - 1)
    const rowH = Math.max(...measured.map((m) => m.h))
    let x = (ART.w - rowW) / 2
    for (const m of measured) {
      const cy = y + rowH / 2
      if (m.kind === 'text') {
        out.push(m.t.at(x, cy - m.h / 2, m.h))
      } else {
        const { it } = m
        const px = x
        const py = cy - m.h / 2
        const inner = Math.max(m.blobSize, m.lh)
        out.push(
          `<g transform="rotate(${it.rotate ?? -3} ${(px + m.w / 2).toFixed(2)} ${(py + m.h / 2).toFixed(2)})">` +
            `<rect x="${px}" y="${py}" width="${m.w}" height="${m.h}" rx="${m.h / 2}" fill="${it.fill ?? '#FFFDF9'}" filter="url(#pillshadow)"/>` +
            blob(px + 8, py + 6 + (inner - m.blobSize) / 2, m.blobSize, it.blob, it.shape ?? 'a') +
            m.t.at(px + 8 + m.blobSize + 10, py + 6 + (inner - m.lh) / 2, m.lh) +
            '</g>',
        )
      }
      x += m.w + gap
    }
    y += rowH + H_GAP
  }
  return { svg: out.join(''), height: y - top - H_GAP }
}

// ---------------------------------------------------------------------------
// The device: the design's chrome, a real capture inside
// ---------------------------------------------------------------------------

/** The phone the design draws, in artboard units. */
export const DEVICE = { w: 330, h: 714, top: 352, radius: 56, bezel: 9, innerRadius: 47, shell: '#1A1714' }

function deviceSlab() {
  const x = (ART.w - DEVICE.w) / 2
  return roundRect(x, DEVICE.top, DEVICE.w, DEVICE.h, DEVICE.radius, DEVICE.shell, 'filter="url(#deviceshadow)"')
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const isText = (v) => typeof v === 'string' && v.trim() !== ''

function headlineErrors(lines, at) {
  if (!Array.isArray(lines) || lines.length === 0) return [`${at}: "headline" must be a non-empty array of lines`]
  const errors = []
  for (const [li, line] of lines.entries()) {
    const items = Array.isArray(line) ? line : [line]
    if (items.length === 0) errors.push(`${at}: headline[${li}] is empty`)
    for (const it of items) {
      if (typeof it === 'string') {
        if (!isText(it)) errors.push(`${at}: headline[${li}] has an empty string`)
      } else if (!it || typeof it !== 'object' || Array.isArray(it)) {
        errors.push(`${at}: headline[${li}] must be a string, a pill object, or an array of both`)
      } else {
        if (!isText(it.pill)) errors.push(`${at}: headline[${li}] pill needs "pill", the word inside it`)
        if (!isText(it.blob)) errors.push(`${at}: headline[${li}] pill needs "blob", the blob's colour`)
      }
    }
  }
  return errors
}

/** What each frame kind needs beyond the fields every frame has. */
const KIND_ERRORS = {
  device: (frame, at) => (isText(frame.screen) ? [] : [`${at}: a device frame needs "screen", the simulator capture`]),
  phases: (frame, at) => {
    if (!Array.isArray(frame.phases) || frame.phases.length === 0) return [`${at}: a phases frame needs a non-empty "phases"`]
    const errors = []
    for (const [i, p] of frame.phases.entries()) {
      for (const key of ['label', 'sub', 'fill', 'ink']) {
        if (!isText(p?.[key])) errors.push(`${at}: phases[${i}] needs "${key}"`)
      }
      if (!isText(p?.blob?.fill) || !(p?.blob?.size > 0)) errors.push(`${at}: phases[${i}] needs "blob" with "fill" and "size"`)
    }
    return errors
  },
  checklist: (frame, at) => {
    const errors = []
    if (!Array.isArray(frame.rows) || frame.rows.length === 0) errors.push(`${at}: a checklist frame needs a non-empty "rows"`)
    for (const [i, r] of (Array.isArray(frame.rows) ? frame.rows : []).entries()) {
      for (const key of ['text', 'fill', 'ink']) {
        if (!isText(r?.[key])) errors.push(`${at}: rows[${i}] needs "${key}"`)
      }
    }
    if (!isText(frame.wordmark)) errors.push(`${at}: a checklist frame needs "wordmark"`)
    return errors
  },
}

/**
 * Everything wrong with an artboard spec that can be known without touching the disk.
 *
 * @param {unknown} spec
 * @returns {string[]} one message per problem; empty when the spec is usable
 */
export function validateArtboardSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return ['the spec must be a JSON object']
  const errors = sizeErrors(spec, SIZES, DEFAULT_SIZES)
  if (!isText(spec.font)) errors.push('"font" is required')
  if (!Array.isArray(spec.frames) || spec.frames.length === 0) {
    errors.push('"frames" must be a non-empty array')
    return errors
  }
  for (const [i, frame] of spec.frames.entries()) {
    const at = `frames[${i}]`
    if (!frame || typeof frame !== 'object') {
      errors.push(`${at}: must be an object`)
      continue
    }
    if (!FRAME_KINDS.includes(frame.kind)) {
      errors.push(`${at}: unknown kind "${frame.kind}"; use one of ${FRAME_KINDS.join(', ')}`)
    } else {
      errors.push(...KIND_ERRORS[frame.kind](frame, at))
    }
    if (!isText(frame.background)) errors.push(`${at}: "background" is required`)
    errors.push(...headlineErrors(frame.headline, at))
  }
  return errors
}

// ---------------------------------------------------------------------------
// Frame kinds
// ---------------------------------------------------------------------------

/**
 * The vector part of one frame, in artboard units: eyebrow, headline, and the
 * body its kind draws. Bitmaps (the capture, the logo) are layered on by
 * `renderSize`; `logoAt` says where a checklist's logo goes.
 *
 * @param {Parameters<typeof text>[0]} font
 * @param {object} frame a frame that passed `validateArtboardSpec`
 * @returns {{ svg: string, logoAt: { x: number, y: number } | null }}
 */
export function frameSvg(font, frame) {
  if (!FRAME_KINDS.includes(frame.kind)) {
    throw new Error(`unknown frame kind "${frame.kind}"; use one of ${FRAME_KINDS.join(', ')}`)
  }
  const ink = frame.ink ?? DEFAULT_INK
  const body = []
  let logoAt = null
  let top = frame.eyebrow ? 64 : 80
  if (frame.eyebrow) {
    const e = text(font, frame.eyebrow, 14, frame.eyebrowInk ?? ink, { tracking: 0.18 * 14 })
    body.push(e.at((ART.w - e.width) / 2, top, 14 * 1.2))
    top += 14 * 1.2 + 22
  }
  const h = headline(font, frame.headline, ink, top)
  body.push(h.svg)

  if (frame.kind === 'device') {
    body.push(deviceSlab())
  }

  if (frame.kind === 'phases') {
    // Cards from top 360, 112 tall, 14 apart, 28 in from each side.
    let y = 360
    for (const p of frame.phases) {
      const x = 28
      const w = ART.w - 56
      body.push(roundRect(x, y, w, 112, 30, p.fill))
      const label = text(font, p.label, 24, p.ink)
      const sub = text(font, p.sub, 15, p.subInk ?? p.ink)
      const block = 24 * 1.02 + 2 + 15 * 1.02
      const ty = y + (112 - block) / 2
      body.push(label.at(x + 26, ty, 24 * 1.02))
      body.push(sub.at(x + 26, ty + 24 * 1.02 + 2, 15 * 1.02))
      const b = p.blob
      body.push(blob(x + w - 26 - b.size, y + (112 - b.size) / 2, b.size, b.fill, b.shape))
      y += 112 + 14
    }
  }

  if (frame.kind === 'checklist') {
    // The design lays the artboard out as a column with space-between: the
    // headline at the top, the rows in the middle, the logo lockup at the
    // bottom, inside 80/32/72 padding.
    const rowH = 18 + 20 * 1.02 + 18
    const rowsH = frame.rows.length * rowH + (frame.rows.length - 1) * 12
    const logoH = 64
    const free = ART.h - 80 - 72 - h.height - rowsH - logoH
    let y = top + h.height + free / 2
    for (const r of frame.rows) {
      body.push(roundRect(32, y, ART.w - 64, rowH, 24, r.fill))
      body.push(check(32 + 22, y + (rowH - 22) / 2, 22, r.ink))
      const t = text(font, r.text, 20, r.ink)
      body.push(t.at(32 + 22 + 22 + 14, y + 18, 20 * 1.02))
      y += rowH + 12
    }
    const wm = text(font, frame.wordmark, 26, ink, { tracking: 0.02 * 26 })
    const lockW = 64 + 14 + wm.width
    const lx = (ART.w - lockW) / 2
    const ly = ART.h - 72 - logoH
    body.push(wm.at(lx + 64 + 14, ly + (64 - 26 * 1.02) / 2, 26 * 1.02))
    logoAt = { x: lx, y: ly }
  }

  return { svg: body.join(''), logoAt }
}

/**
 * The words of a frame's headline, for its file name.
 *
 * @param {{ headline: Array<string | object | Array<string | object>> }} frame
 * @returns {string}
 */
export function captionOf(frame) {
  return frame.headline
    .flat()
    .map((l) => (typeof l === 'string' ? l : l.pill))
    .join(' ')
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Render every frame of a spec at one size, into `<out>/<size>/`.
 *
 * @param {object} spec a spec that passed `validateArtboardSpec`
 * @param {string} sizeKey a key of `SIZES`
 * @param {{ base: string, sharp: Function, font: Parameters<typeof text>[0] }} context `base` is the spec's directory
 * @returns {Promise<Array<{ file: string, width: number, height: number, bytes: number }>>}
 */
export async function renderSize(spec, sizeKey, { base, sharp, font }) {
  const size = SIZES[sizeKey]
  const s = size.w / ART.w
  const out = path.join(path.resolve(base, spec.out ?? '.'), sizeKey)
  const made = []

  for (const [i, frame] of spec.frames.entries()) {
    const n = String(i + 1).padStart(2, '0')
    const { svg: inner, logoAt } = frameSvg(font, frame)
    const canvas = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">
        <defs>
          <filter id="pillshadow" x="-20%" y="-40%" width="140%" height="200%">
            <feDropShadow dx="0" dy="8" stdDeviation="11" flood-color="${frame.pillShadow ?? DEFAULT_INK}" flood-opacity="${frame.pillShadowOpacity ?? 0.14}"/>
          </filter>
          <filter id="deviceshadow" x="-25%" y="-15%" width="150%" height="140%">
            <feDropShadow dx="0" dy="30" stdDeviation="30" flood-color="${DEFAULT_INK}" flood-opacity="0.22"/>
          </filter>
        </defs>
        <rect width="${size.w}" height="${size.h}" fill="${frame.background}"/>
        <g transform="scale(${s})">${inner}</g>
      </svg>`,
    )

    const layers = []
    if (frame.kind === 'device') {
      const innerW = Math.round((DEVICE.w - DEVICE.bezel * 2) * s)
      const screen = await roundedCapture(sharp, path.resolve(base, frame.screen), innerW, Math.round(DEVICE.innerRadius * s))
      layers.push({
        input: screen.buffer,
        left: Math.round(((ART.w - DEVICE.w) / 2 + DEVICE.bezel) * s),
        top: Math.round((DEVICE.top + DEVICE.bezel) * s),
      })
      // The design's Dynamic Island, drawn over the capture like the design
      // draws it over its mockup: 96x28 at top 10, centred.
      const island = Buffer.from(
        `<svg width="${Math.round(96 * s)}" height="${Math.round(28 * s)}"><rect width="100%" height="100%" rx="${14 * s}" fill="${DEVICE.shell}"/></svg>`,
      )
      layers.push({
        input: island,
        left: Math.round((ART.w / 2 - 48) * s),
        top: Math.round((DEVICE.top + DEVICE.bezel + 10) * s),
      })
    }
    if (frame.kind === 'checklist' && frame.logo) {
      const px = Math.round(64 * s)
      const logo = await roundedCapture(sharp, path.resolve(base, frame.logo), px, Math.round(15 * s), px)
      layers.push({ input: logo.buffer, left: Math.round(logoAt.x * s), top: Math.round(logoAt.y * s) })
    }

    made.push(
      await writeFrame(sharp, {
        canvas,
        layers,
        background: frame.background,
        size,
        file: path.join(out, `${n}-${frame.slug ?? slugify(captionOf(frame), 44)}.png`),
      }),
    )
  }
  return made
}

/**
 * Compose every size an artboard spec file asks for.
 *
 * @param {string} specPath
 * @param {{ sharp: Function, createFont: (data: Buffer) => any }} [deps] resolved from the working directory, the spec, then the repo root when omitted
 * @returns {Promise<Array<{ size: string, frames: Awaited<ReturnType<typeof renderSize>> }>>}
 */
export async function composeArtboards(specPath, deps) {
  const { spec, base } = readSpec(specPath)
  const errors = validateArtboardSpec(spec)
  if (errors.length > 0) throw new Error(`${specPath}:\n  ${errors.join('\n  ')}`)
  const { sharp, createFont } = deps ?? (await loadDeps([process.cwd(), base, repoRoot]))
  const font = readFont(base, spec.font, createFont)
  const sets = []
  for (const size of wantedSizes(spec, DEFAULT_SIZES)) {
    sets.push({ size, frames: await renderSize(spec, size, { base, sharp, font }) })
  }
  return sets
}

/**
 * @param {string[]} argv arguments after the script name
 * @returns {Promise<number>} the exit status
 */
export async function main(argv) {
  const at = argv.indexOf('--spec')
  if (at === -1 || !argv[at + 1]) {
    console.error('usage: compose-artboards.mjs --spec <spec.json>')
    return 2
  }
  try {
    console.log(formatSets(await composeArtboards(argv[at + 1]), SIZES))
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
