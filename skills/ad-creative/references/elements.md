# The four sales and the 17 elements

Source of the framework: Derick Carneiro, "how I write ads that make strangers buy" (X,
2026-11-19), parts 1 and 2. The element names and the four sales are his; the definitions are
reworded for software, and the awareness rule, the format table and the worked example are ours.

## The four sales

A cold ad makes four sales before the product, in this order. Each is made with reasons the
avatar already wants to hear, not with reasons we find convincing.

| Sale | The reader decides | Elements |
|---|---|---|
| **Content** | this is worth watching to the end | 1 to 5 |
| **Hope** | the problem has a cause I did not see, and a fix exists | 6 to 11 |
| **Value** | this product is where I get that fix, and it is cheap next to the problem | 12 to 14 |
| **Impulse** | not trying it is the riskier choice, and now beats later | 15 to 17 |

## The 17 elements

Each element is a reason. In the brief, each is one to three sentences, in the buyer's words,
citing the premises it relies on (`[P1]`).

### Content sale

1. **Format.** Why the reader lowers their guard: the ad looks like something they watch anyway
   (a screen recording, a desk POV, a how-to, a talking head, a plain post). Taken from what runs
   in the libraries for this market.
2. **Topic.** Why they might care: a situation, question or fact from their week. Search
   questions and review complaints are where topics come from.
3. **Concept.** Why they stay to the end: format + characters (real people we may show, or none)
   + topic, as a one-line logline, and the angle that makes it urgent to hear.
4. **Visual hook.** Why they stop scrolling: the first frame breaks the feed's pattern and is
   true to the concept. For software, the product's own screen in a moment of trouble beats any
   stock image.
5. **Copy hook.** Why they decide to keep watching: the first line, on screen and spoken. Written
   with `copywriting`; one proven structure from the libraries, filled with our material.

### Hope sale

6. **Identification.** Why they feel understood: their routine, step for step, in their words.
7. **Point of contact.** What they already suspect is the cause. We start there, not with our
   theory.
8. **Problem mechanism.** The missing reason that proves the suspicion right and explains why
   the problem keeps happening.
9. **Function mechanism.** What has to happen for the problem to go away, and why what they
   tried cannot do it.
10. **Solution mechanism.** The one way that does that action, and why it works.
11. **Conditions.** Why they cannot simply do it themselves or get it anywhere: what makes it
    hard (it needs to happen at the right moment, every time, without them).

### Value sale

12. **USP.** Why this product is the place to get the mechanism under those conditions. It is
    the answer to element 11, not a slogan.
13. **Features.** Only features that move one of four levers, each tagged:
    - `odds`: why it works this time,
    - `dream`: what the life after looks like, made tangible,
    - `effort`: how little it asks,
    - `time`: when they feel it, in a way that makes sense (never sooner than true).
    A feature that moves no lever stays out of the ad.
14. **Anchoring.** Why not solving it costs more than the price: money, time, embarrassment.
    The price is a premise; the cost of the problem is the buyer's own words, not our estimate.

### Impulse sale

15. **Risk reversal.** Why not buying is the bigger risk: the trial, the refund, the free tier,
    framed against the time the product needs to prove itself. Only what the premises hold.
16. **Gain now.** What they get by acting now: a real coupon, a launch price, a bonus, the hour
    they save this week. Sourced.
17. **Loss later.** What waiting costs: a real end date (sourced), or, without one, the problem
    repeating every week. Never a timer, a stock count or a "last chance" that is not true.

## Awareness: how much an ad has to carry

The colder the reader, the more sales the ad has to make. A warmer reader has made some of them
already; making them again wastes the seconds the ad has.

| Awareness | Who | The ad makes | Elements usually carried |
|---|---|---|---|
| Unaware, problem-aware | cold feed | all four | 1 to 17, compressed |
| Solution-aware | knows the category (a wallpaper app, a clipboard manager) | content, value, impulse | 1, 4, 5, 10, 12, 13, 15 to 17 |
| Product-aware | visited, comparing, retargeting | value, impulse | 4, 5, 12, 13, 15 to 17 |
| Most aware | trial users, cart leavers | impulse | 5, 15 to 17 |

A known category collapses the hope sale: nobody needs a mechanism explained to buy a wallpaper.
Show the product being the thing they already want.

## What a format can carry

Elements a format cannot carry are `n/a: <reason>` in the brief and move to the landing page,
which has the room. A brief that marks the hope sale `n/a` for a cold audience is a brief for the
wrong format.

| Format | Room | Carries | Leaves out |
|---|---|---|---|
| 6-second video | about 15 spoken words | 4 visual hook, 5 copy hook, 12 USP, CTA; for warm readers 16 or 17 if real | the hope sale, features, anchoring |
| Static image | one headline on the image, primary text above it | 4, 5 (the image headline), 12 or 10; the text above: 6, 7, one feature, 15 | mechanisms 8, 9, 11 |
| Post of 280 characters | five short lines | 5 (first line), 6 or 7, 10 in one sentence, one sourced proof, CTA | 8, 9, 11, 14 |
| 15 to 30 s video | about 40 to 80 spoken words | 1 to 5, 7, 8, 10, 12, one feature, 15, CTA | 9, 11, 14, 16, 17 often |
| 30 to 90 s video | a full script | 1 to 17 | nothing, for a cold reader |
| Search ad | headlines of 30 characters, descriptions of 90 | the query is the hook: 10, 12, 13, 15, 16 | 1 to 9 |

Word counts assume a normal speaking pace and are rules of thumb, not measurements.

## Batches

A batch is a risk portfolio. The risk of an ad is the number of new bets in it; a bet is any of
market, segment, format, concept, topic or hook structure that has not worked for us or in the
libraries.

| Risk | Bets | Share of a batch | Why |
|---|---|---|---|
| Conservative | none: a new execution of proven parts | a few | keeps spend working while the rest learns |
| Moderate | one | most | one bet, so a winner says what worked |
| Aggressive | two or more | some | the step change, when it lands; teaches little when it fails |

Take risk where it pays: a new concept, format or hook in a proven market usually gains more
than finding a new market. Pick the market and segment from what already sells; bet on the
creative.

**One variable per variant.** Two variants of an ad differ in one thing: the hook, the visual
hook, the format, the CTA, the offer framing. Name the variant after it:
`<angle>_<format>_<variable>_<v>`, e.g. `share_video15_hook_b`. That name is the `utm_content`
`ads-landingpage`'s `scripts/ad_url.mjs` puts on the URL, so the ad and the page are read
together.

## Kill and scale

These are house defaults, not benchmarks; the repo doc may set its own.

- **Decide per variant** once it has 1,000 impressions or has spent twice the target cost per
  signup, whichever comes first. Below that, conclude nothing.
- **The target cost per signup** comes from the repo doc (what a buyer is worth after fees and
  refunds). Without one, ask; do not take it from a blog.
- **Kill** a variant whose first-seconds number (3-second views over impressions for video, link
  click rate for static and posts) is the lowest in its batch and below half the batch's best.
- **Clicks fine, signups low:** the ad is fine and the page is not, or the page does not repeat
  the ad's promise. Hand over to `ads-landingpage`'s keep, rewrite, retire rules
  (`references/tracking.md`) before killing the ad.
- **Scale** a variant whose cost per signup holds below target for three days: raise its budget
  in steps the ad account allows without restarting learning, and spawn the next batch from it,
  each new variant changing one variable.
- **Record** every decision with its date in the brief's batch table: what changed, what it did,
  what we keep.

## Worked example: an invented Mac utility

Everything in this example is invented: the product, its name, the prices, the dates and the file
paths. The filled brief that passes `brief_check.mjs` is
[examples/menubar-utility/brief.md](../examples/menubar-utility/brief.md).

**Premises.** "Sharehush" is a menu bar app for macOS 14 and later. When screen sharing starts in
a call app, it hides desktop icons, pauses notifications and covers windows the user listed, and
restores them when sharing stops. One-time 12 EUR, 7-day free trial, 30-day refund, a launch
coupon of 30 % until a set date. Each fact cites a file in the product's repo (the share
detector, the pricing file, the refund page) with the date it was read. The 12 EUR has not
changed in the 30 days before the coupon, so the reduction may be shown against it.

**Target.** Market: people who share their screen at work. Segment: freelancers who present to
clients. Avatar: a freelance designer who shows work to clients on calls several times a week and
once had a private message pop up on top of a client deck. Awareness: problem-aware. Their words
come from forum threads and app reviews ("the moment I hit share I remember my desktop").

| # | Element | In the example | Why this |
|---|---|---|---|
| 1 | Format | 40-second vertical screen recording with a caption bar, no face | screen-recording ads run long in the productivity category |
| 2 | Topic | the message that popped up while presenting to a client | the most repeated complaint in the threads |
| 3 | Concept | a designer starts sharing for a client review; the screen shows everything; then the same start with the app | before and after on the reader's own routine |
| 4 | Visual hook | first frame: a shared screen, a client deck, and a chat bubble half over it | the reader's fear, in their own UI |
| 5 | Copy hook | "You shared your screen. So did your inbox." | a proven "you did X, Y happened" structure; scored with `copywriting` |
| 6 | Identification | two minutes before the call: close mail, hide the folder called "invoices", turn on Do Not Disturb, hope | their routine, step for step |
| 7 | Point of contact | "I forgot to turn on Do Not Disturb" | what they already blame |
| 8 | Problem mechanism | the routine is three steps done while the call starts, and the one you forget is the one that shows | proves the suspicion and widens it |
| 9 | Function mechanism | the clean-up has to happen at the moment sharing starts, without you | what a shortcut cannot do |
| 10 | Solution mechanism | an app that notices sharing start and does all three steps, then undoes them [P3] | the action, named |
| 11 | Conditions | doing it by hand needs you to remember under pressure, every call | why they cannot just be more careful |
| 12 | USP | you set it up once; every share after that starts clean [P3] | the answer to 11 |
| 13 | Features | odds: works in the call apps listed [P4]; effort: no step per call [P3]; dream: present without watching the corner of the screen | each moves one lever; no time lever, so none is claimed |
| 14 | Anchoring | 12 EUR once [P1], against one message in front of a client | price sourced; the cost is the reader's own |
| 15 | Risk reversal | try it 7 days free [P2], and 30 days to ask for a refund [P5] | only what the premises hold |
| 16 | Gain now | 30 % off with the launch coupon [P6] | real, from the pricing file |
| 17 | Loss later | the coupon ends on its date [P6]; after that, 12 EUR [P1] | a real end date, not a timer |

What the example does **not** do, though the article would: no countdown, no "only 50 licences
left", no famous face or game look, no invented "10,000 users", no "less stress" outcome, and no
"Are you a freelancer with ADHD?".

For a 6-second retargeting cut of the same ad: elements 4, 5, 12 and 17 only, plus the CTA; the
rest is `n/a: product-aware audience, 6-second format`.
