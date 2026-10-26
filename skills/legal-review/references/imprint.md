# Imprint checklist (§ 5 DDG, § 18 Abs. 2 MStV)

For a missing item, the action is "add it to the app's imprint page or component" (the repo doc
names the file and the company constants it reads). If the operator's details render as a hosted
image, read the image before marking an item missing. Dates behind the law changes are in
`legal-facts.md`.

| Item | Requirement | Concrete fix if missing |
|---|---|---|
| Legal name + form | Full registered name incl. "GmbH" etc. | From the repo's company constants |
| Ladungsfähige Anschrift | Real street address (no P.O. box) | Company constants (address) |
| Contact | Email **and** a second fast channel (phone or form) | Contact email + phone constant |
| Vertretungsberechtigte | Managing directors named | Managing-directors constant |
| Register | Register court + number (HRB ...) | Register court + number constants |
| USt-IdNr | § 27a UStG VAT ID if held | VAT ID constant |
| Regulated profession | § 34c/§ 34i GewO: licence no., `<Aufsichtsbehörde>`, register, **iff** the entity conducts that activity | Confirm applicability with legal; entity-level facts can stay for parity |
| § 18 (2) MStV | Person responsible for journalistic/editorial content, if any | Name + address block |
| VSBG (§ 36) | Whether the company is (un)willing to use consumer arbitration | State the stance |
| **EU ODR link** | The EU ODR platform was **shut down 20 July 2025**, so a link to it is now *wrong* | **Remove** any `ec.europa.eu/consumers/odr` link |
| Law reference | If it cites a law, it must be **§ 5 DDG**, not § 5 TMG (a lingering "§ 5 TMG" is a warning risk) | Replace `TMG` with `DDG` |
