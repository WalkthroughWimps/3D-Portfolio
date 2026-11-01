// Placement distances are in world units; adjust these together for each tuning pass.
export const PLACEMENT_CONFIG = Object.freeze({
  shiftSteps: Object.freeze([.025, .05, .075]),
  supportProbeReach: .04,
  obstacleProbeReach: .5,
  supportTolerance: .012,
  alignmentThreshold: .7,
  clearanceMargin: .003,
  reliefCap: .015,
  heightEpsilon: 1e-7
});

// Only identities tied to a specific glTF node or explicitly named procedural
// surface are stable enough to follow an independently moving About mesh.
export function aboutSourceId(association, semanticId) {
  if (typeof semanticId === 'string' && /^[a-zA-Z0-9:._-]{1,120}$/.test(semanticId))
    return `about:plane:source:owned:${semanticId}`;
  if (Number.isInteger(association?.nodes) && association.nodes >= 0 &&
      (association.primitives === undefined || Number.isInteger(association.primitives) && association.primitives >= 0))
    return `about:plane:source:gltf:${association.nodes}:${association.primitives ?? 0}`;
  return null;
}

// Version 2 keeps the selected surface point separate from placement offsets.
export function makePlane(THREE, source, hitPoint, normal, tangent, displacement, clearance) {
  const inverse = new THREE.Matrix4().copy(source.matrixWorld).invert();
  const localPoint = hitPoint.clone().applyMatrix4(inverse);
  const localVector = vector => vector.clone().transformDirection(inverse).multiplyScalar(
    vector.clone().applyMatrix4(inverse).sub(new THREE.Vector3().applyMatrix4(inverse)).length());
  const localNormal = normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(source.matrixWorld).invert()).normalize();
  const localTangent = tangent.clone().transformDirection(inverse);
  localTangent.addScaledVector(localNormal, -localTangent.dot(localNormal)).normalize();
  return {version: 2, point: localPoint.toArray(), normal: localNormal.toArray(), tangent: localTangent.toArray(),
    displacement: localVector(displacement).toArray(), clearance: localVector(clearance).toArray()};
}

export function planeWorld(THREE, source, plane, point, normal, tangent) {
  point.fromArray(plane.point);
  if (plane.version === 2) point.add(new THREE.Vector3().fromArray(plane.displacement)).add(new THREE.Vector3().fromArray(plane.clearance));
  point.applyMatrix4(source.matrixWorld);
  normal.fromArray(plane.normal).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(source.matrixWorld));
  tangent.fromArray(plane.tangent).transformDirection(source.matrixWorld);
  tangent.addScaledVector(normal, -tangent.dot(normal)).normalize();
}

// Bounded probes run only while placing. Prefer the selected point, then small shifts.
export function fitSurface(THREE, {point, normal, tangent, source, candidates, half, layer, accepts}) {
  const up = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  const ray = new THREE.Raycaster();
  if (layer !== undefined) ray.layers.set(layer);
  const offsets = [[0,0], ...PLACEMENT_CONFIG.shiftSteps.flatMap(d => [[d,0],[-d,0],[0,d],[0,-d],[d,d],[-d,d],[d,-d],[-d,-d]])];
  const {clearanceMargin, reliefCap, supportProbeReach, obstacleProbeReach, supportTolerance, alignmentThreshold, heightEpsilon} = PLACEMENT_CONFIG;
  for (const reliefLimit of [0, reliefCap - clearanceMargin]) for (const [x,y] of offsets) {
    const shift = tangent.clone().multiplyScalar(x).addScaledVector(up,y);
    let valid = !accepts || accepts(point.clone().add(shift)), highest = 0;
    for (let iy = -1; iy <= 1 && valid; iy++) for (let ix = -1; ix <= 1; ix++) {
      const sample = point.clone().add(shift).addScaledVector(tangent, ix * half).addScaledVector(up, iy * half);
      ray.set(sample.clone().addScaledVector(normal, supportProbeReach), normal.clone().negate());
      ray.near = 0; ray.far = supportProbeReach * 2;
      const hits = ray.intersectObjects(candidates, false);
      const surface = hits.find(hit => hit.object === source && hit.face &&
        Math.abs(hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(source.matrixWorld)).dot(normal)) > alignmentThreshold);
      if (!surface || Math.abs(surface.point.clone().sub(sample).dot(normal)) > supportTolerance) { valid = false; break; }
      ray.set(sample.clone().addScaledVector(normal, obstacleProbeReach), normal.clone().negate());
      ray.far = obstacleProbeReach;
      for (const hit of ray.intersectObjects(candidates, false)) {
        const height = hit.point.clone().sub(sample).dot(normal);
        if (height > reliefLimit + heightEpsilon) { valid = false; break; }
        highest = Math.max(highest, Math.min(height, reliefLimit));
      }
    }
    if (valid) return {displacement: shift, clearance: normal.clone().multiplyScalar(highest + clearanceMargin)};
  }
  return null;
}
