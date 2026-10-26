import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  concatLine,
  isBlocking,
  isLocalHost,
  parseMatrix,
  parseStills,
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
