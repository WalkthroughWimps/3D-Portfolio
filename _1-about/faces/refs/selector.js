// Portrait plates belong to the Refs face. X/Z describe the Illustrator face;
// negative Y faces the viewer. The outer placement group owns global transforms.
import {createRefsPlateArtwork, normalizeRefsPlate} from './plate-art.js';
import {getRefsSelectorGeometry} from './selector-geometry.js';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const PHASES = Object.freeze([
  ['open', .62], ['retract', .48], ['return', .58], ['withdraw', .58],
  ['seek', .3], ['approach', .58], ['fetch', .58], ['present', .52], ['close', .62]
]);

// An elliptical annular sector extruded through the cabinet depth. The two
// sectors leave only narrow seams when homed, so the stack reads as one drum.
function cageSectorGeometry(THREE, rx, rz, inner, outer, from, to, reach, y0, y1) {
  const vertices = [], indices = [], steps = 64;
  const point = (a, radius, y) => [rx * radius * Math.cos(a), y,
    reach + rz * radius * Math.sin(a)];
  function quad(a, b, c, d) {
    const n = vertices.length / 3;
    vertices.push(...a, ...b, ...c, ...d);
    indices.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  for (let i = 0; i < steps; i++) {
    const a = from + (to - from) * i / steps;
    const b = from + (to - from) * (i + 1) / steps;
    quad(point(a, outer, y0), point(b, outer, y0),
      point(b, outer, y1), point(a, outer, y1));
    quad(point(b, inner, y0), point(a, inner, y0),
      point(a, inner, y1), point(b, inner, y1));
    for (const y of [y0, y1]) quad(point(a, inner, y), point(b, inner, y),
      point(b, outer, y), point(a, outer, y));
  }
  for (const a of [from, to]) quad(point(a, inner, y0), point(a, outer, y0),
    point(a, outer, y1), point(a, inner, y1));
  const shape = new THREE.BufferGeometry();
  shape.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  shape.setIndex(indices); shape.computeVertexNormals();
  return shape;
}

function rimArcGeometry(THREE, rx, rz, reach, from, to, radius,
  scale = 1.03) {
  const points = [];
  for (let i = 0; i <= 12; i++) {
    const a = from + (to - from) * i / 12;
    points.push(new THREE.Vector3(rx * scale * Math.cos(a), 0,
      reach + rz * scale * Math.sin(a)));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18,
    radius, 5, false);
}

/** Two opposed in-face arms and a depth-travelling carriage exchange real plate meshes. */
export function createRefsSelector(THREE, parent, options, metrics, contrast = .5) {
  const root = new THREE.Group(); root.name = 'refs.selector'; parent.add(root);
  const navy = new THREE.MeshStandardMaterial({color: '#142a3a', metalness: .38,
    roughness: .46, side: THREE.DoubleSide, emissive: '#18384b', emissiveIntensity: 0});
  const bronze = new THREE.MeshStandardMaterial({color: '#9a7752', metalness: .72,
    roughness: .32, side: THREE.DoubleSide, emissive: '#a46b38', emissiveIntensity: 0});
  const owned = [], textures = [], artworks = [], labelMaterials = [], plateMaterials = [], listeners = new Set();
  let plates = [], leftArm, rightArm, grabber, rail, slider, bridge;
  let config = options, cabinet = metrics, geometryKey = '', geometry = null;
  let currentIndex = options.plateIndex, targetIndex = options.plateIndex;
  let queuedIndex = null, phase = 'idle', elapsed = 0, reduced = false;
  let suspended = false, disposed = false, gain = contrast;

  function add(name, shape, material, parentNode = root) {
    const mesh = new THREE.Mesh(shape, material); mesh.name = name;
    parentNode.add(mesh); owned.push(mesh); return mesh;
  }
  function clear() {
    for (const artwork of artworks) artwork.dispose();
    artworks.length = 0;
    for (const mesh of owned) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    owned.length = 0;
    for (const texture of textures) texture.dispose();
    textures.length = 0;
    for (const material of labelMaterials) material.dispose();
    labelMaterials.length = 0;
    for (const pair of plateMaterials) { pair.body.dispose(); pair.rim.dispose(); }
    plateMaterials.length = 0;
    root.clear();
    plates = []; leftArm = rightArm = grabber = rail = slider = bridge = null;
  }
  function state() {
    return {currentIndex, targetIndex: config.plateIndex, queuedIndex,
      phase, busy: phase !== 'idle', plateCount: config.plateCount,
      requestedSpacing: config.plateSpacing,
      appliedSpacing: geometry?.spacing ?? 0,
      plateThickness: geometry?.thickness ?? 0,
      plateEnvelope: geometry?.envelope ?? 0,
      requestedAngle: config.selectorAngle, appliedAngle: config.selectorAngle,
      armReach: geometry?.armReach ?? 0,
      withdrawTravel: geometry?.withdrawTravel ?? 0,
      openClearance: geometry?.openClearance ?? 0,
      frontY: geometry?.frontY ?? cabinet.frontY,
      storageY: geometry?.storageY?.slice() ?? []};
  }
  function notify() { const snapshot = state(); for (const listener of listeners) listener(snapshot); }
  function armCenter(theta) {
    const {cx, cz, armReach} = geometry;
    return {x: cx + armReach * Math.sin(theta),
      z: cz - armReach + armReach * Math.cos(theta)};
  }
  // Every numbered plate owns a stable berth. The current plate leaves an
  // empty berth while it occupies the permanent, separate front station.
  function layer(index) { return geometry.storageY[index] ?? geometry.frontY; }
  function place(node, point, y, angle) {
    node.position.set(point.x, y, point.z);
    node.rotation.y = angle;
  }
  function redraw() {
    if (!geometry) return;
    const full = config.selectorAngle * Math.PI / 180;
    const phaseIndex = PHASES.findIndex(([name]) => name === phase);
    const duration = PHASES[phaseIndex]?.[1] ?? 1;
    const t = ease(clamp(elapsed / duration, 0, 1));
    const openAmount = phase === 'idle' ? 0 : phase === 'open' ? t : phase === 'close' ? 1 - t : 1;
    const stackAngle = -full * openAmount;
    const grabAngle = phase === 'return' || phase === 'approach' ?
      mix(full, -full, t) : phase === 'withdraw' || phase === 'fetch' ?
        mix(-full, full, t) : full * openAmount;
    const selectorAngle = full * openAmount;
    const stackCenter = armCenter(stackAngle);
    const selectorCenter = armCenter(selectorAngle);
    const grabCenter = armCenter(grabAngle);
    leftArm.rotation.y = stackAngle;
    rightArm.rotation.y = selectorAngle;
    grabber.rotation.y = grabAngle;
    const returnY = layer(currentIndex);
    const selectedY = layer(targetIndex);
    rail.position.y = phase === 'retract' ? mix(geometry.frontY, returnY, t) :
      ['return', 'withdraw'].includes(phase) ? returnY :
      phase === 'seek' ? mix(returnY, selectedY, t) :
      ['approach', 'fetch'].includes(phase) ? selectedY :
      phase === 'present' ? mix(selectedY, geometry.frontY, t) :
      phase === 'close' ? geometry.frontY : geometry.frontY;
    // The bearing remains in the selector's depth groove. A visible swivel
    // bridge links it to the grabber as the latter leans into the stack.
    const grooveRadius = geometry.armReach - geometry.rz * geometry.cageOuterScale;
    const sx = geometry.cx + grooveRadius * Math.sin(selectorAngle);
    const sz = geometry.cz - geometry.armReach + grooveRadius * Math.cos(selectorAngle);
    const gx = geometry.cx + grooveRadius * Math.sin(grabAngle);
    const gz = geometry.cz - geometry.armReach + grooveRadius * Math.cos(grabAngle);
    slider.position.set(sx, geometry.cradleOffset, sz);
    const length = Math.hypot(gx - sx, gz - sz);
    bridge.position.set((sx + gx) / 2, geometry.cradleOffset, (sz + gz) / 2);
    bridge.scale.y = Math.max(length, .001);
    bridge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(gx - sx, 0, gz - sz).normalize());
    bridge.visible = length > .001;
    for (const [index, plate] of plates.entries()) {
      let point = stackCenter, y = layer(index), angle = stackAngle;
      if (index === currentIndex) {
        point = selectorCenter; angle = selectorAngle;
        y = geometry.frontY;
        if (phase === 'retract') {
          y = mix(geometry.frontY, layer(index), t);
        } else if (phase === 'return') {
          y = layer(index);
        } else if (['withdraw', 'seek', 'approach', 'fetch', 'present', 'close'].includes(phase)) {
          point = stackCenter; angle = stackAngle; y = layer(index);
        }
        if (phase === 'return') { point = grabCenter; angle = grabAngle; }
      } else if (index === targetIndex && phase !== 'idle') {
        if (phase === 'fetch') {
          point = grabCenter; angle = grabAngle;
        } else if (phase === 'present') {
          point = selectorCenter; angle = selectorAngle;
          y = mix(layer(index), geometry.frontY, t);
        } else if (phase === 'close') {
          point = selectorCenter; angle = selectorAngle; y = geometry.frontY;
        }
      }
      place(plate, point, y, angle);
    }
  }
  function build() {
    clear();
    geometry = getRefsSelectorGeometry(config, cabinet);
    const {rx, rz, frontY, thickness, labelOffset, rimOffset,
      cradleHalf, cradleOffset, armReach, cageInnerScale,
      cageOuterScale, cageLip} = geometry;
    const portrait = cabinet.faceFrames.portrait;
    const pivotZ = portrait.z - armReach;
    leftArm = new THREE.Group(); leftArm.name = 'refs.selector.stack-arm';
    leftArm.position.set(portrait.x, frontY, pivotZ);
    root.add(leftArm);
    rightArm = new THREE.Group(); rightArm.name = 'refs.selector.selector-arm';
    rightArm.position.set(portrait.x, frontY, pivotZ);
    root.add(rightArm);
    const shellFront = -.003;
    // Stop just ahead of the rear plane so the new shell preserves the
    // previously validated mounted depth ceiling and backing clearance.
    const shellRear = cabinet.rearY - frontY - .001;
    const seam = .045;
    for (const [name, arm, from, to] of [
      ['stack', leftArm, Math.PI / 2 + seam, 3 * Math.PI / 2 - seam],
      ['selector', rightArm, -Math.PI / 2 + seam, Math.PI / 2 - seam]
    ]) {
      add(`refs.selector.${name}.curved-housing`, cageSectorGeometry(THREE,
        rx, rz, cageInnerScale, cageOuterScale, from, to, armReach,
        shellFront, shellRear), navy, arm);
      // The rolled front and rear edges outline the drum through the glass.
      for (const [end, y] of [['front', shellFront], ['rear', shellRear]]) {
        const points = [];
        for (let i = 0; i <= 64; i++) {
          const a = from + (to - from) * i / 64;
          points.push(new THREE.Vector3(rx * cageOuterScale * Math.cos(a), y,
            armReach + rz * cageOuterScale * Math.sin(a)));
        }
        add(`refs.selector.${name}.${end}-edge`, new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points), 80, cageLip, 5, false), bronze, arm);
      }
    }
    for (const [side, arm] of [[-1, leftArm], [1, rightArm]]) {
      const lowerRim = armReach - rz * cageOuterScale;
      const rod = add(`refs.selector.${side < 0 ? 'stack' : 'selector'}.bottom-spine`,
        new THREE.BoxGeometry(.004, .006, lowerRim), bronze, arm);
      rod.position.set(side * .004, 0, lowerRim / 2);
    }
    const hub = add('refs.selector.shared-bottom-pivot',
      new THREE.SphereGeometry(.006, 12, 8), bronze);
    hub.position.set(portrait.x, frontY, pivotZ);
    rail = new THREE.Group(); rail.name = 'refs.selector.depth-rail'; root.add(rail);
    rail.position.y = frontY;
    grabber = new THREE.Group(); grabber.name = 'refs.selector.swing-grabber';
    grabber.position.set(portrait.x, cradleOffset, pivotZ);
    rail.add(grabber);
    const grooveR = armReach - rz * cageOuterScale;
    const grooveWidth = Math.min(.0025, rx * .025);
    for (const side of [-1, 1]) {
      const guide = add(`refs.selector.depth-groove.${side < 0 ? 'left' : 'right'}`,
        new THREE.CylinderGeometry(grooveWidth * .32, grooveWidth * .32,
          shellRear - shellFront, 8), bronze, rightArm);
      guide.position.set(side * grooveWidth, (shellRear + shellFront) / 2,
        grooveR - .0005);
    }
    slider = add('refs.selector.groove-bearing', new THREE.SphereGeometry(
      grooveWidth * 1.5, 10, 8), bronze, rail);
    bridge = add('refs.selector.grabber-swivel-link',
      new THREE.CylinderGeometry(grooveWidth * .7, grooveWidth * .7, 1, 8),
      bronze, rail);
    const cradleR = armReach - rz * 1.03;
    const stem = add('refs.selector.grabber.support-arm',
      new THREE.BoxGeometry(.004, Math.min(.003, cradleHalf * 1.6), cradleR),
      bronze, grabber);
    stem.position.z = cradleR / 2;
    // The continuous thin C joins the stem to all three jaws, outside the rim.
    add('refs.selector.grabber.cradle', rimArcGeometry(THREE, rx, rz,
      armReach, -Math.PI / 2, Math.PI / 2,
      Math.min(.0013, Math.max(.00055, cradleHalf * .8))), bronze, grabber);
    // Hook each pad around the edge to the visible front rim. The finger's
    // radial path stays outside the plate body throughout its depth span.
    for (const [id, a] of [-.94, 0, .94].entries()) {
      const jaw = add(`refs.selector.grabber.jaw-${id + 1}`,
        rimArcGeometry(THREE, rx, rz, armReach, a - .12, a + .12,
          Math.min(.0017, Math.max(.0006, cradleHalf * .7)), 1.023),
        bronze, grabber);
      const rimY = -thickness / 2 - rimOffset - cradleOffset;
      jaw.position.y = rimY;
      const x = rx * Math.cos(a), z = rz * Math.sin(a);
      const start = new THREE.Vector3(x * 1.03, 0, armReach + z * 1.03);
      const end = new THREE.Vector3(x * 1.023,
        rimY, armReach + z * 1.023);
      const direction = end.clone().sub(start);
      const finger = add(`refs.selector.grabber.finger-${id + 1}`,
        new THREE.CylinderGeometry(.0007, .0007, direction.length(), 7),
        bronze, grabber);
      finger.position.copy(start).add(end).multiplyScalar(.5);
      finger.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
        direction.normalize());
    }
    for (let index = 0; index < config.plateCount; index++) {
      const group = new THREE.Group(); group.name = `refs.selector.plate-${index + 1}`;
      root.add(group); plates.push(group);
      const metadata = normalizeRefsPlate(config.plates[index]);
      const bodyMaterial = navy.clone(), rimMaterial = bronze.clone();
      bodyMaterial.color.set(metadata.bodyColor);
      bodyMaterial.emissive.set(metadata.bodyColor);
      rimMaterial.color.set(metadata.rimColor);
      rimMaterial.emissive.set(metadata.rimColor);
      plateMaterials.push({body: bodyMaterial, rim: rimMaterial});
      const body = add(`refs.selector.plate-${index + 1}.body`,
        new THREE.CylinderGeometry(1, 1, thickness, 48), bodyMaterial, group);
      body.scale.set(rx, 1, rz);
      const rim = add(`refs.selector.plate-${index + 1}.rim`,
        new THREE.TorusGeometry(1, .018, 8, 48), rimMaterial, group);
      rim.rotation.x = Math.PI / 2;
      rim.scale.set(rx, rz, thickness * .18 / .018);
      rim.position.y = -thickness / 2 - rimOffset;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const texture = new THREE.CanvasTexture(canvas); textures.push(texture);
      texture.colorSpace = THREE.SRGBColorSpace;
      artworks.push(createRefsPlateArtwork(canvas, index + 1, config.plates[index],
        () => { texture.needsUpdate = true; }));
      const labelMaterial = new THREE.MeshBasicMaterial({map: texture, transparent: true,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false});
      labelMaterials.push(labelMaterial);
      const label = add(`refs.selector.plate-${index + 1}.number`,
        new THREE.PlaneGeometry(rx * 1.72, rz * 1.72), labelMaterial, group);
      label.rotation.x = Math.PI / 2;
      label.position.y = -thickness / 2 - labelOffset;
    }
    redraw();
    setContrast(gain);
  }
  function settle(index) {
    currentIndex = index; targetIndex = index; queuedIndex = null;
    phase = 'idle'; elapsed = 0; redraw(); notify();
  }
  function begin(index) {
    if (index === currentIndex) { settle(index); return; }
    targetIndex = index; phase = 'open'; elapsed = 0; redraw(); notify();
  }
  function select(index) {
    if (disposed) return state();
    const next = clamp(Math.round(Number(index) || 0), 0, config.plateCount - 1);
    if (reduced || !config.mechanismEnabled || !config.cabinetEnabled) settle(next);
    else if (phase !== 'idle') { queuedIndex = next; notify(); }
    else begin(next);
    return state();
  }
  function configure(next, nextMetrics = cabinet) {
    if (disposed) return state();
    const was = config;
    config = next; cabinet = nextMetrics;
    const key = JSON.stringify([cabinet.faceFrames.portrait, cabinet.frontY, cabinet.rearY,
      next.plateCount, next.plateSpacing, next.selectorAngle]);
    const changed = key !== geometryKey;
    geometryKey = key;
    if (changed) {
      const requested = clamp(next.plateIndex, 0, next.plateCount - 1);
      currentIndex = clamp(currentIndex, 0, next.plateCount - 1);
      targetIndex = requested; queuedIndex = null; phase = 'idle'; elapsed = 0;
      build();
      if (requested !== currentIndex) select(requested);
      else notify();
    } else {
      for (let index = 0; index < next.plateCount; index++) {
        const previous = normalizeRefsPlate(was.plates[index]);
        const plate = normalizeRefsPlate(next.plates[index]);
        if (plate.image !== previous.image || plate.bodyColor !== previous.bodyColor ||
            plate.rimColor !== previous.rimColor || plate.imageScale !== previous.imageScale)
          artworks[index]?.update(next.plates[index]);
        if (plate.bodyColor !== previous.bodyColor) {
          plateMaterials[index].body.color.set(plate.bodyColor);
          plateMaterials[index].body.emissive.set(plate.bodyColor);
        }
        if (plate.rimColor !== previous.rimColor) {
          plateMaterials[index].rim.color.set(plate.rimColor);
          plateMaterials[index].rim.emissive.set(plate.rimColor);
        }
      }
      root.visible = next.mechanismEnabled && next.cabinetEnabled;
      if (!next.mechanismEnabled || !next.cabinetEnabled) settle(next.plateIndex);
      else if (next.plateIndex !== was.plateIndex) select(next.plateIndex);
      else if (next.selectorAngle !== was.selectorAngle) redraw();
    }
    root.visible = next.mechanismEnabled && next.cabinetEnabled;
    return state();
  }
  function update(dt) {
    if (disposed || suspended || reduced || phase === 'idle' || !root.visible) return;
    let remaining = clamp(Number(dt) || 0, 0, .1) * config.selectorSpeed;
    while (remaining > 0 && phase !== 'idle') {
      const index = PHASES.findIndex(([name]) => name === phase);
      const duration = PHASES[index][1];
      const advance = Math.min(remaining, duration - elapsed);
      elapsed += advance; remaining -= advance;
      if (elapsed >= duration - 1e-8) {
        if (index === PHASES.length - 1) {
          const next = queuedIndex;
          currentIndex = targetIndex; queuedIndex = null;
          phase = 'idle'; elapsed = 0;
          redraw(); notify();
          if (next !== null && next !== currentIndex) begin(next);
        } else { phase = PHASES[index + 1][0]; elapsed = 0; notify(); }
      }
      redraw();
    }
  }
  function setContrast(value) {
    gain = clamp(Number.isFinite(value) ? value : .5, 0, 2.4);
    bronze.emissiveIntensity = .025 + .25 * gain / 2.4;
    navy.emissiveIntensity = .008 + .07 * gain / 2.4;
    for (const pair of plateMaterials) {
      pair.body.emissiveIntensity = navy.emissiveIntensity;
      pair.rim.emissiveIntensity = bronze.emissiveIntensity;
    }
    for (const material of labelMaterials) material.color.setScalar(.7 + .3 * gain / 2.4);
  }
  configure(options, metrics); setContrast(contrast);
  return {root, configure, update, select, getState: state, setContrast,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setReducedMotion(value) {
      reduced = Boolean(value);
      if (reduced && phase !== 'idle') settle(config.plateIndex);
    },
    suspend() { suspended = true; }, resume() { suspended = false; },
    dispose() {
      if (disposed) return; disposed = true; listeners.clear(); clear();
      root.removeFromParent(); navy.dispose(); bronze.dispose();
    }};
}
