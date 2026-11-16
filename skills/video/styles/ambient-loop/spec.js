// The ambient-loop spec: plain data, no DOM. A silent loop for the App Store header (21:9) and the
// search-result tile (3:2): a ground and a list of layers, every one of which completes a whole
// number of cycles in the loop's length, so the last frame wraps to the first as one ordinary step.
// The browser engine (engine.js) and node (tests) read this file.
//
//   { title, seconds, fps, formats, palette, ground, ground2, grain, layers: [{ kind, color, at, size, ... }], mark }
//
// Sizes are fractions of the frame's short side, positions fractions of the frame, so one spec fills
// both formats. There is no sound, no text and no call to action: the store page has the button.

// 3:2 is 3600x2400 and not 3840x2560: 3840x2560 is 38,400 H.264 macroblocks per frame, level 5.2 holds
// 36,864, x264 then writes level 6.0 and the macOS hardware decoder refuses the file. 3600x2400 is
// 33,750. The 21:9 header, 24,720, is level 5.1.
export const FORMATS = { header: [3840, 1646], search: [3600, 2400] }
export const KINDS = ['orb', 'ring', 'ribbon', 'tile']
export const BLENDS = ['normal', 'screen', 'multiply', 'lighten', 'soft-light', 'overlay']
export const MAX_MARK = 0.14
const TOP_KEYS = new Set(['title', 'seconds', 'fps', 'formats', 'palette', 'ground', 'ground2', 'grain', 'layers', 'mark', 'sources'])
const LAYER_KEYS = new Set(['kind', 'color', 'opacity', 'blend', 'at', 'only', 'size', 'drift', 'breathe', 'soft', 'width', 'radius', 'turns', 'amp', 'waves', 'flow', 'ph'])
const HEX = /^#[0-9a-f]{3,8}$/i

/**
 * Throws `spec: <where>: <what>`. Checks that the loop is a whole number of frames, that every layer's
 * cycle counts are whole numbers (a fractional one jumps at the wrap), that every layer moves, that the
 * format list is one the stores take, and that the loop has no sound, text or call to action.
 */
export function validateSpec(spec) {
  const bad = (m) => { throw new Error(`spec: ${m}`) }
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  const whole = (v) => Number.isInteger(v)
  const frac = (v) => num(v) && v >= 0 && v <= 1
  const pair = (v) => Array.isArray(v) && v.length === 2 && v.every(frac)
  if (!spec || typeof spec !== 'object') bad('not an object')
  for (const k of Object.keys(spec)) {
    if (['audio', 'music', 'cues', 'cta', 'text', 'captions', 'words'].includes(k)) bad(`${k}: an ambient loop has no sound, no text and no call to action (the store page has the button)`)
    if (!TOP_KEYS.has(k)) bad(`unknown key "${k}" (keys: ${[...TOP_KEYS].join(', ')})`)
  }
  if (!(num(spec.seconds) && spec.seconds >= 5 && spec.seconds <= 30)) bad('seconds is the loop\'s length, 5 to 30')
  const fps = spec.fps ?? 30
  if (!(num(fps) && fps >= 24 && fps <= 60)) bad('fps is 24 to 60 (30 for a slow loop)')
  if (!whole(Math.round(spec.seconds * fps * 1e6) / 1e6)) bad(`seconds x fps is ${spec.seconds * fps}: a loop is a whole number of frames, or the wrap lands between two`)
  const formats = spec.formats ?? Object.keys(FORMATS)
  if (!Array.isArray(formats) || !formats.length) bad('formats is a list')
  for (const f of formats) if (!FORMATS[f]) bad(`formats: "${f}" is not a store format (${Object.keys(FORMATS).join(', ')})`)
  if (!spec.palette || typeof spec.palette !== 'object') bad('palette is { name: "#hex" }')
  for (const [k, v] of Object.entries(spec.palette)) if (typeof v !== 'string' || !HEX.test(v)) bad(`palette.${k}: a #hex colour`)
  const colour = (c) => spec.palette[c] != null || HEX.test(c ?? '')
  if (!colour(spec.ground)) bad('ground is a palette name or a #hex (the flat colour under everything)')
  if (spec.ground2 != null && !colour(spec.ground2)) bad('ground2 is a palette name or a #hex (the other end of a slow vertical gradient)')
  if (spec.grain != null && !(num(spec.grain) && spec.grain >= 0 && spec.grain <= 0.15)) bad('grain is 0 to 0.15 (0.045 by default)')
  if (!Array.isArray(spec.layers) || spec.layers.length < 1 || spec.layers.length > 16) bad('layers is a list of 1 to 16')
  spec.layers.forEach((l, i) => {
    const where = `layers[${i}] ${l.kind ?? '?'}`
    for (const k of Object.keys(l)) if (!LAYER_KEYS.has(k)) bad(`${where}: unknown key "${k}"`)
    if (!KINDS.includes(l.kind)) bad(`${where}: kind is one of ${KINDS.join(', ')}`)
    if (!colour(l.color)) bad(`${where}: color is a palette name or a #hex`)
    if (l.opacity != null && !frac(l.opacity)) bad(`${where}: opacity is 0 to 1`)
    if (l.blend != null && !BLENDS.includes(l.blend)) bad(`${where}: blend is one of ${BLENDS.join(', ')}`)
    if (l.only != null && !FORMATS[l.only]) bad(`${where}: only is one of ${Object.keys(FORMATS).join(', ')}`)
    const at = l.at
    if (!(pair(at) || (at && typeof at === 'object' && !Array.isArray(at) && Object.keys(at).length && Object.entries(at).every(([f, p]) => FORMATS[f] && pair(p))))) bad(`${where}: at is [x, y] as fractions of the frame, or { header: [x, y], search: [x, y] }`)
    if (!(num(l.size) && l.size > 0 && l.size <= 3)) bad(`${where}: size is a fraction of the frame's short side, above 0 and up to 3`)
    if (l.soft != null && (l.kind !== 'orb' || !frac(l.soft))) bad(`${where}: soft is 0 to 1 and belongs to an orb`)
    if (l.kind === 'ring' && !(num(l.width) && l.width > 0 && l.width < l.size)) bad(`${where}: a ring needs width, its stroke as a fraction of the short side`)
    if (l.kind === 'tile') {
      if (l.radius != null && !(num(l.radius) && l.radius >= 0 && l.radius <= 0.5)) bad(`${where}: radius is 0 to 0.5 of the tile's side`)
      if (l.width != null && !(num(l.width) && l.width > 0)) bad(`${where}: width is the outline's stroke; leave it out for a filled tile`)
    }
    if (l.kind === 'ribbon') {
      if (!(num(l.amp) && l.amp >= 0 && l.amp <= 1)) bad(`${where}: a ribbon needs amp, the wave's height as a fraction of the short side`)
      if (!(num(l.waves) && l.waves > 0 && l.waves <= 8)) bad(`${where}: waves is the wavelengths across the frame, above 0 and up to 8`)
    }
    // every moving thing completes a whole number of cycles in the loop
    let moves = false
    const whole1 = (v, name) => {
      if (!whole(v)) bad(`${where} ${name}: ${v} is not a whole number; every moving thing completes whole cycles in the loop (${spec.seconds} s), or the loop jumps at the wrap`)
      return v !== 0
    }
    if (l.drift) {
      for (const k of Object.keys(l.drift)) if (!['kx', 'ky', 'rx', 'ry', 'ph'].includes(k)) bad(`${where} drift: unknown key "${k}"`)
      const kx = whole1(l.drift.kx ?? 1, 'drift.kx')
      const ky = whole1(l.drift.ky ?? 1, 'drift.ky')
      for (const k of ['rx', 'ry']) if (l.drift[k] != null && !(num(l.drift[k]) && Math.abs(l.drift[k]) <= 1)) bad(`${where} drift.${k}: a fraction of the short side, 1 at most`)
      moves ||= (kx && l.drift.rx) || (ky && l.drift.ry)
    }
    if (l.breathe) {
      for (const k of Object.keys(l.breathe)) if (!['cycles', 'amount', 'ph'].includes(k)) bad(`${where} breathe: unknown key "${k}"`)
      const k = whole1(l.breathe.cycles ?? 1, 'breathe.cycles')
      if (!(num(l.breathe.amount ?? 0.05) && Math.abs(l.breathe.amount ?? 0.05) < 0.9)) bad(`${where} breathe.amount: a fraction under 0.9`)
      moves ||= k && (l.breathe.amount ?? 0.05)
    }
    if (l.turns != null) {
      if (l.kind !== 'tile') bad(`${where}: turns belongs to a tile`)
      moves ||= whole1(l.turns, 'turns')
    }
    if (l.flow != null) {
      if (l.kind !== 'ribbon') bad(`${where}: flow belongs to a ribbon`)
      moves ||= whole1(l.flow, 'flow')
    }
    if (!moves) bad(`${where}: does not move; give it a drift with a radius, a breathe, turns or a flow (a loop that holds still is a poster)`)
  })
  if (spec.mark != null) {
    const m = spec.mark
    if (!m || typeof m !== 'object' || Array.isArray(m)) bad('mark is one { src, at, size }: the mark appears once')
    if (typeof m.src !== 'string' || !m.src.startsWith('/')) bad('mark.src is the brand\'s SVG, a root-absolute path')
    if (!pair(m.at)) bad('mark.at is [x, y] as fractions of the frame')
    if (!(num(m.size) && m.size > 0 && m.size <= MAX_MARK)) bad(`mark.size is a fraction of the short side, up to ${MAX_MARK} (the mark is small)`)
    if (m.color != null && !colour(m.color)) bad('mark.color is a palette name or a #hex')
  }
  return spec
}
