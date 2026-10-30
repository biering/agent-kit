# Editor / QA: measured checks and the scored critique

The Editor does not say a film looks right: it measures the encoded file against the style's QA
profile and scores the beats from images it opened. Two checks, neither optional.

**Gate: the QA gate.** `qa.mjs` prints `QA PASSED` on the encoded file of every cut, every beat
scores 8 or higher in the critique (or a line says why one stays), and the pop scan is read.
**Artifact:** the `<video>.qa.json` report, and the critique blocks in the README.

## Render, then measure

```bash
node $K/render.mjs <film>/film.html --purity --out impure/
node $K/render.mjs <film>/film.html --out silent.mp4 --subframes 8 --qa <style>   # render, then measure: a miss fails the run
node $K/qa.mjs silent.mp4 --style <style> --silent          # the same check on its own: no audio targets before the mix
python3 $K/mix.py <film>/cues.json silent.mp4 <film>/<slug>.mp4
node $K/qa.mjs <film>/<slug>.mp4 --style <style> --json     # the final: every target, loudness too
python3 $K/popscan.py silent.mp4
```

`--draft` renders a fast look (one sample per frame, no motion blur, crf 26) in a fraction of the time:
use it while the film changes, and `--qa <style>` on a draft is a smoke test (the profiles are calibrated on a
real render, and a draft can read a little differently), never the gate. The gate is the final's.

`render.mjs` sizes the workers to the machine's memory, writes H.264 High, yuv420p, BT.709 limited
range at a level the Mac hardware decoder plays, and a `<out>.json` beside the video (the film, its
query, the commit, whether the film's folder had uncommitted edits, the settings). A
`dirty: true` final is rebuilt from a commit before it ships, so the next fix starts from the
source that made it. `--crf` sets quality: 14 is a master, 24 to 28 a deliverable on flat colour;
film grain is the expensive part of a frame, halve it before raising the CRF. Slow footage needs no
motion blur: `--fps 30 --subframes 1`. A 22 s 1080p film at 8 subframes takes a few minutes.

### What `qa.mjs` measures

Per [qa.md](../references/qa.md), from the encoded file, never from the page:

| Check | What it catches |
|---|---|
| Still frames (share) | a film that parks: slides with good easing |
| Longest hold | one shot that rests too long, with the time it starts at |
| Hard cuts per 10 s | too few (slow) or too many (frantic) for the style; a one-take style allows none |
| Loop seam | the step from the last frame back to the first against the film's own steps |
| File size, H.264 level, pixel format | a file a store or a phone refuses, or colours shifted by a wrong tag |
| macOS hardware decoder | a file QuickTime cannot play (level 6.0 plays in ffmpeg and nowhere on a Mac) |
| Frame count and size against the manifest | frames lost in a worker join, a capture at the wrong scale |
| Audio present or absent, loudness, true peak | no sound on a film that needs it, sound on a muted loop |

A target the profile names and the film misses fails the run. Read the line, fix the film (a hold
is a missing move, a still share is a parked layer), render again. Do not change the profile to
make a film pass: the profile is the style's, and a film that needs different numbers is a
different style (back to the Director). A deliberate exception (a film that breathes) is a
`--profile` of its own beside the film with the reason in its `description`.

`popscan.py` flags single-frame pops: frame differences three times their neighbours. Look at
every pop it reports. A deliberate hard change (a flood finishing, a cut) also flags; decide each
one, do not suppress the check. Check each handoff in the encoded file too: motion blur can open a
seam the `cuts` stills did not show, and a seam between two layers shows as a one-frame jump the
scan can miss:

```bash
ffmpeg -i silent.mp4 -vf "select='between(n\,1000\,1007)',scale=480:-1,tile=4x2" -frames:v 1 seam.png
```

## The scored critique

The visual twin of earshot ([critique.md](../references/critique.md)): render stills, a contact
sheet, the phone sheet and the `cuts` sheet, open them, score every beat 1 to 10 on the rubric,
fix the 3 worst problems, render again, stop when every score is 8 or higher. Run it at the
gates: the four stills, the full pass, and the final on the encoded file. The scores go in the
README next to earshot's and `qa.mjs`'s.

## Effort

`medium` to re-render and re-measure; the critique itself is `xhigh` on a new film, because a
harsh score is the whole point.
