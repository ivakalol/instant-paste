const CACHE_NAME = 'INSTANT-PASTE-KILLER-V1';

self.addEventListener('install', (event) => {
  // 1. Force this new service worker to install immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 2. Delete ALL existing caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('Service Worker: Clearing old cache', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // 3. Take control of the page immediately
      return self.clients.claim();
    })
  );
});

// 4. Intercept all requests and force them to go to the network
//    This bypasses the cache entirely.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});