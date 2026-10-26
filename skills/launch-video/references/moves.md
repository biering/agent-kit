# Moves: the catalog a beat map is written from

A move is one thing the picture does to say one thing. A beat map names a move
for every beat block, from this file, before any of it is built. What a move
looks like is in [templates/moves.html](../templates/moves.html), which plays
all of them, four beats each, in the order of the table:

```bash
node $K/render.mjs <repo>/.agents/skills/launch-video/templates/moves.html --stills every:1 --out moves/ --contact moves.png
node $K/render.mjs <repo>/.agents/skills/launch-video/templates/moves.html --serve     # scrub it
```

Copy a cell's `build` function into the film and swap in the product's screen
and numbers. The functions it calls are in [templates/kit.js](../templates/kit.js).

## How to choose

- **Start from what the beat has to say**, the left column, not from the move
  you like.
- **Five to seven moves in a 20 s film.** `count`, `pointer` and the caption
  pill may come back; every other move appears once. The same move twice is a
  template showing.
- **One handoff in every film is its own.** The catalog is vocabulary. The
  moment people remember (a full stop that becomes a data point, a marker that
  becomes the citation) is drawn for that film, by the rules in
  [craft.md](craft.md) § Handoffs. A film made only of catalog moves is a
  slideshow with good easing.
- **The brand is a filter, not a suggestion.** A strict brand (no fades, blur,
  shadow, 3D or glow, one accent, functional colours reserved for status) uses
  the alternative in the last column. The repo's notes say which of its brands
  are strict.

## The catalog

| Id | Reach for it when the beat says | What happens | Beats | Sound | Strict brand |
|---|---|---|---|---|---|
| `tally` | "this adds up" (costs, tools, documents, hours) | Items land one per half beat, a little rotated; the total under them counts with each one and turns to the signal colour on the last | 3 to 4 | a pop per item, quieter each time | the total stays ink: red is for severity |
| `gather` | "and this replaces all of it" | One tile pops in the middle; the scattered items straighten and slide in behind it | 1 to 2 | whoosh | as is |
| `marker` | the one phrase of a headline that carries it | The words rise out of their mask line; a bar in the accent grows from the left behind the phrase | 2 | swoosh | the brand's own marker, then hand it on |
| `typed` | a person asks, searches, names something | Text types on a fixed line at 14 to 18 characters a second; the caret stands while typing and blinks after | 2 to 3 | one keystroke loop, not a click per letter | mono only for what a document says |
| `pointer` | a person decides (the click the feature exists for) | The pointer travels a shallow arc, arrives eased, the target dips, a ring grows and thins | 2 | click on the press | an ink dot instead of an arrow, same ring |
| `wipe` | a new chapter, a change of ground | A slanted band in the accent crosses the frame; the scene under it is swapped while it covers everything; a second, lighter band follows 0.07 s behind | 1 | transition | a flood instead (0.4 s, farthest corner) |
| `chain` | "this leads to that" (a pipeline, a hand-over, cause and effect) | Nodes pop left to right, a line draws from each to the next, then a dot rides the line and each node it reaches lifts and takes the accent | 3 to 4 | pop per node, chime on the last | as is |
| `chart` | a number over time, or the proof | The line draws left to right with its area uncovered behind it; the key figures above count to their value over the same time | 3 to 4 | a rising swoosh | as is |
| `checklist` | work being done for the user | Rows rise; one dot per beat turns green, swells and draws its check | 1 per row | click per check | the brand's status dot |
| `scan` | "it reads all of it and finds the one line" | A thin line travels down a rebuilt page; as it passes the finding, that row takes the accent, a ring marks it and a chip names it | 3 | a low sweep, a pop on the find | as is |
| `race` | faster, cheaper, fewer steps, against the old way | Two bars start together on the same clock; ours is done at once, the other is still running when the scene leaves | 3 to 4 | chime when ours finishes | as is |
| `strike` | a price, a duration or a count that just got smaller | A line in the signal colour crosses the old value; the new one rises beside it in the accent | 2 | swoosh, then pop | the line is ink |
| `edges` | switching a view (tabs, a toggle, a segmented filter) | The indicator slides to the next stop; its leading edge rides a faster spring than its trailing edge, so it stretches on the way | 1 per switch | click | as is |
| `bento` | "all of this is in it" (a plan, a report, a feature set) | Tiles pop one per half beat, the biggest first, each from its own centre | 3 | pop per tile | as is |
| `strip` | three or four equal things (question types, steps, plans) | Cards stand a frame apart in the world; the camera rests on one, travels to the next on the beat | 1 per card | whoosh per move | as is |
| `stamp` | proof in single words or single numbers | A band in a brand ground sweeps in and stays; one word rises on it; the next band covers it a beat later | 1 per word, at most 4 | a hit per word | one ink flood, one word |

Already in the kit and in every film, so not repeated above: words rising out of
a mask (`riseWords`), a chip popping on a spring (`pop`), the caption pill whose
width springs to each label (`springTo`), and the handoffs in
[craft.md](craft.md) (flood → screen, button → page, page → mark, full stop →
data point, a card growing from its own content).

## Rules that come with the moves

- **`count` is honest or it is not used.** It counts to a number the product
  shows or the repo can prove (SKILL.md § Hard rules). `race` needs both times
  measured the same way, and the film's README says where.
- **Counting text is set, never scaled.** Set `textContent` in tabular figures
  (`font-variant-numeric: tabular-nums`) and let the motion blur smear the
  digits. A total that should "land" moves or changes colour; scaling text that
  is changing fails the purity check.
- **A press moves the button, it does not scale its label** (`translateY` on
  `bump`), for the same reason. `bump` is looser than a landing spring on
  purpose and is only ever multiplied by a few pixels or percent; a strict brand
  passes `{ damp: 0.7 }`.
- **`wipe` hides the swap, and only for a tenth of its length.** Swap at the
  `covered` time it returns, not a frame later, and clear the stage first
  (craft.md § Handoffs).
- **Every stroke `draw` draws needs `pathLength="1"`** (the lines of `chain` and
  `chart`, the check of `checklist`), or it comes out as a dotted line.
- **`scan` runs over a rebuilt page**, with the real finding on the real line.
  A scan over grey bars is the demo, not a film.
- **`stamp` is the only move that changes the ground every beat.** Keep it to
  one run per film, after the drop, and never use it for claims that need a
  sentence.

## Where the moves come from

Eight public films on prompt-motion.com, picked on 2026-10-07, watched frame by
frame and written up in our own words. No prompt and no code was taken; each
film belongs to the person who posted it.

| Film | What it does well | Taken from it |
|---|---|---|
| Bento.surf product video, 40 s | Chapters: a cost adds up, collapses into the product, then one feature per chapter with the headline left and the screen right | `tally`, `gather`, `marker`, `wipe`, `chain`, `chart`, `checklist`, brief E |
| An API key promo, 15 s | A counter that runs away, then one object replaces it | `stamp`, the runaway `count` |
| A product intro synced to music, 15 s | One serif accent, a device that fills, very few elements | The restraint; its particle dissolves are left out |
| A browser automation skill launch, 23 s | A pointer that scans a page, finds the target and clicks it | `pointer`, `scan`, `typed`, `stamp` |
| An engineering showreel, 24 s | Two runs side by side on one clock; a row of cards the camera travels | `race`, `strip` |
| A motion design showreel, 15 s | A dashboard assembling tile by tile | `bento` |
| A pricing promo, 15 s | A price argument: a question, a bill that grows, one flat price, what is in the plan | `strike`, `tally`, brief F |
| Shape morphing through UI states, 14 s | One shape, never cut | `edges`; the rest is brief C |

## Seen and left out

| In the references | Why not here | Instead |
|---|---|---|
| Hard cuts on the beat between colour grounds | craft.md rule 2: no cuts | `wipe`, `stamp`, a flood |
| Content swapping with a short blur | blur-ins are banned, and blurred text fails the purity check | a mask per label, own enter and exit times |
| Particle dissolves, dither wipes, spark bursts | read as a showreel, not as a tool | a flood, or the shape itself changing |
| A tilted 3D wall of cards, 3D carousels, floor reflections | breaks "2D, light, one accent"; strict brands ban 3D | `strip`, or a pull-back over a flat grid |
| RGB split, glows, halftone blobs in the corners | decoration without a claim | nothing |
| A dark canvas for the whole film | the product is light | one ink scene, entered through a `wipe` |
| Five colours in one film | one accent | the brand's accent plus its functional colours |

## Adding a move

A move earns a row when a second film needs it. Then, in one change: a pure
function in `kit.js` if it has real logic (a two-line recipe stays in the
cell), a cell in `moves.html` whose id is the row's id, the row here, and
`--purity` on `moves.html`. The table's ids and the cells' ids stay the same
list, in the same order.
