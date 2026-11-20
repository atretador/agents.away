import { join, extname } from "node:path";
import { mkdirSync, readdirSync, existsSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { REVIEW_DIR, readJson, writeJson } from "./config";

export type Decision = "approved" | "changes" | "rejected";

export type Review = {
  id: string;
  key: string; // capability key for image URLs (notification images can't send cookies)
  title: string;
  message: string;
  files: { name: string; type: string }[];
  createdAt: number;
  session: { id?: string; name?: string; cwd?: string; socket?: string; pane?: string } | null;
  status: "pending" | "answered" | "withdrawn" | "dismissed";
  closedReason?: string;
  decision?: Decision;
  comment?: string;
  respondedAt?: number;
  /** true once the CLI stopped waiting: the answer gets typed into the session instead */
  deliverToSession: boolean;
  delivered?: boolean;
};

const reviews = new Map<string, Review>();

for (const id of existsSync(REVIEW_DIR) ? readdirSync(REVIEW_DIR) : []) {
  const r = readJson<Review | null>(join(REVIEW_DIR, id, "meta.json"), null);
  if (r) reviews.set(r.id, r);
}

export const MEDIA_TYPES: Record<string, string> = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".avif": "image/avif", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".webm": "video/webm",
};

export function save(r: Review) {
  reviews.set(r.id, r);
  writeJson(join(REVIEW_DIR, r.id, "meta.json"), r);
}

export async function createReview(input: { title: string; message: string; files: File[]; session: Review["session"] }) {
  const id = Date.now().toString(36) + randomBytes(3).toString("hex");
  const dir = join(REVIEW_DIR, id);
  mkdirSync(dir, { recursive: true });
  const files: Review["files"] = [];
  let i = 0;
  for (const f of input.files) {
    const ext = extname(f.name).toLowerCase();
    const type = MEDIA_TYPES[ext];
    if (!type) throw new Error(`unsupported file type: ${f.name}`);
    const name = `${i++}${ext}`;
    await Bun.write(join(dir, name), f);
    files.push({ name, type });
  }
  const r: Review = {
    id, key: randomBytes(12).toString("base64url"), title: input.title, message: input.message, files,
    createdAt: Date.now(), session: input.session, status: "pending", deliverToSession: false,
  };
  save(r);
  return r;
}

export function getReview(id: string) {
  return reviews.get(id) ?? null;
}

export function listReviews() {
  return [...reviews.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function filePath(r: Review, name: string) {
  if (!r.files.some((f) => f.name === name)) return null;
  return join(REVIEW_DIR, r.id, name);
}

export function deleteReview(id: string) {
  reviews.delete(id);
  rmSync(join(REVIEW_DIR, id), { recursive: true, force: true });
}

// ---- waiters (CLI long-poll) ----
const waiters = new Map<string, Set<(r: Review) => void>>();

export function waitFor(id: string, ms: number): Promise<Review | null> {
  return new Promise((resolve) => {
    const set = waiters.get(id) ?? new Set();
    waiters.set(id, set);
    const fn = (r: Review) => { clearTimeout(t); resolve(r); };
    const t = setTimeout(() => { set.delete(fn); resolve(null); }, ms);
    set.add(fn);
  });
}

export function hasWaiters(id: string) {
  return (waiters.get(id)?.size ?? 0) > 0;
}

export function resolveWaiters(r: Review & { chatMessage?: string }) {
  const set = waiters.get(r.id);
  if (!set) return 0;
  const n = set.size;
  for (const fn of set) fn(r);
  waiters.delete(r.id);
  return n;
}

export function decisionText(r: Review) {
  const d = r.decision === "approved" ? "APPROVED" : r.decision === "rejected" ? "REJECTED" : "CHANGES REQUESTED";
  return d + (r.comment ? `\nComment: ${r.comment}` : "");
}
