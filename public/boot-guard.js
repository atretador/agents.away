// Loaded before app.js as a plain script. If the app never finishes starting (a script failed to load or threw,
// the server answered with an error), #app stays empty: a blank page with no header and no way out. After a few
// seconds, or at the first startup error, show a message with Reload and (in the Android app) Switch PC.
(() => {
  const NATIVE = window.AwayNative;
  const show = (why) => {
    if (window.__awayBooted || document.getElementById("away-boot-fail")) return;
    const box = document.createElement("div");
    box.id = "away-boot-fail";
    box.style.cssText = "font:16px system-ui,sans-serif;padding:32px 24px;max-width:480px;margin:0 auto;text-align:center;color:inherit";
    const h = document.createElement("h2");
    h.textContent = "This PC isn\u2019t responding properly";
    const p = document.createElement("p");
    p.style.opacity = ".75";
    p.textContent = "The app didn\u2019t start" + (why ? " (" + why + ")" : "") + ". It may still be coming up after a restart.";
    box.append(h, p);
    const btn = (label, fn) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "display:block;width:100%;margin-top:12px;padding:14px;font:inherit;border-radius:12px;border:1px solid currentColor;background:none;color:inherit";
      b.onclick = fn;
      box.append(b);
    };
    btn("Reload", () => location.reload());
    if (NATIVE && NATIVE.openProfiles) btn("Switch PC", () => NATIVE.openProfiles());
    (document.getElementById("app") || document.body).append(box);
  };
  window.__awayBootFail = show;
  window.addEventListener("error", (e) => { if (!window.__awayBooted) show(e.message || ""); });
  window.addEventListener("unhandledrejection", (e) => { if (!window.__awayBooted) show(String(e.reason?.message ?? e.reason ?? "")); });
  setTimeout(() => show("timed out"), 8000);
  // Retry by itself once the PC is back: the server's restart makes this page worth reloading.
  setTimeout(() => { if (!window.__awayBooted) location.reload(); }, 60000);
})();
