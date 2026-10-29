# Briefs: the director's brief, then seven structures

A film starts from a brief, not a vibe. The template below is what to fill in (or hand to the
user to fill in) before the beat map. The structures after it are starting skeletons for the
beat sheet.

## The director's brief

Copy this into the film's folder as `BRIEF.md`. A line you cannot fill is a question for
the user, or a gap SKILL.md § Intake closes first.

```markdown
# Brief: <film name>

## Film in one line
The logline and the one idea. Every decision is checked against it.

## References
- <frame / video / library>: what to keep (pace, palette, transition), what to push (what we do
  harder or differently). Never the subject. See "Naming a look" below.

## Tools and keys
- Skills and scripts: launch-video (render, mix, earshot).
- Keys by name, in `.env`, never pasted: `ELEVENLABS_API_KEY`, `HIGGSFIELD_...`. Budget: <n>.

## Brand or character bible
- Brand: the repo's `brand.css`, the mark's SVG, the voice. Or, for a character: proportions,
  palette sampled from a sheet, expressions, an identity lock that holds across every shot.

## Beat sheet
- b0 to b4 (0:00 to 0:02): the hook. Within 2 s.
- b4 to b12: <move>, <what the viewer sees>. A visual payoff every 3 to 5 s.
- ... end card.
Tempo, song, where the drop lands.

## On-screen text
When lines are huge (the hook, the verdict), when they sit like captions, the longest line, the
language. The composition leaves room for them. Each line is a claim with a source.

## Workflow gates
plan (beat map) → stills → animatic (rough timing, no polish) → full pass → polish → audio →
render. No gate is skipped; the user's yes is needed at: <which>.

## Critique loop
Stills and contact sheet at each gate, scored 1 to 10 on the rubric, the 3 worst problems fixed,
repeat until every score is 8 or higher (critique.md). Scores go in the README.

## Deliverables
- final mp4 per format, the poster frame (png), the contact sheet, the loop check (first frame
  against last, for a loop), the source with a README (beat map, sources, rounds, scores).
```

Effort: write and fill the brief at xhigh for a new film. Fixes and re-renders run at medium.

## Naming a look

Without a reference a film falls back to centred text on a gradient with everything fading in.
Name a look instead of describing it, on one of three rungs:

1. **One frame.** A screenshot of a frame you love. Say what to take (palette, type, grain,
   composition) and what not to take (the subject, the logo).
2. **A video.** The file or link. Extract frames first (`ffmpeg -i ref.mp4 -vf
   "fps=2,scale=480:-1,tile=6x4" contact-%02d.png`) and describe the pacing shot by shot before
   writing any code: what happens, how each shot turns into the next, the camera, the cut rhythm.
3. **A library.** A folder of your own images or past films. Write `style_guide.md` from it
   first (palette, type, texture, motion habits), then build against that guide. A library of
   your own work is a reference no one else can copy.

Give the look and the constraints, not the library: "paper cut-out, 24 fps feel, three colours"
and not "use p5.js". The model picks the technique, unless the film must reuse a specific one.

## A. The product story (16:9, 15 to 30 s)

One user moment, told through the product's real UI, in one continuous take.

- **Ask** (first 6 beats): close on the input or the first screen, about 3x zoom
  with a slow push. The request types on fixed lines with a real keystroke
  rhythm.
- **Act** (a beat): the primary button presses, a colour ripples out of it, and
  one pull-back grows the phone (or window) around the moment.
- **Think** (about 6 beats): the button becomes an object that works on the beat
  (a wok tossing ingredients, a loader drawing, a blob breathing) under a
  shimmering status line.
- **The drop**: a colour floods out of that object edge to edge in about 0.35 s,
  and the result bursts in: cards, a chart, the answer.
- **Resolve** (about 5 beats): the flood shrinks back into the element it came
  from, carrying its content. A confirmation lands with a real click.
- **Outro**: the final button grows into the whole page. It stays a pill until it
  reaches the edges while the camera pushes in, and its label grows to headline
  size and leaves. Two short lines rise word by word, then the page contracts
  into the brand mark and the wordmark wipes out from behind it.

Build notes: a 1920x1080 page and a camera keyed `[t, zoom, x, y]`. Every handoff
is a shared element. Use 8 subframes.

## B. The keynote (1:1, 25 to 30 s, 120 BPM with a drop and a breakdown)

Apple-keynote pacing, and a cursor drives every change with real clicks, drags
and long-presses.

- **Open**: the wordmark squeezes into its own full stop, the dot grows into a
  pill, and a label rises inside it. A click opens an iris onto the first
  visual.
- **Build**: the visual becomes a grid that unfolds like a paper map, reflows
  into a bento, and a click zooms into one tile, landing exactly on the drop.
- **Feature run**: each feature is the previous element changing shape. A word
  melts into a toolbar, a knob becomes a lens, and an orb opens onto the next
  screen.
- **Stage**: pull back into the device, whose bezel grows out of the screen
  edge. A system element (the Dynamic Island, a menu bar) stretches like liquid,
  pinches off and becomes the next surface.
- **Outcome**: one shape keeps morphing through the states of the result
  (Ordered, Printing, On its way, Delivered).
- **Close**: a flood holds black for a beat in the breakdown, contracts into the
  hero object, and the open plays in reverse. The last frame equals the first,
  so the film loops.

## C. The one-shape UI loop (1:1, about 14 s, 120 BPM)

Dribbble-level interface motion: a single element never cuts, and each state is
the same element changing size, radius and colour.

- 8 to 12 states on the beat grid, for example: button → loader → check →
  island → player (play/pause morph) → scrub → volume slider that stretches past
  max → toggle → liquid tab indicator → chart that draws itself → ⌘K → typing
  filters → toast → back to the button.
- The two edges of a tab indicator or toggle knob ride different springs
  (`edges`), so the leading edge stretches ahead of the trailing one.
- The camera zooms so that each state fills the frame.
- The last frame is identical to the first, cursor position and speed included,
  or the loop stutters.

## D. The page that builds itself (16:9, 20 s, 110 to 125 BPM with one drop)

For a new page of a desktop web app. One user worry, answered by the page
assembling around the single data point the worry is about.

- **Hook** (6 beats): two short lines on the app's own canvas, in the user's
  words ("Your fixed rate ends / in 5 months"). The full stop is a dot in the
  product's signal colour and pops last.
- **The dot lands** (2 beats): the words leave, the dot arcs to where that data
  point sits in the product, seen close (about 2.5x). Its bar draws back from it.
- **The page builds** (8 beats, the song's build): the dot's row grows into its
  card, the other rows draw in one per half beat, one pull-back reveals the
  page, the header rises, the key figures pop one per half beat and the status
  lights last. A caption pill names what to look at.
- **The drop**: one camera move to the feature's strongest picture (a grid, a
  chart). It fills in a row per beat. Then one slow push while the verdict line
  rises.
- **The action** (4 beats): the camera travels to the page's primary button, a
  cursor arrives, a click, and the button grows into the whole frame. On that
  colour, the result arrives as objects on springs (three sheets of a PDF).
- **End card**: the objects leave, the colour turns out to be the mark's stroke
  seen from very close, pull back, the wordmark wipes out from behind the mark.
  One line with the accent, the address, and one small line that says which
  part needs which plan.

Build notes: lay the page out about 1.3x its real size in a world layer; the
hook, the dot, the caption pill, the cursor, the growing button and the end card
are screen-space layers above it, tied to the page with `project`.

## E. The chaptered tour (16:9, 30 to 40 s, 110 to 120 BPM with one drop)

For a product, or a feature with three or four parts, each worth one look, on a
landing page or YouTube (a feed gets 30 s at most). The structure of most launch
films people share.

- **The cost** (8 beats): two words rise, then the things the user juggles
  today land one per half beat while their sum counts under them (`tally`).
  The sum turns to the signal colour on the last one.
- **The drop**: everything slides behind one tile (`gather`), the sum counts
  back down to the product's number (`strike` if it is a price), and a `wipe`
  (or a flood, for a brand that bans wipes) opens the first chapter.
- **Three or four chapters** (8 beats each): the headline rises on the left
  with one phrase in the `marker`, the screen on the right builds itself in
  the move that fits its claim (`chain` for a hand-over, `chart` for a result,
  `checklist` for work done, `scan` for a finding). A `wipe` between chapters,
  each on a bar line. Change the side the screen sits on at most once.
- **The proof** (4 beats): one to three numbers, each alone on the frame
  (`stamp`), only ones the product or the repo can show.
- **End card**: the last ground contracts into the mark (craft.md § Handoffs),
  the wordmark rises, one line, the address.

Build notes: the chapters are scenes of one world, a screen apart; the `wipe`
is a screen-space layer above the camera. The film's own handoff sits at the
drop, where the many become the one. At 9:16 the headline goes above the
screen and each chapter loses its second sentence.

## F. The price argument (16:9 or 9:16, 15 s, 100 to 115 BPM)

For a plan, a gate or an upsell: why the flat price is the small number. Read
the repo's pricing source of truth first (plan limits, entitlements); every
figure on screen is one of theirs.

- **The question** (4 beats): one line in the user's words rises, its last
  phrase in the accent ("How many deals do you check / before you buy?").
- **The bill** (8 beats): the per-use price lands one row per half beat on the
  left and its total counts (`tally`); on the right the plan's price stands
  still from the first beat. When the total passes it, the total is struck
  (`strike`) and a line says from which count the plan has paid for itself.
- **What is in it** (8 beats): the plan's tile grows and the rest of what it
  includes pops around it (`bento`), each tile a rebuilt piece of the real
  screen.
- **The other side** (4 beats, optional): one ink scene through a `wipe`, one
  sentence about what waiting costs, and only with a number the user gave.
- **End card**: the price, how it is billed, the address. The end card does
  not contradict the plan (SKILL.md § Hard rules).

## G. The state-list spec (the way to write C or any one-take film)

Write the spec as a state list, not a vibe. One shape, never cut: the element morphs through
UI states, a cursor drives each change with real clicks, drags and long-presses, and the last
frame equals the first so the film loops. Also the structure of the App Store 21:9 header loop
(formats.md).

```text
state 0  pill "Start", 120x48, accent          (= the last state)
state 1  b2:   cursor arrives, press, pill grows to 560x56, a text field, caret blinks
state 2  b6:   field types the request; the pill becomes a loader ring
state 3  b10:  the ring opens into the result card (rows draw in, one per half beat)
state 4  b16:  card shrinks back to the pill "Start", label swaps in: loop point
```

- Each state names its beat, size, radius, colour, label and what the cursor does. The film is
  the in-betweens: one value per property, one spring per change (`springTo`).
- Every change has a cause on screen: the cursor moved to it and pressed. Nothing moves on its own.
- Check the loop with `--stills 0,<duration>`: the two stills must match, cursor included.
- Build notes: the shape in a world layer, the cursor a screen-space layer, real data in every row.

## The copy

- One idea per line and at most five words per line, in the product's own
  voice and language (the repo's rules say which, and which address form).
- Rise the lines word by word. Use the brand face at 88 to 128 px on 1080p.
- A caption is a statement or a question the screen answers, never a feature
  name alone.
- The end card is the mark, the wordmark, one line and one call to action or
  address ("Free on iPhone", the feature's own landing page when it has one).
  Leave out URLs until the domain is live.
