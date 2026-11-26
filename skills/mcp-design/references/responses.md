# Responses and errors

Every result lands in the agent's context and stays there. Size it for the next decision, not for
completeness.

## Size

- **Budget**: a typical result under about 2,000 tokens, a large one under 10,000 (Claude Code
  warns there), never near 25,000 (its default cap, `MAX_MCP_OUTPUT_TOKENS`; past it the result is
  saved to a file and replaced by a path). Text over 50,000 characters goes to a file in Claude
  Code regardless. A tool that must return more sets `_meta["anthropic/maxResultSizeChars"]` (up to
  500,000) and says why.
- **Lists**: `limit` with a default (10 to 25) and a maximum (100), `next_cursor` in the result, and
  a line saying how to continue: `"More results: pass cursor \"c_81\" with the same filters."` Cap
  repeated sub-lists and say how many were left out.
- **Detail on request**: a `detail: "summary" | "full"` (or `response_format: concise | detailed`)
  input, summary by default. Anthropic measured 72 against 206 tokens for one result. Or `fields`
  for wide records. The summary keeps the ids the next call needs.
- **High-signal fields**: names beside ids (`{ "project_id": "p_12", "project": "Shop" }`), human
  units, no internal columns, no 256-pixel image URLs, no echo of the input, no nulls for fields
  that never apply. Map fields explicitly; never spread a database row into the result.
- **Filter on the server.** If agents always want the top 10 by some measure, sort and cut there.

## Shape

- **Data tools** return `structuredContent` that matches a declared `outputSchema`, and the same
  JSON serialized in one text block for clients that read only text (the spec says SHOULD). Clients
  validate against the schema, and code-mode clients type against it.
- **Narrative tools** (a summary, a diagnosis) return Markdown text. Keep ids verbatim in code
  spans.
- **One envelope per kind** across the server: `{ items, next_cursor }` for lists, the object for a
  get, `{ job_id, status, poll }` for async starts. Same field names for the same concept as the
  REST API.
- **Resource links** (`resource_link`) for large artefacts the agent may open later (a report, an
  export) instead of inlining them.
- **Untrusted content** (text written by customers, crawled pages, third-party answers) is returned
  as data, marked where it starts and ends, and the description says the tool returns it.

## Long work

- Anything that can take more than a few seconds returns at once with a `job_id`, its status and
  the poll call (`jobs_get({ job_id })`). Say in the description how long it usually takes.
- Send progress notifications on calls that stream; they reset client idle timeouts (Claude Code:
  5 minutes over HTTP).
- The Tasks extension (`io.modelcontextprotocol/tasks`, 2026-07-28) is the protocol's version of
  the same; offer it where clients support it, keep the poll tool for those that do not.

## Errors that teach

Two kinds, never mixed:

| Kind | Use | Shape |
|---|---|---|
| Tool error | bad input, not found, not allowed, a business rule, an upstream failure | a normal result with `isError: true` and a text the model can act on |
| Protocol error | unknown tool, malformed JSON-RPC, a server fault | a JSON-RPC error; the model is unlikely to recover |

A tool error says three things: **what was wrong, the valid values or the state that would work,
and the next call.**

| Bad | Good |
|---|---|
| `{"error":"Bad Request"}` | `isError: "period must be one of 7d, 30d, 90d (got 14d). For other ranges pass from and to as YYYY-MM-DD."` |
| `{"error":"not found"}` as a success | `isError: "No project p_99 on this account. projects_list returns the ids."` |
| `"Forbidden"` | `isError: "This connection lacks the write scope. Reconnect and tick write, or ask the owner for a write key."` |
| a stack trace | `isError: "The search provider timed out. Retry in a minute; nothing was charged."` |

- **Never return an error shaped like success** (`{ "error": ... }` without `isError`). The client
  and the agent treat it as data.
- Validation failures are tool errors (2025-11-25 clarified this): the model fixes the argument and
  retries.
- Keep error text short (under about 1,000 characters; Claude Code keeps only the first and last
  5,000 of a long one). No internals, no secrets, no stack traces.
- Rate limits: say how long to wait. Quota or budget exhaustion: say what is left and when it
  resets.
- Do not retry inside the tool on input errors; return so the agent can correct itself.
- HTTP-level auth stays HTTP: no or a dead token is a 401 with `WWW-Authenticate`; a missing scope
  is a 403 `insufficient_scope` naming every scope needed (`protocol.md`).
