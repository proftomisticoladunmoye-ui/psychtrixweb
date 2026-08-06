/* Psychtrix Web service worker — offline app shell + runtime asset caching.
 *
 * Strategy:
 *   • /api/*            → network only (auth + live data are never cached).
 *   • navigations       → network-first, falling back to the cached shell so
 *                         the app opens offline (the SPA then routes locally).
 *   • same-origin GETs  → stale-while-revalidate (instant from cache, refreshed
 *                         in the background). Hashed /assets/* are immutable, so
 *                         this is safe and self-updating across deploys.
 *
 * Bump CACHE_VERSION to force a full refresh of cached assets.
 */
const CACHE_VERSION = 'psychtrix-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/pwa-icon.svg'];

self.addEventListener('install', (event) => {
  // Note: no skipWaiting() here — a new version waits until the user accepts the
  // update prompt (postMessage SKIP_WAITING), so it never reloads work in progress.
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // let cross-origin pass through
  if (url.pathname.startsWith('/api/')) return;         // never cache API / auth / live data

  // Navigations: try the network, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('/index.html') || caches.match('/'))),
    );
    return;
  }

  // Other same-origin GETs: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      }),
    ),
  );
});
