// The review list (rules/spec-review.md, rules/result-review.md, README "Review list"): how the pane reads
// a spec stop and a result stop from the board, what each row and detail shows, and what approve and send
// back say to the agent. The board is in memory or the fake CLI (fixtures/fake-board.mjs.txt); nothing here
// touches a real board, herdr or GitHub.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { keys, onKey } from '../src/lib/review-pane.mjs'
import {
  allLinks,
  approve,
  briefDoc,
  changeOf,
  collect,
  kindOf,
  linkType,
  merge,
  oneLine,
  paneSpot,
  productOf,
  render,
  sendBack,
  toNotify,
} from '../src/lib/review.mjs'

const KIT = fileURLToPath(new URL('../bin/agent-kit.mjs', import.meta.url))
const FAKE = fileURLToPath(new URL('./fixtures/fake-board.mjs.txt', import.meta.url))
const NOW = 1_800_000_000_000
const MIN = 60 * 1000
const ART = 'https://claude.ai/artifact/HKpUksSNb363h5bRM9hZty'
const PR = 'https://github.com/acme/app/pull/88'
const VIDEO = 'https://media.example.com/tinybreath/bowl/flow-desktop.mp4'
const DESK = 'https://media.example.com/tinybreath/bowl/desktop.png'
const PHONE = 'https://media.example.com/tinybreath/bowl/phone.png'

const SPEC_BRIEF = `# Spec: a singing bowl at the end of a session

Product: tinybreath
Change: openspec/changes/singing-bowl

## Why
People stop the timer by hand.

- Design A, one bowl: ${ART}
`

const PITCH = `# Result: the singing bowl ships

Product: tinybreath

- Video, the changed flow: ${VIDEO}
- Screenshot, desktop: ${DESK}
- Screenshot, phone: ${PHONE}
- Pull request: ${PR}.
`

function memBoard({ list = [], details = {} } = {}) {
  const calls = []
  return {
    calls,
    list: () => list,
    details: (id) => structuredClone(details[id]),
    tell: (id, text) => (calls.push(['tell', id, text]), { ok: true }),
    approve: (id) => (calls.push(['approve', id]), { ok: true }),
    stop: (id) => (calls.push(['stop', id]), { ok: true }),
    delegate: (id, extra) => (calls.push(['delegate', id, ...extra]), { ok: true }),
  }
}
const io = (files = {}, times = {}) => ({ readFile: (p) => files[p] ?? null, mtime: (p) => (p in files ? times[p] ?? NOW : null) })

describe('reading a stop', () => {
  it('knows a spec, a result and a design stop by the report message', () => {
    assert.equal(kindOf('Spec ready for review: a singing bowl'), 'spec')
    assert.equal(kindOf('Result ready for review: the bowl ships'), 'result')
    assert.equal(kindOf('Design ready: two variants'), 'design')
    assert.equal(kindOf('  spec READY'), 'spec')
    for (const m of ['', 'Need a GitHub login', 'The spec is ready', 'Results ready']) assert.equal(kindOf(m), null, m)
  })

  it('takes the one line after the opening, else the title', () => {
    assert.equal(oneLine('Spec ready for review: a singing bowl', 'T'), 'a singing bowl')
    assert.equal(oneLine('Result ready: the bowl ships', 'T'), 'the bowl ships')
    assert.equal(oneLine('Design ready for you - two variants', 'T'), 'two variants')
    assert.equal(oneLine('Spec ready for review', 'The title'), 'The title')
  })

  it('reads the product from a line of its own, else the repo', () => {
    assert.equal(productOf(['x\nProduct: tinybreath\n'], 'maelstrom'), 'tinybreath')
    assert.equal(productOf(['- **Product:** tinybreath'], 'maelstrom'), 'tinybreath')
    assert.equal(productOf(['no line', 'Product: wavedance'], 'maelstrom'), 'wavedance', 'the description, when the brief has none')
    assert.equal(productOf(['the product: is great, inline'], 'maelstrom'), 'maelstrom', 'only a line of its own')
    assert.equal(productOf([], 'agent-kit'), 'agent-kit')
  })

  it('finds the OpenSpec change, never the archive folder', () => {
    assert.equal(changeOf('Change: openspec/changes/singing-bowl/proposal.md'), 'singing-bowl')
    assert.equal(changeOf('see openspec/changes/archive/2026-01-01-old and openspec/changes/new-one.'), 'new-one')
    assert.equal(changeOf('nothing'), '')
  })
})

describe('links', () => {
  it('types every link: artifact, PR, video, screenshot, other', () => {
    assert.equal(linkType(ART), 'artifact')
    assert.equal(linkType('https://claude.ai/code/artifact/0b7c4a52-5e1d-4a3f-9d4e-6f0e2b1a9c11'), 'artifact')
    assert.equal(linkType(PR), 'pr')
    assert.equal(linkType(`${PR}/files`), 'pr')
    assert.equal(linkType(VIDEO), 'video')
    assert.equal(linkType('https://x.example/a.webm?v=2'), 'video')
    assert.equal(linkType(DESK), 'image')
    assert.equal(linkType('https://x.example/a.JPG'), 'image')
    assert.equal(linkType('https://github.com/acme/app/issues/3'), 'link')
  })

  it('reads each link whole, once, without the sentence’s punctuation, with its label', () => {
    const links = allLinks(PITCH)
    assert.deepEqual(links.map((l) => [l.type, l.url]), [['video', VIDEO], ['image', DESK], ['image', PHONE], ['pr', PR]])
    assert.deepEqual(links.map((l) => l.label), ['Video, the changed flow', 'Screenshot, desktop', 'Screenshot, phone', 'Pull request'])
    assert.deepEqual(allLinks(`a (${VIDEO}), and **${PR}**; again ${VIDEO}`).map((l) => l.url), [VIDEO, PR])
  })
})

describe('which tasks wait (spec and result)', () => {
  const data = '/data'
  const list = [
    { id: 'mb/1', state: 'blocked', kind: 'permission', stage: 'working', title: 'feat(tinybreath): singing bowl', msg: 'Spec ready for review: a singing bowl ends a session' },
    { id: 'mb/2', state: 'blocked', kind: 'permission', stage: 'working', title: 'feat(tinybreath): bowl build', msg: 'Result ready for review: the bowl ships' },
    { id: 'mb/3', state: 'blocked', kind: 'permission', stage: 'working', title: 'no marker', msg: 'Design ready: needs the marker' },
    { id: 'mb/4', state: 'working', stage: 'working', title: 'still working', msg: 'Spec ready for review: an old message' },
    { id: 'mb/5', state: 'blocked', kind: 'question', stage: 'working', title: 'a question', msg: 'Should the old settings file be removed' },
  ]
  const details = {
    'mb/1': { task: { id: 'MB-1', title: 'feat(tinybreath): singing bowl', stage: 'working', description: 'Spec review: yes' }, worktree: '/wt/mb-1' },
    'mb/2': { task: { id: 'MB-2', title: 'feat(tinybreath): bowl build', stage: 'working', description: '' }, pr: { url: PR }, worktree: '/wt/mb-2' },
    'mb/3': { task: { id: 'MB-3', title: 'no marker', stage: 'working', description: 'nothing' } },
  }
  const files = {
    '/data/tasks/mb/1/closing-note.md': SPEC_BRIEF,
    '/data/tasks/mb/2/closing-note.md': PITCH.replace(`- Pull request: ${PR}.\n`, ''),
  }
  const times = { '/data/tasks/mb/1/closing-note.md': NOW - 90 * MIN, '/data/tasks/mb/2/closing-note.md': NOW - 5 * MIN }
  const items = collect({ board: memBoard({ list, details }), data, ...io(files, times), now: NOW })

  it('takes a spec stop and a result stop without a marker; a design stop still needs one', () => {
    assert.deepEqual(items.map((i) => [i.id, i.kind]), [['mb/2', 'result'], ['mb/1', 'spec']], 'newest first')
  })

  it('gives each row its product, one line and age', () => {
    const [result, spec] = items
    assert.equal(spec.product, 'tinybreath')
    assert.equal(spec.line, 'a singing bowl ends a session')
    assert.equal(spec.at, NOW - 90 * MIN)
    assert.equal(result.line, 'the bowl ships')
  })

  it('a spec names its OpenSpec change in its worktree and its brief file; a result gets its PR from the board', () => {
    const [result, spec] = items
    assert.equal(spec.change, '/wt/mb-1/openspec/changes/singing-bowl')
    assert.equal(spec.briefFile, '/data/tasks/mb/1/closing-note.md')
    assert.deepEqual(spec.links.map((l) => l.type), ['artifact'])
    assert.deepEqual(result.links.map((l) => l.type), ['video', 'image', 'image', 'pr'])
    assert.equal(result.links.at(-1).url, PR)
    assert.equal(result.prUrl, PR)
  })

  it('announces a spec and a result once each', () => {
    assert.equal(toNotify(items, {}).length, 2)
    assert.equal(toNotify(items, Object.fromEntries(items.map((i) => [i.id, i.hash]))).length, 0)
  })
})

describe('the list: every kind, newest first', () => {
  const task = (over) => ({ id: 'mb/1', key: 'MB-1', repo: 'maelstrom', product: 'tinybreath', kind: 'spec', title: 'feat: bowl', line: 'a singing bowl', at: NOW - 2 * 60 * MIN, msg: '', brief: SPEC_BRIEF, links: allLinks(SPEC_BRIEF), planLink: '', reportLink: '', ...over })
  const prRow = { kind: 'pr', id: `pr:acme/app#88`, key: 'app#88', repo: 'app', title: 'feat(app): refund button', url: PR, links: [{ url: PR, label: 'Pull request' }], why: ['review required'], ci: 'passing', ciFailing: [], sentences: '', at: NOW - 3 * 60 * MIN, brief: '' }

  it('merges tasks and PRs newest first; a PR that is a result’s PR says so on both rows', () => {
    const result = task({ id: 'mb/2', key: 'MB-2', kind: 'result', line: 'the bowl ships', at: NOW - 5 * MIN, prUrl: PR })
    const design = task({ id: 'mb/3', key: 'MB-3', kind: 'design', line: 'two variants', at: NOW - 30 * MIN })
    const all = merge([task(), design, result], [prRow])
    assert.deepEqual(all.map((i) => i.key), ['MB-2', 'MB-3', 'MB-1', 'app#88'])
    assert.equal(all[0].github, 'app#88')
    assert.equal(all[3].result, 'MB-2')
    assert.equal(all[3].product, 'app', 'a PR row is its repo')
    assert.equal(all[3].line, 'feat(app): refund button')
  })

  it('each row: kind, product, age, one line', () => {
    const all = merge([task(), task({ id: 'mb/2', key: 'MB-2', kind: 'result', line: 'the bowl ships', at: NOW - 5 * MIN })], [prRow])
    const t = render({ items: all, sel: 0, now: NOW }, 80, 40).map((l) => l.t).join('\n')
    assert.match(t, /Review list · 3 waiting \(1 on GitHub\)/)
    assert.match(t, /▸ result tinybreath +5m  the bowl ships/)
    assert.match(t, /  spec   tinybreath +2h  a singing bowl/)
    assert.match(t, /  GitHub app +3h  feat\(app\): refund button/)
  })

  it('a result: the approve key ships, and the question says what ship means', () => {
    const r = task({ kind: 'result', line: 'the bowl ships', brief: PITCH, links: allLinks(PITCH) })
    const list = render({ items: [r], sel: 0, now: NOW }, 100, 40).map((l) => l.t).join('\n')
    assert.match(list, /a approve \+ ship/)
    const ask = render({ items: [r], sel: 0, now: NOW, mode: 'confirm' }, 100, 40).map((l) => l.t).join('\n')
    assert.match(ask, /Approve MB-1 and ship it \(merge, then post the drafts\)\? y \/ n/)
    const spec = render({ items: [task()], sel: 0, now: NOW }, 100, 40).map((l) => l.t).join('\n')
    assert.match(spec, /a approve \+ build/)
  })

  for (const cols of [36, 60, 120]) {
    it(`the detail shows every link, the brief file and the change whole at ${cols} columns`, () => {
      const r = task({ kind: 'result', brief: PITCH, links: allLinks(PITCH), briefFile: '/data/tasks/mb/2/closing-note.md', change: '/wt/mb-2/openspec/changes/singing-bowl' })
      const lines = render({ items: [r], sel: 0, now: NOW }, cols, 80)
      assert.ok(lines.every((l) => l.t.length <= cols), 'no line wider than the pane')
      for (const url of [VIDEO, DESK, PHONE, PR]) {
        // Shown in Links and again in the brief: each time whole, nothing added or cut.
        const joined = lines.filter((l) => l.url === url).map((l) => l.t).join('')
        assert.ok(joined.length >= url.length && joined === url.repeat(joined.length / url.length), `${url} whole`)
      }
      const brief = lines.filter((l) => l.url === 'file:///data/tasks/mb/2/closing-note.md')
      assert.equal(brief.map((l) => l.t).join(''), '/data/tasks/mb/2/closing-note.md')
      const text = lines.map((l) => l.t).join('\n')
      assert.match(text, /\[1\] Video/)
      assert.match(text, /\[3\] Screenshot/)
      assert.match(text, /OpenSpec change/)
    })
  }

  it('a result whose PR also waits on GitHub says both are needed', () => {
    const r = task({ kind: 'result', github: 'app#88' })
    const t = render({ items: [r], sel: 0, now: NOW }, 120, 40).map((l) => l.t).join('\n')
    assert.match(t, /also waits for your approval on GitHub \(app#88\)/)
  })
})

describe('approve and send back (spec and result)', () => {
  it('a spec approve: one tell that says build it now, from the change', async () => {
    const board = memBoard()
    const r = await approve({ id: 'mb/1', kind: 'spec' }, { board, sleep: async () => {} })
    assert.deepEqual(r, { ok: true, how: 'told' })
    assert.equal(board.calls.length, 1)
    assert.match(board.calls[0][2], /^Spec approved\. Build it now, in this conversation/)
    assert.match(board.calls[0][2], /Result ready for review/)
  })

  it('a result approve: one tell that says ship: archive, merge under the repo rules, post as the brand', async () => {
    const board = memBoard()
    const r = await approve({ id: 'mb/2', kind: 'result' }, { board, sleep: async () => {}, notes: 'Shorter caption.' })
    assert.deepEqual(r, { ok: true, how: 'shipping' })
    const text = board.calls[0][2]
    assert.match(text, /^Result approved\. Ship it/)
    assert.match(text, /openspec archive <name> --yes/)
    assert.match(text, /still waits for the owner's approval on GitHub/)
    assert.match(text, /brand accounts, never as the owner/)
    assert.match(text, /Shorter caption\./)
  })

  it('a PR is never approved from here', async () => {
    const board = memBoard()
    const r = await approve({ id: 'pr:x', kind: 'pr' }, { board, sleep: async () => {} })
    assert.equal(r.ok, false)
    assert.deepEqual(board.calls, [])
  })

  it('send back: the owner’s line goes to the same agent, with what to do next', () => {
    const board = memBoard()
    assert.ok(sendBack(board, { id: 'mb/1', kind: 'spec' }, 'Drop the second bowl.').ok)
    assert.ok(sendBack(board, { id: 'mb/2', kind: 'result' }, 'The phone shot is cut off.').ok)
    assert.match(board.calls[0][2], /^Spec sent back\.[\s\S]*Drop the second bowl\.[\s\S]*Spec ready for review[\s\S]*Change no code yet/)
    assert.match(board.calls[1][2], /^Result sent back\.[\s\S]*The phone shot is cut off\.[\s\S]*Result ready for review[\s\S]*Do not merge or post/)
    assert.equal(sendBack(board, { id: 'mb/2', kind: 'result' }, '  ').ok, false)
  })

  it('keys on a result: a asks, y approves; b takes one line', () => {
    const it0 = { id: 'mb/2', key: 'MB-2', kind: 'result', links: allLinks(PITCH) }
    const s = { items: [it0], sel: 0, scroll: 0, mode: 'list', input: '', status: '' }
    const log = []
    const act = { review: () => (log.push('review'), { ok: true }), approve: (i) => log.push(['approve', i.id]), back: (i, t) => (log.push(['back', i.id, t]), { ok: true }), open: (u) => log.push(['open', u]), copy() {}, skip() {}, board() {}, refresh() {}, quit() {} }
    const press = (...ks) => ks.flatMap((k) => keys(k)).forEach((k) => onKey(s, k, act))
    press('\r')
    press('a')
    assert.equal(s.mode, 'confirm')
    press('y')
    press('b', 'n', 'o', '\r')
    press('1')
    assert.deepEqual(log, ['review', ['approve', 'mb/2'], ['back', 'mb/2', 'no'], ['open', VIDEO]])
  })
})

describe('the brief in Plannotator and where the pane opens', () => {
  it('one document: what it is, the product, the change, every link typed, then the brief', () => {
    const doc = briefDoc({ kind: 'spec', key: 'MB-1', repo: 'maelstrom', product: 'tinybreath', line: 'a singing bowl', title: 'T', change: '/wt/openspec/changes/singing-bowl', links: allLinks(SPEC_BRIEF), brief: SPEC_BRIEF })
    assert.match(doc, /^# Spec for review: a singing bowl\n\nMB-1 · tinybreath \(maelstrom\)/)
    assert.match(doc, /OpenSpec change: \/wt\/openspec\/changes\/singing-bowl/)
    assert.match(doc, new RegExp(`- Artifact: Design A, one bowl: ${ART}`))
    assert.ok(doc.endsWith(`${SPEC_BRIEF.trim()}\n`))
  })

  it('opens below the work board in the caller’s workspace, else beside the focused pane', () => {
    const panes = [
      { pane_id: 'w1:p1', workspace_id: 'w1', agent: 'claude', cwd: '/repo' },
      { pane_id: 'w2:p3', workspace_id: 'w2', label: 'Work board', cwd: '/plugins/herdr-projects/checkout' },
      { pane_id: 'w1:p6', workspace_id: 'w1', label: 'Work board', cwd: '/plugins/herdr-projects/checkout' },
    ]
    assert.deepEqual(paneSpot(panes, { focused: 'w1:p1', workspace: 'w1' }), { target: 'w1:p6', direction: 'down' })
    assert.deepEqual(paneSpot(panes, { focused: 'w3:p1', workspace: 'w3' }), { target: 'w2:p3', direction: 'down' })
    assert.deepEqual(paneSpot([panes[0]], { focused: 'w1:p1', workspace: 'w1' }), { target: 'w1:p1', direction: 'right' })
  })
})

describe('agent-kit review with a spec and a result (the CLI against a fake board)', () => {
  function setup(t) {
    const dir = mkdtempSync(join(tmpdir(), 'review-list-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    mkdirSync(join(dir, 'bin'))
    copyFileSync(FAKE, join(dir, 'board.mjs'))
    chmodSync(join(dir, 'board.mjs'), 0o755)
    writeFileSync(
      join(dir, 'board.json'),
      JSON.stringify({
        list: [
          { id: 'mb/1', state: 'blocked', kind: 'permission', stage: 'working', title: 'feat(tinybreath): singing bowl', msg: 'Spec ready for review: a singing bowl' },
          { id: 'mb/2', state: 'blocked', kind: 'permission', stage: 'working', title: 'feat(tinybreath): bowl build', msg: 'Result ready for review: the bowl ships' },
        ],
        details: {
          'mb/1': { task: { id: 'MB-1', title: 'feat(tinybreath): singing bowl', stage: 'working', description: 'Spec review: yes' }, worktree: join(dir, 'wt') },
          'mb/2': { task: { id: 'MB-2', title: 'feat(tinybreath): bowl build', stage: 'working', description: '' }, pr: { url: PR } },
        },
      }),
    )
    writeFileSync(join(dir, 'bin', 'herdr'), `#!/usr/bin/env bash\necho "$*" >> "${dir}/herdr.log"\n[ "$1" = status ] && { echo "status: running"; exit 0; }\necho '{"result":{}}'\n`)
    chmodSync(join(dir, 'bin', 'herdr'), 0o755)
    const data = join(dir, 'data')
    for (const [n, text] of [['1', SPEC_BRIEF], ['2', PITCH]]) {
      mkdirSync(join(data, 'tasks', 'mb', n), { recursive: true })
      writeFileSync(join(data, 'tasks', 'mb', n, 'closing-note.md'), text)
    }
    const run = (...a) => {
      const r = spawnSync(process.execPath, [KIT, 'review', ...a], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, HERDR_PROJECTS_BIN: join(dir, 'board.mjs'), HERDR_PROJECTS_DATA_DIR: data, XDG_STATE_HOME: join(dir, 'state'), FAKE_BOARD_DIR: dir },
      })
      return { ...r, calls: existsSync(join(dir, 'calls.log')) ? readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [] }
    }
    return { dir, run }
  }

  it('list --json: one list, with kind, product, line and typed links', (t) => {
    const { run } = setup(t)
    const r = run('list', '--json')
    assert.equal(r.status, 0, r.stderr)
    const { items } = JSON.parse(r.stdout)
    assert.deepEqual(items.map((i) => i.kind).sort(), ['result', 'spec'])
    const spec = items.find((i) => i.kind === 'spec')
    assert.equal(spec.product, 'tinybreath')
    assert.match(spec.change, /wt\/openspec\/changes\/singing-bowl$/)
    const result = items.find((i) => i.kind === 'result')
    assert.deepEqual(result.links.map((l) => l.type), ['video', 'image', 'image', 'pr'])
  })

  it('the text list says kind, product, age and the one line', (t) => {
    const { run } = setup(t)
    const r = run('list')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^spec {4}tinybreath +\d+m {2}a singing bowl {2}\(MB-1\)$/m)
    assert.match(r.stdout, /^result {2}tinybreath +\d+m {2}the bowl ships {2}\(MB-2\)$/m)
    assert.match(r.stdout, new RegExp(`video: Video, the changed flow: ${VIDEO.replace(/[.]/g, '\\.')}`))
  })

  it('approve a result: the tell says ship; back a spec: the tell carries the line', (t) => {
    const { run } = setup(t)
    const a = run('approve', 'MB-2')
    assert.equal(a.status, 0, a.stderr)
    assert.match(a.stdout, /Approved: the agent ships it now\./)
    const b = run('back', 'mb/1', 'Drop', 'the', 'second', 'bowl')
    assert.equal(b.status, 0, b.stderr)
    const tells = a.calls.concat(b.calls).filter((c) => c[0] === 'tell')
    assert.match(tells.find((c) => c[1] === 'mb/2')[2], /^Result approved\. Ship it/)
    assert.match(tells.find((c) => c[1] === 'mb/1')[2], /^Spec sent back\.[\s\S]*Drop the second bowl/)
  })
})
