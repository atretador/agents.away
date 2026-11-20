// The `claude` wrapper for bash/zsh (shell/claude.sh), run for real in an interactive shell (via `script`)
// against a stand-in `claude` and a throwaway tmux server. Skipped for shells that aren't installed;
// CI installs bash, zsh and tmux.
import { test, expect, describe, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const has = (bin: string) => !!Bun.which(bin);
const shells = ["bash", "zsh"].filter(has);
const ready = has("tmux") && has("script");
const sockets: string[] = [];
afterAll(() => {
  for (const s of sockets) {
    Bun.spawnSync(["tmux", "-L", s, "kill-server"]);
    rmSync(join(process.env.TMUX_TMPDIR || "/tmp", `tmux-${process.getuid!()}`, s), { force: true });
  }
});

function setup(shell: string) {
  const t = mkdtempSync(join(process.env.AWAY_TEST_ROOT!, `wrap-${shell}-`));
  const dir = join(t, "My Project (v2)");
  mkdirSync(join(t, "bin")); mkdirSync(dir); mkdirSync(join(t, "cfg"));
  copyFileSync(join(ROOT, "tmux.conf"), join(t, "cfg/tmux.conf"));
  const record = join(t, "record");
  // Stand-in claude: records where and how it ran, then exits (ending the tmux session).
  writeFileSync(join(t, "bin/claude"), `#!/usr/bin/env bash
{ echo "pwd=$PWD"; echo "tmux=\${TMUX:+yes}"; [ -n "$TMUX" ] && echo "session=$(tmux display-message -p '#S')"
  echo "COLORTERM=\${COLORTERM:-}"; for a in "$@"; do echo "arg=[$a]"; done; echo ---; } >> ${JSON.stringify(record)}
`);
  chmodSync(join(t, "bin/claude"), 0o755);
  const sock = `away-wraptest-${shell}-${process.pid}`;
  sockets.push(sock);
  return { t, dir, record, sock };
}

function runInteractive(shell: string, s: ReturnType<typeof setup>, body: string) {
  const script = join(s.t, "run.sh");
  writeFileSync(script, `source ${JSON.stringify(join(ROOT, "shell/claude.sh"))}\ncd ${JSON.stringify(s.dir)}\n${body}\n`);
  const env: Record<string, string> = { ...process.env as any, PATH: `${join(s.t, "bin")}:${process.env.PATH}`, AWAY_TMUX_SOCKET: s.sock, AWAY_CONFIG_DIR: join(s.t, "cfg"), COLORTERM: "truecolor", TERM: "xterm-256color" };
  delete env.TMUX; delete env.TMUX_PANE;
  const flag = shell === "zsh" ? "-f" : "--norc";
  Bun.spawnSync(["script", "-qec", `${shell} ${flag} ${script}`, "/dev/null"], { env, stdout: "ignore", stderr: "ignore", timeout: 20_000 });
}
const records = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : "").split("---\n").filter(Boolean).map((b) => {
  const lines = b.trim().split("\n");
  const get = (k: string) => lines.find((l) => l.startsWith(k + "="))?.slice(k.length + 1) ?? "";
  return { pwd: get("pwd"), tmux: get("tmux") === "yes", session: get("session"), colorterm: get("COLORTERM"), args: lines.filter((l) => l.startsWith("arg=")).map((l) => l.slice(5, -1)) };
});

describe.skipIf(!ready || !shells.length)("claude wrapper (bash/zsh)", () => {
  for (const shell of shells) {
    test(`${shell}: runs claude in tmux with args, folder and env intact`, () => {
      const s = setup(shell);
      runInteractive(shell, s, `claude --model sonnet "it's a \\"quoted\\" \\$HOME & stuff"`);
      const [r] = records(s.record);
      expect(r).toMatchObject({ pwd: s.dir, tmux: true, session: "cc-my-project-v2", colorterm: "truecolor" });
      expect(r.args).toEqual(["--model", "sonnet", `it's a "quoted" $HOME & stuff`]);
    });

    test(`${shell}: picks a free session name`, () => {
      const s = setup(shell);
      runInteractive(shell, s, `tmux -L ${s.sock} -f "$AWAY_CONFIG_DIR/tmux.conf" new-session -d -s cc-my-project-v2 -- sleep 15\nclaude second`);
      expect(records(s.record)[0].session).toBe("cc-my-project-v2-2");
    });

    test(`${shell}: print/version/subcommands bypass tmux`, () => {
      const s = setup(shell);
      runInteractive(shell, s, `claude -p "print mode"\nclaude --version\nclaude mcp list`);
      const r = records(s.record);
      expect(r.map((x) => x.tmux)).toEqual([false, false, false]);
      expect(r.map((x) => x.args[0])).toEqual(["-p", "--version", "mcp"]);
    });

    test(`${shell}: no terminal (scripts, pipes) bypasses tmux`, () => {
      const s = setup(shell);
      const env: Record<string, string> = { ...process.env as any, PATH: `${join(s.t, "bin")}:${process.env.PATH}`, AWAY_TMUX_SOCKET: s.sock };
      delete env.TMUX;
      Bun.spawnSync([shell, "-c", `source ${JSON.stringify(join(ROOT, "shell/claude.sh"))}; claude from-a-script`], { env, stdin: "ignore", timeout: 10_000 });
      const [r] = records(s.record);
      expect(r).toMatchObject({ tmux: false, args: ["from-a-script"] });
    });
  }
});
