/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try {
    data = event.data ? JSON.parse(event.data.text()) : {};
  } catch {
    data = { title: "Recomp Tracker", body: event.data?.text() || "Reminder" };
  }
  const title = data.title || "Recomp Tracker";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Checklist reminder",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "checklist-reminder",
      data: { url: data.url || "/lists" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/lists";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            await (client as WindowClient).navigate(url);
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

export {};
