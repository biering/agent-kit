# Convex: what the official skills lack

Read the official `convex-migrate` skill first (convex/agent-skills): widen, migrate with
`@convex-dev/migrations`, verify, narrow. The rest of the `convex` skills cover functions, auth and
indexes. This file adds what they leave out.

A push fails when existing documents do not match the schema
([schemas](https://docs.convex.dev/database/schemas)), so a type change is always widen, migrate,
narrow; that is house rule 5 with the engine enforcing it.

## Staged validators

Check the narrow validator against every document before it is enforced. Keep the current
validator in `defineTable` and stage only the fields that change:

```ts
items: defineTable({
  label: v.string(),
  value: v.union(v.string(), v.number()),
  legacy: v.optional(v.string()),
}).staged({
  value: v.number(),   // the narrowed type
  legacy: undefined,   // checks that no document still has it; deletes nothing
}),
```

Writes are still checked against the current validator while the background scan runs. Once the
deploy output shows the table validated, move the staged fields into `defineTable`, remove
`.staged()` and deploy again. The narrow step of a migration is that second deploy.

## Strict validators

- No `v.any()`. Never `schemaValidation: false`.
- No JSON strings (`settingsJson: v.string()`): a `v.object()` or `v.array()` validator is checked
  on every write; a string is not.
- Money: integer minor units in `v.number()` (or `v.int64()`), named with the unit (`priceCents`).

## References are not enforced

`v.id("table")` checks the shape of the id, not that the document exists: deleting a parent leaves
its children pointing at nothing, and `db.get` returns `null`. A delete removes or reassigns its
children in the same mutation (or a migration batch for many), and readers handle `null`.

Store a link in one direction only. Two documents that point at each other drift apart.

## Indexes

- The tenant field first (`by_account_status: ["accountId", "status"]`), then equality fields, then
  the range field; `_creationTime` is appended to every index automatically.
- An index that is a prefix of another (`by_account` next to `by_account_status`) is redundant: the
  longer one serves the shorter query. Remove the prefix one.
- Per-table index count, fields per index, document size and array length are capped
  ([limits](https://docs.convex.dev/production/state/limits)): a list that grows with use becomes
  its own table.
