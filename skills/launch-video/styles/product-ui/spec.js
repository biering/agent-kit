// The product-ui spec: plain data, no DOM. A walkthrough is a list of steps on the beat grid; the
// film's own HTML (a few ids) is the screen, and the steps drive it. The browser engine (engine.js)
// and node (tests, cues.mjs) read this file, so a spec is checked before a frame is drawn and a cue
// sheet is derived without a browser.
//
//   { title, bpm, beats, fps, size, pointer, drift, music, sources, targets: ['#ask', ...], steps: [...], cues }
//
// A step is { beat, do, ... } with `beat` on a quarter beat. Steps (defaults in `defaults`):
//   move    { to, at?: [fx, fy], dur? }     the pointer travels to a target's rect (fractions of it)
//   press   { }                             a click where the pointer stands
//   type    { into, text, cps? }            text typed into a field the pointer has just pressed
//   toggle  { target }                      a press that flips a switch
//   switch  { tab }                         the tab indicator and the page swap, caused by a press
//   scroll  { by, in? }                     a scroll area moves by `by` px
//   camera  { to: '#id' | [x, y], zoom, at?, dur?, whoosh? }   the frame moves to a target (the part `at` of it) or a world point
//   caption { text }                        the one caption in the pill, until the next one
//   run     { target, rows, every? }        a checklist rises and completes row by row, caused by a press
//   result  { target, from? }               a card grows out of `from` (default: what was pressed last)

export const DOS = ['move', 'press', 'type', 'toggle', 'switch', 'scroll', 'camera', 'caption', 'run', 'result']
export const POINTERS = ['arrow', 'dot']

export const defaults = { moveDur: 1.5, cameraDur: 2, cps: 14, every: 1, size: [1920, 1080], drift: 0.009 }
// Beats an effect takes to play out; the engine draws them with the same numbers.
export const TIMING = { runLead: 1.5, runTail: 0.5, result: 2.5, switch: 2.5, toggle: 1.5, scroll: 1.5, press: 1 }

const CAUSE_BEATS = { switch: 2, run: 3 } // a change follows its press within this many beats
const RESULT_AFTER_PRESS = 16
const MIN_CAPTION_GAP = 3
const END_HOLD = [3, 6] // beats the last framing rests: the end card, long enough to read and short enough to stay alive
const MAX_QUIET_SECONDS = 5 // a walkthrough keeps changing

const num = (v) => typeof v === 'number' && Number.isFinite(v)
const ID = /^#[A-Za-z][\w-]*$/

/** Beats a step takes, from its own fields: what the pointer, the typing and the checks need. */
export function stepEnd(s, bpm) {
  switch (s.do) {
    case 'move': return s.beat + (s.dur ?? defaults.moveDur)
    case 'camera': return s.beat + (s.dur ?? defaults.cameraDur)
    case 'type': return s.beat + ((s.text.length / (s.cps ?? defaults.cps)) * bpm) / 60
    case 'run': return s.beat + TIMING.runLead + (s.rows - 1) * (s.every ?? defaults.every) + TIMING.runTail
    case 'press': return s.beat + TIMING.press
    default: return s.beat + (TIMING[s.do] ?? 0)
  }
}

/** A number in [0, 1) from an integer: the same index always gives the same value. */
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }
const round3 = (x) => Math.round(x * 1000) / 1000
const KEYS = ['key', 'key_alt', 'key_soft', 'key_alt_soft']

/**
 * The sound cues a spec implies, in beats: [{ beat, name, gain_db? }]. The same steps place the
 * picture, so the sound follows a change of the film without a second list to edit: a click per
 * press, a keystroke per typed character, a tick per checked row, a pop and a chime for a result,
 * a whoosh per camera move, a page sound per tab switch. Gains live in the kit (audio.json), by name.
 */
export function cueSheet(spec) {
  const out = []
  const add = (beat, name) => out.push({ beat: round3(beat), name })
  spec.steps.forEach((s, i) => {
    switch (s.do) {
      case 'press': add(s.beat, 'click'); break
      case 'toggle': add(s.beat, 'toggle'); break
      case 'type': {
        const perChar = (1 / (s.cps ?? defaults.cps)) * (spec.bpm / 60) // beats per character
        ;[...s.text].forEach((c, n) => {
          if (c === ' ') return
          // four recorded presses by a hash of the character's place: the same text always sounds the same
          add(s.beat + (n + 1) * perChar, KEYS[Math.floor(hash(i * 31 + n) * KEYS.length)])
        })
        break
      }
      case 'switch': add(s.beat + 0.4, 'page'); break
      case 'run':
        add(s.beat, 'pop')
        for (let r = 0; r < s.rows; r++) add(s.beat + TIMING.runLead + r * (s.every ?? defaults.every), 'tick')
        break
      case 'result': add(s.beat, 'pop'); add(s.beat + 1, 'chime'); break
      case 'camera': if (s.whoosh !== false) add(s.beat + (s.dur ?? defaults.cameraDur) / 2, 'whoosh'); break
      default:
    }
  })
  return [...out, ...(spec.cues ?? [])].filter((c) => c.beat >= 0 && c.beat < spec.beats).sort((a, b) => a.beat - b.beat || a.name.localeCompare(b.name))
}

/** Every string a viewer reads that the spec itself carries: typed text and captions. */
export function specTexts(spec) {
  return spec.steps.flatMap((s) => (s.do === 'type' || s.do === 'caption' ? [s.text] : []))
}

/** The first text with a digit and no entry in `sources` (where does the number come from?), or null. */
export function unsourced(texts, sources = {}) {
  return texts.find((t) => /\d/.test(t) && !sources[t]) ?? null
}

/**
 * Throws `spec: <where>: <what>`. Checks that beats ascend on the grid, that every target is named
 * in `targets`, that every change has a cause (a type follows a press on its field, a switch, a run
 * and a result follow a press, a press happens where the pointer has arrived), the numbers rule (a
 * digit on screen needs an entry in `sources`), that nothing stays quiet for long, and that the film
 * ends on a framing the camera holds.
 */
export function validateSpec(spec) {
  const bad = (m) => { throw new Error(`spec: ${m}`) }
  if (!spec || typeof spec !== 'object') bad('not an object')
  if (!(num(spec.bpm) && spec.bpm >= 60 && spec.bpm <= 220)) bad("bpm is a number from 60 to 220 (the music's measured tempo)")
  if (!(num(spec.beats) && spec.beats > 0)) bad("beats is the film's length in beats")
  if (spec.size != null && !(Array.isArray(spec.size) && spec.size.length === 2 && spec.size.every((v) => num(v) && v > 0 && v % 2 === 0))) bad('size is [width, height] in even pixels')
  if (spec.pointer != null && !POINTERS.includes(spec.pointer)) bad(`pointer is one of ${POINTERS.join(', ')}`)
  if (spec.drift != null && !(num(spec.drift) && spec.drift >= 0 && spec.drift <= 0.03)) bad('drift is the camera creep per second in log zoom, 0 to 0.03')
  if (!Array.isArray(spec.targets) || !spec.targets.length) bad("targets is the list of element ids the steps name, like ['#ask', '#start']")
  spec.targets.forEach((t, i) => { if (typeof t !== 'string' || !ID.test(t)) bad(`targets[${i}]: "${t}" is an id selector like "#start"`) })
  if (new Set(spec.targets).size !== spec.targets.length) bad('targets lists an id twice')
  if (!Array.isArray(spec.steps) || !spec.steps.length) bad('steps is a list of { beat, do, ... }')

  const target = (where, field, v) => {
    if (typeof v !== 'string' || !spec.targets.includes(v)) bad(`${where}: ${field} "${v}" is not in spec.targets (add it, and give the element that id)`)
  }
  const bpm = spec.bpm
  const toSeconds = (beats) => (beats * 60) / bpm
  let last = -Infinity
  let pointer = null // { to, arrive }: where the pointer is going
  let press = null // { target, beat }: the last click
  let run = null // { end }: the last checklist
  let lastCaption = null
  let cameraEnd = 0
  let lastEnd = 0
  const covered = [] // [from, to] beats of steps that change the picture

  spec.steps.forEach((s, i) => {
    const where = `steps[${i}] ${s?.do ?? '?'}`
    if (!s || typeof s !== 'object' || !DOS.includes(s.do)) bad(`${where}: do is one of ${DOS.join(', ')}`)
    if (!num(s.beat) || s.beat < 0 || s.beat >= spec.beats) bad(`${where}: beat is a number from 0 to ${spec.beats}`)
    if (Math.round(s.beat * 4) / 4 !== s.beat) bad(`${where}: beat ${s.beat} is off the grid; steps sit on quarter beats`)
    if (s.beat < last) bad(`${where}: beat ${s.beat} comes before the previous step (${last}); steps ascend`)
    last = s.beat
    const positive = (field, v, max = 16) => { if (v != null && !(num(v) && v > 0 && v <= max)) bad(`${where}: ${field} is a number of beats from 0 to ${max}`) }

    switch (s.do) {
      case 'move':
        target(where, 'to', s.to)
        positive('dur', s.dur)
        if (s.at != null && !(Array.isArray(s.at) && s.at.length === 2 && s.at.every((v) => num(v) && v >= 0 && v <= 1))) bad(`${where}: at is [fx, fy], fractions of the target (0 to 1)`)
        if (pointer && s.beat < pointer.arrive - 1e-6) bad(`${where}: starts at beat ${s.beat} but the previous move arrives at ${pointer.arrive}; one move at a time`)
        pointer = { to: s.to, arrive: s.beat + (s.dur ?? defaults.moveDur) }
        break
      case 'press':
        if (!pointer) bad(`${where}: the pointer has not moved to anything yet; a press happens where it stands`)
        if (s.beat < pointer.arrive - 1e-6) bad(`${where}: presses at beat ${s.beat} but the pointer arrives at ${pointer.arrive}`)
        press = { target: pointer.to, beat: s.beat }
        break
      case 'toggle':
        target(where, 'target', s.target)
        if (pointer?.to !== s.target) bad(`${where}: the pointer is not on ${s.target} (move to it first)`)
        if (s.beat < pointer.arrive - 1e-6) bad(`${where}: toggles at beat ${s.beat} but the pointer arrives at ${pointer.arrive}`)
        press = { target: s.target, beat: s.beat }
        break
      case 'type':
        target(where, 'into', s.into)
        if (typeof s.text !== 'string' || !s.text.length) bad(`${where}: text is the string to type`)
        if (s.cps != null && !(num(s.cps) && s.cps >= 4 && s.cps <= 40)) bad(`${where}: cps is characters per second, 4 to 40`)
        if (press?.target !== s.into) bad(`${where}: typing into ${s.into} needs a press on it first (a field takes text after a click); the last press was ${press ? press.target : 'none'}`)
        break
      case 'switch':
        if (typeof s.tab !== 'string' || !s.tab) bad(`${where}: tab is the data-tab name to show`)
        if (!press || s.beat - press.beat > CAUSE_BEATS.switch) bad(`${where}: a page change needs a press within ${CAUSE_BEATS.switch} beats before it (the click on the tab)`)
        break
      case 'scroll':
        if (!num(s.by) || s.by === 0) bad(`${where}: by is the scroll distance in px, not 0`)
        if (s.in != null) target(where, 'in', s.in)
        break
      case 'camera':
        if (Array.isArray(s.to)) { if (!(s.to.length === 2 && s.to.every(num))) bad(`${where}: to is an id or a world point [x, y]`) } else target(where, 'to', s.to)
        if (!(num(s.zoom) && s.zoom >= 0.5 && s.zoom <= 4)) bad(`${where}: zoom is a number from 0.5 to 4`)
        if (s.at != null && !(Array.isArray(s.at) && s.at.length === 2 && s.at.every((v) => num(v) && v >= 0 && v <= 1))) bad(`${where}: at is [fx, fy], the fractions of the target that sit at the middle of the frame`)
        positive('dur', s.dur)
        if (s.beat < cameraEnd - 1e-6) bad(`${where}: starts at beat ${s.beat} but the previous camera move ends at ${cameraEnd}; one move at a time`)
        cameraEnd = s.beat + (s.dur ?? defaults.cameraDur)
        break
      case 'caption':
        if (typeof s.text !== 'string' || !s.text.trim() || s.text.length > 44) bad(`${where}: text is one short label, 44 characters at most`)
        if (lastCaption != null && s.beat - lastCaption < MIN_CAPTION_GAP) bad(`${where}: a caption stays at least ${MIN_CAPTION_GAP} beats; the previous one is at beat ${lastCaption}`)
        lastCaption = s.beat
        break
      case 'run':
        target(where, 'target', s.target)
        if (!(Number.isInteger(s.rows) && s.rows >= 1 && s.rows <= 8)) bad(`${where}: rows is how many rows the checklist has (1 to 8)`)
        positive('every', s.every, 4)
        if (!press || s.beat - press.beat > CAUSE_BEATS.run) bad(`${where}: work starts from a press within ${CAUSE_BEATS.run} beats before it (the one on the button)`)
        run = { end: stepEnd(s, bpm) }
        break
      case 'result':
        target(where, 'target', s.target)
        if (s.from != null) target(where, 'from', s.from)
        if (!press) bad(`${where}: a result needs a press before it (nothing happened to cause it)`)
        if (s.beat - press.beat > RESULT_AFTER_PRESS) bad(`${where}: the last press is ${s.beat - press.beat} beats back; a result follows its press within ${RESULT_AFTER_PRESS}`)
        if (run && s.beat < run.end - 1e-6) bad(`${where}: shows at beat ${s.beat} but the work above it ends at ${run.end}`)
        break
      default:
    }
    if (s.do === 'type' || s.do === 'caption') {
      if (/\d/.test(s.text) && !spec.sources?.[s.text]) bad(`${where}: "${s.text}" has a number and no entry in spec.sources (where does it come from?)`)
    }
    const end = stepEnd(s, bpm)
    lastEnd = Math.max(lastEnd, end)
    if (s.do !== 'caption') covered.push([s.beat, end])
  })

  // nothing stays quiet for long: the gaps between what moves are short
  covered.sort((a, b) => a[0] - b[0])
  let reach = covered[0][1]
  if (toSeconds(covered[0][0]) > MAX_QUIET_SECONDS) bad(`nothing happens until beat ${covered[0][0]}; start with the first move`)
  for (const [from, to] of covered.slice(1)) {
    if (toSeconds(from - reach) > MAX_QUIET_SECONDS) bad(`nothing changes from beat ${reach} to beat ${from} (${toSeconds(from - reach).toFixed(1)} s); a walkthrough shows something every ${MAX_QUIET_SECONDS} s or less`)
    reach = Math.max(reach, to)
  }
  // the end: the last framing arrives and rests as the end card
  const final = spec.steps.at(-1)
  if (final.do !== 'camera') bad('the last step is a camera move to the framing the film ends on (the end card)')
  const hold = spec.beats - lastEnd
  if (hold < END_HOLD[0] - 1e-6) bad(`the last step ends at beat ${lastEnd} but the film ends at ${spec.beats}; the end card rests at least ${END_HOLD[0]} beats (set beats to ${Math.ceil(lastEnd + END_HOLD[0])} or more)`)
  if (hold > END_HOLD[1] + 1e-6) bad(`the end card rests ${hold} beats (${toSeconds(hold).toFixed(1)} s); more than ${END_HOLD[1]} is a dead hold, so end the film at beat ${Math.ceil(lastEnd + END_HOLD[1])} or add a step`)
  return spec
}
