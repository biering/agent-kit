# Architecture: api (Nitro server, + MCP)

This reference is self-contained: the full config and layout are embedded below — it works in a
repo where no other app exists yet.

Target: `apps/<slug>/api`. Deployed as its **own Cloudflare Worker** (`<slug>-api`, typically at
`api.<domain>`), separate from the web Worker. Use an `api/` package only when a **standalone
server** is genuinely required: a public/agent API, an **MCP endpoint**, webhooks, cron, or a
backend shared by web + mobile. A web-only MVP talks to Supabase directly from Astro routes — no
`api/`.

## Scaffold with the native CLI

```bash
pnpm create nitro@latest apps/<slug>/api    # verify the current command; fall back to writing the files below by hand
```

Then align to the monorepo (catalog refs, biome `extends "//"`, wrangler). Key files:

`nitro.config.ts`:

```ts
import { defineNitroConfig } from 'nitro/config'

export default defineNitroConfig({
  serverDir: 'server',
  compatibilityDate: '2025-01-15',
  devServer: { port: 4011, hostname: '127.0.0.1' },
  preset: 'cloudflare_module',
  cloudflare: { deployConfig: true },
})
```

`package.json` (scripts + deps):

```jsonc
{
  "name": "<slug>-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "nitro dev",
    "build": "nitro build",
    "preview": "nitro preview",
    "deploy": "pnpm build && wrangler deploy",
    "format": "biome format .",
    "lint": "biome lint .",
    "check": "biome check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@<scope>/<slug>-core": "workspace:*",     // if core/ exists
    "h3": "^1.15.4",
    "zod": "catalog:",                            // add zod to the catalog if not present
    "@modelcontextprotocol/sdk": "^1.24.0"        // only if exposing an MCP endpoint
  },
  "devDependencies": {
    "@types/node": "^22.13.10",
    "nitro": "latest",
    "typescript": "catalog:",
    "wrangler": "catalog:",
    "vitest": "^3.2.0"
  }
}
```

`wrangler.jsonc` (Nitro output entrypoint — different from the Astro one):

```jsonc
{
  "name": "<slug>-api",
  "main": ".output/server/index.mjs",
  "compatibility_date": "2025-01-15",
  "compatibility_flags": ["nodejs_compat"],
  "workers_dev": true,
  "routes": [{ "pattern": "api.<domain>", "custom_domain": true }],
  "vars": { "PUBLIC_SITE_URL": "https://<domain>" },
  "observability": { "enabled": true },
  // Branch builds run `wrangler preview`, which inherits nothing above.
  "previews": { "vars": { "PUBLIC_SITE_URL": "https://<domain>" } }
}
```

`custom_domain: true` makes wrangler create the DNS record. The alternative shape —
`{ "pattern": "api.<domain>/*", "zone_name": "<domain>" }` — is a route pattern, which requires a
proxied DNS record at that hostname to already exist; on a fresh zone the deploy succeeds and the
hostname stays dead.

## Layout & conventions

```
api/
  nitro.config.ts  package.json  tsconfig.json  biome.json  wrangler.jsonc  .env.example
  server/
    api/**          # route handlers: <resource>.get.ts, <resource>.post.ts (method in the filename)
    routes/**       # non-/api routes, e.g. mcp.post.ts
    middleware/**   # cors.ts, auth.ts
    utils/**        # auth guards, db helpers, zod schemas
```

- **Never declare `h3` as your own dependency.** Nitro bundles it, and the two majors are not
  interchangeable: h3 v1 helpers read `event.node.req`/`event.node.res`, which exist on Node and
  **not on Workers**. Pair a pinned `h3@1` with a Nitro that ships h3 v2 and every request 500s in
  `getRequestURL` before routing — while `nitro dev` (Node) and unit tests stay green, so nothing
  catches it until the first deploy. Import helpers from **`nitro/h3`**, which re-exports whatever
  Nitro actually runs, or pin `h3` to the exact version `npm view nitro dependencies` reports.
- **h3 v2 event shape** (Nitro 3): `event.req` is a web `Request`, `event.url` a parsed `URL`,
  and handlers may return a `Response` directly. Use `event.url.pathname` and `event.req.method`;
  `setResponseStatus(event, n)` replaces `event.node.res.statusCode = n`. There is no `event.node`.
- **`defineRouteMeta` is an import in Nitro 3** (`import { defineRouteMeta } from 'nitro'`), not the
  global build macro it was in v2. An ambient `declare function` satisfies `tsc` while the runtime
  throws `defineRouteMeta is not defined` — typecheck cannot catch this one.
- **zod at the edge:** parse every request body / query / header payload with a zod schema in
  `server/utils/` before touching it. Validate env in one module too.
- **Auth:** use the **service-role** Supabase client (from `core/`) behind a bearer check for
  agent/publish routes; public GETs stay unauthenticated. Never expose the service role to the
  browser.
- **Env** (`.env.example`): `SUPABASE_URL` (or `PUBLIC_SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY`,
  plus any `*_SECRET` bearer tokens. Set as Worker secrets in production (`wrangler secret put`),
  never in `wrangler.jsonc`. Public, non-credential config goes in `vars` instead — in git,
  reviewable.
- **Cron.** `triggers.crons` in `wrangler.jsonc` and `scheduledTasks` in `nitro.config.ts` must
  stay in sync; the Cloudflare trigger is what actually fires. The schedule **arms on first
  deploy** — if the task calls a metered third-party API, confirm the subscription and secrets are
  live before that merge. Pair it with a bearer-guarded `POST /internal/run-<task>` so the job can
  be re-run by hand without waiting a day.
- **Local dev:** `pnpm -C apps/<slug>/api dev` → `http://127.0.0.1:4011`.

## MCP endpoint

The design rules (tool budget and scoping, names, descriptions, response shapes, errors, write
safety, scopes, tests) are the `mcp-design` skill; read it before the first tool. What is specific
to this stack:

1. **The official SDK and its web transport.** `new McpServer(...)` from
   `@modelcontextprotocol/sdk/server/mcp.js`, mounted in one place
   (`server/mcp/executeMcpHttpExchange.ts`). On Workers use
   `WebStandardStreamableHTTPServerTransport` (`.../server/webStandardStreamableHttp.js`): its
   `handleRequest(request)` takes a `Request` and returns a `Response`. The default
   `StreamableHTTPServerTransport` is the Node wrapper and cannot run on an edge runtime. Let the
   transport read the body; a pre-read `Request` is consumed. Stateless: `sessionIdGenerator:
   undefined`, a fresh server per POST, 405 on GET and DELETE.
2. **One registry** (`server/mcp/toolMeta.ts`): a `ToolName` union and, per tool, its title,
   scope and annotations. Registration reads it, sets `annotations.title` from `title`, and skips
   tools the token's scopes do not allow.
3. **zod `inputSchema` from `core/`**, the same schemas as the REST routes; `z.coerce.*` for values
   that arrive as strings; no `as` casts on tool arguments.
4. **One wrapper** (`runMcpTool(fn)`) maps a thrown error to an `isError` result with an actionable
   message, and `jsonToolResult(data)` returns `structuredContent` plus the same JSON as text.
   Handlers stay thin: validate, call a `core/` function, return.
5. **No or a dead token is an HTTP 401 with `WWW-Authenticate`** (the OAuth metadata URL and the
   scope), never a 200 carrying a JSON-RPC error: that header is how a client signs in from the URL
   alone. A missing scope is a 403 `insufficient_scope`. Rate-limit per agent.
6. **The contract test** (`server/mcp/tools.contract.test.ts`) snapshots names, titles,
   annotations and schemas, and runs `mcp-design`'s `scripts/tool-budget.mjs` budgets on the
   served list.
7. **Optional, MCP Apps** (`@modelcontextprotocol/ext-apps`): interactive cards for hosts that render
   them, always with the text result for hosts that do not.

Keep handlers thin and reuse `core/`: the same Supabase client, zod schemas, and query functions back
both the REST routes and the MCP tools, so the two surfaces can never diverge.
