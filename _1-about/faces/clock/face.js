import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {getSharedSettings} from '../../../_7-shared-scripts/core/settings.js';
import {createModelFace} from '../model-face.js';
import {gearAngles, orbitMotion, SPEED_FACTORS, TEETH, MAIN_ORBIT_FACTORS, RETURN_FACTORS} from './motion.js';
import {addMagneticInput} from './magnetic-input.js';
import {addSpiralMagneticInput} from './magnetic-v9.js';
import {spiralMotion, validateSpiralManifest, V9_NAMES} from './spiral-motion.js';
import {createClockHands} from './hands.js';
import {createClockControls} from './controls.js';
import {createClockGesture} from './gesture.js';
import {offsetForWinding, handAngles, TAU} from './winding.js';
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
  let spiralPivots = null, spiralManifest = null, handPreview = null, dragBaseMinutes = 0, dragBaseAngle = 0;
  let hands = null, gesture = null, controls = null, clockSettings = getSharedSettings().get().about.clock;
  visualSeconds = Date.now() / 1000 * clockSettings.gearSpeed;
  let previewDelta = 0, animation = null, heldDate = null, shownOffset = clockSettings.timeOffsetSeconds;
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
  function sync() {
    if (!root) return;
    if (v9) {
      const browserDate = new Date(), handDate = new Date(browserDate.getTime() + clockSettings.timeOffsetSeconds * 1000);
      const now = performance.now();
      if (lastVisualAt !== null && !state.paused && !reduced && !suspended && enabled)
        visualSeconds += Math.max(0, (now - lastVisualAt) / 1000) * clockSettings.gearSpeed;
      lastVisualAt = now;
      const motion = spiralMotion(browserDate, spiralManifest, visualSeconds);
      for (const name of V9_NAMES) spiralPivots.get(name).rotation.y = motion.angles[name];
      state.angles = V9_NAMES.map(name => motion.angles[name]);
      state.carrierAngle = motion.ring; state.motorAngle = motion.input;
      hands?.update(handDate, 0, handPreview);
      controls?.show(handDate, clockSettings.timeOffsetSeconds);
      state.updatedAt = handDate.getTime();
      return;
    }
    if (animation) {
      const elapsed = Math.max(0, (performance.now() - animation.start) / 550);
      const t = Math.min(1, elapsed), eased = 1 - (1 - t) ** 3;
      shownOffset = animation.from + (animation.to - animation.from) * eased;
      if (t >= 1) animation = null;
    } else shownOffset = clockSettings.timeOffsetSeconds;
    const date = new Date((heldDate ?? Date.now()) + shownOffset * 1000);
    if (legacy) state.angles = gearAngles(date);
    else {
      const motion = orbitMotion(date);
      state.angles = motion.main; state.returnAngles = motion.returning;
      state.carrierAngle = motion.carrier; state.motorAngle = motion.motor;
      carrier.rotation.y = motion.carrier;
      returnRotors.forEach((rotor, i) => { rotor.rotation.y = motion.returning[i]; });
    }
    rotors.forEach((rotor, i) => { rotor.rotation.y = state.angles[i]; });
    hands?.update(date, clockSettings.markerPhase + previewDelta);
    controls?.show(date, shownOffset);
    state.updatedAt = date.getTime();
  }
  function changeSettings(settings) {
    if (v9) {
      const correction = {};
      const offset = Math.max(-999999960, Math.min(999999960, Math.round(settings.timeOffsetSeconds / 60) * 60));
      if (offset !== settings.timeOffsetSeconds) correction['about.clock.timeOffsetSeconds'] = offset;
      if (settings.markerPhase !== 0) correction['about.clock.markerPhase'] = 0;
      if (settings.minuteLength < settings.hourLength + .06)
        correction['about.clock.minuteLength'] = Number((settings.hourLength + .06).toFixed(3));
      if (Object.keys(correction).length) {getSharedSettings().patch(correction); return;}
    }
    clockSettings = settings;
    appearance?.apply(settings.gearFinishes, contrast);
    controls?.showMotion(state.paused ? 'Paused' : reduced ? 'Reduced motion: gears paused' : `Running at ${settings.gearSpeed}×`);
    hands?.configure(settings);
    if (!animation && !previewDelta) sync();
  }
  function commitWinding(delta) {
    heldDate = null;
    const oldOffset = clockSettings.timeOffsetSeconds;
    const nextOffset = offsetForWinding(oldOffset, delta);
    const nextPhase = ((clockSettings.markerPhase + delta) % TAU + TAU) % TAU;
    previewDelta = 0;
    if (Math.abs(delta) < 1e-7) return;
    animation = reduced ? null : {from: shownOffset, to: nextOffset, start: performance.now()};
    getSharedSettings().patch({'about.clock.timeOffsetSeconds': nextOffset, 'about.clock.markerPhase': nextPhase});
    controls?.announce(`Clock wound ${Math.abs(nextOffset - oldOffset).toFixed(1)} seconds ${nextOffset < oldOffset ? 'backward' : 'forward'}.`);
    if (reduced || state.paused) {animation = null; sync();}
  }
  function commitHand(kind, delta) {
    handPreview = null;
    if (kind === 'second') {sync(); return;}
    const periodMinutes = kind === 'hour' ? 720 : 60;
    const nextMinutes = Math.round(dragBaseMinutes + delta * periodMinutes / TAU);
    getSharedSettings().patch({'about.clock.timeOffsetSeconds': nextMinutes * 60});
    controls?.announce(`Clock set ${nextMinutes >= 0 ? '+' : ''}${nextMinutes} minutes from browser time. Seconds remain synchronized.`);
    sync();
  }
  function windByMinutes(minutes) {
    getSharedSettings().patch({'about.clock.timeOffsetSeconds': clockSettings.timeOffsetSeconds + minutes * 60});
    controls?.announce(`Clock set ${minutes > 0 ? 'forward' : 'back'} ${Math.abs(minutes)} minute${Math.abs(minutes) === 1 ? '' : 's'}. Seconds remain synchronized.`);
    sync();
  }
  function windBySeconds(seconds) {
    const nextOffset = clockSettings.timeOffsetSeconds + seconds;
    animation = reduced || state.paused ? null : {from: shownOffset, to: nextOffset, start: performance.now()};
    getSharedSettings().patch({'about.clock.timeOffsetSeconds': nextOffset});
    controls?.announce(`Clock wound ${Math.abs(seconds)} seconds ${seconds < 0 ? 'backward' : 'forward'}.`);
    if (!animation) sync();
  }
  function resetTime() {
    gesture?.cancel(); previewDelta = 0; animation = null; heldDate = null; handPreview = null;
    getSharedSettings().patch({'about.clock.timeOffsetSeconds': 0, 'about.clock.markerPhase': 0});
    controls?.announce('Clock reset to browser time.');
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
      if (state.paused) animation = null;
      pauseButton.textContent = state.paused ? (v9 ? 'Resume gears' : 'Resume motion') : (v9 ? 'Pause gears' : 'Pause motion');
      pauseButton.setAttribute('aria-pressed', String(state.paused));
      controls?.showMotion(state.paused ? 'Paused' : reduced ? 'Reduced motion: gears paused' : `Running at ${clockSettings.gearSpeed}×`);
      lastVisualAt = performance.now(); sync();
    }, {signal: events.signal});
    toolbar = document.createElement('div'); toolbar.className = 'clock-toolbar'; toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Clock preview'); toolbar.append(launcher, pauseButton);
    (stage || host.canvas.parentElement).append(toolbar);
    controls = createClockControls({onChange: changeSettings, secondsLocked: v9,
      onWind: v9 ? windByMinutes : windBySeconds, onResetTime: resetTime,
      onFocus: () => {if (!suspended && enabled && state.ready) focusFace(CLOCK_MOUNT);}});
    const strength = .08 + 2.32 * contrast * contrast * (3 - 2 * contrast);
    toolbar.style.setProperty('--clock-contrast-strength', String(strength));
    controls.setContrast(strength);
  }
  function detach() {
    generation += 1; request?.abort(); request = null;
    gesture?.dispose(); gesture = null; hands?.dispose(); hands = null;
    appearance?.dispose(); appearance = null;
    if (toolbar) { toolbar.hidden = true; launcher.disabled = true; pauseButton.disabled = true; }
    release(root); root = null; rotors = []; returnRotors = []; carrier = null; magnetic = null; host = null;
    previewDelta = 0; animation = null; heldDate = null; handPreview = null;
    spiralPivots = null; spiralManifest = null;
    lastVisualAt = null;
    state.ready = false; state.angles = []; state.returnAngles = []; state.updatedAt = null;
    binding.detach();
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
        root = loaded; rotors = axes; returnRotors = returning; carrier = moving;
        spiralPivots = pivots; spiralManifest = manifest;
        if (v9) {appearance = createGearAppearance(pivots, V9_NAMES); appearance.apply(clockSettings.gearFinishes, contrast);}
        if (v9) {
          state.teeth = V9_NAMES.map(name => manifest.nodes[name].teeth);
          state.speedFactors = V9_NAMES.map(name => manifest.nodes[name].inputFactor);
          state.ringTargetPeriodSeconds = manifest.ringTargetPeriodSeconds;
        }
        magnetic = v9 ? addSpiralMagneticInput(root, pivots.get('clock-drive'), manifest) : legacy ? null : addMagneticInput(root, returning[0], moving);
        hands = legacy ? null : createClockHands(root, moving, manifest?.handAdapter);
        hands?.configure(clockSettings);
        root.name = legacy ? 'Clock V7 supported mechanism' : v9 ? 'Clock V9 fixed spiral train' : 'Clock V8 orbit mechanism';
        root.visible = enabled; context.cube.add(root); sync(); state.ready = true;
        if (hands) gesture = createClockGesture({host: context, hands,
          kinds: v9 ? ['hour', 'minute', 'second'] : ['second'],
          canInteract: () => !suspended && !disposed && enabled && state.ready && root?.visible && !animation,
          onStart: kind => {
            if (v9) {
              dragBaseMinutes = clockSettings.timeOffsetSeconds / 60;
              if (kind !== 'second') dragBaseAngle = handAngles(new Date(Date.now() + clockSettings.timeOffsetSeconds * 1000))[kind];
            }
            else {heldDate = state.updatedAt - clockSettings.timeOffsetSeconds * 1000; animation = null; sync();}
          },
          onPreview: (kind, delta) => {
            if (v9) {
              if (kind === 'second') handPreview = {kind, angle: delta};
              else handPreview = {kind, angle: dragBaseAngle + delta};
            } else previewDelta = delta;
            sync();
          },
          onCommit: (kind, delta) => v9 ? commitHand(kind, delta) : commitWinding(delta),
          onCancel: () => {heldDate = null; previewDelta = 0; handPreview = null; sync();}});
        launcher.disabled = suspended; pauseButton.disabled = suspended; launcher.textContent = 'Clock face';
        if (new URLSearchParams(location.search).get('face') === 'clock' && !suspended && enabled) focusFace(CLOCK_MOUNT);
      } catch (error) {
        if (generation !== version || disposed || error.name === 'AbortError') return;
        gesture?.dispose(); gesture = null; hands?.dispose(); hands = null; appearance?.dispose(); appearance = null;
        release(loaded); root = null; rotors = []; returnRotors = []; carrier = null; magnetic = null; spiralPivots = null; spiralManifest = null;
        state.error = error.message; launcher.textContent = 'Clock unavailable'; launcher.disabled = true;
        console.warn('[clock] Mechanism could not load; original backing retained.', error);
      } finally { if (request === controller) request = null; }
    })();
  }
  return {
    id: binding.id, backingName: binding.backingName,
    get backing() { return binding.backing; }, get components() { return root ? [root] : []; },
    get runtime() { return {root, rotors, returnRotors, carrier, state,
      hands, spiralManifest, magneticInput: magnetic?.magneticInput ?? null, magneticDriveTarget: magnetic?.magneticDriveTarget ?? null}; },
    get gestureActive() { return Boolean(gesture?.active); },
    endGesture() { gesture?.cancel(); },
    attach, detach,
    update() { if (!suspended && !disposed && enabled && (v9 || (!reduced && !state.paused) || animation)) sync(); },
    applySettings(snapshot) {
      enabled = snapshot.about?.clock?.enabled !== false;
      if (!enabled) gesture?.cancel();
      if (root) root.visible = enabled; if (toolbar) toolbar.hidden = !enabled;
      const next = Boolean(snapshot?.accessibility?.reducedMotion);
      if (next !== reduced) { reduced = next; if (next) animation = null; lastVisualAt = performance.now(); }
      const nextContrast = Number(snapshot?.start?.contrast ?? .5);
      if (nextContrast !== contrast) { contrast = nextContrast; appearance?.apply(clockSettings.gearFinishes, contrast); }
      const strength = .08 + 2.32 * contrast * contrast * (3 - 2 * contrast);
      toolbar?.style.setProperty('--clock-contrast-strength', String(strength));
      controls?.setContrast(strength);
      controls?.showMotion(state.paused ? 'Paused' : reduced ? 'Reduced motion: gears paused' : `Running at ${clockSettings.gearSpeed}×`);
    },
    suspend() { gesture?.cancel(); suspended = true; lastVisualAt = null; if (launcher) { launcher.disabled = true; pauseButton.disabled = true; } },
    resume() { if (disposed) return; suspended = false; lastVisualAt = performance.now(); sync(); if (launcher) { launcher.disabled = !state.ready; pauseButton.disabled = !state.ready; } },
    dispose() { if (disposed) return; detach(); disposed = true; events.abort(); controls?.dispose(); controls = null; toolbar?.remove(); stylesheet?.remove(); binding.dispose(); }
  };
}
