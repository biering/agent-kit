/**
 * Capture the sample app's screens into ../caps/ at 1206x2622 (402x874 @3x).
 *
 *     node capture.mjs [--chrome <path to Chrome>]
 *
 * Only for this fictional example. A real app's captures come from the
 * simulator (SKILL.md, step 3). Needs playwright-core, resolved from the
 * working directory, and an installed Chrome.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const chrome = argv.includes('--chrome')
  ? argv[argv.indexOf('--chrome') + 1]
  : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const { chromium } = createRequire(path.join(process.cwd(), 'package.json'))('playwright-core')

const browser = await chromium.launch({ executablePath: chrome })
const page = await browser.newPage({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 3 })
await page.goto(pathToFileURL(path.join(here, 'screens.html')).href)
for (const [n, id] of ['list', 'detail', 'paste', 'found', 'privacy', 'share', 'week'].entries()) {
  const file = path.join(here, '..', 'caps', `${String(n + 1).padStart(2, '0')}-${id}.png`)
  await page.locator(`#${id}`).screenshot({ path: file })
  console.log(file)
}
await browser.close()
