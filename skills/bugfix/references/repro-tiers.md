# Reproduction tiers: pick the lowest that can express the bug

Lower tiers are faster, deterministic and make better permanent regression tests. Climb only when
the bug cannot show at the lower tier. The repo note (`docs/agent-kit/bugfix.md`) maps each tier
to its packages, test locations and commands.

| Tier | When the bug lives in | Where the failing test goes | Proof |
|---|---|---|---|
| 1. Unit | Pure logic: package helpers, domain or calculation code, app utils and composables | The owning package's test location | Committed test |
| 2. SQL | DB functions, RLS policies, triggers, generated columns, RPCs | The repo's SQL test suite (pgTAP or similar) against a local database | Committed test |
| 3. Server route | API handlers: validation, auth, response shape | The app's server test setup; add a minimal one if none exists | Committed test |
| 4. DB integration | Query and app code together against a real local database | The app's db test folder | Committed test |
| 5. Product, local | Browser-only UI bugs (hydration, layout, focus, scroll), cross-service flows, mobile apps | Runbook plus before-evidence in the plan; also the lowest-tier test for the broken step when one exists | Evidence, plan-only |
| 6. Product, live | Data-dependent prod bugs, third-party surfaces (payments, portals, providers), prod-only config | Runbook plus captured output (analytics query, error-tracker event, platform log, response body), read-only | Evidence, plan-only |

Tiers 1 to 4 produce a committed failing test: sufficient proof alone, and the fix is verified by
that test going green. Tiers 5 and 6 have no automated acceptance test, so the path is always
plan-only, and after the fix the same flow is re-driven to capture after-evidence.

Notes:

- A tier 5 or 6 bug usually has a tier 1 or 3 core: reproduce the broken step (the mapper that
  drops a field) at the lowest tier even when you found it through the full stack. That test ships.
- UI rendering or interaction bugs: prefer a component or composable unit test (for example
  `@vue/test-utils` with happy-dom). Only browser-reproducible: tier 5 with screenshots.
- Timing and flaky bugs: the test must fail deterministically. Force the race (fake timers,
  controlled promises); never loop until it happens to fail.
- Never reproduce destructive bugs (data loss, billing) against production data. Use a local
  database, a dev deployment, a staging tenant or the provider's test mode.
- A repo may mark an area always plan-only whatever the tier (Maelstrom: `internal/`).

## Leaving Stage 1

Exit criteria, all required:

- The test **fails for the ticket's reason**: it asserts on the buggy behavior, not on a setup
  error. Read the failure output to confirm.
- The test **discriminates**: say why it would pass if the behavior were correct. If you can stub
  or force the expected behavior cheaply, do it and watch it go green.
- You can state the **minimal trigger**: which input or state flips correct to broken.

Record exactly one outcome:

- **Reproduced by test:** test path, exact command, failure output, trigger. This becomes the
  plan's Reproduction section. Continue to Stage 2.
- **Reproduced by product only:** runbook and before-evidence, plan marked `repro: product`. Gate
  criterion 2 fails: plan-only.
- **Reproducible only against live systems:** a product repro with external evidence. Never a
  destructive repro against production data.
- **Cannot reproduce:** a first-class result. Do not guess a fix. Write up what you tried (tiers,
  commands, observed behavior) and what is missing (exact steps, tenant, data state), comment it
  on the ticket or report it to the user, and stop.
