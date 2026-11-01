import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEG = Math.PI / 180;
// Lower half of the iris: left end is closed, bottom is half-open, right is open.
export function irisArcValue(point, arc) {
  const angle = Math.atan2((point.z - arc.z) / arc.rz, (point.x - arc.x) / arc.rx);
  if (point.z > arc.z) return point.x < arc.x ? 0 : 1;
  return clamp(((angle < 0 ? angle + 2 * Math.PI : angle) - Math.PI) / Math.PI, 0, 1);
}
export function irisArcPoint(t, arc) {
  const angle = Math.PI * (1 + clamp(t, 0, 1));
  return {x: arc.x + arc.rx * Math.cos(angle), z: arc.z + arc.rz * Math.sin(angle)};
}

/** Face-local physical controls. All meshes and materials belong to this component. */
export function createRefsFaceOperations(parent, options, metrics, contrast, irisState) {
  const root = new THREE.Group(); root.name = 'refs.physical-operations'; parent.add(root);
  const metal = new THREE.MeshStandardMaterial({color: '#cbb38c', metalness: .72, roughness: .22,
    emissive: '#9b7945', emissiveIntensity: .04});
  const dark = new THREE.MeshStandardMaterial({color: '#141c1b', metalness: .48, roughness: .35});
  const light = new THREE.MeshPhysicalMaterial({color: '#061009', metalness: .03, roughness: .12,
    clearcoat: 1, clearcoatRoughness: .08, emissive: '#43ed73', emissiveIntensity: 0});
  const rail = new THREE.MeshStandardMaterial({color: '#c3aa84', metalness: .68, roughness: .24,
    emissive: '#8a6b3e', emissiveIntensity: .02});
  const owned = [metal, dark, light, rail];
  const meshes = [];
  let bulbs = [], arrowHits = [], arc = null, railY = 0, key = '', selected = -1;
  let state = options, gain = contrast, irisMetrics = irisState;
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
  const context = glowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,.85)');
  gradient.addColorStop(.25, 'rgba(255,255,255,.34)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  const glowMaterial = new THREE.SpriteMaterial({map: glowTexture, color: state.plateLightColor,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false});
  const glow = new THREE.Sprite(glowMaterial); glow.name = 'refs.plate-light.selected-glow';
  glow.scale.set(.06, .06, 1); root.add(glow);
  function add(geometry, material, name, x, y, z, tag) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.position.set(x, y, z); if (tag) mesh.userData.refsOperation = tag;
    root.add(mesh); meshes.push(mesh); return mesh;
  }
  function clear() {
    for (const mesh of meshes.splice(0)) {
      mesh.removeFromParent(); mesh.geometry.dispose();
      if (mesh.material !== light && mesh.material !== metal && mesh.material !== dark && mesh.material !== rail) {
        mesh.material.dispose(); owned.splice(owned.indexOf(mesh.material), 1);
      }
    }
    bulbs = []; arrowHits = [];
  }
  function bar(a, b, radius, material, name, tag) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const mid = {x: (a.x + b.x) / 2, z: (a.z + b.z) / 2};
    const mesh = add(new THREE.CylinderGeometry(radius, radius, Math.hypot(dx, dz), 6),
      material, name, mid.x, a.y, mid.z, tag);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(dx, 0, dz).normalize());
    return mesh;
  }
  function build() {
    clear();
    const portrait = metrics.faceFrames.portrait, iris = metrics.faceFrames.aperture;
    const front = metrics.frontY;
    const prx = portrait.width / 2, prz = portrait.height / 2;
    const arx = iris.width / 2, arz = iris.height / 2;
    const doorRadius = irisMetrics.scale * irisMetrics.lipOuterRadius;
    const band = Math.max(.001, Math.min(arx, arz) - doorRadius);
    arc = {x: iris.x, z: iris.z, rx: (arx + doorRadius) / 2,
      rz: (arz + doorRadius) / 2, band};
    root.userData.arc = {...arc};
    railY = front - .022;
    const curve = new THREE.CatmullRomCurve3(Array.from({length: 25}, (_, i) => {
      const p = irisArcPoint(i / 24, arc);
      return new THREE.Vector3(p.x, railY, p.z);
    }));
    const railRadius = Math.min(.0055, band * .12);
    add(new THREE.TubeGeometry(curve, 96, railRadius, 8, false), rail,
      'refs.iris-slider.curved-rail', 0, 0, 0, {kind: 'slider'});
    for (const endpoint of [0, 1]) {
      const p = irisArcPoint(endpoint, arc);
      add(new THREE.SphereGeometry(Math.min(.009, band * .19), 12, 8), metal,
        `refs.iris-slider.end-stop-${endpoint}`, p.x, railY, p.z, {kind: 'slider'});
    }
    const lightRx = prx + .019, lightRz = prz + .019;
    const gap = Math.min(lightRx, lightRz) * 2.16 / Math.max(1, state.plateCount - 1);
    const bulbRadius = Math.min(.009, gap * .31);
    const bulbY = front - .022;
    for (let i = 0; i < state.plateCount; i++) {
      const theta = (208 + 124 * (state.plateCount === 1 ? .5 : i / (state.plateCount - 1))) * DEG;
      const x = portrait.x + lightRx * Math.cos(theta);
      const z = portrait.z + lightRz * Math.sin(theta);
      add(new THREE.CylinderGeometry(bulbRadius * 1.28, bulbRadius * 1.28, .0035, 12), metal,
        `refs.plate-light.${i}.bezel`, x, bulbY + .002, z);
      const lens = add(new THREE.SphereGeometry(bulbRadius, 12, 8), light,
        `refs.plate-light.${i}.lens`, x, bulbY - .002, z, {kind: 'plate', index: i});
      lens.scale.y = .55; bulbs.push(lens);
    }
    const arrowX = prx + .055;
    for (const side of [-1, 1]) {
      const x = portrait.x + side * arrowX, z = portrait.z;
      const tag = {kind: 'arrow', side};
      add(new THREE.CylinderGeometry(.031, .031, .006, 24), metal,
        `refs.plate-arrow.${side}.bezel`, x, front - .022, z, tag);
      const cap = add(new THREE.SphereGeometry(1, 20, 12), dark,
        `refs.plate-arrow.${side}.button-cap`, x, front - .028, z, tag);
      cap.scale.set(.026, .008, .026);
      const y = front - .039;
      const p = [{x: x - side * .012, z: z + .011, y}, {x: x + side * .010, z, y},
        {x: x - side * .012, z: z - .011, y}];
      bar(p[0], p[1], .0035, metal, `refs.plate-arrow.${side}.upper`, tag);
      bar(p[1], p[2], .0035, metal, `refs.plate-arrow.${side}.lower`, tag);
      arrowHits.push({side, x, z, radius: .031});
    }
    // Slider thumb: a recessed seat and raised bronze/glass grip.
    const thumb = add(new THREE.SphereGeometry(Math.min(.020, band * .35), 16, 12), metal,
      'refs.iris-slider.thumb', 0, railY - .004, 0, {kind: 'slider'});
    thumb.scale.y = .55;
    root.userData.thumb = thumb;
    updateAppearance();
  }
  function updateAppearance() {
    const color = new THREE.Color(state.plateLightColor);
    light.emissive.copy(color);
    // The lenses share one material; individual bulbs use per-mesh tint/emission via
    // a small material clone, maintained across selection changes without geometry rebuild.
    for (let i = 0; i < bulbs.length; i++) {
      const lens = bulbs[i];
      if (lens.material === light) { lens.material = light.clone(); owned.push(lens.material); }
      const active = i === state.plateIndex;
      lens.material.color.copy(color).multiplyScalar(active ? .38 : .018);
      lens.material.emissive.copy(color);
      lens.material.emissiveIntensity = active ? .22 + 1.65 * gain / 2.4 : .005 + .012 * gain / 2.4;
      lens.material.needsUpdate = true;
      lens.scale.set(1, active ? .63 : .55, 1);
    }
    metal.emissiveIntensity = .04 + .22 * gain / 2.4;
    rail.emissiveIntensity = .025 + .16 * gain / 2.4;
    glow.visible = bulbs.length > 0;
    if (glow.visible) {
      glow.position.copy(bulbs[state.plateIndex].position); glow.position.y -= .004;
      glowMaterial.color.copy(color); glowMaterial.opacity = .12 + .68 * gain / 2.4;
    }
    const point = irisArcPoint(state.irisOpening / 100, arc);
    root.userData.thumb?.position.set(point.x, railY - .004, point.z);
    selected = state.plateIndex;
  }
  function configure(next, nextMetrics, nextIrisState = irisMetrics) {
    state = next; metrics = nextMetrics; irisMetrics = nextIrisState;
    root.visible = Boolean(next.cabinetEnabled);
    const geometryKey = JSON.stringify([nextMetrics.faceFrames.portrait, nextMetrics.faceFrames.aperture,
      nextMetrics.frontY, next.plateCount, irisMetrics.scale, irisMetrics.lipOuterRadius]);
    if (geometryKey !== key) { key = geometryKey; build(); }
    else updateAppearance();
  }
  function hit(ray) {
    if (!root.visible || !arc) return null;
    root.updateWorldMatrix(true, true);
    const local = ray.clone().applyMatrix4(root.matrixWorld.clone().invert());
    if (local.direction.y <= .00001) return null;
    const t = (railY - local.origin.y) / local.direction.y;
    if (t <= 0) return null;
    const point = local.at(t, new THREE.Vector3());
    const value = irisArcValue(point, arc), on = irisArcPoint(value, arc);
    let best = null;
    const radius = Math.max(.021, .025 / Math.max(.6, state.scale));
    if (Math.hypot(point.x - on.x, point.z - on.z) < radius)
      best = {kind: 'slider', value, distance: ray.origin.distanceTo(point.clone().applyMatrix4(root.matrixWorld))};
    let nearestBulb = null;
    for (const [i, bulb] of bulbs.entries()) {
      const separation = Math.hypot(point.x - bulb.position.x, point.z - bulb.position.z);
      if (separation < Math.max(.009, bulb.geometry.parameters.radius * 1.45) &&
          (!nearestBulb || separation < nearestBulb.separation))
        nearestBulb = {index: i, separation};
    }
    if (nearestBulb) best = {kind: 'plate', index: nearestBulb.index,
      distance: ray.origin.distanceTo(point.clone().applyMatrix4(root.matrixWorld))};
    for (const arrow of arrowHits) {
      if (Math.hypot(point.x - arrow.x, point.z - arrow.z) < arrow.radius)
        best = {kind: 'arrow', side: arrow.side, distance: ray.origin.distanceTo(point.clone().applyMatrix4(root.matrixWorld))};
    }
    return best;
  }
  configure(options, metrics);
  return {root, hit, sliderValue(ray) {
    root.updateWorldMatrix(true, false);
    const local = ray.clone().applyMatrix4(root.matrixWorld.clone().invert());
    if (Math.abs(local.direction.y) < .00001) return state.irisOpening / 100;
    const point = local.at((railY - local.origin.y) / local.direction.y, new THREE.Vector3());
    return irisArcValue(point, arc);
  }, configure, setContrast(value) { gain = value; updateAppearance(); },
  get arc() { return {...arc}; },
  get selectedPlate() { return selected; },
  dispose() { clear(); root.removeFromParent(); glowTexture.dispose(); glowMaterial.dispose();
    for (const material of owned) material.dispose(); }};
}
