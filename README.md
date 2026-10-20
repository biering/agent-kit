# agent-kit

The CEO agent and its tools, shared by every repo that runs one (Maelstrom,
Leverage). One source here; each repo carries a vendored copy.

| Command | What it does |
|---|---|
| `agent-kit linear setup` / `inbox` / `ask` / `task` / `issue` / … | Linear as the human-in-the-loop inbox: a "Human" label group (Blocker, Decision, Approval, Spend), a "Needs me" view filtered to the owner, one project per bet as the agents' queue |
| `agent-kit herdr ceo` / `new <slug>` / `worker <slug> --brief f` / `list` / `sync` / `cleanup` | The CEO and every topic session as herdr panes, each in its own worktree, cleaned up when finished |
| `agent-kit herdr install-cursor-hooks` | Cursor chats report their state for the control panel |
| `agent-kit ceo-schedule install` / `status` / `run` | The CEO's daily run (launchd), in its own checkout on `origin/main` |
| `agent-kit stats [--json]` | Daily numbers: Claude Code tokens and lines, Cursor's AI lines, commits on `main` |
| `agent-kit mail …` | The agents' AgentMail inbox |
| `agent-kit sync <repo>` | Vendor this kit into a repo |

`hooks/merge-gate.sh` is the Claude Code hook that holds back merges needing
the owner's decision (data structure, prices, a first launch) and blocks red
checks; a repo wires it in `.claude/settings.json`.

## Adopting it in a repo

1. Write `agent-kit.config.json` at the repo root:

   ```json
   {
     "name": "leverage",
     "linear": { "team": "LEV", "workspace": "Leverage", "owner": "Christoph" },
     "stats": { "repos": { "leverage": "." } },
     "mail": { "inbox": "leverage@agentmail.to" }
   }
   ```

   Defaults follow from `name`: the CEO checkout `../<name>-ceo`, its herdr
   agent `<name>-ceo`, sessions in `../<name>-worktrees`, launchd label
   `com.<name>.ceo` at 08:00, herdr plugin `<name>.ops`. `src/config.mjs` lists
   every key.
2. From this checkout: `node bin/agent-kit.mjs sync <repo>`. It writes
   `<repo>/vendor/agent-kit/` and `<repo>/agent-kit.lock.json` (the commit).
3. In the repo: package scripts that call `node vendor/agent-kit/bin/agent-kit.mjs <command>`,
   the merge gate in `.claude/settings.json`, a `.claude/agents/ceo.md` and an
   `ops/CEO.md` with that company's mandate and decision rights, and
   `LINEAR_API_KEY` in the root `.env`. Then `agent-kit linear setup`.

## Why vendored

The repository is private. A git dependency on it would break every CI install
that cannot reach it; a committed copy keeps each repo self-contained, and an
update is a reviewed diff (`agent-kit sync`, then a PR). Never edit
`vendor/agent-kit/` in a repo: change it here and sync.
