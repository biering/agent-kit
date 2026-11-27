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
| `agent-kit review` / `review pane` / `prs` / `check <file>` / `approve <id>` / `back <id> <text>` / `annotate <id>` | Everything that waits for the owner, across repos, newest first: the herdr **review list** pane (`prefix+y`, below the work board) with specs to approve before the build, designs, results to ship (approve or send back with a key) and PRs to approve on GitHub (Review list below) |
| `agent-kit plan-review <plan.md \| openspec/changes/<name>> [--detach <prefix>]` / `--install` / `--status` | A plan or a whole OpenSpec change to the owner in Plannotator, on his phone or laptop over his tailnet; the decision comes back as an exit code and JSON (Plan review below) |
| `agent-kit spec archive <name>` | Archive a shipped OpenSpec change, never one whose `tasks.md` still has an unticked task |
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
   hooks do that job). Four more blocks belong to skills: `review` (`media`, the command the `result-pitch` skill uploads its video and screenshots with; README "Review list"), `carousel` (the brands
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
| Ship | `dev-loop` (branch to green PR), `pr`, `ci`, `bugfix`, `result-pitch` (the owner ships it without reading code: user benefit, complexity and why it is worth it, risk and undo, a recommendation, with a video and desktop and phone screenshots of the real app; checked by `agent-kit review check`) |
| Review | `review-code`, `review-api` (REST and MCP scorecards; the MCP half scores against `mcp-design`), `legal-review` (DE/EU, not legal advice), `onboarding-review` |
| Harness | `improve` (a mistake becomes a guardrail), `retro` (up to three `improve` proposals) |
| Build | `scaffold` (a new app on this kit's stack, Python services included), `design`, `mcp-design` (an MCP server for agents: tool budget and a small surface on one URL, names, descriptions, response shapes, errors that teach, write safety, scopes, contract tests and evals; `scripts/tool-budget.mjs` measures a tool list), `data-schema` (schemas and migrations on any engine: the house rules, routing to the official Postgres, Supabase, Cloudflare and Convex skills, a reference per engine with only what those lack; checked by `agent-kit migrations`) |
| Write | `copywriting`, `unslop` (runs on every user-facing text before it ships: AI-sounding prose in German and English, specifics first, platform limits, a voice file per repo that learns from edits), `product-changelog`, `daily-log` (one short log a day of what is worth sharing, each entry with its why; fed by `agent-kit daylog collect`, a cheap digest, led by a per-product Stats block when configured) |
| Market | `distribution-reuse` (a shipped change in a live product, told as the brand: an X post, a clip, a changelog entry or a launch asset, drafted inside the result pitch and posted on its approve), `aso`, `app-screenshots` (six layout templates: hero object, tilted device, panorama, feature callout, before and after, honest proof; sourced rules), `video` (a video studio: seven roles, six styles including agent films, measured QA, voice-over, X player cards, and `record.mjs` for explainers of the real app), `carousel` (intake, three covers, a 20-point scorecard that gates at 16, caption, alt text and reply script, angle batches tracked as experiments), `ad-creative` (the ad itself for paid social and search: sourced premises, target from ad libraries and reviews, a 17-element brief checked by `brief_check.mjs`, batches as a risk portfolio, no invented urgency or proof), `ads-landingpage` (the page the ad lands on) |
| Decide | `spec` (a feature planned before any code: an OpenSpec change with WHEN/THEN scenarios, designs as Artifacts, one brief the owner approves in the review list), `value-score` (customer value against complexity, before anything is built), `value-loop` (keep only what moves customers or revenue) |
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

## Review list

The owner is in the loop at two points, and the **review list** is where both reach him: a herdr pane
below the work board ([herdr-projects](https://github.com/eliasstravik/herdr-projects), used through its
CLI only) that lists everything waiting for him, across repos, newest first.

1. **The spec, before the build** ([`rules/spec-review.md`](rules/spec-review.md), the `spec` skill): a
   feature or a bigger improvement is written as an OpenSpec change (proposal, WHEN/THEN scenarios,
   design, tasks) with the designs as private Artifacts, and one brief. No code until he approves.
2. **The result, before the merge** ([`rules/result-review.md`](rules/result-review.md), the
   `result-pitch` and `distribution-reuse` skills): specced work and every PR a user would notice comes
   with a pitch, a video and desktop and phone screenshots of the real app, and the drafts for the
   product's brand accounts. His approve is the board's merge; the drafts post as the brand after it.

Screen work without a spec still gets its design approved first ([`rules/design-review.md`](rules/design-review.md)),
and PRs that need his approval on GitHub (a CODEOWNERS path, a new runtime dependency) show in the same
list, to open, not to approve.

```
 Review list · 4 waiting (1 on GitHub)
 ──────────────────────────────────────────────────────────────
 ▸ result tinybreath    12m  a singing bowl ends the session
   spec   wavedance      2h  save a mix as a playlist
   design agent-kit      5h  settings in two taps
   GitHub app            1d  feat(app): refund button
 ──────────────────────────────────────────────────────────────
  MB-590 · tinybreath (maelstrom) · result ready 12m ago
  feat(tinybreath): singing bowl
  Links
  [1] Video, the changed flow
 https://media.example.com/tinybreath/bowl/flow.mp4
  [2] Screenshot, desktop
 https://media.example.com/tinybreath/bowl/session-desktop.png
  [3] Screenshot, phone
 https://media.example.com/tinybreath/bowl/session-phone.png
  [4] Pull request
 https://github.com/acme/maelstrom/pull/612
  Brief file (⏎ opens it in Plannotator)
 ~/.herdr-projects/data/tasks/maelstrom/590/closing-note.md
 ──────────────────────────────────────────────────────────────
  ⏎/p review in Plannotator  a approve + merge  b send back
  1-9 open link  o open all  y1-9 copy link  s skip  S skipped
```

**Each row** is the kind, the product (a `Product: <name>` line in the brief or the task's
description, else the repo), the age and one line (the report's message after `Spec ready for review:`,
else the title). Kinds:

| Row kind | The task stopped with | Its brief | Approve does |
|---|---|---|---|
| `spec` | `Spec ready for review: …` | the closing note: why, user benefit, scenarios, design links, tasks, complexity | one `tell`: build it now, in the same conversation |
| `design` | `Design ready: …`, on a task with `Design review: yes` | the closing note with the artifacts | one `tell`: build it now |
| `result` | (the board's **ready to approve**, for work the owner reviews: a `# Result` pitch in the closing note, or a task flagged for a spec or design review) | the closing note: the pitch, its video, screenshots and drafts; the PR link comes from the board | the board's `approve`, which merges the reviewed head; then a task, `--after` it, posts the drafts on the brand accounts |
| `plan` | the board's plan step (`plan.approve you`) with a design brief | the plan | the board's `approve`, then a check that the build starts |
| `stuck` | (an approved plan whose build never started) | the plan | `f` repairs: `stop`, then `delegate` |
| `GitHub` | (an open PR whose merge waits for his GitHub approval) | the PR | nothing here: `⏎` opens it to approve on GitHub |

**The detail** shows every link whole, typed (Artifact, Video, Screenshot, PR, Link), the brief's file,
the OpenSpec change's folder in the task's worktree, and what the brief or pitch still lacks
(`Not complete: no phone screenshot; …`, the same check as `agent-kit review check`). A result whose PR
also waits on GitHub says so on both rows.

**Keys.**
- `⏎`/`p` opens the brief or the pitch in Plannotator (the annotate plugin), in a **new tab of the
  CEO's workspace** (label `ceo`, of the task's repo; `AGENT_KIT_REVIEW_WORKSPACE` picks another). There,
  `A` approves and `E` sends the comments back. On a GitHub row, `⏎` opens the PR in the browser.
- `a` approves (it asks first); `b` sends back a one-line comment to the same agent.
- `1`–`9` opens a link in the browser, `o` opens them all, and `y` then a digit copies one.
- `s` skips a row until its brief changes (`S` shows skipped ones); `f` repairs a stuck one.
- `g` opens the board, `r` refreshes, `?` lists every key.

Links are always shown whole: each on a line of its own, broken without anything added when the pane is
narrower than the URL, and a terminal hyperlink either way. The pane refreshes when the board writes a
task (it watches the board's `tasks/` folder) and every 30 s.

**Approve, in detail.**
- A spec or a design gets one `tell` (the words are in `src/lib/review.mjs`), and the agent goes on in
  the same conversation with its usual access.
- A result gets the board's `approve`: the board merges the head its reviewer saw, and nothing is told
  to the agent, so the PR head does not move after the yes. A result whose PR also waits on GitHub is
  refused until it is approved there. When the pitch has drafts, a research task `--after` the result
  posts them once the merge is done.
- A plan gets the board's `approve`. The pane then sends nothing until the build has started (the
  task's `plan.built`), because a message in that window cancels the build and leaves the agent in
  Claude's plan mode on a read-only worktree. If the build still does not start, it repairs: `stop`, then
  `delegate --now --plan.approve none`, which builds the approved plan with normal access.
- An approve runs on its own, so closing the pane does not cut it off. Its progress shows on the row.
- **Send back** is a `tell` with the owner's words and what to do next: revise and stop again at the same
  report (`Spec ready for review`, `Design ready`); a result is changed on the same branch and the turn
  ends normally, so the board updates the PR and brings it back as ready to approve; a plan goes back to
  its plan step.

**The order of stops is the board's.** An agent never reports `Result ready`: it writes the pitch,
archives its change and ends its turn. The board checks, pushes, opens the PR, runs its reviewer and
shows "ready to approve"; the list builds the result row from that. Every other ready-to-approve task (a
fix, an SEO page, content, a chore) stays the CEO's, and the CEO's merge gate blocks his
`herdr-projects approve` of a result (`agent-kit review owner <id>`: exit 0 when it is the owner's).

**False errors.** When a spec or design stop is followed by an idle compaction, the board reads the
compaction as a turn without a summary and marks the task an error ("Conversation compacted"). The row
stays: the list reads the agent's last real report from the task's own file and shows the board's word
beside it. The fix belongs in the board (herdr-projects): its worker settings file could turn
`idleCompaction` off, or its turn-end could skip a compaction.

**Notifications.** A herdr notification arrives when a spec, a design, a plan or a result becomes ready,
even with the pane closed: the plugin's `pane.agent_status_changed` hook, at most one board read every 20
seconds.

**Setup, once per machine.** The pane is its own plugin (`herdr-review/`, id `agent-kit.review`), not part
of each repo's plugin, so it shows once for all repos. `terminal/install.sh` links it when herdr runs. By
hand: `herdr plugin link <repo>/vendor/agent-kit/herdr-review`. The key `prefix+y` (the kit's herdr
config) opens it below the work board pane (else beside the focused pane), or focuses it.

- It needs no `agent-kit.config.json` entry. The skills read `review.media` there (below).
- It finds the board as the board does: `HERDR_PROJECTS_BIN`, `HERDR_PROJECTS_DATA_DIR`,
  `HERDR_PROJECTS_HOME`.
- It finds Plannotator through herdr's plugin list, or `PLANNOTATOR_TUI_BIN`.
- Each repo's CEO manual adds one line that points to the rules.

`agent-kit review list [--json]` prints the same list, newest first (`--json` is
`{ items, designs, prs, errors }`: `items` the whole list, `designs` every board task, `prs` the GitHub
rows), `agent-kit review prs [--json]` only the PRs, `agent-kit review check <file> [--kind spec|result]`
what a brief or pitch still lacks (exit 1 on a gap), and `approve`, `back`, `annotate` and `notify` are the
pane's actions as commands.

**A repo that uses it** sets, in `agent-kit.config.json`:

```json
"review": { "media": "pnpm media upload {product} {dir}" }
```

`media` is the command the `result-pitch` skill uploads the video and screenshots with; it prints the
public URLs the pitch links. `{product}` and `{dir}` are filled in. Without it, the skill asks once.
OpenSpec is a devDependency of the repo (`@fission-ai/openspec`, `npx openspec init --tools none`).

### Herdr desktop app

The Herdr desktop app (0.1.18) does not load herdr's plugins: it reads no `herdr-plugin.toml`, so it has
no plugin panes, actions, link handlers or events. Its own extension point is **mods**: small JavaScript
programs in `~/.config/herdr-app/mods/<name>/` that draw native panels, run programs with `exec()` and
run app commands. So the review list ships for it as a mod, `herdr-app/review-list`, as well:

- Install: `herdr-app/install.sh` (`terminal/install.sh` runs it) copies it into the app's mods folder
  and writes `kit.json`, the `node` and the `agent-kit` it runs. No app folder, nothing is done.
- Open: focus the board's pane, then the palette's **Review list**. It splits that pane down, so the
  list sits below the board. `herdr-app do pane.split '{"direction":"down","mod":"review-list"}'` does the
  same from a shell.
- The same list: it runs `agent-kit review list --json` every 30 seconds and draws its rows natively:
  kind, product, age, one line, newest first, the detail with every link whole and "Not complete: …"
  when the brief or pitch has gaps.
- The same keys: `↑`/`↓` (or `j`/`k`) move, `⏎` opens the brief in Plannotator in a new tab
  (`agent-kit review doc`) or a GitHub row in the browser, `a` asks once and then approves
  (`agent-kit review approve`; `f` on a stuck row repairs it), `b` opens a one-line field for the words
  that go back (`agent-kit review back`), `1` to `9` open a link, `r` reads the list again. The confirm and
  the field act on the row they were opened for: if a refresh drops that row (done in the herdr pane, say),
  they close and nothing is sent, so a second `a` never lands on another row.
- Commands: `review-list.down`, `.up`, `.open`, `.approve`, `.back` and `.refresh` take the same
  actions from `keys.json` (`"alt-a": "review-list:approve"`) or a shell
  (`herdr-app do review-list.approve`).

The list, the checks and every action stay in this kit's CLI; the mod is only the screen, so the herdr
pane and the mod never disagree. What it does not do yet: the `s` skip, `y` copy and `o` open-all keys
of the herdr pane, and the per-row approve status (`build`, `ship`) the pane reads from its state folder.

### GitHub rows

The list also has the open pull requests, in every repo the work board knows (its `repos.json`, each
repo's `origin` remote, asked through `gh`), where the owner's approval is what blocks the merge. Nothing
approves from the pane: `⏎` (or `1`, `o`) opens the PR in the browser, `y` then `1` copies its URL, and the
approval stays on GitHub.

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

**Live.** The pane loads the PRs on their own, so the board rows never wait for GitHub (it says "loading
from GitHub…"). It asks again when the board writes a task (at most every 20 s) and every 3 minutes, and
`r` asks now. A repo `gh` cannot read is named in the pane ("PRs incomplete: …"), never shown as "no PR
waits"; the last list stays on screen. `s` skips a PR until its head or its reasons change. There is no
herdr notification for PRs (that would be a GitHub call on every agent status change).

**Limits.** The new-dependency check reads one `package.json` against its base, so it does not know the
repo's other packages (the repo's own check does). A rename is judged by its new path. `gh` must be
logged in on the machine that runs the pane.

## Plan review

A plan or an OpenSpec change that needs the owner's yes goes to him in [Plannotator](https://plannotator.ai),
not only as text in the chat. He reads it in the browser, marks passages, comments, and presses
**Approve** or **Send Feedback**; the decision comes back to the agent. The review list (above) shows
board tasks in the terminal; `agent-kit plan-review` is for everything else: a chat, a ticket, a Claude
Code remote-control session, a repo script such as a schema review.

```bash
r=/tmp/plan-review-<name>   # any path prefix: the review's files go next to it
node vendor/agent-kit/bin/agent-kit.mjs plan-review openspec/changes/<name> --detach "$r"
```

- **What it reviews.** A Markdown file (its frontmatter `name:` is the tab's title), or an OpenSpec change
  folder: `proposal.md`, each `specs/**/spec.md`, `design.md` and `tasks.md`, in that order, each under
  a heading of its own with its headings one level down, as one document titled with the change id. A
  change whose `proposal.md` does not open with the `value-score` lines is refused (exit 2).
- **What it does.** Installs the pinned Plannotator when it is missing, opens a gated review on the
  tailnet, prints its address (`https://<machine>.<tailnet>.ts.net:<port>`) and waits for the decision,
  which can take hours. Tell the owner the address.
- **`--detach <prefix>`** runs the review in a session and process group of its own (setsid), so it
  outlives the agent's turn and Claude Code's 2-hour background limit (`nohup … &` does not: it dies
  with the agent's process group). It returns once the page is up and prints `review: <address>`. It
  waits at most 90 s, so give the Bash call a timeout above that. Exit 4: no address in time, the review
  still runs; read `$r.err`. A second run on a prefix whose review still runs refuses with exit 2.
  The decision JSON goes to `$r.out`, stderr to `$r.err`, the pid to `$r.pid`, the exit code to
  `$r.exit` when it ends. Wait on the pid in a background command
  (`while kill -0 "$(cat "$r.pid")" 2>/dev/null; do sleep 60; done`), then read `$r.exit`.
- **Sessions that reap detached processes.** In a Claude Code remote-control session (the bridge, its
  worktree is `.claude/worktrees/bridge-*`) a `--detach` review was killed within minutes, twice, on
  2026-11-27. There, run the same command **without `--detach`** as a tracked background task (Bash
  `run_in_background`, `timeout: 7200000`); that survived. The task's notification carries the exit
  code and the decision JSON. A task that hits its time limit ends the review: open it again. No
  `$r.exit` once the pid is gone means the same thing anywhere, and the next `--detach` run on that
  prefix says so.
- **To cancel** a detached review, kill its whole process group: `kill -- -"$(cat "$r.pid")"`. Killing
  only the pid stops the shell that records the exit code and leaves the page open. `tailscale serve
  status` shows a port a killed run left published; `tailscale serve --https=<port> off` removes it.

| Exit | Meaning | Next |
|---|---|---|
| 0 | Approved | Go on; notes on an approval are guidance, not change requests |
| 1 | Feedback | Revise from the feedback in the decision JSON (stdout, `$r.out`), then open it again |
| 2 | The review could not start, or left no decision | Read stderr (`$r.err`); often the tailnet (`plan-review --status`) |
| 3 | Dismissed: the tab was closed, or the phone sat in the background for 30 s | Open it again; there is nothing to revise |

**Why the tailnet.** Plannotator listens on `127.0.0.1` of the agent's machine; the owner reviews from
his phone or laptop. `--tailscale` publishes the session with `tailscale serve` over HTTPS to tailnet
devices only, so nothing is public. Rejected: Cloudflare Access (a tunnel, DNS and an Access app for one
reviewer) and `PLANNOTATOR_REMOTE=1` (plain HTTP with no sign-in; Plannotator's docs say never to
expose it).

**Setup, once per machine.**
1. The Tailscale app (Mac App Store, or `brew install --cask tailscale-app`; not the `tailscale` formula,
   whose daemon needs root), signed in to the owner's tailnet, with HTTPS certificates on for the
   tailnet (admin console, DNS).
2. `agent-kit plan-review --install`: installs the pinned Plannotator, sets `"tailscale": true` in
   `~/.plannotator/config.json` (so Claude Code's plan-mode plugin publishes over the tailnet too), and
   pins the plugin's marketplace in `~/.claude/settings.json` to the release tag when the plugin is
   there (it never adds it).
3. `agent-kit plan-review --status` says the pinned version and `on the tailnet, HTTPS serve available`.
   Anything else names the missing step. `--status` installs nothing.

**Pinned release.** `PLANNOTATOR_VERSION` in [`src/lib/plan-review.mjs`](src/lib/plan-review.mjs) is
the release every machine installs. The installer comes from that release's tag on GitHub, is downloaded
to its own folder and runs only when its sha256 matches `INSTALLER_SHA256`, with `--verify-attestation`
(the binary's build provenance, checked with `gh attestation verify`), wiring Claude Code only. Bump
the version and the hash together, after reading the release notes and the new installer.

**Privacy.** Plans stay on the machine: Plannotator has no telemetry and keeps its data in
`~/.plannotator`. The page leaves the machine only over the tailnet. Reviews start with
`PLANNOTATOR_SHARE=disabled`; do not use its share links or Ask AI, both send the content to a third
party.

**From a repo script.** `vendor/agent-kit/src/lib/plan-review.mjs` exports `install`, `gatedReview`,
`detach` and `withoutDetach`, so a repo's own review (a schema review that stamps its migrations) uses
the same pin, tailnet and detach without a copy.

## Rules

Rules that apply to every app of a kind, vendored with the kit. Read the one that
matches the work.

- [`rules/mobile-apps.md`](rules/mobile-apps.md): analytics consent (not ATT),
  the review prompt, onboarding.
- [`rules/spec-review.md`](rules/spec-review.md): a feature, a bigger improvement or a bigger bugfix
  gets an OpenSpec change the owner approves before any code, unasked (which work, the stage, the brief,
  the archive, the OpenSpec pin).
- [`rules/result-review.md`](rules/result-review.md): specced work and every PR a user would notice
  gets a result pitch, a video and screenshots before it merges; his approve also covers the brand posts.
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
