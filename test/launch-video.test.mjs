import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  concatLine,
  defaultWorkers,
  imageSize,
  isBlocking,
  isLocalHost,
  lintPure,
  parseMatrix,
  parseStills,
  pickLevel,
  resolveRequest,
  subframeTimes,
  variantOut,
} from '../skills/launch-video/scripts/render.mjs'

describe('launch-video render', () => {
  it('draws the frame before, on and after each cut, clamped to the film', () => {
    const film = { beat: 0.5, duration: 2, cuts: [0, 1], fps: 50 }
    assert.deepEqual(parseStills('cuts', film), [0, 0, 0.02, 0.98, 1, 1.02])
    assert.deepEqual(parseStills('b1,cuts', { ...film, cuts: [2] }), [0.5, 1.98, 2, 2])
    assert.throws(() => parseStills('cuts', { ...film, cuts: [] }), /window\.film\.cuts/)
  })

  it('expands a matrix into every combination, in the order given', () => {
    assert.deepEqual(parseMatrix('format=wide,reel; hook=a,b'), [
      { query: 'format=wide&hook=a', suffix: 'format-wide-hook-a' },
      { query: 'format=wide&hook=b', suffix: 'format-wide-hook-b' },
      { query: 'format=reel&hook=a', suffix: 'format-reel-hook-a' },
      { query: 'format=reel&hook=b', suffix: 'format-reel-hook-b' },
    ])
    assert.throws(() => parseMatrix('format='), /bad matrix axis/)
    assert.throws(() => parseMatrix('cta=a/../b'), /file-name safe/)
    assert.throws(() => parseMatrix(' ; '), /empty/)
  })

  it('names a variant beside the file, or in a folder of stills', () => {
    assert.equal(variantOut('/x/film.mp4', 'format-reel', true), '/x/film-format-reel.mp4')
    assert.equal(variantOut('/x/stills', 'format-reel', false), '/x/stills/format-reel')
    assert.equal(variantOut('/x/film.mp4', '', true), '/x/film.mp4')
  })

  it('does not stop a run for the favicon Chromium asks for on its own', () => {
    assert.equal(isBlocking('http://127.0.0.1:1/favicon.ico'), false)
    assert.equal(isBlocking('http://127.0.0.1:1/apps/x/font.woff2'), true)
  })

  it('reads stills as seconds or beats', () => {
    assert.deepEqual(parseStills('1.2,b3', { beat: 0.5, duration: 2.1 }), [1.2, 1.5])
    assert.deepEqual(parseStills('every:2', { beat: 0.5, duration: 2.1 }), [0, 1, 2])
    assert.throws(() => parseStills('b2', { duration: 2 }), /needs window\.film\.beat/)
  })

  it('spreads motion-blur samples over the shutter, never before 0', () => {
    assert.deepEqual(subframeTimes(0, 1, 60, 0.5), [0])
    assert.deepEqual(subframeTimes(60, 3, 60, 0.5), [(60 - 0.25) / 60, 1, (60 + 0.25) / 60])
    assert.deepEqual(subframeTimes(0, 2, 60, 0.5), [0, 0.25 / 60])
  })

  it('keeps a motion-blur window on its own side of a hard cut', () => {
    // 60 fps, 4 samples over half a frame. Frame 30's window is 29.75 to 30.25 frames.
    const frames = (f, cut) => subframeTimes(f, 4, 60, 0.5, [cut / 60]).map((t) => t * 60)
    const before = frames(30, 30.2) // the cut falls after the frame's own time: the frame belongs to the shot before it
    assert.ok(Math.max(...before) < 30.2, 'the frame before the cut never samples the next shot')
    assert.ok(30.2 - Math.max(...before) < 0.01, 'its shutter ends just short of the cut, so the fastest frame of a whip is still blurred')
    assert.ok(Math.abs(before[3] - before[0] - 0.5) < 1e-3, 'the window keeps its width')
    const on = frames(30, 29.9) // the cut falls before the frame's own time: the frame belongs to the shot after it
    assert.ok(Math.min(...on) >= 29.9 - 1e-9 && Math.abs(on[3] - on[0] - 0.5) < 1e-9, 'the frame after the cut starts its shutter on it')
    assert.deepEqual(subframeTimes(10, 4, 60, 0.5, [0.5]), subframeTimes(10, 4, 60, 0.5), 'a cut outside the window changes nothing')
  })

  it('sizes the workers to the machine, fewer at 4K', () => {
    const hd = { width: 1920, height: 1080 }
    assert.equal(defaultWorkers({ ramGB: 36, cpuCount: 12, ...hd }), 6)
    assert.equal(defaultWorkers({ ramGB: 36, cpuCount: 12, ...hd, scale: 2 }), 2, 'about 11 GB a worker at 4K: 80% of 36 GB carries two')
    assert.equal(defaultWorkers({ ramGB: 128, cpuCount: 32, ...hd, scale: 2 }), 3, 'capped at three at 4K')
    assert.equal(defaultWorkers({ ramGB: 8, cpuCount: 4, ...hd }), 1)
    assert.equal(defaultWorkers({ ramGB: 4, cpuCount: 2, width: 3840, height: 2160 }), 1, 'never fewer than one')
  })

  it('picks the lowest H.264 level a Mac decodes, and refuses a size above 5.2', () => {
    assert.equal(pickLevel(1920, 1080, 60), '4.2')
    assert.equal(pickLevel(3840, 1646, 30), '5.1')
    assert.equal(pickLevel(3840, 2160, 30), '5.1')
    assert.equal(pickLevel(3840, 2160, 60), '5.2')
    assert.equal(pickLevel(3600, 2400, 30), '5.2', '33,750 macroblocks at 30 fps is over level 5.1\'s rate')
    assert.throws(() => pickLevel(3840, 2560, 30), /38,400 macroblocks.*refuses level 6/)
  })

  it('finds what makes a frame depend on more than t', () => {
    const lines = (src) => lintPure(src, 'film.html').map((p) => p.line)
    assert.deepEqual(lines('const a = Math.random()\nconst b = Date.now()\nconst c = new Date()'), [1, 2, 3])
    assert.deepEqual(lines('setTimeout(f, 1)\nrequestAnimationFrame(f)\nperformance.now()'), [1, 2, 3])
    assert.deepEqual(lines('.a { transition: all 1s }\n.b { animation: x 1s }\n@keyframes x {}'), [1, 2, 3])
    assert.deepEqual(lines('// Math.random is banned\n/* Date.now()\n setTimeout */\nconst r = hash(7)'), [], 'comments and a seeded hash are fine')
    assert.deepEqual(lines('const t = performance.now() // viewer-only'), [], 'the kit\'s scrub bar is marked')
    assert.deepEqual(lines('el.style.transition = "none"'), [], 'switching a transition off is not using one')
  })

  it('reads the size of a PNG or a JPEG, so a capture at the wrong scale stops the run', () => {
    const png = Buffer.alloc(33)
    png.writeUInt32BE(0x89504e47, 0)
    png.writeUInt32BE(3840, 16)
    png.writeUInt32BE(2160, 20)
    assert.deepEqual(imageSize(png), [3840, 2160])
    // SOI, an APP0 segment of 16 bytes, then a baseline SOF0 for 1080 x 1920
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x04, 0x38, 0x07, 0x80, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    assert.deepEqual(imageSize(jpg), [1920, 1080])
    assert.throws(() => imageSize(Buffer.from('GIF89a......................')), /not a PNG or JPEG/)
  })

  it('serves files under the root, never secrets, git internals or an escape', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'serve-'))
    mkdirSync(path.join(root, 'films'))
    writeFileSync(path.join(root, 'films', 'film.html'), '')
    writeFileSync(path.join(root, '.env'), 'X=1')
    assert.equal(resolveRequest(root, '/films/film.html?format=reel'), path.join(root, 'films', 'film.html'))
    assert.equal(resolveRequest(root, '/.env'), null)
    assert.equal(resolveRequest(root, '/../etc/passwd'), null)
    assert.equal(resolveRequest(root, '/%E0%A4%A'), null)
    assert.equal(resolveRequest(root, '/films'), null)
  })

  it('answers only to its own host, and quotes concat paths', () => {
    assert.equal(isLocalHost('127.0.0.1:4000', 4000), true)
    assert.equal(isLocalHost('localhost:4000', 4000), true)
    assert.equal(isLocalHost('evil.example:4000', 4000), false)
    assert.equal(concatLine("/a/it's.mp4"), "file '/a/it'\\''s.mp4'")
  })
})
