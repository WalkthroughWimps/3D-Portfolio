import {getRefsSelectorGeometry} from './selector-geometry.js';

// The convex outline of every plate/cradle position is the swept circular
// envelope. Sampling the whole orbit includes the bow between its three poses.
function convexHull(points) {
  const ordered = points.sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const lower = [], upper = [];
  for (const point of ordered) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  }
  for (let i = ordered.length - 1; i >= 0; i--) {
    const point = ordered[i];
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

export function getRefsHousingContour(config, cabinet) {
  const motion = getRefsSelectorGeometry(config, cabinet);
  const angle = config.selectorAngle * Math.PI / 180;
  const portrait = cabinet.faceFrames.portrait;
  const radius = Math.max(Math.max(motion.rx, motion.rz) *
      motion.cageOuterScale + motion.cageLip + .004,
    Math.hypot(motion.rx * .86, motion.rz * .86) + .008,
    Math.max(portrait.width, portrait.height) * .5 + .008);
  const points = [];
  for (let pose = 0; pose <= 64; pose++) {
    const theta = -angle + 2 * angle * pose / 64;
    const x = motion.cx + motion.armReach * Math.sin(theta);
    const z = motion.cz - motion.armReach + motion.armReach * Math.cos(theta);
    for (let edge = 0; edge < 96; edge++) {
      const a = edge * 2 * Math.PI / 96;
      points.push({x: x + radius * Math.cos(a), z: z + radius * Math.sin(a)});
    }
  }
  // At the narrowest angle the arm pivot projects below the two plate lobes.
  for (let edge = 0; edge < 96; edge++) {
    const a = edge * 2 * Math.PI / 96;
    points.push({x: motion.cx + .02 * Math.cos(a),
      z: motion.cz - motion.armReach + .02 * Math.sin(a)});
  }
  return {contour: convexHull(points), motion, radius};
}

function contourShape(THREE, contour, portrait) {
  const shape = new THREE.Shape();
  contour.forEach((p, i) => i ? shape.lineTo(p.x, p.z) : shape.moveTo(p.x, p.z));
  shape.closePath();
  if (portrait) {
    const opening = new THREE.Path();
    opening.absellipse(portrait.x, portrait.z, portrait.width * .5,
      portrait.height * .5, 0, Math.PI * 2, true, 0);
    shape.holes.push(opening);
  }
  return shape;
}

function wallGeometry(THREE, contour, frontY, rearY) {
  const positions = [], indices = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    const base = positions.length / 3;
    positions.push(a.x, frontY, a.z, b.x, frontY, b.z,
      b.x, rearY, b.z, a.x, rearY, a.z);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Face-owned fixed cover and enclosure; the selector moves independently. */
export function createRefsPlateHousing(THREE, parent, options, cabinet, contrast = .5) {
  const root = new THREE.Group(); root.name = 'refs.plate-housing'; parent.add(root);
  const shell = new THREE.MeshStandardMaterial({color: '#182b3a', metalness: .32,
    roughness: .51, side: THREE.DoubleSide, emissive: '#1c3850', emissiveIntensity: 0});
  let meshes = [], key = '', metrics = null, disposed = false;
  function clear() {
    for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    meshes = [];
  }
  function add(name, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    root.add(mesh); meshes.push(mesh); return mesh;
  }
  function configure(next, nextCabinet) {
    if (disposed) return;
    root.visible = Boolean(next.cabinetEnabled && next.mechanismEnabled && next.housingEnabled !== false);
    const nextKey = JSON.stringify([nextCabinet.faceFrames.portrait,
      nextCabinet.frontY, nextCabinet.rearY, next.selectorAngle,
      next.plateCount, next.plateSpacing]);
    if (nextKey === key) return;
    key = nextKey; clear();
    metrics = getRefsHousingContour(next, nextCabinet);
    const {contour} = metrics;
    const frontY = nextCabinet.frontY + Math.min(.005, nextCabinet.depth * .075) + .0001;
    const rearY = nextCabinet.rearY + .002;
    const cover = add('refs.plate-housing.front-cover',
      new THREE.ShapeGeometry(contourShape(THREE, contour, nextCabinet.faceFrames.portrait), 32), shell);
    cover.rotation.x = Math.PI / 2; cover.position.y = frontY;
    add('refs.plate-housing.sidewall', wallGeometry(THREE, contour, frontY, rearY), shell);
    metrics = {...metrics, frontY, rearY};
  }
  function setContrast(value) {
    const gain = Math.max(.08, Math.min(2.4, Number.isFinite(value) ? value : .5));
    shell.emissiveIntensity = .005 + .055 * gain / 2.4;
  }
  configure(options, cabinet); setContrast(contrast);
  return {root, configure, setContrast, getMetrics: () => metrics,
    dispose() { if (disposed) return; disposed = true; clear(); root.removeFromParent();
      shell.dispose(); }};
}
