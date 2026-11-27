import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  annotateArgs,
  changeDocument,
  detach,
  detachedShell,
  exitCodeFor,
  INSTALLER_SHA256,
  INSTALLER_URL,
  isChange,
  parseVersion,
  PLANNOTATOR_VERSION,
  planTitle,
  REAPED_HINT,
  shiftHeadings,
  tailnetAddress,
  tailnetReady,
  wasReaped,
  withoutDetach,
  withPinnedMarketplace,
  withTailscale,
} from '../src/lib/plan-review.mjs'

test('a review is gated, strict and published to the result file', () => {
  const args = annotateArgs('/r/plan.md', { remote: true, resultFile: '/tmp/d.json', title: 'Broker-MVP' })
  assert.deepEqual(args, [
    'annotate',
    '/r/plan.md',
    '--gate',
    '--json',
    '--require-approval',
    '--result-file',
    '/tmp/d.json',
    '--title',
    'Broker-MVP',
    '--tailscale',
  ])
})

test('without remote the review is not published', () => {
  const args = annotateArgs('/r/plan.md', { remote: false, resultFile: '/tmp/d.json' })
  assert.equal(args.includes('--tailscale'), false)
  assert.equal(args.includes('--title'), false)
})

test('the version is read from the CLI banner', () => {
  assert.equal(parseVersion('plannotator 0.29.3\n'), '0.29.3')
  assert.equal(parseVersion('plannotator v1.2.0'), '1.2.0')
  assert.equal(parseVersion(''), null)
})

test('the title is the plan frontmatter name, else the fallback', () => {
  assert.equal(planTitle('---\nname: Broker MVP for sales\nisProject: false\n---\nbody', 'x.md'), 'Broker MVP for sales')
  assert.equal(planTitle('---\nname: "Quoted: name"\n---\n', 'x.md'), 'Quoted: name')
  assert.equal(planTitle('# no frontmatter', 'x.md'), 'x.md')
})

test('the title is read only from a leading frontmatter block', () => {
  assert.equal(planTitle('# Plan\n\n---\nname: Later block\n---\n', 'x.md'), 'x.md')
  assert.equal(planTitle('---\nisProject: false\n---\nname: in the body\n', 'x.md'), 'x.md')
  assert.equal(planTitle('---\nname: Ohne Body\n---', 'x.md'), 'Ohne Body')
})

test('the exit code follows the decision in the result file', () => {
  assert.equal(exitCodeFor('{"decision":"approved"}\n', 0), 0)
  assert.equal(exitCodeFor('{"decision":"approved","feedback":"Notiz"}', 0), 0)
  assert.equal(exitCodeFor('{"decision":"annotated","feedback":"Bitte ändern"}', 1), 1)
  assert.equal(exitCodeFor('{"decision":"dismissed"}', 1), 3)
})

test('a missing or unreadable decision, or a failed run, is exit 2', () => {
  assert.equal(exitCodeFor(null, 1), 2)
  assert.equal(exitCodeFor('', 1), 2)
  assert.equal(exitCodeFor('not json', 0), 2)
  assert.equal(exitCodeFor('{"decision":"denied"}', 1), 2)
  assert.equal(exitCodeFor(null, 2), 2)
  assert.equal(exitCodeFor('{"decision":"approved"}', null), 2)
})

test('the installer is the pinned tag on GitHub with a pinned hash', () => {
  assert.equal(INSTALLER_URL, `https://raw.githubusercontent.com/backnotprop/plannotator/v${PLANNOTATOR_VERSION}/scripts/install.sh`)
  assert.match(INSTALLER_SHA256, /^[0-9a-f]{64}$/)
})

test('the plannotator config turns on the tailnet and keeps every other key', () => {
  assert.deepEqual(JSON.parse(withTailscale(null)), { tailscale: true })
  assert.deepEqual(JSON.parse(withTailscale('  ')), { tailscale: true })
  assert.deepEqual(JSON.parse(withTailscale('{"share":"disabled","tailscale":false}')), { share: 'disabled', tailscale: true })
  assert.throws(() => withTailscale('{broken'))
})

test('the marketplace is pinned to the release tag only where it already exists', () => {
  const settings = {
    model: 'opus',
    enabledPlugins: { 'plannotator@plannotator': true },
    extraKnownMarketplaces: {
      other: { source: { source: 'github', repo: 'a/b' } },
      plannotator: { source: { source: 'github', repo: 'backnotprop/plannotator', ref: 'v0.1.0' } },
    },
  }
  const pinned = JSON.parse(withPinnedMarketplace(JSON.stringify(settings), '0.29.3'))
  assert.deepEqual(pinned.extraKnownMarketplaces.plannotator.source, {
    source: 'github',
    repo: 'backnotprop/plannotator',
    ref: 'v0.29.3',
  })
  assert.deepEqual(pinned.extraKnownMarketplaces.other, settings.extraKnownMarketplaces.other)
  assert.deepEqual(pinned.enabledPlugins, settings.enabledPlugins)
  assert.equal(pinned.model, 'opus')

  const without = JSON.stringify({ enabledPlugins: { 'x@y': true }, extraKnownMarketplaces: { other: {} } })
  assert.equal(withPinnedMarketplace(without, '0.29.3'), without)
  assert.equal(withPinnedMarketplace('{}', '0.29.3'), '{}')
})

test('the tailnet is ready only when running with an HTTPS certificate domain', () => {
  assert.equal(tailnetReady(JSON.stringify({ BackendState: 'Running', CertDomains: ['levi.tail0.ts.net'] })), true)
  assert.equal(tailnetReady(JSON.stringify({ BackendState: 'Running', CertDomains: null })), false)
  assert.equal(tailnetReady(JSON.stringify({ BackendState: 'NeedsLogin', CertDomains: ['x'] })), false)
  assert.equal(tailnetReady(null), false)
  assert.equal(tailnetReady('not json'), false)
})

test('--detach and its prefix leave the command line, wherever they stand', () => {
  assert.deepEqual(withoutDetach(['plan.md', '--detach', '/tmp/r']), { prefix: '/tmp/r', argv: ['plan.md'] })
  assert.deepEqual(withoutDetach(['--detach', '/tmp/r', 'plan.md']), { prefix: '/tmp/r', argv: ['plan.md'] })
  assert.deepEqual(withoutDetach(['plan.md']), { prefix: null, argv: ['plan.md'] })
})

test('--detach without a prefix is refused', () => {
  assert.throws(() => withoutDetach(['plan.md', '--detach']), /needs a path prefix/)
  assert.throws(() => withoutDetach(['--detach', '--notes', 'n.md']), /needs a path prefix/)
})

test('the address is read from Plannotator output', () => {
  const err = 'Plannotator running\nReview at https://mac-mini.tail1a2b.ts.net:43123/ (tailnet only)\n'
  assert.equal(tailnetAddress(err), 'https://mac-mini.tail1a2b.ts.net:43123/')
  assert.equal(tailnetAddress('open https://mac-mini.tail1a2b.ts.net:8443'), 'https://mac-mini.tail1a2b.ts.net:8443')
  assert.equal(tailnetAddress('listening on http://127.0.0.1:43123'), null)
  assert.equal(tailnetAddress(''), null)
  assert.equal(tailnetAddress(null), null)
})

test('the detached shell carries the prefix and the command as arguments, not as shell text', () => {
  const args = detachedShell('/tmp/$(x)', ['node', 'a b.mjs'])
  assert.equal(args[0], '-c')
  assert.equal(args[1].includes('/tmp'), false)
  assert.deepEqual(args.slice(2), ['sh', '/tmp/$(x)', 'node', 'a b.mjs'])
})

test('the detached shell records the pid at start and the exit code at the end', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detach-test-'))
  try {
    const prefix = path.join(dir, 'r $(touch pwned)')
    const run = spawnSync('sh', detachedShell(prefix, [process.execPath, '-e', 'process.exit(3)']))
    assert.equal(run.status, 0)
    assert.match(fs.readFileSync(`${prefix}.pid`, 'utf8'), /^\d+\n$/)
    assert.equal(fs.readFileSync(`${prefix}.exit`, 'utf8'), '3\n')
    assert.equal(fs.existsSync(path.join(dir, 'pwned')), false)
    assert.equal(fs.existsSync('pwned'), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

/** A temp dir with `review.mjs` holding `body`, the prefix to detach it to, and a cleanup. */
function detachFixture(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detach-run-'))
  const script = path.join(dir, 'review.mjs')
  fs.writeFileSync(script, body)
  const prefix = path.join(dir, 'r')
  const killGroup = () => {
    const pid = Number.parseInt(fs.existsSync(`${prefix}.pid`) ? fs.readFileSync(`${prefix}.pid`, 'utf8') : '', 10)
    if (pid > 0 && pid !== process.pid) {
      try {
        process.kill(-pid, 'SIGKILL')
      } catch {}
    }
  }
  return { script, prefix, cleanup: () => (killGroup(), fs.rmSync(dir, { recursive: true, force: true })) }
}

const SLEEP = 'setTimeout(() => {}, 60_000)\n'

test('detach returns 0 once the address is on stderr, and the review keeps running', async () => {
  const { script, prefix, cleanup } = detachFixture(`console.error('ready: https://m.t.ts.net:8443/')\n${SLEEP}`)
  try {
    assert.equal(await detach(script, [], prefix, { deadlineMs: 10_000 }), 0)
    const pid = Number.parseInt(fs.readFileSync(`${prefix}.pid`, 'utf8'), 10)
    assert.doesNotThrow(() => process.kill(pid, 0))
    assert.equal(fs.existsSync(`${prefix}.exit`), false)
  } finally {
    cleanup()
  }
})

test('detach returns the code of a command that ends without an address', async () => {
  const { script, prefix, cleanup } = detachFixture("console.error('nothing to review')\nprocess.exit(5)\n")
  try {
    assert.equal(await detach(script, [], prefix, { deadlineMs: 10_000 }), 5)
    assert.equal(fs.readFileSync(`${prefix}.exit`, 'utf8'), '5\n')
  } finally {
    cleanup()
  }
})

test('detach returns 2 when the command ended and left no exit code', async () => {
  // The script kills the shell that would write <prefix>.exit.
  const { script, prefix, cleanup } = detachFixture("process.kill(process.ppid, 'SIGKILL')\n")
  try {
    assert.equal(await detach(script, [], prefix, { deadlineMs: 10_000 }), 2)
    assert.equal(fs.existsSync(`${prefix}.exit`), false)
  } finally {
    cleanup()
  }
})

test('detach returns 4 at the deadline and leaves the command running', async () => {
  const { script, prefix, cleanup } = detachFixture(SLEEP)
  try {
    assert.equal(await detach(script, [], prefix, { deadlineMs: 500 }), 4)
    const pid = Number.parseInt(fs.readFileSync(`${prefix}.pid`, 'utf8'), 10)
    assert.doesNotThrow(() => process.kill(pid, 0))
  } finally {
    cleanup()
  }
})

test('detach refuses a prefix whose review still runs, and leaves its files alone', async () => {
  const { script, prefix, cleanup } = detachFixture(SLEEP)
  try {
    fs.writeFileSync(`${prefix}.pid`, `${process.pid}\n`)
    fs.writeFileSync(`${prefix}.err`, 'the running review\n')
    assert.equal(await detach(script, [], prefix, { deadlineMs: 500 }), 2)
    assert.equal(fs.readFileSync(`${prefix}.err`, 'utf8'), 'the running review\n')
  } finally {
    cleanup()
  }
})

test('detach names the fallback when the last review on the prefix was reaped', async () => {
  const { script, prefix, cleanup } = detachFixture("console.error('ready: https://m.t.ts.net:8443/')\n" + SLEEP)
  const errors = []
  const error = console.error
  console.error = (line) => errors.push(line)
  try {
    fs.writeFileSync(`${prefix}.pid`, '999999\n')
    assert.equal(wasReaped(path.resolve(prefix)), true)
    assert.equal(await detach(script, [], prefix, { deadlineMs: 10_000 }), 0)
    assert.ok(errors.includes(REAPED_HINT))
    assert.match(REAPED_HINT, /without --detach as a tracked background task/)
  } finally {
    console.error = error
    cleanup()
  }
})

test('a review that ended with an exit code was not reaped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reaped-'))
  try {
    const base = path.join(dir, 'r')
    assert.equal(wasReaped(base), false)
    fs.writeFileSync(`${base}.pid`, '999999\n')
    fs.writeFileSync(`${base}.exit`, '0\n')
    assert.equal(wasReaped(base), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('headings move one level down, outside code fences only, never past six', () => {
  assert.equal(shiftHeadings('# A\n## B\n###### F\n#nope'), '## A\n### B\n###### F\n#nope')
  assert.equal(shiftHeadings('```md\n# kept\n```\n# moved'), '```md\n# kept\n```\n## moved')
  assert.equal(shiftHeadings('````\n```\n# kept\n````\n# moved'), '````\n```\n# kept\n````\n## moved')
})

/** An OpenSpec change folder from `files` (relative path → text), and a cleanup. */
function changeFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'change-'))
  const dir = path.join(root, 'singing-bowl-end')
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), text)
  }
  return { dir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

const SCORE = '**Value 7/10 · Complexity 4/10**\nMeans: a core job gets better.\n'

test('a change is one document: proposal, each spec, design, tasks, titled with its id', () => {
  const { dir, cleanup } = changeFixture({
    'tasks.md': '## 1. Build\n- [ ] 1.1 Sound\n',
    'design.md': '## Decisions\nA bowl, not a bell.\n',
    'specs/timer/spec.md': '## ADDED Requirements\n\n### Requirement: Bowl\n',
    'specs/audio/spec.md': '## MODIFIED Requirements\n',
    'proposal.md': `${SCORE}\n## Why\nPeople stop the timer by hand.\n`,
  })
  try {
    assert.equal(isChange(dir), true)
    const { title, markdown } = changeDocument(dir)
    assert.equal(title, 'singing-bowl-end')
    assert.equal(
      markdown,
      [
        '# singing-bowl-end',
        '',
        '## Proposal',
        '',
        '**Value 7/10 · Complexity 4/10**',
        'Means: a core job gets better.',
        '',
        '### Why',
        'People stop the timer by hand.',
        '',
        '## Spec: audio',
        '',
        '### MODIFIED Requirements',
        '',
        '## Spec: timer',
        '',
        '### ADDED Requirements',
        '',
        '#### Requirement: Bowl',
        '',
        '## Design',
        '',
        '### Decisions',
        'A bowl, not a bell.',
        '',
        '## Tasks',
        '',
        '### 1. Build',
        '- [ ] 1.1 Sound',
        '',
      ].join('\n'),
    )
  } finally {
    cleanup()
  }
})

test('a change without design or specs is still reviewed, without those sections', () => {
  const { dir, cleanup } = changeFixture({ 'proposal.md': `${SCORE}\n## Why\nx\n`, 'tasks.md': '- [ ] 1.1 x\n' })
  try {
    const { markdown } = changeDocument(dir)
    assert.doesNotMatch(markdown, /## Design|## Spec:/)
    assert.match(markdown, /## Tasks/)
  } finally {
    cleanup()
  }
})

test('a proposal that does not open with the value-score lines is refused', () => {
  const { dir, cleanup } = changeFixture({ 'proposal.md': '## Why\nx\n' })
  try {
    assert.throws(() => changeDocument(dir), /value-score/)
  } finally {
    cleanup()
  }
})

test('a folder without proposal.md is not a change', () => {
  const { dir, cleanup } = changeFixture({ 'tasks.md': 'x' })
  try {
    assert.equal(isChange(dir), false)
    assert.equal(isChange(path.join(dir, 'tasks.md')), false)
    assert.equal(isChange(path.join(dir, 'missing')), false)
  } finally {
    cleanup()
  }
})
