// Bump VERSION whenever these public resources change. Never cache private pages.
const VERSION = 'kdru-public-v1';
const PUBLIC = ['/offline.html', '/offline.css', '/offline.js', '/manifest.webmanifest', '/assets/icon-192.png', '/assets/icon-512.png'];
const allowed = new Set(PUBLIC.map(path => new URL(path, self.location.origin).href));
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(VERSION);
  for (const path of PUBLIC) {
    const response = await fetch(path, { cache: 'reload', credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('Public offline resources unavailable');
    await cache.put(path, response);
  }
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if ((key.startsWith('kdru-public-') || key.startsWith('university-it-shell-')) && key !== VERSION) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { const response = await fetch(request); if (response.status < 500) return response; } catch { /* Safe public fallback only. */ }
      return (await caches.open(VERSION)).match('/offline.html');
    })());
  } else if (allowed.has(request.url)) {
    event.respondWith((async () => (await (await caches.open(VERSION)).match(request)) || fetch(request))());
  }
});
