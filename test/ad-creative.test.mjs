import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { checkBrief, ELEMENTS } from '../skills/ad-creative/scripts/brief_check.mjs'
import { adUrl } from '../skills/ads-landingpage/scripts/ad_url.mjs'

const root = new URL('..', import.meta.url)
const read = (file) => readFileSync(new URL(file, root), 'utf8')
const EXAMPLE = 'skills/ad-creative/examples/menubar-utility/brief.md'
const example = () => read(EXAMPLE)
const TODAY = '2026-11-20'
const check = (text, options = {}) => checkBrief(text, { today: TODAY, ...options })
const replaceLine = (text, start, line) => text.replace(new RegExp(`^- ${start}:.*$`, 'm'), line)

describe('brief_check', () => {
  it('passes the worked example', () => {
    assert.deepEqual(check(example()).errors, [])
  })

  it('fails the empty template on every element', () => {
    const { errors } = check(read('skills/ad-creative/templates/brief.md'))
    for (const [section, names] of ELEMENTS) {
      for (const name of names) assert.ok(errors.includes(`${section}: ${name} is empty (write it, or "n/a: <reason>")`), `${name} not reported`)
    }
    assert.ok(errors.some((e) => /Premises: P1 is empty/.test(e)))
  })

  it('fails an empty element and n/a without a reason, accepts n/a with one', () => {
    assert.match(check(replaceLine(example(), 'Conditions', '- Conditions:')).errors.join(), /Hope sale: Conditions is empty/)
    assert.match(check(replaceLine(example(), 'Conditions', '- Conditions: n/a')).errors.join(), /"n\/a" needs a reason/)
    assert.deepEqual(check(replaceLine(example(), 'Conditions', '- Conditions: n/a: product-aware audience')).errors, [])
  })

  it('fails a premise without a source or date', () => {
    const noSource = example().replace('| `site/legal/refund.md` |', '| |')
    assert.match(check(noSource).errors.join(), /P5 has no source/)
    const noDate = example().replace('| `site/legal/refund.md` | 2026-11-20 |', '| `site/legal/refund.md` | today |')
    assert.match(check(noDate).errors.join(), /P5 needs an as-of date/)
  })

  it('fails a number, urgency or proof without a cited premise', () => {
    const number = replaceLine(example(), 'Identification', '- Identification: you lose 20 minutes before every call')
    assert.match(check(number).errors.join(), /Identification: states a number/)
    const urgency = replaceLine(example(), 'Topic', '- Topic: last chance before the price goes up')
    assert.match(check(urgency).errors.join(), /Topic: urgency without citing/)
    const proof = replaceLine(example(), 'Point of contact', '- Point of contact: thousands of users say they forgot Do Not Disturb')
    assert.match(check(proof).errors.join(), /Point of contact: proof/)
    assert.deepEqual(check(replaceLine(example(), 'Topic', '- Topic: the client review where a message popped up')).errors, [])
  })

  it('fails a cite to a premise that does not exist', () => {
    assert.match(check(example().replace('[P5]', '[P9]')).errors.join(), /cites \[P9\]/)
  })

  it('fails impulse elements and anchoring with nothing behind them', () => {
    const errors = check(replaceLine(example(), 'Gain now', '- Gain now: a better week starting today')).errors.join()
    assert.match(errors, /Gain now: cites no premise/)
  })

  it('fails a deadline that has passed, not a past date that is history', () => {
    assert.deepEqual(check(example(), { today: '2026-12-07' }).errors, [])
    assert.deepEqual(check(example(), { today: '2026-12-08' }).errors, ['Impulse sale: Loss later: the deadline 2026-12-07 has passed (today 2026-12-08)'])
  })

  it('needs every feature tagged with its lever', () => {
    const untagged = example().replace('  - dream: present', '  - present')
    assert.match(check(untagged).errors.join(), /Features: tag each feature/)
  })

  it('checks the enums and the buyer words link', () => {
    assert.match(check(replaceLine(example(), 'Awareness', '- Awareness: lukewarm')).errors.join(), /Awareness "lukewarm"/)
    assert.match(check(replaceLine(example(), 'Ad format', '- Ad format: hologram')).errors.join(), /Ad format "hologram"/)
    assert.match(check(replaceLine(example(), 'Risk', '- Risk: yolo')).errors.join(), /Risk "yolo"/)
    assert.match(check(replaceLine(example(), "Buyer's words", '- Buyer\'s words: "I always forget"')).errors.join(), /need the link/)
  })

  it('warns when a short format is asked to carry everything', () => {
    const { errors, warnings } = check(replaceLine(example(), 'Ad format', '- Ad format: video-6s'))
    assert.deepEqual(errors, [])
    assert.match(warnings.join(), /video-6s carries about 5 elements/)
  })

  it('refuses launch until every check is ticked', () => {
    assert.match(check(example(), { launch: true }).errors.join(), /Launch checks: not ticked/)
    assert.deepEqual(check(example().replaceAll('- [ ]', '- [x]'), { launch: true }).errors, [])
  })

  it('runs from the command line with exit codes', () => {
    const script = fileURLToPath(new URL('skills/ad-creative/scripts/brief_check.mjs', root))
    const file = fileURLToPath(new URL(EXAMPLE, root))
    assert.match(execFileSync('node', [script, file, '--today', TODAY], { encoding: 'utf8' }), /brief_check: OK/)
    assert.throws(() => execFileSync('node', [script, file, '--today', TODAY, '--launch'], { stdio: 'pipe' }), /status 1|Command failed/)
  })
})

describe('ad-creative skill', () => {
  const skill = read('skills/ad-creative/SKILL.md')

  it('links every reference, the template, the script and the example', () => {
    for (const file of ['references/elements.md', 'references/research.md', 'references/production.md', 'references/policy.md', 'templates/brief.md', 'scripts/brief_check.mjs', 'examples/menubar-utility/brief.md']) {
      assert.ok(skill.includes(`(${file})`), `SKILL.md does not link ${file}`)
      read(`skills/ad-creative/${file}`)
    }
  })

  it('cites the framework, reads the repo doc, and links ads-landingpage both ways', () => {
    assert.match(skill, /Derick Carneiro/)
    assert.match(skill, /docs\/agent-kit\/ad-creative\.md/)
    assert.match(skill, /`ads-landingpage`/)
    assert.match(read('skills/ads-landingpage/SKILL.md'), /`ad-creative`/)
  })

  it('lists all 17 elements in elements.md', () => {
    const elements = read('skills/ad-creative/references/elements.md')
    const names = ELEMENTS.flatMap(([, list]) => list)
    assert.equal(names.length, 17)
    for (const name of names) assert.ok(elements.includes(`**${name}.**`), `elements.md lacks ${name}`)
  })

  it('has evals', () => {
    const evals = JSON.parse(read('skills/ad-creative/evals/evals.json'))
    assert.equal(evals.skill_name, 'ad-creative')
    assert.ok(evals.evals.length >= 5)
  })
})

describe('ad_url sources', () => {
  it('knows x and reddit as paid social', () => {
    const settings = { brands: { app: 'https://example.com/lp/{slug}/' } }
    const register = '| https://example.com/lp/share/ | live |'
    for (const source of ['x', 'reddit']) {
      assert.equal(
        adUrl({ brand: 'app', slug: 'share', source, campaign: 'share_2026_11_signup', content: 'share_video40_hook_a' }, register, settings),
        `https://example.com/lp/share/?utm_source=${source}&utm_medium=paid_social&utm_campaign=share_2026_11_signup&utm_content=share_video40_hook_a`,
      )
    }
  })
})
