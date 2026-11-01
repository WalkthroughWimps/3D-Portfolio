import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createModelFace} from '../model-face.js';
import {initPanelShell} from '../../../debug/panel-shell.js';
import {createPreferences} from '../../../_7-shared-scripts/core/preferences.js';
import {getSettingsArchive} from '../../../_7-shared-scripts/panel-assembly/SettingsArchive.mjs';
import {bindDisplayInput} from './display-input.js';

export const FISH_MOUNT = Object.freeze({normal: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0], center: [1.015, 0, 0]});
const PREF_KEY = 'site.about.fish.v1';
const FRAME_PREF_KEY = 'site.about.fish.frame.v1', FRAME_OWNER = 'about.fish.constructor';
const AUDIO_OWNER = 'about.fish.audio', RING_OWNER = 'about.fish.rings';
const RING_PREF_KEY = 'site.about.fish.rings.v1';
const FISH_URL = new URL('./assets/fish/fish-rig.glb', import.meta.url);
const MOUNT_URL = new URL('./assets/fish/fish-mount.glb', import.meta.url);
const HOVER_URL = new URL('./assets/fish/hover-rings.glb', import.meta.url);
const BACK_YAW = Math.PI;
const APERTURE_RADIUS = .9;
const MOUNT_SCALE = 1.03, HOVER_SCALE = 1.03, HOVER_HEIGHT = .75;
const HOVER_SPEEDS = [.19, -.14, .23, -.17, .27, -.11, .16];
const MAX_MOUTH_ANGLE = 1.05;
const MAX_HEAD_TURN = 1.3, MAX_TAIL_FLAP = .29, TAIL_FLAP_SPEED = 2*Math.PI*2.8;
const FRAME_OUTER = .895, FRAME_GAP = .014, FRAME_Z = -.045;
const HOVER_DEFAULTS = Object.freeze({speed: 1, color: '#176381', count: 7, spacing: 1});
const HOVER_RANGES = Object.freeze({speed: [0, 3], count: [0, 7], spacing: [.5, 1.5]});
const FRAME_DEFAULTS = Object.freeze({frameWidth: .14, jut: 0, enterSeconds: 1.25,
  exitSeconds: 1.25, separateExit: false});
const frameRange = Object.freeze({frameWidth: [.06, .24], jut: [-.2, .3],
  enterSeconds: [.45, 3], exitSeconds: [.45, 3]});
const smooth = t => {t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t);};
const near = (a, b) => Math.abs(a - b) < 1e-5;
function normalizeFrameOptions(value = {}) {
  const result = {...FRAME_DEFAULTS};
  for (const [key, [min, max]] of Object.entries(frameRange)) {
    const number = Number(value?.[key]);
    if (Number.isFinite(number)) result[key] = Math.round(THREE.MathUtils.clamp(number, min, max)*1000)/1000;
  }
  if (typeof value?.separateExit === 'boolean') result.separateExit = value.separateExit;
  return result;
}
function validFrameOptions(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, entry]) => key === 'separateExit' ? typeof entry === 'boolean'
      : Object.hasOwn(frameRange, key) && typeof entry === 'number' && Number.isFinite(entry)));
}
function normalizeHoverSettings(value = {}) {
  const result = {...HOVER_DEFAULTS};
  for (const [key, [min, max]] of Object.entries(HOVER_RANGES)) {
    const number = Number(value?.[key]);
    if (Number.isFinite(number)) result[key] = key === 'count'
      ? Math.round(THREE.MathUtils.clamp(number, min, max))
      : Math.round(THREE.MathUtils.clamp(number, min, max)*100)/100;
  }
  if (typeof value?.color === 'string' && /^#[\da-f]{6}$/i.test(value.color)) result.color = value.color.toLowerCase();
  return result;
}
function validHoverSettings(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 4 && Object.keys(value).every(key => ['speed', 'color', 'count', 'spacing'].includes(key)) &&
    typeof value.speed === 'number' && Number.isFinite(value.speed) && value.speed >= 0 && value.speed <= 3 &&
    Number.isInteger(value.count) && value.count >= 0 && value.count <= 7 &&
    typeof value.spacing === 'number' && Number.isFinite(value.spacing) && value.spacing >= .5 && value.spacing <= 1.5 &&
    typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color));
}

function mountMatrix() {
  return new THREE.Matrix4().makeBasis(new THREE.Vector3(...FISH_MOUNT.right),
    new THREE.Vector3(...FISH_MOUNT.up), new THREE.Vector3(...FISH_MOUNT.normal))
    .setPosition(...FISH_MOUNT.center);
}

function backingProfile(context, backing) {
  context.cube.updateWorldMatrix(true, true);
  const inverse = context.cube.matrixWorld.clone().multiply(mountMatrix()).invert();
  const triangles = [], point = new THREE.Vector3();
  const sources = [];
  context.gltf.scene.traverse(node => {
    if (node === backing || /cubemain|inner_lip|Concealed_Stationary_Bearing_Stator/i.test(node.name)) sources.push(node);
  });
  for (const source of sources) source.traverse(mesh => {
    if (!mesh.isMesh) return;
    const position = mesh.geometry?.getAttribute('position');
    if (!position) return;
    const matrix = inverse.clone().multiply(mesh.matrixWorld), index = mesh.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const v = [0, 1, 2].map(offset => point.fromBufferAttribute(position,
        index ? index.getX(i + offset) : i + offset).applyMatrix4(matrix).clone());
      const [a, b, c] = v, cross = (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
      const inside = Math.abs(cross) > 1e-10 && [
        (b.x*c.y-b.y*c.x)/cross, (c.x*a.y-c.y*a.x)/cross, (a.x*b.y-a.y*b.x)/cross
      ].every(weight => weight >= -1e-8);
      let radius = inside ? 0 : Infinity;
      for (let edge = 0; edge < 3; edge++) {
        const start = v[edge], end = v[(edge+1)%3], dx = end.x-start.x, dy = end.y-start.y;
        const t = THREE.MathUtils.clamp(-(start.x*dx+start.y*dy)/(dx*dx+dy*dy || 1), 0, 1);
        radius = Math.min(radius, Math.hypot(start.x+t*dx, start.y+t*dy));
      }
      triangles.push({radius, z: Math.max(a.z, b.z, c.z)});
    }
  });
  if (!triangles.length) throw new Error('About backing clearance could not be measured');
  triangles.sort((a, b) => a.radius-b.radius);
  let maximum = -Infinity;
  for (const entry of triangles) {maximum = Math.max(maximum, entry.z); entry.z = maximum;}
  return triangles;
}

function barrierAt(profile, radius) {
  let lo = 0, hi = profile.length;
  while (lo < hi) {const mid = (lo+hi)>>1; if (profile[mid].radius <= radius) lo = mid+1; else hi = mid;}
  return lo ? profile[lo-1].z : -Infinity;
}

function disposeOwned(group) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  group?.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    const ownMaterials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of ownMaterials) if (material) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  group?.removeFromParent();
}

export function createFishFace({focusFace = () => {}} = {}) {
  const binding = createModelFace({id: 'about', backingName: 'back.about'}), prefs = createPreferences();
  const archive = getSettingsArchive();
  let persisted = {};
  try {persisted = JSON.parse(prefs.getItem(PREF_KEY) || '{}');} catch { /* Keep defaults. */ }
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) persisted = {};
  let framePersisted = {};
  try {framePersisted = JSON.parse(prefs.getItem(FRAME_PREF_KEY) || '{}');} catch { /* Keep defaults. */ }
  let frameOptions = normalizeFrameOptions(framePersisted);
  let hoverPersisted = {};
  try {hoverPersisted = JSON.parse(prefs.getItem(RING_PREF_KEY) || '{}');} catch { /* Keep defaults. */ }
  let hoverOptions = normalizeHoverSettings(hoverPersisted);
  let activeHoverLayout = {count: hoverOptions.count, spacing: hoverOptions.spacing};
  // Deployment is an explicit session action. Older saved auto-deploy state
  // must never open the newly click-operated mechanism on page load.
  let deployed = false, audioEnabled = persisted.audioEnabled !== false;
  let responseGain = Number.isFinite(persisted.responseGain)
    ? Math.round(THREE.MathUtils.clamp(persisted.responseGain, 0, 10)*10)/10 : 1;
  let host = null, group = null, carrier = null, aperture = null, assembly = null, facing = null, plate = null, fish = null, frame = null, frameBack = null, frameInnerWall = null;
  let hoverCarrier = null, hover = null, rings = [], ringRest = [], hoverPhase = 0;
  let head = null, mouth = null, tail = null, profile = null, loadVersion = 0;
  let input = null;
  let disposed = false, suspended = false, enabled = true, reduced = false, upright = true;
  let focusPending = new URLSearchParams(location.search).get('face') === 'about';
  let roll = 0, rollTarget = 0, lastRaw = null, audioLevel = 0, mouthLevel = 0, tailPhase = 0, tailEnvelope = 0;
  let touchGesture = null, lastTouchToggleAt = -Infinity;
  let contrastGain = 1, restDepth = -.04, peakDepth = .23, finalDepth = .23, progress = 0;
  let frameInner = FRAME_OUTER-frameOptions.frameWidth, assemblyScale = (frameInner-FRAME_GAP)/(.85*MOUNT_SCALE);
  let recalibrationTimer = null, ringRecalibrationTimer = null;
  let restNeed = -.04, turnNeed = .23, finalNeed = .1;
  let framingDistance = 0;
  const state = {ready: false, error: null, progress, deployed, stage: 'seat', focused: false,
    restDepth, peakDepth, finalDepth, mouth: 0, headTurn: 0, tailFlap: 0, level: 0, yaw: BACK_YAW, ringDrop: 0, contrastGain,
    clearance: null};
  const section = document.createElement('section');
  const constructorRoot = document.createElement('div');
  const pictureURL = new URL(location.href); pictureURL.searchParams.set('face', 'about'); pictureURL.searchParams.set('about', 'pictures');
  constructorRoot.innerHTML = `<section data-section-key="fish-content-mode"><h3>Fish content</h3>
    <p>The mounted singing fish is active.</p>
    <p><a href="${pictureURL.href}">Switch to picture rings</a></p></section>
    <section data-section-key="fish-frame-motion"><h3>Fish frame and motion</h3>
    <p>Frame width reaches inward from the cube’s circular opening.</p>
    <label>Frame width <output data-fish-readout="frameWidth"></output>
      <input type="range" name="frameWidth" data-fish-option="frameWidth" min=".06" max=".24" step=".005"></label>
    <label>Fish assembly jut <output data-fish-readout="jut"></output>
      <input type="range" name="jut" data-fish-option="jut" min="-.2" max=".3" step=".005"></label>
    <p>At zero, the green plate meets the frame when seated. The open assembly stays forward to clear its turn and hover rings. Negative tucks it inward; positive brings it outward.</p>
    <p data-fish-jut-effective role="status"></p>
    <label>Come out in <output data-fish-readout="enterSeconds"></output>
      <input type="range" name="enterSeconds" data-fish-option="enterSeconds" min=".45" max="3" step=".05"></label>
    <label><input type="checkbox" name="separateExit" data-fish-option="separateExit"> Set a separate return time</label>
    <label data-fish-exit-row>Go back in <output data-fish-readout="exitSeconds"></output>
      <input type="range" name="exitSeconds" data-fish-option="exitSeconds" min=".45" max="3" step=".05"></label>
    <p>The flat green plate and mounted fish stay together. The ring remains at the opening while the assembly moves.</p></section>`;
  section.innerHTML = `<h3>Singing fish</h3>
    <p>Click the green backplate to bring the mounted fish and hover rings out. Click again to put them away. Oddio sound opens its mouth, turns its head outward, and flaps its tail when displayed.</p>
    <div class="about-picture-actions"><button type="button" data-fish-focus>Show Fish face</button>
      <button type="button" data-fish-deploy>Deploy fish</button></div>
    <label><input type="checkbox" data-fish-audio> Respond to Oddio sound</label>
    <label>Sound response <output data-fish-response-readout></output>
      <input type="range" data-fish-response aria-label="Sound response" min="0" max="10" step=".1"></label>
    <p>Lower values make smaller singing motions; 0 keeps the fish still. Higher values respond more strongly to the same sound.</p>
    <p><a data-fish-pictures href="${pictureURL.href}">Open picture rings</a></p>
    <p data-fish-status role="status" aria-live="polite">Loading fish…</p>
    <h4 data-section-id="fish-hover-rings">Hover rings</h4>
    <p>Choose the number, pace, color and vertical spacing of the deployed hoops.</p>
    <label>Speed <output data-fish-ring-speed-readout></output>
      <input type="range" name="hoverSpeed" data-fish-ring-option="speed" aria-label="Hover ring speed" min="0" max="3" step=".1"></label>
    <label>Color <output data-fish-ring-color-readout></output>
      <input type="color" name="hoverColor" data-fish-ring-option="color" aria-label="Hover ring color"></label>
    <label>Number <output data-fish-ring-count-readout></output>
      <input type="range" name="hoverCount" data-fish-ring-option="count" aria-label="Number of hover rings" min="0" max="7" step="1"></label>
    <label>Vertical spacing <output data-fish-ring-spacing-readout></output>
      <input type="range" name="hoverSpacing" data-fish-ring-option="spacing" aria-label="Hover ring vertical spacing" min=".5" max="1.5" step=".05"></label>
    `;
  const events = new AbortController(), shell = initPanelShell();
  const unregister = shell.registerContext('about', 'Fish', section);
  const unregisterConstructor = shell.registerConstructorContext('about', 'Fish', constructorRoot);
  const focusButton = section.querySelector('[data-fish-focus]'), deployButton = section.querySelector('[data-fish-deploy]');
  const audioCheck = section.querySelector('[data-fish-audio]'); audioCheck.checked = audioEnabled;
  const responseSlider = section.querySelector('[data-fish-response]');
  const responseReadout = section.querySelector('[data-fish-response-readout]');
  const hoverFields = [...section.querySelectorAll('[data-fish-ring-option]')];
  const normal = new THREE.Vector3(), center = new THREE.Vector3(), cameraPoint = new THREE.Vector3();
  const screenRight = new THREE.Vector3(), cameraNormal = new THREE.Vector3(), faceInverse = new THREE.Matrix4();
  const mouthRest = new THREE.Quaternion(), headRest = new THREE.Quaternion(), tailRest = new THREE.Quaternion();
  const audioTurn = new THREE.Quaternion(), audioAxis = new THREE.Vector3(1, 0, 0);
  const facingWorld = new THREE.Quaternion(), facingLocal = new THREE.Quaternion();
  const facingForward = new THREE.Vector3(), facingUp = new THREE.Vector3(), facingRight = new THREE.Vector3();
  const facingMatrix = new THREE.Matrix4(), facingCenter = new THREE.Vector3(), facingCamera = new THREE.Vector3();

  function save() {prefs.setItem(PREF_KEY, JSON.stringify({audioEnabled, responseGain}));}
  function syncAudioControls() {
    audioCheck.checked = audioEnabled;
    if (document.activeElement !== responseSlider) responseSlider.value = String(responseGain);
    responseReadout.textContent = `${responseGain.toFixed(1)}×`;
  }
  function syncHoverControls() {
    for (const field of hoverFields) {
      const key = field.dataset.fishRingOption, value = hoverOptions[key];
      if (document.activeElement !== field) field.value = String(value);
      const output = section.querySelector(`[data-fish-ring-${key}-readout]`);
      if (output) output.textContent = key === 'speed' ? `${value.toFixed(1)}×`
        : key === 'spacing' ? `${value.toFixed(2)}×`
        : key === 'color' ? value.toUpperCase() : String(value);
    }
  }
  function applyHoverLayout() {
    if (hover) hover.scale.set(HOVER_SCALE, HOVER_SCALE*HOVER_HEIGHT*activeHoverLayout.spacing, HOVER_SCALE);
    if (hoverCarrier) hoverCarrier.visible = activeHoverLayout.count > 0;
    rings.forEach((ring, index) => {
      ring.visible = index < activeHoverLayout.count;
    });
  }
  function applyHoverOptions({layout = true} = {}) {
    if (layout) applyHoverLayout();
    rings.forEach(ring => {
      ring.traverse(node => {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) if (material?.userData.fishGlow) {
          material.color.setStyle(hoverOptions.color);
          material.emissive.setStyle(hoverOptions.color);
        }
      });
    });
    applyContrast();
  }
  function setHoverOptions(value) {
    const previous = hoverOptions;
    hoverOptions = normalizeHoverSettings({...hoverOptions, ...value});
    prefs.setItem(RING_PREF_KEY, JSON.stringify(hoverOptions));
    const needsClearance = hoverOptions.count !== previous.count || hoverOptions.spacing !== previous.spacing;
    applyHoverOptions({layout: !needsClearance}); syncHoverControls();
    if (needsClearance) {
      clearTimeout(ringRecalibrationTimer);
      const commit = () => {
        ringRecalibrationTimer = null;
        activeHoverLayout = {count: hoverOptions.count, spacing: hoverOptions.spacing};
        applyHoverLayout(); setPose();
        if (state.ready) calculateClearance();
      };
      if (state.ready) ringRecalibrationTimer = setTimeout(commit, 180);
      else commit();
    }
    archive.capture(RING_OWNER);
  }
  function setMouthPose(level) {
    if (mouth) mouth.quaternion.copy(mouthRest).multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1), THREE.MathUtils.clamp(level, 0, 1)*MAX_MOUTH_ANGLE));
  }
  function setAudioBonePose(headLevel, tailValue) {
    // The Head's local X points up in fish space, turning its nose away from
    // the board. The Tail's local X points out of the board, sweeping the fin.
    const exposure = smooth((progress-.6)/.4);
    if (head) head.quaternion.copy(headRest).multiply(audioTurn.setFromAxisAngle(
      audioAxis, MAX_HEAD_TURN*headLevel*exposure));
    if (tail) tail.quaternion.copy(tailRest).multiply(audioTurn.setFromAxisAngle(
      audioAxis, MAX_TAIL_FLAP*tailValue*exposure));
    state.headTurn = MAX_HEAD_TURN*headLevel*exposure;
    state.tailFlap = MAX_TAIL_FLAP*tailValue*exposure;
  }
  function syncConstructor() {
    for (const field of constructorRoot.querySelectorAll('[data-fish-option]')) {
      const value = frameOptions[field.dataset.fishOption];
      if (field.type === 'checkbox') field.checked = value;
      else if (document.activeElement !== field) field.value = value;
    }
    for (const output of constructorRoot.querySelectorAll('[data-fish-readout]')) {
      const key = output.dataset.fishReadout, value = frameOptions[key];
      output.textContent = key.endsWith('Seconds') ? `${value.toFixed(2)} s`
        : `${value >= 0 && key === 'jut' ? '+' : ''}${value.toFixed(3)}`;
    }
    constructorRoot.querySelector('[data-fish-exit-row]').hidden = !frameOptions.separateExit;
    const signed = value => `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
    const effective = constructorRoot.querySelector('[data-fish-jut-effective]');
    effective.hidden = !state.jutClamped;
    effective.textContent = state.jutClamped
      ? `Clearance limits the requested position: seated ${signed(state.effectiveSeatJut)}, open ${signed(state.effectiveShownJut)}.`
      : '';
  }
  function resolveDepths() {
    // Zero lines up each visible plate side with the stationary frame face.
    const seatReference = FRAME_Z+.0164566*MOUNT_SCALE*assemblyScale;
    const shownReference = FRAME_Z-.0411415*MOUNT_SCALE*assemblyScale;
    restDepth = Math.max(restNeed, seatReference+frameOptions.jut);
    finalDepth = Math.max(finalNeed, turnNeed+.022, shownReference+frameOptions.jut);
    peakDepth = Math.max(turnNeed+.022, restDepth+.12, finalDepth);
    state.restDepth = restDepth; state.peakDepth = peakDepth; state.finalDepth = finalDepth;
    state.requestedJut = frameOptions.jut;
    state.effectiveSeatJut = restDepth-seatReference;
    state.effectiveShownJut = finalDepth-shownReference;
    state.jutClamped = Math.abs(state.effectiveSeatJut-frameOptions.jut) > .002 ||
      Math.abs(state.effectiveShownJut-frameOptions.jut) > .002;
    if (state.clearance) Object.assign(state.clearance, {restDepth, peakDepth, finalDepth,
      turnMargin: peakDepth-turnNeed});
    syncConstructor(); setPose();
  }
  function updateFrameGeometry() {
    frameInner = FRAME_OUTER-frameOptions.frameWidth;
    assemblyScale = (frameInner-FRAME_GAP)/(.85*MOUNT_SCALE);
    if (frame) {
      frame.geometry.dispose();
      frame.geometry = new THREE.RingGeometry(frameInner, FRAME_OUTER, 96);
      frameBack.geometry.dispose(); frameBack.geometry = new THREE.RingGeometry(frameInner, FRAME_OUTER, 96);
      frameInnerWall.geometry.dispose(); frameInnerWall.geometry = new THREE.CylinderGeometry(frameInner, frameInner, .13, 96, 1, true);
    }
    assembly?.scale.setScalar(assemblyScale);
    if (state.ready) {measureMountRadius(); calculateClearance();}
    else syncConstructor();
  }
  function scheduleRecalibration(immediate = false) {
    clearTimeout(recalibrationTimer);
    recalibrationTimer = setTimeout(() => {recalibrationTimer = null; updateFrameGeometry();}, immediate ? 0 : 180);
  }
  function setFrameOptions(value, immediate = false) {
    const previous = frameOptions;
    frameOptions = normalizeFrameOptions({...frameOptions, ...value});
    prefs.setItem(FRAME_PREF_KEY, JSON.stringify(frameOptions));
    archive.capture(FRAME_OWNER);
    if (frameOptions.frameWidth !== previous.frameWidth) scheduleRecalibration(immediate);
    else if (frameOptions.jut !== previous.jut) resolveDepths();
    else syncConstructor();
  }
  constructorRoot.addEventListener('input', event => {
    const field = event.target.closest('[data-fish-option]');
    if (!field) return;
    const key = field.dataset.fishOption;
    setFrameOptions({[key]: field.type === 'checkbox' ? field.checked : Number(field.value)});
  }, {signal: events.signal});
  constructorRoot.addEventListener('change', event => {
    if (event.target.matches('[data-fish-option="frameWidth"]')) scheduleRecalibration(true);
  }, {signal: events.signal});
  function toggleDeployment() {
    if (!host || !state.ready || !enabled || suspended) return;
    deployed = !deployed; state.deployed = deployed;
    syncUI();
  }
  function hitsAssembly(event) {
    if (!plate || !host || !state.ready || !enabled || suspended) return false;
    const bounds = host.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,
      -(event.clientY-bounds.top)/bounds.height*2+1);
    host.camera.updateMatrixWorld(); host.physicalCube.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(pointer, host.camera);
    const first = raycaster.intersectObject(host.physicalCube, true).find(({object}) => {
      let node = object;
      while (node && node !== host.physicalCube) {if (!node.visible) return false; node = node.parent;}
      return true;
    });
    return Boolean(first && plate.getObjectById(first.object.id));
  }
  // The shared cube can consume a touch pointerdown before the picture-mode
  // canvas helper receives it. Observe touch on window capture so a tap still
  // toggles the fish, while a drag remains the host's cube gesture.
  window.addEventListener('pointerdown', event => {
    touchGesture = event.pointerType === 'touch' && event.isPrimary && hitsAssembly(event)
      ? {id: event.pointerId, x: event.clientX, y: event.clientY, moved: false} : null;
  }, {capture: true, signal: events.signal});
  window.addEventListener('pointermove', event => {
    if (touchGesture?.id === event.pointerId && Math.hypot(event.clientX-touchGesture.x,
      event.clientY-touchGesture.y) > 7) touchGesture.moved = true;
  }, {capture: true, signal: events.signal});
  window.addEventListener('pointerup', event => {
    if (!touchGesture || event.pointerId !== touchGesture.id) return;
    const moved = touchGesture.moved || Math.hypot(event.clientX-touchGesture.x, event.clientY-touchGesture.y) > 7;
    touchGesture = null;
    if (moved || event.target !== host?.canvas || !hitsAssembly(event)) return;
    lastTouchToggleAt = performance.now(); toggleDeployment();
  }, {capture: true, signal: events.signal});
  window.addEventListener('pointercancel', () => {touchGesture = null;}, {capture: true, signal: events.signal});
  function syncUI() {
    focusButton.disabled = !host || !enabled || suspended;
    deployButton.disabled = !host || !state.ready || !enabled || suspended;
    deployButton.textContent = deployed ? 'Retract fish' : 'Deploy fish';
    deployButton.setAttribute('aria-pressed', String(deployed));
    syncAudioControls();
    syncHoverControls();
    section.querySelector('[data-fish-status]').textContent = state.error || (!state.ready ? 'Loading fish…'
      : progress > .995 ? 'Fish deployed' : progress < .005 ? 'Fish seated' : deployed ? 'Deploying fish…' : 'Retracting fish…');
  }
  section.addEventListener('click', event => {
    if (event.target.closest('[data-fish-focus]') && host && enabled && !suspended) focusFace(FISH_MOUNT);
    if (event.target.closest('[data-fish-deploy]') && state.ready && enabled && !suspended) {
      toggleDeployment();
    }
  }, {signal: events.signal});
  audioCheck.addEventListener('change', () => {
    audioEnabled = audioCheck.checked; save(); archive.capture(AUDIO_OWNER);
  }, {signal: events.signal});
  responseSlider.addEventListener('input', () => {
    const value = Number(responseSlider.value);
    if (Number.isFinite(value)) responseGain = Math.round(THREE.MathUtils.clamp(value, 0, 10)*10)/10;
    syncAudioControls(); save(); archive.capture(AUDIO_OWNER);
  }, {signal: events.signal});
  section.addEventListener('input', event => {
    const field = event.target.closest('[data-fish-ring-option]');
    if (!field) return;
    const key = field.dataset.fishRingOption;
    setHoverOptions({[key]: field.type === 'color' ? field.value : Number(field.value)});
  }, {signal: events.signal});

  function createHardware() {
    frame = new THREE.Mesh(new THREE.RingGeometry(frameInner, FRAME_OUTER, 96),
      new THREE.MeshStandardMaterial({color: 0x20384b, metalness: .52, roughness: .42,
        emissive: 0x17364a, emissiveIntensity: .07*contrastGain, side: THREE.DoubleSide}));
    frame.name = 'Stationary fish annular frame'; frame.userData.stickySurfaceId='face:about:front-annulus:0'; frame.position.z = FRAME_Z;
    group.add(frame);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(FRAME_OUTER, FRAME_OUTER, .13, 96, 1, true),frame.material);
    sleeve.name = 'Fish outer frame sleeve to cube rim'; sleeve.userData.stickySurfaceId='face:about:outer-sleeve:0'; sleeve.rotation.x = Math.PI/2; sleeve.position.z = FRAME_Z-.065; group.add(sleeve);
    frameInnerWall = new THREE.Mesh(new THREE.CylinderGeometry(frameInner, frameInner, .13, 96, 1, true),frame.material);
    frameInnerWall.name = 'Fish inner frame sleeve'; frameInnerWall.userData.stickySurfaceId='face:about:inner-sleeve:0'; frameInnerWall.rotation.x = Math.PI/2; frameInnerWall.position.z = FRAME_Z-.065; group.add(frameInnerWall);
    frameBack = new THREE.Mesh(new THREE.RingGeometry(frameInner, FRAME_OUTER, 96),frame.material);
    frameBack.name = 'Fish rear annular seat at cube rim'; frameBack.userData.stickySurfaceId='face:about:rear-annulus:0'; frameBack.position.z = FRAME_Z-.13; group.add(frameBack);
    for (let i=0;i<8;i++) {
      const angle=i*Math.PI/4, radial=new THREE.Vector3(Math.cos(angle),Math.sin(angle),0);
      const inner=radial.clone().multiplyScalar(.88); inner.z=FRAME_Z-.13;
      const outer=radial.clone().multiplyScalar(.95); outer.z=-.045;
      const delta=outer.clone().sub(inner), clamp=new THREE.Mesh(
        new THREE.CylinderGeometry(.011,.011,delta.length(),10),frame.material);
      clamp.name='Fish frame clamp to cube rim';clamp.userData.stickySurfaceId=`face:about:rim-clamp:${i}`;clamp.position.copy(inner).add(outer).multiplyScalar(.5);
      clamp.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());group.add(clamp);
    }
    carrier = new THREE.Group(); carrier.name = 'Fish upright carrier'; group.add(carrier);
    assembly = new THREE.Group(); assembly.name = 'Fish deployment'; carrier.add(assembly);
    assembly.scale.setScalar(assemblyScale);
    facing = new THREE.Group(); facing.name = 'Fish camera-facing pivot'; assembly.add(facing);
    plate = new THREE.Group(); plate.name = 'Two-sided fish backplate'; facing.add(plate);
    hoverCarrier = new THREE.Group(); hoverCarrier.name = 'Authored hover deployment'; facing.add(hoverCarrier);
  }

  function measureMountRadius() {
    host.cube.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(), point = new THREE.Vector3();
    let widest = 0;
    aperture.traverse(node => {
      if (!node.isMesh) return;
      const position = node.geometry?.getAttribute('position'); if (!position) return;
      const matrix = inverse.clone().multiply(node.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(matrix);
        const radius = Math.hypot(point.x, point.y);
        widest = Math.max(widest, radius);
      }
    });
    state.mountRadius = widest;
    state.mountFitsAperture = widest < APERTURE_RADIUS;
  }

  function themeSourceParts() {
    aperture.traverse(node => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (materials.some(material => material?.name.includes('FishMount_Tiles_'))) {
        const position = node.geometry.getAttribute('position');
        let minX = Infinity, minY = Infinity, nearest = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < position.count; i++) {
          minX = Math.min(minX, position.getX(i)); maxX = Math.max(maxX, position.getX(i));
          minY = Math.min(minY, position.getY(i)); maxY = Math.max(maxY, position.getY(i));
          nearest = Math.min(nearest, position.getZ(i));
        }
        const plane = new THREE.PlaneGeometry(maxX-minX, maxY-minY);
        plane.rotateY(Math.PI);
        plane.translate((minX+maxX)/2, (minY+maxY)/2, nearest - .004);
        node.userData.stickySurfaceId = 'face:about:fish-scale-plane:v1';
        node.userData.stickyPlaneGeometry = plane;
        node.userData.stickyPlaneMaterial = 'FishMount_Tiles_';
        node.userData.stickyPlaneTangent = [-1, 0, 0];
      }
      for (const material of materials) {
        if (material.name.includes('FishMount_Tiles_')) material.color.set(0xffffff);
        else if (material.name.includes('FishMount_Cloudy_Wallpaper')) {
          material.color.set(0x2e4b64);
          material.roughness = Math.max(material.roughness, .58);
          material.metalness = Math.min(material.metalness, .25);
        } else if (material.name.includes('FishMount_Old_Gold')) {
          material.color.set(0xa89175);
          material.roughness = Math.max(material.roughness, .42);
          material.emissive.set(0x34281b);
          material.userData.fishGlow = .11;
        }
      }
    });
    hover.traverse(node => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        material.transparent = material.opacity < 1;
        material.depthWrite = material.opacity >= 1;
        material.side = THREE.DoubleSide;
        material.emissive.setStyle(hoverOptions.color);
        material.userData.fishGlow = .18 * material.opacity;
      }
    });
    applyContrast();
  }

  function applyContrast() {
    if (frame) frame.material.emissiveIntensity = .07*contrastGain;
    for (const root of [aperture, hover]) root?.traverse(node => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) if (material?.userData.fishGlow)
        material.emissiveIntensity = material.userData.fishGlow * contrastGain;
    });
  }

  function sampleSupport(pose, expression = 0) {
    progress = pose; mouthLevel = Math.abs(expression); restDepth = peakDepth = finalDepth = 0; setPose();
    setAudioBonePose(mouthLevel, expression);
    setMouthPose(mouthLevel);
    // SkinnedMesh.updateMatrixWorld refreshes bindMatrixInverse for attached
    // skinning. updateWorldMatrix would skip that override and understate the
    // fish's depth after the parent yaw/scale changes.
    host.cube.updateMatrixWorld(true);
    const inverse = group.matrixWorld.clone().invert(), point = new THREE.Vector3();
    let needed = -Infinity, farthest = 0, spatialRadius = 0, count = 0, minZ = Infinity, fishRadius = 0;
    let fishNeeded = -Infinity, hoverNeeded = -Infinity, mountNeeded = -Infinity;
    assembly.traverse(node => {
      if (!node.isMesh) return;
      for (let parent = node; parent && parent !== assembly; parent = parent.parent) if (!parent.visible) return;
      const position = node.geometry?.getAttribute('position'); if (!position) return;
      node.skeleton?.update();
      const matrix = inverse.clone().multiply(node.matrixWorld);
      let owner = node;
      while (owner && owner !== fish && owner !== hover && owner !== aperture) owner = owner.parent;
      const isFish = owner === fish, isHover = owner === hover;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        if (node.isSkinnedMesh) node.applyBoneTransform(i, point);
        point.applyMatrix4(matrix);
        const radius = Math.hypot(point.x, point.y);
        farthest = Math.max(farthest, radius);
        spatialRadius = Math.max(spatialRadius, point.length());
        if (isFish) fishRadius = Math.max(fishRadius, radius);
        minZ = Math.min(minZ, point.z);
        const frameBarrier = radius >= frameInner-.002 && radius <= FRAME_OUTER+.002 ? FRAME_Z : -Infinity;
        const support = Math.max(barrierAt(profile, radius), frameBarrier) + .018 - point.z;
        needed = Math.max(needed, support);
        if (isFish) fishNeeded = Math.max(fishNeeded, support);
        else if (isHover) hoverNeeded = Math.max(hoverNeeded, support);
        else mountNeeded = Math.max(mountNeeded, support);
        count++;
      }
    });
    return {needed, farthest, spatialRadius, fishRadius, count, minZ, fishNeeded, hoverNeeded, mountNeeded};
  }

  function facingSphereNeed(radius) {
    // For every possible camera/cube orientation, a vertex stays within this
    // origin-centred sphere. At a backing radius r its nearest possible depth
    // is -sqrt(radius²-r²). The profile is a step function, so each step start
    // is enough to bound the whole surface without per-frame vertex scans.
    let need = -Infinity;
    for (const entry of profile) if (entry.radius <= radius)
      need = Math.max(need, entry.z + Math.sqrt(Math.max(0, radius*radius-entry.radius*entry.radius)));
    if (frameInner-.002 <= radius) need = Math.max(need,
      FRAME_Z + Math.sqrt(Math.max(0, radius*radius-(frameInner-.002)**2)));
    return need + .024;
  }

  function setRingMotion(phase) {
    const yaw = new THREE.Quaternion();
    rings.forEach((ring, index) => {
      const rest = ringRest[index], wave = phase*.8 + index*1.2;
      ring.quaternion.copy(rest.quaternion).multiply(yaw.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), phase*HOVER_SPEEDS[index]));
      ring.position.copy(rest.position); ring.position.y += .012*Math.sin(wave);
      ring.scale.copy(rest.scale).multiplyScalar(1+.025*Math.sin(wave));
    });
    state.hoverPhase = phase;
  }

  function setRingClearanceProbe(angle, scale, bob) {
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    rings.forEach((ring, index) => {
      const rest = ringRest[index];
      ring.quaternion.copy(rest.quaternion).multiply(yaw);
      ring.position.copy(rest.position); ring.position.y += bob;
      ring.scale.copy(rest.scale).multiplyScalar(scale);
    });
  }

  function calculateClearance() {
    const savedProgress = progress, savedMouth = mouthLevel, savedPhase = hoverPhase;
    const savedTravel = carrier.position.clone();
    carrier.position.set(0, 0, 0); // Calibrate for the least extended host travel pose.
    const rest = sampleSupport(0), speakingRest = sampleSupport(0, 1);
    let turnNeeded = -Infinity, turnRadius = 0, facingRadius = 0;
    for (let i = 0; i <= 32; i++) {
      const pose = .32 + i*.56/32;
      for (const expression of [0, 1, -1]) {
        const sample = sampleSupport(pose, expression);
        turnNeeded = Math.max(turnNeeded, sample.needed);
        turnRadius = Math.max(turnRadius, sample.farthest);
        facingRadius = Math.max(facingRadius, sample.spatialRadius);
      }
    }
    const shown = sampleSupport(1), speakingShown = sampleSupport(1, 1);
    const reverseTailShown = sampleSupport(1, -1);
    facingRadius = Math.max(facingRadius, shown.spatialRadius, speakingShown.spatialRadius, reverseTailShown.spatialRadius);
    let hoverPhaseNeed = -Infinity, hoverPhaseRadius = 0;
    for (let i=0; i<16; i++) for (const scale of [.975, 1.025]) for (const bob of [-.012, .012]) {
      setRingClearanceProbe(i*Math.PI/8, scale, bob);
      for (const expression of [0, 1, -1]) {
        const sample = sampleSupport(1, expression);
        hoverPhaseNeed = Math.max(hoverPhaseNeed, sample.needed);
        hoverPhaseRadius = Math.max(hoverPhaseRadius, sample.farthest);
        facingRadius = Math.max(facingRadius, sample.spatialRadius);
      }
    }
    setRingMotion(savedPhase);
    restNeed = Math.max(rest.needed, speakingRest.needed);
    turnNeed = Math.max(turnNeeded, facingSphereNeed(facingRadius));
    finalNeed = Math.max(shown.needed, speakingShown.needed, reverseTailShown.needed, hoverPhaseNeed, turnNeed);
    carrier.position.copy(savedTravel);
    progress = savedProgress; mouthLevel = savedMouth; resolveDepths();
    setMouthPose(mouthLevel);
    state.clearance = {vertices: rest.count, restRadius: Math.max(rest.farthest, speakingRest.farthest), turnRadius,
      restMargin: .018, turnMargin: peakDepth-turnNeeded, restDepth, peakDepth, finalDepth,
      sampledPoses: 296, hoverPhaseRadius, facingRadius, facingSphereDepth: turnNeed,
      rigidFish: true, frameInner, frameOuter: FRAME_OUTER,
      plateFrameGap: frameInner-state.mountRadius,
      restSupport: [rest.needed, speakingRest.needed], restSupportByRole: {
        fish: Math.max(rest.fishNeeded, speakingRest.fishNeeded),
        hover: Math.max(rest.hoverNeeded, speakingRest.hoverNeeded),
        mount: Math.max(rest.mountNeeded, speakingRest.mountNeeded)},
      finalSupportByRole: {fish: Math.max(shown.fishNeeded, speakingShown.fishNeeded, reverseTailShown.fishNeeded),
        hover: Math.max(shown.hoverNeeded, speakingShown.hoverNeeded),
        mount: Math.max(shown.mountNeeded, speakingShown.mountNeeded)},
      restMinZ: [rest.minZ, speakingRest.minZ],
      backingAt: [.2, .4, .6, .8, .875].map(radius => barrierAt(profile, radius))};
  }

  function setPose() {
    if (!assembly) return;
    const rise = smooth(progress / .32), turn = smooth((progress-.32)/.56), settle = smooth((progress-.88)/.12);
    assembly.position.z = THREE.MathUtils.lerp(restDepth, peakDepth, rise) + (finalDepth-peakDepth)*settle;
    plate.rotation.y = BACK_YAW * (1-turn);
    updateFacing(turn);
    if (hoverCarrier) {
      hoverCarrier.scale.setScalar(THREE.MathUtils.lerp(.002, 1, turn));
      const topAnchor = .586*HOVER_SCALE*HOVER_HEIGHT*activeHoverLayout.spacing;
      hoverCarrier.position.set(0, THREE.MathUtils.lerp(0, -.65*.85*MOUNT_SCALE-topAnchor, turn),
        THREE.MathUtils.lerp(0, .24, turn));
    }
    setAudioBonePose(tailEnvelope, tailEnvelope*Math.sin(tailPhase));
    state.progress = progress; state.yaw = plate.rotation.y; state.ringDrop = turn;
    state.stage = progress < .005 ? 'seat' : progress > .995 ? 'show' : progress < .32 ? 'lift' : progress < .88 ? 'turn' : 'settle';
  }

  function updateFacing(amount) {
    if (!facing || !host) return;
    if (amount <= 0) {facing.quaternion.identity(); return;}
    assembly.updateWorldMatrix(true, false);
    host.camera.updateWorldMatrix(true, false);
    assembly.getWorldPosition(facingCenter);
    host.camera.getWorldPosition(facingCamera);
    facingForward.copy(facingCamera).sub(facingCenter).normalize();
    facingUp.setFromMatrixColumn(host.camera.matrixWorld, 1);
    facingRight.crossVectors(facingUp, facingForward).normalize();
    if (facingRight.lengthSq() < 1e-8) facingRight.setFromMatrixColumn(host.camera.matrixWorld, 0);
    facingUp.crossVectors(facingForward, facingRight).normalize();
    facingWorld.setFromRotationMatrix(facingMatrix.makeBasis(facingRight, facingUp, facingForward));
    assembly.getWorldQuaternion(facingLocal).invert().multiply(facingWorld);
    facing.quaternion.identity().slerp(facingLocal, amount);
  }

  function updateUpright(dt) {
    if (!group || !host) return;
    if (!upright) {roll = rollTarget = 0; lastRaw = null; carrier.rotation.z = 0; return;}
    group.updateWorldMatrix(true, false); host.camera.updateWorldMatrix(true, false);
    faceInverse.copy(group.matrixWorld).invert();
    screenRight.setFromMatrixColumn(host.camera.matrixWorld, 0).transformDirection(faceInverse);
    cameraNormal.setFromMatrixColumn(host.camera.matrixWorld, 2).transformDirection(faceInverse);
    if (cameraNormal.z > .08 && screenRight.x**2 + screenRight.y**2 > .0064) {
      const raw = Math.atan2(screenRight.y, screenRight.x);
      const wrap = value => Math.atan2(Math.sin(value), Math.cos(value));
      rollTarget = lastRaw === null ? roll + wrap(raw-roll) : rollTarget + wrap(raw-lastRaw);
      lastRaw = raw;
      const delta = rollTarget-roll, step = THREE.MathUtils.clamp(dt, 0, .05);
      roll += reduced ? delta : THREE.MathUtils.clamp(delta*(1-Math.exp(-7*step)), -2.6*step, 2.6*step);
    } else lastRaw = null;
    carrier.rotation.z = roll;
  }

  function focusDot() {
    if (!group || !host) return -1;
    host.camera.updateMatrixWorld(); group.updateWorldMatrix(true, false);
    normal.set(0, 0, 1).applyQuaternion(group.getWorldQuaternion(new THREE.Quaternion()));
    group.getWorldPosition(center); host.camera.getWorldPosition(cameraPoint).sub(center).normalize();
    return normal.dot(cameraPoint);
  }

  function loadFish() {
    const version = ++loadVersion;
    const loader = new GLTFLoader();
    Promise.allSettled([FISH_URL, MOUNT_URL, HOVER_URL].map(url => loader.loadAsync(url.href))).then(results => {
      if (version !== loadVersion || !host || disposed || results.some(result => result.status !== 'fulfilled')) {
        for (const result of results) if (result.status === 'fulfilled') disposeOwned(result.value.scene);
        if (version === loadVersion && !disposed) {
          const failure = results.find(result => result.status === 'rejected')?.reason;
          state.error = `Fish asset unavailable: ${failure?.message || failure}`; syncUI();
        }
        return;
      }
      fish = results[0].value.scene; fish.name = 'Singing fish source rig'; fish.scale.setScalar(.86);
      aperture = results[1].value.scene; aperture.name = 'Original fish mount'; aperture.scale.setScalar(MOUNT_SCALE);
      hover = results[2].value.scene; hover.name = 'Original nested hover rings';
      // The authored XZ rings are horizontal: their Y positions form the
      // broad tapering stack beneath the mounted plate in the source video.
      hover.scale.set(HOVER_SCALE, HOVER_SCALE*HOVER_HEIGHT*activeHoverLayout.spacing, HOVER_SCALE);
      plate.add(aperture, fish); hoverCarrier.add(hover);
      rings = Array.from({length: 7}, (_, index) => hover.getObjectByName(`AuthoredHover_${index+1}`)).filter(Boolean);
      ringRest = rings.map(ring => ({position: ring.position.clone(), quaternion: ring.quaternion.clone(), scale: ring.scale.clone()}));
      setRingMotion(0);
      fish.traverse(node => {
        if (node.isMesh) for (const material of Array.isArray(node.material) ? node.material : [node.material])
          if (material?.normalMap) material.normalScale.multiplyScalar(.5);
        if (node.isBone && node.name === 'Head') head = node;
        if (node.isBone && node.name === 'Mouth') mouth = node;
        if (node.isBone && node.name === 'Tail') tail = node;
      });
      headRest.copy(head?.quaternion || new THREE.Quaternion());
      mouthRest.copy(mouth?.quaternion || new THREE.Quaternion());
      tailRest.copy(tail?.quaternion || new THREE.Quaternion());
      themeSourceParts(); applyHoverOptions(); measureMountRadius();
      calculateClearance(); setPose(); state.ready = true; state.error = null;
      input = bindDisplayInput({cube: host.physicalCube, camera: host.camera, canvas: host.canvas,
        allowed: () => state.ready && enabled && !suspended,
        onNext: () => {if (performance.now()-lastTouchToggleAt > 500) toggleDeployment();}, getDisplay: () => plate});
      syncUI();
    }).catch(error => {
      if (version !== loadVersion || disposed) return;
      state.error = `Fish asset unavailable: ${error.message || error}`; syncUI();
    });
  }

  function detach() {
    loadVersion++;
    clearTimeout(recalibrationTimer); recalibrationTimer = null;
    clearTimeout(ringRecalibrationTimer); ringRecalibrationTimer = null;
    activeHoverLayout = {count: hoverOptions.count, spacing: hoverOptions.spacing};
    input?.dispose(); input = null;
    touchGesture = null; lastTouchToggleAt = -Infinity;
    aperture?.traverse(node => {node.userData.stickyPlaneGeometry?.dispose();});
    disposeOwned(group); group = carrier = aperture = assembly = facing = plate = fish = head = mouth = tail = hoverCarrier = hover = frame = frameBack = frameInnerWall = null;
    rings = []; ringRest = []; hoverPhase = 0; binding.detach(); host = null; profile = null; framingDistance = 0;
    state.ready = false; state.focused = false; state.error = null; state.mouth = mouthLevel = audioLevel = tailPhase = tailEnvelope = 0;
    roll = rollTarget = 0; lastRaw = null; syncUI();
  }
  function attach(context) {
    if (disposed) return;
    detach(); host = context; binding.attach(context); suspended = false;
    framingDistance = context.camera.position.distanceTo(context.controls.target);
    profile = backingProfile(context, binding.backing);
    group = new THREE.Group(); group.name = 'About fish face'; group.applyMatrix4(mountMatrix());
    context.cube.add(group); createHardware(); setPose(); loadFish(); syncUI();
  }
  function frameLayout({bounds, availableRight}) {
    if (!host || !state.ready || !state.focused || !enabled) return null;
    const camera = host.camera; camera.updateMatrixWorld(); group.updateWorldMatrix(true, false);
    const world = group.localToWorld(new THREE.Vector3(0, 0, peakDepth+.26)).applyMatrix4(camera.matrixWorldInverse);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    // Fit at the host's original framing distance. Using the live dolly depth
    // makes each wheel step change zoom, then the host's near-plane limit moves
    // the camera again, so repeated inward scrolling can bounce the view.
    const orbitDistance = camera.position.distanceTo(host.controls.target);
    const depth = Math.max(camera.near, -world.z + framingDistance-orbitDistance-.85);
    const horizontal = Math.max(.1, (availableRight-32)/bounds.width);
    const vertical = Math.max(.1, (bounds.height-32)/bounds.height);
    return {zoom: Math.min(1, horizontal*depth*tangent*camera.aspect/.86, vertical*depth*tangent/.86)};
  }
  const unregisterArchive = archive.register(FRAME_OWNER, {page: 'about',
    read: () => ({...frameOptions}), validate: validFrameOptions,
    apply: value => {if (!validFrameOptions(value)) throw new TypeError('Invalid Fish frame settings');
      setFrameOptions(value, true);}});
  const unregisterAudioArchive = archive.register(AUDIO_OWNER, {page: 'about',
    read: () => ({audioEnabled, responseGain}),
    validate: value => Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
      typeof value.audioEnabled === 'boolean' && typeof value.responseGain === 'number' &&
      Number.isFinite(value.responseGain) && value.responseGain >= 0 && value.responseGain <= 10 &&
      Object.keys(value).every(key => key === 'audioEnabled' || key === 'responseGain')),
    apply: value => {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          Object.entries(value).some(([key, entry]) => key === 'audioEnabled' ? typeof entry !== 'boolean'
            : key !== 'responseGain' || typeof entry !== 'number' || !Number.isFinite(entry) || entry < 0 || entry > 10))
        throw new TypeError('Invalid Fish sound settings');
      if (typeof value.audioEnabled === 'boolean') audioEnabled = value.audioEnabled;
      if (Number.isFinite(value.responseGain)) responseGain = Math.round(value.responseGain*10)/10;
      save(); syncUI();
    }});
  const unregisterRingArchive = archive.register(RING_OWNER, {page: 'about',
    read: () => ({...hoverOptions}), validate: validHoverSettings,
    apply: value => {
      if (!validHoverSettings(value)) throw new TypeError('Invalid Fish hover ring settings');
      setHoverOptions(value);
    }});
  syncConstructor(); syncUI();
  return {
    id: binding.id, backingName: binding.backingName,
    get backing() {return binding.backing;}, get components() {return [group].filter(Boolean);},
    get travelPart() {return carrier;}, get travelMount() {return FISH_MOUNT;}, get travelAxis() {return [0,0,1];},
    get runtime() {return {state, group, carrier, assembly, facing, plate, aperture, fish, head, mouth, tail, hoverCarrier, hover, rings, frame,
      frameOptions: {...frameOptions}, frameInner, assemblyScale, hoverPhase,
      hoverOptions: {...hoverOptions}, activeHoverLayout: {...activeHoverLayout},
      sourceChildren: [...(binding.backing?.children || [])], mount: FISH_MOUNT,
      setDeployed(value) {deployed = Boolean(value); state.deployed = deployed; save(); syncUI();}};},
    attach, detach, frameLayout,
    setAudioLevel(level) {audioLevel = Number.isFinite(level) ? THREE.MathUtils.clamp(level, 0, 1) : 0; state.level = audioLevel;},
    update(dt) {
      if (!host || suspended || disposed || !enabled) return;
      if (focusPending) {focusPending = false; focusFace(FISH_MOUNT);}
      const step = THREE.MathUtils.clamp(dt || 0, 0, .05);
      state.focused = focusDot() > (state.focused ? .77 : .88);
      updateUpright(step);
      const target = deployed ? 1 : 0;
      const duration = target > progress ? frameOptions.enterSeconds
        : frameOptions.separateExit ? frameOptions.exitSeconds : frameOptions.enterSeconds;
      progress = reduced ? target : THREE.MathUtils.clamp(progress + Math.sign(target-progress)*step/duration, 0, 1);
      if (Math.abs(progress-target) < .001) progress = target;
      setPose();
      if (!reduced && progress > .32) hoverPhase += step*hoverOptions.speed;
      if (rings.length) setRingMotion(reduced ? 0 : hoverPhase);
      const sound = Math.max(0, (audioLevel*responseGain-.008)*11);
      const response = sound/(1+sound);
      const desired = !reduced && audioEnabled ? THREE.MathUtils.clamp(response*(1+.025*responseGain), 0, 1) : 0;
      mouthLevel = reduced ? 0 : THREE.MathUtils.damp(mouthLevel, desired, desired > mouthLevel ? 23 : 12, step);
      if (mouthLevel < .001) mouthLevel = 0;
      const activity = THREE.MathUtils.clamp(desired*2.2, 0, 1);
      tailEnvelope = reduced ? 0 : THREE.MathUtils.damp(tailEnvelope, activity,
        activity > tailEnvelope ? 10 : 5, step);
      if (tailEnvelope < .001) tailEnvelope = 0;
      if (tailEnvelope) tailPhase += step*TAIL_FLAP_SPEED;
      else tailPhase = 0;
      state.mouth = mouthLevel;
      setMouthPose(mouthLevel);
      setAudioBonePose(tailEnvelope, tailEnvelope*Math.sin(tailPhase));
      if (near(progress, 0) || near(progress, 1)) syncUI();
    },
    applySettings(snapshot) {
      enabled = snapshot.about?.about?.enabled !== false;
      upright = snapshot.cube?.uprightFaces !== false;
      reduced = Boolean(snapshot.accessibility?.reducedMotion);
      if (reduced) {
        mouthLevel = tailEnvelope = tailPhase = state.mouth = 0;
        setMouthPose(0); setAudioBonePose(0, 0);
        if (rings.length) setRingMotion(0);
      }
      const c = THREE.MathUtils.clamp(snapshot.start?.contrast ?? .5, 0, 1), e = smooth(c);
      contrastGain = (.08+2.32*e)/1.24; state.contrastGain = contrastGain;
      applyContrast();
      if (group) group.visible = enabled;
      syncUI();
    },
    suspend() {suspended = true; audioLevel = mouthLevel = tailEnvelope = tailPhase = state.level = state.mouth = 0;
      setMouthPose(0); setAudioBonePose(0, 0); setPose(); syncUI();},
    resume() {if (!disposed) {suspended = false; syncUI();}},
    dispose() {if (disposed) return; detach(); disposed = true; events.abort(); unregisterArchive(); unregisterAudioArchive(); unregisterRingArchive(); unregisterConstructor(); unregister();}
  };
}
