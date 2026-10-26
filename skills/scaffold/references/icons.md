# Icons and logos: one vector, every variant

If the repo already has an icon renderer (Maelstrom: a `brand/` folder per app plus
`pnpm assets`), use it rather than a per-app script; this file explains the rules it
follows.

## Naming

**Never name a file `logo`.** It is the word that means the symbol, the type,
the two together and the app icon, so it identifies none of them and every
project ends up with `logo`, `logo2`, `app_logo` and `logo-new`. Four words
instead, with no overlap:

| Name | What it is | Ground | Used for |
|---|---|---|---|
| `mark` | the symbol alone | transparent, cropped to the artwork | inline: headers, footers, anywhere in a layout |
| `wordmark` | the type alone | transparent | press, wide slots, partner pages |
| `lockup` | mark and wordmark together | transparent | README, OG cards, anywhere you get one shot |
| `icon` | the mark on its ground, padded | opaque tile | platform icon slots only, never inline |

`icon` is the only one that carries a ground, because an icon slot always wants
a filled tile. The others are transparent because they get placed on something.

**A number in the name means the file is generated.** Sources are vector and
sizeless, so they never carry one. That gives a rule you can check at a glance,
and a rule for the generator: anything numbered is overwritten, never edited.

```
mark.svg          source, hand-authored
mark-512.png      generated from it
icon.svg          source
icon-1024.png     generated
```

Size goes last, in pixels. Use one number for squares and `WxH` only when a
surface has more than one rectangle to keep apart.

**Platform slots keep the platform's own name.** `favicon.ico`,
`apple-touch-icon.png`, `icon.png`, `adaptive-icon-foreground.png`, `og.png`
are contracts with tooling and specs, not names you get to choose. Renaming one
to fit the schema breaks the tool or misleads the next person. Keep them where
the platform expects them, in `public/` and `assets/images/`, and keep your
sources separate under `brand/`.

**kebab-case, never snake_case**, because every platform name above is kebab and
a directory that mixes both reads as two conventions fighting.

**Name a colour variant after the background it goes on, not its own ink.**
`mark-light` is ambiguous forever: light-coloured, or for light backgrounds?

```
mark-on-dark.svg    goes on a dark surface
mark-mono.svg       one colour: stamps, themed icons, single-colour print
```

Better still, give a single-colour mark `fill="currentColor"` and let CSS decide.
Then there is no variant to name or keep in step.

### One source or two

An icon and an inline mark differ in **geometry**, not only in background, and
that decides how many sources you keep:

- **Same artwork, same crop, only the ground differs** → one source. Derive the
  mark by stripping the ground, which is what the generator below does.
- **The icon is padded to a platform grid and the mark is cropped tight** → two
  sources that share artwork. Deriving one from the other means guessing a crop,
  and the guess shows at 30px.

If you derive and the source is icon-shaped, the mark inherits the icon's
padding. That is usually fine at small sizes and wrong the moment you want the
mark to sit tight next to type. Crop the viewBox to the artwork bounds when you
reach that point, and you are in the two-source case.

Third-party brand assets are the one exception to all of this: a vendor's file
is called whatever the vendor calls it. Put those under a `vendor/` subdirectory
so nobody mistakes them for yours.


An app needs the same mark in a dozen shapes: an iOS icon, an Android adaptive
pair, a monochrome silhouette, a splash, four favicons, a social card. Drawing
them by hand guarantees they drift. Derive all of them from one file instead.

## Ask for SVG, not PNG

**SVG is the source. Always ask the designer for it.** A vector renders exactly
at every size, and each variant below is a different *view* of it: with the
background rectangle, without it, one path in white, the whole thing scaled into
a safe zone. None of that is possible from a flattened raster.

A PNG can be made to work, but only under conditions worth stating before you
accept one:

- **At least 1024x1024**, or the App Store icon is upscaled and soft.
- The transparent variants (splash, Android foreground, monochrome) need the
  background **keyed out** by colour, which leaves halos on antialiased edges
  unless the ground is a single flat colour.
- A monochrome silhouette has to be traced by hand.

So: PNG at 1024 is a fallback for the icon alone. For the full set, get the SVG.

If a raster arrives and a vector of the same mark already exists in the repo,
check whether the new art is the old vector minus or plus a shape before
resampling anything. Render the candidate SVG and diff it against the delivered
PNG: a max channel difference under about 8 with a mean near zero is
antialiasing between two renderers, which means the vector still is the source
and nothing needs to be resampled.

```bash
# quick equivalence check, one number
node -e "
const sharp = require('sharp')
Promise.all([
  sharp('candidate.svg').resize(1024,1024).removeAlpha().raw().toBuffer(),
  sharp('delivered.png').removeAlpha().raw().toBuffer(),
]).then(([a,b]) => {
  let max = 0, sum = 0
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i]-b[i]); if (d>max) max=d; sum+=d }
  console.log('max', max, 'mean', (sum/a.length).toFixed(4))
})"
```

## The three rules that cause real failures

1. **The 1024 App Store icon must have no alpha channel.** App Store Connect
   rejects one that does, at upload, after the build has already run. Flatten it.
   The other assets may keep alpha; this one may not.
2. **Android adaptive icons are two layers, and the content lives in the middle
   62%.** The launcher masks the icon to a circle, squircle or whatever the
   device uses, and only a 66dp circle of the 108dp canvas is guaranteed
   visible. Artwork drawn edge to edge gets its corners eaten.
3. **The splash image carries no background of its own.** `expo-splash-screen`
   paints `backgroundColor` and centres the image on it. Ship the mark on
   transparency and set `backgroundColor` to the artwork's own ground colour, or
   you get a visible square of slightly-wrong colour on the splash.

## The asset matrix

| File | Size | Alpha | What it is |
|---|---|---|---|
| `assets/images/icon.png` | 1024 | **no** | the full mark, ground included |
| `assets/images/splash-icon.png` | 512 | yes | mark only; the splash paints the ground |
| `assets/images/android-icon-foreground.png` | 1024 | yes | mark only, scaled into the central 62% |
| `assets/images/android-icon-background.png` | 1024 | no | flat ground colour |
| `assets/images/android-icon-monochrome.png` | 1024 | yes | outermost shape, white, same 62% |
| `web/public/favicon.svg` | vector | — | the source itself, served as-is |
| `web/public/favicon-32.png`, `-16.png` | 32, 16 | no | raster fallback |
| `web/public/favicon.ico` | 32 | no | browsers request `/favicon.ico` regardless |
| `web/public/apple-touch-icon.png` | 180 | no | iOS home screen for the web app |
| `web/public/og.png` | 1200x630 | no | social card |

## The generator

Add `sharp` as a devDependency of the app that owns the brand assets, and commit
both the script and its output. The script is the source of truth; the rasters
are build products that happen to live in git because the native build needs
them.

```js
// scripts/icons.mjs — run with `node scripts/icons.mjs`
import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const SRC = 'web/public/favicon.svg'
const GROUND = '#01684E' // must equal the ground in the SVG and the splash bg
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
const SAFE = 634 // 62% of 1024, Android's guaranteed-visible area
const PAD = (1024 - SAFE) / 2

const svg = readFileSync(SRC, 'utf8')
// Same drawing, minus its background rectangle: this is the transparent variant.
const markOnly = svg.replace(/\s*<rect[^>]*\/>/, '')
// Outermost shape alone, in white, for the Android themed icon.
const silhouette = markOnly
  .replace(/\s*<path(?![^>]*fill="#0D7256")[^>]*\/>/g, '')
  .replace('fill="#0D7256"', 'fill="#FFFFFF"')

const render = (source, size) => sharp(Buffer.from(source)).resize(size, size).png({ compressionLevel: 9 })

const inSafeZone = async (source) =>
  sharp(await sharp(await render(source, 1024).toBuffer()).trim().toBuffer())
    .resize(SAFE, SAFE, { fit: 'contain', background: TRANSPARENT })
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: TRANSPARENT })
    .png({ compressionLevel: 9 })
    .toBuffer()

// removeAlpha() is what keeps App Store Connect happy.
writeFileSync('mobile/assets/images/icon.png', await render(svg, 1024).removeAlpha().toBuffer())
writeFileSync('mobile/assets/images/splash-icon.png', await render(markOnly, 512).toBuffer())
writeFileSync('mobile/assets/images/android-icon-foreground.png', await inSafeZone(markOnly))
writeFileSync('mobile/assets/images/android-icon-monochrome.png', await inSafeZone(silhouette))
writeFileSync(
  'mobile/assets/images/android-icon-background.png',
  await sharp({ create: { width: 1024, height: 1024, channels: 3, background: GROUND } })
    .png({ compressionLevel: 9 })
    .toBuffer(),
)
for (const [file, size] of [['apple-touch-icon.png', 180], ['favicon-32.png', 32], ['favicon-16.png', 16]]) {
  writeFileSync(`web/public/${file}`, await render(svg, size).removeAlpha().toBuffer())
}
```

`.ico` is a container that may hold a PNG, which is 22 bytes of header and the
PNG itself. sharp cannot write one, so assemble it:

```js
const png = await render(svg, 32).toBuffer()
const head = Buffer.alloc(22)
head.writeUInt16LE(1, 2) // type: icon
head.writeUInt16LE(1, 4) // one image
head.writeUInt8(32, 6); head.writeUInt8(32, 7) // width, height
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12) // planes, bpp
head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18)
writeFileSync('web/public/favicon.ico', Buffer.concat([head, png]))
```

## Wiring

`app.config.js` points at the generated files, and the splash background must
match the ground:

```js
icon: './assets/images/icon.png',
android: {
  adaptiveIcon: {
    foregroundImage: './assets/images/android-icon-foreground.png',
    backgroundImage: './assets/images/android-icon-background.png',
    monochromeImage: './assets/images/android-icon-monochrome.png',
  },
},
plugins: [
  ['expo-splash-screen', { image: './assets/images/splash-icon.png', backgroundColor: GROUND, imageWidth: 160 }],
],
```

The web `<head>` needs the raster fallbacks as well as the SVG, or a browser
that cannot render an SVG icon shows nothing:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
<link rel="icon" href="/favicon-16.png" type="image/png" sizes="16x16" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
```

## Verify before you ship

Look at them. A contact sheet composited over magenta shows in one glance
whether a transparent variant really is transparent and whether the safe-zone
scaling is right:

```js
const cell = 260
const files = ['icon.png', 'splash-icon.png', 'android-icon-foreground.png', 'android-icon-monochrome.png']
const tiles = await Promise.all(files.map((f) =>
  sharp(f).resize(cell - 20, cell - 20, { fit: 'contain', background: TRANSPARENT }).png().toBuffer()))
await sharp({ create: { width: cell * 4, height: cell, channels: 4, background: '#FF00AA' } })
  .composite(tiles.map((input, i) => ({ input, top: 10, left: i * cell + 10 })))
  .toFile('sheet.png')
```

And assert the invariant that costs a rejection:

```bash
node -e "require('sharp')('mobile/assets/images/icon.png').metadata()
  .then(m => console.log(m.width, m.height, 'alpha:', m.hasAlpha))"
# 1024 1024 alpha: false
```

## The social card, without a font dependency

A 1200x630 card usually wants the wordmark on it. Rendering `<text>` through
sharp is unreliable: its bundled libvips ignores `FONTCONFIG_FILE` and
`FONTCONFIG_PATH`, so an uninstalled brand font silently falls back to DejaVu
and the card ships in the wrong typeface. Convert the glyphs to paths once
instead, with a font parser, and embed the paths in the card's SVG. The result
renders identically on any machine with no font installed.

If the app already ships the font as a TTF (an Expo app using
`@expo-google-fonts/*` does), that file is the one to parse.
