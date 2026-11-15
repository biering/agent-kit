-- 0007_orders.sql
-- What: orders per account, with their items as JSON.
-- Why: checkout needs a durable order. Task: demo-1
-- Order: after 0006; additive only, old code never reads it.
-- Undo: DROP TABLE orders; (a new table: nothing else is lost)
-- A comment that says BEGIN; and COMMIT; and DROP TABLE x is not a statement.
PRAGMA defer_foreign_keys = on;
CREATE TABLE `orders` (
  `account_id` text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  `id` text NOT NULL,
  `total_cents` integer NOT NULL CHECK (total_cents >= 0),
  `paid` integer NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
  `items` text,
  `meta` text CHECK (meta IS NULL OR json_valid(meta)),
  `note` text DEFAULT 'it; is fine',
  PRIMARY KEY (`account_id`, `id`)
) STRICT;
--> statement-breakpoint
CREATE INDEX orders_account_paid ON orders (account_id, paid);
CREATE TRIGGER orders_touch AFTER UPDATE ON orders BEGIN
  UPDATE orders SET note = 'touched' WHERE id = NEW.id;
END;
