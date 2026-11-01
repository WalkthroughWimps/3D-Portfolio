import {makePlane, planeWorld, fitSurface} from './placement.js';
import * as THREE from 'three';
import { registerStickySceneAdapter } from './index.js';
import { inkFor } from './data.js';
import { noteCanvasFont, noteFontFamily, loadNoteFont } from './note-appearance.js';

const hash = value => { let result = 2166136261; for (const char of value) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(16); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pageSurface = pageId => `context:${pageId}:dom`;

function anchorAtViewport(pageId, event) {
  const width = Math.max(1, document.documentElement.clientWidth), height = Math.max(1, document.documentElement.clientHeight);
  const x = clamp(event.clientX / width, 0, 1), y = clamp(event.clientY / height, 0, 1);
  return x + y <= 1
    ? { surface: pageSurface(pageId), triangle: 0, bary: [1 - x - y, x, y] }
    : { surface: pageSurface(pageId), triangle: 1, bary: [x + y - 1, 1 - x, 1 - y] };
}

export function createDOMStickyAdapter({ pageId, root = document, register = true, visualOnly = false } = {}) {
  const layer = root.createElement('div'); layer.className = 'sticky-notes-page-layer'; layer.dataset.pageId = pageId;
  root.body.append(layer);
  const entries = new Map();
  const hint = root.createElement('div'); hint.className = 'sticky-notes-placement-hint'; hint.textContent = 'Click a clear page area to place the note · Escape cancels'; hint.hidden = true; layer.append(hint);
  let handlers = null, notes = [], placing = false, shown = true, disposed = false, gesture = null;
  const excludedTarget = target => target?.closest?.('button,a,input,textarea,select,summary,dialog,[role="dialog"],[data-panel],.header,.nav-wrap,.shared-nav-wrap,.header-mouse-controls,.header-utility-dock,.site-shortcuts-trigger,.page-summary-trigger,.sticky-notes-page-layer');
  function canDropAt(event) {
    const width = root.documentElement.clientWidth, height = root.documentElement.clientHeight;
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || event.clientX < 0 || event.clientY < 0 || event.clientX >= width || event.clientY >= height) return false;
    const target = root.elementFromPoint?.(event.clientX, event.clientY) || event.target;
    return !excludedTarget(target) && target !== layer;
  }
  function place(event) {
    if (!placing || !canDropAt(event)) return false;
    gesture = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.preventDefault(); event.stopImmediatePropagation(); return true;
  }
  function pointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const start = gesture; gesture = null;
    if (event.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    handlers?.onPlace?.(anchorAtViewport(pageId, event));
  }
  const down = event => { if (place(event)) event.stopPropagation(); };
  const cancelPointer = () => { gesture = null; };
  const resize = () => setNotes(notes);
  if (!visualOnly) {
    root.body.addEventListener('pointerdown', down, true);
    root.defaultView?.addEventListener('pointerup', pointerUp, true);
    root.defaultView?.addEventListener('pointercancel', cancelPointer, true);
    root.defaultView?.addEventListener('resize', resize);
  }
  function setNotes(next) {
    notes = next.filter(note => note.anchor.surface === pageSurface(pageId));
    const ids = new Set(notes.map(note => note.id));
    for (const [id, button] of entries) if (!ids.has(id)) { button.remove(); entries.delete(id); }
    for (const note of notes) {
      let button = entries.get(note.id);
      if (!button) {
        button = root.createElement('button'); button.type = 'button'; button.className = 'sticky-note-page';
        button.addEventListener('click', event => { event.stopPropagation(); handlers?.open?.(note.id); });
        layer.append(button); entries.set(note.id, button);
      }
      button.textContent = note.text.trim().slice(0, 180);
      button.setAttribute('aria-label', button.textContent || 'Empty sticky note');
      button.style.setProperty('--sticky-color', note.color); button.style.setProperty('--sticky-ink', inkFor(note.color));
      button.style.setProperty('--sticky-note-font', noteFontFamily(note.font));
      void loadNoteFont(note.font);
      button.style.transform = `translate(-50%, -50%) rotate(${note.rotation}deg) scale(${note.size})`;
      button.hidden = !shown;
      const [, second, third] = note.anchor.bary;
      const x = note.anchor.triangle === 0 ? second : 1 - second;
      const y = note.anchor.triangle === 0 ? third : 1 - third;
      button.style.left = `${x * 100}%`;
      button.style.top = `${y * 100}%`;
    }
  }
  const adapter = {
    setHandlers(value) { handlers = value; }, setNotes,
    setPlacing(value) { if (!visualOnly) { placing = !!value; hint.hidden = !placing; } }, setEditingFocused() {}, setNotesShown(value) { shown = !!value; setNotes(notes); },
    visibleCount() { return shown ? notes.length : 0; }, unresolvedCount() { return 0; },
    isVisible(id) { return shown && entries.has(id); },
    getAnchorRect(id) { return entries.get(id)?.getBoundingClientRect() || null; },
    canPlaceFromIcon(event) { return canDropAt(event); },
    previewIconDrag(event) { if (visualOnly) return; layer.classList.toggle('placing-preview', !!event); if (!event) return; layer.style.setProperty('--sticky-preview-x', `${event.clientX}px`); layer.style.setProperty('--sticky-preview-y', `${event.clientY}px`); },
    // The visual-only renderer has no page listeners, but explicit icon drops
    // still use it as the safe page-coordinate fallback for scene misses.
    placeFromIcon(event) { if (!canDropAt(event)) return; handlers?.requestDraft?.(anchorAtViewport(pageId, event)); },
    dispose() {
      if (disposed) return; disposed = true; gesture = null;
      root.body.removeEventListener('pointerdown', down, true); root.defaultView?.removeEventListener('pointerup', pointerUp, true);
      root.defaultView?.removeEventListener('pointercancel', cancelPointer, true);
      root.defaultView?.removeEventListener('resize', resize);
      handlers = null; layer.remove(); entries.clear(); unregister?.();
    }
  };
  const unregister = register ? registerStickySceneAdapter(pageId, adapter) : null;
  return adapter;
}

export function createSceneInputOwnership(getControls) {
  let active = false, previousEnabled;
  return owned => {
    const controls = getControls?.();
    if (owned && !active) { active = true; previousEnabled = controls?.enabled; if (controls) controls.enabled = false; }
    else if (!owned && active) { if (controls && previousEnabled !== undefined) controls.enabled = previousEnabled; active = false; previousEnabled = undefined; }
  };
}

function paint(note) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
  const context = canvas.getContext('2d'); context.fillStyle = note.color; context.fillRect(0, 0, 384, 384);
  context.strokeStyle = '#463b1b88'; context.lineWidth = 9; context.strokeRect(5, 5, 374, 374);
  context.fillStyle = inkFor(note.color); context.font = noteCanvasFont(note.font, 36);
  const rows = [''];
  for (const word of note.text.trim().split(/\s+/).filter(Boolean)) {
    const candidate = rows.at(-1) ? `${rows.at(-1)} ${word}` : word;
    if (context.measureText(candidate).width > 310 && rows.at(-1)) rows.push(word); else rows[rows.length - 1] = candidate;
    if (rows.length >= 7) break;
  }
  rows.forEach((row, index) => context.fillText(row.slice(0, 28), 28, 75 + index * 43));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createSceneStickyAdapter({ pageId, scene, canvas, getCamera, getRoot = () => scene, scope, onInputOwnership = () => {} } = {}) {
  if (!scene || !canvas || typeof getCamera !== 'function') throw new TypeError('A scene, canvas, and camera getter are required.');
  const dom = createDOMStickyAdapter({ pageId, register: false, visualOnly: true });
  const entries = new Map(), surfaces = new Map(), meshes = [];
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), normalMatrix = new THREE.Matrix3();
  let handlers = null, placing = false, editing = false, ownsControls = false, shown = true, suspended = false, disposed = false, gesture = null, backgroundGesture = null, nextScan = 0, previousCursor = null, surfaceSignature = '', suppressClick = null;
  const owned = new THREE.Group(); owned.name = `Sticky notes ${pageId}`; owned.userData.stickyNoteOwned = true; scene.add(owned);
  const placementHint = document.createElement('div'); placementHint.className = 'sticky-notes-placement-hint'; placementHint.textContent = 'Click a visible object to place the note · Escape cancels'; placementHint.hidden = true; canvas.parentElement?.append(placementHint);
  const rootObject = () => getRoot?.() || scene;
  function pathOf(node, rootObjectValue) {
    const parts = [];
    for (let current = node; current && current !== rootObjectValue; current = current.parent) {
      const siblings = current.parent?.children.filter(child => child.name === current.name) || [];
      parts.unshift(`${current.name || 'node'}:${siblings.indexOf(current)}`);
    }
    return parts.join('/');
  }
  function scan() {
    surfaces.clear(); meshes.length = 0;
    const rootNode = rootObject(); rootNode?.updateWorldMatrix?.(true, true);
    rootNode?.traverse?.(node => {
      if (!node.isMesh || node.isInstancedMesh || node.userData?.stickyNoteOwned || !node.geometry?.getAttribute?.('position')) return;
      const key = pathOf(node, rootNode), id = `context:${pageId}:${hash(key)}`;
      if (surfaces.has(id)) return;
      const geometry = node.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      if (!geometry.boundingBox) return;
      if (!node.userData?.stickyNoteBlocker) surfaces.set(id, node);
      meshes.push(node);
    });
    const signature = [...surfaces.keys()].sort().join('|');
    if (surfaceSignature && signature !== surfaceSignature) handlers?.visibilityChanged?.();
    surfaceSignature = signature;
    nextScan = performance.now() + 1000;
  }
  function meshVisible(mesh) {
    for (let node = mesh; node; node = node.parent) if (!node.visible) return false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.some(material => material?.visible !== false && material?.colorWrite !== false && material?.opacity !== 0);
  }
  function rayFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return false;
    ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    const camera = getCamera(); if (!camera) return false;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true); ray.setFromCamera(ndc, camera); return true;
  }
  function docsLampBounds() {
    const bounds = new THREE.Box3();
    for (const blocker of meshes) if (blocker.userData?.stickyNoteBlocker && meshVisible(blocker)) bounds.union(new THREE.Box3().setFromObject(blocker));
    return bounds;
  }
  function docsTableSurface(source, normal) {
    return pageId === 'docs' && source?.name === 'Desk_Leather' && normal.y > .8;
  }
  function docsFootprint(side, top, size) {
    const half = .125 * size;
    return { x: half * (Math.abs(side.x) + Math.abs(top.x)), z: half * (Math.abs(side.z) + Math.abs(top.z)) };
  }
  function docsOverlapsLamp(point, extent, bounds) {
    const margin = .003;
    return !bounds.isEmpty() && point.x + extent.x + margin > bounds.min.x && point.x - extent.x - margin < bounds.max.x &&
      point.z + extent.z + margin > bounds.min.z && point.z - extent.z - margin < bounds.max.z;
  }
  function docsSurfacePoint(source, triangle, point, normal) {
    const geometry = source.geometry, positions = geometry.getAttribute('position'), index = geometry.index;
    if (!positions || !Number.isInteger(triangle) || triangle < 0 || triangle * 3 + 2 >= (index?.count ?? positions.count)) return point;
    const vertex = index ? index.getX(triangle * 3) : triangle * 3;
    const surface = new THREE.Vector3().fromBufferAttribute(positions, vertex).applyMatrix4(source.matrixWorld);
    return point.addScaledVector(normal, -point.clone().sub(surface).dot(normal));
  }
  function docsCornersSupported(point, side, top, size, source) {
    const half = .125 * size, ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      const corner = point.clone().addScaledVector(side, x * half).addScaledVector(top, y * half);
      ray.set(corner.clone().add(new THREE.Vector3(0, 1, 0)), down);
      const hit = ray.intersectObject(source, false)[0];
      if (!hit || Math.abs(hit.point.y - corner.y) > .003) return false;
    }
    return true;
  }
  function fitDocsNote(point, side, top, size, bounds, source) {
    const desk = { minX: .062, maxX: 1.338, minZ: -1.110, maxZ: -.062 };
    const minFactor = Math.min(1, .2 / size);
    for (let factor = 1; factor >= minFactor - 1e-8; factor = Math.round((factor - .1) * 10) / 10) {
      const renderSize = size * factor, extent = docsFootprint(side, top, renderSize);
      const limits = { minX: desk.minX + extent.x, maxX: desk.maxX - extent.x, minZ: desk.minZ + extent.z, maxZ: desk.maxZ - extent.z };
      if (limits.minX > limits.maxX || limits.minZ > limits.maxZ) continue;
      const candidates = [point.clone()];
      for (let ix = 0; ix <= 12; ix++) for (let iz = 0; iz <= 12; iz++) {
        candidates.push(new THREE.Vector3(
          limits.minX + (limits.maxX - limits.minX) * ix / 12,
          point.y,
          limits.minZ + (limits.maxZ - limits.minZ) * iz / 12
        ));
      }
      candidates.sort((a, b) => a.distanceToSquared(point) - b.distanceToSquared(point));
      for (const candidate of candidates) {
        if (candidate.x < limits.minX || candidate.x > limits.maxX || candidate.z < limits.minZ || candidate.z > limits.maxZ) continue;
        if (docsOverlapsLamp(candidate, extent, bounds)) continue;
        if (docsCornersSupported(candidate, side, top, renderSize, source)) return { point: candidate, size: renderSize };
      }
    }
    return { point, size };
  }
  function anchorAt(event) {
    scan(); if (!rayFromEvent(event)) return { error: 'Choose a visible scene surface.' };
    const hits = ray.intersectObjects(meshes.filter(meshVisible), false), hit = hits[0];
    if (!hit?.face || hit.faceIndex == null) return { error: 'Choose a visible scene surface.' };
    const mesh = hit.object, rootNode = rootObject();
    if (mesh.userData?.stickyNoteBlocker) return { error: 'This object blocks note placement.' };
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
    const camera = getCamera(), eye = camera.getWorldPosition(new THREE.Vector3());
    if (worldNormal.dot(eye.sub(hit.point)) < 0) worldNormal.negate();
    const worldTangent = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    worldTangent.addScaledVector(worldNormal, -worldTangent.dot(worldNormal)).normalize();
    if (worldTangent.lengthSq() < .5) worldTangent.set(0, 1, 0).cross(worldNormal).normalize();
    const up = new THREE.Vector3().crossVectors(worldNormal, worldTangent).normalize();
    const onDocsTable = docsTableSurface(mesh, worldNormal);
    const appearance = handlers?.getPlacementAppearance?.(), size = appearance?.size ?? 2;
    const angle = (appearance?.rotation ?? 0) * Math.PI / 180;
    const side = worldTangent.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
    const top = new THREE.Vector3().crossVectors(worldNormal, side).normalize();
    const bounds = onDocsTable ? docsLampBounds() : null;
    const fit = fitSurface(THREE, {point: hit.point, normal: worldNormal, tangent: side, source: mesh,
      candidates: meshes.filter(meshVisible), half: .125 * size,
      accepts: onDocsTable ? candidate => !docsOverlapsLamp(candidate, docsFootprint(side, top, size), bounds) : undefined});
    if (!fit) return {error: 'This object blocks note placement.'};
    const id = `context:${pageId}:${hash(pathOf(mesh, rootNode))}`;
    return { anchor: { surface: id, triangle: hit.faceIndex, bary: [1 / 3, 1 / 3, 1 / 3], plane: makePlane(THREE, mesh, hit.point, worldNormal, worldTangent, fit.displacement, fit.clearance) } };
  }
  function createEntry(note) {
    const geometry = new THREE.PlaneGeometry(1, 1), texture = paint(note);
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, transparent: true, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(geometry, material); mesh.userData.stickyNoteOwned = true; mesh.userData.stickyId = note.id; mesh.renderOrder = 4; owned.add(mesh);
    const entry = { note, geometry, texture, material, mesh, visible: false };
    void loadNoteFont(note.font).then(loaded => {
      if (!loaded || disposed || entries.get(note.id) !== entry) return;
      const replacement = paint(note);
      entry.material.map = replacement; entry.material.needsUpdate = true;
      entry.texture.dispose(); entry.texture = replacement;
    });
    return entry;
  }
  function discard(entry) { entry.mesh.removeFromParent(); entry.geometry.dispose(); entry.texture.dispose(); entry.material.dispose(); }
  function setNotes(next) {
    dom.setNotes(next);
    const ids = new Set(next.filter(note => note.anchor.surface !== pageSurface(pageId)).map(note => note.id));
    for (const [id, entry] of entries) if (!ids.has(id)) { discard(entry); entries.delete(id); }
    for (const note of next) if (note.anchor.surface !== pageSurface(pageId)) {
      const existing = entries.get(note.id);
      if (existing && JSON.stringify(existing.note) === JSON.stringify(note)) continue;
      if (existing) discard(existing); entries.set(note.id, createEntry(note));
    }
    update(); handlers?.visibilityChanged?.();
  }
  function update() {
    if (disposed || suspended) return;
    if (performance.now() >= nextScan) scan();
    scene.updateMatrixWorld(true); owned.updateMatrixWorld(true);
    const lampBounds = pageId === 'docs' ? docsLampBounds() : null;
    for (const entry of entries.values()) {
      const { note, mesh } = entry, source = surfaces.get(note.anchor.surface), plane = note.anchor.plane;
      entry.visible = !!(shown && source && meshVisible(source) && plane); mesh.visible = entry.visible;
      if (!entry.visible) continue;
      const p = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3();
      planeWorld(THREE, source, plane, p, n, t);
      const u = new THREE.Vector3().crossVectors(n, t).normalize();
      const angle = note.rotation * Math.PI / 180, co = Math.cos(angle), si = Math.sin(angle);
      const side = t.clone().multiplyScalar(co).addScaledVector(u, si), top = u.clone().multiplyScalar(co).addScaledVector(t, -si);
      const tablePoint = pageId === 'docs' ? docsSurfacePoint(source, note.anchor.triangle, p.clone(), n) : null;
      if (plane.version !== 2 && tablePoint && docsTableSurface(source, n)) {
        // Old saved anchors contain the former clearance; project onto their
        // actual source triangle before adding only a submillimetre offset.
        const fitKey = [note.size, note.rotation, tablePoint.x, tablePoint.y, tablePoint.z,
          ...source.matrixWorld.elements, ...lampBounds.min.toArray(), ...lampBounds.max.toArray()].join(',');
        if (entry.docsFit?.key !== fitKey) entry.docsFit = { key: fitKey, value: fitDocsNote(tablePoint, side, top, note.size, lampBounds, source) };
        const fit = entry.docsFit.value;
        docsSurfacePoint(source, note.anchor.triangle, fit.point, n);
        mesh.position.copy(fit.point).addScaledVector(n, .0007);
        mesh.scale.setScalar(.25 * fit.size);
      } else mesh.position.copy(p).addScaledVector(n, plane.version === 2 ? 0 : .01);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, top, n));
      if (plane.version === 2 || !docsTableSurface(source, n)) mesh.scale.setScalar(.25 * note.size);
    }
  }
  function ownInput() { const next = placing || editing; if (next !== ownsControls) { ownsControls = next; onInputOwnership(next); } }
  function down(event) {
    if (event.target !== canvas || event.button !== 0 || suspended || !handlers || (!placing && !entries.size)) return;
    if (!rayFromEvent(event)) return;
    const noteHit = ray.intersectObjects([...entries.values()].filter(entry => entry.visible).map(entry => entry.mesh), false)[0];
    const physicalHit = ray.intersectObjects(meshes.filter(meshVisible), false)[0];
    const visibleNoteHit = noteHit && (!physicalHit || noteHit.distance < physicalHit.distance + .003) ? noteHit : null;
    if (placing || visibleNoteHit) { gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, place: placing, noteId: visibleNoteHit?.object.userData.stickyId }; event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function up(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const state = gesture; gesture = null; event.preventDefault(); event.stopImmediatePropagation();
    if (event.button !== 0 || Math.hypot(event.clientX - state.x, event.clientY - state.y) > 6) return;
    if (!state.place) { suppressClick = { x: event.clientX, y: event.clientY, until: performance.now() + 500 }; handlers?.selectNote?.(state.noteId); return; }
    const result = anchorAt(event); suppressClick = { x: event.clientX, y: event.clientY, until: performance.now() + 500 };
    if (result.anchor) handlers?.onPlace?.(result.anchor);
    else if (result.error === 'This object blocks note placement.') handlers?.report?.(result.error);
    else handlers?.onPlace?.(anchorAtViewport(pageId, event));
  }
  function backgroundDown(event) {
    if (!placing || suspended || event.target === canvas || !dom.canPlaceFromIcon(event)) return;
    backgroundGesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function backgroundUp(event) {
    if (!backgroundGesture || backgroundGesture.id !== event.pointerId) return;
    const state = backgroundGesture; backgroundGesture = null; event.preventDefault(); event.stopImmediatePropagation();
    if (event.button !== 0 || Math.hypot(event.clientX - state.x, event.clientY - state.y) > 6) return;
    suppressClick = { x: event.clientX, y: event.clientY, until: performance.now() + 500 };
    handlers?.onPlace?.(anchorAtViewport(pageId, event));
  }
  function clickAfterGesture(event) {
    if (!suppressClick) return;
    const state = suppressClick; suppressClick = null;
    if (performance.now() <= state.until && Math.hypot(event.clientX - state.x, event.clientY - state.y) <= 6) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  const cancel = () => { gesture = backgroundGesture = null; };
  canvas.addEventListener('pointerdown', down, true); window.addEventListener('pointerdown', backgroundDown, true); window.addEventListener('click', clickAfterGesture, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointerup', backgroundUp, true); window.addEventListener('pointercancel', cancel, true); window.addEventListener('blur', cancel);
  const adapter = {
    composesDOMFallback: true,
    setHandlers(value) { handlers = value; dom.setHandlers(value); }, setNotes,
    setPlacing(value) { placing = !!value; placementHint.hidden = !placing; ownInput(); dom.setPlacing(value); if (placing) { previousCursor ??= canvas.style.cursor; canvas.style.cursor = 'crosshair'; } else if (previousCursor !== null) { canvas.style.cursor = previousCursor; previousCursor = null; } },
    setEditingFocused(value) { editing = !!value; ownInput(); dom.setEditingFocused(value); }, setNotesShown(value) { shown = !!value; dom.setNotesShown(value); update(); },
    visibleCount() { return [...entries.values()].filter(entry => entry.visible).length + dom.visibleCount(); },
    unresolvedCount() { return [...entries.values()].filter(entry => !surfaces.has(entry.note.anchor.surface)).length; },
    isVisible(id) { return entries.get(id)?.visible || dom.isVisible(id); },
    getAnchorRect(id) { const entry = entries.get(id); if (!entry?.visible) return dom.getAnchorRect(id); const p = entry.mesh.position.clone().project(getCamera()), rect = canvas.getBoundingClientRect(); return { left: rect.left + (p.x + 1) * rect.width / 2 - 20, top: rect.top + (1 - p.y) * rect.height / 2 - 20, width: 40, height: 40 }; },
    previewIconDrag(event) { dom.previewIconDrag(event); },
    placeFromIcon(event) { const result = anchorAt(event); if (result.anchor) handlers?.requestDraft?.(result.anchor); else if (result.error === 'This object blocks note placement.') handlers?.report?.(result.error); else dom.placeFromIcon(event); },
    update, suspend() { suspended = true; gesture = null; dom.setNotesShown(false); }, resume() { suspended = false; dom.setNotesShown(shown); update(); },
    dispose() { if (disposed) return; disposed = true; placing = editing = false; ownInput(); canvas.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerdown', backgroundDown, true); window.removeEventListener('click', clickAfterGesture, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointerup', backgroundUp, true); window.removeEventListener('pointercancel', cancel, true); window.removeEventListener('blur', cancel); if (previousCursor !== null) canvas.style.cursor = previousCursor; placementHint.remove(); unregister(); dom.dispose(); for (const entry of entries.values()) discard(entry); entries.clear(); owned.removeFromParent(); owned.clear(); handlers = null; }
  };
  const unregister = registerStickySceneAdapter(pageId, adapter);
  if (scope?.defer) scope.defer(adapter.dispose);
  scan(); return adapter;
}
