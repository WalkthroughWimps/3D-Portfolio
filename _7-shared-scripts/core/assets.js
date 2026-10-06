import { DEFAULT_ASSET_ORIGIN, hostedKey, normalizeAssetsBase, isLocalHost } from './asset-policy.js';

export function resolveAssetsBase({ pageUrl, query = '', stored = null, report = () => {} } = {}) {
  const page = new URL(pageUrl);
  const params = new URLSearchParams(query || page.search);
  const candidates = [params.has('assetsBase') ? ['query', params.get('assetsBase')] : null, stored !== null ? ['storage', stored] : null].filter(Boolean);
  for (const [source, value] of candidates) {
    const base = normalizeAssetsBase(value, page);
    if (base !== null) return base;
    report({ source, code: 'invalid-assets-base', value });
  }
  return isLocalHost(page.hostname) ? '' : `${DEFAULT_ASSET_ORIGIN}/`;
}
export function resolveAsset(input, { pageUrl, siteBaseUrl, assetsBase = '' } = {}) {
  if (typeof input !== 'string' || !input) throw new TypeError('Asset path must be a nonempty string');
  if (/^(https?:)?\/\//i.test(input) || /^(blob:|data:|about:|mailto:)/i.test(input)) return input;
  const siteBase = new URL(siteBaseUrl);
  const absolute = new URL(input, pageUrl);
  const sitePath = absolute.origin === siteBase.origin && absolute.pathname.startsWith(siteBase.pathname)
    ? absolute.pathname.slice(siteBase.pathname.length) : null;
  const key = sitePath === null ? null : hostedKey(sitePath);
  const base = normalizeAssetsBase(assetsBase, pageUrl);
  if (key && base) return new URL(`${key}${absolute.search}${absolute.hash}`, base).href;
  return absolute.href;
}
export function createAssets({ pageUrl = globalThis.document?.baseURI, siteBaseUrl = new URL('../../', import.meta.url).href, assetsBase, query, stored, report } = {}) {
  const base = assetsBase === undefined ? resolveAssetsBase({ pageUrl, query, stored, report }) : assetsBase;
  return Object.freeze({
    pageUrl, siteBaseUrl, assetsBase: base,
    resolve: input => resolveAsset(input, { pageUrl, siteBaseUrl, assetsBase: base }),
    fromKey: key => {
      const path = String(key).replace(/^\/+/, '');
      const hosted = hostedKey(path);
      return hosted && base ? new URL(hosted, normalizeAssetsBase(base, pageUrl)).href : new URL(path, siteBaseUrl).href;
    },
    fromSite: path => new URL(String(path).replace(/^\/+/, ''), siteBaseUrl).href
  });
}
