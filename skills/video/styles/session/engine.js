// The session engine: a take (a chat session, drawn by session.html or recorded by a person, and
// ingested as frames) is the footage, and everything around it is drawn here: the hook whose full
// stop grows into the window, the take on the beat, the camera on its regions, the marks, the
// caption pill, the "sped up" label and the end card. seek(t) sets every style from t alone. The
// arithmetic (which frame, where a region sits, where the camera goes) is core.js.
//
//   <script src="/.agents/skills/video/templates/kit.js"></script>
//   <script type="module">
//     import { build } from '/.agents/skills/video/styles/session/engine.js'
//     import spec from './spec.js'
//     window.film = await build(spec)
//   </script>
//
// film.html?format=reel is 9:16, ?lang=<code> picks spec.copy[code] (the first by default), and
// ?take=<name> another take: take.<name>.json beside the film, the language by default, and a reel
// reads <name>-reel. The colours and faces are the film's CSS variables, with neutral fallbacks.
import { fastStretches, frameAt, frameRect, inWindow, takeTime } from './core.js'
import { TIMING, agentSlots, cueSheet, defaults, validateSpec } from './spec.js'

// Screen pixels per format. `safe` is where the camera frames a region: above the caption pill, and
// in the upright frame between y 230 and 1420, clear of the platform's interface.
const LAYOUT = {
  reel: {
    size: [1080, 1920],
    hook: { size: 128, mid: 880, step: 146 },
    win: { w: 960, radius: 30 },
    safe: { x: 40, y: 230, w: 1000, h: 1190 },
    pill: { top: 1470, h: 88, type: 34 },
    sped: { right: 44, top: 248, h: 54, type: 23 },
    end: { markY: 640, mark: 170, headSize: 100, headTop: 800, noteSize: 28, noteTop: 1290 },
  },
  wide: {
    size: [1920, 1080],
    hook: { size: 124, mid: 520, step: 140 },
    win: { w: 1320, radius: 28 },
    safe: { x: 60, y: 44, w: 1800, h: 868 },
    pill: { top: 948, h: 76, type: 31 },
    sped: { right: 56, top: 52, h: 48, type: 21 },
    end: { markY: 372, mark: 150, headSize: 84, headTop: 500, noteSize: 24, noteTop: 742 },
  },
}

// Injected before the film's own styles, so a film restyles any of it. Every colour and face is a
// variable the film defines: --ground, --window, --ink, --on-ink, --accent, --accent-soft, --muted,
// --sans, --serif, --mono.
const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: var(--W); height: var(--H); overflow: hidden; background: var(--ground, #EEF0F3); }
body { font-family: var(--sans, "Helvetica Neue", Helvetica, Arial, sans-serif); font-weight: 600; color: var(--ink, #15171C); -webkit-font-smoothing: antialiased; }
#stage { position: absolute; inset: 0; overflow: hidden; background: var(--ground, #EEF0F3); }
.sf-layer { position: absolute; left: 0; top: 0; width: var(--W); height: var(--H); transform-origin: 0 0; }
.sf-abs { position: absolute; }
.mask { display: inline-block; overflow: hidden; vertical-align: bottom; padding: 0 0.04em 0.16em; margin: 0 -0.04em -0.16em; }
.w { display: inline-block; white-space: pre; }
.sf-nowrap { white-space: nowrap; }
#win { overflow: hidden; background: var(--window, #FFFFFF); }
#winIn { left: 0; top: 0; }
#take { display: block; width: 100%; height: 100%; }
#winTint { inset: -1px; background: var(--accent, #2F6BFF); }
.sf-say { font-family: var(--sans, "Helvetica Neue", Helvetica, Arial, sans-serif); font-weight: 600; letter-spacing: -0.03em; color: var(--ink, #15171C); }
.sf-accent { font-family: var(--serif, Georgia, "Times New Roman", serif); font-style: italic; font-weight: 500; letter-spacing: -0.02em; color: var(--accent-soft, #A9C1FF); }
#dotSlot { display: inline-block; width: 0.2em; height: 0.2em; margin-left: 0.05em; }
#pill { background: var(--ink, #15171C); overflow: hidden; transform-origin: 50% 50%; }
#pill .cap { position: absolute; left: 0; top: 0; height: var(--pill); display: flex; align-items: center; padding: 0 40px; font-size: var(--pill-type); letter-spacing: -0.015em; color: var(--on-ink, #FFFFFF); white-space: nowrap; }
#sped { display: flex; align-items: center; gap: 0.5em; border-radius: 99px; padding: 0 1em; background: var(--ink, #15171C); color: var(--on-ink, #FFFFFF); font-family: var(--mono, ui-monospace, Menlo, monospace); font-weight: 500; letter-spacing: 0.06em; white-space: nowrap; transform-origin: 100% 50%; }
#sped i { width: 0; height: 0; border: 0.34em solid transparent; border-left: 0.5em solid var(--accent-soft, #A9C1FF); border-right: 0; }
#end { background: var(--ink, #15171C); }
#endHead { left: 0; width: var(--W); text-align: center; line-height: 1.16; color: var(--on-ink, #FFFFFF); }
.sf-agents { display: inline-grid; justify-items: start; vertical-align: bottom; clip-path: inset(-0.4em 0 -0.4em 0); }
.sf-agents > .mask { grid-area: 1 / 1; }
.sf-agent { display: inline-flex; align-items: center; gap: 0.2em; }
.sf-agent svg { width: 0.78em; height: 0.78em; flex: none; }
#endNote { left: 0; width: var(--W); text-align: center; line-height: 1.7; font-family: var(--mono, ui-monospace, Menlo, monospace); font-weight: 500; letter-spacing: 0.08em; color: var(--muted, #9AA1AE); }
`

/** Build the film from a spec and its take; resolves to the object render.mjs reads as window.film. */
export async function build(spec, { mount = document.getElementById('stage'), query = new URLSearchParams(location.search) } = {}) {
  validateSpec(spec)
  if (!globalThis.kit) throw new Error('session: load templates/kit.js before the engine (the starter film.html does)')
  const REEL = query.get('format') === 'reel'
  const FORMAT = REEL ? 'reel' : 'wide'
  const langs = Object.keys(spec.copy)
  const LANG = query.get('lang') || langs[0]
  if (!spec.copy[LANG]) throw new Error(`session: ?lang=${LANG}, but spec.copy has ${langs.join(', ')}`)
  // a 9:16 cut has a take of its own, recorded in a narrow window: a wide page shrunk to a phone is unreadable
  const TAKE = (query.get('take') || LANG) + (REEL ? '-reel' : '')
  const L = LAYOUT[FORMAT]
  const { W, H, lerp, prog, ease, spring, springTo, camera, camCss, $, show, words, riseWords, bump, draw } = globalThis.kit(...L.size)
  const b = (beats) => (beats * 60) / spec.bpm
  const DURATION = b(spec.beats)
  const A = spec.at
  const C = spec.copy[LANG]
  const MARKS = spec.marks ?? []
  const AGENTS = spec.agents ?? []
  const root = document.documentElement
  root.lang = LANG
  root.style.setProperty('--W', `${W}px`)
  root.style.setProperty('--H', `${H}px`)
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.prepend(style)

  const place = (el, r) => Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` })
  const mix = (a, c, p) => ({ x: lerp(a.x, c.x, p), y: lerp(a.y, c.y, p), w: lerp(a.w, c.w, p), h: lerp(a.h, c.h, p) })
  // A spring never quite reaches 1, and text under a scale rasters differently on every pass
  // (craft.md, Gotchas): once it has landed, the scale is exactly 1.
  const landed = (t, t0, o) => (t - t0 > 1.4 ? 1 : Math.max(0, spring(t, t0, o)))

  // ───────── build the DOM once ─────────
  const mark = typeof spec.mark === 'string' ? { d: spec.mark, viewBox: '0 0 24 24' } : spec.mark
  const markBox = mark ? (mark.viewBox ?? '0 0 24 24').split(' ').map(Number) : null
  Object.assign(mount.style, { position: 'absolute', left: '0', top: '0', width: `${W}px`, height: `${H}px`, overflow: 'hidden' })
  mount.innerHTML = `
    <div id="world" class="sf-layer" style="z-index:1">
      <div id="win" class="sf-abs"><div id="winIn" class="sf-abs"><img id="take" alt=""></div><div id="winTint" class="sf-abs"></div></div>
      <div id="marks" class="sf-abs" style="left:0;top:0"></div>
    </div>
    <div id="hook" class="sf-layer sf-say" style="z-index:5"></div>
    <div id="sped" class="sf-abs" style="z-index:6"><i></i><span>${C.sped}</span></div>
    <div id="pill" class="sf-abs" style="z-index:9"></div>
    <div id="end" class="sf-layer" style="z-index:10">
      ${mark ? `<svg id="mark" class="sf-abs" style="transform-origin:50% 50%" viewBox="${markBox.join(' ')}" fill="none">
        <path id="markPath" pathLength="1" d="${mark.d}" stroke="var(--on-ink, #FFFFFF)" stroke-width="${mark.stroke ?? markBox[2] * 0.094}" stroke-linejoin="round"/>
      </svg>` : ''}
      <div class="sf-abs sf-nowrap sf-say" id="endHead"></div>
      <div class="sf-abs sf-nowrap" id="endNote"></div>
    </div>`

  // the hook: its last line ends in the full stop the window grows out of
  const hook = C.hook[FORMAT]
  $('hook').style.fontSize = `${L.hook.size}px`
  $('hook').innerHTML = hook.map((_, n) => `<div class="sf-abs sf-nowrap" id="hook${n}" style="left:0;width:${W}px;text-align:center;top:${L.hook.mid - (hook.length * L.hook.step) / 2 + n * L.hook.step}px;line-height:1.08"></div>`).join('')
  const hookLines = hook.map((line, n) => words($(`hook${n}`), n === hook.length - 1 ? line.replace(/\.$/, '') : line))
  $(`hook${hook.length - 1}`).insertAdjacentHTML('beforeend', '<i id="dotSlot"></i>')

  root.style.setProperty('--pill', `${L.pill.h}px`)
  root.style.setProperty('--pill-type', `${L.pill.type}px`)
  $('pill').innerHTML = C.captions.map((c, i) => `<div class="cap" id="cap${i}">${c[1]}</div>`).join('')
  Object.assign($('sped').style, { right: `${L.sped.right}px`, top: `${L.sped.top}px`, height: `${L.sped.h}px`, fontSize: `${L.sped.type}px` })

  const End = L.end
  if (mark) Object.assign($('mark').style, { left: `${W / 2 - End.mark / 2}px`, top: `${End.markY - End.mark / 2}px`, width: `${End.mark}px`, height: `${End.mark}px` })
  Object.assign($('endHead').style, { fontSize: `${End.headSize}px`, top: `${End.headTop}px` })
  // A leading * marks the one serif accent. {agent} is the assistant that changes: spec.agents
  // names them, each with its logo, one after the other.
  const agentSlot = () => `<span class="sf-agents" id="agents">${AGENTS.map(({ name, hex, path }, i) =>
    `<span class="mask"><span class="w sf-agent" id="agent${i}"><svg viewBox="0 0 24 24" fill="${hex ?? 'currentColor'}"><path d="${path}"/></svg>${name}</span></span>`).join('')}</span>`
  const endWord = (w) => {
    const [before, after] = w.split('{agent}')
    if (after === undefined) return `<span class="mask"><span class="w${w[0] === '*' ? ' sf-accent' : ''}">${w.replace('*', '')}</span></span>`
    // the full stop after the name rises with the line, the name with its own clock
    return `${before}${agentSlot()}${after ? `<span class="mask"><span class="w">${after}</span></span>` : ''}`
  }
  if (agentSlots(C.end.head[FORMAT]) !== (AGENTS.length ? 1 : 0)) throw new Error(`session: the ${LANG} ${FORMAT} end card and spec.agents disagree`)
  $('endHead').innerHTML = C.end.head[FORMAT].map((line) => line.map(endWord).join(' ')).join('<br>')
  const endHead = [...$('endHead').querySelectorAll('.w:not(.sf-agent)')]
  const agentNames = AGENTS.map((_, i) => $(`agent${i}`))
  Object.assign($('endNote').style, { fontSize: `${End.noteSize}px`, top: `${End.noteTop}px` })
  $('endNote').innerHTML = C.end.note[FORMAT].map((line, n) => `<span class="mask"><span class="w" id="endNote${n}">${line}</span></span>`).join('<br>')
  const endNote = C.end.note[FORMAT].map((_, n) => $(`endNote${n}`))

  // ───────── the take ─────────
  // take.<name>.json is written by scripts/take.mjs: the frames it cut, and the moments (seconds)
  // and regions (pixels) someone read off the recording. Both are in the recording's own time and
  // pixels, so a second ingest with another trim or crop keeps them.
  const sheet = await fetch(`take.${TAKE}.json`)
  if (!sheet.ok) throw new Error(`session: take.${TAKE}.json is not beside the film: ingest that take (scripts/take.mjs), or name another with ?take=`)
  const take = await sheet.json()
  const frameUrl = (n) => `${take.dir}/f${String(n).padStart(5, '0')}.jpg`
  // Frames are footage and not in git, so a checkout can hold a take's sheet without them. The
  // window would stay blank and the render run to its end: the first and the last frame have to be
  // there before a frame is drawn.
  await Promise.all([1, take.frames].map((n) => new Promise((found, missing) => {
    const probe = new Image()
    probe.onload = found
    probe.onerror = () => missing(new Error(`session: ${frameUrl(n)} is missing: ingest the take first (scripts/take.mjs)`))
    probe.src = frameUrl(n)
  })))
  await Promise.all((spec.fonts ?? []).map((f) => document.fonts.load(f)))
  await document.fonts.ready

  const named = (kind, name) => {
    if (!(name in (take[kind] ?? {}))) throw new Error(`session: take.${TAKE}.json has no ${kind.slice(0, -1)} "${name}"`)
    return take[kind][name]
  }
  // the viewer zooms the body to fit a person's window; the renderer does not
  const zoom = Number(document.body.style.zoom) || 1
  const m0 = mount.getBoundingClientRect()
  const rel = (e) => { const r = e.getBoundingClientRect(); return { x: (r.left - m0.left) / zoom, y: (r.top - m0.top) / zoom, w: r.width / zoom, h: r.height / zoom } }
  const h = (L.win.w * take.height) / take.width
  const WIN = { x: (W - L.win.w) / 2, y: L.safe.y + (L.safe.h - h) / 2, w: L.win.w, h }
  place($('winIn'), { x: 0, y: 0, w: WIN.w, h: WIN.h })
  const DOT = rel($('dotSlot'))
  const capW = C.captions.map((_, i) => rel($(`cap${i}`)).w)
  const agentW = agentNames.map((e) => rel(e).w)
  // a region of the recording, where it stands in the world once the window has landed
  const region = (name) => inWindow(take, named('regions', name), WIN)
  // A region at the edge of the recording (the composer) is not centred: the camera keeps the safe
  // area inside the window wherever the window can fill it, so no frame is half ground.
  const frame = (r, fill) => frameRect(r, fill, L.safe, WIN, W, H)

  // spec.sync: [beat, moment, 'own'?]. Every stretch that plays faster than it was recorded says so
  // on screen, except one that ends on an 'own' entry: the user's own pace.
  const SYNC = spec.sync.map(([beat, at, pace]) => [b(beat), typeof at === 'number' ? at : named('moments', at), pace === 'own'])
  SYNC.forEach(([, s], i) => { if (i && s < SYNC[i - 1][1]) throw new Error(`session: sync[${i}] runs the take backwards (second ${s} after ${SYNC[i - 1][1]})`) })
  const FAST = fastStretches(SYNC)

  // spec.cam: one move per scene; while it rests on a subject it creeps a little closer, so a held
  // frame is never still.
  const CAM = (() => {
    const keys = []
    let held = null
    let creep = 1
    for (const [beat, name, fill = defaults.fill, move = defaults.move] of spec.cam) {
      if (held) keys.push([b(beat - move), held[0] * creep, held[1], held[2]])
      held = name === 'frame' ? [1, W / 2, H / 2] : frame(name === 'window' ? WIN : region(name), Array.isArray(fill) ? fill[REEL ? 1 : 0] : fill)
      // the hook is screen space and the dot under it world space: they only meet at exactly 1
      creep = name === 'frame' ? 1 : defaults.creep
      keys.push([b(beat), ...held])
    }
    keys.push([DURATION, held[0] * creep, held[1], held[2]])
    return keys
  })()

  // spec.marks: one line drawn around what the caption is about
  $('marks').innerHTML = MARKS.map(([, name], i) => {
    const r = region(name)
    const pad = 9
    return `<svg class="sf-abs" style="left:${r.x - pad}px;top:${r.y - pad}px;overflow:visible" width="${r.w + pad * 2}" height="${r.h + pad * 2}" fill="none"><rect id="markBox${i}" pathLength="1" x="0" y="0" width="${r.w + pad * 2}" height="${r.h + pad * 2}" rx="12" stroke="var(--accent, #2F6BFF)" stroke-width="3" stroke-linecap="round"/></svg>`
  }).join('')

  // what the <img> already shows: a cache, so a frame never depends on the one before it
  let shown = 0

  function seek(t) {
    t = Math.min(DURATION, Math.max(0, t))
    $('world').style.transform = camCss(camera(t, CAM))

    // ── the hook, and the full stop it ends in ──
    show($('hook'), t < b(A.window + 0.4))
    hookLines.forEach((line, n) => riseWords(line, t, b(A.hook + n * 0.6), b(A.hookOut) + n * 0.05))

    // ── the film's own handoff: the full stop grows into the window. The take stands still in the
    // world while the window's edge passes over it, and the accent leaves through the top. ──
    const g = ease.inOut(prog(t, b(A.window), b(A.window + TIMING.window)))
    const r = mix(DOT, WIN, g)
    place($('win'), r)
    Object.assign($('win').style, {
      borderRadius: `${lerp(Math.min(r.w, r.h) / 2, L.win.radius, ease.in(prog(g, 0.35, 1)))}px`,
      transform: g > 0 ? 'none' : `scale(${landed(t, b(A.dot), { freq: 2.6, damp: 0.6 })})`,
      boxShadow: `0 0 0 1px rgba(228,228,231,${g}), 0 44px 110px -44px rgba(8,7,15,${0.34 * g})`,
    })
    $('winIn').style.transform = `translate(${WIN.x - r.x}px,${WIN.y - r.y}px)`
    $('winTint').style.transform = `translateY(${-ease.inOut(prog(g, 0.3, 0.95)) * 101}%)`
    show($('win'), t >= b(A.dot) && t < b(A.end))

    // ── the take, at the speed the beats ask for ──
    const n = frameAt(take, takeTime(SYNC, t))
    if (shown !== n) {
      $('take').src = frameUrl(n)
      shown = n
    }
    const fast = FAST.find(([t0, t1]) => t >= t0 && t < t1 + 0.3)
    show($('sped'), Boolean(fast))
    if (fast) $('sped').style.transform = `translateY(${-ease.in(prog(t, fast[1], fast[1] + 0.3)) * (L.sped.top + L.sped.h + 20)}px) scale(${landed(t, fast[0], { freq: 2.6, damp: 0.7 })})`

    // drawn on, and taken off the way it came: nothing fades
    MARKS.forEach(([beat, , out], i) => draw($(`markBox${i}`), ease.inOut(prog(t, b(beat), b(beat + TIMING.markIn))) - ease.inOut(prog(t, b(out), b(out + TIMING.markOut)))))

    // ── the caption pill: one shape, its width follows the label, and at the end it is the page ──
    const first = b(C.captions[0][0])
    const pw = springTo(t, capW[0], C.captions.slice(1).map(([beat], i) => [b(beat), capW[i + 1]]), { freq: 2.4, damp: 0.75 })
    const flood = ease.inOut(prog(t, b(A.flood), b(A.flood + TIMING.flood)))
    // past every corner: a flood that stops at the frame edge leaves a corner open for a frame
    const pr = mix({ x: W / 2 - pw / 2, y: L.pill.top, w: pw, h: L.pill.h }, { x: -80, y: -80, w: W + 160, h: H + 160 }, flood)
    place($('pill'), pr)
    Object.assign($('pill').style, { borderRadius: `${(Math.min(pr.w, pr.h) / 2) * (1 - ease.in(prog(flood, 0.55, 1)))}px`, transform: `scale(${flood > 0 ? 1 : landed(t, first - b(TIMING.pillIn), { freq: 2.4, damp: 0.68 })})` })
    show($('pill'), t > first - b(TIMING.pillIn) && t < b(A.end))
    C.captions.forEach(([beat], i) => {
      const next = C.captions[i + 1] ? b(C.captions[i + 1][0]) : b(A.pillOut)
      const pin = i === 0 ? 1 : ease.out(prog(t, b(beat) + 0.08, b(beat) + 0.5))
      const pout = ease.in(prog(t, next - 0.12, next + 0.2))
      $(`cap${i}`).style.transform = `translateY(${((1 - pin) - pout) * L.pill.h}px)`
    })

    // ── the end card on the ink. The mark is drawn as one stroke. ──
    show($('end'), t >= b(A.end))
    if (mark) {
      draw($('markPath'), ease.inOut(prog(t, b(A.end + TIMING.markDraw[0]), b(A.end + TIMING.markDraw[1]))))
      $('mark').style.transform = `scale(${1 + 0.3 * bump(t, b(A.end + TIMING.markDraw[1]), { freq: 2.4, damp: 0.5 })})`
    }
    riseWords(endHead, t, b(A.end + TIMING.endHead), Infinity, 0.1, 0.55)
    // the agents one after the other, the last one stays; the slot's width follows the name
    const agentAt = (i) => b(A.end + TIMING.endAgent + i * TIMING.agentEvery)
    // a name has left (0.375 s, riseWords' exit) before the next one rises: never two in the slot
    agentNames.forEach((e, i) => riseWords([e], t, agentAt(i), i < agentNames.length - 1 ? agentAt(i + 1) - 0.4 : Infinity, 0, 0.5))
    if (agentNames.length) $('agents').style.width = `${springTo(t, agentW[0], agentW.slice(1).map((w, i) => [agentAt(i + 1), w]), { freq: 2.4, damp: 0.8 })}px`
    riseWords(endNote, t, b(A.end + TIMING.endNote), Infinity, 0.14, 0.5)
  }

  seek(0)
  return {
    width: W,
    height: H,
    fps: spec.fps ?? defaults.fps,
    duration: DURATION,
    beat: 60 / spec.bpm,
    bpm: spec.bpm,
    lang: LANG,
    take: TAKE,
    // soft handoffs: the window lands, the pill floods, the end card. Nothing is cut.
    cuts: [b(A.window + 1), b(A.flood + 0.6), b(A.end)],
    hardCuts: [],
    cues: cueSheet(spec),
    ready: Promise.resolve(),
    // The frame has to be decoded before the renderer takes its picture. A decode that fails is a
    // person scrubbing past a frame in the viewer: build has already refused a take without frames.
    seek: async (t) => { seek(t); await $('take').decode().catch(() => {}) },
  }
}
