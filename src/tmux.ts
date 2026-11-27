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

// Also watch other tmux servers by name, e.g. AWAY_EXTRA_SOCKETS=relay while migrating from an older setup.
const SOCKETS = ["default", TMUX_SOCKET, ...(process.env.AWAY_EXTRA_SOCKETS ?? "").split(",").map((x) => x.trim()).filter(Boolean)];

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
  "PageUp", "PageDown", "C-u", "C-x", "C-s", "C-b", "1", "2", "3", "4", "5", "6", "7", "8", "9", "y", "n",
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

/** The question line above a menu: the last line ending in "?" (skips link lines like "Security guide"). */
function pickQuestion(above: string[]) {
  for (let i = above.length - 1; i >= Math.max(0, above.length - 8); i--) if (above[i].includes("?")) return i;
  return above.length - 1;
}
const trimQuestion = (q: string) => (q.includes("?") ? q.slice(0, q.lastIndexOf("?") + 1) : q).trim();

export type Prompt = {
  question: string;
  context: string[];
  options: { n: number; label: string }[];
  selected: number;
  /** Fingerprint of what is being asked (not of the cursor): answers carry it, so a stale notification
   *  or button can never answer a different prompt that has appeared since. */
  key?: string;
  /** What exactly is being approved (from the PreToolUse hook), when known: see approval.ts. */
  tool?: import("./approval").ToolView | null;
};
export function promptKey(p: Pick<Prompt, "question" | "context" | "options">): string {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify([p.question, p.context, p.options.map((o) => o.label)])).digest("hex").slice(0, 16);
}

const BOX = /[│╭╮╰╯─┃┏┓┗┛━╌┆]/g;

/** Detect a numbered selection menu (permission prompt, trust prompt…) at the bottom of the screen.
 *  AskUserQuestion forms are not menus: they're left to detectAskForm (except their review step). */
export function detectPrompt(screen: string): Prompt | null {
  const p = detectPromptRaw(screen);
  return p && { ...p, key: promptKey(p) };
}
function detectPromptRaw(screen: string): Prompt | null {
  const form = detectAskForm(screen);
  if (form && !form.review) return null;
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
  const qi = pickQuestion(above);
  const question = qi >= 0 ? trimQuestion(above[qi]) : "Choose an option";
  return { question, context: above.filter((_, j) => j !== qi).slice(-7), options, selected };
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
  const qi = pickQuestion(above);
  const question = qi >= 0 ? trimQuestion(above[qi]) : "Choose an option";
  return { question, context: above.filter((_, j) => j !== qi).slice(-6), options, selected: sel - a + 1 };
}

export async function chooseOption(socket: string, pane: string, pick: (p: Prompt) => number, expectKey?: string) {
  const screen = await capture(socket, pane);
  const p = screen && detectPrompt(screen);
  if (!p) throw new Error("No menu is showing in that session any more");
  if (expectKey !== undefined && p.key !== expectKey) throw new Error("That prompt was already answered; a different one is showing now. Open the session to see it.");
  const n = pick(p);
  if (!p.options.some((o) => o.n === n)) throw new Error("Option not available");
  const delta = n - p.selected;
  const keys: string[] = [];
  for (let i = 0; i < Math.abs(delta); i++) keys.push(delta > 0 ? "Down" : "Up");
  keys.push("Enter");
  await sendKeys(socket, pane, keys);
  return p;
}

// ───────── AskUserQuestion forms ─────────
// Claude Code draws the form as: a tab bar (`←  ☐ Colour  ☒ Sizes  ✔ Submit  →`, or just ` ☐ Fruit` for one
// question), the question, numbered options (multi-select ones as `[ ]`/`[✔]`) with indented descriptions, a
// last "Type something" row (free text: typing/pasting there fills and selects it), for multi-select a
// `Next`/`Submit` row, a separator, `N. Chat about this` and the `Enter to select · … · Esc to cancel` hint.
// Multi-question forms end with a "Review your answers" step (1. Submit answers / 2. Cancel).

export type AskForm = {
  tabs: { header: string; done: boolean }[];
  review: boolean;
  question: string;
  summary: string[]; // review step: the answers as shown
  multi: boolean;
  options: { n: number; label: string; description: string; checked: boolean }[]; // last = "Type something"
  cursor: number; // n of the ❯ option, 0 = the Next/Submit row, -2 = "Chat about this", -1 = unknown
  typed: string; // text in the "Type something" row
};

const SEP = /^\s*─{20,}\s*$/;
const OTHER_EMPTY = /^Type something\.?$/;
const normQ = (s: string) => s.replace(/\s+/g, " ").trim();
/** Same question text (screen lines wrap, so compare normalised, and tolerate truncation). */
export function sameQuestion(a: string, b: string) {
  a = normQ(a); b = normQ(b);
  return a === b || (a.length >= 24 && b.length >= 24 && (a.startsWith(b.slice(0, 48)) || b.startsWith(a.slice(0, 48))));
}

function parseTabBar(line: string): { header: string; done: boolean }[] | null {
  const t = line.trim();
  if (!/^(←\s+)?[☐☒✔]\s/.test(t) || !/[☐☒]/.test(t)) return null;
  const inner = t.replace(/^←\s+/, "").replace(/\s+→$/, "");
  const TAB = /([☐☒✔])\s(.+?)(?=\s+[☐☒✔]\s|$)/g;
  if (inner.replace(TAB, "").trim()) return null;
  const parts = [...inner.matchAll(TAB)];
  const tabs = parts.map((p) => ({ mark: p[1], header: p[2].trim() }));
  if (tabs.length > 1 && tabs[tabs.length - 1].mark === "✔" && tabs[tabs.length - 1].header === "Submit") tabs.pop();
  if (tabs.some((x) => x.mark === "✔")) return null;
  return tabs.map((x) => ({ header: x.header, done: x.mark === "☒" }));
}

export function detectAskForm(screen: string): AskForm | null {
  const lines = screen.replace(/\s+$/, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  let hint = -1;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 6); i--) if (/Esc to cancel|Enter to select/.test(lines[i])) { hint = i; break; }
  const noHint = hint < 0; // the review step has no hint line
  if (noHint) hint = lines.length;
  let bar = -1, tabs: AskForm["tabs"] | null = null;
  for (let i = hint - 1; i >= Math.max(0, hint - 80) && !tabs; i--) if ((tabs = parseTabBar(lines[i]))) bar = i;
  if (!tabs) return null;
  const body = lines.slice(bar + 1, hint);
  const optRe = /^\s*(❯)?\s*(\d{1,2})\.\s+(?:\[([ ✔])\]\s+)?(.*)$/;
  const first = body.findIndex((l) => optRe.test(l));
  if (first < 1) return null;
  const head = body.slice(0, first).map((l) => l.trim()).filter(Boolean);
  const isReview = normQ(head[0] ?? "") === "Review your answers";
  if (noHint && !isReview) return null;
  if (isReview) {
    const options = body.slice(first).map((l) => l.match(optRe)).filter(Boolean)
      .map((m) => ({ n: +m![2], label: m![4].trim(), description: "", checked: false, sel: !!m![1] }));
    const cur = options.find((o) => o.sel);
    return { tabs, review: true, question: "Review your answers", summary: head.slice(1), multi: false,
      options: options.map(({ sel, ...o }) => o), cursor: cur ? cur.n : -1, typed: "" };
  }
  const f: AskForm = { tabs, review: false, question: head.join(" "), summary: [], multi: false, options: [], cursor: -1, typed: "" };
  let afterSep = false, chat = false;
  for (const l of body.slice(first)) {
    if (SEP.test(l)) { afterSep = true; continue; }
    const m = l.match(optRe);
    if (afterSep) { if (m) { chat = true; if (m[1]) f.cursor = -2; } continue; }
    if (m) {
      f.options.push({ n: +m[2], label: m[4].trim(), description: "", checked: m[3] === "✔" });
      if (m[3] !== undefined) f.multi = true;
      if (m[1]) f.cursor = +m[2];
      continue;
    }
    const sub = l.match(/^\s*(❯)?\s+(Next|Submit)$/);
    if (sub && f.multi) { if (sub[1]) f.cursor = 0; continue; }
    const last = f.options[f.options.length - 1];
    if (last && l.trim()) last.description = (last.description + " " + l.trim()).trim();
  }
  if (f.options.length < 2 || f.options.some((o, i) => o.n !== i + 1)) return null;
  // Not a form unless it has its trailing rows (guards against a ☐ todo line above an ordinary menu).
  if (!afterSep || (!chat && !OTHER_EMPTY.test(f.options[f.options.length - 1].label))) return null;
  const other = f.options[f.options.length - 1];
  f.typed = OTHER_EMPTY.test(other.label) ? "" : other.label;
  return f;
}

export type AskAnswer = { pick: number[]; other?: string }; // pick: 1-based option numbers (without "Type something")

/** Fill in and submit an AskUserQuestion form with keys, re-reading the screen after every step.
 *  `questions` are the question texts in tab order; with `submit` the review step is confirmed too. */
export async function answerAsk(socket: string, pane: string, questions: string[], answers: AskAnswer[], submit: boolean) {
  const read = async (wait = 160) => {
    await Bun.sleep(wait);
    const s = await capture(socket, pane);
    return s ? detectAskForm(s) : null;
  };
  const press = async (keys: string[]) => { if (keys.length) await sendKeys(socket, pane, keys); return read(); };
  const gone = () => new Error("The question form isn't showing any more");
  const pos = (f: AskForm, c: number) => (c > 0 ? c : c === 0 ? f.options.length + 1 : c === -2 ? f.options.length + (f.multi ? 2 : 1) : -1);
  const moveTo = async (f: AskForm, target: number) => {
    const from = pos(f, f.cursor), to = pos(f, target);
    if (from < 0) throw new Error("Can't tell where the cursor is in the form");
    const g = await press(Array(Math.abs(to - from)).fill(to > from ? "Down" : "Up"));
    if (!g) throw gone();
    if (g.cursor !== target) throw new Error("The form didn't move as expected — nothing was submitted");
    return g;
  };
  const setOther = async (f: AskForm, text: string) => {
    text = text.replace(/\s*\n\s*/g, " ").trim();
    if (f.typed === text) return f;
    let g = f.typed ? await press(["C-u"]) : f;
    if (!g) throw gone();
    if (text) { await sendText(socket, pane, text, false); g = await read(250); }
    if (!g || normQ(g.typed) !== normQ(text)) throw new Error("Couldn't type the answer into the form");
    return g;
  };
  const at = (f: AskForm) => (f.review ? questions.length : questions.findIndex((q) => sameQuestion(q, f.question)));

  let f = await read(0);
  if (!f || f.review) throw gone();
  for (let i = 0; i < questions.length; i++) {
    for (let guard = 0; ; guard++) {
      if (!f) throw gone();
      const cur = at(f);
      if (cur < 0) throw new Error("A different question is showing now");
      if (cur === i) break;
      if (guard > questions.length * 2 + 2) throw new Error(`Couldn't switch to question ${i + 1}`);
      // Left/Right only switch tabs from a plain option row (in the text row they move the text cursor).
      if (!f.review && f.cursor !== 1) { f = await moveTo(f, 1); continue; }
      f = await press([cur < i ? "Right" : "Left"]);
    }
    const a = answers[i], other = f!.options.length;
    if (!f!.multi) {
      const target = a.other?.trim() ? other : a.pick[0];
      if (!target || target < 1 || target > other) throw new Error(`Pick an answer for question ${i + 1}`);
      f = await moveTo(f!, target);
      if (target === other) f = await setOther(f, a.other!);
    } else {
      for (let n = 1; n < other; n++) {
        const want = a.pick.includes(n);
        if (f!.options[n - 1].checked === want) continue;
        f = await moveTo(f!, n);
        f = await press(["Space"]);
        if (!f || f.options[n - 1].checked !== want) throw new Error(`Couldn't ${want ? "tick" : "untick"} "${f?.options[n - 1]?.label ?? n}"`);
      }
      if (normQ(a.other ?? "") !== normQ(f!.typed)) { f = await moveTo(f!, other); f = await setOther(f, a.other ?? ""); }
      f = await moveTo(f!, 0); // Next / Submit
    }
    f = await press(["Enter"]);
    if (f && !f.review && at(f) === i) throw new Error(`Question ${i + 1} didn't take the answer`);
  }
  if (f?.review && submit) {
    if (f.tabs.some((t) => !t.done)) throw new Error("Not every question is answered yet");
    const ok = f.options.find((o) => /^Submit/i.test(o.label));
    if (!ok) throw new Error("No Submit button on the review step");
    f = await moveTo(f, ok.n);
    await sendKeys(socket, pane, ["Enter"]);
  }
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

/** A string tmux won't expand as a format (#(cmd), #{var}): "#" → "##". */
export const tmuxLiteral = (s: string) => s.replaceAll("#", "##");

export async function newSession(cwd: string, name: string, claudeArgs: string[], bin: "claude" | "pi" = "claude") {
  const sh = loginShell();
  const quote = /fish$/.test(sh) ? fishQuote : posixQuote;
  const cmd = ["exec", bin, ...claudeArgs.map(quote)].join(" ");
  // tmux expands #(...) formats in -c: escape "#" so a folder name can never run a command.
  const args = ["new-session", "-d", "-s", name, "-c", tmuxLiteral(cwd), "-x", "80", "-y", "50", "--", sh, "-l", "-c", cmd];
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

/** Claude Code offers to move the running shell command (or subagent) to the background:
 *  "(ctrl+b to run in background)", in tmux "(ctrl+b ctrl+b (twice) to run in background)". One C-b sent
 *  with send-keys reaches Claude Code directly (no tmux prefix in the way), so that's all it takes. */
export const canBackground = (screen: string) => /ctrl\+b[^\n]*to run in background/i.test(screen);

// ───────── /btw side answers ─────────
// Claude Code draws them in a panel at the bottom: a line of ▔, the history of `/btw …` questions, the
// latest answer indented by 4 (or "· Answering…" while it's being written), and a hint line ending in
// "Esc to close". Claude Code wraps the answer itself, so wrapped lines are joined back up here.
export type Btw = { question: string; answer: string; pending: boolean };
export function detectBtw(screen: string, cols = 80): Btw | null {
  const lines = screen.replace(/\s+$/, "").split("\n");
  let top = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (/^▔{10,}/.test(lines[i].trim())) { top = i; break; }
  if (top < 0) return null;
  const body = lines.slice(top + 1);
  const foot = body.findIndex((l) => /Esc to close\s*$/.test(l));
  if (foot < 0) return null;
  const panel = body.slice(0, foot);
  let qi = -1;
  for (let i = panel.length - 1; i >= 0; i--) if (/^ {2}\/btw\s/.test(panel[i])) { qi = i; break; }
  if (qi < 0) return null;
  const question = panel[qi].trim().replace(/^\/btw\s+/, "");
  const ans = panel.slice(qi + 1).map((l) => l.replace(/^ {4}/, "").replace(/\s+$/, ""));
  while (ans.length && !ans[ans.length - 1].trim()) ans.pop();
  // "· Answering…" with an animated symbol in front (it cycles through several characters).
  if (ans.length <= 1 && (!ans.length || /^\S?\s*Answering…?$/.test(ans[0].trim()))) return { question, answer: "", pending: true };
  // Join lines Claude Code wrapped (a line that ran to near the full width continues on the next).
  const out: string[] = [];
  for (const l of ans) {
    const prev = out[out.length - 1];
    const cont = prev !== undefined && prev.length >= cols - 16 && l.trim() && !/^\s*([-*•]|\d+[.)])\s/.test(l);
    if (cont) out[out.length - 1] = prev + " " + l.trim();
    else out.push(l);
  }
  return { question, answer: out.join("\n").trim(), pending: !out.join("").trim() };
}
