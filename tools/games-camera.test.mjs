import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const collisionSource = readFileSync(new URL('../_4-games/cabinet-camera-collision.js', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/gm, '').replaceAll('export function', 'function');
const collision = {};
vm.runInNewContext(`${collisionSource}\nglobalThis.sweep = clearCameraFraction;`, collision);
const point = (x, y = 0, z = 0) => ({x, y, z});
const wall = (x, _y, _z, radius) => Math.abs(x) < radius;

test('large camera jumps stop before a thin shell from either direction', () => {
  for (const sign of [1, -1]) {
    const start = point(3 * sign), end = point(-3 * sign);
    const t = collision.sweep(start, end, .035, wall);
    const x = start.x + (end.x - start.x) * t;
    assert.ok(Math.abs(x - sign * .035) < .0001);
    assert.ok(t < 1);
  }
});

test('camera can move along a wall and back away after contact', () => {
  assert.equal(collision.sweep(point(.036), point(.036, 5), .035, wall), 1);
  assert.equal(collision.sweep(point(.036), point(3), .035, wall), 1);
  assert.equal(collision.sweep(point(3), point(3), .035, wall), 1);
});

test('near-plane clearance stops diagonal moves and repeated inward attempts', () => {
  const radius = .1;
  const t = collision.sweep(point(1, 1), point(-1, -1), radius, wall);
  const x = 1 - 2 * t;
  assert.ok(x >= radius && x < radius + .0001);
  const again = collision.sweep(point(x, x), point(-1, -1), radius, wall);
  assert.ok(again < .0001);
});

const games = readFileSync(new URL('../_4-games/games.js', import.meta.url), 'utf8');
test('pan target survives the next frame instead of being recentered', () => {
  const frame = games.slice(games.indexOf('function animate()'), games.indexOf('  updateCameraPanel();', games.indexOf('function animate()')));
  const target = {x:5, copy() {throw new Error('Pan was reset');}};
  // Invoke the production frame prefix, not a separate camera implementation.
  vm.runInNewContext(`${frame}\n}\nanimate();`, { sceneDisposed:false, sceneSuspended:false,
    sceneFrameId:null, requestAnimationFrame:() => 1, controls:{target,update(){}},
    cameraCollision:null, activeCamera:{} });
  assert.equal(target.x, 5);
});

test('viewing stays available in menu, game and video, including zoomed views', () => {
  const update = games.slice(games.indexOf('function updateControlsForContent('), games.indexOf('\nfunction setGameInputEnabled('));
  for (const mode of ['menu', 'game', 'video']) for (const zoom of [true, false]) {
    let enabled;
    const context = { controls:{}, cameraAnimId:null, pointerCaptured:false,
      contentMode:mode, cameraZoomAlt:zoom, setGameAudioControlsVisible(){},
      applyStandardGlbMouseControlMode(_controls, options){enabled=options.enabled;} };
    vm.runInNewContext(`${update}\nupdateControlsForContent(contentMode);`, context);
    assert.equal(enabled, true);
    context.cameraAnimId = 1;
    vm.runInNewContext('updateControlsForContent(contentMode);', context);
    assert.equal(enabled, false);
  }
});
