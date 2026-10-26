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
  ['Stripe key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{8,}/],
  ['GitHub token', /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
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
const EMAIL_OK = /^(?:[^@]*[<>{}$][^@]*@|.*@(?:example\.(?:com|org|net)|users\.noreply\.github\.com)$)/

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

// Upstream data vendored verbatim (its licence sits beside it) is not ours to rewrite; this file
// names the patterns it hunts.
const SKIP = /^(?:skills\/design\/references\/taste\/library\/|scripts\/check-public\.mjs$)/
const files = [...walk(root)].filter((f) => !SKIP.test(path.relative(root, f).split(path.sep).join('/')))
const problems = []
for (const file of files) {
  const rel = path.relative(root, file)
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const [label, re] of DENY) {
      if (re.test(line)) problems.push(`${rel}:${i + 1}: ${label}`)
    }
    for (const [address] of line.matchAll(EMAIL)) {
      // `<inbox>@agentmail.to` keeps its placeholder just before the match.
      const before = line.slice(0, line.indexOf(address))
      if (!EMAIL_OK.test(address) && !/[<{]\w*[>}]$/.test(before))
        problems.push(`${rel}:${i + 1}: mailbox ${address}`)
    }
  })
}

if (problems.length) {
  console.error(`check-public: ${problems.length} problem(s). This repo is public; move these into the consuming repo.\n`)
  for (const p of problems) console.error(`  ${p}`)
  process.exit(1)
}
console.log(`check-public: OK (${files.length} files)`)
