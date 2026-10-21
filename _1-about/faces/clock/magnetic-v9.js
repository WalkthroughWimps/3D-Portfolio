import * as THREE from 'three';

/** Short clock-owned receiver; retains the shared interior's cube-local contract. */
export function addSpiralMagneticInput(root, drive, manifest) {
  const mount = root.getObjectByName(manifest.mountNode);
  const receiver = new THREE.Group(); receiver.name = 'Clock V9 magnetic receiver'; drive.add(receiver);
  const metal = new THREE.MeshStandardMaterial({color: 0x91a8ba, metalness: .78, roughness: .3});
  const poles = [0xc93643, 0x357bc4].map(color => new THREE.MeshStandardMaterial({color, metalness: .35, roughness: .32}));
  const add = (geometry, material, name, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.position.set(x, y, z); receiver.add(mesh); return mesh;
  };
  const wheelY = -.557, innerY = -.355, radius = .046;
  add(new THREE.CylinderGeometry(radius, radius, .008, 40), metal, 'Clock V9 exterior receiver wheel', 0, wheelY, 0);
  for (let i = 0; i < 2; i++)
    add(new THREE.CylinderGeometry(.014, .014, .004, 24), poles[i], `Clock V9 ${i ? 'south' : 'north'} pole`, i ? -.025 : .025, wheelY + .006, 0);
  // One coupling shaft reaches only the new rear drive plane; no V8 support train.
  const driveY = manifest.driveCenterDepth;
  add(new THREE.CylinderGeometry(.0048, .0048, wheelY - driveY, 24), metal,
    'Clock V9 rear drive coupling', 0, (wheelY + driveY) / 2, 0);
  mount.updateWorldMatrix(true, true);
  const toCube = value => value.applyMatrix4(mount.matrix);
  const normal = new THREE.Vector3(0, 1, 0).transformDirection(mount.matrix);
  const magneticInput = {center: toCube(new THREE.Vector3(0, wheelY, 0)), normal, radius,
    receiver, halfThickness: .008, get phase() {return drive.rotation.y;}};
  const magneticDriveTarget = {center: toCube(new THREE.Vector3(0, innerY, 0)), normal: normal.clone(),
    radius, halfThickness: .008, minimumSkinGap: .02, receiverSeparation: innerY - wheelY,
    get phase() {return drive.rotation.y;}};
  return {magneticInput, magneticDriveTarget};
}
