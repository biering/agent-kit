---
name: design
description: >-
  Visual design for landing pages, redesigns and app screens, from the repo's DESIGN.md and UI kit, with a browser look-and-fix loop. Use when building, restyling or reviewing UI, or when a page looks generic or AI-made.
---

# Design

Pick the part that matches the job, read only that part, and finish with the look step at the
end. Motion polish is the upstream `emil-design-eng` skill; components come from the kit the repo
names (see App UI).

| Job | Read |
|---|---|
| A landing page, marketing site, product page, portfolio, one-pager, hero | `references/landing-page.md` (the offer and what the page must answer), then `references/taste/GUIDE.md`, the full run |
| Redesign or review of a page that already exists | `references/redesign.md`, then the taste run from its step 2 |
| App screens: dashboards, settings, forms, lists, onboarding | `references/app-ui.md` |
| A single section or component inside an existing design | match what is there, apply the house rules in `references/taste/GUIDE.md`, and look |

## What holds everywhere

- **The idea comes from the subject.** A page built from category defaults (a centred headline,
  a label above it, three icon cards, a soft gradient) looks like every other generated page.
  Find what belongs to this product and no competitor, and build from that.
- **The repo's design wins.** If the repo or app has a `DESIGN.md`, tokens or a brand file, read
  it first. Map its colours and type onto whatever this skill deals; never restyle a product
  away from its own system without being asked.
- **Real content, full density.** Every section carries its real information. Proof is never
  invented: no customers, quotes, logos or numbers that do not exist.
- **Look at what you made.** Screenshots at phone (390) and desktop (1440) width at least, judged
  as pictures. A problem visible in a screenshot is real whatever the code says. Fix the worst
  three, look again, three rounds at most.

## Tools in the taste kit

In `references/taste/`, run from the project root (Node 22+, an installed Chrome or Chromium):

```bash
node <design>/references/taste/scripts/draw.mjs --options 3 ...   # deal directions
node <design>/references/taste/scripts/assets.mjs "<query>"       # find real, credited pictures
node <design>/references/taste/scripts/lint.mjs <src>             # banned patterns in source
node <design>/references/taste/scripts/inspect.mjs <url>          # measure in a real browser
```

`<design>` is this skill's folder. In `GUIDE.md`, `<skill>` means `references/taste`.

The kit is MIT, vendored from Leonxlnx/taste-skill (see its `README.md`). Improvements go
upstream first.

`references/landing-page.md` adapts the strategy half of elayadesign/ai-design-skills'
`landing-page-design` (MIT); its visual rules are left out where the taste kit or the repo decides.
