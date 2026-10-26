---
name: legal-review
description: >-
  Audit one app's Impressum, Datenschutz and cookie consent against DE/EU law (DDG, TDDDG, DSGVO) and its real code stack. Use when adding a tracker or third-party service, before launch, or for 'is the imprint correct'.
---

# Legal review (DE/EU): imprint, privacy policy, consent vs. the real stack

Read the repo's `AGENTS.md` and `docs/agent-kit/legal-review.md` first; they win where they differ
from this skill. The repo doc names the apps, where company details live, the house analytics and
the reference implementation.

What this pass adds over a lawyer reading the text: an agent can read the codebase, so it
reconciles what the privacy policy *claims* against the third-party services the code *actually*
loads, and proves that non-essential scripts are gated behind consent.

## Ground rules

- **Not legal advice.** The output is an engineering compliance checklist with fixes. Anything
  non-obvious (does § 34c GewO apply to this domain? is this joint controllership?) is flagged
  "confirm with legal", never silently decided.
- **Jurisdiction: Germany and Austria / EU** (DSGVO, DDG, TDDDG). If an app targets other markets,
  say so and note the checklist does not cover them.
- **One app at a time.** Ask which. Each app has its own stack and its own legal pages, so a
  finding for one never carries over to another. A pattern found in one app is still worth
  checking across the others before concluding: estates drift.
- **Every finding carries a concrete action.** Not "privacy policy is missing X" but "add a
  section for Google Ads, legal basis § 25 Abs. 1 TDDDG + Art. 6 (1)(a) DSGVO, recipient Google
  Ireland Ltd., USA transfer DPF/SCCs, pattern at `<file>:<section>`".
- **No operator data in findings you did not read.** Register court, register number, VAT ID,
  address and the responsible `<Aufsichtsbehörde>` come from the repo's company constants or the
  live page. Never guess or fill them from memory.

## Rules that catch the usual misses

- **Contact details rendered as an image** (a hosted imprint image) do not show up in a grep.
  Fetch and read the image before reporting a missing field.
- **`localStorage` counts.** § 25 TDDDG covers any storage on the device, not only cookies. A
  key with no personal data still needs a policy line.
- **Cookieless is not a DSGVO pass.** No § 25 consent still leaves the Art. 13 disclosure and an
  Art. 21 objection right. Every analytics service in the code needs a policy section naming the
  entity, data, legal basis and objection route.
- **A tracker that runs without a banner** must really write nothing to the device. Check the
  integration options and the privacy page agree.

## Workflow

0. **Scope.** Confirm the app and its production domain(s), find the legal pages and where the
   footer links them (a link to *another* product's domain is a red flag), and note the languages
   it ships. German text is authoritative for a DE/AT audience; English is a nice-to-have, not a
   legal substitute.
1. **Inventory the actual stack from the code.** The load-bearing step: every service that
   touches personal data, sets cookies or storage, or calls a third party. Commands, the vendor
   classification table and why a shared policy fails: `references/inventory.md`.
2. **Imprint** (§ 5 DDG, § 18 Abs. 2 MStV): item table with a fix per gap in
   `references/imprint.md`.
3. **Privacy policy** (Art. 13 DSGVO), reconciled against step 1 in both directions:
   `references/privacy-policy.md`.
4. **Consent gating** (§ 25 TDDDG), proven in code and at runtime. A tracker firing before
   consent is the costliest finding: `references/consent-gating.md`.
5. **Cross-cutting.** An **AVV/DPA (Art. 28)** with every processor (hosting, analytics, payment),
   listed as confirmed vs. open; **TLS** everywhere; a **data-subject contact** that works (the
   policy's email is monitored); **data minimisation** on every form (only necessary fields, each
   justified).

When a finding cites a law change or date (DDG, TDDDG, ODR shutdown, Consent Mode v2, DPF), take
it from `references/legal-facts.md` and re-check it if the verification date is old.

## Output

A findings report, most severe first. **P0**: live unlawful processing (tracker firing
pre-consent, no CMP). **P1**: missing or incorrect mandatory content (imprint gap, service missing
from the policy, stale ODR link, TMG/TTDSG wording). **P2**: polish (over-disclosure, missing
retention line, no EN translation). Template: `references/output-format.md` (stack table,
findings with a fix each, "confirm with legal" list).

Legal pages are a liability decision: propose wording, and leave the final text to the owner.
Keep the pages non-indexable if the repo says so.
