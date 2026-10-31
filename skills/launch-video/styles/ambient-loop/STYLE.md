# ambient-loop: the App Store header and the search tile

A silent, seamless loop: abstract shapes drift over a flat ground, and the last frame wraps to the
first as one ordinary step. 5 to 30 s, no sound, no text, no call to action (the store page has the
button). The mark may appear once, small.

## When to use it, and when not

Use it for the 21:9 header of an App Store product page (3840x1646) and the 3:2 search-result tile
(3600x2400): a film that plays muted, over and over, beside a button the viewer reads first.

Not for anything with sound, a message, a pointer or a sequence of states (one-shape draws those, and
it can be a loop too). A film that has to be understood in order is not ambient.

## Where the look comes from

- **The real loops**: the header (21:9, 28.9 s) and search tile (3:2) cut from the Tinybreath motion
  loop: muted, no call to action, the mark once. Their rule is kept: the frame is calm, the wrap is
  invisible. What they drew (a breathing product shape) is not part of this style.
- **Keep**: a flat or two-colour ground, big soft light, thin sharp-edged lines, grain on its own clock.
- **Push**: whole-number cycles for everything, so that no moment is the end. Nothing enters or leaves.

## Rules

1. **Every moving thing completes a whole number of cycles in the loop's length T.** `validateSpec`
   rejects `drift.kx: 1.5`. A fractional cycle, a phase that does not come back, or a harmonic that is
   not a whole multiple of its base jumps at the wrap. The starter's first ribbon had a 2.3 harmonic: the wrap
   measured 1.72 against a p95 step of 1.06 and the QA failed it; the whole multiple 3 measured 0.73.
2. **No entrance, no exit.** At t = 0 the layers are already mid-drift.
3. **seconds x fps is a whole number of frames**, or the wrap lands between two frames.
4. **At least one layer has a sharp edge and moves** (a ring, a tile, a ribbon). A soft orb alone moves
   too gently per frame for the QA to see: 85% of frames read still.
5. **Grain on its own clock**, six ticks a second, a whole number in the loop, the last showing the first's
   grain. A grain change at the wrap, with the encoder's noise on the first keyframe, measured twice an
   ordinary step. The grain also dithers the gradients; without it dark glows band.
6. **Keep the focal point in the middle 60% of the 21:9 frame**: the store crops the edges on some devices.
7. **The mark, if any**: the brand's own SVG file, one place, at most 0.14 of the short side, static.
8. **No sound, no text, no call to action.** `validateSpec` rejects `audio`, `music`, `cta`, `text`.

## Pacing

A cycle of 4 to 12 s for the slow things (light, ring drift), 2 to 4 cycles in 12 s at most. A ring
breathes 2 to 4 times, a tile turns once, a ribbon carries one wavelength along. Several layers at
different counts make the pattern take longer to repeat than the loop does. Nothing is faster than a
cycle in 3 s: the page is open for minutes.

## The kit (`loop-kit.js`, pure)

| Layer `kind` | What it draws | Fields |
|---|---|---|
| `orb` | a soft radial light, flat in the middle | `size`, `soft` (0 to 1) |
| `ring` | a thin circle outline | `size`, `width` |
| `tile` | a rounded square, filled or outlined, that can turn | `size`, `radius`, `width`, `turns` |
| `ribbon` | a band along a sine, carried along by whole wavelengths | `size` (thickness), `amp`, `waves`, `flow` |

Every layer takes `color`, `opacity`, `blend` (`screen` on a dark ground), `at` ([x, y] of the frame, or
per format, or `only` one), `drift: { kx, ky, rx, ry, ph }` (whole cycles of each axis, radius as a
fraction of the short side) and `breathe: { cycles, amount, ph }`. Helpers: `phase`, `cycle`, `drift`,
`breathe`, `turn`, `ribbonPath`, `grainTick`, `layout(w, h)`, `place`.

## The spec

```js
{ seconds: 12, fps: 30, formats: ['header', 'search'], grain: 0.045,
  palette: { ground: '#10162B', ground2: '#171E3A', indigo: '#3F55E6', paper: '#F4EFE6' },
  ground: 'ground', ground2: 'ground2',                    // a slow vertical gradient, or just ground
  layers: [
    { kind: 'orb', color: 'indigo', at: [0.37, 0.5], size: 1.1, soft: 0.95, blend: 'screen', drift: { kx: 1, ky: 2, rx: 0.08, ry: 0.06 } },
    { kind: 'ring', color: 'paper', at: [0.5, 0.5], size: 0.78, width: 0.003, opacity: 0.45, breathe: { cycles: 3, amount: 0.04 } } ],
  mark: { src: '/brand/mark.svg', at: [0.5, 0.88], size: 0.07 } }     // optional
```

## Audio

None. The loop is muted in the store: render without a track, and `qa.mjs` fails a file that has one.
`audio.json` says `"audio": "none"`.

## QA profile (`qa.json`)

Measured at the sensitive metric (`stillDelta 4`, still under 0.2% of pixels moved), `measure.loop`.

| Target | Value | Why |
|---|---|---|
| loop seam | wrap at most 1.5x the loop's p95 step | the point of the style; starter 0.73 against 1.60 (header), 0.91 against 2.18 (3:2) |
| hard cuts | 0 | a loop has none |
| still frames | 50% or less | starter 0.0%; the same layers without their sharp edges 85% |
| longest hold | 1.0 s or less | starter 0.00 s; without the edges 0.97 s; a poster holds for seconds |
| file size | 150 MB | our budget for a loop, not a store rule |
| level, decode | 5.2, hardware decode plays | see Formats |
| audio | none | |

Still share and hold are loose on purpose: at a quarter of the drift the starter still measures 0.0%.
They catch a loop whose sharp edges stopped, not a gentle one. The seam is the number to watch.

## Formats

| Format | Size | Macroblocks | H.264 level |
|---|---|---|---|
| header 21:9 | 3840x1646 | 24,720 | 5.1 |
| search 3:2 | 3600x2400 | 33,750 | 5.2 |
| search 3:2, do not | 3840x2560 | 38,400 | 6.0 |

Level 5.2 holds 36,864 macroblocks a frame. At 3840x2560 x264 writes level 6.0: the file plays in
ffmpeg and the macOS hardware decoder refuses it (`hardware accelerator failed to decode picture`),
which a real 3:2 tile did. `render.mjs` refuses above 5.2, and the engine has no 3840x2560 format.

Render `--fps 30 --subframes 1 --crf 26`. The 12 s starter is 25.0 MB at the header (2.1 MB a second:
grain is what the CRF pays for) and 27.1 MB at 3:2; crf 20 is 61 MB at the header and does not fix a
seam that is a real jump.

## Gotchas

- Check the loop twice: the PSNR of `--stills 0,<T>` (infinite at 3:2, 80 dB at the header: a raster
  difference of one level) and `qa.mjs`, which reads the wrap against the film's own steps.
- A ribbon's `flow` and an orb's `kx` are cycles in the whole loop, not per second: lengthening the loop
  slows everything, so fix the length first.
- Soft light on a dark ground bands without grain and goes pink where `screen` meets a warm colour;
  look at the contact sheet.
- `beat` is a twelfth of the loop, so `--stills every:2` and the viewer's arrow keys step through it.
- The loop has no text, so there are no fonts to replace; the Designer role supplies the palette.
