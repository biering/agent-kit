# Scoping: toolsets, a map, and search

How a server with more tools than an agent should hold at once lets the agent load only what it
needs. Sources and dates: `sources.md` (S-rows).

## What the protocol says (2026-07-28)

- **There are no tool groups in MCP.** SEP-1300 (groups, tags, filtering) was rejected on
  2025-12-01 in favour of a working group. The Progressive Disclosure working group (named so on
  2026-09-21) documents grouping, tool search and code mode as patterns and picks none; its
  "Grouping Convention v0.1" is a proposal, not spec. Grouping is a naming and serving convention.
- **The tool list may vary by authorization, not by history.** The tools page: the set "MUST NOT
  vary per-connection or as a side effect of other requests on the connection. The set MAY vary by
  the authorization presented on the request". A different URL is a different request target, so a
  toolset chosen in the URL is fine; a tool that turns on more tools is not.
- **List results carry `ttlMs` and `cacheScope`.** A list filtered per credential is
  `cacheScope: "private"`. Return tools in a deterministic order so client caches and prompt caches
  hit.
- **`notifications/tools/list_changed` still exists** (through `subscriptions/listen` in
  2026-07-28). Clients honour it unevenly; treat it as a cache hint for deploys, never as a feature
  a workflow depends on.

## What clients do (late 2026)

| Client | Defers or searches tools itself | Acts on `list_changed` | Count limit | Pick sets how |
|---|---|---|---|---|
| Claude Code | yes: MCP tools deferred by default, `ToolSearch` loads them (`ENABLE_TOOL_SEARCH`) | interactive sessions refetch; `-p` and SDK refresh tools only; stdio reports of misses | none fixed | URL in `claude mcp add`; `alwaysLoad` per server |
| Claude API (MCP connector) | yes: tool search tool, `defer_loading` on `mcp_toolset` | n/a (per request) | 10,000 deferred | URL; per-tool `configs` |
| OpenAI Responses | `tool_search` with `defer_loading` (newer models only); `allowed_tools` filter | n/a (per request) | not published | URL, `allowed_tools` |
| Cursor | descriptions synced as files, read on demand (2026-01) | ignores it mid-session | historically 40 | URL; per-tool toggles |
| VS Code Copilot | virtual tools group past a threshold | yes | 128 per request | URL; tool sets |
| Windsurf | no | unverified | 100, extras dropped | URL |
| Gemini CLI | no | unverified | none known | `includeTools` / `excludeTools` |

So two populations: clients that search (load names, fetch definitions on demand) and clients that
load the list as given. A server serves both with one design.

## The patterns, compared

| Pattern | Who | Client with `list_changed` | Client without | Verdict |
|---|---|---|---|---|
| Toolsets in the URL (`?toolsets=`, `/x/<set>`) | GitHub remote, Supabase `features=` | fixed at connect | same | **base**: universal, stateless, cacheable |
| Toolsets in a header (`X-MCP-Toolsets`) | GitHub remote | same | same | optional extra: many clients cannot set headers on a remote server |
| By OAuth scope | Sentry skills, Linear `read` | same | same | **for permission only**: scopes are about what may happen, not what is relevant |
| Discovery tool that enables a set | GitHub local `--dynamic-toolsets` (beta, not on remote) | list grows | agent never sees the tools | **no**: forbidden as a side effect in 2026-07-28, broken in Cursor, busts caches |
| Map in the instructions | MCP client guidance, Claude tool-search docs | same | same | **yes**: a few lines, read once |
| Search tool returning schemas, plus a call-through | Composio, AWS `call_aws`, MCP client guidance | same | same | **yes, read-only call-through** |
| Client tool search / deferral | Claude Code, Claude API, OpenAI, Cursor, VS Code | independent | independent | free when present: help it with prefixes and keywords |
| Code mode (`search` + `execute`) | Cloudflare (2,500+ endpoints in about 1,000 tokens) | not needed | works | only for very large APIs; needs a sandbox, loses per-call approval |

## The recommended pattern

### 1. One registry, one toolset per tool

```ts
type Toolset = 'core' | 'analytics' | 'billing' | 'admin'

export const TOOLSETS: Record<Toolset, string> = {
  core: 'Projects, the headline numbers, the next actions, and tools_search to find the rest.',
  analytics: 'Traffic over time, breakdowns by source and page, funnels, live visitors.',
  billing: 'Plans, invoices and payment setup. Writes need the write scope.',
  admin: 'Members, API keys and account deletion. Every write asks a human.',
}

export const TOOLS = {
  projects_list: { set: 'core', title: 'List projects', annotations: READ },
  analytics_breakdown: { set: 'analytics', title: 'Break down traffic', annotations: READ },
  invoices_list: { set: 'billing', title: 'List invoices', annotations: READ },
  keys_revoke: { set: 'admin', title: 'Revoke an API key', annotations: DESTRUCTIVE },
} satisfies Record<string, { set: Toolset; title: string; annotations: ToolAnnotations }>
```

- `core` holds the first call (`projects_list` or a `context_get`), the answers to the most common
  questions, the main write of the product's loop, and `tools_search`. Pick it from usage data when
  you have it: the tools that cover most calls.
- A set is 3 to 15 tools for one job. Fewer than 3: merge it. More than 15: split by job, not by
  verb.
- Tool names start with the set's resource words (`analytics_breakdown`, `invoices_list`), so a
  regex or BM25 tool search for "invoice" returns the billing set together.

### 2. The URL selects, the credential filters

```ts
function selectTools(url: URL, scopes: Set<string>) {
  const raw = url.searchParams.get('toolsets')
  const wanted = raw === 'all' ? Object.keys(TOOLSETS) : (raw?.split(',') ?? ['core'])
  const unknown = wanted.filter((s) => !(s in TOOLSETS))
  if (unknown.length) throw badRequest(`Unknown toolset ${unknown.join(', ')}. Valid: all, ${Object.keys(TOOLSETS).join(', ')}`)
  const sets = new Set(['core', ...wanted])
  return Object.entries(TOOLS)
    .filter(([, t]) => sets.has(t.set))
    .filter(([name]) => allowedByScope(name, scopes)) // permission, separate from relevance
    .map(([name]) => name)
}
```

- `core` is always included; `tools=a,b` (single tools) is a useful extra for operators.
- **OAuth**: the protected resource is the canonical server URL without the query. Validate the
  token audience against that, so one grant serves `/mcp` and `/mcp?toolsets=all`. Serve the
  protected-resource metadata for the canonical path.
- **Filter writes at registration by scope**: a read grant's list has no write tools, so no tool
  call can fail on a scope the agent could not see. Mark that list `cacheScope: "private"`.
- A `readonly=true` selector (GitHub, Supabase, Linear all have one) is cheap to add and lets a
  person connect a read-only agent with a full-scope account.

### 3. The map in the instructions

```text
Tools come in toolsets. This connection has: core. Others (add ?toolsets=<name> to the server URL,
or call tools_search to find one tool):
- analytics: traffic over time, breakdowns by source and page, funnels, live visitors
- billing: plans, invoices and payment setup
- admin: members, API keys, account deletion
```

It names tools and sets only, so it passes a connector-directory review, and it stays the same for
every session (no dates, no counts that change), so it caches.

### 4. `tools_search` and a read-only `tools_call`

```ts
tools_search({ query: 'refund invoice', toolset?: 'billing', limit?: 5 })
// → { tools: [{ name, toolset, title, description, inputSchema, annotations, loaded: false }] }

tools_call({ name: 'invoices_list', arguments: { status: 'open' } })
// runs only tools whose annotations say readOnlyHint: true and whose scope the caller holds;
// a write returns isError: "invoices_refund is a write. Connect with ?toolsets=billing to call it
// by name, where your client asks for approval."
```

- Search by words over name, title, description and parameter names; return full definitions so
  the agent can build valid arguments.
- The call-through validates arguments with the tool's own schema and returns its own result. It
  counts as that tool in logs and rate limits.
- Why reads only: a client shows a write's annotations and asks for approval per tool name. A
  generic `tools_call` would hide a destructive call behind a read-looking tool.

### 5. Install lines per client

A connect page or prompt knows the client. Give searching clients everything, the rest the default:

```text
claude mcp add --transport http example https://api.example.com/mcp?toolsets=all
# Cursor, Windsurf, VS Code: https://api.example.com/mcp   (core + tools_search)
```

## When the pattern is overkill

Under about 20 tools and 8,000 tokens of definitions: one set, no search tool, no selector. Add
the registry field anyway; it costs nothing and makes the split a config change later.
