import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { collect, defaultRun, dayBounds, ownerWords, whySections } from '../src/lib/daylog.mjs'

const DAY = '2026-03-10'

/** A fixture repo: a decisions file with one row on the day and one on the day before. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'daylog-'))
  const git = (env, ...a) => execFileSync('git', a, { cwd: dir, env: { ...process.env, ...env }, stdio: 'pipe' })
  git({}, 'init', '-q')
  git({}, 'config', 'user.email', 'a@example.com')
  git({}, 'config', 'user.name', 'a')
  const commit = (at, text, msg) => {
    writeFileSync(join(dir, 'decisions.md'), text)
    git({}, 'add', '.')
    git({ GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at }, 'commit', '-q', '-m', msg)
  }
  commit('2026-03-09T10:00:00Z', '| date | decision |\n|---|---|\n| 03-09 | old row |\n', 'a')
  commit('2026-03-10T10:00:00Z', '| date | decision |\n|---|---|\n| 03-09 | old row |\n| 03-10 | Keep logs short: tokens are the cost |\n', 'b')
  const board = join(dir, 'board')
  const task = (n, t) => {
    mkdirSync(join(board, 'demo', String(n)), { recursive: true })
    writeFileSync(join(board, 'demo', String(n), 'task.json'), JSON.stringify(t))
  }
  task(1, { id: 'demo/1', title: 'Ship the thing', stage: 'done', at: Date.parse('2026-03-10T12:00:00Z'),
    description: "Boss: 'we need a daily log, but only the high level story' and more." })
  task(2, { id: 'demo/2', title: 'Too old', stage: 'done', at: Date.parse('2026-03-09T12:00:00Z'), description: '' })
  task(3, { id: 'demo/3', title: 'Gave up', stage: 'failed', msg: 'Gave up: no access', at: Date.parse('2026-03-10T13:00:00Z'), description: '' })
  writeFileSync(join(board, 'demo', '3', 'closing.md'), '\nCould not reach the staging host.\nMore text.\n')
  return { dir, board }
}

const prs = [
  { number: 7, title: 'feat: cheap digest', state: 'MERGED', mergedAt: '2026-03-10T09:00:00Z', closedAt: '2026-03-10T09:00:00Z',
    body: '## Summary\n- file names everywhere\n\n## Why\nLogs cost tokens.\n\n## Benefits\nA run costs cents.\n\n## Test plan\nsecret detail' },
  { number: 8, title: 'Revert "feat: cheap digest"', state: 'MERGED', mergedAt: '2026-03-10T11:00:00Z', body: '## Why\nIt broke.' },
  { number: 9, title: 'try: other way', state: 'CLOSED', mergedAt: null, closedAt: '2026-03-10T15:00:00Z', body: '## Why\nDropped for #7.' },
  { number: 5, title: 'chore: yesterday', state: 'MERGED', mergedAt: '2026-03-09T23:59:00Z', body: '## Why\nold' },
]
const runs = [
  { conclusion: 'failure', createdAt: '2026-03-10T08:00:00Z', headBranch: 'x', workflowName: 'CI', displayTitle: 'fix lint' },
  { conclusion: 'success', createdAt: '2026-03-10T08:30:00Z', headBranch: 'x', workflowName: 'CI', displayTitle: 'fix lint' },
  { conclusion: 'failure', createdAt: '2026-03-10T09:00:00Z', headBranch: 'y', workflowName: 'CI', displayTitle: 'still red' },
]
const fakeRun = (cmd, args, cwd) => {
  if (cmd === 'gh' && args[0] === 'pr') return JSON.stringify(prs)
  if (cmd === 'gh' && args[0] === 'run') return JSON.stringify(runs)
  return defaultRun(cmd, args, cwd)
}

describe('daylog collect', () => {
  const { dir, board } = fixture()
  const config = { name: 'demo', owner: 'Boss', daylog: { decisions: 'decisions.md', board } }
  const out = collect({ repoDir: dir, date: DAY, config, run: fakeRun })

  it('keeps only Why and Benefits of merged PRs from that UTC day', () => {
    assert.match(out, /#7 feat: cheap digest\n  Why\/Benefits: Logs cost tokens\. A run costs cents\./)
    assert.doesNotMatch(out, /secret detail|file names everywhere|yesterday/)
  })
  it('lists reverted and closed-unmerged PRs apart', () => {
    assert.match(out, /## Reverted PRs \(1\)\n#8/)
    assert.match(out, /## Closed unmerged PRs \(1\)\n#9/)
  })
  it('lists CI failures that were fixed, not the ones still red', () => {
    assert.match(out, /CI on x: fix lint/)
    assert.doesNotMatch(out, /still red/)
  })
  it('lists board tasks finished or failed that day with a first line', () => {
    assert.match(out, /demo\/1 \[done\] Ship the thing/)
    assert.match(out, /demo\/3 \[failed\] Gave up\n  Could not reach the staging host\./)
    assert.doesNotMatch(out, /Too old/)
  })
  it('shows only decision rows added that day', () => {
    assert.match(out, /Keep logs short/)
    assert.doesNotMatch(out, /old row/)
  })
  it("quotes the owner's words from a task description", () => {
    assert.match(out, /demo\/1: "we need a daily log, but only the high level story"/)
  })
  it('says what it cut when over budget', () => {
    const small = collect({ repoDir: dir, date: DAY, config, run: fakeRun, budgetTokens: 60 })
    assert.match(small, /## Cut for size/)
    assert.ok(small.length < out.length)
  })
  it('notes a missing gh instead of failing', () => {
    const none = collect({ repoDir: dir, date: DAY, config, run: (c, a, d) => { if (c === 'gh') throw new Error('x'); return defaultRun(c, a, d) } })
    assert.match(none, /gh unavailable/)
  })
  it('says so on a quiet day', () => {
    const quiet = collect({ repoDir: dir, date: '2026-01-01', config: { name: 'demo' }, run: () => '[]' })
    assert.match(quiet, /Nothing happened/)
  })
})

describe('fixes', () => {
  it('keeps apostrophes inside an owner quote', () => {
    const t = "Boss: 'we need a daily log, don't over-think it please'. What's next?"
    assert.deepEqual(ownerWords(t, 'Boss'), ["we need a daily log, don't over-think it please"])
  })
  it('ignores PRs merged into another base', () => {
    const run = (c, a) => JSON.stringify(a[0] === 'pr' ? [{ number: 1, title: 't', state: 'MERGED', mergedAt: '2026-03-10T09:00:00Z', baseRefName: 'feat/x', body: '' }] : [])
    assert.doesNotMatch(collect({ repoDir: '.', date: DAY, config: { name: 'd' }, run }), /#1 /)
  })
  it('rejects 2026-02-31 and a non-numeric budget', () => {
    assert.throws(() => dayBounds('2026-02-31'))
    assert.throws(() => collect({ repoDir: '.', date: DAY, config: {}, run: () => '[]', budgetTokens: NaN }))
  })
  it('stops a Why section at a Tests: paragraph', () => assert.equal(whySections('## Benefits\nb\nTests: x'), 'b'))
})

describe('helpers', () => {
  it('rejects a bad date', () => assert.throws(() => dayBounds('10.03.2026')))
  it('reads Value as a Why section too', () => assert.equal(whySections('## Value\nfast'), 'fast'))
  it('needs an owner for owner words', () => assert.deepEqual(ownerWords("X: 'a long enough quoted sentence here'", ''), []))
})
