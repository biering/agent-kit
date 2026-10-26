# The evidence pack

What the orchestrator hands the gate for one finding or one PR. It carries facts and their
sources. It carries no adjectives, no priority, no severity label, and none of the proposer's
sentences about why the item matters.

```markdown
### <id>: <what is wrong or what the PR changes, as a plain statement of behaviour>

- **Surface:** app, route or package; which row of the value model's usage table
- **Who can meet or trigger it:** every visitor / signed-in user / paying user on plan X / only
  the account's owner / only staff
- **Reach:** <count> distinct users in <period> (<file or query>, <date>) | unknown
- **Observed:** what happens, with the reproduction: test path, recording, error id, ticket ids
- **Customer voice:** customer-request ticket ids, cancel reasons that name it | none
- **Change:** <lines> lines in <n> files; systems touched; migration yes/no; changes a number or
  a behaviour customers see: which
- **Needs from the owner:** a migration applied / a decision on <question> / nothing
- **Not verified:** what the fix or the finding rests on that nobody checked
- **Checks:** CI state; mergeable; stacked on <PR>
```

Rules for building it:

- Write the first line yourself from the diff or the reproduction. Titles argue, so leave the PR
  and ticket titles out.
- Reach comes from the value model, a newer audit, or a read-only aggregate query. When the
  surface is not in the model, find the event in the repo's event catalog and count it; when that
  is not possible, write "unknown".
- For a loss-lane item, "who can trigger it" is the reach. Say whether a stranger needs to know an
  id, and whether ids can be listed.
- Copy "Not verified" from the PR body as written.
- Keep each pack under 15 lines. The gate reads the diff itself when it needs more.
