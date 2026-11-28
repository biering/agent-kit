/**
 * OpenSpec in a repo that uses the kit (the `spec` skill, rules/spec-review.md).
 */

/**
 * The OpenSpec release a repo pins, exactly. Only a release older than two weeks: 2.2.0 was three
 * days old on 2026-11-27. Bump it on purpose, with the skill and the rule that name it.
 */
export const OPENSPEC_VERSION = '2.0.0'

/** Every OpenSpec call runs with these: no telemetry, no update check. */
export const OPENSPEC_ENV = { OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_UPDATE_CHECK: '1' }

/**
 * The tasks of a `tasks.md` that are not ticked yet (`- [ ] 1.2 …`), trimmed. `openspec archive
 * --yes` archives a change with open tasks without asking (2.0.0 and 2.2.0), so the kit asks first.
 */
export function openTasks(markdown) {
  let fence = false
  const open = []
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    else if (!fence && /^\s*[-*+]\s+\[ \]/.test(line)) open.push(line.trim())
  }
  return open
}
