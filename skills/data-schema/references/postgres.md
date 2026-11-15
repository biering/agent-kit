# Postgres: what the official skill lacks

Read `supabase-postgres-best-practices` first (supabase/agent-skills). It owns keys, data types,
constraints, foreign-key indexes, RLS, query, connection and lock rules, and JSONB indexing. This
file adds only the four gaps: migrations as a process, expand and contract, soft delete and audit
columns, and JSON column design.

> **Attribution.** Sections 1 and 2 are adapted from two Apache-2.0 works:
> [Neon `postgres-best-practices`, `references/schema-design.md`](https://github.com/neondatabase/postgres-skills/blob/27fe45e0f71ea89a6eaf9ea4d2e4068957c81c26/skills/postgres-best-practices/references/schema-design.md)
> (commit `27fe45e0f71ea89a6eaf9ea4d2e4068957c81c26`) and
> [Timescale `pg-aiguide`, `postgres-database-migration/SKILL.md`](https://github.com/timescale/pg-aiguide/blob/1aef6e452b97fae580d57677a807fd0d601ddc7b/skills/postgres-database-migration/SKILL.md)
> (commit `1aef6e452b97fae580d57677a807fd0d601ddc7b`; NOTICE: "Copyright 2025 Timescale, Inc., d/b/a
> Tiger Data"). Licence text: [`LICENSE-Apache-2.0`](LICENSE-Apache-2.0).
>
> **Changes made here:** shortened, merged and reworded; fork-based testing and vendor promotion
> removed; the PG18-only syntax dropped; the claim that `now()` is volatile corrected. `now()` is
> STABLE, so `ADD COLUMN ... DEFAULT now()` is a metadata-only change on PG 11+ and every existing
> row gets the statement's time. Only a volatile default (`clock_timestamp()`, `gen_random_uuid()`,
> `random()`) rewrites the table
> ([ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html), Notes). Sections 3
> and 4 are ours.

## 1. Migrations as a process

Habits worth having before the tables are big. A lock that waits is the outage: an `ALTER TABLE`
queued behind one long query blocks every query that arrives after it.

**Set a lock timeout on every DDL file** that touches a table with traffic, and retry on failure
instead of waiting:

```sql
set lock_timeout = '5s';
set statement_timeout = '30s';  -- not for CREATE INDEX CONCURRENTLY on a big table
```

On `lock_not_available`, find the blocker in `pg_stat_activity`, wait, run again.

**Fast (catalog only, brief lock):** `ADD COLUMN` nullable or with a non-volatile default,
`DROP COLUMN`, `SET`/`DROP DEFAULT`, `RENAME`, `ADD CONSTRAINT ... NOT VALID`.
**Slow or blocking:** `ALTER COLUMN TYPE` (most casts rewrite), `ADD COLUMN` with a volatile
default, a validated `ADD CONSTRAINT` (scans under a heavy lock), `SET NOT NULL` without a valid
CHECK, `CREATE INDEX` without `CONCURRENTLY` (blocks writes for the whole build).

**Constraints: add NOT VALID, then VALIDATE.** `VALIDATE` takes a lock that allows reads and writes.

```sql
alter table orders add constraint orders_amount_cents_check
  check (amount_cents >= 0) not valid;
alter table orders validate constraint orders_amount_cents_check;

alter table orders add constraint orders_account_id_fkey
  foreign key (account_id) references accounts (id) not valid;
alter table orders validate constraint orders_account_id_fkey;
```

**NOT NULL on an existing column (PG 12+):** a validated CHECK lets `SET NOT NULL` skip its scan.

```sql
alter table orders add constraint orders_status_nn check (status is not null) not valid;
alter table orders validate constraint orders_status_nn;
alter table orders alter column status set not null;
alter table orders drop constraint orders_status_nn;
```

**Name constraints; drop them by name.** `drop constraint if exists orders_amount_cents_check`.
Never find a constraint by matching `pg_get_constraintdef()` text: a different spelling survives,
an unrelated match is dropped. The default names are `<table>_<column>_check`, `_fkey`, `_key`;
write them out anyway.

**Indexes on tables that have rows: `CONCURRENTLY`.** It cannot run inside a transaction block,
so check how the migration runner applies a file: if it wraps each file in a transaction, give the
index its own file or the runner's no-transaction option. A failed concurrent build leaves an
INVALID index; find it (`select indexrelid::regclass from pg_index where not indisvalid`), drop it
`concurrently`, build again. A unique constraint: build the unique index concurrently, then
`add constraint ... unique using index <name>`.

**Change a column type:** a new column, a batched backfill, switch the reads, drop the old one
(section 2). Not `ALTER COLUMN TYPE` on a table with traffic.

**Backfill in batches** (by primary key range, a few thousand rows each), never one `UPDATE` over
the table, and in its own file (house rule 4).

**`DROP COLUMN`** is fast but only marks the column dropped: the values stay on disk until the
space is reused. Ship the code that stops reading it first. For sensitive data, plan the rewrite
that removes it.

**Atomic or short locks.** One transaction makes a multi-statement file all-or-nothing but holds
every lock until the end. Keep a file's statements fast, or split it.

## 2. Expand and contract on Postgres

Rename or retype `status` to `state` without a broken deploy:

1. **Expand:** `add column state text` (nullable), with a named CHECK `not valid`. Header names the
   contract step.
2. **Dual write:** code writes both columns.
3. **Migrate:** batched backfill `state = status` where `state is null`; then validate the CHECK and
   set NOT NULL (section 1).
4. **Switch reads** to `state`.
5. **Contract** (a later deploy, own file, `-- Destructive:` line): `drop column status`.

A careful project ships each step as its own deploy; a project that allows clean breaks may fold
2 to 4 into one, as long as the old code survives the new schema for one deploy.

## 3. Soft delete and audit columns

- `deleted_at timestamptz` (NULL = live). Every unique rule that should apply to live rows only
  becomes a partial unique index: `create unique index ... on items (account_id, slug) where
  deleted_at is null`. Indexes that serve live reads get the same `where`.
- Reads that clients make must not see deleted rows: put `deleted_at is null` in the RLS policy or
  the view (`security_invoker = true`), not only in application queries.
- A soft-deleted row is still personal data. The repo's data-safety rules say when it is purged.
- Audit columns: `created_at timestamptz not null default now()` and `updated_at timestamptz not
  null default now()`. Postgres has no `ON UPDATE`: keep `updated_at` with a `before update`
  trigger (the `moddatetime` extension, or a three-line trigger function). Add `created_by` only
  where an app needs to show it.

## 4. JSON column design

- `jsonb`, never `json` (unless the exact input text must be kept).
- JSON is for attributes that are read as a whole, sparse, or shaped by someone else (a webhook
  payload). A field that is filtered, joined, sorted, constrained or summed becomes a column.
- Constrain the shape you rely on: `check (jsonb_typeof(meta) = 'object')`, and a bound when the
  content can grow without limit (`check (pg_column_size(meta) < 65536)`).
- Indexing JSON: the official skill's `advanced-jsonb-indexing` rule.
