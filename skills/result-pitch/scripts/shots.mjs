#!/usr/bin/env node
// Screenshots of changed screens at desktop and phone width, for a result pitch (rules/result-review.md).
//
//   node shots.mjs --base=http://localhost:3000 --out=shots [--wait=800] [--full] [--channel=chrome] /settings /settings/sound
//
// For each path it writes <out>/<name>-desktop.png (1440 x 900) and <out>/<name>-phone.png (390 x 844, a
// phone's device scale and touch), where <name> is the path in kebab-case ("/" is "home"). It waits for the
// network to settle, then `--wait` ms more (animations), hides the usual dev overlays, and prints one line
// per file. `--full` takes the whole page instead of the first screen.
//
// Needs `playwright` (or `playwright-core` with --channel=chrome) resolvable from the working directory,
// the repo's own copy. Zero dependencies of its own.
import { mkdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
}
export const HIDE = ['#nuxt-devtools-container', 'nuxt-devtools-frame', '#nuxt-devtools-anchor', 'nextjs-portal', 'vite-error-overlay', 'astro-dev-toolbar']

/** The file name for a path: "/" is home, "/settings/sound?x=1" is settings-sound. */
export function nameOf(path) {
  const clean = String(path).split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')
  return clean ? clean.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() : 'home'
}

/** Read the command line: { base, out, wait, full, channel, paths }. */
export function parseArgs(argv) {
  const flag = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const paths = argv.filter((a) => !a.startsWith('--'))
  return {
    base: flag('base') ?? 'http://localhost:3000',
    out: flag('out') ?? 'shots',
    wait: Number(flag('wait') ?? 800),
    full: argv.includes('--full'),
    channel: flag('channel'),
    paths: paths.length ? paths : ['/'],
  }
}

function loadPlaywright(channel) {
  const require = createRequire(join(process.cwd(), 'noop.js'))
  for (const name of channel ? ['playwright-core', 'playwright'] : ['playwright', 'playwright-core']) {
    try {
      return require(name)
    } catch {}
  }
  throw new Error('Playwright not found from this folder: run it where the repo has playwright installed')
}

async function main() {
  const o = parseArgs(process.argv.slice(2))
  const { chromium } = loadPlaywright(o.channel)
  const out = resolve(o.out)
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch(o.channel ? { channel: o.channel } : {})
  try {
    for (const [kind, device] of Object.entries(VIEWPORTS)) {
      const ctx = await browser.newContext({ ...device, colorScheme: 'light' })
      const page = await ctx.newPage()
      for (const path of o.paths) {
        await page.goto(new URL(path, o.base).href, { waitUntil: 'networkidle' })
        await page.addStyleTag({ content: `${HIDE.join(',')}{display:none!important}` })
        await page.waitForTimeout(o.wait)
        const file = join(out, `${nameOf(path)}-${kind}.png`)
        await page.screenshot({ path: file, fullPage: o.full })
        console.log(`${kind.padEnd(7)} ${path}  ${file}`)
      }
      await ctx.close()
    }
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  await main().catch((e) => {
    console.error(`shots: ${e.message}`)
    process.exit(1)
  })
}
