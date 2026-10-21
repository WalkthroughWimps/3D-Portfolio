import assert from 'node:assert/strict';
import test from 'node:test';
import {rotateCubeAtOrbitTarget} from '../_1-about/cube-orbit-focus.mjs';

class Point {
  constructor(x = 0, y = 0, z = 0) { Object.assign(this, {x, y, z}); }
  clone() { return new Point(this.x, this.y, this.z); }
  add(p) { this.x += p.x; this.y += p.y; this.z += p.z; return this; }
  sub(p) { this.x -= p.x; this.y -= p.y; this.z -= p.z; return this; }
  distanceTo(p) { return Math.hypot(this.x - p.x, this.y - p.y, this.z - p.z); }
}

function cubeAt(x, y, z) {
  const origin = new Point(x, y, z);
  return {
    angle: 0,
    updateMatrixWorld() {},
    localToWorld(p) {
      const c = Math.cos(this.angle), s = Math.sin(this.angle);
      return new Point(c * p.x + s * p.z, p.y, -s * p.x + c * p.z).add(origin);
    },
    worldToLocal(p) {
      p.sub(origin);
      const c = Math.cos(this.angle), s = Math.sin(this.angle);
      return new Point(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
    }
  };
}

test('selected surface point remains at the orbit target through incremental rotation', () => {
  const cube = cubeAt(2, -1, 3);
  const camera = {position: new Point(4, 2, 10)};
  const controls = {target: cube.localToWorld(new Point(.7, .3, -.4))};
  const selected = cube.worldToLocal(controls.target.clone());
  const distance = camera.position.distanceTo(controls.target);
  for (let step = 0; step < 48; step++) {
    rotateCubeAtOrbitTarget(cube, camera, controls, () => { cube.angle += Math.PI / 96; });
    assert.ok(cube.localToWorld(selected.clone()).distanceTo(controls.target) < 1e-12);
    assert.ok(Math.abs(camera.position.distanceTo(controls.target) - distance) < 1e-12);
  }
});

test('pan and reset use the new target for subsequent rotations', () => {
  const cube = cubeAt(0, 0, 0);
  const camera = {position: new Point(0, 1, 8)};
  const controls = {target: new Point(.8, -.2, .5)};
  rotateCubeAtOrbitTarget(cube, camera, controls, () => { cube.angle = Math.PI / 4; });
  controls.target.add(new Point(.2, .3, -.1)); // OrbitControls pan changes the target.
  const panned = cube.worldToLocal(controls.target.clone());
  rotateCubeAtOrbitTarget(cube, camera, controls, () => { cube.angle = Math.PI / 2; });
  assert.ok(cube.localToWorld(panned).distanceTo(controls.target) < 1e-12);
  controls.target = new Point(); // Double-middle-click returns to the default target.
  rotateCubeAtOrbitTarget(cube, camera, controls, () => { cube.angle = Math.PI; });
  assert.ok(controls.target.distanceTo(new Point()) < 1e-12);
});
