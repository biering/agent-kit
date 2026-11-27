/**
 * The owner's review list (rules/spec-review.md, rules/result-review.md, rules/design-review.md): which
 * tasks on the herdr-projects work board wait for the owner's decision, what the pane shows for each, and
 * what approve and send back do.
 *
 * Pure: the board, the files, the clock and sleep come in as arguments, so every rule here is tested
 * without a board (test/review.test.mjs, test/review-list.test.mjs). The board is used only through its
 * CLI (list --json, details, approve, tell, stop, delegate), never patched; its task files are only read.
 *
 * The kinds of task that wait here:
 *   spec    "Spec ready": the planning agent wrote the OpenSpec change (and the designs, when screens
 *           change) and stopped. Approve is a `tell`: build it now, in the same conversation.
 *   design  "Design ready": the agent made the artifacts with its usual access and stopped with a report
 *           whose message starts with "Design ready". Approve and send back are a `tell`.
 *   result  the board's "ready to approve" for work the owner reviews (a result pitch in the closing note,
 *           or a task flagged for a spec or design review): the agent wrote the pitch and ended its turn, the
 *           board opened the PR and ran its reviewer. Approve is the board's `approve` (it merges); the
 *           distribution drafts go out as a task of their own after the merge. Every other ready-to-approve
 *           (a fix, an SEO page, content, a chore) is the CEO's and does not show here.
 * A spec or design stop that the board then marked an error (an idle compaction read as a turn without a
 * summary) keeps its row: its last real report is read from the task's own file (lastReport).
 *   plan    "Plan ready" (stage plan, plan.approve you) whose plan is a design brief. Approve is the
 *           board's approve, then a check that the build really starts.
 *   stuck   approved, but no build runs: the yes was given, `plan.built` never came, the worktree is still
 *           locked. The repair is stop, then delegate, which builds the approved plan.
 * The PRs that wait for the owner's approval on GitHub come from waiting-prs.mjs (kind pr).
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { check, section } from './review-check.mjs'

/** A Claude Artifact link, matched whole: https://claude.ai/artifact/<id> (or /code/artifact/<id>). */
export const ARTIFACT = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/g

/** The description line that marks a task as UI work with a design review first. */
export const MARKER = /^\s*[-*]?\s*design review:\s*yes\b/im

/** The report message a design stage ends with. */
export const READY = /^design ready\b/i

/** The report messages a spec stage and a finished build end with (rules/spec-review.md, rules/result-review.md). */
export const SPEC_READY = /^spec ready\b/i
export const RESULT_READY = /^result ready\b/i

/** The kind a blocked task's report message asks for, or null: spec, result or design. */
export function kindOf(msg = '') {
  const m = String(msg).trim()
  if (SPEC_READY.test(m)) return 'spec'
  if (RESULT_READY.test(m)) return 'result'
  if (READY.test(m)) return 'design'
  return null
}

/** The one line of a report: the message without its "Spec ready for review:" opening. */
export function oneLine(msg = '', fallback = '') {
  const line = String(msg)
    .split('\n')[0]
    .replace(/^\s*(?:spec|result|design)\s+ready(?:\s+for\s+(?:review|you))?\s*[:,.\-–—]?\s*/i, '')
    .trim()
  return line || fallback
}

/** The product a brief or a description names on a line of its own (`Product: tinybreath`), else the repo. */
export function productOf(texts = [], repo = '') {
  for (const t of texts) {
    const m = /^\s*[-*]?\s*\**product\**\s*:\s*\**\s*([^\n*]+?)\s*\**\s*$/im.exec(String(t ?? ''))
    if (m) return m[1].trim()
  }
  return repo
}

/** The OpenSpec change a brief names (`openspec/changes/<name>`), or ''. The archive folder does not count. */
export function changeOf(text = '') {
  for (const m of String(text).matchAll(/openspec\/changes\/([a-z0-9][a-z0-9._-]*)/gi)) if (m[1] !== 'archive') return m[1].replace(/[.]+$/, '')
  return ''
}

/** Any web link, matched whole: up to a space, a quote, a bracket or an angle; trailing punctuation is not part of it. */
export const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/g
const trimUrl = (u) => u.replace(/[.,;:!?*_]+$/, '')

/** What a link is, for its label in the pane: artifact, pr, video, image or link. */
export function linkType(url) {
  if (new RegExp(`^${ARTIFACT.source}$`).test(url)) return 'artifact'
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+(?:[/?#]|$)/.test(url)) return 'pr'
  if (/\.(?:mp4|webm|mov|m4v)(?:[?#]|$)/i.test(url)) return 'video'
  if (/\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(url)) return 'image'
  return 'link'
}

/** Every web link in a text, in order, once each, typed, with the words on its line as its label. */
export function allLinks(text = '') {
  const seen = new Set()
  const links = []
  for (const line of String(text).split('\n')) {
    for (const m of line.matchAll(URL_RE)) {
      const url = trimUrl(m[0])
      if (seen.has(url)) continue
      seen.add(url)
      links.push({ url, type: linkType(url), label: labelOf(line.slice(0, m.index), line.slice(m.index + m[0].length)) })
    }
  }
  return links
}

const MINUTE = 60 * 1000

/** Every artifact link in a text, in order, once each, with the words on its line as its label. */
export function artifactLinks(text = '') {
  const seen = new Set()
  const links = []
  for (const line of String(text).split('\n')) {
    for (const m of line.matchAll(ARTIFACT)) {
      const url = m[0]
      if (seen.has(url)) continue
      seen.add(url)
      links.push({ url, label: labelOf(line.slice(0, m.index), line.slice(m.index + url.length)) })
    }
  }
  return links
}

const LABEL_MAX = 60
const clean = (s) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(URL_RE, '')
    .replace(/[`*_#>|[\]]/g, '')
    .replace(/^\s*(?:[-+]|\d+[.)])\s+/, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** A link's label: the last clause before it on its line (else the first after it), short. */
function labelOf(before, after) {
  const tail = (s) => clean(s).split(/[.;!?]\s+|\s[–—-]\s/).pop().replace(/[\s:,;(\-–—]+$/, '').trim()
  const head = (s) => clean(s.replace(/^[\s).,;:]+/, '')).split(/[.;!?](?:\s|$)/)[0].replace(/^[\s:,;)\-–—]+/, '').trim()
  let label = tail(before) || head(after)
  // A clause cut out of a parenthesis: from its closing bracket on.
  const close = label.lastIndexOf(')')
  if (close !== -1 && !label.slice(0, close).includes('(')) label = label.slice(close + 1).replace(/^[\s,;:\-–—]+/, '')
  // A link inside a parenthesis ("Variant B (see <link>)"): the words before the bracket.
  const open = label.lastIndexOf('(')
  if (open !== -1 && !label.slice(open).includes(')')) label = label.slice(0, open).replace(/[\s:,;\-–—]+$/, '')
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1).trimEnd()}…` : label
}

/** True when the task's description carries the `Design review: yes` line. */
export const isDesign = (description = '') => MARKER.test(String(description))

/** "4m", "2h 5m", "3d": how long ago `at` (epoch ms) was. */
export function age(at, now = Date.now()) {
  if (!at) return ''
  const m = Math.max(0, Math.floor((now - at) / MINUTE))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** A short hash of a brief: a skip or a notification holds until the brief changes. */
export const briefHash = (text = '') => createHash('sha256').update(String(text)).digest('hex').slice(0, 12)

/** The board's program: HERDR_PROJECTS_BIN, else its launcher in the data folder, else herdr-projects on PATH. */
export function boardBin(env, home, exists) {
  if (env.HERDR_PROJECTS_BIN) return env.HERDR_PROJECTS_BIN
  const launcher = join(dataDir(env, home), 'bin', 'herdr-projects')
  return exists(launcher) ? launcher : 'herdr-projects'
}

/** The board's data folder, as the board itself finds it (HERDR_PROJECTS_DATA_DIR, HERDR_PROJECTS_HOME/data). */
export function dataDir(env, home) {
  if (env.HERDR_PROJECTS_DATA_DIR) return env.HERDR_PROJECTS_DATA_DIR
  return join(env.HERDR_PROJECTS_HOME || join(home, '.herdr-projects'), 'data')
}

/**
 * A board client over a runner: `run(bin, args)` → { status, stdout, stderr }. Each call answers
 * { ok, json, out, error } and never throws; only `list` throws, when the board does not answer, so an
 * unreachable board is never shown as "nothing waits".
 */
export function boardClient(bin, run) {
  const call = (args) => {
    const r = run(bin, args)
    const out = (r.stdout ?? '').trim()
    const ok = r.status === 0 && !r.error
    let json = null
    try {
      json = out ? JSON.parse(out) : null
    } catch {}
    return { ok, json, out, error: ok ? '' : (r.stderr || r.error?.message || out || `exit ${r.status}`).trim() }
  }
  return {
    call,
    list: () => {
      const r = call(['list', '--json'])
      if (!r.ok || !Array.isArray(r.json)) throw new Error(`the work board did not answer (${bin} list --json): ${r.error || 'no list'}`)
      return r.json
    },
    details: (id) => call(['details', id]).json,
    approve: (id) => call(['approve', id]),
    tell: (id, text) => call(['tell', id, text]),
    stop: (id) => call(['stop', id]),
    delegate: (id, extra = []) => call(['delegate', id, ...extra]),
    add: (title, extra = []) => call(['add', title, ...extra]),
  }
}

/** A result's one line: its pitch's title after `# Result:`, else the task's title. */
export function pitchLine(brief = '', fallback = '') {
  const m = /^#\s+result\s*[:\-–—]?\s*(.+)$/im.exec(String(brief))
  return m?.[1]?.trim() || fallback
}

/**
 * The stages a lost build sits in. From the board's source (herdr-projects 1.2.12): approve sets the stage
 * to `starting` (crates/flow/src/actions/plan.rs, approve_plan); the build waits as `queued` while the disk is
 * full (leftovers/room.rs); it unlocks the worktree (`plan.locked` false) before it starts the agent or
 * moves the stage on, and only then sets `plan.built` (plan/build.rs, start_build_by). So a healthy start
 * is never "locked" in any stage but those two. A message between the yes and the start moves the task to
 * `working` (actions/talk.rs, rearm) and the build runner quits; the agent's next turn can end it in
 * `asks` or `nosummary`. Only those count as stuck: an unknown stage is never repaired.
 */
export const LOST = ['working', 'asks', 'nosummary']

/** True when the plan was approved but its build never started (the stuck case). */
export function stuck(details) {
  const p = details?.plan
  return Boolean(p?.approvedAt && !p?.built && p?.locked && LOST.includes(details?.task?.stage))
}

/** The task folder on disk for a board id (`repo/n`). */
const folder = (data, id) => join(data, 'tasks', ...String(id).split('/'))

/**
 * The board's "ready to approve" (herdr-projects 1.2.12, crates/flow/src/shown/states.rs, awaits_yes): the agent
 * ended its turn, the board ran its check, pushed, opened the PR and ran its reviewer, and the merge waits for one
 * yes. A list row shows it as stage `approval`, state `blocked`, kind `permission`.
 */
export const readyToApprove = (row) => row?.stage === 'approval' && row?.state === 'blocked'

/** A closing note that is a result pitch (`# Result: …`, rules/result-review.md §2). */
export const isPitch = (text = '') => /^#\s+result\b/im.test(String(text))

/** The line that marks a task whose result the owner reviews before it merges (rules/spec-review.md §1). */
export const SPEC_MARKER = /^\s*[-*]?\s*spec review:\s*yes\b/im

/**
 * Does this finished work wait for the owner's result review, or is it the CEO's to approve? The owner's: a
 * result pitch, a task flagged `Spec review: yes` or `Design review: yes`, or one that wrote an OpenSpec change.
 * Everything else (a fix, an SEO page, content, a chore) is the CEO's (rules/result-review.md §1).
 */
export function ownersResult({ note = '', description = '', said = '' } = {}) {
  return isPitch(note) || SPEC_MARKER.test(description) || isDesign(description) || Boolean(changeOf(`${note}\n${said}`))
}

/** The board's PR for a task: `details` gives it as a URL (1.2.12), older ones as { url }. */
export const prOf = (d) => (typeof d?.pr === 'string' ? d.pr : d?.pr?.url) || ''

/**
 * The agent's own last report, kept in its task.json as `blocked: { at, kind, msg }` (actions/filing.rs) until the
 * next message to it (actions/talk.rs). It outlives a turn end the board then reads wrong: an idle compaction
 * after the stop ("Conversation compacted") is taken as a turn that ended without a summary, so the row reads
 * state `error`, stage `nosummary`, with the screen's last lines as its message (finish/turn_ended.rs).
 */
export function lastReport(task) {
  const b = task?.blocked
  return b && typeof b.msg === 'string' && b.msg.trim() ? { at: b.at ?? null, kind: b.kind ?? '', msg: b.msg } : null
}

/**
 * The board row for `repo/n` or `KEY-n` (any case), or null. A key is the board's own (details answers it as
 * `task.id`), so a row with the same number is asked which key it has.
 */
export function findRow(board, id, rows = board.list()) {
  const want = String(id ?? '').trim().toLowerCase()
  if (!want) return null
  const direct = rows.find((r) => String(r.id).toLowerCase() === want)
  if (direct) return direct
  const n = /^[a-z][a-z0-9]*-(\d+)$/i.exec(want)?.[1]
  if (!n) return null
  for (const r of rows.filter((r) => String(r.id).endsWith(`/${n}`))) if (String(board.details(r.id)?.task?.id ?? '').toLowerCase() === want) return r
  return null
}

/**
 * Who approves a task's finished work: 'owner' (a result review, rules/result-review.md §1) or 'ceo'.
 * io: { board, data, readFile }. Throws when the task is not on the board.
 */
export function approverOf(id, { board, data, readFile }) {
  const row = findRow(board, id)
  if (!row) throw new Error(`${id} is not on the work board`)
  const dir = folder(data, row.id)
  let task = {}
  try {
    task = JSON.parse(readFile(join(dir, 'task.json')) ?? '{}') ?? {}
  } catch {}
  const note = readFile(join(dir, 'closing-note.md')) ?? ''
  return { id: row.id, who: ownersResult({ note, description: task.description ?? '', said: task.said ?? '' }) ? 'owner' : 'ceo' }
}

/**
 * Every task waiting for the owner's decision, newest first.
 * io: { board, data, readFile(path) → string|null, mtime(path) → ms|null, exists(path) → bool, now }
 */
export function collect({ board, data, readFile, mtime, exists = () => false, now = Date.now() }) {
  const items = []
  for (const row of board.list()) {
    if (!row?.id || row.stage === 'done' || row.archivedAt) continue
    const dir = folder(data, row.id)
    let task = null
    const taskFile = () => {
      if (task) return task
      try {
        task = JSON.parse(readFile(join(dir, 'task.json')) ?? 'null') ?? {}
      } catch {
        task = {}
      }
      return task
    }
    let msg = row.msg ?? ''
    let stopped = row.state === 'blocked' && !readyToApprove(row) ? kindOf(msg) : null
    // A stop the board then marked an error: its last real report still stands (see lastReport).
    let boardSays = ''
    if (!stopped && row.state === 'error') {
      const r = lastReport(taskFile())
      const k = r ? kindOf(r.msg) : null
      if (k) {
        stopped = k
        boardSays = msg
        msg = r.msg
      }
    }
    // Finished work the board brings as "ready to approve": a result when the owner reviews it, else the CEO's.
    const ready = !stopped && readyToApprove(row)
    const planReady = !stopped && !ready && row.stage === 'plan'
    let maybeStuck = false
    if (!stopped && !ready && !planReady) {
      // Only a task whose own file says "approved, not built" is worth a details call.
      const p = taskFile().plan
      maybeStuck = Boolean(p?.approvedAt && !p?.built && p?.locked)
      if (!maybeStuck) continue
    }
    const note = join(dir, 'closing-note.md')
    const d = board.details(row.id)
    if (!d?.task) continue
    if (ready && !ownersResult({ note: readFile(note) ?? '', description: `${taskFile().description ?? ''}\n${d.task.description ?? ''}`, said: taskFile().said ?? '' })) continue
    const base = {
      id: row.id,
      key: d.task.id || row.id,
      repo: String(row.id).split('/')[0],
      title: d.task.title || row.title || '',
      msg,
      description: d.task.description ?? '',
      reportLink: d.report?.link ?? '',
      planLink: d.plan?.link ?? '',
      prUrl: prOf(d) || row.pr || '',
      worktree: d.worktree ?? '',
      ...(boardSays ? { boardSays } : {}),
    }
    if (maybeStuck) {
      if (stuck(d)) items.push({ ...base, kind: 'stuck', brief: d.plan?.text ?? '', at: d.plan?.approvedAt })
      continue
    }
    if (ready) {
      const brief = readFile(note) ?? ''
      // The board's own words when the review failed or a check is red: shown, never hidden.
      items.push({ ...base, kind: 'result', ready: true, msg: '', boardSays: row.msg ?? '', brief, briefFile: brief ? note : '', at: taskFile().since || mtime(note) || now })
      continue
    }
    if (planReady) {
      // Only a written plan that still waits for its yes (the board's approvable plan: actions/plan.rs).
      const brief = d.plan?.text ?? ''
      if (!d.plan?.at || !brief.trim() || d.plan?.approvedAt) continue
      if (!isDesign(base.description) && artifactLinks(brief).length === 0) continue
      items.push({ ...base, kind: 'plan', brief, at: d.plan?.at || d.plan?.asked })
      continue
    }
    // A design stop counts only on a task flagged for a design review; a spec or a result stop always does.
    if (stopped === 'design' && !isDesign(base.description)) continue
    let brief = readFile(note)
    let at = mtime(note)
    let briefFile = brief ? note : ''
    if (!brief && d.report?.file) {
      const file = join(dir, 'artifacts', 'report', d.report.file)
      brief = readFile(file)
      at = d.report.at || mtime(file)
      if (brief) briefFile = file
    }
    // The report is the newer word when the note was not rewritten (a send back, then Design ready again).
    const reported = taskFile().at ?? null
    items.push({ ...base, kind: stopped, byHand: stopped === 'result', brief: brief || base.msg, briefFile, at: Math.max(at || 0, reported || 0) || now })
  }
  for (const it of items) {
    it.links = allLinks(`${it.brief}\n${it.msg}`)
    // The PR the board knows for the task: the board opens it after the agent ends, so the pitch cannot link it.
    if (it.prUrl && !it.links.some((l) => l.url === it.prUrl)) it.links.push({ url: it.prUrl, type: 'pr', label: 'Pull request' })
    it.line = ['spec', 'design'].includes(it.kind) || (it.kind === 'result' && it.msg) ? oneLine(it.msg, it.title) : it.kind === 'result' ? pitchLine(it.brief, it.title) : it.title
    it.product = productOf([it.brief, it.description], it.repo)
    const change = changeOf(it.brief)
    const open = change && it.worktree ? join(it.worktree, 'openspec', 'changes', change) : ''
    it.change = change ? open || `openspec/changes/${change}` : ''
    // What the brief or the pitch still lacks (review-check.mjs), shown on the detail.
    it.findings = it.kind === 'spec' || it.kind === 'result' ? check(it.kind, it.brief, { unarchived: it.kind === 'result' && Boolean(open) && exists(open) }) : []
    if (it.kind === 'result' && !it.links.some((l) => l.type === 'pr'))
      it.findings.push({ level: 'error', what: 'no pull request yet: the board opens it once the agent ends its turn' })
    // rules/result-review.md §2: nothing reports "Result ready" by hand; the board brings the result once its PR is open.
    if (it.byHand) it.findings.push({ level: 'error', what: 'stopped by hand with "Result ready": send it back so it ends its turn normally and the board opens the PR' })
    // The brief and the report together: a new "Design ready" with the same note is a new round.
    it.hash = briefHash(`${it.brief}\n${it.msg}`)
  }
  return newestFirst(items)
}

/** Newest first; a tie keeps its order. */
export const newestFirst = (items) => [...items].sort((a, b) => (b.at || 0) - (a.at || 0))

/**
 * The whole list for the pane: the tasks and the PRs, newest first. A PR that is also a result's PR keeps
 * its own row (its approval stays on GitHub); both rows say so.
 */
export function merge(tasks = [], prs = []) {
  const byUrl = new Map(prs.map((p) => [p.url, p]))
  const out = [...tasks.map((t) => ({ ...t })), ...prs.map((p) => ({ product: p.repo, line: p.title, ...p }))]
  for (const t of out) {
    if (t.kind === 'pr' || !t.prUrl || !byUrl.has(t.prUrl)) continue
    t.github = byUrl.get(t.prUrl).key
    const pr = out.find((p) => p.kind === 'pr' && p.url === t.prUrl)
    if (pr) pr.result = t.key
  }
  return newestFirst(out)
}

/** What the agent hears on a design approve (kind design), and on a send back of one. */
export const approvedWords = (notes = '') =>
  `Design approved. Build it now, from your brief and the approved artifacts.${notes.trim() ? `\n\nNotes from the review (guidance, not a send back):\n\n${notes.trim()}` : ''}`
export const backWords = (text) =>
  `Design sent back. The owner reviewed it and wrote:\n\n${text.trim()}\n\nRevise the design (update the same artifact URLs where you can), then stop again with a report whose message starts "Design ready".`

/** What the agent hears on a spec approve and send back (rules/spec-review.md §4). */
export const specApprovedWords = (notes = '') =>
  `Spec approved. Build it now, in this conversation, from the OpenSpec change and its tasks.md (tick each task as it is done). When it is built: record the video and screenshots, write the result pitch in your closing note (rules/result-review.md), archive the change (node vendor/agent-kit/bin/agent-kit.mjs spec archive <name>) and commit it, run agent-kit review check on the pitch, then end your turn normally. Do not report "Result ready": the board opens the PR, reviews it and brings the result to the owner.${notes.trim() ? `\n\nNotes from the review (guidance, not a send back):\n\n${notes.trim()}` : ''}`
export const specBackWords = (text) =>
  `Spec sent back. The owner reviewed it and wrote:\n\n${text.trim()}\n\nRevise the same OpenSpec change (and the same artifact URLs where you can), write the brief again, run the checks, then stop again with a report whose message starts "Spec ready for review". Change no code yet.`

/** What the agent hears on a result send back (rules/result-review.md §5). An approve is the board's merge, no message. */
export const resultBackWords = (text) =>
  `Result sent back. The owner reviewed the pitch and wrote:\n\n${text.trim()}\n\nChange the work on the same branch. If the change to make touches its OpenSpec change, undo the archive commit first (git revert <its sha>), revise the change, tick its tasks and archive it again. Record the video and screenshots again where the change shows, write the pitch again, run agent-kit review check on it, then end your turn normally: the board updates the PR, reviews it and brings it back. Do not report "Result ready", merge or post anything.`

/**
 * The task that posts a result's distribution drafts once its PR is merged (rules/result-review.md §4): added on the
 * owner's approve, `--after` the result, research only (it changes nothing in the repo). Null when there is nothing
 * to post (no Distribution section, or "Not live yet").
 */
export function postTask(it, notes = '') {
  const dist = section(it.brief ?? '', 'Distribution') ?? ''
  if (!dist.trim() || /\bnot live\b|\bno post\b/i.test(dist)) return null
  const title = cut(`post: ${it.line || it.title}`.replace(/\s+/g, ' '), 60)
  const desc = [
    `Post the distribution drafts of ${it.key} (${it.product || it.repo}) on the product's brand accounts, as approved by the owner in the review list. Never as the owner: his own accounts are his to post.`,
    `Start only once ${it.key} is merged${it.prUrl ? ` (${it.prUrl})` : ''}, and once the change is live where the post sends people. Change nothing in the repo. Report each post's link.`,
    `## Distribution (from the pitch)\n\n${dist}`,
    notes.trim() ? `## Notes from the review\n\n${notes.trim()}` : '',
    `Product: ${it.product || it.repo}`,
  ].filter(Boolean)
  return { title, description: desc.join('\n\n') }
}

const APPROVED = { design: approvedWords, spec: specApprovedWords }
const BACK = { design: backWords, spec: specBackWords, result: resultBackWords }

/** Send the work back with the owner's words. The board turns a plan-ready task back to its plan step itself. */
export function sendBack(board, item, text) {
  if (!String(text ?? '').trim()) return { ok: false, error: 'nothing to send' }
  const r = board.tell(item.id, BACK[item.kind] ? BACK[item.kind](text) : text.trim())
  return r.ok ? { ok: true, how: 'sent back' } : { ok: false, error: r.error }
}

/**
 * Approve and see the build start.
 *
 * design: one `tell`, the agent goes on in the same conversation with its usual access.
 * plan:   `approve`, then nothing is sent until `plan.built` is set: a message that arrives between the yes
 *         and the build's start ends the build before it starts (the board moves the task back to working,
 *         its build runner quits) and leaves the agent in its plan mode on a read-only worktree. If that
 *         happens anyway (stuck), repair: `stop`, then `delegate --now --plan.approve none`, which builds
 *         the approved plan with the agent's usual access.
 * stuck:  the repair straight away.
 * Notes (approved with notes) are told only once the build runs.
 *
 * io: { board, sleep(ms) → Promise, now() → ms, log(line), timeoutMs, pollMs }
 */
export async function approve(item, { board, sleep, now = Date.now, log = () => {}, notes = '', timeoutMs = 4 * MINUTE, pollMs = 3000 }) {
  if (item.kind === 'result') return approveResult(item, { board, log, notes })
  if (APPROVED[item.kind]) {
    const r = board.tell(item.id, APPROVED[item.kind](notes))
    if (!r.ok) return { ok: false, error: r.error }
    log('approved: told the agent to build')
    return { ok: true, how: 'told' }
  }
  if (item.kind === 'pr') return { ok: false, error: 'a PR is approved on GitHub, not here' }
  let repaired = false
  const repair = () => {
    log('the build did not start: stop, then delegate')
    const s = board.stop(item.id)
    if (!s.ok) return s
    const d = board.delegate(item.id, ['--now', '--plan.approve', 'none'])
    repaired = true
    return d
  }
  if (item.kind === 'stuck') {
    const r = repair()
    if (!r.ok) return { ok: false, error: r.error }
  } else {
    const r = board.approve(item.id)
    if (!r.ok) return { ok: false, error: r.error }
    log('approved: waiting for the build to start')
  }
  const until = now() + timeoutMs
  while (now() < until) {
    await sleep(pollMs)
    const d = board.details(item.id)
    if (d?.plan?.built) {
      if (notes.trim()) {
        const t = board.tell(item.id, `Notes from the design review (guidance, not a send back):\n\n${notes.trim()}`)
        if (!t.ok) log(`notes not sent: ${t.error}`)
      }
      log(repaired ? 'building (repaired)' : 'building')
      return { ok: true, how: repaired ? 'repaired' : 'built' }
    }
    if (d?.task?.stage === 'failed') return { ok: false, error: d.failure?.msg || d.task.msg || 'the build failed to start' }
    if (!repaired && stuck(d)) {
      const r = repair()
      if (!r.ok) return { ok: false, error: r.error }
    }
  }
  return { ok: false, error: 'the build did not start in time: look at the task on the board' }
}

/**
 * A result's approve is the board's own yes on its ready-to-approve: the board merges the PR under its rules
 * (the reviewed head, its checks). Nothing is told to the agent, so the PR head does not move. Before: a PR that
 * still waits for the owner's approval on GitHub (a CODEOWNERS path, a new runtime dependency) is approved there
 * first, or the board's merge would fail. After: the drafts go out as a task of their own, after the merge.
 */
export function approveResult(item, { board, log = () => {}, notes = '' }) {
  if (!item.ready) return { ok: false, error: 'the board has not brought it as ready to approve yet (its PR, check or review is not done): send it back so it ends its turn' }
  if (item.github) return { ok: false, error: `approve its PR on GitHub first (${item.github}), then here` }
  const r = board.approve(item.id)
  if (!r.ok) return { ok: false, error: r.error }
  log('approved: the board merges it')
  const post = postTask(item, notes)
  if (!post) return { ok: true, how: 'merging' }
  const a = board.add(post.title, ['--desc', post.description, '--repo', item.repo, '--after', item.id, '--research', '--delegate'])
  if (!a.ok) {
    log(`the post task was not added: ${a.error}`)
    return { ok: true, how: 'merging', warn: `post the drafts by hand: ${a.error}` }
  }
  log('the drafts go out after the merge (a task of their own)')
  return { ok: true, how: 'merging', posts: true }
}

/**
 * What a Plannotator result asks for. Its JSON: {"decision":"approved"} (maybe with "feedback", the
 * notes of an approve with notes), {"decision":"annotated","feedback":"…"}, {"decision":"dismissed"}.
 */
export function fromAnnotation(result) {
  if (!result || typeof result !== 'object') return { action: 'none' }
  const feedback = typeof result.feedback === 'string' ? result.feedback.trim() : ''
  if (result.decision === 'approved') return { action: 'approve', notes: feedback }
  if (result.decision === 'annotated' && feedback) return { action: 'back', text: feedback }
  return { action: 'none' }
}

/** The CEO's herdr workspace for a repo: AGENT_KIT_REVIEW_WORKSPACE (id or label), else the "ceo" one of that repo, else any "ceo", else the fallback. */
export function ceoWorkspace(workspaces = [], repo, { env = {}, fallback = null } = {}) {
  const want = env.AGENT_KIT_REVIEW_WORKSPACE
  if (want) {
    const w = workspaces.find((w) => w.workspace_id === want || w.label === want)
    if (w) return w.workspace_id
  }
  const ceo = workspaces.filter((w) => String(w.label).toLowerCase() === 'ceo')
  const own = ceo.find((w) => w.worktree?.repo_name === repo || w.tokens?.repo === repo)
  return (own ?? ceo[0])?.workspace_id ?? fallback
}

/**
 * The one document the owner reads in Plannotator: what it is, every link whole and typed, where the
 * OpenSpec change is, then the brief or the pitch as the agent wrote it.
 */
export function briefDoc(it) {
  const what = { spec: 'Spec', design: 'Design', result: 'Result', plan: 'Plan', stuck: 'Plan' }[it.kind] ?? 'Review'
  const links = (it.links ?? []).map((l) => `- ${linkName(l)}: ${l.url}`).join('\n')
  const head = [`# ${what} for review: ${it.line || it.title}`, '', `${it.key} · ${it.product && it.product !== it.repo ? `${it.product} (${it.repo})` : it.repo}`]
  if (it.change) head.push('', `OpenSpec change: ${it.change}`)
  if (links) head.push('', 'Links:', '', links)
  return `${head.join('\n')}\n\n---\n\n${String(it.brief ?? '').trim()}\n`
}

/**
 * Where the pane opens: below the work board (the herdr-projects plugin's "Work board" pane), preferring
 * one in the caller's workspace; with no board open, to the right of the focused pane.
 * panes: herdr's `pane list`. Answers { target, direction }.
 */
export function paneSpot(panes = [], { focused, workspace } = {}) {
  const isBoard = (p) => p?.label === 'Work board' || (/herdr-projects/.test(String(p?.cwd ?? '')) && !p?.agent)
  const boards = panes.filter(isBoard)
  const board = boards.find((p) => p.workspace_id === workspace) ?? boards[0]
  return board ? { target: board.pane_id, direction: 'down' } : { target: focused, direction: 'right' }
}

/** Tasks to announce: new to `seen` (id → brief hash), every kind but stuck. */
export function toNotify(items, seen = {}) {
  return items.filter((it) => it.kind !== 'stuck' && seen[it.id] !== it.hash)
}

// ---------- the screen ----------

/** Word-wrap one paragraph to `width`; a word longer than the line is broken. */
export function wrap(text, width) {
  const w = Math.max(1, width)
  const out = []
  for (const para of String(text).split('\n')) {
    let line = ''
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (word.length > w) {
        if (line) {
          out.push(line)
          line = ''
        }
        out.push(word.slice(0, w))
        word = word.slice(w)
      }
      if (!line) line = word
      else if (line.length + 1 + word.length <= w) line += ` ${word}`
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

/** A URL as lines of its own: whole when it fits, else broken hard at `width` with nothing added. */
export function urlLines(url, width) {
  const w = Math.max(1, width)
  const out = []
  for (let i = 0; i < url.length; i += w) out.push(url.slice(i, i + w))
  return out
}

/** The kind column of a row. */
export const KIND = { spec: 'spec', design: 'design', result: 'result', plan: 'plan', stuck: 'stuck', pr: 'GitHub' }

/** What a link is called in the detail. */
const TYPE = { artifact: 'Artifact', pr: 'PR', video: 'Video', image: 'Screenshot', link: 'Link' }
const SAYS = { pr: /^(?:pr|pull request)\b/i }

/** A link's name: its type, then its label; the label alone when it already says the type ("Video, desktop"). */
export function linkName(link) {
  const type = TYPE[link.type ?? 'artifact'] ?? 'Link'
  if (!link.label) return type
  const says = SAYS[link.type] ?? new RegExp(`^${type}\\b`, 'i')
  return says.test(link.label) ? link.label : `${type}: ${link.label}`
}

/** What approve does, by kind, for the footer and the question before it. */
const APPROVES = { spec: 'approve + build', design: 'approve + build', plan: 'approve + build', result: 'approve + merge' }

/** The CI state of a PR, in a word. */
const CI = { passing: 'CI green', failing: 'CI failing', pending: 'CI running', none: 'no CI' }
const cut = (s, n) => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`)

/** The keys, in the order the footer shows them (the approve label follows the selected kind). */
export const KEYS = [
  ['⏎/p', 'review in Plannotator'],
  ['a', 'approve'],
  ['b', 'send back'],
  ['1-9', 'open link'],
  ['o', 'open all'],
  ['y1-9', 'copy link'],
  ['s', 'skip'],
  ['S', 'skipped'],
  ['f', 'repair'],
  ['g', 'board'],
  ['?', 'keys'],
  ['q', 'quit'],
]

/** The keys for a PR: it opens in the browser, nothing approves from here (approval stays on GitHub). */
export const PR_KEYS = [
  ['⏎/1/o', 'open the PR in the browser'],
  ['y1', 'copy the URL'],
  ['s', 'skip'],
  ['S', 'skipped'],
  ['r', 'refresh'],
  ['g', 'board'],
  ['?', 'keys'],
  ['q', 'quit'],
]

/**
 * The pane as lines: [{ t: text, s: style, url? }], `rows` of them at most, none longer than `cols`.
 * Styles: head, sel, dim, link, warn, ok, ''. A line with `url` is (part of) that link.
 *
 * state: { items, sel, scroll, now, mode: 'list'|'confirm'|'input'|'help', input, status, statusOf(id),
 *          skipped (count hidden), showSkipped, prNote (why the PR rows are not complete: loading, errors) }
 * items: one list, newest first (merge()): kind spec, design, result, plan, stuck, pr. Each row is
 * kind, product, age and one line; the detail below has the key and every link whole.
 */
export function render(state, cols, rows) {
  const W = Math.max(20, cols)
  const H = Math.max(8, rows)
  const { items = [], sel = 0, now = Date.now(), mode = 'list' } = state
  const sep = { t: '─'.repeat(W), s: 'dim' }
  const top = []
  const count = items.length
  const hidden = state.skipped ? ` · ${state.skipped} skipped` : ''
  const nPr = items.filter((it) => it.kind === 'pr').length
  const counts = `${count} waiting${nPr ? ` (${nPr} on GitHub)` : ''}`
  top.push({ t: cut(` Review list · ${counts}${hidden}${state.showSkipped ? ' (showing skipped)' : ''}`, W), s: 'head' })
  top.push(sep)
  if (!count) top.push({ t: cut(state.prNote ? ' Nothing on the board waits for you.' : ' Nothing waits for you: no spec, design, result or PR.', W), s: 'dim' })
  const listRows = Math.min(count, Math.max(1, Math.min(8, Math.floor(H / 4))))
  const first = Math.min(Math.max(0, sel - listRows + 1), Math.max(0, count - listRows))
  // The product column is as wide as the longest product shown, up to 14.
  const pw = Math.min(14, Math.max(7, ...items.slice(first, first + listRows).map((it) => String(it.product ?? it.repo ?? '').length)))
  for (let i = first; i < first + listRows && i < count; i++) {
    const it = items[i]
    const st = state.statusOf?.(it.id)
    const tag = st?.short || (it.kind === 'pr' && it.draft ? 'draft' : KIND[it.kind] ?? it.kind)
    const product = cut(String(it.product ?? it.repo ?? ''), pw).padEnd(pw)
    const head = `${i === sel ? '▸' : ' '} ${tag.padEnd(6)} ${product} ${age(it.at, now).padStart(6)}  `
    top.push({ t: cut(head + (it.line || it.title || ''), W), s: i === sel ? 'sel' : it.kind === 'stuck' || (it.kind === 'pr' && it.draft) ? 'warn' : '' })
  }
  if (count > listRows) top.push({ t: cut(` ${first + 1}-${Math.min(count, first + listRows)} of ${count} (↑↓)`, W), s: 'dim' })
  if (state.prNote) top.push({ t: cut(` ${state.prNote}`, W), s: 'warn' })
  top.push(sep)

  const foot = [sep]
  const cur = items[sel]
  if (mode === 'confirm')
    foot.push({ t: cut(cur?.kind === 'result' ? ` Approve ${cur?.key}: the board merges it, then the drafts post? y / n` : ` Approve ${cur?.key} and start the build? y / n`, W), s: 'warn' })
  else if (mode === 'input') {
    foot.push({ t: cut(' Send back (Enter sends, Esc cancels):', W), s: 'warn' })
    for (const l of wrap(`> ${state.input ?? ''}▏`, W)) foot.push({ t: l, s: '' })
  } else {
    const keys = cur?.kind === 'pr' ? PR_KEYS : KEYS.map(([k, v]) => [k, k === 'a' ? APPROVES[cur?.kind] ?? v : v])
    const parts = keys.map(([k, v]) => `${k} ${v}`)
    let line = ''
    for (const p of parts) {
      if (line && line.length + 2 + p.length > W - 1) {
        foot.push({ t: ` ${line}`, s: 'dim' })
        line = p
      } else line = line ? `${line}  ${p}` : p
    }
    if (line) foot.push({ t: ` ${line}`, s: 'dim' })
  }
  if (state.status) foot.push({ t: cut(` ${state.status}`, W), s: state.statusStyle || 'ok' })

  const room = H - top.length - foot.length
  const body = mode === 'help' ? helpBlocks(W) : detailBlocks(items[sel], state, W, now)
  const shown = []
  const total = body.reduce((n, b) => n + b.length, 0)
  let skip = Math.max(0, state.scroll ?? 0)
  let used = 0
  let more = false
  for (const block of body) {
    if (skip >= block.length) {
      skip -= block.length
      continue
    }
    // A link is never cut: a block that does not fit whole waits for the next scroll (unless nothing is
    // shown yet: then it is shown as far as the pane goes, which only a pane too short for one URL does).
    const part = block.atomic ? block : block.slice(skip)
    skip = 0
    if (used + part.length > room - 1 && !(block.atomic && used === 0)) {
      if (!block.atomic) {
        const fit = Math.max(0, room - 1 - used)
        shown.push(...part.slice(0, fit))
        used += fit
      }
      more = true
      break
    }
    shown.push(...part)
    used += part.length
  }
  if (more) shown.push({ t: cut(` ↓ more (J/K or PgDn/PgUp scroll) ${Math.min(total, (state.scroll ?? 0) + used)}/${total}`, W), s: 'dim' })
  while (top.length + shown.length + foot.length < H) shown.push({ t: '', s: '' })
  return [...top, ...shown, ...foot].slice(0, H)
}

function detailBlocks(it, state, W, now) {
  if (!it) return []
  if (it.kind === 'pr') return prBlocks(it, state, W, now)
  const blocks = []
  const st = state.statusOf?.(it.id)
  const what = { spec: 'spec ready', design: 'design ready', result: 'result ready', plan: 'plan ready', stuck: 'approved, not building' }[it.kind]
  const product = it.product && it.product !== it.repo ? `${it.product} (${it.repo})` : it.repo
  const head = [{ t: cut(` ${it.key} · ${product} · ${what} ${age(it.at, now)} ago`, W), s: it.kind === 'stuck' ? 'warn' : 'head' }]
  for (const l of wrap(it.title, W - 1)) head.push({ t: ` ${l}`, s: '' })
  if (it.line && it.line !== it.title) for (const l of wrap(it.line, W - 1)) head.push({ t: ` ${l}`, s: 'dim' })
  if (st?.line) for (const l of wrap(st.line, W - 1)) head.push({ t: ` ${l}`, s: st.ok === false ? 'warn' : 'ok' })
  if (it.kind === 'stuck') for (const l of wrap('Its plan was approved, but the build never started (the agent may still be in plan mode, its worktree read-only). f repairs: stop, then delegate.', W - 1)) head.push({ t: ` ${l}`, s: 'warn' })
  const errors = (it.findings ?? []).filter((f) => f.level === 'error')
  if (errors.length) {
    const shown = errors.slice(0, 3).map((f) => f.what).join('; ')
    for (const l of wrap(`Not complete: ${shown}${errors.length > 3 ? `; and ${errors.length - 3} more` : ''}. Send it back or ask the agent.`, W - 1)) head.push({ t: ` ${l}`, s: 'warn' })
  }
  if (it.github) for (const l of wrap(`Its PR also waits for your approval on GitHub (${it.github}): approve the PR there first, then the result here (the board merges it).`, W - 1)) head.push({ t: ` ${l}`, s: 'warn' })
  if (it.ready) for (const l of wrap(`Ready to approve on the board${it.boardSays ? `: ${it.boardSays}` : ''}`, W - 1)) head.push({ t: ` ${l}`, s: 'dim' })
  else if (it.boardSays) for (const l of wrap(`The board marked it an error (${it.boardSays}), but its last report stands: approve or send back as usual.`, W - 1)) head.push({ t: ` ${l}`, s: 'warn' })
  blocks.push(head)
  const links = it.links ?? []
  if (links.length) {
    blocks.push([{ t: ' Links', s: 'head' }])
    links.forEach((link, i) => {
      // The label with its link, as one block: never a label at the bottom edge and its URL off screen.
      const block = []
      for (const l of wrap(`[${i + 1}] ${linkName(link)}`, W - 1)) block.push({ t: ` ${l}`, s: '' })
      for (const l of urlLines(link.url, W)) block.push({ t: l, s: 'link', url: link.url })
      block.atomic = true
      blocks.push(block)
    })
  } else blocks.push([{ t: ' No links in the brief.', s: 'dim' }])
  const files = [
    it.briefFile && ['Brief file (⏎ opens it in Plannotator)', it.briefFile],
    it.change && ['OpenSpec change', it.change],
  ].filter(Boolean)
  for (const [name, path] of files) {
    const url = path.startsWith('/') ? `file://${path}` : ''
    const block = [{ t: cut(` ${name}`, W), s: 'dim' }, ...urlLines(path, W).map((t) => ({ t, s: url ? 'link' : '', ...(url ? { url } : {}) }))]
    block.atomic = true
    blocks.push(block)
  }
  const other = [it.planLink && ['Plan', it.planLink], it.reportLink && ['Report', it.reportLink]].filter(Boolean)
  for (const [name, url] of other) {
    const block = [{ t: ` ${name}`, s: 'dim' }, ...urlLines(url, W).map((t) => ({ t, s: 'link', url }))]
    block.atomic = true
    blocks.push(block)
  }
  // The brief, with every link in it on lines of its own, whole, as in Links above.
  let text = [{ t: ' Brief', s: 'head' }]
  const words = (part) => {
    for (const l of wrap(part, W - 1)) text.push({ t: ` ${l}`, s: '' })
  }
  for (const line of String(it.brief || '(no brief)').split('\n')) {
    // split() with a capturing group keeps the links: text, link, text, link, …, text.
    const parts = line.split(new RegExp(`(${URL_RE.source})`))
    if (parts.length === 1) {
      words(line)
      continue
    }
    parts.forEach((raw, i) => {
      if (i % 2 === 0) {
        const clean = raw.replace(/^[\s).,;:*_]+|[\s(:*_]+$/g, '')
        if (clean) words(clean)
        return
      }
      // Punctuation after a link ("…/pull/7.") is the sentence's, not the link's.
      const part = trimUrl(raw)
      if (part !== raw) parts[i + 1] = raw.slice(part.length) + (parts[i + 1] ?? '')
      blocks.push(text)
      const link = urlLines(part, W).map((t) => ({ t, s: 'link', url: part }))
      link.atomic = true
      blocks.push(link)
      text = []
    })
  }
  blocks.push(text)
  return blocks
}

/** The detail of a PR: the whole URL, who and why, the gate-reviewer's sentences, CI. Nothing here approves. */
function prBlocks(it, state, W, now) {
  const blocks = []
  const st = state.statusOf?.(it.id)
  const head = [{ t: cut(` ${it.key} · ${it.repo} · open ${age(it.at, now)}${it.draft ? ' · DRAFT' : ''}`, W), s: it.draft ? 'warn' : 'head' }]
  for (const l of wrap(it.title, W - 1)) head.push({ t: ` ${l}`, s: '' })
  if (st?.line) for (const l of wrap(st.line, W - 1)) head.push({ t: ` ${l}`, s: 'ok' })
  if (it.result) for (const l of wrap(`Its result pitch waits in this list too (${it.result}).`, W - 1)) head.push({ t: ` ${l}`, s: 'dim' })
  blocks.push(head)
  if (it.draft)
    blocks.push(wrap(`It is still a draft, although it waits for you. Mark it ready for review (gh pr ready) or tell its agent.${it.agentWorking ? ' Its task still reads "working" on the board.' : ''}`, W - 1).map((t) => ({ t: ` ${t}`, s: 'warn' })))
  const link = [{ t: ' Pull request', s: 'dim' }, ...urlLines(it.url, W).map((t) => ({ t, s: 'link', url: it.url }))]
  link.atomic = true
  blocks.push(link)
  blocks.push([{ t: ' Why it needs you', s: 'head' }, ...it.why.flatMap((w) => wrap(`- ${w}`, W - 1).map((t) => ({ t: ` ${t}`, s: '' })))])
  const ci = [{ t: cut(` ${CI[it.ci] ?? it.ci}${it.ciFailing?.length ? `: ${it.ciFailing.join(', ')}` : ''}`, W), s: it.ci === 'failing' ? 'warn' : it.ci === 'passing' ? 'ok' : 'dim' }]
  blocks.push(ci)
  blocks.push([
    { t: ' What to decide', s: 'head' },
    ...wrap(it.sentences || 'No gate-reviewer sentences in the PR body or the task report. Open the PR.', W - 1).map((t) => ({ t: ` ${t}`, s: it.sentences ? '' : 'dim' })),
  ])
  blocks.push([{ t: cut(' Approval stays on GitHub: open the PR and approve it there.', W), s: 'dim' }])
  return blocks
}

function helpBlocks(W) {
  const lines = [{ t: ' Keys', s: 'head' }]
  const help = [
    ['↑↓ j k', 'choose a row (newest first)'],
    ['J K PgDn PgUp space', 'scroll the details'],
    ['GitHub rows', '⏎, 1 or o open the pull request in the browser, y then 1 copies its URL. Nothing approves from here: approval stays on GitHub'],
    ['⏎ or p', 'open the brief or the pitch for review in Plannotator, in a new tab of the CEO workspace: A approves, E sends the comments back'],
    ['a', 'approve (asks first): a spec or a design starts the build; a result is the board\'s approve, which merges it, and its drafts go out on the brand accounts after the merge'],
    ['b', 'send back with a one-line comment, to the same agent'],
    ['1-9 / o', 'open one link (artifact, video, screenshot, PR) / all of them in the browser'],
    ['y then 1-9', 'copy a link, whole'],
    ['s / S', 'skip until the brief changes / show skipped'],
    ['f', 'repair a task approved but not building'],
    ['g', 'open the work board'],
    ['r', 'refresh now'],
    ['q', 'quit'],
  ]
  for (const [k, v] of help) {
    lines.push({ t: cut(` ${k}`, W), s: 'head' })
    for (const l of wrap(v, W - 4)) lines.push({ t: `    ${l}`, s: '' })
  }
  return [lines]
}
