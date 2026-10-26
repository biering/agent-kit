# Shared conventions (all architectures)

Cross-cutting rules that apply no matter which platform(s) you scaffold. The
per-architecture references assume these.

## Monorepo placement

Every new app lives under `apps/<slug>/` with one directory **per surface**:

```
apps/<slug>/
  web/       # Astro + React (Cloudflare Workers)     — web.md
  mobile/    # Expo + React Native (standalone)        — mobile.md
  desktop/   # Tauri v2 + React                         — desktop.md
  api/       # Nitro server (+ MCP)                     — api.md
  core/      # @<scope>/<slug>-core — shared Supabase clients/queries/types (not deployed)
  AGENTS.md  # per-app map (required)
  DESIGN.md  # visual/design source of truth (required for any UI surface)
```

Pick the smallest set the intake justifies. Add `core/` only when **≥2 surfaces** share
Supabase clients/queries/types.

## pnpm workspace + catalog

- Register new **workspace** packages in `pnpm-workspace.yaml` under `packages:` (globs).
  `apps/*` is already globbed; a nested layout (`apps/<slug>/web`, `/api`, …) needs its own entry:

  ```yaml
  packages:
    - 'apps/*'
    - 'apps/<slug>/*' # group without a mobile surface: glob all sub-surfaces
    # apps/<slug>/mobile stays unglobbed on purpose — mobile is standalone with its own lockfile.
    - 'apps/<slug>/web' # group WITH mobile: list workspace surfaces explicitly instead
  ```

- **Mobile is the exception:** it is *deliberately not* a workspace member (own lockfile, RN
  native toolchain). Leave `apps/<slug>/mobile` unglobbed and keep the explanatory comment (above)
  next to the group's entries. Everything else installs from repo root; mobile installs from its dir.
- **Reuse the catalog.** Before pinning a version, check `pnpm-workspace.yaml` `catalog:` and use
  `"<pkg>": "catalog:"`. Current catalog (verify — it moves): `astro ^7`, `react`/`react-dom ^19.2`,
  `tailwindcss ^4.3`, `@tailwindcss/vite ^4.3`, `@astrojs/cloudflare ^14.1`, `@astrojs/react ^6`,
  `wrangler ^4.110`, `@cloudflare/workers-types`, `@types/react`/`@types/react-dom`, `typescript ^5.9`,
  `@iconify-json/simple-icons`. If a shared dep is missing from the catalog, **add it to the catalog**
  rather than pinning ad-hoc. (Mobile/desktop-native versions come from their own CLIs — not the catalog.)
- Install from repo root (`pnpm install`) so workspace links resolve; run tasks with
  `pnpm turbo run <task> --filter=<pkg>` (leaf-package filters).

## Validation: zod, and only zod

**zod is the one validator in the TypeScript stack**, on every surface: web, API, mobile, desktop
front end, core. No hand-rolled checks, no second library (no yup, valibot, joi, class-validator),
no `as` casts on anything that came from outside the process.

What gets a schema:

| Boundary | Where the schema lives |
|---|---|
| Environment variables | one `env.ts` per package, the only module reading `process.env` / `import.meta.env`; public (`PUBLIC_*`, `EXPO_PUBLIC_*`) and secret vars as separate schemas |
| Web forms and client input | the same schema the server parses, imported from `core/` (or the surface's `schemas.ts`); the form narrows it with `.pick()` / `.partial()`, never a copy |
| URL search params and route params | `z.coerce` schemas at the page or route edge |
| Request bodies, query strings, response bodies | API route handlers parse input before use; clients parse responses they depend on |
| Webhooks | the verified raw body, parsed after the signature check |
| MCP tool inputs | the tool's input schema is the zod schema |
| `localStorage`, files, config loaded at runtime | parsed on read, with a fallback on failure |

- **One schema per shape**, shared. A field added in one place and forgotten in the other is the
  bug this prevents. Types come from `z.infer<typeof Schema>`, never a parallel interface.
- **Errors are for people.** Map `error.issues` to field messages in forms; return a 400 with the
  issue paths from APIs. Never echo a raw `ZodError` to a user.
- **Parse, don't check.** Use the parsed value downstream (`const body = Schema.parse(json)`), not
  the input after a `safeParse` that only returned a boolean.
- Tauri's Rust side validates with serde types; the TypeScript side parses what `invoke` returns
  with zod like any other response.
- A Python service validates with Pydantic models and publishes `openapi.json`; the TypeScript
  caller parses its responses with zod like any other untrusted input (`python.md`).

## Env files — a `.env.example` per package (always)

**Every package that reads env ships a committed `.env.example`** — one line per variable, grouped
under a short comment, empty or a safe default value. It is the discoverable source of truth for
"what does this service need to run", and it must exist for every surface you scaffold (web, api,
mobile, desktop, core), not just the ones with secrets.

- **`.env` / `.env.local` are gitignored and never committed; `.env.example` is committed.** Verify
  with `git check-ignore .env` (matched) and `.env.example` (not matched).
- **Name it exactly `.env.example`.** The usual ignore block (`.env`, `.env.*`, `!.env.example`)
  un-ignores only that literal name, so a variant like `.env.<thing>.example` matches `.env.*`, misses
  the negation, and is silently untracked. Scope by **directory**, never by a longer filename — each
  surface owns its own (`web/.env`, `api/.env`), and CLI/ops credentials live one level up in
  `apps/<slug>/.env`, which nothing loads at runtime. Always confirm with `git check-ignore` instead
  of assuming — this failure is invisible until a teammate has no file.
- Mark **public/client-safe** vars by prefix (`PUBLIC_*` for Astro, `EXPO_PUBLIC_*` for Expo) vs
  **secrets** (unprefixed — service-role keys, bearer tokens). Never hide a secret behind a public prefix.
- **Keep `.env.example` in sync with the package's zod `env.ts`** — add a var to the schema and to
  `.env.example` in the same change. In a repo with a drift check this is enforced in CI, in both
  directions: an undeclared read fails, and so does a declared key nothing reads (the usual cause is
  a removed integration whose keys were left behind). Removing an integration means removing its
  `.env.example` block in the same commit.
- A shared `core/` library lists the vars it reads via `runtimeEnv`/`env.ts` in its own `.env.example`,
  noting they are injected by the consuming service (it does not load a `.env` itself).

## Lint / format — Biome only

- Never ESLint/Prettier. Workspace packages ship a tiny `biome.json` that **`extends: "//"`** the
  repo-root config (which sets 2-space indent, width 100, single quotes, `asNeeded` semicolons,
  trailing commas `all`, `linter.rules.recommended: true`). Only add `files.includes` and the
  handful of rule overrides the app needs:

  ```json
  {
    "$schema": "../../../node_modules/@biomejs/biome/configuration_schema.json",
    "extends": "//",
    "files": {
      "ignoreUnknown": false,
      "includes": ["src/**/*.ts", "src/**/*.tsx", "astro.config.mjs", "package.json", "tsconfig.json"]
    },
    "linter": {
      "rules": {
        "complexity": { "noForEach": "off" },
        "style": { "noNonNullAssertion": "off" }
      }
    }
  }
  ```

- **Mobile is standalone** (outside the workspace) → `extends: "//"` can't resolve outside the
  workspace store, so it carries a **full self-contained** `biome.json` mirroring the root settings:

  ```json
  {
    "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
    "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
    "files": {
      "ignoreUnknown": true,
      "includes": [
        "src/**/*.ts",
        "src/**/*.tsx",
        "app.config.js",
        "babel.config.js",
        "metro.config.js",
        "global.css",
        "package.json",
        "tsconfig.json"
      ]
    },
    "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
    "linter": {
      "enabled": true,
      "rules": {
        "preset": "recommended",
        "complexity": { "noForEach": "off" },
        "style": { "noNonNullAssertion": "off" },
        "suspicious": { "noExplicitAny": "off" }
      }
    },
    "javascript": {
      "formatter": { "quoteStyle": "single", "trailingCommas": "all", "semicolons": "asNeeded" }
    },
    "assist": { "actions": { "source": { "organizeImports": "on" } } }
  }
  ```
- Scripts every package exposes: `format`, `format:fix`, `lint`, `lint:fix`, `check`, `check:fix`,
  `typecheck`.

## Node, hooks, types

- Node **22**. Either create `apps/<slug>/.node-version` or inherit the repo-root `.nvmrc` — pick one
  and point every workflow's `node-version-file` at the one that exists (see `deploy.md` (CI)).

### Version specs: current, pinned, coupled

Scaffold on **current** versions — check `npm view <pkg> version` when adding a dependency rather
than copying a range from an older app. But *how* you write the spec matters more than the number:

- **Never ship a floating spec** — `latest`, `*`, `next`, `beta`. It resolves at install time, so
  the version that shipped is not the version anyone chose, and a major (or a **beta** major, which
  is what `latest` means for some packages) lands with no diff to review. Write a concrete range.
- **A framework and the libraries it bundles move as one unit.** Declaring an independent range for
  a library your meta-framework already embeds gives you two copies at different majors, and the
  helpers from one silently receive event/context objects from the other. Either import through the
  framework's re-export (Nitro exposes `nitro/h3`) or pin to the **exact** version it bundles —
  `npm view <framework> dependencies` tells you which. "Latest of each" is the bug, not the fix.
- **Prereleases are a decision, not a default.** Check `npm view <pkg> dist-tags` before adopting;
  if `latest` is an `-rc`/`-beta`, say so in the PR.

A repo with a docs or dependency drift check should fail a floating spec there.
- Husky pre-commit (root) runs `pnpm format:fix` + `pnpm lint:fix` then `git add -u` — don't bypass.
- TypeScript strict. Web/desktop apps under one product often share an `apps/<slug>/tsconfig.base.json`;
  each surface's `tsconfig.json` extends it and adds `@/*` → `src/*`:

  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "ESNext",
      "moduleResolution": "bundler",
      "lib": ["ES2022", "DOM", "DOM.Iterable"],
      "strict": true,
      "skipLibCheck": true,
      "esModuleInterop": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true,
      "isolatedModules": true,
      "noEmit": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noFallthroughCasesInSwitch": true
    }
  }
  ```

## Docs

- Write the intake brief where the repo keeps product briefs, in git (Maelstrom:
  `docs/office-hours/<slug>/README.md`).
- Each app gets an `AGENTS.md` (a map — commands, stack, hard rules, pointers) and, for any UI
  surface, a `DESIGN.md` (tokens, typography, component specs). Model them on existing apps.

## Deploy targets by surface

**Every deploy is a merge to `main`**: Cloudflare Workers Builds rebuilds each connected Worker
whose watch paths changed, and a repo script wires the triggers (Maelstrom: `pnpm builds <slug> --apply`). GitHub Actions keeps
only the gate (`<slug>-ci.yml`) and database migrations (`<slug>-migrate.yml`). A hand-run
`wrangler deploy` is an incident tool. See `deploy.md`.

| Surface | Ships via |
|---|---|
| web | Cloudflare Workers (`@astrojs/cloudflare`), built and deployed by Workers Builds on merge |
| api | Cloudflare Workers (Nitro `cloudflare_module` preset, own Worker at `api.<domain>`), same path |
| mobile | EAS Build / App Store + Play Store |
| desktop | Tauri bundler → signed installers, released via GitHub + updater feed (R2) |
