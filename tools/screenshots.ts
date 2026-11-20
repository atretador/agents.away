// Regenerates the README screenshots (docs/screenshots/*.png) from made-up demo data. One command:
//
//   bun run screenshots
//
// It starts the demo server (tools/demo/server.ts) on a free port, drives the real app in a phone-sized
// Chromium (390×844, 2× pixel ratio; dark mode, light for one shot) and stops the server afterwards.
// Chromium: $CHROME if set, else Playwright's cached browsers, else chromium / google-chrome on PATH
// (install one with `bunx playwright install chromium`). Add a shot here and in README's gallery when a
// feature should be shown; put the data it needs in tools/demo/server.ts.
import { chromium, type Page } from "playwright-core";
import { mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const OUT = join(import.meta.dir, "../docs/screenshots");
mkdirSync(OUT, { recursive: true });

function findChrome(): string {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), ".cache/ms-playwright");
  if (existsSync(cache)) {
    const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const d of dirs) for (const exe of ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
      if (existsSync(join(cache, d, exe))) return join(cache, d, exe);
    }
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    const p = Bun.which(name);
    if (p) return p;
  }
  throw new Error("No Chromium found. Set CHROME=/path/to/chrome, or run: bunx playwright install chromium");
}

// Start the demo server on a free port (or use DEMO_URL if one is already running).
let demo: ReturnType<typeof Bun.spawn> | null = null;
let BASE = process.env.DEMO_URL ?? "";
if (!BASE) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  demo = Bun.spawn(["bun", join(import.meta.dir, "demo/server.ts")], { env: { ...process.env, DEMO_PORT: String(port) }, stdout: "pipe", stderr: "inherit" });
  BASE = `http://localhost:${port}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + "/api/state")).ok) break; } catch {}
    await Bun.sleep(100);
  }
}
const stopDemo = () => { try { demo?.kill(); } catch {} };
process.on("exit", stopDemo);
process.on("SIGINT", () => { stopDemo(); process.exit(130); });

const browser = await chromium.launch({ executablePath: findChrome() });

async function phone(theme: "dark" | "light", appPrefs: Record<string, unknown> = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: theme,
    locale: "en-US", // the app follows the browser's language; README shots stay English
  });
  // Pretend notifications are on (the demo has no push service) so the "Get notified" banner stays away.
  await ctx.addInitScript((prefs: Record<string, unknown>) => {
    try {
      Object.defineProperty(Notification, "permission", { get: () => "granted" });
      PushManager.prototype.getSubscription = async function () { return { endpoint: "demo" } as any; };
    } catch {}
    localStorage.setItem("away.mode", "chat");
    if (Object.keys(prefs).length) localStorage.setItem("away.prefs", JSON.stringify({ v: 2, ...prefs }));
    localStorage.setItem("away.seen", JSON.stringify({ "s-landing": new Date().toISOString() }));
  }, appPrefs);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  return page;
}
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log("wrote", `docs/screenshots/${name}.png`);
};

// 1. Sessions list
let p = await phone("dark");
await p.goto(BASE + "/"); await p.waitForTimeout(1200);
await shot(p, "home");

// 2. A session asking for permission
await p.goto(BASE + "/#/s/s-tests"); await p.waitForTimeout(1200);
await shot(p, "permission");

// A plan approval, formatted (README "Using it")
await p.goto(BASE + "/#/s/s-cache"); await p.waitForTimeout(1300);
await shot(p, "plan");

// 3. Chat with a queued message
await p.goto(BASE + "/#/s/s-api"); await p.waitForTimeout(1200);
await shot(p, "chat");

// 4. Subagents sheet (header shows context % and the agents pill)
await p.goto(BASE + "/#/s/s-api"); await p.waitForTimeout(1200);
await p.click("#agentsbtn"); await p.waitForTimeout(900);
await shot(p, "agents");

// A question form (AskUserQuestion) answered from the phone
await p.goto(BASE + "/#/s/s-plan"); await p.waitForTimeout(1300);
await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await shot(p, "question");

// 5. Changes tab
await p.goto(BASE + "/#/s/s-landing"); await p.waitForTimeout(1000);
await p.click('[data-mode="changes"]'); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector("details.ch-file")?.setAttribute("open", ""));
await shot(p, "changes");

// 6. New session sheet with model & effort
await p.goto(BASE + "/"); await p.waitForTimeout(800);
await p.click("#new"); await p.waitForTimeout(900);
await p.evaluate(() => { const d = document.querySelector("details.launch") as HTMLDetailsElement | null; if (d) d.open = true; });
await p.evaluate(() => document.querySelector(".sheet")?.scrollTo(0, 9999));
await shot(p, "new-session");

// 7. Settings: notifications, themes, accent
await p.goto(BASE + "/"); await p.waitForTimeout(800);
await p.click("#settings"); await p.waitForTimeout(900);
await p.evaluate(() => { // start the view at the "Appearance" heading
  const sh = document.querySelector(".sheet") as HTMLElement;
  const h = [...sh.querySelectorAll("h3")].find((x) => x.textContent === "Appearance") as HTMLElement;
  if (h) sh.scrollTop = h.offsetTop - 64;
});
await shot(p, "settings");
await p.context().close();

// 8. Image review (light theme)
p = await phone("light");
await p.goto(BASE + "/#/review/r-hero"); await p.waitForTimeout(1500);
await shot(p, "review");
await p.context().close();

// OpenCode (README "OpenCode" section): its own theme, the free DeepSeek V4.1 model
p = await phone("dark", { theme: "opencode", launchAgent: "opencode", oc: { model: "opencode/deepseek-v4.1-flash-free", agent: "build" } });
await p.goto(BASE + "/#/s/ses_demo1"); await p.waitForTimeout(1300);
await p.evaluate(() => { const d = document.querySelector("details.msg-think") as HTMLDetailsElement | null; if (d) d.open = true; window.scrollTo(0, 0); });
await shot(p, "opencode-chat");
await p.goto(BASE + "/#/s/ses_demo2"); await p.waitForTimeout(1300);
await shot(p, "opencode-permission");
await p.goto(BASE + "/"); await p.waitForTimeout(900);
await p.click("#new"); await p.waitForTimeout(1500);
await p.evaluate(() => { const sh = document.querySelector(".sheet") as HTMLElement; const f = sh.querySelector("#first") as HTMLElement; if (f) sh.scrollTop = f.offsetTop - 70; });
await shot(p, "opencode-new");
await p.context().close();

await browser.close();
stopDemo();
