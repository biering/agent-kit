# Landing evidence

Read this when a design decision on a landing page is argued from "best practice". It lists what
has been measured, how large the effect was and how far to trust it, and which popular rules have
nothing behind them. `landing-page.md` and `landing-hook.md` cite the numbers below as `[n]`.

Researched 2026-11-11. Sources were opened unless marked unverified. Controlled experiments and
large benchmark reports rank above case studies, which rank above vendor opinion. Most of the
strong evidence is from e-commerce and news; treat it as direction for a signup page, not as a
forecast.

## What is measured

| # | Finding | Effect | Source | Trust |
|---|---|---|---|---|
| 1 | Which treatments move revenue per visitor, across 6,700 e-commerce tests | scarcity +2.9 %, social proof +2.3 %, urgency +1.5 %; colour 0.0 %, buttons -0.2 %, CTA wording -0.3 %, navigation -0.2 % | [Qubit, 2017](https://gwern.net/doc/economics/advertising/2017-browne.pdf) | high, retail |
| 2 | A/B test on paid traffic: 31 % better LCP | +8 % sales, +15 % lead-to-visit | [Vodafone, web.dev](https://web.dev/case-studies/vodafone) | high, one company |
| 3 | 37 brands, 30 M sessions: 0.1 s faster mobile load | lead-gen form progression +21.6 %, retail conversion +8.4 % | [Deloitte and Google](https://web.dev/case-studies/milliseconds-make-millions) | medium, correlational |
| 4 | 900,000 mobile ad landing pages | bounce probability +113 % from 1 s to 7 s | [Google, 2017](https://thinkwithgoogle.com/_qs/documents/57/mobile-page-speed-new-industry-benchmarks.pdf) | medium, dated |
| 5 | 41,000 landing pages, 464 M visitors | median conversion 6.6 %; copy at 5th to 7th grade level 11.1 % against 5.3 % at professional level; 83 % of visits on phones | [Unbounce benchmark report](https://unbounce.com/conversion-benchmark-report/) | medium, observational |
| 6 | 22,743 headline experiments on news | each negative word +2.3 % click rate | [Robertson et al., 2023](https://epub.ub.uni-muenchen.de/94951/1/s41562-023-01538-4.pdf) | high for news clicks only |
| 7 | Headline experiments on a viral publisher | numbers and concrete wording raised click rate; direct address and question cues lowered it | [Banerjee and Urminsky](https://home.uchicago.edu/ourminsky/Banerjee_Urminsky_Headlines.pdf) | medium, exploratory |
| 8 | Meta-analysis, 33 trials: gain against loss framing | no significant difference | [O'Keefe and Wu, 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3397368) | high, health messages |
| 9 | Search ads meeting quality guidelines, ad text and landing page together | 25.4 % lower bounce | [Sculley et al., 2009](https://faculty.cc.gatech.edu/~zha/CSE8801/ad/p1325-sculley.pdf) | medium, observational |
| 10 | Headline matched to the search term; page matched to the ad | +31.4 % trial signups (1,274 visitors); 34.8 % against 25.0 % (3,687 visitors) | [Unbounce](https://unbounce.com/?p=70889), [NextAfter](https://www.nextafter.com/?p=11434) | low to medium |
| 11 | Sticky call to action, 14 tests, 3 M users | +3.6 % transactions on average, 57 % of tests won | [Evidoo, via Kohavi et al.](https://www.socialscienceregistry.org/versions/286684/docs/version/file) | medium, e-commerce |
| 12 | Signup moved behind the first use of the product | about +20 % daily actives | [Duolingo, First Round](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker) | low to medium, self-reported |
| 13 | A lead form as the continuation of a calculator | +23 % and +40 % leads | [Seer Interactive](https://www.seerinteractive.com/work/case-studies/trex-calculator-conversions-lift) | low to medium |
| 14 | Trials without a card, about 100 SaaS firms | 10 % visitor to trial against 2 % with a card | [Totango, 2012](https://www.slideshare.net/slideshow/2012-saa-s-conversions-benchmark/14325732) | low to medium |
| 15 | Five reviews against none | +270 % purchase likelihood; flat after five | [Spiegel Research Center](https://spiegel.medill.northwestern.edu/how-online-reviews-influence-sales/) | medium, products |
| 16 | 40,000 landing pages: more form fields | conversion falls only slightly; text areas and dropdowns hurt most | [HubSpot](https://blog.hubspot.com/blog/tabid/6307/bid/6746/which-types-of-form-fields-lower-landing-page-conversions.aspx) | medium |
| 17 | Tap targets | at least 24 by 24 CSS px, 44 by 44 preferred | [WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | standard |

Medians to judge a page against [5]: financial services 8.3 %, investing 3.9 %, SaaS 3.8 %. Any
conversion type counts in those, so compare pages with each other before comparing with a median.

## What nobody has measured

- **Hero animation, background video and interactive hero inputs.** No controlled experiment was
  found for or against. The evidence that exists is about speed [2] [3] [4], and it says a hook
  that delays the first screen costs more than it can win. `landing-hook.md` is built on that.
- **Embedded against separate signup, multi-step forms, trust seals.** Results conflict.
- **Question headlines.** [7] says they lower click rate; one small 2014 study found the
  opposite.

## Repeated, with nothing behind it

- "Button colour matters" and "the right CTA wording doubles clicks": colour 0.0 %, wording
  -0.3 % [1]. Write the button as a verb and what they get, then stop tuning it.
- "Fewer form fields always win" [16].
- "Removing the navigation doubles conversion": one case; -0.2 % across many [1].
- "Loss framing beats gain framing" [8]. Test it per page.
- "First-person button copy lifts clicks by 90 %": no primary source found.

## What follows for a page

1. Repeat the ad or the search term in the headline, one page per angle [9] [10].
2. First screen paints fast on a phone: mobile LCP at most 2.5 s [2] [3] [4].
3. Plain words, a concrete number in the headline, 200 to 700 words on the page [5] [7].
4. One primary action, sticky on a phone, at least 44 px tall [11] [17].
5. Let the visitor start the task before the account when the product allows it [12] [13].
6. Say what it costs to try beside the button: no card, free plan, trial length [14].
7. Real proof beside the claim. With little to show, five real reviews beat a wall of logos [15].
8. Do not spend a round on button colour or wording [1].
