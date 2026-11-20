import { TMUX_CONF, TMUX_SOCKET } from "./config";

export type Pane = {
  socket: string; // "default" or "agents-away"
  paneId: string; // %12
  panePid: number;
  tty: string;
  session: string;
  width: number;
  height: number;
  attached: boolean;
  cwd: string;
};

const SOCKETS = ["default", TMUX_SOCKET];

function args(socket: string) {
  return socket === "default" ? [] : ["-L", socket, "-f", TMUX_CONF];
}

export async function tmux(socket: string, cmd: string[], stdin?: string): Promise<{ ok: boolean; out: string; err: string }> {
  const p = Bun.spawn(["tmux", ...args(socket), ...cmd], {
    stdin: stdin !== undefined ? new TextEncoder().encode(stdin) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  return { ok: code === 0, out, err };
}

export async function listPanes(): Promise<Pane[]> {
  const fmt = "#{pane_id}\t#{pane_pid}\t#{pane_tty}\t#{session_name}\t#{pane_width}\t#{pane_height}\t#{session_attached}\t#{pane_current_path}";
  const all: Pane[] = [];
  await Promise.all(
    SOCKETS.map(async (socket) => {
      const r = await tmux(socket, ["list-panes", "-a", "-F", fmt]);
      if (!r.ok) return;
      for (const line of r.out.split("\n")) {
        if (!line) continue;
        const [paneId, pid, tty, session, w, h, att, cwd] = line.split("\t");
        all.push({ socket, paneId, panePid: +pid, tty, session, width: +w, height: +h, attached: att !== "0", cwd });
      }
    }),
  );
  return all;
}

export async function capture(socket: string, pane: string, opts: { ansi?: boolean; history?: number } = {}) {
  const cmd = ["capture-pane", "-p", "-t", pane];
  if (opts.ansi) cmd.push("-e");
  if (opts.history) cmd.push("-S", String(-opts.history));
  const r = await tmux(socket, cmd);
  return r.ok ? r.out : null;
}

export const KEY_WHITELIST = new Set([
  "Escape", "Enter", "Up", "Down", "Left", "Right", "Tab", "BTab", "C-c", "C-o", "C-r", "C-t", "C-l", "Space", "BSpace",
  "PageUp", "PageDown", "C-u", "1", "2", "3", "4", "5", "6", "7", "8", "9", "y", "n",
]);

export async function sendKeys(socket: string, pane: string, keys: string[]) {
  for (const k of keys) {
    if (!KEY_WHITELIST.has(k)) throw new Error("key not allowed: " + k);
  }
  // Leave copy-mode first if the PC user scrolled; otherwise keys go to copy-mode.
  await tmux(socket, ["send-keys", "-t", pane, "-X", "cancel"]);
  for (const k of keys) {
    await tmux(socket, ["send-keys", "-t", pane, k]);
    await Bun.sleep(35);
  }
}

/** Paste text (bracketed, so multi-line stays one message) then optionally submit. */
export async function sendText(socket: string, pane: string, text: string, submit = true) {
  await tmux(socket, ["send-keys", "-t", pane, "-X", "cancel"]);
  const buf = "away" + Math.random().toString(36).slice(2, 8);
  if (text.length) {
    const lb = await tmux(socket, ["load-buffer", "-b", buf, "-"], text);
    if (!lb.ok) throw new Error(lb.err);
    await tmux(socket, ["paste-buffer", "-p", "-d", "-b", buf, "-t", pane]);
  }
  if (submit) {
    // Give the TUI a moment to absorb the paste before Enter.
    await Bun.sleep(Math.min(600, 120 + text.length / 20));
    await tmux(socket, ["send-keys", "-t", pane, "Enter"]);
  }
}

export type Prompt = {
  question: string;
  context: string[];
  options: { n: number; label: string }[];
  selected: number;
};

const BOX = /[│╭╮╰╯─┃┏┓┗┛━╌┆]/g;

/** Detect a numbered selection menu (permission prompt, AskUserQuestion…) at the bottom of the screen. */
export function detectPrompt(screen: string): Prompt | null {
  const lines = screen.replace(/\s+$/, "").split("\n").map((l) => l.replace(BOX, " ").replace(/\s+$/, ""));
  const tail = lines.slice(-30);
  const optRe = /^\s*([❯›>])?\s*(\d{1,2})[.)]\s+(.+?)\s*$/;
  // walk from bottom to find the last block of consecutive options 1..k
  let end = -1;
  for (let i = tail.length - 1; i >= 0; i--) {
    if (optRe.test(tail[i])) { end = i; break; }
  }
  if (end < 0) return detectPlainMenu(tail);
  // Walk up through options (and their indented description lines) until option 1.
  let start = end;
  for (let i = end; i >= 0; i--) {
    const m = tail[i].match(optRe);
    if (m) { start = i; if (+m[2] === 1) break; continue; }
    if (!tail[i].trim() || /^\s{3,}\S/.test(tail[i])) continue;
    break;
  }
  const options: { n: number; label: string }[] = [];
  let selected = -1;
  for (let i = start; i <= end; i++) {
    const m = tail[i].match(optRe);
    if (!m) {
      // a long label that wrapped onto the next line
      const last = options[options.length - 1];
      if (last && tail[i].trim() && tail[i - 1]?.length >= 70 && optRe.test(tail[i - 1])) last.label += " " + tail[i].trim();
      continue;
    }
    const n = +m[2];
    options.push({ n, label: m[3].trim() });
    if (m[1]) selected = n;
  }
  if (options.length < 2 || options[0].n !== 1 || selected < 0) return null;
  for (let i = 0; i < options.length; i++) if (options[i].n !== i + 1) return null;
  // Lines after the menu that are not hints mean the menu is not live at the bottom.
  const after = tail.slice(end + 1).filter((l) => l.trim());
  if (after.length > 4) return null;
  const above: string[] = [];
  for (let i = start - 1; i >= 0 && above.length < 10; i--) {
    const t = tail[i].trim();
    if (t) above.unshift(t);
  }
  const question = above.length ? above[above.length - 1] : "Choose an option";
  return { question, context: above.slice(0, -1).slice(-7), options, selected };
}

/** Unnumbered menus: one line marked ❯, siblings at the same indent, an "Enter to …" hint below. */
function detectPlainMenu(tail: string[]): Prompt | null {
  const sel = tail.findLastIndex((l) => /^\s*❯\s+\S/.test(l));
  if (sel < 0) return null;
  const hint = tail.slice(sel + 1, sel + 12).findIndex((l) => /(Enter to|Esc to|↑\/↓)/.test(l));
  if (hint < 0) return null;
  const textCol = tail[sel].match(/^\s*❯\s+/)![0].length;
  const isOpt = (l: string) => {
    if (!l.trim() || l.length <= textCol) return false;
    const lead = l.slice(0, textCol);
    return /^\s*(❯\s*)?$/.test(lead) && l[textCol] !== " ";
  };
  let a = sel, b = sel;
  while (a - 1 >= 0 && isOpt(tail[a - 1])) a--;
  while (b + 1 < tail.length && isOpt(tail[b + 1]) && !/(Enter to|Esc to)/.test(tail[b + 1])) b++;
  if (b - a < 1 || b - a > 9) return null;
  const options = [];
  for (let i = a; i <= b; i++) options.push({ n: i - a + 1, label: tail[i].replace("❯", "").trim() });
  const above: string[] = [];
  for (let i = a - 1; i >= 0 && above.length < 8; i--) if (tail[i].trim()) above.unshift(tail[i].trim());
  const question = above.length ? above[above.length - 1] : "Choose an option";
  return { question, context: above.slice(0, -1).slice(-6), options, selected: sel - a + 1 };
}

export async function chooseOption(socket: string, pane: string, pick: (p: Prompt) => number) {
  const screen = await capture(socket, pane);
  const p = screen && detectPrompt(screen);
  if (!p) throw new Error("No menu is showing in that session any more");
  const n = pick(p);
  if (!p.options.some((o) => o.n === n)) throw new Error("Option not available");
  const delta = n - p.selected;
  const keys: string[] = [];
  for (let i = 0; i < Math.abs(delta); i++) keys.push(delta > 0 ? "Down" : "Up");
  keys.push("Enter");
  await sendKeys(socket, pane, keys);
  return p;
}

function fishQuote(s: string) {
  return "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}
function posixQuote(s: string) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/** The user's login shell (so sessions get their normal PATH and env). Override with AWAY_SHELL. */
let shellCache: string | null = null;
function loginShell(): string {
  if (shellCache) return shellCache;
  let sh = process.env.AWAY_SHELL || "";
  if (!sh) {
    try {
      const user = process.env.USER || require("node:os").userInfo().username;
      const line = Bun.spawnSync(["getent", "passwd", user]).stdout.toString().trim();
      sh = line.split(":")[6] || "";
    } catch {}
  }
  shellCache = sh || process.env.SHELL || "/bin/bash";
  return shellCache;
}

export async function newSession(cwd: string, name: string, claudeArgs: string[]) {
  const sh = loginShell();
  const quote = /fish$/.test(sh) ? fishQuote : posixQuote;
  const cmd = ["exec", "claude", ...claudeArgs.map(quote)].join(" ");
  const args = ["new-session", "-d", "-s", name, "-c", cwd, "-x", "80", "-y", "50", "--", sh, "-l", "-c", cmd];
  const running = (await tmux(TMUX_SOCKET, ["list-sessions"])).ok;
  if (!running) {
    // Starting the tmux server ourselves: give it its own systemd scope, so the Claude sessions
    // (and their builds) aren't counted as — or tied to — the Agents Away service.
    const p = Bun.spawn(["systemd-run", "--user", "--scope", "--quiet", "--collect", `--unit=agents-away-tmux-${Date.now()}`,
      "tmux", "-L", TMUX_SOCKET, "-f", TMUX_CONF, ...args], { stdout: "ignore", stderr: "pipe" });
    const err = await new Response(p.stderr).text();
    if ((await p.exited) !== 0) throw new Error(err.trim() || "tmux failed");
    return;
  }
  const r = await tmux(TMUX_SOCKET, args);
  if (!r.ok) throw new Error(r.err.trim() || "tmux failed");
}

export async function sessionExists(name: string) {
  const r = await tmux(TMUX_SOCKET, ["has-session", "-t", "=" + name]);
  return r.ok;
}
