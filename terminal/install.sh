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

# Inside a Herdr app terminal HERDR_SOCKET_PATH names the app's socket, which the
# herdr CLI cannot speak ("untagged enum WireResponse"): every herdr call here
# goes to the herdr server instead.
hr() { env -u HERDR_SOCKET_PATH herdr "$@"; }

# cockpit's config (quaresc/cockpit), on a machine that has cockpit: the kit's
# template with this machine's repos folder and its pinned spaces (the repo and
# its CEO checkout <repo>-ceo). Values already in the file win, so a token or a
# choice made in cockpit's settings survives an install. Needs --new-cwd.
cockpit_dir="$HOME/.config/cockpit"
has_cockpit=0
[ -d "$cockpit_dir/herdr" ] && has_cockpit=1
if [ "$has_cockpit" = 0 ] && command -v herdr >/dev/null 2>&1 &&
  hr plugin list 2>/dev/null | grep -q '^- cockpit '; then
  has_cockpit=1
fi
if [ "$has_cockpit" = 1 ] && [ -n "$new_cwd" ] && command -v jq >/dev/null 2>&1; then
  repo_dir="${new_cwd%/}"
  repo_name="$(basename "$repo_dir")"
  ceo_dir="$repo_dir-ceo"
  current="$cockpit_dir/config.json"
  tmp=$(mktemp)
  jq --arg repos "$(dirname "$repo_dir")" --arg name "$repo_name" --arg cwd "$repo_dir" \
    --arg ceo "$ceo_dir" --argjson has_ceo "$([ -d "$ceo_dir" ] && echo true || echo false)" \
    '.reposDir = $repos
     | .spaces += [{ name: $name, cwd: $cwd, key: "" }]
     | if $has_ceo then .spaces += [{ name: "ceo", cwd: $ceo, key: "" }] else . end' \
    "$here/cockpit/config.json" >"$tmp"
  if [ -f "$current" ]; then
    jq -s '.[0] * .[1]' "$tmp" "$current" >"$tmp.merged" && mv "$tmp.merged" "$tmp"
  fi
  put "$tmp" "$current"
  rm -f "$tmp"
elif [ "$has_cockpit" = 1 ]; then
  echo "skip cockpit config (needs --new-cwd and jq)"
fi

theme=$(cat "$themes/current" 2>/dev/null || echo hazard)
"$themes/switch" "$theme"

# The Waiting for you pane (designs and PRs; agent-kit README, "Design review"): one plugin per machine, from this copy of
# the kit. Linked only when herdr runs and does not know it yet, so a second install changes nothing.
review="$(cd "$here/.." && pwd)/herdr-review"
if [ -f "$review/herdr-plugin.toml" ] && command -v herdr >/dev/null 2>&1 && hr status server 2>/dev/null | grep -q 'running'; then
  if hr plugin list --plugin agent-kit.review --json 2>/dev/null | grep -q '"plugin_id"'; then
    echo "ok herdr plugin agent-kit.review (already linked)"
  else
    hr plugin link "$review" >/dev/null && echo "ok herdr plugin agent-kit.review linked from $review"
  fi
fi
