# Data audit

For every field on the onboarding or mandatory profile surface:

| Column | Form required? | Endpoint | DB | Readers | Timing | Decision value | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Timing buckets

- **before_value:** needed to personalise or seed the product before first use.
- **at_checkout:** the payment provider already collects it; do not ask earlier.
- **settings_later:** editable on a profile or settings page after value.
- **delete:** no reader and no decision value, or a false privacy-policy purpose.

## Decision-value test

If we knew this, would we change product, prompt, pricing, sales or analytics segmentation? Yes and
unread: **wiring gap** (keep and wire a reader). No and unread: **delete**.

## Payment-provider redundancy

Read the checkout session config. Stripe example: `billing_address_collection`,
`phone_number_collection`, `tax_id_collection`, `customer_update`. Trace the webhook that writes
those fields back. Asking for them before value when they arrive at purchase is the highest-yield
cut.

## Privacy-policy cross-check

For every personal-data field, find the public purpose claim. A claim with no code path (an "age
verification" purpose with no age gate) is a minimisation bug: delete the field and correct the
policy in the same change.
