import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as webpush from "web-push";

export const HOME = homedir();
export const CFG_DIR = process.env.AWAY_CONFIG_DIR ?? join(HOME, ".config/agents-away");
export const DATA_DIR = process.env.AWAY_DATA_DIR ?? join(HOME, ".local/share/agents-away");
export const CERT_DIR = join(CFG_DIR, "certs");
export const REVIEW_DIR = join(DATA_DIR, "reviews");
export const CLAUDE_DIR = join(HOME, ".claude");
export const TMUX_CONF = join(CFG_DIR, "tmux.conf");
export const TMUX_SOCKET = process.env.AWAY_TMUX_SOCKET || "agents-away"; // override to run a separate (e.g. test) instance

export const PORTS = {
  https: Number(process.env.AWAY_PORT ?? 7443),
  local: Number(process.env.AWAY_LOCAL_PORT ?? 7442),
  onboard: Number(process.env.AWAY_ONBOARD_PORT ?? 7440),
};

for (const d of [CFG_DIR, DATA_DIR, REVIEW_DIR]) mkdirSync(d, { recursive: true, mode: 0o700 });
// The agents-away tmux socket's config: seed it from the repo copy on first run.
if (!existsSync(TMUX_CONF)) writeFileSync(TMUX_CONF, readFileSync(join(import.meta.dir, "..", "tmux.conf")));

export type Settings = {
  quietWhenActive: boolean; // skip push when the PC terminal was typed in recently
  activeWindowSec: number;
  notifyOnStop: boolean;
  notifyOnAttention: boolean;
  signInDays: number; // a phone is signed out after this many days without opening the app
  profileName: string; // this PC's name in the apps ("" = the hostname)
};

type Config = {
  token: string;
  vapid: { publicKey: string; privateKey: string };
  settings: Settings;
};

const CONFIG_FILE = join(CFG_DIR, "config.json");

export function writeJson(path: string, data: unknown) {
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

export function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function load(): Config {
  const defaults: Settings = {
    quietWhenActive: true,
    activeWindowSec: 90,
    notifyOnStop: true,
    notifyOnAttention: true,
    signInDays: 30,
    profileName: "",
  };
  if (existsSync(CONFIG_FILE)) {
    const c = readJson<Config>(CONFIG_FILE, null as any);
    c.settings = { ...defaults, ...(c.settings ?? {}) };
    // Deleting "token" (signs out every phone) or "vapid" regenerates it.
    let changed = false;
    if (!c.token) { c.token = randomBytes(24).toString("base64url"); changed = true; }
    if (!c.vapid?.publicKey) { c.vapid = webpush.generateVAPIDKeys(); changed = true; }
    if (changed) writeJson(CONFIG_FILE, c);
    return c;
  }
  const c: Config = {
    token: randomBytes(24).toString("base64url"),
    vapid: webpush.generateVAPIDKeys(),
    settings: defaults,
  };
  writeJson(CONFIG_FILE, c);
  return c;
}

export const config = load();
export function saveConfig() {
  writeJson(CONFIG_FILE, config);
}
