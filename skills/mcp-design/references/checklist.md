# MCP server checklist

One line per rule, with the id `review-api` cites (`references/mcp-rubric.md` there). The reference
in brackets holds the reasoning and examples. A rule marked **(gate)** is also a connector-directory
requirement.

## S. Surface and scoping (`scoping.md`)

- **S1** The list a client loads has at most about 20 tools and about 8,000 tokens of definitions,
  measured with `scripts/tool-budget.mjs`; over it, the levers apply in `scoping.md`'s order.
- **S2** Schemas carry no parameter prose that restates the name and no paragraph repeated across
  sibling tools; tools of one resource share its prefix.
- **S3** The default URL serves every tool the listing claims. A URL selection (`?toolsets=`) is an
  opt-in that only narrows, rejects an unknown name with the valid list, and shares one OAuth grant.
- **S4** No generic executor: no search tool with a call-through standing in for listed tools.
  **(gate: OpenAI 6.2b)**
- **S5** Scopes decide permission and filter registration: a read grant's list holds no write
  tool.
- **S6** The list never changes as a side effect of a call (no "enable toolset" tool), comes in a
  deterministic order and carries `ttlMs` and `cacheScope`.
- **S7** The instructions say what the server is for and when to search for its tools;
  `_meta["anthropic/alwaysLoad"]` marks only the three to five tools most sessions start with.

## N. Names, titles, descriptions (`tools.md`)

- **N1** Names are `<resource>_<verb>` snake_case, one verb per action across the server, at most
  64 characters. **(gate: length)**
- **N2** One tool per job: chained steps consolidated, no two tools an agent could confuse, one
  risk level per tool. **(gate: no mixed read and write)**
- **N3** Every tool has a verb-and-object `title` and the same `annotations.title`. **(gate)**
- **N4** Descriptions: a first line under about 200 characters says what it does to which object
  and what it returns, with the words a search would use; then only what changes the call
  (sibling, limit, cost, async); under 500 characters; no implementation
  detail, no backing route, no orders to the model.
- **N5** Descriptions match behaviour: no promised field, filter or side effect the handler lacks.
  **(gate)**

## I. Inputs (`tools.md`)

- **I1** Flat primitives, enums for closed sets from the same source as the REST API, defaults in
  the schema, explicit formats and units.
- **I2** One name per concept across tools (`project_id` everywhere), never a bare `id` beside
  other ids; parameters the connection already fixes are dropped.
- **I3** Every argument is validated server-side (coercing string numbers and booleans); no-arg
  tools declare an empty object schema with `additionalProperties: false`; the published JSON
  Schema uses no keyword a provider rejects (no lookaround in a `pattern`, no `$ref` into `$defs`).
- **I4** A tool asks only for what its operation needs: no account numbers, contract numbers or
  personal data the handler does not use. **(gate: OpenAI)**

## R. Responses (`responses.md`)

- **R1** Lists take `limit` (default and maximum) and return `next_cursor` with how to continue;
  nothing unbounded.
- **R2** Summary by default, `detail` or `fields` for more; names beside ids; fields mapped
  explicitly, no row spreading, no filler.
- **R3** Typical results under about 2,000 tokens, none near 25,000; truncation says what was cut
  and the call that gets the rest. **(gate: token frugality)**
- **R4** Data tools return `structuredContent` with a declared `outputSchema` and the same JSON as
  text.
- **R5** Untrusted text (customer-written, crawled, third-party) is returned as marked data and
  the description says so.
- **R6** Long work returns a `job_id` and a poll tool (or Tasks) instead of blocking.

## E. Errors (`responses.md`)

- **E1** Tool failures are `isError: true` results saying what was wrong, the valid values or
  state, and the next call; a refusal for plan, quota or rate carries a machine-readable code, the
  numbers and whether a retry can pass. **(gate)**
- **E2** No success-shaped errors (`{ "error": ... }` without `isError`); JSON-RPC errors only for
  protocol faults; no internals or stack traces.
- **E3** 401 with `WWW-Authenticate` and `resource_metadata`; 403 `insufficient_scope` naming every
  needed scope; 429 with the wait. **(gate: 401)**

## W. Writes and safety (`tools.md`)

- **W1** All four annotation hints set explicitly on every tool and true to the handler, read the
  strict way: a tool that charges or starts background work is not read-only, an update that
  overwrites is destructive. **(gate)**
- **W2** Writes are idempotent on a natural key or an idempotency key, and the description says
  which.
- **W3** Deletion, key minting, money and anything sent outside the product ask a human (hints,
  plus a hard confirmation where the client supports it or a server-side approval for money).
- **W4** Tools that spend take `estimate: true` and every paid result reports its cost and what
  is left.
- **W5** Default grants are least privilege; a read-only selector or grant exists.

## P. Protocol and onboarding (`protocol.md`)

- **P1** Streamable HTTP, stateless; GET and DELETE answered 405 when no stream is offered.
  **(gate)**
- **P2** Instructions under about 1,500 characters, identical every session, describing tools
  only: no "read resource X", no unrequested reports to the vendor. **(gate)**
- **P3** Resources are data a person attaches; prompts string existing tools and fetch nothing.
- **P4** OAuth 2.1 resource server: protected-resource metadata, PKCE, audience checked against
  the canonical URL, no token in a URL, rate limit per credential.

## Q. Quality (`testing.md`)

- **Q1** A contract test snapshots names, titles, annotations and schemas and checks the
  budgets in S1 and N4.
- **Q2** Evals of realistic tasks run when descriptions, schemas or the tool list change; results kept
  with the PR.
- **Q3** Changes are additive; renames keep a "(Deprecated)" alias for a stated window; breaking
  changes bump the server version and the changelog.
