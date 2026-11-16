---
name: daily-log
description: >-
  Writes one short build log per day for a repo: only what is worth sharing publicly (learnings, agent tips, wins, failures, ideas, each with its why), from a cheap digest. Use for the daily log, build-in-public notes, or when scheduling that routine.
---

# Daily log

One file per day, `<log dir>/YYYY-MM-DD.md`, written from a digest. Another agent outside the repo
reads these files and turns them into posts. This skill never writes a post. Every file opens with
a Stats block (the day's numbers per product) when the repo configures one, then the entries.

Read the repo's `AGENTS.md` and `docs/agent-kit/daily-log.md` first; they win where they differ.

## 1. Gather (no thinking yet)

```bash
node vendor/agent-kit/bin/agent-kit.mjs daylog collect --date YYYY-MM-DD   # default: yesterday, UTC
```

The digest is the only input: merged PRs with their Why/Benefits, reverted or closed PRs, CI that
failed and got fixed, board tasks finished or failed, new decision rows, the owner's own words.
It is capped (default 6000 tokens) and ends with `Cut for size` when it dropped something.
**Do not read file trees, diffs or the git log.** If a fact is missing, leave it out. If the digest
says `Nothing happened`, go to "Quiet day".

If the digest has a `## MCP reads needed` list (an analytics source that is an MCP tool, which the
command cannot call), call each listed tool once with the listed arguments, save the results as
one JSON file `{"<key>": <result>}` in a temp folder, and run the same command again with
`--mcp <file>`. Do not type numbers into the log yourself.

Sources and paths come from the `daylog` block of `agent-kit.config.json` (see the kit README).

## 2. Stats block

When the digest has a `## Stats` section, copy it into the log **verbatim**, from `## Stats` through
the `<!-- stats-data: ... -->` line, above the first entry. Do not edit, round, reorder, translate or
fill in a number: the command did the arithmetic (the day, the change against the day before, the
running total, `day N of M` and the score of a challenge) and read each number once from its source.
The last line is the machine-readable memory for tomorrow's change and total; keep it.

- A number the command could not read says `not measured: <reason>`. Leave it so. Never replace it
  with a guess, a zero or a number from the entries.
- The block is facts for the writer outside the repo. Add no comment, no reading of the numbers
  ("up nicely"), no hook and no post text to it.
- Only totals appear: no customer, no single payment, no personal data. If a line ever shows one,
  cut that line.
- No `## Stats` section means the repo tracks none: write entries only.

## 3. Pick

Keep an item only if a stranger would learn something or enjoy it **and** the digest says why it
was done. A feature with no why is not an entry. Aim at the surprising: a thing that failed, a
rule that came out of a mistake, a number that moved, a choice between two options and the reason.

Types (use exactly one per entry):
`learning`, `agent tip`, `win`, `challenge`, `idea`, `best practice`, `failure`, `fun`,
`experiment`, `journey` (the owner's own path: a doubt, a decision, a shift in plan).

At most about 8 entries. Fewer is better. Merge related items into one entry.

## 4. Write

```markdown
---
date: 2026-03-10
repo: <repo name>
entries: 3
---

<the Stats block from the digest, when there is one>

## failure: Headline in one line
Two to four sentences: what happened and, above all, why. Plain words.
Source: PR #123 · task demo/7 · decision 2026-03-10 row "<first words>"
```

- Headline: one line, a claim or a story beat, not a feature name.
- Body: two to four sentences. What happened, then why it matters or why it was done.
- Source line on every entry: PR number, task id or decision row, so the reader outside can check.
  Several are fine. An entry without a source is dropped.
- The owner's words may be quoted, short, and only when the digest has them.

**Leave out:** file names, small features without a why, routine merges and dependency bumps,
secrets and tokens, customer or client names, personal data of anyone except the owner, any number
that is not in the digest. No post drafts, no hashtags, no hooks, no calls to action.
Never invent a why: when the digest does not say, drop the entry.

## Quiet day

Without a Stats block, write `Nothing to share.` as a one-line file (no frontmatter). With one, the
numbers still go out every day: frontmatter with `entries: 0`, the Stats block, then
`Nothing to share.`. A file per day, even an empty one, tells the reader the routine ran and the
day was checked, so a gap means a failure, not silence. (The stats ledger also needs yesterday's
file, so a missing day breaks tomorrow's running totals.)

## 5. The routine

Schedule one run a day, shortly after UTC midnight, for the day that just ended.

- **Model and effort:** a small model (Haiku class) at low effort. The digest is already
  condensed, so the job is picking and phrasing, not research.
- **Input:** the `daylog collect` output only (plus, for MCP sources, the listed tool calls and a second collect run). No file trees, no repo search, no tools besides
  the collect command and writing the one file. That is what keeps a run at a few cents.
- **Landing the file:** commit straight to the default branch with `[skip ci]` in the subject
  (`docs(daily-log): 2026-03-10 [skip ci]`) when the branch rules allow a bot push. That costs no
  PR, no review and no CI minutes, and a text file in the log dir cannot break a build. Where
  the default branch is protected, open a docs PR and enable auto-merge, but **only when the diff
  touches the log dir alone** (check `git diff --name-only`; anything else, stop and leave the PR
  open). Auto-merge needs the required checks to report; a path filter that skips CI entirely
  leaves them pending, so give the repo a trivial always-green check for docs-only paths first.
- **Exception to the pr and dev-loop rule.** Those say never to push to the default branch; this is a deliberate carve-out for a bot that writes only a text file in the log dir, and a repo that wants no exception uses the docs-PR path. Update the default branch (`git pull --ff-only`) before collecting so the digest and the file see the same history.
- **Idempotent:** if `<log dir>/YYYY-MM-DD.md` exists, do nothing.
- **Scheduling:** any scheduler works (a cron job, a hosted agent routine, the CEO's daily run).
  The command line is the same.

## Check before saving

- Frontmatter `date`, `repo`, `entries` matches the count of entries (`## <type>: ...` headings; `## Stats` is not one).
- The Stats block is the digest's, byte for byte, and sits before the first entry.
- Every entry has a type, a headline, 2 to 4 sentences, a source.
- No file names, secrets, customer names, hashtags or hooks.
- Under about 8 entries.

An example file is in `references/example.md`.
