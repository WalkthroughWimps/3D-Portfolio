// === RESET-DEBUG: detect reload vs navigation vs HMR ===
(() => {
  const tag = (msg, extra={}) => console.log('[RESET-DEBUG] ' + msg, extra);
  try{
    window.addEventListener('beforeunload', () => tag('beforeunload (page is unloading)', {url: location.href}));
    window.addEventListener('unload', () => tag('unload', {url: location.href}));
    window.addEventListener('popstate', () => tag('popstate', {url: location.href}));
    window.addEventListener('hashchange', () => tag('hashchange', {url: location.href}));
    const _push = history.pushState.bind(history);
    const _replace = history.replaceState.bind(history);
    history.pushState = function(...args){ tag('history.pushState', {args, stack: (new Error()).stack}); return _push(...args); };
    history.replaceState = function(...args){ tag('history.replaceState', {args, stack: (new Error()).stack}); return _replace(...args); };
    window.addEventListener('error', (ev) => tag('window error', {message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno}));
    window.addEventListener('unhandledrejection', (ev) => tag('unhandledrejection', {reason: ev.reason}));
    const key = '__reset_debug_count__';
    const n = Number(sessionStorage.getItem(key) || 0) + 1;
    sessionStorage.setItem(key, String(n));
    tag('boot', {bootCountThisTab: n, url: location.href, navType: performance.getEntriesByType('navigation')?.[0]?.type});
  }catch(e){ console.warn('[RESET-DEBUG] instrumentation failed', e); }
})();

// music-piano-debug.js
// Fresh debug loader: isolates GLB visibility without previous logic
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getSyncOffsetMs } from './global-sync.js';
// Tablet helper currently a no-op; import kept so future
// tablet code can be re-enabled without touching this file.
import { setupMusicTabletScreen } from './music-tablet.js';
window.addEventListener('DOMContentLoaded', ()=>{
  instrumentPickerEl = document.getElementById('instrumentPicker');
  if(instrumentPickerEl){
    instrumentPickerEl.classList.add('instrument-picker--backboard');
    instrumentPickerEl.style.display = 'none';
  }
  // Hide original DOM label and rely on backboard UI
  try{
    const status = instrumentPickerEl.querySelector('div');
    if(status) status.style.display = 'none';
  }catch(e){}
  // Backboard click debug panel
  backboardClickPanel = document.createElement('div');
  backboardClickPanel.style.cssText = 'position:fixed;left:10px;bottom:10px;padding:8px 10px;background:rgba(0,0,0,0.7);color:#d0ffe4;font:12px monospace;z-index:2000;pointer-events:none;border-radius:6px;white-space:pre;';
  backboardClickPanel.textContent = 'backboard: none';
  document.body.appendChild(backboardClickPanel);

  document.addEventListener('keydown', (e)=>{
    if(e.code === 'F10'){
      const dbg = document.getElementById('uiDebugCanvas');
      if(dbg){
        dbg.style.display = (dbg.style.display === 'none') ? 'block' : 'none';
      }
    }
  });
});
const canvas = document.getElementById('pianoCanvas');
if (!canvas) { console.error('Canvas #pianoCanvas not found'); }
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
try{ renderer.outputColorSpace = THREE.SRGBColorSpace; }catch(e){}
// Match videos page renderer defaults for tone/shadows
try{ renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; }catch(e){}
try{ renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }catch(e){}
try{ renderer.physicallyCorrectLights = true; }catch(e){}
const clock = new THREE.Clock();
const scene = new THREE.Scene();
// Lighting rig — mirror videos page for consistent look
const cam = new THREE.PerspectiveCamera(45, canvas.clientWidth/canvas.clientHeight, 0.001, 500);
// Initial camera; final framing is driven by fit()/intro tween after GLB load
cam.position.set(-2.32, 2.14, 10.58);
cam.lookAt(0,0,0);
// Hemisphere + key + fill + rim + under + subtle ambient (videos.js style)
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.85); scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.25); keyLight.position.set(4,6,8); keyLight.castShadow = true;
try{ keyLight.shadow.mapSize.set(2048,2048); keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 30; }catch(e){}
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.55); fillLight.position.set(-6,3,-4); scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.7); rimLight.position.set(0,5,-8); scene.add(rimLight);
const underLight = new THREE.DirectionalLight(0xffffff, 0.35); underLight.position.set(0,-3,2); scene.add(underLight); scene.add(underLight.target);
const subtleAmbient = new THREE.AmbientLight(0xffffff, 0.15); scene.add(subtleAmbient);
const loader = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/');
loader.setDRACOLoader(draco); loader.setMeshoptDecoder(MeshoptDecoder);
const HUD = document.createElement('div');
HUD.style.cssText='position:fixed;left:8px;top:calc(var(--header-height, 6rem) + 8px);padding:6px 10px;background:rgba(0,0,0,.6);color:#d0ffe4;font:12px monospace;z-index:100;border-radius:6px;white-space:pre;';
document.body.appendChild(HUD);
let root=null; let keyMeshes=[]; let stickerMeshes=[]; let userStickersGroup = null;
let qwertyLabelsGroup = null;
let selectedKey=null; // middle key chosen for demo animation
const demoAngleWhite = THREE.MathUtils.degToRad(4);
const demoAngleBlack = THREE.MathUtils.degToRad(5);
// Orbit controls
const controls = new OrbitControls(cam, renderer.domElement);
// User-specified mouse button mapping
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = true;
controls.panSpeed = 0.6;
controls.minDistance = 0.5;
controls.maxDistance = 20; // allow further zooming out
controls.target.set(0,0.4,0);
// MIDI structures
let midiEvents = []; // {timeMs, type:'on'|'off', note, velocity}
let ticksPerQuarter = 480; // default, will read header
let tempoUsPerQuarter = 500000; // default 120 BPM (500000 microseconds per quarter note)
let tempoMap = [{tick:0, timeMs:0, tempo:tempoUsPerQuarter}]; // record tempo changes
let midiLoaded = false;
let midiIndex = 0; // current event index during playback
let playingMIDI = false;
let audioStartCtxTime = 0; // AudioContext.start base time
let midiStartCtxTime = 0;  // When MIDI timeline starts relative to audioCtx
let midiFirstNoteMs = 0;    // earliest note-on for zero alignment
let sentinelFilteredCount = 0; // count of filtered sentinel notes
let midiStretch = 1.0;      // stretch factor to match audio active duration
let midiActiveDurationMs = 0; // MIDI active span (first on -> last off) after filtering
const STRETCH_CLAMP = 0.20; // +/-20% max stretch to cover export mismatches
const midiKeyMap = new Map(); // noteNumber -> mesh
const pressState = new Map(); // mesh -> currentRotation
const WHITE_MAX = demoAngleWhite; // reuse deg limits
const BLACK_MAX = demoAngleBlack;
// Sign to apply for key press rotation: +1 means positive X rotates downward visually
// Adjusted after user feedback (keys were going up). If your model changes, flip to -1.
const KEY_PRESS_SIGN = 1;
// Sustain pedal (right) animation support
let sustainPedalMesh = null;
const PEDAL_MAX_ANGLE = THREE.MathUtils.degToRad(6);
const PEDAL_PRESS_MS = 85;
const PEDAL_RELEASE_MS = 140;
const sustainAnim = { phase:'idle', startMs:0, fromAngle:0, targetAngle:0 };
// Smooth animation & velocity scaling
// For predictive pedal bounce
let sustainEventTimes = []; // times (ms) of cc64 presses (value>=64) for lookahead
const PEDAL_BOUNCE_ANGLE = THREE.MathUtils.degToRad(0.9);
const PEDAL_LOOKAHEAD_MS = 160; // if next press within this after release start, force fast release
const PRESS_ATTACK_MS = 55;   // ramp press
const RELEASE_DECAY_MS = 110; // ramp release
const VELOCITY_MIN = 20;      // floor for depth scaling
const VELOCITY_MAX = 127;     // MIDI max
// NOTE fade / attack constants used for smoothing note start/stops
const NOTE_FADE_SEC = 0.03; // 0.02–0.06 recommended
const NOTE_ATTACK_SEC = 0.005; // quick attack to avoid clicks
const FADE_SEC = NOTE_FADE_SEC; // backward-compatible alias used elsewhere
// Per-note animation state: noteNumber -> { mesh, phase, startMs, fromAngle, targetAngle }
const keyAnimState = new Map();
// Audio context and sampler state
let audioCtx=null, audioBuffer=null, audioSource=null; let audioReady=false, audioPlaying=false; let audioError=false; let midiError=false;
let masterGain = null;
// Sampler (SoundFont) support
let instrumentPlayer = null; // Soundfont player instance for current instrument
let currentInstrumentName = null;
const activeSampleNodes = new Map(); // midiNum -> node returned by instrumentPlayer.play()
let audioTrimMs = 0; // detected leading silence trim
const TRIM_THRESHOLD = 0.0025; // RMS amplitude threshold
const TRIM_WINDOW_SAMPLES = 2048; // window size for scanning
const MAX_TRIM_MS = 20000; // safety cap (allow long tails up to 20s)
let audioActiveDurationMs = 0; // duration between first audible and last audible
let currentPlaybackRate = 1.0;
let savedAudioPosSec = 0; // persisted playhead when paused
// Animation frame lock configuration
const LOCK_FRAME = 140; // target frame to freeze at
const LOCK_FPS = 30;    // assumed export FPS (adjust if different)
let animationMixer = null;
let tabletStandMesh = null; // auto-rotated display stand
let tabletStandTargetAngle = 0; // computed each frame
let tabletStandCurrentAngle = 0; // smoothed applied angle
const TABLET_ROTATION_LERP_SPEED = 8.0; // larger = snappier, smaller = looser
// Backboard screen canvas (note display)
let backboardMesh = null;
let backboardCanvas = null;
let backboardCtx = null;
let backboardTexture = null;
// Backboard redraw throttle / dirty flag to avoid per-frame canvas uploads
let backboardDirty = true;
let lastBackboardDrawMs = 0;
const BACKBOARD_MAX_FPS = 20; // throttle canvas uploads to ~20 FPS
function requestBackboardRedraw(){ backboardDirty = true; }
// Surface aspect (world w/h) used to pre-compensate canvas drawing so
// circles/text look visually correct when mapped to the mesh UVs.
let backboardSurfaceAspect = 1;
let backboardUvDebugLogged = false;
// logical CSS-pixel drawing size for the backboard canvas (set once at creation)
let backboardCssW = 2048;
let backboardCssH = 512;
const BACKBOARD_BASE_HEIGHT = 512;
// Instrument picker overlay targeting the backboard
let instrumentPickerEl = null;
let lastInstrumentPickerRect = { x: 0, y: 0, w: 0, h: 0 };
let screenPlane = null;
let screenPlaneNormal = new THREE.Vector3(0,0,1);
let uvDebugMode = true; // draw UV test card
const INSTRUMENT_BUTTONS = [
  { id: 'acoustic_grand_piano', label: 'Acoustic Piano' },
  { id: 'bright_acoustic_piano', label: 'Bright Piano' },
  { id: 'electric_piano_1', label: 'Electric Piano 1' },
  { id: 'electric_piano_2', label: 'Electric Piano 2' },
  { id: 'honkytonk', label: 'Honky-Tonk' },
  { id: 'harpsichord', label: 'Harpsichord' },
  { id: 'vibraphone', label: 'Vibraphone' },
  { id: 'church_organ', label: 'Organ' },
  { id: 'accordion', label: 'Accordion' },
  { id: 'string_ensemble_1', label: 'Strings' },
  { id: 'pad_1', label: 'Pad' },
  { id: 'choir_aahs', label: 'Choir' }
];
const panelState = {
  left: { offset: 0, selected: INSTRUMENT_BUTTONS[0].id },
  right: { offset: Math.max(0, INSTRUMENT_BUTTONS.length - 6), selected: INSTRUMENT_BUTTONS[1].id }
};
let panelHitRects = [];
let panelHover = null;
let backboardClickPanel = null;
let backboardPointerDown = false;
// Backboard UV orientation correction (detect if UV island is rotated/flipped)
// backboardUVCorrection: per-axis correction detected at load time
// { swap:bool, mirrorU:bool, mirrorV:bool }
let backboardUVCorrection = { swap:false, mirrorU:false, mirrorV:false };
// Backboard world-space horizontal span (used to derive per-key lanes)
let backboardHorizAxis = 'x';
let backboardWorldSpan = { min:0, max:1, span:1 };
// Backboard UV bounds (uMin/uMax/vMin/vMax) used to crop the canvas texture to the
// mesh UV island so drawings are 1:1 and not stretched.
let backboardUVBounds = { uMin:0, uMax:1, vMin:0, vMax:1, uSpan:1, vSpan:1 };
let keyByNote = new Map();
let jsonKeymapLoaded = false;
let keymapULeft = 0;
let keymapURight = 1;
let RAYCAST_KEYMAP_READY = false;
const activeNotes = new Map(); // note -> { velocity, tOn }
const activeNoteSet = new Set(); // stores MIDI note numbers currently held down
const codeToMidiDown = new Map(); // ev.code -> latched midi number
const PERSISTENT_HIGHLIGHTS = [36]; // C2

// Debug lane guide toggle
const DEBUG_LANES = true;
let keyLanesAbs = new Map(); // note -> {u0,u1} derived from world positions

const BLACK_PCS = new Set([1,3,6,8,10]);
function isBlackNoteByNumber(n){ return BLACK_PCS.has(n % 12); }

function noteToGlowColor(note, velocity=1){
  const pc = note % 12; const hue = Math.round((pc/12)*360);
  const a = 0.35 + 0.45 * Math.min(1, velocity);
  return `hsla(${hue},90%,60%,${a})`;
}

// Draw a left->right UV gradient (red@0, green@0.5, blue@1) for debugging UV mapping
function drawUGradient(canvas){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const grad = ctx.createLinearGradient(0,0,W,0);
  grad.addColorStop(0.0, '#ff0000');
  grad.addColorStop(0.5, '#00ff00');
  grad.addColorStop(1.0, '#0000ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,W,H);
}

// V mapping constants for backboard "island" (local v in [0,1] maps into this UV range)
const V_MIN = 0.442326;
const V_MAX = 0.557674;
const V_RANGE = V_MAX - V_MIN; // 0.115348

// Map backboard mesh to screen-space rect for DOM overlays (instrument picker)
function getBackboardScreenRect(){
  const target = screenPlane || backboardMesh;
  if(!target || !renderer || !cam) return null;
  const geom = target.geometry;
  if(!geom) return null;
  try{ if(!geom.boundingBox) geom.computeBoundingBox(); }catch(e){}
  const bb = geom.boundingBox;
  if(!bb) return null;
  const min = bb.min, max = bb.max;
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, max.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(max.x, max.y, max.z)
  ];
  const domRect = renderer.domElement.getBoundingClientRect();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const c of corners){
    const v = c.clone();
    try{ v.applyMatrix4(target.matrixWorld); }catch(e){}
    try{ v.project(cam); }catch(e){}
    const x = (v.x * 0.5 + 0.5) * domRect.width + domRect.left;
    const y = (-v.y * 0.5 + 0.5) * domRect.height + domRect.top;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if(!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
  return { x:minX, y:minY, w: Math.max(0, maxX-minX), h: Math.max(0, maxY-minY) };
}

function updateInstrumentPickerPosition(){
  if(!instrumentPickerEl) return;
  const rect = getBackboardScreenRect();
  if(!rect){
    instrumentPickerEl.style.opacity = '0';
    return;
  }
  instrumentPickerEl.style.opacity = '1';
  instrumentPickerEl.style.position = 'fixed';
  instrumentPickerEl.style.left = `${rect.x}px`;
  instrumentPickerEl.style.top = `${rect.y}px`;
  instrumentPickerEl.style.width = `${rect.w}px`;
  instrumentPickerEl.style.maxWidth = `${rect.w}px`;
  instrumentPickerEl.style.transform = 'translateY(0)';
  instrumentPickerEl.style.flexDirection = 'row';
  instrumentPickerEl.style.flexWrap = 'wrap';
  instrumentPickerEl.style.justifyContent = 'center';
  instrumentPickerEl.style.alignItems = 'center';
  // Avoid thrashing layout if unchanged
  const eps = 0.5;
  if(Math.abs(lastInstrumentPickerRect.x - rect.x) > eps ||
     Math.abs(lastInstrumentPickerRect.y - rect.y) > eps ||
     Math.abs(lastInstrumentPickerRect.w - rect.w) > eps ||
     Math.abs(lastInstrumentPickerRect.h - rect.h) > eps){
    lastInstrumentPickerRect = rect;
  }
}

// Convert a local v (0..1 within the backboard island) into canvas Y pixels
function vLocalToYPx(vLocal, H){
  const vAbs = V_MIN + (vLocal * V_RANGE); // absolute UV v
  return (1.0 - vAbs) * H;                   // convert UV v to canvas y (y=0 top)
}

// Convert an absolute UV v (0..1) into canvas Y pixels
function vAbsToYPx(vAbs, H){
  return (1.0 - vAbs) * H; // y = (1 - v) * H
}

// Simple UV test card
function drawUvTestCard(ctx, W, H){
  ctx.fillStyle = '#111';
  ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  const steps = 10;
  for(let i=0;i<=steps;i++){
    const x = (i/steps)*W;
    const y = (i/steps)*H;
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke();
  }
  ctx.fillStyle = '#0f0';
  ctx.font = `${Math.max(16, Math.round(H*0.05))}px monospace`;
  ctx.fillText('TOP', W*0.45, H*0.08);
  ctx.fillText('BOTTOM', W*0.38, H*0.95);
  ctx.fillText('(0,0)', 8, H-8);
  ctx.fillText('(1,1)', W-70, 20);
}

function createBackboardCanvas(aspect){
  if(backboardCanvas) return; // already created; do not resize
  const baseH = BACKBOARD_BASE_HEIGHT;
  const targetW = Math.round((baseH * aspect) / 64) * 64;
  backboardCssW = Math.max(64, targetW);
  backboardCssH = baseH;
  backboardCanvas = document.createElement('canvas');
  backboardCanvas.width = backboardCssW;
  backboardCanvas.height = backboardCssH;
  backboardCanvas.id = 'uiDebugCanvas';
  backboardCanvas.style.position = 'fixed';
  backboardCanvas.style.left = '10px';
  backboardCanvas.style.bottom = '10px';
  backboardCanvas.style.width = '900px';
  backboardCanvas.style.height = 'auto';
  backboardCanvas.style.zIndex = '1500';
  backboardCanvas.style.border = '2px solid magenta';
  backboardCanvas.style.pointerEvents = 'none';
  document.body.appendChild(backboardCanvas);

  backboardCtx = backboardCanvas.getContext('2d');
  backboardTexture = new THREE.CanvasTexture(backboardCanvas);
  try{ backboardTexture.colorSpace = THREE.SRGBColorSpace; }catch(e){ try{ backboardTexture.encoding = THREE.sRGBEncoding; }catch(e){} }
  try{ backboardTexture.flipY = false; }catch(e){}
  backboardTexture.needsUpdate = true;

  // Aggressive debug draw
  const ctx = backboardCtx;
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0,0,backboardCssW, backboardCssH);
  ctx.strokeStyle = '#0ff';
  ctx.lineWidth = 20;
  ctx.strokeRect(10,10, backboardCssW-20, backboardCssH-20);
  ctx.fillStyle = '#000';
  ctx.font = '72px Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TOP', backboardCssW/2, 90);
  ctx.fillText('BOTTOM', backboardCssW/2, backboardCssH - 60);
  backboardTexture.needsUpdate = true;
}

function uvToCanvasPx(uv){
  if(!backboardUVBounds || !backboardCanvas) return null;
  const uSpan = backboardUVBounds.uSpan || (backboardUVBounds.uMax - backboardUVBounds.uMin) || 1;
  const vSpan = backboardUVBounds.vSpan || (backboardUVBounds.vMax - backboardUVBounds.vMin) || 1;
  const uNorm = (uv.x - backboardUVBounds.uMin) / uSpan;
  const vNorm = (uv.y - backboardUVBounds.vMin) / vSpan;
  if(!isFinite(uNorm) || !isFinite(vNorm)) return null;
  const px = uNorm * backboardCssW;
  const py = (1 - vNorm) * backboardCssH;
  return { px, py };
}

function raycastBackboardForUv(clientX, clientY){
  if(!screenPlane) return null;
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left)/rect.width)*2 - 1;
  const ny = -((clientY - rect.top)/rect.height)*2 + 1;
  pointer.set(nx, ny);
  raycaster.setFromCamera(pointer, cam);
  const hits = raycaster.intersectObject(screenPlane, true);
  if(!hits.length) return null;
  const h = hits[0];
  if(!h.uv) return null;
  return h.uv;
}

function setBackboardDebug(uv){
  if(!backboardClickPanel) return;
  if(!uv){
    backboardClickPanel.textContent = 'backboard: none';
    return;
  }
  const pt = uvToCanvasPx(uv);
  const px = pt ? pt.px.toFixed(1) : 'n/a';
  const py = pt ? pt.py.toFixed(1) : 'n/a';
  backboardClickPanel.textContent = `backboard hit\nu:${uv.x.toFixed(4)} v:${uv.y.toFixed(4)}\npx:${px} py:${py}`;
}

function hitTestPanelUI(uv){
  const pt = uvToCanvasPx(uv);
  if(!pt) return null;
  for(const hit of panelHitRects){
    const r = hit.rect;
    if(pt.px >= r.x && pt.px <= r.x + r.w && pt.py >= r.y && pt.py <= r.y + r.h){
      return hit;
    }
  }
  return null;
}

function updateInstrumentHover(clientX, clientY){
  const uv = raycastBackboardForUv(clientX, clientY);
  const hit = uv ? hitTestPanelUI(uv) : null;
  const nextHover = hit ? hit.id : null;
  if(nextHover !== panelHover){
    panelHover = nextHover;
    requestBackboardRedraw();
  }
}

async function triggerInstrumentButton(id){
  // keep selection per panel; caller sets desired panel before calling
  requestBackboardRedraw();
  try{
    await loadInstrument(id);
  }catch(e){
    console.warn('Instrument load via backboard UI failed', id, e);
  }
}

// Backboard UV map mode: 'none' | 'u' | 'v'
let backboardUVMapMode = 'none';
// mirror current mode on window so non-module scripts can read it
try{ window.backboardUVMapMode = backboardUVMapMode; }catch(e){}

// Set backboard UV map mode and request a texture update
function setBackboardUVMapMode(mode){
  if(!mode) mode = 'none';
  mode = String(mode).toLowerCase();
  if(!['none','u','v','checker'].includes(mode)) mode = 'none';
  backboardUVMapMode = mode;
  try{ window.backboardUVMapMode = backboardUVMapMode; }catch(e){}
  // trigger a redraw/update of the texture if canvas exists
  try{
    requestBackboardRedraw();
  }catch(e){}
  try{
    if(backboardTexture){
      // re-apply repeat/offset so the live canvas remains cropped to the UV island
      try{ backboardTexture.repeat.set(backboardUVBounds.uSpan, backboardUVBounds.vSpan); }catch(e){}
      try{ backboardTexture.offset.set(backboardUVBounds.uMin, backboardUVBounds.vMin); }catch(e){}
      backboardTexture.needsUpdate = true;
      // One-time debug print
      try{
        if(!backboardUvDebugLogged){
          console.log('Backboard UV', 'flipY:', backboardTexture.flipY, 'repeat:', backboardTexture.repeat.x, backboardTexture.repeat.y, 'offset:', backboardTexture.offset.x, backboardTexture.offset.y);
          backboardUvDebugLogged = true;
        }
      }catch(e){}
    }
  }catch(e){}
}

function toggleBackboardUVMap(){
  const order = ['none','u','v'];
  const idx = order.indexOf(backboardUVMapMode);
  const next = order[(idx+1) % order.length];
  setBackboardUVMapMode(next);
}

// Draw U (horizontal) color map
function drawUMap(canvas){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = backboardCssW, H = backboardCssH;
  try{ ctx.imageSmoothingEnabled = true; }catch(e){}
  // Draw gradient only across the U local viewport (keymapULeft..keymapURight)
  const uMin = Number(keymapULeft || 0);
  const uMax = Number(keymapURight || 1);
  const x0 = Math.round(uMin * W);
  const x1 = Math.round(uMax * W);
  const grad = ctx.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0.0, '#ff0000');
  grad.addColorStop(0.5, '#00ff00');
  grad.addColorStop(1.0, '#0000ff');
  // fill full vertical span but only in the U window horizontally
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = grad;
  ctx.fillRect(x0, 0, Math.max(1, x1-x0), H);
}

// Map helpers: localU/localV in [0..1] -> absolute UV -> canvas px
// Map normalized local coords [0..1] -> absolute UV (0..1) taking into account
// the detected UV island bounds and any axis swap or per-axis mirroring.
function mapNormToUv(localU, localV){
  const ub = backboardUVBounds || { uMin: Number(keymapULeft||0), uMax: Number(keymapURight||1), vMin: V_MIN, vMax: V_MAX, uSpan: (Number(keymapURight||1) - Number(keymapULeft||0)), vSpan: V_RANGE };
  const uSpan = (ub.uSpan != null) ? ub.uSpan : (ub.uMax - ub.uMin);
  const vSpan = (ub.vSpan != null) ? ub.vSpan : (ub.vMax - ub.vMin);
  let uAbs, vAbs;
  if(backboardUVCorrection && backboardUVCorrection.swap){
    // axes swapped: localU -> V, localV -> U
    uAbs = ub.uMin + (localV * vSpan);
    vAbs = ub.vMin + (localU * uSpan);
  } else {
    uAbs = ub.uMin + (localU * uSpan);
    vAbs = ub.vMin + (localV * vSpan);
  }
  if(backboardUVCorrection && backboardUVCorrection.mirrorU){ uAbs = (ub.uMin + ub.uMax) - uAbs; }
  if(backboardUVCorrection && backboardUVCorrection.mirrorV){ vAbs = (ub.vMin + ub.vMax) - vAbs; }
  return { u: uAbs, v: vAbs };
}

function localUToAbs(localU){ return mapNormToUv(localU, 0).u; }
function localVToAbs(localV){ return mapNormToUv(0, localV).v; }

function absUToXpx(uAbs, W){ return Math.round(uAbs * W); }
function absVToYpx(vAbs, H){ return Math.round((1.0 - vAbs) * H); }

// Convert absolute U (0..1) to backboard canvas X taking UV cropping into account
function absUToBackboardX(uAbs, W){
  const uv = backboardUVBounds || { uMin:0, uSpan:1 };
  const uMin = Number(uv.uMin ?? 0);
  const span = Math.max(1e-6, Number(uv.uSpan ?? (uv.uMax - uv.uMin) ?? 1));
  return Math.round(((uAbs - uMin) / span) * W);
}

// Compute approximate world-per-UV scale for the backboard mesh so markers draw with correct aspect
function computeWorldPerUV(mesh){
  if(!mesh || !mesh.isMesh){ return null; }
  try{
    const bb = new THREE.Box3().setFromObject(mesh);
    const size = bb.getSize(new THREE.Vector3());
    // pick largest and second-largest components as width/height
    const comps = [size.x, size.y, size.z].map((v,i)=>({v, i})).sort((a,b)=>b.v-a.v);
    const worldW = Math.max(1e-6, comps[0].v);
    const worldH = Math.max(1e-6, comps[1].v);
    const uMin = Number(keymapULeft || 0);
    const uMax = Number(keymapURight || 1);
    const uvW = Math.max(1e-6, (uMax - uMin));
    const uvH = Math.max(1e-6, V_RANGE);
    const worldPerU = worldW / uvW;
    const worldPerV = worldH / uvH;
    return { worldPerU, worldPerV, worldW, worldH };
  }catch(e){ return null; }
}

// Derive backboard horizontal axis and span from its world-space bounding box
function computeBackboardWorldSpan(mesh){
  if(!mesh || !mesh.isMesh) return false;
  try{
    const bb = new THREE.Box3().setFromObject(mesh);
    const size = bb.getSize(new THREE.Vector3());
    const axis = (size.x >= size.z) ? 'x' : 'z';
    const min = bb.min[axis];
    const max = bb.max[axis];
    const span = Math.max(1e-6, max - min);
    backboardHorizAxis = axis;
    backboardWorldSpan = { min, max, span };
    return true;
  }catch(e){ return false; }
}

// Compute per-key lane boundaries in absolute U [0..1] derived from world positions
function computeKeyLanesFromWorld(){
  if(!backboardMesh || !midiKeyMap || !midiKeyMap.size) return;
  if(!computeBackboardWorldSpan(backboardMesh)) return;
  const lanes = new Map();
  let entries = [];
  midiKeyMap.forEach((mesh, note)=>{
    try{
      const bb = new THREE.Box3().setFromObject(mesh);
      let u0 = (bb.min[backboardHorizAxis] - backboardWorldSpan.min) / backboardWorldSpan.span;
      let u1 = (bb.max[backboardHorizAxis] - backboardWorldSpan.min) / backboardWorldSpan.span;
      if(u0 > u1) { const t=u0; u0=u1; u1=t; }
      u0 = Math.max(0, Math.min(1, u0));
      u1 = Math.max(0, Math.min(1, u1));
      lanes.set(Number(note), { u0, u1 });
      // augment keyByNote entry so downstream consumers can use abs lanes
      const existing = keyByNote.get(Number(note)) || { name: mesh?.name };
      existing.u0_abs = u0; existing.u1_abs = u1;
      keyByNote.set(Number(note), existing);
      entries.push({ note:Number(note), mid:(u0+u1)*0.5 });
    }catch(e){ /* ignore per-key failure */ }
  });
  // Mirror if mids decrease with ascending MIDI
  try{
    entries.sort((a,b)=>a.note-b.note);
    let inversions = 0;
    for(let i=1;i<entries.length;i++){
      if(entries[i].mid < entries[i-1].mid) inversions++;
    }
    if(inversions > Math.max(2, Math.floor(entries.length*0.05))){
      lanes.forEach((v,k)=>{
        const nu0 = 1 - v.u1;
        const nu1 = 1 - v.u0;
        v.u0 = Math.min(nu0, nu1);
        v.u1 = Math.max(nu0, nu1);
        lanes.set(k, v);
        const kb = keyByNote.get(Number(k));
        if(kb){ kb.u0_abs = v.u0; kb.u1_abs = v.u1; keyByNote.set(Number(k), kb); }
      });
      console.warn('Mirrored world-derived key lanes to enforce left-to-right order');
    }
  }catch(e){ /* ignore mirror check */ }
  keyLanesAbs = lanes;
  try{ requestBackboardRedraw(); }catch(e){}
}


// Draw V (vertical) color map
function drawVMap(canvas){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = backboardCssW, H = backboardCssH;
  try{ ctx.imageSmoothingEnabled = true; }catch(e){}
  // Map local V [0..1] into absolute V range V_MIN..V_MAX and draw gradient within that band
  const yTop = vAbsToYPx(V_MAX, H);    // top (smaller y)
  const yBottom = vAbsToYPx(V_MIN, H); // bottom (larger y)
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);
  const grad = ctx.createLinearGradient(0, yTop, 0, yBottom);
  grad.addColorStop(0.0, '#ff0000');
  grad.addColorStop(0.5, '#00ff00');
  grad.addColorStop(1.0, '#0000ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, yTop, W, Math.max(1, Math.round(yBottom - yTop)));
}

// Draw a small-cell checkerboard for high-resolution UV debugging
function drawCheckerMap(canvas, cellW = 16, cellH = 12){
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = backboardCssW, H = backboardCssH;
  try{ ctx.imageSmoothingEnabled = true; }catch(e){}
  // Draw checker only inside local UV viewport (u: keymapULeft..keymapURight, v: V_MIN..V_MAX)
  const uMin = Number(keymapULeft || 0);
  const uMax = Number(keymapURight || 1);
  const x0 = Math.round(uMin * W);
  const x1 = Math.round(uMax * W);
  const yTop = vAbsToYPx(V_MAX, H);
  const yBottom = vAbsToYPx(V_MIN, H);
  const y0 = Math.max(0, Math.min(H-1, Math.round(yTop)));
  const y1 = Math.max(0, Math.min(H, Math.round(yBottom)));
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,W,H);
  for(let yy = y0; yy < y1; yy += cellH){
    for(let xx = x0; xx < x1; xx += cellW){
      const xi = Math.floor((xx - x0) / cellW);
      const yi = Math.floor((yy - y0) / cellH);
      const even = ((xi + yi) & 1) === 0;
      ctx.fillStyle = even ? '#e6e6e6' : '#444444';
      ctx.fillRect(xx, yy, Math.min(cellW, x1 - xx), Math.min(cellH, y1 - yy));
    }
  }
}

// Publicize control functions for the page UI
window.setBackboardUVMapMode = setBackboardUVMapMode;
window.toggleBackboardUVMap = toggleBackboardUVMap;
// Diagnostic helpers for note names and on-screen debug text
const NOTE_NAMES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function midiToName(n) {
  const pc = ((n % 12) + 12) % 12;
  const octave = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}
function drawDebugText(ctx, lines){
  ctx.save();
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(8, 8, 420, 24 * lines.length + 12);
  ctx.fillStyle = "white";
  lines.forEach((s, i) => ctx.fillText(s, 16, 32 + i * 24));
  ctx.restore();
}
const TABLET_HYSTERESIS = 0.0025; // radians: small threshold before target updates (~0.14deg)
const TABLET_MAX_ROT_SPEED = 3.0; // radians per second maximum applied change
let animActionsA = [];
let animActionsB = [];
// ---- Glow materials for active notes ----
// Blender-specified glow materials (provided spec)
const GlowMaterials = {
  'keys_black_glow': {
    color: 0x860B07,
    emissive: 0x860B07,
    emissiveIntensity: 1.000,
    metalness: 0.000,
    roughness: 0.353,
  },
  'keys_white_glow': {
    color: 0x17FF1C,
    emissive: 0x17FF1C,
    emissiveIntensity: 1.000,
    metalness: 0.000,
    roughness: 0.307,
  },
};
let glbGlowMaterial = null; // still capture if a unified 'glow' exists, but we prefer spec pair
const glowMatBlack = new THREE.MeshStandardMaterial({
  name: 'keys_black_glow',
  color: new THREE.Color(GlowMaterials['keys_black_glow'].color),
  emissive: new THREE.Color(GlowMaterials['keys_black_glow'].emissive),
  emissiveIntensity: GlowMaterials['keys_black_glow'].emissiveIntensity,
  metalness: GlowMaterials['keys_black_glow'].metalness,
  roughness: GlowMaterials['keys_black_glow'].roughness
});
const glowMatWhite = new THREE.MeshStandardMaterial({
  name: 'keys_white_glow',
  color: new THREE.Color(GlowMaterials['keys_white_glow'].color),
  emissive: new THREE.Color(GlowMaterials['keys_white_glow'].emissive),
  emissiveIntensity: GlowMaterials['keys_white_glow'].emissiveIntensity,
  metalness: GlowMaterials['keys_white_glow'].metalness,
  roughness: GlowMaterials['keys_white_glow'].roughness
});
glowMatBlack.side = THREE.DoubleSide; glowMatWhite.side = THREE.DoubleSide;
// Track how many overlapping note-ons are active per key to safely restore material
const keyActiveCount = new Map(); // noteNumber -> count
const safeRun = (fn, label = 'Non-critical failure') => {
  try { fn(); }
  catch (err) { console.warn(label, err); }
};
const disposeAudioSource = (reason) => {
  if (!audioSource) return;
  const prefix = reason ? `${reason}:` : 'audioSource cleanup';
  safeRun(() => audioSource.stop(), `${prefix} stop failed`);
  safeRun(() => audioSource.disconnect(), `${prefix} disconnect failed`);
  audioSource = null;
};
// Clear all active glow states and restore original materials
function clearAllKeyGlow(){
  keyActiveCount.clear();
  if(keyMeshes && keyMeshes.length){
    keyMeshes.forEach(m => {
      const orig = m?.userData?._origMaterial;
      if(orig && m.material !== orig){
        m.material = orig;
        if(m.material) m.material.needsUpdate = true;
      }
    });
  }
}

// Load an instrument by name (SoundFont player preferred, WebAudioFont as fallback).
async function loadInstrument(name){
  // Backend selection: check user preference
  const preferred = (window.PREFERRED_INSTRUMENT_BACKEND || 'auto').toString().toLowerCase();
  const trySoundfontFirst = (preferred === 'auto' || preferred === 'soundfont');
  const tryWebAudioFont = (preferred === 'auto' || preferred === 'webaudiofont' || preferred === 'webaudiofont-local');
  // Try Soundfont-player first if allowed
  const SF = window.Soundfont || window.SoundFont || window.SoundfontPlayer || window.SoundfontPlayer || window.Soundfont || window.SoundfontPlayer;
  if(trySoundfontFirst){
    if(SF){
      try{
        if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
        const opts = { soundfont: 'MusyngKite', format: 'mp3', url: 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/' };
        const inst = await SF.instrument(audioCtx, name, opts);
        instrumentPlayer = inst;
        currentInstrumentName = name + ' (SoundFont)';
        console.log('Loaded instrument (SoundFont)', name, inst);
        if(HUD) HUD.textContent = `instrument: ${currentInstrumentName}`;
        return inst;
      }catch(e){
        console.warn('SoundFont.instrument failed', e);
        if(preferred === 'soundfont'){
          if(HUD) HUD.textContent = `soundfont load failed`;
          return null;
        }
      }
    } else {
      console.warn('Soundfont-player not found (no global SF)');
      if(preferred === 'soundfont'){
        if(HUD) HUD.textContent = `soundfont missing`;
        return null;
      }
    }
  }

  // WebAudioFont fallback
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    // WebAudioFont script source selection based on preference
    let wafScript = 'https://surikov.github.io/webaudiofont/npm/dist/WebAudioFontPlayer.js';
    if(window.PREFERRED_INSTRUMENT_BACKEND === 'webaudiofont-local'){
      wafScript = '/assets/vendor/WebAudioFontPlayer.js';
    }
    // Load WebAudioFontPlayer script if not present
    if(!window.WebAudioFontPlayer){
      await new Promise((resolve, reject)=>{
        const s = document.createElement('script');
        s.src = wafScript;
        s.async = true;
        s.onload = ()=>{ console.log('WebAudioFontPlayer loaded from', wafScript); resolve(); };
        s.onerror = (e)=>{ console.warn('Failed to load WebAudioFontPlayer script', wafScript, e); reject(e); };
        document.head.appendChild(s);
      });
    }
    // create player instance if needed
    if(!window._WAF_player){
      window._WAF_player = new WebAudioFontPlayer();
    }
    const player = window._WAF_player;

    // Friendly name -> General MIDI program mapping (subset)
    const nameToProgram = {
      'acoustic_grand_piano': 1,
      'bright_acoustic_piano': 2,
      'electric_piano_1': 5,
      'electric_piano_2': 6,
      'honkytonk': 4,
      'harpsichord': 7,
      'vibraphone': 12,
      'church_organ': 20,
      'accordion': 21,
      'string_ensemble_1': 49,
      'pad_1': 89,
      'choir_aahs': 52
    };
    const program = nameToProgram[name] || 1;
    // find instrument index and info
    const idx = player.loader.findInstrument(program);
    const info = player.loader.instrumentInfo(idx);
    if(!info || !info.url || !info.variable){
      console.warn('WebAudioFont info missing for program', program, info);
      if(HUD) HUD.textContent = `webaudiofont: missing info`;
      return null;
    }
    // start loading preset script
    player.loader.startLoad(audioCtx, info.url, info.variable);
    // wait until preset variable becomes available
    await new Promise((resolve, reject)=>{
      const timeout = setTimeout(()=>reject(new Error('WAF preset load timeout')), 10000);
      const check = ()=>{
        if(window[info.variable]){ clearTimeout(timeout); resolve(); }
        else setTimeout(check, 120);
      };
      check();
    });
    // Create a thin adapter exposing .play(midiNum, when, opts) returning an object with .stop()
    const preset = window[info.variable];
    const adapter = {
      _player: player,
      _preset: preset,
      play: function(midiNum, whenSec, opts){
        const dur = (opts && opts.duration) ? opts.duration : 1.8; // default short note
        const vol = (opts && typeof opts.gain === 'number') ? opts.gain : 1;
        // allow an external gainNode to be supplied so we can control fades without touching library internals
        const dest = (opts && opts.gainNode) ? opts.gainNode : audioCtx.destination;
        const env = this._player.queueWaveTable(audioCtx, dest, this._preset, whenSec || audioCtx.currentTime, midiNum, dur, vol);
        // envelope contains audioBufferSourceNode for stopping
        const wrapper = {
          _env: env,
          stop: function(stopWhenSec){ try{ if(env && env.audioBufferSourceNode){ env.audioBufferSourceNode.stop(stopWhenSec||audioCtx.currentTime); } }catch(e){} }
        };
        return wrapper;
      }
    };
    instrumentPlayer = adapter;
    currentInstrumentName = name + ' (WebAudioFont)';
    console.log('Loaded instrument (WebAudioFont)', name, info.url, info.variable);
    if(HUD) HUD.textContent = `instrument: ${currentInstrumentName}`;
    return adapter;
  }catch(e){
    console.warn('WebAudioFont fallback failed', e);
    if(HUD) HUD.textContent = `instrument load error: ${name}`;
    return null;
  }
}
window.loadInstrument = loadInstrument;
window.getCurrentInstrumentName = () => currentInstrumentName;
function ensureAudio(){
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if(!masterGain){
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.22; // lower overall level to reduce clipping
    masterGain.connect(audioCtx.destination);
  }
}
function applyKeyGlow(mesh, noteNumber, on){
  if(!mesh) return;
  const cur = (keyActiveCount.get(noteNumber) || 0) + (on? 1 : -1);
  const next = Math.max(0, cur);
  keyActiveCount.set(noteNumber, next);
  if(on){
    // Save original material once
    if(mesh.userData && mesh.userData._origMaterial === undefined){
      mesh.userData._origMaterial = mesh.material;
    }
    // Prefer the Blender spec pair; only fall back to a single captured glbGlowMaterial if explicitly desired
    const gm = (isBlackKey(mesh) ? glowMatBlack : glowMatWhite);
    mesh.material = gm;
    if(mesh.material) mesh.material.needsUpdate = true;
  } else if(next===0) {
    // Restore original when no more active presses remain
    const orig = mesh.userData ? mesh.userData._origMaterial : null;
    if(orig){ mesh.material = orig; if(mesh.material) mesh.material.needsUpdate = true; }
  }
  // Request backboard redraw when visual key glow changes
  try{ requestBackboardRedraw(); }catch(e){}
}
function applyPersistentHighlights(){
  PERSISTENT_HIGHLIGHTS.forEach((note)=>{
    const mesh = midiKeyMap.get(note);
    if(mesh) applyKeyGlow(mesh, note, true);
  });
}
// ---- Track Metadata (moved earlier to avoid TDZ issues) ----
// Track metadata (adjust paths if actual filenames differ)
const TRACKS = {
  baby: {
    label: 'Baby',
    audioCandidates: [
      './music/Baby,-Just-Shut-Up!,-A-Lullaby.wav',
      './music/Baby,-Just-Shut-Up!,-A-Lullaby.mp3'
    ],
    midi: './midi/babyshutup.mid'
  },
  raisins: {
    label: 'Raisins',
    audioCandidates: [
      './music/Those-Raisins-Are-Mine!.wav', // preferred if added later
      './music/Those-Raisins-Are-Mine!.mp3'
    ],
    midi: './midi/raisins.mid'
  },
  forests: {
    label: 'Forests',
    audioCandidates: [
      './music/No-Forests-Left-to-Give.wav',
      './music/No-Forests-Left-to-Give.mp3'
    ],
    // Supports multiple MIDI parts to be merged
    midi: [
      './midi/Forests-Accomp.mid',
      './midi/Forests-Harmony.mid',
      './midi/Forests-Melody.mid'
    ]
  }
};
let currentTrackKey = 'baby';

// Adjustable framing tightness (lower value = closer). Original was 1.55 (looser)
const FRAME_TIGHTNESS = 1.6; // higher => further camera distance
function fit(box){
  const size = new THREE.Vector3(); box.getSize(size);
  const center = new THREE.Vector3(); box.getCenter(center);
  const maxDim = Math.max(size.x,size.y,size.z);
  const fov = cam.fov*Math.PI/180;
  const dist = (maxDim/2)/Math.tan(fov/2) * FRAME_TIGHTNESS;

  // Static framing for debug: "10 frames back" from the closer hero shot.
  // Slightly higher and farther so more of the stand is visible.
  const debugDist = dist * 0.90;
  const camPos = new THREE.Vector3(
    center.x + debugDist * 0.04,
    center.y + size.y * 0.72,
    center.z + debugDist * 0.78
  );

  const target = new THREE.Vector3(center.x, center.y + size.y * 0.32, center.z);

  cam.position.copy(camPos);
  cam.lookAt(target);
  controls.target.copy(target);
}
function collectKeys(node){
  const found=[];
  const midiPattern = /^(\d{3})_([A-G](?:#|b)?\d)$/i; // extract MIDI number
  node.traverse(o=>{
    if(o.isMesh){
      const nm = o.name || '';
      const m = nm.match(midiPattern);
      if(m){
        const midiNum = parseInt(m[1],10);
        midiKeyMap.set(midiNum, o);
        found.push(o);
      } else if(/key|white|black/.test(nm.toLowerCase())) {
        found.push(o);
      }
    }
  });
  keyMeshes = found; console.log('Debug collect keys:', found.map(f=>f.name));
  if(keyMeshes.length){
    chooseMiddleKey();
  }
  // init pressState
  keyMeshes.forEach(k=>pressState.set(k,0));
  // Build animation state map for MIDI keys
  midiKeyMap.forEach((mesh, note)=>{
    keyAnimState.set(note, { mesh, phase:'idle', startMs:0, fromAngle:0, targetAngle:0 });
  });
  applyPersistentHighlights();
}
function chooseMiddleKey(){
  // Sort keys by world X position to find median (approx middle C)
  const positions = keyMeshes.map(k=>{
    k.updateWorldMatrix(true,false);
    const p = new THREE.Vector3();
    k.getWorldPosition(p);
    return {mesh:k, x:p.x};
  }).sort((a,b)=>a.x-b.x);
  const median = positions[Math.floor(positions.length/2)];
  selectedKey = median.mesh;
  // Heuristic brighten highlight
  if(selectedKey.material && selectedKey.material.color){
    selectedKey.material.emissive ||= new THREE.Color(0x000000);
    selectedKey.material.emissive.setHex(0x442266);
  }
  console.log('Selected middle key for demo:', selectedKey.name);
}
// Make all white keys share the C8 material so their finish matches visually
function unifyWhiteKeysToReference(){
  // Subtle ivory PBR material with vertex colors/maps disabled to avoid baked tints
  const ivory = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf8f3eb), // warm ivory
    metalness: 0.02,
    roughness: 0.30,
    envMapIntensity: 0.35,
    toneMapped: true,
    vertexColors: false
  });
  ivory.name = 'keys_white_ivory';
  midiKeyMap.forEach((mesh, note)=>{
    if(isBlackNoteByNumber(Number(note))) return;
    if(!mesh || Array.isArray(mesh.material)) return;
    mesh.material = ivory;
    // Ensure no baked maps/vertex colors alter the tone
    if(mesh.material) {
      mesh.material.map = null;
      mesh.material.aoMap = null;
      mesh.material.lightMap = null;
      mesh.material.vertexColors = false;
    }
    // Gentle contact shadows on white keys; avoid them casting onto others
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    try{ mesh.material.needsUpdate = true; }catch(e){}
    if(mesh.userData) mesh.userData._origMaterial = ivory;
  });
}
function isBlackKey(mesh){
  // User guarantee: all black keys include a '#' in their name
  return /#/i.test(mesh?.name||'');
}
function animate(){
  requestAnimationFrame(animate);
  controls.update();
  const dt = clock.getDelta();
  if(animationMixer) animationMixer.update(dt);
  renderer.render(scene, cam);
  if(root){
    const box = new THREE.Box3().setFromObject(root);
    const s = box.getSize(new THREE.Vector3());
  let midiLine = midiError? 'midi:error' : (midiLoaded? (playingMIDI? `midi:${midiIndex}/${midiEvents.length}` : 'midi:ready') : 'midi:loading');
  let audioLine = audioError? 'audio:error' : (audioReady ? (audioPlaying? 'audio:playing' : 'audio:ready') : 'audio:loading');
  const trimInfo = audioReady ? ` trim:${audioTrimMs.toFixed(0)}ms` : '';
  // Live drift diagnostics: compare MIDI and audio elapsed clocks
  let driftLine = '';
  if(audioCtx && (audioPlaying||playingMIDI)){
    const elapsedAudioMs = (audioCtx.currentTime - audioStartCtxTime) * 1000;
    const elapsedMidiMs = (audioCtx.currentTime - midiStartCtxTime) * 1000;
    const driftMs = elapsedMidiMs - elapsedAudioMs;
    driftLine = ` drift:${driftMs.toFixed(1)}ms`;
  }
  HUD.textContent = `children:${root.children.length}\nsize:${s.x.toFixed(3)},${s.y.toFixed(3)},${s.z.toFixed(3)}\nkeys:${keyMeshes.length}\n${midiLine}\n${audioLine}${trimInfo}${driftLine}\ntempos:${tempoMap.length} sentinels:${sentinelFilteredCount}\ncam:${cam.position.x.toFixed(2)},${cam.position.y.toFixed(2)},${cam.position.z.toFixed(2)}`;
    // Demo animation for selected key or fallback
    // Always update view-driven transforms (e.g., tablet stand)
    updateViewDrivenTransforms(dt);
    if(playingMIDI){
      const elapsedMidiSec = audioCtx ? (audioCtx.currentTime - midiStartCtxTime) : 0;
      if(elapsedMidiSec >= 0) advanceMIDI(elapsedMidiSec * 1000);
    }
    updateKeyAnimations();
      // update backboard overlay only when dirty (throttled to BACKBOARD_MAX_FPS)
      try{
        const nowMs = performance.now();
        if(backboardDirty && (nowMs - lastBackboardDrawMs) >= (1000 / BACKBOARD_MAX_FPS)){
          try{ renderBackboardOverlay(); }catch(e){}
          backboardDirty = false;
          lastBackboardDrawMs = nowMs;
        }
      }catch(e){ /* ignore */ }
  }
  updateInstrumentPickerPosition();
}
animate();
// Proper signature: (url, onLoad, onProgress, onError)
const MODEL_VERSION = 'v20251115a'; // bump to bust cache when GLB updated
loader.load((window && window.mediaUrl) ? window.mediaUrl('glb/toy-piano.glb') + `?${MODEL_VERSION}` : `glb/toy-piano.glb?${MODEL_VERSION}`,
  gltf => {
    root = gltf.scene;
    scene.add(root);
    // Future: attach tablet screen canvas/texture here.
    // Currently a no-op so tablet changes don't affect playback.
    try { setupMusicTabletScreen(root); } catch (e) { console.warn('setupMusicTabletScreen failed', e); }
    // brightening + double side
    root.traverse(o=>{ 
      if(/note_stickers|noteSticker|noteAccidental|noteText/i.test(o.name)) { stickerMeshes.push(o); o.visible = true; }
      if(!sustainPedalMesh && /(sustain|damper|right.*pedal|pedal.*right)/i.test(o.name)){
        sustainPedalMesh = o;
      }
      if(!tabletStandMesh && /tablet_stand/i.test(o.name)) { tabletStandMesh = o; try{ tabletStandCurrentAngle = (tabletStandMesh.rotation && typeof tabletStandMesh.rotation.x === 'number') ? tabletStandMesh.rotation.x : 0; tabletStandTargetAngle = tabletStandCurrentAngle; }catch(e){} }
      // Backboard screen for note info: look for mesh named SK_backboard_screen
        if(!backboardMesh && /SK_backboard_screen/i.test(o.name)){
        backboardMesh = o;
        try{
          // Create overlay canvas sized by the mesh world aspect ratio and HiDPI backing store
          // Compute mesh world bounding box to choose a sensible CSS pixel dimension
          try{ o.updateMatrixWorld(true); }catch(e){}
          let bbMesh = null; try{ bbMesh = new THREE.Box3().setFromObject(o); }catch(e){ bbMesh = null; }
          let worldW = 1.0, worldH = 0.125;
          try{
            if(bbMesh){
              // Use sorted dims to pick true surface width/height (avoid assuming X/Z order)
              const size = bbMesh.getSize(new THREE.Vector3());
              const dims = [size.x, size.y, size.z].map(v => Math.max(1e-6, v)).sort((a,b)=>a-b);
              const thickness = dims[0];
              const h = dims[1];
              const w = dims[2];
              backboardSurfaceAspect = w / h;
              worldW = w; worldH = h;
              console.log('backboardSurfaceAspect', backboardSurfaceAspect, 'canvas', backboardCssW, backboardCssH, 'uvBounds', backboardUVBounds);
            }
          }catch(e){ worldW = 1.0; worldH = 0.125; }
          let aspect = backboardSurfaceAspect || (worldW / Math.max(1e-6, worldH));
          if(!isFinite(aspect) || aspect <= 0) aspect = 8.0; // piano-ish fallback
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const BASE_W = 4096; // high quality base width (lower to 2048 if perf needed)
          // Prefer sizing the canvas to the UV island aspect so drawings are 1:1.
          let screenAspect = aspect;
          try{
            if(backboardUVBounds && backboardUVBounds.uSpan > 0 && backboardUVBounds.vSpan > 0){
              screenAspect = backboardUVBounds.uSpan / backboardUVBounds.vSpan;
            }
          }catch(e){}
          // CSS-pixel logical canvas size (we draw in CSS pixels and scale the backing store by dpr)
          backboardCssW = Math.round(BASE_W);
          backboardCssH = Math.max(64, Math.round(BASE_W / Math.max(1e-6, screenAspect)));
          backboardCanvas = document.createElement('canvas');
          // Create HiDPI backing store and set drawing transform so code can draw in CSS pixels
          backboardCanvas.width = Math.round(backboardCssW * dpr);
          backboardCanvas.height = Math.round(backboardCssH * dpr);
          backboardCanvas.style.width = backboardCssW + 'px';
          backboardCanvas.style.height = backboardCssH + 'px';
          backboardCtx = backboardCanvas.getContext('2d');
          // Set transform so drawing commands can use CSS-pixel coordinates
          try{ backboardCtx.setTransform(dpr,0,0,dpr,0,0); }catch(e){}
          try{ backboardCtx.imageSmoothingEnabled = true; }catch(e){}
          // Create texture and apply to mesh material
          backboardTexture = new THREE.CanvasTexture(backboardCanvas);
          // Prefer colorSpace when available (r152+), fallback to encoding
          try{ backboardTexture.colorSpace = THREE.SRGBColorSpace; }catch(e){ try{ backboardTexture.encoding = THREE.sRGBEncoding; }catch(e){} }
          // Ensure texture Y orientation matches canvas coordinate expectations for our overlay
          try{ backboardTexture.flipY = false; }catch(e){}
          // Apply texture filtering and mipmaps for improved crispness
          try{ backboardTexture.generateMipmaps = true; }catch(e){}
          try{ backboardTexture.minFilter = THREE.LinearMipmapLinearFilter; }catch(e){ backboardTexture.minFilter = THREE.LinearFilter; }
          try{ backboardTexture.magFilter = THREE.LinearFilter; }catch(e){ backboardTexture.magFilter = THREE.LinearFilter; }
          // If available, enable anisotropy for better sharpness at glancing angles
          try{ backboardTexture.anisotropy = (renderer && renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function') ? (renderer.capabilities.getMaxAnisotropy() || 1) : 1; }catch(e){}
          backboardTexture.wrapS = THREE.ClampToEdgeWrapping; backboardTexture.wrapT = THREE.ClampToEdgeWrapping;
          backboardTexture.needsUpdate = true;
          // Build a dedicated screen plane as a child for stable UVs/hit-testing
          try{
            const bbLocal = new THREE.Box3().setFromObject(backboardMesh);
            const sizeLocal = bbLocal.getSize(new THREE.Vector3());
            const planeW = sizeLocal.x || 1;
            const planeH = sizeLocal.y || 0.3;
            const planeGeom = new THREE.PlaneGeometry(planeW, planeH);
            const planeMat = new THREE.MeshBasicMaterial({
              map: backboardTexture,
              transparent: true,
              opacity: 1.0,
              depthWrite: false,
              toneMapped: false,
              side: THREE.DoubleSide
            });
            screenPlane = new THREE.Mesh(planeGeom, planeMat);
            screenPlane.name = 'UI_ScreenPlane';
            screenPlane.position.set(0, 0, 0.001);
            screenPlane.renderOrder = 20;
            backboardMesh.add(screenPlane);
            screenPlane.updateMatrixWorld(true);
          }catch(e){ console.warn('ScreenPlane creation failed', e); }
          console.log('Backboard canvas ready', backboardCanvas.width, backboardCanvas.height);

          // Note: do NOT alter the original backboard mesh material here —
          // we want to preserve the imported GLB appearance. The overlay
          // plane created below will carry the yellow circle texture.

          // Overlay plane creation removed: we apply the backboard canvas texture
          // directly to the imported `SK_backboard_screen` material so the
          // circle drawn by `renderBackboardOverlay()` appears on the mesh.
          // Attempt to load precomputed keymap.json and use it preferentially
          (async ()=>{
            try{
              const resp = await fetch('keymap.json');
              if(!resp.ok) throw new Error('HTTP '+resp.status);
              const keymap = await resp.json();
              if(keymap && Array.isArray(keymap.keys)){
                keyByNote.clear();
                for(const k of keymap.keys){
                  // enforce numeric keys
                  keyByNote.set(Number(k.note), { u0: k.u0, u1: k.u1, name: k.name || String(k.note) });
                }
                keymapULeft = Number(keymap.uLeft) || keymapULeft;
                keymapURight = Number(keymap.uRight) || keymapURight;
                jsonKeymapLoaded = true;
                RAYCAST_KEYMAP_READY = keyByNote.size > 0;
                // Ensure U runs left->right: flip if mids decrease with ascending note
                try{
                  const entries = Array.from(keyByNote.entries()).map(([note, obj])=>({
                    note: Number(note),
                    u0: Number(obj.u0),
                    u1: Number(obj.u1),
                    mid: (Number(obj.u0)+Number(obj.u1))*0.5
                  })).sort((a,b)=>a.note-b.note);
                  let inversions = 0;
                  for(let i=1;i<entries.length;i++){
                    if(entries[i].mid < entries[i-1].mid) inversions++;
                  }
                  if(false && inversions > Math.max(2, Math.floor(entries.length*0.05))){
                    const uL = Number(keymapULeft||0);
                    const uR = Number(keymapURight||1);
                    const span = uR - uL;
                    const mirror = (u)=> uL + (span - (u - uL));
                    keyByNote.forEach((v,k)=>{
                      const nu0 = mirror(Number(v.u1));
                      const nu1 = mirror(Number(v.u0));
                      v.u0 = Math.min(nu0, nu1);
                      v.u1 = Math.max(nu0, nu1);
                      keyByNote.set(k, v);
                    });
                    console.warn('keymap.json U mirrored to enforce left-to-right order');
                  }
                }catch(e){ console.warn('keymap.json mirror check failed', e); }
                console.log('Loaded keymap.json: uLeft/uRight', keymapULeft, keymapURight);
                console.log('k28', keyByNote.get(28), 'k60', keyByNote.get(60), 'k108', keyByNote.get(108));
                // Derive UV bounds from keymap.json if present. Preferred fields:
                // keymap.screenUvBounds.{uMin,uMax,vMin,vMax} OR keymap.uv_uMin,uv_uMax,uv_vMin,uv_vMax
                try{
                  let uMin=0,uMax=1,vMin=0,vMax=1;
                  if(isFinite(keymapULeft) && isFinite(keymapURight) && keymapURight > keymapULeft){
                    uMin = keymapULeft; uMax = keymapURight;
                  }
                  if(keymap.screenUvBounds && typeof keymap.screenUvBounds === 'object'){
                    uMin = Number(keymap.screenUvBounds.uMin ?? uMin);
                    uMax = Number(keymap.screenUvBounds.uMax ?? uMax);
                    vMin = Number(keymap.screenUvBounds.vMin ?? vMin);
                    vMax = Number(keymap.screenUvBounds.vMax ?? vMax);
                  } else if('uv_uMin' in keymap || 'uv_uMax' in keymap || 'uv_vMin' in keymap || 'uv_vMax' in keymap){
                    uMin = Number(keymap.uv_uMin ?? uMin);
                    uMax = Number(keymap.uv_uMax ?? uMax);
                    vMin = Number(keymap.uv_vMin ?? vMin);
                    vMax = Number(keymap.uv_vMax ?? vMax);
                  }
                  let uSpan = (uMax - uMin); let vSpan = (vMax - vMin);
                  if(!(isFinite(uSpan) && isFinite(vSpan) && uSpan>0 && vSpan>0)){
                    console.warn('Invalid UV spans from keymap.json; falling back to full 0..1');
                    uMin=0; uMax=1; vMin=0; vMax=1; uSpan=1; vSpan=1;
                  }
                  backboardUVBounds = { uMin, uMax, vMin, vMax, uSpan, vSpan };
          // Do not resize backboard canvas after creation; only update bounds
          try{ backboardTexture.repeat.set(1,1); backboardTexture.offset.set(0,0); backboardTexture.needsUpdate = true; }catch(e){}
                }catch(e){ console.warn('Error parsing keymap.json UV bounds', e); }
                try{ requestBackboardRedraw(); }catch(e){}
              }
            }catch(e){ console.warn('Loading keymap.json failed or not present', e); }
          })();
          // Note: keymap.json loading disabled — runtime raycast will generate authoritative keymap
          // Detect UV island orientation to know if U runs left->right or was rotated/flipped in Blender
          try{
            const geom = o.geometry;
            if(geom && geom.isBufferGeometry && geom.attributes && geom.attributes.position && geom.attributes.uv){
              const posAttr = geom.attributes.position;
              const uvAttr = geom.attributes.uv;
              const count = posAttr.count;
              // find extrema indices for X, Y, Z
              let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
              let iMinX=0,iMaxX=0,iMinY=0,iMaxY=0,iMinZ=0,iMaxZ=0;
              for(let i=0;i<count;i++){
                const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
                if(x < minX){ minX = x; iMinX = i; } if(x > maxX){ maxX = x; iMaxX = i; }
                if(y < minY){ minY = y; iMinY = i; } if(y > maxY){ maxY = y; iMaxY = i; }
                if(z < minZ){ minZ = z; iMinZ = i; } if(z > maxZ){ maxZ = z; iMaxZ = i; }
              }
              // choose vertical axis by span Y vs Z
              const spanY = maxY - minY; const spanZ = maxZ - minZ;
              const verticalAxis = (spanY >= spanZ) ? 'Y' : 'Z';
              // Compare UV.x at left-most and right-most mesh positions to detect mirrorU
              const uAtMinX = uvAttr.getX(iMinX); const uAtMaxX = uvAttr.getX(iMaxX);
              const mirrorU = (uAtMaxX < uAtMinX);
              // For V, compare UV.y at bottom vs top (using chosen vertical axis)
              const iBot = (verticalAxis === 'Y') ? iMinY : iMinZ;
              const iTop = (verticalAxis === 'Y') ? iMaxY : iMaxZ;
              const vAtBot = uvAttr.getY(iBot); const vAtTop = uvAttr.getY(iTop);
              const mirrorV = (vAtTop < vAtBot);
              // Detect axis swap: check whether UV changes more in U or V when moving along mesh X
              const du = Math.abs(uAtMaxX - uAtMinX);
              const dv = Math.abs(uvAttr.getY(iMaxX) - uvAttr.getY(iMinX));
              const swapped = dv > du;
              backboardUVCorrection = { swap: !!swapped, mirrorU: !!mirrorU, mirrorV: !!mirrorV };
              console.log('Backboard UV correction detected:', backboardUVCorrection, 'verticalAxis', verticalAxis, 'du', du.toFixed(3), 'dv', dv.toFixed(3));
            }
          }catch(e){ console.warn('backboard UV detect failed', e); }
        }catch(e){ console.warn('Backboard overlay setup failed', e); }
      }
      if(o.isMesh && o.material && o.material.color){ 
        if(o.material.color.getHex()===0x000000) o.material.color.set(0x333333); 
        o.material.side=THREE.DoubleSide; 
        o.frustumCulled=false; 
      }
      // Set all shape keys (morph targets) to 1.0
      if(o.isMesh && Array.isArray(o.morphTargetInfluences)){
        for(let i=0;i<o.morphTargetInfluences.length;i++){
          o.morphTargetInfluences[i] = 1.0;
        }
      }
      // Capture any material named 'glow' to use for active keys
      if(o.isMesh && o.material){
        const mat = o.material;
        const name = (mat.name||'').toLowerCase();
        if(!glbGlowMaterial && /\bglow\b/.test(name)){
          glbGlowMaterial = mat;
        }
      }
    });
    // initial box
    let box = new THREE.Box3().setFromObject(root);
    let size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x,size.y,size.z);
    // Auto-scale if enormous (> 20 units) or microscopic (< 0.5)
    if (maxDim > 20 || maxDim < 0.5) {
      const scale = maxDim > 20 ? 10 / maxDim : 1 / maxDim; // shrink or enlarge toward ~10 units
      root.scale.setScalar(scale);
      root.updateMatrixWorld(true);
      box = new THREE.Box3().setFromObject(root);
      size = box.getSize(new THREE.Vector3());
      console.warn('Applied auto-scale factor', scale.toFixed(5), 'new size:', size);
    }
    fit(box);
    collectKeys(root);
    computeKeyLanesFromWorld();
    unifyWhiteKeysToReference();
    // Create our own sticker sprites (do not use mesh stickers). Hide original sticker meshes.
    try{
      // Build reverse map from CODE_TO_MIDI (midi -> display key char)
      const midiToKey = new Map();
      if(typeof CODE_TO_MIDI !== 'undefined'){
        const displayFromCode = (code)=>{
          if(!code) return '';
          if(code.startsWith('Key')) return code.slice(3).toLowerCase();
          if(code.startsWith('Digit')) return code.slice(5);
          switch(code){
            case 'Comma': return ',';
            case 'Period': return '.';
            case 'Slash': return '/';
            case 'Semicolon': return ';';
            case 'BracketLeft': return '[';
            case 'BracketRight': return ']';
            case 'Minus': return '-';
            default: return code;
          }
        };
        CODE_TO_MIDI.forEach((v,k)=> midiToKey.set(Number(v), displayFromCode(k)));
      }
      // helper: find nearest key mesh to a sticker mesh
      const findNearestMidiForMesh = (mesh)=>{
        const p = new THREE.Vector3(); mesh.getWorldPosition(p);
        let best = null; let bestDist = Infinity;
        midiKeyMap.forEach((mMesh, mNum)=>{
          try{
            const q = new THREE.Vector3(); mMesh.getWorldPosition(q);
            const d = p.distanceTo(q);
            if(d < bestDist){ bestDist = d; best = Number(mNum); }
          }catch(e){}
        });
        return (bestDist < 0.12) ? best : null; // threshold in world units
      };

      // Remove any previously created user stickers
      if(userStickersGroup){ safeRun(()=> root.remove(userStickersGroup)); userStickersGroup = null; }
      userStickersGroup = new THREE.Group(); userStickersGroup.name = 'user_stickers_group';
      root.add(userStickersGroup);

      stickerMeshes.forEach(sm=>{
        try{
          // hide original mesh so we can control clipping/appearance ourselves
          sm.visible = false;
          const midi = findNearestMidiForMesh(sm);
          if(midi == null) return; // no nearby key
          const keyChar = midiToKey.get(midi);
          if(!keyChar) return; // skip notes not mapped to keyboard

          // world position and slight offset toward camera to avoid z-fighting/clipping
          const pos = new THREE.Vector3(); sm.getWorldPosition(pos);
          const camPos = new THREE.Vector3(); cam.getWorldPosition(camPos);
          const towardCam = camPos.sub(pos).normalize();
          pos.add(towardCam.multiplyScalar(0.03));

          // size hint from sticker mesh bbox
          const bbox = new THREE.Box3().setFromObject(sm);
          const boxSize = bbox.getSize(new THREE.Vector3());
          const baseScale = Math.max(boxSize.x, boxSize.y, boxSize.z) * 1.8 || 0.12;

          // draw canvas texture for the key label (ASDF key char)
          const W = 256, H = 160;
          const c = document.createElement('canvas'); c.width = W; c.height = H;
          const ctx = c.getContext('2d');
          // rounded rect background (white) with subtle border
          ctx.clearRect(0,0,W,H);
          ctx.fillStyle = 'rgba(255,255,255,0.98)';
          const r = 12;
          ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(W-r,0); ctx.quadraticCurveTo(W,0,W,r); ctx.lineTo(W,H-r); ctx.quadraticCurveTo(W,H,W-r,H); ctx.lineTo(r,H); ctx.quadraticCurveTo(0,H,0,H-r); ctx.lineTo(0,r); ctx.quadraticCurveTo(0,0,r,0); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.stroke();
          // key character
          ctx.fillStyle = '#000'; ctx.font = 'bold 92px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(keyChar).toUpperCase(), W/2, H/2 + 6);

          const tex = new THREE.CanvasTexture(c); try{ tex.encoding = THREE.sRGBEncoding; }catch(e){}
          tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;

          // Use sprite so it always faces camera and avoids complex UV/clipping
          const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false });
          const sprite = new THREE.Sprite(mat);
          sprite.position.copy(pos);
          sprite.scale.set(baseScale, baseScale * (H / W), 1);
          sprite.userData = { midi, key: keyChar };
          userStickersGroup.add(sprite);
        }catch(e){ console.warn('user sticker create failed', e); }
      });
      // Create QWERTY labels as camera-facing sprites so they never mirror and can be positioned above keys
      try{
        if(qwertyLabelsGroup){ safeRun(()=> root.remove(qwertyLabelsGroup)); qwertyLabelsGroup = null; }
        qwertyLabelsGroup = new THREE.Group(); qwertyLabelsGroup.name = 'qwerty_labels_group';
        root.add(qwertyLabelsGroup);
        // Build midi->label from CODE_TO_MIDI if available
        const midiToKeyLabel = new Map();
        if(typeof CODE_TO_MIDI !== 'undefined'){
          const displayFromCode = (code)=>{
            if(!code) return '';
            if(code.startsWith('Key')) return code.slice(3).toLowerCase();
            if(code.startsWith('Digit')) return code.slice(5);
            switch(code){ case 'Comma': return ','; case 'Period': return '.'; case 'Slash': return '/'; case 'Semicolon': return ';'; case 'BracketLeft': return '['; case 'BracketRight': return ']'; case 'Minus': return '-'; default: return code; }
          };
          CODE_TO_MIDI.forEach((midi, code)=> midiToKeyLabel.set(Number(midi), displayFromCode(code)));
        }
        // Create a sprite per white key
        midiToKeyLabel.forEach((label, midi)=>{
          try{
            const mNum = Number(midi);
            if(isBlackNoteByNumber(mNum)) return;
            const kMesh = midiKeyMap.get(mNum);
            if(!kMesh) return;
            // Position slightly above the key toward the camera to avoid black-key occlusion
            const pos = new THREE.Vector3(); kMesh.getWorldPosition(pos);
            const camPos = new THREE.Vector3(); cam.getWorldPosition(camPos);
            const towardCam = camPos.sub(pos).normalize();
            // small upward world offset plus toward-camera offset
            pos.y += 0.03;
            pos.addScaledVector(towardCam, 0.03);
            // Size based on key physical width
            const bbox = new THREE.Box3().setFromObject(kMesh);
            const bsz = bbox.getSize(new THREE.Vector3());
            const baseScale = Math.max(0.03, (bsz.x || 0.04) * 0.9);
            const Wc = 128, Hc = 96; const c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
            const ctx = c.getContext('2d'); ctx.clearRect(0,0,Wc,Hc);
            // Draw transparent background and text with subtle shadow
            const fontPx = Math.max(18, Math.round(Math.min(48, Wc * 0.28)));
            ctx.font = `bold ${fontPx}px system-ui, Arial, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(String(label).toUpperCase(), Wc/2 + 1, Hc/2 + 1);
            ctx.fillStyle = 'white'; ctx.fillText(String(label).toUpperCase(), Wc/2, Hc/2);
            const tex = new THREE.CanvasTexture(c); try{ tex.encoding = THREE.sRGBEncoding; }catch(e){}
            tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
            const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false });
            const sprite = new THREE.Sprite(mat);
            sprite.position.copy(pos);
            sprite.scale.set(baseScale, baseScale * (Hc / Wc) * 0.9, 1);
            qwertyLabelsGroup.add(sprite);
          }catch(e){ /* ignore single-label failures */ }
        });
      }catch(e){ console.warn('qwerty label generation failed', e); }
    }catch(e){ console.warn('user sticker generation failed', e); }
    // After keys are collected and backboard identified, generate runtime keymap via raycasting
    try{ if(backboardMesh && keyMeshes && keyMeshes.length){
      if(!jsonKeymapLoaded){
        generateRuntimeKeymap(backboardMesh, keyMeshes);
      } else {
        console.log('Skipping raycast keymap generation because keymap.json loaded');
      }
      applyPersistentHighlights();
    } }catch(e){ console.warn('generateRuntimeKeymap failed', e); }
    // Ensure all individual keys have scale 1
    safeRun(() => keyMeshes.forEach(k => { if (k && k.scale) k.scale.setScalar(1); }), 'key scale normalize');
    // Recenter origin after potential scaling
    const c = box.getCenter(new THREE.Vector3()); root.position.sub(c);
    // Recompute box after recenter to ensure framing updates for new geometry (e.g., pedals)
    const box2 = new THREE.Box3().setFromObject(root);
    fit(box2);
    // Refresh world-derived lanes after recenter so backboard mapping aligns
    computeKeyLanesFromWorld();
    console.log('GLB loaded. Final box size:', size, 'post-recenter size:', box2.getSize(new THREE.Vector3()));
    // If there are animations, prepare subclips and lock pose initially
    if(gltf.animations && gltf.animations.length){
      const clips = gltf.animations;
      animationMixer = new THREE.AnimationMixer(root);
      clips.forEach(clip=>{
        // Create subclips for requested ranges
        const subA = THREE.AnimationUtils.subclip(clip, (clip.name||'clip')+':A', 1, 140, LOCK_FPS);
        const subB = THREE.AnimationUtils.subclip(clip, (clip.name||'clip')+':B', 151, 300, LOCK_FPS);
        const actA = animationMixer.clipAction(subA); actA.setLoop(THREE.LoopOnce, 0); actA.clampWhenFinished = true; animActionsA.push(actA);
        const actB = animationMixer.clipAction(subB); actB.setLoop(THREE.LoopOnce, 0); actB.clampWhenFinished = true; animActionsB.push(actB);
        // Lock pose at frame 140 initially
        const baseAction = animationMixer.clipAction(clip);
        baseAction.play();
        const frameTime = LOCK_FRAME / LOCK_FPS;
        baseAction.time = Math.min(frameTime, clip.duration);
        animationMixer.update(0);
        baseAction.paused = true;
        console.log(`Prepared subclips for '${clip.name||'(unnamed)'}' and locked at frame ${LOCK_FRAME}`);
      });
    } else {
      console.log('No animations found to lock.');
    }
  },
  prog => {
    const pct = prog.total ? (prog.loaded / prog.total) * 100 : 0;
    HUD.textContent = `Loading GLB: ${pct.toFixed(1)}%`;
  },
  err => {
    console.error('GLB load FAILED', err);
    HUD.textContent = 'GLB load FAILED';
  }
);
// Resize listener
window.addEventListener('resize', ()=>{
  const w = canvas.parentElement.clientWidth; const h = Math.max(420, Math.floor(window.innerHeight*0.65));
  renderer.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix();
});
// ---- MIDI Parsing & Playback ----
function readVLQ(data, offset){
  let value=0; let i=offset; let byte;
  do { byte = data[i++]; value = (value<<7) | (byte & 0x7f); } while(byte & 0x80);
  return {value, next:i};
}
async function loadMIDI(urlOrArray){
  try {
    if(Array.isArray(urlOrArray)){
      const urls = urlOrArray;
      const fetched = await Promise.all(urls.map(async u=>{
        try { const r=await fetch(encodeURI(u)); if(!r.ok) throw new Error('HTTP '+r.status); return await r.arrayBuffer(); }
        catch(err){ console.warn('[MIDI] fetch failed for', u, err); return null; }
      }));
      const valid = fetched.filter(Boolean);
      if(valid.length===0) throw new Error('All MIDI fetches failed');
      // Parse off-main in small timeout to keep UI responsive
      setTimeout(()=>{
        const allEvents=[];
        let primaryTempoMap=null; let primaryTPQ=ticksPerQuarter;
        valid.forEach((ab, idx)=>{
          const {events, tempoMap:tm, ticksPerQuarter:tpq} = parseMIDIToEventList(new Uint8Array(ab));
          if(idx===0){ primaryTempoMap = tm; primaryTPQ = tpq; }
          allEvents.push(...events);
        });
        allEvents.sort((a,b)=>a.timeMs-b.timeMs);
        // Assign to globals
        tempoMap = primaryTempoMap || [];
        ticksPerQuarter = primaryTPQ || ticksPerQuarter;
        midiEvents = allEvents;
        sustainEventTimes = midiEvents.filter(e=> e.type==='cc64' && (e.value|0)>=64).map(e=> e.timeMs);
        // Post-process
        filterSentinelNotes();
        computeMidiActiveSpan();
        recomputeStretch();
        midiLoaded=true; midiError=false;
        console.log('[Track:'+currentTrackKey+'] MIDI merged from', valid.length, 'files; events:', midiEvents.length);
        updatePlayButton();
      },0);
    } else {
      const resp = await fetch(encodeURI(urlOrArray));
      if(!resp.ok) throw new Error('HTTP '+resp.status);
      const buf = await resp.arrayBuffer();
      // parse in timeout to avoid blocking paint
      setTimeout(()=>{ parseMIDI(new Uint8Array(buf)); midiLoaded=true; midiError=false; console.log('[Track:'+currentTrackKey+'] MIDI parsed:', midiEvents.length); updatePlayButton(); },0);
    }
  } catch(e){ console.error('MIDI load failed:', e); midiError=true; updatePlayButton(); }
}
function parseMIDIToEventList(bytes){
  // Two-pass parser: collect events in ticks and tempo changes, then map ticks->ms.
  let p=0;
  function readStr(n){ const s = String.fromCharCode(...bytes.slice(p,p+n)); p+=n; return s; }
  const header = readStr(4); if(header!=='MThd'){ console.error('Bad MIDI header'); return; }
  const hdrLen = (bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3]; p+=4;
  const format = (bytes[p]<<8)|bytes[p+1]; p+=2;
  const nTracks = (bytes[p]<<8)|bytes[p+1]; p+=2;
  const localTPQ = (bytes[p]<<8)|bytes[p+1]; p+=2;
  p += hdrLen - 6;
  console.log('MIDI header', {format, nTracks, ticksPerQuarter: localTPQ});
  const eventsTicks = []; // {tick,type,note,velocity,chan,value}
  const tempoTicks = [{tick:0, tempo:tempoUsPerQuarter}];
  for(let track=0; track<nTracks; track++){
    const id = readStr(4); if(id!=='MTrk'){ console.warn('Non-track chunk', id); break; }
    const len = (bytes[p]<<24)|(bytes[p+1]<<16)|(bytes[p+2]<<8)|bytes[p+3]; p+=4;
    const end = p+len; let tick=0; let runningStatus=0;
    while(p<end){
      const {value:delta, next:nxt} = readVLQ(bytes,p); p=nxt; tick+=delta;
      let status = bytes[p];
      if(status < 0x80){ status = runningStatus; } else { p++; runningStatus = status; }
      if(status===0xff){
        const type = bytes[p++];
        const {value:mlen, next:n2} = readVLQ(bytes,p); p=n2;
        if(type===0x51 && mlen===3){
          const tempo = (bytes[p]<<16)|(bytes[p+1]<<8)|bytes[p+2];
          tempoTicks.push({tick, tempo});
        }
        p+=mlen; continue;
      }
      if(status===0xf0 || status===0xf7){ const {value:slen, next:n3} = readVLQ(bytes,p); p=n3+slen; continue; }
      const typeNib = status & 0xf0; const chan = status & 0x0f;
      if(typeNib===0x90 || typeNib===0x80){
        const note = bytes[p++]; const vel = bytes[p++];
        const isOn = (typeNib===0x90 && vel>0);
        eventsTicks.push({tick, type:isOn?'on':'off', note, velocity:vel, chan});
      } else if(typeNib===0xb0){
        const controller = bytes[p++]; const value = bytes[p++];
        if(controller===64){ // sustain pedal
          eventsTicks.push({tick, type:'cc64', value, chan});
        }
      } else {
        if(typeNib===0xc0 || typeNib===0xd0){ p+=1; } else { p+=2; }
      }
    }
  }
  // Build segments
  tempoTicks.sort((a,b)=>a.tick-b.tick);
  const localTempoMap = []; let accMs=0; let prevTick=0; let currentTempo=tempoTicks[0].tempo;
  localTempoMap.push({tick:0, timeMs:0, tempo:currentTempo});
  for(let i=1;i<tempoTicks.length;i++){
    const T=tempoTicks[i].tick; const dt=T-prevTick;
    accMs += (dt*currentTempo)/localTPQ/1000; prevTick=T; currentTempo=tempoTicks[i].tempo;
    localTempoMap.push({tick:T, timeMs:accMs, tempo:currentTempo});
  }
  function tickToMs(T){
    let idx=0; for(let i=localTempoMap.length-1;i>=0;i--){ if(localTempoMap[i].tick<=T){ idx=i; break; } }
    const seg=localTempoMap[idx]; return seg.timeMs + ( (T-seg.tick) * seg.tempo)/localTPQ/1000;
  }
  const localEvents = eventsTicks.map(e=>({ timeMs: tickToMs(e.tick), type:e.type, note:e.note, velocity:e.velocity, chan:e.chan, value:e.value }));
  localEvents.sort((a,b)=>a.timeMs-b.timeMs);
  return { events: localEvents, tempoMap: localTempoMap, ticksPerQuarter: localTPQ };
}
function parseMIDI(bytes){
  const {events, tempoMap:tm, ticksPerQuarter:tpq} = parseMIDIToEventList(bytes);
  midiEvents = events;
  tempoMap = tm;
  ticksPerQuarter = tpq;
  sustainEventTimes = midiEvents.filter(e=> e.type==='cc64' && (e.value|0)>=64).map(e=> e.timeMs);
  filterSentinelNotes();
  computeMidiActiveSpan();
  recomputeStretch();
  console.log('Tempo map (segments):', tempoMap);
  // Diagnostics for Baby: summarize MIDI duration
  if(currentTrackKey === 'baby'){
    let lastOff = 0; for(let i=midiEvents.length-1;i>=0;i--){ if(midiEvents[i].type==='off'){ lastOff = midiEvents[i].timeMs; break; } }
    const midiDur = (lastOff>midiFirstNoteMs) ? (lastOff - midiFirstNoteMs) : 0;
    console.log('[Diag:BABY] MIDI dur(ms)=', Math.round(midiDur), 'TPQ=', ticksPerQuarter, 'segments=', tempoMap.length);
  }
}
// Identify and remove the very first and very last short, inaudible notes
// as described by the user (e.g., velocity 1, very short duration),
// without affecting middle content.
const SENTINEL_VEL_MAX = 8;      // <= 8 considered inaudible
const SENTINEL_DUR_MS_MAX = 120; // <= 120ms considered short
function filterSentinelNotes(){
  sentinelFilteredCount = 0;
  // Pair note-ons to offs
  const active = new Map(); // key "chan:note" -> {idx,timeMs,velocity}
  const pairs = []; // {onIdx, offIdx, on, off, dur}
  for(let i=0;i<midiEvents.length;i++){
    const ev = midiEvents[i];
    if(ev.type==='on'){
      const key = `${ev.chan}:${ev.note}`;
      active.set(key, {idx:i, timeMs:ev.timeMs, velocity:ev.velocity});
    } else if(ev.type==='off'){
      const key = `${ev.chan}:${ev.note}`;
      const on = active.get(key);
      if(on){
        const dur = Math.max(0, ev.timeMs - on.timeMs);
        pairs.push({onIdx:on.idx, offIdx:i, on: midiEvents[on.idx], off: ev, dur});
        active.delete(key);
      }
    }
  }
  if(pairs.length===0) return;
  // earliest candidate
  const earliest = pairs.reduce((a,b)=> (a.on.timeMs <= b.on.timeMs ? a : b));
  // latest candidate by off time
  const latest = pairs.reduce((a,b)=> (a.off.timeMs >= b.off.timeMs ? a : b));
  const toRemoveIdx = new Set();
  function consider(pair){
    if(pair.on.velocity <= SENTINEL_VEL_MAX && pair.dur <= SENTINEL_DUR_MS_MAX){
      toRemoveIdx.add(pair.onIdx);
      toRemoveIdx.add(pair.offIdx);
    }
  }
  consider(earliest);
  if(latest !== earliest) consider(latest);
  if(toRemoveIdx.size){
    midiEvents = midiEvents.filter((_,i)=> !toRemoveIdx.has(i));
    sentinelFilteredCount = toRemoveIdx.size/2; // pairs count
    // recompute midiFirstNoteMs as earliest remaining on
    midiFirstNoteMs = 0;
    for(const ev of midiEvents){ if(ev.type==='on'){ midiFirstNoteMs = ev.timeMs; break; } }
  } else {
    // no filtering; compute first note if not set
    for(const ev of midiEvents){ if(ev.type==='on'){ midiFirstNoteMs = ev.timeMs; break; } }
  }
}
function computeMidiActiveSpan(){
  // With sentinels removed, first ON is midiFirstNoteMs; find last OFF
  let lastOff = 0;
  for(let i=midiEvents.length-1;i>=0;i--){
    const ev = midiEvents[i];
    if(ev.type==='off'){ lastOff = ev.timeMs; break; }
  }
  if(midiFirstNoteMs>0 && lastOff>midiFirstNoteMs){
    midiActiveDurationMs = lastOff - midiFirstNoteMs;
  } else {
    midiActiveDurationMs = 0;
  }
}
function recomputeStretch(){
  if(audioActiveDurationMs>0 && midiActiveDurationMs>0){
    const raw = audioActiveDurationMs / midiActiveDurationMs;
    const clamped = Math.min(1+STRETCH_CLAMP, Math.max(1-STRETCH_CLAMP, raw));
    midiStretch = clamped;
  } else {
    midiStretch = 1.0;
  }
  // Stretch impacts adjusted times; rebuild fall schedule if MIDI already loaded
}
function startMIDIPlayback(){
  if(!midiLoaded||playingMIDI||!audioCtx) return;
  // Ensure audio context is running (browser gesture requirement)
  if(audioCtx.state !== 'running'){
    safeRun(() => audioCtx.resume(), 'audioCtx resume');
  }
  // Remove lingering glow from previous session before starting new playback
  clearAllKeyGlow();
  // Hard stop anything lingering and reset position to start
  disposeAudioSource('startMIDIPlayback cleanup');
  savedAudioPosSec = 0;
  midiIndex = 0;
  resetKeys();
  const offsetMs = getSyncOffsetMs();
  const userOffsetSec = offsetMs/1000;
  const firstNoteSec = (midiFirstNoteMs||0)/1000;
  const lead = 0.2; // schedule slightly in the future for stability
  const now = audioCtx.currentTime;
  // If no sampled instrument is loaded, provide only visual feedback and do not run oscillator fallback
  if(!instrumentPlayer){
    if(mesh){ const base = (isBlackKey(mesh)? BLACK_MAX : WHITE_MAX) * KEY_PRESS_SIGN; mesh.rotation.x = base * 0.6; }
    return;
  }
  const t0 = now + lead;
  const tAudio = t0 + Math.max(userOffsetSec, 0);
  const tMidiZero = t0 + Math.max(-userOffsetSec, 0);
  // Align so that first MIDI note occurs exactly at tMidiZero
  midiStartCtxTime = tMidiZero - firstNoteSec;
  // Start audio at tAudio, skipping detected leading silence internally
  startAudio((tAudio - now)*1000);
  audioStartCtxTime = tAudio;
  playingMIDI=true; midiIndex=0;
  console.log('Playback start (audioCtx)', {offsetMs, firstNoteSec, t0, tAudio, tMidiZero, midiStartCtxTime});
}
function advanceMIDI(elapsedMs){
  if(midiIndex>=midiEvents.length) return;
  while(midiIndex < midiEvents.length){
    const ev = midiEvents[midiIndex];
    const adjTime = midiFirstNoteMs + (ev.timeMs - midiFirstNoteMs) * (midiStretch / Math.max(1e-6, currentPlaybackRate));
    if(adjTime > elapsedMs) break;
    midiIndex++;
    if(ev.type==='on' || ev.type==='off'){
      const state = keyAnimState.get(ev.note);
      if(!state) continue;
      const mesh = state.mesh;
      if(ev.type==='on'){
        const base = (isBlackKey(mesh)? BLACK_MAX : WHITE_MAX) * KEY_PRESS_SIGN;
        const vel = Math.max(VELOCITY_MIN, ev.velocity);
        const depthScale = (vel - VELOCITY_MIN) / (VELOCITY_MAX - VELOCITY_MIN);
        const target = base * (0.55 + 0.45 * depthScale);
        state.phase='press'; state.startMs=elapsedMs; state.fromAngle=mesh.rotation.x; state.targetAngle=target;
        // Apply glow while the note is active
        applyKeyGlow(mesh, ev.note, true);
        // Mark active note for backboard overlay
        const nnum = Number(ev.note);
        activeNotes.set(nnum, { velocity: Math.max(0, Math.min(1, ev.velocity/127)), tOn: performance.now() });
        activeNoteSet.add(nnum);
      } else {
        state.phase='release'; state.startMs=elapsedMs; state.fromAngle=mesh.rotation.x; state.targetAngle=0;
        // Remove glow when the note-off occurs (respect overlapping notes via counter)
        applyKeyGlow(mesh, ev.note, false);
        // Remove from overlay
        const deln = Number(ev.note);
        activeNotes.delete(deln);
        activeNoteSet.delete(deln);
      }
    } else if(ev.type==='cc64'){
      if(!sustainPedalMesh) continue;
      const pressed = (ev.value|0) >= 64;
      if(pressed){
        // If previous release was still mid-way, force full rest (bounce up) before press
        if(sustainAnim.phase==='release'){
          sustainPedalMesh.rotation.x = 0;
          sustainAnim.fromAngle = 0;
        }
        // Optional quick bounce: small upward overshoot then press
        sustainAnim.phase='press';
        sustainAnim.startMs=elapsedMs;
        sustainAnim.fromAngle = sustainPedalMesh.rotation.x || 0;
        sustainAnim.targetAngle = PEDAL_MAX_ANGLE;
      } else {
        // Release logic with lookahead: if next press soon, use fast release
        const nextPress = sustainEventTimes.find(t => t>ev.timeMs);
        const soon = nextPress!==undefined && (nextPress - ev.timeMs) < PEDAL_LOOKAHEAD_MS;
        sustainAnim.phase='release';
        sustainAnim.startMs=elapsedMs;
        sustainAnim.fromAngle = sustainPedalMesh.rotation.x || 0;
        sustainAnim.targetAngle = 0;
        if(soon){
          // accelerate by temporarily adjusting constants (store original?)
          // We simulate by snapping closer to 0 immediately
          sustainPedalMesh.rotation.x = Math.max(0, sustainPedalMesh.rotation.x - PEDAL_BOUNCE_ANGLE);
        }
        // Once pedal goes up, apply sustain release to voices
        applySustainState();
      }
    }
  }
}
function updateKeyAnimations(){
  // elapsed MIDI time using context clock
  const elapsed = audioCtx ? (audioCtx.currentTime - midiStartCtxTime) * 1000 : 0;
  keyAnimState.forEach(st => {
    const mesh = st.mesh; if(!mesh) return;
    let dur=0;
    if(st.phase==='press') dur=PRESS_ATTACK_MS; else if(st.phase==='release') dur=RELEASE_DECAY_MS; else return;
    const t = (elapsed - st.startMs)/dur;
    if(t>=1){
      mesh.rotation.x = st.targetAngle;
      st.fromAngle=st.targetAngle;
      st.phase = (st.phase==='press')? 'held':'idle';
      return;
    }
    // smoothstep easing
    const e = t*t*(3-2*t);
    mesh.rotation.x = st.fromAngle + (st.targetAngle - st.fromAngle) * e;
  });
  // Sustain pedal easing
  if(sustainPedalMesh && sustainAnim.phase!=='idle'){
    const dur = sustainAnim.phase==='press' ? PEDAL_PRESS_MS : PEDAL_RELEASE_MS;
    const t = Math.max(0, (elapsed - sustainAnim.startMs)/Math.max(1,dur));
    if(t>=1){
      sustainPedalMesh.rotation.x = sustainAnim.targetAngle;
      sustainAnim.fromAngle = sustainAnim.targetAngle;
      sustainAnim.phase = (sustainAnim.phase==='press') ? 'held' : 'idle';
    } else {
      const e2 = t*t*(3-2*t);
      sustainPedalMesh.rotation.x = sustainAnim.fromAngle + (sustainAnim.targetAngle - sustainAnim.fromAngle) * e2;
    }
  }
}

// --- Backboard overlay rendering (note bars) ---
function renderBackboardOverlay(){
  if(!backboardCanvas || !backboardCtx || !backboardTexture) return;
  const ctx = backboardCtx; const W = backboardCssW, H = backboardCssH; // logical CSS-pixel drawing units
  try{ ctx.imageSmoothingEnabled = true; }catch(e){}
  // Use canvas-derived aspect (width/height) for visual compensation
  try{ backboardSurfaceAspect = (W / Math.max(1, H)); }catch(e){}
  // Clear canvas and draw orange background to confirm the overlay is visible
  ctx.clearRect(0,0,W,H);
  if(uvDebugMode){
    drawUvTestCard(ctx, W, H);
  }else{
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,W,H);
  }

  // Draw selected UV map mode if enabled
  if(backboardUVMapMode === 'u'){
    drawUMap(backboardCanvas);
  } else if(backboardUVMapMode === 'v'){
    drawVMap(backboardCanvas);
  } else if(backboardUVMapMode === 'checker'){
    drawCheckerMap(backboardCanvas);
  } else {
    // none: keep solid black background (already filled above)
  }

  // Instrument buttons UI (spread horizontally across the screen)
  // Draw panels
  try{
    panelHitRects = [];
    const panelW = W * 0.42;
    const panelH = H * 0.8;
    const panelY = (H - panelH) / 2;
    const leftX = W * 0.04;
    const rightX = W - panelW - leftX;
    const pad = panelW * 0.04;
    const btnH = (panelH - pad * 2) / 8; // 6 buttons + 2 arrows
    const fontSize = Math.max(14, Math.round(btnH * 0.38));
    const drawPanel = (panelId, x0)=>{
      const state = panelState[panelId];
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeStyle = '#8df7d4';
      ctx.lineWidth = Math.max(2, W * 0.0018);
      const radius = 12;
      if(typeof ctx.roundRect === 'function'){
        ctx.beginPath(); ctx.roundRect(x0, panelY, panelW, panelH, radius); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillRect(x0, panelY, panelW, panelH); ctx.strokeRect(x0, panelY, panelW, panelH);
      }
      ctx.fillStyle = '#fff';
      ctx.font = `${fontSize}px "Source Sans 3", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Arrow up
      const upRect = { x: x0 + pad, y: panelY + pad, w: panelW - pad*2, h: btnH };
      ctx.fillStyle = panelHover === `${panelId}-up` ? '#1c9' : '#222';
      ctx.fillRect(upRect.x, upRect.y, upRect.w, upRect.h);
      ctx.fillStyle = '#fff';
      ctx.fillText('▲', upRect.x + upRect.w/2, upRect.y + upRect.h/2);
      panelHitRects.push({ panel: panelId, type: 'arrow-up', id: `${panelId}-up`, rect: upRect });
      // Buttons (6 visible)
      const startIdx = Math.max(0, Math.min(INSTRUMENT_BUTTONS.length - 6, state.offset));
      for(let i=0;i<6;i++){
        const idx = startIdx + i;
        const btn = INSTRUMENT_BUTTONS[idx];
        const y = panelY + pad + btnH * (i+1);
        const rect = { x: x0 + pad, y, w: panelW - pad*2, h: btnH };
        const selected = state.selected === btn.id;
        const hover = panelHover === `${panelId}-${btn.id}`;
        ctx.fillStyle = selected ? '#ffb347' : (hover ? '#244' : '#111');
        ctx.strokeStyle = selected ? '#ffda8c' : '#0f9';
        if(typeof ctx.roundRect === 'function'){
          ctx.beginPath(); ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8); ctx.fill(); ctx.stroke();
        } else {
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h); ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        }
        ctx.fillStyle = '#fff';
        ctx.fillText(btn.label, rect.x + rect.w/2, rect.y + rect.h/2);
        panelHitRects.push({ panel: panelId, type: 'button', id: btn.id, rect });
      }
      // Arrow down
      const downRect = { x: x0 + pad, y: panelY + panelH - pad - btnH, w: panelW - pad*2, h: btnH };
      ctx.fillStyle = panelHover === `${panelId}-down` ? '#1c9' : '#222';
      ctx.fillRect(downRect.x, downRect.y, downRect.w, downRect.h);
      ctx.fillStyle = '#fff';
      ctx.fillText('▼', downRect.x + downRect.w/2, downRect.y + downRect.h/2);
      panelHitRects.push({ panel: panelId, type: 'arrow-down', id: `${panelId}-down`, rect: downRect });
      ctx.restore();
    };
    drawPanel('left', leftX);
    drawPanel('right', rightX);
  }catch(e){ /* ignore draw panel errors */ }
  // Draw 12 circles horizontally centered
  try{
    const n = 12;
    const radius = Math.max(6, Math.min(W, H) * 0.03);
    const left = W * 0.05;
    const right = W * 0.95;
    const span = right - left;
    const y = H * 0.5;
    ctx.strokeStyle = '#ff6';
    ctx.lineWidth = Math.max(2, W * 0.002);
    for(let i=0;i<n;i++){
      const t = n>1 ? i/(n-1) : 0.5;
      const x = left + span * t;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI*2);
      ctx.stroke();
    }
  }catch(e){ /* ignore */ }

  // Ensure texture is updated for three.js
  backboardTexture.needsUpdate = true;
}
// Update camera-dependent transforms (runs every frame)
function updateViewDrivenTransforms(dt){
  if(!tabletStandMesh || !root) return;
  // ensure dt is defined (fallback to small step)
  dt = (typeof dt === 'number' && isFinite(dt) && dt>0) ? dt : Math.min(Math.max(clock.getDelta(), 0.001), 0.1);
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(root).getCenter(center);
  const toCam = new THREE.Vector3().subVectors(cam.position, center).normalize();
  const front = new THREE.Vector3(0,0,1);
  const up = new THREE.Vector3(0,1,0);
  const frontDot = THREE.MathUtils.clamp(front.dot(toCam), -1, 1);
  const upDot = THREE.MathUtils.clamp(up.dot(toCam), -1, 1);
  const wFront = Math.max(0, frontDot);
  const wTop = Math.max(0, upDot);
  const denom = wFront + wTop;
  let angle = 0;
  if(denom>1e-5){
    const tWeight = wFront/denom; // 0 top/back -> 0deg, 1 front -> 90deg
    angle = THREE.MathUtils.degToRad(90 * tWeight);
  }
  // set target and smoothly interpolate current applied angle
  tabletStandTargetAngle = angle;
  // frame-rate independent smoothing using exponential lerp
  const alpha = 1 - Math.exp(-TABLET_ROTATION_LERP_SPEED * dt);
  tabletStandCurrentAngle += (tabletStandTargetAngle - tabletStandCurrentAngle) * alpha;
  // Dead-zone snapping to avoid micro-oscillation when camera damping causes tiny target jitter
  const EPSILON = 0.0025; // ~0.14 degrees
  if (Math.abs(tabletStandTargetAngle - tabletStandCurrentAngle) < EPSILON) {
    tabletStandCurrentAngle = tabletStandTargetAngle;
  }
  // Hysteresis: only update target if camera movement produces a noticeable change
  // (helps when controls damping slightly toggles the desired angle back/forth)
  // Compute desired angle again for hysteresis check (re-evaluate from center/cam)
  // (Note: 'angle' variable above is the freshly computed desired angle assigned to tabletStandTargetAngle)
  // Cap rate of change per frame to avoid overshoot/jitter
  const maxDelta = TABLET_MAX_ROT_SPEED * dt;
  const delta = tabletStandCurrentAngle - tabletStandTargetAngle;
  // enforce max rate on current->target convergence (prevent sudden micro oscillation)
  if (Math.abs(delta) > maxDelta) {
    const sign = delta > 0 ? 1 : -1;
    tabletStandCurrentAngle = tabletStandTargetAngle + sign * maxDelta;
  }
  tabletStandMesh.rotation.x = tabletStandCurrentAngle;
}

// Generate authoritative keymap by raycasting key edge midpoints to the screen mesh
function generateRuntimeKeymap(screenMesh, keys){
  if(!screenMesh || !keys || !keys.length) return;
  const ray = new THREE.Raycaster();
  ray.near = 0;
  ray.far = 10000;
  // ensure world matrices are current
  screenMesh.updateWorldMatrix(true, false);
  const screenBox = new THREE.Box3().setFromObject(screenMesh);
  const screenCenter = screenBox.getCenter(new THREE.Vector3());
  // compute a stable world-space normal from the mesh geometry
  function computeWorldNormalFromFirstTriangle(mesh){
    try{
      const geom = mesh.geometry;
      if(!geom || !geom.attributes || !geom.attributes.position) return null;
      const pos = geom.attributes.position;
      if(pos.count < 3) return null;
      const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
      const aw = new THREE.Vector3(); const bw = new THREE.Vector3(); const cw = new THREE.Vector3();
      a.fromBufferAttribute(pos, 0); b.fromBufferAttribute(pos, 1); c.fromBufferAttribute(pos, 2);
      aw.copy(a).applyMatrix4(mesh.matrixWorld);
      bw.copy(b).applyMatrix4(mesh.matrixWorld);
      cw.copy(c).applyMatrix4(mesh.matrixWorld);
      const n = new THREE.Vector3();
      n.subVectors(bw, aw).cross(new THREE.Vector3().subVectors(cw, aw)).normalize();
      if(n.length() === 0) return null;
      return n;
    }catch(e){ return null; }
  }
  // Prefer a reliable screen normal computed from the mesh world quaternion.
  // Try common local axes in order: +Z, -Z, +Y, -Y transformed to world space.
  const q = new THREE.Quaternion(); screenMesh.getWorldQuaternion(q);
  const candidates = [
    new THREE.Vector3(0,0,1).applyQuaternion(q),
    new THREE.Vector3(0,0,-1).applyQuaternion(q),
    new THREE.Vector3(0,1,0).applyQuaternion(q),
    new THREE.Vector3(0,-1,0).applyQuaternion(q)
  ];
  let screenNormal = null;
  // We'll pick the first candidate that yields hits for a sample key; fallback to camera->center direction
  const sampleMesh = keys[0];
  for(const cand of candidates){
    if(!cand) continue;
    const dirTest = cand.clone().normalize();
    // choose a sample origin from sampleMesh bounds
    const bbTest = new THREE.Box3().setFromObject(sampleMesh);
    const midYt = (bbTest.min.y + bbTest.max.y) * 0.5; const midZt = (bbTest.min.z + bbTest.max.z) * 0.5;
    const centerTest = bbTest.getCenter(new THREE.Vector3());
    const leftTest = new THREE.Vector3(bbTest.min.x, midYt, midZt).addScaledVector(dirTest, -0.01);
    ray.set(leftTest, dirTest);
    const hits = ray.intersectObject(screenMesh, true);
    if(hits && hits.length) { screenNormal = dirTest; break; }
  }
  if(!screenNormal){ screenNormal = new THREE.Vector3().subVectors(cam.position, screenCenter).normalize(); }
  keyByNote.clear();
  for(const mesh of keys){
    if(!mesh) continue;
    try{
      const bb = new THREE.Box3().setFromObject(mesh);
      const min = bb.min; const max = bb.max;
      const midY = (min.y + max.y) * 0.5; const midZ = (min.z + max.z) * 0.5;
      const leftWorld = new THREE.Vector3(min.x, midY, midZ);
      const rightWorld = new THREE.Vector3(max.x, midY, midZ);
      const keyCenter = bb.getCenter(new THREE.Vector3());
      // Use the precomputed screen normal as the ray direction for stable horizontal mapping
      const toScreen = new THREE.Vector3().subVectors(screenCenter, keyCenter);
      let dir = screenNormal.clone();
      if(dir.dot(toScreen) < 0) dir.negate();
      // Nudge origins slightly toward the screen to avoid starting behind the plane
      const EPS = 0.01;
      const originL = leftWorld.clone().addScaledVector(dir, -EPS);
      const originR = rightWorld.clone().addScaledVector(dir, -EPS);
      // cast from left
      ray.set(originL, dir);
      let iL = ray.intersectObject(screenMesh, true);
      // cast from right
      ray.set(originR, dir);
      let iR = ray.intersectObject(screenMesh, true);
      // Log hit counts for diagnostics
      try{ console.log('NOTE', mesh.name, 'note?', midiNameToNumber(mesh.name), 'hitsL', (iL?iL.length:0), 'hitsR', (iR?iR.length:0), 'screenMesh.type', screenMesh.type); }catch(e){}
      let uL = null, uR = null;
      if(iL && iL.length && iL[0].uv) uL = iL[0].uv.x;
      if(iR && iR.length && iR[0].uv) uR = iR[0].uv.x;
      // fallback: try casting from center if edges missed
      if(uL==null || uR==null){
        ray.set(keyCenter, dir);
        const ic = ray.intersectObject(screenMesh, true);
        if(ic && ic.length && ic[0].uv){ const uc = ic[0].uv.x; if(uL==null) uL = uc; if(uR==null) uR = uc; }
      }
      if(uL==null || uR==null) {
        // nothing hit — skip
        continue;
      }
      // clamp
      uL = Math.min(1, Math.max(0, uL));
      uR = Math.min(1, Math.max(0, uR));
      let u0 = Math.min(uL, uR), u1 = Math.max(uL, uR);
      const note = midiNameToNumber(mesh.name);
      // If the backboard UVs were mirrored horizontally, mirror per-key lanes
      try{
        if(backboardUVCorrection && backboardUVCorrection.mirrorU){
          const ub = backboardUVBounds || { uMin: 0, uMax: 1 };
          const nu0 = (ub.uMin + ub.uMax) - u1;
          const nu1 = (ub.uMin + ub.uMax) - u0;
          u0 = Math.min(nu0, nu1); u1 = Math.max(nu0, nu1);
        }
      }catch(e){ /* ignore mirror failures */ }
      if(Number.isInteger(note)){
          keyByNote.set(Number(note), { u0, u1, name: mesh.name });
      }
    }catch(e){ console.warn('raycast keymap fail for', mesh.name, e); }
  }
  // Harden generated keymap: detect ordering/inversions and auto-flip U if needed
  try{
    const entries = Array.from(keyByNote.entries()).map(([note, obj])=>({ note: Number(note), u0: obj.u0, u1: obj.u1, mid: (obj.u0 + obj.u1) * 0.5 }));
    entries.sort((a,b)=>a.note - b.note);
    // count inversions (monotonicity violations)
    let inversions = 0;
    for(let i=1;i<entries.length;i++) if(entries[i].mid < entries[i-1].mid) inversions++;
    // detect sharp decreases (large backward jumps) as another heuristic
    let sharpDrops = 0; let prev = entries.length ? entries[0].mid : 0;
    for(let i=1;i<entries.length;i++){ const cur = entries[i].mid; if(cur + 0.15 < prev) sharpDrops++; prev = cur; }
    if(inversions > Math.max(5, Math.floor(entries.length * 0.03)) || sharpDrops > Math.max(1, Math.floor(entries.length * 0.02))){
      // flip U for all keys: u0' = 1 - u1, u1' = 1 - u0
      keyByNote.forEach((v,k)=>{
        const nu0 = 1 - v.u1; const nu1 = 1 - v.u0; v.u0 = nu0; v.u1 = nu1; keyByNote.set(k, v);
      });
      console.warn('Runtime keymap: detected non-monotonic U mids; auto-flipped U coordinates for all keys');
    }
  }catch(e){ console.warn('Keymap hardening check failed', e); }
  RAYCAST_KEYMAP_READY = keyByNote.size > 0;
  console.log('Runtime keymap generated, keys:', keyByNote.size, 'ready=', RAYCAST_KEYMAP_READY);
  try{ requestBackboardRedraw(); }catch(e){}
}
// Hook play button if exists
const playBtn = document.getElementById('playPerformance');
if(playBtn){
  playBtn.addEventListener('click', ()=>{
    togglePlayPause();
  });
}
const trackBabyBtn = document.getElementById('trackBaby');
if(trackBabyBtn){ trackBabyBtn.addEventListener('click', ()=> selectTrack('baby')); }
const trackRaisinsBtn = document.getElementById('trackRaisins');
if(trackRaisinsBtn){ trackRaisinsBtn.addEventListener('click', ()=> selectTrack('raisins')); }
const trackForestsBtn = document.getElementById('trackForests');
if(trackForestsBtn){ trackForestsBtn.addEventListener('click', ()=> selectTrack('forests')); }
const restartBtn = document.getElementById('restartPlayback');
if(restartBtn){ restartBtn.addEventListener('click', ()=> restartFromBeginning()); }
const rateSel = document.getElementById('playbackRate');
if(rateSel){ rateSel.addEventListener('change', ()=> setPlaybackRate(parseFloat(rateSel.value||'1'))); }
// Animation buttons
const animA = document.getElementById('animRangeA');
const animB = document.getElementById('animRangeB');
if(animA){ animA.addEventListener('click', ()=> playAnimRange('A')); }
if(animB){ animB.addEventListener('click', ()=> playAnimRange('B')); }
// Initialize button label
updatePlayButton();
updateTrackButtons();
// Initial default track load
selectTrack(currentTrackKey);
// ---- Audio loading ----
async function loadAudio(url){
  try {
    if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
    const resp = await fetch(encodeURI(url));
    if(!resp.ok) throw new Error('Audio HTTP '+resp.status);
    const arr = await resp.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arr);
    const trimRms = detectLeadingSilence(audioBuffer);
    const trimEnergy = detectOnsetByEnergy(audioBuffer);
    // Be conservative: skip at least as much as either detector suggests
    audioTrimMs = Math.min(MAX_TRIM_MS, Math.max(Math.max(trimRms,0), Math.max(trimEnergy,0)));
    // Disable leading trim for 'Forests' track per request
    if(currentTrackKey === 'forests') {
      audioTrimMs = 0;
    }
    // For Baby: new exports are perfectly aligned; apply NO trim
    if(currentTrackKey === 'baby') {
      audioTrimMs = 0;
    }
    // trailing end detection to get active duration
    const trailMs = detectTrailingSilence(audioBuffer);
    const totalMs = audioBuffer.duration*1000;
    const endActiveMs = Math.max(audioTrimMs, totalMs - trailMs);
    audioActiveDurationMs = Math.max(0, endActiveMs - audioTrimMs);
    recomputeStretch();
    localStorage.setItem('audioLeadTrimMs', String(audioTrimMs));
    audioReady=true; audioError=false; console.log('[Track:'+currentTrackKey+'] Audio loaded trimMs=', audioTrimMs.toFixed(1)); updatePlayButton();
    // Diagnostics for Baby: summarize audio vs MIDI duration and raw stretch
    if(currentTrackKey === 'baby'){
      console.log('[Diag:BABY] Audio total(ms)=', Math.round(totalMs), 'active(ms)=', Math.round(audioActiveDurationMs), 'trim(ms)=', Math.round(audioTrimMs));
      if(midiActiveDurationMs>0){
        const raw = audioActiveDurationMs / midiActiveDurationMs;
        console.log('[Diag:BABY] raw stretch audio/midi =', raw.toFixed(6));
      }
    }
  } catch(e){ console.error('Audio load failed', e); audioError=true; updatePlayButton(); }
}
async function loadTrackAudio(candidates){
  if(!Array.isArray(candidates) || candidates.length===0){ audioError=true; updatePlayButton(); return; }
  console.log('[loadTrackAudio] candidates=', candidates);
  for(let i=0;i<candidates.length;i++){
    const url = candidates[i];
    const resolved = (window && window.mediaUrl) ? window.mediaUrl(url) : url;
    audioReady=false; audioError=false;
    try {
      await loadAudio(resolved);
      if(audioReady){
        console.log('[Track:'+currentTrackKey+'] Using audio source:', resolved);
        return;
      }
    } catch(e){
      console.warn('[loadTrackAudio] candidate failed', resolved, e);
    }
  }
  audioError=true; audioReady=false; console.error('[Track:'+currentTrackKey+'] All audio candidates failed'); updatePlayButton();
}
function startAudio(delayMs=0){
  if(!audioReady||audioPlaying) return;
  // Ensure no overlapping sources
  disposeAudioSource('startAudio cleanup');
  audioSource = audioCtx.createBufferSource();
  audioSource.buffer = audioBuffer;
  audioSource.playbackRate.setValueAtTime(currentPlaybackRate, audioCtx.currentTime);
  audioSource.connect(audioCtx.destination);
  const when = audioCtx.currentTime + Math.max(0, delayMs)/1000;
  const offset = Math.max(0, (audioTrimMs/1000) + savedAudioPosSec);
  audioSource.onended = ()=>{ audioPlaying=false; playingMIDI=false; savedAudioPosSec=0; resetKeys(); clearAllKeyGlow(); updatePlayButton(); };
  audioSource.start(when, offset);
  audioPlaying=true;
}
function detectLeadingSilence(buffer){
  try {
    const ch = buffer.getChannelData(0);
    const len = ch.length;
    let idx=0;
    while(idx < len){
      const end = Math.min(idx+TRIM_WINDOW_SAMPLES, len);
      let sumSq=0;
      for(let i=idx;i<end;i++){ const v=ch[i]; sumSq += v*v; }
      const rms = Math.sqrt(sumSq/(end-idx));
      if(rms > TRIM_THRESHOLD) break;
      idx = end;
      if((idx/buffer.sampleRate)*1000 > MAX_TRIM_MS) break;
    }
    const ms = Math.min(MAX_TRIM_MS, (idx/buffer.sampleRate)*1000);
    return ms;
  } catch(e){ console.warn('detectLeadingSilence failed', e); return 0; }
}
function detectTrailingSilence(buffer){
  try {
    const ch = buffer.getChannelData(0);
    const len = ch.length;
    let idx=len;
    while(idx > 0){
      const start = Math.max(0, idx-TRIM_WINDOW_SAMPLES);
      let sumSq=0; const count = idx-start;
      for(let i=start;i<idx;i++){ const v=ch[i]; sumSq += v*v; }
      const rms = Math.sqrt(sumSq/Math.max(1,count));
      if(rms > TRIM_THRESHOLD) break;
      idx = start;
      const elapsedMs = ((len-idx)/buffer.sampleRate)*1000;
      if(elapsedMs > MAX_TRIM_MS) break;
    }
    const ms = Math.min(MAX_TRIM_MS, ((len-idx)/buffer.sampleRate)*1000);
    return ms;
  } catch(e){ console.warn('detectTrailingSilence failed', e); return 0; }
}
// Short-time energy onset detection
function detectOnsetByEnergy(buffer){
  try {
    const sr = buffer.sampleRate;
    const ch0 = buffer.getChannelData(0);
    const ch1 = buffer.numberOfChannels>1 ? buffer.getChannelData(1) : null;
    const frame = 1024; const hop = 512;
    const n = Math.floor((ch0.length - frame)/hop);
    const energy = new Float32Array(Math.max(0,n));
    let maxE = 0;
    for(let i=0;i<n;i++){
      let sum=0; const off=i*hop;
      for(let k=0;k<frame;k++){
        const s0 = ch0[off+k]||0; const s1 = ch1? ch1[off+k] : 0;
        const s = (s0 + s1)*0.5; sum += s*s;
      }
      const e = sum/frame; energy[i]=e; if(e>maxE) maxE=e;
    }
    // Normalize and compute flux
    const flux = new Float32Array(energy.length);
    for(let i=1;i<energy.length;i++){
      const d = Math.max(0, energy[i]-energy[i-1]);
      flux[i] = d;
    }
    // Moving average baseline
    const win=8; let bestIdx=0;
    for(let i=win;i<flux.length;i++){
      let mean=0, varsum=0;
      for(let j=i-win;j<i;j++) mean += flux[j];
      mean/=win;
      for(let j=i-win;j<i;j++){ const dv=flux[j]-mean; varsum += dv*dv; }
      const std = Math.sqrt(varsum/win) || 1e-6;
      const z = (flux[i]-mean)/std;
      // Require energy also above small threshold
      if(z>3 && energy[i]> (0.005*maxE)){
        bestIdx = i; break;
      }
    }
    const ms = Math.min(MAX_TRIM_MS, (bestIdx*hop)/sr*1000);
    return ms||0;
  } catch(e){ console.warn('detectOnsetByEnergy failed', e); return 0; }
}
function selectTrack(key){
  if(!TRACKS[key]){ console.warn('Unknown track', key); return; }
  currentTrackKey = key;
  console.log('[selectTrack]', key, TRACKS[key]);
  // Stop current playback and reset state
  disposeAudioSource('selectTrack cleanup');
  audioPlaying=false; playingMIDI=false;
  savedAudioPosSec=0; midiIndex=0; midiLoaded=false; audioReady=false; midiError=false; audioError=false;
  midiEvents=[]; midiFirstNoteMs=0; midiActiveDurationMs=0; midiStretch=1.0; sentinelFilteredCount=0;
  updatePlayButton(); resetKeys();
  clearAllKeyGlow();
  // Load assets for track
  const t = TRACKS[key];
  loadTrackAudio(t.audioCandidates || [t.audio]);
  loadMIDI(t.midi);
  updateTrackButtons();
}
function updateTrackButtons(){
  const all = [
    document.getElementById('trackBaby'),
    document.getElementById('trackRaisins'),
    document.getElementById('trackForests')
  ];
  all.forEach(btn=>{
    if(!btn) return;
    const isActive = btn.dataset.track === currentTrackKey;
    btn.style.background = isActive ? 'rgba(90,200,160,0.6)' : 'rgba(255,255,255,0.15)';
    btn.style.color = '#fff';
    btn.style.border = isActive ? '1px solid #6ff' : '1px solid #444';
  });
}
// ---- Player controls logic ----
function updatePlayButton(){
  const btn = document.getElementById('playPerformance');
  if(!btn) return;
  if(audioError || midiError){
    btn.textContent = 'Load Error';
    btn.disabled = true; return;
  }
  btn.textContent = (audioPlaying||playingMIDI) ? 'Pause' : 'Play';
  btn.disabled = !midiLoaded || !audioReady;
}
function togglePlayPause(){
  if(!audioCtx || !audioReady || !midiLoaded){ return; }
  if(audioPlaying){
    // Pause: capture position, stop source, freeze MIDI index and clock origin
    const now = audioCtx.currentTime;
    const playedSec = (now - audioStartCtxTime) * currentPlaybackRate;
    savedAudioPosSec += Math.max(0, playedSec);
    disposeAudioSource('togglePlayPause cleanup');
    audioPlaying=false; playingMIDI=false; // will resume from savedAudioPosSec
    clearAllKeyGlow();
    updatePlayButton();
  } else {
    // If starting fresh (no saved position), use full alignment path
    if(savedAudioPosSec===0){
      startMIDIPlayback();
      updatePlayButton();
    } else {
      // Resume from saved position: set midiStartCtxTime so elapsed maps to saved position
      const now = audioCtx.currentTime;
      const lead = 0.05;
      const t0 = now + lead;
      const midiElapsedMs = (savedAudioPosSec*1000) / Math.max(1e-6, currentPlaybackRate);
      midiStartCtxTime = t0 - (midiElapsedMs/1000);
      startAudio((t0 - now)*1000);
      audioStartCtxTime = t0;
      playingMIDI=true;
      // Advance midiIndex to match saved position
      midiIndex = 0;
      advanceMIDI(savedAudioPosSec*1000);
      updatePlayButton();
    }
  }
}
function restartFromBeginning(){
  if(!audioCtx || !audioReady || !midiLoaded) return;
  // Stop any current playback
  disposeAudioSource('restartFromBeginning cleanup');
  audioPlaying=false; playingMIDI=false;
  savedAudioPosSec = 0;
  midiIndex = 0;
  resetKeys();
  clearAllKeyGlow();
  // Schedule fresh start with current offset and rate
  startMIDIPlayback();
  updatePlayButton();
}
function setPlaybackRate(rate){
  if(!isFinite(rate) || rate<=0) return;
  const wasPlaying = !!audioPlaying;
  // If currently playing, convert current position to saved, stop; we'll optionally resume
  if(audioCtx && wasPlaying){
    const now = audioCtx.currentTime;
    const playedSec = (now - audioStartCtxTime) * currentPlaybackRate;
    savedAudioPosSec += Math.max(0, playedSec);
    disposeAudioSource('setPlaybackRate cleanup');
    audioPlaying=false; playingMIDI=false;
  }
  currentPlaybackRate = rate;
  // Resume only if we were playing
  if(audioCtx && audioReady && midiLoaded && wasPlaying){
    togglePlayPause(); // resumes from saved position at new rate
  }
}
function resetKeys(){
  // Zero out all key rotations and clear animation state
  keyAnimState.forEach(st => {
    if(st.mesh){ st.mesh.rotation.x = 0; }
    st.phase = 'idle';
    st.startMs = 0;
    st.fromAngle = 0;
    st.targetAngle = 0;
  });
  pressState.forEach((_, mesh)=>{ if(mesh) pressState.set(mesh, 0); });
}
function stopAllAnimActions(){
  const all = [...animActionsA, ...animActionsB];
  all.forEach(action=>{
    if(!action) return;
    safeRun(() => action.stop(), 'anim action stop');
    safeRun(() => action.reset(), 'anim action reset');
  });
}
function playAnimRange(which){
  if(!animationMixer) return;
  stopAllAnimActions();
  const list = which==='A' ? animActionsA : animActionsB;
  list.forEach(action=>{
    action.reset();
    action.setLoop(THREE.LoopOnce, 0);
    action.clampWhenFinished = true;
    action.play();
  });
}
// ---- Key picking & basic synth note playback ----
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
// pointer tracking to distinguish click vs drag for playing notes
let pointerDownInfo = null; // { startX, startY, moved, midiNum, mesh, played, playedAt, glowApplied }
let pendingPlayTimer = null;
const MIN_USER_NOTE_MS = 250;
function midiNameToNumber(name){ const m = name.match(/^(\d{3})_/); return m? parseInt(m[1],10) : null; }
// Simple polyphonic piano-like synth with sustain support
const activeVoices = new Map(); // midiNum -> {osc, gain, stopTime, mesh}
function playUserNote(midiNum, mesh){
  midiNum = Number(midiNum);
  if(Number.isNaN(midiNum) || midiNum==null) return;
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state !== 'running'){ safeRun(() => audioCtx.resume(), 'audioCtx resume'); }
  const now = audioCtx.currentTime;
  // If a sampled instrument is loaded, prefer it
  if(instrumentPlayer){
    try{
      // If a previous sample node exists for this midi, gracefully fade it out
      const existing = activeSampleNodes.get(midiNum);
      const fadeShort = 0.06;
      if(existing && !existing.stopped){
        existing.stopped = true;
        try{
          if(existing.gainNode){
            const t = audioCtx.currentTime;
            existing.gainNode.gain.cancelScheduledValues(t);
            existing.gainNode.gain.setValueAtTime(existing.gainNode.gain.value, t);
            existing.gainNode.gain.exponentialRampToValueAtTime(0.0001, t + fadeShort);
            if(existing.node && existing.node.stop) existing.node.stop(t + fadeShort + 0.02);
          } else if(existing.node && existing.node.stop){
            existing.node.stop(audioCtx.currentTime + fadeShort);
          }
        }catch(e){ /* ignore */ }
      }

      // Create a gain node so we can fade notes out cleanly (prevents clicks)
      ensureAudio();
      const gainNode = audioCtx.createGain();
      // start at 0 and apply a short linear attack to avoid clicks
      try{ gainNode.gain.cancelScheduledValues(now); }catch(e){}
      try{ gainNode.gain.setValueAtTime(0.0, now); }catch(e){}
      try{ gainNode.gain.linearRampToValueAtTime(1.0, now + NOTE_ATTACK_SEC); }catch(e){}
      gainNode.connect(masterGain);
      // Many players accept a gainNode option; WebAudioFont adapter we supply will honor it.
      const node = instrumentPlayer.play(midiNum, now, { gain: 1, gainNode });
      activeSampleNodes.set(midiNum, { node: node, gainNode: gainNode, startedAt: now, stopped: false });
      // defensive cleanup in case stop isn't called later (keep a long timeout)
      setTimeout(()=>{ const e = activeSampleNodes.get(midiNum); if(e && e.stopped) activeSampleNodes.delete(midiNum); }, 12000);
    }catch(e){ console.warn('Instrument play failed, falling back to synth', e); }
    if(mesh){ const base = (isBlackKey(mesh)? BLACK_MAX : WHITE_MAX) * KEY_PRESS_SIGN; mesh.rotation.x = base * 0.6; }
    // Update picker status if present (debug HUD handled separately)
    try{
      const status = document.querySelector('#instrumentPicker > div');
      if(status) status.textContent = 'Playing: ' + (currentInstrumentName || '') + ' ' + midiNum;
      setTimeout(()=>{ if(status) status.textContent = 'Loaded: ' + (currentInstrumentName || ''); }, 120);
    }catch(e){}
    // Mark active note for overlay
    const mn = Number(midiNum);
    activeNotes.set(mn, { velocity: 1, tOn: performance.now() });
    activeNoteSet.add(mn);
    try{ requestBackboardRedraw(); }catch(e){}
    return;
  }
  // No sampled instrument loaded: only provide visual feedback (no oscillator fallback)
  if(mesh){
    const base = (isBlackKey(mesh)? BLACK_MAX : WHITE_MAX) * KEY_PRESS_SIGN;
    mesh.rotation.x = base * 0.6;
  }
  // Register active note so highlights appear even without a sampled instrument
  const mn2 = Number(midiNum);
  activeNotes.set(mn2, { velocity: 1, tOn: performance.now() });
  activeNoteSet.add(mn2);
  try{ requestBackboardRedraw(); }catch(e){}
  return;
}

// Stop a user-triggered note quickly and remove glow
function stopUserNote(midiNum){
  midiNum = Number(midiNum);
  if(Number.isNaN(midiNum)) return;
  // Ensure cleanup always runs, even if audio operations throw
  const nowSec = (audioCtx ? audioCtx.currentTime : 0);
  // Guard: ensure a fade duration is available in case other code referenced lowercase fadeSec
  const DEFAULT_FADE_SEC = 0.06;
  const fadeSecLocal = (typeof FADE_SEC === 'number') ? FADE_SEC : DEFAULT_FADE_SEC;
  try{
    // First handle sample nodes if present
    const sampleEntry = activeSampleNodes.get(midiNum);
    if(sampleEntry){
      // Determine elapsed time since this note started so a short tap still respects MIN_USER_NOTE_MS
      const started = sampleEntry.startedAt || nowSec;
      const elapsed = Math.max(0, nowSec - started);
      const minSec = MIN_USER_NOTE_MS / 1000;
      let stopAt = nowSec + fadeSecLocal;
      if(elapsed < minSec){ stopAt = started + minSec + FADE_SEC; }

      // Mark stopped to avoid double-stops
      sampleEntry.stopped = true;
      // If we control a gainNode, ramp it down for a smooth release
      if(sampleEntry.gainNode){
        try{
          sampleEntry.gainNode.gain.cancelScheduledValues(nowSec);
          const currentGain = sampleEntry.gainNode.gain.value || 1.0;
          sampleEntry.gainNode.gain.setValueAtTime(currentGain, nowSec);
          sampleEntry.gainNode.gain.linearRampToValueAtTime(0.0, stopAt);
        }catch(e){ /* ignore */ }
      }
      // Finally stop underlying node if we have a stop API
      if(sampleEntry.node && sampleEntry.node.stop){
        try{ sampleEntry.node.stop(stopAt + 0.02); }catch(e){ /* ignore */ }
      }
      // remove mapping after a safe delay
      setTimeout(()=>{ activeSampleNodes.delete(midiNum); }, Math.round((Math.max(0, ( (sampleEntry.startedAt||nowSec) + (MIN_USER_NOTE_MS/1000) ) - nowSec) + fadeSecLocal + 50) ));
    }

    // Then handle oscillator voices if any
    const v = activeVoices.get(midiNum);
    if(v && !v.stopping){
      v.stopping = true;
      try{
        const now = nowSec;
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        // ensure minimum duration before fading
        const playedAtMs = (v.playedAt !== undefined) ? v.playedAt : (v.startTime * 1000);
        const elapsed = (now * 1000) - playedAtMs;
        const remain = Math.max(0, MIN_USER_NOTE_MS - elapsed) / 1000;
        const when = now + remain;
        v.gain.gain.linearRampToValueAtTime(0.0, when + NOTE_FADE_SEC);
        setTimeout(()=>{ safeRun(()=>{ v.osc.stop(); v.oscB.stop(); v.oscC.stop(); }, 'user stop'); activeVoices.delete(midiNum); }, Math.round((remain + NOTE_FADE_SEC + 0.05)*1000));
      }catch(e){ /* ignore */ }
    }
  }catch(err){
    console.warn('stopUserNote audio path failed', err);
  } finally {
    // ALWAYS run visual/material cleanup
    const mesh = midiKeyMap.get(midiNum);
    try{
      keyActiveCount.set(Number(midiNum), 0);
      const orig = mesh && mesh.userData ? mesh.userData._origMaterial : null;
      if(orig && mesh){ mesh.material = orig; if(mesh.material) mesh.material.needsUpdate = true; }
    }catch(e){ /* ignore */ }
    // Remove overlay active note
    try{ activeNotes.delete(Number(midiNum)); }catch(e){}
    try{ activeNoteSet.delete(Number(midiNum)); }catch(e){}
    // restore key rotation and mark animation release state
    try{
      const v = activeVoices.get(midiNum);
      const m = mesh || (v && v.mesh);
      if(m) m.rotation.x = 0;
      const st = keyAnimState.get(midiNum);
      if(st){ st.phase = 'release'; st.startMs = (audioCtx ? (audioCtx.currentTime - (midiStartCtxTime||0)) * 1000 : 0); st.fromAngle = m ? m.rotation.x : 0; st.targetAngle = 0; }
    }catch(e){ /* ignore */ }
    try{ requestBackboardRedraw(); }catch(e){}
  }
}

function onGlobalPointerMove(e){
  // Safety: if we think pointer is down but no buttons are pressed (lost release), treat as pointer up
  if(pointerDownInfo && typeof e.buttons === 'number' && e.buttons === 0){
    const pid = pointerDownInfo.pointerId;
    onGlobalPointerUp();
    try{ if(pid !== undefined && pid !== null) canvas.releasePointerCapture(pid); }catch(err){}
    return;
  }
  if(!pointerDownInfo) return;
  const dx = e.clientX - pointerDownInfo.startX;
  const dy = e.clientY - pointerDownInfo.startY;
  const dist2 = dx*dx + dy*dy;
  if(!pointerDownInfo.moved && dist2 > (8*8)){
    pointerDownInfo.moved = true;
    if(pendingPlayTimer){ clearTimeout(pendingPlayTimer); pendingPlayTimer = null; }
    if(pointerDownInfo.played){ stopUserNote(pointerDownInfo.midiNum); pointerDownInfo.played = false; }
    // If we applied immediate visual glow but are now moving, clear it
    if(pointerDownInfo.glowApplied){ applyKeyGlow(pointerDownInfo.mesh, pointerDownInfo.midiNum, false); pointerDownInfo.glowApplied = false; }
    // do not re-enable rotate here if the pointer started on a key; rotation remains disabled until release
  }
  // Glissando: when pointer moved while down on a key, play notes encountered under pointer
  if(pointerDownInfo && pointerDownInfo.moved){
    // Only allow glissando playback while the primary button is held.
    if(typeof e.buttons === 'number' && ((e.buttons & 1) === 0)) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left)/rect.width)*2 - 1;
    pointer.y = -((e.clientY - rect.top)/rect.height)*2 + 1;
    raycaster.setFromCamera(pointer, cam);
    const intersects = root ? raycaster.intersectObject(root, true) : [];
    if(intersects.length){
      const hit = intersects[0].object;
      const res = findKeyFromObject(hit);
      if(res && res.midiNum !== pointerDownInfo.lastMidi){
        const prev = pointerDownInfo.lastMidi;
        if(prev != null){
          try{ stopUserNote(prev); }catch(e){}
        }
        pointerDownInfo.lastMidi = res.midiNum;
        playUserNote(res.midiNum, res.mesh);
        applyKeyGlow(res.mesh, res.midiNum, true);
      }
    }
  }
}

function onGlobalPointerUp(e){
  if(!pointerDownInfo) return;
  if(!pointerDownInfo.moved){
    // If we haven't played yet, play briefly then stop
    if(!pointerDownInfo.played){
      playUserNote(pointerDownInfo.midiNum, pointerDownInfo.mesh);
      pointerDownInfo.played = true;
      const v = activeVoices.get(pointerDownInfo.midiNum);
      if(v) v.playedAt = performance.now();
    }
    if(pointerDownInfo.played){ stopUserNote(pointerDownInfo.midiNum); }
  }
  if(pendingPlayTimer){ clearTimeout(pendingPlayTimer); pendingPlayTimer = null; }
  // Ensure any last glissando note is stopped
  try{
    if(pointerDownInfo && pointerDownInfo.lastMidi != null){ stopUserNote(pointerDownInfo.lastMidi); }
  }catch(e){}
  pointerDownInfo = null;
}
// Handle pedal release affecting sustained voices
function applySustainState(){
  const sustainActive = (sustainAnim.phase==='press' || sustainAnim.phase==='held');
  if(!sustainActive){
    // Begin release on all voices that were held
    const now = audioCtx ? audioCtx.currentTime : 0;
    activeVoices.forEach(v => {
      if(v.stopping) return;
      v.stopping=true;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now+0.9);
      setTimeout(()=>{ safeRun(() => { v.osc.stop(); v.oscB.stop(); v.oscC.stop(); }, 'sustain voice release'); }, 1000);
    });
    // After release, clear map gradually
    setTimeout(()=>{ activeVoices.clear(); }, 1100);
  }
}
function findKeyFromObject(obj){
  let cur = obj;
  while(cur){
    const n = cur.name || '';
    const num = midiNameToNumber(n);
    if(Number.isInteger(num)) return {mesh:cur, midiNum:num};
    // Compare against midiKeyMap values
    for(const [nn, m] of midiKeyMap.entries()){ if(m===cur) return {mesh:cur, midiNum:nn}; }
    cur = cur.parent;
  }
  return null;
}
let suppressRotate = false;
function onPointerDown(e){
  // Ignore right-clicks
  if(e.button === 2) return;
  // Check backboard instrument UI first
  const uiUv = raycastBackboardForUv(e.clientX, e.clientY);
  const uiHit = uiUv ? hitTestPanelUI(uiUv) : null;
  if(uiUv) setBackboardDebug(uiUv);
  if(uiHit){
    if(uiHit.type === 'button'){
      panelState[uiHit.panel].selected = uiHit.id;
      triggerInstrumentButton(uiHit.id);
    } else if(uiHit.type === 'arrow-up'){
      const ps = panelState[uiHit.panel];
      ps.offset = Math.max(0, ps.offset - 1);
      requestBackboardRedraw();
    } else if(uiHit.type === 'arrow-down'){
      const ps = panelState[uiHit.panel];
      const maxOffset = Math.max(0, INSTRUMENT_BUTTONS.length - 6);
      ps.offset = Math.min(maxOffset, ps.offset + 1);
      requestBackboardRedraw();
    }
    updateInstrumentHover(e.clientX, e.clientY);
    // prevent camera rotation while down on backboard
    backboardPointerDown = true;
    controls.enableRotate = false;
    suppressRotate = true;
    try{ if(typeof e.pointerId !== 'undefined') canvas.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    return;
  }
  // If we hit the backboard plane but not UI (e.g., empty space), still suppress rotate like keys
  if(uiUv){
    backboardPointerDown = true;
    controls.enableRotate = false;
    suppressRotate = true;
    try{ if(typeof e.pointerId !== 'undefined') canvas.setPointerCapture(e.pointerId); }catch(err){}
    e.preventDefault();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left)/rect.width)*2 - 1;
  pointer.y = -((e.clientY - rect.top)/rect.height)*2 + 1;
  raycaster.setFromCamera(pointer, cam);
  const intersects = root ? raycaster.intersectObject(root, true) : [];
  if(intersects.length){
    const hit = intersects[0].object;
    const res = findKeyFromObject(hit);
    if(res){
      pointerDownInfo = { startX: e.clientX, startY: e.clientY, moved: false, midiNum: res.midiNum, mesh: res.mesh, played: false, playedAt: null, glowApplied: false, pointerId: e.pointerId };
      // capture the pointer so we reliably receive pointerup even if the cursor leaves the canvas
      try{ if(typeof e.pointerId !== 'undefined') canvas.setPointerCapture(e.pointerId); }catch(err){}
      // immediate visual feedback so quick taps show highlight
      applyKeyGlow(res.mesh, res.midiNum, true);
      pointerDownInfo.glowApplied = true;
      // disable rotate while pointer is down on a key
      controls.enableRotate = false; suppressRotate = true;
      pendingPlayTimer = setTimeout(()=>{
        if(pointerDownInfo && !pointerDownInfo.moved){
          playUserNote(pointerDownInfo.midiNum, pointerDownInfo.mesh);
          pointerDownInfo.played = true;
          pointerDownInfo.playedAt = performance.now();
        }
        pendingPlayTimer = null;
      }, 40);
      e.preventDefault();
      return;
    }
  }
}

function onPointerUp(){
  // Release pointer capture if we had one
  const pid = pointerDownInfo && pointerDownInfo.pointerId;
  onGlobalPointerUp();
  try{ if(pid !== undefined && pid !== null) canvas.releasePointerCapture(pid); }catch(err){}
  if(suppressRotate){ controls.enableRotate=true; suppressRotate=false; }
  if(backboardPointerDown){
    backboardPointerDown = false;
    controls.enableRotate = true;
  }
  setBackboardDebug(null);
}
canvas.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);
// Also handle pointercancel to avoid sticky state on unexpected cancels
canvas.addEventListener('pointercancel', onPointerUp);
window.addEventListener('pointercancel', onPointerUp);
window.addEventListener('pointermove', onGlobalPointerMove);
canvas.addEventListener('pointermove', (e)=>updateInstrumentHover(e.clientX, e.clientY));
// Ensure pointer leaving the canvas also ends any active press
canvas.addEventListener('pointerleave', onPointerUp);
canvas.addEventListener('pointerleave', ()=>{ if(panelHover){ panelHover=null; requestBackboardRedraw(); }});
// prevent context menu on canvas
canvas.addEventListener('contextmenu', ev=>{ ev.preventDefault(); });

// QWERTY piano mapping by `event.code` -> MIDI
const CODE_TO_MIDI = new Map(Object.entries({
  // Bottom whites
  "KeyZ":48, "KeyX":50, "KeyC":52, "KeyV":53, "KeyB":55, "KeyN":57, "KeyM":59,
  "Comma":60, "Period":62, "Slash":64,

  // Bottom accidentals
  "KeyS":49, "KeyD":51, "KeyG":54, "KeyH":56, "KeyJ":58, "KeyL":61, "Semicolon":63,

  // Top whites (F4 -> C6)
  "KeyQ":65, "KeyW":67, "KeyE":69, "KeyR":71, "KeyT":72, "KeyY":74, "KeyU":76,
  "KeyI":77, "KeyO":79, "KeyP":81, "BracketLeft":83, "BracketRight":84,

  // Top accidentals (skip where no black key exists)
  "Digit2":66, "Digit3":68, "Digit4":70, "Digit6":73, "Digit7":75, "Digit9":78, "Digit0":80, "Minus":82
}));

const downCodes = new Set();

function noteOn(midi){
  try{
    const mesh = midiKeyMap.get(Number(midi));
    // Visual feedback: apply glow for keyboard-triggered notes
    if(mesh) try{ applyKeyGlow(mesh, Number(midi), true); }catch(e){}
    playUserNote(Number(midi), mesh);
  }catch(e){ console.warn('noteOn failed', e); }
}
function noteOff(midi){
  try{ stopUserNote(Number(midi)); }catch(e){ console.warn('noteOff failed', e); }
}

function handleKeyDown(ev){
  // Allow modifier shortcuts to pass through
  if(ev.ctrlKey || ev.altKey || ev.metaKey) return;
  const code = ev.code;
  const midi = CODE_TO_MIDI.get(code);
  if(midi == null) return;

  // Prevent default browser action for slash but allow note handling
  if(code === 'Slash') ev.preventDefault();

  // Avoid repeats and track by code
  if(ev.repeat) return;
  if(downCodes.has(code)) return;
  downCodes.add(code);

  // IMPORTANT: latch MIDI by `code` so keyup releases the same note regardless of layout/modifiers
  const m = Number(midi);
  codeToMidiDown.set(code, m);

  // Track active MIDI notes by number
  activeNoteSet.add(m);
  noteOn(m);
}

function handleKeyUp(ev){
  const code = ev.code;
  // ALWAYS release by the latched value, not by recomputing from key/code
  const m = codeToMidiDown.get(code);
  if(m == null) return;

  ev.preventDefault();

  downCodes.delete(code);
  codeToMidiDown.delete(code);
  activeNoteSet.delete(m);
  noteOff(m);
}

function allNotesOff(){
  for(const m of Array.from(activeNoteSet)){
    try{ noteOff(m); }catch(e){}
  }
  activeNoteSet.clear();
  downCodes.clear();
  codeToMidiDown.clear();
}

// Panic: stop audio and visuals for all sources (keyboard, pointer, samples, oscillators)
function panicAllNotes(){
  try{ allNotesOff(); }catch(e){}
  try{ activeVoices.forEach(v=>{ try{ v.osc && v.osc.stop && v.osc.stop(); v.oscB && v.oscB.stop && v.oscB.stop(); v.oscC && v.oscC.stop && v.oscC.stop(); }catch(e){} }); activeVoices.clear(); }catch(e){}
  try{ activeSampleNodes.forEach((entry, k)=>{ try{ const t = (audioCtx && audioCtx.currentTime) ? audioCtx.currentTime : 0; if(entry && entry.gainNode){ entry.gainNode.gain.cancelScheduledValues(t); entry.gainNode.gain.setValueAtTime(0.0, t); } if(entry && entry.node && entry.node.stop) entry.node.stop((t || 0) + 0.02); }catch(e){} }); activeSampleNodes.clear(); }catch(e){}
  try{ if(pointerDownInfo){ try{ if(pointerDownInfo.played) stopUserNote(pointerDownInfo.midiNum); if(pointerDownInfo.glowApplied) applyKeyGlow(pointerDownInfo.mesh, pointerDownInfo.midiNum, false); }catch(e){} } pointerDownInfo = null; }catch(e){}
  try{ if(typeof pendingPlayTimer !== 'undefined' && pendingPlayTimer){ clearTimeout(pendingPlayTimer); pendingPlayTimer = null; } }catch(e){}
  try{ requestBackboardRedraw(); }catch(e){}
}

window.addEventListener('keydown', handleKeyDown, { capture:true, passive:false });
window.addEventListener('keyup', handleKeyUp, { capture:true, passive:false });
window.addEventListener('blur', panicAllNotes);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) panicAllNotes(); });
