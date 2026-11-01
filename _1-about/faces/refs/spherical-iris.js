/** The rear mound and its wallpaper liner share one height field and X/Z UVs. */
export function refsIrisPocketRim(pocket) {
  return pocket.outerRadius;
}
export function refsIrisPocketHeight(pocket, radius) {
  if (radius <= pocket.plateauRadius) return pocket.height;
  const span = pocket.outerRadius - pocket.plateauRadius;
  const t = Math.max(0, Math.min(1, (pocket.outerRadius - radius) / span));
  return pocket.height * t * t * (3 - 2 * t);
}
export function createRefsIrisPocketGeometry(THREE, pocket, offset = 0, uvBounds = null) {
  const positions = [], uvs = [], indices = [], around = 128, radialSteps = 64;
  for (let j = 0; j <= radialSteps; j++) {
    const r = pocket.outerRadius * (1 - j / radialSteps);
    const y = pocket.rearY + offset + refsIrisPocketHeight(pocket, r);
    for (let i = 0; i <= around; i++) {
      const a = 2 * Math.PI * i / around;
      const x = pocket.x + r * Math.cos(a), z = pocket.z + r * Math.sin(a);
      positions.push(x, y, z);
      uvs.push(uvBounds ? (x - uvBounds.minX) / uvBounds.width : x / .5,
        uvBounds ? (z - uvBounds.minZ) / uvBounds.height : z / .5);
      if (j && i) {
        const here = j * (around + 1) + i;
        const last = here - (around + 1);
        indices.push(last - 1, here - 1, here, last - 1, here, last);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Six shared spherical leaves from the twisting spherical iris specimen. */
export function createRefsSphericalIris(THREE, parent, options, metrics, contrast) {
  const root = new THREE.Group(); root.name = 'refs.spherical-iris'; parent.add(root);
  const mechanism = new THREE.Group(); mechanism.rotation.x = Math.PI / 2; root.add(mechanism);
  const shellMaterial = new THREE.MeshStandardMaterial({color: '#8195a1', metalness: .36,
    roughness: .56, side: THREE.DoubleSide, emissive: '#294153'});
  const frameMaterial = new THREE.MeshStandardMaterial({color: '#172a38', metalness: .28,
    roughness: .38, side: THREE.DoubleSide, emissive: '#10202d'});
  const surroundMaterial = new THREE.MeshStandardMaterial({color: '#182b3a', metalness: .31,
    roughness: .5, side: THREE.DoubleSide});
  const seamMaterial = new THREE.LineBasicMaterial({color: '#9db8c5', transparent: true, opacity: .74});
  const wellMaterial = new THREE.MeshStandardMaterial({color: '#152837', metalness: .36,
    roughness: .67, side: THREE.DoubleSide, emissive: '#29485a'});
  const materials = [shellMaterial, frameMaterial, seamMaterial, wellMaterial, surroundMaterial];
  // Extend the curved rear edge almost to the frame plane at rest. A slightly
  // shorter pullback keeps the original round 82.2 bore clear when fully open.
  const cap = 60.4 * Math.PI / 180, retractAngle = 63.5 * Math.PI / 180;
  const k = -.4, radius = 100, thickness = .52;
  const thetaSteps = 48, phiSteps = 24;
  const point = (r, theta, phi) => [r * Math.sin(theta) * Math.cos(phi),
    r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta)];
  const smooth = v => { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); };
  const halfWidth = theta => Math.acos(Math.max(-1, Math.min(1, k * Math.tan(theta / 2))));
  const bladeRadius = (theta, across) => radius + 1.1 * across * smooth(theta / .1);
  function petalGeometry() {
    const positions = [], indices = [];
    const push = p => { positions.push(...p); return positions.length / 3 - 1; };
    const quad = (a, b, c, d, reverse = false) => {
      if (reverse) indices.push(a, c, b, a, d, c);
      else indices.push(a, b, c, a, c, d);
    };
    const surface = (inset, reverse) => {
      const rows = [];
      for (let t = 0; t <= thetaSteps; t++) {
        const row = [], theta = cap * t / thetaSteps;
        for (let p = 0; p <= phiSteps; p++) {
          const across = 2 * p / phiSteps - 1;
          const phi = across * halfWidth(theta);
          const r = bladeRadius(theta, across) - inset;
          row.push(t === 0 ? (row[0] ?? push(point(r, 0, 0))) : push(point(r, theta, phi)));
        }
        rows.push(row);
      }
      for (let t = 0; t < thetaSteps; t++) for (let p = 0; p < phiSteps; p++) {
        if (t === 0) indices.push(...(reverse ?
          [rows[0][0], rows[1][p + 1], rows[1][p]] :
          [rows[0][0], rows[1][p], rows[1][p + 1]]));
        else quad(rows[t][p], rows[t + 1][p], rows[t + 1][p + 1], rows[t][p + 1], reverse);
      }
      return rows;
    };
    const outer = surface(0, false), inner = surface(thickness, true);
    for (let p = 0; p < phiSteps; p++) quad(outer[thetaSteps][p], inner[thetaSteps][p],
      inner[thetaSteps][p + 1], outer[thetaSteps][p + 1]);
    for (let t = 0; t < thetaSteps; t++) {
      quad(outer[t][0], inner[t][0], inner[t + 1][0], outer[t + 1][0]);
      quad(outer[t + 1][phiSteps], inner[t + 1][phiSteps], inner[t][phiSteps], outer[t][phiSteps]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  const shellGeometry = petalGeometry();
  const seamGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({length: 49}, (_, t) => {
    const theta = cap * t / 48;
    return new THREE.Vector3(...point(bladeRadius(theta, 1) + .08, theta, halfWidth(theta)));
  }));
  // A fixed relieved return keeps the 82.2 bore round at every opening.
  // Its spherical radius stays outside the leaves through their whole sweep.
  const collarGeometry = new THREE.RingGeometry(91.5, 103, 128);
  const collar = new THREE.Mesh(collarGeometry, surroundMaterial);
  collar.name = 'refs.iris.collar'; collar.position.z = 48.5; mechanism.add(collar);
  // Carry the cabinet finish to the relieved return, without a separate
  // decorative ring. Native XY maps to cabinet X/Z after the iris rotation.
  const collarUv = collarGeometry.getAttribute('uv');
  const collarVertices = collarGeometry.getAttribute('position');
  const lipGeometry = new THREE.RingGeometry(82.2, 91.5, 128);
  const lipVertices = lipGeometry.getAttribute('position');
  for (let i = 0; i <= 128; i++) lipVertices.setZ(i, 12);
  lipGeometry.computeVertexNormals();
  const lip = new THREE.Mesh(lipGeometry, frameMaterial);
  lip.name = 'refs.iris.fixed-relieved-return'; lip.position.z = 48.5; mechanism.add(lip);
  // The return's inner edge lies on a sphere outside every moving leaf.
  // Continue that surface to a dark rear display seat, leaving a measured
  // six-source-unit bay behind the deepest leaf for the future lens.
  const wellFrontZ = 60.5, wellBackZ = -62;
  const wellRadius = Math.hypot(82.2, wellFrontZ);
  const wellBackRadius = Math.sqrt(wellRadius ** 2 - wellBackZ ** 2);
  const wellPositions = [], wellIndices = [], around = 128, along = 80;
  for (let j = 0; j <= along; j++) {
    const z = wellFrontZ + (wellBackZ - wellFrontZ) * j / along;
    const r = Math.sqrt(wellRadius ** 2 - z ** 2);
    for (let i = 0; i <= around; i++) {
      const a = 2 * Math.PI * i / around;
      wellPositions.push(r * Math.cos(a), r * Math.sin(a), z);
      if (j && i) {
        const here = j * (around + 1) + i, previous = here - (around + 1);
        wellIndices.push(previous - 1, here - 1, here, previous - 1, here, previous);
      }
    }
  }
  const wellGeometry = new THREE.BufferGeometry();
  wellGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wellPositions, 3));
  wellGeometry.setIndex(wellIndices); wellGeometry.computeVertexNormals();
  const well = new THREE.Mesh(wellGeometry, wellMaterial);
  well.name = 'refs.iris.opaque-inner-well'; mechanism.add(well);
  const displayMount = new THREE.Group();
  displayMount.name = 'refs.iris.display-mount'; displayMount.position.z = wellBackZ;
  mechanism.add(displayMount);
  const seatGeometry = new THREE.CircleGeometry(wellBackRadius, 128);
  const seat = new THREE.Mesh(seatGeometry, wellMaterial);
  seat.name = 'refs.iris.opaque-display-seat'; displayMount.add(seat);
  const leaves = [];
  for (let i = 0; i < 6; i++) {
    const mount = new THREE.Group(); mount.rotation.z = i * Math.PI / 3;
    const sweep = new THREE.Group(), retract = new THREE.Group(), petal = new THREE.Group();
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    shell.name = 'refs.iris.leaf-' + (i + 1);
    const seam = new THREE.Line(seamGeometry, seamMaterial);
    petal.add(shell, seam); retract.add(petal); sweep.add(retract); mount.add(sweep); mechanism.add(mount);
    leaves.push({sweep, retract, petal});
  }
  const surround = new THREE.Mesh(new THREE.BufferGeometry(), surroundMaterial);
  surround.name = 'refs.iris.fitted-surround'; root.add(surround);
  let disposed = false, reduced = false, suspended = false, opening = 0, target = 0, key = '';
  // The six sector/sweep rotations are about native Z, so only the inner
  // twist and Y retract can change a vertex's depth. Measure their complete
  // sweep once from the actual shared mesh, including both leaf surfaces.
  const vertex = shellGeometry.getAttribute('position');
  let deepestZ = 0;
  const radialStep = .5, radialDepth = new Float64Array(256).fill(Infinity);
  for (let step = 0; step <= 256; step++) {
    const motion = smooth(step / 256);
    const twist = motion * -8 * Math.PI / 180;
    const retract = motion * retractAngle;
    const ct = Math.cos(twist), st = Math.sin(twist);
    const cr = Math.cos(retract), sr = Math.sin(retract);
    for (let i = 0; i < vertex.count; i++) {
      const twistedX = ct * vertex.getX(i) - st * vertex.getY(i);
      const twistedY = st * vertex.getX(i) + ct * vertex.getY(i);
      const x = cr * twistedX + sr * vertex.getZ(i);
      const z = -sr * twistedX + cr * vertex.getZ(i);
      deepestZ = Math.min(deepestZ, z);
      const radial = Math.hypot(x, twistedY);
      radialDepth[Math.min(radialDepth.length - 1, Math.floor(radial / radialStep))] =
        Math.min(radialDepth[Math.min(radialDepth.length - 1, Math.floor(radial / radialStep))], z);
    }
  }
  const crownZ = Math.max(...Array.from({length: vertex.count}, (_, i) => vertex.getZ(i)));
  // Seam rises .08 source units above the shell; include it in the flush crown.
  const closedCrownZ = Math.max(crownZ, ...Array.from({length: seamGeometry.getAttribute('position').count},
    (_, i) => seamGeometry.getAttribute('position').getZ(i)));
  let pocket = null;
  function makeSurround(frame, collarY, scale) {
    const positions = [], uvs = [], indices = [], steps = 128;
    const rx = frame.width / 2, rz = frame.height / 2, outer = 103 * scale;
    const rings = [[rx, rz, collarY], [outer, outer, collarY]];
    for (let j = 0; j < rings.length; j++) {
      const [xRadius, zRadius, y] = rings[j];
      for (let i = 0; i <= steps; i++) {
        const a = 2 * Math.PI * i / steps;
        const x = xRadius * Math.cos(a), z = zRadius * Math.sin(a);
        positions.push(x, y, z);
        uvs.push((frame.x + x) / .5, (frame.z + z) / .5);
        if (j && i) {
          const here = j * (steps + 1) + i, previous = here - (steps + 1);
          indices.push(previous - 1, here - 1, here, previous - 1, here, previous);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  function pose(value) {
    opening = value;
    const motion = smooth(value);
    for (const leaf of leaves) {
      leaf.sweep.rotation.z = motion * 28 * Math.PI / 180;
      leaf.retract.rotation.y = motion * retractAngle;
      leaf.petal.rotation.z = motion * -8 * Math.PI / 180;
    }
  }
  function configure(next, cabinet) {
    if (disposed) return;
    root.visible = Boolean(next.cabinetEnabled && next.dummyIrisEnabled);
    target = next.irisOpening / 100;
    if (reduced) pose(target);
    const frame = cabinet.faceFrames.aperture;
    const nextKey = JSON.stringify([frame, cabinet.frontY, cabinet.rearY, next.irisSize]);
    if (nextKey === key) return;
    key = nextKey;
    const scale = next.irisSize * Math.min(frame.width, frame.height) / (2 * 103);
    mechanism.scale.setScalar(scale);
    // The prototype collar is the visible frame. Seat that frame at the
    // cabinet front; its curved leaves can crown outward in front of it.
    const collarY = cabinet.frontY - .003;
    const originY = collarY + 48.5 * scale;
    mechanism.position.set(0, originY, 0);
    root.position.set(frame.x, 0, frame.z);
    for (let i = 0; i < collarVertices.count; i++)
      collarUv.setXY(i, (frame.x + collarVertices.getX(i) * scale) / .5,
        (frame.z + collarVertices.getY(i) * scale) / .5);
    collarUv.needsUpdate = true;
    const rearY = cabinet.rearY;
    const height = Math.max(0, originY - Math.min(deepestZ, wellBackZ) * scale - rearY + .004);
    if (height > .00401) {
      let requiredRadius = 0;
      for (let i = 0; i < radialDepth.length; i++) {
        if (Number.isFinite(radialDepth[i]) && originY - radialDepth[i] * scale > rearY - .002)
          requiredRadius = (i + 1) * radialStep * scale;
      }
      for (let j = 0; j <= along; j++) {
        const z = wellFrontZ + (wellBackZ - wellFrontZ) * j / along;
        if (originY - z * scale > rearY - .002)
          requiredRadius = Math.max(requiredRadius,
            Math.sqrt(wellRadius ** 2 - z ** 2) * scale);
      }
      const plateauRadius = requiredRadius + Math.max(.012, 4 * scale);
      pocket = {x: frame.x, z: frame.z, rearY, height, plateauRadius,
        outerRadius: plateauRadius + Math.max(.07, .2 * Math.min(frame.width, frame.height))};
    } else pocket = null;
    const replacement = makeSurround(frame, collarY, scale);
    surround.geometry.dispose(); surround.geometry = replacement;
  }
  function setContrast(gain) {
    const v = Math.max(0, Math.min(2.4, Number.isFinite(gain) ? gain : .08));
    frameMaterial.emissiveIntensity = .02 + .22 * v / 2.4;
    surroundMaterial.emissiveIntensity = .005 + .055 * v / 2.4;
    shellMaterial.emissiveIntensity = .004 + .055 * v / 2.4;
    wellMaterial.emissiveIntensity = .004 + .07 * v / 2.4;
    seamMaterial.opacity = .42 + .32 * v / 2.4;
  }
  configure(options, metrics); pose(target); setContrast(contrast);
  return {root, configure, setContrast, setCabinetMaterials(sources) {
    const source = sources?.face;
    if (!source) return;
    if (surroundMaterial.map !== source.map || surroundMaterial.bumpMap !== source.bumpMap) {
      surroundMaterial.map = source.map; surroundMaterial.bumpMap = source.bumpMap;
      surroundMaterial.needsUpdate = true;
    }
    surroundMaterial.color.copy(source.color);
    surroundMaterial.emissive.copy(source.emissive);
    surroundMaterial.metalness = source.metalness;
    surroundMaterial.roughness = source.roughness;
    surroundMaterial.bumpScale = source.bumpScale;
    surroundMaterial.emissiveIntensity = source.emissiveIntensity;
  }, update(dt) {
    if (disposed || suspended || !root.visible || reduced) return;
    const blend = 1 - Math.exp(-Math.max(0, dt) * 8);
    const next = opening + (target - opening) * blend;
    if (Math.abs(target - next) > .0001) pose(next); else if (opening !== target) pose(target);
  }, setReducedMotion(value) { reduced = Boolean(value); if (reduced) pose(target); },
  suspend() { suspended = true; }, resume() { suspended = false; },
  getPocket() { return pocket && {...pocket}; },
  getDisplayMount() { return displayMount; },
  getDisplayMetrics() { return {centerX: root.position.x, centerZ: root.position.z,
    radius: wellBackRadius * mechanism.scale.x, nativeRadius: wellBackRadius,
    nativePlaneZ: wellBackZ, nativeFrontLimitZ: 47.5, nativeFrameZ: 48.5,
    planeY: mechanism.position.y - wellBackZ * mechanism.scale.x,
    leafRearY: mechanism.position.y - deepestZ * mechanism.scale.x}; },
  getState() { return {opening, target, scale: mechanism.scale.x,
    crownY: mechanism.position.y - closedCrownZ * mechanism.scale.x,
    collarY: mechanism.position.y - 48.5 * mechanism.scale.x,
    leafRearY: mechanism.position.y - deepestZ * mechanism.scale.x,
    lipOuterRadius: 82.2,
    pocketApexY: pocket && pocket.rearY + pocket.height}; },
  dispose() { if (disposed) return; disposed = true; root.removeFromParent();
    for (const geometry of [shellGeometry, seamGeometry, collarGeometry, lipGeometry,
      wellGeometry, seatGeometry,
      surround.geometry]) geometry.dispose();
    for (const material of materials) material.dispose();
  }};
}
