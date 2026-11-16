#!/usr/bin/env node
// Finds the real `gh pr merge` invocations in a shell command, for merge-gate.sh.
//
// Reads the command on stdin and prints one line per merge:
//   MERGE, repo or empty, target or empty   -R/--repo (or GH_REPO=) value, first argument
//   UNSAFE, why                             a merge whose repo or PR cannot be read literally
// (fields joined by the unit separator \x1f, one line per merge).
// Nothing is printed when the command runs no merge, also when its text merely
// mentions one (echo "gh pr merge 5", a commit message, a task description).
//
// It reads the command the way the shell does: quotes, ; | & && || newlines and
// ( ) split commands; `$(…)`, backticks, `bash -c '…'`, `eval`, here-docs fed to a
// shell and wrappers (env, xargs, sudo, find -exec …) are followed, so a merge
// behind any of them is still found. Text inside the quoted arguments of other
// commands is not a command.

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const WRAPPERS = new Set([
  'env', 'command', 'exec', 'time', 'sudo', 'doas', 'nohup', 'xargs', 'nice', 'ionice', 'timeout', 'stdbuf',
  'builtin', 'watch', 'find', 'parallel', 'setsid', 'caffeinate',
])
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'while', 'until', 'do', '!', '{', '}', 'time'])
// gh pr merge flags that take a value in the next word.
const VALUE_FLAGS = new Set(['-t', '--subject', '-b', '--body', '-F', '--body-file', '--match-head-commit', '-A', '--author-email'])

const base = (w) => w.replace(/^.*\//, '')
const isAssign = (w) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)

// Split src into simple commands: { words: [{ t: text, x: has an expansion, q: was quoted }], docs: [here-doc bodies] }.
function parse(src, out = []) {
  let i = 0
  let cmd = { words: [], docs: [] }
  let word = null
  const pendingDocs = [] // { delim, strip, cmd }
  let hereString = false // the next word is the text of a <<< here-string
  let lastPushed = null

  const addText = (s, x = false, q = false) => {
    if (!word) word = { t: '', x: false, q: false }
    word.t += s
    if (x) word.x = true
    if (q) word.q = true
  }
  const endWord = () => {
    if (!word) return
    if (hereString) { cmd.docs.push(word.t); hereString = false } else cmd.words.push(word)
    word = null
  }
  const endCmd = () => {
    endWord()
    if (cmd.words.length) { out.push(cmd); lastPushed = cmd }
    cmd = { words: [], docs: [] }
  }
  // The text up to the ) that closes the ( before i, quotes respected; leaves i after it.
  const readParen = () => {
    let depth = 1
    const start = i
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '\\') i += 2
      else if (c === "'") { i = src.indexOf("'", i + 1); i = i < 0 ? src.length : i + 1 }
      else if (c === '"') {
        i++
        while (i < src.length && src[i] !== '"') i += src[i] === '\\' ? 2 : 1
        i++
      } else {
        if (c === '(') depth++
        else if (c === ')') depth--
        i++
      }
    }
    return src.slice(start, Math.max(start, Math.min(i - 1, src.length)))
  }
  const readBacktick = () => {
    const start = i
    while (i < src.length && src[i] !== '`') i += src[i] === '\\' ? 2 : 1
    const s = src.slice(start, i)
    i++
    return s.replace(/\\`/g, '`')
  }
  // $( … ), `…` and $VAR inside a word or double quotes; the text of the first two runs as commands.
  const substitution = (q) => {
    const c = src[i]
    if (c === '`') {
      i++
      parse(readBacktick(), out)
      addText('`…`', true, q)
      return true
    }
    if (c === '$' && src[i + 1] === '(') {
      i += 2
      parse(readParen(), out)
      addText('$(…)', true, q)
      return true
    }
    if (c === '$' && /[A-Za-z_{0-9@*#?!-]/.test(src[i + 1] ?? '')) {
      let s = '$'
      i++
      if (src[i] === '{') {
        const e = src.indexOf('}', i)
        s += src.slice(i, e < 0 ? src.length : e + 1)
        i = e < 0 ? src.length : e + 1
      } else {
        s += src[i++]
        while (/[A-Za-z0-9_]/.test(src[i] ?? '')) s += src[i++]
      }
      addText(s, true, q)
      return true
    }
    return false
  }

  while (i < src.length) {
    const c = src[i]
    if (c === '\\') {
      if (src[i + 1] === '\n') { i += 2; continue }
      addText(src[i + 1] ?? '', false, true)
      i += 2
    } else if (c === "'") {
      const e = src.indexOf("'", i + 1)
      addText(src.slice(i + 1, e < 0 ? src.length : e), false, true)
      i = e < 0 ? src.length : e + 1
    } else if (c === '"') {
      i++
      addText('', false, true)
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) {
          if (/["\\$`]/.test(src[i + 1])) addText(src[i + 1], false, true)
          else if (src[i + 1] !== '\n') addText('\\' + src[i + 1], false, true)
          i += 2
        } else if (!substitution(true)) addText(src[i++], false, true)
      }
      i++
    } else if (c === '$' || c === '`') {
      if (!substitution(false)) addText(src[i++])
    } else if ((c === '<' || c === '>') && src[i + 1] === '(') {
      i += 2
      parse(readParen(), out)
      addText('<(…)', true)
    } else if (c === '#' && !word) {
      while (i < src.length && src[i] !== '\n') i++
    } else if (c === '\n') {
      endCmd()
      i++
      while (pendingDocs.length) {
        const d = pendingDocs.shift()
        const lines = []
        while (i < src.length) {
          let e = src.indexOf('\n', i)
          if (e < 0) e = src.length
          const line = src.slice(i, e)
          i = e + 1
          if ((d.strip ? line.replace(/^\t+/, '') : line) === d.delim) break
          lines.push(line)
        }
        d.cmd.docs.push(lines.join('\n'))
      }
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
      i++
    } else if (c === '<' && src[i + 1] === '<' && src[i + 2] === '<') {
      endWord()
      i += 3
      hereString = true
    } else if (c === '<' && src[i + 1] === '<') {
      // here-doc: its body follows after the end of this line.
      endWord()
      i += 2
      const strip = src[i] === '-'
      if (strip) i++
      while (src[i] === ' ' || src[i] === '\t') i++
      let delim = ''
      let q = null
      while (i < src.length && (q || !/[\s;|&()<>]/.test(src[i]))) {
        if (q) { if (src[i] === q) q = null; else delim += src[i] }
        else if (src[i] === "'" || src[i] === '"') q = src[i]
        else if (src[i] !== '\\') delim += src[i]
        i++
      }
      pendingDocs.push({ delim, strip, cmd })
    } else if (c === ';' || c === '|' || c === '(' || c === ')' || c === '&') {
      // `2>&1`, `>&2`, `&>file`: an & that belongs to a redirect.
      if (c === '&' && (/[<>]$/.test(word?.t ?? '') || src[i + 1] === '>')) {
        addText(c)
        i++
        continue
      }
      const isPipe = c === '|' && src[i + 1] !== '|'
      endCmd()
      i++
      if ((c === '&' || c === '|') && src[i] === c) i++
      if (isPipe) {
        if (src[i] === '&') i++ // |&
        cmd.pipedFrom = lastPushed // what feeds this command's stdin
      }
    } else {
      addText(c)
      i++
    }
  }
  endCmd()
  return out
}

// A redirect word (>file, 2>&1, <in) is not an argument; the file after a bare > or < goes too.
function dropRedirects(words) {
  const kept = []
  for (let k = 0; k < words.length; k++) {
    const w = words[k]
    if (!w.q && /^\d*[<>&]/.test(w.t)) {
      if (/^\d*(>>?|<|>\||&>>?)$/.test(w.t)) k++
      continue
    }
    kept.push(w)
  }
  return kept
}

function analyzeGh(args, envRepo, results) {
  const pos = []
  let repo = envRepo
  for (let k = 0; k < args.length; k++) {
    const t = args[k].t
    if (t === '-R' || t === '--repo') repo = args[++k] ?? { t: '', x: true }
    else if (/^--repo=/.test(t) || /^-R=?./.test(t)) repo = { t: t.replace(/^(--repo=|-R=?)/, ''), x: args[k].x }
    else if (VALUE_FLAGS.has(t)) k++
    else if (t.startsWith('-') && t !== '-') continue // --squash, -d, --admin …
    else pos.push(args[k])
  }
  if (pos[0]?.t !== 'pr' || pos[1]?.t !== 'merge') return
  const target = pos[2]
  if (target && /[%{\\]/.test(target.t)) results.push(['UNSAFE', 'a placeholder as the PR'])
  else if (target?.x) results.push(['UNSAFE', 'variable or substitution as the PR'])
  else if (repo?.x) results.push(['UNSAFE', 'variable or substitution as the repository'])
  else results.push(['MERGE', repo?.t ?? '', target?.t ?? ''])
}

// What a command's words say when something else runs them as shell: a loose match for
// `gh … pr … merge`, to fail closed on text that reaches a shell the parser cannot follow.
const LOOSE = /\bgh\b[^\n]*\bpr\b[^\n]*\bmerge\b/

// Package runners (pnpm exec, npx …), remote shells and interpreters run the text they are given.
const RUNNERS = new Set(['npx', 'pnpx', 'bunx', 'ssh', 'su', 'script', 'at', 'tmux', 'screen', 'docker', 'podman', 'kubectl', 'osascript'])
const MANAGERS = new Set(['pnpm', 'npm', 'yarn', 'bun'])
const INTERPRETERS = new Set(['node', 'nodejs', 'deno', 'python', 'python2', 'python3', 'ruby', 'perl', 'php'])

function analyze(cmd, results, depth, envRepo) {
  if (depth > 8) { results.push(['UNSAFE', 'commands nested too deep']); return }
  const words = dropRedirects(cmd.words)
  let repo = envRepo
  let i = 0
  while (i < words.length && (isAssign(words[i].t) || KEYWORDS.has(words[i].t))) {
    if (words[i].t.startsWith('GH_REPO=')) repo = { t: words[i].t.slice(8), x: words[i].x }
    i++
  }
  if (i >= words.length) return
  const name = base(words[i].t)
  const rest = words.slice(i + 1)
  const before = results.length
  // Code handed to something that runs it: if its text names a merge, the merge is
  // read from the text, and when that does not give one the command is refused.
  const loose = () => {
    const text = [...rest.map((w) => w.t), ...cmd.docs].join('\n')
    if (!LOOSE.test(text)) return
    for (const w of rest) if (LOOSE.test(w.t)) analyzeString(w.t, results, depth + 1, repo)
    if (!results.slice(before).some((r) => r[0] === 'MERGE')) results.push(['UNSAFE', 'a merge inside what ' + name + ' runs'])
  }
  if (name === 'gh') analyzeGh(rest, repo, results)
  else if (SHELLS.has(name)) {
    let code = false
    for (let j = 0; j < rest.length; j++) {
      if (/^-[A-Za-z]*c[A-Za-z]*$/.test(rest[j].t) && rest[j + 1]) {
        analyzeString(rest[j + 1].t, results, depth + 1, repo)
        code = true
        break
      }
    }
    for (const d of cmd.docs) analyzeString(d, results, depth + 1, repo)
    // a shell with no -c and no script file reads its commands from stdin: echo "…" | bash
    if (!code && !rest.some((w) => !w.t.startsWith('-') || w.t === '-')) {
      for (let c = cmd.pipedFrom; c; c = c.pipedFrom) {
        const text = [...c.words.slice(1).map((w) => w.t), ...c.docs].join('\n')
        if (!LOOSE.test(text)) continue
        const n = results.length
        analyzeString(text, results, depth + 1, repo)
        // printf and echo -e turn \n into a newline: what the shell then reads is not this text
        if (text.includes('\\') || !results.slice(n).some((r) => r[0] === 'MERGE')) results.push(['UNSAFE', 'a merge piped into ' + name])
      }
    }
  } else if (name === 'eval') analyzeString(rest.map((w) => w.t).join(' '), results, depth + 1, repo)
  else if (WRAPPERS.has(name) || RUNNERS.has(name) || (MANAGERS.has(name) && ['exec', 'dlx', 'x'].includes(rest[0]?.t))) {
    for (let j = 0; j < rest.length; j++) {
      if (rest[j].t.startsWith('GH_REPO=')) repo = { t: rest[j].t.slice(8), x: rest[j].x }
      const n = base(rest[j].t)
      if (n === 'gh' || SHELLS.has(n) || n === 'eval') {
        analyze({ words: rest.slice(j), docs: cmd.docs, pipedFrom: cmd.pipedFrom }, results, depth + 1, repo)
        // xargs, find -exec and parallel supply the PR numbers: the gate cannot see them
        if (name === 'xargs' || name === 'find' || name === 'parallel') {
          for (let r = before; r < results.length; r++) {
            if (results[r][0] === 'MERGE' && (!results[r][2] || results[r][2].includes('{'))) results[r] = ['UNSAFE', 'PR numbers come through ' + name]
          }
        }
        return
      }
    }
    loose() // ssh host "gh pr merge 5", docker exec c sh -c … : the text is the command
  } else if (INTERPRETERS.has(name) && rest.some((w) => /^(-e|-c|-p|-E|--eval|--print)$/.test(w.t) || /^-[a-z]*[ecp]$/.test(w.t))) loose()
}

function analyzeString(src, results, depth = 0, envRepo) {
  for (const c of parse(src)) analyze(c, results, depth, envRepo)
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => (input += d))
process.stdin.on('end', () => {
  const results = []
  analyzeString(input, results)
  for (const r of results) console.log(r.join('\x1f'))
})
