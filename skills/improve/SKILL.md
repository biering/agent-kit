---
name: improve
description: >-
  Turn a session mistake into one guardrail (type, test, lint rule, AGENTS.md line, skill edit) that fails on it. Use for /improve, "don't let this happen again", or a failure local checks missed.
---

# Improve

Convert this session's mistakes into checks that fail earlier and locally next time.

The bar: **a guardrail only counts if it fails on the mistake and passes without it.** Show both.

## Scope

Only what actually went wrong in the recent interaction. Not a general audit, not speculative
hardening. Nothing went wrong: say so and stop. A guardrail invented to look busy is worse than
none.

## 1. Collect the evidence

| Signal | Looks like |
|---|---|
| Escaped to a slow gate | CI, a container build or a deploy failed while typecheck, test and build passed locally |
| Self-correction | "that was wrong", a revert, a comment rewritten because its claim was false |
| User correction | the user contradicted a claim, or repeated an instruction |
| Rework | the same file edited three or more times for one intent |
| Wrong assumption | something asserted from intuition that data later disproved |
| Silent no-op | a change that did nothing because a guard or mode disabled it |

Quote the actual failure from `git log`, the transcript or CI output. Not from memory.

## 2. Classify each one

- **Would a cheap local check have caught it?** Then that check is the fix.
- **Is it a class or a one-off?** Fix classes. Note one-offs and move on.

A mistake no reasonable check could catch is a legitimate outcome: record the context in the doc
the next reader opens, and do not manufacture a test for it.

## 3. Pick the cheapest gate that runs locally

Earlier in this list is better, because it fails faster and needs no reviewer:

1. **A type** that makes the wrong state unrepresentable.
2. **A test**, including one that reads a config or greps the tree for what types cannot see
   (bundler aliases, migration headers, workflow inputs).
3. **A lint rule** for a syntactic pattern that recurs across files.
4. **An `AGENTS.md` line**, only when a machine genuinely cannot check it, and saying what
   enforces it. Keep the router short: the rule and a link there, the story in a linked doc.
   Leverage, for example, keeps the line in `AGENTS.md` and the story in `docs/invariants.md`.
5. **A skill or doc edit** when the fix is knowledge rather than a rule. Put it where the task
   that needs it already reads, not in an always-on file every session pays for.

Before adding prose, read what the agent already gets on that path and grep for the topic. A
duplicate is noise; a contradiction costs every future session a reconciliation, so change or
delete the old line instead of adding a second. Write the reason with the rule: "X, because Y"
lets a model judge the edge case a bare "never X" gets wrong.

Put the check where the mistake happens, not where it surfaces: a bundler bug belongs in the app
that bundles, not in CI.

## 4. Write the guardrail

- **Prove it fires.** Break the fix, watch the guard fail, restore, watch it pass.
- **Explain the failure in the guard.** Its message names the symptom, the cause and the fix.
- **Verify the theory first.** A guard built on a wrong mental model flags working code and gets
  deleted by the next person who hits it.
- **Describe the path.** Prefer a guide, skill or test that says how the work is done here (which
  package, import, host). A gate that forbids something belongs only when its absence is a
  load-bearing invariant of this design, never as a list of unused libraries.

- **Wire it into an existing gate** (the repo's test, lint or docs check) so nobody has to
  remember it.

## 5. Report

One short block per finding:

```text
What happened: the failure, quoted.
Why it escaped: which gate should have caught it and did not.
The guardrail: what was added, and where it runs.
Proof: the guard failing on the bug, then passing.
```

Then list what was deliberately not guarded, with the reason. That list stops the next person
re-litigating a decision already made.

## Anti-patterns

- A guard never shown failing. It is decoration.
- Rewriting `AGENTS.md` when a test would do.
- A new line beside an old one that says the opposite, or the same thing again.
- A personal memory for a repo fact: memory is one harness on one machine. Repo facts go in the
  repo.
- Guarding the one file instead of the pattern, or bulk hardening unrelated to what happened.
