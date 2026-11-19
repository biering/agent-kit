# Voice

<!-- The repo's voice file. The unslop skill reads it before every audit or rewrite and appends to
it when the user edits a draft. Default path: docs/agent-kit/voice.md; set another with
"unslop": { "voice": "path/to/voice.md" } in agent-kit.config.json. Keep it per repo and under
about 120 lines: each product has its own voice. -->

## Sounds like

<!-- set these for the repo when you create the file; drop the lines that do not apply -->
- Sentences: short, one claim each.
- Address: Du (or Sie; never switch).
- Emoji: never.
- Contractions: yes in EN.

## Says

<!-- words and moves the user keeps, one per bullet -->

## Never says

<!-- one phrase per bullet; slop_scan.py flags each as voice-ban. A note goes after " -- ",
for example:  - thrilled to announce -- YYYY-MM-DD, cut from the newsletter intro -->

## Learned rules

<!-- newest last, in this format:
### YYYY-MM-DD: short title
**Rule:** one imperative sentence.
**Why:** the edit or note that taught it, quoted where short.
**Applies to:** all | posts | ads | email | landing | in-app
-->
