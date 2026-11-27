---
name: spec
description: >-
  Plan a feature before any code: an OpenSpec change (proposal, WHEN/THEN scenarios, design, tasks), designs as private Artifacts when screens change, and one brief the owner approves in the review list. Use for a task with 'Spec review: yes', 'write the spec', 'plan this feature', '/spec'.
---

# Spec

Read the repo's `AGENTS.md` and `docs/agent-kit/spec.md` first; they win where they differ from this
skill. The rule this skill carries out is the kit's `rules/spec-review.md`.

The job: turn a task into a spec the owner can approve in two minutes, without opening a file. You
write the OpenSpec change, make the designs when screens change, write one brief, and stop. **You
change no code**: no source file, no migration, no config, no dependency. The build starts only on the
owner's yes, in this same conversation.

## 0. Preconditions

- The task runs in auto mode, not the board's plan mode (plan mode cannot write files or publish an
  artifact). If you find yourself in plan mode, report that and stop.
- OpenSpec is a devDependency of the repo. Check with `npx --no-install openspec --version`. Missing:
  add it the repo's way (`pnpm add -D @fission-ai/openspec`, `npm i -D @fission-ai/openspec`), then
  `npx openspec init --tools none`. That one devDependency is the only file outside `openspec/` you
  may touch, and only when it is missing. Never `openspec install`, never a `curl … | sh` installer.
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
| `proposal.md` | **Why** (one or two sentences), **What Changes** (bullets, `BREAKING` marked), **Capabilities** (new and modified, each becomes a spec file), **Impact** (code, APIs, data, dependencies) |
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

Write it into the task's closing note (the board's `closing-note.md`, the path the task's rules give).
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

## 5. Stop

```bash
herdr-projects report <id> --state blocked --kind permission --msg "Spec ready for review: <one line>"
```

The one line is what the owner reads in the review list: what the user gets, in under 70 characters.

## 6. The answer

- **Spec approved**: build it now, from `tasks.md`, ticking each box as it lands (the `dev-loop`
  skill). When the PR is open, the result review starts (the `result-pitch` skill).
- **Spec sent back**: revise the same change and the same artifacts, write the brief again, check,
  stop again. Still no code.
- **After the result is approved**: `npx openspec archive <name> --yes` as the PR's last commit, before
  the merge (`rules/spec-review.md` §5).
