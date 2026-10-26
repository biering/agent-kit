# API and MCP review: scorecard

> Deliverable skeleton. Replace every bracketed placeholder. Cite `path:line`. Delete guidance
> lines before handing over.

## 1. Executive summary

- **Overall score: [X.X] / 10, grade [A to F]**
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

## 4. Scorecard

| # | Dimension | Weight | Score /10 | Weighted |
|---|-----------|-------:|----------:|---------:|
| A1 | Resource modeling and URL design | 10 | | |
| A2 | HTTP method semantics and idempotency | 8 | | |
| A3 | Status codes and headers | 8 | | |
| A4 | Request/response shape consistency | 8 | | |
| A5 | Error handling | 8 | | |
| A6 | Pagination, filtering and sorting | 6 | | |
| A7 | Versioning and compatibility | 5 | | |
| A8 | Auth and security surface | 6 | | |
| A9 | OpenAPI and documentation quality | 6 | | |
| B1 | MCP tool naming and taxonomy | 8 | | |
| B2 | MCP tool descriptions | 10 | | |
| B3 | MCP annotations and mutation safety | 9 | | |
| B4 | MCP input schemas and parity | 8 | | |
| | **Total** | **100** | | **[X.X] / 10** |

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

> Flag every row that breaks existing consumers (generated clients, MCP clients, CLIs, documented
> routes). Present the clean break and the back-compat option; let the user choose.

## 7. Open questions
- [Decisions for a human: versioning and deprecation policy, casing standard, error-format target,
  product intent behind odd endpoints.]
