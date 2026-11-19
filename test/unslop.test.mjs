import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/unslop')
const python = ['python3', '/usr/bin/python3'].find((p) => spawnSync(p, ['--version']).status === 0)
const skip = python ? false : 'python3 not found'

function run(script, args, input, cwd) {
  const r = spawnSync(python, [path.join(SKILL, 'scripts', script), ...args], { input, encoding: 'utf8', cwd })
  return { status: r.status, out: r.stdout, err: r.stderr }
}
const scan = (text, args = ['--voice', 'none'], cwd) => {
  const r = run('slop_scan.py', ['--json', ...args, '-'], text, cwd)
  assert.equal(r.status, 0, r.err)
  return JSON.parse(r.out)['-'].findings
}
const cats = (text, category) => scan(text).filter((f) => f.category === category).map((f) => f.match)

describe('slop_scan cut words', { skip }, () => {
  it('flags the selling sense of every cut word', () => {
    const hits = cats(
      'Unlock your potential. We elevate your brand. Supercharge growth with a seamless app. ' +
        'We leverage AI for your fitness journey. Embark on a journey to success.',
      'cut-word',
    )
    for (const word of ['Unlock your', 'elevate your', 'Supercharge', 'seamless', 'leverage AI', 'fitness journey', 'Embark on a journey']) {
      assert.ok(hits.some((h) => h.includes(word)), `${word} not flagged: ${hits}`)
    }
  })

  it('leaves the literal senses alone', () => {
    const hits = cats(
      'The train journey from Berlin takes four hours. Our long journey home was fine. ' +
        "Unlock the door with your phone. Elevate the patient's legs. A seamless steel pipe. " +
        'Financial leverage raises returns. The leverage ratio is 3. Use leverage carefully. ' +
        'The leverage the bank gives you is limited. With Leverage you compare 400 banks. ' +
        'Leverage helps you buy property.',
      'cut-word',
    )
    assert.deepEqual(hits, [])
  })

  it('flags the house bans and not their literal look-alikes', () => {
    assert.equal(cats("It's not a tool, it's a teammate. The problem isn't money. It's time.", 'not-x-its-y').length, 2)
    assert.deepEqual(cats("It's not ready yet, we ship it in May.", 'not-x-its-y'), [])
    assert.equal(cats("Nobody tells you how hard it is. Here's what nobody sees.", 'nobody-tells-you').length, 2)
    assert.deepEqual(cats('Nobody came to the first meetup.', 'nobody-tells-you'), [])
  })
})

describe('slop_scan German', { skip }, () => {
  it('finds a split "Rolle spielt" and a split "Potenzial ausschöpfen"', () => {
    const text = 'Die Steuer, die beim Kauf eine entscheidende Rolle für viele Käufer spielt, ist hoch. Der Rechner hilft, das volle Potenzial deiner Kalkulation auszuschöpfen.'
    const found = scan(text, ['--voice', 'none', '--lang', 'de']).map((f) => f.category)
    assert.ok(found.includes('significance-inflation'), found)
    assert.ok(found.includes('ai-vocabulary'), found)
  })
})

describe('slop_scan voice file', { skip }, () => {
  it('flags "Never says" phrases from the repo voice file, found through agent-kit.config.json', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'unslop-'))
    mkdirSync(path.join(repo, 'brand'))
    writeFileSync(
      path.join(repo, 'brand', 'voice.md'),
      '# Voice\n\n## Says\n\n- honestly\n\n## Never says\n\n- "thrilled to announce" -- 2026-11-19 edit\n- Big news!\n',
    )
    writeFileSync(path.join(repo, 'agent-kit.config.json'), JSON.stringify({ unslop: { voice: 'brand/voice.md' } }))
    const hits = scan('Big news! We are thrilled to announce exports, honestly.', [], repo).filter((f) => f.category === 'voice-ban')
    assert.equal(hits.length, 2)
    assert.ok(!hits.some((h) => h.match.includes('honestly')))
  })

  it('uses docs/agent-kit/voice.md when no path is configured, and skips it with --voice none', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'unslop-'))
    mkdirSync(path.join(repo, 'docs', 'agent-kit'), { recursive: true })
    const template = readFileSync(path.join(SKILL, 'references', 'voice-template.md'), 'utf8')
    const voice = path.join(repo, 'docs', 'agent-kit', 'voice.md')
    writeFileSync(voice, template)
    assert.equal(scan('Thrilled to announce a game-changer.', [], repo).filter((f) => f.category === 'voice-ban').length, 0, 'the template bans nothing')
    writeFileSync(voice, template.replace('## Never says\n', '## Never says\n\n- game-changer -- 2026-11-19, cut from the launch post\n'))
    assert.equal(scan('A game-changer.', [], repo).filter((f) => f.category === 'voice-ban').length, 1)
    assert.equal(scan('A game-changer.', ['--voice', 'none'], repo).filter((f) => f.category === 'voice-ban').length, 0)
  })
})

describe('ship_check', { skip }, () => {
  const check = (text, platform) => {
    const r = run('ship_check.py', ['--json', ...(platform ? ['--platform', platform] : []), '-'], text)
    return { status: r.status, ...JSON.parse(r.out) }
  }

  it('lists specifics and flags copy with none', () => {
    const good = check('Six seats left. Saturday, 9am, €45. Link in bio.', 'instagram')
    assert.equal(good.status, 0)
    assert.deepEqual(good.specifics.map((s) => s.kind).sort(), ['number', 'price', 'time', 'weekday'])
    const vague = check('Join our amazing workshop experience!', 'instagram')
    assert.equal(vague.no_specifics, true)
    assert.equal(vague.status, 0, 'no specifics is advice, not a gate')
  })

  it('does not count urgency words as specifics', () => {
    assert.equal(check('Book today, one click, start tomorrow.', 'instagram').no_specifics, true)
  })

  it('skips limits with --platform none, for text with no fold', () => {
    const r = check(`Our analysis covers 400 banks. ${'More words here. '.repeat(20)}`, 'none')
    assert.equal(r.status, 0)
    assert.deepEqual(r.limits, [])
  })

  it('fails on a placeholder left in the text', () => {
    const r = check('Saturday 9am, [PLACEHOLDER: price].', 'instagram')
    assert.equal(r.status, 1)
    assert.deepEqual(r.placeholders, ['[PLACEHOLDER: price]'])
  })

  it('checks each field against its platform limit', () => {
    const ads = check('Headline: Compare 400 banks in one search today\nHeadline: Mortgage in 3 minutes\nDescription: Rates from 400 banks, free.', 'google-ads')
    assert.equal(ads.status, 1)
    assert.deepEqual(ads.limits.map((l) => l.field), ['headline 1'])
    const x = check(`short post\n---\n${'a'.repeat(250)} https://example.com/${'b'.repeat(80)}`, 'x')
    assert.deepEqual(x.limits.map((l) => l.field), [], 'a URL counts 23 chars on X')
    const reel = check('Hook: I lost 4,000 euros on one bad print run last spring\nRest of script.', 'reels')
    assert.equal(reel.limits[0].field, 'hook')
    const cold = check(`Subject: 400 banks, one search\n${'word '.repeat(40)}`, 'cold-email')
    assert.equal(cold.limits[0].actual, '40 words')
  })

  it('falls back to the 125-char fold when the platform is unknown, and says so', () => {
    const r = check('The smartest way to find a mortgage that actually fits the way you live, work and plan your future, without any of the stress.')
    assert.equal(r.platform, 'unknown')
    assert.equal(r.limits[0].field, 'body')
    const human = run('ship_check.py', ['-'], 'Six seats, Saturday.').out
    assert.match(human, /platform unknown: checked against the 125-char fold/)
  })
})
