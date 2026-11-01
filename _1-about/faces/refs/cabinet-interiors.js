const IDS = ['leftCrescent', 'rightCrescent'];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Intersect the actual doorway outline rather than assuming a rectangular bay.
function openingSpan(contour, z) {
  const hits = [];
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    if ((a.z <= z && b.z > z) || (b.z <= z && a.z > z))
      hits.push(a.x + (z - a.z) * (b.x - a.x) / (b.z - a.z));
  }
  if (hits.length < 2) return null;
  return [Math.min(...hits), Math.max(...hits)];
}

function safeSpan(contour, z0, z1) {
  let left = -Infinity, right = Infinity;
  for (let i = 0; i <= 8; i++) {
    const span = openingSpan(contour, z0 + (z1 - z0) * i / 8);
    if (!span) return null;
    left = Math.max(left, span[0]); right = Math.min(right, span[1]);
  }
  return right > left ? [left, right] : null;
}

export function createRefsCabinetInteriors(THREE, doors, options, metrics, contrast = .08) {
  const shelf = new THREE.MeshStandardMaterial({side: THREE.DoubleSide});
  const ceramic = new THREE.MeshStandardMaterial({color: '#b6ada1', roughness: .43,
    metalness: .08, emissive: '#c2a276'});
  const jade = new THREE.MeshStandardMaterial({color: '#4f9a88', roughness: .32,
    metalness: .12, emissive: '#5b9f97'});
  const brass = new THREE.MeshStandardMaterial({color: '#b99a61', roughness: .3,
    metalness: .55, emissive: '#a7773e'});
  const ink = new THREE.MeshStandardMaterial({color: '#453948', roughness: .7});
  const materials = [shelf, ceramic, jade, brass, ink];
  const owned = [], groups = new Map();
  let currentMetrics = metrics, lastKey = '', disposed = false;
  let gain = contrast;
  function add(group, name, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; group.add(mesh); owned.push(mesh); return mesh;
  }
  function clear() {
    for (const mesh of owned) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    owned.length = 0;
    for (const group of groups.values()) group.removeFromParent();
    groups.clear();
  }
  function appearance(sources) {
    if (disposed) return;
    if (sources?.side) {
      shelf.copy(sources.side); // Cabinet owns the shared map and bump textures.
      shelf.needsUpdate = true;
      shelf.side = THREE.DoubleSide;
    }
    const value = clamp(Number.isFinite(gain) ? gain : .08, .08, 2.4);
    for (const material of [ceramic, jade, brass])
      material.emissiveIntensity = .005 + .075 * value / 2.4;
  }
  function build() {
    clear();
    for (const id of IDS) {
      const portal = doors.getPortal(id);
      if (!portal) continue;
      const {contour, frame, interiorRoot} = portal;
      const group = new THREE.Group(); group.name = `refs.interior.${id}`;
      interiorRoot.add(group); groups.set(id, group);
      const bottom = Math.min(...contour.map(p => p.z));
      const top = Math.max(...contour.map(p => p.z));
      const height = top - bottom;
      const depth = currentMetrics.depth;
      const shelfDepth = Math.min(.055, depth * .46);
      const worldY = currentMetrics.frontY + depth * .38;
      const localY = worldY - interiorRoot.position.y;
      const thickness = clamp(height * .013, .002, .004);
      for (const [index, fraction] of [.22, .49, .76].entries()) {
        const z = bottom + height * fraction;
        const span = safeSpan(contour, z - thickness, z + thickness);
        if (!span) continue;
        const margin = Math.min(.006, (span[1] - span[0]) * .09);
        const width = span[1] - span[0] - margin * 2;
        if (width <= .005) continue;
        const cx = (span[0] + span[1]) / 2;
        const platform = add(group, `refs.interior.${id}.shelf.${index + 1}`,
          new THREE.BoxGeometry(width, shelfDepth, thickness), shelf);
        platform.position.set(cx - frame.x, localY, z - frame.z);

        // Each object is dimensioned against its entire vertical silhouette.
        const objectHeight = Math.min(height * .13, .039);
        const base = z + thickness / 2;
        const objectSpan = safeSpan(contour, base, base + objectHeight);
        if (!objectSpan) continue;
        const available = objectSpan[1] - objectSpan[0];
        const radius = Math.min(available * .15, objectHeight * .28, shelfDepth * .22);
        if (radius < .0015) continue;
        const x = clamp(cx, objectSpan[0] + radius * 1.5, objectSpan[1] - radius * 1.5) - frame.x;
        if (index === 0) {
          // Turned vase: a narrow foot, rounded body and visible open lip.
          const vase = add(group, `refs.interior.${id}.vase`, new THREE.LatheGeometry([
            new THREE.Vector2(radius * .53, 0), new THREE.Vector2(radius * .88, objectHeight * .23),
            new THREE.Vector2(radius, objectHeight * .48),
            new THREE.Vector2(radius * .55, objectHeight * .76),
            new THREE.Vector2(radius * .74, objectHeight)], 12), id === IDS[0] ? jade : ceramic);
          vase.rotation.x = Math.PI / 2;
          vase.position.set(x, localY, base - frame.z);
        } else if (index === 1) {
          const body = add(group, `refs.interior.${id}.figurine.body`,
            new THREE.ConeGeometry(radius * .85, objectHeight * .66, 9), id === IDS[0] ? brass : jade);
          body.rotation.x = Math.PI / 2;
          body.position.set(x, localY, base + objectHeight * .33 - frame.z);
          const head = add(group, `refs.interior.${id}.figurine.head`,
            new THREE.SphereGeometry(radius * .48, 10, 8), ceramic);
          head.position.set(x, localY, base + objectHeight * .77 - frame.z);
        } else {
          const bookWidth = Math.min(available * .52, radius * 3.3);
          for (let j = 0; j < 3; j++) {
            const book = add(group, `refs.interior.${id}.book.${j + 1}`,
              new THREE.BoxGeometry(bookWidth / 3.7, shelfDepth * .42,
                objectHeight * (.72 + j * .09)), [ink, brass, jade][(j + Number(id === IDS[1])) % 3]);
            book.position.set(x + (j - 1) * bookWidth / 3.3, localY,
              base + objectHeight * (.72 + j * .09) / 2 - frame.z);
          }
        }
      }
    }
  }
  function configure(next, metrics) {
    if (disposed) return;
    currentMetrics = metrics;
    const key = JSON.stringify([metrics.depth, metrics.frontY, metrics.rearY,
      ...IDS.map(id => doors.getPortal(id)?.contour)]);
    if (key !== lastKey) { lastKey = key; build(); }
    for (const group of groups.values())
      group.visible = Boolean(next.cabinetEnabled && next.cabinetFrontEnabled && !next.cabinetCutaway);
  }
  configure(options, metrics);
  return {configure, setCabinetMaterials: appearance,
    setContrast(value) { gain = value; appearance(); },
    dispose() { if (disposed) return; disposed = true; clear();
      for (const material of materials) material.dispose(); }};
}
