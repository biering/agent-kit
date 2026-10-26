import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('readme', () => {
  it('has one skills install prompt', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const prompt = readme.slice(readme.indexOf('## Install prompt'), readme.indexOf('## Skills'))
    assert.match(prompt, /This is the only way to install the skills/)
    assert.equal(readme.match(/npx skills add/g)?.length, 1)
    assert.match(prompt, /npx skills add biering\/agent-kit --skill '\*' -a claude-code codex -y/)
  })

  it('groups skills by the job, under the names that install them', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const skills = readme.slice(readme.indexOf('## Skills'))
    const areas = [...skills.matchAll(/^\| ([A-Za-z]+) \|/gm)].map((match) => match[1])
    assert.deepEqual(areas, ['Area', 'Ship', 'Review', 'Harness', 'Build', 'Write', 'Market', 'Decide', 'Editor'])
  })
})

describe('landing anatomy', () => {
  it('is what the design skill reads for a landing page, with the canonical ids', () => {
    const root = new URL('..', import.meta.url)
    const skill = readFileSync(new URL('skills/design/SKILL.md', root), 'utf8')
    const anatomy = readFileSync(new URL('skills/design/references/landing-anatomy.md', root), 'utf8')
    assert.match(skill, /landing-page\.md.*landing-anatomy\.md/)
    for (const id of ['hero', 'trust', 'benefits', 'how-it-works', 'pricing', 'testimonials', 'faq', 'cta']) {
      assert.match(anatomy, new RegExp(`id="${id}"`))
    }
  })
})
