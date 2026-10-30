# Producer: intake, brief, budget, deliverables

The Producer decides what the film is for and what it may cost before anyone draws a frame.

**Gate: the brief gate.** The brief is filled in, every gap is closed, the credits ceiling is
written down and the user has said yes to it (or to "no paid steps"). **Artifact:** `BRIEF.md` in
the film's folder (template in [briefs.md](../references/briefs.md)), with the claims ledger and
the deliverables table below.

## Intake

Read what the repo already answers before asking anything:

- The claims: the feature's changelog entry, the app's pitch or store listing, the code. Every
  sentence on screen must be in there.
- The screens: real screenshots. A film rebuilds them in HTML at true proportions, with the
  numbers they show.
- The plan gate: the pricing source of truth in code, never a changelog (an entry is true on its
  date and nobody rewrites it). A feature that is partly paid says so on the end card.
- The look: the brand's `brand.css`, the app's `DESIGN.md`, the mark's SVG.

Write down what is missing: no changelog entry, a screen the story needs with no screenshot, a
number with no file it came from, a plan gate you cannot read. Each gap is closed (the user
supplies it, or the beat that needed it goes) before the beat map. A film started with a gap
fills it with an invented number.

Then ask, in one round with your recommendation first, only what is left:

- the **one story**: the single moment a user has with the feature (a fixed rate ends in five
  months; close your eyes and a tone paces you)
- **format and length**: 16:9 1920x1080 (X, YouTube, landing, LinkedIn), 1:1 1440x1440 (feed),
  9:16 1080x1920 (Reels, TikTok, Stories); 15 s for one thing, 20 s for a page with three, 30 s is
  the ceiling for a feed
- **gate**: stop at the beat map and four stills, or build through and take notes on the
  finished film
- **reference**: a video they want the structure of, or none (the Director breaks it into beats)

## The claims ledger

One table in `BRIEF.md`: every sentence and number that will be on screen, and the file or
screen it comes from. A number with no row is not on screen. The Animator keeps the same list in
the film's data (`spec.sources`, or the arrays at the top of `film.html`), and the README says
which file each came from. A style's `validateSpec` checks it: a digit on screen with no source
fails before the first frame.

| On screen | Source |
|---|---|
| "Free on iPhone" | `AGENTS.md`, the store listing |
| 1 and 5 minute sessions | `entitlement.ts` FREE_LENGTHS |

## Budget and credits

Most of a film costs nothing: the render is local and the sound is recorded Mixkit effects. Paid
steps are generated pictures, generated music and generated speech, through the Higgsfield MCP.

1. List every paid step the film might use, with its model and the count (for example: four
   key-art pictures, one music bed, no speech).
2. Price each one before running anything: the tool's `get_cost: true` returns the credits
   without submitting. Add them up. Check the balance (`balance`).
3. Write the ceiling in `BRIEF.md` (`Budget: 40 credits, pictures only`), tell the user the total
   and wait for the yes. Approving the brief is not approving a run; each paid run is inside
   the ceiling, and a run that would go over stops and asks.
4. A failed run can still be charged: check the transaction before running it again, and say so.
5. Keys by name in `.env`, never pasted into the brief or a prompt.

Generated pictures are checked at 100% for third-party brand marks (makers' logos on vehicles,
shoes, clothes, screens) before they go in the film, and the check is recorded in the spec.
Generated music: see [sound.md](sound.md).

## Deliverables

A table, one row per file the film ships, filled in at intake and ticked off by Delivery:

| File | Format | Audio | Where | Check |
|---|---|---|---|---|
| `<slug>-16x9.mp4` | 1920x1080, 60 fps | music + SFX | X, YouTube, landing | `qa.mjs` + earshot |
| `<slug>-9x16.mp4` | 1080x1920 | music + SFX | Reels, TikTok | `qa.mjs` + earshot |
| `<slug>-header.mp4` | 3840x1646, 30 fps, 5 to 30 s | none | App Store header | `qa.mjs` loop seam |
| poster, contact sheet, `README.md` | png, md | | review | |

Every row names the QA profile it is measured against (the style's), so "done" is a command that
prints `QA PASSED`.

## Effort

`xhigh` for a new film (the brief and the budget). `medium` for a fix or a re-render.
