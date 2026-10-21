import { bootstrapPage } from '../_7-shared-scripts/core/bootstrap.js';
import { getSharedSettings } from '../_7-shared-scripts/core/settings.js';
import { createDemandRenderLoop } from '../_7-shared-scripts/scene/demand-render-loop.js';
// graphics.js - minimal GLB preview for the graphics page
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { assetUrl, corsProbe, isLocalDev } from '../_7-shared-scripts/assets-config.js';
import { applyStandardGlbMouseControlMode } from '../_7-shared-scripts/shared-glb-mouse-controls.js';

const MODEL_PATH = assetUrl('../assets/glb/card-test.glb');
THREE.DefaultLoadingManager.setURLModifier((url) => assetUrl(url));

function mountGraphicsPreview() {
const canvas = document.createElement('canvas');
canvas.className = 'graphics-gl';
canvas.setAttribute('aria-hidden', 'true');
document.body.appendChild(canvas);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (error) {
  canvas.remove();
  console.warn('Graphics preview unavailable; text and links remain available.', error);
  void bootstrapPage({ pageId: 'graphics' }).catch(error => console.error('Shared bootstrap failed', error));
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch  { /* ignore */ }

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const controls = new OrbitControls(camera, renderer.domElement);
let disposed = false;
let cameraFrame = 0;
let cameraDelay = 0;
function disposeModel(root) {
  root?.traverse(object => {
    object.geometry?.dispose?.();
    for (const material of [object.material].flat().filter(Boolean)) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose?.();
    }
  });
}
const renderLoop = createDemandRenderLoop({ draw() {
  controls.update();
  renderer.render(scene, camera);
} });
controls.addEventListener('change', renderLoop.invalidate);
void bootstrapPage({ pageId: 'graphics', mount: ({ scope }) => {
  scope.defer(() => {
    disposed = true;
    if (cameraFrame) cancelAnimationFrame(cameraFrame);
    if (cameraDelay) clearTimeout(cameraDelay);
    window.removeEventListener('resize', onResize);
    manualControls?.removeEventListener('click', onManualClick);
    manualControls?.removeEventListener('contextmenu', onManualContextMenu);
    controls.removeEventListener('change', renderLoop.invalidate);
    renderLoop.dispose();
    controls.dispose();
    disposeModel(model);
    renderer.dispose();
    canvas.remove();
  });
} }).catch(error => console.error('Shared bootstrap failed', error));
controls.enableDamping = true;
applyStandardGlbMouseControlMode(controls, { enabled: true, allowRotate: true, allowZoom: true });
controls.zoomSpeed = 0.9;
controls.rotateSpeed = 0.7;
controls.touches = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN
};
renderer.domElement.oncontextmenu = (ev) => {
  ev.preventDefault();
};

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.85);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(3, 4, 6);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.45);
fill.position.set(-4, 2, -3);
scene.add(fill);

let model = null;

const initialState = {
  pos: new THREE.Vector3(-1.64, -1.17, 13.43),
  target: new THREE.Vector3(-1.64, -1.17, 6.41)
};
const greenState = {
  pos: new THREE.Vector3(-3.89, -0.47, 7.89),
  target: new THREE.Vector3(-3.89, -0.47, 6.41)
};

function setCameraState(state) {
  camera.position.copy(state.pos);
  controls.target.copy(state.target);
  camera.lookAt(state.target);
  updateCameraInfo();
  renderLoop.invalidate();
}

function animateCameraState(fromState, toState, duration = 10000) {
  const startPos = fromState.pos.clone();
  const startTarget = fromState.target.clone();
  const endPos = toState.pos.clone();
  const endTarget = toState.target.clone();
  const startTime = performance.now();
  const step = (now) => {
    if (disposed) return;
    const t = getSharedSettings().get().accessibility.reducedMotion
      ? 1 : Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(startPos, endPos, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    camera.lookAt(controls.target);
    updateCameraInfo();
    renderLoop.invalidate();
    if (t < 1) cameraFrame = requestAnimationFrame(step);
    else cameraFrame = 0;
  };
  if (cameraFrame) cancelAnimationFrame(cameraFrame);
  cameraFrame = requestAnimationFrame(step);
}

function fitCameraToObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera.fov * (Math.PI / 180);
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  camera.position.set(center.x, center.y, center.z + distance * 1.2);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  updateCameraInfo();
  renderLoop.invalidate();
}

const manualControls = document.getElementById('manual-controls');
const infoPanel = document.getElementById('camera-info');

function moveCamera(dx, dy) {
  const dir = controls.target.clone().sub(camera.position).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(dir, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  camera.position.addScaledVector(right, dx).addScaledVector(up, dy);
  controls.target.addScaledVector(right, dx).addScaledVector(up, dy);
  camera.lookAt(controls.target);
  updateCameraInfo();
  renderLoop.invalidate();
}

function scaleCamera(amount) {
  const dir = controls.target.clone().sub(camera.position).normalize();
  camera.position.addScaledVector(dir, amount);
  camera.lookAt(controls.target);
  updateCameraInfo();
  renderLoop.invalidate();
}

function handleManual(action, amount) {
  switch (action) {
    case 'left': moveCamera(-amount, 0); break;
    case 'right': moveCamera(amount, 0); break;
    case 'up': moveCamera(0, amount); break;
    case 'down': moveCamera(0, -amount); break;
    case 'scale-in': scaleCamera(-Math.abs(amount)); break;
    case 'scale-out': scaleCamera(Math.abs(amount)); break;
    default: break;
  }
}

function updateCameraInfo() {
  if (!infoPanel) return;
  const pos = camera.position;
  const target = controls.target;
  const distance = pos.distanceTo(target);
  infoPanel.textContent = `pos ${pos.x.toFixed(2)},${pos.y.toFixed(2)},${pos.z.toFixed(2)}\ntgt ${target.x.toFixed(2)},${target.y.toFixed(2)},${target.z.toFixed(2)} dist ${distance.toFixed(2)}`;
}

function onManualClick(ev) {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const step = parseFloat(btn.dataset.step) || 0.4;
  handleManual(btn.dataset.action, step);
  updateCameraInfo();
}
function onManualContextMenu(ev) {
  const btn = ev.target.closest('button');
  if (!btn) return;
  ev.preventDefault();
  const step = parseFloat(btn.dataset.precisionStep) || (parseFloat(btn.dataset.step) || 0.4) * 0.35;
  handleManual(btn.dataset.action, step);
  updateCameraInfo();
}
if (manualControls) {
  manualControls.addEventListener('click', onManualClick);
  manualControls.addEventListener('contextmenu', onManualContextMenu);
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderLoop.invalidate();
}

window.addEventListener('resize', onResize);

const loader = new GLTFLoader();
loader.setCrossOrigin('anonymous');
loader.load(
  MODEL_PATH,
  (gltf) => {
    if (disposed) { disposeModel(gltf.scene); return; }
    model = gltf.scene;
    scene.add(model);
    fitCameraToObject(model);
    setCameraState(initialState);
    cameraDelay = setTimeout(() => {
      cameraDelay = 0;
      if (!disposed) animateCameraState(initialState, greenState, 1000);
    }, 200);
  },
  undefined,
  (err) => {
    console.warn('GLTF LOAD FAILED:', MODEL_PATH, err);
  }
);
if (isLocalDev() || new URLSearchParams(window.location.search || '').has('assetsDebug')) {
corsProbe('../assets/glb/card-test.glb');
}

renderLoop.invalidate();
}
mountGraphicsPreview();
