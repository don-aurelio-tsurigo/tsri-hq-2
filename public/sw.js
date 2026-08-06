/* Tsüri HQ — minimal service worker for installability (no offline caching). */
const VERSION = "tsuri-hq-pwa-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("tsuri-hq-") && key !== VERSION)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

// Required by Chromium installability heuristics: a fetch handler must exist.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
