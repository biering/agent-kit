import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  DEFAULTS,
  TEMPLATES,
  CAPTURE_RATIO,
  contrast,
  copyErrors,
  fitTokens,
  polygonsOverlap,
  rotatedCorners,
  groundOf,
  overlaps,
  resolveFrame,
  rotatedBox,
  validateSetSpec,
  composeSet,
} from '../skills/app-screenshots/scripts/compose-set.mjs'
import { loadDeps, tokens } from '../skills/app-screenshots/scripts/compose.mjs'

/**
 * The set compositor without the renderer: the spec check, the honesty rules,
 * the template defaults and the layout arithmetic. The render itself runs only
 * where sharp and fontkitten resolve (APP_SCREENSHOTS_DEPS names a folder that
 * has them); the frames are judged by eye from the review sheet (SKILL.md).
 */
const SKILL = fileURLToPath(new URL('../skills/app-screenshots/', import.meta.url))
const EXAMPLE = path.join(SKILL, 'examples/boxtrail')
const example = () => JSON.parse(readFileSync(path.join(EXAMPLE, 'set.json'), 'utf8'))
const withFrame = (frame) => ({ ...example(), frames: [frame] })
const errorsFor = (frame) => validateSetSpec(withFrame(frame))

describe('set spec', () => {
  it('accepts the example, which uses every template and both copy positions', () => {
    const spec = example()
    assert.deepEqual(validateSetSpec(spec), [])
    const used = new Set(spec.frames.map((f) => f.template))
    for (const t of TEMPLATES) assert.ok(used.has(t), `example lacks ${t}`)
    assert.ok(spec.frames.some((f) => f.copy === 'bottom'))
  })

  it('refuses a device turned more than 15 degrees, but lets an object turn', () => {
    assert.match(errorsFor({ template: 'tilted-device', headline: 'Ship it', device: { screen: 'a.png', rotate: 30 } }).join(), /turned more than 15°/)
    assert.match(errorsFor({ template: 'before-after', headline: 'Ship it', before: { screen: 'a.png', rotate: -20 }, after: { screen: 'b.png' } }).join(), /turned more than 15°/)
    assert.deepEqual(errorsFor({ template: 'hero-object', headline: 'Ship it', object: { image: 'o.svg', rotate: 40 } }), [])
  })

  it('refuses words and marks that would not read on their ground', () => {
    const light = { template: 'proof', headline: 'Loved by *people*', background: '#F4F6F1', ink: '#13201A', facts: ['No account'] }
    const colour = { ...example(), emphasis: 'colour', accent: '#C8F169', frames: [light] }
    const errors = validateSetSpec(colour).join('\n')
    assert.match(errors, /emphasised word \(accent\) #C8F169 on #F4F6F1/)
    assert.match(errors, /proof marks/)
    const faint = { template: 'tilted-device', headline: 'Ship it', sub: 'Quietly', subInk: '#FFFFFF33', device: { screen: 'a.png' } }
    assert.match(errorsFor(faint).join(), /sub-line ink #FFFFFF33/)
    assert.match(errorsFor({ ...faint, sub: undefined, ink: '#123D29' }).join(), /headline ink/)
  })

  it('measures contrast the WCAG way', () => {
    assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21)
    assert.equal(contrast('#777', '#777'), 1)
    assert.equal(contrast('white', '#000'), null)
    assert.ok(contrast('#FFFFFF80', '#000000') < contrast('#FFFFFF', '#000000'))
  })

  it('names a default for every template', () => {
    assert.deepEqual(Object.keys(DEFAULTS).sort(), [...TEMPLATES].sort())
  })

  it('refuses an unknown template and a missing headline', () => {
    assert.match(errorsFor({ template: 'collage', headline: 'x' }).join(), /"template" must be one of/)
    assert.match(errorsFor({ template: 'tilted-device', device: { screen: 'a.png' } }).join(), /"headline" is required/)
  })

  it('refuses a headline over six words', () => {
    const errors = errorsFor({ template: 'tilted-device', headline: 'Track every parcel you ever order online', device: { screen: 'a.png' } })
    assert.match(errors.join(), /7 words; 6 at most/)
  })

  it('asks each template for the pieces it draws', () => {
    assert.match(errorsFor({ template: 'tilted-device', headline: 'Ship it' }).join(), /needs "device"/)
    assert.match(errorsFor({ template: 'hero-object', headline: 'Ship it' }).join(), /needs "object"/)
    assert.match(errorsFor({ template: 'feature-callout', headline: 'Ship it', device: { screen: 'a.png' } }).join(), /needs "callouts"/)
    assert.match(errorsFor({ template: 'before-after', headline: 'Ship it' }).join(), /before needs "screen"/)
    assert.match(errorsFor({ template: 'proof', headline: 'Ship it' }).join(), /needs a sourced "badge" or "quote", or honest "facts"/)
  })

  it('keeps a panorama frame on its neighbour\'s ground, and never first', () => {
    const first = errorsFor({ template: 'panorama', headline: 'Ship it', device: { screen: 'a.png' } })
    assert.match(first.join(), /cannot be first/)
    const spec = example()
    spec.frames[1] = { ...spec.frames[1], background: '#FFFFFF' }
    assert.match(validateSetSpec(spec).join(), /shares its neighbour's ground/)
  })

  it('takes the ground of the frame a panorama continues', () => {
    const spec = { background: '#111111', frames: [{ template: 'tilted-device', background: '#0F5132' }, { template: 'panorama' }, { template: 'panorama' }, { template: 'proof' }] }
    assert.deepEqual([0, 1, 2, 3].map((i) => groundOf(spec, i)), ['#0F5132', '#0F5132', '#0F5132', '#111111'])
  })

  it('refuses more than ten frames', () => {
    const spec = example()
    spec.frames = Array.from({ length: 11 }, () => spec.frames[0])
    assert.match(validateSetSpec(spec).join(), /at most 10/)
  })
})

describe('honesty', () => {
  const at = 'frames[0]'
  it('refuses Apple recognitions and ranks anywhere', () => {
    for (const text of ["Editor's Choice", 'App of the Day', 'The #1 habit app', 'Best app for runners', 'Apps we love']) {
      assert.ok(copyErrors(text, { at }).length > 0, text)
      assert.ok(copyErrors(text, { at, sourced: true }).length > 0, `${text}, even with a source`)
    }
  })

  it('refuses money, percentages, multipliers, user counts and ratings without a source', () => {
    for (const text of ['+$439 this week', 'Earn €50 a day', 'Save 30%', '3x faster replies', 'Three times faster', 'Twice as fast', '100K+ users', '4.9 stars', '★★★★★']) {
      assert.ok(copyErrors(text, { at }).length > 0, text)
    }
  })

  it('lets a sourced sticker carry a figure, but never in the headline', () => {
    const frame = {
      template: 'tilted-device',
      headline: 'Get paid for clips',
      device: { screen: 'a.png' },
      stickers: [{ text: '+$439', x: 100, y: 400, source: 'payout export, account <id>, <date>' }],
    }
    assert.deepEqual(errorsFor(frame), [])
    const unsourced = { ...frame, stickers: [{ text: '+$439', x: 100, y: 400 }] }
    assert.match(errorsFor(unsourced).join(), /amount of money/)
    assert.match(errorsFor({ ...frame, headline: 'Earn $439 a week' }).join(), /amount of money/)
  })

  it('passes plain product facts with numbers that are not claims', () => {
    for (const text of ['Turn one photo into 10 posts', 'Arrives 14:00 – 16:00', '6 stops away', 'Know the day it *arrives*']) {
      assert.deepEqual(copyErrors(text, { at }), [], text)
    }
  })

  it('refuses URLs and legal marks', () => {
    assert.ok(copyErrors('Visit boxtrail.app', { at }).length > 0)
    assert.ok(copyErrors('Boxtrail®', { at }).length > 0)
  })

  it('wants a source on every badge and quote, and no figure in a fact', () => {
    const base = { template: 'proof', headline: 'Loved by runners' }
    assert.match(errorsFor({ ...base, badge: { value: '4.8', label: 'on the App Store' } }).join(), /badge has no "source"/)
    assert.match(errorsFor({ ...base, quote: { text: 'Finally, one list' } }).join(), /quote has no "source"/)
    assert.match(errorsFor({ ...base, facts: ['Used by 20,000 people'] }).join(), /has a number/)
    assert.deepEqual(errorsFor({ ...base, badge: { value: '4.8', label: 'on the App Store', source: 'App Store Connect, 4.8 from 212 ratings, 2026-11-01' } }), [])
  })
})

describe('layout', () => {
  it('fills a template\'s defaults and keeps what the frame sets', () => {
    const f = resolveFrame({ template: 'hero-object', headline: 'x', object: { image: 'o.svg', x: 400 } })
    assert.equal(f.object.x, 400)
    assert.equal(f.object.width, DEFAULTS['hero-object'].object.width)
    assert.equal(f.device, undefined, 'a default device with no screen is not drawn')
    assert.equal(f.copy, 'top')
    assert.equal(f.align, 'center')
    const bare = resolveFrame({ template: 'proof', headline: 'x', facts: ['No account'], device: null })
    assert.equal(bare.device, undefined, 'null drops the default device')
    assert.deepEqual(errorsFor({ template: 'proof', headline: 'Private by default', facts: ['No account'], device: null }), [])
  })

  it('prefers fewer lines when the type stays nearly as large', () => {
    const toks = tokens('Watch it come *closer*')
    // A fake measure: every character is 0.6 em wide.
    const measure = (line, px) => line.map((t) => t.text).join(' ').length * px * 0.6
    const two = fitTokens(toks, measure, { maxWidth: 400, maxFont: 60, minFont: 20, maxLines: 3 })
    assert.equal(two.lines.length, 2)
    const big = fitTokens(toks, measure, { maxWidth: 400, maxFont: 60, minFont: 20, maxLines: 3, prefer: 1 })
    assert.ok(big.fontSize >= two.fontSize)
    assert.throws(() => fitTokens(toks, measure, { maxWidth: 40, maxFont: 30, minFont: 20, maxLines: 3 }), /will not fit/)
  })

  it('moves the default picture up when the copy is at the bottom, and keeps a frame\'s own height', () => {
    for (const template of TEMPLATES) {
      const pieces = { device: { screen: 'a.png' }, object: { image: 'o.svg' }, before: { screen: 'a.png' }, after: { screen: 'b.png' } }
      const top = resolveFrame({ template, headline: 'x', ...pieces })
      const bottom = resolveFrame({ template, headline: 'x', copy: 'bottom', ...pieces })
      for (const key of ['device', 'object', 'before', 'after']) {
        if (!DEFAULTS[template][key]) continue
        assert.ok(bottom[key].y < 467 && top[key].y > 467, `${template}.${key}: ${top[key].y} -> ${bottom[key].y}`)
      }
    }
    const own = resolveFrame({ template: 'tilted-device', headline: 'x', copy: 'bottom', device: { screen: 'a.png', y: 700 } })
    assert.equal(own.device.y, 700)
  })

  it('tests turned shapes against a headline exactly, not by their bounding box', () => {
    const headline = [[0, 0], [100, 0], [100, 40], [0, 40]]
    // A tall device turned 30°: its bounding box reaches the headline's corner, the device does not.
    const device = rotatedCorners(150, 160, 60, 200, 30)
    assert.ok(!polygonsOverlap(device, headline))
    assert.ok(polygonsOverlap(rotatedCorners(90, 50, 60, 200, 30), headline))
    assert.ok(Math.abs(CAPTURE_RATIO - 1320 / 2868) < 0.01, 'the 6.9" capture passes the capture check')
  })

  it('boxes a turned rectangle and tests overlap', () => {
    const upright = rotatedBox(100, 100, 40, 80, 0)
    assert.deepEqual(upright, { left: 80, top: 60, right: 120, bottom: 140 })
    const quarter = rotatedBox(100, 100, 40, 80, 90)
    assert.ok(Math.abs(quarter.right - quarter.left - 80) < 1e-9)
    assert.ok(overlaps(upright, { left: 110, top: 0, right: 200, bottom: 70 }))
    assert.ok(!overlaps(upright, { left: 121, top: 0, right: 200, bottom: 70 }))
  })
})

const deps = process.env.APP_SCREENSHOTS_DEPS ? await loadDeps([process.env.APP_SCREENSHOTS_DEPS]).catch(() => undefined) : undefined

describe('render', () => {
  it('renders the example at the required 6.3" size, opaque and exact', { skip: !deps && 'set APP_SCREENSHOTS_DEPS to a folder with sharp and fontkitten' }, async () => {
    const out = mkdtempSync(path.join(tmpdir(), 'app-screenshots-'))
    const spec = example()
    const abs = (p) => path.join(EXAMPLE, p)
    spec.sizes = ['6.3']
    spec.out = out
    spec.font = abs(spec.font)
    for (const f of spec.frames) {
      for (const key of ['device', 'before', 'after']) if (f[key]) f[key].screen = abs(f[key].screen)
      if (f.object) f.object.image = abs(f.object.image)
    }
    const file = path.join(out, 'set.json')
    writeFileSync(file, JSON.stringify(spec))
    const { sets } = await composeSet(file, deps)
    assert.equal(sets[0].frames.length, spec.frames.length)
    for (const f of sets[0].frames) {
      const meta = await deps.sharp(f.file).metadata()
      assert.equal(meta.width, 1206)
      assert.equal(meta.height, 2622)
      assert.equal(meta.hasAlpha, false)
    }

    // Every template with its copy at the bottom and its default placements renders.
    const bottom = { ...spec, out: path.join(out, 'bottom') }
    bottom.frames = spec.frames.map((f) => {
      const g = structuredClone(f)
      g.copy = 'bottom'
      for (const key of ['device', 'object', 'before', 'after']) if (g[key]) for (const k of ['x', 'y', 'width', 'rotate']) delete g[key][k]
      delete g.stickers
      return g
    })
    writeFileSync(file, JSON.stringify(bottom))
    await composeSet(file, deps)

    // A headline under a device is refused, not drawn.
    const covered = { ...bottom, frames: [{ ...bottom.frames[4], device: { ...bottom.frames[4].device, y: 760 } }] }
    writeFileSync(file, JSON.stringify(covered))
    await assert.rejects(composeSet(file, deps), /its device covers the headline/)

    // A composed image is not a capture.
    const notCapture = { ...bottom, frames: [{ ...bottom.frames[4], device: { screen: abs('preview.png') } }] }
    writeFileSync(file, JSON.stringify(notCapture))
    await assert.rejects(composeSet(file, deps), /not a portrait iPhone capture/)
  })
})
