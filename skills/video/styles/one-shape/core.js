// The pure motion of the one-shape engine: springs, the shape's pose at t, the ambient wobble, the
// flood, the pointer, the grain clock and layout(w, h). No DOM, nothing here keeps state between
// calls: the same t gives the same value, so a frame can be drawn in any order and node can test it.

import { POINTER_LEAVES } from './spec.js'

export const TAU = Math.PI * 2
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, p) => a + (b - a) * p
export const prog = (t, a, b) => clamp((t - a) / (b - a))

/** A number in [0, 1) from an integer: the same index always gives the same value. Never Math.random. */
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function bezier(x1, y1, x2, y2) {
  return (x) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    let u = x
    for (let i = 0; i < 32; i++) {
      u = (lo + hi) / 2
      const bx = 3 * (1 - u) ** 2 * u * x1 + 3 * (1 - u) * u * u * x2 + u ** 3
      if (bx < x) lo = u
      else hi = u
    }
    return 3 * (1 - u) ** 2 * u * y1 + 3 * (1 - u) * u * u * y2 + u ** 3
  }
}
export const ease = { inOut: bezier(0.65, 0, 0.35, 1), out: bezier(0.16, 1, 0.3, 1), in: bezier(0.55, 0, 1, 0.45) }

/** Closed-form damped spring step response: 0 before t0, settles on 1. A critically damped one never overshoots. */
export function spring(t, t0, { freq = 1.8, damp = 0.72 } = {}) {
  const x = t - t0
  if (x <= 0) return 0
  const w = TAU * freq
  if (damp >= 1) return 1 - Math.exp(-w * x) * (1 + w * x)
  const wd = w * Math.sqrt(1 - damp * damp)
  return 1 - Math.exp(-damp * w * x) * (Math.cos(wd * x) + ((damp * w) / wd) * Math.sin(wd * x))
}

// One spring per property, so the shape stretches rather than scales: height leads width, the
// radius and the colour never overshoot, the offset is the slowest.
export const MOTION = {
  w: { freq: 1.7, damp: 0.78 },
  h: { freq: 2.1, damp: 0.78 },
  radius: { freq: 1.8, damp: 1 },
  offset: { freq: 1.5, damp: 0.85 },
  color: { freq: 1.9, damp: 1 },
  pop: { freq: 2.8, damp: 0.85 },
}

/**
 * The shape at t from the state list: each property is its first value plus one spring per change
 * (v0 + sum of (target - previous target) * spring), never a restarted tween. A flood state changes
 * the colour at once, because the flood itself is the change. `upTo` leaves later states out, which is
 * how the layer under a flood keeps the colour the shape had when the flood began.
 */
export function pose(tl, t, upTo = tl.states.length - 1) {
  const S = tl.states
  let w = S[0].size[0]
  let h = S[0].size[1]
  let r = S[0].radius
  let dx = S[0].offset[0]
  let dy = S[0].offset[1]
  const c = [...S[0].rgb]
  for (let i = 1; i <= upTo && t >= S[i].t; i++) {
    const a = S[i - 1]
    const b = S[i]
    w += (b.size[0] - a.size[0]) * spring(t, b.t, MOTION.w)
    h += (b.size[1] - a.size[1]) * spring(t, b.t, MOTION.h)
    r += (b.radius - a.radius) * spring(t, b.t, MOTION.radius)
    dx += (b.offset[0] - a.offset[0]) * spring(t, b.t, MOTION.offset)
    dy += (b.offset[1] - a.offset[1]) * spring(t, b.t, MOTION.offset)
    const k = b.flood ? 1 : spring(t, b.t, MOTION.color)
    for (let j = 0; j < 3; j++) c[j] += (b.rgb[j] - a.rgb[j]) * k
  }
  return { w, h, r, dx, dy, rgb: c.map((v) => clamp(v, 0, 255)) }
}

/**
 * The ambient clock for something that cannot be written as a sum of harmonics (a shader's wobble):
 * `A + span * sin^2(pi t / T)` runs out from A and back, so it ends where it began. Its speed is zero at
 * t = 0 and t = T, so whatever it drives stands nearly still at the seam.
 */
export const ambient = (t, T, from = 9, span = 10) => from + span * Math.sin((Math.PI * t) / T) ** 2

/** A phase in radians that completes k whole turns in T seconds (k an integer): periodic, and moving at the seam. */
export const cycle = (t, T, k) => (TAU * k * t) / T

/**
 * The shape's ambient drift and breath in px on a 1080 frame, a sum of whole-number harmonics of the
 * film's length, so it closes on itself and keeps its speed through the seam.
 */
export function wobble(t, T) {
  const s = (k, ph) => Math.sin(cycle(t, T, k) + ph)
  return { dx: 8 * s(2, 0.6) + 3 * s(5, 2.1), dy: 6 * s(3, 1.3) + 2.5 * s(4, 4), sc: 1 + 0.02 * s(4, 0.4) + 0.008 * s(7, 1) }
}

/** Grain steps on its own clock. A whole number of ticks fits the film, and the last shows the first's grain, so the grain loops too. */
export const GRAIN_RATE = 6
export function grainTick(t, T, rate = GRAIN_RATE) {
  const n = Math.max(1, Math.round(T * rate))
  const k = ((Math.floor(t * rate + 1e-6) % n) + n) % n
  // the last tick shows the first tick's grain, so the grain does not change at the wrap
  return n > 1 ? k % (n - 1) : 0
}
/** Where the grain tile sits for a tick, in tile cells. */
export const grainShift = (k, cells) => [Math.floor(hash(2 * k + 1) * cells), Math.floor(hash(2 * k + 2) * cells)]

/** The flood running at t: { i (the state), t0, t1, p (eased 0 to 1) }, or null. */
export function floodAt(tl, t) {
  const f = tl.floods.find((x) => t >= x.t0 && t < x.t1)
  return f ? { ...f, p: ease.inOut(prog(t, f.t0, f.t1)) } : null
}
/** The radius at which a circle at (x, y) clears the farthest corner of a w by h frame. */
export const farthest = (x, y, w, h) => Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 4

/** The ground in force at t: the last state's, or the layer under the flood when `before` is set. */
export function groundAt(tl, t, before = false) {
  let i = 0
  tl.states.forEach((s, j) => { if (t >= s.t) i = j })
  return tl.states[before ? i - 1 : i].ground
}

/**
 * The pointer at t. Each press has a visit: it pops in at `from` (relative to its target), travels a
 * shallow arc and arrives eased exactly on the press, a ring grows, and it pops out. `centreAt(t)` is
 * the shape's centre in frame px, so the target moves with the shape's drift.
 */
export function pointerAt(tl, u, centreAt, t) {
  for (const p of tl.taps) {
    const t0 = p.t - p.arrive
    if (t < t0 - 1e-6 || t > p.t + POINTER_LEAVES) continue
    const c = centreAt(p.t)
    const tx = c.x + p.press[0] * u
    const ty = c.y + p.press[1] * u
    const at = route(t, [[t0, tx + p.from[0] * u, ty + p.from[1] * u], [p.t, tx, ty], [p.t + 0.4, tx, ty]])
    const s = Math.max(0, spring(t, t0, MOTION.pop)) * (1 - spring(t, p.t + 0.35, MOTION.pop))
    const k = prog(t, p.t, p.t + 0.5)
    const e = 1 - (1 - k) ** 3
    return { on: s > 1e-3, x: at.x, y: at.y, s, ring: { on: t >= p.t && t < p.t + 0.5, x: tx, y: ty, r: lerp(22, 90, e) * u, bw: lerp(9, 0.5, e) * u } }
  }
  return { on: false, x: 0, y: 0, s: 0, ring: { on: false, x: 0, y: 0, r: 0, bw: 0 } }
}
/** A pointer between stops [[t, x, y], ...]: it leaves each stop late, arrives eased and travels on a shallow arc. */
export function route(t, stops, bow = 0.1) {
  if (t <= stops[0][0]) return { x: stops[0][1], y: stops[0][2] }
  for (let i = 1; i < stops.length; i++) {
    if (t > stops[i][0]) continue
    const [t0, x0, y0] = stops[i - 1]
    const [t1, x1, y1] = stops[i]
    const p = ease.inOut(prog(t, t0, t1))
    const lift = 4 * p * (1 - p) * bow
    return { x: lerp(x0, x1, p) + (y1 - y0) * lift, y: lerp(y0, y1, p) - (x1 - x0) * lift }
  }
  const last = stops.at(-1)
  return { x: last[1], y: last[2] }
}

/** Text being typed: what stands at t, and whether the caret shows (solid while typing, then it blinks). */
export function typed(text, t, t0, cps = 14) {
  const n = Math.floor(clamp((t - t0) * cps, 0, text.length))
  return { text: text.slice(0, n), caret: t >= t0 && (n < text.length || Math.floor(Math.max(0, t - t0 - text.length / cps) * 2.5) % 2 === 0) }
}

/** The widest and tallest the shape gets, in px on a 1080 frame, so the layout leaves room for it. */
export function extents(tl) {
  return {
    w: Math.max(...tl.states.map((s) => s.size[0] + 2 * Math.abs(s.offset[0]))),
    h: Math.max(...tl.states.map((s) => s.size[1] + 2 * Math.abs(s.offset[1]))),
    note: tl.notes.some((n) => n.text),
    noteAt: tl.spec.noteAt ?? 'below',
  }
}

/**
 * Where everything sits in a w by h frame. The unit `u` is the frame's short side over 1080, so a spec
 * is written once (1.2 times that in a frame wider than 2:1). The shape has a rest slot; the note rides its live edge, under it (one column: the
 * way 9:16 and the 3:2 tile always are) or, in a frame wider than 1.7:1 with `noteAt: 'left'`, in a
 * column to its left, right-aligned. A 9:16 frame keeps clear of the platform's own interface
 * (220 px above, 340 below, on 1080 x 1920). `ext` is extents().
 */
export function layout(w, h, ext = { w: 860, h: 400, note: true, noteAt: 'below' }) {
  const u = (Math.min(w, h) / 1080) * (w / h > 2 ? 1.2 : 1) // the 21:9 frame is wide enough to carry a larger shape
  const tall = h > w
  const left = ext.note && ext.noteAt === 'left' && w / h > 1.7
  const L = { u, w, h, tall, cols: left, cx: w / 2, cy: h / 2, note: null }
  const noteH = 190
  const gap = 56
  if (ext.note) {
    const nw = left ? 480 * u : Math.min(w * 0.9, 900 * u)
    L.note = { left, w: nw, h: (left ? 240 : noteH) * u, gap: gap * u }
  }
  if (!left) {
    // the tallest state and its note stand in the safe area, centred
    const top = tall ? 220 * u : 0
    const bottom = h - (tall ? 340 * u : 0)
    const y0 = top + (bottom - top - (ext.h + (ext.note ? gap + noteH : 0)) * u) / 2
    L.cy = y0 + (ext.h / 2) * u
  }
  L.noteSize = (left ? 64 : 68) * u
  return L
}
