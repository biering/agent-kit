# Result review before it ships

Specced work, and every PR that changes what a user sees, gets the owner's yes on the result before it
merges. He does not read code. The agent writes a **result pitch** that argues for shipping it, with a
short video and screenshots of the real app, and the drafts for telling people about it. The owner
approves in the **review list** with a key press, or sends back one line. This is the second of the two
points where he is in the loop; the first is the spec ([`spec-review.md`](spec-review.md)).

## 1. Which PRs need it

- Every PR of a task that had a spec (`Spec review: yes`).
- Every PR that changes what a user sees: a screen, a flow, a layout, an email, a notification, an app
  string a user reads in the product.

These stay with the CEO after a passed review, with no result pitch: a fix (it restores what was
meant), an SEO page, content (copy, posts, articles, docs) and a chore (deps, CI, refactors, tooling).

The CEO approves a ready-to-approve task only when it needs no result review. A task whose closing
note is a result pitch (`# Result: …`), whose description says `Spec review: yes` or
`Design review: yes`, or that wrote an OpenSpec change is the owner's, in the review list. The CEO's
merge gate enforces it: before `herdr-projects approve <id>` it asks `agent-kit review owner <id>`, and
blocks the approve of a result, or of a task it cannot place.

GitHub approval stays required only where it is required today: a path of the repo's `CODEOWNERS` and
a new runtime dependency (the repo's merge-gate rule, for example Maelstrom's `docs/merge-gate.md`).
Such a PR shows twice in the review list: the result (approve with a key) and the GitHub row (approve
on GitHub). Both are needed. Nothing else needs his GitHub approval.

## 2. What the agent makes (the `result-pitch` skill)

The order of stops is the board's: the agent writes the pitch and **ends its turn normally**. The board
then runs its check, pushes, opens the PR, runs its reviewer, and shows the task as **ready to
approve**. The review list builds the result row from that state and the closing note, and adds the
board's PR link. Nothing reports `Result ready` by hand: a stop with that report ends nothing, so no PR
is ever opened, and the row says to send it back.

When the work is built and the repo's checks pass on the branch:

1. **A video**: a short recording of the real app (at most about 45 seconds), not a mockup and not a
   coded film. For a web app it is a Playwright recording of the changed flow: the `video` skill's
   `scripts/record.mjs` records it from a storyboard. Native apps: "Native apps" below. A test account,
   never a real customer's data.
2. **Screenshots**: each changed screen at desktop width (1440) and at phone width (390), from the
   branch (native apps: the screenshots their platform needs, below).
3. **Upload**: all media go to the repo's media store and are linked by their public URL. Nothing heavy
   goes into git. The command is `review.media` in `agent-kit.config.json` (Maelstrom:
   `pnpm media upload <app> <dir>`, which puts them on R2).
4. **Distribution reuse**, when the change is in a live product (the `distribution-reuse` skill): name
   the reuse (an X post on the product's brand account, a clip, a changelog entry, a launch asset) and
   have the drafts ready in the pitch. Not live yet: one line saying so.
5. **The pitch**, in the task's closing note, written to convince a reader who will not open the code:

   ```markdown
   # Result: <what the user gets, in a line>

   Product: <product>

   Platform: web                          (web, ios, desktop or menubar; web when left out)

   Change: openspec/changes/<name>        (when it had a spec)

   ## What the user gets
   <the benefit, in two or three sentences, from the user's side>

   ## Why we should add it
   <the reason it is worth shipping now: the problem it ends, the number it should move>

   ## Complexity
   <what it adds (screens, concepts, tables, dependencies, code to keep) and why that is worth it>
   <or what was cut to keep it small>

   ## See it
   - Video, <the flow>: https://<media>/<file>.mp4
   - Screenshot, desktop, <screen>: https://<media>/<file>.png
   - Screenshot, phone, <screen>: https://<media>/<file>.png

   ## Risk and undo
   <what could go wrong, for whom, and how to undo it (revert the PR, a flag, a migration back)>

   ## Distribution
   <the reuse and its drafts, or "Not live yet: no post.">

   ## Recommendation
   Ship it. <one line why>   (or: Hold, <why>; or: Ship with <cut>)
   ```

   - Every link is the whole URL, one per line, the label before it. No PR link: there is none yet, and
     the review list adds the board's.
   - Specced work that changes no screen: the line `No screen changes.` on its own under See it, in place of
     the video and screenshots. Anywhere else, or inside a longer sentence, it does not count.
   - The pitch passes `agent-kit review check <closing-note.md> --kind result` (in a repo:
     `node vendor/agent-kit/bin/agent-kit.mjs review check …`).
   - The closing note opens the PR body (the board puts it there), so a reader on GitHub sees it too.
6. **Archive** the OpenSpec change, when there is one, as a commit on the branch
   (`agent-kit spec archive <name>`, `spec-review.md` §5). The check fails while it is not archived.
7. **End the turn normally**, the pitch as the last message. No report.

## Native apps

A Playwright recording needs a page. Three kinds of app have none, and `screencapture` cannot read
the display in a work-board session on the Mac mini. The pitch names the kind with `Platform:`, and
each kind has its own recording and its own stills:

| Platform | Video | Screenshots |
|---|---|---|
| `ios`: an Expo, React Native or Swift app | the iOS simulator, `xcrun simctl io <udid> recordVideo --codec=h264 <file>.mp4` while the flow runs, stopped with SIGINT | phone, `xcrun simctl io <udid> screenshot` |
| `desktop`: a Tauri app (Wavedance desktop) or an Electron app | the app's frontend from the branch in the browser, native calls mocked with `@tauri-apps/api/mocks`, recorded like a web app | desktop, and one still of the real window labeled "window" |
| `menubar`: a menu bar or tray app | the `video` skill's product-ui recorder of the app's real components (a film page that mounts the app's own views, menu and window frame, as Wavedance's launch film does) | desktop, and one still of the real window labeled "window" |

**What counts as the real app**: the branch's own code drawing the changed screen, with test data.
That is the branch's build on the simulator, the branch's frontend in a browser with only the native
calls mocked, or the app's own components mounted by a film page. A redrawn screen, a mockup, a
Figma frame or an older build does not count. Where a session cannot take the window still (a board
session), the line `No window still: <why>` stands on its own under See it in its place; the check
accepts that and nothing vaguer, and the owner sees why the native frame is not shown.

## 3. In the review list

Once the board shows it as ready to approve, the task shows as a `result` row: product, age, the pitch's
title. Enter opens the pitch in Plannotator (in a new tab of the CEO's workspace); `1` to `9` open the
video, the screenshots and the PR in the browser; `a` approves, `b` sends back one line. A row whose
board review failed or whose checks are red says so; the board then refuses the approve.

## 4. What his approve covers

- The merge: his approve is the board's `approve` on the ready-to-approve task, so the board merges
  the head it reviewed. Nothing is told to the agent and nothing is committed after his yes, so a
  GitHub approval at that head stays valid and CI does not start again. A CODEOWNERS path or a new
  runtime dependency is approved on GitHub first; the review list refuses the approve until then.
- The archived OpenSpec change, which is already in the PR he saw (`spec-review.md` §5).
- Posting the drafts from the pitch **on the product's brand accounts**, as written or with his notes.
  The approve adds a task for it, `--after` the result, so the posts go out once the merge is done.
  Never as him: his own X, Reddit or communities are his to post (the CEO manual's "Who decides what").

## 5. What the owner's answer means

- **Approved**: the board merges; the agent hears nothing. Notes he gives go to the post task
  (a shorter caption, a different clip), not back to the agent.
- **"Result sent back…"**: the agent hears it in the same conversation. It changes the work on the same
  branch (and `git revert`s the archive commit first when the change moves its spec), records the media
  again where the change shows, writes the pitch again, archives again, and ends its turn normally. The
  board updates the PR, reviews it and brings it back as ready to approve. Nothing merges and nothing is
  posted.
