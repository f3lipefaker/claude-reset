const CACHE = "reset-radar-v3";
const ARQUIVOS = ["./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// rede primeiro; offline usa a cópia salva (a API do servidor nunca é guardada)
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.pathname.includes("/api/")) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const cp = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request))
  );
});
// notificação enviada pelo servidor, mesmo com o app fechado
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || "Reset Radar", {
    body: d.body || "", tag: d.tag || "reset", renotify: true,
    icon: "icon-192.png", badge: "icon-192.png", requireInteraction: true
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type: "window", includeUncontrolled: true}).then(list => {
      for (const c of list) if ("focus" in c) return c.focus();
      return self.clients.openWindow("./");
    })
  );
});
