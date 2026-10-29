#!/usr/bin/env node
// Render a seek(t) film to video, or to stills.
//
//   node render.mjs film.html --out film.mp4 [--fps 60] [--subframes 8] [--workers 6] [--from 0 --to 12]
//   node render.mjs film.html --stills 1.2,b16,b27.5 --out stills/    # seconds, or b<n> for beats
//   node render.mjs film.html --stills every:2 --out stills/ --contact contact.png   # one per 2 beats, tiled
//   node render.mjs film.html --purity                                # is seek(t) a pure function of t?
//   node render.mjs film.html --serve                                 # open the film in your own browser
//   node render.mjs 'film.html?format=reel' --out reel.mp4            # a query string reaches the page
//   node render.mjs film.html --query 'pattern=box&minutes=5' --out box.mp4   # the same, as a flag
//   node render.mjs film.html --stills cuts --out seams/ --contact seams.png  # around every handoff
//   node render.mjs film.html --stills every:4 --contact phone.png --tile 360  # at feed size
//   node render.mjs film.html --matrix 'format=wide,reel;hook=a,b' --out film.mp4   # every variant
//
// --crf sets the x264 quality: 14 (the default) is a master, 24 to 28 a deliverable for flat,
// slow footage. --scale 2 renders a 1920x1080 page as 3840x2160 (device scale factor). --workers
// defaults to what the machine's memory carries at the output size, and the file is written the way
// players expect: H.264 High, yuv420p, BT.709 limited range, a level the Mac hardware decoder plays.
//
// The page must set `window.film = { width, height, duration, beat, ready, seek }`
// where `ready` is a Promise (fonts, images, measurements) and `seek(t)` may be
// async. An optional `cuts` array (seconds) names the handoffs: `--stills cuts`
// draws the frame before, on and after each, and --purity samples them too.
//
// A missing file, a failed request or a page error stops the run before a frame
// is drawn (a film in a fallback font is wrong in every measurement); --lenient
// downgrades them to warnings for a sketch. Every still reports text drawn
// smaller than 20 px per 1080 px of the frame's short side, the size a phone feed
// still shows. A video gets a `<out>.json` manifest beside it: the commit, the
// query and the settings it came from. Every subframe is a Playwright screenshot; ffmpeg averages each group
// of `subframes` with tmix (a 180 degree shutter), keeps one per frame, and the
// worker segments are concatenated without re-encoding.
//
// The film is served over http from the repo root, so it can load the repo's
// own fonts and images by root-absolute path (/apps/<app>/assets/fonts/...).
// A file:// page cannot: Chromium treats every file as its own origin and
// refuses the font.
//
// Needs ffmpeg on PATH and `playwright` resolvable from the working directory
// (npm i playwright && npx playwright install chromium).
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { cpus, tmpdir, totalmem } from 'node:os'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
}

/** The directory the film is served from: its git toplevel, so root-absolute asset paths work. */
export function serveRoot(film) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dirname(film), stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    return dirname(film)
  }
}

// Never served, whatever the film asks for: the repo's secrets and its git internals. The server
// is local, but --serve keeps it up while a browser that visits other sites is open on it.
const SECRET = /^(\.env(\..*)?|\.dev\.vars|\.npmrc|settings\.local\.json)$/

/** Map a request path to a file under root; null when it escapes root, is a secret, or is not a file. */
export function resolveRequest(root, urlPath) {
  let rel
  try {
    rel = decodeURIComponent(urlPath.split('?')[0])
  } catch {
    return null // a malformed escape (%E0%A4%A) is a bad request, not a crash
  }
  const file = resolve(root, `.${rel}`)
  if (file !== root && !file.startsWith(root + sep)) return null
  const parts = relative(root, file).split(sep)
  if (parts.includes('.git') || SECRET.test(parts.at(-1))) return null
  return existsSync(file) && statSync(file).isFile() ? file : null
}

/** A host header names this server, not another site rebound onto 127.0.0.1 (DNS rebinding). */
export const isLocalHost = (host, port) => host === `127.0.0.1:${port}` || host === `localhost:${port}`

/** One line of an ffmpeg concat list; a quote inside the path is closed, escaped and reopened. */
export const concatLine = (file) => `file '${file.replaceAll("'", "'\\''")}'`

/**
 * `1.2,b16,every:2,cuts` → seconds. `b<n>` is a beat, `every:<n>` one still per n beats over the
 * film, `cuts` the frame before, on and after each of the film's handoffs.
 */
export function parseStills(spec, { beat, duration, cuts, fps = 60 }) {
  const times = []
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (part === 'cuts') {
      if (!cuts?.length) throw new Error('cuts needs window.film.cuts')
      for (const c of cuts) for (const d of [-1, 0, 1]) times.push(Math.min(duration, Math.max(0, c + d / fps)))
    } else if (part.startsWith('every:')) {
      const step = Number(part.slice(6))
      if (!beat) throw new Error('every:<n> needs window.film.beat')
      if (!(step > 0)) throw new Error(`bad still spec "${part}"`)
      for (let n = 0; n * step * beat < duration; n++) times.push(n * step * beat)
    } else if (part.startsWith('b')) {
      if (!beat) throw new Error('b<n> needs window.film.beat')
      times.push(Number(part.slice(1)) * beat)
    } else {
      times.push(Number(part))
    }
  }
  if (times.some(Number.isNaN)) throw new Error(`bad still spec "${spec}"`)
  return times
}

/**
 * `format=wide,reel;hook=a,b` → every combination as a query string and a file-name suffix, in the
 * order given: [{ query: 'format=wide&hook=a', suffix: 'format-wide-hook-a' }, ...].
 */
export function parseMatrix(spec) {
  const axes = spec.split(';').map((s) => s.trim()).filter(Boolean).map((axis) => {
    const [key, values = ''] = axis.split('=')
    const list = values.split(',').map((v) => v.trim()).filter(Boolean)
    if (!/^[a-z][a-z0-9_-]*$/i.test(key ?? '') || !list.length) throw new Error(`bad matrix axis "${axis}"`)
    if (list.some((v) => !/^[a-z0-9_-]+$/i.test(v))) throw new Error(`matrix values are file-name safe: "${axis}"`)
    return list.map((v) => [key, v])
  })
  if (!axes.length) throw new Error('empty --matrix')
  return axes
    .reduce((combos, axis) => combos.flatMap((c) => axis.map((kv) => [...c, kv])), [[]])
    .map((c) => ({ query: c.map(([k, v]) => `${k}=${v}`).join('&'), suffix: c.map(([k, v]) => `${k}-${v}`).join('-') }))
}

/** `film.mp4` + `format-reel` → `film-format-reel.mp4`; a stills folder gets a subfolder instead. */
export function variantOut(out, suffix, isFile) {
  if (!suffix) return out
  if (!isFile) return join(out, suffix)
  const ext = extname(out)
  return `${out.slice(0, out.length - ext.length)}-${suffix}${ext}`
}

/** A request the run cannot do without; the favicon is Chromium asking, not the film. */
export const isBlocking = (url) => !/\/favicon\.ico(?:\?|$)/.test(url)

// Text under this many px per 1080 px of the frame's short side is gone at feed size (craft.md).
const MIN_TEXT = 20

// How far short of a hard cut a shutter window ends: under a frame, so it never samples the next shot.
const CUT_GAP = 1e-4

/**
 * Motion-blur sample times for output frame f: `n` subframes spread over `shutter` of a frame. A hard
 * cut (seconds) inside that window would blend two shots into one frame, so the window slides to
 * stay on the frame's own side: a frame before the cut ends its shutter just short of it, a frame on
 * or after it starts its shutter on it. The window keeps its width, so the fastest frame of a whip
 * is still blurred.
 */
export function subframeTimes(f, n, fps, shutter, cuts = []) {
  let lo = f - shutter / 2
  let hi = f + shutter / 2
  for (const c of cuts) {
    const cf = c * fps
    if (cf <= lo || cf >= hi) continue
    if (f >= cf) {
      lo = cf
      hi = cf + shutter
    } else {
      hi = cf - CUT_GAP * fps
      lo = hi - shutter
    }
  }
  const open = hi === f + shutter / 2 && lo === f - shutter / 2
  return Array.from({ length: n }, (_, s) => Math.max(0, (open ? f + (n > 1 ? (s / (n - 1) - 0.5) * shutter : 0) : n > 1 ? lo + ((hi - lo) * s) / (n - 1) : f) / fps))
}

// Chromium flags every render needs. Without the first, big 3D layers (a camera flying through
// CSS-3D type) are captured before every tile has rastered: half-drawn words in some frames.
export const LAUNCH_ARGS = ['--run-all-compositor-stages-before-draw']

/**
 * Parallel render workers the machine's memory carries at this output size. A worker is a page, its
 * share of the GPU process and an encoder: about 2.5 GB plus 1 GB per megapixel (4.6 GB at 1080p,
 * 11 GB at 4K). Six filled a 36 GB laptop at 4K and stalled it, so 4K is capped at three. Memory is
 * used to 80%; the rest of the machine (the browser, the editor) needs the remainder.
 */
export function defaultWorkers({ ramGB, cpuCount, width, height, scale = 1 }) {
  const mp = (width * height * scale * scale) / 1e6
  const perWorker = 2.5 + mp
  const cap = mp > 4.5 ? 3 : 6
  return Math.max(1, Math.min(cap, Math.floor((ramGB * 0.8) / perWorker), Math.floor(cpuCount / 2)))
}

// H.264 levels a Mac plays in hardware, smallest first: [level, max macroblocks per frame, max
// macroblocks per second]. Level 6 is not on the list: QuickTime and the hardware decoder refuse it.
const LEVELS = [['4.2', 8704, 522240], ['5.1', 36864, 983040], ['5.2', 36864, 2073600]]

/**
 * The lowest H.264 level that holds this frame size and rate, or an error naming the limit. A frame
 * of 3840x2560 is 38,400 macroblocks against the 36,864 level 5.2 allows: x264 then writes level 6.0,
 * which plays in ffmpeg and fails on the Mac's hardware decoder.
 */
export function pickLevel(width, height, fps) {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16)
  for (const [level, maxFs, maxMbps] of LEVELS) if (mbs <= maxFs && mbs * fps <= maxMbps) return level
  throw new Error(`${width}x${height} at ${fps} fps is ${mbs.toLocaleString('en')} macroblocks per frame and ${(mbs * fps).toLocaleString('en')} per second; H.264 level 5.2 holds ${LEVELS[2][1].toLocaleString('en')} and ${LEVELS[2][2].toLocaleString('en')}, and a Mac's hardware decoder refuses level 6. Render 3600x2400 or smaller, or fewer frames per second`)
}

// The ways a frame can come to depend on more than t. Block and line comments are skipped, and so is
// a line marked `// viewer-only` (the scrub bar of a browser preview, which only ever calls seek).
const IMPURE = [
  [/\bMath\.random\b|\bcrypto\.getRandomValues\b/, 'Math.random: use a seeded generator whose seed is the element, never the clock'],
  [/\bDate\.now\b|\bnew Date\b|\bperformance\.now\b/, 'a clock: time is the argument of seek(t), nothing else'],
  [/\bsetTimeout\b|\bsetInterval\b|\brequestAnimationFrame\b/, 'a timer: seek(t) is called by the renderer, in any order'],
  [/(^|[;{\s])transition\s*:|\btransition-(?:property|duration)\s*:/, 'a CSS transition: it animates on its own clock'],
  [/@keyframes\b|(^|[;{\s])animation(?:-name)?\s*:/, 'a CSS animation: it runs on its own clock'],
]

/** Lines of a script or page that break purity: [{ line, why, text }]. `name` only labels the messages. */
export function lintPure(source, name = 'source') {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
  const raw = source.split('\n')
  const out = []
  stripped.forEach((text, i) => {
    if (/\/\/\s*viewer-only/.test(raw[i])) return
    const code = text.replace(/(^|\s)\/\/.*$/, '$1')
    for (const [re, why] of IMPURE) if (re.test(code)) out.push({ line: i + 1, why, text: `${name}:${i + 1}: ${code.trim().slice(0, 90)}` })
  })
  return out
}

/** Pixel size of a PNG or JPEG buffer, so a capture at the wrong scale stops the run on its first frame. */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue }
      const marker = buf[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  throw new Error('not a PNG or JPEG')
}

// A JPEG frame is full range, BT.601; players expect BT.709, limited range, 4:2:0. Converted here,
// not tagged: a tag alone shifts the greens (a forest #01684e came back #04684e).
export const TO_BT709 = 'scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p'
// Written into the stream's VUI by x264: ffmpeg's -color_primaries and -color_trc flags leave both 'unknown'.
export const BT709_TAGS = ['-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv']

// The page records calls to the clock and the dice made while seek() runs; a film that makes one is
// drawn differently by each worker. The static scan (lintPure) reads the source, this reads the run.
const PURITY_GUARD = () => {
  const hits = (window.__impure = {})
  window.__inSeek = false
  const wrap = (obj, key, label) => {
    const original = obj[key]
    obj[key] = function (...args) {
      if (window.__inSeek) hits[label] = (hits[label] || 0) + 1
      return original.apply(this, args)
    }
  }
  wrap(Math, 'random', 'Math.random')
  wrap(Date, 'now', 'Date.now')
  wrap(performance, 'now', 'performance.now')
}

function serve(root) {
  const server = createServer((req, res) => {
    if (!isLocalHost(req.headers.host, server.address().port)) return res.writeHead(421).end()
    const file = resolveRequest(root, req.url)
    if (!file) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    createReadStream(file).pipe(res)
  })
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)))
}

// Below this, two draws of one frame differ by more than raster noise.
const PURE_DB = 60

/** Peak signal-to-noise ratio between two images, in dB; Infinity when identical. */
export function psnr(a, b) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' })
  if (r.error) throw new Error(`ffmpeg psnr failed: ${r.error.message}`)
  const m = r.stderr.match(/average:(inf|[0-9.]+)/)
  if (!m) throw new Error(`ffmpeg psnr failed: ${r.stderr.slice(-200)}`)
  return m[1] === 'inf' ? Infinity : Number(m[1])
}

/** What a video was made from, so a revision starts from the same source and settings. */
export function manifest(root, film, query, meta, settings) {
  const git = (...a) => spawnSync('git', a, { cwd: root, encoding: 'utf8' }).stdout?.trim() ?? ''
  const rel = relative(root, film).split(sep).join('/')
  const commit = git('rev-parse', 'HEAD') || null
  return {
    film: rel,
    query,
    commit,
    // uncommitted edits to the film's folder mean the commit alone cannot rebuild this file
    dirty: commit ? git('status', '--porcelain', '--', dirname(rel) || '.') !== '' : null,
    width: meta.width,
    height: meta.height,
    duration: meta.duration,
    ...settings,
    rendered: new Date().toISOString(),
  }
}

/**
 * Lint the film and every local script it loads (script tags and imports, root-absolute or relative),
 * up to 40 files. Remote scripts and anything outside the served root are not read.
 */
export function lintFilm(root, film) {
  const seen = new Set()
  const out = []
  const queue = [film]
  while (queue.length && seen.size < 40) {
    const file = queue.shift()
    if (seen.has(file) || !existsSync(file) || !statSync(file).isFile()) continue
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    out.push(...lintPure(source, relative(root, file).split(sep).join('/')))
    const refs = [
      ...source.matchAll(/<script[^>]*\ssrc=["']([^"'?#]+)/g),
      ...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"'?#]+\.m?js)["']/g),
    ].map((m) => m[1])
    for (const ref of refs) {
      if (/^[a-z]+:|^\/\//i.test(ref)) continue
      const target = ref.startsWith('/') ? resolve(root, `.${ref}`) : resolve(dirname(file), ref)
      if (target.startsWith(root + sep)) queue.push(target)
    }
  }
  return out
}

function ffmpeg(args) {
  const p = spawn('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((ok, fail) => p.on('close', (c) => (c ? fail(new Error(`ffmpeg ${c}`)) : ok())))
  return { stdin: p.stdin, done }
}

async function main() {
  const argv = process.argv.slice(2)
  const flag = (name, dflt) => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? dflt : argv[i + 1]
  }
  const has = (name) => argv.includes(`--${name}`)
  if (!argv[0] || argv[0].startsWith('--')) {
    console.error('usage: render.mjs <film.html[?query]> [--out …] [--stills …] [--purity] [--serve] (the film comes first)')
    process.exit(2)
  }
  // film.html?format=reel: the query reaches the page, so one film can carry several formats
  const [filmPath, inline = ''] = argv[0].split('?')
  const query = [inline, flag('query', '')].filter(Boolean).join('&')
  const film = realpathSync(resolve(filmPath)) // git's toplevel is a real path; a symlinked film path would sit outside it
  const stillsMode = flag('stills') && !has('purity')
  const out = resolve(flag('out', stillsMode ? 'stills' : 'film.mp4'))
  const fps = Number(flag('fps', 60))
  const subframes = Number(flag('subframes', 4))
  const asked = flag('workers') === undefined ? null : Number(flag('workers'))
  const shutter = Number(flag('shutter', 0.5))
  const stills = flag('stills')
  const crf = flag('crf', '14')
  // device scale factor: a 1920x1080 page at --scale 2 is a 3840x2160 frame
  const scale = Number(flag('scale', 1))
  if (!(scale > 0)) throw new Error(`bad --scale "${flag('scale')}"`)

  const root = serveRoot(film)
  const server = await serve(root)
  const base = `http://127.0.0.1:${server.address().port}/${relative(root, film).split(sep).join('/')}`
  const url = `${base}${query && `?${query}`}`

  if (has('serve')) {
    console.log(`${url}${query ? '&' : '?'}t=0\nspace plays, arrow keys step a beat (shift: a frame), the bar scrubs. Ctrl-C to stop.`)
    return
  }

  const require = createRequire(join(process.cwd(), 'noop.js'))
  const { chromium } = require('playwright')
  const browser = await chromium.launch({ args: LAUNCH_ARGS })

  // What the film's own files do that a pure function of t cannot: read before a frame is drawn, once
  // per run. The kit's scrub bar is marked `// viewer-only` and skipped.
  const impureSource = lintFilm(root, film)
  if (impureSource.length) {
    for (const p of impureSource) console.error(`[impure] ${p.text}\n          ${p.why}`)
    if (!has('lenient')) {
      await browser.close()
      server.close()
      throw new Error(`${impureSource.length} line(s) make a frame depend on more than t (above); fix them, or pass --lenient for a sketch`)
    }
  }

  async function openPage(url) {
    const page = await browser.newPage({ deviceScaleFactor: scale })
    await page.addInitScript(PURITY_GUARD)
    const problems = []
    const report = (line) => { problems.push(line); console.error(line) }
    page.on('pageerror', (e) => report(`[page error] ${e.message}`))
    page.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text()))
    // Chromium aborts media requests it only wanted the start of; that is not a missing file
    page.on('requestfailed', (r) => isBlocking(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED' && report(`[request failed] ${r.url()}`))
    page.on('response', (r) => r.status() >= 400 && isBlocking(r.url()) && report(`[${r.status()}] ${r.url()}`))
    await page.goto(url)
    // A film whose own script failed to load never sets window.film: say so at once, not after
    // Playwright's 30 s timeout.
    const stop = () => problems.length && !has('lenient')
    for (let waited = 0; !(await page.evaluate(() => Boolean(window.film))); waited += 100) {
      if (stop()) break
      if (waited >= 30000) throw new Error('the page never set window.film (render.mjs header says what it needs)')
      await new Promise((r) => setTimeout(r, 100))
    }
    if (stop()) {
      await page.close()
      throw new Error(`${problems.length} load problem(s) above; fix them, or pass --lenient for a sketch`)
    }
    const meta = await page.evaluate(async () => {
      await window.film.ready
      await document.fonts.ready
      const { width, height, duration, beat, cuts, hardCuts } = window.film
      return { width, height, duration, beat, cuts, hardCuts }
    })
    if (problems.length && !has('lenient')) {
      await page.close()
      throw new Error(`${problems.length} load problem(s) above; fix them, or pass --lenient for a sketch`)
    }
    meta.fps = fps
    await page.setViewportSize({ width: meta.width, height: meta.height })
    return { page, meta }
  }

  // The smallest text a still shows, in frame pixels: each text leaf's font size times the scale it
  // is drawn at. Text clipped by a mask or off the frame is not being read and does not count.
  const smallText = (page, min) => page.evaluate((min) => {
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue
      if (!el.offsetHeight || !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1 || r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) continue
      const px = Number.parseFloat(cs.fontSize) * (r.height / el.offsetHeight)
      if (px < min) out.push({ px: Math.round(px * 10) / 10, text: el.textContent.trim().slice(0, 40) })
    }
    return out.sort((a, b) => a.px - b.px).slice(0, 3)
  }, min)

  // The clock and the dice are watched while seek() runs (PURITY_GUARD); anything recorded stops the run.
  const shot = async (page, t, type = 'jpeg') => {
    await page.evaluate(async (t) => {
      window.__inSeek = true
      try { await window.film.seek(t) } finally { window.__inSeek = false }
    }, t)
    return page.screenshot(type === 'png' ? { type } : { type, quality: 95 })
  }

  const checkImpure = async (page) => {
    const hits = await page.evaluate(() => window.__impure ?? {})
    const names = Object.keys(hits)
    if (!names.length) return
    const msg = `seek(t) called ${names.map((k) => `${k} ${hits[k]}x`).join(', ')}: a frame must be a function of t alone`
    if (!has('lenient')) throw new Error(msg)
    console.error(`[impure] ${msg}`)
  }

  // The first capture of a page must be the size the render promises. A capture at the wrong scale
  // (raw CDP without clip.scale returns CSS pixels, so a 4K render comes back 1080p) is caught here.
  const assertCapture = (buf, meta) => {
    const want = [Math.round(meta.width * scale), Math.round(meta.height * scale)]
    const got = imageSize(buf)
    if (got[0] !== want[0] || got[1] !== want[1]) throw new Error(`the capture is ${got[0]}x${got[1]}, not ${want[0]}x${want[1]} (${meta.width}x${meta.height} at --scale ${scale})`)
  }

  async function renderSegment(url, first, last, file, label, level) {
    const { page, meta } = await openPage(url)
    const n = subframes
    const blur = n > 1 ? `tmix=frames=${n},select='eq(mod(n\\,${n})\\,${n - 1})',setpts=N/${fps}/TB,` : ''
    const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps * n), '-i', '-', '-vf', `${blur}${TO_BT709}`,
      '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-profile:v', 'high', '-level', level,
      ...BT709_TAGS, '-tag:v', 'avc1', '-movflags', '+faststart', file])
    const started = Date.now()
    const cuts = meta.hardCuts ?? meta.cuts ?? []
    for (let f = first; f < last; f++) {
      for (const t of subframeTimes(f, n, fps, shutter, cuts)) {
        const buf = await shot(page, t)
        if (f === first) { assertCapture(buf, meta); await checkImpure(page) }
        if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r))
      }
      if ((f - first) % 60 === 59) {
        const rate = (f - first + 1) / ((Date.now() - started) / 1000)
        console.log(`${label} frame ${f + 1}/${last} (${rate.toFixed(1)} fps)`)
      }
    }
    enc.stdin.end()
    await enc.done
    await checkImpure(page)
    await page.close()
  }

  async function run(url, out, query) {
    if (has('purity')) {
      // seek(t) must draw the same frame whatever was drawn before it: the workers render out of
      // order, and motion blur seeks backwards between frames. Draw each sample, wander off, come back.
      const { page, meta } = await openPage(url)
      const dflt = [meta.beat ? 'every:2' : '0', meta.cuts?.length ? 'cuts' : ''].filter(Boolean).join(',')
      const samples = parseStills(flag('stills', dflt), meta)
      const impure = []
      // the pairs are evidence, not output: a temp folder unless --out names one
      const tmp = has('out') ? out : mkdtempSync(join(tmpdir(), 'purity-'))
      mkdirSync(tmp, { recursive: true })
      for (const t of samples) {
        const a = await shot(page, t, 'png')
        await shot(page, meta.duration, 'png')
        await shot(page, 0, 'png')
        const b = await shot(page, t, 'png')
        if (a.equals(b)) continue
        // Byte-different is not yet impure: Chromium's antialiasing can move a few pixels by one
        // level between two draws of the same frame (95 dB and up). Carried state moves real pixels.
        const pair = ['a', 'b'].map((k) => join(tmp, `impure-${t.toFixed(2)}-${k}.png`))
        writeFileSync(pair[0], a)
        writeFileSync(pair[1], b)
        const db = psnr(...pair)
        if (db >= PURE_DB) pair.forEach((f) => rmSync(f))
        else impure.push(`${t.toFixed(2)} s (${db.toFixed(0)} dB)`)
      }
      await checkImpure(page)
      console.log(impure.length
        ? `IMPURE at ${impure.join(', ')}: the frame depends on what was drawn before it. Both draws are in ${tmp}`
        : `pure: ${samples.length} frames drew the same after seeking away and back`)
      process.exitCode = impure.length ? 1 : 0
    } else if (stills) {
      mkdirSync(out, { recursive: true })
      const { page, meta } = await openPage(url)
      const min = (MIN_TEXT * Math.min(meta.width, meta.height)) / 1080
      const files = []
      const times = [...new Set(parseStills(stills, meta).map((t) => t.toFixed(3)))].map(Number)
      for (const t of times) {
        const file = join(out, `still-${t.toFixed(3).padStart(7, '0')}.png`)
        const png = await shot(page, t, 'png')
        if (!files.length) assertCapture(png, meta)
        writeFileSync(file, png)
        files.push(file)
        const small = await smallText(page, min)
        console.log(small.length ? `${file}  small text: ${small.map((s) => `${s.px} px "${s.text}"`).join(', ')}` : file)
      }
      await checkImpure(page)
      const contact = flag('contact')
      if (contact && files.length) {
        const cols = Math.min(Number(flag('cols', 4)), files.length)
        const tile = Number(flag('tile', 640))
        const list = join(out, '.contact.txt')
        writeFileSync(list, files.map((f) => `${concatLine(f)}\nduration 1`).join('\n'))
        const sheet = variantOut(resolve(contact), query.suffix, true)
        await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf',
          `scale=${tile}:-1,tile=${cols}x${Math.ceil(files.length / cols)}:padding=6:color=white`, '-frames:v', '1', sheet]).done
        rmSync(list)
        console.log(sheet)
      }
    } else {
      const { page, meta } = await openPage(url)
      await page.close()
      const from = Math.round(Number(flag('from', 0)) * fps)
      const to = Math.round(Number(flag('to', meta.duration)) * fps)
      const px = [Math.round(meta.width * scale), Math.round(meta.height * scale)]
      if (px.some((v) => v % 2)) throw new Error(`${px[0]}x${px[1]} has an odd side: yuv420p needs both even`)
      const level = pickLevel(px[0], px[1], fps)
      const fit = defaultWorkers({ ramGB: totalmem() / 2 ** 30, cpuCount: cpus().length, width: meta.width, height: meta.height, scale })
      const workers = asked ?? fit
      if (workers > fit) console.error(`[workers] ${workers} workers is more than ${(totalmem() / 2 ** 30).toFixed(0)} GB carries at ${px[0]}x${px[1]} (${fit}); a render that fills memory stalls the machine`)
      const per = Math.ceil((to - from) / workers)
      const tmp = join(dirname(out), `.segments-${Date.now()}`)
      mkdirSync(tmp, { recursive: true })
      try {
        const segs = []
        for (let w = 0; w < workers && from + w * per < to; w++) {
          segs.push({ first: from + w * per, last: Math.min(to, from + (w + 1) * per), file: join(tmp, `${w}.mp4`), label: `[w${w}]` })
        }
        await Promise.all(segs.map((s) => renderSegment(url, s.first, s.last, s.file, s.label, level)))
        writeFileSync(join(tmp, 'list.txt'), segs.map((s) => concatLine(s.file)).join('\n'))
        await ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', out]).done
        writeFileSync(`${out}.json`, `${JSON.stringify(manifest(root, film, query.query, meta, { fps, subframes, shutter, crf, scale, workers, level, from: from / fps, to: to / fps }), null, 2)}\n`)
        console.log(out)
      } finally {
        rmSync(tmp, { recursive: true, force: true })
      }
    }
  }

  try {
    const variants = flag('matrix') ? parseMatrix(flag('matrix')) : [{ query: '', suffix: '' }]
    let impure = 0
    for (const v of variants) {
      const q = [query, v.query].filter(Boolean).join('&')
      const vurl = `${base}${q && `?${q}`}`
      if (v.suffix) console.log(`── ${v.suffix}`)
      await run(vurl, variantOut(out, v.suffix, !stillsMode && !has('purity')), { query: q, suffix: v.suffix })
      impure += process.exitCode ?? 0
    }
    if (impure) process.exitCode = 1
  } finally {
    await browser.close()
    server.close()
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  await main().catch((e) => {
    console.error(`render: ${e.message}`)
    process.exit(1)
  })
}
