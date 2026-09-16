/*
 * Ridge service worker — hand-written, no Workbox.
 *
 * Its whole job is build-plan M4: "Visit capture ... works offline and
 * syncs when reception returns". The syncing half lives in the IndexedDB
 * outbox (src/lib/offline/); this file is the other half — making the app
 * actually load when the roofer is standing on a roof with no signal.
 *
 * Deliberately NOT using the Background Sync API: it doesn't exist on iOS
 * Safari, which is the device this feature is for. The outbox flushes in
 * the foreground instead, on the `online` event and when the app is
 * reopened.
 */
const CACHE_VERSION = "ridge-v1";
const OFFLINE_URL = "/offline";

// Only the offline fallback is precached. Everything else is cached as the
// roofer visits it — precaching Next.js's hashed bundles would mean
// guessing filenames that change every build.
const PRECACHE = [OFFLINE_URL];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Anything that changes data on the server is left completely alone.
 *
 * Server actions are POSTs carrying a Next-Action header, and a cached or
 * replayed one would be a phantom write. Offline writes are the outbox's
 * job, not the cache's — it queues them deliberately, with an idempotency
 * key the database checks.
 */
function isWrite(request) {
  return request.method !== "GET" || request.headers.has("Next-Action");
}

/** Next's build output is content-hashed, so a hit is always valid. */
function isStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon-");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (isWrite(request) || url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    // Network first: the roofer should see today's real data whenever he
    // can, and a stale page is only better than no page at all.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match(OFFLINE_URL)) ?? Response.error()),
    );
  }
});
