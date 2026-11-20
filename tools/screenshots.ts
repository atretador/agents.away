// Regenerates the README screenshots (docs/screenshots/*.png) from the demo server's made-up data.
//
//   bun tools/demo/server.ts &                       # demo data on http://localhost:7450
//   bun add --no-save playwright-core                 # once
//   CHROME=/path/to/chrome bun tools/screenshots.ts   # any Chromium; defaults to Playwright's bundled one
//
// Shots are taken at phone size (390×844, 2× pixel ratio) in dark mode, light for one.
import { chromium, type Page } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.DEMO_URL ?? "http://localhost:7450";
const OUT = join(import.meta.dir, "../docs/screenshots");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

async function phone(theme: "dark" | "light") {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: theme,
  });
  // Pretend notifications are on (the demo has no push service) so the "Get notified" banner stays away.
  await ctx.addInitScript(() => {
    try {
      Object.defineProperty(Notification, "permission", { get: () => "granted" });
      PushManager.prototype.getSubscription = async function () { return { endpoint: "demo" } as any; };
    } catch {}
    localStorage.setItem("away.mode", "chat");
    localStorage.setItem("away.seen", JSON.stringify({ "s-landing": new Date().toISOString() }));
  });
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

// 3. Chat with a queued message
await p.goto(BASE + "/#/s/s-api"); await p.waitForTimeout(1200);
await shot(p, "chat");

// 4. Subagents sheet (header shows context % and the agents pill), then one subagent's chat
await p.goto(BASE + "/#/s/s-api"); await p.waitForTimeout(1200);
await p.click("#agentsbtn"); await p.waitForTimeout(900);
await shot(p, "agents");
await p.goto(BASE + "/#/a/s-api/a-redis"); await p.waitForTimeout(1500);
await shot(p, "subagent");

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
await p.context().close();

// 7. Image review (light theme)
p = await phone("light");
await p.goto(BASE + "/#/review/r-hero"); await p.waitForTimeout(1500);
await shot(p, "review");
await p.context().close();

await browser.close();
