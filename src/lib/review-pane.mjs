/**
 * The "Design review" pane: the terminal part of `agent-kit review pane` (src/review.mjs). The rules and
 * the screen are in review.mjs; this file reads keys, draws, and watches the board's task folder, so the
 * list stays current while agents work. No dependencies: raw mode and ANSI, like the other kit panes.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from './review.mjs'

const ESC = '\x1b'
const STYLE = {
  head: `${ESC}[1m`,
  sel: `${ESC}[7m`,
  dim: `${ESC}[2m`,
  link: `${ESC}[4;36m`,
  warn: `${ESC}[33m`,
  ok: `${ESC}[32m`,
  '': '',
}

/** Split terminal input into keys: arrows, PgUp/PgDn, Enter, Esc, Backspace, Ctrl-C, characters. */
export function keys(chunk) {
  const out = []
  for (const m of String(chunk).matchAll(/\x1b\[[0-9;]*[~A-Za-z]|\x1bO[A-Z]|\x1b|[\s\S]/gu)) {
    const k = m[0]
    out.push(
      {
        '\x1b[A': 'up', '\x1bOA': 'up', '\x1b[B': 'down', '\x1bOB': 'down',
        '\x1b[5~': 'pgup', '\x1b[6~': 'pgdn', '\r': 'enter', '\n': 'enter',
        '\x7f': 'backspace', '\b': 'backspace', '\x1b': 'esc', '\x03': 'ctrl-c',
      }[k] ?? (k.startsWith('\x1b') ? null : k),
    )
  }
  return out.filter(Boolean)
}

/**
 * One key against the pane's state. `act` does the outside work:
 * { review(item), approve(item), back(item, text), open(url), copy(url), skip(item), board(), refresh(), quit() }.
 * Returns nothing; changes `s`.
 */
export function onKey(s, key, act, page = 10) {
  const it = s.items[s.sel]
  const say = (status, style = 'ok') => Object.assign(s, { status, statusStyle: style })
  if (s.mode === 'help') {
    s.mode = 'list'
    return
  }
  if (s.mode === 'confirm') {
    s.mode = 'list'
    if (key === 'y' || key === 'Y') {
      act.approve(it)
      say(`${it.key}: approving…`)
    } else say('Not approved.', 'dim')
    return
  }
  if (s.mode === 'input') {
    if (key === 'esc') Object.assign(s, { mode: 'list', input: '' }) && say('Nothing sent.', 'dim')
    else if (key === 'enter') {
      const text = s.input.trim()
      s.mode = 'list'
      s.input = ''
      if (!text) return say('Nothing sent.', 'dim')
      const r = act.back(it, text)
      r.ok ? say(`${it.key}: sent back to the design stage.`) : say(`${it.key}: not sent: ${r.error}`, 'warn')
    } else if (key === 'backspace') s.input = s.input.slice(0, -1)
    else if (key.length === 1 && key >= ' ') s.input += key
    return
  }
  if (s.copying) {
    s.copying = false
    const link = it?.links[Number(key) - 1]
    if (link) {
      act.copy(link.url)
      say(`Copied [${key}], the whole link.`)
    } else say('No such link.', 'dim')
    return
  }
  const move = (d) => {
    s.sel = Math.max(0, Math.min(s.items.length - 1, s.sel + d))
    s.scroll = 0
  }
  switch (key) {
    case 'up':
    case 'k':
      return move(-1)
    case 'down':
    case 'j':
      return move(1)
    case 'J':
      s.scroll += 3
      return
    case 'K':
      s.scroll = Math.max(0, s.scroll - 3)
      return
    case 'pgdn':
    case ' ':
      s.scroll += page
      return
    case 'pgup':
      s.scroll = Math.max(0, s.scroll - page)
      return
    case 'q':
    case 'ctrl-c':
      return act.quit()
    case '?':
      s.mode = 'help'
      return
    case 'r':
      act.refresh()
      return say('Refreshed.', 'dim')
    case 'S':
      s.showSkipped = !s.showSkipped
      act.refresh()
      return
    case 'g':
      return act.board()
  }
  if (!it) return
  if (key === 'enter' || key === 'p') {
    const r = act.review(it)
    return r.ok ? say(`${it.key}: open for review in a new tab.`) : say(r.error, 'warn')
  }
  if (key === 'a') {
    if (it.kind === 'stuck') return say(`${it.key} is approved already: f repairs its build.`, 'warn')
    s.mode = 'confirm'
    return
  }
  if (key === 'f') {
    if (it.kind !== 'stuck') return say('f repairs a task approved but not building.', 'dim')
    act.approve(it)
    return say(`${it.key}: repairing (stop, then delegate)…`)
  }
  if (key === 'b') {
    if (it.kind === 'stuck') return say(`${it.key} is approved already: nothing to send back.`, 'warn')
    s.mode = 'input'
    s.input = ''
    return
  }
  if (/^[1-9]$/.test(key)) {
    const link = it.links[Number(key) - 1]
    if (!link) return say('No such link.', 'dim')
    act.open(link.url)
    return say(`Opened [${key}] in the browser.`)
  }
  if (key === 'o') {
    for (const l of it.links) act.open(l.url)
    return say(it.links.length ? `Opened ${it.links.length} link(s).` : 'No links.', 'dim')
  }
  if (key === 'y') {
    s.copying = true
    return say('Copy which link? 1-9', 'warn')
  }
  if (key === 's') {
    act.skip(it)
    return say(`${it.key}: skipped until its brief changes (S shows skipped).`, 'dim')
  }
}

/** A line for the terminal: its style, a hyperlink (OSC 8) when it is part of a link, the rest cleared. */
export function paint(line) {
  const text = line.url ? `${ESC}]8;;${line.url}${ESC}\\${line.t}${ESC}]8;;${ESC}\\` : line.t
  return `${STYLE[line.s] ?? ''}${text}${ESC}[0m${ESC}[K`
}

const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}
const writeJson = (p, v) => {
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`)
}

/** Run the pane until q. deps come from src/review.mjs. */
export async function runPane({ waiting, data, STATE, statusFile, skipsFile, approveDetached, openForReview, sendBack, board }) {
  const out = process.stdout
  const s = { items: [], sel: 0, scroll: 0, mode: 'list', input: '', status: '', showSkipped: false, skipped: 0 }
  let statuses = {}
  const opener = process.platform === 'darwin' ? ['open'] : ['xdg-open']
  const copier = process.platform === 'darwin' ? ['pbcopy'] : ['xclip', '-selection', 'clipboard']

  const refresh = () => {
    const keep = s.items[s.sel]?.id
    let all = []
    try {
      all = waiting()
    } catch (e) {
      // Keep what was shown; an unreachable board is not an empty one.
      Object.assign(s, { status: e.message, statusStyle: 'warn' })
      return
    }
    const skips = readJson(skipsFile, {})
    const shown = s.showSkipped ? all : all.filter((it) => skips[it.id] !== it.hash)
    s.skipped = all.length - shown.length
    s.items = shown
    const i = shown.findIndex((it) => it.id === keep)
    s.sel = i >= 0 ? i : Math.min(s.sel, Math.max(0, shown.length - 1))
    readStatuses()
  }
  const readStatuses = () => {
    statuses = Object.fromEntries(s.items.map((it) => [it.id, readJson(statusFile(it.id), null)]))
  }
  // A status older than the brief belongs to an earlier round.
  s.statusOf = (id) => {
    const st = statuses[id]
    const it = s.items.find((x) => x.id === id)
    return st && (!it?.at || st.at >= it.at) ? st : null
  }

  const draw = () => {
    s.now = Date.now()
    const rows = out.rows || 40
    // One column short of the edge: a clear-to-end at the last column would erase that character.
    const lines = render(s, (out.columns || 60) - 1, rows)
    out.write(`${ESC}[H${lines.map(paint).join('\r\n')}${ESC}[J`)
  }

  const act = {
    review: (it) => openForReview(it),
    approve: (it) => approveDetached(it.id),
    back: (it, text) => {
      const r = sendBack(board, it, text)
      if (r.ok) writeJson(statusFile(it.id), { ok: true, short: 'back', line: 'Sent back to the design stage.', at: Date.now() })
      readStatuses()
      return r
    },
    open: (url) => spawnSync(opener[0], [...opener.slice(1), url], { stdio: 'ignore' }),
    copy: (url) => spawnSync(copier[0], copier.slice(1), { input: url }),
    skip: (it) => {
      const skips = readJson(skipsFile, {})
      skips[it.id] = it.hash
      writeJson(skipsFile, skips)
      refresh()
    },
    board: () => spawnSync('herdr', ['plugin', 'action', 'invoke', 'open', '--plugin', 'herdr-projects'], { stdio: 'ignore' }),
    refresh,
    quit: () => {
      cleanup()
      process.exit(0)
    },
  }

  const paneFile = join(STATE, 'pane.json')
  const cleanup = () => {
    out.write(`${ESC}[?25h${ESC}[?1049l`)
    if (readJson(paneFile, {}).pane === process.env.HERDR_PANE_ID) rmSync(paneFile, { force: true })
  }
  if (process.env.HERDR_PANE_ID) writeJson(paneFile, { pane: process.env.HERDR_PANE_ID })
  out.write(`${ESC}[?1049h${ESC}[?25l`)
  process.on('SIGTERM', act.quit)
  process.on('SIGHUP', act.quit)
  process.on('exit', () => out.write(`${ESC}[?25h`))
  out.on('resize', draw)

  refresh()
  draw()
  if (process.stdin.isTTY) process.stdin.setRawMode(true)
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    for (const k of keys(chunk)) onKey(s, k, act, Math.max(3, (out.rows || 40) - 16))
    draw()
  })
  process.stdin.resume()

  // Live: the board writes a task's file on every change (by rename), so watch the folder, not the files.
  let timer = null
  const soon = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      refresh()
      draw()
    }, 400)
  }
  try {
    watch(join(data, 'tasks'), { recursive: true }, (_, file) => {
      if (!file || /task\.json$|plan\.md$|closing-note\.md$|report/.test(file)) soon()
    })
  } catch {}
  setInterval(() => {
    refresh()
    draw()
  }, 30 * 1000)
  // Ages tick and an approve's progress shows (its status file) without a board call.
  setInterval(() => {
    readStatuses()
    draw()
  }, 2000)
  await new Promise(() => {})
}
