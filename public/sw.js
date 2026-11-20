// Agents Away service worker: push notifications + notification actions.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let p = {};
  try { p = event.data.json(); } catch { p = { title: "Agents Away", body: event.data?.text() ?? "" }; }
  const opts = {
    body: p.body,
    tag: p.tag,
    renotify: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge.png",
    image: p.image,
    data: p,
    actions: p.actions ?? [],
    requireInteraction: p.kind === "attention" || p.kind === "review",
    vibrate: p.kind === "attention" ? [80, 60, 80] : [40],
    timestamp: Date.now(),
  };
  event.waitUntil(self.registration.showNotification(p.title ?? "Agents Away", opts));
});

async function post(path, body) {
  const r = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json", "x-away": "1" },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
}

async function openUrl(url) {
  const target = new URL(url, self.location.origin);
  // Outside the app (e.g. a release page on GitHub): open it in the browser.
  if (target.origin !== self.location.origin) return self.clients.openWindow(target.href);
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const hash = target.hash;
  for (const c of all) {
    if (new URL(c.url).origin === self.location.origin) {
      await c.focus();
      c.postMessage({ navigate: hash });
      return;
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const d = n.data ?? {};
  n.close();
  event.waitUntil((async () => {
    try {
      if (event.action === "approve" && d.sessionId) {
        await post(`/api/session/${d.sessionId}/approve`, { key: d.promptKey ?? "" });
        await self.registration.showNotification("Allowed", { body: d.title, tag: d.tag, icon: "/icons/icon-192.png", badge: "/icons/badge.png", silent: true });
        setTimeout(async () => (await self.registration.getNotifications({ tag: d.tag })).forEach((x) => x.close()), 2500);
        return;
      }
      if (event.action === "review-approve" && d.reviewId) {
        await post(`/api/review/${d.reviewId}/respond`, { decision: "approved" });
        await self.registration.showNotification("Approved", { body: d.title, tag: d.tag, icon: "/icons/icon-192.png", badge: "/icons/badge.png", silent: true });
        setTimeout(async () => (await self.registration.getNotifications({ tag: d.tag })).forEach((x) => x.close()), 2500);
        return;
      }
    } catch (e) {
      await self.registration.showNotification("Couldn't do that", { body: String(e.message || e), tag: d.tag, icon: "/icons/icon-192.png", badge: "/icons/badge.png", data: d });
      return;
    }
    await openUrl(d.url || "/");
  })());
});
