# Explainer videos: the real app, recorded from a storyboard

An explainer shows the product as it is. It is a recording of the real app, driven by a script,
silent, 20 to 40 s, with short captions. A changelog entry carries it, and the app can offer it on
the page it explains. It is not a film: no roles, no style, no beat grid, no music.

| Make | When |
|---|---|
| An explainer (`scripts/record.mjs`) | a user has to understand a new section or flow; the screen itself is the message |
| A coded film (`render.mjs`, the studio) | a launch, a teaser, a store loop: motion design, sound, a story |

## The storyboard

One JSON file per explainer, in the repo (the repo's notes say where). It is the only thing a new
video needs, so it can be recorded again when the UI changes.

```json
{
  "out": "public/video/explainers/bulk-export.mp4",
  "page": "/app/reports",
  "seed": "Where the data on screen comes from, so it can be recorded again",
  "setup": [
    { "goto": "/login" },
    { "type": { "css": "#email", "env": "DEMO_EMAIL" } },
    { "type": { "css": "#password", "env": "DEMO_PASSWORD" } },
    { "click": "Log in" },
    { "wait": { "url": "**/app/**" } }
  ],
  "steps": [
    { "goto": "/app/reports" },
    { "click": "Not now", "optional": true },
    { "caption": "Select the rows you need.", "hold": 2600 },
    { "click": "Export" },
    { "caption": "Pick CSV or Excel.", "hold": 2200 },
    { "click": { "css": "[aria-label='Format']" } },
    { "caption": null }
  ],
  "mocks": [{ "url": "**/api/files/42?*", "file": "assets/report.pdf" }]
}
```

- `page` is the screen it explains, so the app can link the video from there.
- Steps: `goto`, `caption`, `scrollTo`, `click`, `hover`, `type`, `press`, `wait`, each with an
  optional `hold` in ms. A `click` takes an accessible name (button, menu item, link, tab) or
  `{ "css": selector }`; `"optional": true` skips it when the target is not there (a popover that
  shows only sometimes). The header of `scripts/record.mjs` lists every field.
- Optional: `viewport` (default 1440x900), `colorScheme` (default light), `caption`
  (`{ "background", "color" }`, default near-black with white text), `hide` (selectors never shown,
  added to the common dev overlays).

## Setup and login

`setup` runs first in a browser context that is not recorded. Its cookies and storage carry into
the recording, so the video opens already logged in. Log in with a test account the repo seeds,
never a real person's account and never a real password. A `type` step reads the value from the
environment variable it names (`"env": "DEMO_EMAIL"`), so no credential sits in the storyboard,
and the recorder never prints it. Data on screen is seeded test data, never a customer's.

## Mocks

A service the local stack lacks (file storage, a third-party API) is answered for the recording
only: a URL pattern with `json`, or with a `file` relative to the storyboard. Keep the stand-ins
beside the storyboard, in an `assets/` folder.

## Captions

One at a time, one short line each, saying what the viewer should notice now. Hide one
(`"caption": null`) before the next screen does the talking. Captions are UI copy: the product's
language and form of address, through the `unslop` skill, no em dashes. The pill uses the page's
own font.

## Recording

From the app's folder, with the dev server up (and `playwright` and `ffmpeg` installed):

```bash
node <skills>/video/scripts/record.mjs path/to/storyboard.json --base=http://localhost:3000
```

It records Chrome's screencast at 2x and writes a 30 fps H.264 MP4 at the viewport width, without
audio. A still frame lasts at most 3 s: a longer pause needs a step that changes the screen, or
the recorder warns and shortens it. Aim for 20 to 40 s and under 2 MB.

Look at it before you use it: one contact sheet is quicker than watching.

```bash
ffmpeg -i out.mp4 -vf "fps=1/3,scale=480:-2,tile=4x3" -frames:v 1 sheet.png
```

## Where it goes

An explainer the app ships is part of the product: it is committed to the app's public folder or
uploaded to the media store, as the repo's notes say. Reference it from every locale's changelog
entry. When the UI it shows changes, record it again from the same storyboard (fix the selectors
first); an explainer that shows an old screen is worse than none.
