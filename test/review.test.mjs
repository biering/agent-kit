// The design review gate (src/lib/review.mjs, src/review.mjs): which tasks wait, what the pane shows,
// and what approve and send back do on the board. The board is a fake (fixtures/fake-board.mjs.txt, copied to a .mjs) that
// logs its calls; herdr is a fake on PATH. Nothing here touches a real board or herdr.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { keys, onKey, paint } from '../src/lib/review-pane.mjs'
import {
  age,
  approve,
  artifactLinks,
  boardBin,
  boardClient,
  ceoWorkspace,
  collect,
  dataDir,
  fromAnnotation,
  isDesign,
  render,
  sendBack,
  stuck,
  toNotify,
  urlLines,
  wrap,
} from '../src/lib/review.mjs'

const KIT = fileURLToPath(new URL('../bin/agent-kit.mjs', import.meta.url))
const FAKE = fileURLToPath(new URL('./fixtures/fake-board.mjs.txt', import.meta.url))
const A = 'https://claude.ai/artifact/HKpUksSNb363h5bRM9hZty'
const B = 'https://claude.ai/artifact/CbDQzT5oU3BmDDKHRs1cmn'
const C = 'https://claude.ai/code/artifact/0b7c4a52-5e1d-4a3f-9d4e-6f0e2b1a9c11'
const NOW = 1_800_000_000_000

// A board in memory: the same calls as boardClient, logged.
function memBoard({ list = [], details = {}, onApprove = 'build', tellFails = false } = {}) {
  const calls = []
  const ok = { ok: true, error: '' }
  return {
    calls,
    list: () => list,
    details: (id) => structuredClone(details[id]),
    approve: (id) => {
      calls.push(['approve', id])
      const d = details[id]
      d.plan.approvedAt = NOW
      if (onApprove === 'build') Object.assign(d.plan, { built: NOW, locked: false }), (d.task.stage = 'working')
      if (onApprove === 'stuck') d.task.stage = 'working'
      if (onApprove === 'nothing') d.task.stage = 'starting'
      if (onApprove === 'fail') return { ok: false, error: 'refused' }
      return ok
    },
    tell: (id, text) => (calls.push(['tell', id, text]), tellFails ? { ok: false, error: 'no agent' } : ok),
    stop: (id) => (calls.push(['stop', id]), (details[id].task.stage = 'stopped'), (details[id].plan.locked = false), ok),
    delegate: (id, extra) => {
      calls.push(['delegate', id, ...extra])
      Object.assign(details[id].plan, { built: NOW, locked: false })
      details[id].task.stage = 'working'
      return ok
    },
  }
}

const fakeIo = (files = {}) => ({
  readFile: (p) => files[p] ?? null,
  mtime: (p) => (p in files ? NOW - 5 * 60 * 1000 : null),
})

const planTask = (id, key, { description = 'Design review: yes', text = `# Design\n\n- Variant A, grouped: ${A}`, plan = {} } = {}) => ({
  task: { id: key, title: `title of ${key}`, stage: 'plan', msg: 'Plan ready', description },
  plan: { by: 'you', locked: true, mode: true, at: NOW - 60 * 60 * 1000, text, link: `https://board.example.com/${id}/plan/plan.md`, ...plan },
  report: null,
})

describe('artifact links', () => {
  it('finds every link whole, once, in order, without the punctuation after it', () => {
    const text = `See (${A}). Also ${B}, and again ${A}.\nThe code form: ${C}`
    assert.deepEqual(artifactLinks(text).map((l) => l.url), [A, B, C])
  })

  it('takes the words before a link on its line as its label', () => {
    const links = artifactLinks(`- Variant A, grouped: ${A}\n- [Variant B, tabs](${B})\n${C}\n`)
    assert.equal(links[0].label, 'Variant A, grouped')
    assert.equal(links[1].label, 'Variant B, tabs')
    assert.equal(links[2].label, '')
  })

  it('keeps a long label short and starts it after a cut parenthesis', () => {
    const [l] = artifactLinks(`read it with the tool's read), the eight screens ${A}`)
    assert.equal(l.label, 'the eight screens')
    const [long] = artifactLinks(`${'word '.repeat(30)}${A}`)
    assert.ok(long.label.length <= 60 && long.label.endsWith('…'))
  })
})

describe('which tasks wait', () => {
  it('reads the marker line in a description', () => {
    assert.ok(isDesign('Make it findable.\nDesign review: yes'))
    assert.ok(isDesign('- design review: YES'))
    assert.ok(!isDesign('Design review: no'))
    assert.ok(!isDesign('The design review: yes was asked for elsewhere'))
  })

  it('takes a design-ready stop, a design plan and a stuck build; leaves the rest', () => {
    const data = '/data'
    const list = [
      { id: 'web/1', state: 'blocked', kind: 'permission', stage: 'working', title: 't1', msg: 'Design ready: two variants' },
      { id: 'web/2', state: 'blocked', kind: 'permission', stage: 'plan', title: 't2', msg: 'Plan ready' },
      { id: 'web/3', state: 'blocked', kind: 'permission', stage: 'plan', title: 't3', msg: 'Plan ready' },
      { id: 'web/4', state: 'working', stage: 'working', title: 't4', msg: '' },
      { id: 'web/5', state: 'blocked', kind: 'question', stage: 'working', title: 't5', msg: 'Design ready: no marker' },
      { id: 'web/6', state: 'done', stage: 'done', title: 't6', msg: 'Design ready: old' },
      { id: 'web/7', state: 'working', stage: 'working', title: 't7', msg: '' },
    ]
    const details = {
      'web/1': { task: { id: 'WEB-1', title: 'Settings', stage: 'working', description: 'Design review: yes' }, plan: null, report: null },
      'web/2': planTask('web/2', 'WEB-2'),
      'web/3': planTask('web/3', 'WEB-3', { description: 'Backend only', text: 'No links here.' }),
      'web/4': planTask('web/4', 'WEB-4', { plan: { approvedAt: NOW - 600000 } }),
      'web/5': { task: { id: 'WEB-5', title: 'x', stage: 'working', description: 'nothing' }, plan: null },
      'web/7': planTask('web/7', 'WEB-7', { plan: { approvedAt: NOW - 600000, built: NOW - 500000, locked: false } }),
    }
    details['web/4'].task.stage = 'working'
    details['web/7'].task.stage = 'working'
    const files = {
      '/data/tasks/web/1/closing-note.md': `# Design: settings\n\n- Variant A: ${A}\n- Variant B: ${B}\n`,
      '/data/tasks/web/4/task.json': JSON.stringify({ plan: { approvedAt: 1, locked: true } }),
      '/data/tasks/web/7/task.json': JSON.stringify({ plan: { approvedAt: 1, built: 2, locked: false } }),
    }
    const board = memBoard({ list, details })
    const items = collect({ board, data, ...fakeIo(files), now: NOW })
    assert.deepEqual(items.map((i) => [i.id, i.kind]), [['web/2', 'plan'], ['web/4', 'stuck'], ['web/1', 'design']])
    const design = items.find((i) => i.id === 'web/1')
    assert.deepEqual(design.links.map((l) => l.url), [A, B])
    assert.equal(design.key, 'WEB-1')
    assert.equal(design.repo, 'web')
    assert.match(design.brief, /Design: settings/)
  })

  it('finds the board and its data folder as the board does', () => {
    assert.equal(dataDir({}, '/h'), '/h/.herdr-projects/data')
    assert.equal(dataDir({ HERDR_PROJECTS_HOME: '/x' }, '/h'), '/x/data')
    assert.equal(dataDir({ HERDR_PROJECTS_DATA_DIR: '/d' }, '/h'), '/d')
    assert.equal(boardBin({ HERDR_PROJECTS_BIN: '/b' }, '/h', () => true), '/b')
    assert.equal(boardBin({}, '/h', () => true), '/h/.herdr-projects/data/bin/herdr-projects')
    assert.equal(boardBin({}, '/h', () => false), 'herdr-projects')
  })

  it('says how old a task is', () => {
    assert.equal(age(NOW - 4 * 60000, NOW), '4m')
    assert.equal(age(NOW - 125 * 60000, NOW), '2h 5m')
    assert.equal(age(NOW - 120 * 60000, NOW), '2h')
    assert.equal(age(NOW - 3 * 86400000, NOW), '3d')
  })

  it('announces a design once per brief, never a stuck one', () => {
    const items = [
      { id: 'a/1', kind: 'design', hash: 'h1' },
      { id: 'a/2', kind: 'plan', hash: 'h2' },
      { id: 'a/3', kind: 'stuck', hash: 'h3' },
    ]
    assert.deepEqual(toNotify(items, {}).map((i) => i.id), ['a/1', 'a/2'])
    assert.deepEqual(toNotify(items, { 'a/1': 'h1', 'a/2': 'old' }).map((i) => i.id), ['a/2'])
  })
})

describe('the screen', () => {
  const item = (over = {}) => ({
    id: 'web/1', key: 'WEB-1', repo: 'web', kind: 'design', title: 'A settings screen with a long enough title to wrap',
    at: NOW - 12 * 60000, msg: '', planLink: '', reportLink: '',
    brief: Array.from({ length: 40 }, (_, i) => `Line ${i} of the brief, with some words.`).join('\n'),
    links: [{ url: A, label: 'Variant A, grouped' }, { url: B, label: 'Variant B, tabs' }, { url: C, label: 'Code form' }],
    ...over,
  })

  for (const cols of [36, 48, 100]) {
    it(`shows every artifact link whole at ${cols} columns`, () => {
      const lines = render({ items: [item()], sel: 0, now: NOW }, cols, 60)
      assert.ok(lines.every((l) => l.t.length <= cols), 'no line wider than the pane')
      for (const url of [A, B, C]) {
        const parts = lines.filter((l) => l.url === url)
        assert.ok(parts.length >= 1, `${url} is shown`)
        assert.equal(parts.map((l) => l.t).join(''), url, 'its lines join to the whole URL, nothing added or cut')
        if (url.length <= cols) assert.equal(parts.length, 1, 'on one line when it fits')
        assert.ok(parts.every((l) => !l.t.startsWith(' ')), 'at column 0, no prefix')
      }
    })
  }

  it('never shows half a link at the bottom edge, and scrolls to it', () => {
    const it0 = item({ title: 'T' })
    for (let rows = 12; rows <= 30; rows++) {
      const lines = render({ items: [it0], sel: 0, now: NOW }, 48, rows)
      assert.equal(lines.length, rows)
      for (const url of [A, B, C]) {
        const parts = lines.filter((l) => l.url === url)
        if (parts.length) assert.equal(parts.map((l) => l.t).join(''), url, `rows ${rows}: ${url} whole or absent`)
      }
    }
    const later = render({ items: [it0], sel: 0, scroll: 10, now: NOW }, 48, 16)
    assert.ok(later.some((l) => l.url === C))
  })

  it('wraps words and breaks a URL hard, adding nothing', () => {
    assert.deepEqual(wrap('one two three', 7), ['one two', 'three'])
    assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij'])
    assert.deepEqual(urlLines(A, 20).join(''), A)
    assert.ok(urlLines(A, 20).every((l) => l.length <= 20))
  })

  it('paints a link line as a hyperlink to the whole URL', () => {
    const [first] = urlLines(A, 20)
    assert.ok(paint({ t: first, s: 'link', url: A }).includes(`\x1b]8;;${A}\x1b\\${first}`))
  })

  it('lists the kind, age and key, and asks before an approve', () => {
    const lines = render({ items: [item(), item({ id: 'web/2', key: 'WEB-2', kind: 'stuck' })], sel: 0, now: NOW, mode: 'confirm' }, 60, 40)
    const text = lines.map((l) => l.t).join('\n')
    assert.match(text, /Waiting for you · 2 to approve/)
    assert.match(text, /Designs to approve/)
    assert.match(text, /▸ WEB-1 +12m {2}design/)
    assert.match(text, /WEB-2 .* stuck/)
    assert.match(text, /Approve WEB-1 and start the build\? y \/ n/)
  })
})

describe('approve', () => {
  const sleep = async () => {}
  let t = 0
  const now = () => (t += 1000)

  it('a plan: approve, wait for the build, send nothing meanwhile', async () => {
    const board = memBoard({ details: { 'web/2': planTask('web/2', 'WEB-2') } })
    const r = await approve({ id: 'web/2', kind: 'plan' }, { board, sleep, now })
    assert.deepEqual(r, { ok: true, how: 'built' })
    assert.deepEqual(board.calls, [['approve', 'web/2']])
  })

  it('a plan whose build never starts (the plan-mode quirk): stop, then delegate, then building', async () => {
    const board = memBoard({ details: { 'web/2': planTask('web/2', 'WEB-2') }, onApprove: 'stuck' })
    const r = await approve({ id: 'web/2', kind: 'plan' }, { board, sleep, now })
    assert.deepEqual(r, { ok: true, how: 'repaired' })
    assert.deepEqual(board.calls, [['approve', 'web/2'], ['stop', 'web/2'], ['delegate', 'web/2', '--now', '--plan.approve', 'none']])
  })

  it('notes of an approve go only once the build runs', async () => {
    const board = memBoard({ details: { 'web/2': planTask('web/2', 'WEB-2') }, onApprove: 'stuck' })
    await approve({ id: 'web/2', kind: 'plan' }, { board, sleep, now, notes: 'Keep the header.' })
    assert.deepEqual(board.calls.map((c) => c[0]), ['approve', 'stop', 'delegate', 'tell'])
    assert.match(board.calls[3][2], /Keep the header\./)
  })

  it('a build that does not start in time is reported, not claimed', async () => {
    const board = memBoard({ details: { 'web/2': planTask('web/2', 'WEB-2') }, onApprove: 'nothing' })
    let clock = 0
    const r = await approve({ id: 'web/2', kind: 'plan' }, { board, sleep, now: () => (clock += 60000), timeoutMs: 180000 })
    assert.equal(r.ok, false)
    assert.match(r.error, /did not start in time/)
    assert.deepEqual(board.calls, [['approve', 'web/2']])
  })

  it('a refused approve stops there', async () => {
    const board = memBoard({ details: { 'web/2': planTask('web/2', 'WEB-2') }, onApprove: 'fail' })
    assert.deepEqual(await approve({ id: 'web/2', kind: 'plan' }, { board, sleep, now }), { ok: false, error: 'refused' })
  })

  it('a stuck task: the repair straight away', async () => {
    const d = planTask('web/4', 'WEB-4', { plan: { approvedAt: NOW } })
    d.task.stage = 'working'
    assert.ok(stuck(d))
    const board = memBoard({ details: { 'web/4': d } })
    assert.deepEqual(await approve({ id: 'web/4', kind: 'stuck' }, { board, sleep, now }), { ok: true, how: 'repaired' })
    assert.deepEqual(board.calls.map((c) => c[0]), ['stop', 'delegate'])
  })

  it('a design-ready stop: one tell that says build it', async () => {
    const board = memBoard()
    const r = await approve({ id: 'web/1', kind: 'design' }, { board, sleep, now, notes: 'Use variant B.' })
    assert.deepEqual(r, { ok: true, how: 'told' })
    assert.equal(board.calls.length, 1)
    assert.match(board.calls[0][2], /^Design approved\. Build it now/)
    assert.match(board.calls[0][2], /Use variant B\./)
  })

  it('send back: a tell, the design words for a design stop, the plain words for a plan', () => {
    const board = memBoard()
    assert.deepEqual(sendBack(board, { id: 'web/1', kind: 'design' }, ' Bigger toggles '), { ok: true, how: 'sent back' })
    assert.match(board.calls[0][2], /^Design sent back\.[\s\S]*Bigger toggles[\s\S]*"Design ready"/)
    sendBack(board, { id: 'web/2', kind: 'plan' }, 'Bigger toggles')
    assert.equal(board.calls[1][2], 'Bigger toggles')
    assert.equal(sendBack(board, { id: 'web/2', kind: 'plan' }, '  ').ok, false)
  })

  it('reads what Plannotator decided', () => {
    assert.deepEqual(fromAnnotation({ decision: 'approved' }), { action: 'approve', notes: '' })
    assert.deepEqual(fromAnnotation({ decision: 'approved', feedback: '# Approved with Notes\nok' }), { action: 'approve', notes: '# Approved with Notes\nok' })
    assert.deepEqual(fromAnnotation({ decision: 'annotated', feedback: '## 1. Make it bigger' }), { action: 'back', text: '## 1. Make it bigger' })
    assert.deepEqual(fromAnnotation({ decision: 'dismissed' }), { action: 'none' })
    assert.deepEqual(fromAnnotation(null), { action: 'none' })
  })

  it('picks the CEO workspace of the task repo for the review tab', () => {
    const ws = [
      { workspace_id: 'w1', label: 'maelstrom', worktree: { repo_name: 'maelstrom' } },
      { workspace_id: 'w2', label: 'ceo', worktree: { repo_name: 'leverage' } },
      { workspace_id: 'w3', label: 'ceo', worktree: { repo_name: 'maelstrom' } },
    ]
    assert.equal(ceoWorkspace(ws, 'maelstrom'), 'w3')
    assert.equal(ceoWorkspace(ws, 'other'), 'w2')
    assert.equal(ceoWorkspace([], 'x', { fallback: 'here' }), 'here')
    assert.equal(ceoWorkspace(ws, 'maelstrom', { env: { AGENT_KIT_REVIEW_WORKSPACE: 'maelstrom' } }), 'w1')
  })
})

describe('the pane keys', () => {
  const pane = () => {
    const done = []
    const act = {
      review: (it) => (done.push(['review', it.id]), { ok: true }),
      approve: (it) => done.push(['approve', it.id]),
      back: (it, text) => (done.push(['back', it.id, text]), { ok: true }),
      open: (url) => done.push(['open', url]),
      copy: (url) => done.push(['copy', url]),
      skip: (it) => done.push(['skip', it.id]),
      board: () => done.push(['board']),
      refresh: () => done.push(['refresh']),
      quit: () => done.push(['quit']),
    }
    const s = {
      sel: 0, scroll: 0, mode: 'list', input: '',
      items: [
        { id: 'a/1', key: 'A-1', kind: 'design', links: [{ url: A }, { url: B }] },
        { id: 'a/2', key: 'A-2', kind: 'stuck', links: [] },
      ],
    }
    const press = (...ks) => ks.forEach((k) => onKey(s, k, act))
    return { s, done, press }
  }

  it('splits terminal input into keys', () => {
    assert.deepEqual(keys('j\x1b[Bk\r\x1b[5~\x7f\x03'), ['j', 'down', 'k', 'enter', 'pgup', 'backspace', 'ctrl-c'])
  })

  it('approves only after y', () => {
    const p = pane()
    p.press('a', 'n')
    assert.deepEqual(p.done, [])
    p.press('a', 'y')
    assert.deepEqual(p.done, [['approve', 'a/1']])
  })

  it('sends back the typed line, nothing on Esc', () => {
    const p = pane()
    p.press('b', 'x', 'esc')
    p.press('b', ...'Bigger', 'backspace', 'enter')
    assert.deepEqual(p.done, [['back', 'a/1', 'Bigge']])
  })

  it('opens and copies links whole, opens the review tab, skips', () => {
    const p = pane()
    p.press('2', 'y', '1', 'o', 'enter', 's')
    assert.deepEqual(p.done, [['open', B], ['copy', A], ['open', A], ['open', B], ['review', 'a/1'], ['skip', 'a/1']])
  })

  it('a stuck task: f repairs, a and b do not apply', () => {
    const p = pane()
    p.press('j', 'a', 'b', 'f')
    assert.deepEqual(p.done, [['approve', 'a/2']])
    assert.equal(p.s.mode, 'list')
  })
})

describe('agent-kit review (the CLI against a fake board)', () => {
  function setup(t, board) {
    const dir = mkdtempSync(join(tmpdir(), 'review-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    mkdirSync(join(dir, 'bin'))
    copyFileSync(FAKE, join(dir, 'board.mjs'))
    chmodSync(join(dir, 'board.mjs'), 0o755)
    writeFileSync(join(dir, 'board.json'), JSON.stringify(board))
    writeFileSync(join(dir, 'bin', 'herdr'), `#!/usr/bin/env bash\necho "$*" >> "${dir}/herdr.log"\n[ "$1" = status ] && { echo "status: running"; exit 0; }\necho '{"result":{}}'\n`)
    chmodSync(join(dir, 'bin', 'herdr'), 0o755)
    const data = join(dir, 'data')
    mkdirSync(join(data, 'tasks', 'web', '1'), { recursive: true })
    writeFileSync(join(data, 'tasks', 'web', '1', 'closing-note.md'), `# Design\n\n- Variant A: ${A}\n`)
    const run = (...a) => {
      const r = spawnSync(process.execPath, [KIT, 'review', ...a], {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          HERDR_PROJECTS_BIN: join(dir, 'board.mjs'),
          HERDR_PROJECTS_DATA_DIR: data,
          XDG_STATE_HOME: join(dir, 'state'),
          FAKE_BOARD_DIR: dir,
          AGENT_KIT_REVIEW_POLL_MS: '5',
        },
      })
      return { ...r, calls: existsSync(join(dir, 'calls.log')) ? readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [] }
    }
    return { dir, run, herdrLog: () => (existsSync(join(dir, 'herdr.log')) ? readFileSync(join(dir, 'herdr.log'), 'utf8') : '') }
  }
  const board = () => ({
    onApprove: 'stuck',
    list: [
      { id: 'web/1', state: 'blocked', kind: 'permission', stage: 'working', title: 'Settings', msg: 'Design ready: two variants' },
      { id: 'web/2', state: 'blocked', kind: 'permission', stage: 'plan', title: 'Onboarding', msg: 'Plan ready' },
    ],
    details: {
      'web/1': { task: { id: 'WEB-1', title: 'Settings', stage: 'working', description: 'Design review: yes' }, plan: null, report: null },
      'web/2': planTask('web/2', 'WEB-2'),
    },
  })

  it('lists what waits, with whole links', (t) => {
    const { run } = setup(t, board())
    const r = run('list', '--json')
    assert.equal(r.status, 0, r.stderr)
    const { designs: items, prs } = JSON.parse(r.stdout)
    assert.deepEqual(items.map((i) => i.key).sort(), ['WEB-1', 'WEB-2'])
    assert.deepEqual(prs, [], 'no repo on the board, no PR')
    assert.equal(items.find((i) => i.key === 'WEB-1').links[0].url, A)
    assert.match(run('list').stdout, new RegExp(`Variant A: ${A}`))
  })

  it('approve repairs a build that never starts, by the board key', (t) => {
    const { run } = setup(t, board())
    const r = run('approve', 'WEB-2')
    assert.equal(r.status, 0, r.stderr)
    const acts = r.calls.filter((c) => !['list', 'details'].includes(c[0]))
    assert.deepEqual(acts, [['approve', 'web/2'], ['stop', 'web/2'], ['delegate', 'web/2', '--now', '--plan.approve', 'none']])
  })

  it('back sends the words; an unknown task is refused', (t) => {
    const { run } = setup(t, board())
    const r = run('back', 'web/1', 'Bigger', 'toggles')
    assert.equal(r.status, 0, r.stderr)
    const tell = r.calls.find((c) => c[0] === 'tell')
    assert.match(tell[2], /Bigger toggles/)
    const no = run('approve', 'web/9')
    assert.equal(no.status, 1)
    assert.match(no.stderr, /does not wait for a design decision/)
  })

  it('an unreachable board is said, not shown as nothing waiting', (t) => {
    const { run, dir } = setup(t, board())
    writeFileSync(join(dir, 'board.json'), '{')
    const r = run('list')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /the work board did not answer/)
    assert.doesNotMatch(r.stdout, /Nothing waits/)
  })

  it('notify: once per new brief, at most every 20 seconds', (t) => {
    const { run, herdrLog, dir } = setup(t, board())
    run('notify')
    const shown = herdrLog().split('\n').filter((l) => l.startsWith('notification show'))
    assert.equal(shown.length, 2)
    assert.match(shown.join('\n'), /WEB-1 Settings/)
    rmSync(join(dir, 'state', 'agent-kit', 'review', 'notify-stamp'))
    run('notify')
    assert.equal(herdrLog().split('\n').filter((l) => l.startsWith('notification show')).length, 2, 'nothing new, nothing shown')
  })
})

describe('the plugin and its wiring', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

  it('one id everywhere: the manifest, the CLI, the key, the install, the sync', () => {
    const manifest = read('herdr-review/herdr-plugin.toml')
    assert.match(manifest, /^id = "agent-kit\.review"$/m)
    for (const entry of ['pane', 'doc']) assert.match(manifest, new RegExp(`\\[\\[panes\\]\\]\\nid = "${entry}"`))
    assert.match(manifest, /on = "pane\.agent_status_changed"\ncommand = \["node", "\.\.\/bin\/agent-kit\.mjs", "review", "notify"\]/)
    assert.match(read('src/review.mjs'), /const PLUGIN = 'agent-kit\.review'/)
    assert.match(read('terminal/herdr/config.toml'), /key = "prefix\+y"\ntype = "plugin_action"\ncommand = "agent-kit\.review\.open"/)
    // `hr` is install.sh's herdr wrapper (herdr with HERDR_SOCKET_PATH unset).
    assert.match(read('terminal/install.sh'), /\b(herdr|hr) plugin link "\$review"/)
    assert.match(read('src/sync.mjs'), /'herdr-review'/)
    assert.match(read('bin/agent-kit.mjs'), /review: '\.\.\/src\/review\.mjs'/)
  })

  it('the rule, the skills and the README name the same marker and report', () => {
    for (const f of ['rules/design-review.md', 'skills/dev-loop/SKILL.md', 'skills/design/SKILL.md', 'README.md']) {
      assert.match(read(f), /Design review: yes/, f)
      assert.match(read(f), /Design ready/, f)
    }
    assert.match(read('README.md'), /\[`rules\/design-review\.md`\]\(rules\/design-review\.md\)/)
    assert.match(read('rules/design-review.md'), /--msg "Design ready: <one line>"/)
  })
})

describe('after the review (KIT-11 round 2)', () => {
  const locked = (stage, plan = {}) => ({ task: { id: 'W-1', stage }, plan: { approvedAt: NOW, locked: true, ...plan } })

  it('only the stages a lost build sits in count as stuck; a healthy start never does', () => {
    for (const stage of ['working', 'asks', 'nosummary']) assert.ok(stuck(locked(stage)), stage)
    for (const stage of ['starting', 'queued', 'setup', 'plan', 'reviewing', 'stopped', 'failed', 'something-new']) assert.ok(!stuck(locked(stage)), stage)
    assert.ok(!stuck(locked('working', { locked: false })), 'unlocked: the build has begun')
    assert.ok(!stuck(locked('working', { built: NOW })), 'built')
    assert.ok(!stuck(locked('working', { approvedAt: null })), 'not approved')
  })

  it('a slow, healthy start (queued, then starting, then built) is waited for, never repaired', async () => {
    const d = planTask('web/2', 'WEB-2')
    const steps = [
      { stage: 'queued', plan: { approvedAt: NOW, locked: true } },
      { stage: 'starting', plan: { approvedAt: NOW, locked: true } },
      { stage: 'working', plan: { approvedAt: NOW, locked: false } },
      { stage: 'working', plan: { approvedAt: NOW, locked: false, built: NOW } },
    ]
    const calls = []
    let n = 0
    const board = {
      approve: (id) => (calls.push(['approve', id]), { ok: true }),
      details: () => ({ ...d, task: { ...d.task, stage: steps[Math.min(n, 3)].stage }, plan: { ...d.plan, ...steps[Math.min(n++, 3)].plan } }),
      stop: (id) => (calls.push(['stop', id]), { ok: true }),
      delegate: (id) => (calls.push(['delegate', id]), { ok: true }),
      tell: (id) => (calls.push(['tell', id]), { ok: true }),
    }
    let t = 0
    const r = await approve({ id: 'web/2', kind: 'plan' }, { board, sleep: async () => {}, now: () => (t += 1000) })
    assert.deepEqual(r, { ok: true, how: 'built' })
    assert.deepEqual(calls, [['approve', 'web/2']])
  })

  it('a plan step with no written plan, or one already approved, is not offered', () => {
    const list = ['1', '2', '3', '4'].map((n) => ({ id: `web/${n}`, state: 'blocked', stage: 'plan', title: n, msg: '' }))
    const details = {
      'web/1': planTask('web/1', 'WEB-1', { text: '', plan: { at: null } }),
      'web/2': planTask('web/2', 'WEB-2', { text: '   ' }),
      'web/3': planTask('web/3', 'WEB-3', { plan: { approvedAt: NOW } }),
      'web/4': planTask('web/4', 'WEB-4'),
    }
    const items = collect({ board: memBoard({ list, details }), data: '/data', ...fakeIo(), now: NOW })
    assert.deepEqual(items.map((i) => i.id), ['web/4'])
  })

  it('a new Design ready with the same note is a new round: newer age, new hash', () => {
    const row = (msg) => [{ id: 'web/1', state: 'blocked', stage: 'working', title: 'S', msg }]
    const details = { 'web/1': { task: { id: 'WEB-1', title: 'S', stage: 'working', description: 'Design review: yes' }, plan: null } }
    const files = { '/data/tasks/web/1/closing-note.md': `old brief ${A}`, '/data/tasks/web/1/task.json': JSON.stringify({ at: NOW - 1000 }) }
    const first = collect({ board: memBoard({ list: row('Design ready: round 1'), details }), data: '/data', ...fakeIo(files), now: NOW })[0]
    const second = collect({ board: memBoard({ list: row('Design ready: round 2'), details }), data: '/data', ...fakeIo(files), now: NOW })[0]
    assert.equal(first.at, NOW - 1000, 'the report time, newer than the note')
    assert.notEqual(first.hash, second.hash)
    assert.deepEqual(toNotify([second], { 'web/1': first.hash }).map((i) => i.id), ['web/1'])
  })

  it('links inside the brief are whole too, on lines of their own', () => {
    const brief = `Two variants. The first (${A}) keeps one scroll; the second, ${B}, uses tabs.\nPick one.`
    const lines = render({ items: [{ id: 'w/1', key: 'W-1', repo: 'w', kind: 'design', title: 'T', at: NOW, msg: '', planLink: '', reportLink: '', brief, links: [] }], sel: 0, now: NOW }, 40, 60)
    const runs = []
    lines.forEach((l, i) => {
      if (!l.url) return
      if (lines[i - 1]?.url === l.url) runs[runs.length - 1].push(l.t)
      else runs.push([l.t])
    })
    assert.deepEqual(runs.map((r) => r.join('')), [A, B])
    const text = lines.map((l) => l.t).join('\n')
    assert.match(text, /Two variants\. The first/)
    assert.match(text, /keeps one scroll; the second,/)
    assert.match(text, /uses tabs\./)
    assert.ok(!lines.some((l) => !l.url && /claude\.ai\/artifact/.test(l.t)), 'no broken copy of a link in the text')
  })

  it('a link inside a parenthesis gets the words before the bracket as its label', () => {
    assert.equal(artifactLinks(`- Variant B, tabs (see ${B}).`)[0].label, 'Variant B, tabs')
    assert.equal(artifactLinks(`- Variant A (${A})`)[0].label, 'Variant A')
  })
})
