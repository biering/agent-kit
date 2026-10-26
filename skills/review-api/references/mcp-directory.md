# Connector-directory readiness

What Anthropic's **Connectors Directory** requires of a remote MCP server, and the traps that pass
every local test and still come back flagged in review.

Treat this as **pass/fail compliance**, not a quality axis. A surface can score 9/10 on Group B and
still be rejected, because these are contract checks, not taste. Score quality in the rubric;
report readiness as the checklist at the bottom.

Sources: [Submitting to the Connectors Directory](https://claude.com/docs/connectors/building/submission),
[Anthropic Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
Verify against the live portal before quoting a limit (see the last section).

## Hard requirements

| # | Requirement | Where to look |
|---|---|---|
| 1 | Every tool carries a **`title`** and the applicable **`readOnlyHint`** / **`destructiveHint`** | the tool metadata or registration |
| 2 | Tool names **≤ 64 characters** | the tool-name registry or registrations |
| 3 | Descriptions are narrow, unambiguous, and **match actual behavior**: no promised-but-absent features | each tool's description against its handler |
| 4 | Authenticated servers use **OAuth 2.0** with certificates from recognized authorities | the authorization server |
| 5 | **Streamable HTTP** transport (SSE is accepted today but being phased out) | the MCP HTTP handler |
| 6 | Errors are **handled gracefully with actionable feedback**, never a generic failure | the shared tool-error helper |
| 7 | **Token frugality**: response size fits the task, with a way to exclude filler | per-tool response shaping |
| 8 | Public **privacy policy**, **documentation**, and a **support contact** | listing fields, not code |
| 9 | A **test account with sample data** a reviewer can drive end to end | provisioning, not code |
| 10 | **Proof of ownership** of every connected API, domain, and declared link URI | listing fields |

## Traps

### `annotations.title` is not `Tool.title`

MCP resolves a display name as **`title` > `annotations.title` > `name`**, so the top-level field
is the one clients render and the spec prefers. **The directory review tool reads
`annotations.title` instead.** A server that sets only the top-level field renders its titles
perfectly in the submission portal and still carries "Missing title annotation. Add
annotations.title" on every tool.

Set both from one source so they cannot drift, and hold it with a contract test that asserts
`annotations.title === tool.title` for every registered tool:

```ts
const { title, annotations } = TOOL_META[name]
return { title, annotations: { ...annotations, title }, ...config }
```

### A read-only-looking tool that writes

`readOnlyHint: true` is a promise about state, not about cost. A tool that persists a run by
default is a write even when the caller thinks of it as a query. The inverse exists too: an export
that mutates nothing may still be write-gated for cost. Annotation follows **state**, gating
follows **cost**, and the two may disagree as long as the reason is written down.

### A tier-gated surface shown to an ungated reviewer

Tools registered conditionally (subscription tier, a write flag, an internal-only client) mean the
reviewer's account decides the tool list they see. A reviewer on a free account sees a surface
that does not match the listing, which reads as an inaccurate description. Provision the test
account at the tier that exposes everything the listing claims.

### Per-user connector URLs are credentials

A path-token connector URL (`/mcp/c/<token>`) embeds a bearer credential. It belongs in a private
custom connector, never in a public submission, where the token would be published with the
listing. Submit the shared OAuth endpoint and let the authorization server resolve identity.

### Connection instructions that reach past the tools

The reviewer reads the `instructions` string the server sends at `initialize`, not only the tool
list. Two kinds of line get a submission sent back:

- **"Read resource X once per session."** Guidance fetched at runtime can change how the model acts
  outside the reviewed tool descriptions. A fact the model needs goes into the description of the
  tool it is about. A tool that returns user-authored text is described as returning the person's
  own data, never as something to load and follow.
- **"Use the report tool when you find a bug."** A tool that sends anything to the vendor is called
  only when the person asks. Its description says what is sent and to whom, and its schema requests
  no images or session content.

The same string usually goes to every transport, so it names the signed-in account and no
transport (no path-token URL, no internal endpoint). Error hints follow the same rule. Keep the
string to rules that span several tools, put single-tool facts on their tools, and model workflows
as prompts that string existing tools together, with no document to read and nothing done for the
vendor unasked. Hold it with a contract test over the instructions, every tool description a
client receives, and every prompt.

## Where the docs and the portal disagree

The published docs and the live form drift. Observed 2026-09-25: the docs gave the tagline a
**55-character** cap while the portal's one-liner field counted to **200**. The portal wins: read
the live counter before writing to a limit.

## Readiness checklist

Report each as pass, fail or n/a with a citation. Anything failing is a submission blocker, listed
above the scorecard, not inside it.

- [ ] Every tool has `annotations.title` **and** `title`
- [ ] Every tool has `readOnlyHint` or `destructiveHint`, and it matches what the handler does
- [ ] No tool name exceeds 64 characters
- [ ] No description promises behavior the handler does not implement
- [ ] Connection instructions describe tools only: no "read this resource" line, no unprompted action for the vendor, sign-in described as the listing declares it
- [ ] A tool that sends data to the vendor is called only on request and says what it sends
- [ ] The server offers no document resource for a model to read, and every prompt names only tools that exist
- [ ] Transport is streamable HTTP
- [ ] Unauthenticated request returns `401` + `WWW-Authenticate` with `resource_metadata`
- [ ] Protected-resource metadata resolves and names a reachable authorization server
- [ ] Authorization server advertises PKCE, and DCR if the listing relies on it
- [ ] Errors are structured and actionable
- [ ] Privacy policy, documentation, and support contact URLs all resolve publicly
- [ ] The reviewer test account is provisioned at a tier that exposes the full listed surface
