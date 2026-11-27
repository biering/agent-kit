// The review list as a Herdr desktop app mod (herdr-app/review-list, README "Herdr desktop app"): the rows it
// reads from `agent-kit review list --json`, its keys and what they run, and its installer. main.js is the
// app's drawing (gpui-shell) and is checked by `herdr-app check`; everything it decides is in rows.js, here.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  APPROVES,
  age,
  confirmText,
  footer,
  header,
  keepSelection,
  keyAction,
  kitArgv,
  linkName,
  links,
  notes,
  parseList,
  row,
} from '../herdr-app/review-list/rows.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const MOD = join(ROOT, 'herdr-app', 'review-list')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const NOW = Date.parse('2026-11-28T12:00:00Z')

const result = {
  id: 'maelstrom/590',
  key: 'MB-590',
  kind: 'result',
  product: 'tinybreath',
  repo: 'maelstrom',
  line: 'a singing bowl ends the session',
  title: 'feat(tinybreath): singing bowl',
  at: NOW - 12 * 60 * 1000,
  briefFile: '/data/tasks/maelstrom/590/closing-note.md',
  change: '/repo/openspec/changes/singing-bowl',
  links: [
    { url: 'https://media.example.com/bowl/flow.mp4', label: 'Video, the changed flow', type: 'video' },
    { url: 'https://media.example.com/bowl/desktop.png', label: 'Screenshot, desktop', type: 'image' },
    { url: 'https://github.com/example/maelstrom/pull/612', label: 'Pull request', type: 'pr' },
  ],
  findings: [],
}
const spec = { ...result, id: 'maelstrom/601', key: 'MB-601', kind: 'spec', product: 'wavedance', line: 'save a mix as a playlist', at: NOW - 2 * 3600 * 1000, links: [{ url: 'https://claude.ai/artifact/abc', label: 'Variant A', type: 'artifact' }] }
const pr = { id: 'pr:example/app#88', key: 'app#88', kind: 'pr', repo: 'app', product: 'app', title: 'feat(app): refund button', line: 'feat(app): refund button', url: 'https://github.com/example/app/pull/88', at: NOW - 86400 * 1000, why: ['gate path: stripe.config.json'], ci: 'passing', links: [{ url: 'https://github.com/example/app/pull/88', label: 'Pull request' }] }

describe('review list mod: the rows', () => {
  it('reads the CLI JSON, newest first, and says when there is none', () => {
    const out = parseList(JSON.stringify({ items: [pr, spec, result], errors: ['maelstrom: gh failed'] }))
    assert.deepEqual(out.items.map((it) => it.key), ['MB-590', 'MB-601', 'app#88'])
    assert.deepEqual(out.errors, ['maelstrom: gh failed'])
    assert.deepEqual(parseList('not json').items, [])
    assert.match(parseList('').errors[0], /no JSON/)
  })

  it('shows kind, product, age and one line, the same as the herdr pane', () => {
    assert.deepEqual(row(result, NOW), { kind: 'result', product: 'tinybreath', age: '12m', line: 'a singing bowl ends the session' })
    assert.equal(row(pr, NOW).kind, 'GitHub')
    assert.equal(age(NOW - 125 * 60 * 1000, NOW), '2h 5m')
    assert.equal(age(NOW - 3 * 86400 * 1000, NOW), '3d')
    assert.equal(header([result, spec, pr]), 'Review list · 3 waiting (1 on GitHub)')
    assert.equal(header([result]), 'Review list · 1 waiting')
  })

  it('numbers the links whole, a PR row its own URL once', () => {
    assert.deepEqual(links(result).map((l) => l.url), result.links.map((l) => l.url))
    assert.deepEqual(links(pr), [{ url: pr.url, label: 'Pull request', type: 'pr' }])
    assert.equal(linkName(links(result)[0]), 'Video, the changed flow')
    assert.equal(linkName(links(spec)[0]), 'Artifact: Variant A')
    assert.equal(linkName({ url: 'x', label: '', type: 'link' }), 'Link')
  })

  it('names the gaps, the change, the brief and the GitHub row in the detail', () => {
    const gappy = { ...result, findings: [{ level: 'error', what: 'no phone screenshot (label it "phone")' }, { level: 'warn', what: 'an em dash' }], github: 'maelstrom#612' }
    const n = notes(gappy)
    assert.equal(n[0].level, 'warn')
    assert.match(n[0].text, /^Not complete: no phone screenshot/)
    assert.doesNotMatch(n[0].text, /em dash/)
    assert.ok(n.some((x) => /approve the result here, the PR there/.test(x.text)))
    assert.ok(n.some((x) => x.text === 'OpenSpec change: /repo/openspec/changes/singing-bowl'))
    assert.ok(n.some((x) => x.text.startsWith('Brief file: ')))
    assert.match(notes(pr)[0].text, /Why: gate path: stripe\.config\.json\. CI green\./)
    assert.match(notes({ ...pr, result: 'MB-590' }).at(-1).text, /result pitch waits in this list too \(MB-590\)/)
  })

  it('keeps the selection on the same item when the list changes', () => {
    assert.equal(keepSelection([spec, result], 'maelstrom/590', 0), 1)
    assert.equal(keepSelection([spec], 'maelstrom/590', 1), 0)
    assert.equal(keepSelection([], 'x', 3), 0)
  })
})

describe('review list mod: the keys', () => {
  it('moves, refreshes and opens links 1 to 9', () => {
    assert.deepEqual(keyAction('down', result), { do: 'move', by: 1 })
    assert.deepEqual(keyAction('k', result), { do: 'move', by: -1 })
    assert.deepEqual(keyAction('r', undefined), { do: 'refresh' })
    assert.deepEqual(keyAction('3', result), { do: 'open', url: 'https://github.com/example/maelstrom/pull/612' })
    assert.equal(keyAction('9', result), null)
    assert.equal(keyAction('a', undefined), null)
  })

  it('Enter opens the brief in Plannotator, a PR on GitHub', () => {
    assert.deepEqual(keyAction('enter', result), { do: 'brief' })
    assert.deepEqual(keyAction('p', spec), { do: 'brief' })
    assert.deepEqual(keyAction('enter', pr), { do: 'open', url: pr.url })
  })

  it('a asks first, a second a approves, anything else cancels; never on a PR', () => {
    assert.deepEqual(keyAction('a', result), { do: 'ask' })
    assert.deepEqual(keyAction('a', result, { asking: true }), { do: 'approve' })
    assert.deepEqual(keyAction('enter', result, { asking: true }), { do: 'approve' })
    assert.deepEqual(keyAction('escape', result, { asking: true }), { do: 'cancel' })
    assert.deepEqual(keyAction('b', result, { asking: true }), { do: 'cancel' })
    assert.equal(keyAction('a', pr), null)
    assert.match(confirmText(result), /ship it\?.*merges once CI is green, posts the drafts on the brand accounts and archives its change once it lands/)
    assert.match(confirmText(spec), /Its agent builds it now/)
  })

  it('b sends back a spec, design or result, not a PR or a stuck task', () => {
    assert.deepEqual(keyAction('b', spec), { do: 'back' })
    assert.equal(keyAction('b', pr), null)
    assert.equal(keyAction('b', { ...result, kind: 'stuck' }), null)
  })

  it('the footer names what a does for this kind', () => {
    assert.match(footer(result), /a approve \+ ship/)
    assert.match(footer(spec), /a approve \+ build/)
    assert.doesNotMatch(footer(pr), /approve/)
    assert.equal(APPROVES.stuck, 'repair')
  })

  it('runs the same CLI as the herdr pane', () => {
    const cfg = { node: '/usr/local/bin/node', kit: '/kit/bin/agent-kit.mjs' }
    assert.deepEqual(kitArgv(cfg, 'approve', 'maelstrom/590'), ['/usr/local/bin/node', '/kit/bin/agent-kit.mjs', 'review', 'approve', 'maelstrom/590'])
    assert.deepEqual(kitArgv(cfg, 'doc', 'maelstrom/590').slice(2), ['review', 'doc', 'maelstrom/590'])
    const main = read('herdr-app/review-list/main.js')
    for (const cmd of ['"list", "--json"', '["approve", it.id]', '["back", it.id, text]', '"doc", it.id']) assert.ok(main.includes(cmd), cmd)
    const cli = read('src/review.mjs')
    for (const c of ['list:', 'approve:', 'back:', 'doc:']) assert.ok(cli.includes(c), c)
  })
})

describe('review list mod: files and install', () => {
  it('main.js imports only what rows.js exports', () => {
    const main = read('herdr-app/review-list/main.js')
    const names = main.match(/import \{([^}]+)\} from "\.\/rows\.js"/)[1].split(',').map((s) => s.trim())
    const rows = read('herdr-app/review-list/rows.js')
    for (const n of names) assert.match(rows, new RegExp(`export (?:const|function) ${n}\\b`), n)
  })

  it('mod.json: not docked by itself, focusable, a palette entry that splits down', () => {
    const m = JSON.parse(read('herdr-app/review-list/mod.json'))
    assert.equal(m.place, 'none')
    assert.equal(m.focusable, true)
    assert.deepEqual(m.palette[0].args, { direction: 'down', mod: 'review-list' })
    assert.equal(m.palette[0].command, 'pane.split')
  })

  it('every icon is a Lucide outline icon the main.js uses', () => {
    const svgs = readdirSync(MOD).filter((f) => f.endsWith('.svg'))
    const main = read('herdr-app/review-list/main.js')
    for (const f of svgs) {
      const s = readFileSync(join(MOD, f), 'utf8')
      assert.match(s, /viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/, f)
      assert.ok(main.includes(`icon("${f.replace('.svg', '')}")`), `${f} is used`)
    }
  })

  it('install.sh copies the mod and writes kit.json; no app folder, nothing done', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'review-mod-'))
    try {
      const app = join(tmp, 'herdr-app')
      mkdirSync(app)
      // node's own folder and the system's only: no herdr-app on PATH, so no check against a real app.
      const PATH = `${dirname(process.execPath)}:/usr/bin:/bin`
      const r = spawnSync('bash', [join(ROOT, 'herdr-app', 'install.sh')], { encoding: 'utf8', env: { HOME: tmp, PATH, HERDR_APP_HOME: app } })
      assert.equal(r.status, 0, r.stderr)
      const dest = join(app, 'mods', 'review-list')
      for (const f of ['main.js', 'rows.js', 'mod.json', 'list-checks.svg']) assert.ok(existsSync(join(dest, f)), f)
      const kit = JSON.parse(readFileSync(join(dest, 'kit.json'), 'utf8'))
      assert.equal(kit.kit, join(ROOT, 'bin', 'agent-kit.mjs'))
      assert.ok(kit.node.endsWith('node'))
      const none = spawnSync('bash', [join(ROOT, 'herdr-app', 'install.sh')], { encoding: 'utf8', env: { HOME: tmp, PATH, HERDR_APP_HOME: join(tmp, 'missing') } })
      assert.equal(none.status, 0)
      assert.match(none.stdout, /skip Herdr app mod review-list: no app folder/)
      assert.ok(!existsSync(join(tmp, 'missing')))
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('terminal/install.sh runs it, sync vendors it, the README documents it', () => {
    assert.match(read('terminal/install.sh'), /"\$here\/\.\.\/herdr-app\/install\.sh"/)
    assert.match(read('src/sync.mjs'), /'herdr-app'/)
    const readme = read('README.md')
    assert.match(readme, /herdr-app\/install\.sh/)
    assert.match(readme, /review-list\.approve/)
  })
})
