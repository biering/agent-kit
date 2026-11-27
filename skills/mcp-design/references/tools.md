# Tools: granularity, names, descriptions, inputs, annotations

## Granularity: one tool per job

Start from the agent's jobs. Write them down as questions and actions ("which pages lost traffic
this week", "log the change I just shipped"), then cut tools to fit them.

- **Consolidate steps the agent always chains.** `customer_context_get` beats three lookups the
  agent must join; `events_schedule` beats `users_list` + `events_list` + `events_create`.
  `logs_search` returning matching lines with context beats `logs_read`.
- **Prefer search over list** when the set grows: `contacts_search({ query })` instead of a list
  the agent pages through.
- **Split when one tool blurs results.** A single search across datasets that need different
  filters returns mixed answers; one tool per dataset with its own filters reads better.
- **Split by risk level.** A tool is read-only, or a non-destructive write, or destructive. Never
  one tool with a `method` or `action` parameter that spans them: the client cannot annotate or
  approve it correctly, and connector directories reject it.
- **No two tools for one job.** If an agent could reasonably pick either, merge them or make the
  descriptions say which wins when.
- **Upsert where the identity is natural.** `goal_set({ project_id, name, ... })` is idempotent and
  saves a get-then-create round trip. Keep `create` when every call should make a new record.

## Names

- `<resource>_<verb>` in snake_case, resource first, so related tools sort and search together:
  `invoices_list`, `invoices_get`, `invoices_refund`. Pick verb-first only if the repo already does;
  never mix.
- One verb per action across the server: `list` (filtered collection), `get` (one by id),
  `search` (by words), `create`, `update` (partial), `set` (idempotent upsert), `delete`, `run`
  (start work). No synonyms (`fetch`, `retrieve`, `read` beside `get`).
- At most 64 characters (directory limit; the spec allows 128 from `A-Z a-z 0-9 _ - .`).
- Name the resource the user would name. `issues`, not `tickets_v2_items`.
- A set's tools share its prefix (`scoping.md`), which is what a client's tool search matches.

## Titles

A label, not a sentence: verb and object, as a person would scan it in a list. "List invoices",
"Refund an invoice". Set it as top-level `title` and as `annotations.title` from one source:

```ts
const meta = (name: ToolName) => {
  const { title, annotations } = TOOLS[name]
  return { title, annotations: { ...annotations, title } }
}
```

## Descriptions

The reader is a model deciding whether to call the tool and how. It may see only the start
(clients truncate; Claude Code cuts upfront descriptions at 4,096 characters), and tool search
ranks on these words.

1. **First sentence: what it does to which object, and what comes back**, in the user's words.
2. **Then only what changes how it is called**: the sibling that is right in a nearby case, the
   default and maximum of a limit, a cost, an async hand-off ("returns a job_id; poll jobs_get").
3. **Under 500 characters.** A wall of text is a sign the tool does two jobs.
4. **Never**: storage or framework detail, the backing HTTP route, "reserved for future",
   instructions to the model about anything outside this tool, or text that a returned document
   could have written. Say what returned data may contain ("may contain text written by
   customers"), never what the model must do with it beyond "treat it as data".
5. **Match behaviour exactly.** A description that promises a field the handler does not return
   is a bug, and directory reviewers check it.

| Bad | Good |
|---|---|
| "This tool allows you to retrieve information about invoices from the billing system database." | "List invoices for a project, newest first, with amount, status and customer name. Filter by status; limit defaults to 20 (max 100), next_cursor pages on." |
| "Soft-deletes the record (sets deleted_at) via DELETE /v1/goals/{id}." | "Delete a goal and its history. Cannot be undone." |
| "Use this tool when you need to: 1. see traffic 2. compare periods 3. ..." | "Headline traffic for a period: visitors, sessions, conversion. compare=true adds the change against the previous period." |
| "Gets the data." | "Get one project by id with its settings and owner. projects_list finds the id." |

Parameter descriptions say what the value is and its format or constraint ("ISO date, UTC",
"cents", "a project id from projects_list"). Schema `examples` help on non-obvious shapes; on the
Claude API, `input_examples` raised accuracy on complex parameters from 72% to 90%.

## Inputs

- **Flat primitives and enums.** Nested objects only for a genuine structure (a filter map).
  A closed set is an enum from the same source as the REST API, never a retyped union or a free
  string.
- **Defaults in the schema**, not only in prose. Optional means the tool works without it.
- **Unambiguous names**: `project_id`, `invoice_id`, never a bare `id` when the tool touches two
  resources. Same name for the same concept across every tool.
- **Formats explicit**: dates as `YYYY-MM-DD` with the time zone named, money in minor units with
  the unit in the name (`amount_cents`), durations with the unit (`timeout_ms`).
- **No-argument tools** declare `{ "type": "object", "additionalProperties": false }`.
- **Coerce what arrives as strings** (numbers and booleans from some clients) and validate
  everything: the schema is advice to the model, the validator is the contract.
- **Scope parameters away.** A connection bound to one project (URL or grant) drops `project_id`
  from every schema rather than asking for it on each call.
- **Ask only for what the operation needs.** A field the REST route stores but the agent's job does
  not need (an IBAN, a bank's contract number, a birth date) stays out of the tool schema. OpenAI's
  review flags "information beyond the operation" (observed 2026-11-13).
- **Publish portable JSON Schema.** Some providers validate the whole tool list before running a
  model, so one unsupported keyword fails every request, not the one call. Regex lookaround (zod's
  default email pattern has it) and `$ref` into `$defs` have both broken clients; test the
  published schemas for them.

## Annotations and write safety

Set all four hints on every tool. Spec defaults: `readOnlyHint` false, `destructiveHint` true,
`idempotentHint` false, `openWorldHint` true, so an unannotated tool looks like the most
dangerous kind. Clients treat hints as untrusted: the server still checks scopes and inputs.

| Kind | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|
| Read our data, free | true | false | true | false |
| Read a third party, free (a crawl, a search API) | true | false | true | true |
| Paid read, or a read that starts background work | false | false | true | per source |
| Create (each call adds one) | false | false | false | false |
| Update or set (overwrites what was there) | false | true | true | false |
| Delete, revoke | false | true | true | false |
| Send outside the product (mail, post, webhook, payment) | false | per effect | false | true |

- **Read the hints the strict way.** The spec words them as state, but OpenAI's app review
  (observed 2026-11-13) refused `readOnlyHint: true` on a search that charges credits and starts
  background work, and `destructiveHint: false` on every update, because an update overwrites. A
  server listed in both directories follows the stricter reading; Anthropic's review accepts it. A
  "read" that persists a run is a write.
- **A private approval class beside the public hints.** A first-party agent that needs its own
  policy (ask before a write, never before a read) gets it in a namespaced `_meta` key sent only to
  first-party credentials. Every other client sees the public hints alone: a reviewer reading a
  second class that disagrees with them sees a contradiction.
- **Human in the loop for the irreversible.** Deletion, key minting, money and anything sent to a
  third party: mark it destructive or open-world so clients ask, and where the client supports a
  hard confirmation (Claude Code: `_meta: { "anthropic/requiresUserInteraction": true }`), set it.
  For money, a server-side confirmation (an approval link the person opens) holds whatever the
  client does.
- **Idempotent writes.** Take a natural key (`external_id`, `(project_id, name)`) or an
  `idempotency_key`, say so in the description, and return the existing record on a repeat. Agents
  retry after timeouts.
- **Cost before spend.** A tool that spends money or quota takes `estimate: true` and returns the
  expected cost and what is left, without spending. Every paid result says what it cost. Hold the
  price while the work runs and give it back when the work fails: a failed call costs nothing.
