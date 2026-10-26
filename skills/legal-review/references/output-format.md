# Output format: findings

Most severe first. Severity definitions are in SKILL.md "Output". Start the report with one line:
"Engineering compliance checklist, not legal advice."

```markdown
# Legal review: <app> (<domain>), <date>

Engineering compliance checklist, not legal advice.

## Stack inventory (from code)
| Service | Vendor | Cookies/storage | Consent-req | US transfer | In policy? |
|---|---|---|---|---|---|
| ... | ... | ... | ... | ... | ✓ / ✗ |

## Findings
- [ ] **P0 (consent)**: <file:line>, <what fires before consent>.
  Fix: <concrete step: add CMP gate / wrap script / set Consent Mode default denied>.
- [ ] **P1 (privacy/stack)**: Service X in code has no policy section.
  Fix: add subsection (entity, legal basis, recipient, transfer, retention), pattern at <ref>.
- [ ] **P1 (imprint)**: <missing § 5 DDG item>. Fix: add to <imprint file> from <company constants>.
- [ ] **P1 (law drift)**: policy cites TTDSG / imprint cites § 5 TMG / stale ODR link.
  Fix: TTDSG to TDDDG, § 5 TMG to § 5 DDG, remove ODR link.
- [ ] **P2**: <over-disclosure / missing retention / EN translation>.

## Confirm-with-legal (not decided here)
- <e.g. § 34c GewO applicability to this domain; Art. 26 joint-controllership wording>
```
