# Scoping: a small surface on one URL

How a server with more tools than an agent should hold at once keeps its context cost down without
making the person who connects it choose anything. Sources and dates: `sources.md`.

## The constraint that decides the design

**A server listed in a directory has one URL.** The person clicks "connect" in claude.ai or ChatGPT
and gets whatever that URL serves; nobody edits a query string, and a second "lite" connector is a
second thing to install, approve and explain. So the default URL must serve every tool the listing
claims, and the savings have to come from the definitions and the answers, not from hiding tools.

Two more facts close the other doors (late 2026):

- **The protocol has no tool groups and no lazy schemas.** SEP-1300 (groups) was rejected on
  2025-12-01; lazy tool hydration (#1978), dynamic discovery (SEP-1821) and token bloat (SEP-1576)
  were all closed in 2026. The Progressive Disclosure working group explores
  grouping, tool search and code mode and has shipped nothing. The 2026-07-28 tools page forbids a
  list that changes "as a side effect of other requests"; it "MAY vary by the authorization
  presented".
- **OpenAI forbids a generic executor.** Plugin guidelines 6.2(b): "Expose each model-callable
  operation as a separate tool ... Do not use discovery, operation selection, or schema fetching
  with a generic executor to enable operations not individually exposed for review." A
  `tools_search` + `tools_call` pair that stands in for unlisted tools fails ChatGPT review, and
  Anthropic's review rejects one tool that runs both safe and unsafe methods.

## What clients do (late 2026)

| Client | Defers or searches tools itself | Server can help with | Count limit |
|---|---|---|---|
| claude.ai (web, desktop, mobile) | per connector, not per tool: "Auto" loads the connectors it judges relevant, "On demand" searches for a connector first; a loaded connector brings every tool | nothing documented: it pays the full definitions | none published |
| Claude Code | yes: only tool names and server instructions load at start, `ToolSearch` loads the rest | instructions that say when to search; search words at the start of each description; `_meta["anthropic/alwaysLoad"]: true` on the few tools to load upfront | none fixed |
| Claude API (MCP connector) | tool search with `defer_loading` | same as Claude Code | 10,000 deferred |
| ChatGPT and Codex | the Responses API defers a whole server behind its name and description (`tool_search`, `defer_loading`); ChatGPT's own behaviour is not documented | a clear server description; OpenAI advises namespaces of fewer than 10 functions | not published |
| Cursor | descriptions synced as files, read on demand | short first lines | historically 40 |
| VS Code Copilot | virtual tool groups past a threshold | prefixes | 128 per request |
| Windsurf, Gemini CLI | no | nothing | Windsurf 100 |

So the largest client, claude.ai, pays the full definition size whenever it loads the connector.
The levers that work everywhere are the server's own.

## The levers, in order

1. **Smaller definitions** (every client, no cost to anyone). The input schemas are usually most of
   the size: cut parameter descriptions that restate the name, long enum prose, nested shapes the
   agent never fills, and the same paragraph repeated on sibling tools. Descriptions: first line
   under about 200 characters with the words a search would use, the whole under 500. Measure
   before and after with `scripts/tool-budget.mjs`.
2. **Smaller answers** (every client). Bounded lists, a cursor, a `detail` selector, names beside
   ids (`responses.md`). In a long chat the results cost more than the definitions.
3. **Help the clients that search.** Instructions that say what the server is for and when to
   search for its tools; resource prefixes so one query finds a family (`invoices_list`,
   `invoices_get`); `_meta["anthropic/alwaysLoad"]: true` on the three to five tools most sessions
   start with, and nowhere else.
4. **Fewer tools where the job is one** (`tools.md`): merge steps an agent always chains, within
   one risk level. Each merge renames a tool, which resets the "always allow" a person gave it and
   breaks saved prompts, so do it in one batch with a version bump, not one tool at a time.
5. **Scopes for permission.** A read-only grant lists no write tool (filter at registration). That
   is about what may happen, never about relevance.

## What not to do on a listed server

- **A runtime "enable a toolset" tool.** Forbidden as a side effect by 2026-07-28; Cursor ignores
  `list_changed` mid-session, so the new tools never appear.
- **`tools_search` + a call-through that replaces listed tools.** Fails OpenAI 6.2(b), and a
  write behind it hides the destructive call from per-tool approval. Stripe's and AWS's servers do
  it; they are API consoles, not products with a fixed tool list.
- **A default URL that serves a subset.** Directory users never see the rest.
- **`$ref` and `$defs` in input schemas to save bytes.** Several clients have failed on them
  (2026 reports), with no measured gain.

## Toolsets in the URL: only for clients the person configures

For a server that is not in a directory, or as an extra for config-file clients (Claude Code,
Codex, Cursor), `?toolsets=a,b` is a reasonable opt-in: GitHub's remote server and Supabase's
`features=` work this way. Keep it additive and optional:

- the bare URL serves everything; a selection only narrows;
- an unknown name is a 400 listing the valid ones; one OAuth grant serves every selection (validate
  the audience against the URL without its query);
- every tool belongs to one set named for a job, recorded in the registry even before anyone
  selects, so the split stays a config change;
- the instructions name the sets only when the server offers selection.

## Under about 20 tools and 8,000 tokens

None of this is needed. Keep the levers 1 and 2 anyway: they are what directory reviewers read
as "frugal with tokens".
