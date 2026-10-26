---
name: onboarding-review
description: Review an onboarding or mandatory setup flow for data minimisation and sequencing; trace every field to a reader. Use for onboarding review, signup friction, paywall timing, GDPR field minimisation, "why ask X first".
---

# Onboarding review

Read the repo's `AGENTS.md` and `docs/agent-kit/onboarding-review.md` first; they win where they
differ from this skill.

The output is a decision-grade redesign, not a UX wishlist. The schema and the call sites are the
evidence. Unread columns and fields the payment provider already collects are the highest-yield
findings.

## When to use

- A mandatory profile or setup modal blocks the product before value.
- Signup or first run asks for fields nobody reads.
- Paywall timing is invisible in analytics.
- The privacy policy claims a purpose the code does not implement.

Defect hunting inside a flow, event-catalog quality and post-ship funnel measurement belong to
other skills; the repo note names them.

## Workflow

1. **Map** the flow: every screen in order, what it asks, whether it blocks. Read
   `references/sequence-rubric.md`.
2. **Inventory** every field: schema, form, endpoint, column. Read `references/data-audit.md`.
3. **Trace** each field to a reader, or mark it unread:

   ```bash
   node <onboarding-review>/scripts/field-usage.mjs [--root <dir>] <column> [column...]
   ```

   It scans code files under the repo root (default: the current directory) and splits hits into
   readers and definitions (migrations, generated types, enum files). `--definitions <regex>`
   adds repo-specific definition paths.
4. **Classify** each field on two axes, kept apart:
   - *timing:* before value, at checkout (payment provider), settings later, delete;
   - *decision value:* would knowing it change a product, prompt, pricing, sales or analytics
     decision?

   Unread with high decision value is a **wiring gap**: keep it and wire a reader. Unread with no
   decision value is dead weight: delete it, personal data first.
5. **Re-sequence** against the rubric, then specify the instrumentation that makes the claim
   measurable. Read `references/instrumentation.md` and `references/patterns.md`.
6. **Write the report** from `references/report-template.md` where the repo keeps plans.

## Evidence rules

- Use `scripts/field-usage.mjs` for every "unread" claim, not a hand grep.
- A field the payment provider collects at checkout (address, phone, tax id) is a first-class
  deletion signal for a pre-value form.
- A privacy-policy purpose with no code path is a minimisation bug: delete the field and correct
  the policy in the same change.
- Never invent a consumer to justify keeping a column. "We could tune the assistant's tone by
  seniority" is the classic failure.
- Instrument step view, step complete and paywall view so drop-off is computable.

## References

- `references/sequence-rubric.md`: screen order and rules.
- `references/data-audit.md`: the field table, timing buckets, decision-value test.
- `references/patterns.md`: implementation patterns for a sequenced flow.
- `references/instrumentation.md`: minimum events and person properties.
- `references/report-template.md`: the report skeleton.
- `scripts/field-usage.mjs`: column-to-reader tracer (tests in `field-usage.test.mjs`).
