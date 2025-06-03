const VERSION = "1.3.1";
const CACHE_NAME = `bible-app-cache-V${VERSION}`;
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./crossrefs.json",
  "./topics.json",
  "./KJV.json",
  "./main.js",
  "./main.css",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon.ico",
];

// Install event: Cache files
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log("Opened cache");
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // Immediately activate the new service worker
});

const skipCache = false;

// Fetch event: Serve cached content when offline or force bypass cache
self.addEventListener("fetch", event => {
  if (event.request.url.endsWith("/version")) {
    console.log("Version request intercepted");
    event.respondWith(
      new Response(VERSION, { status: 200, headers: { "Content-Type": "text/plain" } })
    );
  } else {
    if (skipCache) {
      console.log("Skipping cache for:", event.request.url);
      event.respondWith(fetch(event.request));
      return;
    }
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  }
});

// Activate event: Clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log("Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Immediately control all clients
});
