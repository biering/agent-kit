# product-ui

A real UI walkthrough: the product's own screen rebuilt in HTML at true proportions, a pointer that
causes every change, springs on everything that moves, a camera that follows the task, one caption
at a time. One take, light 2D, one accent. The page is the film's own `film.html`; the spec is a
list of steps on the beat grid that drives it.

## When to use it, and when not

Use it when the claim is "this is how it works" and a screen shows it: a form, a flow, a checklist
that fills, a result, a second page. 15 to 30 s, one task from start to result.

Do not use it for a feature with no screen worth showing (an API, a price, a promise: `kinetic` or
`story`), for a mood or a name (`story`, `one-shape`), for a touch gesture (the pointer is a mouse,
not a finger), or when the film must show the real product's pixels (this rebuilds, it never records).

## Where the look comes from

[craft.md](../../references/craft.md) sets it: 2D, light, one accent, the product's own tokens,
built about 1.3x so the smallest label that matters is 20 px on the 1080p frame, the caption in a
pill. [moves.md](../../references/moves.md) gives the moves (`typed`, `pointer`, `checklist`, `edges`,
`strip`) and the film they come from: a pointer that finds a target and clicks it.

Keep: the product's tokens, its icons (`templates/icons.js`), its real labels and numbers.
Push: the pointer is the only actor, so a press, a typed line or a toggle sits before every change;
the camera never parks (it creeps in about 1% a second between moves), so a held shot still lives.
Leave out: cursor trails, glows, device frames, 3D tilts, dark grounds, anything that fades.

## Rules

1. Every change has a cause the viewer sees. `validateSpec` rejects a result with no press, a type
   with no click on its field, a click before the pointer arrives, a run more than 3 beats after its press.
2. Nothing fades in. A knob stretches, a dot floods and draws its check, a card grows out of the row
   above it, the pill changes width, rows and labels rise out of a mask.
3. No cuts. A page change is the old page leaving up and the new one rising; `cuts` is empty.
4. Text is never scaled by the film: the camera scales the whole layer, a press moves a button 5 px
   (`translateY`), a spinner rotates, a counter is set. Scaled-down text fails `--purity`.
5. One caption at a time, 44 characters at most, 3 beats at least on screen. It says what to look at.
6. A digit on screen has a source. The page's text, a typed line and a caption are all read; any digit
   needs an entry in `spec.sources` naming where it comes from. The starter shows none.
7. Never crop through a line of text. A zoom of 1.2 or less shows the whole 860 px window; from
   about 1.4 the frame can sit under the header. In between, `at: [fx, fy]` on the camera step picks the part of the target at
   the middle of the frame. The frame never shows past the window.
8. Nothing stays quiet for more than 5 s: `validateSpec` measures the gaps between steps.

## Pacing in beats (114 BPM: a beat is 0.53 s)

| What | Beats |
|---|---|
| Pointer between two targets | 2 (1.5 at the least) |
| A press, then its effect | 0 to 0.25 |
| Typing a 45 character line | 12 cps, 6.7 beats; keystrokes are placed per character |
| A camera move | 2.5 to 3, one at a time |
| Checklist: rows rise, first check, then a row every | 0, 1.5, 1.25 |
| A result landing, a page switch | 2.5 each |
| A caption on screen | 5 to 7 |
| The end card, the camera at rest | 3 to 6 (validated) |

## The scene kit

The page marks its parts with `data-ui` and an `id`; the steps name the ids in `spec.targets`.

| Part (`data-ui`) | Behaviour | The film's CSS styles |
|---|---|---|
| `screen` | the product window; the camera never shows past it | the window |
| `field` + `data-ph` | typed text on one line, caret, focus ring | `.ph`, `.val`, `.caret`, `[data-state=focus]` |
| `button` + `data-needs="#field"` | dips on a press; off until that text is typed, then lifts | `[data-state=off\|on\|pressed]` |
| `toggle` with a `.knob` | knob edges stretch, a `.fill` follows | `.fill`, `.knob`, `[data-state]` |
| `tabs` with `[data-tab]`, `panels` with `[data-panel]` | indicator `.ind` slides; old page leaves up, new rises | `.ind`, `[data-state=on]` |
| `checklist` of rows with `.dot` and `.lbl` | rows rise, a spinner, a flood and a drawn check | `.spin`, `.fill`, `[data-state=hidden\|pending\|active\|done]` |
| `result` with `.rise` and `.pop` children | grows out of `from`, pulling out from behind it | the card's look |
| `scroll` | its content moves on a `scroll` step | the clip |

Steps (times in beats, on quarter beats): `move {to, at?, dur?}`, `press`, `type {into, text, cps?}`,
`toggle {target}`, `switch {tab}`, `scroll {by, in?}`, `camera {to, zoom, at?, dur?}`, `caption {text}`,
`run {target, rows, every?}`, `result {target, from?}`. The last step is a camera move.

## The spec

```js
export default {
  bpm: 114, beats: 36, pointer: 'arrow',           // 'dot' for a strict brand
  music: { file: 'music/568.mp3', source: 'https://assets.mixkit.co/music/568/568.mp3', start: 20.927, gain_db: -6, fade_out: 0.4 },
  sources: {},                                     // 'text on screen with a number': 'where it comes from'
  targets: ['#form', '#ask', '#start', '#checks', '#r4', '#result', '#tab-reports', '#list'],
  steps: [
    { beat: 0, do: 'caption', text: 'Ask in plain words' },
    { beat: 0, do: 'camera', to: '#form', zoom: 1.45, at: [0.5, 0.6], dur: 3 },
    { beat: 1, do: 'move', to: '#ask', at: [0.5, 0.9], dur: 2 },
    { beat: 3, do: 'press' },
    { beat: 3.5, do: 'type', into: '#ask', text: 'Sum up this', cps: 12 },
    // ... move to #start, press, then
    { beat: 16.5, do: 'run', target: '#checks', rows: 4, every: 1.25 },
    { beat: 22.25, do: 'result', target: '#result', from: '#r4' },
    { beat: 29.5, do: 'camera', to: '#list', zoom: 1.4, dur: 2.5 },   // the end card
  ],
}
```

`starter/film.html` is the page (a neutral form, checklist, result and second tab, tokens in one CSS
block the Designer replaces) and `starter/spec.js` the full 36 beat film, 18.9 s.

## Audio profile

Music at 105 to 115 BPM with no drop and a flat arc (bars within 2 dB), sound on frame 0, a 0.4 s
fade as the end card settles. The effects carry the film: a click per press, a keystroke per typed
character (four recorded presses chosen by a hash of the character's place; `mix.py` cannot trim a
cue, so a typing loop would run past the line), a tick per row, a pop and a chime for the result, a
whoosh per camera move. `cues.mjs` turns the spec into `cues.json`; `audio.json` holds the kit and
the measured pick (Mixkit 568, 114.0 BPM). Mix at -14 LUFS, true peak -1 dBTP (the starter: -14.2
and -1.1). The bed is mid-heavy, so over the bed in the 30 ms of a cue a key adds only 1 to 2 dB
overall; above 2 kHz, where the bed has almost nothing, a tick adds 11 dB, a key 15 to 20, a click 29.

## QA profile (`qa.json`)

Measured on the encoded file at 320 px wide, the last 1.5 s left out. A frame is still when under
0.4% of its area moved by more than 8 grey levels. Measured on the starter: 54% still, longest
hold 0.63 s, 0 cuts. Targets: still at most 70%, hold at most 0.85 s (about 30 and 35% above), no hard cuts,
level 5.2 or lower, hardware decode, audio required, -16 to -12 LUFS, true peak -1.

Why 0.004 and not the 0.002 of the calm styles: the camera's creep alone moves about 0.23% of the
area, so at 0.002 it counts as motion and the hold stays under 0.2 s whatever the UI does. At 0.004
a hold is a stretch where only the creep moves, which is the failure to catch. Typing is too small
at 320 px to count, so the spec's own 5 s gap rule covers it.

## Formats

16:9 1920x1080 is the starter. `spec.size` sets any other: the pointer, ring and pill scale with
`min(w, h) / 1080`, and on a tall frame the pill rises 340 px above the bottom, clear of the platform
UI. The page needs its own layout (columns stack: form over progress) and its own zoom values;
the starter laid out at 1080x1920 held with the window at zoom 1.0. Render each with the same stills,
`--purity` and the phone sheet (`--tile 360`).

## Gotchas

- Load `templates/kit.js` before the engine; the engine reads `kit` from the page.
- `.rise` elements are wrapped in a clipping block: space them with `gap`, not margins.
- The result's colours and radius are read from `from` and the card when the film is built; give
  both a steady look. The card is taken out of flow and a placeholder keeps its place.
- Put `at` on a `move` so the pointer does not cover the label it clicks.
- A tab needs an `id` to be pressed. A target inside a panel is measured with every panel in place.
- Typed text goes on one fixed line; the engine throws when it is wider than the field.
- A pop shows as small text in a still while it is under full size (a 15 px chip mid-spring): not a bug.
- `--stills cuts` has nothing to draw; use `--stills b<n>` at the handoffs (a press, a result, a switch).
