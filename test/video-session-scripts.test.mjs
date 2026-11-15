import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { formatTake, ingestFrames, mergeTake, outsideTake, parseTakeArgs, recordingInTake, sheetFilter, sheetLegend, sheetTimes, shownPath, takeFilter, validateTake } from '../skills/video/scripts/take.mjs'
import { deliver, duckDepth, duckExpression, duckGain, duckIntervals, limited, masterGain, overruns, parseLoudness, voiceGraph, voiceLines } from '../skills/video/scripts/voice.mjs'
import { apiDetail, characters, envKey, LEVEL, MODEL, parseEnv, parseSpeakArgs, preflight, slots, speaker, speakRequest, speakTarget, spokenLines } from '../skills/video/scripts/speak.mjs'

/**
 * A session film's tools, minus ffmpeg and ElevenLabs: what a command line asks for, the filter
 * graphs handed to ffmpeg, what a line is spoken from, and what happens to the files around a run
 * that fails. That the graphs do
 * what they say was checked by hand on real recordings and real speech: a frame per tick of a
 * variable-rate recording, the colours of the JPEGs, the dip under a line and the loudness of the
 * file written. How a frame is read back is styles/session/core.js's to test.
 */
const SOURCE = { width: 3200, height: 2000, duration: 60 }
const args = (...flags) => parseTakeArgs(['film', 'take.mov', '--lang=de', ...flags])

describe('session take', () => {
  it('reads an ingest from the command line, in source seconds and source pixels', () => {
    assert.deepEqual(args(), { filmDir: 'film', recording: 'take.mov', lang: 'de', mode: 'ingest', from: 0, to: null, crop: null, blur: [], width: 2400, fps: 30, every: 0.5, still: null })
    const plan = args('--from=3.2', '--to=48', '--crop=0,120,3200,1800', '--blur=40,60,300,200', '--blur=900,400,640,480@12.5-20', '--width=1920', '--fps=60')
    assert.deepEqual([plan.from, plan.to, plan.width, plan.fps], [3.2, 48, 1920, 60])
    assert.deepEqual(plan.crop, [0, 120, 3200, 1800])
    // an untimed blur hides its box for the whole take
    assert.deepEqual(plan.blur, [[40, 60, 300, 200, null, null], [900, 400, 640, 480, 12.5, 20]])
    assert.equal(parseTakeArgs(['--lang=previs', 'film', 'take.mp4']).lang, 'previs')
  })

  it('reads a sheet and a still, which show the recording as it is', () => {
    assert.deepEqual([args('--sheet').mode, args('--sheet').every, args('--sheet', '--every=0.25').every], ['sheet', 0.5, 0.25])
    assert.deepEqual([args('--still=12.5').mode, args('--still=12.5').still], ['still', 12.5])
    assert.throws(() => args('--sheet', '--crop=0,0,10,10'), /--crop shapes an ingest/)
    assert.throws(() => args('--still=3', '--from=1'), /--from shapes an ingest/)
    assert.throws(() => args('--sheet', '--still=3'), /two runs/)
    assert.throws(() => args('--every=1'), /goes with --sheet/)
  })

  it('refuses a command line it cannot read rather than guess', () => {
    assert.throws(() => parseTakeArgs(['film', 'take.mov']), /--lang is required/)
    assert.throws(() => parseTakeArgs(['film', 'take.mov', '--lang=../de']), /--lang takes/)
    assert.throws(() => parseTakeArgs(['film', '--lang=de']), /a film folder and a recording/)
    for (const crop of ['0,0,100', '0,0,100,100,5', '0,0,100,x', '-4,0,100,100', '0,0,10.5,100', '']) assert.throws(() => args(`--crop=${crop}`), /--crop takes x,y,w,h/, crop)
    assert.throws(() => args('--crop=0,0,0,100'), /a width and a height/)
    for (const blur of ['10,10,100', '10,10,100,a', '10,10,100,100@5', '10,10,100,100@9-5', '10,10,100,100@1-2@3-4']) assert.throws(() => args(`--blur=${blur}`), /--blur takes x,y,w,h/, blur)
    // boxblur cannot blur a box of two pixels
    assert.throws(() => args('--blur=10,10,2,100'), /at least 4 px/)
    assert.throws(() => args('--from=5', '--to=5'), /not after --from/)
    assert.throws(() => args('--from=soon'), /--from takes seconds/)
    assert.throws(() => args('--fps=0'), /above 0/)
    assert.throws(() => args('--width=0'), /--width takes whole pixels/)
    assert.throws(() => args('--crop=0,0,10,10', '--crop=0,0,20,20'), /given twice/)
    assert.throws(() => args('--trim=3'), /unknown flag --trim=3/)
    assert.throws(() => args('--sheet=1'), /unknown flag/)
  })

  it('holds a crop and a blur to the frame, and a trim to the recording', () => {
    assert.deepEqual(validateTake(args('--crop=0,120,3200,1880', '--blur=3000,1900,200,100', '--from=3', '--to=60'), SOURCE), [])
    assert.deepEqual(validateTake(args('--crop=1,120,3200,1880'), SOURCE), ['--crop=1,120,3200,1880 reaches outside the 3200x2000 frame'])
    assert.match(validateTake(args('--blur=3000,1900,200,101'), SOURCE)[0], /--blur=3000,1900,200,101 reaches outside/)
    assert.match(validateTake(args('--from=60'), SOURCE)[0], /--from=60: the recording is 60\.00 s long/)
    assert.match(validateTake(args('--to=60.5'), SOURCE)[0], /--to=60\.5/)
    assert.match(validateTake(args('--still=61'), SOURCE)[0], /--still=61/)
    assert.equal(validateTake(args('--crop=0,0,4000,100', '--blur=0,0,10,3000', '--to=99'), SOURCE).length, 3)
  })

  it('blurs before it crops, then scales, then resamples', () => {
    const { graph, crop, width, height } = takeFilter(args('--from=3.2', '--to=48', '--crop=0,120,3200,1800', '--blur=40,60,300,200', '--blur=900,400,640,480@12.5-20'), SOURCE)
    assert.deepEqual([crop, width, height], [[0, 120, 3200, 1800], 2400, 1350])
    const at = (part) => {
      assert.ok(graph.includes(part), `${part} is not in ${graph}`)
      return graph.indexOf(part)
    }
    // what a blur hides must be gone before the crop decides what a frame holds
    const order = ['boxblur=24:4', 'crop=3200:1800:0:120', 'scale=2400:1350', 'fps=fps=30'].map(at)
    assert.deepEqual(order, [...order].sort((a, b) => a - b))
    // each box is blurred from its own pixels and laid back where it was
    at('[b0]crop=300:200:40:60,boxblur=24:4[k0]')
    at('[v0][k0]overlay=40:60:format=gbrp[v1]')
    // a timed blur is on between its two source seconds, so it is read before the trim moves the clock
    at("[v1][k1]overlay=900:400:format=gbrp:enable='between(t,12.5,20)'[v2]")
    assert.ok(at("enable='between(t,12.5,20)'") < at('setpts=PTS-3.2/TB'))
    assert.equal(graph.match(/enable=/g).length, 1)
    // the cut is the resampler's: frame 1 is second 3.2, and the take ends 44.8 s later
    at('setpts=PTS-3.2/TB,fps=fps=30:start_time=0:round=up,trim=end=44.8[out]')
    // a JPEG is read as BT.601 full range, whatever the recording was
    at('out_color_matrix=bt601:out_range=pc,format=yuvj420p')
  })

  it('never upscales, keeps the height even and needs no blur to work', () => {
    const whole = takeFilter(args(), SOURCE)
    assert.deepEqual([whole.crop, whole.width, whole.height], [[0, 0, 3200, 2000], 2400, 1500])
    assert.match(whole.graph, /^\[0:v\]format=gbrp,crop=3200:2000:0:0,scale=2400:1500:/)
    assert.doesNotMatch(whole.graph, /split|boxblur|overlay|trim/)
    // narrower than --width: the frame is the crop, not a blown-up crop
    assert.deepEqual([takeFilter(args('--crop=100,100,1000,601'), SOURCE).width, takeFilter(args('--crop=100,100,1000,601'), SOURCE).height], [1000, 602])
    for (const crop of ['0,0,3200,1999', '0,0,3200,1998', '7,7,3001,1333', '0,0,2401,999']) {
      const { width, height } = takeFilter(args(`--crop=${crop}`), SOURCE)
      assert.equal(height % 2, 0, crop)
      assert.ok(width <= 2400 && width <= Number(crop.split(',')[2]), crop)
    }
    // a small box takes the largest radius boxblur accepts for it: under half its short side
    assert.match(takeFilter(args('--blur=0,0,40,30'), SOURCE).graph, /crop=40:30:0:0,boxblur=14:4/)
    assert.match(takeFilter(args('--blur=0,0,4,4'), SOURCE).graph, /boxblur=1:4/)
  })

  it('refuses a recording that lies in the folder its ingest replaces', () => {
    // the frames go to <film>/takes/<lang>/, cut in <film>/takes/.<lang>-ingest: both are removed on the way
    assert.ok(recordingInTake('/films/x/takes/de/take.mov', '/films/x/takes', 'de'))
    assert.ok(recordingInTake('/films/x/takes/de/raw/take.mov', '/films/x/takes', 'de'))
    assert.ok(recordingInTake('/films/x/takes/.de-ingest/take.mov', '/films/x/takes', 'de'))
    assert.ok(recordingInTake('films/x/takes/de/../de/take.mov', 'films/x/takes', 'de'))
    // beside the frames, in another take's folder, or anywhere else is fine
    assert.ok(!recordingInTake('/films/x/takes/take.mov', '/films/x/takes', 'de'))
    assert.ok(!recordingInTake('/films/x/takes/de-reel/take.mov', '/films/x/takes', 'de'))
    assert.ok(!recordingInTake('/films/x/takes/en/take.mov', '/films/x/takes', 'de'))
    assert.ok(!recordingInTake('/recordings/takes/de/take.mov', '/films/x/takes', 'de'))
    assert.ok(!recordingInTake('/films/x/takes/de/../take.mov', '/films/x/takes', 'de'))
  })

  it('swaps the new frames in only when the ingest worked', () => {
    const takes = mkdtempSync(path.join(tmpdir(), 'video-session-'))
    const frames = (...names) => (folder) => {
      for (const name of names) writeFileSync(path.join(folder, name), 'new')
      return true
    }
    try {
      // a first ingest: no folder yet
      assert.equal(ingestFrames(takes, 'de', frames('f00001.jpg', 'f00002.jpg', 'f00003.jpg')), 3)
      assert.deepEqual(readdirSync(takes), ['de'])
      writeFileSync(path.join(takes, 'de', 'f00001.jpg'), 'old')

      // ffmpeg fails half-way: its frames are thrown away, the take is the one from before
      const failed = ingestFrames(takes, 'de', (folder) => {
        writeFileSync(path.join(folder, 'f00001.jpg'), 'half')
        return false
      })
      assert.equal(failed, 0)
      assert.deepEqual(readdirSync(takes), ['de'])
      assert.deepEqual(readdirSync(path.join(takes, 'de')), ['f00001.jpg', 'f00002.jpg', 'f00003.jpg'])
      assert.equal(readFileSync(path.join(takes, 'de', 'f00001.jpg'), 'utf8'), 'old')
      // ffmpeg "works" and writes nothing: the same
      assert.equal(ingestFrames(takes, 'de', () => true), 0)
      assert.equal(readdirSync(path.join(takes, 'de')).length, 3)
      // it throws: the same, and no folder is left beside the take
      assert.throws(() => ingestFrames(takes, 'de', () => { throw new Error('spawn failed') }), /spawn failed/)
      assert.deepEqual(readdirSync(takes), ['de'])

      // a second ingest that works replaces every frame: a shorter take leaves no frame of the longer one
      mkdirSync(path.join(takes, '.de-ingest'))
      writeFileSync(path.join(takes, '.de-ingest', 'f00009.jpg'), 'left by a run that was killed')
      assert.equal(ingestFrames(takes, 'de', frames('f00001.jpg', 'f00002.jpg', 'notes.txt')), 2)
      assert.deepEqual(readdirSync(path.join(takes, 'de')), ['f00001.jpg', 'f00002.jpg', 'notes.txt'])
      assert.equal(readFileSync(path.join(takes, 'de', 'f00001.jpg'), 'utf8'), 'new')
      assert.ok(!existsSync(path.join(takes, '.de-ingest')))
    } finally {
      rmSync(takes, { recursive: true, force: true })
    }
  })

  it('keeps the moments and regions measured by hand through a second ingest', () => {
    const fresh = { lang: 'de', source: 'take-2.mov', fps: 30, frames: 900, dir: 'takes/de', from: 5, crop: [0, 0, 3200, 2000], width: 2400, height: 1500, blur: [] }
    const existing = { lang: 'de', source: 'take.mov', fps: 60, frames: 10, dir: 'takes/de', from: 3.2, crop: [0, 0, 100, 100], width: 100, height: 100, blur: [[1, 2, 30, 40, null, null]], moments: { sent: 6.4, card: 31 }, regions: { prompt: [400, 1500, 2400, 300] } }
    assert.deepEqual(mergeTake(existing, fresh), { ...fresh, moments: { sent: 6.4, card: 31 }, regions: { prompt: [400, 1500, 2400, 300] } })
    assert.deepEqual(mergeTake(undefined, fresh), { ...fresh, moments: {}, regions: {} })
    // a file written by hand may lack one of the two
    assert.deepEqual(mergeTake({ moments: { sent: 1 } }, fresh).regions, {})
    assert.deepEqual(Object.keys(mergeTake(existing, fresh)).slice(-2), ['moments', 'regions'])
  })

  it('names the moments and regions a new trim or crop has cut off', () => {
    const take = { fps: 30, frames: 300, from: 5, crop: [400, 0, 2400, 2000], moments: { early: 4.9, sent: 5, card: 15, late: 15.1 }, regions: { prompt: [400, 1500, 2400, 300], sidebar: [0, 0, 380, 2000], wide: [300, 10, 200, 200] } }
    assert.deepEqual(outsideTake(take), ['moment "early"', 'moment "late"', 'region "sidebar"', 'region "wide"'])
    assert.deepEqual(outsideTake({ ...take, moments: {}, regions: {} }), [])
  })

  it('writes take.json the way it is edited by hand', () => {
    const take = mergeTake({ moments: { sent: 6.4 }, regions: { prompt: [400, 1500, 2400, 300] } }, { lang: 'de', source: 'take [2].mov', fps: 30, frames: 1180, dir: 'takes/de', from: 3.2, crop: [0, 0, 3200, 2000], width: 2400, height: 1500, blur: [[40, 60, 300, 200, null, null], [900, 400, 640, 480, 12.5, 20]] })
    const text = formatTake(take)
    assert.deepEqual(JSON.parse(text), take)
    assert.ok(text.endsWith('}\n') && !text.endsWith('\n\n'))
    assert.match(text, /^ {2}"crop": \[0, 0, 3200, 2000\],$/m)
    assert.match(text, /^ {4}\[40, 60, 300, 200, null, null\],$/m)
    assert.match(text, /^ {4}"prompt": \[400, 1500, 2400, 300\]$/m)
    assert.match(text, /^ {2}"source": "take \[2\]\.mov",$/m)
    assert.match(formatTake(mergeTake(undefined, { blur: [] })), /"blur": \[\],\n {2}"moments": \{\},\n {2}"regions": \{\}\n\}\n$/)
  })

  it('prints a path from the working directory, and one outside it as it was given', () => {
    assert.equal(shownPath('/repo/films/x/takes/de', '/repo'), 'films/x/takes/de')
    assert.equal(shownPath('/repo', '/repo'), '.')
    // a film in a temp folder is not five `../` away
    assert.equal(shownPath('/tmp/studio/film/takes/de', '/repo/apps/web'), '/tmp/studio/film/takes/de')
    assert.equal(shownPath('../film/take.de.json', '/repo/scripts'), '../film/take.de.json')
  })

  it('lays a contact sheet out six tiles across, a tile per step, with its seconds', () => {
    assert.deepEqual(sheetTimes(2.2, 0.5), ['0.0', '0.5', '1.0', '1.5', '2.0'])
    // the recording ends at 2.0: there is no frame to show for that tile
    assert.deepEqual(sheetTimes(2, 0.5), ['0.0', '0.5', '1.0', '1.5'])
    assert.deepEqual(sheetTimes(3, 1), ['0', '1', '2'])
    assert.equal(sheetLegend(sheetTimes(4.6, 0.5)), '  0.0  0.5  1.0  1.5  2.0  2.5\n  3.0  3.5  4.0  4.5')
    assert.equal(sheetLegend(sheetTimes(60, 5).slice(0, 8)), '   0   5  10  15  20  25\n  30  35')
    // the tick is the second written on the tile: round=up shows what was on screen at it, not what came after
    assert.equal(sheetFilter(0.5, null), '[0:v]fps=fps=1/0.5:start_time=0:round=up,scale=480:-2:flags=lanczos,tile=6x5:padding=4:margin=4[out]')
    assert.match(sheetFilter(0.5, '/fonts/Mono.ttf'), /scale=480:-2:flags=lanczos,drawtext=fontfile='\/fonts\/Mono\.ttf':text='%\{eif.*,tile=6x5/)
    assert.match(sheetFilter(1, ''), /,drawtext=text='%\{eif/)
  })
})

describe('session voice', () => {
  const spec = {
    bpm: 120,
    cues: [],
    voice: {
      de: [{ t: 9.5, file: 'voice/de/02.wav' }, { beat: 2, file: 'voice/de/01.wav', gain_db: -3 }],
      en: [],
    },
  }

  it('reads the lines of one language, beats as seconds, in the order they start', () => {
    assert.deepEqual(voiceLines(spec, 'de'), [{ t: 1, file: 'voice/de/01.wav', gainDb: -3 }, { t: 9.5, file: 'voice/de/02.wav', gainDb: 0 }])
    // a language without lines, or a film without a voice, is a film to copy as it is
    assert.deepEqual(voiceLines(spec, 'en'), [])
    assert.deepEqual(voiceLines(spec, 'fr'), [])
    assert.deepEqual(voiceLines({ cues: [] }, 'de'), [])
    assert.deepEqual(voiceLines({ bpm: 90, voice: { de: [{ beat: 3, file: 'a.wav' }] } }, 'de'), [{ t: 2, file: 'a.wav', gainDb: 0 }])
    assert.equal(duckDepth(spec), -9)
    assert.equal(duckDepth({ voice: { duck_db: -6 } }), -6)
    assert.equal(duckDepth({ voice: { duck_db: 0 } }), 0)
  })

  it('refuses a line it cannot place', () => {
    assert.throws(() => voiceLines({ voice: { de: [{ beat: 2, file: 'a.wav' }] } }, 'de'), /"beat" needs a top-level "bpm"/)
    // a film timed in seconds needs no tempo
    assert.deepEqual(voiceLines({ voice: { de: [{ t: 2, file: 'a.wav' }] } }, 'de'), [{ t: 2, file: 'a.wav', gainDb: 0 }])
    assert.throws(() => voiceLines({ voice: { de: [{ file: 'a.wav' }] } }, 'de'), /voice\.de\[0\] needs "beat" or "t"/)
    assert.throws(() => voiceLines({ voice: { de: [{ t: -1, file: 'a.wav' }] } }, 'de'), /at 0 or later/)
    assert.throws(() => voiceLines({ voice: { de: [{ t: 1, file: 'a.wav' }, { t: 2 }] } }, 'de'), /voice\.de\[1\] needs a "file"/)
    assert.throws(() => voiceLines({ voice: { de: [{ t: 1, file: 'a.wav', gain_db: 'loud' }] } }, 'de'), /"gain_db"/)
    assert.throws(() => voiceLines({ voice: { de: { t: 1 } } }, 'de'), /not a list/)
    assert.throws(() => duckDepth({ voice: { duck_db: 9 } }), /0 or below/)
    assert.throws(() => duckDepth({ voice: { duck_db: '-9' } }), /0 or below/)
  })

  it('warns when a line is still speaking as the next starts or the film ends', () => {
    const lines = [{ t: 1, file: '01.wav' }, { t: 4, file: '02.wav' }, { t: 9, file: '03.wav' }]
    assert.deepEqual(overruns(lines, [2.5, 3, 0.9], 10), [])
    assert.deepEqual(overruns(lines, [3.42, 3, 2.1], 10), ['01.wav (at 1.00 s) runs 0.42 s into 02.wav (at 4.00 s)', '03.wav (at 9.00 s) runs 1.10 s past the end of the film'])
    // a line can do both
    assert.equal(overruns(lines, [1, 20, 0.5], 10).length, 2)
    // a few milliseconds over is on time: less than the warning could print
    assert.deepEqual(overruns(lines, [3, 5.004, 1.001], 10), [])
  })

  it('dips the bed once for lines less than half a second apart', () => {
    const lines = [{ t: 1 }, { t: 3.4 }, { t: 6 }, { t: 9 }]
    // 1–3 and 3.4–5 are 0.4 s apart: one dip; 5–6 is a second: two
    assert.deepEqual(duckIntervals(lines, [2, 1.6, 2, 0.5]), [[1, 5], [6, 8], [9, 9.5]])
    // exactly half a second leaves room for the bed to come up and go down again
    assert.deepEqual(duckIntervals([{ t: 1 }, { t: 3.5 }], [2, 1]), [[1, 3], [3.5, 4.5]])
    // an overrun is one dip, and a short line inside a long one does not end it early
    assert.deepEqual(duckIntervals([{ t: 1 }, { t: 2 }], [5, 1]), [[1, 6]])
    assert.deepEqual(duckIntervals([{ t: 4 }, { t: 1 }], [1, 1]), [[1, 2], [4, 5]])
    assert.deepEqual(duckIntervals([], []), [])
  })

  it('lowers the bed by the dip under a line, over a quarter second either side', () => {
    const intervals = [[2, 4], [4.5, 6]]
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`)
    near(duckGain(0, intervals), 0)
    near(duckGain(1.75, intervals), 0)
    // half way down the ramp, in dB
    near(duckGain(1.875, intervals), -4.5)
    // down by the time the line starts, and for as long as it speaks
    near(duckGain(2, intervals), -9)
    near(duckGain(3, intervals), -9)
    near(duckGain(4, intervals), -9)
    near(duckGain(4.125, intervals), -4.5)
    // half a second between two dips: the bed just reaches its level, then turns
    near(duckGain(4.25, intervals), 0)
    near(duckGain(6.25, intervals), 0)
    near(duckGain(99, intervals), 0)
    near(duckGain(3, intervals, -6), -6)
    near(duckGain(1.9, intervals, -12, 0.5), -9.6)
    // a line at the very start: the film opens with the bed already on its way down
    near(duckGain(0, [[0.1, 2]]), -5.4)
    near(duckGain(5, []), 0)
  })

  it('hands ffmpeg the same envelope as an expression', () => {
    // ffmpeg's expression language, as far as the envelope uses it
    const evaluate = (expr, t) => new Function('t', 'pow', 'min', 'clip', `return ${expr}`)(t, Math.pow, Math.min, (x, lo, hi) => Math.min(hi, Math.max(lo, x)))
    assert.equal(duckExpression([[2, 4]]), 'pow(10,-0.45*min(1,clip(min(t-1.75,4.25-t)/0.25,0,1)))')
    // a dip that begins before the film does must not read as `t--0.15`
    assert.equal(duckExpression([[0.1, 2]], -6), 'pow(10,-0.3*min(1,clip(min(t+0.15,2.25-t)/0.25,0,1)))')
    assert.equal(evaluate(duckExpression([]), 3), 1)
    for (const [intervals, db, ramp] of [[[[2, 4], [4.5, 6]], -9, 0.25], [[[0.1, 2], [7, 7.3]], -12, 0.25], [[[1, 5]], -6, 0.5]]) {
      for (let t = 0; t <= 10; t += 0.05) {
        const gain = 20 * Math.log10(evaluate(duckExpression(intervals, db, ramp), t))
        assert.ok(Math.abs(gain - duckGain(t, intervals, db, ramp)) < 1e-9, `at ${t} s the expression gives ${gain} dB, the envelope ${duckGain(t, intervals, db, ramp)}`)
      }
    }
  })

  it('ducks the bed, places every line and sums without levelling', () => {
    const lines = voiceLines(spec, 'de')
    const graph = voiceGraph(lines, duckIntervals(lines, [2.4, 1.8]))
    const chains = graph.split(';')
    assert.equal(chains.length, 5)
    // the bed: the film's own sound, in 5 ms steps so the ramp is smooth, its gain read from the envelope on every step
    assert.equal(chains[0], `[0:a]aresample=48000,aformat=channel_layouts=stereo,asetnsamples=n=256:p=0,volume='${duckExpression([[1, 3.4], [9.5, 11.3]])}':eval=frame[bed]`)
    // a line: its gain, then silence up to its start
    assert.equal(chains[1], '[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=-3dB,adelay=1000|1000[l0]')
    assert.equal(chains[2], '[2:a]aresample=48000,aformat=channel_layouts=stereo,volume=0dB,adelay=9500|9500[l1]')
    // amix would otherwise halve two lines and halve the mix again
    assert.equal(chains[3], '[l0][l1]amix=inputs=2:normalize=0[voice]')
    assert.equal(chains[4], '[bed][voice]amix=inputs=2:normalize=0:duration=first,aformat=channel_layouts=stereo[a]')
    assert.match(voiceGraph(lines.slice(0, 1), [[1, 3.4]], -6), /\[l0\]amix=inputs=1:normalize=0\[voice\]/)
    assert.match(voiceGraph(lines.slice(0, 1), [[1, 3.4]], -6), /volume='pow\(10,-0\.3\*/)
  })

  it('masters with one gain for the whole film, and knows what the limiter took', () => {
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`)
    // a mastered bed, a little quieter for its dips: a fraction of a dB up, the same from first frame to last
    near(masterGain(-14.4), 0.4)
    near(masterGain(-12.8), -1.2)
    near(masterGain(-14), 0)
    near(masterGain(-20, -16), 4)
    // the premix peaks at -1.4 and the gain lifts that to -0.6: 0.4 dB over the -1 dBTP it has to hold
    near(limited(-1.4, 0.8), 0.4)
    // the pilot's bed under quiet lines: 3.4 dB of gain puts the music's peaks 3 dB over
    near(limited(-1.4, 3.4), 3)
    near(limited(2.5, 0.5, -2), 5)
    // peaks that stay under the ceiling are nothing to take, not a negative amount
    assert.equal(limited(-6, 0.4), 0)
    near(limited(-1.4, 0.4), 0)
  })

  it('puts a film under its name whole or not at all', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'video-session-'))
    const out = path.join(dir, 'x-film.mp4')
    try {
      writeFileSync(path.join(dir, 'master.tmp'), 'mastered')
      deliver(path.join(dir, 'master.tmp'), out)
      assert.equal(readFileSync(out, 'utf8'), 'mastered')
      // the source stays (it is the mixed film when a language has no voice), and nothing else is left
      assert.deepEqual(readdirSync(dir), ['master.tmp', 'x-film.mp4'])

      // a copy that fails leaves the film from the run before, not a part of the new one under its name
      assert.throws(() => deliver(path.join(dir, 'gone.mp4'), out), /ENOENT/)
      assert.equal(readFileSync(out, 'utf8'), 'mastered')
      assert.deepEqual(readdirSync(dir), ['master.tmp', 'x-film.mp4'])
      // and where there was no film, there is none: the upload files every .mp4 it finds
      assert.throws(() => deliver(path.join(dir, 'gone.mp4'), path.join(dir, 'x-reel.mp4')), /ENOENT/)
      assert.deepEqual(readdirSync(dir), ['master.tmp', 'x-film.mp4'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads loudness and true peak from the summary ffmpeg logs', () => {
    const log = [
      '[Parsed_ebur128_0 @ 0x1] t: 9.9  TARGET:-23 LUFS    M: -13.1 S: -13.9     I: -13.8 LUFS       LRA:   3.1 LU  FTPK:  -4.5  -4.4 dBFS  TPK:  -0.9  -1.0 dBFS',
      '[Parsed_ebur128_0 @ 0x1] Summary:',
      '',
      '  Integrated loudness:',
      '    I:         -14.0 LUFS',
      '    Threshold: -24.3 LUFS',
      '',
      '  Loudness range:',
      '    LRA:         3.2 LU',
      '    Threshold: -34.3 LUFS',
      '    LRA low:   -16.9 LUFS',
      '    LRA high:  -13.7 LUFS',
      '',
      '  True peak:',
      '    Peak:       -1.5 dBFS',
    ].join('\n')
    // the summary's numbers, not the last frame's running ones
    assert.deepEqual(parseLoudness(log), { integrated: -14, truePeak: -1.5 })
    assert.throws(() => parseLoudness('Summary:\n  Integrated loudness:\n    I:         -70.0 LUFS\n  True peak:\n    Peak:       -inf dBFS'), /no loudness/)
    assert.throws(() => parseLoudness(''), /no loudness/)
  })
})

describe('session speak', () => {
  const sheet = {
    bpm: 120,
    duration_beats: 20,
    voice: {
      de: [
        { beat: 2, file: 'voice/de/01.wav', text: 'Frag Claude.' },
        { beat: 8, file: 'voice/de/02.wav', text: ' Das Tool rechnet. ' },
        { beat: 14, file: 'voice/de/03.wav', text: 'In jedem Tarif.' },
      ],
      en: [{ beat: 2, file: 'voice/en/01.wav' }],
    },
  }

  it('reads a read from the command line, and a voice id that can go into a URL', () => {
    assert.deepEqual(parseSpeakArgs(['film', '--lang=de']), { filmDir: 'film', lang: 'de', voice: null, model: null, to: null, level: LEVEL, yes: false })
    assert.deepEqual(parseSpeakArgs(['film', '--lang=de', '--voice=GbX1SzqxzU43']), { filmDir: 'film', lang: 'de', voice: 'GbX1SzqxzU43', model: null, to: null, level: LEVEL, yes: false })
    assert.deepEqual(parseSpeakArgs(['film', '--lang=en', '--voice=abc', '--model=eleven_v4', '--to=/tmp/try', '--level=-16']), { filmDir: 'film', lang: 'en', voice: 'abc', model: 'eleven_v4', to: '/tmp/try', level: -16, yes: false })
    assert.deepEqual(parseSpeakArgs(['--voices']), { voices: true })
    assert.throws(() => parseSpeakArgs(['film', '--lang=de', '--voice=../v1/user']), /--voice takes a voice id/)
    assert.throws(() => parseSpeakArgs(['film', '--voice=abc']), /--lang takes/)
    assert.throws(() => parseSpeakArgs(['--lang=de', '--voice=abc']), /expected one film folder/)
    assert.throws(() => parseSpeakArgs(['film', '--lang=de', '--voice=abc', '--level=0']), /--level takes LUFS/)
    assert.throws(() => parseSpeakArgs(['film', '--lang=de', '--voice=abc', '--speed=2']), /unknown flag/)
    assert.throws(() => parseSpeakArgs(['film', '--voices']), /stands alone/)
  })

  it('speaks with the film\'s own voice unless another is named to try', () => {
    const own = { voice: { speaker: { voice: 'T8KZ', model: 'eleven_v4' } } }
    assert.deepEqual(speaker({ voice: null, model: null }, own), { voice: 'T8KZ', model: 'eleven_v4' })
    assert.deepEqual(speaker({ voice: 'GbX1', model: null }, own), { voice: 'GbX1', model: 'eleven_v4' })
    assert.deepEqual(speaker({ voice: 'GbX1', model: 'eleven_turbo' }, {}), { voice: 'GbX1', model: 'eleven_turbo' })
    assert.deepEqual(speaker({ voice: 'GbX1', model: null }, {}), { voice: 'GbX1', model: MODEL })
    assert.throws(() => speaker({ voice: null, model: null }, {}), /no voice/)
    // a voice per language: each language is read by its own
    const both = { voice: { speaker: { de: { voice: 'Carla' }, en: { voice: 'Alice', model: 'eleven_v4' } } } }
    assert.deepEqual(speaker({ lang: 'de', voice: null, model: null }, both), { voice: 'Carla', model: MODEL })
    assert.deepEqual(speaker({ lang: 'en', voice: null, model: null }, both), { voice: 'Alice', model: 'eleven_v4' })
    assert.throws(() => speaker({ lang: 'fr', voice: null, model: null }, both), /no voice/)
    // the id from the sheet goes into the URL like one from the command line
    assert.throws(() => speaker({ voice: null, model: null }, { voice: { speaker: { voice: '../v1/user' } } }), /not a voice id/)
  })

  it('speaks every line from its text, in the order the lines start', () => {
    assert.deepEqual(spokenLines(sheet, 'de'), [
      { t: 1, file: 'voice/de/01.wav', text: 'Frag Claude.' },
      { t: 4, file: 'voice/de/02.wav', text: 'Das Tool rechnet.' },
      { t: 7, file: 'voice/de/03.wav', text: 'In jedem Tarif.' },
    ])
    // a line without words would be sent as silence and paid for
    assert.throws(() => spokenLines(sheet, 'en'), /voice\/en\/01\.wav has no "text"/)
    assert.throws(() => spokenLines(sheet, 'fr'), /no voice\.fr/)
  })

  it('gives each line the time to the next one, and the last the time to the end of the film', () => {
    assert.deepEqual(slots(spokenLines(sheet, 'de'), 10), [3, 3, 3])
  })

  it('sends a line with the lines either side of it, so six sentences are one read', () => {
    const lines = spokenLines(sheet, 'de')
    const first = speakRequest(lines, 0)
    assert.equal(first.text, 'Frag Claude.')
    assert.equal(first.model_id, MODEL)
    assert.equal('previous_text' in first, false)
    assert.equal(first.next_text, 'Das Tool rechnet.')
    const middle = speakRequest(lines, 1, 'eleven_v4')
    assert.deepEqual([middle.previous_text, middle.text, middle.next_text, middle.model_id], ['Frag Claude.', 'Das Tool rechnet.', 'In jedem Tarif.', 'eleven_v4'])
    const last = speakRequest(lines, 2)
    assert.equal(last.previous_text, 'Das Tool rechnet.')
    assert.equal('next_text' in last, false)
    // the same sheet asks for the same read: a seed, and settings that do not move
    assert.deepEqual([first.seed, first.voice_settings], [last.seed, last.voice_settings])
  })

  it('writes a line to its own file, or beside the others of a voice that is only being tried', () => {
    assert.equal(speakTarget('film', 'voice/de/01.wav', null), path.join('film', 'voice/de/01.wav'))
    assert.equal(speakTarget('film', 'voice/de/01.wav', '/tmp/try'), path.join('/tmp/try', '01.wav'))
  })

  it('sets the read as a whole to its level with one gain', () => {
    // the voice script's rule, with the read's own target
    assert.equal(masterGain(-20.5, LEVEL), 5.5)
    assert.equal(masterGain(-12, LEVEL), -3)
  })

  it('says in one line what ElevenLabs refused', () => {
    assert.equal(apiDetail('quota exceeded', 'Unauthorized'), 'quota exceeded')
    assert.equal(apiDetail({ status: 'invalid_api_key', message: 'Invalid API key' }, 'Unauthorized'), 'Invalid API key')
    // a 422 lists what was wrong with the request
    assert.equal(apiDetail([{ loc: ['body', 'text'], msg: 'field required' }], 'Unprocessable'), '[{"loc":["body","text"],"msg":"field required"}]')
    assert.equal(apiDetail(undefined, 'Bad Gateway'), 'Bad Gateway')
  })

  it('sends nothing without --yes: it prices the read and asks', () => {
    assert.equal(parseSpeakArgs(['film', '--lang=de']).yes, false)
    assert.equal(parseSpeakArgs(['film', '--lang=de', '--yes']).yes, true)
    assert.throws(() => parseSpeakArgs(['film', '--lang=de', '--yes=1']), /--yes takes no value/)
    assert.throws(() => parseSpeakArgs(['--voices', '--yes']), /stands alone/)
    const lines = spokenLines(sheet, 'de')
    // 12 + 17 + 15 characters of lines; each line also carries its neighbours
    const cost = characters(lines)
    assert.deepEqual(cost, { text: 44, context: 17 + 12 + 15 + 17 })
    const asked = preflight(cost, { used: 1000, limit: 10000 }, false)
    assert.equal(asked.send, false)
    assert.match(asked.lines.join('\n'), /at least 44 characters/)
    assert.match(asked.lines.join('\n'), /9000 of 10000 characters left/)
    assert.match(asked.lines.at(-1), /needs the user's yes; run again with --yes/)
    assert.equal(preflight(cost, { used: 1000, limit: 10000 }, true).send, true)
    // a quota the key may not read does not block a yes, and is said to be unknown
    const blind = preflight(cost, null, true)
    assert.equal(blind.send, true)
    assert.match(blind.lines[1], /unknown/)
    // too few characters left for the lines alone: refused even with a yes
    const short = preflight(cost, { used: 9980, limit: 10000 }, true)
    assert.deepEqual([short.send, short.short], [false, true])
    assert.match(short.lines.at(-1), /20 characters left and the lines need 44/)
  })

  it('reads the key from the environment, else from .env in the working directory', () => {
    assert.deepEqual(parseEnv('# a comment\n\nA=1\nexport B="two words"\nC=\'x # y\'\nD=plain # note\nnot a line\r\nE = spaced \n'), { A: '1', B: 'two words', C: 'x # y', D: 'plain', E: 'spaced' })
    const dir = mkdtempSync(path.join(tmpdir(), 'video-env-'))
    try {
      assert.equal(envKey('ELEVENLABS_API_KEY', {}, dir), undefined)
      writeFileSync(path.join(dir, '.env'), 'OTHER=1\nELEVENLABS_API_KEY="from-file"\n')
      assert.equal(envKey('ELEVENLABS_API_KEY', {}, dir), 'from-file')
      // the environment wins over the file
      assert.equal(envKey('ELEVENLABS_API_KEY', { ELEVENLABS_API_KEY: 'from-env' }, dir), 'from-env')
      writeFileSync(path.join(dir, '.env'), 'ELEVENLABS_API_KEY=\n')
      assert.equal(envKey('ELEVENLABS_API_KEY', {}, dir), undefined)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
