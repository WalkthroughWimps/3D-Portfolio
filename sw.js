// Minimal service worker to cache intro assets for seamless playback
const CACHE_NAME = 'intro-cache-v2';

function normalizeBase(base) {
  if (!base) return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function normalizePath(p) {
  if (!p) return "";
  return p.startsWith("/") ? p : `/${p}`;
}

const ASSETS_BASE = (() => {
  const host = self.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "";
  return "https://assets.matthallportfolio.com";
})();

function assetUrl(path) {
  if (typeof path === "string" && /^https?:\/\//i.test(path)) return path;
  const base = normalizeBase(ASSETS_BASE);
  if (!base) return path;
  return `${base}${normalizePath(path)}`;
}

const INTRO_ASSETS = [
  assetUrl('/Renders/tablet-animation.webm')
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(INTRO_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (INTRO_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          const respClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, respClone));
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
