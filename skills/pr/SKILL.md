---
name: pr
description: >-
  Open or update the one pull request for the current branch: Conventional Commits title, a body that says why and what to review. Use for 'open a PR', 'update the PR body', 'write the PR description', '/pr'.
---

# Pull request

Read the repo's `AGENTS.md` and `docs/agent-kit/pr.md` first; they win where they differ from this
skill (ticket prefix, branch form, draft or ready, allowed title types, required sections).

The job: get the work onto a non-default branch, then create **one** PR for that head or rewrite
the existing one. Never a second PR for the same head. This skill does not merge; merging is
`dev-loop` step 7 under the repo's rules.

## 0. Preconditions

- `gh` on `PATH` and authenticated (`command -v gh`, `gh auth status`). Missing: tell the user how
  to install it (`brew install gh && gh auth login` on macOS), still write the title and the body
  file, and hand over the exact `git push` and `gh pr create --body-file <file>` commands. Never
  fall back to scraping the web UI; private repos 404 there.
- Prefix `gh` with `GH_PAGER=cat` so it never opens a pager.
- Never put tokens in a prompt or a command line. `gh` uses its own auth.

## 1. Context

```bash
scripts/pr-context.sh            # from this skill's folder; prints branch, base, ticket, PR, commits, areas
```

It replaces `git status`, `git log`, `git diff --stat` and `gh pr list --head` in one call. Then
read the substantive diffs it points at (new files, public APIs, config, version bumps). The diff
is the source of truth, not the commit subjects. Describe the whole branch from its merge base.

Nothing to ship (on the default branch, clean tree, no unique commits): stop. No empty PRs.

## 2. Branch

- **On the default branch:** create a branch before any commit, push or `gh pr`. Form per
  `AGENTS.md`; with none named, `<type>/<scope>-<slug>`, slug 2 to 4 lowercase words.
  Uncommitted work comes along; commit it on the new branch (Conventional subject, body says why).
- **Already on a work branch:** stay on it.
- A branch name never ends in `-`. Some preview systems reject it (Maelstrom: Cloudflare Workers
  Builds). Rename before pushing: `git branch -m <name>`.
- A branch name that breaks the repo's form is harmless for an existing PR; flag it so the user
  can rename.

## 3. Title

```text
<type>(<scope>): <imperative summary>
```

- A valid Conventional Commit, under 72 characters, imperative, lower-case, no trailing period.
  It says what the branch delivers. The why goes in the body.
- **The ticket is the scope** when there is one: `fix(ABC-123): ...`, never
  `fix(web): ... (ABC-123)`. No ticket: the area the diff belongs to, or no scope. Never invent a
  ticket id; ask if one should exist.
- The PR title equals the branch's commit title. A committed matching subject is reused verbatim.
- Use `!` for a breaking change (`feat!:`). Never prefix `[WIP]`; a draft already says that.
- Repos with a title check may accept fewer types than Conventional Commits does (Leverage:
  `chore|feat|fix` only). Read the repo note before choosing `refactor` or `docs`.

## 4. Body

Write it from `references/description.md`. Write to a temp file and pass `--body-file`; delete the
file afterwards. A `.github/` PR template gets filled in, not replaced. If the harness appends a
trailer (a "Generated with" line, a session link), keep it.

## 5. Create or update

**PR exists for this head:** re-read `git log <base>..HEAD` and the full diff, then replace title
and body so they describe the branch as it is now. Never append "also updated...".

```bash
GH_PAGER=cat gh pr edit <n> --title "<title>" --body-file <tmp.md>
```

**No PR yet:**

```bash
git push -u origin HEAD
GH_PAGER=cat gh pr create --base <default> --head "$(git branch --show-current)" \
  --title "<title>" --body-file <tmp.md>            # add --draft where the repo opens drafts
```

`headRefName` from `gh pr view` must equal the current branch; if it does not, stop.
A hook that blocks `gh pr create` reports a real failure: fix it and retry, never skip hooks.

**Draft repos.** Where CI skips drafts (Leverage), the PR opens as a draft and `gh pr ready` is
a claim that the work is done and verified locally. Never mark ready to find out what CI says.
The `ci` skill owns that transition.

## 6. Report

- Say **created** or **updated**, plus one line on what changed.
- Repeat the body's **What to review** list in the chat; the person merging reads the chat first.
  A docs-only or config-only PR repeats its one line. Update both when later commits change it.
- End the reply with the PR URL alone on the last line. If `gh` did not print it:
  `gh pr view --json url --jq .url`.
