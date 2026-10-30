---
name: product-changelog
description: Turn branch changes into changelog entries users read, in each product locale, with a real screenshot when it helps. Use for changelog, release notes, what's new, product update, feature announcement, ship notes.
---

# Product changelog

Read the repo's `AGENTS.md` and `docs/agent-kit/product-changelog.md` first; they win where they
differ from this skill. The repo note names the entry path, the frontmatter, the locales, the
screenshot script and the badge values.

A changelog entry says what a user can do now. It is curated and rewritten, never a commit log.

## Working order

1. **Read the diff, not the filenames.** Diff against the base branch, list the user-visible
   changes, and map each to the route or UI state that proves it. Nothing user-visible on the
   branch: say so and stop. Never write entries for refactors, tests or dependency bumps.
2. **Check existing entries.** Update one when the task is a follow-up to it.
3. **Categorise** each change (table below).
4. **Write the primary-locale entry** in user-facing language, then every other locale with the
   same meaning and tone, written natively, using the product's own terms from its locale files.
5. **Decide on a screenshot.** Add one only when it makes the change clearer.
6. **Capture, save and reference it** (Screenshots below).
7. **Run the `unslop` skill** over every entry. Only the sentences are in scope; the entry
   structure is contract.

## The entry contract

```markdown
### New: Bulk export for reports

You can now export up to 10,000 rows at once from any report view.
Select your rows, click Export, and choose CSV or Excel.

Previously limited to 500 rows per export.

![Bulk export button in the reports toolbar](/img/changelog/bulk-export.png)
```

Category label, user-facing title, what you can do now, how, what changed, visual. Repos with
per-entry files carry the category and title in frontmatter instead; the body order stays.

**Language rules:**

- Write what the user can do, not what you built: "You can now export 10,000 rows", never
  "Implemented a batch processing queue".
- Open with "You can now ...", "Reports now ...", or "Fixed an issue where ...".
- Include the benefit, present tense, and the number when there is one.
- No internal references: PR numbers, ticket ids, branch names, class names.
- Lead with the biggest or most requested change ("By popular request:" when true); group
  related changes; link docs for complex features; date every entry.

## Categories

| Category | Use for |
|---|---|
| **New** | Something users could not do at all before |
| **Improved** | Something users could do, now better, faster or easier |
| **Fixed** | Something broken that now works |
| **Removed** | Deprecated or removed features |
| **Security** | Security patches |

"Updated" carries no information: decide whether it was improved or fixed. "Various bug fixes"
carries none either: list the fixes or skip them.

## Breaking changes

Lead with a prominent warning, then what changed, what the user must do (numbered, with a
migration link), a dated timeline, and where to get help:

```markdown
### Breaking: API v1 endpoints retire on March 15

**What changed:** v1 endpoints stop working on March 15.

**What you need to do:**
1. Move your calls to v2 ([migration guide](link)).
2. Switch authentication to Bearer tokens.
3. Test your integration before March 15.

**Timeline:** now, v2 available and v1 works. March 1, v1 returns deprecation warnings.
March 15, v1 stops working. Questions: support@example.com.
```

## Screenshots

Prefer real product screenshots over generated art. Before capturing, confirm that the dev server
runs, the exact route, whether it needs auth, and the state to show (record, filters, modal,
locale, seeded data).

1. **Scripted headless capture first**, when the repo has one (the repo note names it, its login
   shortcut and its clipping). It is repeatable and avoids timing accidents.
2. **Interactive browser as fallback** for states a script cannot reach (open modals, drags,
   multi-step wizards). Check open tabs first; attaching to the user's already working localhost
   tab is often more reliable than opening a fresh one. Snapshot, click to the exact state,
   capture.
3. **Auth, safest first:** the user logs in and you attach to that tab; then a dedicated test
   account; then a manual handoff for MFA or another human-only step. Never ask for production
   credentials when a local or test path exists.
4. **Look at the PNG before committing.** Popovers, toasts and dev widgets are timing-dependent,
   and a photobombed screenshot looks fine in the terminal.

Checklist: shows the new behaviour; sensitive data hidden; page fully loaded; locale matches the
entry; readable viewport; stable descriptive filename (`properties-strategy-filter.png`). Store it
in the repo's public changelog image path and reference it from every locale's entry.

| Change | Visual |
|---|---|
| New UI feature | Screenshot of the feature |
| Redesign | Before and after |
| New workflow | Step screenshots or a short video |
| Performance | A chart of the improvement |
| Complex feature | An animated GIF or a short video demo |


## Versioning and channels

- SaaS with continuous deploy: date-based entries (`2026-02-08`), batched weekly or per feature
  launch. Versioned software: SemVer (MAJOR breaking, MINOR features, PATCH fixes), one entry per
  release. Mobile: match the store's "What's New".
- The changelog page carries every entry. In-app notification: a 1 to 2 line summary for new
  features and breaking changes. Email: curated highlights for major releases. Social: one feature,
  one sentence, one visual, one link.

## Deliverable

One entry per user-visible change in every product locale, the optional screenshot with its
references, a 2 to 4 bullet plain-language summary of what shipped, and the diff hunks you skipped
as internal-only.
