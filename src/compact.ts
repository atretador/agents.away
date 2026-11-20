// Claude Code's auto-compact point, per model: `modelSettings.<model>.autoCompactWindow` in
// ~/.claude/settings.json (tokens, at least 100k, or "auto"). It's the same setting `/autocompact` saves.
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync, statSync } from "node:fs";
import { CLAUDE_DIR } from "./config";

const FILE = join(CLAUDE_DIR, "settings.json");
export const MIN_WINDOW = 100_000;

/** "claude-opus-5-5[1m]" / "claude-opus-5-5-20261001" → "claude-opus-5-5". */
export function canonicalModel(m: string) {
  return m.replace(/\[.*?\]$/, "").replace(/-\d{8}$/, "");
}

function read(): any {
  if (!existsSync(FILE)) return {};
  return JSON.parse(readFileSync(FILE, "utf8")); // throws on a broken file: never overwrite what we can't parse
}

/** The window Claude Code uses for this model from the user settings file, or "auto". */
export function getCompactWindow(model: string): number | "auto" {
  const s = read(), key = canonicalModel(model);
  return s.modelSettings?.[key]?.autoCompactWindow ?? s.autoCompactWindow ?? "auto";
}

export function setCompactWindow(model: string, window: number | "auto") {
  const key = canonicalModel(model);
  if (!/^claude-[a-z0-9.-]+$/.test(key)) throw new Error("Unknown model");
  if (window !== "auto" && !(Number.isInteger(window) && window >= MIN_WINDOW && window <= 10_000_000)) throw new Error(`Use at least ${MIN_WINDOW / 1000}k tokens`);
  const s = read();
  const ms = (s.modelSettings ??= {});
  const entry = (ms[key] ??= {});
  if (window === "auto") delete entry.autoCompactWindow; else entry.autoCompactWindow = window;
  if (!Object.keys(entry).length) delete ms[key];
  if (!Object.keys(ms).length) delete s.modelSettings;
  if (existsSync(FILE) && !existsSync(FILE + ".agents-away.bak")) copyFileSync(FILE, FILE + ".agents-away.bak");
  const tmp = FILE + ".agents-away.tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: existsSync(FILE) ? statSync(FILE).mode & 0o777 : 0o600 });
  renameSync(tmp, FILE);
  return getCompactWindow(key);
}
