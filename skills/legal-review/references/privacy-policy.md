# Privacy policy checklist (Art. 13 DSGVO + stack reconciliation)

## Structural (Art. 13)

- Verantwortlicher (name, address, email), from the repo's company constants
- DPO, or an explicit "none" with the reason
- Supervisory authority (`<Aufsichtsbehörde>` of the operator's state) + Beschwerderecht (Art. 77)
- Per processing: **purpose, legal basis, recipients, third country, retention**
- Data-subject rights (Art. 15 to 21) + withdrawal (Art. 7(3))
- Automated-decision statement (Art. 22)
- Minors

## Reconciliation: compare the step 1 inventory to the policy, both ways

This is the real check.

- **Every service the code loads has a policy section.** For each inventoried service not
  covered, the action is: add a subsection with entity, data categories, purpose, legal basis
  (non-essential trackers: `§ 25 Abs. 1 TDDDG i. V. m. Art. 6 Abs. 1 lit. a DSGVO`), recipient,
  US-transfer wording (`DPF/SCCs/TIA`), retention, and withdrawal via the CMP. Reuse the section
  pattern already in the file.
- **Every policy section maps to real code.** A section describing Stripe, Mapbox or a
  newsletter the app does not use gets removed (or its server-side counterpart confirmed).
  Over-disclosure looks sloppy and confuses users; under-disclosure is the finable one.
- **Device storage is disclosed.** Every `localStorage`/`sessionStorage` key or cookie from the
  inventory has a line, even one with no personal data.
- **Current-law wording.** The policy says **TDDDG**, not TTDSG, and references **§ 5 DDG**
  where it points at the imprint's legal basis (dates in `legal-facts.md`).
- **US transfers.** Every US recipient (Cloudflare, Meta, Google) needs a transfer basis: DPF
  for certified vendors, and/or SCCs + TIA. Flag any US service with no transfer sentence.
- **Retention.** Every processing lists a concrete period or a rule, not "as long as necessary"
  alone. Flag blanks.
- **Version/date.** A "Stand: <date>, Version: <n>" line, updated when the stack changes.
