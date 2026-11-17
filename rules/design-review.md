# Design review first

Work that changes what a user sees (a new screen, a redesign, a new flow, a landing page) gets the
owner's yes on its design before it is built. The design comes to the owner in herdr, in the
**Design review** pane (README, "Design review"), where he opens the artifacts, comments, and approves.
His approval starts the build.

## 1. Flag the task (the CEO, or whoever puts the work on the board)

When the work changes screens, the task's description carries this line, on its own:

```text
Design review: yes
```

```sh
herdr-projects add "feat(app): settings screen redesign" --repo app \
  --desc "$(printf 'Make every setting findable in two taps.\nDesign review: yes')" --delegate
```

- **Do not** also add `--plan.approve you` for this. In the board's plan step, Claude runs in its own
  plan mode, and that mode cannot publish an artifact. The design stage below needs to publish them.
- A task whose designs already exist (made in an earlier task) can use the board's plan step instead:
  add `--plan.approve you` with the same line, and its plan is the brief with the existing links (§4).
- A title is not the place for the marker. Titles hold 60 characters, and agents change them.

## 2. The design stage (the agent, before any code)

The agent of a flagged task designs first and changes nothing in the repo yet.

1. Make the design with the `design` skill. Publish each variant as a **private Claude Artifact**:
   screens, a clickable prototype, notes. Two or three variants when the direction is open, one when it
   is not.
2. Write the brief in the task's closing note (the board's `closing-note.md`), in this form:

   ```markdown
   # Design: <what changes, in a line>

   <two or three sentences: the problem, and what the design does about it>

   - Variant A, <one-line idea>: https://claude.ai/artifact/<id>
   - Variant B, <one-line idea>: https://claude.ai/artifact/<id>

   Recommended: <variant, and why in one line>
   Open: <what the owner has to decide>
   Build: <the screens and parts that will change, in order, and how it will be checked>
   ```

   - One link per line, the label before it.
   - **Every link is the whole URL** (`https://claude.ai/artifact/<id>`), never shortened. The pane
     shows it as it is, to be clicked or copied.
3. Stop with this report:

   ```sh
   herdr-projects report <id> --state blocked --kind permission --msg "Design ready: <one line>"
   ```

   The message must start with `Design ready`: that is what the pane looks for.

## 3. What the owner's answer means

- **"Design approved. Build it now…"** Build the approved variant from the brief, in the same
  conversation. Notes in that message are guidance, not a send back.
- **"Design sent back…"** Revise the design: update the same artifacts where you can, and write the
  brief again. Then stop again with `Design ready`.
- The owner may also answer on the board in his own words. That counts the same.

## 4. A design in the board's plan step (`--plan.approve you`)

The plan is the brief from §2, with the existing artifact links. The pane shows it as "plan ready".

- Approve runs the board's `approve`, then waits until the build has really started. Nothing else is
  sent to the task until then: a message in that window cancels the build and leaves the agent in plan
  mode on a read-only worktree.
- If the build still does not start, the pane repairs it: `stop`, then
  `delegate --now --plan.approve none`, which builds the approved plan with normal access.
- A send back is the board's `tell`, and the task goes back to its plan step.
