# Protocol, auth and onboarding

The spec in force is **2026-07-28** (previous: 2025-11-25, 2025-06-18). Build to it and stay
readable by 2025-11-25 clients, which still dominate. Check `sources.md` for the version current
when you read this.

## Transport and state

- **Streamable HTTP**, one endpoint (`/mcp`), POST JSON-RPC. HTTP+SSE is deprecated.
- **Stateless.** 2026-07-28 drops the `initialize` handshake and `Mcp-Session-Id`; every request
  carries its protocol version and client capabilities in `_meta`, and servers implement
  `server/discover`. For 2025 clients, a fresh server per POST with no session id behaves the same;
  answer GET and DELETE with 405 rather than holding a stream open you can never write to.
- State across calls lives in ids the server mints and the agent passes back (`job_id`, a cursor),
  never in the connection.
- List results carry `ttlMs` and `cacheScope` (`public`, or `private` when filtered per credential)
  and come in a deterministic order.
- Roots, Sampling and Logging are deprecated in 2026-07-28: do not depend on them. Input needed
  mid-call uses Multi Round-Trip Requests (`input_required`), not server-initiated elicitation.

## Auth

- **OAuth 2.1, the server as resource server.** Protected-resource metadata (RFC 9728) is a MUST;
  the authorization server offers RFC 8414 or OIDC discovery, PKCE S256, and Client ID Metadata
  Documents (preferred since 2025-11-25; dynamic client registration is deprecated in 2026-07-28
  but still what many clients use, so keep it while they do).
- **401** without or with a dead token: `WWW-Authenticate: Bearer resource_metadata="<url>",
  scope="read"`. That header is how a client signs in from the URL alone.
- **403** for a missing scope: `Bearer error="insufficient_scope", scope="read write"`, naming
  **every** scope the operation needs in one challenge (clients retry only a few times).
- `scopes_supported` is the minimal set for basic use; default grants are least privilege (read).
- Validate the token audience (RFC 8707 `resource`) against the canonical server URL; never accept
  or pass through a token minted for another resource; bearer in the header, never in a URL.
- Tools a credential cannot call are not in its list (the spec allows lists to vary by
  authorization). Scope names describe permission (`read`, `write`, `billing:write`), never
  relevance; relevance is toolsets (`scoping.md`).
- A fallback API key for clients without OAuth goes in the `Authorization` header, is scoped and
  revocable, and is listed beside the OAuth connections.
- Rate-limit per agent (credential), not per IP: hosted clients share egress addresses.

## Instructions

The `instructions` string is read once at connect, by every client, and by connector reviewers.

- **Short**: under about 1,500 characters (Claude Code cuts at 4,096). Rules that span tools: the
  first call, units and time zones, id conventions, what counts as what, the toolset map.
- **The same every time**: no dates, counts or per-user text, so it caches.
- **Tools only**: no "read resource X before acting" (reviewers reject guidance fetched at
  runtime), no "report problems to us" unless the person asks. A fact about one tool goes in that
  tool's description.

## Resources and prompts

- **Resources** are data a person or client attaches: a report, an export, a schema. Expose them
  with stable URIs and return `resource_link`s from tools. A guide the model must read before it
  can use the tools is a sign the tools are unclear; fix the descriptions instead.
- **Prompts** are named workflows a person starts ("weekly review"): they string existing tools,
  name only tools that exist on every selection that offers the prompt, and fetch nothing.

## Hosting checklist

- CORS `*` on `/mcp` and the discovery and token endpoints when the credential is a bearer header
  (browser clients like the MCP Inspector need it); never with cookie auth.
- A thrown exception becomes a JSON-RPC error with a generic message, logged server-side; a
  platform crash makes clients retry in a loop.
- The issuer and resource URLs come from configuration, never from the Host header.
