// The review flow fitted to how the work board really runs (KIT-16): the board opens the PR only after the
// agent ends, runs its reviewer, then shows "ready to approve"; an idle compaction can turn a stop into an
// error; native apps are recorded their own way; the archive is part of the reviewed PR. Every board here is
// in memory or the fake CLI (fixtures/fake-board.mjs.txt).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { check, passes, platformOf } from '../src/lib/review-check.mjs'
import {
  approve,
  approverOf,
  collect,
  findRow,
  lastReport,
  ownersResult,
  postTask,
  prOf,
  readyToApprove,
  render,
  resultBackWords,
  sendBack,
  specApprovedWords,
} from '../src/lib/review.mjs'

const KIT = fileURLToPath(new URL('../bin/agent-kit.mjs', import.meta.url))
const FAKE = fileURLToPath(new URL('./fixtures/fake-board.mjs.txt', import.meta.url))
const NOW = 1_800_000_000_000
const MIN = 60 * 1000
const PR = 'https://github.com/acme/maelstrom/pull/612'
const M = 'https://media.example.com/tinybreath/bowl'
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

/** A pitch as the agent writes it before it ends: no PR link (the board opens the PR after). */
const pitch = ({ platform = '', see = `- Video, the changed flow: ${M}/flow.mp4\n- Screenshot, desktop, session: ${M}/desktop.png\n- Screenshot, phone, session: ${M}/phone.png`, dist = '- X post on @tinybreathapp, draft: "A singing bowl now ends your session."', change = 'Change: openspec/changes/singing-bowl\n' } = {}) => `# Result: a singing bowl ends the session

Product: tinybreath
${platform ? `Platform: ${platform}\n` : ''}
${change}
## What the user gets
One tap on the bowl ends the session.

## Why we should add it
People quit at the end of a session.

## Complexity
One component and one sound; worth it because the end is where people quit.

## See it
${see}

## Risk and undo
A loud bowl at night. Undo: revert the PR.

## Distribution
${dist}

## Recommendation
Ship it. It ends the session calmly.
`

function memBoard({ list = [], details = {} } = {}) {
  const calls = []
  return {
    calls,
    list: () => list,
    details: (id) => structuredClone(details[id]),
    tell: (id, text) => (calls.push(['tell', id, text]), { ok: true }),
    approve: (id) => (calls.push(['approve', id]), { ok: true }),
    add: (title, extra) => (calls.push(['add', title, ...extra]), { ok: true }),
    stop: (id) => (calls.push(['stop', id]), { ok: true }),
    delegate: (id, extra) => (calls.push(['delegate', id, ...extra]), { ok: true }),
  }
}
const io = (files = {}) => ({ readFile: (p) => files[p] ?? null, mtime: (p) => (p in files ? NOW - 10 * MIN : null) })

describe('1. order of stops: a result comes from the board’s ready to approve', () => {
  const row = (n, over = {}) => ({ id: `mb/${n}`, state: 'blocked', kind: 'permission', stage: 'approval', title: `task ${n}`, msg: 'Review passed', pr: PR, ...over })
  const list = [
    row(1), // a pitch in the closing note: the owner's
    row(2), // a fix with an ordinary summary: the CEO's
    row(3), // no pitch, but flagged Spec review: yes: the owner's, and incomplete
    row(4, { stage: 'asks', msg: 'Result ready for review: by hand', pr: undefined }), // the old way: still shown, flagged
  ]
  const details = {
    'mb/1': { task: { id: 'MB-1', title: 'feat(tinybreath): bowl', stage: 'approval', description: '' }, pr: PR, worktree: '/wt/1' },
    'mb/2': { task: { id: 'MB-2', title: 'fix: typo', stage: 'approval', description: 'A typo on the pricing page.' }, pr: PR },
    'mb/3': { task: { id: 'MB-3', title: 'feat: playlists', stage: 'approval', description: 'Spec review: yes' }, pr: { url: PR } },
    'mb/4': { task: { id: 'MB-4', title: 'feat: by hand', stage: 'asks', description: '' } },
  }
  const files = {
    '/data/tasks/mb/1/closing-note.md': pitch(),
    '/data/tasks/mb/2/closing-note.md': 'Fixed the typo on the pricing page. Tests pass.',
    '/data/tasks/mb/3/closing-note.md': 'Built playlists.',
    '/data/tasks/mb/4/closing-note.md': pitch(),
    '/data/tasks/mb/1/task.json': JSON.stringify({ since: NOW - 3 * MIN }),
  }
  const items = collect({ board: memBoard({ list, details }), data: '/data', ...io(files), exists: () => false, now: NOW })
  const byId = Object.fromEntries(items.map((i) => [i.id, i]))

  it('reads the board’s ready to approve: stage approval, state blocked', () => {
    assert.equal(readyToApprove(list[0]), true)
    assert.equal(readyToApprove({ ...list[0], stage: 'asks' }), false)
    assert.equal(readyToApprove({ ...list[0], state: 'error' }), false)
  })

  it('a result row is built from ready to approve plus the closing-note pitch; the board fills the PR link', () => {
    const r = byId['mb/1']
    assert.equal(r.kind, 'result')
    assert.equal(r.ready, true)
    assert.equal(r.line, 'a singing bowl ends the session')
    assert.equal(r.at, NOW - 3 * MIN, 'its age is since it became ready to approve')
    assert.equal(r.links.at(-1).url, PR)
    assert.equal(r.links.at(-1).type, 'pr')
    assert.deepEqual(r.findings.filter((f) => f.level === 'error'), [], 'complete: no "no pull request link" any more')
  })

  it('a fix, SEO page, content or chore stays the CEO’s: no row', () => {
    assert.equal(byId['mb/2'], undefined)
    assert.equal(ownersResult({ note: 'Fixed the typo.' }), false)
    assert.equal(ownersResult({ note: pitch() }), true)
    assert.equal(ownersResult({ description: 'Design review: yes' }), true)
    assert.equal(ownersResult({ said: 'Wrote openspec/changes/playlists and built it.' }), true)
  })

  it('a flagged task without a pitch still comes to the owner, marked incomplete', () => {
    const r = byId['mb/3']
    assert.equal(r.kind, 'result')
    assert.equal(r.prUrl, PR, 'details may still give { url }')
    assert.ok(r.findings.some((f) => /no "## What the user gets"/.test(f.what)))
  })

  it('"Result ready" reported by hand is shown, but says to send it back', () => {
    const r = byId['mb/4']
    assert.equal(r.kind, 'result')
    assert.equal(r.ready, undefined)
    assert.ok(r.findings.some((f) => /stopped by hand with "Result ready"/.test(f.what)))
    assert.ok(r.findings.some((f) => /no pull request yet/.test(f.what)))
  })

  it('the board’s details give the PR as a URL (1.2.12), older ones as { url }', () => {
    assert.equal(prOf({ pr: PR }), PR)
    assert.equal(prOf({ pr: { url: PR } }), PR)
    assert.equal(prOf({}), '')
  })

  it('approve is the board’s approve, then the drafts as a task after the merge; nothing is told', async () => {
    const board = memBoard()
    const it0 = { ...byId['mb/1'] }
    const r = await approve(it0, { board, sleep: async () => {}, notes: 'Shorter caption.' })
    assert.deepEqual(r, { ok: true, how: 'merging', posts: true })
    assert.deepEqual(board.calls[0], ['approve', 'mb/1'])
    const [, title, ...opts] = board.calls[1]
    assert.equal(board.calls[1][0], 'add')
    assert.match(title, /^post: a singing bowl ends the session$/)
    assert.deepEqual(opts.slice(2), ['--repo', 'mb', '--after', 'mb/1', '--research', '--delegate'])
    assert.match(opts[1], /brand accounts[\s\S]*Never as the owner[\s\S]*once MB-1 is merged[\s\S]*X post on @tinybreathapp[\s\S]*Shorter caption\./)
    assert.ok(!board.calls.some((c) => c[0] === 'tell'), 'the PR head never moves after the yes')
  })

  it('no post task when the product is not live', () => {
    assert.equal(postTask({ brief: pitch({ dist: 'Not live yet: no post.' }), key: 'MB-1' }), null)
  })

  it('refuses a result that is not ready to approve, and one whose PR still waits on GitHub', async () => {
    const board = memBoard()
    const a = await approve(byId['mb/4'], { board, sleep: async () => {} })
    assert.equal(a.ok, false)
    assert.match(a.error, /not brought it as ready to approve/)
    const b = await approve({ ...byId['mb/1'], github: 'maelstrom#612' }, { board, sleep: async () => {} })
    assert.equal(b.ok, false)
    assert.match(b.error, /approve its PR on GitHub first \(maelstrom#612\)/)
    assert.deepEqual(board.calls, [])
  })

  it('send back goes to the same agent: change it, end the turn normally, the board brings it back', () => {
    const board = memBoard()
    assert.ok(sendBack(board, byId['mb/1'], 'The phone shot is cut off.').ok)
    assert.match(board.calls[0][2], /^Result sent back\.[\s\S]*end your turn normally: the board updates the PR/)
  })

  it('the detail says it is ready to approve on the board', () => {
    const t = render({ items: [byId['mb/1']], sel: 0, now: NOW }, 100, 50).map((l) => l.t).join('\n')
    assert.match(t, /▸ result tinybreath +3m {2}a singing bowl ends the session/)
    assert.match(t, /Ready to approve on the board: Review passed/)
    assert.match(t, /a approve \+ merge/)
  })

  it('the spec approve tells the agent to end normally, never to report Result ready', () => {
    assert.match(specApprovedWords(), /end your turn normally\. Do not report "Result ready"/)
  })

  it('the rule and the skill say it: the pitch, then end normally; nothing reports Result ready; the CEO approves only the rest', () => {
    const rule = read('rules/result-review.md')
    assert.match(rule, /ends its turn normally/)
    assert.match(rule, /Nothing reports `Result ready` by hand/)
    assert.match(rule, /The CEO approves a ready-to-approve task only when it needs no result review/)
    assert.doesNotMatch(rule, /--msg "Result ready/)
    const skill = read('skills/result-pitch/SKILL.md')
    assert.match(skill, /end the turn normally/i)
    assert.doesNotMatch(skill, /--msg "Result ready/)
  })
})

describe('2. the archive: part of the reviewed PR, before the agent ends', () => {
  it('a pitch whose change is still under openspec/changes/ is not complete', () => {
    const f = check('result', pitch(), { unarchived: true })
    assert.ok(f.some((x) => /not archived yet: run agent-kit spec archive/.test(x.what)))
    assert.equal(passes(check('result', pitch())), true)
  })

  it('the review list checks the change in the task’s worktree', () => {
    const list = [{ id: 'mb/1', state: 'blocked', kind: 'permission', stage: 'approval', title: 't', msg: '', pr: PR }]
    const details = { 'mb/1': { task: { id: 'MB-1', title: 't', description: '' }, pr: PR, worktree: '/wt/1' } }
    const files = { '/data/tasks/mb/1/closing-note.md': pitch() }
    const seen = []
    const [it0] = collect({ board: memBoard({ list, details }), data: '/data', ...io(files), exists: (p) => (seen.push(p), true), now: NOW })
    assert.deepEqual(seen, ['/wt/1/openspec/changes/singing-bowl'])
    assert.ok(it0.findings.some((x) => /not archived yet/.test(x.what)))
  })

  it('agent-kit review check flags a change folder that is still there', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'archive-check-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    writeFileSync(join(dir, 'note.md'), pitch())
    const run = () => spawnSync(process.execPath, [KIT, 'review', 'check', 'note.md'], { cwd: dir, encoding: 'utf8' })
    assert.equal(run().status, 0, 'no change folder: archived (or never there)')
    mkdirSync(join(dir, 'openspec', 'changes', 'singing-bowl'), { recursive: true })
    const r = run()
    assert.equal(r.status, 1)
    assert.match(r.stdout, /not archived yet/)
  })

  it('a send back says to undo the archive commit first when the change moves', () => {
    assert.match(resultBackWords('x'), /undo the archive commit first \(git revert <its sha>\)/)
  })

  it('the rule picks before the stop and says why', () => {
    const rule = read('rules/spec-review.md')
    assert.match(rule, /archives it before it ends the turn that brings the result/)
    assert.match(rule, /approval at head/)
    assert.doesNotMatch(rule, /last commit of the\s+PR/)
    assert.doesNotMatch(read('rules/result-review.md'), /as the PR's last commit/)
  })
})

describe('3. false errors: a stop the board then marked an error keeps its row', () => {
  const task = (blocked) => JSON.stringify({ description: 'Spec review: yes', blocked })
  const list = [
    { id: 'mb/1', state: 'error', stage: 'nosummary', title: 'feat: bowl', msg: 'Conversation compacted (ctrl+o for history)' },
    { id: 'mb/2', state: 'error', stage: 'nosummary', title: 'feat: other', msg: 'Stopped without a summary' },
    { id: 'mb/3', state: 'error', stage: 'failed', title: 'feat: design', msg: 'Conversation compacted' },
  ]
  const details = {
    'mb/1': { task: { id: 'MB-1', title: 'feat: bowl', description: 'Spec review: yes' }, worktree: '/wt/1' },
    'mb/3': { task: { id: 'MB-3', title: 'feat: design', description: 'Design review: yes' } },
  }
  const files = {
    '/data/tasks/mb/1/task.json': task({ at: NOW - 20 * MIN, kind: 'permission', msg: 'Spec ready for review: a singing bowl ends a session' }),
    '/data/tasks/mb/1/closing-note.md': '# Spec: a bowl\n\nChange: openspec/changes/singing-bowl\n',
    '/data/tasks/mb/2/task.json': task(null),
    '/data/tasks/mb/3/task.json': JSON.stringify({ description: 'Design review: yes', blocked: { at: 1, kind: 'permission', msg: 'Design ready: two variants' } }),
  }
  const items = collect({ board: memBoard({ list, details }), data: '/data', ...io(files), now: NOW })

  it('keeps a row whose last real report was Spec, Design or Result ready, with the board’s word beside it', () => {
    assert.deepEqual(items.map((i) => [i.id, i.kind]).sort(), [['mb/1', 'spec'], ['mb/3', 'design']])
    const spec = items.find((i) => i.id === 'mb/1')
    assert.equal(spec.line, 'a singing bowl ends a session', 'the line of the real report, not the banner')
    assert.equal(spec.boardSays, 'Conversation compacted (ctrl+o for history)')
    const t = render({ items: [spec], sel: 0, now: NOW }, 100, 40).map((l) => l.t).join('\n')
    assert.match(t, /The board marked it an error \(Conversation compacted \(ctrl\+o for history\)\), but its last report/)
  })

  it('an error with no such report is not the owner’s', () => {
    assert.equal(lastReport({ blocked: null }), null)
    assert.equal(items.some((i) => i.id === 'mb/2'), false)
  })

  it('approve still works: a tell wakes the agent from the error', async () => {
    const board = memBoard()
    const r = await approve(items.find((i) => i.id === 'mb/1'), { board, sleep: async () => {} })
    assert.equal(r.ok, true)
    assert.match(board.calls[0][2], /^Spec approved/)
  })
})

describe('4. native apps: what counts as the real app, and the stills each kind needs', () => {
  const ios = `- Video, the changed flow (simulator): ${M}/flow.mp4\n- Screenshot, phone, session: ${M}/phone.png`
  const desk = `- Video, the changed flow (frontend in the browser): ${M}/flow.mp4\n- Screenshot, desktop, settings: ${M}/desktop.png`

  it('reads the platform, with the names people use', () => {
    assert.equal(platformOf(pitch()), 'web')
    assert.equal(platformOf(pitch({ platform: 'Expo' })), 'ios')
    assert.equal(platformOf(pitch({ platform: 'tauri' })), 'desktop')
    assert.equal(platformOf(pitch({ platform: 'menubar' })), 'menubar')
  })

  it('iOS: a simulator video and phone screenshots, no desktop one', () => {
    assert.equal(passes(check('result', pitch({ platform: 'ios', see: ios }))), true)
    assert.equal(passes(check('result', pitch({ see: ios }))), false, 'on the web a desktop shot is still needed')
  })

  it('a desktop or menu bar app: desktop shots and a still of the real window, or why there is none', () => {
    const f = check('result', pitch({ platform: 'tauri', see: desk }))
    assert.ok(f.some((x) => /no still of the real window/.test(x.what)))
    assert.equal(passes(check('result', pitch({ platform: 'tauri', see: `${desk}\n- Screenshot, window, settings: ${M}/window.png` }))), true)
    assert.equal(passes(check('result', pitch({ platform: 'menubar', see: `${desk}\nNo window still: screencapture cannot read the display in a board session` }))), true)
    assert.equal(passes(check('result', pitch({ platform: 'menubar', see: `${desk}\nNo window still:` }))), false, 'a reason is needed')
  })

  it('an unknown platform is named', () => {
    assert.ok(check('result', pitch({ platform: 'watch' })).some((x) => /unknown Platform "watch"/.test(x.what)))
  })

  it('the rule and the skill give the fallback per kind and say what counts as the real app', () => {
    for (const f of ['rules/result-review.md', 'skills/result-pitch/SKILL.md']) {
      const t = read(f)
      assert.match(t, /xcrun simctl io <udid> recordVideo/, f)
      assert.match(t, /@tauri-apps\/api\/mocks/, f)
      assert.match(t, /product-ui/, f)
      assert.match(t, /No window still: <why>/, f)
    }
    assert.match(read('rules/result-review.md'), /What counts as the real app/)
  })
})

describe('the CEO approves only what needs no result review (agent-kit review owner, the merge gate)', () => {
  const list = [
    { id: 'maelstrom/7', state: 'blocked', stage: 'approval' },
    { id: 'agent-kit/7', state: 'blocked', stage: 'approval' },
    { id: 'maelstrom/8', state: 'blocked', stage: 'approval' },
  ]
  const details = { 'maelstrom/7': { task: { id: 'MB-7' } }, 'agent-kit/7': { task: { id: 'KIT-7' } }, 'maelstrom/8': { task: { id: 'MB-8' } } }
  const files = { '/data/tasks/maelstrom/7/closing-note.md': pitch(), '/data/tasks/maelstrom/8/closing-note.md': 'Fixed a typo.' }

  it('finds a task by repo/n or by its key, in any case', () => {
    const board = memBoard({ list, details })
    assert.equal(findRow(board, 'maelstrom/7')?.id, 'maelstrom/7')
    assert.equal(findRow(board, 'kit-7')?.id, 'agent-kit/7')
    assert.equal(findRow(board, 'MB-7')?.id, 'maelstrom/7')
    assert.equal(findRow(board, 'MB-9'), null)
  })

  it('a result is the owner’s, a fix the CEO’s', () => {
    const board = memBoard({ list, details })
    assert.equal(approverOf('MB-7', { board, data: '/data', ...io(files) }).who, 'owner')
    assert.equal(approverOf('MB-8', { board, data: '/data', ...io(files) }).who, 'ceo')
    assert.throws(() => approverOf('MB-9', { board, data: '/data', ...io(files) }), /not on the work board/)
  })

  function gate(t, command) {
    const dir = mkdtempSync(join(tmpdir(), 'approve-gate-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    copyFileSync(FAKE, join(dir, 'board.mjs'))
    chmodSync(join(dir, 'board.mjs'), 0o755)
    writeFileSync(join(dir, 'board.json'), JSON.stringify({ list, details }))
    for (const [id, text] of Object.entries(files)) {
      const p = join(dir, 'data', id.replace('/data/', ''))
      mkdirSync(join(p, '..'), { recursive: true })
      writeFileSync(p, text)
    }
    const r = spawnSync('bash', [fileURLToPath(new URL('../hooks/merge-gate.sh', import.meta.url))], {
      input: JSON.stringify({ tool_input: { command }, cwd: dir }),
      env: { ...process.env, HERDR_PROJECTS_BIN: join(dir, 'board.mjs'), HERDR_PROJECTS_DATA_DIR: join(dir, 'data'), FAKE_BOARD_DIR: dir },
      encoding: 'utf8',
    })
    return r
  }

  it('the gate blocks the CEO’s approve of a result, and lets a fix through', (t) => {
    const blocked = gate(t, 'herdr-projects approve MB-7')
    assert.equal(blocked.status, 2, blocked.stderr)
    assert.match(blocked.stderr, /the owner approves it in the review list/)
    assert.equal(gate(t, '/Users/x/.herdr-projects/data/bin/herdr-projects approve maelstrom/8').status, 0)
    assert.equal(gate(t, 'herdr-projects approve MB-8 && herdr-projects approve MB-7').status, 2, 'every approve in the command')
    assert.equal(gate(t, 'herdr-projects approve MB-9').status, 2, 'cannot tell: blocked')
    assert.equal(gate(t, 'herdr-projects list --json').status, 0)
    assert.equal(gate(t, 'echo "herdr-projects approve MB-7 is the owner’s"').status, 0, 'a mention is not an approve')
  })
})

describe('6. media keys and the R2 note', () => {
  it('the result-pitch skill names a key for kit and ops media and where to run the upload', () => {
    const t = read('skills/result-pitch/SKILL.md')
    assert.match(t, /pnpm media upload kit /)
    assert.match(t, /pnpm media upload ops /)
    assert.match(t, /never the main checkout/)
  })
})

describe('the CLI against the fake board: ready to approve, then approve', () => {
  it('lists the result from ready to approve and approves it as the board’s approve plus a post task', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'review-fit-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    copyFileSync(FAKE, join(dir, 'board.mjs'))
    chmodSync(join(dir, 'board.mjs'), 0o755)
    writeFileSync(
      join(dir, 'board.json'),
      JSON.stringify({
        list: [{ id: 'mb/5', state: 'blocked', kind: 'permission', stage: 'approval', title: 'feat: bowl', msg: 'Review passed', pr: PR }],
        details: { 'mb/5': { task: { id: 'MB-5', title: 'feat: bowl', stage: 'approval', description: '' }, pr: PR } },
      }),
    )
    const data = join(dir, 'data')
    mkdirSync(join(data, 'tasks', 'mb', '5'), { recursive: true })
    writeFileSync(join(data, 'tasks', 'mb', '5', 'closing-note.md'), pitch({ change: '' }))
    const run = (...a) =>
      spawnSync(process.execPath, [KIT, 'review', ...a], {
        encoding: 'utf8',
        env: { ...process.env, HERDR_PROJECTS_BIN: join(dir, 'board.mjs'), HERDR_PROJECTS_DATA_DIR: data, XDG_STATE_HOME: join(dir, 'state'), FAKE_BOARD_DIR: dir },
      })
    const list = run('list', '--json')
    assert.equal(list.status, 0, list.stderr)
    const [item] = JSON.parse(list.stdout).items
    assert.equal(item.kind, 'result')
    assert.equal(item.links.at(-1).url, PR)
    assert.deepEqual(item.findings.filter((f) => f.level === 'error'), [])
    assert.equal(run('owner', 'MB-5').status, 0)
    const a = run('approve', 'MB-5')
    assert.equal(a.status, 0, a.stderr)
    assert.match(a.stdout, /Approved: the board merges it; the drafts post after the merge\./)
    const calls = readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    assert.ok(calls.some((c) => c[0] === 'approve' && c[1] === 'mb/5'))
    const added = JSON.parse(readFileSync(join(dir, 'board.json'), 'utf8')).added
    assert.equal(added.length, 1)
    assert.ok(added[0].includes('--after') && added[0].includes('mb/5'))
    assert.ok(existsSync(join(dir, 'state', 'agent-kit', 'review', 'status', 'mb-5.json')))
  })
})
