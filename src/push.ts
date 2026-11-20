import * as webpush from "web-push";
import { join } from "node:path";
import { CFG_DIR, config, readJson, writeJson } from "./config";

const SUBS_FILE = join(CFG_DIR, "subscriptions.json");
type Sub = webpush.PushSubscription & { addedAt: number; ua?: string };
let subs: Sub[] = readJson<Sub[]>(SUBS_FILE, []);

webpush.setVapidDetails("mailto:agents-away@example.com", config.vapid.publicKey, config.vapid.privateKey);

export function addSubscription(s: webpush.PushSubscription, ua?: string) {
  subs = subs.filter((x) => x.endpoint !== s.endpoint);
  subs.push({ ...s, addedAt: Date.now(), ua });
  writeJson(SUBS_FILE, subs);
}

export function removeSubscription(endpoint: string) {
  subs = subs.filter((x) => x.endpoint !== endpoint);
  writeJson(SUBS_FILE, subs);
}

export function subscriptionCount() {
  return subs.length;
}

export type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  image?: string;
  kind?: "attention" | "done" | "review" | "info";
  sessionId?: string;
  reviewId?: string;
  actions?: { action: string; title: string }[];
};

export async function pushAll(p: PushPayload) {
  if (!subs.length) return { sent: 0 };
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify(p), { TTL: 6 * 3600, urgency: "high", topic: p.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) });
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.endpoint);
        else console.error("push failed", e?.statusCode, e?.body ?? e?.message);
      }
    }),
  );
  if (dead.length) {
    subs = subs.filter((s) => !dead.includes(s.endpoint));
    writeJson(SUBS_FILE, subs);
  }
  return { sent };
}
