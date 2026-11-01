import { TRANSFORM_RESET_EASINGS, resolveTransformResetEasing } from '../_7-shared-scripts/core/transform-easing.js';

const labels = new Map(TRANSFORM_RESET_EASINGS);
let popupSerial = 0;

function curvePlot(id) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 80 40');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('reset-easing-plot');
  const line = (x1, y1, x2, y2, className) => {
    const element = document.createElementNS(svg.namespaceURI, 'line');
    for (const [key, value] of Object.entries({ x1, y1, x2, y2 })) element.setAttribute(key, String(value));
    element.setAttribute('class', className);
    svg.append(element);
  };
  line(6, 34, 76, 34, 'reset-easing-axis');
  line(6, 34, 6, 4, 'reset-easing-axis');
  line(6, 34, 76, 6, 'reset-easing-baseline');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('class', 'reset-easing-curve');
  path.setAttribute('d', Array.from({ length: 33 }, (_, index) => {
    const t = index / 32;
    return `${index ? 'L' : 'M'}${(6 + 70 * t).toFixed(2)} ${(34 - 28 * resolveTransformResetEasing(id, t)).toFixed(2)}`;
  }).join(' '));
  svg.append(path);
  return svg;
}

/** UI only: the shared settings-control binder owns every write to the store. */
export function mountResetEasingControls(general, panel, store) {
  const events = new AbortController();
  const controls = new Map();
  const popup = document.createElement('div');
  popup.className = 'reset-easing-popup';
  popup.id = `reset-easing-popup-${++popupSerial}`;
  popup.hidden = true;
  popup.setAttribute('role', 'dialog');
  panel.append(popup);
  let active = null;

  for (const kind of ['pan', 'rotation']) {
    const placeholder = general.querySelector(`[data-reset-easing-picker="${kind}"]`);
    if (!placeholder) continue;
    const title = kind === 'pan' ? 'Move reset easing' : 'Rotation reset easing';
    const path = `interaction.${kind}ResetEasing`;
    const select = document.createElement('select');
    select.dataset.setting = path;
    select.hidden = true;
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    select.append(new Option('Page default', ''));
    for (const [id, label] of TRANSFORM_RESET_EASINGS) select.append(new Option(label, id));
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'reset-easing-trigger';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', popup.id);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = `${title}: Page default`;
    placeholder.className = 'reset-easing-control';
    placeholder.append(select, trigger);
    const control = { kind, title, select, trigger };
    controls.set(kind, control);
    trigger.addEventListener('click', () => active === control ? close(true) : open(control), { signal: events.signal });
    trigger.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      open(control);
      focusChoice(event.key === 'ArrowUp' ? -1 : 0);
    }, { signal: events.signal });
  }

  function renderChoices(control) {
    popup.replaceChildren();
    popup.setAttribute('aria-label', control.title);
    const grid = document.createElement('div');
    grid.className = 'reset-easing-grid';
    for (const [id, label] of TRANSFORM_RESET_EASINGS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.easing = id;
      const caption = document.createElement('span');
      caption.textContent = label;
      button.append(caption, curvePlot(id));
      button.setAttribute('aria-pressed', String(control.select.value === id));
      grid.append(button);
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'reset-easing-default';
    reset.dataset.easing = '';
    reset.textContent = 'Use page default';
    popup.append(grid, reset);
  }

  function updateChoiceState(control) {
    for (const button of popup.querySelectorAll('button[data-easing]')) {
      button.setAttribute('aria-pressed', String(control.select.value === button.dataset.easing));
    }
  }

  function position() {
    if (!active || popup.hidden) return;
    const bounds = panel.getBoundingClientRect();
    const trigger = active.trigger.getBoundingClientRect();
    const visible = {
      left: Math.max(0, bounds.left), right: Math.min(window.innerWidth, bounds.right),
      top: Math.max(0, bounds.top), bottom: Math.min(window.innerHeight, bounds.bottom)
    };
    if (visible.right <= visible.left || visible.bottom <= visible.top) { close(false); return; }
    const scroller = active.trigger.closest('.review-panel-scroll')?.getBoundingClientRect();
    if (scroller && (trigger.bottom <= scroller.top || trigger.top >= scroller.bottom)) {
      close(false);
      return;
    }
    popup.style.maxHeight = `${Math.max(0, visible.bottom - visible.top - 16)}px`;
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const left = Math.max(visible.left + 8, Math.min(trigger.left, visible.right - width - 8));
    const below = visible.bottom - trigger.bottom - 8;
    const above = trigger.top - visible.top - 8;
    const top = below >= height || below >= above ? trigger.bottom + 4 : trigger.top - height - 4;
    popup.style.left = `${left - bounds.left}px`;
    popup.style.top = `${Math.max(visible.top + 8, Math.min(top, visible.bottom - height - 8)) - bounds.top}px`;
  }

  function open(control) {
    if (active && active !== control) close(false);
    active = control;
    control.trigger.setAttribute('aria-expanded', 'true');
    renderChoices(control);
    popup.hidden = false;
    position();
    const selectedIndex = TRANSFORM_RESET_EASINGS.findIndex(([id]) => id === control.select.value);
    focusChoice(selectedIndex < 0 ? TRANSFORM_RESET_EASINGS.length : selectedIndex);
  }

  function close(returnFocus) {
    if (!active) return;
    const trigger = active.trigger;
    active = null;
    popup.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (returnFocus) trigger.focus({ preventScroll: true });
  }

  function focusChoice(index) {
    const buttons = [...popup.querySelectorAll('button')];
    buttons[(index + buttons.length) % buttons.length]?.focus({ preventScroll: true });
  }

  popup.addEventListener('click', event => {
    const button = event.target.closest('button[data-easing]');
    if (!button || !active) return;
    active.select.value = button.dataset.easing;
    active.select.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  }, { signal: events.signal });
  popup.addEventListener('keydown', event => {
    const buttons = [...popup.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    const offset = { ArrowRight: 1, ArrowDown: 2, ArrowLeft: -1, ArrowUp: -2 }[event.key];
    if (offset === undefined || index < 0) return;
    event.preventDefault();
    focusChoice(index + offset);
  }, { signal: events.signal });
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      close(true);
    }
  }, { capture: true, signal: events.signal });
  document.addEventListener('pointerdown', event => {
    if (active && !popup.contains(event.target) && !active.trigger.contains(event.target)) close(false);
  }, { capture: true, signal: events.signal });
  panel.addEventListener('scroll', position, { capture: true, passive: true, signal: events.signal });
  window.addEventListener('resize', position, { signal: events.signal });
  const observer = new MutationObserver(() => {
    if (active && (panel.classList.contains('is-closed') || !active.trigger.isConnected ||
      active.trigger.closest('[hidden],[inert]') || !active.trigger.getClientRects().length)) close(false);
  });
  observer.observe(panel, { attributes: true, subtree: true, attributeFilter: ['hidden', 'inert', 'class'] });
  const unsubscribe = store.subscribe(snapshot => {
    for (const control of controls.values()) {
      const value = snapshot.interaction?.[`${control.kind}ResetEasing`] || '';
      control.select.value = value;
      control.trigger.textContent = `${control.title}: ${labels.get(value) || 'Page default'}`;
      if (active === control) updateChoiceState(control);
    }
  }, { immediate: true });

  return { dispose() { close(false); events.abort(); observer.disconnect(); unsubscribe(); popup.remove(); } };
}
