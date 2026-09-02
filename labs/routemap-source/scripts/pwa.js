"use strict";

// The installed editor remains usable without a connection after it has been
// opened once. Project data itself is handled by the local-first sync module.
if ("serviceWorker" in navigator && globalThis.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    const scope = new URL("./", document.baseURI).pathname;
    navigator.serviceWorker.register(new URL("service-worker.js", document.baseURI), { scope }).catch(error => console.warn("Offline editor install is unavailable.", error));
  });
}
