"use strict";

// One runtime contract for direct file use, local HTTP development, and hosting.

const RV_RUNTIME_ENVIRONMENT = (() => {
  const currentLocation = globalThis.location || {
    protocol: "file:",
    hostname: "",
    href: "file:///"
  };
  const overrides = globalThis.RV_RUNTIME_CONFIG && typeof globalThis.RV_RUNTIME_CONFIG === "object"
    ? globalThis.RV_RUNTIME_CONFIG
    : {};
  const hostname = String(currentLocation.hostname || "").toLowerCase();
  const directFile = currentLocation.protocol === "file:";
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const hosted = /^https?:$/.test(currentLocation.protocol) && !localHost;
  const mode = overrides.mode || (directFile ? "local-file" : localHost ? "local-http" : "production");
  const proxyEnabled = typeof overrides.proxyEnabled === "boolean"
    ? overrides.proxyEnabled
    : hosted;
  const labsLocalOnly = overrides.labsLocalOnly === true;
  const proxyEndpoint = new URL(overrides.proxyEndpoint || "api/proxy.php", currentLocation.href).href;

  return Object.freeze({
    mode,
    directFile,
    localHost,
    hosted,
    publicSite: overrides.publicSite === true,
    labsLocalOnly,
    proxyEnabled,
    proxyEndpoint
  });
})();

function rvServiceRequestUrl(service, directUrl) {
  if (!RV_RUNTIME_ENVIRONMENT.proxyEnabled) return String(directUrl);
  const proxyUrl = new URL(RV_RUNTIME_ENVIRONMENT.proxyEndpoint);
  proxyUrl.searchParams.set("service", service);
  proxyUrl.searchParams.set("url", String(directUrl));
  return proxyUrl.href;
}

function rvServiceFetch(service, directUrl, options = {}) {
  return fetch(rvServiceRequestUrl(service, directUrl), options);
}
