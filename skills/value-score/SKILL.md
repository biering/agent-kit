---
name: value-score
description: "Score customer value against added complexity, 1-10, from real evidence, before anything is built. Use for every new feature, customer wish or product idea, including a direct request to add or build one, before a plan or branch, and for the score line of a plan or PR. Triggers: new feature, idea, customer wish, Kundenwunsch, should we build, is this worth it, lohnt sich das, value score, complexity."
---

# Value score

Read the repo's `AGENTS.md` and `docs/agent-kit/value-score.md` first; they win where they differ. The
repo doc names the data sources and what the core job is.

This skill exists so that not every customer wish and good idea gets built until the product does
everything and nothing well, and so an owner can judge a change in a minute instead of re-deriving what
it is worth.

**A new feature's default answer is no.** The evidence has to earn it. "Not now" is a good result: name
it and stop.

## When

- **A new feature, customer wish or idea:** score first, in the reply, before a plan, a branch or code.
- **A plan:** the score lines open its body.
- **A PR:** the score lines open its body. Score again here, because scope grows while building. Say when
  a number moved since the plan.
- **A bug:** it is fixed either way. The score only decides how small the fix can be.

## Gather evidence, then score

Spend a few queries, not an afternoon. Use every source the repo doc lists that can answer these. Run
them yourself or in one read-only subagent:

1. **Demand:** how many customers asked, how many of them pay, how recently. Count them in the tracker.
2. **Reach:** how many people reach this screen or job in 30 days. Count it in analytics.
3. **Today:** what do they do now? A workaround that works lowers the value.
4. **Size of the gap:** a production count of what is missing or wrong, in aggregate.
5. **Market:** do competitors have it, do people search for it? This shows that a thing is expected, not
   that it is valuable to your customers.
6. **Core job:** does it serve what the repo doc names as the core job?
7. **Smallest version:** what is the least that would test it? Score that, not the full idea.

Production reads are read-only aggregates: counts and sums, never a row that identifies a customer.

A source that cannot answer is written down as `unknown`. Never estimate a number and present it as
measured. When a source is missing or out of date, say so: a thin data basis is a finding.

## The lines

Always all five, in the reader's language where it is a reply. The Means and Scale lines are the point:
the reader should not need to know this file.

```
**Value 7/10 · Complexity 4/10**
Means: Value 7 = a core job gets clearly better, measured reach. Complexity 4 = a small addition on an existing path.
Scale: Value 1 nobody notices, 5 some users notice, 10 blocker. Complexity 1 nothing new to know, 5 one new concept, 10 hard to undo.
Evidence: <measured numbers, each with source and date, or `unknown`>
Check: <one thing to look at afterwards, with the number it should move>
```

## Customer value

The worst thing that happens to a customer without this change, times how many meet it.

| Score | Meaning | Example |
|---|---|---|
| 10 | A blocker on a core job, wrong money, data loss, a security hole | Checkout fails; a shown figure is wrong |
| 8-9 | A core job visibly fails or returns far too little, for many users | Search finds a fraction of the market |
| 6-7 | A core job gets clearly better, measured reach | Results load in half the time |
| 4-5 | A real improvement a part of the users would notice | A filter some people asked for |
| 2-3 | Polish few would notice unprompted | A better empty state on a rare screen |
| 1 | No customer would notice | A rename, a refactor with no effect |

Caps and floors, applied after the table:

- **A blocker bug is 9 or 10 whatever its reach.** This floor beats every cap below.
- **No measured reach: 5 at most.** One report from one person is an example, not a reach.
- **A customer wish without a count: 4 at most,** whoever asked.
- **Beside the core job: 5 at most,** however good it is.
- **Few users reach it: subtract.** A failure on a screen few people open is not a failure for many.
- **Internal work scores by the customer failure it averts,** times its likelihood. Tooling that only
  saves the team time is 3 at most.

## Added complexity

What stays after the merge, not how long it took to write. An agent writes code cheaply; someone reads,
runs and debugs it for years.

| Score | Meaning | Example |
|---|---|---|
| 1-2 | Nothing new to know | Copy, a value, a one-file fix. A net deletion is 1 |
| 3-4 | A small addition on an existing path | One more query or component |
| 5-6 | One new concept in one app | A new parser, setting or background job |
| 7-8 | A new moving part that runs without anyone | A new pipeline with a migration, a new vendor, a running bill |
| 9-10 | Crosses apps or cannot be undone | A new data model, data that spreads, new infrastructure |

Add a point for each, up to 10: it depends on a page or API you do not control; it is a new exception to a
written rule; it puts data in production that is hard to take back.

## What the numbers decide

| Value minus complexity | New feature, wish or idea | Anything else |
|---|---|---|
| 2 or more | Plan it | Do it |
| 0 or 1 | Name the smaller slice, score it, plan that if it clears 2; otherwise ask the owner | Look for the smaller slice, then do it |
| Below 0 | Stop and ask the owner; recommend no unless evidence changes | Ask the owner, unless it is a bug, or docs, tooling or CI of complexity 4 or less |

- **Score the slices, not only the whole.** A change of several parts scores each one, because a high total
  hides the part that earns nothing.
- **Small things go together.** Several low-value fixes in one area are one change with one score.
- **Do not raise a score to get past this.** The numbers are the author's estimate, and authors overrate
  their own work. A low score with honest evidence is what this is for.
