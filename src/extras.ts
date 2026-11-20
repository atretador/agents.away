// Session prefs (rename / pin / mute), git changes, transcript search, local image serving.
import { join, extname } from "node:path";
import { existsSync, statSync, realpathSync, openSync, readSync, closeSync } from "node:fs";
import { DATA_DIR, CLAUDE_DIR, HOME, readJson, writeJson } from "./config";
import { sessionTitle } from "./claude";

// ───────── session prefs ─────────
export type SessionPref = { name?: string; pinned?: boolean; muted?: boolean; hiddenAgents?: string[] };
const PREFS_FILE = join(DATA_DIR, "session-prefs.json");
const prefs: Record<string, SessionPref> = readJson(PREFS_FILE, {});

export function getPref(id: string): SessionPref {
  return prefs[id] ?? {};
}
export function setPref(id: string, patch: SessionPref) {
  const p = { ...getPref(id), ...patch };
  if (typeof p.name === "string") p.name = p.name.trim().slice(0, 120) || undefined;
  if (p.hiddenAgents && !p.hiddenAgents.length) delete p.hiddenAgents;
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

// The repo's own .git/config can be written by an agent or come from a downloaded archive, and git runs
// commands from it (core.fsmonitor, diff drivers, textconv, clean/smudge filters). Override all of them
// on the command line; refuse repos whose local config defines a long-running filter process.
const SAFE_GIT = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null", "-c", "diff.external=", "-c", "core.pager=cat", "-c", "protocol.allow=never"];
async function gitGuard(cwd: string): Promise<{ args: string[]; refuse?: string }> {
  // `git config` only reads config; --show-scope tells repo-local settings apart from the user's own.
  const r = await run(["git", ...SAFE_GIT, "config", "--list", "--includes", "--show-scope", "--null"], cwd, 200_000);
  const args = [...SAFE_GIT];
  // --null output: scope NUL key LF value NUL, repeated.
  const parts = r.out.split("\0");
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (parts[i] !== "local" && parts[i] !== "worktree") continue;
    const key = parts[i + 1].split("\n")[0].toLowerCase();
    const f = key.match(/^filter\.(.+)\.(clean|smudge|process|required)$/);
    if (f?.[2] === "process") return { args, refuse: `This repo's git config defines a filter process (filter.${f[1]}), so Changes won't run git here.` };
    if (f) args.push("-c", `filter.${f[1]}.clean=cat`, "-c", `filter.${f[1]}.smudge=cat`, "-c", `filter.${f[1]}.required=false`);
  }
  return { args };
}

export async function gitChanges(cwd: string) {
  if (!existsSync(cwd)) return { repo: false, error: "Folder not found" };
  const guard = await gitGuard(cwd);
  if (guard.refuse) return { repo: false, error: guard.refuse };
  const git = (...a: string[]) => ["git", ...guard.args, ...a];
  const top = await run(git("rev-parse", "--show-toplevel"), cwd);
  if (!top.ok) return { repo: false };
  const root = top.out.trim();
  const branch = (await run(git("rev-parse", "--abbrev-ref", "HEAD"), root)).out.trim();
  const hasHead = (await run(git("rev-parse", "--verify", "-q", "HEAD"), root)).ok;
  const base = hasHead ? ["HEAD"] : ["--cached"];
  const numstat = await run(git("diff", "--no-ext-diff", "--no-textconv", "--numstat", "-M", ...base), root);
  const diff = await run(git("diff", "--no-ext-diff", "--no-textconv", "-M", "--no-color", "-U3", ...base), root, 600_000);
  const untracked = (await run(git("ls-files", "--others", "--exclude-standard"), root)).out.split("\n").filter(Boolean);
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
      const r = await run(git("diff", "--no-ext-diff", "--no-textconv", "--no-index", "--no-color", "--", "/dev/null", f), root, 80_000);
      extra += r.out;
      const lines = r.out.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
      files.push({ path: f, added: lines, removed: 0 });
    } catch {}
  }
  const log = (await run(git("log", "--oneline", "-n", "8", "--no-color", "--no-show-signature"), root)).out.trim().split("\n").filter(Boolean);
  return {
    repo: true, root: root.replace(HOME, "~"), branch, files, untracked: untracked.length, log,
    diff: diff.out + extra, truncated: diff.truncated,
  };
}

// ───────── local images (Read results, markdown images) ─────────
const IMG = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp"]);
export function localImage(path: string): string | null {
  if (!path.startsWith("/")) return null;
  // Check the real file, so a symlink named x.png can't expose ~/.ssh/id_ed25519.
  let real: string;
  try { real = realpathSync(path); if (!statSync(real).isFile()) return null; } catch { return null; }
  if (!IMG.has(extname(path).toLowerCase()) || !IMG.has(extname(real).toLowerCase())) return null;
  // And it must really be an image (by its first bytes), not just named like one.
  try {
    const fd = openSync(real, "r"), b = Buffer.alloc(16);
    readSync(fd, b, 0, 16, 0); closeSync(fd);
    const isImg = b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // PNG
      || (b[0] === 0xff && b[1] === 0xd8) // JPEG
      || b.subarray(0, 4).toString("latin1") === "GIF8"
      || (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP")
      || b.subarray(4, 8).toString("latin1") === "ftyp" // AVIF/HEIC
      || b.subarray(0, 2).toString("latin1") === "BM";
    if (!isImg) return null;
  } catch { return null; }
  return real;
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
    const sessionId = f.split("/").pop()!.replace(/\.jsonl$/, "");
    if (!hits.length || !/^[\w-]{1,128}$/.test(sessionId)) return null;
    return { sessionId, cwd, home: cwd.replace(HOME, "~"), title: sessionTitle(f), mtime: m, count: hits.length, hits: hits.slice(-4).reverse() };
  });
  return results.filter(Boolean);
}
