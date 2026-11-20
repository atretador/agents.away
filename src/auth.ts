// Phone sign-in: one-time pairing links → per-device sessions that expire after a period of not using the app.
//
// - The master token (config.token) is only for the local API (hooks, CLI). It's never given to a phone.
// - `agents-away pair` asks the server for a pairing code: single use, valid 10 minutes.
// - Opening /pair?t=<code> creates a device session; the phone keeps only its own random session id.
// - A device session expires `settings.signInDays` after it was last used (sliding), and can be signed out
//   from the app at any time. Only a hash of the session id is stored on disk.
import { join } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { CFG_DIR, config, readJson, writeJson } from "./config";

const DEVICES_FILE = join(CFG_DIR, "devices.json");
const PAIR_TTL_MS = 10 * 60_000;
const DAY = 86400_000;

export type Device = { id: string; created: number; lastSeen: number; ua: string; addr?: string };
type Stored = Record<string, Device>; // key: sha256(session id)

const devices: Stored = readJson<Stored>(DEVICES_FILE, {});
const pairCodes = new Map<string, number>(); // sha256(code) → expiry

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const lifetimeMs = () => Math.max(1, config.settings.signInDays) * DAY;

let saveTimer: Timer | null = null;
function save(now = false) {
  if (now) { if (saveTimer) clearTimeout(saveTimer); saveTimer = null; writeJson(DEVICES_FILE, devices); return; }
  saveTimer ??= setTimeout(() => { saveTimer = null; writeJson(DEVICES_FILE, devices); }, 30_000);
}

function prune() {
  const cutoff = Date.now() - lifetimeMs();
  let changed = false;
  for (const [k, d] of Object.entries(devices)) if (d.lastSeen < cutoff) { delete devices[k]; changed = true; }
  for (const [k, exp] of pairCodes) if (exp < Date.now()) pairCodes.delete(k);
  if (changed) save(true);
}
setInterval(prune, 3600_000).unref?.();
prune();

/** New single-use pairing code (for `agents-away pair`). */
export function newPairCode() {
  prune();
  const code = randomBytes(18).toString("base64url");
  pairCodes.set(hash(code), Date.now() + PAIR_TTL_MS);
  return { code, expiresInSec: PAIR_TTL_MS / 1000 };
}

/** Redeem a pairing code: returns a new device session id, or null if the code is unknown/expired/used. */
export function redeemPairCode(code: string, ua: string, addr?: string): string | null {
  const k = hash(code);
  const exp = pairCodes.get(k);
  if (!exp) return null;
  pairCodes.delete(k); // single use, even if expired
  if (exp < Date.now()) return null;
  return createDevice(ua, addr);
}

function createDevice(ua: string, addr?: string) {
  const sid = randomBytes(32).toString("base64url");
  const now = Date.now();
  const k = hash(sid);
  devices[k] = { id: k.slice(0, 12), created: now, lastSeen: now, ua: ua.slice(0, 300), addr };
  save(true);
  return sid;
}

const cookieRe = (name: string) => new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
function readCookie(req: Request, name: string) {
  const m = (req.headers.get("cookie") ?? "").match(cookieRe(name));
  return m ? decodeURIComponent(m[1]) : null;
}

export type AuthResult =
  | { ok: true; device: Device; key: string }
  | { ok: false };

/** Check a request's device cookie. */
export function check(req: Request, addr?: string): AuthResult {
  const sid = readCookie(req, "away_dev");
  if (sid) {
    const k = hash(sid);
    const d = devices[k];
    if (d && Date.now() - d.lastSeen < lifetimeMs()) {
      if (Date.now() - d.lastSeen > 60_000) { d.lastSeen = Date.now(); if (addr) d.addr = addr; save(); }
      return { ok: true, device: d, key: k };
    }
    if (d) { delete devices[k]; save(true); }
  }
  return { ok: false };
}

/** Cookie for a device session; its lifetime follows the sign-in setting and is renewed on use. */
export function deviceCookie(sid: string) {
  return `away_dev=${encodeURIComponent(sid)}; Path=/; Max-Age=${Math.round(lifetimeMs() / 1000)}; HttpOnly; Secure; SameSite=Lax`;
}

/** Renewal cookie for an already signed-in request (sent when the app connects). */
export function renewCookie(req: Request) {
  const sid = readCookie(req, "away_dev");
  return sid ? deviceCookie(sid) : null;
}

export function listDevices(currentKey?: string) {
  const exp = lifetimeMs();
  return Object.entries(devices)
    .map(([k, d]) => ({ id: d.id, created: d.created, lastSeen: d.lastSeen, expires: d.lastSeen + exp, ua: d.ua, addr: d.addr, current: k === currentKey }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Sign out a device by its public id; returns the storage key that was removed (or null). */
export function signOut(id: string): string | null {
  for (const [k, d] of Object.entries(devices)) if (d.id === id) { delete devices[k]; save(true); return k; }
  return null;
}

/** Sign out every device except `keepKey`; returns removed keys. */
export function signOutOthers(keepKey: string) {
  const removed: string[] = [];
  for (const k of Object.keys(devices)) if (k !== keepKey) { delete devices[k]; removed.push(k); }
  save(true);
  return removed;
}
