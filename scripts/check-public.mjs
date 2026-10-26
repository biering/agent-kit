#!/usr/bin/env node
// This repository is public. Fails when any tracked text file carries something that must stay in
// the consuming repo: a secret-shaped value, an account or project id, a private host, a real
// mailbox, or text lifted from seo-findings/.
// Usage: node scripts/check-public.mjs
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const DENY = [
  ['Stripe key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|\bpk_live_[A-Za-z0-9]{8,}/],
  ['OpenAI or Anthropic key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}/],
  ['database URL with a password', /\bpostgres(?:ql)?:\/\/[^:\s/]+:[^@\s<>${}]+@/],
  // a pasted .env line: an upper-case secret name with a real-looking value, not a placeholder
  ['secret assignment', /\b[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*['"]?(?![<${])[A-Za-z0-9_\-./+]{16,}/],
  ['phone number', /\+\d{2}[ (]?\d{2,4}[) /-]?\d{3,}[ /-]?\d{2,}/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{8,}/],
  ['GitHub token', /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Linear key', /\blin_api_[A-Za-z0-9]{10,}/],
  ['Resend key', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/],
  ['Supabase secret', /\bsb_secret_[A-Za-z0-9_-]{10,}/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['seo-findings content', /seo-findings\//],
  ['PostHog key', /\bph[cx]_[A-Za-z0-9]{20,}/],
  ['Stripe object id', /\b(?:price|prod|acct|cus|sub)_[A-Za-z0-9]{14,}/],
  ['Cloudflare account or zone id', /\b(?:account_id|zone_id|CLOUDFLARE_ACCOUNT_ID)\b["'`]?\s*[:=]\s*["'`]?[0-9a-f]{32}\b/],
  ['Supabase project host', /\b[a-z]{20}\.supabase\.co\b/],
  ['public R2 bucket', /\bpub-[0-9a-f]{32}\.r2\.dev\b/],
  ['private Railway host', /\b[a-z0-9-]+\.railway\.internal\b/],
  ['Sentry DSN', /https:\/\/[0-9a-f]{16,}@[a-z0-9.]*sentry\.io/],
  ['Slack webhook', /hooks\.slack\.com\/services\//],
  ['Google Doc or Drive link', /(?:docs|drive)\.google\.com\/[a-z]+\/(?:d\/)?[A-Za-z0-9_-]{20,}/],
  ['Apple Team ID', /\b(?:teamId|TEAM_ID|appleTeamId)\b["'`]?\s*[:=]\s*["'`]?[A-Z0-9]{10}\b/],
]

// A mailbox is fine when it is a placeholder or a reserved example domain.
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g
// A placeholder (`<inbox>@agentmail.to`, `${user}@x.y`) never matches: the local part must touch the @.
const EMAIL_OK = /@(?:example\.(?:com|org|net)|users\.noreply\.github\.com)$/

const BINARY = /\.(?:png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|zip)$/i

/** @param {string} dir */
function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile() && !BINARY.test(entry.name)) yield full
  }
}

// This file names the patterns it hunts. Upstream data vendored verbatim (its licence sits beside
// it) carries its authors' credits, so it is scanned for secrets but not for mailboxes.
const SKIP = /^scripts\/check-public\.mjs$/
const NO_EMAIL = /^skills\/design\/references\/taste\/library\//
const unix = (f) => path.relative(root, f).split(path.sep).join('/')
const files = [...walk(root)].filter((f) => !SKIP.test(unix(f)))
const problems = []
for (const file of files) {
  const rel = unix(file)
  const emails = !NO_EMAIL.test(rel)
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const [label, re] of DENY) {
      if (re.test(line)) problems.push(`${rel}:${i + 1}: ${label}`)
    }
    if (!emails) return
    for (const [address] of line.matchAll(EMAIL)) {
      if (!EMAIL_OK.test(address)) problems.push(`${rel}:${i + 1}: mailbox ${address}`)
    }
  })
}

if (problems.length) {
  console.error(`check-public: ${problems.length} problem(s). This repo is public; move these into the consuming repo.\n`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`check-public: OK (${files.length} files)`)
