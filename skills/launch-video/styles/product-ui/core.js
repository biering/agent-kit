// Shared helpers of the product-ui engine: DOM shorthands and colour maths. Nothing here keeps state
// between frames; every function returns the same value for the same arguments.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))

export function el(tag, parent, css = '', cls = '') {
  const e = document.createElement(tag)
  if (css) e.style.cssText = css
  if (cls) e.className = cls
  if (parent) parent.appendChild(e)
  return e
}

/** Set a style only when it changes: a frame that sets 200 identical values costs nothing. */
export function set(e, k, v) {
  if (e.style[k] !== v) e.style[k] = v
}

/** Set an attribute (the film's CSS reads `data-state`) only when it changes. */
export function attr(e, k, v) {
  if (e.getAttribute(k) !== v) e.setAttribute(k, v)
}

/** Set text only when it changes. */
export function text(e, v) {
  if (e.textContent !== v) e.textContent = v
}

/** `visibility: inherit`, not `visible`: a visible child would show through a hidden parent. */
export const show = (e, on) => set(e, 'visibility', on ? 'inherit' : 'hidden')

/** A translate/scale transform string, or `none` at rest, so a landed element is never left on a sub-pixel. */
export function tr(x = 0, y = 0, s = 1) {
  const near = (v, to) => Math.abs(v - to) < 1e-3
  if (near(x, 0) && near(y, 0) && near(s, 1)) return 'none'
  return `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)${near(s, 1) ? '' : ` scale(${s.toFixed(4)})`}`
}

/** [r, g, b, a] of a computed CSS colour ("rgb(1, 2, 3)" or "rgba(1, 2, 3, 0.5)"). */
export function parseRgb(css) {
  const m = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]
  return [m[0], m[1], m[2], m[3] ?? 1]
}

/** A colour part-way between two parsed colours; a transparent end takes the other's colour. */
export function mixRgb(a, b, u) {
  if (a[3] === 0) a = [...b.slice(0, 3), 0]
  if (b[3] === 0) b = [...a.slice(0, 3), 0]
  const v = a.map((x, i) => x + (b[i] - x) * u)
  return `rgba(${v.slice(0, 3).map(Math.round).join(',')},${v[3].toFixed(3)})`
}

/** The text of every leaf text node under `root` (trimmed, non-empty): what a viewer can read. */
export function leafTexts(root) {
  const out = []
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = n.textContent.trim()
    if (t && !['SCRIPT', 'STYLE'].includes(n.parentElement.tagName)) out.push(t)
  }
  return out
}
