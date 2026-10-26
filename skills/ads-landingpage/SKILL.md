---
name: ads-landingpage
description: >-
  Write and ship a landing page for paid ad clicks: brief, format by click temperature, block copy, a claim ledger with a source per claim, tracked ad URLs. Use for ads landing page, campaign page, advertorial.
---

# Ads landing pages

Read the repo's `AGENTS.md` and `docs/agent-kit/ads-landingpage.md` first; they win where they
differ from this skill. The repo doc names the brands, where pages live, the register, the
pricing source, the page language, the verify commands and the tracking.

A page that receives a paid click has one job: carry the promise of the ad to one action. It is
not a small homepage. The reader arrived with a sentence in their head, on a phone, and owes us
nothing. Every element either continues that sentence or goes.

A page is **data, not design**. Each app keeps a registry of pages and one template; writing a
page means writing its copy and its proof. A register (one markdown file) lists every page, live
and draft.

| Read | When |
|---|---|
| [references/formats.md](references/formats.md) | choosing the page's order: gap, before/after, advertorial, listicle, demo-first |
| [references/blocks.md](references/blocks.md) | writing any block: hero, proof, demo, problem, comparison, steps, objections, close |
| [references/tracking.md](references/tracking.md) | ad URLs, events, how to judge a page |
| [scripts/ad_url.mjs](scripts/ad_url.mjs) | building the URL each ad points at |

Not for the homepage, SEO pages or the ad creative itself.

## Hard rules

1. **One page, one promise, one action.** The same CTA wording in every position. No site
   navigation, no second offer, no link to another page of ours.
2. **Message match.** The headline repeats the ad's promise with the ad's own nouns. A page that
   serves two ad angles is two pages, or one page with a headline per angle.
3. **Problem before product.** The reader's situation comes first; the brand name is never the
   first noun on the page.
4. **Every claim has a source in the repository.** A number, a duration, a price, a capability,
   "free", "no credit card": each goes into the page's claim ledger with the file that proves
   it. No source, no sentence.
5. **A claim that is not true yet makes the page a draft.** Write it, mark the claim pending,
   give the page a draft status and a reason. A draft gets no route. Never soften the registry
   check to publish early.
6. **Example numbers are labelled as examples,** come from one consistent case, and are never
   presented as a customer's.
7. **Prices and trial lengths are read, not typed,** from the pricing source the repo doc names.
8. **Short sentences, no em dash, no superlatives,** in the brand's language and form of
   address. Every string goes through the `unslop` skill before commit.
9. **The page is `noindex`, out of the sitemap, and in the register.** All three, same commit.
10. **Tracking follows the brand's consent posture,** not the campaign's wishes. A brand without
    a consent banner gets no ad-network tag.

## Workflow

### 1. Brief

Answer these before writing. Ask the user only for what the repository cannot answer, usually
the ad itself and the audience.

- **The ad.** Its exact headline and hook, the network, the placement. No ad yet: write its
  promise in one sentence and treat it as given.
- **How warm is the click?** Cold feed, problem-aware, comparing, or retargeting.
- **Who is it?** One person in one situation ("just received a data room"), not a segment.
- **The one action** and what it costs the reader: time, an account, money.
- **The strongest objection** the reader will have at the button.
- **The proof we hold:** what the product does, measured numbers, customers who agreed to be
  named.

### 2. Pick the brand and the format

The brand is the product the promise is about; a promise that spans two products is two pages.
The format follows the temperature of the click ([formats.md](references/formats.md)); when two
fit, take the colder one.

Each brand in the repo doc defines: what its promises are about, the app and URL pattern, the
look, the action and its CTA wording, what is free, how money is named, the footer and its
mandatory note, the tracking and consent posture, the analytics project, and what may not be
claimed. A product with no brand entry gets one first (registry, template in its own look, a
test, a register section). Until then, say so and stop.

### 3. Build the claim ledger first

List every factual statement the page needs and find its file: the calculation code, the pricing
table, a string the product itself shows, a migration. Search before you write; a search
subagent suits a wide sweep.

What usually falls out of this step, and should:

- a capability that exists but is gated to a tier the reader will not have,
- a duration that appears in marketing copy and was never measured,
- a feature the brief assumes and the product lacks. Tell the user. Offer the page without the
  claim, the page as a draft, or the feature as its own piece of work.

Existing marketing copy is not a source. It is where earlier unverified claims live: a homepage
can say "30 days free" while the code grants 14.

### 4. Write

Block by block from [blocks.md](references/blocks.md), hero last. Generate at least six headline
candidates across the patterns there and judge them in order: unambiguous, then exciting, then
true (the repo's `copywriting` skill, when it has one). When the headline is the point of the
request, show the top three with the reason for the winner; otherwise pick and say which.

Then run `unslop` over every string.

### 5. Add the page

Into the app's registry, typed by its page type, rendered by its one template, guarded by its
test (paths per brand in the repo doc). A block the page needs and the type lacks is added to
the type and the template, so the next page gets it too. Never style or special-case a page by
its slug.

Then add the row to the register. The app's test should fail while the register and the data
disagree.

### 6. Verify

Run the repo doc's test, typecheck and build commands for the app. Then look at the page at
390 px and at 1440 px:

- [ ] First phone screen: the ad's promise, the CTA and one reason to believe it.
- [ ] One CTA wording in every position; the sticky bar never covers the footer.
- [ ] No horizontal scroll at 320 px. Tap targets at least 44 px.
- [ ] Every figure is in the ledger or labelled as an example.
- [ ] Opened with `?utm_source=meta&utm_medium=paid_social&utm_campaign=test&utm_content=x`,
      the CTA link carries all four.
- [ ] `view-source` shows `noindex, follow`; the page is absent from the built sitemap.
- [ ] The legal pages the brand requires are reachable, and the consent settings when the
      brand has a banner.

### 7. Hand over the ad URLs

One URL per ad, built with the script so nobody mistypes a medium:

```bash
node <skill>/scripts/ad_url.mjs <brand> <slug> \
  --source meta --campaign <slug>_2026_10_signup --content <angle>_video_a
```

It reads the `ads` block of `agent-kit.config.json` (register path, URL pattern per brand) and
refuses a page that is missing from the register or still a draft. Give the user the URLs, the
dashboard link and what the page will not measure ([tracking.md](references/tracking.md)).

### 8. After it has run

Read the page against its siblings, not against a benchmark from a blog. Keep, rewrite or retire
by the rule in [tracking.md](references/tracking.md), and record the decision in the register
row. A retired page leaves the registry and the register together.

## What goes wrong

- **The page explains the product.** It should finish the ad's sentence. Cut every paragraph
  that would also fit the homepage.
- **Three CTAs "to give options".** Options are exits.
- **A counter with a round number.** Without its query and date in the ledger, the number stays
  off the page.
- **A left column nobody recognises.** A before/after works only when "before" is the reader's
  actual routine, step for step.
- **Copy written before the ledger.** The best line is then the one that is not true, and
  somebody has to argue it off the page.
- **One page for every audience,** with tabs. Tabs are for one ad set that mixes audiences;
  separate ad sets get separate pages.
- **A new look built from a mood.** Before a brand's first page in a new look, write the
  direction in full: rules, design tokens, structure top to bottom with copy, interactions,
  responsive behaviour, variants per angle, a pre-live checklist. The repo doc may point at a
  finished one as the bar for detail.
