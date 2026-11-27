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

GitHub approval stays required only where it is required today: a path of the repo's `CODEOWNERS` and
a new runtime dependency (the repo's merge-gate rule, for example Maelstrom's `docs/merge-gate.md`).
Such a PR shows twice in the review list: the result (approve with a key) and the GitHub row (approve
on GitHub). Both are needed. Nothing else needs his GitHub approval.

## 2. What the agent makes (the `result-pitch` skill)

When the PR is open, green and reviewed:

1. **A video**: a short recording of the real app (a Playwright recording of the changed flow, at most
   about 45 seconds), not a mockup and not a coded film. The `video` skill's `scripts/record.mjs` records
   it from a storyboard. A test account, never a real customer's data.
2. **Screenshots**: each changed screen at desktop width (1440) and at phone width (390), from the
   branch.
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
   - Pull request: https://github.com/<owner>/<repo>/pull/<n>

   ## Risk and undo
   <what could go wrong, for whom, and how to undo it (revert the PR, a flag, a migration back)>

   ## Distribution
   <the reuse and its drafts, or "Not live yet: no post.">

   ## Recommendation
   Ship it. <one line why>   (or: Hold, <why>; or: Ship with <cut>)
   ```

   - Every link is the whole URL, one per line, the label before it.
   - Specced work that changes no screen: the line `No screen changes.` on its own under See it, in place of
     the video and screenshots. Anywhere else, or inside a longer sentence, it does not count.
   - The pitch passes `agent-kit review check <closing-note.md> --kind result` (in a repo:
     `node vendor/agent-kit/bin/agent-kit.mjs review check …`).
   - The PR body opens with the same pitch (benefit first), so a reader on GitHub sees it too.
6. Stop with this report:

   ```sh
   herdr-projects report <id> --state blocked --kind permission --msg "Result ready for review: <one line>"
   ```

   The message must start with `Result ready`: that is what the review list looks for.

## 3. In the review list

The task shows as a `result` row: product, age, the one line. Enter opens the pitch in Plannotator (in a
new tab of the CEO's workspace); `1` to `9` open the video, the screenshots and the PR in the browser;
`a` approves, `b` sends back one line.

## 4. What his approve covers

- The merge, under the repo's own rules: CI green, the board review passed, and a CODEOWNERS path or a
  new runtime dependency still waits for his approval on GitHub.
- Archiving the OpenSpec change once the PR has landed on `main`, in a chore PR of its own
  (`spec-review.md` §5).
- Posting the drafts from the pitch **on the product's brand accounts**, as written or with his notes.
  Never as him: his own X, Reddit or communities are his to post (the CEO manual's "Who decides what").

## 5. What the owner's answer means

- **"Result approved. Ship it…"**: merge once CI is green, post the drafts on the brand accounts,
  then archive the change if there is one (a chore PR from the updated `main`), and report the merged
  PR, the post links and the archive PR. Notes in that message are
  guidance (a shorter caption, a different clip), not a send back.
- **"Result sent back…"**: change the work on the same branch and PR, record the media again where the
  change shows, write the pitch again, stop again with `Result ready for review`. Nothing merges and
  nothing is posted.
