import * as THREE from 'three';

// Canvas dimensions never depend on the header. A projection offset centers the
// tablet in the usable area without stretching its pixels or changing its tilt.
export function createTabletFocus({ camera, controls, tabletGroup, screenMesh, renderer }) {
  let active = false, saved = null, animation = 0, resizeTimer = 0;
  let inset = 0, destinationLimits = null;
  const snapshot = () => ({ position: camera.position.clone(), target: controls.target.clone(), up: camera.up.clone(), min: controls.minDistance, max: controls.maxDistance });
  const safeInset = () => {
    const header = document.querySelector('.header');
    // Layout dimensions ignore the animated CSS transform.
    return Math.min(0.45, ((header?.offsetTop || 0) + (header?.offsetHeight || 0) + 16) / Math.max(1, window.innerHeight));
  };
  const project = () => {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    camera.setViewOffset(w, h, 0, -h * inset / 2, w, h);
  };
  const cancel = () => {
    cancelAnimationFrame(animation); animation = 0;
    if (destinationLimits) {
      controls.minDistance = destinationLimits.min;
      controls.maxDistance = destinationLimits.max;
      destinationLimits = null;
    }
    controls.enabled = true;
  };
  const fit = (pose, safe, square = false) => {
    tabletGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(tabletGroup);
    const center = box.getCenter(new THREE.Vector3());
    let normal = pose.position.clone().sub(pose.target).normalize();
    let up = pose.up.clone();
    if (square) {
      screenMesh.geometry.computeBoundingBox();
      const size = screenMesh.geometry.boundingBox.getSize(new THREE.Vector3());
      const axes = ['x', 'y', 'z'].sort((a, b) => size[a] - size[b]);
      const axis = name => new THREE.Vector3(name === 'x' ? 1 : 0, name === 'y' ? 1 : 0, name === 'z' ? 1 : 0).transformDirection(screenMesh.matrixWorld);
      const facing = axis(axes[0]);
      if (facing.dot(normal) < 0) facing.negate();
      normal = facing;
      up = axis(axes[1]);
      const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      if (up.dot(currentUp) < 0) up.negate();
    }
    const right = new THREE.Vector3().crossVectors(up, normal).normalize();
    const screenUp = new THREE.Vector3().crossVectors(normal, right).normalize();
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom;
    const tanX = tanY * window.innerWidth / Math.max(1, window.innerHeight);
    let distance = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const corner = new THREE.Vector3(x, y, z).sub(center);
      distance = Math.max(distance, corner.dot(normal) + Math.max(Math.abs(corner.dot(right)) / tanX, Math.abs(corner.dot(screenUp)) / (tanY * (1 - safe))));
    }
    distance *= active ? 1.04 : 1.12;
    return { position: center.clone().addScaledVector(normal, distance), target: center, up, min: distance * 0.45, max: distance * 3 };
  };
  const transition = (destination, nextInset, duration = 850) => {
    cancel();
    const from = snapshot(), fromInset = inset;
    controls.enabled = false;
    destinationLimits = destination;
    const fromDistance = from.position.distanceTo(from.target);
    const toDistance = destination.position.distanceTo(destination.target);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    const step = now => {
      const t = Math.min(1, (now - started) / duration);
      const ease = t * t * t * (t * (t * 6 - 15) + 10);
      camera.position.lerpVectors(from.position, destination.position, ease);
      controls.target.lerpVectors(from.target, destination.target, ease);
      // A small zoom overshoot (about 2.3%) masks the stop without bouncing
      // the tablet's rotation, safe-area offset, or the independent header.
      const smooth = t * t * (3 - 2 * t);
      const u = smooth - 1;
      const spring = reducedMotion ? ease : 1 + 1.8 * u * u * u + 0.8 * u * u;
      const distance = THREE.MathUtils.lerp(fromDistance, toDistance, spring);
      camera.position.sub(controls.target).normalize().multiplyScalar(distance).add(controls.target);
      camera.up.lerpVectors(from.up, destination.up, ease).normalize();
      camera.lookAt(controls.target);
      inset = fromInset + (nextInset - fromInset) * ease;
      project();
      if (t < 1) animation = requestAnimationFrame(step);
      else { cancel(); controls.update(); }
    };
    animation = requestAnimationFrame(step);
  };
  const resize = () => {
    // Preserve the current pose throughout a resize gesture. Only the drawing
    // buffer/aspect update immediately; framing waits for 350 ms of quiet.
    cancel();
    project();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const safe = active ? 0 : safeInset();
      transition(fit(snapshot(), safe), safe, 650);
    }, 350);
  };
  const interact = () => { clearTimeout(resizeTimer); cancel(); };
  renderer.domElement.addEventListener('pointerdown', interact, { capture: true });
  renderer.domElement.addEventListener('wheel', interact, { capture: true });
  window.addEventListener('resize', resize);

  function setFocus(next) {
    if (next === active) return;
    clearTimeout(resizeTimer);
    cancel();
    const pose = snapshot();
    if (next) saved = { ...pose, width: window.innerWidth, height: window.innerHeight };
    active = next;
    document.body.classList.toggle('tablet-focus', active);
    document.body.style.setProperty('--tablet-focus-progress', active ? 1 : 0);
    const safe = active ? 0 : safeInset();
    // Compute a single destination, independent of the header's moving bounds.
    const sameViewport = saved?.width === window.innerWidth && saved?.height === window.innerHeight;
    const destination = active ? fit(pose, safe, true) : sameViewport ? saved : fit(saved || pose, safe);
    transition(destination, safe);
    if (!active) saved = null;
  }
  setFocus.initialize = () => {
    inset = safeInset(); project();
    const pose = fit(snapshot(), inset);
    camera.position.copy(pose.position); controls.target.copy(pose.target);
    controls.minDistance = pose.min; controls.maxDistance = pose.max;
    camera.lookAt(controls.target); controls.update();
  };
  return setFocus;
}
