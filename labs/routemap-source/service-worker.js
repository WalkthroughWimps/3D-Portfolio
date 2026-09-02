"use strict";

const CACHE = "rv-route-map-shell-v1";
const SCOPE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const SHELL = ["", "/", "/index.html", "/styles.css", "/accessibility.css", "/accessibility.js", "/map.js", "/scripts/pwa.js"].map(path => `${SCOPE}${path}` || "/");

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/admin/api/")) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && response.type === "basic") caches.open(CACHE).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
