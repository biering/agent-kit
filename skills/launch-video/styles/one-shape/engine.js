// The one-shape engine: runs a state list (spec.js) as a pure function of time. One element, the
// shape, changes size, radius and colour; a pointer causes every change; a flood pours the next
// ground out of it. The page is built once, then seek(t) sets every style from t alone, so the
// renderer can draw frames in any order. Written for this kit; the technique (one element never
// cut, handoffs as floods, a looping ambient clock, grain on its own clock) is in STYLE.md.
//
//   <script type="module">
//     import { build } from '/.agents/skills/launch-video/styles/one-shape/engine.js'
//     import spec from './spec.js'
//     window.film = await build(spec)      // ?format=wide|reel|header|search|square picks the frame
//   </script>
import { MOTION, clamp, ease, extents, farthest, floodAt, grainShift, grainTick, groundAt, hash, layout, pointerAt, pose, prog, spring, typed, wobble } from './core.js'
import { EXIT, FORMATS, TYPE_AT, TYPE_CPS, cueSheet, resolve, validateSpec } from './spec.js'

const FONT = { family: "ui-rounded, 'SF Pro Rounded', 'Helvetica Neue', Arial, sans-serif" }
const GRAIN_CELLS = 256

function el(tag, parent, css = '') {
  const e = document.createElement(tag)
  if (css) e.style.cssText = css
  if (parent) parent.appendChild(e)
  return e
}
/** Set a style only when it changes: a frame that sets 100 identical values costs nothing. */
function set(e, k, v) {
  if (e.style[k] !== v) e.style[k] = v
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const px = (v) => `${Math.round(v * 100) / 100}px`
const rgbCss = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`
const hexRgb = (h) => {
  const s = h.replace('#', '')
  const f = s.length === 3 ? [...s].map((x) => x + x).join('') : s
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}
const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const rel = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const contrast = (a, b) => (Math.max(rel(a), rel(b)) + 0.05) / (Math.min(rel(a), rel(b)) + 0.05)

/** A box centred on its parent, sized to the state it was built for. */
const centred = (parent, w, h, css = '') => el('div', parent, `position:absolute;left:50%;top:50%;width:${px(w)};height:${px(h)};margin:${px(-h / 2)} 0 0 ${px(-w / 2)};${css}`)

/** A line of text behind its own mask: it rises in from below and leaves upward. */
function maskLine(parent, html, css = '') {
  const box = el('div', parent, `overflow:hidden;padding:0 .08em .24em;margin:0 -.08em -.24em;${css}`)
  const w = el('div', box, 'display:inline-block;white-space:pre')
  w.innerHTML = html
  return {
    box,
    /** `rise` and `leave` are 0 to 1; the line is hidden outside its life. */
    at(rise, leave) {
      set(w, 'transform', rise >= 1 && leave <= 0 ? 'none' : `translateY(${((1 - rise) * 125 - leave * 125).toFixed(2)}%)`)
    },
  }
}
// a content that was there from the first frame has already risen; one that never leaves never starts to
const rise = (t, t0, dur = 0.55) => (t0 === -Infinity ? 1 : ease.out(prog(t, t0, t0 + dur)))
const leave = (t, t0, dur = 0.3) => (t0 === Infinity ? 0 : ease.in(prog(t, t0, t0 + dur)))

// ───────── what the shape holds: one part per kind, built for the size of its first state ─────────

function labelPart(f, shape, p) {
  const [W, H] = p.size.map((v) => v * f.L.u)
  const root = centred(shape, W, H, 'display:flex;align-items:center;justify-content:center')
  const line = maskLine(root, esc(p.label), `font:700 ${px(H * 0.4)}/1.15 ${f.font};letter-spacing:-0.01em;white-space:nowrap`)
  return { root, update: (t) => line.at(rise(t, p.tIn), leave(t, p.tOut)) }
}

function fieldPart(f, shape, p) {
  const [W, H] = p.size.map((v) => v * f.L.u)
  const root = centred(shape, W, H)
  const txt = el('div', root, `position:absolute;left:${px(H * 0.42)};top:0;height:${px(H)};display:flex;align-items:center;font:500 ${px(H * 0.34)}/1 ${f.font}`)
  // the typed text sits behind its own mask, so it leaves upward when the field turns into something else
  const line = maskLine(txt, `<span></span><i style="display:inline-block;width:${px(H * 0.045)};height:${px(H * 0.44)};margin-left:${px(H * 0.04)};border-radius:${px(H * 0.02)};background:currentColor;vertical-align:middle"></i>`)
  const [span, caret] = [line.box.querySelector('span'), line.box.querySelector('i')]
  // the send chip stands half a field height in from the right edge, and is what the pointer presses
  const d = H * 0.72
  const chip = el('div', root, `position:absolute;right:${px(H * 0.14)};top:50%;width:${px(d)};height:${px(d)};margin-top:${px(-d / 2)};border-radius:50%;background:currentColor`)
  const arrow = el('div', chip, 'position:absolute;inset:0')
  arrow.innerHTML = '<svg viewBox="0 0 100 100" width="100%" height="100%" fill="none" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><path d="M30 50H70M54 34L70 50L54 66"/></svg>'
  const svg = arrow.firstChild
  return {
    root,
    update(t, c) {
      const k = typed(p.text, t, p.tIn + TYPE_AT, TYPE_CPS)
      if (span.textContent !== k.text) span.textContent = k.text
      set(caret, 'visibility', k.caret ? 'inherit' : 'hidden')
      line.at(1, leave(t, p.tOut))
      const s = Math.max(0, spring(t, p.tIn + 0.25, MOTION.pop)) * (1 - spring(t, p.tOut - 0.05, MOTION.pop))
      set(chip, 'transform', `scale(${s.toFixed(4)})`)
      set(svg, 'stroke', c.shape)
    },
  }
}

const SVG = (D, body) => `<svg viewBox="0 0 100 100" width="${px(D)}" height="${px(D)}" style="position:absolute;left:50%;top:50%;margin:${px(-D / 2)} 0 0 ${px(-D / 2)};overflow:visible" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

function ringPart(f, shape, p) {
  const [W, H] = p.size.map((v) => v * f.L.u)
  const root = centred(shape, W, H)
  root.innerHTML = SVG(Math.min(W, H) * 0.56, '<circle cx="50" cy="50" r="41" stroke-width="9" pathLength="100"/>')
  const c = root.querySelector('circle')
  return {
    root,
    update(t) {
      const len = 30 * ease.out(prog(t, p.tIn + 0.05, p.tIn + 0.4)) * (1 - leave(t, p.tOut, 0.25))
      c.setAttribute('stroke-dasharray', `${len.toFixed(3)} ${(100 - len).toFixed(3)}`)
      c.setAttribute('transform', `rotate(${((360 * (t - p.tIn)) / 0.9).toFixed(2)} 50 50)`)
      c.setAttribute('visibility', len > 0.3 ? 'inherit' : 'hidden') // inherit: a visible child shows through a hidden part
    },
  }
}

function checkPart(f, shape, p) {
  const [W, H] = p.size.map((v) => v * f.L.u)
  const root = centred(shape, W, H)
  root.innerHTML = SVG(Math.min(W, H) * 0.5, '<path d="M28 53L45 70L73 34" stroke-width="10" pathLength="1"/>')
  const path = root.querySelector('path')
  return {
    root,
    update(t) {
      const a = rise(t, p.tIn + 0.1, 0.4)
      const b = leave(t, p.tOut, 0.2)
      const seg = Math.max(0, a - b)
      path.setAttribute('stroke-dasharray', a >= 1 && b <= 0 ? 'none' : `${seg.toFixed(4)} 2`)
      path.setAttribute('stroke-dashoffset', (-b).toFixed(4))
      path.setAttribute('visibility', seg > 0.002 ? 'inherit' : 'hidden')
    },
  }
}

function cardPart(f, shape, p) {
  const [W, H] = p.size.map((v) => v * f.L.u)
  const root = centred(shape, W, H, `display:flex;flex-direction:column;justify-content:center;gap:${px(H * 0.065)};padding-left:${px(W * 0.08)};box-sizing:border-box`)
  const title = maskLine(root, esc(p.label ?? ''), `font:700 ${px(H * 0.13)}/1.15 ${f.font};letter-spacing:-0.01em;margin-bottom:${px(H * 0.02)}`)
  const rowSize = H * 0.098
  const dots = []
  const rows = p.rows.map((r) => {
    const line = maskLine(root, `<i></i>${esc(r)}`, `font:500 ${px(rowSize)}/1.2 ${f.font};white-space:nowrap`)
    const dot = line.box.querySelector('i')
    dot.style.cssText = `display:inline-block;width:${px(rowSize * 0.5)};height:${px(rowSize * 0.5)};margin-right:${px(rowSize * 0.55)};border-radius:50%;vertical-align:middle`
    dots.push(dot)
    return line
  })
  return {
    root,
    update(t, c) {
      title.at(rise(t, p.tIn), leave(t, p.tOut))
      rows.forEach((r, i) => r.at(rise(t, p.tIn + 0.1 + i * f.tl.beat * 0.5), leave(t, p.tOut + i * 0.03)))
      dots.forEach((d) => set(d, 'background', c.dot))
    },
  }
}

const PARTS = { label: labelPart, field: fieldPart, ring: ringPart, check: checkPart, card: cardPart }

// ───────── a layer: one ground, the notes, the shape and what it holds ─────────

class Layer {
  constructor(f, z) {
    this.f = f
    this.root = el('div', f.mount, `position:absolute;inset:0;z-index:${z}`)
    this.ground = el('div', this.root, 'position:absolute;inset:0')
    this.notes = f.tl.notes.filter((n) => n.text).map((n) => this.noteOf(n))
    this.shape = el('div', this.root, 'position:absolute;overflow:hidden')
    this.parts = f.tl.parts.map((p) => ({ p, ...PARTS[p.kind](f, this.shape, p) }))
  }

  noteOf(n) {
    const { L } = this.f
    const b = L.note
    const box = el('div', this.root, `position:absolute;width:${px(b.w)};height:${px(b.h)};display:flex;flex-direction:column;justify-content:${b.left ? 'center' : 'flex-start'};align-items:${b.left ? 'flex-end' : 'center'};text-align:${b.left ? 'right' : 'center'}`)
    const lines = n.text.split('\n').map((s) => maskLine(box, esc(s), `font:700 ${px(L.noteSize)}/1.12 ${this.f.font};letter-spacing:-0.015em;white-space:nowrap`))
    return { n, box, lines }
  }

  /** Draw the layer: `g` is the shape's frame geometry, `c` the colours this layer stands in. */
  paint(t, g, c) {
    set(this.ground, 'background', c.ground)
    set(this.shape, 'left', px(g.x - g.w / 2))
    set(this.shape, 'top', px(g.y - g.h / 2))
    set(this.shape, 'width', px(g.w))
    set(this.shape, 'height', px(g.h))
    set(this.shape, 'borderRadius', px(Math.min(g.r, g.w / 2, g.h / 2)))
    set(this.shape, 'background', c.shape)
    set(this.shape, 'color', c.ink)
    // a part or note out of its life is hidden, never display:none: an element that leaves and returns
    // is drawn with different glyph edges than one that stayed, and the frame would depend on its history
    for (const { p, root, update } of this.parts) {
      const on = t >= p.tIn - 0.02 && t < p.tOut + EXIT + 0.05
      set(root, 'visibility', on ? 'inherit' : 'hidden')
      if (on) update(t, c)
    }
    // the note rides the shape's edge: under it, or in a column to its left
    const b = this.f.L.note
    for (const { n, box, lines } of this.notes) {
      const on = t >= n.tIn - 0.02 && t < n.tOut + EXIT + 0.2
      set(box, 'visibility', on ? 'inherit' : 'hidden')
      if (!on) continue
      set(box, 'color', c.noteInk)
      set(box, 'left', px(b.left ? g.x - g.w / 2 - b.gap - b.w : g.x - b.w / 2))
      set(box, 'top', px(b.left ? g.y - b.h / 2 : g.y + g.h / 2 + b.gap))
      lines.forEach((l, i) => l.at(rise(t, n.tIn + i * 0.07), leave(t, n.tOut + i * 0.04)))
    }
  }
}

class Film {
  constructor(spec, mount, W, H) {
    this.spec = spec
    this.tl = resolve(spec)
    this.W = W
    this.H = H
    this.mount = mount
    this.font = spec.font?.family ?? FONT.family
    this.L = layout(W, H, extents(this.tl))
    const pal = spec.palette
    this.ink = hexRgb(pal.ink)
    this.paper = hexRgb(pal.paper)
    Object.assign(document.documentElement.style, { width: `${W}px`, height: `${H}px`, overflow: 'hidden' })
    Object.assign(document.body.style, { width: `${W}px`, height: `${H}px`, margin: '0', overflow: 'hidden' })
    Object.assign(mount.style, { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`, overflow: 'hidden' })
    this.under = new Layer(this, 1)
    this.over = new Layer(this, 2)
    const { u } = this.L
    const top = el('div', mount, 'position:absolute;inset:0;z-index:3;pointer-events:none')
    this.dot = el('div', top, `position:absolute;width:0;height:0;border-radius:50%;background:${spec.palette.ink};border:${px(4 * u)} solid ${spec.palette.paper};box-sizing:border-box;display:none`)
    // a ring in the ink with a paper hairline either side reads on any ground
    this.ring = el('div', top, `position:absolute;border-radius:50%;box-sizing:border-box;border:1px solid ${spec.palette.ink};display:none;box-shadow:0 0 0 ${px(3 * u)} ${spec.palette.paper},inset 0 0 0 ${px(3 * u)} ${spec.palette.paper}`)
    this.cell = Math.max(1, Math.round(1.25 * u))
    this.grain = el('div', mount, `position:absolute;inset:0;z-index:4;pointer-events:none;image-rendering:pixelated;background-image:url(${this.tile(spec.grain ?? 0.055)});background-size:${GRAIN_CELLS * this.cell}px ${GRAIN_CELLS * this.cell}px`)
  }

  /** A tile of fine noise, black and white at low alpha, from a hash of the pixel index. */
  tile(strength) {
    const c = document.createElement('canvas')
    c.width = c.height = GRAIN_CELLS
    const g = c.getContext('2d')
    const img = g.createImageData(GRAIN_CELLS, GRAIN_CELLS)
    for (let i = 0; i < GRAIN_CELLS * GRAIN_CELLS; i++) {
      const n = hash(i * 0.713) * 2 - 1
      img.data.set([n > 0 ? 255 : 0, n > 0 ? 255 : 0, n > 0 ? 255 : 0, Math.round(Math.abs(n) * strength * 255)], i * 4)
    }
    g.putImageData(img, 0, 0)
    return c.toDataURL()
  }

  /** The text colour that reads best on a colour: the palette's ink or its paper. */
  inkOn(rgb) {
    return contrast(this.ink, rgb) >= contrast(this.paper, rgb) ? this.spec.palette.ink : this.spec.palette.paper
  }

  /** Where the shape stands at t in frame px: its layout slot, its offset springs and the ambient drift. */
  centreAt(t) {
    const p = pose(this.tl, t)
    const w = wobble(t, this.tl.T)
    return { x: this.L.cx + (p.dx + w.dx) * this.L.u, y: this.L.cy + (p.dy + w.dy) * this.L.u }
  }

  /** The colours one layer draws in: the shape and the type on it, the ground and the type on that. */
  colours(rgb, groundHex) {
    return { shape: rgbCss(rgb), ink: this.inkOn(rgb), ground: groundHex, noteInk: this.inkOn(hexRgb(groundHex)), dot: groundHex }
  }

  seek(t) {
    const { tl, L } = this
    t = clamp(t, 0, tl.T)
    const p = pose(tl, t)
    const w = wobble(t, tl.T)
    const c = this.centreAt(t)
    const g = { x: c.x, y: c.y, w: p.w * w.sc * L.u, h: p.h * w.sc * L.u, r: p.r * w.sc * L.u }
    const fl = floodAt(tl, t)
    // the layer on top carries the current ground; during a flood the one under it carries the old ground
    // and the shape colour the shape had when the flood began, and the top layer is a circle growing out of the shape
    if (fl) {
      const was = pose(tl, t, fl.i - 1)
      this.under.paint(t, g, this.colours(was.rgb, groundAt(tl, t, true)))
      const o = this.centreAt(fl.t0)
      const r = fl.p * farthest(o.x, o.y, this.W, this.H)
      set(this.under.root, 'visibility', 'inherit')
      set(this.over.root, 'clipPath', `circle(${px(r)} at ${px(o.x)} ${px(o.y)})`)
    } else {
      set(this.under.root, 'visibility', 'hidden')
      set(this.over.root, 'clipPath', 'none')
    }
    this.over.paint(t, g, this.colours(p.rgb, groundAt(tl, t)))

    const ptr = pointerAt(tl, L.u, (tt) => this.centreAt(tt), t)
    set(this.dot, 'display', ptr.on ? 'block' : 'none')
    if (ptr.on) {
      set(this.dot, 'left', px(ptr.x))
      set(this.dot, 'top', px(ptr.y))
      // sized, not scaled: a scaled dot is drawn differently by a draw that follows a different history
      const d = 44 * L.u * ptr.s
      set(this.dot, 'width', px(d))
      set(this.dot, 'height', px(d))
      set(this.dot, 'margin', `${px(-d / 2)} 0 0 ${px(-d / 2)}`)
      set(this.dot, 'borderWidth', px(4 * L.u * Math.min(1, ptr.s)))
    }
    const r = ptr.ring
    set(this.ring, 'display', r.on ? 'block' : 'none')
    if (r.on) {
      set(this.ring, 'left', px(r.x - r.r))
      set(this.ring, 'top', px(r.y - r.r))
      set(this.ring, 'width', px(r.r * 2))
      set(this.ring, 'height', px(r.r * 2))
      set(this.ring, 'borderWidth', px(Math.max(1, r.bw)))
    }
    const tick = grainTick(t, tl.T)
    const [gx, gy] = grainShift(tick, GRAIN_CELLS)
    set(this.grain, 'backgroundPosition', `${-gx * this.cell}px ${-gy * this.cell}px`)
  }

  api() {
    const { tl } = this
    return {
      width: this.W,
      height: this.H,
      fps: tl.fps,
      duration: tl.T,
      beat: tl.beat,
      bpm: this.spec.bpm,
      // a film that is never cut has none; a flood is a handoff, not a cut (motion blur is off at 30 fps anyway)
      cuts: [],
      hardCuts: [],
      floods: tl.floods,
      cues: cueSheet(this.spec),
      ready: Promise.resolve(),
      seek: (t) => this.seek(t),
    }
  }
}

/** Build the film page from a spec; resolves to the object render.mjs reads as window.film. */
export async function build(spec, mount = document.getElementById('stage')) {
  validateSpec(spec)
  const format = new URLSearchParams(location.search).get('format') ?? spec.format ?? 'wide'
  if (!FORMATS[format] || (spec.formats && !spec.formats.includes(format))) throw new Error(`format "${format}" is not one of ${(spec.formats ?? Object.keys(FORMATS)).join(', ')}`)
  const [W, H] = spec.size ?? FORMATS[format]
  await document.fonts.ready
  const f = new Film(spec, mount, W, H)
  f.seek(0)
  return f.api()
}
