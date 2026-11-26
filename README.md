# agent-kit

The CEO agent and its tools, shared by every repo that runs one (Maelstrom,
Leverage). One source here; each repo carries a vendored copy. The skills
install is the prompt under [Install prompt](#install-prompt). Paste it to an
agent in the repo.

| Command | What it does |
|---|---|
| `agent-kit linear setup` / `inbox` / `ask` / `task` / `issue` / … | Linear as the human-in-the-loop inbox: a "Human" label group (Blocker, Decision, Approval, Spend), a "Needs me" view filtered to the owner, one project per bet as the agents' queue |
| `agent-kit herdr ceo` / `new <slug>` / `worker <slug> --brief f` / `list` / `sync` / `cleanup` | The CEO and every topic session as herdr panes, each in its own worktree, cleaned up when finished, and closed when their checkout is gone; the plugin re-syncs PR, CI and issue on every agent status change, at most once a minute |
| `agent-kit herdr open-link <url>` | A ctrl+click on this repo's PR or Linear issue link in herdr: the session working on it, else the browser (the plugin's link handlers) |
| `agent-kit review` / `review pane` / `prs` / `approve <id>` / `back <id> <text>` / `annotate <id>` | Everything that waits for the owner, across repos: the herdr **Waiting for you** pane (`prefix+y`) with designs to approve (approve to build, send back) and PRs to approve on GitHub (Design review and Waiting for you below) |
| `agent-kit herdr install-cursor-hooks` | Cursor chats report their state for the control panel |
| `agent-kit ceo-schedule install` / `status` / `run` | The CEO's daily run (launchd), in its own checkout on `origin/main` |
| `agent-kit stats [--json]` | Daily numbers: Claude Code tokens and lines, Cursor's AI lines, commits on `main` |
| `agent-kit mail …` | The agents' AgentMail inbox |
| `agent-kit migrations [--base origin/main] [--all] [--json]` | Checks every schema file changed against the base by the `data-schema` rules and names the reference and official skill each one needs; exit 1 on a failure |
| `agent-kit sync <repo>` | Vendor this kit into a repo |
| `terminal/install.sh` | The shared terminal setup: Ghostty, herdr's config, the theme switch, Raycast commands for the Mac minis (`terminal/README.md`) |

`hooks/merge-gate.sh` is the Claude Code hook that holds back merges needing
the owner's decision (data structure, prices, a first launch) and blocks red
checks. It looks the PR up in its own repo (the one in a full PR URL, else `-R`/`--repo`,
else the current directory's remote) and only acts on a real `gh pr merge`, not on text that
mentions one (`hooks/merge-gate-parse.mjs` reads the command). By default only the CEO carries it (`ceo.gate`, passed at launch as
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
   hooks do that job). Three more blocks belong to skills: `carousel` (the brands
   folder, where Playwright lives), `ads` (the landing-page register and the
   URL pattern per brand, for `ads-landingpage`) and `unslop` (`voice`, the
   repo's voice file, default `docs/agent-kit/voice.md`).

   `daylog` is read by `agent-kit daylog collect` and the `daily-log` skill:

   ```json
   "daylog": {
     "log": "docs/daily-log",
     "decisions": "docs/decisions.md",
     "board": "../work-board/tasks",
     "extra": [{ "label": "Experiments", "file": "docs/experiments.md" }],
     "budgetTokens": 6000
   }
   ```

   `log` is where the skill writes `YYYY-MM-DD.md`. `decisions` is a file whose rows added
   that day go into the digest. `board` is a folder of `<name>/<n>/task.json` (+ `closing.md`)
   for finished, failed or stopped tasks and the owner's quoted words. `extra` adds a file (its
   lines added that day) or `{ "label", "cmd": [...] }` (a command's first lines). All optional;
   PRs and CI come from `gh`. `node bin/agent-kit.mjs daylog collect [--date YYYY-MM-DD] [--budget N]`
   prints the UTC day, capped (default 6000 tokens) with a `Cut for size` note.

   **Stats block.** With `daylog.stats`, `collect` leads with a `## Stats` section that the skill copies
   verbatim above the day's entries: facts for a writer outside the repo, never post text. Per product it
   has the day's visitors, sign-ups, revenue, refunds, fees, profit and any counters, each with its source
   and as-of time, the change against the day before and the running total; for a challenge, `day N of M`
   and the score. A number that cannot be read is `not measured: <reason>`, never a guess. Only totals
   are printed (no customer, no single payment).

   ```json
   "daylog": {
     "stats": {
       "analytics": {
         "url": "https://analytics.example.com/api/sites/{site}/summary?date={date}",
         "tokenEnv": "ANALYTICS_TOKEN",
         "fields": { "visitors": "data.visitors", "signups": "data.signups" },
         "asOfPath": "data.updatedAt"
       },
       "products": [
         {
           "name": "Example App",
           "site": "site-id-from-the-analytics-tool",
           "revenue": { "provider": "stripe", "keyEnv": "PAYMENTS_READONLY_KEY", "currency": "usd" },
           "counters": [{ "name": "Apps shipped", "url": "https://example.com/api/count", "path": "count" }]
         }
       ],
       "challenge": {
         "name": "Ten days of shipping", "start": "2026-11-05", "end": "2026-11-14", "product": "Example App",
         "score": { "label": "Points", "formula": "visitors / 10 + signups * 5 + profit" }
       }
     }
   }
   ```

   - **Secrets** are never in the config: `tokenEnv` / `keyEnv` name an environment variable (a
     read-only key for the payment provider), and a literal `token`, `key` or `secret` is refused.
   - **Sources** (`analytics`, `revenue`, a counter) are one of: `url` (JSON over GET, `{site}`, `{date}`,
     `{prev}`, `{next}`, `{startMs}`, `{endMs}` filled in; `tokenHeader` and `tokenScheme` default to
     `Authorization` and `Bearer`), `cmd` (a command that prints JSON), or `mcp` (`{ "server", "tool", "args" }`).
     `fields` maps a metric to a path in the JSON (`a.b[0].c`); give `{ "path", "totalPath" }` to take the
     running total from the source. A product may override `analytics` and sets its `site`.
   - **Revenue** `{ "provider": "stripe" }` sums the day's balance transactions (revenue, refunds, fees;
     profit = revenue − refunds − fees) in `currency`, up to `maxPages` x 100 transactions (default 10),
     and says `not measured` past that. Any other provider: a `url` or `cmd` source with `fields` for
     `revenue`, `refunds`, `fees` and optionally `profit` (derived when all three are given), and
     `scale` (100 when it reports minor units).
   - **MCP sources** cannot be called by the command. The first run lists them under `## MCP reads needed`;
     the agent calls each tool once, saves `{"<key>": <result>}` and runs `collect --mcp <file>` again.
   - **Counters** are `{ "name", "url" | "cmd" | "mcp", "path" }`; `"kind": "gauge"` marks a running figure
     (a follower count): its change is against the day before's figure.
   - **Calls:** one per source per run, cached by URL or command; the day before and the running total come
     from the `<!-- stats-data -->` line at the end of the previous day's log, so they cost no call. A day
     without a log restarts the total (`since <date>`); a challenge score needs totals that begin at its
     start, so start the logs on day one or give the source a `totalPath`, else it says `not measured`.
   - **Challenge** `score.formula` uses `+ - * / ( )`, numbers and metric names (`visitors`, `signups`,
     `revenue`, `refunds`, `fees`, `profit`, a counter's name lower-cased with `_`), evaluated on the
     running totals. The Stats block is never cut for size; it counts against `budgetTokens`.
   - **As of** is the time the source was read, or its own timestamp when `asOfPath` points at one.

   `schema` is read by `agent-kit migrations` and the `data-schema` skill:

   ```json
   "schema": {
     "engines": {
       "d1": ["apps/api/migrations/*.sql"],
       "supabase": ["supabase/migrations/*.sql"],
       "durable-objects": ["apps/api/src/objects/*.ts"],
       "convex": ["convex/schema.ts", "convex/schema/**/*.ts"]
     },
     "allowlist": "scripts/migrations-allowlist.json",
     "base": "origin/main"
   }
   ```

   `engines` maps each engine (`postgres`, `supabase`, `d1`, `sqlite`, `durable-objects`, `convex`)
   to globs over repo paths; the first match wins. Without the block, `supabase/migrations` and
   `convex/schema*` are recognised and any other `migrations/*.sql` is checked as SQL of an unknown
   engine. Only files changed against `base` (`--base` overrides) are judged, so history needs no
   fixing. Rules: a header comment, a unique number not below the base's highest, no
   `BEGIN`/`COMMIT` on D1 or in Durable Object SQL, no REAL or float for money-like columns,
   `json_valid` on JSON-looking text (warning), an `Undo:` or `Destructive:` line for `DROP`,
   `RENAME` and `TRUNCATE`, and a warning when a migration already on the base is edited or deleted.
   `allowlist` is a ratchet, `{ "allow": [{ "file", "rule", "why" }] }`: an entry silences one rule
   on one file, and the check reports entries that no longer fire so they get removed. `--all`
   judges every schema file, to seed the allowlist when adopting. Wire it into the repo's local
   verify (the `loop.verify` command) so it runs before every PR.

   Other keys: `linear.labels` folds labels another process already uses
   for "waits on the owner" into the inbox, `linear.states` names the state
   for each role (`ask`, `task`, `start`, `done`, `canceled`) where a team's
   own rules place issues, `linear.close: false` leaves closing to people, `ceo.node` pins the node the CEO's launchd job runs (default: `/opt/homebrew/bin/node`, else `/usr/local/bin/node`, Homebrew's version-independent symlinks; `ceo-schedule install` fails with a message if neither exists, and never uses the installing shell's node), `ceo.manual` moves the operating
   manual from `ops/CEO.md`, `ceo.layout` names a script `herdr ceo` runs on the new CEO pane (board, graph tab), and `bootstrap` is the repo's own preparation of a
   new checkout. Defaults follow from `name`: the CEO checkout `../<name>-ceo`, its herdr
   agent `<name>-ceo`, sessions in `../<name>-worktrees`, launchd label
   `com.<name>.ceo` at 08:00, herdr plugin `<name>.ops`. The job's PATH is fixed (`/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`, plus the folder of `claude` when it lives elsewhere), not a copy of the installing shell's, and `ceo-schedule status` checks that the node and claude it names exist and run. `src/config.mjs` lists
   every key.
2. From this checkout: `node bin/agent-kit.mjs sync <repo>`. It writes
   `<repo>/vendor/agent-kit/` and `<repo>/agent-kit.lock.json` (the commit).
3. In the repo: package scripts that call `node vendor/agent-kit/bin/agent-kit.mjs <command>`,
   a `.claude/agents/ceo.md` and the manual with that company's mandate and
   decision rights, and
   `LINEAR_API_KEY` in the root `.env`. Then `agent-kit linear setup`.

## Install prompt

This is the only way to install the skills. Paste it to an agent in the repo:

```text
Install the skills from https://github.com/biering/agent-kit into this repo.

From the repo root, run:

npx skills add biering/agent-kit --skill '*' -a claude-code codex -y

Then make the layout match:

- The skill files live in .agents/skills/<name>/. That is the copy you commit.
- .claude/skills/<name> and .codex/skills/<name> are relative symlinks to ../../.agents/skills/<name>. If the installer wrote a real directory, replace it with the symlink. Never copy skill files into a second directory.
- skills-lock.json must record source biering/agent-kit and sourceType github. A local path means the install used a checkout; reinstall from GitHub.
- Do not edit an installed skill. A rule that differs in this repo goes in AGENTS.md, in docs/agent-kit/<skill>.md, or in agent-kit.config.json (the loop, carousel and ads blocks). Those files are not overwritten by a later npx skills update.
- If this repo already says which skills stay out of .claude/skills, follow that and say which ones you left unlinked. Otherwise link all of them.
- If this repo links a subset of skills from .cursor/skills, link the new ones the same way.
- For each database engine this repo uses, also install the official skill that data-schema's routing table names (from the vendor's own repository, the same way), unless it is already installed.
- If a kit skill has the same name as a skill this repo wrote itself, stop and ask before replacing it.
- Do not commit unless asked.
```

Later, `npx skills update` pulls new versions. That diff is reviewed like any other.

The CEO tools are not part of this prompt. They are vendored with
`agent-kit sync`, in [Adopting it in a repo](#adopting-it-in-a-repo).

## Skills

`skills/<name>/SKILL.md` holds the skills the prompt installs, via the
[skills CLI](https://github.com/vercel-labs/skills).

The directory name is the install key, so skills are not renamed here. The table groups them by the job.

| Area | Skills |
|------|--------|
| Ship | `dev-loop` (branch to green PR), `pr`, `ci`, `bugfix` |
| Review | `review-code`, `review-api` (REST and MCP scorecards; the MCP half scores against `mcp-design`), `legal-review` (DE/EU, not legal advice), `onboarding-review` |
| Harness | `improve` (a mistake becomes a guardrail), `retro` (up to three `improve` proposals) |
| Build | `scaffold` (a new app on this kit's stack, Python services included), `design`, `mcp-design` (an MCP server for agents: tool budget and toolsets chosen by URL, names, descriptions, response shapes, errors that teach, write safety, scopes, contract tests and evals; `scripts/tool-budget.mjs` measures a tool list), `data-schema` (schemas and migrations on any engine: the house rules, routing to the official Postgres, Supabase, Cloudflare and Convex skills, a reference per engine with only what those lack; checked by `agent-kit migrations`) |
| Write | `copywriting`, `unslop` (runs on every user-facing text before it ships: AI-sounding prose in German and English, specifics first, platform limits, a voice file per repo that learns from edits), `product-changelog`, `daily-log` (one short log a day of what is worth sharing, each entry with its why; fed by `agent-kit daylog collect`, a cheap digest, led by a per-product Stats block when configured) |
| Market | `aso`, `app-screenshots` (six layout templates: hero object, tilted device, panorama, feature callout, before and after, honest proof; sourced rules), `video` (a video studio: seven roles, six styles including agent films, measured QA, voice-over, X player cards, and `record.mjs` for explainers of the real app), `carousel` (intake, three covers, a 20-point scorecard that gates at 16, caption, alt text and reply script, angle batches tracked as experiments), `ad-creative` (the ad itself for paid social and search: sourced premises, target from ad libraries and reviews, a 17-element brief checked by `brief_check.mjs`, batches as a risk portfolio, no invented urgency or proof), `ads-landingpage` (the page the ad lands on) |
| Decide | `value-score` (customer value against complexity, before anything is built), `value-loop` (keep only what moves customers or revenue) |
| Editor | `workspace-chrome` (title bar and status bar only) |

Every listed description costs room in the harness's skill listing. A repo
that caps that listing says so in its own docs; the prompt follows that and
leaves the extra skills unlinked from `.claude/skills`.

The installer records each skill's hash in `skills-lock.json`. Never edit an
installed copy: change it here and update.
A repo's own rules stay in that repo: `AGENTS.md`, the `loop` block in
`agent-kit.config.json`, and `docs/agent-kit/<skill>.md`, which every skill
reads before it acts (a repo's PR scope, its copy carve-outs, its launch
steps). Nothing a repo writes there is overwritten by `npx skills update`.

Skills that are already published upstream (coss, nuxt-ui, heroui-native,
emil-design-eng, supabase-postgres-best-practices, stripe-best-practices, and the
Supabase, Cloudflare and Convex skills `data-schema` routes to) are
installed from their own repositories; this kit names them and never copies
them. `skills/data-schema/references/postgres.md` adapts parts of two Apache-2.0
Postgres skills (Neon, Timescale), with attribution, pinned commits and the licence
beside it. `skills/design/references/taste/` is the exception: it is vendored from
[Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (MIT, licence
beside it) because the design router needs it as a reference, not a skill.
`skills/design/references/landing-page.md` adapts the strategy half of
[elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills)'
`landing-page-design` (MIT, credited there) instead of installing it: installed
whole, it claims every web UI task and sets fonts, icons and invented proof that
the repos' design systems and the taste kit rule out.

## Design review

Work that changes screens gets the owner's yes on its design before it is built
([`rules/design-review.md`](rules/design-review.md)). The **Waiting for you** pane brings those
designs to him in herdr, and the PRs that wait for his review (next section), across every repo on the work board
([herdr-projects](https://github.com/eliasstravik/herdr-projects), used through its CLI only).

```
 Waiting for you · 3 to approve · 1 PR
 ────────────────────────────────────────────────
  Designs to approve
 ▸ KIT-14      12m  design Settings screen redesign
   MB-411       2h  plan   Onboarding, three steps
   MB-405       1h  stuck  Tinybreath singing bowl
  PRs to approve (on GitHub)
   app#88       3h  PR     feat(app): refund button
 ────────────────────────────────────────────────
 KIT-14 · agent-kit · design ready 12m ago
 Artifacts
 [1] Variant A, grouped
 https://claude.ai/artifact/<id>
 Brief
 …
 ────────────────────────────────────────────────
 ⏎/p review in Plannotator  a approve + build
 b send back  1-9 open link  o open all  …
```

**What waits there.**
- **design**: the agent made its designs with its usual access and stopped with a
  `Design ready: …` report. Its description has the line `Design review: yes`. The brief is its
  closing note.
- **plan**: the board's plan step (`plan.approve you`) with a design brief. Its description has the
  marker line, or its plan links an artifact.
- **stuck**: a plan was approved but its build never started (see "Approve" below).

**Keys.**
- `⏎`/`p` opens the brief in Plannotator (the annotate plugin), in a **new tab of the CEO's
  workspace** (label `ceo`, of the task's repo; `AGENT_KIT_REVIEW_WORKSPACE` picks another). There,
  `A` approves and `E` sends the comments back.
- `a` approves (it asks first); `b` sends back a one-line comment.
- `1`–`9` opens an artifact in the browser, `o` opens them all, and `y` then a digit copies one.
- `s` skips a task until its brief changes (`S` shows skipped ones); `f` repairs a stuck one.
- `g` opens the board, `r` refreshes, `?` lists every key.

Artifact links are always shown whole: each on a line of its own, broken without anything added
when the pane is narrower than the URL, and a terminal hyperlink either way. The pane refreshes
when the board writes a task (it watches the board's `tasks/` folder) and every 30 s.

**Approve.**
- A design task gets one `tell`: build it now, in the same conversation.
- A plan gets the board's `approve`. The pane then sends nothing until the build has started (the
  task's `plan.built`), because a message in that window cancels the build and leaves the agent in
  Claude's plan mode on a read-only worktree.
- If the build still does not start, it repairs: `stop`, then `delegate --now --plan.approve none`,
  which builds the approved plan with normal access.
- An approve runs on its own, so closing the pane does not cut it off. Its progress shows on the row.
- **Send back** is a `tell` with the owner's words (a design gets "revise, then stop at Design ready
  again"; a plan goes back to its plan step).

**Notifications.** A herdr notification arrives when a design becomes ready, even with the pane
closed: the plugin's `pane.agent_status_changed` hook, at most one board read every 20 seconds.

**Setup, once per machine.** The pane is its own plugin (`herdr-review/`, id `agent-kit.review`),
not part of each repo's plugin, so it shows once for all repos. `terminal/install.sh` links it when
herdr runs. By hand: `herdr plugin link <repo>/vendor/agent-kit/herdr-review`. The key `prefix+y`
(the kit's herdr config) opens the pane beside the current one.

- It needs no `agent-kit.config.json` entry.
- It finds the board as the board does: `HERDR_PROJECTS_BIN`, `HERDR_PROJECTS_DATA_DIR`,
  `HERDR_PROJECTS_HOME`.
- It finds Plannotator through herdr's plugin list, or `PLANNOTATOR_TUI_BIN`.
- Each repo's CEO manual adds one line that points to the rule.

`agent-kit review list [--json]` prints the same list (designs, then PRs; `--json` is `{ designs, prs, errors }`),
`agent-kit review prs [--json]` only the PRs, and `approve`, `back`, `annotate` and `notify` are the
pane's actions as commands.

## Waiting for you: PRs

The same pane has a second section, **PRs to approve (on GitHub)**: the open pull requests, in every repo
the work board knows (its `repos.json`, each repo's `origin` remote, asked through `gh`), where the
owner's approval is what blocks the merge. Nothing approves from the pane: `⏎` (or `1`, `o`) opens the
PR in the browser, `y` then `1` copies its URL, and the approval stays on GitHub.

```
 app#88 · app · open 3h
 feat(app): refund button
 Pull request
 https://github.com/<owner>/app/pull/88
 Why it needs you
  - gate path: scripts/stripe-prices.mjs
  - new dependency: zod
 CI green
 What to decide
 Adds a refund button. Money could go out twice. Revert the PR.
 Approval stays on GitHub: open the PR and approve it there.
```

**What waits.** An open PR that is not by one of the repo's own code owners (so any agent account, not
only the board's), whose latest word is not "changes requested", and one of these holds (each is a "why" on its row):
- **review required**: GitHub says so (`reviewDecision` is `REVIEW_REQUIRED`: a ruleset or branch
  protection asks for a review and nobody gave it yet). This is how a repo like this kit shows up.
- **gate path**: a changed file is under a rule of the repo's `CODEOWNERS` that names the owner (any
  other account than the PR's author and the agents; `AGENT_KIT_REVIEW_OWNER` names him). A catch-all
  rule (`*`) is a default owner, not a gate, and does not count; the last matching rule wins, as on GitHub.
- **new dependency**: a changed `package.json` gains a runtime dependency (`dependencies`,
  `peerDependencies`) it did not have before (the head against the base branch). A repo that posts its own
  `new dependency` check or status is trusted over this: red, it waits; green, it does not.
- **repo needs your review**: the repo is in `AGENT_KIT_REVIEW_REPOS` (comma list of names or
  `owner/name`): every PR there needs him.

His approval **at the PR's head commit** lifts the gate reasons; a push after it puts the PR back. A PR
that merges on green CI and the board review alone never shows up.

**What each row shows.** The full PR URL (never shortened: its own line, broken hard only when the pane is
narrower, a terminal hyperlink either way), the title, the repo, how long it has been open, why it needs him,
the CI state (green, running, failing with the failing checks' names, none), and the gate-reviewer's three
sentences when there are any. Those are read from the PR body, then from the task's closing note: a
`for <owner>:` line (the `for …:` line of a `GATE ADVICE` verdict, or three sentences after `for you:`
and the like) and what follows it up to the blank line.

**Drafts.** A draft PR that would wait for him is listed too, marked `draft` in the list and **DRAFT** in
its header with "mark it ready", also when the board's task for it still reads "working" (the detail says so): an agent may have stopped
to ask for him without the board's state moving. Those are the PRs left as drafts although they wait for him.

**Live.** The pane loads the PRs on their own, so the designs never wait for GitHub (it says "loading
from GitHub…"). It asks again when the board writes a task (at most every 20 s) and every 3 minutes, and
`r` asks now. A repo `gh` cannot read is named in the pane ("PRs incomplete: …"), never shown as "no PR
waits"; the last list stays on screen. `s` skips a PR until its head or its reasons change. There is no
herdr notification for PRs (that would be a GitHub call on every agent status change).

**Limits.** The new-dependency check reads one `package.json` against its base, so it does not know the
repo's other packages (the repo's own check does). A rename is judged by its new path. `gh` must be
logged in on the machine that runs the pane.

## Rules

Rules that apply to every app of a kind, vendored with the kit. Read the one that
matches the work.

- [`rules/mobile-apps.md`](rules/mobile-apps.md): analytics consent (not ATT),
  the review prompt, onboarding.
- [`rules/design-review.md`](rules/design-review.md): work that changes screens gets a design
  review first (the marker line, the design stage, the brief, what approve and send back mean).
- [`rules/how-we-win.md`](rules/how-we-win.md): the guiding principles for
  evaluating ideas, building, experimenting and deleting; every repo's CEO and
  idea scoring follow it.
- [`rules/growth-stages.md`](rules/growth-stages.md): which growth work fits which
  revenue stage, the gate to the next, the demand test, hand sales for the first
  10 customers, the price review and the hard lines.

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
