import { test, expect, describe } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseLines, readTail } from "../src/claude";
import * as L from "./lines";

const parse = (...lines: string[]) => parseLines(lines.join("\n") + "\n").items;

describe("parseLines", () => {
  test("user text, assistant text and tool calls", () => {
    const items = parse(
      L.user("Fix the login bug"),
      L.assistant([L.text("Looking at it."), L.toolUse("t1", "Bash", { command: "npm test\n--watch=false", description: "Run tests" })]),
      L.user([L.toolResult("t1", "12 passing")]),
    );
    expect(items.map((i) => i.k)).toEqual(["user", "text", "tool", "result"]);
    expect(items[2]).toMatchObject({ k: "tool", id: "t1", name: "Bash", summary: "Run tests" });
    expect(items[3]).toMatchObject({ k: "result", id: "t1", text: "12 passing", error: false });
  });

  test("tool summaries pick the meaningful input field", () => {
    const items = parse(L.assistant([
      L.toolUse("a", "Read", { file_path: "src/app.ts" }),
      L.toolUse("b", "Bash", { command: "ls -la\npwd" }),
      L.toolUse("c", "Grep", { pattern: "TODO" }),
    ]));
    expect(items.map((i: any) => i.summary)).toEqual(["src/app.ts", "ls -la", "TODO"]);
  });

  test("slash commands become command items; reminders and meta/notification lines are dropped", () => {
    const items = parse(
      L.user("<command-name>/compact</command-name><command-args>keep the plan</command-args>"),
      L.user("hello<system-reminder>internal</system-reminder>"),
      L.user("<system-reminder>only a reminder</system-reminder>"),
      L.user("caveat", { isMeta: true }),
      L.user("<task-notification><task-id>x</task-id></task-notification>"),
    );
    expect(items).toEqual([
      { k: "command", text: "/compact keep the plan", ts: expect.any(String) },
      { k: "user", text: "hello", ts: expect.any(String) },
    ]);
  });

  test("tool results: array content, images, errors and clipping", () => {
    const big = "y".repeat(5000);
    const items = parse(L.user([
      L.toolResult("a", [{ type: "text", text: "line" }, { type: "image", source: {} }]),
      L.toolResult("b", "boom", true),
      L.toolResult("c", big),
    ])) as any[];
    expect(items[0].text).toBe("line\n[image]");
    expect(items[1].error).toBe(true);
    expect(items[2].text.length).toBeLessThan(1600);
    expect(items[2].text).toContain("more chars");
  });

  test("queued messages: enqueue, removal and delivery", () => {
    const items = parse(
      L.queueOp("enqueue", "also add tests"),
      L.queueOp("enqueue", "<task-notification>internal</task-notification>"),
      L.queueOp("dequeue"),
      L.queuedAttachment("also add tests"),
    );
    expect(items).toEqual([
      { k: "queued", text: "also add tests", ts: expect.any(String) },
      { k: "unqueue", text: undefined, ts: expect.any(String) },
      { k: "user", text: "also add tests", ts: expect.any(String) },
    ]);
  });

  test("subagent (sidechain) lines only parse when asked", () => {
    const l = L.assistant([L.text("from a subagent")], { isSidechain: true });
    expect(parseLines(l).items).toEqual([]);
    expect(parseLines(l, undefined, true).items).toHaveLength(1);
  });

  test("title, bookkeeping lines and broken JSON", () => {
    const r = parseLines([L.aiTitle("Fix login"), L.apiRequest(), '{"parentUuid": broken', L.user("ok")].join("\n"));
    expect(r.title).toBe("Fix login");
    expect(r.items).toHaveLength(1);
  });

  test("byte offsets point at each item's line, including multi-byte text", () => {
    const lines = [L.user("café ☕"), L.user("second")];
    const base = 1000;
    const { items } = parseLines(lines.join("\n") + "\n", base) as any;
    expect(items[0].o).toBe(base);
    expect(items[1].o).toBe(base + Buffer.byteLength(lines[0]) + 1);
  });
});

describe("readTail", () => {
  test("returns the newest items and a start offset that resumes exactly", () => {
    const lines = Array.from({ length: 50 }, (_, i) => L.user(`message ${i}`));
    const file = join(process.env.AWAY_TEST_ROOT!, "tail.jsonl");
    const body = lines.join("\n") + "\n";
    writeFileSync(file, body);
    const r = readTail(file, Buffer.byteLength(body), 10);
    expect(r.items.map((i: any) => i.text)).toEqual(Array.from({ length: 10 }, (_, i) => `message ${40 + i}`));
    // Everything before `start` is exactly the first 40 lines.
    expect(parseLines(body.slice(0, r.start)).items).toHaveLength(40);
  });
});
