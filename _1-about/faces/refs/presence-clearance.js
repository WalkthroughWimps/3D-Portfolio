// The borrowed Refs backing is a concave triangle skin. Its most forward
// triangle at a given radius bounds every possible screen-upright roll.
export const REFS_SKIN_MARGIN = .006;
const REST_FRONT_Y = -.08;

function triangleRadius(a, b, c) {
  const cross = (p, q) => p.x * q.z - p.z * q.x;
  if ((cross(a, b) >= 0 && cross(b, c) >= 0 && cross(c, a) >= 0) ||
      (cross(a, b) <= 0 && cross(b, c) <= 0 && cross(c, a) <= 0)) return 0;
  let radius = Infinity;
  for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const dx = q.x - p.x, dz = q.z - p.z;
    const t = Math.max(0, Math.min(1, -(p.x * dx + p.z * dz) / (dx * dx + dz * dz || 1)));
    radius = Math.min(radius, Math.hypot(p.x + t * dx, p.z + t * dz));
  }
  return radius;
}

export function createRefsSkinProfile(THREE, cube, backing, frame) {
  cube.updateWorldMatrix(true, false);
  backing.updateWorldMatrix(true, true);
  const origin = new THREE.Matrix4().compose(frame.position, frame.quaternion,
    new THREE.Vector3(1, 1, 1)).invert().multiply(cube.matrixWorld.clone().invert());
  const triangles = [];
  let supportRadius = 0, outerY = Infinity;
  backing.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes.position) return;
    const positions = node.geometry.attributes.position, indices = node.geometry.index;
    const transform = origin.clone().multiply(node.matrixWorld);
    const point = i => new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(transform);
    for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
      const a = point(indices ? indices.getX(i) : i);
      const b = point(indices ? indices.getX(i + 1) : i + 1);
      const c = point(indices ? indices.getX(i + 2) : i + 2);
      const minY = Math.min(a.y, b.y, c.y);
      triangles.push({radius: triangleRadius(a, b, c), y: minY});
      supportRadius = Math.max(supportRadius, Math.hypot(a.x, a.z), Math.hypot(b.x, b.z), Math.hypot(c.x, c.z));
      outerY = Math.min(outerY, minY);
    }
  });
  if (!triangles.length) throw new Error('Refs backing has no triangles');
  triangles.sort((a, b) => a.radius - b.radius);
  for (let i = 1; i < triangles.length; i++) triangles[i].y = Math.min(triangles[i].y, triangles[i - 1].y);
  return {
    supportRadius,
    minimumY(radius) {
      if (radius >= supportRadius - REFS_SKIN_MARGIN) return outerY;
      let low = 0, high = triangles.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (triangles[mid].radius <= radius) low = mid + 1;
        else high = mid;
      }
      return triangles[Math.max(0, low - 1)].y;
    }
  };
}

export function measureRefsAssembly(THREE, board, profile) {
  // Measure every owned mesh, including hidden wallpaper and future additions.
  // The transparent sketch plane is only an editing map, not cabinet hardware.
  board.placement.updateWorldMatrix(true, true);
  const inverse = board.placement.matrixWorld.clone().invert();
  let radius = 0, rearY = -Infinity, frontY = Infinity;
  board.placement.traverse(node => {
    if (!node.isMesh || node === board.sketch || !node.geometry?.attributes.position) return;
    const transform = inverse.clone().multiply(node.matrixWorld);
    const positions = node.geometry.attributes.position, point = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(transform);
      radius = Math.max(radius, Math.hypot(point.x, point.z));
      rearY = Math.max(rearY, point.y);
      frontY = Math.min(frontY, point.y);
    }
  });
  if (!Number.isFinite(rearY)) { rearY = REST_FRONT_Y; frontY = REST_FRONT_Y; }
  const options = board.getOptions();
  const rollRadius = Math.hypot(options.x, options.y) + options.scale * radius;
  const skinY = profile.minimumY(rollRadius);
  const safeOffset = skinY - options.scale * rearY - REFS_SKIN_MARGIN;
  const desiredTuck = Math.max(0, REST_FRONT_Y - options.scale * frontY);
  const cabinetFrontY = options.scale * board.getMetrics().frontY;
  const cabinetTuck = REST_FRONT_Y - cabinetFrontY;
  const fittingDepth = options.cabinetDepth + (safeOffset - cabinetTuck) / options.scale;
  return {rollRadius, supportRadius: profile.supportRadius, skinY,
    rearY: options.scale * rearY, frontY: options.scale * frontY,
    safeOffset, desiredTuck, cabinetTuck,
    maxDepth: Math.max(.04, Math.min(.45, fittingDepth)),
    deployed: Math.min(0, safeOffset),
    tucked: Math.min(safeOffset, desiredTuck)};
}

export function createRefsPresence() {
  let focused = false, offset = 0;
  return {
    get focused() { return focused; },
    get offset() { return offset; },
    reset(value = 0) { focused = false; offset = value; },
    update(dot, dt, clearance, reduced, canTuck) {
      focused = focused ? dot > .77 : dot > .88;
      const deployed = clearance?.deployed ?? 0;
      // A live size or placement edit may narrow the bowl while parked.
      // Evacuate the new skin envelope before drawing the edited geometry.
      offset = Math.min(offset, clearance?.safeOffset ?? 0);
      // A selector exchange may begin from a parked face. Extend before its
      // moving parts are rendered, then wait for idle before retracting.
      if (!canTuck) { offset = deployed; return offset; }
      const target = focused ? deployed : Math.max(deployed, clearance?.tucked ?? deployed);
      const blend = reduced ? 1 : 1 - Math.exp(-Math.max(0, dt) * 7);
      offset += (target - offset) * blend;
      if (Math.abs(target - offset) < .0002) offset = target;
      return offset;
    }
  };
}
