# Setting up the studio (once per machine)

Work in the session scratchpad, not the repo: a numpy venv and a Playwright install.

```bash
brew install ffmpeg                                   # ffmpeg + ffprobe
python3 -m venv .venv && .venv/bin/pip install numpy
npm init -y && npm i playwright && npx playwright install chromium
```

No Homebrew: `npm i ffmpeg-static` and link its binary onto `PATH`. `popscan.py` and `qa.mjs`
need `ffprobe`. `qa.mjs`, `render.mjs` and `cues.mjs` need only Node 22 and ffmpeg; `beats.py`,
`mix.py`, `peaks.py` and `popscan.py` need numpy. `ffprobe-static` ships an x86 binary for Apple
silicon: get `ffprobe` from Homebrew or a static build for the right architecture.

`K=<repo>/.agents/skills/launch-video/scripts` in every command, run from the studio folder (where
`playwright` resolves). Prove the pipeline before writing a film: copy a style's
`starter/film.html` and `starter/spec.js` into the film's folder (or `templates/film.html` for a
film outside the styles), render stills, look at them.

```bash
node $K/render.mjs <film>/film.html --stills 0,1,2 --out stills/
```

A missing file (`[404] <url>`), a failed request or a page error stops the run before the first
frame; `--lenient` lets a sketch through. Mixkit's licence allows its files in a video, not
redistributing them, so a film commits `cues.json` with a `sources` map and `mix.py` downloads
anything missing.
