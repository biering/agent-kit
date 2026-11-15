#!/usr/bin/env node
/**
 * Speak a film's voice lines with ElevenLabs (references/session.md, and the repo's notes in
 * docs/agent-kit/video.md).
 *
 *   node .agents/skills/video/scripts/speak.mjs <film-folder> --lang=de                  # the price: nothing is sent
 *   node .agents/skills/video/scripts/speak.mjs <film-folder> --lang=de --yes            # after the user's yes
 *        [--voice=<voice id>] [--model=eleven_multilingual_v2] [--to=<folder>] [--level=-15]
 *   node .agents/skills/video/scripts/speak.mjs --voices                                 # free
 *
 * Speech is paid, so a run prices first. Without `--yes` it prints the characters it would send
 * and what the account has left (GET /v1/user/subscription), and sends nothing. ElevenLabs bills
 * at least every character of every line; each line also carries its neighbours as context, and
 * whether that is billed too is not documented, so both counts are printed. A run with `--yes`
 * prints the same, refuses when the account has fewer characters left than the lines alone, and
 * prints what ElevenLabs reports it charged (the `character-cost` header) when it is done.
 * `--voices` lists voices and costs nothing.
 *
 * The lines are the `text` of every entry of `voice.<lang>` in <film-folder>/cues.json. Each line
 * is sent with the line before it and the line after it, so it is spoken as part of one read and
 * not as six separate sentences. What comes back loses the silence before its first word and
 * after its last (voice.mjs places a line by the start of its file and holds the music down for
 * its length) and is written as 48 kHz mono wav to the entry's `file`, or under `--to` with the
 * same file names when a voice is only being tried.
 *
 * Every line gets the same gain, the one that brings the read as a whole to `--level` LUFS
 * (default -15): the lines keep their weight against each other, and the voice carries the
 * loudness of the mix, so voice.mjs needs no `gain_db` and a gain near 0 dB.
 *
 * The voice is the film's own, `voice.speaker` in cues.json ({ "voice": "<id>", "model": "<id>" }, or one
 * such per language: { "de": {...}, "en": {...} }),
 * unless `--voice` names another one to try. It prints how long each line is and the slot it has,
 * to the next line or the end of the film. `--voices` lists the account's voices, with the models
 * each is verified on for German.
 *
 * The key is ELEVENLABS_API_KEY, from the environment or else from a `.env` in the working
 * directory.
 *
 * No line is replaced before every line is spoken, trimmed and levelled: a run that fails leaves
 * the film's voice as it was.
 *
 * Exit 0 = written (or the voices listed), 1 = ElevenLabs or ffmpeg failed, 2 = invalid input (a
 * line without text, no key, too few characters left), 3 = priced and not sent: run again with
 * --yes once the user has said yes.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { deliver, ffmpeg, FfmpegError, masterGain, parseLoudness, soundLength, voiceLines } from './voice.mjs'

const USAGE = `usage: speak.mjs <film-folder> --lang=<lang> [--yes] [--voice=<voice id>] [--model=<model id>] [--to=<folder>] [--level=<LUFS>]
       speak.mjs --voices`
const API = 'https://api.elevenlabs.io'
/** The model every premade voice is verified on for German; a voice verified on a newer one can name it. */
export const MODEL = 'eleven_multilingual_v2'
/** Where the read as a whole sits, in LUFS: a little under the film's -14, which the mix then reaches with a gain near 0. */
export const LEVEL = -15
/** The same read every time, as far as the model allows: a second run of an unchanged sheet should not change the film. */
const SEED = 20261114
/** An id goes into the URL: nothing but what ElevenLabs issues. */
const VOICE_ID = /^[A-Za-z0-9]+$/
/** Cuts what is quieter than speech off the start of a file; reversed, off its end. */
const TRIM = 'silenceremove=start_periods=1:start_threshold=-45dB'
/** A calm read that stays the same from line to line; no style exaggeration. */
const SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true }

/**
 * The command line → { filmDir, lang, voice, model, to, level, yes } or { voices: true }; voice and
 * model are null where the film's own are meant, and `yes` is false unless the run may spend
 * characters. Throws on anything it cannot read.
 */
export function parseSpeakArgs(argv) {
  const paths = argv.filter((a) => !a.startsWith('--'))
  const flags = {}
  for (const arg of argv.filter((a) => a.startsWith('--'))) {
    const [, key, value] = /^--([a-z]+)(?:=(.*))?$/.exec(arg) ?? []
    if (!['lang', 'voice', 'model', 'to', 'level', 'voices', 'yes'].includes(key)) throw new Error(`unknown flag ${arg}`)
    if (key in flags) throw new Error(`--${key} is given twice`)
    flags[key] = value
  }
  if ('voices' in flags) {
    if (flags.voices !== undefined || paths.length || Object.keys(flags).length > 1) throw new Error('--voices stands alone')
    return { voices: true }
  }
  if (paths.length !== 1) throw new Error(`expected one film folder, got ${paths.length} path(s)`)
  if (!/^[a-z0-9-]+$/.test(flags.lang ?? '')) throw new Error(`--lang takes lowercase letters, digits and hyphens, got "${flags.lang ?? ''}"`)
  if ('voice' in flags && !VOICE_ID.test(flags.voice ?? '')) throw new Error(`--voice takes a voice id (--voices lists them), got "${flags.voice ?? ''}"`)
  if ('model' in flags && !/^[a-z0-9_.]+$/.test(flags.model ?? '')) throw new Error(`--model takes a model id, got "${flags.model ?? ''}"`)
  if ('to' in flags && !flags.to) throw new Error('--to takes a folder')
  if ('yes' in flags && flags.yes !== undefined) throw new Error('--yes takes no value')
  const level = 'level' in flags ? Number(flags.level) : LEVEL
  if (!Number.isFinite(level) || level > -6 || level < -40 || flags.level === '') throw new Error(`--level takes LUFS between -40 and -6, got "${flags.level ?? ''}"`)
  return { filmDir: paths[0], lang: flags.lang, voice: flags.voice ?? null, model: flags.model ?? null, to: flags.to ?? null, level, yes: 'yes' in flags }
}

/** The film's own speaker for a language: `voice.speaker.<lang>`, else `voice.speaker` itself. */
export const ownSpeaker = (spec, lang) => spec.voice?.speaker?.[lang] ?? spec.voice?.speaker ?? {}

/** Who speaks: the voice and model asked for on the command line, else the film's own for the plan's language, else the default model. */
export function speaker(plan, spec) {
  const own = ownSpeaker(spec, plan.lang)
  const voice = plan.voice ?? own.voice
  if (!voice) throw new Error('no voice: name one with --voice, or set voice.speaker.<lang> (or voice.speaker) in cues.json (--voices lists the account\'s)')
  if (!VOICE_ID.test(voice)) throw new Error(`cues.json: voice.speaker.voice is not a voice id, got "${voice}"`)
  return { voice, model: plan.model ?? own.model ?? MODEL }
}

/** The lines to speak, in the order they start: [{ t, file, text }]. Every line of the sheet needs a text. */
export function spokenLines(spec, lang) {
  const sheet = spec.voice?.[lang] ?? []
  const lines = voiceLines(spec, lang)
  if (!lines.length) throw new Error(`cues.json has no voice.${lang}`)
  return lines.map((line) => {
    const text = sheet.find((entry) => entry.file === line.file)?.text
    if (typeof text !== 'string' || !text.trim()) throw new Error(`cues.json: the ${lang} line ${line.file} has no "text"`)
    return { t: line.t, file: line.file, text: text.trim() }
  })
}

/** Seconds each line has before the next one starts, the last one before the film ends. */
export function slots(lines, filmDuration) {
  return lines.map((line, i) => (lines[i + 1]?.t ?? filmDuration) - line.t)
}

/** What ElevenLabs is asked for line `i`: its text, and the lines either side of it for the tone of one read. */
export function speakRequest(lines, i, model = MODEL) {
  return {
    text: lines[i].text,
    model_id: model,
    voice_settings: SETTINGS,
    seed: SEED,
    ...(i > 0 ? { previous_text: lines[i - 1].text } : {}),
    ...(i < lines.length - 1 ? { next_text: lines[i + 1].text } : {}),
  }
}

/** Where a line is written: its own `file` in the film folder, or the same file name under `to` when a voice is tried. */
export function speakTarget(filmDir, file, to) {
  return to ? path.join(to, path.basename(file)) : path.join(filmDir, file)
}

/** What ElevenLabs said went wrong, as one line: its `detail` is a text, an object with a message, or a list of them. */
export function apiDetail(detail, fallback) {
  if (typeof detail === 'string') return detail
  if (typeof detail?.message === 'string') return detail.message
  return detail == null ? fallback : JSON.stringify(detail)
}

/**
 * The variables of a `.env` file, parsed simply: `KEY=value` or `export KEY=value` a line, a value
 * in single or double quotes taken as it stands, `#` lines and blank lines skipped. No expansion.
 */
export function parseEnv(text) {
  const vars = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    const quoted = /^(['"])(.*)\1$/.exec(m[2])
    vars[m[1]] = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '')
  }
  return vars
}

/** A key from the environment, else from the `.env` in `cwd`; undefined when neither has it. The environment wins. */
export function envKey(name, env = process.env, cwd = process.cwd()) {
  if (env[name]) return env[name]
  const file = path.join(cwd, '.env')
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8'))[name] || undefined : undefined
}

/**
 * What a read costs before a character is sent: `text` is every line's own characters, which
 * ElevenLabs bills; `context` the neighbours sent along with each (previous_text and next_text),
 * which it may bill too.
 */
export function characters(lines, model = MODEL) {
  const requests = lines.map((_, i) => speakRequest(lines, i, model))
  const text = requests.reduce((sum, r) => sum + r.text.length, 0)
  const context = requests.reduce((sum, r) => sum + (r.previous_text?.length ?? 0) + (r.next_text?.length ?? 0), 0)
  return { text, context }
}

/**
 * The pre-flight: what the run would spend and whether it may. `quota` is the account's
 * { used, limit } (null when it could not be read), `yes` the user's approval from the command
 * line. Returns { send, lines } with the lines to print; `send` is false without `--yes`, and
 * false when the account has fewer characters left than the lines alone.
 */
export function preflight(cost, quota, yes) {
  const left = quota ? quota.limit - quota.used : null
  const lines = [
    `price: at least ${cost.text} characters (the lines), ${cost.text + cost.context} if ElevenLabs also bills the ${cost.context} characters of context`,
    left === null ? 'quota: unknown (GET /v1/user/subscription did not answer)' : `quota: ${left} of ${quota.limit} characters left this period`,
  ]
  if (left !== null && left < cost.text) return { send: false, short: true, lines: [...lines, `refused: the account has ${left} characters left and the lines need ${cost.text}`] }
  if (!yes) return { send: false, short: false, lines: [...lines, 'nothing sent: this needs the user\'s yes; run again with --yes'] }
  return { send: true, short: false, lines }
}

/** The account's characters this period, { used, limit }, or null when the key may not read it. */
async function quota(key) {
  try {
    const { character_count: used, character_limit: limit } = await (await elevenlabs('/v1/user/subscription', key)).json()
    return Number.isFinite(used) && Number.isFinite(limit) ? { used, limit } : null
  } catch {
    return null
  }
}

async function elevenlabs(pathname, key, body) {
  let res
  try {
    res = await fetch(`${API}${pathname}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'xi-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch (err) {
    throw new FfmpegError(`ElevenLabs did not answer: ${err.message}`)
  }
  if (!res.ok) throw new FfmpegError(`ElevenLabs answered ${res.status}: ${apiDetail((await res.json().catch(() => ({}))).detail, res.statusText)}`)
  return res
}

async function listVoices(key) {
  const { voices = [] } = await (await elevenlabs('/v2/voices?page_size=100', key)).json()
  for (const v of voices) {
    const german = (v.verified_languages ?? []).filter((l) => l.language === 'de').map((l) => l.model_id)
    const said = [v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.language, v.labels?.use_case].filter(Boolean).join(', ')
    console.log(`${v.voice_id}  ${v.name}  [${v.category}${said ? `; ${said}` : ''}]  German: ${german.includes(MODEL) ? MODEL : german[0] ?? 'not verified'}`)
  }
}

async function main(argv) {
  let plan, spec, lines, who
  try {
    plan = parseSpeakArgs(argv)
  } catch (err) {
    console.error(`✗ ${err.message}\n${USAGE}`)
    return 2
  }
  const key = envKey('ELEVENLABS_API_KEY')
  try {
    if (plan.voices) {
      if (!key) {
        console.error('✗ ELEVENLABS_API_KEY is not set (the environment, or .env in the working directory)')
        return 2
      }
      await listVoices(key)
      return 0
    }
    try {
      spec = JSON.parse(readFileSync(path.join(plan.filmDir, 'cues.json'), 'utf8'))
      lines = spokenLines(spec, plan.lang)
      who = speaker(plan, spec)
    } catch (err) {
      console.error(`✗ ${plan.filmDir}: ${err.message}`)
      return 2
    }
    const filmDuration = 'duration_beats' in spec ? (spec.duration_beats * 60) / spec.bpm : spec.duration
    if (!(filmDuration > 0)) {
      console.error(`✗ ${plan.filmDir}: cues.json needs "duration_beats" (with "bpm") or "duration", or the last line has no slot`)
      return 2
    }
    const cost = characters(lines, who.model)
    if (!key) {
      console.log(`price: at least ${cost.text} characters (the lines), ${cost.text + cost.context} with the context`)
      console.error('✗ ELEVENLABS_API_KEY is not set (the environment, or .env in the working directory)')
      return 2
    }
    const gate = preflight(cost, await quota(key), plan.yes)
    for (const line of gate.lines) console.log(line)
    if (!gate.send) return gate.short ? 2 : 3
    const targets = lines.map((line) => speakTarget(plan.filmDir, line.file, plan.to))
    const tmp = mkdtempSync(path.join(tmpdir(), 'video-speak-'))
    try {
      // a folder that cannot be made is found out before a character is paid for
      try {
        for (const target of targets) mkdirSync(path.dirname(target), { recursive: true })
      } catch (err) {
        throw new FfmpegError(`cannot write to ${plan.to ?? plan.filmDir}: ${err.message}`)
      }
      const raw = []
      let charged = 0
      for (const [i, line] of lines.entries()) {
        const res = await elevenlabs(`/v1/text-to-speech/${who.voice}?output_format=mp3_44100_128`, key, speakRequest(lines, i, who.model))
        charged += Number(res.headers.get('character-cost')) || 0
        const mp3 = path.join(tmp, `${i}.mp3`)
        writeFileSync(mp3, Buffer.from(await res.arrayBuffer()))
        raw.push(path.join(tmp, `${i}.wav`))
        // voice.mjs places a line by the start of its file, so the first word has to be
        // there; and a line is as long as its last word, or the half second of room tone the model
        // adds would count against its slot and hold the music down.
        ffmpeg(['-v', 'error', '-i', mp3, '-af', `${TRIM}:start_silence=0.03,areverse,${TRIM}:start_silence=0.08,areverse,aresample=48000`, '-ac', '1', '-c:a', 'pcm_f32le', raw[i]])
        // a line that came back as silence has nothing left after the trim
        try {
          soundLength(raw[i])
        } catch {
          throw new FfmpegError(`ElevenLabs returned no speech for ${path.basename(line.file)} ("${line.text}")`)
        }
      }
      // one measurement over the whole read, one gain for every line
      const joined = `${raw.map((_, i) => `[${i}:a]`).join('')}concat=n=${raw.length}:v=0:a=1,ebur128=peak=true[out]`
      const read = parseLoudness(ffmpeg([...raw.flatMap((f) => ['-i', f]), '-filter_complex', joined, '-map', '[out]', '-f', 'null', '-']))
      const gain = masterGain(read.integrated, plan.level)
      // every line levelled before the first one is put in place: a failure up to here changes nothing
      const levelled = raw.map((file, i) => {
        const out = path.join(tmp, `${i}.out.wav`)
        // a limiter under the gain: a wav has no room above full scale
        ffmpeg(['-v', 'error', '-i', file, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.891:level=false:attack=5:release=50`, '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', out])
        return { out, lasts: soundLength(out) }
      })
      const given = slots(lines, filmDuration)
      for (const [i, line] of lines.entries()) {
        try {
          deliver(levelled[i].out, targets[i])
        } catch (err) {
          throw new FfmpegError(`${targets[i]} could not be written: ${err.message}`)
        }
        console.log(`${path.basename(line.file)}  ${levelled[i].lasts.toFixed(2)} s of ${given[i].toFixed(2)} s  ${line.text}`)
        if (levelled[i].lasts > given[i]) console.error(`! ${path.basename(line.file)} runs ${(levelled[i].lasts - given[i]).toFixed(2)} s past its slot: shorten the line or move the next one`)
      }
      console.log(`${lines.length} line(s) in "${plan.lang}" by voice ${who.voice} with ${who.model}, read at ${read.integrated.toFixed(1)} LUFS and set to ${plan.level} (gain ${gain.toFixed(1)} dB) → ${plan.to ?? path.join(plan.filmDir, path.dirname(lines[0].file))}`)
      if (charged) console.log(`charged: ${charged} characters, as ElevenLabs reports them`)
      if (!plan.to && plan.voice && plan.voice !== ownSpeaker(spec, plan.lang).voice) console.error(`! the film's lines are now spoken by ${who.voice}, which is not the voice cues.json names: set voice.speaker.${plan.lang}, or try a voice with --to`)
      return 0
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  } catch (err) {
    if (!(err instanceof FfmpegError)) throw err
    console.error(`✗ ${err.message}`)
    return 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err); process.exit(2) })
}
