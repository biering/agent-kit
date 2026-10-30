// The kinetic spec: plain data, no DOM. A film is a list of blocks on the beat grid of its music.
// The browser engine (engine.js) and node (tests, cues.mjs) read the same file, so a spec is checked
// before a frame is drawn and a cue sheet is derived without a browser.
//
//   { title, bpm, beats, fps, size, palette, music, sources, scenes: [{ block, at: [from, to], ... }], captions, cues }
//
// Every time is a beat. `at: [8, 16]` is beat 8 up to beat 16; a tempo change is one number.

export const PALETTE_NAMES = ['bg', 'paper', 'accent', 'hot', 'ink']
export const SHOT_STYLES = ['slam', 'stack', 'split', 'pair', 'cut', 'punch3d']
export const FX = ['punch', 'hit', 'beat', 'none']
export const BLOCKS = ['Words', 'Strike', 'Hero', 'Counters', 'Logo', 'Picture']

// A token the engine fills from the film itself, so the number on screen is the film's own.
export const TOKENS = { '{frames}': (s) => String(Math.round((s.beats * 60 / s.bpm) * (s.fps ?? 60))), '{seconds}': (s) => String(Math.round(s.beats * 60 / s.bpm)), '{beats}': (s) => String(s.beats) }

/** `text` with {frames}, {seconds} and {beats} replaced by the film's own numbers. */
export function fill(text, spec) {
  return String(text).replace(/\{(?:frames|seconds|beats)\}/g, (t) => TOKENS[t](spec))
}

// A cue name for each effect a shot can carry; the sound kit (audio.json) maps names to recorded files.
const FX_CUE = { punch: 'impact', hit: 'hit', beat: 'tick', none: null }

/**
 * The sound cues a scene implies, in beats: [{ beat, name, gain_db? }]. The same rules place the
 * hits in the picture, so the sound follows a change of the film without a second list to edit.
 */
export function cuesOf(scene) {
  const [from, to] = scene.at
  const out = []
  const add = (beat, name, gain_db) => { if (name) out.push({ beat, name, ...(gain_db == null ? {} : { gain_db }) }) }
  if (scene.whipIn) add(from - 0.25, 'whoosh')
  switch (scene.block) {
    case 'Words':
      if (scene.charge) add(scene.shots[0].at, 'riser') // it rises into the first word and peaks on it
      for (const s of scene.shots ?? []) {
        const name = s.cue ?? FX_CUE[s.fx ?? (s.style === 'cut' ? 'beat' : 'punch')]
        // a two-part shot (stack, split, pair) lands its second part on its own beat
        add(s.at + (s.second ?? 0), name, s.gain)
        if (s.in && s.in !== 'cut') add(s.at - 0.25, 'whoosh')
      }
      if (scene.exit?.type === 'zoom') add(scene.exit.at, 'whoosh_big')
      if (scene.exit?.type === 'flash') add(scene.exit.at, 'hit')
      break
    case 'Strike':
      for (const it of scene.items ?? []) { add(it.at + 1, 'impact'); add(it.at + 1.5, 'hit'); add(it.at + 2, 'glitch') }
      break
    case 'Hero':
      add(from + 1, 'whoosh_big'); add(from + 3, 'impact_big'); add(from + 5, 'whoosh')
      break
    case 'Counters':
      for (let i = 0; i < (scene.counters ?? []).length; i++) { add(from + i * 3, 'pop'); add(from + i * 3 + 1, 'tick') }
      break
    case 'Picture':
      add(from, 'impact')
      for (const [beat] of scene.words ?? []) add(from + beat, 'hit')
      break
    case 'Logo':
      add(from + 1, 'logo_hit')
      break
    default:
  }
  return out
}

/** All cues of a spec in beats, sorted: what the blocks imply plus `spec.cues`. */
export function cueSheet(spec) {
  const all = [...spec.scenes.flatMap(cuesOf), ...(spec.cues ?? [])]
  return all.filter((c) => c.beat >= 0 && c.beat < spec.beats).sort((a, b) => a.beat - b.beat || a.name.localeCompare(b.name))
}

// Strings a viewer reads, per block, for the numbers rule below.
function onScreenText(scene) {
  const t = []
  const push = (v) => { if (typeof v === 'string') t.push(v); else if (Array.isArray(v)) v.forEach(push) }
  switch (scene.block) {
    case 'Words': (scene.shots ?? []).forEach((s) => push(s.text)); break
    case 'Strike': push(scene.no); (scene.items ?? []).forEach((i) => { push(i.word); if (i.ui) push([i.ui.title, i.ui.tag, i.ui.rows, i.ui.tiles?.flat()]) }); break
    case 'Hero': push([scene.kicker, scene.title, scene.sub]); break
    case 'Counters': (scene.counters ?? []).forEach(([v, label]) => push([v, label])); break
    case 'Logo': push([scene.wordmark, scene.tagline, scene.small]); break
    case 'Picture': (scene.words ?? []).forEach(([, w]) => push(w)); break
    default:
  }
  return t
}

/**
 * Throws a message that names the scene and the field. Checks that the scenes tile the film, that
 * names resolve, and the numbers rule: any on-screen text with a digit (outside {frames} and
 * friends) must have an entry in `spec.sources` saying where the number comes from.
 */
export function validateSpec(spec) {
  const bad = (m) => { throw new Error(`spec: ${m}`) }
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  if (!spec || typeof spec !== 'object') bad('not an object')
  if (!(num(spec.bpm) && spec.bpm >= 60 && spec.bpm <= 220)) bad('bpm is a number from 60 to 220 (the music\'s measured tempo)')
  if (!(num(spec.beats) && spec.beats > 0)) bad('beats is the film\'s length in beats')
  if (!Array.isArray(spec.scenes) || !spec.scenes.length) bad('scenes is a list of blocks')
  for (const [k, v] of Object.entries(spec.palette ?? {})) if (!PALETTE_NAMES.includes(k) || typeof v !== 'string') bad(`palette.${k}: names are ${PALETTE_NAMES.join(', ')} and values are CSS colours`)
  const colour = (c) => c == null || PALETTE_NAMES.includes(c) || /^#[0-9a-f]{3,8}$/i.test(c)
  let cursor = 0
  spec.scenes.forEach((s, i) => {
    const where = `scenes[${i}] ${s.block ?? '?'}`
    if (!BLOCKS.includes(s.block)) bad(`${where}: block is one of ${BLOCKS.join(', ')}`)
    if (!(Array.isArray(s.at) && s.at.length === 2 && s.at.every(num) && s.at[0] < s.at[1])) bad(`${where}: at is [fromBeat, toBeat]`)
    if (s.at[0] !== cursor) bad(`${where}: starts at beat ${s.at[0]} but the previous scene ends at ${cursor}; scenes tile the film with no gap and no overlap`)
    cursor = s.at[1]
    if (s.block === 'Words') {
      if (!Array.isArray(s.shots) || !s.shots.length) bad(`${where}: shots is a list`)
      let last = -Infinity
      s.shots.forEach((shot, j) => {
        const w = `${where} shots[${j}]`
        if (!SHOT_STYLES.includes(shot.style)) bad(`${w}: style is one of ${SHOT_STYLES.join(', ')}`)
        if (!num(shot.at) || shot.at < s.at[0] || shot.at >= s.at[1]) bad(`${w}: at is a beat inside the scene (${s.at[0]} to ${s.at[1]})`)
        if (shot.at < last) bad(`${w}: shots are in time order`)
        last = shot.at
        if (shot.fx != null && !FX.includes(shot.fx)) bad(`${w}: fx is one of ${FX.join(', ')}`)
        const two = ['stack', 'split', 'pair'].includes(shot.style)
        if (two ? !(Array.isArray(shot.text) && shot.text.length === 2) : typeof shot.text !== 'string') bad(`${w}: text is ${two ? '[first, second]' : 'a string'}`)
        if (!colour(shot.ground) || !colour(shot.color)) bad(`${w}: ground and color are palette names or hex colours`)
      })
    }
    if (s.block === 'Words' && s.exit?.type === 'zoom') {
      const last = s.shots.at(-1)
      if (!['slam', 'cut'].includes(last.style)) bad(`${where}: a zoom exit flies into the last shot's word, so the last shot is a slam or a cut (not ${last.style})`)
      if (!Number.isInteger(s.exit.char) || s.exit.char < 0 || s.exit.char >= last.text.length) bad(`${where}: exit.char is the index of a letter of "${last.text}"`)
    }
    if (s.block === 'Strike' && !(Array.isArray(s.items) && s.items.length)) bad(`${where}: items is a list of { at, word, ui }`)
    if (s.block === 'Counters') {
      if (!(Array.isArray(s.counters) && s.counters.length)) bad(`${where}: counters is a list of [value, label]`)
      s.counters.forEach(([value], j) => {
        if (!/^\{(?:frames|seconds|beats)\}$/.test(String(value)) && /\d/.test(String(value)) && !spec.sources?.[value]) bad(`${where} counters[${j}]: "${value}" is a number with no entry in spec.sources; a launch film's claims get checked`)
      })
    }
    if (s.block === 'Picture' && typeof s.src !== 'string') bad(`${where}: src is the picture's path`)
    // the numbers rule: a digit on screen is the film's own or has a named source
    for (const text of onScreenText(s)) {
      const plain = text.replace(/\{(?:frames|seconds|beats)\}/g, '')
      if (/\d/.test(plain) && !spec.sources?.[text]) bad(`${where}: on-screen "${text}" has a number and no entry in spec.sources (where does it come from?)`)
    }
  })
  if (cursor !== spec.beats) bad(`scenes end at beat ${cursor} but beats is ${spec.beats}`)
  for (const [j, c] of (spec.captions ?? []).entries()) {
    if (!(Array.isArray(c.at) && c.at.length === 2 && c.at.every(num))) bad(`captions[${j}]: at is [fromBeat, toBeat]; captions are timed in beats`)
    for (const [word, beat] of c.words ?? []) {
      if (typeof word !== 'string' || !num(beat)) bad(`captions[${j}]: words are [word, beat]`)
      if (/\d/.test(word) && !spec.sources?.[word]) bad(`captions[${j}]: "${word}" has a number and no entry in spec.sources`)
    }
  }
  return spec
}
