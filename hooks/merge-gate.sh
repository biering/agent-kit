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
# It fails closed where a merge could hide: a real `gh pr merge` is checked, also
# behind env, sudo, xargs, pnpm exec, npx, ssh, bash -c, eval, $(), a pipe or here-string
# into a shell (quoted or not); text handed to node -e / python -c that names a merge is
# refused; code built at run time (eval "$x", bash -c "$(…)", source <(…), gh $args) is
# refused when the command says "merge"; and
# a merge it cannot attribute to one literal PR is refused. Only text that nothing
# runs (an echo, a commit message, a quoted argument of another command) is let through.
# Not followed: a script file (bash x.sh), and a repo set earlier in the command
# (export GH_REPO=…; cd other-repo &&): the PR is looked up in the hook's directory.
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

# Which merges does the command really run? hooks/merge-gate-parse.mjs reads it
# like the shell does (`gh pr merge`, as /opt/homebrew/bin/gh, `gh -R o/r pr merge`,
# behind env assignments, `bash -c`, `$(…)`, in a loop) and skips text that only
# mentions one: an echo, a commit message, a quoted argument of another command.
printf '%s\n' "$CMD" | grep -q 'merge' || exit 0
if ! command -v node >/dev/null 2>&1; then
  echo "BLOCKED: node is needed to read this command for the merge gate." >&2
  exit 2
fi
MERGES="$(printf '%s' "$CMD" | node "$(dirname "$0")/merge-gate-parse.mjs" 2>/dev/null)" || {
  echo "BLOCKED: could not read this command for the merge gate. Merge one PR per command: gh pr merge <number or URL> --squash --delete-branch." >&2
  exit 2
}
[ -n "$MERGES" ] || exit 0

cd "$(hook_cwd)" 2>/dev/null || exit 0

# check_merge <repo from -R/--repo or GH_REPO, or empty> <PR number, URL, branch, or empty>
# The PR is looked up in its own repository: the one in a full PR URL, else -R/--repo,
# else the one the current directory's git remote points at. A PR number alone
# means nothing in another repository.
check_merge() {
  local repo="$1" target="$2" PR="" SLUG="" url="" LIST PATCHES FILES changed host=""
  local url_re='^https?://([^/]+)/([^/]+)/([^/]+)/pull/([0-9]+)([/?#].*)?$'

  if [[ "$target" =~ $url_re ]]; then
    SLUG="${BASH_REMATCH[2]}/${BASH_REMATCH[3]}"
    [ "${BASH_REMATCH[1]}" = "github.com" ] || SLUG="${BASH_REMATCH[1]}/$SLUG"
    PR="${BASH_REMATCH[4]}"
  else
    SLUG="$repo"
    case "$target" in
      '' | *[!0-9]*)
        # the current branch, or a branch name: ask gh which PR that is, in that repo
        url="$( ( [ -n "$SLUG" ] && export GH_REPO="$SLUG"; gh pr view ${target:+"$target"} --json number,url -q '[.number,.url] | @tsv' 2>/dev/null ) )"
        # Nothing resolvable means gh itself has nothing to merge: a mention in a
        # commit message, or a branch without a PR.
        [ -n "$url" ] || return 0
        PR="${url%%$'\t'*}"
        url="${url#*$'\t'}"
        if [[ "$url" =~ $url_re ]]; then
          SLUG="${BASH_REMATCH[2]}/${BASH_REMATCH[3]}"
          [ "${BASH_REMATCH[1]}" = "github.com" ] || SLUG="${BASH_REMATCH[1]}/$SLUG"
        fi
        ;;
      *) PR="$target" ;;
    esac
    # A bare number: the repository of the current directory.
    [ -n "$SLUG" ] || SLUG="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)"
  fi
  if [ -z "$SLUG" ] || [ -z "$PR" ]; then
    echo "BLOCKED: could not tell which repository PR ${PR:-$target} belongs to (gh offline, not authenticated, or no GitHub remote here). Merge by full URL: gh pr merge https://github.com/<owner>/<repo>/pull/<number> --squash --delete-branch." >&2
    exit 2
  fi

  # [HOST/]OWNER/REPO: a GitHub Enterprise host needs --hostname on gh api.
  local api=(gh api) path="$SLUG"
  if [ "$(printf '%s' "$SLUG" | tr -cd '/' | wc -c | tr -d ' ')" -ge 2 ]; then
    host="${SLUG%%/*}"
    path="${SLUG#*/}"
    api=(gh api --hostname "$host")
  fi

  # Every file, paginated (gh pr view stops at 100, gh pr diff fails past 300).
  LIST="$("${api[@]}" --paginate "repos/$path/pulls/$PR/files?per_page=100" --jq '.[] | [.status, .filename, (if .patch then "y" else "n" end)] | @tsv' 2>/dev/null)"
  # Content checks read config only (wrangler, JSON, TOML, env), not code or docs
  # that merely mention the words.
  PATCHES="$("${api[@]}" --paginate "repos/$path/pulls/$PR/files?per_page=100" --jq '.[] | select(.filename | test("(\\.jsonc?|\\.toml|\\.env[^/]*)$")) | .patch // ""' 2>/dev/null)"
  if [ -z "$LIST" ]; then
    echo "BLOCKED: could not read the files of PR $SLUG#$PR (gh offline or not authenticated)." >&2
    exit 2
  fi
  FILES="$(printf '%s\n' "$LIST" | cut -f2)"
  changed="$(printf '%s\n' "$PATCHES" | grep -E '^[+-]')"

  # Config can rewire data or money without touching a gated path: a wrangler
  # var that points at another database, or swaps a price id.
  local data money launch
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
  add 'production data structure' "$data"
  add 'prices and payments' "$money"
  add 'first public launch' "$launch"

  if [ -n "$reasons" ]; then
    echo "BLOCKED: PR $SLUG#$PR is one the owner merges (ops/CEO.md):${reasons}" >&2
    echo "File it: pnpm linear ask approval \"Merge $SLUG#$PR: <what it changes>\" --body \"<PR link, what changes, risk, how verified>\"" >&2
    exit 2
  fi

  local checks status
  checks="$(gh pr checks "$PR" -R "$SLUG" 2>&1)"
  status=$?
  if [ "$status" -ne 0 ] && ! printf '%s' "$checks" | grep -q 'no checks reported'; then
    echo "BLOCKED: PR $SLUG#$PR has checks that are not green yet. Watch with \`gh pr checks $PR -R $SLUG --watch\` and fix red ones (.agents/skills/ci/SKILL.md)." >&2
    printf '%s\n' "$checks" | grep -vE '\bpass\b' | head -20 >&2
    exit 2
  fi
}

nonblank() { grep -v '^[[:space:]]*$'; }
reasons=""
add() { [ -n "$2" ] && reasons="${reasons}
  $1:
$(printf '%s\n' "$2" | sed 's/^/    /')"; }

while IFS=$'\x1f' read -r kind repo target; do
  case "$kind" in
    UNSAFE)
      echo "BLOCKED: merge one PR per command, with a literal number or URL (gh pr merge 231 --squash --delete-branch), so the gate can check it. Not a loop, a variable or xargs ($repo)." >&2
      exit 2
      ;;
    MERGE) check_merge "$repo" "$target" ;;
  esac
done <<EOF2
$MERGES
EOF2

exit 0
