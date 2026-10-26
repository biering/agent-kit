#!/usr/bin/env node
// Checks a live URL the way X will see it: no redirects, the player card tags,
// a player page X may frame, and a poster that loads.
//
//   node .agents/skills/launch-video/scripts/player-card.mjs https://example.com/page
//
// references/x-player-card.md has the rules this checks.
//
// Exits non-zero on any fail. Needs Node 18+ (global fetch), no dependencies.

const target = process.argv[2]
if (!target) {
  console.error('usage: check.mjs <url you will post>')
  process.exit(2)
}

const UA = 'Twitterbot/1.0'
const results = []
const pass = (msg) => results.push(['pass', msg])
const fail = (msg) => results.push(['fail', msg])
const warn = (msg) => results.push(['warn', msg])

const get = (url) => fetch(url, { redirect: 'manual', headers: { 'user-agent': UA } })

function metaTags(html) {
  const tags = {}
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/gi)) {
    const key = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]
    const value = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1]
    if (key && value !== undefined && !(key in tags)) tags[key] = value.replaceAll('&amp;', '&')
  }
  return tags
}

function frameAncestorsAllowX(csp) {
  const directive = csp
    ?.split(';')
    .map((d) => d.trim())
    .find((d) => d.toLowerCase().startsWith('frame-ancestors'))
  if (!directive) return null
  const sources = directive.split(/\s+/).slice(1)
  if (sources.includes('*') || sources.includes('https:')) return true
  return ['x.com', 'twitter.com'].every((host) =>
    sources.some((s) => s.replace(/^https:\/\//, '').replace(/^\*\./, '') === host),
  )
}

if (!target.startsWith('https://')) fail(`${target} is not https`)

const page = await get(target)
if (page.status >= 300 && page.status < 400) {
  fail(`${target} answers ${page.status} -> ${page.headers.get('location')}; post the final URL`)
} else if (page.status !== 200) {
  fail(`${target} answers ${page.status}`)
} else {
  pass(`${target} answers 200 with no redirect`)
}

const tags = page.status === 200 ? metaTags(await page.text()) : {}
const card = tags['twitter:card']
if (card === 'player') pass('twitter:card = player')
else fail(`twitter:card = ${card ?? '(missing)'}, expected player`)

const width = Number(tags['twitter:player:width'])
const height = Number(tags['twitter:player:height'])
if (width > 0 && height > 0) pass(`player size ${width}x${height}`)
else fail('twitter:player:width / twitter:player:height missing or not numbers')

const poster = tags['twitter:image']
if (!poster) {
  fail('twitter:image missing: mobile shows only the poster')
} else {
  const res = await get(poster)
  const type = res.headers.get('content-type') ?? ''
  if (res.status === 200 && type.startsWith('image/')) pass(`poster loads (${type})`)
  else fail(`poster ${poster} answers ${res.status} ${type}`)
}

const player = tags['twitter:player']
if (!player) {
  fail('twitter:player missing')
} else if (!player.startsWith('https://')) {
  fail(`twitter:player ${player} must be an absolute https URL`)
} else {
  const res = await get(player)
  if (res.status !== 200) {
    fail(`player ${player} answers ${res.status}${res.headers.get('location') ? ` -> ${res.headers.get('location')}` : ''}`)
  } else {
    pass(`player ${player} answers 200`)
    const xfo = res.headers.get('x-frame-options')
    if (xfo) fail(`player sends X-Frame-Options: ${xfo}; remove it`)
    else pass('player sends no X-Frame-Options')
    const allowed = frameAncestorsAllowX(res.headers.get('content-security-policy'))
    if (allowed === true) pass('frame-ancestors allows x.com and twitter.com')
    else if (allowed === false) fail('frame-ancestors does not allow both x.com and twitter.com')
    else warn('no frame-ancestors header: any site may frame the player; prefer an explicit list')
  }
}

for (const [level, msg] of results) console.log(`${level.padEnd(4)}  ${msg}`)
process.exit(results.some(([level]) => level === 'fail') ? 1 : 0)
