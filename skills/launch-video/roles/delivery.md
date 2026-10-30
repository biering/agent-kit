# Delivery: formats, the media store, the X player card

Delivery turns a passed film into the files and links the Producer's deliverables table lists, and
puts them where people watch.

**Gate: the yes gate.** Nothing goes public without the user's yes on the final cut, every cut it
will post and its caption, in this session. Approving the stills or an earlier round is not that
yes. **Artifact:** the links (and `caption.md` when the film is posted), ticked off in the
README's deliverables table.

## One film, every format

A reel is not a second film. `film.html` reads `?format=reel`, so score, data, copy and beats
exist once; a format owns only where things sit ([formats.md](../references/formats.md)).

| Format | Size | Where |
|---|---|---|
| 16:9 | 1920x1080 | X, YouTube, landing, LinkedIn |
| 1:1 | 1440x1440 | feed |
| 9:16 | 1080x1920 | Reels, TikTok, Stories |
| 21:9 | 3840x1646 | the App Store header loop |
| 3:2 | 3600x2400 at most | the search-result tile (3840x2560 is H.264 level 6.0: a Mac's hardware decoder refuses it) |

Every cut that ships is rendered, measured (`qa.mjs --style <style>`, with the loop profile for a
loop) and, if it carries sound, listened to (earshot) on its own encoded file: the 9:16 cut of a
film read two more visual events than its 16:9 cut and failed a sync check the wide one passed.
`render.mjs --matrix 'format=wide,reel' --out out/film.mp4` renders every format beside the other
with its own manifest.

## The media store

The repo's notes (`docs/agent-kit/launch-video.md`) name the uploader, the store for rendered files
and the scheduler. Rendered video is never committed: it is an output. Upload it where the repo
says (an R2 bucket through the repo's media command) and hand over the link. Licensed audio is
never committed either: `sources` in `cues.json`, and a `.gitignore` beside the film:

```text
music/
sfx/
*.mp4
*.mp4.json
*.mp4.qa.json
```

## The film's folder

A film is source code and lives in the repo, one folder per film (the repo's notes say where):

```text
<films>/<YYYY-MM-DD-slug>/
├── BRIEF.md      # committed: the Producer's brief, claims ledger, budget
├── LOOK.md       # committed: the Designer's look book
├── film.html     # committed (and spec.js, for a style that has one)
├── cues.json     # committed: bpm, music start, every SFX cue, the URL each asset came from
├── caption.md    # committed: the post text per channel, when the film is posted
├── README.md     # committed: beat map, where every number comes from, rounds, scores, QA and earshot
└── .gitignore
```

Commit the source the moment it exists. A film rendered from a scratchpad and uploaded was later
needed for a two-line fix (a logo, an icon), and there was nothing to fix: it was built again.

A set of variants (one video per pattern, length or format) stays one `film.html` that reads its
variant from the query string; a small build script beside it renders each variant and writes
each one's `cues.json`.

## Ship

On X, a player card turns the film into something that plays inside the post:
[x-player-card.md](../references/x-player-card.md), checked live with
`node $K/player-card.mjs <url>`. A store loop goes where the repo's notes say; Delivery hands over
the file and its measured numbers (size, level, loop seam).

## Hard rules

- Nothing goes public without the user's yes on the final cut.
- Real product, real claims: numbers on screen are the product's, the README says which file each
  came from; no invented customers, objects or results; the copy obeys the app's claims ceiling.
- Every on-screen line goes through the `unslop` skill before the final render, no em dashes.
- The end card does not contradict the plan: a feature that is paid in part says which part.
- Licensed audio and rendered video are never committed.
