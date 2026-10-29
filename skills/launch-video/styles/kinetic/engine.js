// The kinetic engine: runs a spec (spec.js) as a pure function of time. It builds the page once,
// then seek(t) sets every style from t alone, so the renderer can draw frames in any order and blur
// several per output frame. Written for this kit; the ideas (blocks on a beat grid, a camera rig that
// never parks, hits that shake and flash) are listed in references/blocks.md of the style.
//
//   <script type="module">
//     import { build } from '/.agents/skills/launch-video/styles/kinetic/engine.js'
//     import spec from './spec.js'
//     window.film = await build(spec)
//   </script>
import { BLOCK_CLASSES } from './blocks.js'
import { E, clamp, el, luminance, set, show, tw } from './core.js'
import { cueSheet, fill, validateSpec } from './spec.js'

const DEFAULT_PALETTE = { bg: '#0B1020', paper: '#F3EEE3', accent: '#FFC21A', hot: '#FF8A1F', ink: '#14120E' }
const DEFAULT_FONT = {
  family: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
  weight: 900,
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
}

class Film {
  constructor(spec, mount) {
    this.spec = spec
    ;[this.W, this.H] = spec.size ?? [1920, 1080]
    this.fps = spec.fps ?? 60
    this.bpm = spec.bpm
    this.duration = (spec.beats * 60) / spec.bpm
    this.pal = { ...DEFAULT_PALETTE, ...(spec.palette ?? {}) }
    this.font = { ...DEFAULT_FONT, ...(spec.font ?? {}) }
    this.hits = []
    this.cutSet = new Set([0])
    this.measureCache = new Map()
    this.scenes = []
    this.logoSvg = ''
    Object.assign(mount.style, { position: 'absolute', left: '0', top: '0', width: `${this.W}px`, height: `${this.H}px`, overflow: 'hidden' })
    this.mount = mount
    this.groundEl = el('div', mount, 'position:absolute;inset:0')
    this.camEl = el('div', mount, `position:absolute;left:0;top:0;width:${this.W}px;height:${this.H}px;transform-origin:0 0`)
    this.scenesEl = this.camEl
    this.flashEl = el('div', mount, 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none')
    this.vig = el('div', mount, 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.28) 100%)')
    this.capEl = el('div', mount, `position:absolute;left:${this.W * 0.035}px;top:${this.H * 0.045}px;white-space:pre;font:700 ${Math.round(this.H * 0.032)}px/1.2 ${this.font.mono};letter-spacing:0.02em`)
    this.ruler = el('span', document.body, `position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden;font:${this.font.weight} 100px/1 ${this.font.family};letter-spacing:-0.025em`)
  }

  b = (beats) => (beats * 60) / this.bpm

  col(c) {
    return this.pal[c] ?? c
  }

  hex(c) {
    return this.col(c)
  }

  /** Palette name of the readable type colour on a ground: paper on dark, ink on light. */
  ink(ground) {
    return luminance(this.col(ground)) > 0.45 ? 'ink' : 'paper'
  }

  text(s) {
    return fill(s, this.spec)
  }

  /** Width of a string in the display face at `size` px, measured once and scaled. */
  width(text, size) {
    let w = this.measureCache.get(text)
    if (w === undefined) {
      this.ruler.textContent = text
      w = this.ruler.getBoundingClientRect().width
      this.measureCache.set(text, w)
    }
    return (w * size) / 100
  }

  /** The font size at which `text` is exactly maxW wide. */
  fit(text, maxW) {
    return (100 * maxW) / Math.max(1, this.width(text, 100))
  }

  /** A size for monospace text that keeps `text` inside `frac` of the frame width (a mono advance is about 0.6 em). */
  mono(text, maxPx, frac = 0.9) {
    return Math.min(maxPx, (this.W * frac) / (0.6 * Math.max(1, text.length)))
  }

  hit(t, o) {
    this.hits.push({ t, shake: 0, bump: 0, flash: 0, ...o })
  }

  /** A small hit on every beat from `from` to `to` (seconds): a long shot still moves on the grid. */
  pulses(from, to, { shake = 3, bump = 0.018 } = {}) {
    for (let t = from + this.b(1); t < to - 1e-6; t += this.b(1)) this.hit(t, { shake, bump, flash: 0 })
  }

  cut(t) {
    this.cutSet.add(Math.round(t * 1e4) / 1e4)
  }

  async load() {
    const { weight, family, mono } = this.font
    await Promise.all([document.fonts.load(`${weight} 100px ${family}`), document.fonts.load(`700 20px ${mono}`)])
    await document.fonts.ready
    if (this.spec.logo) this.logoSvg = await loadSvg(this.spec.logo)
  }

  /** Shake, bump and flash at t: the sum of every hit that is still ringing. Pure in t. */
  fx(t) {
    let sx = 0
    let sy = 0
    let bump = 0
    let flash = 0
    for (const h of this.hits) {
      const dt = t - h.t
      if (dt < 0 || dt > 0.7) continue
      if (h.shake) {
        const a = h.shake * Math.exp(-dt * 13)
        sx += a * Math.sin(dt * 92 + h.t * 7)
        sy += a * Math.cos(dt * 83 + h.t * 3)
      }
      bump += h.bump * Math.exp(-dt * 11)
      flash = Math.max(flash, h.flash * Math.exp(-dt * 26))
    }
    return { sx, sy, bump, flash }
  }

  whip(s, t) {
    let x = 0
    let y = 0
    if (s.s.whipIn) {
      const [dx, dy, dur = 0.13] = s.s.whipIn
      const k = 1 - tw(t, s.t0, s.t0 + dur, E.outCubic)
      x += dx * k
      y += dy * k
    }
    if (s.s.whipOut) {
      const [dx, dy, dur = 0.13] = s.s.whipOut
      const k = tw(t, s.t1 - dur, s.t1, E.inCubic)
      x -= dx * k
      y -= dy * k
    }
    return { x, y }
  }

  seek(t) {
    t = clamp(t, 0, this.duration)
    let cur = this.scenes[0]
    for (const s of this.scenes) if (t >= s.t0) cur = s
    this.scenes.forEach((s) => show(s.el, s === cur))
    cur.update(t)
    const ground = cur.groundAt(t)
    set(this.groundEl, 'background', this.col(ground))
    const cam = cur.cam(t)
    const { sx, sy, bump, flash } = this.fx(t)
    const w = this.whip(cur, t)
    set(this.camEl, 'transform', `translate(${this.W / 2 + sx + w.x}px,${this.H / 2 + sy + w.y}px) rotate(${cam.r}deg) scale(${cam.s * (1 + bump)}) translate(${-cam.cx}px,${-cam.cy}px)`)
    set(this.flashEl, 'opacity', flash.toFixed(3))
    this.drawCaptions(t, ground)
  }

  drawCaptions(t, ground) {
    const phrase = (this.spec.captions ?? []).find((c) => t >= this.b(c.at[0]) && t < this.b(c.at[1]))
    if (!phrase) { set(this.capEl, 'display', 'none'); return }
    set(this.capEl, 'display', 'block')
    const shown = phrase.words.filter(([, beat]) => t >= this.b(beat))
    const ink = this.col(this.ink(ground === 'accent' ? 'accent' : ground))
    if (this.capEl.dataset.n !== `${phrase.at[0]}:${shown.length}`) {
      this.capEl.dataset.n = `${phrase.at[0]}:${shown.length}`
      this.capEl.innerHTML = shown.map(([w], i) => `<span style="color:${i === shown.length - 1 ? this.col('accent') : ink}">${escapeHtml(this.text(w))}</span>`).join(' ')
    }
    set(this.capEl, 'color', ink)
  }

  api() {
    const cues = cueSheet(this.spec)
    return {
      width: this.W,
      height: this.H,
      fps: this.fps,
      duration: this.duration,
      beat: 60 / this.bpm,
      bpm: this.bpm,
      // every hard cut: scene starts, shot starts, key frames. The renderer draws the frames either
      // side of each and keeps a motion-blur window from crossing one.
      cuts: [...this.cutSet].filter((c) => c > 0 && c < this.duration).sort((a, b) => a - b),
      cues,
      ready: Promise.resolve(),
      seek: (t) => this.seek(t),
    }
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
}

// The logo is inlined as markup, so anything active in the file is stripped first: scripts, embedded
// HTML, event handlers and javascript: links. The mark is the brand's file, never redrawn.
async function loadSvg(path) {
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

/** Build the film page from a spec; resolves to the object render.mjs reads as window.film. */
export async function build(spec, mount = document.getElementById('stage')) {
  validateSpec(spec)
  const f = new Film(spec, mount)
  await f.load()
  f.scenes = spec.scenes.map((sc) => new BLOCK_CLASSES[sc.block](f, sc))
  await Promise.all(f.scenes.filter((s) => s.decoded).map((s) => s.decoded()))
  f.seek(0)
  return f.api()
}
