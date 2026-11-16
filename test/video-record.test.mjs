import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import {
  MAX_STILL_S,
  concatList,
  encodeArgs,
  parseArgs,
  resolveMocks,
  resolveSteps,
  targetQuery,
  validateStoryboard,
} from '../skills/video/scripts/record.mjs'

const haveFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0

const story = (over = {}) => ({ out: 'public/video/x.mp4', page: '/app', steps: [{ goto: '/app' }], ...over })

describe('video record', () => {
  it('reads the storyboard, the base and the overrides from the command line', () => {
    assert.deepEqual(parseArgs(['--', 'board.json']), { storyboard: 'board.json', base: 'http://localhost:3000', out: undefined, channel: undefined })
    const r = parseArgs(['board.json', '--base=http://localhost:4000/', '--out=a.mp4', '--channel=chrome'])
    assert.equal(r.base, 'http://localhost:4000')
    assert.equal(r.out, 'a.mp4')
    assert.equal(r.channel, 'chrome')
    assert.throws(() => parseArgs(['--base=x']), /usage/)
  })

  it('fills the defaults of a minimal storyboard', () => {
    const s = validateStoryboard(story())
    assert.deepEqual(s.viewport, { width: 1440, height: 900 })
    assert.equal(s.colorScheme, 'light')
    assert.deepEqual(s.caption, { background: '#18181b', color: '#fff' })
    assert.deepEqual([s.setup, s.mocks], [[], []])
    assert.ok(s.hide.includes('nextjs-portal'))
    const custom = validateStoryboard(story({ caption: { background: '#fff' }, hide: ['.dev'], viewport: { width: 1280 } }))
    assert.deepEqual(custom.caption, { background: '#fff', color: '#fff' })
    assert.ok(custom.hide.includes('.dev'))
    assert.deepEqual(custom.viewport, { width: 1280, height: 900 })
  })

  it('lists every problem of a broken storyboard in one error', () => {
    const bad = {
      out: 'x.gif',
      steps: [
        { caption: 'no page yet' },
        { click: 'A', press: 'B' },
        { type: { css: '#e', text: 'a', env: 'B' } },
        { type: { css: '#e', env: 'lower-case' } },
        { wait: 'soon' },
        { goto: 'no-slash' },
        { scroll: '#x' },
      ],
      setup: [{ caption: 'nobody sees this' }],
      mocks: [{ url: '**/a' }, { json: {} }],
    }
    const e = (() => { try { validateStoryboard(bad) } catch (err) { return err.message } })()
    for (const want of [/out: an \.mp4/, /page:/, /step 1: a goto/, /step 2: needs exactly one/, /step 3: type needs text or env/, /step 4: env is a variable/,
      /step 5: wait is ms/, /step 6: goto is a path/, /step 7: needs exactly one/, /setup 1: not recorded/, /mock 1: needs json or file/, /mock 2: needs url/]) {
      assert.match(e, want)
    }
    assert.throws(() => validateStoryboard(story({ steps: [] })), /at least one step/)
    assert.throws(() => validateStoryboard(story({ viewport: { width: 1441 } })), /viewport/)
    assert.throws(() => validateStoryboard(story({ colorScheme: 'sepia' })), /colorScheme/)
  })

  it('accepts the whole step vocabulary', () => {
    const steps = [
      { goto: '/app' }, { click: 'Not now', optional: true }, { caption: 'Select rows.', hold: 2000 }, { scrollTo: '#x' },
      { click: { css: '[aria-label=Menu]' } }, { hover: 'Export' }, { type: { css: 'input', text: 'March' } }, { press: 'Escape' },
      { caption: null }, { wait: 500 }, { wait: { url: '**/app/**' } }, { wait: { css: '#done' } },
    ]
    assert.equal(validateStoryboard(story({ steps })).steps.length, steps.length)
  })

  it('fills holds, reads env values and never prints them', () => {
    const steps = resolveSteps([
      { goto: '/login' },
      { type: { css: '#password', env: 'DEMO_PASSWORD' } },
      { caption: 'Hello.' },
      { caption: null },
      { click: 'Save', hold: 50 },
    ], { DEMO_PASSWORD: 'test-account-value' })
    assert.deepEqual(steps.map((s) => s.hold), [0, 900, 2600, 300, 50])
    assert.equal(steps[1].text, 'test-account-value')
    assert.ok(!steps.some((s) => s.label.includes('test-account-value')))
    assert.match(steps[1].label, /\$DEMO_PASSWORD/)
    assert.throws(() => resolveSteps([{ type: { css: '#e', env: 'MISSING' } }], {}), /MISSING is not set/)
  })

  it('resolves mock files against the storyboard folder', () => {
    const [json, file] = resolveMocks([{ url: 'a', json: {} }, { url: 'b', file: 'assets/plan.png' }], '/repo/explainers')
    assert.deepEqual(json, { url: 'a', json: {} })
    assert.equal(file.file, path.resolve('/repo/explainers/assets/plan.png'))
  })

  it('finds a click target by its whole accessible name, any case, or by css', () => {
    const q = targetQuery('Save (2)')
    assert.deepEqual(q.roles, ['button', 'menuitem', 'link', 'tab'])
    assert.ok(q.name.test('save (2)'))
    assert.ok(!q.name.test('Save (2) draft'))
    assert.deepEqual(targetQuery({ css: '#x' }), { css: '#x' })
  })

  it('times each frame until the next, the last until the end, none longer than the cap', () => {
    const shots = [{ file: '/f/a.jpg', t: 10 }, { file: '/f/b.jpg', t: 10.5 }, { file: "/f/it's.jpg", t: 20 }]
    const { text, clipped } = concatList(shots, 21)
    assert.equal(clipped, 1)
    assert.deepEqual(text.split('\n'), [
      'ffconcat version 1.0',
      "file '/f/a.jpg'", 'duration 0.5000',
      "file '/f/b.jpg'", `duration ${MAX_STILL_S.toFixed(4)}`,
      "file '/f/it'\\''s.jpg'", 'duration 1.0000',
      "file '/f/it'\\''s.jpg'",
    ])
    assert.match(concatList([{ file: 'a', t: 5 }], 0).text, /duration 0\.5000/)
    assert.throws(() => concatList([], 1), /no frames/)
  })

  it('encodes silent, faststart, BT.709 at the viewport width', () => {
    const args = encodeArgs('list', 'out.mp4', 1440)
    assert.ok(args.includes('-an') && args.includes('+faststart'))
    assert.match(args[args.indexOf('-vf') + 1], /^fps=30,scale=1440:-2:.*out_color_matrix=bt709/)
    assert.equal(args.at(-1), 'out.mp4')
  })

  it('assembles a frame list into a 30 fps H.264 file', { skip: !haveFfmpeg && 'no ffmpeg' }, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'record-test-'))
    try {
      const shots = ['red', 'blue'].map((c, i) => {
        const file = path.join(dir, `${c}.jpg`)
        spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=${c}:s=320x200`, '-frames:v', '1', file])
        return { file, t: i }
      })
      const list = path.join(dir, 'list.ffconcat')
      writeFileSync(list, concatList(shots, 2).text)
      const out = path.join(dir, 'out.mp4')
      const r = spawnSync('ffmpeg', encodeArgs(list, out, 320), { encoding: 'utf8' })
      assert.equal(r.status, 0, r.stderr)
      const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=codec_name,r_frame_rate,width', '-of', 'csv=p=0', out], { encoding: 'utf8' })
      assert.equal(probe.stdout.trim(), 'h264,320,30/1')
      const audio = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', out], { encoding: 'utf8' })
      assert.equal(audio.stdout.trim(), '')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
