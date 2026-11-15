# Durable Objects SQLite: what the official skill lacks

Read the official `durable-objects` skill first (cloudflare/skills): bindings, `new_sqlite_classes`,
initialising in the constructor under `blockConcurrencyWhile()`, storage rules. Types, foreign keys,
rebuilds and JSON follow `d1-sqlite.md`. This file adds schema evolution, which neither covers.

The `migrations` array in the wrangler config is about **classes** (create, rename, delete a
Durable Object class), not tables. There is no runner for table changes.

## Every object migrates itself

Each object holds its own database and runs its schema code when it wakes. Thousands of objects
can sit at different versions, and an object idle for months wakes into today's code. So:

- **A schema version stored in the object**, not inferred by probing `pragma_table_info` for one
  column (that works once and does not scale to the second change).
- **An ordered list of steps**, append-only. A shipped step is never edited, reordered or removed.
- **Steps are additive**: an object at version 0 must reach the latest by running every step in
  order, on whatever data it holds.
- **Run them in the constructor under `blockConcurrencyWhile()`**, inside one
  `ctx.storage.transactionSync()`. `sql.exec()` cannot run `BEGIN`, `COMMIT` or `SAVEPOINT`
  ([SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)).

```ts
// Append only. Header per step: what, why, task, Undo.
const STEPS: ((sql: SqlStorage) => void)[] = [
  // 1: events table (task-12). Undo: none needed, new table.
  (sql) => sql.exec(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('view', 'click'))
  ) STRICT`),
  // 2: events.source for the referrer report (task-31). Undo: ignore the column.
  (sql) => sql.exec(`ALTER TABLE events ADD COLUMN source TEXT`),
]

function migrate(storage: DurableObjectStorage) {
  const sql = storage.sql
  sql.exec(`CREATE TABLE IF NOT EXISTS _schema (version INTEGER NOT NULL)`)
  const version = sql.exec<{ version: number }>(`SELECT version FROM _schema`).toArray()[0]?.version ?? 0
  if (version >= STEPS.length) return
  storage.transactionSync(() => {
    for (let i = version; i < STEPS.length; i++) STEPS[i](sql)
    sql.exec(`DELETE FROM _schema`)
    sql.exec(`INSERT INTO _schema (version) VALUES (?)`, STEPS.length)
  })
}

// in the class:
constructor(ctx: DurableObjectState, env: Env) {
  super(ctx, env)
  ctx.blockConcurrencyWhile(async () => migrate(ctx.storage))
}
```

An object that already has tables from before the version row: make step 1 idempotent
(`IF NOT EXISTS`) and let an existing probe decide the starting version once.

## Test it

A step is code, so the migration check only sees it if the repo lists the file under the
`durable-objects` engine (it then flags transaction statements). The real check is a test: create
an object with the oldest schema and data, wake it under the new code, assert the version and the
rows.

## Growth

An object's storage is capped ([limits](https://developers.cloudflare.com/durable-objects/platform/limits/)).
An append-only table (an event log, a change feed) gets a retention or compaction rule when it is
created, written next to its step.
