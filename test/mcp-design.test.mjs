import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { analyze, estimateTokens } from '../skills/mcp-design/scripts/tool-budget.mjs'

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
