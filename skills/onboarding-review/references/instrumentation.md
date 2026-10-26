# Instrumentation

Minimum events for a sequenced onboarding (rename to the repo's event naming convention):

| Event | When | Properties |
| --- | --- | --- |
| `onboarding:user_view_step` | a step screen mounts | `step` (number or slug) |
| `onboarding:user_complete_step` | a step is saved or advanced | `step`, `skipped?` |
| `onboarding:user_complete` | the completion timestamp is stamped | result counts (matches, actions, outcomes) |
| paywall view | the offer screen mounts | `step`, plan shown |

Value-proof screens also need low-cardinality outcome events for generate, retry, import and skip.
Capture success, duration, counts and privacy-safe error kinds, so a failed search or a partial
import is distinguishable from abandonment.

Document every event in the repo's event catalog and add an onboarding funnel to its funnel docs in
the same commit as the code.

## Continuity

When an older event served as the completion signal, note the discontinuity date in the report and
repoint saved insights to the new completion event.

## Person properties

Sync the onboarding answers that segment activation (goals, strategy, company size, acquisition
source, business type, completion flag) as person properties via `identify`, so breakdowns work
without joining event properties.
