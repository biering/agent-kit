# one-shape: one element, never cut

One element changes size, radius and colour through the product's states. A pointer causes every
change, a flood pours each new ground out of the shape, and the last state equals the first, so the
film loops. Slow footage on flat colour, 30 fps, no motion blur.

## When to use it, and when not

Use it for one product that has a handful of states (a button, a field, a loader, a result), a calm
brand, a loop for the App Store header or the search tile, or a 14 to 30 s cut for the feed. The
frame is the product coming to life, not a tour of it.

Not for a feature tour that needs cuts (kinetic), a made-up screen shown whole (product-ui), a person
(story), or anything that has to be loud in the first second. A hard cut breaks the style.

## Where the look comes from

- **The film this style was shaped by**: the Tinybreath motion loop, 28.9 s, one breathing shape on
  flat colour fields, never cut, last frame equal to the first. Its technique is here; its shader and
  its app are not. The shape is a DOM element, and nothing in the kit is product-specific.
- **The catalog entry**: "Shape morphing through UI states, 14 s" (moves.md), brief G (briefs.md).
- **Keep**: flat fields, one shape, grain, a pointer drawn as an ink dot with the same press ring,
  handoffs as floods, a note beside the shape that changes with each state.
- **Push**: make the states the product's real ones, and make the shape the thing the user presses.

## Rules

1. **One element.** Each state is that element changing size, radius, colour and what it holds.
2. **Every change has a cause on screen.** A pointer arrives a beat early and presses, or a flood runs.
   `validateSpec` rejects a state with neither. Press beside a label, not on it: the dot hides it.
3. **A handoff is a flood.** The next ground grows out of the shape over 0.9 s to the farthest corner.
   Pour the colour the shape already was, so it reads as the shape spilling.
4. **Nothing fades and no text shrinks.** Text rises through a mask and leaves upward, strokes are drawn,
   chips and the pointer pop on springs. A label inside a shape that contracts needs its own mask, or
   the shape's edge cuts the text.
5. **The last state equals the first** (validated), so the first and last frame are pixel-identical.
6. **Ambient drift is whole-number harmonics of the film's length** (`wobble`), not a clock that runs
   out and back (`A + 10 sin^2(pi t / T)`, kept as `ambient()` for a shader). That clock has no speed at
   the seam, so the shape stands still at both ends: measured below.
7. **Grain has its own clock**: six ticks a second, a whole number of ticks in the film, the last tick
   showing the first's grain. The grain does not change at the wrap.
8. **Something moves in every second.** The drift keeps edges moving; without it the same film is
   58% still.

## Pacing in beats (120 BPM: a beat is 0.5 s)

A press every 3 to 5 beats. The pointer arrives 1 beat before its press (0.5 to 4). A flood is 1.8 beats.
The new content waits 0.3 s for the old to leave. Typed text runs at 14 characters a second, card rows
rise every half beat. After the last state lands the film rests 1.5 to 8 beats, then wraps. A pointer
visit ends 0.8 s after its press, and the next starts after that.

## The kit

| State content (`kind`) | What it draws | Fields |
|---|---|---|
| `label` | one line, risen through a mask | `label` |
| `field` | typed text, a caret, a send chip that is the next press (dx = w/2 - h/2) | `text` |
| `ring` | a spinner arc drawn in, one turn in 0.9 s | none |
| `check` | a stroke drawn, then drawn back | none |
| `card` | a title and 1 to 4 rows with a dot each, one row per half beat | `label`, `rows` |

`core.js` is pure: `pose` (one spring per property per change, summed), `wobble`, `floodAt`,
`pointerAt` (route, press ring), `typed`, `grainTick`, `layout(w, h, ext)`. `engine.js` builds two layers
(the ground in force, and the one a flood grows over it), the pointer and the grain.

## The spec

```js
{ bpm: 120, beats: 28, fps: 30, palette: { paper, ink, mint }, noteAt: 'below',   // or 'left' in a frame wider than 1.7:1
  states: [
    { beat: 0, size: [380, 132], radius: 'pill', color: 'ink', ground: 'paper', kind: 'label', label: 'Start', note: 'One button.' },
    { beat: 3, press: [125, 0], size: [860, 132], kind: 'field', text: 'Plan a weekend', note: 'Say what\nyou want.' },
    { beat: 11, flood: true, ground: 'mint', color: 'paper', size: [200, 200], kind: 'check', note: 'Done.' },
    { beat: 23.5, flood: true, ground: 'paper', color: 'ink', size: [380, 132], kind: 'label', label: 'Start', note: 'One button.' } ] }
```

Sizes are px on a 1080 short side. A property a state leaves out is the previous state's, and a state
that names no `kind` keeps the content before it. Any on-screen text with a digit needs an entry in
`spec.sources`. `press: [dx, dy]` is from the shape's centre.

## Audio

The 16:9 and 9:16 cuts carry sound, the store loops are muted. Music from a recorded Mixkit track
(22, 120.01 BPM, grid strength 1.0, first downbeat at 0.413 s), at body level from the first frame, no
drop, faded over the last 1.2 s. A recorded effect on every press (click), flood (whoosh, peak at its
middle), loader (pop), check (chime), a key under every third typed character, a pop per row.
`cues.mjs` derives the sheet from the spec. Master -14 LUFS, true peak -1 dBTP. Run earshot on each
cut that has sound: on the real film the 9:16 cut read two flood events the 16:9 did not.

## QA profile (`qa.json`)

Measured at the sensitive metric, `stillDelta 4`, a frame is still under 0.2% of pixels moved: the real
film reads 59% still with a 1.9 s hold at the kinetic metric (`stillDelta 24`) and 25% with 0.83 s here.

| Target | Value | Why |
|---|---|---|
| still frames | 40% or less | the real film: 25.0% (16:9), 26.8% (header), plus 40% |
| longest hold | 1.2 s or less | the real film: 0.83 s, plus 40% |
| hard cuts | 0 | a flood is slower than the cut test: 0 on the real film and the starter |
| loop seam | wrap at most 1.5x the film's p95 step | real film 0.86 against 4.73; starter 0.70 against 3.58 |
| file size | 150 MB | our budget for a loop, not a store rule |
| level, decode | 5.2, hardware decode plays | see Formats |
| audio | any; loudness -16 to -12 LUFS, -1 dBTP | only a cut with sound is measured |

The starter measures 14% still, 0.33 s, 0 cuts, wrap 0.70 (16:9); 7%, 0.27 s, 0.60 (header); 4%, 0.13 s,
0.46 (3:2). The same starter without the drift: 58%, 1.50 s, and it fails. With the `A + 10 sin^2` clock
driving the drift: 24% but a 0.57 s hold at each end of the film.

## Formats

One film, `?format=`: `wide` 1920x1080, `square` 1440x1440, `reel` 1080x1920 (the shape and note keep
220 px clear above and 340 below), `header` 3840x1646 (21:9, the unit is 1.2x), `search` 3600x2400.

The 3:2 tile is 3600x2400 and not 3840x2560: 3840x2560 is 38,400 macroblocks a frame, level 5.2
holds 36,864, x264 writes level 6.0 and the macOS hardware decoder refuses the file. 3600x2400 is
33,750 (level 5.2, measured to play). The 21:9 header is 24,720 (level 5.1). `render.mjs` refuses above.
Render `--fps 30 --subframes 1`, crf 24 for 16:9 and 9:16, 26 for the loops. The 14 s starter is
17.5 MB at 16:9, 31 MB at the header and 44 MB at 3:2.

## Gotchas

- `layout()` sizes the group for the tallest state and centres it; the note rides the shape's live edge.
- A flood needs a ground that differs from the one before; two floods may not overlap.
- Check the loop with `render.mjs --stills 0,<duration>` and compare the two (PSNR is infinite).
- `cuts` is empty and the film also lists `floods`; sample a flood with `--stills b<n>`.
- Keep the sizes small enough for the narrowest format: the widest state is 860 px of a 1080 reel.
- Hide with `visibility`, never `display: none`, and size the pointer dot instead of scaling it: `--purity`
  caught glyph edges and the dot drawn differently after a different history (46 dB at 2.5 s on the 3:2 tile).
- The system fonts are placeholders, the Designer role replaces them with the brand's.
