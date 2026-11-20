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
    });
    if (out.length >= max) break;
  }
  await Promise.all(out.map(async (s) => {
    try { s.permissions = (await oc("GET", `/api/session/${s.id}/permission`))?.data ?? []; } catch {}
  }));
  return out;
}

// ───────── messages → Agents Away chat items ─────────
function toolSummary(name: string, input: any): string {
  if (!input || typeof input !== "object") return "";
  const v = input.description || input.command || input.filePath || input.file_path || input.path || input.pattern || input.url || input.query || input.prompt;
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
            const out = typeof st.output === "string" ? st.output : st.output != null ? JSON.stringify(st.output) : st.error?.message ?? st.error ?? "";
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
    "session.tool.called", "session.created", "session.renamed", "form.created", "form.replied"];
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
