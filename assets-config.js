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

export const ASSET_ORIGIN = "https://assets.matthallportfolio.com";

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
  return ASSET_ORIGIN;
})();

console.info('[assets] base =', ASSETS_BASE);

let didLogAssetDiagnostics = false;
export function logAssetDiagnosticsOnce(sampleVideoPath = "Videos/videos-page/music-videos-hq.webm", sampleAudioPath = "Renders/tablet_animation_1.opus") {
  if (didLogAssetDiagnostics) return;
  didLogAssetDiagnostics = true;
  const isDev = isLocalDev() || new URLSearchParams(window.location.search || "").has("assetsDebug");
  if (!isDev) return;
  console.info('[assets] diagnostics', {
    base: ASSETS_BASE,
    video: assetUrl(sampleVideoPath),
    audio: assetUrl(sampleAudioPath)
  });
}

logAssetDiagnosticsOnce();

export function assetUrl(path) {
  if (typeof path === "string") {
    // Leave absolute URLs and special schemes untouched.
    if (/^https?:\/\//i.test(path)) return path;
    if (/^(blob:|data:|about:|mailto:)/i.test(path)) return path;
  }

  const base = normalizeBase(ASSETS_BASE);
  if (!base) return path; // local dev / disabled

  return `${base}/${String(path || "").replace(/^\/+/, "")}`;
}

const brokenAssets = new Set();

export function markBroken(url) {
  if (!url) return;
  brokenAssets.add(url);
}

export function isBroken(url) {
  if (!url) return false;
  return brokenAssets.has(url);
}

export function safeDrawImage(ctx, img, ...args) {
  if (!img || !img.complete || img.naturalWidth === 0) return false;
  if (isBroken(img.src)) return false;
  try {
    ctx.drawImage(img, ...args);
    return true;
  } catch (e) {
    console.warn("drawImage failed (likely CORS/CORP):", img.src, e);
    markBroken(img.src);
    return false;
  }
}

export async function corsProbe(testPath) {
  const url = assetUrl(testPath);
  try {
    const r = await fetch(url, { mode: "cors", credentials: "omit" });
    console.log("[CORS PROBE]", url, "status:", r.status, "ACAO:", r.headers.get("access-control-allow-origin"), "CORP:", r.headers.get("cross-origin-resource-policy"));
  } catch (e) {
    console.warn("[CORS PROBE FAILED]", url, e);
  }
}

// Expose to non-module scripts if needed.
try {
  window.assetUrl = assetUrl;
  window.safeDrawImage = safeDrawImage;
  window.markBroken = markBroken;
  window.isBroken = isBroken;
  window.corsProbe = corsProbe;
} catch (e) { /* ignore */ }
