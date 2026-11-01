import {makePlane, planeWorld, fitSurface} from '../../_7-shared-scripts/sticky-notes/placement.js';
import * as THREE from 'three';
import {registerStickySceneAdapter} from '../../_7-shared-scripts/sticky-notes/index.js';
import {inkFor} from '../../_7-shared-scripts/sticky-notes/data.js';
import {noteCanvasFont,loadNoteFont} from '../../_7-shared-scripts/sticky-notes/note-appearance.js';

const point = new THREE.Vector3();
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const normal = new THREE.Vector3();
const tangent = new THREE.Vector3();
const bitangent = new THREE.Vector3();
const probe = new THREE.Vector3();
const targetNormal = new THREE.Vector3();

function baryPoint(geometry, triangle, bary, out) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const vertex = offset => index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset;
  if (!position || (index && triangle * 3 + 2 >= index.count) ||
      (!index && triangle * 3 + 2 >= position.count) || vertex(2) >= position.count) return false;
  a.fromBufferAttribute(position, vertex(0));
  b.fromBufferAttribute(position, vertex(1));
  c.fromBufferAttribute(position, vertex(2));
  out.copy(a).multiplyScalar(bary[0]).addScaledVector(b, bary[1]).addScaledVector(c, bary[2]);
  return true;
}

function paint(note) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = note.color;
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = 'rgba(60,50,0,.45)';
  context.lineWidth = 12;
  context.strokeRect(7, 7, 498, 498);
  context.fillStyle = inkFor(note.color);
  context.font = noteCanvasFont(note.font,44);
  const lines = note.text.trim() ? note.text.trim().split(/\s+/) : [];
  const rows = [''];
  for (const word of lines) {
    const row = rows.at(-1);
    const next = row ? `${row} ${word}` : word;
    if (context.measureText(next).width > 424 && row) rows.push(word);
    else rows[rows.length - 1] = next;
    if (rows.length >= 7) break;
  }
  rows.slice(0, 7).forEach((row, i) => context.fillText(row.slice(0, 30), 40, 94 + i * 55));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export function createGraphicsStickyAdapter({scene, renderer, camera, roomCamera3D, books, games, shelf, environment, shelfContext, invalidate, onEditingChange}) {
  const surfaceMap = new Map();
  const allSurfaces = [];
  function register(prefix, root) {
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      const path = [];
      for (let parent = mesh; parent && parent !== root; parent = parent.parent) {
        path.unshift(parent.parent.children.indexOf(parent));
      }
      const id = `${prefix}:${path.join('.')}`;
      surfaceMap.set(id, mesh);
      allSurfaces.push(mesh);
    });
  }
  books.forEach((book, index) => register(`book:${index + 1}`, book.group));
  register('game', games.root);
  register('shelf', shelf.root);
  register('environment', environment.root);
  register('context', shelfContext.root);

  const entries = new Map();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  let handlers = null;
  let placing = false;
  let editingFocused = false;
  let activeCamera = camera;
  let notesShown = true;
  let showGhosts = false;
  let disposed = false;
  let ownedGesture = null;
  let previousCursor = null;
  const canvas = renderer.domElement;
  const placementHint = document.createElement('div');
  placementHint.className = 'sticky-notes-placement-hint';
  placementHint.hidden = true;
  placementHint.textContent = 'Click a book, box, or shelf surface · Esc cancels';
  canvas.parentElement.append(placementHint);
  const placementPreview = document.createElement('div');
  placementPreview.className = 'sticky-notes-placement-preview';
  placementPreview.hidden = true;
  canvas.parentElement.append(placementPreview);
  const previewGeometry = new THREE.BufferGeometry();
  previewGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
  const previewIndices = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const i = y * 5 + x;
    previewIndices.push(i, i + 5, i + 1, i + 1, i + 5, i + 6);
  }
  previewGeometry.setIndex(previewIndices);
  const previewMaterial = new THREE.MeshBasicMaterial({color: 0xffef78, transparent: true,
    opacity: .6, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true,
    polygonOffsetFactor: -2});
  const previewMesh = new THREE.Mesh(previewGeometry, previewMaterial);
  previewMesh.frustumCulled = false;
  previewMesh.renderOrder = 3;
  previewMesh.visible = false;
  scene.add(previewMesh);
  function makeEntry(note) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(5 * 5 * 3);
    const uvs = new Float32Array(5 * 5 * 2);
    const indices = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const i = y * 5 + x;
      uvs[i * 2] = x / 4;
      uvs[i * 2 + 1] = 1 - y / 4;
      if (x < 4 && y < 4) indices.push(i, i + 5, i + 1, i + 1, i + 5, i + 6);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const texture = paint(note);
    const material = new THREE.MeshStandardMaterial({
      map: texture, transparent: true, side: THREE.DoubleSide, roughness: .9,
      depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.userData.stickyId = note.id;
    scene.add(mesh);
    const entry = {note, mesh, geometry, material, texture, visible: false, anchor: new THREE.Vector3(), patch: null};
    void loadNoteFont(note.font).then(loaded => {
      if (!loaded || disposed || entries.get(note.id) !== entry) return;
      const replacement = paint(note);
      entry.material.map = replacement; entry.material.needsUpdate = true;
      entry.texture.dispose(); entry.texture = replacement; invalidate();
    });
    return entry;
  }
  function discard(entry) {
    scene.remove(entry.mesh);
    entry.geometry.dispose();
    entry.material.dispose();
    entry.texture.dispose();
  }
  function changed(previous, note) {
    return previous.text !== note.text || previous.color !== note.color || previous.font !== note.font ||
      previous.size !== note.size || previous.rotation !== note.rotation ||
      previous.anchor.surface !== note.anchor.surface ||
      previous.anchor.triangle !== note.anchor.triangle ||
      previous.anchor.bary.some((value, index) => value !== note.anchor.bary[index]) ||
      JSON.stringify(previous.anchor.plane) !== JSON.stringify(note.anchor.plane);
  }
  function setNotes(next, dismissed = new Set()) {
    const ids = new Set(next.map(note => note.id));
    for (const [id, entry] of entries) {
      if (ids.has(id)) continue;
      discard(entry);
      entries.delete(id);
    }
    for (const note of next) {
      let entry = entries.get(note.id);
      if (entry && changed(entry.note, note)) {
        discard(entry);
        entries.delete(note.id);
        entry = null;
      }
      if (!entry) {
        entry = makeEntry(note);
        entries.set(note.id, entry);
      }
      entry.dismissed = dismissed.has(note.id);
    }
    invalidate();
  }
  function surfaceVisible(mesh, layer) {
    if (!mesh || !mesh.visible || !mesh.layers.isEnabled(layer)) return false;
    for (let parent = mesh.parent; parent; parent = parent.parent) {
      if (!parent.visible) return false;
    }
    return true;
  }
  function update({state}) {
    activeCamera = state === 'shelf' ? roomCamera3D : camera;
    const layer = state === 'shelf' ? 1 : 0;
    scene.updateMatrixWorld(true);
    activeCamera.updateMatrixWorld(true);
    if (!entries.size) {
      handlers?.visibilityChanged(0);
      return;
    }
    projection.multiplyMatrices(activeCamera.projectionMatrix, activeCamera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    for (const entry of entries.values()) {
      const {note, mesh} = entry;
      const source = surfaceMap.get(note.anchor.surface);
      mesh.visible = false;
      entry.visible = false;
      if (!surfaceVisible(source, layer) ||
          (!note.anchor.plane && !baryPoint(source.geometry, note.anchor.triangle, note.anchor.bary, point))) continue;
      if (note.anchor.plane) {
        const plane=note.anchor.plane;
        if(plane.version===2)planeWorld(THREE,source,plane,point,normal,tangent);
        else {point.fromArray(plane.point).applyMatrix4(source.matrixWorld);
        normal.fromArray(plane.normal).transformDirection(source.matrixWorld).normalize();
        tangent.fromArray(plane.tangent).transformDirection(source.matrixWorld).normalize();}
        bitangent.crossVectors(normal,tangent).normalize();
        const angle=note.rotation*Math.PI/180,ct=Math.cos(angle),st=Math.sin(angle);
        const side=tangent.clone().multiplyScalar(ct).addScaledVector(bitangent,st);
        const top=bitangent.clone().multiplyScalar(ct).addScaledVector(tangent,-st);
        const vertices=entry.geometry.attributes.position;
        for(let y=0;y<5;y++)for(let x=0;x<5;x++){
          const position=point.clone().addScaledVector(side,(x/4-.5)*.35*note.size)
            .addScaledVector(top,(.5-y/4)*.35*note.size);
          vertices.setXYZ(y*5+x,position.x,position.y,position.z);
        }
        vertices.needsUpdate=true;entry.geometry.computeVertexNormals();entry.geometry.computeBoundingSphere();
        entry.material.opacity=entry.dismissed?.32:1;mesh.layers.set(layer);
        mesh.visible=!!placing&&placing===note.id||notesShown&&(!entry.dismissed||showGhosts);
        entry.visible=true;entry.anchor.copy(point);continue;
      }
      const sourcePosition = source.geometry.getAttribute('position');
      const sourceIndex = source.geometry.getIndex();
      const vertex = offset => sourceIndex
        ? sourceIndex.getX(note.anchor.triangle * 3 + offset)
        : note.anchor.triangle * 3 + offset;
      a.fromBufferAttribute(sourcePosition, vertex(0)).applyMatrix4(source.matrixWorld);
      b.fromBufferAttribute(sourcePosition, vertex(1)).applyMatrix4(source.matrixWorld);
      c.fromBufferAttribute(sourcePosition, vertex(2)).applyMatrix4(source.matrixWorld);
      normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      tangent.subVectors(b, a).normalize();
      bitangent.crossVectors(normal, tangent).normalize();
      point.applyMatrix4(source.matrixWorld);
      const view = new THREE.Vector3().subVectors(activeCamera.position, point).normalize();
      if (normal.dot(view) < .06 || !frustum.containsPoint(point)) continue;
      const projected = point.clone().project(activeCamera);
      const canvasRect = canvas.getBoundingClientRect();
      const screenX = canvasRect.left + (projected.x + 1) * canvasRect.width / 2;
      const screenY = canvasRect.top + (1 - projected.y) * canvasRect.height / 2;
      if (screenX < canvasRect.left || screenX > canvasRect.right ||
          screenY < canvasRect.top || screenY > canvasRect.bottom) continue;
      const covering = document.elementFromPoint(screenX, screenY);
      if (covering !== canvas && !canvas.contains(covering) &&
          !covering?.closest?.('.sticky-notes-reader')) continue;
      ray.set(activeCamera.position, point.clone().sub(activeCamera.position).normalize());
      ray.near = 0;
      ray.far = activeCamera.position.distanceTo(point);
      ray.layers.set(layer);
      const visibleSurfaces = allSurfaces.filter(mesh => surfaceVisible(mesh, layer));
      const occluder = ray.intersectObjects(visibleSurfaces, false)[0];
      if (occluder && occluder.distance < ray.far - .015) continue;
      const angle = note.rotation * Math.PI / 180;
      const ct = Math.cos(angle), st = Math.sin(angle);
      const side = tangent.clone().multiplyScalar(ct).addScaledVector(bitangent, st);
      const up = bitangent.clone().multiplyScalar(ct).addScaledVector(tangent, -st);
      const width = .35 * note.size;
      const height = .35 * note.size;
      const vertices = entry.geometry.attributes.position;
      if (!entry.patch) {
        const rayNormal = normal.clone().negate();
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(source.matrixWorld);
        for (const scale of [1, .7, .5, .35, .25]) {
          const patch = [];
          for (let y = 0; y < 5 && patch.length === y * 5; y++) {
            for (let x = 0; x < 5; x++) {
              probe.copy(point)
                .addScaledVector(side, (x / 4 - .5) * width * scale)
                .addScaledVector(up, (.5 - y / 4) * height * scale);
              ray.set(probe.clone().addScaledVector(normal, .14), rayNormal);
              ray.near = 0;
              ray.far = .28;
              ray.layers.set(layer);
              const hit = ray.intersectObject(source, false)[0];
              if (!hit || !hit.face || hit.faceIndex == null || hit.point.distanceTo(probe) > .12) break;
              targetNormal.copy(hit.face.normal).applyNormalMatrix(normalMatrix).normalize();
              if (targetNormal.dot(normal) < .45) break;
              const local = source.worldToLocal(hit.point.clone());
              const face = hit.face;
              const position = source.geometry.getAttribute('position');
              a.fromBufferAttribute(position, face.a);
              b.fromBufferAttribute(position, face.b);
              c.fromBufferAttribute(position, face.c);
              const bary = THREE.Triangle.getBarycoord(local, a, b, c, new THREE.Vector3());
              if (!Number.isFinite(bary.x)) break;
              patch.push({triangle: hit.faceIndex, bary: bary.toArray()});
            }
          }
          if (patch.length === 25) { entry.patch = patch; break; }
        }
        if (!entry.patch) continue;
      }
      let valid = true;
      for (let i = 0; i < 25; i++) {
        const attached = entry.patch[i];
        if (!baryPoint(source.geometry, attached.triangle, attached.bary, probe)) {
          valid = false;
          break;
        }
        probe.applyMatrix4(source.matrixWorld).addScaledVector(normal, .0015);
        vertices.setXYZ(i, probe.x, probe.y, probe.z);
      }
      if (!valid) continue;
      vertices.needsUpdate = true;
      entry.geometry.computeVertexNormals();
      entry.geometry.computeBoundingSphere();
      entry.material.opacity = entry.dismissed ? .32 : 1;
      mesh.layers.set(layer);
      mesh.visible = !!placing && placing === note.id || notesShown && (!entry.dismissed || showGhosts);
      entry.visible = true;
      entry.anchor.copy(point);
    }
    handlers?.visibilityChanged([...entries.values()].filter(entry => entry.visible).length);
  }
  function eventRay(event) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2
    );
    ray.setFromCamera(ndc, activeCamera);
    ray.layers.set(activeCamera === roomCamera3D ? 1 : 0);
    ray.near = 0;
    ray.far = Infinity;
  }
  function fitAtHit(hit) {
    const source = hit.object;
    const position = source.geometry.getAttribute('position');
    if (!position || !hit.face) return false;
    const face = hit.face;
    const first = new THREE.Vector3().fromBufferAttribute(position, face.a).applyMatrix4(source.matrixWorld);
    const second = new THREE.Vector3().fromBufferAttribute(position, face.b).applyMatrix4(source.matrixWorld);
    const third = new THREE.Vector3().fromBufferAttribute(position, face.c).applyMatrix4(source.matrixWorld);
    const surfaceNormal = new THREE.Vector3()
      .subVectors(second, first)
      .cross(new THREE.Vector3().subVectors(third, first))
      .normalize();
    const surfaceTangent = new THREE.Vector3().subVectors(second, first).normalize();
    const surfaceBitangent = new THREE.Vector3().crossVectors(surfaceNormal, surfaceTangent).normalize();
    const appearance = typeof placing === 'string'
      ? entries.get(placing)?.note
      : handlers?.getPlacementAppearance?.();
    const angle = (appearance?.rotation || 0) * Math.PI / 180;
    const side = surfaceTangent.clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(surfaceBitangent, Math.sin(angle));
    const up = surfaceBitangent.clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(surfaceTangent, -Math.sin(angle));
    const width = .35 * (appearance?.size || 1);
    const layer = activeCamera === roomCamera3D ? 1 : 0;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(source.matrixWorld);
    for (const scale of [1, .7, .5, .35, .25]) {
      let fits = true;
      const points = [];
      for (let y = 0; y < 5 && fits; y++) for (let x = 0; x < 5; x++) {
        const sample = hit.point.clone()
          .addScaledVector(side, (x / 4 - .5) * width * scale)
          .addScaledVector(up, (.5 - y / 4) * width * scale);
        ray.set(sample.clone().addScaledVector(surfaceNormal, .14), surfaceNormal.clone().negate());
        ray.near = 0;
        ray.far = .28;
        ray.layers.set(layer);
        const found = ray.intersectObject(source, false)[0];
        if (!found || found.point.distanceTo(sample) > .12 || !found.face ||
            found.face.normal.clone().applyNormalMatrix(normalMatrix).dot(surfaceNormal) < .45) { fits = false; break; }
        points.push(found.point.clone().addScaledVector(surfaceNormal, .003));
      }
      if (fits) return points;
    }
    return null;
  }
  function placementAt() {
    const layer = activeCamera === roomCamera3D ? 1 : 0;
    const surfaces = allSurfaces.filter(mesh => surfaceVisible(mesh, layer));
    const found = ray.intersectObjects(surfaces, false)[0];
    if (!found || found.faceIndex == null) {
      return {error: 'Choose a visible Graphics surface for the note.'};
    }
    const source = found.object;
    const surface = [...surfaceMap].find(([, mesh]) => mesh === source)?.[0];
    if (!surface) return {error: 'This Graphics surface cannot hold a note.'};
    const position = source.geometry.getAttribute('position');
    if (!position || !found.face) return {error: 'This surface has no stable note attachment.'};
    const face = found.face;
    const first = new THREE.Vector3().fromBufferAttribute(position, face.a).applyMatrix4(source.matrixWorld);
    const second = new THREE.Vector3().fromBufferAttribute(position, face.b).applyMatrix4(source.matrixWorld);
    const third = new THREE.Vector3().fromBufferAttribute(position, face.c).applyMatrix4(source.matrixWorld);
    const facing = second.sub(first).cross(third.sub(first)).normalize();
    if(facing.dot(activeCamera.position.clone().sub(found.point))<0)facing.negate();
    const edge=new THREE.Vector3().subVectors(third,first);
    const side=new THREE.Vector3(1,0,0).applyQuaternion(activeCamera.quaternion);
    side.addScaledVector(facing,-side.dot(facing)).normalize();
    if(side.lengthSq()<.5)side.copy(edge).addScaledVector(facing,-edge.dot(facing)).normalize();
    if(side.lengthSq()<.5)side.set(1,0,0).addScaledVector(facing,-facing.x).normalize();
    const top=new THREE.Vector3().crossVectors(facing,side).normalize();
    const appearance=typeof placing==='string'?entries.get(placing)?.note:handlers?.getPlacementAppearance?.();
    const width=.35*(appearance?.size||1);
    const candidates=allSurfaces.filter(mesh=>surfaceVisible(mesh,layer));
    const angle=(appearance?.rotation||0)*Math.PI/180;
    const probeSide=side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(top,Math.sin(angle));
    const probeTop=new THREE.Vector3().crossVectors(facing,probeSide).normalize();
    const fit=fitSurface(THREE,{point:found.point,normal:facing,tangent:probeSide,source,candidates,half:width/2,layer});
    if(!fit)return {error:'This object blocks note placement.'};
    const center=found.point.clone().add(fit.displacement).add(fit.clearance);
    const previewPoints=[];
    for(let y=0;y<5;y++)for(let x=0;x<5;x++)previewPoints.push(center.clone()
      .addScaledVector(probeSide,(x/4-.5)*width).addScaledVector(probeTop,(.5-y/4)*width));
    const local = source.worldToLocal(found.point.clone());
    a.fromBufferAttribute(position, face.a);
    b.fromBufferAttribute(position, face.b);
    c.fromBufferAttribute(position, face.c);
    const bary = THREE.Triangle.getBarycoord(local, a, b, c, new THREE.Vector3());
    if (!Number.isFinite(bary.x) || bary.toArray().some(value => value < -.001 || value > 1.001)) {
      return {error: 'This attachment is unstable. Choose another part of the surface.'};
    }
    return {previewPoints,anchor:{surface,triangle:found.faceIndex,
      bary:bary.toArray().map(value=>Math.max(0,Math.min(1,value))),
      plane:makePlane(THREE,source,found.point,facing,side,fit.displacement,fit.clearance)}};
  }
  let previewTime = -Infinity;
  function clearGesture() { ownedGesture = null; previewTime = -Infinity; }
  function previewAt(e) {
    if (!placing || e.target !== canvas) {
      previewTime = -Infinity;
      placementPreview.hidden = true;
      previewMesh.visible = false;
      placementHint.textContent = 'Click a book, box, or shelf surface · Esc cancels';
      invalidate();
      return;
    }
    placementPreview.style.left = `${e.offsetX}px`;
    placementPreview.style.top = `${e.offsetY}px`;
    const now = performance.now();
    if (now - previewTime < 100) return;
    previewTime = now;
    eventRay(e);
    const result = placementAt();
    placementHint.textContent = result.error || 'Click to attach the note here · Esc cancels';
    placementPreview.hidden = !result.error;
    placementPreview.classList.toggle('invalid', !!result.error);
    placementPreview.style.left = `${e.offsetX}px`;
    placementPreview.style.top = `${e.offsetY}px`;
    placementPreview.title = result.error || 'Click to attach the note here';
    previewMesh.visible = !!result.previewPoints;
    if (result.previewPoints) {
      const positions = previewGeometry.getAttribute('position');
      result.previewPoints.forEach((point, index) => positions.setXYZ(index, point.x, point.y, point.z));
      positions.needsUpdate = true;
      previewGeometry.computeVertexNormals();
      previewMesh.layers.set(activeCamera === roomCamera3D ? 1 : 0);
    }
    invalidate();
  }
  function onPointerDown(e) {
    if (editingFocused && !placing && e.target === canvas) {
      document.activeElement?.blur?.();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (placing && e.target === canvas) {
      if (e.pointerType === 'mouse' && e.button === 0 && e.buttons === 1 && handlers) {
        eventRay(e);
        ownedGesture = {pointerId: e.pointerId, x: e.clientX, y: e.clientY,
          action: {kind: 'place', ...placementAt()}};
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (ownedGesture && (e.button !== 0 || e.buttons !== 1)) {
      clearGesture();
      return;
    }
    if (e.target !== canvas || e.pointerType !== 'mouse' ||
        e.button !== 0 || e.buttons !== 1 || !handlers) return;
    eventRay(e);
    const visibleNotes = [...entries.values()]
      .filter(entry => entry.mesh.visible)
      .map(entry => entry.mesh);
    const hit = ray.intersectObjects(visibleNotes, false)[0];
    const action = hit
      ? {kind: 'open', id: hit.object.userData.stickyId}
      : placing ? {kind: 'place', ...placementAt()} : null;
    if (!action) return;
    ownedGesture = {pointerId: e.pointerId, x: e.clientX, y: e.clientY, action};
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function onPointerMove(e) {
    if (placing && !ownedGesture) previewAt(e);
    if (!ownedGesture || e.pointerId !== ownedGesture.pointerId) return;
    if (e.buttons !== 1 || Math.hypot(e.clientX - ownedGesture.x, e.clientY - ownedGesture.y) > 6) {
      clearGesture();
      return;
    }
    e.stopImmediatePropagation();
  }
  function onPointerUp(e) {
    if (!ownedGesture || e.pointerId !== ownedGesture.pointerId) return;
    const {action, x, y} = ownedGesture;
    clearGesture();
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.button !== 0 || Math.hypot(e.clientX - x, e.clientY - y) > 6) return;
    if (action.kind === 'open') handlers?.open(action.id);
    else if (placing) {
      eventRay(e);
      const result = placementAt();
      if (result.anchor) handlers?.onPlace(result.anchor);
      else if (result.error) handlers?.report?.(result.error);
    }
  }
  const eventHost=canvas.parentElement||canvas;
  eventHost.addEventListener('pointerdown',onPointerDown,true);
  const blockSceneEvent = e => {
    if (!(placing || editingFocused) || e.target !== canvas) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  for (const type of ['wheel', 'dblclick', 'contextmenu', 'mousedown', 'mouseup', 'click', 'auxclick']) {
    eventHost.addEventListener(type, blockSceneEvent, {capture:true, passive:false});
  }
  window.addEventListener('pointermove',onPointerMove,true);
  window.addEventListener('pointerup',onPointerUp,true);
  window.addEventListener('pointercancel',clearGesture,true);
  window.addEventListener('blur',clearGesture);
  canvas.addEventListener('lostpointercapture',clearGesture);
  const unregister=registerStickySceneAdapter('graphics',{
    setHandlers(next){handlers=next;},
    setNotes,
    setPlacing(value){
      placing=value; previewTime=-Infinity;
      onEditingChange?.(!!value || editingFocused);
      placementHint.hidden = !value;
      if(value){if(previousCursor===null)previousCursor=canvas.style.cursor;canvas.style.cursor='crosshair';}
      else {placementPreview.hidden=true;previewMesh.visible=false;if(previousCursor!==null){canvas.style.cursor=previousCursor;previousCursor=null;}}
      invalidate();
    },
    setEditingFocused(value){
      editingFocused = !!value;
      onEditingChange?.(!!placing || editingFocused);
    },
    setNotesShown(value){
      if(value && !notesShown) showGhosts = true;
      notesShown = value;
      invalidate();
    },
    visibleCount(){return [...entries.values()].filter(entry=>entry.visible).length;},
    unresolvedCount(){
      return [...entries.values()].filter(({note})=>{
        const mesh=surfaceMap.get(note.anchor.surface),geometry=mesh?.geometry;
        if(note.anchor.plane)return !mesh;
        const position=geometry?.getAttribute('position'),index=geometry?.getIndex();
        return !position||note.anchor.triangle*3+2>=(index?.count||position.count);
      }).length;
    },
    isVisible(id){return entries.get(id)?.visible||false;},
    getAnchorRect(id){
      const entry=entries.get(id);if(!entry?.visible)return null;
      const position=entry.geometry.getAttribute('position'),rect=canvas.getBoundingClientRect();
      let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
      for(let i=0;i<position.count;i++){
        const projected=new THREE.Vector3().fromBufferAttribute(position,i).project(activeCamera);
        const x=rect.left+(projected.x+1)*rect.width/2;
        const y=rect.top+(1-projected.y)*rect.height/2;
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      }
      if(!Number.isFinite(left))return null;
      return {left,top,width:right-left,height:bottom-top};
    }
  });
  return {update,dispose(){
    if(disposed)return;disposed=true;unregister();clearGesture();onEditingChange?.(false);
    eventHost.removeEventListener('pointerdown',onPointerDown,true);
    for (const type of ['wheel', 'dblclick', 'contextmenu', 'mousedown', 'mouseup', 'click', 'auxclick']) {
      eventHost.removeEventListener(type, blockSceneEvent, true);
    }
    window.removeEventListener('pointermove',onPointerMove,true);
    window.removeEventListener('pointerup',onPointerUp,true);
    window.removeEventListener('pointercancel',clearGesture,true);
    window.removeEventListener('blur',clearGesture);
    canvas.removeEventListener('lostpointercapture',clearGesture);
    if(previousCursor!==null)canvas.style.cursor=previousCursor;
    placementHint.remove();placementPreview.remove();
    scene.remove(previewMesh);previewGeometry.dispose();previewMaterial.dispose();
    for(const entry of entries.values())discard(entry);entries.clear();
  }};
}
