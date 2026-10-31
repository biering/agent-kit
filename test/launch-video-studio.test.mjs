import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { lintPure } from '../skills/launch-video/scripts/render.mjs'
import { evaluate, loadProfile, loopSeam, measureSteps, stepStats, validateProfile } from '../skills/launch-video/scripts/qa.mjs'

const SKILL = fileURLToPath(new URL('../skills/launch-video/', import.meta.url))
const STYLES = ['kinetic', 'one-shape', 'product-ui', 'story', 'ambient-loop']
const ROLES = ['producer', 'director', 'designer', 'animator', 'sound', 'editor', 'delivery']

const haveFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0
const python = ['python3', '/usr/bin/python3'].find((p) => spawnSync(p, ['-c', 'import numpy']).status === 0)
const tmp = () => mkdtempSync(path.join(tmpdir(), 'studio-'))
const read = (...p) => readFileSync(path.join(SKILL, ...p), 'utf8')

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

describe('launch-video measured QA', () => {
  it('measures a step between two frames', () => {
    const a = new Uint8Array(100)
    const b = new Uint8Array(100).fill(0).map((_, i) => (i < 50 ? 255 : 3))
    const s = stepStats(a, b, 24)
    assert.equal(s.area, 0.5)
    assert.equal(s.cutArea, 0.5)
    assert.ok(Math.abs(s.mad - (50 * 255 + 50 * 3) / 100) < 1e-9)
    assert.equal(stepStats(a, b, 2).area, 1, 'a more sensitive metric counts the small change too')
  })

  it('counts still frames, the longest hold and hard cuts, leaving the end card out', () => {
    const still = { area: 0, cutArea: 0, mad: 0, dLuma: 0 }
    const move = { area: 0.2, cutArea: 0.1, mad: 5, dLuma: 1 }
    const cut = { area: 0.9, cutArea: 0.9, mad: 90, dLuma: 60 }
    // 10 fps, 3 s: 4 moving steps, a cut, 12 still steps (a 1.2 s hold), 3 moving, then a 1 s end card of still steps
    const steps = [...Array(4).fill(move), cut, ...Array(12).fill(still), ...Array(3).fill(move), ...Array(9).fill(still)]
    const m = measureSteps(steps, 10, { stillShare: 0.015, endCardSeconds: 1 })
    assert.equal(m.frames, 30)
    assert.equal(m.longestHold, 1.2)
    assert.equal(m.cuts, 1)
    assert.equal(m.flips, 1)
    assert.equal(Math.round(m.stillShare * 100), 60, '12 still steps of the 20 before the end card')
    assert.equal(m.holds[0].seconds, 1.2)
    const whole = measureSteps(steps, 10, { stillShare: 0.015, endCardSeconds: 0 })
    assert.ok(whole.longestHold >= 1.2 && whole.stillShare > m.stillShare, 'with no end card the resting stretch counts')
  })

  it('refuses an end card that leaves little or nothing to measure', () => {
    const move = { area: 0.2, cutArea: 0.1, mad: 5, dLuma: 1 }
    const steps = Array(29).fill(move)   // 3 s at 10 fps
    assert.doesNotThrow(() => measureSteps(steps, 10, { endCardSeconds: 1.5 }), 'half of the film is the most a card may be')
    assert.throws(() => measureSteps(steps, 10, { endCardSeconds: 99 }), /leaves 0\.0 s of a 3\.0 s film to measure/)
    assert.throws(() => measureSteps(steps, 10, { endCardSeconds: 2 }), /at most half of it/)
    assert.throws(() => measureSteps(steps, 10, { endCardSeconds: Number('x') }), /not a number of seconds/)
    assert.throws(() => measureSteps(steps, 10, { endCardSeconds: -1 }), /not a number of seconds/)
  })

  it('joins a rest that spans the wrap of a loop into one hold', () => {
    const still = { area: 0, cutArea: 0, mad: 0, dLuma: 0 }
    const move = { area: 0.2, cutArea: 0.1, mad: 5, dLuma: 1 }
    // 10 fps: 5 still steps, 10 moving, 5 still: a 0.5 s rest at each end is a 1.0 s hold when the loop plays on
    const steps = [...Array(5).fill(still), ...Array(10).fill(move), ...Array(5).fill(still)]
    assert.equal(measureSteps(steps, 10, { loop: false }).longestHold, 0.5)
    assert.equal(measureSteps(steps, 10, { loop: true }).longestHold, 1)
  })

  it('compares the wrap of a loop with the film\'s own steps', () => {
    assert.equal(loopSeam(0.8, 5.45, 1.5).ok, true)
    assert.equal(loopSeam(12, 5.45, 1.5).ok, false)
    assert.equal(loopSeam(0.2, 0.05, 1.5).ok, true, 'a quiet loop is not failed on its noise floor')
    assert.equal(loopSeam(0, 5, 1.5).identical, true)
  })

  it('fails the targets a film misses and names them', () => {
    const profile = { style: 't', targets: { stillShareMax: 0.4, holdMax: 0.6, cutsPer10s: [6, 13], hardCutsMax: 0, bytesMax: 1e6, levelMax: 5.2, audio: 'none' } }
    const facts = { codec: 'h264', level: 60, pixFmt: 'yuvj420p', colorRange: 'pc', bytes: 2e6, hasAudio: true, width: 3840, height: 2560 }
    const m = { frames: 10, stillShare: 0.5, longestHold: 0.9, holds: [{ at: 1.5, seconds: 0.9 }], cuts: 3, cutsPer10s: 2 }
    const failed = evaluate(profile, facts, m).filter((c) => !c.ok).map((c) => c.id)
    assert.deepEqual(failed, ['still frames', 'longest hold', 'hard cuts per 10 s', 'hard cuts', 'file size', 'H.264 level', 'pixel format', 'audio track'])
    const ok = evaluate({ style: 't', targets: { stillShareMax: 0.4 } }, facts, { ...m, stillShare: 0.1 })
    assert.ok(ok.every((c) => c.ok))
  })

  it('rejects a profile with a key it does not know, so a typo cannot turn a check off', () => {
    assert.throws(() => validateProfile({ style: 'x', targets: { holdMaxx: 1 } }), /unknown target "holdMaxx"/)
    assert.throws(() => validateProfile({ style: 'x', measure: { stillDelt: 4 } }), /unknown measure/)
    assert.throws(() => validateProfile({ style: 'x', targets: { loopSeamRatio: 1.5 } }), /needs measure.loop/)
    assert.throws(() => validateProfile({ style: 'x', targets: { cutsPer10s: [9, 3] } }), /\[min, max\]/)
    assert.throws(() => validateProfile({ style: 'x', targets: { audio: 'loud' } }), /required, none or any/)
  })

  it('refuses an unknown --qa before it renders anything', () => {
    const render = path.join(SKILL, 'scripts/render.mjs')
    const started = Date.now()
    for (const spec of ['kinetik', './no-such-profile.json']) {
      const r = spawnSync('node', [render, path.join(SKILL, 'SKILL.md'), '--qa', spec], { encoding: 'utf8' })
      assert.equal(r.status, 1)
      assert.match(r.stderr, new RegExp(`--qa ${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: no such style or profile`))
    }
    assert.ok(Date.now() - started < 8000, 'found before a browser starts')
  })

  it('passes a moving film and fails a parked one, end to end', { skip: !haveFfmpeg && 'no ffmpeg' }, () => {
    const dir = tmp()
    const profile = path.join(dir, 'qa.json')
    writeFileSync(profile, JSON.stringify({ style: 'probe', measure: { stillDelta: 8, stillShare: 0.002 }, targets: { holdMax: 0.5, levelMax: 5.2, audio: 'none' } }))
    const make = (name, src) => {
      const out = path.join(dir, name)
      const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '2', out])
      assert.equal(r.status, 0, String(r.stderr))
      return out
    }
    const qa = (file) => spawnSync('node', [path.join(SKILL, 'scripts/qa.mjs'), file, '--profile', profile], { encoding: 'utf8' })
    const moving = qa(make('moving.mp4', 'testsrc2=s=320x180:r=30'))
    assert.equal(moving.status, 0, moving.stdout + moving.stderr)
    assert.match(moving.stdout, /QA PASSED/)
    const parked = qa(make('parked.mp4', 'color=c=0x336699:s=320x180:r=30'))
    assert.equal(parked.status, 1)
    assert.match(parked.stdout, /FAIL {2}longest hold: 1\.97 s/)
    assert.match(parked.stdout, /QA FAILED/)
  })
})

describe('launch-video styles', () => {
  it('has the five styles, each a complete folder', () => {
    for (const name of STYLES) {
      for (const f of ['STYLE.md', 'spec.js', 'engine.js', 'qa.json', 'audio.json', 'starter/spec.js', 'starter/film.html']) {
        assert.ok(existsSync(path.join(SKILL, 'styles', name, f)), `styles/${name}/${f} is missing`)
      }
    }
  })

  it('ships a QA profile and an audio profile that load, per style', () => {
    for (const name of STYLES) {
      const profile = loadProfile(path.join(SKILL, 'styles', name, 'qa.json'))
      assert.equal(profile.style, name)
      assert.ok(Object.keys(profile.targets).length >= 3, `${name}: a profile with fewer than three targets measures nothing`)
      // the brief asks for every render to be measured on the same few things; the 1 GB ceiling is one of them
      for (const k of ['stillShareMax', 'holdMax', 'bytesMax', 'levelMax', 'hardwareDecode']) assert.ok(profile.targets[k] != null, `${name}: targets.${k} is named`)
      assert.ok(profile.targets.bytesMax <= 1e9, `${name}: bytesMax is at most 1 GB`)
      const audio = JSON.parse(read('styles', name, 'audio.json'))
      assert.equal(audio.style, name)
      assert.ok(audio.description, `${name}: audio.json says what it is for`)
    }
  })

  it('calm styles use the sensitive still metric, kinetic the strict one', () => {
    assert.equal(loadProfile(path.join(SKILL, 'styles/kinetic/qa.json')).measure.stillDelta, 24)
    for (const name of ['one-shape', 'ambient-loop']) {
      const p = loadProfile(path.join(SKILL, 'styles', name, 'qa.json'))
      assert.ok(p.measure.stillDelta <= 8, `${name} measures slow motion`)
      assert.equal(p.targets.hardCutsMax, 0, `${name} is never cut`)
      assert.equal(p.measure.loop, true)
      assert.ok(p.targets.loopSeamRatio > 0)
    }
    assert.equal(loadProfile(path.join(SKILL, 'styles/ambient-loop/qa.json')).targets.audio, 'none', 'a store loop is muted')
  })

  it('validates every starter spec with its own style', async () => {
    for (const name of STYLES) {
      const { validateSpec } = await import(pathToFileURL(path.join(SKILL, 'styles', name, 'spec.js')).href)
      const starter = (await import(pathToFileURL(path.join(SKILL, 'styles', name, 'starter/spec.js')).href)).default
      assert.doesNotThrow(() => validateSpec(starter), `${name} starter`)
      assert.match(read('styles', name, 'starter/film.html'), new RegExp(`/styles/${name}/engine\\.js`), `${name}: the host page imports its own engine`)
    }
  })

  it('writes each STYLE.md with the sections a Director needs', () => {
    for (const name of STYLES) {
      const text = read('styles', name, 'STYLE.md')
      assert.ok(text.split('\n').length <= 200, `${name}/STYLE.md is lean`)
      for (const heading of [/^## /m, /QA/i, /audio/i]) assert.match(text, heading, `${name}/STYLE.md`)
    }
  })

  it('keeps every film script of the skill a pure function of t', () => {
    const bad = []
    for (const file of walk(SKILL)) {
      if (!/\.(?:js|html)$/.test(file) || /[\\/]scripts[\\/]/.test(file) || /\.test\./.test(file)) continue
      for (const p of lintPure(readFileSync(file, 'utf8'), path.relative(SKILL, file))) bad.push(p.text)
    }
    assert.deepEqual(bad, [])
  })
})

const { validateSpec, cueSheet, cuesOf, fill } = await import(pathToFileURL(path.join(SKILL, 'styles/kinetic/spec.js')).href)
const { buildCues } = await import(pathToFileURL(path.join(SKILL, 'styles/kinetic/cues.mjs')).href)
const starter = (await import(pathToFileURL(path.join(SKILL, 'styles/kinetic/starter/spec.js')).href)).default

describe('launch-video kinetic spec', () => {
  const mutate = (fn) => { const s = structuredClone(starter); fn(s); return s }

  it('makes the scenes tile the film, with no gap and no overlap', () => {
    assert.throws(() => validateSpec(mutate((s) => { s.scenes[1].at = [9, 16] })), /starts at beat 9 but the previous scene ends at 8/)
    assert.throws(() => validateSpec(mutate((s) => { s.beats = 60 })), /scenes end at beat 51 but beats is 60/)
    assert.throws(() => validateSpec(mutate((s) => { s.scenes[0].block = 'Slideshow' })), /block is one of/)
    assert.throws(() => validateSpec(mutate((s) => { s.scenes[0].shots[1].at = 99 })), /inside the scene/)
  })

  it('refuses a shot with no word in it', () => {
    assert.throws(() => validateSpec(mutate((s) => { s.scenes[0].shots[0].text = '' })), /text is not empty/)
    assert.throws(() => validateSpec(mutate((s) => { s.scenes[0].shots[2].text = ['NO', '  '] })), /text is not empty/)
  })

  it('refuses a number on screen that has no source', () => {
    assert.throws(() => validateSpec(mutate((s) => { s.scenes[0].shots[0].text = '10x FASTER' })), /"10x FASTER" has a number and no entry in spec.sources/)
    assert.doesNotThrow(() => validateSpec(mutate((s) => { s.scenes[0].shots[0].text = '10x FASTER'; s.sources = { '10x FASTER': 'the benchmark in docs/bench.md' } })))
    assert.throws(() => validateSpec(mutate((s) => { s.scenes[4].counters = [['1,448', 'LINES']] })), /1,448" is a number with no entry/)
    assert.equal(fill('{frames} FRAMES', { beats: 4, bpm: 120, fps: 60 }), '120 FRAMES', 'the film\'s own numbers are filled in')
  })

  it('derives the cues from the blocks, in beats', () => {
    const cues = cueSheet(starter)
    assert.ok(cues.length > 20 && cues.every((c) => c.beat >= 0 && c.beat < starter.beats))
    assert.deepEqual(cues.map((c) => c.beat), [...cues.map((c) => c.beat)].sort((a, b) => a - b))
    assert.ok(cuesOf({ block: 'Logo', at: [41, 51] }).some((c) => c.name === 'logo_hit' && c.beat === 42))
    assert.ok(cues.some((c) => c.name === 'riser' && c.beat === 1), 'the charge rises into the first word')
  })

  it('turns the spec into a cue sheet for mix.py, and says which sound is missing', () => {
    const audio = JSON.parse(read('styles/kinetic/audio.json'))
    const sheet = buildCues(starter, audio)
    assert.equal(sheet.bpm, 134)
    assert.equal(sheet.normalise_sfx, true)
    assert.equal(sheet.music.stop_beat, 41)
    assert.ok(sheet.cues.every((c) => Math.abs(c.t - (c.beat * 60) / 134) < 0.001), 'seconds beside beats: earshot reads only seconds')
    assert.ok(Object.keys(sheet.sources).every((f) => /^https:\/\/assets\.mixkit\.co\//.test(sheet.sources[f])), 'licensed audio is a URL, never a file')
    assert.ok(sheet.cues.every((c) => c.file in sheet.sources), 'every cue names a file the sheet can fetch')
    assert.throws(() => buildCues(starter, { ...audio, kit: { impact: audio.kit.impact } }), /no sound in the kit for the cue/)
  })
})

describe('launch-video studio docs', () => {
  const files = [...walk(SKILL)].filter((f) => /\.(?:md|json|js|mjs|py|sh|html|css)$/.test(f))

  it('names the seven roles, each with a gate and an artifact, and stays lean', () => {
    const skill = read('SKILL.md')
    assert.match(skill, /^---\nname: launch-video\ndescription: .+\n---/)
    assert.ok(skill.split('\n').length <= 140, 'SKILL.md is the index; the detail lives in roles/ and references/')
    for (const role of ROLES) {
      assert.match(skill, new RegExp(`\\(roles/${role}\\.md\\)`), `${role} is linked from SKILL.md`)
      const doc = read('roles', `${role}.md`)
      assert.match(doc, /\*\*Gate: /, `${role}: names its gate`)
      assert.match(doc, /\*\*Artifact/, `${role}: names its artifact`)
    }
    for (const style of STYLES) assert.match(skill, new RegExp(`styles/${style}/STYLE\\.md`))
  })

  it('links only to files that exist', () => {
    const missing = []
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(file, 'utf8')
      for (const [, target] of text.matchAll(/\]\(((?!https?:|mailto:|#)[^)\s]+)\)/g)) {
        const clean = target.split('#')[0]
        if (clean && !existsSync(path.resolve(path.dirname(file), clean))) missing.push(`${path.relative(SKILL, file)} -> ${target}`)
      }
    }
    assert.deepEqual(missing, [])
  })

  it('has no em dash anywhere in the skill', () => {
    const hits = files.filter((f) => readFileSync(f, 'utf8').includes('—')).map((f) => path.relative(SKILL, f))
    assert.deepEqual(hits, [])
  })

  it('keeps licensed audio and rendered video out of the skill', () => {
    const media = [...walk(SKILL)].filter((f) => /\.(?:mp3|wav|mp4|mov|webm)$/i.test(f))
    assert.deepEqual(media, [])
    for (const f of walk(SKILL)) assert.ok(statSync(f).size < 1_500_000, `${path.relative(SKILL, f)} is large for a text file`)
  })
})

describe('launch-video sound tools', { skip: !(haveFfmpeg && python) && 'needs ffmpeg and python with numpy' }, () => {
  // a 4/4 click track: a kick on every beat (stronger on the downbeat), a loud section from bar `dropBar`
  function clickTrack(file, { bpm, offset, seconds, dropBar }) {
    const sr = 22050
    const beat = 60 / bpm
    const x = new Float32Array(Math.floor(seconds * sr))
    const burst = (t, freq, len, amp) => {
      const s0 = Math.floor(t * sr)
      for (let i = 0; i < len * sr && s0 + i < x.length; i++) {
        const u = i / sr
        x[s0 + i] += amp * Math.sin(2 * Math.PI * freq * u * (1 - 2 * u)) * Math.exp(-u * 30)
      }
    }
    for (let k = 0; offset + k * beat < seconds; k++) {
      const loud = Math.floor(k / 4) >= dropBar ? 1 : 0.25
      burst(offset + k * beat, 60, 0.18, loud * (k % 4 === 0 ? 0.9 : 0.6))
      burst(offset + k * beat + beat / 2, 6000, 0.03, loud * 0.15)
    }
    const pcm = Buffer.alloc(44 + x.length * 2)
    pcm.write('RIFF', 0)
    pcm.writeUInt32LE(36 + x.length * 2, 4)
    pcm.write('WAVEfmt ', 8)
    pcm.writeUInt32LE(16, 16)
    pcm.writeUInt16LE(1, 20)
    pcm.writeUInt16LE(1, 22)
    pcm.writeUInt32LE(sr, 24)
    pcm.writeUInt32LE(sr * 2, 28)
    pcm.writeUInt16LE(2, 32)
    pcm.writeUInt16LE(16, 34)
    pcm.write('data', 36)
    pcm.writeUInt32LE(x.length * 2, 40)
    for (let i = 0; i < x.length; i++) pcm.writeInt16LE(Math.max(-1, Math.min(1, x[i])) * 32000, 44 + i * 2)
    writeFileSync(file, pcm)
  }

  it('fits the tempo near the one asked for, the downbeat and the drop', () => {
    const dir = tmp()
    const file = path.join(dir, 'click.wav')
    clickTrack(file, { bpm: 123.4, offset: 0.37, seconds: 40, dropBar: 6 })
    const r = spawnSync(python, [path.join(SKILL, 'scripts/beats.py'), file, '--bpm', '120', '--window', '36', '--drop-beat', '16'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const fit = JSON.parse(r.stdout)
    assert.ok(Math.abs(fit.bpm - 123.4) < 0.1, `fitted ${fit.bpm}`)
    assert.equal(fit.intended, 120)
    assert.ok(fit.drift_pct > 2.5 && fit.drift_pct < 3.1)
    assert.ok(Math.abs(fit.offset - 0.37) < 0.02, `downbeat at ${fit.offset}`)
    assert.ok(fit.grid_strength > 0.5)
    const drop = (0.37 + 6 * 4 * (60 / 123.4))
    assert.ok(Math.abs(fit.drop - drop) < 0.03, `drop at ${fit.drop}, expected ${drop.toFixed(2)}`)
    assert.equal(fit.drop_beat, 24)
    assert.ok(Math.abs(fit.start - (fit.drop - 16 * (60 / 123.4))) < 0.01, 'start puts the drop on film beat 16')
    assert.equal(fit.start_note, 'ok')
  })

  it('reports no drop on a track of even loudness and places nothing by it', () => {
    const dir = tmp()
    const file = path.join(dir, 'flat.wav')
    clickTrack(file, { bpm: 128, offset: 0.2, seconds: 40, dropBar: 0 })   // loud from the first bar to the last
    const r = spawnSync(python, [path.join(SKILL, 'scripts/beats.py'), file, '--bpm', '128', '--drop-beat', '16'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const fit = JSON.parse(r.stdout)
    assert.ok(Math.abs(fit.bpm - 128) < 0.2, `fitted ${fit.bpm}`)
    assert.deepEqual(fit.drops, [])
    assert.equal(fit.drop, null)
    assert.equal(fit.start, undefined, 'no start is offered for a drop that is not there')
    assert.match(fit.start_note, /no drop in this track/)
  })

  it('pins the tempo and fits a window that does not start at zero', () => {
    const dir = tmp()
    const file = path.join(dir, 'click.wav')
    clickTrack(file, { bpm: 100, offset: 0.2, seconds: 40, dropBar: 4 })
    const r = spawnSync(python, [path.join(SKILL, 'scripts/beats.py'), file, '--bpm', '100', '--pin', '--start', '5', '--window', '30'], { encoding: 'utf8' })
    const fit = JSON.parse(r.stdout)
    assert.equal(fit.bpm, 100)
    assert.equal(fit.drift_pct, 0)
    const bar = 4 * 0.6
    const k = Math.round((fit.offset - 0.2) / bar)
    assert.ok(Math.abs(fit.offset - (0.2 + k * bar)) < 0.02, `${fit.offset} is a downbeat`)
    assert.deepEqual(fit.window.map(Math.round), [5, 35])
  })

  it('plays only the duration a cue asks for, and stops the music on a beat', () => {
    const dir = tmp()
    const sr = 22050
    const tone = Buffer.alloc(44 + sr * 2)
    tone.write('RIFF', 0); tone.writeUInt32LE(36 + sr * 2, 4); tone.write('WAVEfmt ', 8); tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22)
    tone.writeUInt32LE(sr, 24); tone.writeUInt32LE(sr * 2, 28); tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34); tone.write('data', 36); tone.writeUInt32LE(sr * 2, 40)
    for (let i = 0; i < sr; i++) tone.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / sr)), 44 + i * 2)
    writeFileSync(path.join(dir, 'tone.wav'), tone)
    writeFileSync(path.join(dir, 'bed.wav'), tone)
    const video = path.join(dir, 'silent.mp4')
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '3', video])
    // a 1 s tone bed that the music stops at beat 2 (1 s at 120 BPM)... and a cue that plays 0.2 s of a 1 s tone at beat 4 (2 s)
    writeFileSync(path.join(dir, 'cues.json'), JSON.stringify({ bpm: 120, duration_beats: 6, music: { file: 'bed.wav', start: 0, stop_beat: 1 }, cues: [{ beat: 4, file: 'tone.wav', duration: 0.2 }] }))
    const out = path.join(dir, 'final.mp4')
    const r = spawnSync(python, [path.join(SKILL, 'scripts/mix.py'), path.join(dir, 'cues.json'), video, out], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const maxVolume = (from, len) => {
      const v = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(from), '-t', String(len), '-i', out, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
      const m = v.stderr.match(/max_volume: (-?[\d.]+|-inf) dB/)
      return m ? (m[1] === '-inf' ? -200 : Number(m[1])) : Number.NaN
    }
    assert.ok(maxVolume(2.02, 0.15) > -40, 'the cue sounds at its beat')
    assert.ok(maxVolume(2.3, 0.6) < -60, 'and is silent after its duration')
    assert.ok(maxVolume(0.1, 0.3) > -40, 'the music plays until its stop beat')
    assert.ok(maxVolume(0.6, 0.35) < -60, 'and is gone after it')
  })

  it('keeps the last frames when the audio is shorter than the picture', () => {
    const dir = tmp()
    // a 2 s picture at 30 fps, and a music bed of only 1.5 s: -shortest would cut the picture to 45 frames
    const video = path.join(dir, 'silent.mp4')
    let r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '2', video])
    assert.equal(r.status, 0, String(r.stderr))
    clickTrack(path.join(dir, 'bed.wav'), { bpm: 120, offset: 0, seconds: 1.5, dropBar: 99 })
    clickTrack(path.join(dir, 'hit.wav'), { bpm: 120, offset: 0, seconds: 0.5, dropBar: 0 })
    writeFileSync(path.join(dir, 'cues.json'), JSON.stringify({ bpm: 120, duration_beats: 4, music: { file: 'bed.wav', start: 0, fade_out: 0.2 }, cues: [{ beat: 2, file: 'hit.wav', gain_db: -6 }] }))
    const out = path.join(dir, 'final.mp4')
    r = spawnSync(python, [path.join(SKILL, 'scripts/mix.py'), path.join(dir, 'cues.json'), video, out], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const frames = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', out], { encoding: 'utf8' })
    assert.equal(frames.stdout.trim(), '60')
    const dur = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' })
    assert.ok(Number(dur.stdout) >= 1.99, `audio runs ${dur.stdout.trim()} s`)
  })
})
