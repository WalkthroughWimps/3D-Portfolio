import * as THREE from 'three';
import {createModelFace} from '../model-face.js';
import {createRefsSnapBoard, refsContrastGain, REFS_LAYOUT} from './snap-board.js';
import {createRefsControls} from './controls.js';
import {createRefsSkinProfile, measureRefsAssembly, createRefsPresence} from './presence-clearance.js';

function refsFaceFrame(THREE, cube, backing) {
  cube.updateWorldMatrix(true, false);
  backing.updateWorldMatrix(true, true);
  const cubeInverse = cube.matrixWorld.clone().invert();
  const samples = [], center = new THREE.Vector3(), local = new THREE.Vector3();
  backing.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes.position) return;
    const toCube = cubeInverse.clone().multiply(node.matrixWorld);
    const positions = node.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const point = local.fromBufferAttribute(positions, i).applyMatrix4(toCube).clone();
      samples.push(point); center.add(point);
    }
  });
  if (!samples.length) throw new Error('Refs backing has no surface geometry');
  center.multiplyScalar(1 / samples.length).normalize();
  const normal = center;
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(up.dot(normal)) > .92) up.set(0, 0, 1);
  up.addScaledVector(normal, -up.dot(normal)).normalize();
  const faceRight = up.clone().cross(normal).normalize();
  const surfaceDepth = Math.max(...samples.map(point => point.dot(normal)));
  // The sketch is an X/Z drawing with +Z at its top. Local -Y faces out.
  const orientation = new THREE.Matrix4().makeBasis(faceRight, normal.clone().negate(), up);
  return {
    position: normal.clone().multiplyScalar(surfaceDepth - REFS_LAYOUT.labelOffset),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(orientation),
    mount: {right: faceRight.toArray(), up: up.toArray(), normal: normal.toArray()}
  };
}

/** Mount a face-owned reference index on the authored Refs backing surface. */
export function createRefsFace({focusFace = () => {}} = {}) {
  const model = createModelFace({id: 'refs', backingName: 'back.refs'});
  let board = null, controls = null, mounted = false, host = null, mount = null;
  let enabled = true, suspended = false, upright = true, reduced = false, roll = 0, rollTarget = 0, lastRaw = null;
  const presence = createRefsPresence();
  const inverse = new THREE.Matrix4(), screenRight = new THREE.Vector3(), cameraNormal = new THREE.Vector3();
  const cameraAtFace = new THREE.Vector3();
  function show() { if (board?.root) board.root.visible = enabled && !suspended; }
  function focus() { if (mount) focusFace(mount); host?.canvas?.focus?.({preventScroll: true}); }
  function detach() {
    controls?.dispose(); controls = null;
    if (mounted) board?.root?.removeFromParent();
    board?.dispose(); board = null; mounted = false; host = mount = null;
    roll = rollTarget = 0; lastRaw = null;
    presence.reset();
    model.detach();
  }
  return {
    id: model.id, backingName: model.backingName,
    get backing() { return model.backing; },
    get root() { return board?.root ?? null; },
    get mount() { return mount; },
    get runtime() { return board; },
    focus,
    setOptions(options) { return board?.setOptions(options); },
    updateOptions(options) { return board?.setOptions(options); },
    getOptions() { return board?.getOptions(); },
    // Attached panels are face-owned parts, not deformable speaker backing geometry.
    get components() { return board ? [board.root] : model.components; },
    attach(context) {
      detach(); model.attach(context);
      host = context; suspended = false;
      board = createRefsSnapBoard(THREE);
      const frame = refsFaceFrame(THREE, context.cube, model.backing);
      mount = frame.mount;
      board.root.position.copy(frame.position);
      board.root.quaternion.copy(frame.quaternion);
      context.cube.add(board.root); mounted = true;
      const skin = createRefsSkinProfile(THREE, context.cube, model.backing, frame);
      board.setClearanceProbe(current => measureRefsAssembly(THREE, current, skin));
      controls = createRefsControls({board, onFocus: focus});
      show();
      if (new URLSearchParams(location.search).get('face') === 'refs') queueMicrotask(() => { if (host && !suspended) focus(); });
    },
    update(dt = 0) {
      if (!host || suspended || !board) return;
      board.update(dt);
      board.root.updateWorldMatrix(true, false);
      host.camera.updateWorldMatrix(true, false);
      inverse.copy(board.root.matrixWorld).invert();
      cameraAtFace.setFromMatrixPosition(host.camera.matrixWorld).applyMatrix4(inverse);
      const dot = -cameraAtFace.y / (cameraAtFace.length() || 1);
      const canTuck = !board.getSelectorState().busy;
      board.carrier.position.y = presence.update(dot, dt, board.getClearance(), reduced, canTuck);
      if (!upright) { roll = rollTarget = 0; lastRaw = null; board.carrier.rotation.y = 0; return; }
      screenRight.setFromMatrixColumn(host.camera.matrixWorld, 0).transformDirection(inverse);
      cameraNormal.setFromMatrixColumn(host.camera.matrixWorld, 2).transformDirection(inverse);
      // A rear or edge-on view offers no stable screen-up heading.
      if (cameraNormal.y < -.08 && screenRight.x ** 2 + screenRight.z ** 2 > .0064) {
        const raw = Math.atan2(-screenRight.z, screenRight.x);
        const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));
        rollTarget = lastRaw === null ? roll + wrap(raw - roll) : rollTarget + wrap(raw - lastRaw);
        lastRaw = raw;
        const delta = rollTarget - roll, step = Math.max(0, Math.min(.05, dt));
        roll += reduced ? delta : Math.max(-2.6 * step, Math.min(2.6 * step, delta * (1 - Math.exp(-7 * step))));
      } else lastRaw = null;
      board.carrier.rotation.y = roll;
    },
    applySettings(snapshot) {
      if (!board) return;
      const settings = snapshot?.about?.refs;
      enabled = settings?.enabled !== false;
      upright = snapshot?.cube?.uprightFaces !== false;
      reduced = Boolean(snapshot?.accessibility?.reducedMotion);
      board.setReducedMotion(reduced);
      show();
      board.setContrast(refsContrastGain(snapshot?.start?.contrast));
    },
    suspend() { suspended = true; board?.suspend(); show(); },
    resume() { suspended = false; board?.resume(); show(); },
    detach,
    dispose() { detach(); model.dispose(); }
  };
}
