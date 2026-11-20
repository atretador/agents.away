import { test, expect, describe } from "bun:test";
import { describeTool, editDiff, onToolHook, toolForScreen, toolLine } from "../src/approval";

const pre = (sid: string, id: string, tool_name: string, tool_input: any) => onToolHook(sid, { hook_event_name: "PreToolUse", tool_use_id: id, tool_name, tool_input, cwd: "/w/app" });

describe("describeTool", () => {
  test("plan → markdown, command → code, edit → diff with relative path", () => {
    expect(describeTool("ExitPlanMode", { plan: "## Do it\n- a" })).toMatchObject({ title: "Plan", md: "## Do it\n- a" });
    expect(describeTool("Bash", { command: "npm test", description: "Run tests" })).toMatchObject({ code: "npm test", desc: "Run tests" });
    const e = describeTool("Edit", { file_path: "/w/app/src/a.ts", old_string: "a\nb\nc", new_string: "a\nB\nc" }, "/w/app");
    expect(e.path).toBe("src/a.ts");
    expect(e.diff).toEqual([{ t: " ", s: "a" }, { t: "-", s: "b" }, { t: "+", s: "B" }, { t: " ", s: "c" }]);
  });
  test("unknown and MCP tools → labelled fields", () => {
    const v = describeTool("mcp__github__create_issue", { title: "Bug", labels: ["x"] });
    expect(v.title).toBe("create_issue (github)");
    expect(v.fields?.[0]).toEqual(["title", "Bug"]);
  });
  test("huge diffs are clipped", () => {
    const v = describeTool("Write", { file_path: "/x", content: "y".repeat(10_000) });
    expect(v.code!.length).toBeLessThan(4100);
    expect(describeTool("Edit", { file_path: "/x", old_string: "", new_string: Array(500).fill("l").join("\n") }).clipped).toBe(true);
  });
  test("one-line summaries", () => {
    expect(toolLine(describeTool("ExitPlanMode", { plan: "## Cache listings\nstuff" }))).toBe("Plan ready: Cache listings");
    expect(toolLine(describeTool("Bash", { command: "rm -rf build\necho hi" }))).toBe("Run: rm -rf build");
  });
});

describe("matching the prompt on screen", () => {
  test("picks the tool call the screen shows; finished ones drop out", () => {
    pre("m1", "t1", "Bash", { command: "npm run build" });
    pre("m1", "t2", "Edit", { file_path: "/w/app/src/server.ts", old_string: "a", new_string: "b" });
    expect(toolForScreen("m1", "Edit file\n src/server.ts\n Do you want to make this edit to server.ts?")?.name).toBe("Edit");
    expect(toolForScreen("m1", "Bash command\n   npm run   build\n Do you want to proceed?")?.name).toBe("Bash");
    onToolHook("m1", { hook_event_name: "PostToolUse", tool_use_id: "t1" });
    expect(toolForScreen("m1", "Bash command\n npm run build\n Do you want to proceed?")).toBeNull();
  });
  test("no match → null (the card falls back to the screen text)", () => {
    pre("m2", "t1", "Bash", { command: "ls" });
    expect(toolForScreen("m2", "Edit file\n other.ts\n Do you want to make this edit?")).toBeNull();
    onToolHook("m2", { hook_event_name: "Stop" });
    expect(toolForScreen("m2", "ls")).toBeNull();
  });
});

test("editDiff keeps two context lines", () => {
  const d = editDiff("1\n2\n3\n4\nx\n5\n6\n7", "1\n2\n3\n4\ny\n5\n6\n7")!;
  expect(d.map((l) => l.t + l.s)).toEqual([" 3", " 4", "-x", "+y", " 5", " 6"]);
});

import { describeOcTool } from "../src/approval";
test("OpenCode tools map onto the same views", () => {
  expect(describeOcTool("shell", { command: "npm test" })).toMatchObject({ name: "shell", title: "Run a command", code: "npm test" });
  expect(toolLine(describeOcTool("bash", { command: "ls -la" }))).toBe("Run: ls -la");
  const e = describeOcTool("edit", { path: "/w/a.ts", oldString: "x", newString: "y" }, "/w");
  expect(e).toMatchObject({ title: "Edit", path: "a.ts" });
  expect(e.diff).toEqual([{ t: "-", s: "x" }, { t: "+", s: "y" }]);
  expect(describeOcTool("write", { path: "/w/b.md", content: "# hi" }, "/w")).toMatchObject({ title: "Write file", path: "b.md", code: "# hi" });
  expect(describeOcTool("execute", { code: "print(1)" })).toMatchObject({ title: "Run code", code: "print(1)" });
});
