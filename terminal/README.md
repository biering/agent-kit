# terminal

The terminal setup every machine shares (the MacBook, Lucy, Levi): Ghostty,
herdr and the theme switch, installed from here so they stay the same.

| Path | What it is |
|---|---|
| `install.sh [--new-cwd <folder>]` | Copies everything below into place and applies the current theme. A Mac mini passes its repo, where new panes start |
| `ghostty/config.ghostty`, `ghostty/themes/` | Ghostty: padding, transparent title bar, Cmd+K for herdr-bar, the `maelstrom-hazard` and `maelstrom-mono` themes |
| `herdr/config.toml` | herdr: sidebar rows and widths, in-app toasts (cockpit sends the system ones), the plugin keys (prefix+f bar, d DAG, a board, m plugins, i Maelstrom panel, shift+a board on the right, shift+z session graph, y design review; annotate: t, u, shift+m/c/o, ctrl+a/v/s/o; cockpit: space palette, shift+q queue, shift+s start work, shift+u resume) |
| `cockpit/config.json` | cockpit's config (PRs and CI from GitHub, routines and review spaces, Chromium side browser, Claude Code as default agent). `install.sh --new-cwd` writes it to `~/.config/cockpit/` on a machine with cockpit, adding the repos folder and the pinned spaces (the repo and its `<repo>-ceo` checkout); values already in that file win |
| `themes/switch hazard\|mono` | Switches Ghostty, herdr's theme block and the Claude mods together; installed to `~/.config/maelstrom-themes/` |
| `bin/attach-mini <host> [user]` | Jumps to a mini's herdr session in Ghostty, or opens `herdr --remote` in a new window |
| `raycast/` | Raycast commands **Lucy** and **Levi** that call `attach-mini` |

Change a setting here, not in `~/.config`: an install replaces those files
(keeping the old one as `<file>.bak-<date>`). The plugins themselves are
installed by each repo's machine setup (Maelstrom: `ops/mac-mini/setup.sh`), except the
machine-wide Design review plugin (`../herdr-review`), which `install.sh` links once when herdr runs.

**Raycast, once per Mac:** Settings → Extensions → Script Commands → Add
Directories → `<repo>/vendor/agent-kit/terminal/raycast`.
