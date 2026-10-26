---
name: app-screenshots
description: >-
  App Store screenshots for an Expo app: concept, simulator captures, then offline device-framed frames at Apple's sizes. Use for App Store screenshots, listing images, a regenerated set, or an IAP review screenshot.
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
sets mapped to spec fields, and what Apple does not allow.

The first three frames appear in search results without anyone opening the listing, so they work
as a group:

1. **Why should I care?** The outcome, in the user's words. This is the value prop.
2. **How does it work?** The real screen in a real state, with the one element that carries the idea lifted out.
3. **Why believe it?** Proof: a sourced rating or review, breadth, or the thing no competitor has.

Then four to five more at most. Eight strong frames beat ten with two weak ones, because the weak
ones are where a skimmer stops.

**Captions:**

- Lead with a concrete verb and noun. Skip "powerful", "seamless", "all-in-one": they say nothing.
- About five words; two lines at most (the compositor refuses three). Long compounds (German) eat the budget fast.
- Match the repo's address form and copy rules, and run the list through `unslop` before rendering.
- Same position and colour across the set. Inconsistency reads as amateur faster than one weak frame.

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

## Before uploading

- Every file at its class's exact size, RGB, no alpha; at least one `6.3` set.
- `references/concepts.md`'s review checklist passes, including the `--sheet` test.
- One visual language across the set: same ground, type and accent; layouts may vary.
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
- The required `6.3` class most likely maps to `APP_IPHONE_61`; that is unverified, so push and
  pull to confirm. Duo has no display type in eas-cli yet and goes up by hand.
- **`eas metadata:lint` does not check that the listing's URLs resolve.** A dead `supportUrl` is
  a guideline 1.5 rejection: run the repo's URL check before pushing.

The icon is its own job (the `scaffold` skill), the listing text is `aso`, and the repo's ship
checklist covers everything around both before a store build.
