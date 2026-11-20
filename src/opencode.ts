// OpenCode support: talks to OpenCode's background server (the same one its TUI uses).
// No tmux or screen-scraping: sessions, messages, prompts, permissions and events all come from its HTTP API.
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { HOME } from "./config";
import type { Item } from "./claude";

const SERVICE_JSON = join(HOME, ".config/opencode/service.json");

type Conn = { url: string; auth: string };
let conn: Conn | null = null;
let lastDiscover = 0;

async function discover(force = false): Promise<Conn | null> {
  if (conn && !force) return conn;
  if (!force && Date.now() - lastDiscover < 10_000) return conn;
  lastDiscover = Date.now();
  try {
    const p = Bun.spawn(["opencode", "service", "status"], { stdout: "pipe", stderr: "ignore" });
    const out = (await new Response(p.stdout).text()).trim();
    await p.exited;
    const url = out.split("\n")[0].trim();
    if (!/^https?:\/\//.test(url)) { conn = null; return null; }
    const pw = JSON.parse(readFileSync(SERVICE_JSON, "utf8")).password ?? "";
    conn = { url: url.replace(/\/$/, ""), auth: "Basic " + Buffer.from(`opencode:${pw}`).toString("base64") };
    return conn;
  } catch {
    conn = null;
    return null;
  }
}

export async function available() {
  return !!(await discover());
}

export async function ensureServer() {
  if (await discover(true)) return true;
  const p = Bun.spawn(["opencode", "service", "start"], { stdout: "ignore", stderr: "ignore" });
  await p.exited;
  for (let i = 0; i < 20; i++) {
    await Bun.sleep(300);
    if (await discover(true)) return true;
  }
  return false;
}

export async function oc(method: string, path: string, body?: unknown, query?: Record<string, string>) {
  const c = await discover();
  if (!c) throw new Error("OpenCode isn't running");
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  let r: Response;
  try {
    r = await fetch(c.url + path + qs, {
      method,
      headers: { authorization: c.auth, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    conn = null; // server went away or moved port
    throw new Error("OpenCode server unreachable");
  }
  const text = await r.text();
  let j: any = null;
  try { j = text ? JSON.parse(text) : null; } catch {}
  if (!r.ok) throw new Error(j?.message || j?.error?.message || j?.data?.message || `OpenCode ${r.status}`);
  return j;
}

// ───────── sessions ─────────
export type OcSession = {
  id: string;
  title: string;
  cwd: string;
  agent?: string;
  model?: { id: string; providerID: string; variant?: string };
  running: boolean;
  updated: number;
  created: number;
  outcome?: string;
  permissions: any[];
  forms: any[];
  context: OcContext | null;
  agents: { total: number; running: number } | null;
};

export async function listSessions(maxIdleAgeMs = 8 * 3600_000, max = 10): Promise<OcSession[]> {
  if (!(await discover())) return [];
  const [list, active] = await Promise.all([
    oc("GET", "/api/session", undefined, { limit: "30", order: "desc", archived: "false", parentID: "null" }),
    oc("GET", "/api/session/active").catch(() => ({ data: {} })),
  ]);
  const running = new Set(Object.keys(active?.data ?? {}));
  const now = Date.now();
  const out: OcSession[] = [];
  for (const s of list?.data ?? []) {
    const updated = s.time?.updated ?? s.time?.created ?? 0;
    const isRunning = running.has(s.id);
    if (!isRunning && now - updated > maxIdleAgeMs) continue;
    out.push({
      id: s.id, title: s.title || "OpenCode session", cwd: s.location?.directory ?? HOME, agent: s.agent, model: s.model,
      running: isRunning, updated, created: s.time?.created ?? updated, outcome: s.outcome, permissions: [],
      forms: [], context: null, agents: null,
    });
    if (out.length >= max) break;
  }
  await Promise.all(out.map(async (s) => {
    try { s.permissions = (await oc("GET", `/api/session/${s.id}/permission`))?.data ?? []; } catch {}
    [s.forms, s.context, s.agents] = await Promise.all([forms(s.id), contextUsage(s.id, s.updated), agentCounts(s.id, running)]);
  }));
  return out;
}

// ───────── messages → Agents Away chat items ─────────
function toolSummary(name: string, input: any): string {
  if (!input || typeof input !== "object") return "";
  const v = input.description || input.questions?.[0]?.question || input.command || input.filePath || input.file_path || input.path || input.pattern || input.url || input.query || input.prompt;
  return typeof v === "string" ? v.split("\n")[0].slice(0, 200) : "";
}
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more chars)` : s);
const iso = (t?: number) => (t ? new Date(t).toISOString() : undefined);

export function toItems(messages: any[]): Item[] {
  const items: Item[] = [];
  for (const m of messages) {
    const ts = iso(m.time?.created);
    if (m.type === "user") {
      if (m.text?.trim()) items.push({ k: "user", text: m.text, ts });
    } else if (m.type === "assistant") {
      const done = !!m.time?.completed;
      for (const p of m.content ?? []) {
        if (p.type === "text") {
          if (done && p.text?.trim()) items.push({ k: "text", text: p.text, ts });
        } else if (p.type === "tool") {
          const st = p.state ?? {};
          if (st.status === "pending") continue; // input still streaming
          items.push({ k: "tool", id: p.id, name: p.name, summary: toolSummary(p.name, st.input), detail: clip(JSON.stringify(st.input ?? {}, null, 2), 1500), ts });
          if (st.status === "completed" || st.status === "error") {
            // v2 tools report `content` parts (text) instead of `output`
            const parts = Array.isArray(st.content) ? st.content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n") : "";
            const out = typeof st.output === "string" ? st.output : st.output != null ? JSON.stringify(st.output) : parts || (st.error?.message ?? st.error ?? "");
            items.push({ k: "result", id: p.id, text: clip(String(out ?? "").trim(), 1500), error: st.status === "error" });
          }
        }
      }
      if (m.error?.message && done) items.push({ k: "note", text: "⚠ " + m.error.message, ts } as any);
    } else if (m.type === "synthetic" && m.metadata?.source === "subagent") {
      items.push({ k: "note", text: `↳ @${m.metadata.agent ?? "subagent"}: ${m.description ?? "report"} (${m.metadata.state ?? "done"})`, ts } as any);
    }
  }
  return items;
}

export async function messages(id: string, limit = 80) {
  const r = await oc("GET", `/api/session/${id}/message`, undefined, { limit: String(limit), order: "desc" });
  return toItems([...(r?.data ?? [])].reverse());
}

export async function inbox(id: string): Promise<string[]> {
  try {
    const r = await oc("GET", `/api/session/${id}/inbox`);
    return (r?.data ?? []).map((i: any) => i.text ?? i.item?.text ?? "").filter(Boolean);
  } catch { return []; }
}

export async function prompt(id: string, text: string, busy: boolean) {
  return oc("POST", `/api/session/${id}/prompt`, { text, ...(busy ? { delivery: "queue" } : {}) });
}

export async function interrupt(id: string) {
  return oc("POST", `/api/session/${id}/interrupt`);
}

/** Archive (true) or restore (false) a session. Archived sessions drop out of the active list. */
export async function archive(id: string, archived = true) {
  return oc("PATCH", `/api/session/${id}`, { archived });
}

export async function replyPermission(id: string, requestID: string, decision: "once" | "always" | "reject") {
  return oc("POST", `/api/session/${id}/permission/${requestID}/reply`, { decision });
}

export async function createSession(cwd: string, opts: { model?: string; variant?: string; agent?: string; text?: string }) {
  if (!(await ensureServer())) throw new Error("Couldn't start the OpenCode server");
  const body: any = { location: { directory: cwd } };
  if (opts.model) {
    const [providerID, ...rest] = opts.model.split("/");
    body.model = { providerID, id: rest.join("/"), ...(opts.variant ? { variant: opts.variant } : {}) };
  }
  if (opts.agent) body.agent = opts.agent;
  const r = await oc("POST", "/api/session", body);
  const id = r?.data?.id;
  if (id && opts.text) await prompt(id, opts.text, false);
  return id as string;
}

let catalogCache: { at: number; data: any } | null = null;
export async function catalog() {
  if (catalogCache && Date.now() - catalogCache.at < 5 * 60_000) return catalogCache.data;
  if (!(await ensureServer())) throw new Error("Couldn't start the OpenCode server");
  const [models, agents, def] = await Promise.all([
    oc("GET", "/api/model"), oc("GET", "/api/agent"), oc("GET", "/api/model/default").catch(() => null),
  ]);
  const data = {
    models: (models?.data ?? models ?? []).filter((m: any) => m.type === "chat" || !m.type).map((m: any) => ({
      ref: `${m.providerID}/${m.id}`, name: m.name ?? m.id, provider: m.providerID, variants: (m.variants ?? []).map((v: any) => v.id),
    })),
    agents: (agents?.data ?? agents ?? []).filter((a: any) => a.mode === "primary" && a.description).map((a: any) => ({ id: a.id ?? a.name, description: a.description })),
    defaultModel: def?.data ? `${def.data.providerID}/${def.data.id}` : null,
  };
  catalogCache = { at: Date.now(), data };
  return data;
}

// ───────── live events ─────────
/** Subscribe to the server's event stream; reconnects forever. Calls onEvent(type, data). */
export function subscribe(onEvent: (type: string, data: any) => void) {
  const types = ["permission.asked", "permission.replied", "session.idle", "session.status", "session.execution.started",
    "session.execution.succeeded", "session.execution.failed", "session.execution.interrupted", "session.inbox.enqueued",
    "session.inbox.delivered", "session.inbox.cancelled", "session.text.ended", "session.tool.success", "session.tool.failed",
    "session.tool.called", "session.created", "session.renamed", "form.created", "form.replied", "form.cancelled"];
  (async () => {
    for (;;) {
      const c = await discover(true);
      if (!c) { await Bun.sleep(15_000); continue; }
      try {
        const r = await fetch(`${c.url}/api/event?` + types.map((t) => "types=" + encodeURIComponent(t)).join("&"), { headers: { authorization: c.auth, accept: "text/event-stream" } });
        if (!r.ok || !r.body) throw new Error("event stream " + r.status);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            let ev = "", data = "";
            for (const line of chunk.split("\n")) {
              if (line.startsWith("event:")) ev = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (!data) continue;
            try {
              let d = JSON.parse(data);
              if (typeof d === "string") d = JSON.parse(d);
              onEvent(d.type ?? ev, d.data ?? d);
            } catch {}
          }
        }
      } catch {}
      conn = null;
      await Bun.sleep(3000);
    }
  })();
}

// ───────── question forms (the `question` tool and other asks) ─────────
// GET /api/session/:id/form lists pending forms; reply with {answer: {fieldKey: value}}, cancel with DELETE.
export async function forms(id: string): Promise<any[]> {
  try { return (await oc("GET", `/api/session/${id}/form`))?.data ?? []; } catch { return []; }
}
export async function replyForm(id: string, formID: string, answer: Record<string, unknown>) {
  return oc("POST", `/api/session/${id}/form/${formID}/reply`, { answer });
}
export async function cancelForm(id: string, formID: string, message?: string) {
  return oc("DELETE", `/api/session/${id}/form/${formID}`, undefined, message ? { message } : undefined);
}

// ───────── context window (latest assistant reply's tokens vs the model's context limit) ─────────
let limitCache: { at: number; map: Map<string, number> } | null = null;
async function contextLimits() {
  if (limitCache && Date.now() - limitCache.at < 10 * 60_000) return limitCache.map;
  const r = await oc("GET", "/api/model");
  const map = new Map<string, number>();
  for (const m of r?.data ?? r ?? []) if (m.limit?.context) map.set(`${m.providerID}/${m.id}`, m.limit.context);
  limitCache = { at: Date.now(), map };
  return map;
}
export type OcContext = { pct: number; tokens: number; size: number; model: string | null };
const ctxCache = new Map<string, { updated: number; ctx: OcContext | null }>();
/** Same count as Claude's: input + cached tokens of the latest reply that reported usage. Cached per `updated`. */
export async function contextUsage(id: string, updated = 0): Promise<OcContext | null> {
  const c = ctxCache.get(id);
  if (c && updated && c.updated === updated) return c.ctx;
  let ctx: OcContext | null = null;
  try {
    const r = await oc("GET", `/api/session/${id}/message`, undefined, { limit: "12", order: "desc" });
    const m = (r?.data ?? []).find((x: any) => x.type === "assistant" && x.tokens && (x.tokens.input || x.tokens.cache?.read));
    if (m) {
      const t = m.tokens;
      const tokens = (t.input ?? 0) + (t.cache?.read ?? 0) + (t.cache?.write ?? 0);
      const ref = `${m.model?.providerID}/${m.model?.id}`;
      const size = (await contextLimits().catch(() => new Map<string, number>())).get(ref) ?? 0;
      // Unknown window size: no made-up percentage.
      if (size) ctx = { tokens, size, model: ref, pct: Math.min(100, Math.max(0, Math.round((tokens / size) * 100))) };
    }
  } catch { return c?.ctx ?? null; }
  ctxCache.set(id, { updated, ctx });
  return ctx;
}

// ───────── subagents = child sessions (parentID = this session) ─────────
export type OcAgent = {
  id: string; description: string; type: string; status: "running" | "done" | "failed" | "stopped"; toolUseId: string | null;
  startedAt: number; endedAt: number | null; depth: number; parentAgentId: string | null; model: string | null; summary: null;
};
async function activeIds() {
  try { return new Set(Object.keys((await oc("GET", "/api/session/active"))?.data ?? {})); } catch { return new Set<string>(); }
}
function toAgent(s: any, running: Set<string>, depth: number, parent: string | null): OcAgent {
  const run = running.has(s.id);
  const status = run ? "running" : s.outcome === "failed" ? "failed" : s.outcome === "interrupted" ? "stopped" : "done";
  return {
    id: s.id, description: s.title || s.agent || "Subagent", type: s.agent || "subagent", status, toolUseId: null,
    startedAt: s.time?.created ?? 0, endedAt: run ? null : (s.time?.idle ?? s.time?.updated ?? null), depth, parentAgentId: parent,
    model: s.model ? `${s.model.providerID}/${s.model.id}` : null, summary: null,
  };
}
/** child session id → id of the parent's `subagent` tool call that started it (links the chat's tool card). */
async function spawnTools(id: string) {
  const map = new Map<string, string>();
  try {
    const r = await oc("GET", `/api/session/${id}/message`, undefined, { limit: "200", order: "desc" });
    for (const m of r?.data ?? []) for (const p of m.content ?? []) if (p.type === "tool" && p.state?.metadata?.sessionID) map.set(p.state.metadata.sessionID, p.id);
  } catch {}
  return map;
}
async function children(id: string): Promise<any[]> {
  return (await oc("GET", "/api/session", undefined, { parentID: id, limit: "50", order: "asc" }))?.data ?? [];
}
/** Child sessions plus one level of grandchildren (depth 2), oldest first like Claude's list. */
export async function listAgents(id: string): Promise<OcAgent[]> {
  const [kids, running, tools] = await Promise.all([children(id).catch(() => []), activeIds(), spawnTools(id)]);
  const grand = await Promise.all(kids.map((k) => children(k.id).catch(() => [])));
  const out: OcAgent[] = [];
  kids.forEach((k, i) => {
    out.push({ ...toAgent(k, running, 1, null), toolUseId: tools.get(k.id) ?? null });
    for (const g of grand[i]) out.push(toAgent(g, running, 2, k.id));
  });
  return out;
}
export async function agentCounts(id: string, running: Set<string>) {
  const kids = await children(id).catch(() => []);
  return kids.length ? { total: kids.length, running: kids.filter((k) => running.has(k.id)).length } : null;
}
const itemsSig = (items: Item[]) => String(Bun.hash(JSON.stringify(items)));
/** A child session's chat for the read-only subagent view. `from` = how many items the phone has, `have` = their hash. */
export async function agentChat(parent: string, cid: string, from = 0, have = "") {
  const [s, items, running] = await Promise.all([oc("GET", `/api/session/${cid}`), messages(cid, 200), activeIds()]);
  const pid = s?.data?.parentID;
  if (pid !== parent) {
    const p = pid ? (await oc("GET", `/api/session/${pid}`).catch(() => null))?.data : null; // grandchild?
    if (p?.parentID !== parent) throw new Error("Not a subagent of this session");
  }
  const keep = from > 0 && from <= items.length && itemsSig(items.slice(0, from)) === have;
  return { agent: toAgent(s.data, running, 1, null), items: keep ? items.slice(from) : items, start: 0, end: items.length, sig: itemsSig(items), reset: from > 0 && !keep };
}

// ───────── recently used models (OpenCode's own state, as its TUI shows them) ─────────
const STATE_DIR = join(process.env.XDG_STATE_HOME || join(HOME, ".local/state"), "opencode");
export function recentModels(): { recent: string[]; variants: Record<string, string> } {
  try {
    const j = JSON.parse(readFileSync(join(STATE_DIR, "model.json"), "utf8"));
    return {
      recent: (j.recent ?? []).filter((r: any) => r?.providerID && r?.modelID).map((r: any) => `${r.providerID}/${r.modelID}`).slice(0, 10),
      variants: j.variant && typeof j.variant === "object" ? j.variant : {},
    };
  } catch { return { recent: [], variants: {} }; }
}

// ───────── session terminals (OpenCode's persistent PTYs, experimental API) ─────────
/** The terminal to show: the newest running one (else the newest). */
export async function terminal(id: string) {
  const list: any[] = (await oc("GET", `/api/experimental/session/${id}/terminal`))?.data ?? [];
  return [...list].reverse().find((t) => t.status === "running") ?? list[list.length - 1] ?? null;
}
export async function createTerminal(id: string, cwd: string, cols = 100, rows = 32) {
  return (await oc("POST", `/api/experimental/session/${id}/terminal`, { args: [], title: "Agents Away", env: {}, cwd, size: { cols, rows } }))?.data;
}
/** Scrollback + screen as text with SGR colours only (what the Terminal tab's ansi_up renders). */
export async function terminalScreen(ptyID: string, lines = 300) {
  const snap = (await oc("GET", `/api/experimental/persistent-pty/${ptyID}/snapshot`))?.data;
  if (!snap) return null;
  let raw: string = snap.checkpoint ? Buffer.from(snap.checkpoint, "base64").toString("utf8") : snap.text ?? "";
  const alt = raw.lastIndexOf("\x1b[?1049h");
  if (alt >= 0) raw = raw.slice(alt + 8); // full-screen app: show the alternate screen
  const screen = raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "") // OSC
    .replace(/\x1b[P^_][\s\S]*?\x1b\\/g, "") // DCS/PM/APC
    .replace(/\x1b\[[0-9;?=>!]*[ -\/]*[@-ln-~]/g, "") // CSI except SGR (…m)
    .replace(/\x1b[()*+][0-9A-Za-z]|\x1b[=>78HMDEc]/g, "")
    .replace(/\r+\n/g, "\n").replace(/\r/g, "").replace(/\x00/g, "");
  return { screen: screen.split("\n").slice(-lines).join("\n"), cols: snap.info?.size?.cols ?? 0, title: snap.info?.userTitle || snap.info?.title || "", status: snap.info?.status ?? "running" };
}
const KEY_BYTES: Record<string, string> = {
  Escape: "\x1b", Enter: "\r", Up: "\x1b[A", Down: "\x1b[B", Left: "\x1b[D", Right: "\x1b[C", Tab: "\t", BTab: "\x1b[Z",
  "C-c": "\x03", "C-d": "\x04", "C-o": "\x0f", "C-l": "\x0c", "C-u": "\x15", "C-x": "\x18", "C-s": "\x13",
};
export const termKey = (k: string) => KEY_BYTES[k] ?? (k.length === 1 ? k : "");
/** Type into a persistent PTY: attach over its WebSocket, send the bytes, detach. */
export async function terminalInput(ptyID: string, data: string) {
  const c = await discover();
  if (!c) throw new Error("OpenCode isn't running");
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(c.url.replace(/^http/, "ws") + `/api/experimental/persistent-pty/${ptyID}/connect`, { headers: { authorization: c.auth } } as any);
    let sent = false;
    const fail = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("The terminal didn't answer")); }, 5000);
    ws.onmessage = (e) => {
      if (sent || typeof e.data !== "string" || !e.data.includes('"attached"')) return;
      sent = true; ws.send(data);
      setTimeout(() => { clearTimeout(fail); try { ws.close(); } catch {} resolve(); }, 250);
    };
    ws.onerror = () => { clearTimeout(fail); reject(new Error("Couldn't connect to the terminal")); };
  });
}
