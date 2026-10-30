// The story engine: runs a spec (spec.js) as a pure function of time. It builds the page once, then
// seek(t) sets every style from t alone, so the renderer can draw frames in any order and blur
// several per output frame. Written for this kit; the ideas (a camera that pushes and pans pictures,
// words that rise out of a mask on the beat, one turn, a quiet end card) are in STYLE.md.
//
//   <script type="module">
//     import { build } from '/.agents/skills/launch-video/styles/story/engine.js'
//     import spec from './spec.js'
//     window.film = await build(spec)
//   </script>
import { BLOCK_CLASSES, Lines } from './blocks.js'
import { clamp, el, loadSvg, set } from './core.js'
import { EXIT_SECONDS, cueSheet, cutBeats, validateSpec } from './spec.js'

const DEFAULT_PALETTE = { bg: '#0D1822', paper: '#F4EEE2', accent: '#F2A65A', ink: '#16130F' }
const DEFAULT_FONT = { serif: "Georgia, 'Times New Roman', serif", sans: "'Helvetica Neue', Helvetica, Arial, sans-serif" }

class Film {
  constructor(spec, mount) {
    this.spec = spec
    ;[this.W, this.H] = spec.size ?? [1920, 1080]
    this.unit = Math.min(this.W, this.H) / 1080 // type and gaps scale with this
    this.fps = spec.fps ?? 30
    this.bpm = spec.bpm
    this.duration = (spec.beats * 60) / spec.bpm
    this.pal = { ...DEFAULT_PALETTE, ...(spec.palette ?? {}) }
    this.font = { ...DEFAULT_FONT, ...(spec.font ?? {}) }
    this.plates = Object.fromEntries((spec.plates ?? []).map((p) => [p.id, p]))
    this.logoSvg = ''
    this.measureCache = new Map()
    // the page is the frame: a tall or square format sizes it, the host page need not
    for (const e of [document.documentElement, document.body]) Object.assign(e.style, { width: `${this.W}px`, height: `${this.H}px` })
    Object.assign(mount.style, { position: 'absolute', left: '0', top: '0', width: `${this.W}px`, height: `${this.H}px`, overflow: 'hidden', background: this.col('bg') })
    this.mount = mount
    this.stage = el('div', mount, 'position:absolute;inset:0')
    this.ruler = el('span', document.body, 'position:absolute;left:-9999px;top:0;white-space:pre;visibility:hidden')
  }

  b = (beats) => (beats * 60) / this.bpm

  col(c) {
    return this.pal[c] ?? c
  }

  /** Width of a string at 100 px in a face, measured once with no transform on it. */
  width(text, face, weight) {
    const key = `${face}|${weight}|${text}`
    let w = this.measureCache.get(key)
    if (w === undefined) {
      Object.assign(this.ruler.style, { font: `${weight} 100px ${this.font[face]}`, letterSpacing: '0' })
      this.ruler.textContent = text
      w = this.ruler.getBoundingClientRect().width
      this.measureCache.set(key, w)
    }
    return w
  }

  /** The font size at which `text` is maxW wide in a face. */
  fit(text, maxW, face = 'serif', weight = 400) {
    return (100 * maxW) / Math.max(1, this.width(text, face, weight))
  }

  async load() {
    await Promise.all([`400 100px ${this.font.serif}`, `700 100px ${this.font.sans}`].map((f) => document.fonts.load(f)))
    await document.fonts.ready
    if (this.spec.logo) this.logoSvg = await loadSvg(this.spec.logo)
  }

  seek(t) {
    t = clamp(t, 0, this.duration)
    let cur = this.scenes[0]
    for (const s of this.scenes) if (t >= s.t0) cur = s
    for (const s of this.scenes) set(s.el, 'display', s === cur ? 'block' : 'none')
    cur.update(t)
    this.lines.update(t, cur.toneAt(t), cur.s.block !== 'Card')
  }

  api() {
    return {
      width: this.W,
      height: this.H,
      fps: this.fps,
      duration: this.duration,
      beat: 60 / this.bpm,
      bpm: this.bpm,
      // every hard cut: scene starts that are not handoffs, and each cut-in. The renderer draws the
      // frames either side of each and keeps a motion-blur window from crossing one.
      cuts: cutBeats(this.spec).map((b) => this.b(b)).filter((c) => c > 0 && c < this.duration),
      cues: cueSheet(this.spec),
      ready: Promise.resolve(),
      seek: (t) => this.seek(t),
    }
  }
}

/** Build the film page from a spec; resolves to the object render.mjs reads as window.film. */
export async function build(spec, mount = document.getElementById('stage')) {
  validateSpec(spec)
  const f = new Film(spec, mount)
  await f.load()
  f.scenes = spec.scenes.map((sc, i) => new BLOCK_CLASSES[sc.block](f, sc, i))
  f.scenes.forEach((s, i) => s.link?.(f.scenes[i - 1], f.scenes[i + 1]))
  f.lines = new Lines(f, spec.lines ?? [], EXIT_SECONDS)
  await Promise.all(f.scenes.map((s) => s.decoded?.()))
  f.seek(0)
  return f.api()
}
