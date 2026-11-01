import * as THREE from 'three';
import { SOURCE_SCALE } from './marker-player-model.mjs';
import { sampleWorldTrack } from './world-track.mjs';

const ARTWORK_PARTS = [
  { closed: [7], open: [1, 2, 3, 4, 5, 6] },
  { closed: [9], open: [10, 11, 12, 13] },
];

// Frame the printed surface, not the moving box and lid surrounding it.
export function gameArtworkView({ data, values, parts, game, frame, open, aspect, fov }) {
  const ids = ARTWORK_PARTS[game][open ? 'open' : 'closed'];
  const bounds = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  let artworkRotation = new THREE.Quaternion();
  for (const id of ids) {
    const sample = sampleWorldTrack(data, values, frame, id);
    if (Math.max(...sample.slice(7)) <= .001) continue;
    const rotation = new THREE.Quaternion().fromArray(sample, 3);
    if (id === ids[0]) artworkRotation = rotation;
    matrix.compose(new THREE.Vector3().fromArray(sample).multiplyScalar(SOURCE_SCALE), rotation, new THREE.Vector3().fromArray(sample, 7));
    bounds.union(parts[id].obj.geometry.boundingBox.clone().applyMatrix4(matrix));
  }
  if (bounds.isEmpty()) return null;

  // The original box artwork has a half-turn in its UVs. The board UVs do not.

  const up = new THREE.Vector3(open ? 0 : -1, open ? 1 : 0, 0).applyQuaternion(artworkRotation).normalize();
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(artworkRotation)
    .addScaledVector(up, open ? .12 : .08).normalize();
  const right = new THREE.Vector3().crossVectors(up, direction).normalize();
  const screenUp = new THREE.Vector3().crossVectors(direction, right).normalize();
  const center = bounds.getCenter(new THREE.Vector3());
  const tanY = Math.tan(fov * Math.PI / 360), tanX = tanY * aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(x, y, z).sub(center);
    distance = Math.max(distance,
      point.dot(direction) + Math.abs(point.dot(right)) / (tanX * .82),
      point.dot(direction) + Math.abs(point.dot(screenUp)) / (tanY * .80));
  }
  return { position: center.clone().addScaledVector(direction, Math.max(distance, .6)), target: center, up: screenUp };
}