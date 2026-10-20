#!/usr/bin/env node
/**
 * Cursor hook: one small file per Cursor conversation, so other tools can see
 * what Cursor's agents are doing (the herdr control panel, docs/herdr.md).
 * Installed into ~/.cursor by `agent-kit herdr install-cursor-hooks`; Cursor runs
 * it for every chat in every repo with the event as its argument and the
 * hook payload on stdin.
 *
 *   beforeSubmitPrompt  the chat is working; its first prompt names it
 *   stop                the turn ended: done, or errored/aborted
 *   sessionEnd          the chat is gone: its file is removed
 *
 * State: ~/.local/state/agent-kit/agents/cursor/<conversation>.json. Nothing
 * else is written, and the prompt is kept only as a 60-character title.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

const event = process.argv[2] ?? ''
const dir = join(homedir(), '.local/state/agent-kit/agents/cursor')
let payload = {}
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {}

// beforeSubmitPrompt must answer, or Cursor may hold the prompt.
const answer = event === 'beforeSubmitPrompt' ? { continue: true } : {}
const done = () => {
  process.stdout.write(JSON.stringify(answer))
  process.exit(0)
}

const id = payload.conversation_id ?? payload.conversationId ?? payload.session_id
if (!id) done()
const file = join(dir, `${String(id).replace(/[^\w-]/g, '')}.json`)

try {
  mkdirSync(dir, { recursive: true })
  if (event === 'sessionEnd') {
    rmSync(file, { force: true })
    done()
  }
  let prev = {}
  try {
    prev = JSON.parse(readFileSync(file, 'utf8'))
  } catch {}
  const root = (payload.workspace_roots ?? [])[0] ?? prev.root ?? ''
  const prompt =
    typeof payload.prompt === 'string' ? payload.prompt.replace(/\s+/g, ' ').trim() : ''
  const state =
    event === 'beforeSubmitPrompt'
      ? 'working'
      : event === 'stop'
        ? payload.status === 'error'
          ? 'blocked'
          : 'done'
        : (prev.state ?? 'idle')
  writeFileSync(
    file,
    JSON.stringify({
      id: String(id),
      title: prev.title || prompt.slice(0, 60) || 'Cursor chat',
      root,
      workspace: root ? basename(root) : '',
      model: payload.model ?? prev.model ?? '',
      state,
      updatedAt: Date.now(),
    }),
  )
} catch {}
done()
