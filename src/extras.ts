// Session prefs (rename / pin / mute), git changes, transcript search, local image serving.
import { join, extname } from "node:path";
import { existsSync, statSync } from "node:fs";
import { DATA_DIR, CLAUDE_DIR, HOME, readJson, writeJson } from "./config";
import { sessionTitle } from "./claude";

// ───────── session prefs ─────────
export type SessionPref = { name?: string; pinned?: boolean; muted?: boolean };
const PREFS_FILE = join(DATA_DIR, "session-prefs.json");
const prefs: Record<string, SessionPref> = readJson(PREFS_FILE, {});

export function getPref(id: string): SessionPref {
  return prefs[id] ?? {};
}
export function setPref(id: string, patch: SessionPref) {
  const p = { ...getPref(id), ...patch };
  if (typeof p.name === "string") p.name = p.name.trim().slice(0, 120) || undefined;
  for (const k of Object.keys(p) as (keyof SessionPref)[]) if (p[k] === undefined || p[k] === false) delete p[k];
  if (Object.keys(p).length) prefs[id] = p; else delete prefs[id];
  writeJson(PREFS_FILE, prefs);
  return p;
}
/** Carry prefs over when Claude gives a resumed conversation a new session id. */
export function allPrefs() {
  return prefs;
}

// ───────── git changes ─────────
async function run(cmd: string[], cwd: string, max = 2_000_000) {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_PAGER: "cat", LC_ALL: "C" } });
  const out = await new Response(p.stdout).text();
  const code = await p.exited;
  return { ok: code === 0, out: out.length > max ? out.slice(0, max) : out, truncated: out.length > max };
}

export async function gitChanges(cwd: string) {
  if (!existsSync(cwd)) return { repo: false, error: "Folder not found" };
  const top = await run(["git", "rev-parse", "--show-toplevel"], cwd);
  if (!top.ok) return { repo: false };
  const root = top.out.trim();
  const branch = (await run(["git", "rev-parse", "--abbrev-ref", "HEAD"], root)).out.trim();
  const hasHead = (await run(["git", "rev-parse", "--verify", "-q", "HEAD"], root)).ok;
  const base = hasHead ? ["HEAD"] : ["--cached"];
  const numstat = await run(["git", "diff", "--numstat", "-M", ...base], root);
  const diff = await run(["git", "diff", "-M", "--no-color", "-U3", ...base], root, 600_000);
  const untracked = (await run(["git", "ls-files", "--others", "--exclude-standard"], root)).out.split("\n").filter(Boolean);
  const files = numstat.out.split("\n").filter(Boolean).map((l) => {
    const [a, d, ...rest] = l.split("\t");
    return { path: rest.join("\t"), added: a === "-" ? null : +a, removed: d === "-" ? null : +d };
  });
  // Show small untracked text files as all-added.
  let extra = "";
  for (const f of untracked.slice(0, 30)) {
    const full = join(root, f);
    try {
      const st = statSync(full);
      if (st.size > 60_000) { files.push({ path: f, added: null, removed: null }); continue; }
      const r = await run(["git", "diff", "--no-index", "--no-color", "--", "/dev/null", f], root, 80_000);
      extra += r.out;
      const lines = r.out.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
      files.push({ path: f, added: lines, removed: 0 });
    } catch {}
  }
  const log = (await run(["git", "log", "--oneline", "-n", "8", "--no-color"], root)).out.trim().split("\n").filter(Boolean);
  return {
    repo: true, root: root.replace(HOME, "~"), branch, files, untracked: untracked.length, log,
    diff: diff.out + extra, truncated: diff.truncated,
  };
}

// ───────── local images (Read results, markdown images) ─────────
const IMG = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp"]);
export function localImage(path: string): string | null {
  if (!path.startsWith("/")) return null;
  if (!IMG.has(extname(path).toLowerCase())) return null;
  try { if (!statSync(path).isFile()) return null; } catch { return null; }
  return path;
}

// ───────── search ─────────
const PROJ_DIR = join(CLAUDE_DIR, "projects");

function textOf(o: any): { role: "user" | "claude"; text: string } | null {
  if (o.isSidechain || o.isMeta) return null;
  const c = o.message?.content;
  if (o.type === "user") {
    if (typeof c === "string") return { role: "user", text: c };
    if (Array.isArray(c)) { const t = c.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n"); return t ? { role: "user", text: t } : null; }
  }
  if (o.type === "assistant" && Array.isArray(c)) {
    const t = c.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    return t ? { role: "claude", text: t } : null;
  }
  return null;
}

function snippet(text: string, q: string) {
  const clean = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").replace(/\s+/g, " ");
  const i = clean.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const a = Math.max(0, i - 70), b = Math.min(clean.length, i + q.length + 110);
  return { pre: (a ? "…" : "") + clean.slice(a, i), hit: clean.slice(i, i + q.length), post: clean.slice(i + q.length, b) + (b < clean.length ? "…" : "") };
}

export async function search(q: string, limitFiles = 25) {
  q = q.trim();
  if (q.length < 2) return [];
  // Only conversation lines start with {"parentUuid" — skip the huge api-request blobs.
  const pat = '^\\{"parentUuid".*(?i)\\Q' + q.replace(/\\E/g, "\\E\\\\E\\Q") + "\\E";
  const rg = Bun.spawn(["rg", "-P", "--with-filename", "--no-line-number", "-m", "60", "--glob", "*.jsonl", "--glob", "!**/subagents/**", "--", pat, PROJ_DIR], { stdout: "pipe", stderr: "ignore" });
  const out = await new Response(rg.stdout).text();
  const byFile = new Map<string, string[]>();
  for (const line of out.split("\n")) {
    const i = line.indexOf(".jsonl:");
    if (i < 0) continue;
    const f = line.slice(0, i + 6);
    (byFile.get(f) ?? byFile.set(f, []).get(f)!).push(line.slice(i + 7));
  }
  const files = [...byFile.keys()].map((f) => ({ f, m: statSync(f).mtimeMs })).sort((a, b) => b.m - a.m).slice(0, limitFiles);
  const results = files.map(({ f, m }) => {
    const hits: { role: string; ts?: string; pre: string; hit: string; post: string }[] = [];
    let cwd = "";
    for (const line of byFile.get(f)!) {
      let o: any; try { o = JSON.parse(line); } catch { continue; }
      cwd ||= o.cwd ?? "";
      const t = textOf(o);
      if (!t) continue;
      const sn = snippet(t.text, q);
      if (sn) hits.push({ role: t.role, ts: o.timestamp, ...sn });
    }
    if (!hits.length) return null;
    const sessionId = f.split("/").pop()!.replace(/\.jsonl$/, "");
    return { sessionId, cwd, home: cwd.replace(HOME, "~"), title: sessionTitle(f), mtime: m, count: hits.length, hits: hits.slice(-4).reverse() };
  });
  return results.filter(Boolean);
}
