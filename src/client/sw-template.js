const CACHE_VERSION = "__CACHE_VERSION__";
const SHELL = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/manifest.webmanifest",
  "/THIRD_PARTY_NOTICES.txt",
  "/api/tracks",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/icon-180.png",
  "/404.html",
];
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll([...SHELL, ...PRECACHE]))
      .then(() => {
        // Do not skipWaiting: an old tab may still be loading hashed chunks.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Keep older `mp-*` caches so open tabs can still load their hashed chunks
      // after a new worker takes control. Remove only legacy cache names.
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && !key.startsWith("mp-"))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function putInCache(request, response) {
  const cache = await caches.open(CACHE_VERSION);
  await cache.put(request, response);
}

async function cacheFirst(event, request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached =
    (await cache.match(request)) ??
    (await cache.match(request.url)) ??
    (await caches.match(request.url));
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    event.waitUntil(putInCache(request, response.clone()));
  }
  return response;
}

async function networkFirst(event, request, fallbackToShell = false) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(putInCache(request, response.clone()));
    }
    return response;
  } catch {
    const cached =
      (await cache.match(request)) ??
      (await cache.match(request.url)) ??
      (await caches.match(request.url));
    if (cached) {
      return cached;
    }
    if (fallbackToShell) {
      return (await cache.match("/index.html")) ?? (await cache.match("/")) ?? Response.error();
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event, event.request, true));
    return;
  }
  if (url.pathname === "/api/tracks") {
    event.respondWith(networkFirst(event, event.request));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (url.pathname.startsWith("/charts/")) {
    event.respondWith(networkFirst(event, event.request));
    return;
  }
  event.respondWith(cacheFirst(event, event.request));
});
