const VERSION = "2.2.1";
const CACHE_NAME = `bible-app-cache-V${VERSION}`;
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./crossrefs.json",
  "./topics.json",
  "./translations.json",
  "./main.js",
  "./main.css",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon.ico",
];

// Install event: Cache files
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting(); // Immediately activate the new service worker
});

// Fetch event: Serve cached content when offline or force bypass cache
self.addEventListener("fetch", event =>
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)))
);

// Activate event: Clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(cacheNames =>
        Promise.all(cacheNames.map(cacheName => cacheName !== CACHE_NAME && caches.delete(cacheName)))
      )
  );
  self.clients.claim(); // Immediately control all clients
});
