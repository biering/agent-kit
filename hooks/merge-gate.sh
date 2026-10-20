#!/usr/bin/env bash
# PreToolUse / Bash gate for the agents' merge right (ops/CEO.md).
#
# Agents may squash-merge their own PRs, except the three kinds the owner keeps:
#   1. production data structure: migrations, SQL, Supabase, Convex schema,
#      directory-core, a var that points at another database
#   2. prices and payments: entitlement, Stripe, Polar, RevenueCat, StoreKit,
#      checkout, billing, paywalls, plan and tier tables, price-id vars
#   3. a first public launch: a new wrangler.jsonc, or a new custom_domain
# Those are blocked outright: file `pnpm linear ask approval …` and the owner
# merges them. Everything else merges only with every check green.
#
# Also blocks the commands that change live prices: `pnpm iap … --apply` and
# `pnpm release … --price … --apply`.
#
# It fails closed: anything that looks like a merge is checked, and a merge it
# cannot attribute to one literal PR is refused.
#
# Exit 0 = allow. Exit 2 = block (stderr is shown to Claude).
set -u

INPUT="$(cat)"
. "$(dirname "$0")/lib.sh"

CMD="$(hook_command)"
has() { printf '%s\n' "$CMD" | grep -qE "$1"; }

PNPM='pnpm([[:space:]]+run)?[[:space:]]+'
if has "(app-store-iap\.mjs|${PNPM}iap)[^;|&]*--apply" \
  || has "(app-store-release\.mjs|${PNPM}release)[^;|&]*--price[^;|&]*--apply" \
  || has "(app-store-release\.mjs|${PNPM}release)[^;|&]*--apply[^;|&]*--price"; then
  echo "BLOCKED: this changes a live App Store price, which the owner approves (ops/CEO.md). Run it without --apply, then file \`pnpm linear ask approval\` with the report." >&2
  exit 2
fi

# `gh pr merge`, also as /opt/homebrew/bin/gh, `gh -R o/r pr merge`, in a loop,
# behind env assignments or inside `bash -c` / `$(…)`.
MERGE_RE='(^|[^[:alnum:]_-])gh([[:space:]]+(-R|--repo)([[:space:]]+|=)[^[:space:]]+)?[[:space:]]+pr[[:space:]]+merge'
has "$MERGE_RE" || exit 0

cd "$(hook_cwd)" 2>/dev/null || exit 0

# The arguments of the first merge: up to the next ; | & ) quote or backtick.
ARGS="$(printf '%s\n' "$CMD" | grep -oE "${MERGE_RE}[^;|&)\"'\`]*" | head -1 | sed -E 's/.*pr[[:space:]]+merge//')"
TARGET=""
skip=""
for tok in $ARGS; do
  if [ -n "$skip" ]; then skip=""; continue; fi
  case "$tok" in
    -R | --repo | -t | --subject | -b | --body | -F | --body-file | --match-head-commit | -A | --author-email) skip=1 ;;
    -*) ;;
    *) TARGET="$tok"; break ;;
  esac
done

case "$TARGET" in
  *'$'* | *'`'*)
    echo "BLOCKED: merge one PR per command, with a literal number (gh pr merge 231 --squash --delete-branch), so the gate can check it. Not a loop or a variable." >&2
    exit 2
    ;;
esac
if [ -z "$TARGET" ] && has '(^|[^[:alnum:]_-])xargs[[:space:]]'; then
  echo "BLOCKED: merge one PR per command, with a literal number, not through xargs." >&2
  exit 2
fi

case "$TARGET" in
  '') PR="$(gh pr view --json number -q .number 2>/dev/null)" ;;
  *[!0-9]*) PR="$(gh pr view "$TARGET" --json number -q .number 2>/dev/null)" ;;
  *) PR="$TARGET" ;;
esac
# Nothing resolvable means gh itself has nothing to merge: a mention in a
# commit message, or a branch without a PR.
[ -n "$PR" ] || exit 0

# Every file, paginated (gh pr view stops at 100, gh pr diff fails past 300).
LIST="$(gh api --paginate "repos/{owner}/{repo}/pulls/$PR/files?per_page=100" --jq '.[] | [.status, .filename, (if .patch then "y" else "n" end)] | @tsv' 2>/dev/null)"
# Content checks read config only (wrangler, JSON, TOML, env), not code or docs
# that merely mention the words.
PATCHES="$(gh api --paginate "repos/{owner}/{repo}/pulls/$PR/files?per_page=100" --jq '.[] | select(.filename | test("(\\.jsonc?|\\.toml|\\.env[^/]*)$")) | .patch // ""' 2>/dev/null)"
if [ -z "$LIST" ]; then
  echo "BLOCKED: could not read the files of PR $PR (gh offline or not authenticated)." >&2
  exit 2
fi
FILES="$(printf '%s\n' "$LIST" | cut -f2)"
changed="$(printf '%s\n' "$PATCHES" | grep -E '^[+-]')"
nonblank() { grep -v '^[[:space:]]*$'; }

# Config can rewire data or money without touching a gated path: a wrangler
# var that points at another database, or swaps a price id.
data="$( {
  printf '%s\n' "$FILES" | grep -E '(^|/)migrations/|\.sql$|(^|/)supabase/|(^|/)convex/schema|^packages/directory-core/'
  printf '%s\n' "$changed" | grep -oE '"(PUBLIC_)?(SUPABASE_URL|DATABASE_URL|CONVEX_URL|INSFORGE_[A-Z_]*URL)"' | sort -u | sed 's/^/var /'
} | nonblank)"
money="$( {
  printf '%s\n' "$FILES" | grep -v '\.md$' | grep -iE 'entitlement|purchases?\.tsx?$|stripe|polar|revenuecat|storekit|checkout|billing|pricing|prices?[^/]*$|paywall|(^|/)(tiers?|plans?)\.ts$'
  printf '%s\n' "$changed" | grep -oE '"[A-Z_]*(STRIPE|POLAR|PRICE)[A-Z_]*"' | sort -u | sed 's/^/var /'
} | nonblank)"
launch="$( {
  printf '%s\n' "$LIST" | awk -F'\t' '$1 == "added" && $2 ~ /wrangler\.jsonc$/ { print $2 }'
  printf '%s\n' "$LIST" | awk -F'\t' '$3 == "n" && $2 ~ /wrangler\.jsonc$/ { print $2 " (diff too large to read)" }'
  printf '%s\n' "$changed" | grep -q '^+.*"custom_domain"' && echo 'new custom_domain route'
} | nonblank)"

reasons=""
add() { [ -n "$2" ] && reasons="${reasons}
  $1:
$(printf '%s\n' "$2" | sed 's/^/    /')"; }
add 'production data structure' "$data"
add 'prices and payments' "$money"
add 'first public launch' "$launch"

if [ -n "$reasons" ]; then
  echo "BLOCKED: PR $PR is one the owner merges (ops/CEO.md):${reasons}" >&2
  echo "File it: pnpm linear ask approval \"Merge #$PR: <what it changes>\" --body \"<PR link, what changes, risk, how verified>\"" >&2
  exit 2
fi

checks="$(gh pr checks "$PR" 2>&1)"
status=$?
if [ "$status" -ne 0 ] && ! printf '%s' "$checks" | grep -q 'no checks reported'; then
  echo "BLOCKED: PR $PR has checks that are not green yet. Watch with \`gh pr checks $PR --watch\` and fix red ones (.agents/skills/ci/SKILL.md)." >&2
  printf '%s\n' "$checks" | grep -vE '\bpass\b' | head -20 >&2
  exit 2
fi

exit 0
