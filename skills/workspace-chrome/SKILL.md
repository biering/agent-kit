---
name: workspace-chrome
description: Paint only the VS Code / Cursor title bar and status bar from one project accent color, leaving theme and syntax alone. Use for workspace color, title-bar color, status-bar accent, Peacock-style window identity.
---

# Workspace chrome

Read the repo's `AGENTS.md` and `docs/agent-kit/workspace-chrome.md` first; they win where they
differ from this skill.

Give a folder an identity color on the **title bar** and **status bar**, so its window is
recognisable among others. The color theme, editor, sidebar, terminal, tabs and syntax colors stay
as they are.

## Steps

1. **Resolve the accent.** An explicit hex from the user first; else the accent the repo note
   names; else a brand or primary color already in the repo (CSS token, logo, README); else ask.
   Never invent a color.
2. **Run the bundled script.** It derives every shade and picks foregrounds by contrast; do not
   hand-mix hex values.

   ```bash
   python3 <workspace-chrome>/scripts/chrome.py '#RRGGBB' --write .vscode/settings.json
   ```

   Without `--write` it prints the JSON. `--keep-other-chrome` preserves existing
   `workbench.colorCustomizations` keys outside the title and status bars; use it only when those
   keys must survive. The script accepts JSONC (comments) on read and writes plain JSON, so
   comments in the settings file are lost: tell the user, or re-add them.
3. **Workspace settings only:** `.vscode/settings.json` in the repo, never the user-level
   `settings.json` that every window inherits.

## Allowed keys

The script writes exactly this set inside `workbench.colorCustomizations`:

- `titleBar.*`
- `statusBar.*` and `statusBarItem.*`
- `commandCenter.*` (it lives in the title bar)

Leave everything else alone: no `editor.tokenColorCustomizations`, no `workbench.colorTheme`
change, no editor, minimap, sidebar, activity bar, tab, panel or terminal colors.
