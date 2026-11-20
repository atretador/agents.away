// The Changes tab runs git in folders an agent (or a downloaded archive) controls: the repo's own
// .git/config must never get to run commands.
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { gitChanges } from "../src/extras";

const git = (cwd: string, ...a: string[]) => Bun.spawnSync(["git", "-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd });

function evilRepo() {
  const t = mkdtempSync(join(process.env.AWAY_TEST_ROOT!, "git-"));
  const r = join(t, "repo");
  Bun.spawnSync(["git", "init", "-q", r]);
  writeFileSync(join(r, "f"), "a\n"); git(r, "add", "f"); git(r, "commit", "-qm", "init");
  writeFileSync(join(r, "f"), "a\nb\n"); writeFileSync(join(r, "u.txt"), "new\n");
  writeFileSync(join(r, ".gitattributes"), "* diff=evil filter=evil\n");
  const pwn = (n: string) => `touch ${JSON.stringify(join(t, "PWNED-" + n))}; cat`;
  git(r, "config", "core.fsmonitor", pwn("fsmonitor") + "; false");
  git(r, "config", "diff.evil.textconv", pwn("textconv"));
  git(r, "config", "diff.evil.command", pwn("diffcmd"));
  git(r, "config", "filter.evil.clean", pwn("clean"));
  git(r, "config", "filter.evil.smudge", pwn("smudge"));
  const ran = () => ["fsmonitor", "textconv", "diffcmd", "clean", "smudge", "process"].filter((n) => existsSync(join(t, "PWNED-" + n)));
  return { r, pwn, ran };
}

test("repo-local fsmonitor, diff drivers, textconv and filters don't run", async () => {
  const { r, ran } = evilRepo();
  const res: any = await gitChanges(r);
  expect(res.repo).toBe(true);
  expect(res.files.map((f: any) => f.path).sort()).toEqual([".gitattributes", "f", "u.txt"]);
  expect(res.diff).toContain("+b");
  expect(ran()).toEqual([]);
});

test("a repo with a filter process is refused", async () => {
  const { r, pwn, ran } = evilRepo();
  git(r, "config", "filter.evil.process", pwn("process"));
  const res: any = await gitChanges(r);
  expect(res.repo).toBe(false);
  expect(res.error).toContain("filter process");
  expect(ran()).toEqual([]);
});
