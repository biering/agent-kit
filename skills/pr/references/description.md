# PR title and body

Writing rules for the `pr` skill. The evidence is in [research.md](research.md); a worked
before and after is in [example.md](example.md).

## Title

- One problem, one [Conventional Commit](https://www.conventionalcommits.org/) subject.
  Imperative, under 72 characters, equal to the commit title.
- Scope is the ticket id when there is one, otherwise the area. Omit it when none is honest.
- The title is the what. The body does not repeat it.

## The body in one view

```markdown
## Benefit
<One or two plain sentences: what a user or the business gains.>

## Review focus
- `<path>:<line>`: <what could go wrong here>

## Changed            (optional, at most 5 bullets)
- <change by area, not by file>

## Verified           (optional)
- <command or click path, and the result>

## Needs a human      (optional)
- <approval, setup step, secret to set, link>
```

The first two sections are required whenever code or config changed. The three below them appear
only when they say something the reader needs.

## Length budget

- **Benefit plus Review focus: about 120 words in total, 150 at most.** Everything before the
  first optional heading counts.
- The whole body: 250 words is a long one. A one-line fix can be one sentence and one bullet.
- Do not restate the title or the Benefit anywhere else. Say a thing once.
- No file-by-file narration. The diff has the file list.
- Plain words, short sentences. No em dashes, no filler ("this PR", "in order to", "various").
- Describe only what the diff shows. Never invent changes, tests or screenshots.

`scripts/pr-body-check.mjs <body.md>` counts the budget and flags the usual slips. Run it on the
temp file before `gh pr create`.

## Benefit

What the user or the business gains, in their terms. Not what files or functions changed.

- Good: "Checkout no longer fails for customers with an apostrophe in their name."
- Bad: "Escapes the name in `buildOrder`."
- With no user effect (refactor, CI, docs), say who gains and how: "CI is two minutes faster per
  run", "New agents find the release steps without asking".
- If the PR has a tradeoff or limit that changes whether it should merge, it goes here too, in
  one clause.

## Review focus

One to three bullets, ordered by consequence. Each names `path:line` and what could go wrong
there, so the reviewer can start reading at the risky spot. Not a file list, not a summary.

Pick by consequence, not diff size:

- data structures: new or changed tables, columns, enums, stored JSON, API fields, and how old
  data or old callers still fit;
- money and irreversible actions: charges, refunds, emails, deletions, migrations;
- auth and access: who may call it, ownership checks, secrets, dev-only paths;
- long-running or replayed code: workflows, schedules, idempotency;
- shared code that another product also uses;
- the choice you are least sure of, named as such.

Docs-only or config-only: one bullet that says what to read and what could be wrong in it
("`docs/setup.md:12`: is the token scope right?"). If nothing is risky, say so in one line instead
of inventing a risk.

## Optional sections

- **Changed**: only when the diff is hard to read without a map, at most 5 bullets, grouped by
  area. Call out a new public API, config key, or version bump.
- **Verified**: the exact commands or click paths and what they showed. "Tested locally" is not
  an entry. For UI work add the screenshots here, each with a one-line caption.
- **Needs a human**: approvals, setup steps to run after merge, secrets to set, links to the
  ticket or the design. Link the ticket by id; a closing keyword (`Closes #123`) works only for
  GitHub issues, so follow the repo note for other trackers.

## Updating

When the branch changes, rewrite the whole body for the branch as it is now. Never append "also
updated...", never leave a section describing a version that no longer exists.

## Common misses

- Benefit that restates the title, or says "adds X".
- Review focus that lists files instead of risks, or has no line number.
- A Changed section that is the commit log.
- A second issue smuggled into the same PR.
- Em dashes and filler words.
