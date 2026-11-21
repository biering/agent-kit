---
name: ad-creative
description: >-
  Write the ad itself (video script, image, post text, headline, CTA) for paid social and search: sourced premises, target from ad libraries and reviews, a checked brief of 17 elements, writing to a proven reference, batches as a risk portfolio. Use for ad creative, ad copy, Werbeanzeige, ad batch, hooks for ads.
---

# Ad creative

Read the repo's `AGENTS.md` and `docs/agent-kit/ad-creative.md` first; they win where they differ
from this skill. The repo doc names the products, where briefs live, the pricing source, the ad
accounts and their placements, the languages and form of address, and what may never be claimed.

This skill makes the creative a cold stranger sees in a feed or a search result: the video
script, the image, the post text, the headline, the CTA. The page the click lands on is
`ads-landingpage`; the two meet at the ad URL and the ad's promise, which the landing page
repeats. Short lines (hooks, headlines, CTAs) are written with `copywriting`; every string goes
through `unslop` before it leaves.

The framework (four sales, seventeen elements, premises then target then brief then writing,
batches as a risk portfolio) is Derick Carneiro's, from "how I write ads that make strangers
buy" (X, 2026-11-19), adapted here to small software products: an app for 5 to 30 EUR, a SaaS.
His worked example sells a supplement with invented urgency, a game character and sexualised
bait. Those parts are exactly what the hard rules below rule out.

| Read | When |
|---|---|
| [references/elements.md](references/elements.md) | writing any brief: the four sales, the 17 elements, what a short format carries, a worked example |
| [references/research.md](references/research.md) | premises and target: sources, ad libraries, reviews, the buyer's own words |
| [references/production.md](references/production.md) | making the asset: first second, captions, sizes and text limits per platform |
| [references/policy.md](references/policy.md) | before any launch: EU fair-trading law and each platform's ad policy |
| [templates/brief.md](templates/brief.md) | the brief, copied per ad or batch |
| [scripts/brief_check.mjs](scripts/brief_check.mjs) | before writing, and again before launch |
| [examples/menubar-utility/brief.md](examples/menubar-utility/brief.md) | a filled brief for an invented Mac utility; it passes until its coupon ends (2026-12-07), then fails as a stale real one should |

Not for the landing page (`ads-landingpage`), organic posts (`carousel`, `video`) or store
listings (`aso`, `app-screenshots`).

## Hard rules

These are not in the article and they are not optional.

1. **No brief, no writing.** An ad written without a checked brief is the failure the article
   names: the model guesses the psychology. `brief_check.mjs` passes before the first line.
2. **Every fact has a source.** Price, trial, guarantee, a feature, a number, a duration: each is
   a premise with the file, page or query that proves it and the date it was read. Existing
   marketing copy is not a source (`ads-landingpage`, claim ledger). No source, no sentence.
3. **No invented urgency.** No scarcity, stock, countdown or deadline that is not real and
   sourced. A coupon with an end date in the pricing source is urgency; "only today" for a
   price that never changes is a misleading action (UWG Anhang Nr. 7). Software has no stock.
4. **No invented proof.** No made-up numbers, testimonials, reviews, ratings, user counts or
   results. A quote is a real buyer's, used as they wrote it, with the source and their consent
   where the platform asks for it. An example figure is labelled as an example.
5. **No third parties.** No real characters, games, films, celebrities, creators or brands in
   the visual or the copy, no lookalikes and no "inspired by". A competitor is named only in a
   comparison the repo doc allows, with sourced facts. The article's game-character idea is
   exactly what we never do.
6. **No sexualised bait** and no shock imagery unrelated to the product.
7. **No medical or health claims.** No cure, no symptom relief, no diagnosis, no "better sleep"
   or "less stress" as an outcome, for any app. Say what the product does, not what it does to
   a body.
8. **No personal attributes in the copy.** Not "Are you diabetic?", "Struggling with debt?",
   "For people with ADHD". Talk about the situation, never assert the reader's condition (every
   platform's policy, [policy.md](references/policy.md)).
9. **Law and policy before launch.** UWG and UCPD (misleading actions and omissions, price
   reductions against the lowest price of the last 30 days) and the platform's ad policy, each
   ticked in the brief's launch checks. `brief_check.mjs --launch` refuses an unticked box.
10. **No real app name in this skill.** Products, examples and evals here are invented; the
    repo doc holds the real ones.

## Workflow

### 1. Premises: what do we know?

Facts about the product, the price, the offer, the guarantee or refund, the trial, what is free,
and what the buyer gets now, each with a source and an as-of date
([research.md](references/research.md#premises)). Read prices from the pricing source the repo
doc names, never from a page. What falls out here, and should: the feature that is only in the
higher tier, the refund that is the store's and not ours, the "lifetime" that is one major
version.

### 2. Target: who are we talking to?

Market (a shared desire), segment (one condition, identity or behaviour inside it), avatar (one
person in one situation) and the awareness level. Do not invent it: take what already works.
Public ad libraries show which markets, segments, formats and hooks competitors keep paying for;
reviews, Reddit threads and App Store reviews give the buyer's own words
([research.md](references/research.md#target)). Every claim about the buyer carries the link it
came from.

### 3. Brief: what do we say, and how?

Copy [templates/brief.md](templates/brief.md) to where the repo doc keeps briefs. Fill the 17
elements from [elements.md](references/elements.md) with what the avatar already wants to hear,
in the words the research found. The awareness level and the format decide how many elements the
ad can carry. When the two disagree, the smaller wins. An element the ad does not carry is
`n/a: <reason>`, never left blank. Cite the premise each clause relies on as `[P1]`; a cite covers
its own clause only.

The copy hook (element 5) is written here, with `copywriting`: its one-liner rules, and the hook
patterns in its references when it has them. Write at least five candidates across two angles,
score them, and put the winner in the brief. Keep the runners-up for the batch. Then:

```bash
node <skill>/scripts/brief_check.mjs <brief.md>
```

It fails an empty element; a premise without a source or a date, or one whose source is existing
copy or hearsay; a number, an urgency word or a proof word in a clause that cites no premise;
urgency whose premise holds no end date; anchoring or risk reversal with nothing behind it; and a
deadline that has passed. It cannot tell whether the cited premise supports the clause, and its
urgency and proof words are a list: a phrasing it does not know passes. Both are your job, and
the launch checks'. Fix the brief, not the check.

**When facts are missing,** write `missing: <what, and who can answer>` in the field. The check
then fails on purpose. Stop there and reply with three things: the brief as it stands, the
check's output, and the questions, each naming the source that would answer it. Do not write
the ad around the gap. No repo doc and no existing copy to follow: write in the language of the
request, ask for the form of address, and use the one in the request until the user answers.

### 4. Write: fit the brief into a proven reference

Pick one reference ad from the research that has run for a long time in the same market and
format. Transcribe it and cut it into mini-blocks by job (hook, belief break, mechanism, product,
proof, offer, CTA), with their length in seconds or words. Write the brief's points into those
blocks. **The brief decides what is said; the reference only the order and the rhythm.** Never
copy its words, visuals, characters or brand.

Write the result into the brief's `Script:` field, so the check reads what ships. Headlines and
CTAs come from `copywriting` the same way as the hook. Then `unslop` over every string, then the
platform's limits ([production.md](references/production.md)).

### 5. Batch: a risk portfolio

Plan ads as a batch, not one at a time ([elements.md](references/elements.md#batches)):

- **Conservative:** market, segment, format and hook structure all proven. A new execution only.
- **Moderate:** one new bet (a new concept, format or topic) on proven ground.
- **Aggressive:** several bets at once. Few of these; they teach less when they fail.

Each variant is a row in the brief's batch table, with the text or asset it ships under
Changes; the check reads that cell like the hook. Each variant changes **one** variable against
its sibling, and its name says which
(`<angle>_<format>_<variable>_<v>`, the `utm_content` of `ads-landingpage`'s
`scripts/ad_url.mjs`), so a result teaches something.

### 6. Produce

First second, sound off with burned-in captions, safe zones, sizes and text limits per
placement, as checked in [production.md](references/production.md) (each spec has a source and
an as-of date; recheck a spec older than three months before you rely on it).

### 7. Launch checks

Tick the brief's launch checks against [policy.md](references/policy.md), then:

```bash
node <skill>/scripts/brief_check.mjs <brief.md> --launch
```

With `--launch` it also refuses an empty Script and a batch table without rows: what ships has
to be in the brief, or the check has nothing to read.

Hand over the creatives, the brief path and one ad URL per variant from `ads-landingpage`.

### 8. Kill or scale

Read results per `utm_content` together with the landing page's numbers
([elements.md](references/elements.md#kill-and-scale), and `ads-landingpage`'s
`references/tracking.md`). Write the decision and the date into the brief's batch table. The
lesson of a variant is the one variable it changed.

## What goes wrong

- **The ad sells the product in the first second** to a cold reader. Cold ads sell the content,
  then hope, then value; the product comes third.
- **Every element crammed into six seconds.** A short format carries few elements; pick them by
  awareness level, and send the rest to the landing page.
- **The reference's words survive** the rewrite. Then it is a copy, and usually someone else's
  claim.
- **A hook nobody can defend.** The exciting version needs a number nobody measured. Ask for the
  number or drop the hook.
- **Urgency bolted on at the end.** If there is no real deadline, "Loss later" is what the reader
  keeps losing every week without the product, not a timer.
- **Five variants that differ in everything.** One wins and nobody knows why.
