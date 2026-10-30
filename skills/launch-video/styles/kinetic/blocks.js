// The kinetic block library. A block draws one stretch of the film from a scene of the spec; its
// update(t) sets styles from t alone. `f` is the film context engine.js builds (palette, beat
// conversion, text measuring, the hit and cut registers). Written for this kit, from the ideas in
// references/blocks.md: a block per kind of phrase, a camera that never parks, a hit on every beat.
import { E, clamp, el, hash, lerp, mix, place, rgba, set, show, tw, wrap } from './core.js'

const TAU = Math.PI * 2

/** A word, centred on its parent, in the film's display face. */
function word(f, parent, text, size, color, css = '') {
  const e = el('div', parent, `position:absolute;left:50%;top:50%;white-space:nowrap;font:${f.font.weight} ${size}px/1 ${f.font.family};color:${color};letter-spacing:-0.025em;transform-origin:50% 50%;${css}`)
  e.textContent = text
  return e
}

class Base {
  constructor(f, scene) {
    this.f = f
    this.s = scene
    this.t0 = f.b(scene.at[0])
    this.t1 = f.b(scene.at[1])
    this.dir = scene.dir ?? 1
    this.el = el('div', f.scenesEl, `position:absolute;left:0;top:0;width:${f.W}px;height:${f.H}px;display:none`)
    f.cut(this.t0)
  }

  groundAt() {
    return this.s.ground ?? 'bg'
  }

  /** The scene point at the middle of the frame, a zoom and a roll. Never still: a push and a lean over the block. */
  cam(t) {
    const u = clamp((t - this.t0) / (this.t1 - this.t0))
    return { cx: this.f.W / 2, cy: this.f.H / 2, s: 1 + 0.07 * u, r: this.dir * 1.2 * (u - 0.5) }
  }

  /** Where a block stands in time, 0 to 1. */
  u(t) {
    return clamp((t - this.t0) / (this.t1 - this.t0))
  }
}

// ───────── Words: one shot per beat or half beat ─────────

export class Words extends Base {
  constructor(f, scene) {
    super(f, scene)
    this.shots = scene.shots.map((shot) => this.makeShot(shot))
    this.charge = scene.charge ? this.makeCharge() : null
    this.exit = scene.exit
    this.zoom = null
    if (scene.exit?.type === 'zoom') this.zoom = this.measureZoom(scene)
    this.tFirst = this.shots[0].t
    // the shot a hit belongs to
    this.shots.forEach((s, i) => {
      f.cut(s.t)
      if (s.def.pulse !== false && s.def.fx !== 'none') f.pulses(s.t + f.b(s.def.second ?? 0), this.shots[i + 1] ? this.shots[i + 1].t : this.t1)
      const fx = s.def.fx ?? (s.def.style === 'cut' ? 'beat' : 'punch')
      const at = s.t + f.b(s.def.second ?? 0)
      if (fx === 'punch') f.hit(at, { shake: 16, bump: 0.05, flash: 0.35 })
      else if (fx === 'hit') f.hit(at, { shake: 9, bump: 0.03, flash: 0.18 })
      else if (fx === 'beat') f.hit(at, { shake: 4, bump: 0.025, flash: 0 })
    })
    if (scene.exit?.type === 'flash') f.hit(f.b(scene.exit.at), { shake: 0, bump: 0, flash: 1 })
  }

  groundAt(t) {
    let g = this.s.ground ?? 'bg'
    for (const s of this.shots) if (t >= s.t) g = s.def.ground ?? this.s.ground ?? 'bg'
    return g
  }

  makeCharge() {
    const f = this.f
    const g = el('div', this.el, 'position:absolute;inset:0')
    const lines = Array.from({ length: 30 }, (_, i) => el('div', g, `position:absolute;left:50%;top:50%;height:${3 + Math.floor(hash(i) * 3)}px;background:${f.col('paper')};transform-origin:0 50%`))
    const dot = el('div', g, `position:absolute;left:50%;top:50%;border-radius:50%;background:${f.col('accent')}`)
    return { g, lines, dot }
  }

  drawCharge(t) {
    const { f, charge } = this
    const end = this.tFirst
    const u = clamp((t - this.t0) / (end - this.t0))
    charge.lines.forEach((l, i) => {
      const a = (i / charge.lines.length) * 360 + hash(i + 40) * 8
      const phase = hash(i + 3) * 0.5
      const p = clamp((u - phase * 0.4) / (1 - phase * 0.4))
      const r = lerp(f.W * 0.62, 12, E.inCubic(p))
      set(l, 'width', `${(1 - p * 0.8) * (140 + 160 * hash(i + 9))}px`)
      set(l, 'transform', `rotate(${a}deg) translateX(${r}px)`)
    })
    const d = 10 + 70 * E.inCubic(u)
    set(charge.dot, 'width', `${d}px`)
    set(charge.dot, 'height', `${d}px`)
    set(charge.dot, 'marginLeft', `${-d / 2}px`)
    set(charge.dot, 'marginTop', `${-d / 2}px`)
    set(charge.dot, 'boxShadow', `0 0 ${20 + 90 * u}px ${10 + 30 * u}px ${rgba(f.col('accent'), 0.55)}`)
  }

  /**
   * Where a letter sits in the last shot, from the word's own centre: measured once, with the scene
   * on screen and the word at rest (a hidden element measures 0, and a zero here divides to a NaN
   * camera that the browser silently ignores). The camera adds the word's pose at t (drift, tilt).
   */
  measureZoom(scene) {
    const last = this.shots[this.shots.length - 1]
    if (!last.pose) throw new Error('spec: a zoom exit needs a slam or cut shot last')
    const idx = scene.exit.char ?? 0
    const text = last.main.firstChild
    this.el.style.display = 'block'
    last.g.style.display = 'block'
    last.main.style.transform = place(0, 0, 0, 1)
    const word = last.main.getBoundingClientRect()
    const range = document.createRange()
    range.setStart(text, idx)
    range.setEnd(text, idx + 1)
    const r = range.getBoundingClientRect()
    this.el.style.display = 'none'
    last.g.style.display = 'none'
    last.main.style.transform = ''
    const dx = r.left + r.width / 2 - (word.left + word.width / 2)
    const dy = r.top + r.height / 2 - (word.top + word.height / 2)
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || word.width === 0) throw new Error('the zoom exit could not measure its letter')
    return { dx, dy, size: last.size, shot: last }
  }

  cam(t) {
    const f = this.f
    const base = super.cam(t)
    if (!this.zoom || !this.exit) return base
    const at = f.b(this.exit.at)
    const dur = f.b(this.exit.dur ?? 1)
    const p = tw(t, at, at + dur, E.lin)
    if (p <= 0) return base
    // the letter's place now: the word's centre plus its pose (drift, tilt, growth) times the letter's offset
    const { dx, dy, size, shot } = this.zoom
    const pose = shot.pose(t - shot.t)
    const a = (pose.rot * Math.PI) / 180
    const lx = f.W / 2 + pose.x + pose.s * (dx * Math.cos(a) - dy * Math.sin(a))
    const ly = f.H / 2 + pose.y + pose.s * (dx * Math.sin(a) + dy * Math.cos(a))
    const S = Math.max(12, 8000 / (size * pose.s))
    const focus = E.outCubic(p)
    return {
      cx: lerp(f.W / 2, lx, focus),
      cy: lerp(f.H / 2, ly, focus),
      s: base.s * Math.exp(Math.log(S) * E.inExpo(p)),
      r: base.r * (1 - p),
    }
  }

  makeShot(def) {
    const f = this.f
    const t = f.b(def.at)
    const ground = def.ground ?? this.s.ground ?? 'bg'
    const color = f.col(def.color ?? f.ink(ground))
    const g = el('div', this.el, 'position:absolute;inset:0;display:none')
    const shot = { def, t, g, ground, color }
    const fitW = def.fit ?? 0.9
    const text = Array.isArray(def.text) ? def.text.map((x) => f.text(x)) : f.text(def.text)
    const dir = def.dir ?? (hash(Math.round(def.at * 4)) > 0.5 ? 1 : -1)
    const slow = (ts) => 1 + 0.05 * ts // a word keeps growing after it lands: nothing parks
    const whip = this.whipOf(def, t)

    const ghosts = (str, size, tint) => {
      if (def.echo === false) return () => {}
      const pitch = f.width(`${str}   `, size)
      const n = Math.ceil((f.W * 1.3) / pitch) + 3
      const rows = [-2, -1, 1, 2].filter((k) => Math.abs(k * size * 0.98) < f.H * 0.62).map((k) => ({
        k,
        e: word(f, g, `${str}   `.repeat(n), size, 'transparent', `-webkit-text-stroke:${Math.max(2, size * 0.011)}px ${rgba(tint, 0.42)};`),
      }))
      return (ts) => rows.forEach(({ k, e }, i) => set(e, 'transform', place(wrap(ts * (380 + 90 * i) * (k % 2 ? 1 : -1) * dir + hash(i) * pitch, pitch) - pitch, k * size * 0.98)))
    }
    const colourHex = f.hex(def.color ?? f.ink(ground))

    if (def.style === 'slam' || def.style === 'cut') {
      const size = def.size ?? Math.min(f.H * (def.style === 'cut' ? 0.74 : 0.62), f.fit(text, f.W * fitW))
      shot.size = size
      const rows = ghosts(text, size, colourHex)
      shot.main = word(f, g, text, size, color)
      const rot = def.rot ?? (def.style === 'cut' ? 0 : -2.5 * dir)
      // where the word stands ts seconds after it lands: also what a zoom exit flies into
      shot.pose = (ts) => {
        const land = def.style === 'cut' ? tw(ts, 0, 0.07, E.outCubic) : tw(ts, 0, 0.16, E.outExpo)
        const w = whip(ts)
        return { x: dir * ts * 46 + w.x, y: (def.y ?? 0) + w.y, rot: rot * (1 - 0.7 * land), s: lerp(def.from ?? (def.style === 'cut' ? 1.14 : 1.9), 1, land) * slow(ts) }
      }
      shot.draw = (ts) => {
        const p = shot.pose(ts)
        set(shot.main, 'transform', place(p.x, p.y, p.rot, p.s))
        rows(ts)
      }
    } else if (def.style === 'stack') {
      const size = def.size ?? Math.min(f.H * 0.5, f.fit(text[1], f.W * fitW))
      shot.size = size
      const kick = word(f, g, text[0], size * 0.34, color)
      const bar = el('div', g, `position:absolute;left:50%;top:50%;height:${Math.max(6, size * 0.035)}px;background:${f.col('accent')};transform-origin:0 50%`)
      const kw = f.width(text[0], size * 0.34)
      shot.main = word(f, g, text[1], size, color)
      const rows = ghosts(text[1], size, colourHex)
      const at2 = f.b(def.second ?? 1)
      shot.draw = (ts) => {
        const k = tw(ts, 0, 0.18, E.outCubic)
        set(kick, 'transform', place(whip(ts).x - (1 - k) * 160, -size * 0.74 + whip(ts).y, 0, 1))
        set(bar, 'width', `${kw * tw(ts, 0.05, 0.3, E.outCubic)}px`)
        set(bar, 'transform', `translate(${-kw / 2}px,${-size * 0.74 + size * 0.2}px)`)
        const m = tw(ts, at2, at2 + 0.14, E.outExpo)
        set(shot.main, 'transform', place(dir * (ts - at2) * 46, size * 0.08, -2 * dir * (1 - m), lerp(1.8, 1, m) * slow(Math.max(0, ts - at2))))
        set(shot.main, 'display', ts >= at2 ? 'block' : 'none')
        if (ts >= at2) rows(ts - at2)
      }
    } else if (def.style === 'split') {
      const size = def.size ?? Math.min(f.H * 0.62, f.fit(text[1], f.W * fitW))
      shot.size = size
      const small = word(f, g, text[0], size * 0.3, color)
      shot.main = word(f, g, text[1], size, color)
      const rows = ghosts(text[1], size, colourHex)
      const at2 = f.b(def.second ?? 1)
      const sw = f.width(text[0], size * 0.3)
      shot.draw = (ts) => {
        set(small, 'transform', place(-f.W * 0.5 + sw / 2 + f.W * 0.06 + whip(ts).x, -size * 0.62, 0, lerp(1.4, 1, tw(ts, 0, 0.14, E.outExpo))))
        const m = tw(ts, at2, at2 + 0.13, E.outExpo)
        set(shot.main, 'transform', place((1 - m) * f.W * 0.9, size * 0.1, -2 * (1 - m), slow(Math.max(0, ts - at2))))
        set(shot.main, 'display', ts >= at2 ? 'block' : 'none')
        if (ts >= at2) rows(ts - at2)
      }
    } else if (def.style === 'pair') {
      const size = def.size ?? Math.min(f.H * 0.4, f.fit(text[0].length > text[1].length ? text[0] : text[1], f.W * fitW))
      shot.size = size
      const a = word(f, g, text[0], size, color)
      shot.main = word(f, g, text[1], size, color)
      shot.draw = (ts) => {
        const m = tw(ts, 0, 0.15, E.outExpo)
        set(a, 'transform', place(-(1 - m) * f.W + ts * 30 + whip(ts).x, -size * 0.55, 0, slow(ts)))
        set(shot.main, 'transform', place((1 - m) * f.W - ts * 30, size * 0.55, 0, slow(ts)))
      }
    } else {
      // punch3d: an extruded word flies out of depth, with an echo trail behind it
      const size = def.size ?? Math.min(f.H * 0.55, f.fit(text, f.W * fitW))
      shot.size = size
      const persp = el('div', g, `position:absolute;inset:0;perspective:1300px`)
      const stack = el('div', persp, 'position:absolute;left:50%;top:50%;transform-style:preserve-3d')
      const layers = 16
      const side = f.hex(def.side ?? 'accent')
      const depth = size * 0.035
      const copies = Array.from({ length: layers }, (_, i) => {
        const c = i === 0 ? color : mix(side, '#000000', 0.25 + 0.5 * (i / layers))
        return word(f, stack, text, size, c)
      })
      shot.main = copies[0]
      const echo = [0.05, 0.1].map((_, i) => word(f, g, text, size, 'transparent', `-webkit-text-stroke:${Math.max(2, size * 0.012)}px ${rgba(colourHex, 0.3 - i * 0.12)};`))
      shot.draw = (ts) => {
        const m = tw(ts, 0, 0.26, E.outExpo)
        const rotY = lerp(-38, -7, m) + 4 * Math.sin(ts * 7)
        set(stack, 'transform', `translateZ(${lerp(-2600, 0, m)}px) rotateY(${rotY}deg) rotateX(${lerp(14, 3, m)}deg)`)
        copies.forEach((c, i) => set(c, 'transform', `translate(-50%,-50%) translateZ(${-i * depth}px)`))
        echo.forEach((e, i) => {
          const mm = tw(ts - (i + 1) * 0.04, 0, 0.26, E.outExpo)
          set(e, 'transform', place(0, 0, 0, lerp(1.9, 1, mm)))
        })
      }
    }
    return shot
  }

  /** A shot that arrives on a whip: the frame slides in from a side in 0.13 s. */
  whipOf(def, t) {
    const f = this.f
    const kind = def.in
    if (!kind || kind === 'cut') return () => ({ x: 0, y: 0 })
    const sgn = kind === 'whipXr' ? -1 : 1
    return (ts) => {
      const k = 1 - tw(ts, 0, 0.13, E.outCubic)
      return kind === 'whipY' ? { x: 0, y: k * f.H * 0.9 } : { x: sgn * k * f.W * 0.9, y: 0 }
    }
  }

  update(t) {
    if (this.charge) show(this.charge.g, t < this.tFirst)
    if (this.charge && t < this.tFirst) this.drawCharge(t)
    let cur = -1
    this.shots.forEach((s, i) => { if (t >= s.t) cur = i })
    this.shots.forEach((s, i) => show(s.g, i === cur))
    if (cur >= 0) this.shots[cur].draw(t - this.shots[cur].t)
  }
}

// ───────── Strike: "NO <thing>." over a mock of the thing, then the thing dies ─────────

export class Strike extends Base {
  constructor(f, scene) {
    super(f, scene)
    this.items = scene.items.map((def, i) => this.makeItem(def, i))
    this.items.forEach((it) => {
      f.cut(it.t)
      f.hit(it.t + f.b(1), { shake: 18, bump: 0.05, flash: 0.4 })
      f.hit(it.t + f.b(1.5), { shake: 8, bump: 0.02, flash: 0.15 })
      f.pulses(it.t, it.t + f.b(1), { shake: 3, bump: 0.015 })
    })
  }

  groundAt(t) {
    let g = this.s.ground ?? 'bg'
    for (const it of this.items) if (t >= it.t) g = it.def.ground ?? this.s.ground ?? 'bg'
    return g
  }

  makeItem(def, index) {
    const f = this.f
    const t = f.b(def.at)
    const ground = def.ground ?? this.s.ground ?? 'bg'
    const ink = f.col(f.ink(ground))
    const g = el('div', this.el, 'position:absolute;inset:0;display:none')
    const ui = def.ui ?? { type: 'tiles', tiles: [] }
    const mock = this.makeMock(g, ui, ground, ink)
    const wsize = Math.min(f.H * 0.3, f.fit(def.word, f.W * 0.86))
    const outline = word(f, g, def.word, wsize, 'transparent', `-webkit-text-stroke:${Math.max(3, wsize * 0.014)}px ${ink};`)
    const fillWrap = el('div', g, 'position:absolute;inset:0;overflow:hidden')
    const filled = word(f, fillWrap, def.word, wsize, f.col('accent'))
    const noSize = f.H * 0.42
    const no = word(f, g, this.s.no ?? 'NO', noSize, f.col(ground === 'accent' ? 'ink' : 'accent'))
    const last = index === this.s.items.length - 1
    return {
      def, t, g, ground,
      draw: (ts, tAbs) => {
        const b = (n) => f.b(n)
        const enter = tw(ts, 0, 0.28, E.outCubic)
        mock.draw(ts, enter, b(2) - 0, tAbs)
        const slam = tw(ts, b(1), b(1) + 0.12, E.outExpo)
        set(no, 'display', ts >= b(1) ? 'block' : 'none')
        set(no, 'transform', place(-f.W * 0.27, -f.H * 0.12, -4, lerp(2.2, 1, slam)))
        set(outline, 'transform', place(0, f.H * 0.27 + ts * 14, 0, 1 + 0.02 * ts))
        set(filled, 'transform', place(0, f.H * 0.27 + ts * 14, 0, 1 + 0.02 * ts))
        const fillP = tw(ts, b(1.5), b(1.5) + 0.2, E.outCubic)
        set(fillWrap, 'clipPath', `inset(0 ${(1 - fillP) * 100}% 0 0)`)
        set(outline, 'display', ts >= b(1) ? 'block' : 'none')
        set(fillWrap, 'display', ts >= b(1.5) ? 'block' : 'none')
        // the last item ends in a TV switch-off: squash to a line, then a point
        if (last) {
          const off = f.b(this.s.at[1]) - 0.5
          const sq = tw(tAbs, off, off + 0.28, E.inCubic)
          const pt = tw(tAbs, off + 0.28, off + 0.46, E.inCubic)
          set(g, 'transform', sq > 0 ? `translate(${f.W / 2}px,${f.H / 2}px) scale(${1 - pt},${Math.max(0.004, 1 - sq)}) translate(${-f.W / 2}px,${-f.H / 2}px)` : 'none')
        }
      },
    }
  }

  /** The mock of the thing being struck: a timeline, tiles or a rack. It is decoration; the words are the claim. */
  makeMock(g, ui, ground, ink) {
    const f = this.f
    const panel = f.hex(ground === 'bg' ? 'paper' : 'ink')
    const wrap = el('div', g, `position:absolute;left:50%;top:50%;width:${f.W * 0.62}px;height:${f.H * 0.46}px;margin:${-f.H * 0.32}px 0 0 ${-f.W * 0.31}px`)
    const box = (parent, css) => el('div', parent, `position:absolute;${css}`)
    const draw = []
    const label = (parent, text, css) => {
      const e = el('div', parent, `position:absolute;font:700 ${Math.round(f.H * 0.026)}px/1 ${f.font.mono};color:${ink};white-space:nowrap;${css}`)
      e.textContent = text
      return e
    }
    if (ui.type === 'timeline') {
      const frame = box(wrap, `inset:0;border:3px solid ${ink};border-radius:18px;overflow:hidden;background:${rgba(panel, 0.08)}`)
      label(frame, ui.title ?? 'sequence', 'left:3%;top:6%')
      label(frame, ui.tag ?? '', 'right:3%;top:6%')
      const tracks = [0.22, 0.42, 0.62, 0.82].map((y, r) => ({ y, blocks: [[0.04 + 0.02 * r, 0.3], [0.38, 0.22 - 0.02 * r], [0.64 + 0.03 * r, 0.28 - 0.03 * r]] }))
      tracks.forEach((tr, r) => tr.blocks.forEach(([x, w], k) => box(frame, `left:${x * 100}%;width:${w * 100}%;top:${tr.y * 100}%;height:13%;border-radius:8px;background:${k === 1 ? f.col('accent') : rgba(f.hex(ink), 0.28 + 0.1 * r)}`)))
      const head = box(frame, `top:14%;bottom:0;width:4px;background:${f.col('hot')}`)
      // the two halves of a struck timeline: the whole mock is drawn again, each clipped along the slash
      const halves = [0, 1].map((i) => {
        const h = el('div', wrap, `position:absolute;inset:0;clip-path:polygon(${i ? '58% 0,100% 0,100% 100%,42% 100%' : '0 0,58% 0,42% 100%,0 100%'});display:none`)
        h.innerHTML = frame.outerHTML
        h.firstChild.style.cssText = frame.style.cssText
        return h
      })
      draw.push((ts, enter) => {
        set(head, 'left', `${(wrap_(ts * 0.3) * 0.9 + 0.04) * 100}%`)
        const die = tw(ts, f.b(2), f.b(2) + 0.45, E.inCubic)
        set(frame, 'display', die > 0 ? 'none' : 'block')
        halves.forEach((h, i) => {
          set(h, 'display', die > 0 ? 'block' : 'none')
          set(h, 'transform', `translate(${(i ? 1 : -1) * die * f.W * 0.35}px,${die * die * f.H * 0.5}px) rotate(${(i ? 1 : -1) * die * 14}deg)`)
        })
        set(wrap, 'transform', `translateX(${(1 - enter) * f.W * 0.5}px) scale(${lerp(0.9, 1, enter)})`)
      })
    } else if (ui.type === 'rack') {
      const rows = (ui.rows ?? ['NODE 01', 'NODE 02', 'NODE 03']).map((text, r) => {
        const row = box(wrap, `left:0;right:0;top:${r * 31}%;height:26%;border:3px solid ${ink};border-radius:14px`)
        label(row, text, 'left:4%;top:38%')
        const leds = Array.from({ length: 6 }, (_, k) => box(row, `right:${4 + k * 5.2}%;top:36%;width:3.2%;height:28%;border-radius:50%;background:${f.col('accent')}`))
        return { row, leds }
      })
      draw.push((ts, enter) => {
        set(wrap, 'transform', `translateX(${(1 - enter) * f.W * 0.5}px) scale(${lerp(0.9, 1, enter)})`)
        rows.forEach(({ row, leds }, r) => {
          const power = tw(ts, f.b(2) + r * 0.12, f.b(2) + r * 0.12 + 0.2, E.inCubic)
          leds.forEach((l, k) => set(l, 'background', power > 0.5 ? rgba(f.hex(ink), 0.25) : Math.sin(ts * 14 + k * 1.7 + r) > -0.2 ? f.col('accent') : rgba(f.hex(ink), 0.25)))
          // an identity transform is no transform: a bordered box with one draws its edges differently
          set(row, 'transform', power > 0 ? `scaleY(${1 - power * 0.12})` : 'none')
          set(row, 'opacity', power > 0 ? String(1 - power * 0.55) : '1')
        })
      })
    } else {
      const tiles = (ui.tiles?.length ? ui.tiles : [['ONE', '◆', ''], ['TWO', '●', ''], ['THREE', '▲', ''], ['FOUR', '■', '']]).map(([name, glyph, tag], k) => {
        const tile = box(wrap, `left:${k * 25.5}%;top:18%;width:23%;height:64%;border:3px solid ${ink};border-radius:18px`)
        label(tile, glyph, `left:50%;top:30%;font-size:${Math.round(f.H * 0.08)}px;transform:translateX(-50%)`)
        label(tile, name, 'left:8%;bottom:16%')
        label(tile, tag, 'left:8%;bottom:6%;opacity:.6')
        return tile
      })
      draw.push((ts, enter) => {
        tiles.forEach((tile, k) => {
          const die = Math.max(0, ts - (f.b(2) + k * 0.06))
          const fall = die * die * f.H * 5.5
          set(tile, 'transform', `translate(${(1 - enter) * f.W * 0.4}px,${Math.sin(ts * 3 + k) * 5 + fall}px) rotate(${die * (k % 2 ? 90 : -70)}deg)`)
        })
      })
    }
    return { draw: (ts, enter, _x, tAbs) => draw.forEach((d) => d(ts, enter, tAbs)) }
  }

  update(t) {
    let cur = -1
    this.items.forEach((it, i) => { if (t >= it.t) cur = i })
    this.items.forEach((it, i) => show(it.g, i === cur))
    if (cur >= 0) this.items[cur].draw(t - this.items[cur].t, t)
  }
}

const wrap_ = (x) => wrap(x, 1)

// ───────── Hero: the name in 3D ─────────

export class Hero extends Base {
  constructor(f, scene) {
    super(f, scene)
    const s = scene
    const ink = f.col(f.ink(s.ground ?? 'bg'))
    this.kick = el('div', this.el, 'position:absolute;inset:0')
    this.kickEl = word(f, this.kick, f.text(s.kicker ?? ''), f.H * 0.07, ink, `letter-spacing:0.12em;font-weight:${f.font.weight}`)
    const size = Math.min(f.H * 0.46, f.fit(f.text(s.title), f.W * 0.8))
    this.size = size
    const persp = el('div', this.el, 'position:absolute;inset:0;perspective:1500px')
    this.stack = el('div', persp, 'position:absolute;left:50%;top:50%;transform-style:preserve-3d')
    const side = f.hex('accent')
    this.layers = Array.from({ length: 24 }, (_, i) => {
      const c = i === 0 ? ink : mix(side, '#000000', 0.2 + 0.55 * (i / 24))
      const e = word(f, this.stack, f.text(s.title), size, c)
      if (i === 0) Object.assign(e.style, { backgroundImage: `linear-gradient(105deg, ${ink} 0%, ${ink} 42%, #ffffff 50%, ${ink} 58%, ${ink} 100%)`, backgroundSize: '300% 100%', webkitBackgroundClip: 'text', backgroundClip: 'text', webkitTextFillColor: 'transparent', color: 'transparent' })
      return e
    })
    this.ghosts = [1, 2, 3].map(() => word(f, this.el, f.text(s.title), size, 'transparent', `-webkit-text-stroke:${Math.max(2, size * 0.01)}px ${rgba(f.hex('accent'), 0.35)};`))
    this.subText = f.text(s.sub ?? '')
    this.sub = el('div', this.el, `position:absolute;left:50%;top:50%;transform:translate(-50%,0);white-space:pre;font:700 ${Math.round(f.mono(this.subText + ' ', f.H * 0.05))}px/1 ${f.font.mono};color:${ink}`)
    f.hit(this.t0 + f.b(3), { shake: 20, bump: 0.06, flash: 0.45 })
    f.hit(this.t0 + f.b(1), { shake: 6, bump: 0.02, flash: 0 })
    f.pulses(this.t0 + f.b(3), this.t1)
  }

  update(t) {
    const { f, s } = this
    const ts = t - this.t0
    const b = (n) => f.b(n)
    const k = tw(ts, b(0), b(0.7), E.outCubic)
    set(this.kickEl, 'transform', `translate(-50%,-50%) translateY(${-this.size * 0.78 + (1 - k) * -90}px) rotateX(${(1 - k) * 90}deg)`)
    set(this.kickEl, 'display', ts >= b(0) ? 'block' : 'none')
    const fly = tw(ts, b(1), b(3), E.outExpo)
    const flip = tw(ts, b(5.2), b(6.4), E.inOutCubic)
    const orbit = 14 * Math.sin((ts / b(4)) * TAU)
    set(this.stack, 'transform', `translateZ(${lerp(-3200, 0, fly)}px) rotateY(${lerp(-70, 0, fly) + orbit}deg) rotateX(${flip * 360 + 4}deg)`)
    const depth = this.size * 0.03
    this.layers.forEach((l, i) => {
      set(l, 'transform', `translate(-50%,-50%) translateZ(${-i * depth}px)`)
    })
    set(this.layers[0], 'backgroundPosition', `${lerp(150, -50, wrap(ts / b(3), 1))}% 0`)
    set(this.stack, 'display', ts >= b(1) ? 'block' : 'none')
    this.ghosts.forEach((g, i) => {
      const m = tw(ts, b(3), b(5), E.outCubic)
      set(g, 'display', ts >= b(3) ? 'block' : 'none')
      set(g, 'transform', place((i - 1) * this.size * 0.12 * m, (i - 1) * this.size * 0.1 * m, (i - 1) * 6 * m, 1 + 0.04 * (i + 1) * m))
    })
    const typed = Math.floor(clamp((ts - b(5.5)) * 22, 0, this.subText.length))
    const caret = ts >= b(5.5) && (typed < this.subText.length || Math.floor((ts - b(5.5)) * 2.5) % 2 === 0)
    this.sub.textContent = `${this.subText.slice(0, typed)}${caret ? '▍' : ' '}`
    set(this.sub, 'transform', `translate(-50%,0) translateY(${this.size * 0.62}px)`)
  }

  cam(t) {
    const base = super.cam(t)
    const ts = t - this.t0
    const land = this.s.landZoom ?? 1.5
    const p = tw(ts, this.f.b(3), this.f.b(this.s.at[1] - this.s.at[0]), E.inOutCubic)
    return { ...base, s: lerp(0.9, land, p) * (1 + 0.04 * this.u(t)) }
  }
}

// ───────── Counters: giant numbers on slot reels ─────────

export class Counters extends Base {
  constructor(f, scene) {
    super(f, scene)
    const size = f.H * 0.5
    this.size = size
    this.plane = scene.source?.length
      ? el('div', this.el, `position:absolute;left:6%;top:0;width:88%;white-space:pre;font:600 ${Math.round(f.H * 0.034)}px/1.5 ${f.font.mono};color:${rgba(f.hex('paper'), 0.1)}`)
      : null
    if (this.plane) this.plane.textContent = scene.source.concat(scene.source, scene.source).join('\n')
    this.pages = scene.counters.map(([value, label], i) => this.makePage(f.text(value), f.text(label), i))
    this.pages.forEach((p, i) => {
      f.cut(this.t0 + f.b(i * 3))
      f.hit(this.t0 + f.b(i * 3 + 0.9), { shake: 10, bump: 0.03, flash: 0.25 })
      f.pulses(this.t0 + f.b(i * 3 + 1), this.t0 + f.b(Math.min(this.s.at[1] - this.s.at[0], i * 3 + 3)))
    })
  }

  groundAt(t) {
    const i = this.pageAt(t)
    return this.s.grounds?.[i] ?? (i % 2 ? 'accent' : this.s.ground ?? 'bg')
  }

  pageAt(t) {
    return clamp(Math.floor((t - this.t0) / this.f.b(3)), 0, this.pages.length - 1)
  }

  makePage(value, label, i) {
    const f = this.f
    const ground = this.s.grounds?.[i] ?? (i % 2 ? 'accent' : this.s.ground ?? 'bg')
    const ink = f.col(f.ink(ground))
    const g = el('div', this.el, 'position:absolute;inset:0;display:none')
    const row = el('div', g, `position:absolute;left:50%;top:50%;display:flex;align-items:flex-start;font:${f.font.weight} ${this.size}px/1 ${f.font.family};color:${ink};letter-spacing:-0.02em;font-variant-numeric:tabular-nums`)
    const em = this.size
    const chars = [...value]
    const reels = chars.map((ch) => {
      if (!/\d/.test(ch)) {
        const s = el('div', row, `height:${em}px;line-height:${em}px;white-space:pre`)
        s.textContent = ch
        return { ch, node: null }
      }
      const mask = el('div', row, `height:${em}px;width:${0.67 * em}px;overflow:hidden;text-align:center`)
      const col = el('div', mask, 'will-change:auto')
      col.innerHTML = Array.from({ length: 30 }, (_, k) => `<div style="height:${em}px;line-height:${em}px">${k % 10}</div>`).join('')
      return { ch, node: col, d: Number(ch) }
    })
    const rowW = chars.reduce((w, ch) => w + (/\d/.test(ch) ? 0.67 * em : 0.33 * em), 0)
    const maxW = f.W * 0.92
    const k = Math.min(1, maxW / rowW)
    const lab = word(f, g, label, f.mono(label, f.H * 0.075), ink, `font-family:${f.font.mono};font-weight:700;letter-spacing:0.06em;`)
    const ring = el('div', g, `position:absolute;left:50%;top:50%;border:6px solid ${f.col('accent')};border-radius:50%`)
    return {
      g,
      draw: (ts) => {
        reels.forEach((r, n) => {
          if (!r.node) return
          const p = E.outQuint(clamp((ts - 0.05 * n) / 0.75))
          const startOff = 3 + ((r.d * 7 + n * 3) % 10)
          set(r.node, 'transform', `translateY(${-lerp(startOff, 20 + r.d, p) * em}px)`)
        })
        const land = tw(ts, 0.75, 0.9, E.outCubic)
        set(row, 'transform', `translate(${-rowW * k / 2}px,${-em * k * 0.62}px) scale(${k * (1 + 0.04 * (1 - land) + 0.02 * ts)})`)
        set(row, 'transformOrigin', '0 0')
        const labIn = tw(ts, 0.5, 0.75, E.outCubic)
        set(lab, 'transform', place(0, em * k * 0.5 + 30 + (1 - labIn) * 80, 0, 1))
        const rp = tw(ts, 0.78, 1.5, E.outCubic)
        set(ring, 'display', ts > 0.78 && rp < 1 ? 'block' : 'none')
        const d = lerp(em * 0.3, em * 1.7, rp)
        set(ring, 'width', `${d}px`)
        set(ring, 'height', `${d}px`)
        set(ring, 'marginLeft', `${-d / 2}px`)
        set(ring, 'marginTop', `${-d / 2 - em * k * 0.1}px`)
        set(ring, 'borderWidth', `${Math.max(0.5, 8 * (1 - rp))}px`)
      },
    }
  }

  update(t) {
    const i = this.pageAt(t)
    this.pages.forEach((p, j) => show(p.g, j === i))
    this.pages[i].draw(t - this.t0 - this.f.b(i * 3))
    if (this.plane) set(this.plane, 'transform', `translateY(${-90 * (t - this.t0) * 2 - 200}px)`)
  }
}

// ───────── Picture: key art, pushed, panned and cut in on ─────────

export class Picture extends Base {
  constructor(f, scene) {
    super(f, scene)
    this.img = el('img', this.el, 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;transform-origin:50% 50%')
    this.img.src = scene.src
    this.tint = el('div', this.el, `position:absolute;inset:0;background:rgba(0,0,0,${scene.tint ?? 0.25})`)
    this.words = (scene.words ?? []).map(([beat, text, ground]) => {
      const size = Math.min(f.H * 0.34, f.fit(f.text(text), f.W * 0.86))
      return { t: this.t0 + f.b(beat), e: word(f, this.el, f.text(text), size, f.col(ground ?? 'paper'), 'text-shadow:0 6px 40px rgba(0,0,0,.45);'), size }
    })
    this.cutIns = (scene.cutIns ?? []).map(([beat, scale, focus]) => ({ t: this.t0 + f.b(beat), scale, focus }))
    f.hit(this.t0, { shake: 14, bump: 0.05, flash: 0.5 })
    this.words.forEach((w) => { f.cut(w.t); f.hit(w.t, { shake: 8, bump: 0.03, flash: 0.15 }) })
    this.cutIns.forEach((c) => f.cut(c.t))
  }

  decoded() {
    return this.img.decode()
  }

  update(t) {
    const { f, s } = this
    const u = this.u(t)
    const focus = s.focus ?? [0.5, 0.5]
    let scale = 1.08 + 0.2 * u
    let [fx, fy] = focus
    const cut = [...this.cutIns].reverse().find((c) => t >= c.t)
    if (cut) {
      const next = this.cutIns.find((c) => c.t > cut.t)
      if (t < (next ? next.t : cut.t + f.b(2))) { scale = cut.scale; [fx, fy] = cut.focus }
    }
    // each word punches the picture in a little further
    let punch = 0
    for (const w of this.words) if (t >= w.t) punch = Math.max(punch, 0.08 * Math.exp(-(t - w.t) * 9))
    const tx = (0.5 - fx) * f.W * (scale - 1) * 1.2 + Math.sin(u * 3) * 14
    const ty = (0.5 - fy) * f.H * (scale - 1) * 1.2
    set(this.img, 'transform', `translate(${tx}px,${ty}px) scale(${scale + punch}) rotate(${this.dir * (u - 0.5) * 2}deg)`)
    this.words.forEach((w, i) => {
      const on = t >= w.t && (i === this.words.length - 1 || t < this.words[i + 1].t)
      show(w.e, on)
      if (on) set(w.e, 'transform', place(this.s.x ?? 0, this.s.y ?? 0, -2 * this.dir, lerp(1.6, 1, tw(t - w.t, 0, 0.14, E.outExpo)) * (1 + 0.04 * (t - w.t))))
    })
  }
}

// ───────── Logo: the only place the film rests ─────────

export class Logo extends Base {
  constructor(f, scene) {
    super(f, scene)
    const ink = f.col(f.ink(scene.ground ?? 'bg'))
    this.ink = ink
    this.line = el('div', this.el, `position:absolute;left:0;top:50%;height:6px;width:100%;margin-top:-3px;background:${f.col('accent')};transform-origin:0 50%`)
    this.mark = el('div', this.el, 'position:absolute;left:50%;top:50%')
    this.markSize = f.H * 0.3
    if (f.logoSvg) {
      this.mark.innerHTML = f.logoSvg
      const svg = this.mark.querySelector('svg')
      if (svg) Object.assign(svg.style, { width: `${this.markSize}px`, height: `${this.markSize}px`, display: 'block' })
      this.markIsSvg = true
    }
    const wmSize = Math.min(f.H * 0.2, f.fit(scene.wordmark ?? f.spec.title ?? '', f.W * 0.7))
    this.wmWrap = el('div', this.el, `position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden`)
    this.wm = word(f, this.wmWrap, scene.wordmark ?? f.spec.title ?? '', wmSize, ink)
    this.wmSize = wmSize
    const tagline = f.text(scene.tagline ?? '')
    const small = f.text(scene.small ?? '')
    this.tag = word(f, this.el, tagline, f.mono(tagline, f.H * 0.05), ink, `font-family:${f.font.mono};font-weight:700;`)
    this.small = word(f, this.el, small, f.mono(small, f.H * 0.028, 0.8), ink, `font-family:${f.font.mono};font-weight:700;letter-spacing:0.2em;opacity:.7;`)
    this.dots = Array.from({ length: 22 }, (_, i) => el('div', this.el, `position:absolute;left:0;top:0;width:${4 + Math.floor(hash(i) * 6)}px;height:${4 + Math.floor(hash(i) * 6)}px;border-radius:50%;background:${f.col('accent')}`))
    this.sweep = el('div', this.el, `position:absolute;top:-10%;height:120%;width:16%;background:linear-gradient(100deg,transparent,${rgba(f.hex('paper'), 0.22)},transparent);transform:skewX(-14deg)`)
    f.hit(this.t0 + f.b(1), { shake: 20, bump: 0.06, flash: 0.7 })
  }

  update(t) {
    const { f } = this
    const ts = t - this.t0
    const b = (n) => f.b(n)
    const line = tw(ts, 0, 0.14, E.outExpo)
    set(this.line, 'transform', `scaleX(${line})`)
    set(this.line, 'display', ts < b(1) + 0.1 ? 'block' : 'none')
    const markIn = tw(ts, b(1), b(1) + 0.5, (u) => E.outBack(u, 2.2))
    const hasMark = this.markIsSvg
    set(this.mark, 'display', hasMark && ts >= b(1) ? 'block' : 'none')
    set(this.mark, 'transform', `translate(-50%,-50%) translateY(${-f.H * 0.12}px) scale(${markIn})`)
    const wmIn = tw(ts, b(1.5), b(1.5) + 0.35, E.outCubic)
    set(this.wm, 'display', ts >= b(1.5) ? 'block' : 'none')
    set(this.wm, 'transform', place(0, hasMark ? f.H * 0.12 : 0, 0, 1, 1))
    set(this.wmWrap, 'clipPath', `inset(0 ${(1 - wmIn) * 100}% 0 0)`)
    const tagIn = tw(ts, b(3), b(3) + 0.3, E.outCubic)
    set(this.tag, 'display', ts >= b(3) ? 'block' : 'none')
    set(this.tag, 'transform', place(0, f.H * (hasMark ? 0.3 : 0.2) + (1 - tagIn) * 50))
    set(this.small, 'display', ts >= b(4.5) ? 'block' : 'none')
    set(this.small, 'transform', place(0, f.H * (hasMark ? 0.4 : 0.3), 0, 1))
    // particles drift upward on their own, forever: the end card pushes in and never freezes
    this.dots.forEach((d, i) => {
      const x = hash(i + 5) * f.W
      const y = f.H - wrap(ts * (40 + 90 * hash(i + 11)) + hash(i + 17) * f.H, f.H * 1.1)
      set(d, 'transform', `translate(${x}px,${y}px)`)
      set(d, 'display', ts >= b(1) ? 'block' : 'none')
    })
    const sweepP = wrap((ts - b(4)) / b(6), 1)
    set(this.sweep, 'left', `${lerp(-20, 110, sweepP)}%`)
    set(this.sweep, 'display', ts >= b(4) ? 'block' : 'none')
  }

  cam(t) {
    const ts = t - this.t0
    return { cx: this.f.W / 2, cy: this.f.H / 2, s: 1 + 0.015 * ts, r: 0 }
  }
}

export const BLOCK_CLASSES = { Words, Strike, Hero, Counters, Picture, Logo }
