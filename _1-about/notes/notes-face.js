import * as THREE from 'three';
import { createDrawingEditor } from './drawing-editor.js';
import { SIZE, RADIUS, onGlass } from './drawing-model.js';
import { getSharedSettings } from '../../_7-shared-scripts/core/settings.js';
import { initPanelShell } from '../../debug/panel-shell.js';
import { drawingLayout } from './drawing-layout.js';
import { createPanelPresence } from './panel-presence.js';

export const NOTES_MOUNT = Object.freeze({ source: 'back.art', center: [-.966, 0, 0], normal: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0], radius: .835 });
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const outlineOpacity = contrast => { const eased = contrast * contrast * (3 - 2 * contrast); return .12 + .22 * eased; };

export function createNotesWorkspace({ stage, onFocusFace = () => {}, onRotate = () => {}, onInputOwnership = () => {} }) {
  const input = new AbortController(), resources = [], captures = new Set(), hiddenBacking = [];
  let canvasInput = null;
  let host = null, group = null, carrier = null, texture = null, glass = null, ring = null, editor = null, overflow = null, dynamicOverflow = null, rearArt = null, contrast = .5;
  let focused = false, tabletFocused = false, suspended = false, disposed = false, activePointer = null, turnPointer = null, turnMode = false;
  let upright = true, reduced = false, roll = 0, rollTarget = 0, rollVelocity = 0, lastRoll = null;
  let showBacking = false, enabled = true, rearArtwork = true, fitInterior = false;
  const presence = createPanelPresence({delay:1.5});
  let panelState = presence.state, presenceTime = null, occluded = false;
  const adminSides = {left:false,right:false};
  const previousOverflows = new WeakMap();
  const rearPanes = [];
  const dock = document.createElement('nav'); dock.className = 'notes-dock'; dock.setAttribute('aria-label', 'Notes views');
  dock.innerHTML = '<button type="button" data-notes-view="face" aria-label="Notes face" aria-keyshortcuts="Z" title="Notes face (Z)" disabled>Notes face<kbd aria-hidden="true">Z</kbd></button><button type="button" data-notes-view="turn" aria-label="Turn cube" aria-keyshortcuts="C" title="Turn cube (C)" aria-pressed="false" disabled>Turn cube<kbd aria-hidden="true">C</kbd></button>';
  const ui = document.createElement('div'); ui.className = 'notes-ui notes-2d-mode'; ui.hidden = true;
  const artTablet = document.createElement('div'); artTablet.className = 'notes-side-panel notes-art-tablet'; artTablet.setAttribute('aria-label', 'Drawing tools tablet'); artTablet.setAttribute('role', 'region');
  const gearTablet = document.createElement('div'); gearTablet.className = 'notes-side-panel notes-gear-tablet'; gearTablet.setAttribute('aria-label', 'Gear art and Layers tablet'); gearTablet.setAttribute('role', 'region');
  editor = createDrawingEditor({ layersInitiallyOpen: true,
    onChange: () => { if (texture) texture.needsUpdate = true; if (editor) { syncLayers(); syncOverflow(); } } });
  editor.panel.inert = true; artTablet.append(editor.panel); gearTablet.append(editor.gearsPanel, editor.layersPanel); ui.append(artTablet, gearTablet); stage.append(ui, dock);
  for (const panel of [artTablet, gearTablet]) {
    for (const type of ['pointerdown','pointermove','pointerup','click','wheel'])
      panel.addEventListener(type, event => event.stopPropagation(), {signal:input.signal});
  }
  const settings = document.createElement('section');
  settings.innerHTML = `<h3>Drawing surface</h3>${[['showBacking','Show backing'],['showClippedArt','Show clipped art'],['rearArtwork','Show artwork from behind'],['fitInterior','Fit the open cube between Notes panels']].map(([key,label])=>`<label><input type="checkbox" data-setting="about.notes.${key}"> ${label}</label>`).join('')}<p data-interior-hint>Interior fit is available with Show backing off. Panels stay at the screen edges; wheel zoom stays precise.</p><h3>Projector</h3><label><input type="checkbox" data-setting="about.notes.projector"> Projector light</label><label><input type="checkbox" data-setting="about.notes.backingProjection"> Project artwork onto the inner backing</label>`;
  settings.addEventListener('change', event => { const control = event.target.closest('[data-setting]'); if (control) getSharedSettings().patch({[control.dataset.setting]:control.checked}); }, {signal:input.signal});
  const panelShell = initPanelShell();
  const unregisterSettings = panelShell.registerContext('notes', 'Notes', settings);
  const unregisterAdminInterlock = panelShell.registerSideInterlock({
    beforeOpen(side) {
      adminSides[side] = true;
      const panel = side === 'left' ? gearTablet : artTablet;
      panel.dataset.adminHidden = 'true'; panel.inert = true;
      if (ui.hidden || reduced || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
      return new Promise(resolve => setTimeout(resolve, 190));
    },
    onChange(side, open) {
      adminSides[side] = open;
      const panel = side === 'left' ? gearTablet : artTablet;
      panel.dataset.adminHidden = String(open);
      panel.inert = open || ui.hidden || occluded;
      if (!open && panelState.visible && tabletFocused) showTools(true, panelState.interactive);
    }
  });
  const ndc = new THREE.Vector2(), raycaster = new THREE.Raycaster(), plane = new THREE.Plane();
  const worldNormal = new THREE.Vector3(), worldCenter = new THREE.Vector3(), inverse = new THREE.Matrix4(), screenRight = new THREE.Vector3(), cameraNormal = new THREE.Vector3();
  const rimPoints = Array.from({ length: 32 }, (_, i) => new THREE.Vector3(Math.cos(i * Math.PI / 16) * .9, Math.sin(i * Math.PI / 16) * .9, 0));
  const projectedRim = new THREE.Vector3();
  const rimCache = {camera:new THREE.Matrix4(),projection:new THREE.Matrix4(),carrier:new THREE.Matrix4()};
  let safeTop = 110;
  function readPanelMargin() {
    safeTop = Math.max((document.querySelector('.head-pic-container')?.getBoundingClientRect().bottom || 0) + 12,
      (document.querySelector('.about-header')?.getBoundingClientRect().bottom || 90) + 18);
    ui.style.setProperty('--notes-safe-top', `${safeTop}px`);
  }
  readPanelMargin(); window.addEventListener('resize', readPanelMargin, { signal: input.signal });
  const headerLayoutObserver = new ResizeObserver(readPanelMargin);
  const header = document.querySelector('.about-header'); if (header) headerLayoutObserver.observe(header);
  function layoutStyle(node, property, value) {
    const pixels = `${Math.round(value * 100) / 100}px`;
    if (node.style.getPropertyValue(property) !== pixels) node.style.setProperty(property, pixels);
  }
  function data(node, key, value) { const text = String(value); if (node.dataset[key] !== text) node.dataset[key] = text; }
  function frameLayout({ bounds, availableRight }) {
    if (!enabled || !focused || suspended || !carrier || !tabletFocused || !panelState.visible) return null;
    const width = bounds.width, oldOffset = host.camera.view?.enabled ? host.camera.view.offsetX : 0;
    let left = 0, right = width;
    if(rimCache.width!==width || rimCache.height!==bounds.height || rimCache.offset!==oldOffset || !rimCache.camera.equals(host.camera.matrixWorld) || !rimCache.projection.equals(host.camera.projectionMatrix) || !rimCache.carrier.equals(carrier.matrixWorld)) {
      left = Infinity; right = -Infinity;
      for (const point of rimPoints) {
        projectedRim.copy(point).applyMatrix4(carrier.matrixWorld).project(host.camera);
        const x = width / 2 + (projectedRim.x * width / 2 + oldOffset) / host.camera.zoom;
        left = Math.min(left, x); right = Math.max(right, x);
      }
      projectedRim.set(0,0,0).applyMatrix4(carrier.matrixWorld).project(host.camera);
      Object.assign(rimCache,{width,height:bounds.height,offset:oldOffset,left,right,y:(1-projectedRim.y)*bounds.height/2});
      rimCache.camera.copy(host.camera.matrixWorld);rimCache.projection.copy(host.camera.projectionMatrix);rimCache.carrier.copy(carrier.matrixWorld);
    }
    left=rimCache.left;right=rimCache.right;
    const margin = matchMedia('(max-width: 520px)').matches ? 10 : 12;
    const layout = drawingLayout({width, left, right, availableRight, layersOpen:false, margin, fitInterior: !showBacking && fitInterior});
    data(ui,'layout',layout.compact?'compact':'rim'); data(ui,'narrow',width<680);
    data(ui,'layers',editor.layersOpen); occluded = width < 300;
    data(ui,'occluded',occluded); ui.inert = occluded || ui.hidden;
    data(dock,'rimLayout',true); data(dock,'occluded',occluded);
    layoutStyle(dock, '--notes-dock-left', bounds.left + layout.dockLeft);
    return layout;
  }
  function afterRender() {}
  const stopSettings = getSharedSettings().subscribe(snapshot => {
    contrast = snapshot.accessibility?.highContrast ? 1 : snapshot.start?.contrast ?? .5;
    upright = snapshot.cube?.uprightFaces !== false; reduced = Boolean(snapshot.accessibility?.reducedMotion);
    ui.classList.toggle('notes-reduced-motion', reduced);
    const notes = snapshot.about?.notes || {};
    const wasEnabled = enabled;
    showBacking = notes.showBacking === true; enabled = notes.enabled !== false; rearArtwork = notes.rearArtwork !== false; fitInterior = notes.fitInterior === true;
    settings.querySelectorAll('[data-setting]').forEach(control => { const key = control.dataset.setting.split('.').at(-1); control.checked = ['showBacking', 'fitInterior'].includes(key) ? notes[key] === true : notes[key] !== false; });
    settings.querySelector('[data-setting="about.notes.fitInterior"]').disabled = showBacking;
    settings.querySelector('[data-interior-hint]').hidden = !showBacking;
    editor.setClippedArt(notes.showClippedArt !== false);
    if (group) group.visible = enabled; dock.hidden = !enabled;
    if (rearArt) rearArt.visible = rearArtwork;
    if (wasEnabled && !enabled) {
      releaseDrawing(); editor.tick(0, false); editor.finishPath(); focused = false;
      panelState = presence.reset(); presenceTime = null; showTools(false);
      if (host) { host.canvas.style.cursor = ''; host.canvas.setAttribute('aria-label', host.baseLabel); }
    }
    hiddenBacking.forEach(([node]) => { node.visible = enabled && showBacking; });
    ui.style.setProperty('--notes-highlight-strength', `${Math.round(20 + contrast * 65)}%`);
    dock.style.setProperty('--notes-highlight-strength', `${Math.round(20 + contrast * 65)}%`);
    editor.setAppearance({ contrast, brightness: snapshot.start?.brightness ?? .5 });
    if (glass) { glass.material.opacity = .045; ring.material.opacity = .18 + contrast * .22; overflow.material.opacity = outlineOpacity(contrast); }
  }, { immediate: true });
  function syncLayers() {
    for (const [name,panel] of [['layers',editor.layersPanel],['gears',editor.gearsPanel]]) {
      const hidden = ui.hidden || name === 'layers' && !editor.layersOpen;
      if (panel.hidden !== hidden) panel.hidden = hidden;
      const inert = hidden || ui.inert || adminSides.left; if (panel.inert !== inert) panel.inert = inert;
    }
    data(ui,'layers',editor.layersOpen);
  }
  function syncOverflow() {
    if (!overflow || !dynamicOverflow) return;
    const paths = editor.overflow;
    uploadOverflow(overflow, paths.filter(p => !p.dynamic)); uploadOverflow(dynamicOverflow, paths.filter(p => p.dynamic));
  }
  function uploadOverflow(node, paths) {
    const previousOverflow = previousOverflows.get(node) || [];
    if (node.geometry.getAttribute('position') && paths.length === previousOverflow.length && paths.every((path, i) => path.segments === previousOverflow[i].segments && path.color === previousOverflow[i].color)) return;
    previousOverflows.set(node, paths);
    const count = paths.reduce((n, path) => n + path.segments.length * 2, 0), geometry = node.geometry;
    if (!geometry.getAttribute('position') || geometry.getAttribute('position').count < count) {
      const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, count))));
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    }
    const positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color'), units = NOTES_MOUNT.radius / RADIUS;
    let index = 0;
    for (const path of paths) {
      const color = new THREE.Color(path.color);
      for (const segment of path.segments) for (const point of segment) {
        positions.setXYZ(index, (point.x - SIZE / 2) * units, (SIZE / 2 - point.y) * units, .001);
        colors.setXYZ(index++, color.r, color.g, color.b);
      }
    }
    positions.needsUpdate = colors.needsUpdate = true; geometry.setDrawRange(0, count); node.userData.hasLines = count > 0;
    node.visible = focused && count > 0;
  }
  function showTools(value, interactive = value) {
    const show = value && enabled && !suspended;
    if (!interactive && ui.contains(document.activeElement)) (enabled ? dock.querySelector('[data-notes-view="face"]') : host?.canvas)?.focus({ preventScroll: true });
    ui.hidden = !show; ui.inert = !interactive || occluded; editor.panel.hidden = !show; editor.panel.inert = !interactive || adminSides.right;
    gearTablet.inert = !interactive || occluded || adminSides.left; artTablet.inert = !interactive || occluded || adminSides.right; syncLayers();
    if (show && interactive && !adminSides.left && !adminSides.right) {
      const field = editor.panel.dataset.shortcutFocus;
      if (field) { editor.panel.querySelector(`[data-field="${field}"]`)?.focus(); delete editor.panel.dataset.shortcutFocus; }
    }
  }
  dock.addEventListener('click', event => {
    const view = event.target.closest('button')?.dataset.notesView;
    if (view === 'face') { setTurnMode(false); onFocusFace(NOTES_MOUNT); }
    if (view === 'turn') setTurnMode(!turnMode);
  }, { signal: input.signal });
  function setTurnMode(value) { turnMode = value; const b = dock.querySelector('[data-notes-view="turn"]'); b.setAttribute('aria-pressed', String(turnMode)); b.setAttribute('aria-label', turnMode ? 'Done turning' : 'Turn cube'); b.innerHTML = `${turnMode ? 'Done turning' : 'Turn cube'}<kbd aria-hidden="true">C</kbd>`; }
  function attach({ cube, camera, canvas }) {
    if (disposed) return;
    if (host) detach();
    host = { cube, camera, canvas, baseLabel: canvas.getAttribute('aria-label') };
    dock.querySelectorAll('button').forEach(b => { b.disabled = false; });
    cube.traverse(node => { if (node.userData?.source_object_name === NOTES_MOUNT.source || node.name === 'back.art Export') { hiddenBacking.push([node, node.visible]); node.visible = enabled && showBacking; } });
    group = new THREE.Group(); group.name = 'Notes glass mount'; group.visible = enabled; group.position.fromArray(NOTES_MOUNT.center);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...NOTES_MOUNT.right), new THREE.Vector3(...NOTES_MOUNT.up), new THREE.Vector3(...NOTES_MOUNT.normal)));
    carrier = new THREE.Group(); carrier.name = 'Notes upright glass carrier'; group.add(carrier);
    const circle = new THREE.CircleGeometry(NOTES_MOUNT.radius, 128), glassMaterial = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: .045, roughness: .045, metalness: 0, clearcoat: 1, depthWrite: false, side: THREE.FrontSide });
    glass = new THREE.Mesh(circle, glassMaterial); glass.name = 'Notes clear glass'; glass.renderOrder = 1;
    const tintMaterial = new THREE.MeshBasicMaterial({color:0x78b6bd,transparent:true,opacity:.085,depthWrite:false,side:THREE.BackSide});
    const tint = new THREE.Mesh(circle,tintMaterial); tint.name = 'Notes tinted rear glass'; tint.position.z = -.0005; carrier.add(tint); resources.push(tintMaterial);
    const ringGeometry = new THREE.RingGeometry(NOTES_MOUNT.radius - .0015, NOTES_MOUNT.radius + .0015, 128), ringMaterial = new THREE.MeshBasicMaterial({ color: '#e1edf0', transparent: true, opacity: .18 + contrast * .22, depthWrite: false, side: THREE.DoubleSide });
    ring = new THREE.Mesh(ringGeometry, ringMaterial); ring.position.z = .0005;
    for (let i = 1; i < 3; i++) {
      const material = glassMaterial.clone(); material.opacity = .012; const pane = new THREE.Mesh(circle, material); pane.position.z = -i * .006; pane.visible = false; rearPanes.push(pane); carrier.add(pane); resources.push(material);
    }
    texture = new THREE.CanvasTexture(editor.canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
    const artGeometry = new THREE.PlaneGeometry(NOTES_MOUNT.radius * SIZE / RADIUS, NOTES_MOUNT.radius * SIZE / RADIUS), artMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
    const art = new THREE.Mesh(artGeometry, artMaterial); art.name = 'Notes vector artwork'; art.position.z = .001; art.renderOrder = 2;
    const rearMaterial = artMaterial.clone(); rearMaterial.side = THREE.BackSide;
    rearArt = new THREE.Mesh(artGeometry,rearMaterial); rearArt.name = 'Notes optional rear artwork'; rearArt.position.z = -.013; rearArt.visible = rearArtwork; rearArt.renderOrder = 2; carrier.add(rearArt); resources.push(rearMaterial);
    const overflowGeometry = new THREE.BufferGeometry(), overflowMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: outlineOpacity(contrast), depthTest: false, depthWrite: false, toneMapped: false });
    overflow = new THREE.LineSegments(overflowGeometry, overflowMaterial); overflow.name = 'Notes off-pane outlines'; overflow.renderOrder = 4; overflow.frustumCulled = false; overflow.raycast = () => {};
    const dynamicGeometry = new THREE.BufferGeometry();
    dynamicOverflow = new THREE.LineSegments(dynamicGeometry, overflowMaterial); dynamicOverflow.name = 'Notes live control outlines'; dynamicOverflow.renderOrder = 5; dynamicOverflow.frustumCulled = false; dynamicOverflow.raycast = () => {};
    // This shares the glass carrier and WebGL canvas. DOM panels always
    // composite above it, and no extra DOM layer can intercept their input.
    carrier.add(glass, ring, art, overflow, dynamicOverflow); cube.add(group);
    resources.push(circle, glassMaterial, ringGeometry, ringMaterial, texture, artGeometry, artMaterial, overflowGeometry, dynamicGeometry, overflowMaterial); syncOverflow();
    bindInput(canvas);
  }
  function mapCube(event) {
    if (!host || !carrier) return null;
    const rect = host.canvas.getBoundingClientRect(); ndc.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    raycaster.setFromCamera(ndc, host.camera); carrier.updateWorldMatrix(true, false); carrier.getWorldPosition(worldCenter); worldNormal.set(0, 0, 1).transformDirection(carrier.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(worldNormal, worldCenter); const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3()); if (!hit) return null;
    carrier.worldToLocal(hit); const units = RADIUS / NOTES_MOUNT.radius; return { x: SIZE / 2 + hit.x * units, y: SIZE / 2 - hit.y * units };
  }
  function releaseDrawing(cancel = false) {
    editor.finishGesture(cancel); activePointer = null; turnPointer = null;
    for (const [element, id] of captures) if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
    captures.clear(); onInputOwnership(false);
  }
  function capture(element, event) { element.setPointerCapture(event.pointerId); captures.add([element, event.pointerId]); }
  function bindInput(canvas) {
    canvasInput?.abort(); canvasInput = new AbortController();
    const signal = canvasInput.signal;
    canvas.addEventListener('dragover', event => { if (focused && event.dataTransfer.types.includes('application/x-notes-gear')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }, { signal });
    canvas.addEventListener('drop', event => {
      if (!focused) return; const point = mapCube(event); if (!onGlass(point)) return;
      try { if (editor.dropGear(point, JSON.parse(event.dataTransfer.getData('application/x-notes-gear')))) { event.preventDefault(); event.stopPropagation(); } } catch { /* Ignore unrelated or malformed drops. */ }
    }, { signal });
    canvas.addEventListener('pointerdown', event => {
      if (suspended || !enabled || !host) return; if (event.button !== 0) { if (event.button === 2) editor.pointerLeave(); return; }
      if (activePointer !== null || turnPointer) { releaseDrawing(true); return; }
      if (turnMode || event.pointerType === 'touch' && !focused) {
        editor.finishPath(); turnPointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; capture(canvas, event); onInputOwnership(true); event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      const point = mapCube(event); if (!focused || turnMode || !point) return;
      if (editor.pointerDown(point, event)) { activePointer = event.pointerId; capture(canvas, event); onInputOwnership(true); canvas.focus({ preventScroll: true }); event.stopImmediatePropagation(); }
    }, { capture: true, signal });
    canvas.addEventListener('pointermove', event => {
      if (turnPointer?.id === event.pointerId) {
        onRotate(event.clientX - turnPointer.x, event.clientY - turnPointer.y); turnPointer.x = event.clientX; turnPointer.y = event.clientY; event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if (activePointer === event.pointerId) {
        const samples = event.getCoalescedEvents?.(); for (const sample of samples?.length ? samples : [event]) editor.pointerMove(mapCube(sample), event);
        event.preventDefault(); event.stopImmediatePropagation();
      } else if (focused && !turnMode && !event.buttons) editor.pointerMove(mapCube(event), event);
    }, { capture: true, signal });
    canvas.addEventListener('pointerleave', () => { if (activePointer === null) editor.pointerLeave(); }, { signal });
    canvas.addEventListener('pointerup', event => {
      if (activePointer !== event.pointerId && turnPointer?.id !== event.pointerId) return;
      if (activePointer === event.pointerId) editor.pointerMove(mapCube(event), event); releaseDrawing(); event.stopImmediatePropagation();
    }, { capture: true, signal });
    for (const name of ['pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => { if (activePointer === event.pointerId || turnPointer?.id === event.pointerId) releaseDrawing(name === 'pointercancel'); }, { signal });
    canvas.addEventListener('dblclick', event => { if (focused && !turnMode) { const point = mapCube(event); if (onGlass(point) || point && editor.tool === 'select') { editor.doubleClick(point); event.preventDefault(); event.stopImmediatePropagation(); } } }, { capture: true, signal });
    for (const name of ['mousedown', 'mouseup', 'click']) canvas.addEventListener(name, event => { if (focused && !turnMode && event.button === 0 && (onGlass(mapCube(event)) || editor.tool === 'select')) event.stopImmediatePropagation(); }, { capture: true, signal });
  }
  window.addEventListener('blur', () => {releaseDrawing();}, { signal: input.signal });
  window.addEventListener('keydown', event => {
    if (!enabled || suspended || !host || !focused || document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])')) return;
    if (event.target?.closest?.('.review-panel,.settings-context-menu')) return;
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && !event.target?.closest?.('input,select,textarea,[contenteditable="true"]')) {
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'c') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (key === 'z') { setTurnMode(false); onFocusFace(NOTES_MOUNT); } else setTurnMode(!turnMode);
        return;
      }
    }
    if (editor.keydown(event)) setTurnMode(false);
  }, { capture: true, signal: input.signal });
  function updateRoll(dt) {
    group.updateWorldMatrix(true, false); host.camera.updateMatrixWorld(true); inverse.copy(group.matrixWorld).invert();
    screenRight.setFromMatrixColumn(host.camera.matrixWorld, 0).transformDirection(inverse); cameraNormal.setFromMatrixColumn(host.camera.matrixWorld, 2).transformDirection(inverse);
    if (!upright) { rollTarget = roll + wrap(-roll); lastRoll = null; }
    else if (cameraNormal.z > .08 && screenRight.x * screenRight.x + screenRight.y * screenRight.y > .0064) {
      const raw = Math.atan2(screenRight.y, screenRight.x); rollTarget = lastRoll === null ? roll + wrap(raw - roll) : rollTarget + wrap(raw - lastRoll); lastRoll = raw;
    } else lastRoll = null;
    if (activePointer !== null) { rollVelocity = 0; return; }
    if (reduced) { roll = rollTarget; rollVelocity = 0; }
    else {
      const step = Math.min(.05, Math.max(0, dt)), delta = rollTarget - roll;
      rollVelocity = THREE.MathUtils.clamp(rollVelocity + THREE.MathUtils.clamp(36 * delta - 12 * rollVelocity, -12, 12) * step, -2.6, 2.6); roll += rollVelocity * step;
      if (Math.abs(delta) < .0001 && Math.abs(rollVelocity) < .001) { roll = rollTarget; rollVelocity = 0; }
    }
    carrier.rotation.z = roll; carrier.updateWorldMatrix(false, true);
  }
  function update(dt, rotating = false) {
    if (!host || disposed || suspended || !enabled) return;
    editor.tick(dt, focused); editor.flush();
    updateRoll(dt); const local = host.cube.worldToLocal(host.camera.getWorldPosition(new THREE.Vector3())), dominant = -local.x > Math.max(Math.abs(local.y), Math.abs(local.z)) * (focused ? .9 : 1.02);
    const gainedFocus = !focused && dominant;
    if (focused !== dominant) {
      focused = dominant; if (!focused && !turnPointer) { releaseDrawing(); editor.finishPath(); }
      host.canvas.setAttribute('aria-label', focused ? 'Notes drawing glass. V Select, N Pencil, P Pen, L Line, R Rectangle, E Ellipse, O Polygon, D Diamond, H Heart, S Star, U Arc, I Torus, J Pacman.' : host.baseLabel);
    }
    // UI dwell and CSS timing use elapsed time even when the host caps physics steps.
    const now = performance.now(), elapsed = presenceTime === null ? 0 : (now - presenceTime) / 1000; presenceTime = now;
    const facing=-local.x/local.length();
    tabletFocused=focused && facing>(tabletFocused?.86:.92);
    const previousPhase = panelState.phase; panelState = presence.update(gainedFocus ? 0 : elapsed, tabletFocused);
    if (panelState.phase !== previousPhase) ui.dataset.presence = panelState.phase;
    const showPanels = panelState.visible;
    if (ui.hidden !== !showPanels || ui.inert !== !panelState.interactive) showTools(showPanels, panelState.interactive);
    if (focused) {
      const a = carrier.localToWorld(new THREE.Vector3(-NOTES_MOUNT.radius, 0, 0)).project(host.camera), b = carrier.localToWorld(new THREE.Vector3(NOTES_MOUNT.radius, 0, 0)).project(host.camera);
      editor.setHandleUnit(SIZE * 7 / Math.max(120, Math.abs(b.x - a.x) * host.canvas.clientWidth / 2));
    }
    rearPanes.forEach((pane, i) => { pane.visible = editor.layerCount > i + 1; }); syncLayers();
    for (const node of [overflow, dynamicOverflow]) if (node) node.visible = focused && node.userData.hasLines === true;
    const cursor = focused && !turnMode && !rotating ? editor.cursor : '';
    if (host.canvas.style.cursor !== cursor) host.canvas.style.cursor = cursor;
  }
  function detach() {
    editor.tick(0, false);
    canvasInput?.abort(); canvasInput = null;
    if (host) { host.canvas.style.cursor = ''; if (host.baseLabel) host.canvas.setAttribute('aria-label', host.baseLabel); }
    releaseDrawing(); editor.finishPath(); group?.removeFromParent(); hiddenBacking.splice(0).forEach(([node, visible]) => { node.visible = visible; });
    resources.splice(0).forEach(r => r.dispose()); rearPanes.length = 0; host = group = carrier = texture = glass = ring = overflow = dynamicOverflow = rearArt = null; focused = tabletFocused = false; panelState = presence.reset(); presenceTime = null; showTools(false);
    dock.querySelectorAll('button').forEach(b => { b.disabled = true; });
  }
  return { attach, update, frameLayout, afterRender, editor, detach,
    get projectionSource() { return texture && carrier ? {texture,carrier,radius:NOTES_MOUNT.radius} : null; },
    endGesture() { releaseDrawing(); editor.finishPath(); },
    get focused() { return focused; }, get blockingPanel() { return ui.hidden ? null : ui; },
    get gestureActive() { return activePointer !== null; }, get rotating() { return Boolean(turnPointer); },
    get rollState() { return { angle: roll, target: rollTarget, enabled: upright }; },
    suspend() { suspended = true; editor.tick(0, false); releaseDrawing(); focused = tabletFocused = false; panelState = presence.reset(); presenceTime = null; showTools(false); if (host) { host.canvas.style.cursor = ''; host.canvas.setAttribute('aria-label', host.baseLabel); } }, resume() { suspended = false; },
    dispose() { if (disposed) return; detach(); disposed = true; input.abort(); headerLayoutObserver.disconnect(); stopSettings(); unregisterAdminInterlock(); unregisterSettings(); editor.dispose(); ui.remove(); dock.remove(); }
  };
}
