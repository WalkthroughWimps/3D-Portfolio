import {canvasToDiagram, drawRefsSketch, REFS_ELEMENT_IDS} from './snap-board.js';

const SIZE = 1536;
const NAMES = Object.freeze({container: 'Container', portrait: 'Portrait opening', aperture: 'Main opening',
  leftBay: 'Left bay', rightBay: 'Right bay', leftCrescent: 'Left crescent', rightCrescent: 'Right crescent',
  leftArch: 'Left arch', rightArch: 'Right arch', plaque: 'Plaque',
  leftHinge: 'Left hinge', rightHinge: 'Right hinge'});

/** The preview renders the same canvas drawing as the mounted face texture. */
export function createRefsEditor({board, onCommit}) {
  const root = document.createElement('div');
  root.className = 'refs-editor';
  root.innerHTML = `<div class="refs-editor-toolbar"><label>Selected part <select data-part aria-label="Selected Refs part">${REFS_ELEMENT_IDS.map(id => `<option value="${id}">${NAMES[id]}</option>`).join('')}</select></label><button type="button" data-reset-part>Reset selected part</button></div>
    <div class="refs-editor-stage"><div class="refs-editor-art"><canvas width="${SIZE}" height="${SIZE}" aria-label="Refs 2D editor; drag a part to move it, drag a corner to resize it" tabindex="0"></canvas><div class="refs-editor-selection" aria-hidden="true"><i data-handle="nw"></i><i data-handle="ne"></i><i data-handle="sw"></i><i data-handle="se"></i></div></div></div>
    <div class="refs-editor-fields">${[['x', 'X'], ['y', 'Y (down)'], ['width', 'Width'], ['height', 'Height']].map(([key, label]) => `<label>${label}<span class="refs-number"><button type="button" data-frame-readout="${key}" aria-label="Edit selected ${label}"></button><input type="text" inputmode="decimal" data-frame-entry="${key}" aria-label="Selected ${label} value" hidden></span></label>`).join('')}</div>
    <p class="refs-editor-hint">Drag a part to move it; drag a corner to resize it. Arrow keys move the selected part. Part Y increases downward on the drawing.</p>`;
  const canvas = root.querySelector('canvas'), ctx = canvas.getContext('2d');
  const stage = root.querySelector('.refs-editor-stage'), art = root.querySelector('.refs-editor-art');
  const selection = root.querySelector('.refs-editor-selection');
  const select = root.querySelector('[data-part]');
  const events = new AbortController();
  let selected = 'container', gesture = null, disposed = false;
  const getFrame = () => board.getElementDescriptors().find(item => item.id === selected)?.frame;
  const fromEvent = event => {
    const rect = stage.getBoundingClientRect(), p = board.getOptions();
    const sx = (event.clientX - rect.left) * SIZE / rect.width - SIZE / 2 - p.x / 3 * SIZE;
    const sy = (event.clientY - rect.top) * SIZE / rect.height - SIZE / 2 + p.y / 3 * SIZE;
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    return {x: SIZE / 2 + (c * sx + s * sy) / p.scale,
      y: SIZE / 2 + (-s * sx + c * sy) / p.scale};
  };
  function render() {
    if (disposed) return;
    const options = board.getOptions();
    drawRefsSketch(ctx, options);
    art.style.transform = `translate(${options.x / 3 * 100}%, ${-options.y / 3 * 100}%) rotate(${options.angle}rad) scale(${options.scale})`;
    const part = board.getElementDescriptors().find(item => item.id === selected);
    if (!part) return;
    const f = part.canvasFrame;
    selection.style.left = `${(f.x - f.width / 2) / SIZE * 100}%`;
    selection.style.top = `${(f.y - f.height / 2) / SIZE * 100}%`;
    selection.style.width = `${f.width / SIZE * 100}%`;
    selection.style.height = `${f.height / SIZE * 100}%`;
    selection.hidden = !part.visible;
    select.value = selected;
    for (const button of root.querySelectorAll('[data-frame-readout]')) {
      const input = root.querySelector(`[data-frame-entry="${button.dataset.frameReadout}"]`);
      if (!input.hidden) continue;
      button.textContent = Number(part.frame[button.dataset.frameReadout]).toFixed(1);
    }
  }
  function choose(id) { if (REFS_ELEMENT_IDS.includes(id)) { selected = id; render(); } }
  function hit(point) {
    const descriptions = board.getElementDescriptors().filter(item => item.visible && item.id !== 'container');
    // Smaller parts win when several drawn frames overlap.
    descriptions.sort((a, b) => a.canvasFrame.width * a.canvasFrame.height - b.canvasFrame.width * b.canvasFrame.height);
    for (const item of descriptions) {
      const f = item.canvasFrame, dx = Math.abs(point.x - f.x), dy = Math.abs(point.y - f.y);
      const margin = item.hitType === 'axis' ? 14 : 5;
      if (dx <= f.width / 2 + margin && dy <= f.height / 2 + margin) return item.id;
    }
    const f = board.getElementDescriptors().find(item => item.id === 'container').canvasFrame;
    const dx = Math.abs(point.x - f.x), dy = Math.abs(point.y - f.y);
    if (dx <= f.width / 2 + 10 && dy <= f.height / 2 + 10 &&
        (dx >= f.width / 2 - 38 || dy >= f.height / 2 - 38)) return 'container';
    return null;
  }
  function finish(commit) {
    if (!gesture) return;
    const original = gesture.original;
    gesture = null;
    if (!commit) board.setOptions(original);
    else onCommit();
  }
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const point = fromEvent(event);
    const handle = event.target.closest('[data-handle]')?.dataset.handle;
    const id = handle && !selection.hidden ? selected : hit(point);
    if (!id) return;
    choose(id);
    const original = board.getOptions();
    gesture = {pointerId: event.pointerId, original, frame: board.getElementFrames()[id],
      start: canvasToDiagram(point, original), id, handle};
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, {signal: events.signal});
  stage.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const point = canvasToDiagram(fromEvent(event), gesture.original);
    const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
    const f = gesture.frame;
    if (!gesture.handle) board.patchElement(gesture.id, {x: f.x + dx, y: f.y + dy});
    else {
      const sx = gesture.handle.includes('e') ? 1 : -1;
      const sy = gesture.handle.includes('s') ? 1 : -1;
      const w = Math.max(8, f.width + sx * dx), h = Math.max(8, f.height + sy * dy);
      board.patchElement(gesture.id, {width: w, height: h,
        x: f.x + sx * (w - f.width) / 2, y: f.y + sy * (h - f.height) / 2});
    }
  }, {signal: events.signal});
  stage.addEventListener('pointerup', event => { if (gesture?.pointerId === event.pointerId) finish(true); }, {signal: events.signal});
  stage.addEventListener('pointercancel', event => { if (gesture?.pointerId === event.pointerId) finish(false); }, {signal: events.signal});
  stage.addEventListener('lostpointercapture', () => finish(false), {signal: events.signal});
  root.addEventListener('change', event => { if (event.target === select) choose(select.value); }, {signal: events.signal});
  root.addEventListener('click', event => {
    if (!event.target.closest('[data-reset-part]')) return;
    finish(false);
    const options = board.getOptions(), elements = {...options.elements};
    delete elements[selected];
    const paired = board.getElementDescriptors().find(item => item.id === selected)?.pairedId;
    if (options.pairLinked && paired) delete elements[paired];
    board.setOptions({elements}); onCommit();
  }, {signal: events.signal});
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape') { finish(false); return; }
    const directions = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    if (!directions[event.key] || gesture) return;
    const [dx, dy] = directions[event.key], frame = getFrame(), step = event.shiftKey ? 10 : 1;
    board.patchElement(selected, {x: frame.x + dx * step, y: frame.y + dy * step}); onCommit();
    event.preventDefault();
  }, {signal: events.signal});
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && gesture) { finish(false); event.preventDefault(); }
  }, {signal: events.signal});
  window.addEventListener('blur', () => finish(false), {signal: events.signal});
  const unsubscribe = board.subscribe(render);
  render();
  return {root, choose, finish, render,
    get selected() { return selected; },
    dispose() { if (disposed) return; finish(false); disposed = true; unsubscribe(); events.abort(); root.remove(); }};
}
