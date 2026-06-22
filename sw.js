const CACHE = "briq-v1";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./config.js", "./manifest.json"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith("/api") || u.host.includes("railway.app")) return; // never cache API
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
