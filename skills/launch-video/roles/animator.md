# Animator: the spec on the beat grid

The Animator builds the film as code: a page with a function `seek(t)` that draws any moment of
the film, and nothing else. No CSS transitions, no timers, no state carried between frames.
Because every frame is a pure function of time, the renderer can take frames in any order, blend
several per output frame for motion blur, and split the work across parallel browser pages. When a
moment looks wrong you fix that one function.

**Gate: the build gate.** The film renders its stills, `--purity` says `pure`, the `cuts` stills
show no seam and the phone sheet reads. **Artifact:** the film's source (`film.html`, and the
style's `spec.js` where it has one), committed the moment it exists.

## Start from the style

Every style in [styles/](../styles/) ships `starter/film.html` and `starter/spec.js` that render
and pass the style's own QA. Copy both into the film's folder and change the words, the palette
and the name; keep the shape until it renders, then change blocks. A film outside the five
styles starts from [templates/film.html](../templates/film.html) and the kit.

| Style | The film is | Engine |
|---|---|---|
| kinetic | `spec.js`: blocks on the beat grid (`Words`, `Strike`, `Hero`, `Counters`, `Picture`, `Logo`) | `styles/kinetic/engine.js` |
| one-shape | `spec.js`: a state list, one shape that never cuts, the last state equals the first | `styles/one-shape/engine.js` |
| product-ui | `film.html` for the screen plus `spec.js` steps a cursor performs | `styles/product-ui/engine.js` |
| story | `spec.js`: scenes of plates, lines in beats, a turn, an end card | `styles/story/engine.js` |
| ambient-loop | `spec.js`: periodic layers with whole cycles per loop | `styles/ambient-loop/engine.js` |

Each style's `spec.js` exports `validateSpec`, which names the scene and the field that is wrong
before a frame is drawn. The scenes tile the film; every time is a beat.

## The kit (for anything the style does not draw)

[templates/kit.js](../templates/kit.js) carries easing, closed-form springs, keyframes, a
log-space camera, `project` (where a world point sits on screen), `riseWords`, `pop`, `show`, and
the pieces the moves are made of: `count`, `typed`, `draw`, `along`, `route`, `ring`, `wipe`,
`edges`, `bump`. A move's cell in [templates/moves.html](../templates/moves.html) is the code to
start from; [moves.md](../references/moves.md) says when to reach for each. Write every time as a
beat (`b(12)`), so the film stays on the grid and a tempo change is one constant.

Keep the data apart from the drawing: the numbers and lines on screen go in arrays at the top of
the script (`KPIS`, `ROWS`, `COPY`) or in the spec, copied from the screenshots and the claims
ledger, so a reviewer checks them in one place and a variant swaps them without touching a move.
List every handoff in `window.film.cuts` (seconds, `[b(8), b(16)]`) as you build it; the renderer
keeps a motion-blur window from crossing one.

```bash
node $K/render.mjs <film>/film.html --serve      # a URL; space plays, arrows step a beat, shift+arrow a frame
node $K/render.mjs <film>/film.html --stills every:2 --out stills/ --contact contact.png
node $K/render.mjs <film>/film.html --stills b15.4,b23,7.6 --out stills/   # b<n> is a beat, a bare number seconds
node $K/render.mjs <film>/film.html --stills cuts --out seams/ --contact seams.png   # before, on, after each cut
node $K/render.mjs <film>/film.html --stills every:4 --out phone/ --contact phone.png --tile 360
```

Review in three passes. The contact sheet shows the story and the composition. `cuts` shows every
handoff a frame either side, where a seam or a label that has not left yet hides between the
stills of a regular sheet. `--tile 360` is the film at the width a phone feed plays it: read it
there, not at 1080p. Every still also lists text drawn under 20 px per 1080 px of the frame's short
side; a label caught mid-pop shows up too, so open that still before resizing anything. Overlaps
and cropped labels only show at full size: open two or three stills themselves.

## Pure functions of t

The renderer enforces this three ways: it reads the film's own sources before the first frame and
stops on `Math.random`, `Date`, `performance.now`, timers, `requestAnimationFrame` and CSS
transitions or animations (`// viewer-only` marks the kit's scrub bar, which only calls seek);
it records any call to the clock or the dice made while `seek` runs; and `--purity` draws a frame
every two beats, seeks to the end and the start, and draws it again. A frame that comes back
different (under 60 dB) renders differently on each worker and smears under motion blur. Causes so
far: state carried between frames, and text inside an element being scaled at that moment (40 dB
on a shrinking caption pill). The rules and the traps are in [craft.md](../references/craft.md).

`render.mjs` serves the film over http from the repo's git root, so a film loads the repo's fonts,
images, `kit.js` and `brand.css` by root-absolute path. A missing file (`[404] <url>`), a failed
request or a page error stops the run before the first frame, because a film rendered in a
fallback font is wrong in every measurement; `--lenient` lets a sketch through. A film that must
survive kit updates copies `kit.js` beside itself.

## Formats and variants

Scenes are written against `layout(w, h)`, never fixed pixels, and every format is reframed from
one timeline, never cropped ([formats.md](../references/formats.md)). A reel is not a second film:
`film.html` reads `?format=reel`, so score, data, copy and beats exist once. A **hook**
(`?hook=problem`) swaps the opening beats up to the turn; a **CTA** (`?cta=try`) swaps the end
card's line. Build the variants only after one cut is approved, then render every combination:

```bash
node $K/render.mjs <film>/film.html --matrix 'format=wide,reel;hook=problem,result' --out out/film.mp4
node $K/render.mjs <film>/film.html --matrix 'format=wide,reel' --purity
```

For 9:16: re-lay the page out, do not shrink it (about 680 world units wide, framed at 1.4x); keep
what must be read between y 220 and 1580; aim the camera a little below its subject; give each
section the frame to itself; break the lines again. Run every check per format.

## Effort

`xhigh` for a new film; `medium` for a fix.
