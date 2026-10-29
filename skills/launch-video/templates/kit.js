// The motion kit: every value is a pure function of t. Load it with
//   <script src="/.agents/skills/launch-video/templates/kit.js"></script>
// and take what the film needs: const { ease, spring, camera, ... } = kit(1920, 1080)
function kit(W, H) {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
  const lerp = (a, b, p) => a + (b - a) * p
  const prog = (t, a, b) => clamp((t - a) / (b - a))
  function bezier(x1, y1, x2, y2) {
    return (x) => {
      if (x <= 0) return 0
      if (x >= 1) return 1
      let lo = 0, hi = 1, u = x
      for (let i = 0; i < 32; i++) {
        u = (lo + hi) / 2
        const bx = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u
        if (bx < x) lo = u; else hi = u
      }
      return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u
    }
  }
  const ease = { inOut: bezier(0.65, 0, 0.35, 1), out: bezier(0.16, 1, 0.3, 1), in: bezier(0.55, 0, 1, 0.45) }
  // Closed-form damped spring step response: 0 before t0, settles on 1.
  function spring(t, t0, { freq = 1.8, damp = 0.72 } = {}) {
    const x = t - t0
    if (x <= 0) return 0
    const w = 2 * Math.PI * freq
    if (damp >= 1) return 1 - Math.exp(-w * x) * (1 + w * x)
    const wd = w * Math.sqrt(1 - damp * damp)
    return 1 - Math.exp(-damp * w * x) * (Math.cos(wd * x) + (damp * w / wd) * Math.sin(wd * x))
  }
  // Named feels, passed as the options of spring/springTo/pop: spring(t, t0, springs.heavy).
  // Overshoot at landing: snappy ~1%, default ~4%, heavy none, playful ~25%.
  const springs = {
    snappy: { freq: 2.8, damp: 0.85 },  // UI: buttons, toggles, the leading edge of a tab indicator
    default: { freq: 1.8, damp: 0.72 }, // cards, containers, the camera
    heavy: { freq: 1.2, damp: 1 },      // big type, the logo lockup: mass, no bounce
    playful: { freq: 2.2, damp: 0.4 },  // a mascot, stickers: overshoot you can see
  }
  // A value that changes target several times: one spring per change, summed.
  const springTo = (t, v0, steps, o) => steps.reduce((v, [at, to], i) => v + (to - (i ? steps[i - 1][1] : v0)) * spring(t, at, o), v0)
  // Keyframes [[t, value(s), easing?], ...]; the easing on a key shapes the segment that ends there.
  function keys(t, kf, e = ease.inOut) {
    if (t <= kf[0][0]) return kf[0][1]
    for (let i = 1; i < kf.length; i++) {
      if (t <= kf[i][0]) {
        const [t0, a] = kf[i - 1], [t1, b, ef] = kf[i]
        const p = (ef || e)(prog(t, t0, t1))
        return Array.isArray(a) ? a.map((v, j) => lerp(v, b[j], p)) : lerp(a, b, p)
      }
    }
    return kf[kf.length - 1][1]
  }
  // Camera keyframes [t, zoom, x, y, easing?]: zoom in log space; (x, y) is the world point at frame centre.
  function camera(t, kf) {
    const [lz, x, y] = keys(t, kf.map(([tt, z, x, y, e]) => [tt, [Math.log(z), x, y], e]))
    return { z: Math.exp(lz), x, y }
  }
  const camCss = (c) => `translate(${W / 2}px,${H / 2}px) scale(${c.z}) translate(${-c.x}px,${-c.y}px)`
  // Where a world point sits on screen under a camera: what a screen-space layer needs to meet a
  // world element exactly (a cursor on a button, a full stop landing on a chart).
  const project = (c, p) => ({ x: W / 2 + (p.x - c.x) * c.z, y: H / 2 + (p.y - c.y) * c.z })
  const $ = (id) => document.getElementById(id)
  // `inherit`, not `visible`: a visible child shows through a hidden parent.
  const show = (el, on) => { el.style.visibility = on ? 'inherit' : 'hidden' }
  // Build masked words; '\n' breaks lines.
  function words(el, text) {
    el.innerHTML = text.split('\n').map((l) => l.split(' ').map((w) => `<span class="mask"><span class="w">${w}</span></span>`).join(' ')).join('<br>')
    return [...el.querySelectorAll('.w')]
  }
  // Words rise in on a stagger and leave upward on a shorter one.
  function riseWords(ws, t, tIn, tOut = Infinity, stagger = 0.08, dur = 0.55) {
    ws.forEach((w, i) => {
      const pin = ease.out(prog(t, tIn + i * stagger, tIn + i * stagger + dur))
      // no exit time, no exit term: prog() of Infinity is NaN
      const pout = tOut === Infinity ? 0 : ease.in(prog(t, tOut + i * stagger * 0.6, tOut + i * stagger * 0.6 + dur * 0.75))
      w.style.transform = `translateY(${(1 - pin) * 125 - pout * 125}%)`
    })
  }
  // An element pops from nothing on a spring. `mul` carries a later press or pulse.
  const pop = (el, t, t0, o, mul = 1) => { el.style.transform = `scale(${Math.max(0, spring(t, t0, o)) * mul})` }

  // ───────── the moves (references/moves.md says when to reach for each) ─────────
  // A wobble that starts and ends at rest: a press, a total that just landed, a node taking a pulse.
  // It is the overshoot of a loose spring without its step, so it peaks near 0.2: multiply it by a few
  // pixels or a few percent. Looser than the 0.6 to 0.8 a landing gets, because nothing travels.
  const bump = (t, t0, { freq = 2.2, damp = 0.45 } = {}) => spring(t, t0, { freq, damp }) - spring(t, t0, { freq, damp: 1 })
  // A number on its way from a to b. Set it as text in tabular figures: the motion blur smears the
  // digits, which is the whole effect. `step` is the smallest unit shown (0.01 for cents); a and b
  // are multiples of it.
  function count(t, t0, dur, a, b, step = 1) {
    const v = Math.round(lerp(a, b, ease.out(prog(t, t0, t0 + dur))) / step) * step
    return Number(v.toFixed(Math.max(0, -Math.floor(Math.log10(step))))) // 57 * 0.01 is 0.5700000000000001
  }
  // Text being typed: what stands at t, and whether the caret shows (solid while typing, then it blinks).
  function typed(text, t, t0, cps = 16) {
    const n = Math.floor(clamp((t - t0) * cps, 0, text.length))
    return { text: text.slice(0, n), caret: t >= t0 && (n < text.length || Math.floor(Math.max(0, t - t0 - text.length / cps) * 2.5) % 2 === 0) }
  }
  // An SVG stroke drawn from its start, 0 to 1. The element needs pathLength="1". Hidden until it
  // starts: a round line cap paints a dot at the start of a stroke of no length. Once it is drawn the
  // dash comes off: a dash ends in two caps, so a closed path kept a hairline gap where its end met
  // its start (the roof of a house-shaped mark), which only the undashed path joins.
  const draw = (el, p) => { show(el, p > 0); Object.assign(el.style, { strokeDasharray: p >= 1 ? 'none' : 1, strokeDashoffset: 1 - clamp(p) }) }
  // The point p of the way along an SVG path: what a pulse rides from one node to the next.
  const along = (path, p) => { const q = path.getPointAtLength(path.getTotalLength() * clamp(p)); return { x: q.x, y: q.y } }
  // A pointer between stops [[t, x, y], ...]: it leaves each stop late, arrives eased and travels on a
  // shallow arc, the way a hand moves. Rest at a stop by naming it twice.
  function route(t, stops, bow = 0.1) {
    if (t <= stops[0][0]) return { x: stops[0][1], y: stops[0][2] }
    for (let i = 1; i < stops.length; i++) {
      if (t > stops[i][0]) continue
      const [t0, x0, y0] = stops[i - 1], [t1, x1, y1] = stops[i]
      const p = ease.inOut(prog(t, t0, t1)), lift = 4 * p * (1 - p) * bow
      return { x: lerp(x0, x1, p) + (y1 - y0) * lift, y: lerp(y0, y1, p) - (x1 - x0) * lift }
    }
    const last = stops[stops.length - 1]
    return { x: last[1], y: last[2] }
  }
  // A click: a ring that grows and thins around p for `dur` seconds. Border only, so nothing fades.
  // The element is an absolutely placed, border-box circle with a solid border.
  function ring(el, t, at, p, { from = 24, to = 96, width = 10, dur = 0.5 } = {}) {
    const on = t >= at && t < at + dur
    show(el, on)
    if (!on) return
    const k = 1 - (1 - prog(t, at, at + dur)) ** 3, r = lerp(from, to, k)
    Object.assign(el.style, { left: `${p.x - r}px`, top: `${p.y - r}px`, width: `${r * 2}px`, height: `${r * 2}px`, borderWidth: `${lerp(width, 0.5, k)}px` })
  }
  // A slanted band that crosses the frame left to right. From `covered` it hides every pixel for a
  // tenth of its length: swap the scene underneath at exactly that time. With `hold` the band stays
  // and becomes the next ground (a word card). The element is a frame-sized layer in screen space.
  function wipe(el, t, t0, { dur = 0.6, slant = 0.2, hold = false } = {}) {
    const on = t >= t0 && (hold || t < t0 + dur)
    show(el, on)
    const lead = hold ? dur : dur * 0.45
    if (on) {
      // two pixels past each side, so a rounding error never leaves a corner open
      const s = W * slant, from = -s - 2, to = W + 2
      const x1 = lerp(from, to, ease.inOut(prog(t, t0, t0 + lead)))
      const x0 = hold ? from : lerp(from, to, ease.inOut(prog(t, t0 + dur * 0.55, t0 + dur)))
      el.style.clipPath = `polygon(${x0 + s}px 0, ${x1 + s}px 0, ${x1}px ${H}px, ${x0}px ${H}px)`
    }
    return { covered: t0 + lead }
  }
  // A tab indicator or a toggle knob going from stop to stop [[t, left, right], ...]: the edge that
  // leads the move rides a faster spring than the one that follows, so the shape stretches on the way.
  function edges(t, steps, fast = { freq: 3.4, damp: 0.82 }, slow = { freq: 2, damp: 0.82 }) {
    let [, left, right] = steps[0]
    for (let i = 1; i < steps.length; i++) {
      const [at, l, r] = steps[i], [, pl, pr] = steps[i - 1]
      const toRight = l + r > pl + pr
      left += (l - pl) * spring(t, at, toRight ? slow : fast)
      right += (r - pr) * spring(t, at, toRight ? fast : slow)
    }
    return { left, right }
  }

  // Write every time as a beat, so the film stays on the grid and a tempo change is one constant.
  const score = (bpm) => ({ BPM: bpm, BEAT: 60 / bpm, b: (n) => (n * 60) / bpm })

  // The viewer for a film opened in a person's browser (render.mjs --serve): a scrub bar, space to
  // play against the clock, arrows to step a beat (shift: a frame). Under the renderer it draws
  // ?t and stays out of the way. It only ever calls seek(t), so it cannot make a film impure.
  function hud(film) {
    const t0 = Number(new URLSearchParams(location.search).get('t') || 0)
    film.ready.then(() => film.seek(t0))
    if (navigator.webdriver) return
    const fit = () => { document.body.style.zoom = Math.min(innerWidth / W, (innerHeight - 44) / H) }
    const bar = document.createElement('div')
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:44px;display:flex;gap:12px;align-items:center;padding:0 14px;background:#111;color:#fff;font:13px ui-monospace,Menlo,monospace;z-index:99999'
    bar.innerHTML = '<input type="range" min="0" step="0.001" style="flex:1"><span></span>'
    document.documentElement.append(bar)
    document.documentElement.style.cssText = 'overflow:hidden;background:#111'
    const range = bar.firstChild, label = bar.lastChild
    range.max = film.duration
    let t = t0, playing = null
    const go = (to) => {
      t = clamp(to, 0, film.duration)
      range.value = t
      label.textContent = `${t.toFixed(2)} s${film.beat ? ` · beat ${(t / film.beat).toFixed(2)}` : ''}`
      film.seek(t)
    }
    range.oninput = () => go(Number(range.value))
    addEventListener('resize', fit)
    addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 1 / (film.fps || 60) : film.beat || 0.5
      if (e.key === 'ArrowRight') go(t + step)
      if (e.key === 'ArrowLeft') go(t - step)
      if (e.key === ' ') {
        e.preventDefault()
        if (playing) { cancelAnimationFrame(playing); playing = null; return }
        const start = performance.now() - (t >= film.duration ? 0 : t) * 1000
        const tick = () => { go((performance.now() - start) / 1000); playing = t < film.duration ? requestAnimationFrame(tick) : null }
        tick()
      }
    })
    fit()
    film.ready.then(() => go(t0))
  }

  return { W, H, clamp, lerp, prog, bezier, ease, spring, springs, springTo, keys, camera, camCss, project, $, show, words, riseWords, pop, bump, count, typed, draw, along, route, ring, wipe, edges, score, hud }
}
