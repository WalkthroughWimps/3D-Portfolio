import {initPanelShell} from '../../../debug/panel-shell.js';
import {getSettingsArchive} from '../../../_7-shared-scripts/panel-assembly/SettingsArchive.mjs';
import {normalizeRefsOptions, REFS_DEFAULT_OPTIONS, REFS_MAX_PLATES} from './snap-board.js';
import {createRefsPlateArtwork, REFS_MAX_TEXT_LENGTH} from './plate-art.js';
import {compactRefsPreview, getRefsOriginal, sampleRefsOriginalPixel, saveRefsOriginal} from './picture-source.js';
import {createRefsEditor} from './editor.js';

const OWNER = 'about.refs.sketch', PAGE = 'about';
const fields = [
  ['scale', 'Overall size', .6, 1.4, .01, 2], ['width', 'Width', .7, 1.3, .01, 2],
  ['height', 'Height', .7, 1.3, .01, 2], ['x', 'Horizontal placement', -.35, .35, .005, 3],
  ['y', 'Vertical placement', -.35, .35, .005, 3], ['angle', 'Rotation', -180, 180, 1, 0, '°'],
  ['roundness', 'Curio shoulder roundness', 0, 1, .01, 2],
  ['portraitRadius', 'Portrait opening radius', 48, 105, 1, 0],
  ['apertureRadius', 'Main opening radius', 95, 170, 1, 0],
  ['baySpacing', 'Side bay spacing', 175, 240, 1, 0],
  ['bayWidth', 'Side bay width', 35, 80, 1, 0],
  ['lineWeight', 'Line weight', .5, 2, .05, 2], ['opacity', 'Opacity', 0, 1, .01, 2]
];
const cabinetFields = [
  ['cabinetDepth', 'Cabinet depth', .04, .45, .005, 3],
  ['portraitFrameWidthRatio', 'Portrait frame border / radius', .14, .28, .01, 2],
  ['wallThickness', 'Wall thickness', .008, .05, .001, 3],
  ['irisBulgeRatio', 'Dummy iris bulge / aperture radius', .03, 1, .01, 2],
  ['plateCount', 'Plate count', 1, REFS_MAX_PLATES, 1, 0],
  ['plateSpacing', 'Requested plate spacing', .008, .06, .001, 3],
  ['selectorAngle', 'Selector opening angle', 35, 80, 1, 0, '°'],
  ['selectorSpeed', 'Selector speed', .4, 2, .05, 2]
];
const appearanceFields = [
  ['cabinetWoodTint', 'Wood color tint', 0, 1, .05, 2],
  ['cabinetGrainScale', 'Wood grain scale', .5, 2, .05, 2],
  ['cabinetSheen', 'Cabinet sheen', 0, 1, .05, 2]
];
const allFields = [...fields, ...cabinetFields, ...appearanceFields];
const selectorPhaseLabels = {
  open: 'Opening stack and selector', retract: 'Retracting displayed plate',
  return: 'Returning plate to storage', withdraw: 'Pulling empty selector clear of stack',
  seek: 'Aligning selector outside stack', approach: 'Approaching selected plate',
  fetch: 'Fetching selected plate', present: 'Bringing next plate to selector front',
  close: 'Returning selector and stack to centre'
};
const asDegrees = value => value * 180 / Math.PI;
const fromDegrees = value => value * Math.PI / 180;
const readout = (key, label, unit = '') => `<span class="refs-number"><button type="button" data-readout="${key}" aria-label="Edit ${label}"></button><input type="text" inputmode="decimal" data-entry="${key}" aria-label="${label} value" hidden></span>${unit ? `<span class="refs-unit">${unit}</span>` : ''}`;
function control([key, label, min, max, step, , unit]) {
  return `<div class="refs-control"><div class="refs-control-line"><label for="refs-option-${key}">${label}</label>${readout(key, label, unit)}</div><input id="refs-option-${key}" type="range" data-option="${key}" min="${min}" max="${max}" step="${step}" aria-label="${label}"></div>`;
}
const styleText = `
  .refs-panel{box-sizing:border-box;width:100%;max-width:100%;padding:.25rem;overflow-wrap:anywhere}
  .refs-panel section{min-width:0;margin:0 0 .8rem;padding:.65rem;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:.45rem}
  .refs-panel h3{margin:.1rem 0 .55rem;font-size:1rem}
  .refs-panel label{box-sizing:border-box;min-width:0}
  .refs-control{margin:.55rem 0}.refs-control-line{display:flex;align-items:center;gap:.4rem}.refs-control-line label{flex:1}
  .refs-panel input[type=range]{width:100%;min-width:0;margin:.2rem 0;accent-color:var(--constructor-accent,#65c5c8)}
  .refs-number{display:inline-grid;grid-template-columns:1fr;flex:none;width:5.3rem;height:1.9rem;vertical-align:middle}
  .refs-number>button,.refs-number>input{box-sizing:border-box;grid-area:1/1;width:100%;height:100%;min-height:0;padding:.15rem .32rem;text-align:right;font:inherit;font-variant-numeric:tabular-nums;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 32%,transparent);border-radius:.25rem}
  .refs-number>button{cursor:text}.refs-number>input{background:Canvas;color:CanvasText}.refs-number>[hidden]{display:none}
  .refs-unit{width:1.1em}.refs-panel select,.refs-panel input[type=color]{max-width:100%;min-height:2rem}
  .refs-panel .refs-select{display:grid;grid-template-columns:minmax(0,1fr) minmax(7rem,45%);align-items:center;gap:.5rem;margin:.5rem 0}
  .refs-panel .refs-check{display:flex;gap:.5rem;align-items:center;margin:.4rem 0}
  .refs-plate-actions{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin:.6rem 0}
  .refs-plate-actions select{flex:1 1 7rem;width:auto;min-width:0}
  .refs-cabinet-head{display:block}
  .refs-plates-head{display:grid;grid-template-columns:minmax(0,1fr) minmax(80px,112px);gap:.65rem;align-items:start}
  .refs-plate-preview{margin:0;max-width:112px;text-align:center;font-size:.78rem}
  .refs-plate-preview canvas{display:block;width:100%;height:auto;aspect-ratio:1}
  .refs-plate-preview figcaption{overflow-wrap:anywhere}
  .refs-picture-actions{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin:.5rem 0}
  .refs-picture-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4rem;align-items:center;margin:.5rem 0}
  .refs-picture-settings label{display:grid;gap:.2rem}.refs-picture-settings input[type=color]{width:100%}
  .refs-picture-scale{grid-column:1/-1}.refs-picture-scale .refs-control{margin:0}
  .refs-picker[hidden]{display:none}.refs-picker{margin:.5rem 0;padding:.45rem;border:1px solid currentColor;border-radius:.3rem}
  .refs-picker canvas{display:block;width:100%;height:auto;max-width:512px;cursor:crosshair;touch-action:manipulation}
  .refs-picker output{display:inline-flex;align-items:center;gap:.35rem}.refs-picker output::before{content:'';width:1.2em;height:1.2em;border:1px solid currentColor;background:var(--refs-picked,#14283a)}
  .refs-gem-text{display:block;margin:.5rem 0}.refs-gem-text textarea{box-sizing:border-box;display:block;width:100%;min-height:4.5rem;resize:vertical;font:inherit}
  .refs-gem-preview{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.82rem;margin:.3rem 0}
  @media(max-width:390px){.refs-plates-head{grid-template-columns:minmax(0,1fr) 80px;gap:.3rem}.refs-plate-preview{max-width:80px}}
  .refs-spacing-note{font-size:.82rem;opacity:.85;margin:.3rem 0}
  .refs-panel button{max-width:100%;white-space:normal}.refs-panel [role=status]{min-height:1.2em;margin:.4rem 0;font-size:.85rem}
  .refs-editor-toolbar{display:flex;align-items:end;gap:.4rem;flex-wrap:wrap;margin-bottom:.4rem}.refs-editor-toolbar label{flex:1;min-width:8rem}
  .refs-editor-toolbar select{display:block;width:100%}.refs-editor-stage{position:relative;width:100%;aspect-ratio:1;overflow:hidden;touch-action:none;border:1px solid color-mix(in srgb,currentColor 30%,transparent);border-radius:.25rem;background:color-mix(in srgb,currentColor 5%,transparent)}
  .refs-editor-stage::before{content:'';position:absolute;left:22.9%;top:22.9%;width:54.2%;height:54.2%;box-sizing:border-box;border:1px dashed color-mix(in srgb,currentColor 22%,transparent);border-radius:50%;pointer-events:none}
  .refs-editor-art{position:absolute;inset:0;transform-origin:center;will-change:transform}
  .refs-editor-stage canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}.refs-editor-stage canvas:active{cursor:grabbing}
  .refs-editor-selection{position:absolute;box-sizing:border-box;border:2px solid color-mix(in srgb,var(--constructor-accent,#65c5c8) var(--constructor-accent-percent,70%),transparent);pointer-events:none}.refs-editor-selection[hidden]{display:none}
  .refs-editor-selection i{position:absolute;display:block;width:12px;height:12px;background:color-mix(in srgb,var(--constructor-accent,#65c5c8) var(--constructor-accent-percent,70%),transparent);border:1px solid currentColor;pointer-events:auto;touch-action:none}
  .refs-editor-selection i[data-handle=nw]{left:-7px;top:-7px;cursor:nwse-resize}.refs-editor-selection i[data-handle=ne]{right:-7px;top:-7px;cursor:nesw-resize}
  .refs-editor-selection i[data-handle=sw]{left:-7px;bottom:-7px;cursor:nesw-resize}.refs-editor-selection i[data-handle=se]{right:-7px;bottom:-7px;cursor:nwse-resize}
  .refs-editor-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4rem}.refs-editor-fields label{display:flex;justify-content:space-between;align-items:center;gap:.2rem}
  .refs-editor-fields .refs-number{width:4.4rem}.refs-editor-hint{font-size:.8rem;opacity:.8}
`;

export function createRefsControls({board, onFocus = () => {}} = {}) {
  if (!board) throw new TypeError('Refs controls require an attached snap board');
  const root = document.createElement('div'); root.className = 'refs-panel refs-constructor';
  const generalRoot = document.createElement('div'); generalRoot.className = 'refs-panel refs-general';
  const style = document.createElement('style'); style.textContent = styleText;
  root.innerHTML = `<section><h3>Sketch actions</h3><button type="button" data-focus>Focus Refs</button> <button type="button" data-reset>Reset sketch defaults</button><p data-save role="status" aria-live="polite"></p></section>
    <section><div class="refs-cabinet-head"><div><h3>Cabinet construction</h3>
      <label class="refs-check"><input type="checkbox" data-option="cabinetEnabled"> Show cabinet</label>
      <label class="refs-check"><input type="checkbox" data-option="cabinetFrontEnabled"> Cabinet front</label>
      <label class="refs-check"><input type="checkbox" data-option="selectorBackingEnabled"> Floral cabinet back</label>
      <label class="refs-check"><input type="checkbox" data-option="housingEnabled"> Plate housing</label>
      <label class="refs-check"><input type="checkbox" data-option="dummyIrisEnabled"> Dummy iris door</label>
      <label class="refs-check"><input type="checkbox" data-option="cabinetCutaway"> Cutaway</label>
      <label class="refs-check"><input type="checkbox" data-option="mechanismEnabled"> Plate mechanism</label></div>
      <figure class="refs-plate-preview"><canvas data-plate-preview width="256" height="256" aria-label="Selected portrait plate preview" role="img"></canvas><figcaption data-plate-caption></figcaption></figure></div>
      <div class="refs-plate-actions" data-plate-actions>
        <button type="button" data-previous-plate>Previous plate</button>
        <select data-plate-select aria-label="Select portrait plate"></select>
        <button type="button" data-next-plate>Next plate</button>
        <button type="button" data-add-plate>Add plate</button>
      </div>
      <div class="refs-picture-actions"><button type="button" data-choose-picture>Choose picture</button><button type="button" data-remove-picture>Remove picture</button><button type="button" data-open-picker>Pick picture color</button><input type="file" data-picture-file accept="image/png,image/jpeg,image/webp" hidden></div>
      <div class="refs-picture-settings"><label>Plate body/background<input type="color" data-plate-color="bodyColor" aria-label="Plate body color"></label><label>Plate rim<input type="color" data-plate-color="rimColor" aria-label="Plate rim color"></label><div class="refs-picture-scale refs-control"><div class="refs-control-line"><label for="refs-picture-scale">Picture size</label>${readout('imageScale', 'Picture size')}</div><input id="refs-picture-scale" type="range" data-image-scale min="0.1" max="3" step="0.01" aria-label="Picture size"></div></div>
      <div class="refs-picker" data-picker hidden><p data-picker-source role="status" aria-live="polite"></p><canvas data-picker-canvas tabindex="0" role="button" aria-label="Sample picture pixel; use arrow keys to choose a pixel, Enter to sample, Escape to close"></canvas><p>Selected pixel: <output data-picked-color role="status" aria-live="polite"></output></p><label>Apply to <select data-picker-target><option value="bodyColor">Plate body/background</option><option value="rimColor">Plate rim</option></select></label> <button type="button" data-apply-picked>Apply sampled color</button> <button type="button" data-close-picker>Close</button><p class="refs-editor-hint">Click or touch the picture, or use arrow keys and Enter. Colors come from picture pixels before scene lighting.</p></div>
      <label class="refs-gem-text">Gem text<textarea data-gem-text maxlength="${REFS_MAX_TEXT_LENGTH}" aria-label="Gem text for selected plate"></textarea></label>
      <p class="refs-gem-preview" data-gem-preview></p>
      <p data-picture-status role="status" aria-live="polite"></p>
      <p data-selector-status role="status" aria-live="polite"></p>
      <label class="refs-check"><input type="checkbox" data-option="portraitWindowEnabled"> Portrait window frame</label>
      <label class="refs-check"><input type="checkbox" data-option="portraitGlassEnabled"> Portrait glass</label>
      <label class="refs-check"><input type="checkbox" data-option="portraitLockEnabled"> Portrait lock</label>
      ${cabinetFields.map(control).join('')}
      <p class="refs-spacing-note" data-depth-clearance role="status"></p>
      <p class="refs-spacing-note">Plates automatically fit inside shallow cabinets. Applied spacing: <output data-applied-spacing></output>.</p>
    </section>
    <section><h3>2D face editor</h3><div data-editor></div><label class="refs-check"><input type="checkbox" data-option="pairLinked"> Mirror paired parts</label></section>
    <section><h3>Size &amp; placement</h3>${fields.slice(0, 6).map(control).join('')}</section>
    <section><h3>Container profile and openings</h3>
      <label class="refs-select">Drawing style<select data-option="style" aria-label="Drawing style"><option value="precision">Precision</option><option value="sketch">Sketch</option></select></label>
      <label class="refs-select">Container profile<select data-option="outline" aria-label="Container profile"><option value="curio">Curio</option><option value="rounded">Rounded</option><option value="circular">Circular</option></select></label>
      ${fields.slice(6, 11).map(control).join('')}
      <label class="refs-check"><input type="checkbox" data-option="opening"> Show face opening guide</label>
      <label class="refs-check"><input type="checkbox" data-option="hinges"> Show hinge axes</label>
      <label class="refs-check"><input type="checkbox" data-option="leftHinge"> Left hinge</label>
      <label class="refs-check"><input type="checkbox" data-option="rightHinge"> Right hinge</label>
      <button type="button" data-select-hinge="leftHinge">Edit left hinge</button> <button type="button" data-select-hinge="rightHinge">Edit right hinge</button>
    </section>
    <section><h3>Construction guides</h3>${fields.slice(11).map(control).join('')}
      <label class="refs-select">Ink color<input type="color" data-option="ink" aria-label="Ink color"></label>
      <label class="refs-select">Accent color<input type="color" data-option="accent" aria-label="Accent color"></label>
      <label class="refs-check"><input type="checkbox" data-option="innerTrim"> Inner trim</label>
      <label class="refs-check"><input type="checkbox" data-option="guides"> Construction guide</label>
      <label class="refs-check"><input type="checkbox" data-option="anchors"> Compass anchors</label>
    </section>`;
  root.prepend(style);
  const materialChoices = '<option value="painted">Painted enamel</option><option value="oak">Oak</option><option value="walnut">Walnut</option><option value="mahogany">Mahogany</option><option value="brushedMetal">Brushed metal</option>';
  generalRoot.innerHTML = `<section><h3>Portrait plates</h3><div class="refs-plates-head"><button type="button" data-focus>Focus Refs</button></div></section><section><h3>Cabinet appearance</h3>
    <label class="refs-select">Cabinet face material<select data-option="cabinetFaceMaterial" aria-label="Cabinet face material">${materialChoices}</select></label>
    <label class="refs-select">Cabinet side material<select data-option="cabinetSideMaterial" aria-label="Cabinet side material">${materialChoices}</select></label>
    <label class="refs-select">Cabinet face color<input type="color" data-option="cabinetFaceColor" aria-label="Cabinet face color"></label>
    <label class="refs-select">Cabinet side color<input type="color" data-option="cabinetSideColor" aria-label="Cabinet side color"></label>
    <label class="refs-select">Cabinet trim color<input type="color" data-option="cabinetTrimColor" aria-label="Cabinet trim color"></label>
    <p class="refs-editor-hint">Wood shows its natural color at tint 0. Raise tint to stain it with the saved face or side color. Colors also apply to paint and metal.</p>
    ${appearanceFields.map(control).join('')}</section><section><h3>Sketch appearance</h3></section>`;
  const [platesSection, appearanceSection, sketchSection] = generalRoot.querySelectorAll('section');
  const move = (selector, destination, ancestor) => {
    const element = root.querySelector(selector);
    if (element) destination.append(ancestor ? element.closest(ancestor) : element);
  };
  move('.refs-plate-preview', platesSection.querySelector('.refs-plates-head'));
  for (const selector of ['.refs-plate-actions', '.refs-picture-actions', '.refs-picture-settings', '.refs-picker', '.refs-gem-text', '.refs-gem-preview', '[data-picture-status]', '[data-selector-status]'])
    move(selector, platesSection);
  move('[data-option="plateCount"]', platesSection, '.refs-control');
  for (const key of ['selectorBackingEnabled', 'portraitGlassEnabled', 'portraitLockEnabled'])
    move(`[data-option="${key}"]`, appearanceSection, 'label');
  move('[data-option="selectorSpeed"]', appearanceSection, '.refs-control');
  for (const key of ['lineWeight', 'opacity']) move(`[data-option="${key}"]`, sketchSection, '.refs-control');
  for (const key of ['style', 'ink', 'accent', 'innerTrim']) move(`[data-option="${key}"]`, sketchSection, 'label');
  const events = new AbortController(), roots = [root, generalRoot];
  const query = selector => roots.map(panel => panel.querySelector(selector)).find(Boolean);
  const queryAll = selector => roots.flatMap(panel => [...panel.querySelectorAll(selector)]);
  const optionControls = queryAll('[data-option]');
  const status = root.querySelector('[data-save]'), archive = getSettingsArchive();
  const plateSelect = query('[data-plate-select]');
  const selectorStatus = query('[data-selector-status]');
  const appliedSpacing = query('[data-applied-spacing]');
  const depthClearance = query('[data-depth-clearance]');
  const plateActions = query('[data-plate-actions]');
  const previewCanvas = query('[data-plate-preview]');
  const plateCaption = query('[data-plate-caption]');
  const gemText = query('[data-gem-text]');
  const gemPreview = query('[data-gem-preview]');
  const pictureFile = query('[data-picture-file]');
  const pictureStatus = query('[data-picture-status]');
  const removePicture = query('[data-remove-picture]');
  const openPicker = query('[data-open-picker]');
  const picker = query('[data-picker]');
  const pickerCanvas = query('[data-picker-canvas]');
  const pickedColor = query('[data-picked-color]');
  const pickerSource = query('[data-picker-source]');
  const pickerTarget = query('[data-picker-target]');
  const scaleInput = query('[data-image-scale]');
  const addPlate = query('[data-add-plate]');
  let alive = true;
  let previewArtwork = null, previewIndex = -1, previewPlate = null;
  let pictureSerial = 0;
  let pickerSerial = 0, pickerPlate = null, pickerImage = null;
  let pickerX = 0, pickerY = 0, picked = '';
  const pictureGenerations = new Map();
  const entryEvents = new Set();
  function capture() { archive.capture(OWNER); status.textContent = archive.getPersistenceStatus().ok ? 'Saved locally' : 'Local save failed'; }
  const editor = createRefsEditor({board, onCommit: capture});
  query('[data-editor]').append(editor.root);
  function displaySelector(state = board.getSelectorState()) {
    const options = board.getOptions();
    const target = state.targetIndex + 1;
    const queued = state.queuedIndex === null ? '' : ` Queued: plate ${state.queuedIndex + 1}.`;
    selectorStatus.textContent = !options.cabinetEnabled || !options.mechanismEnabled ?
      `Plate mechanism hidden; selected plate ${target} of ${state.plateCount}.` : state.busy ?
        `Selecting plate ${target}. ${selectorPhaseLabels[state.phase] ?? state.phase}.${queued}` :
        `Plate ${state.currentIndex + 1} of ${state.plateCount} displayed.`;
    appliedSpacing.textContent = Number(state.appliedSpacing).toFixed(4);
  }
  function display(options) {
    const clearance = board.getClearance();
    const depthRange = query('[data-option="cabinetDepth"]');
    if (clearance) {
      depthRange.max = String(clearance.maxDepth);
      depthClearance.textContent = `Backing-safe depth ceiling ${clearance.maxDepth.toFixed(3)}; applied ${clearance.appliedDepth.toFixed(3)}.` +
        (clearance.requestedDepth > clearance.appliedDepth + .0005 ?
          ` Requested ${clearance.requestedDepth.toFixed(3)} was fitted.` : '') +
        (clearance.desiredTuck > clearance.safeOffset + .001 ? ' This footprint stops at its nearest clear tuck.' : '');
    }
    for (const input of optionControls) {
      const key = input.dataset.option, value = options[key];
      if (input.type === 'checkbox') input.checked = Boolean(value);
      else if (input.type === 'range') {
        input.value = String(key === 'angle' ? asDegrees(value) : value);
        query(`[data-readout="${key}"]`).textContent = Number(key === 'angle' ? asDegrees(value) : value).toFixed(allFields.find(f => f[0] === key)[5]);
      } else input.value = String(value);
    }
    if (plateSelect.options.length !== options.plateCount) {
      plateSelect.replaceChildren(...Array.from({length: options.plateCount}, (_, index) => {
        const option = document.createElement('option');
        option.value = String(index); option.textContent = `Plate ${index + 1}`;
        return option;
      }));
    }
    plateSelect.value = String(options.plateIndex);
    const plate = board.getPlate(options.plateIndex);
    if (previewIndex !== options.plateIndex) {
      if (previewArtwork) previewArtwork.dispose();
      previewArtwork = createRefsPlateArtwork(previewCanvas, options.plateIndex + 1, plate);
      previewIndex = options.plateIndex; previewPlate = plate;
    } else if (previewPlate && (previewPlate.image !== plate.image ||
        previewPlate.bodyColor !== plate.bodyColor || previewPlate.rimColor !== plate.rimColor ||
        previewPlate.imageScale !== plate.imageScale)) {
      previewArtwork.update(plate); previewPlate = plate;
    }
    plateCaption.textContent = `Plate ${options.plateIndex + 1}`;
    previewCanvas.setAttribute('aria-label', `Selected plate ${options.plateIndex + 1} preview`);
    if (gemText.value !== plate.text) gemText.value = plate.text;
    gemPreview.textContent = plate.text;
    removePicture.disabled = !plate.image;
    openPicker.disabled = !plate.image;
    for (const input of queryAll('[data-plate-color]')) input.value = plate[input.dataset.plateColor];
    scaleInput.value = String(plate.imageScale);
    query('[data-readout="imageScale"]').textContent = plate.imageScale.toFixed(2);
    if (pickerPlate && (pickerPlate.slot !== options.plateIndex ||
        pickerPlate.image !== plate.image || pickerPlate.sourceId !== plate.sourceId)) closePicker();
    addPlate.disabled = options.plateCount >= REFS_MAX_PLATES;
    const canSelect = options.cabinetEnabled && options.mechanismEnabled && options.plateCount > 1;
    plateActions.querySelector('[data-previous-plate]').disabled = !canSelect;
    plateActions.querySelector('[data-next-plate]').disabled = !canSelect;
    plateSelect.disabled = !canSelect;
    displaySelector();
  }
  function apply(value) {
    pictureGenerations.clear(); closePicker();
    const allowed = Object.fromEntries(Object.keys(REFS_DEFAULT_OPTIONS).filter(key => Object.hasOwn(value || {}, key)).map(key => [key, value[key]]));
    board.setOptions(normalizeRefsOptions(allowed));
  }
  const unregisterArchive = archive.register(OWNER, {page: PAGE, read: () => board.getOptions(), apply,
    validate: value => Boolean(value && typeof value === 'object' && !Array.isArray(value)), restore: true});
  const unsubscribe = board.subscribe(display);
  const unsubscribeSelector = board.subscribeSelector(displaySelector);
  const shell = initPanelShell();
  const unregisterGeneral = shell.registerContext('refs', 'Refs', generalRoot);
  const unregisterConstructor = shell.registerConstructorContext('refs', 'Refs', root);
  display(board.getOptions());
  function numericEntry(button) {
    const key = button.dataset.readout ?? button.dataset.frameReadout;
    const isFrame = Boolean(button.dataset.frameReadout), input = button.parentElement.querySelector('input');
    const entry = new AbortController();
    entryEvents.add(entry);
    input.value = button.textContent; button.hidden = true; input.hidden = false; input.focus(); input.select();
    let closed = false;
    function close(commit) {
      if (closed) return;
      if (commit) {
        const number = Number(input.value.trim());
        if (!input.value.trim() || !Number.isFinite(number)) { status.textContent = 'Enter a finite number'; input.focus(); return; }
        if (isFrame) board.patchElement(editor.selected, {[key]: number});
        else if (key === 'imageScale') board.updatePlate(board.getOptions().plateIndex, {imageScale: number});
        else board.setOptions({[key]: key === 'angle' ? fromDegrees(number) : number});
        capture();
      }
      closed = true; entry.abort(); entryEvents.delete(entry);
      input.hidden = true; button.hidden = false; display(board.getOptions()); editor.render();
    }
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); close(true); }
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
    }, {signal: entry.signal});
    input.addEventListener('blur', () => close(true), {signal: entry.signal});
  }
  const onClick = event => {
    const button = event.target.closest('[data-readout],[data-frame-readout]');
    if (button) numericEntry(button);
    if (event.target.closest('[data-focus]')) onFocus();
    if (event.target.closest('[data-reset]')) {
      pictureGenerations.clear(); closePicker(); editor.finish(false); board.setOptions(REFS_DEFAULT_OPTIONS); capture();
    }
    if (event.target.closest('[data-previous-plate]')) { board.previousPlate(); capture(); }
    if (event.target.closest('[data-next-plate]')) { board.nextPlate(); capture(); }
    if (event.target.closest('[data-add-plate]')) { board.addPlate(); capture(); }
    if (event.target.closest('[data-choose-picture]')) pictureFile.click();
    if (event.target.closest('[data-remove-picture]')) {
      const slot = board.getOptions().plateIndex;
      pictureGenerations.set(slot, ++pictureSerial);
      closePicker(); board.updatePlate(slot, {image: '', sourceId: ''}); pictureStatus.textContent = 'Picture removed.'; capture();
    }
    if (event.target.closest('[data-open-picker]')) void showPicker();
    if (event.target.closest('[data-close-picker]')) closePicker();
    if (event.target.closest('[data-apply-picked]') && picked && pickerPlate) {
      const plate = board.getPlate(pickerPlate.slot);
      if (plate?.image === pickerPlate.image && plate.sourceId === pickerPlate.sourceId &&
          board.getOptions().plateIndex === pickerPlate.slot) {
        board.updatePlate(pickerPlate.slot, {[pickerTarget.value]: picked}); capture();
      }
    }
    const hinge = event.target.closest('[data-select-hinge]');
    if (hinge) editor.choose(hinge.dataset.selectHinge);
  };
  for (const panel of roots) panel.addEventListener('click', onClick, {signal: events.signal});
  const edit = event => {
    const input = event.target.closest('[data-option]');
    if (!input || !roots.some(panel => panel.contains(input))) return;
    const key = input.dataset.option;
    const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ?
      (key === 'angle' ? fromDegrees(Number(input.value)) : Number(input.value)) : input.value;
    board.setOptions({[key]: value}); capture();
  };
  for (const panel of roots) panel.addEventListener('input', event => { if (event.target.matches('input[type=range],input[type=color]')) edit(event); }, {signal: events.signal});
  generalRoot.addEventListener('input', event => {
    if (event.target === scaleInput) {
      board.updatePlate(board.getOptions().plateIndex, {imageScale: Number(scaleInput.value)}); capture();
    } else if (event.target.matches('[data-plate-color]')) {
      board.updatePlate(board.getOptions().plateIndex,
        {[event.target.dataset.plateColor]: event.target.value}); capture();
    }
  }, {signal: events.signal});
  for (const panel of roots) panel.addEventListener('change', event => { if (event.target.matches('select[data-option],input[type=checkbox][data-option]')) edit(event); }, {signal: events.signal});
  plateSelect.addEventListener('change', () => { board.selectPlate(Number(plateSelect.value)); capture(); }, {signal: events.signal});
  gemText.addEventListener('input', () => {
    board.updatePlate(board.getOptions().plateIndex, {text: gemText.value}); capture();
  }, {signal: events.signal});
  function closePicker() {
    pickerSerial++;
    pickerPlate = null; pickerImage = null; picked = '';
    picker.hidden = true;
    pickerCanvas.width = pickerCanvas.height = 0;
  }
  function currentPickerPlate() {
    if (!alive || !pickerPlate || board.getOptions().plateIndex !== pickerPlate.slot) return false;
    const plate = board.getPlate(pickerPlate.slot);
    return plate?.image === pickerPlate.image && plate.sourceId === pickerPlate.sourceId;
  }
  function samplePicker(x, y) {
    if (!pickerImage || !currentPickerPlate()) return;
    pickerX = Math.max(0, Math.min(pickerImage.naturalWidth - 1, Math.floor(x)));
    pickerY = Math.max(0, Math.min(pickerImage.naturalHeight - 1, Math.floor(y)));
    const sample = sampleRefsOriginalPixel(pickerImage, pickerX, pickerY);
    picked = sample.alpha ? sample.hex : '';
    pickedColor.textContent = sample.alpha ?
      `${sample.hex} (alpha ${sample.alpha}/255) at ${pickerX + 1}, ${pickerY + 1}` :
      `Transparent pixel at ${pickerX + 1}, ${pickerY + 1}; choose a visible pixel.`;
    pickedColor.style.setProperty('--refs-picked', picked || 'transparent');
    const context = pickerCanvas.getContext('2d');
    context.clearRect(0, 0, pickerCanvas.width, pickerCanvas.height);
    context.drawImage(pickerImage, 0, 0, pickerCanvas.width, pickerCanvas.height);
    const markerX = (pickerX + .5) / pickerImage.naturalWidth * pickerCanvas.width;
    const markerY = (pickerY + .5) / pickerImage.naturalHeight * pickerCanvas.height;
    context.strokeStyle = '#ffffff'; context.lineWidth = 3;
    context.beginPath(); context.arc(markerX, markerY, 5, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = '#000000'; context.lineWidth = 1;
    context.beginPath(); context.arc(markerX, markerY, 5, 0, Math.PI * 2); context.stroke();
  }
  async function showPicker() {
    closePicker();
    const slot = board.getOptions().plateIndex, plate = board.getPlate(slot);
    if (!plate?.image) return;
    const ticket = pickerSerial;
    pickerPlate = {slot, image: plate.image, sourceId: plate.sourceId};
    picker.hidden = false; pickerSource.textContent = 'Loading picture pixels…';
    let url = '';
    try {
      const original = await getRefsOriginal(plate.sourceId);
      if (ticket !== pickerSerial || !currentPickerPlate()) return;
      const source = original ?? plate.image;
      if (original) url = URL.createObjectURL(original);
      const image = new Image(); image.src = url || source;
      await image.decode();
      if (ticket !== pickerSerial || !currentPickerPlate()) return;
      pickerImage = image;
      const scale = Math.min(512 / image.naturalWidth, 512 / image.naturalHeight, 1);
      pickerCanvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      pickerCanvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      pickerCanvas.getContext('2d').drawImage(image, 0, 0, pickerCanvas.width, pickerCanvas.height);
      pickerSource.textContent = original ?
        'Sampling original picture file pixels on this device, before scene lighting.' :
        'Original file unavailable here. Sampling the applied picture asset; its preview may have reduced detail. Choose the picture again to enable original-file sampling.';
      samplePicker(Math.floor(image.naturalWidth / 2), Math.floor(image.naturalHeight / 2));
      pickerCanvas.focus();
    } catch {
      if (ticket === pickerSerial) {
        pickerImage = null; picked = '';
        pickerSource.textContent = 'Could not open picture pixels.';
      }
    } finally { if (url) URL.revokeObjectURL(url); }
  }
  pickerCanvas.addEventListener('pointerdown', event => {
    if (!pickerImage) return;
    const rect = pickerCanvas.getBoundingClientRect();
    samplePicker((event.clientX - rect.left) / rect.width * pickerImage.naturalWidth,
      (event.clientY - rect.top) / rect.height * pickerImage.naturalHeight);
  }, {signal: events.signal});
  pickerCanvas.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closePicker(); openPicker.focus(); return; }
    if (!pickerImage) return;
    const moves = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]};
    if (moves[event.key]) {
      event.preventDefault();
      samplePicker(pickerX + moves[event.key][0], pickerY + moves[event.key][1]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); samplePicker(pickerX, pickerY);
    }
  }, {signal: events.signal});
  pictureFile.addEventListener('change', async () => {
    const file = pictureFile.files?.[0];
    pictureFile.value = '';
    if (!file) return;
    const slot = board.getOptions().plateIndex;
    const generation = ++pictureSerial;
    pictureGenerations.set(slot, generation);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      pictureStatus.textContent = 'Choose a PNG, JPEG, or WebP under 4 MB.'; return;
    }
    let url;
    try {
      url = URL.createObjectURL(file);
      const picture = new Image(); picture.src = url;
      await picture.decode();
      if (!alive || pictureGenerations.get(slot) !== generation) return;
      if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth > 8192 || picture.naturalHeight > 8192)
        throw new RangeError('Image dimensions are out of range.');
      const data = compactRefsPreview(picture);
      if (!alive || pictureGenerations.get(slot) !== generation) return;
      const protectedIds = board.getOptions().plates.map(plate => plate.sourceId).filter(Boolean);
      const sourceId = await saveRefsOriginal(file, protectedIds);
      if (!alive || pictureGenerations.get(slot) !== generation) return;
      closePicker(); board.updatePlate(slot, {image: data, sourceId}); capture();
      pictureStatus.textContent = sourceId ?
        `Picture applied to plate ${slot + 1}. Original pixels are stored locally on this device; archives carry the preview.` :
        `Picture applied to plate ${slot + 1}. Original storage unavailable; color sampling uses the applied preview.`;
    } catch (error) {
      if (alive && pictureGenerations.get(slot) === generation)
        pictureStatus.textContent = error instanceof RangeError ? error.message : 'Could not read this picture.';
    } finally { if (url) URL.revokeObjectURL(url); }
  }, {signal: events.signal});
  status.textContent = archive.getPersistenceStatus().ok ? 'Saved locally' : 'Local save failed';
  return {root, generalRoot, dispose() {
    if (!alive) return; alive = false; closePicker(); previewArtwork?.dispose(); pictureGenerations.clear(); editor.dispose(); events.abort();
    for (const entry of entryEvents) entry.abort();
    entryEvents.clear(); unsubscribe(); unsubscribeSelector();
    unregisterConstructor(); unregisterGeneral(); unregisterArchive(); root.remove(); generalRoot.remove();
  }};
}
