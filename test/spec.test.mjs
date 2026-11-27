import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { OPENSPEC_ENV, OPENSPEC_VERSION, openTasks } from '../src/lib/spec.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const kit = path.join(root, 'bin', 'agent-kit.mjs')

test('open tasks are the unticked boxes, outside code fences', () => {
  const tasks = '## 1. Build\n- [x] 1.1 Done\n- [ ] 1.2 Open\n  * [ ] 1.3 Nested\n```md\n- [ ] example\n```\n- [X] 1.4 Done too\n'
  assert.deepEqual(openTasks(tasks), ['- [ ] 1.2 Open', '* [ ] 1.3 Nested'])
  assert.deepEqual(openTasks('- [x] all done\n'), [])
})

test('every OpenSpec call runs without telemetry or the update check', () => {
  assert.deepEqual(OPENSPEC_ENV, { OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_UPDATE_CHECK: '1' })
})

test('the skill and the rule pin the same OpenSpec release, exactly, and archive through the kit', () => {
  for (const file of ['skills/spec/SKILL.md', 'rules/spec-review.md']) {
    const text = read(file)
    assert.match(text, new RegExp(`@fission-ai/openspec@${OPENSPEC_VERSION.replaceAll('.', '\\.')}`), file)
    assert.match(text, /agent-kit(?:\.mjs)? spec archive/, file)
    assert.doesNotMatch(text, /npx openspec archive/, file)
    assert.match(text, /--tools none/, file)
  }
})

/** A repo with one change whose tasks.md is `tasks`, and a fake `npx` that records its arguments. */
function repo(tasks) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-archive-'))
  const change = path.join(dir, 'openspec', 'changes', 'bowl')
  fs.mkdirSync(change, { recursive: true })
  if (tasks !== null) fs.writeFileSync(path.join(change, 'tasks.md'), tasks)
  const bin = path.join(dir, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'npx'), '#!/bin/sh\necho "$OPENSPEC_TELEMETRY $OPENSPEC_NO_UPDATE_CHECK $*" > "$PWD/npx.log"\n', { mode: 0o755 })
  const run = (...args) =>
    spawnSync(process.execPath, [kit, 'spec', 'archive', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
  const log = () => (fs.existsSync(path.join(dir, 'npx.log')) ? fs.readFileSync(path.join(dir, 'npx.log'), 'utf8').trim() : null)
  return { run, log, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) }
}

test('archive refuses a change with an unticked task and never calls openspec', () => {
  const { run, log, cleanup } = repo('- [x] 1.1 a\n- [ ] 1.2 b\n')
  try {
    const result = run('bowl')
    assert.equal(result.status, 1)
    assert.match(result.stderr, /1 unticked task/)
    assert.match(result.stderr, /1\.2 b/)
    assert.equal(log(), null)
  } finally {
    cleanup()
  }
})

test('archive refuses a change without tasks.md', () => {
  const { run, log, cleanup } = repo(null)
  try {
    assert.equal(run('bowl').status, 1)
    assert.equal(log(), null)
  } finally {
    cleanup()
  }
})

test('archive runs the repo\'s openspec with --yes and telemetry off once every task is ticked', () => {
  const { run, log, cleanup } = repo('- [x] 1.1 a\n')
  try {
    assert.equal(run('bowl', '--skip-specs').status, 0)
    assert.equal(log(), '0 1 --no-install openspec archive bowl --yes --skip-specs')
  } finally {
    cleanup()
  }
})
