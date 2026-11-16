// The session spec: plain data, no DOM. A session film is a take (a chat session, drawn by
// session.html or recorded by a person, ingested as frames) shown in a window, and everything around
// it is drawn from this file. The browser engine (engine.js) and node (tests, cues.mjs) read it, so a
// spec is checked before a frame is drawn and a cue sheet is derived without a browser.
//
//   { title, bpm, beats, fps, at, sync, cam, marks, agents, mark, fonts, music, sources, cues, copy }
//
// Every time is in beats.
//   at     { hook, dot, hookOut, window, pillOut, flood, end }   the hook rises, its full stop pops,
//          the hook leaves, the stop grows into the window, the last caption leaves, the pill floods
//          the frame, the end card
//   sync   [[beat, moment, 'own'?], ...]   which moment of the take stands on which beat: a name from
//          the take's `moments` or a second. 'own' marks the stretch that ends there as the user's pace
//   cam    [[beat, 'frame' | 'window' | region, fill?, move?], ...]   the camera arrives on a region
//          of the take at `beat`, filling `fill` of the safe area (one number or [wide, reel]),
//          after a move of `move` beats
//   marks  [[beat, region, beat it leaves], ...]   one line drawn around what the caption is about
//   agents [{ name, hex?, path }]   the assistants the end card names in turn; `path` is an SVG path
//          in a 24 x 24 box. The film passes them in; the style ships no third-party logo
//   mark   'M...' (24 x 24) or { d, viewBox, stroke? }   the brand's mark, drawn on the end card as one stroke
//   copy   { <lang>: { hook: { wide, reel }, captions: [[beat, text]], sped, end: { head: { wide, reel }, note: { wide, reel } } } }
//          head is lines of words; a leading * is the serif accent, {agent} the slot the agents turn in

export const MOMENTS = ['hook', 'dot', 'hookOut', 'window', 'pillOut', 'flood', 'end']
export const FORMATS = ['wide', 'reel']

export const defaults = { fps: 60, fill: 0.9, move: 1.6, creep: 1.03 }
// Beats an effect takes to play out; the engine draws them with the same numbers.
export const TIMING = { window: 2, flood: 1.1, pillIn: 0.4, markIn: 1.4, markOut: 1, markDraw: [0.4, 2.4], endHead: 2.6, endAgent: 2.7, agentEvery: 2.4, endNote: 5.6 }
// The moments session.html names that make a sound when they land on the beat.
export const CUE_MOMENTS = { send: 'click', toolCall: 'tool', result: 'result' }

const MAX_CAPTION = 48 // characters: what the 9:16 pill holds at its type size
const MIN_CAPTION_GAP = 3
const NOTE_READ = 2 // beats the end card holds after its last line has risen

const num = (v) => typeof v === 'number' && Number.isFinite(v)
const round3 = (x) => Math.round(x * 1000) / 1000
const LANG = /^[a-z][a-z0-9-]*$/

/** The {agent} slots of one end card head: lines of words. */
export const agentSlots = (head) => head.flat().filter((w) => w.includes('{agent}')).length

/** Every string a viewer reads that the spec carries, in every language: hook, captions, the sped-up label, the end card, the agents' names. */
export function specTexts(spec) {
  const out = (spec.agents ?? []).map((a) => a.name)
  for (const c of Object.values(spec.copy ?? {})) {
    for (const f of FORMATS) {
      out.push(...(c.hook?.[f] ?? []), ...(c.end?.note?.[f] ?? []))
      out.push(...(c.end?.head?.[f] ?? []).flat().map((w) => w.replace('*', '').replace('{agent}', '')).filter(Boolean))
    }
    out.push(...(c.captions ?? []).map((cap) => cap[1]), c.sped)
  }
  return out.filter((t) => typeof t === 'string')
}

/** The first text with a digit and no entry in `sources` (where does the number come from?), or null. */
export function unsourced(texts, sources = {}) {
  return texts.find((t) => /\d/.test(t) && !sources[t]) ?? null
}

/** Beats the end card needs: its last line risen and read, and every agent shown. */
export function endBeats(spec) {
  const agents = spec.agents?.length ?? 0
  return Math.max(TIMING.endNote, TIMING.endAgent + Math.max(0, agents - 1) * TIMING.agentEvery) + NOTE_READ
}

/**
 * The sound cues a spec implies, in beats: [{ beat, name }]. The hook's full stop pops, the window
 * grows with a whoosh, the take's send, tool call and result land on their sync beats, a mark is
 * drawn, the pill floods the frame, the end card's mark closes. Gains live in the kit (audio.json).
 */
export function cueSheet(spec) {
  const out = []
  const add = (beat, name) => out.push({ beat: round3(beat), name })
  const { at } = spec
  add(at.dot, 'pop')
  add(at.window + 0.1, 'whoosh')
  for (const [beat, moment] of spec.sync) if (CUE_MOMENTS[moment]) add(beat, CUE_MOMENTS[moment])
  for (const [beat] of spec.marks ?? []) add(beat, 'mark')
  // the flood peaks half way: the whoosh is placed by its peak
  add(at.flood + TIMING.flood / 2, 'flood')
  if (spec.mark) add(at.end + TIMING.markDraw[1], 'pop')
  return [...out, ...(spec.cues ?? [])].filter((c) => c.beat >= 0 && c.beat < spec.beats).sort((a, b) => a.beat - b.beat || a.name.localeCompare(b.name))
}

/**
 * Throws `spec: <where>: <what>`. Checks the score, that the hook, window, pill and end card come in
 * order, that the take's sync runs forward, that the camera makes one move at a time and holds the
 * frame until the window has landed, the marks, the copy of every language in both formats, that an
 * {agent} slot goes with a list of agents, and the numbers rule (a digit on screen needs an entry
 * in `sources`). The take's own names are checked when the film loads it.
 */
export function validateSpec(spec) {
  const bad = (m) => { throw new Error(`spec: ${m}`) }
  if (!spec || typeof spec !== 'object') bad('not an object')
  if (!(num(spec.bpm) && spec.bpm >= 60 && spec.bpm <= 220)) bad("bpm is a number from 60 to 220 (the music's measured tempo)")
  if (!(num(spec.beats) && spec.beats > 0)) bad("beats is the film's length in beats")
  if (spec.fps != null && !(Number.isInteger(spec.fps) && spec.fps >= 24 && spec.fps <= 120)) bad('fps is a whole number from 24 to 120')
  const inFilm = (where, v) => { if (!(num(v) && v >= 0 && v <= spec.beats)) bad(`${where} is a beat from 0 to ${spec.beats}`) }

  // the order of the film: hook, full stop, window, captions, pill, end card
  const at = spec.at
  if (!at || typeof at !== 'object') bad(`at names the beats ${MOMENTS.join(', ')}`)
  MOMENTS.forEach((k, i) => {
    inFilm(`at.${k}`, at[k])
    if (i && at[k] < at[MOMENTS[i - 1]]) bad(`at.${k} (${at[k]}) comes before at.${MOMENTS[i - 1]} (${at[MOMENTS[i - 1]]}); they come in the order ${MOMENTS.join(', ')}`)
  })
  if (!(at.dot > at.hook)) bad('at.dot is after at.hook: the full stop pops once the hook has risen')
  const landed = at.window + TIMING.window
  if (at.end < at.flood + TIMING.flood - 1e-6) bad(`at.end is at least ${TIMING.flood} beats after at.flood: the pill has to fill the frame first`)
  const need = endBeats(spec)
  if (spec.beats - at.end < need - 1e-6) bad(`the end card has ${round3(spec.beats - at.end)} beats and needs ${need} (its lines and every agent); set beats to ${Math.ceil(at.end + need)} or more`)

  // the take on the beat: forward only
  if (!Array.isArray(spec.sync) || spec.sync.length < 2) bad("sync is a list of at least two [beat, moment, 'own'?]")
  let lastBeat = -Infinity
  let lastSecond = -Infinity
  spec.sync.forEach((s, i) => {
    const where = `sync[${i}]`
    if (!Array.isArray(s) || s.length < 2 || s.length > 3) bad(`${where}: [beat, moment, 'own'?]`)
    const [beat, moment, pace] = s
    inFilm(`${where}: beat`, beat)
    if (!((typeof moment === 'string' && moment) || (num(moment) && moment >= 0))) bad(`${where}: the moment is a name from the take's moments or a second of the recording`)
    if (pace != null && pace !== 'own') bad(`${where}: the third field is 'own' or nothing`)
    if (beat < lastBeat) bad(`${where}: beat ${beat} comes before the previous entry's ${lastBeat}; sync runs forward`)
    if (num(moment)) {
      if (moment < lastSecond) bad(`${where}: second ${moment} of the take comes before the previous one (${lastSecond}); the take never runs backwards`)
      lastSecond = moment
    }
    lastBeat = beat
  })

  // the camera: one move at a time, the frame until the window has landed
  if (!Array.isArray(spec.cam) || !spec.cam.length) bad("cam is a list of [beat, 'frame' | 'window' | region, fill?, move?]")
  const [b0, n0] = spec.cam[0] ?? []
  if (b0 !== 0 || n0 !== 'frame') bad("cam[0] is [0, 'frame']: the hook and the full stop only meet at exactly zoom 1")
  let camAt = 0
  spec.cam.forEach((c, i) => {
    const where = `cam[${i}]`
    if (!Array.isArray(c) || c.length < 2 || c.length > 4) bad(`${where}: [beat, region, fill?, move?]`)
    const [beat, name, fill = defaults.fill, move = defaults.move] = c
    inFilm(`${where}: beat`, beat)
    if (typeof name !== 'string' || !name) bad(`${where}: the region is 'frame', 'window' or a name from the take's regions`)
    const okFill = (v) => num(v) && v > 0 && v <= 2
    if (!(okFill(fill) || (Array.isArray(fill) && fill.length === 2 && fill.every(okFill)))) bad(`${where}: fill is a number from 0 to 2, or [wide, reel]`)
    if (!(num(move) && move > 0 && move <= 8)) bad(`${where}: move is the beats the move takes, 0 to 8`)
    if (i) {
      if (beat - move < camAt - 1e-6) bad(`${where}: the move starts at beat ${round3(beat - move)} but the camera arrives at ${camAt} before it; one move at a time`)
      if (i === 1 && beat - move < landed - 1e-6) bad(`${where}: the move starts at beat ${round3(beat - move)}, before the window has landed (${landed}); the camera holds the frame until then`)
    }
    camAt = beat
  })

  if (spec.marks != null && !Array.isArray(spec.marks)) bad('marks is a list of [beat, region, beat it leaves]')
  ;(spec.marks ?? []).forEach((m, i) => {
    const where = `marks[${i}]`
    if (!Array.isArray(m) || m.length !== 3) bad(`${where}: [beat, region, beat it leaves]`)
    const [beat, name, out] = m
    inFilm(`${where}: beat`, beat)
    if (typeof name !== 'string' || !name) bad(`${where}: the region is a name from the take's regions`)
    if (beat < landed) bad(`${where}: drawn at beat ${beat}, before the window has landed (${landed})`)
    if (!(num(out) && out >= beat + TIMING.markIn)) bad(`${where}: it leaves at least ${TIMING.markIn} beats after it is drawn on`)
    if (out + TIMING.markOut > at.flood + 1e-6) bad(`${where}: it is still leaving at beat ${out + TIMING.markOut}, after the pill floods (${at.flood})`)
  })

  if (spec.agents != null && !Array.isArray(spec.agents)) bad('agents is a list of { name, hex?, path }')
  ;(spec.agents ?? []).forEach((a, i) => {
    if (!a || typeof a.name !== 'string' || !a.name.trim()) bad(`agents[${i}]: name is the assistant's name as the end card shows it`)
    if (typeof a.path !== 'string' || !a.path.trim()) bad(`agents[${i}]: path is its logo, an SVG path in a 24 x 24 box`)
    if (a.hex != null && !/^#[0-9a-f]{3,8}$/i.test(a.hex)) bad(`agents[${i}]: hex is a colour like "#1f8f5f", or leave it out for the ink`)
  })
  const agents = spec.agents?.length ?? 0
  if (spec.mark != null && !(typeof spec.mark === 'string' ? spec.mark.trim() : typeof spec.mark?.d === 'string' && (spec.mark.viewBox == null || /^-?[\d.]+( -?[\d.]+){3}$/.test(spec.mark.viewBox)))) bad("mark is an SVG path in a 24 x 24 box, or { d, viewBox: '0 0 w h', stroke? }")
  if (spec.fonts != null && !(Array.isArray(spec.fonts) && spec.fonts.every((f) => typeof f === 'string'))) bad("fonts is a list of CSS font shorthands the film waits for, like '600 118px Inter'")

  // the copy: every language, both formats
  const langs = Object.keys(spec.copy ?? {})
  if (!spec.copy || typeof spec.copy !== 'object' || !langs.length) bad('copy is { <lang>: { hook, captions, sped, end } }, one entry per language')
  for (const lang of langs) {
    const c = spec.copy[lang]
    const where = `copy.${lang}`
    if (!LANG.test(lang) || lang.endsWith('-reel')) bad(`${where}: a language is a lowercase take name like "en" (a reel adds "-reel" itself)`)
    const lines = (v) => Array.isArray(v) && v.length && v.every((l) => typeof l === 'string' && l.trim())
    for (const f of FORMATS) {
      if (!lines(c?.hook?.[f])) bad(`${where}.hook.${f} is a list of lines; the last one ends in the full stop the window grows out of`)
      const head = c?.end?.head?.[f]
      if (!(Array.isArray(head) && head.length && head.every((l) => Array.isArray(l) && l.length && l.every((w) => typeof w === 'string' && w.trim())))) bad(`${where}.end.head.${f} is a list of lines, each a list of words`)
      const slots = agentSlots(head)
      if (slots > 1 || (slots === 1) !== (agents > 0)) bad(`${where}.end.head.${f} has ${slots} {agent} and spec.agents names ${agents}: one slot goes with a list, none without`)
      if (!lines(c?.end?.note?.[f])) bad(`${where}.end.note.${f} is a list of lines`)
    }
    if (typeof c.sped !== 'string' || !c.sped.trim() || c.sped.length > 24) bad(`${where}.sped is the label of a stretch played faster than recorded, like "Sped up"`)
    if (!Array.isArray(c.captions) || !c.captions.length) bad(`${where}.captions is a list of [beat, text]`)
    let last = null
    c.captions.forEach((cap, i) => {
      const w = `${where}.captions[${i}]`
      if (!Array.isArray(cap) || cap.length !== 2) bad(`${w}: [beat, text]`)
      const [beat, text] = cap
      inFilm(`${w}: beat`, beat)
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_CAPTION) bad(`${w}: text is one short line, ${MAX_CAPTION} characters at most`)
      if (i === 0 && beat < landed) bad(`${w}: the first caption comes once the window has landed (beat ${landed})`)
      if (last != null && beat - last < MIN_CAPTION_GAP) bad(`${w}: a caption stays at least ${MIN_CAPTION_GAP} beats; the previous one is at beat ${last}`)
      last = beat
    })
    if (at.pillOut - last < MIN_CAPTION_GAP) bad(`${where}: the last caption (beat ${last}) stays at least ${MIN_CAPTION_GAP} beats before at.pillOut (${at.pillOut})`)
  }

  const digit = unsourced(specTexts(spec), spec.sources)
  if (digit) bad(`"${digit}" has a number and no entry in spec.sources (where does it come from?)`)
  return spec
}
