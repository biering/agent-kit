# Brief for a fixer

Send this, with the one finding and its gate verdict, to a subagent in its own worktree. Fill in
the repo doc's prepare and verify commands and high-risk areas.

---

Fix one finding in this repository and bring it to a pull request that is ready for review. The
finding passed a value gate on a stated cost; staying inside that cost is part of the job.

**The finding and its verdict:** <paste the evidence pack and the gate's six answers>

**The budget:** <lines> lines in <n> files, no migration unless the verdict says so. If the real
fix needs more than that, or touches billing, auth, a migration or <the repo's high-risk areas>
when the verdict did not expect it: stop, push the branch with the failing test and what you
learned, open no PR, and report. A larger fix is a new finding for the gate, not a decision for
you.

How to work:

1. Prepare the worktree (<prepare command>), then read the root `AGENTS.md` and the `AGENTS.md`
   of every app you edit.
2. Follow the repo's bugfix skill: a failing test first, at the lowest tier that can express it,
   then the plan, then its autonomy gate. That gate still applies. If the fix is in a class it
   reserves (large, several packages, a UI-flow change, schema, access rules, auth, billing, a
   public API contract, a new dependency), stop after the failing test and the plan, push the
   branch without a PR, and report "needs go-ahead" with the plan's path. The value gate said this
   is worth doing; whether it is safe to do unattended is the autonomy gate's call.
3. Follow the `dev-loop` skill for the reviews the diff owes, <verify command>, the PR and CI.
4. One finding, one PR. Leave the neighbouring thing you noticed for your report.
5. Label the PR `value-loop` (`gh label create value-loop 2>/dev/null || true`, then
   `gh pr edit <n> --add-label value-loop`) and give its body a `## Value` section in the form
   shown in the value-loop skill, with the observable and the check date from the verdict.

Never: apply a migration to a remote database, read or write production data, push with
`--no-verify`. Never change a decided rule: the cancellation flow, prices, tiers, limits, the
trial's structure, what is gated, consent, legal pages, who receives an email. Enforcing a decided
rule is allowed and may be the whole fix: closing a way around a paywall, a limit or an ownership
check changes no rule.

Report: the PR and its state, the root cause in two sentences, the test that failed before and
passes now, the real size against the budget, what you did not verify, and anything you noticed
and left alone.
