import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BASE_PATH, checkPlist, chooseNode, pathFor, plistText, readPlist } from '../src/lib/ceo-launchd.mjs'

const having = (...paths) => (p) => paths.includes(p)

describe('chooseNode', () => {
  it('takes the config value when it exists', () => {
    assert.equal(chooseNode({ configured: '/x/node', exists: having('/x/node', '/opt/homebrew/bin/node') }), '/x/node')
  })
  it('fails on a configured path that is missing, without falling back', () => {
    assert.throws(() => chooseNode({ configured: '/x/node', exists: having('/opt/homebrew/bin/node') }), /ceo\.node.*\/x\/node/)
  })
  it('prefers /opt/homebrew/bin/node, then /usr/local/bin/node', () => {
    assert.equal(chooseNode({ exists: having('/opt/homebrew/bin/node', '/usr/local/bin/node') }), '/opt/homebrew/bin/node')
    assert.equal(chooseNode({ exists: having('/usr/local/bin/node') }), '/usr/local/bin/node')
  })
  it('fails with a message when none exists, and never uses process.execPath', () => {
    assert.throws(() => chooseNode({ exists: () => false }), /No node at .*brew install node/)
    assert.equal(chooseNode({ exists: having('/usr/local/bin/node') }) === process.execPath, false)
  })
})

describe('pathFor', () => {
  it('is the fixed list, with no copy of the shell PATH', () => {
    const saved = process.env.PATH
    process.env.PATH = '/home/u/.hermes/node/bin:/weird'
    try {
      assert.equal(pathFor('/opt/homebrew/bin/claude'), BASE_PATH.join(':'))
      assert.doesNotMatch(pathFor('/usr/bin/claude'), /hermes|weird/)
    } finally {
      process.env.PATH = saved
    }
  })
  it('adds the claude folder only when it is elsewhere', () => {
    assert.equal(pathFor('/Users/u/.local/bin/claude'), `${BASE_PATH.join(':')}:/Users/u/.local/bin`)
  })
})

const plist = (over = {}) =>
  plistText({ label: 'com.x.ceo', node: '/opt/homebrew/bin/node', script: '/r/vendor/agent-kit/bin/agent-kit.mjs',
    path: pathFor('/Users/u/.local/bin/claude'), home: '/Users/u', hour: 8, log: '/l/launchd.log', ...over })

describe('plist text', () => {
  it('runs the stable node with the minimal PATH', () => {
    const text = plist()
    assert.match(text, /<array>\s*<string>\/opt\/homebrew\/bin\/node<\/string>\s*<string>\/r\/vendor\/agent-kit\/bin\/agent-kit\.mjs<\/string>/)
    assert.match(text, /<key>PATH<\/key><string>\/opt\/homebrew\/bin:\/usr\/local\/bin:\/usr\/bin:\/bin:\/usr\/sbin:\/sbin:\/Users\/u\/\.local\/bin<\/string>/)
    assert.match(text, /<key>Hour<\/key><integer>8<\/integer>/)
  })
  it('escapes XML', () => {
    assert.match(plist({ home: '/a&b' }), /<string>\/a&amp;b<\/string>/)
  })
  it('reads back what it wrote', () => {
    assert.deepEqual(readPlist(plist({ home: '/a&b' })), {
      node: '/opt/homebrew/bin/node',
      script: '/r/vendor/agent-kit/bin/agent-kit.mjs',
      path: pathFor('/Users/u/.local/bin/claude'),
    })
  })
})

describe('checkPlist', () => {
  const ok = { exists: () => true, version: () => 'v22.0.0' }
  it('is quiet when node and claude exist and run', () => {
    assert.deepEqual(checkPlist(plist(), ok), [])
  })
  it('reports a missing node with a fix line', () => {
    const problems = checkPlist(plist({ node: '/gone/node' }), { ...ok, exists: (p) => p !== '/gone/node' })
    assert.equal(problems.length, 1)
    assert.match(problems[0], /node \/gone\/node does not exist; fix: pnpm ceo:schedule install/)
  })
  it('reports a stray argument before the script', () => {
    const text = plist().replace('<string>/r/vendor', '<string>/Users/u/.hermes/node/bin/node</string>\n    <string>/r/vendor')
    assert.match(checkPlist(text, ok)[0], /stray extra argument/)
  })
  it('reports a node that does not run', () => {
    const problems = checkPlist(plist(), { ...ok, version: (bin) => (bin.endsWith('node') ? null : 'x') })
    assert.match(problems[0], /does not run \(node -v failed\)/)
  })
  it('reports claude missing from the PATH', () => {
    const problems = checkPlist(plist(), { ...ok, exists: (p) => !p.endsWith('/claude') })
    assert.match(problems[0], /claude is not on the job's PATH/)
  })
})
