# Measurement: every batch is an experiment

A carousel is one row of an experiment, never just a post. The repo's notes
(`docs/agent-kit/carousel.md`) name its experiment register, its analytics tool and its social CLI.

## Before posting

- The spec carries `experiment`: a `slug` (it becomes `utm_content`), the `angle`
  (`{dimension, value}`, one of problem, audience, hook, benefit) and the `platforms`.
- Add one row per carousel to the register: slug, angle, score, platforms, post date.
- Every link in a caption, reply or DM carries `utm_source=<platform>` and `utm_content=<slug>`;
  `render.mjs --strict` checks `caption.md` and `replies.md`. `batch.mjs` fills the link with
  `{platform}` to replace per platform.
- Post through the repo's social CLI, which uses the platforms' official APIs. Never scrape, never
  automate a logged-in browser session.

## Weekly

1. Platform numbers per carousel: views, saves, follows (saves and follows outweigh likes).
2. Site numbers per slug: visits and goals, from the analytics tool, by `utm_content`.
3. Compare angles of one batch only against each other: the dimension that varied is the cause.
4. Apply the repo's promotion rule (default: an angle beats the control by 10 % or more at 80 %
   confidence). Below that, keep running; do not declare a winner on a few hundred views.
5. Promote the winning angle: it becomes the base of the next batch, with a new varying dimension.
6. Write every loser as a lesson in the register: the angle, the numbers, one sentence on why it
   probably lost. Do not retry a lost angle without a new reason.

## Angle batches

```bash
node .agents/skills/carousel/scripts/batch.mjs <batch.json> <out-dir> --date 2026-11-03
```

```json
{
  "name": "launch",
  "dimension": "problem",
  "fixed": { "audience": "small landlords", "hook": "a true number", "benefit": "saves time" },
  "angles": [
    { "id": "late-rent", "value": "rent arrives late" },
    { "id": "spreadsheets", "value": "the spreadsheet is out of date" }
  ],
  "template": "<path to a carousel.json>",
  "link": "https://example.com/landing",
  "platforms": ["instagram", "tiktok"]
}
```

It writes one folder per angle (a copy of the template with `experiment` filled in, slug
`<name>-<id>`) and `matrix.md`, the angle matrix. Then write each carousel's words for its angle:
only the varying dimension changes between them. Two to four angles per batch.
