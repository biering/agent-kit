# Scorecard

Rate every carousel before it ships, on the rendered slides and the caption, not on the plan. Record
it in `carousel.json` as `score`. It ships at **16 or more of 20**, and honesty must be full marks
whatever the total. `render.mjs --strict` fails below that.

```json
"score": { "hook": 4, "slide2": 3, "promise": 3, "oneIdea": 2, "legibility": 2, "cta": 2, "honesty": 2, "platformFit": 2, "total": 20 }
```

| Criterion (key) | Max | Full marks when |
|---|---|---|
| Hook (`hook`) | 4 | The cover alone stops a stranger: one specific promise, a number, a question in their words or a belief turned over. 4 = you would stop for it. 2 = clear but generic. 0 = a title. |
| Slide-2 hook (`slide2`) | 3 | Platforms show a carousel again from slide 2, so slide 2 works as a second cover: its own claim, no "as I said". 3 = it would stop someone who never saw slide 1. |
| Promise kept (`promise`) | 3 | The slides deliver exactly what the cover promised: the number, the list length, the answer. 0 = bait. |
| One idea per slide (`oneIdea`) | 2 | Each slide says one thing and earns the next swipe (a tease in the swipe hint, numbering, an open question). |
| Legibility at phone size (`legibility`) | 2 | Read on a phone held at arm's length: type large, contrast high, no line that needs zooming, the renderer reports nothing. |
| CTA clarity (`cta`) | 2 | Exactly one action, said once, matching the intake's action and the landing page. |
| Honesty (`honesty`) | 2 | Every claim and number is true and has a source; every image shows what it claims; no invented customer, review or urgency. Anything less than 2 stops the carousel. |
| Platform fit (`platformFit`) | 2 | Format, length and caption suit the platform: 9:16 central band for TikTok, searchable caption, 4 to 8 hashtags, alt text. |

Add a `notes` string to `score` for the weakest criterion and what you changed after scoring.
Score again after a rework; keep the last score.

## Hooks that work, to vary across the three covers

Three covers differ in the hook, not the look. Pick three types: a question in the user's words, a
true number, a belief turned over, a mistake, a transformation, an effort ("in three taps"). Render
all three (`out/covers/<id>.png`), score each cover as the hook, set `cover` to the winner.
