# Ad brief: Sharehush / the inbox on the shared screen

<!--
Everything here is invented for the ad-creative skill: the product, its name, prices, dates,
file paths and links. It shows a brief that passes brief_check.mjs (run with --today 2026-11-20;
the coupon date is in the past after 2026-12-07, which the check then reports, as it should).
-->

## Premises

| ID | Fact | Source | As of |
|---|---|---|---|
| P1 | One-time price 12 EUR, unchanged since 2026-09-01 (the lowest price of the 30 days before the coupon) | `pricing/prices.json`, git log of that file | 2026-11-20 |
| P2 | 7-day free trial, all features, no account | `Sources/Licensing/Trial.swift:12` | 2026-11-20 |
| P3 | When screen sharing starts it hides desktop icons, pauses notifications and covers the windows the owner listed; it restores them when sharing stops | `Sources/ShareWatch/ShareDetector.swift`, `Sources/Actions/` | 2026-11-20 |
| P4 | Detects sharing in the call apps listed in the app's settings screen; macOS 14 or later | `Sources/ShareWatch/SupportedApps.swift`, `Info.plist` LSMinimumSystemVersion | 2026-11-20 |
| P5 | 30-day refund on direct purchases, no questions | `site/legal/refund.md` | 2026-11-20 |
| P6 | Launch coupon: 30 % off the one-time price, ends 2026-12-07 | `pricing/coupons.json` (code LAUNCH, `expires`) | 2026-11-20 |

## Target

- Market: people who share their screen at work and want to look professional doing it
- Segment: freelancers who present work to clients on video calls
- Avatar: a freelance designer who shows drafts to clients on calls several times a week and once had a private message pop up on top of a client deck
- Awareness: problem-aware
- Placement: meta-reels
- Ad format: video-30-90s
- Buyer's words: "the moment I hit share I remember my desktop" (https://forum.example.com/t/share-screen-panic); "my bank notification showed up mid-pitch" (https://forum.example.com/t/mid-pitch)
- Research: three competitors with long-running screen-recording ads in the productivity category (Meta Ad Library, seen 2026-11-18); review complaints about notifications during calls in two store listings

## Content sale

- Format: 40-second vertical screen recording with a caption bar, no face, the look of a how-to clip
- Topic: the message that popped up while presenting to a client
- Concept: a designer starts sharing for a client review and the screen shows everything; then the same start with the app, and nothing shows. Angle: the fear of the one pop-up you cannot take back
- Visual hook: first frame is a shared screen with a client deck and a generic chat bubble half over it, the call's "you are sharing" banner on top
- Copy hook: "You shared your screen. So did your inbox."

## Hope sale

- Identification: two minutes before the call you close mail, hide the folder called "invoices", turn on Do Not Disturb, and hope
- Point of contact: "I forgot to turn on Do Not Disturb"
- Problem mechanism: the routine is three steps done while the call is starting, and the one you forget is the one that shows
- Function mechanism: the clean-up has to happen at the moment sharing starts, without you, and undo itself afterwards
- Solution mechanism: an app that notices sharing start and does all three steps, then undoes them [P3]
- Conditions: doing it by hand needs you to remember under pressure, on every call; a focus shortcut covers notifications and still needs you to press it

## Value sale

- USP: you set it up once; every share after that starts clean, in the call apps you already use [P3] [P4]
- Features:
  - odds: works in the call apps listed in its settings, on macOS 14 or later [P4]
  - effort: no step per call; it starts with the share [P3]
  - dream: present to a client without watching the corner of the screen
- Anchoring: 12 EUR once [P1], against one private message in front of a client

## Impulse sale

- Risk reversal: try it for 7 days free [P2], and if you buy, you have 30 days to ask for your money back [P5]
- Gain now: 30 % off with the launch coupon [P6]
- Loss later: the coupon ends on 2026-12-07 [P6]; after that it is 12 EUR [P1]. Every call without it is one more chance for the pop-up

## Writing

- Reference ad: a screen-recording ad for a productivity utility, running since 2026-08 in the Meta Ad Library (entry saved in the research notes, seen 2026-11-18)
- Mini-blocks: hook 0-3 s; the routine 3-10 s; the cause 10-17 s; the fix shown 17-27 s; set-once 27-32 s; trial and refund 32-36 s; coupon and CTA 36-40 s
- CTA: Try it free

## Batch

- Risk: moderate
- Bets: the concept (before and after on the reader's own screen); market, segment and format are proven
- Variable: the copy hook

| Variant (utm_content) | Changes | Decision | Date |
|---|---|---|---|
| share_video40_hook_a | "You shared your screen. So did your inbox." | | |
| share_video40_hook_b | "Your client saw the message before you did." | | |

## Launch checks

- [ ] Every fact in the creative is a premise above, with its source re-read on launch day
- [ ] Urgency only from a sourced end date; no stock, timer or "last chance" that is not true
- [ ] No invented number, review, rating, testimonial or result; quotes used with consent
- [ ] No real character, game, film, celebrity, creator or brand; no lookalike
- [ ] No sexualised bait; no medical or health claim; no personal attribute asserted
- [ ] A price reduction is shown against the lowest price of the 30 days before it (PAngV §11)
- [ ] The platform's ad policy checked for this placement (policy.md)
- [ ] Sizes, safe zones and text limits checked for this placement (production.md)
- [ ] Captions burned in; the ad makes sense with the sound off
- [ ] Every string went through unslop; the landing page repeats the ad's promise
- [ ] A retargeting audience holds only visitors who consented; the ad stops when its offer ends
