/** Temporary closed iris: an elliptical annulus and a true spherical cap. */
export function createRefsIrisPlaceholder(THREE, parent, options, cabinet, contrast = .5) {
  const root = new THREE.Group(); root.name = 'refs.dummy-iris'; parent.add(root);
  const bronze = new THREE.MeshStandardMaterial({color: '#795b42', metalness: .64,
    roughness: .32, side: THREE.DoubleSide, emissive: '#a46b38'});
  const door = new THREE.MeshStandardMaterial({color: '#152b3b', metalness: .38,
    roughness: .46, side: THREE.DoubleSide, emissive: '#17364c'});
  let owned = [], key = '', disposed = false;
  function clear() {
    for (const mesh of owned) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    owned = [];
  }
  function add(name, geometry, material) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    root.add(mesh); owned.push(mesh); return mesh;
  }
  function configure(next, metrics) {
    if (disposed) return;
    root.visible = Boolean(next.cabinetEnabled && next.dummyIrisEnabled);
    const frame = metrics.faceFrames.aperture;
    const nextKey = JSON.stringify([frame, metrics.frontY, next.irisBulgeRatio]);
    if (nextKey === key) return;
    key = nextKey; clear();
    const rx = frame.width / 2, rz = frame.height / 2;
    const inner = .94, edgeY = metrics.frontY + .0007;
    const ringGeometry = new THREE.RingGeometry(inner, 1, 128);
    ringGeometry.scale(rx, rz, 1);
    const ring = add('refs.dummy-iris.frame', ringGeometry, bronze);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(frame.x, edgeY, frame.z);

    // The unit sphere section has base radius 1 and sagitta h. Scaling X/Z
    // follows the edited aperture while Y retains a shallow physical bulge.
    const h = Math.max(.03, Math.min(1, next.irisBulgeRatio));
    const sphereRadius = (1 + h * h) / (2 * h);
    const baseY = sphereRadius - h;
    const thetaMax = Math.asin(1 / sphereRadius);
    const radial = 48, around = 128, vertices = [], normals = [], indices = [];
    const depthScale = Math.min(rx, rz) * inner;
    vertices.push(frame.x, edgeY - h * depthScale, frame.z);
    normals.push(0, -1, 0);
    for (let j = 1; j <= radial; j++) {
      const theta = thetaMax * j / radial;
      const r = sphereRadius * Math.sin(theta);
      const sag = sphereRadius * Math.cos(theta) - baseY;
      for (let i = 0; i <= around; i++) {
        const angle = i * 2 * Math.PI / around;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        vertices.push(frame.x + rx * inner * r * Math.cos(angle),
          edgeY - sag * depthScale,
          frame.z + rz * inner * r * sin);
        // Inverse-scale the sphere normal so stretched apertures shade smoothly.
        const nx = Math.sin(theta) * cos / (rx * inner);
        const ny = -Math.cos(theta) / depthScale;
        const nz = Math.sin(theta) * sin / (rz * inner);
        const length = Math.hypot(nx, ny, nz);
        normals.push(nx / length, ny / length, nz / length);
      }
    }
    for (let i = 0; i < around; i++) indices.push(0, 1 + i, 2 + i);
    for (let j = 0; j < radial - 1; j++) for (let i = 0; i < around; i++) {
      const a = 1 + j * (around + 1) + i, b = a + around + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    add('refs.dummy-iris.closed-spherical-cap', geometry, door);
  }
  function setContrast(gain) {
    const value = Math.max(0, Math.min(2.4, Number.isFinite(gain) ? gain : .08));
    bronze.emissiveIntensity = .025 + .23 * value / 2.4;
    door.emissiveIntensity = .004 + .055 * value / 2.4;
  }
  configure(options, cabinet); setContrast(contrast);
  return {root, configure, setContrast, dispose() {
    if (disposed) return; disposed = true; clear(); root.removeFromParent();
    bronze.dispose(); door.dispose();
  }};
}
