'use strict';
// Network first, cache as fallback, so the one-phone games also open without a connection. The API is never cached.
const CACHE = 'boombox-shell-v1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'online.js', 'boxes.js', 'wolflocal.js', 'manifest.webmanifest', 'icon-192.png', 'locales/index.json', 'locales/en.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((m) => m || caches.match('index.html')))
  );
});
