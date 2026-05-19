/* eslint-disable */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: "Thông báo", body: event.data.text() };
  }
  const title = payload.title || "Thông báo";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag,
    renotify: !!payload.tag,
    requireInteraction: !!payload.requireInteraction,
    data: { url: payload.url || "/" },
  };
  const tasks = [self.registration.showNotification(title, options)];
  if (typeof self.navigator !== "undefined" && "setAppBadge" in self.navigator) {
    const count = typeof payload.badgeCount === "number" ? payload.badgeCount : undefined;
    tasks.push(
      self.navigator
        .setAppBadge(count)
        .catch(() => {}),
    );
  }
  event.waitUntil(Promise.all(tasks));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          try {
            const u = new URL(c.url);
            if (u.pathname.startsWith(url.split("?")[0]) && "focus" in c) {
              c.navigate ? c.navigate(url) : null;
              return c.focus();
            }
          } catch {}
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
