---
name: result-pitch
description: >-
  Ask the owner to ship finished work without reading code: a pitch (user benefit, why add it, complexity and why it is worth it, risk and undo, a recommendation) with a video and desktop and phone screenshots of the real app, uploaded and linked, and the distribution drafts. Use when specced or user-visible work is built, before the agent ends its turn, for 'result pitch', 'ask to ship', '/result-pitch'.
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

Start when the work is built and the repo's checks pass on the branch. There is no PR yet, and you do
not open one: on the work board, the board opens the PR after your turn ends, then runs its reviewer,
and only then shows the task as **ready to approve**. The review list makes the result row from that
state and your closing note, and adds the PR link itself. So the order is: media, pitch, archive, check,
end the turn.

## 1. Record the changed flow

A short video of the real app, the flow that changed, start to finish. 20 to 45 seconds. What "the
real app" is depends on the kind of app (the pitch names it with a `Platform:` line):

| Platform | The video | Screenshots | Counts as the real app because |
|---|---|---|---|
| `web` (default) | Playwright, the `video` skill's `record.mjs` | desktop 1440 and phone 390 | it is the branch, served |
| `ios` (Expo, React Native, Swift) | the iOS simulator: `xcrun simctl io <udid> recordVideo --codec=h264 <file>.mp4`, stopped with Ctrl-C (SIGINT), while the flow runs (a Maestro flow when the repo has one, else `xcrun simctl openurl <udid> <scheme>://<route>` and the app's own test hooks) | phone: `xcrun simctl io <udid> screenshot <file>.png` | it is the branch's own build on the simulator |
| `desktop` (Tauri, Electron) | the app's frontend from the branch in the browser (its Vite dev server), the native calls mocked with `@tauri-apps/api/mocks` (`mockIPC`), recorded with `record.mjs` | desktop, from the same page, and a still of the real window labeled "window" | it is the same frontend code the window runs; the still shows the native frame around it |
| `menubar` (a menu bar or tray app) | the `video` skill's product-ui recorder of the app's **real components**: a film page that mounts the app's own views, menu and window frame with its stylesheets (Wavedance's `distribution/launch-film/film.tsx`), never a redrawn screen | desktop, from the same page, and a still of the real window labeled "window" | every pixel is the app's own component; the film only sets its state |

- `screencapture` cannot read the display in a work-board session on the Mac mini ("could not create
  image from display"), so a still of a native window is taken only where a session can (the owner's
  login, a CEO session in his desktop). In a board session, write the line `No window still: <why>` on its
  own under See it in place of the window still. The check accepts that line and nothing vaguer.
- The simulator writes frames only when the screen changes: start the recording, then drive the flow;
  a still screen gives a file under a second long.

- Use the `video` skill's recorder: `node <video>/scripts/record.mjs <storyboard.json> --base=<url>`
  (the storyboard form is in that skill's `references/explainer.md`). It records Chrome at 2x with a
  soft cursor and captions, and needs `ffmpeg` and Playwright from the repo.
- Run the app from the branch (the repo's dev server; there is no PR preview yet). A test account the repo seeds;
  never a real customer's data, never a real password on screen.
- One caption per step, in the user's words ("Tap the bowl to end the session"), not the code's.
- The flow is mobile-first (an app, a phone-first page): record at the phone viewport as well
  (`"viewport": { "width": 390, "height": 844 }`).

## 2. Screenshots, desktop and phone

Each changed screen, from the branch, at 1440 and at 390 wide (web; for the other platforms, the
screenshots of the table above):

```bash
node <result-pitch>/scripts/shots.mjs --base=http://localhost:3000 --out=<dir> /settings /settings/sound
```

It writes `<name>-desktop.png` and `<name>-phone.png` per path. Look at every shot before it goes in
the pitch: a cut-off dialog or a dev overlay in a screenshot is a finding, not a picture to send.

## 3. Upload, then link

Media never go into git. Upload the folder with the repo's media command, `review.media` in
`agent-kit.config.json` (Maelstrom: `pnpm media upload <app> <dir>`, public R2 URLs), and use the URLs
it prints. Every link in the pitch is the whole URL.

- Media that belong to no app have a key of their own in Maelstrom: `pnpm media upload kit <dir>`
  (agent-kit work, under `kit/<set>/`) and `pnpm media upload ops <dir>` (ops work, under `ops/<set>/`),
  run from a Maelstrom worktree.
- Run the upload from a worktree, never the main checkout. Wrangler reads the `.env` of the folder it
  runs in: the main checkout's has a `CLOUDFLARE_API_TOKEN` without R2 rights, so the upload fails with
  "Authentication error [code: 10000]". A worktree has no `.env`, and wrangler uses the machine's
  `wrangler login`, which has them.

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
| See it | The video and the screenshots of its platform, each a whole URL with a label (the review list adds the PR) | a screenshot of code |
| Risk and undo | What could break, for whom, how likely; how to undo (revert, a flag, a migration back) | "no risk" |
| Distribution | The reuse and its drafts, or "Not live yet: no post." | a post as the owner |
| Recommendation | Ship it, hold it, or ship with a cut, and the one-line reason | a question back to him |

Lead each section with its strongest fact. Under 400 words before the drafts. Run the `unslop` skill
on the whole pitch (no em dashes; the drafts too), then:

```bash
node vendor/agent-kit/bin/agent-kit.mjs review check <closing-note.md> --kind result   # exit 0 to stop
```

The closing note is what the board puts at the top of the PR body, so GitHub shows the pitch too.

## 6. Archive, then end the turn

1. A specced task archives its OpenSpec change now, before the turn ends, as a commit of its own:
   `node vendor/agent-kit/bin/agent-kit.mjs spec archive <name>`, then commit (`rules/spec-review.md` §5).
   The check fails while `openspec/changes/<name>` is still there.
2. Run the check above once more, then end the turn normally, with the pitch as your last message.
   Do not run `herdr-projects report … "Result ready"`: a stop by hand ends nothing, so the board never
   opens the PR and the row can only say "send it back". The title line of the pitch is what the owner
   reads in the list: the user benefit, under 70 characters.

## 7. The answer

- **Approved**: the board merges the PR (the review list runs its `approve`); nothing comes back to
  you. The drafts go out as a task of their own once the merge is done, on the product's brand
  accounts, never as the owner.
- **Result sent back**: you hear it in the same conversation. Change the work on the same branch; when
  the change moves its OpenSpec change, `git revert` the archive commit first, revise, tick, archive
  again. Record again what changed on screen, write the pitch again, check, then end the turn normally:
  the board updates the PR, reviews it and brings it back. Nothing merges, nothing is posted.
