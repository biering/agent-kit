# Bug-fix plan template

Location and file name come from the repo note (`docs/agent-kit/bugfix.md`). With none named:
`.cursor/plans/<ticket>_<short_slug>_<8-hex>.plan.md`, 8 random hex characters.

The frontmatter and todos follow the repo's plan format; the body sections below are required for
bug-fix plans. The plan stands alone: a person or a fresh implementer reads only this file and the
failing test and can proceed. Quote frontmatter values that contain a colon.

```markdown
---
name: "Fix <TICKET>: <one-line bug title>"
overview: "<2 to 3 sentences: what breaks, the root cause, the proposed fix.>"
todos:
  - id: fix-<slug>
    content: "<the code change, named concretely: file and what changes>"
    status: pending
  - id: verify-repro-green
    content: "Repro test <path> goes green; surrounding suite stays green"
    status: pending
  - id: repo-verify
    content: "<the repo's local gate plus the owning app's AGENTS.md checks; browser pass for user-facing changes>"
    status: pending
isProject: false
---

# Fix <TICKET>: <title>

## Ticket

<Link or user report, expected vs actual, condensed. Environment or tenant if relevant.>

## Reproduction  (repro: test | product)

For `repro: test` (sufficient proof on its own):
- **Failing test:** `<path>`, run: `<exact command>`
- **Failure output:** <the failing assertion, quoted; proves it fails for the ticket's reason>
- **Minimal trigger:** <which input or state flips correct to broken>

For `repro: product` (no test could express the bug):
- **Runbook:** <exact steps driving the real product: how it was started, URL, flow, CLI or API calls>
- **Before-evidence:** <screenshot, console output or response body showing the broken behavior>
- **After-evidence:** _(appended by the implementer after the fix)_ <same flow re-driven, expected behavior observed. Not fixed until this exists.>

## Root cause

<Why the code does the wrong thing: file and lines, the faulty assumption, and what introduced it if known (git blame). Suspicions checked and ruled out go here too, marked as ruled out.>

## Proposed solution   (required, always)

<The concrete fix: which files, what changes, why it is the root-cause fix. A symptom patch says so and justifies itself. One short paragraph on alternatives and why they lost. Follow-up work intentionally out of scope.>

## Risk / blast radius

<Who else calls this path, what could regress, migration, contract and UI-flow implications. State each "none" explicitly; the autonomy gate depends on them.>

## Autonomy verdict   (required)

**auto-implement** | **plan-only**, one line per gate criterion that decided it
(for example "plan-only: touches an RLS policy (gate 7)" or "auto: 12 lines in 1 file, unit-tested root cause, no contract or UI change").
```

Rules:

- `status` starts `pending`; the implementer updates it in place as todos complete.
- Every todo has a verify step or is one; the last two are always `verify-repro-green` and
  `repo-verify`.
- **Proposed solution** is never "TBD". A plan without one is not done.
- A plan-only plan ends with what the reviewer should check before approving: the one or two
  genuinely debatable choices.
