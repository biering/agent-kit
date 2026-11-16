#!/usr/bin/env node
// Record a short, silent explainer of the real app from a storyboard: the video a changelog entry
// carries and the one the app offers on the page it explains. A coded film (render.mjs) is another
// tool; this one shows the product as it is. The format is in references/explainer.md.
//
//   node record.mjs <storyboard.json> [--base=http://localhost:3000] [--out=public/video/x.mp4] [--channel=chrome]
//
// A storyboard (JSON has no comments; these are for illustration):
//   {
//     "out": "public/video/explainers/bulk-export.mp4",   // relative to the working directory
//     "page": "/app/reports",                             // the screen it explains, for an in-app link
//     "viewport": { "width": 1440, "height": 900 },       // the default
//     "colorScheme": "light",                             // the default
//     "caption": { "background": "#18181b", "color": "#fff" },   // the default
//     "hide": [".dev-toolbar"],                           // never shown in the recording
//     "setup": [                                          // run first, not recorded; its cookies carry over
//       { "goto": "/login" },
//       { "type": { "css": "#email", "env": "DEMO_EMAIL" } },
//       { "type": { "css": "#password", "env": "DEMO_PASSWORD" } },
//       { "click": "Log in" },
//       { "wait": { "url": "**/app/**" } }
//     ],
//     "steps": [
//       { "goto": "/app/reports" },
//       { "click": "Not now", "optional": true },         // a popover that may or may not be there
//       { "caption": "Select the rows you need.", "hold": 2600 },
//       { "scrollTo": "#export" },
//       { "click": "Export" },                            // accessible name: button, menuitem, link, tab
//       { "click": { "css": "[aria-label='Format']" } },
//       { "hover": { "css": "text=CSV" } },
//       { "type": { "css": "input[type=search]", "text": "March" } },
//       { "press": "Escape" },
//       { "caption": null },                              // hide the caption
//       { "wait": 1200 }                                  // ms, or { "url": glob } or { "css": selector }
//     ],
//     "mocks": [                                          // for services the local stack lacks
//       { "url": "**/api/files/42?*", "json": { "url": "/__explainer/plan.png" } },
//       { "url": "**/__explainer/plan.png", "file": "assets/plan.png" }   // relative to the storyboard
//     ]
//   }
//
// Every step takes an optional `hold` in ms. `type` takes `text`, or `env`: the name of an
// environment variable that holds the value (a test account the repo seeds, never a real
// password). A value read from the environment is never printed.
//
// How it records: Chrome's screencast (CDP) sends a frame whenever the page changes, at 2x. The
// frames are timed by their own timestamps and assembled by ffmpeg into a constant 30 fps H.264
// MP4 in BT.709, without audio, faststart. That is sharper than Playwright's recordVideo, whose
// bitrate is fixed. A still frame lasts at most MAX_STILL_S, so a slow dev server cannot stretch
// the video. A soft cursor glides to every click so the viewer can follow; captions are a pill in
// the page's own font.
//
// Needs ffmpeg on PATH and `playwright` (or `playwright-core` with --channel=chrome) resolvable
// from the working directory.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BT709_TAGS, TO_BT709, concatLine } from './render.mjs'

export const FPS = 30
/** A still frame never lasts longer than this: a slow dev server must not stretch the video. */
export const MAX_STILL_S = 3
export const DEFAULT_VIEWPORT = { width: 1440, height: 900 }
export const DEFAULT_CAPTION = { background: '#18181b', color: '#fff' }
/** Dev overlays no explainer should show. A storyboard's `hide` adds to these. */
export const DEFAULT_HIDE = ['#nuxt-devtools-container', 'nuxt-devtools-frame', '#nuxt-devtools-anchor', 'nextjs-portal', 'vite-error-overlay']

const ACTIONS = ['goto', 'caption', 'scrollTo', 'click', 'hover', 'type', 'press', 'wait']
/** What a step waits after it acts, in ms, when it sets no `hold`. */
const HOLD = { goto: 0, caption: 2600, captionOff: 300, scrollTo: 1100, click: 900, hover: 900, type: 900, press: 600, wait: 0 }

/** Read the command line: the storyboard path, the app's origin, an output override, a browser channel. */
export function parseArgs(argv) {
  const args = argv.filter((a) => a !== '--')
  const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  const storyboard = args.find((a) => !a.startsWith('--'))
  if (!storyboard) throw new Error('usage: record.mjs <storyboard.json> [--base=http://localhost:3000] [--out=file.mp4] [--channel=chrome]')
  return {
    storyboard,
    base: (flag('base') ?? 'http://localhost:3000').replace(/\/$/, ''),
    out: flag('out'),
    channel: flag('channel'),
  }
}

const isTarget = (t) => typeof t === 'string' ? t.length > 0 : typeof t?.css === 'string' && t.css.length > 0

function stepProblems(step, where) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return [`${where}: not an object`]
  const actions = ACTIONS.filter((a) => a in step)
  if (actions.length !== 1) return [`${where}: needs exactly one of ${ACTIONS.join(', ')}, has ${actions.join(', ') || 'none'}`]
  const [action] = actions
  const v = step[action]
  const problems = []
  if ('hold' in step && !(Number.isFinite(step.hold) && step.hold >= 0)) problems.push(`${where}: hold is ms, a number of 0 or more`)
  if (action === 'goto' && !(typeof v === 'string' && v.startsWith('/'))) problems.push(`${where}: goto is a path from the base, starting with /`)
  if (action === 'caption' && !(v === null || (typeof v === 'string' && v.trim()))) problems.push(`${where}: caption is a line of text, or null to hide it`)
  if (action === 'scrollTo' && !(typeof v === 'string' && v)) problems.push(`${where}: scrollTo is a CSS selector`)
  if ((action === 'click' || action === 'hover') && !isTarget(v)) problems.push(`${where}: ${action} is an accessible name or { "css": selector }`)
  if (action === 'type') {
    if (!isTarget({ css: v?.css })) problems.push(`${where}: type needs { "css": selector }`)
    if (('text' in (v ?? {})) === ('env' in (v ?? {}))) problems.push(`${where}: type needs text or env, not both`)
    if (v && 'env' in v && !/^[A-Z_][A-Z0-9_]*$/.test(v.env)) problems.push(`${where}: env is a variable name like DEMO_EMAIL`)
  }
  if (action === 'press' && !(typeof v === 'string' && v)) problems.push(`${where}: press is a key like Escape`)
  if (action === 'wait' && !((Number.isFinite(v) && v >= 0) || typeof v?.url === 'string' || typeof v?.css === 'string')) {
    problems.push(`${where}: wait is ms, { "url": glob } or { "css": selector }`)
  }
  return problems
}

/** Check a storyboard and fill its defaults. Throws one error that lists every problem. */
export function validateStoryboard(story) {
  const problems = []
  if (!story || typeof story !== 'object') throw new Error('storyboard: not a JSON object')
  if (typeof story.out !== 'string' || !/\.mp4$/i.test(story.out)) problems.push('out: an .mp4 path')
  if (typeof story.page !== 'string' || !story.page) problems.push('page: the screen it explains')
  const viewport = { ...DEFAULT_VIEWPORT, ...story.viewport }
  if (![viewport.width, viewport.height].every((n) => Number.isInteger(n) && n >= 320 && n % 2 === 0)) {
    problems.push('viewport: even whole widths and heights of 320 or more')
  }
  const colorScheme = story.colorScheme ?? 'light'
  if (!['light', 'dark'].includes(colorScheme)) problems.push('colorScheme: light or dark')
  const setup = story.setup ?? []
  const steps = story.steps ?? []
  if (!Array.isArray(setup)) problems.push('setup: a list of steps')
  else setup.forEach((s, i) => {
    problems.push(...stepProblems(s, `setup ${i + 1}`))
    if (s && 'caption' in s) problems.push(`setup ${i + 1}: not recorded, so no caption`)
  })
  if (!Array.isArray(steps) || !steps.length) problems.push('steps: at least one step')
  else {
    steps.forEach((s, i) => problems.push(...stepProblems(s, `step ${i + 1}`)))
    if (!steps[0]?.goto) problems.push('step 1: a goto, so the recording opens on a page')
  }
  const mocks = story.mocks ?? []
  if (!Array.isArray(mocks)) problems.push('mocks: a list')
  else mocks.forEach((m, i) => {
    if (typeof m?.url !== 'string' || !m.url) problems.push(`mock ${i + 1}: needs url`)
    if (('json' in (m ?? {})) === ('file' in (m ?? {}))) problems.push(`mock ${i + 1}: needs json or file, not both`)
  })
  if (problems.length) throw new Error(`storyboard:\n  ${problems.join('\n  ')}`)
  return {
    ...story,
    viewport,
    colorScheme,
    caption: { ...DEFAULT_CAPTION, ...story.caption },
    hide: [...DEFAULT_HIDE, ...(story.hide ?? [])],
    setup,
    steps,
    mocks,
  }
}

/**
 * Turn storyboard steps into what the recorder runs: one action each, its hold filled in and an
 * env value read. `label` is what the log prints; it never carries a value read from env.
 */
export function resolveSteps(steps, env = process.env) {
  return steps.map((step, i) => {
    const action = ACTIONS.find((a) => a in step)
    const r = { action, optional: step.optional === true }
    if (action === 'type') {
      const fromEnv = 'env' in step.type
      const text = fromEnv ? env[step.type.env] : step.type.text
      if (fromEnv && !text) throw new Error(`step ${i + 1}: environment variable ${step.type.env} is not set`)
      Object.assign(r, { css: step.type.css, text })
      r.label = `type ${step.type.css} ${fromEnv ? `$${step.type.env}` : JSON.stringify(text)}`
    } else {
      r.value = step[action]
      r.label = `${action} ${JSON.stringify(r.value)}`.slice(0, 90)
    }
    const key = action === 'caption' && !step.caption ? 'captionOff' : action
    r.hold = step.hold ?? HOLD[key]
    return r
  })
}

/** Resolve each mock's file against the storyboard's folder. */
export const resolveMocks = (mocks, storyDir) => mocks.map((m) => ('file' in m ? { ...m, file: resolve(storyDir, m.file) } : m))

/** How a click target is found: an accessible name (button, menuitem, link, tab), whole, any case; or CSS. */
export function targetQuery(target) {
  if (typeof target !== 'string') return { css: target.css }
  return { roles: ['button', 'menuitem', 'link', 'tab'], name: new RegExp(`^${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
}

/**
 * The ffconcat list for the screencast frames: each lasts until the next one, the last until the
 * end, none longer than maxStill. `shots` are { file, t } with t in seconds.
 */
export function concatList(shots, end, maxStill = MAX_STILL_S) {
  if (!shots.length) throw new Error('no frames were recorded')
  const lines = ['ffconcat version 1.0']
  let clipped = 0
  shots.forEach((shot, i) => {
    const next = shots[i + 1]?.t ?? Math.max(shot.t + 0.5, end)
    const gap = Math.max(0.001, next - shot.t)
    if (gap > maxStill) clipped += 1
    lines.push(concatLine(shot.file), `duration ${Math.min(maxStill, gap).toFixed(4)}`)
  })
  lines.push(concatLine(shots.at(-1).file)) // ffconcat drops the last duration without a repeat
  return { text: lines.join('\n'), clipped }
}

/** The ffmpeg arguments that turn the list into the explainer. */
export const encodeArgs = (list, out, width) => [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-vf', `fps=${FPS},scale=${width}:-2:flags=lanczos,${TO_BT709}`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-tune', 'stillimage', ...BT709_TAGS,
  '-movflags', '+faststart', '-an', out,
]

/** The cursor and the caption pill, installed in every page of the recorded context. */
function overlay({ caption, hide }) {
  const install = () => {
    if (document.getElementById('rec-cursor')) return
    const style = document.createElement('style')
    style.textContent = `
      #rec-cursor { position: fixed; z-index: 2147483647; width: 22px; height: 22px; margin: -11px 0 0 -11px;
        border-radius: 999px; background: rgba(24, 24, 27, .16); border: 2px solid rgba(24, 24, 27, .85);
        box-shadow: 0 0 0 1.5px rgba(255, 255, 255, .9); pointer-events: none; transition: transform .12s ease-out;
        left: -50px; top: -50px; }
      #rec-cursor.down { transform: scale(.7); }
      #rec-caption { position: fixed; z-index: 2147483646; left: 50%; bottom: 40px; transform: translate(-50%, 12px);
        max-width: min(880px, calc(100vw - 64px)); padding: 14px 24px; border-radius: 999px;
        background: ${caption.background}; color: ${caption.color};
        font-family: inherit; font-size: 20px; font-weight: 600; line-height: 1.35; text-align: center;
        box-shadow: 0 12px 32px rgba(0, 0, 0, .22); opacity: 0; transition: opacity .25s ease, transform .25s ease;
        pointer-events: none; }
      #rec-caption.on { opacity: 1; transform: translate(-50%, 0); }
      ${hide.join(', ')} { display: none !important; }
    `
    document.head.appendChild(style)
    const cursor = Object.assign(document.createElement('div'), { id: 'rec-cursor' })
    const pill = Object.assign(document.createElement('div'), { id: 'rec-caption' })
    document.body.append(cursor, pill)
    addEventListener('mousemove', (e) => { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px` }, true)
    addEventListener('mousedown', () => cursor.classList.add('down'), true)
    addEventListener('mouseup', () => cursor.classList.remove('down'), true)
  }
  if (document.body) install()
  else document.addEventListener('DOMContentLoaded', install)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Wall-clock seconds, the clock the screencast frames are stamped with. */
const nowS = () => (performance.timeOrigin + performance.now()) / 1000

function loadChromium(channel) {
  const require = createRequire(join(process.cwd(), 'noop.js'))
  for (const name of ['playwright', 'playwright-core']) {
    try {
      return { chromium: require(name).chromium, channel: channel ?? (name === 'playwright-core' ? 'chrome' : undefined) }
    } catch {}
  }
  throw new Error('playwright is not resolvable from the working directory (npm i playwright && npx playwright install chromium)')
}

function locate(page, target) {
  const q = targetQuery(target)
  if (q.css) return page.locator(q.css).first()
  return q.roles.map((role) => page.getByRole(role, { name: q.name })).reduce((a, b) => a.or(b)).first()
}

async function run(page, step, { base, pointer, onPage }) {
  const glideTo = async (locator) => {
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    if (!box) throw new Error('target has no box')
    const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const steps = Math.max(12, Math.min(45, Math.round(Math.hypot(to.x - pointer.x, to.y - pointer.y) / 18)))
    for (let i = 1; i <= steps; i++) {
      const ease = 1 - (1 - i / steps) ** 3
      await page.mouse.move(pointer.x + (to.x - pointer.x) * ease, pointer.y + (to.y - pointer.y) * ease)
      await sleep(14)
    }
    Object.assign(pointer, to)
  }
  const { action, value } = step
  if (action === 'goto') {
    await page.goto(`${base}${value}`, { waitUntil: 'networkidle', timeout: 120_000 })
    await sleep(1500)
    await page.mouse.move(pointer.x, pointer.y)
    await onPage?.()
  } else if (action === 'caption') {
    await page.evaluate((text) => {
      const el = document.getElementById('rec-caption')
      if (!el) return
      if (text) el.textContent = text
      el.classList.toggle('on', Boolean(text))
    }, value)
  } else if (action === 'scrollTo') {
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), value)
  } else if (action === 'click' || action === 'hover') {
    const target = locate(page, value)
    try {
      await target.waitFor({ state: 'visible', timeout: step.optional ? 2000 : 30_000 })
    } catch (e) {
      if (step.optional) return
      throw e
    }
    await glideTo(target)
    if (action === 'click') {
      await sleep(250)
      await page.mouse.down()
      await sleep(90)
      await page.mouse.up()
    }
  } else if (action === 'type') {
    const field = locate(page, { css: step.css })
    await field.waitFor({ state: 'visible', timeout: 30_000 })
    await glideTo(field)
    await field.click()
    await page.keyboard.type(step.text, { delay: 110 })
  } else if (action === 'press') {
    await page.keyboard.press(value)
  } else if (action === 'wait') {
    if (typeof value === 'number') await sleep(value)
    else if (value.url) await page.waitForURL(value.url, { timeout: 60_000 })
    else await page.locator(value.css).first().waitFor({ state: 'visible', timeout: 60_000 })
  }
  await sleep(step.hold)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const storyPath = resolve(opts.storyboard)
  const story = validateStoryboard(JSON.parse(readFileSync(storyPath, 'utf8')))
  const setup = resolveSteps(story.setup)
  const steps = resolveSteps(story.steps)
  const mocks = resolveMocks(story.mocks, dirname(storyPath))
  const out = resolve(opts.out ?? story.out)
  const { viewport } = story
  mkdirSync(dirname(out), { recursive: true })

  const { chromium, channel } = loadChromium(opts.channel)
  const browser = await chromium.launch({ channel, headless: true })
  const frames = mkdtempSync(join(tmpdir(), 'explainer-'))
  const pointer = { x: viewport.width / 2, y: viewport.height / 2 }
  try {
    // 1. Setup where nothing is recorded: log in with the test account, accept a banner.
    let storageState
    if (setup.length) {
      const ctx = await browser.newContext({ viewport, colorScheme: story.colorScheme })
      const page = await ctx.newPage()
      for (const [i, step] of setup.entries()) {
        console.log(`setup ${i + 1}/${setup.length} ${step.label}`)
        await run(page, step, { base: opts.base, pointer: { ...pointer } })
      }
      storageState = await ctx.storageState()
      await ctx.close()
    }

    // 2. Record.
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: story.colorScheme, storageState })
    await ctx.addInitScript(overlay, { caption: story.caption, hide: story.hide })
    for (const mock of mocks) {
      await ctx.route(mock.url, (route) => (mock.file ? route.fulfill({ path: mock.file }) : route.fulfill({ json: mock.json })))
    }
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    const shots = []
    let recording = false
    cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
      await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
      if (!recording) return
      const file = join(frames, `f${String(shots.length).padStart(5, '0')}.jpg`)
      shots.push({ file, t: metadata.timestamp })
      writeFileSync(file, Buffer.from(data, 'base64'))
    })
    const startRecording = async () => {
      if (recording) return
      await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: viewport.width * 2, maxHeight: viewport.height * 2 })
      recording = true
      await sleep(400)
    }

    for (const [i, step] of steps.entries()) {
      const start = nowS()
      console.log(`step ${i + 1}/${steps.length} ${step.label}`)
      await run(page, step, { base: opts.base, pointer, onPage: startRecording })
      console.log(`  ${(nowS() - start).toFixed(1)} s`)
    }
    await sleep(600)
    const end = nowS()
    await cdp.send('Page.stopScreencast')
    await ctx.close()

    // 3. Assemble.
    const { text, clipped } = concatList(shots, end)
    if (clipped) console.warn(`${clipped} still(s) longer than ${MAX_STILL_S} s were shortened; split a long hold into steps that change the screen`)
    const list = join(frames, 'frames.ffconcat')
    writeFileSync(list, text)
    execFileSync('ffmpeg', encodeArgs(list, out, viewport.width), { stdio: 'inherit' })
    console.log(`Wrote ${out} (${shots.length} frames)`)
  } finally {
    await browser.close()
    rmSync(frames, { recursive: true, force: true })
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  await main().catch((e) => {
    console.error(`record: ${e.message}`)
    process.exit(1)
  })
}
