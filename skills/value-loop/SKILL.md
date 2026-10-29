---
name: value-loop
description: >-
  Scout for product problems, let a sceptical gate keep only what moves customers or revenue, fix the few under a PR cap; or judge open PRs. Use for /value-loop, 'find what matters', 'is this PR worth merging', 'which PRs to merge', 'lohnt sich das'.

---

# Value loop

Read the repo's `AGENTS.md` and `docs/agent-kit/value-loop.md` first; they win where they differ
from this skill. The repo doc names the value model, the run folder, the scouts' sources and
commands, the risk classes, the never-change list and any cap that differs from
[config.json](config.json).

Most product changes do not move the number they were built for. At Microsoft one idea in three
improved its metric; at Google about one experiment in ten led to a change; in mature areas the
rate is lower ([references/evidence.md](references/evidence.md)). An agent that finds problems
and fixes them will find a great many, and each fix costs review time, deploy risk and attention.

Example: in one repo a code audit was turned into one PR per finding over two days. More than
sixty PRs were open, every pair conflicted on one shared file, and the owner asked what was going
on. The first run of this loop over them approved about a quarter. This skill asks "is this worth
doing" before the work, by someone other than the agent that wants to do it, and puts a ceiling
on open PRs.

**The default answer is no.** A finding is dropped unless the evidence carries it.

Not for one known bug (a bugfix skill), a plain browser tour (a QA skill) or the monthly numbers.

## The four roles

Keep them in separate agents. An agent that found a problem, or wrote the fix, overrates it; a
judge that reads the proposer's pitch argues itself into agreement.

| Role | Who | Does | Never does |
|---|---|---|---|
| Orchestrator | the main session | holds the budget, builds evidence packs, checks numbers, ranks, reports | fixes code; raises a verdict by itself |
| Scout | read-only subagents | find problems and measure how many users meet them | propose priority, fix anything |
| Gate | one fresh subagent per batch | answers the six questions in [references/gate.md](references/gate.md) from the evidence pack | sees the scout's or fixer's own summary |
| Fixer | a subagent in its own worktree | one finding, one small PR, through the repo's bugfix skill and `dev-loop` | widen the scope |

The orchestrator may lower a verdict when a number it checked says so. To raise one it sends the
item back to a fresh gate agent with the corrected number; it never approves by itself.

## Modes

```
/value-loop review-prs [all | <numbers>]   judge open PRs; no product code is written
/value-loop gate <PR | ticket | finding>   one verdict
/value-loop run [focus]                    scout, gate, fix the top few, report
/value-loop lookback                       did what we shipped move what we said it would
```

With no argument: `review-prs all` when more PRs are open than `max_open_prs_total`, otherwise
`run`. Caps, batch size and day counts are the values in [config.json](config.json), overridden by
the repo doc.

## Step 0, every mode: refresh the value model

Read the repo's value model (path in the repo doc; template in
[references/value-model-template.md](references/value-model-template.md)). It says where the
business makes and loses money and which surfaces people use, with the date and file of every
figure. Check whether a newer source exists (the repo doc lists them) and use it, saying which
you used. Take a live count for the one number a verdict turns on, under the rule below.

A figure whose period ended more than `figure_stale_after_days` ago is stated with its date in
every verdict that leans on it. When the model's "what matters now" no longer matches the newest
numbers, update it.

**Production reads**, for every role, pasted into the gate and scout briefs: read-only; aggregate
counts only (`count`, `sum`, `min`, `max`, grouped by plan, month or status); never a row that
identifies a customer, never a document's text, never a write. Analytics, billing and the
production database are all covered. A single customer's record is read only when the owner asks
for that customer's problem to be fixed.

## Mode: review-prs

1. List the PRs: `gh pr list --state open --limit 200 --json number,title,body,files,additions,deletions,baseRefName,isDraft,mergeable,statusCheckRollup`.
   `gh` returns 30 rows without `--limit`; check the count with `--json number --jq length`.
2. Build an evidence pack per PR ([references/evidence-pack.md](references/evidence-pack.md)).
   Strip the PR's own claims about importance.
3. Send the packs in batches of at most `gate_batch_size`, one fresh gate agent per batch, with
   [references/gate-brief.md](references/gate-brief.md). Related PRs go in one batch.
4. Read the verdicts against the packs. Where a verdict rests on a number, check it; where the gate
   named a count that would change its verdict, take the count.
5. Report with [references/report-template.md](references/report-template.md).

This mode closes, merges and comments on nothing. The verdicts are advice to the owner.

## Mode: gate

One item: build its pack, send it to one fresh gate agent with the gate brief, check the number
its verdict rests on, and answer with the verdict block and one sentence of why. No run file.

## Mode: run

1. **Check the ceiling and take the budget.**
   ```bash
   gh label create value-loop --description "Opened by the value loop" 2>/dev/null || true
   gh pr list --state open --limit 200 --json number --jq length
   gh pr list --state open --limit 200 --label value-loop --json number --jq length
   ```
   Total at or over `max_open_prs_total`: stop, say so, offer `review-prs`. Otherwise this run may
   open `min(max_fixes_per_run, max_open_value_loop_prs − open loop PRs, max_open_prs_total − open total)`
   PRs. Zero means scout and gate only.
2. **Scout** in parallel, read-only, each with [references/scout-brief.md](references/scout-brief.md).
   Four kinds: **funnel** (where people stop on the money paths), **product** (a browser tour of
   the most-used screens), **error** (a week of production errors on the money paths), **voice**
   (customer requests and cancel reasons). The repo doc names each one's sources and commands. A
   `focus` argument narrows all four.
3. **Deduplicate, check the past, measure.**
   - One finding per root cause.
   - Read the "Close" and "Dropped" tables of every earlier run file. A dropped finding returns
     only when its "what would change it" has happened; say what changed.
   - Reach is how many distinct users met **the condition** in the last 30 days, from a file or a
     count, with its source. The surface's user count is the upper bound. No number: "unknown".
4. **Set aside what is the owner's.** A finding that only a change on the never-change list could
   resolve skips the gate and goes into the report under "For the owner".
5. **Gate.** Packs to a fresh gate agent. It returns DO, BATCH, DECIDE, RECUT or DROP.
6. **Pick.** Ranking is the orchestrator's; the gate does not cut on rank.
   - Rank DO findings by score and take as many as step 1 allows. BATCH findings (trivial, same
     screen or file) share one PR, counted as one.
   - A passing finding not picked goes under "Passed, not picked". The next run takes it up
     without a second gate unless a figure it rested on changed.
   - DECIDE findings become a decision brief on a ticket.
   - RECUT findings are listed with the smaller fix; a loss-lane RECUT also gets a ticket, because
     the hole stays open.
   - DROP findings appear in the report with their one-line reason and nowhere else.
7. **Fix.** One fixer per picked finding, in its own worktree, with
   [references/fixer-brief.md](references/fixer-brief.md). The fixer keeps the bugfix skill's
   autonomy gate: a fix in auth, billing, access rules, a migration or another reserved class
   ends as a failing test and a plan, reported under "Needs your go-ahead". The value gate says a
   thing is worth doing, and safety for unattended work is a separate question.
8. **Gate the PR.** The same six questions against the finished diff: did the cost stay as
   promised, does the fix do what the finding needed. A PR that outgrew its estimate goes back or
   is closed.
9. **Report** and write the run file.

## Mode: lookback

For each DO, BATCH, MERGE and MERGE FIRST item in the run files whose check date has passed (or,
without a date, older than `lookback_after_days`):

1. Was it merged? An item that never merged is recorded as such and does not count.
2. Read the observable it named, compare it with the prediction, and write the result into that
   run file.

Then give two rates, kept apart. **Growth lane:** how often the predicted movement followed.
**Loss lane:** how often the count that showed the loss stopped growing. A loss-lane item whose
only observable is its own test proves the hole is closed and says nothing about whether it
mattered; leave it out. The growth-lane rate is the loop's own base rate: state it at the top of
the next gate brief. A loop whose DO verdicts never move anything is approving too much.

## What a run leaves behind

One file per run, `YYYY-MM-DD.md` in the repo's run folder (`-2` for a second run on a day), so
two runs never edit the same file. The orchestrator commits it, with any value-model update, on
`chore/value-loop-run-<date>` and opens one docs-only PR. That PR carries no `value-loop` label,
so it is outside the loop's own cap and inside the total.

## The Value section of a PR

Every PR this loop opens carries:

```markdown
## Value

- **Lane:** growth (activation) | loss (billing correctness) | ...
- **Reach:** 31 users in 30 days hit the save error (count on jobs, <date>); the screen has 170 users a month
- **What a user who meets it loses:** cannot save the record; must retype it
- **Evidence:** reproduced by test; 3 customer tickets (<ids>)
- **Cost:** 40 lines, 2 files, no migration, review 10 min
- **We will know by:** saves per week in analytics, checked <date>
- **Gate verdict:** DO, <date>
```

A PR written outside the loop fills in the same section without the last line, or writes "Gate
verdict: not gated". Only the gate assigns a verdict.

## What the loop never changes

The loop never changes a **decided rule**. It may **enforce** one: closing a way around a paywall,
a limit or an ownership check is enforcing, and goes through the loss lane. It finds and reports
these, and leaves them as they are:

- the cancellation flow (often fixed by law; friction there is unlawful, not retention). A broken
  cancel button goes to the owner the same day;
- prices, tiers, limits, the trial's structure, what is gated;
- consent, legal pages, who receives an email;
- anything that needs a write to production data or an applied remote migration. A fix may
  contain a migration; applying it is the owner's step.

The repo doc adds its own. A change that helps the customer and costs revenue (a renewal notice, a
clearer way to downgrade) is a DECIDE for the owner, never a drop. Inside the cancellation flow it
skips the gate and goes under "For the owner".

## Hard rules

- The gate reads the evidence pack, the code and the numbers; never the scout's or fixer's
  summary, title or priority.
- Reach is a measured count of users who met the condition, with a source, or "unknown". Unknown
  fails question 2 in the growth lane.
- One finding per PR; a BATCH PR stays on one screen or one file.
- The caps are binding. When the budget of step 1 is used, the run stops fixing.
- A dropped finding stays dropped until its stated condition has been met.
- Report what was not verified. A verdict on a figure you could not check says so.
