// The product-ui engine: runs a spec (spec.js) on the film's own HTML as a pure function of time.
// It moves the page into a camera layer, lets parts.js give the page's fields, buttons, toggles,
// tabs, checklist and result card their behaviour, then draws a pointer, a click ring and a caption
// pill above it in screen space. seek(t) sets every style from t alone, so the renderer can draw
// frames in any order and blur several per output frame. Written for this kit; the motion comes from
// templates/kit.js (springs, route, ring, edges, camera in log space, project).
//
//   <script src="/.agents/skills/launch-video/templates/kit.js"></script>
//   <script type="module">
//     import { build } from '/.agents/skills/launch-video/styles/product-ui/engine.js'
//     import spec from './spec.js'
//     window.film = await build(spec)
//   </script>
import { buildParts } from './parts.js'
import { clamp, el, leafTexts, set, show } from './core.js'
import { cueSheet, defaults, specTexts, stepEnd, unsourced, validateSpec } from './spec.js'

const CAPTION_SAFE = 55 // screen px the framed target sits above the middle, clear of the pill
const INK = '#101216'

const cssVar = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

class Film {
  constructor(spec, mount) {
    this.spec = spec
    ;[this.W, this.H] = spec.size ?? defaults.size
    this.fps = spec.fps ?? 60
    this.duration = (spec.beats * 60) / spec.bpm
    if (!globalThis.kit) throw new Error('product-ui: load templates/kit.js before the engine (the starter film.html does)')
    this.k = globalThis.kit(this.W, this.H)
    this.u = Math.min(this.W, this.H) / 1080 // the unit: pointer, ring and pill scale with the frame
    this.mount = mount
    Object.assign(mount.style, { position: 'absolute', left: '0', top: '0', width: `${this.W}px`, height: `${this.H}px`, overflow: 'hidden' })
    // the page moves into a camera layer; everything drawn above it is in screen space
    this.cam = el('div', null, `position:absolute;left:0;top:0;width:${this.W}px;height:${this.H}px;transform-origin:0 0`)
    while (mount.firstChild) this.cam.append(mount.firstChild)
    mount.append(this.cam)
    this.scrollers = []
    this.rects = new Map()
    this.steps = spec.steps.map((s) => ({ ...s, t0: this.b(s.beat), t1: this.b(stepEnd(s, spec.bpm)) }))
    // who is clicked, in order; where (the pointer's place) is filled in once the page is measured
    this.presses = []
    let at = null
    for (const s of this.steps) {
      if (s.do === 'move') at = s.to
      else if (s.do === 'press') this.presses.push({ t: s.t0, id: at })
      else if (s.do === 'toggle') this.presses.push({ t: s.t0, id: s.target })
    }
  }

  b = (beats) => (beats * 60) / this.spec.bpm

  q(sel) {
    return [...this.cam.querySelectorAll(sel)]
  }

  /** Border box of an element in the frame's own pixels. Measured with no transform on the camera layer. */
  rect(e) {
    const m = this.mount.getBoundingClientRect()
    const r = e.getBoundingClientRect()
    return { x: r.left - m.left, y: r.top - m.top, w: r.width, h: r.height }
  }

  /** Measure the page once: the window's bounds and the rect of every target, at rest. */
  measure() {
    const screen = this.q('[data-ui="screen"]')[0]
    this.bounds = screen ? this.rect(screen) : { x: 0, y: 0, w: this.W, h: this.H }
    for (const id of this.spec.targets) {
      const node = document.getElementById(id.slice(1))
      if (!node || !this.cam.contains(node)) throw new Error(`spec: targets: ${id} is not an element of the page`)
      this.rects.set(id, this.rect(node))
    }
  }

  /** A target's rect at time t: its rest rect moved by the scroll area it sits in. */
  rectAt(id, t) {
    const r = this.rects.get(id) ?? this.rect(document.getElementById(id.slice(1)))
    const node = document.getElementById(id.slice(1))
    const sc = this.scrollers.find((s) => s.node.contains(node) && s.node !== node)
    return sc ? { ...r, y: r.y - sc.offset(t) } : r
  }

  /** The world point of a target at t: its centre, or the fractions `at` of its rect. */
  pos(id, t, at = [0.5, 0.5]) {
    const r = this.rectAt(id, t)
    return { x: r.x + r.w * at[0], y: r.y + r.h * at[1] }
  }

  /** The last click at or before t: { t, id, p }. */
  lastPress(t) {
    return this.presses.filter((p) => p.t <= t).at(-1) ?? null
  }

  /** The camera centre that frames (x, y) at zoom z without showing past the window. */
  clampFocus(x, y, z) {
    const B = this.bounds
    const hw = this.W / 2 / z
    const hh = this.H / 2 / z
    const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi))
    return [fit(x, B.x + hw, B.x + B.w - hw), fit(y, B.y + hh, B.y + B.h - hh)]
  }

  focus(to, z, t, at) {
    const p = Array.isArray(to) ? { x: to[0], y: to[1] } : this.pos(to, t, at)
    return this.clampFocus(p.x, p.y + (CAPTION_SAFE * this.u) / z, z)
  }

  /** The pointer's path as stops, and the place of every press: read off the steps in order, once. */
  compileSteps() {
    const B = this.bounds
    let at = { id: null, x: B.x + B.w - 130, y: B.y + B.h - 100 }
    this.stops = [[0, at.x, at.y]]
    const stop = (t, p) => {
      const last = this.stops.at(-1)
      if (t - last[0] > 1e-6) this.stops.push([t, p.x, p.y])
      else if (Math.abs(last[1] - p.x) + Math.abs(last[2] - p.y) > 0.5) throw new Error('product-ui: two pointer stops at one time')
    }
    let n = 0
    for (const s of this.steps) {
      if (s.do === 'move') {
        stop(s.t0, at)
        const p = this.pos(s.to, s.t1, s.at)
        stop(s.t1, p)
        at = { id: s.to, ...p }
      } else if (s.do === 'press' || s.do === 'toggle') {
        this.presses[n++].p = { x: at.x, y: at.y }
      }
    }
  }

  /** Camera keyframes: each move eases to its framing; between moves the frame creeps in, so it never parks. */
  compileCamera() {
    const { bezier } = this.k
    const lin = (p) => p
    const ease = bezier(0.5, 0, 0.15, 1)
    const drift = this.spec.drift ?? defaults.drift
    let z = 1
    let [x, y] = this.clampFocus(this.bounds.x + this.bounds.w / 2, this.bounds.y + this.bounds.h / 2, 1)
    const keys = [[0, z, x, y]]
    let rest = 0
    for (const s of this.steps.filter((c) => c.do === 'camera')) {
      if (s.t0 - rest > 1e-6) { z *= Math.exp(drift * (s.t0 - rest)); keys.push([s.t0, z, x, y, lin]) }
      ;[x, y] = this.focus(s.to, s.zoom, s.t1, s.at)
      z = s.zoom
      keys.push([s.t1, z, x, y, ease])
      rest = s.t1
    }
    keys.push([this.duration, z * Math.exp(drift * (this.duration - rest)), x, y, lin])
    this.camKeys = keys
  }

  /** The caption pill and its labels, measured once. */
  buildCaptions() {
    const caps = this.steps.filter((s) => s.do === 'caption')
    this.caps = caps
    if (!caps.length) return
    const u = this.u
    const tall = this.H > this.W
    const font = `600 ${Math.round(32 * u)}px/${Math.round(68 * u)}px ${cssVar('--sans', 'Helvetica Neue, Helvetica, Arial, sans-serif')}`
    this.pillH = Math.round(68 * u)
    this.pill = el('div', this.mount, `position:absolute;z-index:60;left:0;top:0;overflow:hidden;border-radius:${this.pillH / 2}px;background:${cssVar('--ink', INK)};visibility:hidden`)
    this.pillY = this.H - Math.round((tall ? 340 : 40) * u) - this.pillH
    this.labels = caps.map((c) => {
      const span = el('span', this.pill, `position:absolute;left:0;right:0;top:0;text-align:center;white-space:nowrap;font:${font};color:#fff`)
      span.textContent = c.text
      span.style.right = 'auto'
      const w = Math.ceil(span.offsetWidth + 72 * u)
      span.style.right = '0'
      return { span, w }
    })
  }

  drawCaptions(t) {
    if (!this.caps.length) return
    const { springTo, spring, springs, ease, prog } = this.k
    const first = this.caps[0].t0
    const w = springTo(t, 0, this.labels.map((l, i) => [this.caps[i].t0, l.w]), { freq: 2.4, damp: 0.8 })
    const h = this.pillH * Math.max(0, spring(t, first, springs.snappy))
    show(this.pill, t >= first)
    Object.assign(this.pill.style, { left: `${(this.W - w) / 2}px`, top: `${this.pillY + (this.pillH - h) / 2}px`, width: `${w.toFixed(2)}px`, height: `${h.toFixed(2)}px` })
    this.labels.forEach(({ span }, i) => {
      const t0 = this.caps[i].t0
      const pin = ease.out(prog(t, t0 + 0.05, t0 + 0.4))
      const pout = i === this.caps.length - 1 ? 0 : ease.in(prog(t, this.caps[i + 1].t0 - 0.2, this.caps[i + 1].t0 + 0.05))
      set(span, 'transform', `translateY(${((1 - pin) * 110 - pout * 110).toFixed(2)}%)`)
    })
  }

  /** The pointer, the click rings and the caption pill: screen-space layers above the camera layer. */
  buildOverlays() {
    const u = this.u
    const accent = cssVar('--accent', '#2F6BFF')
    this.rings = [0, 1].map(() => el('div', this.mount, `position:absolute;z-index:50;box-sizing:border-box;border-radius:50%;border:0 solid ${accent};visibility:hidden`))
    const dot = this.spec.pointer === 'dot'
    this.pointer = el('div', this.mount, `position:absolute;left:0;top:0;z-index:55;width:${44 * u}px;height:${44 * u}px;transform-origin:${dot ? '50% 50%' : `${8 * u}px ${4 * u}px`}`)
    this.pointer.innerHTML = dot
      ? `<svg width="100%" height="100%" viewBox="0 0 44 44"><circle cx="22" cy="22" r="11" fill="${INK}" stroke="#fff" stroke-width="3"/></svg>`
      : `<svg width="100%" height="100%" viewBox="0 0 22 22"><path d="M4 2l13 9-6 1.2L8 18z" fill="${INK}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`
    this.hot = dot ? [22 * u, 22 * u] : [8 * u, 4 * u]
    this.buildCaptions()
  }

  seek(t) {
    t = clamp(t, 0, this.duration)
    const { camera, camCss, project, route, ring, bump } = this.k
    const c = camera(t, this.camKeys)
    set(this.cam, 'transform', camCss(c))
    this.draws.forEach((d) => d(t))
    // the pointer: a hand's path in the world, drawn where the camera puts it, a touch larger when zoomed
    const w = route(t, this.stops)
    const p = project(c, { x: w.x + 2.4 * Math.sin(t * 1.7), y: w.y + 1.8 * Math.sin(t * 2.3 + 1) })
    const s = Math.sqrt(c.z)
    const press = this.presses.reduce((v, q) => v + bump(t, q.t, { freq: 3, damp: 0.5 }), 0)
    Object.assign(this.pointer.style, { left: `${(p.x - this.hot[0]).toFixed(2)}px`, top: `${(p.y - this.hot[1]).toFixed(2)}px`, transform: `scale(${(s * (1 - 0.55 * press)).toFixed(4)})` })
    this.rings.forEach((r, i) => {
      const q = this.presses.filter((x, j) => j % 2 === i && x.t <= t).at(-1)
      ring(r, t, q ? q.t : -9, q ? project(c, q.p) : { x: 0, y: 0 }, { from: 22 * s * this.u, to: 86 * s * this.u, width: 8 * this.u })
    })
    this.drawCaptions(t)
  }

  api() {
    return {
      width: this.W,
      height: this.H,
      fps: this.fps,
      duration: this.duration,
      beat: 60 / this.spec.bpm,
      bpm: this.spec.bpm,
      // a walkthrough is one take: every change is made from the one before, so there is no hard cut
      cuts: [],
      cues: cueSheet(this.spec),
      ready: Promise.resolve(),
      seek: (t) => this.seek(t),
    }
  }
}

/** Build the film from a spec and the page's own markup; resolves to the object render.mjs reads as window.film. */
export async function build(spec, mount = document.getElementById('stage')) {
  validateSpec(spec)
  const f = new Film(spec, mount)
  await document.fonts.ready
  f.draws = buildParts(f)
  f.compileSteps()
  f.compileCamera()
  f.buildOverlays()
  // the numbers rule reaches the page too: a digit a viewer can read has a source
  const bad = unsourced([...leafTexts(f.cam), ...f.q('[data-ph]').map((n) => n.dataset.ph), ...specTexts(spec)], spec.sources)
  if (bad) throw new Error(`spec: on-screen "${bad}" has a number and no entry in spec.sources (where does it come from?)`)
  f.seek(0)
  return f.api()
}
