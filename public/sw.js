/* Slate service worker: runtime caching only.
 *
 * - Static assets (/_next/static, icons): cache-first; they are content-hashed.
 * - Navigations: network-first, falling back to the cached copy, then /offline.
 * - API and auth routes: never cached.
 */
const VERSION = "slate-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

function isNeverCached(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        try {
          const res = await fetch(request);
          // Personal pages are served with no-store; only cache what the server allows.
          const cc = res.headers.get("Cache-Control") || "";
          if (res.ok && !/no-store|private/i.test(cc)) cache.put(request, res.clone());
          return res;
        } catch {
          const hit = await cache.match(request);
          return hit || (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
  }
});

// Sign-out clears everything cached for this origin.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_CACHES") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});
