# Storytelling hooks

The first line of a post, a reel, a carousel cover or an email decides whether anything after it
is read. This file gives ten story patterns for that line, with a fill-in template each and when
it fits. The patterns are a starting set, not a script: pick one, fill it with the user's real
material, then judge it like any other line (`SKILL.md`, step 3).

Source: the ten patterns are our grouping of Chase Dimond's "80 Storytelling Hooks To Make People
Stop Scrolling" (X, 2026-11-17). Templates are reworded; the few quoted hooks are his and marked.

## House bans: these override every template

A template that needs a banned move gets rewritten, not excused. These come from the `unslop`
catalog (`skills/unslop/references/patterns.md`) and the repo's voice file:

1. **No "nobody tells you" family.** "Nobody tells you", "nobody talks about", "nobody prepares
   you for", "here's what nobody sees". It claims a secret the reader has usually heard before.
   Name the specific thing instead: "Our first 40 orders cost us 11 hours of packing."
2. **No "not X, it's Y".** Negation-then-assert ("It's not a tool, it's a teammate", "The problem
   isn't X. It's Y.") is the most recognisable AI closer and it slips into hooks too. State Y.
3. **No em dashes.** Use a full stop, a colon or a comma.
4. **No cut words.** unlock, game-changer, elevate, seamless, delve, journey (as a metaphor),
   supercharge, leverage (as a verb). The scanner flags them.
5. **No invented facts.** Every bracket is filled from the user's material. If the material has no
   number, the hook carries `[PLACEHOLDER: number]` and the user supplies it. A hook built on a
   made-up "3x" is a lie with good rhythm.

Patterns 4 and 6 below are where the first ban bites most; their templates are already rewritten.

## The ten patterns

### 1. Before and after
- Template: "I went from [measurable start] to [measurable result]. [The one thing that changed]."
- Variant: "[Time] ago I was [specific problem]. Today [specific state]."
- Use when: the user has a real, measured change (revenue, weight, followers, hours). Without both
  numbers it is a vague brag; ask for them.

### 2. The costly mistake
- Template: "The mistake that cost me [amount of time or money] was [specific decision]."
- Example (Dimond): "I ignored this warning sign, and it cost me."
- Use when: there is a real loss with a price. Readers trust a cost more than a win.

### 3. The turning point
- Template: "I almost [gave up on goal] until [one specific event]." / "The day I stopped
  [old habit], [result] started."
- Use when: one moment, conversation or decision really did change the outcome. Name the moment.

### 4. Behind the scenes
- Template: "[Result] took [hours, drafts, attempts]. Here is what that looked like."
- Variant: "The result looks simple. The process took [specific effort]."
- Use when: the user has the process material (drafts, numbers, screenshots). Rewritten from the
  source's "here's what nobody sees" framing (ban 1).

### 5. Contrarian reversal
- Template: "Everyone told me to [common advice]. I did [the opposite], and [result]."
- Variant: "I used to believe [popular belief]. [What changed my mind]."
- Use when: the user holds the opinion and has a reason or result behind it. Contrarian without a
  reason is noise. Watch ban 2: the reversal is a story, not "it's not X, it's Y".

### 6. Shared struggle
- Template: "If you've ever [specific, physical struggle], this is for you."
- Variant: "You know the moment when [specific situation]?"
- Use when: the audience shares one concrete pain. The more specific the struggle, the stronger
  the recognition: "staring at a blank caption at 11pm" beats "feeling stuck". Rewritten from the
  source's "nobody prepares you for" framing (ban 1).

### 7. Client or customer case
- Template: "A client came to us with [problem]. [One change] got them [specific result]."
- Example (Dimond): "One customer question changed how we approached [product]."
- Use when: there is a real case with a result the client agreed to share. Anonymise if needed;
  never invent the client.

### 8. Open loop
- Template: "I noticed [something unusual] about [situation]. Here's what I found."
- Variant: "[Something] didn't add up, so I looked closer."
- Use when: the body really pays the loop off in its first lines. An open loop the post never
  closes is clickbait and costs trust on the next post.

### 9. Hindsight lesson
- Template: "After [number] [years or attempts] of [experience], here's what I know for sure."
- Variant: "[Number] lessons from [experience] I wish I'd learned sooner."
- Example (Dimond): "Here's what [number] failed attempts taught me about getting it right."
- Use when: the user has earned the authority the number claims. The number must be real.

### 10. The fork
- Template: "I had two choices: [A] or [B]. I chose [B]." / "I said no to [opportunity] for one
  reason." / "I took a risk that could have cost me [specific consequence]."
- Use when: a real decision with stakes the reader can weigh. Name both options.

## Picking one

| The user has | Start with |
|---|---|
| A measured result | 1 Before and after, or 9 Hindsight lesson |
| A loss or a failure | 2 The costly mistake |
| A process, drafts, raw numbers | 4 Behind the scenes |
| An opinion against the grain | 5 Contrarian reversal |
| A client result | 7 Client or customer case |
| An odd observation | 8 Open loop |
| A hard choice | 10 The fork, or 3 The turning point |
| An audience pain, no story yet | 6 Shared struggle |

Write two or three hooks from different patterns, score them with `references/rubric.md`, and run
the winner through `unslop` (scanner and `ship_check.py` for the platform) before it ships.
