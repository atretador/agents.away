import { test, expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseLines, transcriptPath, readTail } from "../src/claude";
import { listPiProcs, piTitle, piTranscript, recentPiSessions, rememberFirst, pendingFirstMessage, PI_REG_DIR, PI_SESSIONS_DIR } from "../src/pi";

// pi's transcript format (~/.pi/agent/sessions/--<cwd>--/<timestamp>_<id>.jsonl)
const msg = (message: object, id = Math.random().toString(16).slice(2, 10)) => JSON.stringify({ type: "message", id, parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message });
const session = (id: string, cwd: string) => JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", cwd });

test("pi: chat items from a transcript", () => {
  const text = [
    session("019f0000-0000-7000-8000-000000000001", "/work/app"),
    JSON.stringify({ type: "model_change", id: "m", parentId: null, provider: "x", modelId: "y" }),
    msg({ role: "user", content: [{ type: "text", text: "fix the bug" }] }),
    msg({ role: "assistant", content: [
      { type: "thinking", thinking: "look at the file first" },
      { type: "text", text: "Looking." },
      { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls -la\nmore" } },
      { type: "toolCall", id: "c2", name: "read", arguments: '{"path":"/work/app/a.ts"}' },
    ] }),
    msg({ role: "toolResult", toolCallId: "c1", toolName: "bash", content: [{ type: "text", text: "a.ts" }], isError: false }),
    msg({ role: "toolResult", toolCallId: "c2", toolName: "read", content: [{ type: "text", text: "boom" }], isError: true }),
  ].join("\n");
  const { items } = parseLines(text);
  expect(items.map((i) => i.k)).toEqual(["user", "thinking", "text", "tool", "tool", "result", "result"]);
  expect(items[0]).toMatchObject({ k: "user", text: "fix the bug" });
  expect(items[3]).toMatchObject({ k: "tool", id: "c1", name: "bash", summary: "ls -la" }); // first line only
  expect(items[4]).toMatchObject({ k: "tool", id: "c2", summary: "/work/app/a.ts" }); // arguments given as a JSON string
  expect(items[5]).toMatchObject({ k: "result", id: "c1", text: "a.ts", error: false });
  expect(items[6]).toMatchObject({ k: "result", id: "c2", error: true });
});

test("pi: failed turns show the error, byte offsets let the phone resume", () => {
  const a = msg({ role: "user", content: "hi" });
  const b = msg({ role: "assistant", content: [], stopReason: "error", errorMessage: "Connection error." });
  const { items } = parseLines(a + "\n" + b + "\n", 100);
  expect(items[0]).toMatchObject({ k: "user", text: "hi", o: 100 });
  expect(items[1]).toMatchObject({ k: "result", error: true, text: "Connection error.", o: 100 + Buffer.byteLength(a) + 1 });
});

test("pi: finds transcripts, titles and recent sessions on disk", () => {
  const id = "019f1111-2222-7333-8444-555555555555";
  const dir = join(PI_SESSIONS_DIR, "--work-app--");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `2026-01-01T00-00-00-000Z_${id}.jsonl`);
  writeFileSync(file, [session(id, "/work/app"), msg({ role: "user", content: [{ type: "text", text: "  add\n  a login page " }] }), msg({ role: "assistant", content: [{ type: "text", text: "x".repeat(2000) }] })].join("\n") + "\n");
  expect(piTranscript(id)).toBe(file);
  expect(transcriptPath(id)).toBe(file); // the shared lookup finds pi sessions too
  expect(piTranscript("../etc/passwd")).toBeNull();
  expect(piTitle(file)).toBe("add a login page");
  expect(piTitle(file, "My name")).toBe("My name");
  const r = recentPiSessions().find((x) => x.sessionId === id);
  expect(r).toMatchObject({ cwd: "/work/app", kind: "pi", title: "add a login page" });
  expect(readTail(file, Bun.file(file).size, 10).items.length).toBe(2);
});

test("pi: live sessions come from the extension's pid files, stale ones are dropped", () => {
  mkdirSync(PI_REG_DIR, { recursive: true });
  // a live pid whose command line isn't pi (this test process) must not be believed
  writeFileSync(join(PI_REG_DIR, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: "abc-1", cwd: "/work/app", status: "busy" }));
  writeFileSync(join(PI_REG_DIR, "999999999.json"), JSON.stringify({ pid: 999999999, sessionId: "abc-2", cwd: "/x" }));
  expect(listPiProcs()).toEqual([]);
});

test("pi: a live pi is listed with its session, status and context", () => {
  // `exec -a pi` gives the process the command line "pi 30", like a real pi
  const p = Bun.spawn(["bash", "-c", "exec -a pi sleep 30"], { stdout: "ignore", stderr: "ignore" });
  try {
    mkdirSync(PI_REG_DIR, { recursive: true });
    writeFileSync(join(PI_REG_DIR, `${p.pid}.json`), JSON.stringify({
      pid: p.pid, sessionId: "019f9999-0000-7000-8000-000000000009", cwd: "/work/app", status: "busy", statusAt: 5, startedAt: 4,
      file: join(PI_SESSIONS_DIR, "nope.jsonl"), model: "m1", context: { tokens: 1000, size: 4000, pct: 25 },
    }));
    const procs = listPiProcs();
    expect(procs).toHaveLength(1);
    expect(procs[0]).toMatchObject({ kind: "pi", pid: p.pid, sessionId: "019f9999-0000-7000-8000-000000000009", cwd: "/work/app", status: "busy", name: "app", model: "m1", context: { pct: 25, tokens: 1000, size: 4000 } });
  } finally { p.kill(); }
});

test("pi: a custom session dir keeps the files flat", () => {
  const id = "019f3333-2222-7333-8444-666666666666";
  mkdirSync(PI_SESSIONS_DIR, { recursive: true });
  const file = join(PI_SESSIONS_DIR, `2026-01-02T00-00-00-000Z_${id}.jsonl`);
  writeFileSync(file, session(id, "/work/flat") + "\n" + msg({ role: "user", content: "x".repeat(1600) }) + "\n");
  expect(piTranscript(id)).toBe(file);
  expect(recentPiSessions().some((r) => r.sessionId === id)).toBe(true);
});

test("pi: the first message is shown until the transcript has it", () => {
  const id = "019f4444-2222-7333-8444-777777777777";
  const file = join(PI_SESSIONS_DIR, `2026-01-03T00-00-00-000Z_${id}.jsonl`);
  rememberFirst("tmux:pi-app", "build a thing");
  rememberFirst("tmux:pi-app", "ignored: only the first message is kept");
  // no file yet, then a file with only a header and bookkeeping: still pending (found through the tmux name)
  expect(pendingFirstMessage(id, null, "pi-app")).toBe("build a thing");
  mkdirSync(PI_SESSIONS_DIR, { recursive: true });
  writeFileSync(file, session(id, "/work/app") + "\n");
  expect(pendingFirstMessage(id, file, "pi-app")).toBe("build a thing");
  expect(pendingFirstMessage("other", null, "other-tmux")).toBeNull();
  // once the transcript has a message it wins, and the placeholder is forgotten for good
  writeFileSync(file, session(id, "/work/app") + "\n" + msg({ role: "user", content: "build a thing" }) + "\n");
  expect(pendingFirstMessage(id, file, "pi-app")).toBeNull();
  expect(pendingFirstMessage(id, null, "pi-app")).toBeNull();
});
