import { join, basename, resolve } from "node:path";
import { existsSync, statSync, openSync, readSync, closeSync, readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { hostname } from "node:os";
import type { ServerWebSocket } from "bun";
import { config, saveConfig, CERT_DIR, PORTS, TMUX_SOCKET, HOME, DATA_DIR, writeJson, readJson, CFG_DIR } from "./config";
import { mkdirSync } from "node:fs";
const UPLOAD_DIR = join(DATA_DIR, "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });
import { canBackground, detectBtw, type Btw } from "./tmux";
import { tmux, listPanes, capture, detectPrompt, sendKeys, sendText, chooseOption, newSession, sessionExists, type Prompt } from "./tmux";
import {
  listClaudeProcs, matchPane, ttyLastInput, transcriptPath, readTail, readRange, fileSize, parseLines,
  sessionTitle, lastAssistantText, recentSessions, knownProjectDirs,
} from "./claude";
import { detectAskForm, answerAsk, sameQuestion, type AskAnswer } from "./tmux";
import { askQuestions, pendingAsk, isSessionId, type AskQuestion } from "./claude";
import { onToolHook, toolForScreen, toolLine } from "./approval";
import { setPushTap, type PushPayload } from "./push";
import { addSubscription, removeSubscription, pushAll, subscriptionCount, type PushPayload } from "./push";
import * as R from "./reviews";
import { getPref, setPref, gitChanges, localImage, search } from "./extras";
import { serveImage, variant, prewarm } from "./images";
import * as OC from "./opencode";
import * as Auth from "./auth";
import { startUpdateChecks, newerRelease, loadState as updateState, REPO } from "./updates";
import { getCompactWindow, setCompactWindow } from "./compact";
import { contextUsage, agentCounts, listAgents, agentTranscript, agentChat, waitingOn, type Context, type Wait } from "./subagents";

const ROOT = resolve(import.meta.dir, "..");
const PUBLIC = join(ROOT, "public");
const VENDOR: Record<string, string> = {
  "ansi_up.js": join(ROOT, "node_modules/ansi_up/ansi_up.js"),
  "marked.js": join(ROOT, "node_modules/marked/lib/marked.esm.js"),
  "purify.js": join(ROOT, "node_modules/dompurify/dist/purify.es.mjs"),
};

const VERSION: string = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")).version;
// Build id: changes whenever a file in public/ changes, so open phones can reload themselves.
import { readdirSync as _rd } from "node:fs";
function buildId() {
  let h = 0;
  const walk = (d: string) => { for (const f of _rd(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else h = (h * 31 + Math.floor(statSync(p).mtimeMs)) | 0; } };
  walk(PUBLIC);
  return (h >>> 0).toString(36);
}
let BUILD = buildId();
setInterval(() => { const b = buildId(); if (b !== BUILD) { BUILD = b; broadcast({ type: "build", build: BUILD }); } }, 5000);

// Optional release check: one notification per newer version, opening the release page.
const updates = startUpdateChecks(() => config.settings.updateCheck, (r) => {
  console.log(`Agents Away ${r.version} is available (running ${VERSION}): ${r.url}`);
  pushAll({ kind: "info", tag: "update", title: `Agents Away ${r.version} is available`, body: `You're running ${VERSION}. Tap to see what's new.`, url: r.url }).catch(() => {});
});

// ───────────────────────── session model ─────────────────────────

type Status = "working" | "waiting" | "idle";
type Session = {
  id: string;
  pid: number;
  name: string;
  title: string | null;
  cwd: string;
  status: Status;
  tmux: { socket: string; pane: string; session: string; attached: boolean; cols: number } | null;
  attention: { message: string; at: number } | null;
  prompt: Prompt | null;
  lastInputAt: number;
  activityAt: number;
  startedAt: number;
  doneAt: number;
  kind?: "claude" | "opencode";
  agentName?: string;
  modelName?: string;
  /** Reasoning effort: Claude Code's from the transcript, OpenCode's model variant. */
  effort?: string | null;
  permId?: string;
  /** Claude Code shows "ctrl+b to run in background" for the running command or subagent. */
  canBackground?: boolean;
  /** Claude Code's /btw side-answer panel, while it's on screen. */
  btw?: Btw | null;
  /** Background work still running (subagents, background commands): what a pending Yield waits on. */
  waits?: Wait[];
  context?: Context | null; // Claude Code: % of the context window in use
  agents?: { total: number; running: number } | null; // Claude Code: subagents spawned by this session
  ask?: Ask | null; // Claude Code: an AskUserQuestion form on screen
};

const sessions = new Map<string, Session>();

// ───────── OpenCode sessions (polled + event-driven) ─────────
let ocSessions: OC.OcSession[] = [];
let ocRefreshing: Promise<void> | null = null;
function refreshOpenCode() {
  if (!ocRefreshing) ocRefreshing = OC.listSessions().then((l) => { ocSessions = l; }).catch(() => { ocSessions = []; }).finally(() => (ocRefreshing = null));
  return ocRefreshing;
}
setInterval(refreshOpenCode, 5000);
refreshOpenCode();

function ocToSession(o: OC.OcSession): Session {
  const perm = o.permissions[0];
  const prompt: Prompt | null = perm ? {
    question: perm.message || `Allow ${perm.action}?`,
    context: (perm.resources ?? []).slice(0, 6).map(String),
    options: [{ n: 1, label: "Allow once" }, { n: 2, label: "Always allow" }, { n: 3, label: "Reject" }],
    selected: 1, key: perm.id, tool: perm.tool ?? null,
  } : ocFormPrompt(o.forms[0]);
  const h = hs(o.id);
  return {
    id: o.id, pid: 0, name: o.title, title: o.title, cwd: o.cwd, context: o.context, agents: o.agents,
    status: prompt ? "waiting" : o.running ? "working" : "idle",
    tmux: null, attention: null, prompt, lastInputAt: 0, activityAt: o.updated, startedAt: o.created, doneAt: h.doneAt,
    kind: "opencode", agentName: o.agent, modelName: o.model?.id, effort: o.model?.variant || null,
    permId: perm?.id,
  };
}
/** An OpenCode question form as the session's prompt: the phone renders `form` (fields/options) as a card. */
function ocFormPrompt(f: any): (Prompt & { form: unknown }) | null {
  if (!f) return null;
  const fields = (f.fields ?? []).filter((x: any) => !x.hidden);
  const first = fields[0];
  const question = fields.length === 1 ? (first.description || first.title || f.title) : f.title || "OpenCode has questions";
  return { question, context: [], options: [], selected: 0, form: { id: f.id, title: f.title, fields } };
}
const hookState = new Map<string, { attention: { message: string; at: number } | null; doneAt: number; promptAt: number; lastPushDone: number }>();
function hs(id: string) {
  let h = hookState.get(id);
  if (!h) { h = { attention: null, doneAt: 0, promptAt: 0, lastPushDone: 0 }; hookState.set(id, h); }
  return h;
}

let lastSnapshot = "";
async function refresh() {
  const [panes, procs] = await Promise.all([listPanes(), listClaudeProcs()]);
  const seen = new Set<string>();
  for (const p of procs) {
    if (!p.sessionId) continue;
    seen.add(p.sessionId);
    const pane = matchPane(p, panes);
    const tpath = transcriptPath(p.sessionId, p.cwd);
    const h = hs(p.sessionId);
    let prompt: Prompt | null = null, ask: Ask | null = null, bg = false, btw: Btw | null = null;
    if (pane) {
      const screen = await capture(pane.socket, pane.paneId);
      bg = !!screen && canBackground(screen);
      btw = screen ? detectBtw(screen, pane.width) : null;
      prompt = screen ? detectPrompt(screen) : null;
      if (screen) ({ ask, prompt } = askState(p.sessionId, tpath, screen, prompt));
      if (prompt && screen) prompt = { ...prompt, tool: toolForScreen(p.sessionId, screen) };
    }
    // A permission notification that is no longer on screen has been answered (at the PC, usually).
    if (h.attention && pane && !prompt && Date.now() - h.attention.at > 4000) h.attention = null;
    let status: Status;
    if (prompt || ask || h.attention) status = "waiting";
    else if (p.status === "busy" && !(h.doneAt > h.promptAt && h.doneAt > p.statusUpdatedAt)) status = "working";
    else status = "idle";
    sessions.set(p.sessionId, {
      id: p.sessionId, pid: p.pid, name: p.name, title: sessionTitle(tpath), cwd: p.cwd, status,
      tmux: pane ? { socket: pane.socket, pane: pane.paneId, session: pane.session, attached: pane.attached, cols: pane.width } : null,
      attention: h.attention, prompt, lastInputAt: ttyLastInput(p.tty),
      activityAt: tpath ? statSync(tpath).mtimeMs : 0, startedAt: p.startedAt, doneAt: h.doneAt,
      context: contextUsage(tpath), agents: agentCountsFor(p.sessionId, tpath, true), ask,
      canBackground: bg && !prompt && !ask, btw,
      waits: (() => { const w = waitingOn(tpath, true); return w.length ? w : undefined; })(),
    });
  }
  // Agents Away-socket panes Claude hasn't registered yet (e.g. sitting at the folder-trust prompt).
  const matched = new Set([...sessions.values()].filter((s) => seen.has(s.id) && s.tmux).map((s) => s.tmux!.socket + s.tmux!.pane));
  for (const pane of panes) {
    if (pane.socket !== TMUX_SOCKET || matched.has(pane.socket + pane.paneId)) continue;
    const id = `pane-${pane.socket}-${pane.paneId.slice(1)}`;
    seen.add(id);
    const screen = await capture(pane.socket, pane.paneId);
    const prompt = screen ? detectPrompt(screen) : null;
    const prev = sessions.get(id);
    sessions.set(id, {
      id, pid: pane.panePid, name: pane.session, title: prompt ? "Starting — needs you" : "Starting…", cwd: pane.cwd, status: prompt ? "waiting" : "working",
      tmux: { socket: pane.socket, pane: pane.paneId, session: pane.session, attached: pane.attached, cols: pane.width },
      attention: null, prompt, lastInputAt: ttyLastInput(pane.tty), activityAt: Date.now(), startedAt: prev?.startedAt ?? Date.now(), doneAt: 0,
    });
  }
  for (const o of ocSessions) { seen.add(o.id); sessions.set(o.id, ocToSession(o)); }
  for (const id of [...sessions.keys()]) if (!seen.has(id)) sessions.delete(id);
  const snap = JSON.stringify(publicSessions());
  if (snap !== lastSnapshot) {
    lastSnapshot = snap;
    broadcast({ type: "sessions", sessions: JSON.parse(snap) });
  }
}

function publicSessions() {
  return [...sessions.values()]
    .map(({ lastInputAt, ...s }) => {
      const pr = getPref(s.id);
      return { ...s, kind: s.kind ?? "claude", canReply: !!s.tmux || s.kind === "opencode", home: s.cwd.replace(HOME, "~"), customName: pr.name ?? null, pinned: !!pr.pinned, muted: !!pr.muted };
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.startedAt - a.startedAt);
}

let refreshing: Promise<void> | null = null;
function refreshNow() {
  if (!refreshing) refreshing = refresh().catch((e) => console.error("refresh", e)).finally(() => (refreshing = null));
  return refreshing;
}
setInterval(refreshNow, 1500);

function cwdOfTranscript(id: string): string | null {
  const path = transcriptPath(id);
  if (!path) return null;
  const head = readRange(path, 0, 64 * 1024);
  const mm = head.match(/"cwd":"((?:[^"\\]|\\.)*)"/);
  try { return mm ? JSON.parse(`"${mm[1]}"`) : null; } catch { return null; }
}

/** Subagents minus the ones cleared from the list in this app. */
function visibleAgents<T extends { id: string }>(sessionId: string, list: T[]) {
  const hidden = getPref(sessionId).hiddenAgents;
  return hidden?.length ? list.filter((a) => !hidden.includes(a.id)) : list;
}
function agentCountsFor(sessionId: string, tpath: string | null, live: boolean) {
  if (!getPref(sessionId).hiddenAgents?.length) return agentCounts(tpath, live);
  const l = visibleAgents(sessionId, listAgents(tpath, live, false));
  return l.length ? { total: l.length, running: l.filter((a) => a.status === "running").length } : null;
}

function displayName(s: Session) {
  return getPref(s.id).name || s.title || s.name;
}

// ───────────────────────── notifications ─────────────────────────

function phoneIsWatching(id: string) {
  for (const ws of clients) if (ws.data.visible && ws.data.watch?.id === id) return true;
  return false;
}

function shouldPush(s: Session | undefined, force = false) {
  if (force) return true;
  if (!s) return true;
  if (getPref(s.id).muted) return false;
  if (phoneIsWatching(s.id)) return false;
  if (config.settings.quietWhenActive && s.lastInputAt && Date.now() - s.lastInputAt < config.settings.activeWindowSec * 1000) {
    // Typed at the PC (or from the phone) very recently: you're probably looking at it.
    return false;
  }
  return true;
}

/** This PC's name in the apps (a profile in the Android app). */
const profileName = () => config.settings.profileName || hostname();

// ───────── notification listeners (the Android app's own connection, instead of Web Push) ─────────
setPushTap((p) => {
  let n = 0;
  for (const ws of clients) if (ws.data.listen) { try { ws.send(JSON.stringify({ type: "notify", ...p })); n++; } catch {} }
  return n;
});
/** What still needs the user, as notifications: sent when a listener (re)connects, so nothing is lost while
 *  the phone was offline. The app skips the ones it has already shown. */
function pendingNotifications(): PushPayload[] {
  const out: PushPayload[] = [];
  for (const s of sessions.values()) {
    if (s.status !== "waiting" || getPref(s.id).muted) continue;
    const id = s.id, url = `/#/s/${id}`, title = displayName(s);
    if (s.ask) out.push({ kind: "attention", sessionId: id, tag: "s-" + id, title, body: askLine(s.ask), url, actions: [{ action: "open", title: "Answer" }] });
    else if (s.prompt) {
      const body = s.prompt.tool ? toolLine(s.prompt.tool) : s.prompt.form ? "Question: " + s.prompt.question : s.prompt.question;
      const approve = !s.prompt.form && (s.tmux || s.kind === "opencode");
      out.push({ kind: "attention", sessionId: id, tag: "s-" + id, promptKey: s.kind === "opencode" ? s.permId : s.prompt.key, title, body, url,
        actions: approve ? [{ action: "approve", title: "Allow" }, { action: "open", title: "Open" }] : [{ action: "open", title: "Open" }] });
    } else if (s.attention) out.push({ kind: "attention", sessionId: id, tag: "s-" + id, title, body: s.attention.message, url, actions: [{ action: "open", title: "Open" }] });
  }
  for (const r of R.listReviews()) {
    if (r.status !== "pending") continue;
    out.push({ kind: "review", reviewId: r.id, tag: "r-" + r.id, title: `Review: ${r.title}`, body: r.message || `${r.files.length} file(s) to look at`,
      url: `/#/review/${r.id}`, actions: [{ action: "review-approve", title: "Approve" }, { action: "open", title: "Comment" }] });
  }
  return out;
}

function plain(md: string, n = 220) {
  const t = md.replace(/```[\s\S]*?```/g, "[code]").replace(/[`*_#>|]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

async function onHook(ev: any) {
  const id: string = ev.session_id;
  const name: string = ev.hook_event_name;
  if (!id || !name) return;
  if (name !== "PostToolUse" && name !== "PreToolUse") console.log("hook", name, id.slice(0, 8), ev.message ?? "");
  onToolHook(id, ev);
  const h = hs(id);
  if (name === "UserPromptSubmit") { h.promptAt = Date.now(); h.attention = null; }
  else if (name === "PostToolUse") { h.attention = null; }
  else if (name === "Stop") { h.doneAt = Date.now(); h.attention = null; }
  askHook(id, ev);
  await refreshNow();
  const s = sessions.get(id);

  if (name === "Notification") {
    const msg: string = ev.message ?? "Claude needs your attention";
    const idle = ev.notification_type === "idle_prompt" || /waiting for your input/i.test(msg);
    if (idle) {
      // We already said "finished" for this turn; don't nag twice.
      if (Date.now() - h.lastPushDone < 15 * 60_000) return;
    } else {
      h.attention = { message: msg, at: Date.now() };
      await Bun.sleep(400);
      await refreshNow();
    }
    const cur = sessions.get(id);
    if (cur?.ask && !idle) h.attention = { message: askLine(cur.ask), at: Date.now() };
    if (!config.settings.notifyOnAttention || !shouldPush(cur)) return;
    if (cur?.ask && !idle) {
      await pushAll({ kind: "attention", sessionId: id, tag: "s-" + id, title: displayName(cur), body: askLine(cur.ask), url: `/#/s/${id}`, actions: [{ action: "open", title: "Answer" }] });
      return;
    }
    const actions = cur?.prompt && cur.tmux ? [{ action: "approve", title: "Allow" }, { action: "open", title: "Open" }] : [];
    await pushAll({
      kind: idle ? "info" : "attention", sessionId: id, tag: "s-" + id, promptKey: cur?.prompt?.key,
      title: cur ? displayName(cur) : "Claude",
      body: cur?.prompt?.tool && !idle ? toolLine(cur.prompt.tool) : cur?.prompt && !idle ? `${msg}\n${cur.prompt.context.slice(-2).join(" ")}`.trim() : msg,
      url: `/#/s/${id}`, actions,
    });
  } else if (name === "Stop") {
    if (!config.settings.notifyOnStop || !shouldPush(s)) return;
    h.lastPushDone = Date.now();
    const text = ev.last_assistant_message || lastAssistantText(ev.transcript_path ?? transcriptPath(id, s?.cwd));
    await pushAll({
      kind: "done", sessionId: id, tag: "s-" + id,
      title: `✓ ${s ? displayName(s) : "Claude finished"}`,
      body: text ? plain(text) : "Finished — your turn.",
      url: `/#/s/${id}`, actions: s?.tmux ? [{ action: "open", title: "Reply" }] : [],
    });
  }
}

// ───────── Claude Code AskUserQuestion ─────────
// The questions come from the PreToolUse hook (the transcript only gets the tool_use once it's answered in
// current Claude Code), else from the transcript, else from the screen itself (then only the visible question).
type Ask = { id: string | null; questions: AskQuestion[]; current: number; partial: boolean; tabs: { header: string; done: boolean }[] };
const askHooks = new Map<string, { id: string; questions: AskQuestion[] }>();
const askBusy = new Set<string>();

function askHook(id: string, ev: any) {
  const name = ev.hook_event_name, isAsk = ev.tool_name === "AskUserQuestion";
  if (name === "PreToolUse" && isAsk) {
    const questions = askQuestions(ev.tool_input);
    if (questions) askHooks.set(id, { id: String(ev.tool_use_id ?? ""), questions });
  } else if ((name === "PostToolUse" && isAsk) || name === "UserPromptSubmit" || name === "Stop") askHooks.delete(id);
}

function askLine(a: Ask) {
  const q = a.questions[Math.max(0, a.current)] ?? a.questions[0];
  return `Claude is asking: ${q.question}${!a.partial && a.questions.length > 1 ? ` (+${a.questions.length - 1} more)` : ""}`;
}

function askState(id: string, tpath: string | null, screen: string, prompt: Prompt | null): { ask: Ask | null; prompt: Prompt | null } {
  const form = detectAskForm(screen);
  if (!form) return { ask: null, prompt };
  // The review step is an ordinary menu (Submit answers / Cancel): keep the prompt card, with a better title.
  if (form.review) return { ask: null, prompt: prompt && { ...prompt, question: "Review your answers", context: form.summary } };
  const known = askHooks.get(id) ?? pendingAsk(tpath);
  const current = known ? known.questions.findIndex((q) => sameQuestion(q.question, form.question)) : -1;
  if (known && current >= 0 && known.questions.length === form.tabs.length) {
    return { ask: { id: known.id, questions: known.questions, current, partial: false, tabs: form.tabs }, prompt: null };
  }
  const tab = form.tabs.length === 1 ? form.tabs[0] : null;
  const q: AskQuestion = {
    question: form.question, header: tab?.header ?? "", multiSelect: form.multi,
    options: form.options.slice(0, -1).map((o) => ({ label: o.label, description: o.description })),
  };
  return { ask: { id: null, questions: [q], current: 0, partial: true, tabs: form.tabs }, prompt: null };
}

// ───────── OpenCode live events → refresh, chat updates, notifications ─────────
let ocRefreshTimer: Timer | null = null;
function ocSoon() {
  if (ocRefreshTimer) return;
  ocRefreshTimer = setTimeout(() => { ocRefreshTimer = null; refreshOpenCode().then(refreshNow); }, 300);
}
OC.subscribe(async (type, data) => {
  const id: string | undefined = data?.sessionID ?? data?.form?.sessionID;
  if (id) for (const ws of clients) if (ws.data.watch?.oc && ws.data.watch.id === id) ws.data.watch.oc.dirty = true;
  if (/^(permission|session\.(idle|status|execution|inbox|created|renamed)|form)/.test(type)) ocSoon();
  if (!id) return;
  const top = () => ocSessions.some((o) => o.id === id);
  if (type === "permission.asked") {
    await refreshOpenCode(); await refreshNow();
    if (!top() || !config.settings.notifyOnAttention) return;
    const s = sessions.get(id);
    if (!shouldPush(s)) return;
    const pt = sessions.get(id)?.prompt?.tool;
    const what = pt ? toolLine(pt) : data.message || `${data.action}${data.resources?.length ? ": " + data.resources.slice(0, 2).join(", ") : ""}`;
    await pushAll({ kind: "attention", sessionId: id, tag: "s-" + id, promptKey: data.id ?? s?.permId, title: s ? displayName(s) : "OpenCode", body: `Permission: ${what}`, url: `/#/s/${id}`, actions: [{ action: "approve", title: "Allow" }, { action: "open", title: "Open" }] });
  } else if (type === "session.execution.succeeded" || type === "session.execution.failed") {
    hs(id).doneAt = Date.now();
    await refreshOpenCode(); await refreshNow();
    if (!top() || !config.settings.notifyOnStop) return;
    const s = sessions.get(id);
    if (!shouldPush(s)) return;
    let body = "Finished — your turn.";
    if (type === "session.execution.failed") body = "Stopped with an error: " + (data.error?.message ?? "unknown error");
    else {
      try { const items = await OC.messages(id, 6); const last = [...items].reverse().find((i) => i.k === "text") as any; if (last) body = plain(last.text); } catch {}
    }
    hs(id).lastPushDone = Date.now();
    await pushAll({ kind: "done", sessionId: id, tag: "s-" + id, title: `${type.endsWith("failed") ? "⚠" : "✓"} ${s ? displayName(s) : "OpenCode"}`, body, url: `/#/s/${id}`, actions: [{ action: "open", title: "Reply" }] });
  } else if (type === "form.created") {
    await refreshOpenCode(); await refreshNow();
    if (!top() || !config.settings.notifyOnAttention) return;
    const s = sessions.get(id);
    if (!shouldPush(s)) return;
    await pushAll({ kind: "attention", sessionId: id, tag: "s-" + id, title: s ? displayName(s) : "OpenCode", body: "Question: " + (ocFormPrompt(data.form)?.question ?? "OpenCode is asking you something"), url: `/#/s/${id}` });
  }
});

// ───────────────────────── reviews ─────────────────────────

function reviewSummary(r: R.Review) {
  const { key, ...rest } = r;
  return { ...rest, media: r.files.map((f) => ({ ...f, url: `/media/${r.id}/${f.name}?k=${key}` })) };
}

async function deliverReview(r: R.Review) {
  if (R.resolveWaiters(r) > 0) { r.delivered = true; R.save(r); return "cli"; }
  if (r.deliverToSession && r.session?.id && isOc(r.session.id)) {
    // OpenCode: post the answer as a message (queued if it's mid-step).
    try {
      await OC.prompt(r.session.id, `[Phone review of "${oneLine(r.title)}" (id ${r.id})] ${R.decisionText(r).replace("\n", " — ")}`, sessions.get(r.session.id)?.status === "working");
      r.delivered = true; R.save(r);
      return "session";
    } catch (e) { console.error("deliver review (opencode)", e); return "stored"; }
  }
  if (!r.deliverToSession || !r.session?.pane || !r.session.socket) return "stored";
  const s = r.session.id ? sessions.get(r.session.id) : undefined;
  const socket = s?.tmux?.socket ?? r.session.socket;
  const pane = s?.tmux?.pane ?? r.session.pane;
  const msg = `[Phone review of "${oneLine(r.title)}" (id ${r.id})] ${R.decisionText(r).replace("\n", " — ")}`;
  try {
    await sendText(socket, pane, msg, true);
    r.delivered = true; R.save(r);
    return "session";
  } catch (e) {
    console.error("deliver review", e);
    return "stored";
  }
}

// ───────────────────────── websocket ─────────────────────────

type OcWatch = { sigs: string[]; dirty: boolean; lastPoll: number; queue: string; busy: boolean; termAt?: number; termBusy?: boolean };
type WsData = { deviceKey?: string; watch: { id: string; chat: boolean; term: boolean; offset: number; lastTerm: string; oc?: OcWatch } | null; visible: boolean; listen?: boolean };

const isOc = (id: string) => sessions.get(id)?.kind === "opencode" || id.startsWith("ses_");

/** Poll an OpenCode session's messages for one watcher; send only what's new when possible. */
async function ocSync(ws: ServerWebSocket<WsData>, id: string, reset: boolean) {
  const w = ws.data.watch;
  if (!w?.oc || w.id !== id || w.oc.busy) return;
  w.oc.busy = true;
  try {
    const items = await OC.messages(id, 80);
    if (ws.data.watch !== w) return;
    const sigs = items.map((i) => JSON.stringify(i));
    const old = w.oc.sigs;
    const prefix = !reset && old.length <= sigs.length && old.every((x, i) => x === sigs[i]);
    if (reset || !prefix) ws.send(JSON.stringify({ type: "chat", id, reset: true, items, start: 0, end: items.length || 1 }));
    else if (sigs.length > old.length) ws.send(JSON.stringify({ type: "chat", id, items: items.slice(old.length), end: items.length }));
    w.oc.sigs = sigs;
    const q = await OC.inbox(id);
    const qs = JSON.stringify(q);
    if (qs !== w.oc.queue) { w.oc.queue = qs; ws.send(JSON.stringify({ type: "queue", id, items: q })); }
  } catch (e: any) {
    if (reset) ws.send(JSON.stringify({ type: "chat", id, reset: true, items: [{ k: "note", text: "⚠ " + e.message }], start: 0, end: 1 }));
  } finally {
    w.oc.busy = false; w.oc.dirty = false; w.oc.lastPoll = Date.now();
  }
}
/** Terminal tab of an OpenCode session: its newest persistent PTY (OpenCode's own terminal panel), ~1×/s. */
async function ocTermSync(ws: ServerWebSocket<WsData>, id: string) {
  const w = ws.data.watch;
  if (!w?.oc || w.oc.termBusy || Date.now() - (w.oc.termAt ?? 0) < 1000) return;
  w.oc.termBusy = true;
  try {
    const t = await OC.terminal(id);
    const snap = t ? await OC.terminalScreen(t.id) : null;
    const msg = JSON.stringify({ type: "term", id, screen: snap?.screen ?? "", oc: snap ? { cols: snap.cols, title: snap.title, status: snap.status } : { none: true } });
    if (ws.data.watch === w && msg !== w.lastTerm) { w.lastTerm = msg; ws.send(msg); }
  } catch (e: any) {
    const msg = JSON.stringify({ type: "term", id, screen: "", oc: { none: true, error: e.message } });
    if (ws.data.watch === w && msg !== w.lastTerm) { w.lastTerm = msg; ws.send(msg); }
  } finally { w.oc.termBusy = false; w.oc.termAt = Date.now(); }
}
const clients = new Set<ServerWebSocket<WsData>>();

function broadcast(msg: unknown) {
  const s = JSON.stringify(msg);
  for (const ws of clients) ws.send(s);
}

function sessionFor(id: string) {
  return sessions.get(id);
}

const INITIAL_ITEMS = 70;

/** Tail of a transcript as a "reset" message (also used to prefetch neighbouring sessions). */
function chatSnapshot(id: string, peek = false) {
  const path = transcriptPath(id, sessionFor(id)?.cwd);
  if (!path) return { type: "chat", id, reset: true, peek, items: [], start: 0, end: 0 };
  const end = lastNewlineBefore(path, fileSize(path));
  const t = readTail(path, end, INITIAL_ITEMS);
  return { type: "chat", id, reset: true, peek, items: t.items, start: t.start, end };
}

function startWatch(ws: ServerWebSocket<WsData>, id: string, chat: boolean, term: boolean, from = 0) {
  const s = sessionFor(id);
  ws.data.watch = { id, chat, term, offset: 0, lastTerm: "" };
  if (isOc(id)) {
    ws.data.watch.oc = { sigs: [], dirty: false, lastPoll: 0, queue: "", busy: false };
    if (chat) ocSync(ws, id, true);
    return;
  }
  const path = transcriptPath(id, s?.cwd);
  if (chat && path) {
    const end = lastNewlineBefore(path, fileSize(path));
    if (from > 0 && from <= end) {
      // The phone already has everything up to `from` cached: send only what's new.
      ws.data.watch.offset = end;
      const { items } = parseLines(readRange(path, from, end), from);
      ws.send(JSON.stringify({ type: "chat", id, resume: true, items, end }));
    } else {
      const snap = chatSnapshot(id);
      ws.data.watch.offset = snap.end;
      ws.send(JSON.stringify(snap));
    }
  } else if (chat) {
    ws.send(JSON.stringify({ type: "chat", id, reset: true, items: [], start: 0 }));
  }
}

/** Byte offset just after the last complete line (never inside a line that's still being written). */
function lastNewlineBefore(path: string, size: number) {
  let hi = size;
  while (hi > 0) {
    const lo = Math.max(0, hi - (1 << 20));
    const buf = readRangeBytes(path, lo, hi);
    const i = buf.lastIndexOf(10);
    if (i >= 0) return lo + i + 1;
    hi = lo;
  }
  return 0;
}
function readRangeBytes(path: string, start: number, end: number) {
  const fd = openSync(path, "r");
  try { const b = Buffer.alloc(end - start); const n = readSync(fd, b, 0, b.length, start); return b.subarray(0, n); }
  finally { closeSync(fd); }
}

async function tickWatchers() {
  for (const ws of clients) {
    const w = ws.data.watch;
    if (!w || !ws.data.visible) continue;
    const s = sessionFor(w.id);
    if (w.chat) {
      const path = transcriptPath(w.id, s?.cwd);
      if (path) {
        const size = fileSize(path);
        if (size < w.offset) { startWatch(ws, w.id, w.chat, w.term); continue; }
        if (size > w.offset) {
          // Only consume complete lines: Claude Code writes huge (100s of KB) log lines in pieces, and
          // stopping mid-line would make us skip whatever comes after it.
          const chunk = readRange(path, w.offset, size);
          const cut = chunk.lastIndexOf("\n");
          if (cut >= 0) {
            const text = chunk.slice(0, cut + 1);
            const end = w.offset + Buffer.byteLength(text);
            const { items } = parseLines(text, w.offset);
            w.offset = end;
            if (items.length) ws.send(JSON.stringify({ type: "chat", id: w.id, items, end }));
          }
        }
      }
    }
    if (w.oc) {
      if (w.chat && (w.oc.dirty || Date.now() - w.oc.lastPoll > 4000)) ocSync(ws, w.id, false);
      if (w.term) ocTermSync(ws, w.id);
      continue;
    }
    if (w.term && s?.tmux) {
      const screen = await capture(s.tmux.socket, s.tmux.pane, { ansi: true, history: 300 });
      if (screen !== null && screen !== w.lastTerm) {
        w.lastTerm = screen;
        ws.send(JSON.stringify({ type: "term", id: w.id, screen }));
      }
    }
  }
}
let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try { await tickWatchers(); } catch (e) { console.error("tick", e); } finally { ticking = false; }
}, 600);

// ───────────────────────── http helpers ─────────────────────────

const json = (d: unknown, status = 200) => Response.json(d, { status, headers: { "cache-control": "no-store" } });
const err = (msg: string, status = 400) => json({ error: msg }, status);

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}



async function serveStatic(path: string) {
  if (path === "/") path = "/index.html";
  const file = Bun.file(join(PUBLIC, path));
  if (!path.includes("..") && (await file.exists())) {
    const headers: Record<string, string> = { "cache-control": "no-cache" };
    if (path === "/sw.js") headers["service-worker-allowed"] = "/";
    if (path.endsWith(".webmanifest")) headers["content-type"] = "application/manifest+json";
    return new Response(file, { headers });
  }
  return null;
}

const PUBLIC_PATHS = new Set(["/sw.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/badge.png", "/icons/icon.svg", "/app.css", "/fonts.css", "/page-i18n.js"]);

function requireSession(id: string) {
  const s = sessions.get(id);
  if (!s) throw new HttpError(404, "Session not found (it may have ended)");
  if (!s.tmux) throw new HttpError(409, "This session isn't running inside tmux, so it can only be watched. Resume it from Agents Away or start it with the claude wrapper to reply.");
  return s as Session & { tmux: NonNullable<Session["tmux"]> };
}

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

function sanitizeName(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "claude";
}

async function uniqueName(base: string) {
  let n = sanitizeName(base);
  if (!(await sessionExists(n))) return n;
  for (let i = 2; i < 100; i++) if (!(await sessionExists(`${n}-${i}`))) return `${n}-${i}`;
  return `${n}-${Date.now() % 10000}`;
}

// ───────────────────────── main HTTPS app ─────────────────────────

async function api(req: Request, url: URL, deviceKey: string): Promise<Response> {
  const p = url.pathname;
  const m = (re: RegExp) => p.match(re);
  const body = async () => (req.method === "POST" ? await req.json().catch(() => ({})) : {});
  if (req.method === "POST" && req.headers.get("x-away") !== "1") return err("missing header", 403);

  if (p === "/api/state") {
    return json({
      sessions: publicSessions(),
      reviews: R.listReviews().slice(0, 40).map(reviewSummary),
      settings: config.settings,
      push: { publicKey: config.vapid.publicKey, subscribers: subscriptionCount() },
      host: hostname(),
      profile: profileName(),
      version: VERSION,
      // Only when the owner turned the check on: a newer release, shown in ⚙.
      update: config.settings.updateCheck ? newerRelease() : null,
    });
  }
  if (p === "/api/recent") {
    const live = new Set(sessions.keys());
    return json({
      recent: recentSessions(30).filter((r) => !live.has(r.sessionId)).map((r) => ({ ...r, home: r.cwd.replace(HOME, "~") })),
      dirs: knownProjectDirs().map((d) => ({ path: d, home: d.replace(HOME, "~") })),
    });
  }
  let mm;
  if ((mm = m(/^\/api\/session\/([\w-]+)\/(text|keys|choose|approve)$/)) && req.method === "POST" && sessions.get(mm[1])?.kind === "opencode") {
    const s = sessions.get(mm[1])!;
    const b = await body();
    try {
      if (b.term && (mm[2] === "text" || mm[2] === "keys")) {
        // Terminal tab: type into the session's OpenCode terminal instead of prompting the agent.
        const t = await OC.terminal(s.id);
        if (!t || t.status !== "running") return err("No terminal is open for this session", 409);
        const data = mm[2] === "text" ? String(b.text ?? "") + (b.submit !== false ? "\r" : "") : (Array.isArray(b.keys) ? b.keys.map((k: unknown) => OC.termKey(String(k))).join("") : "");
        if (data) await OC.terminalInput(t.id, data);
        for (const ws of clients) if (ws.data.watch?.id === s.id && ws.data.watch.oc) ws.data.watch.oc.termAt = 0;
        return json({ ok: true });
      }
      if (mm[2] === "text") {
        const text = String(b.text ?? "").trim();
        if (!text) return err("empty message");
        await OC.prompt(s.id, text, s.status === "working");
      } else if (mm[2] === "keys") {
        const keys: string[] = Array.isArray(b.keys) ? b.keys.map(String) : [];
        if (keys.some((k) => k === "Escape" || k === "C-c")) await OC.interrupt(s.id);
        else return err("Only Esc (interrupt) works for OpenCode sessions", 400);
      } else {
        if (!s.permId) return err("No permission request is pending any more", 409);
        if (b.key !== s.permId) return err("That request was already answered; a different one is showing now. Open the session to see it.", 409);
        const n = mm[2] === "approve" ? 1 : Number(b.n);
        await OC.replyPermission(s.id, s.permId, n === 1 ? "once" : n === 2 ? "always" : "reject");
      }
    } catch (e: any) { return err(e.message, 502); }
    refreshOpenCode().then(refreshNow);
    return json({ ok: true });
  }
  // Close Claude Code's /btw panel, only if it's still showing: an Esc without it would interrupt Claude.
  if ((mm = m(/^\/api\/session\/([\w-]+)\/btw\/close$/)) && req.method === "POST") {
    const s = requireSession(mm[1]);
    const screen = await capture(s.tmux.socket, s.tmux.pane);
    if (screen && detectBtw(screen)) await sendKeys(s.tmux.socket, s.tmux.pane, ["Escape"]);
    setTimeout(refreshNow, 250);
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/(text|keys|choose|approve)$/)) && req.method === "POST") {
    const s = requireSession(mm[1]);
    const b = await body();
    if (mm[2] === "text") {
      const text = String(b.text ?? "");
      if (text.length > 100_000) return err("too long");
      for (const r of R.listReviews()) {
        if (r.status !== "pending" || r.session?.id !== s.id || !R.hasWaiters(r.id)) continue;
        r.deliverToSession = true; R.save(r);
        R.resolveWaiters({ ...r, chatMessage: text });
      }
      await sendText(s.tmux.socket, s.tmux.pane, text, b.submit !== false);
    } else if (mm[2] === "keys") {
      await sendKeys(s.tmux.socket, s.tmux.pane, Array.isArray(b.keys) ? b.keys.map(String) : []);
    } else {
      try {
        // `key` (the prompt's fingerprint, from the app or the notification) is required: never answer a
        // prompt the phone hasn't seen.
        const key = String(b.key ?? "");
        if (mm[2] === "approve") await chooseOption(s.tmux.socket, s.tmux.pane, (p) => p.options.find((o) => /^yes\b/i.test(o.label))?.n ?? 1, key);
        else await chooseOption(s.tmux.socket, s.tmux.pane, () => Number(b.n), key);
      }
      catch (e: any) { return err(e.message, 409); }
      hs(s.id).attention = null;
    }
    setTimeout(refreshNow, 250);
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/ask$/)) && req.method === "POST" && sessions.get(mm[1])?.kind !== "opencode") {
    // Answer a Claude Code AskUserQuestion form: {answers: [{pick: [1-based option numbers], other?: "free text"}]}
    const s = requireSession(mm[1]);
    const a = sessions.get(s.id)?.ask;
    if (!a) return err("No question is showing in that session any more", 409);
    const b = await body();
    const answers: AskAnswer[] = (Array.isArray(b.answers) ? b.answers : []).map((x: any) => ({
      pick: (Array.isArray(x?.pick) ? x.pick : []).map(Number).filter((n: number) => Number.isInteger(n) && n > 0),
      other: typeof x?.other === "string" ? x.other.slice(0, 2000) : undefined,
    }));
    const qs = a.partial ? [a.questions[0]] : a.questions;
    if (answers.length !== qs.length) return err("Answer every question", 400);
    for (const [i, q] of qs.entries()) {
      const x = answers[i];
      if (!x.other?.trim() && !x.pick.length) return err(`Pick an answer for "${q.header || q.question}"`, 400);
      if (x.pick.some((n) => n > q.options.length) || (!q.multiSelect && x.pick.length > 1)) return err("Option not available", 400);
    }
    if (askBusy.has(s.id)) return err("Already answering", 409);
    askBusy.add(s.id);
    try { await answerAsk(s.tmux.socket, s.tmux.pane, qs.map((q) => q.question), answers, !a.partial); }
    catch (e: any) { return err(e.message, 409); }
    finally { askBusy.delete(s.id); }
    hs(s.id).attention = null;
    setTimeout(refreshNow, 250);
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/close$/)) && req.method === "POST" && sessions.get(mm[1])?.kind === "opencode") {
    // OpenCode has no terminal to close: stop it if it's running, then archive it (kept in OpenCode, off the list).
    const id = mm[1];
    if (sessions.get(id)!.status === "working") await OC.interrupt(id).catch(() => {});
    await OC.archive(id, true);
    ocSessions = ocSessions.filter((o) => o.id !== id);
    sessions.delete(id);
    broadcast({ type: "sessions", sessions: publicSessions() });
    return json({ ok: true, archived: true });
  }
  // ── OpenCode question forms: answer {formID, answer: {key: value}} or dismiss {formID, cancel: true} ──
  if ((mm = m(/^\/api\/session\/([\w-]+)\/form$/)) && req.method === "POST" && isOc(mm[1])) {
    const b = await body();
    const formID = String(b.formID ?? "");
    if (!/^frm_[\w-]+$/.test(formID)) return err("bad form id");
    try {
      if (b.cancel) await OC.cancelForm(mm[1], formID, b.message ? String(b.message).slice(0, 2000) : undefined);
      else await OC.replyForm(mm[1], formID, b.answer && typeof b.answer === "object" ? b.answer : {});
    } catch (e: any) { return err(e.message, /settled|not found/i.test(e.message) ? 409 : 502); }
    await refreshOpenCode(); await refreshNow();
    return json({ ok: true });
  }
  // ── OpenCode terminal: open one for the session (shown in the Terminal tab) ──
  if ((mm = m(/^\/api\/session\/([\w-]+)\/terminal$/)) && req.method === "POST" && sessions.get(mm[1])?.kind === "opencode") {
    const s = sessions.get(mm[1])!;
    const b = await body();
    try { await OC.createTerminal(s.id, s.cwd, Math.max(40, Math.min(200, Number(b.cols) || 100)), Math.max(10, Math.min(80, Number(b.rows) || 32))); }
    catch (e: any) { return err(e.message, 502); }
    for (const ws of clients) if (ws.data.watch?.id === s.id && ws.data.watch.oc) ws.data.watch.oc.termAt = 0;
    return json({ ok: true });
  }
  // "Send now" for a queued message: Claude Code delivers queued input on Ctrl+X Ctrl+S; OpenCode takes
  // its inbox once the current step stops, so interrupt it.
  if ((mm = m(/^\/api\/session\/([\w-]+)\/sendnow$/)) && req.method === "POST") {
    const s = sessions.get(mm[1]);
    if (!s) return err("Session not found", 404);
    if (s.kind === "opencode") await OC.interrupt(s.id);
    else {
      const t = requireSession(s.id);
      await sendKeys(t.tmux.socket, t.tmux.pane, ["C-x", "C-s"]);
    }
    return json({ ok: true });
  }
  // Auto-compact point for a Claude model (Claude Code's own per-model setting).
  if (p === "/api/compact") {
    const model = url.searchParams.get("model") ?? "";
    if (req.method === "POST") {
      const b = await body();
      try { return json({ window: setCompactWindow(String(b.model ?? ""), b.window === "auto" ? "auto" : Number(b.window)) }); }
      catch (e: any) { return err(e.message, 400); }
    }
    try { return json({ window: getCompactWindow(model) }); } catch { return err("Can't read Claude Code's settings.json", 500); }
  }
  // Compact now: interrupt the current step if needed, clear the input line, run /compact.
  if ((mm = m(/^\/api\/session\/([\w-]+)\/compact$/)) && req.method === "POST") {
    if (sessions.get(mm[1])?.kind === "opencode") return err("Not available for OpenCode yet", 400);
    const s = requireSession(mm[1]);
    if (s.status === "working") { await sendKeys(s.tmux.socket, s.tmux.pane, ["Escape"]); await Bun.sleep(700); }
    await tmux(s.tmux.socket, ["send-keys", "-t", s.tmux.pane, "C-u"]);
    await sendText(s.tmux.socket, s.tmux.pane, "/compact", true);
    setTimeout(refreshNow, 800);
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/unarchive$/)) && req.method === "POST") {
    await OC.archive(mm[1], false);
    await refreshOpenCode(); await refreshNow();
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/close$/)) && req.method === "POST") {
    const s = requireSession(mm[1]);
    const b = await body();
    if (b.force) {
      await tmux(s.tmux.socket, ["kill-pane", "-t", s.tmux.pane]);
    } else {
      // Graceful: interrupt whatever is running, clear the input line, then /exit.
      await sendKeys(s.tmux.socket, s.tmux.pane, ["Escape"]);
      await Bun.sleep(300);
      await tmux(s.tmux.socket, ["send-keys", "-t", s.tmux.pane, "C-u"]);
      await sendText(s.tmux.socket, s.tmux.pane, "/exit", true);
    }
    setTimeout(refreshNow, 800);
    setTimeout(refreshNow, 3000);
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/prefs$/)) && req.method === "POST") {
    const b = await body();
    const patch: any = {};
    if ("name" in b) patch.name = b.name === null ? undefined : String(b.name);
    if ("pinned" in b) patch.pinned = !!b.pinned;
    if ("muted" in b) patch.muted = !!b.muted;
    const pr = setPref(mm[1], patch);
    lastSnapshot = ""; refreshNow();
    return json({ prefs: pr });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/changes$/))) {
    const cwd = sessions.get(mm[1])?.cwd ?? cwdOfTranscript(mm[1]) ?? url.searchParams.get("cwd") ?? "";
    if (!cwd) return err("Unknown folder for this session", 404);
    return json(await gitChanges(cwd));
  }
  if (p === "/api/file") {
    const f = localImage(url.searchParams.get("path") ?? "");
    if (!f) return err("not an image file", 404);
    return serveImage(req, f, Bun.file(f).type, url.searchParams.get("w"));
  }
  if (p === "/api/search") {
    return json({ results: await search(url.searchParams.get("q") ?? "") });
  }
  // ── subagents (Task/Agent tool sub-sessions) of a Claude Code session ──
  if ((mm = m(/^\/api\/session\/([\w-]+)\/agents$/))) {
    const live = sessions.get(mm[1]);
    if (isOc(mm[1])) { try { return json({ agents: visibleAgents(mm[1], await OC.listAgents(mm[1])) }); } catch (e: any) { return err(e.message, 502); } }
    return json({ agents: visibleAgents(mm[1], listAgents(transcriptPath(mm[1], live?.cwd), !!live)) });
  }
  // "Clear" finished subagents from the list (only hidden in this app; Claude's files are untouched).
  if ((mm = m(/^\/api\/session\/([\w-]+)\/agents\/(clear|restore)$/)) && req.method === "POST") {
    const id = mm[1], live = sessions.get(id);
    const hidden = new Set(getPref(id).hiddenAgents ?? []);
    let ids: string[] = [];
    if (mm[2] === "clear") {
      const all: { id: string; status: string }[] = isOc(id) ? await OC.listAgents(id) : listAgents(transcriptPath(id, live?.cwd), !!live, false);
      ids = all.filter((a) => a.status !== "running" && !hidden.has(a.id)).map((a) => a.id);
      ids.forEach((x) => hidden.add(x));
    } else {
      const b = await body();
      ids = Array.isArray(b.ids) ? b.ids.map(String) : [...hidden];
      ids.forEach((x) => hidden.delete(x));
    }
    setPref(id, { hiddenAgents: [...hidden].slice(-500) });
    const s = sessions.get(id);
    if (s && s.kind !== "opencode") { s.agents = agentCountsFor(id, transcriptPath(id, s.cwd), true); broadcast({ type: "sessions", sessions: publicSessions() }); }
    return json({ ok: true, ids });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/agent\/([\w-]+)$/)) && isOc(mm[1])) {
    // OpenCode subagents are child sessions; `from` = items the phone has, `sig` = their hash (else a reset).
    try { return json(await OC.agentChat(mm[1], mm[2], Number(url.searchParams.get("from")) || 0, url.searchParams.get("sig") ?? "")); }
    catch (e: any) { return err(e.message, 404); }
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/agent\/([\w-]+)$/))) {
    const live = sessions.get(mm[1]);
    const tpath = transcriptPath(mm[1], live?.cwd);
    const path = agentTranscript(tpath, mm[2]);
    if (!path) return err("Subagent transcript not found", 404);
    const agent = listAgents(tpath, !!live).find((a) => a.id === mm![2]) ?? null;
    const q = (k: string) => Number(url.searchParams.get(k)) || 0;
    return json({ agent, ...agentChat(path, { from: q("from"), before: q("before"), want: q("before") ? 100 : INITIAL_ITEMS }) });
  }
  if ((mm = m(/^\/api\/session\/([\w-]+)\/info$/))) {
    const live = sessions.get(mm[1]);
    const path = transcriptPath(mm[1], live?.cwd);
    return json({ id: mm[1], live: !!live, cwd: live?.cwd ?? cwdOfTranscript(mm[1]), title: sessionTitle(path), prefs: getPref(mm[1]), context: contextUsage(path), agents: agentCountsFor(mm[1], path, !!live) });
  }
  if (p === "/api/upload" && req.method === "POST") {
    const fd = await req.formData();
    const f = fd.get("file");
    if (!(f instanceof File)) return err("no file");
    if (f.size > 40 * 1024 * 1024) return err("file too large (max 40 MB)");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    const safe = (f.name || "upload").replace(/[^\w.-]+/g, "_").slice(-60);
    const name = `${stamp}-${Math.random().toString(36).slice(2, 6)}-${safe}`;
    const path = join(UPLOAD_DIR, name);
    await Bun.write(path, f);
    return json({ path, url: `/uploads/${encodeURIComponent(name)}`, type: f.type });
  }
  if (p === "/api/opencode/catalog") {
    try { return json({ ...(await OC.catalog()), ...OC.recentModels() }); } catch (e: any) { return err(e.message, 502); }
  }
  if (p === "/api/new" && req.method === "POST") {
    const b = await body();
    const cwd = String(b.cwd ?? "").replace(/^~(?=\/|$)/, HOME);
    if (!cwd || !existsSync(cwd) || !statSync(cwd).isDirectory()) return err("Folder not found: " + cwd);
    if (b.agent === "opencode") {
      try {
        const id = await OC.createSession(cwd, { model: b.ocModel, variant: b.ocVariant, agent: b.ocAgent, text: b.prompt });
        await refreshOpenCode(); await refreshNow();
        return json({ ok: true, id });
      } catch (e: any) { return err(e.message, 502); }
    }
    const args: string[] = [];
    const MODELS = ["opus", "sonnet", "haiku", "fable"], EFFORTS = ["low", "medium", "high", "xhigh", "max"];
    const MODES = ["auto", "plan", "acceptEdits", "manual", "dontAsk", "bypassPermissions"];
    if (b.model && (MODELS.includes(b.model) || /^claude-[\w.-]+$/.test(b.model))) args.push("--model", String(b.model));
    if (b.effort && EFFORTS.includes(b.effort)) args.push("--effort", String(b.effort));
    if (b.mode && MODES.includes(b.mode)) args.push("--permission-mode", String(b.mode));
    if (b.resume) { if (!isSessionId(b.resume)) return err("bad session id"); args.push("--resume", b.resume); }
    if (b.prompt) args.push("--", String(b.prompt)); // a prompt starting with "-" is text, not an option
    const name = await uniqueName("cc-" + basename(cwd));
    await newSession(cwd, name, args);
    return json({ ok: true, tmux: name });
  }
  if (p === "/api/push/subscribe" && req.method === "POST") {
    const b = await body();
    if (!b.subscription?.endpoint) return err("bad subscription");
    addSubscription(b.subscription, req.headers.get("user-agent") ?? undefined);
    return json({ ok: true });
  }
  if (p === "/api/push/unsubscribe" && req.method === "POST") {
    const b = await body();
    removeSubscription(String(b.endpoint ?? ""));
    return json({ ok: true });
  }
  if (p === "/api/push/test" && req.method === "POST") {
    return json(await pushAll({ kind: "info", title: "Agents Away", body: "Notifications are working 🎉", tag: "test", url: "/" }));
  }
  // ── paired devices ──
  if (p === "/api/devices") return json({ devices: Auth.listDevices(deviceKey), signInDays: config.settings.signInDays });
  if ((mm = m(/^\/api\/devices\/([\w-]+)\/signout$/)) && req.method === "POST") {
    const k = Auth.signOut(mm[1]);
    if (!k) return err("not found", 404);
    for (const ws of clients) if (ws.data.deviceKey === k) ws.close(4401, "signed out");
    return json({ ok: true });
  }
  if (p === "/api/devices/signout-others" && req.method === "POST") {
    const gone = new Set(Auth.signOutOthers(deviceKey));
    for (const ws of clients) if (ws.data.deviceKey && gone.has(ws.data.deviceKey)) ws.close(4401, "signed out");
    return json({ ok: true, count: gone.size });
  }
  if (p === "/api/settings" && req.method === "POST") {
    const b = await body();
    for (const k of ["quietWhenActive", "notifyOnStop", "notifyOnAttention"] as const) if (typeof b[k] === "boolean") config.settings[k] = b[k];
    if (typeof b.activeWindowSec === "number") config.settings.activeWindowSec = Math.max(0, Math.min(3600, b.activeWindowSec));
    if (typeof b.signInDays === "number") config.settings.signInDays = Math.max(1, Math.min(365, Math.round(b.signInDays)));
    if (typeof b.profileName === "string") config.settings.profileName = b.profileName.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 40);
    saveConfig();
    return json({ settings: config.settings });
  }
  if (p === "/api/reviews/clear" && req.method === "POST") {
    // Delete review history: everything that's no longer waiting for an answer.
    let n = 0;
    for (const r of R.listReviews()) if (r.status !== "pending") { R.deleteReview(r.id); n++; }
    broadcast({ type: "reviews" });
    return json({ ok: true, deleted: n });
  }
  if ((mm = m(/^\/api\/review\/([\w-]+)$/))) {
    const r = R.getReview(mm[1]);
    if (!r) return err("not found", 404);
    if (req.method === "DELETE") {
      if (r.status === "pending") R.resolveWaiters({ ...r, status: "dismissed" });
      R.deleteReview(r.id); broadcast({ type: "reviews" }); return json({ ok: true });
    }
    return json(reviewSummary(r));
  }
  if ((mm = m(/^\/api\/review\/([\w-]+)\/dismiss$/)) && req.method === "POST") {
    const r = R.getReview(mm[1]);
    if (!r) return err("not found", 404);
    if (r.status === "pending") {
      r.status = "dismissed"; r.respondedAt = Date.now(); r.closedReason = "Dismissed on the phone";
      R.save(r); R.resolveWaiters(r);
    }
    broadcast({ type: "reviews" });
    return json({ ok: true });
  }
  if ((mm = m(/^\/api\/review\/([\w-]+)\/respond$/)) && req.method === "POST") {
    const r = R.getReview(mm[1]);
    if (!r) return err("not found", 404);
    const b = await body();
    if (!["approved", "changes", "rejected"].includes(b.decision)) return err("bad decision");
    r.decision = b.decision; r.comment = String(b.comment ?? "").slice(0, 20_000).trim() || undefined;
    r.status = "answered"; r.respondedAt = Date.now();
    R.save(r);
    const via = await deliverReview(r);
    broadcast({ type: "reviews" });
    return json({ ok: true, via });
  }
  return err("not found", 404);
}

const tls = {
  cert: Bun.file(join(CERT_DIR, "server.crt")),
  key: Bun.file(join(CERT_DIR, "server.key")),
};
if (!existsSync(join(CERT_DIR, "server.crt"))) {
  console.error(`No TLS certificate in ${CERT_DIR}. Run bin/agents-away-certs first.`);
  process.exit(1);
}

// Every app response: a strict CSP (no inline or third-party scripts, no external images or
// connections, no framing), no MIME sniffing, no referrer. Responses that set their own CSP (uploads and
// review files: `sandbox`) keep it.
function securityHeaders(req: Request, res: Response): Response {
  try {
    const h = res.headers;
    if (!h.has("content-security-policy")) {
      const host = req.headers.get("host") ?? "";
      h.set("content-security-policy", `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://${host}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`);
    }
    h.set("x-content-type-options", "nosniff");
    h.set("referrer-policy", "no-referrer");
    h.set("x-frame-options", "DENY");
  } catch {} // immutable headers (e.g. a proxied response): leave as is
  return res;
}
/** The WebSocket must come from the app's own page: a page on another origin (another service on the same
 *  host gets the same cookie) can't connect with the phone's sign-in. */
function sameOrigin(req: Request): boolean {
  const o = req.headers.get("origin");
  return !o || o === `https://${req.headers.get("host")}`;
}
const SAFE_ID = /^[\w-]{1,128}$/;

Bun.serve<WsData>({
  port: PORTS.https,
  idleTimeout: 255,
  hostname: "0.0.0.0",
  tls,
  async fetch(req, server) {
    const res = await handle();
    return res ? securityHeaders(req, res) : res;
    async function handle(): Promise<Response> {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      const addr = server.requestIP(req)?.address;
      if (p === "/pair") {
        const sid = Auth.redeemPairCode(url.searchParams.get("t") ?? "", req.headers.get("user-agent") ?? "", addr);
        if (!sid) return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;padding:24px;max-width:480px;margin:auto"><h2>Pairing link expired</h2><p>Pairing links work once and only for 10 minutes. On the PC, run <code>agents-away pair</code> again and open the new link.</p>`, { status: 403, headers: { "content-type": "text/html; charset=utf-8" } });
        const h = new Headers({ location: "/" });
        h.append("set-cookie", Auth.deviceCookie(sid));
        return new Response(null, { status: 302, headers: h });
      }
      const auth = Auth.check(req, addr);
      if (p.startsWith("/media/")) {
        const [, , id, name] = p.split("/");
        const r = R.getReview(id);
        if (!r || !(auth.ok || safeEq(url.searchParams.get("k") ?? "", r.key))) return new Response("forbidden", { status: 403 });
        const fp = R.filePath(r, name);
        if (!fp) return new Response("not found", { status: 404 });
        const type = r.files.find((f) => f.name === name)!.type;
        return serveImage(req, fp, type, url.searchParams.get("w"), true);
      }
      if (PUBLIC_PATHS.has(p)) return (await serveStatic(p))!;
      if (p === "/agents-away-ca.crt") return new Response(Bun.file(join(CERT_DIR, "ca.crt")), { headers: { "content-type": "application/x-x509-ca-cert" } });
      if (!auth.ok) {
        if (p.startsWith("/api") || p === "/ws") return err("not paired", 401);
        return (await serveStatic("/unpaired.html"))!;
      }
      if (p === "/ws") {
        if (!sameOrigin(req)) return err("bad origin", 403);
        // Connecting renews the sign-in cookie.
        const h = new Headers();
        const c = Auth.renewCookie(req);
        if (c) h.append("set-cookie", c);
        if (server.upgrade(req, { headers: h, data: { deviceKey: auth.key, watch: null, visible: true } })) return undefined as any;
        return err("upgrade failed");
      }
      if (p.startsWith("/api/")) return await api(req, url, auth.key);
      if (p.startsWith("/uploads/")) {
        const name = decodeURIComponent(p.slice(9));
        if (name.includes("/") || name.startsWith(".")) return err("bad name");
        const f = Bun.file(join(UPLOAD_DIR, name));
        if (!(await f.exists())) return err("not found", 404);
        return serveImage(req, join(UPLOAD_DIR, name), f.type, url.searchParams.get("w"), true);
      }
      if (p.startsWith("/vendor/")) {
        const f = VENDOR[p.slice(8)];
        if (f) return new Response(Bun.file(f), { headers: { "content-type": "text/javascript", "cache-control": "max-age=86400" } });
      }
      return (await serveStatic(p)) ?? (await serveStatic("/index.html"))!;
    } catch (e: any) {
      if (e instanceof HttpError) return err(e.message, e.status);
      console.error(e);
      return err(e?.message ?? "error", 500);
    }
    }
  },
  websocket: {
    open(ws) { clients.add(ws); ws.send(JSON.stringify({ type: "build", build: BUILD })); ws.send(JSON.stringify({ type: "sessions", sessions: publicSessions() })); },
    close(ws) { clients.delete(ws); },
    message(ws, raw) {
      let m: any;
      try { m = JSON.parse(String(raw)); } catch { return; }
      if (m.id !== undefined && m.id !== null && m.id !== "" && !SAFE_ID.test(String(m.id))) return;
      if (m.type === "watch") {
        if (!m.id) { ws.data.watch = null; return; }
        startWatch(ws, String(m.id), !!m.chat, !!m.term, Number(m.from) || 0);
      } else if (m.type === "peek" && m.id) {
        const id = String(m.id);
        if (isOc(id)) OC.messages(id, 80).then((items) => ws.send(JSON.stringify({ type: "chat", id, reset: true, peek: true, items, start: 0, end: items.length || 1 }))).catch(() => {});
        else ws.send(JSON.stringify(chatSnapshot(id, true)));
      } else if (m.type === "visible") {
        ws.data.visible = !!m.visible;
      } else if (m.type === "older" && m.id) {
        const s = sessionFor(m.id);
        const path = transcriptPath(m.id, s?.cwd);
        if (!path || !(m.before > 0)) return;
        const t = readTail(path, Number(m.before), 100);
        ws.send(JSON.stringify({ type: "older", id: m.id, items: t.items, start: t.start }));
      } else if (m.type === "ping") ws.send('{"type":"pong"}');
      else if (m.type === "listen") {
        // The Android app's notification connection: from now on it gets every notification on this socket,
        // starting with whatever is still waiting.
        ws.data.listen = true;
        for (const n of pendingNotifications()) ws.send(JSON.stringify({ type: "notify", replay: true, ...n }));
      }
    },
  },
});

/** Agent-written text pasted into a terminal: no newlines or control characters. */
const oneLine = (t: string) => String(t ?? "").replace(/[\x00-\x1f\x7f-\x9f]+/g, " ").trim();

// ───────────────────────── local API (hooks + CLI) ─────────────────────────

Bun.serve({
  port: PORTS.local,
  idleTimeout: 255,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (!safeEq(req.headers.get("x-away-token") ?? "", config.token)) return err("bad token", 403);
    try {
      if (p === "/hook" && req.method === "POST") {
        const ev = await req.json().catch(() => null);
        if (ev) onHook(ev).catch((e) => console.error("hook", e));
        return json({ ok: true });
      }
      if (p === "/pair-code" && req.method === "POST") return json({ ...Auth.newPairCode(), profile: profileName() });
      if (p === "/status") return json({ sessions: publicSessions(), subscribers: subscriptionCount() });
      if (p === "/update" && req.method === "GET") { const s = updateState(); return json({ enabled: config.settings.updateCheck, version: VERSION, repo: REPO, ...s, newer: newerRelease(s) }); }
      if (p === "/update" && req.method === "POST") {
        const b = await req.json().catch(() => ({}));
        if (typeof b.enabled === "boolean") { config.settings.updateCheck = b.enabled; saveConfig(); }
        const s = b.check && config.settings.updateCheck ? await updates.checkNow() : updateState();
        return json({ enabled: config.settings.updateCheck, version: VERSION, repo: REPO, ...s, newer: newerRelease(s) });
      }
      if (p === "/notify" && req.method === "POST") {
        const b = await req.json();
        return json(await pushAll({ kind: "info", title: String(b.title ?? "Claude"), body: String(b.body ?? ""), tag: "n-" + Date.now(), url: "/" }));
      }
      if (p === "/review" && req.method === "POST") {
        const fd = await req.formData();
        const files = fd.getAll("file").filter((f): f is File => f instanceof File);
        if (!files.length) return err("no files");
        const sid = String(fd.get("session_id") ?? "");
        await refreshNow();
        let s = sid ? sessions.get(sid) : undefined;
        const pane = String(fd.get("pane") ?? "");
        if (!s && pane) s = [...sessions.values()].find((x) => x.tmux?.pane === pane);
        const r = await R.createReview({
          title: String(fd.get("title") ?? files[0].name).slice(0, 200),
          message: String(fd.get("message") ?? "").slice(0, 5000),
          files,
          // Only ever a known session's own pane: the answer is pasted there later, so a caller-supplied
          // pane (e.g. a plain shell in your own tmux) is never used.
          session: s ? { id: s.id, name: displayName(s), cwd: s.cwd, socket: s.tmux?.socket, pane: s.tmux?.pane } : null,
        });
        if (fd.get("async") === "1") { r.deliverToSession = true; R.save(r); }
        broadcast({ type: "reviews" });
        const img = r.files.find((f) => f.type.startsWith("image/") && f.type !== "image/svg+xml");
        // Notification picture first (the phone fetches it right away), then thumbnails + full views.
        if (img) await variant(R.filePath(r, img.name)!, 800);
        prewarm(r.files.filter((f) => f.type.startsWith("image/")).map((f) => R.filePath(r, f.name)!));
        await pushAll({
          kind: "review", reviewId: r.id, tag: "r-" + r.id,
          title: `Review: ${r.title}`,
          body: [r.message, s ? `— ${displayName(s)}` : ""].filter(Boolean).join("\n") || `${r.files.length} file(s) to look at`,
          image: img ? `/media/${r.id}/${img.name}?k=${r.key}&w=800` : undefined,
          url: `/#/review/${r.id}`,
          actions: [{ action: "review-approve", title: "Approve" }, { action: "open", title: "Comment" }],
        });
        return json({ id: r.id });
      }
      let mm;
      if ((mm = p.match(/^\/review\/([\w-]+)\/wait$/))) {
        const r = R.getReview(mm[1]);
        if (!r) return err("not found", 404);
        if (r.status === "answered") { r.delivered = true; R.save(r); return json(reviewSummary(r)); }
        const t = Math.min(600, Math.max(1, Number(url.searchParams.get("timeout") ?? 50)));
        const got = await R.waitFor(r.id, t * 1000);
        return json(reviewSummary(got ?? r));
      }
      if (p === "/reviews") {
        const sid = url.searchParams.get("session") ?? "";
        const list = R.listReviews().filter((r) => r.status === "pending" && (!sid || r.session?.id === sid));
        return json({ reviews: list.map((r) => ({ id: r.id, title: r.title, message: r.message, createdAt: r.createdAt, files: r.files.length })) });
      }
      if ((mm = p.match(/^\/review\/([\w-]+)\/withdraw$/)) && req.method === "POST") {
        const r = R.getReview(mm[1]);
        if (!r) return err("No review with that id", 404);
        if (r.status !== "pending") return json({ ok: true, already: r.status });
        const b = await req.json().catch(() => ({}));
        r.status = "withdrawn"; r.respondedAt = Date.now(); r.closedReason = String(b.reason ?? "").slice(0, 500) || undefined;
        R.save(r); R.resolveWaiters(r);
        broadcast({ type: "reviews" });
        return json({ ok: true });
      }
      if ((mm = p.match(/^\/review\/([\w-]+)\/detach$/)) && req.method === "POST") {
        const r = R.getReview(mm[1]);
        if (!r) return err("not found", 404);
        r.deliverToSession = true; R.save(r);
        if (r.status === "answered" && !r.delivered) await deliverReview(r);
        return json({ ok: true, deliverable: !!r.session?.pane || (!!r.session?.id && isOc(r.session.id)) });
      }
      return err("not found", 404);
    } catch (e: any) {
      console.error(e);
      return err(e?.message ?? "error", 500);
    }
  },
});

// ───────────────────────── onboarding (plain HTTP) ─────────────────────────

Bun.serve({
  port: PORTS.onboard,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/agents-away-ca.crt") {
      return new Response(Bun.file(join(CERT_DIR, "ca.crt")), {
        headers: { "content-type": "application/x-x509-ca-cert", "content-disposition": 'attachment; filename="agents-away-ca.crt"' },
      });
    }
    if (url.pathname === "/page-i18n.js") return (await serveStatic("/page-i18n.js"))!;
    // The Android app, when one was built on this PC (agents-away apk build).
    // An APK built on this PC (agents-away apk build) wins over the one shipped in a server-full package.
    const apkDir = existsSync(join(DATA_DIR, "android", "agents-away.apk")) ? join(DATA_DIR, "android") : join(ROOT, "prebuilt");
    const apk = join(apkDir, "agents-away.apk");
    const apkInfo = readJson<{ version?: string; sha256?: string } | null>(join(apkDir, "agents-away.json"), null);
    const hasApk = !!apkInfo?.sha256 && existsSync(apk);
    if (url.pathname === "/agents-away.apk") {
      if (!hasApk) return new Response("No Android app has been built on this PC (agents-away apk build).", { status: 404 });
      return new Response(Bun.file(apk), { headers: { "content-type": "application/vnd.android.package-archive", "content-disposition": `attachment; filename="agents-away-${String(apkInfo!.version ?? "app").replace(/[^\w.-]/g, "")}.apk"`, "cache-control": "no-cache" } });
    }
    // Two paths when there is an app: preselect it on Android, the web app elsewhere; open this phone's steps.
    const ua = req.headers.get("user-agent") ?? "";
    const android = /Android/i.test(ua), ios = /iPhone|iPad|iPod/i.test(ua);
    const size = hasApk ? `${(Bun.file(apk).size / 1e6).toFixed(1)} MB` : "";
    const html = (await Bun.file(join(PUBLIC, "onboard.html")).text())
      .replace(/<!--APK-->([\s\S]*?)<!--\/APK-->/g, (_, block) => (hasApk ? block : ""))
      .replaceAll("{{HTTPS}}", `https://${url.hostname}:${PORTS.https}/`)
      .replaceAll("{{APK_SHA}}", apkInfo?.sha256 ?? "").replaceAll("{{APK_SIZE}}", size)
      .replaceAll("{{APK_VERSION}}", String(apkInfo?.version ?? "").replace(/[^\w.-]/g, ""))
      .replaceAll("{{APP_CHECKED}}", android ? "checked" : "").replaceAll("{{WEB_CHECKED}}", android ? "" : "checked")
      .replaceAll("{{ANDROID_OPEN}}", android || !ios ? "open" : "").replaceAll("{{IOS_OPEN}}", ios ? "open" : "");
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
});

await refreshNow();
// Warm resized images for recent reviews so the first look on the phone is quick.
setTimeout(() => prewarm(R.listReviews().slice(0, 12).flatMap((r) => r.files.filter((f) => f.type.startsWith("image/")).map((f) => R.filePath(r, f.name)!))), 3000);
// Tell the CLI (and so the Claude Code hooks) which ports this server is really on.
writeJson(join(CFG_DIR, "ports.json"), PORTS);
console.log(`Agents Away ${VERSION} up: https://0.0.0.0:${PORTS.https}  local api 127.0.0.1:${PORTS.local}  onboarding http://0.0.0.0:${PORTS.onboard}`);
