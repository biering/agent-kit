import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { collect } from '../src/lib/daylog.mjs'
import { collectStats, evalFormula, getPath, parseFormula } from '../src/lib/daystats.mjs'

const DAY = '2026-03-10'
const NOW = new Date('2026-03-11T00:05:30Z')

const tx = (id, type, amount, fee = 0, currency = 'usd') => ({ id, type, amount, fee, currency, customer: 'cus_SECRET', description: 'jane@example.com paid' })
// Stripe fixture: two charges (30.00 and 20.00, fees 1.17 and 0.88), one refund of 5.00, one in euros.
const stripePages = {
  first: { has_more: true, data: [tx('txn_1', 'charge', 3000, 117), tx('txn_2', 'charge', 2000, 88)] },
  second: { has_more: false, data: [tx('txn_3', 'refund', -500), tx('txn_4', 'charge', 999, 30, 'eur')] },
}
const calls = []
const fetchJson = async (url, headers) => {
  calls.push({ url, headers })
  if (url.includes('api.stripe.com')) return url.includes('starting_after=txn_2') ? stripePages.second : stripePages.first
  if (url.includes('/sites/site-a/')) return { data: { visitors: 120, signups: 7, updatedAt: '2026-03-11T00:01:00Z' } }
  if (url.includes('/sites/site-b/')) throw new Error('HTTP 503')
  if (url.includes('/counter')) return { count: 42 }
  throw new Error(`unexpected ${url}`)
}
const env = { ANALYTICS_TOKEN: 'a-token', PAY_KEY: 'a-key' }

const stats = {
  analytics: { url: 'https://stats.example.com/sites/{site}/summary?date={date}', tokenEnv: 'ANALYTICS_TOKEN', fields: { visitors: 'data.visitors', signups: 'data.signups' }, asOfPath: 'data.updatedAt' },
  products: [
    { name: 'Alpha', site: 'site-a', revenue: { provider: 'stripe', keyEnv: 'PAY_KEY', currency: 'usd' },
      counters: [{ name: 'Apps shipped', url: 'https://stats.example.com/counter?d={date}', path: 'count' }] },
    { name: 'Beta', site: 'site-b' },
  ],
  challenge: { name: 'Ten days', start: '2026-03-10', end: '2026-03-19', product: 'Alpha', score: { label: 'Points', formula: 'visitors / 10 + signups * 5 + profit' } },
}

/** A fixture repo with the previous day's log. */
function repoWithLog(ledger) {
  const dir = mkdtempSync(join(tmpdir(), 'daystats-'))
  if (ledger) {
    mkdirSync(join(dir, 'logs'))
    writeFileSync(join(dir, 'logs', '2026-03-09.md'), `---\ndate: 2026-03-09\n---\n\n## Stats\n\n<!-- stats-data: ${JSON.stringify(ledger)} -->\n\n## win: x\ny\nSource: PR #1\n`)
  }
  return dir
}
const run = (over = {}) => collectStats({ repoDir: repoWithLog(), logDir: 'logs', date: DAY, stats, env, fetchJson, now: NOW, ...over })

describe('Stats block', () => {
  it('reads each source once, even for several metrics', async () => {
    calls.length = 0
    await run()
    assert.equal(calls.filter((c) => c.url.includes('/sites/site-a/')).length, 1)
    assert.equal(calls.filter((c) => c.url.includes('api.stripe.com')).length, 2) // two pages of one source
  })

  it('shows visitors, sign-ups, revenue, refunds, fees and profit with source and as-of time', async () => {
    const { block } = await run()
    assert.match(block, /### Alpha/)
    assert.match(block, /\| Visitors \| 120 \| no comparison: no log for the day before \| 120 since 2026-03-10 \| analytics · as of 2026-03-11T00:01Z \|/)
    assert.match(block, /\| Sign-ups \| 7 /)
    assert.match(block, /\| Revenue \| 50\.00 USD .*stripe · as of 2026-03-11T00:05Z · 1 transaction\(s\) in other currencies not counted/)
    assert.match(block, /\| Refunds \| 5\.00 USD /)
    assert.match(block, /\| Fees \| 2\.05 USD /)
    assert.match(block, /\| Profit \| 42\.95 USD /) // 50 - 5 - 2.05
    assert.match(block, /\| Apps shipped \| 42 /)
  })

  it('writes not measured with the reason, never a guess', async () => {
    const { block } = await run()
    assert.match(block, /### Beta\n[^#]*\| Visitors \| not measured: HTTP 503 /) // one product failing does not stop the others
    assert.match((await run({ stats: { products: [{ name: 'Bare' }] } })).block, /### Bare\nNo analytics, revenue or counters configured\./)
    const failing = await run({ stats: { analytics: stats.analytics, products: [{ name: 'Beta', site: 'site-b' }] } })
    assert.match(failing.block, /\| Visitors \| not measured: HTTP 503 \| \| \| analytics \|/)
    const noEnv = await run({ env: {} })
    assert.match(noEnv.block, /\| Visitors \| not measured: \$ANALYTICS_TOKEN not set /)
    assert.match(noEnv.block, /\| Revenue \| not measured: \$PAY_KEY not set /)
    const missing = await run({ fetchJson: async () => ({ other: 1 }) })
    assert.match(missing.block, /not measured: field "data\.visitors" missing/)
  })

  it('compares with the day before and carries the running total from the previous log', async () => {
    const ledger = { v: 1, products: { Alpha: { visitors: { day: 100, total: 900, since: '2026-03-05' }, revenue: { day: 40, total: 40, since: '2026-03-09' } } }, challenge: { score: 100 } }
    const { block } = await run({ repoDir: repoWithLog(ledger) })
    assert.match(block, /\| Visitors \| 120 \| \+20 \(\+20\.0%\) \| 1020 since 2026-03-05 \|/)
    assert.match(block, /\| Revenue \| 50\.00 USD \| \+10\.00 USD \(\+25\.0%\) \| 90\.00 USD since 2026-03-09 \|/)
    assert.match(block, /\| Sign-ups \| 7 \| no comparison: not measured the day before /)
  })

  it('writes a machine-readable ledger of totals for tomorrow', async () => {
    const { block } = await run()
    const ledger = JSON.parse(block.match(/<!-- stats-data: (.*) -->/)[1])
    assert.deepEqual(ledger.products.Alpha.visitors, { day: 120, total: 120, since: '2026-03-10' })
    assert.equal(ledger.products.Alpha.profit.day, 42.95)
  })

  it('prints only totals: no customer, id or single payment', async () => {
    const { block } = await run()
    assert.doesNotMatch(block, /txn_|cus_|jane@|3000|30\.00/)
  })

  it('says not measured when the payment history is longer than the page cap', async () => {
    const { block } = await run({ stats: { products: [{ name: 'Alpha', revenue: { provider: 'stripe', keyEnv: 'PAY_KEY', maxPages: 1 } }] } })
    assert.match(block, /\| Revenue \| not measured: more than 100 transactions; raise maxPages /)
  })

  it('reads a generic REST revenue source and derives profit', async () => {
    const rest = { name: 'Gamma', revenue: { url: 'https://pay.example.com/day/{date}', tokenEnv: 'PAY_KEY', scale: 100, currency: 'eur', fields: { revenue: 'r', refunds: 'f', fees: 'e' } } }
    const { block } = await run({ stats: { products: [rest] }, fetchJson: async () => ({ r: 10000, f: 500, e: 300 }) })
    assert.match(block, /\| Profit \| 92\.00 EUR .*revenue - refunds - fees/)
  })

  it('reads a command source and a gauge counter', async () => {
    const s = { products: [{ name: 'Delta', counters: [{ name: 'Stars', cmd: ['count', '{date}'], path: 'n', kind: 'gauge' }] }] }
    const ledger = { v: 1, products: { Delta: { 'counter:stars': { day: 8, total: 8, since: '2026-03-09' } } } }
    const { block } = await run({ stats: s, repoDir: repoWithLog(ledger), run: (c, a) => (c === 'count' && a[0] === DAY ? '{"n":10}' : '') })
    assert.match(block, /\| Stars \| – \| \+2 \(\+25\.0%\) \| 10 since 2026-03-10 \|/)
  })

  it('refuses a literal secret in the config', async () => {
    await assert.rejects(run({ stats: { ...stats, analytics: { ...stats.analytics, token: 'abc' } } }), /literal "token".*environment/)
    await assert.rejects(run({ stats: { products: [{ name: 'A', revenue: { provider: 'stripe', key: 'x' } }] } }), /literal "key"/)
  })
})

describe('MCP sources', () => {
  const mcpStats = { products: [{ name: 'Eps', site: 's1', analytics: { mcp: { server: 'analytics', tool: 'summary', args: { site: '{site}', date: '{date}' } }, fields: { visitors: 'visitors' } } }] }
  it('asks for the read, then uses the result handed in', async () => {
    const first = await run({ stats: mcpStats })
    assert.match(first.block, /\| Visitors \| not measured: MCP read pending/)
    assert.deepEqual(first.mcpNeeded, [{ id: 'Eps/analytics', server: 'analytics', tool: 'summary', args: { site: 's1', date: DAY } }])
    const second = await run({ stats: mcpStats, mcp: { 'Eps/analytics': '{"visitors": 55}' } })
    assert.match(second.block, /\| Visitors \| 55 /)
    assert.deepEqual(second.mcpNeeded, [])
  })
})

describe('challenge', () => {
  it('shows day N of M, the formula and the score from running totals', async () => {
    const { block } = await run()
    assert.match(block, /### Challenge: Ten days\nDay 1 of 10 \(2026-03-10 to 2026-03-19\), product Alpha\./)
    assert.match(block, /Points = visitors \/ 10 \+ signups \* 5 \+ profit/)
    assert.match(block, /Points: 89\.95 \(no score logged for the day before\)/) // 12 + 35 + 42.95
  })
  it('shows the score change against the day before', async () => {
    const ledger = { v: 1, products: {}, challenge: { score: 80 } }
    const { block } = await run({ repoDir: repoWithLog(ledger) })
    assert.match(block, /Points: 89\.95 \(\+9\.95 \(\+12\.4%\) vs day before\)/)
  })
  it('does not score when a needed number is not measured', async () => {
    const { block } = await run({ env: { ANALYTICS_TOKEN: 'x' } })
    assert.match(block, /Points: not measured: Profit not measured/)
  })
  it('does not score on totals that start after the challenge start', async () => {
    const late = { ...stats, challenge: { ...stats.challenge, start: '2026-03-01' } }
    const { block } = await run({ stats: late })
    assert.match(block, /Day 10 of 19|Day 10 of 10/)
    assert.match(block, /Points: not measured: Visitors total starts 2026-03-10, not at the challenge start 2026-03-01/)
  })
  it('names the state before and after the challenge', async () => {
    assert.match((await run({ date: '2026-03-01', stats: { ...stats, challenge: { ...stats.challenge, start: '2026-03-02' } } })).block, /Starts 2026-03-02/)
    assert.match((await run({ date: '2026-04-01' })).block, /Ended 2026-03-19/)
  })
  it('needs a valid window and an existing product', async () => {
    await assert.rejects(run({ stats: { ...stats, challenge: { ...stats.challenge, end: '2026-03-01' } } }), /challenge needs/)
    await assert.rejects(run({ stats: { ...stats, challenge: { ...stats.challenge, product: 'Nope' } } }), /not in products/)
  })
})

describe('formula', () => {
  const val = (f, v = {}) => evalFormula(parseFormula(f), v)
  it('evaluates with precedence, parentheses and unary minus', () => {
    assert.equal(val('1 + 2 * 3'), 7)
    assert.equal(val('(1 + 2) * x - -2', { x: 3 }), 11)
  })
  it('rejects anything but numbers, names and + - * / ( )', () => {
    assert.throws(() => parseFormula('process.exit()'), /unexpected/)
    assert.throws(() => parseFormula('1 +'), /ends too early/)
    assert.throws(() => parseFormula('(1'), /misses/)
  })
  it('reports division by zero', () => assert.throws(() => val('1 / x', { x: 0 }), /divides by zero/))
  it('reads paths', () => assert.equal(getPath({ a: [{ b: 4 }] }, 'a[0].b'), 4))
})

describe('inside the digest', () => {
  it('leads with the Stats block and counts it in the budget', async () => {
    const s = await run()
    const out = collect({ repoDir: '.', date: DAY, config: { name: 'demo' }, run: () => '[]', stats: s })
    assert.ok(out.indexOf('## Stats') > out.indexOf('# Digest'))
    assert.match(out, /Nothing happened in the sources\./)
    const small = collect({ repoDir: '.', date: DAY, config: { name: 'demo' }, run: () => '[]', stats: s, budgetTokens: 5 })
    assert.match(small, /### Alpha/) // the stats are never cut
  })
  it('lists MCP reads outside the Stats block', async () => {
    const s = await run({ stats: { products: [{ name: 'Z', site: 'q', analytics: { mcp: { server: 'm', tool: 't' }, fields: { visitors: 'v' } } }] } })
    const out = collect({ repoDir: '.', date: DAY, config: { name: 'demo' }, run: () => '[]', stats: s })
    assert.match(out, /## MCP reads needed \(1\)[\s\S]*key Z\/analytics: m\.t/)
    assert.ok(out.indexOf('## MCP reads needed') > out.indexOf('<!-- stats-data'))
  })
})
