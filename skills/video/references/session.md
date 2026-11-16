# Session films: the take and the voice

A film about an agent shows a session: a prompt, the tool call, the answer. The session is a
**take**, footage inside a `seek(t)` film, so camera, captions, end card, checks and delivery are
the ones every film has. The `session` style (`styles/session/`) reads the take; this page is how
to make it, and how to give the film a voice. The repo's notes (docs/agent-kit/video.md) name the
product, the clients and where the recordings live.

## Drawn or recorded

- **Drawn** (the default): a page draws the agent's chat from the film's session sheet, in the
  manner of a client. It borrows a look and names the client in plain text; it shows no logo and
  no screenshot of the client. The card in the answer is the product's own and is marked
  "example". Render the page with `render.mjs --fps 30 --subframes 1` and ingest it like a
  recording. It needs neither crop nor blur.
- **Recorded:** a person records a real client session against the product. Nobody drives a
  third-party client with a script: their terms rule out automated use, and it shows. Write a
  shot script first (a test account with demo data, the client, one wide window and one narrow per
  language, the prompt, what to wait for); the drawn session stands in until the recording is
  there.

## Honesty

- **A drawn session is an illustration and says so**, in the frame and beside it: the card says
  "example", and the caption names the session as re-enacted and its objects as examples. No line
  on screen or in the voice calls what is shown real. It runs at the film's pace, so its waiting
  time is a few beats of music and never a claim about the product's speed.
- **A recorded stretch played at least 1.1 times faster than it was recorded is labelled** on
  screen ("time-lapse", in the film's language). Below that it is the recording's own speed,
  within what a moment read off a sheet can be wrong by. Typing played faster claims nothing about
  the product, so that stretch may go unlabelled; a shortened wait for the answer may not.
- **A drawn take never carries the label**: it has no recorded speed to be faster than.

## Ingest

```bash
S=.agents/skills/video/scripts
node $S/take.mjs <film> <recording> --lang=de --sheet          # contact sheets with timecodes
node $S/take.mjs <film> <recording> --lang=de --still=12.5     # one frame at full size, to measure on
node $S/take.mjs <film> <recording> --lang=de --from=2 --to=58 --crop=x,y,w,h --blur=x,y,w,h@12-58
```

Frames land in `<film>/takes/<lang>/` (`f00001.jpg`...), the facts in `take.<lang>.json`. Frame n
is what the screen showed at `from + (n - 1) / fps`. A failed ingest leaves the old frames and the
old JSON as they were. A take name is any lowercase name: `de`, `de-reel`, `en`, `en-reel`. A
drawn page is ingested with `--width=4000` so the film's deepest push still has a pixel of take
under each pixel of frame.

## The cut sheet

Read `moments` (seconds) and `regions` (`[x, y, w, h]` pixels) off the sheets and the still and
write them into `take.<lang>.json` by hand. Both are in the **source** recording's seconds and
pixels, so a second ingest with another trim or crop keeps them: it replaces everything else in
the file. It warns about a moment or region the new trim or crop no longer holds. A new take is a
new JSON file, never an edit of the film page. For a drawn take, the moments are the page's own
timeline and the regions are where it puts things.

## Privacy: crop and blur

- **Crop to the conversation.** The sidebar with other chats and the account name must not reach
  a frame.
- **Blur every third-party photo** (a listing, a profile picture, anything someone else owns).
- The blur comes before the crop and is burnt into the frames at ingest: what it hides is in no
  frame at all.
- **A timed blur** (`@from-to`, source seconds) starts at the last tile of the sheet that does not
  show the thing yet and ends at the first tile that no longer shows it. Tiles are `--every`
  seconds apart, so a window from first seen to last seen leaves it sharp for up to that long on
  either side. When in doubt, leave the time off.

## Speak

The lines are the `text` of each entry of `voice.<lang>` in `cues.json`, beside the cues mix.py
reads; the film's own voice is `voice.speaker` (`{ "voice": "<id>", "model": "<id>" }`, or one per
language).

```bash
node $S/speak.mjs --voices                                        # the account's voices: free
node $S/speak.mjs <film> --lang=de                                # the price: nothing is sent
node $S/speak.mjs <film> --lang=de --voice=<id> --to=<folder> --yes   # try a voice, beside the film
node $S/speak.mjs <film> --lang=de --yes                          # speak with the film's own
```

Speech is paid generation. A run without `--yes` prints the characters it would send and the
account's remaining quota, sends nothing and exits 3. Tell the user the price, and add `--yes`
only after their yes. ElevenLabs bills at least every character of the lines; each line also
carries the lines either side of it as context, so the read sounds like one take, and the run
prints that count too, since whether context is billed is not documented. After a run it prints
what ElevenLabs reports it charged. The key is `ELEVENLABS_API_KEY`, from the environment or a
`.env` in the working directory.

Each line comes back trimmed of silence at both ends, the whole read set to -15 LUFS with one gain,
one 48 kHz wav per line. No line is replaced before all of them are spoken. It prints each line's
length against its slot (to the next line or the end of the film). A line recorded by a person is
the same kind of file and needs no script.

## Voice mix and loudness

```bash
python3 $S/mix.py <film>/cues.json silent.mp4 bed.mp4
node $S/voice.mjs <film> bed.mp4 <film>/<slug>.mp4 --lang=de
```

[voice.mjs](../scripts/voice.mjs) lays each line on its `beat` or `t`, lowers the bed by
`voice.duck_db` (default -9) under it with a 0.25 s ramp (lines under 0.5 s apart share one dip),
and masters to -14 LUFS and -1 dBTP with one gain and a limiter, as [Sound](../roles/sound.md)
does. The voice carries the loudness: with lines at -15 LUFS the gain it prints is near 0 dB;
quieter lines lift the music between them into the limiter, and more than 3 dB off the peaks is a
warning. A language without lines is copied as it is. A film must work muted: the captions tell
the story, the voice adds to it.

## Languages

Each language is its own take (`take.en.json`), its own lines (`voice.en`), its own speak and
voice run, and its own cut and caption beside the first. A reel shape is its own take too
(`de-reel`): a wide window shrunk to a phone is unreadable.

## Out of git

Frames, voice files and cuts stay out of git: the film's `.gitignore` lists `takes/` and
`voice/`. A drawn session is rebuilt from its source; a recording is kept where the repo's notes
say, by hand. `take.<lang>.json` and `cues.json` are committed.
