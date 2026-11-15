import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

/**
 * The session style (skills/video/styles/session): the arithmetic a take is drawn by (core.js:
 * which frame stands at a second, where a region of the recording sits in the film, which
 * stretches say "sped up", where the camera goes) and the spec's rules. The frames themselves are
 * checked by eye and by --purity.
 */
const STYLE = fileURLToPath(new URL('../skills/video/styles/session/', import.meta.url))
const load = (f) => import(pathToFileURL(path.join(STYLE, f)).href)
const { FAST, frameAt, inWindow, takeTime, fastStretches, frameRect } = await load('core.js')
const { validateSpec, cueSheet, specTexts } = await load('spec.js')
const { buildCues } = await load('cues.mjs')
const starter = (await load('starter/spec.js')).default

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`)
const mutate = (fn) => { const s = structuredClone(starter); fn(s); return s }

describe('video session maths', () => {
  it('shows the frame the ingest wrote for a second, and holds the first and the last', () => {
    const take = { from: 2, fps: 30, frames: 300 }
    assert.equal(frameAt(take, 2), 1)
    assert.equal(frameAt(take, 2 + 1 / 30), 2)
    assert.equal(frameAt(take, 7), 151)
    // between two frames: the nearer one
    assert.equal(frameAt(take, 2 + 0.4 / 30), 1)
    assert.equal(frameAt(take, 2 + 0.6 / 30), 2)
    // a moment before the trim or after it never asks for a frame that is not there
    assert.equal(frameAt(take, 0), 1)
    assert.equal(frameAt(take, 60), 300)
  })

  it('places a region of the recording in the window, whatever the crop', () => {
    // the take keeps x 400..2000 of the recording; the window shows that across 800 px
    const take = { crop: [400, 100, 1600, 1000] }
    assert.deepEqual(inWindow(take, [400, 100, 1600, 1000], { x: 50, y: 20, w: 800 }), { x: 50, y: 20, w: 800, h: 500 })
    assert.deepEqual(inWindow(take, [1200, 600, 400, 200], { x: 50, y: 20, w: 800 }), { x: 450, y: 270, w: 200, h: 100 })
  })

  it('runs the take between its moments at the speed that fits, and holds it outside them', () => {
    // film seconds 4, 8 and 10 show the recording's seconds 1, 13 and 14
    const sync = [[4, 1], [8, 13], [10, 14]]
    assert.equal(takeTime(sync, 0), 1)
    assert.equal(takeTime(sync, 4), 1)
    assert.equal(takeTime(sync, 6), 7)
    assert.equal(takeTime(sync, 8), 13)
    assert.equal(takeTime(sync, 9), 13.5)
    assert.equal(takeTime(sync, 99), 14)
    // no jump at a moment: a frame either side of it is the same second
    near(takeTime(sync, 8 - 1e-12), takeTime(sync, 8 + 1e-12), 'either side of a moment')
  })

  it("labels a stretch that plays faster than it was recorded, and not the user's own pace", () => {
    assert.ok(FAST > 1 && FAST <= 1.2, 'a stretch well above its recorded speed has to say so')
    // typing sped up 3x is the user's pace; the wait sped up 3x is the product's
    assert.deepEqual(fastStretches([[0, 0], [4, 12, true], [5, 12.5], [8, 21.5], [12, 25.5]]), [[5, 8]])
    // 'own' marks the stretch that ends on the entry, not the one that starts there
    assert.deepEqual(fastStretches([[0, 0], [4, 12, true], [8, 24]]), [[4, 8]])
    // two entries on one beat are no stretch at all
    assert.deepEqual(fastStretches([[0, 0], [4, 4], [4, 4], [8, 8]]), [])
    // two fast stretches in a row are one label, not one that leaves and comes back
    assert.deepEqual(fastStretches([[0, 0], [2, 6], [4, 12], [8, 13]]), [[0, 4]])
    // just under the line is the recording's own speed; on it is fast
    assert.deepEqual(fastStretches([[0, 0], [10, 10 * FAST - 0.01]]), [])
    assert.deepEqual(fastStretches([[0, 0], [10, 10 * FAST]]), [[0, 10]])
    // slowed down is never labelled
    assert.deepEqual(fastStretches([[0, 0], [10, 4]]), [])
  })

  it('puts a region in the middle of the safe area, and keeps the ground out of it', () => {
    const W = 1920
    const H = 1080
    const S = { x: 60, y: 44, w: 1800, h: 868 }
    const win = { x: 300, y: 100, w: 1320, h: 825 }
    const onScreen = ([z, cx, cy], p) => ({ x: W / 2 + (p.x - cx) * z, y: H / 2 + (p.y - cy) * z })
    const safeMid = { x: S.x + S.w / 2, y: S.y + S.h / 2 }

    // a region in the middle of the window: its centre is the safe area's, and it fills 80 % of the height
    const mid = { x: 760, y: 400, w: 400, h: 200 }
    const cam = frameRect(mid, 0.8, S, win, W, H)
    near(cam[0], (0.8 * S.h) / mid.h, 'zoom')
    const at = onScreen(cam, { x: mid.x + mid.w / 2, y: mid.y + mid.h / 2 })
    near(at.x, safeMid.x, 'centre x')
    near(at.y, safeMid.y, 'centre y')

    // the composer, at the bottom edge of the window: the window's edge stops at the safe area's
    const low = { x: 500, y: 760, w: 900, h: 150 }
    const down = frameRect(low, 0.72, S, win, W, H)
    near(onScreen(down, { x: 0, y: win.y + win.h }).y, S.y + S.h, 'the window ends where the safe area does')
    assert.ok(onScreen(down, { x: 0, y: low.y }).y >= S.y, 'the region is still inside the safe area')

    // the whole window, smaller than the safe area: centred, not pushed to an edge
    const whole = frameRect(win, 0.9, S, win, W, H)
    const centre = onScreen(whole, { x: win.x + win.w / 2, y: win.y + win.h / 2 })
    near(centre.x, safeMid.x, 'window centre x')
    near(centre.y, safeMid.y, 'window centre y')

    // a fill above 1 crops the region's margins and zooms by exactly that much more
    near(frameRect(mid, 1.08, S, win, W, H)[0] / frameRect(mid, 1, S, win, W, H)[0], 1.08, 'fill is the zoom')
  })

  it('is what the engine draws by: no copy of a rule in the page', () => {
    const engine = readFileSync(path.join(STYLE, 'engine.js'), 'utf8')
    assert.match(engine, /from '\.\/core\.js'/)
    assert.doesNotMatch(engine, /Math\.round\(/, 'the engine rounds a frame itself: that rule lives in core.js')
  })
})

describe('video session spec', () => {
  it('passes the starter, and starts the film with the frame', () => {
    assert.doesNotThrow(() => validateSpec(starter))
    assert.throws(() => validateSpec(mutate((s) => { s.cam[0] = [0, 'window'] })), /cam\[0\] is \[0, 'frame'\]/)
    assert.throws(() => validateSpec(mutate((s) => { s.cam[1] = [9, 'composer'] })), /before the window has landed \(8\)/)
    assert.throws(() => validateSpec(mutate((s) => { s.cam[2] = [10, 'tool'] })), /one move at a time/)
  })

  it('refuses an {agent} slot that does not match the list of agents', () => {
    assert.throws(() => validateSpec(mutate((s) => { s.agents = [] })), /copy\.en\.end\.head\.wide has 1 \{agent\} and spec\.agents names 0/)
    assert.throws(() => validateSpec(mutate((s) => { s.copy.en.end.head.reel.push(['{agent}']) })), /reel has 2 \{agent\}/)
    assert.throws(() => validateSpec(mutate((s) => { s.agents[0].path = '' })), /agents\[0\]: path is its logo/)
  })

  it('refuses a number on screen that has no source', () => {
    assert.throws(() => validateSpec(mutate((s) => { s.copy.en.captions[2][1] = '3 tasks in 2 seconds' })), /"3 tasks in 2 seconds" has a number and no entry in spec.sources/)
    assert.doesNotThrow(() => validateSpec(mutate((s) => { s.copy.en.captions[2][1] = '3 tasks'; s.sources = { '3 tasks': 'the example in card.html' } })))
    assert.throws(() => validateSpec(mutate((s) => { s.copy.en.end.note.reel[2] = 'from 9 a month' })), /"from 9 a month" has a number/)
    assert.ok(specTexts(starter).includes('your agent'), "the agents' names are read too")
  })

  it('refuses a sync that runs backwards', () => {
    assert.throws(() => validateSpec(mutate((s) => { s.sync[3][0] = 15 })), /sync\[3\]: beat 15 comes before the previous entry's 16; sync runs forward/)
    assert.throws(() => validateSpec(mutate((s) => { s.sync = [[8, 3], [12, 1]] })), /second 1 of the take comes before the previous one \(3\)/)
    assert.throws(() => validateSpec(mutate((s) => { s.sync[1][2] = 'fast' })), /'own' or nothing/)
  })

  it('keeps the film in order: hook, window, captions, pill, end card', () => {
    assert.throws(() => validateSpec(mutate((s) => { s.at.flood = 42 })), /at.flood \(42\) comes before at.pillOut/)
    assert.throws(() => validateSpec(mutate((s) => { s.beats = 50 })), /the end card has 5.4 beats and needs 7.6/)
    assert.throws(() => validateSpec(mutate((s) => { s.copy.en.captions[1][0] = 10 })), /a caption stays at least 3 beats/)
    assert.throws(() => validateSpec(mutate((s) => { s.copy.en.captions[0][0] = 7 })), /once the window has landed/)
    assert.throws(() => validateSpec(mutate((s) => { s.copy.en.captions[4][1] = 'x'.repeat(49) })), /48 characters at most/)
    assert.throws(() => validateSpec(mutate((s) => { delete s.copy.en.hook.reel })), /copy.en.hook.reel is a list of lines/)
    assert.throws(() => validateSpec(mutate((s) => { s.marks[0][2] = 43 })), /still leaving at beat 44/)
  })

  it('derives the cues from the spec, in beats, and turns them into a sheet for mix.py', () => {
    const cues = cueSheet(starter)
    const at = (name) => cues.filter((c) => c.name === name).map((c) => c.beat)
    assert.deepEqual(at('click'), [16], 'send')
    assert.deepEqual(at('tool'), [18])
    assert.deepEqual(at('result'), [24], 'the result lands on the drop')
    assert.deepEqual(at('pop'), [3.4, 47], "the full stop, and the end card's mark closing")
    assert.deepEqual(at('flood'), [44.05])
    const audio = JSON.parse(readFileSync(path.join(STYLE, 'audio.json'), 'utf8'))
    const sheet = buildCues(starter, audio)
    assert.equal(sheet.bpm, starter.bpm)
    assert.ok(sheet.cues.every((c) => c.file in sheet.sources))
    assert.ok(Object.values(sheet.sources).every((u) => /^https:\/\/assets\.mixkit\.co\//.test(u)), 'licensed audio is a URL, never a file')
  })

  it('ships a starter session whose take files name what the spec frames', () => {
    const session = JSON.parse(readFileSync(path.join(STYLE, 'starter/session.json'), 'utf8'))
    for (const name of ['en', 'en-reel']) {
      const take = JSON.parse(readFileSync(path.join(STYLE, `starter/take.${name}.json`), 'utf8'))
      assert.deepEqual(take.moments, session.at, `take.${name}.json: the drawn session's moments are session.json's`)
      for (const [, region] of [...starter.cam.slice(1), ...starter.marks.map(([b, r]) => [b, r])]) assert.ok(region === 'window' || take.regions[region], `take.${name}.json has the region "${region}"`)
      for (const [, moment] of starter.sync) assert.ok(moment in take.moments, `take.${name}.json has the moment "${moment}"`)
    }
    assert.match(readFileSync(path.join(STYLE, 'starter/card.html'), 'utf8'), /<template data-shape="wide">[\s\S]*data-row[\s\S]*<template data-shape="reel">[\s\S]*data-row/)
  })
})
