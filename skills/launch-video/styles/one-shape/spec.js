// The one-shape spec: plain data, no DOM. One element is never cut; the film is a list of states
// the element passes through, each one caused by a pointer or by a flood. The browser engine
// (engine.js) and node (tests, cues.mjs) read this file, so a spec is checked before a frame is
// drawn and the cue sheet is derived without a browser.
//
//   { title, bpm, beats, fps, noteAt, palette, sources, states: [{ beat, size, radius, color, ground, flood,
//     kind, label, text, rows, note, offset, press, arrive, from }], music, cues }
//
// Sizes are pixels on a frame whose short side is 1080 (the engine scales them by the frame's
// short side). Every time is a beat. The last state equals the first, so the film loops.

export const FORMATS = { wide: [1920, 1080], square: [1440, 1440], reel: [1080, 1920], header: [3840, 1646], search: [3600, 2400] }
export const KINDS = ['label', 'field', 'ring', 'check', 'card']
const STATE_KEYS = new Set(['beat', 'size', 'radius', 'color', 'ground', 'flood', 'kind', 'label', 'text', 'rows', 'note', 'offset', 'press', 'arrive', 'from'])
export const FLOOD_SECONDS = 0.9
// how long a state's content waits for the old content to leave, and how long a leaving one takes
export const LAG = 0.3
export const EXIT = 0.3
// typed text starts this long after its state's content has risen, at this many characters a second
export const TYPE_AT = 0.4
export const TYPE_CPS = 14
// a pointer's visit ends this long after its press: it pops out, and the next visit starts after that
export const POINTER_LEAVES = 0.8

const HEX = /^#[0-9a-f]{3,8}$/i

const rgbOf = (hex) => {
  const h = hex.replace('#', '')
  const f = h.length === 3 ? [...h].map((x) => x + x).join('') : h
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
}

/**
 * The spec with everything inherited and converted: seconds, colours as hex and rgb, the ground each
 * state stands on, the content segments (states that change only the shape share one) and the
 * notes. A property a state leaves out is the previous state's.
 */
export function resolve(spec) {
  const beat = 60 / spec.bpm
  const col = (c) => spec.palette[c] ?? c
  let prev = null
  const states = spec.states.map((s, i) => {
    const size = s.size ?? prev.size
    const radius = s.radius ?? prev?.radiusSpec ?? 'pill'
    const hex = col(s.color ?? prev.colorName)
    const r = {
      i, beat: s.beat, t: s.beat * beat, size, radiusSpec: radius,
      radius: radius === 'pill' ? Math.min(...size) / 2 : radius,
      colorName: s.color ?? prev?.colorName, hex, rgb: rgbOf(hex),
      ground: s.flood || i === 0 ? col(s.ground) : prev.ground,
      flood: Boolean(s.flood),
      kind: s.kind ?? prev?.kind, label: s.kind ? s.label : prev.label, text: s.kind ? s.text : prev.text, rows: s.kind ? s.rows : prev.rows,
      note: s.note ?? prev?.note, offset: s.offset ?? prev?.offset ?? [0, 0],
      press: s.press ?? null, arrive: (s.arrive ?? 1) * beat, from: s.from ?? [260, -190],
    }
    prev = r
    return r
  })
  const sig = (s) => JSON.stringify([s.kind, s.label, s.text, s.rows])
  // content segments: a state that names no kind keeps the content of the one before
  const parts = []
  states.forEach((s, i) => {
    if (i && sig(s) === sig(states[i - 1])) { parts.at(-1).i1 = i; return }
    parts.push({ i0: i, i1: i, kind: s.kind, label: s.label, text: s.text, rows: s.rows, size: s.size })
  })
  parts.forEach((p, j) => {
    p.tIn = p.i0 === 0 ? -Infinity : states[p.i0].t + LAG
    p.tOut = parts[j + 1] ? states[parts[j + 1].i0].t : Infinity
  })
  const notes = []
  states.forEach((s, i) => {
    if (i && s.note === states[i - 1].note) { notes.at(-1).i1 = i; return }
    notes.push({ text: s.note, i0: i, i1: i })
  })
  notes.forEach((n, j) => {
    n.tIn = n.i0 === 0 ? -Infinity : states[n.i0].t + LAG
    n.tOut = notes[j + 1] ? states[notes[j + 1].i0].t : Infinity
  })
  const fd = spec.floodSeconds ?? FLOOD_SECONDS
  return {
    spec, T: spec.beats * beat, fps: spec.fps ?? 30, beat, fd, states, parts, notes,
    floods: states.filter((s) => s.flood).map((s) => ({ i: s.i, t0: s.t, t1: s.t + fd })),
    taps: states.filter((s) => s.press).map((s) => ({ i: s.i, t: s.t, press: s.press, arrive: s.arrive, from: s.from })),
  }
}

// Strings a viewer reads, for the numbers rule.
const textsOf = (s) => [s.label, s.text, s.note, ...(s.rows ?? [])].filter((x) => typeof x === 'string')

/**
 * Throws `spec: <where>: <what>`. Checks that beats ascend, that every state after the first has a
 * cause (a pointer press or a flood), that floods and pointer visits do not overlap, that the last
 * state equals the first (the loop), and the numbers rule: on-screen text with a digit needs an entry
 * in `spec.sources`.
 */
export function validateSpec(spec) {
  const bad = (m) => { throw new Error(`spec: ${m}`) }
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  const pair = (v) => Array.isArray(v) && v.length === 2 && v.every(num)
  if (!spec || typeof spec !== 'object') bad('not an object')
  if (!(num(spec.bpm) && spec.bpm >= 60 && spec.bpm <= 220)) bad('bpm is a number from 60 to 220 (the music\'s measured tempo)')
  if (!(num(spec.beats) && spec.beats > 0)) bad('beats is the film\'s length in beats')
  if (spec.fps != null && !(num(spec.fps) && spec.fps >= 24 && spec.fps <= 60)) bad('fps is 24 to 60 (30 for a calm film)')
  if (spec.floodSeconds != null && !(num(spec.floodSeconds) && spec.floodSeconds >= 0.5 && spec.floodSeconds <= 1.5)) bad('floodSeconds is 0.5 to 1.5 (0.9 by default)')
  if (!spec.palette || typeof spec.palette !== 'object') bad('palette is { name: "#hex" } and must name paper and ink')
  for (const [k, v] of Object.entries(spec.palette)) if (typeof v !== 'string' || !HEX.test(v)) bad(`palette.${k}: a #hex colour`)
  for (const k of ['paper', 'ink']) if (!spec.palette[k]) bad(`palette.${k}: missing (paper and ink are the two type colours)`)
  if (spec.noteAt != null && !['below', 'left'].includes(spec.noteAt)) bad('noteAt is "below" or "left" (left: a column beside the shape in a frame wider than 1.7:1)')
  for (const f of spec.formats ?? []) if (!FORMATS[f]) bad(`formats: "${f}" is one of ${Object.keys(FORMATS).join(', ')}`)
  const colour = (c) => spec.palette[c] != null || HEX.test(c ?? '')
  if (!Array.isArray(spec.states) || spec.states.length < 3) bad('states is a list of at least 3')

  const beat = 60 / spec.bpm
  const fdBeats = (spec.floodSeconds ?? FLOOD_SECONDS) / beat
  let last = -Infinity
  spec.states.forEach((s, i) => {
    const where = `states[${i}]`
    for (const k of Object.keys(s)) if (!STATE_KEYS.has(k)) bad(`${where}: unknown key "${k}" (keys: ${[...STATE_KEYS].join(', ')})`)
    if (!num(s.beat)) bad(`${where}: beat is a number`)
    if (i === 0 ? s.beat !== 0 : s.beat <= last) bad(`${where}: ${i === 0 ? 'the first state is at beat 0' : `beat ${s.beat} does not follow beat ${last}; beats ascend`}`)
    last = s.beat
    if (i === 0) for (const k of ['size', 'color', 'ground', 'kind']) if (s[k] == null) bad(`${where}: the first state names ${k}`)
    if (s.size != null && !(pair(s.size) && s.size.every((v) => v >= 20 && v <= 2000))) bad(`${where}: size is [width, height] in px on a 1080 frame, 20 to 2000`)
    if (s.radius != null && s.radius !== 'pill' && !(num(s.radius) && s.radius >= 0)) bad(`${where}: radius is "pill" or a number of px`)
    if (s.color != null && !colour(s.color)) bad(`${where}: color is a palette name or a #hex`)
    if (s.ground != null && !colour(s.ground)) bad(`${where}: ground is a palette name or a #hex`)
    if (s.offset != null && !pair(s.offset)) bad(`${where}: offset is [dx, dy]`)
    if (s.kind != null) {
      if (!KINDS.includes(s.kind)) bad(`${where}: kind is one of ${KINDS.join(', ')}`)
      if (s.kind === 'label' && typeof s.label !== 'string') bad(`${where}: a label state needs label`)
      if (s.kind === 'field' && typeof s.text !== 'string') bad(`${where}: a field state needs text (what is typed)`)
      if (s.kind === 'card' && !(Array.isArray(s.rows) && s.rows.length >= 1 && s.rows.length <= 4 && s.rows.every((r) => typeof r === 'string'))) bad(`${where}: a card state needs rows, 1 to 4 strings`)
    }
    if (s.press != null && !pair(s.press)) bad(`${where}: press is [dx, dy] from the shape's centre, in px on a 1080 frame`)
    if (s.arrive != null && !(num(s.arrive) && s.arrive >= 0.5 && s.arrive <= 4)) bad(`${where}: arrive is 0.5 to 4 beats`)
    if (s.from != null && !pair(s.from)) bad(`${where}: from is [dx, dy], where the pointer starts relative to its target`)
    if (s.flood && !colour(s.ground)) bad(`${where}: a flood names the ground it pours out`)
    if (s.ground != null && i > 0 && !s.flood) bad(`${where}: a ground changes only in a flood (flood: true); nothing fades`)
    if (i > 0 && !s.press && !s.flood) bad(`${where}: no cause; every change after the first is a pointer press or a flood`)
  })

  const tl = resolve(spec)
  const { states } = tl
  states.forEach((s, i) => {
    const where = `states[${i}]`
    if (s.flood && s.ground === states[i - 1].ground) bad(`${where}: flood pours the ground it already has`)
    if (i && !changes(s, states[i - 1])) bad(`${where}: changes nothing; a state differs from the one before in size, radius, colour, ground, content, note or offset`)
    for (const t of textsOf(s)) if (/\d/.test(t) && !spec.sources?.[t]) bad(`${where}: on-screen "${t}" has a number and no entry in spec.sources (where does it come from?)`)
  })
  // one flood runs at a time
  tl.floods.forEach((f, j) => {
    const next = tl.floods[j + 1]
    if (next && next.t0 < f.t1) bad(`states[${next.i}]: flood starts at beat ${states[next.i].beat} while the flood of states[${f.i}] runs until beat ${(f.t1 / tl.beat).toFixed(2)}`)
  })
  // a pointer's visit ends POINTER_LEAVES after its press, and the next one starts after that
  tl.taps.forEach((p, j) => {
    const prev = tl.taps[j - 1]
    if (prev && p.t - p.arrive < prev.t + POINTER_LEAVES) bad(`states[${p.i}]: the pointer arrives at beat ${((p.t - p.arrive) / beat).toFixed(2)}, before the one at states[${prev.i}] has left (beat ${((prev.t + POINTER_LEAVES) / beat).toFixed(2)} at the earliest); lower arrive or move the beat`)
    if (p.t - p.arrive < 0) bad(`states[${p.i}]: the pointer would arrive before the film starts; lower arrive`)
  })
  // the loop
  const a = states[0]
  const z = states.at(-1)
  for (const k of ['size', 'radius', 'hex', 'ground', 'kind', 'label', 'text', 'rows', 'note', 'offset']) {
    if (JSON.stringify(a[k]) !== JSON.stringify(z[k])) bad(`states[${states.length - 1}]: the last state equals the first (that is the loop); ${k === 'hex' ? 'color' : k} differs (${JSON.stringify(z[k])} against ${JSON.stringify(a[k])})`)
  }
  const settle = z.beat + (z.flood ? fdBeats : 0) + 1.5
  if (spec.beats < settle) bad(`beats is ${spec.beats} but the last state needs until beat ${settle.toFixed(1)} to land and rest before the film wraps`)
  if (spec.beats > settle + 8) bad(`beats is ${spec.beats}: the last state would rest ${(spec.beats - settle + 1.5).toFixed(0)} beats after it lands, a held frame; end the film within 8 beats of it`)
  for (const [j, c] of (spec.cues ?? []).entries()) if (!num(c.beat) || typeof c.name !== 'string') bad(`cues[${j}]: { beat, name }`)
  return spec
}

const changes = (s, p) => ['size', 'radiusSpec', 'hex', 'ground', 'kind', 'label', 'text', 'rows', 'note', 'offset'].some((k) => JSON.stringify(s[k]) !== JSON.stringify(p[k]))

/**
 * The sound cues a spec implies, in beats: [{ beat, name, anchor? }]. The picture's own events place
 * them: a click on a press, a whoosh peaking mid-flood, a key under every third typed character, a chime on the check,
 * a pop per row. `spec.cues` adds the film's own.
 */
export function cueSheet(spec) {
  const tl = resolve(spec)
  const fdBeats = tl.fd / tl.beat
  const out = []
  const add = (beat, name, extra = {}) => out.push({ beat, name, ...extra })
  for (const s of tl.states) if (s.press) add(s.beat, 'click')
  for (const f of tl.floods) add(f.t0 / tl.beat + fdBeats / 2, 'whoosh')
  for (const p of tl.parts) {
    if (p.i0 === 0) continue
    const b = tl.states[p.i0].beat + LAG / tl.beat
    // a key under every third character
    if (p.kind === 'field') for (let k = 0; k < p.text.length; k += 3) add(b + (TYPE_AT + k / TYPE_CPS) / tl.beat, 'key')
    if (p.kind === 'check') add(b + 0.2, 'chime')
    if (p.kind === 'ring') add(b, 'pop')
    if (p.kind === 'card') p.rows.forEach((_, k) => add(b + 0.2 + k * 0.5, 'pop'))
  }
  return [...out, ...(spec.cues ?? [])].filter((c) => c.beat >= 0 && c.beat < spec.beats).sort((x, y) => x.beat - y.beat || x.name.localeCompare(y.name))
}
