# GitHub CLI for CI and review threads

Requires an authenticated `gh` (`gh auth status`). Run from the repo root. Set `GH_PAGER=cat` so
`gh` never opens a pager. Repo slug: `gh repo view --json nameWithOwner -q .nameWithOwner`.

## Checks on the current branch's PR

```bash
gh pr view --json number,url,headRefName,baseRefName,isDraft,statusCheckRollup,mergeable,mergeStateStatus
gh pr checks <n>
```

`statusCheckRollup` entries:

- `CheckRun`: GitHub Actions (`conclusion`, `name`, `detailsUrl`, `workflowName`)
- `StatusContext`: external checks such as Cloudflare Workers Builds or Railway (`state`,
  `context`, `targetUrl`)

## No PR yet

```bash
gh run list --branch "$(git branch --show-current)" --limit 20
```

## Failed job logs

```bash
gh run view <run-id> --log-failed 2>&1 | tail -100
```

A job URL contains the run id in its path. By workflow file:

```bash
gh run list --branch "$(git branch --show-current)" --workflow <file>.yml --limit 3
```

## Re-run

```bash
gh run rerun <run-id> --failed     # only the failed jobs, for a suspected flake
gh run rerun <run-id>              # a cancelled run
```

## Watch after a push

```bash
gh run watch <run-id>
gh pr checks <n> --watch --fail-fast
```

Long runs: the `dev-loop` skill's step 6 rules (built-in `/loop`, no faster than every two
minutes, stop when CI resolves).

## Compare with the base branch

```bash
git fetch origin <default>
git merge origin/<default>     # or rebase, per the user's preference
```

Re-run local checks before pushing. Failures that also occur on the default branch are
pre-existing: report them. Comparing `gh pr checks` across sibling PRs shows the same.

## Review threads: fetch, reply, resolve

```bash
# Threads with ids and state; act only on isResolved: false
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved isOutdated comments(first:10){nodes{path line body author{login}}}}}}}}' \
  -F o=<owner> -F r=<repo> -F n=<pr-number>

# Reply (PRRT_ node id; -f keeps the body a string)
gh api graphql -f query='mutation($t:ID!,$b:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$t,body:$b}){comment{id}}}' \
  -f t="$THREAD_ID" -f b="Fixed: <what and why>."

# Resolve
gh api graphql -f query='mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}' \
  -f t="$THREAD_ID"
```

Other comment sources:

```bash
gh pr view <n> --comments                                  # the PR conversation
gh api repos/<owner>/<repo>/pulls/<n>/reviews --paginate   # review summaries
```
