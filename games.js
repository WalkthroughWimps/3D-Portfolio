import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import VideoPlayer from './video-player-controls.js';
import { GAME_LIST, VIDEO_LIST, getMenuAction, getMenuRects } from './games-layout.js';

const STAGE_ID = 'model-stage';
const GLB_URL = './glb/Arcade-Console.glb';
const SCREEN_MESH_CANDIDATES = ['arcade_screen_surface', 'arcade_screen'];

const VIDEO_SRC = './Videos/games-page/Video-Games-Reel_hq.webm';
const SPEED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_GAME_URL = './games/battleship/index.html';
const GAME_RENDER_MODE = 'blit'; // 'overlay', 'blit', or 'css3d'
const GAME_FRAME_WIDTH = 1280;
const GAME_FRAME_HEIGHT = 720;
const GAME_FRAME_ASPECT = GAME_FRAME_WIDTH / GAME_FRAME_HEIGHT;
const DEBUG_SHOW_CSS3D_FRAME = true;
const GAME_SPLASH_DURATION_MS = 3000;
const GAME_SPLASH_FAST_PORTION = 0.78; // progress quickly then slow near the end
const DEFAULT_CAMERA = {
  pos: new THREE.Vector3(2.522, 3.349, -1.264),
  rot: new THREE.Euler(
    THREE.MathUtils.degToRad(-120.8),
    THREE.MathUtils.degToRad(45.2),
    THREE.MathUtils.degToRad(130.0),
    'XYZ'
  ),
  quat: new THREE.Quaternion(-0.167, 0.808, 0.272, 0.496),
  fov: 22.9
};
const START_CAMERA = {
  pos: new THREE.Vector3(1207.545, 819.927, -1166.235),
  rot: new THREE.Euler(
    THREE.MathUtils.degToRad(-144.9),
    THREE.MathUtils.degToRad(40.3),
    THREE.MathUtils.degToRad(155.6),
    'XYZ'
  ),
  quat: new THREE.Quaternion(-0.088, 0.897, 0.207, 0.381),
  fov: 22.9
};

// Display/input correction toggles for the screen mesh UVs.
const DISPLAY_FLIP_U = true;
const DISPLAY_FLIP_V = false;
const INPUT_FLIP_U = true;
const INPUT_FLIP_V = true;


let renderer;
let cssRenderer;
let cssScene;
let scene;
let activeCamera;
let fallbackCamera;
let controls;
let cabinetRoot = null;
let screenMesh = null;
let screenCenter = new THREE.Vector3();
let screenSizeLocal = null;
let screenCenterLocal = null;

let screenCanvas = null;
let screenCtx = null;
let screenTexture = null;

let player = null;
let playerVideo = null;
let videoReady = false;
let reelVideo = null;
let reelReady = false;
let reelSource = '';

let gameContainer = null;
let gameIframe = null;
let gameCanvas = null;
let gameReady = false;
let gameFocusPending = false;
let gamePointerDown = false;
let gamePointerButton = 0;
let lastGameCanvas = null;
let lastGameCanvasSize = '';
let loggedCanvasAttach = false;
let loggedCanvasLoss = false;
let loggedDrawError = false;
let loggedDrawSuccess = false;
let cssGameObject = null;
let cssGameElement = null;
let cssGameActive = false;
let exitControl = null;
let lastGameCanvasByUrl = new Map();
let overlayContainer = null;
let overlayActive = false;
let overlayRect = null;
let splashRafId = null;
let splashPlayBtn = null;
let splashProgressFill = null;
let screenMeshWasVisible = true;
let cameraPanelInputBtn = null;
let gameInputEnabled = true;
const DEBUG_ALLOW_CONTROLS_WITH_GAMES = true;
let splashActive = false;
let splashStart = 0;
let splashReady = false;
let splashPlayRect = null;
let splashImage = null;

let contentRect = null;
let contentMode = 'menu';

let raycaster;
let pointerNDC;
let pointerCaptured = false;
let lastScreenHit = null;

let letterboxColor = getCssVar('--secondary-color', '#4b1b74');
let speedIndex = SPEED_RATES.indexOf(1);
let needsRedraw = true;

let cameraPanel = null;
let cameraPanelText = null;
let cameraPanelZoomBtn = null;
let cameraZoomAlt = false;
let cameraZoomUserEnabled = false;
let previousCameraZoomAlt = false;
let autoZoomActive = false;

let introStart = null;
const INTRO_DURATION_MS = 3000;
let introActive = false;
const introFromPos = new THREE.Vector3();
const introToPos = new THREE.Vector3();
const introFromQuat = new THREE.Quaternion();
const introToQuat = new THREE.Quaternion();


const stage = document.getElementById(STAGE_ID);
if (!stage) throw new Error(`Missing #${STAGE_ID} container`);

init();
loadCabinet();
animate();

function init() {
  scene = new THREE.Scene();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0); // transparent background behind cabinet
  renderer.domElement.tabIndex = 0;
  renderer.domElement.style.background = 'transparent';
  const glCanvas = renderer.domElement;
  glCanvas.id = 'glCanvas';
  glCanvas.style.position = 'absolute';
  glCanvas.style.top = '0';
  glCanvas.style.left = '0';
  glCanvas.style.width = '100%';
  glCanvas.style.height = '100%';
  glCanvas.style.zIndex = '5';
  glCanvas.style.pointerEvents = 'auto';
  stage.appendChild(renderer.domElement);

  ensureOverlayContainer();

  cssScene = new THREE.Scene();
  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(stage.clientWidth, stage.clientHeight);
  cssRenderer.domElement.id = 'css3dLayer';
  cssRenderer.domElement.style.position = 'absolute';
  cssRenderer.domElement.style.top = '0';
  cssRenderer.domElement.style.left = '0';
  cssRenderer.domElement.style.width = '100%';
  cssRenderer.domElement.style.height = '100%';
  cssRenderer.domElement.style.zIndex = '10';
  cssRenderer.domElement.style.pointerEvents = 'auto'; // allow iframe clicks when needed
  cssRenderer.domElement.style.background = 'transparent';
  cssRenderer.domElement.style.overflow = 'visible';
  cssRenderer.domElement.style.transformStyle = 'preserve-3d';
  stage.appendChild(cssRenderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 1.0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.25);
  dir.position.set(3, 6, 4);
  scene.add(dir);

  fallbackCamera = new THREE.PerspectiveCamera(
    45,
    stage.clientWidth / stage.clientHeight,
    0.01,
    200
  );
  fallbackCamera.position.set(0, 1.4, 2.8);
  activeCamera = fallbackCamera;

  controls = new OrbitControls(activeCamera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.target.set(0, 1.1, 0);

  raycaster = new THREE.Raycaster();
  pointerNDC = new THREE.Vector2();

  letterboxColor = getCssVar('--secondary-color', letterboxColor);

  initStageBounds();

  initCameraPanel();
  updateControlsForContent(contentMode);

  renderer.domElement.addEventListener('pointermove', handlePointerMove, { capture: true });
  renderer.domElement.addEventListener('pointerdown', handlePointerDown, { capture: true });
  renderer.domElement.addEventListener('pointerup', handlePointerUp, { capture: true });
  renderer.domElement.addEventListener('pointercancel', handlePointerUp, { capture: true });
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', handleKeyDown, { capture: true });
}

function initStageBounds() {
  updateStageBounds();
  const header = document.getElementById('patterned-background');
  if (header && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(() => updateStageBounds());
    ro.observe(header);
  }
}

function updateStageBounds() {
  const header = document.getElementById('patterned-background');
  if (!header || !stage) return;
  const rect = header.getBoundingClientRect();
  const top = Math.max(0, Math.round(rect.bottom));
  stage.style.position = 'fixed';
  stage.style.top = `${top}px`;
  stage.style.left = '0';
  stage.style.right = '0';
  stage.style.bottom = '0';
  stage.style.width = '100%';
  stage.style.height = `calc(100vh - ${top}px)`;
  stage.style.maxWidth = '100vw';
  stage.style.maxHeight = `calc(100vh - ${top}px)`;
  stage.style.overflow = 'visible';
  onResize();
}

function initCameraPanel() {
  cameraPanel = document.createElement('div');
  cameraPanel.className = 'camera-panel';

  cameraPanelText = document.createElement('div');
  cameraPanel.appendChild(cameraPanelText);

  cameraPanelZoomBtn = document.createElement('button');
  cameraPanelZoomBtn.type = 'button';
  cameraPanelZoomBtn.textContent = 'Zoom (dummy)';
  cameraPanelZoomBtn.addEventListener('click', () => {
    toggleCameraZoom();
  });
  cameraPanel.appendChild(cameraPanelZoomBtn);

  cameraPanelInputBtn = document.createElement('button');
  cameraPanelInputBtn.type = 'button';
  cameraPanelInputBtn.textContent = 'Game input: on';
  cameraPanelInputBtn.addEventListener('click', () => {
    setGameInputEnabled(!gameInputEnabled);
  });
  cameraPanel.appendChild(cameraPanelInputBtn);

  document.body.appendChild(cameraPanel);
}

function toggleCameraZoom() {
  if (!activeCamera) return;
  applyCameraMode(!cameraZoomAlt);
  cameraZoomUserEnabled = cameraZoomAlt;
}

function onResize() {
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  cssRenderer.setSize(stage.clientWidth, stage.clientHeight);
  if (activeCamera && activeCamera.isPerspectiveCamera) {
    activeCamera.aspect = stage.clientWidth / stage.clientHeight;
    activeCamera.updateProjectionMatrix();
  }
}

function loadCabinet() {
  const loader = new GLTFLoader();

  loader.load(
    GLB_URL,
    (gltf) => {
      cabinetRoot = gltf.scene;
      scene.add(cabinetRoot);

      const box = new THREE.Box3().setFromObject(cabinetRoot);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      controls.target.copy(center);

      if (gltf.cameras && gltf.cameras.length > 0) {
        activeCamera = gltf.cameras[0];
        if (!activeCamera.parent) scene.add(activeCamera);
        if (activeCamera.isPerspectiveCamera) {
          activeCamera.aspect = stage.clientWidth / stage.clientHeight;
          activeCamera.updateProjectionMatrix();
        }
        controls.dispose();
        controls = new OrbitControls(activeCamera, renderer.domElement);
        controls.enableDamping = true;
        controls.target.copy(center);
        updateControlsForContent(contentMode);
        console.log('Using GLB camera:', activeCamera.name || '(unnamed)');
      } else {
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 2.2;
        fallbackCamera.position.copy(center).add(new THREE.Vector3(0, maxDim * 0.15, dist));
        fallbackCamera.lookAt(center);
        activeCamera = fallbackCamera;
        controls.target.copy(center);
        console.log('No GLB camera found; using fallback camera.');
      }

      screenMesh = findScreenMesh(cabinetRoot);
      console.log('screen mesh:', screenMesh);
      if (!screenMesh || !screenMesh.isMesh) {
        console.warn('No arcade screen mesh found.');
        return;
      }

      applyDefaultCameraTransform();
      startIntroAnimation();

      setupScreenCanvas(screenMesh);
      setupMenu();

    },
    (xhr) => {
      const p = xhr.total ? (xhr.loaded / xhr.total) * 100 : 0;
      if (p) console.log(`Loading GLB... ${p.toFixed(1)}%`);
    },
    (err) => {
      console.error('Failed to load GLB:', err);
    }
  );
}

function findScreenMesh(root) {
  for (const name of SCREEN_MESH_CANDIDATES) {
    const found = root.getObjectByName(name);
    if (found && found.isMesh) return found;
  }
  let fallback = null;
  root.traverse((node) => {
    if (!fallback && node.isMesh && typeof node.name === 'string' && node.name.toLowerCase().includes('screen')) {
      fallback = node;
    }
  });
  return fallback;
}

function setupScreenCanvas(mesh) {
  mesh.geometry.computeBoundingBox();
  const bbox = mesh.geometry.boundingBox;
  const size = bbox.getSize(new THREE.Vector3());
  const center = bbox.getCenter(new THREE.Vector3());
  const aspect = size.y > 0 ? size.x / size.y : 16 / 9;
  screenSizeLocal = size.clone();
  screenCenterLocal = center.clone();

  const base = 2048;
  const w = aspect >= 1 ? base : Math.round(base * aspect);
  const h = aspect >= 1 ? Math.round(base / aspect) : base;

  screenCanvas = document.createElement('canvas');
  screenCanvas.width = w;
  screenCanvas.height = h;
  screenCanvas.style.position = 'fixed';
  screenCanvas.style.left = '-10000px';
  screenCanvas.style.top = '-10000px';
  screenCanvas.style.width = `${w}px`;
  screenCanvas.style.height = `${h}px`;
  document.body.appendChild(screenCanvas);

  screenCtx = screenCanvas.getContext('2d');

  screenTexture = new THREE.CanvasTexture(screenCanvas);
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.flipY = false;
  screenTexture.wrapS = THREE.RepeatWrapping;
  screenTexture.wrapT = THREE.RepeatWrapping;
  screenTexture.repeat.set(DISPLAY_FLIP_U ? -1 : 1, DISPLAY_FLIP_V ? -1 : 1);
  screenTexture.offset.set(DISPLAY_FLIP_U ? 1 : 0, DISPLAY_FLIP_V ? 1 : 0);

  const mat = new THREE.MeshBasicMaterial({
    map: screenTexture,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide
  });
  mat.toneMapped = false;
  mat.depthWrite = false;
  mesh.material = mat;
  mesh.renderOrder = 10;

  drawScreen();
}

function applyDefaultCameraTransform() {
  if (!activeCamera) return;
  activeCamera.position.copy(DEFAULT_CAMERA.pos);
  if (DEFAULT_CAMERA.rot) {
    activeCamera.rotation.copy(DEFAULT_CAMERA.rot);
    activeCamera.quaternion.setFromEuler(activeCamera.rotation);
  } else {
    activeCamera.quaternion.copy(DEFAULT_CAMERA.quat);
  }
  if (activeCamera.isPerspectiveCamera && typeof DEFAULT_CAMERA.fov === 'number') {
    activeCamera.fov = DEFAULT_CAMERA.fov;
    activeCamera.updateProjectionMatrix();
  }
}

function applyAlternateCameraTransform() {
  if (!activeCamera) return;
  activeCamera.position.set(1.092, 0.821, 0.001);
  activeCamera.rotation.set(
    THREE.MathUtils.degToRad(-89.7),
    THREE.MathUtils.degToRad(79.2),
    THREE.MathUtils.degToRad(89.7),
    'XYZ'
  );
  activeCamera.quaternion.setFromEuler(activeCamera.rotation);
  if (activeCamera.isPerspectiveCamera) {
    activeCamera.fov = 22.9;
    activeCamera.updateProjectionMatrix();
  }
}

function applyCameraMode(altView) {
  cameraZoomAlt = altView;
  if (cameraZoomAlt) {
    applyAlternateCameraTransform();
  } else {
    applyDefaultCameraTransform();
  }
}

function startIntroAnimation() {
  if (!activeCamera) return;
  introStart = performance.now();
  introActive = true;
  introFromPos.copy(START_CAMERA.pos);
  introToPos.copy(DEFAULT_CAMERA.pos);
  introFromQuat.copy(START_CAMERA.rot ? new THREE.Quaternion().setFromEuler(START_CAMERA.rot) : START_CAMERA.quat);
  introToQuat.copy(DEFAULT_CAMERA.rot ? new THREE.Quaternion().setFromEuler(DEFAULT_CAMERA.rot) : DEFAULT_CAMERA.quat);
  activeCamera.position.copy(introFromPos);
  activeCamera.quaternion.copy(introFromQuat);
  if (activeCamera.isPerspectiveCamera && typeof START_CAMERA.fov === 'number') {
    activeCamera.fov = START_CAMERA.fov;
    activeCamera.updateProjectionMatrix();
  }
}

function setupPlayer() {
  if (!screenCanvas) return;
  player = VideoPlayer.create(screenCanvas, {
    allowSound: true,
    controlsHideDelay: 1800,
    controlsFadeDuration: 200
  });
  player.loadVideos([VIDEO_SRC]);

  playerVideo = player.videos[0] || null;
  if (playerVideo) {
    playerVideo.crossOrigin = 'anonymous';
    playerVideo.playsInline = true;
    playerVideo.setAttribute('playsinline', '');
    playerVideo.preload = 'metadata';
    playerVideo.addEventListener('loadedmetadata', () => {
      videoReady = true;
      needsRedraw = true;
    });
    playerVideo.addEventListener('play', () => { needsRedraw = true; });
    playerVideo.addEventListener('pause', () => { needsRedraw = true; });
    playerVideo.addEventListener('ended', () => { needsRedraw = true; });
    playerVideo.playbackRate = SPEED_RATES[speedIndex];
  }
}

function setupMenu() {
  contentMode = 'menu';
  cssGameActive = false;
  if (cssGameElement) cssGameElement.innerHTML = '';
  cssRenderer.domElement.style.pointerEvents = 'none';
  renderer.domElement.style.pointerEvents = 'auto';
  setScreenMeshHidden(false);
  setExitControlVisible(false);
  restoreViewAfterContent();
  needsRedraw = true;
}

function startGame(url, renderMode = GAME_RENDER_MODE) {
  stopVideoReel();
  destroyGameIframe();
  gameReady = false;
  gameCanvas = null;
  lastGameCanvas = null;
  lastGameCanvasSize = '';
  loggedCanvasAttach = false;
  loggedCanvasLoss = false;
  loggedDrawError = false;
  loggedDrawSuccess = false;
  contentMode = 'game';
  enterContentView();
  overlayActive = false;
  cssGameActive = renderMode === 'css3d';
  if (cssGameActive) {
    ensureCssGameObject();
  } else {
    ensureGameContainer();
  }

  gameIframe = document.createElement('iframe');
  gameIframe.src = url;
  gameIframe.allow = 'fullscreen; gamepad';
  gameIframe.referrerPolicy = 'no-referrer-when-downgrade';
  gameIframe.style.border = '0';
  gameIframe.style.background = 'transparent';
  gameIframe.style.width = '100%';
  gameIframe.style.height = '100%';
  if (cssGameActive && cssGameElement) {
    cssGameElement.innerHTML = '';
    cssGameElement.appendChild(gameIframe);
  } else {
    gameIframe.style.position = 'fixed';
    gameIframe.style.left = '0';
    gameIframe.style.top = '0';
    gameIframe.style.width = '1280px';
    gameIframe.style.height = '720px';
    gameIframe.style.opacity = '1';
    gameIframe.style.pointerEvents = 'none';
    gameIframe.style.zIndex = '0';
    gameContainer.appendChild(gameIframe);
  }
  gameFocusPending = true;
  setGameInputEnabled(cssGameActive ? !DEBUG_ALLOW_CONTROLS_WITH_GAMES : false);
  setScreenMeshHidden(false);
  setExitControlVisible(true);
  showGameSplash();
}

function ensureGameContainer() {
  if (gameContainer) return;
  gameContainer = document.createElement('div');
  gameContainer.className = 'game-iframe-container';
  gameContainer.style.position = 'fixed';
  gameContainer.style.left = '0';
  gameContainer.style.top = '0';
  gameContainer.style.width = '1280px';
  gameContainer.style.height = '720px';
  gameContainer.style.opacity = '0';
  gameContainer.style.pointerEvents = 'none';
  gameContainer.style.zIndex = '-1';
  gameContainer.style.background = 'transparent';
  gameContainer.style.overflow = 'hidden';
  document.body.appendChild(gameContainer);
}

function ensureOverlayContainer() {
  if (overlayContainer) return;
  overlayContainer = document.createElement('div');
  overlayContainer.className = 'game-overlay-container';
  overlayContainer.style.position = 'fixed';
  overlayContainer.style.left = '0';
  overlayContainer.style.top = '0';
  overlayContainer.style.width = `${GAME_FRAME_WIDTH}px`;
  overlayContainer.style.height = `${GAME_FRAME_HEIGHT}px`;
  overlayContainer.style.opacity = '1';
  overlayContainer.style.pointerEvents = 'none';
  overlayContainer.style.zIndex = '3';
  overlayContainer.style.background = 'transparent';
  overlayContainer.style.overflow = 'hidden';
  overlayContainer.style.display = 'none';
  document.body.appendChild(overlayContainer);
}

function setOverlayActive(active) {
  ensureOverlayContainer();
  if (!overlayContainer) return;
  overlayContainer.style.display = active ? 'block' : 'none';
  overlayContainer.style.pointerEvents = active ? 'auto' : 'none';
  renderer.domElement.style.pointerEvents = active ? 'none' : 'auto';
}

function ensureCssGameObject() {
  if (cssGameObject) return;
  cssGameElement = document.createElement('div');
  cssGameElement.style.width = `${GAME_FRAME_WIDTH}px`;
  cssGameElement.style.height = `${GAME_FRAME_HEIGHT}px`;
  cssGameElement.style.background = DEBUG_SHOW_CSS3D_FRAME ? 'rgba(255, 0, 0, 0.15)' : 'black';
  cssGameElement.style.pointerEvents = 'auto';
  cssGameElement.style.overflow = 'hidden';
  if (DEBUG_SHOW_CSS3D_FRAME) {
    cssGameElement.style.outline = '3px solid rgba(255, 0, 0, 0.7)';
    cssGameElement.style.boxShadow = '0 0 20px rgba(255, 0, 0, 0.4)';
  }
  cssGameObject = new CSS3DObject(cssGameElement);
  cssGameObject.matrixAutoUpdate = false;
  cssScene.add(cssGameObject);
}

function updateCssGameObject() {
  if (!cssGameActive || !cssGameObject || !screenMesh || !screenSizeLocal || !screenCenterLocal) return;
  screenMesh.updateWorldMatrix(true, false);
  const scaleX = screenSizeLocal.x / GAME_FRAME_WIDTH;
  const scaleY = screenSizeLocal.y / GAME_FRAME_HEIGHT;
  const centerMat = new THREE.Matrix4().makeTranslation(
    screenCenterLocal.x,
    screenCenterLocal.y,
    screenCenterLocal.z
  );
  const scaleMat = new THREE.Matrix4().makeScale(scaleX, scaleY, 1);
  cssGameObject.matrix.copy(screenMesh.matrixWorld).multiply(centerMat).multiply(scaleMat);
  cssGameObject.matrixWorldNeedsUpdate = true;
}

function setScreenMeshHidden(hidden) {
  if (!screenMesh) return;
  if (hidden) {
    screenMeshWasVisible = screenMesh.visible;
    screenMesh.visible = false;
  } else if (screenMeshWasVisible) {
    screenMesh.visible = true;
  }
}

function updateOverlayPosition() {
  if (!overlayActive || !overlayContainer || !screenMesh || !activeCamera) return;
  const rect = getScreenMeshRect();
  if (!rect) return;
  const fitted = fitRectToAspect(rect, GAME_FRAME_ASPECT);
  overlayRect = fitted;
  overlayContainer.style.left = `${fitted.x}px`;
  overlayContainer.style.top = `${fitted.y}px`;
  overlayContainer.style.width = `${fitted.w}px`;
  overlayContainer.style.height = `${fitted.h}px`;
}

function clearSplashAnimation() {
  if (splashRafId !== null) {
    cancelAnimationFrame(splashRafId);
    splashRafId = null;
  }
  splashPlayBtn = null;
  splashProgressFill = null;
}

function showGameSplash() {
  clearSplashAnimation();
  splashActive = true;
  splashReady = false;
  splashPlayRect = null;
  splashStart = performance.now();
  ensureSplashImage();
  needsRedraw = true;
}

function hideGameSplash() {
  clearSplashAnimation();
  splashActive = false;
  splashReady = false;
  splashPlayRect = null;
  needsRedraw = true;
}

function ensureSplashImage() {
  if (splashImage) return;
  splashImage = new Image();
  splashImage.decoding = 'async';
  splashImage.src = 'games/game-splash-screen.png';
}

function getSplashProgress(nowMs) {
  if (!splashActive) return 1;
  const elapsed = Math.max(0, nowMs - splashStart);
  const t = Math.min(1, elapsed / GAME_SPLASH_DURATION_MS);
  let eased;
  if (t < GAME_SPLASH_FAST_PORTION) {
    const nt = t / GAME_SPLASH_FAST_PORTION;
    eased = nt * 0.92;
  } else {
    const nt = (t - GAME_SPLASH_FAST_PORTION) / (1 - GAME_SPLASH_FAST_PORTION);
    eased = 0.92 + nt * 0.08;
  }
  if (t >= 1 && !splashReady) splashReady = true;
  return Math.min(1, eased);
}

function getScreenMeshRect() {
  const geom = screenMesh.geometry;
  if (!geom.boundingBox) geom.computeBoundingBox();
  const bbox = geom.boundingBox;
  const min = bbox.min;
  const max = bbox.max;
  const corners = [
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z)
  ];
  const canvasRect = renderer.domElement.getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of corners) {
    corner.applyMatrix4(screenMesh.matrixWorld);
    corner.project(activeCamera);
    const x = (corner.x * 0.5 + 0.5) * canvasRect.width + canvasRect.left;
    const y = (-corner.y * 0.5 + 0.5) * canvasRect.height + canvasRect.top;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

function destroyGameIframe() {
  if (gameIframe) {
    gameIframe.src = 'about:blank';
    gameIframe.remove();
  }
  gameIframe = null;
  gameCanvas = null;
  gameReady = false;
  gameFocusPending = false;
  gamePointerDown = false;
  gamePointerButton = 0;
  lastGameCanvas = null;
  lastGameCanvasSize = '';
  cssGameActive = false;
  overlayActive = false;
  if (overlayContainer) overlayContainer.innerHTML = '';
  if (cssGameElement) cssGameElement.innerHTML = '';
  cssRenderer.domElement.style.pointerEvents = 'none';
  renderer.domElement.style.pointerEvents = 'auto';
  gameInputEnabled = false;
  if (cameraPanelInputBtn) cameraPanelInputBtn.textContent = 'Game input: off';
  setOverlayActive(false);
  clearSplashAnimation();
  splashActive = false;
  splashReady = false;
  splashPlayRect = null;
  setScreenMeshHidden(false);
}

function exitGameImmediate() {
  if (!gameIframe) return;
  destroyGameIframe();
  contentMode = 'menu';
  setExitControlVisible(false);
  restoreViewAfterContent();
  needsRedraw = true;
}

function startVideoReel(src) {
  if (!screenCanvas) return;
  stopVideoReel();
  contentMode = 'video';
  reelSource = src;
  enterContentView();
  reelVideo = document.createElement('video');
  reelVideo.src = src;
  reelVideo.loop = true;
  reelVideo.playsInline = true;
  reelVideo.setAttribute('playsinline', '');
  reelVideo.preload = 'metadata';
  reelVideo.addEventListener('loadedmetadata', () => {
    reelReady = true;
    needsRedraw = true;
  });
  reelVideo.addEventListener('play', () => { needsRedraw = true; });
  reelVideo.addEventListener('pause', () => { needsRedraw = true; });
  reelVideo.addEventListener('ended', () => { needsRedraw = true; });
  reelVideo.play().catch(() => {});
  needsRedraw = true;
  setExitControlVisible(true);
}

function stopVideoReel() {
  if (!reelVideo) return;
  reelVideo.pause();
  reelVideo.removeAttribute('src');
  reelVideo.load();
  reelVideo = null;
  reelReady = false;
  reelSource = '';
  contentMode = 'menu';
  setExitControlVisible(false);
  setScreenMeshHidden(false);
  restoreViewAfterContent();
  needsRedraw = true;
}

function animate() {
  requestAnimationFrame(animate);
  if (controls && screenMesh) {
    screenMesh.getWorldPosition(screenCenter);
    controls.target.copy(screenCenter);
  }
  if (controls) controls.update();

  if (introActive && introStart !== null && activeCamera) {
    const now = performance.now();
    const t = Math.min(1, (now - introStart) / INTRO_DURATION_MS);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    activeCamera.position.lerpVectors(introFromPos, introToPos, eased);
    activeCamera.quaternion.slerpQuaternions(introFromQuat, introToQuat, eased);
    if (activeCamera.isPerspectiveCamera) {
      const fov = START_CAMERA.fov + (DEFAULT_CAMERA.fov - START_CAMERA.fov) * eased;
      activeCamera.fov = fov;
      activeCamera.updateProjectionMatrix();
    }
    if (t >= 1) {
      introActive = false;
      applyDefaultCameraTransform();
    }
  }
  if (contentMode === 'game') {
    drawScreen();
  } else if (contentMode === 'video' && reelVideo && !reelVideo.paused && !reelVideo.ended) {
    drawScreen();
  } else if (playerVideo && !playerVideo.paused && !playerVideo.ended) {
    drawScreen();
  } else if (needsRedraw || contentMode === 'menu') {
    drawScreen();
  }

  renderer.render(scene, activeCamera);
  updateCssGameObject();
  updateOverlayPosition();
  if (cssRenderer && cssScene) {
    cssRenderer.render(cssScene, activeCamera);
  }

  updateCameraPanel();
  setExitControlVisible(contentMode !== 'menu');
}

function drawScreen() {
  if (!screenCtx || !screenCanvas) return;
  if (contentMode === 'game' && !cssGameActive && !overlayActive) {
    attachGameCanvas();
  }
  const now = performance.now();
  const ctx = screenCtx;
  const W = screenCanvas.width;
  const H = screenCanvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = letterboxColor;
  ctx.fillRect(0, 0, W, H);

  const surface = { x: 0, y: 0, w: W, h: H };
  const aspect = (contentMode === 'video' && reelReady && reelVideo && reelVideo.videoWidth && reelVideo.videoHeight)
    ? reelVideo.videoWidth / reelVideo.videoHeight
    : (videoReady && playerVideo && playerVideo.videoWidth && playerVideo.videoHeight)
      ? playerVideo.videoWidth / playerVideo.videoHeight
      : 16 / 9;
  if (contentMode === 'menu') {
    contentRect = surface;
  } else if (contentMode === 'game') {
    contentRect = surface;
  } else {
    contentRect = fitRectToAspect(surface, aspect);
  }

  const canDrawGame = contentMode === 'game' && !cssGameActive && !overlayActive && !splashActive && isCanvasUsable(gameCanvas);
  if (splashActive) {
    drawGameSplash(ctx, contentRect, now);
  } else if (canDrawGame) {
    try {
      ctx.drawImage(gameCanvas, 0, 0, W, H);
      if (!loggedDrawSuccess) {
        console.log('[games] drawImage ok', { size: `${gameCanvas.width}x${gameCanvas.height}` });
        loggedDrawSuccess = true;
      }
    } catch (e) {
      if (!loggedDrawError) {
        console.warn('[games] drawImage failed', e);
        loggedDrawError = true;
      }
    }
  } else if (contentMode === 'video' && reelReady && reelVideo) {
    try {
      ctx.drawImage(reelVideo, contentRect.x, contentRect.y, contentRect.w, contentRect.h);
    } catch (e) { /* ignore */ }
  } else if (contentMode === 'menu') {
    drawMenu(ctx, contentRect);
  } else if (videoReady && playerVideo) {
    try {
      ctx.drawImage(playerVideo, contentRect.x, contentRect.y, contentRect.w, contentRect.h);
    } catch (e) { /* ignore */ }
  }

  if (player && contentMode !== 'menu') {
    player.updateControls();
    player.drawControls();
    drawSpeedBadge(ctx, contentRect);
    if (!playerVideo || playerVideo.paused || playerVideo.ended) {
      drawPlayOverlay(ctx, contentRect);
    }
  }

  screenTexture.needsUpdate = true;
  needsRedraw = false;
}

function drawPlayOverlay(ctx, rect) {
  const size = Math.min(rect.w, rect.h) * 0.22;
  const x = rect.x + (rect.w - size) / 2;
  const y = rect.y + (rect.h - size) / 2;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(3, Math.round(size * 0.08));
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.46, y + size * 0.32);
  ctx.lineTo(x + size * 0.46, y + size * 0.68);
  ctx.lineTo(x + size * 0.72, y + size * 0.50);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSpeedBadge(ctx, videoRect) {
  const w = Math.round(videoRect.w * 0.14);
  const h = Math.round(videoRect.h * 0.12);
  const x = videoRect.x + videoRect.w - w - 18;
  const y = videoRect.y + videoRect.h - h - 20;
  ctx.save();
  ctx.fillStyle = 'rgba(12,12,12,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#f0f0f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(h * 0.55)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(`${SPEED_RATES[speedIndex]}x`, x + w / 2, y + h / 2);
  ctx.restore();
}

function drawGameSplash(ctx, rect, nowMs) {
  const progress = getSplashProgress(nowMs);
  const ready = progress >= 0.999;
  const pad = Math.min(rect.w, rect.h) * 0.04;
  const box = {
    x: rect.x + pad,
    y: rect.y + pad,
    w: rect.w - pad * 2,
    h: rect.h - pad * 2
  };

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  if (splashImage && splashImage.complete) {
    const imgAspect = splashImage.naturalWidth && splashImage.naturalHeight
      ? splashImage.naturalWidth / splashImage.naturalHeight
      : 16 / 9;
    const imgRect = fitRectToAspect(box, imgAspect);
    ctx.drawImage(splashImage, imgRect.x, imgRect.y, imgRect.w, imgRect.h);
  }

  const barW = rect.w * 0.72;
  const barH = Math.max(12, Math.round(rect.h * 0.04));
  const barX = rect.x + (rect.w - barW) / 2;
  const barY = rect.y + rect.h * 0.78;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#7e3ccf';
  ctx.fillRect(barX, barY, barW * progress, barH);

  const btnR = Math.min(rect.w, rect.h) * 0.07;
  const btnX = rect.x + rect.w / 2;
  const btnY = rect.y + rect.h / 2;
  splashPlayRect = { x: btnX, y: btnY, r: btnR };

  ctx.globalAlpha = ready ? 1 : 0.3;
  ctx.fillStyle = '#6b2fa3';
  ctx.beginPath();
  ctx.arc(btnX, btnY, btnR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2e6ff';
  const triR = btnR * 0.5;
  ctx.beginPath();
  ctx.moveTo(btnX + triR * 0.5, btnY);
  ctx.lineTo(btnX - triR * 0.4, btnY - triR * 0.7);
  ctx.lineTo(btnX - triR * 0.4, btnY + triR * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawMenu(ctx, rect) {
  const layout = getMenuRects(rect);
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 10, 0.55)';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.textBaseline = 'middle';
  ctx.font = `${Math.max(18, Math.round(layout.itemHeight * 0.42))}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = 'left';

  layout.games.forEach((slot) => {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(2, Math.round(rect.w * 0.002));
    ctx.beginPath();
    const radius = Math.max(12, Math.round(slot.rect.h * 0.2));
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h, radius);
    } else {
      ctx.rect(slot.rect.x, slot.rect.y, slot.rect.w, slot.rect.h);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(slot.label, slot.rect.x + slot.rect.w * 0.06, slot.rect.y + slot.rect.h / 2);
  });

  layout.videos.forEach((slot) => {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = Math.max(2, Math.round(rect.w * 0.002));
    ctx.beginPath();
    ctx.arc(slot.cx, slot.cy, slot.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = `${Math.max(16, Math.round(slot.r * 0.4))}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(slot.label, slot.cx, slot.cy);
    ctx.textAlign = 'left';
    ctx.font = `${Math.max(18, Math.round(layout.itemHeight * 0.42))}px "Segoe UI", Arial, sans-serif`;
  });

  ctx.restore();
}

function ensureExitControl() {
  if (exitControl) return exitControl;
  const nav = document.querySelector('.navigation');
  if (!nav) return null;
  exitControl = document.createElement('button');
  exitControl.type = 'button';
  exitControl.className = 'nav-icon nav-exit nav-exit--hidden';
  exitControl.title = 'Exit';
  exitControl.setAttribute('aria-label', 'Exit game or video');
  const img = document.createElement('img');
  img.src = 'assets/images/exit%20icon.png';
  img.alt = 'Exit';
  exitControl.appendChild(img);
  exitControl.addEventListener('click', () => {
    if (contentMode === 'game') {
      exitGameImmediate();
    } else if (contentMode === 'video') {
      stopVideoReel();
    }
  });
  nav.prepend(exitControl);
  return exitControl;
}

function setExitControlVisible(visible) {
  const control = ensureExitControl();
  if (!control) return;
  control.classList.toggle('nav-exit--hidden', !visible);
}

function updateCameraPanel() {
  if (!cameraPanelText || !activeCamera) return;
  const pos = activeCamera.position;
  const quat = activeCamera.quaternion;
  const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  const fov = activeCamera.isPerspectiveCamera ? activeCamera.fov : 0;
  const screenInfo = screenMesh ? screenMesh.getWorldPosition(new THREE.Vector3()) : null;
  const cssInfo = cssGameObject ? cssGameObject.getWorldPosition(new THREE.Vector3()) : null;
  const screenVis = screenMesh ? screenMesh.visible : false;
  cameraPanelText.textContent =
    `pos: ${pos.x.toFixed(3)}, ${pos.y.toFixed(3)}, ${pos.z.toFixed(3)}\n` +
    `rot: ${THREE.MathUtils.radToDeg(euler.x).toFixed(1)}, ${THREE.MathUtils.radToDeg(euler.y).toFixed(1)}, ${THREE.MathUtils.radToDeg(euler.z).toFixed(1)}\n` +
    `quat: ${quat.x.toFixed(3)}, ${quat.y.toFixed(3)}, ${quat.z.toFixed(3)}, ${quat.w.toFixed(3)}\n` +
    `fov: ${fov.toFixed(1)}\n` +
    `screen: ${screenInfo ? `${screenInfo.x.toFixed(2)}, ${screenInfo.y.toFixed(2)}, ${screenInfo.z.toFixed(2)}` : 'n/a'} (visible: ${screenVis})\n` +
    `css3d: ${cssInfo ? `${cssInfo.x.toFixed(2)}, ${cssInfo.y.toFixed(2)}, ${cssInfo.z.toFixed(2)}` : 'n/a'}\n` +
    `mode: ${contentMode} | css3d: ${cssGameActive} | input: ${gameInputEnabled}`;
}

function handlePointerMove(ev) {
  if (!screenMesh || !screenCanvas) return;
  const hit = raycastScreen(ev);
  if (!hit) return;
  lastScreenHit = hit;
  if (contentMode === 'menu') return;
  if (isGameActive()) {
    dispatchGameMouseMove(hit);
    return;
  }
  if (player) {
    const event = toCanvasEvent(hit.x, hit.y);
    player.handlePointerMove(event);
  }
}

function handlePointerDown(ev) {
  if (ev.button !== 0 && ev.button !== 1 && ev.button !== 2) return;
  if (!screenMesh || !screenCanvas) return;
  const hit = raycastScreen(ev);
  if (!hit) {
    controls.enabled = true;
    return;
  }
  lastScreenHit = hit;

  ev.preventDefault();
  ev.stopPropagation();
  pointerCaptured = true;
  if (controls) controls.enabled = false;
  renderer.domElement.setPointerCapture(ev.pointerId);
  renderer.domElement.focus({ preventScroll: true });

  if (contentMode === 'menu') {
    const action = getMenuAction(hit.x, hit.y, contentRect);
    if (action && action.type === 'game') {
      const entry = GAME_LIST[action.index];
      if (entry) startGame(entry.url, entry.renderMode);
    } else if (action && action.type === 'video') {
      const entry = VIDEO_LIST[action.index];
      if (entry) startVideoReel(entry.src);
    }
    return;
  }

  if (splashActive) {
    if (splashReady && splashPlayRect) {
      const dx = hit.x - splashPlayRect.x;
      const dy = hit.y - splashPlayRect.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= splashPlayRect.r) {
        hideGameSplash();
        return;
      }
    }
    return;
  }

  if (overlayActive) {
    return;
  }

  if (isGameActive()) {
    dispatchGamePointerDown(hit, ev.button);
  } else if (player) {
    const videoRect = getVideoRect();
    if (videoRect && pointInRect(hit.x, hit.y, videoRect)) {
      if (playerVideo && (playerVideo.paused || playerVideo.ended)) {
        playerVideo.muted = false;
        playerVideo.volume = 1.0;
        playerVideo.play().catch(() => {});
        needsRedraw = true;
      }
    }

    const event = toCanvasEvent(hit.x, hit.y);
    player.handleClick(event);
    player.handlePointerDown(event);

    if (isPointInSpeedBadge(hit.x, hit.y, videoRect)) {
      cycleSpeed();
    }
  } else {
    // Ignore clicks outside game/video content.
  }
}

function handlePointerUp(ev) {
  if (pointerCaptured) {
    ev.preventDefault();
    ev.stopPropagation();
    pointerCaptured = false;
    if (controls) controls.enabled = (contentMode === 'menu');
    try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }
  if (isGameActive() && lastScreenHit) {
    dispatchGamePointerUp(lastScreenHit, ev.button);
  }
}

function handleKeyDown(ev) {
  if (ev.key !== 'Escape') return;
  if (contentMode === 'game') {
    exitGameImmediate();
  } else if (contentMode === 'video') {
    stopVideoReel();
  } else {
    contentMode = 'menu';
    needsRedraw = true;
  }
}

function enterContentView() {
  if (!cameraZoomUserEnabled) {
    previousCameraZoomAlt = cameraZoomAlt;
    autoZoomActive = true;
  } else {
    autoZoomActive = false;
  }
  if (!cameraZoomAlt) {
    applyCameraMode(true);
  }
  updateControlsForContent('content');
}

function restoreViewAfterContent() {
  if (!cameraZoomUserEnabled && autoZoomActive) {
    applyCameraMode(previousCameraZoomAlt);
  }
  autoZoomActive = false;
  updateControlsForContent('menu');
}

function updateControlsForContent(mode) {
  if (!controls) return;
  const allowTransform = true;
  controls.enablePan = false;
  controls.enableRotate = allowTransform;
  controls.enableZoom = allowTransform;
  controls.enabled = allowTransform;
}

function setGameInputEnabled(enabled) {
  gameInputEnabled = !!enabled;
  if (cameraPanelInputBtn) {
    cameraPanelInputBtn.textContent = `Game input: ${gameInputEnabled ? 'on' : 'off'}`;
  }
  if (cssGameActive) {
    cssRenderer.domElement.style.pointerEvents = gameInputEnabled ? 'auto' : 'none';
    if (cssGameElement) cssGameElement.style.pointerEvents = gameInputEnabled ? 'auto' : 'none';
    renderer.domElement.style.pointerEvents = gameInputEnabled ? 'none' : 'auto';
  }
}

function attachGameCanvas() {
  if (!gameIframe) return;
  try {
    const doc = gameIframe.contentWindow?.document || null;
    if (!doc) {
      gameReady = isCanvasUsable(gameCanvas);
      return;
    }
    const canvases = Array.from(doc.querySelectorAll('canvas'));
    const candidate = findConstructCanvas(doc);
    const cached = gameIframe?.src ? lastGameCanvasByUrl.get(gameIframe.src) : null;
    if (canvases.length && (!candidate || !isCanvasBigEnough(candidate))) {
      const sizes = canvases.map(c => `${c.id || c.className || 'canvas'}:${c.width}x${c.height}`);
      if (!loggedCanvasLoss) {
        console.log('[games] canvases present but none big enough', sizes);
      }
    }
    if (candidate && isCanvasUsable(candidate) && isCanvasBigEnough(candidate)) {
      if (gameCanvas !== candidate) {
        const label = candidate.id ? `#${candidate.id}` : candidate.className ? `.${candidate.className}` : 'canvas';
        const size = `${candidate.width}x${candidate.height}`;
        if (!loggedCanvasAttach || candidate !== lastGameCanvas || size !== lastGameCanvasSize) {
          console.log('[games] attached canvas', { label, size });
          loggedCanvasAttach = true;
          loggedCanvasLoss = false;
        }
        lastGameCanvas = candidate;
        lastGameCanvasSize = size;
        gameCanvas = candidate;
        if (gameIframe?.src) lastGameCanvasByUrl.set(gameIframe.src, candidate);
        ensureGameCanvasLayout(gameCanvas);
      }
    } else {
      const fallback = isCanvasUsable(lastGameCanvas) ? lastGameCanvas : (isCanvasUsable(cached) ? cached : null);
      if (!fallback && !loggedCanvasLoss) {
        console.warn('[games] canvas unavailable or 0x0; keeping last good canvas');
        loggedCanvasLoss = true;
      }
      if (fallback) {
        gameCanvas = fallback;
      } else if (!isCanvasUsable(gameCanvas)) {
        gameCanvas = null;
      }
    }
    if (gameFocusPending && gameCanvas) {
      gameIframe?.contentWindow?.focus?.();
      gameCanvas?.focus?.();
      gameFocusPending = false;
    }
    gameReady = isCanvasUsable(gameCanvas);
  } catch (err) {
    gameReady = isCanvasUsable(gameCanvas);
  }
}

const MIN_GAME_CANVAS_WIDTH = 640;
const MIN_GAME_CANVAS_HEIGHT = 360;

function isCanvasUsable(canvas) {
  return !!(canvas && canvas.width > 0 && canvas.height > 0 && canvas.isConnected !== false);
}

function isCanvasBigEnough(canvas) {
  return !!(canvas && canvas.width >= MIN_GAME_CANVAS_WIDTH && canvas.height >= MIN_GAME_CANVAS_HEIGHT);
}

function ensureGameCanvasLayout(canvas) {
  if (!canvas) return;
  const w = canvas.width || GAME_FRAME_WIDTH;
  const h = canvas.height || GAME_FRAME_HEIGHT;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.opacity = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'block';
  }
  if (typeof canvas.tabIndex !== 'number' || canvas.tabIndex < 0) {
    canvas.tabIndex = 0;
  }
}

function findConstructCanvas(doc) {
  if (!doc) return null;
  const canvases = Array.from(doc.querySelectorAll('canvas'));
  if (!canvases.length) return null;
  const preferred = [
    doc.getElementById('c3canvas'),
    doc.getElementById('c2canvas'),
    doc.getElementById('canvas'),
    doc.querySelector('canvas[tabindex]')
  ].filter(Boolean);
  let chosen = preferred.find((canvas) => canvases.includes(canvas)) || null;
  if (!chosen) {
    let bestArea = -1;
    for (const canvas of canvases) {
      const width = canvas.width || 0;
      const height = canvas.height || 0;
      const area = width * height;
      if (area > bestArea) {
        bestArea = area;
        chosen = canvas;
      }
    }
  }
  return chosen;
}

function isGameActive() {
  return contentMode === 'game' && gameReady && gameCanvas && !overlayActive && !splashActive;
}

function mapHitToClient(hit) {
  if (!hit || !hit.uv || !gameCanvas) return null;
  let u = hit.uv.x;
  let v = hit.uv.y;
  if (INPUT_FLIP_U) u = 1 - u;
  if (INPUT_FLIP_V) v = 1 - v;
  const xCanvasPx = u * gameCanvas.width;
  const yCanvasPx = (1 - v) * gameCanvas.height;
  const rect = gameCanvas.getBoundingClientRect();
  const rectW = rect.width || gameCanvas.width || GAME_FRAME_WIDTH;
  const rectH = rect.height || gameCanvas.height || GAME_FRAME_HEIGHT;
  const rectLeft = isFinite(rect.left) ? rect.left : 0;
  const rectTop = isFinite(rect.top) ? rect.top : 0;
  const clientX = rectLeft + (xCanvasPx / gameCanvas.width) * rectW;
  const clientY = rectTop + (yCanvasPx / gameCanvas.height) * rectH;
  return { clientX, clientY };
}

function dispatchGameMouseMove(hit) {
  const mapped = mapHitToClient(hit);
  if (!mapped) return;
  const buttons = gamePointerDown ? (gamePointerButton === 1 ? 4 : gamePointerButton === 2 ? 2 : 1) : 0;
  dispatchSyntheticPointerMove(mapped.clientX, mapped.clientY, buttons);
  dispatchSyntheticMouseMove(mapped.clientX, mapped.clientY, buttons);
}

function dispatchGamePointerDown(hit, button = 0) {
  const mapped = mapHitToClient(hit);
  if (!mapped) return;
  if (gameFocusPending) {
    gameIframe?.contentWindow?.focus?.();
    gameCanvas?.focus?.();
    gameFocusPending = false;
  }
  gamePointerDown = true;
  gamePointerButton = button;
  dispatchSyntheticPointerDown(mapped.clientX, mapped.clientY, button);
  dispatchSyntheticMouseDown(mapped.clientX, mapped.clientY, button);
}

function dispatchGamePointerUp(hit, button = 0) {
  const mapped = mapHitToClient(hit);
  if (!mapped) return;
  dispatchSyntheticPointerUp(mapped.clientX, mapped.clientY, button);
  dispatchSyntheticMouseUp(mapped.clientX, mapped.clientY, button);
  if (button === 0) {
    dispatchSyntheticMouseClick(mapped.clientX, mapped.clientY);
  }
  gamePointerDown = false;
  gamePointerButton = 0;
}

function getEventWindow() {
  return gameIframe?.contentWindow || window;
}

function getEventTargets() {
  const targets = [];
  if (gameCanvas) targets.push(gameCanvas);
  const doc = gameIframe?.contentWindow?.document;
  if (doc) targets.push(doc);
  return targets;
}

function dispatchToTargets(event) {
  const targets = getEventTargets();
  for (const target of targets) {
    target.dispatchEvent(event);
  }
}

function dispatchSyntheticMouseMove(clientX, clientY, buttons = 0) {
  if (!gameCanvas) return;
  const eventWindow = getEventWindow();
  const MouseEventCtor = eventWindow.MouseEvent || MouseEvent;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: gameIframe?.contentWindow || null
  };
  const move = new MouseEventCtor('mousemove', { ...eventInit, buttons });
  dispatchToTargets(move);
}

function dispatchSyntheticPointerMove(clientX, clientY, buttons = 0) {
  const eventWindow = getEventWindow();
  const PointerEventCtor = eventWindow.PointerEvent;
  if (!PointerEventCtor) return;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: gameIframe?.contentWindow || null,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    buttons
  };
  const move = new PointerEventCtor('pointermove', eventInit);
  dispatchToTargets(move);
}

function dispatchSyntheticMouseDown(clientX, clientY, button = 0) {
  if (!gameCanvas) return;
  const eventWindow = getEventWindow();
  const MouseEventCtor = eventWindow.MouseEvent || MouseEvent;
  const buttons = button === 1 ? 4 : button === 2 ? 2 : 1;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: gameIframe?.contentWindow || null
  };
  const down = new MouseEventCtor('mousedown', { ...eventInit, button, buttons });
  dispatchToTargets(down);
}

function dispatchSyntheticMouseUp(clientX, clientY, button = 0) {
  if (!gameCanvas) return;
  const eventWindow = getEventWindow();
  const MouseEventCtor = eventWindow.MouseEvent || MouseEvent;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: gameIframe?.contentWindow || null
  };
  const up = new MouseEventCtor('mouseup', { ...eventInit, button, buttons: 0 });
  dispatchToTargets(up);
}

function dispatchSyntheticMouseClick(clientX, clientY) {
  if (!gameCanvas) return;
  const eventWindow = getEventWindow();
  const MouseEventCtor = eventWindow.MouseEvent || MouseEvent;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: gameIframe?.contentWindow || null
  };
  const click = new MouseEventCtor('click', { ...eventInit, button: 0, buttons: 0 });
  dispatchToTargets(click);
}

function dispatchSyntheticPointerDown(clientX, clientY, button = 0) {
  const eventWindow = getEventWindow();
  const PointerEventCtor = eventWindow.PointerEvent;
  if (!PointerEventCtor) return;
  const buttons = button === 1 ? 4 : button === 2 ? 2 : 1;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: gameIframe?.contentWindow || null,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true
  };
  const down = new PointerEventCtor('pointerdown', { ...eventInit, button, buttons, pressure: 0.5 });
  dispatchToTargets(down);
}

function dispatchSyntheticPointerUp(clientX, clientY, button = 0) {
  const eventWindow = getEventWindow();
  const PointerEventCtor = eventWindow.PointerEvent;
  if (!PointerEventCtor) return;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: gameIframe?.contentWindow || null,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true
  };
  const up = new PointerEventCtor('pointerup', { ...eventInit, button, buttons: 0, pressure: 0 });
  dispatchToTargets(up);
}

function raycastScreen(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  raycaster.setFromCamera(pointerNDC, activeCamera);
  const hits = raycaster.intersectObject(screenMesh, false);
  if (!hits.length || !hits[0].uv) return null;
  const rawU = hits[0].uv.x;
  const rawV = hits[0].uv.y;
  let u = rawU;
  let v = rawV;
  if (INPUT_FLIP_U) u = 1 - u;
  if (INPUT_FLIP_V) v = 1 - v;
  const x = u * screenCanvas.width;
  const y = (1 - v) * screenCanvas.height;
  let displayU = rawU;
  let displayV = rawV;
  if (DISPLAY_FLIP_U) displayU = 1 - displayU;
  if (DISPLAY_FLIP_V) displayV = 1 - displayV;
  const displayX = displayU * screenCanvas.width;
  const displayY = (1 - displayV) * screenCanvas.height;
  return { x, y, displayX, displayY, uv: hits[0].uv };
}

function toCanvasEvent(x, y) {
  const rect = screenCanvas.getBoundingClientRect();
  const clientX = rect.left + (x / screenCanvas.width) * rect.width;
  const clientY = rect.top + (y / screenCanvas.height) * rect.height;
  return { clientX, clientY };
}

function getVideoRect() {
  if (!screenCanvas) return null;
  const W = screenCanvas.width;
  const H = screenCanvas.height;
  const aspect = videoReady && playerVideo && playerVideo.videoWidth && playerVideo.videoHeight
    ? playerVideo.videoWidth / playerVideo.videoHeight
    : 16 / 9;
  return fitRectToAspect({ x: 0, y: 0, w: W, h: H }, aspect);
}

function isPointInSpeedBadge(x, y, videoRect) {
  if (!videoRect) return false;
  const w = Math.round(videoRect.w * 0.14);
  const h = Math.round(videoRect.h * 0.12);
  const rx = videoRect.x + videoRect.w - w - 18;
  const ry = videoRect.y + videoRect.h - h - 20;
  return pointInRect(x, y, { x: rx, y: ry, w, h });
}

function cycleSpeed() {
  speedIndex = (speedIndex + 1) % SPEED_RATES.length;
  if (playerVideo) playerVideo.playbackRate = SPEED_RATES[speedIndex];
  needsRedraw = true;
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function fitRectToAspect(rect, aspect = 16 / 9) {
  const r = { ...rect };
  const ar = r.w / r.h;
  if (ar > aspect) {
    const newW = Math.round(r.h * aspect);
    const dx = Math.floor((r.w - newW) / 2);
    r.x += dx; r.w = newW;
  } else {
    const newH = Math.round(r.w / aspect);
    const dy = Math.floor((r.h - newH) / 2);
    r.y += dy; r.h = newH;
  }
  return r;
}

function getCssVar(name, fallback) {
  try {
    const val = getComputedStyle(document.body || document.documentElement).getPropertyValue(name);
    if (val && val.trim()) return val.trim();
  } catch (e) { /* ignore */ }
  return fallback;
}
