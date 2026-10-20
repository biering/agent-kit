#!/usr/bin/env bash
# Install the terminal setup on this Mac: Ghostty's config and themes, herdr's
# config, and the theme switch. The same on the MacBook and every Mac mini;
# a mini adds the folder its new panes start in:
#
#   terminal/install.sh                                  # the MacBook
#   terminal/install.sh --new-cwd ~/home/dev/cbiering/maelstrom   # Lucy
#
# A file that differs from the kit's is kept once as <file>.bak-<date> before it
# is replaced. The theme in ~/.config/maelstrom-themes/current (hazard if none)
# is applied again at the end, so an install never switches the look.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
new_cwd=""
while [ $# -gt 0 ]; do
  case "$1" in
    --new-cwd) new_cwd="${2:?--new-cwd needs a folder}"; shift 2 ;;
    *) echo "usage: $0 [--new-cwd <folder>]" >&2; exit 1 ;;
  esac
done
stamp=$(date +%Y-%m-%d)

# put <source> <dest>: copy, backing up a different file first.
put() {
  mkdir -p "$(dirname "$2")"
  if [ -f "$2" ] && ! cmp -s "$1" "$2"; then
    [ -e "$2.bak-$stamp" ] || cp "$2" "$2.bak-$stamp"
  fi
  cp "$1" "$2"
  echo "ok $2"
}

ghostty="$HOME/Library/Application Support/com.mitchellh.ghostty"
for t in "$here"/ghostty/themes/*; do put "$t" "$HOME/.config/ghostty/themes/$(basename "$t")"; done
put "$here/ghostty/config.ghostty" "$ghostty/config.ghostty"

themes="$HOME/.config/maelstrom-themes"
put "$here/themes/switch" "$themes/switch" && chmod +x "$themes/switch"
for t in hazard mono; do put "$here/themes/$t/herdr.toml" "$themes/$t/herdr.toml"; done

# herdr's config, with this machine's start folder last ([terminal] after every
# other table, so no key lands in the wrong one).
tmp=$(mktemp)
cp "$here/herdr/config.toml" "$tmp"
if [ -n "$new_cwd" ]; then
  printf '\n# This machine is a Mac mini: every new pane starts in the repo.\n[terminal]\nnew_cwd = "%s"\n' "$new_cwd" >>"$tmp"
fi
put "$tmp" "$HOME/.config/herdr/config.toml"
rm -f "$tmp"

theme=$(cat "$themes/current" 2>/dev/null || echo hazard)
"$themes/switch" "$theme"
