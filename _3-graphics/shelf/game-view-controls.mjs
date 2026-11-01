import * as THREE from 'three';

// OrbitControls clamps its polar angle at both poles. Selected games own
// right-drag rotation so a full turn can pass through either pole and roll.
export function installGameViewControls({camera, controls, domElement, active, invalidate, onStart}) {
  let drag = null;
  const axis = new THREE.Vector3(), delta = new THREE.Quaternion();
  function down(event) {
    if (event.button !== 2 || !active() || !controls.enabled) return;
    drag = {id: event.pointerId, x: event.clientX, y: event.clientY};
    onStart();
    domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (!active() || !controls.enabled) { cancel(); return; }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    drag.x = event.clientX; drag.y = event.clientY;
    const distance = camera.position.clone().sub(controls.target);
    // Use the camera's current up/right axes rather than world Y. That is what
    // lets vertical rotation continue naturally after an upside-down turn.
    const speed = 2 * Math.PI / Math.max(180, domElement.clientHeight);
    axis.copy(camera.up).normalize();
    delta.setFromAxisAngle(axis, -dx * speed);
    distance.applyQuaternion(delta);
    const right = new THREE.Vector3().crossVectors(camera.up, distance).normalize();
    delta.setFromAxisAngle(right, -dy * speed);
    distance.applyQuaternion(delta);
    camera.up.applyQuaternion(delta).normalize();
    camera.position.copy(controls.target).add(distance);
    camera.lookAt(controls.target);
    invalidate();
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function up(event) {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    if (domElement.hasPointerCapture(event.pointerId)) domElement.releasePointerCapture(event.pointerId);
    event.stopImmediatePropagation();
  }
  function cancel() {
    if (drag && domElement.hasPointerCapture(drag.id)) domElement.releasePointerCapture(drag.id);
    drag = null;
  }
  function lost(event) { if (drag?.id === event.pointerId) drag = null; }
  domElement.addEventListener('pointerdown', down, {capture: true});
  domElement.addEventListener('pointermove', move, {capture: true});
  domElement.addEventListener('pointerup', up, {capture: true});
  domElement.addEventListener('pointercancel', cancel, {capture: true});
  domElement.addEventListener('lostpointercapture', lost, {capture: true});
  window.addEventListener('blur', cancel);
  return {cancel, dispose() {
    cancel();
    domElement.removeEventListener('pointerdown', down, {capture: true});
    domElement.removeEventListener('pointermove', move, {capture: true});
    domElement.removeEventListener('pointerup', up, {capture: true});
    domElement.removeEventListener('pointercancel', cancel, {capture: true});
    domElement.removeEventListener('lostpointercapture', lost, {capture: true});
    window.removeEventListener('blur', cancel);
  }};
}
