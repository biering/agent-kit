---
name: scaffold
description: >-
  Scaffold a new app on one fixed stack after a short intake: Astro and coss on Cloudflare Workers, Expo, Tauri, Nitro, FastAPI, Supabase, Stripe, zod. Use to scaffold, kickstart or bootstrap an app or MVP.
---

# Scaffold

Turn a one-line idea into a running app without re-deciding the architecture: an intake
interview, then a build that starts from each stack's own CLI and is reconciled to the monorepo.
The references carry versions, configs and working code; read the one a step names before
writing its code.

The repo's `AGENTS.md` and `docs/agent-kit/scaffold.md` win where they differ (where apps live,
the package scope, its own launch steps). `<slug>`, `<domain>`, `<scope>` and `<AppName>` are placeholders throughout.

## The stack

| Surface | Dir | Stack | Read |
|---|---|---|---|
| Web | `web` | Astro 7, React 19, coss UI, Tailwind v4, Supabase, Stripe or Polar, Resend, on Cloudflare Workers | `references/web.md` |
| Mobile | `mobile` | Expo, Expo Router, HeroUI Native, Uniwind, Supabase auth; standalone package | `references/mobile.md`, `references/icons.md` |
| Desktop | `desktop` | Tauri v2, Vite, React 19, Tailwind v4, coss UI; serde on the Rust side | `references/desktop.md` |
| API + MCP | `api` | Nitro (`cloudflare_module`), its own Worker at `api.<domain>` | `references/api.md` |
| Python service | `service` | FastAPI, Pydantic, uv, Ruff, ty; only when the job needs a Python library | `references/python.md` |
| Shared core | `core` | `@<scope>/<slug>-core`: Supabase clients, queries, zod schemas, types; not deployed | the surface references |

Rules for every surface (placement, pnpm catalog, Biome, **zod as the only validator**, one env
module per package, Node 22, per-app `AGENTS.md` and `DESIGN.md`): `references/conventions.md`,
read once.

- Pick the smallest set the intake justifies. A marketing or waitlist MVP is `web/` alone.
- `api/` only for a non-web consumer: agents or MCP, mobile, webhooks, cron, a backend shared by
  web and mobile.
- `core/` only when two surfaces share data access or schemas.
- `service/` (Python) only when the work needs Python's ecosystem: ML models, scientific or data
  libraries with no TypeScript equivalent. Everything else stays TypeScript. It is its own uv
  project, outside the pnpm workspace, and TypeScript surfaces call it over HTTP.
- Mobile is standalone: its own lockfile, outside the workspace, a self-contained Biome config.
  It talks to `api/` over HTTP and never imports the web app.

## Phase 1: Intake (always first)

`references/intake.md`: six to nine batched multiple-choice questions, each with a recommended
default, aimed at the cheapest path to a paying customer (unvalidated demand means a waitlist or
pre-sale page). It ends with a written brief in git. Apps headed for the App Store read
`references/app-store.md` now: Sign in with Apple, account deletion and Restore Purchases are
features, not paperwork.

## Phase 2: Build

Runs unattended: each step's verify command, advance only on green. Branch, gates and PR follow
the `dev-loop` skill.

```
- [ ] 0.  Brief written; branch created
- [ ] 1.  Each surface from its native CLI (surface reference), then its UI kit skill:
          coss + coss-particles (web, desktop) or heroui-native (mobile)
- [ ] 2.  Workspace packages registered (mobile stays out); catalog versions; install from root
- [ ] 3.  Configs reconciled: Biome extends the root, tsconfig, catalog refs (`references/conventions.md`)
- [ ] 4.  DESIGN.md per UI surface, AGENTS.md per app; theme the kit to the design (design skill)
- [ ] 5.  One zod env module per package, the only reader of process.env / import.meta.env
- [ ] 6.  Supabase + auth only if the core action produces per-user data (`references/supabase-auth.md`)
- [ ] 7.  The one core action, per surface, with its zod schemas shared from core/ when two
          surfaces use them
- [ ] 8.  Pricing: waitlist if unvalidated; checkout if validated and paid, prices declared in a
          config file and created by script (`references/web.md`). No billing the intake did not justify
- [ ] 9.  Web: SEO head, sitemap and robots, imprint and privacy, analytics (`references/seo-legal-analytics.md`)
- [ ] 10. Per-app CI: format, lint, unit tests, build when deployable (`references/deploy.md`, CI)
- [ ] 11. Push-to-deploy wiring, wrangler routes and vars, the ops env file (`references/deploy.md`)
- [ ] 12. At least one real unit test per package, so the test gate means something
- [ ] 13. Mobile paid tier or release: purchase model, StoreKit, widgets, store listing (`references/app-store.md`)
- [ ] 14. The repo's own launch steps in `docs/agent-kit/scaffold.md` (a ship checklist, an SEO
          loop, a story doc)
- [ ] 15. Definition of Done per the dev-loop skill
```

**Design before screens (step 4).** If the user supplied a design (brand colours, a `DESIGN.md`,
screenshots, Figma), theme the UI library to it first; on mobile that means HeroUI Native's
semantic CSS variables in `global.css`. Reuse library components styled through the theme; never
fork or hand-roll one to match.

## Lessons that keep costing money

Each shipped, broke something real and is now a rule; detail in the reference named.

- A local env file (`.dev.vars`, `.env.local`) gets inlined into a Worker build and breaks every
  request at the edge: gitignore it and make the build refuse to run while it exists. (`deploy.md`)
- Deploys push code, not secrets: set a renamed secret on the target before merging, delete the
  old one after. A fix touching no watch path does not deploy; confirm the rebuild ran.
  (`deploy.md`)
- Confirm the account before any remote write: `supabase projects list` shows the target and
  `CLOUDFLARE_ACCOUNT_ID` is pinned. Production ships by merging to `main`, not by hand.
  (`deploy.md`)
- State-changing actions are POST, and money paths fail closed: availability counted the way the
  database enforces it, refunds flagged, a first failed invoice is not a cancellation. (`web.md`)

## Other stacks

A repo may run a service this stack does not cover. Its `AGENTS.md` says when, for example
Leverage: Temporal workers or `*.railway.internal` services are Nitro on Railway, a measured
CPU problem is Rust, and its ML service is the Python shape in `references/python.md`. Everything else uses this skill.

## Maintaining this skill

It lives in agent-kit and is installed into repos, never edited there. It never names a real app:
embed a minimal complete example with placeholders instead. A lesson from one app goes in as the
generic rule plus an example, not as that app's story. Every file in `references/` is named in
this file.
