# Spec review before the build

A feature, a bigger improvement or a bigger bugfix gets the owner's yes on its spec before any code is
written. It is the standard loop, not something anyone has to ask for: the agent that takes the work
runs the test below, writes the spec as an OpenSpec change, with the designs when screens change, and
stops. The owner reads it in Plannotator, from the **review list** (README, "Review list") for a board
task or from the address `agent-kit plan-review` gives him (README, "Plan review") anywhere else, and
approves it or sends back comments. His yes starts the build in the same conversation. This is the first of the two
points where the owner is in the loop; the second is the result ([`result-review.md`](result-review.md)).

## 1. Which work gets a spec (the agent that takes it decides)

The agent that takes the work (the `dev-loop` and `bugfix` skills, step one) gives it a spec, unasked,
when it is any of these:

- a new feature or a new screen;
- a schema change (a new table, a column that changes what is stored, a migration that rewrites data);
- pricing: a new price, a plan, a paywall, a trial;
- work that will take more than one PR;
- real added complexity: a new service, a new dependency, a new concept users have to learn, a second
  way to do something that already has one;
- a bigger bugfix: the fix changes behavior a user relies on, the data model or an API, or it meets any
  line above. A fix that only restores what was meant stays with the `bugfix` skill's own plan.

A small fix (it restores what was meant), an SEO page, content (copy, posts, articles) and a chore do not get
a spec. When in doubt, the test is: would the owner want to say "not like that" before a day of work
goes in? Then it gets one.

The CEO, or whoever puts the work on the board, can force a spec for work the test would let through.
The task's description then carries this line, on its own:

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
   - `proposal.md`: the `value-score` skill's five lines first, as they open a plan, then why, what
     changes, the capabilities, the impact;
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
   - The brief passes `agent-kit review check <closing-note.md> --kind spec` (in a repo:
     `node vendor/agent-kit/bin/agent-kit.mjs review check …`), and the change passes
     `npx openspec validate <name> --strict`.
4. Stop with this report:

   ```sh
   herdr-projects report <id> --state blocked --kind permission --msg "Spec ready for review: <one line>"
   ```

   The message must start with `Spec ready`: that is what the review list looks for. The one line is
   what the owner reads in the list, so it says what the user gets, not "spec done".

## 3. In the review list, or in Plannotator directly

Outside the board (a chat, a ticket, a Claude Code remote-control session) there is no closing note and
no review list: the agent opens the change itself, assembled into one document (proposal, specs, design,
tasks), with `agent-kit plan-review openspec/changes/<name>` and acts on its exit code (README, "Plan
review"). The proposal then also carries the design links, the complexity and what is open.

On the board, the task shows as a `spec` row: product, age, the one line. Enter opens the brief in Plannotator (in a
new tab of the CEO's workspace), where `A` approves and `E` sends the comments back; in the list, `a`
approves and `b` sends back one line. The detail shows every link whole and the change's folder.

## 4. What the owner's answer means

- **"Spec approved. Build it now…"**: build it in the same conversation, from `tasks.md`, ticking each
  task as it is done. Notes in that message are guidance, not a send back. The build follows the
  repo's dev loop and ends at the result review (`result-review.md`): the PR is open, the pitch is
  written, the agent stops with `Result ready for review`.
- **"Spec sent back…"**: revise the same change (and the same artifact URLs where you can), write the
  brief again, run both checks (`openspec validate --strict`, `agent-kit review check --kind spec`), and stop again with `Spec ready for review`. Still no code.
- The owner may answer on the board in his own words. That counts the same.

## 5. After it lands: archive

Specs describe the product as it is. Once the build ships, its change moves into `openspec/specs/`:

```sh
node vendor/agent-kit/bin/agent-kit.mjs spec archive <name>
```

It refuses while `tasks.md` has an unticked task, because `openspec archive --yes` archives one without
asking (2.0.0 and 2.2.0 both do): tick what landed, move what did not into a new change. The agent runs it after the owner approves the result and before the merge, as the last commit of the
PR, so the change reaches `main` together with the code it describes: `main` never has a shipped change
that is not archived, nor an archived one that did not ship. A change split over several PRs is
archived with its last PR.

## Setup in a repo, once

- `npm i -D -E @fission-ai/openspec@2.0.0` (or the repo's package manager, always the exact version),
  then `npx openspec init --tools none`. Only a release older than two weeks goes in: 2.0.0 is the pin
  as of 2026-11-27, when 2.2.0 was three days old. A bump is its own change, the version here, in the
  `spec` skill and in `src/lib/spec.mjs` together.
- `--tools none`: the `spec` skill is the agent's instruction, so OpenSpec's own agent files are not
  needed. With `--tools claude,codex` 2.0.0 writes `.agents/skills/openspec-*` and `.claude/skills`
  links but no `.codex/skills` links, so Codex would not see them; keep `none` unless that changes.
- Set `OPENSPEC_TELEMETRY=0` and `OPENSPEC_NO_UPDATE_CHECK=1` where the agents run (`agent-kit spec`
  sets both).
- On the machine the agents run on, once: `agent-kit plan-review --install` (README, "Plan review").
- The repo's CEO manual points to this rule in one line.
