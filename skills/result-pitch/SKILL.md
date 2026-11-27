---
name: result-pitch
description: >-
  Ask the owner to ship finished work without reading code: a pitch (user benefit, why add it, complexity and why it is worth it, risk and undo, a recommendation) with a video and desktop and phone screenshots of the real app, uploaded and linked, and the distribution drafts. Use when a specced or user-visible PR is green, for 'result pitch', 'ask to ship', '/result-pitch'.
---

# Result pitch

Read the repo's `AGENTS.md` and `docs/agent-kit/result-pitch.md` first; they win where they differ
from this skill. The rule this skill carries out is the kit's `rules/result-review.md`.

The owner approves the result with one key press in the review list. He does not read the code, so
the pitch has to carry the decision: what the user gets, why it is worth what it adds, what it looks
like, what could go wrong and how to undo it. Write it to convince, with facts, never with hype: a
pitch that hides a risk costs more than one that names it.

## 0. Does this PR need one

Yes for a task that had a spec, and for any PR that changes what a user sees. No for a fix, an SEO
page, content and chores: those merge on CI and the board review (`rules/result-review.md` §1). Not
sure: if a user would notice it, it needs one.

Start when the PR is open, CI is green and the board review passed. A red PR is not a result.

## 1. Record the changed flow

A short video of the real app, the flow that changed, start to finish. 20 to 45 seconds.

- Use the `video` skill's recorder: `node <video>/scripts/record.mjs <storyboard.json> --base=<url>`
  (the storyboard form is in that skill's `references/explainer.md`). It records Chrome at 2x with a
  soft cursor and captions, and needs `ffmpeg` and Playwright from the repo.
- Run the app from the branch (the repo's dev server or its PR preview). A test account the repo seeds;
  never a real customer's data, never a real password on screen.
- One caption per step, in the user's words ("Tap the bowl to end the session"), not the code's.
- The flow is mobile-first (an app, a phone-first page): record at the phone viewport as well
  (`"viewport": { "width": 390, "height": 844 }`).

## 2. Screenshots, desktop and phone

Each changed screen, from the branch, at 1440 and at 390 wide:

```bash
node <result-pitch>/scripts/shots.mjs --base=http://localhost:3000 --out=<dir> /settings /settings/sound
```

It writes `<name>-desktop.png` and `<name>-phone.png` per path. Look at every shot before it goes in
the pitch: a cut-off dialog or a dev overlay in a screenshot is a finding, not a picture to send.

## 3. Upload, then link

Media never go into git. Upload the folder with the repo's media command, `review.media` in
`agent-kit.config.json` (Maelstrom: `pnpm media upload <app> <dir>`, public R2 URLs), and use the URLs
it prints. Every link in the pitch is the whole URL.

## 4. Distribution reuse

Run the `distribution-reuse` skill. A live product gets the reuse named and the drafts written into
the pitch's **Distribution** section; a product that is not live gets one line saying so.

## 5. Write the pitch

Into the task's closing note, in the form of `rules/result-review.md` §2. What each section needs:

| Section | It answers | Not this |
|---|---|---|
| What the user gets | What can a user do now that they could not, in their words | the list of files or components |
| Why we should add it | The problem it ends, the number it should move, why now | "it was in the spec" |
| Complexity | What it adds (screens, concepts, tables, dependencies, code to keep) and why that is worth it; or what was cut | "low complexity" with no reason |
| See it | The video, desktop and phone screenshots, the PR, each a whole URL with a label | a screenshot of code |
| Risk and undo | What could break, for whom, how likely; how to undo (revert, a flag, a migration back) | "no risk" |
| Distribution | The reuse and its drafts, or "Not live yet: no post." | a post as the owner |
| Recommendation | Ship it, hold it, or ship with a cut, and the one-line reason | a question back to him |

Lead each section with its strongest fact. Under 400 words before the drafts. Run the `unslop` skill
on the whole pitch (no em dashes; the drafts too), then:

```bash
node vendor/agent-kit/bin/agent-kit.mjs review check <closing-note.md> --kind result   # exit 0 to stop
```

Put the same pitch at the top of the PR body (the `pr` skill keeps its Benefit first), so GitHub
shows it too.

## 6. Stop

```bash
herdr-projects report <id> --state blocked --kind permission --msg "Result ready for review: <one line>"
```

The one line is the user benefit in under 70 characters.

## 7. The answer

- **Result approved**: merge once CI is green under the repo's merge rules (a CODEOWNERS path or a new
  runtime dependency still needs his approval on GitHub), then post the drafts on the product's brand
  accounts, never as the owner. Once it has landed on `main`, archive the OpenSpec change if there is
  one (`npx openspec archive <name> --yes` on a new branch from `main`, one commit, a chore PR).
  Report the merged PR, the post links and the archive PR.
- **Result sent back**: change the work on the same branch, record again what changed on screen,
  write the pitch again, check, stop again. Nothing merges, nothing is posted.
