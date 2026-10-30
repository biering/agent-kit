# Style: kinetic

Huge words on every beat, whip pans, colour grounds that flip on each phrase, type the camera
flies through, one drop. The look of viral motion-design launch reels, for a product's own words
and brand. A film is a spec of blocks on the beat grid of its music.

## Use it for

- A teaser, a launch film or a game or app trailer of 15 to 55 s where the energy is the message.
- Claims you can say in one or two words per beat: a denial ("NO TIMELINES."), a number the
  product shows, a name.

Not for: a product walkthrough (use `product-ui`), a story with a person in it (`story`), a calm
brand where a flood is allowed and a hard cut is not (`one-shape`), a store loop (`ambient-loop`).
A brand that bans cuts, flashes or 3D rules this style out; say so at the Director's gate.

## Where it comes from

Scenario's public "Kinetic Film" skill showed the shape: a spec of scene blocks on the music's
beat grid, a camera rig that never parks, and a QA that measures the energy of a reel instead of
guessing. We keep the ideas and the numbers; the code here is our own (`engine.js`, `blocks.js`)
and Scenario's files are not part of this kit. What we do differently: the spec is plain data
that `spec.js` validates before a frame is drawn; every number on screen needs a source;
sound is recorded Mixkit effects through `cues.mjs`, never synthesized; the type is the
product's brand face; the QA gate fails a film that misses a target.

## Rules

1. **Never park.** Every shot keeps moving: ghost rows slide, the word keeps growing, a pulse
   hits on every beat, the camera pushes and leans. The only rest is the end card.
2. **One idea per beat.** One or two words, filling the frame width (`f.fit` scales to 90%).
   A word that would shrink under about 200 px is split into two shots.
3. **Transitions are moves.** A whip (`in: 'whipX' | 'whipXr' | 'whipY'`, 0.13 s), a zoom through
   a letter's counter (`exit: { type: 'zoom' }`, pick O, D, A, B, P, R, 0), a collapse. Fades only
   on the end card's small lines.
4. **Flip the ground on phrase changes.** Three grounds: `bg`, `accent`, `paper`. Type follows
   the ground (paper on dark, ink on light); the accent is for the word that matters.
5. **Runs of cuts accelerate:** 1, 1, 1, 1/2, 1/2, 1/4 beat, then a flash.
6. **A hit on every cut has a sound** (the spec derives the cue sheet), and the music stops dead
   on the end card's first beat (`music.stop_beat`).
7. **Pure functions of t.** No `Math.random`, no `Date`, no timers, no CSS transitions:
   `render.mjs` lints for them and watches the clock during a render.
8. **Numbers on screen are the film's** (`{frames}`, `{seconds}`, `{beats}`) **or the product's**
   with an entry in `spec.sources`. `validateSpec` rejects a digit with no source.
9. **Generated pictures** (the Picture block) are checked at 100% for third-party brand marks
   before they go in.

## Pacing

| Film | Length | Tempo | Beats |
|---|---|---|---|
| Teaser or social cut | 15 to 25 s | 160 to 175 BPM | 45 to 70 |
| Launch film | 40 to 55 s | 165 to 175 BPM | 115 to 160 |
| Calmer brand film | 30 to 45 s | 128 to 135 BPM | 60 to 95 |

A fast tempo gives the cuts per second for free: at 172 BPM a beat is 0.35 s. The film's turn
sits on the music's drop, on a bar line. Write the words first as a spoken script, then cut them
into one or two words per beat; a turn every 3 or 4 phrases (a denial, a gag, a number, a reveal).

## Blocks

| Block | Phrase it is for | Options that matter |
|---|---|---|
| `Words` | any punchy statement, the hook, a run of cuts | `shots: [{ at, style, text, ground, color, size, rot, fx, in, second, pulse }]`; styles `slam stack split pair cut punch3d`; `charge: true` (lines converge on a point first); `exit: zoom \| flash` |
| `Strike` | "NO X." over a mock of X that dies | `items: [{ at, word, ground, ui: { type: timeline \| tiles \| rack, ... } }]`; the last item ends in a TV switch-off |
| `Hero` | who made it, what it is called | `kicker`, `title` (3D, 24 extruded layers, orbit, one flip, a light sweep), `sub` (typed) |
| `Counters` | scale: giant numbers on slot reels | `counters: [[value, label]]`, one every 3 beats; `source` lines as a scrolling plane |
| `Picture` | key art, a product shot | `src`, `words: [[beat, text]]`, `cutIns`, `focus`, `tint` |
| `Logo` | the end card | `wordmark` or the brand's SVG (`logo` in the spec), `tagline`, `small`; particles, a light sweep |

`fx` is `punch` (shake, flash, impact), `hit`, `beat` (shake and bump only) or `none`. A shot of
more than one beat pulses on each following beat unless `pulse: false`.

```js
{ block: 'Words', at: [0, 8], charge: true, shots: [
  { at: 1, style: 'punch3d', text: 'EVERY', fx: 'punch' },
  { at: 2, style: 'slam', text: 'FRAME', ground: 'accent' },
  { at: 3, style: 'stack', text: ['IS A', 'FUNCTION.'], ground: 'paper', in: 'whipX', second: 1 } ] }
```

Scenes tile the film: each starts where the last ends and the last ends at `beats`.
`starter/` is a 51-beat film at 134 BPM that passes this profile.

## Audio

`audio.json`: tempo bands, the structure (tense intro, one drop, hard stop), a recorded music
pick (Mixkit 726, 134.0 BPM, drop on beat 16 from `start: 7.226`), and the kit: one recorded effect
for each cue name (`impact`, `hit`, `tick`, `pop`, `whoosh`, `riser`, `glitch`, `logo_hit`).
`node cues.mjs <spec.js>` turns the spec into `cues.json` for `mix.py` (cues in beats, effects
normalised before their gain, music stopped on a beat). Fit the track first:
`beats.py <track> --bpm 134 --start 6 --window 40 --drop-beat 16`.

## QA profile (`qa.json`)

| Measure | Target | Why |
|---|---|---|
| Still frames (under 1.5% of the frame changes by more than 24 luma) | 40% or less | the references this style comes from keep under a quarter still; 40% is where a film starts to read as slides |
| Longest hold before the end card | 0.6 s or less | the references never hold a shot longer than 0.4 to 0.7 s |
| Hard cuts per 10 s | 6 to 13 (about 8.5) | Scenario measured 9.1 on its fastest reference reel and 12.5 on its own worked teaser; calmer reels run 1.4 to 3.7 |
| File | under 1 GB, H.264 level 5.2 or lower, plays on the macOS hardware decoder | above 5.2 QuickTime and phones refuse it |
| Audio | present, -16 to -12 LUFS, true peak -1 | `mix.py` masters to -14 LUFS |

The starter measures 33% still, a 0.45 s longest hold and 10.4 cuts per 10 s (a draft render reads the
same). It is kept off the band's edge on purpose: at 12.5 it read 13.1 on another render and failed. A film that misses a
target does not ship: fix it and render again (`references/qa.md`).

## Formats

Native 1920x1080 at 60 fps with 4 to 8 subframes. 4K is the same page at `--scale 2` (a 3840x2160
frame, level 5.1 at 30 fps and 5.2 at 60; a master CRF can pass 1 GB, so `qa.mjs` checks the size). A 9:16 cut is not
a crop: set `size: [1080, 1920]`, the words re-fit to the narrower frame, and break long phrases
into more shots. Check each format with the same stills, `--purity` and `qa.mjs`.

## Gotchas

- Measure text once, while visible: a hidden element measures 0. The engine does this in `build`.
- A letter with a hole for the zoom exit: the hole is not always the glyph's centre (D); the
  camera lands on the box's centre, so check the last frame of the zoom.
- Extruded type (24 layers in 3D) is the heaviest thing in a frame; `--subframes 8` at 4K wants
  the default worker count, not more.
- The shake and bump are on the camera, so a flash and a shake at the same time smear a still
  badly: the stills of a hit are a few frames after it, not on it.
