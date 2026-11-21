# Research: premises and target

The article's step 1 and 2 (Derick Carneiro, "how I write ads that make strangers buy", X,
2026-11-19): what we know, then who we talk to. Its point about research holds for software too:
do not spend days inventing a psychology; steal what already works, and spend the effort on what
the buyer is watching and saying now.

## Premises

A premise is a fact the ad may state. It is the `ads-landingpage` claim ledger for the creative:
the same rule, the same sources, ideally the same rows.

| Premise | Read it from | Not from |
|---|---|---|
| Product, what it does | the code that does it, the product's own UI strings | a feature list on the website |
| Platforms and requirements | build settings, the store listing's requirements | memory |
| Price, currency, tiers | the pricing source the repo doc names | a page, a screenshot, an old ad |
| Trial, free tier, refund | the code that grants it; the refund terms page; the store's own terms for store sales | "everyone offers 30 days" |
| Offer now (coupon, launch price) | the coupon's record with its end date | a plan in a chat |
| Previous price | the price history (git log of the pricing file, the payment provider's records) | the price you remember |
| A number (users, ratings, time saved) | the query, the store's own figure, a measurement, with its date | a round number from a pitch |
| A buyer's quote | the review, post or email it came from, with consent where the platform asks | a paraphrase presented as a quote |

Each premise row has an id (`P1`), the fact, the source (a path with line, a URL, a query) and the
date read. Prices and offers go stale fastest: read them again on launch day.

## Target

Three questions, in order. Write each answer with the link that supports it.

1. **Market:** which shared desire does this product serve? A utility can serve several (look
   professional on calls, keep work private, save setup time). Pick one per ad.
2. **Segment:** a cluster inside it with a condition, identity or behaviour in common
   (freelancers who present to clients, teachers who share slides). An ad that speaks to a
   segment lands more easily than one that speaks to a market.
3. **Avatar:** one person in one situation. Psychographics (desire, problem, pains, dreams,
   fears) change slowly and the ads that already run carry them; spend the effort on behaviour
   and language: what they watch, what they search, the words they use.

Then the **awareness level** ([elements.md](elements.md#awareness-how-much-an-ad-has-to-carry)):
does the reader know the problem, the category, the product?

### Picking the market and segment

- **A product that already sells:** the landing pages with the most traffic and the ads with the
  most spend over the last 60 days say where it is strongest. Read them from the analytics and
  the ad accounts the repo doc names.
- **A new product:** find at least three competitors per candidate market in the ad libraries.
  A market with fewer than three advertisers is cut: either nobody pays for it, or nobody found
  how. Prefer the market whose advertisers keep long-running ads; an ad that runs for months is
  paying for itself.
- Do not bet on the market. Bet on the creative ([elements.md](elements.md#batches)).

## Where to look

Public ad libraries show what competitors keep paying for. An ad that has run for a long time is
the closest thing to proof the outside world gives. Use them for markets, segments, formats, hook
structures and reference ads, never to copy words, visuals or claims.

| Source | URL | What it shows | Limit |
|---|---|---|---|
| Meta Ad Library | facebook.com/ads/library | active ads on Facebook and Instagram, start date, all formats | reach and spend only for EU-delivered and political ads |
| X Ads Repository | business.x.com (ads transparency) | ads served in the EU | EU only, under the DSA |
| TikTok Creative Center, Top Ads | ads.tiktok.com/business/creativecenter | top in-feed ads by region and industry, with engagement | curated selection, not every ad |
| TikTok Commercial Content Library | library.tiktok.com | ads shown in the EU, with targeting and reach | EU only |
| Google Ads Transparency Center | adstransparency.google.com | search, display and YouTube ads per advertiser | no performance data |
| LinkedIn Ad Library | linkedin.com/ad-library | ads by company or keyword | B2B only |
| Reddit | the subreddits the buyer reads; Reddit's own ads inspiration pages | promoted posts show in the feed with "Promoted" | no full public library |

The checked URLs and as-of date are in [production.md](production.md#sources); a library that
moved is fixed there.

### The buyer's own words

- **App Store and Google Play reviews** of the product and of competitors: one-star reviews name
  the problem, five-star reviews name the outcome. Read the most recent and the most helpful.
- **Reddit and forums:** search the problem, not the product ("screen share notification popped
  up"). Threads with many replies are the topics; the words in them are the hooks.
- **Search questions:** the search engine's related questions and autocomplete for the problem.
- **Our own support mail and reviews,** when the repo doc says where they are.

Copy the phrases verbatim into the brief's "Buyer's words" with their link. Use them as the
reader's vocabulary. A review used *as a quote in the ad* is a testimonial: it needs the author's
consent and the platform's rules ([policy.md](policy.md)).

### A reference ad

From the same sweep, keep one to three reference ads for the writing step: same market, same
format, running for a long time (the library's start date). Save the link and the date seen;
library entries disappear. The reference gives the order and rhythm of the mini-blocks, nothing
else.

## What research may not do

- Use a competitor's ad as a source of facts about our product or about the market.
- Copy a competitor's claim because it is in a long-running ad. It may be false; it is not ours.
- Target or address a reader by a sensitive trait the research found (health, finances,
  religion, sexuality). The segment may be "freelancers who present"; the copy never asserts the
  reader's condition.
- Scrape personal data from reviews or threads. Quote the words, not the person.
