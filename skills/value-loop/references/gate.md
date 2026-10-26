# The value gate

Six questions, answered from evidence. The gate's job is to say no to most things and to say why
in one sentence.

## Before scoring: the prior

Say it in the verdict: about one well-motivated change in three helps, fewer in polished areas,
and the loop's own growth-lane rate from the last lookback when there is one. A finding has to
beat that prior with evidence, not with wording.

## First, pick the lane

- **Growth lane:** the finding claims more customers, more revenue or less churn.
- **Loss lane:** the finding averts a loss: someone can read or change another account's data,
  someone can get paid work without paying, a customer is charged wrongly, a number the customer
  decides on is wrong, data is destroyed, a legal duty is missed.

A loss-lane finding is never rejected for "no growth". It is judged on how likely the loss is and
how large. When customers decide on the product's numbers, a figure computed wrongly belongs in
the loss lane even when nobody has complained.

## "Unknown"

- **Growth lane:** an unknown reach, impact or evidence fails that question.
- **Loss lane:** an unknown count alone is no fail. Score reach from who can trigger the loss or
  how many records can be affected (below), and name the count that would settle it. If that count
  is cheap to take, the orchestrator takes it before the verdict stands.

## The six questions

| # | Question | What counts as an answer | Reject when |
|---|---|---|---|
| 1 | **Which money term moves?** Growth: acquisition, activation, trial conversion, retention at renewal, expansion, involuntary churn. Loss: which loss event, to whom. | A named step of a funnel in the repo's funnel doc, or a named loss event. | The only answer is "better UX", "cleaner", "more consistent", "best practice". |
| 2 | **How many real users meet the condition in a month?** Not how many use the screen: how many hit this. Loss lane: who can trigger it, or how many accounts or records are affected. | A count with its source and date. The surface's user count is an upper bound. | Growth lane: no number, or a surface almost nobody uses (the value model's usage table). Loss lane: see "Unknown". |
| 3 | **What happens to a user who meets it?** Blocked from value or from paying / forced into a workaround / mildly annoyed / will not notice. Loss lane: the size of the loss in money, data or trust. | A reproduction: a failing test, a recording, a screenshot, a production error. | "Will not notice". Cosmetic and off the money paths the value model names. |
| 4 | **How strong is the evidence?** | The type, named, on the scale below. | 0. The proposer's confidence is not evidence. |
| 5 | **What does it cost, all of it?** Lines and files, systems touched, minutes of human review, risk class (billing, auth, migrations and the repo doc's high-risk areas), whether it can be undone, what it needs from the owner. | Read from the diff or, before a fix exists, from the code that would change. | Too large to review in one sitting. A high-risk area for a low-impact finding. Unrelated changes bundled in. |
| 6 | **How will we know?** | One observable with a check date: an event count, a billing figure, an error rate, or for the loss lane the production count that shows the loss, to be re-read. | No observable can be named. |

Two things the gate does not decide:

- **An owner step is not a reject.** A migration to apply or a decision to take is named under
  "Needs". A finding whose value depends on the decision is a DECIDE.
- **Rank is the orchestrator's.** The gate says whether an item passes; how many a run can afford
  is decided afterwards, from the caps.

## Scoring

Coarse on purpose. Multiplying guesses gives false precision.

**Evidence**

| | Growth lane | Loss lane |
|---|---|---|
| 0 | opinion, convention, "best practice" | a possibility nobody showed in code |
| 1 | one anecdote; a reading of the code | read in the code, not reproduced |
| 2 | several reports, or a measured drop | reproduced by a failing test, or read in production's configuration; never seen happening |
| 3 | reproduced, with measured reach | seen in production data: rows, charges or accounts already affected |

**Reach**

- Growth: 0 unknown, 1 under 10 users a month, 2 tens, 3 a hundred or more.
- Loss, take the higher of two scales:
  - *who can trigger it:* 1 only the account's owner, against themselves; 2 any signed-in user,
    against one account whose id they must know; 3 any signed-in user, against any account or
    against the business;
  - *how many are affected* (a wrong number, or a defect nobody triggers): 1 a handful of accounts
    or records, 2 tens, 3 hundreds, or every user of the surface.

**Impact**

- Growth: 0 will not notice, 1 annoyed, 2 workaround, 3 blocked from value or from paying.
- Loss: 1 small and recoverable, 2 real money or one account's private data, 3 many accounts,
  legal exposure, or a number customers decide on.

**Cost** 1 small and safe, 2 medium or one risky area, 3 large, or risky and hard to undo.

`score = reach × impact × evidence ÷ cost`. Use it to rank, never to justify. A zero on reach,
impact or evidence is a reject whatever the others say.

## Verdicts

For a finding:

- **DO**: passes all six. Fix it, alone, in a small PR.
- **BATCH**: real but tiny, sharing a screen or file with others like it. One PR for the group.
- **DECIDE**: its value depends on a product decision (a definition, a price, what a free user may
  do), or it helps the customer and costs revenue. Write the one question and the two answers;
  build neither.
- **RECUT**: the problem passes questions 1 to 4, and the proposed fix fails question 5. Say what
  the smaller fix is. A loss-lane RECUT also gets a ticket, because the hole stays open.
- **DROP**: fails a question. One sentence: which question, and why.

For a PR that already exists the work is sunk, so the question changes: is merging it worth the
review, the deploy risk and the follow-up it needs.

- **MERGE FIRST**: loss lane with reach 2 or 3 and impact 2 or 3, or a growth fix on a money path
  with evidence 3. Say what must happen with it (a migration, an order, a check after deploy).
- **MERGE**: positive, not urgent.
- **DECIDE**: as above; name the question. A PR that changes the **definition** of a number
  customers see (what a KPI covers, which price a line follows) is a DECIDE. A PR that corrects a
  number computed against its own definition is an ordinary loss-lane item.
- **RECUT**: the problem is real and this PR is the wrong shape for it. Say which part to keep.
- **CLOSE**: the surface is unused, or the loss has never occurred and no stranger can trigger
  it, or the change costs more attention than it returns. Say what would change the verdict.

## How this gate fails, and the guard for each

1. **Rubber stamp.** The judge finds the problems and then decides they are fine. Guard: any one
   failed question is a reject; the gate reads evidence, not a pitch; a fresh agent per batch.
   Watch the approval rate: when it climbs toward all of them, the gate has stopped working.
2. **Score theatre.** Guessed numbers multiplied, and phrases that pass ("improves activation").
   Guard: reach is the count of users who met the condition, or unknown; evidence is scored by
   type; every approval names an observable that `lookback` checks.
3. **Wrong objective.** Too loose and the owner drowns in small PRs. Too tight and security,
   billing and correctness fixes are refused for "no growth", or a change that helps customers is
   refused for costing revenue, or a retention trick that harms them is approved. Guard: two
   lanes, the caps, the never-change list, and DECIDE for anything that trades the customer's
   interest against revenue.
