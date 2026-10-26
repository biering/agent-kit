# Sequence rubric

Order screens by persuasion logic, written for a paid B2B tool:

1. **Identity:** who are you (name, role). The minimum to personalise.
2. **Context:** company or portfolio size, how they found you.
3. **Desire / goals:** what they came to do (at least one required).
4. **Investment:** the answers that seed the product artifact (strategy, region, budget, or the
   product's equivalent).
5. **Proof:** a real, user-specific result (a seeded search with its match count, a generated
   first report), not theatre.
6. **Offer:** the paywall, only after proof.

## Rules

- Ask intent before admin. Address, phone and tax id belong at checkout when the payment provider
  collects them.
- One question, or one tight cluster, per screen. Show progress; persist the step index so a
  refresh resumes.
- Every field required before value does work: it seeds, personalises or gates something real.
  Dead required fields are the failure mode.
- More than three steps: a full-page route with a redirect guard beats a non-dismissible modal.
- Skip vs require: skippable is anything the proof screen does not need; required is what the
  proof cannot exist without.
- For professional buyers, reject pain-amplification and market-statistic screens when the
  product can show a genuine personalised result instead.
