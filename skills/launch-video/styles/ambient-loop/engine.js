// The ambient-loop engine: runs a spec (spec.js) as a pure function of the loop phase. The page is
// built once; seek(t) sets every layer's transform from t alone, and every layer completes whole
// cycles in the loop's length T, so seek(T) draws what seek(0) draws and the last frame wraps to
// the first as one ordinary step. Written for this kit.
//
//   <script type="module">
//     import { build } from '/.agents/skills/launch-video/styles/ambient-loop/engine.js'
//     import spec from './spec.js'
//     window.film = await build(spec)      // ?format=header|search picks the frame
//   </script>
import { breathe, drift, grainShift, grainTick, hash, layout, place, ribbonPath, turn } from './loop-kit.js'
import { FORMATS, validateSpec } from './spec.js'

const GRAIN_CELLS = 256

function el(tag, parent, css = '') {
  const e = document.createElement(tag)
  if (css) e.style.cssText = css
  if (parent) parent.appendChild(e)
  return e
}
/** Set a style only when it changes. */
function set(e, k, v) {
  if (e.style[k] !== v) e.style[k] = v
}
const px = (v) => `${Math.round(v * 100) / 100}px`
const rgb = (h) => {
  const s = h.replace('#', '')
  const f = s.length === 3 ? [...s].map((x) => x + x).join('') : s
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}
const smooth = (x) => x * x * (3 - 2 * x)

/** A radial falloff from the centre: flat to `1 - soft` of the radius, then a smooth step to nothing. */
function glow(hex, soft) {
  const [r, g, b] = rgb(hex)
  const inner = 1 - soft
  const stops = Array.from({ length: 9 }, (_, i) => {
    const x = i / 8
    const a = 1 - smooth(Math.min(1, Math.max(0, (x - inner) / Math.max(1e-6, 1 - inner))))
    return `rgba(${r},${g},${b},${a.toFixed(4)}) ${(x * 100).toFixed(1)}%`
  })
  return `radial-gradient(closest-side,${stops.join(',')})`
}

class Loop {
  constructor(spec, mount, format) {
    this.spec = spec
    this.format = format
    ;[this.W, this.H] = FORMATS[format]
    this.T = spec.seconds
    this.fps = spec.fps ?? 30
    this.L = layout(this.W, this.H)
    this.col = (c) => spec.palette[c] ?? c
    Object.assign(document.documentElement.style, { width: `${this.W}px`, height: `${this.H}px`, overflow: 'hidden' })
    Object.assign(document.body.style, { width: `${this.W}px`, height: `${this.H}px`, margin: '0', overflow: 'hidden' })
    Object.assign(mount.style, { position: 'absolute', left: '0', top: '0', width: `${this.W}px`, height: `${this.H}px`, overflow: 'hidden', background: spec.ground2 ? `linear-gradient(180deg,${this.col(spec.ground)},${this.col(spec.ground2)})` : this.col(spec.ground) })
    this.layers = spec.layers.filter((l) => !l.only || l.only === format).map((l) => this.make(l, mount))
    this.mount = mount
    const { u } = this.L
    this.cell = Math.max(1, Math.round(1.25 * (u / 1080)))
    this.grain = el('div', mount, `position:absolute;inset:0;z-index:10;pointer-events:none;image-rendering:pixelated;background-image:url(${this.tile(spec.grain ?? 0.045)});background-size:${GRAIN_CELLS * this.cell}px ${GRAIN_CELLS * this.cell}px`)
  }

  /** A tile of fine noise, black and white at low alpha, from a hash of the pixel index. It also dithers the gradients. */
  tile(strength) {
    const c = document.createElement('canvas')
    c.width = c.height = GRAIN_CELLS
    const g = c.getContext('2d')
    const img = g.createImageData(GRAIN_CELLS, GRAIN_CELLS)
    for (let i = 0; i < GRAIN_CELLS * GRAIN_CELLS; i++) {
      const n = hash(i * 0.713) * 2 - 1
      const v = n > 0 ? 255 : 0
      img.data.set([v, v, v, Math.round(Math.abs(n) * strength * 255)], i * 4)
    }
    g.putImageData(img, 0, 0)
    return c.toDataURL()
  }

  /** One layer: an element built for its kind, and update(t) that sets its transform from t alone. */
  make(l, mount) {
    const { u } = this.L
    const base = place(this.L, l, this.format)
    const hex = this.col(l.color)
    const S = l.size * u
    const common = `position:absolute;left:0;top:0;opacity:${l.opacity ?? 1};mix-blend-mode:${l.blend ?? 'normal'}`
    const motion = (t) => {
      const d = l.drift ? drift(t, this.T, l.drift) : { x: 0, y: 0 }
      return { x: base.x + d.x * u, y: base.y + d.y * u, k: l.breathe ? breathe(t, this.T, l.breathe) : 1 }
    }
    if (l.kind === 'ribbon') {
      const svg = el('div', mount, `${common};width:${this.W}px;height:${this.H}px`)
      svg.innerHTML = `<svg width="${this.W}" height="${this.H}" viewBox="0 0 ${this.W} ${this.H}" style="display:block"><path fill="${hex}"/></svg>`
      const path = svg.querySelector('path')
      return (t) => {
        const m = motion(t)
        path.setAttribute('d', ribbonPath(t, this.T, { w: this.W, y0: m.y, amp: l.amp * u * m.k, thick: S * m.k, waves: l.waves, flow: l.flow ?? 0, ph: l.ph ?? 0 }))
      }
    }
    const round = l.kind === 'tile' ? `${(l.radius ?? 0.2) * S}px` : '50%'
    const fill = l.kind === 'orb' ? `background:${glow(hex, l.soft ?? 0.8)}` : l.kind === 'tile' && !l.width ? `background:${hex}` : `border:${px((l.width ?? 0) * u)} solid ${hex}`
    const e = el('div', mount, `${common};width:${px(S)};height:${px(S)};box-sizing:border-box;border-radius:${round};${fill}`)
    return (t) => {
      const m = motion(t)
      const spin = l.turns ? ` rotate(${turn(t, this.T, l.turns).toFixed(3)}deg)` : ''
      set(e, 'transform', `translate(${(m.x - S / 2).toFixed(2)}px,${(m.y - S / 2).toFixed(2)}px)${spin} scale(${m.k.toFixed(5)})`)
    }
  }

  async loadMark(m) {
    const res = await fetch(m.src)
    if (!res.ok) throw new Error(`mark ${m.src}: ${res.status}`)
    const doc = new DOMParser().parseFromString(await res.text(), 'image/svg+xml')
    const svg = doc.documentElement
    if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error(`mark ${m.src} is not an SVG`)
    // inlined as markup, so anything active in the file is stripped first
    svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove())
    for (const n of [svg, ...svg.querySelectorAll('*')]) for (const a of [...n.attributes]) if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^javascript:/i.test(a.value))) n.removeAttribute(a.name)
    const { u } = this.L
    const w = m.size * u
    const box = el('div', this.mount, `position:absolute;left:${px(this.W * m.at[0] - w / 2)};top:${px(this.H * m.at[1] - w / 2)};width:${px(w)};height:${px(w)};z-index:9;color:${this.col(m.color ?? 'paper')}`)
    box.innerHTML = new XMLSerializer().serializeToString(svg)
    Object.assign(box.firstChild.style, { width: '100%', height: '100%', display: 'block' })
  }

  seek(t) {
    t = Math.min(Math.max(t, 0), this.T)
    for (const update of this.layers) update(t)
    const [gx, gy] = grainShift(grainTick(t, this.T), GRAIN_CELLS)
    set(this.grain, 'backgroundPosition', `${-gx * this.cell}px ${-gy * this.cell}px`)
  }

  api() {
    return {
      width: this.W,
      height: this.H,
      fps: this.fps,
      duration: this.T,
      // no music, so no beats: a twelfth of the loop is the step `--stills every:N` and the viewer use
      beat: this.T / 12,
      cuts: [],
      hardCuts: [],
      ready: Promise.resolve(),
      seek: (t) => this.seek(t),
    }
  }
}

/** Build the loop page from a spec; resolves to the object render.mjs reads as window.film. */
export async function build(spec, mount = document.getElementById('stage')) {
  validateSpec(spec)
  const formats = spec.formats ?? Object.keys(FORMATS)
  const format = new URLSearchParams(location.search).get('format') ?? formats[0]
  if (!formats.includes(format)) throw new Error(`format "${format}" is not one of ${formats.join(', ')}`)
  const f = new Loop(spec, mount, format)
  if (spec.mark) await f.loadMark(spec.mark)
  await document.fonts.ready
  f.seek(0)
  return f.api()
}
