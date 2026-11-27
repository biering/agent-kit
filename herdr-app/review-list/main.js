// The review list for the Herdr desktop app: what waits for the owner (specs, designs, results, PRs on
// GitHub), newest first, with the same keys as the herdr pane (agent-kit README, "Review list").
// The data and every action go through the agent-kit CLI (`review list --json`, `approve`, `back`, `doc`),
// so the board stays behind its CLI and the herdr pane and this mod never disagree.
// Open it below the work board: focus that pane, then the palette's "Review list" (a pane split down).

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exec, run, theme, appHome, readTextFile, checking, window, notify, nextCommand } from "herdr";
import { parseList, row, header, links, linkName, notes, footer, confirmText, kitArgv, keyAction, keepSelection, target, afterRefresh } from "./rows.js";

const EVERY = 30 * 1000;
/** Mod commands (keys.json, `herdr-app do review-list.<command>`) and the key each one stands for. */
const COMMANDS = { down: "down", up: "up", open: "enter", approve: "a", back: "b", refresh: "r" };
const ROW = 24;
const icon = (name) => `mods/review-list/${name}.svg`;

export default class ReviewList extends View {
  init(_props, cx) {
    this.items = [];
    this.errors = [];
    this.sel = 0;
    this.loading = true;
    this.status = "";
    // The row a confirm (asking) or the send-back field (backFor) was opened for: the action goes there,
    // whatever the selection is when it ends, and a refresh that drops that row ends it (rows.js target).
    this.asking = null;
    this.backing = null;
    this.backFor = null;
    this.cfg = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    if (checking()) {
      this.loading = false;
      return;
    }
    cx.spawn(async (cx) => {
      try {
        this.cfg = JSON.parse((await readTextFile(`${appHome()}/mods/review-list/kit.json`)) ?? "null");
      } catch {
        this.cfg = null;
      }
      this.refresh(cx);
    });
    cx.timer.every(EVERY, (cx) => {
      if (window()?.visible !== false) this.refresh(cx);
    });
    // keys.json ("alt-r": "review-list:approve") and pane.go ("focus") reach the copy here.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.handle.focus();
        else if (COMMANDS[c]) {
          const it = this.asking ?? this.current;
          const k = c === "approve" && it?.kind === "stuck" ? "f" : COMMANDS[c];
          const a = keyAction(k, it, { asking: Boolean(this.asking) });
          if (a) this.act(a, cx);
        }
        cx.notify();
      }
    });
  }

  get current() {
    return this.items[this.sel];
  }

  kit(...args) {
    const [cmd, ...rest] = kitArgv(this.cfg, ...args);
    return { cmd, args: rest };
  }

  refresh(cx) {
    if (!this.cfg) {
      this.loading = false;
      this.errors = ["kit.json is missing: run agent-kit's terminal/install.sh again"];
      cx.notify();
      return;
    }
    cx.spawn(async (cx) => {
      const { cmd, args } = this.kit("list", "--json");
      let res;
      try {
        res = await exec(cmd, args, { timeout: 120 * 1000 });
      } catch (e) {
        res = { code: 1, stdout: "", stderr: String(e?.message ?? e) };
      }
      const { items, errors } = parseList(res.stdout);
      const prev = this.current;
      this.items = items;
      this.errors = res.code !== 0 && !items.length ? [res.stderr.trim().split("\n").pop() || "agent-kit review list failed"] : errors;
      this.sel = keepSelection(items, prev?.id, this.sel);
      this.loading = false;
      const ask = afterRefresh(items, this.asking, this.asking?.kind === "stuck" ? "repair" : "approve");
      if (!ask.keep) {
        this.asking = null;
        this.status = ask.status;
      }
      const back = afterRefresh(items, this.backFor, "back");
      if (!back.keep) {
        this.closeBack();
        this.handle.focus();
        this.status = back.status;
      }
      cx.notify();
    });
  }

  say(text, cx) {
    this.status = text;
    cx.notify();
  }

  act(a, cx) {
    const it = this.current;
    if (a.do === "move") {
      this.sel = Math.max(0, Math.min(this.items.length - 1, this.sel + a.by));
      this.status = "";
    } else if (a.do === "refresh") {
      this.say("Refreshing…", cx);
      this.refresh(cx);
    } else if (a.do === "open") {
      cx.spawn(async () => {
        try {
          await exec("open", [a.url]);
        } catch {
          await exec("xdg-open", [a.url]).catch(() => null);
        }
      });
    } else if (a.do === "brief") {
      const [cmd, ...args] = kitArgv(this.cfg, "doc", it.id);
      run("tab.new", { name: `review ${it.key}`, argv: [cmd, ...args] });
    } else if (a.do === "ask") {
      this.asking = it;
      this.status = confirmText(it);
    } else if (a.do === "cancel") {
      this.asking = null;
      this.status = "";
    } else if (a.do === "approve") {
      const opened = this.asking;
      const t = target(this.items, opened);
      this.asking = null;
      if (t) this.runKit(["approve", t.id], `${t.key}: ${t.kind === "stuck" ? "repairing" : "approving"}…`, cx);
      else this.status = afterRefresh(this.items, opened, opened?.kind === "stuck" ? "repair" : "approve").status ?? "";
    } else if (a.do === "back") {
      this.backFor = it;
      this.backing = InputState.new({ placeholder: `What should change in ${it.key}? Enter sends, Esc cancels` });
      this.backing.on("submit", (_e, cx) => this.sendBack(cx));
      this.backing.focus();
    }
    cx.notify();
  }

  sendBack(cx) {
    const opened = this.backFor;
    const it = target(this.items, opened);
    const text = this.backing?.value().trim() ?? "";
    this.closeBack();
    if (!it && opened) this.status = afterRefresh(this.items, opened, "back").status;
    else if (it && text) this.runKit(["back", it.id, text], `${it.key}: sending back…`, cx);
    this.handle.focus();
    cx.notify();
  }

  closeBack() {
    this.backing?.release();
    this.backing = null;
    this.backFor = null;
  }

  runKit(args, busy, cx) {
    this.say(busy, cx);
    cx.spawn(async (cx) => {
      const { cmd, args: argv } = this.kit(...args);
      let res;
      try {
        res = await exec(cmd, argv, { timeout: 600 * 1000 });
      } catch (e) {
        res = { code: 1, stdout: "", stderr: String(e?.message ?? e) };
      }
      const last = (s) => s.trim().split("\n").filter(Boolean).pop() ?? "";
      this.status = res.code === 0 ? last(res.stdout) || "Done." : `Not done: ${last(res.stderr) || last(res.stdout) || `exit ${res.code}`}`;
      if (res.code === 0) notify({ title: "Review list", body: this.status, level: "info", timeout: 4000 });
      cx.notify();
      this.refresh(cx);
    });
  }

  key(e, cx) {
    if (this.backing) {
      if (e.key === "escape") {
        this.closeBack();
        this.handle.focus();
        cx.notify();
        cx.stop_propagation();
      }
      return;
    }
    if (e.modifiers?.control || e.modifiers?.platform || e.modifiers?.alt) return;
    const a = keyAction(e.key, this.asking ?? this.current, { asking: Boolean(this.asking) });
    if (!a) return;
    this.act(a, cx);
    cx.stop_propagation();
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const it = this.current;
    const line = (text, color) => div().text_color(color).child(text);
    const head = h_flex().h(30).flex_none().px(12).gap(8).items_center().border_b_1().border_color(t.border)
      .child(svg(icon("list-checks")).size(15).flex_none().text_color(t.muted))
      .child(div().flex_1().font_semibold().text_color(t.foreground).truncate().child(this.loading ? "Review list · reading…" : header(this.items)))
      .child(h_flex().id("rl-refresh").p(3).rounded(5).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.act({ do: "refresh" }, cx))
        .child(svg(icon("refresh-cw")).size(13).text_color(t.dim)));

    // As tall as its rows, up to eight; more rows scroll, so the detail keeps its room.
    const list = v_flex().id("rl-list").flex_none().h(Math.min(this.items.length, 8) * ROW + 8).overflow_y_scrollbar().py(4).children(
      this.items.map((x, i) => {
        const r = row(x, now);
        const on = i === this.sel;
        return h_flex().id(`rl-row-${i}`).h(ROW).flex_none().px(12).gap(10).items_center().cursor_pointer()
          .bg(on ? t.selected : t.surface).hover((s) => s.bg(on ? t.selected : t.hover))
          .on_click((_e, cx) => { this.sel = i; this.asking = null; this.status = ""; this.handle.focus(); cx.notify(); })
          .child(div().w(54).flex_none().font_semibold().text_color(x.kind === "pr" ? t.muted : t.accent).child(r.kind))
          .child(div().w(96).flex_none().text_color(t.muted).truncate().child(r.product))
          .child(div().w(52).flex_none().text_color(t.dim).child(r.age))
          .child(div().flex_1().min_w(0).text_color(t.foreground).truncate().child(r.line));
      }),
    );

    const empty = v_flex().p(12).gap(4)
      .child(line(this.errors.length ? "Nothing could be read." : "Nothing waits for you: no spec, design, result or PR.", t.muted))
      .children(this.errors.map((e) => line(e, t.blocked)));

    const detail = it
      ? v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(12).py(8).gap(4).border_t_1().border_color(t.border)
        .child(div().font_semibold().text_color(t.foreground).child(`${it.key} · ${row(it, now).product}${it.repo && it.repo !== it.product ? ` (${it.repo})` : ""} · ${row(it, now).kind}, ${row(it, now).age} ago`))
        .child(line(it.title ?? "", t.muted))
        .when(links(it).length > 0, (el) => el.child(div().pt(4).text_size(11.5).text_color(t.dim).child("Links")))
        .children(links(it).map((l, n) =>
          v_flex().id(`rl-link-${n}`).cursor_pointer().on_click((_e, cx) => this.act({ do: "open", url: l.url }, cx))
            .child(h_flex().gap(6).items_center().child(div().text_color(t.foreground).child(`[${n + 1}] ${linkName(l)}`)).child(svg(icon("external-link")).size(11).text_color(t.dim)))
            .child(div().text_color(t.accent).child(l.url))))
        .children(notes(it).map((n) =>
          h_flex().pt(2).gap(6).items_start()
            .when(n.level === "warn", (el) => el.child(svg(icon("triangle-alert")).size(12).mt(2).flex_none().text_color(t.blocked)))
            .child(div().flex_1().min_w(0).text_color(n.level === "warn" ? t.blocked : t.dim).child(n.text))))
      : null;

    const foot = v_flex().flex_none().px(12).py(6).gap(4).border_t_1().border_color(t.border)
      .when(Boolean(this.backing), (el) => el.child(Input.new(this.backing).h(30).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background).text_color(t.foreground)))
      .when(Boolean(this.status), (el) => el.child(div().text_color(this.asking ? t.blocked : t.foreground).child(this.status)))
      .child(div().text_size(11.5).text_color(t.dim).child(footer(it)));

    return v_flex().id("review-list").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().min_h(0).bg(t.surface).text_size(12.5)
      .child(head)
      .child(this.items.length ? list : empty)
      .when(Boolean(detail), (el) => el.child(detail))
      .when(!detail, (el) => el.child(div().flex_1()))
      .child(foot);
  }
}
