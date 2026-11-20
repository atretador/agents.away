import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { i18nKeys, dynamicCalls } from "../tools/i18n-keys";
import es from "../public/i18n/es.js";
import ptBR from "../public/i18n/pt-BR.js";

const DICTS: Record<string, Record<string, string>> = { es, "pt-BR": ptBR };
const keys = i18nKeys();
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?[a-z]+/g)].map((m) => m[0]).sort();

describe("phone app translations", () => {
  test("finds the keys", () => expect(keys.length).toBeGreaterThan(300));
  test("every tr() / trn() call has a literal key", () => expect(dynamicCalls()).toEqual([]));
  for (const [lang, dict] of Object.entries(DICTS)) {
    test(`${lang}: covers every key`, () => expect(keys.filter((k) => !(k in dict))).toEqual([]));
    test(`${lang}: no stale keys`, () => expect(Object.keys(dict).filter((k) => !keys.includes(k))).toEqual([]));
    test(`${lang}: same placeholders and HTML tags as the English`, () => {
      const bad = Object.entries(dict).filter(([k, v]) => vars(k).join() !== vars(v).join() || tags(k).join() !== tags(v).join());
      expect(bad).toEqual([]);
    });
  }
});

describe("setup pages", () => {
  const src = readFileSync(join(import.meta.dir, "../public/page-i18n.js"), "utf8");
  const used = ["onboard.html", "unpaired.html"].flatMap((f) =>
    [...readFileSync(join(import.meta.dir, "../public", f), "utf8").matchAll(/<(\w+)[^>]*data-i18n="(\w+)"/g)].map((m) => ({ tag: m[1].toUpperCase(), key: m[2] })));
  /** Runs page-i18n.js against fake elements for a phone set to `languages`; returns what it wrote. */
  const run = (languages: string[], stored: string | null = null) => {
    const els = used.map(({ tag, key }) => ({ tagName: tag, dataset: { i18n: key }, innerHTML: null as string | null }));
    const doc = { title: "", documentElement: { lang: "en" }, querySelectorAll: () => els };
    new Function("document", "navigator", "localStorage", src)(doc, { languages }, { getItem: () => stored });
    return { doc, els };
  };
  for (const lang of ["es", "pt-BR"]) {
    test(`${lang}: translates every data-i18n element`, () => {
      const { doc, els } = run([lang === "es" ? "es-MX" : "pt-BR", "en"]);
      expect(doc.documentElement.lang).toBe(lang);
      expect(els.filter((e) => e.tagName !== "TITLE" && !e.innerHTML).map((e) => e.dataset.i18n)).toEqual([]);
      expect(doc.title).not.toBe("");
    });
  }
  test("English phones and an English choice keep the page as written", () => {
    expect(run(["en-US", "es"]).els.every((e) => e.innerHTML === null)).toBe(true);
    expect(run(["es"], "en").els.every((e) => e.innerHTML === null)).toBe(true);
  });
});
