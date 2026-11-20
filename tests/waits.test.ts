import { test, expect } from "bun:test";
import { writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { waitingOn } from "../src/subagents";
import { parseLines } from "../src/claude";
import * as L from "./lines";

const now = new Date().toISOString();
const bashUse = (id: string, command: string, description?: string) => L.assistant([{ type: "tool_use", id, name: "Bash", input: { command, description } }], { timestamp: now });
const result = (id: string, text: string) => L.user([{ type: "tool_result", tool_use_id: id, content: text }], { timestamp: now });
const notify = (taskId: string) => L.user(`<task-notification>\n<task-id>${taskId}</task-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>`, { timestamp: new Date(Date.now() + 1000).toISOString() });

test("background commands are waited on until their notification or TaskStop", () => {
  const f = join(process.env.AWAY_TEST_ROOT!, "waits.jsonl");
  writeFileSync(f, [
    bashUse("t1", "npm run build", "Build the app"),
    result("t1", "Command running in background with ID: bk1aaaa. Output is being written to: /tmp/x"),
    bashUse("t2", "for i in 1 2 3; do sleep 1; done"),
    result("t2", "Command was manually backgrounded by user with ID: bk2bbbb. Output is being written to: /tmp/y"),
    bashUse("t3", "make test"),
    result("t3", "Command did not complete within its 120s timeout and was moved to the background (ID: bk3cccc). Output…"),
    bashUse("t4", "grep -r foo"),
    result("t4", "logs mention: Command running in background with ID: bfake99 (quoted, not a real one)"),
  ].join("\n") + "\n");
  expect(waitingOn(f, true).map((w) => [w.id, w.label])).toEqual([["bk1aaaa", "Build the app"], ["bk2bbbb", "for i in 1 2 3; do sleep 1; done"], ["bk3cccc", "make test"]]);
  appendFileSync(f, notify("bk1aaaa") + "\n" + result("t9", '{"message":"Successfully stopped task: bk3cccc"}') + "\n");
  expect(waitingOn(f, true).map((w) => w.id)).toEqual(["bk2bbbb"]);
  expect(waitingOn(f, false)).toEqual([]);
});

test("timed waits get an end time; Yield gets a summary", () => {
  const t0 = "2026-11-20T10:00:00.000Z";
  const { items } = parseLines([
    L.assistant([{ type: "tool_use", id: "w1", name: "ScheduleWakeup", input: { delaySeconds: 270, reason: "watching CI" } }], { timestamp: t0 }),
    L.assistant([{ type: "tool_use", id: "w2", name: "Bash", input: { command: "sleep 2m" } }], { timestamp: t0 }),
    L.assistant([{ type: "tool_use", id: "w3", name: "Yield", input: {} }], { timestamp: t0 }),
  ].join("\n") + "\n") as any;
  const tools = items.filter((i: any) => i.k === "tool");
  expect(tools[0]).toMatchObject({ summary: "watching CI", until: Date.parse(t0) + 270_000 });
  expect(tools[1].until).toBe(Date.parse(t0) + 120_000);
  expect(tools[2]).toMatchObject({ summary: "Waiting for background work" });
  expect(tools[2].until).toBeUndefined();
});
