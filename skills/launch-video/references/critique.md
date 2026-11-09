# The scored critique loop

The visual twin of earshot (roles/sound.md § The listening gate), run by the Editor (roles/editor.md)
next to the measured checks of `qa.mjs` (qa.md). earshot scores what you cannot
hear; this scores what you would otherwise only claim to have seen. A model that reads images
can look at its own frames, and a film that went through three scored rounds is the difference
between a first try and one worth posting.

## When

At every gate: the four stills (the Director's beat gate), the full pass (from the contact sheet and
the phone sheet of the render), and the final (the encoded mp4, not the draft). A fix or a
re-render that touches a beat re-scores that beat.

## How

1. Render the stills and a contact sheet (`--stills every:2 --contact contact.png`), plus the
   phone sheet (`--tile 360`) and the `cuts` sheet.
2. **Look at them.** Open the images; do not score from the code or from memory. A score
   without the still it is about, named by time or beat, does not count.
3. Score every beat 1 to 10 on the rubric below. A beat that has a handoff is scored on the
   `cuts` stills too.
4. Write down the 3 worst problems of the round, each as `beat: what is wrong, what to change`.
   Three, not a list: the worst three are the ones that move the score.
5. Fix those, re-render the affected beats, score again.
6. Stop when every score is 8 or higher. Two rounds that move nothing mean the problem is the
   beat map, not the code: go back to the Director's gate with a new beat line and still.

## The rubric

| Criterion | 8 or higher means |
|---|---|
| Hierarchy and focal point | One thing is read first; the eye never has to choose between two |
| Motion feel | Mass, a small overshoot where things land, no linear slide, no pop that lands off the beat |
| Type | Brand face and scale, no widows, lines break where the meaning does, nothing clipped |
| Brand fidelity | Every colour, radius, icon and the mark come from the brand file; nothing is invented |
| Legibility at phone size | The smallest label that matters reads on the `--tile 360` sheet |
| Payoff cadence | Something new and visible every 3 to 5 s, the hook inside 2 s |

## The defect list

A fixed list, looked for on every beat before the scores are written, because a defect hides in
the total. Each is found on a still or a pair of stills; a beat with one cannot score 8 or higher
until it is fixed.

| Defect | How to see it | The usual fix |
|---|---|---|
| Overlapping text | two labels share pixels in a still taken at the beat's settle, and at its enter and exit, where the old one is still leaving | own enter and exit times per label; move the exit earlier |
| Corner labels | a small label parked in a corner that says nothing about what is beside it | put the label next to what it names, or cut it |
| Blurry scaled type | open the still at 100%: edges soft on text that the camera or a transform scales | size the text at its final size, no `will-change`, never scale it up (craft.md) |
| Dead beats | a beat in which nothing new appears or moves for longer than the style's hold limit, or whose reason (the Director's line) you cannot say | give it its move, or cut it and close up the grid |
| Sliding where it should ease | two stills a few frames apart show a move at equal steps, then stopping dead | a spring or an ease-out; mass and a small overshoot |
| Stutter at the loop point | on a loop, the last frame and the first are not neighbours: the motion jumps or restarts | whole cycles per loop, the wrap step compared in `qa.mjs` and the two frames looked at |

Record the list in the block below as a `Defects:` line: the ones found, or `none found`.

Be a harsh scorer. 7 is a film that is fine, and fine is what a default looks like. A score of
10 needs a reason written next to it.

## Record it

In the director's notes (README), one block per gate and round:

```markdown
### Critique, final, round 2 (2026-10-29)

| Beat | Hierarchy | Motion | Type | Brand | Phone | Payoff |
|---|---|---|---|---|---|---|
| b0-b6 hook | 9 | 8 | 8 | 9 | 8 | 9 |
| b6-b14 build | 8 | 7 | 8 | 9 | 6 | 8 |

Defects: b9 overlapping text (label A leaves late). Fixed.
Worst 3: (1) b9 KPI labels 11 px at phone size, enlarge the page 1.3x. (2) ...
Fixed: (1) ... Still open: none, all scores 8 or higher.
```

A score under 8 that ships needs a line saying why (a deliberate choice, a brand constraint),
the same rule as a flagged earshot line.
