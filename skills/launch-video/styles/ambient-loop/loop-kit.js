// The loop kit: the pure helpers of the ambient loop. Everything is a function of the loop phase,
// the share of the loop that has run, and every moving thing completes a whole number of cycles in
// the loop's length T. At t = T each value is the one it had at t = 0, so the last frame wraps to
// the first as one ordinary step. No DOM, no state between calls, no Math.random.

export const TAU = Math.PI * 2
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))

/** A number in [0, 1) from an integer: the same index always gives the same value. */
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** How far through the loop t is, 0 up to 1 (and back to 0 at T). */
export const phase = (t, T) => (((t / T) % 1) + 1) % 1

/** An angle in radians that turns k whole times in T seconds (k an integer, negative runs the other way). */
export const cycle = (t, T, k) => TAU * k * phase(t, T)

/** A Lissajous drift of (x, y) in unit fractions: kx and ky whole cycles of each axis in the loop. */
export function drift(t, T, { kx = 1, ky = 1, rx = 0, ry = 0, ph = 0 } = {}) {
  return { x: rx * Math.sin(cycle(t, T, kx) + ph), y: ry * Math.cos(cycle(t, T, ky) + ph * 1.7) }
}

/** A scale that swells and settles `cycles` whole times in the loop, by `amount` either side of 1. */
export const breathe = (t, T, { cycles = 1, amount = 0.05, ph = 0 } = {}) => 1 + amount * Math.sin(cycle(t, T, cycles) + ph)

/** Degrees of a spin that makes `turns` whole turns in the loop. */
export const turn = (t, T, turns) => 360 * turns * phase(t, T)

/**
 * The outline of a ribbon: a band of constant thickness along a sine, `waves` wavelengths across the
 * frame, its pattern carried `flow` whole wavelengths along in the loop (so it ends where it began).
 * Returns the SVG path of the closed band. y0, amp and thick are px.
 */
export function ribbonPath(t, T, { w, y0, amp, thick, waves = 2, flow = 1, ph = 0 }, n = 160) {
  const top = []
  const bottom = []
  for (let i = 0; i <= n; i++) {
    const x = (w * i) / n
    const a = TAU * (waves * (i / n) - flow * phase(t, T)) + ph
    // a third harmonic keeps the band from reading as one sine; it must be a whole multiple of a, or the
    // pattern does not come back to itself when `flow` wavelengths have passed (a 2.3 jumped at the wrap)
    const y = y0 + amp * (Math.sin(a) + 0.35 * Math.sin(3 * a + 1.1)) / 1.35
    const th = thick * (0.75 + 0.25 * Math.sin(a + 2))
    top.push(`${x.toFixed(1)} ${(y - th / 2).toFixed(1)}`)
    bottom.push(`${x.toFixed(1)} ${(y + th / 2).toFixed(1)}`)
  }
  return `M${top.join('L')}L${bottom.reverse().join('L')}Z`
}

/**
 * The grain steps on its own clock, six times a second; a whole number of ticks fits the loop, so the
 * grain wraps too. The last tick shows the first tick's grain: a grain change at the wrap, with the
 * encoder's own noise on a keyframe, measured twice an ordinary grain step and read as a seam.
 */
export const GRAIN_RATE = 6
export function grainTick(t, T, rate = GRAIN_RATE) {
  const n = Math.max(1, Math.round(T * rate))
  const k = ((Math.floor(t * rate + 1e-6) % n) + n) % n
  // the last tick shows the first tick's grain, so the grain does not change at the wrap
  return n > 1 ? k % (n - 1) : 0
}
/** Where the grain tile sits for a tick, in tile cells. */
export const grainShift = (k, cells) => [Math.floor(hash(2 * k + 1) * cells), Math.floor(hash(2 * k + 2) * cells)]

/**
 * Where things sit in a w by h frame, for the two store formats. The unit `u` is the frame's short
 * side, so a size of 0.5 is half of it in any format. `safe` is the part of the width the store
 * does not crop on a narrow screen: the middle 60% of the 21:9 header, everything of the 3:2 tile.
 */
export function layout(w, h) {
  const ultra = w / h > 2
  const safe = ultra ? [0.2, 0.8] : [0, 1]
  return { w, h, u: Math.min(w, h), ultra, safe: [w * safe[0], w * safe[1]], cx: w / 2, cy: h / 2 }
}

/** A layer's base position in px: its `at` fractions of the frame, or the format's own entry. */
export function place(L, layer, format) {
  const at = Array.isArray(layer.at) ? layer.at : layer.at[format] ?? layer.at.header
  return { x: L.w * at[0], y: L.h * at[1] }
}
