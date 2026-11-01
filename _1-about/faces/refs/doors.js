import {getRefsCompartmentContours} from './contours.js';
import {getRefsElementFrames} from './snap-board.js';
import {REFS_DOOR_IDS} from './door-options.js';
import {createPlaqueKeyGeometry} from './key-clue.js';

// Retain the clue artwork and mounting path for later use; omit it for now.
const PLAQUE_KEY_CLUE_ENABLED = false;

const UNIT = 1.25 * 3 / 1536;
const local = (point, options) => ({x: (point.x - 365) * UNIT * options.width,
  z: (405 - point.y) * UNIT * options.height});
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const geometryKey = (options, metrics) => JSON.stringify([options.width, options.height,
  options.elements, options.outline, options.baySpacing, options.bayWidth, metrics.frontY,
  metrics.rearY, metrics.depth, metrics.faceFrames?.plaque, options.doors && REFS_DOOR_IDS.map(id =>
    [options.doors[id].type, options.doors[id].hinge, options.doors[id].axis])]);

function shapeGeometry(THREE, contour, y, inset = 0, uvBounds = null, origin = {x: 0, z: 0}) {
  const cx = contour.reduce((sum, p) => sum + p.x, 0) / contour.length;
  const cz = contour.reduce((sum, p) => sum + p.z, 0) / contour.length;
  const points = contour.map(p => new THREE.Vector2(cx + (p.x - cx) * (1 - inset),
    cz + (p.z - cz) * (1 - inset)));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(p => [p.x, y, p.y]), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(p => uvBounds ?
    [(p.x + origin.x - uvBounds.minX) / uvBounds.width,
      (p.y + origin.z - uvBounds.minZ) / uvBounds.height] :
    [(p.x + origin.x) / .5, (p.y + origin.z) / .5]), 2));
  geometry.setIndex(THREE.ShapeUtils.triangulateShape(points, []).flat());
  geometry.computeVertexNormals();
  return geometry;
}
function bandGeometry(THREE, contour, front, back) {
  const vertices = [], uv = [], normals = [], indices = [];
  const segmentNormals = contour.map((a, i) => {
    const b = contour[(i + 1) % contour.length], dx = b.x - a.x, dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    return {x: -dz / length, z: dx / length};
  });
  const joined = (a, b) => {
    if (a.x * b.x + a.z * b.z < Math.cos(40 * Math.PI / 180)) return b;
    const length = Math.hypot(a.x + b.x, a.z + b.z) || 1;
    return {x: (a.x + b.x) / length, z: (a.z + b.z) / length};
  };
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length], j = vertices.length / 3;
    const start = joined(segmentNormals[(i - 1 + contour.length) % contour.length], segmentNormals[i]);
    const end = joined(segmentNormals[(i + 1) % contour.length], segmentNormals[i]);
    vertices.push(a.x, front, a.z, b.x, front, b.z, b.x, back, b.z, a.x, back, a.z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    normals.push(start.x, 0, start.z, end.x, 0, end.z,
      end.x, 0, end.z, start.x, 0, start.z);
    indices.push(j, j + 1, j + 2, j, j + 2, j + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices); return geometry;
}

const drumDepth = (metrics, frame, axis) => clamp(metrics.depth * .65, .012,
  Math.min((axis === 'horizontal' ? frame.height : frame.width) * .2, .03));

function drumReturns(THREE, frame, pivot, depth, axis) {
  const vertices = [], normals = [], uvs = [], indices = [];
  const horizontal = axis === 'horizontal';
  const span = horizontal ? frame.height : frame.width;
  const across = horizontal ? frame.width : frame.height;
  const half = span / 2 - .003, z0 = -across / 2 + .003, z1 = across / 2 - .003;
  // A softly rounded D section. The flat front has the wallpaper; the
  // opposite chord is absent, so the cabinet really opens toward the viewer.
  const profile = side => Array.from({length: 17}, (_, i) => {
    const t = i / 16;
    return {x: side * half * (1 - .22 * t * t),
      y: -depth / 2 + depth * t};
  });
  const point = (p, acrossPosition) => horizontal ?
    [acrossPosition + frame.x - pivot.x, p.y, p.x + frame.z - pivot.z] :
    [p.x + frame.x - pivot.x, p.y, acrossPosition + frame.z - pivot.z];
  for (const side of [-1, 1]) {
    const curve = profile(side);
    const normalAt = i => {
      const after = curve[Math.min(16, i + 1)], before = curve[Math.max(0, i - 1)];
      const nx = after.y - before.y, ny = -(after.x - before.x);
      const size = Math.hypot(nx, ny) || 1;
      return horizontal ? [0, ny / size, nx / size] : [nx / size, ny / size, 0];
    };
    for (let i = 0; i < curve.length - 1; i++) {
      const a = curve[i], b = curve[i + 1], j = vertices.length / 3;
      vertices.push(...point(a, z0), ...point(a, z1), ...point(b, z1), ...point(b, z0));
      uvs.push(i / 16, 0, i / 16, 1, (i + 1) / 16, 1, (i + 1) / 16, 0);
      normals.push(...normalAt(i), ...normalAt(i), ...normalAt(i + 1), ...normalAt(i + 1));
      indices.push(j, j + 1, j + 2, j, j + 2, j + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); return geometry;
}

function drumCaps(THREE, frame, pivot, depth, axis) {
  const horizontal = axis === 'horizontal';
  const span = horizontal ? frame.height : frame.width;
  const across = horizontal ? frame.width : frame.height;
  const half = span / 2 - .003;
  const curve = side => Array.from({length: 17}, (_, i) => {
    const t = i / 16;
    return new THREE.Vector2(side * half * (1 - .22 * t * t), -depth / 2 + depth * t);
  });
  const outline = [...curve(1), ...curve(-1).reverse()];
  const triangles = THREE.ShapeUtils.triangulateShape(outline, []).flat();
  const positions = [], normals = [], uv = [], indices = [];
  for (const side of [-1, 1]) {
    const offset = positions.length / 3, coordinate = side * (across / 2 - .003);
    for (const p of outline) {
      const x = horizontal ? coordinate + frame.x - pivot.x : p.x + frame.x - pivot.x;
      const z = horizontal ? p.x + frame.z - pivot.z : coordinate + frame.z - pivot.z;
      positions.push(x, p.y, z);
      normals.push(horizontal ? side : 0, 0, horizontal ? 0 : side);
      uv.push(p.x / span + .5, p.y / depth + .5);
    }
    for (const index of triangles) indices.push(offset + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); return geometry;
}

/** Owns seven small-pocket closures; interior roots survive state changes. */
export function createRefsDoors(THREE, parent, options, metrics, contrast = .5) {
  const root = new THREE.Group(); root.name = 'refs.cupboard-doors'; parent.add(root);
  const wood = new THREE.MeshStandardMaterial({color: options.cabinetFaceColor,
    metalness: .25, roughness: .6, side: THREE.DoubleSide});
  const edge = new THREE.MeshStandardMaterial({color: options.cabinetSideColor,
    metalness: .2, roughness: .67, side: THREE.DoubleSide});
  const trim = new THREE.MeshStandardMaterial({color: options.cabinetTrimColor,
    metalness: .55, roughness: .34, side: THREE.DoubleSide});
  const paper = new THREE.MeshBasicMaterial({color: '#a9a17e', side: THREE.DoubleSide,
    toneMapped: false});
  const keyInk = new THREE.MeshBasicMaterial({color: '#e4d7ad', transparent: true,
    opacity: .7, depthWrite: false, side: THREE.DoubleSide, toneMapped: false});
  const materials = [wood, edge, trim, paper, keyInk];
  const doors = new Map(), listeners = new Set();
  let current = options, currentMetrics = metrics, lastKey = '', disposed = false;
  let gain = contrast, reduced = false, suspended = false, wallpaper = null;
  for (const id of REFS_DOOR_IDS) {
    const anchor = new THREE.Group(); anchor.name = `refs.door.${id}`; root.add(anchor);
    const motion = new THREE.Group(); anchor.add(motion);
    const interiorRoot = new THREE.Group(); interiorRoot.name = `refs.door.${id}.interior`;
    root.add(interiorRoot);
    doors.set(id, {id, anchor, motion, interiorRoot, owned: [], amount: options.doors[id].open ? 1 : 0,
      contour: [], frame: null, frontY: 0, rearY: 0, portal: null, hit: null});
  }
  function emit(id) {
    const state = getState(id);
    for (const listener of listeners) listener(state);
  }
  function getState(id) {
    const item = doors.get(id); if (!item) return null;
    const config = current.doors[id];
    return {id, openTarget: config.open, openAmount: item.amount,
      moving: Math.abs(item.amount - Number(config.open)) > 1e-4,
      type: config.type, frame: item.frame && {...item.frame}};
  }
  function clear(item) {
    for (const mesh of item.owned) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    item.owned.length = 0; item.hit = null;
  }
  function add(item, parentNode, name, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `refs.door.${item.id}.${name}`;
    mesh.userData.refsDoorId = item.id; parentNode.add(mesh); item.owned.push(mesh);
    return mesh;
  }
  function configureAppearance() {
    trim.emissiveIntensity = .025 + .23 * gain / 2.4;
    const level = (gain - .08) / 2.32;
    paper.color.setRGB(.38 + .22 * level, .35 + .19 * level,
      .27 + .13 * level);
    keyInk.opacity = .34 + .58 * level;
  }
  function setCabinetMaterials(sources) {
    if (!sources || disposed) return;
    for (const [target, source] of [[wood, sources.face], [edge, sources.side], [trim, sources.trim]]) {
      target.copy(source); // Maps belong to the cabinet; only these material wrappers are owned here.
      target.side = THREE.DoubleSide;
      target.needsUpdate = true; // Copy can add/remove texture defines as finishes change.
    }
    configureAppearance();
  }
  function makeGeometry() {
    const base = getRefsElementFrames({...current, elements: {}});
    const contours = getRefsCompartmentContours(base, currentMetrics.frames);
    const outerX = currentMetrics.contour.map(p => p.x), outerZ = currentMetrics.contour.map(p => p.z);
    const minX = Math.min(...outerX), minZ = Math.min(...outerZ);
    const uvBounds = {minX, minZ, width: Math.max(.001, Math.max(...outerX) - minX),
      height: Math.max(.001, Math.max(...outerZ) - minZ)};
    for (const id of REFS_DOOR_IDS) {
      const item = doors.get(id), config = current.doors[id], f = currentMetrics.faceFrames[id];
      clear(item); item.anchor.position.set(0, 0, 0); item.motion.position.set(0, 0, 0);
      item.motion.rotation.set(0, 0, 0);
      item.frame = {...f}; item.contour = contours[id].map(p => local(p, current));
      item.frontY = currentMetrics.frontY - .004;
      item.rearY = currentMetrics.rearY - .009;
      item.interiorRoot.position.set(f.x, currentMetrics.rearY - .012, f.z);
      item.portal = {id, frame: {...f}, contour: item.contour.map(p => ({...p})),
        frontY: item.frontY, rearY: item.rearY, interiorRoot: item.interiorRoot,
        motionRoot: item.motion};
      if (config.type === 'none') continue;
      let pivotX = f.x, pivotZ = f.z, pivotY = item.frontY;
      if (config.type === 'hinged') {
        if (config.hinge === 'left') pivotX -= f.width / 2;
        if (config.hinge === 'right') pivotX += f.width / 2;
        if (config.hinge === 'top') pivotZ += f.height / 2;
        if (config.hinge === 'bottom') pivotZ -= f.height / 2;
      } else pivotY = item.frontY + drumDepth(currentMetrics, f, config.axis) / 2;
      item.anchor.position.set(pivotX, pivotY, pivotZ);
      const relative = item.contour.map(p => ({x: p.x - pivotX, z: p.z - pivotZ}));
      const faceY = item.frontY - pivotY;
      const leaf = add(item, item.motion, 'leaf', shapeGeometry(THREE, relative, faceY,
        config.type === 'rotating' ? .045 : .018,
        config.type === 'rotating' ? uvBounds : null, {x: pivotX, z: pivotZ}),
        config.type === 'rotating' ? paper : wood);
      item.hit = leaf;
      if (id === 'plaque' && PLAQUE_KEY_CLUE_ENABLED) add(item, item.motion, 'key-clue',
        createPlaqueKeyGeometry(THREE, f, {x: pivotX, z: pivotZ}, faceY), keyInk);
      if (config.type === 'hinged') add(item, item.motion, 'edge', bandGeometry(THREE,
        relative.map(p => ({x: p.x * .986, z: p.z * .986})), faceY, faceY + .006), edge);
      if (config.type === 'rotating') {
        // An open-back cabinet: at 180 degrees the decorated front is behind
        // the opening, while the side returns make its depth readable.
        const depth = drumDepth(currentMetrics, f, config.axis);
        add(item, item.motion, 'curved-returns', drumReturns(THREE, f,
          {x: pivotX, z: pivotZ}, depth, config.axis), edge);
        add(item, item.motion, 'curved-caps', drumCaps(THREE, f,
          {x: pivotX, z: pivotZ}, depth, config.axis), edge);
        add(item, item.motion, 'inner-face', shapeGeometry(THREE, relative,
          faceY + .004, .05, null, {x: pivotX, z: pivotZ}), wood);
      }
      const handleX = config.type === 'hinged' && config.hinge === 'left' ? f.x + f.width * .34 :
        config.type === 'hinged' && config.hinge === 'right' ? f.x - f.width * .34 : f.x;
      const handleZ = config.hinge === 'bottom' ? f.z + f.height * .32 : f.z;
      const handle = new THREE.SphereGeometry(clamp(Math.min(f.width, f.height) * .04,
        .0028, .006), 8, 6);
      const knob = add(item, item.motion, 'handle', handle, trim);
      knob.position.set(handleX - pivotX, faceY - .004, handleZ - pivotZ);
      updatePose(item);
    }
  }
  function updatePose(item) {
    const config = current.doors[item.id], radians = config.angle * Math.PI / 180 * item.amount;
    item.motion.rotation.set(0, 0, 0);
    item.motion.position.y = 0;
    if (config.type === 'rotating') {
      const signed = config.direction === 'clockwise' ? -1 : 1;
      if (config.axis === 'horizontal') item.motion.rotation.x = signed * radians;
      else item.motion.rotation.z = signed * radians;
      // Keep the return wall ahead of the rear wallpaper during shallow-depth
      // rotations. The cam shifts the open cabinet outward through its own bay.
      const span = config.axis === 'horizontal' ? item.frame.height : item.frame.width;
      const depth = drumDepth(currentMetrics, item.frame, config.axis);
      const halfEnvelope = (span * Math.abs(Math.sin(radians)) +
        depth * Math.abs(Math.cos(radians))) / 2;
      const maxCenterY = currentMetrics.rearY - .011 - halfEnvelope;
      item.motion.position.y = Math.min(0, maxCenterY - item.anchor.position.y);
    } else if (config.hinge === 'left' || config.hinge === 'right') {
      const outward = config.direction === 'out' ? 1 : -1;
      item.motion.rotation.z = outward * (config.hinge === 'left' ? -1 : 1) * radians;
    } else {
      const outward = config.direction === 'out' ? 1 : -1;
      item.motion.rotation.x = outward * (config.hinge === 'bottom' ? 1 : -1) * radians;
    }
  }
  function configure(next, metrics) {
    if (disposed) return;
    const key = geometryKey(next, metrics);
    current = next; currentMetrics = metrics;
    root.visible = Boolean(next.cabinetEnabled && next.cabinetFrontEnabled && !next.cabinetCutaway);
    if (key !== lastKey) { lastKey = key; makeGeometry(); }
    else for (const item of doors.values()) updatePose(item);
    configureAppearance();
    for (const id of REFS_DOOR_IDS) emit(id);
  }
  function setWallpaperTexture(texture) {
    if (disposed || wallpaper === texture) return;
    wallpaper = texture; paper.map = texture; paper.needsUpdate = true;
  }
  configure(options, metrics);
  return {root, configure, setWallpaperTexture, setCabinetMaterials,
    setContrast(value) { gain = clamp(Number.isFinite(value) ? value : .5, .08, 2.4); configureAppearance(); },
    setReducedMotion(value) { reduced = Boolean(value); if (reduced) {
      for (const item of doors.values()) { item.amount = Number(current.doors[item.id].open);
        updatePose(item); emit(item.id); }
    } },
    suspend() { suspended = true; }, resume() { suspended = false; },
    update(dt) {
      if (disposed || suspended) return;
      const speed = current.doorSpeed;
      for (const item of doors.values()) {
        const target = Number(current.doors[item.id].open), before = item.amount;
        if (Math.abs(target - before) < 1e-4) continue;
        item.amount = reduced ? target : clamp(before + Math.sign(target - before) *
          Math.max(0, dt) * speed, 0, 1);
        if ((target - before) * (target - item.amount) < 0 || Math.abs(target - item.amount) < 1e-4)
          item.amount = target;
        updatePose(item); emit(item.id);
      }
    },
    getState, getStates: () => Object.fromEntries(REFS_DOOR_IDS.map(id => [id, getState(id)])),
    getPortal(id) { return doors.get(id)?.portal ?? null; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { if (disposed) return; disposed = true; listeners.clear();
      for (const item of doors.values()) clear(item);
      root.removeFromParent(); for (const material of materials) material.dispose(); }
  };
}
