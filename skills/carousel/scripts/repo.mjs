/**
 * Where the carousel skill finds the repo it runs in: its root, its config and its Playwright.
 *
 *   agent-kit.config.json (repo root)
 *   { "carousel": { "brands": "docs/marketing/brands", "playwright": "apps/web" } }
 *
 * `brands` is the folder of the repo's brands (one folder per product, see SKILL.md). Without it
 * only the skill's own `brands/example` exists. `playwright` is a folder whose node_modules has
 * `playwright` or `playwright-core`; without it the current directory and the repo root are tried.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

function gitRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return process.cwd()
  }
}

export const REPO_ROOT = gitRoot()

function readConfig() {
  const file = path.join(REPO_ROOT, 'agent-kit.config.json')
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf8')).carousel ?? {}
  } catch {
    return {}
  }
}

export const CONFIG = readConfig()

/** The repo's brands folder, or null when the config names none. */
export const REPO_BRANDS_DIR = CONFIG.brands ? path.resolve(REPO_ROOT, CONFIG.brands) : null

/** Playwright's chromium from the configured folder, the cwd or the repo root. */
export function loadChromium() {
  const dirs = [CONFIG.playwright && path.resolve(REPO_ROOT, CONFIG.playwright), process.cwd(), REPO_ROOT].filter(Boolean)
  for (const dir of dirs) {
    const require = createRequire(path.join(dir, 'package.json'))
    for (const name of ['playwright', 'playwright-core']) {
      try {
        return require(name).chromium
      } catch {}
    }
  }
  throw new Error(
    `Playwright not found in ${dirs.join(', ')}: npm i playwright in the working directory, or set carousel.playwright in agent-kit.config.json`,
  )
}

/** Launch Chromium; falls back to the installed Chrome when Playwright's own is not downloaded. */
export async function launchChromium(options = {}) {
  const chromium = loadChromium()
  try {
    return await chromium.launch(options)
  } catch {
    console.warn(`! Playwright's Chromium is not downloaded, rendering with the installed Chrome`)
    return chromium.launch({ ...options, channel: 'chrome' })
  }
}
