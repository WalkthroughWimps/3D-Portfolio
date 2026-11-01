import * as THREE from 'three';
import {createModelFace} from '../model-face.js';
import {createRefsSnapBoard, refsContrastGain, REFS_LAYOUT} from './snap-board.js';
import {createRefsControls} from './controls.js';
import {createRefsSkinProfile, measureRefsAssembly, refsCabinetCarrierY} from './presence-clearance.js';
import {REFS_DOOR_IDS} from './door-options.js';

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
    rimLocalY: -REFS_LAYOUT.labelOffset,
    mount: {right: faceRight.toArray(), up: up.toArray(), normal: normal.toArray()}
  };
}

/** Mount a face-owned reference index on the authored Refs backing surface. */
export function createRefsFace({focusFace = () => {}} = {}) {
  const model = createModelFace({id: 'refs', backingName: 'back.refs'});
  let board = null, controls = null, mounted = false, host = null, mount = null, restAnchorDepth = 0;
  let enabled = true, suspended = false, upright = true, reduced = false, roll = 0, rollTarget = 0, lastRaw = null;
  let rimLocalY = -REFS_LAYOUT.labelOffset;
  let pointerEvents = null, pointerDown = null, lastDoorTap = 0;
  let operationDrag = null, lastOperationTap = 0;
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const inverse = new THREE.Matrix4(), screenRight = new THREE.Vector3(), cameraNormal = new THREE.Vector3();
  function show() { if (board?.root) board.root.visible = enabled && !suspended; }
  function positionCabinet() {
    if (!board) return;
    const options = board.getOptions();
    board.carrier.position.y = refsCabinetCarrierY(rimLocalY,
      board.getMetrics().frontY, options.scale, options.cabinetPosition);
  }
  function focus() { if (mount) focusFace(mount); host?.canvas?.focus?.({preventScroll: true}); }
  function detach() {
    endGesture(); pointerEvents?.abort(); pointerEvents = null; pointerDown = null;
    controls?.dispose(); controls = null;
    if (mounted) board?.root?.removeFromParent();
    board?.dispose(); board = null; mounted = false; host = mount = null;
    roll = rollTarget = 0; lastRaw = null;
    model.detach();
  }
  function inside(point, contour) {
    let hit = false;
    for (let i = 0, j = contour.length - 1; i < contour.length; j = i++) {
      const a = contour[i], b = contour[j];
      if ((a.z > point.z) !== (b.z > point.z) &&
          point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) hit = !hit;
    }
    return hit;
  }
  function eventRay(event) {
    const rect = host.canvas.getBoundingClientRect();
    ndc.set((event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1);
    host.physicalCube.updateWorldMatrix(true, true);
    host.camera.updateWorldMatrix(true, false);
    raycaster.setFromCamera(ndc, host.camera);
    return raycaster.ray;
  }
  function visibleHit(hit) {
    let node = hit.object;
    while (node && node !== host.physicalCube) { if (!node.visible) return false; node = node.parent; }
    return hit.object !== board.sketch && hit.object.name !== 'refs.plate-light.selected-glow' &&
      !(hit.object.material?.transparent &&
      hit.object.material.opacity < .3);
  }
  function pickOperation(event) {
    if (!board?.root.visible || !host?.physicalCube || !board.getOptions().cabinetEnabled) return null;
    const ray = eventRay(event);
    const operation = board.faceOperations.hit(ray);
    if (!operation) return null;
    const first = raycaster.intersectObject(host.physicalCube, true).find(visibleHit);
    // Solid leaves and other faces must occlude a control. Transparent glazing
    // does not block the bezel or rail underneath it.
    if (first && !first.object.userData.refsOperation && first.distance + .004 < operation.distance)
      return null;
    return operation;
  }
  function endGesture() {
    if (operationDrag) {
      try { host?.canvas?.releasePointerCapture?.(operationDrag.id); } catch { /* already released */ }
    }
    operationDrag = null; pointerDown = null;
  }
  function setIrisFromRay(ray, value) {
    const opening = Math.round((value ?? board.faceOperations.sliderValue(ray)) * 100);
    if (opening !== board.getOptions().irisOpening) board.setOptions({irisOpening: opening});
  }
  function pickDoor(event) {
    if (!board?.root.visible || !host?.canvas || !host?.camera) return null;
    eventRay(event);
    // Intersections from the full cube prevent tapping through another face.
    const first = raycaster.intersectObject(host.physicalCube, true).find(visibleHit);
    if (first?.object.userData.refsDoorId) return first.object.userData.refsDoorId;
    const inversePlacement = board.placement.matrixWorld.clone().invert();
    const ray = raycaster.ray.clone().applyMatrix4(inversePlacement);
    const best = REFS_DOOR_IDS.map(id => {
      const portal = board.getPortal(id);
      if (!portal || board.getDoorOptions(id)?.type === 'none') return null;
      const t = (portal.frontY - ray.origin.y) / ray.direction.y;
      if (!(t > 0)) return null;
      const point = ray.at(t, new THREE.Vector3());
      if (!inside(point, portal.contour)) return null;
      const world = point.applyMatrix4(board.placement.matrixWorld);
      return {id, distance: world.distanceTo(raycaster.ray.origin)};
    }).filter(Boolean).sort((a, b) => a.distance - b.distance)[0];
    if (best && (!first || best.distance <= first.distance + .003)) return best.id;
    return null;
  }
  function attachInput() {
    pointerEvents?.abort(); pointerEvents = new AbortController();
    const signal = pointerEvents.signal, canvas = host.canvas;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.defaultPrevented || !enabled || suspended) return;
      const operation = pickOperation(event);
      if (operation) {
        operationDrag = {id: event.pointerId, x: event.clientX, y: event.clientY,
          operation, moved: false};
        if (operation.kind === 'slider') {
          setIrisFromRay(raycaster.ray, operation.value);
          try { canvas.setPointerCapture(event.pointerId); } catch { /* window fallback */ }
        }
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      pointerDown = {id: event.pointerId, x: event.clientX, y: event.clientY,
        door: pickDoor(event), canceled: false};
    }, {signal});
    window.addEventListener('pointermove', event => {
      if (operationDrag?.id === event.pointerId) {
        if (Math.hypot(event.clientX - operationDrag.x, event.clientY - operationDrag.y) > 6)
          operationDrag.moved = true;
        if (operationDrag.operation.kind === 'slider' && enabled && !suspended) {
          eventRay(event);
          setIrisFromRay(raycaster.ray);
          event.preventDefault(); event.stopImmediatePropagation();
        }
        return;
      }
      if (pointerDown?.id === event.pointerId && Math.hypot(event.clientX - pointerDown.x,
        event.clientY - pointerDown.y) > 6) pointerDown.canceled = true;
    }, {signal, capture: true});
    window.addEventListener('pointerup', event => {
      if (operationDrag?.id === event.pointerId) {
        const drag = operationDrag;
        endGesture();
        if (event.button === 0 && enabled && !suspended) {
          if (drag.operation.kind === 'slider') {
            eventRay(event);
            setIrisFromRay(raycaster.ray);
            board.setOptions({}); // Recheck the final physical envelope once.
            controls?.capture?.(); lastOperationTap = performance.now();
          } else if (!drag.moved) {
            const target = pickOperation(event);
            if (target?.kind === drag.operation.kind && (target.index === drag.operation.index) &&
                (target.side === drag.operation.side)) {
              if (target.kind === 'plate') board.selectPlate(target.index);
              else if (target.side < 0) board.previousPlate(); else board.nextPlate();
              controls?.capture?.(); lastOperationTap = performance.now();
            }
          }
        }
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      const down = pointerDown; if (!down || down.id !== event.pointerId) return;
      pointerDown = null;
      if (event.button !== 0 || down.canceled || !down.door || !enabled || suspended ||
          pickDoor(event) !== down.door) return;
      board.toggleDoor(down.door); lastDoorTap = performance.now();
      controls?.capture?.();
    }, {signal, capture: true});
    window.addEventListener('pointercancel', () => endGesture(), {signal, capture: true});
    window.addEventListener('blur', endGesture, {signal});
    canvas.addEventListener('lostpointercapture', event => {
      if (operationDrag?.id === event.pointerId) endGesture();
    }, {signal});
    canvas.addEventListener('dblclick', event => {
      if (event.button === 0 && performance.now() - Math.max(lastDoorTap, lastOperationTap) < 450) {
        event.stopImmediatePropagation(); event.preventDefault();
      }
    }, {signal, capture: true});
  }
  return {
    id: model.id, backingName: model.backingName,
    get backing() { return model.backing; },
    get root() { return board?.root ?? null; },
    get travelPart() { return board?.root ?? null; },
    get travelMount() { return mount; },
    get travelSupportDepth() {
      if (!board || !mount) return .97;
      const front = board.getMetrics()?.frontY ?? -.08;
      const localY = board.carrier.position.y + board.placement.position.y + front * board.placement.scale.y;
      return restAnchorDepth - localY;
    },
    get mount() { return mount; },
    get runtime() { return board; },
    get gestureActive() { return Boolean(operationDrag); },
    endGesture,
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
      board.setViewContext(context);
      const frame = refsFaceFrame(THREE, context.cube, model.backing);
      rimLocalY = frame.rimLocalY;
      mount = frame.mount;
      board.root.position.copy(frame.position);
      board.root.quaternion.copy(frame.quaternion);
      restAnchorDepth = frame.position.dot(new THREE.Vector3(...mount.normal));
      context.cube.add(board.root); mounted = true;
      const skin = createRefsSkinProfile(THREE, context.cube, model.backing, frame);
      rimLocalY = skin.rimY;
      board.setClearanceProbe(current => measureRefsAssembly(THREE, current, skin));
      board.subscribe(positionCabinet);
      positionCabinet();
      controls = createRefsControls({board, onFocus: focus});
      attachInput();
      show();
      if (new URLSearchParams(location.search).get('face') === 'refs') queueMicrotask(() => { if (host && !suspended) focus(); });
    },
    update(dt = 0) {
      if (!host || suspended || !board) return;
      board.update(dt);
      positionCabinet();
      board.root.updateWorldMatrix(true, false);
      host.camera.updateWorldMatrix(true, false);
      inverse.copy(board.root.matrixWorld).invert();
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
    suspend() { endGesture(); suspended = true; board?.suspend(); show(); },
    resume() { suspended = false; board?.resume(); show(); },
    detach,
    dispose() { detach(); model.dispose(); }
  };
}
