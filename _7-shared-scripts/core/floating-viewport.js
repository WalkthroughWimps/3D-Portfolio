import { panelViewport } from './panel-viewport.js';

const owners = new WeakMap();
const panelSelector = '#review-panels .review-panel';
const navigationSelector = '.nav-wrap, .shared-nav-wrap';

// Keep a usable rectangle even when a narrow-screen drawer fills the width:
// the strip above it remains available, rather than positioning controls offscreen.
export function floatingViewportBounds(viewport, navigation, panels, strip) {
  const base = { ...viewport };
  if (navigation && navigation.height > viewport.height / 2 && navigation.right > base.left && navigation.left < base.left + (navigation.right - navigation.left))
    base.left = Math.min(base.right, navigation.right);
  const centerStrip = { ...base, left: Math.max(base.left, strip.left), right: Math.min(base.right, strip.right) };
  if (centerStrip.right - centerStrip.left >= Math.min(260, base.right - base.left)) return centerStrip;
  let spaces = [base];
  for (const panel of panels) {
    spaces = spaces.flatMap(space => {
      const left = Math.max(space.left, panel.left), right = Math.min(space.right, panel.right);
      const top = Math.max(space.top, panel.top), bottom = Math.min(space.bottom, panel.bottom);
      if (right <= left || bottom <= top) return [space];
      return [
        { ...space, right: left }, { ...space, left: right },
        { ...space, bottom: top }, { ...space, top: bottom }
      ].filter(rect => rect.right > rect.left && rect.bottom > rect.top);
    });
  }
  spaces.sort((a, b) => (b.right - b.left) * (b.bottom - b.top) - (a.right - a.left) * (a.bottom - a.top));
  return spaces[0] || centerStrip;
}

/** Center UI windows without changing the position or framing of scene objects. */
export function trackFloatingViewport(root = document, selector) {
  let owner = owners.get(root);
  if (!owner) {
    const view = root.defaultView;
    const registrations = new Map(), moving = new Set(), observed = new Set();
    let frame = 0;
    const resize = new view.ResizeObserver(schedule);
    function update() {
      frame = 0;
      for (const node of moving) if (!node.isConnected) moving.delete(node);
      const windows = [...new Set([...registrations.values()].flatMap(query => [...root.querySelectorAll(query)]))];
      const panels = [...root.querySelectorAll(panelSelector)];
      const navigation = root.querySelector(navigationSelector);
      const measuring = new Set([...panels, ...(navigation ? [navigation] : [])]);
      for (const node of observed) if (!measuring.has(node)) { resize.unobserve(node); observed.delete(node); }
      for (const node of measuring) if (!observed.has(node)) { resize.observe(node); observed.add(node); }
      if (windows.some(node => node.open)) {
        const visual = view.visualViewport;
        const viewport = {
          left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0,
          width: visual?.width || root.documentElement.clientWidth,
          height: visual?.height || root.documentElement.clientHeight
        };
        viewport.right = viewport.left + viewport.width; viewport.bottom = viewport.top + viewport.height;
        const horizontal = panelViewport({ getBoundingClientRect: () => viewport });
        const edges = panels.filter(node => view.getComputedStyle(node).display !== 'none').map(node => node.getBoundingClientRect());
        const nav = navigation && view.getComputedStyle(navigation).display !== 'none' ? navigation.getBoundingClientRect() : null;
        const area = floatingViewportBounds(viewport, nav, edges, {
          left: viewport.left + horizontal.left, right: viewport.left + horizontal.right
        });
        const width = Math.max(1, area.right - area.left), height = Math.max(1, area.bottom - area.top);
        const margin = Math.min(16, width / 24, height / 24);
        const values = {
          '--floating-center-x': `${(area.left + area.right) / 2}px`,
          '--floating-center-y': `${(area.top + area.bottom) / 2}px`,
          '--floating-width': `${Math.max(1, Math.min(width - margin * 2, viewport.width * .94))}px`,
          '--floating-height': `${Math.max(1, Math.min(height - margin * 2, viewport.height * .92))}px`
        };
        for (const node of windows) for (const [property, value] of Object.entries(values))
          if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value);
      }
      if (moving.size) schedule();
    }
    function schedule() { if (!frame) frame = view.requestAnimationFrame(update); }
    function transition(event) {
      if (!event.target.matches?.(panelSelector) || event.propertyName !== 'transform') return;
      if (event.type === 'transitionrun') moving.add(event.target); else moving.delete(event.target);
      schedule();
    }
    const mutations = new view.MutationObserver(changes => {
      if (changes.some(change => change.type === 'childList' || change.attributeName === 'open' ||
          change.attributeName === 'class' || change.target.matches?.(`${panelSelector}, ${navigationSelector}`))) schedule();
    });
    mutations.observe(root.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'class', 'style'] });
    for (const event of ['transitionrun', 'transitionend', 'transitioncancel']) root.addEventListener(event, transition, true);
    view.addEventListener('resize', schedule); view.addEventListener('site:header-layout-change', schedule);
    visualListen('addEventListener');
    function visualListen(method) {
      view.visualViewport?.[method]('resize', schedule); view.visualViewport?.[method]('scroll', schedule);
    }
    owner = { registrations, schedule, dispose() {
      mutations.disconnect(); resize.disconnect(); view.cancelAnimationFrame(frame);
      for (const event of ['transitionrun', 'transitionend', 'transitioncancel']) root.removeEventListener(event, transition, true);
      view.removeEventListener('resize', schedule); view.removeEventListener('site:header-layout-change', schedule);
      visualListen('removeEventListener'); owners.delete(root);
    } };
    owners.set(root, owner);
  }
  const token = Symbol(); owner.registrations.set(token, selector); owner.schedule();
  return () => { owner.registrations.delete(token); if (!owner.registrations.size) owner.dispose(); };
}
