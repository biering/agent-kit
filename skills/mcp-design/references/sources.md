# Sources

Read 2026-11-26 unless a row says otherwise. Numbers are the source's own; vendor numbers are
vendor-reported. Re-read a source before quoting a limit: clients change monthly.

## Protocol

| # | Source | Date | What it settles |
|---|---|---|---|
| P1 | [MCP spec changelog 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog) | 2026-07-28 | stateless (no initialize, no session id), `server/discover`, `ttlMs` and `cacheScope` on list results, deterministic list order, Tasks as an extension, Multi Round-Trip Requests, Roots, Sampling and Logging deprecated, DCR deprecated for Client ID Metadata Documents, 12-month deprecation window |
| P2 | [Tools, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) | 2026-07-28 | the tool set "MUST NOT vary per-connection or as a side effect of other requests ... MAY vary by the authorization presented"; `list_changed` via `subscriptions/listen`; names 1 to 128 of `A-Z a-z 0-9 _ - .` |
| P3 | [Caching, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching) | 2026-07-28 | `cacheScope: private` for lists filtered per user |
| P4 | [Tools, 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) | 2025-11-25 | `structuredContent` SHOULD also be sent as text; `outputSchema` MUST be conformed to; `isError` for execution and validation errors, JSON-RPC for protocol errors; hints untrusted |
| P5 | [Schema, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/schema) | 2025-06-18 | annotation defaults: readOnly false, destructive true, idempotent false, openWorld true |
| P6 | [Authorization, 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) | 2026-07-28 | RFC 9728 metadata MUST; `scope` in the 401 challenge; one 403 `insufficient_scope` with every needed scope; RFC 8707 audience; no token passthrough |
| P7 | [SEP-1300, tool filtering with groups and tags](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1300) | closed 2025-12-01 | rejected; superseded by the grouping working group |
| P8 | [Progressive Disclosure working group](https://modelcontextprotocol.io/community/working-groups/progressive-disclosure) | renamed 2026-09-21 | explores grouping, tool search and code mode; picks none; Grouping Convention v0.1 is a proposal |

## Anthropic and clients

| # | Source | Date | What it settles |
|---|---|---|---|
| A1 | [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | 2025-09-11 | consolidate around tasks, namespace by service and resource, names over ids, `response_format` concise 72 vs detailed 206 tokens, actionable errors, the eval loop |
| A2 | [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) | 2025-11-04 | tools as code loaded on demand; filter in code; 150,000 to 2,000 tokens on one workflow |
| A3 | [Introducing advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use) | 2025-11-24 | tool search: about 85% fewer definition tokens, Opus 4 49% to 74%, Opus 4.5 79.5% to 88.1%; `input_examples` 72% to 90% |
| A4 | [Tool search tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool) | read 2026-11-26 | regex and BM25 variants; 5 results by default; 10,000 deferred tools; `defer_loading` on `mcp_toolset`; selection degrades past 30 to 50 tools; prefix names so one search finds a group |
| A5 | [Claude Code, MCP](https://code.claude.com/docs/en/mcp) | read 2026-11-26 | MCP tools deferred by default (`ENABLE_TOOL_SEARCH`: unset, true, auto, auto:N, false); `alwaysLoad`; 10,000-token warning; `MAX_MCP_OUTPUT_TOKENS` 25,000; over 50,000 characters to a file; `anthropic/maxResultSizeChars` up to 500,000; instructions and upfront descriptions cut at 4,096 characters; `list_changed` refetch in interactive sessions |
| A6 | [GitHub MCP server](https://github.com/github/github-mcp-server) and [remote server docs](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md) | read 2026-11-26 | toolsets, default set, `/x/{toolset}`, `/readonly`, `X-MCP-Toolsets`, `X-MCP-Tools`, aliases for renamed tools; dynamic toolsets local-only and beta |
| A7 | [Copilot: smarter with fewer tools](https://github.blog/ai-and-ml/github-copilot/how-were-making-github-copilot-smarter-with-fewer-tools/) | 2025-11-19 | 40 tools cut to 13 plus 4 virtual groups: +2 to 5 points on SWE benchmarks, 400 ms faster |
| A8 | [VS Code tools](https://code.visualstudio.com/docs/agents/run/tools) | read 2026-11-26 | 128 tools per request; virtual tools past a threshold |
| A9 | [Cursor: dynamic context discovery](https://cursor.com/blog/dynamic-context-discovery) | 2026-01-06 | MCP descriptions synced as files and read on demand, 46.9% fewer tokens |
| A10 | [Cursor forum: list_changed not acted on](https://forum.cursor.com/t/mcp-notifications-tools-list-changed-not-acted-on-mid-session/161459) | 2026 | Cursor ignores `list_changed` mid-session |
| A11 | [OpenAI tool search](https://developers.openai.com/api/docs/guides/tools-tool-search) | read 2026-11-26 | `tool_search` with `defer_loading` on newer models; `allowed_tools` on the MCP tool |
| A12 | [Cloudflare: Code Mode MCP](https://blog.cloudflare.com/code-mode-mcp/) | 2026-02-20 | `search` + `execute` over 2,500+ endpoints in about 1,000 tokens |
| A13 | [RAG-MCP](https://arxiv.org/abs/2505.03275) | 2025-05 | retrieving tools first: 43.13% against 13.62% selection accuracy |

## Servers and practice

| # | Source | Date | What it settles |
|---|---|---|---|
| X1 | [Supabase MCP](https://github.com/supabase-community/supabase-mcp) | read 2026-11-26 | `features=`, `read_only`, `project_ref` (drops the parameter); annotations per tool; untrusted-data wording on `execute_sql` |
| X2 | [Sentry MCP: adding tools](https://github.com/getsentry/sentry-mcp/blob/main/docs/contributing/adding-tools.md), [tool responses](https://github.com/getsentry/sentry-mcp/blob/main/docs/contributing/tool-responses.md) | read 2026-11-26 | search terms in the first sentence, 512-character cap, all hints explicit, `structuredContent` as truth, capped lists with omitted counts, cursor notes, `isError` never success-shaped |
| X3 | [Sentry MCP changelog](https://sentry.io/changelog/sentry-mcp-2026-10-01-to-2026-10-19/) | 2026-10-20 | one search split into six per-dataset tools; deprecated alias kept |
| X4 | [Stripe MCP](https://docs.stripe.com/mcp) | read 2026-11-26 | search, details, read, write over whitelisted methods; per-action human confirmation for money |
| X5 | [Linear MCP](https://linear.app/docs/mcp) | read 2026-11-26 | `/mcp/readonly` endpoint; OAuth with a read scope |
| X6 | [Block: playbook for designing MCP servers](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers) | 2025-06-16 | top-down from workflows; one risk level per tool; no timestamps in instructions |
| X7 | [Neon: test evals for MCP](https://neon.com/blog/test-evals-for-mcp) | 2025-06-18 | 60% to 100% pass rate from rewriting descriptions alone |
| X8 | [Phil Schmid: MCP best practices](https://www.philschmid.de/mcp-best-practices) | 2026-01-21 | outcomes over operations, flat arguments, curate for discovery |
