import { getSharedSettings } from '../_7-shared-scripts/core/settings.js';
import { VIDEO_EXPLAINER_DEFAULTS } from '../_7-shared-scripts/core/settings-schema.js';
import { mountSettingsControls } from '../_7-shared-scripts/core/settings-controls.js';
import {mountSettingsPortability} from '../_7-shared-scripts/core/settings-portability.js';
import { getPageDebugState, DEBUG_VISIBILITY_EVENT } from './debug-loader.js';
import {mountCollapsibleSections} from '../_7-shared-scripts/panel-assembly/CollapsibleSections.mjs';
import {mountPerformanceStats} from './performance-stats.js';
import { mountResetEasingControls } from './settings-reset-easing.js';
import { focusedMediaMarkup, mountFocusedMediaControls } from './settings-focused-media.js';
import { poiSettingsMarkup, mountPoiSettings } from './settings-poi.js';

let instance;
const isReview = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('review');

export function initPanelShell({ scope } = {}) {
  if (instance) { scope?.defer(() => instance?.dispose()); return instance; }
  const review = isReview() || getPageDebugState(location.pathname);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./panel-shell.css', import.meta.url).href;
  const shell = document.createElement('div');
  shell.id = 'review-panels';
  shell.style.display = 'none';
  link.addEventListener('load', () => shell.style.removeProperty('display'), { once: true });
  document.head.append(link);
  shell.classList.add('has-debug');
  const aboutPage = document.body.dataset.page === 'about' || location.pathname.includes('/_1-about/');
  const closeGear = label => `<button type="button" class="review-panel-close" aria-label="Close ${label}" title="Close ${label}"><span class="review-panel-close-icon" aria-hidden="true"></span></button>`;
  shell.innerHTML = `<aside class="review-panel review-panel--left is-closed" aria-label="Debug"><button type="button" class="review-panel-toggle" aria-expanded="false" aria-controls="review-debug-body">Debug</button><div id="review-debug-body" class="review-panel-body" inert><div class="review-panel-head"><strong>Debug</strong>${closeGear('Debug')}</div><div class="review-panel-scroll" tabindex="0"></div></div></aside><aside class="review-panel review-panel--right is-closed" aria-label="General Settings"><button type="button" class="review-panel-toggle" aria-expanded="false" aria-controls="review-settings-body">General Settings</button><div id="review-settings-body" class="review-panel-body" inert><div class="review-panel-head"><div class="review-settings-tabs" role="tablist" aria-label="Settings sections"></div>${closeGear('General Settings')}</div><div class="review-panel-scroll" tabindex="0"></div></div></aside>`;
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
  let constructorMode = false;
  const constructorFooter = document.createElement('div');
  if (constructorFooter) {
    constructorFooter.className = 'review-constructor-footer';
    constructorFooter.innerHTML = '<button type="button" data-constructor-enter>Constructor mode <span>Experimental · edit cautiously; unexpected results are possible.</span></button><button type="button" data-constructor-exit hidden>Return to normal Settings</button>';
    body.after(constructorFooter);
  }
  const debugOpener = document.createElement('button');
  debugOpener.type = 'button';
  debugOpener.className = 'review-debug-opener';
  debugOpener.textContent = 'Open Debug';
  debugOpener.setAttribute('aria-controls', 'review-debug-body');
  debugOpener.setAttribute('aria-expanded', 'false');
  body.after(debugOpener);
  const originalLocations = new Map();
  const originalHidden = new Map();
  const ownedContexts = new Map();
  const sectionControllers = new Map();
  const constructorSectionControllers = new Map();
  const performanceStats = mountPerformanceStats(left.querySelector('.review-panel-scroll'), () => !left.classList.contains('is-closed'));
  const remember = node => { if (node && !originalLocations.has(node)) originalLocations.set(node, { parent: node.parentNode, next: node.nextSibling }); };
  let current = 'general';
  const store = getSharedSettings();
  let sideInterlock = null;
  const generations = new Map([[left, 0], [right, 0]]);
  const panelOpeners = new Map();
  const pending = new Set(), restoreTimers = new Map();
  const sideOf = panel => panel === left ? 'left' : 'right';
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion-reduced');
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
    const toggle = panel.querySelector('.review-panel-toggle');
    toggle.setAttribute('aria-expanded', String(!closed));
    toggle.setAttribute('aria-label', closed ? `Open ${panel === left ? 'Debug' : 'General Settings'}` : `Close ${panel === left ? 'Debug' : 'General Settings'}`);
    panel.querySelector('.review-panel-body').inert = closed;
    if (panel === left) {
      debugOpener.setAttribute('aria-expanded', String(!closed));
      debugOpener.textContent = closed ? 'Open Debug' : 'Close Debug';
    }
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
      const heldFocus = panel.contains(document.activeElement);
      applyClosed(panel, true);
      if (heldFocus) {
        const opener = panelOpeners.get(panel);
        const target = opener?.isConnected && opener.getClientRects().length && !opener.closest('[inert]')
          ? opener : panel.querySelector('.review-panel-toggle');
        target?.focus({ preventScroll: true });
      }
      panelOpeners.delete(panel);
      if (wasOpen) restoreTimers.set(panel, setTimeout(() => {
        if (generations.get(panel) === generation) sideInterlock?.onChange?.(side, false);
        restoreTimers.delete(panel);
      }, reducedMotion() ? 0 : 260));
      else sideInterlock?.onChange?.(side, false);
      return;
    }
    if (!panel.classList.contains('is-closed') || pending.has(panel)) return;
    if (!panel.contains(document.activeElement) && document.activeElement !== document.body) {
      panelOpeners.set(panel, document.activeElement);
    }
    pending.add(panel);
    if (panel === right && aboutPage) syncAboutSettingsIcon();
    Promise.resolve().then(() => sideInterlock?.beforeOpen?.(side)).catch(error => console.error('Panel interlock failed', error)).then(() => {
      if (generations.get(panel) !== generation || !pending.has(panel)) return;
      pending.delete(panel);
      const other = panel === left ? right : left;
      const focusWasInOther = innerWidth < 900 && other.contains(document.activeElement);
      if (innerWidth < 900) close(other, true);
      applyClosed(panel, false);
      if (focusWasInOther) panel.querySelector('.review-panel-close').focus({ preventScroll: true });
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
    panel.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || panel.classList.contains('is-closed')) return;
      if (document.querySelector('dialog[open], [aria-modal="true"]:not([hidden]), .settings-context-menu:not([hidden])')) return;
      event.preventDefault();
      close(panel, true);
    });
    panel.querySelector('.review-panel-close')?.addEventListener('click', () => close(panel, true));
  }
  debugOpener.addEventListener('click', () => close(left, !left.classList.contains('is-closed') || pending.has(left)));
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
  general.innerHTML = `<h3>Audio</h3>
<label>Volume <input data-setting="audio.volume" type="range" min="0" max="1" step="0.01"></label>
<div class="settings-compact-row"><label><input data-setting="audio.muted" type="checkbox"> Mute audio</label><label><input data-setting="audio.preservePitch" type="checkbox"> Preserve pitch</label></div>
<label>Audio sync (ms) <input data-setting="audio.syncMs" type="number" min="-3000" max="3000" step="5"></label>
<h3>Scene appearance</h3><label>Contrast <input data-setting="start.contrast" type="range" min="0" max="1" step="0.01"></label>
<label>Brightness <input data-setting="${document.getElementById('settingsControllerScene') ? 'scene.lighting' : 'start.brightness'}" type="range" min="0" max="1" step="0.01"></label>
${document.getElementById('settingsControllerScene') ? '<label><input data-setting="start.centerOnViewport" type="checkbox"> Center on viewport</label>' : ''}
<h3>Header</h3>
<label><input data-setting="header.useLegacy" type="checkbox"> Legacy header</label>
<label><input data-setting="header.useLegacyNavbar" type="checkbox"> Legacy navbar</label>
${focusedMediaMarkup}
<h3>Accessibility</h3>
<label><input data-setting="accessibility.reducedMotion" type="checkbox"> Reduced motion</label>
<label><input data-setting="accessibility.highContrast" type="checkbox"> High contrast</label>
<label><input data-setting="accessibility.focusOutline" type="checkbox"> Always show focus outlines</label>
<label>Shortcut hints <select data-setting="accessibility.shortcutHints"><option value="auto">Automatic</option><option value="always">Always</option><option value="hidden">Hidden</option></select></label>
<label>Text size <select data-setting="accessibility.textScale"><option value="1">Standard</option><option value="1.1">Large</option><option value="1.25">Larger</option></select></label>
<h3>Transform resets</h3><label><input data-setting="interaction.animateResets" type="checkbox"> Animate double-click resets</label>
<label>Move reset speed <input data-setting="interaction.panResetSpeed" type="range" min="0.25" max="3" step="0.05"></label>
<label>Rotation reset speed <input data-setting="interaction.rotationResetSpeed" type="range" min="0.25" max="3" step="0.05"></label>
<div data-reset-easing-picker="pan"></div><div data-reset-easing-picker="rotation"></div>
${poiSettingsMarkup}`;
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
    start: '<h2>Start page</h2><label><input data-setting="start.animationAllowed" type="checkbox"> Allow intro animation</label><label>Contrast <input data-setting="start.contrast" type="range" min="0" max="1" step="0.01"></label><label>Brightness <input data-setting="scene.lighting" type="range" min="0" max="1" step="0.01"></label><label>Background brightness <input data-setting="start.brightness" type="range" min="0" max="1" step="0.01"></label><label>Background contrast <input data-setting="start.backgroundContrast" type="range" min="0" max="1" step="0.01"></label><label>Underlight <input data-setting="start.look.underlight" type="range" min="0" max="3" step="0.01"></label><label>Speaker purple <input data-setting="start.look.speakerPurple" type="range" min="0" max="3" step="0.01"></label>',
    videos: '<h2>Videos</h2><label><input data-setting="videos.centerOnViewport" type="checkbox"> Center on viewport</label><label>Drag sync <select data-setting="media.syncDrag"><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label><label><input data-setting="media.tabletFocus" type="checkbox"> Focus tablet</label>',
    music: '<h2>Music</h2><label><input data-setting="music.centerOnViewport" type="checkbox"> Center on viewport</label><label>Master gain <input data-setting="music.masterGain" type="range" min="0.2" max="3" step="0.01"></label><label><input data-setting="music.highlightsEnabled" type="checkbox"> Piano highlights</label><h3>Music screen</h3><label><input data-setting="music.featherControls" type="checkbox"> Feather video controls</label><label><input data-setting="music.screenGrid" type="checkbox"> Show screen grid</label><label><input data-setting="music.showGridButton" type="checkbox"> Show grid button</label><h3>Track icons</h3><label>Icon size <input data-setting="music.trackIconSize" type="range" min="0.16" max="0.32" step="0.01"></label><label>Horizontal distribution <input data-setting="music.trackIconSpacing" type="range" min="0.12" max="0.36" step="0.01"></label><label>Vertical distribution <input data-setting="music.trackIconVerticalOffset" type="range" min="0" max="0.34" step="0.01"></label>',
    graphics: `<h2>Graphics</h2><label><input data-setting="graphics.centerOnViewport" type="checkbox"> Center on viewport</label><label><input data-setting="graphics.shelfRotation" type="checkbox"> Allow gentle shelf rotation</label>
<h3>Book page appearance</h3><label>Surface <select data-setting="graphics.pageSurfaceType"><option value="paper">Paper</option><option value="felt">Felt</option><option value="woven">Woven</option><option value="smooth">Smooth</option></select></label><label>Relief <input data-setting="graphics.pageSurfaceStrength" type="range" min="0" max="2" step="0.01"></label><label>Grain size <input data-setting="graphics.pageSurfaceScale" type="range" min="0.5" max="3" step="0.01"></label><label>Ink grain <input data-setting="graphics.pageSurfaceInk" type="range" min="0" max="1" step="0.01"></label>
<h3>Easel video</h3><label><input data-setting="graphics.videoRotation" type="checkbox"> Allow rotation while viewing video</label><label><input data-setting="graphics.videoZoom" type="checkbox"> Allow zoom while viewing video</label><p>The video view stays aligned to the easel when these are off.</p>`,
    games: '<h2>Games</h2><label><input data-setting="games.centerOnViewport" type="checkbox"> Center on viewport</label>',
    docs: '<h2>Docs</h2><label><input data-setting="docs.centerOnViewport" type="checkbox"> Center on viewport</label>'
  };
  const pageContext = routeFields[route] && !(route === 'start' && document.getElementById('uiRightColumn')) ? document.createElement('section') : null;
  if (pageContext) pageContext.innerHTML = routeFields[route];
  const musicContexts = [];
  if (route === 'music') {
    const tablet = document.createElement('section');
    tablet.innerHTML = `<h2>Tablet</h2><label>Idle Title Timeout <input data-setting="music.tabletTitleIdleTimeout" type="range" min="0" max="3000" step="50"><output data-setting-output="music.tabletTitleIdleTimeout"></output></label><label>Track Name Hover Delay <input data-setting="music.trackNameHoverDelay" type="range" min="0" max="500" step="25"><output data-setting-output="music.trackNameHoverDelay"></output></label><label>Title Fade Duration <input data-setting="music.tabletTitleFadeDuration" type="range" min="0" max="600" step="20"><output data-setting-output="music.tabletTitleFadeDuration"></output></label><label>Title Transition Gap <input data-setting="music.tabletTitleTransitionGap" type="range" min="0" max="400" step="20"><output data-setting-output="music.tabletTitleTransitionGap"></output></label>`;
    const piano = document.createElement('section');
    piano.innerHTML = `<h2>Piano</h2><label>Accidental Width <input data-setting="music.accidentalWidth" type="range" min="1" max="2.4" step="0.05"><output data-setting-output="music.accidentalWidth"></output></label><label>Instrument Panel Animation Duration <input data-setting="music.instrumentPanelAnimationDuration" type="range" min="0" max="1200" step="20"><output data-setting-output="music.instrumentPanelAnimationDuration"></output></label>`;
    musicContexts.push({ id: 'tablet', label: 'Tablet', element: tablet }, { id: 'piano', label: 'Piano', element: piano });
  }
  if (pageContext && route === 'videos') {
    const explainer = document.createElement('div');
    explainer.innerHTML = `<h3>Thumbnail explainer text</h3>
<p>Edit each video's text below. Line alignment arranges lines inside the measured text block; block placement moves that block in the band. “Use code default” clears a saved edit and restores the source text.</p>
<label>Text size <input data-setting="videos.explainerSize" type="number" min="18" max="72" step="1"></label>
<label>Font <select data-setting="videos.explainerFont"><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label>
<label>Style <select data-setting="videos.explainerStyle"><option value="normal">Normal</option><option value="bold">Bold</option><option value="italic">Italic</option><option value="bold italic">Bold italic</option></select></label>
<label>Line alignment <select data-setting="videos.explainerAlign"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
<label>Block placement <select data-setting="videos.explainerPlacement"><option value="center">Center</option><option value="follow">Follow hovered video</option></select></label>`;
    const placement = explainer.querySelector('[data-setting="videos.explainerPlacement"]');
    for (const [id, item] of Object.entries(VIDEO_EXPLAINER_DEFAULTS)) {
      placement.add(new Option(`Anchor to ${item.title}`, id));
      const label = document.createElement('label');
      label.textContent = `${item.title} text`;
      const textarea = document.createElement('textarea');
      textarea.dataset.setting = `videos.explainer.${id}`;
      textarea.rows = 2;
      textarea.maxLength = 1200;
      textarea.style.width = '100%';
      textarea.style.boxSizing = 'border-box';
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = 'Use code default';
      reset.addEventListener('click', () => store.reset([textarea.dataset.setting]));
      label.append(textarea, reset);
      explainer.append(label);
    }
    pageContext.append(explainer);
  }
  const resetEasingControls = mountResetEasingControls(general, right, store);
  const settingsRoots = [general, pageContext, ...musicContexts.map(context => context.element)].filter(Boolean);
  const settingsControls = mountSettingsControls(settingsRoots, {
    store,
    afterRefresh: snapshot => {
      for (const root of settingsRoots) for (const output of root.querySelectorAll('[data-setting-output]')) {
        const value = output.dataset.settingOutput.split('.').reduce((current, key) => current?.[key], snapshot);
        output.value = output.textContent = output.dataset.settingOutput === 'music.accidentalWidth' ? `${Number(value).toFixed(2)}×` : `${value} ms`;
      }
    },
    valueAdapters: {
      'accessibility.focusOutline': {
        read: control => control.checked ? 'always' : 'auto',
        write: (control, value) => { control.checked = value === 'always'; }
      },
      'interaction.panResetEasing': {
        read: control => control.value || null,
        write: (control, value) => { control.value = value || ''; }
      },
      'interaction.rotationResetEasing': {
        read: control => control.value || null,
        write: (control, value) => { control.value = value || ''; }
      },
      'interaction.focusUiSeparateInSpeed': {
        read: control => !control.checked,
        write: (control, value) => { control.checked = !value; }
      }
    }
  });
  const focusedMediaControls = mountFocusedMediaControls(general, store);
  const poiSettings = mountPoiSettings(general, store);
  const unsubscribe = store.subscribe(snapshot => {
    const contrast = Math.max(0, Math.min(1, Number(snapshot.start?.contrast) || 0));
    const eased = contrast * contrast * (3 - 2 * contrast);
    const gain = (.08 + 2.32 * eased) / (.08 + 2.32 * .5);
    shell.style.setProperty('--review-gear-glow-percent', `${Math.round(Math.max(12, Math.min(85, 35 * gain)))}%`);
    shell.style.setProperty('--review-gear-accent-percent', `${Math.round(Math.max(25, Math.min(100, 70 * gain)))}%`);
    if (constructorFooter) {
      right.style.setProperty('--constructor-accent-alpha', String(Math.max(.25, Math.min(1, .7 * gain))));
      right.style.setProperty('--constructor-accent-percent', `${Math.round(Math.max(25, Math.min(100, 70 * gain)))}%`);
    }
  }, { immediate: true });
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
      constructorFooter.hidden = !aboutPage && ![...constructorContexts.values()].some(context => !context.placeholder);
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
    const explanation = document.createElement('p'); explanation.textContent = `No Constructor controls are available for ${label} yet.`;
    element.append(title, explanation);
    registerConstructorContext(id, label, element, true);
    return constructorContexts.get(id);
  }
  function registerConstructorContext(id, label, element, placeholder = false) {
    if (!id || !element) throw new TypeError('Constructor context requires id and element');
    const previous = constructorContexts.get(id);
    constructorSectionControllers.get(id)?.dispose();constructorSectionControllers.delete(id);
    previous?.element.remove();
    element.id ||= `review-constructor-context-${id}`;
    element.classList.add('review-settings-context', 'review-constructor-context');
    element.setAttribute('role', 'tabpanel');
    element.setAttribute('aria-labelledby', `review-settings-tab-${id}`);
    element.hidden = true; element.inert = true; body.append(element);
    constructorContexts.set(id, {label, element, placeholder});
    // Constructor folds retain their own saved expansion and order history.
    if (id !== 'skills') constructorSectionControllers.set(id,mountCollapsibleSections(element,{scope:`constructor:${route}:${id}`,...(element.querySelector('[data-panel]')?{group:element.id}:{})}));
    renderTabs();
    return () => {
      if (constructorContexts.get(id)?.element !== element) return;
      constructorSectionControllers.get(id)?.dispose();constructorSectionControllers.delete(id);
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
    // Skills owns its own tabs; other nested sections belong to this Settings context.
    if(id!=='skills')sectionControllers.set(id,mountCollapsibleSections(element,{scope:`${route}:${id}`,reorder:id!=='general',...(element.querySelector('[data-panel]')?{group:element.id}:{})}));
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
  for (const context of musicContexts) registerContext(context.id, context.label, context.element);
  constructorFooter?.querySelector('[data-constructor-enter]').addEventListener('click', () => {
    constructorMode = true; select(current);
  });
  constructorFooter?.querySelector('[data-constructor-exit]').addEventListener('click', () => {
    constructorMode = false; select(current);
  });
  function openSettings(id = 'general') { select(id); close(right, false); if (innerWidth < 900) close(left, true); }
  function openConstructor(id = 'general') {
    constructorMode = true;
    select(id);
    close(right, false);
    if (innerWidth < 900) close(left, true);
  }
  function toggleSettings() { if (right.classList.contains('is-closed') && !pending.has(right)) openSettings(); else close(right, true); }
  function toggleDebug() { close(left, !left.classList.contains('is-closed') || pending.has(left)); }
  const iconListeners = new AbortController();
  for (const icon of document.querySelectorAll('.settings-icon')) {
    icon.addEventListener('click', event => {
      event.preventDefault();
      if (!right.classList.contains('is-closed') || pending.has(right)) close(right, true);
      else if (constructorMode) close(right, false);
      else openSettings();
    }, { signal: iconListeners.signal });
    icon.setAttribute('aria-haspopup', 'dialog');
    if (aboutPage) syncAboutSettingsIcon();
  }
  const cleanup = () => {
    for(const controller of sectionControllers.values())controller.dispose();sectionControllers.clear();
    for(const controller of constructorSectionControllers.values())controller.dispose();constructorSectionControllers.clear();
    performanceStats.dispose(); unsubscribe(); settingsControls.dispose(); focusedMediaControls.dispose(); poiSettings.dispose(); resetEasingControls.dispose(); iconListeners.abort(); for (const { icon, expanded, controls, haspopup } of settingsIconStates) {
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
      for (const [id, label, selector] of [['emissive', 'Emissive', '#emissiveListPanel'], ['look', 'Look', '#backgroundLookPanel']]) {
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
  instance = { shell, registerContext, registerConstructorContext, registerContextControls, registerSideInterlock, openSettings, openConstructor, toggleSettings, toggleDebug, dispose() { stopPortability(); observer?.disconnect(); removeEventListener(DEBUG_VISIBILITY_EVENT, onDebugVisibility); cleanup(); } };
  scope?.defer(() => instance?.dispose());
  return instance;
}
