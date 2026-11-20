import { test, expect, describe, beforeEach } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, checkNow, newerRelease, startUpdateChecks, loadState, VERSION, REPO } from "../src/updates";

const stateFile = join(process.env.AWAY_DATA_DIR!, "update.json");
/** A fake GitHub answering the latest-release request; remembers what was asked. */
function github(status: number, body: unknown = {}) {
  const calls: { url: string; headers: Headers }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return Object.assign(f, { calls });
}
const release = (tag: string) => ({ tag_name: tag, name: `Agents Away ${tag}`, html_url: `https://github.com/x/y/releases/tag/${tag}`, published_at: "2026-11-20T00:00:00Z" });
const bump = (v: string) => v.replace(/(\d+)$/, (n) => String(+n + 1));

beforeEach(() => rmSync(stateFile, { force: true }));

describe("compareVersions", () => {
  test("orders numerically, ignoring a leading v", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2", "1.2.1")).toBe(-1);
  });
  test("a pre-release is older than its release", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
  });
});

describe("release check", () => {
  test("reads the repository from package.json", () => expect(REPO).toBe("atretador/agents.away"));

  test("asks GitHub's latest-release endpoint with a plain user agent", async () => {
    const gh = github(200, release("v" + VERSION));
    await checkNow(gh);
    expect(gh.calls[0].url).toBe(`https://api.github.com/repos/${REPO}/releases/latest`);
    expect(gh.calls[0].headers.get("user-agent")).toBe(`agents-away/${VERSION}`);
  });

  test("a newer release is reported; the same or older one isn't", async () => {
    await checkNow(github(200, release("v" + bump(VERSION))));
    expect(newerRelease()?.version).toBe(bump(VERSION));
    await checkNow(github(200, release("v" + VERSION)));
    expect(newerRelease()).toBeNull();
  });

  test("no release yet (404) and failures are recorded without throwing", async () => {
    expect((await checkNow(github(404))).latest).toBeNull();
    const s = await checkNow(github(500));
    expect(s.error).toContain("500");
    expect(s.latest).toBeNull(); // the last good answer is kept
    expect((await checkNow(github(200, { tag_name: "nightly" }))).error).toContain("no version tag");
  });

  test("notifies once per new version", async () => {
    const seen: string[] = [];
    const gh = github(200, release("v" + bump(VERSION)));
    const u = startUpdateChecks(() => true, (r) => seen.push(r.version), gh);
    await u.checkNow();
    await u.checkNow();
    expect(seen).toEqual([bump(VERSION)]);
    expect(loadState().notified).toBe(bump(VERSION));
  });
});
