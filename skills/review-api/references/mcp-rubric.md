# MCP scoring rubric

The MCP surface gets its own score, **0 to 10 per dimension**, weights summing to 100, against the
rules in `../mcp-design/references/checklist.md`. Each dimension names the rule ids it scores; cite
the id with every deduction ("M5: R1 fails, `site_pages` returns every page unbounded,
`src/mcp.ts:812`"). The anchors and grade bands are the ones in `rest-rubric.md`.

Measure before you score: run `node ../mcp-design/scripts/tool-budget.mjs` on the tool list a
client receives (a saved `tools/list`, the server's tools page JSON, or `--url` against a local or
deployed server) for each credential kind. Its numbers go in the surface map.

### M1. Surface size and scoping (weight 14)
S1 to S7. The loaded list's tool count and definition tokens against the budget; lean schemas and
shared prefixes; every listed tool on the default URL; no generic executor; scopes filtering
registration; no side-effect list changes; instructions and `alwaysLoad` that help clients search.
Deduct hard for a list far over budget (2x over: at most 5; 5x over: at most 3), for a default URL
that hides listed tools, for a call-through standing in for listed tools, for write tools listed to
a read grant, and for a runtime enable-toolset tool.

### M2. Naming and taxonomy (weight 10)
N1, N2. One `<resource>_<verb>` convention and one verb per action; names that map onto the REST
resources; no two tools for one job; consolidation where the agent always chains steps; one risk
level per tool. Deduct per divergence class (mixed verb-first and resource-first, synonym verbs,
overlapping pairs), not per tool.

### M3. Titles and descriptions (weight 14)
N3, N4, N5, with `description-style.md`. Verb-and-object titles in both places; descriptions that
lead with what and what comes back, carry only what changes the call, stay under the length cap,
and match the handler. Deduct for walls of text, leaked internals, backing routes, stale or
aspirational claims, orders to the model, and descriptions that restate the name.

### M4. Input schemas and parity (weight 10)
I1 to I4. Flat, typed, enum-bound inputs from the same source as REST; one name per concept;
server-side validation; portable JSON Schema; nothing asked beyond the operation; parameters the
connection fixes dropped. Deduct for retyped enums, loose
strings where an enum exists, a bare `id` among several, and tools whose inputs diverge from the
route they wrap.

### M5. Responses and token efficiency (weight 14)
R1 to R6. Bounded lists with a cursor and a continue line; summary by default with a detail
selector; names beside ids; no row spreading; typical results small; truncation that says how to
get the rest; `structuredContent` with `outputSchema` plus the text copy on data tools; untrusted
text marked; async work as a job. Sample at least five tools' real results (tests, fixtures or a
live call) and measure them.

### M6. Errors that teach (weight 10)
E1, E2, E3. `isError` results that say what was wrong, the valid values and the next call; no
success-shaped errors; JSON-RPC errors only for protocol faults; 401, 403 and 429 shaped as the
checklist says. Read the shared error wrapper and grep for `error:` returned outside it.

### M7. Annotations and write safety (weight 14)
W1 to W5. All four hints explicit and true to the handler; idempotent writes with the key named;
human confirmation on deletion, key minting, money and anything sent outside; `estimate` on paid
tools; least-privilege defaults and a read-only option. A mutating tool marked read-only, or a
destructive one without any confirmation, caps the dimension at 4.

### M8. Protocol, instructions and auth (weight 6)
P1 to P4. Streamable HTTP and stateless behaviour; instructions short, stable and about tools only;
resources and prompts used for what they are for; OAuth resource-server rules. The directory gate
checks the contract items pass or fail; this dimension scores how well they are done.

### M9. Tests, evals and versioning (weight 8)
Q1, Q2, Q3. A contract snapshot that would catch a renamed tool, a lost annotation or a budget
overrun; evals over realistic tasks; additive changes, aliases for renames, a server version that
moves on breaking changes.

## Worksheet

| # | Dimension | Weight | Score /10 | Weighted (score x weight / 100) |
|---|---|---:|---:|---:|
| M1 | Surface size and scoping | 14 | | |
| M2 | Naming and taxonomy | 10 | | |
| M3 | Titles and descriptions | 14 | | |
| M4 | Input schemas and parity | 10 | | |
| M5 | Responses and token efficiency | 14 | | |
| M6 | Errors that teach | 10 | | |
| M7 | Annotations and write safety | 14 | | |
| M8 | Protocol, instructions and auth | 6 | | |
| M9 | Tests, evals and versioning | 8 | | |
| | **Total** | **100** | | **MCP score /10** |
