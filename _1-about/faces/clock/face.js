import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';
import {getSharedSettings} from '../../../_7-shared-scripts/core/settings.js';
import {createModelFace} from '../model-face.js';
import {gearAngles, orbitMotion, SPEED_FACTORS, TEETH, MAIN_ORBIT_FACTORS, RETURN_FACTORS} from './motion.js';
import {addMagneticInput} from './magnetic-input.js';
import {addSpiralMagneticInput} from './magnetic-v9.js';
import {spiralMotion, validateSpiralManifest, V9_NAMES} from './spiral-motion.js';
import {createClockHands} from './hands.js';
import {createClockControls} from './controls.js';
import {createGearAppearance} from './gear-appearance.js';

export const CLOCK_MOUNT = Object.freeze({normal: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1]});
const selected = new URLSearchParams(location.search).get('clock');
const legacy = selected === 'v7', v9 = selected !== 'v7' && selected !== 'v8';
const asset = new URL(legacy ? '../../../assets/about-cube/glb/mechanism.glb' : v9 ? '../../../assets/about-cube/glb/spirals-v9.glb' : '../../../assets/about-cube/glb/orbit-v8.glb', import.meta.url);
const manifestAsset = new URL('./spirals-v9.json', import.meta.url);

/** One face-owned asset, its manifest pivots and the host's existing render loop. */
export function createClockFace({stage, focusFace = () => {}} = {}) {
  const binding = createModelFace({id: 'clock', backingName: 'back.clock'});
  let host = null, root = null, rotors = [], returnRotors = [], carrier = null, request = null;
  let magnetic = null;
  let appearance = null, contrast = .5, visualSeconds = null, lastVisualAt = null;
  let spiralPivots = null, spiralManifest = null;
  let upright = true, roll = 0, baseQuaternion = null;
  const inverse = new THREE.Matrix4(), cameraRight = new THREE.Vector3(), faceNormal = new THREE.Vector3(0, -1, 0);
  let hands = null, controls = null, clockSettings = getSharedSettings().get().about.clock;
  visualSeconds = Date.now() / 1000 * clockSettings.gearSpeed;
  let launcher = null, pauseButton = null, toolbar = null, stylesheet = null;
  let suspended = false, disposed = false, reduced = false, enabled = true, generation = 0;
  const events = new AbortController();
  const state = {version: legacy ? 7 : v9 ? 9 : 8, ready: false, error: null, paused: false, angles: [], returnAngles: [], carrierAngle: 0,
    updatedAt: null, teeth: v9 ? [] : TEETH, speedFactors: legacy ? SPEED_FACTORS : v9 ? [] : MAIN_ORBIT_FACTORS,
    returnFactors: legacy || v9 ? [] : RETURN_FACTORS, nativeHourTakeoffResolved: false};

  function release(scene) {
    scene?.removeFromParent();
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene?.traverse(node => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of [node.material].flat().filter(Boolean)) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    textures.forEach(texture => texture.dispose());
    materials.forEach(material => material.dispose());
    geometries.forEach(geometry => geometry.dispose());
  }
  function sync(dt = 0) {
    if (!root) return;
    if (host && baseQuaternion) {
      if (upright) {
        inverse.copy(host.cube.matrixWorld).invert();
        cameraRight.setFromMatrixColumn(host.camera.matrixWorld, 0).transformDirection(inverse);
        if (cameraRight.x * cameraRight.x + cameraRight.z * cameraRight.z > .01) {
          const angle = Math.atan2(cameraRight.z, cameraRight.x);
          const delta = Math.atan2(Math.sin(angle - roll), Math.cos(angle - roll));
          roll += reduced ? delta : THREE.MathUtils.clamp(delta * (1 - Math.exp(-dt * 7)), -dt * 2.6, dt * 2.6);
        }
        root.quaternion.copy(baseQuaternion).premultiply(new THREE.Quaternion().setFromAxisAngle(faceNormal, roll));
      } else { roll = 0; root.quaternion.copy(baseQuaternion); }
    }
    if (v9) {
      const browserDate = new Date();
      const now = performance.now();
      if (lastVisualAt !== null && !state.paused && !reduced && !suspended && enabled)
        visualSeconds += Math.max(0, (now - lastVisualAt) / 1000) * clockSettings.gearSpeed;
      lastVisualAt = now;
      const motion = spiralMotion(browserDate, spiralManifest, visualSeconds);
      for (const name of V9_NAMES) spiralPivots.get(name).rotation.y = motion.angles[name];
      state.angles = V9_NAMES.map(name => motion.angles[name]);
      state.carrierAngle = motion.ring; state.motorAngle = motion.input;
      hands?.update(browserDate, 0);
      hands?.updateSupportLinks();
      controls?.show(browserDate);
      state.updatedAt = browserDate.getTime();
      return;
    }
    const date = new Date();
    if (legacy) state.angles = gearAngles(date);
    else {
      const motion = orbitMotion(date);
      state.angles = motion.main; state.returnAngles = motion.returning;
      state.carrierAngle = motion.carrier; state.motorAngle = motion.motor;
      carrier.rotation.y = motion.carrier;
      returnRotors.forEach((rotor, i) => { rotor.rotation.y = motion.returning[i]; });
    }
    rotors.forEach((rotor, i) => { rotor.rotation.y = state.angles[i]; });
    hands?.update(date, 0);
    hands?.updateSupportLinks();
    controls?.show(date);
    state.updatedAt = date.getTime();
  }
  function changeSettings(settings) {
    if (v9) {
      const correction = {};
      if (settings.minuteLength < settings.hourLength + .06)
        correction['about.clock.minuteLength'] = Number((settings.hourLength + .06).toFixed(3));
      if (Object.keys(correction).length) {getSharedSettings().patch(correction); return;}
    }
    clockSettings = settings;
    appearance?.apply(settings.gearFinishes, contrast);
    controls?.showMotion(state.paused ? 'Paused' : reduced ? 'Reduced motion: gears paused' : `Running at ${settings.gearSpeed}×`);
    hands?.configure(settings);
    sync();
  }
  function initializeUI() {
    if (launcher) return;
    stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('./clock.css', import.meta.url).href; document.head.append(stylesheet);
    launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'clock-launcher';
    launcher.textContent = 'Clock face'; launcher.disabled = true;
    launcher.title = legacy ? 'Show original clock train' : v9 ? 'Show clock · fixed spiral train' : 'Show clock · one-minute orbit';
    launcher.setAttribute('aria-description', v9 ? 'Fixed spiral gear train with browser-synchronized seconds ring.' : legacy ? 'Rear hour gear: one turn in twelve hours. Front minute gear: one turn per hour.' : 'Tilted clock movement. The backing orbits once per minute. Pause motion is available beside this button.');
    launcher.addEventListener('click', () => { if (!suspended && state.ready) focusFace(CLOCK_MOUNT); }, {signal: events.signal});
    pauseButton = document.createElement('button'); pauseButton.type = 'button'; pauseButton.className = 'clock-launcher';
    pauseButton.textContent = v9 ? 'Pause gears' : 'Pause motion'; pauseButton.setAttribute('aria-pressed', 'false'); pauseButton.disabled = true;
    pauseButton.addEventListener('click', () => {
      state.paused = !state.paused;
      pauseButton.textContent = state.paused ? (v9 ? 'Resume gears' : 'Resume motion') : (v9 ? 'Pause gears' : 'Pause motion');
      pauseButton.setAttribute('aria-pressed', String(state.paused));
      controls?.showMotion(state.paused ? 'Paused' : reduced ? 'Reduced motion: gears paused' : `Running at ${clockSettings.gearSpeed}×`);
      lastVisualAt = performance.now(); sync();
    }, {signal: events.signal});
    toolbar = document.createElement('div'); toolbar.className = 'clock-toolbar'; toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Clock preview'); toolbar.append(launcher, pauseButton);
    (stage || host.canvas.parentElement).append(toolbar);
    controls = createClockControls({onChange: changeSettings, secondsLocked: v9,
      onFocus: () => {if (!suspended && enabled && state.ready) focusFace(CLOCK_MOUNT);}});
    const strength = .08 + 2.32 * contrast * contrast * (3 - 2 * contrast);
    toolbar.style.setProperty('--clock-contrast-strength', String(strength));
    controls.setContrast(strength);
  }
  function detach() {
    generation += 1; request?.abort(); request = null;
    hands?.dispose(); hands = null;
    appearance?.dispose(); appearance = null;
    if (toolbar) { toolbar.hidden = true; launcher.disabled = true; pauseButton.disabled = true; }
    release(root); root = null; baseQuaternion = null; roll = 0; rotors = []; returnRotors = []; carrier = null; magnetic = null; host = null;
    spiralPivots = null; spiralManifest = null;
    lastVisualAt = null;
    state.ready = false; state.angles = []; state.returnAngles = []; state.updatedAt = null;
    binding.detach();
  }
  function liveMagnetic(value) {
    if (!value || !root || !host) return value ?? null;
    root.updateWorldMatrix(true, false);
    return {...value, center: host.cube.worldToLocal(root.localToWorld(value.center.clone()))};
  }
  function attach(context) {
    if (disposed) return;
    detach(); binding.attach(context); host = context; suspended = false;
    initializeUI(); toolbar.hidden = false; launcher.textContent = 'Clock loading…';
    state.error = null;
    const version = generation, controller = new AbortController(); request = controller;
    void (async () => {
      let loaded = null;
      try {
        const [response, manifestResponse] = await Promise.all([
          fetch(asset, {signal: controller.signal}),
          v9 ? fetch(manifestAsset, {signal: controller.signal}) : Promise.resolve(null)
        ]);
        if (!response.ok) throw new Error(`Clock asset HTTP ${response.status}`);
        if (v9 && !manifestResponse.ok) throw new Error(`Clock manifest HTTP ${manifestResponse.status}`);
        const bytes = await response.arrayBuffer();
        const manifest = v9 ? await manifestResponse.json() : null;
        if (generation !== version || disposed) return;
        loaded = (await new GLTFLoader().parseAsync(bytes, new URL('./', asset).href)).scene;
        if (generation !== version || disposed) { release(loaded); return; }
        const pivots = v9 ? validateSpiralManifest(manifest, loaded) : null;
        const axes = v9 ? V9_NAMES.filter(name => name !== 'clock-ring').map(name => pivots.get(name)) :
          SPEED_FACTORS.map((_, i) => loaded.getObjectByName(legacy ? `clock-axle-${i}` : `clock-main-${i}`));
        if (axes.some(node => !node)) throw new Error('Clock asset is missing a gear pivot');
        const returning = legacy || v9 ? [] : RETURN_FACTORS.map((_, i) => loaded.getObjectByName(`clock-return-${i}`));
        const moving = v9 ? pivots.get('clock-ring') : legacy ? null : loaded.getObjectByName('clock-carrier');
        if (!legacy && (!moving || returning.some(node => !node))) throw new Error('Clock asset is missing its ring or return train');
        root = loaded; baseQuaternion = root.quaternion.clone(); rotors = axes; returnRotors = returning; carrier = moving;
        spiralPivots = pivots; spiralManifest = manifest;
        if (v9) {appearance = createGearAppearance(pivots, V9_NAMES); appearance.apply(clockSettings.gearFinishes, contrast);}
        if (v9) {
          state.teeth = V9_NAMES.map(name => manifest.nodes[name].teeth);
          state.speedFactors = V9_NAMES.map(name => manifest.nodes[name].inputFactor);
          state.ringTargetPeriodSeconds = manifest.ringTargetPeriodSeconds;
        }
        magnetic = v9 ? addSpiralMagneticInput(root, pivots.get('clock-drive'), manifest) : legacy ? null : addMagneticInput(root, returning[0], moving);
        hands = legacy ? null : createClockHands(root, moving, manifest?.handAdapter, manifest, context.cube, context.camera);
        hands?.configure(clockSettings);
        root.name = legacy ? 'Clock V7 supported mechanism' : v9 ? 'Clock V9 fixed spiral train' : 'Clock V8 orbit mechanism';
        root.visible = enabled; context.cube.add(root); hands?.setVisible(enabled); sync(); state.ready = true;
        launcher.disabled = suspended; pauseButton.disabled = suspended; launcher.textContent = 'Clock face';
        if (new URLSearchParams(location.search).get('face') === 'clock' && !suspended && enabled) focusFace(CLOCK_MOUNT);
      } catch (error) {
        if (generation !== version || disposed || error.name === 'AbortError') return;
        hands?.dispose(); hands = null; appearance?.dispose(); appearance = null;
        release(loaded); root = null; rotors = []; returnRotors = []; carrier = null; magnetic = null; spiralPivots = null; spiralManifest = null;
        state.error = error.message; launcher.textContent = 'Clock unavailable'; launcher.disabled = true;
        console.warn('[clock] Mechanism could not load; original backing retained.', error);
      } finally { if (request === controller) request = null; }
    })();
  }
  return {
    id: binding.id, backingName: binding.backingName,
    get backing() { return binding.backing; }, get components() { return root ? [root, ...(hands?.components || [])] : []; },
    get travelPart() { return root; }, get travelMount() { return CLOCK_MOUNT; },
    get travelSupportDepth() { return .962; },
    get runtime() { return {root, rotors, returnRotors, carrier, state,
      hands, spiralManifest, magneticInput: liveMagnetic(magnetic?.magneticInput),
      magneticDriveTarget: liveMagnetic(magnetic?.magneticDriveTarget)}; },
    get gestureActive() { return false; },
    endGesture() {},
    attach, detach,
    update(dt) { if (!suspended && !disposed && enabled) sync(dt); },
    applySettings(snapshot) {
      enabled = snapshot.about?.clock?.enabled !== false;
      if (root) root.visible = enabled; if (toolbar) toolbar.hidden = !enabled;
      hands?.setVisible(enabled);
      const next = Boolean(snapshot?.accessibility?.reducedMotion);
      if (next !== reduced) { reduced = next; lastVisualAt = performance.now(); }
      upright = snapshot.cube?.uprightFaces !== false;
      const nextContrast = Number(snapshot?.start?.contrast ?? .5);
      if (nextContrast !== contrast) { contrast = nextContrast; appearance?.apply(clockSettings.gearFinishes, contrast); }
      const strength = .08 + 2.32 * contrast * contrast * (3 - 2 * contrast);
      toolbar?.style.setProperty('--clock-contrast-strength', String(strength));
      controls?.setContrast(strength);
      controls?.showMotion(state.paused ? 'Paused' : reduced ? 'Reduced motion: gears paused' : `Running at ${clockSettings.gearSpeed}×`);
    },
    suspend() { suspended = true; lastVisualAt = null; if (launcher) { launcher.disabled = true; pauseButton.disabled = true; } },
    resume() { if (disposed) return; suspended = false; lastVisualAt = performance.now(); sync(); if (launcher) { launcher.disabled = !state.ready; pauseButton.disabled = !state.ready; } },
    dispose() { if (disposed) return; detach(); disposed = true; events.abort(); controls?.dispose(); controls = null; toolbar?.remove(); stylesheet?.remove(); binding.dispose(); }
  };
}
