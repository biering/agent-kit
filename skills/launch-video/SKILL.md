---
name: launch-video
description: A video studio in code. Producer, director, designer, animator, sound, editor and delivery roles, five styles (kinetic, one-shape, product-ui, story, ambient-loop), measured QA. Makes a launch film, feature film, promo clip, app trailer or App Store loop, and ships it, on X as a player card.
---

# Launch video

Read the repo's `AGENTS.md` and `docs/agent-kit/launch-video.md` first; they win where they
differ from this skill.

A film is a single HTML page with a function `seek(t)` that draws any moment of it, and nothing
else: no CSS transitions, no timers, no state carried between frames. Because every frame is a
pure function of time, the renderer can take frames in any order, blend several per output frame
for motion blur, and split the work across parallel browser pages. When a moment looks wrong you
fix that one function.

## The studio

Seven roles, in order. Each has a gate (what must be true before the next role starts) and an
artifact (what it leaves in the film's folder). Open a role's file when you reach it.

| Role | Does | Gate | Artifact |
|---|---|---|---|
| [Producer](roles/producer.md) | intake, brief, claims, credits ceiling, deliverables | the brief gate: gaps closed, budget approved | `BRIEF.md` |
| [Director](roles/director.md) | picks the style (or proposes 2 or 3), writes the beat sheet | the beat gate: four scored stills shown | beat map |
| [Designer](roles/designer.md) | look book, palette, type, the brand's files | the look gate: the stills carry the brand | `LOOK.md` |
| [Animator](roles/animator.md) | the spec on the beat grid, the build | the build gate: renders, `--purity` pure, seams clean | `film.html`, `spec.js` |
| [Sound](roles/sound.md) | music at a known tempo, the beat fit, the effects kit, the mix | the earshot gate: -14 LUFS, no open `[major]` | `cues.json` |
| [Editor](roles/editor.md) | measured checks and the scored critique | the QA gate: `QA PASSED` and every score 8 or higher | `*.qa.json`, scores |
| [Delivery](roles/delivery.md) | formats, the media store, the X player card | the yes gate: the user's yes on the final cut | links |

The older gates keep their names and their owners: the **stills gate** is the Director's (scored by
the Designer), the **critique loop** the Editor's ([critique.md](references/critique.md)), the
**earshot gate** Sound's. A gate the user waived (build through, take notes on the finished film)
is written in the brief.

## Styles

A style is a folder in [styles/](styles/): `STYLE.md` (when, rules, pacing), a block library or
scene kit, a starter spec that renders, an audio profile and a QA profile. The Director picks one
from the brief.

| Style | For | Never | Profile in one line |
|---|---|---|---|
| [kinetic](styles/kinetic/STYLE.md) | teasers, trailers: huge words on every beat, whip pans, ground flips, 3D type, a drop | a calm brand, a walkthrough | 40% still at most, no hold over 0.6 s, about 8.5 cuts per 10 s |
| [one-shape](styles/one-shape/STYLE.md) | one element that morphs through the product's states, never cut, looping | a cut | no cuts, no hold over about 1.2 s, wraps to its first frame |
| [product-ui](styles/product-ui/STYLE.md) | a real screen, a cursor that causes every change, springs | a cut, a made-up UI | no cuts, something visible every 3 to 5 s |
| [story](styles/story/STYLE.md) | a person, a moment, a turn, then the product | a feature tour | 2 to 6 cuts per 10 s, plates that always move |
| [ambient-loop](styles/ambient-loop/STYLE.md) | the App Store header (21:9) and search-result tile (3:2): muted, seamless | sound, a call to action | the wrap is one ordinary step |

## What lives where

```text
launch-video/
├── roles/                 # producer, director, designer, animator, sound, editor, delivery
├── styles/<name>/         # STYLE.md, spec.js, engine.js, starter/, audio.json, qa.json
├── references/
│   ├── craft.md           # the house look and the motion and sound rules, the gotchas
│   ├── moves.md           # the catalog: 16 moves, when to reach for each
│   ├── briefs.md          # the director's brief, naming a look, seven structures
│   ├── critique.md        # the scored visual critique loop (the twin of earshot)
│   ├── qa.md              # what qa.mjs measures and where the numbers come from
│   ├── render.md          # what render.mjs guards and why
│   ├── formats.md         # layout(w, h), 16:9 1:1 9:16, the store loops, spring presets
│   ├── setup.md           # the studio, once per machine
│   └── x-player-card.md   # shipping the film inside a post on X
├── templates/             # kit.js (motion kit), icons.js, brand.css, film.html, moves.html
└── scripts/               # render.mjs, qa.mjs, beats.py, peaks.py, mix.py, mixkit.py, popscan.py, earshot.sh, player-card.mjs
```

A film is source code and lives in the repo, one folder per film (the repo's notes say where):
`BRIEF.md`, `LOOK.md`, `film.html` (and `spec.js`), `cues.json`, `caption.md`, `README.md`,
`.gitignore` ([delivery.md](roles/delivery.md)). Commit the source the moment it exists.

## The order of work

1. **Producer**: read what the repo answers, close every gap, price every paid step, write the
   brief. Setup once per machine: [setup.md](references/setup.md).
2. **Director**: choose the style, write the beat sheet, render four stills and score them.
3. **Designer**: the look book and the brand's tokens on those stills.
4. **Animator**: copy the style's starter, build, `--stills`, `--purity`.
5. **Sound**: fit the music (`beats.py --bpm`), write cues in beats, mix to -14 LUFS, earshot.
6. **Editor**: `render.mjs`, `qa.mjs --style <style>`, `popscan.py`, the scored critique.
7. **Delivery**: every format, each measured, the user's yes, then the store and the post.

A note that adds a scene, changes the story or swaps the song is not a revision: it goes back to
the Director's gate. A revision round is every note of one viewing, then one render.

## Hard rules

- **Nothing goes public without the user's yes on the final cut**, every cut it will post and its
  caption, in this session. Approving the stills or an earlier round is not that yes.
- **Real product, real claims.** Screens rebuilt from actual screenshots and tokens; numbers on
  screen come from the product or the user, never invented, and the README says which file each
  came from (a style's `validateSpec` rejects a digit with no source). Copy obeys the app's claims
  ceiling.
- **Captions are timed in beats**, like every cue.
- **Generated pictures are checked at 100%** for third-party brand marks before they go in.
- **Paid generation** (Higgsfield pictures, music, speech) is priced with `get_cost` first, inside
  the brief's ceiling, and run only after the user's yes.
- **A failed QA target fails the render.** Fix the film; do not edit the profile to pass.
- **Every on-screen line goes through the `unslop` skill** before the final render, no em dashes.
- **The end card does not contradict the plan.** A feature that is paid in part says which part.
- **Licensed audio is never committed.** `sources` in `cues.json`, a `.gitignore` beside the film.
- **Rendered video is never committed.** It is an output: upload it where the repo says and hand
  over the link.

## Effort

`medium` for fixes and re-renders (a director's note, a retimed cue). `xhigh` for a new film: the
brief, the style, the beat map and the build. The first three seconds of a launch earn `max`.
