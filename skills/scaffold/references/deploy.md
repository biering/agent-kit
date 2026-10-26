# Deployment & remote ops — Cloudflare Workers + Supabase

Production changes ship **one way: merge to `main` → GitHub Actions**. No deploying from a
laptop as the normal path, no dashboard-only configuration an agent cannot see or change.

Everything that decides what production looks like — build command, routes, cron triggers,
migration step — lives in files in git. That is what makes deployment agent-manageable: the
agent edits the workflow, reads the run logs with `gh`, and fixes forward.

## The two credential planes

Keep them separate; they have different blast radius.

| Plane | Where | Used for | Who sets it |
|---|---|---|---|
| **CI** | GitHub repo secrets | the real deploys, on `main` | human, once |
| **Local** | gitignored `.env` in the app | agent ops: link, migrate, gen types, `secret put`, incident deploy | human, once |

The agent gets the local plane so it can *operate* (migrations, secret rotation, inspection).
It does not get a habit of deploying by hand — see Guardrails.

## Account selection — both CLIs are single-account by default

The trap that costs the most time: **both CLIs authenticate globally, and a person with more
than one account will be pointed at the wrong one.**

**Supabase.** `supabase login` writes one access token to the OS keychain, shared by every
project on the machine. A second account means the token is simply wrong for this project. Do not
run `supabase login` to fix it — that clobbers the other account. Set `SUPABASE_ACCESS_TOKEN`
instead; it overrides the keychain for that process only and leaves the global login intact.

**Cloudflare.** `wrangler login` is likewise global, and its OAuth token expires. In a
non-interactive agent session the failure is:

```
✘ [ERROR] Not logged in. Your auth token has expired and could not be refreshed,
  and the environment is non-interactive.
```

Use `CLOUDFLARE_API_TOKEN`. When the credentials can reach more than one account, **always** pin
`CLOUDFLARE_ACCOUNT_ID` too, or wrangler stops to ask which one — fatal in CI.

Token scopes for a Workers deploy: **Workers Scripts:Edit**, **Workers Routes:Edit**,
**DNS:Edit** (only if using `custom_domain`), **Account Settings:Read**.

The account is **fixed for the monorepo**, not chosen per app. Record which one and why in the
repo's deployment doc (Maelstrom: `docs/accounts.md`, pinned as `account_id` in every
`wrangler.jsonc`). Read the ID from there rather than asking; it is not a secret.

## The project ref does not live in `config.toml`

`project_id` in `supabase/config.toml` is the **local** project identifier (Docker container
naming). It does not resolve the remote project. A directory containing only a `config.toml`
with a real project ref still fails:

```
Cannot find project ref. Have you run supabase link?
```

The remote ref resolves from exactly two places: `supabase/.temp/project-ref` (written by
`supabase link`, machine-local and gitignored) or an explicit `--project-ref` flag.

Consequence: **the ref must be hardcoded in a committed script**, or every teammate and every CI
run rediscovers it. The ref is not a secret — it is the public subdomain of `SUPABASE_URL`.

Put the scripts in the **group meta-package** (`apps/<slug>/package.json`), not in a surface. The
CLI resolves `supabase/` relative to the working directory, and `supabase/` sits at the app root
next to that `package.json` — so the scripts run from where the migrations already are, and one
command serves every surface instead of `web` owning a directory it doesn't contain:

```json
"db:link":   "supabase link --project-ref <ref>",
"db:status": "supabase migration list",
"db:push":   "supabase db push",
"db:types":  "supabase gen types typescript --linked > core/src/types/database.types.ts && biome format --write core/src/types/database.types.ts"
```

Two things that bite:

- **`--linked`, not `--local`.** A scaffold-time `--local` keeps generating from a Docker database
  that may not even be running, silently emitting a stub while the real schema drifts away from it.
  Switch it the moment a remote project exists.
- **Format the generated file in the same script.** The CLI's output does not match Biome's style,
  so a bare `db:types` turns the format gate red on a file nobody is allowed to hand-edit. Chaining
  the formatter keeps "regenerate" a single safe step.

## The local env file — and the `.env.example` naming trap

CLI credentials split by **scope**, not by app. Anything that is a property of the *account* goes
in a gitignored `.env` at the **repo root**; only genuinely project-specific values sit in
`apps/<slug>/.env`. Each gets a committed `.env.example` beside it.

| File | Holds | Why there |
|---|---|---|
| `.env` (repo root) | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN` | one account for the repo — copying these per app is how one app quietly deploys somewhere else, and it is N tokens to rotate instead of one |
| `apps/<slug>/.env` | `SUPABASE_DB_PASSWORD`, per-app product/price ids | issued per project; genuinely differs |

Source root first, then the app's, so the app can override:

```bash
set -a; source ../../.env; source .env; set +a
```

Neither file is loaded by an app at runtime — `web/.env` and `api/.env` are separate and belong to
their own surfaces — so ops credentials can never reach a bundle. Put the app-level file at the app
root rather than inside a surface: `supabase` and `wrangler` both run from there.

Check the account layout before splitting. One Cloudflare account and one Supabase org across the
repo is what makes the tokens shared; two orgs would push `SUPABASE_ACCESS_TOKEN` back down to the
app.

**The name must be exactly `.env.example`.** A monorepo `.gitignore` of the usual shape —

```
.env
.env.*
!.env.example
```

— ignores `.env.*` and un-ignores only the literal `.env.example`. A file called
`.env.supabase.example` matches `.env.*`, does not match the negation, and is **silently
untracked**. Verify with `git check-ignore -q <path> && echo IGNORED || echo tracked` rather
than assuming.

Also add the CLI's link state, which contains the project ref and pooler URL:

```
**/supabase/.temp/
```

The `**/` prefix is required. A bare `supabase/.temp/` contains a slash, so git anchors it to the
repo root and it never matches `apps/<slug>/supabase/.temp/`.

Root `.env.example`:

```bash
# Repo-wide ops credentials. Copy to `.env` (gitignored) and fill in.
# Not loaded by any app at runtime — this is for CLI commands only:
#   set -a; source .env; set +a
#
# Both CLIs authenticate globally — Supabase keeps one access token in the OS
# keychain, wrangler one OAuth login — so a machine with more than one account
# silently targets the wrong one. These override per process and leave both
# global logins alone.
#
# Production deploys go through a merge to main, not from here. Use these for
# migrations, secret rotation, and incident response.

# Every Worker in the repo deploys to this account.
CLOUDFLARE_ACCOUNT_ID=
# Workers Scripts:Edit, Workers Routes:Edit, DNS:Edit, Account Settings:Read
CLOUDFLARE_API_TOKEN=

# PAT covering every project in the org — dashboard -> account -> tokens
SUPABASE_ACCESS_TOKEN=
```

`apps/<slug>/.env.example`:

```bash
# Project-specific ops credentials. Account-level ones are in the repo-root .env.
#   set -a; source ../../.env; source .env; set +a

# Dashboard -> Project Settings -> Database. Makes link/db push non-interactive.
SUPABASE_DB_PASSWORD=
```

## `wrangler.jsonc` — routes, vars, secrets

**Custom domains: use `custom_domain: true`.** A bare route pattern requires a proxied DNS
record at that hostname to already exist. On a fresh zone none does, so the deploy *succeeds*
and the hostname stays dead — a silent failure. `custom_domain` makes wrangler create the DNS
record itself.

```jsonc
// api — one hostname
"routes": [{ "pattern": "api.<domain>", "custom_domain": true }]

// web — apex + www
"routes": [
  { "pattern": "<domain>",     "custom_domain": true },
  { "pattern": "www.<domain>", "custom_domain": true }
]
```

A web Worker with **no** `routes` at all deploys to `<slug>-web.workers.dev` and never serves
the domain. Easy to miss; check for it.

**Pin `account_id` and match `name` to the package.** Both go in the config, in git, so the deploy
target is reviewable and cannot be redirected by whatever is in someone's shell:

```jsonc
"name": "<slug>-web",                 // same as package.json name
"account_id": "<account-id>",         // a wrong CLOUDFLARE_ACCOUNT_ID can't override this
```

A config copied from a neighbouring app with its `name` left alone doesn't fail — it overwrites
that app's Worker. Worth a mechanical check if the repo has one.

**`vars` are not secrets.** Public config belongs in `wrangler.jsonc` under `vars`, in git,
where it is reviewable:

```jsonc
"vars": { "PUBLIC_SITE_URL": "https://<domain>", "PUBLIC_API_URL": "https://api.<domain>" }
```

Only unprefixed credentials go through `wrangler secret put`. Never put a secret in
`wrangler.jsonc`.

A secret the app makes itself (an encryption key, a cron bearer token, a signing salt) gets a
`# @generate` comment directly above its line in `.env.example`, so a secrets script can generate
it, keep it in each surface's gitignored `.env` and set it on every Worker that declares it, with
no human step (Maelstrom: `pnpm secrets <slug> --set`).

**Build-time vs runtime is a separate axis.** A `vars` entry is a *runtime* binding. Anything a
static config reads while building — e.g. Astro's `site` from `PUBLIC_SITE_URL`, which fixes
canonicals and the sitemap — must **also** be an env var in the build step, or the build silently
takes its fallback. Set such values in both places.

## Deployment: merge to `main`, and Cloudflare deploys

**The rule, for every app: production ships by merging to `main`, and the Worker is
connected to GitHub in Cloudflare.** Nothing else deploys. A scaffold is not finished until that
connection exists — an app whose Worker is not connected has no deployment, only a person who
remembers to run a command.

That makes push-to-deploy a *Worker setting*, not a CI step: Cloudflare clones the repo itself and
runs the build and deploy commands. There is no `wrangler deploy` step in a workflow, and no
`CLOUDFLARE_API_TOKEN` repo secret for the deploy path. Actions keeps only what Workers Builds
cannot do — gates (`<slug>-ci.yml`, see `deploy.md` (CI)) and database migrations (`<slug>-migrate.yml`).

`wrangler deploy` from a laptop stays an incident tool. If you find yourself using it as the routine
way to ship an app, that app's wiring is broken — fix the wiring.

Each Worker gets **two triggers**:

| Trigger | Branches | Deploy command |
|---|---|---|
| production | `main` | `npx wrangler deploy` |
| preview | `*` except `main` | `npx wrangler preview` |

The preview command creates a [Worker Preview](https://developers.cloudflare.com/workers/previews/):
a branch of the Worker with its own URL, settings and secrets. It never adds a version to the
production Worker, which `wrangler versions upload` did, and which made `wrangler secret put`
refuse on any Worker with an open PR. Two things follow:

- **Every `wrangler.jsonc` needs a `previews` block**, or `wrangler preview` refuses to run. A
  Preview inherits nothing from the top level, so restate each `vars` entry (the same value, or a
  preview one) and each Durable Object binding under it; `"previews": {}` is enough when there is
  neither. Point storage bindings (KV, R2, D1) at preview resources, or leave them out: binding the
  production one means a branch writes production data. Wrangler 4.135 or later.
- **Secrets are per Preview.** A new Preview copies the Previews Base secrets when it is created:
  `npx wrangler preview base-config secret put <NAME>`, with a test value where one exists.

Both share the same shape:

| Field | Value |
|---|---|
| **Root directory** | the app subpath, where `wrangler.jsonc` lives — never `/` |
| **Node.js** | `22` |
| **Build command** | `pnpm -C <../ up to root> install && pnpm build` |
| **Watch paths** | the app dir, every workspace package it depends on, and the root lockfiles |

`pnpm install` must run at the repo root (one pnpm workspace, one lockfile) while the build runs in
the app — hence the `-C`.

### Wiring it from a script

The Workers Builds API covers all of it, so wire it from one repo script instead of the
dashboard. Maelstrom's, as the shape to copy:

```bash
pnpm builds <slug>            # report drift against what the repo requires
pnpm builds <slug> --apply    # create the Worker and triggers if missing, fix drift
pnpm builds --all             # every Worker in the repo
```

Run it once before the app's first merge, and again any time the app gains a `workspace:*`
dependency. For a new app it creates the Worker as an unreachable placeholder and both triggers
(borrowing the repo connection and a live build token from a Worker that is already connected), so
merging the PR is the first deploy. It re-reads the Worker tag every run and **derives watch paths from the dependency graph**, which are
the two things hand-configuration gets wrong:

- Triggers are addressed by **tag**, not name. A recreated Worker gets a new tag, after which
  triggers on the old one return 200, read back fine against that stale tag, and appear to have
  vanished.
- The dashboard defaults watch paths to `*`, so the Worker rebuilds on every push to the monorepo —
  the exact thing watch paths exist to prevent. A Worker that depends on a `core/` package and does
  not watch it serves stale code instead.

What stays manual, by nature:

1. **The GitHub App install** is an OAuth handshake — once per GitHub account, in the dashboard.
2. **The first connected Worker in a new Cloudflare account**, because `--apply` borrows its repo
   connection and build token. In an account that already has one, nothing here needs the
   dashboard.
3. **Moving a trigger between repositories** — `PATCH` accepts `repo_connection_uuid` and silently
   ignores it.

`routes` in `wrangler.jsonc` must name every hostname the Worker answers on. `wrangler deploy`
syncs custom domains to that list and removes the rest with their DNS records, including a `www`
that exists only to redirect.

Finally, document the Worker in the repo's deployment doc: root directory, commands and watch
paths. A docs drift check that fails on an undocumented Worker is worth having, because that doc is
the only reviewable copy of configuration that otherwise lives only in Cloudflare.

## Smoke the real runtime — green gates are not evidence it boots

`check`, `typecheck`, and unit tests can all pass on code that 500s on **every** request in
production. The dev server runs on Node; the Worker does not. Anything that reads a Node-only
object (`event.node`, `IncomingMessage`, `Buffer`-shaped APIs) works in `dev`, compiles fine, is
never touched by a unit test that calls a handler function directly — and then throws on the first
real request. Typecheck cannot see it either when a shim (an ambient `declare`, a `catch`) stands
in for something the runtime lacks.

So the deploy is not done when the workflow is green. It is done when a request succeeds:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.<domain>/          # a route with no auth
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/
```

A non-2xx here means read the actual exception, not the build log:

```bash
pnpm --filter <slug>-api exec wrangler tail --format json    # then hit the URL
```

Two ways to shorten this loop: run `wrangler dev` (the real workerd, not Node) at least once before
the first deploy, and add one integration test that goes through `fetch` rather than calling the
handler directly. A single request against the real runtime catches an entire class that no amount
of unit coverage will.

## First deploy is not idempotent-by-magic

Before the first merge, someone does these once — the workflow assumes them:

1. Worker names are free (the wiring script creates the Worker; nothing to pre-create).
2. The domain's zone is **active on Cloudflare** — check `dig +short NS <domain>` returns
   `*.ns.cloudflare.com`. `custom_domain` creates records inside a zone; it cannot create the zone.
3. Every Worker secret is set (`wrangler secret put`), or the first request 500s on missing env.
4. The Supabase project exists and the hardcoded `--project-ref` matches it.

## Local ops runbook (what the agent actually runs)

Read-only first, and always confirm the account before touching anything:

```bash
cd apps/<slug>
set -a; source .env; set +a

supabase projects list          # CONFIRM the target ref is listed — wrong account shows wrong projects
supabase link --project-ref <ref>
supabase migration list         # local vs remote; empty Remote column = nothing applied
supabase db push --dry-run      # names the migrations, changes nothing
```

Before a first push to a project believed empty, prove it is empty rather than assuming — a
schema built by hand in the dashboard collides with `create table`:

```bash
supabase db dump -s public | grep -E "^CREATE (TABLE|FUNCTION)"
```

Then push, and verify rather than trusting the exit code:

```bash
supabase db push
supabase migration list         # every Local row now has a matching Remote row
supabase db dump -s public | grep -cE "ENABLE ROW LEVEL SECURITY"   # == table count
```

Regenerate types after any schema change (`db:types`), and expect the diff to be large the first
time — a placeholder `database.types.ts` will be a fraction of the real one, and typecheck is
where the mismatch surfaces.

## Three ways a deploy lies to you

**A local env file inlined into the build.** A framework build reads every env source it can find,
including the local-only ones (`.dev.vars` for wrangler, `.env.local` for Vite), and bakes the values
into the server bundle. A file pointing at `127.0.0.1` therefore deploys, and every request dies at
the edge with a generic error while the repo looks clean. Two layers, because gitignore alone failed:

```
# apps/<slug>/.gitignore
.dev.vars
```

```js
// apps/<slug>/<framework>.config.*  — refuse to build with it present
if (process.argv.includes('build') && existsSync(path.join(root, '.dev.vars'))) {
  throw new Error('.dev.vars is present and would be baked into this build. Remove it first.')
}
```

**A renamed secret.** The deploy pushes code, not secrets, so renaming `STRIPE_PRICE_ID_OLD` to
`..._NEW` ships a build that reads a variable the Worker does not have, and the feature answers
"not configured" in production while every gate was green. Order: set the new secret on the target,
merge, then delete the old one.

**A fix whose commit touches no watch path.** Workers Builds only rebuilds when a changed file
matches the trigger's watch paths. Deleting a bad file in a commit that edits only `.gitignore`
matches nothing, so the bad build stays live and `main` looks fixed. After any incident fix, confirm
the rebuild ran and the deployed version changed, rather than trusting the merge.

## Guardrails

- **`wrangler deploy` from a laptop is an incident tool, not the workflow.** It ships whatever is
  in the working tree, including uncommitted edits, and leaves `main` describing something that is
  not running. Use it to unbreak production, then land the same change through `main`.
- **PR CI must not run `db push`.** A pull request may run `--dry-run` to prove the migrations
  parse and connect. Only `main` writes.
- **Migrations run before Workers, and are not reversible.** `db push` has no rollback. A
  migration that drops or rewrites a column needs a human read and a backup, regardless of who
  wrote it. Treat the merge that contains it as the approval gate.
- **`triggers.crons` arms on first deploy.** A cron calling a metered third-party API starts
  spending on its schedule the moment the Worker exists. Confirm the subscription is live and the
  secret is set before that merge, not after the first bill.
- **A rotated secret needs no deploy** — `wrangler secret put` takes effect immediately. Don't
  push an empty commit to "apply" it.

## CI — GitHub Actions per app

Every scaffolded app gets a path-filtered workflow at `.github/workflows/<slug>-ci.yml`.
**Minimum gates: format + lint (Biome `check`), typecheck, and unit tests.** Add a build gate
for deployable surfaces. The template below is complete — adapt filters per surface.

**Resolve `<node-version-file>` against a file that exists**, before writing any workflow: either
`apps/<slug>/.node-version`, which you must then actually create, or the repo-root `.nvmrc` the app
inherits. `setup-node` hard-fails on a missing file, so a pinned path that was never created turns
every job red on the first push — and it reads like a Node problem, not a missing file.

### Workspace surfaces (web / api / desktop-frontend / core)

These are in the turbo graph — filter by package name. Add a `test` script (`vitest run`) to each
package so the tests gate is real, even if it starts with one smoke test.

```yaml
name: <slug>-ci
on:
  push:
    paths: ["apps/<slug>/**", "biome.json", "turbo.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", ".github/workflows/<slug>-ci.yml"]
  pull_request:
    paths: ["apps/<slug>/**", "biome.json", "turbo.json", "pnpm-lock.yaml", ".github/workflows/<slug>-ci.yml"]
  workflow_dispatch:
concurrency:
  group: <slug>-ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  quality:                       # format + lint (Biome)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with: { package_json_file: ./package.json }
      - uses: actions/setup-node@v6
        with: { node-version-file: <node-version-file>, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run check --filter=<slug>-web    # add --filter=<slug>-api etc.
  build-and-test:
    needs: quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
        with: { package_json_file: ./package.json }
      - uses: actions/setup-node@v6
        with: { node-version-file: <node-version-file>, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run typecheck --filter=<slug>-web
      - run: pnpm turbo run test --filter=<slug>-web      # unit tests (vitest) — required minimum
      - run: pnpm turbo run build --filter=<slug>-web     # deployable surfaces only
```

Add `--filter=<slug>-api` / `--filter=<slug>-desktop` to each step when those packages exist. For
desktop, PR CI runs frontend only — `typecheck` + `test` + `vite:build` (see below); it does **not**
compile Rust.

### Mobile (standalone — not in turbo)

Mobile isn't a workspace member, so run its scripts directly from its dir. No Worker build.

```yaml
  mobile:
    needs: quality              # (or a separate workflow — mobile has its own lockfile)
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: apps/<slug>/mobile } }
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v6
        with: { node-version-file: <node-version-file>, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm typecheck
      - run: pnpm test           # jest-expo or vitest — required minimum
```

### Desktop release (separate workflow, on tag/release)

PR CI covers the frontend. The **native bundle** (sign + notarize + updater feed) runs in a
separate release workflow on `macos-latest` (or a platform matrix), via `tauri-apps/tauri-action@v0`:
import signing certs from secrets, build `--target universal-apple-darwin`, upload updater artifacts.
Only add this when the app is actually shipping installers.

If the app self-updates, the release workflow must also **stamp the release version into
`tauri.conf.json`/`Cargo.toml` before the build** and **assert the built bundle's
`CFBundleShortVersionString` equals the release version after it** — a mislabeled bundle makes every
install offer the update forever. Workflow skeleton + both steps as copyable YAML:
`desktop.md`.

### Tests are the point

The user's floor is **format + lint + unit tests**. Don't ship a CI that skips tests. Every package
gets a `test` script wired to a runner:

- web / api / core / desktop-frontend → **vitest** (`"test": "vitest run"`).
- mobile → **jest-expo** (Expo default) or vitest.
- desktop Rust → `cargo test` (add to the release workflow, not PR CI, since it needs the toolchain).

Seed at least one real unit test (e.g. a zod schema round-trip or a `cn()`/util test) so the gate
fails loudly if tests break — an empty test run that "passes" defeats the purpose.

### Deploys are not in Actions

This file is the **gate**: it runs on every push and PR and never writes to production. Shipping
is Cloudflare Workers Builds, which rebuilds a connected Worker when a merge to `main` touches its
watch paths. The only other workflow is `<slug>-migrate.yml`, which applies Supabase migrations on
`main`. Keeping them apart means a red gate can't half-deploy.

Don't add a deploy step or a `CLOUDFLARE_API_TOKEN` secret here. Wiring, watch paths and the
migrate workflow: `deploy.md`.
