# Description and title style (REST + MCP)

The reader of a title or description is the **API consumer**: someone deciding whether this is the
endpoint or tool they want and how to call it. Write for them, not for the maintainer. This applies
to OpenAPI `summary` and `description` and to MCP tool `title` and `description`.

## Titles and OpenAPI `summary`: a label, not a sentence

- **Concise verb + object.** "Get document", "Delete task", "List projects", "Create project".
- **No qualifiers or implementation in the title.** It names the resource and the action. Detail
  goes in the description and parameters.
- Keep each surface's existing casing (MCP titles often Title Case, HTTP summaries sentence case).

| Bad title | Good title | Why |
|---|---|---|
| "Retrieve status and text from a document" | "Get document" | "status and text" belongs in the description |
| "Re-run structured extraction for a document" | "Extract document" | drop the qualifier |
| "Soft-Delete Task" | "Delete task" | "soft" is an implementation detail |
| "Get Document Job" | "Get document" | the caller asks for a document, not a job |

## Descriptions: concise, concrete, consumer-oriented

One to three sentences. Say what it does and what the caller gets back, and name the inputs that
matter.

- **Concrete over vague.** Name the fields the caller acts on ("returns `run_id` when persisted"),
  not "handles the screening logic".
- **Keep behavior that changes how the caller uses it.** "Changing the type re-runs extraction",
  "idempotent on (user, external_id)", "returns 202 and a job to poll".
- **Cut what is only about how it is built or stored.** It does not change how the endpoint is
  called.

### Cut list: details irrelevant to the API user

- **DB mechanics:** soft delete, `is_deleted=true`, rows, column names, RLS, upsert.
- **Storage and infra:** blob paths, internal service names, workflow-engine ids, queue names,
  "best-effort cleanup".
- **Mechanism the API does not expose:** "recoverable" when there is no undelete endpoint,
  "cascade via FK constraints".
- **Aspirational:** "reserved for future", "may be added later", "not patchable yet".
- **Redundant identity:** never restate the method and path inside an endpoint's own description;
  never cite the backing HTTP route inside an MCP tool description (the tool name and params are
  the interface). Keep meaningful relationships between tools, such as "same result as `jobs_get`".

### Examples

| Bad description | Good description |
|---|---|
| "Soft-delete a task by numeric id (sets is_deleted=true; recoverable), DELETE /api/v1/tasks/{id}." | "Delete a task by id." |
| "Delete a document. Removes links and other FK references via database constraints. Irreversible; blob cleanup is best-effort." | "Delete a document and everything derived from it. Cannot be undone." |
| "Poll the import job by job_id (workflow-engine id); result.record_id is the imported record." | "Get the status and result of an import job. When complete, returns the imported `record_id`." |
| "Patch document metadata (PATCH /api/v1/documents/{id})." | "Update a document's name, type, or folder. Changing the type re-runs extraction." |

## Nitro gotcha: `defineRouteMeta` keeps inline literals only

In Nitro, the `openAPI` object inside `defineRouteMeta({ openAPI: {...} })` is evaluated by a
**build-time macro that preserves only inline literals**. Imported constants, imported spreads
(`...SHARED_HEADER_PARAMETERS`) and function calls (`paginatedResponseSchema(...)`) are **silently
stripped** from the emitted spec: params vanish, response schemas become `{}`, response codes
disappear, and anything generated from the spec breaks with no TypeScript error. Write params,
response schemas and response-code entries as inline object literals in each route. Verify by
reading the emitted or served spec (`/_openapi.json`), never by typecheck alone. The repo doc names
its export or regenerate command.

## Quick test before shipping a description

1. Would the caller behave differently if this sentence were removed? No: cut it.
2. Does it describe how it was built rather than how to use it? Yes: cut it.
3. Is the title a label a human would scan in a list? A sentence: shorten it.
