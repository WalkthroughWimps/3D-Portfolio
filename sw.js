// Minimal service worker to cache intro assets for seamless playback
const CACHE_NAME = 'intro-cache-v4';
if (typeof importScripts === 'function') importScripts('./sw-asset-config.js');
const assetConfig = self.SITE_WORKER_ASSET_CONFIG || {
  introAssetKey: 'Renders/tablet-animation.webm',
  defaultAssetOrigin: 'https://assets.matthallportfolio.com'
};
const siteScope = self.registration?.scope || `${self.location.origin}/`;
const localWorker = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(self.location.hostname);
const introTarget = localWorker
  ? new URL(assetConfig.introAssetKey, siteScope)
  : new URL(assetConfig.introAssetKey, `${assetConfig.defaultAssetOrigin}/`);

const INTRO_ASSETS = [
  localWorker ? introTarget.pathname : introTarget.href
];

function introAssetKey(requestUrl) {
  const url = new URL(requestUrl);
  return INTRO_ASSETS.find((asset) => {
    const expected = new URL(asset, self.location.origin);
    return url.origin === expected.origin && url.pathname === expected.pathname;
  });
}

function cacheable(response) {
  return response && response.status === 200 && !response.headers?.has('content-range') && response.type !== 'opaque';
}

function rangeResponse(request, cached) {
  const value = request.headers?.get('range');
  if (!value) return cached;
  const size = Number(cached.headers.get('content-length'));
  if (!Number.isSafeInteger(size) || size < 0) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */0', 'Accept-Ranges': 'bytes' } });
  const unsatisfied = () => new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return unsatisfied();
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) return unsatisfied();
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return unsatisfied();
    end = Math.min(end, size - 1);
  }
  return cached.arrayBuffer().then((buffer) => {
    const headers = new Headers(cached.headers);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(buffer.slice(start, end + 1), { status: 206, headers });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => Promise.all(INTRO_ASSETS.map(async (asset) => {
      try {
        const response = await fetch(asset);
        if (cacheable(response)) await cache.put(asset, response.clone());
      } catch { /* Fetch will retry when online. */ }
    })))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('intro-cache-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', (event) => {
  const asset = introAssetKey(event.request.url);
  if (asset && event.request.method === 'GET') {
    event.respondWith((async () => {
      let cache = null, cached = null;
      try { cache = await caches.open(CACHE_NAME); cached = await cache.match(asset); } catch { /* Cache is best effort. */ }
      if (cached) {
        try { return await rangeResponse(event.request, cached); } catch { /* Corrupt or opaque cache entries fall through to network. */ }
      }
      try {
        const response = await fetch(event.request);
        if (!event.request.headers?.has('range') && cacheable(response)) {
          try { cache ||= await caches.open(CACHE_NAME); await cache.put(asset, response.clone()); } catch { /* Never fail a successful media response because caching failed. */ }
        }
        return response;
      } catch {
        return Response.error();
      }
    })());
  }
});
