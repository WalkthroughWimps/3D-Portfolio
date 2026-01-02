// assets-config.js
// Central place to control where large assets are served from (R2 via custom domain)

function normalizeBase(base) {
  if (!base) return "";
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

function normalizePath(p) {
  if (!p) return "";
  // Ensure exactly one leading slash
  return p.startsWith("/") ? p : `/${p}`;
}

export function isLocalDev() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export const ASSETS_BASE = (() => {
  const search = window.location.search || "";
  try {
    const params = new URLSearchParams(search);
    const qsBase = params.get("assetsBase");
    if (qsBase !== null) {
      return qsBase;
    }
  } catch (e) { /* ignore */ }

  try {
    const stored = localStorage.getItem("ASSETS_BASE");
    if (stored !== null) return stored;
  } catch (e) { /* ignore */ }

  // Local dev: serve from local project structure
  if (isLocalDev()) return "";

  // Production: serve from R2 custom domain (recommended)
  // If user uses a different subdomain, they can change it here.
  return "https://assets.matthallportfolio.com";
})();

console.info('[assets] base =', ASSETS_BASE);

export function assetUrl(path) {
  // Leave absolute URLs untouched
  if (typeof path === "string" && /^https?:\/\//i.test(path)) return path;

  const base = normalizeBase(ASSETS_BASE);
  if (!base) return path; // local dev / disabled

  return `${base}/${String(path || "").replace(/^\/+/, "")}`;
}
