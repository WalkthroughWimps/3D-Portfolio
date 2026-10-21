import * as THREE from 'three';
import {unwrapAngle} from './winding.js';

const pointer = new THREE.Vector2(), raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(), normal = new THREE.Vector3(), point = new THREE.Vector3();
const toward = new THREE.Vector3(), temp = new THREE.Vector3();

/** Only visible, unobscured clock hands or groove claim a primary pointer drag. */
export function createClockGesture({host, hands, kinds = ['hour','minute','second'], canInteract = () => true,
  onStart, onPreview, onCommit, onCancel}) {
  const events = new AbortController(), canvas = host.canvas, oldCursor = canvas.style.cursor;
  let drag = null;
  const visible = object => {for (let node = object; node && node !== host.cube; node = node.parent) if (!node.visible) return false; return true;};
  const mountFor = kind => kind === 'second' ? hands.groove.parent : hands.pivot[kind].parent;
  const planePointFor = kind => kind === 'second' ? hands.hit : hands.pivot[kind];
  function ray(event) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return false;
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, host.camera);
    return true;
  }
  function angleFor(kind) {
    const mount = mountFor(kind);
    planePointFor(kind).getWorldPosition(point);
    normal.set(0, -1, 0).transformDirection(mount.matrixWorld);
    toward.copy(host.camera.position).sub(point).normalize();
    if (normal.dot(toward) < .2) return null;
    plane.setFromNormalAndCoplanarPoint(normal, point);
    if (!raycaster.ray.intersectPlane(plane, temp)) return null;
    const local = mount.worldToLocal(temp.clone());
    return Math.atan2(local.x, local.z);
  }
  function pick(event) {
    if (!ray(event)) return null;
    const candidates = kinds.flatMap(kind => hands.getTargets(kind).filter(visible).map(object => ({kind, object})));
    const targets = candidates.flatMap(({kind, object}) => raycaster.intersectObject(object, true).map(hit => ({kind, hit})))
      .sort((a,b) => a.hit.distance - b.hit.distance);
    const nearest = targets[0]; if (!nearest) return null;
    const visibleHits = raycaster.intersectObjects(host.cube.children, true).filter(({object}) =>
      visible(object) && object.material?.visible !== false && object.material?.opacity !== 0);
    if (visibleHits[0] && visibleHits[0].distance < nearest.hit.distance - .013) return null;
    const angle = angleFor(nearest.kind);
    return angle === null ? null : {kind: nearest.kind, angle};
  }
  function cancel() {
    if (!drag) return;
    const {id, kind} = drag; drag = null;
    if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    canvas.style.cursor = oldCursor;
    onCancel?.(kind);
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag || !canInteract()) return;
    const picked = pick(event); if (!picked) return;
    onStart?.(picked.kind, picked.angle);
    // An accepted start may freeze the old train; use its final matrix basis.
    ray(event);
    drag = {id: event.pointerId, kind: picked.kind, angle: angleFor(picked.kind) ?? picked.angle,
      start: angleFor(picked.kind) ?? picked.angle, delta: 0};
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = 'grabbing';
    event.preventDefault(); event.stopImmediatePropagation();
  }, {capture: true, signal: events.signal});
  canvas.addEventListener('pointermove', event => {
    if (!drag) {
      canvas.style.cursor = canInteract() && pick(event) ? 'grab' : oldCursor;
      return;
    }
    if (event.pointerId !== drag.id || !ray(event)) return;
    const angle = angleFor(drag.kind); if (angle === null) return;
    drag.delta += unwrapAngle(drag.angle, angle); drag.angle = angle;
    onPreview?.(drag.kind, drag.delta, drag.start); event.preventDefault();
  }, {signal: events.signal});
  const end = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const {id, kind, delta, start} = drag; drag = null;
    if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    canvas.style.cursor = oldCursor;
    if (event.type === 'pointercancel') onCancel?.(kind); else onCommit?.(kind, delta, start);
    event.preventDefault();
  };
  canvas.addEventListener('pointerup', end, {signal: events.signal});
  canvas.addEventListener('pointercancel', end, {signal: events.signal});
  canvas.addEventListener('lostpointercapture', cancel, {signal: events.signal});
  window.addEventListener('blur', cancel, {signal: events.signal});
  return {get active() {return Boolean(drag);}, cancel, dispose() {cancel(); events.abort(); canvas.style.cursor = oldCursor;}};
}
