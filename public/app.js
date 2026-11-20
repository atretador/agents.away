import { marked } from "/vendor/marked.js";
import DOMPurify from "/vendor/purify.js";
import { AnsiUp } from "/vendor/ansi_up.js";

marked.setOptions({ gfm: true, breaks: false });
const ansi = new AnsiUp();
ansi.use_classes = false;
ansi.escape_html = true;

// ───────── icons ─────────
const I = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  term: '<path d="M4 17l6-6-6-6M12 19h8"/>',
  keys: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  wrap: '<path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4M3 18h7"/><path d="M16 16l-2 2 2 2"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  git: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 5.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  pin: '<path d="M12 17v5M9 3h6l-1 6 4 4H6l4-4z"/>',
  mute: '<path d="M13.73 21a2 2 0 0 1-3.46 0M18.63 13A17.9 17.9 0 0 1 18 8M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.33-5M2 2l20 20"/>',
  zap: '<path d="M13 2L3 14h9l-1 8 10-12h-9z"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><path d="M12 2v10"/>',
  broom: '<path d="m13 11 8.5-8.5"/><path d="M4.5 13.5 10.5 19.5"/><path d="M14.4 9.6a2 2 0 0 1 0 2.8L12 14.8 9.2 12l2.4-2.4a2 2 0 0 1 2.8 0Z"/><path d="M9.2 12 4 13.4c-.7.2-1 .9-.7 1.5.9 1.9 2.4 3.6 4.3 4.7.6.3 1.3 0 1.5-.6L10.6 14.8"/><path d="m6.5 16.6 1.4-1.4"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

// ───────── helpers ─────────
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Markdown from transcripts is model output: no styles, forms or external images (a prompt-injected reply
// could restyle the app, fake a form or leak data through an image URL).
const MD_OPTS = { FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "option", "iframe", "object", "embed", "svg", "math"], FORBID_ATTR: ["style", "action", "formaction"] };
const md = (s) => {
  const frag = DOMPurify.sanitize(marked.parse(s ?? ""), { ...MD_OPTS, RETURN_DOM_FRAGMENT: true });
  frag.querySelectorAll("img").forEach((img) => { if (!/^(\/|data:image\/|blob:)/.test(img.getAttribute("src") ?? "")) img.replaceWith(Object.assign(document.createElement("span"), { textContent: img.alt ? `[image: ${img.alt}]` : "[image]" })); });
  frag.querySelectorAll("a[href]").forEach((a) => { a.target = "_blank"; a.rel = "noopener noreferrer"; });
  const box = document.createElement("div"); box.append(frag); return box.innerHTML;
};
function ago(t) {
  if (!t) return "";
  const s = (Date.now() - (typeof t === "string" ? Date.parse(t) : t)) / 1000;
  if (s < 45) return "now";
  if (s < 3600) return Math.round(s / 60) + "m";
  if (s < 86400) return Math.round(s / 3600) + "h";
  return Math.round(s / 86400) + "d";
}
let toastT;
// toast(msg, err) — or toast(msg, false, { label, run }) for a toast with an action button (e.g. Undo).
function toast(msg, err = false, action = null) {
  const t = $("#toast");
  t.textContent = msg;
  if (action) {
    const b = document.createElement("button");
    b.className = "toast-act"; b.textContent = action.label;
    b.onclick = () => { t.className = ""; action.run(); };
    t.append(b);
  }
  t.className = "show" + (err ? " err" : "") + (action ? " has-act" : "");
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.className = ""), action ? 6000 : 2600);
}
async function api(path, body, method) {
  const r = await fetch(path, {
    method: method ?? (body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-away": "1" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}
const vibrate = (n = 10) => navigator.vibrate?.(n);
/** Ask the server for a resized WebP (360 thumbs, 800 chat/notification, 1600 full view). */
const sized = (url, w) => url + (url.includes("?") ? "&" : "?") + "w=" + w;

// ───────── state ─────────
// ───────── appearance prefs (per phone) ─────────
const ACCENTS = {
  clay: ["#c8582e", "#e8794c"], ocean: ["#2f6fd0", "#6d9ff0"], moss: ["#2f8550", "#62c283"],
  violet: ["#7448d0", "#a88bf2"], rose: ["#c13a6b", "#ee7aa3"], slate: ["#4b5563", "#a5b0c0"],
};
// Themes: [key, label, preview bg, preview card, default accent]. "auto" follows the phone (Warm Light/Dark).
// Labels never use Anthropic's or OpenCode's names (trademarks); the keys stay for saved preferences.
const THEMES = [
  ["auto", "Auto", "linear-gradient(135deg,#f6f2ec 50%,#16130f 50%)", "", "#e8794c"],
  ["claude-light", "Warm Light", "#f6f2ec", "#fffdf9", "#c8582e"],
  ["claude-dark", "Warm Dark", "#16130f", "#221d17", "#e8794c"],
  ["light", "Light", "#f4f4f5", "#ffffff", "#2563eb"],
  ["dark", "Dark", "#121214", "#1e1e22", "#6ea8fe"],
  ["opencode", "Black", "#0a0a0a", "#141414", "#fab283"],
];
const PREF_DEFAULTS = { theme: "auto", accent: "auto", scale: 1, termSize: 12, termFit: false, v: 2 };
const prefs = (() => {
  let p;
  try { p = JSON.parse(localStorage.getItem("away.prefs") || "{}"); } catch { p = {}; }
  if (p.v !== 2) { // earlier names: light/dark/black were the warm themes; "clay" was simply the default accent
    p.theme = { light: "claude-light", dark: "claude-dark", black: "opencode" }[p.theme] ?? p.theme;
    if (!p.accent || p.accent === "clay") p.accent = "auto";
    p.v = 2;
  }
  if (!THEMES.some(([k]) => k === p.theme)) p.theme = "auto";
  return { ...PREF_DEFAULTS, ...p };
})();
function savePrefs() { try { localStorage.setItem("away.prefs", JSON.stringify(prefs)); } catch {} }
function applyPrefs() {
  const r = document.documentElement;
  if (prefs.theme === "auto") r.removeAttribute("data-theme");
  else r.setAttribute("data-theme", prefs.theme);
  if (ACCENTS[prefs.accent]) {
    const [l, d] = ACCENTS[prefs.accent];
    r.style.setProperty("--acc-l", l);
    r.style.setProperty("--acc-d", d);
  } else { r.style.removeProperty("--acc-l"); r.style.removeProperty("--acc-d"); } // the theme's own accent
  document.body.style.zoom = String(prefs.scale);
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", bg));
  });
  if ($("#term")) applyTermSize();
}

const S = {
  sessions: [], reviews: [], settings: {}, push: {}, host: "",
  connected: false,
  view: null, // {kind, id}
  chat: { id: null, items: [], start: 0, tools: new Map(), loadingOlder: false },
  mode: localStorage.getItem("away.mode") || "chat",
  termWrap: localStorage.getItem("away.termWrap") === "1",
  keysOpen: false,
  drafts: {},
  attach: {}, // sessionId -> [{path, url, name, type, loading}]
  slideIn: null, ended: null, lastQuery: "",
  chatCache: new Map(), // sessionId -> chat state with its rendered DOM node
};

// ───────── websocket ─────────
let ws, wsRetry = 0, pingT, swError = null;
function connect() {
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onopen = () => {
    wsRetry = 0; S.connected = true; updateConn();
    send({ type: "visible", visible: document.visibilityState === "visible" });
    if (S.view?.kind === "session") watch(S.view.id);
    clearInterval(pingT); pingT = setInterval(() => send({ type: "ping" }), 25000);
  };
  ws.onclose = (e) => {
    if (e.code === 4401) { location.reload(); return; } // this phone was signed out
    S.connected = false; updateConn(); clearInterval(pingT);
    setTimeout(connect, Math.min(8000, 400 * 2 ** wsRetry++));
  };
  ws.onmessage = (e) => onMsg(JSON.parse(e.data));
}
const send = (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));
function updateConn() { document.querySelectorAll(".conn").forEach((c) => c.classList.toggle("off", !S.connected)); }

document.addEventListener("visibilitychange", () => {
  const v = document.visibilityState === "visible";
  send({ type: "visible", visible: v });
  if (v) { loadState(); if (S.view?.kind === "session") watch(S.view.id); }
});

let myBuild = null;
function maybeReload() {
  // Don't yank the page while someone is typing.
  const busy = document.activeElement?.matches?.("textarea, input") && document.activeElement.value;
  if (busy) return setTimeout(maybeReload, 5000);
  navigator.serviceWorker?.getRegistration().then((r) => r?.update()).catch(() => {});
  location.reload();
}
function onMsg(m) {
  if (m.type === "build") {
    if (myBuild && m.build !== myBuild) maybeReload();
    myBuild ??= m.build;
    return;
  }
  if (m.type === "sessions") {
    S.sessions = m.sessions;
    if (S.view?.kind === "home") renderHome();
    if (S.view?.kind === "session") updateSessionChrome();
    if (S.view?.kind === "agent") updateAgentChrome();
  } else if (m.type === "reviews") {
    loadState();
  } else if (m.type === "chat") {
    const isCurrent = S.view?.kind === "session" && m.id === S.view.id;
    if (m.peek && !isCurrent) {
      // Prefetched neighbour: build it off-screen so swiping to it is instant.
      if (S.chatCache.get(m.id)?.end >= m.end) return;
      (window.requestIdleCallback ?? setTimeout)(() => {
        const st = newChatState(m.id);
        renderChatItems(st, m.items, { reset: true, start: m.start });
        st.end = m.end;
        cacheChat(st);
      });
      return;
    }
    if (!isCurrent || m.peek) return;
    if (m.reset) S.chat.end = 0;
    renderChatItems(S.chat, m.items, { reset: !!m.reset, start: m.start, current: true });
    if (m.end) S.chat.end = m.end;
    if (m.reset || m.resume) prefetchNeighbours(m.id);
  } else if (m.type === "queue" && S.chat?.id === m.id) {
    S.chat.queue.innerHTML = "";
    for (const t of m.items) { const q = queuedEl(t, S.chat); if (q) S.chat.queue.appendChild(q); }
  } else if (m.type === "older" && S.view?.kind === "session" && m.id === S.view.id) {
    prependItems(m.items, m.start);
  } else if (m.type === "term" && S.view?.kind === "session" && m.id === S.view.id) {
    if (m.oc) renderOcTerm(m); else renderTerm(m.screen);
  }
}

async function loadState() {
  try {
    const j = await api("/api/state");
    Object.assign(S, { sessions: j.sessions, reviews: j.reviews, settings: j.settings, push: j.push, host: j.host, version: j.version });
    if (S.view?.kind === "home") renderHome();
    if (S.view?.kind === "review") renderReview(S.view.id);
    if (S.view?.kind === "session") renderAlert(S.view.id);
  } catch (e) {
    if (/not paired/.test(e.message)) location.reload();
  }
}

// ───────── push ─────────
function b64ToU8(b) {
  const p = "=".repeat((4 - (b.length % 4)) % 4);
  const s = atob((b + p).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function pushStatus() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (swError) return "nosw";
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 1500))]);
  if (!reg) return swError ? "nosw" : "off";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}
async function enablePush() {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return toast("Notifications were blocked", true);
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(S.push.publicKey) });
    await api("/api/push/subscribe", { subscription: sub.toJSON() });
    toast("Notifications on");
    vibrate(20);
    rerender();
  } catch (e) { toast("Couldn't enable: " + e.message, true); }
}
async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await api("/api/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  toast("Notifications off");
  rerender();
}

// ───────── router ─────────
function route() {
  document.querySelectorAll(".lightbox").forEach((e) => e.remove());
  while (openSheets.length) openSheets[openSheets.length - 1].remove(false);
  const h = location.hash.replace(/^#\/?/, "");
  const [kind, id] = h.split("/");
  saveChatScroll();
  if (S.view?.kind === "session" && !(kind === "s" && id === S.view.id)) send({ type: "watch", id: null });
  if (kind === "s" && id) { S.view = { kind: "session", id }; renderSession(id); }
  else if (kind === "a" && id && h.split("/")[2]) { S.view = { kind: "agent", id, aid: h.split("/")[2] }; renderAgent(id, S.view.aid); }
  else if (kind === "review" && id) { S.view = { kind: "review", id }; renderReview(id); }
  else if (kind === "search") { S.view = { kind: "search" }; renderSearch(); }
  else { S.view = { kind: "home" }; renderHome(); }
  if (S.view.kind !== "session") window.scrollTo(0, 0); // sessions scroll themselves (to the newest message)
}
window.addEventListener("hashchange", route);
function rerender() { if (S.view?.kind === "home") { if (S.swiping) S.homeDirty = true; else renderHome(); } else if (S.view?.kind === "session") updateSessionChrome(); }

const app = $("#app");
window.addEventListener("scroll", () => $(".bar")?.classList.toggle("scrolled", scrollY > 4), { passive: true });

// ───────── home ─────────
const sname = (s) => s.customName || s.title || s.name;
function orderedSessions() {
  return [...S.sessions.filter((s) => s.status === "waiting"), ...S.sessions.filter((s) => s.status !== "waiting")];
}
const STATUS_LABEL = { working: "Working", waiting: "Needs you", idle: "Your turn" };
function sessionCard(s) {
  const when = s.status === "working" ? "" : ago(s.activityAt);
  const ask = s.status === "waiting" ? (s.ask ? askLine(s.ask) : s.prompt?.tool ? toolLine(s.prompt.tool) : s.prompt?.question || s.attention?.message) : null;
  const swipe = s.canReply;
  const oc = s.kind === "opencode";
  return `${swipe ? `<div class="swipe-wrap" data-sid="${esc(s.id)}"><div class="swipe-act"><span>${icon(oc ? "archive" : "power")}<b>${oc ? "Archive" : "End"}</b></span></div>` : ""}<a class="card s-card ${s.status}" href="#/s/${encodeURIComponent(s.id)}">
    <span class="dot ${s.status}"></span>
    <div class="t">${s.pinned ? `<span class="pin-ic">${icon("pin")}</span>` : ""}${esc(sname(s))}${s.muted ? `<span class="mute-ic">${icon("mute")}</span>` : ""}</div>
    <div class="when">${s.status === "working" ? `<span class="chip work">Working</span>` : esc(when)}</div>
    <div class="meta">
      ${s.status !== "working" ? `<span class="chip ${s.status === "waiting" ? "wait" : "ok"}">${STATUS_LABEL[s.status]}</span>` : ""}
      ${s.kind === "opencode" ? `<span class="chip oc">OpenCode</span>` : ""}
      ${s.canReply ? "" : `<span class="chip" title="Not in tmux">${icon("eye").replace("<svg", '<svg width="12" height="12"')} watch</span>`}
      <span class="path">${esc(s.home)}</span>
    </div>
    ${ask ? `<div class="ask">${esc(ask)}</div>` : ""}
  </a>${swipe ? "</div>" : ""}`;
}
// Swipe a session card left to end it without opening it.
(() => {
  let wrap = null, card = null, x0 = 0, y0 = 0, dx = 0, mode = null, armed = false, w = 1;
  let noClickUntil = 0;
  document.addEventListener("click", (e) => {
    if (Date.now() < noClickUntil && e.target.closest?.(".swipe-wrap")) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  const reset = () => { wrap = card = null; mode = null; S.swiping = false; if (S.homeDirty) { S.homeDirty = false; rerender(); } };
  document.addEventListener("touchstart", (e) => {
    const wr = e.target.closest?.(".swipe-wrap");
    if (!wr || S.view?.kind !== "home" || wr.classList.contains("ending")) return;
    wrap = wr; card = wr.querySelector(".s-card"); w = card.offsetWidth;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; mode = null; armed = false;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!wrap) return;
    const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
    if (!mode) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      mode = Math.abs(mx) > Math.abs(my) * 1.2 && mx < 0 ? "x" : "y";
      if (mode === "y") { wrap = null; return; }
      S.swiping = true; card.style.transition = "none"; wrap.classList.add("dragging");
    }
    dx = Math.min(0, mx);
    if (dx < -w * 0.35) dx = -w * 0.35 + (dx + w * 0.35) * 0.5; // resistance past the threshold
    card.style.transform = `translateX(${dx}px)`;
    const now = dx < -Math.min(140, w * 0.32);
    if (now !== armed) { armed = now; wrap.classList.toggle("armed", armed); if (armed) vibrate(12); }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (!wrap || mode !== "x") { reset(); return; }
    const wr = wrap, c = card, id = wr.dataset.sid;
    c.style.transition = "transform .22s ease";
    noClickUntil = Date.now() + 450; // the tap that may follow a drag shouldn't open the session
    wr.classList.remove("dragging");
    if (!armed) { c.style.transform = ""; wr.classList.remove("armed"); reset(); return; }
    const s = S.sessions.find((x) => x.id === id);
    if (s?.status === "working") { c.style.transform = ""; wr.classList.remove("armed"); reset(); openEnd(id); return; }
    c.style.transform = "translateX(-110%)";
    wr.classList.add("ending");
    vibrate(20);
    api(`/api/session/${id}/close`, {}).then((j) => {
      if (j.archived) {
        toast("Archived", false, { label: "Undo", run: () => api(`/api/session/${id}/unarchive`, {}).then(() => toast("Restored")).catch((e) => toast(e.message, true)) });
        return;
      }
      toast("Ending session…");
      setTimeout(() => {
        if (S.sessions.some((x) => x.id === id)) { toast("Still running — open it to force close", true); wr.classList.remove("ending", "armed"); c.style.transform = ""; }
      }, 5000);
    }).catch((err) => { toast(err.message, true); wr.classList.remove("ending", "armed"); c.style.transform = ""; });
    reset();
  };
  document.addEventListener("touchend", end);
  document.addEventListener("touchcancel", end);
})();

function reviewCard(r) {
  const img = r.media.find((m) => m.type.startsWith("image/"));
  const chip = r.status === "pending" ? '<span class="chip accent">Waiting for you</span>'
    : r.status === "withdrawn" ? '<span class="chip">Withdrawn</span>'
    : r.status === "dismissed" ? '<span class="chip">Dismissed</span>'
    : r.decision === "approved" ? '<span class="chip ok">Approved</span>'
    : r.decision === "rejected" ? '<span class="chip bad">Rejected</span>' : '<span class="chip wait">Changes</span>';
  return `<a class="card r-card" href="#/review/${encodeURIComponent(r.id)}">
    <div class="thumb" ${img ? `style="background-image:url('${sized(img.url, 360)}')"` : ""}>${img ? "" : icon("image")}</div>
    <div><div class="t">${esc(r.title)}</div>${r.message ? `<div class="m">${esc(r.message)}</div>` : ""}
    <div class="meta">${chip}<span>${r.media.length > 1 ? r.media.length + " files · " : ""}${ago(r.createdAt)}</span></div></div>
  </a>`;
}

async function renderHome() {
  const waiting = S.sessions.filter((s) => s.status === "waiting");
  const others = S.sessions.filter((s) => s.status !== "waiting");
  const pending = S.reviews.filter((r) => r.status === "pending");
  const answered = S.reviews.filter((r) => r.status !== "pending").slice(0, 8);
  const ps = await pushStatus();
  if (S.view?.kind !== "home") return; // navigated away while waiting — don't paint over the new page
  const y = scrollY;
  app.innerHTML = `
    <header class="bar">
      <div class="brand grow"><img src="/icons/icon.svg" alt="">Agents Away <span class="conn ${S.connected ? "" : "off"}"></span></div>
      <a class="icon-btn" href="#/search" aria-label="Search">${icon("search")}</a>
      <button class="icon-btn" id="settings" aria-label="Settings">${icon("gear")}</button>
    </header>
    <main class="page">
      ${ps === "off" ? `<div class="banner">${icon("bell")}<div class="grow"><b>Get notified</b>When a session needs you, finishes, or sends something to review.</div><button class="btn primary" id="enable">Turn on</button></div>` : ""}
      ${ps === "nosw" ? `<div class="banner">${icon("alert")}<div class="grow"><b>Certificate not trusted</b>Notifications need the Agents Away certificate installed on this phone. Open <code>http://${esc(location.hostname)}:7440</code> for the steps.</div></div>` : ""}
      ${ps === "unsupported" ? `<div class="banner">${icon("alert")}<div class="grow"><b>Install for notifications</b>Add Agents Away to your home screen (browser menu → Add to Home screen), then open it from there.</div></div>` : ""}
      ${waiting.length || pending.length ? `<div class="section-h"><h2>Needs you</h2></div><div class="stack">${waiting.map(sessionCard).join("")}${pending.map(reviewCard).join("")}</div>` : ""}
      <div class="section-h"><h2>Sessions</h2><span class="count">${S.sessions.length || ""}</span></div>
      <div class="stack">${others.map(sessionCard).join("") || (waiting.length ? "" : `<div class="empty"><b>No sessions running</b>Start one with the button below, or run <code>claude</code> on the PC.</div>`)}</div>
      ${answered.length ? `<div class="section-h"><h2>Reviewed</h2><button class="icon-btn sec-act" id="clear-reviewed" aria-label="Clear review history" title="Clear review history">${icon("broom")}</button></div><div class="stack">${answered.map(reviewCard).join("")}</div>` : ""}
    </main>
    <button class="fab" id="new">${icon("plus")} New session</button>`;
  window.scrollTo(0, y);
  $("#enable")?.addEventListener("click", enablePush);
  $("#settings").onclick = openSettings;
  $("#new").onclick = openNew;
  $("#clear-reviewed")?.addEventListener("click", async () => {
    const n = S.reviews.filter((r) => r.status !== "pending").length;
    if (!(await ask("Clear review history?", `Deletes ${n} reviewed item${n === 1 ? "" : "s"} and their images. Reviews still waiting for you are kept.`, "Clear", true))) return;
    try {
      const j = await api("/api/reviews/clear", {});
      S.reviews = S.reviews.filter((r) => r.status === "pending");
      renderHome(); vibrate(15); toast(`Cleared ${j.deleted}`);
    } catch (e) { toast(e.message, true); }
  });
}

// ───────── session view ─────────
function cur() { return S.sessions.find((s) => s.id === S.view?.id); }

function watch(id) {
  const from = S.mode === "chat" && S.chat?.id === id ? S.chat.end : 0;
  send({ type: "watch", id, chat: S.mode === "chat", term: S.mode === "term", from });
}
const HOME_VIEW = "home";

function newChatState(id) {
  const node = document.createElement("div");
  node.className = "chat";
  const queue = document.createElement("div");
  queue.className = "queue-box";
  node.appendChild(queue);
  return { id, start: 0, end: 0, tools: new Map(), loadingOlder: false, node, queue, y: null };
}
function cacheChat(st) {
  S.chatCache.delete(st.id);
  S.chatCache.set(st.id, st);
  while (S.chatCache.size > 8) S.chatCache.delete(S.chatCache.keys().next().value);
}
function prefetchNeighbours(id) {
  const n = neighbours(id);
  for (const s of [n.next, n.prev]) if (s && !S.chatCache.has(s.id)) send({ type: "peek", id: s.id });
}
// Remember where you were in a chat only when you leave it (scroll events during redraws are noise).
function saveChatScroll() {
  if (S.view?.kind === "session" && S.mode === "chat" && S.chat && $("#chat")) S.chat.y = nearBottom() ? null : scrollY;
}

function renderSession(id) {
  S.chat = S.chatCache.get(id) ?? newChatState(id);
  cacheChat(S.chat);
  app.innerHTML = `
    <div class="top">
    <header class="bar">
      <button class="icon-btn" id="back" aria-label="Back">${icon("back")}</button>
      <div class="grow"><div class="bar-title" id="s-title"></div><div class="bar-sub" id="s-sub"></div></div>
      <button class="icon-btn" id="morebtn" aria-label="Session options">${icon("more")}</button>
    </header>
    <div class="subbar">
      <div class="seg" role="tablist">
        <button data-mode="chat">${icon("chat")}<span>Chat</span></button>
        <button data-mode="changes">${icon("git")}<span>Changes</span></button>
        <button data-mode="term">${icon("term")}<span>Terminal</span></button>
      </div>
      <button class="alert-btn" id="alertbtn" hidden aria-label="Pending actions"></button>
      <button class="hd-ctx" id="ctxbtn" hidden></button>
      <button class="hd-agents" id="agentsbtn" hidden></button>
      <div class="sub-right"><div class="pager" id="pager"></div><div class="sub-model" id="s-model"></div></div>
    </div>
    </div>
    <div id="body" style="flex:1;display:flex;flex-direction:column"></div>
    <div class="dock"><div class="dock-inner" id="dock"></div></div>`;
  $("#back").onclick = () => (history.length > 1 ? history.back() : (nav("#/")));
  app.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $("#morebtn").onclick = () => openSessionMenu(id);
  $("#ctxbtn").onclick = () => openContextInfo(id);
  $("#agentsbtn").onclick = () => openAgents(id);
  $("#alertbtn").onclick = () => openPending(id);
  setupSwipe(id);
  if (S.slideIn) { $("#body").classList.add("slide-in-" + S.slideIn); S.slideIn = null; }
  setMode(S.mode, true);
  updateSessionChrome();
  if (!cur()) loadEndedInfo(id);
}

// swipe left/right to move between sessions
function neighbours(id) {
  const list = orderedSessions();
  const i = list.findIndex((s) => s.id === id);
  // Wraps around: swiping past the last session goes to the first, and vice versa.
  if (i < 0 || list.length < 2) return { list, i, prev: null, next: null };
  return { list, i, prev: list[(i - 1 + list.length) % list.length], next: list[(i + 1) % list.length] };
}
function goSession(target, dir) {
  if (!target) { vibrate(4); return; }
  S.slideIn = dir;
  vibrate(8);
  location.replace("#/s/" + target.id);
}
function scrollsSideways(el) {
  for (; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}
function setupSwipe(id) {
  const body = $("#body");
  let x0 = 0, y0 = 0, t0 = 0, ok = false, dx = 0;
  body.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    ok = e.touches.length === 1 && t.clientX > 24 && t.clientX < innerWidth - 24 && !scrollsSideways(e.target) && !getSelection()?.toString();
    x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); dx = 0;
  }, { passive: true });
  body.addEventListener("touchmove", (e) => {
    if (!ok) return;
    const t = e.touches[0];
    dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) { ok = false; body.style.transform = ""; return; }
    if (Math.abs(dx) > 12) body.style.transform = `translateX(${dx * 0.35}px)`;
  }, { passive: true });
  body.addEventListener("touchend", () => {
    body.style.transition = "transform .18s"; body.style.transform = "";
    setTimeout(() => (body.style.transition = ""), 200);
    if (!ok) return;
    const fast = Date.now() - t0 < 350 && Math.abs(dx) > 50;
    if (Math.abs(dx) < 90 && !fast) return;
    const n = neighbours(id);
    if (dx < 0) goSession(n.next, "right"); else goSession(n.prev, "left");
  });
}
function renderPager(id) {
  const el = $("#pager");
  if (!el) return;
  requestAnimationFrame(fitSubbar);
  const n = neighbours(id);
  if (n.i < 0 || n.list.length < 2) { el.innerHTML = ""; return; }
  el.innerHTML = n.list.length <= 7
    ? n.list.map((s, i) => `<i class="${i === n.i ? "on" : ""} ${s.status}"></i>`).join("")
    : `<span>${n.i + 1} / ${n.list.length}</span>`;
}

function setMode(mode, initial = false) {
  if (!initial) saveChatScroll();
  setTimeout(updateNewest, 120);
  S.mode = mode;
  localStorage.setItem("away.mode", mode);
  app.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
  const body = $("#body");
  if (mode === "chat") {
    body.innerHTML = "";
    const st = S.chat;
    st.node.id = "chat";
    if (!st.end) {
      st.node.querySelectorAll(":scope > :not(.queue-box)").forEach((e) => e.remove());
      st.node.insertAdjacentHTML("afterbegin", `<div class="muted loading-msg" style="text-align:center;padding:30px">Loading…</div>`);
    }
    body.appendChild(st.node);
    const y = st.y;
    st.y = null;
    if (st.end) { requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y ?? document.documentElement.scrollHeight))); if (y == null) pinToBottom(); }
  } else if (mode === "changes") {
    body.innerHTML = `<div class="changes" id="changes"><div class="muted" style="text-align:center;padding:30px">Reading git changes…</div></div>`;
    loadChanges(S.view.id);
  } else {
    body.innerHTML = `<div class="term-wrap" id="termwrap"><pre class="term ${S.termWrap ? "wrap" : ""}" id="term"></pre></div>
      <div class="term-tools">
        <button id="t-minus" aria-label="Smaller text">A−</button>
        <button id="t-plus" aria-label="Larger text">A+</button>
        <button id="t-fit" class="${prefs.termFit ? "on" : ""}" aria-label="Fit width">${icon("fit")}</button>
        <button id="t-wrap" class="${S.termWrap ? "on" : ""}" aria-label="Wrap lines">${icon("wrap")}</button>
      </div>`;
    $("#t-wrap").onclick = toggleWrap;
    $("#t-fit").onclick = () => { prefs.termFit = !prefs.termFit; savePrefs(); $("#t-fit").classList.toggle("on", prefs.termFit); applyTermSize(); toast(prefs.termFit ? "Fitting the terminal to the screen" : `Text size ${prefs.termSize}px`); };
    $("#t-minus").onclick = () => bumpTerm(-1);
    $("#t-plus").onclick = () => bumpTerm(1);
    applyTermSize();
  }
  if (!initial || S.connected) watch(S.view.id);
  if (!initial && cur()?.kind === "opencode") renderDock(cur());
  requestAnimationFrame(fitSubbar);
}

function updateSessionChrome() {
  S.syncSend?.();
  document.querySelectorAll(".waits").forEach((w) => renderWaits(w));
  const s = cur();
  const t = $("#s-title"), sub = $("#s-sub");
  if (!t) return;
  renderAlert(S.view.id);
  renderPager(S.view.id);
  if (!s) {
    if (!S.ended || S.ended.id !== S.view.id) { t.textContent = "Past session"; sub.innerHTML = ""; }
    if (!$("#resumebtn")) {
      $("#dock").innerHTML = `<div class="watch-only" style="display:flex;gap:12px;align-items:center"><div class="grow" style="flex:1">This session isn't running. Resume it to continue the conversation.</div><button class="btn primary" id="resumebtn">Resume</button></div>`;
      $("#resumebtn").onclick = async () => {
        const info = S.ended?.id === S.view.id ? S.ended : await api(`/api/session/${S.view.id}/info`).catch(() => null);
        if (!info?.cwd) return toast("Don't know which folder it ran in", true);
        if (!(await ask("Resume this session?", "It opens in a new terminal on the PC. Make sure it isn't still open somewhere.", "Resume"))) return;
        try { await api("/api/new", { cwd: info.cwd, resume: S.view.id, ...launchBody() }); toast("Resuming… it will appear on the home screen"); nav("#/"); }
        catch (e) { toast(e.message, true); }
      };
    }
    lastDockKey = "";
    return;
  }
  t.textContent = sname(s);
  sub.innerHTML = `<span class="dot ${s.status}" style="width:7px;height:7px"></span>${STATUS_LABEL[s.status]} · ${s.kind === "opencode" ? `<b class="oc-tag">OpenCode${s.agentName ? " · " + esc(s.agentName) : ""}</b> · ` : ""}${esc(s.home)}`;
  renderDock(s);
  renderTyping(s);
  renderHeadExtras(s);
  if (prefs.termFit) applyTermSize();
}

function renderTyping(s) {
  const chat = $("#chat");
  if (!chat || S.chat?.id !== s.id) return;
  let el = $("#typing");
  if (s.status === "working") {
    if (!el) { el = document.createElement("div"); el.id = "typing"; el.className = "typing"; el.innerHTML = "<i></i><i></i><i></i> Working"; }
    chat.appendChild(el);
  } else el?.remove();
}

// ───────── AskUserQuestion card (Claude Code) ─────────
// s.ask = {questions: [{question, header, multiSelect, options: [{label, description}]}], current, partial, tabs}.
// partial: only the question on screen is known (no PreToolUse hook data), so it's answered on its own.
const askSel = new Map(); // session + questions -> {pick: [[n…]], other: [text], on: [bool]}
const askLine = (a) => `Claude is asking: ${(a.questions[a.current] ?? a.questions[0]).question}`;
function askState(s) {
  const k = s.id + "|" + s.ask.questions.map((q) => q.question).join("|");
  if (!askSel.has(k)) askSel.set(k, { k, pick: s.ask.questions.map(() => []), other: s.ask.questions.map(() => ""), on: s.ask.questions.map(() => false) });
  return askSel.get(k);
}
const askDone = (q, st, i) => (st.on[i] ? !!st.other[i].trim() : st.pick[i].length > 0);
function askCard(s) {
  const a = s.ask, st = askState(s), many = !a.partial && a.questions.length > 1;
  const qs = a.questions.map((q, i) => {
    const type = q.multiSelect ? "checkbox" : "radio";
    const opt = (n, label, desc) => `<label class="ask-o"><input type="${type}" name="aq${i}" value="${n}" ${st.pick[i].includes(n) ? "checked" : ""}><span><b>${esc(label)}</b>${desc ? `<small>${esc(desc)}</small>` : ""}</span></label>`;
    return `<div class="ask-q" data-q="${i}">
      ${q.header || q.multiSelect ? `<div class="ask-h">${q.header ? `<span class="chip wait">${esc(q.header)}</span>` : ""}${q.multiSelect ? `<span>Pick any</span>` : ""}</div>` : ""}
      <div class="ask-t">${esc(q.question)}</div>
      ${q.options.map((o, j) => opt(j + 1, o.label, o.description)).join("")}
      <label class="ask-o"><input type="${type}" name="aq${i}" value="other" ${st.on[i] ? "checked" : ""}><span><b>Other…</b><input type="text" class="ask-other" data-q="${i}" placeholder="Type your own answer" value="${esc(st.other[i])}" enterkeyhint="done"></span></label>
    </div>`;
  }).join("");
  const rest = a.partial && a.tabs.length > 1 ? `<div class="ask-note">One of ${a.tabs.length} questions — the next one shows here after you answer.</div>` : "";
  return `<div class="prompt-card ask-card">
    <div class="q">${icon("chat")}<span>${many ? `Claude has ${a.questions.length} questions` : "Claude is asking"}</span></div>
    <div class="ask-qs">${qs}</div>${rest}
    ${s.canReply ? `<button class="btn primary block ask-go" id="askgo">${icon("send")} ${many ? "Send answers" : "Send answer"}</button>` : ""}
  </div>`;
}
function wireAsk(dock, s) {
  const st = askState(s), go = dock.querySelector("#askgo");
  const sync = () => { if (go && !go.dataset.busy) go.disabled = !s.ask.questions.every((q, i) => askDone(q, st, i)); };
  dock.querySelectorAll(".ask-q").forEach((box) => {
    const i = +box.dataset.q;
    const read = () => {
      const ins = [...box.querySelectorAll(`input[name="aq${i}"]`)];
      st.pick[i] = ins.filter((x) => x.checked && x.value !== "other").map((x) => +x.value);
      st.on[i] = ins.some((x) => x.checked && x.value === "other");
      sync();
    };
    box.querySelectorAll(`input[name="aq${i}"]`).forEach((x) => (x.onchange = () => { vibrate(6); read(); }));
    const t = box.querySelector(".ask-other"), ot = box.querySelector('input[value="other"]');
    t.oninput = () => {
      st.other[i] = t.value;
      if (t.value.trim() && !ot.checked) { ot.checked = true; read(); } else sync();
    };
    t.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); t.blur(); } };
  });
  sync();
  if (!go) return;
  go.onclick = async () => {
    const answers = s.ask.questions.map((q, i) => ({ pick: q.multiSelect || !st.on[i] ? st.pick[i] : [], other: st.on[i] ? st.other[i].trim() : undefined }));
    go.disabled = true; go.dataset.busy = "1"; go.innerHTML = `${icon("send")} Sending…`; vibrate();
    try { await api(`/api/session/${s.id}/ask`, { answers }); askSel.delete(st.k); toast("Sent"); }
    catch (e) { toast(e.message, true); delete go.dataset.busy; go.innerHTML = `${icon("send")} Try again`; sync(); }
  };
}

let lastDockKey = "";
const primaryOpt = (p) => p.options.find((o) => /^yes\b/i.test(o.label))?.n ?? 1;
function renderDock(s) {
  const dock = $("#dock");
  const ocTerm = s.kind === "opencode" && S.mode === "term"; // OpenCode Terminal tab: the composer types into its terminal
  const key = JSON.stringify([s.id, s.canReply, s.prompt, s.ask, s.attention?.message, S.keysOpen, ocTerm, s.canBackground]);
  if (key === lastDockKey && dock.childElementCount) return;
  lastDockKey = key;
  const draft = $("#msg")?.value ?? S.drafts[s.id] ?? "";
  let html = "";
  if (s.ask) html += askCard(s);
  if (s.prompt?.form) html += ocFormCard(s);
  else if (s.prompt) {
    const p = s.prompt;
    html += `<div class="prompt-card">
      <div class="q">${icon("alert")}<span>${esc(p.question)}</span></div>
      ${p.tool ? toolView(p.tool) : p.context.length ? `<pre class="ctx">${esc(p.context.join("\n"))}</pre>` : ""}
      ${s.canReply ? `<div class="opts">${p.options.map((o) => `<button class="btn ${o.n === primaryOpt(p) ? "primary" : ""}" data-opt="${o.n}"><span class="n">${o.n}</span>${esc(o.label)}</button>`).join("")}</div>` : ""}
    </div>`;
  } else if (s.attention) {
    html += `<div class="prompt-card"><div class="q">${icon("alert")}<span>${esc(s.attention.message)}</span></div></div>`;
  }
  if (s.canReply && s.canBackground) {
    html += `<div class="bg-bar"><button class="btn" id="bgbtn">${icon("down")} Run in background</button><span class="muted">The command keeps running; Claude carries on.</span></div>`;
  }
  if (!s.canReply) {
    html += `<div class="watch-only"><b>Watch-only.</b> This session was started outside tmux, so Agents Away can show it but can't type into it. To reply from here: exit it on the PC and resume it from <b>New session → Resume</b>, or run <code>claude --resume</code> again (new sessions go through tmux automatically).</div>`;
  } else {
    html += `${S.keysOpen ? `<div class="keys"><button id="palbtn" class="accent-key">${icon("zap")} ${s.kind === "opencode" ? "Quick replies" : "Commands"}</button>${(s.kind === "opencode" && !ocTerm ? [["Esc — interrupt", "Escape"]] : [
      ["Esc", "Escape"], ["⏎", "Enter"], ["↑", "Up"], ["↓", "Down"], ["Tab", "Tab"], ["⇧Tab", "BTab"], ["^C", "C-c"], ["^O", "C-o"], ["1", "1"], ["2", "2"], ["3", "3"], ["y", "y"], ["n", "n"],
    ]).map(([l, k]) => `<button data-key="${k}">${l}</button>`).join("")}</div>` : ""}
    <div class="attachments" id="atts"></div>
    <div class="composer">
      <button class="icon-btn ${S.keysOpen ? "on" : ""}" id="kbtn" aria-label="Keys">${icon("keys")}</button>
      <button class="icon-btn" id="abtn" aria-label="Attach image or file">${icon("clip")}</button>
      <input type="file" id="afile" accept="image/*,application/pdf,text/*,.md,.json,.log,.csv" multiple hidden>
      <textarea id="msg" rows="1" placeholder="${ocTerm ? "Type into the terminal…" : `Message ${s.kind === "opencode" ? "OpenCode" : "Claude"}…`}" enterkeyhint="send"></textarea>
      <button class="icon-btn send" id="sendbtn" aria-label="Send" disabled>${icon("send")}</button>
    </div>`;
  }
  dock.innerHTML = html;
  if (s.prompt?.form) wireOcForm(s, dock);
  dock.querySelectorAll("[data-opt]").forEach((b) => (b.onclick = async () => {
    b.disabled = true; vibrate();
    try { await api(`/api/session/${encodeURIComponent(s.id)}/choose`, { n: +b.dataset.opt, key: s.prompt?.key ?? "" }); toast("Sent"); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  }));
  if (s.ask) wireAsk(dock, s);
  const bgb = $("#bgbtn");
  if (bgb) bgb.onclick = async () => {
    bgb.disabled = true; vibrate();
    try { await api(`/api/session/${encodeURIComponent(s.id)}/keys`, { keys: ["C-b"] }); toast("Moved to the background"); }
    catch (err) { toast(err.message, true); bgb.disabled = false; }
  };
  $("#palbtn") && ($("#palbtn").onclick = () => openPalette(s));
  dock.querySelectorAll("[data-key]").forEach((b) => (b.onclick = async () => {
    vibrate(6);
    try { await api(`/api/session/${s.id}/keys`, { keys: [b.dataset.key], ...(ocTerm ? { term: true } : {}) }); } catch (e) { toast(e.message, true); }
  }));
  const ta = $("#msg");
  if (!ta) return;
  ta.value = draft;
  const sb = $("#sendbtn");
  const atts = (S.attach[s.id] ??= []);
  const ready = () => atts.length && atts.every((a) => a.path);
  // Empty box while the agent is working → the send button becomes Stop (interrupts the current step).
  const stopMode = () => !ta.value.trim() && !atts.length && S.sessions.find((x) => x.id === s.id)?.status === "working";
  const syncSend = () => {
    if (!sb.isConnected) return;
    const stop = stopMode();
    if (sb.classList.contains("stop") !== stop) {
      sb.classList.toggle("stop", stop);
      sb.innerHTML = icon(stop ? "stop" : "send");
      sb.setAttribute("aria-label", stop ? "Stop the agent" : "Send");
    }
    sb.disabled = !stop && (!(ta.value.trim() || ready()) || atts.some((a) => !a.path));
  };
  S.syncSend = syncSend;
  const grow = () => {
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, innerHeight * 0.4) + "px";
    syncSend();
    S.drafts[s.id] = ta.value;
  };
  const drawAtts = () => {
    const box = $("#atts");
    if (!box) return;
    box.innerHTML = atts.map((a, i) => `<div class="att ${a.path ? "" : "loading"}" ${a.preview ? `style="background-image:url('${a.preview}')"` : ""}>${a.preview ? "" : esc(a.name.slice(-18))}<button class="rm" data-rm="${i}" aria-label="Remove">${icon("x")}</button></div>`).join("");
    box.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { atts.splice(+b.dataset.rm, 1); drawAtts(); grow(); }));
  };
  ta.oninput = () => { if (ta.value === "/") { ta.value = ""; openPalette(s); } grow(); };
  drawAtts(); grow();
  $("#abtn").onclick = () => $("#afile").click();
  $("#afile").onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    for (const f of files) {
      const a = { name: f.name, type: f.type, path: null, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null };
      atts.push(a); drawAtts(); grow();
      try {
        const up = f.type.startsWith("image/") ? await shrinkImage(f) : f;
        const fd = new FormData(); fd.append("file", up, up.name ?? f.name);
        const r = await fetch("/api/upload", { method: "POST", headers: { "x-away": "1" }, body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || r.statusText);
        a.path = j.path; a.url = j.url;
      } catch (err) {
        toast("Upload failed: " + err.message, true);
        atts.splice(atts.indexOf(a), 1);
      }
      drawAtts(); grow();
    }
  };
  const submit = async () => {
    if (sb.classList.contains("stop")) {
      sb.disabled = true; vibrate(20);
      try { await api(`/api/session/${s.id}/keys`, { keys: ["Escape"] }); toast("Stopping…"); }
      catch (e) { toast(e.message, true); }
      setTimeout(() => { sb.disabled = false; syncSend(); }, 1500);
      return;
    }
    let text = ta.value.trim();
    if (!text && !ready()) return;
    if (atts.some((a) => !a.path)) return toast("Still uploading…");
    if (atts.length) {
      const lines = atts.map((a) => `[Attached ${a.type?.startsWith("image/") ? "image" : "file"}: ${a.path}]`).join("\n");
      text = text ? `${text}\n\n${lines}` : `${lines}\n\n(Sent from my phone — please take a look.)`;
    }
    sb.disabled = true; vibrate();
    try {
      await api(`/api/session/${s.id}/text`, { text, ...(ocTerm ? { term: true } : {}) });
      ta.value = ""; delete S.drafts[s.id]; atts.length = 0; drawAtts(); grow();
      // Busy session: show it as queued right away (the transcript can lag while Claude is streaming).
      const live = S.sessions.find((x) => x.id === s.id);
      if (live?.status === "working" && S.chat?.id === s.id) {
        const q = queuedEl(text, S.chat, true);
        if (q) { S.chat.queue.appendChild(q); setTimeout(() => q.classList.contains("local") && q.remove(), 120_000); }
      }
      scrollChatToEnd(true);
    } catch (e) { toast(e.message, true); sb.disabled = false; }
  };
  sb.onclick = submit;
  ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey && matchMedia("(pointer: fine)").matches) { e.preventDefault(); submit(); } };
  $("#kbtn").onclick = () => { S.keysOpen = !S.keysOpen; lastDockKey = ""; renderDock(s); };
}

// chat rendering
function nearBottom() { return innerHeight + scrollY >= document.documentElement.scrollHeight - 160; }
// For a moment after a chat opens, keep it pinned to the bottom while images above finish loading.
let pinUntil = 0;
function pinToBottom(ms = 2500) { pinUntil = Date.now() + ms; }
addEventListener("touchstart", () => (pinUntil = 0), { passive: true });
addEventListener("wheel", () => (pinUntil = 0), { passive: true });
document.addEventListener("load", (e) => {
  if (e.target.tagName === "IMG" && Date.now() < pinUntil && e.target.closest("#chat")) window.scrollTo(0, document.documentElement.scrollHeight);
}, true);
// "Newest" button: floats above the composer when you've scrolled up in a chat.
const newestBtn = document.createElement("button");
newestBtn.className = "newest-btn";
newestBtn.setAttribute("aria-label", "Go to newest message");
newestBtn.hidden = true;
document.body.appendChild(newestBtn);
let newestRaf = 0;
function updateNewest() {
  cancelAnimationFrame(newestRaf);
  newestRaf = requestAnimationFrame(() => {
    const show = S.view?.kind === "session" && S.mode === "chat" && !!$("#chat") && !nearBottom() && lockedY === null;
    if (show) {
      newestBtn.innerHTML = `${icon("down")}<span>Newest</span>`;
      const dock = document.querySelector(".dock");
      newestBtn.style.bottom = `${(dock ? innerHeight - dock.getBoundingClientRect().top : 20) + 12}px`;
    }
    newestBtn.hidden = !show;
  });
}
newestBtn.onclick = () => { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" }); vibrate(8); };
addEventListener("scroll", updateNewest, { passive: true });
addEventListener("resize", updateNewest);
addEventListener("hashchange", () => setTimeout(updateNewest, 50));

function scrollChatToEnd(force) { if (force || nearBottom()) requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight)); }

/** What a permission prompt is about, structured (server: approval.ts): a plan as markdown, a command
 *  as code, an edit as a diff, other tools as labelled fields. */
/** Same as approval.ts toolLine (server, for notifications). */
function toolLine(t) {
  if (t.md) { const h = t.md.split("\n").map((l) => l.replace(/^[#>*\s-]+/, "").replace(/[*_`]/g, "").trim()).find(Boolean); return `Plan ready${h ? ": " + h : ""}`; }
  if (t.name === "Bash" || t.name === "bash" || t.name === "shell") return `Run: ${t.code?.split("\n")[0] ?? ""}`;
  if (t.path) return `${t.title}: ${t.path}`;
  return t.fields?.[0] ? `${t.title}: ${t.fields[0][1].split("\n")[0]}` : t.title;
}
function toolView(t) {
  const diff = t.diff ? `<pre class="tv-diff">${t.diff.map((l) => l.t === "@" ? `<span class="d-sep"></span>` : `<span class="d-${l.t === "+" ? "add" : l.t === "-" ? "del" : "ctx"}">${esc(l.t === " " ? "  " : l.t + " ")}${esc(l.s)}</span>`).join("")}</pre>` : "";
  return `<div class="tool-view">
    <div class="tv-head"><b>${esc(t.title)}</b>${t.path ? `<code class="tv-path">${esc(t.path)}</code>` : ""}</div>
    ${t.desc ? `<p class="tv-desc">${esc(t.desc)}</p>` : ""}
    ${t.md ? `<div class="tv-md msg-text">${md(t.md)}</div>` : ""}
    ${t.code ? `<pre class="tv-code">${esc(t.code)}</pre>` : ""}
    ${diff}
    ${t.fields?.length ? `<dl class="tv-fields">${t.fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
    ${t.clipped ? `<p class="muted tv-more">Longer than shown here: see the Terminal tab.</p>` : ""}
  </div>`;
}
// ── waiting: countdowns for timed waits, and what a pending Yield is waiting on ──
const clock = (ms) => {
  const t = Math.max(0, Math.round(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const countdown = (until) => (until - Date.now() > 0 ? `⏱ ${clock(until - Date.now())}` : "⏱ any moment");
const elapsed = (since) => { const s = Math.max(0, Math.round((Date.now() - since) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; };
setInterval(() => {
  document.querySelectorAll(".cd[data-until]").forEach((e) => (e.textContent = countdown(+e.dataset.until)));
  document.querySelectorAll("[data-since]").forEach((e) => (e.textContent = elapsed(+e.dataset.since)));
}, 1000);
function renderWaits(el) {
  const list = S.sessions.find((x) => x.id === el.dataset.sid)?.waits ?? [];
  el.innerHTML = list.length
    ? `<div class="w-h">Waiting for</div>${list.map((w) => `<div class="w-row">${icon(w.kind === "agent" ? "agents" : "term")}<span class="w-l">${esc(w.label)}</span><span class="w-t muted" data-since="${+w.since}">${elapsed(w.since)}</span></div>`).join("")}`
    : `<div class="w-h">Waiting for a background task or a new message</div>`;
}
const OPEN_THINKING = new Set();
function itemEl(it, st = S.chat) {
  const d = document.createElement("div");
  if (it.k === "user") {
    d.className = "msg-user";
    const re = /\[Attached (image|file): ([^\]]+)\]/g;
    const found = [...it.text.matchAll(re)];
    d.textContent = it.text.replace(re, "").replace(/\n*\(Sent from my phone — please take a look\.\)\s*$/, "").trim();
    if (found.length) {
      const box = document.createElement("div");
      box.className = "imgs";
      for (const [, kind, path] of found) {
        const name = path.split("/").pop();
        const inUploads = path.includes("/agents-away/uploads/");
        if (kind === "image" && inUploads) {
          const img = document.createElement("img");
          const full = "/uploads/" + encodeURIComponent(name);
          img.src = sized(full, 360); img.loading = "lazy"; img.decoding = "async"; img.alt = "";
          img.onclick = () => lightbox(full);
          box.appendChild(img);
        } else {
          const f = document.createElement("div"); f.className = "file"; f.textContent = "📎 " + name.replace(/^\d{8}-\d{6}-\w{4}-/, "");
          box.appendChild(f);
        }
      }
      d.appendChild(box);
    }
  }
  else if (it.k === "command") { d.className = "msg-cmd"; d.textContent = it.text; }
  else if (it.k === "note") { d.className = "msg-note"; d.textContent = it.text; }
  else if (it.k === "thinking") {
    // Collapsed; stays open across re-renders while this phone has it open.
    const key = it.ts + ":" + it.text.length + ":" + it.text.slice(0, 40);
    const det = document.createElement("details"); det.className = "msg-think"; det.open = OPEN_THINKING.has(key);
    const words = it.text.split(/\s+/).length;
    det.innerHTML = `<summary>${icon("sparkle")}<span>Thinking</span><span class="muted">${words} word${words === 1 ? "" : "s"}</span></summary><div class="think-body">${md(it.text)}</div>`;
    det.ontoggle = () => { det.open ? OPEN_THINKING.add(key) : OPEN_THINKING.delete(key); };
    d.className = "msg-think-wrap"; d.appendChild(det);
  }
  else if (it.k === "text") {
    d.className = "msg-text"; d.innerHTML = md(it.text);
    d.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      const full = src.startsWith("/") && !src.startsWith("/api/") && !src.startsWith("/uploads/") && !src.startsWith("/media/") ? "/api/file?path=" + encodeURIComponent(src) : null;
      if (full) img.src = sized(full, 800);
      img.loading = "lazy"; img.decoding = "async";
      img.onerror = () => img.remove(); img.onclick = () => lightbox(full ?? img.src); img.className = "inline-img";
    });
    const paths = [...new Set([...it.text.matchAll(/(?:^|[\s`(])((?:~|\/)[^\s`()'"]+\.(?:png|jpe?g|webp|gif))(?=$|[\s`).,:;])/gi)].map((m) => m[1]))].slice(0, 6);
    if (paths.length) {
      const box = document.createElement("div"); box.className = "thumbs";
      for (const p of paths) {
        if (p.startsWith("~")) continue;
        const img = document.createElement("img"); img.loading = "lazy"; img.alt = p.split("/").pop();
        const full = "/api/file?path=" + encodeURIComponent(p);
        img.src = sized(full, 800); img.decoding = "async";
        img.onerror = () => img.remove(); img.onclick = () => lightbox(full);
        box.appendChild(img);
      }
      if (box.childElementCount) d.appendChild(box);
    }
  }
  else if (it.k === "tool") {
    const det = document.createElement("details");
    det.className = "tool"; det.dataset.id = it.id;
    det.innerHTML = `<summary><span class="st run"></span><span class="tn">${esc(it.name)}</span><span class="ts">${esc(it.summary)}</span>${it.until ? `<span class="cd" data-until="${+it.until}">${countdown(it.until)}</span>` : ""}</summary><pre>${esc(it.detail)}</pre>`;
    if (it.name === "Yield") {
      // What it's waiting on: the session's running background work, kept live (renderWaits).
      const wrap = document.createElement("div"); wrap.className = "tool-wait";
      const w = document.createElement("div"); w.className = "waits"; w.dataset.sid = st.id;
      wrap.append(det, w);
      st.tools.set(it.id, det);
      renderWaits(w);
      return wrap;
    }
    if (it.name === "Read" && /^\/.+\.(png|jpe?g|webp|gif)$/i.test(it.summary)) {
      const wrap = document.createElement("div"); wrap.className = "tool-with-img";
      const img = document.createElement("img"); img.className = "tool-img"; img.loading = "lazy"; img.alt = "";
      const full = "/api/file?path=" + encodeURIComponent(it.summary);
      img.src = sized(full, 800); img.decoding = "async";
      img.onerror = () => img.remove(); img.onclick = () => lightbox(full);
      wrap.append(det, img);
      st.tools.set(it.id, det);
      return wrap;
    }
    st.tools.set(it.id, det);
    return det;
  } else return null;
  return d;
}

function applyResult(it, st) {
  const det = st.tools.get(it.id);
  if (!det) return;
  const sti = det.querySelector(".st");
  det.querySelector(".cd")?.remove();
  det.parentElement?.querySelector(":scope > .waits")?.remove(); // a Yield that has finished waiting
  sti.className = "st " + (it.error ? "err" : "ok");
  sti.innerHTML = icon(it.error ? "x" : "check");
  if (it.text && !det.querySelector("pre.res")) {
    const pre = document.createElement("pre");
    pre.className = "res" + (it.error ? " err" : "");
    pre.textContent = it.text;
    det.appendChild(pre);
  }
}

/** A queued-message bubble (bottom of the chat) with a "Send now" button. `local` = shown optimistically
 *  right after sending, before the transcript confirms it. */
function queuedEl(text, st, local = false) {
  const existing = [...st.queue.children].find((q) => q.dataset.text === text);
  if (existing) { if (!local) existing.classList.remove("local"); return null; }
  const q = document.createElement("div");
  q.className = "msg-user queued" + (local ? " local" : "");
  q.dataset.text = text;
  const oc = S.sessions.find((x) => x.id === st.id)?.kind === "opencode";
  q.innerHTML = `<span class="q-label">Queued — ${oc ? "OpenCode" : "Claude"} reads this when the current step finishes</span>`;
  q.appendChild(document.createTextNode(text));
  const b = document.createElement("button");
  b.className = "q-now";
  b.innerHTML = `${icon("send")} Send now`;
  b.title = oc ? "Interrupt the current step so OpenCode reads this now" : "Deliver it now (Claude Code's Ctrl+X Ctrl+S)";
  b.onclick = async () => {
    b.disabled = true;
    try { await api(`/api/session/${st.id}/sendnow`, {}); vibrate(15); toast(oc ? "Interrupted — sending now" : "Sending now"); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  };
  q.appendChild(b);
  return q;
}

/** Turn items into DOM. Queued messages live in st.queue (kept at the bottom) until Claude takes them. */
function build(items, st) {
  const frag = document.createDocumentFragment();
  const results = [];
  for (const it of items) {
    if (it.k === "result") { results.push(it); continue; }
    if (it.k === "queued") {
      const q = queuedEl(it.text, st);
      if (q) st.queue.appendChild(q);
      continue;
    }
    if (it.k === "unqueue") {
      const all = [...st.queue.children];
      (all.find((q) => it.text && q.dataset.text === it.text) ?? (it.text ? null : all[0]))?.remove();
      continue;
    }
    // A delivered message replaces its queued bubble (covers optimistic bubbles and text-less dequeues).
    if (it.k === "user" && it.text) [...st.queue.children].find((q) => q.dataset.text === it.text.trim())?.remove();
    const el = itemEl(it, st);
    if (!el) continue;
    if (it.ts) el.dataset.ts = it.ts;
    frag.appendChild(el);
  }
  return { frag, results };
}

function renderChatItems(st, items, { reset = false, start = 0, current = false } = {}) {
  const chat = st.node;
  const stick = current && (reset || nearBottom());
  if (reset) {
    chat.innerHTML = "";
    st.queue.innerHTML = "";
    chat.appendChild(st.queue);
    st.tools = new Map();
    st.start = start;
    if (start > 0) chat.insertAdjacentHTML("afterbegin", `<button class="btn ghost older">Show earlier</button>`);
  }
  chat.querySelector(".loading-msg")?.remove();
  const { frag, results } = build(items, st);
  chat.insertBefore(frag, st.queue);
  for (const r of results) applyResult(r, st);
  const has = chat.querySelector(".msg-user, .msg-text, .tool, .tool-with-img, .msg-cmd");
  chat.querySelector(".nomsg")?.remove();
  if (!has) chat.insertAdjacentHTML("afterbegin", `<div class="muted nomsg" style="text-align:center;padding:30px">No messages yet</div>`);
  const older = chat.querySelector(".older");
  if (older) older.onclick = loadOlder;
  if (!current) return;
  if (cur()) renderTyping(cur());
  const away = insertAwaySummary(items);
  markSeen(items);
  if (stick && !away) { scrollChatToEnd(true); if (reset) pinToBottom(); }
}

function loadOlder() {
  const st = S.chat;
  if (st.loadingOlder || !st.start) return;
  st.loadingOlder = true;
  st.node.querySelector(".older").textContent = "Loading…";
  send({ type: "older", id: st.id, before: st.start });
}
function prependItems(items, start) {
  const st = S.chat;
  st.start = start; st.loadingOlder = false;
  const h0 = document.documentElement.scrollHeight;
  const { frag, results } = build(items.filter((i) => i.k !== "queued" && i.k !== "unqueue"), st);
  const older = st.node.querySelector(".older");
  older.after(frag);
  for (const r of results) applyResult(r, st);
  if (!start) older.remove(); else older.textContent = "Show earlier";
  window.scrollTo(0, scrollY + document.documentElement.scrollHeight - h0);
}

function renderTerm(screen) {
  const pre = $("#term");
  if (!pre) return;
  const wrap = $("#termwrap");
  const stick = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 60 || !pre.dataset.init;
  // strip OSC sequences (hyperlinks, titles) that ansi_up doesn't understand
  const clean = screen.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\s+$/, "");
  pre.innerHTML = ansi.ansi_to_html(clean);
  pre.dataset.init = "1";
  if (stick) { wrap.scrollTop = wrap.scrollHeight; }
}
let charRatio = 0;
function applyTermSize() {
  const pre = $("#term");
  if (!pre) return;
  let size = prefs.termSize;
  const cols = cur()?.tmux?.cols ?? (cur()?.kind === "opencode" ? S.ocTermCols : 0);
  if (prefs.termFit && cols) {
    if (!charRatio) {
      const m = document.createElement("span");
      m.style.cssText = "position:absolute;visibility:hidden;font:100px var(--mono);white-space:pre";
      m.textContent = "M".repeat(20);
      document.body.appendChild(m); charRatio = m.getBoundingClientRect().width / 2000; m.remove();
    }
    const avail = ($("#termwrap")?.clientWidth ?? innerWidth) - 16;
    size = Math.max(4, Math.min(18, Math.floor((avail / (cols * charRatio)) * 10) / 10));
  }
  pre.style.setProperty("--term-size", size + "px");
}
function bumpTerm(d) {
  prefs.termFit = false; $("#t-fit")?.classList.remove("on");
  prefs.termSize = Math.max(6, Math.min(22, prefs.termSize + d));
  savePrefs(); applyTermSize(); toast(`Text size ${prefs.termSize}px`);
}
addEventListener("resize", () => applyTermSize());
function toggleWrap() {
  S.termWrap = !S.termWrap; localStorage.setItem("away.termWrap", S.termWrap ? "1" : "0");
  $("#term").classList.toggle("wrap", S.termWrap);
  $("#t-wrap")?.classList.toggle("on", S.termWrap);
  toast(S.termWrap ? "Wrapping long lines" : "Original layout — scroll sideways");
}

// ───────── OpenCode: Terminal tab = the session's own terminal (OpenCode's persistent PTY) ─────────
function renderOcTerm(m) {
  const pre = $("#term");
  if (!pre) return;
  const wrap = $("#termwrap");
  if (m.oc.none) {
    S.ocTermCols = 0;
    wrap.querySelector(".term-empty")?.remove();
    pre.innerHTML = ""; pre.dataset.init = "";
    wrap.insertAdjacentHTML("afterbegin", `<div class="empty term-empty"><b>No terminal in this session</b>${m.oc.error ? esc(m.oc.error) : "OpenCode sessions can have their own terminal (its terminal panel). Open one here to run commands in the session's folder."}<div style="margin-top:12px"><button class="btn small primary" id="t-open">${icon("term")} Open a terminal</button></div></div>`);
    $("#t-open").onclick = async (e) => {
      e.target.disabled = true;
      try { await api(`/api/session/${S.view.id}/terminal`, { cols: 100, rows: 32 }); toast("Terminal opened"); }
      catch (err) { toast(err.message, true); e.target.disabled = false; }
    };
    return;
  }
  wrap.querySelector(".term-empty")?.remove();
  const resize = S.ocTermCols !== m.oc.cols;
  S.ocTermCols = m.oc.cols;
  renderTerm((m.oc.status === "exited" ? "\x1b[2m[terminal exited]\x1b[0m\n" : "") + m.screen);
  if (resize && prefs.termFit) applyTermSize();
}

// ───────── OpenCode question forms (the `question` tool): a card in the dock ─────────
// Field types per OpenCode's Form schema: string (free text, or options + optional custom answer),
// number/integer, boolean, multiselect (options, min/maxItems, custom), external (a link). `when` hides fields.
const formDrafts = new Map(); // formId → {key: value}
function formVisible(f, ans) {
  return !(f.when ?? []).some((w) => (w.op === "eq") !== (String(ans[w.key] ?? "") === String(w.value)));
}
function ocFormDraft(form) {
  let d = formDrafts.get(form.id);
  if (!d) {
    d = {};
    for (const f of form.fields) if (f.default !== undefined) d[f.key] = Array.isArray(f.default) ? [...f.default] : f.default;
    formDrafts.set(form.id, d);
  }
  return d;
}
/** One string field with options and nothing else: tapping an option answers straight away. */
const oneTap = (form) => form.fields.length === 1 && form.fields[0].type === "string" && form.fields[0].options?.length;
function ocFormCard(s) {
  const form = s.prompt.form, ans = ocFormDraft(form), single = oneTap(form);
  const fieldHtml = (f) => {
    if (!formVisible(f, ans)) return "";
    const head = `${form.fields.length > 1 || !single ? `<div class="ff-t">${esc(f.title || f.key)}${f.required ? ` <span class="req">*</span>` : ""}</div>` : ""}${f.description && (form.fields.length > 1 || f.title) && s.prompt.question !== f.description ? `<div class="ff-d">${esc(f.description)}</div>` : ""}`;
    const v = ans[f.key];
    let body = "";
    if (f.type === "string" && f.options?.length) {
      const other = v !== undefined && v !== "" && !f.options.some((o) => o.value === v);
      body = `<div class="opts">${f.options.map((o, i) => `<button class="btn ${v === o.value ? "primary" : ""}" data-fk="${esc(f.key)}" data-fv="${esc(o.value)}"><span class="n">${i + 1}</span><span class="ol">${esc(o.label)}${o.description ? `<small>${esc(o.description)}</small>` : ""}</span></button>`).join("")}</div>
        ${f.custom ? `<div class="ff-other"><input data-fin="${esc(f.key)}" placeholder="Other answer…" value="${other ? esc(v) : ""}" enterkeyhint="send">${single ? `<button class="btn small" data-fsend="${esc(f.key)}">Send</button>` : ""}</div>` : ""}`;
    } else if (f.type === "string") {
      body = `<textarea data-fin="${esc(f.key)}" rows="2" placeholder="${esc(f.placeholder ?? "Your answer…")}">${esc(v ?? "")}</textarea>`;
    } else if (f.type === "number" || f.type === "integer") {
      body = `<input type="number" inputmode="${f.type === "integer" ? "numeric" : "decimal"}" data-fin="${esc(f.key)}" data-num="${f.type}" value="${esc(v ?? "")}"${typeof f.minimum === "number" ? ` min="${f.minimum}"` : ""}${typeof f.maximum === "number" ? ` max="${f.maximum}"` : ""}>`;
    } else if (f.type === "boolean") {
      body = `<div class="chips"><button data-fk="${esc(f.key)}" data-fb="1" class="${v === true ? "on" : ""}">Yes</button><button data-fk="${esc(f.key)}" data-fb="0" class="${v === false ? "on" : ""}">No</button></div>`;
    } else if (f.type === "multiselect") {
      const sel = Array.isArray(v) ? v : [];
      const extra = sel.filter((x) => !f.options.some((o) => o.value === x));
      body = `<div class="chips">${f.options.map((o) => `<button data-fk="${esc(f.key)}" data-fm="${esc(o.value)}" class="${sel.includes(o.value) ? "on" : ""}" title="${esc(o.description ?? "")}">${esc(o.label)}</button>`).join("")}</div>
        ${f.custom ? `<div class="ff-other"><input data-fin="${esc(f.key)}" data-multi="1" placeholder="Other (comma-separated)…" value="${esc(extra.join(", "))}"></div>` : ""}`;
    } else if (f.type === "external") {
      body = `<a class="btn small" href="${esc(/^https?:/i.test(f.url) ? f.url : "#")}" target="_blank" rel="noopener">Open link</a>`;
    }
    return `<div class="ff" data-field="${esc(f.key)}">${head}${body}</div>`;
  };
  return `<div class="prompt-card oc-form" data-form="${esc(form.id)}">
    <div class="q">${icon("alert")}<span>${esc(s.prompt.question)}</span></div>
    ${form.fields.map(fieldHtml).join("")}
    <div class="ff-actions">${single ? "" : `<button class="btn primary" data-fsubmit>Send answer</button>`}<button class="btn ghost" data-fcancel>Dismiss</button></div>
  </div>`;
}
function wireOcForm(s, dock) {
  const card = dock.querySelector(".oc-form");
  if (!card) return;
  const form = s.prompt.form, ans = ocFormDraft(form);
  const fieldOf = (k) => form.fields.find((f) => f.key === k);
  const redraw = () => { const y = card.scrollTop; card.outerHTML = ocFormCard(s); wireOcForm(s, dock); dock.querySelector(".oc-form").scrollTop = y; };
  const send = async (answer) => {
    card.querySelectorAll("button").forEach((b) => (b.disabled = true)); vibrate();
    try { await api(`/api/session/${s.id}/form`, { formID: form.id, answer }); formDrafts.delete(form.id); toast("Answer sent"); }
    catch (e) { toast(e.message, true); card.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
  };
  // Answer object: only visible fields, values typed as the schema wants.
  const collect = () => {
    const out = {};
    for (const f of form.fields) {
      if (!formVisible(f, ans) || f.type === "external") continue;
      const v = ans[f.key];
      if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) {
        if (f.required) throw new Error(`Please answer “${f.title || f.description || f.key}”`);
        continue;
      }
      out[f.key] = v;
    }
    return out;
  };
  card.querySelectorAll("[data-fv]").forEach((b) => (b.onclick = () => {
    ans[b.dataset.fk] = b.dataset.fv;
    if (oneTap(form)) send({ [b.dataset.fk]: b.dataset.fv }); else redraw();
  }));
  card.querySelectorAll("[data-fb]").forEach((b) => (b.onclick = () => { ans[b.dataset.fk] = b.dataset.fb === "1"; redraw(); }));
  card.querySelectorAll("[data-fm]").forEach((b) => (b.onclick = () => {
    const f = fieldOf(b.dataset.fk), cur = new Set(Array.isArray(ans[f.key]) ? ans[f.key] : []);
    cur.has(b.dataset.fm) ? cur.delete(b.dataset.fm) : cur.add(b.dataset.fm);
    if (f.maxItems && cur.size > f.maxItems) return toast(`Pick at most ${f.maxItems}`);
    ans[f.key] = [...cur]; redraw();
  }));
  card.querySelectorAll("[data-fin]").forEach((inp) => (inp.oninput = () => {
    const f = fieldOf(inp.dataset.fin);
    if (inp.dataset.multi) {
      const opts = (Array.isArray(ans[f.key]) ? ans[f.key] : []).filter((x) => f.options.some((o) => o.value === x));
      ans[f.key] = [...opts, ...inp.value.split(",").map((x) => x.trim()).filter(Boolean)];
    } else if (inp.dataset.num) ans[f.key] = inp.value === "" ? undefined : inp.dataset.num === "integer" ? parseInt(inp.value, 10) : Number(inp.value);
    else ans[f.key] = inp.value;
    if (f.options?.length && f.type === "string") card.querySelectorAll(`[data-fk="${CSS.escape(f.key)}"][data-fv]`).forEach((b) => b.classList.remove("primary"));
  }));
  card.querySelectorAll("[data-fsend]").forEach((b) => (b.onclick = () => {
    const v = (ans[b.dataset.fsend] ?? "").toString().trim();
    if (!v) return toast("Type an answer first");
    send({ [b.dataset.fsend]: v });
  }));
  card.querySelector("[data-fin][enterkeyhint=send]")?.addEventListener("keydown", (e) => { if (e.key === "Enter" && oneTap(form)) { e.preventDefault(); card.querySelector("[data-fsend]")?.click(); } });
  card.querySelector("[data-fsubmit]")?.addEventListener("click", () => { try { send(collect()); } catch (e) { toast(e.message, true); } });
  card.querySelector("[data-fcancel]").onclick = async () => {
    if (!(await ask("Dismiss this question?", "OpenCode is told you didn't answer it.", "Dismiss", true))) return;
    try { await api(`/api/session/${s.id}/form`, { formID: form.id, cancel: true, message: "Dismissed from the phone" }); formDrafts.delete(form.id); toast("Dismissed"); }
    catch (e) { toast(e.message, true); }
  };
}

function openEnd(id) {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return toast("Session already ended");
  if (!s.canReply) return toast("Watch-only session — end it on the PC", true);
  if (s.kind === "opencode") {
    const { el, close } = sheet(`<h3>Archive session?</h3>
      <p class="muted" style="margin:0 0 16px">“${esc(sname(s))}” ${s.status === "working" ? "is working right now — it will be stopped and" : "will be"} archived in OpenCode: it leaves this list, and the conversation is kept in OpenCode.</p>
      <button class="btn primary block" id="arch-ok">${icon("archive")} Archive</button>`);
    el.querySelector("#arch-ok").onclick = async (e) => {
      e.target.disabled = true;
      try {
        await api(`/api/session/${id}/close`, {});
        close(); vibrate(20);
        if (S.view?.kind === "session") nav("#/");
        toast("Archived", false, { label: "Undo", run: () => api(`/api/session/${id}/unarchive`, {}).then(() => toast("Restored")).catch((er) => toast(er.message, true)) });
      } catch (er) { toast(er.message, true); e.target.disabled = false; }
    };
    return;
  }
  const { el, close } = sheet(`<h3>End session?</h3>
    <p class="muted" style="margin:0 0 16px">“${esc(s.title || s.name)}” will stop${s.status === "working" ? " — it's working right now, so the current step is interrupted" : ""}. The conversation is saved and can be resumed later from <b>New session → Resume</b>.</p>
    <button class="btn primary block" id="end-ok">${icon("power")} End session</button>
    <div class="spacer"></div>
    <button class="btn ghost block" id="end-force" style="color:var(--bad)">Force close (kill the terminal)</button>`);
  const go = async (force) => {
    el.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await api(`/api/session/${id}/close`, { force });
      close(); vibrate(20); toast(force ? "Closed" : "Ending…");
      setTimeout(() => { if (!S.sessions.some((x) => x.id === id)) nav("#/"); else if (!force) toast("Still running — try Force close", true); }, 4000);
    } catch (e) { toast(e.message, true); el.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
  };
  el.querySelector("#end-ok").onclick = () => go(false);
  el.querySelector("#end-force").onclick = () => go(true);
}

// ───────── pending actions badge (session page) ─────────
function pendingFor(id) {
  const reviews = S.reviews.filter((r) => r.status === "pending");
  return {
    here: reviews.filter((r) => r.session?.id === id),
    otherReviews: reviews.filter((r) => r.session?.id !== id),
    otherSessions: S.sessions.filter((s) => s.id !== id && s.status === "waiting"),
  };
}
let lastAlertKey = "";
function renderAlert(id) {
  const b = $("#alertbtn");
  if (!b) return;
  requestAnimationFrame(fitSubbar);
  const p = pendingFor(id);
  const n = p.here.length + p.otherReviews.length + p.otherSessions.length;
  b.hidden = !n;
  if (!n) { lastAlertKey = ""; return; }
  b.className = "alert-btn" + (p.here.length ? " here" : "");
  b.innerHTML = `<span class="bang">!</span><span class="cnt">${n}</span>`;
  // Re-trigger the shake only when something new arrives.
  const key = id + ":" + [...p.here, ...p.otherReviews].map((r) => r.id).join(",") + "|" + p.otherSessions.map((s) => s.id).join(",");
  if (key !== lastAlertKey) { b.classList.remove("shake"); void b.offsetWidth; b.classList.add("shake"); if (lastAlertKey) vibrate([30, 40, 30]); lastAlertKey = key; }
  else b.classList.add("shake");
  b.setAttribute("aria-label", `${n} pending action${n > 1 ? "s" : ""}`);
}
function openPending(id) {
  const p = pendingFor(id);
  const { el, close } = sheet(`<h3>Waiting for you</h3>
    ${p.here.length ? `<div class="section-h" style="margin-top:4px"><h2>From this session</h2></div><div class="stack">${p.here.map(reviewCard).join("")}</div>` : ""}
    ${p.otherSessions.length || p.otherReviews.length ? `<div class="section-h"><h2>Elsewhere</h2></div><div class="stack">${p.otherSessions.map(sessionCard).join("")}${p.otherReviews.map(reviewCard).join("")}</div>` : ""}`);
  el.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => close()));
}

// ───────── past sessions ─────────
async function loadEndedInfo(id) {
  try {
    const info = await api(`/api/session/${id}/info`);
    S.ended = info;
    if (S.view?.id !== id || cur()) return;
    $("#s-title").textContent = info.prefs?.name || info.title || "Past session";
    $("#s-sub").innerHTML = `Ended · ${esc((info.cwd || "").replace(/^\/home\/[^/]+/, "~"))}`;
    renderHeadExtras({ kind: "claude", context: info.context, agents: info.agents });
  } catch {}
}

// ───────── changes (git diff) ─────────
async function loadChanges(id) {
  const box = $("#changes");
  if (!box) return;
  const cwdQ = S.ended?.id === id && S.ended.cwd ? `?cwd=${encodeURIComponent(S.ended.cwd)}` : "";
  let d;
  try { d = await api(`/api/session/${id}/changes${cwdQ}`); }
  catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  if (S.mode !== "changes" || S.view?.id !== id) return;
  if (!d.repo) { box.innerHTML = `<div class="empty"><b>Not a git repository</b>${esc(d.error || "Changes are shown for folders tracked by git.")}</div>`; return; }
  const files = d.files;
  const add = files.reduce((a, f) => a + (f.added ?? 0), 0), del = files.reduce((a, f) => a + (f.removed ?? 0), 0);
  const byFile = splitDiff(d.diff);
  box.innerHTML = `
    <div class="ch-head">
      <div><div class="ch-branch">${icon("git")} ${esc(d.branch)}</div><div class="muted" style="font-size:12px;font-family:var(--mono)">${esc(d.root)}</div></div>
      <button class="icon-btn" id="ch-refresh" aria-label="Refresh">${icon("refresh")}</button>
    </div>
    ${files.length ? `<div class="ch-sum"><b>${files.length}</b> file${files.length > 1 ? "s" : ""} changed <span class="add">+${add}</span> <span class="del">−${del}</span> <span class="muted">vs last commit</span></div>` : `<div class="empty"><b>No uncommitted changes</b>Everything is committed.</div>`}
    <div class="ch-files">${files.map((f) => {
      const diff = byFile.get(f.path);
      return `<details class="ch-file"><summary><span class="fp">${esc(f.path)}</span><span class="add">${f.added == null ? "bin" : "+" + f.added}</span><span class="del">${f.removed ? "−" + f.removed : ""}</span></summary>${diff ? renderDiff(diff) : `<div class="muted" style="padding:10px 12px;font-size:13px">No preview (binary or large file)</div>`}</details>`;
    }).join("")}</div>
    ${d.truncated ? `<p class="muted" style="font-size:12.5px">Diff truncated — it's large.</p>` : ""}
    ${d.log?.length ? `<div class="section-h"><h2>Recent commits</h2></div><div class="ch-log">${d.log.map((l) => `<div><code>${esc(l.slice(0, 7))}</code> ${esc(l.slice(8))}</div>`).join("")}</div>` : ""}`;
  $("#ch-refresh").onclick = () => { box.innerHTML = `<div class="muted" style="text-align:center;padding:30px">Refreshing…</div>`; loadChanges(id); };
  if (files.length === 1) box.querySelector("details.ch-file")?.setAttribute("open", "");
}
function splitDiff(text) {
  const map = new Map();
  const parts = text.split(/^(?=diff --git )/m);
  for (const part of parts) {
    const m = part.match(/^diff --git a\/(.+?) b\/(.+?)$/m);
    if (!m) continue;
    let path = m[2];
    if (m[1] === "dev/null" || part.includes("--- /dev/null") && m[1].endsWith("/dev/null")) path = m[2];
    const rn = part.match(/^rename to (.+)$/m);
    if (rn) path = rn[1];
    map.set(path, part);
    if (!map.has(m[1])) map.set(m[1], part);
  }
  return map;
}
function renderDiff(part) {
  const lines = part.split("\n");
  let i = lines.findIndex((l) => l.startsWith("@@"));
  if (i < 0) return `<div class="muted" style="padding:10px 12px;font-size:13px">${esc(lines.find((l) => /Binary|rename|mode/.test(l)) || "No textual changes")}</div>`;
  const out = [];
  let shown = 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (shown++ > 1500) { out.push(`<div class="dl hunk">… more lines not shown</div>`); break; }
    const cls = l.startsWith("@@") ? "hunk" : l.startsWith("+") ? "a" : l.startsWith("-") ? "d" : l.startsWith("\\") ? "hunk" : "";
    out.push(`<div class="dl ${cls}">${esc(l) || " "}</div>`);
  }
  return `<div class="diff">${out.join("")}</div>`;
}

// ───────── session menu: rename / pin / mute / end ─────────
function openSessionMenu(id) {
  const s = cur();
  const pr = s ? { name: s.customName, pinned: s.pinned, muted: s.muted } : (S.ended?.prefs ?? {});
  const title = s ? sname(s) : ($("#s-title")?.textContent ?? "");
  const { el, close } = sheet(`<h3>${esc(title)}</h3>
    <div class="field"><label>Name</label>
      <div style="display:flex;gap:8px"><input id="rn" style="flex:1;font-family:var(--font)" placeholder="${esc(s?.title || title)}" value="${esc(pr.name || "")}"><button class="btn" id="rn-save">Save</button></div></div>
    <div class="toggle-row"><div class="grow"><div>Pin to top</div></div><input type="checkbox" class="switch" id="pinsw" ${pr.pinned ? "checked" : ""}></div>
    <div class="toggle-row"><div class="grow"><div>Mute notifications</div><div class="d">Still shows in the app, no pushes</div></div><input type="checkbox" class="switch" id="mutesw" ${pr.muted ? "checked" : ""}></div>
    <div class="spacer"></div>
    ${s?.canReply ? `<button class="btn block" id="endb" style="color:var(--bad)">${icon(s.kind === "opencode" ? "archive" : "power")} ${s.kind === "opencode" ? "Archive session…" : "End session…"}</button>` : ""}`);
  const save = async (patch) => {
    try { await api(`/api/session/${id}/prefs`, patch); if (S.ended?.id === id) S.ended.prefs = { ...S.ended.prefs, ...patch }; }
    catch (e) { toast(e.message, true); }
  };
  el.querySelector("#rn-save").onclick = async () => { await save({ name: el.querySelector("#rn").value.trim() || null }); toast("Renamed"); close(); };
  el.querySelector("#rn").onkeydown = (e) => { if (e.key === "Enter") el.querySelector("#rn-save").click(); };
  el.querySelector("#pinsw").onchange = (e) => save({ pinned: e.target.checked });
  el.querySelector("#mutesw").onchange = (e) => { save({ muted: e.target.checked }); toast(e.target.checked ? "Muted" : "Notifications on"); };
  el.querySelector("#endb")?.addEventListener("click", () => { close(); openEnd(id); });
}

// ───────── commands & quick replies ─────────
const COMMANDS = [
  ["/compact", "Summarise the conversation to free up context"],
  ["/context", "Show how full the context window is"],
  ["/model", "Switch model"],
  ["/cost", "Token usage and cost for this session"],
  ["/status", "Version, model, account"],
  ["/clear", "Start fresh — clears the conversation", true],
];
function quickReplies() {
  return prefs.quick ?? ["Continue", "Yes, go ahead", "Stop and explain what you're doing", "Run the tests", "Commit this with a good message"];
}
function openPalette(s) {
  const isOC = s.kind === "opencode";
  const { el, close } = sheet(`${isOC ? "" : "<h3>Commands</h3>"}
    <div class="pal">${(isOC ? [] : COMMANDS).map(([c, d, danger]) => `<button class="list-row" data-cmd="${c}" ${danger ? 'data-danger="1"' : ""}><div class="grow"><div class="t" style="font-family:var(--mono)">${c}</div><div class="s" style="font-family:var(--font)">${esc(d)}</div></div></button>`).join("")}</div>
    <h3 style="margin-top:${isOC ? 0 : 20}px">Quick replies</h3>
    <div class="quick" id="quick"></div>
    <div style="display:flex;gap:8px;margin-top:10px"><input id="qnew" class="qin" placeholder="Add a quick reply…"><button class="btn" id="qadd">Add</button></div>
    <p class="muted" style="font-size:12.5px;margin:10px 2px 0">Tap to send. Long-press a quick reply to remove it. Tip: typing <code>/</code> in the message box opens this.</p>`);
  const send1 = async (text) => {
    try { await api(`/api/session/${s.id}/text`, { text }); toast("Sent"); vibrate(10); close(); }
    catch (e) { toast(e.message, true); }
  };
  el.querySelectorAll("[data-cmd]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.danger && !(await ask(`Send ${b.dataset.cmd}?`, "This can't be undone.", "Send", true))) return;
    send1(b.dataset.cmd);
  }));
  const draw = () => {
    const q = el.querySelector("#quick");
    q.innerHTML = quickReplies().map((t, i) => `<button class="qr" data-i="${i}">${esc(t)}</button>`).join("");
    q.querySelectorAll(".qr").forEach((b) => {
      let timer, long = false;
      b.onpointerdown = () => { long = false; timer = setTimeout(async () => { long = true; if (await ask(`Remove “${b.textContent}”?`, "", "Remove", true)) { const l = quickReplies().slice(); l.splice(+b.dataset.i, 1); prefs.quick = l; savePrefs(); draw(); } }, 600); };
      b.onpointerup = b.onpointerleave = () => clearTimeout(timer);
      b.onclick = () => { if (!long) send1(b.textContent); };
      b.oncontextmenu = (e) => e.preventDefault();
    });
  };
  draw();
  el.querySelector("#qadd").onclick = () => {
    const v = el.querySelector("#qnew").value.trim();
    if (!v) return;
    prefs.quick = [...quickReplies(), v]; savePrefs(); el.querySelector("#qnew").value = ""; draw();
  };
}

// ───────── "while you were away" ─────────
function seenMap() { try { return JSON.parse(localStorage.getItem("away.seen") || "{}"); } catch { return {}; } }
function markSeen(items) {
  if (document.visibilityState !== "visible" || S.view?.kind !== "session") return;
  const last = [...items].reverse().find((i) => i.ts)?.ts;
  if (!last) return;
  const m = seenMap();
  if (!m[S.view.id] || m[S.view.id] < last) {
    m[S.view.id] = last;
    const keys = Object.keys(m);
    if (keys.length > 200) delete m[keys[0]];
    try { localStorage.setItem("away.seen", JSON.stringify(m)); } catch {}
  }
}
function insertAwaySummary(items) {
  const seen = seenMap()[S.view.id];
  if (!seen) return false;
  const newer = items.filter((i) => i.ts && i.ts > seen);
  if (newer.length < 3) return false;
  $("#away")?.remove(); $("#newdiv")?.remove();
  const toolTs = new Map(items.filter((i) => i.k === "tool").map((i) => [i.id, i.ts]));
  const edited = new Set(), cmds = [];
  let replies = 0, prompts = 0;
  for (const i of newer) {
    if (i.k === "text") replies++;
    if (i.k === "user") prompts++;
    if (i.k === "tool" && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(i.name)) edited.add(i.summary.split("/").pop());
    if (i.k === "tool" && i.name === "Bash") cmds.push(i.summary);
  }
  const errors = items.filter((i) => i.k === "result" && i.error && (toolTs.get(i.id) ?? "") > seen).length;
  const first = S.chat.node.querySelector(`[data-ts="${CSS.escape(newer[0].ts)}"]`) ?? null;
  const card = document.createElement("div");
  card.className = "away"; card.id = "away";
  const since = ago(seen);
  card.innerHTML = `<div class="away-h">${icon("refresh")} While you were away <span class="muted">· ${since === "now" ? "just now" : since + " ago"}</span></div>
    <div class="away-stats">
      ${replies ? `<span><b>${replies}</b> repl${replies > 1 ? "ies" : "y"}</span>` : ""}
      ${edited.size ? `<span><b>${edited.size}</b> file${edited.size > 1 ? "s" : ""} edited</span>` : ""}
      ${cmds.length ? `<span><b>${cmds.length}</b> command${cmds.length > 1 ? "s" : ""}</span>` : ""}
      ${errors ? `<span class="bad"><b>${errors}</b> error${errors > 1 ? "s" : ""}</span>` : ""}
      ${prompts ? `<span><b>${prompts}</b> message${prompts > 1 ? "s" : ""} sent</span>` : ""}
    </div>
    ${edited.size ? `<div class="away-files">${[...edited].slice(0, 8).map((f) => `<code>${esc(f)}</code>`).join("")}${edited.size > 8 ? ` <span class="muted">+${edited.size - 8}</span>` : ""}</div>` : ""}
    <div class="away-actions">${first ? `<button class="btn ghost" id="away-latest">↑ Where I left off</button>` : ""}${edited.size ? `<button class="btn ghost" id="away-changes">${icon("git")} See changes</button>` : ""}</div>`;
  const chat = S.chat.node;
  // Summary sits at the bottom (you land on the newest message); a divider marks where new stuff starts.
  chat.insertBefore(card, S.chat.queue);
  if (first) {
    const div = document.createElement("div");
    div.className = "new-divider"; div.id = "newdiv"; div.textContent = "New since you last looked";
    chat.insertBefore(div, first);
  }
  card.querySelector("#away-latest")?.addEventListener("click", () => $("#newdiv")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  card.querySelector("#away-changes")?.addEventListener("click", () => setMode("changes"));
  return false; // caller still scrolls to the newest message
}

// ───────── search ─────────
function renderSearch() {
  app.innerHTML = `
    <header class="bar">
      <button class="icon-btn" id="back" aria-label="Back">${icon("back")}</button>
      <div class="grow search-box">${icon("search")}<input id="q" type="search" placeholder="Search all conversations…" autocomplete="off" enterkeyhint="search" value="${esc(S.lastQuery ?? "")}"></div>
    </header>
    <main class="page" id="results"><div class="empty">Search what you and Claude said in any session, running or past.</div></main>`;
  $("#back").onclick = () => (nav("#/"));
  const q = $("#q");
  let t, seq = 0;
  const run = async () => {
    const v = q.value.trim();
    S.lastQuery = v;
    const box = $("#results");
    if (v.length < 2) { box.innerHTML = `<div class="empty">Search what you and Claude said in any session, running or past.</div>`; return; }
    const my = ++seq;
    box.innerHTML = `<div class="muted" style="text-align:center;padding:30px">Searching…</div>`;
    try {
      const { results } = await api("/api/search?q=" + encodeURIComponent(v));
      if (my !== seq) return;
      const live = new Set(S.sessions.map((s) => s.id));
      box.innerHTML = results.length ? `<div class="section-h"><h2>${results.length} session${results.length > 1 ? "s" : ""}</h2></div><div class="stack">${results.map((r) => `
        <a class="card sr" href="#/s/${encodeURIComponent(r.sessionId)}">
          <div class="sr-h"><div class="t">${esc(r.title || r.sessionId.slice(0, 8))}</div>${live.has(r.sessionId) ? '<span class="chip ok">running</span>' : `<span class="muted" style="font-size:12px">${ago(r.mtime)}</span>`}</div>
          <div class="s">${esc(r.home)} · ${r.count} match${r.count > 1 ? "es" : ""}</div>
          ${r.hits.map((h) => `<div class="hit"><span class="who">${h.role === "user" ? "You" : "Claude"}</span>${esc(h.pre)}<mark>${esc(h.hit)}</mark>${esc(h.post)}</div>`).join("")}
        </a>`).join("")}</div>` : `<div class="empty"><b>Nothing found</b>No conversation mentions “${esc(v)}”.</div>`;
    } catch (e) { if (my === seq) box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  };
  q.oninput = () => { clearTimeout(t); t = setTimeout(run, 450); };
  q.onkeydown = (e) => { if (e.key === "Enter") { clearTimeout(t); run(); q.blur(); } };
  if (q.value) run(); else setTimeout(() => q.focus(), 50);
}

// Downscale big phone photos before upload: faster, and far fewer tokens for Claude.
async function shrinkImage(f, max = 2000) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.type) || f.size < 600 * 1024) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (k === 1 && f.size < 2.5 * 1024 * 1024) return f;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
    return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch { return f; }
}

// ───────── review view ─────────
async function renderReview(id) {
  let r = S.reviews.find((x) => x.id === id);
  if (!r) { try { r = await api(`/api/review/${id}`); } catch { app.innerHTML = `<header class="bar"><button class="icon-btn" id="rv-back">${icon("back")}</button><div class="grow bar-title">Review not found</div></header>`; $("#rv-back").onclick = () => nav("#/"); return; } }
  const draft = $("#rcomment")?.value ?? "";
  app.innerHTML = `
    <header class="bar">
      <button class="icon-btn" id="back" aria-label="Back">${icon("back")}</button>
      <div class="grow"><div class="bar-title">Review</div><div class="bar-sub">${esc(ago(r.createdAt))} ago${r.session?.name ? " · " + esc(r.session.name) : ""}</div></div>
      <button class="icon-btn" id="del" aria-label="Delete">${icon("trash")}</button>
    </header>
    <main class="review">
      <h1>${esc(r.title)}</h1>
      ${r.session?.cwd ? `<div class="from"><span class="chip">${esc(r.session.cwd.split("/").pop())}</span></div>` : ""}
      ${r.message ? `<div class="msg">${esc(r.message)}</div>` : ""}
      <div class="gallery ${r.media.length === 1 ? "single" : ""}">${r.media.map((m, i) => `<figure>${m.type.startsWith("video/") ? `<video src="${m.url}" controls playsinline loop></video>` : `<img src="${sized(m.url, 1600)}" data-full="${m.url}" alt="" loading="${i ? "lazy" : "eager"}" decoding="async">`}${r.media.length > 1 ? `<figcaption>${i + 1} / ${r.media.length}</figcaption>` : ""}</figure>`).join("")}</div>
      ${r.status === "pending" ? `
      <div class="answer">
        <textarea id="rcomment" placeholder="Comment (optional for approve)…">${esc(draft)}</textarea>
        <button class="btn ok block" data-d="approved">${icon("check")} Approve</button>
        <div class="row">
          <button class="btn warn" data-d="changes">Request changes</button>
          <button class="btn danger" data-d="rejected">Reject</button>
        </div>
        <button class="btn ghost block" id="dismiss">Dismiss — no longer needed</button>
      </div>` : `
      <div class="verdict">
        ${r.status === "withdrawn" ? '<span class="chip">Withdrawn by Claude</span>' : r.status === "dismissed" ? '<span class="chip">Dismissed</span>' : r.decision === "approved" ? '<span class="chip ok">Approved</span>' : r.decision === "rejected" ? '<span class="chip bad">Rejected</span>' : '<span class="chip wait">Changes requested</span>'}
        ${r.closedReason && r.status !== "answered" ? `<div class="c muted">${esc(r.closedReason)}</div>` : ""}
        <span class="muted" style="font-size:12px;margin-left:6px">${esc(ago(r.respondedAt))} ago</span>
        ${r.comment ? `<div class="c">${esc(r.comment)}</div>` : ""}
      </div>`}
    </main>`;
  $("#back").onclick = () => (history.length > 1 ? history.back() : (nav("#/")));
  $("#del").onclick = async () => {
    if (!(await ask("Delete this review?", "It's removed for good, images included.", "Delete", true))) return;
    try { await api(`/api/review/${id}`, undefined, "DELETE"); S.reviews = S.reviews.filter((x) => x.id !== id); toast("Deleted"); nav("#/"); }
    catch (e) { toast(e.message, true); }
  };
  $("#dismiss")?.addEventListener("click", async () => {
    try { await api(`/api/review/${id}/dismiss`, {}); toast("Dismissed"); await loadState(); }
    catch (e) { toast(e.message, true); }
  });
  const gallery = [...app.querySelectorAll("img[data-full]")].map((x) => x.dataset.full);
  app.querySelectorAll("img[data-full]").forEach((img) => (img.onclick = () => lightbox(img.dataset.full, gallery)));
  app.querySelectorAll("[data-d]").forEach((b) => (b.onclick = async () => {
    const comment = $("#rcomment").value.trim();
    if (b.dataset.d === "changes" && !comment) { $("#rcomment").focus(); return toast("Say what to change", true); }
    app.querySelectorAll("[data-d]").forEach((x) => (x.disabled = true)); vibrate(20);
    try {
      const j = await api(`/api/review/${id}/respond`, { decision: b.dataset.d, comment });
      toast(j.via === "cli" ? "Sent to Claude" : j.via === "session" ? "Typed into the session" : "Saved");
      await loadState();
    } catch (e) { toast(e.message, true); app.querySelectorAll("[data-d]").forEach((x) => (x.disabled = false)); }
  }));
}

/** Full-screen view: a sharp 1600px WebP first, the untouched original one tap away.
 *  With a list it's a gallery: swipe (when not zoomed), side arrows or ←/→ to move between images. */
function lightbox(src, list = [src]) {
  const lb = document.createElement("div");
  lb.className = "lightbox";
  let i = Math.max(0, list.indexOf(src));
  const many = list.length > 1;
  const resizable = (u) => !/\.(gif|svg)(\?|$)/i.test(u) && !/\.(gif|svg)$/i.test(decodeURIComponent(u.split("path=")[1] ?? ""));
  lb.innerHTML = `<img alt="">
    <button class="icon-btn" aria-label="Close">${icon("x")}</button>
    ${many ? `<div class="lb-count"></div><button class="lb-nav prev" aria-label="Previous image">${icon("back")}</button><button class="lb-nav next" aria-label="Next image">${icon("back")}</button>` : ""}
    <button class="btn lb-orig" hidden>Original quality</button>`;
  const img = lb.querySelector("img"), orig = lb.querySelector(".lb-orig"), count = lb.querySelector(".lb-count");
  const show = (dir = 0) => {
    const u = list[i];
    img.src = resizable(u) ? sized(u, 1600) : u;
    orig.hidden = !resizable(u); orig.disabled = false; orig.textContent = "Original quality";
    if (count) count.textContent = `${i + 1} / ${list.length}`;
    lb.scrollTo(0, 0);
    if (dir) { img.style.transition = "none"; img.style.transform = `translateX(${dir * 40}px)`; img.style.opacity = ".3"; requestAnimationFrame(() => { img.style.transition = ""; img.style.transform = ""; img.style.opacity = ""; }); }
  };
  const go = (d) => { if (!many) return; i = (i + d + list.length) % list.length; vibrate(6); show(d); };
  const close = () => { lb.remove(); removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") close(); };
  addEventListener("keydown", onKey);
  lb.querySelector(".icon-btn").onclick = close;
  lb.querySelector(".lb-nav.prev")?.addEventListener("click", (e) => { e.stopPropagation(); go(-1); });
  lb.querySelector(".lb-nav.next")?.addEventListener("click", (e) => { e.stopPropagation(); go(1); });
  orig.onclick = () => {
    const u = list[i];
    orig.textContent = "Loading original…"; orig.disabled = true;
    const pre = new Image();
    pre.onload = () => { if (list[i] === u) { img.src = u; orig.hidden = true; } };
    pre.onerror = () => { orig.textContent = "Couldn't load original"; };
    pre.src = u;
  };
  // Swipe: one finger, mostly sideways, and only when not pinch-zoomed in.
  let t0 = null;
  lb.addEventListener("touchstart", (e) => { t0 = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() } : null; }, { passive: true });
  lb.addEventListener("touchmove", (e) => { if (e.touches.length > 1) t0 = null; }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (!t0 || !many) return;
    const zoomed = (visualViewport?.scale ?? 1) > 1.05 || lb.scrollWidth > lb.clientWidth + 2;
    const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y;
    t0 = null;
    if (!zoomed && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  }, { passive: true });
  lb.onclick = (e) => { if (e.target === lb) close(); };
  show();
  document.body.appendChild(lb);
}

// ───────── sheets ─────────
/** In-app confirmation (browser confirm() is silently blocked in some installed web apps). */
function ask(title, text = "", ok = "OK", danger = false) {
  return new Promise((resolve) => {
    const { el, close } = sheet(`<h3>${esc(title)}</h3>${text ? `<p class="muted" style="margin:0 0 16px;white-space:pre-line">${esc(text)}</p>` : ""}
      <div class="row2"><button class="btn ghost" id="ask-no">Cancel</button><button class="btn ${danger ? "danger-solid" : "primary"}" id="ask-yes">${esc(ok)}</button></div>`);
    let done = false;
    const fin = (v) => { if (done) return; done = true; close(); resolve(v); };
    el.querySelector("#ask-no").onclick = () => fin(false);
    el.querySelector("#ask-yes").onclick = () => fin(true);
    el.previousElementSibling?.addEventListener("click", () => fin(false));
  });
}
// Navigate, waiting for a closing sheet to pop its history entry first (otherwise Back would undo the jump).
let backPending = null;
function nav(hash) {
  if (backPending) backPending.then(() => (location.hash = hash));
  else location.hash = hash;
}

// Freeze the page behind a sheet at its current scroll position (overflow:hidden would reset it to the top).
let lockedY = null;
function lockScroll() {
  if (lockedY !== null) return;
  lockedY = scrollY;
  const b = document.body.style;
  b.position = "fixed"; b.top = `-${lockedY}px`; b.left = "0"; b.right = "0";
  document.documentElement.classList.add("sheet-open");
}
function unlockScroll() {
  if (lockedY === null) return;
  const y = lockedY; lockedY = null;
  const b = document.body.style;
  b.position = b.top = b.left = b.right = "";
  document.documentElement.classList.remove("sheet-open");
  window.scrollTo(0, y);
}

// Bottom sheets: close button, drag-down to dismiss, Back button closes, page behind doesn't scroll.
const openSheets = [];
function sheet(html) {
  const scrim = document.createElement("div"); scrim.className = "scrim";
  const sh = document.createElement("div"); sh.className = "sheet";
  sh.innerHTML = `<div class="sheet-top"><div class="grab"></div><button class="icon-btn sheet-x" aria-label="Close">${icon("x")}</button></div>${html}`;
  let closed = false;
  const remove = (animate = true) => {
    if (closed) return;
    closed = true;
    const i = openSheets.indexOf(entry);
    if (i >= 0) openSheets.splice(i, 1);
    if (!openSheets.length) unlockScroll();
    if (animate) {
      sh.style.transition = "transform .2s ease-in"; sh.style.transform = "translateY(100%)";
      scrim.style.transition = "opacity .2s"; scrim.style.opacity = "0";
      setTimeout(() => { scrim.remove(); sh.remove(); }, 200);
    } else { scrim.remove(); sh.remove(); }
  };
  // Closing from the UI pops the history entry we pushed; Back closes via popstate.
  const close = () => {
    if (closed) return;
    remove();
    if (history.state?.awaySheet === entry.n) {
      let done; backPending = new Promise((r) => (done = r));
      backPending.done = done;
      history.back();
    }
  };
  const entry = { n: Date.now() + Math.random(), remove };
  openSheets.push(entry);
  history.pushState({ awaySheet: entry.n }, "");
  lockScroll();
  scrim.onclick = close;
  sh.querySelector(".sheet-x").onclick = close;
  document.body.append(scrim, sh);

  // Drag down to dismiss: from the handle area anytime, or anywhere when the sheet is scrolled to the top.
  let y0 = 0, dy = 0, t0 = 0, dragging = false;
  sh.addEventListener("touchstart", (e) => {
    const onTop = e.target.closest(".sheet-top");
    if (!onTop && (sh.scrollTop > 0 || e.target.closest("input, textarea, .oc-list, .chips, .dirs"))) { dragging = false; return; }
    dragging = true; y0 = e.touches[0].clientY; dy = 0; t0 = Date.now();
    sh.style.transition = "none";
  }, { passive: true });
  sh.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { sh.style.transform = `translateY(${dy}px)`; if (e.cancelable) e.preventDefault(); }
    else if (!e.target.closest(".sheet-top")) { dragging = false; sh.style.transform = ""; }
  }, { passive: false });
  sh.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    const fast = Date.now() - t0 < 300 && dy > 40;
    if (dy > 110 || fast) close();
    else { sh.style.transition = "transform .2s"; sh.style.transform = ""; }
  });
  return { el: sh, close };
}
addEventListener("popstate", () => {
  const top = openSheets[openSheets.length - 1];
  if (top && history.state?.awaySheet !== top.n) top.remove();
  if (backPending) { const p = backPending; backPending = null; setTimeout(p.done, 0); }
});
// Links inside a sheet: close it properly, then go.
document.addEventListener("click", (e) => {
  const a = e.target.closest?.(".sheet a[href^='#']");
  if (!a || !openSheets.length) return;
  e.preventDefault();
  const href = a.getAttribute("href");
  while (openSheets.length > 1) openSheets[openSheets.length - 1].remove(false);
  document.querySelector(".sheet .sheet-x")?.click();
  nav(href);
}, true);
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openSheets.length) { e.preventDefault(); history.back(); }
});

// Model / effort / permission choices for new and resumed sessions (remembered per phone).
const LAUNCH = {
  model: [["", "Default"], ["opus", "Opus"], ["sonnet", "Sonnet"], ["haiku", "Haiku"], ["fable", "Fable"]],
  effort: [["", "Default"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["xhigh", "X-High"], ["max", "Max"]],
  mode: [["", "Default"], ["auto", "Auto"], ["plan", "Plan"], ["acceptEdits", "Accept edits"], ["manual", "Ask"]],
};
function launchOpts() { return { model: "", effort: "", mode: "", ...(prefs.launch ?? {}) }; }
function launchPicker() {
  const o = launchOpts();
  const row = (k, label) => `<div class="field"><label>${label}</label><div class="chips" data-k="${k}">${LAUNCH[k].map(([v, l]) => `<button data-v="${v}" class="${o[k] === v ? "on" : ""}">${l}</button>`).join("")}</div></div>`;
  return `<details class="launch" ${o.model || o.effort || o.mode ? "open" : ""}><summary><span>Model &amp; effort</span><span class="launch-sum">${launchSummary(o)}</span></summary>
    ${row("model", "Model")}${row("effort", "Effort")}${row("mode", "Permissions")}</details>`;
}
function launchSummary(o) {
  const name = (k) => LAUNCH[k].find(([v]) => v === o[k])?.[1];
  return [o.model && name("model"), o.effort && name("effort") + " effort", o.mode && name("mode")].filter(Boolean).join(" · ") || "Defaults";
}
function wireLaunch(root) {
  root.querySelectorAll(".chips[data-k]").forEach((g) => g.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    g.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    prefs.launch = { ...launchOpts(), [g.dataset.k]: b.dataset.v }; savePrefs();
    root.querySelectorAll(".launch-sum").forEach((x) => (x.textContent = launchSummary(launchOpts())));
  })));
}
function launchBody() {
  const o = launchOpts();
  return { model: o.model || undefined, effort: o.effort || undefined, mode: o.mode || undefined };
}

// OpenCode: model (searchable), variant ("effort") and agent pickers.
async function ocPicker(box) {
  box.innerHTML = `<div class="muted" style="padding:10px 0">Loading OpenCode models…</div>`;
  let cat;
  // Re-fetched each time (server-cached): OpenCode's recently used models change as it's used on the PC.
  try { cat = S.ocCatalog = await api("/api/opencode/catalog"); }
  catch (e) { if (!(cat = S.ocCatalog)) { box.innerHTML = `<div class="watch-only">${esc(e.message)}</div>`; return; } }
  const o = (prefs.oc ??= {});
  const known = (r) => cat.models.some((x) => x.ref === r);
  // Default = this phone's last pick, else OpenCode's most recently used model, else its configured default.
  const ocLast = (cat.recent ?? []).find(known);
  const pick = (ref) => { o.model = ref; o.variant = ""; o.recent = [ref, ...(o.recent ?? []).filter((r) => r !== ref)].slice(0, 6); savePrefs(); };
  box.ocChoice = () => {
    const model = o.model || ocLast || cat.defaultModel || "";
    const vs = cat.models.find((x) => x.ref === model)?.variants ?? [];
    const v = (o.model || o.variant !== undefined ? o.variant : cat.variants?.[model]) || ""; // unset = OpenCode's own pick
    return { model, variant: vs.includes(v) ? v : "" };
  };
  const draw = (q = "") => {
    const sel = box.ocChoice().model;
    const m = cat.models.find((x) => x.ref === sel);
    const ql = q.toLowerCase();
    const list = q ? cat.models.filter((x) => (x.name + " " + x.ref).toLowerCase().includes(ql)).slice(0, 30) : [];
    const recent = [...new Set([...(o.recent ?? []), ...(cat.recent ?? [])])].filter(known).slice(0, 6).map((r) => cat.models.find((x) => x.ref === r));
    const variant = box.ocChoice().variant;
    box.innerHTML = `
      <div class="field"><label>Model</label>
        <div class="oc-model">${m ? `<b>${esc(m.name)}</b> <span class="muted">${esc(m.provider)}</span>` : esc(sel || "Default")}${o.model ? ` <button class="linkbtn" id="ocdef">${ocLast ? "use OpenCode's last" : "use default"}</button>` : ` <span class="muted">(${ocLast ? "last used in OpenCode" : "default"})</span>`}</div>
        ${recent.length ? `<div class="chips oc-recent" aria-label="Recent models"><span class="muted">Recent</span>${recent.map((x) => `<button data-ref="${esc(x.ref)}" class="${x.ref === sel ? "on" : ""}" title="${esc(x.ref)}">${esc(x.name)}</button>`).join("")}</div>` : ""}
        <input id="ocq" placeholder="Search ${cat.models.length} models…" value="${esc(q)}" autocomplete="off" style="font-family:var(--font)">
        ${list.length ? `<div class="oc-list">${list.map((x) => `<button data-ref="${esc(x.ref)}" class="${x.ref === sel ? "on" : ""}"><span>${esc(x.name)}</span><span class="muted">${esc(x.provider)}</span></button>`).join("")}</div>` : ""}
      </div>
      ${m?.variants?.length ? `<div class="field"><label>Effort (variant)</label><div class="chips" id="ocvar"><button data-v="" class="${!variant ? "on" : ""}">Default</button>${m.variants.map((v) => `<button data-v="${esc(v)}" class="${variant === v ? "on" : ""}">${esc(v)}</button>`).join("")}</div></div>` : ""}
      <div class="field"><label>Agent</label><div class="chips" id="ocag"><button data-v="" class="${!o.agent ? "on" : ""}">Default</button>${cat.agents.map((a) => `<button data-v="${esc(a.id)}" title="${esc(a.description)}" class="${o.agent === a.id ? "on" : ""}">${esc(a.id)}</button>`).join("")}</div></div>`;
    const qi = box.querySelector("#ocq");
    qi.oninput = () => { const v = qi.value; draw(v); const n = box.querySelector("#ocq"); n.focus(); n.setSelectionRange(v.length, v.length); };
    box.querySelectorAll("[data-ref]").forEach((b) => (b.onclick = () => { pick(b.dataset.ref); draw(""); }));
    box.querySelector("#ocdef")?.addEventListener("click", () => { o.model = ""; delete o.variant; savePrefs(); draw(""); });
    box.querySelectorAll("#ocvar button").forEach((b) => (b.onclick = () => { o.variant = b.dataset.v; savePrefs(); draw(q); }));
    box.querySelectorAll("#ocag button").forEach((b) => (b.onclick = () => { o.agent = b.dataset.v; savePrefs(); draw(q); }));
  };
  draw();
}

async function openNew() {
  const { el, close } = sheet(`<h3>New session</h3>
    <div class="tabs"><button class="on" data-t="new">Start</button><button data-t="resume">Resume</button></div>
    <div id="pane"><div class="muted">Loading…</div></div>`);
  let data;
  try { data = await api("/api/recent"); } catch (e) { el.querySelector("#pane").textContent = e.message; return; }
  const pane = el.querySelector("#pane");
  const showNew = () => {
    const agent = prefs.launchAgent ?? "claude";
    pane.innerHTML = `
      <div class="seg-row" id="agentsel" style="margin-bottom:14px"><button data-a="claude" class="${agent === "claude" ? "on" : ""}">Claude Code</button><button data-a="opencode" class="${agent === "opencode" ? "on" : ""}">OpenCode</button></div>
      <div class="field"><label>Folder</label><input id="cwd" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(data.dirs[0]?.home ?? "~")}"></div>
      <div class="dirs">${data.dirs.slice(0, 14).map((d, i) => `<button data-dir="${esc(d.home)}" class="${i === 0 ? "on" : ""}">${esc(d.home)}</button>`).join("")}</div>
      <div class="spacer"></div><div class="spacer"></div>
      <div class="field"><label>First message <span class="muted">(optional)</span></label><textarea id="first" rows="3" placeholder="What should Claude do?"></textarea></div>
      <div id="launchbox"></div>
      <button class="btn primary block" id="go">Start session</button>`;
    const box = pane.querySelector("#launchbox");
    const drawLaunch = () => {
      if ((prefs.launchAgent ?? "claude") === "opencode") ocPicker(box);
      else { box.innerHTML = launchPicker(); wireLaunch(box); }
      pane.querySelector("#first").placeholder = (prefs.launchAgent ?? "claude") === "opencode" ? "What should OpenCode do?" : "What should Claude do?";
    };
    drawLaunch();
    pane.querySelectorAll("#agentsel button").forEach((b) => (b.onclick = () => {
      prefs.launchAgent = b.dataset.a; savePrefs();
      pane.querySelectorAll("#agentsel button").forEach((x) => x.classList.toggle("on", x === b));
      drawLaunch();
    }));
    pane.querySelectorAll("[data-dir]").forEach((b) => (b.onclick = () => {
      pane.querySelectorAll("[data-dir]").forEach((x) => x.classList.remove("on")); b.classList.add("on");
      pane.querySelector("#cwd").value = b.dataset.dir;
    }));
    pane.querySelector("#go").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const cwd = pane.querySelector("#cwd").value.trim(), prompt = pane.querySelector("#first").value.trim() || undefined;
        if ((prefs.launchAgent ?? "claude") === "opencode") {
          const o = prefs.oc ?? {}, c = box.ocChoice?.() ?? { model: o.model, variant: o.variant };
          const r = await api("/api/new", { cwd, prompt, agent: "opencode", ocModel: c.model || undefined, ocVariant: c.variant || undefined, ocAgent: o.agent || undefined });
          close(); toast("OpenCode session started"); vibrate(20);
          if (r.id) nav("#/s/" + r.id);
        } else {
          await api("/api/new", { cwd, prompt, ...launchBody() });
          close(); toast("Starting…"); vibrate(20);
        }
      } catch (err) { toast(err.message, true); e.target.disabled = false; }
    };
  };
  const showResume = () => {
    pane.innerHTML = launchPicker() + (data.recent.length ? data.recent.map((r) => `<button class="list-row" data-sid="${esc(r.sessionId)}" data-cwd="${esc(r.cwd)}">
      <div class="grow"><div class="t">${esc(r.title || r.sessionId.slice(0, 8))}</div><div class="s">${esc(r.home)}</div></div><span class="muted" style="font-size:12px">${ago(r.mtime)}</span></button>`).join("")
      : `<div class="empty">No recent sessions</div>`);
    wireLaunch(pane);
    pane.querySelectorAll("[data-sid]").forEach((b) => (b.onclick = async () => {
      if (!(await ask(`Resume “${b.querySelector(".t").textContent}”?`, "Make sure it isn't still open in a terminal on the PC.", "Resume"))) return;
      try { await api("/api/new", { cwd: b.dataset.cwd, resume: b.dataset.sid, ...launchBody() }); close(); toast("Resuming…"); }
      catch (err) { toast(err.message, true); }
    }));
  };
  el.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => {
    el.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
    b.dataset.t === "new" ? showNew() : showResume();
  }));
  showNew();
}

function deviceName(ua = "") {
  const os = /Android/.test(ua) ? (ua.match(/Android [\d.]+; ([^;)]+)/)?.[1]?.replace(/ Build.*/, "") || "Android") : /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const br = /Firefox\//.test(ua) ? "Firefox" : /EdgA?\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}

/** The accent a theme will actually show: the chosen swatch (its light or dark shade), else the theme's own. */
function themeAccent(key) {
  const t = THEMES.find(([k]) => k === key);
  const lightTheme = key === "light" || key === "claude-light";
  return ACCENTS[prefs.accent] ? ACCENTS[prefs.accent][lightTheme ? 0 : 1] : t?.[4];
}

async function openSettings() {
  const ps = await pushStatus();
  const st = S.settings;
  const { el } = sheet(`<h3>Settings</h3>
    <div class="toggle-row"><div class="grow"><div>Notifications on this phone</div><div class="d">${ps === "unsupported" ? "Install Agents Away to your home screen first" : ps === "denied" ? "Blocked in browser settings" : `${S.push.subscribers} device(s) subscribed`}</div></div>
      <input type="checkbox" class="switch" id="p-on" ${ps === "on" ? "checked" : ""} ${ps === "unsupported" || ps === "denied" ? "disabled" : ""}></div>
    <div class="toggle-row"><div class="grow"><div>When a session needs you</div><div class="d">Permission prompts and questions</div></div><input type="checkbox" class="switch" data-k="notifyOnAttention" ${st.notifyOnAttention ? "checked" : ""}></div>
    <div class="toggle-row"><div class="grow"><div>When a session finishes</div><div class="d">With the last thing Claude said</div></div><input type="checkbox" class="switch" data-k="notifyOnStop" ${st.notifyOnStop ? "checked" : ""}></div>
    <div class="toggle-row"><div class="grow"><div>Quiet while I'm at the PC</div><div class="d">Skip if that session's terminal was typed in during the last ${Math.round(st.activeWindowSec)}s</div></div><input type="checkbox" class="switch" data-k="quietWhenActive" ${st.quietWhenActive ? "checked" : ""}></div>
    <div class="spacer"></div>
    <button class="btn block" id="test">${icon("bell")} Send test notification</button>
    <h3 style="margin-top:26px">Appearance</h3>
    <div class="set-label">Theme</div>
    <div class="theme-grid" id="themes">${THEMES.map(([k, l, bg, card]) => `<button data-theme="${k}" class="${prefs.theme === k ? "on" : ""}"><span class="theme-prev" style="background:${bg}">${card ? `<i></i><i style="background:${card}"><b data-dot="${k}" style="background:${themeAccent(k)}"></b></i>` : ""}</span>${l}</button>`).join("")}</div>
    <div class="set-label">Accent</div>
    <div class="swatches"><button class="swatch auto ${prefs.accent === "auto" ? "on" : ""}" data-acc="auto" aria-label="Theme's own accent" title="The theme's own accent" style="background:conic-gradient(#e8794c,#6ea8fe,#fab283,#e8794c)">A</button>${Object.entries(ACCENTS).map(([k, [l, d]]) => `<button class="swatch ${prefs.accent === k ? "on" : ""}" data-acc="${k}" aria-label="${k}" style="background:linear-gradient(135deg, ${l} 50%, ${d} 50%)"></button>`).join("")}</div>
    <div class="set-label">App size</div>
    <div class="range-row"><input type="range" id="scale" min="0.8" max="1.4" step="0.05" value="${prefs.scale}"><span id="scalev">${Math.round(prefs.scale * 100)}%</span></div>
    <p class="muted" style="font-size:12.5px;margin:10px 2px 0">Terminal text size is on the terminal tab (A− / A+ / fit). Appearance is saved on this phone only.</p>
    <h3 style="margin-top:26px">Sign-in</h3>
    <div class="set-label">Stay signed in</div>
    <div class="seg-row" id="signin">${[[1, "1 day"], [7, "1 week"], [30, "30 days"], [90, "90 days"], [365, "1 year"]].map(([d, l]) => `<button data-days="${d}" class="${st.signInDays === d ? "on" : ""}">${l}</button>`).join("")}</div>
    <p class="muted" style="font-size:12.5px;margin:8px 2px 0">A phone is signed out after this long without opening Agents Away. Applies to all paired phones.</p>
    <div class="set-label" style="margin-top:16px">Paired devices</div>
    <div id="devices" class="devices"><div class="muted" style="font-size:13px">Loading…</div></div>
    <p class="muted" style="font-size:12.5px;margin:16px 2px 0">Agents Away ${esc(S.version ?? "")} · connected to ${esc(S.host)} · ${esc(location.host)}</p>`);
  const loadDevices = async () => {
    const box = el.querySelector("#devices");
    try {
      const { devices } = await api("/api/devices");
      const others = devices.filter((d) => !d.current).length;
      box.innerHTML = devices.map((d) => `<div class="device">
          <div class="grow"><div>${esc(deviceName(d.ua))}${d.current ? ` <span class="chip ok">This phone</span>` : ""}</div>
          <div class="d">Paired ${esc(new Date(d.created).toLocaleDateString())} · last used ${d.current ? "now" : esc(ago(new Date(d.lastSeen).toISOString()))}${d.addr ? ` · ${esc(d.addr.replace(/^::ffff:/, ""))}` : ""} · expires ${esc(new Date(d.expires).toLocaleDateString())}</div></div>
          <button class="btn ghost small" data-out="${esc(d.id)}">${d.current ? "Sign out" : "Remove"}</button></div>`).join("")
        + (others ? `<button class="btn block" id="out-others" style="margin-top:8px;color:var(--bad)">Sign out all other devices (${others})</button>` : "");
      box.querySelectorAll("[data-out]").forEach((b) => (b.onclick = async () => {
        const d = devices.find((x) => x.id === b.dataset.out);
        if (!(await ask(d.current ? "Sign out this phone?" : "Remove this device?", d.current ? "You'll need a new pairing link from the PC (agents-away pair) to sign back in." : "It will be signed out right away and needs a new pairing link to come back.", d.current ? "Sign out" : "Remove", true))) return;
        try { await api(`/api/devices/${d.id}/signout`, {}); if (d.current) location.reload(); else { toast("Removed"); loadDevices(); } } catch (e) { toast(e.message, true); }
      }));
      box.querySelector("#out-others")?.addEventListener("click", async () => {
        if (!(await ask("Sign out all other devices?", "Every other paired phone or browser is signed out right away.", "Sign out others", true))) return;
        try { const j = await api("/api/devices/signout-others", {}); toast(`Signed out ${j.count}`); loadDevices(); } catch (e) { toast(e.message, true); }
      });
    } catch (e) { box.innerHTML = `<div class="muted">${esc(e.message)}</div>`; }
  };
  loadDevices();
  el.querySelectorAll("[data-days]").forEach((b) => (b.onclick = async () => {
    try {
      const j = await api("/api/settings", { signInDays: +b.dataset.days }); S.settings = j.settings;
      el.querySelectorAll("[data-days]").forEach((x) => x.classList.toggle("on", x === b));
      loadDevices();
    } catch (e) { toast(e.message, true); }
  }));
  el.querySelector("#p-on").onchange = (e) => (e.target.checked ? enablePush() : disablePush());
  el.querySelectorAll("[data-k]").forEach((c) => (c.onchange = async () => {
    try { const j = await api("/api/settings", { [c.dataset.k]: c.checked }); S.settings = j.settings; } catch (e) { toast(e.message, true); }
  }));
  el.querySelectorAll("[data-theme]").forEach((b) => (b.onclick = () => {
    prefs.theme = b.dataset.theme; savePrefs(); applyPrefs();
    el.querySelectorAll("[data-theme]").forEach((x) => x.classList.toggle("on", x === b));
  }));
  el.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = () => {
    prefs.accent = b.dataset.acc; savePrefs(); applyPrefs();
    el.querySelectorAll("[data-dot]").forEach((d) => (d.style.background = themeAccent(d.dataset.dot)));
    el.querySelectorAll("[data-acc]").forEach((x) => x.classList.toggle("on", x === b));
  }));
  const sc = el.querySelector("#scale");
  sc.oninput = () => { el.querySelector("#scalev").textContent = Math.round(sc.value * 100) + "%"; };
  sc.onchange = () => { prefs.scale = +sc.value; savePrefs(); applyPrefs(); };
  el.querySelector("#test").onclick = async () => {
    try { const j = await api("/api/push/test", {}); toast(j.sent ? `Sent to ${j.sent} device(s)` : "No devices subscribed yet", !j.sent); }
    catch (e) { toast(e.message, true); }
  };
}

// ───────── header extras: context % and subagents (Claude Code sessions) ─────────
I.agents = '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4m0 0-5.2 5.4M12 11.5l5.2 5.4"/>';
// Same bands as the claude-hud status line (warning 70%, critical 85%).
const CTX_WARN = 70, CTX_ALERT = 85;
const ctxLevel = (p) => (p >= CTX_ALERT ? "alert" : p >= CTX_WARN ? "warn" : "");
const ktok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(n));
function dur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  return m < 10 ? `${m}m ${s % 60}s` : m < 60 ? m + "m" : `${Math.floor(m / 60)}h ${m % 60}m`;
}
function ctxRing(p) {
  const c = 2 * Math.PI * 7;
  return `<svg viewBox="0 0 18 18" class="ring"><circle cx="9" cy="9" r="7" class="trk"/><circle cx="9" cy="9" r="7" class="val" stroke-dasharray="${(c * Math.min(100, p) / 100).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
}
/** "claude-opus-5-5" → "Opus 5.5"; OpenCode "provider/model" → model part. */
function shortModel(m) {
  if (!m) return "";
  m = String(m).split("/").pop().replace(/\[.*?\]$/, "");
  const c = m.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{6,})?$/);
  if (c) return `${c[1][0].toUpperCase()}${c[1].slice(1)} ${c[2]}${c[3] ? "." + c[3] : ""}`;
  return m.length > 18 ? m.slice(0, 17) + "…" : m;
}
/** Row 2 has tabs, alert, context and agents: shrink tab labels until it fits. */
function fitSubbar() {
  const bar = document.querySelector(".subbar");
  if (!bar) return;
  bar.classList.remove("compact", "icons");
  if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add("compact");
  if (bar.scrollWidth > bar.clientWidth + 1) bar.classList.add("icons");
}
addEventListener("resize", fitSubbar);
function renderHeadExtras(s) {
  const cb = $("#ctxbtn"), ab = $("#agentsbtn");
  if (!cb || !ab) return;
  const md = $("#s-model");
  if (md) { const name = shortModel(s.context?.model ?? s.modelName); md.textContent = name; md.title = s.context?.model ?? s.modelName ?? ""; }
  requestAnimationFrame(fitSubbar);
  const c = s.context;
  cb.hidden = !c;
  if (c) {
    cb.className = "hd-ctx " + ctxLevel(c.pct);
    cb.innerHTML = `${ctxRing(c.pct)}<span>${c.pct}%</span>`;
    cb.setAttribute("aria-label", `Context ${c.pct}% used`);
  }
  const a = s.agents;
  ab.hidden = !a?.total;
  if (a?.total) {
    ab.className = "hd-agents" + (a.running ? " live" : "");
    ab.innerHTML = `${icon("agents")}<span class="n">${a.total}</span>${a.running ? `<b class="run">${a.running}</b>` : ""}`;
    ab.setAttribute("aria-label", `${a.total} subagent${a.total > 1 ? "s" : ""}${a.running ? `, ${a.running} running` : ""}`);
  }
}
function openContextInfo(id) {
  const sess = S.sessions.find((x) => x.id === id) ?? (S.ended?.id === id ? S.ended : null);
  const c = sess?.context;
  if (!c) return;
  const live = S.sessions.some((x) => x.id === id) && sess.kind !== "opencode";
  const claudeModel = sess.kind !== "opencode" && c.model && /^claude-/.test(c.model);
  const { el } = sheet(`<h3>Context window</h3>
    <div class="ctx-big ${ctxLevel(c.pct)}"><b>${c.pct}%</b><span>used</span></div>
    <div class="ctx-bar ${ctxLevel(c.pct)}"><i style="width:${c.pct}%"></i><em id="ctx-mark" hidden></em></div>
    <p class="muted" style="margin:10px 0 0">${ktok(c.tokens)} of ${ktok(c.size)} tokens${c.model ? ` · ${esc(shortModel(c.model))}` : ""}</p>
    ${S.sessions.find((x) => x.id === id)?.kind === "opencode"
      ? `<p class="muted" style="font-size:13px;margin:8px 0 0">The input and cached tokens of OpenCode's latest reply, against the model's context limit.${c.pct >= CTX_WARN ? " OpenCode compacts the conversation when it gets full; you can also send <b>/compact</b>." : ""}</p>`
      : `<p class="muted" style="font-size:13px;margin:8px 0 0">Counted like Claude Code's status line: the input and cached tokens of the latest reply.${c.pct >= CTX_WARN ? " Claude compacts the conversation automatically when it gets full; you can also send <b>/compact</b>." : ""}</p>`}
    ${claudeModel ? `<div class="ctx-sec"><div class="ctx-lbl">Compact at <span class="muted" id="ctx-at"></span></div>
      <div class="chips" id="ctx-win"><span class="muted" style="font-size:13px">Loading…</span></div>
      <p class="muted ctx-note">Claude Code's own setting for <b>${esc(shortModel(c.model))}</b> (the same one <code>/autocompact</code> changes), so it applies to all its sessions.</p></div>` : ""}
    ${live && sess.canReply ? `<button class="btn block" id="ctx-now">${icon("zap")} Compact now</button>` : ""}`);
  const nowBtn = el.querySelector("#ctx-now");
  if (nowBtn) nowBtn.onclick = async () => {
    const busy = S.sessions.find((x) => x.id === id)?.status === "working";
    const msg = busy
      ? "Claude is in the middle of something. Compacting stops that step first, then summarises the conversation to free up context. Anything typed but not sent in its terminal is cleared.\n\nYou can ask Claude to pick up where it left off afterwards."
      : "Claude summarises the conversation so far to free up context. Anything typed but not sent in its terminal is cleared.";
    if (!(await ask(busy ? "Stop and compact now?" : "Compact now?", msg, busy ? "Stop & compact" : "Compact", busy))) return;
    try { await api(`/api/session/${id}/compact`, {}); toast("Compacting…"); vibrate(15); } catch (e) { toast(e.message, true); }
  };
  if (!claudeModel) return;
  const box = el.querySelector("#ctx-win"), mark = el.querySelector("#ctx-mark");
  const draw = (win) => {
    const steps = [100, 200, 300, 400, 500, 750].map((k) => k * 1000).filter((t) => t < c.size);
    if (typeof win === "number" && !steps.includes(win)) steps.push(win), steps.sort((a, b) => a - b);
    box.innerHTML = `<button data-w="auto" class="${win === "auto" ? "on" : ""}">Auto</button>` + steps.map((t) => `<button data-w="${t}" class="${win === t ? "on" : ""}">${ktok(t)}</button>`).join("");
    el.querySelector("#ctx-at").textContent = typeof win === "number" ? `· ${Math.round((win / c.size) * 100)}% of the window` : "· chosen by Claude Code";
    mark.hidden = typeof win !== "number";
    if (typeof win === "number") mark.style.left = Math.min(100, (win / c.size) * 100) + "%";
    box.querySelectorAll("[data-w]").forEach((b) => (b.onclick = async () => {
      const w = b.dataset.w === "auto" ? "auto" : +b.dataset.w;
      try { const r = await api("/api/compact", { model: c.model, window: w }); draw(r.window); vibrate(8); toast(r.window === "auto" ? "Compact at: auto" : `Compacts at ${ktok(r.window)}`); }
      catch (e) { toast(e.message, true); }
    }));
  };
  api(`/api/compact?model=${encodeURIComponent(c.model)}`).then((r) => draw(r.window)).catch((e) => (box.innerHTML = `<span class="muted">${esc(e.message)}</span>`));
}

const AGENT_LABEL = { running: "Running", done: "Done", failed: "Failed", stopped: "Stopped" };
function agentWhen(a) {
  const when = ago(a.startedAt) === "now" ? "just now" : ago(a.startedAt) + " ago";
  return a.status === "running" ? `for ${dur(Date.now() - a.startedAt)}` : `${dur((a.endedAt ?? a.startedAt) - a.startedAt)} · ${when}`;
}
function agentRow(sid, a) {
  return `<a class="list-row ag-row" href="#/a/${esc(sid)}/${esc(a.id)}"${a.depth > 1 ? ` style="padding-left:22px"` : ""}>
    <span class="ag-st ${a.status}"></span>
    <div class="grow"><div class="t">${esc(a.description || a.type)}</div>
    <div class="s">${esc(a.type)} · <span class="ag-lbl ${a.status}">${AGENT_LABEL[a.status]}</span> · ${agentWhen(a)}</div></div></a>`;
}
async function openAgents(id) {
  const { el } = sheet(`<div class="ag-head"><h3>Subagents</h3><button class="btn ghost small" id="ag-clear" hidden>${icon("broom")} Clear finished</button></div><div class="ag-list"><div class="muted" style="padding:20px;text-align:center">Loading…</div></div>`);
  const box = el.querySelector(".ag-list");
  const clearBtn = el.querySelector("#ag-clear");
  clearBtn.onclick = async () => {
    clearBtn.disabled = true;
    try {
      const { ids } = await api(`/api/session/${id}/agents/clear`, {});
      vibrate(12); await load();
      toast(`Cleared ${ids.length}`, false, ids.length ? { label: "Undo", run: async () => { await api(`/api/session/${id}/agents/restore`, { ids }); if (el.isConnected) load(); } } : null);
    } catch (e) { toast(e.message, true); }
    clearBtn.disabled = false;
  };
  const load = async () => {
    try {
      const { agents } = await api(`/api/session/${id}/agents`);
      clearBtn.hidden = !agents.some((a) => a.status !== "running");
      // Running ones first, then newest first.
      const list = [...agents].reverse().sort((a, b) => (b.status === "running") - (a.status === "running"));
      box.innerHTML = list.length ? list.map((a) => agentRow(id, a)).join("") : `<div class="muted" style="padding:20px;text-align:center">No subagents</div>`;
    } catch (e) { box.innerHTML = `<div class="muted" style="padding:20px;text-align:center">${esc(e.message)}</div>`; }
  };
  await load();
  const t = setInterval(() => (el.isConnected ? document.visibilityState === "visible" && load() : clearInterval(t)), 4000);
}

// Read-only chat of one subagent: #/a/<sessionId>/<agentId>
let agentPoll = null;
function renderAgent(sid, aid) {
  clearTimeout(agentPoll);
  const st = newChatState("agent:" + aid);
  st.sid = sid; st.aid = aid; st.agent = null;
  S.agentChat = st;
  app.innerHTML = `
    <div class="top">
    <header class="bar">
      <button class="icon-btn" id="back" aria-label="Back">${icon("back")}</button>
      <div class="grow"><div class="bar-title" id="a-title">Subagent</div><div class="bar-sub" id="a-sub"></div></div>
    </header>
    </div>
    <div id="body" style="flex:1;display:flex;flex-direction:column"></div>
    <div class="dock"><div class="dock-inner"><div class="watch-only ag-dock"><div style="flex:1;min-width:0">Read-only · subagent of <b id="a-parent"></b></div><button class="btn small" id="a-up">${icon("back")} Session</button></div></div></div>`;
  $("#back").onclick = () => (history.length > 1 ? history.back() : nav(`#/s/${sid}`));
  $("#a-up").onclick = () => location.replace(`#/s/${sid}`);
  st.node.id = "chat";
  st.node.insertAdjacentHTML("afterbegin", `<div class="muted loading-msg" style="text-align:center;padding:30px">Loading…</div>`);
  $("#body").appendChild(st.node);
  updateAgentChrome();
  agentFetch(st, true);
}
function updateAgentChrome() {
  const st = S.agentChat;
  if (S.view?.kind !== "agent" || !st || !$("#a-title")) return;
  const parent = S.sessions.find((x) => x.id === st.sid);
  $("#a-parent").textContent = parent ? sname(parent) : "a past session";
  const a = st.agent;
  if (!a) return;
  $("#a-title").textContent = a.description || a.type;
  $("#a-sub").innerHTML = `<span class="ag-st ${a.status}"></span><span class="ag-lbl ${a.status}">${AGENT_LABEL[a.status]}</span> · ${esc(a.type)} · ${agentWhen(a)}`;
  let ty = st.node.querySelector(".typing");
  if (a.status === "running") {
    if (!ty) { ty = document.createElement("div"); ty.className = "typing"; ty.innerHTML = "<i></i><i></i><i></i> Working"; }
    st.node.appendChild(ty);
  } else ty?.remove();
}
async function agentFetch(st, reset = false) {
  if (S.agentChat !== st || S.view?.kind !== "agent") return;
  try {
    const j = await api(`/api/session/${st.sid}/agent/${st.aid}${reset ? "" : `?from=${st.end}${st.sig ? "&sig=" + st.sig : ""}`}`);
    if (S.agentChat !== st || S.view?.kind !== "agent") return;
    st.agent = j.agent; st.sig = j.sig; // OpenCode child sessions: hash of what the phone has
    const stick = reset || nearBottom();
    if (reset || j.reset || j.items.length) renderChatItems(st, j.items, { reset: reset || !!j.reset, start: j.start });
    st.end = j.end;
    const older = st.node.querySelector(".older");
    if (older) older.onclick = () => agentOlder(st);
    updateAgentChrome();
    if (stick) scrollChatToEnd(true);
  } catch (e) {
    if (reset) st.node.innerHTML = `<div class="muted" style="text-align:center;padding:30px">${esc(e.message)}</div>`;
  }
  // Follow it live while it runs (paused while the app is in the background).
  if (!st.agent || st.agent.status === "running") agentPoll = setTimeout(function tick() {
    if (document.visibilityState === "visible") agentFetch(st); else agentPoll = setTimeout(tick, 2500);
  }, 2500);
}
async function agentOlder(st) {
  const older = st.node.querySelector(".older");
  if (!older || st.loadingOlder) return;
  st.loadingOlder = true; older.textContent = "Loading…";
  try {
    const j = await api(`/api/session/${st.sid}/agent/${st.aid}?before=${st.start}`);
    const h0 = document.documentElement.scrollHeight;
    const { frag, results } = build(j.items, st);
    older.after(frag);
    for (const r of results) applyResult(r, st);
    st.start = j.start;
    if (!j.start) older.remove(); else older.textContent = "Show earlier";
    window.scrollTo(0, scrollY + document.documentElement.scrollHeight - h0);
  } catch (e) { toast(e.message, true); older.textContent = "Show earlier"; }
  st.loadingOlder = false;
}
// In a session's chat, an opened Agent/Task tool call links to that subagent's own chat.
document.addEventListener("toggle", async (e) => {
  const det = e.target;
  if (!det?.matches?.("#chat details.tool") || !det.open || det.dataset.agentLink || S.view?.kind !== "session") return;
  if (!/^(Agent|Task|subagent|task)$/.test(det.querySelector(".tn")?.textContent ?? "")) return; // Claude Code · OpenCode
  det.dataset.agentLink = "1";
  const sid = S.view.id;
  try {
    const { agents } = await api(`/api/session/${sid}/agents`);
    const a = agents.find((x) => x.toolUseId === det.dataset.id);
    if (!a) return;
    const b = document.createElement("a");
    b.className = "btn small ag-open"; b.href = `#/a/${sid}/${a.id}`;
    b.innerHTML = `${icon("agents")} Open subagent chat`;
    det.querySelector("summary").after(b);
  } catch {}
}, true);

// ───────── boot ─────────
history.scrollRestoration = "manual"; // Agents Away restores positions itself; the browser's guess fights it
applyPrefs();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((e) => { swError = e.message; if (S.view?.kind === "home") renderHome(); });
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.navigate) nav(e.data.navigate.replace(/^\/?/, "")); });
}
await loadState();
route();
connect();
setInterval(() => { if (S.view?.kind === "home" && document.visibilityState === "visible") renderHome(); }, 30000);
