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

describe('landing hook', () => {
  const root = new URL('..', import.meta.url)
  const read = (file) => readFileSync(new URL(file, root), 'utf8')

  it('is read for a landing page, after the anatomy and before the taste run', () => {
    const skill = read('skills/design/SKILL.md')
    assert.match(skill, /landing-anatomy\.md.*landing-hook\.md.*taste\/GUIDE\.md/)
    assert.match(skill, /landing-evidence\.md/)
    assert.match(read('skills/design/references/landing-page.md'), /landing-hook\.md/)
    assert.match(read('skills/design/references/landing-anatomy.md'), /landing-hook\.md/)
  })

  it('names the three mechanics and a budget that puts text first', () => {
    const hook = read('skills/design/references/landing-hook.md')
    for (const mechanic of ['Show', 'Start', 'Play']) assert.match(hook, new RegExp(`\\*\\*${mechanic}\\*\\*`))
    assert.match(hook, /Text first/)
    assert.match(hook, /prefers-reduced-motion/)
  })

  it('cites only evidence rows that exist', () => {
    const rows = new Set([...read('skills/design/references/landing-evidence.md').matchAll(/^\| (\d+) \|/gm)].map((match) => match[1]))
    assert.ok(rows.size >= 15)
    for (const file of ['landing-hook.md', 'landing-evidence.md']) {
      for (const cite of read(`skills/design/references/${file}`).matchAll(/\[(\d+)\](?!\()/g)) {
        assert.ok(rows.has(cite[1]), `${file} cites [${cite[1]}], which landing-evidence.md does not list`)
      }
    }
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
