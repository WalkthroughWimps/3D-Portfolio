import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function harness(preference) {
  const win = new EventTarget();
  const doc = new EventTarget();
  const target = { style: { cursor: '' }, requestPointerLock() { throw new Error('Games must use normal dragging'); } };
  doc.querySelector = () => { throw new Error('Use the actual renderer canvas'); };
  const context = { window: win, document: doc, AbortController, performance,
    localStorage: { getItem: () => preference },
    snapSyncMs: value => Math.max(-3000, Math.min(3000, Math.round(value / 5) * 5)) };
  const input = readFileSync(new URL('../_7-shared-scripts/media/controls-input.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
  const view = readFileSync(new URL('../_7-shared-scripts/media/controls-view.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('export function', 'function');
  vm.runInNewContext(`${input}\n${view}\nglobalThis.create = createVideoControlsUI;`, context);
  const ui = context.create({ unlimitedSyncDrag: false });
  let value = -270;
  const actions = [];
  const update = () => ui.setState({ canSeek: true, canPlay: true, syncMs: value, controls: {sync: true} });
  update();
  ui.onAction = action => { actions.push(action); value = action.value; update(); };
  const meta = { canvasWidth: 1280, canvasHeight: 720 };
  function point(control) {
    for (let y = 0; y < 90; y += 2) for (let x = 0; x < 1280; x += 2)
      if (ui.inspectPointerEvent({canvasX:x, canvasY:y}, meta).control === control) return {canvasX:x, canvasY:y};
    throw new Error(`Missing ${control}`);
  }
  function emit(type, clientX = 100) {
    const event = new Event(type);
    Object.defineProperties(event, {clientX:{value:clientX}, movementX:{value:0}});
    win.dispatchEvent(event);
  }
  return {ui, target, meta, point, emit, actions, value: () => value};
}

for (const preference of [null, 'enabled', 'disabled']) {
  test(`normal Games dragging bypasses preference ${preference} and keeps its first movement`, () => {
    const h = harness(preference);
    h.ui.handlePointerEvent({...h.point('sync'), type:'pointerdown', clientX:100, target:h.target}, h.meta);
    h.emit('pointermove', 120);
    assert.equal(h.value(), -220);
    h.emit('pointermove', 80);
    assert.equal(h.value(), -320);
    h.emit('pointerup', 80);
    h.emit('pointermove', 200);
    assert.equal(h.value(), -320);
    h.ui.dispose();
  });
}

test('sync drag clamps and cancels on blur, cancel, and disposal', () => {
  for (const end of ['blur', 'pointercancel', 'dispose']) {
    const h = harness(null);
    h.ui.handlePointerEvent({...h.point('sync'), type:'pointerdown', clientX:100, target:h.target}, h.meta);
    h.emit('pointermove', 5000);
    assert.equal(h.value(), 3000);
    if (end === 'dispose') h.ui.dispose(); else h.emit(end);
    h.emit('pointermove', -5000);
    assert.equal(h.value(), 3000);
    h.ui.dispose();
  }
});

test('Games wires the saved sync getter into the controller used by arrows and repeated drags', () => {
  const games = readFileSync(new URL('../_4-games/games.js', import.meta.url), 'utf8');
  const setup = games.match(/sharedControlsAdapter = createGamesVideoAdapter\(\{[\s\S]*?\n {2}\}\);/)[0];
  let value = -270;
  const noop = () => {};
  const context = {
    getSharedControlsViewportRect:noop, getSharedControlsScreenRect:noop,
    getSharedActiveVideo:noop, getSharedActivePreviewVideo:noop, getSharedActiveAudio:noop,
    setSharedVolume:noop, toggleSharedMute:noop, setSharedPlaybackRate:noop,
    exitSharedControls:noop, getStoredSyncMs:() => value,
    createGamesVideoAdapter: options => options
  };
  vm.runInNewContext(setup, context);
  assert.equal(context.sharedControlsAdapter.getSyncMs(), -270);
  value = 125;
  assert.equal(context.sharedControlsAdapter.getSyncMs(), 125);
});
