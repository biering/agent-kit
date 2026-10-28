# Demo video

A screen recording of the app on a real iPhone with a short text caption over
each section. It goes in App Review Information as an attachment (App Store
Connect accepts a video there; keep it a modest size and a common format, mp4 or
mov). Reported as the highest-return step in the whole process, so do it for
every first submission and for any update that changes how something works.

## Length and shape

60 to 90 seconds for a small app, up to about three minutes for a large one.
Real taps, real speed, no voice needed. Each section gets a caption that says
what the reviewer is looking at and what they can do there.

## The shot list

Use this order and drop what does not apply.

1. First launch on a fresh install. Caption: what the app is, in one line.
2. Onboarding, if any, including how to skip it. Caption: what each choice does.
3. Each permission prompt, at the moment it appears. Caption: why it is asked.
4. The core action, done once from start to finish.
5. Every other feature, one short shot each, matching the "How to reach each feature" bullets.
6. The paywall: how to reach it, what it shows, what stays free. Then the sandbox purchase and the unlock. Then Restore Purchases.
7. Settings: consent switches, account deletion, language, support and privacy links.
8. Anything unusual from the notes, shown rather than described. A risky pattern held for later is shown here too, so the reviewer sees it was considered.
9. If there is user content: report, block, contact support.

Record on a device when you can. Use a throwaway account and a clean state. Do
not show notifications from other apps, real names or emails.

## Caption style

Same rules as the notes: short, plain, no hype. One or two lines, readable on a
phone, big type, a calm background pill, on screen for the whole shot. Number the
captions so the notes can point at them ("see shot 6").

## Rendering the captions

Record the raw screen capture first, then lay the captions over it in code with
the `launch-video` pipeline (`.agents/skills/launch-video/SKILL.md`):

1. Copy `templates/film.html` and replace the scene with the raw clip as a
   `<video>` layer, seeked from `seek(t)`. The clip is the background; the caption
   pill is drawn per shot from a list of `{ start, end, text }`.
2. Keep the look flat and quiet: no music, no camera moves, no motion blur
   needed. The craft rules matter less here than clarity.
3. Render with `scripts/render.mjs` to an mp4 at the phone's own aspect ratio.
   Skip the audio mix.
4. Watch it once at normal speed. Every caption must be readable before the next
   one starts.
5. Attach the file in App Store Connect under the version's App Review
   Information. Keep the source (film.html and caption list) in the app's
   distribution folder so a later version re-renders in minutes.

If the pipeline is more than the job needs, any editor that burns in text works.
The captions and the shot list are what matter.
