import {trackPerformanceBudget, isPerformanceSamplingActive} from '../../debug/performance-stats.js';
import { SIZE, RADIUS, PALETTE, clone, clamp, rotate, add, subtract, multiply, distance, toLocal, toWorld, makePath,
  handles, RESIZE_HANDLES, onGlass, constrainPoint, shapeFromDrag, normalizePencil, resizeShapes, boundsOf, shapeAnchors,
  isClosed, rebaseShape, overlapsRect, snapPoint, splitCurve, flattenShape, segmentDistance, anchor, restoreDocument, outsidePathSegments, dimensionShapes } from './drawing-model.js';
import { children, orderedObjects, leaves, layerEditable, nodeVisible, objectEditable, isolationRoot, inIsolation, selectionRoots, groupContext, groupSelection,
  ungroupSelection, pruneGroups, duplicateSelection, reorderNode, moveSelectionToLayer, recoverOffPane, placeNodes } from './drawing-document.js';
import { ALL_TOOLS, DRAWING_TOOLS, SELECT_TOOL, ACTION_TOOLS, toolIcon, toolCursor } from './drawing-tools.js';
import { createLayersPanel } from './drawing-layers.js';
import { limitOutlineSegments } from './drawing-outline.js';
import { createArtworkCache } from './drawing-artwork.js';
import { createGearPanel } from './drawing-gears.js';
import { installShortcutLabels, handleEditorShortcut } from './drawing-shortcuts.js';
import { rotationTargets, nearestRotationTarget, rotateShapesAround, angleStep, rotationPaths } from './drawing-rotation.js';
import { ALIGNMENTS, alignedObjects, moveSnapIndex, snappedMove, moveSnapPaths, repeatedTransform } from './drawing-transforms.js';
import {getSharedSettings} from '../../_7-shared-scripts/core/settings.js';
import { createDrawingLibrary, createDownloadManager, drawingFile, parseDrawingFile, fileName } from './drawing-library.js';
import { renderDrawingPng } from './drawing-export.js';
const STORAGE_KEY = 'site.about.notes.v2';
const STORAGE_TIME_KEY = 'site.about.notes.v2.updatedAt';
const SELECTED_KEY = 'site.about.notes.selectedDrawing';
const slider = (field, label, min, max, step, value) => `<label class="notes-range" data-range="${field}"><span>${label}</span><output data-output="${field}">${value}</output><input data-field="${field}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"></label>`;

export function createDrawingEditor({ onChange = () => {}, onPanelRequest = () => false, layersInitiallyOpen = false } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE; canvas.className = 'notes-drawing'; canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Drawing glass'); const context = canvas.getContext('2d');
  const panel = document.createElement('section'); panel.className = 'notes-tools'; panel.hidden = true; panel.setAttribute('aria-label', 'Drawing tools');
  panel.innerHTML = `<header class="notes-context-heading"><div><strong data-context-title>Drawing</strong><span data-context-detail>Pencil</span></div></header>
    <section class="notes-library" aria-label="Saved drawings"><strong>Saved drawings</strong><label>Choose drawing<select data-library="saved" aria-label="Saved drawings"><option value="">Choose saved drawing…</option></select></label><label>Name<input data-library="name" type="text" maxlength="80" aria-label="Drawing name" placeholder="Untitled drawing"></label><div class="notes-library-actions"><button type="button" data-library-action="save" disabled title="Update the selected saved drawing">Save</button><button type="button" data-library-action="save-as" title="Create a separate saved drawing">Save as new</button><button type="button" data-library-action="reload" disabled title="Reload the selected saved drawing, keeping a recovery copy of canvas changes">Reload saved</button><button type="button" data-library-action="import">Load drawing file</button><button type="button" data-library-action="backup">Download editable file</button><button type="button" data-library-action="png">Export PNG</button></div><input data-library="file" type="file" accept=".notes.json,application/json" hidden><output data-library="status" role="status" aria-live="polite">Checking saved drawings…</output></section>
    <label class="notes-clipped-toggle"><input type="checkbox" data-field="clipped" checked aria-keyshortcuts="Shift+C"><span>Show clipped art</span><kbd aria-hidden="true">Shift+C</kbd></label>
    <div class="notes-top-row"><label class="notes-scale"><input type="checkbox" data-field="scale" checked>Scale strokes</label><div class="notes-align" role="group" aria-label="Align selection">${ALIGNMENTS.map(([id, label, path]) => `<button type="button" data-action="align-${id}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg></button>`).join('')}</div></div>
    <fieldset class="notes-snaps"><legend><label><input type="checkbox" data-snap="enabled" checked aria-keyshortcuts="Shift+Q">Snaps</label></legend><div>${[['pane', 'Pane'], ['anchors', 'Anchors'], ['centers', 'Centers'], ['intersects', 'Intersects']].map(([id, label]) => `<label><input type="checkbox" data-snap="${id}" checked>${label}</label>`).join('')}</div></fieldset>
    <div class="notes-select-row"><button class="notes-select-tool" type="button" data-tool="select" title="Select (V)" aria-keyshortcuts="V" aria-pressed="false">${toolIcon(SELECT_TOOL)}<span>Select</span><kbd>V</kbd></button></div>
    <button type="button" class="notes-tools-disclosure" data-action="tools-picker" aria-controls="notes-drawing-tool-grid" aria-expanded="false" title="Show drawing tools">Draw tools <span aria-hidden="true">▾</span></button>
    <div class="notes-tool-grid" id="notes-drawing-tool-grid" role="group" aria-label="Drawing mode">${DRAWING_TOOLS.map(t => `<button type="button" data-tool="${t.id}" title="${t.label} (${t.key})" aria-keyshortcuts="${t.key}" aria-pressed="${t.id === 'pencil'}">${toolIcon(t)}<span>${t.label}</span><kbd>${t.key}</kbd></button>`).join('')}</div>
    ${slider('weight', 'Stroke weight', .5, 100, .1, 6)}
    <div class="notes-color-target" role="group" aria-label="Apply color to"><button type="button" data-color-target="fill" data-sample="fill" aria-label="Fill color" title="Fill (F)" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="notes-color-outline" d="M3 3H21V21H3Z"/><path class="notes-color-slash" d="M3 21L21 3"/></svg></button><button type="button" data-color-target="stroke" data-sample="stroke" aria-label="Stroke color" title="Stroke (X)" aria-pressed="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="notes-color-outline" d="M3 3H21V21H3Z"/><path class="notes-color-slash" d="M3 21L21 3"/></svg></button></div>
    <div class="notes-palette" role="group" aria-label="Color palette"><button type="button" class="notes-no-color" data-color="none" aria-label="No color" title="No color" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20L20 4"/></svg></button>${PALETTE.map(([name, color]) => `<button type="button" data-color="${color}" title="${name}" aria-label="${name}" aria-pressed="false" style="--swatch:${color}"></button>`).join('')}</div>
    ${slider('sides', 'Sides', 3, 24, 1, 3)}${slider('depth', 'Depth', 0, 100, 1, 50)}${slider('smoothing', 'Smoothing', 0, 100, 1, 45)}
    <section class="notes-object-controls" data-context-special="pacman" aria-label="Pacman controls" hidden><h3>Pacman</h3><div class="notes-special-fields"><label><span>Opening angle</span><div><input data-field="opening" aria-label="Pacman opening angle" type="number" min="0" max="360" step="1"><span>°</span></div></label><label><span>Slice angle</span><div><input data-field="slice" aria-label="Pacman slice angle" type="number" min="0" max="360" step="1"><span>°</span></div></label></div><div class="notes-slice-presets" role="group" aria-label="Slice angle presets">${[45,90,180,270].map(angle=>`<button type="button" data-slice="${angle}" title="Set filled slice to ${angle} degrees">${angle}°</button>`).join('')}</div></section>
    <div class="notes-dimensions"><label><span>Width</span><input data-field="width" aria-label="Object width" type="number" min="4" max="3000" step="1" value="0" disabled></label><label><span>Height</span><input data-field="height" aria-label="Object height" type="number" min="4" max="3000" step="1" value="0" disabled></label></div>
    <div class="notes-rotation-row"><label class="notes-rotation"><span>Rotation</span><div><input data-field="angle" aria-label="Rotation degrees" type="number" min="-360" max="360" step="5" value="0"><span aria-hidden="true">°</span></div></label><button type="button" data-action="smart-rotate" aria-pressed="false" aria-keyshortcuts="Shift+T" title="Smart rotate (Shift+T). Click to place a pivot; drag to rotate. Shift locks angles when enabled.">${toolIcon(ACTION_TOOLS.rotate)}<span>Smart rotate</span></button></div>
    <div class="notes-mode-actions"><button type="button" data-action="shape-edit" title="Shape edit mode (A). Double-click an edge to add an anchor; double-click an anchor to toggle its curve handles." aria-keyshortcuts="A" aria-pressed="false">Shape edit mode</button><button type="button" data-action="layers" title="Layers (F7)" aria-keyshortcuts="F7" aria-pressed="false">Layers</button></div>
    <button type="button" class="notes-gear-toggle" data-action="gears" aria-pressed="false">Gear art<kbd>G</kbd></button><button type="button" class="notes-repeat" data-action="repeat" aria-keyshortcuts="Control+D Meta+D Shift+F4" title="Repeat action (Ctrl/Cmd+D or Shift+F4)">Repeat action<kbd>Ctrl+D</kbd></button><div class="notes-edit-actions"><button type="button" data-action="undo" title="Undo (Ctrl/Cmd+Z)">↶ Undo</button><button type="button" data-action="redo" title="Redo (Ctrl/Cmd+Shift+Z)">↷ Redo</button><button type="button" data-action="duplicate" title="Duplicate (Shift+D or Ctrl/Cmd+J)">Duplicate</button><button type="button" data-action="delete" title="Delete selection">Delete</button></div>
<output class="notes-status" role="status" aria-live="polite"></output>`;
  const toolStrip = document.createElement('div'); toolStrip.className = 'notes-tool-strip'; toolStrip.setAttribute('aria-label', 'Select and draw tools');
  const properties = document.createElement('div'); properties.className = 'notes-tool-properties';
  toolStrip.append(panel.querySelector('.notes-select-row'), panel.querySelector('.notes-tools-disclosure'), panel.querySelector('.notes-tool-grid'));
  properties.append(...panel.children);
  panel.append(toolStrip, properties);
  installShortcutLabels(panel);
  let doc, storageFailed = false, localUpdatedAt = 0, latestUpdatedAt = 0;
  try { doc = restoreDocument(JSON.parse(localStorage.getItem(STORAGE_KEY) || localStorage.getItem('site.about.notes.v1'))); }
  catch { doc = restoreDocument(null); storageFailed = true; }
  try { localUpdatedAt = Number(localStorage.getItem(STORAGE_TIME_KEY)) || 0; } catch { /* IndexedDB may still be available. */ }
  latestUpdatedAt = localUpdatedAt;
  const library = createDrawingLibrary();
  const downloads = createDownloadManager();
  const librarySelect = panel.querySelector('[data-library="saved"]');
  const libraryName = panel.querySelector('[data-library="name"]');
  const libraryStatus = panel.querySelector('[data-library="status"]');
  let selectedDrawingId = null, libraryReady = false, libraryBusy = false, savedBaseline = JSON.stringify(doc);
  let draftRevision = 0, savedDraftRevision = 0, draftTimer = 0, draftWrite = null, workingSaved = false;
  function libraryMessage(message, error = false) { libraryStatus.textContent = message; libraryStatus.dataset.error = String(error); }
  function libraryControls() {
    panel.querySelectorAll('[data-library-action]').forEach(button => {
      button.disabled = libraryBusy || ['save', 'reload', 'save-as', 'import'].includes(button.dataset.libraryAction) && !libraryReady ||
        ['save', 'reload'].includes(button.dataset.libraryAction) && !selectedDrawingId;
    });
    librarySelect.disabled = libraryBusy || !libraryReady;
    libraryName.disabled = libraryBusy;
  }
  async function refreshLibrary() {
    const entries = await library.list();
    if (disposed) return entries;
    librarySelect.replaceChildren(new Option('Choose saved drawing…', ''));
    entries.forEach(entry => librarySelect.add(new Option(entry.name, entry.id)));
    librarySelect.value = selectedDrawingId || '';
    libraryControls();
    return entries;
  }
  const workingInitialization = (async () => {
    let working = null, workingError = null;
    try { working = await library.getWorking(); }
    catch (error) { workingError = error; }
    let previous = null;
    if (!disposed) {
      latestUpdatedAt = Math.max(latestUpdatedAt, Number(working?.updatedAt) || 0);
      try { previous = localStorage.getItem(SELECTED_KEY); } catch { /* Working storage can retain the identity. */ }
      previous ||= working?.selectedDrawingId || null;
      if (!draftRevision && working?.document && working.updatedAt >= localUpdatedAt) {
        try {
          doc = restoreDocument(working.document);
          lastDrawn = doc.objects.at(-1)?.id;
          artwork.clear();
          workingSaved = true;
          previous = working.selectedDrawingId || null;
          libraryName.value = working.name || '';
          changed();
        } catch (error) { workingError = error; }
      }
      selectedDrawingId = previous;
      if (workingSaved && selectedDrawingId) {
        librarySelect.replaceChildren(new Option(working.name || 'Working drawing', selectedDrawingId));
        librarySelect.value = selectedDrawingId;
        libraryControls();
        libraryMessage('Working canvas restored; checking saved drawings…');
      }
    }
    return { previous, workingError };
  })();
  const libraryInitialization = (async () => {
    const { previous, workingError } = await workingInitialization;
    let entries = [], namedError = null;
    try { entries = await refreshLibrary(); libraryReady = true; }
    catch (error) { namedError = error; }
    if (!disposed) {
      try {
      const entry = entries.find(item => item.id === previous);
      if (entry) {
        const saved = await library.get(entry.id);
        if (disposed) return;
        if (saved) { selectedDrawingId = entry.id; libraryName.value ||= entry.name; savedBaseline = JSON.stringify(saved.document); librarySelect.value = entry.id; }
      }
      libraryControls();
      if (namedError || workingError) libraryMessage(namedError?.message || workingError?.message || 'Drawing storage is unavailable.', true);
      else libraryMessage(`${entries.length} saved drawing${entries.length === 1 ? '' : 's'} on this browser.`);
      } catch (error) { libraryMessage(error.message || 'Could not restore the working canvas.', true); }
    }
    if (draftRevision) scheduleDraftWrite();
  })();
  let isolation = null;
  let smart = null, lastDrawn = doc.objects.at(-1)?.id;
  const snaps = { enabled: true, pane: true, centers: true, anchors: true, intersects: true };
  try { const saved = JSON.parse(localStorage.getItem('site.about.notes.snaps')); for (const key of Object.keys(snaps)) if (typeof saved?.[key] === 'boolean') snaps[key] = saved[key]; } catch { /* Session defaults remain available. */ }
  let selection = new Set(), tool = 'pencil', colorTarget = 'stroke', scaleStrokes = true, shapeEdit = false, selectedAnchor = null;
  let showClippedArt = getSharedSettings().get().about?.notes?.showClippedArt !== false;
  panel.querySelector('[data-field="clipped"]').checked = showClippedArt;
  panel.querySelector('[data-field="clipped"]').closest('label').title = 'Show clipped art (Shift+C)';
  panel.querySelector('[data-snap="enabled"]').closest('label').title = 'Snaps (Shift+Q). Shift locks lines and rotations to 15 degrees.';
  function toggleClipped(value = !showClippedArt) {
    showClippedArt = value; panel.querySelector('[data-field="clipped"]').checked = value;
    getSharedSettings().patch({'about.notes.showClippedArt': value});
    changed();
  }
  let defaults = { stroke: PALETTE[2][1], fill: null, strokeWidth: 6, sides: 3, depth: .5, smoothing: .45 };
  let polygonSides = 3, starSides = 5;
  let gesture = null, fieldEdit = null, penDraft = null, lastPenEnd = null, hover = null;
  let repeatAction = null, notice = '', toolsPickerOpen = true;
  let undoStack = [], redoStack = [], unit = 18, contrast = .5, brightness = .5, disposed = false, layersOpen = layersInitiallyOpen;
  const input = new AbortController(), listeners = new Set();
  window.addEventListener('pagehide', () => { if (draftRevision > savedDraftRevision) void flushAutosave(); }, { signal: input.signal });
  const artwork = createArtworkCache(), clippedPaths = new WeakMap();
  let lastFlushMs = null, lastOutlineSegments = 0;
  const stopBudget = trackPerformanceBudget('Notes drawing budget', () => {
    let vertices = 0, handles = 0, pencil = 0;
    for (const shape of doc.objects) {
      if (shape.type === 'pencil') pencil += shape.points?.length || 0;
      else { const points = shape.anchors || shapeAnchors(shape); vertices += points.length;
        for (const p of points) for (const side of ['in', 'out']) if (p[side] && Math.hypot(p[side].x, p[side].y) > .001) handles++; }
    }
    const cache = artwork.stats, history = [...undoStack, ...redoStack].reduce((n, state) => n + state.doc.objects.reduce((m, shape) => m + (shape.points?.length || shape.anchors?.length || 4), 0), 0);
    return {'Objects (fixed cap)': `${doc.objects.length} / 300`, 'Visible objects': doc.objects.filter(s => nodeVisible(doc, s)).length,
      'Panes (fixed cap)': `${doc.layers.length} / 3`, 'Anchors / curve handles': `${vertices.toLocaleString()} / ${handles.toLocaleString()}`,
      'Pencil samples': pencil.toLocaleString(), 'Weighted geometry limit': 'Not calibrated',
      'Shape cache (RGBA estimate)': `${(cache.pixels * 4 / 1048576).toFixed(2)} / ${(cache.pixelBudget * 4 / 1048576).toFixed(2)} MiB`,
      'Composite (RGBA estimate)': `${(cache.compositePixels * 4 / 1048576).toFixed(2)} MiB`, 'Cached shapes': cache.entries,
      'Cache builds / reuse': `${cache.builds} / ${cache.hits}`, 'Clipped art segments (last)': `${lastOutlineSegments} / 6,000`,
      'Undo / redo entries': `${undoStack.length} / ${redoStack.length}`, 'History geometry estimate': history.toLocaleString(),
      'Last editor update (CPU)': lastFlushMs === null ? 'Awaiting edit with Debug open' : `${lastFlushMs.toFixed(2)} ms`};
  });
  function clippedPath(points) { let segments = clippedPaths.get(points); if (!segments) { segments = outsidePathSegments(points); clippedPaths.set(points, segments); } return segments; }
  let smartVisualCache = null;
  let paintFrame = 0, panelDirty = false, layersDirty = false;
  const layers = createLayersPanel({ getDocument: () => doc, getSelection: () => selection, getIsolation: () => isolation, onSelect: selectFromLayers, onAction: layerAction });
  const gears = createGearPanel({ getDocument: () => doc, editable: () => layerEditable(doc, doc.activeLayer), getStyle: () => defaults,
    getSnaps: () => snaps, onActivate() { onPanelRequest('gears'); finishPath(); smart = null; selectIds([]); changed(); },
    mutate(fn) { remember(); fn(); changed(true); }, repaint: () => changed(false, { panel: false, layers: false }),
    trace(points, setup, closed) {
      if (!layerEditable(doc, doc.activeLayer) || doc.objects.length >= 300 || !defaults.stroke) return false;
      remember(); const shape = newShape('pencil', points[0], points.at(-1)); shape.smoothing = 0; shape.fill = null;
      normalizePencil(shape, points); shape.name = `Gear ${setup.guide}${closed ? '' : ' partial'} ${doc.objects.filter(s => s.name.startsWith('Gear ')).length + 1}`;
      doc.objects.push(shape); lastDrawn = shape.id; selectIds([]); changed(true); return true;
    }
  });
  const editable = s => objectEditable(doc,s) && inIsolation(doc,s,isolation);
  const rootFor = s => isolationRoot(doc,s,isolation);
  const chosen = () => doc.objects.filter(s => selection.has(s.id) && editable(s));
  const single = () => chosen().length === 1 ? chosen()[0] : null;
  const snapshot = () => ({ doc: clone(doc), selection: [...selection], repeatAction: clone(repeatAction), selectedDrawingId, savedBaseline, drawingName: libraryName.value });
  const comparable = state => JSON.stringify(state.doc);
  function remember(before = snapshot()) {
    undoStack.push(before); redoStack = [];
    let count = undoStack.reduce((n, state) => n + state.doc.objects.reduce((m, s) => m + (s.points?.length || s.anchors?.length || 4), 0), 0);
    while (undoStack.length > 40 || count > 180000 && undoStack.length > 1) count -= undoStack.shift().doc.objects.reduce((n, s) => n + (s.points?.length || s.anchors?.length || 4), 0);
  }
  function save() {
    if (smart) smart.targets = null;
    const updatedAt = latestUpdatedAt = Math.max(Date.now(), latestUpdatedAt + 1);
    try {
      const serialized = JSON.stringify(doc);
      if (serialized.length > 3_000_000) throw new Error('Working drawing exceeds localStorage capacity.');
      localStorage.setItem(STORAGE_KEY, serialized);
      localStorage.setItem(STORAGE_TIME_KEY, String(updatedAt));
      localUpdatedAt = updatedAt; storageFailed = false;
    } catch { storageFailed = true; }
    draftRevision++;
    workingSaved = false;
    scheduleDraftWrite();
  }
  function scheduleDraftWrite() {
    if (draftTimer || disposed) return;
    draftTimer = setTimeout(() => { draftTimer = 0; void flushAutosave(); }, 120);
  }
  async function flushAutosave() {
    clearTimeout(draftTimer); draftTimer = 0;
    await workingInitialization;
    if (draftWrite) { await draftWrite; if (savedDraftRevision >= draftRevision) return true; }
    draftWrite = (async () => {
      while (savedDraftRevision < draftRevision) {
        const revision = draftRevision;
        const snapshot = { document: clone(doc), selectedDrawingId, name: libraryName.value,
          updatedAt: latestUpdatedAt };
        try {
          await library.putWorking(snapshot);
          savedDraftRevision = revision;
          workingSaved = savedDraftRevision === draftRevision;
        } catch (error) {
          workingSaved = false;
          if (!disposed) libraryMessage(error.message || 'Working canvas could not be saved on this device.', true);
          break;
        }
      }
    })();
    try { await draftWrite; } finally { draftWrite = null; if (!disposed) changed(); }
    return savedDraftRevision >= draftRevision;
  }
  function drawingName() { return libraryName.value.trim().slice(0, 80) || 'Untitled drawing'; }
  function persistDrawingIdentity() {
    draftRevision++; latestUpdatedAt = Math.max(Date.now(), latestUpdatedAt + 1); workingSaved = false; scheduleDraftWrite();
    try { if (selectedDrawingId) localStorage.setItem(SELECTED_KEY, selectedDrawingId); else localStorage.removeItem(SELECTED_KEY); return true; }
    catch { return false; }
  }
  async function saveDrawing(asNew = false) {
    await libraryInitialization;
    if (disposed) throw new Error('The drawing editor is closed.');
    if (!libraryReady) throw new Error('Saved drawing storage is unavailable. Download an editable file instead.');
    finishGesture(); finishPath();
    if (!asNew && !selectedDrawingId) throw new Error('Choose a saved drawing or use Save as new.');
    const record = await library.put({ id: asNew ? undefined : selectedDrawingId, name: drawingName(), document: clone(doc) });
    if (disposed) throw new Error('The drawing editor is closed.');
    selectedDrawingId = record.id; savedBaseline = JSON.stringify(record.document); libraryName.value = record.name;
    const identityPersisted = persistDrawingIdentity(); await refreshLibrary();
    if (disposed) throw new Error('The drawing editor is closed.');
    libraryMessage(`${asNew ? 'Saved new drawing' : 'Updated saved drawing'}: ${record.name}.${identityPersisted ? '' : ' Saving selection with the working canvas.'}`);
    return record;
  }
  async function loadDrawing(id) {
    await libraryInitialization;
    if (disposed) throw new Error('The drawing editor is closed.');
    if (!libraryReady) throw new Error('Saved drawing storage is unavailable.');
    if (!id) { librarySelect.value = selectedDrawingId || ''; return; }
    finishGesture(); finishPath();
    const before = JSON.stringify(doc);
    const record = await library.get(id);
    if (disposed) throw new Error('The drawing editor is closed.');
    if (JSON.stringify(doc) !== before) throw new Error('The canvas changed while loading. Choose the drawing again.');
    if (!record) throw new Error('That saved drawing is no longer available.');
    const next = restoreDocument(record.document);
    const needsRecovery = JSON.stringify(restoreDocument(doc)) !== savedBaseline || !selectedDrawingId && doc.objects.length > 0;
    if (needsRecovery) {
      const recoveryName = `${libraryName.value.trim() || 'Working canvas'} recovery`.slice(0, 80);
      await library.put({ name: recoveryName, document: clone(doc) });
      if (disposed) throw new Error('The drawing editor is closed.');
      if (JSON.stringify(doc) !== before) throw new Error('The canvas changed while loading. A recovery copy was saved; choose the drawing again.');
    }
    remember(); doc = next; selection.clear(); isolation = null; smart = null; gesture = null; fieldEdit = null;
    penDraft = null; lastPenEnd = null; selectedAnchor = null; hover = null; repeatAction = null;
    shapeEdit = false; tool = 'select'; gears.reset(); gears.close();
    lastDrawn = doc.objects.at(-1)?.id; artwork.clear();
    selectedDrawingId = record.id; savedBaseline = JSON.stringify(doc); libraryName.value = record.name;
    const identityPersisted = persistDrawingIdentity(); changed(true); await refreshLibrary();
    if (disposed) throw new Error('The drawing editor is closed.');
    libraryMessage(`Loaded ${record.name}.${needsRecovery ? ' Previous canvas saved as a recovery drawing.' : ' Previous canvas is available with Undo.'}${identityPersisted ? '' : ' Saving selection with the working canvas.'}`);
    return record;
  }
  async function importDrawing(file) {
    const parsed = await parseDrawingFile(file);
    await libraryInitialization;
    if (disposed) throw new Error('The drawing editor is closed.');
    if (!libraryReady) throw new Error('Saved drawing storage is unavailable.');
    const record = await library.put(parsed);
    if (disposed) throw new Error('The drawing editor is closed.');
    await refreshLibrary();
    if (disposed) throw new Error('The drawing editor is closed.');
    await loadDrawing(record.id);
    libraryMessage(`Imported and loaded ${record.name}.`);
    return record;
  }
  async function exportPngBlob() { finishGesture(); finishPath(); return renderDrawingPng(doc, artwork, contrast, brightness); }
  function downloadEditable() {
    finishGesture(); finishPath();
    const name = drawingName();
    downloads.download(new Blob([JSON.stringify(drawingFile(name, doc), null, 2)], { type: 'application/json' }), fileName(name, 'notes.json'));
    libraryMessage(`Downloaded editable drawing: ${name}.`);
  }
  async function runLibraryTask(task) {
    if (libraryBusy || disposed) return;
    libraryBusy = true; libraryControls();
    try { await task(); } catch (error) { if (!disposed) { librarySelect.value = selectedDrawingId || ''; libraryMessage(error.message || 'Drawing action failed.', true); } }
    finally { libraryBusy = false; if (!disposed) libraryControls(); }
  }
  function flush() {
    if (!paintFrame || disposed) return;
    cancelAnimationFrame(paintFrame); paintFrame = 0;
    const timed = isPerformanceSamplingActive(), start = timed ? performance.now() : 0;
    artwork.prune(doc.objects); render();
    if (panelDirty) syncPanel(); if (layersDirty) layers.update(); gears.update();
    panelDirty = layersDirty = false; if (timed) lastFlushMs = performance.now() - start; onChange(); listeners.forEach(fn => fn());
  }
  function changed(persist = false, { panel: updatePanel = true, layers: updateLayers = true } = {}) {
    if (disposed) return; smartVisualCache = null;
    if(isolation && !doc.groups.some(g=>g.id===isolation))isolation=null;
    selection = new Set([...selection].filter(id => doc.objects.some(s => s.id === id && editable(s))));
    if (smart && !chosen().length) smart = null;
    if (selection.size !== 1 || single()?.type === 'pencil') shapeEdit = false;
    if (persist) save();
    panelDirty ||= updatePanel; layersDirty ||= updateLayers;
    if (!paintFrame) paintFrame = requestAnimationFrame(flush);
  }
  function selectIds(ids, toggle = false) {
    if (!toggle) selection = new Set(ids); else ids.forEach(id => selection.has(id) ? selection.delete(id) : selection.add(id));
    selectedAnchor = null; const s = single(); if (s) defaults = { ...defaults, stroke: s.stroke, fill: s.fill, strokeWidth: s.strokeWidth };
  }
  function selectFromLayers(ids, toggle) { if(isolation && ids.some(id=>!inIsolation(doc,doc.objects.find(s=>s.id===id),isolation))) { isolation=null; } finishGesture(); finishPath(); gears.close(); smart = null; const layer = doc.objects.find(s => ids.includes(s.id))?.layerId; if (layer && !toggle) doc.activeLayer = layer; tool = 'select'; selectIds(ids, toggle); changed(true); }
  function setTool(value) { finishGesture(); finishPath(); smart = null; tool = value; gears.close(); if (value !== 'select') selectIds([]); shapeEdit = false; selectedAnchor = null; changed(); }
  function commitField(cancel = false) {
    if (!fieldEdit) return; const before = fieldEdit; fieldEdit = null;
    if (cancel) { doc = before.doc; selection = new Set(before.selection); }
    else {
      recoverOffPane(doc, before.doc.objects.filter(s => selection.has(s.id)), selection).forEach(s => artwork.invalidate(s));
      if (comparable(before) !== JSON.stringify(doc)) {
        const originals = before.doc.objects.filter(s => selection.has(s.id)), now = chosen();
        if (originals.length && now.length && ['width', 'height', 'angle'].includes(before.field)) {
          const original = originals.length === 1 ? originals[0] : boundsOf(originals), next = selectionFrame();
          if (before.field === 'angle') repeatAction = { kind: 'rotate', angle: now[0].rotation - originals[0].rotation, pivot: { x: (smart?.pivot || original).x, y: (smart?.pivot || original).y }, copy: false };
          else repeatAction = { kind: 'resize', handle: before.field === 'width' ? 5 : 6, sx: next.width / original.width, sy: next.height / original.height, proportional: originals.length > 1, opposite: false, scaleStrokes, copy: false };
        }
        remember(before); save();
      }
    }
  }
  function applyProperty(field, value) {
    if(field==='opening'||field==='slice'){value=clamp(value,0,360);return applyProperty('depth',field==='opening'?value/3.6:100-value/3.6);}
    const shapes = chosen();
    if (field === 'width' || field === 'height') {
      if (!shapes.length) return;
      const originals = fieldEdit.doc.objects.filter(s => selection.has(s.id));
      dimensionShapes(originals, field, value, scaleStrokes).forEach(next => { const s = shapes.find(s => s.id === next.id); artwork.invalidate(s); Object.assign(s, next); });
      return;
    }
    if (field === 'angle') {
      if (!shapes.length) return;
      const before = fieldEdit.doc.objects.filter(s => selection.has(s.id)), center = smart?.pivot || (before.length === 1 ? before[0] : boundsOf(before)), delta = value * Math.PI / 180 - (before.length === 1 ? before[0].rotation : 0);
      rotateShapesAround(before, center, delta).forEach(next => Object.assign(shapes.find(s => s.id === next.id), next)); return;
    }
    const key = field === 'weight' ? 'strokeWidth' : field, amount = ['depth', 'smoothing'].includes(field) ? value / 100 : value;
    defaults[key] = amount;
    if (field === 'sides') { if (tool === 'star') starSides = amount; else polygonSides = amount; }
    shapes.forEach(s => {
      if (field === 'sides' && !['polygon', 'star'].includes(s.type) || field === 'depth' && !['star', 'heart', 'arc', 'torus', 'pacman'].includes(s.type) || field === 'smoothing' && s.type !== 'pencil') return;
      artwork.invalidate(s); s[key] = amount; if (field === 'sides') { if (s.type === 'star') starSides = amount; else polygonSides = amount; } if (['sides', 'depth'].includes(field)) delete s.anchors;
    });
  }
  function colorTo(value) {
    finishGesture(); const shapes = chosen(); if (shapes.length) remember(); defaults[colorTarget] = value;
    shapes.forEach(s => { if (colorTarget === 'stroke' || isClosed(s)) { artwork.invalidate(s); s[colorTarget] = value; } }); changed(Boolean(shapes.length));
  }
  function lastTarget() { return doc.objects.find(s => s.id === lastDrawn && s.layerId === doc.activeLayer && editable(s)) || [...doc.objects].reverse().find(s => s.layerId === doc.activeLayer && editable(s)); }
  function toggleSnap(key, value = !snaps[key]) {
    snaps[key] = value;
    if (smart) smart.targets = null;
    if (gesture?.kind === 'move') {
      const sources = new Set(gesture.sourceIds);
      gesture.snapIndex = moveSnapIndex({ ...doc, objects: doc.objects.filter(s => !sources.has(s.id)) }, gesture.originals, gesture.snapFrame, snaps);
      gesture.snap = null; gesture.snapPaths = [];
    }
    if (gesture && ['anchor', 'endpoint'].includes(gesture.kind)) {
      gesture.targets = dragSnapTargets(gesture);
      gesture.snapPaths = [];
    }
    try { localStorage.setItem('site.about.notes.snaps', JSON.stringify(snaps)); } catch { /* Session settings still apply. */ }
    changed();
  }
  const lockAngles = event => Boolean(event.shiftKey && snaps.enabled);
  function dragSnapTargets(g) {
    const original = g.kind === 'anchor' ? g.original : g.originals?.find(s => s.id === g.id);
    if (!original) return [];
    const targets = rotationTargets({ ...doc, objects: doc.objects.filter(s => s.id !== g.id) }, snaps);
    if (snaps.enabled && snaps.centers) targets.push({ x: original.x, y: original.y, kind: 'center', objectId: original.id });
    if (snaps.enabled && snaps.anchors && g.kind === 'anchor') shapeAnchors(original).forEach((a, i) => {
      if (i !== g.index) { const point = toWorld(a, original); targets.push({ ...point, kind: 'anchor', objectId: original.id }); }
    });
    return targets;
  }
  function dragSnap(g, point, lockedFrom = null) {
    let candidates = g.targets || [];
    if (lockedFrom) {
      const ray = subtract(point, lockedFrom), length2 = ray.x * ray.x + ray.y * ray.y;
      const nearby = [];
      if (length2) for (const target of candidates) {
        if (distance(target, point) > unit * 1.1) continue;
        const offset = subtract(target, lockedFrom), t = (offset.x * ray.x + offset.y * ray.y) / length2;
        const projection = add(lockedFrom, multiply(ray, t));
        if (t >= 0 && distance(target, projection) < 1) nearby.push({ ...projection, label: target.label, kind: target.kind });
      }
      candidates = nearby;
    }
    const target = snaps.enabled ? nearestRotationTarget(point, candidates, unit * 1.1) : null;
    const snapped = target;
    g.snapPaths = snapped ? moveSnapPaths({ x: { source: point, target: snapped }, y: { source: point, target: snapped }, delta: subtract(snapped, point) }, unit) : [];
    return snapped || point;
  }
  function applyObjects(next, geometry = false) {
    next.forEach(value => { const current = doc.objects.find(s => s.id === value.id); if (geometry) artwork.invalidate(current); if (!value.anchors) delete current.anchors; Object.assign(current, value); });
  }
  function copyGesture(g, event) {
    g.copyRequested ||= Boolean(event.altKey);
    if (!g.copyRequested || g.copyStarted) return true;
    if (doc.objects.length + g.originals.length > 300) { notice = 'Copy unavailable: 300 object limit.'; changed(); return false; }
    applyObjects(g.originals, true);
    selection = duplicateSelection(doc, selection, { x: 0, y: 0 }, isolation);
    g.originals = clone(chosen()); g.id = g.originals.length === 1 ? g.originals[0].id : undefined; g.copyStarted = true;
    return true;
  }
  function recordTransform(g) {
    const now = chosen(), before = g.originals;
    if (!now.length || !before?.length) return;
    const copy = Boolean(g.copyStarted), frame = now.length === 1 ? now[0] : boundsOf(now);
    if (g.kind === 'move') repeatAction = { kind: 'move', delta: subtract(now[0], before[0]), copy };
    if (g.kind === 'rotate' || g.kind === 'smart-rotate') repeatAction = { kind: 'rotate', angle: now[0].rotation - before[0].rotation, pivot: { x: (g.pivot || g.original).x, y: (g.pivot || g.original).y }, copy };
    if (g.kind === 'resize') repeatAction = { kind: 'resize', handle: g.handle, sx: frame.width / g.original.width, sy: frame.height / g.original.height, proportional: g.proportional, opposite: g.opposite, scaleStrokes, copy };
  }
  function cursor() {
    if (smart) return toolCursor(smartVisuals().candidate && !gesture ? 'pivot' : 'rotate', defaults[colorTarget]);
    if (gears.open) return gears.cursor === 'blocked' ? 'not-allowed' : toolCursor(gears.cursor === 'trace' ? 'gear' : gears.cursor === 'place' ? 'move' : 'select', defaults[colorTarget]);
    if (gesture?.kind === 'move') return toolCursor('move', defaults[colorTarget]);
    if (gesture?.kind === 'rotate') return toolCursor('rotate', defaults[colorTarget]);
    if (gesture?.kind === 'resize') {
      const [x, y] = RESIZE_HANDLES[gesture.handle], angle = Math.atan2(y, x) + gesture.original.rotation;
      return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][(Math.round(angle / (Math.PI / 4)) % 4 + 4) % 4];
    }
    return toolCursor(tool, defaults[colorTarget]);
  }
  function smartVisuals() {
    if (!smart) return { paths: [] };
    if (smartVisualCache) return smartVisualCache;
    const targets = gesture?.kind === 'smart-rotate' ? gesture.targets : (smart.targets ||= rotationTargets(doc, snaps));
    const result = rotationPaths(chosen(), smart.pivot, unit, hover, targets, gesture?.kind === 'smart-rotate' && gesture.moved ? gesture : null);
    return smartVisualCache = { ...result, paths: [...chosen().map(s => ({ color: '#baf9f2', points: flattenShape(s) })), ...result.paths] };
  }
  function syncPanel() {
    const shapes = chosen(), shape = single(), current = shapes[0] || defaults, editable = layerEditable(doc, doc.activeLayer);
    panel.querySelectorAll('[data-tool]').forEach(el => el.setAttribute('aria-pressed', String(!gears.open && !smart && el.dataset.tool === tool)));
    const fillOK = !gears.open && (shapes.length ? shapes.some(isClosed) : !['pencil', 'line', 'path'].includes(tool));
    if (!fillOK && colorTarget === 'fill') colorTarget = 'stroke';
    panel.querySelectorAll('[data-color-target]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.colorTarget === colorTarget)));
    panel.querySelector('[data-color-target="fill"]').disabled = !fillOK;
    panel.querySelector('[data-color-target="fill"]').title = fillOK ? 'Fill (F)' : 'Fill is unavailable for open paths';
    for (const name of ['stroke', 'fill']) {
      const sample = panel.querySelector(`[data-sample="${name}"]`);
      sample.style.backgroundColor = name === 'fill' ? current.fill || '#172932' : '#172932';
      sample.querySelector('.notes-color-outline').style.stroke = name === 'stroke' ? current.stroke || '#b8cbd0' : 'transparent';
      sample.querySelector('.notes-color-slash').style.stroke = current[name] ? 'transparent' : '#f0acac';
    }
    const activeSwatch = panel.querySelector(`[data-color-target="${colorTarget}"]`);
    if (activeSwatch !== activeSwatch.parentElement.lastElementChild) activeSwatch.parentElement.append(activeSwatch);
    panel.querySelectorAll('[data-color]').forEach(el => { el.setAttribute('aria-pressed', String((current[colorTarget] || 'none') === el.dataset.color)); el.disabled = !editable && !shapes.length; });
    const properties = {
      weight: { value: current.strokeWidth, enabled: shapes.length ? shapes.some(s => s.stroke) : Boolean(defaults.stroke) && editable },
      sides: { value: shapes.find(s => ['polygon', 'star'].includes(s.type))?.sides ?? (tool === 'star' ? starSides : polygonSides), enabled: !gears.open && (shapes.length ? shapes.some(s => ['polygon', 'star'].includes(s.type)) : ['polygon', 'star'].includes(tool) && editable) },
      depth: { value: Math.round((shapes.find(s => ['heart', 'star', 'arc', 'torus', 'pacman'].includes(s.type)) || defaults).depth * 100), enabled: !gears.open && (shapes.length ? shapes.some(s => ['heart', 'star', 'arc', 'torus', 'pacman'].includes(s.type)) : ['heart', 'star', 'arc', 'torus', 'pacman'].includes(tool) && editable) },
      smoothing: { value: Math.round((shapes.find(s => s.type === 'pencil') || defaults).smoothing * 100), enabled: !gears.open && (shapes.length ? shapes.some(s => s.type === 'pencil') : tool === 'pencil' && editable) }
    };
    for (const [field, data] of Object.entries(properties)) {
      const el = panel.querySelector(`[data-field="${field}"]`); el.disabled = !data.enabled; if (document.activeElement !== el) el.value = data.value;
      panel.querySelector(`[data-output="${field}"]`).textContent = Math.round(data.value * 10) / 10; el.closest('label').classList.toggle('is-disabled', !data.enabled);
    }
    const angle = panel.querySelector('[data-field="angle"]'); angle.disabled = !shapes.length; if (document.activeElement !== angle) angle.value = shape ? Math.round(shape.rotation * 180 / Math.PI) : 0;
    angle.closest('label').classList.toggle('is-disabled', !shapes.length);
    const frame = shapes.length ? selectionFrame() : null;
    for (const field of ['width', 'height']) {
      const el = panel.querySelector(`[data-field="${field}"]`); el.disabled = !frame;
      if (document.activeElement !== el) el.value = frame ? Math.round(frame[field] * 10) / 10 : '';
      el.closest('label').classList.toggle('is-disabled', !frame);
    }
    const edit = panel.querySelector('[data-action="shape-edit"]'); edit.disabled = !shape || shape.type === 'pencil'; edit.setAttribute('aria-pressed', String(shapeEdit && !edit.disabled));
    panel.querySelector('[data-action="layers"]').setAttribute('aria-pressed', String(layersOpen));
    panel.querySelector('[data-action="gears"]').setAttribute('aria-pressed', String(gears.open));
    for (const name of ['duplicate', 'delete']) panel.querySelector(`[data-action="${name}"]`).disabled = !shapes.length;
    panel.querySelector('[data-action="duplicate"]').disabled ||= doc.objects.length + shapes.length > 300;
    panel.querySelector('[data-action="repeat"]').disabled = !repeatAction || !shapes.length || repeatAction.copy && doc.objects.length + shapes.length > 300;
    panel.querySelectorAll('.notes-align button').forEach(button => { button.disabled = !shapes.length; });
    panel.querySelector('[data-action="undo"]').disabled = !undoStack.length; panel.querySelector('[data-action="redo"]').disabled = !redoStack.length;

    const selected=shapes.length>0,drawing=!selected&&!gears.open&&tool!=='select';
    const kinds=new Set(shapes.map(s=>s.type)),kind=selected?(kinds.size===1?shapes[0].type:null):tool;
    const roots=selected?selectionRoots(doc,selection,isolation):[];
    const title=selected?(roots.length===1?roots[0].name:`${shapes.length} objects`):gears.open?'Gear art':drawing?'Drawing':'Select';
    const detail=selected?(roots.length===1&&roots[0].kind==='group'?`Group · ${shapes.length} objects`:kinds.size>1?'Mixed selection':DRAWING_TOOLS.find(t=>t.id===kind)?.label||'Path'):drawing?DRAWING_TOOLS.find(t=>t.id===tool)?.label||'Pen':' '; 
    const text=(selector,value)=>{const node=panel.querySelector(selector);if(node.textContent!==value)node.textContent=value;};
    const hide=(selector,value)=>{const node=panel.querySelector(selector);if(node.hidden!==value)node.hidden=value;};
    const mode=selected?'selection':gears.open?'gear':'drawing';if(panel.dataset.context!==mode)panel.dataset.context=mode;
    text('[data-context-title]',title||'Selection');text('[data-context-detail]',detail);
    panel.querySelector('[data-action="tools-picker"]').setAttribute('aria-expanded',String(toolsPickerOpen));
    text('[data-action="tools-picker"] span',toolsPickerOpen?'▴':'▾');
    panel.querySelector('[data-action="tools-picker"]').title=toolsPickerOpen?'Hide drawing tools':'Show drawing tools';
    hide('.notes-tool-grid',!toolsPickerOpen);
    hide('.notes-align',!selected);
    hide('.notes-dimensions',!selected);
    hide('.notes-rotation',!selected);
    hide('.notes-rotation-row',!selected&&!lastTarget());
    hide('[data-action="shape-edit"]',!shape||shape.type==='pencil');
    hide('[data-action="repeat"]',!selected);
    hide('.notes-color-target',!selected&&!drawing&&!gears.open);
    hide('.notes-palette',!selected&&!drawing&&!gears.open);
    hide('[data-range="weight"]',!properties.weight.enabled||!selected&&!drawing&&!gears.open);
    for(const field of ['sides','depth','smoothing'])hide(`[data-range="${field}"]`,!properties[field].enabled);
    const depthName={star:'Point depth',heart:'Cleft depth',arc:'Thickness',torus:'Ring thickness',pacman:'Wedge opening'}[kind]||'Depth';
    text('[data-range="depth"] > span',depthName);
    panel.querySelector('[data-field="depth"]').setAttribute('aria-label',depthName);
    panel.querySelector('[data-field="depth"]').title=`${depthName} (B; use arrow keys)`;
    const pacman=kind==='pacman'&&!gears.open&&(selected||drawing),depth=current.depth??.5;
    hide('[data-context-special="pacman"]',!pacman);
    for(const [field,value]of [['opening',depth*360],['slice',(1-depth)*360]]){
      const control=panel.querySelector(`[data-field="${field}"]`);control.disabled=!pacman;
      if(document.activeElement!==control)control.value=Math.round(value*10)/10;
      control.title=`${field==='opening'?'Opening':'Filled slice'} angle, in degrees`;
    }
    panel.querySelectorAll('[data-slice]').forEach(button=>{button.disabled=!pacman;button.setAttribute('aria-pressed',String(pacman&&Math.abs((1-depth)*360-Number(button.dataset.slice))<.1));});
    panel.querySelector('.notes-status').textContent = `${shapes.length} selected. ${doc.objects.length} objects. ${!storageFailed || workingSaved ? 'Saved locally.' : draftRevision > savedDraftRevision && libraryReady ? 'Saving locally…' : 'Session only. Device storage unavailable.'}${isolation ? ` Editing ${doc.groups.find(g=>g.id===isolation)?.name}. Double-click empty glass or press Escape to leave.` : ''}${notice ? ` ${notice}` : ''}`;
    const smartButton = panel.querySelector('[data-action="smart-rotate"]'); smartButton.disabled = !shapes.length && !lastTarget(); smartButton.setAttribute('aria-pressed', String(Boolean(smart)));
    panel.querySelectorAll('[data-snap]').forEach(el => { el.checked = snaps[el.dataset.snap]; el.disabled = el.dataset.snap !== 'enabled' && !snaps.enabled; });
    canvas.style.cursor = cursor();
  }
  function action(name) {
    finishGesture(); if (name !== 'undo' && name !== 'redo') finishPath(); notice = '';
    if(name==='tools-picker'){toolsPickerOpen=!toolsPickerOpen;changed();return;}
    if (name.startsWith('align-') || name === 'repeat') {
      if (!chosen().length || name === 'repeat' && !repeatAction) return;
      const before = snapshot(), operation = name === 'repeat' ? clone(repeatAction) : { kind: 'align', mode: name.slice(6), copy: false };
      if (operation.copy) {
        if (doc.objects.length + chosen().length > 300) return;
        selection = duplicateSelection(doc, selection, { x: 0, y: 0 }, isolation);
      }
      const originals = clone(chosen()), frame = selectionFrame();
      applyObjects(operation.kind === 'align' ? alignedObjects(doc, selection, operation.mode) : repeatedTransform(originals, frame, operation), operation.kind === 'resize');
      recoverOffPane(doc, originals, selection).forEach(s => artwork.invalidate(s));
      if (comparable(before) !== JSON.stringify(doc)) { repeatAction = operation; remember(before); save(); }
      if (operation.kind !== 'rotate') smart = null;
      gears.close(); tool = 'select'; changed(); return;
    }
    if (name === 'smart-rotate') {
      if (smart) { smart = null; changed(); return; }
      if (!chosen().length) { const target = lastTarget(); if (!target) return; selectIds(leaves(doc, rootFor(target)).map(s => s.id)); }
      gears.close(); tool = 'select'; shapeEdit = false; const frame = selectionFrame(); smart = { pivot: { x: frame.x, y: frame.y } }; changed(); return;
    }
    if (name === 'gears') { onPanelRequest('gears'); smart = null; gears.toggle(); if (gears.open) selectIds([]); changed(); return; }
    if (name === 'layers') { if (onPanelRequest('layers')) return; layersOpen = !layersOpen; changed(); return; }
    if (name === 'shape-edit') { smart = null; if (single()?.type !== 'pencil' && single()) { tool = 'select'; shapeEdit = !shapeEdit; selectedAnchor = null; changed(); } return; }
    if (name === 'undo' || name === 'redo') {
      penDraft = null; gears.reset(); const from = name === 'undo' ? undoStack : redoStack, to = name === 'undo' ? redoStack : undoStack;
      if (!from.length) return; to.push(snapshot()); const state = from.pop(); doc = state.doc; repeatAction = state.repeatAction || null; selection = new Set(tool === 'select' && !gears.open ? state.selection : []); selectedAnchor = null;
      selectedDrawingId = state.selectedDrawingId || null; savedBaseline = state.savedBaseline || JSON.stringify(doc); libraryName.value = state.drawingName || ''; librarySelect.value = selectedDrawingId || ''; persistDrawingIdentity(); changed(true); return;
    }
    if (name === 'group' || name === 'ungroup') { layerAction(name); return; }
    if (name === 'delete' && shapeEdit && single() && selectedAnchor !== null && single().type !== 'line') {
      const s = single(), points = shapeAnchors(s); if (points.filter(p=>(p.contour||0)===(points[selectedAnchor]?.contour||0)).length <= (isClosed(s) ? 3 : 2)) return;
      remember(); artwork.invalidate(s); points.splice(selectedAnchor, 1); s.anchors = points; if (s.type === 'polygon') s.sides = points.length; rebaseShape(s); selectedAnchor = null; changed(true); return;
    }
    if (name === 'duplicate' && chosen().length && doc.objects.length + chosen().length <= 300) { remember(); selection = duplicateSelection(doc, selection, undefined, isolation); repeatAction = { kind: 'move', delta: { x: 20, y: 20 }, copy: true }; tool = 'select'; }
    else if (name === 'delete' && chosen().length) { remember(); doc.objects = doc.objects.filter(s => !selection.has(s.id)); selection.clear(); pruneGroups(doc); }
    else if (name === 'clear' && layerEditable(doc, doc.activeLayer)) { remember(); doc.objects = doc.objects.filter(s => s.layerId !== doc.activeLayer); selection.clear(); pruneGroups(doc); }
    else return;
    changed(true);
  }
  function layerAction(name, payload = {}) {
    finishGesture(); finishPath();
    if (name === 'clear') { action('clear'); return; }
    if (name === 'close') { if (onPanelRequest('close-layers')) return; layersOpen = false; changed(); return; }
    if (name === 'activate') { if (!doc.layers.some(l => l.id === payload.id)) return; smart = null; doc.activeLayer = payload.id; isolation=null; selectIds([]); changed(true); return; }
    if (name === 'drop-nodes') {
      const next = clone(doc); if (!placeNodes(next, payload.ids, payload)) return;
      const moved = payload.ids.flatMap(id => { const group = doc.groups.find(g => g.id === id); return group ? leaves(doc, { ...group, kind: 'group' }).map(s => s.id) : [id]; });
      remember(); doc = next; selection = new Set(moved); doc.activeLayer = payload.layerId; smart = null; gears.close(); tool = 'select'; changed(true); return;
    }
    if (name === 'reorder-pane') {
      const next = [...doc.layers].reverse(), source = next.find(l => l.id === payload.id); if (!source || payload.beforeId === source.id) return;
      const others = next.filter(l => l !== source), index = payload.beforeId ? others.findIndex(l => l.id === payload.beforeId) : others.length; if (index < 0) return;
      others.splice(index, 0, source); if (others.every((l, i) => l === next[i])) return;
      remember(); doc.layers = others.reverse(); changed(true); return;
    }
    if (name === 'move-layer' && !layerEditable(doc, payload.id) || name === 'reorder' && !layerEditable(doc, payload.node?.layerId)) return;
    if (name === 'group' && !groupContext(doc, selection, isolation) || name === 'ungroup' && !selectionRoots(doc, selection).some(n => n.kind === 'group') || name === 'add' && doc.layers.length >= 3) return;
    remember(); const layer = doc.layers.find(l => l.id === payload.id);
    if (name === 'add') { const id = crypto.randomUUID(); doc.layers.push({ id, name: `Pane ${doc.layers.length + 1}`, visible: true, locked: false }); doc.activeLayer = id; selectIds([]); }
    else if (name === 'group') groupSelection(doc, selection, isolation);
    else if (name === 'ungroup') ungroupSelection(doc, selection, isolation);
    else if (name === 'visibility' && layer) layer.visible = !layer.visible;
    else if (name === 'node-visibility') {
      const item = (payload.kind === 'group' ? doc.groups : doc.objects).find(n => n.id === payload.id);
      if (item) item.visible = item.visible === false;
    }
    else if (name === 'lock' && layer) layer.locked = !layer.locked;
    else if (name === 'delete-layer' && layer && doc.layers.length > 1) {
      doc.objects = doc.objects.filter(s => s.layerId !== layer.id); doc.groups = doc.groups.filter(g => g.layerId !== layer.id); doc.layers = doc.layers.filter(l => l.id !== layer.id); doc.gears = (doc.gears || []).filter(s => s.layerId !== layer.id);
      if (doc.activeLayer === layer.id) doc.activeLayer = doc.layers[0].id;
    } else if (name === 'rename') {
      const item = (payload.kind === 'layer' ? doc.layers : payload.kind === 'group' ? doc.groups : doc.objects).find(n => n.id === payload.id); if (item) item.name = payload.name;
    } else if (name === 'reorder') reorderNode(doc, payload.node, payload.direction);
    else if (name === 'move-layer') { moveSelectionToLayer(doc, selection, payload.id); doc.activeLayer = payload.id; }
    changed(true);
  }
  panel.addEventListener('click', event => {
    const b = event.target.closest('button'); if (!b) return;
    if (b.dataset.libraryAction) {
      const choice = b.dataset.libraryAction;
      if (choice === 'import') panel.querySelector('[data-library="file"]').click();
      else runLibraryTask(async () => {
        if (choice === 'save') await saveDrawing();
        else if (choice === 'save-as') await saveDrawing(true);
        else if (choice === 'backup') downloadEditable();
        else if (choice === 'reload') await loadDrawing(selectedDrawingId);
        else if (choice === 'png') { const blob = await exportPngBlob(); if (disposed) return; downloads.download(blob, fileName(drawingName(), 'png')); libraryMessage(`Exported PNG: ${drawingName()}.`); }
      });
    }
    else if (b.dataset.tool) setTool(b.dataset.tool);
    else if(b.dataset.slice){if(!b.disabled){finishGesture();fieldEdit={...snapshot(),field:'slice'};applyProperty('slice',Number(b.dataset.slice));commitField();changed();}}
    else if (b.dataset.colorTarget) { colorTarget = b.dataset.colorTarget; changed(); }
    else if (b.dataset.color) colorTo(b.dataset.color === 'none' ? null : b.dataset.color);
    else if (b.dataset.action) action(b.dataset.action);
  }, { signal: input.signal });
  panel.addEventListener('input', event => {
    const field = event.target.dataset.field; if (!field || ['scale', 'clipped'].includes(field)) return;
    if (!fieldEdit) { finishGesture(); fieldEdit = { ...snapshot(), field }; }
    let value = Number(event.target.value); if (event.target.value === '' || !Number.isFinite(value)) return;
    if(['opening','slice'].includes(field)){value=clamp(value,0,360);if(Number(event.target.value)!==value)event.target.value=value;}
    applyProperty(field, value); changed();
  }, { signal: input.signal });
  panel.addEventListener('change', event => {
    if (event.target.dataset.library === 'saved') { runLibraryTask(() => loadDrawing(event.target.value)); return; }
    if (event.target.dataset.library === 'file') {
      const file = event.target.files?.[0]; event.target.value = '';
      if (file) runLibraryTask(() => importDrawing(file));
      return;
    }
    if (event.target.dataset.library === 'name') return;
    if (event.target.dataset.snap) toggleSnap(event.target.dataset.snap, event.target.checked); else if (event.target.dataset.field === 'scale') scaleStrokes = event.target.checked; else if (event.target.dataset.field === 'clipped') toggleClipped(event.target.checked); else { commitField(); changed(); }
  }, { signal: input.signal });
  panel.addEventListener('focusout', () => commitField(), { signal: input.signal });
  function hitTest(point) {
    for (const shape of orderedObjects(doc).reverse()) {
      if (!editable(shape)) continue;
      const p = toLocal(point, shape), path = makePath(shape); context.lineWidth = Math.max(shape.strokeWidth, unit * 2.2); context.lineCap = context.lineJoin = 'round';
      if (shape.stroke && context.isPointInStroke(path, p.x, p.y) || isClosed(shape) && context.isPointInPath(path, p.x, p.y)) return shape;
    }
    return null;
  }
  function selectionFrame() { const shapes = chosen(); return shapes.length === 1 ? shapes[0] : { ...boundsOf(shapes), type: 'rectangle' }; }
  function drawHandle(point, round = false, radius = .55) {
    context.beginPath(); if (round) context.arc(point.x, point.y, unit * radius, 0, Math.PI * 2); else context.rect(point.x - unit * radius, point.y - unit * radius, unit * radius * 2, unit * radius * 2);
    context.fillStyle = '#14242d'; context.fill(); context.stroke();
  }
  function drawAnchors(shape) {
    shapeAnchors(shape).forEach((a, index) => {
      const p = toWorld(a, shape);
      for (const which of ['in', 'out']) if (Math.hypot(a[which].x, a[which].y) > .5) {
        const end = toWorld(add(a, a[which]), shape); context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(end.x, end.y); context.stroke(); drawHandle(end, true, .38);
      }
      context.strokeStyle = index === selectedAnchor ? '#ffcba2' : '#e6f8ff'; drawHandle(p); context.strokeStyle = '#e6f8ff';
    });
  }
  function render() {
    context.clearRect(0, 0, SIZE, SIZE); context.save(); context.beginPath(); context.arc(SIZE / 2, SIZE / 2, RADIUS, 0, Math.PI * 2); context.clip(); context.lineCap = context.lineJoin = 'round';
    const visible = orderedObjects(doc).filter(s => nodeVisible(doc, s) && !(gesture?.kind === 'draw' && !gesture.started && gesture.id === s.id));
    artwork.compose(context, visible, contrast, brightness, isolation ? s=>inIsolation(doc,s,isolation) : null);
    const easedContrast = contrast * contrast * (3 - 2 * contrast);
    context.save(); context.globalAlpha = .65 + .35 * easedContrast;
    gears.render(context, unit);
    context.strokeStyle = '#e6f8ff'; context.lineWidth = unit * .14; const shape = single(), selected = chosen();
    if (!gears.open && !smart && tool === 'select' && selected.length && gesture?.kind !== 'endpoint') {
      if (shapeEdit && shape && shape.type !== 'pencil' && shape.type !== 'line') {
        context.save(); context.translate(shape.x, shape.y); context.rotate(shape.rotation); context.setLineDash([unit * .4, unit * .4]); context.stroke(makePath(shape)); context.restore(); drawAnchors(shape);
      } else {
        const frame = selectionFrame(), points = handles(frame, unit), isLine = frame.type === 'line'; context.setLineDash([unit * .6, unit * .4]); context.beginPath();
        if (isLine) { context.moveTo(points[0].x, points[0].y); context.lineTo(points[1].x, points[1].y); }
        else { context.moveTo(points[0].x, points[0].y); for (let i = 1; i < 4; i++) context.lineTo(points[i].x, points[i].y); context.closePath(); }
        context.stroke(); context.setLineDash([]); const stem = multiply(add(points[0], points[1]), .5), last = points.at(-1);
        context.beginPath(); context.moveTo(stem.x, stem.y); context.lineTo(last.x, last.y); context.stroke(); points.forEach((p, i) => drawHandle(p, i === points.length - 1));
      }
    }
    if (smart) {
      const visuals = smartVisuals(); context.setLineDash([]); context.lineWidth = unit * .18;
      for (const path of visuals.paths) { if (path.points.length < 2) continue; context.strokeStyle = path.color; context.beginPath(); path.points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.stroke(); }
      if (hover) {
        const text = gesture?.kind === 'smart-rotate' && gesture.moved ? `${Math.round((gesture.appliedDelta ?? gesture.delta) * 180 / Math.PI)}°` : visuals.candidate?.label;
        if (text) { context.font = `${unit}px system-ui`; context.fillStyle = '#ecfff9'; context.strokeStyle = '#11212b'; context.lineWidth = unit * .3; context.strokeText(text, hover.x + unit, hover.y - unit); context.fillText(text, hover.x + unit, hover.y - unit); }
      }
    }
    if (gesture?.snapPaths) {
      context.setLineDash([]); context.lineWidth = unit * .15;
      for (const path of gesture.snapPaths) { context.strokeStyle = path.color; context.beginPath(); path.points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.stroke(); }
    }
    if (penDraft) {
      const path = doc.objects.find(s => s.id === penDraft); if (path) {
        drawAnchors(path); if (hover) { const last = toWorld(path.anchors.at(-1), path); context.setLineDash([unit * .5, unit * .5]); context.beginPath(); context.moveTo(last.x, last.y); context.lineTo(hover.x, hover.y); context.stroke(); context.setLineDash([]); }
      }
    }
    if (gesture?.kind === 'marquee') {
      const a = gesture.start, b = gesture.current; context.fillStyle = '#8be9ef18'; context.setLineDash([unit * .6, unit * .4]); context.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); context.setLineDash([]);
    }
    context.restore(); context.restore();
  }
  function startPen(point) {
    if (lastPenEnd && performance.now() - lastPenEnd.time < 350 && distance(point, lastPenEnd.point) < unit) return true;
    let shape = doc.objects.find(s => s.id === penDraft); const before = snapshot();
    if (shape && shape.anchors.length >= 3 && distance(point, toWorld(shape.anchors[0], shape)) < unit * 1.4) { shape.closed = true; remember(before); finishPath(); changed(true); return true; }
    if (shape && shape.anchors.length >= 2 && distance(point, toWorld(shape.anchors.at(-1), shape)) < unit) { finishPath(); return true; }
    if (!shape) {
      if (doc.objects.length >= 300 || !layerEditable(doc, doc.activeLayer)) return false;
      shape = newShape('path', point, point); shape.anchors = []; shape.closed = false; doc.objects.push(shape); penDraft = shape.id;
    }
    if (shape.anchors.length >= 200) return false;
    const local = toLocal(point, shape); artwork.invalidate(shape); shape.anchors.push(anchor(local.x, local.y)); selectIds([shape.id]);
    gesture = { kind: 'pen-anchor', before, id: shape.id, index: shape.anchors.length - 1, start: point }; changed(); return true;
  }
  function finishPath(close = false) {
    if (!penDraft) return;
    const shape = doc.objects.find(s => s.id === penDraft); penDraft = null; hover = null;
    if (shape) {
      lastPenEnd = { point: toWorld(shape.anchors.at(-1), shape), time: performance.now() };
      if (close && shape.anchors.length >= 3) { remember(); shape.closed = true; }
      if (shape.anchors.length < 2) { doc.objects = doc.objects.filter(s => s.id !== shape.id); selection.delete(shape.id); }
      else { artwork.invalidate(shape); rebaseShape(shape); lastDrawn = shape.id; }
    }
    selectIds([]);
    changed(true);
  }
  function newShape(type, start, end, shift = false) {
    const shape = shapeFromDrag(type, start, end, { ...clone(defaults), sides: type === 'star' ? starSides : polygonSides }, shift); shape.name = `${ALL_TOOLS.find(t => t.id === type)?.label || 'Path'} ${doc.objects.filter(s => s.type === type).length + 1}`;
    shape.layerId = doc.activeLayer; shape.groupId = isolation; shape.order = Math.max(0, ...children(doc, doc.activeLayer, isolation).map(n => n.order)) + 1;
    return shape;
  }
  function pointerDown(point, event = {}) {
    commitField(); if (gesture || !point || !onGlass(point) && !gears.open && !smart && (tool !== 'select' || !showClippedArt)) return false; hover = point; notice = '';
    if (smart) { const targets = smart.targets ||= rotationTargets(doc, snaps); const candidate = nearestRotationTarget(point, targets, unit * (event.pointerType === 'touch' ? 2.5 : 1.4)); gesture = { kind: 'smart-rotate', before: snapshot(), originals: clone(chosen()), start: point, targets, previousAngle: Math.atan2(point.y - smart.pivot.y, point.x - smart.pivot.x), pivot: { ...smart.pivot }, candidate, moved: false, delta: 0, copyRequested: Boolean(event.altKey) }; changed(); event.preventDefault?.(); return true; }
    if (gears.open) { event.preventDefault?.(); return gears.pointerDown(point); }
    if (tool === 'path') { event.preventDefault?.(); return startPen(point); }
    const before = snapshot(), shapes = chosen(), shape = single(), tolerance = unit * (event.pointerType === 'touch' ? 2.5 : 1.4);
    if (tool !== 'select') {
      if (!layerEditable(doc, doc.activeLayer) || doc.objects.length >= 300) return false;
      const created = newShape(tool, point, point); if (tool === 'pencil') normalizePencil(created, [point]); doc.objects.push(created); selectIds([created.id]);
      gesture = { kind: 'draw', before, start: point, id: created.id, points: [point], original: clone(created), started: false, clientStart: Number.isFinite(event.clientX) ? { x: event.clientX, y: event.clientY } : null };
    } else {
      if (!event.shiftKey && shape && shapeEdit && !['pencil', 'line'].includes(shape.type)) {
        const anchors = shapeAnchors(shape); let hit = null;
        for (let i = 0; i < anchors.length; i++) {
          const a = anchors[i];
          for (const which of ['in', 'out']) if (Math.hypot(a[which].x, a[which].y) > .5 && distance(point, toWorld(add(a, a[which]), shape)) < tolerance) hit = { index: i, which };
          if (distance(point, toWorld(a, shape)) < tolerance) hit = { index: i, which: null };
        }
        if (hit) { shape.anchors = anchors; selectedAnchor = hit.index; gesture = { kind: hit.which ? 'control' : 'anchor', before, original: clone(shape), id: shape.id, ...hit, start: point }; }
      }
      if (!gesture && shapes.length && (!shapeEdit || shape?.type === 'line')) {
        const frame = selectionFrame(), points = handles(frame, unit); let index = -1, nearest = tolerance;
        points.forEach((p, i) => { const d = distance(p, point); if (d < nearest) { nearest = d; index = i; } });
        if (index !== -1) gesture = { kind: index === points.length - 1 ? 'rotate' : frame.type === 'line' ? 'endpoint' : 'resize', handle: index,
          before, original: clone(frame), originals: clone(shapes), start: point, id: shape?.id };
        if (gesture?.kind === 'resize') { const [x, y] = RESIZE_HANDLES[index]; gesture.resizeStart = toWorld({ x: x * frame.width / 2, y: y * frame.height / 2 }, frame); }
      }
      if (!gesture) {
        const hit = hitTest(point);
        if (hit) {
          const members = leaves(doc, rootFor(hit)).map(s => s.id);
          if (event.shiftKey) selectIds(members, true); else if (!selection.has(hit.id)) selectIds(members);
          if (!event.shiftKey) gesture = { kind: 'move', before, originals: clone(chosen()), start: point, original: boundsOf(chosen()) };
        } else {
          gesture = { kind: 'marquee', before, base: event.shiftKey ? [...selection] : [], start: point, current: point, toggle: Boolean(event.shiftKey) };
          if (!event.shiftKey) selectIds([]);
        }
      }
    }
    if (gesture && ['move', 'rotate', 'resize'].includes(gesture.kind)) {
      gesture.copyRequested = Boolean(event.altKey);
      if (gesture.kind === 'move') { gesture.snapFrame = clone(selectionFrame()); gesture.sourceIds = gesture.originals.map(s => s.id); gesture.snapIndex = moveSnapIndex(doc, gesture.originals, gesture.snapFrame, snaps); }
    }
    if (gesture && ['anchor', 'endpoint'].includes(gesture.kind)) gesture.targets = dragSnapTargets(gesture);
    changed(); event.preventDefault?.(); return true;
  }
  function pointerMove(point, event = {}) {
    if (!point) return; hover = point; if (gears.open) gears.setHover(point); if (gears.active) { gears.pointerMove(point); return; }
    if (!gesture) { if (penDraft || smart) changed(false, { panel: false, layers: false }); return; }
    const g = gesture, p = constrainPoint(point), shape = doc.objects.find(s => s.id === (g.id || single()?.id));
    if (g.kind === 'smart-rotate') {
      if (!g.moved && distance(g.start, point) <= unit * .75) return;
      const angle = Math.atan2(point.y - g.pivot.y, point.x - g.pivot.x);
      if (!g.moved && distance(g.start, g.pivot) < unit) { g.previousAngle = angle; g.moved = true; return; }
      g.delta += angleStep(g.previousAngle, angle); g.previousAngle = angle; g.moved = true;
      if (!copyGesture(g, event)) return;
      const base = g.originals.length === 1 ? g.originals[0].rotation : 0, delta = lockAngles(event) ? Math.round((base + g.delta) / (Math.PI / 12)) * Math.PI / 12 - base : g.delta;
      g.appliedDelta = delta; rotateShapesAround(g.originals, g.pivot, delta).forEach(next => Object.assign(doc.objects.find(s => s.id === next.id), next));
      changed(false, { layers: false }); return;
    }
    if (g.kind === 'draw' && !g.started) {
      const moved = g.clientStart && Number.isFinite(event.clientX) ? distance(g.clientStart, { x: event.clientX, y: event.clientY }) > 5 : distance(g.start, point) > unit * .75;
      if (!moved) return; g.started = true;
    }
    if (g.kind === 'marquee') {
      g.current = point; const rect = { left: Math.min(g.start.x, point.x), right: Math.max(g.start.x, point.x), top: Math.min(g.start.y, point.y), bottom: Math.max(g.start.y, point.y) };
      const hits = new Set(); doc.objects.filter(s => editable(s) && overlapsRect(s, rect)).forEach(s => leaves(doc, rootFor(s)).forEach(member => hits.add(member.id)));
      selection = new Set(g.base); hits.forEach(id => { if (g.toggle && selection.has(id)) selection.delete(id); else selection.add(id); });
    } else if (g.kind === 'draw') {
      if (shape.type === 'pencil') { if (g.points.length < 4000 && distance(p, g.points.at(-1)) > 1.5) { g.points.push(p); normalizePencil(shape, g.points); } }
      else Object.assign(shape, shapeFromDrag(shape.type, g.start, p, g.original, shape.type === 'line' ? lockAngles(event) : event.shiftKey));
    } else if (g.kind === 'pen-anchor') {
      const a = shape.anchors[g.index], delta = subtract(toLocal(p, shape), a); a.out = delta; a.in = multiply(delta, -1);
    } else if (g.kind === 'anchor' || g.kind === 'control') {
      const a = shape.anchors[g.index], q = toLocal(p, shape);
      if (g.kind === 'control' || event.altKey) { const which = g.which || 'out', d = subtract(q, a); a[which] = d; if (!event.altKey || g.kind === 'anchor') a[which === 'in' ? 'out' : 'in'] = multiply(d, -1); }
      else { const snapped = toLocal(dragSnap(g, p), shape); a.x = snapped.x; a.y = snapped.y; }
    } else if (g.kind === 'endpoint') {
      const other = toWorld(g.original.points[1 - g.handle], g.original), locked = lockAngles(event);
      const end = dragSnap(g, locked ? snapPoint(other, p) : p, locked ? other : null);
      shape.points[g.handle] = toLocal(end, shape);
    } else if (g.kind === 'move') {
      if (!g.transformMoved && distance(point, g.start) <= unit * .75) return;
      g.transformMoved = true; if (!copyGesture(g, event)) return;
      let delta = subtract(point, g.start);
      g.snap = snaps.enabled ? snappedMove(g.snapIndex, delta, unit * 1.1, g.snap) : null;
      if (g.snap) delta = g.snap.delta;
      g.snapPaths = moveSnapPaths(g.snap, unit);
      g.originals.forEach(base => Object.assign(doc.objects.find(s => s.id === base.id), add(base, delta)));
    } else if (g.kind === 'resize') {
      if (!g.transformMoved && distance(point, g.start) <= unit * .75) return;
      g.transformMoved = true; if (!copyGesture(g, event)) return;
      g.proportional = Boolean(event.shiftKey); g.opposite = Boolean(event.ctrlKey || event.metaKey);
      const target = add(g.resizeStart, subtract(point, g.start));
      resizeShapes(g.originals, g.original, g.handle, target, scaleStrokes, event.shiftKey, event.ctrlKey || event.metaKey)
        .forEach(next => { const current = doc.objects.find(s => s.id === next.id); if (!next.anchors) delete current.anchors; Object.assign(current, next); });
    } else if (g.kind === 'rotate') {
      if (!g.transformMoved && distance(point, g.start) <= unit * .75) return;
      g.transformMoved = true; if (!copyGesture(g, event)) return;
      let delta = Math.atan2(point.y - g.original.y, point.x - g.original.x) - Math.atan2(g.start.y - g.original.y, g.start.x - g.original.x);
      if (lockAngles(event)) delta = Math.round((g.original.rotation + delta) / (Math.PI / 12)) * Math.PI / 12 - g.original.rotation;
      g.originals.forEach(base => { const s = doc.objects.find(s => s.id === base.id); s.rotation = base.rotation + delta; Object.assign(s, add(g.original, rotate(subtract(base, g.original), delta))); });
    }
    if (shape && !['move', 'rotate', 'marquee'].includes(g.kind)) artwork.invalidate(shape);
    if (g.kind === 'resize') g.originals.forEach(base => artwork.invalidate(doc.objects.find(s => s.id === base.id)));
    changed(false, { panel: ['rotate', 'resize', 'marquee'].includes(g.kind), layers: g.kind === 'marquee' });
  }
  function finishGesture(cancel = false) {
    commitField(cancel); if (gears.active) gears.finishGesture(cancel); if (!gesture) return; const g = gesture; gesture = null;
    if (cancel || g.kind === 'draw' && !g.started) { doc = g.before.doc; selection = new Set(g.before.selection); if (!doc.objects.some(s => s.id === penDraft)) penDraft = null; }
    else if (g.kind === 'smart-rotate' && !g.moved) { const candidate = snaps.enabled ? g.candidate || nearestRotationTarget(g.start, g.targets || [], unit * 1.4) : null; smart.pivot = { x: candidate?.x ?? g.start.x, y: candidate?.y ?? g.start.y }; }
    else if (g.kind !== 'marquee') {
      const shape = doc.objects.find(s => s.id === g.id); if (shape && ['anchor', 'control', 'endpoint', 'pen-anchor'].includes(g.kind)) { artwork.invalidate(shape); rebaseShape(shape); }
      if (g.originals) recoverOffPane(doc, g.originals, new Set(g.originals.map(s => s.id))).forEach(s => artwork.invalidate(s));
      if (g.kind === 'draw') { lastDrawn = g.id; selectIds([]); }
      if (comparable(g.before) !== JSON.stringify(doc)) { recordTransform(g); remember(g.before); save(); }
    }
    changed();
  }
  function doubleClick(point) {
    if (gears.open || smart) return;
    if (tool === 'path') { finishGesture(); finishPath(); return; }
    if(tool==='select' && !shapeEdit) {
      finishGesture(); const hit=point && hitTest(point), root=hit && rootFor(hit);
      if(root?.kind==='group') { isolation=root.id; doc.activeLayer=root.layerId; }
      else if(isolation)isolation=doc.groups.find(g=>g.id===isolation)?.parentId || null;
      else return;
      smart=null; selectIds([]); changed(); return;
    }
    const shape = single(); if (!shapeEdit || !shape || ['pencil', 'line'].includes(shape.type)) return;
    const anchors = shapeAnchors(shape), index = anchors.findIndex(a => distance(point, toWorld(a, shape)) < unit * 1.5); remember();
    if (index !== -1) {
      const a = anchors[index], curved = Math.hypot(a.in.x, a.in.y, a.out.x, a.out.y) > .5;
      if (curved) a.in = a.out = { x: 0, y: 0 };
      else { const peers=anchors.filter(p=>(p.contour||0)===(a.contour||0)), position=peers.indexOf(a), previous = peers[(position - 1 + peers.length) % peers.length], next = peers[(position + 1) % peers.length], d = multiply(subtract(next, previous), .2); a.out = d; a.in = multiply(d, -1); }
      shape.anchors = anchors; selectedAnchor = index;
    } else {
      const points = flattenShape(shape, 32); let nearest = { distance: unit * 2 };
      for (let i = 1; i < points.length; i++) {
        if(points[i].move)continue;
        const hit = segmentDistance(point, points[i - 1], points[i]);
        if (hit.distance < nearest.distance) { const t0 = points[i - 1].segment === points[i].segment ? points[i - 1].t : 0; nearest = { distance: hit.distance, index: points[i].segment, t: t0 + (points[i].t - t0) * hit.t }; }
      }
      if (nearest.index !== undefined && anchors.length < (shape.type === 'polygon' ? 24 : 200)) { shape.anchors = splitCurve(anchors, nearest.index, clamp(nearest.t, .02, .98), isClosed(shape)); if (shape.type === 'polygon') shape.sides = shape.anchors.length; selectedAnchor = nearest.index + 1; }
    }
    artwork.invalidate(shape); rebaseShape(shape); changed(true);
  }
  function keydown(event) {
    if (event.target?.closest?.('textarea,select,input:not([type="range"]):not([type="checkbox"]),[contenteditable="true"]')) return false;
    if (event.target?.closest?.('.notes-layers button') && (event.key === 'Enter' || event.code === 'Space')) return false;
    if (event.target?.matches?.('input[type="range"]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return false;
    if (event.target?.matches?.('input[type="checkbox"]') && event.code === 'Space') return false;
    const command = event.ctrlKey || event.metaKey, key = event.key.toLowerCase(); let handled = true;
    if (!command && !event.altKey && event.shiftKey && key === 'f4') { action('repeat'); event.preventDefault(); return true; }
    if ((command && !event.altKey && !event.shiftKey && key === 'j') || (!command && !event.altKey && event.shiftKey && key === 'd')) { action('duplicate'); event.preventDefault(); event.stopImmediatePropagation?.(); return true; }
    if (command && !event.altKey && !event.shiftKey && key === 'd') { action('repeat'); event.preventDefault(); event.stopImmediatePropagation?.(); return true; }
    if (!command && !event.altKey && event.shiftKey && key === 't') { action('smart-rotate'); event.preventDefault(); event.stopImmediatePropagation?.(); return true; }
    if (!command && !event.altKey && event.shiftKey && key === 'q') { toggleSnap('enabled'); event.preventDefault(); event.stopImmediatePropagation?.(); return true; }
    if (!command && !event.altKey && event.shiftKey && key === 'c') { toggleClipped(); event.preventDefault(); event.stopImmediatePropagation?.(); return true; }
    if (handleEditorShortcut(event, { panel, doc, selection, layers, layerAction, action, chosen, single,
      setScale() { scaleStrokes = !scaleStrokes; panel.querySelector('[data-field="scale"]').checked = scaleStrokes; },
      color(target) { colorTarget = target; changed(); }, noColor() { colorTo(null); },
      selectAll() { finishPath(); tool = 'select'; selectIds(doc.objects.filter(s => editable(s)).map(s => s.id)); changed(); } })) {
      event.preventDefault(); event.stopImmediatePropagation?.(); return true;
    }
    if (!command && !event.altKey && !event.shiftKey && key === 'g') { action('gears'); event.preventDefault(); event.stopImmediatePropagation?.(); return true; }
    if (gears.keydown(event)) { if (gears.open) selectIds([]); event.preventDefault(); event.stopImmediatePropagation?.(); changed(); return true; }
    if (command && key === 'z') action(event.shiftKey ? 'redo' : 'undo');
    else if (command && key === 'y') action('redo');
    else if (command && key === 'g') action(event.shiftKey ? 'ungroup' : 'group');
    else if (command && key === 'a') { finishPath(); tool = 'select'; selectIds(doc.objects.filter(s => editable(s)).map(s => s.id)); changed(); }
    else if (!command && !event.altKey && (event.key === 'Delete' || event.key === 'Backspace')) action('delete');
    else if (event.key === 'Enter' && penDraft) { finishGesture(); finishPath(command); }
    else if (event.key === 'Escape') { finishGesture(true); finishPath(); selectIds([]); shapeEdit = false; if(isolation)isolation=doc.groups.find(g=>g.id===isolation)?.parentId||null; changed(); }
    else if (!command && !event.altKey && key === 'a') action('shape-edit');
    else if (event.key === 'F7') action('layers');
    else if (!command && !event.altKey && ALL_TOOLS.some(t => t.key.toLowerCase() === key)) setTool(ALL_TOOLS.find(t => t.key.toLowerCase() === key).id);
    else if (!command && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && chosen().length) {
      finishGesture(); if (event.altKey && doc.objects.length + chosen().length > 300) return false;
      remember(); if (event.altKey) selection = duplicateSelection(doc, selection, { x: 0, y: 0 }, isolation);
      const step = event.shiftKey ? 10 : 2, d = { x: key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, y: key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0 };
      const originals = clone(chosen()); chosen().forEach(s => Object.assign(s, add(s, d)));
      recoverOffPane(doc, originals, selection); repeatAction = { kind: 'move', delta: d, copy: Boolean(event.altKey) }; changed(true);
    } else handled = false;
    if (handled) { event.preventDefault(); event.stopImmediatePropagation?.(); } return handled;
  }
  changed();
  return { canvas, panel, layersPanel: layers.panel, gearsPanel: gears.panel, dropGear: gears.drop, tick: gears.tick, pointerDown, pointerMove, pointerLeave() { hover = null; gears.setHover(null); if (smart) changed(false, { panel: false, layers: false }); }, doubleClick, finishGesture, finishPath, keydown, action, flush,
    libraryReady: libraryInitialization, saveDrawing, loadDrawing, importDrawing, exportPngBlob, flushAutosave,
    get isolation() { return isolation; }, get drawing() { return clone(doc.objects); }, get document() { return clone(doc); }, get tool() { return tool; }, get cursor() { return cursor(); },
    setClippedArt(value) { if (showClippedArt !== value) { showClippedArt = value; panel.querySelector('[data-field="clipped"]').checked = value; changed(); } },
    get overflow() {
      const visible = showClippedArt ? orderedObjects(doc).filter(s => nodeVisible(doc, s)) : [];
      let artworkPaths = [];
      for (const tolerance of [1.5, 3, 6, 12]) {
        artworkPaths = visible.map(s => ({ color: isolation && !inIsolation(doc,s,isolation) ? '#687780' : s.stroke || s.fill, segments: artwork.outline(s, tolerance) }));
        if (artworkPaths.reduce((n, p) => n + p.segments.length, 0) <= 6000) break;
      }
      artworkPaths = limitOutlineSegments(artworkPaths);
      lastOutlineSegments = artworkPaths.reduce((n, p) => n + p.segments.length, 0);
      return [...artworkPaths, ...[...smartVisuals().paths, ...(gesture?.snapPaths || [])].map(p => ({ color: p.color, segments: clippedPath(p.points), dynamic: true })), ...gears.paths.filter(p => p.mechanical || showClippedArt).map(p => ({ color: p.color, segments: clippedPath(p.points), dynamic: true }))].filter(p => p.segments.length);
    },
    get active() { return Boolean(gesture) || gears.active; }, get layersOpen() { return layersOpen; }, get gearsOpen() { return gears.open; }, get layerCount() { return doc.layers.length; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    setHandleUnit(value) { const next = clamp(value, 7, 35); if (Math.abs(next - unit) > 1) { unit = next; if (selection.size || penDraft || smart || gears.active) changed(false, { panel: false, layers: false }); } },
    setAppearance(next) { const c = clamp(next.contrast ?? .5, 0, 1), b = clamp(next.brightness ?? .5, 0, 1); if (contrast !== c || brightness !== b) { contrast = c; brightness = b; artwork.clear(); changed(); } },
    dispose() { finishGesture(); finishPath(); disposed = true; cancelAnimationFrame(paintFrame); paintFrame = 0; stopBudget(); artwork.dispose(); gears.dispose(); input.abort(); layers.dispose(); downloads.dispose(); listeners.clear(); void flushAutosave().finally(() => library.dispose()); }
  };
}
