#!/usr/bin/env node
/**
 * AgentMail, the agents' mailbox, from the command line.
 *
 * Outreach (press, influencers, backlinks), directory sign-ups and their
 * verification mails all go through one AgentMail organisation, keyed by
 * AGENTMAIL_API_KEY in the repo-root .env. Skills used to "discover the
 * connected mail tool" at run time; this is that tool, so every run finds the
 * same one.
 *
 *   pnpm mail                                      # inboxes
 *   pnpm mail list [--inbox <addr>] [--limit 20]   # newest messages
 *   pnpm mail read <message_id> [--inbox <addr>]
 *   pnpm mail send --to a@b.c --subject "…" --body-file draft.md [--inbox <addr>]
 *   pnpm mail reply <message_id> --body-file reply.md [--inbox <addr>]
 *
 * The default inbox is `mail.inbox` in agent-kit.config.json. What may be sent
 * without asking is the CEO manual's business, not this script's: it sends what
 * it is given.
 */
import { readFileSync } from 'node:fs'
import { config, main } from './config.mjs'
import { envReader } from './lib/repo-env.mjs'

const env = envReader(main)
const key = env('AGENTMAIL_API_KEY')
const DEFAULT_INBOX = config.mail.inbox

const die = (msg) => {
  console.error(msg)
  process.exit(1)
}

if (!key) die('AGENTMAIL_API_KEY is empty. Put it in the repo-root .env (see .env.example).')

async function api(path, init = {}) {
  const res = await fetch(`https://api.agentmail.to/v0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const text = await res.text()
  if (!res.ok) die(`AgentMail ${res.status} on ${path}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}

const inboxPath = (args) => `/inboxes/${encodeURIComponent(flag(args, 'inbox') ?? DEFAULT_INBOX)}`
const bodyOf = (args) => {
  const file = flag(args, 'body-file')
  return file ? readFileSync(file === '-' ? 0 : file, 'utf8') : flag(args, 'body')
}

const commands = {
  async inboxes() {
    const d = await api('/inboxes')
    for (const i of d.inboxes) console.log(`${i.inbox_id}  ${i.display_name ?? ''}`)
  },
  async list(args) {
    const base = inboxPath(args)
    const d = await api(`${base}/messages?limit=${Number(flag(args, 'limit') ?? 20)}`)
    if (!d.messages.length) return console.log('No messages.')
    for (const m of d.messages)
      console.log(`${m.timestamp}  ${m.message_id}\n  ${m.from}: ${m.subject ?? ''}`)
  },
  async read(args) {
    const base = inboxPath(args)
    const id = args.shift() ?? die('Which message_id?')
    const m = await api(`${base}/messages/${encodeURIComponent(id)}`)
    console.log(
      `From: ${m.from}\nTo: ${[].concat(m.to ?? []).join(', ')}\nDate: ${m.timestamp}\nSubject: ${m.subject ?? ''}\n`,
    )
    console.log(m.text ?? m.extracted_text ?? m.html ?? '')
  },
  async send(args) {
    const base = inboxPath(args)
    const to = flag(args, 'to') ?? die('--to is required.')
    const subject = flag(args, 'subject') ?? die('--subject is required.')
    const text = bodyOf(args) ?? die('--body or --body-file is required.')
    const m = await api(`${base}/messages/send`, {
      method: 'POST',
      body: JSON.stringify({ to: to.split(',').map((s) => s.trim()), subject, text }),
    })
    console.log(`sent ${m.message_id ?? ''} thread ${m.thread_id ?? ''}`)
  },
  async reply(args) {
    const base = inboxPath(args)
    const id = args.shift() ?? die('Which message_id?')
    const text = bodyOf(args) ?? die('--body or --body-file is required.')
    const m = await api(`${base}/messages/${encodeURIComponent(id)}/reply`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    })
    console.log(`replied ${m.message_id ?? ''}`)
  },
}

const [cmd, ...rest] = process.argv.slice(2)
const run =
  commands[cmd ?? 'inboxes'] ??
  die(`Unknown command "${cmd}". One of: ${Object.keys(commands).join(', ')}`)
await run(rest)
