# Director: style and beat sheet

The Director turns the brief into a film's structure: which style, then which beat on which move.

**Gate: the beat gate.** A style is chosen (or the user picked one of 2 to 3 proposals), the beat
sheet exists, and four stills of it (the open, the turn, the product moment, the end card) are
scored and shown. The user's yes here costs a sentence; a change to a finished film costs an
hour. Skip the wait only if the user chose to build through. **Artifact:** the beat map in the
film's README, one line naming the style, and the four scored stills.

## Choose the style

Read the brief and pick from [the styles](../styles/). If it does not settle it, propose two or
three, each with one line of why and what it costs, recommended one first, and wait.

| The brief says | Style | Its QA profile |
|---|---|---|
| High energy, a teaser or trailer, claims in one or two words | [kinetic](../styles/kinetic/STYLE.md) | 40% still at most, no hold over 0.6 s, about 8.5 cuts per 10 s |
| A calm product, one idea, the product itself is the picture, a loop | [one-shape](../styles/one-shape/STYLE.md) | no cuts, no hold over about 1.2 s, the last frame wraps to the first |
| "Show how it works": a real screen, a task, a result | [product-ui](../styles/product-ui/STYLE.md) | no cuts, something visible every 3 to 5 s |
| A person, a moment, a turn; the product comes last | [story](../styles/story/STYLE.md) | 2 to 6 cuts per 10 s, a plate that always moves |
| The App Store header or the search-result tile | [ambient-loop](../styles/ambient-loop/STYLE.md) | muted, seamless, no cuts, a seam like any other frame |

A brand's own rules win: a brand that bans cuts, flashes or 3D rules out `kinetic`. Two styles in
one film (a kinetic hook, then a walkthrough) are two films; make the second a cut from the first
only when the brief says so.

## The reference ladder

A film without a reference falls back to centred text on a gradient with everything fading in.
Name a look on one of three rungs (the Designer carries it into the look book):

1. **One frame.** A screenshot of a frame you love: what to take (palette, type, grain,
   composition), what not to take (the subject, the logo).
2. **A video.** Extract frames first and describe the pacing shot by shot before code: what
   happens, how each shot turns into the next, the camera, the cut rhythm.
   ```bash
   ffmpeg -i reference.mp4 -vf "fps=2,scale=480:-1,tile=6x4" contact-%02d.png
   ```
3. **A library.** A folder of your own images or past films: write `style_guide.md` from it first.

The reference gives structure and rhythm, the brand gives the look, and what the reference does
that the brand bans is translated by [moves.md](../references/moves.md) "Seen and left out". A
reference with a measured energy (still share, holds, cuts) is measured with
`qa.mjs --measure --profile <any qa.json>` and the numbers go next to the film's own.

## The beat sheet

Write the film as a short script first, then cut it to the grid. Every beat block names its move
(`b8 to b12: tally, five cost items, total 196`), chosen by what the beat has to say, from the
style's blocks or [moves.md](../references/moves.md). One handoff per film is not from the
catalog: name it in the beat map as the film's own. A line of the sheet:

```text
b16 to b24 | the drop | Words: FAST. SIMPLE. YOURS. | ground flips | impact on b16 | beat 16 = music drop
```

- Tempo comes from the product (Sound): a calm app wants 70 to 95 BPM, a competent tool 100 to
  125, an energetic one 110 to 130, kinetic 128 to 175.
- The turn lands on a bar line and on the music's drop. Big changes on multiples of 4 beats.
- The hook is inside 2 s. Something new and visible every 3 to 5 s.
- Every on-screen line is a claim with a row in the claims ledger.
- A hook variant (`?hook=problem`), a CTA variant and a format variant are each their own line
  of the sheet and their own approved still, built only after one cut is approved.

## Director's notes

The final cut is viewed by a person and notes come back in the director's words ("too slow",
"that fade looks cheap", "land the zoom on the drop"). Collect a round before touching the film:
every note of one viewing, then one render. Log it in the README:

```markdown
### Round 2 (2026-10-09)

- b14: the pop on the third KPI lands early. Moved to b14.5.
- b30 to b34: end card too short. Held from b32.
```

A note that adds a scene, changes the story or swaps the song is not a revision: it goes back
through this gate (a beat map line and a still, approved) before any code. Patched into a
finished film it breaks the timing of everything after it.

## Effort

`xhigh` for a new film. The first three seconds of a launch earn `max`.
