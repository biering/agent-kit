---
name: app-review
description: >-
  Prepare an iOS App Store submission so App Review goes smoothly: pre-submit audit, review notes, demo video
  shot list, expedite or call decision, rejection replies, scope per version. Use before submitting an app or
  update, when writing review notes, or after a rejection.
---

# App Review

App Review is a person reading your submission, often in a few minutes. Make
that person's job easy and the review is faster and kinder. Everything here is
cheap compared with a reject, fix, reject loop that costs days each round.

Facts below come from developers' reports, not Apple's documentation. Treat
timings as rough. The guidelines themselves are Apple's: re-read the current
ones before relying on a rule (App Store Review Guidelines, 2.1, 2.3, 3.1, 4.x, 5.1).

## The order of work

1. **Scope.** Decide what this version contains. [references/scope.md](references/scope.md)
2. **Audit.** Walk [references/audit.md](references/audit.md) against the build, on a device.
3. **Notes.** Write them in the fixed format of [references/review-notes.md](references/review-notes.md).
4. **Demo video.** Shot list and rendering in [references/demo-video.md](references/demo-video.md).
5. **Submit.** Paste the notes, attach the video in App Review Information, and
   attach every in-app purchase to this version.
6. **Expedite or call?** Usually neither. Rules below.
7. **If rejected,** follow [references/rejections.md](references/rejections.md).

## Opinions this repo holds

- **Notes and a demo video on every submission, first one most of all.** The
  video is the highest-return step in this list. A first submission with no
  notes and no demo plausibly gets triaged worse; we cannot prove it, and the
  cost of doing it is one afternoon.
- **A small first version.** A plain review takes about two days. A submission
  that touches risky areas can be escalated to a specialist and take up to two
  weeks. Ship the simple version first and add the risky parts in later updates.
- **Honest and boring.** No claim the app cannot back, no pattern copied from
  another app, no feature that only works after review. Reviewers notice.
- **Permissions asked in context**, with the purpose string saying exactly why.

## Expedite or call

- **Expedited review** is a form in App Store Connect. Critical bugs, events
  with a date, and marketing moments all qualify, and no reason is required
  beyond picking one. Do not overuse it: each use is a request on Apple's
  goodwill. Use it for a real deadline, not impatience.
- **Request a call** with App Review. Hardly anyone does, and it reportedly
  lands you in a separate, shorter queue. Worth it when the submission is
  unusual (a risky pattern, a new category), when a rejection is unclear after
  one written exchange, or when an earlier review stalled. Say what you want to
  discuss in two sentences.
- Neither replaces good notes. They sit on top of them.

## Hard rules (mistakes here are expensive)

- Never put real credentials, API keys or personal data in notes or the video.
  Demo accounts are throwaway; the password lives in the vault, not in git.
- Never ask for a rating or a review during onboarding.
- Never show an offer or paywall that differs from the one in review, and never
  switch it remotely to something non-compliant after approval.
- Never push a rejection reply that argues without a guideline number and evidence.
- Do not name a specific app, brand or person in notes unless it is yours.

## Where the store-wide blockers live

Agreements, trader status, account deletion, Sign in with Apple, Restore
Purchases: `.agents/skills/scaffold/references/app-store-submission.md`. The
console steps and in-app purchase commands: `.agents/skills/scaffold/references/app-store.md`.
Other stores: the `store-submission` skill.
