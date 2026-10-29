---
name: launch-video
description: Make a studio-grade launch film in code (seek(t) HTML, Playwright, motion blur, Mixkit audio on the beat) and ship it, on X as a player card. Use for a launch video, feature film, promo clip, app trailer.
---

# Launch video

Read the repo's `AGENTS.md` and `docs/agent-kit/launch-video.md` first; they win where they
differ from this skill.

A launch film is a single HTML page with a function `seek(t)` that draws any moment of the
film, and nothing else: no CSS transitions, no timers, no state carried between frames. Because
every frame is a pure function of time, the renderer can take frames in any order, blend several
per output frame for motion blur, and split the work across parallel browser pages. When a
moment looks wrong you fix that one function.

What makes it look like a studio made it is the rules in
[references/craft.md](references/craft.md), the first thing to read.

## What lives where

```text
launch-video/
├── references/
│   ├── craft.md          # the look, the motion and sound rules, the gotchas: read first
│   ├── moves.md          # the catalog: 16 moves, when to reach for each
│   ├── briefs.md         # six proven film structures to adapt
│   └── x-player-card.md  # shipping the film inside a post on X
├── templates/
│   ├── kit.js            # motion kit: easing, springs, camera, project, masks, the moves, the viewer
│   ├── icons.js          # Lucide icons for rebuilt screens: icon('file-text', 28)
│   ├── brand.css         # placeholder tokens; a film links the repo's own brand.css
│   ├── film.html         # a 2 s test scene on the kit and the brand
│   └── moves.html        # the catalog playing: every move, four beats each
└── scripts/
    ├── render.mjs        # seek(t) page → stills, seams, phone sheet, purity, variants, mp4 + manifest
    ├── mixkit.py         # what a Mixkit tag offers: id, title, URL
    ├── beats.py          # tempo, beat grid, drop and per-bar loudness of a track
    ├── peaks.py          # onset and peak of each sound effect
    ├── mix.py            # music + SFX on the timeline (beats or seconds), loudnorm to -14 LUFS, mux
    ├── popscan.py        # single-frame pops: frame differences 3x their neighbours
    ├── earshot.sh        # the listening gate: installs earshot outside the repo, runs its CLI
    └── player-card.mjs   # checks a live URL the way X's card crawler sees it
```

A film is source code and lives in the repo, one folder per film (the repo's notes say where):

```text
<films>/<YYYY-MM-DD-slug>/
├── film.html     # committed
├── cues.json     # committed: bpm, music start, every SFX cue, the URL each asset came from
├── caption.md    # committed: the post text per channel, when the film is posted
├── README.md     # committed: beat map, where every number on screen comes from, notes per round
└── .gitignore    # music/ sfx/ *.mp4: licensed audio is fetched, the video is an output
```

Commit the source the moment it exists. A film rendered from a scratchpad and uploaded was
later needed for a two-line fix (a logo, an icon), and there was nothing to fix: it was built
again. Mixkit's licence allows its files in a video, not redistributing them, so `cues.json`
carries a `sources` map and `mix.py` downloads anything missing.

**A set of variants** (one video per pattern, length or format) stays one `film.html` that reads
its variant from the query string (`render.mjs 'film.html?format=reel'` or
`--query 'pattern=box&minutes=5'`). A small build script beside it renders each variant and
writes each one's `cues.json`.

## The brand: the product the feature lives in

A film is made in the look of the product that ships the feature, never another one. The repo
keeps one `brand.css` per product (tokens, `@font-face` by root-absolute repo path, type scale,
building blocks), built from that app's `DESIGN.md`; `templates/brand.css` lists the variable
names. A product with no brand file gets one first. A designer's motion kit for a brand beats
`craft.md` where they differ.

## Workflow

### 0. Intake

Read what the repo already answers before asking anything:

- The claims: the feature's changelog entry, the app's pitch or store listing, the code.
  Every sentence on screen must be in there.
- The screens: real screenshots. The film rebuilds them in HTML at true proportions, with the
  numbers they show.
- The plan gate: the pricing source of truth in code, never a changelog (an entry is true on
  its date and nobody rewrites it). A feature that is partly paid says so on the end card.
- The look: the brand's `brand.css`, the app's `DESIGN.md`, the mark's SVG.

Write down what is missing: no changelog entry, a screen the story needs with no screenshot, a
number with no file it came from, a plan gate you cannot read. Each gap is closed (the user
supplies it, or the beat that needed it goes) before the beat map. A film started with a gap
fills it with an invented number.

Then ask, in one round with your recommendation first, only what is left:

- the **one story**: the single moment a user has with the feature (a fixed rate ends in five
  months; close your eyes and a tone paces you)
- **format**: 16:9 1920x1080 (X, YouTube, landing, LinkedIn), 1:1 1440x1440 (feed),
  9:16 1080x1920 (Reels, TikTok, Stories)
- **length**: 15 s for one thing, 20 s for a page with three, 30 s is the ceiling for a feed
- **gate**: stop at the beat map and four stills (step 3), or build through and take notes on
  the finished film
- **reference**: a video they want the structure of, or none

A reference video gets broken into beats first:

```bash
ffmpeg -i reference.mp4 -vf "fps=2,scale=480:-1,tile=6x4" contact-%02d.png
```

Write down per beat: what happens, how each scene turns into the next, the camera move, colours
and type. Then write the same structure for this feature in moves from
[references/moves.md](references/moves.md): the reference gives structure and rhythm, the brand
gives the look, and what the reference does that the brand bans is translated by that file's
"Seen and left out" table. With no reference, pick from [references/briefs.md](references/briefs.md).

### 1. Set up the studio (once per machine)

Work in the session scratchpad, not the repo: a numpy venv and a Playwright install.

```bash
brew install ffmpeg                                   # ffmpeg + ffprobe
python3 -m venv .venv && .venv/bin/pip install numpy
npm init -y && npm i playwright && npx playwright install chromium
```

No Homebrew: `npm i ffmpeg-static` and link its binary onto `PATH`. Only `popscan.py` needs
`ffprobe`. `ffprobe-static` ships an x86 binary for Apple silicon: get `ffprobe` from Homebrew or
a static build for the right architecture.

`K=<repo>/.agents/skills/launch-video/scripts` in every command below, run from the studio.
Prove the pipeline before writing the film: copy `templates/film.html` into the film's folder,
point its stylesheet at the brand, render the 2 s test (a dot springs into a pill), look at it.

```bash
node $K/render.mjs <film>/film.html --stills 0,1,2 --out stills/
```

`render.mjs` serves the film over http from the repo's git root, so a film loads the repo's
fonts, images, `kit.js` and `brand.css` by root-absolute path. A missing file (`[404] <url>`), a
failed request or a page error stops the run before the first frame, because a film rendered in a
fallback font is wrong in every measurement; `--lenient` lets a sketch through. A film that must
survive kit updates unchanged copies `kit.js` beside itself.

### 2. Music and sound

Pick music for the product's temperament, not for energy: a calm app wants 70 to 95 BPM with a
quiet breakdown, a competent tool 100 to 125 with a quiet build and one clear drop, an energetic
one 110 to 130.

```bash
python3 $K/mixkit.py music corporate          # id, title, URL
python3 $K/mixkit.py sfx whoosh               # click pop whoosh swoosh transition chime bell magic
curl -sfL -o music/33.mp3 https://assets.mixkit.co/music/33/33.mp3
.venv/bin/python $K/beats.py music/33.mp3     # bpm, beat grid, drop, loudness per bar
.venv/bin/python $K/peaks.py sfx/*.mp3        # onset and peak of each effect
```

`beats.py` can pick a half or double tempo on sparse tracks, and it reports the *first* big rise
as the drop, which on a track with a soft intro is the song starting. Read `bar_loudness_db`: the
drop is the bar where the level steps up and stays up. Pin the tempo with `--bpm` if needed.
Start the song so its drop lands on the film's turn (`music.start = drop - n * beat`). Always use
recorded effects. A sound is placed by its onset, not its file start, which `mix.py` does for
you. `music` is optional: without it `mix.py` lays the effects over silence, for a film paced by
the product's own sounds.

### 3. The beat map, then four stills (the gate)

Before the full film exists, write the beat map (every scene, what happens on which beat, the
move it uses, the camera move, the sound) and build just enough of `film.html` to render four
stills: the open, the turn, the product moment and the end card. Show both and wait, unless the
user chose to build through. Changing a plan costs a sentence; changing a finished film costs an
hour.

Every beat block names its move (`b8 to b12: tally, five cost items, total 196`), chosen by what
the beat has to say; render `templates/moves.html` to see them. One handoff per film is not from
the catalog: name it in the beat map as the film's own.

### 4. Build the film

Start from `templates/film.html`. `templates/kit.js` carries easing, closed-form springs,
keyframes, a log-space camera, `project` (where a world point sits on screen), `riseWords`, `pop`,
`show`, and the pieces the moves are made of: `count`, `typed`, `draw`, `along`, `route`, `ring`,
`wipe`, `edges`, `bump`. A move's cell in `templates/moves.html` is the code to start from. Write
every time as a beat (`b(12)`), so the film stays on the grid and a tempo change is one constant.

Keep the data apart from the drawing: the numbers and lines on screen go in arrays at the top of
the script (`KPIS`, `ROWS`, `COPY`), copied from the screenshots and the claims, so a reviewer
checks them in one place and a variant swaps them without touching a move. List every handoff in
`window.film.cuts` (seconds, `[b(8), b(16)]`) as you build it.

```bash
node $K/render.mjs <film>/film.html --serve      # a URL; space plays, arrows step a beat, shift+arrow a frame
node $K/render.mjs <film>/film.html --stills every:2 --out stills/ --contact contact.png
node $K/render.mjs <film>/film.html --stills b15.4,b23,7.6 --out stills/   # b<n> is a beat, a bare number seconds
node $K/render.mjs <film>/film.html --stills cuts --out seams/ --contact seams.png   # before, on, after each cut
node $K/render.mjs <film>/film.html --stills every:4 --out phone/ --contact phone.png --tile 360
```

Review in three passes. The contact sheet shows the story and the composition. `cuts` shows every
handoff a frame either side, where a seam or a label that has not left yet hides between the
stills of a regular sheet. `--tile 360` is the film at the width a phone feed plays it: read it
there, not at 1080p. Every still also lists text drawn under 20 px per 1080 px of the frame's short
side (`small text: 14 px "Fixed rate"`); a label caught mid-pop shows up too, so open that still
before resizing anything. Overlaps and cropped labels only show at full size: open two or three
stills themselves.

### 5. Render, check, mix

```bash
node $K/render.mjs <film>/film.html --purity --out impure/
node $K/render.mjs <film>/film.html --out silent.mp4 --subframes 8 --workers 6
.venv/bin/python $K/popscan.py silent.mp4
.venv/bin/python $K/mix.py <film>/cues.json silent.mp4 <film>/<slug>.mp4
ffmpeg -i <film>/<slug>.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:"
```

`--purity` draws a frame every two beats, seeks to the end and the start, and draws it again. A
frame that comes back different (under 60 dB) renders differently on each worker and smears under
motion blur. Causes so far: state carried between frames, and text inside an element being
scaled at that moment (40 dB on a shrinking caption pill).

A 22 s 1080p film at 8 subframes takes about two minutes on six workers; `--subframes 4` for
drafts. Slow footage (a breathing shape, a timer) needs no motion blur: `--fps 30 --subframes 1`.
`--crf` sets quality: 14 is a master, 24 to 28 a deliverable on flat colour; film grain is the
expensive part of a frame, halve it before raising the CRF further. Look at every pop the scan
reports, and check each handoff in the encoded file too (motion blur can open a seam that the
`cuts` stills did not show), because a seam between two layers shows as a one-frame jump the pop
scan can miss:

```bash
ffmpeg -i silent.mp4 -vf "select='between(n\,1000\,1007)',scale=480:-1,tile=4x2" -frames:v 1 seam.png
```

Every video gets a `<out>.json` beside it: the film, its query, the commit, whether the film's
folder had uncommitted edits, and the render settings. A `dirty: true` final is rebuilt from a
commit before it ships, so the next fix starts from the source that made it.

`mix.py` limits, encodes, measures the file and lowers its ceiling until the true peak holds at
-1 dBFS. If the result sits well under -14 LUFS, the limiter is working too hard on clicks and
pops: turn those cues down (a click at -10 dB, a pop at -8) rather than the music up. Cues take
`beat` with a top-level `bpm`, or `t` in seconds.

### 6. Formats and variants: one film, one source

A reel is not a second film. `film.html` reads `?format=reel` and the renderer passes it through,
so score, data, copy and beats exist once and a note lands in every cut. A format owns only where
things sit: one layout object per format (`L`) and its own camera keyframes.

The same holds for the other two axes a campaign varies. A **hook** (`?hook=problem`, `result`,
`feature`) swaps the opening beats up to the film's turn and lands on the same frame, so everything
after the turn is shared. A **CTA** (`?cta=try`, `demo`) swaps the end card's line. Each hook is
its own beat-map line and approved still (step 3) before it is code, and each CTA line is a claim
like any other. Build the variants only after one cut is approved: a matrix of an unfinished film
multiplies its notes. Then render every combination in one command, each beside the other with its
own manifest:

```bash
node $K/render.mjs <film>/film.html --matrix 'format=wide,reel;hook=problem,result' --out out/film.mp4
node $K/render.mjs <film>/film.html --matrix 'format=wide,reel' --purity
```

For 9:16:

- Re-lay the page out, do not shrink it. Rebuild it the way the app reflows on a narrow
  screen (key figures in two columns, a label above its bar, a table row's label above its
  cells), about 680 world units wide, framed at 1.4x.
- Keep what must be read between y 220 and 1580: Instagram and TikTok cover the top and the
  bottom with their own interface. Aim the camera a little below its subject (`cy + 120 / z`);
  the caption pill sits near y 1470.

- Give each section the frame to itself, a screen apart in the world.
- Break the lines again. A two-line hook becomes three, a one-line end card two. Same words.
- Run every check per format (`--matrix` takes `--purity` and `--stills` too). The reel's purity
  check finds what the wide cut's did not.

### 7. The listening gate (earshot)

You cannot hear the mix, so measure it. [earshot](https://github.com/Leonxlnx/earshot) (MIT,
CPU-only) scores the film against 7 professional launch films, writes a second-by-second
listening transcript with a sync check, and draws an annotated sheet. `earshot.sh` installs it on
first use (a pinned checkout, a venv and about 1.1 GB of models under `~/.cache/agent-kit/earshot`,
never in a repo). It is optional: if the install fails, note the skipped gate in the README.

```bash
$K/earshot.sh critique final.mp4                     # scorecard + FIX FIRST list; --fast skips the models
$K/earshot.sh timeline final.mp4 --cues cues.json    # transcript; sound against cuts and our cues
$K/earshot.sh sheet final.mp4 -o sheet.png           # annotated PNG: open it and read it
```

Fix every `[critical]` and `[major]` line and re-run, or write in the README why a flagged line
stays (a film that deliberately breathes against the references' flat loudness arc is a reason;
an unread line is not). Record the final scorecard summary in the README. earshot's synthesized
effects are a fallback for when no recorded effect fits.

### 8. Director's notes

Hand over the film as a link (the repo's media store) or a path, and take notes the way a
director gives them ("too slow", "that fade looks cheap", "land the zoom on the drop"). Collect a
round before touching the film: every note of one viewing, then one render. Log it in the README:

```markdown
### Round 2 (2026-10-09)

- b14: the pop on the third KPI lands early. Moved to b14.5.
- b30 to b34: end card too short. Held from b32.
```

A note that adds a scene, changes the story or swaps the song is not a revision: take it back
through step 3 (a beat map line and a still, approved) before any code. Patched into a finished
film it breaks the timing of everything after it.

### 9. Ship

The repo's notes name the uploader, the store for rendered files and the scheduler. On X, a
player card turns the film into something that plays inside the post:
[references/x-player-card.md](references/x-player-card.md), checked live with
`node $K/player-card.mjs <url>`.

## Hard rules

- **Nothing goes public without the user's yes on the final cut**, every cut it will post and its
  caption, in this session. Approving the stills or an earlier round is not that yes.
- **Real product, real claims.** Screens rebuilt from actual screenshots and tokens; numbers on
  screen are the screenshots' numbers, and the README says which file each came from. No invented
  customers, objects or results. Copy obeys the app's claims ceiling.
- **Every on-screen line goes through the `unslop` skill** before the final render, no em dashes.
- **The end card does not contradict the plan.** A feature that is paid in part says which part.
- **Licensed audio is never committed.** `sources` in `cues.json`, a `.gitignore` beside the film.
- **Rendered video is never committed.** It is an output: upload it where the repo says and hand
  over the link.
