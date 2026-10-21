import { getSharedSettings } from '../_7-shared-scripts/core/settings.js';
import {mountSettingsPortability} from '../_7-shared-scripts/core/settings-portability.js';
import { getPageDebugState, DEBUG_VISIBILITY_EVENT } from './debug-loader.js';
import {mountCollapsibleSections} from '../_7-shared-scripts/panel-assembly/CollapsibleSections.mjs';
import {mountPerformanceStats} from './performance-stats.js';

let instance;
const isReview = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('review');

export function initPanelShell({ scope } = {}) {
  if (instance) { scope?.defer(() => instance?.dispose()); return instance; }
  const review = isReview() || getPageDebugState(location.pathname);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./panel-shell.css', import.meta.url).href;
  document.head.append(link);
  const shell = document.createElement('div');
  shell.id = 'review-panels';
  shell.classList.toggle('has-debug', review);
  const aboutPage = document.body.dataset.page === 'about' || location.pathname.includes('/_1-about/');
  shell.innerHTML = `<aside class="review-panel review-panel--left is-closed" aria-label="Debug"><button type="button" class="review-panel-toggle" aria-expanded="false" aria-controls="review-debug-body">Debug</button><div id="review-debug-body" class="review-panel-body" inert><div class="review-panel-head"><strong>Debug</strong><button type="button" class="review-panel-close">Close</button></div><div class="review-panel-scroll" tabindex="0"></div></div></aside><aside class="review-panel review-panel--right is-closed" aria-label="General Settings"><button type="button" class="review-panel-toggle" aria-expanded="false" aria-controls="review-settings-body">General Settings</button><div id="review-settings-body" class="review-panel-body" inert><div class="review-panel-head"><div class="review-settings-tabs" role="tablist" aria-label="Settings sections"></div>${aboutPage ? '' : '<button type="button" class="review-panel-close">Close</button>'}</div><div class="review-panel-scroll" tabindex="0"></div></div></aside>`;
  document.body.append(shell);
  const left = shell.querySelector('.review-panel--left');
  const right = shell.querySelector('.review-panel--right');
  const tabs = right.querySelector('.review-settings-tabs');
  const body = right.querySelector('.review-panel-scroll');
  const pinnedControls = document.createElement('div');
  pinnedControls.className = 'review-settings-pinned';
  body.before(pinnedControls);
  const contextControls = new Map();
  const contexts = new Map();
  const constructorContexts = new Map();
  let constructorMode = false, normalContext = 'general';
  const constructorFooter = aboutPage ? document.createElement('div') : null;
  if (constructorFooter) {
    constructorFooter.className = 'review-constructor-footer';
    constructorFooter.innerHTML = '<button type="button" data-constructor-enter>Constructor mode <span>Experimental · edit cautiously; unexpected results are possible.</span></button><button type="button" data-constructor-exit hidden>Return to normal Settings</button>';
    body.after(constructorFooter);
  }
  const originalLocations = new Map();
  const originalHidden = new Map();
  const ownedContexts = new Map();
  const sectionControllers = new Map();
  const performanceStats = mountPerformanceStats(left.querySelector('.review-panel-scroll'), () => !left.classList.contains('is-closed'));
  const remember = node => { if (node && !originalLocations.has(node)) originalLocations.set(node, { parent: node.parentNode, next: node.nextSibling }); };
  let current = 'general';
  const store = getSharedSettings();
  let sideInterlock = null;
  const generations = new Map([[left, 0], [right, 0]]);
  const pending = new Set(), restoreTimers = new Map();
  const sideOf = panel => panel === left ? 'left' : 'right';
  const settingsIconStates = aboutPage ? [...document.querySelectorAll('.settings-icon')].map(icon => ({ icon, expanded: icon.getAttribute('aria-expanded'), controls: icon.getAttribute('aria-controls'), haspopup: icon.getAttribute('aria-haspopup') })) : [];
  function syncAboutSettingsIcon() {
    const expanded = String(!right.classList.contains('is-closed') || pending.has(right));
    for (const { icon } of settingsIconStates) { icon.setAttribute('aria-expanded', expanded); icon.setAttribute('aria-controls', 'review-settings-body'); }
  }
  function registerSideInterlock(interlock) {
    sideInterlock = interlock;
    for (const panel of [left, right]) interlock.onChange?.(sideOf(panel), !panel.classList.contains('is-closed') || pending.has(panel));
    return () => { if (sideInterlock === interlock) sideInterlock = null; };
  }
  function applyClosed(panel, closed) {
    panel.classList.toggle('is-closed', closed);
    panel.querySelector('.review-panel-toggle').setAttribute('aria-expanded', String(!closed));
    panel.querySelector('.review-panel-body').inert = closed;
    if (panel === right && aboutPage) syncAboutSettingsIcon();
    if (panel === left) performanceStats.refresh();
  }
  function close(panel, closed) {
    if (!closed && (!panel.classList.contains('is-closed') || pending.has(panel))) return;
    const generation = (generations.get(panel) || 0) + 1;
    generations.set(panel, generation);
    clearTimeout(restoreTimers.get(panel)); restoreTimers.delete(panel);
    const side = sideOf(panel);
    if (closed) {
      pending.delete(panel);
      const wasOpen = !panel.classList.contains('is-closed');
      applyClosed(panel, true);
      if (wasOpen) restoreTimers.set(panel, setTimeout(() => {
        if (generations.get(panel) === generation) sideInterlock?.onChange?.(side, false);
        restoreTimers.delete(panel);
      }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260));
      else sideInterlock?.onChange?.(side, false);
      return;
    }
    if (!panel.classList.contains('is-closed') || pending.has(panel)) return;
    pending.add(panel);
    if (panel === right && aboutPage) syncAboutSettingsIcon();
    Promise.resolve().then(() => sideInterlock?.beforeOpen?.(side)).catch(error => console.error('Panel interlock failed', error)).then(() => {
      if (generations.get(panel) !== generation || !pending.has(panel)) return;
      pending.delete(panel);
      if (innerWidth < 900) close(panel === left ? right : left, true);
      applyClosed(panel, false);
      sideInterlock?.onChange?.(side, true);
    });
  }
  for (const panel of [left, right]) {
    panel.querySelector('.review-panel-toggle').addEventListener('click', () => {
      const opening = panel.classList.contains('is-closed') && !pending.has(panel);
      close(panel, !opening);
    });
    panel.addEventListener('pointerdown', event => event.stopPropagation());
    panel.addEventListener('pointermove', event => event.stopPropagation());
    panel.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    panel.addEventListener('keydown', event => event.stopPropagation());
    panel.querySelector('.review-panel-close')?.addEventListener('click', () => close(panel, true));
  }
  function measureHeader() {
    const header = document.querySelector('.header, header.site-header, body > header');
    const margin = parseFloat(getComputedStyle(shell).getPropertyValue('--panel-margin')) || 12;
    shell.style.setProperty('--review-top', `${Math.max(margin, Math.ceil(header?.getBoundingClientRect().bottom || 0) + margin)}px`);
  }
  measureHeader();
  const header = document.querySelector('.header, header.site-header, body > header');
  const headerObserver = header && new ResizeObserver(measureHeader);
  headerObserver?.observe(header);
  addEventListener('resize', measureHeader);
  const general = document.createElement('section');
  general.innerHTML = `<h3>Accessibility</h3>
<label><input data-setting="accessibility.reducedMotion" type="checkbox"> Reduced motion</label>
<label><input data-setting="accessibility.highContrast" type="checkbox"> High contrast</label>
<label><input data-setting="accessibility.focusOutline" type="checkbox"> Always show focus outlines</label>
<label>Text size <select data-setting="accessibility.textScale"><option value="1">Standard</option><option value="1.1">Large</option><option value="1.25">Larger</option></select></label>
<h3>Scene appearance</h3><label>Contrast <input data-setting="start.contrast" type="range" min="0" max="1" step="0.01"></label>
<label>Brightness <input data-setting="start.brightness" type="range" min="0" max="1" step="0.01"></label>
<h3>Cube interaction</h3><label><input data-setting="cube.faceSnap" type="checkbox"> Snap cube to faces after rotating</label>
<label><input data-setting="cube.uprightFaces" type="checkbox"> Keep raised cube face upright</label>
${aboutPage ? '<label><input data-setting="cube.showShell" type="checkbox"> Show cube shell</label>' : ''}
<h3>Audio</h3><label>Volume <input data-setting="audio.volume" type="range" min="0" max="1" step="0.01"></label>
<label><input data-setting="audio.muted" type="checkbox"> Mute audio</label>
<label>Audio sync (ms) <input data-setting="audio.syncMs" type="number" min="-3000" max="3000" step="5"></label>
<label><input data-setting="audio.preservePitch" type="checkbox"> Preserve pitch</label>`;
  const route = document.body.dataset.page || location.pathname.match(/_(\d+)-([^/]+)/)?.[2] || 'start';
  const aboutTabOrder = ['general', 'about', 'refs', 'skills', 'faces', 'clock', 'odd', 'notes'];
  function orderedContexts() {
    const entries = [...contexts.entries()];
    if (route !== 'about') return entries;
    const order = new Map(aboutTabOrder.map((id, index) => [id, index]));
    return entries.sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  }
  const paletteIndex=({about:0,videos:1,graphics:2,games:3,music:4})[route]??0;
  const palette=['red','blue','orange','purple','green'];
  shell.dataset.settingsPrimary=palette[(paletteIndex+3)%5];shell.dataset.settingsSecondary=palette[(paletteIndex+4)%5];shell.dataset.settingsHighlight=palette[(paletteIndex+2)%5];
  left.dataset.debugPrimary=shell.dataset.settingsSecondary;
  left.dataset.debugSecondary=shell.dataset.settingsPrimary;
  const stopPortability=mountSettingsPortability(general,{page:route,contextRoot:shell});
  const routeFields = {
    start: '<h2>Start page</h2><label><input data-setting="start.animationAllowed" type="checkbox"> Allow intro animation</label><label>Contrast <input data-setting="start.contrast" type="range" min="0" max="1" step="0.01"></label><label>Brightness <input data-setting="start.brightness" type="range" min="0" max="1" step="0.01"></label><label>Background contrast <input data-setting="start.backgroundContrast" type="range" min="0" max="1" step="0.01"></label><label>Underlight <input data-setting="start.look.underlight" type="range" min="0" max="3" step="0.01"></label><label>Speaker purple <input data-setting="start.look.speakerPurple" type="range" min="0" max="3" step="0.01"></label>',
    videos: '<h2>Videos</h2><label>Drag sync <select data-setting="media.syncDrag"><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label><label><input data-setting="media.tabletFocus" type="checkbox"> Focus tablet</label>',
    music: '<h2>Music</h2><label>Master gain <input data-setting="music.masterGain" type="range" min="0.2" max="3" step="0.01"></label>'
  };
  const pageContext = routeFields[route] && !(route === 'start' && document.getElementById('uiRightColumn')) ? document.createElement('section') : null;
  if (pageContext) pageContext.innerHTML = routeFields[route];
  const read = (path, object) => path.split('.').reduce((v, key) => v?.[key], object);
  const unsubscribe = store.subscribe(snapshot => {
    if (constructorFooter) {
      const contrast = Math.max(0, Math.min(1, Number(snapshot.start?.contrast) || 0));
      const eased = contrast * contrast * (3 - 2 * contrast);
      const gain = (.08 + 2.32 * eased) / (.08 + 2.32 * .5);
      right.style.setProperty('--constructor-accent-alpha', String(Math.max(.25, Math.min(1, .7 * gain))));
      right.style.setProperty('--constructor-accent-percent', `${Math.round(Math.max(25, Math.min(100, 70 * gain)))}%`);
    }
    for (const control of [general, pageContext].filter(Boolean).flatMap(node => [...node.querySelectorAll('[data-setting]')])) {
      const value = read(control.dataset.setting, snapshot);
      if (control.type === 'checkbox') control.checked = control.dataset.setting.endsWith('focusOutline') ? value === 'always' : Boolean(value);
      else control.value = String(value);
    }
  }, { immediate: true });
  function changeSetting(event) {
    const control = event.target.closest('[data-setting]');
    if (!control || (event.type === 'input' && control.type !== 'range')) return;
    const path = control.dataset.setting;
    const value = control.type === 'checkbox' ? (path.endsWith('focusOutline') ? (control.checked ? 'always' : 'auto') : control.checked) : control.type === 'range' || path.endsWith('textScale') ? Number(control.value) : control.value;
    store.patch({ [path]: value });
  }
  general.addEventListener('change', changeSetting);
  general.addEventListener('input', changeSetting);
  pageContext?.addEventListener('change', changeSetting);
  pageContext?.addEventListener('input', changeSetting);
  function renderTabs() {
    for (const [id, element] of contextControls) {
      element.hidden = constructorMode || id !== current || !contexts.has(id);
      element.inert = element.hidden;
    }
    pinnedControls.hidden = ![...contextControls.values()].some(element => !element.hidden);
    for (const button of [...tabs.children]) if (!contexts.has(button.dataset.context)) button.remove();
    const focusedTab = tabs.contains(document.activeElement) ? document.activeElement : null;
    for (const [id, context] of orderedContexts()) {
      const shown = constructorMode ? constructorContexts.get(id) || ensureConstructorPlaceholder(id, context.label) : context;
      let button = [...tabs.children].find(node => node.dataset.context === id);
      if (!button) {
        button = document.createElement('button');
        button.type = 'button'; button.className = 'review-settings-tab'; button.dataset.context = id;
        button.id = `review-settings-tab-${id}`;
        button.setAttribute('role', 'tab');
        button.addEventListener('click', () => select(id));
        tabs.append(button);
      }
      button.textContent = route === 'about' && id === 'skills' ? 'Skill' : context.label;
      button.setAttribute('aria-controls', shown.element.id);
      button.setAttribute('aria-selected', String(id === current));
      button.tabIndex = id === current ? 0 : -1;
      context.element.classList.toggle('review-context-active', !constructorMode && id === current);
      context.element.hidden = constructorMode || id !== current;
      context.element.inert = context.element.hidden;
      if (constructorMode) { shown.element.classList.toggle('review-context-active', id === current); shown.element.hidden = id !== current; shown.element.inert = shown.element.hidden; }
      tabs.append(button);
    }
    for (const [id, item] of constructorContexts) if (!constructorMode || !contexts.has(id)) {
      item.element.hidden = true; item.element.inert = true;
    }
    if (constructorFooter) {
      constructorFooter.querySelector('[data-constructor-enter]').hidden = constructorMode;
      constructorFooter.querySelector('[data-constructor-exit]').hidden = !constructorMode;
      right.classList.toggle('is-constructor', constructorMode);
      right.setAttribute('aria-label', constructorMode ? 'Constructor Settings' : 'General Settings');
    }
    if (focusedTab?.isConnected) focusedTab.focus();
  }
  tabs.addEventListener('keydown', event => {
    const ids = orderedContexts().map(([id]) => id);
    const index = ids.indexOf(current);
    const next = event.key === 'ArrowRight' ? ids[(index + 1) % ids.length] :
      event.key === 'ArrowLeft' ? ids[(index - 1 + ids.length) % ids.length] :
      event.key === 'Home' ? ids[0] : event.key === 'End' ? ids.at(-1) : null;
    if (!next) return;
    event.preventDefault(); select(next);
    [...tabs.children].find(button => button.dataset.context === next)?.focus();
  });
  function select(id) { if (!contexts.has(id)) return; current = id; renderTabs(); body.classList.toggle('has-skills-context',!constructorMode && id==='skills');body.scrollTop = 0; }
  function ensureConstructorPlaceholder(id, label) {
    if (constructorContexts.has(id)) return constructorContexts.get(id);
    const element = document.createElement('section');
    element.className = 'review-constructor-placeholder';
    const title = document.createElement('h3'); title.textContent = label;
    const explanation = document.createElement('p'); explanation.textContent = 'No Constructor controls are available for this section yet.';
    const goRefs = document.createElement('button'); goRefs.type = 'button'; goRefs.textContent = 'Go to Refs';
    goRefs.addEventListener('click', () => select('refs'));
    element.append(title, explanation, goRefs);
    registerConstructorContext(id, label, element, true);
    return constructorContexts.get(id);
  }
  function registerConstructorContext(id, label, element, placeholder = false) {
    if (!aboutPage || !id || !element) throw new TypeError('About Constructor context requires id and element');
    const previous = constructorContexts.get(id);
    previous?.element.remove();
    element.id ||= `review-constructor-context-${id}`;
    element.classList.add('review-settings-context', 'review-constructor-context');
    element.setAttribute('role', 'tabpanel');
    element.setAttribute('aria-labelledby', `review-settings-tab-${id}`);
    element.hidden = true; element.inert = true; body.append(element);
    constructorContexts.set(id, {label, element, placeholder});
    renderTabs();
    return () => {
      if (constructorContexts.get(id)?.element !== element) return;
      constructorContexts.delete(id); element.remove(); renderTabs();
    };
  }
  function registerContext(id, label, element) {
    if (!id || !element) throw new TypeError('Settings context requires id and element');
    sectionControllers.get(id)?.dispose();sectionControllers.delete(id);
    contexts.get(id)?.element.remove();
    contexts.set(id, { label, element });
    element.id ||= `review-settings-context-${id}`;
    element.setAttribute('role', 'tabpanel');
    element.setAttribute('aria-labelledby', `review-settings-tab-${id}`);
    element.classList.add('review-settings-context'); body.append(element);
    // Skills owns its nested tab enhancement; ordinary page contexts use this shared enhancer.
    if(!element.querySelector('[data-panel]'))sectionControllers.set(id,mountCollapsibleSections(element,{scope:`${route}:${id}`}));
    renderTabs();
    return () => { if (contexts.get(id)?.element !== element) return;sectionControllers.get(id)?.dispose();sectionControllers.delete(id); contexts.delete(id); element.remove(); if (current === id) current = 'general'; renderTabs(); };
  }
  // Controls live outside the scrolling content and survive context replacement.
  function registerContextControls(id, element) {
    contextControls.get(id)?.remove();
    contextControls.set(id, element);
    element.dataset.contextControls = id;
    element.setAttribute('role', 'group');
    element.setAttribute('aria-labelledby', `review-settings-tab-${id}`);
    pinnedControls.append(element);
    renderTabs();
    return () => {
      if (contextControls.get(id) !== element) return;
      contextControls.delete(id); element.remove(); renderTabs();
    };
  }
  registerContext('general', 'General', general);
  if (pageContext) registerContext('page', route[0].toUpperCase() + route.slice(1), pageContext);
  constructorFooter?.querySelector('[data-constructor-enter]').addEventListener('click', () => {
    normalContext = current; constructorMode = true; select('refs');
  });
  constructorFooter?.querySelector('[data-constructor-exit]').addEventListener('click', () => {
    constructorMode = false; select(contexts.has(normalContext) ? normalContext : 'general');
  });
  function openSettings(id = 'general') { select(id); close(right, false); if (innerWidth < 900) close(left, true); }
  const iconListeners = new AbortController();
  for (const icon of document.querySelectorAll('.settings-icon')) {
    icon.addEventListener('click', event => {
      event.preventDefault();
      if (aboutPage && (!right.classList.contains('is-closed') || pending.has(right))) close(right, true);
      else if (constructorMode) close(right, false);
      else openSettings();
    }, { signal: iconListeners.signal });
    icon.setAttribute('aria-haspopup', 'dialog');
    if (aboutPage) syncAboutSettingsIcon();
  }
  const cleanup = () => {
    for(const controller of sectionControllers.values())controller.dispose();sectionControllers.clear();
    performanceStats.dispose(); unsubscribe(); iconListeners.abort(); for (const { icon, expanded, controls, haspopup } of settingsIconStates) {
      if (expanded == null) icon.removeAttribute('aria-expanded'); else icon.setAttribute('aria-expanded', expanded);
      if (controls == null) icon.removeAttribute('aria-controls'); else icon.setAttribute('aria-controls', controls);
      if (haspopup == null) icon.removeAttribute('aria-haspopup'); else icon.setAttribute('aria-haspopup', haspopup);
    }
    for (const timer of restoreTimers.values()) clearTimeout(timer); pending.clear(); sideInterlock = null; headerObserver?.disconnect(); removeEventListener('resize', measureHeader);
    for (const [node, { parent, next }] of [...originalLocations].reverse()) {
      if (parent) parent.insertBefore(node, next?.parentNode === parent ? next : null);
    }
    for (const [node, hidden] of originalHidden) node.hidden = hidden;
    shell.remove(); link.remove(); document.documentElement.classList.remove('shared-debug-panels'); instance = null;
  };
  let observer = null;
  const debugBody = left.querySelector('.review-panel-scroll');
  function dockOwnedContext(id, label, node) {
    let wrapper = ownedContexts.get(id);
    if (!wrapper) {
      wrapper = document.createElement('section');
      wrapper.className = 'review-owned-context';
      ownedContexts.set(id, wrapper);
      registerContext(id, label, wrapper);
    }
    remember(node);
    if (!originalHidden.has(node)) originalHidden.set(node, node.hidden);
    if (node.parentElement !== wrapper) {
      wrapper.append(node);sectionControllers.get(id)?.dispose();
      sectionControllers.set(id,mountCollapsibleSections(wrapper,{scope:`${route}:${id}`}));
    }
  }
  const dock = () => {
      const startRight = document.querySelector('#uiRightColumn');
      if (startRight && startRight.parentElement !== debugBody) { remember(startRight); debugBody.append(startRight); originalHidden.set(startRight, startRight.hidden); startRight.hidden = true; }
      const startLeft = document.querySelector('#uiLeftColumn');
      if (startLeft && startLeft.parentElement !== debugBody) { remember(startLeft); debugBody.append(startLeft); }
      for (const [id, label, selector] of [['start-controls', 'Start controls', '#startPageControls'], ['emissive', 'Emissive', '#emissiveListPanel'], ['look', 'Look', '#backgroundLookPanel']]) {
        const node = document.querySelector(selector);
        if (!node) continue;
        dockOwnedContext(id, label, node);
      }
      for (const selector of ['#sync-debug', '.cam-anim-debug-panel', '#debug-panel']) {
        const node = document.querySelector(selector);
        if (node && node.parentElement !== debugBody) { remember(node); debugBody.append(node); }
      }
      const filter = document.querySelector('#filter-admin');
      if (filter && document.body.dataset.page === 'videos') dockOwnedContext('filters', 'Video filters', filter);
      else if (filter && document.body.dataset.page !== 'videos') { if (!originalHidden.has(filter)) originalHidden.set(filter, filter.hidden); filter.hidden = true; }
  };
  function showDebug(show) {
    shell.classList.add('has-debug');
    document.documentElement.classList.toggle('shared-debug-panels', show);
    dock();
    if (!observer) {
      observer = new MutationObserver(records => { if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && n !== shell))) dock(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (!show) close(left, true);
  }
  const onDebugVisibility = event => showDebug(Boolean(event.detail?.show));
  addEventListener(DEBUG_VISIBILITY_EVENT, onDebugVisibility);
  showDebug(review);
  if (isReview()) import('./debug-ui.js').then(({ initDebugUI }) => { if (shell.isConnected && instance?.shell === shell) { initDebugUI(); dock(); } });
  instance = { shell, registerContext, registerConstructorContext, registerContextControls, registerSideInterlock, openSettings, dispose() { stopPortability(); observer?.disconnect(); removeEventListener(DEBUG_VISIBILITY_EVENT, onDebugVisibility); cleanup(); } };
  scope?.defer(() => instance?.dispose());
  return instance;
}
