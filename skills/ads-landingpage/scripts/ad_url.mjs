#!/usr/bin/env node
/**
 * Build the URL an ad points at, with the campaign parameters of the ads-landingpage skill.
 *
 *   node ad_url.mjs <brand> <slug> --source meta --campaign <slug>_2026_10_signup \
 *     [--content <angle>_video_a] [--term keyword] [--medium cpc] [--register <path>]
 *
 * The repo's settings are the `ads` block of agent-kit.config.json, found by walking up from
 * the working directory:
 *
 *   "ads": {
 *     "register": "docs/marketing/ads/README.md",
 *     "brands": { "<brand>": "https://example.com/lp/{slug}/" },
 *     "sources": { "meta": "paid_social", "google": "cpc" }
 *   }
 *
 * `sources` is optional. The register is a markdown file with one table row per page: the page
 * URL in the first cell, its status in the second.
 *
 * Refuses a page that is not in the register or is a draft there, an unknown source or medium,
 * and a campaign that does not start with the page's slug: those are the mistakes that make a
 * campaign unreadable afterwards.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The medium a source runs on unless told otherwise. */
export const SOURCES = { meta: 'paid_social', linkedin: 'paid_social', tiktok: 'paid_social', google: 'cpc' }
export const MEDIUMS = ['paid_social', 'cpc']
const FLAGS = ['source', 'medium', 'campaign', 'content', 'term', 'register']
const VALUE = /^[a-z0-9_{}.]+$/

/** The repo root (the nearest folder holding agent-kit.config.json) and its `ads` block. */
export function loadSettings(start = process.cwd()) {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const file = join(dir, 'agent-kit.config.json')
    if (existsSync(file)) {
      const ads = JSON.parse(readFileSync(file, 'utf8')).ads
      if (!ads?.brands || !ads?.register) throw new Error(`${file} has no "ads" block with "register" and "brands"`)
      return { root: dir, ...ads }
    }
    if (dirname(dir) === dir) throw new Error('no agent-kit.config.json above the working directory')
  }
}

export function adUrl({ brand, slug, source, medium, campaign, content, term }, register, settings) {
  const pattern = settings.brands[brand]
  if (!pattern) throw new Error(`unknown brand "${brand}" (${Object.keys(settings.brands).join(', ')})`)
  const sources = settings.sources ?? SOURCES
  const page = pattern.replace('{slug}', slug)
  const row = register.split('\n').find((line) => line.includes(`| ${page} |`))
  if (!row) throw new Error(`${page} is not in the ads register`)
  if ((row.split('|')[2] ?? '').includes('draft')) throw new Error(`${page} is a draft and has no route yet`)
  if (!(source in sources)) throw new Error(`unknown source "${source}" (${Object.keys(sources).join(', ')})`)
  const resolvedMedium = medium ?? sources[source]
  if (!MEDIUMS.includes(resolvedMedium)) throw new Error(`medium must be one of ${MEDIUMS.join(', ')}`)
  const prefix = slug.replaceAll('-', '_')
  if (!campaign?.startsWith(prefix)) throw new Error(`campaign must start with "${prefix}"`)
  const params = { utm_source: source, utm_medium: resolvedMedium, utm_campaign: campaign, utm_content: content, utm_term: term }
  const query = Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      if (!VALUE.test(value)) throw new Error(`${key} "${value}": lower case, digits, _ and a network macro in {} only`)
      // Network macros ({{ad.name}}, {keyword}) must reach the network unencoded.
      return `${key}=${value}`
    })
    .join('&')
  return `${page}?${query}`
}

function parseArgs(argv) {
  const [brand, slug, ...rest] = argv
  const options = { brand, slug }
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]?.replace(/^--/, '')
    if (!FLAGS.includes(key)) throw new Error(`unknown option ${rest[index]} (${FLAGS.map((flag) => `--${flag}`).join(', ')})`)
    if (rest[index + 1] === undefined) throw new Error(`missing value for ${rest[index]}`)
    options[key] = rest[index + 1]
  }
  return options
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (!options.brand || !options.slug) {
      throw new Error('usage: ad_url.mjs <brand> <slug> --source <source> --campaign <campaign> [--content <c>] [--term <t>] [--medium <m>] [--register <path>]')
    }
    const settings = loadSettings()
    const register = readFileSync(resolve(settings.root, options.register ?? settings.register), 'utf8')
    console.log(adUrl(options, register, settings))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
