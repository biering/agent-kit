#!/usr/bin/env bash
# earshot (github.com/Leonxlnx/earshot, MIT): measured listening for launch
# films. Optional: the skill works without it, the listening gate needs it.
#
# Installs on first run into ~/.cache/agent-kit/earshot, outside every repo:
# a pinned checkout, a venv, and the two models (~1.1 GB) in EARSHOT_HOME
# there. Nothing it writes may ever be committed. Then runs the CLI:
#
#   scripts/earshot.sh critique film.mp4 --video film.mp4
#   scripts/earshot.sh timeline film.mp4 --cues cues.json
#   scripts/earshot.sh sheet film.mp4 -o sheet.png
set -euo pipefail

EARSHOT_COMMIT=925ebe56a1b755e5d354ab642bb8f344440cfa9c
ROOT="${EARSHOT_DIR:-$HOME/.cache/agent-kit/earshot}"
SRC="$ROOT/src"
VENV="$ROOT/venv"
export EARSHOT_HOME="$ROOT/home"

command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || {
  echo "earshot.sh: ffmpeg and ffprobe must be on PATH (brew install ffmpeg)" >&2
  exit 1
}

if [ ! -x "$VENV/bin/earshot" ] || [ "$(cat "$ROOT/.installed" 2>/dev/null)" != "$EARSHOT_COMMIT" ]; then
  PY="${EARSHOT_PYTHON:-}"
  if [ -z "$PY" ]; then
    for c in python3.12 python3.11 python3.10 python3.13 python3; do
      if command -v "$c" >/dev/null 2>&1 &&
         "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
        PY=$c
        break
      fi
    done
  fi
  [ -n "$PY" ] || { echo "earshot.sh: needs Python 3.10+ (or set EARSHOT_PYTHON)" >&2; exit 1; }

  echo "earshot.sh: installing earshot @ ${EARSHOT_COMMIT:0:8} into $ROOT (one-time, ~1.1 GB of models on first listen)" >&2
  mkdir -p "$ROOT"
  if [ ! -d "$SRC/.git" ]; then
    git clone --quiet https://github.com/Leonxlnx/earshot "$SRC"
  fi
  git -C "$SRC" rev-parse --quiet --verify "$EARSHOT_COMMIT^{commit}" >/dev/null ||
    git -C "$SRC" fetch --quiet origin
  git -C "$SRC" checkout --quiet "$EARSHOT_COMMIT"
  "$PY" -m venv "$VENV"
  "$VENV/bin/python" -m pip install --quiet --upgrade pip
  "$VENV/bin/python" -m pip install --quiet torch --index-url https://download.pytorch.org/whl/cpu
  "$VENV/bin/python" -m pip install --quiet -e "$SRC"
  printf '%s\n' "$EARSHOT_COMMIT" > "$ROOT/.installed"
fi

exec "$VENV/bin/earshot" "$@"
