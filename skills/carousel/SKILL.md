---
name: carousel
description: Build Instagram, TikTok and LinkedIn carousels from a carousel.json in a product's brand, rendered to PNGs, a PDF and a preview. Use for a carousel, slide post, launch post, mascot carousel batch.
---

# Carousel

Read the repo's `AGENTS.md` and `docs/agent-kit/carousel.md` first; they win where they differ
from this skill.

A carousel is data, not design. A `carousel.json` names its brand, picks slide types and fills in
copy. The brand owns colours, fonts, logo, mascot, closing slide and templates;
[`scripts/slides.css`](scripts/slides.css) owns the layout every brand shares, and
[`scripts/render.mjs`](scripts/render.mjs) puts them together. Never hand-edit HTML for one
carousel: when a slide type is missing, add it to the renderer so the next carousel gets it too.

Two styles share the renderer:

- **Product slides** (`cover`, `feature`, `steps`, `stat`, `quote`, `cta`, `chat`, and five types
  that draw a product instead of screenshotting it). For a feature launch, a customer result, a
  how-to. Example: a launch post built from the feature's changelog entry and a screenshot crop.
- **Lettered slides** (`lettered`): one hand-lettered thought per slide, one highlighted word, a
  recurring mascot pose under it. 6 to 9 near-identical slides someone thumbs through in four
  seconds; the slides carry the mood and the caption carries the words search can find. Example:
  a calm app's "how to survive a weird day" batch for TikTok photo mode.

## What lives where

```text
carousel/
├── scripts/
│   ├── render.mjs    # carousel.json → out/<WxH>/{NN.png, carousel.pdf, preview.png, slides.html}
│   ├── slides.css    # the shared layout; reads the brand's tokens
│   ├── crop.mjs      # cut the part of a screenshot a slide needs
│   └── repo.mjs      # repo root, agent-kit.config.json, Playwright
└── brands/example/   # neutral tokens and templates: copy it to start a brand
    ├── brand.json  theme.css
    └── templates/  feature-launch.json  lettered.json  caption.md
```

The repo keeps its brands in one folder, named in `agent-kit.config.json`:

```json
{ "carousel": { "brands": "docs/marketing/brands", "playwright": "apps/web" } }
```

`playwright` is a folder whose `node_modules` has `playwright` or `playwright-core`; without it
the working directory and the repo root are tried, and the installed Chrome stands in when
Playwright's own Chromium is missing. A carousel's `brand` is an id from that folder (the kit's
`example` is the fallback) or a path relative to the carousel.json.

A carousel folder holds only what a person writes: `carousel.json`, `caption.md`, and `assets/`
for inputs you bring (a customer photo). Everything generated, screenshot crops included, goes to
`out/` (gitignored) and can be rebuilt from the repo at any time. The repo's notes say where
carousel folders live and where finished `out/` goes.

## Pick the brand: the product the feature lives in

A carousel is posted in the look of the product that ships the feature, never another one. Find
the app the feature's code lives in and take the brand whose `brand.json` lists it under `apps`. A
feature in an app no brand lists has no brand yet: add the brand first (below), or stop and say
so. A feature that spans two products is posted once per product, each in its own brand.

## Workflow

1. **Pick the source of truth.** A feature launch starts from its changelog entry: every claim on
   a slide is in there or in the code. Which plan gets a feature comes from the pricing code,
   never from a changelog (an entry is true on its date and nobody rewrites it). Customer quotes
   need the customer's written approval of the exact wording.
2. **Copy one of the brand's templates** into a new folder `<YYYY-MM-DD-slug>/` as
   `carousel.json`, with its `caption.md`.
3. **Replace every `[placeholder]`** with real copy (rules below), then run the copy through the
   `unslop` skill, one slide per paragraph:

   ```bash
   node .agents/skills/carousel/scripts/render.mjs <folder>/carousel.json --copy | python3 .agents/skills/unslop/scripts/slop_scan.py -
   python3 .agents/skills/unslop/scripts/slop_scan.py <folder>/caption.md
   ```

   Scanning the JSON field by field reports "staccato" for every carousel; that is the format,
   not slop.
4. **Images are recipes, not files.** List cuts of the app's real screenshots under `crops`; the
   renderer runs them into `out/assets/` first and a slide points at the result:

   ```jsonc
   "crops": [
     // a region of a screen, at roughly the slot's 3:2
     { "from": "<repo path>/modal.png", "to": "modal.png", "x": 0, "y": 6, "w": 1344, "h": 614 },
     // a small element (button, badge) on a canvas, flush right like in the app
     { "from": "<repo path>/button.png", "to": "button.png", "x": 240, "y": 60, "w": 720, "h": 140, "canvas": "900x800", "align": "right" }
   ],
   "slides": [ { "type": "feature", "title": "…", "image": "out/assets/button.png" } ]
   ```

   Crop fields are the flags of `crop.mjs` (`x y w h pad bg canvas align`) in source pixels; try
   a cut by hand first with `node .agents/skills/carousel/scripts/crop.mjs <in.png> /tmp/cut.png --x=… --w=…`.
   What went wrong without these rules:
   - A small element cut with its surroundings shows mostly empty UI. Cut it tight and put it on
     `--canvas`.
   - A hand-picked canvas colour one shade off leaves a visible rectangle. `--canvas` samples the
     cut's corner; pass `--bg` only on purpose.
   - The slot has a different shape in every format and fills with `cover`, so a flat canvas lost
     a button's sides on 3:4. Make a canvas taller than any slot (`900x800`): then `cover` only
     trims background.
   - A wide cut loses its sides for the same reason. On a white UI set `"fit": "contain"`.

   Strings inside a screenshot are the product's: an em dash in the app's UI is an app issue, not
   a reason to retouch the image. When the feature is a conversation, draw it with a `chat` slide
   instead of screenshotting a chat client.
5. **Render and look at every slide in every format:**

   ```bash
   node .agents/skills/carousel/scripts/render.mjs <folder>/carousel.json <folder>/out
   ```

   | Folder | Ratio | Where |
   |---|---|---|
   | `out/1080x1080/` | 1:1 | feeds that crop to square, LinkedIn |
   | `out/1080x1350/` | 4:5 | Instagram feed default |
   | `out/1080x1440/` | 3:4 | Instagram's taller grid |
   | `out/1080x1920/` | 9:16 | TikTok photo mode, Stories: only when `formats` names it |

   `"formats": [...]` renders only those. Open each `preview.png`, then the PNGs. No line ends in
   one orphaned word, no fact breaks across lines (`+64 €/mo` alone), the screenshot shows what
   the slide claims, and a lettered slide's highlight sits under one word. The renderer measures
   what eyes miss: text taller than the slide, text closer than 24 px to an image, chat or the
   header and footer, an image squeezed below 35 % of the slide height, a lettered line wider than
   the slide, an image that did not load. 1:1 has its own type scale; copy that still does not
   fit gets cut, never shrunk per slide. 9:16 keeps everything in the central 4:5 band, clear of
   the app's caption and buttons.

   Check the PDF in a real PDF viewer too. Printing the HTML once turned a drop shadow into a flat
   block over the text while the PNGs looked fine; the PDF is now built from the PNGs, but look.
6. **Gate before posting:** the same command with `--strict` exits 1 while any `[placeholder]`,
   missing image, overflow, overlap, squeezed image or missing alt text remains in any format.
7. **Commit** `carousel.json` and `caption.md` (and `assets/`). `out/` is rebuilt by the render.
8. **Hand over** the way the repo's notes say (a drive folder, a media store, a scheduler).
   Instagram takes up to 10 `NN.png` from one format folder, the closing slide included. LinkedIn
   takes `carousel.pdf` as a document post. TikTok takes the 9:16 PNGs in photo mode. Paste each
   line of `out/alt.md` into the platform's alt-text field.

## carousel.json

```jsonc
{
  "title": "Feature name",   // the HTML title and your own overview
  "brand": "acme",           // required: the product the feature lives in
  "crops": [],               // image recipes, rendered into out/assets/
  "lang": "en",              // en | de: quote marks, the swipe hint, which closing slide; default: the brand's
  "theme": "light",          // default per slide: light | dark, plus the brand's own grounds
  "handle": "acme.com",      // bottom left on every slide; defaults to the brand's
  "footer": "acme.com",      // lettered slides' footer; defaults to the handle
  "formats": ["1080x1350"],  // optional: default the three feed formats
  "mascot": { "poses": {} }, // optional: poses for this carousel only, over the brand's
  "slides": []               // up to 10, the brand's closing slide included
}
```

| `type` | Required | Optional |
|---|---|---|
| `cover` | `headline` | `kicker`, `subline`, `image`, `fit`, `theme`, `pages[]` (`done`, `active`, `open`), `excerpt` (`{name, page, quote}`) |
| `feature` | `title` | `kicker`, `body`, `bullets[]`, `image`, `fit`, `theme` |
| `steps` | `title`, `steps[]` (2 to 4 × `{title, body}`) | `kicker`, `theme`, per step `meta` |
| `stat` | `value`, `label` | `kicker`, `compare`, `body`, `source`, `theme` |
| `quote` | `quote`, `author.name` | `kicker`, `author.role`, `author.image`, `theme` |
| `cta` | `headline` | `kicker`, `body`, `button`, `url`, `theme` |
| `chat` | `messages[]` (2 to 5 × `{from, text}`, `from` = `user`, `agent`, `tool`) | `kicker`, `title`, `agent` (window label), `note`, `theme` |
| `source` | `title`, `doc` (`{name, quote}`) | `kicker`, `doc.page`, `doc.ref`, `against` (`{name, note}`), `theme` |
| `finding` | `title`, `severity` (`critical`, `high`, `medium`, `low`) | `kicker`, `id`, `source`, `body`, `cost` (`{label, value, unit, note}`), `theme` |
| `status` | `title`, `percent`, `steps[]` (2 to 5 × `{state, title}`, `done`, `running`, `waiting`, `open`) | `kicker`, `label`, `eta`, per step `body`, `time`, `theme` |
| `report` | `title`, `pages[]` (2 to 8 names) | `kicker`, `active` (1-based), `theme` |
| `gaps` | `title`, `items[]` (2 to 6 × `{name}`) | `kicker`, `found`, `total`, `unit`, `label`, per item `note`, `missing`, `theme` |
| `lettered` | `lines[]` (1 to 4) | `pose` (a key of the mascot's poses), `url` (the closing slide), `alt`, `theme` |

`source`, `finding`, `status`, `report` and `gaps` draw the product from data: they stay sharp in
every format and never show a customer's document. A finding's severity reads as a word, four
gauge dots and a chip at once, so it works without colour. Everything in them is example data and
says so. `chat`: `user` is the prompt as a user would type it, `tool` the real tool name the agent
calls, `agent` the answer with one fact per line; say in `note` where the example came from.

Inline markup in any product slide text: `*word*` is the brand's accent, `**word**` bold, `\n` a
line break. In a `lettered` line, `*word*` is the one highlighted word (a marker swipe behind it):
one per slide, not three. Image paths are relative to the carousel.json. The closing slide is not
in `slides`: the brand appends it, it counts in the pager, and the slide before it keeps its swipe
hint.

## Copy rules

- One idea per slide. The cover stops the scroll on its own; the last slide says what to do
  next, the closing slide says where.
- Length: cover headline at most 10 words, titles 14, body 30; lettered slides 2 to 4 short
  lines. When it does not fit at the fixed type size, cut words; never shrink the type.
- One accent per carousel, on the cover: the last two or three words of the headline.
- Only true claims, within the app's own claims ceiling. A stat carries its `source`.
- The CTA matches the landing's and does not contradict the plan: a paid feature does not end
  on a "start free" button. Link the feature's own landing page when it has one.
- Theme rhythm: a dark cover and a dark CTA frame light content slides.
- A mascot is openly the brand's character. No slide pretends to be a real person, a user or
  a review. AI-made imagery carries the platform's AI label.
- Alt text per lettered slide: what the mascot does, then the slide's text.
- Caption: per network, a hook, then two or three sentences in the same voice; 4 to 8
  hashtags, one broad and the rest niche. The caption is searchable text: name the topic plainly.
- No em dashes, in any language.

## Brands

```text
<brands>/<id>/
  brand.json        name, apps, lang, logo or wordmark ({light, dark}), handle, themes (grounds
                    beyond light and dark), fonts, mascot ({name, poses}), outro ({<lang>: file})
  theme.css         the tokens slides.css reads: copy brands/example/theme.css and set every one
  slides.css        optional: where the brand's layout departs from the shared one
  outro.<lang>.html optional fixed closing slide ({{brandDir}}, {{repoRoot}}, {{counter}})
  assets/  fonts/   logo and images; vendored fonts with their licence
  templates/        the brand's carousel templates and caption.md
```

A font, logo or pose `src` is relative to the brand folder, `repo:<path>` for a file an app
already installs (an `@fontsource` package), or an https URL. Vendor a font only with its licence
file beside it.

### Adding a brand

1. Copy `brands/example/` into the repo's brands folder. Set `name`, `apps`, `lang`, `logo`,
   `handle`.
2. Rewrite `theme.css` from the app's design doc: every token, the tints as RGB triplets, the font
   variables. If the look differs in more than colour and type (no shadows, another chrome), add a
   `slides.css` whose rules start with `.brand-<id> .slide` so they outrank the shared ones.
3. For lettered carousels: generate the mascot once (8 to 12 named poses as standalone images),
   host the poses, list them under `mascot.poses`. Never redraw the character per carousel:
   consistency is what makes a mascot. A missing pose renders a grey placeholder, so specs can be
   drafted first.
4. An account with a fixed end card gets `outro.<lang>.html`, listed under `outro`.
5. Write the brand's templates (at least one and a `caption.md`), each with `"brand": "<id>"`,
   render one in every format and look at it.
