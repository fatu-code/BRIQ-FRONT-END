const CACHE = "briq-v2";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./config.js", "./manifest.json"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.pathname.startsWith("/api") || u.host.includes("railway.app")) return; // never touch the API
  if (u.origin !== location.origin) return; // ignore cross-origin (fonts, etc.)
  // Network-first: always try the freshest deploy, fall back to cache only when offline.
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
