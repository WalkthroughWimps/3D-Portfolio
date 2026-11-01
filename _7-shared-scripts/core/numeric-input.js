const owners = new WeakMap();

/** Register owner-specific history behavior without installing a second drag handler. */
export function registerNumericInputOwner(element, hooks, { signal } = {}) {
  owners.set(element, hooks);
  const dispose = () => { if (owners.get(element) === hooks) owners.delete(element); };
  signal?.addEventListener('abort', dispose, { once: true });
  return dispose;
}

function ownerFor(input) {
  for (let node = input; node; node = node.parentElement) {
    if (owners.has(node)) return owners.get(node);
  }
  return null;
}

function bound(input, name, fallback) {
  const raw = input.getAttribute(name);
  if (raw === null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nextValue(input, initial, travel) {
  const min = bound(input, 'min', -Infinity);
  const max = bound(input, 'max', Infinity);
  const rawStep = input.getAttribute('step');
  const step = rawStep === 'any' ? Math.max(0.01, Math.abs(initial) * 0.01) : Number(rawStep || 1);
  const increment = Number.isFinite(step) && step > 0 ? step : 1;
  const candidate = initial + Math.round(travel / 8) * increment;
  const clamped = Math.min(max, Math.max(min, candidate));
  if (rawStep !== 'any') {
    const base = Number.isFinite(min) ? min : 0;
    const index = Math.round((clamped - base) / increment);
    const upperIndex = Number.isFinite(max) ? Math.floor((max - base) / increment) : Infinity;
    const lowerIndex = Number.isFinite(min) ? Math.ceil((min - base) / increment) : -Infinity;
    return Number((base + Math.min(upperIndex, Math.max(lowerIndex, index)) * increment).toFixed(10));
  }
  return Number(clamped.toFixed(10));
}

/** One delegated mouse scrub for present and future number inputs. */
export function mountNumericInputs(root = document) {
  let drag = null, suppressClick = null, clickTimer = null;
  const doc = root.nodeType === 9 ? root : root.ownerDocument;
  const win = doc.defaultView;
  const requestLock = current => {
    if (!current.input.requestPointerLock) return;
    const input = current.input;
    current.lockPending = true;
    let pending = true;
    const cleanup = () => {
      if (!pending) return;
      pending = false;
      current.lockPending = false;
      doc.removeEventListener('pointerlockchange', settle);
      doc.removeEventListener('pointerlockerror', cleanup);
    };
    const settle = () => {
      if (doc.pointerLockElement !== input) return;
      if (drag !== current) doc.exitPointerLock?.();
      cleanup();
    };
    // Some browsers return undefined and grant lock asynchronously. These
    // listeners survive this mount's disposal until the request settles.
    doc.addEventListener('pointerlockchange', settle);
    doc.addEventListener('pointerlockerror', cleanup);
    try {
      Promise.resolve(input.requestPointerLock()).then(() => {
        if (doc.pointerLockElement === input) settle();
      }).catch(cleanup);
    } catch { cleanup(); /* coordinate fallback */ }
  };
  const onDown = event => {
    if (drag || event.button !== 0 || event.pointerType !== 'mouse') return;
    const input = event.target.closest?.('input[type="number"]');
    if (!input || !root.contains(input) || input.disabled || input.readOnly) return;
    if (event.defaultPrevented) return;
    const original = input.value;
    const parsed = Number(original);
    const initial = original !== '' && Number.isFinite(parsed) ? parsed : bound(input, 'min', 0);
    const owner = ownerFor(input);
    drag = { input, owner, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      lastX: event.clientX, lastY: event.clientY, travel: 0, distance: 0,
      pointerStamp: -Infinity, lockPending: false,
      initial, original, active: false, locked: false, data: null };
    event.preventDefault();
    input.focus({preventScroll: true});
    // Capture before the first movement: a narrow field can be left in one event.
    try { input.setPointerCapture?.(event.pointerId); } catch { /* window fallback */ }
  };
  const activate = current => {
    if (current.active) return;
    current.active = true;
    current.data = current.owner?.start?.(current.input);
    current.styles = [current.input.style.cursor, doc.documentElement.style.userSelect];
    current.input.style.cursor = 'ew-resize';
    doc.documentElement.style.userSelect = 'none';
    win.getSelection?.()?.removeAllRanges();
    requestLock(current);
  };
  const finish = (cancel = false) => {
    const current = drag;
    if (!current) return;
    drag = null;
    if (doc.pointerLockElement === current.input) doc.exitPointerLock?.();
    try { if (current.input.hasPointerCapture?.(current.pointerId)) current.input.releasePointerCapture(current.pointerId); } catch { /* capture may end with lock */ }
    if (!current.active) return;
    current.input.style.cursor = current.styles[0];
    doc.documentElement.style.userSelect = current.styles[1];
    // The release click must not turn a scrub into text selection or a scene click.
    suppressClick = current.input;
    win.clearTimeout(clickTimer);
    clickTimer = win.setTimeout(() => { suppressClick = null; }, 0);
    if (cancel && current.input.value !== current.original) {
      current.input.value = current.original;
      current.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    else if (!cancel) current.input.dispatchEvent(new Event('change', { bubbles: true }));
    current.owner?.end?.(current.input, { cancel, original: current.original, data: current.data });
  };
  const move = (event, relative) => {
    const current = drag;
    if (current.input.disabled || current.input.readOnly || !current.input.isConnected) { finish(true); return; }
    if (!(event.buttons & 1)) { finish(); return; }
    const dx = relative ? event.movementX : event.clientX - current.lastX;
    const dy = relative ? -event.movementY : current.lastY - event.clientY;
    current.lastX = event.clientX; current.lastY = event.clientY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    current.distance += Math.hypot(dx, dy);
    current.travel += (dx + dy) * (event.shiftKey ? 0.2 : 1);
    if (!current.active && current.distance < 2) return;
    activate(current);
    const value = nextValue(current.input, current.initial, current.travel);
    if (current.input.value !== String(value)) {
      current.input.value = String(value);
      current.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  const onMove = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.pointerStamp = event.timeStamp;
    move(event, drag.locked);
  };
  const onMouseMove = event => {
    const current = drag;
    if (!current?.locked) return;
    // Cancelled pointerdown can suppress mousemove. Prefer pointermove under
    // lock too; older browsers may send only compatibility mouse events.
    if (Math.abs(event.timeStamp - current.pointerStamp) < 2) return;
    move(event, true);
  };
  const onLockChange = () => {
    if (!drag) return;
    const wasLocked = drag.locked;
    drag.locked = doc.pointerLockElement === drag.input;
    if (!drag.locked && wasLocked) finish(true);
  };
  const onUp = event => { if (drag?.pointerId === event.pointerId && event.button === 0) finish(); };
  const onMouseUp = event => { if (drag && event.button === 0) finish(); };
  const onCancel = event => { if (drag?.pointerId === event.pointerId && !drag.lockPending && !drag.locked) finish(true); };
  const onBlur = event => { if (event.target === win) finish(true); };
  const onKey = event => { if (event.key === 'Escape' && drag) { finish(true); event.preventDefault(); event.stopImmediatePropagation(); } };
  const onSelect = event => { if (drag) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const onMouseDown = event => { if (drag && event.button === 0) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const onClick = event => { if (suppressClick && event.detail > 0 && event.target === suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = null; } };
  const onDoubleClick = event => {
    const input = event.target.closest?.('input[type="number"]');
    if (!input || input.disabled || input.readOnly) return;
    finish();input.focus({preventScroll: true});input.select?.();
  };
  root.addEventListener('pointerdown', onDown, true);
  root.addEventListener('mousedown', onMouseDown, true);
  root.addEventListener('selectstart', onSelect, true);
  root.addEventListener('click', onClick, true);
  root.addEventListener('dblclick', onDoubleClick, true);
  win.addEventListener('pointermove', onMove, { capture: true, passive: false });
  win.addEventListener('mousemove', onMouseMove, true);
  win.addEventListener('pointerup', onUp, true);
  win.addEventListener('mouseup', onMouseUp, true);
  win.addEventListener('pointercancel', onCancel, true);
  win.addEventListener('blur', onBlur, true);
  win.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerlockchange', onLockChange);
  return () => {
    finish(true);
    win.clearTimeout(clickTimer);suppressClick = null;
    root.removeEventListener('pointerdown', onDown, true);
    root.removeEventListener('mousedown', onMouseDown, true);
    root.removeEventListener('selectstart', onSelect, true);
    root.removeEventListener('click', onClick, true);
    root.removeEventListener('dblclick', onDoubleClick, true);
    win.removeEventListener('pointermove', onMove, true);
    win.removeEventListener('mousemove', onMouseMove, true);
    win.removeEventListener('pointerup', onUp, true);
    win.removeEventListener('mouseup', onMouseUp, true);
    win.removeEventListener('pointercancel', onCancel, true);
    win.removeEventListener('blur', onBlur, true);
    win.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('pointerlockchange', onLockChange);
  };
}
