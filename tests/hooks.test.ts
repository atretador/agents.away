// The hooks installer edits ~/.claude/settings.json: run the real CLI against a temp HOME.
import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CLI = join(import.meta.dir, "../bin/agents-away");
const EVENTS = ["Notification", "Stop", "UserPromptSubmit", "PostToolUse", "PreToolUse"];

function home(settings?: object | string) {
  const h = mkdtempSync(join(process.env.AWAY_TEST_ROOT!, "home-"));
  mkdirSync(join(h, ".claude"));
  if (settings !== undefined) writeFileSync(join(h, ".claude/settings.json"), typeof settings === "string" ? settings : JSON.stringify(settings));
  return h;
}
const run = (h: string, ...args: string[]) => {
  const p = Bun.spawnSync(["bun", CLI, "hooks", ...args], { env: { ...process.env, HOME: h } });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
};
const settings = (h: string) => JSON.parse(readFileSync(join(h, ".claude/settings.json"), "utf8"));
const ours = (h: string) => Object.fromEntries(Object.entries(settings(h).hooks ?? {}).map(([ev, list]: any) =>
  [ev, list.flatMap((m: any) => m.hooks.filter((x: any) => / hook$/.test(x.command) && x.command.includes("agents-away")))]));

describe("agents-away hooks", () => {
  test("install adds one hook per event, keeps other settings and hooks", () => {
    const h = home({ model: "opus", hooks: { Stop: [{ hooks: [{ type: "command", command: "notify-send done" }] }] } });
    expect(run(h, "install").code).toBe(0);
    const s = settings(h);
    expect(s.model).toBe("opus");
    expect(s.hooks.Stop.flatMap((m: any) => m.hooks.map((x: any) => x.command))).toContain("notify-send done");
    for (const ev of EVENTS) expect(ours(h)[ev]).toHaveLength(1);
    expect(s.hooks.PreToolUse.find((m: any) => m.hooks.some((x: any) => x.command.includes("agents-away"))).matcher).toBe("*");
    expect(readdirSync(join(h, ".claude")).some((f) => f.startsWith("settings.json.bak"))).toBe(true);
  });

  test("installing twice doesn't duplicate", () => {
    const h = home({});
    run(h, "install"); run(h, "install");
    for (const ev of EVENTS) expect(ours(h)[ev]).toHaveLength(1);
    expect(run(h, "status").out).toContain("installed");
  });

  test("uninstall removes only ours", () => {
    const h = home({ hooks: { Stop: [{ hooks: [{ type: "command", command: "notify-send done" }] }] } });
    run(h, "install");
    expect(run(h, "uninstall").code).toBe(0);
    expect(settings(h).hooks).toEqual({ Stop: [{ hooks: [{ type: "command", command: "notify-send done" }] }] });
    expect(run(h, "status").out).toContain("not installed");
  });

  test("works without a settings file", () => {
    const h = home();
    expect(run(h, "install").code).toBe(0);
    for (const ev of EVENTS) expect(ours(h)[ev]).toHaveLength(1);
  });

  test("refuses to touch invalid JSON", () => {
    const h = home("{ not json");
    expect(run(h, "install").code).not.toBe(0);
    expect(readFileSync(join(h, ".claude/settings.json"), "utf8")).toBe("{ not json");
  });
});

test("status notices hooks installed by an older version", () => {
  const h = home({});
  run(h, "install");
  const s = settings(h);
  s.hooks.PreToolUse.find((m: any) => m.hooks.some((x: any) => x.command.includes("agents-away"))).matcher = "AskUserQuestion";
  writeFileSync(join(h, ".claude/settings.json"), JSON.stringify(s));
  expect(run(h, "status").out).toContain("out of date");
  run(h, "install");
  expect(run(h, "status").out).toContain("hooks are installed.");
});
