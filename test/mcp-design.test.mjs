import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { analyze, estimateTokens, unportable } from '../skills/mcp-design/scripts/tool-budget.mjs'

const root = new URL('..', import.meta.url)
const read = (file) => readFileSync(new URL(file, root), 'utf8')

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const tool = (name, extra = {}) => ({
  name,
  title: `T ${name}`,
  description: `Does ${name}.`,
  inputSchema: { type: 'object', additionalProperties: false },
  annotations: { ...READ, title: `T ${name}` },
  ...extra,
})

describe('tool-budget', () => {
  it('passes a small, fully annotated list', () => {
    const result = analyze([tool('projects_list'), tool('projects_get')])
    assert.equal(result.tools, 2)
    assert.equal(result.readOnly, 2)
    assert.deepEqual(result.problems, [])
    assert.deepEqual(result.budget, [])
    assert.deepEqual(result.groups, [['projects', 2]])
  })

  it('flags what a client or a directory reviewer trips on', () => {
    const result = analyze([
      tool('x'.repeat(65)),
      tool('invoices_list', { annotations: { readOnlyHint: true } }),
      tool('invoices_get', { description: 'y'.repeat(501) }),
      tool('invoices refund'),
    ])
    const by = Object.fromEntries(result.problems.map((p) => [p.name, p.problems.join('; ')]))
    assert.match(by['x'.repeat(65)], /name over 64/)
    assert.match(by.invoices_list, /no annotations\.title/)
    assert.match(by.invoices_list, /hints not set: destructiveHint, idempotentHint, openWorldHint/)
    assert.match(by.invoices_get, /description 501 characters/)
    assert.match(by['invoices refund'], /characters outside/)
  })

  it('flags a long first sentence and a schema a provider rejects', () => {
    const email = { type: 'string', pattern: "^(?!\\.)[^@]+@[^@]+$" }
    const result = analyze([
      tool('contacts_create', { inputSchema: { type: 'object', properties: { email } } }),
      tool('contacts_list', { description: `${'Lists contacts '.repeat(15)}. Then more.` }),
      tool('contacts_get', { inputSchema: { type: 'object', properties: { id: { $ref: '#/$defs/Id' } } } }),
    ])
    const by = Object.fromEntries(result.problems.map((p) => [p.name, p.problems.join('; ')]))
    assert.match(by.contacts_create, /unportable schema: lookaround in properties\.email/)
    assert.match(by.contacts_list, /first sentence 2\d\d characters/)
    assert.match(by.contacts_get, /\$ref at properties\.id/)
    assert.deepEqual(unportable({ type: 'string', pattern: '^[a-z]+$' }), [])
  })

  it('caps the tools a server loads upfront in Claude Code', () => {
    const upfront = (name) => tool(name, { _meta: { 'anthropic/alwaysLoad': true } })
    const result = analyze(['a_1', 'a_2', 'a_3', 'a_4', 'a_5', 'a_6'].map(upfront))
    assert.equal(result.alwaysLoad.length, 6)
    assert.match(result.budget.join(), /6 tools marked anthropic\/alwaysLoad, at most 5/)
  })

  it('reports a default set over its budget', () => {
    const tools = Array.from({ length: 21 }, (_, i) => tool(`items_${i}`))
    assert.match(analyze(tools).budget.join(), /21 tools, budget 20/)
    assert.equal(analyze(tools, { maxTools: 30 }).budget.length, 0)
    assert.equal(estimateTokens(4000), 1000)
  })
})

describe('mcp-design and review-api', () => {
  const checklist = read('skills/mcp-design/references/checklist.md')
  const ids = new Set([...checklist.matchAll(/^- \*\*([A-Z]\d+)\*\*/gm)].map((m) => m[1]))

  it('numbers every checklist rule once', () => {
    const all = [...checklist.matchAll(/^- \*\*([A-Z]\d+)\*\*/gm)].map((m) => m[1])
    assert.equal(all.length, ids.size)
    assert.ok(ids.size >= 30)
  })

  it('scores the MCP surface only against rules that exist, and every rule somewhere', () => {
    const rubric = read('skills/review-api/references/mcp-rubric.md')
    const cited = new Set([...rubric.matchAll(/\b([SNIREWPQ]\d+)\b/g)].map((m) => m[1]))
    // "S1 to S7" cites the whole range
    for (const [, letter, from, to] of rubric.matchAll(/\b([SNIREWPQ])(\d+) to \1(\d+)\b/g)) {
      for (let n = Number(from); n <= Number(to); n++) cited.add(`${letter}${n}`)
    }
    for (const id of cited) assert.ok(ids.has(id), `mcp-rubric cites ${id}, which checklist.md lacks`)
    for (const id of ids) assert.ok(cited.has(id), `checklist rule ${id} is scored by no rubric dimension`)
  })

  it('weights each scorecard to 100', () => {
    for (const file of ['rest-rubric.md', 'mcp-rubric.md']) {
      const text = read(`skills/review-api/references/${file}`)
      const weights = [...text.matchAll(/^### [A-Z]\d+\. .+\(weight (\d+)\)$/gm)].map((m) => Number(m[1]))
      assert.ok(weights.length >= 9, `${file} has its dimensions`)
      assert.equal(weights.reduce((a, b) => a + b, 0), 100, `${file} weights`)
    }
  })

  it('links only references that exist', () => {
    for (const skill of ['mcp-design', 'review-api']) {
      const files = new Set(readdirSync(new URL(`skills/${skill}/references/`, root)))
      for (const file of ['SKILL.md', ...[...files].map((f) => `references/${f}`)]) {
        for (const [, ref] of read(`skills/${skill}/${file}`).matchAll(/`(?:references\/)?([a-z-]+\.md)`/g)) {
          if (['SKILL.md', 'AGENTS.md', 'mcp-design.md', 'review-api.md'].includes(ref)) continue
          const other = skill === 'mcp-design' ? 'review-api' : 'mcp-design'
          const there = readdirSync(new URL(`skills/${other}/references/`, root))
          assert.ok(files.has(ref) || there.includes(ref), `${skill}/${file} names ${ref}`)
        }
      }
    }
  })

  it('stays free of em dashes', () => {
    for (const skill of ['mcp-design', 'review-api']) {
      for (const file of ['SKILL.md', ...readdirSync(new URL(`skills/${skill}/references/`, root)).map((f) => `references/${f}`)]) {
        assert.ok(!read(`skills/${skill}/${file}`).includes('—'), `${skill}/${file} has an em dash`)
      }
    }
  })
})
