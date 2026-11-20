---
name: app-screenshots
description: >-
  App Store screenshots for an Expo app: concept, simulator captures, then offline frames at Apple's sizes from six layout templates (hero object, tilted device, panorama, feature callout, before and after, honest proof). Use for App Store screenshots, listing images, a regenerated set, or an IAP review screenshot.
---

# App Store screenshots

Read the repo's `AGENTS.md` and `docs/agent-kit/app-screenshots.md` first; they win where they
differ from this skill.

The screenshots convert; the metadata (the `aso` skill) only gets the listing seen. They are also
the one submission asset nothing can fake: every frame has to be the app actually running
(guideline 2.3.3).

## 1. Concept before capture

Decide what each frame says before deciding which screen it shows. Read
`references/concepts.md` first: research, the seven principles as checks, patterns from strong
sets mapped to spec fields, and what Apple does not allow. `references/store-practice.md` has
the evidence behind the rules below, with sources, and what is only folklore.

The first three frames appear in search results without anyone opening the listing, so they work
as a group:

1. **Why should I care?** The outcome, in the user's words. This is the value prop.
2. **How does it work?** The real screen in a real state, with the one element that carries the idea lifted out.
3. **Why believe it?** Proof: a sourced rating or review, breadth, or the thing no competitor has.

Then four to five more at most. Eight strong frames beat ten with two weak ones, because the weak
ones are where a skimmer stops.

**What strong sets share** (the rules every template follows):

- **One benefit headline per frame, three to six words, set huge.** It is the largest thing on
  the frame. One word or phrase may be emphasised, never two.
- **One strong brand colour** across the set, or two grounds of one family alternating. Same
  headline position and type size on every frame.
- **The device is composed, not parked:** oversized, cut by the frame edge, tilted 6° to 12° when
  it moves alone, 1° to 3° when real UI lifted off it carries the motion.
- **A hero object carries the idea** where the app has one (and owns the art): bigger than life,
  allowed to cross into frame 2 so the set opens as one picture.
- **Frame 1 sells the outcome; every later frame shows one feature.**
- **Real UI in the device,** in a populated state. Never a wall of text, never a mockup.
- **Proof only where honest:** a sourced rating, a real review, or plain specifics ("No account").
  No invented reviews, ratings, user counts or earnings.

**Captions:**

- Lead with a concrete verb and noun. Skip "powerful", "seamless", "all-in-one": they say nothing.
- Three to six words (`compose-set.mjs` refuses seven). Long compounds (German) eat the budget fast.
- Match the repo's address form and copy rules, and run the list through `unslop` before rendering.
- Same position and colour across the set. Inconsistency reads as amateur faster than one weak frame.
- Use the words the listing targets (`aso`) where they fit naturally: the store may read caption text.

## 2. Sizes

`references/store-assets.md` has the dated table with sources (Apple changes it every autumn), plus
the product page header and search result assets. In short:

- **Required:** Dynamic Island medium, 1206x2622: size `6.3`, which is also what a Pro-size simulator captures at.
- **Large class, keep rendering:** `6.9` (1320x2868, the sharpest, source of record) and `6.7`
  (1290x2796, the largest set `eas metadata:push` can upload).
- **`6.5`** is the older Face ID slot and never a substitute for the above.
- **iPhone Duo:** `duo-inner` and `duo-outer`, from Duo simulator captures in their own spec. No fallback from other classes.

`"sizes": ["6.3", "6.9", "6.7"]` renders all three phone sizes from one caption list. Up to 10
frames per set. No iPad set if `supportsTablet` is false in the app config.

## 3. Capture the screens

The simulator is enough, and it is the only way to get a clean status bar:

```bash
xcrun simctl boot <udid>                      # `xcrun simctl list devices` to find one
xcrun simctl install booted <path>/App.app
xcrun simctl launch booted <bundle id>
xcrun simctl io booted screenshot <screenshots>/caps/01.png
```

Reaching a specific screen without tapping:

- **A deep link**, if the screen is a route: `xcrun simctl openurl booted "<scheme>://<route>"`.
  iOS asks for confirmation the first time, so this suits an app already in the foreground.
- **A temporary navigation in the bundle.** A `useEffect` that pushes to the screen on mount, then
  rebuild only the JS with
  `expo export:embed --platform ios --dev false --entry-file node_modules/expo-router/entry.js --bundle-output main.jsbundle`,
  copy it over `main.jsbundle` inside the `.app` and reinstall. Seconds instead of a native
  rebuild. Revert it afterwards: a capture trick, never a commit.

Put the app in a **populated state** first. Never capture empty states, spinners, onboarding,
untouched settings or anything mid-transition. One real entry beats a perfect empty screen.

## 4. Compose

Three compositors, one per kind of set:

| Set | Script | Spec |
|---|---|---|
| Designed from templates: tilted devices, a hero object, a panorama, before and after | `compose-set.mjs` | `set.json`, `references/templates.md` |
| Plain: one caption over one upright device per frame, callouts, badges | `compose.mjs` | `spec.json`, below |
| Drawn by a designer (a Claude Design `.dc.html`) | `compose-artboards.mjs` | `artboards.json`, "A designed set" below |

Start with `compose-set.mjs` for a new set; it is what the reference sets look like. The other
two stay for existing plain sets and for designer artboards.

Store material sits beside the app, typically `<app>/distribution/app-store/screenshots/`:
`spec.json` (reviewed like code), `caps/` (raw captures), and one folder per rendered size.

```bash
node .agents/skills/app-screenshots/scripts/compose.mjs --spec <screenshots>/spec.json [--sheet <scratch>/review.png]
```

The scripts need `sharp` and `fontkitten` and have no `node_modules` of their own. They resolve
both from the working directory, then the spec's directory, then the repo root, and name the
missing package otherwise. So: run from the repo root when they are root devDependencies, or
`cd` into a package that depends on them.

Deterministic and offline: same input, same bytes, so a regenerated set is diffed rather than
squinted at. Paths in the spec are relative to the spec, and frames land in
`<out>/<size>/NN-<slug>.png`. A frame with only `caption` and `screen` is the plain
caption-over-device frame; the rest is opt-in:

```json
{
  "sizes": ["6.3", "6.9", "6.7"],
  "background": "#232323", "ink": "#F1EDE4", "accent": "#3FE3C5", "subInk": "#9B978F",
  "font": "<display .ttf>", "bodyFont": "<text .ttf>", "out": "en-US",
  "frames": [
    { "caption": "What's your *card* worth?", "hero": true, "sub": "Scan it, see the price",
      "screen": "caps/01.png", "callouts": [{ "crop": [40, 1210, 1130, 260], "scale": 1.2 }] },
    { "caption": "Every print, *rarity* included", "layout": "bottom", "screen": "caps/02.png",
      "quote": { "text": "<user's words>", "author": "<name>", "source": "App Store review, <date>" } },
    { "caption": "Watch your *prices*", "screen": "caps/03.png", "slug": "prices",
      "badge": { "value": "4.8", "label": "on the App Store", "source": "ASC rating, <n> ratings, <date>" } }
  ]
}
```

- `background`, `ink` and `font` are the app's brand tokens and display face (`.ttf`).
- `*word*` sets words in `accent`. `hero` sets oversized type over up to three short lines.
- `callouts` crop the **real capture** (capture pixels), enlarge it and lift it off the device: the visual hook, without a mockup.
- `badge` and `quote` are refused without a `source`; the source stays in git beside the frame.
- `slug` names the file. The default keeps only `a-z0-9` of the caption, so set it for umlauts and for languages that must share file names.
- `--sheet` writes frames 1 to 3 as search shows them, and the same frames with every word removed. The second row is principle 4's test.

What is not obvious: captions are **glyph outlines, not text**, because sharp's bundled libvips
ignores fontconfig and would silently set the brand font in DejaVu. Captions stay inside the
**middle 70%**, because Apple crops between sizes of a class. The compositor refuses a frame at
the wrong dimensions, a caption that will not fit, copy that pushes the device past half the
frame, and a callout that leaves the canvas. Each means the concept needs cutting, not the
renderer loosening.

### A set from templates

`scripts/compose-set.mjs` draws the whole set on one strip, frames side by side, and cuts it into
frames at the end, so a hero object can cross from frame 1 into frame 2. Each frame names one of
six templates; `references/templates.md` says when to use which, every field and default, and the
honesty rules. `examples/boxtrail/` is a full example from a fictional app (spec, captures, art,
font, and `preview.png`, its review sheet).

```bash
node .agents/skills/app-screenshots/scripts/compose-set.mjs --spec <screenshots>/set.json --sheet <scratch>/review.png
```

```json
{
  "sizes": ["6.3", "6.9", "6.7"],
  "background": "#0F5132", "ink": "#FFFFFF", "accent": "#C8F169",
  "emphasis": "pill", "pill": "#C8F169", "pillInk": "#0F5132",
  "font": "<display .ttf>", "out": "en-US",
  "frames": [
    { "template": "hero-object", "headline": "Know the day it *arrives*",
      "device": { "screen": "caps/01.png" }, "object": { "image": "art/parcel.svg", "x": 410, "y": 790 } },
    { "template": "panorama", "headline": "Watch it come *closer*", "device": { "screen": "caps/02.png" } },
    { "template": "feature-callout", "background": "#EEF3EA", "ink": "#13201A", "headline": "Tell the house it's *coming*",
      "device": { "screen": "caps/06.png" }, "callouts": [{ "crop": [60, 591, 1086, 396], "rotate": -3 }] },
    { "template": "before-after", "headline": "Paste a code, get a *date*",
      "before": { "screen": "caps/03.png" }, "after": { "screen": "caps/04.png" } },
    { "template": "proof", "headline": "Private by *default*", "facts": ["No account", "No ads, no trackers"] }
  ]
}
```

- Placements are in artboard units (each frame 430 wide, about 934 tall), centre `x`/`y`, so one
  spec renders every size. Templates fill in sensible placements; override only to nudge.
- Every headline gets one type size across the set (`"headlineSize": "set"`), the largest at which
  all of them fit their lines (`"headlineLines"`, three by default); a hero may size its own.
- A device is cut by its own frame; only objects and grounds cross a seam, because the store
  draws a gap between frames.
- `"copy": "bottom"` mirrors the template's default heights, so the picture moves up.
- **Refused, with exit 1:** a device or object covering a headline, sub-line or proof block; a
  headline over six words; Apple recognitions or ranks; prices and amounts of money, percentages,
  multipliers, user counts or ratings without a `source`; URLs and ©/®/™; a badge or quote without
  a `source`; a fact with a number; words under 3:1 contrast; a device turned more than 15°; a
  screen that is not a portrait iPhone capture; a panorama as frame 1.
- **Warned:** a device that bleeds across a seam.
- `--sheet` writes the whole set as the product page shows it (rounded, with gaps, so the
  panorama is judged with its seams) and again with every word removed.
- `--crops <png>` writes every callout's crop on one sheet. Measure crops on the full-size
  capture and check this sheet first: a crop placed by eye from a preview misses by tens of
  pixels and lifts the wrong half of a button.

Then **look at the sheet** and fix the top three problems before rendering the final set: the
design skill's taste guide (`design`, `references/taste/GUIDE.md`, "Look") applies here too.
Type size, crops and seams are judged on the picture, not the spec.

### A designed set

When a designer has drawn the frames (a Claude Design `.dc.html`, say), do not approximate them
with the caption compositor. `scripts/compose-artboards.mjs` takes an artboard spec instead:
per-frame ground, a headline whose lines are text or a tilted pill with a blob, and a `device`,
`phases` or `checklist` body.

```bash
node .agents/skills/app-screenshots/scripts/compose-artboards.mjs --spec <screenshots>/artboards.json
```

```json
{
  "sizes": ["6.3", "6.9", "6.7"],
  "font": "<bold .ttf>",
  "out": ".",
  "frames": [
    { "kind": "device", "background": "#FFF3E2", "ink": "#26211B", "eyebrow": "<app name>", "eyebrowInk": "#01684E",
      "headline": ["One tiny", { "pill": "breath", "blob": "#8E96FE", "shape": "a", "rotate": -3 }, "at a time"],
      "screen": "caps/01.png", "slug": "hero" },
    { "kind": "phases", "background": "#FFF3E2", "headline": ["Three steps"],
      "phases": [{ "label": "Breathe in", "sub": "4 seconds", "fill": "#FFFDF9", "ink": "#26211B",
                   "blob": { "fill": "#8E96FE", "size": 56, "shape": "b" } }] },
    { "kind": "checklist", "background": "#FFF3E2", "headline": ["All", "on board"],
      "rows": [{ "text": "No account", "fill": "#FFFDF9", "ink": "#26211B" }],
      "logo": "logo.png", "wordmark": "<app name>" }
  ]
}
```

The geometry is drawn on a 430x932 artboard and read straight off the design's CSS (blob
`border-radius` values included), so the result is pixel-faithful without a browser. A different
design means editing the constants in the script (`ART`, `DEVICE`, `SHAPES`, the headline
measures), not bending the spec. An unknown `kind` is refused. The eyebrow takes the frame's
`ink` unless `eyebrowInk` is set. The real capture replaces the design's screen mockup: that
mockup is the one thing never copied (2.3.3).

## The in-app purchase review screenshot

An IAP is **rejected without a screenshot of the paid surface**. Only App Review sees it: a plain
capture of the paywall at 640x920 or larger, no caption, no frame, attached under the purchase's
Review Information (or uploaded by the repo's release tooling).

## Localising

One spec per locale, with captures from the app running in that language: never English UI under a
translated caption. Write the headline again in the language instead of translating it word for
word, and keep it short enough that the set's type size holds (translated text runs much longer,
`references/store-practice.md` §5). For a right-to-left language, mirror the placements
(`x` becomes `430 - x`, `rotate` changes sign) but not the hero object or photographs. Set `slug`
so every locale shares file names.

## Before uploading

- Every file at its class's exact size, RGB, no alpha; at least one `6.3` set.
- `references/concepts.md`'s review checklist passes, including the `--sheet` test.
- One visual language across the set: same ground, type and accent; layouts may vary.
- Every figure, rating and review on a frame has a source you could show App Review.
- No placeholder data, no lorem, no other company's trademark on screen.
- A plausible status bar. The simulator default is fine; a 14% battery is a distraction.

## Uploading

`eas metadata:push` uploads screenshots declared per locale in `store.config.json`, with paths
relative to the package that holds that file:

```json
"apple": { "info": { "en-US": { "screenshots": {
  "APP_IPHONE_67": ["<relative path>/screenshots/6.7/01-hero.png"]
} } } }
```

- **A screenshot failure does not change the exit code**
  ([eas-cli#3689](https://github.com/expo/eas-cli/issues/3689)). A push that prints success can
  have uploaded nothing. Confirm with `eas metadata:pull`, which writes the live set back.
- The required `6.3` class (1206x2622) goes in `APP_IPHONE_61`: App Store Connect accepted and
  processed a set there (November 2026, first through its API). Declare it beside `APP_IPHONE_67`
  and read the sets back after a push. Duo has no display type in eas-cli yet and goes up by hand.
- **`eas metadata:lint` does not check that the listing's URLs resolve.** A dead `supportUrl` is
  a guideline 1.5 rejection: run the repo's URL check before pushing.

The icon is its own job (the `scaffold` skill), the listing text is `aso`, and the repo's ship
checklist covers everything around both before a store build.
