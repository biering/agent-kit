# Tracking

What a page reports, how an ad URL is built, and how to decide whether a page stays. The event
names, analytics projects and dashboards are the repo's (repo doc); this file is how to use them.

## The ad URL

| Parameter | Value |
|---|---|
| `utm_source` | the network: `meta`, `google`, `linkedin`, `tiktok` |
| `utm_medium` | `paid_social` (feed) or `cpc` (search). Only these two spellings |
| `utm_campaign` | `<slug>_<yyyy>_<mm>_<goal>`, e.g. `excel_2026_10_signup` |
| `utm_content` | the creative or angle, e.g. `excel_video_a`; in Meta `{{ad.name}}` |
| `utm_term` | search only, the keyword; in Google Ads `{keyword}` |

Lower case, `_` inside a value, nothing personal. Keep values under 100 characters. Build them
with `scripts/ad_url.mjs`, which refuses an unknown source or medium and a campaign that does not
start with the page's slug.

`utm_medium` matters most: attribution code usually maps a fixed set of mediums to channels and
files everything else under a catch-all. The repo doc says how its channel mapping reads them.

## What a page should report

- A page view with the path and the click's `utm_*`.
- Where consent allows client events: a CTA click with `page`, `placement` (`header`, `hero`,
  `close`, `sticky`), `format` and `angle` (the click's `utm_content`, or the page's own angle
  on a visit without one).
- The CTA link carries the `utm_*` to signup, and a server event for the signup closes the
  funnel. When the landing and the app share one analytics identity, it is one person.
- A cookieless brand without a banner sends the page view only. Page view on the page, then page
  view on signup, in one daily session, is its funnel; the anonymous visit and the account that
  follows are never joined, so read the two halves side by side.

Add no event for a question the page view already answers. A new event goes into the repo's
event catalog in the same commit. On a cookieless brand a new event can touch the privacy
policy: that is a decision for the user, not a detail.

## Reading it

Per page, per `utm_content`:

| Number | With consent and click events | Cookieless, page views only |
|---|---|---|
| Visits | unique visitors with a page view on the path | daily visitor hashes on the path |
| Click rate | visitors with a CTA click over visits | visits that reach signup over visits |
| Signup rate | signups over visits | not joinable per visitor; compare daily counts |
| Where they click | `placement` breakdown | not measured |

What the numbers leave out:

- Everyone who declined the consent banner. Expect the analytics tool to show fewer visits than
  the network shows clicks, by a wide margin. Compare pages with each other.
- Bots and accidental taps inflate network clicks, not analytics visits.
- With daily hashes, a returning visitor is a new visitor the next day.

## Keep, rewrite, retire

Decide per page after it has at least 300 measured visits or 100 CTA clicks, whichever comes
first. Below that, conclude nothing.

- **Click rate low, visits fine:** the first screen does not match the ad. Rewrite the headline
  against the ad's own words before touching anything else.
- **Clicks mostly from `sticky` or `close`:** the page persuades late. Move the strongest block
  up; the hero is not carrying its promise.
- **Clicks fine, signups low:** the page promises something the signup does not deliver next.
  Check the signup redirect and the first screen after signup.
- **One `utm_content` far ahead of the others:** give that angle its own page.
- **Two pages tie:** keep the one with the simpler claim ledger.

Write the decision and the date into the page's register row. Change one thing per round: a page
that changed its headline and its CTA at once has taught you nothing.
