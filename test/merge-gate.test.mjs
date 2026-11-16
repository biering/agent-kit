// The merge gate (hooks/merge-gate.sh): which repo a merged PR is looked up in,
// and which commands count as a merge at all. gh is a fake on PATH that answers
// only for the repos and PRs a test sets up, so a lookup in the wrong repo fails.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GATE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../hooks/merge-gate.sh')

const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_DIR/calls.log"
key() { printf '%s_%s' "\${1//\\//_}" "$2"; }
case "$1 $2" in
  "repo view") cat "$FAKE_DIR/cwd-repo" 2>/dev/null || exit 1 ;;
  "pr view") cat "$FAKE_DIR/branch-pr" 2>/dev/null || exit 1 ;;
  "pr checks")
    f="$FAKE_DIR/checks/$(key "$5" "$3")"
    [ -f "$f" ] || { echo "no such PR" >&2; exit 1; }
    tail -n +2 "$f"; exit "$(head -1 "$f")" ;;
  "api"*)
    p=""; for a in "$@"; do case "$a" in repos/*) p="$a" ;; esac; done
    [ -n "$p" ] || exit 1
    rest="\${p#repos/}"; n="\${rest##*/pulls/}"; n="\${n%%/*}"; slug="\${rest%%/pulls/*}"
    prev=""; for a in "$@"; do [ "$prev" = "--hostname" ] && slug="$a/$slug"; prev="$a"; done
    k="$(key "$slug" "$n")"
    case "$*" in
      *'select(.filename'*) cat "$FAKE_DIR/patches/$k" 2>/dev/null; exit 0 ;;
      *) cat "$FAKE_DIR/files/$k" 2>/dev/null || exit 1 ;;
    esac ;;
  *) exit 1 ;;
esac
`

function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'merge-gate-'))
  mkdirSync(path.join(dir, 'bin'))
  for (const d of ['files', 'patches', 'checks']) mkdirSync(path.join(dir, d))
  writeFileSync(path.join(dir, 'bin', 'gh'), FAKE_GH)
  chmodSync(path.join(dir, 'bin', 'gh'), 0o755)
  const k = (slug, n) => `${slug.replace(/\//g, '_')}_${n}`
  const env = {
    cwdRepo: (slug) => writeFileSync(path.join(dir, 'cwd-repo'), slug + '\n'),
    branchPr: (n, url) => writeFileSync(path.join(dir, 'branch-pr'), `${n}\t${url}\n`),
    // files: [status, filename] rows of PR n in slug; checks: 'green' | 'red'
    pr: (slug, n, { files = [['modified', 'src/a.ts']], checks = 'green', patch = '' } = {}) => {
      writeFileSync(path.join(dir, 'files', k(slug, n)), files.map(([s, f]) => `${s}\t${f}\ty`).join('\n') + '\n')
      if (patch) writeFileSync(path.join(dir, 'patches', k(slug, n)), patch)
      writeFileSync(path.join(dir, 'checks', k(slug, n)), checks === 'green' ? '0\ncheck\tpass\n' : '1\ncheck\tfail\n')
    },
    run(command, { cwd = dir } = {}) {
      const r = spawnSync('bash', [GATE], {
        input: JSON.stringify({ tool_input: { command }, cwd }),
        env: { ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, FAKE_DIR: dir, GH_REPO: '' },
        encoding: 'utf8',
      })
      const log = path.join(dir, 'calls.log')
      return { code: r.status, stderr: r.stderr, calls: existsSync(log) ? readFileSync(log, 'utf8') : '' }
    },
    done: () => rmSync(dir, { recursive: true, force: true }),
  }
  return env
}

function withGate(name, fn) {
  test(name, (t) => {
    const g = setup()
    t.after(g.done)
    fn(g)
  })
}

const ALLOW = 0
const BLOCK = 2

// The bug: an agent-kit PR merged by URL from another repo's session was judged
// as that repo's PR with the same number.
withGate('a full PR URL is looked up in the URL repo, not the current repo', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/maelstrom', 20, { checks: 'red' })
  g.pr('acme/agent-kit', 20)
  const r = g.run('gh pr merge https://github.com/acme/agent-kit/pull/20 --squash --delete-branch')
  assert.equal(r.code, ALLOW, r.stderr)
  assert.match(r.calls, /repos\/acme\/agent-kit\/pulls\/20\/files/)
  assert.doesNotMatch(r.calls, /maelstrom/)
})

withGate('a PR URL with a trailing path or query still names its repo', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/agent-kit', 22)
  assert.equal(g.run('gh pr merge https://github.com/acme/agent-kit/pull/22/files --squash').code, ALLOW)
})

withGate('a red PR given by URL is still blocked, naming its repo', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/agent-kit', 20, { checks: 'red' })
  const r = g.run('gh pr merge https://github.com/acme/agent-kit/pull/20 --squash')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /acme\/agent-kit#20 has checks that are not green/)
})

withGate('an owner-only PR given by URL is blocked in its own repo', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/agent-kit', 20)
  g.pr('acme/other', 20, { files: [['added', 'supabase/migrations/001.sql']] })
  const r = g.run('gh pr merge https://github.com/acme/other/pull/20 --squash')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /acme\/other#20 is one the owner merges/)
  assert.match(r.stderr, /production data structure/)
})

withGate('a GitHub Enterprise URL keeps its host', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('git.corp.example/acme/tools', 4)
  const r = g.run('gh pr merge https://git.corp.example/acme/tools/pull/4')
  assert.equal(r.code, ALLOW, r.stderr)
  assert.match(r.calls, /api --hostname git\.corp\.example .*repos\/acme\/tools\/pulls\/4\/files/)
})

for (const form of ['-R acme/agent-kit', '--repo acme/agent-kit', '--repo=acme/agent-kit', '-Racme/agent-kit']) {
  withGate(`${form} picks the repo for a PR number`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5, { checks: 'red' })
    g.pr('acme/agent-kit', 5)
    const r = g.run(`gh pr merge 5 ${form} --squash`)
    assert.equal(r.code, ALLOW, r.stderr)
    assert.doesNotMatch(r.calls, /maelstrom/)
  })
}

withGate('-R before pr merge works too', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/agent-kit', 5)
  assert.equal(g.run('gh -R acme/agent-kit pr merge 5 --squash').code, ALLOW)
})

withGate('GH_REPO=… in front of gh picks the repo', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/agent-kit', 5)
  assert.equal(g.run('GH_REPO=acme/agent-kit gh pr merge 5 --squash').code, ALLOW)
  assert.equal(g.run('env GH_REPO=acme/agent-kit gh pr merge 5 --squash').code, ALLOW)
})

withGate('a bare number is looked up in the current directory repo', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/maelstrom', 7, { files: [['modified', 'packages/billing/x.ts']] })
  g.pr('acme/agent-kit', 7)
  const r = g.run('gh pr merge 7 --squash --delete-branch')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /acme\/maelstrom#7 is one the owner merges/)
  assert.match(r.stderr, /prices and payments/)
})

withGate('a bare number with green checks in the current repo merges', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/maelstrom', 7)
  assert.equal(g.run('gh pr merge 7 --squash').code, ALLOW)
})

withGate('no number: the PR of the current branch, in its repo', (g) => {
  g.branchPr(9, 'https://github.com/acme/agent-kit/pull/9')
  g.pr('acme/agent-kit', 9, { checks: 'red' })
  const r = g.run('gh pr merge --squash')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /acme\/agent-kit#9 has checks/)
})

withGate('no number and no PR for the branch: nothing to gate', (g) => {
  assert.equal(g.run('gh pr merge --squash').code, ALLOW)
})

withGate('a repo that cannot be told is refused', (g) => {
  const r = g.run('gh pr merge 5 --squash')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /could not tell which repository/)
})

withGate('unreadable files of the PR are refused', (g) => {
  g.cwdRepo('acme/maelstrom')
  const r = g.run('gh pr merge 99')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /could not read the files of PR acme\/maelstrom#99/)
})

// The second bug: text that only mentions a merge.
for (const [name, cmd] of Object.entries({
  echo: 'echo "gh pr merge https://github.com/acme/agent-kit/pull/20 --squash"',
  'commit message': 'git commit -m "docs: say gh pr merge 5 is fine" && git push',
  'single-quoted task text': "herdr-projects add --desc 'merge it: gh pr merge https://github.com/acme/agent-kit/pull/22'",
  'here-doc into cat': 'cat <<EOF\ngh pr merge 5\nEOF',
  'a comment': 'ls # gh pr merge 5',
  'grep for it': 'grep -rn "gh pr merge" docs/',
  'gh pr view with merge in the text': 'gh pr view 5 --json title -q ".title | test(\\"gh pr merge\\")"',
  'a pr comment about it': 'gh pr comment 5 --body "will gh pr merge 5 later"',
  'merge without gh': 'git merge main && gh pr create --title "merge things"',
})) {
  withGate(`text that only mentions a merge is not one: ${name}`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5, { checks: 'red' })
    const r = g.run(cmd)
    assert.equal(r.code, ALLOW, r.stderr)
    assert.doesNotMatch(r.calls, /pulls|checks/)
  })
}

// The real invocations, however they are written, are still seen.
for (const [name, cmd] of Object.entries({
  'plain': 'gh pr merge 5 --squash',
  'full path to gh': '/opt/homebrew/bin/gh pr merge 5',
  'after cd and &&': 'cd /tmp && gh pr merge 5 --squash',
  'after a newline': 'echo hi\ngh pr merge 5',
  'in bash -c': 'bash -c "gh pr merge 5 --squash"',
  'in sh -lc with single quotes': "sh -lc 'gh pr merge 5'",
  'in $()': 'echo $(gh pr merge 5)',
  'in backticks': 'echo `gh pr merge 5`',
  'in double quotes $()': 'echo "done: $(gh pr merge 5)"',
  'in eval': 'eval "gh pr merge 5"',
  'in a here-doc to bash': 'bash <<EOF\ngh pr merge 5\nEOF',
  'behind env assignments': 'CI=1 FOO=bar gh pr merge 5',
  'behind env': 'env -i gh pr merge 5',
  'behind sudo': 'sudo gh pr merge 5',
  'after a pipe': 'true | gh pr merge 5',
  'in a subshell': '(gh pr merge 5)',
  'in an if': 'if true; then gh pr merge 5; fi',
  'with a quoted title': 'gh pr merge 5 --squash --subject "fix; and | more" --body "x"',
  'with the PR after the flags': 'gh pr merge --squash --delete-branch 5',
})) {
  withGate(`a real merge is still gated: ${name}`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5, { checks: 'red' })
    const r = g.run(cmd)
    assert.equal(r.code, BLOCK, `${cmd}\n${r.stderr}`)
    assert.match(r.stderr, /acme\/maelstrom#5/)
  })
}

withGate('a quoted title containing a merge phrase does not hide the real merge', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/maelstrom', 5, { checks: 'red' })
  const r = g.run('gh pr merge 5 --subject "run gh pr merge 6 later"')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /#5 has checks/)
})

for (const [name, cmd] of Object.entries({
  loop: 'for n in 1 2 3; do gh pr merge $n --squash; done',
  variable: 'gh pr merge "$PR" --squash',
  substitution: 'gh pr merge $(gh pr list -q .[0].number --json number)',
  'variable repo': 'gh pr merge 5 -R "$REPO"',
  xargs: 'echo 5 | xargs gh pr merge',
  'xargs with flags': 'gh pr list --json number -q .[].number | xargs -I{} gh pr merge {} --squash',
})) {
  withGate(`a merge the gate cannot read literally is refused: ${name}`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5)
    const r = g.run(cmd)
    assert.equal(r.code, BLOCK)
    assert.match(r.stderr, /merge one PR per command/)
  })
}

withGate('every merge in one command is checked, not only the first', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/maelstrom', 5)
  g.pr('acme/agent-kit', 6, { checks: 'red' })
  const r = g.run('gh pr merge 5 --squash && gh pr merge https://github.com/acme/agent-kit/pull/6 --squash')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /acme\/agent-kit#6 has checks/)
  assert.equal(
    g.run('gh pr merge 5 --squash && gh pr merge -R acme/maelstrom 5 --squash').code,
    ALLOW,
  )
})

withGate('wrangler var changes in the PR own repo are gated', (g) => {
  g.cwdRepo('acme/maelstrom')
  g.pr('acme/agent-kit', 3, { files: [['modified', 'wrangler.jsonc']], patch: '+  "DATABASE_URL": "x"\n' })
  const r = g.run('gh pr merge https://github.com/acme/agent-kit/pull/3')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /var "DATABASE_URL"/)
})

withGate('live price changes stay blocked', (g) => {
  const r = g.run('pnpm iap sync --apply')
  assert.equal(r.code, BLOCK)
  assert.match(r.stderr, /live App Store price/)
})

// Fails closed: a merge behind a runner or shell the parser has to look into is
// still gated, and when its text cannot be read as a merge it is refused.
for (const [name, cmd] of Object.entries({
  'pnpm exec gh': 'pnpm exec gh pr merge 5 --squash',
  'pnpm dlx gh': 'pnpm dlx gh pr merge 5',
  'npx gh': 'npx gh pr merge 5',
  'ssh host gh': 'ssh host gh pr merge 5',
  'ssh host quoted': 'ssh host "gh pr merge 5 --squash"',
  'docker exec': 'docker exec c gh pr merge 5',
  'echo piped to bash': 'echo "gh pr merge 5" | bash',
  'printf piped to sh': 'printf "gh pr merge 5\\n" | sh',
  'here-string to bash': 'bash <<< "gh pr merge 5"',
  'here-doc piped to bash': 'cat <<EOF | bash\ngh pr merge 5\nEOF',
  'xargs bash -c': 'echo 5 | xargs bash -c "gh pr merge 5"',
})) {
  withGate(`a merge behind a runner or shell is gated: ${name}`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5, { checks: 'red' })
    const r = g.run(cmd)
    assert.equal(r.code, BLOCK, `${cmd}\n${r.stderr}`)
    assert.match(r.stderr, /#5 has checks|merge one PR per command/)
  })
}

for (const [name, cmd] of Object.entries({
  'node -e': `node -e "require('child_process').execSync('gh pr merge 5')"`,
  'python -c': 'python3 -c "import os; os.system(\'gh pr merge 5\')"',
  'printf with a placeholder': 'printf "gh pr merge %s" 5 | sh',
  'pnpm exec with a variable': 'pnpm exec gh pr merge "$N"',
})) {
  withGate(`a merge inside an interpreter is refused: ${name}`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5)
    const r = g.run(cmd)
    assert.equal(r.code, BLOCK, `${cmd}\n${r.stderr}`)
    assert.match(r.stderr, /merge one PR per command/)
  })
}

for (const [name, cmd] of Object.entries({
  'echo piped to cat': 'echo "gh pr merge 5" | cat',
  'echo piped to bash without a merge': 'echo hi | bash',
  'a script file': 'bash scripts/gates.sh',
  'pnpm script with a mention': 'pnpm linear ask approval "Merge: gh pr merge 5"',
  'node script with a mention': 'node bin/agent-kit.mjs board add --desc "gh pr merge 5"',
  'ssh without a merge': 'ssh host ls',
})) {
  withGate(`still only a mention: ${name}`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5, { checks: 'red' })
    const r = g.run(cmd)
    assert.equal(r.code, ALLOW, r.stderr)
    assert.doesNotMatch(r.calls, /pulls|checks/)
  })
}

// Fails closed on code the gate cannot read: unquoted text into a shell, and code
// built at run time. Each was refused by the old text-matching gate.
for (const [name, cmd] of Object.entries({
  'unquoted echo into sh': 'echo gh pr merge 5 | sh',
  'unquoted echo into bash': 'echo gh pr merge 5 --squash | bash',
  'unquoted echo into xargs sh -c': 'echo gh pr merge 5 | xargs sh -c',
  'eval of a variable': 'x="gh pr merge 5"; eval "$x"',
  'bash -c of a substitution': 'bash -c "$(echo gh pr merge 5)"',
  'bash -c of a variable': 'cmd="gh pr merge 5"; bash -c "$cmd"',
  'source of a process substitution': 'source <(echo gh pr merge 5)',
  'bash of a process substitution': 'bash <(echo gh pr merge 5)',
  'a variable piped into sh': 'x="gh pr merge 5"; echo $x | sh',
  'gh with a variable subcommand': 'a="pr merge 5"; gh $a',
  'a variable as the command': 'g=gh; $g pr merge 5',
})) {
  withGate(`a merge the gate cannot read is gated or refused: ${name}`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5, { checks: 'red' })
    const r = g.run(cmd)
    assert.equal(r.code, BLOCK, `${cmd}\n${r.stderr}`)
    assert.match(r.stderr, /#5 has checks|merge one PR per command/)
  })
}

for (const [name, cmd] of Object.entries({
  'eval of ssh-agent': 'eval "$(ssh-agent)"',
  'source a plain file': 'source ~/.zshrc',
  'source a variable file': 'source "$HOME/.profile"',
  'bash -c of a variable, no merge anywhere': 'cmd="ls"; bash -c "$cmd"',
  'gh with variables for other subcommands': 'gh pr view $N --json title',
  'gh with a variable repo for other subcommands': 'gh issue list -R "$R"',
  'echo into bash': 'echo hi | bash',
  'a redirect and an fd copy': 'ls > out.txt 2>&1',
})) {
  withGate(`dynamic code with no merge in it is not refused: ${name}`, (g) => {
    g.cwdRepo('acme/maelstrom')
    g.pr('acme/maelstrom', 5, { checks: 'red' })
    const r = g.run(cmd)
    assert.equal(r.code, ALLOW, r.stderr)
  })
}
