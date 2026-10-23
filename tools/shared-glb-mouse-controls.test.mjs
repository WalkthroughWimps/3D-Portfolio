import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

class Vector {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, {x, y, z}); }
  clone() { return new Vector(this.x, this.y, this.z); }
  copy(v) { Object.assign(this, v); return this; }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
  normalize() { return this.multiplyScalar(1 / Math.sqrt(this.lengthSq())); }
  distanceTo(v) { return Math.hypot(this.x-v.x, this.y-v.y, this.z-v.z); }
  distanceToSquared(v) { return (this.x-v.x)**2 + (this.y-v.y)**2 + (this.z-v.z)**2; }
}

function harness() {
  let now = 1000, allowed = true;
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
    .replace(/^import .*\r?\n/m, '').replaceAll('export function', 'function');
  const context = {THREE: {MOUSE: {PAN: 1, ROTATE: 2}}, performance: {now: () => now}};
  vm.runInNewContext(`${source}\nglobalThis.install = installStandardGlbMouseControls; globalThis.apply = applyStandardGlbMouseControlMode; globalThis.center = createPanAwareCenterProjection;`, context);
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
  return {camera, controls, mouse, domElement, center: context.center, click, advance: ms => { now += ms; },
    gate: value => { allowed = value; }, queueDelta: delta => { pendingDelta = delta; }};
}

test('MMB drag is pan; double click restores settled target while keeping direction and zoom', () => {
  const h = harness();
  assert.equal(h.controls.mouseButtons.MIDDLE, 1);
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
  assert.deepEqual(h.controls.target, new Vector());
  assert.deepEqual(h.camera.position, new Vector(6, 0, 0));
  assert.equal(h.mouse.isPanned(), false);
});

test('RMB reset keeps pan and distance and flushes queued damping before restoring view', () => {
  const h = harness();
  h.mouse.captureDefaultPose();
  h.controls.target.copy(new Vector(2, 0, 0));
  h.camera.position.copy(new Vector(8, 0, 0));
  h.queueDelta(new Vector(1, 1, 0));
  h.click(2); h.advance(80); h.click(2);
  assert.deepEqual(h.controls.target, new Vector(3, 1, 0));
  assert.deepEqual(h.camera.position, new Vector(3, 1, 6));
});

test('drag and interaction gate never trigger a reset', () => {
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
  assert.equal(h.controls.target.x, 4);
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
