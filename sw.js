// sw.js — Quiet Daily offline cache (with cache version reporting)

const APP_CACHE_VERSION = "v7";          // <-- bump when you want to force refresh
const CACHE_NAME = "quiet-daily-v7";     // <-- keep aligned with APP_CACHE_VERSION

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./sw.js"
];

// Install: cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k)))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first, then network; cache new GET responses
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // Only cache successful basic responses
          if (!res || res.status !== 200 || res.type !== "basic") return res;

          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => {
          // Offline fallback for navigation
          if (req.mode === "navigate") return caches.match("./index.html");
          return cached; // might be undefined; that's okay
        });
    })
  );
});

// Message handler: allow app.js to ask which cache version is active
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "GET_CACHE_VERSION") {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ cacheVersion: APP_CACHE_VERSION });
    }
  }
});
