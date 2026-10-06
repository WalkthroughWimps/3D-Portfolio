import { createScope } from './lifecycle.js';
import { getSharedSettings } from './settings.js';
import { createAssets } from './assets.js';
import { enhanceHeader } from './header.js';

const instances = new WeakMap();
function applyA11y(snapshot, root) {
  const settings = snapshot.accessibility;
  const element = root.documentElement || root.ownerDocument?.documentElement;
  if (!element) return;
  element.classList.toggle('a11y-motion-reduced', !!settings.reducedMotion);
  element.classList.toggle('a11y-contrast-high', !!settings.highContrast);
  element.classList.toggle('a11y-focus-always', settings.focusOutline === 'always');
  element.style.setProperty('--font-scale', String(settings.textScale));
  element.style.setProperty('--contrast-level', settings.highContrast ? '1' : '0');
}
export function bootstrapPage({ pageId, root = document, mount = () => {}, diagnostics = false } = {}) {
  if (!pageId || !root) return Promise.reject(new TypeError('pageId and root are required'));
  const existing = instances.get(root)?.get(pageId);
  if (existing) return existing;
  const scope = createScope();
  const work = (async () => {
    try {
      const settings = getSharedSettings();
      globalThis.__siteSettings = settings;
      const assets = createAssets({ pageUrl: root.baseURI, stored: (() => { try { return localStorage.getItem('ASSETS_BASE'); } catch { return null; } })() });
      settings.subscribe(snapshot => {
        applyA11y(snapshot, root);
        if (globalThis.siteConfig) {
          globalThis.siteConfig.volume = snapshot.audio.volume;
          globalThis.siteConfig.audioSyncMs = snapshot.audio.syncMs;
        }
      }, { signal: scope.signal, immediate: true });
      enhanceHeader(root);
      if (diagnostics) await import('../../debug/debug-loader.js').then(module => module.loadDebugIfEnabled?.());
      const mounted = await mount({ settings, assets, scope });
      if (typeof mounted === 'function') scope.defer(mounted);
      else if (mounted?.dispose) scope.defer(() => mounted.dispose());
      let suspended = false;
      const api = {
        suspend() { if (suspended) return; suspended = true; mounted?.suspend?.(); },
        resume() { if (!suspended) return; suspended = false; settings.refresh({ source: 'system' }); mounted?.resume?.(); enhanceHeader(root); },
        async dispose() { await scope.dispose(); instances.get(root)?.delete(pageId); }
      };
      scope.listen(globalThis, 'pagehide', event => event.persisted ? api.suspend() : void api.dispose());
      scope.listen(globalThis, 'pageshow', () => api.resume());
      return api;
    } catch (error) {
      await scope.dispose();
      instances.get(root)?.delete(pageId);
      throw error;
    }
  })();
  if (!instances.has(root)) instances.set(root, new Map());
  instances.get(root).set(pageId, work);
  return work;
}
