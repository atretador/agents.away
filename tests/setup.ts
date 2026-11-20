// Runs before every test file: isolate all state in a temp dir so tests never touch real config,
// sign-ins, reviews or Claude Code data.
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "agents-away-test-"));
process.env.AWAY_CONFIG_DIR = join(root, "config");
process.env.AWAY_DATA_DIR = join(root, "data");
process.env.HOME = join(root, "home");
mkdirSync(process.env.HOME, { recursive: true });
process.env.AWAY_TEST_ROOT = root;

// Remove the temp folder when the test run ends (a global hook, since this file is preloaded).
import { rmSync } from "node:fs";
import { afterAll } from "bun:test";
afterAll(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });
