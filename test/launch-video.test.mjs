import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isBlocking, parseMatrix, parseStills, variantOut } from '../skills/launch-video/scripts/render.mjs'

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
})
