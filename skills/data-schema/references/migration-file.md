# Migration file

Every migration file opens with a header comment. It is the review: a reader must be able to judge
the file without opening the PR.

```sql
-- 0025_report_runs_week.sql
-- What: index report_runs (account_id, week) for the weekly report.
-- Why: the report filters by account and week; the primary key is (account_id, run_id).
-- Task: <issue or task id>
-- Order: after 0024. Safe before the code deploy: old code ignores the index.
-- Additive only.
-- Undo: DROP INDEX report_runs_account_week;
```

| Line | Rule |
|---|---|
| What | One concern. A data seed or backfill is its own file with its own header. |
| Why | The read it serves, the bug it fixes, the rule it enforces. |
| Task | The id that holds the discussion. |
| Order | What it assumes about the files and deploy around it: before or after the code, and why the old code survives it. |
| `Additive only.` or `Destructive:` | `Destructive:` names what is lost (a dropped column, a rebuilt table, renamed names). |
| `Undo:` | The statement to reverse it, or for a destructive file how to restore (a point-in-time restore, a backup step). Never "n/a". |
| `Contract:` | On an expand: the later step that removes the old shape, and what has to be true first. |

The migration check requires the header and, for any `DROP TABLE`, `DROP COLUMN`, `RENAME` or
`TRUNCATE`, an `Undo:` or `Destructive:` line.

A seed in its own file:

```sql
-- 0026_seed_default_plan.sql
-- What: insert the default plan row (data only, no schema).
-- Why: signup needs one plan to exist. Task: <id>
-- Order: after 0025. Runs on every database the migrations reach (local, preview, production).
-- Undo: DELETE FROM plans WHERE id = 'default';
INSERT INTO plans (id, name, price_cents) VALUES ('default', 'Free', 0);
```

A contract step names the expand it closes:

```sql
-- 0031_drop_orders_legacy_state.sql
-- What: drop orders.legacy_state (contract step of 0015).
-- Why: orders.state replaced it in 0015; nothing reads the old column since <release or PR>.
-- Task: <id>
-- Destructive: the column's values. Undo: Time Travel / restore to before this file.
ALTER TABLE orders DROP COLUMN legacy_state;
```

Code-defined schemas (a Durable Object step, a Convex schema change) carry the same lines as a
comment next to the step.
