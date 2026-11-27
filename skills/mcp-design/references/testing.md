# Tests, evals and versioning

## Contract test (every server)

One test snapshots the surface a client receives and fails on drift. Build the server in memory
for each credential kind, call `tools/list`, and assert:

- the exact tool names per credential kind, in order;
- every tool has `title`, `annotations.title === title`, and all four hints set;
- read tools are `readOnlyHint: true`; nothing a read grant sees is a write;
- names at most 64 characters, descriptions under the repo's cap (500 by default), the served
  list under its budget (tool count and estimated tokens: `scripts/tool-budget.mjs`);
- every published schema is portable: no lookaround in a `pattern`, no `$ref` into `$defs`
  (one provider rejecting one keyword fails the whole list, not the one tool);
- every tool named in `instructions`, a prompt or another tool's description exists for the
  credentials that receive it;
- every public read route maps to a tool or to a written reason it has none, so REST and MCP
  parity is decided when the route is written;
- data tools declare `outputSchema` and a sample call conforms to it;
- the 401 carries `WWW-Authenticate` with `resource_metadata`; a missing scope is a 403 naming it.

Write the expectations as literals, not derived from the code under test. An intended change
updates the snapshot in the same PR, so the diff shows the surface change to the reviewer.

## Evals (before and after changing tools)

Descriptions and schemas are prompts; test them like prompts. Anthropic's loop, and
Neon's report of a 60% to 100% pass rate from rewriting descriptions alone, both say the same:
measure, read transcripts, rewrite.

1. **Tasks**: 10 to 30 realistic requests a user would give an agent, many needing several calls,
   each with a checkable outcome (a number, a record that exists afterwards, a state unchanged).
   Include ones that need a rarely used tool, and ones where the right answer is "I
   cannot" or "ask the human".
2. **Run** them through a real agent loop (the client you target, or the API with the same tool
   list), several trials each.
3. **Track** success, tool calls per task, tokens, wrong-tool picks, invalid-argument errors,
   unsafe calls (a write when a read would do).
4. **Read the transcripts.** Many redundant calls: fix pagination or consolidate. Many invalid
   arguments: fix the parameter descriptions or add examples. Wrong tool: sharpen the first
   sentence or merge the pair.
5. **Hold out** a third of the tasks so the descriptions do not overfit.

Run the evals when a description, a schema or the tool list changes, and keep the results with
the PR.

## Versioning

Agents and their saved prompts depend on names and shapes. Change additively.

- **Adding** a tool, an optional input or a result field: free.
- **Renaming** a tool: register the new name, keep the old as an alias whose title ends in
  "(Deprecated)" and whose description names the replacement, for a stated window (GitHub and
  Sentry both keep aliases). The spec itself keeps a 12-month deprecation window.
- **Changing** a type, removing a field, tightening an input: a breaking change. Bump the server
  `version`, write it in the changelog, and for a public server announce the date first.
- Structured output behind a protocol version: return `structuredContent` to clients on the
  version that supports it, text to older ones (GitHub does this for 2026-07-28).
