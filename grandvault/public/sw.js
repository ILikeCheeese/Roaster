/*
 * GrandVault service worker — makes the iPad PWA work fully offline.
 *
 * Strategy: cache-first for every same-origin GET. On the first (online) launch
 * the app shell, the OCR assets, and the AI model files are all fetched and
 * cached; every launch after that is served from the cache with no network.
 */
const CACHE = 'grandvault-v1';

// Minimal shell precache; everything else (JS chunks, models, wasm) is cached
// on first fetch below.
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch the network for cross-origin

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Cache successful, basic responses (including opaque-safe same-origin).
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
