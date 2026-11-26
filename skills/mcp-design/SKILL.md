---
name: mcp-design
description: >-
  Build or change an MCP server for agents: tool budget, toolsets, names, descriptions, schemas,
  responses, errors, write safety, scopes, tests. Use for new MCP tools or tool scoping.
---

# MCP server design

Read the repo's `AGENTS.md` and `docs/agent-kit/mcp-design.md` first. They say where the server
lives, which auth package and SDK it uses and which house names apply, and they win where they
differ from this skill.

An MCP server is a prompt with side effects. Every tool definition is read by a model that has
never seen your product, costs context on every turn it is loaded, and competes with every other
tool the agent holds. Design for that reader: few tools, each named for a job, each answer small
enough to think with and specific enough to act on.

The rules, with ids that `review-api` scores against, are in `references/checklist.md`. This page
holds the opinions behind them. Facts come with dates in `references/sources.md`; the protocol
moves twice a year, so re-check a limit there before you quote it.

## 1. Budget before tools

- **A default set of at most about 20 tools and about 8,000 tokens of definitions.** Tool selection
  degrades past 30 to 50 tools, and a client that loads everything pays for every definition on
  every turn. Measure it: `node scripts/tool-budget.mjs <tools.json | --url ...>`.
- **Design from the agent's jobs, not the endpoints.** List the ten questions an agent asks the
  product and the five things it does. One tool per job; chain steps inside the tool when the agent
  would always chain them (`references/tools.md`).
- **Past about 300 operations, think code mode** (`search` + `execute` over the API spec, run in a
  sandbox). Below that, curated tools in toolsets read better and keep per-tool approval.

## 2. Scoping: toolsets, chosen by URL

The protocol has no tool groups. It allows a tool list that varies by the request's URL and its
credential, and forbids one that changes because of earlier calls (2026-07-28). Clients differ: some
search deferred tools themselves (Claude Code, the Claude API, OpenAI's tool search), some ignore
`notifications/tools/list_changed`, some cap the count. The pattern that works in all of them
(`references/scoping.md` has the client matrix and the code):

1. **Every tool belongs to one toolset**, a group named for a job (`analytics`, `billing`,
   `admin`), 3 to 15 tools, described in one line. Names share the set's resource prefix so a
   client's tool search finds the group with one query.
2. **The URL picks the sets**: `/mcp` serves `core` (the default set), `/mcp?toolsets=core,billing`
   adds sets, `toolsets=all` serves everything. An unknown name is a 400 that lists the valid ones.
   One OAuth grant covers every selection.
3. **The instructions carry the map**: one line per toolset with what it answers and how to add it.
   A model reads it at connect; a tool search reads it to know what to look for.
4. **`tools_search` in `core`** finds any tool on the server by words and returns its name,
   toolset, description and input schema. An optional `tools_call` runs a **read-only** tool by
   name, so an agent on a fixed client can still read everything. Writes are never reachable
   through it: a write tool is called by its own name, where the client shows its annotations and
   asks for approval.
5. **Scopes decide permission, toolsets decide relevance.** A read-only grant never sees write
   tools (filter at registration); a toolset never grants anything.
6. **No runtime "enable a toolset" tool.** The spec forbids a list that changes as a side effect,
   and clients that ignore `list_changed` would never see the new tools.

Clients with their own deferred loading get `toolsets=all` in their install line; everyone else
gets the default URL.

## 3. Each tool

`references/tools.md`, with good and bad examples:

- **Names** `<resource>_<verb>` in snake_case, at most 64 characters, one verb per action across
  the server (`list`, `get`, `create`, `update`, `delete`, `search`, `run`).
- **Title** a verb and object label, set as `title` and as `annotations.title` from one source.
- **Description**: the first sentence says what it does to which object and what it returns, in
  the user's words (truncating clients and tool search read the start). Then the one thing that
  changes how it is called: when a sibling is the right tool, the cost, the limit. Under 500
  characters; no implementation detail, no orders to the model.
- **Inputs**: flat primitives, enums for closed sets, formats and defaults in the schema,
  unambiguous names (`invoice_id`, not `id` beside three other ids). Reuse the REST schemas.
- **Annotations** on every tool, all four hints set explicitly; the spec's defaults assume the
  worst (destructive, open world). One risk level per tool: never a read and a write behind a
  `method` parameter.

## 4. Each answer

`references/responses.md`:

- **Small by default.** Lists take `limit` (a default and a maximum) and return `next_cursor`;
  a `detail` or `fields` input widens on request. Return names beside ids, drop what the agent
  cannot use.
- **Data tools return `structuredContent` with an `outputSchema`, and the same JSON as text** for
  clients that read only text.
- **Truncation says so**: what was cut and the exact call that gets the rest.
- **Errors teach**: `isError: true` with what was wrong and what to do next (the valid values, the
  tool to call first). Never a success-shaped `{ "error": ... }`. JSON-RPC errors only for protocol
  faults.
- **Writes are safe to retry**: idempotent on a natural key or an idempotency key, and say which.
  Money, deletion and anything sent outside the product get a human confirmation and, when they
  cost, an `estimate` mode.
- **Long work** returns a job id and a poll tool, or uses the Tasks extension where the client
  supports it.

## 5. Protocol, auth, onboarding

`references/protocol.md`: streamable HTTP, stateless; OAuth 2.1 with protected-resource metadata,
`scope` in the 401 challenge and every missing scope in one 403; `instructions` short, covering
rules that span tools and the toolset map, never "read resource X first"; resources for data a
person points at, prompts for workflows that string existing tools.

## 6. Prove it

`references/testing.md`:

- **A contract test** snapshots every tool's name, toolset, title, annotations and schema, and
  fails on drift, on a missing `annotations.title`, on a description over budget and on a default
  set over budget.
- **Evals**: ten to thirty realistic tasks with checkable answers, run through a real agent loop;
  track success, tool calls, tokens and errors; run them when a description or the default set
  changes.
- **Versioning**: add, never change in place. A rename keeps the old name as an alias with
  "(Deprecated)" in its title for a stated window; a breaking change bumps the server version and
  says so in the changelog.

## Before you ship

Walk `references/checklist.md` and the connector-directory gate in
`../review-api/references/mcp-directory.md` when the server will be listed. A review of an
existing server is `review-api`.
