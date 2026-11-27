---
name: mcp-design
description: >-
  Build or change an MCP server for agents: tool budget, scoping, names, descriptions, schemas,
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

- **At most about 20 tools and about 8,000 tokens of definitions** when a client loads the server.
  Tool selection degrades past 30 to 50 tools, and claude.ai loads a connector whole: every
  definition, every turn. Measure it: `node scripts/tool-budget.mjs <tools.json | --url ...>`.
- **Design from the agent's jobs, not the endpoints.** List the ten questions an agent asks the
  product and the five things it does. One tool per job; chain steps inside the tool when the agent
  would always chain them (`references/tools.md`).
- **Past about 300 operations, think code mode** (`search` + `execute` over the API spec, in a
  sandbox), and accept that it cannot be listed in ChatGPT's directory.

## 2. Scoping: one URL, a small surface

A listed server has one URL, and the person who connects it chooses nothing. So the default URL
serves every tool the listing claims, and the savings come from the definitions and the answers
(`references/scoping.md` has the client matrix and the reasons):

1. **Smaller definitions**: schemas are usually most of the size; descriptions lead with a first
   line under about 200 characters and stay under 500.
2. **Smaller answers**: bounded lists, a cursor, a `detail` selector (section 4).
3. **Help the clients that search**: instructions that say when to search for these tools, shared
   resource prefixes, `_meta["anthropic/alwaysLoad"]` on the three to five starting tools only.
4. **Fewer tools where the job is one**, merged in one batch because a rename resets approvals.
5. **Scopes decide permission**: a read grant lists no write tool.

Never a runtime "enable toolset" tool, a default URL that serves a subset, or a search tool with a
generic executor standing in for listed tools: OpenAI's guidelines (6.2b) reject the last, and it
hides writes from per-tool approval. URL-selected toolsets are an opt-in for clients the person
configures, never the default.

## 3. Each tool

`references/tools.md`, with good and bad examples:

- **Names** `<resource>_<verb>` in snake_case, at most 64 characters, one verb per action across
  the server (`list`, `get`, `create`, `update`, `delete`, `search`, `run`).
- **Title** a verb and object label, set as `title` and as `annotations.title` from one source.
- **Description**: the first sentence, under about 200 characters, says what it does to which
  object and what it returns, in the user's words (truncating clients and tool search read the
  start). Then the one thing that
  changes how it is called: when a sibling is the right tool, the cost, the limit. Under 500
  characters; no implementation detail, no orders to the model.
- **Inputs**: flat primitives, enums for closed sets, formats and defaults in the schema,
  unambiguous names (`invoice_id`, not `id` beside three other ids). Reuse the REST schemas, minus
  any field the operation does not need, and publish no keyword a provider rejects.
- **Annotations** on every tool, all four hints set explicitly; the spec's defaults assume the
  worst (destructive, open world). Read them the strict way OpenAI's review does: a paid or
  work-starting read is not read-only, an update is destructive. One risk level per tool: never a
  read and a write behind a `method` parameter.

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
rules that span tools and when to search for them, never "read resource X first"; resources for data a
person points at, prompts for workflows that string existing tools.

## 6. Prove it

`references/testing.md`:

- **A contract test** snapshots every tool's name, title, annotations and schema, and
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
