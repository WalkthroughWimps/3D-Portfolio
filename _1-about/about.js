import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { assetUrl } from '../_7-shared-scripts/assets-config.js';
import { applyStandardGlbMouseControlMode, installStandardGlbMouseControls } from '../_7-shared-scripts/shared-glb-mouse-controls.js';

const canvas = document.getElementById('about-cube');
const status = document.getElementById('cube-status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
camera.up.set(0, 1, 0); // Vertical cube faces keep their arrow's local up at screen up.
const controls = new OrbitControls(camera, renderer.domElement);
applyStandardGlbMouseControlMode(controls, { enabled: true, allowRotate: true, allowZoom: true });
controls.enableRotate = false;
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.rotateSpeed = 0.2;
controls.zoomSpeed = 0.55;
// Top and bottom faces have no unambiguous 2D "up", so keep them out of normal use.
controls.minPolarAngle = Math.PI * 0.18;
controls.maxPolarAngle = Math.PI * 0.82;
installStandardGlbMouseControls({ controls, domElement: renderer.domElement });
scene.add(new THREE.HemisphereLight(0xffeee4, 0x17131d, 1.8));
const key = new THREE.DirectionalLight(0xffffff, 2.1); key.position.set(4, 6, 5); scene.add(key);
const fill = new THREE.DirectionalLight(0xc4d5ff, 0.75); fill.position.set(-5, 1, -4); scene.add(fill);
let cube = null;
let lastFrameTime = performance.now();
let frameDeltaSeconds = 0;
const targetCubeQuaternion = new THREE.Quaternion();
const arrowGeometries = [];
let rotatePointer = null;

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
    const horizontalFace = Math.abs(normal.y) > 0.7;
    const speed = horizontalFace ? 1.15 : 11;
    const blend = 1 - Math.exp(-speed * frameDeltaSeconds);
    const difference = Math.atan2(Math.sin(targetAngle - arrow.angle), Math.cos(targetAngle - arrow.angle));
    arrow.angle += difference * blend;
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

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 2 || !cube) return;
  event.preventDefault();
  rotatePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (!rotatePointer || event.pointerId !== rotatePointer.id) return;
  const dx = THREE.MathUtils.clamp(event.clientX - rotatePointer.x, -22, 22);
  const dy = THREE.MathUtils.clamp(event.clientY - rotatePointer.y, -22, 22);
  rotatePointer.x = event.clientX;
  rotatePointer.y = event.clientY;
  // Capped deltas keep even an abrupt pointer event comfortably below a fast spin.
  // Trackball-like world-axis turns make horizontal and vertical RMB drags equally effective.
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * 0.0045);
  const cameraRight = new THREE.Vector3().crossVectors(camera.getWorldDirection(new THREE.Vector3()), camera.up).normalize();
  const pitch = new THREE.Quaternion().setFromAxisAngle(cameraRight, dy * 0.0035);
  targetCubeQuaternion.premultiply(yaw).premultiply(pitch).normalize();
});
function stopCubeRotation(event) {
  if (!rotatePointer || event.pointerId !== rotatePointer.id) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  rotatePointer = null;
}
canvas.addEventListener('pointerup', stopCubeRotation);
canvas.addEventListener('pointercancel', stopCubeRotation);

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
function frameModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
  const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 2.25;
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0.88, 0.48, 1).normalize().multiplyScalar(distance));
  controls.minDistance = distance * 0.68;
  controls.maxDistance = distance * 1.85;
  controls.update();
}
new GLTFLoader().load(assetUrl('../assets/glb/tester-cube.glb'), (gltf) => {
  cube = gltf.scene;
  targetCubeQuaternion.copy(cube.quaternion);
  prepareArrowGeometries(cube);
  scene.add(cube);
  frameModel(cube);
  status.classList.add('is-hidden');
}, undefined, () => {
  canvas.hidden = true;
  document.getElementById('about-fallback').hidden = false;
  document.body.classList.add('about-2d-fallback');
  status.classList.add('is-hidden');
});
window.addEventListener('resize', resize);
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
resize();
function render() {
  const now = performance.now();
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;
  frameDeltaSeconds = deltaSeconds;
  if (cube) {
    // Approach the target rather than jumping to it: movement settles softly after RMB release.
    const settle = 1 - Math.exp(-7 * deltaSeconds);
    cube.quaternion.slerp(targetCubeQuaternion, settle);
    alignVisibleArrows();
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}
render();
