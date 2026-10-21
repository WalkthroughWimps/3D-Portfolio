import * as THREE from 'three';

/** Observe clicks without taking over the host's right/middle drag or touch turns. */
export function bindDisplayInput({cube, camera, canvas, allowed, onNext, getDisplay}) {
  const events = new AbortController(), options = {capture: true, signal: events.signal};
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let gesture = null, clickReady = false;
  function hitsAbout(event) {
    if (!allowed()) return false;
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    camera.updateMatrixWorld(); cube.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const display = getDisplay();
    if (!display?.visible) return false;
    // Use the real transformed front, reverse, and sidewalls. The first visible
    // hit must belong to this face, so clicking a different cube face cannot
    // advance the About picture.
    const first = raycaster.intersectObject(cube, true).find(({object}) => {
      let node = object;
      while (node && node !== cube) { if (!node.visible) return false; node = node.parent; }
      return true;
    });
    return Boolean(first && display.getObjectById(first.object.id));
  }
  canvas.addEventListener('pointerdown', event => {
    clickReady = false;
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !hitsAbout(event)) return;
    gesture = {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false};
  }, options);
  window.addEventListener('pointermove', event => {
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 7) gesture.moved = true;
  }, options);
  window.addEventListener('pointerup', event => {
    if (gesture?.id !== event.pointerId) return;
    clickReady = !gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 7 && event.target === canvas;
    gesture = null;
  }, options);
  window.addEventListener('pointercancel', () => { gesture = null; clickReady = false; }, options);
  canvas.addEventListener('click', event => {
    const advance = event.button === 0 && clickReady && hitsAbout(event); clickReady = false;
    if (!advance) return;
    event.preventDefault(); event.stopImmediatePropagation(); canvas.focus({preventScroll: true}); onNext();
  }, options);
  canvas.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key) || event.repeat || !allowed()) return;
    const bounds = canvas.getBoundingClientRect();
    if (!hitsAbout({clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2})) return;
    event.preventDefault(); event.stopImmediatePropagation(); onNext();
  }, options);
  return {dispose(){events.abort();gesture=null;clickReady=false;}};
}
