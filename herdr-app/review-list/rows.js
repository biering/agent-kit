// What the review list mod shows and does, without any UI: the rows from `agent-kit review list --json`,
// their labels, the keys and the commands they run. main.js draws it; test/review-app-mod.test.mjs tests it.
// No imports: this file is loaded by the Herdr app (gpui-shell) and by node alike.

export const KIND = { spec: "spec", design: "design", result: "result", plan: "plan", stuck: "stuck", pr: "GitHub" };
export const APPROVES = { spec: "approve + build", design: "approve + build", plan: "approve + build", result: "approve + merge", stuck: "repair" };
const TYPE = { artifact: "Artifact", pr: "PR", video: "Video", image: "Screenshot", link: "Link" };
const MINUTE = 60 * 1000;

/** The rows, newest first, from the JSON the CLI prints; an error line when it printed none. */
export function parseList(stdout) {
  let data;
  try {
    data = JSON.parse(String(stdout ?? ""));
  } catch {
    return { items: [], errors: ["agent-kit review list --json printed no JSON"] };
  }
  const items = Array.isArray(data?.items) ? data.items.filter((it) => it && it.id && it.kind) : [];
  items.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return { items, errors: Array.isArray(data?.errors) ? data.errors.map(String) : [] };
}

/** "12m", "2h 5m", "3d": the same as the herdr pane. */
export function age(at, now = Date.now()) {
  if (!at) return "";
  const m = Math.max(0, Math.floor((now - at) / MINUTE));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** One row: kind, product, age, one line. */
export function row(it, now = Date.now()) {
  return { kind: KIND[it.kind] ?? it.kind, product: String(it.product ?? it.repo ?? ""), age: age(it.at, now), line: String(it.line || it.title || "") };
}

/** The header: how many wait, and how many of them on GitHub. */
export function header(items) {
  const gh = items.filter((it) => it.kind === "pr").length;
  return `Review list · ${items.length} waiting${gh ? ` (${gh} on GitHub)` : ""}`;
}

/** The links of the detail, numbered 1 to 9 by their place; a PR row's own URL first. */
export function links(it) {
  const out = [];
  const seen = new Set();
  const add = (url, label, type) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, label: label ?? "", type: type ?? "link" });
  };
  if (it.kind === "pr") add(it.url, "Pull request", "pr");
  for (const l of it.links ?? []) add(l.url, l.label, l.type ?? (it.kind === "pr" ? "pr" : "artifact"));
  return out;
}

/** A link's name: its type, then its label; the label alone when it already says the type. */
export function linkName(l) {
  const type = TYPE[l.type] ?? "Link";
  const label = String(l.label ?? "").trim();
  if (!label) return type;
  if (label.toLowerCase().startsWith(type.toLowerCase()) || (l.type === "pr" && /^pull request/i.test(label))) return label;
  return `${type}: ${label}`;
}

/** What the detail says under the links: the brief, the change, gaps and the other row. */
export function notes(it) {
  const out = [];
  if (it.kind === "pr") {
    out.push({ text: `${it.draft ? "Draft, mark it ready. " : ""}Why: ${(it.why ?? []).join("; ") || "your approval"}. ${{ passing: "CI green", failing: "CI failing", pending: "CI running", none: "No CI" }[it.ci] ?? ""}.`.replace(/ \.$/, "."), level: it.ci === "failing" ? "warn" : "dim" });
    if (it.result) out.push({ text: `Its result pitch waits in this list too (${it.result}).`, level: "dim" });
    return out;
  }
  const gaps = (it.findings ?? []).filter((f) => f.level === "error").map((f) => f.what);
  if (gaps.length) out.push({ text: `Not complete: ${gaps.join("; ")}.`, level: "warn" });
  if (it.github) out.push({ text: `Its PR also waits for your approval on GitHub (${it.github}): approve the PR there first, then the result here (the board merges it).`, level: "warn" });
  if (it.ready) out.push({ text: `Ready to approve on the board${it.boardSays ? `: ${it.boardSays}` : ""}.`, level: "dim" });
  else if (it.boardSays) out.push({ text: `The board marked it an error (${it.boardSays}), but its last report stands: approve or send back as usual.`, level: "warn" });
  if (it.change) out.push({ text: `OpenSpec change: ${it.change}`, level: "dim" });
  if (it.briefFile) out.push({ text: `Brief file: ${it.briefFile}`, level: "dim" });
  return out;
}

/** The footer's keys for this row. */
export function footer(it) {
  if (!it) return "r refresh";
  if (it.kind === "pr") return "⏎ open on GitHub   1-9 open link   r refresh";
  return `⏎ review in Plannotator   a ${APPROVES[it.kind] ?? "approve"}   b send back   1-9 open link   r refresh`;
}

/** What `a` asks before it acts. */
export function confirmText(it) {
  if (it.kind === "result") return `Approve ${it.key}? The board merges the PR it reviewed, then the drafts post on the brand accounts. Press a again, Esc to cancel.`;
  if (it.kind === "stuck") return `Repair ${it.key}? It is stopped and delegated again. Press a again, Esc to cancel.`;
  return `Approve ${it.key}? Its agent builds it now. Press a again, Esc to cancel.`;
}

/** The program and arguments for the agent-kit CLI, from kit.json ({ node, kit }) the installer writes. */
export function kitArgv(cfg, ...args) {
  return [cfg?.node || "node", cfg?.kit || "agent-kit.mjs", "review", ...args];
}

/**
 * What a key does on the selected row, as an action the view runs:
 *   { do: "move", by } | { do: "open", url } | { do: "brief" } | { do: "ask" } | { do: "approve" }
 *   | { do: "back" } | { do: "refresh" } | { do: "cancel" } | null (not this key)
 * `asking` is true after a first `a`: a second `a` (or Enter) approves, anything else cancels.
 */
export function keyAction(key, it, { asking = false } = {}) {
  const k = String(key);
  if (asking) return k === "a" || k === "enter" ? { do: "approve" } : { do: "cancel" };
  if (k === "down" || k === "j") return { do: "move", by: 1 };
  if (k === "up" || k === "k") return { do: "move", by: -1 };
  if (k === "r") return { do: "refresh" };
  if (!it) return null;
  if (/^[1-9]$/.test(k)) {
    const l = links(it)[Number(k) - 1];
    return l ? { do: "open", url: l.url } : null;
  }
  if (k === "enter" || k === "p") return it.kind === "pr" ? { do: "open", url: it.url } : it.briefFile || it.brief ? { do: "brief" } : null;
  if (k === "a") return it.kind === "pr" ? null : { do: "ask" };
  if (k === "b") return it.kind === "pr" || it.kind === "stuck" ? null : { do: "back" };
  return null;
}

/** The selected index after the list changed: the same item when it is still there, else the same place. */
export function keepSelection(items, prevId, prevIndex) {
  const i = items.findIndex((it) => it.id === prevId);
  if (i !== -1) return i;
  return Math.max(0, Math.min(prevIndex ?? 0, items.length - 1));
}
