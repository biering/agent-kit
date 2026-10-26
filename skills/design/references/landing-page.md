# Landing pages: the offer before the design

Read this before step 2 of the taste run (`taste/GUIDE.md`, "Write the argument"). The taste run
decides how the page looks and keeps it from looking generated; this file decides what the page has
to win and what it must answer on the way. A page for paid ad clicks goes to agent-kit's
`ads-landingpage` where the repo installs it, which takes this further (click temperature, a claim
ledger, tracked URLs).

A landing page is not a homepage. A homepage serves several intents; a landing page wins one:
**one offer, one audience, one primary action.**

## 1. Intake

Read what the repo already answers (the pitch, the pricing source in code, the changelog, the
analytics), then ask for what is left in one batch. If something stays open, assume, state the
assumption in one line, and go on.

- **The action.** Trial, purchase, waitlist, download, booking: one. What counts as the
  conversion (a click, a signup, a payment), and which event measures it.
- **The offer.** Exactly what they get, at what price, with which limits.
- **The audience.** Who, the problem they arrive with, and what they already know when they land.
- **The source.** Search, social, email, a launch post, an ad. It decides the page's first
  sentence (section 3).
- **The objections.** The three reasons a fitting visitor does not act today. Each one gets an
  answer on the page.
- **The proof that exists.** Real users, numbers with a source, press, a demo, the product's own
  screens. Only what exists (`SKILL.md`, "Real content").
- **The risk reversal on offer.** Free plan, trial, no card, cancel any time, refund terms: what
  the business really offers, from its pricing and terms, never promised by the page alone.

## 2. Choose the shape

Pick one and write one line on why. The taste run's `draw.mjs` then deals the composition for the
sections this shape needs.

| Shape | When |
|---|---|
| **Classic** | The product is understood from its screen. The most common. |
| **Long story** | The visitor needs teaching or doubts the category: the argument runs longer and proof sits in it. |
| **Minimal** | High intent (an email to existing users, a waitlist, a download): one screen, one form. |
| **Comparison** | Search intent names an alternative ("X vs Y", "best X for Y"); usually an SEO page. |

## 3. What every shape has to do

- **Continue the sentence they arrived with.** Traffic from a post or an ad lands on a first
  screen that repeats its promise in its words and its look. A mismatch is the commonest reason a
  click leaves.
- **The first screen holds:** the outcome for this audience, one sentence on how, the primary
  action, one proof signal, and the product itself. The taste run's step 5 sets how big.
- **One primary action.** No competing action above the fold. The close repeats the same action
  with the same words.
- **Benefits before features.** A feature is what it does; the benefit is what changes for them.
  Three to five, each with its proof or detail beside it.
- **Specific beats smooth.** "Your weekly report in 15 minutes instead of four hours", not "save
  time and streamline". A number needs its source (`SKILL.md`, "Real content").
- **Proof sits beside the claim it supports,** not in a block at the bottom.
- **Objections are a section, not a footnote.** An FAQ of the real questions (six to twelve), in
  plain question and answer, moved up the page when the offer has friction.
- **Reduce the risk** with at least one reversal the business really offers (section 1).
- **The action is a verb and what they get:** "Start the free trial", "Get the checklist", never
  "Learn more" or "Submit". Where the repo installs agent-kit's `copywriting`, it writes and scores
  the variants; `unslop` reads every line before it ships.

## 4. Index or not

- **Index** evergreen offers whose search intent matches the promise: a real title and meta
  description, links in from the homepage and feature pages, the FAQ as plain question and answer
  (with FAQ schema where it fits) so answer engines can quote it.
- **Do not index** pages that exist for one campaign, one ad set or one dated offer: `noindex`, and
  no links in from the indexed site.

## 5. Before any markup

Write these down and show them with the taste run's argument (its step 2) and copy deck (step 5):

1. the shape from section 2 and why;
2. the outline: sections in order, each one a claim and its proof;
3. the first screen: headline, supporting sentence, action, proof signal;
4. the benefits, the steps (if the product has a how), the FAQ;
5. index or noindex, and the title and description if indexed.

Then build section by section, first screen first, so each round is a reviewable diff rather than a
rebuilt page.

## 6. Details that make a page feel finished

These hold on top of the taste run's house rules, which win where the two differ.

- **Type wraps well.** `text-wrap: balance` on headings, `text-wrap: pretty` on running text, so no
  single word sits alone on the last line. Break a headline where the thought breaks.
- **Nested radii.** A rounded shape inside another, less than 32px apart: inner radius is the outer
  radius minus the gap, when that is more than 2px; otherwise square.
- **Every control has its full set of states:** hover, press (a 0.98 scale or a 1px drop), a
  visible focus ring, loading as a skeleton shaped like the real content, an empty state that
  says how to start, an error that says what failed and what to do next. No `#` links: a control
  either goes somewhere or looks disabled.
- **Messages are calm and specific.** "Invoice sent to Dana", "Upload failed: the file is over
  20 MB". No exclamation marks.
- **Reveals run once,** triggered by `IntersectionObserver` (never an unthrottled scroll listener),
  and content never stays hidden if the script fails. `prefers-reduced-motion` keeps the content
  and drops the travel.
- **The page ships whole:** legal links in the footer, a branded 404, client-side validation on
  every form, a skip link, title, description, `og:image` and favicon, alt text, semantic
  landmarks. The repo's ship checklist, where it has one, is the full list.

## Left out on purpose

The source skill also sets fonts, icon sets, a spacing and type scale, gradient hero text, a
translucent floating navigation and a mandatory word-by-word tagline section, and asks for invented
customer names and logos. Here the repo's `DESIGN.md` and UI kit set the values, the taste run's
house rules ban those devices, and proof is never invented. A word-by-word reveal of one large
statement is a fine signature move when the direction calls for one; it is not required.

## Credit

The intake, the shapes, the conversion rules, the index decision and the finishing details are
adapted from `landing-page-design` in
[elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills), MIT licensed,
Copyright (c) 2026 Elaya.
