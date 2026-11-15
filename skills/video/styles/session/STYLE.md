# session

A film about an agent: a chat session is the footage. The session (a prompt, a tool call, the
answer) is a **take**, a JPEG frame sequence shown in one window inside a `seek(t)` film, and the
engine draws everything around it: a hook whose full stop grows into the window, a camera that
frames named regions of the take, a line drawn around what the caption is about, a caption pill,
a "sped up" label where the take plays faster than it was recorded, and an end card on which the
assistants turn in one slot. 16:9 and 9:16, any number of languages, from one `film.html`.

## When to use it, and when not

Use it when the claim is "ask your assistant and the product answers": an MCP server, an API an
agent calls, a plugin. 25 to 30 s, one prompt and one answer.

Do not use it for the product's own screen (`product-ui` rebuilds that, with a pointer), for a
feature with no conversation in it, or for a mood (`story`). Do not drive a third-party client with
a script to record it: their terms rule out automated use, and it shows.

## Where the look comes from

The film's tokens, as CSS variables in `film.html`: `--ground` (the desk the window sits on),
`--window`, `--ink` (the pill and the end card), `--on-ink`, `--accent` (the full stop, the marks),
`--accent-soft` (the serif accent), `--muted` (the end card's note), `--sans`, `--serif`, `--mono`.
The engine falls back to neutral greys and one blue. `spec.mark` is the brand's mark, an SVG path
drawn on the end card as one stroke; `spec.fonts` the faces it waits for.

Keep: the take at its own proportions, one window, one camera move per scene. Push: the full stop
of the hook becomes the window, and the pill becomes the end card, so nothing is cut. Leave out:
device frames, a second window, a client's logo in the take.

## Rules

1. **A drawn session is an illustration and says so** ([session.md](../../references/session.md),
   "Honesty"): the card says "example", a caption names the session as re-enacted, and no line on
   screen or in the voice calls what is shown real.
2. **Sped up is labelled.** A stretch of `sync` that plays at least 1.1 times faster than it was
   recorded shows `copy.<lang>.sped`. `'own'` on an entry takes the label off the stretch that ends
   there: typing faster claims nothing about the product, a shortened wait does.
3. **The camera holds the frame until the window has landed** (`at.window` + 2 beats), then makes
   one move at a time and creeps 3% closer while it rests. `validateSpec` checks both.
4. **One `{agent}` slot or none**, in every language and format, and only with `spec.agents`. The
   style ships no third-party logo: a film passes `{ name, hex?, path }` (a 24 x 24 SVG path) for
   each client it may name.
5. **One caption at a time**, 48 characters at most, 3 beats at least, the first once the window
   has landed. Nothing fades: words rise out of masks, marks are drawn on and off.
6. **A digit on screen has a source.** Every line of the copy is read; any digit needs an entry in
   `spec.sources`. `session.html` holds `session.json` and `card.html` to the same rule.

## Pacing in beats (123.64 BPM: a beat is 0.49 s)

| What | Beats |
|---|---|
| The hook rises, the full stop pops | 0.5, 3.4 |
| The hook leaves, the stop grows into the window | 5.6, 6 to 8 |
| The prompt is typed, the camera on the composer | 8 to 15.5 |
| Send, the tool call: the music's two quiet bars | 16 to 24 |
| The result lands on the drop, the camera on the answer | 24 to 30 |
| The push into the rows, a mark around one column | 33.4, 34.4 to 41.6 |
| The pill floods into the end card | 43.5 to 44.6 |
| The end card: mark, head, the agents every 2.4 beats, the note | 44.6 to 56 |

## The spec

```js
export default {
  bpm: 123.64, beats: 56, music: { file: 'music/471.mp3', source: '...', start: 4.006 },
  at: { hook: 0.5, dot: 3.4, hookOut: 5.6, window: 6, pillOut: 43, flood: 43.5, end: 44.6 },
  sync: [[8, 'promptStart'], [15.5, 'promptEnd', 'own'], [16, 'send', 'own'], [18, 'toolCall'], [24, 'result'], [30, 'answerEnd']],
  cam: [[0, 'frame'], [9.6, 'composer', [0.72, 1]], [18.4, 'tool', [0.8, 1]], [24, 'result', [0.84, 1]], [33.4, 'rows', [0.96, 1.08], 1.8]],
  marks: [[34.4, 'status', 41.6]],                 // [beat, region, beat it leaves]
  agents: [{ name: 'your assistant', path: 'M4 4h16...' }],
  mark: 'M6 3h12...',                              // or { d, viewBox, stroke }
  sources: {},
  copy: { en: { hook: { wide, reel }, captions: [[8.6, 'You ask in your own words'], ...], sped: 'Sped up',
                end: { head: { wide: [['Ask', '{agent}.'], ['*The', '*product', '*knows.']], reel }, note: { wide, reel } } } },
}
```

`sync` names moments and `cam` and `marks` name regions of the take; the take file holds them, so
a new take is a new JSON file and never an edit of the spec. `fill` is one number or `[wide, reel]`:
a narrow take's regions span its width, so a reel fills more.

| Query | Cut |
|---|---|
| none | the first language of `copy`, 16:9, `take.<lang>.json` |
| `?format=reel` | 9:16, and the take is `<name>-reel`: a wide page shrunk to a phone is unreadable |
| `?lang=<code>` | `copy[code]`, `take.<code>.json` |
| `?take=<name>` | another take by name |

`starter/` holds `film.html`, `spec.js`, `session.json`, `card.html` and `take.en.json`,
`take.en-reel.json`. The starter is neutral: an assistant is asked for the week's open tasks.

## How a take is made

1. **The session.** `session.json` beside the film: `at` (the moments in seconds, at the film's
   pace: the beats of `sync` at its tempo), `product` (`name`, an optional 24 x 24 `mark`), `tool`,
   and per language the client's name, the prompt, the lead and the tail of the answer. `card.html`
   beside it is the answer's card: the product's own screen, a `<template data-shape="wide">` and
   one `"reel"`, whose `[data-row]` children appear every 0.35 s, with any `<style>` it needs.
2. **Draw it.** [session.html](session.html)`?film=<folder>&lang=en` draws the wide window (1600 x
   1000 at 2.25, 3600 x 2250), `&shape=reel` the narrow one (500 x 900 at 3). `<folder>` is a path from the server
   root, or `starter`. It is a neutral chat that imitates no client. Its timeline: the prompt typed
   from `promptStart` to `promptEnd`, the press on `send`, the tool chip with a spinner from
   `toolCall` (done 1.05 s before the result), the lead word by word, the card's rows, the tail
   until `answerEnd`, then 1.5 s held.
3. **Render and ingest** it like a recording ([take.mjs](../../scripts/take.mjs)):

```bash
node $K/render.mjs '<style>/session.html?film=/<film>&lang=en' --fps 30 --subframes 1 --out session-en.mp4
node $K/take.mjs <film> session-en.mp4 --lang=en --width=3600
node $K/render.mjs '<style>/session.html?film=/<film>&lang=en&shape=reel' --fps 30 --subframes 1 --out session-en-reel.mp4
node $K/take.mjs <film> session-en-reel.mp4 --lang=en-reel --width=1500
```

4. **The cut sheet.** For a drawn take, the moments are `session.json`'s `at` and the regions are
   where the page puts things (its header comment lists them): copy the starter's take files and
   move a region when the card is laid out differently. For a recording, read them off the sheets
   ([session.md](../../references/session.md), "The cut sheet"), crop to the conversation and blur
   every third-party photo.

The film refuses to build without `take.<name>.json` and its first and last frames. Frames stay out
of git: the film's `.gitignore` lists `takes/` and `voice/`. The unit tests need no frames; a
render does.

## Audio profile

Music at 118 to 128 BPM whose two quiet bars are the wait for the answer and whose drop is the
result (the starter: Mixkit 471, 123.64 BPM, `start` 4.006 puts the drop on beat 24). The effects
follow the session: a pop for the full stop, a whoosh as it grows, a click on send, a tick for the
tool, a hit on the result, a stroke for a mark, a whoosh for the flood, a pop as the end card's mark
closes. `cues.mjs` turns the spec into `cues.json`; a voice-over is added by hand and laid on by
`voice.mjs` ([session.md](../../references/session.md), "Speak"). -14 LUFS, true peak -1 dBTP.

## QA profile (`qa.json`)

product-ui's measure: 320 px wide, a frame is still when under 0.4% of its area moved by more than
8 grey levels, the last 1.5 s left out. Measured on the starter (a draft render, wide): 73% still,
longest hold 3.15 s (the prompt being typed: 18 px type under a creep does not count as motion at
320 px), then 2.7 s as the answer finishes, 2.2 s under the mark, 0 cuts. Targets: still at most
85%, hold at most 3.8 s (the 7.5 beats of typing and a little; product-ui allows 70% and 0.85 s),
no hard cuts, level 5.2, hardware decode, audio required, -16 to -12 LUFS, true peak -1. A hold
longer than the typing is a wait nobody fills: cut beats from it, or give it a caption.

## Gotchas

- Load `templates/kit.js` before the engine; the engine reads `kit` from the page.
- The take file and frames are fetched relative to `film.html`; `take.dir` is relative to it too.
- A pop the scan reports on send or on the result is the session's own: the prompt leaves the
  composer, and the answer's card arrives, in one frame.
- The end card needs room: `validateSpec` asks for the note and every agent to have risen and been
  read before the film ends.
- `--stills cuts` draws the soft handoffs (the window landing, the flood, the end card).
