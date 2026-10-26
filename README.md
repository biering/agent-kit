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
| `terminal/install.sh` | The shared terminal setup: Ghostty, herdr's config, the theme switch, Raycast commands for the Mac minis (`terminal/README.md`) |

`hooks/merge-gate.sh` is the Claude Code hook that holds back merges needing
the owner's decision (data structure, prices, a first launch) and blocks red
checks. By default only the CEO carries it (`ceo.gate`, passed at launch as
`--settings hooks/ceo-settings.json`, since hooks in an agent file do not run
under `claude --agent`). A repo that gates every session wires it in its own
`.claude/settings.json` and sets `"gate": false`.

## Adopting it in a repo

1. Write `agent-kit.config.json` at the repo root:

   ```json
   {
     "name": "leverage",
     "linear": { "team": "LEV", "workspace": "Leverage", "owner": "Christoph" },
     "stats": { "repos": { "leverage": "." } },
     "mail": { "inbox": "<inbox>@agentmail.to" },
     "loop": {
       "verify": "pnpm verify:local",
       "docs": "pnpm verify:docs",
       "gate": "node scripts/dev-loop.mjs status"
     }
   }
   ```

   `loop` is read by the `dev-loop` skill, not the CLI: `verify` is the local
   check before a PR, `docs` the extra one when docs or skills changed, `gate`
   an optional script that reports what the branch still owes (`null` when
   hooks do that job). Two more blocks belong to skills: `carousel` (the brands
   folder, where Playwright lives) and `ads` (the landing-page register and the
   URL pattern per brand, for `ads-landingpage`).

   Other keys: `linear.labels` folds labels another process already uses
   for "waits on the owner" into the inbox, `linear.states` names the state
   for each role (`ask`, `task`, `start`, `done`, `canceled`) where a team's
   own rules place issues, `linear.close: false` leaves closing to people, `ceo.manual` moves the operating
   manual from `ops/CEO.md`, and `bootstrap` is the repo's own preparation of a
   new checkout. Defaults follow from `name`: the CEO checkout `../<name>-ceo`, its herdr
   agent `<name>-ceo`, sessions in `../<name>-worktrees`, launchd label
   `com.<name>.ceo` at 08:00, herdr plugin `<name>.ops`. `src/config.mjs` lists
   every key.
2. From this checkout: `node bin/agent-kit.mjs sync <repo>`. It writes
   `<repo>/vendor/agent-kit/` and `<repo>/agent-kit.lock.json` (the commit).
3. In the repo: package scripts that call `node vendor/agent-kit/bin/agent-kit.mjs <command>`,
   a `.claude/agents/ceo.md` and the manual with that company's mandate and
   decision rights, and
   `LINEAR_API_KEY` in the root `.env`. Then `agent-kit linear setup`.

## Skills

`skills/<name>/SKILL.md` holds agent skills any repo can install with the
[skills CLI](https://github.com/vercel-labs/skills):

```bash
npx skills add biering/agent-kit --skill dev-loop pr ci -a claude-code codex -y
npx skills add biering/agent-kit --skill '*' -a claude-code codex -y   # all of them
npx skills update   # later: pull new versions, a reviewed diff like any other
```

| Skill | What it does |
|-------|--------------|
| Area | Skills |
|------|--------|
| Shipping | `dev-loop` (branch to green PR), `pr`, `ci`, `bugfix`, `review-code`, `review-api` |
| Harness | `improve` (a mistake becomes a guardrail), `retro` (up to three `improve` proposals) |
| Building | `scaffold` (a new app on this kit's stack, Python services included), `design`, `onboarding-review`, `workspace-chrome` |
| Copy | `unslop` (AI-sounding prose, German and English), `copywriting`, `product-changelog`, `legal-review` (DE/EU, not legal advice) |
| Growth | `aso`, `app-screenshots`, `launch-video` (with X player cards), `carousel`, `ads-landingpage`, `value-loop` |

Install only the ones a repo uses: every listed description costs room in the
harness's skill listing.

The CLI copies each skill into the repo and records its hash in
`skills-lock.json`. Never edit an installed copy: change it here and update.
A repo's own rules stay in that repo: `AGENTS.md`, the `loop` block in
`agent-kit.config.json`, and `docs/agent-kit/<skill>.md`, which every skill
reads before it acts (a repo's PR scope, its copy carve-outs, its launch
steps). Nothing a repo writes there is overwritten by `npx skills update`.

Skills that are already published upstream (coss, nuxt-ui, heroui-native,
emil-design-eng, supabase-postgres-best-practices, stripe-best-practices) are
installed from their own repositories; this kit names them and never copies
them. `skills/design/references/taste/` is the exception: it is vendored from
[Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT, licence
beside it) because the design router needs it as a reference, not a skill.
`skills/design/references/landing-page.md` adapts the strategy half of
[elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills)'
`landing-page-design` (MIT, credited there) instead of installing it: installed
whole, it claims every web UI task and sets fonts, icons and invented proof that
the repos' design systems and the taste kit rule out.

## Why vendored

A committed copy keeps each repo self-contained: CI installs never reach out to
this repository, and an update is a reviewed diff (`agent-kit sync`, then a PR).
Never edit `vendor/agent-kit/` in a repo: change it here and sync.

## This repository is public

Everything here is generic. Maelstrom and Leverage appear as examples of how a
repo fills in its config, never as the only way. Never commit secret values,
tokens, `.env` contents, real inbox addresses, customer or deal data, revenue
numbers or anything a repo keeps in its own `ops/` or findings folders. A value
that differs per repo belongs in `agent-kit.config.json`, with a placeholder
like `<inbox>` in the docs here. `npm run check` (`scripts/check-public.mjs`, also run on every
push) fails on secret-shaped values, account and project ids, private hosts, real
mailboxes and SEO-findings text anywhere in the tree.
