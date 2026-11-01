import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = path => readFileSync(new URL(path, root), 'utf8');
const schema = await import('data:text/javascript;base64,' + Buffer.from(source('_7-shared-scripts/core/settings-schema.js')).toString('base64'));
const THREE = await import('data:text/javascript;base64,' + Buffer.from(source('_3-graphics/shelf/vendor/three.module.js')).toString('base64'));
globalThis.__resetTestThree = THREE;
const alignmentSource = source('_1-about/cube-alignment.js').replace("import * as THREE from 'three';", 'const THREE = globalThis.__resetTestThree;');
const {alignedCubeQuaternion} = await import('data:text/javascript;base64,' + Buffer.from(alignmentSource).toString('base64'));
delete globalThis.__resetTestThree;

test('General transform reset fields persist valid speeds and toggle defaults', () => {
  const fields = schema.SETTINGS_FIELDS;
  assert.equal(fields['interaction.animateResets'].default, true);
  assert.equal(fields['interaction.animateResets'].parse('false'), false);
  for (const name of ['panResetSpeed', 'rotationResetSpeed']) {
    const field = fields[`interaction.${name}`];
    assert.equal(field.default, 1);
    assert.equal(field.parse('2.4'), 2.4);
    assert.equal(field.parse(.1), .25);
    assert.equal(field.parse(9), 3);
  }
  const panel = source('debug/panel-shell.js');
  for (const name of ['animateResets', 'panResetSpeed', 'rotationResetSpeed'])
    assert.match(panel, new RegExp(`data-setting="interaction\\.${name}"`));
});

test('About double-right reset keeps nearest upright face through the tween', () => {
  const about = source('_1-about/about.js');
  assert.match(about, /alignedCubeQuaternion\(cube\.quaternion,camera\.getWorldQuaternion/);
  assert.match(about, /cube\.quaternion\.copy\(tween\.from\)\.slerp\(tween\.to,eased\)/);
  const from = new THREE.Quaternion().setFromEuler(new THREE.Euler(.5, 1.3, -.4));
  const target = alignedCubeQuaternion(from, new THREE.Quaternion());
  const middle = from.clone().slerp(target, .5);
  assert.ok(middle.angleTo(from) > 0);
  assert.ok(middle.angleTo(target) > 0);
  assert.ok(from.clone().slerp(target, 1).angleTo(target) < 1e-7);
});
