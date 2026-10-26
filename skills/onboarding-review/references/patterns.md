# Patterns

## Full-page sequenced onboarding

- A dedicated onboarding route with a minimal layout (no app sidebar).
- A global redirect guard while the completion timestamp is null. Allow the onboarding route
  itself plus the pages a user must reach mid-flow (profile, billing).
- Persist the current step on every advance so a refresh resumes.
- Seed product artifacts (saved searches, profiles, checks, first report) in one real `complete`
  endpoint. A dev "skip" calls the same path, never a shortcut.

## Dev affordances

- A dev-only toolbar: fill the current step; skip all through the real complete endpoint.
- A "restart onboarding" action on the profile page backed by a server reset that nulls
  completion and step.
- Guard that reset on the server (`NODE_ENV !== 'production'` or equivalent). Hiding the button
  only strips the client.

## Name columns

When the schema has both a full-name and a surname column, keep each meaning fixed and never
overwrite the full name with only the surname. Align signup, OAuth claims, profile updates and
billing webhooks on the same rule.

## Typed columns over JSON bags

New categorical onboarding answers are database enums with generated types. Avoid an untyped
`onboarding_responses` JSON table for fields that the product, analytics or the API will read.

## Product inputs live on the product's tables

Answers that configure the product (strategy, region, budget, filters) are written straight into
the product's own tables. Do not mirror them onto the profile row.
