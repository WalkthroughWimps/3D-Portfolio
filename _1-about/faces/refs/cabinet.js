import {getRefsContainerContour, getRefsElementFrames} from './snap-board.js';
import {getRefsCompartmentContours, REFS_POCKET_IDS} from './contours.js';
import {createCabinetMaterialLibrary, isCabinetWood} from './cabinet-materials.js';

const UNIT = 1.25 * 3 / 1536;
const local = (point, options) => ({x: (point.x - 365) * UNIT * options.width,
  z: (405 - point.y) * UNIT * options.height});

const SMOOTH_JOIN = Math.cos(40 * Math.PI / 180);
const contourPoints = points => points.filter((point, i) => i === 0 ||
  Math.hypot(point.x - points[i - 1].x, point.z - points[i - 1].z) > 1e-9)
  .filter((point, i, unique) => i < unique.length - 1 ||
    Math.hypot(point.x - unique[0].x, point.z - unique[0].z) > 1e-9);
const unitNormal = (a, b, c) => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n) || 1;
  return n.map(value => value / length);
};
function joinedNormal(before, after) {
  if (!before || !after || before.reduce((dot, value, i) => dot + value * after[i], 0) <
    SMOOTH_JOIN) return after;
  const sum = before.map((value, i) => value + after[i]);
  const length = Math.hypot(...sum);
  return sum.map(value => value / length);
}
function surface(THREE) {
  const positions = [], uvs = [], normals = [], indices = [];
  return {quad(vertices, texels, vertexNormals) {
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) {
      positions.push(...vertices[i]); uvs.push(...texels[i]); normals.push(...vertexNormals[i]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }, geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    return geometry;
  }};
}

function shellGeometry(THREE, contour, options, rearY, frontY, thickness, cutaway, fascia = false) {
  const shape = surface(THREE);
  const points = contourPoints(contour.map(point => local(point, options)));
  let distance = 0;
  const inset = (p, amount) => {
    const length = Math.hypot(p.x, p.z) || 1;
    return {x: p.x - amount * p.x / length, z: p.z - amount * p.z / length};
  };
  const y0 = fascia ? frontY + Math.min(.006, (rearY - frontY) / 8) : rearY;
  const y1 = frontY;
  const edges = points.map((_, i) => {
    const a = points[i], b = points[(i + 1) % points.length];
    const edgeLength = Math.hypot(b.x - a.x, b.z - a.z);
    if (edgeLength < 1e-9 || cutaway && (a.x + b.x) / 2 > .012) return null;
    const c = inset(a, thickness), d = inset(b, thickness);
    const outer = unitNormal([a.x, y0, a.z], [b.x, y0, b.z], [b.x, y1, b.z]);
    const inner = unitNormal([c.x, y0, c.z], [c.x, y1, c.z], [d.x, y1, d.z]);
    return {a, b, c, d, edgeLength, outer, inner};
  });
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!edge) continue;
    const {a, b, c, d, edgeLength, outer, inner} = edge;
    const prev = edges[(i - 1 + edges.length) % edges.length];
    const next = edges[(i + 1) % edges.length];
    const outerStart = prev ? joinedNormal(prev.outer, outer) : outer;
    const outerEnd = next ? joinedNormal(next.outer, outer) : outer;
    const innerStart = prev ? joinedNormal(prev.inner, inner) : inner;
    const innerEnd = next ? joinedNormal(next.inner, inner) : inner;
    const at = (p, y) => [p.x, y, p.z];
    const wallUV = (y, u) => [(y - frontY) / .5, u / .5];
    const capUV = p => [p.x / .5, p.z / .5];
    shape.quad([at(a, y0), at(b, y0), at(b, y1), at(a, y1)],
      [wallUV(y0, distance), wallUV(y0, distance + edgeLength),
        wallUV(y1, distance + edgeLength), wallUV(y1, distance)],
      [outerStart, outerEnd, outerEnd, outerStart]);
    shape.quad([at(c, y0), at(c, y1), at(d, y1), at(d, y0)],
      [wallUV(y0, distance), wallUV(y1, distance),
        wallUV(y1, distance + edgeLength), wallUV(y0, distance + edgeLength)],
      [innerStart, innerStart, innerEnd, innerEnd]);
    if (!prev) {
      const vertices = [at(a, y0), at(a, y1), at(c, y1), at(c, y0)];
      const normal = unitNormal(...vertices);
      shape.quad(vertices, [wallUV(y0, 0), wallUV(y1, 0),
        wallUV(y1, thickness), wallUV(y0, thickness)], Array(4).fill(normal));
    }
    if (!next) {
      const vertices = [at(b, y0), at(d, y0), at(d, y1), at(b, y1)];
      const normal = unitNormal(...vertices);
      shape.quad(vertices, [wallUV(y0, 0), wallUV(y0, thickness),
        wallUV(y1, thickness), wallUV(y1, 0)], Array(4).fill(normal));
    }
    // The broad front/rear surfaces cannot share a wall normal or wall UV.
    for (const vertices of [[at(a, y1), at(b, y1), at(d, y1), at(c, y1)],
      [at(a, y0), at(c, y0), at(d, y0), at(b, y0)]]) {
      const normal = unitNormal(...vertices);
      shape.quad(vertices, vertices.map(v => capUV({x: v[0], z: v[2]})),
        Array(4).fill(normal));
    }
    distance += edgeLength;
  }
  return shape.geometry();
}

function bandGeometry(THREE, points, outerY, innerY, width = 0) {
  const shape = surface(THREE);
  points = contourPoints(points);
  let distance = 0;
  const edges = points.map((_, i) => {
    const p = points[i], q = points[(i + 1) % points.length];
    const edgeLength = Math.hypot(q.x - p.x, q.z - p.z);
    if (edgeLength < 1e-9) return null;
    const inset = value => {
      const length = Math.hypot(value.x, value.z) || 1;
      return {x: value.x - width * value.x / length,
        z: value.z - width * value.z / length};
    };
    const r = inset(p), s = inset(q);
    const normal = unitNormal([p.x, outerY, p.z], [q.x, outerY, q.z],
      [s.x, innerY, s.z]);
    return {p, q, r, s, edgeLength, normal};
  });
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!edge) continue;
    const {p, q, r, s, edgeLength, normal} = edge;
    const prev = edges[(i - 1 + edges.length) % edges.length];
    const next = edges[(i + 1) % edges.length];
    const start = prev ? joinedNormal(prev.normal, normal) : normal;
    const end = next ? joinedNormal(next.normal, normal) : normal;
    shape.quad([[p.x, outerY, p.z], [q.x, outerY, q.z],
      [s.x, innerY, s.z], [r.x, innerY, r.z]],
    [[outerY / .5, distance / .5], [outerY / .5, (distance + edgeLength) / .5],
      [innerY / .5, (distance + edgeLength) / .5], [innerY / .5, distance / .5]],
    [start, end, end, start]);
    distance += edgeLength;
  }
  return shape.geometry();
}

function contourSegments(contours) {
  return contours.flatMap((points, id) => points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return {a, b, id, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
      minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y)};
  }).filter(edge => edge.maxY - edge.minY > 1e-9));
}

function crossingY(a, b) {
  if (a.id === b.id || a.maxX < b.minX || b.maxX < a.minX ||
    a.maxY < b.minY || b.maxY < a.minY) return null;
  const ax = a.b.x - a.a.x, ay = a.b.y - a.a.y;
  const bx = b.b.x - b.a.x, by = b.b.y - b.a.y;
  const den = ax * by - ay * bx;
  if (Math.abs(den) < 1e-10) return null;
  const dx = b.a.x - a.a.x, dy = b.a.y - a.a.y;
  const t = (dx * by - dy * bx) / den, u = (dx * ay - dy * ax) / den;
  return t > 1e-8 && t < 1 - 1e-8 && u > 1e-8 && u < 1 - 1e-8 ? a.a.y + t * ay : null;
}

// Slabs end at every contour vertex and crossing, so their side edges lie on
// the actual sampled curves even when editable openings overlap or exit the shell.
function frontGeometry(THREE, outer, openings, options, frontY, backY) {
  const positions = [], uvs = [], indices = [];
  const contours = [outer, ...openings], edges = contourSegments(contours);
  const ys = contours.flatMap(points => points.map(p => p.y));
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const y = crossingY(edges[i], edges[j]);
    if (y !== null) ys.push(y);
  }
  ys.sort((a, b) => a - b);
  const levels = ys.filter((y, i) => i === 0 || y - ys[i - 1] > 1e-7);
  const toX = x => (x - 365) * UNIT * options.width;
  const toZ = y => (405 - y) * UNIT * options.height;
  function quad(a, b, c, d) {
    const base = positions.length / 3;
    for (const [x, y, z] of [a, b, c, d]) positions.push(x, y, z);
    for (const [x, , z] of [a, b, c, d]) uvs.push(x / .5, z / .5);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  for (let row = 0; row < levels.length - 1; row++) {
    const y0 = levels[row], y1 = levels[row + 1];
    const mid = (y0 + y1) / 2;
    const active = edges.filter(e => e.minY < mid && e.maxY > mid).map(edge => ({edge,
      x: edge.a.x + (mid - edge.a.y) * (edge.b.x - edge.a.x) / (edge.b.y - edge.a.y)}));
    active.sort((a, b) => a.x - b.x);
    const inside = new Uint8Array(contours.length);
    for (let i = 0; i < active.length - 1; i++) {
      inside[active[i].edge.id] ^= 1;
      if (!inside[0] || inside.slice(1).some(Boolean)) continue;
      const left = active[i].edge, right = active[i + 1].edge;
      const xAt = (edge, y) => toX(edge.a.x + (y - edge.a.y) *
        (edge.b.x - edge.a.x) / (edge.b.y - edge.a.y));
      const l0 = xAt(left, y0), l1 = xAt(left, y1);
      const r0 = xAt(right, y0), r1 = xAt(right, y1);
      const z0 = toZ(y0), z1 = toZ(y1);
      quad([l0, frontY, z0], [l1, frontY, z1], [r1, frontY, z1], [r0, frontY, z0]);
      quad([r0, backY, z0], [r1, backY, z1], [l1, backY, z1], [l0, backY, z0]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** A face-local, resource-owned shell with a cut-through sculpted front. */
export function createRefsCabinet(THREE, parent, options, contrast) {
  const root = new THREE.Group(); root.name = 'refs.cabinet'; parent.add(root);
  const shell = new THREE.MeshStandardMaterial({color: options.cabinetFaceColor, metalness: .31,
    roughness: .47, side: THREE.DoubleSide});
  const side = shell.clone(); side.color.set(options.cabinetSideColor);
  const bronze = new THREE.MeshStandardMaterial({color: options.cabinetTrimColor, metalness: .64,
    roughness: .31, emissive: '#a46b38', emissiveIntensity: 0,
    side: THREE.DoubleSide});
  const recess = new THREE.MeshStandardMaterial({color: '#101d2a', metalness: .22,
    roughness: .65, side: THREE.DoubleSide});
  const library = createCabinetMaterialLibrary(THREE);
  const materials = [shell, side, bronze, recess];
  let owned = [], disposed = false, metrics = null, lastContrast = contrast;
  function clear() {
    for (const mesh of owned) { root.remove(mesh); mesh.geometry.dispose(); }
    owned = [];
  }
  function add(name, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    root.add(mesh); owned.push(mesh); return mesh;
  }
  function rebuild(next) {
    if (disposed) return;
    clear();
    root.visible = next.cabinetEnabled;
    const rearY = -.08, frontY = rearY - next.cabinetDepth;
    const frames = getRefsElementFrames(next);
    const faceFrames = Object.fromEntries(Object.entries(frames).map(([id, frame]) => {
      const center = local(frame, next);
      return [id, {x: center.x, z: center.z,
        width: frame.width * UNIT * next.width,
        height: frame.height * UNIT * next.height}];
    }));
    metrics = {rearY, frontY, depth: next.cabinetDepth, wallThickness: next.wallThickness,
      frames, faceFrames, contour: getRefsContainerContour(next).map(p => local(p, next))};
    if (!next.cabinetEnabled) return;
    const contour = getRefsContainerContour(next);
    add('refs.cabinet.outer-wall', shellGeometry(THREE, contour, next, rearY, frontY,
      next.wallThickness, next.cabinetCutaway), side);
    add('refs.cabinet.front-fascia', shellGeometry(THREE, contour, next, frontY + .006,
      frontY - .001, Math.max(next.wallThickness * 1.8, .014), next.cabinetCutaway, true), bronze);
    const baseFrames = getRefsElementFrames({...next, elements: {}});
    const pockets = getRefsCompartmentContours(baseFrames, frames);
    const frontTop = frontY + .0005;
    const frontBack = frontY + Math.min(.005, next.cabinetDepth * .075);
    if (next.cabinetFrontEnabled && !next.cabinetCutaway) {
      add('refs.cabinet.solid-front', frontGeometry(THREE, contour,
        REFS_POCKET_IDS.map(id => pockets[id]), next, frontTop, frontBack), shell);
      for (const id of REFS_POCKET_IDS) add(`refs.cabinet.${id}.cut-edge`,
        bandGeometry(THREE, pockets[id].map(p => local(p, next)), frontBack, frontTop), side);
    }
    for (const id of ['portrait', 'aperture']) {
      const ring = pockets[id].map(p => local(p, next));
      if (id === 'aperture') add(`refs.cabinet.${id}.inner-wall`, bandGeometry(THREE, ring,
        Math.min(rearY - .003, frontY + .055), frontBack), side);
      const center = local(frames[id], next);
      const rx = frames[id].width * UNIT * next.width / 2;
      const rz = frames[id].height * UNIT * next.height / 2;
      const tube = new THREE.TorusGeometry(1, .0055, 6, 96);
      tube.scale(rx, rz, 1);
      const trim = add(`refs.cabinet.${id}.rim`, tube, bronze);
      trim.rotation.x = Math.PI / 2; trim.position.set(center.x, frontY - .003, center.z);
    }
    // Open pockets run to the common wallpaper plane at the cabinet rear.
    for (const id of ['leftBay', 'rightBay', 'leftCrescent', 'rightCrescent',
      'leftArch', 'rightArch', 'plaque']) {
      if (next.cabinetFrontEnabled && !next.cabinetCutaway) add(`refs.cabinet.${id}.recess-wall`,
        bandGeometry(THREE, pockets[id].map(p => local(p, next)), rearY + .002, frontBack), recess);
    }
  }
  function setContrast(gain) {
    lastContrast = gain;
    const value = Math.max(0, Math.min(2.4, Number.isFinite(gain) ? gain : .08));
    bronze.emissiveIntensity = .025 + .23 * value / 2.4;
    for (const material of [shell, side]) {
      material.emissive.set(isCabinetWood(material.userData.cabinetKind) ? '#6b4526' :
        material.userData.cabinetKind === 'brushedMetal' ? '#68727a' : '#1c3850');
      material.emissiveIntensity = isCabinetWood(material.userData.cabinetKind) ?
        .001 + .012 * value / 2.4 : .005 + .055 * value / 2.4;
    }
  }
  function configureAppearance(next) {
    for (const [material, kind, color] of [[shell, next.cabinetFaceMaterial, next.cabinetFaceColor],
      [side, next.cabinetSideMaterial, next.cabinetSideColor]]) {
      const wood = isCabinetWood(kind);
      const maps = library.get(kind);
      const map = maps?.color ?? null, bumpMap = maps?.bump ?? null;
      if (material.map !== map || material.bumpMap !== bumpMap) {
        material.map = map; material.bumpMap = bumpMap;
        material.needsUpdate = true;
      }
      material.userData.cabinetKind = kind;
      material.color.set(wood ? '#ffffff' : color);
      if (wood) material.color.lerp(new THREE.Color(color), next.cabinetWoodTint);
      material.metalness = kind === 'brushedMetal' ? .48 : wood ? 0 : .31;
      material.roughness = kind === 'brushedMetal' ? .58 - .36 * next.cabinetSheen :
        wood ? .7 - .44 * next.cabinetSheen : .67 - .4 * next.cabinetSheen;
      material.bumpScale = wood ? .0006 : kind === 'brushedMetal' ? .0001 : 0;
    }
    library.setScale(next.cabinetGrainScale);
    bronze.color.set(next.cabinetTrimColor);
    setContrast(lastContrast);
  }
  rebuild(options); configureAppearance(options);
  return {root, rebuild, configureAppearance, setContrast, getMetrics: () => metrics,
    dispose() { if (disposed) return; disposed = true; clear(); root.removeFromParent();
      for (const material of materials) material.dispose(); library.dispose(); }};
}
