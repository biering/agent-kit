CREATE TABLE runs (
  site text NOT NULL,
  cost_usd real DEFAULT 0,
  token_eur_per_million REAL,
  state text,
  faults text DEFAULT '[]'
);
BEGIN TRANSACTION;
ALTER TABLE runs ADD COLUMN price_cents numeric;
ALTER TABLE runs DROP COLUMN site;
ALTER TABLE runs RENAME TO old_runs;
COMMIT;
PRAGMA foreign_keys = off;
