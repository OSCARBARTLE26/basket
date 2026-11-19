// Basket service worker: lets the app open with no signal (handy in the shop).
// App files come from the cache first; price data is fetched fresh when online.
const VERSION = 'basket-v5';
const SHELL = [
  './', 'index.html', 'styles.css?v=5', 'app.js?v=5', 'manifest.webmanifest',
  'data/ingredients.json', 'data/recipes.json', 'data/sample-prices.json', 'data/prices.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isData = url.origin === location.origin && url.pathname.includes('/data/');
  const isAppFile = url.origin === location.origin;

  if (isData || isAppFile) {
    // Network first, so new prices and app updates show up; cache as a fallback.
    // Always check with the server (skip the browser's 10-minute cache) so page and code never mismatch.
    e.respondWith(
      fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }
  // Google Fonts: cache after first use.
  if (url.hostname.endsWith('gstatic.com') || url.hostname.endsWith('googleapis.com')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
    })));
  }
});
