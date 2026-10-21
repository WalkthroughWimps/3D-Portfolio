import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

class Point {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, {x, y, z}); }
  clone() { return new Point(this.x, this.y, this.z); }
  copy(p) { Object.assign(this, p); return this; }
  add(p) { this.x += p.x; this.y += p.y; this.z += p.z; return this; }
  sub(p) { this.x -= p.x; this.y -= p.y; this.z -= p.z; return this; }
  multiplyScalar(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
  distanceTo(p) { return Math.hypot(this.x - p.x, this.y - p.y, this.z - p.z); }
  normalize() { return this.multiplyScalar(1 / Math.hypot(this.x, this.y, this.z)); }
  lerp(p, t) { this.x += (p.x - this.x) * t; this.y += (p.y - this.y) * t; this.z += (p.z - this.z) * t; return this; }
}

function harness({hit = null, onFocusComplete = null} = {}) {
  let now = 1000, nextId = 0;
  const raf = new Map(), timers = new Map(), listeners = new Map();
  const domElement = {
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type, button = 1) {
      listeners.get(type)?.({button, clientX: 20, clientY: 30, preventDefault() {}});
    }
  };
  const context = {
    performance: {now: () => now},
    requestAnimationFrame: callback => { const id = ++nextId; raf.set(id, callback); return id; },
    cancelAnimationFrame: id => raf.delete(id),
    setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, {at: now + delay, callback}); return id; },
    clearTimeout: id => timers.delete(id)
  };
  const source = readFileSync(new URL('../_7-shared-scripts/shared-glb-mouse-controls.js', import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/m, '').replaceAll('export function', 'function');
  vm.runInNewContext(`${source}\nglobalThis.install = installStartPageStyleMouseControls;`, context);
  const controls = {enabled: true, enableRotate: false, enableZoom: true, enablePan: false,
    target: new Point(3, 0, 0), update() {}};
  const camera = {position: new Point(3, 0, 8), updateMatrixWorld() {}};
  const mouse = context.install({controls, camera, domElement, focusDurationMs: () => 720,
    getHitPoint: () => hit || new Point(5, 0, 0), getDefaultFocusPoint: () => new Point(),
    interruptFocusOnMiddleDown: true, onFocusComplete});
  function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  }
  function frame(ms) {
    now += ms;
    const callbacks = [...raf.values()]; raf.clear();
    for (const callback of callbacks) callback(now);
  }
  function click() { domElement.emit('pointerdown'); advance(20); domElement.emit('pointerup'); }
  return {controls, domElement, mouse, timers, raf, advance, frame, click};
}

test('double middle click cancels pending focus and eases to default over 720 ms', () => {
  const h = harness();
  h.click();
  assert.equal(h.timers.size, 1);
  h.advance(100);
  h.click();
  assert.equal(h.timers.size, 0);
  assert.equal(h.controls.enabled, false);
  h.frame(360);
  assert.ok(Math.abs(h.controls.target.x - 1.5) < 1e-9);
  h.frame(360);
  assert.equal(h.controls.target.x, 0);
  assert.equal(h.controls.enabled, true);
  h.mouse.dispose();
});

test('new middle press interrupts a running focus and restores pan controls', () => {
  const h = harness();
  h.click();
  h.advance(321);
  assert.equal(h.controls.enabled, false);
  h.frame(180);
  const interruptedAt = h.controls.target.x;
  h.domElement.emit('pointerdown');
  assert.equal(h.controls.enabled, true);
  assert.equal(h.controls.enablePan, true);
  assert.equal(h.raf.size, 0);
  h.frame(180);
  assert.equal(h.controls.target.x, interruptedAt);
  h.domElement.emit('pointerup');
  assert.equal(h.controls.enablePan, false);
  h.mouse.dispose();
});

test('focus follows a moving surface target through the full ease', () => {
  const moving = new Point(5, 0, 0);
  const hit = {point: moving.clone(), resolve: () => moving.clone()};
  let completed = null;
  const h = harness({hit, onFocusComplete: target => { completed = target; }});
  h.click();
  h.advance(321);
  moving.x = 9;
  h.frame(360);
  assert.ok(Math.abs(h.controls.target.x - 6) < 1e-9);
  moving.x = 11;
  h.frame(360);
  assert.equal(h.controls.target.x, 11);
  assert.equal(completed, hit);
  h.mouse.dispose();
});
