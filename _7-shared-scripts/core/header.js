import { createPresentationUiMotion } from './presentation-ui.js';

export const HEADER_LAYOUT_EVENT = 'site:header-layout-change';
export const VIDEO_PRESENTATION_EVENT = 'site:video-presentation-change';

export function createVideoPresentationController(root, getNodes, { beforeChange, onChange, shouldInert = () => true } = {}) {
  const sources = new Set();
  const priorInert = new Map();
  const refresh = () => {
    const active = sources.size > 0;
    if (active) root.body.dataset.videoPresentation = 'active';
    else delete root.body.dataset.videoPresentation;
    beforeChange?.(active, sources);
    const nodes = active && shouldInert() ? new Set(getNodes(sources).filter(Boolean)) : new Set();
    for (const [node, inert] of priorInert) {
      if (!nodes.has(node)) { node.inert = inert; priorInert.delete(node); }
    }
    if (!active || !shouldInert()) {
      onChange?.(active, sources);
      return;
    }
    for (const node of nodes) {
      if (!node) continue;
      if (!priorInert.has(node)) priorInert.set(node, node.inert);
      node.inert = true;
      if (node.contains?.(root.activeElement)) root.activeElement.blur();
    }
    onChange?.(active, sources);
  };
  return {
    refresh,
    hasSource(source) { return sources.has(source); },
    onEvent(event) {
      const source = event.detail?.source;
      if (typeof source !== 'string' || !source) return;
      if (event.detail.active) sources.add(source);
      else sources.delete(source);
      refresh();
    },
    clear() { sources.clear(); refresh(); }
  };
}

export function enhanceHeader(root = document, settings, { signal } = {}) {
  const page = new URL(root.baseURI || location.href);
  const current = page.pathname.endsWith('/') ? '/index.html' : page.pathname;
  for (const link of root.querySelectorAll('.navigation a[href]')) {
    const target = new URL(link.getAttribute('href'), page);
    if (target.pathname === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (!settings || !root.body) return () => {};
  const header = root.querySelector('.header');
  const gear = header?.querySelector('.settings-icon');
  const rail = header?.querySelector('.navigation-bg');
  const navWrap = header?.querySelector('.nav-wrap');
  const navParent = navWrap?.parentNode, navNext = navWrap?.nextSibling;
  let gearHost = null, gearParent = null, gearNext = null;
  const betaLabel = root.createElement('span');
  betaLabel.className = 'header-beta-label';
  betaLabel.textContent = 'IN BETA';
  if (header && gear) {
    gearParent = gear.parentNode; gearNext = gear.nextSibling;
    gearHost = root.createElement('div'); gearHost.className = 'header-gear';
    gearHost.append(gear); root.body.append(gearHost, betaLabel);
  } else if (!header) {
    // The Start page has no shared header or Settings icon.
    gearHost = root.createElement('div');
    gearHost.className = 'header-gear header-gear--fallback';
    const startGear = root.createElement('a');
    startGear.href = '#settings';
    startGear.className = 'nav-icon settings-icon';
    startGear.title = 'Settings';
    startGear.setAttribute('aria-label', 'Settings');
    const image = root.createElement('img');
    image.src = new URL('../../assets/icons/icon-settings.png', import.meta.url).href;
    image.alt = '';
    startGear.append(image);
    gearHost.append(startGear);
    root.body.append(gearHost, betaLabel);
  }
  const dock = root.createElement('aside');
  dock.className = 'header-utility-dock';
  dock.setAttribute('aria-label', 'Page utilities');
  root.body.append(dock);
  const mouseHost = root.createElement('div');
  mouseHost.className = 'header-mouse-controls';
  mouseHost.setAttribute('aria-label', 'Mouse controls');
  if (header) root.body.append(mouseHost);
  for (const [file, label, control] of [
    ['mouse_MMB_pan.svg', 'Middle mouse button: pan', 'pan'],
    ['mouse_RMB_rotate.svg', 'Right mouse button: rotate', 'rotate']
  ]) {
    const item = root.createElement('span');
    item.className = 'header-mouse-icon';
    item.dataset.mouseControl = control;
    item.setAttribute('role', 'img');
    item.setAttribute('aria-label', label);
    item.title = label;
    mouseHost.append(item);
    fetch(new URL(`../../assets/svg/${file}`, import.meta.url), { signal }).then(response => {
      if (!response.ok) throw new Error(`Mouse icon ${response.status}`);
      return response.text();
    }).then(source => {
      if (!item.isConnected) return;
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      const svg = parsed.documentElement;
      if (svg.localName !== 'svg') return;
      svg.querySelectorAll('script, foreignObject').forEach(node => node.remove());
      svg.querySelectorAll('*').forEach(node => {
        for (const attr of [...node.attributes]) if (attr.name.startsWith('on')) node.removeAttribute(attr.name);
      });
      svg.removeAttribute('id');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      for (const style of svg.querySelectorAll('style')) {
        style.textContent = style.textContent
          .replaceAll('#c1272d', 'var(--header-mouse-primary)')
          .replaceAll('#3139a4', 'var(--header-mouse-secondary)')
          .replaceAll('.st', `.header-mouse-icon[data-mouse-control="${control}"] .st`);
      }
      item.replaceChildren(root.importNode(svg, true));
    }).catch(() => { item.dataset.iconUnavailable = 'true'; });
  }
  const resetHint = root.createElement('span');
  resetHint.className = 'header-mouse-reset-hint';
  resetHint.innerHTML = '<span>Double-click</span><span>to reset</span>';
  mouseHost.append(resetHint);
  const aboutHeader = header?.classList.contains('about-header');
  const utilitySelector = '.about-header-launchers, .site-shortcuts-trigger, .captions-toggle, .clock-toolbar, .scene-alternative, .cube-hint, .cube-status, .skills-beanbag-dock, .skills-beanbag-notice, .skills-sling-tutorial, .manual-controls, .info-panel';
  const presentationUtilitySelector = `${utilitySelector}, .intro-skip, #skip-animation`;
  const summarySelector = '.page-summary-trigger, .page-summary-panel';
  const presentationRefreshSelector = `${presentationUtilitySelector}, .header-beta-label, .sticky-notes-fallback, .notes-shortcuts-slot, ${summarySelector}`;
  const utilityPositions = new Map();
  let layout = 'modern';
  const updateDockPosition = () => {
    if (!rail) return;
    const top = Math.ceil(rail.getBoundingClientRect().bottom + 8);
    dock.style.top = `${top}px`;
    dock.style.maxHeight = `max(0px, calc(100vh - ${top + 8}px))`;
  };
  const placeUtilities = () => {
    for (const node of root.querySelectorAll(utilitySelector)) {
      if (aboutHeader && node.matches('.site-shortcuts-trigger')) {
        if (!utilityPositions.has(node)) utilityPositions.set(node, { parent: node.parentNode, next: node.nextSibling });
        const notesSlot = root.querySelector('.notes-shortcuts-slot');
        if (notesSlot) {
          if (node.parentNode !== notesSlot) notesSlot.append(node);
          continue;
        }
        if (layout === 'modern' && node.parentNode !== mouseHost) mouseHost.append(node);
        continue;
      }
      if (node.closest('dialog, #review-panels') || node === dock || dock.contains(node)) continue;
      if (!utilityPositions.has(node)) utilityPositions.set(node, { parent: node.parentNode, next: node.nextSibling });
      if (layout === 'modern') dock.append(node);
    }
    if (layout === 'legacy') {
      for (const [node, { parent, next }] of utilityPositions) {
        if (node.closest('.notes-shortcuts-slot')) continue;
        if (node.isConnected && parent?.isConnected && node.parentNode !== parent) {
          parent.insertBefore(node, next?.parentNode === parent ? next : null);
        }
      }
    }
    updateDockPosition();
  };
  let placementPending = false, placementFrame = null, disposed = false;
  const schedulePlacement = () => {
    if (disposed || placementPending) return;
    placementPending = true;
    placementFrame = requestAnimationFrame(() => {
      placementFrame = null;
      placementPending = false;
      if (disposed) return;
      placeUtilities();
      presentation.refresh();
    });
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => (record.type === 'attributes' && record.target.matches?.(presentationRefreshSelector)) ||
      [...record.addedNodes].some(node => node.nodeType === 1 &&
        (node.matches?.(presentationRefreshSelector) || node.querySelector?.(presentationRefreshSelector))))) schedulePlacement();
  });
  observer.observe(root.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  let currentSnapshot = settings.get();
  const syncNavHost = active => {
    if (!navWrap || !navParent?.isConnected) return;
    const interaction = currentSnapshot.interaction || {};
    const lift = active && interaction.focusUiMoveAway !== false &&
      interaction.focusUiHideHeader !== false && interaction.focusUiHideNavbar === false;
    if (lift && navWrap.parentNode !== root.body) {
      navWrap.classList.add('shared-nav-wrap');
      root.body.append(navWrap);
    } else if (!lift && navWrap.parentNode === root.body) {
      navParent.insertBefore(navWrap, navNext?.parentNode === navParent ? navNext : null);
      navWrap.classList.remove('shared-nav-wrap');
    }
  };
  const presentationMotion = createPresentationUiMotion(root, () => ({
    header, nav: navWrap, beta: betaLabel, mouse: mouseHost, gear: gearHost, dock,
    noteDock: root.querySelector('.sticky-notes-fallback'),
    summary: [...root.querySelectorAll(summarySelector)],
    utilities: [...root.querySelectorAll(presentationUtilitySelector)].filter(node => !node.closest('.notes-shortcuts-slot'))
  }));
  const presentation = createVideoPresentationController(root, sources => [
    header, navWrap, mouseHost, betaLabel, root.querySelector('.sticky-notes-fallback'),
    ...root.querySelectorAll(summarySelector),
    ...(currentSnapshot.interaction?.focusUiMoveAway !== false && currentSnapshot.interaction?.focusUiHideGear === true && !sources.has('notes-panels') ? [gearHost] : []),
    dock,
    ...[...root.querySelectorAll(presentationUtilitySelector)].filter(node =>
      !node.closest('#review-panels, .notes-shortcuts-slot'))
  ], {
    shouldInert: () => true,
    beforeChange: active => { syncNavHost(active); placeUtilities(); },
    onChange: (active, sources) => {
      const snapshot = sources.has('notes-panels') ? {
        ...currentSnapshot,
        interaction: { ...currentSnapshot.interaction, focusUiHideGear: false }
      } : currentSnapshot;
      presentationMotion.refresh(active, snapshot);
    }
  });
  root.defaultView?.addEventListener(VIDEO_PRESENTATION_EVENT, presentation.onEvent, { signal });
  root.defaultView?.addEventListener('pagehide', presentation.clear, { signal });
  const resizeObserver = typeof ResizeObserver === 'function' && rail ? new ResizeObserver(updateDockPosition) : null;
  if (rail) resizeObserver?.observe(rail);
  const apply = snapshot => {
    currentSnapshot = snapshot;
    layout = snapshot.header?.useLegacy ? 'legacy' : 'modern';
    root.body.dataset.headerLayout = layout;
    root.documentElement.dataset.initialHeaderLayout = layout;
    const navbarLayout = snapshot.header?.useLegacyNavbar ? 'legacy' : 'modern';
    root.body.dataset.navbarLayout = navbarLayout;
    root.documentElement.dataset.initialNavbarLayout = navbarLayout;
    placeUtilities();
    presentation.refresh();
    const contrast = Math.max(0, Math.min(1, Number(snapshot.start?.contrast) || 0));
    const eased = contrast * contrast * (3 - 2 * contrast);
    const gain = (.08 + 2.32 * eased) / (.08 + 2.32 * .5);
    root.documentElement.style.setProperty('--header-glow-strength', String(gain));
    requestAnimationFrame(() => {
      if (disposed || !root.body) return;
      const rail = root.querySelector('.navigation-bg') || root.querySelector('.navigation');
      root.defaultView?.dispatchEvent(new root.defaultView.CustomEvent(HEADER_LAYOUT_EVENT, {
        detail: { layout, rail, rect: rail?.getBoundingClientRect() || null }
      }));
    });
  };
  const unsubscribe = settings.subscribe(apply, { immediate: true, signal });
  const notify = () => {
    updateDockPosition();
    presentation.refresh();
    const rail = root.querySelector('.navigation-bg') || root.querySelector('.navigation');
    root.defaultView?.dispatchEvent(new root.defaultView.CustomEvent(HEADER_LAYOUT_EVENT, {
      detail: { layout: root.body.dataset.headerLayout || 'modern', rail, rect: rail?.getBoundingClientRect() || null }
    }));
  };
  root.defaultView?.addEventListener('resize', notify, { signal });
  return () => {
    disposed = true;
    if (placementFrame !== null) cancelAnimationFrame(placementFrame);
    unsubscribe?.();
    observer.disconnect();
    resizeObserver?.disconnect();
    presentation.clear();
    presentationMotion.dispose();
    for (const [node, { parent, next }] of utilityPositions) {
      if (node.isConnected && parent?.isConnected) parent.insertBefore(node, next?.parentNode === parent ? next : null);
    }
    dock.remove();
    mouseHost.remove();
    if (navWrap?.parentNode === root.body && navParent?.isConnected) navParent.insertBefore(navWrap, navNext?.parentNode === navParent ? navNext : null);
    navWrap?.classList.remove('shared-nav-wrap');
    if (gear && gearParent?.isConnected) gearParent.insertBefore(gear, gearNext?.parentNode === gearParent ? gearNext : null);
    betaLabel.remove();
    gearHost?.remove();
    delete root.body.dataset.headerLayout;
    delete root.body.dataset.navbarLayout;
    root.documentElement.style.removeProperty('--header-glow-strength');
  };
}
