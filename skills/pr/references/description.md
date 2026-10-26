# PR title and body

Writing rules for the `pr` skill. Sources:
[Blockly, write a good PR](https://docs.blockly.com/guides/contribute/get-started/write_a_good_pr/),
[Willow, how to write a good pull request description](https://willowvoice.com/blog/how-to-write-good-pull-request-description),
and GitHub's own guidance: favor why and context over restating the diff.

## Title

- One problem, one [Conventional Commit](https://www.conventionalcommits.org/) subject.
  Imperative, under 72 characters, equal to the commit title.
- Scope is the ticket id when there is one, otherwise the area. Omit it when none is honest.
- The title is the what. The why goes in the body.

## Length and tone

- Write for the reviewer. Concise and complete.
- Small fix: about 50 to 100 words. Single feature: 150 to 250. Multi-area: 300 to 400. Cut
  LLM-length drafts.
- Lead with what changed and why, then the benefit, then only the how the diff will not say.
  Tradeoffs and limits go near the top, not in a footnote.
- Start summary bullets with an active verb. No "this PR is about...".
- Describe only what the diff shows. Never invent changes, tests or screenshots.

## Sections

Omit a section that does not apply, except the ones marked required.

| Section | Answers |
|---|---|
| **Summary** | What changed, 1 to 3 bullets grouped by area, not by file. Call out new public APIs, config, version bumps. |
| **Why** (required) | The problem or motivation, and the ticket link. |
| **Benefits** (required) | What is better for a user or operator after this lands. Not a restatement of the diff. A repo may require a stronger form (Leverage: `## Value`). |
| **How** | Approach, tradeoffs, alternatives that lost. Only what the diff will not tell. |
| **Test plan** | Exact commands or click paths, environment, edge cases actually run. "Tested locally" is not a plan. |
| **UI evidence** | For user-facing work: pass or fail plus a screenshot or other proof. |
| **What to review** (required when code changed) | See below. |
| **Notes for reviewers** | Feedback wanted, follow-ups, breaking changes, migration steps to run. |

## What to review

The handful of places a human should read, most critical first, each with its file (and symbol)
and one clause on what could go wrong there. At most eight entries; a 150-file PR and a 3-file PR
both get a short list, never a file list. A docs-only or config-only PR keeps the heading and says
so in one line. Pick by consequence, not diff size:

- **data structures:** new or changed tables, columns, enums, stored JSON, API fields, workflow
  inputs, and how old data or old callers still fit;
- **money and irreversible actions:** charges, refunds, emails, deletions, migrations;
- **auth and access:** who may call it, ownership checks, secrets, anything dev-only;
- **long-running or replayed code:** workflows, schedules, idempotency keys;
- **shared code:** a package or route another product also uses;
- **the choice you are least sure of**, named as such.

## Template

```markdown
## Summary
- <primary change>

## Why
<What was missing, broken or postponed. Ticket link.>

## Benefits
- <user or operator outcome>

## How
<Only what the diff will not tell.>

## Test plan
- [ ] <command or click path>
- [ ] <edge case you actually checked>

## What to review
1. `<file>` `<symbol>`: <what could go wrong>
```

## Ticket links

Reference the ticket by id. A closing keyword (`Closes #123`) only works for GitHub issues; some
trackers link on their own id in the body (read the repo note).

## Common misses

- Why without benefits, or benefits that repeat "we added X".
- An implementation dump before the problem.
- A second issue smuggled into the same PR.
- Updating a PR by appending "also..." instead of rewriting the body for the whole branch.
