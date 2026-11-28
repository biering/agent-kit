---
name: spec
description: >-
  Plan bigger work before any code: an OpenSpec change (score, proposal, WHEN/THEN scenarios, design, tasks), designs as private Artifacts when screens change, and the owner's approval in Plannotator. Use, unasked, when a new feature, a bigger improvement or a bigger bugfix comes in (the dev-loop sends it here), for a task with 'Spec review: yes', 'write the spec', 'plan this feature', '/spec'.
---

# Spec

Read the repo's `AGENTS.md` and `docs/agent-kit/spec.md` first; they win where they differ from this
skill. The rule this skill carries out is the kit's `rules/spec-review.md`.

**Nobody has to ask for this.** When a new feature, a bigger improvement or a bigger bugfix comes in
(the test is `rules/spec-review.md` §1), the `dev-loop` and `bugfix` skills start here on their own,
whether the work came as a board task, a ticket or a chat message. A `Spec review: yes` line only
forces it for work the test would let through.

The job: turn a task into a spec the owner can approve in two minutes, without opening a file. You
write the OpenSpec change, make the designs when screens change, write one brief, and stop. **You
change no code**: no source file, no migration, no config, no dependency. The build starts only on the
owner's yes, in this same conversation.

## 0. Preconditions

- The task runs in auto mode, not the board's plan mode (plan mode cannot write files or publish an
  artifact). If you find yourself in plan mode, report that and stop.
- OpenSpec is a devDependency of the repo, pinned exactly. Check with `npx --no-install openspec --version`.
  Missing: add it the repo's way (`pnpm add -D -E @fission-ai/openspec@2.0.0`,
  `npm i -D -E @fission-ai/openspec@2.0.0`), then `npx openspec init --tools none`. That one
  devDependency and its lockfile are the only files outside `openspec/` you may touch, and only when it
  is missing. Never `openspec install`, never a `curl … | sh` installer. The pin is the kit's
  (`rules/spec-review.md`, Setup); a newer release goes in on purpose, never as a side effect.
- Set `OPENSPEC_TELEMETRY=0` and `OPENSPEC_NO_UPDATE_CHECK=1` for every `openspec` call.

## 1. Understand before writing

1. Read the task's description, the product's docs (its `AGENTS.md`, `DESIGN.md`, the screens it
   touches) and the specs that exist: `npx openspec list --specs`, then
   `npx openspec show <spec> --type spec` for each one that looks related. Reuse an existing
   capability's path instead of inventing a near-duplicate.
2. Write down, for yourself: who has the problem, what they do today, what they will be able to do
   after. If you cannot say the user benefit in one sentence, the scope is wrong: narrow it.
3. Run the `value-score` skill's test when the value is unclear. A spec for something that should not
   be built is a waste of the owner's attention; say so in the brief and recommend not building it.

## 2. The change

```bash
npx openspec new change <name>           # kebab-case, what the user gets: singing-bowl-end, not add-audio
npx openspec instructions proposal --change <name>   # OpenSpec's own guidance per artifact, when unsure
```

Then write, in `openspec/changes/<name>/`:

| File | What it holds |
|---|---|
| `proposal.md` | The `value-score` skill's five lines first, above everything (`agent-kit plan-review` refuses a proposal without them). Then **Why** (one or two sentences), **What Changes** (bullets, `BREAKING` marked), **Capabilities** (new and modified, each becomes a spec file), **Impact** (code, APIs, data, dependencies) |
| `specs/<capability>/spec.md` | `## ADDED` / `## MODIFIED` / `## REMOVED Requirements`; each `### Requirement:` has at least one `#### Scenario:` with `- **WHEN** …` and `- **THEN** …` lines. Behavior a user or another system can observe, no function names |
| `design.md` | Context, Goals and Non-Goals, Decisions (each with the option you left out and why), Risks and Trade-offs |
| `tasks.md` | `## 1. <group>` with `- [ ] 1.1 <task>` checkboxes, in build order, each small enough for one sitting; mark which PR each group lands in when it is more than one |

Write scenarios for what decides the design: the happy path, the empty state, the error a user can
cause, the edge a reviewer would ask about. Three to six per capability is usual.

```bash
npx openspec validate <name> --strict    # must pass
```

## 3. Designs, when screens change

Use the `design` skill. Publish each variant as a **private Claude Artifact** (two or three when the
direction is open, one when it is not). Link each one as its whole URL. A spec with screens and no
design is not ready: the owner decides on what he sees.

## 4. The brief

In a board task, write it into the task's closing note (the board's `closing-note.md`, the path the
task's rules give). Outside the board there is no closing note: the owner reads the change itself, so
`proposal.md` also carries the design links, the complexity and what is open, and this section is done.
The form is in `rules/spec-review.md` §2; every section is required:

| Section | It holds |
|---|---|
| Why, What the user gets | the user's side, plain words, no feature names |
| Scenarios | three to six `WHEN … THEN …` lines, the ones that decide it |
| Design | each artifact on its own line with its label, and your recommendation in one line; "No screen changes." when none do |
| Tasks | grouped, with how each is checked and how many PRs it takes |
| Complexity | what it adds (concepts, screens, tables, dependencies, code to keep) and why that is worth it, or what you cut to keep it small; the section the owner reads hardest |
| Open | what he has to decide; "Nothing open." when nothing is |

Also a `Product: <name>` line and a `Change: openspec/changes/<name>` line under the title, each a paragraph of its own (a blank line between them, so Plannotator does not join them).

Run the `unslop` skill on the brief (no em dashes, specifics first), then:

```bash
node vendor/agent-kit/bin/agent-kit.mjs review check <closing-note.md> --kind spec   # exit 0 to stop
```

## 5. Stop for the owner

**A board task** (it has a herdr-projects id) stops with the report; the review list opens the brief:

```bash
herdr-projects report <id> --state blocked --kind permission --msg "Spec ready for review: <one line>"
```

The one line is what the owner reads in the review list: what the user gets, in under 70 characters.

**Any other session** (a chat, a ticket, a Claude Code remote-control session) opens the change itself
in Plannotator, over the owner's tailnet (README "Plan review"):

```bash
node vendor/agent-kit/bin/agent-kit.mjs plan-review openspec/changes/<name> --detach /tmp/plan-review-<name>
```

Give the owner the printed `review:` address and wait for `<prefix>.exit`. In a session that reaps
detached processes (a Claude Code remote-control session does), run the same command without
`--detach` as a tracked background task instead. Exit 0 is the approval, 1 a send back (the feedback
is the decision JSON), 3 a dismissed tab: open it again.

## 6. The answer

- **Spec approved**: build it now, from `tasks.md`, ticking each box as it lands (the `dev-loop`
  skill). When it is built, the result review starts (the `result-pitch` skill): the pitch, the archive,
  then the turn ends normally and the board opens the PR.
- **Spec sent back**: revise the same change and the same artifacts, write the brief again, check,
  stop again. Still no code.
- **Before the turn that brings the result ends**: `node vendor/agent-kit/bin/agent-kit.mjs spec archive <name>`,
  as a commit of its own on the branch (`rules/spec-review.md` §5), so the PR the owner approves already
  has it. It refuses while `tasks.md` has an unticked task: OpenSpec itself would archive it without
  asking. A send back that moves the spec: `git revert` that commit first.
