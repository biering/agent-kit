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

## MCP endpoint — best practices

These practices are distilled from a production MCP server (official SDK, StreamableHTTP transport,
annotations, resources, scopes, structured errors, contract tests). A minimal hand-rolled JSON-RPC
handler — a route that pattern-matches the raw JSON-RPC body and answers only `tools/call` itself —
can limp along for one or two tools, but for anything real use the SDK and the practices below.

1. **Use the official SDK + StreamableHTTP transport, not hand-rolled JSON-RPC.** `new McpServer(...)`
   from `@modelcontextprotocol/sdk/server/mcp.js`. The transport handles `initialize` / `tools/list` /
   `tools/call` / notifications correctly — hand-rolling only `tools/call` (the shortcut above) skips
   the handshake real clients expect. Mount it in one place (`server/mcp/executeMcpHttpExchange.ts`)
   and call it from the route(s).

   **On Workers pick the web transport**: `WebStandardStreamableHTTPServerTransport` from
   `.../server/webStandardStreamableHttp.js`, whose `handleRequest(request)` takes a `Request` and
   returns a `Response` — return that straight from the handler. The default
   `StreamableHTTPServerTransport` (`.../server/streamableHttp.js`) is the Node wrapper: its
   `handleRequest(req, res, body)` wants `IncomingMessage`/`ServerResponse`, which do not exist on
   an edge runtime, so it can never work there. Let the transport read the body — do not pre-read it,
   or the `Request` is already consumed.

2. **Server `instructions` are agent onboarding — write them.** Pass `instructions` to `McpServer`: how
   to auth, domain quirks, async/polling flows, units/ID conventions, and "read the `<app>://skill`
   resource once per session." This prose is what makes the tools usable; contract-test it so it can't
   silently drift from behavior.

3. **Expose resources**, not just tools. `registerResource('<app>://skill', …, text/markdown)` for the
   agent-facing skill doc, and `<app>://openapi` for the OpenAPI snapshot. Agents read these to self-serve.

4. **Annotate every tool** with `ToolAnnotations` — `readOnlyHint`, `destructiveHint`, `idempotentHint`,
   `openWorldHint`. Categorize consistently: read-only, mutating-create (non-idempotent), mutating-patch
   (idempotent), destructive-delete. Centralize the title+annotations in one `toolMeta` map and the tool
   names in one `toolNames` union — hosts use annotations to decide what to auto-approve.

5. **Naming: `<resource>_<action>` snake_case, resource-first** (`scans_run`, `pages_get`,
   `rubric_list`). One central name union gives you type safety and a target for the contract test.

6. **zod `inputSchema` on every tool.** Reuse the same schemas as the REST routes so there is one source
   of truth. `z.coerce.*` for params that arrive as strings. No `as` casts on tool args.

7. **A single tool-run wrapper** (`runMcpTool(extra, fn)`) that maps a thrown `Error` to a structured
   `CallToolResult` and a helper (`jsonToolResult(data)`) that wraps JSON in the text-content shape.
   Handlers stay thin: validate → call a `core/` function → `jsonToolResult`. Don't format results ad hoc.

8. **Least privilege via scope-gated registration.** Register read tools always; wrap write/destructive
   tools in `registerWhenWrite(ctx, …)` so a read-only token never sees them. Auth (bearer / per-user
   connector token vs service key) resolves scopes before the server is built.

9. **Auth failures return JSON-RPC errors, not bare 401s** — reply on the same JSON-RPC `id` so the
   client surfaces it cleanly; rate-limit the connector token. Never leak which tools exist to an
   unauthorized caller.

10. **Contract-test the surface** (`test/mcp/*`): a `tools.contract` test that locks tool names + input
    schemas + annotations, plus auth, scopes, and structured-error tests. The contract test is what keeps
    tools, annotations, and instructions honest over time — it's the highest-leverage MCP test.

11. **Async work returns a `job_id`; add a `jobs_get` poll tool.** Don't block a tool call on a long job;
    return the id and let the agent poll. Document the flow in the instructions.

12. **Optional — MCP-UI (`@modelcontextprotocol/ext-apps`):** interactive cards for hosts that render them
    (Claude Cowork), always with a text-JSON fallback so non-UI hosts still work.

Keep handlers thin and reuse `core/`: the same Supabase client, zod schemas, and query functions back
both the REST routes and the MCP tools, so the two surfaces can never diverge.
