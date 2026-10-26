---
name: aso
description: >-
  App Store Optimisation for an Expo app's iOS listing: indexed fields, keyword-field waste audit, keyless competitor lookup. Use for ASO, App Store keywords, app name or subtitle, or before eas metadata:push.
---

# ASO

Read the repo's `AGENTS.md` and `docs/agent-kit/aso.md` first; they win where they differ from
this skill.

App Store search is not web search, and the repo's web SEO skills do not apply to it. There is no
crawler, no backlinks, no content. There is a small set of indexed fields, a 100-character box
nobody sees, and a store that decides what a query means.

## What Apple indexes

Apple indexes only the fields marked below, and it weights them differently:

| Field | Limit | Indexed | Notes |
|---|---|---|---|
| App name | 30 | **Yes, most heavily** | The strongest single signal |
| Subtitle | 30 | **Yes** | Second strongest, and visible under the name |
| Keyword field | 100 | **Yes** | Invisible to users; comma separated, no spaces |
| Category | n/a | **Yes** | Counts as a term in its own right |
| Description | 4,000 | **No** | Not indexed on the App Store at all |
| Promotional text | 170 | **No** | Editable without review, which is its real use |
| In-app purchase names | 30 each | **Yes** | Free extra surface most apps forget |

**The description not being indexed is the fact that changes behaviour.** Keywords written into it
spend the reader's attention: it converts, it does not rank. Write it for the person.

## The keyword field

100 characters, and most of the ways they leak are mechanical. Audit them:

```bash
node .agents/skills/aso/scripts/keyword_audit.mjs <app>/store.config.json         # every locale
node .agents/skills/aso/scripts/keyword_audit.mjs <app>/store.config.json de-DE   # one
```

Exit 0 is clean, 1 is certain waste (so it can gate a push), 2 is nothing to audit (no file, no
`apple.info`, unknown locale). It fails on:

- **Over 100 characters.** App Store Connect rejects the field.
- **Spaces beside a comma or at the ends.** The separator is `,`, and an array entry like `"cashflow "` leaks a space too.
- **Words already in the name or subtitle.** Apple indexes those separately; a repeat buys nothing and costs its length.
- **Certain plural and stem duplicates.** A shared stem of at least 4 letters, each word that stem plus one ending (`-s`, `-es`, `-ies`, `-ing`, `-ed`): `tracker,trackers` fails.
- **Repeats inside the field**, also across multi-word terms: `breathing` plus `box breathing` is the same word twice.
- **A subtitle over 30 characters.**

Weaker signals print as notes and do not fail the run: a keyword that only stems to a word in the
name or subtitle, a blunt-stemmer collision such as `kurs,kur`, and ten or more unused characters.
How far Apple stems is not published, and a tool that overstates it talks you out of a keyword
that was earning.

**The stemmer is English.** It knows no German inflection, so `kredit,kredite` passes. On a
non-English listing, check plurals and compounds by eye and read the notes.

**One word, one field.** Apple combines the fields; repeating a word across them adds no weight.
Put the strongest term in the name, support it in the subtitle, and spend the keyword field on
words that appear in neither. `eas metadata` takes `keywords` as an array and joins it with
commas, so the array form cannot leak a space after a comma:

```json
"en-US": {
  "title": "<App>: Box Breathing",
  "subtitle": "Calm down in one minute",
  "keywords": ["anxiety", "stress", "relax", "sleep", "focus", "meditation", "timer"]
}
```

## Researching what to rank for

The public iTunes search API needs no key and no account:

```bash
curl -s "https://itunes.apple.com/search?term=<term>&country=<cc>&entity=software&limit=10" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);
      j.results.forEach((r,i)=>console.log(\`\${i+1}. \${r.trackName} | \${r.price===0?'free':r.formattedPrice} | \${r.userRatingCount??0} ratings\`))})"
```

It answers the two questions that matter:

1. **Who owns this term, and how entrenched are they?** `userRatingCount` is the honest proxy. A
   term whose top five all have thousands of ratings is not winnable by a new app.
2. **Which words do the ranking apps put in their names?** Their titles are tested keyword research.

`country` matters: the App Store is per storefront. Match it to where the app is sold.

**This source has no search volume or difficulty.** Those need a paid ASO service (AppTweak,
Sensor Tower, MobileAction). Without one, rank for terms you can argue for and leave the numbers
blank. App Store Connect's analytics report impressions and the terms behind them once the app
has traffic: real data, and free.

## Choosing terms

- **Specific beats broad for a new app.** `box breathing` is winnable; `meditation` is not.
- **A term nobody searches is worth nothing**, however easy. The test: would a person plausibly type it?
- **Competitor brand names are allowed** in the keyword field. They age badly and invite the same in return.
- **The category is a term.** Health & Fitness over Lifestyle is a keyword decision as much as a shelf.

## Where the fields live

The listing is the app's `store.config.json`, pushed with `eas metadata:lint` and
`eas metadata:push` through the app's package scripts (the repo doc names the path and the
commands). An ASO change is then a reviewed diff. Run the audit before every push.

**`eas metadata` does not cover in-app purchase names**, which are indexed. They live in the
app's source and the repo's IAP tooling.

## What to change, and when

Name, subtitle and keywords change **only with a new app version**, which means a review.
Promotional text changes any time, so it holds anything time-bound.

Change one field at a time and leave it long enough to read the result. App Store Connect's
Product Page Optimization runs a real A/B test with a confidence figure; use it instead of
swapping copy and guessing from a week of downloads.

## Before a launch

The listing is judged together with:

- `app-screenshots`: the images convert; the metadata only gets the listing seen.
- `unslop` on the description, which a person reads and nobody indexes. Name and subtitle are copy (`copywriting`).
- A check that every listing URL resolves. A dead support URL is a rejection, and `eas metadata:lint` does not look.
- The repo's ship or release checklist for everything around the listing.
