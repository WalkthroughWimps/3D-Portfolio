import { Box3, Ray, Sphere, Vector3 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';

// Walk a camera-sized sphere along the entire move, including large wheel
// jumps. Return the last clear fraction instead of allowing a thin wall to be
// skipped merely because the destination is clear on its other side.
export function clearCameraFraction(from, to, radius, blocked) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-9) return 1;
  const steps = Math.max(1, Math.ceil(distance / (radius * 0.5)));
  const at = t => blocked(from.x + dx * t, from.y + dy * t, from.z + dz * t, radius);
  let safe = 0;
  for (let step = 1; step <= steps; step++) {
    const next = step / steps;
    if (at(next)) {
      let contact = next;
      for (let i = 0; i < 10; i++) {
        const mid = (safe + contact) / 2;
        if (at(mid)) contact = mid; else safe = mid;
      }
      return safe;
    }
    safe = next;
  }
  return 1;
}

export function createCabinetCameraCollision(root) {
  // Build once from the actual static model, including the screen and props.
  // Closest-point sphere checks work on either side of a triangle, regardless
  // of its material sidedness or whether a shell has outward-facing normals.
  const tree = new Octree().fromGraphNode(root);
  const bounds = new Box3().setFromObject(root);
  const expanded = new Box3(), sphere = new Sphere(), ray = new Ray();
  const previous = new Vector3(), desired = new Vector3(), direction = new Vector3();
  const from = new Vector3(), to = new Vector3(), closest = new Vector3();
  const candidates = [];
  let cameraRef = null;
  const blocked = (x, y, z, radius) => {
    sphere.center.set(x, y, z); sphere.radius = radius;
    candidates.length = 0;
    tree.getSphereTriangles(sphere, candidates);
    return candidates.some(triangle => {
      triangle.closestPointToPoint(sphere.center, closest);
      return closest.distanceToSquared(sphere.center) < radius * radius;
    });
  };
  return {
    constrain(camera) {
      camera.updateWorldMatrix(true, false);
      camera.getWorldPosition(desired);
      if (cameraRef !== camera) { cameraRef = camera; previous.copy(desired); return false; }
      const distance = previous.distanceTo(desired);
      if (distance < 1e-9) return false;
      // Protect the near-plane corners too, so the shell never clips into view.
      const halfHeight = camera.near * Math.tan((camera.fov || 45) * Math.PI / 360);
      const radius = Math.max(0.035, Math.hypot(camera.near, halfHeight, halfHeight * (camera.aspect || 1)) + 0.005);
      expanded.copy(bounds).expandByScalar(radius);
      direction.subVectors(desired, previous).normalize();
      from.copy(previous); to.copy(desired);
      // Only sample the part near the model, keeping distant pan/zoom cheap.
      if (!expanded.containsPoint(from) && !ray.set(previous, direction).intersectBox(expanded, from)) {
        previous.copy(desired); return false;
      }
      if (from.distanceTo(previous) > distance) { previous.copy(desired); return false; }
      if (!expanded.containsPoint(to)) ray.set(desired, direction.clone().negate()).intersectBox(expanded, to);
      const fraction = clearCameraFraction(from, to, radius, blocked);
      const collided = fraction < 1;
      if (collided) {
        desired.copy(from).lerp(to, fraction);
        camera.position.copy(desired);
        camera.parent?.worldToLocal(camera.position);
        camera.updateMatrixWorld(true);
      }
      previous.copy(desired);
      return collided;
    },
    dispose() { tree.subTrees.length = 0; tree.triangles.length = 0; candidates.length = 0; cameraRef = null; }
  };
}
