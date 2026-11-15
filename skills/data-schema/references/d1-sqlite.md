# D1 and SQLite: what the official skill lacks

Read the official `cloudflare` skill first (cloudflare/skills), its `references/d1/`: it routes to
the current Cloudflare docs for migrations, foreign-key deferral, limits, tenancy and recovery.
This file adds the schema-design gaps. Written from the SQLite and Cloudflare docs linked inline;
Durable Objects SQLite shares sections 1, 3 and 5.

A Postgres habit that is wrong here: "add nullable, backfill, tighten". On SQLite the "tighten"
step is a table rebuild (section 4). Get the constraints right when the table is created.

## 1. Types

- SQLite has **type affinity**, not types: a column accepts any value unless the table is STRICT.
  `varchar(10)` is TEXT affinity and stores any length; `numeric` stores `1.5` as REAL
  ([datatypes](https://www.sqlite.org/datatype3.html)).
- **STRICT** (SQLite 3.37+) allows only `INT`, `INTEGER`, `REAL`, `TEXT`, `BLOB`, `ANY` and rejects a
  value that does not fit ([STRICT tables](https://www.sqlite.org/stricttables.html)). Use it on new
  tables. Where an ORM generates the DDL from a schema file and cannot emit STRICT, a hand-added
  STRICT drifts from the ORM's snapshot: decide once per repo and write it down.
- **Booleans** are `INTEGER NOT NULL DEFAULT 0 CHECK (x IN (0, 1))`. **Enums** are
  `TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed'))`: the allowed values belong in the
  table, not only in a code comment.
- **Money:** `INTEGER` in minor or micro units. Never `REAL`, and not `NUMERIC` either (affinity).
- **Time:** no date type. Follow the repo's suffix rule; integer epoch ms for instants is the
  cheapest to compare and index.

## 2. Migration files (D1)

- Numbered `.sql` files in the binding's `migrations_dir`. Applied names are recorded in the
  `d1_migrations` table ([migrations](https://developers.cloudflare.com/d1/reference/migrations/)).
- `wrangler d1 migrations apply` runs every unapplied file **by name**. A lower number merged after
  higher ones still runs, after them. The migration check fails a new file numbered below the
  base's highest: renumber it.
- A file that errors is rolled back; the ones before it stay applied
  ([wrangler d1](https://developers.cloudflare.com/workers/wrangler/commands/d1/)). There are no
  down files. Recovery is [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
  to a point inside the retention window, so the `Undo:` line says what to run or restore.
- **No `BEGIN`, `COMMIT` or `ROLLBACK` in a file:** D1 already runs it as one unit.
- **Never insert into or delete from `d1_migrations` by hand** on a remote database. A stuck ledger
  is a question for a person.
- Large `UPDATE`/`DELETE` must run in batches ([limits](https://developers.cloudflare.com/d1/platform/limits/)),
  from code or a script, not as one statement in a migration.

## 3. Foreign keys are always on

D1 enforces foreign keys in every query and migration; `PRAGMA foreign_keys = off` is not available
([foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)). For a file that briefly
violates them (creating tables in a different order, a rebuild), put
`PRAGMA defer_foreign_keys = on;` at its top: checks move to the end of the file. Do not switch it
off inside the file.

A tenant table has the tenant key, `NOT NULL`, with `REFERENCES <tenant table>(id)` and an explicit
`ON DELETE` (CASCADE, or RESTRICT when a code-level delete list owns tenant deletes; house rule 6).
The tenant key leads the primary key and every composite index.

## 4. Changing a table: ALTER or rebuild

SQLite's `ALTER TABLE` does four things: rename a table, rename a column, add a column, drop a
column ([ALTER TABLE](https://www.sqlite.org/lang_altertable.html)). `ADD COLUMN ... NOT NULL` works
with a constant default. Everything else (a type, NOT NULL on an existing column, a CHECK, a foreign
key, a primary key) is a **rebuild**, adapted from SQLite's 12 steps to D1's always-on foreign keys:

```sql
-- Destructive: rebuilds items to add CHECK (status IN (...)). Undo: Time Travel to before this file.
PRAGMA defer_foreign_keys = on;
CREATE TABLE items_new (... the final shape, with its constraints ...) STRICT;
INSERT INTO items_new (id, account_id, status) SELECT id, account_id, status FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
-- then re-create every index, trigger and view on items
```

**Warning: rebuilding a parent table deletes its children.** `DROP TABLE` runs an implicit
`DELETE FROM` first, and that fires `ON DELETE CASCADE` on every child row; deferring the checks
does not stop the cascade ([foreign keys, section 5](https://www.sqlite.org/foreignkeys.html)).
SQLite's own recipe avoids this by turning foreign keys off, which D1 does not allow. So:

- Rebuild leaf tables freely. For a table that others reference with CASCADE, prefer an additive
  change (a new column, a new table) over a rebuild.
- If a parent must be rebuilt, apply the file to a local copy with real data first and compare the
  child tables' row counts before and after.

## 5. JSON in TEXT

- `TEXT` with `CHECK (meta IS NULL OR json_valid(meta))`
  ([JSON functions](https://www.sqlite.org/json1.html)). Without it, a bad write stores garbage that
  fails only when read.
- Bound what can grow: a D1 row is capped (2 MB at the time of writing; check the limits page), so a
  list that grows with use gets a cap in code and `CHECK (length(meta) <= 100000)` in the table.
- A JSON field that is filtered or sorted becomes a real column, or a generated column with an
  index (`kind TEXT AS (json_extract(meta, '$.kind')) VIRTUAL`; `ADD COLUMN` can only add VIRTUAL).

## 6. Shape limits

Columns per table, statement size, row size and database size are capped
([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). A database cannot grow past
its cap: decide early between one shared database with a tenant key and one database per tenant
(the official skill's `patterns.md` links the trade-off).
