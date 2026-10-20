#!/usr/bin/env node
/**
 * Linear, as the CEO agent's human-in-the-loop inbox (ops/CEO.md).
 *
 * Everything the agent cannot decide or do alone becomes one issue in the
 * repo's Linear workspace (agent-kit.config.json), labelled with a kind from
 * the "Human" group and assigned to the owner. The shared "Needs me" view lists exactly those, so the
 * human side of the loop is one screen on the phone, not a chat scrollback.
 *
 *   pnpm linear setup                              # labels + "Needs me" view (idempotent)
 *   pnpm linear inbox                              # open Human issues, answered ones first
 *   pnpm linear ask decision "QR: price the editable code" --body-file /tmp/q.md \
 *       [--project "QR forever-codes"] [--priority 2]
 *   pnpm linear comment MAE-12 "Done, merged in #240"   # or --body-file
 *   pnpm linear close MAE-12 [--canceled]
 *   pnpm linear project "QR forever-codes" [--description "…"]   # ensure a project per bet
 *   pnpm linear task "QR: Worker redirect + KV" --project "QR forever-codes" [--body-file …]
 *   pnpm linear start MAE-13                       # a worker picked it up
 *   pnpm linear issues [--project "…"]             # every open issue: the agents' queue
 *   pnpm linear issue MAE-12 [--json]              # one issue: title, state, project
 *
 * Issues without a Human label are the agents' own work queue, one project per
 * bet, so Christoph sees what is in flight without asking.
 *
 * Only LINEAR_API_KEY from the repo-root .env, never the claude.ai Linear
 * connector, which is denied in .claude/settings.json: that one answers as
 * whichever workspace the browser login has, and a blocker filed there is
 * never seen.
 *
 * The key acts as Christoph, so every comment looks like his. Agent comments
 * therefore start with AGENT_MARK, and `inbox` treats an issue whose newest
 * comment lacks it as answered.
 */
import { readFileSync } from 'node:fs'
import { config, main } from './config.mjs'
import { notify } from './lib/herdr.mjs'
import { envReader } from './lib/repo-env.mjs'

const env = envReader(main)
const key = env('LINEAR_API_KEY')

const TEAM_KEY = config.linear.team
const GROUP = config.linear.group
// Labels another process already uses for "waits on the owner" (Leverage's
// triage skill: needs-decision). They join the inbox and the view instead of a
// second queue; that process, not the CEO, acts on the answers.
const EXTRA = config.linear.labels
const CLOSED = ['completed', 'canceled', 'duplicate']
const ROLE_TYPE = { ask: 'unstarted', task: 'unstarted', start: 'started', done: 'completed', canceled: 'canceled' }
const inGroup = { labels: { some: { parent: { name: { eq: GROUP } } } } }
const waiting = {
  team: { key: { eq: TEAM_KEY } },
  state: { type: { nin: CLOSED } },
  ...(EXTRA.length ? { or: [inGroup, { labels: { some: { name: { in: EXTRA } } } }] } : inGroup),
}
const KINDS = {
  blocker: { name: 'Blocker', color: '#EB5757', what: 'the agent cannot proceed until you act' },
  decision: {
    name: 'Decision',
    color: '#5E6AD2',
    what: 'an idea, design or architecture call that is yours',
  },
  approval: {
    name: 'Approval',
    color: '#F2994A',
    what: 'a gated change: schema, prices, a first launch',
  },
  spend: { name: 'Spend', color: '#27AE60', what: 'money above the agent’s own limit' },
}
const VIEW = config.linear.view
const AGENT_MARK = '🤖 **CEO agent:**'

if (!key) {
  console.error(
    `LINEAR_API_KEY is empty. Put a ${config.linear.workspace} personal API key in the repo-root .env.`,
  )
  process.exit(1)
}

async function gql(query, variables = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
  return json.data
}

const die = (msg) => {
  console.error(msg)
  process.exit(1)
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return undefined
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}

function bool(args, name) {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return false
  args.splice(i, 1)
  return true
}

function body(args) {
  const file = flag(args, 'body-file')
  if (file) return readFileSync(file === '-' ? 0 : file, 'utf8')
  return flag(args, 'body')
}

async function context() {
  const d = await gql(
    `query($key: String!) {
      viewer { id }
      teams(filter: { key: { eq: $key } }) { nodes { id states { nodes { id name type } } } }
      issueLabels(filter: { or: [{ name: { eq: "${GROUP}" } }, { parent: { name: { eq: "${GROUP}" } } }] }) {
        nodes { id name isGroup parent { id } }
      }
    }`,
    { key: TEAM_KEY },
  )
  const team = d.teams.nodes[0] ?? die(`No team ${TEAM_KEY} in this workspace.`)
  const labels = d.issueLabels.nodes
  return {
    viewerId: d.viewer.id,
    team,
    group: labels.find((l) => l.isGroup && l.name === GROUP),
    kindLabel: (name) => labels.find((l) => !l.isGroup && l.name === name),
    // A role's state: named in the config (a team whose own rules place new
    // issues, e.g. Leverage: asks in Waiting, tasks in Triage), else by type.
    state: (role) => {
      const name = config.linear.states[role]
      if (!name) return team.states.nodes.find((s) => s.type === ROLE_TYPE[role])
      return team.states.nodes.find((s) => s.name === name) ?? die(`No state "${name}" in ${TEAM_KEY}.`)
    },
  }
}

async function findProject(name) {
  const d = await gql(
    `query($name: String!) { projects(filter: { name: { eqIgnoreCase: $name } }) { nodes { id name url } } }`,
    {
      name,
    },
  )
  return d.projects.nodes[0]
}

async function issueId(identifier) {
  const d = await gql(`query($id: String!) { issue(id: $id) { id identifier url } }`, {
    id: identifier,
  })
  return d.issue ?? die(`No issue ${identifier}.`)
}

async function setup() {
  let ctx = await context()
  if (!ctx.group) {
    await gql(
      `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success } }`,
      {
        input: {
          name: GROUP,
          isGroup: true,
          color: '#95A2B3',
          description: `Needs ${config.linear.owner}. Filed by the CEO agent (${config.ceo.manual}).`,
        },
      },
    )
    console.log(`+ label group ${GROUP}`)
    ctx = await context()
  }
  for (const kind of Object.values(KINDS)) {
    if (ctx.kindLabel(kind.name)) continue
    await gql(
      `mutation($input: IssueLabelCreateInput!) { issueLabelCreate(input: $input) { success } }`,
      {
        input: {
          name: kind.name,
          parentId: ctx.group.id,
          color: kind.color,
          description: kind.what,
        },
      },
    )
    console.log(`+ label ${GROUP}/${kind.name}`)
  }

  const views = await gql(`{ organization { urlKey } customViews { nodes { id name slugId } } }`)
  const viewUrl = (v) => `https://linear.app/${views.organization.urlKey}/view/${v.slugId}`
  const existing = views.customViews.nodes.find((v) => v.name === VIEW)
  // A team workspace: only what waits on the owner, not on a teammate.
  const filterData = { ...waiting, assignee: { isMe: { eq: true } } }
  if (existing) {
    await gql(
      `mutation($id: String!, $input: CustomViewUpdateInput!) { customViewUpdate(id: $id, input: $input) { success } }`,
      {
        id: existing.id,
        input: { filterData },
      },
    )
    console.log(`= view "${VIEW}" ${viewUrl(existing)}`)
  } else {
    const d = await gql(
      `mutation($input: CustomViewCreateInput!) { customViewCreate(input: $input) { customView { slugId } } }`,
      {
        input: {
          name: VIEW,
          description:
            'Everything the CEO agent is waiting on you for. Answer in a comment or close the issue.',
          shared: true,
          icon: 'Inbox',
          color: '#EB5757',
          filterData,
        },
      },
    )
    console.log(`+ view "${VIEW}" ${viewUrl(d.customViewCreate.customView)}`)
  }
}

async function ask(args) {
  const kind = KINDS[args.shift()] ?? die(`Kind must be one of: ${Object.keys(KINDS).join(', ')}`)
  const projectName = flag(args, 'project')
  const priority = Number(flag(args, 'priority') ?? 2)
  const description = body(args)
  const title = args.join(' ').trim() || die('A title is required.')
  const ctx = await context()
  const label = ctx.kindLabel(kind.name) ?? die('Labels missing: run `pnpm linear setup` first.')

  // One open issue per question: re-asking on every run would bury the inbox.
  const dupe = await gql(
    `query($title: String!) { issues(filter: { title: { eqIgnoreCase: $title }, team: { key: { eq: "${TEAM_KEY}" } }, labels: { some: { parent: { name: { eq: "${GROUP}" } } } }, state: { type: { nin: ${JSON.stringify(CLOSED)} } } }) { nodes { identifier url } } }`,
    { title },
  )
  if (dupe.issues.nodes[0]) {
    const i = dupe.issues.nodes[0]
    console.log(`= ${i.identifier} already open ${i.url}`)
    return
  }

  const project = projectName
    ? ((await findProject(projectName)) ??
      die(`No project "${projectName}". Create it with \`pnpm linear project\`.`))
    : undefined
  const d = await gql(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }`,
    {
      input: {
        teamId: ctx.team.id,
        title,
        description,
        assigneeId: ctx.viewerId,
        labelIds: [label.id],
        priority,
        stateId: ctx.state('ask')?.id,
        ...(project ? { projectId: project.id } : {}),
      },
    },
  )
  console.log(`+ ${d.issueCreate.issue.identifier} ${d.issueCreate.issue.url}`)
  // Linear is the record; herdr is the tap on the shoulder while he is at the machine.
  notify(`Needs you: ${kind.name}`, `${d.issueCreate.issue.identifier} ${title}`)
}

async function comment(args) {
  const issue = await issueId(args.shift() ?? die('Which issue?'))
  const text = body(args) ?? args.join(' ')
  if (!text.trim()) die('Nothing to say.')
  await gql(`mutation($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`, {
    input: { issueId: issue.id, body: `${AGENT_MARK} ${text}` },
  })
  console.log(`+ comment on ${issue.identifier}`)
}

async function task(args) {
  const projectName =
    flag(args, 'project') ?? die('--project is required: every task belongs to a bet.')
  const description = body(args)
  const title = args.join(' ').trim() || die('A title is required.')
  const ctx = await context()
  const project =
    (await findProject(projectName)) ??
    die(`No project "${projectName}". Create it with \`pnpm linear project\`.`)
  const d = await gql(
    `mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }`,
    {
      input: {
        teamId: ctx.team.id,
        title,
        description,
        projectId: project.id,
        stateId: ctx.state('task')?.id,
      },
    },
  )
  console.log(`+ ${d.issueCreate.issue.identifier} ${d.issueCreate.issue.url}`)
}

async function start(args) {
  const issue = await issueId(args.shift() ?? die('Which issue?'))
  const ctx = await context()
  await gql(
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
    {
      id: issue.id,
      input: { stateId: ctx.state('start').id },
    },
  )
  console.log(`▶ ${issue.identifier} in progress`)
}

async function close(args) {
  if (!config.linear.close)
    die(`In ${config.linear.workspace} people close issues, not agents (agent-kit.config.json). Comment instead.`)
  const canceled = bool(args, 'canceled')
  const issue = await issueId(args.shift() ?? die('Which issue?'))
  const ctx = await context()
  await gql(
    `mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`,
    {
      id: issue.id,
      input: { stateId: ctx.state(canceled ? 'canceled' : 'done').id },
    },
  )
  console.log(`✓ ${issue.identifier} ${canceled ? 'canceled' : 'done'}`)
}

async function project(args) {
  const description = flag(args, 'description')
  const name = args.join(' ').trim() || die('A project name is required.')
  const found = await findProject(name)
  if (found) return console.log(`= project "${found.name}" ${found.url}`)
  const ctx = await context()
  const d = await gql(
    `mutation($input: ProjectCreateInput!) { projectCreate(input: $input) { project { url } } }`,
    {
      input: {
        name,
        teamIds: [ctx.team.id],
        leadId: ctx.viewerId,
        ...(description ? { description } : {}),
      },
    },
  )
  console.log(`+ project "${name}" ${d.projectCreate.project.url}`)
}

const ISSUE_FIELDS = `identifier title url priority createdAt
  state { name } project { name } labels { nodes { name } }
  comments(first: 50) { nodes { body createdAt } }`

function latest(issue) {
  return [...issue.comments.nodes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

async function inbox() {
  const d = await gql(
    `query($filter: IssueFilter) { issues(first: 100, filter: $filter) { nodes { ${ISSUE_FIELDS} } } }`,
    { filter: { ...waiting, assignee: { isMe: { eq: true } } } },
  )
  const rows = d.issues.nodes.map((i) => {
    const last = latest(i)
    const ours = i.labels.nodes.some((l) => Object.values(KINDS).some((k) => k.name === l.name))
    return { ...i, answered: Boolean(ours && last && !last.body.startsWith(AGENT_MARK)), last }
  })
  rows.sort(
    (a, b) => Number(b.answered) - Number(a.answered) || (a.priority || 5) - (b.priority || 5),
  )
  if (!rows.length) return console.log(`Inbox empty: nothing waits on ${config.linear.owner}.`)
  for (const r of rows) {
    const kind =
      r.labels.nodes.find((l) => Object.values(KINDS).some((k) => k.name === l.name))?.name ??
      r.labels.nodes.find((l) => EXTRA.includes(l.name))?.name ??
      '?'
    console.log(
      `${r.answered ? 'ANSWERED' : 'waiting '} ${r.identifier} [${kind}] ${r.title}${r.project ? ` (${r.project.name})` : ''}`,
    )
    console.log(`         ${r.url}`)
    if (r.answered) console.log(`         ↳ ${r.last.body.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
}

async function issues(args) {
  const projectName = flag(args, 'project')
  const filter = {
    state: { type: { nin: CLOSED } },
    ...(projectName ? { project: { name: { eqIgnoreCase: projectName } } } : {}),
  }
  const d = await gql(
    `query($filter: IssueFilter) { issues(first: 100, filter: $filter) { nodes { ${ISSUE_FIELDS} } } }`,
    { filter },
  )
  for (const i of d.issues.nodes) {
    console.log(
      `${i.identifier} [${i.state.name}] ${i.title}${i.project ? ` (${i.project.name})` : ''} ${i.url}`,
    )
  }
}

const [cmd, ...rest] = process.argv.slice(2)
async function issue(args) {
  const asJson = bool(args, 'json')
  const id = args.shift() ?? die('Which issue?')
  const d = await gql(
    `query($id: String!) { issue(id: $id) { identifier title url state { name } project { name } } }`,
    { id },
  )
  const i = d.issue ?? die(`No issue ${id}.`)
  const out = {
    identifier: i.identifier,
    title: i.title,
    state: i.state.name,
    project: i.project?.name,
    url: i.url,
  }
  console.log(
    asJson
      ? JSON.stringify(out)
      : `${out.identifier} [${out.state}] ${out.title}${out.project ? ` (${out.project})` : ''} ${out.url}`,
  )
}

const commands = { setup, inbox, ask, task, start, comment, close, project, issues, issue }
const run =
  commands[cmd ?? 'inbox'] ??
  die(`Unknown command "${cmd}". One of: ${Object.keys(commands).join(', ')}`)
await run(rest)
