import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const THREE = await import('data:text/javascript;base64,' + readFileSync(new URL('../_3-graphics/shelf/vendor/three.module.js', import.meta.url)).toString('base64'));
const Vector = THREE.Vector3;

function harness() {
  let now = 1000, allowed = true, motionOff = false;
  const settings = {accessibility: {reducedMotion: false}, interaction: {animateResets: true, panResetSpeed: 1, rotationResetSpeed: 1}};
  const frames = new Map(); let frameId = 0;
  const listeners = new Map();
  const domElement = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type, button, x = 20, y = 30) {
      let prevented = false;
      listeners.get(type)?.({button, clientX:x, clientY:y, preventDefault() { prevented = true; }});
      return prevented;
    }
  };
  const source = readFileSync(new URL('../_7-shared-scripts/shared-glb-mouse-controls.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replaceAll('export function', 'function');
  const context = {THREE, performance: {now: () => now}, getSharedSettings: () => ({get: () => settings}),
    matchMedia: () => ({matches: motionOff}), queueMicrotask, setTimeout, clearTimeout,
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => { frames.delete(id); }};
  vm.runInNewContext(`${source}\nglobalThis.install = installStandardGlbMouseControls; globalThis.start = installStartPageStyleMouseControls; globalThis.apply = applyStandardGlbMouseControlMode; globalThis.center = createPanAwareCenterProjection; globalThis.duration = transformResetDuration;`, context);
  const camera = {position: new Vector(0, 0, 10)};
  let pendingDelta = null;
  const controls = {object: camera, target: new Vector(), enabled: true, enableDamping: true,
    update() { if (pendingDelta) { camera.position.add(pendingDelta); this.target.add(pendingDelta); pendingDelta = null; } }};
  context.apply(controls);
  const mouse = context.install({controls, domElement, canInteract: () => allowed});
  function click(button, x = 20, y = 30) {
    domElement.emit('pointerdown', button, x, y); now += 20;
    domElement.emit('pointerup', button, x, y);
  }
  return {camera, controls, mouse, domElement, center: context.center, duration: context.duration, start: context.start, click, advance: ms => { now += ms; },
    flush: async () => { await Promise.resolve(); }, frame: ms => { now += ms; const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(now)); },
    settings, motion: value => { motionOff = value; }, frames,
    gate: value => { allowed = value; }, queueDelta: delta => { pendingDelta = delta; }};
}

test('MMB drag is pan; double click restores settled target while keeping direction and zoom', async () => {
  const h = harness();
  assert.equal(h.controls.mouseButtons.MIDDLE, THREE.MOUSE.PAN);
  h.mouse.captureDefaultPose();
  assert.equal(h.domElement.emit('pointerdown', 1), true);
  assert.equal(h.controls.enablePan, true);
  h.domElement.emit('pointerup', 1);
  assert.equal(h.controls.enablePan, false);
  h.advance(400);
  h.controls.target.copy(new Vector(3, 2, 0));
  h.camera.position.copy(new Vector(9, 2, 0));
  assert.equal(h.mouse.isPanned(), true);
  h.click(1); h.advance(80); h.click(1);
  await h.flush();
  assert.equal(h.controls.target.x, 3);
  h.frame(230); assert.ok(h.controls.target.x > 0 && h.controls.target.x < 3);
  h.frame(230);
  assert.deepEqual(h.controls.target, new Vector());
  assert.deepEqual(h.camera.position, new Vector(6, 0, 0));
  assert.equal(h.mouse.isPanned(), false);
});

test('RMB reset keeps visible pan and distance while clearing queued damping without a tail bounce', async () => {
  const h = harness();
  h.mouse.captureDefaultPose();
  h.controls.target.copy(new Vector(2, 0, 0));
  h.camera.position.copy(new Vector(8, 0, 0));
  h.queueDelta(new Vector(1, 1, 0));
  h.click(2); h.advance(80); h.click(2);
  await h.flush();
  assert.deepEqual(h.controls.target, new Vector(2, 0, 0));
  assert.deepEqual(h.camera.position, new Vector(8, 0, 0));
  h.frame(460);
  assert.deepEqual(h.controls.target, new Vector(2, 0, 0));
  assert.ok(h.camera.position.distanceTo(new Vector(2, 0, 6)) < 1e-9);
  h.controls.update();
  assert.ok(h.camera.position.distanceTo(new Vector(2, 0, 6)) < 1e-9);
});

test('drag and interaction gate never trigger a reset', async () => {
  const h = harness();
  h.mouse.captureDefaultPose();
  h.controls.target.copy(new Vector(4, 0, 0));
  h.camera.position.copy(new Vector(4, 0, 10));
  h.click(1);
  h.domElement.emit('pointerdown', 1, 20, 30);
  h.domElement.emit('pointermove', 1, 40, 30);
  h.domElement.emit('pointermove', 1, 20, 30);
  h.domElement.emit('pointerup', 1, 20, 30);
  h.click(1);
  assert.equal(h.controls.target.x, 4);
  h.gate(false);
  h.click(1); h.advance(50); h.click(1);
  await h.flush();
  assert.equal(h.controls.target.x, 4);
});

test('reset arcs are finite from an opposite direction and new input interrupts in place', async () => {
  const h = harness(); h.mouse.captureDefaultPose();
  h.camera.position.set(0, 0, -10);
  h.click(2); h.advance(80); h.click(2); await h.flush();
  h.frame(230);
  assert.ok(h.camera.position.toArray().every(Number.isFinite));
  assert.ok(Math.abs(h.camera.position.length() - 10) < 1e-8);
  assert.ok(h.camera.position.distanceTo(new Vector(0, 0, -10)) > 1);
  const midpoint = h.camera.position.clone();
  h.domElement.emit('pointerdown', 2);
  assert.equal(h.frames.size, 0);
  assert.ok(h.camera.position.distanceTo(midpoint) < 1e-8);
  assert.equal(h.controls.enabled, true);
});

test('reset settings change duration and animation-off and reduced motion settle immediately', async () => {
  const h = harness(); h.mouse.captureDefaultPose();
  h.settings.interaction.panResetSpeed = 2;
  assert.equal(h.duration('pan', 460), 230);
  h.settings.interaction.animateResets = false;
  h.controls.target.set(3, 0, 0); h.camera.position.set(3, 0, 10);
  h.click(1); h.advance(80); h.click(1); await h.flush();
  assert.equal(h.controls.target.x, 0);
  assert.equal(h.frames.size, 0);
  h.settings.interaction.animateResets = true;
  h.settings.accessibility.reducedMotion = true;
  assert.equal(h.duration('rotation', 460), 0);
  h.settings.accessibility.reducedMotion = false; h.motion(true);
  assert.equal(h.duration('rotation', 460), 0);
});

test('Start-style default-focus reset is immediate when animation is off and queued reset respects dispose', async () => {
  const h = harness(); h.settings.interaction.animateResets = false;
  const listeners = new Map();
  const dom = {addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type)};
  const click = () => { listeners.get('pointerdown')?.({button:1,clientX:0,clientY:0,preventDefault(){}}); h.advance(20); listeners.get('pointerup')?.({button:1,clientX:0,clientY:0}); };
  const start = h.start({controls:h.controls,camera:h.camera,domElement:dom,getDefaultFocusPoint:()=>new Vector(),focusDurationMs:720});
  h.controls.target.set(3,0,0); h.camera.position.set(3,0,10);
  click(); h.advance(80); click(); await h.flush();
  assert.equal(h.controls.target.x,0);
  assert.equal(h.frames.size,0);
  h.controls.target.set(4,0,0); h.camera.position.set(4,0,10);
  h.advance(500); click(); h.advance(80); click(); start.dispose(); await h.flush();
  assert.equal(h.controls.target.x,4);
});

test('center offset stays fixed through pan, scales on resize, and recomputes on reset', () => {
  const h = harness();
  const calls = [];
  const camera = {
    view: {enabled: false},
    clearViewOffset() { this.view = {enabled: false}; calls.push('clear'); },
    setViewOffset(width, height, offsetX, offsetY) {
      this.view = {enabled: true, width, height, offsetX, offsetY};
      calls.push('set');
    },
    updateMatrixWorld() {}
  };
  let cleared = 0;
  const projection = h.center(camera, {onClear: () => { cleared++; }});
  const center = (x, y) => ({project: () => ({x, y})});
  projection.update({enabled: true, panned: false, width: 1000, height: 500, getCenter: () => center(.4, -.2)});
  assert.deepEqual(camera.view, {enabled: true, width: 1000, height: 500, offsetX: 200, offsetY: 50});
  const callsBeforePan = calls.length;
  projection.update({enabled: true, panned: true, width: 1000, height: 500,
    getCenter: () => { throw new Error('pan must retain the prior projection'); }});
  assert.equal(calls.length, callsBeforePan + 1);
  assert.equal(camera.view.offsetX, 200);
  projection.update({enabled: true, panned: true, width: 500, height: 1000, getCenter: () => center(0, 0)});
  assert.deepEqual(camera.view, {enabled: true, width: 500, height: 1000, offsetX: 100, offsetY: 100});
  projection.update({enabled: true, panned: false, width: 500, height: 1000, getCenter: () => center(-.2, .4)});
  assert.equal(camera.view.offsetX, -50);
  assert.equal(camera.view.offsetY, -200);
  projection.update({enabled: false, panned: false, width: 500, height: 1000, getCenter: () => center(0, 0)});
  assert.equal(camera.view.enabled, false);
  assert.equal(cleared, 1);
});

test('tablet focus never reenables OrbitControls during full presentation', () => {
  const source = readFileSync(new URL('../_2-videos/tablet-focus.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/m, '').replaceAll('export function', 'function');
  const listeners = new Map();
  const canvas = {addEventListener(type, fn) {listeners.set(type, fn);}, removeEventListener() {}};
  const context = {THREE: {}, window: {addEventListener() {}, removeEventListener() {}},
    cancelAnimationFrame() {}, clearTimeout() {}};
  vm.runInNewContext(`${source}\nglobalThis.create = createTabletFocus;`, context);
  const controls = {enabled: true, userData: {videoPresentationActive: true}};
  context.create({camera: {}, controls, tabletGroup: {}, screenMesh: {}, renderer: {domElement: canvas}});
  listeners.get('pointerdown')();
  assert.equal(controls.enabled, false);
  controls.userData.videoPresentationActive = false;
  listeners.get('wheel')();
  assert.equal(controls.enabled, true);
});
