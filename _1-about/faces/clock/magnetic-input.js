import * as THREE from 'three';

/** Clock-owned receiver; the shared interior driver stops on the other side of both skins. */
export function addMagneticInput(root, inputRotor, carrier) {
  const mount = root.getObjectByName('clock-fixed-mount');
  if (!mount || !inputRotor || !carrier) return null;
  const radius = .046, wheelY = -.557, innerY = -.355;
  const silver = new THREE.MeshStandardMaterial({color: 0x91a8ba, metalness: .78, roughness: .3});
  const brass = new THREE.MeshStandardMaterial({color: 0xa88c44, metalness: .72, roughness: .35});
  const poles = [0xc93643, 0x357bc4].map(color => new THREE.MeshStandardMaterial({color, metalness: .36, roughness: .32}));
  const receiver = new THREE.Group(); receiver.name = 'Clock magnetic receiver and minute-input coupling';
  inputRotor.add(receiver);
  const add = (geometry, material, name, parent = receiver) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; parent.add(mesh); return mesh;
  };
  const tube = (inner, outer, lo, hi, material, name) => add(new THREE.LatheGeometry([
    new THREE.Vector2(inner, lo), new THREE.Vector2(outer, lo), new THREE.Vector2(outer, hi),
    new THREE.Vector2(inner, hi), new THREE.Vector2(inner, lo)
  ], 40), material, name);
  const wheel = add(new THREE.CylinderGeometry(radius, radius, .008, 48), silver, 'Clock exterior receiver wheel');
  wheel.position.y = wheelY;
  // Two axial pole faces, directed inward across the intact backing(s).
  for (let i = 0; i < 2; i++) {
    const pole = add(new THREE.CylinderGeometry(.014, .014, .004, 24), poles[i], `Clock receiver ${i ? 'south' : 'north'} magnet`);
    // Opposite facing polarities to the shared source wheel at the same phase.
    pole.position.set(i ? -.025 : .025, wheelY + .006, 0);
  }
  const hub = add(new THREE.CylinderGeometry(.012, .012, .016, 32), brass, 'Clock receiver output hub');
  hub.position.y = wheelY - .006;
  // The existing central hour tube and fixed pin remain untouched in radius.
  // This keyed input tube passes between them; its front collar joins return-0
  // beyond the hour-tube tip, so differently rotating sleeves never intersect.
  tube(.00425, .0048, -1.25, wheelY, silver, 'Clock exterior magnetic input tube');
  tube(.008, .0108, -1.25, -1.23, silver, 'Clock minute-input sleeve extension');
  tube(.00425, .0108, -1.254, -1.246, brass, 'Clock minute-input end coupling');

  const shortened = [];
  root.traverse(node => {
    if (!node.isMesh || !node.name.startsWith('Clock_V8_baked_')) return;
    const positions = node.geometry.getAttribute('position'); let count = 0, bridgeVertices = 0;
    for (let i = 0; i < positions.count; i++) {
      // Only the owned baked fixed spindle reaches this central, inward region.
      if (Math.hypot(positions.getX(i), positions.getZ(i)) < .0041 && positions.getY(i) > -.582) {
        positions.setY(i, -.582); count++;
      }
      // The R0 bridge originally ended on the shaft axis. Seat it in the
      // existing bearing's outer wall instead, leaving its bore unobstructed.
      if (node.name === 'Clock_V8_baked_24_Clock_V7_|_satin_nickel_bridges' &&
          Math.abs(positions.getX(i)) < 1e-6 && Math.abs(Math.abs(positions.getZ(i)) - .0065) < 1e-6 &&
          positions.getY(i) >= -1.21701 && positions.getY(i) <= -1.20499) {
        positions.setX(i, -.018); bridgeVertices++;
      }
    }
    if (count) {
      positions.needsUpdate = true; node.geometry.computeBoundingBox(); node.geometry.computeBoundingSphere();
      shortened.push({name: node.name, vertices: count, rearEnd: -.582, bridgeVertices});
    }
  });
  // The previous spindle's clearance bore is no longer needed. This owned cap
  // closes it without altering either source GLB or the borrowed cube backing.
  const backing = root.getObjectByName('Clock_V8_baked_1_Spatial_|_private_navy_backing');
  if (backing) {
    const cap = add(new THREE.CylinderGeometry(.0083, .0083, .001, 40), backing.material,
      'Clock private backing sealed central opening', carrier);
    cap.position.y = -.51896;
  }
  root.updateWorldMatrix(true, true);
  // mount is exported directly beneath root. Return cube-local points, never
  // world points (the cube can turn independently of this face).
  const toCube = point => point.applyMatrix4(mount.matrix);
  const normal = new THREE.Vector3(0, 1, 0).transformDirection(mount.matrix);
  const magneticInput = {center: toCube(new THREE.Vector3(0, wheelY, 0)), normal,
    radius, receiver, halfThickness: .008, shortened,
    get phase() { return inputRotor.rotation.y; }};
  const magneticDriveTarget = {center: toCube(new THREE.Vector3(0, innerY, 0)), normal: normal.clone(),
    radius, halfThickness: .008, minimumSkinGap: .02,
    receiverSeparation: innerY - wheelY,
    get phase() { return inputRotor.rotation.y; }};
  return {magneticInput, magneticDriveTarget};
}
