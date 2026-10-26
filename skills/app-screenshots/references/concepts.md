# Concepts that convert

Read this before capturing anything. A set is decided by its concept, and the
concept comes from what users want, not from which screens exist. Distilled
from Scrnsht Studio's seven principles and the sets they cite (Fortelling,
Cheat Day, ElevenReader, WalkBlock, CosmosTune/Rewire, Parrot), filtered
through Apple's asset rules.

## Research first

Write the concept down (one line per frame, beside the spec) before opening the
simulator. Inputs, in order of weight:

- **What users say.** App Store reviews, support mail, the words in feedback.
  Their phrasing is your copy: "Gives me the feeels" beats any line a team writes.
- **What the app is for.** The app's `AGENTS.md`, landing page and listing.
- **What the alternatives promise.** The `aso` skill's competitor lookup. The
  value prop is the gap between what they promise and what this app does.

## The seven principles, as checks

1. **Frame 1 is the value prop.** A stranger who sees only frame 1 in search can
   say what the app gets them. Usually the outcome in three to five words:
   "Beat writer's block", "Listen to anything", "Walk to unlock apps".
2. **Outcome over feature.** Nobody wants a calorie tracker; they want to eat
   what they love and stay on track. Every frame answers "what do I get", and all
   of them point at the same outcome.
3. **One frame, one message.** Secondary information may support it (a sub-line,
   a stat) but one idea dominates. If a reviewer remembers two things from a
   frame, split it.
4. **The idea is visible before it is read.** Run `--sheet` and look at the
   second row, where every word is removed. If the frames no longer say what the
   app does, the visual hook is missing and the copy is doing all the work. The
   usual fix is a callout: lift the one element that *is* the idea (the price,
   the blocked-app list, the voice picker) out of the device and enlarge it.
5. **Humans where they fit.** Faces, hands and real situations pull the eye
   before UI does. The compositor does not place photos yet; a set that needs
   one goes through `compose-artboards.mjs` or a designer, with an image the app
   has the rights to.
6. **Trust from real signals only.** Rating, review count, user count, press,
   a research partner. Every one needs a source, which the compositor enforces.
   No rating yet? Leave it out, or use an honest specific ("Made by a nurse",
   "No account, no tracking") instead of a vague claim.
7. **Short copy, set big.** Fewer words let the headline be the frame. Use the
   user's words, not the team's. `hero: true` is for captions of two or three
   short lines.

## Patterns from the reference sets, and how to get them

| Pattern | Seen in | Spec |
|---|---|---|
| Oversized headline, one accent word | Fortelling "Beat *writer's* block", WalkBlock "Walk to *unlock* apps" | `"hero": true`, `"caption": "Walk to *unlock* apps"`, `"accent"` |
| Headline plus a quiet qualifier | Cheat Day "Know what's in your food / *when eating out*" | `"sub"` |
| The key UI element lifted off the device | Fortelling's "World building" chip, Cheat Day's nutrient card | `"callouts": [{ "crop": [x, y, w, h], "scale", "shift" }]`, crop in capture pixels |
| Device on top, copy below | Cheat Day frame 3, ElevenReader frame 2 | `"layout": "bottom"` |
| Five stars and a user's words | ElevenReader "Gives me the feeels", WalkBlock | `"quote": { "text", "author", "source" }` |
| Laurel with a real number | WalkBlock "4.8 on App Store", Rewire "100K+ users" | `"badge": { "value", "label", "source" }` |
| Before / after or us / them | Parrot "other app vs with parrot", WalkBlock grey to colour | Design it in `compose-artboards.mjs`; keep the "other" side generic, never a named competitor |
| A thread running across frames | Fortelling's connector line, WalkBlock's path | Not supported; needs a designed set |

Vary the layout across the set (top, bottom, a callout frame) but keep one
visual language: same ground, same type, same accent. Variety in composition,
consistency in style.

## Do not copy these from the references

Apple's asset rules apply to screenshots too
([asset best practices](https://developer.apple.com/app-store/asset-best-practices/)):

- **No Apple recognitions:** "Apps we love", "App of the Day", Editor's Choice,
  Apple Design Award. Apple shows real ones itself. Fortelling and ElevenReader
  both do this; leave it out.
- **No other platforms' or marketplaces' logos or references.** A row of
  Instagram/Netflix/Spotify icons is out, and so is naming a marketplace in a
  caption. Their content inside your real UI is a judgement call; keep it small.
- **No claims that can't be verified:** "2.7x faster", "-78% doomscrolling",
  "Backed by research" need a source you could show App Review. No source, no claim.
- **No prices, discounts, URLs or copyright symbols** in the copy.
- **4+ age rating** for every asset, whatever the app's rating.

## Review before rendering the final set

- [ ] Frame 1 alone says what the user gets.
- [ ] Each frame has one message; the caption is five words or fewer where possible.
- [ ] `--sheet` second row: the frames still read without words.
- [ ] Every badge and quote has a `source` a reviewer could check.
- [ ] Nothing from "Do not copy these" above.
- [ ] Copy reads like a user talking, and passes the `unslop` skill.
