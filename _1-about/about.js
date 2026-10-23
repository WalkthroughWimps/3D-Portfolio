import { bootstrapPage } from '../_7-shared-scripts/core/bootstrap.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { alignedCubeQuaternion } from './cube-alignment.js';
import { circularizeCubeApertures } from './cube-apertures.mjs';
import { rotateCubeAtOrbitTarget } from './cube-orbit-focus.mjs';
import { applyStartPageMouseControlMode, installStartPageStyleMouseControls } from '../_7-shared-scripts/shared-glb-mouse-controls.js';
import { getSharedSettings } from '../_7-shared-scripts/core/settings.js';
import {bindAboutAppearance} from './scene-appearance.js';
import {createFaceRegistry, cubeAssets} from './faces/index.js?v=odd-zip-1';
import {createNotesFace} from './faces/notes/face.js';
import {trackPerformanceRenderer} from '../debug/performance-stats.js';

function mountAbout() {
const canvas = document.getElementById('about-cube');
const status = document.getElementById('cube-status');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (error) {
  console.warn('[about] 3D renderer unavailable; showing the text view.', error);
  canvas.hidden = true;
  document.getElementById('about-fallback').hidden = false;
  document.body.classList.add('about-2d-fallback');
  document.querySelector('.scene-alternative')?.setAttribute('open', '');
  status.classList.add('is-hidden');
  const fallbackNotes = createNotesFace({stage: canvas.parentElement});
  return { suspend: () => fallbackNotes.suspend(), resume: () => fallbackNotes.resume(), dispose: () => fallbackNotes.dispose() };
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = false;
const stopPerformanceTracking = trackPerformanceRenderer(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
camera.up.set(0, 1, 0); // Screen reference only; no cube face is classified as top or bottom.
const controls = new OrbitControls(camera, renderer.domElement);
applyStartPageMouseControlMode(controls, { enabled: true, allowRotate: false, allowZoom: true });
controls.mouseButtons.LEFT = -1;
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.2;
controls.zoomSpeed = 0.55;
controls.minPolarAngle = 0;
controls.maxPolarAngle = Math.PI;
const focusRaycaster = new THREE.Raycaster();
focusRaycaster.params.Line.threshold = 0.006;
focusRaycaster.params.Points.threshold = 0.006;
const focusPointer = new THREE.Vector2();
let activeSurfaceFocus = null;
let lastFocusHit = null;
function surfaceFocusForHit(hit) {
  const object = hit.object, instanceId = hit.instanceId;
  object.updateWorldMatrix(true, false);
  const localPoint = object.worldToLocal(hit.point.clone());
  const instanceMatrix = object.isInstancedMesh && Number.isInteger(instanceId) ? new THREE.Matrix4() : null;
  if (instanceMatrix) {
    object.getMatrixAt(instanceId, instanceMatrix);
    localPoint.applyMatrix4(instanceMatrix.clone().invert());
  }
  return {
    point: hit.point.clone(),
    resolve() {
      if (!cube || disposed || !object.parent) return null;
      for (let node = object; node && node !== scene; node = node.parent)
        if (!node.visible) return null;
      object.updateWorldMatrix(true, false);
      const point = localPoint.clone();
      if (instanceMatrix) {
        object.getMatrixAt(instanceId, instanceMatrix);
        point.applyMatrix4(instanceMatrix);
      }
      return object.localToWorld(point);
    }
  };
}
function getFocusHitPoint(event) {
  lastFocusHit = null;
  if (!cube || disposed || suspended) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  focusPointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1);
  focusRaycaster.setFromCamera(focusPointer, camera);
  const hits = focusRaycaster.intersectObjects(cube.children, true);
  for (const hit of hits) {
    let visible = true;
    for (let node = hit.object; node && node !== scene; node = node.parent) {
      if (!node.visible) { visible = false; break; }
    }
    if (!visible) continue;
    const material = Array.isArray(hit.object.material)
      ? hit.object.material[hit.face?.materialIndex ?? 0] : hit.object.material;
    if (!material?.visible || material.colorWrite === false || material.opacity <= 0.001) continue;
    targetCubeQuaternion.copy(cube.quaternion);
    alignAt = null;
    aligning = false;
    const focus = surfaceFocusForHit(hit);
    lastFocusHit = {focus, name: hit.object.name, x: event.clientX, y: event.clientY};
    return focus;
  }
  return null;
}
function getDefaultFocusPoint() {
  return cube && !disposed ? cube.position.clone() : null;
}
const mouseControls = installStartPageStyleMouseControls({ controls, camera, domElement: renderer.domElement,
  getHitPoint: getFocusHitPoint, getDefaultFocusPoint, focusDurationMs: () => reducedMotion ? 1 : 720,
  pivotOnRightDown: false, handleRightButton: false, interruptFocusOnMiddleDown: true,
  onMiddleDown: () => { activeSurfaceFocus = null; },
  onFocusStart: () => { activeSurfaceFocus = null; },
  onFocusComplete: target => { activeSurfaceFocus = typeof target.resolve === 'function' ? target : null; } });
const ambient=new THREE.HemisphereLight(0xffeee4, 0x17131d, 1.8);scene.add(ambient);
const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(4, 6, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xc4d5ff, 0.75); fill.position.set(-5, 1, -4); scene.add(fill);
let cube = null;
let apertureCorrection = null;
let appearance=null;
let showCubeShell = true;
const shellMeshes = [];
function applyCubeShellVisibility() {
  for (const mesh of shellMeshes) mesh.visible = showCubeShell;
}
function collectCubeShellMeshes(model) {
  shellMeshes.length = 0;
  model.traverse(node => {
    if (!node.isMesh) return;
    const name = node.userData?.source_object_name || node.name;
    if (/^(?:cube\.main|Trench Pipe [XYZ][+-]|Bevel Highlight (?:Triangles|Wire)|Cube Highlights)(?: Export)?$/i.test(name))
      shellMeshes.push(node);
  });
  applyCubeShellVisibility();
}
let reducedMotion = false;
let centerOnViewport = false;
let unsubscribeSettings = null;
let lastFrameTime = performance.now();
let frameDeltaSeconds = 0;
let settingsViewOffset = 0;
const targetCubeQuaternion = new THREE.Quaternion();
const arrowGeometries = [];
let rotatePointer = null;
let alignAt = null;
let aligning = true;
let faceSnap=false;
let pointerLockPending = false;
let disposed = false;
let suspended = false;
let failed3D = false;
let frameId = 0;
const assetAbort = new AbortController();
const input = new AbortController();
const ALIGN_DELAY_MS = 350;
const ALIGN_SPEED = 2.2;
let rotationEnvelope = 0;
let launchClearance = 0, orbitRestoreDistance = null, orbitPushedDistance = null;
const faces = createFaceRegistry({stage: canvas.parentElement,
  focusFace, rotateBy,
  onInputOwnership: owned => { controls.enabled = !owned; } });
if (location.hostname === '127.0.0.1' && new URLSearchParams(location.search).has('review'))
  window.__aboutSkillsReview = { get assembly() { return faces.get('skills').assembly; }, faces, get cube() { return cube; }, camera, renderer,
    get frameId() { return frameId; }, get rotationEnvelope() { return rotationEnvelope; }, get apertureCorrection() { return apertureCorrection; }, controls, get notes() { return faces.get('notes').runtime; },
    get focusReview() {
      const bounds = canvas.getBoundingClientRect();
      const project = point => {
        if (!point) return null;
        const ndc = point.clone().project(camera);
        return {x: bounds.left + (ndc.x + 1) * bounds.width / 2,
          y: bounds.top + (1 - ndc.y) * bounds.height / 2};
      };
      const anchor = project(lastFocusHit?.focus.resolve());
      const target = project(controls.target);
      return {object: lastFocusHit?.name || null, pointer: lastFocusHit ? {x: lastFocusHit.x, y: lastFocusHit.y} : null,
        anchor, target, active: Boolean(activeSurfaceFocus),
        errorPixels: anchor && target ? Math.hypot(anchor.x - target.x, anchor.y - target.y) : null};
    }, suspend, resume, dispose };
function focusFace(mount) {
  if (!cube || disposed || suspended) return;
  faces.endGestures();
  stopCubeRotation();
  mouseControls.startFocusAnimation(getDefaultFocusPoint());
  const normal = camera.getWorldPosition(new THREE.Vector3()).sub(controls.target).normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, normal).normalize();
  const up = new THREE.Vector3().crossVectors(normal, right).normalize();
  const world = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  const local = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(...mount.right), new THREE.Vector3(...mount.up), new THREE.Vector3(...mount.normal)));
  targetCubeQuaternion.copy(world.multiply(local.invert()));
  alignAt = null; aligning = true;
}
unsubscribeSettings = getSharedSettings().subscribe(snapshot => {
  const nextSnap=Boolean(snapshot?.cube?.faceSnap);
  if(faceSnap!==nextSnap){faceSnap=nextSnap;alignAt=nextSnap?performance.now()+ALIGN_DELAY_MS:null;if(!nextSnap)aligning=false;}
  reducedMotion = Boolean(snapshot?.accessibility?.reducedMotion);
  centerOnViewport = Boolean(snapshot?.about?.centerOnViewport);
  if (canvas.parentElement) resize();
  showCubeShell = snapshot?.cube?.showShell !== false;
  applyCubeShellVisibility();
  faces.applySettings(snapshot);
  if (reducedMotion && cube) {
    rotateCubeAtOrbitTarget(cube, camera, controls, () => cube.quaternion.copy(targetCubeQuaternion));
    frameDeltaSeconds = 0; alignVisibleArrows();
  }
}, { immediate: true });

function getUvAxes(mesh) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const index = geometry.index;
  const arrowGroup = Array.isArray(mesh.material)
    ? geometry.groups.find((group) => mesh.material[group.materialIndex]?.name === 'arrow')
    : mesh.material?.name === 'arrow' ? { start: 0, count: index?.count || 0 } : null;
  if (!position || !uv || !index || !arrowGroup) return null;
  for (let offset = arrowGroup.start; offset < arrowGroup.start + arrowGroup.count; offset += 3) {
    const a = index.getX(offset), b = index.getX(offset + 1), c = index.getX(offset + 2);
    const p0 = new THREE.Vector3().fromBufferAttribute(position, a);
    const p1 = new THREE.Vector3().fromBufferAttribute(position, b);
    const p2 = new THREE.Vector3().fromBufferAttribute(position, c);
    const uv0 = new THREE.Vector2().fromBufferAttribute(uv, a);
    const uv1 = new THREE.Vector2().fromBufferAttribute(uv, b);
    const uv2 = new THREE.Vector2().fromBufferAttribute(uv, c);
    const edge1 = p1.sub(p0), edge2 = p2.sub(p0);
    const du1 = uv1.x - uv0.x, dv1 = uv1.y - uv0.y;
    const du2 = uv2.x - uv0.x, dv2 = uv2.y - uv0.y;
    const determinant = du1 * dv2 - du2 * dv1;
    if (Math.abs(determinant) < 0.00001) continue;
    const localU = edge1.clone().multiplyScalar(dv2).sub(edge2.clone().multiplyScalar(dv1)).multiplyScalar(1 / determinant).normalize();
    const localV = edge2.clone().multiplyScalar(du1).sub(edge1.clone().multiplyScalar(du2)).multiplyScalar(1 / determinant).normalize();
    return { localU, localV, localNormal: new THREE.Vector3().crossVectors(localU, localV).normalize() };
  }
  return null;
}
function hasMaterialNamed(mesh, name) {
  const materials = Array.isArray(mesh?.material) ? mesh.material : [mesh?.material];
  return materials.some((material) => material?.name === name);
}
function prepareArrowGeometries(model) {
  model.updateMatrixWorld(true);
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const axes = getUvAxes(mesh);
    if (!axes) return;
    if (!hasMaterialNamed(mesh, 'arrow')) return;
    mesh.geometry.computeBoundingBox();
    // Arrow primitives have their own local origin; rotate the vertices around that
    // primitive's center so the authored plate and the arrow's placement never drift.
    const centerInArrowSpace = mesh.geometry.boundingBox?.getCenter(new THREE.Vector3());
    if (!centerInArrowSpace) return;
    const position = mesh.geometry.getAttribute('position');
    arrowGeometries.push({
      mesh,
      center: centerInArrowSpace,
      localU: axes.localU,
      localV: axes.localV,
      localNormal: axes.localNormal,
      positions: position.array.slice(),
      angle: 0
    });
  });
}
function alignVisibleArrows() {
  if (!cube) return;
  cube.updateMatrixWorld(true);
  const viewDirection = camera.getWorldDirection(new THREE.Vector3()).normalize();
  const screenUp = new THREE.Vector3(0, 1, 0).projectOnPlane(viewDirection).normalize();
  arrowGeometries.forEach((arrow) => {
    const { mesh, center, localU, localNormal } = arrow;
    const worldQuaternion = mesh.getWorldQuaternion(new THREE.Quaternion());
    const normal = localNormal.clone().applyQuaternion(worldQuaternion).normalize();
    // The baked arrow graphic points along its U axis, not its texture-V axis.
    const arrowUp = localU.clone().negate().applyQuaternion(worldQuaternion).normalize();
    const desiredUp = screenUp.clone().projectOnPlane(normal);
    if (desiredUp.lengthSq() < 0.0001) return;
    desiredUp.normalize();
    const targetAngle = Math.atan2(normal.dot(new THREE.Vector3().crossVectors(arrowUp, desiredUp)), arrowUp.dot(desiredUp));
    const speed = 5;
    const blend = reducedMotion ? 1 : 1 - Math.exp(-speed * frameDeltaSeconds);
    const difference = Math.atan2(Math.sin(targetAngle - arrow.angle), Math.cos(targetAngle - arrow.angle));
    arrow.angle += reducedMotion ? difference : THREE.MathUtils.clamp(difference * blend, -2.6 * frameDeltaSeconds, 2.6 * frameDeltaSeconds);
    const position = mesh.geometry.getAttribute('position');
    const vertex = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromArray(arrow.positions, i * 3).sub(center).applyAxisAngle(localNormal, arrow.angle).add(center);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  });
}

// The cube owns right-button gestures. Keep OrbitControls from trying to
// capture the same pointer, especially during a rapid double-click.
canvas.addEventListener('pointerdown', event => {
  if (event.button === 2) event.stopImmediatePropagation();
}, { capture: true, signal: input.signal });
canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 2 || !cube) return;
  mouseControls.cancelFocusAnimation();
  faces.endGestures({preserveModes:true});
  event.preventDefault();
  // A new drag interrupts settling immediately without jumping to its destination.
  targetCubeQuaternion.copy(cube.quaternion);
  alignAt = null;
  aligning = false;
  rotatePointer = { x: event.clientX, y: event.clientY, moved: false };
  // Native pointer lock supplies unlimited relative motion, hides the cursor,
  // and restores its pre-lock position when released. Fall back to capture if denied.
  try {
    pointerLockPending = typeof canvas.requestPointerLock === 'function';
    const request = canvas.requestPointerLock?.();
    request?.then?.(() => { if (disposed && document.pointerLockElement === canvas) document.exitPointerLock(); })
      ?.catch?.(() => { pointerLockPending = false; });
  } catch { pointerLockPending = false; /* Keep visible dragging available. */ }
}, { signal: input.signal });
function rotateBy(dx, dy) {
  dx = THREE.MathUtils.clamp(dx, -22, 22);
  dy = THREE.MathUtils.clamp(dy, -22, 22);
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.0045);
  const cameraRight = new THREE.Vector3().crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
  const pitch = new THREE.Quaternion().setFromAxisAngle(cameraRight, dy * 0.0035);
  targetCubeQuaternion.premultiply(yaw).premultiply(pitch).normalize();
}
canvas.tabIndex = 0;
canvas.setAttribute('aria-label', 'About cube. Drag the right mouse button to rotate, or double-click it to true the nearest face. Click the middle mouse button to focus, drag it to pan, or double-click it to return to the default focus; scroll to zoom. Press L or R to turn left or right, U or D to turn up or down.');
canvas.setAttribute('aria-keyshortcuts', 'L R U D');
window.addEventListener('keydown', event => {
  if (event.defaultPrevented) return;
  if (disposed || suspended || !cube || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
  if (event.target?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')) return;
  if (document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')) return;
  const movement = { l: [-22, 0], r: [22, 0], u: [0, -22], d: [0, 22] }[event.key.toLowerCase()];
  if (!movement) return;
  event.preventDefault();
  faces.endGestures({preserveModes:true});
  rotateBy(...movement);
  alignAt = faceSnap?performance.now() + ALIGN_DELAY_MS:null;
}, { signal: input.signal });
// Use one mouse-event stream for both modes. Cancelling pointerdown can suppress
// compatibility mouse events, leaving pointer lock active with no rotation input.
window.addEventListener('mousemove', (event) => {
  if (!rotatePointer) return;
  const locked = document.pointerLockElement === canvas;
  // Locked motion may report buttons=0 during the browser's lock transition.
  // Actual mouseup, Escape, blur and visibility loss end the drag explicitly.
  if (!locked && !pointerLockPending && !(event.buttons & 2)) { stopCubeRotation(); return; }
  const dx = locked ? event.movementX : event.clientX - rotatePointer.x;
  const dy = locked ? event.movementY : event.clientY - rotatePointer.y;
  if(Math.abs(dx)+Math.abs(dy)>2)rotatePointer.moved=true;
  rotatePointer.x = event.clientX;
  rotatePointer.y = event.clientY;
  rotateBy(dx, dy);
}, { capture: true, signal: input.signal });
function stopCubeRotation() {
  if (!rotatePointer) return;
  rotatePointer = null;
  alignAt = faceSnap?performance.now() + ALIGN_DELAY_MS:null;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
let lastRightClick=0;
function finishRightClick(event){
  if(event.button!==2)return;
  const wasClick=Boolean(rotatePointer&&!rotatePointer.moved);
  stopCubeRotation();
  if(!wasClick)return;
  const now=performance.now();
  if(now-lastRightClick<420&&cube){
    lastRightClick=0;alignAt=null;aligning=true;
    targetCubeQuaternion.copy(alignedCubeQuaternion(cube.quaternion,camera.getWorldQuaternion(new THREE.Quaternion())));
    event.preventDefault();
  }else lastRightClick=now;
}
window.addEventListener('mouseup', finishRightClick, { capture: true, signal: input.signal });
window.addEventListener('pointerup', finishRightClick, { capture: true, signal: input.signal });
window.addEventListener('blur', stopCubeRotation, { signal: input.signal });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopCubeRotation(); faces.suspend(); if (frameId) cancelAnimationFrame(frameId); frameId = 0; }
  else if (!suspended && !disposed) { faces.resume(); if (!failed3D) { lastFrameTime = performance.now(); if (!frameId) frameId = requestAnimationFrame(render); } }
}, { signal: input.signal });
document.addEventListener('pointerlockchange', () => {
  pointerLockPending = false;
  if (document.pointerLockElement === canvas) {
    if (!rotatePointer) document.exitPointerLock();
  } else if (rotatePointer) stopCubeRotation();
}, { signal: input.signal });
document.addEventListener('pointerlockerror', () => { pointerLockPending = false; }, { signal: input.signal });

function resize() {
  const headerBottom = Math.max(0, Math.ceil(document.querySelector('.about-header')?.getBoundingClientRect().bottom || 0));
  canvas.parentElement.style.setProperty('--about-viewport-top', `${headerBottom}px`);
  canvas.parentElement.style.setProperty('--about-scene-top', `${document.body.dataset.headerLayout === 'legacy' && !centerOnViewport ? headerBottom : 0}px`);
  const width = canvas.clientWidth || window.innerWidth, height = canvas.clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  updateZoomLimit();
}
function frameBesideSettings(deltaSeconds, drawer) {
  const bounds = canvas.getBoundingClientRect();
  const width = bounds.width, height = bounds.height;
  if (!width || !height) return;
  let targetOffset = 0;
  if (drawer && !drawer.classList.contains('is-closed')) {
    // Notes fits its rim-mounted controls into this same available area.
    const drawerLeft = drawer.offsetLeft + (drawer.offsetParent?.getBoundingClientRect().left || 0);
    const freeWidth = THREE.MathUtils.clamp(drawerLeft - bounds.left, 0, width);
    targetOffset = (width - freeWidth) * .5;
  }
  settingsViewOffset = reducedMotion ? targetOffset :
    THREE.MathUtils.damp(settingsViewOffset, targetOffset, 10, deltaSeconds);
  if (Math.abs(settingsViewOffset - targetOffset) < .05) settingsViewOffset = targetOffset;
  const shift = `${settingsViewOffset}px`;
  if (canvas.parentElement.style.getPropertyValue('--notes-settings-shift') !== shift)
    canvas.parentElement.style.setProperty('--notes-settings-shift', shift);
  const notesLayout = faces.get('notes').frameLayout({bounds, availableRight: width - 2 * settingsViewOffset});
  const aboutLayout = faces.get('about').frameLayout({bounds, availableRight: width - 2 * settingsViewOffset});
  const skillsLayout = faces.get('skills').frameLayout({bounds, availableRight: width - 2 * settingsViewOffset});
  const viewOffset = centerOnViewport ? 0 : skillsLayout?.offset ?? notesLayout?.offset ?? settingsViewOffset, zoom = notesLayout?.zoom ?? skillsLayout?.zoom ?? aboutLayout?.zoom ?? 1;
  const nextClearance = skillsLayout?.launchClearance ?? 0;
  const zoomChanged = Math.abs(camera.zoom - zoom) > .00001;
  if (zoomChanged) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
  if (Math.abs(launchClearance-nextClearance) > .00001 || zoomChanged) {
    const previousDistance = camera.position.distanceTo(controls.target);
    const entering = !launchClearance && nextClearance > 0;
    const exiting = launchClearance > 0 && !nextClearance;
    launchClearance = nextClearance;
    updateZoomLimit();
    if (entering && previousDistance < controls.minDistance - .001) {
      orbitRestoreDistance = previousDistance;
      orbitPushedDistance = camera.position.distanceTo(controls.target);
    }
    if (exiting) {
      const currentDistance = camera.position.distanceTo(controls.target);
      if (orbitRestoreDistance !== null && Math.abs(currentDistance-orbitPushedDistance) < .06) {
        camera.position.sub(controls.target).setLength(Math.max(controls.minDistance,orbitRestoreDistance)).add(controls.target);
        controls.update();
      }
      orbitRestoreDistance = orbitPushedDistance = null;
    }
  }
  if (viewOffset === 0) {
    if (camera.view?.enabled) camera.clearViewOffset();
  } else if (!camera.view?.enabled || Math.abs(camera.view.offsetX - viewOffset) > .01 ||
      camera.view.fullWidth !== width || camera.view.fullHeight !== height) {
    camera.setViewOffset(width, height, viewOffset, 0, width, height);
  }
}
function updateZoomLimit() {
  if (!rotationEnvelope) return;
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)) / camera.zoom;
  // Keep the entire near-plane rectangle outside the rotation envelope.
  const nearCorner = camera.near * Math.sqrt(1 + tangent * tangent * (1 + camera.aspect * camera.aspect));
  controls.minDistance = rotationEnvelope + nearCorner + .025 + launchClearance;
  controls.update();
}
function frameModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = model.position.clone();
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const inverse = model.matrixWorld.clone().invert(), point = new THREE.Vector3(), matrix = new THREE.Matrix4();
  rotationEnvelope = 0;
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    matrix.multiplyMatrices(inverse, mesh.matrixWorld);
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      rotationEnvelope = Math.max(rotationEnvelope, point.length());
    }
  });
  // Covers the full carriage travel as well as every original static vertex.
  rotationEnvelope += .08;
  const halfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov * .5)) * Math.min(1, camera.aspect));
  const distance = Math.max(radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 2.25,
    rotationEnvelope / Math.sin(halfFov) * 1.06);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0.88, 0.48, 1).normalize().multiplyScalar(distance));
  controls.maxDistance = distance * 1.85;
  updateZoomLimit();
  controls.update();
}
function disposeModel(model) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  model?.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  const images = new Set();
  textures.forEach(texture => { const image = texture.source?.data || texture.image; if (image?.close) images.add(image); texture.dispose(); });
  images.forEach(image => image.close());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}
function showFallback() {
  if (disposed) return;
  failed3D = true;
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  faces.suspend();
  canvas.hidden = true;
  document.getElementById('about-fallback').hidden = false;
  document.body.classList.add('about-2d-fallback');
  status.classList.add('is-hidden');
  faces.detach();
}
async function loadCube() {
  let gltf;
  try {
    const metadataUrl = cubeAssets.metadata;
    const modelUrl = cubeAssets.model;
    const response = await fetch(metadataUrl, { signal: assetAbort.signal });
    if (!response.ok) throw new Error(`Skills metadata HTTP ${response.status}`);
    const manifest = await response.json();
    if (disposed) return;
    gltf = await new GLTFLoader().loadAsync(modelUrl.href);
    if (disposed) { disposeModel(gltf.scene); return; }
    cube = gltf.scene;
    apertureCorrection = circularizeCubeApertures(cube);
    collectCubeShellMeshes(cube);
    document.body.dataset.hasGlb = 'true';
    targetCubeQuaternion.copy(cube.quaternion);
    prepareArrowGeometries(cube);
    scene.add(cube);
    appearance=bindAboutAppearance(cube,[ambient,key,fill]);
    frameModel(cube);
    faces.attach({cube, gltf, manifest, renderer, camera, controls, canvas});
    const assembly = faces.get('skills').assembly;
    // Include each skill card's orientation, Clicked morph, ripple and configured juts.
    for (const panel of assembly.motion.panels.values()) {
      rotationEnvelope = Math.max(rotationEnvelope, panel.center.clone().add(assembly.rig.lift).length() + panel.radius);
    }
    updateZoomLimit();
    faces.applySettings(getSharedSettings().get());
    targetCubeQuaternion.copy(alignedCubeQuaternion(cube.quaternion, camera.getWorldQuaternion(new THREE.Quaternion())));
    status.classList.add('is-hidden');
  } catch (error) {
    if (disposed || error?.name === 'AbortError') { if (gltf?.scene && gltf.scene !== cube) disposeModel(gltf.scene); return; }
    console.warn('[about] cube faces unavailable; showing text view.', error);
    faces.detach();
    appearance?.dispose();appearance=null;
    if (cube) { scene.remove(cube); disposeModel(cube); cube = null; }
    showFallback();
  }
}
void loadCube();
window.addEventListener('resize', resize, { signal: input.signal });
window.addEventListener('site:header-layout-change', resize, { signal: input.signal });
const headerObserver = new ResizeObserver(resize);
headerObserver.observe(document.querySelector('.about-header'));
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault(), { signal: input.signal });
resize();
function render() {
  frameId = 0;
  if (disposed || suspended || failed3D || document.hidden) return;
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  frameDeltaSeconds = deltaSeconds;
  const settingsDrawer = document.querySelector('.review-panel--right');
  if (cube) {
    if (faceSnap && !rotatePointer && alignAt !== null && now >= alignAt) {
      alignAt = null;
      aligning = true;
      targetCubeQuaternion.copy(alignedCubeQuaternion(cube.quaternion, camera.getWorldQuaternion(new THREE.Quaternion())));
    }
    // Drag follow-through stays responsive; face alignment is deliberately slower.
    const settle = reducedMotion ? 1 : 1 - Math.exp(-(aligning ? ALIGN_SPEED : 7) * deltaSeconds);
    if (!faces.gestureActive)
      rotateCubeAtOrbitTarget(cube, camera, controls, () => cube.quaternion.slerp(targetCubeQuaternion, settle));
    else cube.updateMatrixWorld(true);
    alignVisibleArrows();
  }
  controls.update();
  faces.update(deltaSeconds, {rotating: Boolean(rotatePointer)});
  if (activeSurfaceFocus) {
    const point = activeSurfaceFocus.resolve();
    if (!point) activeSurfaceFocus = null;
    else {
      const shift = point.sub(controls.target);
      camera.position.add(shift);
      controls.target.add(shift);
      camera.updateMatrixWorld(true);
    }
  }
  frameBesideSettings(deltaSeconds, settingsDrawer);
  renderer.info.reset();
  renderer.render(scene, camera);
  faces.afterRender({drawer: settingsDrawer});
  if (!document.hidden && !failed3D) frameId = requestAnimationFrame(render);
}
function suspend() {
  if (suspended || disposed) return;
  suspended = true;
  faces.suspend();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  stopCubeRotation();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function resume() {
  if (!suspended || disposed) return;
  suspended = false;
  faces.resume();
  if (document.hidden || failed3D) return;
  lastFrameTime = performance.now();
  frameId = requestAnimationFrame(render);
}
function dispose() {
  if (disposed) return;
  disposed = true;
  assetAbort.abort();
  unsubscribeSettings?.();
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  rotatePointer = null;
  input.abort();
  headerObserver.disconnect();
  mouseControls?.dispose();
  controls.dispose();
  faces.dispose();
  appearance?.dispose();appearance=null;
  delete window.__aboutSkillsReview;
  disposeModel(cube);
  cube = null;
  shellMeshes.length = 0;
  arrowGeometries.length = 0;
  renderer.dispose();
  stopPerformanceTracking();
}
if (!document.hidden) frameId = requestAnimationFrame(render);
return { suspend, resume, dispose };
}
void bootstrapPage({ pageId: 'about', mount: mountAbout }).catch(error => console.error('Shared bootstrap failed', error));
