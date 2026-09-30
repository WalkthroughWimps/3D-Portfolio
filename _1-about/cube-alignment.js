import * as THREE from 'three';

// Choose the most visible face, then the nearest of its four upright orientations.
// The resulting face is parallel to the camera, so perspective cannot skew its edges.
export function alignedCubeQuaternion(rotation, cameraRotation) {
  const axes = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
  ];
  const towardCamera = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraRotation);
  const normal = axes.reduce((best, axis) =>
    axis.clone().applyQuaternion(rotation).dot(towardCamera) > best.clone().applyQuaternion(rotation).dot(towardCamera)
      ? axis : best);
  let closest = null;
  let score = -1;
  for (const up of axes) {
    if (Math.abs(up.dot(normal)) > 0.5) continue;
    const right = new THREE.Vector3().crossVectors(up, normal);
    const basis = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    const candidate = cameraRotation.clone().multiply(basis.invert()).normalize();
    const similarity = Math.abs(candidate.dot(rotation));
    if (similarity > score) { score = similarity; closest = candidate; }
  }
  return closest;
}
