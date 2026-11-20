// Lists every translation key used by the phone app: the string literals passed to tr() and trn().
// Used by tests/i18n.test.ts; run `bun tools/i18n-keys.ts` to print them.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
export function i18nKeys(file = join(import.meta.dir, "../public/app.js")): string[] {
  const src = readFileSync(file, "utf8");
  const keys = new Set<string>();
  const un = (s: string) => JSON.parse(`"${s}"`) as string;
  for (const m of src.matchAll(new RegExp(String.raw`\btr\(\s*` + STR, "g"))) keys.add(un(m[1]));
  for (const m of src.matchAll(new RegExp(String.raw`\btrn\([^,]+,\s*` + STR + String.raw`\s*,\s*` + STR, "g"))) { keys.add(un(m[1])); keys.add(un(m[2])); }
  return [...keys];
}
/** tr() calls whose first argument isn't a string literal: their keys can't be checked. */
export function dynamicCalls(file = join(import.meta.dir, "../public/app.js")): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(/\btrn?\(\s*([^"\s])[^\n]{0,40}/g)].map((m) => m[0]).filter((c) => !/^trn\(/.test(c) || !/^trn\([^,]+,\s*"/.test(c));
}
if (import.meta.main) { for (const k of i18nKeys()) console.log(JSON.stringify(k)); console.error(dynamicCalls()); }
