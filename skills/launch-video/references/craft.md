# Craft: what makes a code-built film look expensive

Without these rules the result looks like a slide deck with easing. With them it
looks like a studio film. These are the house rules of the calm styles (`one-shape`,
`product-ui`, and the end cards of the others); `kinetic` and `story` override the ones their
`STYLE.md` names (hard cuts on the beat, flashes, 3D, a dark ground). The rules say how anything moves; what there is to
choose from is the catalog in [moves.md](moves.md). Where a brand's own motion
rules differ (a designer's kit, the repo's `docs/agent-kit/launch-video.md`),
the brand wins.

## The look

- **2D, light, one accent.** Warm white canvas, near-black ink, one accent colour
  (plus the product's own functional colours if it has them). One typeface, or
  the product's brand face. Left alone, models reach for dark 3D with glows and
  particles, and it never reads as premium. Think Apple keynote, not game
  trailer.
- **Use the product's own tokens.** They live in the repo's `brand.css`, taken
  from the app's `DESIGN.md` and design tokens: palette, type, radii and motion
  curve of the film are the product's. The film should feel like the product has
  come to life. A colour or a font that is not in the brand file does not go in
  a film.
- **Big enough to read on a phone.** A desktop page rebuilt at 1:1 has 14 px
  labels, which a feed shows at 4 px. Build the page about 1.3x its real size
  (a 1212 px screenshot becomes a 1600 px layout) and keep the camera at 1.1x
  or closer, so the smallest label that matters is 20 px on the 1080p frame.
- **Say it outside the UI.** The screen shows the product; one caption at a
  time says what to see. A dark pill at the bottom whose width springs to each
  label is one shape changing, not four titles fading.
- **Real screens.** Rebuild the UI from actual screenshots at true proportions
  (measure positions off the capture and scale them). A made-up UI is noticed at
  once.

## Motion

1. **Nothing fades in; things change shape.** A button grows into the next page,
   a colour floods out of one object and later shrinks back into another, text
   rises out of a mask line, and chips pop from zero on a spring. Crossfades,
   blur-ins and opacity ramps are banned.
2. **No cuts.** Every scene is made from the previous one. A cut is allowed only
   behind something that covers the whole frame (a flood, closed eyelids), and
   the covering thing is itself a scene.
3. **Something happens on every beat.** Write times in beats, not seconds. Big
   turns land on bar lines and the drop.
4. **A small overshoot when things land.** Use closed-form springs with a damping
   ratio of about 0.6 to 0.8, never bouncy.
5. **One camera move per scene.** Ease between keyframes, interpolate zoom in log
   space, and never zoom in then straight back out.
6. **Every click, tap and whoosh has a real sound**, placed by the effect's
   measured onset.
7. **Holds under a second**, except the end card (about 1.5 s).
8. **Check your own work** before anyone watches: stills per beat, the frames
   either side of every cut, the film at phone width, a purity check, a pop
   scan. A statement that it looks right counts only with the stills named.

## The soundtrack, measured

Rules 1 to 4 are what earshot measured on 7 professional launch films (its
`docs/launch-video-sound.md`, the playbook behind `earshot critique`); the
master levels are web-delivery practice. roles/sound.md is the gate that checks
them.

1. **Sound starts with the film.** First sound within about 0.3 s (the
   references' median is 0.13 s, the slowest 0.48 s), and the opening already
   near body level. No silent cold open.
2. **Land the ending at body level.** The last seconds reach the film's
   integrated loudness (references: median +0.2 LU), the fade is short
   (median 0.27 s), and dead air after the last sound is near zero. A long
   fade-out reads as the film giving up.
3. **A steady, loud body.** The references hold a flat loudness arc; they do
   not make you wait for a climax. Shape energy with arrangement (layers,
   a stop-down before the reveal), not big level changes.
4. **Accents on the moments, not on every cut.** Dense music covers the cuts;
   a designed sound goes on the reveal, the logo, the key UI action and
   section changes. The references put a measurable hit on a cut no more
   often than chance. More sounds is not better.
5. **Recorded SFX, never synthesized.** Synthesized beeps and oscillator
   whooshes read as cheap next to these films (earshot measures this as
   `realness`).
6. **Master at -14 LUFS integrated, true peak -1 dBTP**, limiter last.
   Most references clip after AAC decoding; that is a common flaw, not a
   target.

## Pure functions of t

- `seek(t)` sets every style from `t` alone. No `transition`, no
  `requestAnimationFrame`, no `setTimeout`, and no variable that remembers the
  last frame.
- A value with several targets over time is the sum of one spring per change
  (`v0 + Σ (target_i - target_{i-1}) · spring(t, t_i)`), so it stays pure.
- A drag is direct manipulation: while held, the value follows the cursor
  position at `t`; on release it springs back from wherever it was.
- The camera is one transform on a container: `translate(W/2,H/2) scale(z)
  translate(-x,-y)`, where `(x, y)` is the world point at the frame's centre.
- Measure layout once in `ready` (text widths, glyph positions) with no
  transforms applied, and read those numbers in `seek`.

## Handoffs (shared elements)

Most of the work is making two layers identical at the moment one replaces the
other:

- **Flood → screen.** A circle grows out of an object until it covers the frame.
  At the moment it covers, a second layer (the phone) takes over, with its
  camera zoomed so that the screen fills the frame and the object sits at the
  same pixel position, size, rotation and colour. Then pull back.
- **Button → page.** Hide the in-screen button and show an identical copy in
  the world layer at the same spot. The copy grows, and its radius stays half
  its height until it reaches the frame edges (a pill), then squares off. Its
  label grows with it, then leaves through a mask.
- **Page → mark.** Full-frame colour is the outer layer of the logo at huge
  scale. Contract it and the inner layers spring in.
- **Page → mark, by stroke.** If the mark is an outline (a house, a ring), draw
  it as one SVG stroke, start scaled so far in that the frame sits inside one
  wall of the stroke (a wall 12 of the mark's 128 units wide needs about 66x for
  a 380 px mark), and zoom out in log space. Pan in step with what the frame can
  see (`q = (1/s - 1/s0) / (1/s1 - 1/s0)`), or the frame slides off the wall
  before it has zoomed.
- **The mark is the brand's file, never redrawn.** Copy the path from the
  repo's mark SVG into the film and give it the stroke colour of the ground it
  stands on. A mark traced from a PNG once came out with mitred corners and an
  extra square: at 150 px on ink it showed a notch at the roof and a foot that
  is not in the logo. Give the mark `id="mark"` (or its path `id="markPath"`)
  so a repo test can compare it with the brand file.
- **Full stop → data point.** A hook line ends in a dot in the product's own
  signal colour. The dot is a screen-space element whose position blends from the
  text to `project(camera, worldPoint)`, so it lands on the chart exactly and
  rides the camera from then on. The page then grows out of the dot.
- **A card grows from its own content.** Clip the card (`overflow: hidden`) and
  counter-translate an inner layer by the card's position, so the content stays
  put in the world while the card's edge passes over it.
- Translucent layers composite differently than solid ones, so interpolate
  towards the rgba values the next layer really uses.
- **Clear the stage before a swap.** Whatever the next layer covers must have
  finished leaving a beat earlier. Three sheets still falling when the end card
  took over were cut mid-air; the pop scan found it (one frame, diff 17 against
  5 and 0).

## Gotchas

- **Floods** must clear the farthest corner, not the nearest edge, and take
  about 0.35 to 0.45 s. Faster reads as a flash, and a flood that stops short
  leaves a corner uncovered for a frame.
- **Eyelid and iris shapes** made from big ellipses curve away at the frame
  edges. Overlap them well past the centre when closed, or light slivers stay at
  the sides.
- **Visibility.** Use `visibility: inherit` rather than `visible` for shown
  elements, because a `visible` child shows through a hidden parent. Set
  `z-index` on every layer, or a card floats over the flood.
- **Masks clip descenders.** Give `.mask` a little bottom padding and an equal
  negative margin.
- **Text swapping inside a morphing shape** needs its own mask and its own
  enter and exit times, or the two labels overlap.
- **An icon is the app's icon.** Rebuilt screens take their icons from
  `templates/icons.js` (`icon('file-text', 28)`), or the repo's own set. A
  rounded box drawn in place of a file icon read as an empty checkbox in front
  of the attachment's name.
- **Two things on one line are one flex row with a gap.** An attachment chip and
  the button beside it were placed by hand at two tops and two lefts: the
  button sat 20 px lower and touched the chip. Lay them out as the app does
  (`display: flex; align-items: center; justify-content: space-between; gap`),
  and size the type so the gap survives the longest string.
- **A press scales the ground, not the label.** Put the button's colour on a
  child that takes the scale and leave the text unscaled; a label inside a
  pressed button fails the purity check at 51 dB.
- **A spring that has landed is exactly 1.** A spring never reaches 1, so an
  element popped with one stays under a scale for the rest of the film. Where
  it holds text for long (a card, the caption pill), snap the scale to 1 once
  it is within a hundred-thousandth (about 1.4 s for the springs here).
- **An exit is over before its cover appears.** `riseWords` leaves in
  `dur × 0.75` after `tOut`. A row that started leaving 0.45 beats before the
  card that grows over it was cut two thirds visible, on the drop. Render a
  still one frame before every cover.
- **`.w` is `white-space: pre`.** A row built from a template literal inside a
  mask keeps its line breaks as real ones: set `white-space: nowrap` on the
  row.
- **Never put `will-change`** on anything the camera scales, or text renders
  blurry.
- **Never let the camera chase a wrapping text cursor.** Typed text goes on
  fixed lines.
- **Declare every variable** that `seek` reads before the first `seek` runs.
- **Web fonts:** `await document.fonts.load(...)` for each weight in `ready`.
  `render.mjs` also waits for `document.fonts.ready`. Load them from the repo by
  root-absolute path, never from a font CDN: a render must not depend on the
  network, and a `file://` page cannot load a font from another directory.
- **Text never leaves by shrinking.** An element with a label pops in from zero
  (a few frames, nobody reads it yet) but leaves by sliding out or through a
  mask. Scaled-down text is redrawn slightly differently on each pass, and the
  purity check fails at 40 dB.
- **A camera push into a wide table crops its row labels.** Check the last
  frame of a push at full size; if the labels are gone, the push is too deep.
- **A label inside a growing shape has no mask to leave through.** Move it far
  enough to cross the frame edge, or give it its own mask.
- **Video footage** in a film: re-encode all-intra (`ffmpeg -g 1`), load it as a
  blob URL, and await `seeked` before each frame. A plain file server can't
  range-seek.
- **Motion blur:** 4 subframes leave ghost copies on fast moves. Use 8 for the
  final, and slow the move down rather than raising the count further.
- **Liquid glass:** Chromium misreads `backdrop-filter: url()` displacement
  maps. Clone the scene behind each glass element and filter the clone.
