---
name: copywriting
description: Write and sharpen short copy (one-liners, headlines, subheads, CTAs, meta descriptions) in DE and EN as scored variants, proposed before editing. Use for tagline, headline, CTA, Slogan, Claim, Überschrift, Formulierung, "make it punchier".

---

# Copywriting

Read the repo's `AGENTS.md` and `docs/agent-kit/copywriting.md` first; they win where they differ
from this skill.

This skill decides what a line should say and makes it say that in as few words as the surface
allows. Removing machine fingerprints from finished prose is the `unslop` skill's job; this skill
calls it in step 5 and keeps no slop catalog of its own.

## Hard rules

1. **Propose before you edit.** The default output is a table of candidates with scores and
   reasons. Write to locale files or templates only after the user picks winners. A headline that
   lands in git before anyone judged it is a headline nobody chose.
2. **Locales move together.** When a string exists in two languages, change both in the same edit.
   Write the second language from the same brief, never by translating the winner: a translated
   pun is a dead pun.
3. **Claims must be defensible.** A line may compress and dramatise. It may not state something
   the product does not do. Never invent a number, a customer count, an award or a percentage; if
   the exciting version needs a number, ask for it.
4. **Facts, hedges and legal text stay verbatim**, per the preservation contract in the `unslop`
   skill (`references/patterns.md`, section 3). Legal pages (imprint, privacy, terms, withdrawal)
   are off-limits, and so are compliance and award claims: edit the sentence around them, never
   the claim.

## Workflow

### 1. Frame, before writing a word

Answer four questions; ask the user for what the repo cannot tell you:

- Who reads this, and where? A scroller who owes you nothing gets 5 words. Someone on the
  pricing page who has decided to care gets a sentence.
- What must they do after reading? Picture the product, click, or understand one mechanic.
  One job per line.
- What do they already know? An analogue works only when the anchor is common knowledge to
  this reader.
- What can we defend? Pull the claim from the product: the number, the mechanic, the source.
  The repo note names where positioning and live copy live.

### 2. Scan (deterministic, free)

```bash
# one line, or a file of candidates (default budget: 5 words)
python3 <copywriting>/scripts/copy_scan.py --text "The all-in-one platform for teams" --budget 5

# a locale pair: missing keys, placeholder drift, length drift, optional key-suffix rules
python3 <copywriting>/scripts/copy_scan.py --mode i18n path/to/de.json --pair path/to/en.json \
  --suffix-rules "ti:nostop:8,bt:4,lb:sentence"
```

Stdlib only, DE and EN. Findings are candidates: the scanner cannot tell that "platform" is a
literal word in a security paragraph and a dead word in a hero headline, so pass `--body` for body
prose. `--suffix-rules` takes `suffix:rule[:budget]` entries, rule being `nostop`, `sentence` or a
bare word budget; the repo note holds the repo's string.

### 3. Judge, in this order

Read `references/one-liner.md` before judging or generating any short line.

1. **Non-ambiguous.** Ten readers picture the same product. Test it: name two other products the
   line could describe. If you can, it fails. This outranks everything, because nobody gets
   excited about something they did not understand.
2. **Exciting.** It provokes curiosity, recognition or mild outrage. A merely accurate line is a
   caption.
3. **Truthful.** It paints the right picture and survives the demo. It does not have to cover
   every edge case.

### 4. Generate, then pick

Produce at least five candidates across at least two angles (analogue and descriptive carry most
of the weight, see `references/one-liner.md`). Score each with `references/rubric.md`. Show the
top three, your recommendation, and what would have to be proven to ship the boldest one.

### 5. Unslop the prose

Anything longer than a headline (subheads, section paragraphs, feature bullets) goes through the
`unslop` skill before delivery. It owns the slop catalog and fact-preservation check; this skill
owns whether the paragraph says the right thing at all.

### 6. Deliver

For locale-backed surfaces, one table:

| Key | Current (DE) | Proposed (DE) | Current (EN) | Proposed (EN) | Score | Why |
|---|---|---|---|---|---|---|

For free-form copy: the scored variant list, then the recommended full text. "No change needed"
is a valid result when the original wins; churning a working headline costs recognition.

Apply only after the user picks: every locale in the same edit, the repo's key rules respected,
then the repo's checks from the repo note.

## References

- `references/one-liner.md`: the 5-word discipline, banned moves, anatomy, angles, worked
  examples. Read it on every short-line task.
- `references/surfaces.md`: budget, job and failure mode per surface; the locale-pair rules.
- `references/rubric.md`: six criteria, two hard gates.
- `scripts/copy_scan.py`: deterministic checks (`--mode line|i18n`, `--json`).
- Sibling skills: `unslop` (slop and fact preservation), and whatever the repo names for search
  intent, release notes and legal review.
