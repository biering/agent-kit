#!/usr/bin/env node
/**
 * Lay a film's voice-over on its mixed cut (references/session.md, and the repo's notes in
 * docs/agent-kit/video.md).
 *
 *   node .agents/skills/video/scripts/voice.mjs <film-folder> <mixed.mp4> <out.mp4> --lang=de
 *
 * <mixed.mp4> is what the skill's mix.py wrote: the film with its music and effects. The lines
 * are in <film-folder>/cues.json, under a key mix.py does not read:
 *
 *   "voice": {
 *     "duck_db": -9,
 *     "de": [{ "beat": 2, "file": "voice/de/01.wav", "gain_db": 0 }, { "t": 9.5, "file": "voice/de/02.wav" }],
 *     "en": []
 *   }
 *
 * A line starts on `beat` (with the sheet's `bpm`, like a cue) or at `t` seconds; its file
 * resolves from the film folder. While a line plays, the film's own sound is lowered by `duck_db`
 * (default -9), over 0.25 s on either side, and two lines less than 0.5 s apart share one dip, so
 * the music does not pump between them. The dip is a gain computed from the sheet, not a
 * compressor keyed by the voice: the same sheet gives the same mix.
 *
 * The mix is mastered to mix.py's target, -14 LUFS with a true peak of -1 dBTP, by one gain
 * measured on the mix and a limiter for the peaks that gain lifts too high. Not by loudnorm: the
 * bed is already mastered, the dips make the mix quieter, and the gain that makes up for them
 * puts the bed's own peaks past -1 dBTP, where loudnorm stops scaling and starts riding the level
 * between the lines. The picture is copied, and the loudness and true peak of the file written
 * are measured and printed, with the gain applied and what the limiter had to take off the peaks.
 *
 * A language without lines is not an error: <mixed.mp4> is copied to <out.mp4>. A line that runs
 * into the next one or past the end of the film is a warning, and so is a mix the limiter has to
 * take more than 3 dB off: a line, or the film's sound between the lines, is too hot for the rest.
 *
 * <out.mp4> is written whole or not at all: the film is mastered in a temp folder and put under
 * its name once it holds the target, so a run that fails leaves no half-made film where the
 * upload would find it.
 *
 * Exit 0 = written, 1 = ffmpeg failed or the file could not be written, 2 = invalid input (a
 * missing file, a line without a time).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = 'usage: voice.mjs <film-folder> <mixed.mp4> <out.mp4> --lang=<lang>'

export const DUCK_DB = -9
/** Seconds the bed takes to go down before a line, and to come back after it. */
export const RAMP = 0.25
/** Two lines closer than this share one dip. Twice the ramp: any closer and the bed would turn round before it was back up. */
export const GAP = 2 * RAMP
/** mix.py's target: -14 LUFS integrated, true peak -1 dBTP. */
export const TARGET = { lufs: -14, peak: -1 }
/** dB off the highest peak beyond which the limiter is doing the mix's work: a line or the bed is too hot. */
export const LIMITED = 3
/** Samples per step of the dip: 5 ms at 48 kHz, 0.2 dB a step on the default ramp. ffmpeg's own frames of 1024 would take it in 12 steps. */
const STEP = 256

/** What ffmpeg, ffprobe or a write could not do: exit 1, where a bad sheet is exit 2. */
export class FfmpegError extends Error {}

/** The lines of one language, in the order they start: [{ t, file, gainDb }], t in seconds. [] when the film has no voice in it. */
export function voiceLines(spec, lang) {
  const lines = spec.voice?.[lang] ?? []
  if (!Array.isArray(lines)) throw new Error(`cues.json: voice.${lang} is not a list of lines`)
  return lines
    .map((line, i) => {
      // the same rule as mix.py's cues: a beat needs the film's tempo
      if ('beat' in line && !(spec.bpm > 0)) throw new Error('"beat" needs a top-level "bpm"')
      const t = 'beat' in line ? (line.beat * 60) / spec.bpm : line.t
      if (!Number.isFinite(t) || t < 0) throw new Error(`cues.json: voice.${lang}[${i}] needs "beat" or "t", at 0 or later`)
      if (typeof line.file !== 'string' || !line.file) throw new Error(`cues.json: voice.${lang}[${i}] needs a "file"`)
      if (!Number.isFinite(line.gain_db ?? 0)) throw new Error(`cues.json: voice.${lang}[${i}] has a "gain_db" that is not a number`)
      return { t, file: line.file, gainDb: line.gain_db ?? 0 }
    })
    .sort((a, b) => a.t - b.t)
}

/** How far the bed goes down under a line, in dB: voice.duck_db, 0 or below. */
export function duckDepth(spec) {
  const db = spec.voice?.duck_db ?? DUCK_DB
  if (!Number.isFinite(db) || db > 0) throw new Error(`cues.json: voice.duck_db lowers the film's sound, so it is 0 or below, got ${JSON.stringify(db)}`)
  return db
}

/** A warning for every line that is still speaking when the next one starts or when the film ends. `durations` are the lines' lengths in seconds. */
export function overruns(lines, durations, filmDuration) {
  const warnings = []
  const name = (line) => `${line.file} (at ${line.t.toFixed(2)} s)`
  lines.forEach((line, i) => {
    const end = line.t + durations[i]
    const next = lines[i + 1]
    // under the two decimals printed, a line is on time
    if (next && end - next.t >= 0.005) warnings.push(`${name(line)} runs ${(end - next.t).toFixed(2)} s into ${name(next)}`)
    if (end - filmDuration >= 0.005) warnings.push(`${name(line)} runs ${(end - filmDuration).toFixed(2)} s past the end of the film`)
  })
  return warnings
}

/** When the bed is down: one [start, end] per line, and one for several lines less than `gap` apart. */
export function duckIntervals(lines, durations, gap = GAP) {
  const intervals = []
  for (const [start, end] of lines.map((line, i) => [line.t, line.t + durations[i]]).sort((a, b) => a[0] - b[0])) {
    const last = intervals.at(-1)
    if (last && start - last[1] < gap) last[1] = Math.max(last[1], end)
    else intervals.push([start, end])
  }
  return intervals
}

/** The bed's gain at second `t`, in dB: `duckDb` inside an interval, 0 away from one, a straight line over `ramp` seconds between. */
export function duckGain(t, intervals, duckDb = DUCK_DB, ramp = RAMP) {
  const depth = intervals.reduce((sum, [start, end]) => sum + Math.min(1, Math.max(0, Math.min(t - (start - ramp), end + ramp - t) / ramp)), 0)
  return duckDb * Math.min(1, depth)
}

/** duckGain as the expression ffmpeg's `volume` filter evaluates on every frame, as a linear gain. */
export function duckExpression(intervals, duckDb = DUCK_DB, ramp = RAMP) {
  // `t-(-0.15)` is written `t+0.15`: a dip may begin before the film does
  const minus = (x) => (x < 0 ? `+${-x}` : `-${x}`)
  const dips = intervals.map(([start, end]) => `clip(min(t${minus(start - ramp)},${end + ramp}-t)/${ramp},0,1)`)
  return `pow(10,${duckDb / 20}*min(1,${dips.join('+') || '0'}))`
}

/**
 * The mix as an ffmpeg filter graph: input 0 is the mixed film, inputs 1… are the lines in order.
 * The bed is ducked, every line is set to its gain and delayed to its start, the lines are summed
 * to one voice bus, and bed and voice are mixed, both sums without amix's own levelling. Out: [a].
 */
export function voiceGraph(lines, intervals, duckDb = DUCK_DB, ramp = RAMP) {
  const chains = [`[0:a]aresample=48000,aformat=channel_layouts=stereo,asetnsamples=n=${STEP}:p=0,volume='${duckExpression(intervals, duckDb, ramp)}':eval=frame[bed]`]
  lines.forEach((line, i) => {
    const ms = Math.round(line.t * 1000)
    chains.push(`[${i + 1}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${line.gainDb}dB,adelay=${ms}|${ms}[l${i}]`)
  })
  chains.push(`${lines.map((_, i) => `[l${i}]`).join('')}amix=inputs=${lines.length}:normalize=0[voice]`)
  // the film's own sound sets the length: a line past the end is cut with it
  chains.push('[bed][voice]amix=inputs=2:normalize=0:duration=first,aformat=channel_layouts=stereo[a]')
  return chains.join(';')
}

/** Integrated loudness (LUFS) and true peak (dBTP) from the summary `ebur128=peak=true` logs. */
export function parseLoudness(log) {
  const summary = log.slice(log.lastIndexOf('Summary:'))
  const integrated = /\bI:\s+(-?[\d.]+) LUFS/.exec(summary)
  const peak = /\bPeak:\s+(-?[\d.]+) dBFS/.exec(summary)
  if (!integrated || !peak) throw new FfmpegError('ffmpeg measured no loudness: is the mix silent?')
  return { integrated: Number(integrated[1]), truePeak: Number(peak[1]) }
}

/** The one gain, in dB, that takes a mix measured at `integrated` LUFS to the target: the same all through the film. */
export function masterGain(integrated, target = TARGET.lufs) {
  return target - integrated
}

/** dB the limiter has to take off the highest peak to hold the target: how far the gain lifts the premix's true peak above it. Never below 0. */
export function limited(premixPeak, gain, target = TARGET.peak) {
  return Math.max(0, premixPeak + gain - target)
}

/**
 * Put a finished file under its final name, whole or not at all: copied to a hidden name beside
 * it, then renamed onto it. A copy that fails half-way leaves `out` as it was, never a broken film
 * under the name the upload looks for.
 */
export function deliver(file, out) {
  const part = path.join(path.dirname(out), `.${path.basename(out)}.part`)
  try {
    copyFileSync(file, part)
    renameSync(part, out)
  } finally {
    rmSync(part, { force: true })
  }
}

/** Seconds of a file that has sound, by ffprobe. */
export function soundLength(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', file], { encoding: 'utf8' })
  if (r.error || r.status !== 0) throw new Error(`ffprobe could not read ${file}: ${r.error?.message ?? r.stderr.trim()}`)
  const { streams = [], format = {} } = JSON.parse(r.stdout)
  if (!streams.some((s) => s.codec_type === 'audio') || !(Number(format.duration) > 0)) throw new Error(`${file} has no sound`)
  return Number(format.duration)
}

/** Run ffmpeg and return what it logged; throws FfmpegError with the end of that log when it fails. */
export function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-y', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (r.error || r.status !== 0) throw new FfmpegError(`ffmpeg failed: ${r.error?.message ?? r.stderr.trim().split('\n').slice(-4).join('\n  ')}`)
  return r.stderr
}

function main(argv) {
  const paths = argv.filter((a) => !a.startsWith('--'))
  const flags = argv.filter((a) => a.startsWith('--'))
  const lang = flags[0]?.startsWith('--lang=') ? flags[0].slice('--lang='.length) : ''
  if (paths.length !== 3 || flags.length !== 1 || !/^[a-z0-9-]+$/.test(lang)) {
    console.error(USAGE)
    return 2
  }
  const [filmDir, mixed, out] = paths
  let spec, lines, duck, durations, filmDuration
  try {
    try {
      spec = JSON.parse(readFileSync(path.join(filmDir, 'cues.json'), 'utf8'))
    } catch (err) {
      throw new Error(`${filmDir}: no readable cues.json (${err.message})`)
    }
    if (!existsSync(mixed)) throw new Error(`${mixed} is missing: render and mix first`)
    if (path.resolve(mixed) === path.resolve(out)) throw new Error(`${out} is the mixed film itself: the voiced cut needs its own name`)
    const outDir = path.dirname(path.resolve(out))
    if (!existsSync(outDir) || !statSync(outDir).isDirectory()) throw new Error(`${path.dirname(out)} is not a folder: there is nowhere to write ${path.basename(out)}`)
    lines = voiceLines(spec, lang)
    duck = duckDepth(spec)
    durations = lines.map((line) => {
      if (!existsSync(path.join(filmDir, line.file))) throw new Error(`${line.file} is missing in ${filmDir}`)
      return soundLength(path.join(filmDir, line.file))
    })
    if (lines.length) filmDuration = soundLength(mixed)
  } catch (err) {
    console.error(`✗ ${err.message}`)
    return 2
  }

  const written = (err) => {
    console.error(`✗ ${out} could not be written, and is as it was: ${err.message}`)
    return 1
  }
  if (!lines.length) {
    try {
      deliver(mixed, out)
    } catch (err) {
      return written(err)
    }
    console.log(`${out}: the film has no voice in "${lang}", copied from ${mixed}`)
    return 0
  }
  for (const warning of overruns(lines, durations, filmDuration)) console.error(`! ${warning}`)

  // Premix and every pass of the master stay in a temp folder: the film's folder gets the
  // finished file or nothing, since whatever .mp4 lies there is what the upload files.
  const tmp = mkdtempSync(path.join(tmpdir(), 'video-voice-'))
  try {
    const premix = path.join(tmp, 'premix.wav')
    const master = path.join(tmp, 'master.mp4')
    const graph = voiceGraph(lines, duckIntervals(lines, durations), duck)
    ffmpeg(['-v', 'error', '-i', mixed, ...lines.flatMap((line) => ['-i', path.join(filmDir, line.file)]), '-filter_complex', graph, '-map', '[a]', '-c:a', 'pcm_f32le', premix])
    // one measurement, one gain: the bed between two lines is as steady as mix.py left it
    const premixed = parseLoudness(ffmpeg(['-nostats', '-i', premix, '-af', 'ebur128=peak=true', '-f', 'null', '-']))
    const gain = masterGain(premixed.integrated)
    // mix.py's ceiling search: AAC adds up to 1.5 dB to a limited peak, so limit, encode, measure
    // the file, and lower the limiter by the excess until the true peak is at the target or under
    let ceiling = TARGET.peak - 0.5
    let loudness
    for (let pass = 0; pass < 5; pass++) {
      const chain = `aformat=channel_layouts=stereo,volume=${gain.toFixed(2)}dB,alimiter=limit=${(10 ** (ceiling / 20)).toFixed(4)}:level=false:attack=5:release=50:asc=1`
      ffmpeg(['-v', 'error', '-i', mixed, '-i', premix, '-map', '0:v', '-map', '1:a', '-af', chain,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', spec.audio_bitrate ?? '256k', '-movflags', '+faststart', '-shortest', master])
      loudness = parseLoudness(ffmpeg(['-nostats', '-i', master, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']))
      if (loudness.truePeak <= TARGET.peak) break
      ceiling -= loudness.truePeak - TARGET.peak + 0.2
    }
    if (loudness.truePeak > TARGET.peak) throw new FfmpegError(`true peak is ${loudness.truePeak} dBTP after 5 passes, not ${TARGET.peak}: turn the loudest line down`)
    try {
      deliver(master, out)
    } catch (err) {
      return written(err)
    }
    const cut = limited(premixed.truePeak, gain)
    console.log(`${out}: ${loudness.integrated.toFixed(1)} LUFS integrated, true peak ${loudness.truePeak.toFixed(1)} dBTP, ${lines.length} voice line(s) in "${lang}" (gain ${gain.toFixed(1)} dB, ${cut.toFixed(1)} dB off the peaks)`)
    // ffmpeg measures in tenths of a dB: compare in tenths, so 3.0 is not "more than 3" by a rounding error
    if (Math.round(cut * 10) > LIMITED * 10) console.error(`! the limiter takes ${cut.toFixed(1)} dB off the loudest peaks to hold ${TARGET.peak} dBTP: a line, or the film's sound between the lines, is too hot for the rest of the mix`)
    return 0
  } catch (err) {
    if (!(err instanceof FfmpegError)) throw err
    console.error(`✗ ${err.message}\n  ${out} is as it was`)
    return 1
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
