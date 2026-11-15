# Designer: look book, palette, type

The Designer decides what the film looks like, from the product's own files, and proves it on
four stills before the Animator builds the whole film.

**Gate: the look gate** (the same four stills as the Director's beat gate, scored on the brand
criteria). **Artifact:** `LOOK.md` in the film's folder: the look book below, plus the brand file
the film links.

## The brand: the product the feature lives in

A film is made in the look of the product that ships the feature, never another one. The repo
keeps one `brand.css` per product (tokens, `@font-face` by root-absolute repo path, type scale,
building blocks), built from that app's `DESIGN.md`; [templates/brand.css](../templates/brand.css)
lists the variable names. A product with no brand file gets one first. A colour or a font that is
not in the brand file does not go in a film. A designer's motion kit for a brand beats
[craft.md](../references/craft.md) where they differ.

## The look book (`LOOK.md`)

Short and specific; every line is something the stills can be checked against.

```markdown
# Look: <film name>

Style: kinetic | one-shape | product-ui | story | ambient-loop
Reference: <a frame / a video / a library> take: <palette, type, grain>; do not take: <subject, logo>

Palette: bg #..., paper #..., accent #..., functional colours (status only): #..., #...
Type: <brand face> 900 for display, <mono> 700 for labels; the smallest label that matters: 20 px at 1080p
Grounds: <which colours a frame may stand on, and when it flips>
Texture: grain at <strength> (the app's own), no glow, no 3D, no particles    (or the opposite, written down)
Motion: springs <heavy, default, snappy>; floods 0.9 s; nothing fades in
Banned: <what the brand rules out: blur-ins, shadows, a dark canvas, a second accent>
The mark: <path to the brand's SVG>, loaded from the file, never redrawn
```

- **Palette and type come from the brand file**, in the style's own config (`spec.palette` and
  `spec.font` for kinetic, the brand's CSS variables in a film built on `kit.js`). The starters use
  neutral placeholders and system fonts so they render anywhere; the Designer replaces them.
- **Big enough to read on a phone.** A desktop page rebuilt at 1:1 has 14 px labels, which a feed
  shows at 4 px. Build the page about 1.3x its real size and keep the camera at 1.1x or closer, so
  the smallest label that matters is 20 px on the 1080p frame. `render.mjs` lists text under that.
- **Real screens.** Rebuild the UI from actual screenshots at true proportions; a made-up UI is
  noticed at once. Icons come from [templates/icons.js](../templates/icons.js) or the repo's own set.
- **The mark is the brand's file.** Copy the path from the repo's mark SVG; give it `id="mark"`
  so a repo test can compare it with the brand file.
- **Generated pictures** (key art, plates) follow the Producer's budget. Describe composition, never
  "leave empty space for text" (it was drawn as a literal grey band): darken for type in the film.
  Pass the first picture as a reference for the rest ("same character, same city"). Write "no
  text, no logos"; never mention watermarks when a reference image is attached (the request was
  blocked as watermark removal and still charged). **Open every picture at 100%**: scooters, cars,
  shoes and clothes come back with makers' logos. Paint them out or regenerate, then record
  `checked: true` where the style's spec asks for it.

## Scoring the stills

The Editor's rubric ([critique.md](../references/critique.md)) is the Designer's too. The look
gate scores hierarchy, type, brand fidelity and legibility at phone size on the four stills; the
Editor re-scores the whole film later. Be a harsh scorer: 7 is what a default looks like.

## Effort

`xhigh` for a new look; `medium` to apply an existing brand file.
