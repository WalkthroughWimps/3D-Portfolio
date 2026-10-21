import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function loadPure(path) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('Start settings flow preserves the 0.5 fallback and valid saved zero', async () => {
  const { createStartSettingsFlow } = await loadPure('_0-start/start/settings-flow.js');
  const values = new Map();
  const preferences = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
  const saved = [];
  const flow = createStartSettingsFlow({ preferences, setSceneLightingValue: value => saved.push(value) });
  assert.equal(flow.getLuxValue(), 0.5);
  assert.deepEqual(saved, [0.5]);
  assert.equal(flow.setLuxValue(0), 0);
  assert.equal(flow.getLuxValue(), 0);
  assert.equal(flow.setEmiValue(0), 0);
  assert.equal(values.get('site.contrast.value'), '0');
  values.set('site.scene.lighting', '0');
  const reloaded = createStartSettingsFlow({ preferences, setSceneLightingValue: value => saved.push(value) });
  assert.equal(reloaded.getLuxValue(), 0);
  assert.equal(saved.length, 2, 'valid zero must not write a fallback');
});

test('shared pointer input maps CSS and canvas coordinates and rejects unavailable seek', async () => {
  const { createControlsInput } = await loadPure('_7-shared-scripts/media/controls-input.js');
  const rect = (x, y, w, h) => ({ x, y, w, h });
  const layout = {
    back: rect(0, 0, 10, 10), play: rect(10, 0, 10, 10), mute: rect(20, 0, 10, 10),
    help: rect(30, 0, 10, 10), tablet: rect(40, 0, 10, 10), fullscreen: rect(50, 0, 10, 10),
    speed: rect(60, 0, 10, 10), pitch: rect(70, 0, 10, 10),
    syncDecrease: rect(80, 0, 10, 10), syncIncrease: rect(90, 0, 10, 10),
    syncSlider: rect(10, 25, 80, 5), progress: rect(10, 50, 80, 5),
    volumeSlider: rect(10, 75, 80, 5), speedStops: [], barH: 10
  };
  let state = { canSeek: true, syncMs: -270, controls: { seek: true, play: true } };
  const input = createControlsInput({
    getState: () => state, getLayout: () => layout,
    getControlAvailability: s => s.controls,
    getViewportRect: () => ({ left: 100, top: 200, width: 200, height: 100 }),
    isSpeedExpanded: () => false,
    snapSyncMs: value => Math.round(value / 5) * 5
  });
  assert.deepEqual(input.getPointerPosition({ clientX: 200, clientY: 250 }), { x: 100, y: 50, cw: 200, ch: 100 });
  assert.deepEqual(input.getPointerPosition({ canvasX: 90, canvasY: 53 }, { canvasWidth: 100, canvasHeight: 100 }), { x: 90, y: 53, cw: 100, ch: 100 });
  assert.equal(input.inspectPointerEvent({ canvasX: 90, canvasY: 53 }, { canvasWidth: 100, canvasHeight: 100 }).action.ratio, 1);
  state = { ...state, controls: { ...state.controls, seek: false } };
  const disabled = input.inspectPointerEvent({ canvasX: 90, canvasY: 53 }, { canvasWidth: 100, canvasHeight: 100 });
  assert.equal(disabled.hit, true);
  assert.equal(disabled.handled, false);
  assert.equal(disabled.action, null);
});

test('Start calibration keeps median sign, range, and positive audio delay', async () => {
  const { estimateSyncOffsetMs, audioDelaySeconds } = await loadPure('_0-start/start/media-calibration.js');
  assert.equal(estimateSyncOffsetMs([100, 25, 50]), -50);
  assert.equal(estimateSyncOffsetMs([-4000, -4100, -4200]), 3000);
  assert.equal(estimateSyncOffsetMs([]), 0);
  assert.equal(audioDelaySeconds(-270), 0);
  assert.equal(audioDelaySeconds(500), 0.5);
});

test('Start camera flow samples a late loaded clip and keeps authored endpoint inside duration', async () => {
  const { createStartCameraFlow, easeInOutPower } = await loadPure('_0-start/start/camera-flow.js');
  let clip = null;
  const flow = createStartCameraFlow({ getClip: () => clip, totalFrames: 30,
    cameraStartFrame: 1, cameraEndFrame: 20 });
  assert.equal(flow.frameToTime(30), 0);
  clip = { duration: 2 };
  assert.equal(flow.frameToTime(30), 2);
  assert.equal(flow.timeToFrame(1), 15.5);
  assert.equal(flow.frameToClipTime(99, clip, 1, 20), 2);
  assert.equal(flow.getCameraHoldTime(clip), 1.9999);
  assert.equal(easeInOutPower(0.5, 3), 0.5);
});

test('Start accessible controls mirror active sync exercise without changing media', async () => {
  const { syncStartAccessibleControls } = await loadPure('_0-start/start/accessible-controls.js');
  const element = () => ({ hidden: false, value: '', textContent: '', attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; } });
  const elements = Object.fromEntries(['audioMode', 'visualsMode', 'volumeSlider', 'syncSlider',
    'brightnessSlider', 'contrastSlider', 'counts', 'alphabet', 'playPause', 'gallery',
    'confirmYes', 'confirmNo'].map(key => [key, element()]));
  syncStartAccessibleControls({ elements, view: 'audio', volume: 0.25, syncMs: -270,
    brightness: 0.5, contrast: 0.5,
    flow: { stage: 'sync-running', syncExercise: { active: true, taps: [42] } },
    syncWords: ['ONE', 'TWO', 'THREE'] });
  assert.equal(elements.audioMode.attrs['aria-pressed'], 'true');
  assert.equal(elements.visualsMode.attrs['aria-pressed'], 'false');
  assert.equal(elements.volumeSlider.value, '25');
  assert.equal(elements.syncSlider.value, '-270');
  assert.equal(elements.counts.hidden, true);
  assert.equal(elements.playPause.textContent, 'Tap TWO sync cue');
  assert.equal(elements.playPause.hidden, false);
});

test('media controller refresh detaches replaced borrowed media and dispose leaves it playing', async () => {
  const transportSource = await readFile(new URL('../_7-shared-scripts/media/transport.js', import.meta.url), 'utf8');
  const transportUrl = `data:text/javascript;base64,${Buffer.from(transportSource).toString('base64')}`;
  const controllerSource = (await readFile(new URL('../_7-shared-scripts/media/controller.js', import.meta.url), 'utf8'))
    .replace("from './transport.js'", `from '${transportUrl}'`);
  const { createMediaController } = await import(`data:text/javascript;base64,${Buffer.from(controllerSource).toString('base64')}`);
  class BorrowedMedia extends EventTarget {
    constructor() { super(); this.duration = 100; this.currentTime = 0; this.volume = 0.25; this.paused = false; this.pauseCalls = 0; }
    pause() { this.pauseCalls++; this.paused = true; }
  }
  const first = new BorrowedMedia(), second = new BorrowedMedia();
  let active = first, updates = 0;
  const controller = createMediaController({ getActiveVideo: () => active });
  controller.subscribe(() => { updates++; });
  controller.refresh();
  first.dispatchEvent(new Event('timeupdate'));
  assert.equal(updates, 2);
  active = second;
  controller.refresh();
  first.dispatchEvent(new Event('timeupdate'));
  assert.equal(updates, 3, 'old media listener must be detached');
  second.dispatchEvent(new Event('timeupdate'));
  assert.equal(updates, 4);
  controller.dispose();
  second.dispatchEvent(new Event('timeupdate'));
  assert.equal(updates, 4);
  assert.equal(first.pauseCalls + second.pauseCalls, 0, 'controller borrows both elements');
});

test('Start controller scene releases each owned GPU resource once', async () => {
  const { disposeControllerSceneResources } = await loadPure('_0-start/start/controller-scene.js');
  const counts = { geometry: 0, texture: 0, material: 0 };
  const geometry = { dispose: () => counts.geometry++ };
  const texture = { isTexture: true, dispose: () => counts.texture++ };
  const material = { map: texture, dispose: () => counts.material++ };
  const node = { geometry, material };
  disposeControllerSceneResources({ traverse: visit => { visit(node); visit(node); } });
  assert.deepEqual(counts, { geometry: 1, texture: 1, material: 1 });
});
