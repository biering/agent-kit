import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
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
// The Script field with its indented lines, replaced as a whole.
const setScript = (text, script) => text.replace(/^- Script:.*(?:\r?\n[ \t]+\S.*)*/m, `- Script: ${script}`)
const setVariant = (text, name, change) => text.replace(new RegExp(`^\\| ${name} \\|[^|]*\\|`, 'm'), `| ${name} | ${change} |`)

describe('brief_check', () => {
  it('passes the worked example', () => {
    assert.deepEqual(check(example()).errors, [])
  })

  it('fails the empty template on every element', () => {
    const { errors } = check(read('skills/ad-creative/templates/brief.md'))
    for (const [section, names] of ELEMENTS) {
      for (const name of names) assert.ok(errors.some((e) => e.startsWith(`${section}: ${name} is empty`)), `${name} not reported`)
    }
    assert.ok(errors.some((e) => /Premises: P1 is empty/.test(e)))
  })

  it('fails an empty element and n/a without a reason, accepts n/a with one', () => {
    assert.match(check(replaceLine(example(), 'Conditions', '- Conditions:')).errors.join(), /Hope sale: Conditions is empty/)
    assert.match(check(replaceLine(example(), 'Conditions', '- Conditions: n/a')).errors.join(), /"n\/a" needs a reason/)
    assert.deepEqual(check(replaceLine(example(), 'Conditions', '- Conditions: n/a: product-aware audience')).errors, [])
  })

  it('counts "missing: ..." and "TBD: ..." as empty', () => {
    for (const value of ['missing: no reviews read yet', 'TBD: ask the owner', 'fehlt: Preisquelle']) {
      assert.match(check(replaceLine(example(), 'USP', `- USP: ${value}`)).errors.join(), /Value sale: USP is empty/)
    }
  })

  it('fails a premise without a source or date', () => {
    const noSource = example().replace('| `site/legal/refund.md` |', '| |')
    assert.match(check(noSource).errors.join(), /P5 has no source/)
    const noDate = example().replace('| `site/legal/refund.md` | 2026-11-20 |', '| `site/legal/refund.md` | today |')
    assert.match(check(noDate).errors.join(), /P5 needs an as-of date/)
    const copy = example().replace('| `site/legal/refund.md` |', '| our landing page headline |')
    assert.match(check(copy).errors.join(), /P5: "our landing page headline" is not a source/)
    const future = example().replace('| `site/legal/refund.md` | 2026-11-20 |', '| `site/legal/refund.md` | 2027-01-01 |')
    assert.match(check(future).errors.join(), /P5 is dated 2027-01-01, after today/)
  })

  it('fails a number, urgency or proof without a cited premise', () => {
    const number = replaceLine(example(), 'Identification', '- Identification: you lose 20 minutes before every call')
    assert.match(check(number).errors.join(), /Identification: a number without a premise/)
    const urgency = replaceLine(example(), 'Topic', '- Topic: last chance before the price goes up')
    assert.match(check(urgency).errors.join(), /Topic: urgency without the premise/)
    const proof = replaceLine(example(), 'Point of contact', '- Point of contact: thousands of users say they forgot Do Not Disturb')
    assert.match(check(proof).errors.join(), /Point of contact: proof/)
  })

  it('checks each clause, so one cite does not cover a second claim', () => {
    const second = replaceLine(example(), 'USP', '- USP: you set it up once [P3]; loved by thousands of freelancers')
    assert.match(check(second).errors.join(), /USP: proof .*loved by thousands/)
    const feature = example().replace('  - dream: present to a client', '  - dream: 10x faster for a client')
    assert.match(check(feature).errors.join(), /Features: a number without a premise.*10x/)
  })

  it('fails urgency that cites a premise without an end date', () => {
    const fake = replaceLine(example(), 'Copy hook', '- Copy hook: Nur noch heute 50 % Rabatt [P1]')
    assert.match(check(fake).errors.join(), /Copy hook: urgency, but no cited premise holds an end date/)
  })

  it('does not flag words that only contain a trigger', () => {
    const benign = replaceLine(example(), 'Topic', '- Topic: the client review, unlimited sending, a benutzerfreundlich Kundencall, Schlafmodus, nur noch ein Klick bis zum Call')
    const { errors, warnings } = check(benign)
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [])
  })

  it('checks the CTA and the script, which are what ships', () => {
    const cta = example().replace('- CTA: Try it free', '- CTA: Nur heute! 50 % Rabatt, 10.000 Nutzer')
    const errors = check(cta).errors.join()
    assert.match(errors, /Writing: CTA: urgency/)
    assert.match(errors, /Writing: CTA: proof/)
    const script = setScript(example(), 'Rated by thousands. Try it.')
    assert.match(check(script).errors.join(), /Writing: Script: proof/)
    const blocks = example().replace('- Mini-blocks: hook', '- Mini-blocks: countdown 0-3 s; hook')
    assert.match(check(blocks).errors.join(), /Writing: Mini-blocks: urgency/)
  })

  it('warns on health claims and questions that assert a condition', () => {
    const { warnings } = check(replaceLine(example(), 'Copy hook', '- Copy hook: Got ADHD? It cures your procrastination.'))
    assert.match(warnings.join(), /personal attributes/)
    assert.match(warnings.join(), /health claim/)
  })

  it('fails a cite to a premise that does not exist', () => {
    assert.match(check(example().replace('[P5]', '[P9]')).errors.join(), /cites \[P9\]/)
  })

  it('fails impulse elements and anchoring with nothing behind them', () => {
    assert.match(check(replaceLine(example(), 'Risk reversal', '- Risk reversal: nothing to lose')).errors.join(), /Risk reversal: cites no premise/)
    assert.match(check(replaceLine(example(), 'Anchoring', '- Anchoring: cheaper than a coffee')).errors.join(), /Anchoring: cites no premise/)
    assert.match(check(replaceLine(example(), 'Gain now', '- Gain now: half price, today only')).errors.join(), /Gain now: urgency/)
  })

  it('lets loss later be the problem repeating, when there is no deadline', () => {
    const honest = replaceLine(example(), 'Loss later', '- Loss later: every call without it is one more chance for the pop-up')
    assert.deepEqual(check(honest).errors, [])
  })

  it('fails a deadline that has passed, not a past date that is history', () => {
    assert.deepEqual(check(example(), { today: '2026-12-07' }).errors, [])
    const late = check(example(), { today: '2026-12-08' }).errors
    assert.ok(late.includes('Impulse sale: Loss later: the date 2026-12-07 has passed (today 2026-12-08)'), late.join())
    assert.ok(late.includes('Impulse sale: Gain now: the date 2026-12-07 has passed (today 2026-12-08)'), late.join())
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
    assert.match(check(replaceLine(example(), "Buyer's words", '- Buyer\'s words: "I always forget" [P3]')).errors.join(), /need the link/)
    const annotated = replaceLine(replaceLine(example(), 'Awareness', '- Awareness: problem-aware (from reviews)'), 'Risk', '- Risk: moderate (one bet)')
    assert.deepEqual(check(annotated).errors, [])
  })

  it('warns when a short format is asked to carry everything', () => {
    const { errors, warnings } = check(replaceLine(example(), 'Ad format', '- Ad format: video-6s'))
    assert.deepEqual(errors, [])
    assert.match(warnings.join(), /video-6s carries about 5 elements/)
  })

  it('refuses launch until every check is ticked', () => {
    assert.match(check(example(), { launch: true }).errors.join(), /Launch checks: not ticked/)
    assert.deepEqual(check(example().replaceAll('- [ ]', '- [x]'), { launch: true }).errors, [])
    const stale = check(example().replaceAll('- [ ]', '- [x]'), { launch: true, today: '2026-11-30' }).errors.join()
    assert.match(stale, /P1 was read 2026-11-20; read it again before launch/)
  })

  it('runs from the command line with exit codes', () => {
    const script = fileURLToPath(new URL('skills/ad-creative/scripts/brief_check.mjs', root))
    const file = fileURLToPath(new URL(EXAMPLE, root))
    assert.match(execFileSync('node', [script, file, '--today', TODAY], { encoding: 'utf8' }), /brief_check: OK/)
    assert.throws(() => execFileSync('node', [script, file, '--today', TODAY, '--launch'], { stdio: 'pipe' }), /status 1|Command failed/)
  })

  it('takes the file first or last, with or without --today, as SKILL.md writes it', () => {
    // Without --today the check uses the real date, so this copy has no offer that can expire.
    const dir = mkdtempSync(path.join(process.env.TMPDIR ?? tmpdir(), 'brief-check-'))
    const file = path.join(dir, 'brief.md')
    const timeless = replaceLine(replaceLine(example(), 'Gain now', '- Gain now: n/a: no offer running'), 'Loss later', '- Loss later: every call without it is one more chance for the pop-up')
    writeFileSync(file, timeless)
    const script = fileURLToPath(new URL('skills/ad-creative/scripts/brief_check.mjs', root))
    const run = (...args) => spawnSync('node', [script, ...args], { encoding: 'utf8' })
    for (const args of [[file], [file, '--json'], ['--json', file]]) {
      const result = run(...args)
      assert.equal(result.status, 0, `${args.join(' ')}: ${result.stdout}${result.stderr}`)
    }
    for (const args of [[file, '--launch'], ['--launch', file], [file, '--launch', '--today', TODAY], ['--today', TODAY, file, '--launch']]) {
      const result = run(...args)
      assert.equal(result.status, 1, `${args.join(' ')}: ${result.stderr}`)
      assert.match(result.stdout, /Launch checks: not ticked/)
    }
    assert.equal(run('--today', TODAY).status, 2)
    assert.equal(run(file, '--today', 'soon').status, 2)
  })

  it('reads a brief saved with Windows line endings', () => {
    assert.deepEqual(check(example().replace(/\n/g, '\r\n')).errors, [])
  })

  it('catches invented urgency and stock in the script, the CTA and the hook', () => {
    const cases = [
      ['Script', 'Only 3 licenses left at this price.', /Writing: Script: (?:urgency|a number)/],
      ['Script', 'Nur für kurze Zeit im Angebot, bis Freitag.', /Writing: Script: urgency/],
      ['- CTA: Try it free', '- CTA: Get it before it is gone', /Writing: CTA: urgency/],
      ['- Copy hook: "You shared your screen. So did your inbox."', '- Copy hook: Jetzt oder nie, nur für kurze Zeit', /Copy hook: urgency/],
      ['- Copy hook: "You shared your screen. So did your inbox."', '- Copy hook: Only a few licences left', /Copy hook: urgency/],
      ['- Copy hook: "You shared your screen. So did your inbox."', "- Copy hook: Don't miss out, ends Sunday", /Copy hook: urgency/],
    ]
    for (const [from, to, expected] of cases) {
      const brief = from === 'Script' ? setScript(example(), to) : example().replace(from, to)
      assert.notEqual(brief, example(), `fixture did not change for ${to}`)
      assert.match(check(brief).errors.join(), expected, to)
    }
  })

  it('reads the variant table, which is what ships per ad', () => {
    const hook = 'Only 3 licenses left, hurry. 10,000 happy users. Cures stress.'
    const brief = setVariant(example(), 'share_video40_hook_b', hook)
    assert.notEqual(brief, example())
    const { errors, warnings } = check(brief)
    const mine = errors.filter((e) => e.startsWith('Batch: variant share_video40_hook_b')).join()
    assert.match(mine, /urgency/)
    assert.match(mine, /proof/)
    assert.match(mine, /a number/)
    assert.match(warnings.join(), /Batch: variant share_video40_hook_b: reads like a health claim/)
    assert.match(check(setVariant(example(), 'share_video40_hook_a', ' ')).errors.join(), /variant share_video40_hook_a says nothing/)
    // A sourced claim in a variant passes, like anywhere else.
    assert.deepEqual(check(setVariant(example(), 'share_video40_hook_b', '30 % off until 2026-12-07 [P6]')).errors, [])
  })

  it('refuses a launch without the Script or variant rows', () => {
    const ticked = example().replace(/^- \[ \]/gm, '- [x]')
    assert.deepEqual(check(ticked, { launch: true }).errors, [])
    assert.match(check(setScript(ticked, ''), { launch: true }).errors.join(), /Writing: Script is empty/)
    const noRows = ticked.replace(/^\| share_video40_hook_[ab] .*\n/gm, '')
    assert.match(check(noRows, { launch: true }).errors.join(), /Batch: no variant rows/)
    assert.deepEqual(check(noRows).errors, [], 'without --launch a brief may still lack variants')
  })

  it('catches plain deadline phrasings', () => {
    for (const phrase of ['Last day.', 'Closing soon.', 'Price rises Monday.', 'Offer closes tonight.', 'Final hours.', 'Nur zwei Tage.', 'Only two days left.', '48 hours left.', 'Letzter Tag.', 'Der Preis steigt am Montag.', 'Noch drei Tage.']) {
      assert.match(check(setScript(example(), phrase)).errors.join(), /Writing: Script: (?:urgency|a number)/, phrase)
    }
  })

  it('leaves ordinary words alone when nothing is claimed', () => {
    for (const topic of ['what your customers see when you share', 'the users of your Mac, and what they see today', 'was deine Kunden sehen, wenn du teilst']) {
      assert.deepEqual(check(replaceLine(example(), 'Topic', `- Topic: ${topic}`)).errors, [], topic)
    }
    assert.match(check(replaceLine(example(), 'Topic', '- Topic: what happy customers say')).errors.join(), /Topic: proof/)
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
