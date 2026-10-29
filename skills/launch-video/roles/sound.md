# Sound: music at a known tempo, an effects kit, the mix

You cannot hear the film, so Sound measures it: a beat grid for the music, recorded effects placed
by their measured onset, a loudness target, and a listening gate that scores the result.

**Gate: the earshot gate.** The mixed file sits at -14 LUFS with a true peak of -1 dBTP or lower,
and `earshot critique` has no open `[critical]` or `[major]` line (or the README says why one
stays). **Artifact:** `cues.json` (committed; licensed audio is fetched, never committed) and the
scorecard summary in the README. The style's `audio.json` is the starting profile: tempo band,
structure, a recorded pick, a kit, levels.

## Music at a known tempo

Pick the music for the product's temperament, not for energy: a calm app wants 70 to 95 BPM with a
quiet breakdown, a competent tool 100 to 125 with a quiet build and one clear drop, an energetic one
110 to 130, kinetic type 128 to 175.

```bash
python3 $K/mixkit.py music corporate          # id, title, URL
curl -sfL -o music/726.mp3 https://assets.mixkit.co/music/726/726.mp3
.venv/bin/python $K/beats.py music/726.mp3 --bpm 134 --start 6 --window 40 --drop-beat 16
```

### The beat-grid fit

`beats.py` fits a grid on the stretch the film plays, with the tempo you intended:

- `--bpm N` is the tempo you asked for. The fit searches within 4% of it (`--range`) and reports
  the fitted `bpm`, `drift_pct` and `drift_ms_per_min`; `--pin` trusts it exactly and fits only
  where the beats fall. Without `--bpm` the tool can lock to half or two thirds of the real tempo.
- `--start S --window W` fit only that stretch. A generated track drifts, and the film needs only
  its own stretch to be exact: a 0.15% error puts the last hits of a 50 s film 70 ms late.
- It reports `offset` (the first downbeat in the window, the film's beat 0), `downbeats`, the
  `drops` (the downbeat after which each of the next two bars is louder than the bar before, by
  the most; a rise out of near silence is the song starting, not a drop), `grid_strength` (0 to 1;
  under about 0.3 means it did not find a grid: do not trust the rest) and `bar_loudness_db`.
- `--drop-beat N` prints `start`: where to start the song (`music.start` in `cues.json`) so its
  strongest drop lands on film beat N, and warns when N is not a bar line (a multiple of 4).

Read `bar_loudness_db` yourself: the drop is the bar where the level steps up and stays up.
Assumes 4/4. Check the fit by ear on the first render: the first hit on a downbeat.

### Generated music (optional)

Higgsfield's MCP (`generate_audio`) is our provider when a recorded track does not fit the tempo
or the mood. Its catalog changes: list it first (`models_explore` with type `audio`) and use only a
model the catalog offers for standalone music; as of the last check only speech models and
game-pipeline music were listed. The prompt takes the tempo as words ("fixed 128 BPM"), there is no
tempo field, so the tempo is a claim: fit the take with `beats.py --bpm` and trust the fit.
Always dry-run first (`get_cost: true`), tell the user the price, run only after the yes, ask for 2
takes and 15 s more than the film, and keep the takes out of git like any licensed audio.

## Effects: recorded, never synthesized

```bash
python3 $K/mixkit.py sfx whoosh               # click pop whoosh swoosh transition chime bell magic
.venv/bin/python $K/peaks.py sfx/*.mp3        # onset, peak and level of each effect
```

Always use recorded effects. A synthesized beep or oscillator whoosh reads as cheap beside a
professional film; earshot measured recorded effects ahead of synthesized ones on 7 professional
films (`realness`), so recorded stays the rule. Placement is by the effect's onset (or `"anchor":
"peak"` for a whoosh or a riser that should peak on the cue), not its file start; `mix.py` does it.

## Cues in beats

Write every cue in beats and the cue sheet follows a tempo change with one edit:

```json
{ "bpm": 134, "duration_beats": 51, "normalise_sfx": true,
  "music": { "file": "music/726.mp3", "start": 7.226, "gain_db": -6, "stop_beat": 41 },
  "sources": { "music/726.mp3": "https://assets.mixkit.co/music/726/726.mp3" },
  "cues": [ { "beat": 16, "file": "sfx/2908.mp3", "gain_db": -6 }, { "beat": 17.5, "file": "sfx/1492.mp3", "anchor": "peak" } ] }
```

- `normalise_sfx` sets each effect's loudest sample to -1 dBFS before its `gain_db`, so a gain
  says where it sits against the others (recorded levels differ by 20 dB from file to file).
- `music.stop_beat` cuts the music dead on a beat with a 30 ms fade: the end card's first hit.
- `mix.py` downloads what `sources` lists and is missing, limits, measures the file and lowers its
  ceiling until the true peak holds at -1 dBFS, and cuts picture and sound at the picture's length
  (no `-shortest`: it dropped the last frames when the audio was a few milliseconds short).
- If the result sits well under -14 LUFS, the limiter is working too hard on clicks: turn those
  cues down (a click at -10 dB, a pop at -8) rather than the music up.
- For kinetic, `node styles/kinetic/cues.mjs spec.js` derives the sheet from the blocks. For the
  other styles write it by hand or with a small `make-cues.py` beside the film.
- Accents on the moments, not on every cut: a designed sound on the reveal, the logo, the key UI
  action and section changes. Dense music covers the cuts.
- Sound starts with the film: the first sound within about 0.3 s and the opening near body level.

```bash
python3 $K/mix.py <film>/cues.json silent.mp4 <film>/<slug>.mp4
ffmpeg -i <film>/<slug>.mp4 -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:"
```

## The listening gate (earshot)

[earshot](https://github.com/Leonxlnx/earshot) (MIT, CPU-only) scores the film against 7
professional launch films, writes a second-by-second listening transcript with a sync check, and
draws an annotated sheet. `earshot.sh` installs it on first use (a pinned checkout, a venv and
about 1.1 GB of models under `~/.cache/agent-kit/earshot`, never in a repo). It is optional: if
the install fails, note the skipped gate in the README.

```bash
$K/earshot.sh critique final.mp4                     # scorecard + FIX FIRST list; --fast skips the models
$K/earshot.sh timeline final.mp4 --cues cues.json    # transcript; sound against cuts and our cues
$K/earshot.sh sheet final.mp4 -o sheet.png           # annotated PNG: open it and read it
```

Fix every `[critical]` and `[major]` line and re-run, or write in the README why a flagged line
stays (a film that deliberately breathes against the references' flat loudness arc is a reason; an
unread line is not). Run it on every cut that carries sound: a taller frame can read more
visual events. Record the final scorecard summary in the README.

## The soundtrack, measured

Rules from earshot's playbook on 7 professional launch films, plus web-delivery practice:
sound starts with the film (first sound within about 0.3 s); land the ending at body level with a
short fade (median 0.27 s); a steady, loud body (shape energy with arrangement, not big level
changes); accents on moments, not every cut; recorded effects; master at -14 LUFS integrated, true
peak -1 dBTP, limiter last. A muted loop has no audio track at all (`qa.mjs` checks it).

## Effort

`medium`: a retimed cue, a new pick. `xhigh` when the tempo or the song changes the beat map.
