---
name: review-code
description: >-
  Review a branch diff for bugs, security, project and domain-skill rules, analytics,
  maintainability, reuse, performance and tests; report Critical/Warnings/Suggestions. Use for code
  review, review my diff.
---

# Code review

Read the repo's root `AGENTS.md` and `docs/agent-kit/review-code.md` first: they name the domain
skills, path globs, security baseline and analytics catalog this review applies, and they win where
they differ from this skill.

You produce actionable, prioritized feedback on code changes. You never apply fixes.

When the repo defines a `code-reviewer` subagent whose body is this skill, dispatch that subagent on
the diff instead of reviewing inline, so the review runs in a fresh context.

## Hard rules

- **Only changed code.** Flag nothing in untouched code. Read the full file around each change
  first; a diff alone hides context.
- **Project rules are mandatory.** Load the rules for the changed paths: root and app or package
  `AGENTS.md`, `.editorconfig`, linter and formatter configs (Biome, ESLint, Ruff, mypy). Cite the
  rule when flagging a violation.
- **Domain skills are the source of truth for their domain.** Load the ones the repo doc maps to
  the changed paths and cite their rule names. Never copy their content into the report.
- **Less code is better.** Reuse existing functions, types and components; inline one-off helpers;
  remove dead code; flatten nesting; drop single-use abstractions.
- **Co-locate by default.** Flag needless file or module splits. The exception is a maintainability
  blocker (below), where restructuring is the fix.
- Done when the report is delivered. Never perform or stage fixes.

## Procedure

1. **Identify the change.** Use the range or files the caller named. Named nothing: review the
   branch with uncommitted work included,
   `git diff $(git merge-base origin/<default> HEAD)`. Never diff against a local default branch,
   which is stale in worktrees. Do not stop to ask; state the range in the report.
2. **Read full files** for every changed area before flagging anything.
3. **Load rules and skills** for the changed paths (repo doc mapping). The maintainability pass and
   the analytics pass run on every review when the repo has them.
4. **Review in this order:** bugs, security and auth, project rules, language skill, framework
   skill, database skill, UI-kit skill, analytics instrumentation, maintainability, reuse and
   simplification, performance, tests.
5. **Recommend tests** only when the change adds branching, side effects, transactions or
   non-trivial validation. Skip thin pass-throughs and constants.
6. **Write the report** in the format below.

## What to look for

### Bugs (highest priority)

- Logic errors, off-by-one, wrong conditionals.
- Missing guards, unreachable paths, broken or swallowed errors. Error messages carry enough
  context to debug.
- Edge cases: null or empty inputs, races, partial failure.
- Explicit null checks over the TypeScript non-null assertion (`!`).

### Security, auth and validation

- Authentication goes through shared middleware or a handler wrapper, never ad-hoc per handler.
- Privileged paths check roles; resource access verifies the caller may read or mutate that
  resource before doing so.
- Validation goes through shared schemas (Zod, Pydantic), never manual parsing in handlers.
- No secrets or PII in logs; correct HTTP methods for state changes; injection-safe inputs; no
  cross-tenant or cross-user leakage.
- When the repo has a security baseline doc, check every route, cron, webhook and migration in the
  diff against it. Typical rules: the acting user comes from the verified
  credential only; every row id is checked against that user; webhooks verify signatures and fail
  closed without their secret; no bypass, key or shared password in code; no service-role key on a
  public edge worker.

### Analytics instrumentation

Runs when the repo has an event catalog (the repo doc names it). List the user-visible or business
actions the diff adds or changes (submit, create, delete, import, search, checkout, gate hit,
export, job completed, webhook), then check:

- a tracking call fires on the success path (and the failure path if the catalog has one);
- the event is in the typed catalog and its docs in the same change; funnel steps update the
  funnel doc;
- capture goes through the repo's helpers, never a raw client call with a free-string name;
- event and property names follow the repo's naming convention;
- values needed for person-scoped cohorts are set as person properties, not event properties only;
- a missing analytics token no-ops instead of throwing.

A new user-visible action without tracking, catalog or docs drift, or an ad-hoc capture string is a
Warning. A person-property mistake that would silently empty a cohort is a Warning. Flag only:
never ship analytics fixes from a review.

### Maintainability

Follow the repo's maintainability skill when it names one. Its presumptive blockers, at minimum:
a file crossing 1000 lines, new special-case branches tangling an existing flow, and a visible
restructuring that would delete a whole layer of complexity.

### Reuse and simplification

- The diff adds a function, query or component that already exists (or would with a small change):
  name the existing symbol.
- Helpers, wrappers or types used once: inline.
- Deep `if/else` chains: early returns and guard clauses.
- Excess file splits or premature abstraction: consolidate.

### Structure and conventions

- Follows the existing patterns of the affected app or package.
- Booleans read `has`/`is`/`should`/`can`; no single-letter names outside tight loops; magic
  numbers that affect behavior become named constants.

### Performance

- DB and server, Warnings when clear: N+1 queries, unbounded queries without a limit,
  sequential awaits that could run in parallel, more columns or rows than needed, round-trips one
  join would replace, redundant writes of an unchanged row. Cite the database skill's rule file
  when it applies.
- General, Suggestions unless severe: O(n²) on unbounded data, blocking I/O on hot paths,
  expensive work in render. `.some()` over `.filter().length` for existence checks.

### Tests

- Test code covers branching and edge or negative cases, uses factories instead of hardcoded ids,
  and touches no real network or DB outside integration tests.
- For non-test code, recommend tests only when step 5 warrants it; name the function and what to
  cover.

### Documentation (Suggestions)

- JSDoc or docstrings on exported functions whose signature is not self-explanatory; non-obvious
  intent and trade-offs written down.

## Before you flag something

- Investigate before claiming a bug.
- An edge case worth flagging comes with a realistic path that hits it.
- Some style "violations" are the simplest option; leave them. Maintainability blockers,
  domain-skill rules and analytics misses are never nits.

## Report format

- **Critical** (must fix): bugs, security or auth bypass, data integrity. `path:line` and a short
  fix.
- **Warnings** (should fix): maintainability blockers, domain-skill and project-rule violations
  (cite the rule), missing or wrong auth or validation, missing or drifted tracking (name the action
  and the catalog event that should fire), DB and server performance, broken error handling, missed
  reuse ("use existing X instead of new Y"), simplification, structure. `path:line` and a
  suggestion.
- **Suggestions** (consider): naming, docs, minor cleanup, refactors that reduce code. One line
  each.
- **Test recommendations** (optional): function or module and what to cover.
- **Config follow-up** (optional): when an issue recurs or a real best practice has no rule yet,
  propose the rule, lint check or style-guide entry with a one-line rationale.

One finding per bullet. Omit empty sections. Matter-of-fact tone, no flattery, no inflated
severity. A few high-conviction comments beat a long cosmetic list. Anything Critical, or several
security Warnings: end with one line that a focused security audit may be warranted.
