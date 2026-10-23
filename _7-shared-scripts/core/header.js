export const HEADER_LAYOUT_EVENT = 'site:header-layout-change';
export const VIDEO_PRESENTATION_EVENT = 'site:video-presentation-change';

export function createVideoPresentationController(root, getNodes) {
  const sources = new Set();
  const priorInert = new Map();
  const refresh = () => {
    const active = sources.size > 0;
    if (active) root.body.dataset.videoPresentation = 'active';
    else delete root.body.dataset.videoPresentation;
    if (!active) {
      for (const [node, inert] of priorInert) node.inert = inert;
      priorInert.clear();
      return;
    }
    for (const node of getNodes()) {
      if (!node) continue;
      if (!priorInert.has(node)) priorInert.set(node, node.inert);
      node.inert = true;
      if (node.contains?.(root.activeElement)) root.activeElement.blur();
    }
  };
  return {
    refresh,
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
  let gearHost = null, gearParent = null, gearNext = null;
  const betaLabel = root.createElement('span');
  betaLabel.className = 'header-beta-label';
  betaLabel.textContent = 'IN BETA';
  if (header && gear) {
    gearParent = gear.parentNode; gearNext = gear.nextSibling;
    gearHost = root.createElement('div'); gearHost.className = 'header-gear';
    gearHost.append(betaLabel, gear); header.append(gearHost);
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
    gearHost.append(betaLabel, startGear);
    root.body.append(gearHost);
  }
  const dock = root.createElement('aside');
  dock.className = 'header-utility-dock';
  dock.setAttribute('aria-label', 'Page utilities');
  root.body.append(dock);
  const mouseHost = root.createElement('div');
  mouseHost.className = 'header-mouse-controls';
  mouseHost.setAttribute('aria-label', 'Mouse controls');
  header?.append(mouseHost);
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
        if (layout === 'modern' && node.parentNode !== mouseHost) mouseHost.append(node);
        continue;
      }
      if (node.closest('dialog, #review-panels') || node === dock || dock.contains(node)) continue;
      if (!utilityPositions.has(node)) utilityPositions.set(node, { parent: node.parentNode, next: node.nextSibling });
      if (layout === 'modern') dock.append(node);
    }
    if (layout === 'legacy') {
      for (const [node, { parent, next }] of utilityPositions) {
        if (node.isConnected && parent?.isConnected && node.parentNode !== parent) {
          parent.insertBefore(node, next?.parentNode === parent ? next : null);
        }
      }
    }
    updateDockPosition();
  };
  let placementPending = false;
  const schedulePlacement = () => {
    if (placementPending) return;
    placementPending = true;
    requestAnimationFrame(() => { placementPending = false; placeUtilities(); presentation.refresh(); });
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.matches?.(utilitySelector) || node.querySelector?.(utilitySelector))
    ))) schedulePlacement();
  });
  observer.observe(root.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const presentation = createVideoPresentationController(root, () => [
    header, dock, ...[...root.querySelectorAll(utilitySelector)].filter(node => !node.closest('#review-panels'))
  ]);
  root.defaultView?.addEventListener(VIDEO_PRESENTATION_EVENT, presentation.onEvent, { signal });
  root.defaultView?.addEventListener('pagehide', presentation.clear, { signal });
  const resizeObserver = typeof ResizeObserver === 'function' && rail ? new ResizeObserver(updateDockPosition) : null;
  if (rail) resizeObserver?.observe(rail);
  const apply = snapshot => {
    layout = snapshot.header?.useLegacy ? 'legacy' : 'modern';
    if (gear) {
      if (layout === 'modern') gearHost?.append(betaLabel, gear);
      else if (gearParent?.isConnected) {
        gearParent.insertBefore(gear, gearNext?.parentNode === gearParent ? gearNext : null);
        gearParent.insertBefore(betaLabel, gear);
      }
    }
    root.body.dataset.headerLayout = layout;
    placeUtilities();
    const contrast = Math.max(0, Math.min(1, Number(snapshot.start?.contrast) || 0));
    const eased = contrast * contrast * (3 - 2 * contrast);
    const gain = (.08 + 2.32 * eased) / (.08 + 2.32 * .5);
    root.documentElement.style.setProperty('--header-glow-strength', String(gain));
    requestAnimationFrame(() => {
      if (!root.body) return;
      const rail = root.querySelector('.navigation-bg') || root.querySelector('.navigation');
      root.defaultView?.dispatchEvent(new root.defaultView.CustomEvent(HEADER_LAYOUT_EVENT, {
        detail: { layout, rail, rect: rail?.getBoundingClientRect() || null }
      }));
    });
  };
  const unsubscribe = settings.subscribe(apply, { immediate: true, signal });
  const notify = () => {
    updateDockPosition();
    const rail = root.querySelector('.navigation-bg') || root.querySelector('.navigation');
    root.defaultView?.dispatchEvent(new root.defaultView.CustomEvent(HEADER_LAYOUT_EVENT, {
      detail: { layout: root.body.dataset.headerLayout || 'modern', rail, rect: rail?.getBoundingClientRect() || null }
    }));
  };
  root.defaultView?.addEventListener('resize', notify, { signal });
  return () => {
    unsubscribe?.();
    observer.disconnect();
    resizeObserver?.disconnect();
    presentation.clear();
    for (const [node, { parent, next }] of utilityPositions) {
      if (node.isConnected && parent?.isConnected) parent.insertBefore(node, next?.parentNode === parent ? next : null);
    }
    dock.remove();
    mouseHost.remove();
    if (gear && gearParent?.isConnected) gearParent.insertBefore(gear, gearNext?.parentNode === gearParent ? gearNext : null);
    betaLabel.remove();
    gearHost?.remove();
    delete root.body.dataset.headerLayout;
    root.documentElement.style.removeProperty('--header-glow-strength');
  };
}
