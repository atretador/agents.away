import { test, expect } from "bun:test";
import { toItems } from "../src/opencode";

const asst = (content: any[], completed = true) => ({ type: "assistant", time: { created: 1, completed: completed ? 2 : undefined }, content });

test("reasoning parts become collapsed thinking items once finished", () => {
  const items = toItems([asst([{ type: "reasoning", text: "  Let me check the tests.  ", time: { created: 1, completed: 2 } }, { type: "text", text: "Done." }])]);
  expect(items.map((i: any) => [i.k, i.text])).toEqual([["thinking", "Let me check the tests."], ["text", "Done."]]);
});

test("streaming or empty (encrypted) reasoning is skipped", () => {
  expect(toItems([asst([{ type: "reasoning", text: "half a thou", time: { created: 1 } }], false)])).toEqual([]);
  expect(toItems([asst([{ type: "reasoning", text: "", time: { created: 1, completed: 2 } }])])).toEqual([]);
});

test("long reasoning is clipped", () => {
  const [it] = toItems([asst([{ type: "reasoning", text: "x".repeat(9000), time: { created: 1, completed: 2 } }])]) as any[];
  expect(it.text.length).toBeLessThan(4100);
  expect(it.text).toContain("more chars");
});
