# API and MCP review: scorecard

> Deliverable skeleton. Replace every bracketed placeholder. Cite `path:line`. Delete guidance
> lines before handing over.

## 1. Executive summary

- **Overall: [X.X] / 10, grade [A to F]** (REST [X.X], MCP [X.X]; the mean of the surfaces present)
- **Reviewed:** [N] HTTP routes, [M] MCP tools ([date], branch `[branch]`).
- **Top 3 strengths (preserve):** [one line each]
- **Top 3 systemic weaknesses (themes):** [one line each: the patterns behind most deductions]

## 2. Directory readiness

> Pass/fail contract checks from `references/mcp-directory.md`. Failures are submission blockers
> and belong here, never inside the weighted score. Delete this section only if there are no MCP
> tools.

**Verdict: [ready to submit / N blockers].**

| Check | Result | Evidence |
|-------|--------|----------|
| `annotations.title` on every tool | [pass/fail] | [`path:line`] |
| `readOnlyHint`/`destructiveHint` accurate | [pass/fail] | [`path:line`] |
| Tool names ≤ 64 chars | [pass/fail] | [`path:line`] |
| Descriptions match behavior | [pass/fail] | [`path:line`] |
| Connection instructions describe tools only | [pass/fail] | [`path:line`] |
| Streamable HTTP transport | [pass/fail] | [`path:line`] |
| `401` + `WWW-Authenticate` with `resource_metadata` | [pass/fail/not verified] | [live response] |
| Protected-resource metadata resolves | [pass/fail/not verified] | [live response] |
| Authorization server advertises PKCE (+ DCR if relied on) | [pass/fail/not verified] | [live response] |
| Structured, actionable errors | [pass/fail] | [`path:line`] |
| Privacy / docs / support URLs resolve | [pass/fail] | [URLs] |
| Test account tier exposes the full listed surface | [pass/fail/n-a] | [note] |

## 3. Surface map

| Resource | HTTP operations | MCP tools | Auth class | Parity note |
|----------|-----------------|-----------|-----------|-------------|
| [projects] | [GET/POST /projects; GET/PATCH/DELETE /projects/{id}] | [projects_list, projects_get] | [api-key] | [tool with no route / route with no tool / ok] |
| | | | | |

**MCP budget** (`tool-budget.mjs`, per credential kind and selection): [N] tools, about [T] tokens of
definitions, [P] tools with problems; largest: [names].

## 4. Scorecards

### REST ([X.X] / 10)

| # | Dimension | Weight | Score /10 | Weighted |
|---|-----------|-------:|----------:|---------:|
| A1 | Resource modeling and URL design | 15 | | |
| A2 | HTTP method semantics and idempotency | 12 | | |
| A3 | Status codes and headers | 12 | | |
| A4 | Request/response shape consistency | 12 | | |
| A5 | Error handling | 12 | | |
| A6 | Pagination, filtering and sorting | 9 | | |
| A7 | Versioning and compatibility | 8 | | |
| A8 | Auth and security surface | 10 | | |
| A9 | OpenAPI and documentation quality | 10 | | |
| | **Total** | **100** | | **[X.X] / 10** |

### MCP ([X.X] / 10)

| # | Dimension | Weight | Score /10 | Weighted | Rules failed |
|---|-----------|-------:|----------:|---------:|--------------|
| M1 | Surface size and scoping | 14 | | | |
| M2 | Naming and taxonomy | 10 | | | |
| M3 | Titles and descriptions | 14 | | | |
| M4 | Input schemas and parity | 10 | | | |
| M5 | Responses and token efficiency | 14 | | | |
| M6 | Errors that teach | 10 | | | |
| M7 | Annotations and write safety | 14 | | | |
| M8 | Protocol, instructions and auth | 6 | | | |
| M9 | Tests, evals and versioning | 8 | | | |
| | **Total** | **100** | | **[X.X] / 10** | |

## 5. Per-dimension detail

### [A1] [Dimension name]: [score]/10
- **Justification:** [one line]
- **Evidence:**
  - good: [example], `path:line`
  - bad: [problem], `path:line`
- **Fixes (impact-ordered):**
  1. [concrete action naming the files], lifts to about [n]/10
  2. [next]

_(Healthy dimension: one sentence and the score.)_

## 6. Action plan

### Quick wins (under 2h each, high impact)
| Action | Dimension(s) lifted | Files | Acceptance check | Breaking? |
|--------|--------------------|-------|------------------|-----------|
| | | | | |

### Consistency passes (half a day)
| Action | Dimension(s) | Files (all offenders) | Acceptance check | Breaking? |
|--------|-------------|----------------------|------------------|-----------|
| | | | | |

### Structural (larger)
| Action | Dimension(s) | Scope | Acceptance check | Breaking? |
|--------|-------------|-------|------------------|-----------|
| | | | | |

> Flag every row that breaks existing consumers (generated clients, MCP clients and their saved
> prompts, CLIs, documented routes). Present the clean break and the back-compat option; let the user choose.

## 7. Open questions
- [Decisions for a human: versioning and deprecation policy, casing standard, error-format target,
  product intent behind odd endpoints.]
