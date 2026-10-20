#!/usr/bin/env bash
# Shared helpers for the PreToolUse Bash hooks. Source it after reading stdin
# into INPUT:  INPUT="$(cat)"; . "$(dirname "$0")/lib.sh"

# hook_field <jq path> — read a field from the hook's JSON input.
# jq, then node, then a crude sed so the hooks still work on a bare machine.
hook_field() {
  local jq_path="$1" node_path="$2" sed_key="$3"
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r "$jq_path // \"\"" 2>/dev/null && return
  fi
  if command -v node >/dev/null 2>&1; then
    printf '%s' "$INPUT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(String(${node_path}??''))}catch(e){}})" 2>/dev/null && return
  fi
  printf '%s' "$INPUT" | sed -n "s/.*\"${sed_key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -1
}

hook_command() { hook_field '.tool_input.command' 'j.tool_input?.command' 'command'; }

# The directory the command actually runs in. Not CLAUDE_PROJECT_DIR: in a
# worktree session that is a different checkout on a different branch, which
# both blocks legitimate commits and waves through ones made on main.
hook_cwd() {
  local cwd
  cwd="$(hook_field '.cwd' 'j.cwd' 'cwd')"
  [ -n "$cwd" ] || cwd="${CLAUDE_PROJECT_DIR:-$(pwd)}"
  printf '%s' "$cwd"
}
