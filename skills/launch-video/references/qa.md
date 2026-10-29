# Measured QA: what `qa.mjs` measures and where the numbers come from

`scripts/qa.mjs` measures the encoded video against a style's profile (`styles/<name>/qa.json`)
and exits 1 when a target is missed. The Editor runs it on every render; a film that misses does
not ship.

```bash
node $K/qa.mjs film.mp4 --style kinetic                    # the profile of a style
node $K/qa.mjs film.mp4 --profile ./qa.json                # a profile file beside the film
node $K/qa.mjs silent.mp4 --style kinetic --silent         # a draft before the mix: no audio targets
node $K/qa.mjs film.mp4 --style one-shape --json           # also writes film.mp4.qa.json
node $K/qa.mjs reference.mp4 --profile any-qa.json --measure   # only print the numbers (a reference film)
```

## How it measures

The video is decoded once with ffmpeg at 320 px wide, in grey. For every step between two frames:

- **moved share**: the share of pixels that changed by more than `stillDelta` luma steps (of 255).
  A frame is **still** when that share is under `stillShare`.
- **cut test**: more than 45% of the frame changed by more than 24 steps in one step, and either
  the mean brightness jumped by more than 18 or more than 60% changed. A flood is slower than
  that; a whip, a colour swap and a hard cut are not. (Full-bleed ground swaps are counted
  separately as "colour flips", for information.)
- **mean absolute difference** per step, for the loop seam.

From those: the **still share** and the **longest hold** (the longest run of still frames, with
the time it starts at; the profile's `endCardSeconds` at the end are left out, because an end card
may rest), **hard cuts** (total, and per 10 s over the same stretch), and the **loop seam**: the
step from the last frame back to the first, compared with the 95th percentile of the film's own
steps. A seam is a wrap bigger than `loopSeamRatio` times that (with a small floor, so a quiet loop
does not fail on noise). A last frame identical to the first is reported but fine; the wrap is one
ordinary step either way.

From the file, not the pixels: size in bytes, the H.264 level and codec, the pixel format and
range (`yuv420p`, limited range; a JPEG-fed encode is `yuvj420p`, full range, tagged BT.601, and
QuickTime and the stores read its colours wrong), a full decode on the macOS hardware decoder
(`ffmpeg -hwaccel videotoolbox`, what QuickTime uses; skipped off macOS), the frame count and the
size against the `<video>.json` manifest `render.mjs` wrote (frames lost when worker segments were
joined, a capture at the wrong scale), the audio stream, and integrated loudness and true peak.

**What a cut is, and what it is not.** A hard cut here is a step where most of the frame changes at
once. A cut between two shots of similar tone and layout (a word swapped on the same ground) changes
little of the frame and reads as motion, not as a cut: the style's profile counts what the pixels
show, so a style that cuts on light-to-light needs its cut range set from a measured starter, and a
director who wants the cut to count alternates the grounds. The cut into an end card is the card's,
not the film's, when `endCardSeconds` is the card's length.

**The metric is per style.** The same real film reads very differently on the two scales: the
Tinybreath motion loop (one breathing shape, never cut, called perfect) measures 59% still frames and
a 1.9 s hold at the kinetic metric (`stillDelta 24`), and 25% still with a 0.83 s longest hold at the
sensitive one (`stillDelta 4`, `stillShare 0.002`). A calm style uses the sensitive metric,
because slow motion on flat colour is motion; kinetic uses the strict one, because the style is
changes of the whole frame on nearly every beat.

## The profile

```json
{ "style": "kinetic",
  "description": "what the style is and why these numbers",
  "measure": { "stillDelta": 24, "stillShare": 0.015, "endCardSeconds": 4.5, "loop": false },
  "targets": { "stillShareMax": 0.4, "holdMax": 0.6, "cutsPer10s": [6, 13], "hardCutsMax": null,
               "loopSeamRatio": null, "bytesMax": 1000000000, "levelMax": 5.2, "hardwareDecode": true,
               "audio": "required", "loudness": { "min": -16, "max": -12, "truePeak": -1 } } }
```

A target left out or `null` is not checked. `validateProfile` rejects an unknown key, so a typo
does not silently turn a check off. `loopSeamRatio` needs `measure.loop: true`.

| Profile | Where its numbers come from |
|---|---|
| kinetic | Scenario's measurements of viral kinetic reels and of a film built with its skill: under a quarter of the frames still in the fastest reference, no shot held past 0.4 to 0.7 s, 9.1 hard cuts per 10 s in the fastest reference and 12.5 in its worked teaser, 40% still at most as the failing line. Ours measured on the starter: 36%, 0.45 s, 12.5 |
| one-shape, ambient-loop | measured on the real Tinybreath films at `stillDelta 4`: 16:9 cut 25.0% still, longest hold 0.83 s, 0 hard cuts, wrap step 0.86 against its own p95 of 4.73; header loop 26.8%, 0.83 s, 0 cuts, wrap 0.80 against 5.45. Targets sit about 40% outside those |
| product-ui, story | the style's own starter, measured, with 25 to 40% headroom (each `qa.json` says so) |

## Level, size and the hardware decoder

H.264 level 5.2 holds 36,864 macroblocks (16x16) per frame and 2,073,600 per second. A frame
of 3840x2160 is 32,400, so 4K at 60 fps is level 5.2 and 4K at 30 fps is 5.1. A frame of 3840x2560
is 38,400: x264 writes level 6.0, the file plays in ffmpeg and the macOS hardware decoder refuses
it (`hardware accelerator failed to decode picture`), which is what the 3:2 search-tile loop
of a real film did. `render.mjs` computes the level from the output size and rate, passes it
to x264 and refuses a frame size above level 5.2 before the first frame (`pickLevel`): a 3:2 tile
is 3600x2400 at most. A slower x264 preset without a level plays in ffmpeg and nowhere on a Mac;
the explicit level is the fix, and this check is the proof.

## Adding or tuning a profile

1. Render the style's starter (or the real film you want to match) and run `qa.mjs --measure
   --profile <a profile with the measure block only>` at the metric you will use.
2. Write the targets with headroom (25 to 40% outside the measured numbers), the reason beside
   each in `description`, and run `qa.mjs` on the same file: it must pass.
3. A new style's `qa.json` is part of the style; the repo test loads every profile.
