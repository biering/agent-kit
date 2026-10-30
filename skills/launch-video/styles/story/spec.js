// The story spec: plain data, no DOM. A film is a list of scenes on the beat grid of its music, a list
// of pictures (plates) the scenes point at, and the lines of text that run over them. The browser
// engine (engine.js) and node (tests, cues.mjs) read this one file, so a spec is checked before a
// frame is drawn and a cue sheet is derived without a browser.
//
//   { title, bpm, beats, fps, size, palette, font, logo, music, sources,
//     plates: [{ id, src?, css?, prompt?, reference?, checked }],
//     scenes: [{ block, at: [from, to], ... }],      // Plate, Title, Turn, Card: tile the film (a Plate's cutIns: [[beat, scale, [x, y], [x, y]?]])
//     lines:  [{ at: [from, to], words: [[word, beat, tone?], ...], place? }], cues }
//
// Every time is a beat. `at: [8, 16]` is beat 8 up to beat 16; a tempo change is one number.

export const PALETTE_NAMES = ['bg', 'paper', 'accent', 'ink']
export const BLOCKS = ['Plate', 'Title', 'Turn', 'Card'] // Line is not a scene: spec.lines runs over them
export const TURN_KINDS = ['flood', 'flip', 'hit']
export const PLACES = ['low', 'mid', 'high']
export const MAX_WORDS = 5 // a line is read, not studied
export const HOOK_SECONDS = 2 // the first text lands inside this
export const CUTS_PER_10S = [2, 6] // slower than kinetic: a shot is looked at
export const DWELL_SECONDS = 0.8 // a finished line stays whole this long before it leaves
export const EXIT_SECONDS = 0.35 // and takes this long to leave
export const MIN_PUSH = 1.04 // under this a plate has no bleed for the sway and the pan

const num = (v) => typeof v === 'number' && Number.isFinite(v)
const str = (v) => typeof v === 'string' && v.trim() !== ''
const point = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => num(n) && n >= 0 && n <= 1)
const words = (s) => s.trim().split(/\s+/)

/** True when the scene at index i takes over from the one before without a visible cut. */
function seamless(scenes, i) {
  return i === 0 || scenes[i - 1].block === 'Turn' || (scenes[i].block === 'Turn' && scenes[i].kind === 'flood')
}

/** Every hard cut in beats, sorted: scene starts that are not handoffs, and each cut-in on a plate. */
export function cutBeats(spec) {
  const out = new Set()
  spec.scenes.forEach((s, i) => {
    if (!seamless(spec.scenes, i)) out.add(s.at[0])
    for (const [beat] of s.cutIns ?? []) out.add(beat)
  })
  return [...out].sort((a, b) => a - b)
}

/** The cut rate the style is judged by. The end card rests, so the rate is counted before it. */
export function pacing(spec) {
  const card = spec.scenes.find((s) => s.block === 'Card')
  const end = card ? card.at[0] : spec.beats
  const seconds = (end * 60) / spec.bpm
  const cuts = cutBeats(spec).filter((b) => b < end)
  return { cuts, seconds, per10s: seconds ? (cuts.length / seconds) * 10 : 0 }
}

/** Seconds into the film of the first text a viewer reads (a line's first word or a title's). */
export function firstTextSeconds(spec) {
  const beats = [
    ...(spec.lines ?? []).map((l) => l.words?.[0]?.[1]),
    ...spec.scenes.filter((s) => s.block === 'Title').map((s) => s.at[0] + (s.start ?? 0.5)),
  ].filter(num)
  return beats.length ? (Math.min(...beats) * 60) / spec.bpm : Infinity
}

/**
 * The sound cues the scenes imply, in beats: [{ beat, name, gain_db? }]. A swell peaks on each camera
 * cut, a quieter swish on each cut-in, a riser into the turn and a hit on it, a chime on the end card.
 * The same rules place the pictures, so the sound follows a change of the film without a second list.
 */
export function cueSheet(spec) {
  const out = [{ beat: 0, name: 'room' }]
  const add = (beat, name, gain_db) => out.push({ beat, name, ...(gain_db == null ? {} : { gain_db }) })
  spec.scenes.forEach((s, i) => {
    const [from] = s.at
    if ((s.block === 'Plate' || s.block === 'Title') && !seamless(spec.scenes, i)) add(from, 'whoosh')
    for (const [beat] of s.cutIns ?? []) add(beat, 'swish')
    if (s.block === 'Turn') {
      if (s.kind !== 'hit') add(from, 'riser') // it peaks on the turn
      add(from, 'hit')
    }
    if (s.block === 'Card') add(from + 0.5, 'chime') // on the wordmark landing
  })
  const all = [...out, ...(spec.cues ?? [])]
  return all.filter((c) => c.beat >= 0 && c.beat < spec.beats).sort((a, b) => a.beat - b.beat || a.name.localeCompare(b.name))
}

/**
 * Throws `spec: <where>: <what>`. Checks the film's structure (scenes tile the beat grid, one turn on
 * a bar line, the end card last), the pictures (a generated one is checked at 100% for brand marks),
 * the text (five words a line, a hook inside 2 s, time to read), the cut rate, and the numbers rule:
 * any on-screen text with a digit needs an entry in `spec.sources` saying where the number comes from.
 */
export function validateSpec(spec) {
  const bad = (m) => { throw new Error(`spec: ${m}`) }
  if (!spec || typeof spec !== 'object') bad('not an object')
  if (!(num(spec.bpm) && spec.bpm >= 60 && spec.bpm <= 220)) bad('bpm is a number from 60 to 220 (the music\'s measured tempo)')
  if (!(Number.isInteger(spec.beats) && spec.beats > 0)) bad('beats is the film\'s length in whole beats')
  if (spec.fps != null && !(num(spec.fps) && spec.fps >= 12 && spec.fps <= 120)) bad('fps is a number from 12 to 120')
  if (spec.size != null && !(Array.isArray(spec.size) && spec.size.length === 2 && spec.size.every((n) => Number.isInteger(n) && n >= 360 && n <= 4096 && n % 2 === 0))) bad('size is [width, height], even whole pixels from 360 to 4096')
  for (const [k, v] of Object.entries(spec.palette ?? {})) if (!PALETTE_NAMES.includes(k) || !str(v)) bad(`palette.${k}: names are ${PALETTE_NAMES.join(', ')} and values are CSS colours`)
  for (const [k, v] of Object.entries(spec.font ?? {})) if (!['serif', 'sans'].includes(k) || !str(v)) bad(`font.${k}: keys are serif and sans, values are CSS font-family lists`)
  if (spec.logo != null && !str(spec.logo)) bad('logo is the path of the brand\'s SVG mark')
  for (const [k, v] of Object.entries(spec.sources ?? {})) if (!str(v)) bad(`sources["${k}"]: say where the number comes from`)
  const colour = (c) => c == null || PALETTE_NAMES.includes(c) || /^#[0-9a-f]{3,8}$/i.test(c)
  const numbers = (where, text) => {
    if (/\d/.test(text) && !spec.sources?.[text]) bad(`${where}: on-screen "${text}" has a number and no entry in spec.sources (where does it come from?)`)
  }

  if (spec.music != null) {
    const m = spec.music
    if (!str(m.file)) bad('music.file is the path of the track')
    if (!num(m.start) || m.start < 0) bad('music.start is the second of the track that plays at beat 0 (beats.py --drop-beat)')
    for (const k of ['gain_db', 'stop_beat', 'fade_out']) if (m[k] != null && !num(m[k])) bad(`music.${k} is a number`)
  }
  for (const [j, c] of (spec.cues ?? []).entries()) {
    if (!(num(c.beat) && c.beat >= 0 && c.beat <= spec.beats) || !str(c.name)) bad(`cues[${j}]: { beat inside the film, name from the kit }`)
  }

  // plates: the pictures the scenes point at
  const plateIds = new Set()
  const PLATE_KEYS = ['id', 'src', 'css', 'prompt', 'reference', 'checked']
  const plates = spec.plates ?? []
  if (!Array.isArray(plates)) bad('plates is a list of { id, src?, css?, prompt?, reference?, checked }')
  plates.forEach((p, j) => {
    const w = `plates[${j}]${p?.id ? ` "${p.id}"` : ''}`
    if (!p || typeof p !== 'object') bad(`${w}: not an object`)
    for (const k of Object.keys(p)) if (!PLATE_KEYS.includes(k)) bad(`${w}: unknown key "${k}" (${PLATE_KEYS.join(', ')})`)
    if (!/^[a-z][a-z0-9-]*$/.test(p.id ?? '')) bad(`${w}: id is a lower-case name like window-night`)
    if (plateIds.has(p.id)) bad(`${w}: id is used twice`)
    plateIds.add(p.id)
    if (p.src == null && p.css == null) bad(`${w}: needs src (a picture) or css (a plate drawn in CSS)`)
    if (p.src != null) {
      if (!str(p.src)) bad(`${w}: src is the picture's path in the repo`)
      // a render must not depend on the network: a picture is a file the repo serves
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(p.src) && !/^data:image\//i.test(p.src)) bad(`${w}: src is a file in the repo, not a URL (a render must not need the network)`)
      if (p.checked !== true) bad(`${w}: a picture needs checked: true, set only after someone looked at it at 100% for makers' logos and brand marks`)
    }
    if (p.css != null) {
      const layers = typeof p.css === 'string' ? [{ css: p.css }] : p.css
      if (!Array.isArray(layers) || !layers.length) bad(`${w}: css is a string or a list of { css, depth? } layers, back to front`)
      layers.forEach((L, k) => {
        if (!str(L?.css)) bad(`${w}: css[${k}].css is a string of CSS declarations`)
        if (L.depth != null && !(num(L.depth) && L.depth >= 0 && L.depth <= 1)) bad(`${w}: css[${k}].depth is 0 (far) to 1 (near)`)
      })
    }
    for (const k of ['prompt', 'reference']) if (p[k] != null && !str(p[k])) bad(`${w}: ${k} is a string`)
  })

  // scenes
  if (!Array.isArray(spec.scenes) || !spec.scenes.length) bad('scenes is a list of Plate, Title, Turn and Card')
  const scenes = spec.scenes
  let cursor = 0
  let turns = 0
  scenes.forEach((s, i) => {
    const where = `scenes[${i}] ${s?.block ?? '?'}`
    if (!BLOCKS.includes(s?.block)) bad(`${where}: block is one of ${BLOCKS.join(', ')}`)
    if (!(Array.isArray(s.at) && s.at.length === 2 && s.at.every(Number.isInteger) && s.at[0] < s.at[1])) bad(`${where}: at is [fromBeat, toBeat], whole beats (a cut lands on the beat)`)
    if (s.at[0] !== cursor) bad(`${where}: starts at beat ${s.at[0]} but the previous scene ends at ${cursor}; scenes tile the film with no gap and no overlap`)
    cursor = s.at[1]
    const [from, to] = s.at
    if (s.block !== 'Plate' && s.cutIns != null) bad(`${where}: cutIns belong to a Plate`)
    if (s.block === 'Plate') {
      if (!plateIds.has(s.plate)) bad(`${where}: plate "${s.plate}" is not in plates (${[...plateIds].join(', ') || 'none defined'})`)
      if (to - from < 2) bad(`${where}: a plate runs at least 2 beats`)
      if (s.push != null && !(Array.isArray(s.push) && s.push.length === 2 && s.push.every((n) => num(n) && n >= MIN_PUSH && n <= 3))) bad(`${where}: push is [fromScale, toScale], each ${MIN_PUSH} to 3 (the plate is pushed, never parked)`)
      if (s.pan != null && !(Array.isArray(s.pan) && s.pan.length === 2 && s.pan.every(point))) bad(`${where}: pan is [[x, y], [x, y]] in 0 to 1 across the plate: where the frame's centre starts and ends`)
      if (s.tone != null && !['dark', 'light'].includes(s.tone)) bad(`${where}: tone is dark (light type) or light (ink type)`)
      if (s.shade != null && !(num(s.shade) && s.shade >= 0 && s.shade <= 0.9)) bad(`${where}: shade is 0 to 0.9, the scrim behind the lines`)
      let last = from
      ;(s.cutIns ?? []).forEach((c, j) => {
        const w = `${where} cutIns[${j}]`
        if (!(Array.isArray(c) && (c.length === 3 || c.length === 4) && Number.isInteger(c[0]) && num(c[1]) && point(c[2]) && (c.length === 3 || point(c[3])))) bad(`${w}: [beat, scale, [x, y]] with a whole beat, and an optional fourth [x, y] for where it ends`)
        if (c[0] <= last || c[0] >= to) bad(`${w}: beat ${c[0]} is a whole beat after ${last} and inside the scene (${from} to ${to}), in time order`)
        if (c[1] < MIN_PUSH || c[1] > 4) bad(`${w}: scale is ${MIN_PUSH} to 4`)
        last = c[0]
      })
    }
    if (s.block === 'Title') {
      if (!str(s.text) || words(s.text).length > MAX_WORDS) bad(`${where}: text is one to ${MAX_WORDS} words`)
      if (!colour(s.ground) || !colour(s.color)) bad(`${where}: ground and color are palette names or hex colours`)
      for (const k of ['start', 'every']) if (s[k] != null && !(num(s[k]) && s[k] >= 0 && s[k] % 0.5 === 0)) bad(`${where}: ${k} is beats in halves (0.5, 1, ...)`)
      if (from + (s.start ?? 0.5) + (words(s.text).length - 1) * (s.every ?? 0.5) >= to) bad(`${where}: the last word lands after the scene ends`)
      numbers(where, s.text)
    }
    if (s.block === 'Turn') {
      turns++
      if (!TURN_KINDS.includes(s.kind)) bad(`${where}: kind is one of ${TURN_KINDS.join(', ')}`)
      if (from % 4 !== 0) bad(`${where}: the turn starts on a bar line (a multiple of 4 beats), not beat ${from}`)
      if (to - from > 4) bad(`${where}: the turn is a moment, 4 beats at most`)
      if (scenes[i + 1]?.block !== 'Plate') bad(`${where}: the scene after the turn is a Plate (the turn hands over to a picture)`)
      if (s.kind === 'flood') {
        if (scenes[i - 1]?.block !== 'Plate') bad(`${where}: a flood grows out of the Plate before it`)
        if (s.origin != null && !point(s.origin)) bad(`${where}: origin is [x, y] in 0 to 1 across the frame: where the colour starts`)
        if (s.dur != null && !(num(s.dur) && s.dur >= 0.5 && s.dur <= to - from)) bad(`${where}: dur is 0.5 beats up to the turn's length`)
      }
      if (!colour(s.color)) bad(`${where}: color is a palette name or a hex colour`)
    }
    if (s.block === 'Card') {
      if (i !== scenes.length - 1) bad(`${where}: the end card is the last scene`)
      if (to - from < 5) bad(`${where}: the end card runs at least 5 beats (mark, line, call to action, then a rest)`)
      for (const k of ['wordmark', 'line', 'cta']) if (!str(s[k])) bad(`${where}: ${k} is a string (mark, one line, one call to action)`)
      if (words(s.line).length > 12) bad(`${where}: line is one line, 12 words at most`)
      if (s.small != null && !str(s.small)) bad(`${where}: small is a string`)
      if (!colour(s.ground)) bad(`${where}: ground is a palette name or a hex colour`)
      for (const k of ['wordmark', 'line', 'cta', 'small']) if (s[k]) numbers(`${where} ${k}`, s[k])
    }
  })
  if (cursor !== spec.beats) bad(`scenes end at beat ${cursor} but beats is ${spec.beats}`)
  if (scenes.at(-1).block !== 'Card') bad('the film ends on a Card: the mark, one line, one call to action')
  if (turns !== 1) bad(`a story has one turn and this has ${turns}: add or remove a Turn scene`)

  // lines
  const lines = spec.lines ?? []
  if (!Array.isArray(lines)) bad('lines is a list of { at: [from, to], words: [[word, beat], ...] }')
  const cardAt = scenes.at(-1).at[0]
  let free = 0
  lines.forEach((ln, j) => {
    const w = `lines[${j}]`
    if (!(Array.isArray(ln.at) && ln.at.length === 2 && ln.at.every(num) && ln.at[0] < ln.at[1])) bad(`${w}: at is [fromBeat, toBeat]; lines are timed in beats`)
    if (ln.at[0] < free) bad(`${w}: starts at beat ${ln.at[0]} before the previous line has left (beat ${free}); one line at a time`)
    if (ln.at[1] > cardAt) bad(`${w}: runs into the end card (beat ${cardAt}), which carries its own text`)
    free = ln.at[1]
    if (ln.place != null && !PLACES.includes(ln.place)) bad(`${w}: place is one of ${PLACES.join(', ')}`)
    if (!Array.isArray(ln.words) || !ln.words.length || ln.words.length > MAX_WORDS) bad(`${w}: words is one to ${MAX_WORDS} [word, beat] pairs; a longer line is two lines`)
    let prev = -Infinity
    for (const [k, entry] of ln.words.entries()) {
      if (!Array.isArray(entry)) bad(`${w} words[${k}]: [word, beat] or [word, beat, tone]`)
      const [word, beat, tone] = entry
      if (!str(word) || /\s/.test(word)) bad(`${w} words[${k}]: one word, as a string`)
      if (!(num(beat) && (beat * 2) % 1 === 0)) bad(`${w} words[${k}]: "${word}" lands on a beat or a half beat`)
      if (beat < ln.at[0] || beat <= prev) bad(`${w} words[${k}]: "${word}" at beat ${beat} is inside the line (from ${ln.at[0]}) and after the word before it`)
      if (tone != null && !['accent', 'ink', 'paper'].includes(tone)) bad(`${w} words[${k}]: tone is accent, ink or paper`)
      prev = beat
      if (/\d/.test(word) && !spec.sources?.[word] && !spec.sources?.[ln.words.map(([x]) => x).join(' ')]) bad(`${w} words[${k}]: "${word}" has a number and no entry in spec.sources`)
    }
    const read = ((ln.at[1] - prev) * 60) / spec.bpm
    if (read < DWELL_SECONDS + EXIT_SECONDS) bad(`${w}: the last word lands ${read.toFixed(2)} s before the line ends; it needs ${(DWELL_SECONDS + EXIT_SECONDS).toFixed(2)} s (${DWELL_SECONDS} s to read, ${EXIT_SECONDS} s to leave)`)
  })

  // pacing: the style's two measurable rules
  const first = firstTextSeconds(spec)
  if (first > HOOK_SECONDS) bad(`hook: the first text lands at ${Number.isFinite(first) ? `${first.toFixed(1)} s` : 'never'}; a story puts a line on screen inside ${HOOK_SECONDS} s`)
  const p = pacing(spec)
  const [lo, hi] = CUTS_PER_10S
  if (p.per10s < lo || p.per10s > hi) bad(`pacing: ${p.cuts.length} hard cuts in ${p.seconds.toFixed(1)} s is ${p.per10s.toFixed(1)} per 10 s; a story runs ${lo} to ${hi} (cuts at beats ${p.cuts.join(', ') || 'none'})`)
  return spec
}
