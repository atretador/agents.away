// Resized WebP variants of images, generated on demand and cached on disk.
import sharp from "sharp";
import { join, extname } from "node:path";
import { mkdirSync, statSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { DATA_DIR } from "./config";

const CACHE = join(DATA_DIR, "cache");
mkdirSync(CACHE, { recursive: true });
sharp.concurrency(2); // leave the CPU to builds/renders
sharp.cache(false);

/** Allowed widths: thumbnails, chat/notification size, full view. */
export const WIDTHS = [360, 800, 1600] as const;
const QUALITY: Record<number, number> = { 360: 70, 800: 78, 1600: 84 };
const RESIZABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".bmp", ".tif", ".tiff"]);

export function snapWidth(w: string | null): number | null {
  const n = Number(w);
  if (!n) return null;
  return WIDTHS.find((x) => x >= n) ?? WIDTHS[WIDTHS.length - 1];
}

const inflight = new Map<string, Promise<string | null>>();

/** Path to a cached WebP of `src` at width `w` (never upscaled), or null if it can't/shouldn't be resized. */
export async function variant(src: string, w: number): Promise<string | null> {
  if (!RESIZABLE.has(extname(src).toLowerCase())) return null;
  let st;
  try { st = statSync(src); } catch { return null; }
  const key = createHash("sha1").update(`${src}|${st.mtimeMs}|${st.size}|${w}`).digest("hex").slice(0, 24);
  const out = join(CACHE, `${key}.webp`);
  if (existsSync(out)) return out;
  let p = inflight.get(out);
  if (!p) {
    p = sharp(src, { limitInputPixels: 120_000_000 })
      .rotate() // respect EXIF orientation (phone photos)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: QUALITY[w] ?? 80, effort: 3 })
      .toFile(out)
      .then(() => out)
      .catch((e) => { console.error("resize failed", src, e.message); return null; })
      .finally(() => inflight.delete(out));
    inflight.set(out, p);
  }
  return p;
}

/** Warm the cache in the background (e.g. right after a review arrives). */
export function prewarm(paths: string[], widths: number[] = [360, 1600]) {
  (async () => {
    for (const w of widths) for (const p of paths) await variant(p, w);
  })().catch(() => {});
}

/** Serve an image file, optionally as a resized WebP, with ETag/304 support. */
export async function serveImage(req: Request, path: string, type: string, wParam: string | null, immutable = false) {
  const w = snapWidth(wParam);
  let file = path, ctype = type;
  if (w) {
    const v = await variant(path, w);
    if (v) { file = v; ctype = "image/webp"; }
  }
  let st;
  try { st = statSync(file); } catch { return new Response("not found", { status: 404 }); }
  const etag = `"${Math.floor(st.mtimeMs).toString(36)}-${st.size.toString(36)}"`;
  const headers: Record<string, string> = {
    "content-type": ctype,
    etag,
    "cache-control": immutable ? "private, max-age=31536000, immutable" : "private, max-age=3600",
    "content-security-policy": "sandbox",
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(Bun.file(file), { headers });
}

// Drop cached variants nobody asked for in 30 days.
try {
  const cutoff = Date.now() - 30 * 86400_000;
  for (const f of readdirSync(CACHE)) {
    const p = join(CACHE, f);
    try { if (statSync(p).atimeMs < cutoff) unlinkSync(p); } catch {}
  }
} catch {}
