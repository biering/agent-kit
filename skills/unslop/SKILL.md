---
name: unslop
description: >-
  Find and remove AI-slop patterns (stock phrases, em dashes, rule of three, promo gloss) in German and English prose, keeping facts and voice. Use for unslop, humanize, 'sounds like ChatGPT', 'klingt generisch', and unasked on prose you drafted.
---

# Unslop

Remove machine fingerprints from prose without removing the meaning or the
human who wrote it. Works on German and English.

Two hard rules, learned from upstream research (theclaymethod/unslop's own
benchmark marked its rewrite pipeline "no-ship" for over-editing):

1. **Audit by default, rewrite only on request.** Flagging costs nothing;
   a bad rewrite damages facts and voice silently.
2. **Facts are sacred.** Numbers, names, prices, dates, URLs, quotes, code,
   legal hedges, and scope words survive every rewrite verbatim. A prettier
   sentence with a changed fact is a failed edit.

## Workflow

### 1. Scan (deterministic, free)

```bash
python3 <unslop>/scripts/slop_scan.py <file-or-->   # add --json for tooling
```

Stdlib-only, DE/EN auto-detected, masks code/quotes/blockquotes so
documentation about slop never flags itself. Findings are *candidates*, not
verdicts.

### 2. Judge (the actual audit)

Read `references/patterns.md` for the full bilingual catalog. The scanner
only covers the deterministic subset; judgment tells (preview/recap symmetry,
soulless neutrality, elegant variation, unearned analysis) are yours to spot.
For each scanner finding plus your own, decide in context:

- **Real slop:** the words carry no information a knowledgeable author would
  write. Report with the quote, the category, and the concrete fix.
- **False positive:** literal domain use (a company named like a stock word,
  such as Leverage, is never flagged), quoted material, genre convention
  (bold-label bullets in reference docs, a content skeleton the repo checks,
  changelog structure), or a required legal hedge. Say why it's exempt.

Output an audit as: quoted issue → category → suggested replacement, grouped
by severity (clear slop vs. judgment call). Never silently edit during an
audit.

### 3. Rewrite (only when asked)

Before touching the text, extract the constraint list: every number, name,
date, URL, claim, hedge, and negation. Rewrite paragraph by paragraph against
`references/patterns.md` § Preservation, then validate:

- diff the constraint list against the rewrite: 100% must survive;
- rerun the scanner on the result: new findings mean another pass;
- score against `references/rubric.md`: pass at 32/40, and remember
  criterion 5 punishes sterilized corporate-neutral as hard as AI tells.

Show the rewrite with a short list of what changed and why. If the original
was fine, say so: "no changes needed" is a valid, good outcome.

## Boundary with `copywriting`

This skill removes machine fingerprints from prose that already says the right thing. Deciding
what a line should say (a one-liner, a hero headline, a CTA, which of five candidates ships)
belongs to `copywriting`, which runs this skill as its prose pass. When the user asks for a new
line rather than a cleaner one, hand over.

## Carve-outs


Every repo has its own in `docs/agent-kit/unslop.md` (and its `AGENTS.md`). Read them before an
audit. These hold everywhere:

- **Never let a rewrite invent a fact.** Company names, product names, prices,
  feature claims and URLs are copied, never improved. A plausible invented URL
  is the failure that has already shipped.
- **Match the existing address form; never switch it.** A rewrite that flips
  Sie to Du (or the reverse) across a page is a voice change nobody asked for.
- **Legal pages (imprint, privacy, terms) are off-limits.** Their wording is a
  liability decision, not a style one.
- **No em dashes in UI strings**, ever, and none in prose the repo bans them
  from. Use a period, comma, colon or parentheses.
- **Structural copy is not slop.** Rank labels, empty-slot CTAs, a checked
  content skeleton (question headings, TLDR, comparison table): unslop the
  prose inside, never the skeleton.
- **Live content is an edit.** Rewriting published prose: audit first and keep
  the diff reviewable.

## References

- `references/patterns.md`: bilingual pattern catalog with fixes and the
  preservation contract. Read it on every audit.
- `references/rubric.md`: 8-criterion scoring for rewrites.
- Upstream research: theclaymethod/unslop (MIT; English-only, 3-layer
  scanners, eval-first) and Wikipedia's "Signs of AI writing". Consult them when
  extending the catalog, and add new patterns to both `patterns.md` and
  `scripts/slop_scan.py` with a false-positive guard.
