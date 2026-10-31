#!/usr/bin/env node
// The Editor's measured checks on a rendered video, against a style's QA profile.
//
//   node qa.mjs film.mp4 --style kinetic                 # profile: ../styles/kinetic/qa.json
//   node qa.mjs film.mp4 --profile my-qa.json            # or a profile file of your own
//   node qa.mjs loop.mp4 --style ambient-loop --json     # also write loop.mp4.qa.json
//   node qa.mjs film.mp4 --style kinetic --measure       # print the numbers, check nothing
//   node qa.mjs silent.mp4 --style kinetic --silent      # a draft before the mix: no audio or loudness targets
//
// Measured on every render, from the encoded file (never from the page): the share of still frames,
// the longest hold, hard cuts per 10 s, the loop seam, file size, H.264 level and pixel format, a
// decode on the macOS hardware decoder, frame count against the render's manifest, loudness. A
// target the profile names and the film misses fails the run (exit 1). The numbers are ours: the
// kinetic profile starts from what Scenario measured on viral kinetic reels (docs in
// references/qa.md), the calm profiles from the film this kit was shaped by.
//
// Frames are decoded at 320 px wide in grey, so a 4K master costs one ffmpeg pass. Needs ffmpeg and
// ffprobe on PATH.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// A frame that changes this much of its area in one step is a hard cut (a flood is slower than this,
// a whip or a colour swap is not): most of the frame changes at once, and either the mean brightness
// jumps or nearly everything changed.
const CUT_AREA = 0.45
const CUT_LUMA = 18
const CUT_AREA_ANY = 0.6
// A full-bleed ground swap: the mean brightness of the frame jumps.
const FLIP_LUMA = 40
// The frame is decoded this wide, whatever the file's size.
const WIDTH = 320

const TARGET_KEYS = new Set([
  'stillShareMax', 'holdMax', 'cutsPer10s', 'hardCutsMax', 'loopSeamRatio', 'bytesMax', 'levelMax',
  'hardwareDecode', 'audio', 'loudness',
])
const MEASURE_KEYS = new Set(['stillDelta', 'stillShare', 'endCardSeconds', 'loop'])

/** Throws on a profile that names an unknown key or a value of the wrong kind; returns it otherwise. */
export function validateProfile(p, label = 'profile') {
  const bad = (m) => { throw new Error(`${label}: ${m}`) }
  if (!p || typeof p !== 'object') bad('not an object')
  if (typeof p.style !== 'string' || !p.style) bad('needs a "style" name')
  const measure = p.measure ?? {}
  const targets = p.targets ?? {}
  for (const k of Object.keys(measure)) if (!MEASURE_KEYS.has(k)) bad(`unknown measure "${k}"`)
  for (const k of Object.keys(targets)) if (!TARGET_KEYS.has(k)) bad(`unknown target "${k}"`)
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  for (const k of ['stillDelta', 'stillShare', 'endCardSeconds']) if (k in measure && !(num(measure[k]) && measure[k] >= 0)) bad(`measure.${k} is a number`)
  for (const k of ['stillShareMax', 'holdMax', 'hardCutsMax', 'loopSeamRatio', 'bytesMax', 'levelMax']) {
    if (k in targets && targets[k] !== null && !(num(targets[k]) && targets[k] >= 0)) bad(`targets.${k} is a number or null`)
  }
  if ('cutsPer10s' in targets && targets.cutsPer10s !== null) {
    const c = targets.cutsPer10s
    if (!(Array.isArray(c) && c.length === 2 && c.every(num) && c[0] <= c[1])) bad('targets.cutsPer10s is [min, max]')
  }
  if ('audio' in targets && !['required', 'none', 'any'].includes(targets.audio)) bad('targets.audio is required, none or any')
  if ('loudness' in targets && targets.loudness !== null) {
    const l = targets.loudness
    if (!(num(l?.min) && num(l?.max) && num(l?.truePeak) && l.min <= l.max)) bad('targets.loudness is { min, max, truePeak }')
  }
  if ('loop' in measure && typeof measure.loop !== 'boolean') bad('measure.loop is true or false')
  if (targets.loopSeamRatio != null && !measure.loop) bad('targets.loopSeamRatio needs measure.loop: true')
  return p
}

/** The profile file of a style: styles/<name>/qa.json beside the scripts' folder. */
export function styleProfilePath(style) {
  if (!/^[a-z][a-z0-9-]*$/.test(style)) throw new Error(`bad style name "${style}"`)
  return join(HERE, '..', 'styles', style, 'qa.json')
}

export function loadProfile(path) {
  return validateProfile(JSON.parse(readFileSync(path, 'utf8')), path)
}

/**
 * Per-step numbers between two grey frames of the same size: the share of pixels that moved by more
 * than `stillDelta` and by more than 24 (the cut test), the mean absolute difference, and the mean
 * brightness step.
 */
export function stepStats(prev, cur, stillDelta) {
  let moved = 0
  let cutMoved = 0
  let sad = 0
  let lumaPrev = 0
  let lumaCur = 0
  for (let i = 0; i < cur.length; i++) {
    const d = Math.abs(cur[i] - prev[i])
    sad += d
    if (d > stillDelta) moved++
    if (d > 24) cutMoved++
    lumaPrev += prev[i]
    lumaCur += cur[i]
  }
  const n = cur.length
  return { area: moved / n, cutArea: cutMoved / n, mad: sad / n, dLuma: Math.abs(lumaCur - lumaPrev) / n }
}

const isCut = (s) => s.cutArea > CUT_AREA && (s.dLuma > CUT_LUMA || s.cutArea > CUT_AREA_ANY)

const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0)
const quantile = (a, q) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : 0)

/**
 * The end card is the film's last stretch and is left out of the motion checks, so a length that
 * leaves little to measure would pass any film: it is refused above half of the film.
 */
export function checkEndCard(endCardSeconds, filmSeconds) {
  if (!(Number.isFinite(endCardSeconds) && endCardSeconds >= 0)) throw new Error(`end card length "${endCardSeconds}" is not a number of seconds`)
  if (endCardSeconds > filmSeconds / 2) throw new Error(`an end card of ${endCardSeconds} s leaves ${Math.max(0, filmSeconds - endCardSeconds).toFixed(1)} s of a ${filmSeconds.toFixed(1)} s film to measure; the card is the last part of a film, at most half of it`)
}

/**
 * The film's measured numbers from its per-step stats (steps[i] is the step from frame i to i+1).
 * The end card, when the profile names one, is left out of the still, hold and cut counts: it may rest.
 */
export function measureSteps(steps, fps, { stillShare = 0.015, endCardSeconds = 0, loop = false } = {}) {
  const seconds = (steps.length + 1) / fps
  checkEndCard(endCardSeconds, seconds)
  // the 1e-6 keeps a card of exactly N frames at N frames: the cut into the card is the card's own, not the film's
  const inSpan = Math.max(0, Math.min(steps.length, Math.floor((seconds - endCardSeconds) * fps + 1e-6)))
  const span = steps.slice(0, inSpan)
  const still = span.map((s) => s.area < stillShare)
  let longest = 0
  let run = 0
  const holds = []
  still.forEach((v, i) => {
    run = v ? run + 1 : 0
    if (run > longest) longest = run
    if (v && (i === still.length - 1 || !still[i + 1])) holds.push({ at: (i - run + 1) / fps, seconds: run / fps })
  })
  // a loop plays on from its last frame into its first: a rest that spans the wrap is one hold
  if (loop && still.length && still[0] && still.at(-1) && !still.every(Boolean)) {
    const head = still.indexOf(false)
    const tail = still.length - 1 - still.lastIndexOf(false)
    longest = Math.max(longest, head + tail)
    holds.push({ at: (still.length - tail) / fps, seconds: (head + tail) / fps })
  }
  const cuts = span.reduce((n, s) => n + (isCut(s) ? 1 : 0), 0)
  const spanSeconds = inSpan / fps
  return {
    frames: steps.length + 1,
    seconds,
    spanSeconds,
    stillShare: span.length ? still.filter(Boolean).length / span.length : 0,
    longestHold: longest / fps,
    holds: holds.filter((h) => h.seconds >= 0.3).sort((a, b) => b.seconds - a.seconds).slice(0, 5),
    cuts,
    cutsPer10s: spanSeconds ? (cuts / spanSeconds) * 10 : 0,
    flips: span.filter((s) => s.dLuma > FLIP_LUMA).length,
    meanChange: span.length ? span.reduce((n, s) => n + s.area, 0) / span.length : 0,
    madMedian: median(steps.map((s) => s.mad)),
    madP95: quantile(steps.map((s) => s.mad), 0.95),
  }
}

/**
 * The step from the last frame back to the first, against the film's own steps: a seam is a wrap
 * that is bigger than the 95th percentile of the steps inside the film times `ratio`. A film whose
 * steps are all grain has a small p95, so the floor keeps a quiet loop from failing on noise.
 */
export function loopSeam(wrapMad, madP95, ratio, floor = 0.35) {
  const limit = Math.max(madP95 * ratio, floor)
  return { wrap: wrapMad, limit, ok: wrapMad <= limit, identical: wrapMad < 0.01 }
}

/** ffprobe facts of a file: the video stream, whether it has audio, the size. */
export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.error || r.status) throw new Error(`ffprobe failed on ${file}: ${r.error?.message ?? r.stderr.slice(-200)}`)
  const j = JSON.parse(r.stdout)
  const v = j.streams.find((s) => s.codec_type === 'video')
  if (!v) throw new Error(`${file} has no video stream`)
  const [num, den] = v.avg_frame_rate.split('/').map(Number)
  return {
    codec: v.codec_name,
    profile: v.profile,
    level: v.level,
    pixFmt: v.pix_fmt,
    colorRange: v.color_range ?? null,
    colorSpace: v.color_space ?? null,
    width: v.width,
    height: v.height,
    fps: den ? num / den : num,
    hasAudio: j.streams.some((s) => s.codec_type === 'audio'),
    bytes: statSync(file).size,
    duration: Number(j.format.duration),
  }
}

/** Decode the film to small grey frames and measure each step. */
export async function readSteps(file, facts, stillDelta) {
  const w = WIDTH
  const h = 2 * Math.round((facts.height * (w / facts.width)) / 2)
  const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { stdio: ['ignore', 'pipe', 'inherit'] })
  const size = w * h
  const steps = []
  let first = null
  let prev = null
  let carry = Buffer.alloc(0)
  for await (const chunk of p.stdout) {
    carry = carry.length ? Buffer.concat([carry, chunk]) : chunk
    let off = 0
    while (carry.length - off >= size) {
      const cur = Uint8Array.from(carry.subarray(off, off + size))
      off += size
      first ??= cur
      if (prev) steps.push(stepStats(prev, cur, stillDelta))
      prev = cur
    }
    carry = carry.subarray(off)
  }
  await new Promise((ok) => (p.exitCode === null ? p.on('close', ok) : ok()))
  if (!prev) throw new Error('ffmpeg decoded no frames')
  const wrap = stepStats(prev, first, stillDelta)
  return { steps, wrapMad: wrap.mad }
}

/** True when the macOS hardware decoder plays the whole file without a message. null off macOS. */
export function hardwareDecode(file) {
  if (process.platform !== 'darwin') return null
  const r = spawnSync('ffmpeg', ['-v', 'error', '-hwaccel', 'videotoolbox', '-hwaccel_output_format', 'videotoolbox_vld', '-i', file, '-an', '-f', 'null', '-'], { encoding: 'utf8' })
  const lines = (r.stderr ?? '').split('\n').filter((l) => l.trim())
  return { ok: !r.status && !lines.length, detail: lines[0]?.slice(0, 100) ?? '' }
}

/** Integrated loudness (LUFS) and true peak (dBTP) of the audio. */
export function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' })
  const log = r.stderr ?? ''
  const i = [...log.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)
  const tp = [...log.matchAll(/Peak:\s+(-?[\d.]+|-inf) dBFS/g)].at(-1)
  return { lufs: i ? Number(i[1]) : null, truePeak: tp ? Number(tp[1]) : null }
}

/**
 * Every check the profile names, as { id, ok, value, target }. `facts` is probe(), `m` measureSteps(),
 * `extra` carries what needs a tool: { seam, hw, loud, expectedFrames, expectedSize }.
 */
export function evaluate(profile, facts, m, extra = {}) {
  const t = profile.targets ?? {}
  const out = []
  const add = (id, ok, value, target) => out.push({ id, ok: Boolean(ok), value, target })
  const pct = (x) => `${(x * 100).toFixed(0)}%`
  if (extra.expectedFrames != null) add('frames', m.frames === extra.expectedFrames, `${m.frames}`, `${extra.expectedFrames} (the render's manifest)`)
  if (extra.expectedSize) add('dimensions', facts.width === extra.expectedSize[0] && facts.height === extra.expectedSize[1], `${facts.width}x${facts.height}`, `${extra.expectedSize[0]}x${extra.expectedSize[1]} (the render's manifest)`)
  if (t.stillShareMax != null) add('still frames', m.stillShare <= t.stillShareMax, pct(m.stillShare), `${pct(t.stillShareMax)} or less`)
  if (t.holdMax != null) {
    const worst = m.holds[0]
    add('longest hold', m.longestHold <= t.holdMax + 1e-9, `${m.longestHold.toFixed(2)} s${worst ? ` (at ${worst.at.toFixed(1)} s)` : ''}`, `${t.holdMax} s or less`)
  }
  if (t.cutsPer10s) add('hard cuts per 10 s', m.cutsPer10s >= t.cutsPer10s[0] && m.cutsPer10s <= t.cutsPer10s[1], m.cutsPer10s.toFixed(1), `${t.cutsPer10s[0]} to ${t.cutsPer10s[1]}`)
  if (t.hardCutsMax != null) add('hard cuts', m.cuts <= t.hardCutsMax, `${m.cuts}`, `${t.hardCutsMax} or fewer`)
  if (t.loopSeamRatio != null) {
    const s = extra.seam
    add('loop seam', s?.ok, s ? `last to first ${s.wrap.toFixed(2)}${s.identical ? ' (identical frames)' : ''}` : 'not measured', s ? `${s.limit.toFixed(2)} or less (${t.loopSeamRatio}x the film's own p95 step)` : '')
  }
  if (t.bytesMax != null) add('file size', facts.bytes <= t.bytesMax, `${(facts.bytes / 1e6).toFixed(1)} MB`, `${(t.bytesMax / 1e6).toFixed(0)} MB or less`)
  if (t.levelMax != null) add('H.264 level', facts.codec === 'h264' && facts.level > 0 && facts.level / 10 <= t.levelMax, `${facts.codec} ${facts.level / 10}`, `h264, ${t.levelMax} or lower`)
  if (t.levelMax != null) {
    // a JPEG-fed encode is yuvj420p full range, tagged BT.601: QuickTime and the stores read the colours wrong
    add('pixel format', facts.pixFmt === 'yuv420p' && facts.colorRange !== 'pc', `${facts.pixFmt}${facts.colorRange ? `, ${facts.colorRange}` : ''}${facts.colorSpace ? `, ${facts.colorSpace}` : ''}`, 'yuv420p, limited range (tv)')
  }
  if (t.hardwareDecode && extra.hw) add('macOS hardware decoder', extra.hw.ok, extra.hw.ok ? 'plays clean' : extra.hw.detail, 'plays clean')
  if (t.audio === 'none') add('audio track', !facts.hasAudio, facts.hasAudio ? 'has audio' : 'none', 'none (a muted loop)')
  if (t.audio === 'required') add('audio track', facts.hasAudio, facts.hasAudio ? 'present' : 'missing', 'present')
  if (t.loudness && facts.hasAudio && extra.loud) {
    const { lufs, truePeak } = extra.loud
    add('loudness', lufs != null && lufs >= t.loudness.min && lufs <= t.loudness.max, `${lufs} LUFS`, `${t.loudness.min} to ${t.loudness.max}`)
    add('true peak', truePeak != null && truePeak <= t.loudness.truePeak, `${truePeak} dBTP`, `${t.loudness.truePeak} or lower`)
  }
  return out
}

/** The render's manifest beside a video (`<video>.json`, written by render.mjs), or null. */
export function readManifest(file) {
  const path = `${file}.json`
  if (!existsSync(path)) return null
  try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i === -1 ? dflt : argv[i + 1] }
  const has = (name) => argv.includes(`--${name}`)
  if (!argv[0] || argv[0].startsWith('--') || !(flag('style') || flag('profile'))) {
    console.error('usage: qa.mjs <video.mp4> (--style <name> | --profile <qa.json>) [--json] [--measure] [--silent] [--end-card <s>]')
    process.exit(2)
  }
  const file = resolve(argv[0])
  const profile = loadProfile(flag('profile') ? resolve(flag('profile')) : styleProfilePath(flag('style')))
  const measure = { ...profile.measure }
  if (flag('end-card') != null) measure.endCardSeconds = Number(flag('end-card'))
  const facts = probe(file)
  const { steps, wrapMad } = await readSteps(file, facts, measure.stillDelta ?? 24)
  const m = measureSteps(steps, facts.fps, { ...measure, loop: measure.loop === true })
  const t = { ...profile.targets }
  if (has('silent')) { t.audio = 'any'; delete t.loudness }
  const manifest = readManifest(file)
  const extra = {
    seam: measure.loop ? loopSeam(wrapMad, m.madP95, t.loopSeamRatio ?? 1.5) : null,
    hw: t.hardwareDecode ? hardwareDecode(file) : null,
    loud: t.loudness && facts.hasAudio ? loudness(file) : null,
  }
  if (manifest && manifest.to != null && manifest.fps) {
    extra.expectedFrames = Math.round((manifest.to - (manifest.from ?? 0)) * manifest.fps)
    const k = manifest.scale ?? 1
    if (manifest.width && manifest.height) extra.expectedSize = [Math.round(manifest.width * k), Math.round(manifest.height * k)]
  }
  const checks = has('measure') ? [] : evaluate({ ...profile, targets: t }, facts, m, extra)

  console.log(`${file}\n${profile.style}: ${facts.width}x${facts.height} at ${facts.fps.toFixed(2)} fps, ${m.seconds.toFixed(2)} s, ${m.frames} frames`)
  console.log(`measured: still ${(m.stillShare * 100).toFixed(1)}%, longest hold ${m.longestHold.toFixed(2)} s, hard cuts ${m.cuts} (${m.cutsPer10s.toFixed(1)} per 10 s), colour flips ${m.flips}, mean change ${(m.meanChange * 100).toFixed(2)}%, step p95 ${m.madP95.toFixed(2)}, wrap ${wrapMad.toFixed(2)}`)
  if (m.holds.length) console.log(`holds: ${m.holds.map((h) => `${h.seconds.toFixed(2)} s at ${h.at.toFixed(1)} s`).join('; ')}`)
  for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.id}: ${c.value} (${c.target})`)
  const failed = checks.filter((c) => !c.ok)
  if (extra.hw === null && t.hardwareDecode) console.log('  skip  macOS hardware decoder: not macOS')
  if (has('json')) writeFileSync(`${file}.qa.json`, `${JSON.stringify({ style: profile.style, facts, measured: m, wrapMad, checks, rendered: manifest?.rendered ?? null }, null, 2)}\n`)
  if (!has('measure')) console.log(failed.length ? `QA FAILED: ${failed.length} of ${checks.length} checks. Fix the film and render again; do not hand it over.` : `QA PASSED: ${checks.length} checks`)
  process.exitCode = failed.length ? 1 : 0
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  await main().catch((e) => {
    console.error(`qa: ${e.message}`)
    process.exit(1)
  })
}
