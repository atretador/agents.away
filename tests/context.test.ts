import { test, expect, describe } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { windowSize, contextUsage } from "../src/subagents";
import * as L from "./lines";

describe("windowSize", () => {
  test("by model", () => {
    expect(windowSize("claude-opus-5-5", 1000)).toBe(1_000_000);
    expect(windowSize("claude-sonnet-5-5", 1000)).toBe(1_000_000);
    expect(windowSize("claude-haiku-5-5", 1000)).toBe(200_000);
    expect(windowSize("claude-sonnet-4-5", 1000)).toBe(200_000);
    expect(windowSize("claude-sonnet-4-5[1m]", 1000)).toBe(1_000_000);
    expect(windowSize(null, 1000)).toBe(200_000);
  });
  test("usage beyond 200k means a 1M window", () => {
    expect(windowSize("claude-haiku-5-5", 250_000)).toBe(1_000_000);
  });
});

let n = 0;
const transcript = (...lines: string[]) => {
  const f = join(process.env.AWAY_TEST_ROOT!, `ctx-${++n}.jsonl`);
  writeFileSync(f, lines.join("\n") + "\n");
  return f;
};
const usage = (input: number, cacheRead = 0, cacheCreate = 0, output = 500) =>
  ({ input_tokens: input, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheCreate, output_tokens: output });

describe("contextUsage", () => {
  test("uses the newest main-chain assistant usage (input + cache, not output)", () => {
    const f = transcript(
      L.assistant([L.text("old")], {}, usage(1000, 9000)),
      L.assistant([L.text("new")], {}, usage(2000, 140_000, 8000, 99_999)),
    );
    expect(contextUsage(f)).toEqual({ tokens: 150_000, size: 1_000_000, pct: 15, model: "claude-opus-5-5" });
  });

  test("ignores subagent and synthetic messages", () => {
    const f = transcript(
      L.assistant([L.text("main")], {}, usage(50_000)),
      L.assistant([L.text("sub")], { isSidechain: true }, usage(900_000)),
      L.assistant([L.text("x")], {}, usage(1), "<synthetic>"),
    );
    expect(contextUsage(f)!.tokens).toBe(50_000);
  });

  test("a compaction resets it", () => {
    const f = transcript(L.assistant([L.text("before")], {}, usage(180_000), "claude-haiku-5-5"), L.compactBoundary(12_000));
    expect(contextUsage(f)!.tokens).toBe(12_000);
  });

  test("no usage yet → null", () => {
    expect(contextUsage(transcript(L.user("hi")))).toBeNull();
    expect(contextUsage(null)).toBeNull();
  });
});
