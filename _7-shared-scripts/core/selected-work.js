import { VIDEO_PRESENTATION_EVENT } from './header.js';

const PROJECTS = new Set(['coursebooks', 'neotube', 'global-conquest', 'plunky']);
const OVERLAY_STYLE = new URL('../../_0-start/start/project-overlays.css', import.meta.url).href;

export function mountSelectedWork({ root = document, scope, onOpen, onClose } = {}) {
  const page = new URL(root.baseURI);
  if (page.searchParams.get('embed') === '1') return () => {};
  const strip = root.querySelector('.site-selected-work');
  if (!strip || !root.body) return () => {};

  // A body-level fixed strip is independent of header and scene transforms.
  const originalParent = strip.parentNode;
  const originalNext = strip.nextSibling;
  root.body.append(strip);
  let style = [...root.querySelectorAll('link[rel="stylesheet"]')].find(link => link.href === OVERLAY_STYLE);
  const ownsStyle = !style;
  if (!style) {
    style = root.createElement('link');
    style.rel = 'stylesheet';
    style.href = OVERLAY_STYLE;
    root.head.append(style);
  }

  let disposed = false;
  let generation = 0;
  let pending = false;
  let overlay = null;
  let active = false;
  const view = root.defaultView;
  const presentation = enabled => view?.dispatchEvent(new view.CustomEvent(VIDEO_PRESENTATION_EVENT, {
    detail: { source: 'selected-work', active: enabled }
  }));
  const opened = key => {
    if (disposed || scope?.signal.aborted || active) return;
    active = true;
    onOpen?.(key);
    presentation(true);
  };
  const closed = key => {
    if (!active) return;
    active = false;
    presentation(false);
    onClose?.(key);
  };
  const fallback = anchor => {
    if (!disposed && !scope?.signal.aborted) view.location.assign(anchor.href);
  };
  const click = async event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest?.('a[data-start-project]');
    if (!anchor || !strip.contains(anchor) || anchor.target && anchor.target !== '_self' || anchor.hasAttribute('download')) return;
    const key = anchor.dataset.startProject;
    if (!PROJECTS.has(key)) return;
    event.preventDefault();
    if (pending || active) return;
    pending = true;
    const request = ++generation;
    try {
      if (!overlay) {
        const { mountStartProjectOverlays } = await import('../../_0-start/start/project-overlays.js');
        if (disposed || scope?.signal.aborted || request !== generation || root.hidden) return;
        overlay = mountStartProjectOverlays({ scope, onOpen: opened, onClose: closed, returnLabel: 'page' });
      }
      if (disposed || scope?.signal.aborted || request !== generation || root.hidden) return;
      if (!overlay.open(key, anchor)) fallback(anchor);
    } catch (error) {
      console.warn('Selected work preview could not open', error);
      fallback(anchor);
    } finally {
      if (request === generation) pending = false;
    }
  };
  strip.addEventListener('click', click);
  return () => {
    if (disposed) return;
    disposed = true;
    generation += 1;
    strip.removeEventListener('click', click);
    overlay?.dispose();
    closed();
    if (ownsStyle) style.remove();
    if (originalParent?.isConnected) originalParent.insertBefore(strip, originalNext?.parentNode === originalParent ? originalNext : null);
  };
}
