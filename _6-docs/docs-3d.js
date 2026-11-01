import { bootstrapPage } from '../_7-shared-scripts/core/bootstrap.js';
import { registerPageSummaryPoints } from '../_7-shared-scripts/core/page-summary.js';
import { initPanelShell } from '../debug/panel-shell.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { applyStandardGlbMouseControlMode, installStandardGlbMouseControls } from '../_7-shared-scripts/shared-glb-mouse-controls.js';
import { panelViewport } from '../_7-shared-scripts/core/panel-viewport.js';
import { trackFloatingViewport } from '../_7-shared-scripts/core/floating-viewport.js';
import { validateLibrary } from './library/schema.js';
import { mountDocsEditor } from './library/editor.js';
import { createSceneStickyAdapter, createSceneInputOwnership } from '../_7-shared-scripts/sticky-notes/scene-adapter.js';
import { prefersReducedMotion } from '../_7-shared-scripts/core/motion-preference.js';
import { createDeskDrawers } from './desk-drawers.js';

const HIDDEN_DOCUMENT_IDS = new Set(['pretty-pets']);

void bootstrapPage({ pageId: 'docs', async mount({ scope, settings }) {
  const mount = document.querySelector('#glb-viewer'), list = document.querySelector('#document-list');
  const dialog = document.querySelector('#document-dialog'), frame = document.querySelector('#document-frame');
  const title = document.querySelector('#document-title'), description = document.querySelector('#document-description');
  const openLink = document.querySelector('#document-open'), close = document.querySelector('#document-close'), edit = document.querySelector('#document-edit'), previous = document.querySelector('#document-previous'), next = document.querySelector('#document-next'), fallback = document.querySelector('#document-fallback'), textView = document.querySelector('#document-text');
  const content = document.createElement('div'); content.className = 'docs-reader-content';
  frame.before(content); content.append(frame, textView, fallback);
  scope.defer(trackFloatingViewport(document, '#document-dialog'));
  function sizePresentation() {
    if (frame.hidden) return;
    if (!frame.classList.contains('document-presentation')) { frame.style.removeProperty('width'); frame.style.removeProperty('height'); return; }
    const width = Math.min(content.clientWidth, content.clientHeight * 16 / 9);
    frame.style.width = `${Math.max(0, width)}px`; frame.style.height = `${Math.max(0, width * 9 / 16)}px`;
  }
  const contentResize = new ResizeObserver(sizePresentation); contentResize.observe(content);
  scope.defer(() => { contentResize.disconnect(); content.before(frame, textView, fallback); content.remove(); });
  const pdfView = document.createElement('section'); pdfView.className = 'docs-pdf-view'; pdfView.hidden = true;
  const pdfToolbar = document.createElement('div'); pdfToolbar.className = 'docs-pdf-toolbar';
  const pdfPrevious = document.createElement('button'), pdfNext = document.createElement('button'), pdfMode = document.createElement('button'), pdfCover = document.createElement('button'), pdfCount = document.createElement('span'), pdfLimit = document.createElement('span');
  for (const button of [pdfPrevious, pdfNext, pdfMode, pdfCover]) button.type = 'button';
  pdfPrevious.textContent = '← Pages'; pdfNext.textContent = 'Pages →'; pdfMode.textContent = 'Two pages'; pdfCover.textContent = 'Cover first';
  pdfToolbar.append(pdfPrevious, pdfCount, pdfNext, pdfMode, pdfCover, pdfLimit);
  const pdfSpread = document.createElement('div'); pdfSpread.className = 'docs-pdf-spread'; pdfView.append(pdfToolbar, pdfSpread); frame.after(pdfView);
  let pdfStart = 0, pdfTwoPages = true, pdfCoverFirst = true;
  const status = document.createElement('p'); status.className = 'docs-desk-status'; status.textContent = 'Loading the desk…'; mount.append(status);
  let library, scene, camera, renderer, controls, sharedMouse, stickyAdapter, desk, drawers, paperGroup, raf = 0, renderFrame = null, suspended = false, disposed = false, resizeObserver, stickyOwnsInput = false, down = null;
  let lastFocus, focusedId = null, textRequest = 0, editorElement, cleanupPoints = () => {}, libraryLoaded = false;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const inputOwnership = createSceneInputOwnership(() => controls);
  function renderPdfPages(item) {
    const images = item.pageImages || [], count = images.length;
    pdfSpread.replaceChildren();
    const coverAlone = pdfTwoPages && pdfCoverFirst && pdfStart === 0;
    const end = Math.min(count, pdfStart + (pdfTwoPages && !coverAlone ? 2 : 1));
    for (let index = pdfStart; index < end; index++) {
      const image = document.createElement('img'); image.src = images[index]; image.alt = `Page ${index + 1} of ${item.pageCount || count}`; pdfSpread.append(image);
    }
    pdfCount.textContent = `Pages ${pdfStart + 1}${end > pdfStart + 1 ? `–${end}` : ''} of ${item.pageCount || count}`;
    pdfPrevious.disabled = pdfStart === 0; pdfNext.disabled = end >= count;
    pdfMode.textContent = pdfTwoPages ? 'Single page' : 'Two pages';
    pdfCover.textContent = pdfCoverFirst ? 'Cover first: on' : 'Cover first: off';
    pdfCover.hidden = !pdfTwoPages;
    pdfLimit.textContent = item.pageCount > count ? `Preview includes the first ${count} pages. Open the original for pages ${count + 1}–${item.pageCount}.` : '';
  }
  function stepPdf(direction) {
    const item = library.items.find(entry => entry.id === focusedId); if (!item?.pageImages?.length) return;
    const count = item.pageImages.length;
    const step = pdfTwoPages ? 2 : 1;
    if (direction > 0) pdfStart = pdfTwoPages && pdfCoverFirst && pdfStart === 0 ? 1 : Math.min(count - 1, pdfStart + step);
    else pdfStart = pdfTwoPages && pdfCoverFirst && pdfStart <= 2 ? 0 : Math.max(0, pdfStart - step);
    renderPdfPages(item);
  }
  scope.listen(pdfPrevious, 'click', () => stepPdf(-1)); scope.listen(pdfNext, 'click', () => stepPdf(1));
  scope.listen(pdfMode, 'click', () => { pdfTwoPages = !pdfTwoPages; pdfStart = 0; const item = library.items.find(entry => entry.id === focusedId); if (item) renderPdfPages(item); });
  scope.listen(pdfCover, 'click', () => { pdfCoverFirst = !pdfCoverFirst; pdfStart = 0; const item = library.items.find(entry => entry.id === focusedId); if (item) renderPdfPages(item); });
  function updateFocusedDocument() {
    if (!focusedId || !dialog.open) return;
    const item = library.items.find(entry => entry.id === focusedId);
    if (!item) { dialog.close(); return; }
    const index = library.items.indexOf(item); previous.disabled = index <= 0; next.disabled = index >= library.items.length - 1;
    title.textContent = item.title; description.textContent = item.description;
    frame.title = item.title;
    const request = ++textRequest;
    const plainText = item.type === 'document' && /\.(txt|md)$/i.test(item.sourceUrl);
    textView.hidden = !plainText;
    fallback.hidden = item.type !== 'document' || plainText;
    const renderedPdf = item.type === 'pdf' && !!item.pageImages?.length;
    pdfView.hidden = !renderedPdf;
    if (renderedPdf) renderPdfPages(item);
    if (plainText) {
      textView.textContent = 'Loading document…';
      fetch(item.sourceUrl).then(response => { if (!response.ok) throw new Error('Unavailable'); return response.text(); })
        .then(value => { if (request === textRequest) textView.textContent = value.slice(0, 100000); })
        .catch(() => { if (request === textRequest) textView.textContent = 'The original document could not be loaded. Open it with the link below.'; });
    }
    if (['pdf', 'image', 'presentation'].includes(item.type) && !renderedPdf) {
      frame.hidden = false;
      if (frame.getAttribute('src') !== item.sourceUrl) frame.src = item.sourceUrl;
    } else { frame.hidden = true; frame.removeAttribute('src'); }
    frame.className = item.type === 'presentation' ? 'document-presentation' : 'document-paper';
    sizePresentation();
    openLink.href = item.sourceUrl;
    openLink.textContent = item.type === 'presentation' ? 'Open presentation in a new tab' : 'Open original document';
  }
  function openDocument(id, opener) {
    const item = library.items.find(entry => entry.id === id); if (!item || HIDDEN_DOCUMENT_IDS.has(item.id)) return;
    lastFocus = opener || document.activeElement; focusedId = id; pdfStart = 0;
    pdfCoverFirst = item.coverFirst !== false;
    if (!dialog.open) dialog.show();
    updateFocusedDocument(); close.focus();
  }
  scope.listen(edit, 'click', () => { if (!focusedId) return; editorElement?.selectDocument?.(focusedId); initPanelShell().openConstructor('page'); });
  scope.listen(previous, 'click', () => { const index = library.items.findIndex(item => item.id === focusedId); if (index > 0) openDocument(library.items[index - 1].id, lastFocus); });
  scope.listen(next, 'click', () => { const index = library.items.findIndex(item => item.id === focusedId); if (index >= 0 && index < library.items.length - 1) openDocument(library.items[index + 1].id, lastFocus); });
  scope.listen(close, 'click', () => dialog.close());
  scope.listen(document, 'pointerdown', event => { if (dialog.open && !dialog.contains(event.target) && !event.target.closest?.('#review-panels')) dialog.close(); }, true);
  scope.listen(document, 'keydown', event => { if (dialog.open && event.key === 'Escape') { event.preventDefault(); dialog.close(); } }, true);
  scope.listen(dialog, 'close', () => { focusedId = null; textRequest++; frame.removeAttribute('src'); lastFocus?.focus?.(); });
  function disposePapers() { if (!paperGroup) return; for (const object of [...paperGroup.children]) { paperGroup.remove(object); object.geometry?.dispose(); object.material?.map?.dispose(); object.material?.dispose(); } }
  function disposeModel(model) {
    model?.traverse(object => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
      for (const material of materials) {
        for (const key of ['map','normalMap','roughnessMap','metalnessMap','bumpMap','emissiveMap','aoMap']) material[key]?.dispose();
        material.dispose();
      }
    });
  }
  function renderLibrary(next) {
    const previousCoverFirst = library?.items.find(item => item.id === focusedId)?.coverFirst !== false;
    library = validateLibrary(next); list.replaceChildren(); disposePapers();
    const focusedItem = library.items.find(item => item.id === focusedId);
    if (focusedItem?.type === 'pdf' && focusedItem.pageImages?.length && previousCoverFirst !== (focusedItem.coverFirst !== false)) {
      pdfCoverFirst = focusedItem.coverFirst !== false;
      pdfStart = 0;
    }
    updateFocusedDocument();
    const visibleItems = library.items.filter(item => !HIDDEN_DOCUMENT_IDS.has(item.id));
    const libraryHeading = document.querySelector('#docs-library-heading');
    const libraryIntro = document.querySelector('.docs-library-panel > p');
    if (visibleItems.length === 0) {
      if (libraryHeading) libraryHeading.textContent = 'Desk controls';
      if (libraryIntro) libraryIntro.hidden = true;
      list.hidden = true;
    } else {
      if (libraryHeading) libraryHeading.textContent = 'Teaching resources';
      if (libraryIntro) libraryIntro.hidden = false;
      list.hidden = false;
    }
    visibleItems.forEach((item, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'docs-library-item';
      const cover = document.createElement('span'); cover.className = 'docs-library-cover';
      if (item.previewUrl) { const image = document.createElement('img'); image.src = item.previewUrl; image.alt = ''; cover.append(image); }
      else cover.textContent = item.type.toUpperCase();
      const label = document.createElement('span'); label.className = 'docs-library-label';
      const strong = document.createElement('strong'); strong.textContent = item.title;
      const small = document.createElement('small'); small.textContent = item.description;
      label.append(strong, small); button.append(cover, label);
      button.addEventListener('click', () => openDocument(item.id, button)); list.append(button);
      if (!paperGroup) return;
      const geometry = new THREE.PlaneGeometry(item.width * item.scale, item.height * item.scale);
      const fallback = document.createElement('canvas'); fallback.width = 512; fallback.height = Math.max(160, Math.round(512 * item.height / item.width));
      const context = fallback.getContext('2d'); context.fillStyle = '#f9f3e4'; context.fillRect(0, 0, fallback.width, fallback.height);
      context.fillStyle = '#30231d'; context.textAlign = 'center'; context.font = 'bold 32px Georgia';
      context.fillText(item.title.slice(0, 26), 256, fallback.height * .5, 470); context.font = '18px Georgia'; context.fillText(item.type.toUpperCase(), 256, fallback.height * .75);
      const texture = new THREE.CanvasTexture(fallback); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: .92 });
      const mesh = new THREE.Mesh(geometry, material); mesh.rotation.x = -Math.PI / 2; mesh.rotation.z = THREE.MathUtils.degToRad(item.rotation);
      mesh.position.set(item.x, .593 + index * .0003, item.z); mesh.userData.documentId = item.id; paperGroup.add(mesh);
      if (item.previewUrl) new THREE.TextureLoader().load(item.previewUrl, loaded => {
        if (disposed || !mesh.parent) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        const image = loaded.image, ratio = image.width / image.height, planeRatio = item.width / item.height;
        if (Math.abs(ratio - planeRatio) > .01) {
          const canvas = document.createElement('canvas');
          canvas.width = 1024; canvas.height = Math.max(256, Math.round(1024 / planeRatio));
          const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
          const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
          const width = image.width * scale, height = image.height * scale;
          context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
          const contained = new THREE.CanvasTexture(canvas); contained.colorSpace = THREE.SRGBColorSpace;
          loaded.dispose(); loaded = contained;
        }
        material.map?.dispose(); material.map = loaded; material.needsUpdate = true;
      }, undefined, () => {});
    });
    if (paperGroup) {
      const notice = document.createElement('canvas'); notice.width = 768; notice.height = 768;
      const context = notice.getContext('2d');
      context.fillStyle = '#fff2a8'; context.fillRect(0, 0, notice.width, notice.height);
      context.strokeStyle = '#d8c467'; context.lineWidth = 10; context.strokeRect(12, 12, notice.width - 24, notice.height - 24);
      context.fillStyle = '#35291c'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.font = 'bold 106px Georgia'; context.fillText('Teacher', 384, 210, 680);
      context.fillText('documents', 384, 384, 680);
      context.fillText('coming soon', 384, 558, 680);
      const texture = new THREE.CanvasTexture(notice); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: .94 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.2, .2), material);
      mesh.name = 'Teacher documents coming soon note';
      mesh.rotation.set(-Math.PI / 2, 0, THREE.MathUtils.degToRad(-3));
      mesh.position.set(.7, .592 + visibleItems.length * .0003, -.58);
      paperGroup.add(mesh);
    }
    cleanupPoints(); cleanupPoints = registerPageSummaryPoints('docs', visibleItems.map(item => ({ label: item.title, href: item.sourceUrl })));
  }
  try {
    const response = await fetch('./documents.json', { cache: 'no-store' }); if (!response.ok) throw new Error('Library unavailable');
    libraryLoaded = true;
    library = validateLibrary(await response.json());
    try { const draft = localStorage.getItem('docs-library-draft-v1'); if (draft) library = validateLibrary(JSON.parse(draft)); } catch { /* Ignore a damaged local draft. */ }
    renderLibrary(library);
  }
  catch (error) { status.textContent = 'Documents are temporarily unavailable.'; library = { version: 1, items: [] }; console.warn('[docs] Library could not load', error); }
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
    renderer.domElement.className = 'glb-viewer-canvas'; renderer.domElement.setAttribute('aria-label', 'Interactive document desk. A note reads: Teacher documents coming soon.'); renderer.domElement.tabIndex = 0; mount.append(renderer.domElement);
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(38, 1, .02, 20); camera.position.set(2.25, 1.85, -2.6);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x514531, 2.1));
    const key = new THREE.DirectionalLight(0xfff1d3, 2.4); key.position.set(-1, 3, 3); scene.add(key);
    const fill = new THREE.DirectionalLight(0xaed1ff, .9); fill.position.set(2, 2, -2); scene.add(fill);
    const frontFill = new THREE.DirectionalLight(0xfff2df, 1.3); frontFill.position.set(1, 1.3, -3); scene.add(frontFill);
    controls = new OrbitControls(camera, renderer.domElement); controls.target.set(.7, .45, -.58);
    controls.enableDamping = true; controls.dampingFactor = .08; controls.minDistance = 1.3; controls.maxDistance = 5;
    controls.minPolarAngle = .22; controls.maxPolarAngle = 1.48; controls.update();
    applyStandardGlbMouseControlMode(controls, { enabled: true, allowRotate: true, allowZoom: true });
    sharedMouse = installStandardGlbMouseControls({ controls, domElement: renderer.domElement }); sharedMouse?.captureDefaultPose();
    const gltf = await new GLTFLoader().loadAsync('./assets/desk.glb');
    if (scope.disposed || disposed) { disposeModel(gltf.scene); renderer.dispose(); renderer.domElement.remove(); return; }
    desk = gltf.scene; scene.add(desk);
    const lamp = desk.getObjectByName('Desklamp_Base');
    if (lamp) {
      desk.updateMatrixWorld(true);
      const movedWorld = lamp.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(.04, 0, .02));
      lamp.position.copy(lamp.parent.worldToLocal(movedWorld));
      lamp.traverse(node => { node.userData.stickyNoteBlocker = true; });
    }
    const hoplet = desk.getObjectByName('Drawer_TR');
    if (hoplet) {
      const hopletGltf = await new GLTFLoader().loadAsync('./assets/hoplet.glb');
      if (scope.disposed || disposed) { disposeModel(hopletGltf.scene); renderer.dispose(); renderer.domElement.remove(); return; }
      const model = hopletGltf.scene;
      model.userData.opensHopletGame = true;
      model.updateMatrixWorld(true);
      const modelBounds = new THREE.Box3().setFromObject(model), modelSize = modelBounds.getSize(new THREE.Vector3());
      const center = modelBounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -modelBounds.min.y, -center.z);
      const tray = new THREE.Box3().setFromObject(hoplet), traySize = tray.getSize(new THREE.Vector3());
      const trayWorldScale = hoplet.getWorldScale(new THREE.Vector3());
      const scale = Math.min(traySize.x * .34 / modelSize.x, traySize.z * .34 / modelSize.z, traySize.y * .18 / modelSize.y);
      const anchor = new THREE.Group(); anchor.name = 'Hoplet on top-right drawer bottom'; hoplet.add(anchor);
      anchor.scale.set(scale / trayWorldScale.x, scale / trayWorldScale.y, scale / trayWorldScale.z);
      const ray = new THREE.Raycaster(new THREE.Vector3((tray.min.x + tray.max.x) / 2, tray.max.y + .05, (tray.min.z + tray.max.z) / 2), new THREE.Vector3(0, -1, 0));
      const floor = ray.intersectObject(hoplet, false)[0]?.point;
      if (floor) {
        anchor.position.copy(hoplet.worldToLocal(floor.clone()));
        anchor.position.y += .002 / Math.max(.0001, trayWorldScale.y);
        anchor.add(model);
        const hitTarget = new THREE.Mesh(new THREE.BoxGeometry(modelSize.x, modelSize.y, modelSize.z),
          new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0, side: THREE.DoubleSide }));
        hitTarget.name = 'Hoplet game click target'; hitTarget.userData.opensHopletGame = true;
        hitTarget.position.y = modelSize.y / 2; anchor.add(hitTarget);
      } else { hoplet.remove(anchor); disposeModel(model); console.warn('[docs] Hoplet could not find the open drawer bottom.'); }
    }
    paperGroup = new THREE.Group(); scene.add(paperGroup); renderLibrary(library);
    const drawerControlsHost = document.querySelector('.docs-library-panel');
    drawers = createDeskDrawers(desk, { reducedMotion: prefersReducedMotion,
      canInteract: () => !disposed && !suspended && !stickyOwnsInput && !dialog.open,
      controlsHost: drawerControlsHost });
    stickyAdapter = createSceneStickyAdapter({pageId: 'docs', scene, canvas: renderer.domElement, getCamera: () => camera,
      getRoot: () => scene, scope, onInputOwnership: owned => { stickyOwnsInput = owned; if (owned) down = null; inputOwnership(owned); }});
    if (libraryLoaded) status.remove();
    function updateFraming() {
      const rect = renderer.domElement.getBoundingClientRect(), width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
      const view = panelViewport(renderer.domElement);
      const nav = document.querySelector('.nav-wrap, .shared-nav-wrap')?.getBoundingClientRect();
      const navOffset = nav && nav.left < rect.right && nav.right > rect.left && nav.top < rect.bottom && nav.bottom > rect.top
        ? Math.max(0, Math.min(width, nav.right - rect.left)) / 2 : 0;
      // Negative view offsets move the physical desk right, clear of the fixed
      // navigation rail. Positive panel offsets still move the desk left.
      const offsetX = Math.max(-width, Math.min(width, view.offsetX - navOffset));
      const current = camera.view;
      if (!current?.enabled || current.fullWidth !== width || current.fullHeight !== height || current.offsetX !== offsetX || current.offsetY !== 0)
        camera.setViewOffset(width, height, offsetX, 0, width, height);
    }
    function resize() { if (disposed) return; const box = mount.getBoundingClientRect(); camera.aspect = Math.max(1, box.width) / Math.max(1, box.height); camera.updateProjectionMatrix(); renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false); updateFraming(); }
    resize(); resizeObserver = new ResizeObserver(resize); resizeObserver.observe(mount);
    renderFrame = function renderDeskFrame() { if (disposed || suspended) return; updateFraming(); controls.update(); drawers?.update(); stickyAdapter?.update(); renderer.render(scene, camera); raf = requestAnimationFrame(renderFrame); };
    renderFrame();
    const clickEvents = new AbortController();
    renderer.domElement.addEventListener('pointerdown', event => { down = !event.defaultPrevented && !stickyOwnsInput && !dialog.open && event.button === 0 && event.buttons === 1 ? { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false, released: false } : null; }, { signal: clickEvents.signal });
    renderer.domElement.addEventListener('pointermove', event => { if (down && (event.pointerId !== down.id || event.buttons !== 1 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6)) down.moved = true; }, { signal: clickEvents.signal });
    renderer.domElement.addEventListener('pointerup', event => { if (down) { down.moved ||= event.defaultPrevented || stickyOwnsInput || event.pointerId !== down.id || event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6; down.released = true; } }, { signal: clickEvents.signal });
    renderer.domElement.addEventListener('click', event => {
      if (!down || down.moved || !down.released || event.defaultPrevented || event.button !== 0 || !drawers || disposed || suspended || stickyOwnsInput || dialog.open) { down = null; return; }
      down = null;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const intersections = raycaster.intersectObjects([paperGroup, desk], true);
      const hopletHit = intersections.find(intersection => {
        for (let target = intersection.object; target; target = target.parent) {
          if (target.userData?.opensHopletGame) return true;
        }
        return false;
      });
      const nearestBlocker = intersections.find(intersection => {
        for (let target = intersection.object; target; target = target.parent) {
          if (target.userData?.opensHopletGame) return false;
        }
        return true;
      });
      if (hopletHit && (!nearestBlocker || hopletHit.distance <= nearestBlocker.distance + .003)) {
        window.location.assign('../games/hoplet-prototype/index.html'); return;
      }
      const hit = intersections[0];
      if (hit?.object.userData.documentId) openDocument(hit.object.userData.documentId, renderer.domElement);
      else if (hit) drawers.toggleHit(hit.object);
    }, { signal: clickEvents.signal });
    renderer.domElement.addEventListener('pointercancel', () => { down = null; }, { signal: clickEvents.signal });
    scope.defer(() => clickEvents.abort());
  } catch (error) { console.warn('[docs] Desk could not render', error); status.textContent = 'The desk is unavailable. Choose a document below.'; mount.classList.add('docs-desk-unavailable'); }
  editorElement = mountDocsEditor({ library, onChange: renderLibrary });
  const unregister = initPanelShell().registerConstructorContext('page', 'Docs', editorElement);
  const stopSettings = settings.subscribe(snapshot => {
    if (renderer) renderer.toneMappingExposure = Math.max(.65, Math.min(1.7, 1.12 * Number(snapshot.start?.brightness ?? 1)));
    mount.style.setProperty('--docs-contrast', String(Math.max(.5, Math.min(1.5, Number(snapshot.start?.contrast ?? 1)))));
  }, { immediate: true });
  return { stickyScene: { scene, canvas: renderer?.domElement, getCamera: () => camera, getRoot: () => desk },
    suspend() { suspended = true; stickyAdapter?.suspend(); cancelAnimationFrame(raf); },
    resume() { if (!suspended || disposed) return; suspended = false; stickyAdapter?.resume(); renderFrame?.(); },
    dispose() { disposed = true; cancelAnimationFrame(raf); resizeObserver?.disconnect(); if (dialog.open) dialog.close(); cleanupPoints(); stopSettings(); unregister(); stickyAdapter?.dispose(); drawers?.dispose(); sharedMouse?.dispose(); controls?.dispose(); disposePapers();
      disposeModel(desk);
      renderer?.dispose(); renderer?.domElement?.remove(); }
  };
} });
