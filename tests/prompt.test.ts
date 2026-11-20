import { test, expect, describe } from "bun:test";
import { detectPrompt, KEY_WHITELIST } from "../src/tmux";

const permission = `● I'll run the e2e tests.

╭──────────────────────────────────────────────────────────────╮
│ Bash command                                                 │
│                                                              │
│   npm run test:e2e -- --grep checkout                        │
│   Run the checkout tests                                     │
│                                                              │
│ Do you want to proceed?                                      │
│ ❯ 1. Yes                                                     │
│   2. Yes, and don't ask again for npm run test:e2e commands  │
│   3. No, and tell Claude what to do differently (esc)        │
╰──────────────────────────────────────────────────────────────╯`;

const trust = `────────────────────────────────────────────────────────────────────────────────
 Accessing workspace:
 /home/me/code/new-project
 Quick safety check: Is this a project you created or one you trust? (Like your
 own code, a well-known open source project, or work from your team). If not,
 take a moment to review what's in this folder first.
 Claude Code'll be able to read, edit, and execute files here.
 Security guide
 ❯ No, exit
   Yes, I trust this folder
 Enter to confirm · Esc to cancel`;

describe("detectPrompt", () => {
  test("numbered permission menu", () => {
    const p = detectPrompt(permission)!;
    expect(p.question).toBe("Do you want to proceed?");
    expect(p.options.map((o) => o.n)).toEqual([1, 2, 3]);
    expect(p.options[0].label).toBe("Yes");
    expect(p.options[2].label).toContain("No, and tell Claude");
    expect(p.selected).toBe(1);
    expect(p.context.join("\n")).toContain("npm run test:e2e");
  });

  test("cursor position follows the ❯ marker", () => {
    const moved = permission.replace("❯ 1. Yes", "  1. Yes").replace("  2. Yes, and", "❯ 2. Yes, and");
    expect(detectPrompt(moved)!.selected).toBe(2);
  });

  test("unnumbered menu (folder trust): real question, not the link line", () => {
    const p = detectPrompt(trust)!;
    expect(p.question).toBe("Quick safety check: Is this a project you created or one you trust?");
    expect(p.options.map((o) => o.label)).toEqual(["No, exit", "Yes, I trust this folder"]);
  });

  test("no menu on an ordinary screen", () => {
    expect(detectPrompt("● Done. All 12 tests pass.\n\n> \n  ? for shortcuts")).toBeNull();
    expect(detectPrompt("")).toBeNull();
  });
});

describe("key whitelist", () => {
  test("allows navigation and Send now, nothing arbitrary", () => {
    for (const k of ["Enter", "Escape", "Up", "Down", "C-c", "C-x", "C-s", "1"]) expect(KEY_WHITELIST.has(k)).toBe(true);
    for (const k of ["C-d", "rm -rf /", "Enter; ls", "M-x"]) expect(KEY_WHITELIST.has(k)).toBe(false);
  });
});

import { promptKey } from "../src/tmux";
test("prompt fingerprint: same prompt → same key (cursor ignored); different prompt → different key", () => {
  const a = { question: "Do you want to proceed?", context: ["rm -rf build"], options: [{ n: 1, label: "Yes" }, { n: 2, label: "No" }] };
  expect(promptKey(a)).toBe(promptKey({ ...a, selected: 2 } as any));
  expect(promptKey(a)).not.toBe(promptKey({ ...a, context: ["rm -rf ~"] }));
  expect(promptKey(a)).not.toBe(promptKey({ ...a, question: "Allow edit?" }));
});

import { canBackground } from "../src/tmux";
test("run-in-background hint, in and outside tmux", () => {
  expect(canBackground("  ⎿  $ npm test (5s · 6 lines)\n     (ctrl+b ctrl+b (twice) to run in background)\n✢ Doodling…")).toBe(true);
  expect(canBackground("     (ctrl+b to run in background)")).toBe(true);
  expect(canBackground("● Running 1 shell command…\n esc to interrupt")).toBe(false);
});

import { detectBtw } from "../src/tmux";
test("/btw panel: pending, answered (wrapped lines joined), none", () => {
  const bar = "▔".repeat(60);
  const pending = `● done\n${bar}\n  /btw first question\n  /btw what is up?\n    · Answering…\n  ⇧←/→ to browse · x to clear history · Esc to close`;
  expect(detectBtw(pending, 60)).toEqual({ question: "what is up?", answer: "", pending: true });
  expect(detectBtw(pending.replace("· Answering", "✽ Answering"), 60)?.pending).toBe(true);
  const done = `${bar}\n  /btw rivers?\n    1. Danube: At about 2,850 km, it is the second-longest river in\n       Europe.\n    2. Rhine: short.\n  c to copy · f to fork · Esc to close`;
  expect(detectBtw(done, 72)).toEqual({ question: "rivers?", answer: "1. Danube: At about 2,850 km, it is the second-longest river in Europe.\n2. Rhine: short.", pending: false });
  expect(detectBtw("❯ \n  ⏵⏵ auto mode on", 80)).toBeNull();
});
