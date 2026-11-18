/**
 * The design review gate (rules/design-review.md): which tasks on the herdr-projects work board wait for
 * the owner's design decision, what the pane shows for each, and what approve and send back do.
 *
 * Pure: the board, the files, the clock and sleep come in as arguments, so every rule here is tested
 * without a board (test/review.test.mjs). The board is used only through its CLI (list --json, details,
 * approve, tell, stop, delegate), never patched; its task files are only read.
 *
 * Three kinds of task wait here:
 *   design  "Design ready": the agent made the artifacts with its usual access and stopped with a report
 *           whose message starts with "Design ready". Approve and send back are a `tell`.
 *   plan    "Plan ready" (stage plan, plan.approve you) whose plan is a design brief. Approve is the
 *           board's approve, then a check that the build really starts.
 *   stuck   approved, but no build runs: the yes was given, `plan.built` never came, the worktree is still
 *           locked. The repair is stop, then delegate, which builds the approved plan.
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'

/** A Claude Artifact link, matched whole: https://claude.ai/artifact/<id> (or /code/artifact/<id>). */
export const ARTIFACT = /https:\/\/claude\.ai\/(?:code\/)?artifact\/[A-Za-z0-9_-]+/g

/** The description line that marks a task as UI work with a design review first. */
export const MARKER = /^\s*[-*]?\s*design review:\s*yes\b/im

/** The report message a design stage ends with. */
export const READY = /^design ready\b/i

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
    .replace(ARTIFACT, '')
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
  }
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
 * Every task waiting for a design decision, oldest first.
 * io: { board, data, readFile(path) → string|null, mtime(path) → ms|null, now }
 */
export function collect({ board, data, readFile, mtime, now = Date.now() }) {
  const items = []
  for (const row of board.list()) {
    if (!row?.id || row.stage === 'done' || row.archivedAt) continue
    const designReady = row.state === 'blocked' && READY.test(row.msg ?? '')
    const planReady = row.stage === 'plan'
    let maybeStuck = false
    if (!designReady && !planReady) {
      // Only a task whose own file says "approved, not built" is worth a details call.
      const raw = readFile(join(folder(data, row.id), 'task.json'))
      try {
        const p = raw ? JSON.parse(raw).plan : null
        maybeStuck = Boolean(p?.approvedAt && !p?.built && p?.locked)
      } catch {}
      if (!maybeStuck) continue
    }
    const d = board.details(row.id)
    if (!d?.task) continue
    const base = {
      id: row.id,
      key: d.task.id || row.id,
      repo: String(row.id).split('/')[0],
      title: d.task.title || row.title || '',
      msg: row.msg ?? '',
      description: d.task.description ?? '',
      reportLink: d.report?.link ?? '',
      planLink: d.plan?.link ?? '',
    }
    if (maybeStuck) {
      if (stuck(d)) items.push({ ...base, kind: 'stuck', brief: d.plan?.text ?? '', at: d.plan?.approvedAt })
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
    if (!isDesign(base.description)) continue
    const note = join(folder(data, row.id), 'closing-note.md')
    let brief = readFile(note)
    let at = mtime(note)
    if (!brief && d.report?.file) {
      const file = join(folder(data, row.id), 'artifacts', 'report', d.report.file)
      brief = readFile(file)
      at = d.report.at || mtime(file)
    }
    // The report is the newer word when the note was not rewritten (a send back, then Design ready again).
    const reported = (() => {
      try {
        return JSON.parse(readFile(join(folder(data, row.id), 'task.json')) ?? '{}').at
      } catch {
        return null
      }
    })()
    items.push({ ...base, kind: 'design', brief: brief || base.msg, at: Math.max(at || 0, reported || 0) || now })
  }
  for (const it of items) {
    it.links = artifactLinks(`${it.brief}\n${it.msg}`)
    // The brief and the report together: a new "Design ready" with the same note is a new round.
    it.hash = briefHash(`${it.brief}\n${it.msg}`)
  }
  return items.sort((a, b) => (a.at || 0) - (b.at || 0))
}

/** What the agent hears on a design approve (kind design), and on a send back of one. */
export const approvedWords = (notes = '') =>
  `Design approved. Build it now, from your brief and the approved artifacts.${notes.trim() ? `\n\nNotes from the review (guidance, not a send back):\n\n${notes.trim()}` : ''}`
export const backWords = (text) =>
  `Design sent back. The owner reviewed it and wrote:\n\n${text.trim()}\n\nRevise the design (update the same artifact URLs where you can), then stop again with a report whose message starts "Design ready".`

/** Send a design back with the owner's words. The board turns a plan-ready task back to its plan step itself. */
export function sendBack(board, item, text) {
  if (!String(text ?? '').trim()) return { ok: false, error: 'nothing to send' }
  const r = board.tell(item.id, item.kind === 'design' ? backWords(text) : text.trim())
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
  if (item.kind === 'design') {
    const r = board.tell(item.id, approvedWords(notes))
    if (!r.ok) return { ok: false, error: r.error }
    log('approved: told the agent to build')
    return { ok: true, how: 'told' }
  }
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

/** Tasks to announce: new to `seen` (id → brief hash), design and plan kinds only. */
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

const KIND = { design: 'design', plan: 'plan', stuck: 'stuck', pr: 'PR' }

/** The CI state of a PR, in a word. */
const CI = { passing: 'CI green', failing: 'CI failing', pending: 'CI running', none: 'no CI' }
const cut = (s, n) => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`)

/** The keys, in the order the footer shows them. */
export const KEYS = [
  ['⏎/p', 'review in Plannotator'],
  ['a', 'approve + build'],
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
 *          skipped (count hidden), showSkipped, prNote (why the PR section is not complete: loading, errors) }
 * items: designs first (kind design, plan, stuck), then PRs (kind pr), each group under its own heading.
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
  const counts = `${count - nPr} to approve${nPr || state.prNote ? ` · ${nPr} PR${nPr === 1 ? '' : 's'}` : ''}`
  top.push({ t: cut(` Waiting for you · ${counts}${hidden}${state.showSkipped ? ' (showing skipped)' : ''}`, W), s: 'head' })
  top.push(sep)
  if (!count) top.push({ t: cut(state.prNote ? ' No designs wait for you.' : ' Nothing waits for you: no design and no PR.', W), s: 'dim' })
  const listRows = Math.min(count, Math.max(1, Math.min(6, Math.floor(H / 4))))
  const first = Math.min(Math.max(0, sel - listRows + 1), Math.max(0, count - listRows))
  for (let i = first; i < first + listRows && i < count; i++) {
    const it = items[i]
    // A heading where a group starts: the designs, then the PRs.
    if (i === first || (it.kind === 'pr') !== (items[i - 1].kind === 'pr'))
      top.push({ t: cut(it.kind === 'pr' ? ' PRs to approve (on GitHub)' : ' Designs to approve', W), s: 'dim' })
    const st = state.statusOf?.(it.id)
    const tag = st?.short || (it.kind === 'pr' ? (it.draft ? 'draft' : KIND.pr) : KIND[it.kind])
    const head = `${i === sel ? '▸' : ' '} ${it.key.padEnd(it.kind === 'pr' ? 12 : 8)} ${age(it.at, now).padStart(7)}  ${tag.padEnd(6)} `
    top.push({ t: cut(head + it.title, W), s: i === sel ? 'sel' : it.kind === 'pr' && it.draft ? 'warn' : '' })
  }
  if (count > listRows) top.push({ t: cut(` ${first + 1}-${Math.min(count, first + listRows)} of ${count} (↑↓)`, W), s: 'dim' })
  if (state.prNote) top.push({ t: cut(` ${state.prNote}`, W), s: 'warn' })
  top.push(sep)

  const foot = [sep]
  if (mode === 'confirm') foot.push({ t: cut(` Approve ${items[sel]?.key} and start the build? y / n`, W), s: 'warn' })
  else if (mode === 'input') {
    foot.push({ t: cut(' Send back (Enter sends, Esc cancels):', W), s: 'warn' })
    for (const l of wrap(`> ${state.input ?? ''}▏`, W)) foot.push({ t: l, s: '' })
  } else {
    const parts = (items[sel]?.kind === 'pr' ? PR_KEYS : KEYS).map(([k, v]) => `${k} ${v}`)
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
  const what = { design: 'design ready', plan: 'plan ready', stuck: 'approved, not building' }[it.kind]
  const head = [{ t: cut(` ${it.key} · ${it.repo} · ${what} ${age(it.at, now)} ago`, W), s: it.kind === 'stuck' ? 'warn' : 'head' }]
  for (const l of wrap(it.title, W - 1)) head.push({ t: ` ${l}`, s: '' })
  if (st?.line) for (const l of wrap(st.line, W - 1)) head.push({ t: ` ${l}`, s: st.ok === false ? 'warn' : 'ok' })
  if (it.kind === 'stuck') for (const l of wrap('Its plan was approved, but the build never started (the agent may still be in plan mode, its worktree read-only). f repairs: stop, then delegate.', W - 1)) head.push({ t: ` ${l}`, s: 'warn' })
  blocks.push(head)
  if (it.links.length) {
    blocks.push([{ t: ' Artifacts', s: 'head' }])
    it.links.forEach((link, i) => {
      // The label with its link, as one block: never a label at the bottom edge and its URL off screen.
      const block = []
      for (const l of wrap(`[${i + 1}] ${link.label || 'artifact'}`, W - 1)) block.push({ t: ` ${l}`, s: '' })
      for (const l of urlLines(link.url, W)) block.push({ t: l, s: 'link', url: link.url })
      block.atomic = true
      blocks.push(block)
    })
  } else blocks.push([{ t: ' No artifact links in the brief.', s: 'dim' }])
  const other = [it.planLink && ['Plan', it.planLink], it.reportLink && ['Report', it.reportLink]].filter(Boolean)
  for (const [name, url] of other) {
    const block = [{ t: ` ${name}`, s: 'dim' }, ...urlLines(url, W).map((t) => ({ t, s: 'link', url }))]
    block.atomic = true
    blocks.push(block)
  }
  // The brief, with every artifact link in it on lines of its own, whole, as in Artifacts above.
  let text = [{ t: ' Brief', s: 'head' }]
  const words = (part) => {
    for (const l of wrap(part, W - 1)) text.push({ t: ` ${l}`, s: '' })
  }
  for (const line of String(it.brief || '(no brief)').split('\n')) {
    // split() with a capturing group keeps the links: text, link, text, link, …, text.
    const parts = line.split(new RegExp(`(${ARTIFACT.source})`))
    if (parts.length === 1) {
      words(line)
      continue
    }
    parts.forEach((part, i) => {
      if (i % 2 === 0) {
        const clean = part.replace(/^[\s).,;:]+|[\s(:]+$/g, '')
        if (clean) words(clean)
        return
      }
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
    ['↑↓ j k', 'choose a task'],
    ['J K PgDn PgUp space', 'scroll the details'],
    ['PRs', '⏎, 1 or o open the pull request in the browser, y then 1 copies its URL. Nothing approves from here: approval stays on GitHub'],
    ['⏎ or p', 'open the brief for review in Plannotator, in a new tab of the CEO workspace: A approves, E sends the comments back'],
    ['a', 'approve and start the build (asks first)'],
    ['b', 'send back with a one-line comment'],
    ['1-9 / o', 'open one artifact / all of them in the browser'],
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
