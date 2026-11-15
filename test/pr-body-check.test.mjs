import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { checkBody } from '../skills/pr/scripts/pr-body-check.mjs'
import { whySections } from '../src/lib/daylog.mjs'

const example = readFileSync(new URL('../skills/pr/references/example.md', import.meta.url), 'utf8')
const block = (heading) => {
  const after = example.slice(example.indexOf(heading))
  return after.split('```markdown\n')[1].split('\n```')[0]
}

describe('pr body check', () => {
  it('passes the "after" example from the skill', () => assert.deepEqual(checkBody(block('## After')), []))
  it('flags the "before" example', () => {
    const p = checkBody(block('## Before')).join('\n')
    assert.match(p, /missing "## Review focus"/)
  })
  it('flags a long head, too many bullets, no path and a dash', () => {
    const body = `## Benefit\n${'word '.repeat(160)}\n\n## Review focus\n- a\n- b\n- c\n- d\n\nA — B`
    const p = checkBody(body)
    assert.ok(p.some((x) => /words; the budget/.test(x)))
    assert.ok(p.some((x) => /4 bullets/.test(x)))
    assert.ok(p.some((x) => /no path/.test(x)))
    assert.ok(p.some((x) => /dash/.test(x)))
  })
  it('ignores the trailer and optional sections when counting the head', () => {
    const body = `## Benefit\nFaster.\n\n## Review focus\n- \`a.ts:1\`: x\n\n## Verified\n${'ok '.repeat(100)}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`
    assert.deepEqual(checkBody(body), [])
  })
  it('keeps Benefit readable for the daily log digest', () => {
    assert.equal(whySections(block('## After')).startsWith('A customer whose session expires'), true)
  })
})
