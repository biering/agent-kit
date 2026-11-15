# Supabase: what the official skills lack

Read the two official skills from supabase/agent-skills first:

- `supabase`: the CLI, the migration workflow (`supabase migration new`, declarative schemas in
  `supabase/schemas/`), the security checklist. RLS policies with `(select auth.uid())`, and UPDATE
  policies with both `USING` and `WITH CHECK`, are explained there.
- `supabase-postgres-best-practices`: the Postgres rules (types, keys, constraints, indexes, RLS
  performance).

Then `postgres.md` for migrations as a process. This file adds only the following.

## Files

- Migrations live in `supabase/migrations/<timestamp>_<name>.sql`. The timestamp is the number the
  migration check compares: a branch's new file must sort after every file on the base branch, so
  regenerate the name (`supabase migration new`) when the base moved past it.
- Every change goes through a migration file. A change made in the dashboard on the remote database
  is not in the files and breaks the next `db push`.
- The header of `migration-file.md` applies, also to a generated file: add it after generating.

## In the same migration as the table

- `enable row level security` and the table's policies, in the file that creates the table. A table
  never exists on a remote database without them, not even for one deploy.
- A soft-delete column (`deleted_at`) means the client-facing policies filter `deleted_at is null`.

## Generated types

After a migration, regenerate the database types and commit them in the same PR:

```bash
supabase gen types --lang typescript --local > <path the repo uses>
```

Check the exact flags with `supabase gen types --help`. A PR whose migration changes a column but
not the generated types is not done.
