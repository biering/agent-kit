# What the gate is built on

The sources behind the rules, so a rule can be questioned at its root. "Read" means the source
was read during the research of 2026-10-13; "second-hand" means it was seen only in a summary and
should not be quoted as fact.

## Most changes do not help

- "Only one third of the ideas tested at Microsoft improved the metric(s) they were designed to
  improve"; in well-optimised products the rate is lower; at Google about 10 % of experiments led
  to a change. Kohavi et al., "Online Controlled Experiments at Large Scale", KDD 2013 (read).
  https://exp-platform.com/Documents/2013%20controlledExperimentsAtScale.pdf
- A few small changes matter a great deal and nobody can tell which in advance: two changes that
  took days each added about $100M a year at Bing. Same paper; Kohavi and Thomke, "The Surprising
  Power of Online Experiments", HBR 2017 (read).
- Experiments need thousands of active users; a ten times smaller effect needs a hundred times
  more. At a small product's size, small effects cannot be measured. Same paper.

Rule taken: the default is no; cheap fixes on busy money paths are worth doing; expensive polish
on quiet screens is not.

## What value is

- Growth accounting: new + reactivated + expansion − churned − contraction. Tribe Capital, "A
  Quantitative Approach to Product Market Fit", 2019 (read).
  https://tribecap.co/essays/a-quantitative-approach-to-product-market-fit
- Activation is often the cheapest way to raise retention; the usual mistake is to define it too
  early. Rachitsky and Timen, "What is a good activation rate" (read).
  https://www.lennysnewsletter.com/p/what-is-a-good-activation-rate
- Retention compounds: Bain's own text says a 5 % rise in retention gives more than a 25 % rise
  in profit in financial services. Reichheld, "Prescription for Cutting Costs", 2001 (read). The
  often quoted "25 to 95 %" is not in that document.
- A quarter of lapsed subscriptions are payment failures, and a recovered one lasts seven more
  months on average. Stripe, "How we built it: Smart Retries", 2024 (read).
  https://stripe.com/blog/how-we-built-it-smart-retries

## Scoring

- Reach as a real count per period; confidence exists to curb enthusiasm. McBride, "RICE",
  Intercom (read). https://www.intercom.com/blog/rice-simple-prioritization-for-product-managers/
- Confidence comes from the type of evidence, not from conviction: opinion near zero, launch
  data high. Itamar Gilad's confidence meter (read in part).
  https://itamargilad.com/the-tool-that-will-help-you-choose-better-product-ideas/
- An opportunity is an observed need; teams invent them. Test: is there more than one way to
  address it. Teresa Torres, opportunity solution trees (read).
  https://www.producttalk.org/opportunity-solution-trees/
- Every deliverable traces through someone's changed behaviour to a goal. Gojko Adzic, impact
  mapping (read). https://www.impactmapping.org/drawing.html

## Bugs

- "There is nothing special about bugs that makes them automatically more important than
  everything else." Ryan Singer, Shape Up (read). https://basecamp.com/shapeup/2.2-chapter-08
- 100 % is never the right reliability target; each increment costs far more than the last.
  Google SRE Book, "Embracing Risk" (read). https://sre.google/sre-book/embracing-risk/
- Fix now or close; a deferred bug is rarely fixed. Zero-bug policy write-ups (second-hand).
- AI tools push batch size up and large batches are harder to review. DORA, "Working in small
  batches" (read). https://dora.dev/capabilities/working-in-small-batches/

## Loss

- Risk is how often times how much. FAIR (second-hand).
- Likelihood is a decision of its own: is it being exploited, can it be automated, how much does
  it expose. CISA SSVC (read).
  https://www.cisa.gov/stakeholder-specific-vulnerability-categorization-ssvc
- Germany: § 312k BGB fixes the cancellation button and its confirmation page; without them the customer
  may terminate at any time (read). https://www.gesetze-im-internet.de/bgb/__312k.html

## Agents judging agents

- Agents praise their own work; separating the doer from the judge is a strong lever, and a
  sceptical standalone evaluator is easier to tune than self-criticism. The evaluator's known
  failure: it finds real issues and then talks itself into approving. Hard thresholds per
  criterion helped. Anthropic, "Harness design for long-running application development" (read).
  https://www.anthropic.com/engineering/harness-design-long-running-apps
- Judges are biased by authority, length, sentiment, by their own output and by being told the
  work was refined. Ye et al., "Justice or Prejudice? Quantifying Biases in LLM-as-a-Judge",
  ICLR 2025 (read). https://arxiv.org/abs/2410.02736
- Give the grader an "unknown" exit, grade outcomes and not the path, and read the transcripts.
  Anthropic, "Demystifying evals for AI agents" (read).
  https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Multi-agent work costs about fifteen times the tokens of a chat and needs a task worth it; set
  stopping conditions. Anthropic, "How we built our multi-agent research system" and "Building
  effective agents" (read). https://www.anthropic.com/engineering/building-effective-agents
- Unfiltered agent output swamps the people who review it: curl ended its bug bounty in January
  2026 over generated reports (second-hand).

## Not established

No primary evidence was found that UI polish in general moves retention. The honest reading is
that most of it does not, a small share matters a lot, and only measured reach plus a named
observable can tell them apart. Benchmarks for trial conversion with and without a card, for
annual plans and for pricing as a lever were found only second-hand.
