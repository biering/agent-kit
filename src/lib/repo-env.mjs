/**
 * The repo-root `.env`, found even from a git worktree.
 *
 * `.env` is gitignored, so `git worktree add` creates a checkout without one.
 * Every ops script that reads repo-wide credentials then behaves exactly as if
 * nothing were configured — the same symptom as a missing key, a typo, or a
 * revoked token, which is a slow way to lose an afternoon.
 *
 * Rather than asking whoever made the worktree to remember a copy step, resolve
 * the main checkout through git and read its `.env` as a fallback. The main
 * checkout is the one place the file reliably exists, and `--git-common-dir`
 * points at it from inside any linked worktree.
 *
 * Precedence, highest first:
 *   1. a real environment variable  (so CI needs no file at all)
 *   2. this checkout's own .env     (so a worktree can deliberately differ)
 *   3. the main checkout's .env     (so it usually just works)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function parseEnv(file) {
  const out = new Map()
  if (!existsSync(file)) return out
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=(.*)$/)
    if (!m) continue
    out.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''))
  }
  return out
}

/**
 * The main checkout's root, or null when this is not a linked worktree (or git
 * is unavailable, which is not worth failing a credential lookup over).
 */
export function mainCheckoutRoot(cwd) {
  try {
    const commonDir = execFileSync(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    return commonDir ? dirname(commonDir) : null
  } catch {
    return null
  }
}

/**
 * Repo-wide credentials as a Map, with the worktree fallback applied.
 *
 * Merged rather than either/or: a worktree may set one key locally without
 * having to restate every other one.
 */
export function loadRepoEnv(root) {
  const merged = new Map()
  const mainRoot = mainCheckoutRoot(root)
  if (mainRoot && mainRoot !== root) {
    for (const [k, v] of parseEnv(join(mainRoot, '.env'))) merged.set(k, v)
  }
  for (const [k, v] of parseEnv(join(root, '.env'))) merged.set(k, v)
  return merged
}

/** A lookup that prefers the real environment over any file. */
export function envReader(root) {
  const fileEnv = loadRepoEnv(root)
  return (name) => process.env[name] ?? fileEnv.get(name) ?? undefined
}
