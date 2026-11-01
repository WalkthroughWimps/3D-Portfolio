import * as THREE from 'three';

const turns = Object.freeze({
  about: [0, 0, 0], skills: [0, -Math.PI / 2, 0],
  notes: [0, 0, -Math.PI / 2], odd: [Math.PI / 2, 0, 0],
  clock: [0, 0, 0], refs: [0, 0, 0]
});

const backingFaces = new Map([
  ['back.about Export', 'about'], ['back.skills Export', 'skills'],
  ['back.art Export', 'notes'], ['back.odd Export', 'odd'],
  ['back.clock Export', 'clock'], ['back.refs Export', 'refs']
]);
const skillsParts = new Set([
  'V16 Concealed Stationary Bearing Stator GLB',
  'V16 Eight Fixed Mounting Spokes GLB',
  'V16 Recessed Cube Mounting Ring GLB',
  'V2 frame inner lip Export',
  'V7 Deploy Carriage GLB',
  'V9 Eight Fixed Backing Saddles GLB'
]);

function sourceName(node, gltf) {
  const index = gltf.parser.associations.get(node)?.nodes;
  return index === undefined ? node.name : gltf.parser.json.nodes[index]?.name || node.name;
}

function ownerOf(name) {
  if (backingFaces.has(name)) return backingFaces.get(name);
  if (skillsParts.has(name) || /^V7 Cube Support 0[1-8] Fixed Cube Anchor Aim GLB$/.test(name)) return 'skills';
  if (name === 'cube.main Export' || /Bevel Highlight/.test(name) || /Trench Pipe/.test(name)) return 'chassis';
  return null;
}

/** Reversible, host-owned partition of authored GLTF branches. */
export function createFaceLayout(physicalCube, gltf) {
  const root = physicalCube.getObjectByName('V7 Review Assembly Root GLB') ||
    physicalCube.children.find(node => node.children.length === 29);
  if (!root) throw new Error('About layout: assembly root not found');
  const original = [...root.children];
  const names = original.map(node => sourceName(node, gltf));
  const owners = names.map(ownerOf);
  const counts = Object.fromEntries([...Object.keys(turns), 'chassis'].map(id => [id, owners.filter(owner => owner === id).length]));
  if (original.length !== 29 || owners.some(owner => !owner) ||
      counts.chassis !== 9 || counts.skills !== 15 ||
      ['about', 'notes', 'odd', 'clock', 'refs'].some(id => counts[id] !== 1))
    throw new Error(`About layout: unrecognized GLTF partition (${names.map((name, i) => `${name}: ${owners[i] || '?'}`).join('; ')})`);
  const snapshots = original.map(node => ({node, position: node.position.clone(), quaternion: node.quaternion.clone(),
    scale: node.scale.clone(), matrix: node.matrix.clone(), matrixAutoUpdate: node.matrixAutoUpdate}));
  const spaces = new Map();
  for (const [id, angles] of Object.entries(turns)) {
    const group = new THREE.Group(); group.name = `About ${id} authored space`;
    group.rotation.set(...angles); root.add(group); spaces.set(id, group);
  }
  original.forEach((node, index) => { if (owners[index] !== 'chassis') spaces.get(owners[index]).add(node); });
  let restored = false;
  const convertVector = (id, values) => new THREE.Vector3(...values).applyQuaternion(spaces.get(id).quaternion).toArray();
  return {
    physicalCube, spaces,
    space(id) { return spaces.get(id); },
    toPhysicalPoint(id, values) { return convertVector(id, values); },
    toPhysicalDirection(id, values) { return convertVector(id, values); },
    toPhysicalMount(id, mount) {
      if (!mount) return mount;
      const converted = {...mount};
      for (const key of ['center', 'normal', 'right', 'up']) if (Array.isArray(mount[key]))
        converted[key] = convertVector(id, mount[key]);
      return converted;
    },
    restore() {
      if (restored) return;
      restored = true;
      for (const {node, position, quaternion, scale, matrix, matrixAutoUpdate} of snapshots) {
        root.add(node);
        node.position.copy(position); node.quaternion.copy(quaternion); node.scale.copy(scale);
        node.matrix.copy(matrix); node.matrixAutoUpdate = matrixAutoUpdate;
      }
      for (const group of spaces.values()) group.removeFromParent();
    }
  };
}
