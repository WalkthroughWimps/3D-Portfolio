import { HEADER_LAYOUT_EVENT, VIDEO_PRESENTATION_EVENT } from './header.js';
import { getSharedSettings } from './settings.js';
import { prefersReducedMotion } from './motion-preference.js';

// Keep this copy short: it is the first stop for someone passing by the page.
const pages = {
  start: {
    summary: 'Customize your comfort before exploring: adjust sound, audio sync, brightness and contrast with the 3D controller or the separate Sound & visual controls. Preview selected work here, then use Proceed to site to choose the section that interests you.',
    points: [{label:'Sound & visual controls', selector:'#startNativeControls summary', openDetails:true}, {label:'Choose a site section', selector:'#proceedToSite'}]
  },
  about: { summary: 'Creative and educational media blend design, animation, music, and code in this interactive cube. Choose a face to explore its work.', points: [] },
  videos: {
    summary: 'Six collections of video work are presented on the tablet. Choose a category to view its visual preview.',
    points: ['Online Classes', 'A-List Videos', 'News Broadcast', 'NeoTube Studios', 'Music Videos', 'Random Vids'].map(label => ({ label: `${label} preview`, linkText: `${label} visual preview` }))
  },
  graphics: {
    summary: 'Coursebooks, board games, and an easel video sit on the interactive shelf. Select an item to bring it into view.',
    points: [1, 2, 3, 4, 5, 6].map(n => ({ label: `Grade ${n}`, selector: `.accessible-items [data-item="book-${n}"]` })).concat([{ label: 'Global Conquest', selector: '.accessible-items [data-item="game-0"]' }, { label: 'Manor Mayhem', selector: '.accessible-items [data-item="game-1"]' }, { label: 'The Great Race', selector: '.accessible-items [data-item="easel"]' }])
  },
  games: {
    summary: 'The arcade cabinet gathers five playable games and two video reels. Choose one to open it on the cabinet screen.',
    points: ['Ships, Avoid!', 'Go Plunky, Go!', 'Train Mania!', 'Pick a Square!', 'You Be the Waiter!'].map(label => ({ label, linkText: label }))
  },
  music: { summary: 'Play the toy piano, choose instruments, or select a composition. Audio plays after you give permission.', points: [] },
  docs: { summary: 'Teaching resources and presentations rest on a desk. Choose a paper or a document in the list to open it.', points: [] }
};

const registrations = new Map();
const subscribers = new Map();
export function getPoiMotion() {
  const interaction = getSharedSettings().get().interaction || {};
  const speed = Math.max(.25, Math.min(3, Number(interaction.poiSpeed) || 1));
  const animate = interaction.poiAnimate !== false && !prefersReducedMotion();
  return { animate, speed, duration: baseMs => animate ? Math.round(baseMs / speed) : 0 };
}
export function registerPageSummaryPoints(pageId, points) {
  if (!pages[pageId]) throw new TypeError(`Unknown page summary: ${pageId}`);
  registrations.set(pageId, points);
  subscribers.get(pageId)?.forEach(refresh => refresh());
  return () => {
    if (registrations.get(pageId) === points) registrations.delete(pageId);
    subscribers.get(pageId)?.forEach(refresh => refresh());
  };
}

export function mountPageSummary({ pageId, root = document } = {}) {
  const page = pages[pageId];
  if (!page || !root.body) return () => {};
  const win = root.defaultView || window;
  const style = root.createElement('link');
  style.rel = 'stylesheet';
  style.href = new URL('./page-summary.css', import.meta.url).href;
  style.addEventListener('load', position, { once: true });
  root.head.append(style);
  const trigger = root.createElement('button');
  trigger.type = 'button';
  trigger.className = 'page-summary-trigger';
  trigger.textContent = 'Page summary';
  trigger.setAttribute('aria-expanded', 'false');
  const panel = root.createElement('section');
  panel.className = 'page-summary-panel';
  panel.id = `page-summary-${pageId}`;
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Page summary and points of interest');
  trigger.setAttribute('aria-controls', panel.id);
  const copy = root.createElement('p');
  copy.className = 'page-summary-copy';
  copy.textContent = page.summary;
  const grid = root.createElement('div');
  grid.className = 'page-summary-points';
  grid.setAttribute('aria-label', 'Points of interest');
  const close = root.createElement('button');
  close.type = 'button';
  close.className = 'page-summary-close';
  close.setAttribute('aria-label', 'Close page summary');
  close.textContent = '×';
  const status = root.createElement('p');
  status.className = 'page-summary-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  panel.append(copy, grid, status, close);
  root.body.append(trigger, panel);
  root.body.dataset.pageSummary = 'ready';
  const title = root.querySelector('.header .title, #title, .header h1, h1');
  let disposed = false;
  const findTarget = point => point.selector ? root.querySelector(point.selector) :
    [...root.querySelectorAll('.scene-alternative a[href]')].find(link => link.textContent.trim() === point.linkText);
  function closePanel(restoreFocus = false) {
    if (panel.hidden) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  function render() {
    if (disposed) return;
    grid.replaceChildren();
    status.hidden = true;
    for (const point of registrations.get(pageId) || page.points) {
      if (point.href) {
        const link = root.createElement('a');
        link.href = new URL(point.href, root.baseURI).href;
        link.textContent = point.label;
        link.addEventListener('click', () => closePanel());
        grid.append(link);
        continue;
      }
      const target = point.run ? null : findTarget(point);
      const button = root.createElement('button');
      button.type = 'button';
      button.textContent = point.label;
      button.disabled = point.ready ? !point.ready() : point.run ? false : !target || target.disabled || target.hidden;
      button.addEventListener('click', () => {
        if (button.disabled) return;
        closePanel();
        const motion = getPoiMotion();
        if (point.run) {
          try { Promise.resolve(point.run(motion)).catch(reportFailure); }
          catch (error) { reportFailure(error); }
        }
        else if (point.openDetails && target?.parentElement?.tagName === 'DETAILS') { target.parentElement.open = true; target.focus(); }
        else if (target?.matches('a[href]')) target.click();
        else target?.click();
        if (root.activeElement === button) button.blur();
      });
      grid.append(button);
    }
  }
  function reportFailure(error) {
    if (disposed) return;
    console.warn('Page summary action failed', error);
    status.textContent = 'This item could not open. Please try again.';
    status.hidden = false;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    position();
    close.focus();
  }
  function position() {
    if (disposed) return;
    const rect = title?.getBoundingClientRect();
    const compact = pageId !== 'start' && win.innerWidth <= 600 && root.body.dataset.headerLayout === 'modern';
    const headerStyle = compact ? win.getComputedStyle(root.body) : null;
    const top = compact ? (parseFloat(headerStyle.getPropertyValue('--site-header-cap-height')) || 89) + 12 :
      rect && rect.width ? Math.max(8, rect.top + (rect.height - trigger.offsetHeight) / 2) : 14;
    const left = compact ? Math.min(win.innerWidth - trigger.offsetWidth - 10,
      (parseFloat(headerStyle.getPropertyValue('--site-nav-rail-width')) || 68) + 12) :
      rect && rect.width ? Math.min(win.innerWidth - trigger.offsetWidth - 10, rect.right + 12) : 12;
    trigger.style.top = `${Math.round(top)}px`;
    trigger.style.left = `${Math.max(8, Math.round(left))}px`;
    const anchor = trigger.getBoundingClientRect();
    panel.style.top = `${Math.round(Math.max(8, Math.min(win.innerHeight - 80, compact ? anchor.bottom + 8 : rect?.top ?? anchor.top)))}px`;
    panel.style.left = `${Math.round(Math.max(8, Math.min(anchor.left, win.innerWidth - panel.offsetWidth - 8)))}px`;
  }
  trigger.addEventListener('click', () => {
    if (!panel.hidden) { closePanel(); return; }
    render();
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    position();
    (grid.querySelector('button:not(:disabled), a[href]') || close).focus();
  });
  close.addEventListener('click', () => closePanel(true));
  let dismissedPointerId = null;
  let dismissedPointerActive = false;
  const consumeDismissal = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  const onPointer = event => {
    dismissedPointerId = null; // A new pointerdown starts a new, usable gesture.
    dismissedPointerActive = false;
    if (panel.hidden || panel.contains(event.target) || event.target === trigger) return;
    dismissedPointerId = event.pointerId;
    dismissedPointerActive = true;
    closePanel();
    consumeDismissal(event);
  };
  const onDismissedPointer = event => {
    if (event.pointerId !== dismissedPointerId || !dismissedPointerActive) return;
    consumeDismissal(event);
    if (event.type === 'pointerup') dismissedPointerActive = false;
    if (event.type === 'pointercancel') { dismissedPointerActive = false; dismissedPointerId = null; }
  };
  const onDismissedMouse = event => {
    if (dismissedPointerId !== null && (dismissedPointerActive || event.type === 'mouseup')) consumeDismissal(event);
  };
  const onDismissedClick = event => {
    if (dismissedPointerId !== null && event.detail > 0) consumeDismissal(event);
  };
  const onKey = event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); event.stopImmediatePropagation(); closePanel(true); } };
  root.addEventListener('pointerdown', onPointer, true);
  for (const type of ['pointermove', 'pointerup', 'pointercancel']) root.addEventListener(type, onDismissedPointer, true);
  for (const type of ['mousedown', 'mouseup']) root.addEventListener(type, onDismissedMouse, true);
  for (const type of ['click', 'dblclick']) root.addEventListener(type, onDismissedClick, true);
  root.addEventListener('keydown', onKey, true);
  win.addEventListener('resize', position);
  win.addEventListener(HEADER_LAYOUT_EVENT, position);
  const onPresentation = event => { if (event.detail?.active) closePanel(); };
  win.addEventListener(VIDEO_PRESENTATION_EVENT, onPresentation);
  const resize = typeof ResizeObserver === 'function' && title ? new ResizeObserver(position) : null;
  resize?.observe(title);
  const listeners = subscribers.get(pageId) || new Set();
  listeners.add(render); subscribers.set(pageId, listeners);
  render();
  win.requestAnimationFrame(position);
  const dispose = () => {
    disposed = true;
    listeners.delete(render);
    if (!listeners.size) subscribers.delete(pageId);
    resize?.disconnect();
    style.removeEventListener('load', position);
    root.removeEventListener('pointerdown', onPointer, true);
    for (const type of ['pointermove', 'pointerup', 'pointercancel']) root.removeEventListener(type, onDismissedPointer, true);
    for (const type of ['mousedown', 'mouseup']) root.removeEventListener(type, onDismissedMouse, true);
    for (const type of ['click', 'dblclick']) root.removeEventListener(type, onDismissedClick, true);
    root.removeEventListener('keydown', onKey, true);
    win.removeEventListener('resize', position);
    win.removeEventListener(HEADER_LAYOUT_EVENT, position);
    win.removeEventListener(VIDEO_PRESENTATION_EVENT, onPresentation);
    panel.remove(); trigger.remove(); style.remove();
    delete root.body.dataset.pageSummary;
  };
  return dispose;
}
