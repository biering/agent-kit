#!/usr/bin/env bash
# The review list for the Herdr desktop app (agent-kit README, "Herdr desktop app"): copies the mod into
# the app's mods folder and writes kit.json, the node and the agent-kit it runs. A second run updates it
# in place, and the app reloads it. No app folder: nothing to do.
#
#   herdr-app/install.sh          (terminal/install.sh runs it)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
app="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
if [ ! -d "$app" ]; then
  echo "skip Herdr app mod review-list: no app folder at $app"
  exit 0
fi
node_bin="$(command -v node || true)"
if [ -z "$node_bin" ]; then
  echo "skip Herdr app mod review-list: node is not on PATH" >&2
  exit 0
fi
dest="$app/mods/review-list"
mkdir -p "$dest"
cp "$here/review-list/main.js" "$here/review-list/rows.js" "$here/review-list/mod.json" "$here/review-list/"*.svg "$dest/"
"$node_bin" -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ node: process.argv[2], kit: process.argv[3] }, null, 2) + "\n")' \
  "$dest/kit.json" "$node_bin" "$(cd "$here/.." && pwd)/bin/agent-kit.mjs"
if command -v herdr-app >/dev/null 2>&1 && ! herdr-app check "$dest" >/dev/null; then
  echo "Herdr app mod review-list does not load: herdr-app check $dest" >&2
  exit 1
fi
echo "ok Herdr app mod review-list in $dest (palette: Review list)"
