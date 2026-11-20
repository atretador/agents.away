// Structured approval cards. Claude Code's PreToolUse hook tells us exactly which tool call is waiting
// (name + input), so the phone can show a plan as markdown, a command as code and an edit as a diff
// instead of the few lines of terminal text above the menu.
import { basename, relative, isAbsolute } from "node:path";
import { HOME } from "./config";

export type ToolView = {
  name: string;
  title: string;
  path?: string;
  desc?: string;
  md?: string;
  code?: string;
  diff?: { t: "+" | "-" | " " | "@"; s: string }[];
  fields?: [string, string][];
  clipped?: boolean;
};

type Pending = { id: string; name: string; input: any; cwd: string; at: number };
const pending = new Map<string, Pending[]>(); // session id → tool calls that have started but not finished

/** Feed every Claude Code hook event in here. */
export function onToolHook(sessionId: string, ev: any) {
  const name = ev.hook_event_name;
  if (name === "PreToolUse" && ev.tool_name) {
    const list = (pending.get(sessionId) ?? []).filter((p) => Date.now() - p.at < 3600_000).slice(-15);
    list.push({ id: String(ev.tool_use_id ?? ""), name: String(ev.tool_name), input: ev.tool_input ?? {}, cwd: String(ev.cwd ?? ""), at: Date.now() });
    pending.set(sessionId, list);
  } else if (name === "PostToolUse" || name === "PostToolUseFailure") {
    const list = pending.get(sessionId);
    if (list) pending.set(sessionId, list.filter((p) => p.id !== String(ev.tool_use_id ?? "")));
  } else if (name === "UserPromptSubmit" || name === "Stop") pending.delete(sessionId);
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The waiting tool call the screen is asking about, or null when it can't be told for sure. */
export function toolForScreen(sessionId: string, screen: string): ToolView | null {
  const list = pending.get(sessionId);
  if (!list?.length) return null;
  const text = norm(screen);
  for (const p of [...list].reverse()) {
    const hint = hintOf(p);
    if (hint && text.includes(norm(hint))) return describeTool(p.name, p.input, p.cwd);
  }
  return null;
}

function hintOf(p: Pending): string {
  const i = p.input ?? {};
  switch (p.name) {
    case "Bash": return String(i.command ?? "").trim().split("\n")[0].slice(0, 24);
    case "Edit": case "MultiEdit": case "Write": case "NotebookEdit": case "Read":
      return basename(String(i.file_path ?? i.notebook_path ?? ""));
    case "ExitPlanMode": return "proceed";
    case "WebFetch": try { return new URL(String(i.url)).hostname; } catch { return ""; }
    default: return p.name.startsWith("mcp__") ? p.name.split("__").pop()! : p.name;
  }
}

const MAX_CODE = 4000, MAX_MD = 12_000, MAX_DIFF = 160;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + "\n…" : s);

function showPath(p: string, cwd: string): string {
  if (!p) return "";
  if (cwd && isAbsolute(p)) {
    const r = relative(cwd, p);
    if (r && !r.startsWith("..") && !isAbsolute(r)) return r;
  }
  return HOME && p.startsWith(HOME + "/") ? "~" + p.slice(HOME.length) : p;
}

/** A line diff of one replacement: common leading/trailing lines become context. */
export function editDiff(oldS: string, newS: string): ToolView["diff"] {
  const a = String(oldS ?? "").split("\n"), b = String(newS ?? "").split("\n");
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const ctx = (l: string[]) => l.map((s) => ({ t: " " as const, s }));
  return [
    ...ctx(a.slice(Math.max(0, pre - 2), pre)),
    ...a.slice(pre, a.length - suf).map((s) => ({ t: "-" as const, s })),
    ...b.slice(pre, b.length - suf).map((s) => ({ t: "+" as const, s })),
    ...ctx(b.slice(b.length - suf, Math.min(b.length, b.length - suf + 2))),
  ];
}

function fieldsOf(input: any): [string, string][] {
  return Object.entries(input ?? {}).slice(0, 8).map(([k, v]) => [k, clip(typeof v === "string" ? v : JSON.stringify(v, null, 1), 600)]);
}

export function describeTool(name: string, input: any, cwd = ""): ToolView {
  const i = input ?? {};
  const v: ToolView = { name, title: name };
  switch (name) {
    case "ExitPlanMode":
      v.title = "Plan";
      v.md = clip(String(i.plan ?? ""), MAX_MD);
      break;
    case "Bash":
      v.title = "Run a command";
      v.desc = i.description ? String(i.description) : undefined;
      v.code = clip(String(i.command ?? ""), MAX_CODE);
      break;
    case "Edit":
      v.title = "Edit";
      v.path = showPath(String(i.file_path ?? ""), cwd);
      v.diff = editDiff(i.old_string, i.new_string);
      if (i.replace_all) v.desc = "Every occurrence";
      break;
    case "MultiEdit": {
      v.title = "Edit";
      v.path = showPath(String(i.file_path ?? ""), cwd);
      const edits: any[] = Array.isArray(i.edits) ? i.edits : [];
      v.diff = edits.flatMap((e, n) => [...(n ? [{ t: "@" as const, s: "" }] : []), ...editDiff(e.old_string, e.new_string)!]);
      v.desc = `${edits.length} change${edits.length === 1 ? "" : "s"}`;
      break;
    }
    case "Write":
      v.title = "Write file";
      v.path = showPath(String(i.file_path ?? ""), cwd);
      v.code = clip(String(i.content ?? ""), MAX_CODE);
      break;
    case "NotebookEdit":
      v.title = "Edit notebook";
      v.path = showPath(String(i.notebook_path ?? ""), cwd);
      v.code = clip(String(i.new_source ?? ""), MAX_CODE);
      break;
    case "WebFetch":
      v.title = "Fetch a web page";
      v.fields = [["URL", String(i.url ?? "")], ...(i.prompt ? [["Looking for", String(i.prompt)] as [string, string]] : [])];
      break;
    case "WebSearch":
      v.title = "Search the web";
      v.fields = [["Query", String(i.query ?? "")]];
      break;
    case "Read":
      v.title = "Read file";
      v.path = showPath(String(i.file_path ?? ""), cwd);
      break;
    default:
      if (name.startsWith("mcp__")) { const [, server, tool] = name.split("__"); v.title = `${tool} (${server})`; }
      v.fields = fieldsOf(i);
  }
  if (v.diff && v.diff.length > MAX_DIFF) { v.diff = v.diff.slice(0, MAX_DIFF); v.clipped = true; }
  return v;
}

/** One line for the sessions list and notifications: "Plan ready: …", "Run: npm test", "Edit: src/a.ts". */
export function toolLine(t: ToolView): string {
  if (t.md) { const h = t.md.split("\n").map((l) => l.replace(/^[#>*\s-]+/, "").replace(/[*_`]/g, "").trim()).find(Boolean); return `Plan ready${h ? ": " + h : ""}`; }
  if (t.name === "Bash" || t.name === "bash" || t.name === "shell") return `Run: ${t.code?.split("\n")[0] ?? ""}`;
  if (t.path) return `${t.title}: ${t.path}`;
  return t.fields?.[0] ? `${t.title}: ${t.fields[0][1].split("\n")[0]}` : t.title;
}

/** OpenCode's tools, mapped onto the same views (its names and input fields differ from Claude Code's). */
export function describeOcTool(name: string, input: any, cwd = ""): ToolView {
  const i = input ?? {};
  const path = i.path ?? i.filePath ?? i.file_path;
  let v: ToolView;
  switch (name) {
    case "bash": case "shell":
      v = describeTool("Bash", { command: i.command, description: i.description }, cwd); break;
    case "edit":
      v = describeTool("Edit", { file_path: path, old_string: i.oldString ?? i.old_string, new_string: i.newString ?? i.new_string, replace_all: i.replaceAll }, cwd); break;
    case "write":
      v = describeTool("Write", { file_path: path, content: i.content }, cwd); break;
    case "read":
      v = describeTool("Read", { file_path: path }, cwd); break;
    case "webfetch":
      v = describeTool("WebFetch", { url: i.url, prompt: i.prompt }, cwd); break;
    case "websearch":
      v = describeTool("WebSearch", { query: i.query }, cwd); break;
    case "execute":
      v = { name, title: "Run code", code: clip(String(i.code ?? ""), MAX_CODE) }; break;
    case "patch": case "apply_patch":
      v = { name, title: "Apply patch", diff: String(i.patch ?? i.patchText ?? i.content ?? "").split("\n").slice(0, MAX_DIFF).map((l) =>
        ({ t: (l.startsWith("+") ? "+" : l.startsWith("-") ? "-" : l.startsWith("@@") || l.startsWith("***") ? "@" : " ") as "+" | "-" | " " | "@", s: l.startsWith("@@") || l.startsWith("***") ? "" : l.slice(l[0] === "+" || l[0] === "-" || l[0] === " " ? 1 : 0) })) };
      break;
    default:
      v = describeTool(name, i, cwd);
  }
  return { ...v, name };
}
