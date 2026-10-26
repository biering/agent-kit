# Autonomy gate: who implements

Evaluated at the end of Stage 2 against the **proposed solution**, not the ticket. Auto-implement
only if every criterion holds. Any doubt on any item resolves to plan-only, silently: never ask the
user to overrule the gate. A repo can add criteria in `docs/agent-kit/bugfix.md`.

| # | Criterion |
|---|---|
| 1 | Root cause is **proven** by the failing test, not inferred from reading code |
| 2 | An automated failing test exists (a runbook-only repro is never auto) |
| 3 | Small fix: about 40 changed lines or fewer across at most 3 source files (tests and snapshots excluded) |
| 4 | Confined to **one** app or one package (plus regenerated types if mechanical) |
| 5 | No UI-flow, navigation or state-machine change. Restoring the intended behavior of an existing element is fine; changing what happens or where the user goes is not |
| 6 | Nothing in an area the repo marks safety-critical or always plan-only |
| 7 | No DB schema or migration, no RLS, no auth or security, no billing or credits |
| 8 | No public API contract change (routes, request or response shapes, OpenAPI) and no cross-app env, deploy, container or platform config change |
| 9 | No new dependency |
| 10 | You can state the fix in two sentences and would bet on it. Enumerating alternatives means you are not sure enough |

Record the verdict in the plan's **Autonomy verdict** section, one line per criterion that decided
it (format in `plan-template.md`).

- **Plan-only:** comment the plan location and a summary of the proposed solution on the ticket,
  tell the user the plan is ready for review, and stop. After approval, implementation resumes at
  Stage 3 with the plan as input.
- **Auto:** note on the ticket that implementation is proceeding, then continue to Stage 3.
