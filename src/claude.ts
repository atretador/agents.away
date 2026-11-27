import { join, basename } from "node:path";
import { readdirSync, readlinkSync, statSync, openSync, readSync, closeSync, existsSync } from "node:fs";
import { CLAUDE_DIR } from "./config";
import type { Pane } from "./tmux";
import { parsePiOne, piTranscript } from "./pi";

export type ClaudeProc = {
  pid: number;
  sessionId: string;
  cwd: string;
  name: string;
  status: string;
  tty: string | null;
  startedAt: number;
  statusUpdatedAt: number;
};

const SESS_DIR = join(CLAUDE_DIR, "sessions");
const PROJ_DIR = join(CLAUDE_DIR, "projects");

export async function listClaudeProcs(): Promise<ClaudeProc[]> {
  const out: ClaudeProc[] = [];
  let files: string[] = [];
  try { files = readdirSync(SESS_DIR).filter((f) => /^\d+\.json$/.test(f)); } catch {}
  for (const f of files) {
    try {
      const d = await Bun.file(join(SESS_DIR, f)).json();
      if (d.kind && d.kind !== "interactive") continue;
      const pid = d.pid;
      if (!existsSync(`/proc/${pid}`) || !isSessionId(d.sessionId)) continue;
      let tty: string | null = null;
      try { tty = readlinkSync(`/proc/${pid}/fd/0`); } catch {}
      if (tty && !tty.startsWith("/dev/pts")) tty = null;
      out.push({ pid, sessionId: d.sessionId, cwd: d.cwd, name: d.name ?? basename(d.cwd), status: d.status ?? "unknown", tty, startedAt: d.startedAt ?? 0, statusUpdatedAt: d.statusUpdatedAt ?? 0 });
    } catch {}
  }
  return out;
}

/** Find the pane whose process tree contains pid (tty match is the fast path). */
export function matchPane(proc: ClaudeProc, panes: Pane[]): Pane | null {
  if (proc.tty) {
    const p = panes.find((p) => p.tty === proc.tty);
    if (p) return p;
  }
  return null;
}

export function ttyLastInput(tty: string | null): number {
  if (!tty) return 0;
  try { return statSync(tty).atimeMs; } catch { return 0; }
}

const transcriptCache = new Map<string, string>();
/** Session ids come from files anyone with write access to ~/.claude can name: only plain ids are used
 *  (they end up in paths, URLs and the phone's HTML). */
export const isSessionId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,128}$/.test(id);

export function transcriptPath(sessionId: string, cwd?: string): string | null {
  if (!isSessionId(sessionId)) return null;
  const c = transcriptCache.get(sessionId);
  if (c && existsSync(c)) return c;
  if (cwd) {
    const p = join(PROJ_DIR, cwd.replace(/[^a-zA-Z0-9]/g, "-"), sessionId + ".jsonl");
    if (existsSync(p)) { transcriptCache.set(sessionId, p); return p; }
  }
  const pi = piTranscript(sessionId);
  if (pi) return pi;
  try {
    for (const d of readdirSync(PROJ_DIR)) {
      const p = join(PROJ_DIR, d, sessionId + ".jsonl");
      if (existsSync(p)) { transcriptCache.set(sessionId, p); return p; }
    }
  } catch {}
  return null;
}

export function readRange(path: string, start: number, end: number): string {
  const len = Math.max(0, end - start);
  if (!len) return "";
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(len);
    const n = readSync(fd, buf, 0, len, start);
    return buf.subarray(0, n).toString("utf8");
  } finally { closeSync(fd); }
}

export function fileSize(path: string) {
  try { return statSync(path).size; } catch { return 0; }
}

export type Item =
  | { k: "user"; text: string; ts?: string }
  | { k: "command"; text: string; ts?: string }
  | { k: "text"; text: string; ts?: string }
  | { k: "thinking"; text: string; ts?: string } // a thinking model's reasoning (OpenCode), shown collapsed
  | { k: "tool"; id: string; name: string; summary: string; detail: string; ts?: string; until?: number } // until: a timed wait ends (ms)
  | { k: "result"; id: string; text: string; error: boolean }
  | { k: "queued"; text: string; ts?: string }
  | { k: "unqueue"; text?: string; ts?: string };

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more chars)` : s;
}

/** When a timed wait ends: ScheduleWakeup's delay, or a Bash command that is just `sleep N`. */
function waitUntil(name: string, input: any, ts?: string): number | undefined {
  const start = ts ? Date.parse(ts) : NaN;
  if (!Number.isFinite(start)) return undefined;
  if (name === "ScheduleWakeup" && Number(input?.delaySeconds) > 0) return start + Number(input.delaySeconds) * 1000;
  const m = name === "Bash" ? String(input?.command ?? "").trim().match(/^sleep\s+(\d+(?:\.\d+)?)([smh]?)$/) : null;
  if (m) return start + Number(m[1]) * ({ s: 1, m: 60, h: 3600 } as any)[m[2] || "s"] * 1000;
  return undefined;
}

function toolSummary(name: string, input: any): string {
  if (name === "Yield") return "Waiting for background work";
  if (name === "ScheduleWakeup") return String(input?.reason ?? "Waiting");
  if (!input || typeof input !== "object") return "";
  const pick = input.description || input.command || input.file_path || input.path || input.pattern || input.url || input.query || input.prompt || input.skill || input.subject;
  if (name === "Bash" && input.command) return input.description ? `${input.description}` : String(input.command).split("\n")[0];
  if (typeof pick === "string") return pick.split("\n")[0].slice(0, 200);
  return "";
}

const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

function userText(s: string): Item | null {
  s = s.replace(REMINDER, "").trim();
  if (!s) return null;
  const cmd = s.match(/<command-name>([^<]*)<\/command-name>/);
  if (cmd) {
    const a = s.match(/<command-args>([^<]*)<\/command-args>/);
    return { k: "command", text: (cmd[1] + " " + (a?.[1] ?? "")).trim() };
  }
  if (/^<(local-command|bash-|task-notification|command-message)/.test(s)) return null;
  return { k: "user", text: s };
}

export type Parsed = { items: Item[]; title?: string };

/** Parse transcript lines. With `base` (byte offset of `text`), every item gets `o` = its line's offset. */
export function parseLines(text: string, base?: number, sidechain = false): Parsed {
  const items: Item[] = [];
  let title: string | undefined;
  let off = base ?? 0;
  for (const line of text.split("\n")) {
    const lineOff = off;
    if (base !== undefined) off += Buffer.byteLength(line) + 1;
    if (!line || line[0] !== "{") continue;
    // Cheap prefilter: skip the (huge) api-request blobs and bookkeeping lines without parsing them.
    const head = line.slice(0, 40);
    if (head.startsWith('{"type":"message"')) { // a pi transcript (see pi.ts)
      let o: any;
      try { o = JSON.parse(line); } catch { continue; }
      const n0 = items.length;
      parsePiOne(o, items);
      if (base !== undefined) for (let i = n0; i < items.length; i++) (items[i] as any).o = lineOff;
      continue;
    }
    if (!head.startsWith('{"parentUuid"') && !head.startsWith('{"type":"queue-operation"') && !head.startsWith('{"type":"ai-title"')) continue;
    let o: any;
    try { o = JSON.parse(line); } catch { continue; }
    const n0 = items.length;
    parseOne(o, items, (t) => (title = t), sidechain);
    if (base !== undefined) for (let i = n0; i < items.length; i++) (items[i] as any).o = lineOff;
  }
  return { items, title };
}

function parseOne(o: any, items: Item[], setTitle: (t: string) => void, sidechain = false) {
    if (o.type === "ai-title" && o.aiTitle) { setTitle(o.aiTitle); return; }
    if (o.isSidechain && !sidechain) return; // subagent lines; their own transcripts parse with sidechain=true
    const ts = o.timestamp;
    if (o.type === "queue-operation") {
      const c = typeof o.content === "string" ? o.content : "";
      if (o.operation === "enqueue") { if (c && !c.startsWith("<")) items.push({ k: "queued", text: c, ts }); }
      else items.push({ k: "unqueue", text: c || undefined, ts });
      return;
    }
    if (o.type === "attachment" && o.attachment?.type === "queued_command") {
      const pr = o.attachment.prompt;
      const t = typeof pr === "string" ? pr : Array.isArray(pr) ? pr.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n") : "";
      const it = userText(t);
      if (it) items.push({ ...it, ts });
      return;
    }
    if (o.type === "user" && !o.isMeta) {
      const c = o.message?.content;
      if (typeof c === "string") { const it = userText(c); if (it) items.push({ ...it, ts }); }
      else if (Array.isArray(c)) {
        for (const b of c) {
          if (b.type === "text") { const it = userText(b.text ?? ""); if (it) items.push({ ...it, ts }); }
          else if (b.type === "tool_result") {
            let t = "";
            if (typeof b.content === "string") t = b.content;
            else if (Array.isArray(b.content)) t = b.content.map((x: any) => (x.type === "text" ? x.text : x.type === "image" ? "[image]" : "")).join("\n");
            items.push({ k: "result", id: b.tool_use_id, text: clip(t.replace(REMINDER, "").trim(), 1500), error: !!b.is_error });
          }
        }
      }
    } else if (o.type === "assistant") {
      const c = o.message?.content;
      if (!Array.isArray(c)) return;
      for (const b of c) {
        if (b.type === "text" && b.text?.trim()) items.push({ k: "text", text: b.text, ts });
        else if (b.type === "tool_use") {
          const until = waitUntil(b.name, b.input, ts);
          items.push({ k: "tool", id: b.id, name: b.name, summary: toolSummary(b.name, b.input), detail: clip(JSON.stringify(b.input, null, 2), 1500), ts, ...(until ? { until } : {}) });
        }
      }
    }
}

/** Read backwards from `before` until we have at least `want` items (or hit the start). */
export function readTail(path: string, before: number, want = 120, sidechain = false): { items: Item[]; start: number; title?: string } {
  let start = before;
  let chunk = 512 * 1024;
  let parsed: Parsed = { items: [] };
  while (start > 0) {
    start = Math.max(0, before - chunk);
    let text = readRange(path, start, before);
    if (start > 0) {
      const nl = text.indexOf("\n");
      if (nl < 0) { chunk *= 2; continue; }
      start += Buffer.byteLength(text.slice(0, nl + 1));
      text = text.slice(nl + 1);
    }
    parsed = parseLines(text, start, sidechain);
    if (parsed.items.length >= want || chunk >= 32 * 1024 * 1024) break;
    chunk *= 4;
  }
  let items = parsed.items;
  if (items.length > want) {
    // Keep the newest `want`, cutting at a line boundary so "Show earlier" resumes exactly there.
    let cut = items.length - want;
    const o = (items[cut] as any).o;
    while (cut > 0 && (items[cut - 1] as any).o === o) cut--;
    items = items.slice(cut);
    start = (items[0] as any).o;
  }
  return { items, start, title: parsed.title };
}

const titleCache = new Map<string, { size: number; title: string | null }>();
export function sessionTitle(path: string | null): string | null {
  if (!path) return null;
  const size = fileSize(path);
  const c = titleCache.get(path);
  if (c && c.size === size) return c.title;
  let title: string | null = c?.title ?? null;
  const text = readRange(path, Math.max(0, size - 256 * 1024), size);
  const m = [...text.matchAll(/"type":"ai-title","aiTitle":"((?:[^"\\]|\\.)*)"/g)].pop();
  if (m) { try { title = JSON.parse(`"${m[1]}"`); } catch {} }
  else if (!title) {
    const lp = [...text.matchAll(/"type":"last-prompt","lastPrompt":"((?:[^"\\]|\\.)*)"/g)].pop();
    if (lp) { try { title = JSON.parse(`"${lp[1]}"`).slice(0, 80); } catch {} }
  }
  titleCache.set(path, { size, title });
  return title;
}

/** Last assistant text in the transcript (for "finished" notifications). */
export function lastAssistantText(path: string | null): string | null {
  if (!path) return null;
  const size = fileSize(path);
  const { items } = readTail(path, size, 8);
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.k === "text") return it.text;
  }
  return null;
}

export type Recent = { sessionId: string; cwd: string; title: string | null; mtime: number; path: string; kind?: "pi" };

let recentCache: { at: number; list: Recent[] } | null = null;
export function recentSessions(limit = 25): Recent[] {
  if (recentCache && Date.now() - recentCache.at < 20_000) return recentCache.list.slice(0, limit);
  const all: Recent[] = [];
  try {
    for (const d of readdirSync(PROJ_DIR)) {
      const dir = join(PROJ_DIR, d);
      let files: string[];
      try { files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
      for (const f of files) {
        const path = join(dir, f);
        try {
          const st = statSync(path);
          if (st.size < 2000 || !isSessionId(f.slice(0, -6))) continue;
          all.push({ sessionId: f.slice(0, -6), cwd: "", title: null, mtime: st.mtimeMs, path });
        } catch {}
      }
    }
  } catch {}
  all.sort((a, b) => b.mtime - a.mtime);
  const list = all.slice(0, 60);
  for (const r of list) {
    const head = readRange(r.path, 0, 64 * 1024);
    const m = head.match(/"cwd":"((?:[^"\\]|\\.)*)"/);
    if (m) { try { r.cwd = JSON.parse(`"${m[1]}"`); } catch {} }
    r.title = sessionTitle(r.path);
  }
  recentCache = { at: Date.now(), list: list.filter((r) => r.cwd) };
  return recentCache.list.slice(0, limit);
}

export function knownProjectDirs(): string[] {
  const seen = new Set<string>();
  for (const r of recentSessions(60)) if (r.cwd && !r.cwd.startsWith("/tmp/") && existsSync(r.cwd)) seen.add(r.cwd);
  return [...seen];
}

// ───────── AskUserQuestion ─────────
export type AskQuestion = { question: string; header: string; multiSelect: boolean; options: { label: string; description: string }[] };

/** The tool input's questions, cleaned up (it comes from the model, so don't trust its shape). */
export function askQuestions(input: any): AskQuestion[] | null {
  const qs = Array.isArray(input?.questions) ? input.questions : null;
  if (!qs?.length) return null;
  return qs.slice(0, 8).map((q: any) => ({
    question: clip(String(q?.question ?? ""), 600), header: clip(String(q?.header ?? ""), 40), multiSelect: !!q?.multiSelect,
    options: (Array.isArray(q?.options) ? q.options : []).slice(0, 12)
      .map((o: any) => ({ label: clip(String(o?.label ?? ""), 200), description: clip(String(o?.description ?? ""), 400) })),
  }));
}

/** The newest AskUserQuestion call in the transcript that has no tool_result yet. (Some Claude Code
 *  versions only write the tool_use line once it's answered; the PreToolUse hook covers those.) */
const askCache = new Map<string, { size: number; ask: { id: string; questions: AskQuestion[] } | null }>();
export function pendingAsk(path: string | null) {
  if (!path) return null;
  const size = fileSize(path);
  const c = askCache.get(path);
  if (c && c.size === size) return c.ask;
  const text = readRange(path, Math.max(0, size - 512 * 1024), size);
  let ask: { id: string; questions: AskQuestion[] } | null = null;
  const at = text.lastIndexOf('"name":"AskUserQuestion"');
  if (at >= 0) {
    const s = text.lastIndexOf("\n", at) + 1, e = text.indexOf("\n", at);
    try {
      const o = JSON.parse(text.slice(s, e < 0 ? undefined : e));
      const b = [...(o.message?.content ?? [])].reverse().find((b: any) => b.type === "tool_use" && b.name === "AskUserQuestion");
      const questions = b && askQuestions(b.input);
      if (questions && !text.includes(`"tool_use_id":"${b.id}"`, s)) ask = { id: b.id, questions };
    } catch {}
  }
  askCache.set(path, { size, ask });
  return ask;
}
