---
date: 2026-11-09
repo: agent-kit
entries: 4
---

## learning: One cheap question before building saves the expensive ones
A skill now asks "does this move customers or revenue, and what does it cost?" before any plan exists. Without it, every customer wish and good idea tended to get built, and the review agents only judged work that was already done. The owner also needed a verdict they could read in a minute.
Source: PR #13

## agent tip: Give the agent a layout script, not a checklist
The CEO agent used to open as a bare pane, and the board beside it and the session graph in its own tab were rebuilt by hand each time. Each repo now owns one script that arranges the screen, and the kit just runs it when the pane opens. Repos without the setting behave as before.
Source: PR #17

## best practice: Keep a key binding where the installer cannot wipe it
A session-graph viewer shows what an agent and its subagents are doing without reading the transcript. The binding lives in the kit because the install script replaces the user's config, so a key set by hand would vanish on the next install.
Source: PR #16

## journey: Owner wants the same screen every morning
The owner asked that the CEO chat, the work board and the session graph look identical every time the CEO opens. Until then each start meant a few minutes of rebuilding the setup.
Source: PR #17 (the owner's request in its Why)
