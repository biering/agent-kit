// The UI parts of a product-ui film: the engine finds them in the film's own HTML by `data-ui` and
// makes them behave. Each part is built in two phases: `prepare` builds its DOM and returns a
// thunk; once every part has prepared, the engine measures the page and the thunks run, each
// returning draw(t). A draw sets styles from t alone and keeps nothing between frames.
//
//   data-ui="screen"     the product window: the camera never shows past it
//   data-ui="field"      a text input; data-ph is its placeholder; .val and .caret are built here
//   data-ui="button"     dips on a press; data-needs="#field" keeps it off until that text is typed
//   data-ui="toggle"     a track with a .knob; the knob's edges stretch on the way, a .fill follows
//   data-ui="tabs"       [data-tab] children and an .ind indicator built here; data-ui="panels" with
//                        [data-panel] children is the page they switch
//   data-ui="checklist"  rows with a .dot and a .lbl; a run step rises them and checks them in turn
//   data-ui="result"     a card that grows out of what was pressed; its .rise and .pop children arrive
//   data-ui="scroll"     a clipped area whose content a scroll step moves
//
// The look is the film's CSS: the parts set geometry and `data-state` (off, on, focus, hidden,
// pending, active, done, pressed), never colours.
import { TIMING, defaults } from './spec.js'
import { attr, clamp, el, mixRgb, parseRgb, set, show, text, tr } from './core.js'

const MASK = 'display:block;overflow:hidden;padding:0 .04em .16em;margin:0 -.04em -.16em'
const lerp = (a, b, u) => a + (b - a) * u

/** Wrap each `.rise` under root in a mask and index each `.pop`: returns draw(t, t0) with t0 = -Infinity at rest. */
function arrivals(f, root) {
  // a result card inside a panel owns its own arrivals
  const own = root.dataset.ui === 'result' ? root : null
  const mine = (sel) => [...root.querySelectorAll(sel)].filter((n) => n.closest('[data-ui="result"]') === own)
  const rises = mine('.rise').map((n) => {
    const m = el('div', null, MASK)
    n.before(m)
    m.append(n)
    return n
  })
  const pops = mine('.pop')
  const { ease, prog, spring, springs } = f.k
  return (t, t0) => {
    rises.forEach((n, i) => {
      const p = t0 === -Infinity ? 1 : ease.out(prog(t, t0 + i * 0.09, t0 + i * 0.09 + 0.5))
      set(n, 'transform', p >= 1 ? 'none' : `translateY(${((1 - p) * 118).toFixed(2)}%)`)
    })
    pops.forEach((n, i) => {
      const s = t0 === -Infinity ? 1 : Math.max(0, spring(t, t0 + 0.2 + i * 0.09, springs.snappy))
      show(n, s > 0)
      set(n, 'transform', tr(0, 0, s))
    })
  }
}

function field(f, node) {
  const id = `#${node.id}`
  const ph = el('span', null, 'position:absolute;top:50%;transform:translateY(-50%);pointer-events:none', 'ph')
  ph.textContent = node.dataset.ph ?? ''
  node.textContent = ''
  const val = el('span', node, 'white-space:pre', 'val')
  el('i', node, '', 'caret')
  node.append(ph)
  if (getComputedStyle(node).position === 'static') node.style.position = 'relative'
  ph.style.left = getComputedStyle(node).paddingLeft
  const caret = node.querySelector('.caret')
  return () => {
    const types = f.steps.filter((s) => s.do === 'type' && s.into === id)
    const cs = getComputedStyle(node)
    const room = node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - caret.offsetWidth
    for (const s of types) {
      val.textContent = s.text
      if (val.offsetWidth > room) throw new Error(`spec: type into ${id}: "${s.text}" is ${Math.round(val.offsetWidth)} px wide and the field holds ${Math.round(room)} px on one line; shorten it or widen the field`)
    }
    val.textContent = ''
    // the focus ring grows on a press here and shrinks on a press elsewhere
    const ring = f.presses.map((p) => [p.t, p.id === id ? 5 : 0])
    return (t) => {
      const cur = [...types].reverse().find((s) => t >= s.t0)
      const k = cur ? f.k.typed(cur.text, t, cur.t0, cur.cps ?? defaults.cps) : { text: '', caret: false }
      const last = f.lastPress(t)
      const focused = last?.id === id
      text(val, k.text)
      show(ph, !k.text)
      show(caret, focused && (cur ? k.caret : Math.floor((t - last.t) * 2.5) % 2 === 0))
      attr(node, 'data-state', focused ? 'focus' : 'idle')
      const r = f.k.springTo(t, 0, ring, f.k.springs.snappy)
      set(node, 'boxShadow', r > 0.05 ? `0 0 0 ${r.toFixed(2)}px var(--ring, rgba(47,107,255,.25))` : 'none')
    }
  }
}

function button(f, node) {
  const id = `#${node.id}`
  const gate = node.dataset.needs
  return () => {
    const mine = f.presses.filter((p) => p.id === id)
    const gates = gate ? f.steps.filter((s) => s.do === 'type' && s.into === gate) : []
    if (gate && !gates.length) throw new Error(`spec: ${id} needs ${gate} (data-needs) but no step types into it`)
    return (t) => {
      // a press pushes the button down about 5 px; waking up lifts it about 3 px
      const dip = mine.reduce((v, p) => v + f.k.bump(t, p.t, { freq: 3, damp: 0.5 }), 0)
      const lift = gates.reduce((v, g) => v + f.k.bump(t, g.t1, { freq: 3, damp: 0.5 }), 0)
      set(node, 'transform', tr(0, dip * 16 - lift * 10))
      const pressed = mine.some((p) => t >= p.t && t < p.t + 0.14)
      attr(node, 'data-state', pressed ? 'pressed' : !gate || gates.some((g) => t >= g.t1) ? 'on' : 'off')
    }
  }
}

function toggle(f, node) {
  const id = `#${node.id}`
  const knob = node.querySelector('.knob')
  const fill = el('i', null, 'position:absolute;left:0;top:0;bottom:0;border-radius:inherit', 'fill')
  node.prepend(fill)
  if (getComputedStyle(node).position === 'static') node.style.position = 'relative'
  knob.style.position = 'absolute'
  knob.style.zIndex = '1'
  return () => {
    const pad = knob.offsetLeft
    const kw = knob.offsetWidth
    const off = [pad, pad + kw]
    const on = [node.clientWidth - pad - kw, node.clientWidth - pad]
    const flips = f.steps.filter((s) => s.do === 'toggle' && s.target === id)
    const stops = [[0, ...off]]
    flips.forEach((s, i) => stops.push([s.t0, ...(i % 2 === 0 ? on : off)]))
    return (t) => {
      const e = f.k.edges(t, stops)
      const u = clamp((e.right - off[1]) / (on[1] - off[1]))
      set(knob, 'left', `${e.left.toFixed(2)}px`)
      set(knob, 'width', `${(e.right - e.left).toFixed(2)}px`)
      set(fill, 'width', u > 0.001 ? `${(e.right + pad * u).toFixed(2)}px` : '0px')
      attr(node, 'data-state', flips.filter((s) => t >= s.t0).length % 2 ? 'on' : 'off')
    }
  }
}

function tabs(f, node) {
  const list = [...node.querySelectorAll('[data-tab]')]
  const ind = el('i', null, 'position:absolute;z-index:0', 'ind')
  node.prepend(ind)
  if (getComputedStyle(node).position === 'static') node.style.position = 'relative'
  list.forEach((n) => { if (getComputedStyle(n).position === 'static') n.style.position = 'relative'; n.style.zIndex = '1' })
  const box = f.q('[data-ui="panels"]')[0]
  const panels = box ? [...box.querySelectorAll(':scope > [data-panel]')] : []
  if (box) { box.style.overflow = 'hidden'; if (getComputedStyle(box).position === 'static') box.style.position = 'relative' }
  const rise = panels.map((p) => arrivals(f, p))
  return () => {
    const names = list.map((n) => n.dataset.tab)
    const first = node.dataset.initial ?? names[0]
    const events = f.steps.filter((s) => s.do === 'switch')
    for (const s of events) if (!names.includes(s.tab)) throw new Error(`spec: switch to tab "${s.tab}": the tabs are ${names.join(', ')}`)
    const at = (name) => list[names.indexOf(name)]
    const edge = (name) => [at(name).offsetLeft, at(name).offsetLeft + at(name).offsetWidth]
    const first0 = at(first)
    Object.assign(ind.style, { top: `${first0.offsetTop}px`, height: `${first0.offsetHeight}px` })
    const stops = [[0, ...edge(first)], ...events.map((s) => [s.t0, ...edge(s.tab)])]
    const h = box ? box.clientHeight : 0
    const { ease, prog, spring } = f.k
    const taps = list.map((n) => f.presses.filter((p) => p.id === `#${n.id}`))
    return (t) => {
      const e = f.k.edges(t, stops)
      set(ind, 'left', `${e.left.toFixed(2)}px`)
      set(ind, 'width', `${(e.right - e.left).toFixed(2)}px`)
      const now = events.filter((s) => t >= s.t0)
      const last = now.at(-1)
      const cur = last ? last.tab : first
      const prev = now.length > 1 ? now.at(-2).tab : first
      const since = last ? t - last.t0 : Infinity
      // the label flips as the indicator's leading edge arrives under it
      const lit = since > 0.12 ? cur : last ? prev : first
      list.forEach((n, i) => {
        attr(n, 'data-state', n.dataset.tab === lit ? 'on' : 'off')
        set(n, 'transform', tr(0, taps[i].reduce((v, p) => v + f.k.bump(t, p.t, { freq: 3, damp: 0.5 }), 0) * 16))
      })
      panels.forEach((p, i) => {
        const name = p.dataset.panel
        let y = null
        if (name === cur) y = last ? h * (1 - spring(t, last.t0 + 0.2, { freq: 1.9, damp: 0.9 })) : 0
        else if (name === prev && last && since < 0.45) y = -h * ease.in(prog(t, last.t0, last.t0 + 0.4))
        show(p, y !== null)
        if (y !== null) set(p, 'transform', tr(0, y))
        rise[i](t, name === cur && last ? last.t0 + 0.3 : -Infinity)
      })
    }
  }
}

function checklist(f, node) {
  const id = `#${node.id}`
  const rows = [...node.children]
  const parts = rows.map((row) => {
    const dot = row.querySelector('.dot')
    const lbl = row.querySelector('.lbl')
    dot.innerHTML = '<i class="spin" style="position:absolute;inset:0;border-radius:50%"></i><i class="fill" style="position:absolute;inset:0;border-radius:50%"></i>'
      + '<svg viewBox="0 0 24 24" style="position:absolute;inset:18%;width:64%;height:64%;fill:none;stroke:var(--on-accent,#fff);stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round"><path pathLength="1" d="M5.5 12.8l4.2 4.2 8.8-9.6"/></svg>'
    dot.style.position = 'relative'
    const mask = el('span', null, `${MASK};display:inline-block;vertical-align:bottom`)
    lbl.before(mask)
    mask.append(lbl)
    lbl.style.display = 'inline-block'
    return { row, dot, lbl, spin: dot.querySelector('.spin'), fill: dot.querySelector('.fill'), tick: dot.querySelector('path') }
  })
  return () => {
    const run = f.steps.find((s) => s.do === 'run' && s.target === id)
    if (run && run.rows !== rows.length) throw new Error(`spec: run on ${id} says ${run.rows} rows but the checklist has ${rows.length}`)
    const lead = f.b(TIMING.runLead)
    const every = f.b(run?.every ?? defaults.every)
    const { ease, prog, spring, springs, bump, draw } = f.k
    return (t) => {
      const t0 = run ? run.t0 : Infinity
      const done = rows.filter((_, i) => t >= t0 + lead + i * every).length
      parts.forEach((p, i) => {
        const appear = t0 + i * 0.12
        const finish = t0 + lead + i * every
        const state = t < appear ? 'hidden' : t >= finish ? 'done' : i === done ? 'active' : 'pending'
        attr(p.row, 'data-state', state)
        const grow = Math.max(0, spring(t, appear, springs.snappy))
        set(p.dot, 'transform', tr(0, 0, state === 'hidden' ? 0 : grow * (1 + 0.28 * bump(t, finish))))
        show(p.spin, state === 'active')
        set(p.spin, 'transform', `rotate(${((t * 460) % 360).toFixed(1)}deg)`)
        const s = Math.max(0, spring(t, finish, springs.snappy))
        set(p.fill, 'transform', `scale(${s.toFixed(4)})`)
        draw(p.tick, ease.out(prog(t, finish + 0.05, finish + 0.3)))
        const rise = ease.out(prog(t, appear, appear + 0.5))
        set(p.lbl, 'transform', rise >= 1 ? 'none' : `translateY(${((1 - rise) * 125).toFixed(2)}%)`)
      })
    }
  }
}

function result(f, node) {
  const id = `#${node.id}`
  const arrive = arrivals(f, node)
  node.style.overflow = 'hidden'
  return () => {
    const step = f.steps.find((s) => s.do === 'result' && s.target === id)
    if (!step) throw new Error(`spec: ${id} is a data-ui="result" card but no result step names it`)
    const R = f.rect(node)
    const cs = getComputedStyle(node)
    const rR = parseFloat(cs.borderTopLeftRadius) || 0
    const bgR = parseRgb(cs.backgroundColor)
    const from = step.from ?? f.presses.filter((p) => p.t <= step.t0).at(-1)?.id
    const src = from && document.getElementById(from.slice(1))
    if (!src) throw new Error(`spec: result ${id} has nothing to grow from; name one with from: '#id'`)
    const S = f.rectAt(from, step.t0)
    const scs = getComputedStyle(src)
    const rS = parseFloat(scs.borderTopLeftRadius) || 0
    const bgS = parseRgb(scs.backgroundColor)
    // out of the flow, a placeholder keeps its place; its transform is measured against the origin it gets
    const hold = el('div', null, `width:${R.w}px;height:${R.h}px;margin:${cs.margin};flex:none`)
    node.before(hold)
    // the card pulls out from behind what it grows from, which keeps its own look on top
    Object.assign(node.style, { position: 'absolute', left: '0', top: '0', margin: '0', zIndex: '0', boxSizing: 'border-box' })
    if (scs.position === 'static') src.style.position = 'relative'
    src.style.zIndex = '1'
    const O = f.rect(node)
    const grow = { freq: 2, damp: 0.78 }
    return (t) => {
      show(node, t >= step.t0)
      const raw = f.k.spring(t, step.t0, grow)
      const p = Math.abs(raw - 1) < 1e-4 ? 1 : raw
      const x = lerp(S.x, R.x, p)
      const y = lerp(S.y, R.y, p)
      Object.assign(node.style, {
        width: `${Math.max(0, lerp(S.w, R.w, p)).toFixed(2)}px`,
        height: `${Math.max(0, lerp(S.h, R.h, p)).toFixed(2)}px`,
        transform: tr(x - O.x, y - O.y),
        borderRadius: `${lerp(rS, rR, clamp(p)).toFixed(2)}px`,
        backgroundColor: mixRgb(bgS, bgR, clamp(p)),
      })
      arrive(t, step.t0 + 0.35)
    }
  }
}

function scroller(f, node) {
  const inner = el('div')
  while (node.firstChild) inner.append(node.firstChild)
  node.append(inner)
  node.style.overflow = 'hidden'
  return () => {
    const max = Math.max(0, inner.offsetHeight - node.clientHeight)
    const mine = f.steps.filter((s) => s.do === 'scroll' && (s.in ?? `#${f.q('[data-ui="scroll"]')[0].id}`) === `#${node.id}`)
    let pos = 0
    const stops = mine.map((s) => [s.t0, (pos = clamp(pos + s.by, 0, max))])
    const offset = (t) => f.k.springTo(t, 0, stops, { freq: 2.2, damp: 0.9 })
    f.scrollers.push({ node, offset })
    return (t) => set(inner, 'transform', tr(0, -offset(t)))
  }
}

/** Prepare every part the page declares; measure; return the draw functions. */
export function buildParts(f) {
  const make = { field, button, toggle, tabs, checklist, result, scroll: scroller }
  const thunks = []
  for (const node of f.q('[data-ui]')) {
    const kind = node.dataset.ui
    if (kind === 'screen' || kind === 'panels') continue
    if (!make[kind]) throw new Error(`spec: data-ui="${kind}" on #${node.id}: the parts are screen, panels, ${Object.keys(make).join(', ')}`)
    if (!node.id) throw new Error(`data-ui="${kind}" needs an id (it is a target the steps name)`)
    thunks.push(make[kind](f, node))
  }
  f.measure()
  return thunks.map((t) => t())
}
