---
name: bugfix
description: >-
  Ticket to fix: reproduce with a failing test, write a plan with a proposed solution, then auto-fix and open a PR only for trivial fixes. Use for bug tickets, 'X is broken', stack traces, Sentry errors, regressions.
---

# Bug fix (reproduce, plan, implement)

Read the repo's `AGENTS.md` and `docs/agent-kit/bugfix.md` first; they win where they differ. The
repo note names the ticket tracker and its commands, the plan directory, the test tiers per app,
and what the autonomy gate adds. Not for features, and not for red CI (the `ci` skill).

Own the whole job: ticket to verified fix, or ticket to reviewed plan. Not "code that might fix
it". Each stage ends at an evidence gate.

```
Intake ─→ Reproduce ─→ Plan (always, with a proposed solution)
                            │
              ┌─────────────┴──────────────┐
        trivial and certain           everything else
        (every gate criterion)              │
              │                             │
        Implement → verify → PR       stop: a human reviews the plan
```

**No plan and no fix before a failing artifact.** An unreproduced bug is a hypothesis. The
reproduction, ideally a failing test, is the proof, the implementer's acceptance criterion and
the permanent regression test that merges with the fix.

**Keep the stages apart.** Each stage hands the next a file: ticket, repro evidence, plan, diff.
Where the harness has subagents, run Reproduce, Plan and Implement in fresh contexts so unproven
suspicions do not harden into assumptions. In one context, re-read only the artifact at each
boundary and treat what it does not prove as unknown. The implementer never changes the repro
test's assertions; a test that looks wrong is a reason to stop and say so.

**Ticket write-back.** With a ticket, comment at each gate: the repro verdict and evidence, then
the plan (plan-only) or "implementing" (auto), then the PR link. No tracker access: skip silently.

## Stage 0: intake

1. Fetch the ticket (tracker CLI or MCP per the repo note). No ticket: the user's report is it.
2. **Check it is not already fixed.** One PR often fixes several tickets but names one.
   `git log origin/<default> --grep=<TICKET>` and grep the likely code paths for the id; if a fix
   landed, audit it for gaps instead of re-implementing.
3. Extract expected vs actual, the affected surface (app, route, feature), the environment (prod or
   local, tenant, browser or device) and attached evidence (screenshots, errors, analytics or
   error-tracker links).
4. Read the owning app's or package's `AGENTS.md` and the repo's local-run guide.
5. Branch off the default branch per `AGENTS.md` (`fix/<ticket>-<slug>` when it names nothing).
6. Move the ticket to its in-progress state where the repo does that.

## Stage 1: reproduce (evidence gate)

1. **Test repro, preferred and sufficient on its own.** If any automated tier can express the bug,
   the failing test is the proof; no product check on top. Pick the lowest tier
   ([references/repro-tiers.md](references/repro-tiers.md)), put the test where the owning package
   keeps tests (a minimal test setup may be added where none exists; it ships with the fix) and
   commit it on the branch.
2. **Product repro, only when no test can.** Start the app per the repo's guide and drive the real
   flow as the user does: a browser (the repo's browser-verify agent or MCP), the CLI, or `curl`
   against the API or MCP surface. Capture before-evidence verbatim: exact steps plus screenshot,
   console or network output, or response body. Reasoning about code alone is never a
   reproduction.

Leave Stage 1 only through the exit criteria in `references/repro-tiers.md` (fails for the
ticket's reason, discriminates, minimal trigger stated), with one of its four outcomes recorded.
A product-only or live-only repro means plan-only. **Cannot reproduce** is a first-class result:
report what you tried and what is missing, comment it on the ticket, and stop without guessing.

## Stage 2: plan (always written, always with a proposed solution)

Fresh context. Inputs: the ticket, the repro evidence and the failing test, nothing else.

1. **Root-cause it.** Follow the failing path until you can say why the code does the wrong thing,
   not just where. Name the file and lines.
2. Write the plan in the repo's plan directory from
   [references/plan-template.md](references/plan-template.md). The proposed solution is concrete:
   files, approach, why it fixes the root cause rather than the symptom.
3. Evaluate the autonomy gate ([references/autonomy-gate.md](references/autonomy-gate.md)) against
   the proposed solution and record the verdict, one line per criterion that decided it.
4. Commit the plan on the branch.

**Plan-only:** comment the plan location and a summary on the ticket, tell the user the plan is
ready for review, and stop. After approval, Stage 3 resumes with the plan as input. **Auto:** note
on the ticket that implementation is proceeding and continue. Any doubt on any gate criterion
means plan-only, silently; never ask the user to overrule the gate.

## Stage 3: implement

Fresh context. Inputs: the plan and the failing test.

- Work the plan's todos in order, updating each `status` in the plan file as you go.
- Verify through the channel that reproduced the bug:
  - `repro: test`: the Stage 1 test goes green and nothing else goes red. That suffices. Touch the
    repro test only to un-skip it.
  - `repro: product`: re-drive the exact runbook flow and append after-evidence beside the
    before-evidence. Green unit tests alone do not count here.
- Run the repo's local gate plus whatever the owning app's `AGENTS.md` adds.

## Stage 4: PR and close-out

The rest is the `dev-loop` skill (PR via `pr`, CI via `ci`). Bug-fix specifics on top:

1. Self-review the diff, or run a fresh-context code review: does it fix the root cause, is
   anything unrelated touched, is the repro test still honest?
2. The ticket is the commit scope: `fix(<TICKET>): <description>`, never
   `fix(<app>): <description> (<TICKET>)`. No ticket: `fix(<app-or-package>): <description>`.
   Never `--no-verify`.
3. PR title equals the commit. Body: ticket link, repro evidence summary, root cause, what changed,
   plan file link. The repro test ships in the PR. Draft or ready per the repo.
4. Comment the PR link on the ticket.
5. Take CI to green; "PR open" is not done. A failure that also happens on the default branch or a
   sibling PR is pre-existing: report it (offer a ticket), never loosen a test to hide it.
6. CI green: move the ticket to in-review where the repo does that. Never to done; people close
   tickets after deploy and verification.
