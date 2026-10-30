# Landing anatomy

Read this when building or rebuilding a product landing page, after `landing-page.md` has settled
the offer. That file decides what the page has to win. This one decides which sections exist, in
which order, and the id each one carries. The taste run (`taste/GUIDE.md`) decides how each
section looks. A page for one paid campaign is `ads-landingpage`, where the repo installs it, and
does not use this anatomy.

The order is fixed. What varies is the content of each slot and, through the honesty rules,
whether a slot appears at all. A page may hold more (a story, a live demo). These sections stay
in this order. Leaving one out is said in the PR: it is honesty-gated, or the variant below does
not use it.

## The sections, in order

| # | Section | What belongs in it | id / landmark |
|---|---------|--------------------|---------------|
| 1 | Sticky navbar | Logo, links to the page's own sections, one CTA button. Stays visible. | `<header>` with `<nav>` |
| 2 | Hero | A social-proof line (honesty-gated), a title that names the problem or what is sold, one supporting line, a primary and a secondary action, and a product video or screenshot. | `id="hero"` |
| 3 | Partners / trust | Logos or badges. Real, or a true substitute, or absent. | `id="trust"` |
| 4 | Benefits | What changes for the user. A bento, not a row of identical cards. | `id="benefits"` |
| 5 | How it works | Getting started in three steps. | `id="how-it-works"` |
| 6 | Pricing | Every plan, differences visible, an action on every plan, the recommended plan highlighted. Limits, trial terms and a free tier are on the page. | `id="pricing"` |
| 7 | Testimonials | Next to pricing. Honesty-gated. | `id="testimonials"` |
| 8 | FAQ | The questions that block the last step, including cancellation and refunds when anything is sold. | `id="faq"` |
| 9 | Closing action | One block that repeats the primary action. The loudest thing on the page. | `id="cta"` |
| 10 | Footer | Logo, menu, legal links, a newsletter or email signup where the product has one, copyright, privacy, socials. | `<footer>` |

## Honesty beats the template

Social proof, partner logos, user counts and testimonials are filled only with real, sourced
material. Never invent a quote, a logo, a number or a star rating, and never imply a scale the
product does not have. When the real thing does not exist, the slot holds something true, or it
is left out.

| Slot | Only when real | True substitutes |
|---|---|---|
| Social-proof line (hero) | A user count or rating with a source | The store rating once it exists; repository stars; a usage metric from the product's own analytics; a plain line about who makes it; or leave the line out |
| Partners / trust | Logos used with permission, real press | The store badge with its real rating; repository stars; badges the product has earned; or omit the section |
| Testimonials | A real person, their words, their permission. A store review may be quoted with attribution | Omit the section. A usage metric is not a testimonial |
| User counts anywhere | A number from the product's own analytics | None. No number without a source |

An omitted honesty-gated section is correct. A faked one is an incident. A substitute is labeled
as what it is: stars are stars, not "loved by thousands".

## Variants

- **SaaS / web app.** The full anatomy. Prices on the page are the prices checkout charges.
  The primary action is sign-up, or open-the-app when the visitor is already signed in.
- **iOS app.** The pricing section shows the store price and the in-app tiers as the store lists
  them: the free tier, the paid tier, what each includes. Every action is the store badge, or a
  pre-order or waitlist until the app is live. Hero media is a real screenshot or a store preview.
- **Free tool.** The live tool takes the hero media slot: using the product is the hero. Pricing
  appears only when something is sold. How-it-works is three steps. The closing action repeats
  the tool, or the paid upsell when there is one.
- **Directory.** The hero is search plus the offer. Benefits speak to visitors and to listees.
  Pricing appears when a listing or a claim is sold. The contact address comes from the repo's
  site config.
- **Company or portfolio site.** The same anatomy, with pricing omitted when nothing is sold.
  A page the repo marks in `docs/agent-kit/design.md` as not a product landing skips this file.

## Mobile

- The navbar collapses to the logo and the action. Section links may fold into a menu. The
  action does not.
- On a phone the primary action stays reachable while scrolling (a sticky bar) and does not
  cover the content or the legal links.
- Bento and pricing grids stack to one column. The highlighted plan comes first.
- Testimonials become a swipeable row. The FAQ stays a full-width accordion.
- No section scrolls sideways at 390px.

## Building it

- **New page.** One component per section, content passed in as props, each section carrying
  the id above. The scaffold web guide follows this when it builds a marketing page.
- **A page that already exists.** When it is touched, move it toward this order and these ids.
  A bespoke id (`#how`, `#features`) hides the section from a check.
- **A check,** where the repo has one, fails when a required id or landmark is missing from the
  homepage source, and from the live page when a URL is given. `#trust` and `#testimonials`
  are never required. `#pricing` is required once the product sells anything.
