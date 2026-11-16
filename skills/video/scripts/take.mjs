#!/usr/bin/env node
/**
 * Turn a screen recording into the footage of a session film (references/session.md, and the
 * repo's notes in docs/agent-kit/video.md): a JPEG frame sequence the film's `seek(t)` page draws,
 * and `take.<lang>.json`, the facts that page maps a second and a pixel of the recording onto
 * those frames with. The arithmetic is styles/session/core.js, which the page loads.
 *
 *   node .agents/skills/video/scripts/take.mjs <film-folder> <recording> --lang=de [--from=3.2] [--to=48]
 *        [--crop=x,y,w,h] [--blur=x,y,w,h[@from-to]]... [--width=2400] [--fps=30]
 *   node .agents/skills/video/scripts/take.mjs <film-folder> <recording> --lang=de --sheet [--every=0.5]
 *   node .agents/skills/video/scripts/take.mjs <film-folder> <recording> --lang=de --still=12.5
 *
 * Every number is measured on the SOURCE recording, seconds from its start and pixels of its
 * frame, so the `moments` and `regions` written into take.<lang>.json by hand survive a second
 * ingest with another trim or crop: the ingest replaces everything else in the file and keeps
 * those two.
 *
 * Ingest: blur the `--blur` boxes (always, or between two timestamps), crop, scale down to
 * `--width`, resample to `--fps`, and write `f00001.jpg`… into `<film-folder>/takes/<lang>/`.
 * The frames are cut into a folder beside that one and swapped in when ffmpeg is done, so a
 * failed ingest leaves the old frames and the old take.<lang>.json as they were. The recording
 * itself must lie outside `takes/<lang>/`, which the swap replaces.
 * The blur comes before the crop and is burnt into the frames: what it hides never reaches the
 * film. A timed `--blur` read off a contact sheet starts at the last tile that does not show the
 * thing yet and ends at the first tile that no longer shows it. Tiles are `--every` seconds
 * apart, so a window from the first tile that shows it to the last one leaves it sharp for up to
 * that long on either side.
 * `--sheet` draws contact sheets of the whole recording, one tile every `--every` seconds, to read
 * moments off: `takes/<lang>-sheet-01.png`…, with each tile's second burnt in where this ffmpeg
 * has `drawtext` and printed as a grid where it has not.
 * `--still` writes the full frame at one second, to measure a crop, a blur box or a region on:
 * `takes/<lang>-still-<seconds>.png`.
 *
 * Exit 0 = done, 1 = ffmpeg failed, 2 = invalid input (a missing file, a bad flag, a crop or blur
 * outside the frame, a recording inside the folder its own ingest replaces).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = `usage: take.mjs <film-folder> <recording> --lang=<lang> [--from=<s>] [--to=<s>] [--crop=x,y,w,h] [--blur=x,y,w,h[@from-to]]... [--width=2400] [--fps=30]
       take.mjs <film-folder> <recording> --lang=<lang> --sheet [--every=0.5]
       take.mjs <film-folder> <recording> --lang=<lang> --still=<s>`

/** A contact sheet: 6 tiles across, 5 down, each about this wide. */
export const SHEET = { cols: 6, rows: 5, tile: 480 }
/** boxblur's radius has to stay under half the box's short side, so a box needs a few pixels to blur at all. */
const BLUR = { radius: 24, power: 4, min: 4 }
/** Flags that shape the frames: a sheet and a still show the recording as it is. */
const INGEST_ONLY = ['from', 'to', 'crop', 'blur', 'width', 'fps']

const seconds = (flag, value) => {
  if (!/^\d+(\.\d+)?$/.test(value ?? '')) throw new Error(`--${flag} takes seconds, got "${value ?? ''}"`)
  return Number(value)
}
const box = (flag, value) => {
  const parts = (value ?? '').split(',')
  if (parts.length !== 4 || !parts.every((p) => /^\d+$/.test(p))) throw new Error(`--${flag} takes x,y,w,h in whole source pixels, got "${value ?? ''}"`)
  return parts.map(Number)
}

/**
 * The command line → what to do: { filmDir, recording, lang, mode: 'ingest' | 'sheet' | 'still', … }.
 * Throws on anything it cannot read, never guesses: every number here ends up in a frame.
 */
export function parseTakeArgs(argv) {
  const plan = { filmDir: null, recording: null, lang: null, mode: 'ingest', from: 0, to: null, crop: null, blur: [], width: 2400, fps: 30, every: 0.5, still: null }
  const paths = argv.filter((a) => !a.startsWith('--'))
  if (paths.length !== 2) throw new Error(`expected a film folder and a recording, got ${paths.length} path(s)`)
  ;[plan.filmDir, plan.recording] = paths
  const seen = new Set()
  for (const arg of argv.filter((a) => a.startsWith('--'))) {
    const [, key, value] = /^--([a-z]+)(?:=(.*))?$/.exec(arg) ?? []
    if (!key) throw new Error(`unknown flag ${arg}`)
    if (key !== 'blur' && seen.has(key)) throw new Error(`--${key} is given twice`)
    seen.add(key)
    if (key === 'lang') {
      if (!/^[a-z0-9-]+$/.test(value ?? '')) throw new Error(`--lang takes lowercase letters, digits and hyphens, got "${value ?? ''}"`)
      plan.lang = value
    } else if (key === 'from' || key === 'to' || key === 'still') {
      plan[key] = seconds(key, value)
    } else if (key === 'crop') {
      plan.crop = box(key, value)
      if (!plan.crop[2] || !plan.crop[3]) throw new Error(`--crop needs a width and a height, got "${value}"`)
    } else if (key === 'blur') {
      const [rect, span, ...rest] = (value ?? '').split('@')
      const [x, y, w, h] = box(key, rect)
      if (w < BLUR.min || h < BLUR.min) throw new Error(`--blur needs a box of at least ${BLUR.min} px a side, got "${value}"`)
      const [, a, b] = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(span ?? '') ?? []
      if (rest.length || (span !== undefined && !(Number(a) < Number(b)))) throw new Error(`--blur takes x,y,w,h or x,y,w,h@from-to in source seconds, got "${value}"`)
      plan.blur.push([x, y, w, h, span === undefined ? null : Number(a), span === undefined ? null : Number(b)])
    } else if (key === 'width') {
      if (!/^[1-9]\d*$/.test(value ?? '')) throw new Error(`--width takes whole pixels, got "${value ?? ''}"`)
      plan.width = Number(value)
    } else if (key === 'fps' || key === 'every') {
      plan[key] = seconds(key, value)
      if (!plan[key]) throw new Error(`--${key} must be above 0`)
    } else if (key === 'sheet' && value === undefined) {
      plan.mode = 'sheet'
    } else {
      throw new Error(`unknown flag ${arg}`)
    }
  }
  if (!plan.lang) throw new Error('--lang is required (de, de-reel, en, en-reel)')
  if (seen.has('sheet') && seen.has('still')) throw new Error('--sheet and --still are two runs')
  if (seen.has('still')) plan.mode = 'still'
  const stray = plan.mode === 'ingest' ? [] : INGEST_ONLY.filter((k) => seen.has(k))
  if (stray.length) throw new Error(`--${stray[0]} shapes an ingest: a ${plan.mode} shows the recording as it is`)
  if (seen.has('every') && plan.mode !== 'sheet') throw new Error('--every goes with --sheet')
  if (plan.to !== null && plan.to <= plan.from) throw new Error(`--to=${plan.to} is not after --from=${plan.from}`)
  return plan
}

/** Size and length of a recording's video stream, by ffprobe. */
export function probeSource(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration:format=duration', '-of', 'json', file], { encoding: 'utf8' })
  if (r.error || r.status !== 0) throw new Error(`ffprobe could not read ${file}: ${r.error?.message ?? r.stderr.trim()}`)
  const { streams = [], format = {} } = JSON.parse(r.stdout)
  // a webm or mkv stream carries no length of its own
  const duration = Number(streams[0]?.duration) || Number(format.duration)
  if (!streams[0]?.width || !streams[0]?.height || !(duration > 0)) throw new Error(`${file} has no video stream`)
  return { width: streams[0].width, height: streams[0].height, duration }
}

/** What in the plan does not fit the recording ({ width, height, duration }), one line each; [] when it all does. */
export function validateTake(plan, source) {
  const errors = []
  const inside = ([x, y, w, h]) => x + w <= source.width && y + h <= source.height
  const frame = `the ${source.width}x${source.height} frame`
  if (plan.crop && !inside(plan.crop)) errors.push(`--crop=${plan.crop.join(',')} reaches outside ${frame}`)
  for (const blur of plan.blur) if (!inside(blur)) errors.push(`--blur=${blur.slice(0, 4).join(',')} reaches outside ${frame}`)
  const length = `the recording is ${source.duration.toFixed(2)} s long`
  if (plan.mode === 'ingest' && plan.from >= source.duration) errors.push(`--from=${plan.from}: ${length}`)
  if (plan.to !== null && plan.to > source.duration) errors.push(`--to=${plan.to}: ${length}`)
  if (plan.mode === 'still' && plan.still >= source.duration) errors.push(`--still=${plan.still}: ${length}`)
  return errors
}

/**
 * The ingest as an ffmpeg filter graph, with the crop and the frame size it comes to:
 * { graph, crop, width, height }. In order: blur, crop, scale, resample.
 */
export function takeFilter(plan, source) {
  const crop = plan.crop ?? [0, 0, source.width, source.height]
  // never upscale: a frame wider than the pixels recorded only costs disk
  const width = Math.min(plan.width, crop[2])
  const height = Math.round((crop[3] * width) / crop[2] / 2) * 2
  // RGB planes: on 4:2:0 a crop or a box on an odd pixel is rounded to the even one beside it,
  // and the regions measured on the recording would be a pixel off the frames
  const chains = []
  let head = '[0:v]format=gbrp'
  if (plan.blur.length) {
    chains.push(`${head},split=${plan.blur.length + 1}[v0]${plan.blur.map((_, i) => `[b${i}]`).join('')}`)
    plan.blur.forEach(([x, y, w, h, from, to], i) => {
      // blurred from its own pixels only, so nothing beside the box bleeds in and nothing in it out
      const radius = Math.min(BLUR.radius, Math.floor((Math.min(w, h) - 1) / 2))
      chains.push(`[b${i}]crop=${w}:${h}:${x}:${y},boxblur=${radius}:${BLUR.power}[k${i}]`)
      // `t` is still the recording's own clock here: the trim comes after
      chains.push(`[v${i}][k${i}]overlay=${x}:${y}:format=gbrp${from === null ? '' : `:enable='between(t,${from},${to})'`}[v${i + 1}]`)
    })
    head = `[v${plan.blur.length}]`
  }
  chains.push(
    [
      `${head}${plan.blur.length ? '' : ','}crop=${crop[2]}:${crop[3]}:${crop[0]}:${crop[1]}`,
      // JPEG is BT.601 full range to everything that decodes it; left to itself ffmpeg keeps the
      // recording's BT.709 and every colour is a shade off (a violet #564fff comes out #5441f3)
      `scale=${width}:${height}:flags=lanczos:out_color_matrix=bt601:out_range=pc`,
      'format=yuvj420p',
      // Frame n is what the screen showed at from + (n - 1) / fps, the rule styles/session/core.js
      // reads a frame back by. A screen recording has no frame while nothing moves, so the cut is
      // made by the resampler, which holds the last frame at or before each tick (round=up), not
      // by a seek, which drops it.
      `setpts=PTS-${plan.from}/TB`,
      `fps=fps=${plan.fps}:start_time=0:round=up`,
      ...(plan.to === null ? [] : [`trim=end=${+(plan.to - plan.from).toFixed(6)}`]),
    ].join(',') + '[out]',
  )
  return { graph: chains.join(';'), crop, width, height }
}

/** The seconds a contact sheet shows, one per tile, as written on it: '0.0', '0.5', '1.0'… while the recording lasts. */
export function sheetTimes(duration, every) {
  const places = (String(every).split('.')[1] ?? '').length
  return Array.from({ length: Math.ceil(duration / every) }, (_, i) => (i * every).toFixed(places))
}

/** One sheet's seconds laid out like its tiles, for an ffmpeg that cannot burn them in. */
export function sheetLegend(times, cols = SHEET.cols) {
  const wide = Math.max(...times.map((t) => t.length))
  const rows = []
  for (let i = 0; i < times.length; i += cols) rows.push(`  ${times.slice(i, i + cols).map((t) => t.padStart(wide)).join('  ')}`)
  return rows.join('\n')
}

/** The contact sheets as an ffmpeg filter graph. `font` is a font file for drawtext, '' for its default, null for an ffmpeg without it. */
export function sheetFilter(every, font) {
  // the second with two decimals, from the tile's own timestamp
  const label = "%{eif\\:floor(round(t*100)/100)\\:d}.%{eif\\:mod(round(t*100)\\,100)\\:d\\:2}"
  const stamp = font === null ? [] : [`drawtext=${font ? `fontfile='${font}':` : ''}text='${label}':x=6:y=6:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=6`]
  return `[0:v]${[`fps=fps=1/${every}:start_time=0:round=up`, `scale=${SHEET.tile}:-2:flags=lanczos`, ...stamp, `tile=${SHEET.cols}x${SHEET.rows}:padding=4:margin=4`].join(',')}[out]`
}

/** A second ingest replaces what the ingest measured and keeps what a person did: moments and regions. */
export function mergeTake(existing, fresh) {
  return { ...fresh, moments: existing?.moments ?? {}, regions: existing?.regions ?? {} }
}

/** Moments and regions this trim or crop no longer holds: the film would clamp to the nearest frame or edge and say nothing. */
export function outsideTake(take) {
  const end = take.from + take.frames / take.fps
  const [cx, cy, cw, ch] = take.crop
  const cut = ([x, y, w, h]) => x < cx || y < cy || x + w > cx + cw || y + h > cy + ch
  return [
    ...Object.entries(take.moments).filter(([, at]) => at < take.from || at > end).map(([name]) => `moment "${name}"`),
    ...Object.entries(take.regions).filter(([, rect]) => Array.isArray(rect) && cut(rect)).map(([name]) => `region "${name}"`),
  ]
}

/** take.<lang>.json as text: two spaces, and a list of numbers on one line, the way a region is written by hand. */
export function formatTake(take) {
  const flat = /\[\n\s*(?:-?[\d.e+-]+|null)(?:,\n\s*(?:-?[\d.e+-]+|null))*\n\s*\]/g
  return `${JSON.stringify(take, null, 2).replace(flat, (list) => list.replace(/\[\n\s*/, '[').replace(/\n\s*\]/, ']').replace(/,\n\s*/g, ', '))}\n`
}

/** A font file for drawtext: '' leaves it to fontconfig, null means this ffmpeg has no drawtext. */
function sheetFont() {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' })
  if (!/\sdrawtext\s/.test(r.stdout ?? '')) return null
  const fonts = ['/System/Library/Fonts/Menlo.ttc', '/System/Library/Fonts/Helvetica.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf']
  return fonts.find((f) => existsSync(f)) ?? ''
}

/** The take.<lang>.json already there, or undefined. One that does not parse stops the ingest: it holds moments nobody wants to measure twice. */
function readTake(file) {
  if (!existsSync(file)) return undefined
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`${file} is not JSON (${err.message}): mend it first, the ingest keeps its moments and regions`)
  }
}

/** The folder the frames of a take are cut into, beside the one they end up in: `takes/.<lang>-ingest`. */
const ingestDir = (takes, lang) => path.join(takes, `.${lang}-ingest`)

/**
 * Whether a recording lies in a folder its own ingest removes: the take's frames (`<takes>/<lang>/`)
 * or the folder they are cut into. The ingest would delete the file it is reading.
 */
export function recordingInTake(recording, takes, lang) {
  return [path.join(takes, lang), ingestDir(takes, lang)].some((folder) => {
    const below = path.relative(path.resolve(folder), path.resolve(recording))
    return !path.isAbsolute(below) && below.split(path.sep)[0] !== '..'
  })
}

/**
 * Cut the frames into a folder beside the take's and swap it in when they are all there, so an
 * ingest that fails leaves the old frames, and with them the old take.<lang>.json, as they were.
 * `run(folder)` writes the frames and says whether it worked. Returns how many frames the take
 * now has; 0 when nothing was swapped.
 */
export function ingestFrames(takes, lang, run) {
  const dir = path.join(takes, lang)
  const fresh = ingestDir(takes, lang)
  // what a run that was killed left behind
  rmSync(fresh, { recursive: true, force: true })
  mkdirSync(fresh, { recursive: true })
  try {
    const frames = run(fresh) ? readdirSync(fresh).filter((f) => /^f\d{5}\.jpg$/.test(f)).length : 0
    if (!frames) return 0
    rmSync(dir, { recursive: true, force: true })
    renameSync(fresh, dir)
    return frames
  } finally {
    rmSync(fresh, { recursive: true, force: true })
  }
}

/** A path as the summary prints it: from the working directory when it is under it, as it was given when it is elsewhere. */
export function shownPath(file, cwd = process.cwd()) {
  const relative = path.relative(cwd, file)
  return relative.startsWith('..') ? file : relative || '.'
}

/** Run ffmpeg in `cwd` with its progress line; false when it failed. Output names are relative, so a `%` in a folder name is not a frame pattern. */
function ffmpeg(args, cwd) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-v', 'error', '-stats', '-y', ...args], { cwd, stdio: ['ignore', 'inherit', 'inherit'] })
  if (r.error) console.error(`✗ ffmpeg did not start: ${r.error.message}`)
  return !r.error && r.status === 0
}

function main(argv) {
  let plan, source, recording, existing
  try {
    plan = parseTakeArgs(argv)
  } catch (err) {
    console.error(`✗ ${err.message}\n${USAGE}`)
    return 2
  }
  const takeFile = path.join(plan.filmDir, `take.${plan.lang}.json`)
  const takes = path.join(plan.filmDir, 'takes')
  try {
    if (!existsSync(plan.filmDir) || !statSync(plan.filmDir).isDirectory()) throw new Error(`${plan.filmDir} is not a folder`)
    if (!existsSync(plan.recording) || !statSync(plan.recording).isFile()) throw new Error(`${plan.recording} is not a file`)
    recording = path.resolve(plan.recording)
    // compared by their real paths: on a Mac /tmp and /private/tmp are one folder
    const realTakes = existsSync(takes) ? realpathSync(takes) : path.join(realpathSync(plan.filmDir), 'takes')
    if (plan.mode === 'ingest' && recordingInTake(realpathSync(recording), realTakes, plan.lang))
      throw new Error(`${plan.recording} lies in takes/${plan.lang}/, which the ingest replaces with the frames: move the recording out of it first`)
    source = probeSource(recording)
    const errors = validateTake(plan, source)
    if (errors.length) throw new Error(errors.join('\n✗ '))
    // read before a frame is touched
    if (plan.mode === 'ingest') existing = readTake(takeFile)
  } catch (err) {
    console.error(`✗ ${err.message}`)
    return 2
  }
  const rel = (file) => shownPath(file)

  if (plan.mode === 'still') {
    mkdirSync(takes, { recursive: true })
    const name = `${plan.lang}-still-${plan.still}.png`
    // a tick a millisecond wide, starting at the second asked for: the frame on screen then
    if (!ffmpeg(['-i', recording, '-filter_complex', `[0:v]fps=fps=1000:start_time=${plan.still}:round=up[out]`, '-map', '[out]', '-fps_mode', 'passthrough', '-frames:v', '1', '-update', '1', name], takes)) return 1
    console.log(`${rel(path.join(takes, name))}  ${source.width}x${source.height} at ${plan.still} s`)
    return 0
  }

  if (plan.mode === 'sheet') {
    mkdirSync(takes, { recursive: true })
    const mine = new RegExp(`^${plan.lang}-sheet-\\d+\\.png$`)
    // a shorter recording draws fewer sheets: the old ones would read as part of this one
    for (const old of readdirSync(takes).filter((f) => mine.test(f))) rmSync(path.join(takes, old))
    const font = sheetFont()
    if (!ffmpeg(['-i', recording, '-filter_complex', sheetFilter(plan.every, font), '-map', '[out]', '-fps_mode', 'passthrough', '-start_number', '1', `${plan.lang}-sheet-%02d.png`], takes)) return 1
    const times = sheetTimes(source.duration, plan.every)
    const per = SHEET.cols * SHEET.rows
    readdirSync(takes).filter((f) => mine.test(f)).sort().forEach((sheet, i) => {
      const shown = times.slice(i * per, (i + 1) * per)
      console.log(`${rel(path.join(takes, sheet))}  ${shown[0]} to ${shown.at(-1)} s`)
      if (font === null) console.log(sheetLegend(shown))
    })
    if (font === null) console.log(`this ffmpeg has no drawtext: a tile's second is its place in the grid above, left to right, top to bottom, one every ${plan.every} s`)
    return 0
  }

  const dir = path.join(takes, plan.lang)
  const { graph, crop, width, height } = takeFilter(plan, source)
  const frames = ingestFrames(takes, plan.lang, (folder) => ffmpeg(['-i', recording, '-filter_complex', graph, '-map', '[out]', '-fps_mode', 'passthrough', '-q:v', '3', '-start_number', '1', 'f%05d.jpg'], folder))
  if (!frames) {
    console.error(`✗ no frames from ${rel(recording)}: what ${rel(dir)} and ${rel(takeFile)} held before is untouched`)
    return 1
  }
  const take = mergeTake(existing, { lang: plan.lang, source: path.basename(recording), fps: plan.fps, frames, dir: `takes/${plan.lang}`, from: plan.from, crop, width, height, blur: plan.blur })
  writeFileSync(takeFile, formatTake(take))
  console.log(`${frames} frames, ${width}x${height}, ${(frames / plan.fps).toFixed(2)} s at ${plan.fps} fps → ${rel(dir)} (${rel(takeFile)})`)
  const outside = outsideTake(take)
  if (outside.length) console.error(`! outside this take, the film will clamp to them: ${outside.join(', ')}`)
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
