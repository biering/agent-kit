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
// slow footage.
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
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
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

/** Motion-blur sample times for output frame f: `n` subframes spread over `shutter` of a frame. */
export function subframeTimes(f, n, fps, shutter) {
  return Array.from({ length: n }, (_, s) => Math.max(0, (f + (n > 1 ? (s / (n - 1) - 0.5) * shutter : 0)) / fps))
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
  const film = resolve(filmPath)
  const stillsMode = flag('stills') && !has('purity')
  const out = resolve(flag('out', stillsMode ? 'stills' : 'film.mp4'))
  const fps = Number(flag('fps', 60))
  const subframes = Number(flag('subframes', 4))
  const workers = Number(flag('workers', 4))
  const shutter = Number(flag('shutter', 0.5))
  const stills = flag('stills')
  const crf = flag('crf', '14')

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
  const browser = await chromium.launch()

  async function openPage(url) {
    const page = await browser.newPage()
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
      const { width, height, duration, beat, cuts } = window.film
      return { width, height, duration, beat, cuts }
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

  const shot = async (page, t, type = 'jpeg') => {
    await page.evaluate((t) => window.film.seek(t), t)
    return page.screenshot(type === 'png' ? { type } : { type, quality: 95 })
  }

  async function renderSegment(url, first, last, file, label) {
    const { page } = await openPage(url)
    const n = subframes
    const vf = n > 1 ? `tmix=frames=${n},select='eq(mod(n\\,${n})\\,${n - 1})',setpts=N/${fps}/TB` : 'null'
    const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps * n), '-i', '-', '-vf', vf,
      '-r', String(fps), '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', file])
    const started = Date.now()
    for (let f = first; f < last; f++) {
      for (const t of subframeTimes(f, n, fps, shutter)) {
        const buf = await shot(page, t)
        if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r))
      }
      if ((f - first) % 60 === 59) {
        const rate = (f - first + 1) / ((Date.now() - started) / 1000)
        console.log(`${label} frame ${f + 1}/${last} (${rate.toFixed(1)} fps)`)
      }
    }
    enc.stdin.end()
    await enc.done
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
        writeFileSync(file, await shot(page, t, 'png'))
        files.push(file)
        const small = await smallText(page, min)
        console.log(small.length ? `${file}  small text: ${small.map((s) => `${s.px} px "${s.text}"`).join(', ')}` : file)
      }
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
      const per = Math.ceil((to - from) / workers)
      const tmp = join(dirname(out), `.segments-${Date.now()}`)
      mkdirSync(tmp, { recursive: true })
      try {
        const segs = []
        for (let w = 0; w < workers && from + w * per < to; w++) {
          segs.push({ first: from + w * per, last: Math.min(to, from + (w + 1) * per), file: join(tmp, `${w}.mp4`), label: `[w${w}]` })
        }
        await Promise.all(segs.map((s) => renderSegment(url, s.first, s.last, s.file, s.label)))
        writeFileSync(join(tmp, 'list.txt'), segs.map((s) => concatLine(s.file)).join('\n'))
        await ffmpeg(['-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-c', 'copy', out]).done
        writeFileSync(`${out}.json`, `${JSON.stringify(manifest(root, film, query.query, meta, { fps, subframes, shutter, crf, from: from / fps, to: to / fps }), null, 2)}\n`)
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
