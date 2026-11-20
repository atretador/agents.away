// Context-window usage and subagents (Task/Agent tool sub-sessions) of a Claude Code session.
// Read-only: everything comes from files Claude Code writes under ~/.claude/projects.
import { join, dirname, basename } from "node:path";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { readRange, fileSize, readTail, parseLines, type Item } from "./claude";

// ───────── context usage ─────────
// Same formula as Claude Code's status line (and claude-hud): input + cache-creation + cache-read
// tokens of the newest main-chain assistant response (output tokens don't count), reset by a
// /compact boundary to its postTokens. The transcript doesn't record the window size, so it comes
// from the model id: haiku and pre-4.6 Opus/Sonnet have 200k unless the id says [1m]; newer
// models run with 1M in Claude Code. Seeing more than 200k in use also proves a 1M window.
export type Context = { pct: number; tokens: number; size: number; model: string | null };

export function windowSize(model: string | null, tokens: number) {
  const m = (model ?? "").toLowerCase();
  let size = 1_000_000;
  if (!m) size = 200_000;
  else if (!m.includes("[1m]") && (/haiku|claude-[23]/.test(m) || (/claude-(opus|sonnet)-4/.test(m) && !/claude-(opus|sonnet)-4-[6-9](?!\d)/.test(m)))) size = 200_000;
  return tokens > size ? 1_000_000 : size;
}

const ctxCache = new Map<string, { size: number; ctx: Context | null }>();
export function contextUsage(path: string | null): Context | null {
  if (!path) return null;
  const size = fileSize(path);
  const c = ctxCache.get(path);
  if (c && c.size === size) return c.ctx;
  let ctx: Context | null = null;
  // Only the tail: transcripts can be hundreds of MB. Grow the window if the tail has no usage yet.
  for (let span = 512 * 1024; span <= 8 * 1024 * 1024 && !ctx; span *= 4) {
    const text = readRange(path, Math.max(0, size - span), size);
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= (size > span ? 1 : 0); i--) {
      const l = lines[i];
      if (!l.startsWith('{"parentUuid"') || l.includes('"isSidechain":true')) continue;
      if (l.includes('"subtype":"compact_boundary"')) {
        try { const o = JSON.parse(l); const t = Math.trunc(Number(o.compactMetadata?.postTokens) || 0); ctx = { pct: 0, tokens: t, size: 0, model: c?.ctx?.model ?? null }; } catch {}
        if (ctx) break;
      }
      if (!l.includes('"type":"assistant"') || !l.includes('"usage"')) continue;
      let o: any;
      try { o = JSON.parse(l); } catch { continue; }
      const u = o.message?.usage, model = o.message?.model;
      if (o.type !== "assistant" || !u || model === "<synthetic>") continue;
      const t = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
      ctx = { pct: 0, tokens: t, size: 0, model: model ?? null };
      break;
    }
    if (size <= span) break;
  }
  if (ctx) { ctx.size = windowSize(ctx.model, ctx.tokens); ctx.pct = Math.min(100, Math.max(0, Math.round((ctx.tokens / ctx.size) * 100))); }
  ctxCache.set(path, { size, ctx });
  return ctx;
}

// ───────── subagents ─────────
// Claude Code keeps each subagent's transcript next to the parent's:
//   <project>/<sessionId>.jsonl                      the main session
//   <project>/<sessionId>/subagents/agent-<id>.jsonl the subagent's chat (every line isSidechain)
//   <project>/<sessionId>/subagents/agent-<id>.meta.json
//     {agentType, description, toolUseId, spawnDepth, parentAgentId?, finished?, stoppedByUser?, …}
// toolUseId is the id of the parent's Agent/Task tool_use. Background agents report back through
// <task-notification> messages in the parent transcript (<task-id> = agent id, <status>).
export type AgentStatus = "running" | "done" | "failed" | "stopped";
export type SubAgent = {
  id: string; description: string; type: string; status: AgentStatus; toolUseId: string | null;
  startedAt: number; endedAt: number | null; depth: number; parentAgentId: string | null; model: string | null; summary: string | null;
};

const RECENT_MS = 30 * 60_000;
export const agentsDir = (transcript: string) => join(dirname(transcript), basename(transcript, ".jsonl"), "subagents");

type MetaEntry = { mtime: number; meta: any; startedAt: number };
const metaCache = new Map<string, MetaEntry>();
function readMeta(dir: string, id: string): MetaEntry | null {
  const p = join(dir, `agent-${id}.meta.json`);
  let mtime = 0;
  try { mtime = statSync(p).mtimeMs; } catch { return null; }
  const c = metaCache.get(p);
  if (c && c.mtime === mtime) return c;
  let meta: any = {};
  try { meta = JSON.parse(readFileSync(p, "utf8")); } catch {}
  let startedAt = c?.startedAt ?? 0;
  if (!startedAt) {
    const m = readRange(join(dir, `agent-${id}.jsonl`), 0, 8192).match(/"timestamp":"([^"]+)"/);
    startedAt = m ? Date.parse(m[1]) || 0 : 0;
  }
  const e = { mtime, meta, startedAt: startedAt || mtime };
  metaCache.set(p, e);
  return e;
}

// <task-notification>s in the parent transcript, scanned once and then incrementally.
type Note = { status: string; summary: string; at: number };
const noteCache = new Map<string, { offset: number; notes: Map<string, Note> }>();
const NOTE_RE = /<task-id>([\w-]+)<\/task-id>[\s\S]{0,800}?<status>(\w+)<\/status>(?:\\n)?(?:<summary>([^<]{0,400})<\/summary>)?/g;
function notifications(path: string): Map<string, Note> {
  let c = noteCache.get(path);
  const size = fileSize(path);
  if (!c || size < c.offset) { c = { offset: 0, notes: new Map() }; noteCache.set(path, c); }
  while (c.offset < size) {
    const end = Math.min(size, c.offset + 16 * 1024 * 1024);
    let text = readRange(path, c.offset, end);
    let next = end;
    if (end < size) {
      const nl = text.lastIndexOf("\n");
      if (nl < 0) { c.offset = end; continue; } // one enormous line: skip it
      text = text.slice(0, nl + 1);
      next = c.offset + Buffer.byteLength(text);
    } else {
      const nl = text.lastIndexOf("\n");
      if (nl < 0) break; // partial last line: wait for it
      text = text.slice(0, nl + 1);
      next = c.offset + Buffer.byteLength(text);
    }
    if (text.includes("<task-id>")) for (const m of text.matchAll(NOTE_RE)) {
      let summary = m[3] ?? "";
      try { summary = JSON.parse(`"${summary}"`); } catch {}
      // The line's own timestamp (quotes inside JSON strings are escaped, so this only hits real keys).
      const ls = text.lastIndexOf("\n", m.index!) + 1, le = text.indexOf("\n", m.index!);
      const ts = text.slice(ls, le < 0 ? undefined : le).match(/"timestamp":"([^"]+)"/);
      if (!ts) continue; // api-request blobs replay old messages: only real transcript lines count
      const at = Date.parse(ts[1]) || 0, prev = c.notes.get(m[1]);
      if (!prev || at >= prev.at) c.notes.set(m[1], { status: m[2], summary, at });
    }
    c.offset = next;
  }
  return c.notes;
}

function agentIds(dir: string): string[] {
  try { return readdirSync(dir).filter((f) => f.startsWith("agent-") && f.endsWith(".meta.json")).map((f) => f.slice(6, -10)); } catch { return []; }
}

/** All subagents of a session. `live` = the parent Claude process is still running. */
export function listAgents(transcript: string | null, live: boolean, withNotes = true): SubAgent[] {
  if (!transcript) return [];
  const dir = agentsDir(transcript);
  const ids = agentIds(dir);
  if (!ids.length) return [];
  const now = Date.now();
  let notes: Map<string, Note> | null = null;
  const out: SubAgent[] = [];
  for (const id of ids) {
    const e = readMeta(dir, id);
    if (!e) continue;
    const m = e.meta;
    let mtime = e.mtime;
    try { mtime = statSync(join(dir, `agent-${id}.jsonl`)).mtimeMs; } catch {}
    // Notes are only needed to tell failures apart or when the meta file hasn't said "finished".
    if (!notes && (withNotes || (!m.finished && live))) notes = notifications(transcript);
    // A notification older than the agent's last write is stale (the agent was resumed since).
    let n = notes?.get(id);
    if (n && n.at < mtime - 5000) n = undefined;
    const ended = n && (n.status !== "completed" || / finished$/.test(n.summary));
    let status: AgentStatus;
    if (n?.status === "failed") status = "failed";
    else if (m.stoppedByUser || n?.status === "killed" || n?.status === "stopped") status = "stopped";
    else if (!m.finished) status = live && !ended && now - mtime < RECENT_MS ? "running" : ended ? "done" : "stopped";
    // A finished agent that was messaged again (resumed) writes to its transcript after the meta file.
    else status = live && mtime > e.mtime + 3000 && now - mtime < 120_000 ? "running" : "done";
    out.push({
      id, description: String(m.description ?? ""), type: String(m.agentType ?? "agent"), status,
      toolUseId: m.toolUseId ?? null, startedAt: e.startedAt, endedAt: status === "running" ? null : mtime,
      depth: Number(m.spawnDepth) || 1, parentAgentId: m.parentAgentId ?? null, model: m.model ?? null,
      summary: n?.summary || null,
    });
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

/** Cheap per-refresh numbers for the session list (no notification scan unless something may be running). */
export function agentCounts(transcript: string | null, live: boolean): { total: number; running: number } | null {
  const l = listAgents(transcript, live, false);
  return l.length ? { total: l.length, running: l.filter((a) => a.status === "running").length } : null;
}

export function agentTranscript(transcript: string | null, agentId: string): string | null {
  if (!transcript || !/^[\w-]+$/.test(agentId)) return null;
  const p = join(agentsDir(transcript), `agent-${agentId}.jsonl`);
  return fileSize(p) ? p : null;
}

function lastNewline(path: string, size: number) {
  if (!size) return 0;
  const tail = readRange(path, Math.max(0, size - 65536), size);
  const i = tail.lastIndexOf("\n");
  return i < 0 ? size : size - (Buffer.byteLength(tail) - i - 1);
}

/** Chat items of a subagent transcript: the tail (`before` pages back, `from` resumes forward). */
export function agentChat(path: string, opts: { from?: number; before?: number; want?: number }): { items: Item[]; start: number; end: number } {
  const end = lastNewline(path, fileSize(path));
  if (opts.from && opts.from > 0 && opts.from <= end) {
    return { items: parseLines(readRange(path, opts.from, end), opts.from, true).items, start: opts.from, end };
  }
  const before = opts.before && opts.before > 0 ? Math.min(opts.before, end) : end;
  const t = readTail(path, before, opts.want ?? 70, true);
  return { items: t.items, start: t.start, end };
}
