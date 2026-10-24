(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CakeAppearanceSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CAKE_IDS = Object.freeze(['redVelvet', 'vanilla', 'lemon', 'white', 'chocolate', 'carrot', 'pistachio']);
  const PAGE_IDS = Object.freeze(['home', 'flavors', 'gallery', 'about', 'order', 'custom']);
  const DEFAULT_CAKE = 'redVelvet';

  function defaults() {
    return { random: true, defaultCake: DEFAULT_CAKE, pages: Object.fromEntries(PAGE_IDS.map(page => [page, ''])) };
  }

  function normalize(input) {
    if (input === undefined || input === null) return defaults();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Appearance settings must be an object.');
    if (input.random !== undefined && typeof input.random !== 'boolean') throw new TypeError('Appearance random must be a boolean.');
    const result = defaults();
    result.random = input.random === undefined ? result.random : input.random;
    if (input.defaultCake !== undefined) {
      if (typeof input.defaultCake !== 'string' || !CAKE_IDS.includes(input.defaultCake)) throw new TypeError('Appearance default cake is not a native cake style.');
      result.defaultCake = input.defaultCake;
    }
    if (input.pages !== undefined && (!input.pages || typeof input.pages !== 'object' || Array.isArray(input.pages))) throw new TypeError('Appearance page assignments must be an object.');
    for (const page of PAGE_IDS) {
      const value = input.pages?.[page];
      if (value === undefined || value === '') continue;
      if (typeof value !== 'string' || !CAKE_IDS.includes(value)) throw new TypeError(`Appearance assignment for ${page} is not a native cake style.`);
      result.pages[page] = value;
    }
    return result;
  }

  function choose(settings, page, randomFn = Math.random, allowedCakeIds = CAKE_IDS) {
    const normalized = normalize(settings);
    if (typeof page !== 'string' || !PAGE_IDS.includes(page)) throw new TypeError('Unknown appearance page.');
    if (normalized.pages[page]) return normalized.pages[page];
    if (!normalized.random) return normalized.defaultCake;
    const allowed = Array.isArray(allowedCakeIds) ? [...new Set(allowedCakeIds.filter(id => CAKE_IDS.includes(id)))] : [];
    if (!allowed.length) return normalized.defaultCake;
    const sample = typeof randomFn === 'function' ? Number(randomFn()) : 0;
    const index = Math.max(0, Math.min(allowed.length - 1, Math.floor((Number.isFinite(sample) ? sample : 0) * allowed.length)));
    return allowed[index];
  }

  return Object.freeze({ CAKE_IDS, PAGE_IDS, defaults, normalize, choose });
});
