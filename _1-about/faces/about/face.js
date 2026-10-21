import * as THREE from 'three';
import {createModelFace} from '../model-face.js';
import {initPanelShell} from '../../../debug/panel-shell.js';
import {createPreferences} from '../../../_7-shared-scripts/core/preferences.js';
import {getSettingsArchive} from '../../../_7-shared-scripts/panel-assembly/SettingsArchive.mjs';
import {createSiliconeBands} from './silicone-bands.js';
import {ART_SAMPLES, LEGACY_SAMPLES, paintSample, paintRear} from './sample-art.js';
import {DEFAULT_GEOMETRY, THICKNESS, CLEARANCE_MARGIN, normalizeGeometry, ringBounds} from './band-shape.mjs';
import {bindDisplayInput} from './display-input.js';
import {createPictureLibrary, normalizeCaption, prepareImage} from './picture-library.mjs';
import {EASING_GROUPS, EASING_IDS, EASING_LABELS, DEFAULT_EASING_POOL, easeAt} from './easing.mjs';

export const ABOUT_MOUNT = Object.freeze({normal: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0], center: [1.015, 0, 0]});
const SAMPLE_KEY = 'site.about.display.sample.v2';
const MOTION_KEY = 'site.about.display.motion.v1';
const TAU = Math.PI * 2;
const RECESSED = -.09;
const MAX_ORBIT_STEP = .12;
const BLUR_SHUTTER = .012;
const DEFAULT_MOTION = Object.freeze({mode: 'sets', setSize: 6, setMin: 3, setMax: 9,
  setSizing: 'fixed', setOrder: 'outside-in', duration: 2.8, stagger: 1.2,
  easing: 'inOutSine', easePool: [...DEFAULT_EASING_POOL], orbitMin: 360, orbitMax: 480,
  blurAmount: .6,
  ...DEFAULT_GEOMETRY});
const CHOICES = Object.freeze({mode: ['together', 'outside-in', 'inside-out', 'random', 'sets'],
  setSizing: ['fixed', 'range'], setOrder: ['outside-in', 'inside-out', 'alternating', 'random'],
  easing: [...EASING_IDS, 'random']});
const RANGES = Object.freeze({setSize: [1, 60], setMin: [1, 60], setMax: [1, 60],
  duration: [.8, 8], stagger: [0, 2], orbitMin: [360, 480], orbitMax: [360, 480],
  blurAmount: [0, 1]});
function makeCanvas(size) { const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; return canvas; }
function normalizeMotion(value = {}) {
  const result = {...DEFAULT_MOTION};
  for (const [key, allowed] of Object.entries(CHOICES)) if (allowed.includes(value[key])) result[key] = value[key];
  if (value.easing === 'sine') result.easing = 'inOutSine';
  if (value.easing === 'cubic') result.easing = 'inOutCubic';
  if (Array.isArray(value.easePool)) result.easePool = [...new Set(value.easePool.filter(id => EASING_IDS.includes(id)))];
  for (const [key, [low, high]] of Object.entries(RANGES)) {
    const candidate = Number(value[key]);
    if (Number.isFinite(candidate)) result[key] = Math.min(high, Math.max(low, candidate));
  }
  for (const key of ['setSize', 'setMin', 'setMax']) result[key] = Math.round(result[key]);
  result.setMax = Math.max(result.setMin, result.setMax);
  result.orbitMax = Math.max(result.orbitMin, result.orbitMax);
  const geometry = normalizeGeometry(value);
  for (const key of ['count', 'outerDiameter', 'innerDiameter', 'gap']) result[key] = geometry[key];
  return result;
}
function shuffle(order) {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
function plannedOrder(motion, shape) {
  const outside = Array.from({length: shape.count}, (_, i) => shape.count - 1 - i);
  if (motion.mode === 'inside-out') return outside.reverse();
  if (motion.mode === 'random') return shuffle(outside);
  if (motion.mode !== 'sets') return outside;
  if (motion.setOrder === 'inside-out') return outside.reverse();
  if (motion.setOrder === 'random') return shuffle(outside);
  if (motion.setOrder === 'alternating') {
    const order = [];
    for (let i = 0; i < shape.count; i++) order.push(i % 2 ? Math.floor(i / 2) : shape.count - 1 - Math.floor(i / 2));
    return order;
  }
  return outside;
}
function makePlan(motion, shape) {
  const chooseCurve = () => motion.easing === 'random'
    ? motion.easePool[Math.floor(Math.random() * motion.easePool.length)] || 'linear' : motion.easing;
  const order = plannedOrder(motion, shape), starts = Array(shape.count).fill(0), groups = [];
  if (motion.mode !== 'sets') order.forEach((ring, rank) => { starts[ring] = motion.mode === 'together' ? 0 : rank * motion.stagger; });
  else {
    let cursor = 0, group = 0;
    while (cursor < shape.count) {
      const remaining = shape.count - cursor;
      const candidates = [];
      for (let size = motion.setMin; size <= Math.min(motion.setMax, remaining); size++) {
        const rest = remaining - size;
        if (rest === 0 || Math.ceil(rest / motion.setMax) <= Math.floor(rest / motion.setMin))
          candidates.push(size);
      }
      const size = motion.setSizing === 'fixed' ? Math.min(motion.setSize, remaining)
        : candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : Math.min(motion.setMax, remaining);
      const members = order.slice(cursor, cursor + size);
      members.forEach(ring => { starts[ring] = group * motion.stagger; });
      groups.push(members); cursor += size; group++;
    }
  }
  const lastStart = Math.max(...starts);
  const innerMid = ringBounds(shape, 0).midRadius, outerMid = ringBounds(shape, shape.count - 1).midRadius;
  const endpoints = Array.from({length: shape.count}, (_, index) => {
    const {midRadius} = ringBounds(shape, index);
    const fraction = shape.count === 1 ? 0 : (1 / midRadius - 1 / outerMid) / (1 / innerMid - 1 / outerMid);
    const degrees = motion.orbitMin + fraction * (motion.orbitMax - motion.orbitMin);
    return {orbitDegrees: degrees * (Math.floor(index / 2) % 2 === 0 ? 1 : -1),
      hingeOffset: ((index * 7) % 11 - 5) * .02, midRadius};
  });
  const curves = Array.from({length: shape.count}, chooseCurve), centerCurve = chooseCurve();
  return {order, starts, groups, duration: motion.duration, end: lastStart + motion.duration,
    endpoints, curves, centerCurve, easing: motion.easing, axis: [1, 0, 0]};
}

/** A centered, fixed-size assembly borrowed from the cube host. */
export function createAboutFace({focusFace = () => {}} = {}) {
  const binding = createModelFace({id: 'about', backingName: 'back.about'}), prefs = createPreferences();
  const library = createPictureLibrary();
  const events = new AbortController(), archive = getSettingsArchive();
  const savedRaw = prefs.getItem(SAMPLE_KEY);
  const legacySaved = LEGACY_SAMPLES[savedRaw];
  const saved = library.has(savedRaw) ? savedRaw : library.has(legacySaved) ? legacySaved : library.list()[0].id;
  let savedMotion; try { savedMotion = JSON.parse(prefs.getItem(MOTION_KEY) || '{}'); } catch { savedMotion = {}; }
  let motion = normalizeMotion(savedMotion);
  let shape = normalizeGeometry(motion);
  const frontCanvases = [makeCanvas(2048), makeCanvas(2048)], rearCanvas = makeCanvas(1024);
  paintRear(rearCanvas);
  let activeSnapshot = library.snapshot(saved), stagedSnapshot = null;
  const state = {bands: shape.count, sample: saved, sampleRevision: activeSnapshot.revision,
    target: saved, targetRevision: activeSnapshot.revision, phase: 'idle', angle: 0,
    deployment: RECESSED, maxDeployment: 0, backingBarrier: null, committed: true, photoReady: false,
    photoError: null, focused: false, elapsed: 0, plan: null, commits: [], waiting: false, posesFlat: true};
  const section = document.createElement('section');
  section.innerHTML = `<h3>Ring geometry</h3>
    <button type="button" data-about-focus>Show About face</button>
    <p>Rings orbit 360–480° around the face while each flips 180° toward its next artwork side. Every ring follows a planned endpoint.</p>
    <label>Ring count <input data-motion="count" type="number" min="1" max="60" step="1"></label>
    <label>Outer diameter (cube units) <input data-motion="outerDiameter" type="number" min=".6" max="1.7" step=".01"></label>
    <label>Inner circle diameter (cube units) <input data-motion="innerDiameter" type="number" min=".08" max="1.3" step=".01"></label>
    <label>Gap between rings (cube units) <input data-motion="gap" type="number" min="0" max=".03" step=".001"></label>
    <p>Larger diameters need more outward room to flip clear of the backing.</p>
    <h3>Ring motion</h3>
    <label>Sequence <select data-motion="mode"><option value="together">All at once</option><option value="outside-in">Outside in</option><option value="inside-out">Inside out</option><option value="random">Random ring order</option><option value="sets">Sets</option></select></label>
    <label>Set sizing <select data-motion="setSizing"><option value="fixed">Fixed size</option><option value="range">Random range</option></select></label>
    <label>Rings per set <input data-motion="setSize" type="number" min="1" max="60" step="1"></label>
    <label>Minimum set <input data-motion="setMin" type="number" min="1" max="60" step="1"></label>
    <label>Maximum set <input data-motion="setMax" type="number" min="1" max="60" step="1"></label>
    <label>Set order <select data-motion="setOrder"><option value="outside-in">Outside in</option><option value="inside-out">Inside out</option><option value="alternating">Alternating edges</option><option value="random">Random ring order</option></select></label>
    <label>Ring duration (seconds) <input data-motion="duration" type="number" min=".8" max="8" step=".1"></label>
    <label>Start stagger (seconds) <input data-motion="stagger" type="number" min="0" max="2" step=".05"></label>
    <label>Motion blur <input data-motion="blurAmount" type="range" min="0" max="1" step=".05">
      <output data-blur-value></output></label>
    <div data-about-easing class="about-easing"><span>Easing</span>
      <button type="button" data-easing-toggle aria-expanded="false" aria-controls="about-easing-options"></button>
      <div id="about-easing-options" data-easing-options class="about-easing-options" role="group" aria-label="Easing choices" hidden></div>
      <small data-easing-note></small></div>
    <label>Minimum orbit (degrees) <input data-motion="orbitMin" type="number" min="360" max="480" step="1"></label>
    <label>Maximum orbit (degrees) <input data-motion="orbitMax" type="number" min="360" max="480" step="1"></label>
    <h3>Pictures</h3><p>Click or tap the rings to show the next picture. Edit a whole picture and its caption here.</p>
    <label>Picture <select data-about-sample></select></label>
    <div class="about-picture-actions"><button type="button" data-about-next>Next picture</button>
      <button type="button" data-picture-add>Add picture / ring set</button></div>
    <label>Name <input data-picture-name type="text" maxlength="80"></label>
    <label>Caption, up to three lines <textarea data-picture-caption rows="3" maxlength="302"></textarea></label>
    <label>Import or replace image <input data-picture-file type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif"></label>
    <canvas data-picture-preview width="360" height="360" role="img" aria-label="Selected picture preview"></canvas>
    <div class="about-picture-actions"><button type="button" data-picture-save>Save and show</button>
      <button type="button" data-picture-up>Move up</button><button type="button" data-picture-down>Move down</button>
      <button type="button" data-picture-remove>Remove picture</button></div>
    <p data-picture-message role="status" aria-live="polite"></p>
    <p>Imported images are saved in this browser. A settings archive carries the picture list and captions; reimport an image on another device.</p>
    <p data-about-status role="status" aria-live="polite"></p>`;
  const select = section.querySelector('[data-about-sample]'), focusButton = section.querySelector('[data-about-focus]');
  const nextButton = section.querySelector('[data-about-next]');
  const pictureName = section.querySelector('[data-picture-name]'), pictureCaption = section.querySelector('[data-picture-caption]');
  const pictureFile = section.querySelector('[data-picture-file]'), picturePreview = section.querySelector('[data-picture-preview]');
  const pictureMessage = section.querySelector('[data-picture-message]');
  const easingRoot = section.querySelector('[data-about-easing]');
  const easingToggle = section.querySelector('[data-easing-toggle]');
  const easingOptions = section.querySelector('[data-easing-options]');
  const easingNote = section.querySelector('[data-easing-note]');
  const css = document.createElement('link'); css.rel = 'stylesheet';
  css.href = new URL('./picture-editor.css', import.meta.url).href; document.head.append(css);
  const shell = initPanelShell(), unregister = shell.registerContext('about', 'About', section);
  const ORDER_MIGRATION = 'site.about.pictures-bottom.v1';
  if (!localStorage.getItem(ORDER_MIGRATION)) {
    const pictureFold = [...section.querySelectorAll('.settings-fold')]
      .find(fold => fold.querySelector(':scope > h3 > button')?.textContent === 'Pictures');
    if (pictureFold) {
      section.append(pictureFold);
      const orderKey = `about:about:${section.id}:root`;
      try {
        const orders = JSON.parse(localStorage.getItem('site.settings.section-order.v1') || '{}');
        orders[orderKey] = [...section.children].filter(node => node.dataset.sectionKey)
          .map(node => node.dataset.sectionKey);
        localStorage.setItem('site.settings.section-order.v1', JSON.stringify(orders));
        localStorage.setItem(ORDER_MIGRATION, '1');
      } catch { /* The current DOM still places Pictures last. */ }
    }
  }
  const randomRow = document.createElement('div'); randomRow.className = 'about-easing-row';
  const randomChoice = document.createElement('button'); randomChoice.type = 'button';
  randomChoice.dataset.easingChoice = 'random'; randomChoice.textContent = 'Random per ring';
  randomRow.append(randomChoice); easingOptions.append(randomRow);
  for (const group of EASING_GROUPS) {
    const holder = document.createElement('div'); holder.className = 'about-easing-group';
    const heading = document.createElement('strong'); heading.textContent = group.name; holder.append(heading);
    for (const [id, label] of group.curves) {
      const row = document.createElement('div'); row.className = 'about-easing-row';
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.easingChoice = id; button.textContent = label;
      const checkLabel = document.createElement('label');
      const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.easingPool = id;
      check.setAttribute('aria-label', `Include ${label} in Random easing`);
      checkLabel.append(check, document.createTextNode('Random pool'));
      row.append(button, checkLabel); holder.append(row);
    }
    easingOptions.append(holder);
  }
  let previewImage = null, draftBlob = null, previewVersion = 0, editorId = saved, savingPicture = false;
  const releasePreview = () => {previewImage?.close?.(); previewImage = null;};
  const pictureError = message => {pictureMessage.textContent = message;};
  function refreshPictureList(id = editorId) {
    select.replaceChildren(...library.list().map(entry => {
      const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name; return option;
    }));
    if (library.has(id)) select.value = id;
  }
  function renderPreview() {
    const entry = library.get(editorId);
    if (!entry) return;
    let lines = entry.lines;
    try {lines = normalizeCaption(pictureCaption.value);} catch { /* Keep the last valid preview. */ }
    paintSample(picturePreview, {...entry, lines}, previewImage);
  }
  async function editPicture(id) {
    const entry = library.get(id); if (!entry) return;
    editorId = id; const version = ++previewVersion;
    draftBlob = null; releasePreview(); pictureFile.value = '';
    pictureName.value = entry.name; pictureCaption.value = entry.lines.join('\n');
    section.querySelector('[data-picture-remove]').disabled = library.list().length <= 1;
    refreshPictureList(id); renderPreview(); pictureError('');
    try {
      const image = await library.imageFor(entry);
      if (version !== previewVersion || disposed) return;
      previewImage = image; renderPreview();
    } catch (error) {if (version === previewVersion) pictureError(error.message);}
  }
  function syncEasing() {
    easingToggle.textContent = motion.easing === 'random' ? 'Random per ring'
      : EASING_LABELS[motion.easing] || 'Linear';
    easingOptions.querySelectorAll('[data-easing-choice]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.easingChoice === motion.easing));
    });
    easingOptions.querySelectorAll('[data-easing-pool]').forEach(input => {
      input.checked = motion.easePool.includes(input.dataset.easingPool);
    });
    easingNote.textContent = motion.easing === 'random' && !motion.easePool.length
      ? 'Random pool is empty; turns use Linear until a curve is checked.'
      : motion.easing === 'random' ? `${motion.easePool.length} curves in the random pool.` : '';
  }
  function closeEasing() {easingOptions.hidden = true; easingToggle.setAttribute('aria-expanded', 'false');}
  function saveMotion(next) {
    motion = normalizeMotion(next);
    prefs.setItem(MOTION_KEY, JSON.stringify(motion)); archive.capture('about.glass'); syncControls(); rebuildGeometry();
  }
  easingToggle.addEventListener('click', () => {
    easingOptions.hidden = !easingOptions.hidden;
    easingToggle.setAttribute('aria-expanded', String(!easingOptions.hidden));
  }, {signal: events.signal});
  easingOptions.addEventListener('click', event => {
    const choice = event.target.closest('[data-easing-choice]'); if (!choice) return;
    saveMotion({...motion, easing: choice.dataset.easingChoice}); closeEasing(); easingToggle.focus();
  }, {signal: events.signal});
  easingOptions.addEventListener('change', event => {
    const input = event.target.closest('[data-easing-pool]'); if (!input) return;
    const pool = new Set(motion.easePool);
    if (input.checked) pool.add(input.dataset.easingPool); else pool.delete(input.dataset.easingPool);
    saveMotion({...motion, easePool: [...pool]});
  }, {signal: events.signal});
  easingRoot.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !easingOptions.hidden) {
      event.preventDefault(); closeEasing(); easingToggle.focus();
    }
  }, {signal: events.signal});
  document.addEventListener('pointerdown', event => {
    if (!easingRoot.contains(event.target)) closeEasing();
  }, {signal: events.signal});
  easingRoot.addEventListener('focusout', event => {
    if (event.relatedTarget && easingRoot.contains(event.relatedTarget)) return;
    setTimeout(() => {
      if (!disposed && !easingRoot.contains(document.activeElement)) closeEasing();
    }, 0);
  }, {signal: events.signal});
  pictureCaption.addEventListener('input', renderPreview, {signal: events.signal});
  pictureFile.addEventListener('change', async () => {
    const file = pictureFile.files?.[0], version = ++previewVersion;
    if (!file) return;
    try {
      const blob = await prepareImage(file), bitmap = await createImageBitmap(blob);
      if (version !== previewVersion || disposed) {bitmap.close(); return;}
      releasePreview(); previewImage = bitmap; draftBlob = blob; renderPreview();
      pictureError('Image ready to save.');
    } catch (error) {if (version === previewVersion) {draftBlob = null; pictureError(error.message);}}
  }, {signal: events.signal});
  section.addEventListener('click', async event => {
    const action = event.target.closest('[data-picture-add],[data-picture-save],[data-picture-remove],[data-picture-up],[data-picture-down]');
    if (!action || savingPicture) return;
    try {
      if (action.hasAttribute('data-picture-add')) {
        const entry = library.add(); archive.capture('about.glass');
        await editPicture(entry.id); chooseSample(entry.id); return;
      }
      if (action.hasAttribute('data-picture-save')) {
        const name = pictureName.value.trim();
        if (!name || name.length > 80) throw new Error('Give this picture a name within 80 characters.');
        const lines = normalizeCaption(pictureCaption.value);
        const id = editorId, pendingBlob = draftBlob, previousAsset = library.get(id)?.asset;
        const draftVersion = previewVersion;
        savingPicture = true; action.disabled = true;
        try {
          const asset = pendingBlob ? await library.saveImage(pendingBlob) : previousAsset;
          const entry = library.update(id, {name, lines, asset});
          if (editorId === id && previewVersion === draftVersion) {
            draftBlob = null; refreshPictureList(entry.id); pictureError('Saved. Showing this picture.');
            chooseSample(entry.id);
          }
          archive.capture('about.glass');
        } finally {savingPicture = false; action.disabled = false;}
        return;
      }
      if (action.hasAttribute('data-picture-remove')) {
        const old = editorId, entries = library.list(), index = entries.findIndex(item => item.id === old);
        library.remove(old); const next = library.list()[Math.min(index, library.list().length - 1)];
        archive.capture('about.glass'); await editPicture(next.id); chooseSample(next.id); return;
      }
      const offset = action.hasAttribute('data-picture-up') ? -1 : 1;
      if (library.move(editorId, offset)) {refreshPictureList(editorId); archive.capture('about.glass');}
    } catch (error) {pictureError(error.message);}
  }, {signal: events.signal});
  let host = null, bands = null, input = null, generation = 0;
  let activeSlot = 0, stagedSlot = 1, stagingVersion = 0, staged = false, queued = null;
  let enabled = true, reduced = false, suspended = false, disposed = false, rotating = false;
  let wantsFocus = new URLSearchParams(location.search).get('face') === 'about';
  const tempNormal = new THREE.Vector3(), tempCenter = new THREE.Vector3(), tempCamera = new THREE.Vector3();
  const hinge = new THREE.Vector3(1, 0, 0), orbitAxis = new THREE.Vector3(0, 0, 1);
  const orbitQuaternion = new THREE.Quaternion(), flipQuaternion = new THREE.Quaternion();
  const clearanceNodes = /cubemain|inner_lip|Concealed_Stationary_Bearing_Stator/i;

  function measureBackingBarrier(context) {
    // An all-vertex Z envelope is conservative even where a source triangle
    // crosses the display disc between vertices. It includes corrected GLB
    // backing, chassis and lip, without altering borrowed source meshes.
    context.cube.updateWorldMatrix(true, true);
    const faceWorld = context.cube.matrixWorld.clone().multiply(mountMatrix());
    const inverse = faceWorld.invert();
    const point = new THREE.Vector3();
    let barrier = -Infinity;
    const sources = [];
    context.gltf.scene.traverse(node => {
      if (node === binding.backing || clearanceNodes.test(node.name)) sources.push(node);
    });
    for (const source of sources) source.traverse(node => {
      if (!node.isMesh) return;
      const position = node.geometry?.getAttribute('position');
      if (!position) return;
      const matrix = inverse.clone().multiply(node.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(matrix);
        barrier = Math.max(barrier, point.z);
      }
    });
    if (!Number.isFinite(barrier)) throw new Error('About backing clearance could not be measured');
    return barrier;
  }

  function refreshClearance() {
    state.maxDeployment = state.backingBarrier + shape.outerRadius + THICKNESS / 2 + CLEARANCE_MARGIN;
  }

  function clearMotionBlur() {
    if (bands) for (const piece of [...bands.rings, bands.center]) bands.setMotionBlur(piece);
  }

  function rebuildGeometry() {
    if (!host || state.phase !== 'idle' || staged) return;
    const next = normalizeGeometry(motion);
    if (['count', 'outerDiameter', 'innerDiameter', 'gap'].every(key => shape[key] === next[key])) return;
    const old = bands;
    shape = next; state.bands = shape.count; refreshClearance();
    bands = createSiliconeBands(frontCanvases, rearCanvas, shape);
    bands.group.applyMatrix4(mountMatrix()); host.cube.add(bands.group);
    bands.rotor.position.z = state.deployment;
    bands.setFront(activeSlot);
    old?.dispose();
  }

  function syncControls() {
    section.querySelectorAll('[data-motion]').forEach(element => { element.value = String(motion[element.dataset.motion]); });
    section.querySelector('[data-blur-value]').textContent = `${Math.round(motion.blurAmount * 100)}%`;
    const sets = motion.mode === 'sets', range = motion.setSizing === 'range';
    for (const key of ['setSizing', 'setOrder']) section.querySelector(`[data-motion="${key}"]`).disabled = !sets;
    section.querySelector('[data-motion="setSize"]').disabled = !sets || range;
    for (const key of ['setMin', 'setMax']) section.querySelector(`[data-motion="${key}"]`).disabled = !sets || !range;
    syncEasing();
  }
  function sync() {
    if (bands) bands.group.visible = enabled && state.photoReady;
    const blocked = !host || !enabled || suspended || !state.photoReady;
    focusButton.disabled = nextButton.disabled = select.disabled = blocked;
    section.querySelector('[data-about-status]').textContent = state.phase === 'idle'
      ? library.get(state.sample)?.name || state.sample : state.waiting ? 'Waiting for a clear view to finish picture change'
        : `Turning to ${library.get(state.target)?.name || state.target}`;
  }
  function paintSlot(slot, snapshot, photo) {
    paintSample(frontCanvases[slot], snapshot, photo);
    if (bands) bands.frontTextures[slot].needsUpdate = true;
  }
  function mountMatrix() {
    return new THREE.Matrix4().makeBasis(new THREE.Vector3(...ABOUT_MOUNT.right),
      new THREE.Vector3(...ABOUT_MOUNT.up), new THREE.Vector3(...ABOUT_MOUNT.normal)).setPosition(...ABOUT_MOUNT.center);
  }
  function sideDot(piece, sideIndex) {
    if (!host || !bands) return 1;
    host.camera.updateMatrixWorld(); piece.pivot.updateWorldMatrix(true, false);
    tempNormal.set(0, 0, sideIndex === 0 ? 1 : -1)
      .applyQuaternion(piece.pivot.getWorldQuaternion(new THREE.Quaternion()));
    piece.pivot.getWorldPosition(tempCenter);
    host.camera.getWorldPosition(tempCamera).sub(tempCenter).normalize();
    return tempNormal.dot(tempCamera);
  }
  function focusDot() {
    if (!host || !bands) return -1;
    host.camera.updateMatrixWorld(); bands.group.updateWorldMatrix(true, false);
    tempNormal.set(0, 0, 1).applyQuaternion(bands.group.getWorldQuaternion(new THREE.Quaternion()));
    bands.group.getWorldPosition(tempCenter);
    host.camera.getWorldPosition(tempCamera).sub(tempCenter).normalize();
    return tempNormal.dot(tempCamera);
  }
  function updateFocus(dt) {
    const dot = focusDot();
    state.focused = state.focused ? dot > .77 : dot > .88;
    // A tilted ring must remain outside the complete backing envelope. An
    // unfinished map swap can wait at its flat endpoint and retract safely.
    const tiltedTurn = state.phase === 'turn' && !state.posesFlat;
    const target = state.focused || tiltedTurn ? state.maxDeployment : RECESSED;
    const delta = reduced ? 1 : Math.min(1, Math.max(0, dt) * 2.5);
    state.deployment += (target - state.deployment) * delta;
    if (Math.abs(target - state.deployment) < .0005) state.deployment = target;
    if (bands) bands.rotor.position.z = state.deployment;
  }
  function frameLayout({bounds, availableRight}) {
    if (!host || !bands || !enabled || !state.focused) return null;
    const camera = host.camera;
    camera.updateMatrixWorld();
    bands.group.updateWorldMatrix(true, false);
    const center = bands.group.localToWorld(new THREE.Vector3(0, 0, state.maxDeployment))
      .applyMatrix4(camera.matrixWorldInverse);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontalLimit = Math.max(.1, (availableRight - 32) / bounds.width);
    const verticalLimit = Math.max(.1, (bounds.height - 32) / bounds.height);
    let maxX = 0, maxY = 0;
    // Enclose every possible rigid-ring orientation in a radius-R sphere.
    // This proposal changes only camera zoom in the host, never ring scale.
    for (let latitude = 0; latitude <= 8; latitude++) {
      const polar = latitude / 8 * Math.PI;
      for (let longitude = 0; longitude < 24; longitude++) {
        const azimuth = longitude / 24 * TAU;
        const x = center.x + shape.outerRadius * Math.sin(polar) * Math.cos(azimuth);
        const y = center.y + shape.outerRadius * Math.sin(polar) * Math.sin(azimuth);
        const depth = -center.z - shape.outerRadius * Math.cos(polar);
        if (depth <= camera.near) continue;
        maxX = Math.max(maxX, Math.abs(x / (depth * tangent * camera.aspect)));
        maxY = Math.max(maxY, Math.abs(y / (depth * tangent)));
      }
    }
    return {zoom: Math.min(1, horizontalLimit / Math.max(.001, maxX), verticalLimit / Math.max(.001, maxY))};
  }
  function commitPiece(piece, index) {
    if (!staged || piece.committed) return;
    const targetSide = 1 - piece.parity, oldSide = piece.parity;
    if (!piece.targetReady && sideDot(piece, targetSide) < -.35) {
      const dot = sideDot(piece, targetSide);
      bands.setSide(piece, targetSide, 'art', stagedSlot, piece.endpointQ);
      piece.targetReady = true;
      state.commits.push({index, side: targetSide, kind: 'art', elapsed: state.elapsed, dot});
    }
    if (!piece.oldCleared && sideDot(piece, oldSide) < -.35) {
      const dot = sideDot(piece, oldSide);
      bands.setSide(piece, oldSide, 'abstract');
      piece.oldCleared = true;
      state.commits.push({index, side: oldSide, kind: 'abstract', elapsed: state.elapsed, dot});
    }
    piece.committed = piece.targetReady && piece.oldCleared;
  }
  function finishTurn() {
    clearMotionBlur();
    for (const piece of [...bands.rings, bands.center]) piece.parity = 1 - piece.parity;
    activeSlot = stagedSlot; stagedSlot = 1 - activeSlot; staged = false;
    activeSnapshot = stagedSnapshot; stagedSnapshot = null;
    state.sample = activeSnapshot.id; state.sampleRevision = activeSnapshot.revision;
    state.committed = true;
    state.phase = 'idle'; state.angle = 0; state.elapsed = 0; state.waiting = false; state.posesFlat = true;
    prefs.setItem(SAMPLE_KEY, state.sample); archive.capture('about.glass'); rebuildGeometry(); sync();
    if (queued && (queued.id !== state.sample || queued.revision !== state.sampleRevision)) {
      const next = queued; queued = null; void stageSample(next);
    }
    else queued = null;
  }
  function snapToStaged() {
    if (!staged || !bands) return;
    clearMotionBlur();
    bands.setFront(stagedSlot);
    activeSlot = stagedSlot; stagedSlot = 1 - activeSlot; staged = false;
    activeSnapshot = stagedSnapshot; stagedSnapshot = null;
    state.sample = activeSnapshot.id; state.sampleRevision = activeSnapshot.revision;
    state.committed = true;
    state.phase = 'idle'; state.angle = state.elapsed = 0; state.waiting = false; state.posesFlat = true;
    prefs.setItem(SAMPLE_KEY, state.sample); archive.capture('about.glass'); rebuildGeometry(); sync();
    if (queued && (queued.id !== state.sample || queued.revision !== state.sampleRevision)) {
      const next = queued; queued = null; void stageSample(next);
    }
    else queued = null;
  }
  async function stageSample(snapshot) {
    if (!snapshot) return;
    const sample = snapshot.id;
    if (!host || !enabled || suspended || !state.photoReady) { queued = snapshot; return; }
    if (state.phase === 'turn' || state.phase === 'loading') {
      queued = snapshot; state.target = sample; state.targetRevision = snapshot.revision;
      select.value = sample; sync(); return;
    }
    if (sample === state.sample && snapshot.revision === state.sampleRevision) {
      queued = null; state.target = sample; state.targetRevision = snapshot.revision;
      select.value = sample; sync(); return;
    }
    if (!reduced) updateFocus(0);
    if (!reduced && (!state.focused || state.deployment < state.maxDeployment - .0005)) {
      queued = snapshot; state.target = sample; state.targetRevision = snapshot.revision;
      select.value = sample; sync(); return;
    }
    state.target = sample; state.targetRevision = snapshot.revision;
    state.phase = 'loading'; state.committed = false; select.value = sample; sync();
    const version = ++stagingVersion, faceGeneration = generation;
    try {
      const photo = await library.imageFor(snapshot);
      if (version !== stagingVersion || faceGeneration !== generation || disposed || !host) return;
      if (!enabled || suspended) { state.phase = 'idle'; queued = snapshot; sync(); return; }
      if (!reduced && (!state.focused || state.deployment < state.maxDeployment - .0005)) {
        state.phase = 'idle'; state.committed = true; queued = snapshot; sync(); return;
      }
      stagedSlot = 1 - activeSlot; paintSlot(stagedSlot, snapshot, photo);
      staged = true; stagedSnapshot = snapshot;
      if (reduced) { snapToStaged(); return; }
      state.plan = makePlan(motion, shape); state.commits = []; state.elapsed = 0;
      state.waiting = false; state.posesFlat = false;
      // Choose a viewer-aware base hinge; each ring derives its own carried
      // hinge and orbit destination from this one planned reference.
      host.camera.updateMatrixWorld(); bands.group.updateWorldMatrix(true, false);
      bands.group.getWorldPosition(tempCenter);
      host.camera.getWorldPosition(tempCamera);
      bands.group.worldToLocal(tempCamera);
      // With a grazing viewer the in-plane orbit carries this axis through
      // both visible hemispheres before the 180° flip is complete.
      hinge.set(tempCamera.x, tempCamera.y, 0);
      if (hinge.lengthSq() < .02) hinge.set(1, 0, 0);
      else hinge.normalize();
      state.plan.axis = hinge.toArray();
      for (let index = 0; index < shape.count; index++) {
        const piece = bands.rings[index], endpoint = state.plan.endpoints[index];
        piece.startQ = piece.pivot.quaternion.clone();
        piece.orbitTarget = THREE.MathUtils.degToRad(endpoint.orbitDegrees);
        piece.progress = 0; piece.curve = state.plan.curves[index];
        piece.axis = hinge.clone().applyAxisAngle(orbitAxis, endpoint.hingeOffset)
          .applyQuaternion(piece.startQ.clone().invert()).normalize();
        piece.endpointQ = orbitQuaternion.setFromAxisAngle(orbitAxis, piece.orbitTarget).clone()
          .multiply(piece.startQ).multiply(flipQuaternion.setFromAxisAngle(piece.axis, Math.PI));
        piece.targetReady = piece.oldCleared = piece.committed = false;
      }
      const center = bands.center;
      center.startQ = center.pivot.quaternion.clone();
      center.orbitTarget = TAU; center.axis = hinge.clone().applyQuaternion(center.startQ.clone().invert());
      center.progress = 0; center.curve = state.plan.centerCurve;
      center.endpointQ = orbitQuaternion.setFromAxisAngle(orbitAxis, TAU).clone()
        .multiply(center.startQ).multiply(flipQuaternion.setFromAxisAngle(center.axis, Math.PI));
      center.targetReady = center.oldCleared = center.committed = false;
      state.phase = 'turn'; sync();
    } catch (error) {
      if (version !== stagingVersion || faceGeneration !== generation) return;
      state.photoError = error.message; state.phase = 'idle'; state.target = state.sample;
      state.targetRevision = state.sampleRevision; state.committed = true;
      pictureError(error.message); select.value = state.sample; console.warn('[about face] Picture unavailable.', error); sync();
    }
  }
  function chooseSample(sample) {const snapshot = library.snapshot(sample); if (snapshot) void stageSample(snapshot);}
  function nextSample() {
    const choices = library.list().map(entry => entry.id);
    const next = choices[(choices.indexOf(state.target) + 1) % choices.length];
    void editPicture(next);
    chooseSample(next);
  }
  const stopArchive = archive.register('about.glass', {page: 'about',
    read: () => ({version: 8, sample: library.has(state.sample) ? state.sample : library.list()[0].id,
      motion, pictures: library.list()}),
    validate: value => {
      if (![2, 3, 4, 5, 6, 7, 8].includes(value?.version)) return false;
      if (value.version < 8) return Object.hasOwn(ART_SAMPLES, value.sample)
        || Object.hasOwn(LEGACY_SAMPLES, value.sample);
      try {library.validateMetadata(value.pictures); return value.pictures.some(entry => entry.id === value.sample);}
      catch {return false;}
    },
    apply: value => {
      if (value.version === 8) library.applyMetadata(value.pictures);
      motion = normalizeMotion(value.motion); prefs.setItem(MOTION_KEY, JSON.stringify(motion)); syncControls();
      rebuildGeometry();
      const legacySample = LEGACY_SAMPLES[value.sample];
      const sample = library.has(value.sample) ? value.sample
        : library.has(legacySample) ? legacySample : library.list()[0].id;
      refreshPictureList(sample); void editPicture(sample);
      if (host) chooseSample(sample);
      else { activeSnapshot = library.snapshot(sample); state.sample = state.target = sample;
        state.sampleRevision = state.targetRevision = activeSnapshot.revision; select.value = sample; sync(); }
    }});
  section.addEventListener('click', event => {
    if (event.target.closest('[data-about-focus]') && host && enabled && !suspended) focusFace(ABOUT_MOUNT);
    if (event.target.closest('[data-about-next]') && host && enabled && !suspended) nextSample();
  }, {signal: events.signal});
  select.addEventListener('change', () => {
    void editPicture(select.value);
    if (host && enabled && !suspended) chooseSample(select.value);
  }, {signal: events.signal});
  section.addEventListener('change', event => {
    const key = event.target.dataset.motion;
    if (!key) return;
    saveMotion({...motion, [key]: event.target.value});
  }, {signal: events.signal});

  function detach() {
    generation++; stagingVersion++;
    clearMotionBlur();
    input?.dispose(); input = null; bands?.dispose(); bands = null; binding.detach(); host = null;
    staged = false; stagedSnapshot = null; queued = null;
    state.phase = 'idle'; state.angle = state.elapsed = 0; state.deployment = RECESSED; state.waiting = false;
    state.posesFlat = true;
    state.backingBarrier = null; state.maxDeployment = 0;
    state.photoReady = state.focused = false; state.plan = null; state.commits = []; sync();
  }
  function attach(context) {
    if (disposed) return;
    detach(); host = context; binding.attach(context); suspended = false;
    activeSlot = 0; stagedSlot = 1;
    activeSnapshot = library.snapshot(state.sample) || library.list()[0];
    state.sample = state.target = activeSnapshot.id;
    state.sampleRevision = state.targetRevision = activeSnapshot.revision; state.committed = true;
    shape = normalizeGeometry(motion); state.bands = shape.count;
    state.backingBarrier = measureBackingBarrier(context); refreshClearance();
    paintSlot(0, activeSnapshot, null); bands = createSiliconeBands(frontCanvases, rearCanvas, shape);
    bands.group.applyMatrix4(mountMatrix()); context.cube.add(bands.group);
    bands.rotor.position.z = RECESSED;
    const faceGeneration = generation;
    const loadingSnapshot = activeSnapshot;
    void library.imageFor(loadingSnapshot).then(photo => {
      if (faceGeneration !== generation || !host || disposed) return;
      paintSlot(0, loadingSnapshot, photo); state.photoReady = true; sync();
    }).catch(error => {
      if (faceGeneration !== generation) return;
      state.photoError = error.message; state.photoReady = true;
      pictureError(error.message);
      console.warn('[about face] Initial picture unavailable.', error); sync();
    });
    input = bindDisplayInput({...context, onNext: nextSample, getDisplay: () => bands?.rotor,
      allowed: () => Boolean(host && enabled && !suspended && !rotating
        && !document.querySelector('dialog[open],[aria-modal="true"]:not([hidden])'))});
    sync();
  }
  function updateTurn(dt) {
    const plan = state.plan;
    // Complete every rigid pose. If a moving viewer prevented a hidden map
    // assignment, wait flat at the endpoint until that side faces away.
    const realDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const frameDt = Math.min(.05, realDt);
    const blurScale = realDt > 0 ? BLUR_SHUTTER * motion.blurAmount / realDt : 0;
    const blurSpan = value => Math.max(-.16, Math.min(.16, value * blurScale));
    state.elapsed = Math.min(plan.end, state.elapsed + frameDt);
    for (let index = 0; index < shape.count; index++) {
      const piece = bands.rings[index];
      const previousOrbit = piece.orbit, previousFlip = piece.flip;
      const t = Math.min(1, Math.max(0, (state.elapsed - plan.starts[index]) / plan.duration));
      const desired = easeAt(t, piece.curve);
      const progress = piece.progress = Math.min(desired,
        piece.progress + MAX_ORBIT_STEP / Math.max(Math.abs(piece.orbitTarget), Math.PI));
      piece.orbit = progress * piece.orbitTarget; piece.flip = progress * Math.PI;
      piece.pivot.quaternion.copy(orbitQuaternion.setFromAxisAngle(orbitAxis, piece.orbit))
        .multiply(piece.startQ).multiply(flipQuaternion.setFromAxisAngle(piece.axis, piece.flip));
      bands.setMotionBlur(piece, blurSpan(piece.orbit - previousOrbit), blurSpan(piece.flip - previousFlip));
      commitPiece(piece, index);
    }
    const center = bands.center;
    const previousCenterOrbit = center.orbit, previousCenterFlip = center.flip;
    const centerDesired = easeAt(Math.min(1, state.elapsed / plan.end), center.curve);
    const centerProgress = center.progress = Math.min(centerDesired,
      center.progress + MAX_ORBIT_STEP / Math.max(Math.abs(center.orbitTarget), Math.PI));
    center.orbit = centerProgress * center.orbitTarget; center.flip = centerProgress * Math.PI;
    center.pivot.quaternion.copy(orbitQuaternion.setFromAxisAngle(orbitAxis, center.orbit))
      .multiply(center.startQ).multiply(flipQuaternion.setFromAxisAngle(center.axis, center.flip));
    bands.setMotionBlur(center, blurSpan(center.orbit - previousCenterOrbit), blurSpan(center.flip - previousCenterFlip));
    commitPiece(center, 'center');
    state.angle = bands.rings[0].orbit;
    const complete = bands.rings.every(piece => piece.committed) && center.committed;
    state.posesFlat = bands.rings.every(piece => piece.progress >= 1 - 1e-8) && center.progress >= 1 - 1e-8;
    const wasWaiting = state.waiting;
    state.waiting = state.posesFlat && !complete;
    if (state.waiting !== wasWaiting) sync();
    if (state.posesFlat && complete) finishTurn();
  }
  refreshPictureList(saved); void editPicture(saved); syncControls(); sync();
  return {
    id: binding.id, backingName: binding.backingName,
    get backing() { return binding.backing; }, get components() { return [bands?.group].filter(Boolean); },
    get runtime() { return {state, motion, geometry: shape, canvas: frontCanvases[activeSlot], frontCanvases, rearCanvas, bands,
      sourceChildren: [...(binding.backing?.children || [])], mount: ABOUT_MOUNT,
      frontFacingDot: () => bands ? sideDot(bands.center, bands.center.parity) : 1}; },
    attach, detach, frameLayout,
    update(dt, frame = {}) {
      rotating = Boolean(frame.rotating);
      if (disposed || suspended || !enabled) return;
      if (wantsFocus && host) { wantsFocus = false; focusFace(ABOUT_MOUNT); }
      updateFocus(dt);
      if (state.phase === 'idle') rebuildGeometry();
      if (state.phase === 'idle' && queued && (reduced || (state.focused && state.deployment >= state.maxDeployment - .0005))) {
        const next = queued; queued = null; void stageSample(next);
      }
      if (state.phase !== 'turn') return;
      if (reduced) { snapToStaged(); return; }
      updateTurn(dt);
    },
    applySettings(snapshot) {
      enabled = snapshot.about?.about?.enabled !== false;
      const wasReduced = reduced; reduced = Boolean(snapshot.accessibility?.reducedMotion);
      if (reduced && !wasReduced && staged && bands) snapToStaged();
      if (reduced || !enabled) clearMotionBlur();
      sync();
    },
    suspend() { suspended = true; clearMotionBlur(); sync(); },
    resume() { if (!disposed) { suspended = false; sync(); } },
    dispose() { if (disposed) return; detach(); disposed = true; previewVersion++;
      releasePreview(); events.abort(); stopArchive(); unregister(); css.remove(); }
  };
}
