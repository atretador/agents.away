// Agents Away extension for pi (https://pi.dev). Installed by `agents-away hooks install` into
// ~/.pi/agent/extensions/. It does two things, both best-effort (pi never waits for or fails on them):
//  1. keeps ~/.config/agents-away/pi/<pid>.json up to date: which session this pi is running, in which
//     folder, whether it is working, and its context use. The phone's session list is built from these.
//  2. tells the local API when a turn starts and ends (the same hook events Claude Code sends), which is
//     what sends the "finished" notification.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const cfg = process.env.AWAY_CONFIG_DIR ?? join(homedir(), ".config/agents-away");
const dir = join(cfg, "pi");
const file = join(dir, `${process.pid}.json`);
const cli = process.env.AWAY_CLI ?? join(homedir(), ".local/bin/agents-away");
const startedAt = Date.now();

export default function (pi: ExtensionAPI) {
  let status: "idle" | "busy" = "idle";
  let statusAt = Date.now();
  let last: any = null; // the latest context, kept so a write can't lose it

  const write = (ctx: any) => {
    last = ctx ?? last;
    const c = last;
    if (!c) return;
    try {
      const sm = c.sessionManager;
      let context = null;
      try {
        const u = c.getContextUsage?.();
        if (u && u.tokens != null && u.contextWindow > 0) context = { tokens: u.tokens, size: u.contextWindow, pct: u.percent ?? (u.tokens / u.contextWindow) * 100 };
      } catch {}
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify({
        pid: process.pid, sessionId: sm.getSessionId(), file: sm.getSessionFile?.() ?? null, cwd: c.cwd,
        name: pi.getSessionName?.() ?? null, status, statusAt, startedAt, model: c.model?.id ?? null, context,
      }));
    } catch {}
  };

  const hook = (ev: Record<string, unknown>) => {
    try {
      const sm = last?.sessionManager;
      const p = spawn(cli, ["hook"], { stdio: ["pipe", "ignore", "ignore"], detached: true });
      p.on("error", () => {});
      p.stdin!.on("error", () => {});
      p.stdin!.end(JSON.stringify({ session_id: sm?.getSessionId(), cwd: last?.cwd, transcript_path: sm?.getSessionFile?.() ?? undefined, ...ev }));
      p.unref();
    } catch {}
  };

  const setStatus = (s: "idle" | "busy", ctx: any) => { status = s; statusAt = Date.now(); write(ctx); };

  pi.on("session_start", async (_e: any, ctx: any) => write(ctx));
  pi.on("agent_start", async (_e: any, ctx: any) => {
    setStatus("busy", ctx);
    hook({ hook_event_name: "UserPromptSubmit" });
  });
  pi.on("turn_end", async (_e: any, ctx: any) => write(ctx));
  pi.on("agent_end", async (e: any, ctx: any) => {
    setStatus("idle", ctx);
    // A failed turn (the model was unreachable, say) is retried by pi: only a normal ending is "finished".
    const msgs: any[] = e?.messages ?? [];
    const lastA = [...msgs].reverse().find((m) => m?.role === "assistant");
    if (!lastA || lastA.stopReason === "error" || lastA.stopReason === "aborted") return;
    const text = (Array.isArray(lastA.content) ? lastA.content : []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    hook({ hook_event_name: "Stop", last_assistant_message: text || undefined });
  });
  const bye = () => { try { rmSync(file, { force: true }); } catch {} };
  pi.on("session_shutdown", async () => bye());
  process.on("exit", bye);
}
