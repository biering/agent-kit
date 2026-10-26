# The value model: what the repo's file contains

The gate judges findings against one file the repo keeps (path in `docs/agent-kit/value-loop.md`).
It lives in the repo, not in this skill, because every run may update it. Every figure carries its
date and its source file; step 0 of the skill replaces a figure when a newer source exists.

## Sections

1. **The money equation.** Revenue change in a period = new + reactivated + expansion − churned −
   contraction. A finding has value when it moves one of these terms or averts a loss. Everything
   else is taste.
2. **The state of the business.** A table: fact, figure, source. Revenue and its trend, paying
   customers, customers won and lost per week, cancelled-but-active, plan mix, dormant paying
   accounts, renewals due, signups, activation, second-week return, trial conversion, one week of
   the funnel, cancel reasons. Close with two sentences that read the table.
3. **What matters now, in order.** Five to seven items, each with the figure that puts it there.
   Typical: renewal of dormant subscribers, activation and the second visit, trial to paid,
   involuntary churn (failed payments), trust in the product's numbers (loss lane), acquisition,
   abuse and leaks (loss lane).
4. **Who uses what.** Distinct users per surface per month, from the database, with a "read as"
   column. A growth-lane finding on a surface in the lower half needs strong evidence that the
   surface matters to people who pay or are about to. Add use by plan when you have it.
5. **What a code loop can move, and what it cannot.** Can: errors and dead ends on the money
   paths, broken states on busy screens, a failed-payment banner and card update, wrong numbers,
   slow money-path pages, copy that leaves a new user stuck. Cannot: prices, tiers, what is gated,
   the trial's structure, the cancellation flow, positioning, channels.
6. **What is not measured.** Sampled client events, funnels that start late, feature use not
   recorded by plan, and the size below which no small effect can be A/B tested. State these when
   a verdict depends on them.
