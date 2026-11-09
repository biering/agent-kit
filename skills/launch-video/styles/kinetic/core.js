// Shared helpers of the kinetic engine: easing, a pure "random", DOM shorthands. Nothing here keeps
// state between frames; every function returns the same value for the same arguments.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, u) => a + (b - a) * u

export const E = {
  lin: (u) => u,
  outCubic: (u) => 1 - (1 - u) ** 3,
  inCubic: (u) => u ** 3,
  inOutCubic: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2),
  outQuint: (u) => 1 - (1 - u) ** 5,
  outExpo: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
  inExpo: (u) => (u <= 0 ? 0 : 2 ** (10 * u - 10)),
  inOutExpo: (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u < 0.5 ? 2 ** (20 * u - 10) / 2 : (2 - 2 ** (-20 * u + 10)) / 2),
  outBack: (u, s = 1.70158) => 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2,
}

/** 0 before a, 1 after b, eased in between. */
export const tw = (t, a, b, e = E.outCubic) => e(clamp((t - a) / (b - a)))

/** A number in [0, 1) from an integer: the same index always gives the same value. Never Math.random. */
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Positive modulo, so a scrolling row wraps the same way for any t. */
export const wrap = (x, m) => ((x % m) + m) % m

export function el(tag, parent, css = '') {
  const e = document.createElement(tag)
  if (css) e.style.cssText = css
  if (parent) parent.appendChild(e)
  return e
}

/** Set a style only when it changes: a frame that sets 400 identical values costs nothing. */
export function set(e, k, v) {
  if (e.style[k] !== v) e.style[k] = v
}

export const show = (e, on) => set(e, 'display', on ? 'block' : 'none')

const hex = (c) => {
  const h = c.replace('#', '')
  const f = h.length === 3 ? [...h].map((x) => x + x).join('') : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}

/** Relative luminance 0 to 1 of a #hex colour: decides paper type on a dark ground, ink on a light one. */
export const luminance = (c) => {
  const [r, g, b] = hex(c).map((v) => v / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const rgba = (c, a) => `rgba(${hex(c).join(',')},${a})`
export const mix = (a, b, u) => `rgb(${hex(a).map((v, i) => Math.round(lerp(v, hex(b)[i], u))).join(',')})`

/** transform string for an element centred on its parent's middle, moved by (x, y) px. */
export const place = (x = 0, y = 0, rot = 0, sx = 1, sy = sx) =>
  `translate(-50%,-50%) translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`
