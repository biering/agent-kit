// Shared helpers of the story engine: easing, a pure hash, DOM shorthands, colour. Nothing here keeps
// state between frames; every function returns the same value for the same arguments.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, u) => a + (b - a) * u

export const E = {
  lin: (u) => u,
  outCubic: (u) => 1 - (1 - u) ** 3,
  inCubic: (u) => u ** 3,
  inOutCubic: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2),
  outExpo: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)),
  // a small overshoot on landing: a pill growing, never a bounce
  outBack: (u, s = 1.2) => 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2,
}

/** 0 before a, 1 after b, eased in between. */
export const tw = (t, a, b, e = E.outCubic) => e(clamp((t - a) / (b - a)))

/** A number in [0, 1) from an integer: the same index always gives the same value. */
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function el(tag, parent, css = '') {
  const e = document.createElement(tag)
  if (css) e.style.cssText = css
  if (parent) parent.appendChild(e)
  return e
}

/** Set a style only when it changed: a frame that sets 200 identical values costs nothing. */
export function set(e, k, v) {
  if (e.style[k] !== v) e.style[k] = v
}

export const show = (e, on) => set(e, 'display', on ? 'block' : 'none')

const rgb = (c) => {
  const h = c.replace('#', '')
  const f = h.length === 3 ? [...h].map((x) => x + x).join('') : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}

/** Relative luminance 0 to 1 of a #hex colour: decides light type on a dark ground, ink on a light one. */
export const luminance = (c) => {
  const [r, g, b] = rgb(c).map((v) => v / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const rgba = (c, a) => `rgba(${rgb(c).join(',')},${a})`

export const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/**
 * A brand mark, read from the repo as SVG and inlined. Anything active in the file is stripped first:
 * scripts, embedded HTML, event handlers and javascript: links. The mark is the brand's file, never redrawn.
 */
export async function loadSvg(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`logo ${path}: ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml')
  const svg = doc.documentElement
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error(`logo ${path} is not an SVG`)
  svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove())
  for (const n of [svg, ...svg.querySelectorAll('*')]) {
    for (const a of [...n.attributes]) {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^javascript:/i.test(a.value.replace(/[\s\u0000-\u001f]/g, '')))) n.removeAttribute(a.name)
    }
  }
  return new XMLSerializer().serializeToString(svg)
}
