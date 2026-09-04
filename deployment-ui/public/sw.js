// Minimal, hand-written service worker (no Workbox/vite-plugin-pwa) - this
// app already has a carefully tuned CSP and Cache-Control setup (see
// vite.config.js's writeSecurityHeadersPlugin, which deliberately sets
// index.html to no-cache specifically so a redeploy is never masked by a
// stale cached page), so a generated SW risked fighting that instead of
// working with it. Two rules only:
//   1. The HTML page itself is ALWAYS fetched fresh over the network when
//      online - never served from cache while a real connection exists.
//      Only offline (network genuinely fails) does it fall back to
//      whatever was last cached, so this can never itself be the reason
//      someone's stuck on a stale build after a redeploy - that's still
//      entirely governed by index.html's own Cache-Control header.
//   2. Hashed static assets (/assets/*.js, *.css, fonts, images) are safe
//      to cache-first indefinitely - Vite's build gives every one of them
//      a content hash in its filename, so a new deploy produces entirely
//      NEW filenames rather than overwriting old ones. Old cache entries
//      just go unused, never mismatched with the page that references
//      them.
// Nothing under /api/ (a different origin - see apiBase.js) or any
// non-GET request is ever touched - this is purely a static-shell cache
// for fast repeat loads and basic offline support, not an API cache
// (deployment status, run history, etc. must always be live).

const CACHE_NAME = "deploy-portal-shell-v1";
const APP_SHELL = ["/", "/manifest.json", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Navigation (the HTML document itself) - network-first, cache only as
  // an offline fallback. See this file's own header comment for why this
  // must never serve a stale cached page while actually online.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Content-hashed static assets - cache-first, populate on first miss.
  if (/\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
      )
    );
  }
});
