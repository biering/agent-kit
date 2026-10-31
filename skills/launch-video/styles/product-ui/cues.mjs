#!/usr/bin/env node
// The product-ui cue sheet: spec.js + this style's audio.json → cues.json for mix.py.
//
//   node cues.mjs films/2026-10-29-slug/spec.js [--out films/2026-10-29-slug/cues.json]
//
// The steps imply their sounds (spec.js cueSheet: a click per press, a keystroke per typed character,
// a tick per checked row, a chime for a result, a whoosh per camera move); the spec's own `cues` add
// the film's jokes. Every cue is in beats, and the sheet carries the tempo, so a tempo change is one
// edit in the spec. Licensed audio is listed in `sources`, never committed: mix.py downloads it.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { cueSheet, validateSpec } from './spec.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const sfxUrl = (id) => `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`

/** The cues.json object for a spec and a kit (audio.json). Throws on a cue the kit has no sound for. */
export function buildCues(spec, audio) {
  validateSpec(spec)
  const sources = {}
  const cues = cueSheet(spec).map((c) => {
    const k = audio.kit[c.name]
    if (!k) throw new Error(`no sound in the kit for the cue "${c.name}" (kit: ${Object.keys(audio.kit).join(', ')})`)
    const file = `sfx/${k.mixkit}.mp3`
    sources[file] = sfxUrl(k.mixkit)
    return { beat: c.beat, file, gain_db: c.gain_db ?? k.gain_db, ...(k.anchor ? { anchor: k.anchor } : {}) }
  })
  const out = { bpm: spec.bpm, duration_beats: spec.beats, normalise_sfx: true }
  if (spec.music) {
    const { file, source, start, gain_db, fade_out } = spec.music
    out.music = { file, start, gain_db: gain_db ?? audio.gain_db, ...(fade_out != null ? { fade_out } : {}) }
    if (source) sources[file] = source
  }
  return { ...out, sources, cues }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1] }
  if (!argv[0] || argv[0].startsWith('--')) {
    console.error('usage: cues.mjs <spec.js> [--out cues.json]')
    process.exit(2)
  }
  const specPath = resolve(argv[0])
  const spec = (await import(pathToFileURL(specPath).href)).default
  const audio = JSON.parse(readFileSync(join(HERE, 'audio.json'), 'utf8'))
  const out = resolve(flag('out', join(dirname(specPath), 'cues.json')))
  const sheet = buildCues(spec, audio)
  writeFileSync(out, `${JSON.stringify(sheet, null, 2)}\n`)
  console.log(`${out}: ${sheet.cues.length} cues, ${Object.keys(sheet.sources).length} sources`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch((e) => {
    console.error(`cues: ${e.message}`)
    process.exit(1)
  })
}
