/* Value Aqar service worker: shows push notifications only (no caching, so it never serves stale pages). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/notifications";
  event.waitUntil(self.registration.showNotification(data.title || "فاليو عقار", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    dir: "auto",
    lang: "ar",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/", self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url === target && "focus" in w) return w.focus();
    }
    const open = wins.find((w) => "navigate" in w);
    if (open) {
      const w = await open.navigate(target);
      return w ? w.focus() : self.clients.openWindow(target);
    }
    return self.clients.openWindow(target);
  })());
});
