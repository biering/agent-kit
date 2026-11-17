/**
 * Pull requests that wait for the owner's review, across every repo the work board knows
 * (README "Waiting for you"). The second section of the review pane, next to the designs.
 *
 * Pure: `gh` comes in as an async runner and the board's files as readers, so every rule here is tested
 * without GitHub (test/waiting-prs.test.mjs). Nothing here writes anything: approval stays on GitHub.
 *
 * A PR waits for the owner when it is open, not draft, written by an agent, and one of these holds
 * (each becomes a "why" on its row):
 *   review required   GitHub says so: reviewDecision REVIEW_REQUIRED (a ruleset or branch protection
 *                     asks for a review, nobody gave it yet). This is how a repo like this kit shows up.
 *   gate path         a changed file sits under a CODEOWNERS rule of the owner. A catch-all rule (`*`)
 *                     is a default owner, not a gate, and does not count.
 *   new dependency    a changed package.json gains a runtime dependency (dependencies, peerDependencies),
 *                     or the repo's own `new dependency` status is not green.
 *   repo needs review the repo is in AGENT_KIT_REVIEW_REPOS (every PR there needs the owner's yes).
 * The owner's approval at the PR's head commit lifts the gate reasons; his "changes requested" puts the
 * PR back on the agent, so it leaves the list. A draft that would wait is listed as `draft`, so it
 * gets marked ready (unless its board task is still working on it).
 */
import { createHash } from 'node:crypto'

// ---------- CODEOWNERS ----------

/** A CODEOWNERS file as rules: [{ pattern, re, owners, catchAll }], in file order. */
export function parseCodeowners(text = '') {
  const rules = []
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\s#.*$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const [pattern, ...owners] = line.split(/\s+/)
    if (!owners.length) continue // a pattern with no owner un-owns its files
    rules.push({ pattern, re: patternRe(pattern), owners: owners.map((o) => o.replace(/^@/, '').toLowerCase()), catchAll: /^\/?\*{1,2}$/.test(pattern) })
  }
  return rules
}

/** A gitignore-style CODEOWNERS pattern as a regular expression on a repo-relative path. */
function patternRe(pattern) {
  let p = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern
  const anchored = p.startsWith('/') || p.includes('/')
  p = p.replace(/^\//, '')
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') {
        re += '(?:.*/)?'
        i += 2
      } else {
        re += '.*'
        i += 1
      }
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${re}(?:/.*)?$`)
}

/**
 * The changed files the owner holds by a specific CODEOWNERS rule (the last matching rule wins, as on GitHub).
 * `skip`: logins that are not the owner (the PR's author, the agents). `owner`: when set, only that login.
 * Answers [{ path, pattern, owner }].
 */
export function gatePaths(rules, files, { skip = [], owner = '' } = {}) {
  const skipped = new Set(skip.map((s) => s.toLowerCase()))
  const out = []
  for (const path of files) {
    let hit = null
    for (const r of rules) if (r.re.test(path)) hit = r
    if (!hit || hit.catchAll) continue
    const who = hit.owners.find((o) => (owner ? o === owner.toLowerCase() : !skipped.has(o) && !o.includes('/') && !o.includes('@')))
    if (who) out.push({ path, pattern: hit.pattern, owner: who })
  }
  return out
}

// ---------- dependencies ----------

const RUNTIME = ['dependencies', 'peerDependencies']
const LOCAL = /^(?:workspace|file|link|portal):/

/** Runtime dependencies a package.json gains: names in dependencies/peerDependencies now that were not before. */
export function newRuntimeDeps(baseText, headText) {
  const parse = (t) => {
    try {
      return JSON.parse(t) ?? {}
    } catch {
      return null
    }
  }
  const head = parse(headText)
  if (!head) return []
  const base = parse(baseText) ?? {}
  const had = new Set(RUNTIME.flatMap((k) => Object.keys(base[k] ?? {})))
  const added = new Set()
  for (const k of RUNTIME)
    for (const [name, range] of Object.entries(head[k] ?? {})) if (!had.has(name) && !LOCAL.test(String(range))) added.add(name)
  return [...added].sort()
}

// ---------- the PR itself ----------

/** CI of a PR from its statusCheckRollup: { state: 'passing'|'failing'|'pending'|'none', failing: [names] }. */
export function ciState(rollup = []) {
  const failing = []
  let pending = false
  for (const c of rollup ?? []) {
    const name = c.name || c.context || 'check'
    const verdict = String(c.conclusion || c.state || '').toUpperCase()
    const running = c.status && String(c.status).toUpperCase() !== 'COMPLETED'
    if (['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(verdict)) failing.push(name)
    else if (running || ['PENDING', 'EXPECTED', 'QUEUED', 'IN_PROGRESS'].includes(verdict) || (!verdict && !c.status)) pending = true
  }
  if (failing.length) return { state: 'failing', failing }
  if (pending) return { state: 'pending', failing }
  return { state: (rollup ?? []).length ? 'passing' : 'none', failing }
}

/**
 * The repo's own dependency gate, when it posts one (a check or status named "new dependency"): 'red' while
 * it is not green, 'green' when it is, null when the repo has none. It knows the repo's other packages,
 * which a single package.json cannot tell, so it is trusted over the diff.
 */
export function depGate(rollup = []) {
  const own = (rollup ?? []).filter((c) => /new dependency/i.test(c.name || c.context || ''))
  if (!own.length) return null
  return own.every((c) => ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(String(c.conclusion || c.state).toUpperCase())) ? 'green' : 'red'
}

const WORDS = '(?:the owner|owner|you|him|me|the human)'
const forLine = (extra) => new RegExp(`^[\\s>*_-]*(?:\\*\\*)?for\\s+(?:${WORDS}${extra ? `|${extra}` : ''})\\s*:(?:\\*\\*)?\\s*(.*)$`, 'i')
const ADVICE = /^[\s>*_-]*for\s+[A-Za-z][\w'-]*\s*:\s*(.*)$/i

/**
 * The gate-reviewer's three sentences (what changes, what could go wrong, how to undo) from a PR body or a task
 * report: the text after a `for <owner>:` line (its own block of the gate reviewer's verdict, or a line of
 * its own in a body), up to the blank line. Answers '' when there is none.
 */
export function gateSentences(text = '', owner = '') {
  const lines = String(text).split('\n')
  const named = owner ? owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''
  const re = forLine(named)
  const advice = /GATE ADVICE/i.test(text)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re) || lines[i].match(ADVICE)
    if (!m) continue
    const part = [m[1]]
    for (let j = i + 1; j < lines.length && lines[j].trim() && !/^[\s>*_-]*(?:after merge|classes|findings|GATE ADVICE)\b/i.test(lines[j]); j++) part.push(lines[j])
    const out = part.join(' ').replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim()
    // `for you:` and the like are his by their words; `for <name>:` is his when it is the gate reviewer's verdict
    // or reads as three sentences ("for example: …" does not).
    const named = re.test(lines[i])
    if (out && (named || advice || (out.match(/[.!?](?:\s|$)/g) ?? []).length >= 3)) return out
  }
  return ''
}

/** A repo's slug (owner/name) from a git remote URL, or null when it is not a GitHub remote. */
export function slugOf(remote = '') {
  const m = String(remote).trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}

const PR_FIELDS = 'number,title,url,isDraft,reviewDecision,createdAt,updatedAt,author,reviews,reviewRequests,statusCheckRollup,body,headRefOid,baseRefName,files'

const csv = (v) => String(v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

/** A short hash of what the owner would be approving: a skip holds until the head or the reasons change. */
const prHash = (pr, why) => createHash('sha256').update(`${pr.headRefOid}\n${why.join('|')}`).digest('hex').slice(0, 12)

/** The owner's latest decisive review of a PR: { state, atHead } or null. */
function decisive(pr, { owner, skip }) {
  const mine = (pr.reviews ?? [])
    .filter((r) => ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(r.state))
    .filter((r) => {
      const who = String(r.author?.login ?? '').toLowerCase()
      return who && who !== String(pr.author?.login ?? '').toLowerCase() && (owner ? who === owner : !skip.has(who))
    })
    .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)))
  const last = mine.at(-1)
  return last ? { state: last.state, atHead: last.commit?.oid === pr.headRefOid } : null
}

/**
 * Judge one PR. ctx: { owner, agents: [logins], codeowners: rules, deps: [names new to the repo], repoNeeds: bool,
 * task: the board's row for it or null }. Answers null when it does not wait for the owner, else the item.
 */
export function judge(pr, repo, ctx) {
  const skip = new Set([...(ctx.agents ?? []), String(pr.author?.login ?? '')].map((s) => s.toLowerCase()))
  const owner = (ctx.owner ?? '').toLowerCase()
  const author = String(pr.author?.login ?? '').toLowerCase()
  if (owner && author === owner) return null
  if ((ctx.agents ?? []).length && !ctx.agents.map((a) => a.toLowerCase()).includes(author)) return null
  if (pr.reviewDecision === 'CHANGES_REQUESTED') return null
  const verdict = decisive(pr, { owner, skip })
  if (verdict?.state === 'CHANGES_REQUESTED') return null

  const why = []
  if (pr.reviewDecision === 'REVIEW_REQUIRED') why.push('review required')
  const files = (pr.files ?? []).map((f) => f.path)
  const gates = gatePaths(ctx.codeowners ?? [], files, { skip: [...skip], owner })
  const own = depGate(pr.statusCheckRollup)
  const gate = []
  if (gates.length) gate.push(`gate path: ${gates[0].path}${gates.length > 1 ? ` (+${gates.length - 1} more)` : ''}`)
  if (own === 'red') gate.push("new dependency (the repo's check is not green)")
  else if (own === null && (ctx.deps ?? []).length) gate.push(`new dependency: ${ctx.deps.slice(0, 3).join(', ')}${ctx.deps.length > 3 ? ` (+${ctx.deps.length - 3})` : ''}`)
  if (ctx.repoNeeds) gate.push('repo needs your review')
  // His yes at the head commit lifts the gate; a push after it puts the PR back.
  if (verdict?.state !== 'APPROVED' || !verdict.atHead) why.push(...gate)
  if (!why.length) return null

  const ci = ciState(pr.statusCheckRollup)
  const sentences = gateSentences(pr.body, owner) || gateSentences(ctx.report ?? '', owner)
  const draft = Boolean(pr.isDraft)
  // A draft whose agent is still on it is work in progress; one left behind is waiting for a "ready".
  if (draft && ctx.task && ['working', 'queued', 'starting'].includes(ctx.task.state) && ctx.task.stage !== 'done') return null
  const key = `${repo.name}#${pr.number}`
  return {
    kind: 'pr',
    id: `pr:${repo.slug}#${pr.number}`,
    key,
    repo: repo.name,
    slug: repo.slug,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    draft,
    why,
    ci: ci.state,
    ciFailing: ci.failing,
    sentences,
    at: Date.parse(pr.createdAt) || 0,
    task: ctx.task?.id ?? '',
    links: [{ url: pr.url, label: 'Pull request' }],
    brief: sentences,
    hash: prHash(pr, why),
  }
}

/**
 * Every PR that waits for the owner, oldest first, and what could not be read.
 * io: { gh(args) → Promise<string> (throws when gh fails), repos: [{ name, root }], remote(root) → string,
 *       rows: the board's task rows (list --json), readReport(taskId) → string, env, agents: [logins], now }
 * Answers { items, errors: ['repo: why'] }.
 */
export async function collectPrs({ gh, repos, remote, rows = [], readReport = () => '', env = {}, agents = [] }) {
  const owner = (env.AGENT_KIT_REVIEW_OWNER ?? '').trim().toLowerCase()
  const everyPr = new Set(csv(env.AGENT_KIT_REVIEW_REPOS))
  const known = [...new Set([...agents, ...csv(env.AGENT_KIT_REVIEW_AGENTS)])]
  const byUrl = new Map(rows.filter((r) => r?.pr).map((r) => [r.pr, r]))
  const items = []
  const errors = []
  const json = async (args) => JSON.parse(await gh(args))
  const raw = async (slug, path, ref) => {
    try {
      return await gh(['api', '-H', 'Accept: application/vnd.github.raw', `repos/${slug}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`])
    } catch {
      return null
    }
  }

  await Promise.all(
    repos.map(async (repo) => {
      const slug = slugOf(remote(repo.root))
      if (!slug) return // no GitHub remote: nothing to ask
      const r = { name: repo.name, slug }
      try {
        const prs = (await json(['pr', 'list', '-R', slug, '--state', 'open', '--limit', '50', '--json', PR_FIELDS])).filter((p) => p.url)
        if (!prs.length) return
        let rules = null
        const codeowners = async () => {
          if (rules) return rules
          for (const path of ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS']) {
            const text = await raw(slug, path)
            if (text != null) return (rules = parseCodeowners(text))
          }
          return (rules = [])
        }
        for (const pr of prs) {
          const task = byUrl.get(pr.url) ?? null
          const files = (pr.files ?? []).map((f) => f.path)
          const deps = []
          // A repo with its own dependency check is trusted over the diff of one package.json.
          for (const path of depGate(pr.statusCheckRollup) ? [] : files.filter((f) => /(?:^|\/)package\.json$/.test(f))) {
            const [head, base] = await Promise.all([raw(slug, path, pr.headRefOid), raw(slug, path, pr.baseRefName)])
            if (head != null) deps.push(...newRuntimeDeps(base, head))
          }
          const item = judge(pr, r, {
            owner,
            agents: known,
            codeowners: await codeowners(),
            deps: [...new Set(deps)],
            repoNeeds: everyPr.has(repo.name.toLowerCase()) || everyPr.has(slug.toLowerCase()),
            task,
            report: task ? readReport(task.id) : '',
          })
          if (item) items.push(item)
        }
      } catch (e) {
        errors.push(`${repo.name}: ${String(e.message ?? e).split('\n')[0].slice(0, 120)}`)
      }
    }),
  )
  return { items: items.sort((a, b) => (a.at || 0) - (b.at || 0)), errors: errors.sort() }
}
