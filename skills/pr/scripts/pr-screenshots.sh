#!/usr/bin/env bash
# Store PR screenshots in the repo, out of every branch, and print the markdown to paste.
#
# The images go into a commit on `refs/pr-assets/<branch, / as ->`. A normal clone fetches only
# branches and tags, so nobody downloads them, and the repo's access rules cover them: on github.com a
# signed-in member sees the image, anyone else sees nothing. The URLs name the commit, so they
# never change. Calling again adds to the same ref.
#
# Usage:  scripts/pr-screenshots.sh <image.png> [more images...]
set -euo pipefail
export GH_PAGER=cat

[ $# -gt 0 ] || { echo "usage: $0 <image.png> [more images...]" >&2; exit 2; }
# Only plain PNG names: anything else breaks the tree parsing or the markdown link, and a wrong
# path (`.env`) would be pushed to a ref whose URLs keep serving it.
for FILE in "$@"; do
  [[ $(basename -- "$FILE") =~ ^[A-Za-z0-9._-]+\.png$ ]] ||
    { echo "not a plain *.png name (letters, digits, . _ -): $FILE" >&2; exit 2; }
  [ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 2; }
done

BRANCH=$(git branch --show-current)
[ -n "$BRANCH" ] || { echo "not on a branch" >&2; exit 2; }
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
DIR=${BRANCH//\//-}
REF="refs/pr-assets/$DIR"

# Build the tree for this branch's folder: what an earlier call stored, plus the new files.
PARENT=$(git ls-remote origin "$REF" | cut -f1)
ENTRIES=""
if [ -n "$PARENT" ]; then
  git fetch -q origin "$REF"
  ENTRIES=$(git ls-tree --full-tree "$PARENT:$DIR")
fi
for FILE in "$@"; do
  NAME=$(basename -- "$FILE")
  BLOB=$(git hash-object -w "$FILE")
  ENTRIES=$(printf '%s\n' "$ENTRIES" | awk -F'\t' -v name="$NAME" '$2 != name')
  ENTRIES=$(printf '%s\n100644 blob %s\t%s' "$ENTRIES" "$BLOB" "$NAME")
done
INNER=$(printf '%s\n' "$ENTRIES" | sed '/^$/d' | git mktree)
TREE=$(printf '040000 tree %s\t%s\n' "$INNER" "$DIR" | git mktree)
COMMIT=$(git commit-tree "$TREE" ${PARENT:+-p "$PARENT"} -m "pr-assets: $BRANCH")
git push -q origin "${COMMIT}:${REF}"

for FILE in "$@"; do
  NAME=$(basename -- "$FILE")
  echo "![${NAME%.*}](https://github.com/${REPO}/blob/${COMMIT}/${DIR}/${NAME}?raw=true)"
done
