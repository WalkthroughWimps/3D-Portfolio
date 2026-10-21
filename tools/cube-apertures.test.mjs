import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { circularizeCubeApertures } from '../_1-about/cube-apertures.mjs';

const glbPath = fileURLToPath(new URL('../assets/about-cube/glb/model.glb', import.meta.url));

function loadCubeFixture() {
  const file = readFileSync(glbPath);
  let offset = 12, gltf, binary;
  while (offset < file.length) {
    const length = file.readUInt32LE(offset), type = file.readUInt32LE(offset + 4);
    offset += 8;
    if (type === 0x4e4f534a) gltf = JSON.parse(file.toString('utf8', offset, offset + length));
    if (type === 0x004e4942) binary = file.subarray(offset, offset + length);
    offset += length;
  }
  function attribute(accessorIndex) {
    const accessor = gltf.accessors[accessorIndex], view = gltf.bufferViews[accessor.bufferView];
    const components = accessor.type === 'VEC3' ? 3 : 1;
    const stride = view.byteStride || components * (accessor.componentType === 5123 ? 2 : 4);
    const data = new Float32Array(accessor.count * components);
    for (let i = 0; i < accessor.count; i++) for (let k = 0; k < components; k++) {
      const at = (view.byteOffset || 0) + (accessor.byteOffset || 0) + i * stride + k * (accessor.componentType === 5123 ? 2 : 4);
      data[i * components + k] = accessor.componentType === 5126 ? binary.readFloatLE(at) :
        accessor.componentType === 5123 ? binary.readUInt16LE(at) : binary.readUInt32LE(at);
    }
    return {
      count: accessor.count, data,
      getComponent(i, k) { return data[i * components + k]; },
      setComponent(i, k, value) { data[i * components + k] = value; },
      getX(i) { return data[i * components]; },
      getY(i) { return data[i * components + 1]; },
      getZ(i) { return data[i * components + 2]; },
      setXYZ(i, x, y, z) { data.set([x, y, z], i * components); },
    };
  }
  const identity = () => ({
    position: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, scale: { x: 1, y: 1, z: 1 },
  });
  const cube = { ...identity(), name: 'scene', traverse(visitor) { visitor(this); for (const child of this.children) visitor(child); } };
  cube.children = [8, 9, 10, 11, 12, 13, 14].map((index) => {
    const source = gltf.meshes[gltf.nodes[index].mesh].primitives[0];
    const attributes = Object.fromEntries(['POSITION', 'NORMAL'].map((name) => [name.toLowerCase(), attribute(source.attributes[name])]));
    return {
      ...identity(), isMesh: true, parent: cube,
      // GLTFLoader/PropertyBinding sanitizes these source names.
      name: gltf.nodes[index].name.replace(/\s/g, '_').replaceAll('.', '').replaceAll(':', '')
        .replaceAll('/', '').replaceAll('[', '').replaceAll(']', ''),
      geometry: {
        getAttribute(name) { return attributes[name]; },
        index: attribute(source.indices).data,
        computeBoundingBox() {}, computeBoundingSphere() {},
      },
    };
  });
  return cube;
}

function ringCenterlines(mesh) {
  const a = mesh.geometry.getAttribute('position');
  const centers = [];
  for (let start = 0; start < a.count; start += 16) {
    const center = [0, 0, 0];
    for (let i = start; i < start + 16; i++) for (let k = 0; k < 3; k++) center[k] += a.getComponent(i, k) / 16;
    centers.push(center);
  }
  return centers;
}

function radiiAtPlane(mesh, axis, plane, count = 90) {
  const a = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  const segments = [];
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    const hits = [];
    for (let e = 0; e < 3; e++) {
      const ia = tri[e], ib = tri[(e + 1) % 3];
      const da = a.getComponent(ia, axis) - plane, db = a.getComponent(ib, axis) - plane;
      if (Math.abs(da) < 1e-8) hits.push([a.getComponent(ia, u), a.getComponent(ia, v)]);
      if (da * db < 0) {
        const f = da / (da - db);
        hits.push([u, v].map((k) => a.getComponent(ia, k) + f * (a.getComponent(ib, k) - a.getComponent(ia, k))));
      }
    }
    if (hits.length >= 2) segments.push([hits[0], hits[1]]);
  }
  const radii = [];
  for (let i = 0; i < count; i++) {
    const theta = 2 * Math.PI * i / count, dx = Math.cos(theta), dy = Math.sin(theta);
    let best = Infinity;
    for (const [[x, y], [X, Y]] of segments) {
      const sx = X - x, sy = Y - y, denominator = dx * sy - dy * sx;
      if (Math.abs(denominator) < 1e-12) continue;
      const radius = (x * sy - y * sx) / denominator;
      const along = (x * dy - y * dx) / denominator;
      if (radius > 0 && along >= -1e-9 && along <= 1 + 1e-9 && radius < best) best = radius;
    }
    assert.ok(Number.isFinite(best));
    radii.push(best);
  }
  return radii;
}

test('loaded chassis opening and six real pipe profiles become circular without changing exterior vertices or tube thickness', () => {
  const cube = loadCubeFixture();
  const body = cube.children[0];
  const original = body.geometry.getAttribute('position').data.slice();
  const pipeBefore = cube.children.slice(1).map((mesh) => ({
    positions: mesh.geometry.getAttribute('position').data.slice(),
    centers: ringCenterlines(mesh),
  }));
  const planes = [0.94, 0.95, 0.96, 0.97, 0.971, 0.973, 0.975, 0.977, 0.979, 0.98, 0.99, 0.995];
  const beforeProfiles = [];
  for (const [axis, sign] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    for (const depth of planes) {
      const radii = radiiAtPlane(body, axis, sign * depth);
      beforeProfiles.push({ axis, sign, depth,
        before: Math.max(...radii) - Math.min(...radii),
        beforeMean: radii.reduce((sum, radius) => sum + radius, 0) / radii.length });
    }
  }
  const report = circularizeCubeApertures(cube);
  assert.ok(report.bodyVertices > 0);
  assert.equal(report.pipeVertices, 6 * 4608);
  assert.deepEqual(circularizeCubeApertures(cube), { alreadyCorrected: true });
  const positions = body.geometry.getAttribute('position').data;
  const normals = body.geometry.getAttribute('normal').data;
  const changedNormalLengths = [];
  for (let i = 0; i < positions.length; i += 3) {
    const xyz = [original[i], original[i + 1], original[i + 2]];
    if (xyz.some((component) => Math.abs(component) >= 0.98) &&
      xyz.filter((component) => Math.abs(component) >= 0.98).length >= 2) {
      assert.deepEqual(Array.from(positions.slice(i, i + 3)), xyz);
    }
    assert.ok(Number.isFinite(normals[i]) && Number.isFinite(normals[i + 1]) && Number.isFinite(normals[i + 2]));
    if (positions[i] !== original[i] || positions[i + 1] !== original[i + 1] || positions[i + 2] !== original[i + 2]) {
      changedNormalLengths.push(Math.hypot(normals[i], normals[i + 1], normals[i + 2]));
    }
  }
  for (const [index, mesh] of cube.children.slice(1).entries()) {
    const after = ringCenterlines(mesh), before = pipeBefore[index].centers;
    const a = mesh.geometry.getAttribute('position');
    const axis = [0, 1, 2].sort((x, y) =>
      Math.max(...before.map((p) => p[x])) - Math.min(...before.map((p) => p[x])) -
      (Math.max(...before.map((p) => p[y])) - Math.min(...before.map((p) => p[y]))))[0];
    const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const radii = after.map((p) => Math.hypot(p[u], p[v]));
    assert.ok(Math.max(...radii) - Math.min(...radii) < 0.0001);
    for (let section = 0; section < before.length; section++) {
      for (let side = 0; side < 16; side++) {
        const vertex = section * 16 + side;
        const oldDistance = Math.hypot(...[0, 1, 2].map((k) => pipeBefore[index].positions[vertex * 3 + k] - before[section][k]));
        const newDistance = Math.hypot(...[0, 1, 2].map((k) => a.getComponent(vertex, k) - after[section][k]));
        assert.ok(Math.abs(oldDistance - newDistance) < 0.000001);
      }
    }
  }
  const profiles = beforeProfiles.map((profile) => {
    const radii = radiiAtPlane(body, profile.axis, profile.sign * profile.depth);
    return { ...profile, after: Math.max(...radii) - Math.min(...radii),
      afterMean: radii.reduce((sum, radius) => sum + radius, 0) / radii.length };
  });
  for (const { axis, sign, depth, after } of profiles) {
    if (depth >= 0.973) assert.ok(after < 0.001, `${axis}:${sign} at ${depth} varied ${after}`);
  }
  assert.ok(report.jacobian.min > 0);
  const normalLengths = {
    min: Math.min(...changedNormalLengths),
    mean: changedNormalLengths.reduce((sum, length) => sum + length, 0) / changedNormalLengths.length,
    max: Math.max(...changedNormalLengths),
  };
  assert.ok(normalLengths.min > 0.999 && normalLengths.max < 1.001);
  if (process.env.CUBE_APERTURE_REPORT) {
    const path = process.env.CUBE_APERTURE_REPORT;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ source: glbPath, method: 'Real GLB vertex and triangle-plane/radial-ray geometry; 90 rays per plane', report,
      normalLengths, profiles }, null, 2));
  }
});
