const VERSION = "v5"; // 大きく変えたらここを上げる
const CACHE = `onecode-${VERSION}`;
const SHELL = [
  "/", "/client.html", "/read.html", "/404.html",
  "/css/main.css", "/js/client.js", "/js/read.js", "/js/pwa.js",
  "/manifest.json", "/favicon.ico",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
  "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
];
const RUNTIME_ORIGINS = [
  "https://cdn.jsdelivr.net",
];

// リダイレクト済みレスポンスは、ナビゲーションで返すと拒否されるので作り直す
const clean = async (res) =>
  res.redirected
    ? new Response(await res.blob(), {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      })
    : res;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 1つ失敗してもinstallを落とさない
    await Promise.allSettled(SHELL.map(async (path) => {
      const res = await fetch(path, { cache: "reload" });
      if (res.ok) await cache.put(path, await clean(res));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, (await clean(res)).clone());
    return res;
  } catch {
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (await cache.match("/")) ||
      Response.error()
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then(async (res) => {
      if (res.ok) await cache.put(request, (await clean(res)).clone());
      return res;
    })
    .catch(() => hit);
  return hit || update;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const requestUrl = new URL(req.url);
  if (requestUrl.origin !== self.location.origin && !RUNTIME_ORIGINS.includes(requestUrl.origin)) return;

  event.respondWith(
    req.mode === "navigate" ? networkFirst(req) : staleWhileRevalidate(req),
  );
});