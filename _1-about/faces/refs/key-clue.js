import {keyClueBounds, keyCluePaths} from '../../notes/key-clue.js';

// One thin, combined ribbon follows the five user-drawn strokes. Coordinates
// stay in the moving door's local frame, including for alternate door types.
export function createPlaqueKeyGeometry(THREE, frame, pivot, faceY) {
  const width = Math.min(frame.width * .76,
    frame.height * .77 * keyClueBounds.width / keyClueBounds.height);
  const thickness = Math.max(.00065, Math.min(frame.height * .014, width * .012));
  const positions = [], indices = [];
  const point = ([x, y]) => ({x: frame.x - pivot.x + (x - .5) * width,
    z: frame.z - pivot.z + (keyClueBounds.height / 2 - y) * width});
  for (const path of keyCluePaths) {
    for (let i = 1; i < path.length; i++) {
      const a = point(path[i - 1]), b = point(path[i]);
      const dx = b.x - a.x, dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      if (length < 1e-7) continue;
      const ox = -dz / length * thickness / 2;
      const oz = dx / length * thickness / 2;
      const j = positions.length / 3;
      positions.push(a.x + ox, faceY - .0012, a.z + oz,
        a.x - ox, faceY - .0012, a.z - oz,
        b.x + ox, faceY - .0012, b.z + oz,
        b.x - ox, faceY - .0012, b.z - oz);
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
