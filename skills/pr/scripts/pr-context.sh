#!/usr/bin/env bash
# One call instead of five. Prints what a PR title and body need:
# branch, base, ticket id, existing PR, commit subjects, diff stat and the areas that changed.
#
# Usage:  pr-context.sh [base]     (base defaults to the repo's default branch)
set -euo pipefail
export GH_PAGER=cat

BRANCH=$(git branch --show-current)
BASE=${1:-$(gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || echo main)}

echo "branch: $BRANCH"
echo "base:   $BASE"
if [ "$BRANCH" = "$BASE" ]; then
  echo "        on the default branch: create a work branch before committing"
fi
case "$BRANCH" in
  *-) echo "        branch ends in '-': rename it (git branch -m) before pushing" ;;
esac

# Ticket id: branch name first, then commit subjects. Empty means no ticket: omit the scope.
TICKET=$(printf '%s\n%s\n' "$BRANCH" "$(git log "$BASE..HEAD" --pretty=%s 2>/dev/null || true)" \
  | grep -oE '\b[A-Z]{2,}-[0-9]+\b' | head -1 || true)
echo "ticket: ${TICKET:-<none>}"

# An existing PR means edit, not create.
PR=$(gh pr list --head "$BRANCH" --json number,title,url,isDraft --limit 1 2>/dev/null || echo '[]')
if [ "$PR" = "[]" ] || [ -z "$PR" ]; then
  echo "pr:     <none: create one>"
else
  echo "pr:     $(echo "$PR" | jq -r '.[0] | "#\(.number) \(if .isDraft then "(draft)" else "(ready)" end) \(.title)\n        \(.url)"')"
fi

echo
echo "--- uncommitted ---"
git status --short | head -30 || true

echo
echo "--- commits ($BASE..HEAD) ---"
git log "$BASE..HEAD" --pretty='%s' || true

echo
echo "--- diff stat ---"
git --no-pager diff "$BASE...HEAD" --stat | tail -40

echo
echo "--- areas touched ---"
# Top-level area per changed file, so the body can be grouped without reading the whole diff.
git --no-pager diff "$BASE...HEAD" --name-only \
  | awk -F/ '{ if ($1=="apps"||$1=="packages"||$1=="services"||$1=="libs") print $1"/"$2; else print $1 }' \
  | sort | uniq -c | sort -rn

echo
echo "--- reminders ---"
echo "  rules  : AGENTS.md and docs/agent-kit/pr.md win over the skill."
echo "  title  : Conventional Commits; the ticket is the scope when there is one."
