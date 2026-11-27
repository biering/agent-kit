#!/usr/bin/env node
// Measures an MCP tool list against the mcp-design budgets: how many tools, how many tokens their
// definitions cost, and the per-tool checks a client or a directory reviewer would trip on.
//
// Usage:
//   node tool-budget.mjs tools.json                 a saved tools/list result, {tools:[...]} or [...]
//   node tool-budget.mjs --url https://host/mcp      ask a live server (streamable HTTP)
//       [--token-env NAME]                          bearer token from this environment variable
//   [--json]                                        machine-readable report
//   [--check] [--max-tools 20] [--max-tokens 8000] [--max-description 500] [--max-first-sentence 200]
//                                                   exit 1 when a budget or a check fails
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint']

/** About four characters per token for JSON tool definitions; close enough to budget with. */
export const estimateTokens = (chars) => Math.round(chars / 4)

const LOOKAROUND = /\(\?<?[=!]/

/** Keywords some providers reject in a published schema, which fails the whole tool list. */
export function unportable(schema, path = '') {
  if (!schema || typeof schema !== 'object') return []
  const found = []
  if (typeof schema.pattern === 'string' && LOOKAROUND.test(schema.pattern)) found.push(`lookaround in ${path || 'pattern'}`)
  if (typeof schema.$ref === 'string') found.push(`$ref at ${path || 'root'}`)
  for (const [key, value] of Object.entries(schema)) {
    if (value && typeof value === 'object') found.push(...unportable(value, path ? `${path}.${key}` : key))
  }
  return found
}

/** The first sentence: what a truncating client or a tool search reads first. */
export const firstSentence = (text) => text.split(/(?<=[.!?])\s|\n/)[0]

/** What a client puts in the model's context for one tool. */
export function definitionSize(tool) {
  const { name, title, description, inputSchema, outputSchema, annotations } = tool
  return JSON.stringify({ name, title, description, inputSchema, outputSchema, annotations }).length
}

export function analyze(tools, limits = {}) {
  const maxTools = limits.maxTools ?? 20
  const maxTokens = limits.maxTokens ?? 8000
  const maxDescription = limits.maxDescription ?? 500
  const maxFirstSentence = limits.maxFirstSentence ?? 200
  const rows = tools.map((tool) => {
    const annotations = tool.annotations ?? {}
    const problems = []
    if (tool.name.length > 64) problems.push('name over 64 characters')
    if (!/^[A-Za-z0-9_.-]+$/.test(tool.name)) problems.push('name has characters outside A-Z a-z 0-9 _ - .')
    if (!tool.title) problems.push('no title')
    if (!annotations.title) problems.push('no annotations.title')
    else if (tool.title && annotations.title !== tool.title) problems.push('annotations.title differs from title')
    const missing = HINTS.filter((hint) => typeof annotations[hint] !== 'boolean')
    if (missing.length) problems.push(`hints not set: ${missing.join(', ')}`)
    const description = tool.description ?? ''
    if (!description) problems.push('no description')
    else if (description.length > maxDescription) problems.push(`description ${description.length} characters`)
    const first = firstSentence(description)
    if (first.length > maxFirstSentence) problems.push(`first sentence ${first.length} characters`)
    const schemaProblems = [...new Set([...unportable(tool.inputSchema), ...unportable(tool.outputSchema)])]
    if (schemaProblems.length) problems.push(`unportable schema: ${schemaProblems.slice(0, 3).join(', ')}`)
    return {
      name: tool.name,
      group: tool.name.split(/[_.-]/)[0],
      chars: definitionSize(tool),
      description: description.length,
      readOnly: annotations.readOnlyHint === true,
      alwaysLoad: tool._meta?.['anthropic/alwaysLoad'] === true,
      problems,
    }
  })
  const chars = rows.reduce((sum, row) => sum + row.chars, 0)
  const groups = {}
  for (const row of rows) groups[row.group] = (groups[row.group] ?? 0) + 1
  const budget = []
  if (rows.length > maxTools) budget.push(`${rows.length} tools, budget ${maxTools}`)
  if (estimateTokens(chars) > maxTokens) budget.push(`about ${estimateTokens(chars)} tokens, budget ${maxTokens}`)
  const alwaysLoad = rows.filter((row) => row.alwaysLoad).map((row) => row.name)
  if (alwaysLoad.length > 5) budget.push(`${alwaysLoad.length} tools marked anthropic/alwaysLoad, at most 5`)
  return {
    tools: rows.length,
    readOnly: rows.filter((row) => row.readOnly).length,
    alwaysLoad,
    chars,
    tokens: estimateTokens(chars),
    groups: Object.entries(groups).sort((a, b) => b[1] - a[1]),
    largest: [...rows].sort((a, b) => b.chars - a.chars).slice(0, 10).map(({ name, chars }) => ({ name, tokens: estimateTokens(chars) })),
    problems: rows.filter((row) => row.problems.length).map(({ name, problems }) => ({ name, problems })),
    budget,
  }
}

async function rpc(url, token, session, body) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (token) headers.authorization = `Bearer ${token}`
  if (session) headers['mcp-session-id'] = session
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!response.ok && response.status !== 202) throw new Error(`${body.method}: HTTP ${response.status} ${await response.text()}`)
  const text = await response.text()
  const json = text.trim().startsWith('{') ? text : text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).pop()
  return { session: response.headers.get('mcp-session-id') ?? session, message: json ? JSON.parse(json) : null }
}

export async function fetchTools(url, token) {
  const init = await rpc(url, token, null, {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'tool-budget', version: '1' } },
  })
  await rpc(url, token, init.session, { jsonrpc: '2.0', method: 'notifications/initialized' })
  const tools = []
  let cursor
  for (let id = 2; id < 100; id++) {
    const { message } = await rpc(url, token, init.session, { jsonrpc: '2.0', id, method: 'tools/list', params: cursor ? { cursor } : {} })
    if (message?.error) throw new Error(`tools/list: ${message.error.message}`)
    tools.push(...(message?.result?.tools ?? []))
    cursor = message?.result?.nextCursor
    if (!cursor) break
  }
  return tools
}

function report(result) {
  const lines = [
    `${result.tools} tools (${result.readOnly} read-only), ${result.chars} characters, about ${result.tokens} tokens of definitions`,
    `groups by name prefix: ${result.groups.map(([group, n]) => `${group} ${n}`).join(', ')}`,
    `largest: ${result.largest.map((t) => `${t.name} ${t.tokens}`).join(', ')}`,
    `loaded upfront in Claude Code (anthropic/alwaysLoad): ${result.alwaysLoad.join(', ') || 'none'}`,
  ]
  if (result.budget.length) lines.push(`over budget: ${result.budget.join('; ')}`)
  if (result.problems.length) {
    lines.push(`${result.problems.length} tools with problems:`)
    for (const { name, problems } of result.problems) lines.push(`  ${name}: ${problems.join('; ')}`)
  }
  return lines.join('\n')
}

async function main(argv) {
  const flag = (name) => argv.includes(name)
  const value = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
  const url = value('--url')
  const file = argv.find((arg, i) => !arg.startsWith('--') && !argv[i - 1]?.startsWith('--'))
  if (!url && !file) {
    console.error('usage: tool-budget.mjs <tools.json> | --url <server> [--token-env NAME] [--json] [--check]')
    process.exit(2)
  }
  let tools
  if (url) {
    const tokenEnv = value('--token-env')
    tools = await fetchTools(url, tokenEnv ? process.env[tokenEnv] : undefined)
  } else {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    tools = Array.isArray(data) ? data : (data.tools ?? data.result?.tools ?? [])
  }
  const limits = {
    maxTools: value('--max-tools') ? Number(value('--max-tools')) : undefined,
    maxTokens: value('--max-tokens') ? Number(value('--max-tokens')) : undefined,
    maxDescription: value('--max-description') ? Number(value('--max-description')) : undefined,
    maxFirstSentence: value('--max-first-sentence') ? Number(value('--max-first-sentence')) : undefined,
  }
  const result = analyze(tools, limits)
  console.log(flag('--json') ? JSON.stringify(result, null, 2) : report(result))
  if (flag('--check') && (result.budget.length || result.problems.length)) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message)
    process.exit(2)
  })
}
