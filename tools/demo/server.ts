// Demo server: serves the real app (public/) with made-up sessions, chats and reviews, so the UI can be
// shown and screenshotted without touching anyone's real Claude Code / OpenCode data.
//
//   bun tools/demo/server.ts            → http://localhost:7450  (localhost counts as a secure context)
//
// Read-only: actions (sending, approving, …) just answer { ok: true }.
import { join } from "node:path";
import sharp from "sharp";

const ROOT = join(import.meta.dir, "../..");
const PUBLIC = join(ROOT, "public");
const PORT = Number(process.env.DEMO_PORT ?? 7450);
const VENDOR: Record<string, string> = {
  "ansi_up.js": join(ROOT, "node_modules/ansi_up/ansi_up.js"),
  "marked.js": join(ROOT, "node_modules/marked/lib/marked.esm.js"),
  "purify.js": join(ROOT, "node_modules/dompurify/dist/purify.es.mjs"),
};

const now = Date.now();
const min = 60_000;
const iso = (agoMin: number) => new Date(now - agoMin * min).toISOString();

// ───────── sessions ─────────
const base = { pid: 0, tmux: { socket: "agents-away", pane: "%1", session: "cc", attached: false, cols: 80 }, attention: null, prompt: null, doneAt: 0, kind: "claude", canReply: true, customName: null, pinned: false, muted: false };
const sessions = [
  {
    ...base, id: "s-tests", name: "cc-shop", title: "Fix flaky checkout tests", cwd: "/home/demo/code/shop", home: "~/code/shop",
    status: "waiting", activityAt: now - 1 * min, startedAt: now - 50 * min,
    attention: { message: "Claude needs your permission to use Bash", at: now - 1 * min },
    prompt: {
      question: "Do you want to proceed?",
      context: ["Bash command", "", "  npm run test:e2e -- --grep checkout --repeat-each 5", "  Run the checkout tests 5 times to confirm the flake is gone"],
      options: [{ n: 1, label: "Yes" }, { n: 2, label: "Yes, and don't ask again for npm run test:e2e commands in ~/code/shop" }, { n: 3, label: "No, and tell Claude what to do differently (esc)" }],
      selected: 1,
    },
  },
  { ...base, id: "s-landing", name: "cc-site", title: "Landing page redesign", cwd: "/home/demo/code/site", home: "~/code/site", status: "idle", activityAt: now - 4 * min, startedAt: now - 120 * min, pinned: true },
  { ...base, id: "s-api", name: "cc-api", title: "Add rate limiting to the public API", cwd: "/home/demo/code/api", home: "~/code/api", status: "working", activityAt: now, startedAt: now - 20 * min },
  { ...base, id: "ses_demo1", name: "opencode", title: "Migrate billing to the new invoices table", cwd: "/home/demo/code/billing", home: "~/code/billing", status: "idle", activityAt: now - 26 * min, startedAt: now - 90 * min, kind: "opencode", agentName: "build", tmux: null },
  { ...base, id: "s-docs", name: "cc-docs", title: "Write the v2 migration guide", cwd: "/home/demo/code/docs", home: "~/code/docs", status: "working", activityAt: now, startedAt: now - 8 * min, muted: true },
];

// ───────── chats ─────────
const chats: Record<string, any[]> = {
  "s-landing": [
    { k: "user", text: "The hero feels cramped on phones. Can you rework the spacing and make the CTA stand out more?", ts: iso(18) },
    { k: "text", text: "Let me look at the current hero styles first.", ts: iso(17) },
    { k: "tool", id: "t1", name: "Read", summary: "src/components/Hero.tsx", detail: "{\n  \"file_path\": \"src/components/Hero.tsx\"\n}", ts: iso(17) },
    { k: "result", id: "t1", text: "export function Hero() {\n  return (\n    <section className=\"hero\">…", error: false },
    { k: "tool", id: "t2", name: "Edit", summary: "src/styles/hero.css", detail: "{\n  \"file_path\": \"src/styles/hero.css\"\n}", ts: iso(15) },
    { k: "result", id: "t2", text: "The file src/styles/hero.css has been updated.", error: false },
    { k: "tool", id: "t3", name: "Bash", summary: "npm run build", detail: "{\n  \"command\": \"npm run build\"\n}", ts: iso(14) },
    { k: "result", id: "t3", text: "✓ built in 2.41s", error: false },
    { k: "text", text: "Done. Here's what changed in the hero:\n\n- **Spacing:** vertical padding now scales with the viewport (`clamp(48px, 9vw, 120px)`), so phones get breathing room without a giant gap on desktop.\n- **Headline:** max width of 14ch, so it wraps into two balanced lines.\n- **CTA:** solid accent button, 48px tall, with the secondary link moved below it.\n\nI sent a screenshot to your phone for review.", ts: iso(5) },
    { k: "user", text: "Looks great, ship it 🚀", ts: iso(4) },
    { k: "text", text: "Committed as `feat(hero): roomier mobile layout and stronger CTA` and pushed to `main`.", ts: iso(4) },
  ],
  "s-tests": [
    { k: "user", text: "The checkout e2e test fails about 1 in 10 runs on CI. Find out why and fix it.", ts: iso(40) },
    { k: "tool", id: "a1", name: "Grep", summary: "\"checkout\" in tests/e2e", detail: "{}", ts: iso(39) },
    { k: "result", id: "a1", text: "tests/e2e/checkout.spec.ts\ntests/e2e/helpers/cart.ts", error: false },
    { k: "tool", id: "a2", name: "Read", summary: "tests/e2e/checkout.spec.ts", detail: "{}", ts: iso(38) },
    { k: "result", id: "a2", text: "test('pays with saved card', async ({ page }) => {…", error: false },
    { k: "text", text: "Found it: the test clicks **Pay** before the payment form finishes loading. On a slow CI runner the click lands on a disabled button, so the order never submits.\n\nI replaced the fixed `waitForTimeout(500)` with a wait for the button to become enabled.", ts: iso(6) },
    { k: "tool", id: "a3", name: "Edit", summary: "tests/e2e/checkout.spec.ts", detail: "{}", ts: iso(5) },
    { k: "result", id: "a3", text: "The file tests/e2e/checkout.spec.ts has been updated.", error: false },
    { k: "text", text: "Now I'll run the checkout tests five times in a row to make sure the flake is gone.", ts: iso(1) },
  ],
  "ses_demo1": [
    { k: "user", text: "Move invoice reads to the new invoices table and keep the old one as a fallback for a week.", ts: iso(60) },
    { k: "text", text: "Plan:\n1. Add a repository that reads from `invoices_v2` first.\n2. Fall back to `invoices` when a row is missing, and log it.\n3. Feature flag `billing.v2_reads`, on by default.", ts: iso(58) },
    { k: "tool", id: "o1", name: "edit", summary: "src/billing/repository.ts", detail: "{}", ts: iso(40) },
    { k: "result", id: "o1", text: "Edit applied successfully.", error: false },
    { k: "note", text: "↳ @test-runner: run billing suite (done)", ts: iso(30) },
    { k: "text", text: "All 214 billing tests pass. The fallback logged 0 misses against the staging snapshot.", ts: iso(26) },
  ],
};
chats["s-api"] = [
  { k: "user", text: "Add per-key rate limiting to the public API: 100 requests a minute, with a Retry-After header.", ts: iso(12) },
  { k: "text", text: "I'll add a token-bucket limiter keyed by API key, backed by Redis so it works across instances.", ts: iso(11) },
  { k: "tool", id: "p1", name: "Read", summary: "src/middleware/index.ts", detail: "{}", ts: iso(11) },
  { k: "result", id: "p1", text: "export const middleware = [cors(), auth(), …]", error: false },
  { k: "tool", id: "p2", name: "Write", summary: "src/middleware/rateLimit.ts", detail: "{}", ts: iso(8) },
  { k: "result", id: "p2", text: "File created successfully at: src/middleware/rateLimit.ts", error: false },
  { k: "tool", id: "p3", name: "Bash", summary: "npm test -- rateLimit", detail: "{}", ts: iso(1) },
  { k: "queued", text: "Also add a test for the 429 response body", ts: iso(0.3) },
];
for (const id of ["s-docs"]) chats[id] = [
  { k: "user", text: id === "s-api" ? "Add per-key rate limiting to the public API: 100 requests a minute, with a Retry-After header." : "Draft the v2 migration guide from the changelog.", ts: iso(10) },
  { k: "tool", id: "x1", name: "Read", summary: id === "s-api" ? "src/middleware/index.ts" : "CHANGELOG.md", detail: "{}", ts: iso(9) },
  { k: "result", id: "x1", text: "…", error: false },
];

// ───────── git changes ─────────
const changes = {
  repo: true, root: "~/code/site", branch: "main", untracked: 0, truncated: false,
  files: [{ path: "src/styles/hero.css", added: 18, removed: 9 }, { path: "src/components/Hero.tsx", added: 6, removed: 4 }],
  log: ["a41c9e2 feat(hero): roomier mobile layout and stronger CTA", "9be03f1 chore: bump dependencies", "71d2c8a fix(nav): close menu on route change"],
  diff: `diff --git a/src/styles/hero.css b/src/styles/hero.css
--- a/src/styles/hero.css
+++ b/src/styles/hero.css
@@ -1,14 +1,23 @@
 .hero {
-  padding: 32px 16px;
+  padding: clamp(48px, 9vw, 120px) 20px;
   display: grid;
-  gap: 12px;
+  gap: 20px;
+  justify-items: center;
+  text-align: center;
 }
 .hero h1 {
-  font-size: 34px;
+  font-size: clamp(34px, 6vw, 64px);
+  max-width: 14ch;
+  text-wrap: balance;
 }
-.hero .cta {
-  color: var(--accent);
+.hero .cta {
+  background: var(--accent);
+  color: white;
+  min-height: 48px;
+  padding: 0 28px;
+  border-radius: 999px;
 }
diff --git a/src/components/Hero.tsx b/src/components/Hero.tsx
--- a/src/components/Hero.tsx
+++ b/src/components/Hero.tsx
@@ -8,8 +8,10 @@ export function Hero() {
       <h1>Ship calmer releases</h1>
-      <p>Deploy previews, checks and rollbacks in one place.</p>
-      <a className="cta" href="/signup">Get started →</a>
+      <p className="lead">Deploy previews, checks and rollbacks in one place.</p>
+      <a className="cta" href="/signup">Start free</a>
+      <a className="secondary" href="/demo">Watch a 2-minute demo</a>
     </section>
`,
};

// ───────── review images (generated) ─────────
const heroMock = (dark: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <rect width="1200" height="900" fill="${dark ? "#14161c" : "#f7f5f0"}"/>
  <rect x="0" y="0" width="1200" height="84" fill="${dark ? "#1b1e26" : "#ffffff"}"/>
  <circle cx="70" cy="42" r="16" fill="#6c5ce7"/><rect x="100" y="32" width="120" height="20" rx="10" fill="${dark ? "#3a3f4d" : "#d9d4ca"}"/>
  ${[0, 1, 2].map((i) => `<rect x="${760 + i * 120}" y="34" width="90" height="16" rx="8" fill="${dark ? "#3a3f4d" : "#d9d4ca"}"/>`).join("")}
  <rect x="300" y="250" width="600" height="58" rx="12" fill="${dark ? "#eef0f6" : "#1d1b18"}"/>
  <rect x="380" y="326" width="440" height="58" rx="12" fill="${dark ? "#eef0f6" : "#1d1b18"}"/>
  <rect x="330" y="420" width="540" height="18" rx="9" fill="${dark ? "#5b6172" : "#a8a196"}"/>
  <rect x="400" y="452" width="400" height="18" rx="9" fill="${dark ? "#5b6172" : "#a8a196"}"/>
  <rect x="470" y="520" width="260" height="64" rx="32" fill="#6c5ce7"/>
  <rect x="530" y="546" width="140" height="14" rx="7" fill="#fff"/>
  <rect x="505" y="612" width="190" height="14" rx="7" fill="${dark ? "#8a90a2" : "#8a8378"}"/>
  ${[0, 1, 2].map((i) => `<rect x="${150 + i * 320}" y="690" width="260" height="150" rx="18" fill="${dark ? "#1b1e26" : "#ffffff"}" stroke="${dark ? "#2a2e39" : "#e6e1d7"}"/>`).join("")}
</svg>`;
const images: Record<string, Buffer> = {
  "hero-light.png": await sharp(Buffer.from(heroMock(false))).png().toBuffer(),
  "hero-dark.png": await sharp(Buffer.from(heroMock(true))).png().toBuffer(),
  "palette.png": await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#101218"/>${["#6c5ce7", "#00b894", "#fdcb6e", "#e17055", "#74b9ff"].map((c, i) => `<rect x="${60 + i * 222}" y="120" width="190" height="360" rx="24" fill="${c}"/>`).join("")}</svg>`)).png().toBuffer(),
};
const media = (id: string, names: string[]) => names.map((n) => ({ name: n, type: "image/png", url: `/media/${id}/${n}` }));
const reviews = [
  { id: "r-hero", title: "Landing page hero — mobile spacing v3", message: "Light and dark versions. Is the CTA strong enough now, and does the headline wrap nicely?", files: [], media: media("r-hero", ["hero-light.png", "hero-dark.png"]), createdAt: now - 3 * min, session: { id: "s-landing", name: "Landing page redesign", cwd: "/home/demo/code/site" }, status: "pending", deliverToSession: false },
  { id: "r-palette", title: "Dark mode palette", message: "Five accent candidates for the dashboard charts.", files: [], media: media("r-palette", ["palette.png"]), createdAt: now - 140 * min, session: { id: "s-landing", name: "Landing page redesign" }, status: "answered", decision: "approved", comment: "Go with the purple one", respondedAt: now - 130 * min, deliverToSession: false },
];

// ───────── server ─────────
const json = (d: unknown) => Response.json(d, { headers: { "cache-control": "no-store" } });
const state = () => ({
  sessions, reviews,
  settings: { quietWhenActive: true, activeWindowSec: 90, notifyOnStop: true, notifyOnAttention: true, signInDays: 30 },
  push: { publicKey: "demo", subscribers: 1 }, host: "workstation",
});

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req, server) {
    const p = new URL(req.url).pathname;
    if (p === "/ws") return server.upgrade(req) ? undefined : new Response("upgrade failed", { status: 400 });
    if (p === "/api/state") return json(state());
    if (p === "/api/recent") return json({
      recent: [{ sessionId: "old1", title: "Upgrade to React 20", cwd: "/home/demo/code/site", home: "~/code/site", mtime: now - 86400_000 }],
      dirs: ["~/code/site", "~/code/shop", "~/code/api", "~/code/billing", "~/code/docs"].map((h) => ({ path: h, home: h })),
    });
    if (/^\/api\/session\/[\w-]+\/changes$/.test(p)) return json(changes);
    if (/^\/api\/session\/[\w-]+\/info$/.test(p)) return json({ cwd: "/home/demo/code/site", title: "Demo" });
    if (p === "/api/devices") return json({ signInDays: 30, devices: [{ id: "d1", created: now - 9 * 86400_000, lastSeen: now, expires: now + 30 * 86400_000, ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140", addr: "10.0.0.4", current: true }] });
    let m;
    if ((m = p.match(/^\/api\/review\/([\w-]+)$/))) return json(reviews.find((r) => r.id === m![1]) ?? {});
    if ((m = p.match(/^\/media\/[\w-]+\/([\w.-]+)$/)) && images[m[1]]) return new Response(images[m[1]], { headers: { "content-type": "image/png", "cache-control": "max-age=3600" } });
    if (p.startsWith("/api/")) return json({ ok: true });
    if (p.startsWith("/vendor/") && VENDOR[p.slice(8)]) return new Response(Bun.file(VENDOR[p.slice(8)]), { headers: { "content-type": "text/javascript" } });
    const file = Bun.file(join(PUBLIC, p === "/" ? "/index.html" : p));
    if (!p.includes("..") && (await file.exists())) return new Response(file, { headers: p.endsWith(".webmanifest") ? { "content-type": "application/manifest+json" } : {} });
    return new Response(Bun.file(join(PUBLIC, "index.html")));
  },
  websocket: {
    open(ws) {
      ws.send(JSON.stringify({ type: "build", build: "demo" }));
      ws.send(JSON.stringify({ type: "sessions", sessions }));
    },
    message(ws, raw) {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if ((msg.type === "watch" || msg.type === "peek") && msg.id && msg.chat !== false) {
        const items = chats[msg.id] ?? [];
        ws.send(JSON.stringify({ type: "chat", id: msg.id, reset: true, peek: msg.type === "peek", items, start: 0, end: items.length + 1 }));
      }
    },
  },
});
console.log(`Agents Away demo: http://localhost:${PORT}`);
