---
date: 2026-11-09
repo: agent-kit
entries: 4
---

## Stats

Facts for the outside writer, not post text. UTC day 2026-11-09. Every number names its source and as-of time; "not measured" means it could not be read, and is never an estimate.

### Example App
| Metric | Day | Change vs day before | Running total | Source |
|---|---|---|---|---|
| Visitors | 120 | +20 (+20.0%) | 1020 since 2026-11-05 | analytics · as of 2026-11-10T00:01Z |
| Sign-ups | 7 | +2 (+40.0%) | 31 since 2026-11-05 | analytics · as of 2026-11-10T00:01Z |
| Revenue | 50.00 USD | +10.00 USD (+25.0%) | 190.00 USD since 2026-11-05 | stripe · as of 2026-11-10T00:05Z |
| Refunds | 5.00 USD | no comparison: not measured the day before | 5.00 USD since 2026-11-09 | stripe · as of 2026-11-10T00:05Z |
| Fees | 2.05 USD | +0.40 USD (+24.2%) | 8.10 USD since 2026-11-05 | stripe · as of 2026-11-10T00:05Z |
| Profit | 42.95 USD | +9.60 USD (+28.8%) | 176.55 USD since 2026-11-05 | stripe · as of 2026-11-10T00:05Z |
| Apps shipped | not measured: HTTP 503 | | | counter |

### Challenge: Ten days of shipping
Day 5 of 10 (2026-11-05 to 2026-11-14), product Example App.
Points = visitors / 10 + signups * 5 + profit, on the running totals below.
Points: 433.55 (+89.95 vs day before)

<!-- stats-data: {"v":1,"products":{"Example App":{"visitors":{"day":120,"total":1020,"since":"2026-11-05"}}},"challenge":{"score":433.55,"day":5}} -->

## learning: One cheap question before building saves the expensive ones
A skill now asks "does this move customers or revenue, and what does it cost?" before any plan exists. Without it, every customer wish and good idea tended to get built, and the review agents only judged work that was already done. The owner also needed a verdict they could read in a minute.
Source: PR #13

## agent tip: Give the agent a layout script, not a checklist
The CEO agent used to open as a bare pane, and the board beside it and the session graph in its own tab were rebuilt by hand each time. Each repo now owns one script that arranges the screen, and the kit just runs it when the pane opens. Repos without the setting behave as before.
Source: PR #17

## best practice: Keep a key binding where the installer cannot wipe it
A session-graph viewer shows what an agent and its subagents are doing without reading the transcript. The binding lives in the kit because the install script replaces the user's config, so a key set by hand would vanish on the next install.
Source: PR #16

## journey: Owner wants the same screen every time the CEO opens
The owner asked for one fixed layout: the CEO chat with the work board beside it, and the session graph in its own tab. Until now the pane opened bare and the rest was rebuilt by hand.
Source: PR #17 (the owner's request in its Why)
