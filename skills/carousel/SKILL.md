---
name: carousel
description: Build Instagram, TikTok and LinkedIn carousels from a carousel.json in a product's brand, rendered to PNGs, a PDF and a preview, with three cover variants, a scorecard gate, caption, alt text and reply script, and angle batches measured as experiments. Use for a carousel, slide post, launch post, mascot carousel batch, a batch of carousel angles.
---

# Carousel

Read the repo's `AGENTS.md` and `docs/agent-kit/carousel.md` first; they win where they differ
from this skill.

A carousel is data, not design. A `carousel.json` names its brand, picks slide types and fills in
copy. The brand owns colours, fonts, logo, mascot, closing slide and templates;
[`scripts/slides.css`](scripts/slides.css) owns the layout every brand shares, and
[`scripts/render.mjs`](scripts/render.mjs) puts them together. Never hand-edit HTML for one
carousel: when a slide type is missing, add it to the renderer so the next carousel gets it too.

Several styles share the renderer:

- **Product slides** (`cover`, `feature`, `steps`, `stat`, `quote`, `cta`, `chat`, and five types
  that draw a product instead of screenshotting it). For a feature launch, a customer result, a
  how-to. Example: a launch post built from the feature's changelog entry and a screenshot crop.
- **Lettered slides** (`lettered`): one hand-lettered thought per slide, one highlighted word, a
  recurring mascot pose under it. 6 to 9 near-identical slides someone thumbs through in four
  seconds; the slides carry the mood and the caption carries the words search can find. Example:
  a calm app's "how to survive a weird day" batch for TikTok photo mode.
- **Other looks, each a template:** text on photo (`photo`, a reference image can set the look),
  listicle (`listicle`, big numbers), before/after (`compare`), app screenshot walkthrough
  (`screen`, numbered steps).

A carousel is an experiment. Every one gets an intake, three covers, a score and a slug; see
[references/scorecard.md](references/scorecard.md) and
[references/measurement.md](references/measurement.md).

## What lives where

```text
carousel/
├── scripts/
│   ├── render.mjs    # carousel.json → out/<WxH>/{NN.png, carousel.pdf, preview.png, slides.html}
│   ├── slides.css    # the shared layout; reads the brand's tokens
│   ├── campaign.mjs  # intake, covers, scorecard, experiment and link checks (pure)
│   ├── batch.mjs     # angle batch: one folder per angle and the matrix
│   ├── crop.mjs      # cut the part of a screenshot a slide needs
│   └── repo.mjs      # repo root, agent-kit.config.json, Playwright
├── references/       # scorecard.md, measurement.md
└── brands/example/   # neutral tokens and templates: copy it to start a brand
    ├── brand.json  theme.css
    └── templates/  feature-launch  listicle  before-after  app-walkthrough  text-on-photo  lettered (.json)
                    caption.md  replies.md
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

0. **Intake: four questions, answered before any slide is written.** Ask the human (or read the
   brief) and record the answers as `intake` in the spec:
   1. What are you selling?
   2. Who is the audience (one kind of person)?
   3. What one action do we want?
   4. What one real result can we show? A true number or a real screenshot, with where it comes
      from (`result: {text, source}`). Never invented; with no real result, the carousel leads
      with the problem and shows no number.

   For several carousels at once, see "Angle batches" below.
1. **Pick the source of truth.** A feature launch starts from its changelog entry: every claim on
   a slide is in there or in the code. Which plan gets a feature comes from the pricing code,
   never from a changelog (an entry is true on its date and nobody rewrites it). Customer quotes
   need the customer's written approval of the exact wording.
2. **Copy one of the brand's templates** into a new folder `<YYYY-MM-DD-slug>/` as
   `carousel.json`, with its `caption.md` and `replies.md`. Fill `experiment` (slug, angle).
3. **Replace every `[placeholder]`** with real copy (rules below), then run the copy through the
   `unslop` skill, one slide per paragraph:

   ```bash
   node .agents/skills/carousel/scripts/render.mjs <folder>/carousel.json --copy | python3 .agents/skills/unslop/scripts/slop_scan.py -
   python3 .agents/skills/unslop/scripts/slop_scan.py <folder>/caption.md
   ```

   Scanning the JSON field by field reports "staccato" for every carousel; that is the format,
   not slop.
3b. **Three covers, one deck.** Write three `covers` that differ in the hook (a question, a true
   number, a belief turned over), same look. Render: `out/covers/a.png`, `b.png`, `c.png` show each
   one. Pick by the scorecard (hook criterion, then which delivers most on its promise), set
   `cover` to the id; the picked cover goes in front of `slides`. The hook must deliver: every
   number and promise on the cover is paid off inside the deck.
   **Slide 2 is a second cover**: platforms show a carousel again from slide 2, so it has its own
   claim (a `cover`, `photo`, `stat` or `listicle`), not a continuation. **Every slide earns the
   next swipe**: set `loop` (up to 40 characters, replaces "Swipe" in the footer: "the fix, next")
   or number the slides. **Exactly one call to action**, once, matching the intake's action.
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
6. **Score, then gate.** Rate the rendered carousel on [references/scorecard.md](references/scorecard.md)
   (20 points, ships at 16, honesty full marks) and record `score` in the spec. Then the same
   command with `--strict` exits 1 while any `[placeholder]`, missing image, overflow, overlap,
   squeezed image, missing alt text, missing or low score, unpicked cover, missing intake or
   experiment, a second CTA, a slide 2 that is not a second cover, or a caption or reply link without
   `utm_source` and `utm_content=<slug>` remains.
7. **Commit** `carousel.json`, `caption.md` and `replies.md` (and `assets/`). `out/` is rebuilt by the render.
8. **Outputs per carousel:** the slides, `caption.md` (a hook, the searchable caption per network,
   hashtags, links with tracking), `out/alt.md` (alt text per slide), `replies.md` (the DM and the
   replies to likely comments: plain, no invented urgency). **Post through the repo's social CLI**
   (official platform APIs), never by scraping or driving a logged-in browser. Add the carousel's
   row to the repo's experiment register (slug, angle, score).
9. **Weekly:** read the numbers, promote winning angles, write losers as lessons
   ([references/measurement.md](references/measurement.md)).

   **Hand over** the way the repo's notes say (a drive folder, a media store, a scheduler).
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
  "intake": { "selling": "…", "audience": "…", "action": "…", "result": { "text": "a true number", "source": "where from" } },
  "experiment": { "slug": "batch-angle", "angle": { "dimension": "problem", "value": "…" }, "platforms": ["instagram"] },
  "look": { "image": "assets/reference.jpg", "dim": 0.4 },  // optional: the photo `photo` slides default to
  "covers": [ { "id": "a", "type": "cover", "headline": "…" }, { "id": "b" }, { "id": "c" } ],  // three variants
  "cover": "a",              // the pick
  "score": { "hook": 4, "slide2": 3, "promise": 3, "oneIdea": 2, "legibility": 2, "cta": 2, "honesty": 2, "platformFit": 2, "total": 20 },
  "slides": []               // up to 10, the picked cover and the brand's closing slide included
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
| `photo` | `headline`, `image` (or `look.image`) | `kicker`, `subline`, `dim` (scrim, 0 to 0.8, default 0.35), `alt` |
| `listicle` | `number`, `title` | `kicker`, `body`, `bullets[]`, `image`, `fit`, `theme` |
| `compare` | `before`, `after` (each `{text}`, optional `label`, `image`) | `kicker`, `title`, `theme` |
| `screen` | `title`, `image` | `step`, `kicker`, `body`, `fit`, `theme` |

Any slide takes `loop`, a teaser for the next swipe. `photo` text sits on the photo: the scrim keeps
it legible; pick photos with calm space for words, and photos you have the right to use (your own,
or generated and labelled as the platform requires). A reference image set as `look.image` is the
photo (or the style reference for generating photos) of the whole carousel.

`source`, `finding`, `status`, `report` and `gaps` draw the product from data: they stay sharp in
every format and never show a customer's document. A finding's severity reads as a word, four
gauge dots and a chip at once, so it works without colour. Everything in them is example data and
says so. `chat`: `user` is the prompt as a user would type it, `tool` the real tool name the agent
calls, `agent` the answer with one fact per line and the object in bold. Example data comes from
somewhere real (the app's own example, a changelog, an anonymised real run); say which in `note`.

Inline markup in any product slide text: `*word*` is the brand's accent, `**word**` bold, `\n` a
line break. In a `lettered` line, `*word*` is the one highlighted word (a marker swipe behind it):
one per slide, not three. Image paths are relative to the carousel.json. The closing slide is not
in `slides`: the brand appends it, it counts in the pager, and the slide before it keeps its swipe
hint.

## Copy rules

- Hook: one specific promise in at most 10 words, in the audience's words; the deck delivers it.

- One idea per slide. The cover stops the scroll on its own; the last slide says what to do
  next, the closing slide says where.
- Length: cover headline at most 10 words, titles 14, body 30; lettered slides 2 to 4 short
  lines. When it does not fit at the fixed type size, cut words; never shrink the type.
- One accent per carousel, on the cover: the last two or three words of the headline.
- Only true claims, within the app's own claims ceiling. A stat carries its `source`; the intake's
  result is the only number we lead with, and it is real.
- The CTA matches the landing's and does not contradict the plan: a paid feature does not end
  on a "start free" button. Link the feature's own landing page when it has one.
- Theme rhythm: a dark cover and a dark CTA frame light content slides.
- A mascot is openly the brand's character. No slide pretends to be a real person, a user or
  a review. AI-made imagery carries the platform's AI label.
- Alt text per lettered slide: what the mascot does, then the slide's text.
- Caption: per network, a hook, then two or three sentences in the same voice; 4 to 8
  hashtags, one broad and the rest niche. The caption is searchable text: name the topic plainly.
- No em dashes, in any language.

## Moving an existing carousel to this version

`--strict` now also asks for `intake`, `experiment`, `score`, `caption.md` and `replies.md` beside the
carousel.json, and a slide 2 that is a second cover (`lettered` slides count). Carousels already
posted need nothing; add the new fields (a few minutes, no change to the slides) before re-rendering
one with `--strict`. Without `--strict` everything is a warning. Alt text: `photo` and `lettered`
slides need their own `alt`; the others fall back to their on-slide copy in `out/alt.md`.

## Angle batches

To find what works, make several carousels of one product that differ in **one** dimension
(problem, audience, hook, benefit) and keep the rest fixed. Write a `batch.json`, then
`node scripts/batch.mjs batch.json <out> --date <YYYY-MM-DD>`: one folder per angle (the template with
`experiment` filled in) and `matrix.md`. Write each carousel's words for its angle, then score and
ship each on its own. Two to four angles; more than that splits the views too thin to read.
Details and the weekly review: [references/measurement.md](references/measurement.md).

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
2. Rewrite `theme.css` from the app's design doc: every token, the tints as RGB triplets
   (`--tint`, `--tint-light`, `--shadow-tint`: left unset, they fall back to grey, and the render
   warns), the font variables. If the look differs in more than colour and type (no shadows,
   another chrome), add a `slides.css` whose rules start with `.brand-<id> .slide` so they outrank
   the shared ones.

3. For lettered carousels: generate the mascot once (8 to 12 named poses as standalone images),
   host the poses, list them under `mascot.poses`. Never redraw the character per carousel:
   consistency is what makes a mascot. A missing pose renders a grey placeholder, so specs can be
   drafted first.
4. An account with a fixed end card gets `outro.<lang>.html`, listed under `outro`.
5. Write the brand's templates (at least one, a `caption.md` and a `replies.md`), each with `"brand": "<id>"`,
   render one in every format and look at it.
