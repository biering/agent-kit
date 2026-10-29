# Render hardening: what `render.mjs` does and why

A render is the same film drawn many times in parallel and averaged, so everything that can differ
between two draws of a frame, and everything between the page and the file a phone plays, is a
place for a quiet bug. This is the ledger of what the renderer guards, checked against the traps
Scenario's kinetic skill documented, and what was found in our own runs.

| Trap | Before | Now | Checked how |
|---|---|---|---|
| A 1920x1080 viewport paints only about 990 px: the window keeps about 90 px of chrome, so the bottom of every frame is black | not an issue: frames are Playwright `page.screenshot`, which sets the viewport itself | unchanged. Raw CDP `Page.captureScreenshot` is where the trap lives: there, use a 1300 px tall viewport and clip to the frame | drew a gradient to the last row in Playwright's bundled Chromium and in system Chrome: the bottom row painted in both |
| A capture without `clip.scale` returns CSS pixels, so a "4K" render is 1080p | no device scale at all | `--scale 2` renders a 1920x1080 page as 3840x2160 (a device scale factor), and the first capture of every page is size-checked against `film size x scale` before a frame is encoded | `--scale 2` smoke render: 3840x2160, level 5.1 |
| Big 3D layers are captured before every tile has rastered: half-drawn words in some frames | no flag | `--run-all-compositor-stages-before-draw` at launch (`LAUNCH_ARGS`) | renders still launch and draw; the kinetic starter's 24 layers of 3D type render whole |
| Too many workers fill memory and stall the machine (six at 4K filled 36 GB) | `--workers` default 4 at any size | the default is what 80% of the machine's memory carries at the output size: about 2.5 GB plus 1 GB per megapixel per worker, capped at 3 at 4K and 6 below, and at half the CPU count. `--workers N` above that prints a warning | `defaultWorkers` unit test; manifest records the count |
| A shutter window that crosses a hard cut blends two shots into one frame, and clipping the window at the cut leaves the fastest frame of a whip sharp | the window was centred on the frame and crossed cuts | `subframeTimes` keeps the window's width and slides it to its own side of the cut (just short of it before, on it after), using `window.film.cuts` (or `hardCuts` when a film names the true hard cuts apart from its soft handoffs) | smoke film with a colour cut: the frame on the cut is pure, the frame before pure, none a blend |
| `-shortest` when muxing drops the last frames when the audio is a few milliseconds shorter (the frame a loop returns to) | `mix.py` used `-shortest` | audio is padded with silence and both streams are cut at the picture's own duration | a mixed render keeps the video's frame count and duration |
| `Math.random`, `Date` and state between frames make workers draw different frames | `--purity` (after the fact, on sampled frames) | before the first frame the film's own sources are read for `Math.random`, `Date`, `performance.now`, timers, `requestAnimationFrame`, CSS transitions and animations (and the files it imports); during a run the clock and the dice are wrapped and a call made inside `seek` stops the run; `--purity` stays | a film with `Math.random` in `seek` is refused by the lint, and with `--lenient` caught by the guard |
| A slower x264 preset without a level is level 6.0: plays in ffmpeg and nowhere on a Mac | `-pix_fmt yuv420p` only | the lowest of 4.2, 5.1, 5.2 that holds the output size and rate, passed to x264; a size above level 5.2 is refused before the first frame (`pickLevel`) | `qa.mjs` decodes the result on the macOS hardware decoder |

## Found in our own runs

- **Colour.** Playwright's JPEG frames are full range, tagged BT.601 (`yuvj420p`); QuickTime and
  the stores assume BT.709 limited range and shift the greens (a forest `#01684e` came back
  `#04684e`), and an App Store upload wants limited range. The encode now converts, not just tags
  (`scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709`), and writes
  the primaries, transfer and matrix with x264's own parameters: ffmpeg's `-color_primaries` and
  `-color_trc` flags left both `unknown`. A flat `#01684e` frame decodes (BT.709, limited) to
  `#01684e`, a `#c0392b` one to `#c1392b`.
- **A symlinked film path.** On macOS `/var` is `/private/var`; git reports the real path, the
  film path was not, and every asset URL escaped the served root. The film path is resolved to its
  real path first.
- **A 3:2 loop at 3840x2560** is 38,400 macroblocks, level 6.0, refused by the hardware decoder
  (`qa.md`). `pickLevel` states the limit and the largest sizes that fit.
- **Faststart.** The final mp4 gets `+faststart` so a player can start before the download ends.

## What the renderer does not do

No bloom or grain pass (a film draws its own grain: it is the expensive part of a frame, so it is
the film's choice), and no variable-length whip shutter: motion blur takes the same number of
samples per frame everywhere (`--subframes 8` for a final; a fast move is slowed rather than given
more samples). Both are the film's or the style's concern, not the renderer's.
