---
name: review-api
description: >-
  Read-only REST and MCP API review: a pass/fail connector-directory gate, then a weighted 0-10
  scorecard with path:line fixes. Use for review api, api audit, rate the api, tool descriptions,
  mcp directory readiness.
---

# API and MCP design review

Read the repo's root `AGENTS.md`, the owning app's `AGENTS.md` and `docs/agent-kit/review-api.md`
first: they say where the surface lives and which conventions it follows, and they win where they
differ from this skill.

You review an HTTP API and its MCP tool surface as a principal API designer. The output is an
evidence-based scorecard: every dimension scored 0 to 10 against fixed anchors, every finding
cited to `path:line`, every low score paired with a fix that names the file.

- **Read-only.** Change no code, spec or description during the review. Applying fixes is a
  separate task the user asks for after reading the scorecard.
- **Ground everything.** Score from the route handlers and tool registrations, never from memory
  or from the generated spec alone (the spec drifts from the handler; cross-check them). A claim
  you cannot verify lowers your confidence; it does not become a guess.
- **Score against the house conventions.** The repo's app `AGENTS.md` and API guide define them.
  A missing spec or a hand-rolled MCP handler is a finding, not a blocker.

## Find the surface

| Surface | What to locate |
|---|---|
| HTTP routes | every route handler, grouped by resource, and how it declares auth and OpenAPI metadata |
| Generated spec | the emitted `openapi.json` or the served `/_openapi.json`; never hand-edited |
| Shared schemas | the validation schemas and enums both REST and MCP import |
| MCP tools | every tool registration, its title, annotations, and any read-only default set or write gate |
| Auth | the helpers or wrapper that assign a route its auth class |

Maelstrom: `apps/<app>/api` (Nitro, H3, Zod). Leverage: `apps/api` with `defineApiHandler`. The
repo doc has the full map.

Async convention to check against unless the repo states another: a long-running operation
returns `202` with a job id and a `Location` header, and the client polls a job route or tool. No
async operations: the async sub-check is n/a, no deduction.

## Method

### Phase 0: directory readiness (pass/fail)

Run the checklist in `references/mcp-directory.md` whenever the surface exposes MCP tools. These
are contract checks, not taste: a surface can score 9 on the MCP group and still be rejected from
a connector directory. Report each as pass, fail or n/a with a citation, above the scorecard, and
never fold them into the weighted score.

Check the live server where one exists: an unauthenticated request must answer `401` with a
`WWW-Authenticate` header carrying `resource_metadata`, and that document must resolve and name a
reachable authorization server. No deployed server: mark the live checks "not verified". The most
common false pass is `annotations.title`: titles render correctly while the annotation is absent.

### Phase 1: inventory

1. Read the conventions: app `AGENTS.md`, shared OpenAPI helpers, the repo's API guide.
2. Enumerate every route file and every tool registration. Build one row per resource: HTTP verb
   and path, MCP tool names.
3. Note each route's auth class (public, user, service or secret, internal) and any declared
   feature or price gate. For MCP, note read-only versus write tools and how writes are gated.

The output is a **surface map**: resource, HTTP operations, MCP tools, auth class. It also shows
REST/MCP parity gaps (an HTTP operation with no tool, or the reverse).

### Phase 2: score each dimension

Score every dimension in `references/rest-rubric.md` with its anchors. Apply
`references/description-style.md` to the title and description dimensions (A9, B2) and
`references/mcp-directory.md` to annotations (B3). Per dimension record:

- score with a one-line justification;
- evidence: 2 to 5 `path:line` citations, good and bad;
- fixes ordered by impact, each naming the files.

Rules:

- Score consistency across the surface, not the best endpoint. One RPC-style path among 40 clean
  ones is a deduction, not a zero.
- Keep facts ("3 endpoints return snake_case, 2 camelCase") apart from judgment ("flatten the
  envelope").
- Deduct with high confidence or not at all. A clean dimension gets 9 or 10 and one sentence.
- On a borderline score, name the one change that would lift it a point.

### Phase 3: aggregate

Compute the weighted overall score with the rubric's weights and show the math. Map it to the
grade band. Name the top 3 strengths to preserve and the top 3 systemic weaknesses (themes that
explain most deductions, such as "no shared error envelope" or "handler and tool descriptions
duplicated and drifting").

### Phase 4: action plan

- **Quick wins** (high impact, under 2 hours): description streamlining, status codes, missing
  `operationId` or examples, enum reuse.
- **Consistency passes** (half a day): one error shape, pagination params, casing, the async
  pattern across every offender. List every file.
- **Structural**: resource remodeling, versioning policy, auth or scope changes.

Each item: what, which dimension it lifts and by how much, files, a one-line acceptance check.
Flag every item that breaks existing consumers (generated clients, MCP clients, CLIs, documented
routes). Present the clean break and the back-compat option and let the user choose.

## Deliverable

One document following `references/scorecard-template.md`:

1. Executive summary: score, grade, top 3 strengths and weaknesses, at most 10 sentences.
2. Directory readiness, failures first (omitted only when there are no MCP tools).
3. Surface map.
4. Scorecard table with weights and contributions.
5. Per-dimension detail: justification, evidence, fixes.
6. Action plan with breaking-change flags.
7. Open questions for a human: deprecations, versioning, product intent.

The value is in the cited deductions and the fixes. A healthy dimension is one sentence and a 9.

## Scope

- Obvious auth or secret issues get flagged; a deep security audit is a separate review.
- The skill produces the scorecard and plan; implementation is a follow-up task.
- Recommendations fit the repo's conventions and its surface size. Prefer a clean break over a
  back-compat shim only where the user agrees.
