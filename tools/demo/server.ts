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
let demoCompact: number | "auto" = 500_000;
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
      question: "Do you want to make this edit to checkout.spec.ts?",
      context: ["Edit file", "tests/e2e/checkout.spec.ts"],
      options: [{ n: 1, label: "Yes" }, { n: 2, label: "Yes, allow all edits during this session (shift+tab)" }, { n: 3, label: "No, and tell Claude what to do differently (esc)" }],
      selected: 1,
      tool: {
        name: "Edit", title: "Edit", path: "tests/e2e/checkout.spec.ts",
        diff: [
          { t: " ", s: "  await page.getByRole('button', { name: 'Pay now' }).click();" },
          { t: "-", s: "  await page.waitForTimeout(2000);" },
          { t: "-", s: "  expect(await page.locator('.order-id').textContent()).toBeTruthy();" },
          { t: "+", s: "  // Wait for the order, not a fixed time: the payment mock sometimes takes 3 s." },
          { t: "+", s: "  await expect(page.locator('.order-id')).toBeVisible({ timeout: 10_000 });" },
          { t: " ", s: "});" },
        ],
      },
    },
  },
  {
    ...base, id: "s-cache", name: "cc-api-2", title: "Cache product listings", cwd: "/home/demo/code/api", home: "~/code/api",
    status: "waiting", activityAt: now - 3 * min, startedAt: now - 25 * min,
    context: { pct: 22, tokens: 220_000, size: 1_000_000, model: "claude-fable-5-2" },
    prompt: {
      question: "Would you like to proceed?",
      context: ["Ready to code?", "Here is Claude's plan:"],
      options: [{ n: 1, label: "Yes, and auto-accept edits" }, { n: 2, label: "Yes, and manually approve edits" }, { n: 3, label: "No, keep planning" }],
      selected: 1,
      tool: {
        name: "ExitPlanMode", title: "Plan",
        md: "## Cache product listings in Redis\n\n**Summary:** listing pages hit Postgres on every request (p95 420 ms). Cache the listing query per category for 60 s and invalidate on product writes.\n\n### Steps\n1. Add `ListingCache` in `src/cache/listings.ts` (Redis `GET`/`SETEX`, key `listings:<category>:<page>`).\n2. Use it in `GET /products` before the database query.\n3. Invalidate the category's keys in `ProductService.save()` and `delete()`.\n4. Tests: cache hit, miss, invalidation; a load test before/after.\n\n### Questions\n- Is **60 s** staleness acceptable for prices, or should price changes bypass the cache?\n- Keep caching when Redis is down (fall back to the database), or fail loudly?",
      },
    },
  },
  {
    ...base, id: "s-plan", name: "cc-app", title: "Plan the offline mode", cwd: "/home/demo/code/app", home: "~/code/app",
    status: "waiting", activityAt: now - 2 * min, startedAt: now - 15 * min,
    ask: {
      id: "toolu_demo", current: 0, partial: false,
      tabs: [{ header: "Storage", done: false }, { header: "Sync", done: false }],
      questions: [
        { question: "Where should offline data live on the device?", header: "Storage", multiSelect: false, options: [
          { label: "IndexedDB", description: "Structured, large quota, works in every modern browser" },
          { label: "SQLite (WASM + OPFS)", description: "Real SQL queries; bigger download, newer browsers only" },
          { label: "localStorage", description: "Simplest, but only ~5 MB and strings only" },
        ] },
        { question: "How should edits made offline sync back?", header: "Sync", multiSelect: false, options: [
          { label: "Last write wins", description: "Simple; can drop a concurrent edit" },
          { label: "Per-field merge", description: "Keeps both sides' changes when they touch different fields" },
        ] },
      ],
    },
  },
  { ...base, id: "s-landing", name: "cc-site", title: "Landing page redesign", cwd: "/home/demo/code/site", home: "~/code/site", status: "idle", activityAt: now - 4 * min, startedAt: now - 120 * min, pinned: true },
  { ...base, id: "s-api", name: "cc-api", title: "Add rate limiting to the public API", cwd: "/home/demo/code/api", home: "~/code/api", status: "working", activityAt: now, startedAt: now - 20 * min, canBackground: true },
  {
    ...base, id: "ses_demo1", name: "opencode", title: "Migrate billing to the new invoices table", cwd: "/home/demo/code/billing", home: "~/code/billing",
    status: "idle", activityAt: now - 26 * min, startedAt: now - 90 * min, kind: "opencode", agentName: "build", tmux: null,
    modelName: "deepseek-v4.1-flash-free",
    context: { pct: 41, tokens: 53_000, size: 128_000, model: "deepseek-v4.1-flash-free" }, agents: { total: 1, running: 0 },
  },
  {
    ...base, id: "ses_demo2", name: "opencode", title: "Upgrade the date library", cwd: "/home/demo/code/billing", home: "~/code/billing",
    status: "waiting", activityAt: now - 1 * min, startedAt: now - 9 * min, kind: "opencode", agentName: "build", tmux: null,
    modelName: "deepseek-v4.1-flash-free",
    context: { pct: 18, tokens: 23_000, size: 128_000, model: "deepseek-v4.1-flash-free" },
    prompt: {
      question: "Allow bash?",
      context: ["npm install date-fns@5 && npm run typecheck"],
      options: [{ n: 1, label: "Allow once" }, { n: 2, label: "Always allow" }, { n: 3, label: "Reject" }],
      selected: 1,
      tool: { name: "bash", title: "Run a command", desc: "Install date-fns v5 and list what breaks", code: "npm install date-fns@5 && npm run typecheck" },
    },
  },
  { ...base, id: "s-docs", name: "cc-docs", title: "Write the v2 migration guide", cwd: "/home/demo/code/docs", home: "~/code/docs", status: "working", activityAt: now, startedAt: now - 8 * min, muted: true, waits: [
      { kind: "agent", id: "a1", label: "Review the migration guide for accuracy", since: Date.now() - 3 * 60_000 },
      { kind: "agent", id: "a2", label: "Check every code sample compiles", since: Date.now() - 2 * 60_000 - 40_000 },
      { kind: "shell", id: "bq81kd2xa", label: "Build the docs site", since: Date.now() - 6 * 60_000 },
    ] },
];

// Context-window use and subagent counts (shown in the session header).
const ctx = (pct: number, size = 1_000_000) => ({ pct, tokens: Math.round((pct / 100) * size), size, model: "claude-opus-5-5" });
const extra: Record<string, any> = {
  "s-tests": { context: ctx(38), agents: { total: 3, running: 1 } },
  "s-plan": { context: ctx(12), agents: { total: 1, running: 0 } },
  "s-landing": { context: ctx(64), agents: { total: 2, running: 0 } },
  "s-api": { context: ctx(21), agents: { total: 4, running: 2 } },
  "s-docs": { context: ctx(88), agents: null },
};
for (const s of sessions) Object.assign(s, extra[s.id] ?? {});

// Subagents per session (Agents sheet) and their read-only chats.
const agent = (id: string, description: string, type: string, status: string, startedMin: number, endedMin: number | null) =>
  ({ id, description, type, status, toolUseId: null, startedAt: now - startedMin * min, endedAt: endedMin == null ? null : now - endedMin * min, depth: 1, parentAgentId: null, model: "claude-opus-5-5", summary: null });
const agents: Record<string, any[]> = {
  "s-plan": [agent("p-scan", "List every network call in the app", "Explore", "done", 13, 12)],
  "s-api": [
    agent("a-redis", "Check Redis client options for atomic counters", "Explore", "running", 3, null),
    agent("a-tests", "Write rate-limit tests (burst, refill, 429)", "general-purpose", "running", 2, null),
    agent("a-docs", "Find every public route that needs a limit", "Explore", "done", 11, 9),
    agent("a-bench", "Benchmark middleware overhead", "general-purpose", "done", 10, 6),
  ],
  "s-tests": [
    agent("t-ci", "Pull the last 20 CI runs of checkout.spec", "Explore", "running", 4, null),
    agent("t-trace", "Read the Playwright trace of a failed run", "general-purpose", "done", 35, 31),
    agent("t-grep", "Find other fixed waitForTimeout calls", "Explore", "done", 33, 32),
  ],
  "s-landing": [
    agent("l-a11y", "Contrast check on the new CTA", "general-purpose", "done", 16, 15),
    agent("l-copy", "Draft three headline options", "general-purpose", "done", 17, 16),
  ],
};
const agentChats: Record<string, any[]> = {
  "a-redis": [
    { k: "user", text: "Which Redis client options give us atomic increment-with-expiry for a token bucket?", ts: iso(3) },
    { k: "tool", id: "r1", name: "Grep", summary: "\"createClient\" in src", detail: "{}", ts: iso(3) },
    { k: "result", id: "r1", text: "src/lib/redis.ts:4: export const redis = createClient({ url: env.REDIS_URL })", error: false },
    { k: "tool", id: "r2", name: "Read", summary: "node_modules/redis/README.md", detail: "{}", ts: iso(2) },
    { k: "result", id: "r2", text: "…MULTI / EXEC, EVAL scripts, client.incr()…", error: false },
    { k: "text", text: "A small Lua script via `EVAL` is the safest: it reads the bucket, refills by elapsed time, decrements, and sets the TTL in one atomic step. `INCR` + `EXPIRE` in a `MULTI` works too but can't refill smoothly.", ts: iso(1) },
  ],
};

// ───────── chats ─────────
const chats: Record<string, any[]> = {
  "ses_demo2": [
    { k: "user", text: "Upgrade date-fns to v5 and fix whatever breaks.", ts: iso(9) },
    { k: "tool", id: "d1", name: "grep", summary: "from 'date-fns' in src", detail: "{}", ts: iso(8) },
    { k: "result", id: "d1", text: "14 files import date-fns", error: false },
    { k: "tool", id: "d2", name: "read", summary: "CHANGELOG of date-fns v5", detail: "{}", ts: iso(6) },
    { k: "result", id: "d2", text: "Breaking: format tokens YYYY → yyyy; parseISO now strict…", error: false },
    { k: "text", text: "Three breaking changes affect us: the `yyyy` tokens, stricter `parseISO`, and `differenceInDays` rounding. I'll install v5 first and let the type checker list every call site.", ts: iso(1) },
  ],
  "s-plan": [
    { k: "user", text: "Plan offline mode for the field app: technicians lose signal in basements.", ts: iso(14) },
    { k: "tool", id: "q1", name: "Read", summary: "src/data/store.ts", detail: "{}", ts: iso(13) },
    { k: "result", id: "q1", text: "export const store = createStore({ … })", error: false },
    { k: "tool", id: "q2", name: "Grep", summary: "\"fetch(\" in src", detail: "{}", ts: iso(12) },
    { k: "result", id: "q2", text: "23 matches in 9 files", error: false },
    { k: "text", text: "Every write goes straight to `fetch` today, so offline needs a local store plus a sync queue. Two decisions shape the rest of the plan:", ts: iso(2) },
    { k: "tool", id: "q3", name: "AskUserQuestion", summary: "Storage, Sync", detail: "{}", ts: iso(2) },
  ],
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
    { k: "thinking", text: "The old `invoices` table is still written by the nightly import, so dropping reads from it now would hide anything the import adds before the backfill finishes. Reading v2 first and falling back keeps both paths correct.\n\nA feature flag makes the fallback easy to remove next week, and logging each fallback hit shows when it's safe to delete.", ts: iso(59) },
    { k: "text", text: "Plan:\n1. Add a repository that reads from `invoices_v2` first.\n2. Fall back to `invoices` when a row is missing, and log it.\n3. Feature flag `billing.v2_reads`, on by default.", ts: iso(58) },
    { k: "tool", id: "o1", name: "edit", summary: "src/billing/repository.ts", detail: "{}", ts: iso(40) },
    { k: "result", id: "o1", text: "Edit applied successfully.", error: false },
    { k: "note", text: "↳ @test-runner: run billing suite (done)", ts: iso(30) },
    { k: "text", text: "All 214 billing tests pass. The fallback logged 0 misses against the staging snapshot.", ts: iso(26) },
  ],
};
chats["s-cache"] = [
  { k: "user", text: "Product listings are slow. Plan a cache for them; don't write code yet.", ts: iso(25) },
  { k: "tool", id: "c1", name: "Grep", summary: "findListings in src", detail: "{}", ts: iso(22) },
  { k: "result", id: "c1", text: "src/routes/products.ts:14\nsrc/services/product.ts:88", error: false },
  { k: "text", text: "Listings run the same query for every visitor. Here's a plan.", ts: iso(4) },
];
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
  { k: "text", text: "I'll build the docs site in the background and have two reviewers check the guide while it builds.", ts: iso(6) },
  { k: "tool", id: "x2", name: "Bash", summary: "Build the docs site", detail: "{}", ts: iso(6) },
  { k: "result", id: "x2", text: "Command running in background with ID: bq81kd2xa.", error: false },
  { k: "tool", id: "x3", name: "ScheduleWakeup", summary: "Re-check the link checker's results", detail: "{}", ts: iso(0.5), until: Date.now() + 4 * 60_000 + 32_000 },
  { k: "tool", id: "x4", name: "Yield", summary: "Waiting for background work", detail: "{}", ts: iso(0.2) },
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
    if (p === "/api/compact") { if (req.method === "POST") { const b = await req.json(); demoCompact = b.window; } return json({ window: demoCompact }); }
    if (p === "/api/state") return json(state());
    if (p === "/api/recent") return json({
      recent: [{ sessionId: "old1", title: "Upgrade to React 20", cwd: "/home/demo/code/site", home: "~/code/site", mtime: now - 86400_000 }],
      dirs: ["~/code/site", "~/code/shop", "~/code/api", "~/code/billing", "~/code/docs"].map((h) => ({ path: h, home: h })),
    });
    if (/^\/api\/session\/[\w-]+\/changes$/.test(p)) return json(changes);
    if (/^\/api\/session\/[\w-]+\/info$/.test(p)) return json({ cwd: "/home/demo/code/site", title: "Demo" });
    let am;
    if ((am = p.match(/^\/api\/session\/([\w-]+)\/agents$/))) return json({ agents: agents[am[1]] ?? [] });
    if ((am = p.match(/^\/api\/session\/([\w-]+)\/agent\/([\w-]+)$/))) {
      const items = agentChats[am[2]] ?? [{ k: "text", text: "Done.", ts: iso(5) }];
      return json({ agent: (agents[am[1]] ?? []).find((a) => a.id === am![2]) ?? null, items, start: 0, end: items.length + 1 });
    }
    if (p === "/api/opencode/catalog") return json({
      models: [
        { ref: "opencode/deepseek-v4.1-flash-free", name: "DeepSeek V4.1 Flash (free)", provider: "opencode", variants: ["low", "medium", "high"] },
        { ref: "opencode/deepseek-v4-pro", name: "DeepSeek V4 Pro", provider: "opencode", variants: ["low", "medium", "high"] },
        { ref: "opencode/gemini-4-neon", name: "Gemini 4 Neon", provider: "opencode", variants: [] },
        { ref: "anthropic/claude-sonnet-5-5", name: "Claude Sonnet 5.5", provider: "anthropic", variants: ["low", "medium", "high", "max"] },
        { ref: "openai/gpt-6-mini", name: "GPT-6 mini", provider: "openai", variants: ["low", "medium", "high"] },
      ],
      agents: [
        { id: "build", description: "Default agent: full tool access for writing code" },
        { id: "plan", description: "Read-only: analyses and plans without changing files" },
        { id: "orchestrator", description: "Splits big tasks across subagents" },
      ],
      defaultModel: "opencode/deepseek-v4.1-flash-free",
      recent: ["opencode/deepseek-v4.1-flash-free", "opencode/deepseek-v4-pro", "anthropic/claude-sonnet-5-5"],
      variants: { "opencode/deepseek-v4.1-flash-free": "medium" },
    });
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
