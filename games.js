import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import VideoPlayer from './video-player-controls.js';
import { createVideoControlsUI, createAudioSyncState, syncAudioToVideo as pllSyncAudioToVideo, setPreservePitchFlag } from './shared-video-controls.js';
import { createGameAudioBridge } from './game-audio-bridge.js';
import { createGamesVideoAdapter } from './games-video-adapter.js';
import { GAME_LIST, VIDEO_LIST, MENU_LAYOUT, getMenuAction, getMenuRects } from './games-layout.js';
import { assetUrl, safeDrawImage, markBroken, isBroken, corsProbe, isLocalDev } from './assets-config.js';

const STAGE_ID = 'model-stage';
const GLB_URL = assetUrl('./glb/Arcade-Console.glb');
const SCREEN_MESH_CANDIDATES = ['arcade_screen_surface', 'arcade_screen'];
const TARGET_SCREEN_AR = 0.693 / 0.449;

const VIDEO_SRC = assetUrl('./Videos/games-page/video-games-reel-hq.webm');
const SPEED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_GAME_URL = './games/battleship/index.html';
const GAME_RENDER_MODE = 'blit'; // 'overlay', 'blit', or 'css3d'
const GAME_FRAME_WIDTH = 1280;
const GAME_FRAME_HEIGHT = 720;
const GAME_FRAME_ASPECT = GAME_FRAME_WIDTH / GAME_FRAME_HEIGHT;
const DEBUG_SHOW_CSS3D_FRAME = false;
const GAME_SPLASH_DURATION_MS = 3000;
const USE_SHARED_CONTROLS_GAMES = true;
const SHOW_GAME_AUDIO_PANEL = false;
const GAME_AUDIO_MAX = 1.5;
const GAME_SPLASH_DURATIONS_MS = {
  battleship: 8000,
  'train-mania': 10000,
  plinko: 7000,
  'pick-a-square': 15000,
  'big-bomb-blast': 7000
};
const GAME_SPLASH_IMAGES = {
  battleship: assetUrl('games/battleship.png'),
  'train-mania': assetUrl('games/train-mania.png'),
  plinko: assetUrl('games/plinko.png'),
  'pick-a-square': assetUrl('games/pick-a-square.png'),
  'big-bomb-blast': assetUrl('games/big-bomb-blast.png')
};
const GAME_THUMBS = {
  battleship: assetUrl('games/images/battleship.png'),
  plinko: assetUrl('games/images/plinko.png'),
  'pick-a-square': assetUrl('games/images/pick-a-square.png'),
  'train-mania': assetUrl('games/images/train-mania.png'),
  'big-bomb-blast': assetUrl('games/images/big-bomb-blast.png')
};
const GAME_LABEL_SVGS = {
  battleship: null,
  plinko: null,
  'train-mania': null,
  'pick-a-square': null,
  'big-bomb-blast': null
};
const VIDEO_THUMBS = {
  reel: assetUrl('./Videos/games-page/video-games-reel.png'),
  christmas: assetUrl('./Videos/games-page/christmas-games.png')
};
const VIDEO_TITLE_IMAGES = {
  reels: assetUrl('./games/images/game reels.png'),
  samples: assetUrl('./games/images/game samples.png')
};
const videoTitleImageCache = new Map();
THREE.DefaultLoadingManager.setURLModifier((url) => assetUrl(url));
function safeDrawVideo(ctx, video, ...args) {
  if (!video || video.readyState < 2) return false;
  const src = video.currentSrc || video.src || '';
  if (isBroken(src)) return false;
  try {
    ctx.drawImage(video, ...args);
    return true;
  } catch (e) {
    console.warn('drawImage failed (video, likely CORS/CORP):', src, e);
    markBroken(src);
    console.warn('markBroken(video):', src);
    return false;
  }
}
function ensureVideoTitleImage(key) {
  if (videoTitleImageCache.has(key)) return videoTitleImageCache.get(key);
  const src = VIDEO_TITLE_IMAGES[key];
  if (!src) return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = src;
  img.onload = () => { needsRedraw = true; };
  videoTitleImageCache.set(key, img);
  return img;
}
const VIDEO_LQ = {
  reel: assetUrl('./Videos/games-page/video-games-reel-lq.webm'),
  christmas: assetUrl('./Videos/games-page/christmas-games-lq.webm')
};
const VIDEO_AUDIO = {
  reel: assetUrl('./Videos/games-page/video-games-reel.opus'),
  christmas: assetUrl('./Videos/games-page/christmas-games.opus')
};
const GAME_SPLASH_FAST_PORTION = 0.78; // progress quickly then slow near the end
const DEFAULT_CAMERA = {
  pos: new THREE.Vector3(3.073, 1.579, 1.875),
  rot: new THREE.Euler(
    THREE.MathUtils.degToRad(-27.5),
    THREE.MathUtils.degToRad(55.9),
    THREE.MathUtils.degToRad(23.3),
    'XYZ'
  ),
  quat: new THREE.Quaternion(-0.114, 0.488, 0.064, 0.863),
  fov: 22.9
};

// Lightweight logging helper so devs can filter by `[games:<tag>]` in the console.
function gamesLog(tag, ...args) {
  try {
    console.log(`%c[games:${tag}]`, 'color:#7ee787;font-weight:bold', ...args);
  } catch (e) {
    console.log(`[games:${tag}]`, ...args);
  }
}
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
const CAMERA_ZOOM_DURATION = 420;

// Display/input correction toggles for the screen mesh UVs.
const DISPLAY_FLIP_U = true;
const DISPLAY_FLIP_V = false;
const INPUT_FLIP_U = true;
const INPUT_FLIP_V = true;
const CONTROLS_INPUT_FLIP_Y = true;
const CONTROLS_DRAW_FLIP_Y = false;

const AUDIO_ALLOWED_KEY = 'site.audio.allowed';
const AUDIO_VOLUME_KEY = 'site.audio.volume';
const AUDIO_SYNC_KEY = 'site.audio.sync';
const AUDIO_MUTED_KEY = 'site.audio.muted';

function getStoredAudioSettings() {
  const allowed = localStorage.getItem(AUDIO_ALLOWED_KEY) === 'true';
  const muted = localStorage.getItem(AUDIO_MUTED_KEY) === 'true' || !allowed;
  const volume = Math.max(0, Math.min(1, parseFloat(localStorage.getItem(AUDIO_VOLUME_KEY) || '1')));
  return { muted, volume };
}

function getStoredSyncMs() {
  const raw = parseInt(localStorage.getItem(AUDIO_SYNC_KEY) || '0', 10);
  return Number.isFinite(raw) ? raw : 0;
}

function createAudioElement(src) {
  const audio = document.createElement('audio');
  audio.crossOrigin = 'anonymous';
  audio.preload = 'auto';
  audio.src = src;
  audio.addEventListener('error', () => {
    const err = audio.error;
    console.warn('AUDIO ERROR:', audio.src, err ? { code: err.code, message: err.message } : err);
  });
  return audio;
}

const GAME_MEDIA_SCAN_INTERVAL = 1200;

function getGameMediaElements(force = false) {
  if (!gameIframe || !gameIframe.contentWindow) return [];
  const now = performance.now();
  if (!force && (now - gameMediaLastScan) < GAME_MEDIA_SCAN_INTERVAL && gameMediaCache.length) {
    return gameMediaCache;
  }
  try {
    const doc = gameIframe.contentWindow.document;
    if (!doc) return [];
    const mediaEls = Array.from(doc.querySelectorAll('audio, video'));
    gameMediaCache = mediaEls;
    gameMediaLastScan = now;
    return mediaEls;
  } catch (e) {
    return [];
  }
}

function applyAudioSettings(audio) {
  if (!audio) return;
  const { muted, volume } = getStoredAudioSettings();
  audio.muted = muted;
  try { audio.volume = muted ? 0 : volume; } catch (e) { /* ignore */ }
}

function applyVideoAudioSettings(video) {
  if (!video) return;
  const { muted, volume } = getStoredAudioSettings();
  try { video.muted = muted; } catch (e) { /* ignore */ }
  try { video.volume = muted ? 0 : volume; } catch (e) { /* ignore */ }
}

function applyGameMediaSettings(force = false) {
  if (!gameIframe || !gameIframe.contentWindow) return;
  const mediaEls = getGameMediaElements(force);
  if (!mediaEls.length) return;
  const { muted, volume } = getStoredAudioSettings();
  mediaEls.forEach((el) => {
    try { el.muted = muted; } catch (e) { /* ignore */ }
    try { el.volume = muted ? 0 : volume; } catch (e) { /* ignore */ }
  });
  try {
    const howler = gameIframe.contentWindow.Howler;
    if (howler && typeof howler.volume === 'function') {
      howler.volume(muted ? 0 : volume);
    }
  } catch (e) { /* ignore */ }
}

function setStoredAudioMuted(muted) {
  try { localStorage.setItem(AUDIO_MUTED_KEY, muted ? 'true' : 'false'); } catch (e) { /* ignore */ }
  applyGameMediaSettings(true);
}

function setStoredAudioVolume(volume) {
  const v = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
  try { localStorage.setItem(AUDIO_VOLUME_KEY, String(v)); } catch (e) { /* ignore */ }
  if (v > 0.001) {
    setStoredAudioMuted(false);
  } else {
    applyGameMediaSettings(true);
  }
}

function getGameAudioState() {
  const state = gameAudioBridge.getState();
  return {
    available: !!state.available,
    muted: !!state.muted,
    volume: Math.max(0, Math.min(GAME_AUDIO_MAX, Number.isFinite(state.volume) ? state.volume : 0)),
    reason: state.reason || ''
  };
}

function getAudioSyncState(audio) {
  if (!audio) return null;
  if (!audioSyncStateByEl.has(audio)) {
    audioSyncStateByEl.set(audio, createAudioSyncState());
  }
  return audioSyncStateByEl.get(audio);
}

function syncAudioToVideo(video, audio) {
  if (!video || !audio) return;
  const state = getAudioSyncState(audio);
  const uiState = player ? player.uiState : null;
  const rates = player ? player.playbackRates : null;
  pllSyncAudioToVideo(video, audio, state, {
    syncMs: getStoredSyncMs(),
    uiState,
    rates,
    allowSound: true
  });
}

function startAudioForVideo(video, audio) {
  if (!video || !audio) return;
  applyAudioSettings(audio);
  syncAudioToVideo(video, audio);
  try { audio.play().catch(() => {}); } catch (e) { /* ignore */ }
}

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
let playerAudio = null;
let playerBaseVideo = null;
let videoReady = false;
let reelVideo = null;
let reelAudio = null;
let reelReady = false;
let reelSource = '';
const audioSyncStateByEl = new WeakMap();
let sharedControlsUi = null;
let sharedControlsAdapter = null;
let sharedControlsActive = null;
let lastControlsDrawLog = 0;
let sharedControlsVideo = null;
let activeVideoRect = null;
let gameUiLayout = null;

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
let loggedReelRect = false;
let loggedGameRect = false;
let cssGameObject = null;
let cssGameElement = null;
let cssGameActive = false;
let exitControl = null;
let lastGameCanvasByUrl = new Map();
let overlayContainer = null;
let overlayActive = false;
let overlayRect = null;
let gameMediaCache = [];
let gameMediaLastScan = 0;
let lastGameAudioSync = 0;
let gameAudioUi = null;
const gameAudioBridge = createGameAudioBridge({
  onStatus: () => {
    updateGameAudioControlsState();
  }
});
let gameVolumeDrag = false;
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
let splashImages = new Map();
let splashDurationMs = GAME_SPLASH_DURATION_MS;
let currentGameId = null;
let userReturnTransform = null;

const videoThumbImages = new Map();
const videoPreviewVideos = new Map();
let hoveredVideoId = null;
let hoveredGameId = null;
const gameThumbImages = new Map();
const gameLabelImages = new Map();

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
let cameraAnimId = null;
let cameraAnimStart = 0;
let cameraAnimFrom = null;
let cameraAnimTo = null;
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
if (isLocalDev() || new URLSearchParams(window.location.search || '').has('assetsDebug')) {
  corsProbe('glb/Arcade-Console.glb');
  corsProbe('Videos/games-page/video-games-reel-hq.webm');
  corsProbe('Videos/games-page/video-games-reel.opus');
}
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
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
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
  renderer.domElement.addEventListener('pointerleave', () => { if (contentMode === 'menu') clearMenuHover(); });
  renderer.domElement.addEventListener('wheel', handleWheel, { capture: true, passive: false });
  renderer.domElement.addEventListener('contextmenu', handleContextMenu, { capture: true });
  window.addEventListener('resize', onResize);
window.addEventListener('keydown', handleKeyDown, { capture: true });
window.addEventListener('syncOffsetChanged', () => {
  const activeVideo = (contentMode === 'video' && reelVideo) ? reelVideo : playerVideo;
  const activeAudio = (contentMode === 'video' && reelVideo) ? reelAudio : playerAudio;
  if (activeVideo && activeAudio) syncAudioToVideo(activeVideo, activeAudio);
}, { passive: true });
  introActive = false;
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
  cameraPanel = null;
  cameraPanelText = null;
  cameraPanelZoomBtn = null;
  cameraPanelInputBtn = null;
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
  loader.setCrossOrigin('anonymous');

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
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
        controls.target.copy(center);
        updateControlsForContent(contentMode);
        gamesLog('glb', 'Using GLB camera:', activeCamera.name || '(unnamed)');
      } else {
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 2.2;
        fallbackCamera.position.copy(center).add(new THREE.Vector3(0, maxDim * 0.15, dist));
        fallbackCamera.lookAt(center);
        activeCamera = fallbackCamera;
        controls.target.copy(center);
        gamesLog('glb', 'No GLB camera found; using fallback camera.');
      }

      screenMesh = findScreenMesh(cabinetRoot);
      gamesLog('glb', 'screen mesh:', screenMesh);
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
      if (p) gamesLog('glb', `Loading GLB... ${p.toFixed(1)}%`);
    },
    (err) => {
      console.error('GLTF LOAD FAILED:', GLB_URL, err);
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
  screenSizeLocal = size.clone();
  screenCenterLocal = center.clone();

  const base = 2048;
  const w = base;
  const h = Math.round(base / TARGET_SCREEN_AR);

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

  setupPlayer();
  drawScreen();
  if (USE_SHARED_CONTROLS_GAMES) {
    sharedControlsAdapter = createGamesVideoAdapter({
      getViewportRect: getSharedControlsViewportRect,
      getScreenRect: getSharedControlsScreenRect,
      getActiveVideo: getSharedActiveVideo,
      getActiveAudio: getSharedActiveAudio,
      getContentMode: () => contentMode,
      setVolume: setSharedVolume,
      toggleMute: toggleSharedMute,
      setPlaybackRate: setSharedPlaybackRate,
      exit: exitSharedControls
    });
    sharedControlsUi = createVideoControlsUI();
    sharedControlsUi.setViewportRectProvider(sharedControlsAdapter.getViewportRect);
    sharedControlsUi.onAction = (action) => sharedControlsAdapter.dispatch(action);
    console.log('%c[games] shared controls ENABLED', 'color:#00ff66;font-weight:bold');
  } else {
    console.log('%c[games] legacy controls ENABLED', 'color:#ffaa00;font-weight:bold');
  }
}

function applyDefaultCameraTransform() {
  if (!activeCamera) return;
  // DEFAULT_CAMERA stores a world-space snapshot (position + quaternion).
  // If the camera is parented inside the GLB scene, convert the world snapshot
  // into the camera's local space so the transform takes effect correctly.
  const worldPos = DEFAULT_CAMERA.pos.clone();
  const worldQuat = DEFAULT_CAMERA.quat.clone();
  if (activeCamera.parent && activeCamera.parent !== scene) {
    // compute local position
    const localPos = worldPos.clone();
    activeCamera.parent.worldToLocal(localPos);
    // compute local quaternion: localQuat = parentWorldQuat^-1 * worldQuat
    const parentWorldQuat = new THREE.Quaternion();
    activeCamera.parent.getWorldQuaternion(parentWorldQuat);
    const invParentQuat = parentWorldQuat.clone().invert();
    const localQuat = invParentQuat.multiply(worldQuat.clone());
    activeCamera.position.copy(localPos);
    activeCamera.quaternion.copy(localQuat);
    activeCamera.rotation.setFromQuaternion(activeCamera.quaternion, 'XYZ');
  } else {
    activeCamera.position.copy(worldPos);
    activeCamera.quaternion.copy(worldQuat);
    activeCamera.rotation.setFromQuaternion(activeCamera.quaternion, 'XYZ');
  }
  if (activeCamera.isPerspectiveCamera && typeof DEFAULT_CAMERA.fov === 'number') {
    activeCamera.fov = DEFAULT_CAMERA.fov;
    activeCamera.updateProjectionMatrix();
  }
}

function getDefaultCameraSnapshot() {
  const quat = DEFAULT_CAMERA.rot
    ? new THREE.Quaternion().setFromEuler(DEFAULT_CAMERA.rot)
    : DEFAULT_CAMERA.quat.clone();
  return {
    position: DEFAULT_CAMERA.pos.clone(),
    quaternion: quat,
    fov: DEFAULT_CAMERA.fov
  };
}

function applyAlternateCameraTransform() {
  if (!activeCamera) return;
  activeCamera.position.set(1.152, 0.832, 0.001);
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

function getAlternateCameraSnapshot() {
  const pos = new THREE.Vector3(1.152, 0.832, 0.001);
  const rot = new THREE.Euler(
    THREE.MathUtils.degToRad(-89.7),
    THREE.MathUtils.degToRad(79.2),
    THREE.MathUtils.degToRad(89.7),
    'XYZ'
  );
  const quat = new THREE.Quaternion().setFromEuler(rot);
  return { position: pos, quaternion: quat, fov: 22.9 };
}

function animateCameraTo(target, durationMs = CAMERA_ZOOM_DURATION) {
  if (!activeCamera || !target) return;
  if (cameraAnimId) cancelAnimationFrame(cameraAnimId);
  cameraAnimStart = performance.now();
  cameraAnimFrom = captureCameraSnapshot();
  cameraAnimTo = target;

  const step = (now) => {
    const t = Math.min(1, (now - cameraAnimStart) / durationMs);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const pos = cameraAnimFrom.position.clone().lerp(cameraAnimTo.position, ease);
    const quat = cameraAnimFrom.quaternion.clone().slerp(cameraAnimTo.quaternion, ease);
    activeCamera.position.copy(pos);
    activeCamera.quaternion.copy(quat);
    activeCamera.rotation.setFromQuaternion(quat, 'XYZ');
    if (activeCamera.isPerspectiveCamera && typeof cameraAnimTo.fov === 'number') {
      const fov = cameraAnimFrom.fov + (cameraAnimTo.fov - cameraAnimFrom.fov) * ease;
      activeCamera.fov = fov;
      activeCamera.updateProjectionMatrix();
    }
    if (t < 1) {
      cameraAnimId = requestAnimationFrame(step);
    } else {
      cameraAnimId = null;
    }
  };
  cameraAnimId = requestAnimationFrame(step);
}

function applyCameraMode(altView, opts = {}) {
  cameraZoomAlt = altView;
  const animate = opts.animate !== false;
  const target = cameraZoomAlt ? getAlternateCameraSnapshot() : getDefaultCameraSnapshot();
  if (animate) {
    animateCameraTo(target, CAMERA_ZOOM_DURATION);
  } else {
    applyCameraSnapshot(target);
  }
  setExitControlVisible(contentMode !== 'menu');
  updateControlsForContent(contentMode);
}

function startIntroAnimation() {
  // Start immediately at the default transform (intro animation disabled).
  introActive = false;
  applyDefaultCameraTransform();
}

function captureCameraSnapshot() {
  if (!activeCamera) return null;
  // Capture a world-space snapshot so restores work regardless of camera parenting.
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  activeCamera.getWorldPosition(pos);
  activeCamera.getWorldQuaternion(quat);
  return {
    position: pos,
    quaternion: quat,
    fov: activeCamera.isPerspectiveCamera ? activeCamera.fov : null
  };
}

function setDefaultCameraFromActive() {
  if (!activeCamera) return;
  // Update DEFAULT_CAMERA in-place so references remain valid
  // capture world-space snapshot so it can be reapplied regardless of parenting
  const worldPos = new THREE.Vector3();
  const worldQuat = new THREE.Quaternion();
  activeCamera.getWorldPosition(worldPos);
  activeCamera.getWorldQuaternion(worldQuat);
  DEFAULT_CAMERA.pos.copy(worldPos);
  // prefer quaternion path; remove explicit rot to use quat on apply
  try { delete DEFAULT_CAMERA.rot; } catch (e) { DEFAULT_CAMERA.rot = undefined; }
  DEFAULT_CAMERA.quat.copy(worldQuat);
  if (activeCamera.isPerspectiveCamera && typeof activeCamera.fov === 'number') {
    DEFAULT_CAMERA.fov = activeCamera.fov;
  }
  console.log('[camera] setDefaultCameraFromActive()', { worldPos: DEFAULT_CAMERA.pos.clone(), worldQuat: DEFAULT_CAMERA.quat.clone(), fov: DEFAULT_CAMERA.fov });
}

function applyCameraSnapshot(snapshot) {
  if (!snapshot || !activeCamera) return;
  // snapshot is expected to be world-space; convert to local if camera has a parent.
  const worldPos = snapshot.position.clone();
  const worldQuat = snapshot.quaternion.clone();
  if (activeCamera.parent && activeCamera.parent !== scene) {
    const localPos = worldPos.clone();
    activeCamera.parent.worldToLocal(localPos);
    const parentWorldQuat = new THREE.Quaternion();
    activeCamera.parent.getWorldQuaternion(parentWorldQuat);
    const invParentQuat = parentWorldQuat.clone().invert();
    const localQuat = invParentQuat.multiply(worldQuat.clone());
    activeCamera.position.copy(localPos);
    activeCamera.quaternion.copy(localQuat);
    activeCamera.rotation.setFromQuaternion(activeCamera.quaternion, 'XYZ');
  } else {
    activeCamera.position.copy(worldPos);
    activeCamera.quaternion.copy(worldQuat);
    activeCamera.rotation.setFromQuaternion(worldQuat, 'XYZ');
  }
  if (activeCamera.isPerspectiveCamera && typeof snapshot.fov === 'number') {
    activeCamera.fov = snapshot.fov;
    activeCamera.updateProjectionMatrix();
  }
}

function setupPlayer() {
  if (player) return;
  if (!screenCanvas) return;
    player = VideoPlayer.create(screenCanvas, {
      allowSound: true,
      controlsOnlyWhenPlaying: false,
      controlsHideDelay: 2000,
      controlsFadeDuration: 200,
      onBackClick: () => {
        if (contentMode === 'video') stopVideoReel();
      },
      onPitchToggle: (preserve) => {
        const audio = getSharedActiveAudio() || playerAudio || reelAudio;
        if (audio) setPreservePitchFlag(audio, preserve);
      },
      onSeek: (video) => {
        const audio = getSharedActiveAudio() || playerAudio || reelAudio;
        if (video && audio) syncAudioToVideo(video, audio);
      },
      getAudioState: () => {
        const audio = getSharedActiveAudio() || playerAudio || reelAudio;
        if (!audio) return null;
        return {
          muted: !!audio.muted,
          volume: Number.isFinite(audio.volume) ? audio.volume : 0
        };
      },
      onVolumeChange: (volume) => {
        const audio = getSharedActiveAudio() || playerAudio || reelAudio;
        if (!Number.isFinite(volume)) return;
        setStoredAudioVolume(volume);
        if (audio) applyAudioSettings(audio);
        const activeVideo = (contentMode === 'video' && reelVideo) ? reelVideo : playerVideo;
        if (activeVideo) applyVideoAudioSettings(activeVideo);
      },
      onToggleMute: () => {
        const audio = getSharedActiveAudio() || playerAudio || reelAudio;
        const nextMuted = !getStoredAudioSettings().muted;
        setStoredAudioMuted(nextMuted);
        if (audio) applyAudioSettings(audio);
        const activeVideo = (contentMode === 'video' && reelVideo) ? reelVideo : playerVideo;
        if (activeVideo) applyVideoAudioSettings(activeVideo);
      }
    });
  player.loadVideos([VIDEO_SRC]);
  player.setActiveVideo(0, { showControls: true });

  playerVideo = player.videos[0] || null;
  playerBaseVideo = playerVideo;
  if (playerVideo) {
    playerVideo.crossOrigin = 'anonymous';
    playerVideo.playsInline = true;
    playerVideo.setAttribute('playsinline', '');
    playerVideo.preload = 'metadata';
    forceHideVideoElement(playerVideo);
    playerAudio = createAudioElement(VIDEO_AUDIO.reel);
    applyVideoAudioSettings(playerVideo);
    applyAudioSettings(playerAudio);
    playerVideo.addEventListener('loadedmetadata', () => {
      videoReady = true;
      needsRedraw = true;
    });
    playerVideo.addEventListener('play', () => { if (player) player.showControlsTemporarily(); needsRedraw = true; });
    playerVideo.addEventListener('pause', () => { needsRedraw = true; });
    playerVideo.addEventListener('ended', () => { needsRedraw = true; });
    playerVideo.addEventListener('play', () => { startAudioForVideo(playerVideo, playerAudio); });
    playerVideo.addEventListener('pause', () => { if (playerAudio) playerAudio.pause(); });
    playerVideo.addEventListener('seeking', () => { syncAudioToVideo(playerVideo, playerAudio); });
    playerVideo.addEventListener('timeupdate', () => { syncAudioToVideo(playerVideo, playerAudio); });
    playerVideo.addEventListener('ratechange', () => {
      if (playerAudio) {
        try { playerAudio.playbackRate = playerVideo.playbackRate; } catch (e) { /* ignore */ }
      }
    });
    playerVideo.playbackRate = SPEED_RATES[speedIndex];
  }
}

function bindPlayerToVideo(video, showControls = true) {
  if (!player || !video) return;
  forceHideVideoElement(video);
  player.loadVideos([video]);
  player.setActiveVideo(0, { showControls });
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
    // DevTools check for Construct audio bridge:
    // document.querySelector('#gameFrame')?.contentWindow?.C3Audio_DOMInterface
    try {
      const target = new URL(url, window.location.href);
      if (target.origin !== window.location.origin) {
        console.warn('[games] game iframe is cross-origin; audio bridge disabled', target.origin);
      }
    } catch (e) { /* ignore */ }
  stopVideoReel();
  destroyGameIframe();
  setHoveredVideo(null);
  gameReady = false;
  gameCanvas = null;
  lastGameCanvas = null;
  lastGameCanvasSize = '';
  loggedCanvasAttach = false;
  const gameMeta = GAME_LIST.find((g) => g.url === url);
  loggedCanvasLoss = false;
  loggedDrawError = false;
  loggedDrawSuccess = false;
  loggedGameRect = false;
  currentGameId = gameMeta ? gameMeta.id : null;
  contentMode = 'game';
  if (gameMeta && gameMeta.id && GAME_SPLASH_DURATIONS_MS[gameMeta.id]) {
    splashDurationMs = GAME_SPLASH_DURATIONS_MS[gameMeta.id];
  } else {
    splashDurationMs = GAME_SPLASH_DURATION_MS;
  }
  // Save current menu camera as the new default so we return to this view when leaving.
  setDefaultCameraFromActive();
  // Capture the current view as the return transform immediately before entering content.
  userReturnTransform = captureCameraSnapshot();
  console.log('[camera] startGame() preset userReturnTransform=', userReturnTransform);
  enterContentView();
  overlayActive = false;
  cssGameActive = renderMode === 'css3d';
  if (cssGameActive) {
    ensureCssGameObject();
  } else {
    ensureGameContainer();
  }

    gameIframe = document.createElement('iframe');
    gameIframe.id = 'gameFrame';
    gameIframe.src = url;
    gameIframe.addEventListener('load', () => {
      applyGameMediaSettings(true);
      gameAudioBridge.attach(gameIframe);
      const { muted, volume } = getStoredAudioSettings();
      gameAudioBridge.setVolume01(volume);
      gameAudioBridge.setMuted(muted);
      updateGameAudioControlsState();
    }, { once: true });
    gameIframe.allow = 'fullscreen; gamepad; autoplay';
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
    setGameAudioControlsVisible(true);
    gameAudioBridge.attach(gameIframe);
    const { muted, volume } = getStoredAudioSettings();
    gameAudioBridge.setVolume01(volume);
    gameAudioBridge.setMuted(muted);
    updateGameAudioControlsState();
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

function ensureGameAudioControls() {
  if (!SHOW_GAME_AUDIO_PANEL) return;
  if (gameAudioUi) return;
  const wrap = document.createElement('div');
  wrap.className = 'game-audio-controls';

  const label = document.createElement('div');
  label.className = 'game-audio-label';
  label.textContent = 'Game Audio';
  wrap.appendChild(label);

  const row = document.createElement('div');
  row.className = 'game-audio-row';

  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.className = 'game-audio-mute';
  muteBtn.textContent = 'Mute';
  row.appendChild(muteBtn);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = '100';
  slider.className = 'game-audio-slider';
  row.appendChild(slider);

  wrap.appendChild(row);

  const status = document.createElement('div');
  status.className = 'game-audio-status';
  status.textContent = '';
  wrap.appendChild(status);

  wrap.style.display = 'none';
  stage.appendChild(wrap);

  muteBtn.addEventListener('click', () => {
    const state = gameAudioBridge.getState();
    if (!state.available) return;
    gameAudioBridge.setMuted(!state.muted);
    updateGameAudioControlsState();
  });

  slider.addEventListener('input', () => {
    const state = gameAudioBridge.getState();
    if (!state.available) return;
    const val = Math.max(0, Math.min(100, parseInt(slider.value, 10) || 0));
    const next = val / 100;
    if (state.muted && next > 0) gameAudioBridge.setMuted(false);
    gameAudioBridge.setVolume01(next);
    updateGameAudioControlsState();
  });

  gameAudioUi = { wrap, label, muteBtn, slider, status };
}

function setGameAudioControlsVisible(visible) {
  if (!SHOW_GAME_AUDIO_PANEL) return;
  ensureGameAudioControls();
  if (!gameAudioUi) return;
  gameAudioUi.wrap.style.display = visible ? 'flex' : 'none';
}

function updateGameAudioControlsState() {
  if (!SHOW_GAME_AUDIO_PANEL) return;
  if (!gameAudioUi) return;
  const state = gameAudioBridge.getState();
  gameAudioUi.muteBtn.disabled = !state.available;
  gameAudioUi.slider.disabled = !state.available;
  gameAudioUi.slider.value = Math.round(Math.max(0, Math.min(1, state.volume || 0)) * 100).toString();
  gameAudioUi.muteBtn.textContent = state.muted ? 'Unmute' : 'Mute';
  gameAudioUi.status.textContent = state.available ? '' : 'Volume controls unavailable for this embed.';
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
  ensureSplashImage(currentGameId);
  needsRedraw = true;
}

function hideGameSplash() {
  clearSplashAnimation();
  splashActive = false;
  splashReady = false;
  splashPlayRect = null;
  needsRedraw = true;
}

function ensureSplashImage(gameId) {
  const key = (gameId && GAME_SPLASH_IMAGES[gameId]) ? gameId : 'default';
  if (splashImages.has(key)) {
    splashImage = splashImages.get(key);
    return;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = GAME_SPLASH_IMAGES[gameId] || assetUrl('games/game-splash-screen.png');
  splashImages.set(key, img);
  splashImage = img;
}

function ensureVideoThumb(videoId) {
  if (videoThumbImages.has(videoId)) return videoThumbImages.get(videoId);
  const src = VIDEO_THUMBS[videoId];
  if (!src) return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = src;
  img.onload = () => { needsRedraw = true; };
  videoThumbImages.set(videoId, img);
  return img;
}

function ensurePreviewVideo(videoId) {
  if (videoPreviewVideos.has(videoId)) return videoPreviewVideos.get(videoId);
  const src = VIDEO_LQ[videoId];
  if (!src) return null;
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.preload = 'metadata';
  v.playsInline = true;
  v.muted = true;
  v.src = src;
  forceHideVideoElement(v);
  v.loop = true;
  v.setAttribute('playsinline', '');
  v.addEventListener('error', () => {
    const err = v.error;
    console.warn('VIDEO ERROR:', v.src, err ? { code: err.code, message: err.message } : err);
  });
  videoPreviewVideos.set(videoId, v);
  return v;
}

function startPreviewSnippet(video) {
  if (!video || !isFinite(video.duration) || video.duration <= 0) return;
  const t = Math.random() * Math.max(0, video.duration - 1);
  try {
    video.currentTime = t;
    video.play().catch(() => {});
  } catch (e) {
    /* ignore */
  }
}

function ensureGameThumb(gameId) {
  if (gameThumbImages.has(gameId)) return gameThumbImages.get(gameId);
  const src = GAME_THUMBS[gameId];
  if (!src) return null;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = src;
  img.onload = () => { needsRedraw = true; };
  gameThumbImages.set(gameId, img);
  return img;
}

function ensureGameLabel(gameId) {
  if (gameLabelImages.has(gameId)) return gameLabelImages.get(gameId);
  const src = GAME_LABEL_SVGS[gameId];
  if (!src) {
    gameLabelImages.set(gameId, null);
    return null;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.loading = 'eager';
  img.src = src;
  img.onload = () => { needsRedraw = true; };
  gameLabelImages.set(gameId, img);
  return img;
}

function getSplashProgress(nowMs) {
  if (!splashActive) return 1;
  const elapsed = Math.max(0, nowMs - splashStart);
  const duration = splashDurationMs || GAME_SPLASH_DURATION_MS;
  const t = Math.min(1, elapsed / duration);
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

function getSharedControlsViewportRect() {
  const rect = getScreenMeshRect();
  if (!rect) return null;
  return { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
}

function getSharedControlsScreenRect() {
  if (!screenCanvas) return null;
  return { x: 0, y: 0, w: screenCanvas.width, h: screenCanvas.height };
}

function forceHideVideoElement(video) {
  if (!video) return;
  try {
    video.controls = false;
    video.removeAttribute('controls');
    video.playsInline = true;
    video.muted = true;
    video.style.display = 'none';
  } catch (e) { /* ignore */ }
}

function getSharedActiveVideo() {
  if (contentMode !== 'video') return null;
  return reelVideo || null;
}

function getSharedActiveAudio() {
  if (contentMode !== 'video') return null;
  return reelAudio || null;
}

function setSharedVolume(value) {
  const audio = getSharedActiveAudio();
  if (!audio || !Number.isFinite(value)) return;
  audio.volume = Math.max(0, Math.min(1, value));
  if (audio.volume > 0.001) audio.muted = false;
}

function toggleSharedMute() {
  const audio = getSharedActiveAudio();
  if (!audio) return;
  audio.muted = !audio.muted;
}

function setSharedPlaybackRate(rate) {
  const video = getSharedActiveVideo();
  if (!video || !Number.isFinite(rate)) return;
  video.playbackRate = rate;
}

function exitSharedControls() {
  if (contentMode === 'game') {
    exitGameImmediate();
  } else if (contentMode === 'video') {
    stopVideoReel();
  }
}

function mapPointerToScreenPixels(ev) {
  const hit = raycastScreen(ev);
  if (!hit) return null;
  return { x: hit.displayX, y: hit.displayY };
}

function mapControlsPoint(pt) {
  const rect = sharedControlsAdapter?.getScreenRect?.() || contentRect;
  if (!pt || !rect || !screenCanvas) return pt;
  if (!CONTROLS_INPUT_FLIP_Y) return pt;
  const y = rect.y + rect.h - (pt.y - rect.y);
  return { x: pt.x, y };
}

function getUiPointFromHit(hit) {
  if (!hit) return null;
  return mapControlsPoint({ x: hit.displayX, y: hit.displayY });
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
  currentGameId = null;
  if (cameraPanelInputBtn) cameraPanelInputBtn.textContent = 'Game input: off';
  setOverlayActive(false);
  clearSplashAnimation();
  splashActive = false;
  splashReady = false;
    splashPlayRect = null;
    setScreenMeshHidden(false);
    setGameAudioControlsVisible(false);
  }

function exitGameImmediate() {
  if (!gameIframe) return;
  destroyGameIframe();
  contentMode = 'menu';
  setExitControlVisible(false);
  restoreViewAfterContent();
  needsRedraw = true;
}

function startVideoReel(entry) {
  if (!screenCanvas) return;
  stopVideoReel();
  setHoveredVideo(null);
  contentMode = 'video';
  loggedReelRect = false;
  console.log(`[games-reel] canvas=${screenCanvas.width}x${screenCanvas.height} screenAR=${(screenCanvas.width / screenCanvas.height).toFixed(3)} targetAR=${TARGET_SCREEN_AR.toFixed(3)}`);
  reelSource = entry && entry.src ? entry.src : '';
  const audioSrc = entry && entry.id ? VIDEO_AUDIO[entry.id] : null;
  // Preserve the current menu camera as the video-default so exiting the reel returns here.
  setDefaultCameraFromActive();
  userReturnTransform = captureCameraSnapshot();
  console.log('[camera] startVideoReel() preset userReturnTransform=', userReturnTransform);
  enterContentView();
  reelVideo = document.createElement('video');
  reelVideo.crossOrigin = 'anonymous';
  reelVideo.preload = 'metadata';
  reelVideo.playsInline = true;
  reelVideo.muted = true;
  reelVideo.src = reelSource;
  reelVideo.dataset.title = (entry && entry.title) ? entry.title : 'Game Reel';
  reelVideo.loop = false;
  reelVideo.setAttribute('playsinline', '');
  forceHideVideoElement(reelVideo);
  reelVideo.addEventListener('error', () => {
    const err = reelVideo.error;
    console.warn('VIDEO ERROR:', reelVideo.src, err ? { code: err.code, message: err.message } : err);
  });
  if (audioSrc) {
    reelAudio = createAudioElement(audioSrc);
  }
  applyVideoAudioSettings(reelVideo);
  if (reelAudio) applyAudioSettings(reelAudio);
  reelVideo.addEventListener('loadedmetadata', () => {
    reelReady = true;
    needsRedraw = true;
  });
  reelVideo.addEventListener('play', () => { if (player) player.showControlsTemporarily(); needsRedraw = true; });
  reelVideo.addEventListener('pause', () => { if (player) player.showControlsTemporarily(); needsRedraw = true; });
  reelVideo.addEventListener('ended', () => { stopVideoReel(); });
  reelVideo.addEventListener('play', () => { startAudioForVideo(reelVideo, reelAudio); });
  reelVideo.addEventListener('pause', () => { if (reelAudio) reelAudio.pause(); });
  reelVideo.addEventListener('seeking', () => { syncAudioToVideo(reelVideo, reelAudio); });
  reelVideo.addEventListener('timeupdate', () => { syncAudioToVideo(reelVideo, reelAudio); });
  reelVideo.addEventListener('ratechange', () => {
    if (reelAudio) {
      try { reelAudio.playbackRate = reelVideo.playbackRate; } catch (e) { /* ignore */ }
    }
  });
  bindPlayerToVideo(reelVideo, true);
  reelVideo.play().catch(() => {});
  needsRedraw = true;
  setExitControlVisible(true);
}

function stopVideoReel() {
  if (!reelVideo) return;
  reelVideo.pause();
  if (reelAudio) {
    try { reelAudio.pause(); } catch (e) {}
    reelAudio = null;
  }
  reelVideo.removeAttribute('src');
  reelVideo.load();
  reelVideo = null;
  reelReady = false;
  reelSource = '';
  loggedReelRect = false;
  loggedGameRect = false;
  contentMode = 'menu';
  if (playerBaseVideo) {
    bindPlayerToVideo(playerBaseVideo, false);
  }
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
  updateCameraPanel();

  if (contentMode === 'menu' && hoveredVideoId) {
    needsRedraw = true;
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

  setExitControlVisible(cameraZoomAlt && (contentMode === 'game' || contentMode === 'video'));
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

  ctx.fillStyle = (contentMode === 'video') ? '#000' : letterboxColor;
  ctx.fillRect(0, 0, W, H);

  const surface = { x: 0, y: 0, w: W, h: H };
  let videoRect = null;
  if (contentMode === 'menu') {
    contentRect = surface;
  } else if (contentMode === 'game') {
    contentRect = surface;
  } else {
    contentRect = surface;
    if (contentMode === 'video' && reelReady && reelVideo) {
      const srcW = reelVideo.videoWidth || 16;
      const srcH = reelVideo.videoHeight || 9;
      videoRect = rectRound(fitRectContain(srcW, srcH, surface));
    } else {
      const activeAspect = (videoReady && playerVideo && playerVideo.videoWidth && playerVideo.videoHeight)
        ? playerVideo.videoWidth / playerVideo.videoHeight
        : 16 / 9;
      videoRect = fitRectToAspect(surface, activeAspect);
    }
  }
  activeVideoRect = (contentMode === 'video') ? videoRect : null;

    const canDrawGame = contentMode === 'game' && !cssGameActive && !overlayActive && !splashActive && isCanvasUsable(gameCanvas);
    if (splashActive) {
      const screenRect = surface;
      const uiLayout = computeGameUiLayout(screenRect, GAME_FRAME_ASPECT);
      gameUiLayout = uiLayout;
      if ((now - lastGameAudioSync) > 1000) {
        lastGameAudioSync = now;
        applyGameMediaSettings();
      }
      drawGameSplash(ctx, uiLayout.gameRect, now);

    const theme = { bg: getCssVar('--controls-bg', '#0b0f1a'), fg: getCssVar('--controls-fg', '#fff'), alpha: parseFloat(getCssVar('--controls-bg-alpha', '0.9')) };
    ctx.save();
    ctx.globalAlpha = Number.isFinite(theme.alpha) ? theme.alpha : 0.9;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(uiLayout.top.x, uiLayout.top.y, uiLayout.top.w, uiLayout.top.h);
    if (uiLayout.bottom) {
      ctx.fillRect(uiLayout.bottom.x, uiLayout.bottom.y, uiLayout.bottom.w, uiLayout.bottom.h);
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = theme.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(uiLayout.top.h * 0.42)}px "Source Sans 3","Segoe UI",sans-serif`;
    ctx.fillText(getCurrentGameTitle(), uiLayout.titleRect.x + uiLayout.titleRect.w / 2, uiLayout.titleRect.y + uiLayout.titleRect.h / 2 + 1);
    ctx.restore();

      const audioState = getGameAudioState();
      if (player) {
        player.drawBackButton(uiLayout.backRect, theme.fg);
        if (audioState.available) {
          player.drawMuteButton(uiLayout.muteRect, audioState.muted, theme.fg, audioState.volume);
        }
      }
      if (audioState.available) {
        const vol = audioState.muted ? 0 : Math.max(0, Math.min(1, (audioState.volume || 0) / GAME_AUDIO_MAX));
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = theme.fg;
        ctx.fillRect(uiLayout.sliderRect.x, uiLayout.sliderRect.y, uiLayout.sliderRect.w, uiLayout.sliderRect.h);
        ctx.restore();
        ctx.save();
        ctx.fillStyle = theme.fg;
        ctx.fillRect(uiLayout.sliderRect.x, uiLayout.sliderRect.y, uiLayout.sliderRect.w * vol, uiLayout.sliderRect.h);
        const dotX = uiLayout.sliderRect.x + uiLayout.sliderRect.w * vol;
        ctx.beginPath();
        ctx.arc(dotX, uiLayout.sliderRect.y + uiLayout.sliderRect.h / 2, Math.max(4, Math.round(uiLayout.sliderRect.h * 0.6)), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = theme.fg;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.round(uiLayout.bottom ? uiLayout.bottom.h * 0.35 : uiLayout.top.h * 0.3)}px "Source Sans 3","Segoe UI",sans-serif`;
        const msg = 'Volume controls unavailable for this embed.';
        const msgY = (uiLayout.bottom ? uiLayout.bottom.y + uiLayout.bottom.h / 2 : uiLayout.top.y + uiLayout.top.h / 2);
        ctx.fillText(msg, uiLayout.sliderRect.x, msgY);
        ctx.restore();
      }
    } else if (canDrawGame) {
      try {
        const screenRect = surface;
        const uiLayout = computeGameUiLayout(screenRect, GAME_FRAME_ASPECT);
        gameUiLayout = uiLayout;
        if ((now - lastGameAudioSync) > 1000) {
          lastGameAudioSync = now;
          applyGameMediaSettings();
        }
        const gameRect = rectRound(fitRectContain(gameCanvas.width || GAME_FRAME_WIDTH, gameCanvas.height || GAME_FRAME_HEIGHT, uiLayout.gameRect));
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(gameCanvas, gameRect.x, gameRect.y, gameRect.w, gameRect.h);
        ctx.imageSmoothingEnabled = true;

      const theme = { bg: getCssVar('--controls-bg', '#0b0f1a'), fg: getCssVar('--controls-fg', '#fff'), alpha: parseFloat(getCssVar('--controls-bg-alpha', '0.9')) };
      ctx.save();
      ctx.globalAlpha = Number.isFinite(theme.alpha) ? theme.alpha : 0.9;
      ctx.fillStyle = theme.bg;
      ctx.fillRect(uiLayout.top.x, uiLayout.top.y, uiLayout.top.w, uiLayout.top.h);
      if (uiLayout.bottom) {
        ctx.fillRect(uiLayout.bottom.x, uiLayout.bottom.y, uiLayout.bottom.w, uiLayout.bottom.h);
      }
      ctx.restore();

      ctx.save();
      ctx.fillStyle = theme.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(uiLayout.top.h * 0.42)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(getCurrentGameTitle(), uiLayout.titleRect.x + uiLayout.titleRect.w / 2, uiLayout.titleRect.y + uiLayout.titleRect.h / 2 + 1);
      ctx.restore();

        if (player) {
          player.drawBackButton(uiLayout.backRect, theme.fg);
        }

        const audioState = getGameAudioState();
        if (audioState.available && player) {
          player.drawMuteButton(uiLayout.muteRect, audioState.muted, theme.fg, audioState.volume);
        }
      if (audioState.available) {
          const vol = audioState.muted ? 0 : Math.max(0, Math.min(1, (audioState.volume || 0) / GAME_AUDIO_MAX));
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = theme.fg;
          ctx.fillRect(uiLayout.sliderRect.x, uiLayout.sliderRect.y, uiLayout.sliderRect.w, uiLayout.sliderRect.h);
          ctx.restore();
          ctx.save();
          ctx.fillStyle = theme.fg;
          ctx.fillRect(uiLayout.sliderRect.x, uiLayout.sliderRect.y, uiLayout.sliderRect.w * vol, uiLayout.sliderRect.h);
          const dotX = uiLayout.sliderRect.x + uiLayout.sliderRect.w * vol;
          ctx.beginPath();
          ctx.arc(dotX, uiLayout.sliderRect.y + uiLayout.sliderRect.h / 2, Math.max(4, Math.round(uiLayout.sliderRect.h * 0.6)), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = 0.75;
          ctx.fillStyle = theme.fg;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.font = `${Math.round(uiLayout.bottom.h * 0.35)}px "Source Sans 3","Segoe UI",sans-serif`;
          ctx.fillText('Volume controls unavailable for this embed.', uiLayout.sliderRect.x, uiLayout.bottom.y + uiLayout.bottom.h / 2);
          ctx.restore();
        }
      if (!loggedGameRect) {
        loggedGameRect = true;
        const gw = gameCanvas.width || GAME_FRAME_WIDTH;
        const gh = gameCanvas.height || GAME_FRAME_HEIGHT;
        const cw = screenCanvas.width;
        const ch = screenCanvas.height;
        console.log(`[games-game] gameCanvas=${gw}x${gh} gameAR=${(gw / gh).toFixed(3)} screenCanvas=${cw}x${ch} screenAR=${(cw / ch).toFixed(3)} gameRect=${JSON.stringify(gameRect)}`);
      }
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
        const screenRect = surface;
        const target = videoRect || contentRect;
        safeDrawVideo(ctx, reelVideo, target.x, target.y, target.w, target.h);

        if (!loggedReelRect) {
          loggedReelRect = true;
          console.log('[games-reel] screenRect', screenRect, 'screenAR=' + (screenRect.w / screenRect.h).toFixed(3));
          console.log('[games-reel] videoRect', target, 'videoAR=' + (target.w / target.h).toFixed(3));
        }
      } catch (e) { /* ignore */ }
    } else if (contentMode === 'menu') {
      drawMenu(ctx, contentRect);
    } else if (videoReady && playerVideo) {
      try {
        const target = videoRect || contentRect;
        safeDrawVideo(ctx, playerVideo, target.x, target.y, target.w, target.h);
      } catch (e) { /* ignore */ }
    }

  const isVideoContent = sharedControlsAdapter ? sharedControlsAdapter.isActive() : (contentMode === 'video' && !!getSharedActiveVideo());
  if (USE_SHARED_CONTROLS_GAMES && sharedControlsUi && sharedControlsAdapter) {
    if (sharedControlsActive !== isVideoContent) {
      sharedControlsActive = isVideoContent;
      if (sharedControlsActive) {
        const screenRect = sharedControlsAdapter.getScreenRect?.();
        console.log('%c[games-controls] ACTIVE screenRect=' + JSON.stringify(screenRect), 'color:#00ffd5;font-weight:bold');
      } else {
        console.log('%c[games-controls] INACTIVE', 'color:#b000ff;font-weight:bold');
      }
    }
  }
  if (isVideoContent) {
    const rect = videoRect || contentRect;
    if (!getSharedActiveVideo() || getSharedActiveVideo().paused || getSharedActiveVideo().ended) {
      drawPlayOverlay(ctx, rect);
    }
  }

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (USE_SHARED_CONTROLS_GAMES && sharedControlsUi && sharedControlsAdapter && isVideoContent) {
      const now = performance.now();
      if ((now - lastControlsDrawLog) >= 1000) {
        lastControlsDrawLog = now;
        const screenRect = sharedControlsAdapter.getScreenRect?.();
        console.log('%c[games-controls] draw using screenRect ' + JSON.stringify(screenRect), 'color:#00ccff');
      }
      if (player && getSharedActiveVideo()) {
        if (sharedControlsVideo !== getSharedActiveVideo()) {
          sharedControlsVideo = getSharedActiveVideo();
          bindPlayerToVideo(sharedControlsVideo, true);
        }
        if (player.state) {
          if (!player.state.playingFull) {
            player.state.playingFull = true;
            player.state.fullIndex = 0;
            player.state.activeIndex = 0;
            player.showControlsTemporarily();
          }
          if (getSharedActiveVideo().paused || getSharedActiveVideo().ended) {
            player.state.controlsVisible = 1;
            player.state.controlsTarget = 1;
          }
        }
      }
    sharedControlsUi.setState(sharedControlsAdapter.getState());
    sharedControlsUi.draw(ctx, {
      drawLegacy: () => {
        if (!player) return;
        const bounds = sharedControlsAdapter.getScreenRect?.() || { x: 0, y: 0, w: W, h: H };
        player.setControlsBounds(bounds);
        if (CONTROLS_DRAW_FLIP_Y) {
          ctx.save();
          ctx.translate(0, bounds.y * 2 + bounds.h);
          ctx.scale(1, -1);
          player.updateControls();
          player.drawControls();
          ctx.restore();
        } else {
          player.updateControls();
          player.drawControls();
        }
      }
    });
  } else if (!USE_SHARED_CONTROLS_GAMES && player) {
    player.setControlsBounds(contentRect || { x: 0, y: 0, w: W, h: H });
    const showControls = (contentMode !== 'menu') ||
      (playerVideo && !playerVideo.paused && !playerVideo.ended) ||
      (reelVideo && !reelVideo.paused && !reelVideo.ended);
    if (showControls) {
      player.updateControls();
      player.drawControls();
    }
  }
  ctx.restore();

  screenTexture.needsUpdate = true;
  needsRedraw = false;
}

function drawPlayOverlay(ctx, rect) {
  const size = Math.min(rect.w, rect.h) * 0.22;
  const x = rect.x + (rect.w - size) / 2;
  const y = rect.y + (rect.h - size) / 2;
  const fg = getCssVar('--controls-fg', '#fff');
  ctx.save();
  ctx.strokeStyle = fg;
  ctx.lineWidth = Math.max(3, Math.round(size * 0.08));
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = fg;
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
    const targetRect = rectRound(fitRectContain(16, 9, box));
    const imgRect = fitRectToAspect(targetRect, imgAspect);
    safeDrawImage(ctx, splashImage, imgRect.x, imgRect.y, imgRect.w, imgRect.h);
  }

  const barW = rect.w * 0.72;
  const barH = Math.max(12, Math.round(rect.h * 0.04));
  const barX = rect.x + (rect.w - barW) / 2;
  const barY = rect.y + rect.h * 0.78;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = getCssVar('--tertiary-color', '#7e3ccf');
  ctx.fillRect(barX, barY, barW * progress, barH);

  const btnR = Math.min(rect.w, rect.h) * 0.07;
  const btnX = rect.x + rect.w / 2;
  const btnY = rect.y + rect.h / 2;
  splashPlayRect = { x: btnX, y: btnY, r: btnR };

  ctx.globalAlpha = ready ? 1 : 0.3;
  ctx.fillStyle = getCssVar('--tertiary-color', '#7e3ccf');
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
  const hoverVideoScale = 1.03;
  const hoverCircleScale = 1.08;
  const hoverTextScale = 1.06;
  const hoverGlowColor = 'rgba(63, 255, 120, 0.85)';
  const hoverGlowBlurVideo = Math.max(14, Math.round(rect.w * 0.012));
  const hoverGlowBlurGame = Math.max(8, Math.round(rect.w * 0.008));
  const hoverGlowLineVideo = Math.max(3, Math.round(rect.w * 0.0025));
  const hoverGlowLineGame = Math.max(3, Math.round(rect.w * 0.002));

  const reelsTitleImg = ensureVideoTitleImage('reels');
  if (layout.videoTitleRect && reelsTitleImg && reelsTitleImg.complete) {
    safeDrawImage(
      ctx,
      reelsTitleImg,
      layout.videoTitleRect.x,
      layout.videoTitleRect.y,
      layout.videoTitleRect.w,
      layout.videoTitleRect.h
    );
  }
  const samplesTitleImg = ensureVideoTitleImage('samples');
  if (layout.magentaTitleRect && samplesTitleImg && samplesTitleImg.complete) {
    safeDrawImage(
      ctx,
      samplesTitleImg,
      layout.magentaTitleRect.x,
      layout.magentaTitleRect.y,
      layout.magentaTitleRect.w,
      layout.magentaTitleRect.h
    );
  }

  layout.videos.forEach((slot) => {
    const thumb = ensureVideoThumb(slot.id);
    const preview = videoPreviewVideos.get(slot.id);
    const isHover = hoveredVideoId === slot.id;
    const source = (isHover && preview && !preview.paused) ? preview : thumb;
    const scale = isHover ? hoverVideoScale : 1;
    const drawW = slot.rect.w * scale;
    const drawH = slot.rect.h * scale;
    const drawX = slot.rect.x + (slot.rect.w - drawW) / 2;
    const drawY = slot.rect.y + (slot.rect.h - drawH) / 2;
    if (source) {
      if (source instanceof HTMLVideoElement) {
        safeDrawVideo(ctx, source, drawX, drawY, drawW, drawH);
      } else {
        safeDrawImage(ctx, source, drawX, drawY, drawW, drawH);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(drawX, drawY, drawW, drawH);
    }
    if (isHover) {
      ctx.save();
      ctx.shadowColor = hoverGlowColor;
      ctx.shadowBlur = hoverGlowBlurVideo;
      ctx.strokeStyle = 'rgba(63, 255, 120, 0.9)';
      ctx.lineWidth = hoverGlowLineVideo;
      ctx.strokeRect(drawX, drawY, drawW, drawH);
      ctx.restore();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = Math.max(2, Math.round(rect.w * 0.002));
      ctx.strokeRect(drawX, drawY, drawW, drawH);
    }
  });

  // Debug magenta rectangle disabled (layout still uses magTop/magBottom internally).

  layout.games.forEach((slot) => {
    const thumbRadius = slot.thumb ? slot.thumb.r : Math.min(slot.pill.h * 0.5, slot.pill.w * 0.2);
    const thumbCx = slot.thumb ? slot.thumb.cx : slot.pill.x;
    const thumbCy = slot.thumb ? slot.thumb.cy : (slot.pill.y + slot.pill.h / 2);

    // Draw the text boxes first so circles always sit on top.
    if (layout && layout.dividerLeft !== undefined && layout.rightRegion) {
      const isHover = hoveredGameId === slot.id;
      const padX = Math.max(8, Math.round(rect.w * 0.01));
      const RIGHT_MARGIN = 6;
      const baseX = Math.round(layout.dividerLeft + padX);
      const EXTRA_RIGHT = Math.max(8, Math.round(rect.w * 0.01));
      const baseW = Math.round(layout.rightRegion.right - baseX - RIGHT_MARGIN + EXTRA_RIGHT);
      const baseH = Math.max(28, Math.round(slot.pill ? slot.pill.h * 0.9 : (slot.textRect ? slot.textRect.h : 40)));
      const boxW = baseW;
      const boxH = baseH;
      const boxX = baseX;
      const boxY = Math.round(thumbCy - boxH / 2);
      ctx.fillStyle = getCssVar('--secondary-color', '#5a2a86');
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = getCssVar('--hl-secondary-color', '#1ca36b');
      ctx.lineWidth = Math.max(2, Math.round(rect.w * 0.0018));
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      ctx.fillStyle = '#ffffff';
      const baseFont = Math.max(20, Math.round(layout.itemHeight * 0.4));
      const fontSize = Math.round(baseFont * (isHover ? hoverTextScale : 1));
      ctx.font = `${fontSize}px "Arvo", "Times New Roman", serif`;
      ctx.textBaseline = 'top';
      const textGap = Math.max(8, Math.round(rect.w * 0.01));
      let textX = thumbCx + (slot.side === 'left' ? (thumbRadius + textGap) : -(thumbRadius + textGap));
      textX = Math.max(boxX + 6, Math.min(boxX + boxW - 6, textX));
      ctx.textAlign = slot.side === 'left' ? 'left' : 'right';
      const textY = Math.round(thumbCy - fontSize * 0.5);
      if (isHover) {
        ctx.save();
        ctx.shadowColor = hoverGlowColor;
        ctx.shadowBlur = hoverGlowBlurGame;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(slot.label, textX, textY);
        ctx.restore();
      }
      ctx.fillText(slot.label, textX, textY);
    }
  });

  layout.games.forEach((slot) => {
    const thumb = ensureGameThumb(slot.id);
    const thumbRadius = slot.thumb ? slot.thumb.r : Math.min(slot.pill.h * 0.5, slot.pill.w * 0.2);
    const thumbCx = slot.thumb ? slot.thumb.cx : slot.pill.x;
    const thumbCy = slot.thumb ? slot.thumb.cy : (slot.pill.y + slot.pill.h / 2);

    const isHover = hoveredGameId === slot.id;
    const scale = isHover ? hoverCircleScale : 1;

    if (thumb) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(thumbCx, thumbCy, thumbRadius * scale, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      safeDrawImage(ctx, thumb, thumbCx - thumbRadius * scale, thumbCy - thumbRadius * scale, thumbRadius * 2 * scale, thumbRadius * 2 * scale);
      ctx.restore();
    }
    if (isHover) {
      ctx.save();
      ctx.shadowColor = hoverGlowColor;
      ctx.shadowBlur = hoverGlowBlurGame;
      ctx.strokeStyle = 'rgba(63, 255, 120, 0.9)';
      ctx.lineWidth = hoverGlowLineGame;
      ctx.beginPath();
      ctx.arc(thumbCx, thumbCy, thumbRadius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = getCssVar('--hl-secondary-color', '#1ca36b');
    ctx.lineWidth = Math.max(3, Math.round(rect.w * 0.0025));
    ctx.beginPath();
    ctx.arc(thumbCx, thumbCy, thumbRadius * scale, 0, Math.PI * 2);
    ctx.stroke();
  });

  if (layout.dividerX) {
    const dividerW = Math.max(4, Math.round(rect.w * MENU_LAYOUT.dividerWidth));
    ctx.fillStyle = getCssVar('--hl-secondary-color', '#1ca36b');
    ctx.fillRect(layout.dividerX - dividerW / 2, rect.y, dividerW, rect.h);
  }
  if (layout.videoTitleRect) {
    const dividerW = Math.max(4, Math.round(rect.w * MENU_LAYOUT.dividerWidth));
    const titleBottom = layout.videoTitleRect.y + layout.videoTitleRect.h;
    const contentTop = layout.magTop !== undefined ? layout.magTop : titleBottom;
    const lineY = Math.round(titleBottom + (contentTop - titleBottom) * 0.55);
    ctx.fillStyle = getCssVar('--hl-secondary-color', '#1ca36b');
    ctx.fillRect(rect.x, lineY - dividerW / 2, rect.w, dividerW);
  }

  ctx.restore();
}

function ensureExitControl() {
  return null;
}

function setExitControlVisible(visible) {
  if (!ensureExitControl()) return;
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
  if (!hit) {
    if (contentMode === 'menu') clearMenuHover();
    return;
  }
  lastScreenHit = hit;
  if (contentMode === 'menu') {
    updateHoveredVideo(hit.x, hit.y);
    return;
  }
  if (contentMode === 'game' && gameUiLayout && gameVolumeDrag) {
    const uiPt = getUiPointFromHit(hit);
    if (!uiPt) return;
    const audioState = getGameAudioState();
    if (audioState.available) {
      const ratio = Math.max(0, Math.min(1, (uiPt.x - gameUiLayout.sliderRect.x) / gameUiLayout.sliderRect.w));
      const volume = ratio * GAME_AUDIO_MAX;
      if (audioState.muted && volume > 0) gameAudioBridge.setMuted(false);
      gameAudioBridge.setVolume01(volume);
      updateGameAudioControlsState();
    }
    return;
  }
  if (USE_SHARED_CONTROLS_GAMES && contentMode === 'video' && getSharedActiveVideo() && player && cameraZoomAlt) {
    const mapped = mapControlsPoint({ x: hit.displayX, y: hit.displayY });
    const event = toCanvasEvent(mapped.x, mapped.y);
    player.handlePointerMove(event);
    player.keepControlsVisible();
    return;
  }
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
  if (contentMode === 'menu' && ev.button === 2) return;
  if (USE_SHARED_CONTROLS_GAMES && sharedControlsUi && screenCanvas && contentMode === 'video' && getSharedActiveVideo()) {
    const screenPt = mapPointerToScreenPixels(ev);
      if (screenPt && player) {
        if (player.state) {
          player.state.playingFull = true;
          player.state.fullIndex = 0;
          player.state.activeIndex = 0;
          player.state.controlsVisible = 1;
          player.state.controlsTarget = 1;
        }
        const mapped = mapControlsPoint(screenPt);
        const event = toCanvasEvent(mapped.x, mapped.y);
        player.handleClick(event);
        player.handlePointerDown(event);
        player.keepControlsVisible();
        console.log('[games] screen click px:', Math.round(screenPt.x), Math.round(screenPt.y), 'handled:', true);
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
  }
  const hit = raycastScreen(ev);
  if (!hit) {
    controls.enabled = true;
    return;
  }
  lastScreenHit = hit;

    if (contentMode === 'game' && gameUiLayout) {
      const uiPt = getUiPointFromHit(hit);
      if (!uiPt) return;
      const px = uiPt.x;
      const py = uiPt.y;
      if (pointInRect(px, py, gameUiLayout.backRect)) {
        exitGameImmediate();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const audioState = getGameAudioState();
      if (audioState.available && pointInRect(px, py, gameUiLayout.muteRect)) {
        gameAudioBridge.setMuted(!audioState.muted);
        updateGameAudioControlsState();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      if (audioState.available && pointInRect(px, py, gameUiLayout.sliderRect)) {
        const ratio = Math.max(0, Math.min(1, (px - gameUiLayout.sliderRect.x) / gameUiLayout.sliderRect.w));
        const volume = ratio * GAME_AUDIO_MAX;
        if (audioState.muted && volume > 0) gameAudioBridge.setMuted(false);
        gameAudioBridge.setVolume01(volume);
        gameVolumeDrag = true;
        try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
        updateGameAudioControlsState();
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
    }

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
      if (entry) startVideoReel(entry);
    }
    return;
  }

  if (splashActive) {
    const uiPt = getUiPointFromHit(hit);
    if (uiPt && splashReady && splashPlayRect) {
      const dx = uiPt.x - splashPlayRect.x;
      const dy = uiPt.y - splashPlayRect.y;
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
      const activeVideo = (contentMode === 'video' && reelVideo) ? reelVideo : playerVideo;
      if (activeVideo && (activeVideo.paused || activeVideo.ended)) {
        activeVideo.play().catch(() => {});
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

function handleWheel(ev) {
  if (!isGameActive()) return;
  const hit = raycastScreen(ev);
  if (!hit) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
  const mapped = mapHitToClient(hit);
  if (!mapped) return;
  dispatchSyntheticWheel(mapped.clientX, mapped.clientY, ev.deltaX, ev.deltaY, ev.deltaMode);
}

function handleContextMenu(ev) {
  if (!isGameActive()) return;
  const hit = raycastScreen(ev);
  if (!hit) return;
  ev.preventDefault();
  ev.stopPropagation();
}

function clearMenuHover() {
  if (renderer && renderer.domElement) {
    renderer.domElement.style.cursor = '';
  }
  setHoveredVideo(null);
  setHoveredGame(null);
}

function updateHoveredVideo(xCanvas, yCanvas) {
  if (!contentRect) return;
  const action = getMenuAction(xCanvas, yCanvas, contentRect);
  if (renderer && renderer.domElement) {
    const isHover = !!action;
    renderer.domElement.style.cursor = isHover ? 'pointer' : '';
  }
  if (action && action.type === 'video') {
    setHoveredVideo(VIDEO_LIST[action.index]?.id || null);
    setHoveredGame(null);
  } else if (action && action.type === 'game') {
    setHoveredGame(GAME_LIST[action.index]?.id || null);
    setHoveredVideo(null);
  } else {
    setHoveredVideo(null);
    setHoveredGame(null);
  }
}

function setHoveredVideo(id) {
  if (hoveredVideoId === id) return;
  const prev = hoveredVideoId ? videoPreviewVideos.get(hoveredVideoId) : null;
  if (prev) {
    try { prev.pause(); } catch (e) {}
  }
  hoveredVideoId = id;
  if (!hoveredVideoId) {
    needsRedraw = true;
    return;
  }
  const vid = ensurePreviewVideo(hoveredVideoId);
  if (vid) {
    if (vid.readyState >= 1 && isFinite(vid.duration) && vid.duration > 0) {
      startPreviewSnippet(vid);
    } else {
      vid.addEventListener('loadedmetadata', function handle() {
        vid.removeEventListener('loadedmetadata', handle);
        startPreviewSnippet(vid);
      });
    }
  }
  needsRedraw = true;
}

function setHoveredGame(id) {
  if (hoveredGameId === id) return;
  hoveredGameId = id;
  needsRedraw = true;
}

function handlePointerUp(ev) {
  if (pointerCaptured) {
    ev.preventDefault();
    ev.stopPropagation();
    pointerCaptured = false;
    if (controls) controls.enabled = (contentMode === 'menu');
    try { renderer.domElement.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  }
  gameVolumeDrag = false;
  if (contentMode === 'video' && player) {
    player.handlePointerUp();
  }
  if (isGameActive() && lastScreenHit) {
    dispatchGamePointerUp(lastScreenHit, ev.button);
  }
}

function handleKeyDown(ev) {
  const key = (ev.key || '').toLowerCase();
  if (key === 'escape') {
    if (contentMode === 'game') {
      exitGameImmediate();
    } else if (contentMode === 'video') {
      stopVideoReel();
    } else {
      contentMode = 'menu';
      needsRedraw = true;
    }
    return;
  }

  if (contentMode === 'game') return;
  const activeVideo = (contentMode === 'video' && reelVideo) ? reelVideo : playerVideo;
  const activeAudio = (contentMode === 'video' && reelVideo) ? reelAudio : playerAudio;
  if (!activeVideo) return;

    const shift = ev.shiftKey;
    const prevent = () => { try { ev.preventDefault(); } catch (e) { /* ignore */ } };

  const seekBy = (delta) => {
    if (!activeVideo.duration || !isFinite(activeVideo.duration)) return;
    try { activeVideo.currentTime = Math.max(0, Math.min(activeVideo.duration, activeVideo.currentTime + delta)); } catch (e) { /* ignore */ }
    if (activeAudio) syncAudioToVideo(activeVideo, activeAudio);
  };

  if (key === ' ' || key === 'k') {
    prevent();
    if (activeVideo.paused) activeVideo.play().catch(() => {});
    else activeVideo.pause();
    if (player) player.showControlsTemporarily();
    return;
  }
    if (key === 'm') {
      prevent();
      const next = !getStoredAudioSettings().muted;
      setStoredAudioMuted(next);
      if (activeAudio) applyAudioSettings(activeAudio);
      if (activeVideo) {
        try { activeVideo.muted = next; } catch (e) { /* ignore */ }
      }
      if (player) player.showControlsTemporarily();
      return;
    }
  if (key === 'j') { prevent(); seekBy(-10); if (player) player.showControlsTemporarily(); return; }
  if (key === 'l') { prevent(); seekBy(10); if (player) player.showControlsTemporarily(); return; }
  if (key === 'arrowleft') { prevent(); seekBy(-5); if (player) player.showControlsTemporarily(); return; }
  if (key === 'arrowright') { prevent(); seekBy(5); if (player) player.showControlsTemporarily(); return; }
    if (key === 'arrowup') {
      prevent();
      const { volume } = getStoredAudioSettings();
      const next = Math.max(0, Math.min(1, (volume || 0) + 0.05));
      setStoredAudioVolume(next);
      if (activeAudio) applyAudioSettings(activeAudio);
      if (activeVideo) {
        try { activeVideo.volume = next; activeVideo.muted = next <= 0.001; } catch (e) { /* ignore */ }
      }
      if (player) player.showControlsTemporarily();
      return;
    }
    if (key === 'arrowdown') {
      prevent();
      const { volume } = getStoredAudioSettings();
      const next = Math.max(0, Math.min(1, (volume || 0) - 0.05));
      setStoredAudioVolume(next);
      if (activeAudio) applyAudioSettings(activeAudio);
      if (activeVideo) {
        try { activeVideo.volume = next; activeVideo.muted = next <= 0.001; } catch (e) { /* ignore */ }
      }
      if (player) player.showControlsTemporarily();
      return;
    }
    if (key === ',' && shift) { prevent(); speedIndex = Math.max(0, speedIndex - 1); if (activeVideo) activeVideo.playbackRate = SPEED_RATES[speedIndex]; if (player) player.showControlsTemporarily(); return; }
    if (key === '.' && shift) { prevent(); speedIndex = Math.min(SPEED_RATES.length - 1, speedIndex + 1); if (activeVideo) activeVideo.playbackRate = SPEED_RATES[speedIndex]; if (player) player.showControlsTemporarily(); return; }
    if (key === ',' && activeVideo.paused) { prevent(); seekBy(-1 / 30); if (player) player.showControlsTemporarily(); return; }
    if (key === '.' && activeVideo.paused) { prevent(); seekBy(1 / 30); if (player) player.showControlsTemporarily(); return; }
    if ('0123456789'.includes(key)) {
      prevent();
      const digit = parseInt(key, 10);
      if (activeVideo.duration && isFinite(activeVideo.duration)) {
        const pct = digit === 0 ? 0 : digit / 10;
        try { activeVideo.currentTime = activeVideo.duration * pct; } catch (e) { /* ignore */ }
        if (activeAudio) syncAudioToVideo(activeVideo, activeAudio);
      }
      return;
    }
  }

function enterContentView() {
  if (!cameraZoomUserEnabled) {
    previousCameraZoomAlt = cameraZoomAlt;
    autoZoomActive = true;
  } else {
    autoZoomActive = false;
  }
  if (!userReturnTransform) {
    userReturnTransform = captureCameraSnapshot();
    console.log('[camera] enterContentView() userReturnTransform=', userReturnTransform);
  } else {
    console.log('[camera] enterContentView() using pre-set userReturnTransform=', userReturnTransform);
  }
  if (!cameraZoomAlt) {
    applyCameraMode(true);
  }
  updateControlsForContent('content');
}

function restoreViewAfterContent() {
  if (!cameraZoomUserEnabled && autoZoomActive) {
    applyCameraMode(previousCameraZoomAlt);
    if (userReturnTransform) {
      console.log('[camera] restoreViewAfterContent() applying userReturnTransform=', userReturnTransform);
      applyCameraSnapshot(userReturnTransform);
    }
  }
  autoZoomActive = false;
  userReturnTransform = null;
  updateControlsForContent('menu');
}

function updateControlsForContent(mode) {
  if (!controls) return;
  const allowTransform = !cameraZoomAlt;
  controls.enablePan = false;
  controls.enableRotate = allowTransform;
  controls.enableZoom = allowTransform;
  controls.enabled = allowTransform;
  setGameAudioControlsVisible(mode === 'game');
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
  if (!hit || !gameCanvas) return null;
  if (!screenCanvas) return null;
  const gameRect = gameUiLayout?.gameRect;
  if (!gameRect) return null;
  const px = hit.x;
  const py = hit.y;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const inputRect = { ...gameRect };
  if (INPUT_FLIP_U) inputRect.x = screenCanvas.width - (inputRect.x + inputRect.w);
  if (INPUT_FLIP_V) inputRect.y = screenCanvas.height - (inputRect.y + inputRect.h);
  if (px < inputRect.x || px > inputRect.x + inputRect.w || py < inputRect.y || py > inputRect.y + inputRect.h) return null;
  const xCanvasPx = ((px - inputRect.x) / inputRect.w) * gameCanvas.width;
  const yCanvasPx = ((py - inputRect.y) / inputRect.h) * gameCanvas.height;
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

function dispatchSyntheticWheel(clientX, clientY, deltaX, deltaY, deltaMode = 0) {
  const eventWindow = getEventWindow();
  const WheelEventCtor = eventWindow.WheelEvent || WheelEvent;
  if (!WheelEventCtor) return;
  const eventInit = {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    view: gameIframe?.contentWindow || null,
    deltaX,
    deltaY,
    deltaZ: 0,
    deltaMode
  };
  const wheel = new WheelEventCtor('wheel', eventInit);
  dispatchToTargets(wheel);
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
  const hit = hits[0];
  if (cabinetRoot) {
    const cabinetHits = raycaster.intersectObject(cabinetRoot, true);
    if (!cabinetHits.length) return null;
    const firstSceneHit = cabinetHits[0];
    if (firstSceneHit.object !== screenMesh) return null;
  }
  if (hit.face && hit.object) {
    const normalMatrix = new THREE.Matrix3();
    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    const rayDir = raycaster.ray.direction;
    if (worldNormal.dot(rayDir) >= 0) return null;
  }
  const rawU = hit.uv.x;
  const rawV = hit.uv.y;
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
  return { clientX, clientY, canvasX: x, canvasY: y };
}

function getVideoRect() {
  if (!screenCanvas) return null;
  const W = screenCanvas.width;
  const H = screenCanvas.height;
  const activeVideo = (contentMode === 'video' && reelVideo) ? reelVideo : playerVideo;
  const aspect = activeVideo && activeVideo.videoWidth && activeVideo.videoHeight
    ? activeVideo.videoWidth / activeVideo.videoHeight
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
  const activeVideo = (contentMode === 'video' && reelVideo) ? reelVideo : playerVideo;
  if (activeVideo) activeVideo.playbackRate = SPEED_RATES[speedIndex];
  needsRedraw = true;
}

function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Debug helper: expose current menu layout using the app's `contentRect`
if (typeof window !== 'undefined' && !window.__dumpMenuLayout) {
  window.__dumpMenuLayout = function() {
    const rect = contentRect || { x: 0, y: 0, w: document.body.clientWidth, h: document.body.clientHeight };
    try {
      const layout = getMenuRects(rect);
      console.log('__dumpMenuLayout rect ->', rect);
      console.log('__dumpMenuLayout games ->', layout.games.map(g => ({ id: g.id, textX: Math.round(g.textRect.x), circleX: Math.round(g.thumb.cx) })));
      return layout;
    } catch (e) {
      console.error('Error dumping menu layout', e);
      return null;
    }
  };
}

function getCurrentGameTitle() {
  if (!currentGameId) return 'Game';
  const entry = GAME_LIST.find((g) => g.id === currentGameId);
  return entry && entry.title ? entry.title : currentGameId;
}

function computeGameUiLayout(screenRect, gameAspect = 16 / 9) {
  const gameH = Math.round(screenRect.w / gameAspect);
  const remaining = Math.max(0, screenRect.h - gameH);
  const topH = Math.floor(remaining * 0.5);
  const bottomH = remaining - topH;

  const top = { x: screenRect.x, y: screenRect.y, w: screenRect.w, h: topH };
  const bottom = { x: screenRect.x, y: screenRect.y + screenRect.h - bottomH, w: screenRect.w, h: bottomH };
  const gameRect = {
    x: screenRect.x,
    y: screenRect.y + topH,
    w: screenRect.w,
    h: Math.min(gameH, screenRect.h - topH - bottomH)
  };

  const safeTopH = Math.max(1, top.h);
  const safeBottomH = Math.max(1, bottom.h);
  const padTop = Math.round(Math.max(12, safeTopH * 0.22));
  const iconTop = Math.round(Math.min(safeTopH * 0.72, screenRect.w * 0.09));
  const backRect = { x: top.x + padTop, y: top.y + (safeTopH - iconTop) / 2, w: iconTop, h: iconTop };
  const titleRect = { x: backRect.x + iconTop + padTop * 0.6, y: top.y, w: top.w - (padTop + iconTop + padTop * 0.6) - padTop, h: safeTopH };

  const pad = Math.round(Math.max(12, safeBottomH * 0.18));
  const icon = Math.round(Math.min(safeBottomH * 0.72, bottom.w * 0.085));
  const sliderW = Math.min(bottom.w * 0.35, Math.max(180, bottom.w * 0.24));
  const sliderH = Math.max(6, Math.round(safeBottomH * 0.18));
  const muteRect = { x: bottom.x + pad, y: bottom.y + (safeBottomH - icon) / 2, w: icon, h: icon };
  const sliderRect = { x: muteRect.x + icon + pad * 0.6, y: bottom.y + (safeBottomH - sliderH) / 2, w: sliderW, h: sliderH };

  return { top, bottom, backRect, titleRect, muteRect, sliderRect, gameRect, singlePanel: false };
}
function fitRectContain(srcW, srcH, dst) {
  const srcAR = srcW / srcH;
  const dstAR = dst.w / dst.h;
  let w = dst.w;
  let h = dst.h;
  if (dstAR > srcAR) {
    h = dst.h;
    w = h * srcAR;
  } else {
    w = dst.w;
    h = w / srcAR;
  }
  const x = dst.x + (dst.w - w) * 0.5;
  const y = dst.y + (dst.h - h) * 0.5;
  return { x, y, w, h };
}

function rectRound(r) {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.w),
    h: Math.round(r.h)
  };
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
