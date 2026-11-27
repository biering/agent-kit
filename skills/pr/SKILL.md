---
name: pr
description: >-
  Open or update the one pull request for the current branch: Conventional Commits title, a short body that opens with the benefit and where to focus the review. Use for 'open a PR', 'update the PR body', 'write the PR description', '/pr'.
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

Short. It opens with two things, in this order; everything else is optional:

```markdown
## Benefit
One or two plain sentences: what the user or the business gains. Not what files changed.

## Review focus
- `path:line`: what could go wrong here (1 to 3 bullets, riskiest first)
```

Then only if the reader needs it: **Changed** (at most 5 bullets, by area, never by file),
**Verified** (commands and what they showed), **Needs a human** (approvals, setup steps, links).
Hard budget: Benefit plus Review focus about 120 words, no file-by-file narration, nothing said
twice, plain words, no em dashes. The rules, how to pick review spots and a before and after are
in `references/description.md` and `references/example.md`; the evidence is in
`references/research.md`.

Write the body to a temp file, run `node scripts/pr-body-check.mjs <file>` (from this skill's
folder), fix what it flags, pass the file with `--body-file`, delete it afterwards. A `.github/`
PR template gets filled in with these two sections first, not replaced. If the harness appends a
trailer (a "Generated with" line, a session link), keep it.

**A result pitch first**, when the PR needs the owner's result approval (specced work, or a change a
user sees; the `result-pitch` skill): the pitch opens the body, then Review focus. Its video and
screenshots are uploaded media, linked by URL, so the screenshot step below is already done.

**Screenshots**, only when the branch changes what a user sees (a component, page, layout, styles,
a UI string): 1 to 4 PNGs of the changed screens, branch state only, desktop width plus one phone
width shot when layout changed, each with a one-line caption. `gh` cannot upload images, so
`scripts/pr-screenshots.sh <png>...` commits them to `refs/pr-assets/<branch>` (outside every
branch), pushes that ref and prints the markdown lines to paste. Use a test account, never real
customer data: a pushed image stays reachable by its commit URL until the ref is deleted and
garbage-collected. If the app will not start, skip them and say so in the test plan.


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
- Repeat the body's **Benefit** and **Review focus** in the chat, nothing more; the person merging
  reads the chat first. Update both when later commits change them.
- End the reply with the PR URL alone on the last line. If `gh` did not print it:
  `gh pr view --json url --jq .url`.
