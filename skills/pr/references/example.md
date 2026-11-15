# Example: the same PR, before and after

An invented PR in an invented app. Same change, two bodies. Title for both:
`fix(SHOP-214): keep the cart when a session expires`

## Before (the old template, about 260 words)

```markdown
## Summary
- Added a `restoreCart` function to `src/cart/session.ts`
- Updated `src/cart/store.ts` to call `restoreCart` on login
- Added a `cart_snapshots` table in `db/migrations/0042_cart_snapshots.sql`
- Updated `src/api/checkout.ts` to read from the snapshot
- Added tests in `src/cart/session.test.ts`

## Why
Customers who were logged out by an expired session lost their cart. This is described in SHOP-214.
Support has seen several tickets about it.

## Benefits
- Better user experience
- Fewer support tickets

## How
We now save a snapshot of the cart every time it changes. When the user logs in again, the
snapshot is loaded. The snapshot is stored in a new table. The checkout API was changed to read
the cart from the snapshot instead of from the session. This is done in order to make sure that
the cart survives a session expiry.

## Test plan
- [x] Tested locally
- [x] Unit tests pass

## What to review
1. `src/cart/session.ts` restoreCart
2. `src/cart/store.ts`
3. `db/migrations/0042_cart_snapshots.sql`
4. `src/api/checkout.ts`
5. `src/cart/session.test.ts`
```

What is wrong: the summary is the file list and the diff says it already. The benefit is a slogan.
The how repeats the summary. The test plan proves nothing. The review list is five files with no
reason to read any of them, so the one risky spot (a migration on a hot table) looks like the rest.

## After (about 105 words before the optional sections)

```markdown
## Benefit
A customer whose session expires keeps their cart after logging in again, so they can finish the
purchase instead of starting over. Support has had 14 tickets about lost carts this month.

## Review focus
- `db/migrations/0042_cart_snapshots.sql:6`: adds an index on `orders`, a large table. Could lock
  writes during deploy.
- `src/cart/session.ts:58`: the snapshot is restored on login; if it is older than the live cart,
  the wrong one could win.
- `src/api/checkout.ts:31`: checkout now reads the snapshot, so a missing snapshot must fall
  back to the session cart.

## Verified
- Expired the session by hand in staging, logged in, cart was back with 3 items.
- `npm test -- cart`: 18 passed, 4 new.

## Needs a human
- Run migration 0042 outside peak hours (about 2 minutes on a copy of production).
```

What changed: the Benefit says what the customer gains, with the evidence in one clause. The
Review focus is three bullets, each with a line and a failure, and the riskiest one is first.
The file list, the repeated how and the slogans are gone. The migration note moved to the one
place a human has to act.
