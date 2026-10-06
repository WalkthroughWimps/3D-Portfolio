// Compatibility facade for existing pages; core/assets.js owns URL policy.
import { createAssets } from './core/assets.js';
import { DEFAULT_ASSET_ORIGIN, isLocalHost } from './core/asset-policy.js';

export function isLocalDev() {
  const host = window.location.hostname;
  return isLocalHost(host);
}

export const ASSET_ORIGIN = DEFAULT_ASSET_ORIGIN;

const storedBase = (() => { try { return localStorage.getItem('ASSETS_BASE'); } catch { return null; } })();
const assets = createAssets({ pageUrl: window.location.href, stored: storedBase,
  report: issue => console.warn('[assets] invalid base override', issue) });
export const ASSETS_BASE = assets.assetsBase;

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
  return assets.resolve(path);
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
} catch { /* ignore */ }
