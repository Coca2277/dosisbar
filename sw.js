/* Dosis Bar — service worker : l'app s'ouvre même sans réseau.
   Les données (Supabase) ne passent jamais par ce cache. */
const VERSION = "dosis-v12";
const SHELL = ["app.html", "index.html", "css/site.css", "img/app-home.webp", "css/app.css", "js/app.js", "js/config.js", "js/vendor/supabase.js", "js/scan.js", "js/import.js", "js/vendor/xlsx.mini.min.js", "js/vendor/zxing.min.js",
  "manifest.webmanifest", "fonts/figtree.woff2", "fonts/bricolage-grotesque.woff2", "mentions-legales.html", "confidentialite.html", "conditions.html", "css/doc.css", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.hostname.endsWith("supabase.co") || url.pathname.includes("/auth/v1/") || url.pathname.includes("/rest/v1/")) return;
  // Fichiers de l'app : réseau d'abord (toujours la dernière version), cache si hors ligne
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch: true}).then(r => r || caches.match(url.pathname.endsWith("/") || url.pathname.endsWith("index.html") ? "index.html" : "app.html"))));
    return;
  }
});
