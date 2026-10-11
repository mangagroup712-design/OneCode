const CACHE_NAME = "onecode-shell-v1";
const SHELL = [
  "/",
  "/index.html",
  "/client.html",
  "/read.html",
  "/404.html",
  "/css/main.css",
  "/js/client.js",
  "/js/read.js",
  "/js/pwa.js",
  "/manifest.json",
  "/favicon.ico",
];
const RUNTIME_HOSTS = [
  "cdn.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const shouldCacheRuntime = RUNTIME_HOSTS.includes(url.hostname);
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && (url.origin === self.location.origin || shouldCacheRuntime)) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        if (request.mode === "navigate") return caches.match("/index.html");
        return Response.error();
      });
    }),
  );
});
