# Report and run file

The same content goes to the user and into `<run folder>/YYYY-MM-DD.md` (add `-2` for a second
run on a day). One file per run: two runs never edit the same file. `lookback` writes its results
into the run file it checks.

```markdown
# Value loop, <mode>, <date>

**Value model used:** <files and dates of the figures the verdicts lean on; counts taken today>
**Judged:** <n> items in <n> gate batches. **Approved:** <n> (<share>). **Prior:** about one in
three; this loop's own growth-lane rate so far: <n of m | no lookback yet>.

## Merge first | Do
| Item | Lane | Why, in money terms | Reach | Needs | We will know by |
|---|---|---|---|---|---|

## Merge | Batch
| Item | Lane | Why | Needs | We will know by |
|---|---|---|---|---|

## Passed, not picked (run mode)
| Finding | Score | Why it waited |
|---|---|---|

## Needs a decision
| Item | The question | If the first | If the second |
|---|---|---|---|

## Re-cut
| Item | Lane | The problem that stands | Why this fix fails | The smaller fix |
|---|---|---|---|---|

## Needs your go-ahead (run mode)
| Finding | Why the autonomy gate reserves it | Plan |
|---|---|---|

## Close | Dropped
| Item | Lane | Failed question | Why, in one sentence | What would change it |
|---|---|---|---|---|

## For the owner (never-change list)
- <what was observed on the cancellation flow, pricing, consent, ...> | none

## Found on the way, addressed by no item
- <things the scouts or the gate saw that are not a finding in this run> | none

## Not verified
- <every figure a verdict rests on that could not be checked>
- <every item judged without a measured reach, by id>
- <any place the run broke its own rules: a batch over the size, a raised verdict not re-gated>

## Where the orchestrator lowered a verdict, or sent one back
- <item: the gate said X; the count is N; lowered to Y | re-gated, new verdict Z> | none

## Lookback (filled by a later run)
| Item | Lane | Merged? | Predicted | Observed on <date> | Verdict held? |
|---|---|---|---|---|---|
```

Rules for the report:

- Lead with what the owner should do next, not with how the run went.
- Every row in "Close" can be overruled in a word. Make the reason specific enough to disagree
  with. A loss-lane close on reach says what was counted and that it was zero.
- State the approval share. Above a half, say which approved items were nearest the line.
- Copy every "Not verified" at full strength.
- Every approved row carries its lane and its "we will know by", or `lookback` has nothing to read.
