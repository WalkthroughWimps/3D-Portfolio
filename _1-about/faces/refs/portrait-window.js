import {getRefsSelectorGeometry} from './selector-geometry.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Closed portrait glazing and trim. The whole assembly is one future-openable leaf. */
export function createRefsPortraitWindow(THREE, parent, options, cabinet, contrast) {
  const root = new THREE.Group(); root.name = 'refs.portrait-window'; parent.add(root);
  const hinge = new THREE.Group(); hinge.name = 'refs.portrait-window.left-hinge'; root.add(hinge);
  const leaf = new THREE.Group(); leaf.name = 'refs.portrait-window.leaf'; hinge.add(leaf);
  const wood = new THREE.MeshStandardMaterial({color: '#172d3d', metalness: .19,
    roughness: .42, side: THREE.DoubleSide});
  const bronze = new THREE.MeshStandardMaterial({color: '#8f6b44', metalness: .75,
    roughness: .25, emissive: '#bc8249', side: THREE.DoubleSide});
  const shade = new THREE.MeshStandardMaterial({color: '#091721', metalness: .24,
    roughness: .64, side: THREE.DoubleSide});
  const glass = new THREE.MeshPhysicalMaterial({color: '#c6dfe2', metalness: 0,
    roughness: .13, transparent: true, opacity: .13, depthWrite: false,
    side: THREE.DoubleSide, clearcoat: .8, clearcoatRoughness: .08});
  const materials = [wood, bronze, shade, glass];
  let owned = [], disposed = false, openAngle = 0, gain = contrast, geometryKey = '';
  let geometryInfo = null;
  function add(name, geometry, material, group = leaf) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    group.add(mesh); owned.push(mesh); return mesh;
  }
  function ellipsePath(path, rx, rz, clockwise = false) {
    path.absellipse(0, 0, rx, rz, 0, TAU, clockwise, 0);
  }
  function ring(rx, rz, innerX, innerZ, depth) {
    const shape = new THREE.Shape(); ellipsePath(shape, rx, rz);
    const hole = new THREE.Path(); ellipsePath(hole, innerX, innerZ, true);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false, curveSegments: 96});
  }
  function torus(name, rx, rz, radius, y, material) {
    const geometry = new THREE.TorusGeometry(1, radius, 8, 128);
    geometry.scale(rx, rz, (rx + rz) / 2);
    const mesh = add(name, geometry, material);
    mesh.rotation.x = Math.PI / 2; mesh.position.y = y;
    return mesh;
  }
  function tunnel(rx, rz, frontY, backY) {
    const vertices = [], indices = [], count = 128;
    for (let i = 0; i <= count; i++) {
      const a = TAU * i / count, x = rx * Math.cos(a), z = rz * Math.sin(a);
      vertices.push(x, frontY, z, x, backY, z);
      if (i < count) {
        const n = 2 * i;
        indices.push(n, n + 1, n + 3, n, n + 3, n + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  function clear() {
    for (const mesh of owned) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    owned = [];
  }
  function rebuild(next, metrics) {
    if (disposed) return;
    root.visible = next.cabinetEnabled && next.portraitWindowEnabled;
    const portrait = metrics.faceFrames.portrait;
    const key = JSON.stringify([portrait, metrics.frontY, metrics.rearY,
      next.plateCount, next.plateSpacing, next.portraitFrameWidthRatio,
      next.portraitGlassEnabled, next.portraitLockEnabled]);
    if (key === geometryKey) return;
    geometryKey = key;
    clear();
    const rx = portrait.width / 2, rz = portrait.height / 2;
    const outerX = rx * 1.03, outerZ = rz * 1.03;
    const innerScale = 1 - next.portraitFrameWidthRatio;
    const innerX = rx * innerScale, innerZ = rz * innerScale;
    const frontY = metrics.frontY - .008;
    const faceY = frontY - .007;
    // A selected plate rests at the permanent front station, nearer than every
    // storage berth. End the reveal just ahead of its label/rim envelope.
    const motion = getRefsSelectorGeometry(next, metrics);
    const nearestPlateY = motion.frontY - Math.max(
      motion.thickness * .68 + motion.rimOffset,
      motion.thickness / 2 + motion.labelOffset);
    const revealBackY = Math.max(frontY + .001, nearestPlateY - .0005);
    // The pivot passes through the left frame edge in the actual frame plane.
    // Leaf geometry stores face-local Y, so offset it back for this pivot.
    hinge.position.set(portrait.x - outerX, frontY, portrait.z);
    leaf.position.set(outerX, -frontY, 0);
    const frame = add('refs.portrait-window.raised-frame',
      ring(outerX, outerZ, innerX, innerZ, .007), wood);
    frame.rotation.x = Math.PI / 2; frame.position.y = frontY;
    add('refs.portrait-window.opaque-reveal',
      tunnel(innerX, innerZ, frontY, revealBackY), shade);
    torus('refs.portrait-window.outer-bead', outerX * .985, outerZ * .985,
      .012, faceY - .001, bronze);
    torus('refs.portrait-window.inner-bead', innerX * 1.012, innerZ * 1.012,
      .017, faceY - .001, bronze);
    if (next.portraitGlassEnabled) {
      const pane = add('refs.portrait-window.glass',
        new THREE.CircleGeometry(1, 128), glass);
      pane.scale.set(innerX, innerZ, 1);
      pane.rotation.x = Math.PI / 2; pane.position.y = faceY - .002;
      pane.renderOrder = 2;
    }
    if (next.portraitLockEnabled) {
      const x = rx * (1 + innerScale) / 2;
      const escutcheon = add('refs.portrait-window.lock.escutcheon',
        new THREE.SphereGeometry(1, 24, 16), bronze);
      escutcheon.scale.set(rx * .085, .004, rz * .17);
      escutcheon.position.set(x, faceY - .006, 0);
      const keyHead = add('refs.portrait-window.lock.keyhole-head',
        new THREE.SphereGeometry(1, 16, 12), shade);
      keyHead.scale.set(rx * .018, .0015, rz * .027);
      keyHead.position.set(x, faceY - .011, rz * .021);
      const keyStem = add('refs.portrait-window.lock.keyhole-stem',
        new THREE.BoxGeometry(rx * .019, .002, rz * .085), shade);
      keyStem.position.set(x, faceY - .011, -rz * .025);
      // Paired scrolls read as chased metal around the keyhole.
      for (const side of [-1, 1]) {
        const points = [];
        for (let i = 0; i <= 24; i++) {
          const t = i / 24, a = side * (Math.PI * .2 + t * Math.PI * 1.45);
          const r = rx * (.014 + .031 * t);
          points.push(new THREE.Vector3(x + r * Math.cos(a), faceY - .011,
            side * rz * .105 + r * Math.sin(a)));
        }
        add(`refs.portrait-window.lock.scroll-${side < 0 ? 'lower' : 'upper'}`,
          new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32,
            Math.max(.00045, rx * .005), 5, false), bronze);
      }
    }
    geometryInfo = {hingeX: hinge.position.x, hingeY: hinge.position.y,
      centerX: portrait.x, centerZ: portrait.z,
      outerX, outerZ, innerX, innerZ, frontY, revealBackY, nearestPlateY};
    hinge.rotation.z = openAngle;
  }
  function setContrast(value) {
    gain = clamp(Number.isFinite(value) ? value : .08, 0, 2.4);
    bronze.emissiveIntensity = .025 + .22 * gain / 2.4;
    wood.emissive.set('#214660'); wood.emissiveIntensity = .005 + .045 * gain / 2.4;
    glass.opacity = .055 + .12 * gain / 2.4;
    glass.clearcoat = .35 + .55 * gain / 2.4;
  }
  // Internal API only: no input handler or persisted open state is attached.
  function setOpenAngle(radians) {
    const magnitude = clamp(Number.isFinite(radians) ? Math.abs(radians) : 0, 0, Math.PI * .7);
    openAngle = magnitude ? -magnitude : 0;
    hinge.rotation.z = openAngle;
  }
  rebuild(options, cabinet); setContrast(gain);
  return {root, hinge, leaf, configure: rebuild, setContrast, setOpenAngle,
    setOpenAmount(amount) { setOpenAngle(clamp(amount, 0, 1) * Math.PI * .65); },
    getGeometry: () => geometryInfo && {...geometryInfo},
    dispose() { if (disposed) return; disposed = true; clear(); root.removeFromParent();
      for (const material of materials) material.dispose(); }};
}
