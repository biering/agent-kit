# Story: a person, a moment, a turn, a payoff, then the product

A short (20 to 45 s) that tells one small story with pictures and a few lines of text, and shows
the product only on the end card. The camera pushes and pans every picture; a few hard cuts land
on the beat; one moment changes the film.

## When to use it, and when not

Use it for a launch where the feeling is the claim: relief, time given back, a thing nobody sees
done; a feature that is a result a person has (the invoice that sends itself, the night that ends
earlier). It needs a face or a place to show, or a few pictures the brand can stand behind.

Do not use it for a feature tour, a changelog, a claim needing more than five words at a time, or
numbers carrying the film (use kinetic). The product's screens are not the pictures. With no
pictures at all it has nothing to push: the starter's CSS plates are stand-ins.

## Where the look comes from

References give structure and pace, never the subject (references/briefs.md, "Naming a look").

- Keep, from the narrated brand film (the Apple holiday spot "Misunderstood" is the one to watch):
  the order of situation, misreading, turn, payoff, product, and a product that appears last.
- Keep, from documentary camerawork over stills (the Ken Burns move): a picture is never held; it
  is pushed in, or panned, from its first frame to its last.
- Push: neighbouring shots differ in brightness, so a cut reads as a cut; the turn is one object
  changing shape (a lamp's glow grows into a morning), not a transition.
- Leave out: a UI screenshot as a picture, stock footage, a voice-over by default, a fade.

The ground colour and one accent carry the brand: the starter has a night ground, paper, an amber
accent and ink; replace them with the brand's tokens. A serif carries the lines (the voice), a sans
the wordmark and the button; the starter uses system faces, the Designer role swaps in the brand's.

## Rules

1. Five parts in order: hook (a situation and a line inside 2 s), setup, turn, payoff, end card.
   `validateSpec` fails a film with no line inside 2 s, no turn or two, or no end card.
2. One turn, on a bar line (a multiple of 4 beats) where the music lifts. Kinds: `flood` (a colour
   grows out of an object and becomes the next picture), `flip` (a cut, a flash of the accent),
   `hit` (a cut, a push, a white flash).
3. Hard cuts only on a whole beat, 2 to 6 per 10 s before the end card; a cut-in and a cross-cut count.
4. Lines are at most five words, each on a beat or a half beat, in the product's voice (what it would
   say to this person, plain, no slogan), one line at a time. A finished line stays 0.8 s and leaves
   in 0.35 s: the validator checks it.
5. A picture is pushed, panned and swayed the whole time. Never a hold over 0.8 s.
6. Nothing fades: words rise out of a mask and leave through its top, the button grows, the turn is
   a shape. Numbers on screen come from the product or the user: any digit in a line, title or the
   card needs an entry in `spec.sources` naming where it comes from.
7. A generated picture is checked at 100% for makers' logos and brand marks (see Pictures); a plate
   with `src` and no `checked: true` fails validation.

## Pacing in beats

At 100 BPM a beat is 0.6 s. The starter: hook b0 to 8 (window, the moon on b5), setup b8 to 24 (desk,
the screen b12, the cup b16, the lamp b20), turn b24 (a 1.5 beat flood out of the lamp), payoff b26
to 34 (morning, the cup b30), end card b34 to 40. First word at beat 0.5; a line every 3 to 6 beats.

## The scene kit

| Block | What it draws | Main fields |
|---|---|---|
| `Plate` | A picture or CSS plate under a camera: push, pan, sway, parallax between CSS layers, optional cut-ins | `plate`, `push [from, to]`, `pan [[x,y],[x,y]]`, `cutIns [[beat, scale, [x,y]]]`, `tone`, `shade` |
| `Line` | Words on beats, rising out of a mask, over whatever scene is current. Not a scene: it is `spec.lines` | `at`, `words [[word, beat, tone?]]`, `place low\|mid\|high` |
| `Title` | A card of up to five words on a ground, pushed slowly | `text`, `ground`, `color`, `start`, `every` |
| `Turn` | The one moment: draws the plate before and the plate after, and the change between them | `kind`, `origin`, `dur`, `color` |
| `Card` | End card: mark (the brand's SVG via `spec.logo`), wordmark, one line, one button | `wordmark`, `line`, `cta`, `small`, `ground` |

A Turn draws the Plates either side (`flood` needs one before and after, `flip` and `hit` one after)
on their own cameras, so the handoff has no jump.

## Spec shape

```js
export default {
  bpm: 100, beats: 40, fps: 30, palette: { bg, paper, accent, ink },
  music: { file: 'music/606.mp3', source: 'https://assets.mixkit.co/music/606/606.mp3', start: 0.422 },
  sources: {},                                   // 'text with a digit': 'where the number comes from'
  plates: [{ id: 'desk', src: 'assets/desk.png', prompt: '...', reference: 'assets/ref.png', checked: true },
           { id: 'window-night', css: [{ css: 'background:linear-gradient(...)', depth: 0 }, ...] }],
  scenes: [
    { block: 'Plate', at: [0, 8], plate: 'window-night', push: [1.05, 1.22], pan: [[0.42, 0.5], [0.6, 0.46]], cutIns: [[5, 2, [0.74, 0.27]]] },
    { block: 'Turn', at: [24, 26], kind: 'flood', dur: 1.5, origin: [0.5, 0.5] },
    { block: 'Card', at: [34, 40], wordmark: 'PRODUCT', line: 'Gets to it first.', cta: 'Get it today' },
  ],
  lines: [{ at: [0, 4], words: [['Still', 0.5], ['at', 1], ['it.', 1.5]] }],
}
```

Scenes tile the film on whole beats. `push` scales are 1.04 to 3 (under that a plate has no bleed
for the sway). A cut-in is a hard cut to a tighter crop of the same picture that keeps pushing and
keeps the scene's pan speed; a fourth value `[x, y]` says where it ends. `css` layers run back to
front in the order written (their `depth`, 0 far to 1 near, only sets how far they travel).
Check a spec without a browser: `validateSpec`, `cueSheet`, `cutBeats`, `pacing` from spec.js.

## Pictures: how they are made and checked

Three to six pictures. Supplied photos come first; generated ones come from the Higgsfield MCP,
priced first and approved by the user:

1. Write each prompt and pick the one reference that holds the look (a mood frame, a person's sheet);
   the same reference in `medias` on every call keeps the set one world.
2. `generate_image` with `params: { model, prompt, aspect_ratio: '16:9', medias, get_cost: true }`.
   Show the price for the set, wait for the yes.
3. One dry run of the hardest picture; adjust the prompt; then the rest (a reel gets its own set at
   9:16: a plate is made per format, never cropped).
4. Open every picture at 100% and look for makers' logos, brand marks, readable text, a face that
   resembles a real person. Remove it, regenerate, or cover it with `shade`. Only then write
   `checked: true`. The spec records `prompt` and `reference`, so a picture can be remade.
5. Pictures sit in the film's folder, out of git if the model's terms ask for it.

## Audio profile

Calm music at 80 to 110 BPM, a quiet intro of 4 to 6 bars and one lift on the turn's bar line. The
starter's track (Mixkit 606) measures 99.95 BPM, an intro about 21 dB per bar and a step of 8.5 dB
on bar 7, which `music.start` puts on beat 24; it plays under the end card and fades over 0.5 s.
Effects are soft: a room tone under the film, an air swell peaking on each scene cut, a swish on
each cut-in, a riser into the turn and a deep hit on it, a chime as the wordmark lands. Mastered
at -14 LUFS, -1 dBTP. Voice-over is optional and never run unasked (audio.json). `cues.mjs` turns
the spec into `cues.json`.

## QA profile (qa.json)

Measured on the encoded file at 30 fps (`render.mjs --fps 30 --subframes 4`, then `qa.mjs <video>
--style story`). The starter, mixed with its music and effects, passes all nine checks.

| Number | Starter | Target | Why |
|---|---|---|---|
| `stillDelta`, `stillShare` | 6, 0.002 | | A frame is still when under 0.2% of its pixels moved by over 6 of 255 grey levels, the sensitive reading a slow push needs. At 4 the parked draft (a lamp shot whose only edge was a soft glow) read 0.2% still, noise counted as motion; at 6 it read 9.7%. |
| `endCardSeconds` | 3.7 | card + 0.1 s | The card (3.6 s) may rest; the extra 0.1 s keeps the cut into it out of the cut count. |
| still frames | 0.0% | 4% or less | The parked draft measured 9.7%; a calm film with a few flat seconds stays under 4%. |
| longest hold | 0.00 s | 0.8 s or less | A plate pushes the whole time. The parked draft held 1.23 s. |
| cuts per 10 s | 2.5 | 2 to 6 | 5 cuts seen in 20.3 s. The spec counts 6; the cut-in between two bright morning shots is not seen. |
| loudness, peak | -13.8 LUFS, -1.3 dBTP | -16 to -12, -1 | Mastered at -14 and -1. Level 5.2 and the Mac decoder as in every style (it refuses level 6). |

CSS plates are the worst case for stillness (smooth gradients have few edges to move); a photograph
measures lower. Do not add grain to pass a check.

## Formats

`?format=wide` (1920x1080), `square` (1440x1440), `reel` (1080x1920) in the starter's film.html. Type
scales with the shorter side, lines move up in 9:16 to clear the platform's interface, CSS plates
stretch. A picture is made per format and `pan` and `cutIns` written again for each. Check each
format with stills, `--purity` and `--tile 360`.

## Gotchas

- QA sees a cut only when about half the frame changes by more than 24 grey levels and the mean
  brightness jumps by 18 (or most of it changes at once). Two dark shots, or two bright, read as
  one push: alternate light and dark. `cutBeats(spec)` is what you designed, QA what it sees.
- A tight shot needs a pan. A push alone moves a feature near the middle by under a pixel a frame.
- `css` layers stack in the order written, not by `depth`.
- A bright plate behind a line fails the eye before a check: raise `shade` or move `place`. The
  scrim is dark by default, light on `tone: 'light'`.
- The Turn's `origin` is where the object stands in the last frame before the turn (0 to 1). Look at
  stills at the turn and a quarter, half and whole beat after.
- Text leaves upward through a mask, never by shrinking (a shrinking glyph fails `--purity`).
  `src` is a file in the repo; a URL fails validation (a render must not need the network).
