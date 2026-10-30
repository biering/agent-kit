---
name: dev-loop
description: >-
  Land a code change: branch, tests, local verify, owed reviews, one PR, CI green. Defers to the repo's AGENTS.md and loop config. Use to ship a change, take work to a PR, or ask "what's the process".
---

# Dev loop

The rules for a repo live in its root `AGENTS.md` (Git workflow, Definition of Done). This skill
puts them in order and says when each step is finished. When the two disagree, `AGENTS.md` wins,
and this skill or the repo config is what you fix.

The loop is for work headed to a PR. A one-line answer or a throwaway experiment does not need it.

## 0. Read the repo's version of each step

1. Root `AGENTS.md`, then the owning app's `AGENTS.md`, then `docs/agent-kit/dev-loop.md` if the
   repo has one.
2. `agent-kit.config.json` at the repo root. Its `loop` block names the commands:

   ```json
   "loop": {
     "verify": "pnpm gates",
     "docs": "pnpm verify:docs",
     "gate": null
   }
   ```

   - `verify`: the local check that must be green before the PR.
   - `docs`: the extra check when docs, skills, agents, hooks or an `.env.example` changed.
   - `gate`: a script that knows what the branch still owes. When it is set, run it, do what it
     names, and do not end the turn or mark the PR ready while it reports an open gate.

   No `loop` block: take the commands from `AGENTS.md`. Neither says: ask once.

Two repos, as examples of how this gets filled in:

| | Maelstrom | Leverage |
|---|---|---|
| `verify` | `pnpm gates` (lint, typecheck, test for changed packages) | `pnpm verify:local` |
| `gate` | none; hooks block `gh pr create` without green gates | `node scripts/dev-loop.mjs status`, which also blocks stop and `gh pr ready` until the reviews ran |
| Branch | `feat/<task>-<slug>` | `feat/LEV-123` |
| PR | ready for review | draft first, CI skips drafts, then `gh pr ready` |
| Merge | agents squash-merge green, reviewed PRs; gated ones after a reviewer pass | a person merges |

## 1. Branch

Off an up-to-date default branch, named the way `AGENTS.md` says. Already on a branch for this
work: stay on it. Never commit or push on the default branch.

**Done when** `git branch --show-current` prints the work branch.

## 2. Change and tests

Make the change. A behavior change gets a test that fails without it. When a change is not worth
testing (copy, styling, types only), say so in the PR rather than skipping silently.

Fix the class, not the instance: when the change improves something other apps do too, land the
shared mechanism (script, guide, scaffold reference) in the same PR. Keep the branch surgical.
An unrelated smell goes on its own branch.

**Done when** `git diff --stat origin/<default>...` lists only files this task needs.

## 3. Local verify

Run `loop.verify`, and `loop.docs` when it applies. Read the output. A failure that also happens
on the default branch is pre-existing: name it in the PR, do not fix it here.

## 4. Reviews the diff owes

Whatever the repo's gate or `AGENTS.md` names for the paths you touched. Common ones: a code
review in a fresh context, a browser pass for user-facing UI (phone and desktop width), an API
review for the REST or MCP surface, a database review for migrations, `unslop` for user-facing
copy. Run each on the code as it stands, not before writing it. Fix what holds up, push back with
evidence on the rest.

A review stays valid while you fix its own findings, tests included. It needs a second pass when
the code in its scope is rewritten (more than max(30 lines, 20 %) is a workable line) or a file it
never saw enters that scope.

Fixing review findings changes the code step 3 verified. Re-run `loop.verify` after the last edit:
it is the last local step, and a green run from before a fix proves nothing about the PR.

**Done when** every review has a verdict, or a written reason it could not run, and `loop.verify`
passed after the last edit.


## 5. PR

Commit with a Conventional Commit subject, then the `pr` skill: one PR per branch, created or
updated, never a second one. Post the URL as soon as it exists.

## 6. CI green

```bash
gh pr checks --watch --fail-fast
gh run view <run-id> --log-failed
```

Repair with the `ci` skill on the same branch, new commits, no force-push over someone's review.
For a run longer than a few minutes, poll with the built-in `/loop` instead of blocking:

- Check, act only on a change, stay quiet otherwise.
- Never merge from a loop and never push to the default branch.
- Stop the loop when CI resolves or the PR closes. Not faster than every two minutes.

**Done when** every check this branch caused is green and pre-existing failures are named.

## 7. Report and merge

One message: PR URL, CI status, one-line summary, review verdicts. Merge only the way
`AGENTS.md` says. If it holds a class of change for a person (schema, prices, a first launch),
hand it over and stop.

## Pitfalls

- Hooks are backstops. Hitting one means a step above was skipped: fix the cause and retry,
  never route around it, never `--no-verify`.
- `gh` sessions expire. A sudden 401 or 403 is usually auth: `gh auth status`. Never paste tokens.
- Green CI proves the code builds, not that it is what was asked. The review stays.
