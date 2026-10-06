export const DEFAULT_ASSET_ORIGIN = 'https://assets.matthallportfolio.com';
export const HOSTED_FAMILIES = Object.freeze(['assets/glb/', 'glb/', 'Videos/', 'Renders/', 'midi/', 'music/', 'soundboards/', 'soundfonts/']);
export const INTRO_ASSET_KEY = 'Renders/tablet-animation.webm';

export function hostedKey(sitePath) {
  const key = String(sitePath).replace(/^\/+/, '');
  const family = HOSTED_FAMILIES.find(prefix => key.toLowerCase().startsWith(prefix.toLowerCase()));
  return family === 'assets/glb/' ? `glb/${key.slice(family.length)}` : family ? key : null;
}
export function normalizeAssetsBase(value, pageUrl) {
  if (value === '') return '';
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, pageUrl);
    if (!/^https?:$/.test(url.protocol) || url.search || url.hash || url.username || url.password) return null;
    if (!/^https?:\/\//i.test(value) && !value.startsWith('/')) return null;
    return url.href.replace(/\/+$/, '') + '/';
  } catch { return null; }
}
export function isLocalHost(hostname) { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname); }
