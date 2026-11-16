/**
 * The Stats block of the daily log: per product, one UTC day's numbers with source and as-of time.
 *
 * Config is `daylog.stats` of agent-kit.config.json (see the README). Rules that never bend:
 *  - A number that could not be read is `not measured: <reason>`, never a guess or a zero.
 *  - Secrets come from the environment (`tokenEnv`, `keyEnv`); a literal secret in the config is refused.
 *  - Only totals leave this module: no customer, no single payment, no raw response.
 *  - One call per source, cached for the run (a source is the same URL, command or MCP read).
 *
 * Change against the day before and the running total come from the machine-readable line at the end
 * of the previous day's log (`<!-- stats-data: {...} -->`), so no second or third call is needed.
 * I/O is injected (`fetchJson`, `run`) so tests feed fixtures instead of the network.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MONEY = new Set(['revenue', 'refunds', 'fees', 'profit'])
const LABELS = { visitors: 'Visitors', signups: 'Sign-ups', revenue: 'Revenue', refunds: 'Refunds', fees: 'Fees', profit: 'Profit' }
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'])
const LEDGER = /<!--\s*stats-data:\s*(\{.*\})\s*-->/
const SECRET_KEYS = ['token', 'key', 'apiKey', 'secret', 'password']
const DAY_MS = 86_400_000

export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
const round2 = (n) => Math.round(n * 100) / 100
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))

/** `a.b[0].c` into a value; undefined when missing. */
export function getPath(obj, path) {
  let cur = obj
  for (const part of String(path).split(/\.|\[(\d+)\]/).filter((p) => p !== undefined && p !== '')) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = cur[part]
  }
  return cur
}

const fill = (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
const fillDeep = (v, vars) =>
  typeof v === 'string' ? fill(v, vars) : Array.isArray(v) ? v.map((x) => fillDeep(x, vars)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, vars)])) : v

export const defaultFetchJson = async (url, headers) => {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  try { return await res.json() } catch { throw new Error('response was not JSON') }
}

// ---------- the score formula: + - * / ( ), numbers and metric names; no eval ----------

export function parseFormula(text) {
  const tokens = String(text).match(/\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[-+*/()]|\S)/g)?.map((t) => t.trim()) ?? []
  let i = 0
  const vars = new Set()
  const peek = () => tokens[i]
  const expr = () => {
    let l = term()
    while (peek() === '+' || peek() === '-') { const op = tokens[i++]; l = { op, l, r: term() } }
    return l
  }
  const term = () => {
    let l = unary()
    while (peek() === '*' || peek() === '/') { const op = tokens[i++]; l = { op, l, r: unary() } }
    return l
  }
  const unary = () => (peek() === '-' ? (i++, { op: 'neg', l: unary() }) : atom())
  const atom = () => {
    const t = tokens[i++]
    if (t === undefined) throw new Error('formula ends too early')
    if (t === '(') { const e = expr(); if (tokens[i++] !== ')') throw new Error('formula misses a )'); return e }
    if (/^\d/.test(t)) return { num: Number(t) }
    if (/^[A-Za-z_]/.test(t)) { vars.add(t); return { v: t } }
    throw new Error(`formula has an unexpected "${t}"`)
  }
  const ast = expr()
  if (i < tokens.length) throw new Error(`formula has an unexpected "${tokens[i]}"`)
  return { ast, vars: [...vars] }
}

export function evalFormula(parsed, values) {
  const go = (n) => {
    if ('num' in n) return n.num
    if ('v' in n) return values[n.v]
    const a = go(n.l)
    if (n.op === 'neg') return -a
    const b = go(n.r)
    return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : a / b
  }
  const r = go(parsed.ast)
  if (!Number.isFinite(r)) throw new Error('the formula divides by zero')
  return r
}

// ---------- reading sources (one call each, cached) ----------

class Reader {
  constructor({ env, fetchJson, run, repoDir, mcp, nowIso }) {
    Object.assign(this, { env, fetchJson, run, repoDir, mcp, nowIso })
    this.cache = new Map()
    this.pending = new Map()
  }

  /** @returns {Promise<{ok:true,data:any,asOf:string}|{ok:false,reason:string}>} */
  async read(src, vars, id) {
    let key
    try {
      if (src.mcp) key = `mcp:${id}`
      else if (src.provider === 'stripe') key = `stripe:${src.keyEnv}:${vars.date}:${src.currency ?? 'usd'}`
      else if (src.cmd) key = `cmd:${JSON.stringify(fillDeep(src.cmd, vars))}`
      else if (src.url) key = `url:${src.tokenEnv ?? ''}:${fill(src.url, { ...vars, site: encodeURIComponent(vars.site ?? '') })}`
      else return { ok: false, reason: 'source has no url, cmd, mcp or provider' }
    } catch (e) {
      return { ok: false, reason: e.message }
    }
    if (!this.cache.has(key)) this.cache.set(key, this.#fetch(src, vars, id).catch((e) => ({ ok: false, reason: String(e.message ?? e).slice(0, 120) })))
    return this.cache.get(key)
  }

  async #fetch(src, vars, id) {
    const asOf = (data) => {
      const at = src.asOfPath ? getPath(data, src.asOfPath) : undefined
      return typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString().slice(0, 16) + 'Z' : this.nowIso
    }
    if (src.mcp) {
      let raw = this.mcp?.[id]
      if (raw === undefined) {
        this.pending.set(id, { id, server: src.mcp.server, tool: src.mcp.tool, args: fillDeep(src.mcp.args ?? {}, vars) })
        return { ok: false, reason: 'MCP read pending: no result supplied (--mcp <file>)' }
      }
      if (typeof raw === 'string') { try { raw = JSON.parse(raw) } catch { return { ok: false, reason: 'MCP result was not JSON' } } }
      return { ok: true, data: raw, asOf: asOf(raw) }
    }
    if (src.cmd) {
      const cmd = fillDeep(src.cmd, vars)
      let data
      try { data = JSON.parse(this.run(cmd[0], cmd.slice(1), this.repoDir)) } catch { return { ok: false, reason: `command ${cmd[0]} failed or printed no JSON` } }
      return { ok: true, data, asOf: asOf(data) }
    }
    const headers = {}
    const secretName = src.provider === 'stripe' ? src.keyEnv : src.tokenEnv
    if (secretName) {
      const secret = this.env[secretName]
      if (!secret) return { ok: false, reason: `$${secretName} not set` }
      const scheme = src.tokenScheme ?? 'Bearer'
      headers[src.tokenHeader ?? 'Authorization'] = scheme ? `${scheme} ${secret}` : secret
    } else if (src.provider === 'stripe') return { ok: false, reason: 'revenue source needs keyEnv (a read-only key)' }
    if (src.provider === 'stripe') return this.#stripe(src, vars, headers)
    const data = await this.fetchJson(fill(src.url, { ...vars, site: encodeURIComponent(vars.site ?? '') }), headers)
    return { ok: true, data, asOf: asOf(data) }
  }

  /** Balance transactions of the UTC day, summed to totals. Single transactions are never kept or printed. */
  async #stripe(src, vars, headers) {
    const currency = String(src.currency ?? 'usd').toLowerCase()
    const unit = ZERO_DECIMAL.has(currency) ? 1 : 100
    const maxPages = src.maxPages ?? 10
    const sum = { revenue: 0, refunds: 0, fees: 0 }
    let other = 0
    let after
    for (let page = 0; ; page++) {
      if (page >= maxPages) return { ok: false, reason: `more than ${maxPages * 100} transactions; raise maxPages` }
      const url = `https://api.stripe.com/v1/balance_transactions?created[gte]=${vars.startSec}&created[lt]=${vars.endSec}&limit=100${after ? `&starting_after=${after}` : ''}`
      const res = await this.fetchJson(url, headers)
      if (!Array.isArray(res?.data)) return { ok: false, reason: 'unexpected response from the payment provider' }
      for (const t of res.data) {
        if (String(t.currency ?? '').toLowerCase() !== currency) { other++; continue }
        if (t.type === 'charge' || t.type === 'payment') sum.revenue += t.amount
        else if (t.type === 'refund' || t.type === 'payment_refund') sum.refunds -= t.amount
        if (t.type === 'stripe_fee') sum.fees -= t.amount
        else sum.fees += t.fee ?? 0
      }
      if (!res.has_more) break
      after = res.data.at(-1)?.id
      if (!after) return { ok: false, reason: 'pagination broke' }
    }
    const data = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, round2(v / unit)]))
    data.profit = round2(data.revenue - data.refunds - data.fees)
    if (other) data.note = `${other} transaction(s) in other currencies not counted`
    return { ok: true, data, asOf: this.nowIso }
  }
}

// ---------- metric rows ----------

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)

/** Reads the fields of one source result into rows. */
function rowsFrom(res, role, fields, { scale = 1, gauge = {}, srcLabel, note }) {
  return Object.entries(fields).map(([id, spec]) => {
    const path = typeof spec === 'string' ? spec : spec.path
    const base = { id, label: LABELS[id] ?? id, money: MONEY.has(id), source: srcLabel, gauge: gauge[id] }
    if (!res.ok) return { ...base, reason: res.reason }
    let v = num(getPath(res.data, path))
    if (v === undefined) return { ...base, reason: `field "${path}" missing or not a number in the response` }
    if (MONEY.has(id)) v = round2(v / scale)
    const row = { ...base, value: v, asOf: res.asOf, note: note ?? (typeof res.data?.note === 'string' ? res.data.note : undefined) }
    const tp = typeof spec === 'object' ? spec.totalPath : undefined
    if (tp) {
      const t = num(getPath(res.data, tp))
      if (t !== undefined) row.sourceTotal = MONEY.has(id) ? round2(t / scale) : t
    }
    return row
  })
}

const STRIPE_FIELDS = { revenue: 'revenue', refunds: 'refunds', fees: 'fees', profit: 'profit' }

async function productRows(product, stats, reader, vars) {
  const rows = []
  const analytics = { ...(stats.analytics ?? {}), ...(product.analytics ?? {}) }
  const site = product.site ?? product.analytics?.site ?? stats.analytics?.site
  if (analytics.fields && (analytics.url || analytics.cmd || analytics.mcp)) {
    const res = await reader.read(analytics, { ...vars, site }, `${product.name}/analytics`)
    rows.push(...rowsFrom(res, 'analytics', analytics.fields, { srcLabel: analytics.label ?? 'analytics' }))
  }
  const rev = product.revenue
  if (rev) {
    const stripe = rev.provider === 'stripe'
    const res = await reader.read(rev, { ...vars, site }, `${product.name}/revenue`)
    const out = rowsFrom(res, 'revenue', stripe ? STRIPE_FIELDS : rev.fields ?? {}, {
      scale: stripe ? 1 : rev.scale ?? 1,
      srcLabel: rev.label ?? (stripe ? 'stripe' : 'revenue'),
    })
    const by = Object.fromEntries(out.map((r) => [r.id, r]))
    if (!stripe && !by.profit && by.revenue && by.refunds && by.fees) {
      const parts = [by.revenue, by.refunds, by.fees]
      out.push(parts.every((r) => r.value !== undefined)
        ? { id: 'profit', label: 'Profit', money: true, source: by.revenue.source, value: round2(by.revenue.value - by.refunds.value - by.fees.value), asOf: by.revenue.asOf, note: 'revenue - refunds - fees' }
        : { id: 'profit', label: 'Profit', money: true, source: by.revenue.source, reason: 'a part of revenue - refunds - fees was not measured' })
    }
    rows.push(...out)
    product._currency = String(rev.currency ?? 'usd').toUpperCase()
  }
  for (const c of product.counters ?? []) {
    const id = `counter:${slug(c.name)}`
    const res = await reader.read(c, { ...vars, site }, `${product.name}/${id}`)
    const [row] = rowsFrom(res, 'counter', { [id]: c.totalPath ? { path: c.path, totalPath: c.totalPath } : c.path }, { srcLabel: c.label ?? 'counter', gauge: { [id]: c.kind === 'gauge' } })
    row.label = c.name
    row.money = false
    rows.push(row)
  }
  return rows
}

// ---------- ledger: yesterday's log gives the day before and the running total ----------

export function readLedger(repoDir, logDir, date) {
  if (!logDir) return null
  const file = join(repoDir, logDir, `${date}.md`)
  if (!existsSync(file)) return null
  try { return JSON.parse(readFileSync(file, 'utf8').match(LEDGER)?.[1] ?? 'null') } catch { return null }
}

function withHistory(rows, prev, date) {
  for (const r of rows) {
    if (r.value === undefined) continue
    const p = prev?.[r.id]
    const before = r.gauge ? p?.total : p?.day
    if (before !== undefined && before !== null) r.before = before
    else r.beforeReason = prev === undefined ? 'no log for the day before' : 'not measured the day before'
    if (r.gauge) { r.total = r.value; r.since = date }
    else if (r.sourceTotal !== undefined) { r.total = r.sourceTotal; r.since = 'source' }
    else if (p?.total !== undefined && p?.total !== null && p.since && p.since !== 'source') { r.total = r.money ? round2(p.total + r.value) : p.total + r.value; r.since = p.since }
    else { r.total = r.value; r.since = date }
  }
}

// ---------- rendering ----------

const fmt = (r, v) => (r.money ? `${v.toFixed(2)} ${r.currency}` : String(v))
const signed = (r, d) => `${d >= 0 ? '+' : '-'}${fmt(r, Math.abs(d))}`
const delta = (r, now, before) => {
  const d = round2(now - before)
  const pct = before !== 0 ? ` (${d >= 0 ? '+' : '-'}${Math.abs((d / before) * 100).toFixed(1)}%)` : ''
  return `${signed(r, d)}${pct}`
}

function renderRow(r) {
  const src = r.source + (r.asOf ? ` · as of ${r.asOf}` : '') + (r.note ? ` · ${r.note}` : '')
  if (r.value === undefined) return `| ${r.label} | not measured: ${r.reason} | | | ${r.source} |`
  const day = r.gauge ? '–' : fmt(r, r.value)
  const change = r.before !== undefined
    ? delta(r, r.gauge ? r.total : r.value, r.before)
    : `no comparison: ${r.beforeReason}`
  const total = r.since && r.since !== 'source' ? `${fmt(r, r.total)} since ${r.since}` : fmt(r, r.total)
  return `| ${r.label} | ${day} | ${change} | ${total} | ${src} |`
}

function challengeBlock(ch, product, rows, prevCh, date) {
  const out = [`### Challenge: ${ch.name}`]
  const span = daysBetween(ch.start, ch.end) + 1
  const formula = ch.score?.formula
  const when = date < ch.start ? `starts ${ch.start}` : date > ch.end ? `ended ${ch.end}` : `day ${daysBetween(ch.start, date) + 1} of ${span}`
  out.push(`${when[0].toUpperCase()}${when.slice(1)} (${ch.start} to ${ch.end}), product ${product.name}.`)
  let score
  if (!formula) {
    out.push('Score: no definition configured.')
  } else {
    const label = ch.score.label ?? 'Score'
    out.push(`${label} = ${formula}, on the running totals below.`)
    let result
    try {
      const parsed = parseFormula(formula)
      const values = {}
      const byName = Object.fromEntries(rows.map((r) => [r.id.replace(/^counter:/, ''), r]))
      for (const v of parsed.vars) {
        const r = byName[v]
        if (!r) throw new Error(`"${v}" is not a metric of ${product.name}`)
        if (r.total === undefined) throw new Error(`${r.label} not measured`)
        if (r.since !== 'source' && r.since !== ch.start && !r.gauge) throw new Error(`${r.label} total starts ${r.since}, not at the challenge start ${ch.start}`)
        values[v] = r.total
      }
      result = round2(evalFormula(parsed, values))
    } catch (e) {
      out.push(`${label}: not measured: ${e.message}`)
    }
    if (result !== undefined) {
      score = result
      const before = prevCh?.score
      out.push(`${label}: ${result}${before !== undefined ? ` (${delta({}, result, before)} vs day before)` : ' (no score logged for the day before)'}`)
    }
  }
  return { text: out.join('\n'), ledger: { score, day: date >= ch.start && date <= ch.end ? daysBetween(ch.start, date) + 1 : undefined } }
}

function validate(stats) {
  const bad = (m) => { throw new Error(`daylog.stats: ${m}`) }
  const noSecret = (o, where) => { for (const k of SECRET_KEYS) if (o && typeof o === 'object' && k in o) bad(`${where} has a literal "${k}"; secrets come from the environment (tokenEnv / keyEnv)`) }
  noSecret(stats.analytics, 'analytics')
  if (!Array.isArray(stats.products) || !stats.products.length) bad('products must be a non-empty list')
  for (const p of stats.products) {
    if (!p?.name) bad('every product needs a name')
    noSecret(p, `product "${p.name}"`); noSecret(p.analytics, `product "${p.name}" analytics`); noSecret(p.revenue, `product "${p.name}" revenue`)
    for (const c of p.counters ?? []) { if (!c?.name) bad(`a counter of "${p.name}" needs a name`); noSecret(c, `counter "${c.name}"`) }
  }
  const ch = stats.challenge
  if (ch) {
    if (!ch.name || !isDate(ch.start) || !isDate(ch.end) || ch.end < ch.start) bad('challenge needs name, start and end (YYYY-MM-DD, end not before start)')
    if (!stats.products.some((p) => p.name === ch.product)) bad(`challenge.product "${ch.product}" is not in products`)
  }
}

/**
 * @param {{repoDir:string, date:string, stats:object, logDir?:string, env?:object, fetchJson?:Function, run?:Function, mcp?:object, now?:Date}} o
 * @returns {Promise<{block:string, mcpNeeded:{id:string,server:string,tool:string,args:object}[]}>}
 */
export async function collectStats({ repoDir, date, stats, logDir, env = process.env, fetchJson = defaultFetchJson, run, mcp, now = new Date() }) {
  validate(stats)
  const start = Date.parse(`${date}T00:00:00Z`)
  const vars = { date, prev: addDays(date, -1), next: addDays(date, 1), startMs: start, endMs: start + DAY_MS, startSec: start / 1000, endSec: (start + DAY_MS) / 1000 }
  const reader = new Reader({ env, fetchJson, run, repoDir, mcp, nowIso: now.toISOString().slice(0, 16) + 'Z' })
  const prevLog = readLedger(repoDir, logDir, vars.prev)
  const lines = [
    '## Stats',
    '',
    `Facts for the outside writer, not post text. UTC day ${date}. Every number names its source and as-of time; "not measured" means it could not be read, and is never an estimate.`,
  ]
  const ledger = { v: 1, products: {} }
  let challenge
  const done = await Promise.all(stats.products.map(async (p) => ({ p, rows: await productRows(p, stats, reader, vars) })))
  for (const { p, rows } of done) {
    for (const r of rows) r.currency = p._currency
    withHistory(rows, prevLog ? prevLog.products?.[p.name] ?? {} : undefined, date)
    lines.push('', `### ${p.name}`)
    if (!rows.length) { lines.push('No analytics, revenue or counters configured.'); continue }
    lines.push('| Metric | Day | Change vs day before | Running total | Source |', '|---|---|---|---|---|', ...rows.map(renderRow))
    ledger.products[p.name] = Object.fromEntries(rows.filter((r) => r.value !== undefined).map((r) => [r.id, { day: r.value, total: r.total, since: r.since }]))
    if (stats.challenge?.product === p.name) {
      challenge = challengeBlock(stats.challenge, p, rows, prevLog?.challenge, date)
    }
  }
  if (challenge) { lines.push('', challenge.text); ledger.challenge = challenge.ledger }
  lines.push('', `<!-- stats-data: ${JSON.stringify(ledger)} -->`)
  return { block: lines.join('\n'), mcpNeeded: [...reader.pending.values()] }
}

/** The "MCP reads needed" section, or ''. */
export function renderMcpNeeded(list) {
  if (!list.length) return ''
  return `\n## MCP reads needed (${list.length})\nCall each tool once, save the results as one JSON file {"<key>": <result>}, and run collect again with --mcp <file>.\n${list
    .map((m) => `- key ${m.id}: ${m.server}.${m.tool} ${JSON.stringify(m.args)}`)
    .join('\n')}\n`
}
