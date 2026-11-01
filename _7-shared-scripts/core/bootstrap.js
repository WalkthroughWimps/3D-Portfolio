import { createScope } from './lifecycle.js';
import { getSharedSettings } from './settings.js';
import { createAssets } from './assets.js';
import { enhanceHeader } from './header.js';
import { mountPageSummary } from './page-summary.js';
import { mountPageShortcuts } from './page-shortcuts.js';
import { mountKeyboardHints } from './keyboard-hints.js';
import { initPanelShell } from '../../debug/panel-shell.js';
import { mountCollapsibleSections } from '../panel-assembly/CollapsibleSections.mjs';
import { mountNumericInputs } from './numeric-input.js';
import { mountStickyNotes } from '../sticky-notes/index.js';
import { createGeneralConstructor, mountGeneralConstructorTransfer } from '../constructor/general.js';

const instances = new WeakMap();
function applyA11y(snapshot, root) {
  const settings = snapshot.accessibility;
  const element = root.documentElement || root.ownerDocument?.documentElement;
  if (!element) return;
  element.classList.toggle('a11y-motion-reduced', !!settings.reducedMotion);
  element.classList.toggle('a11y-contrast-high', !!settings.highContrast);
  element.classList.toggle('a11y-focus-always', settings.focusOutline === 'always');
  element.dataset.shortcutHints = settings.shortcutHints;
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
      scope.defer(enhanceHeader(root, settings, { signal: scope.signal }));
      scope.defer(mountPageSummary({ pageId, root, scope }));
      scope.defer(mountNumericInputs(root));
      let panels;
      const shortcuts = mountPageShortcuts({ pageId, root, scope, getPanels: () => panels });
      const informationFolds = mountCollapsibleSections(root.body, { scope: `page:${pageId}:information`, group: 'information', headings: false, reorder: false, detailsSelector: '.scene-alternative' });
      scope.defer(() => informationFolds.dispose());
      if (pageId === 'graphics') {
        const controlFolds = mountCollapsibleSections(root.body, { scope: 'page:graphics:controls', group: 'shelf-controls', headings: false, reorder: false, detailsSelector: '#actions, .accessible-items' });
        scope.defer(() => controlFolds.dispose());
      }
      panels = initPanelShell({ scope });
      // Sticky notes are available on Graphics and Docs; saved notes on other pages remain intact.
      if (pageId === 'graphics' || pageId === 'docs') void mountStickyNotes({ pageId, root, settings, signal: scope.signal }).then(stickyNotes => {
        if (scope.disposed) { stickyNotes.dispose(); return; }
        scope.defer(() => stickyNotes.dispose());
        const generalConstructor = createGeneralConstructor({ root, stickyNotes });
        scope.defer(panels.registerConstructorContext('general', 'General', generalConstructor));
        const transfer = mountGeneralConstructorTransfer(generalConstructor, stickyNotes);
        scope.defer(() => transfer.dispose());
      }).catch(error => {
        if (!scope.signal.aborted) console.warn('Sticky notes could not start', error);
      });
      let mounted;
      let sceneSuspended = false;
      const suspensionReasons = new Set();
      const suspendFor = reason => {
        suspensionReasons.add(reason);
        if (mounted && !sceneSuspended) { sceneSuspended = true; mounted.suspend?.(); }
      };
      const resumeFor = reason => {
        suspensionReasons.delete(reason);
        if (scope.signal.aborted || root.hidden || suspensionReasons.size || !sceneSuspended) return;
        sceneSuspended = false;
        settings.refresh({ source: 'system' });
        mounted?.resume?.();
      };
      const api = {
        suspend() { suspendFor('api'); },
        resume() { resumeFor('api'); },
        async dispose() { await scope.dispose(); instances.get(root)?.delete(pageId); }
      };
      if (root.hidden) suspendFor('hidden');
      scope.listen(root, 'visibilitychange', () => root.hidden ? suspendFor('hidden') : resumeFor('hidden'));
      scope.listen(globalThis, 'pagehide', event => event.persisted ? suspendFor('pagehide') : void api.dispose());
      scope.listen(globalThis, 'pageshow', () => resumeFor('pagehide'));
      if (diagnostics) await import('../../debug/debug-loader.js').then(module => module.loadDebugIfEnabled?.());
      mounted = await mount({ settings, assets, scope, keyboardActions: shortcuts.actions });
      if (typeof mounted === 'function') scope.defer(mounted);
      else if (mounted?.dispose) scope.defer(() => mounted.dispose());
      if (suspensionReasons.size || root.hidden) { sceneSuspended = true; mounted?.suspend?.(); }
      scope.defer(mountKeyboardHints({ actions: shortcuts.actions, pageId, root }));
      return api;
    } catch (error) {
      root.defaultView?.dispatchEvent(new root.defaultView.Event('site:startup-failed'));
      await scope.dispose();
      instances.get(root)?.delete(pageId);
      throw error;
    }
  })();
  if (!instances.has(root)) instances.set(root, new Map());
  instances.get(root).set(pageId, work);
  return work;
}
