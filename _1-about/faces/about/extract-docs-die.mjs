import fs from 'node:fs/promises';

// Extract the existing portrait die without loading the 40 MB Docs assembly.
const file = await fs.readFile(new URL('../../../assets/glb/about-cube.glb', import.meta.url));
const length = file.readUInt32LE(12), original = JSON.parse(file.subarray(20, 20 + length));
const binary = file.subarray(28 + length);
const node = original.nodes.find(item => item.name === 'cube-face');
if (!node || original.extensionsRequired?.some(name => name !== 'KHR_texture_transform')) throw new Error('Review the Docs die source before extraction');
const result = {asset: {version: '2.0', generator: 'About Face: existing Docs portrait die'}, scene: 0,
  scenes: [{nodes: [0]}], nodes: [{name: 'Docs About portrait die', mesh: 0}], meshes: [],
  materials: [], accessors: [], bufferViews: [], textures: [], images: [], samplers: [], buffers: [{byteLength: 0}]};
result.extensionsUsed = original.extensionsUsed;
result.extensionsRequired = original.extensionsRequired;
const maps = new Map(), chunks = [];
let offset = 0;
function copy(kind, index) {
  const key = `${kind}:${index}`;
  if (maps.has(key)) return maps.get(key);
  const next = structuredClone(original[kind][index]), id = result[kind].length;
  maps.set(key, id); result[kind].push(next);
  if (kind === 'bufferViews') {
    const start = next.byteOffset || 0, bytes = binary.subarray(start, start + next.byteLength);
    next.buffer = 0; next.byteOffset = offset; chunks.push(bytes); offset += bytes.length;
    const pad = (4 - offset % 4) % 4; chunks.push(Buffer.alloc(pad)); offset += pad;
  } else if (kind === 'accessors') {
    if (next.sparse) throw new Error('Sparse accessor needs explicit extraction support');
    next.bufferView = copy('bufferViews', next.bufferView);
  } else if (kind === 'textures') {
    next.source = copy('images', next.source);
    if (next.sampler !== undefined) next.sampler = copy('samplers', next.sampler);
  } else if (kind === 'images') next.bufferView = copy('bufferViews', next.bufferView);
  else if (kind === 'materials') {
    const visit = object => { for (const [name, value] of Object.entries(object)) if (value && typeof value === 'object') {
      if (/Texture$/.test(name) && Number.isInteger(value.index)) value.index = copy('textures', value.index);
      else visit(value);
    } };
    visit(next);
  }
  return id;
}
const mesh = structuredClone(original.meshes[node.mesh]);
for (const primitive of mesh.primitives) {
  primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([name, index]) => [name, copy('accessors', index)]));
  if (primitive.indices !== undefined) primitive.indices = copy('accessors', primitive.indices);
  if (primitive.material !== undefined) primitive.material = copy('materials', primitive.material);
}
result.meshes.push(mesh); result.buffers[0].byteLength = offset;
const json = Buffer.from(JSON.stringify(result)), padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + padded.length + offset, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(offset); binHeader.writeUInt32LE(0x004e4942, 4);
await fs.writeFile(new URL('../../../assets/about-cube/glb/Old .glb/_1-about/faces/about/docs-die.glb', import.meta.url), Buffer.concat([header, padded, binHeader, ...chunks]));
console.log(`Docs die extracted: ${28 + padded.length + offset} bytes; original source unchanged.`);
