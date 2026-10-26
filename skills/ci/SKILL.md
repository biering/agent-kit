---
name: ci
description: >-
  Repair a red branch or PR: read failing checks, reproduce locally, fix in scope, then triage and resolve review threads. Use for red CI, failed checks, merge blocked, 'fix the build', a pasted CI log, PR feedback.
---

# Fix branch CI

Read the repo's `AGENTS.md` and `docs/agent-kit/ci.md` first; they win where they differ. The
repo note maps each workflow to its local repro command and lists the failures that repo knows.

The job: the current branch's checks green and every PR review thread resolved. The loop is
**read the pipeline, reproduce locally, fix, verify, re-check**, then **triage review comments,
fix the valid ones, reply, resolve**. Watching a long run (`gh pr checks --watch`, `/loop`
cadence, when to stop) is `dev-loop` step 6; this skill is the repair.

**Done when** the PR is out of draft (where the repo uses drafts), every check this branch caused
is green, pre-existing failures are named, and no review thread is unresolved.

Never weaken a workflow, skip a check, loosen an assertion or delete a snapshot to get green.
A failure that also happens on the default branch is pre-existing: report it, do not patch it
here, unless merging the default branch into the branch resolves it.

## Phase 0: is there any CI yet?

```bash
gh pr view --json isDraft,url,statusCheckRollup
```

Some repos run no workflows on draft PRs (Leverage). There, an empty or `skipping` rollup means
**never started**, not passing. Run the repo's local gate instead. Green, and the work actually
finished (no TODOs, stubbed tests or debug logging; the ticket's acceptance criteria met), then
`gh pr ready <n>`. Never mark ready to see what CI says. Failing or unfinished: stay in draft and
say so. Once ready, a PR stays ready; `gh pr ready --undo` only on request.

A push in the same second as `gh pr ready` can let a `cancel-in-progress` concurrency group cancel
the real run while the skipped draft run survives and looks done. After `gh pr ready`, list runs
(`gh run list --branch <b> --json conclusion,databaseId`) and `gh run rerun` every `cancelled` one.

## Phase 1: read the pipeline

```bash
git branch --show-current
git status -sb
gh pr view --json url,headRefName,baseRefName,isDraft,statusCheckRollup 2>/dev/null || true
```

No PR: `gh run list --branch "$(git branch --show-current)" --limit 15`. From the rollup, collect
every item with `conclusion: FAILURE` or `state: FAILURE`: workflow, job, details URL. `CheckRun`
items are GitHub Actions; `StatusContext` items are external (Cloudflare Workers Builds, Railway,
Vercel) and keep their log behind `targetUrl`. Logs:

```bash
gh run view <run-id> --log-failed 2>&1 | tail -100
```

More patterns in `references/gh-commands.md`. Before editing, show the user a table:

| Check | Job | Likely scope | Local repro command |
|---|---|---|---|

The workflow file is the source of truth for the repro command; the repo note maps the common ones.

## Phase 2: reproduce locally

Run the command CI runs, not a vague `pnpm test` at the root unless that is what failed. A
monorepo's consolidated job often names the failing task (`Failed: <pkg>#test`); run that package.

Local green, CI red: check the Node version the workflow pins, the frozen lockfile
(`pnpm install --frozen-lockfile`), the workflow's `env:` block against your local env, and path
filters (an earlier push may have triggered the run).

## Phase 3: fix, in scope

| CI signal | Usual cause | Fix direction |
|---|---|---|
| Outdated or frozen lockfile | `package.json` changed without an install from the root | Install at the root, commit the lockfile |
| Format or lint | Drift, or a pre-commit hook was bypassed | The repo's `format:fix` / `lint:fix` in the right package |
| Typecheck | Drift across workspace packages, a hand-edited generated file | Fix at the source; regenerate generated types, never hand-edit them |
| Build fails only in CI | A build-time env var (`PUBLIC_*`, runtime config) missing in CI | Compare the workflow `env:`; build-time values belong in the workflow or the platform's build config, secrets stay in the platform |
| Generated artifact out of date (OpenAPI, client types) | Routes changed, artifact not regenerated | Run the repo's regen script and commit |
| Snapshot mismatch | Intended template or markup change | Read the diff; update with `-u` only when the new output is correct |
| Test assertion | Real bug or stale test | Fix the code or the test logic |
| Container build: workspace package not found | A package missing from the Dockerfile's `COPY` | Follow the repo's Docker checklist; verify with `docker build -f <Dockerfile> .` from the root |
| External deploy status red | Build command, root directory or watch paths drift | Read the log at `targetUrl`; dashboard-only config goes to the user |
| Workflow did not run | Path filter excluded the change | Expected; investigate only if it should have run |
| Known-flaky suite red on an unrelated diff | Flake | `gh run rerun <id> --failed` once; investigate on a second failure |

Rules: change only what the failing check implies; verify locally before pushing; escalate when
the failure is on the default branch too, needs secrets you do not have, needs a dashboard or infra
change, or the only fix disables a check.

**Several failures:** install and lockfile first (they block everything), then cheap gates (format,
lint, typecheck), then shared packages others build against, then app tests and builds for paths
the branch changed, then container builds, then external deploy statuses (often fixed by the
earlier ones). One cluster at a time, local re-run before the next.

## Phase 4: verify and re-check

Re-run the exact failing commands locally, commit with the repo's conventions, push, then:

```bash
gh pr view --json statusCheckRollup
gh run list --branch "$(git branch --show-current)" --limit 5
```

Hand a long run to `dev-loop` step 6. Never ask the user to paste CI output; read it.

## Phase 5: review threads

The PR is done only when every review thread (human, Copilot, Bugbot, other bots) is resolved.
Fetch unresolved threads with GraphQL (REST has no resolution state); commands in
`references/gh-commands.md`.

For each unresolved thread decide **valid**, **partially valid** or **not applicable**, and why:

- Re-read the current code at that path and line; comments often target an older diff.
- Check git history before accepting a suggestion that reverses an intentional decision. A bot's
  suggested patch can be incomplete or reintroduce a fixed bug.
- Prefer the smallest correct fix. When you diverge from a suggested patch, say so in the reply.
- Never implement an invalid or out-of-scope suggestion just to close a thread.

Fix the valid ones, re-run the relevant local checks, push, then reply in one or two lines on
every thread (fixed and how, already fixed, or not changed and why) and resolve it. A "Fixed"
reply always corresponds to a pushed commit. Never merge, close or reopen the PR without explicit
confirmation.

## Report

```markdown
## CI status
- Branch: ...
- PR: ...

## Fixed
- [workflow/job]: cause, change, verified with ...

## Review threads
- Resolved: n/n (fixed / already fixed / not applicable, one-line reason each)

## Still failing / needs you
- ...

## Next step
Push and re-watch, or run: ...
```
