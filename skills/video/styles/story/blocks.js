// The story block library: Plate, Title, Turn, Card, and the Lines that run over them. A block draws
// one stretch of the film from a scene of the spec; update(t) sets styles from t alone. `f` is the
// film context engine.js builds (palette, fonts, beat conversion, text measuring, the cut register).
// A camera never parks: every plate is pushed, panned and swayed from the first frame to the last.
import { E, clamp, el, hash, lerp, luminance, rgba, set, show, tw } from './core.js'
import { MIN_PUSH } from './spec.js'

const TAU = Math.PI * 2
const PUSH_RATE = 0.03 // per second, in log scale: how fast a cut-in keeps pushing
const RISE = 0.42 // seconds a word takes to rise out of its mask
const LEAVE = 0.23 // and to leave through the top of it
const STAGGER = 0.03 // seconds between words leaving: five words are gone in EXIT_SECONDS (spec.js)

class Base {
  constructor(f, scene, i) {
    this.f = f
    this.s = scene
    this.i = i
    this.t0 = f.b(scene.at[0])
    this.t1 = f.b(scene.at[1])
    this.el = el('div', f.stage, 'position:absolute;inset:0;overflow:hidden;display:none')
  }

  u(t) {
    return clamp((t - this.t0) / (this.t1 - this.t0))
  }

  toneAt() {
    return this.s.tone ?? 'dark'
  }
}

/** The tone (light type on dark, ink on light) a ground colour asks for. */
const toneOf = (f, ground) => (luminance(f.col(ground)) > 0.45 ? 'light' : 'dark')

/** Handheld breathing, in px and degrees: slow sines of t, a different phase per scene. */
function sway(f, t, seed) {
  const a = f.unit
  return {
    dx: a * (5 * Math.sin((TAU * t) / 6.3 + seed) + 2 * Math.sin((TAU * t) / 2.7 + seed * 2.1)),
    dy: a * (4 * Math.sin((TAU * t) / 7.4 + seed * 1.3) + 1.5 * Math.sin((TAU * t) / 3.1 + seed * 0.7)),
    rot: 0.18 * Math.sin((TAU * t) / 8.1 + seed * 1.7),
  }
}

/** Words that rise out of a mask: [{ e }] inner spans, one per word, in a row that wraps nothing. */
function wordRow(parent, list, css) {
  const row = el('div', parent, `white-space:nowrap;${css}`)
  const inner = list.map(([word, color], k) => {
    if (k) row.appendChild(document.createTextNode(' '))
    // padding keeps descenders inside the mask, the negative margin keeps the line box the same
    const mask = el('span', row, 'display:inline-block;overflow:hidden;vertical-align:top;padding:0.12em 0.05em 0.24em;margin:-0.12em -0.05em -0.24em')
    const e = el('span', mask, `display:inline-block;${color ? `color:${color};` : ''}`)
    e.textContent = word
    return e
  })
  return { row, inner }
}

/** A word rising into its mask at tIn and, when tOut is given, leaving upward through it. */
function rise(e, t, tIn, tOut = Infinity) {
  const pin = tw(t, tIn, tIn + RISE, E.outCubic)
  const pout = tOut === Infinity ? 0 : tw(t, tOut, tOut + LEAVE, E.inCubic)
  set(e, 'transform', `translateY(${((1 - pin) * 140 - pout * 140).toFixed(2)}%)`)
}

// ───────── PlateView: one picture, drawn under a camera ─────────

/**
 * The layers of one plate: the CSS layers of the spec, back to front, then the picture if there is
 * one, then the scrim the lines stand on. A layer has a depth (0 far, 1 near); a near layer travels
 * further than a far one under the same camera, which is the parallax a flat picture lacks.
 */
class PlateView {
  constructor(f, parent, plate, scene) {
    this.f = f
    this.root = el('div', parent, 'position:absolute;inset:0;overflow:hidden')
    this.layers = []
    const css = typeof plate.css === 'string' ? [{ css: plate.css }] : plate.css ?? []
    // each layer sits in a frame-sized box that takes the camera, so a small shape still pivots on the frame's middle
    for (const L of css) {
      const box = el('div', this.root, 'position:absolute;inset:0;transform-origin:50% 50%')
      el('div', box, `position:absolute;inset:0;${L.css}`)
      this.layers.push({ e: box, depth: L.depth ?? 0.5 })
    }
    if (plate.src) {
      this.img = el('img', this.root, 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 50%')
      this.img.src = plate.src
      this.layers.push({ e: this.img, depth: 0.5 })
    }
    const light = (scene.tone ?? 'dark') === 'light'
    const shade = scene.shade ?? (light ? 0.34 : 0.5)
    el('div', this.root, `position:absolute;left:0;right:0;bottom:0;height:56%;background:linear-gradient(to top,${rgba(light ? '#FFF6E8' : '#05070D', shade)},transparent)`)
  }

  decoded() {
    return this.img ? this.img.decode() : null
  }

  /** cam: { s, x, y } scale and the plate point (0 to 1) at the frame's middle; sw: the sway. */
  draw(cam, sw) {
    const { W, H, unit } = this.f
    const margin = 14 * unit // what the sway and its roll can move a layer before an edge shows
    for (const { e, depth } of this.layers) {
      const s = cam.s ** (0.6 + 0.8 * depth)
      const room = (k) => Math.max(0, ((s - 1) * k) / 2 - margin)
      const tx = clamp(-(cam.x - 0.5) * W * s, -room(W), room(W))
      const ty = clamp(-(cam.y - 0.5) * H * s, -room(H), room(H))
      set(e, 'transform', `translate(${(tx + sw.dx).toFixed(2)}px,${(ty + sw.dy).toFixed(2)}px) rotate(${sw.rot.toFixed(3)}deg) scale(${s.toFixed(4)})`)
    }
  }
}

// ───────── Plate: a picture, pushed and panned, with cut-ins ─────────

export class Plate extends Base {
  constructor(f, scene, i) {
    super(f, scene, i)
    this.view = new PlateView(f, this.el, f.plates[scene.plate], scene)
    this.seed = hash(i + 7) * TAU
    const [s0, s1] = scene.push ?? [1.06, 1.2]
    const [p0, p1] = scene.pan ?? [[0.5, 0.5], [0.5, 0.5]]
    // the opening move spans the whole scene, so it keeps its speed when a cut-in ends it early
    this.shots = [{ t0: this.t0, t1: this.t1, s0, s1, p0, p1 }]
    const cuts = scene.cutIns ?? []
    // a cut-in keeps the scene's pan speed unless it names where it ends: a tight shot that only
    // pushes moves too little to read as alive
    const vel = p0.map((v, k) => (p1[k] - v) / (this.t1 - this.t0))
    cuts.forEach(([beat, scale, focus, end], k) => {
      const t0 = f.b(beat)
      const t1 = cuts[k + 1] ? f.b(cuts[k + 1][0]) : this.t1
      this.shots.push({ t0, t1, s0: scale, s1: scale * Math.exp(PUSH_RATE * (t1 - t0)), p0: focus, p1: end ?? focus.map((v, j) => clamp(v + vel[j] * (t1 - t0))) })
    })
  }

  decoded() {
    return this.view.decoded()
  }

  /** The camera at t. Not clamped to the scene: a Turn borrows it a little before and after. */
  camAt(t) {
    let sh = this.shots[0]
    for (const s of this.shots) if (t >= s.t0) sh = s
    const u = (t - sh.t0) / (sh.t1 - sh.t0)
    // never under MIN_PUSH, so a Turn that borrows the camera before the scene starts keeps its bleed
    return { s: Math.max(MIN_PUSH, Math.exp(lerp(Math.log(sh.s0), Math.log(sh.s1), u))), x: lerp(sh.p0[0], sh.p1[0], u), y: lerp(sh.p0[1], sh.p1[1], u) }
  }

  update(t) {
    this.view.draw(this.camAt(t), sway(this.f, t, this.seed))
  }
}

// ───────── Title: a card of words on a ground ─────────

export class Title extends Base {
  constructor(f, scene, i) {
    super(f, scene, i)
    const ground = scene.ground ?? 'bg'
    this.tone = toneOf(f, ground)
    this.el.style.background = f.col(ground)
    const list = scene.text.trim().split(/\s+/)
    const size = Math.min(f.unit * 150, f.fit(list.join(' '), f.W * 0.8, 'serif'))
    this.group = el('div', this.el, `position:absolute;left:0;top:0;width:${f.W}px;height:${f.H}px;transform-origin:50% 50%`)
    const row = wordRow(this.group, list.map((w) => [w]), `position:absolute;left:0;width:100%;top:50%;margin-top:${-size * 0.55}px;text-align:center;font:400 ${size}px/1.1 ${f.font.serif};color:${f.col(scene.color ?? (this.tone === 'dark' ? 'paper' : 'ink'))};letter-spacing:-0.01em`)
    this.words = row.inner.map((e, k) => ({ e, t: this.t0 + f.b((scene.start ?? 0.5) + k * (scene.every ?? 0.5)) }))
  }

  toneAt() {
    return this.tone
  }

  update(t) {
    set(this.group, 'transform', `scale(${(1 + 0.05 * this.u(t)).toFixed(4)})`)
    for (const w of this.words) rise(w.e, t, w.t)
  }
}

// ───────── Turn: the one moment the film changes ─────────

export class Turn extends Base {
  /** Called once every scene exists: the turn draws the plate before it and the plate after it. */
  link(prev, next) {
    const { f, s } = this
    this.prev = prev
    this.next = next
    const kind = s.kind
    this.dur = f.b(s.dur ?? 1)
    if (kind === 'flood') {
      this.under = new PlateView(f, this.el, f.plates[prev.s.plate], prev.s)
      const [ox, oy] = s.origin ?? [0.5, 0.45]
      this.ox = ox * f.W
      this.oy = oy * f.H
      // far enough to clear the farthest corner, plus the rim
      this.reach = Math.hypot(Math.max(this.ox, f.W - this.ox), Math.max(this.oy, f.H - this.oy)) + 60 * f.unit
      this.rim = el('div', this.el, `position:absolute;border-radius:50%;background:${f.col(s.color ?? 'accent')};box-shadow:0 0 ${90 * f.unit}px ${24 * f.unit}px ${rgba(f.col(s.color ?? 'accent'), 0.6)}`)
      this.clip = el('div', this.el, 'position:absolute;inset:0')
      this.over = new PlateView(f, this.clip, f.plates[next.s.plate], next.s)
    } else {
      this.over = new PlateView(f, this.el, f.plates[next.s.plate], next.s)
    }
    this.flash = el('div', this.el, `position:absolute;inset:0;background:${f.col(kind === 'hit' ? 'paper' : s.color ?? 'accent')};opacity:0`)
  }

  decoded() {
    return Promise.all([this.under?.decoded(), this.over.decoded()])
  }

  toneAt(t) {
    return this.s.kind === 'flood' && t < this.t0 + this.dur * 0.5 ? this.prev.toneAt() : this.next.toneAt()
  }

  update(t) {
    const { f, s, next } = this
    const ts = t - this.t0
    const cam = next.camAt(t)
    const sw = sway(f, t, next.seed)
    if (s.kind === 'flood') {
      this.under.draw(this.prev.camAt(t), sway(f, t, this.prev.seed))
      const k = tw(t, this.t0, this.t0 + this.dur, E.inOutCubic)
      const R = k * this.reach
      const on = k > 0 && k < 1
      show(this.rim, on)
      if (on) {
        const r = R + 12 * f.unit
        Object.assign(this.rim.style, { left: `${this.ox - r}px`, top: `${this.oy - r}px`, width: `${2 * r}px`, height: `${2 * r}px` })
      }
      set(this.clip, 'clipPath', k >= 1 ? 'none' : `circle(${R.toFixed(1)}px at ${this.ox}px ${this.oy}px)`)
      this.over.draw(cam, sw)
      return
    }
    // a flip and a hit are cuts: the new plate is there on the first frame, and the colour leaves it
    if (s.kind === 'hit') {
      const k = Math.exp(-ts * 9)
      cam.s *= 1 + 0.07 * k
      sw.dx += 16 * f.unit * k * Math.sin(ts * 90)
      sw.dy += 12 * f.unit * k * Math.cos(ts * 80)
    }
    this.over.draw(cam, sw)
    const flash = (s.kind === 'hit' ? 0.85 : 1) * Math.exp(-ts * (s.kind === 'hit' ? 14 : 8))
    set(this.flash, 'opacity', flash < 0.004 ? '0' : flash.toFixed(3))
  }
}

// ───────── Card: the mark, one line, one call to action ─────────

export class Card extends Base {
  constructor(f, scene, i) {
    super(f, scene, i)
    const { W, H, unit } = f
    const ground = scene.ground ?? 'bg'
    this.tone = toneOf(f, ground)
    const ink = f.col(this.tone === 'dark' ? 'paper' : 'ink')
    this.el.style.background = f.col(ground)
    // a glow that drifts behind the stack, so the card is never a still frame
    this.glow = el('div', this.el, `position:absolute;inset:-10%;background:radial-gradient(45% 45% at 50% 52%,${rgba(f.col('accent'), 0.22)},transparent 72%)`)
    this.stack = el('div', this.el, `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:50% 50%`)
    const hasMark = Boolean(f.logoSvg)
    const y = hasMark ? { mark: 0.3, word: 0.47, rule: 0.545, line: 0.62, cta: 0.79 } : { word: 0.4, rule: 0.48, line: 0.565, cta: 0.76 }
    const at = (top, css = '') => el('div', this.stack, `position:absolute;left:50%;top:${top * H}px;transform:translate(-50%,-50%);${css}`)
    if (hasMark) {
      this.mark = el('div', at(y.mark), 'transform-origin:50% 50%')
      this.mark.innerHTML = f.logoSvg
      const svg = this.mark.querySelector('svg')
      if (svg) Object.assign(svg.style, { width: `${H * 0.17}px`, height: `${H * 0.17}px`, display: 'block' })
    }
    const wmSize = Math.min(H * 0.115, f.fit(scene.wordmark, W * 0.72, 'sans', 700))
    this.word = wordRow(at(y.word), [[scene.wordmark]], `font:700 ${wmSize}px/1 ${f.font.sans};color:${ink};letter-spacing:0.02em`).inner[0]
    this.rule = el('div', at(y.rule), `width:${W * 0.1}px;height:${Math.max(3, 4 * unit)}px;background:${f.col('accent')};transform-origin:0 50%`)
    const lineList = scene.line.trim().split(/\s+/)
    const lineSize = Math.min(unit * 62, f.fit(scene.line, W * 0.82, 'serif'))
    this.line = wordRow(at(y.line), lineList.map((w) => [w]), `font:400 ${lineSize}px/1.15 ${f.font.serif};color:${ink}`).inner
    const ctaSize = unit * 32
    const pill = el('div', at(y.cta), `position:relative;padding:${ctaSize * 0.62}px ${ctaSize * 1.5}px`)
    this.pill = el('div', pill, `position:absolute;inset:0;border-radius:999px;background:${f.col('accent')};transform-origin:50% 50%`)
    const label = el('div', pill, 'position:relative')
    this.cta = wordRow(label, [[scene.cta]], `font:700 ${ctaSize}px/1 ${f.font.sans};color:${f.col('ink')};letter-spacing:0.03em`).inner[0]
    if (scene.small) {
      const sm = at(Math.min(0.93, y.cta + 0.1))
      el('div', sm, `font:500 ${unit * 22}px/1 ${f.font.sans};color:${ink};opacity:0.7;letter-spacing:0.16em;text-transform:uppercase;white-space:nowrap`).textContent = scene.small
    }
  }

  toneAt() {
    return this.tone
  }

  update(t) {
    const { f } = this
    const ts = t - this.t0
    const b = (n) => f.b(n)
    set(this.stack, 'transform', `scale(${(1 + 0.04 * this.u(t)).toFixed(4)})`)
    set(this.glow, 'transform', `translate(${(40 * Math.sin(ts * 0.7)).toFixed(1)}px,${(24 * Math.cos(ts * 0.5)).toFixed(1)}px) scale(${(1 + 0.05 * Math.sin(ts * 0.9)).toFixed(4)})`)
    if (this.mark) set(this.mark, 'transform', `scale(${Math.max(0, tw(ts, b(0.25), b(0.25) + 0.5, (u) => E.outBack(u, 1.6))).toFixed(4)})`)
    rise(this.word, ts, b(0.5))
    set(this.rule, 'transform', `scaleX(${tw(ts, b(1), b(1) + 0.5, E.outExpo).toFixed(4)})`)
    this.line.forEach((e, k) => rise(e, ts, b(1.5 + k * 0.5)))
    const grow = tw(ts, b(3.5), b(3.5) + 0.45, (u) => E.outBack(u, 1.4))
    set(this.pill, 'transform', `scaleX(${Math.max(0, grow).toFixed(4)})`)
    rise(this.cta, ts, b(3.5) + 0.2)
  }
}

// ───────── Lines: words on beats, rising out of a mask, over whatever scene is current ─────────

const PLACE_Y = { wide: { low: 0.8, mid: 0.5, high: 0.2 }, tall: { low: 0.7, mid: 0.5, high: 0.24 } }

export class Lines {
  constructor(f, lines, exitSeconds) {
    this.f = f
    this.root = el('div', f.mount, 'position:absolute;inset:0;pointer-events:none')
    const y = PLACE_Y[f.H > f.W ? 'tall' : 'wide']
    this.items = lines.map((ln) => {
      const text = ln.words.map(([w]) => w).join(' ')
      const size = Math.min(f.unit * 100, f.fit(text, f.W * 0.86, 'serif'))
      const { row, inner } = wordRow(this.root, ln.words.map(([w, , tone]) => [w, tone ? f.col(tone) : '']), `position:absolute;left:0;width:100%;top:${(y[ln.place ?? 'low'] * f.H).toFixed(1)}px;margin-top:${-size * 0.55}px;display:none;text-align:center;font:400 ${size}px/1.1 ${f.font.serif};letter-spacing:-0.01em`)
      const t1 = f.b(ln.at[1])
      return { row, t0: f.b(ln.at[0]), t1, words: inner.map((e, k) => ({ e, tIn: f.b(ln.words[k][1]), tOut: t1 - exitSeconds + k * STAGGER })) }
    })
  }

  update(t, tone, on = true) {
    const { f } = this
    for (const it of this.items) {
      const live = on && t >= it.t0 && t < it.t1
      show(it.row, live)
      if (!live) continue
      set(it.row, 'color', f.col(tone === 'light' ? 'ink' : 'paper'))
      set(it.row, 'textShadow', tone === 'light' ? '0 1px 22px rgba(255,246,232,0.45)' : '0 2px 28px rgba(0,0,0,0.55)')
      for (const w of it.words) rise(w.e, t, w.tIn, w.tOut)
    }
  }
}

export const BLOCK_CLASSES = { Plate, Title, Turn, Card }
