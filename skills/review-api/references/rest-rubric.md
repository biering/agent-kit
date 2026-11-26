# REST scoring rubric

The HTTP surface gets its own score: each dimension **0 to 10**, weights summing to 100, REST score
= Σ(score × weight) / 100, reported as **/10**. The MCP surface is scored the same way in
`mcp-rubric.md`. The anchors and grade bands below apply to both.

Anchor scale for every dimension:

- **0 to 2**: absent or actively harmful; violates the principle across the surface.
- **3 to 4**: present but wrong more often than right; no shared convention.
- **5 to 6**: inconsistent; a convention exists but is unevenly applied, with notable offenders.
- **7 to 8**: solid and mostly consistent; a few minor gaps.
- **9 to 10**: exemplary and uniform; would pass a strict external API review.

Grade bands (overall /10): **9.0 to 10 = A**, **8.0 to 8.9 = A−/B+**, **7.0 to 7.9 = B**,
**6.0 to 6.9 = C**, **5.0 to 5.9 = D**, **below 5.0 = F**.

---

### A1. Resource modeling and URL design (weight 15)
Nouns, not verbs; plural collections; sane nesting (`/projects/{id}/tasks`); consistent path
casing; action segments (`/orders/{id}/cancel`) reserved for genuine non-CRUD operations and named
consistently. Deduct for verbs where a resource would do, mixed singular and plural, nesting deeper
than 2 levels, or inconsistent action naming.

### A2. HTTP method semantics and idempotency (weight 12)
GET safe and side-effect-free; POST for creation and actions; PATCH partial; PUT an idempotent full
replace; DELETE idempotent. Deduct for GETs that mutate, POST used for reads, PATCH that is not
partial, or missing idempotency where the operation implies it.

### A3. Status codes and headers (weight 12)
Correct 2xx (200, 201 with `Location`, 202 for async, 204 for no content); precise 4xx (400, 401,
403, 404, 409, 413, 415, 422); 5xx only for server faults; `Location` on 201 and 202. Check that the
async convention (202, job id, `Location`, poll the job) covers every long-running operation, not
just some.

### A4. Request and response shape consistency (weight 12)
One casing convention across payloads (pick the repo's and measure adherence); one field name per
concept (`document_id` everywhere, never `docId` sometimes); one collection envelope (bare array or
`{ data, ... }`); consistent id and timestamp formats. Deduct per divergence class, not per
occurrence.

### A5. Error handling (weight 12)
One error format across the surface (ideally RFC 9457 problem+json, at least a uniform
`{ statusCode, message, data? }`); machine-readable codes; validation errors with field-level
detail; no internals leaked in 5xx messages. Deduct for ad-hoc shapes, string-only errors where
clients need codes, or inconsistent validation reporting.

### A6. Pagination, filtering and sorting (weight 9)
List endpoints paginate consistently (same param names, documented limits and defaults, cursor or
offset chosen deliberately); filter and sort params consistent across collections; total or next
signaled. Deduct for unbounded lists, bespoke params per endpoint, or no pagination on collections
that grow.

### A7. Versioning and compatibility (weight 8)
Coherent version-prefix discipline (`/v1`); a stated breaking-change policy; deprecations
signaled; no accidental breaking changes for existing consumers (generated client types, MCP
clients, CLIs). Deduct for version leakage, undocumented breaking changes, or mixed versioned and
unversioned public routes.

### A8. Auth and security surface (weight 10)
Auth documented per route (the security scheme plus a 401 response); public, service-key and
internal boundaries clear and correct; no secrets or PII in URLs or query strings; least privilege;
rate-limit posture noted. Deduct for undocumented auth, public routes without 401 docs, or service
routes reachable publicly. Flag, don't pen-test.

### A9. OpenAPI and documentation quality (weight 10)
The spec is complete and accurate against the handler (summary, description, tags, parameters,
request and response schemas, every status code); stable `operationId`s; examples on non-trivial
bodies. Cross-check a sample of handlers against the emitted spec for drift. Deduct for missing
schemas, stale or aspirational descriptions, missing status codes, or copied boilerplate that no
longer matches the route.

**Title and description quality** (`references/description-style.md`): `summary` is a concise
verb+object label ("Get document"), not a sentence; `description` is consumer-oriented and free of
implementation details. Deduct for verbose summaries, descriptions that leak internals (soft
delete, storage or workflow-engine mechanics, "best-effort", "reserved for future"), or that
restate the method and path.

---

## Scoring worksheet

| # | Dimension | Weight | Score /10 | Weighted (score×weight/100) |
|---|-----------|-------:|----------:|----------------------------:|
| A1 | Resource modeling and URL design | 15 | | |
| A2 | HTTP method semantics and idempotency | 12 | | |
| A3 | Status codes and headers | 12 | | |
| A4 | Request/response shape consistency | 12 | | |
| A5 | Error handling | 12 | | |
| A6 | Pagination, filtering and sorting | 9 | | |
| A7 | Versioning and compatibility | 8 | | |
| A8 | Auth and security surface | 10 | | |
| A9 | OpenAPI and documentation quality | 10 | | |
| | **Total** | **100** | | **Σ = REST score /10** |
