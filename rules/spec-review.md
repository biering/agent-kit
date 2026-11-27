# Spec review before the build

A feature or a bigger improvement gets the owner's yes on its spec before any code is written. The
agent writes the spec as an OpenSpec change, with the designs when screens change, and stops. The
owner reads one brief in Plannotator from the **review list** (README, "Review list"), approves it or
sends back comments. His yes starts the build in the same conversation. This is the first of the two
points where the owner is in the loop; the second is the result ([`result-review.md`](result-review.md)).

## 1. Which work gets a spec (the CEO decides)

The CEO, or whoever puts the work on the board, flags a task for a spec when it is any of these:

- a new feature or a new screen;
- a schema change (a new table, a column that changes what is stored, a migration that rewrites data);
- pricing: a new price, a plan, a paywall, a trial;
- work that will take more than one PR;
- real added complexity: a new service, a new dependency, a new concept users have to learn, a second
  way to do something that already has one.

A fix (it restores what was meant), an SEO page, content (copy, posts, articles) and a chore do not get
a spec. When in doubt, the test is: would the owner want to say "not like that" before a day of work
goes in? Then it gets one.

The task's description carries this line, on its own:

```text
Spec review: yes
```

```sh
herdr-projects add "feat(tinybreath): a singing bowl ends a session" --repo maelstrom \
  --desc "$(printf 'People stop the timer by hand and lose the calm.\nProduct: tinybreath\nSpec review: yes')" --delegate
```

- **No `--plan.approve you`.** The board's plan step starts the agent in its plan mode, which cannot
  write files or publish an artifact. The spec stage needs both, so the task runs in auto mode and
  stops itself.
- A `Product: <name>` line names the product the review list shows (default: the repo).
- A spec covers the design: a flagged task with screens does not also need `Design review: yes`.

## 2. The spec stage (the planning agent, before any code)

The agent writes the spec with the `spec` skill and changes no code: no source file, no migration, no
config. What it writes:

1. `openspec/changes/<name>/` with the OpenSpec CLI (a devDependency, `npx openspec`; never an
   installer piped to a shell):
   - `proposal.md`: why, what changes, the capabilities, the impact;
   - `specs/<capability>/spec.md`: the requirements, each with scenarios in **WHEN / THEN** form;
   - `design.md`: the decisions, the options left out and why, the risks;
   - `tasks.md`: the build as checkboxes, in order, each small enough for one sitting.

   `npx openspec validate <name> --strict` passes.
2. When screens change: the designs as **private Claude Artifacts**, made with the `design` skill
   (two or three variants when the direction is open, one when it is not).
3. The brief, in the task's closing note (the board's `closing-note.md`). It is the one thing the
   owner reads, so it stands alone: he never opens the change folder to decide.

   ```markdown
   # Spec: <what changes, in a line>

   Product: <product>

   Change: openspec/changes/<name>

   ## Why
   <two or three sentences: the problem, who has it, why now>

   ## What the user gets
   <the benefit, in the user's words: what they can do after that they could not before>

   ## Scenarios
   - WHEN <situation> THEN <what the user sees>
   - (three to six, the ones that decide the design; the rest are in the change)

   ## Design
   - Variant A, <one-line idea>: https://claude.ai/artifact/<id>
   - Recommended: <variant, and why in one line>

   ## Tasks
   1. <task>, <how it is checked>
   (from tasks.md, grouped; the number of PRs it takes)

   ## Complexity
   <what it adds: new concepts, screens, tables, dependencies, code to keep>
   <why that is worth it, or what was cut to keep it small>

   ## Open
   <what the owner has to decide, if anything; else "Nothing open.">
   ```

   - Every link is the whole URL, one per line, the label before it.
   - The brief passes `node <spec>/scripts/brief-check.mjs <closing-note.md>` (the `spec` skill).
4. Stop with this report:

   ```sh
   herdr-projects report <id> --state blocked --kind permission --msg "Spec ready for review: <one line>"
   ```

   The message must start with `Spec ready`: that is what the review list looks for. The one line is
   what the owner reads in the list, so it says what the user gets, not "spec done".

## 3. In the review list

The task shows as a `spec` row: product, age, the one line. Enter opens the brief in Plannotator (in a
new tab of the CEO's workspace), where `A` approves and `E` sends the comments back; in the list, `a`
approves and `b` sends back one line. The detail shows every link whole and the change's folder.

## 4. What the owner's answer means

- **"Spec approved. Build it now…"**: build it in the same conversation, from `tasks.md`, ticking each
  task as it is done. Notes in that message are guidance, not a send back. The build follows the
  repo's dev loop and ends at the result review (`result-review.md`): the PR is open, the pitch is
  written, the agent stops with `Result ready for review`.
- **"Spec sent back…"**: revise the same change (and the same artifact URLs where you can), write the
  brief again, run both checks, and stop again with `Spec ready for review`. Still no code.
- The owner may answer on the board in his own words. That counts the same.

## 5. After it lands: archive

Specs describe the product as it is. Once the build ships, its change moves into `openspec/specs/`:

```sh
npx openspec archive <name> --yes
```

The agent runs it after the owner approves the result and before the merge, as the last commit of the
PR, so the change reaches `main` together with the code it describes: `main` never has a shipped change
that is not archived, nor an archived one that did not ship. A change split over several PRs is
archived with its last PR.

## Setup in a repo, once

- `npm i -D @fission-ai/openspec` (or the repo's package manager), then
  `npx openspec init --tools none`. The `spec` skill is the agent's instruction, so OpenSpec's own
  agent files are not needed. Set `OPENSPEC_TELEMETRY=0` where the agents run.
- The repo's CEO manual points to this rule in one line.
