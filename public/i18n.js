// Phone UI translations. Keys are the English text itself, so app.js stays readable and a missing
// translation falls back to English. The language is fixed for the page's lifetime (changing it reloads).
import es from "/i18n/es.js";
import ptBR from "/i18n/pt-BR.js";

const DICTS = { en: {}, es, "pt-BR": ptBR };
/** [pref key, label]: labels are each language's own name. */
export const LANGS = [["auto", "Auto"], ["en", "English"], ["es", "Español"], ["pt-BR", "Português"]];

export function langPref() {
  try { const v = localStorage.getItem("away.lang"); if (v && (v === "auto" || DICTS[v])) return v; } catch {}
  return "auto";
}
export function setLang(v) { try { localStorage.setItem("away.lang", v); } catch {} }

function detect() {
  for (const l of navigator.languages ?? [navigator.language ?? "en"]) {
    const x = String(l).toLowerCase();
    if (x.startsWith("es")) return "es";
    if (x.startsWith("pt")) return "pt-BR";
    if (x.startsWith("en")) return "en";
  }
  return "en";
}
const pref = langPref();
export const LANG = pref === "auto" ? detect() : pref;
document.documentElement.lang = LANG;
const D = DICTS[LANG];
const plural = new Intl.PluralRules(LANG);

const fill = (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s);
/** tr("Text {name}", {name}) — values are inserted as given (escape them first when the result is HTML). */
export const tr = (s, v) => fill(D[s] ?? s, v);
/** trn(n, "{n} file", "{n} files"): the form this language uses for n; {n} is filled in. */
export const trn = (n, one, other, v) => tr(plural.select(n) === "one" ? one : other, { n, ...v });
