// PWA preparation only: deliberately NOT registered by the application.
// Review HTTPS, update delivery and institution policy before enabling.
// Only explicitly listed public shell assets are cacheable; no exports or API data.
const CACHE = 'university-it-shell-v1';
const SHELL = ['./index.html', './app/start.js', './app/main.js', './app/data.js', './app/i18n.js', './app/ui.js', './app/preferences.js', './app/styles.css', './assets/inventory.svg', './manifest.webmanifest'];
const allowed = new Set(SHELL.map(path => new URL(path, self.location.href).href));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('university-it-shell-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !allowed.has(event.request.url)) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
