// Optional release check (off by default; `agents-away updates on`). Once a day it asks GitHub for the
// project's latest release and, when it's newer than the running version, sends one notification.
// The request carries no user data; GitHub sees this PC's IP address, which is why it's opt-in.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, readJson, writeJson } from "./config";

const PKG = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8"));
export const VERSION: string = PKG.version;
/** "owner/repo" from package.json's repository URL, so a fork checks its own releases. */
export const REPO: string | null = String(PKG.repository?.url ?? PKG.repository ?? "").match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1] ?? null;

const STATE_FILE = join(DATA_DIR, "update.json");
const DAY = 24 * 3600_000;

export type Release = { version: string; tag: string; name: string; url: string; publishedAt: string };
export type UpdateState = {
  checkedAt?: number; // last successful check
  error?: string; // last failed check, cleared on success
  latest?: Release | null; // null = the repo has no published release
  notified?: string; // version already notified about (never notify twice)
};

export const loadState = () => readJson<UpdateState>(STATE_FILE, {});
const saveState = (s: UpdateState) => writeJson(STATE_FILE, s);

/** Compares "1.2.3" style versions (a leading "v" is ignored). A pre-release (1.2.3-beta) is older
 *  than its release; pre-release labels are compared as plain strings. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre = ""] = v.trim().replace(/^v/i, "").split("-", 2);
    return { nums: core.split(".").map((x) => parseInt(x, 10) || 0), pre };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** The newer release, if there is one (null when up to date or unknown). */
export function newerRelease(s: UpdateState = loadState()): Release | null {
  return s.latest && compareVersions(s.latest.version, VERSION) > 0 ? s.latest : null;
}

/** Asks GitHub for the latest published release (drafts and pre-releases are skipped by GitHub). */
export async function checkNow(fetcher: typeof fetch = fetch): Promise<UpdateState> {
  const s = loadState();
  if (!REPO) { s.error = "package.json has no GitHub repository URL"; saveState(s); return s; }
  try {
    const r = await fetcher(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: "application/vnd.github+json", "user-agent": `agents-away/${VERSION}`, "x-github-api-version": "2022-11-28" },
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 404) s.latest = null;
    else if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
    else {
      const j = (await r.json()) as any;
      const tag = String(j.tag_name ?? "");
      if (!/^v?\d+(\.\d+)*/.test(tag)) throw new Error(`latest release has no version tag (${tag || "none"})`);
      s.latest = { version: tag.replace(/^v/i, ""), tag, name: String(j.name || tag).slice(0, 120), url: String(j.html_url ?? ""), publishedAt: String(j.published_at ?? "") };
    }
    s.checkedAt = Date.now();
    delete s.error;
  } catch (e: any) {
    s.error = String(e?.message ?? e).slice(0, 200);
  }
  saveState(s);
  return s;
}

/** Runs the daily check while `enabled()` is true; calls `onNew` once per newer version. */
export function startUpdateChecks(enabled: () => boolean, onNew: (r: Release) => void, fetcher: typeof fetch = fetch) {
  const tick = async (force = false) => {
    if (!enabled()) return;
    const last = loadState().checkedAt ?? 0;
    if (!force && Date.now() - last < DAY) return;
    const s = await checkNow(fetcher);
    notifyIfNew(s, onNew);
  };
  setTimeout(() => tick().catch(() => {}), 60_000).unref?.(); // not during startup
  setInterval(() => tick().catch(() => {}), 3600_000).unref?.();
  return { checkNow: async () => { const s = await checkNow(fetcher); notifyIfNew(s, onNew); return s; } };
}

function notifyIfNew(s: UpdateState, onNew: (r: Release) => void) {
  const r = newerRelease(s);
  if (!r || s.notified === r.version) return;
  s.notified = r.version;
  saveState(s);
  onNew(r);
}
