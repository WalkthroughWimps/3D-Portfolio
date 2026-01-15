// graphics.js - minimal GLB preview for the graphics page
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { assetUrl, corsProbe, isLocalDev } from './assets-config.js';

const MODEL_PATH = assetUrl('glb/card-test.glb');
THREE.DefaultLoadingManager.setURLModifier((url) => assetUrl(url));

const canvas = document.createElement('canvas');
canvas.className = 'graphics-gl';
canvas.setAttribute('aria-hidden', 'true');
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.enableZoom = true;
controls.zoomSpeed = 0.9;
controls.rotateSpeed = 0.7;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.NONE
};
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
}

function animateCameraState(fromState, toState, duration = 10000) {
  const startPos = fromState.pos.clone();
  const startTarget = fromState.target.clone();
  const endPos = toState.pos.clone();
  const endTarget = toState.target.clone();
  const startTime = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(startPos, endPos, eased);
    controls.target.lerpVectors(startTarget, endTarget, eased);
    camera.lookAt(controls.target);
    updateCameraInfo();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
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
}

function scaleCamera(amount) {
  const dir = controls.target.clone().sub(camera.position).normalize();
  camera.position.addScaledVector(dir, amount);
  camera.lookAt(controls.target);
  updateCameraInfo();
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

if (manualControls) {
  manualControls.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const step = parseFloat(btn.dataset.step) || 0.4;
    handleManual(btn.dataset.action, step);
    updateCameraInfo();
  });
  manualControls.addEventListener('contextmenu', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    ev.preventDefault();
    const step = parseFloat(btn.dataset.precisionStep) || (parseFloat(btn.dataset.step) || 0.4) * 0.35;
    handleManual(btn.dataset.action, step);
    updateCameraInfo();
  });
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', onResize);

const loader = new GLTFLoader();
loader.setCrossOrigin('anonymous');
loader.load(
  MODEL_PATH,
  (gltf) => {
    model = gltf.scene;
    scene.add(model);
    fitCameraToObject(model);
    setCameraState(initialState);
    setTimeout(() => animateCameraState(initialState, greenState, 1000), 200);
  },
  undefined,
  (err) => {
    console.warn('GLTF LOAD FAILED:', MODEL_PATH, err);
  }
);
if (isLocalDev() || new URLSearchParams(window.location.search || '').has('assetsDebug')) {
  corsProbe('glb/card-test.glb');
}

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
