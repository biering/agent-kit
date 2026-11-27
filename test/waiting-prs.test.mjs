// PRs that wait for the owner (src/lib/waiting-prs.mjs, and its place in src/lib/review.mjs and the pane).
// GitHub is a fake `gh` on PATH or an injected runner; nothing here touches a real repo or board.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { keys, onKey } from '../src/lib/review-pane.mjs'
import { render } from '../src/lib/review.mjs'
import { ciState, collectPrs, depGate, gatePaths, gateSentences, judge, newRuntimeDeps, parseCodeowners, slugOf } from '../src/lib/waiting-prs.mjs'

const KIT = fileURLToPath(new URL('../bin/agent-kit.mjs', import.meta.url))
const FAKE_BOARD = fileURLToPath(new URL('./fixtures/fake-board.mjs.txt', import.meta.url))
const NOW = 1_800_000_000_000
const HEAD = 'a'.repeat(40)
const URL1 = 'https://github.com/acme/web/pull/7'

const OWNERS = parseCodeowners(`
# the owner decides these
*                       @robin
/apps/care/             @robin
/scripts/stripe*        @robin
**/stripe.config.json   @robin
/.github/workflows/     @robin @acme/team
docs/*.md               @someone-else
/unowned/               # no owner, no gate
`)

const pr = (over = {}) => ({
  number: 7,
  title: 'feat(web): a thing',
  url: URL1,
  isDraft: false,
  reviewDecision: '',
  createdAt: new Date(NOW - 3 * 3600 * 1000).toISOString(),
  author: { login: 'lucy-bot' },
  reviews: [],
  reviewRequests: [],
  statusCheckRollup: [{ name: 'check', status: 'COMPLETED', conclusion: 'SUCCESS' }],
  body: '',
  headRefOid: HEAD,
  baseRefName: 'main',
  files: [{ path: 'README.md' }],
  ...over,
})
const repo = { name: 'web', slug: 'acme/web' }
const ctx = (over = {}) => ({ owner: '', agents: ['lucy-bot'], codeowners: OWNERS, deps: [], repoNeeds: false, task: null, ...over })

describe('CODEOWNERS: which changed files are the owner’s', () => {
  it('matches directories, globs and any-depth names, last rule wins, and ignores the catch-all', () => {
    const g = (files, o = {}) => gatePaths(OWNERS, files, { skip: ['lucy-bot'], ...o }).map((x) => x.path)
    assert.deepEqual(g(['apps/care/src/form.ts', 'apps/other/x.ts']), ['apps/care/src/form.ts'])
    assert.deepEqual(g(['scripts/stripe-prices.mjs', 'scripts/other.mjs']), ['scripts/stripe-prices.mjs'])
    assert.deepEqual(g(['apps/web/stripe.config.json']), ['apps/web/stripe.config.json'])
    assert.deepEqual(g(['.github/workflows/ci.yml']), ['.github/workflows/ci.yml'])
    assert.deepEqual(g(['README.md', 'src/index.ts']), [], 'the catch-all is a default owner, not a gate')
    assert.deepEqual(g(['docs/a.md'], { owner: 'robin' }), [], 'another owner’s rule is not his')
    assert.deepEqual(g(['unowned/x']), [])
  })

  it('never counts the PR author or an agent as the owner', () => {
    assert.deepEqual(gatePaths(OWNERS, ['apps/care/x'], { skip: ['robin'] }), [])
    assert.equal(gatePaths(OWNERS, ['apps/care/x'], { skip: [], owner: 'robin' }).length, 1)
    assert.deepEqual(gatePaths(OWNERS, ['docs/a.md'], { skip: [], owner: 'robin' }), [], 'a named owner holds only his own rules')
  })

  it('a rename is judged by its new path only (the old one is not in the file list)', () => {
    assert.deepEqual(gatePaths(OWNERS, ['apps/other/moved.ts'], {}), [])
  })
})

describe('new runtime dependencies', () => {
  const pkg = (o) => JSON.stringify(o)
  it('counts dependencies and peerDependencies new to the file, not versions, dev or local packages', () => {
    const base = pkg({ dependencies: { a: '1.0.0' }, devDependencies: { t: '1' } })
    const head = pkg({
      dependencies: { a: '2.0.0', b: '^1', local: 'workspace:*', f: 'file:../f' },
      peerDependencies: { c: '*' },
      devDependencies: { t: '2', d: '1' },
    })
    assert.deepEqual(newRuntimeDeps(base, head), ['b', 'c'])
  })
  it('a dev dependency that becomes a runtime one counts; a new file counts all; unreadable head counts none', () => {
    assert.deepEqual(newRuntimeDeps(pkg({ devDependencies: { t: '1' } }), pkg({ dependencies: { t: '1' } })), ['t'])
    assert.deepEqual(newRuntimeDeps(null, pkg({ dependencies: { x: '1' } })), ['x'])
    assert.deepEqual(newRuntimeDeps('{}', '{ broken'), [])
  })
  it('the repo’s own dependency check wins over the diff', () => {
    assert.equal(depGate([{ name: 'new dependency', conclusion: 'SUCCESS' }]), 'green')
    assert.equal(depGate([{ context: 'new dependency', state: 'FAILURE' }]), 'red')
    assert.equal(depGate([{ name: 'check', conclusion: 'SUCCESS' }]), null)
    const green = pr({ files: [{ path: 'package.json' }], statusCheckRollup: [{ context: 'new dependency', state: 'SUCCESS' }] })
    assert.equal(judge(green, repo, ctx({ deps: ['x'], codeowners: [] })), null, 'a green repo check: not a new dependency')
    const red = pr({ statusCheckRollup: [{ context: 'new dependency', state: 'FAILURE' }] })
    assert.match(judge(red, repo, ctx({ codeowners: [] })).why.join(), /new dependency/)
  })
})

describe('CI state', () => {
  it('failing beats pending beats passing; none when there is nothing', () => {
    assert.equal(ciState([]).state, 'none')
    assert.equal(ciState([{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'COMPLETED', conclusion: 'SKIPPED' }]).state, 'passing')
    assert.equal(ciState([{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'IN_PROGRESS', conclusion: '' }]).state, 'pending')
    assert.equal(ciState([{ context: 'ci', state: 'PENDING' }]).state, 'pending')
    const f = ciState([{ name: 'a', status: 'IN_PROGRESS' }, { name: 'tests', status: 'COMPLETED', conclusion: 'FAILURE' }, { context: 's', state: 'ERROR' }])
    assert.deepEqual([f.state, f.failing], ['failing', ['tests', 's']])
  })
})

describe('the gate-reviewer’s three sentences', () => {
  const three = 'It adds a refund button. Money could go out twice. Revert the PR and refund by hand.'
  it('reads the `for <owner>:` line of a verdict block, and what follows it up to the blank line', () => {
    const verdict = `GATE ADVICE OK #7 at ${HEAD}\nclasses: money\nfindings: none\nfor robin: ${three}\nafter merge: none\n`
    assert.equal(gateSentences(verdict), three)
    assert.equal(gateSentences(`Notes\n\n**For you:** It adds a refund button.\nMoney could go out twice. Revert the PR.\n\nMore.`), 'It adds a refund button. Money could go out twice. Revert the PR.')
    assert.equal(gateSentences(`for robin: ${three}`, 'robin'), three)
  })
  it('is empty without them, and ordinary "for example:" text is not one', () => {
    assert.equal(gateSentences('Adds a button.\nFor example: nothing.'), '')
    assert.equal(gateSentences(''), '')
  })
})

describe('which PRs wait for the owner', () => {
  const why = (p, c = ctx()) => judge(p, repo, c)?.why

  it('review required by GitHub: waits; approved, changes requested or nothing: does not', () => {
    assert.deepEqual(why(pr({ reviewDecision: 'REVIEW_REQUIRED' })), ['review required'])
    assert.equal(why(pr({ reviewDecision: 'APPROVED' })), undefined)
    assert.equal(why(pr({ reviewDecision: 'CHANGES_REQUESTED' })), undefined)
    assert.equal(why(pr()), undefined, 'merges on green CI and the board review: nothing needs him')
  })

  it('a gate path, a new dependency and a repo that needs every PR reviewed, each with its why', () => {
    assert.match(why(pr({ files: [{ path: 'apps/care/a.ts' }, { path: 'apps/care/b.ts' }] }))[0], /^gate path: apps\/care\/a\.ts \(\+1 more\)$/)
    assert.match(why(pr(), ctx({ deps: ['left-pad', 'zod'] }))[0], /^new dependency: left-pad, zod$/)
    assert.deepEqual(why(pr(), ctx({ repoNeeds: true })), ['repo needs your review'])
    assert.equal(why(pr({ reviewDecision: 'REVIEW_REQUIRED', files: [{ path: 'scripts/stripe-x.mjs' }] })).length, 2)
  })

  it('his approval at the head lifts the gate; a push after it puts the PR back; his change request removes it', () => {
    const review = (state, oid, at = '2026-11-17T10:00:00Z') => ({ author: { login: 'robin' }, state, commit: { oid }, submittedAt: at })
    const gated = { files: [{ path: 'apps/care/a.ts' }] }
    assert.equal(why(pr({ ...gated, reviews: [review('APPROVED', HEAD)] })), undefined)
    assert.match(why(pr({ ...gated, reviews: [review('APPROVED', 'b'.repeat(40))] }))[0], /gate path/, 'approved an older commit')
    assert.match(why(pr({ ...gated, reviews: [review('APPROVED', HEAD), review('CHANGES_REQUESTED', HEAD, '2026-11-17T11:00:00Z')] })) ?? 'gone', /gone/)
    assert.match(why(pr({ ...gated, reviews: [review('CHANGES_REQUESTED', HEAD), review('APPROVED', HEAD, '2026-11-17T12:00:00Z')] }))?.[0] ?? 'gone', /gone/)
  })

  it('a PR from any agent account counts, never one by a code owner of the repo (his own)', () => {
    assert.ok(why(pr({ reviewDecision: 'REVIEW_REQUIRED', author: { login: 'another-agent' } })), 'not only the board’s own login')
    assert.deepEqual(why(pr({ reviewDecision: 'REVIEW_REQUIRED', files: [{ path: 'apps/care/a.ts' }], author: { login: 'another-agent' } })).length, 2)
    assert.equal(why(pr({ reviewDecision: 'REVIEW_REQUIRED', author: { login: 'robin' } })), undefined, 'a code owner’s own PR')
    assert.equal(why(pr({ reviewDecision: 'REVIEW_REQUIRED', author: { login: 'robin' } }), ctx({ codeowners: [], owner: 'robin' })), undefined, 'the named owner’s own PR')
  })

  it('a draft that waits is flagged, also while its task still reads working (the row says so)', () => {
    const draft = pr({ isDraft: true, reviewDecision: 'REVIEW_REQUIRED' })
    assert.equal(judge(draft, repo, ctx()).draft, true, 'no task: left behind')
    assert.equal(judge(draft, repo, ctx({ task: { id: 'web/1', state: 'idle', stage: 'after' } })).draft, true)
    const busy = judge(draft, repo, ctx({ task: { id: 'web/1', state: 'working', stage: 'working' } }))
    assert.deepEqual([busy.draft, busy.agentWorking], [true, true], 'its note may say it waits for him, whatever the board state')
    assert.equal(judge(draft, repo, ctx()).agentWorking, false)
    assert.equal(judge(pr({ isDraft: true }), repo, ctx()), null, 'a draft that would not wait is not flagged')
  })

  it('carries the full URL, title, repo, age, why, CI and the sentences (body first, then the task report)', () => {
    const body = 'What it does.\n\nfor robin: Adds a button. It could double-charge. Revert it.\n'
    const it = judge(pr({ body, files: [{ path: 'apps/care/a.ts' }], statusCheckRollup: [{ name: 'tests', status: 'COMPLETED', conclusion: 'FAILURE' }] }), repo, ctx({ owner: 'robin' }))
    assert.equal(it.url, URL1)
    assert.deepEqual([it.key, it.repo, it.title, it.ci, it.ciFailing], ['web#7', 'web', 'feat(web): a thing', 'failing', ['tests']])
    assert.equal(it.sentences, 'Adds a button. It could double-charge. Revert it.')
    assert.equal(it.at, NOW - 3 * 3600 * 1000)
    assert.deepEqual(it.links, [{ url: URL1, label: 'Pull request' }])
    const fromReport = judge(pr({ reviewDecision: 'REVIEW_REQUIRED' }), repo, ctx({ owner: 'robin', report: 'GATE ADVICE OK\nfor robin: One. Two. Three.\n' }))
    assert.equal(fromReport.sentences, 'One. Two. Three.')
  })

  it('a skip holds until the head or the reasons change', () => {
    const a = judge(pr({ reviewDecision: 'REVIEW_REQUIRED' }), repo, ctx()).hash
    assert.equal(judge(pr({ reviewDecision: 'REVIEW_REQUIRED' }), repo, ctx()).hash, a)
    assert.notEqual(judge(pr({ reviewDecision: 'REVIEW_REQUIRED', headRefOid: 'c'.repeat(40) }), repo, ctx()).hash, a)
  })
})

describe('collecting across repos', () => {
  const remotes = { '/r/web': 'ssh://github.com/acme/web.git', '/r/api': 'https://github.com/acme/api.git', '/r/tmp': '' }
  const base = { repos: [{ name: 'web', root: '/r/web' }, { name: 'api', root: '/r/api' }, { name: 'tmp', root: '/r/tmp' }], remote: (r) => remotes[r], agents: ['lucy-bot'] }

  it('asks gh per repo, reads CODEOWNERS once, skips a repo without a GitHub remote, and says what failed', async () => {
    const calls = []
    const gh = async (args) => {
      calls.push(args.join(' '))
      if (args[0] === 'pr') {
        if (args.includes('acme/api')) throw new Error('gh: HTTP 502\nmore')
        return JSON.stringify([pr({ files: [{ path: 'apps/care/a.ts' }, { path: 'package.json' }] }), pr({ number: 8, url: `${URL1}8`, reviewDecision: 'REVIEW_REQUIRED', createdAt: new Date(NOW - 9 * 3600 * 1000).toISOString() })])
      }
      if (args.at(-1).includes('CODEOWNERS')) return '/apps/care/ @robin\n'
      if (args.at(-1).includes('package.json?ref=main')) return '{"dependencies":{}}'
      if (args.at(-1).includes('package.json?ref=')) return '{"dependencies":{"left-pad":"1"}}'
      throw new Error('unexpected')
    }
    const r = await collectPrs({ ...base, gh })
    assert.deepEqual(r.items.map((i) => i.number), [8, 7], 'oldest first')
    assert.match(r.items[1].why.join(), /gate path: apps\/care\/a\.ts/)
    assert.match(r.items[1].why.join(), /new dependency: left-pad/)
    assert.deepEqual(r.errors, ['api: gh: HTTP 502'])
    assert.equal(calls.filter((c) => c.includes('CODEOWNERS')).length, 1, 'once per repo')
    assert.ok(!calls.some((c) => c.includes('tmp')))
    assert.ok(calls.every((c) => !c.includes('--draft')), 'drafts are asked for too: they get flagged')
  })

  it('a draft is listed with its board task, whether the task is idle or still working', async () => {
    const gh = async (args) => (args[0] === 'pr' ? JSON.stringify([pr({ isDraft: true, reviewDecision: 'REVIEW_REQUIRED' })]) : (() => { throw new Error('none') })())
    const idle = await collectPrs({ ...base, repos: [base.repos[0]], gh, rows: [{ id: 'web/1', pr: URL1, state: 'idle', stage: 'after' }] })
    assert.equal(idle.items[0].draft, true)
    assert.equal(idle.items[0].task, 'web/1')
    const busy = await collectPrs({ ...base, repos: [base.repos[0]], gh, rows: [{ id: 'web/1', pr: URL1, state: 'working', stage: 'working' }] })
    assert.deepEqual([busy.items[0].draft, busy.items[0].agentWorking], [true, true])
  })

  it('reads the full file list of a PR gh cut at 100 files, and says when it cannot', async () => {
    const hundred = Array.from({ length: 100 }, (_, i) => ({ path: `src/f${i}.ts` }))
    const make = (full) => async (args) => {
      if (args[0] === 'pr') return JSON.stringify([pr({ files: hundred })])
      if (args.at(-3)?.includes('/files')) {
        if (!full) throw new Error('boom')
        return [...hundred.map((f) => f.path), 'apps/care/late.ts'].join('\n')
      }
      if (args.at(-1).includes('CODEOWNERS')) return '/apps/care/ @robin\n'
      throw new Error('none')
    }
    const ok = await collectPrs({ ...base, repos: [base.repos[0]], gh: make(true) })
    assert.match(ok.items[0].why.join(), /gate path: apps\/care\/late\.ts/, 'a gate path past the 100th file')
    const cut = await collectPrs({ ...base, repos: [base.repos[0]], gh: make(false) })
    assert.deepEqual(cut.errors, ['web#7: only the first 100 files were read'])
  })

  it('AGENT_KIT_REVIEW_REPOS puts every PR of a repo on the list', async () => {
    const gh = async (args) => {
      if (args[0] === 'pr') return JSON.stringify([pr()])
      throw new Error('none')
    }
    const r = await collectPrs({ ...base, repos: [base.repos[0]], gh, env: { AGENT_KIT_REVIEW_REPOS: 'web' } })
    assert.deepEqual(r.items[0].why, ['repo needs your review'])
  })

  it('reads a GitHub slug from either remote form', () => {
    assert.equal(slugOf('ssh://github.com/acme/web.git\n'), 'acme/web')
    assert.equal(slugOf('https://github.com/acme/web'), 'acme/web')
    assert.equal(slugOf('https://gitlab.com/acme/web.git'), null)
  })
})

describe('the screen: PRs next to designs', () => {
  const design = { id: 'web/1', key: 'WEB-1', repo: 'web', kind: 'design', title: 'A settings screen', at: NOW - 12 * 60000, brief: 'Brief', msg: '', links: [], planLink: '', reportLink: '' }
  const prItem = (over = {}) =>
    judge(pr({ body: 'for robin: Adds a button. It could double-charge. Revert it.', reviewDecision: 'REVIEW_REQUIRED', files: [{ path: 'apps/care/a.ts' }], ...over }), repo, ctx({ owner: 'robin' }))
  const text = (state, cols = 70, rows = 40) => render({ now: NOW, ...state }, cols, rows).map((l) => l.t).join('\n')

  it('one list, newest first: the design and the PR, each with its kind, product and age', () => {
    const t = text({ items: [design, prItem()], sel: 0 })
    assert.match(t, /Review list · 2 waiting \(1 on GitHub\)/)
    assert.ok(t.indexOf('design web') < t.indexOf('GitHub web'))
    assert.match(t, /GitHub web +3h  feat\(web\): a thing/)
  })

  it('a PR’s detail: whole URL on its own line, repo, age, why, CI, the sentences, and that approval is on GitHub', () => {
    for (const cols of [36, 70, 120]) {
      const lines = render({ items: [prItem()], sel: 0, now: NOW }, cols, 40)
      const url = lines.filter((l) => l.url === URL1)
      assert.equal(url.map((l) => l.t).join(''), URL1, `${cols} columns: the whole URL, nothing added`)
      assert.ok(lines.every((l) => l.t.length <= cols))
    }
    const t = text({ items: [prItem()], sel: 0 })
    assert.match(t, /web#7 · web · open 3h/)
    assert.match(t, /- review required/)
    assert.match(t, /- gate path: apps\/care\/a\.ts/)
    assert.match(t, /CI green/)
    assert.match(t, /Adds a button\. It could double-charge\. Revert it\./)
    assert.match(t, /Approval stays on GitHub/)
    assert.doesNotMatch(t, /approve \+ build/, 'no approve key for a PR')
    assert.match(t, /open the PR in the browser/)
  })

  it('says what is missing: no sentences, failing CI, a draft to mark ready', () => {
    const t = text({ items: [prItem({ body: '', isDraft: true, statusCheckRollup: [{ name: 'tests', status: 'COMPLETED', conclusion: 'FAILURE' }] })], sel: 0 })
    assert.match(t, /No gate-reviewer sentences/)
    assert.match(t, /CI failing: tests/)
    assert.match(t, /DRAFT/)
    assert.match(t, /Mark it ready/)
    assert.match(t, / draft /)
  })

  it('a draft whose task still reads working says so in its detail', () => {
    const it = judge(pr({ isDraft: true, reviewDecision: 'REVIEW_REQUIRED' }), repo, ctx({ task: { id: 'web/1', state: 'working', stage: 'working' } }))
    assert.match(text({ items: [it], sel: 0 }, 120).replace(/\s+/g, ' '), /still reads "working" on the board/)
  })

  it('says when the PR section is still loading or incomplete, and "nothing" only when both are empty', () => {
    assert.match(text({ items: [design], sel: 0, prNote: 'PRs: loading from GitHub…' }), /loading from GitHub/)
    assert.match(text({ items: [design], sel: 0, prNote: 'PRs incomplete: api: HTTP 502' }), /PRs incomplete: api: HTTP 502/)
    assert.match(text({ items: [], sel: 0 }), /Nothing waits for you: no spec, design, result or PR/)
    assert.doesNotMatch(text({ items: [], sel: 0, prNote: 'PRs: loading from GitHub…' }), /Nothing waits for you/)
  })
})

describe('the pane keys on a PR', () => {
  const it0 = judge(pr({ reviewDecision: 'REVIEW_REQUIRED' }), repo, ctx())
  const state = () => ({ items: [it0], sel: 0, scroll: 0, mode: 'list', input: '', status: '' })
  const acts = () => {
    const log = []
    return { log, review: () => (log.push('review'), { ok: true }), approve: () => log.push('approve'), back: () => (log.push('back'), { ok: true }), open: (u) => log.push(['open', u]), copy: (u) => log.push(['copy', u]), skip: () => log.push('skip'), board() {}, refresh() {}, quit() {} }
  }
  const press = (s, a, ...ks) => ks.flatMap((k) => keys(k)).forEach((k) => onKey(s, k, a))

  it('Enter, 1 and o open it in the browser, y 1 copies the whole URL', () => {
    const s = state()
    const a = acts()
    press(s, a, '\r', '1', 'o', 'y', '1')
    assert.deepEqual(a.log, [['open', URL1], ['open', URL1], ['open', URL1], ['copy', URL1]])
  })

  it('nothing approves from the pane: a, b and f only say where approval is', () => {
    const s = state()
    const a = acts()
    press(s, a, 'a')
    assert.equal(s.mode, 'list', 'no confirm question')
    assert.match(s.status, /approved on GitHub/)
    press(s, a, 'b', 'f')
    assert.equal(s.mode, 'list')
    assert.deepEqual(a.log, [])
  })

  it('s skips it', () => {
    const a = acts()
    press(state(), a, 's')
    assert.deepEqual(a.log, ['skip'])
  })
})

describe('agent-kit review prs (the CLI against a fake gh)', () => {
  function setup(t, { prs, files = {}, task = null, readme = '', ghFails = false } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'prs-'))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    mkdirSync(join(dir, 'bin'))
    writeFileSync(join(dir, 'prs.json'), JSON.stringify(prs))
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, 'files', p)), { recursive: true })
      writeFileSync(join(dir, 'files', p), text)
    }
    writeFileSync(
      join(dir, 'bin', 'gh'),
      `#!/bin/sh\necho "$*" >> "${dir}/gh.log"\nif [ "$1" = pr ] && [ -n "${ghFails ? 1 : ""}" ]; then echo "gh: HTTP 502" >&2; exit 1; fi\nif [ "$1" = pr ]; then cat "${dir}/prs.json"; exit 0; fi\nif [ "$1" = api ]; then p="\${4#repos/*/*/contents/}"; p="\${p%%\\?*}"; [ -f "${dir}/files/$p" ] && { cat "${dir}/files/$p"; exit 0; }; fi\nexit 1\n`,
    )
    chmodSync(join(dir, 'bin', 'gh'), 0o755)
    copyFileSync(FAKE_BOARD, join(dir, 'board.mjs'))
    chmodSync(join(dir, 'board.mjs'), 0o755)
    writeFileSync(join(dir, 'board.json'), JSON.stringify({ list: task ? [task] : [], details: {} }))
    const data = join(dir, 'data')
    const web = join(dir, 'web')
    mkdirSync(join(data, 'tasks', 'web', '1'), { recursive: true })
    mkdirSync(web)
    spawnSync('git', ['init', '-q'], { cwd: web })
    spawnSync('git', ['remote', 'add', 'origin', 'ssh://github.com/acme/web.git'], { cwd: web })
    writeFileSync(join(data, 'repos.json'), JSON.stringify({ web, tmp: '/nonexistent/tmp' }))
    writeFileSync(join(data, 'gh-user.json'), JSON.stringify({ login: 'lucy-bot' }))
    if (readme) writeFileSync(join(data, 'tasks', 'web', '1', 'closing-note.md'), readme)
    return (...a) =>
      spawnSync(process.execPath, [KIT, 'review', ...a], {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, HERDR_PROJECTS_BIN: join(dir, 'board.mjs'), HERDR_PROJECTS_DATA_DIR: data, XDG_STATE_HOME: join(dir, 'state'), FAKE_BOARD_DIR: dir },
      })
  }

  it('prints each PR with its whole URL, why, CI and sentences, and flags a draft', (t) => {
    const run = setup(t, {
      prs: [
        pr({ files: [{ path: 'apps/care/a.ts' }], body: 'for robin: Adds a form. It could leak. Revert.\n' }),
        pr({ number: 9, url: 'https://github.com/acme/web/pull/9', isDraft: true, reviewDecision: 'REVIEW_REQUIRED', createdAt: new Date(NOW - 86400000).toISOString() }),
        pr({ number: 10, url: 'https://github.com/acme/web/pull/10', author: { login: 'robin' }, reviewDecision: 'REVIEW_REQUIRED' }),
      ],
      files: { '.github/CODEOWNERS': '* @robin\n/apps/care/ @robin\n' },
      task: { id: 'web/1', state: 'idle', stage: 'after', pr: 'https://github.com/acme/web/pull/9' },
    })
    const r = run('prs')
    assert.equal(r.status, 0, r.stderr)
    assert.ok(r.stdout.includes(URL1), 'the whole URL')
    assert.match(r.stdout, /why: gate path: apps\/care\/a\.ts\. CI green\./)
    assert.match(r.stdout, /Adds a form\. It could leak\. Revert\./)
    assert.match(r.stdout, /pull\/9\n  DRAFT, mark it ready\. why: review required/)
    assert.ok(!r.stdout.includes('pull/10'), 'his own PR does not wait for him')
    const json = JSON.parse(run('prs', '--json').stdout)
    assert.deepEqual(json.items.map((i) => i.number).sort(), [7, 9])
    assert.deepEqual(json.errors, [])
    const list = JSON.parse(run('list', '--json').stdout)
    assert.deepEqual([list.designs.length, list.prs.length], [0, 2])
  })

  it('says it when GitHub does not answer, instead of "no PR waits"', (t) => {
    const run = setup(t, { prs: [], ghFails: true })
    const r = run('prs')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /PRs not read: web: /)
    assert.doesNotMatch(r.stdout, /No PR waits/)
    const list = run('list')
    assert.match(list.stderr, /PRs incomplete: web: /)
    assert.match(list.stdout, /Nothing waits for you/)
  })
})
