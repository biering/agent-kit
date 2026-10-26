import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { matchesColumn, parseArgs, summarizeColumns } from './field-usage.mjs'

describe('matchesColumn', () => {
  it('matches snake_case identifiers', () => {
    assert.equal(matchesColumn('profile.birthday = x', 'birthday'), true)
    assert.equal(matchesColumn("select('birthday')", 'birthday'), true)
    assert.equal(matchesColumn('birthdays = 1', 'birthday'), false)
    assert.equal(matchesColumn('my_birthday', 'birthday'), false)
  })

  it('matches quoted keys', () => {
    assert.equal(matchesColumn('{ "portfolio_size": "none" }', 'portfolio_size'), true)
  })
})

describe('summarizeColumns', () => {
  const root = mkdtempSync(join(tmpdir(), 'field-usage-'))
  mkdirSync(join(root, 'db/migrations'), { recursive: true })
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'db/migrations/001.sql'), 'alter table p add column birthday date;')
  writeFileSync(join(root, 'db/migrations/002.sql'), 'alter table p add column seniority text;')
  writeFileSync(join(root, 'src/profile.ts'), "select('seniority')")

  it('treats migration-only columns as unread', () => {
    const [birthday, seniority] = summarizeColumns(['birthday', 'seniority'], { root })
    assert.equal(birthday.unread, true)
    assert.deepEqual(birthday.definitions, ['db/migrations/001.sql'])
    assert.equal(seniority.unread, false)
    assert.deepEqual(seniority.readers, ['src/profile.ts'])
  })

  it('honours extra definition patterns', () => {
    const { definitions } = parseArgs(['--definitions', '^src/', 'seniority'])
    const [seniority] = summarizeColumns(['seniority'], { root, definitions })
    assert.equal(seniority.unread, true)
  })
})
