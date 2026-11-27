// pi (https://pi.dev) support. pi runs in a terminal like Claude Code does, so sessions are found, read and
// driven the same way (tmux pane + transcript file). What pi doesn't provide itself is a list of live
// sessions: the extension in pi/agents-away.ts (installed by `agents-away hooks install`) writes one small
// file per running pi into CFG_DIR/pi/<pid>.json and forwards turn start/end to the local API.
import { join } from "node:path";
import { readdirSync, readlinkSync, existsSync, statSync, readFileSync, rmSync, openSync, readSync, closeSync } from "node:fs";
import { CFG_DIR, HOME } from "./config";
import type { ClaudeProc, Item, Recent } from "./claude";

export const PI_REG_DIR = join(CFG_DIR, "pi");
const PI_AGENT_DIR = process.env.PI_CODING_AGENT_DIR || join(HOME, ".pi/agent");
export const PI_SESSIONS_DIR = process.env.PI_CODING_AGENT_SESSION_DIR || join(PI_AGENT_DIR, "sessions");

const isId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,128}$/.test(id);

export type PiProc = ClaudeProc & {
  kind: "pi";
  file: string | null;
  model: string | null;
  context: { pct: number; tokens: number; size: number; model: string | null; effort: string | null } | null;
};

const fileOfId = new Map<string, string>(); // session id → transcript, learned from the live registry

/** A pid file is only believed while that pid is a live pi: stale files (pi killed) are deleted. */
function livePid(pid: number): boolean {
  try {
    const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    return /(^|[\s/])pi(\s|$)/.test(cmd) || /pi-coding-agent/.test(cmd);
  } catch { return false; }
}

export function listPiProcs(): PiProc[] {
  const out: PiProc[] = [];
  let files: string[] = [];
  try { files = readdirSync(PI_REG_DIR).filter((f) => /^\d+\.json$/.test(f)); } catch { return out; }
  for (const f of files) {
    const path = join(PI_REG_DIR, f);
    try {
      const d = JSON.parse(readFileSync(path, "utf8"));
      const pid = Number(d.pid);
      if (!existsSync(`/proc/${pid}`) || !livePid(pid)) { rmSync(path, { force: true }); continue; }
      if (!isId(d.sessionId) || typeof d.cwd !== "string") continue;
      let tty: string | null = null;
      try { tty = readlinkSync(`/proc/${pid}/fd/0`); } catch {}
      if (tty && !tty.startsWith("/dev/pts")) tty = null;
      const file = typeof d.file === "string" && d.file.endsWith(".jsonl") ? d.file : null;
      if (file) fileOfId.set(d.sessionId, file);
      const c = d.context;
      out.push({
        kind: "pi", pid, sessionId: d.sessionId, cwd: d.cwd, tty, file,
        name: typeof d.name === "string" && d.name ? d.name : d.cwd.split("/").pop() || "pi",
        status: d.status === "busy" ? "busy" : "idle",
        startedAt: Number(d.startedAt) || 0, statusUpdatedAt: Number(d.statusAt) || 0,
        model: typeof d.model === "string" ? d.model : null,
        context: c && Number.isFinite(c.tokens) && c.size > 0
          ? { pct: Math.round(c.pct ?? (c.tokens / c.size) * 100), tokens: c.tokens, size: c.size, model: d.model ?? null, effort: null }
          : null,
      });
    } catch {}
  }
  return out;
}

/** Transcript of a pi session (pi names files `<timestamp>_<id>.jsonl` under a folder per project). */
export function piTranscript(id: string): string | null {
  if (!isId(id)) return null;
  const c = fileOfId.get(id);
  if (c && existsSync(c)) return c;
  for (const dir of sessionDirs()) {
    let names: string[];
    try { names = readdirSync(dir); } catch { continue; }
    const f = names.find((n) => n.endsWith(`_${id}.jsonl`));
    if (f) { fileOfId.set(id, join(dir, f)); return join(dir, f); }
  }
  return null;
}

/** pi keeps a folder per project under the sessions dir; with a custom session dir the files sit directly in it. */
function sessionDirs(): string[] {
  const dirs = [PI_SESSIONS_DIR];
  try {
    for (const d of readdirSync(PI_SESSIONS_DIR, { withFileTypes: true })) if (d.isDirectory()) dirs.push(join(PI_SESSIONS_DIR, d.name));
  } catch {}
  return dirs;
}

// ───────── transcript parsing ─────────
function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more chars)` : s;
}

function argsOf(a: unknown): any {
  if (typeof a === "string") { try { return JSON.parse(a); } catch { return {}; } }
  return a && typeof a === "object" ? a : {};
}

function toolSummary(name: string, a: any): string {
  const pick = a.command ?? a.path ?? a.file_path ?? a.pattern ?? a.url ?? a.query ?? a.description;
  return typeof pick === "string" ? pick.split("\n")[0].slice(0, 200) : "";
}

const blocksText = (c: any): string =>
  typeof c === "string" ? c : Array.isArray(c) ? c.map((b: any) => (b.type === "text" ? b.text : b.type === "image" ? "[image]" : "")).filter(Boolean).join("\n") : "";

/** One transcript line → chat items. Only `message` entries are chat; model changes, compactions and
 *  extension entries are bookkeeping. */
export function parsePiOne(o: any, items: Item[]) {
  if (o.type !== "message") return;
  const m = o.message;
  const ts = o.timestamp;
  if (!m) return;
  if (m.role === "user") {
    const t = blocksText(m.content).trim();
    if (t) items.push({ k: "user", text: t, ts });
  } else if (m.role === "assistant" && Array.isArray(m.content)) {
    for (const b of m.content) {
      if (b.type === "text" && b.text?.trim()) items.push({ k: "text", text: b.text, ts });
      else if (b.type === "thinking" && b.thinking?.trim()) items.push({ k: "thinking", text: clip(b.thinking, 4000), ts });
      else if (b.type === "toolCall") {
        const a = argsOf(b.arguments);
        items.push({ k: "tool", id: String(b.id), name: String(b.name), summary: toolSummary(b.name, a), detail: clip(JSON.stringify(a, null, 2), 1500), ts });
      }
    }
    if (m.stopReason === "error" && m.errorMessage) items.push({ k: "result", id: "", text: clip(String(m.errorMessage), 600), error: true });
  } else if (m.role === "toolResult") {
    items.push({ k: "result", id: String(m.toolCallId), text: clip(blocksText(m.content).trim(), 1500), error: !!m.isError });
  }
}

function head(path: string, max: number): string {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(max);
    return buf.subarray(0, readSync(fd, buf, 0, max, 0)).toString("utf8");
  } finally { closeSync(fd); }
}

/** First user message, as a title (pi has no generated titles). */
const titles = new Map<string, { size: number; title: string | null }>();
export function piTitle(path: string | null, name?: string | null): string | null {
  if (name) return name;
  if (!path) return null;
  let size = 0;
  try { size = statSync(path).size; } catch { return null; }
  const c = titles.get(path);
  if (c && (c.title || c.size === size)) return c.title;
  let title: string | null = null;
  try {
    for (const line of head(path, Math.min(size, 256 * 1024)).split("\n")) {
      if (!line.startsWith('{"type":"message"')) continue;
      let o: any; try { o = JSON.parse(line); } catch { continue; }
      if (o.message?.role === "user") { title = blocksText(o.message.content).replace(/\s+/g, " ").trim().slice(0, 80) || null; break; }
    }
  } catch {}
  titles.set(path, { size, title });
  return title;
}

/** Past pi sessions for the "resume" list. */
export function recentPiSessions(limit = 30): Recent[] {
  const all: { path: string; mtime: number; id: string }[] = [];
  for (const dir of sessionDirs()) {
    let names: string[];
    try { names = readdirSync(dir); } catch { continue; }
    for (const n of names) {
      const m = n.match(/_([\w-]{8,128})\.jsonl$/);
      if (!m) continue;
      try { const st = statSync(join(dir, n)); if (st.size > 1500) all.push({ path: join(dir, n), mtime: st.mtimeMs, id: m[1] }); } catch {}
    }
  }
  all.sort((a, b) => b.mtime - a.mtime);
  const out: Recent[] = [];
  for (const r of all.slice(0, limit)) {
    let cwd = "";
    try {
      cwd = JSON.parse(head(r.path, 4096).split("\n")[0]).cwd ?? "";
    } catch {}
    if (cwd) out.push({ sessionId: r.id, cwd, title: piTitle(r.path), mtime: r.mtime, path: r.path, kind: "pi" });
  }
  return out;
}

// ───────── the first message, until pi has written it ─────────
// pi creates its session file only once the first message is processed, so for a moment the phone would show
// an empty chat (and a nameless card) for a message it just sent. The server remembers that first message and
// shows it as a pending item until the transcript has messages of its own.
const pendingFirst = new Map<string, string>(); // session id, or "tmux:<name>" for a session started from the phone

export const rememberFirst = (key: string, text: string) => { if (text.trim() && !pendingFirst.has(key)) pendingFirst.set(key, text); };

const hasMessages = (path: string | null) => { try { return !!path && head(path, 64 * 1024).includes('"type":"message"'); } catch { return false; } };

/** The first message of a pi session whose transcript doesn't have it yet, else null (and forgotten). */
export function pendingFirstMessage(id: string, path: string | null, tmuxName?: string | null): string | null {
  const keys = [id, ...(tmuxName ? ["tmux:" + tmuxName] : [])];
  const text = keys.map((k) => pendingFirst.get(k)).find((t) => t !== undefined) ?? null;
  if (text === null) return null;
  if (hasMessages(path)) { for (const k of keys) pendingFirst.delete(k); return null; }
  return text;
}
