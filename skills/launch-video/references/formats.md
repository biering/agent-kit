# Every format from one timeline

One `film.html`, one score, one data block, one beat map. A format changes only where things
sit. SKILL.md § Formats and variants has the query string and `--matrix`; this is how the scenes
are written so that holds for any size.

## Write against `layout(w, h)`, never fixed pixels

```js
const FORMATS = {
  wide: [1920, 1080], square: [1440, 1440], reel: [1080, 1920], header: [3840, 1646],
}
const [W, H] = FORMATS[new URLSearchParams(location.search).get('format') || 'wide']

// Every position, size and camera key comes from here. No scene hard-codes a pixel.
function layout(w, h) {
  const tall = h > w, ultra = w / h > 2
  const u = Math.min(w, h * (ultra ? 1.6 : 1)) / 1080     // the unit: type and gaps scale with it
  return {
    u, tall, ultra,
    safe: tall ? { top: 220 * u, bottom: 340 * u } : { top: 0, bottom: 0 },  // platform UI in 9:16
    hero: { x: w / 2, y: tall ? h * 0.42 : h / 2 },
    columns: tall ? 1 : ultra ? 3 : 2,
    zoom: tall ? 1.4 : ultra ? 0.9 : 1.1,                  // camera rest, 1 = the page at 1x
  }
}
const L = layout(W, H)
```

Reframe, never crop. A 16:9 render cut to 9:16 loses the sides of the screen and keeps a third
of the type. Re-lay the page out (SKILL.md § Formats: 9:16), break the lines again, give each
section the frame to itself, and write the camera keyframes per format. The words, numbers and
timing are the same in every cut. Check every format with the same stills, `--purity` and the
phone sheet (`--matrix` takes all three).

| Format | Size | Where |
|---|---|---|
| 16:9 | 1920x1080 | X, YouTube, landing, LinkedIn |
| 1:1 | 1440x1440 | feed |
| 9:16 | 1080x1920 | Reels, TikTok, Stories |
| 21:9 | 3840x1646 | the App Store header loop |

## The App Store 21:9 header loop

A silent loop above the fold of the product page.

- **3840x1646**, **5 to 30 s**, seamless: the last frame equals the first, so it never jumps
  when it wraps. Build it as a state-list film (briefs.md § G): one shape, never cut.
- The frame is 2.33:1: lay it out in three columns or one wide scene with the focal point
  near the centre third; the store crops the edges on some devices.
- No audio, no end card with a call to action (the page has the button). The mark may appear
  once, small.
- Check the loop: render `--stills 0,<last frame>` and compare; the difference must be nothing
  you can see. A loop with a visible seam shows it every 5 to 30 s for as long as the page is open.
- Render at `--fps 30 --subframes 4` unless the motion is fast; the file is large, so check the
  store's size limit before choosing a CRF.

## Spring presets

`kit.springs` names four feels, all closed-form, so they stay pure:

| Preset | For | Overshoot |
|---|---|---|
| `snappy` | UI: buttons, toggles, the leading edge of an indicator | about 1% |
| `default` | cards, containers, the camera | about 4% |
| `heavy` | big type, the logo lockup | none |
| `playful` | a mascot, stickers | about 25%, visible |

`spring(t, t0, springs.heavy)`. A value with several targets is still `springTo(t, v0, steps,
springs.snappy)`: one spring per change, never a restarted one. A film uses at most three
presets, so it feels like one object.

## Advanced: generate, then trace

Optional, and only when the motion is hard to hand-code (a character's body, physics, cloth). A
video model renders the base shots; code then redraws the whole film on top, so the viewer sees
only the code-drawn layer. The model supplies motion; the code supplies the look, the brand and
a layer you own and can change.

1. Generate the base clips with the video model (Higgsfield, through its MCP tools). Keep the
   key in `.env`, set a budget before the first call, and generate one short clip first.
2. Extract frames or tracks from each clip (`ffmpeg`, then positions of the parts that matter).
3. Draw the visible layer in `seek(t)` from those tracks: the same rules as any film, the base
   clip never shown.
4. The base clips are licensed per the model's terms: keep them out of git like music.

Costs real credits and adds a failure mode (the tracks drift from the clip). Start without it.
