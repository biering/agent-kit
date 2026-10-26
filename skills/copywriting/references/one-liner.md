# The one-liner

A one-liner answers **"what is this?"** for someone reading on a phone, on bad reception, who owes
you nothing. It does not summarise the product. It earns the right to be read further.

## Two pitches, two budgets

- **Elevator pitch:** you met a busy executive, you have seconds, you may use sentences.
- **Timeline pitch:** a stranger scrolls a dozen posts a minute. You have the first 3 to 5 words,
  and every word after that is another chance to lose them.

This file is about the timeline pitch, because a line that survives it also survives the elevator.

## The budget: 5 words

Five, at most. Complex products are the reason the rule exists, not an exception to it:

- Bitcoin: *Digital gold*
- Solana: *Move money globally for cents*
- Pump: *Launch tokens without seeding liquidity*

If you cannot get there, you do not yet know what the product is. Write the 150-word version,
cross out everything the reader can infer, and repeat.

## Banned moves

**Jargon and buzzwords.** revolutionary, disruptive, redefining, the future of, next-generation,
seamless, holistic, end-to-end, AI-powered-everything. German: revolutionär, bahnbrechend,
nahtlos, ganzheitlich, maßgeschneidert, zukunftsweisend, "die Zukunft der ...".

The test: would your mother use this word explaining your startup to a friend over coffee? She
would never say "my boy is revolutionising the tradfi industry". She would say "he helps people in
Venezuela own dollars".

**Abstractions.** Legos, building blocks, layers, glue, rails, primitives, infrastructure,
ecosystem, platform, suite, hub. German: Bausteine, Ebene, Plattform, Ökosystem, Infrastruktur,
Klebstoff.

Shipped examples of what to avoid:
- "legos for intellectual property"
- "building blocks for DeFi"
- "global payments layer for eCommerce"
- "glue between apps and smart contracts"

Each describes a *shape*, not a thing anyone wants.

**Marketing verbs with no object.** "loans that work for you" says what it does for the reader in
the vaguest register and never what it *is*. It also reads as being sold to, which a scroller will
not tolerate.

## Anatomy, in strict priority order

### 1. Non-ambiguous

Ten readers, one picture. "Copilot for eCommerce" fails: a shopping assistant for consumers? A
sales agent for merchants? Support? Supply chain? Ten readers, ten products.

"Reddit for agents" passes: anyone who knows Reddit knows what it is and who it is for.

Practical test: name two *other* products the line could plausibly describe. If you can, rewrite.

### 2. Exciting

Make the reader feel something: curious, surprised, mildly outraged. "Tokenized dinosaurs" works
because *wait, what?* "Reddit for agents" works because the implication lands a second after the
words do.

Clarity ranks above excitement for a mechanical reason: an unclear line cannot be exciting.

### 3. Truthful

It must paint the right picture, not cover every case. The reader who believes the line and then
sees the product feels informed, not tricked.

- SP3ND ships **"Shop anything online with stablecoins"** with about 80 % shop coverage. "Anything"
  is a picture, and the picture is right.
- Hobba ships **"negative interest loans on Solana"** although the rate is negative only under
  about 30 % LTV in favourable yield conditions, because in four months of closed beta 90 % of
  users had negative rates 95 % of the time. The right to the claim comes from measured behaviour,
  not a spreadsheet edge case.

The pattern: founders over-index on truth and ship boring lines. Being 100 % accurate is a
caption. Earn the bold claim with data, then make it.

## Angles

### Analogue: known thing plus your twist

- "Reddit for agents"
- "Polymarket on Twitch streams"
- "Prediction markets on Twitch streams" (the anchor can be a category, not only a named product)

It works only when the anchor is common knowledge to *your* reader. "Prime broker for Solana
loans" fails for a retail audience that has never met a prime broker, and passes in a room full of
trading desks.

### Descriptive: verb, object, context

- "Launch tokens without seeding liquidity"
- "Shop anything online with stablecoins"
- "Move money globally for cents"

Imperative, direct, action-coded. This is the default when no clean analogue exists. The strongest
variant names the pain that is now gone ("without seeding liquidity").

### The rest, usually worse

Problem-first, solution-first, outcome-first, audience-first, mechanism-first, stakes-first. They
are legitimate framings for a deck; in a 5-word line they nearly always produce something abstract
or self-important. Reach for them only when analogue and descriptive both failed, and say why in
the proposal.

## Worked example: Hobba

| Candidate | Verdict |
|---|---|
| "loans that work for you" | Marketing lingo. Says what it does, not what it is. Reads as being sold to. |
| "prime broker for loans on Solana" | Anchor unknown to most readers. A term you have to look up is not a one-liner. |
| "self repaying loans on Solana" | Ambiguous: readers picture self-liquidating loans, refinancing, auto-paid interest. |
| **"negative interest loans on Solana"** | **Ships.** Everyone knows loans and interest; *negative* is the hook; truthful enough (see above). |

What Hobba does: the user deposits collateral and borrows against it; Hobba borrows more against
the same collateral, farms the excess, and the yield covers the interest on the total. The
one-liner does not explain that. It buys the next paragraph, which does.

The repo note (`docs/agent-kit/copywriting.md`) may carry worked examples of the repo's own lines.
Judge them by the same three tests.

"AI" earns its place in a line only when the AI *is* the surprise, never as a quality adjective.
