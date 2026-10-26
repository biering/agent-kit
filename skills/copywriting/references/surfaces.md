# Surfaces: budgets, jobs, failure modes

Each surface has one job and a budget. The budget is the point where the reader's attention runs
out or the layout breaks, not a style preference.

| Surface | Budget | One job | Fails when |
|---|---|---|---|
| **One-liner / tagline / claim** | 5 words max | The reader can picture the product | Abstract nouns, adjective stacks, ten readers ten pictures (`one-liner.md`) |
| **Hero headline** | 8 words max, no full stop | The reader knows what the page is about | It names a category ("The platform for ...") instead of a thing |
| **Hero subhead** | 1 sentence, 25 words max | Name the mechanism and the outcome | It repeats the headline in longer words, or lists three benefits |
| **Section headline** | 8 words max, no full stop | Say what changes in this section | It is a noun label ("Features") where a claim would fit |
| **Feature bullet** | 1 to 2 sentences | One capability, concretely, with the number if there is one | Adjectives instead of behaviour ("lightning fast" vs "in seconds") |
| **Step label** in a numbered flow | 4 words max, verb first | The verb the user performs | It describes the system's action, not the user's |
| **CTA button** | 4 words max, contains a verb | Name what happens on click | "Learn more" / "Mehr erfahren": generic, promises nothing |
| **Meta description** | 155 characters max | Win the click from the results page | No query terms, or a truncated sentence |
| **OG / social title** | 60 characters max | Survive a timeline | Same text as the meta description |
| **Empty state / error** (in-app) | 1 sentence plus 1 action | Say what to do next | Apology first, or blames the user |
| **Email subject** | 45 characters max | Earn the open | Clickbait the body cannot pay off |

Scanner budgets: `--budget 8` for headlines, `--char-budget 155` for meta descriptions, `--body`
for bullets and paragraphs.

## Anti-patterns that pass every spell-check

- **Adjective-led headline.** "Smart, transparent and simple": three moods, zero information.
  Replace each adjective with the behaviour that produces it.
- **Category self-description.** "The platform for data-driven workflows." Nobody wakes up
  wanting a platform.
- **Benefit without mechanism.** "Save time and make better decisions." True of every product
  ever shipped. Name *what* saves the time.
- **Number-free comparison.** "significantly faster", "far less effort". Produce the number or
  drop the comparison.
- **Stacked hedge.** "can help you potentially ...". Say what it does. Required legal hedges stay
  (see `unslop`, preservation); decorative ones go.
- **Headline/subhead duplication.** The subhead's first job is to add something. If it can be
  deleted without loss, delete it.

## Locale pairs

When copy lives in per-language files (`de.json` / `en.json` or similar):

1. **Every file, same edit.** A key exists in one file exactly when it exists in the other.
2. **Placeholders survive verbatim** (`{year}`, `{count}`, `{name}`), same set on every side.
3. **Length parity within reason.** German runs 10 to 20 % longer than English; beyond about 1.6x
   in either direction, a layout designed for one breaks for the other. The scanner reports the
   ratio for strings of 40 characters and more.
4. **Write each language from the brief**, same claim, same job, native register.
5. **Key-suffix contracts.** Many repos encode the string type in the key (`*.ti` title, `*.bt`
   button). Pass the repo's rules to the scanner with `--suffix-rules`; the repo note holds them.

## Off-limits

Legal pages (imprint, privacy policy, terms, withdrawal notice, data processing agreement) and
every compliance or certification claim in a trust section. The surrounding sentence may change;
the claim may not. Award strings are records, not copy. Where wording carries legal weight, stop
and route to the repo's legal review.
