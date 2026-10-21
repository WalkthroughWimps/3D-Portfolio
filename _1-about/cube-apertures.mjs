// A load-time correction for the six authored cube openings. The source GLB is
// intentionally left intact; the cube host owns these loaded geometries.
const PIPE_NAME = /^Trench_Pipe_[XYZ][+-]_Export$/;
const SECTION_SIDES = 16;
const correctedScenes = new WeakSet();

function smoothstep(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function otherAxes(axis) {
  return axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
}

function angleOf(u, v) {
  const angle = Math.atan2(v, u);
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

function findMeshes(root) {
  const pipes = [];
  let body = null;
  root.traverse((node) => {
    if (!node.isMesh) return;
    const name = node.name.replace(/\s/g, '_').replace(/[\[\].:/]/g, '');
    if (name === 'cubemain_Export') body = node;
    else if (PIPE_NAME.test(name)) pipes.push(node);
  });
  if (!body || pipes.length !== 6) throw new Error('Expected cube.main and six trench pipes');
  return { body, pipes };
}

function requireCubeLocal(mesh) {
  // The current source model places all seven meshes directly under an
  // untransformed assembly root. Fail visibly if that asset contract changes.
  for (let node = mesh; node; node = node.parent) {
    const p = node.position, q = node.quaternion, s = node.scale;
    if (Math.abs(p.x) + Math.abs(p.y) + Math.abs(p.z) > 1e-6 ||
      Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) + Math.abs(q.w - 1) > 1e-6 ||
      Math.abs(s.x - 1) + Math.abs(s.y - 1) + Math.abs(s.z - 1) > 1e-6) {
      throw new Error(`Non-identity cube aperture transform at ${node.name}`);
    }
  }
}

function pipeProfile(mesh) {
  const position = mesh.geometry.getAttribute('position');
  if (!position || position.count % SECTION_SIDES !== 0) {
    throw new Error(`Unexpected trench pipe section topology: ${mesh.name}`);
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const sections = [];
  for (let start = 0; start < position.count; start += SECTION_SIDES) {
    const center = [0, 0, 0];
    for (let i = start; i < start + SECTION_SIDES; i++) {
      for (let k = 0; k < 3; k++) center[k] += position.getComponent(i, k) / SECTION_SIDES;
    }
    sections.push({ start, center });
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], center[k]);
      max[k] = Math.max(max[k], center[k]);
    }
  }
  const axis = [0, 1, 2].sort((a, b) => (max[a] - min[a]) - (max[b] - min[b]))[0];
  const [u, v] = otherAxes(axis);
  if (max[axis] - min[axis] > 0.001 || max[u] - min[u] < 1.7 || max[v] - min[v] < 1.7) {
    throw new Error(`Unexpected trench pipe orientation: ${mesh.name}`);
  }
  const sign = sections[0].center[axis] < 0 ? -1 : 1;
  const samples = sections.map(({ start, center }) => ({
    start,
    center,
    angle: angleOf(center[u], center[v]),
    radius: Math.hypot(center[u], center[v]),
  })).sort((a, b) => a.angle - b.angle);
  if (samples.length < 64) throw new Error(`Trench pipe has too few sections: ${mesh.name}`);
  // Angular integration preserves the average centerline radius even if the
  // authored sections are spaced uniformly in arc length instead of angle.
  let integral = 0;
  for (let i = 0; i < samples.length; i++) {
    const next = samples[(i + 1) % samples.length];
    const span = (next.angle - samples[i].angle + Math.PI * 2) % (Math.PI * 2);
    integral += span * (samples[i].radius + next.radius) / 2;
  }
  return { mesh, position, axis, sign, u, v, sections, samples, mean: integral / (Math.PI * 2) };
}

function radialShift(profile, angle) {
  const samples = profile.samples;
  let lo = 0, hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].angle < angle) lo = mid + 1;
    else hi = mid;
  }
  const right = lo % samples.length;
  const left = (right + samples.length - 1) % samples.length;
  let a = samples[left].angle, b = samples[right].angle, t = angle;
  if (right === 0) { b += Math.PI * 2; if (t < a) t += Math.PI * 2; }
  const radius = samples[left].radius + (samples[right].radius - samples[left].radius) * (t - a) / (b - a);
  return profile.mean - radius;
}

function bodyDisplacement(point, profiles) {
  let axis = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(point[k]) > Math.abs(point[axis])) axis = k;
  const sign = point[axis] < 0 ? -1 : 1;
  const profile = profiles.get(`${axis}:${sign}`);
  const [u, v] = otherAxes(axis);
  const radius = Math.hypot(point[u], point[v]);
  const edge = Math.max(Math.abs(point[u]), Math.abs(point[v]));
  if (!profile || radius < 0.8 || radius >= 1 || edge >= 0.98 || Math.abs(point[axis]) < 0.93) return point;
  const weight = smoothstep(0.80, 0.87, radius) *
    (1 - smoothstep(0.96, 1, radius)) *
    (1 - smoothstep(0.95, 0.98, edge)) *
    smoothstep(0.93, 0.97, Math.abs(point[axis]));
  if (weight === 0) return point;
  const shift = radialShift(profile, angleOf(point[u], point[v])) * weight / radius;
  const moved = [...point];
  moved[u] += point[u] * shift;
  moved[v] += point[v] * shift;
  return moved;
}

function correctedNormal(point, normal, profiles) {
  const h = 0.0001;
  const columns = [];
  for (let k = 0; k < 3; k++) {
    const plus = [...point], minus = [...point];
    plus[k] += h; minus[k] -= h;
    const a = bodyDisplacement(plus, profiles), b = bodyDisplacement(minus, profiles);
    columns.push(a.map((value, i) => (value - b[i]) / (2 * h)));
  }
  // J^-T n = (cofactor(J) n) / det(J). The positive determinant is shared
  // by this small deformation and disappears when the vector is normalized.
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const c0 = cross(columns[1], columns[2]);
  const c1 = cross(columns[2], columns[0]);
  const c2 = cross(columns[0], columns[1]);
  const determinant = columns[0][0] * c0[0] + columns[0][1] * c0[1] + columns[0][2] * c0[2];
  const transformed = [0, 1, 2].map((i) => c0[i] * normal[0] + c1[i] * normal[1] + c2[i] * normal[2]);
  const length = Math.hypot(...transformed);
  if (!Number.isFinite(length) || length < 1e-5 || determinant <= 1e-5) {
    throw new Error(`Invalid corrected cube normal at ${point} from ${normal}: ${length}; determinant ${determinant}`);
  }
  return { vector: transformed.map((value) => value / length), determinant };
}

/** Correct loaded chassis openings and trench pipes once, before face modules attach. */
export function circularizeCubeApertures(cube) {
  if (correctedScenes.has(cube)) return { alreadyCorrected: true };
  const { body, pipes } = findMeshes(cube);
  for (const mesh of [body, ...pipes]) requireCubeLocal(mesh);
  const pipeProfiles = pipes.map(pipeProfile);
  const profiles = new Map(pipeProfiles.map((profile) => [`${profile.axis}:${profile.sign}`, profile]));
  if (profiles.size !== 6) throw new Error('Expected one trench profile on each cube face');
  const geometry = body.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal || position.count !== normal.count) throw new Error('Cube chassis needs paired positions and normals');
  let bodyVertices = 0;
  let minimumJacobian = Infinity;
  let maximumJacobian = -Infinity;
  let jacobianSum = 0;
  for (let i = 0; i < position.count; i++) {
    const point = [position.getX(i), position.getY(i), position.getZ(i)];
    const moved = bodyDisplacement(point, profiles);
    if (moved === point) continue;
    const oldNormal = [normal.getX(i), normal.getY(i), normal.getZ(i)];
    const { vector: newNormal, determinant } = correctedNormal(point, oldNormal, profiles);
    minimumJacobian = Math.min(minimumJacobian, determinant);
    maximumJacobian = Math.max(maximumJacobian, determinant);
    jacobianSum += determinant;
    position.setXYZ(i, ...moved);
    normal.setXYZ(i, ...newNormal);
    bodyVertices++;
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  let pipeVertices = 0;
  for (const profile of pipeProfiles) {
    const pipeNormal = profile.mesh.geometry.getAttribute('normal');
    if (!pipeNormal || pipeNormal.count !== profile.position.count) throw new Error('Trench pipe needs paired normals');
    for (let section = 0; section < profile.samples.length; section++) {
      const { start, center, angle } = profile.samples[section];
      const shift = radialShift(profile, angle);
      const du = shift * center[profile.u] / Math.hypot(center[profile.u], center[profile.v]);
      const dv = shift * center[profile.v] / Math.hypot(center[profile.u], center[profile.v]);
      const previous = profile.samples[(section + profile.samples.length - 1) % profile.samples.length].center;
      const next = profile.samples[(section + 1) % profile.samples.length].center;
      const tu = next[profile.u] - previous[profile.u];
      const tv = next[profile.v] - previous[profile.v];
      const turn = angleOf(-Math.sin(angle), Math.cos(angle)) - angleOf(tu, tv);
      const c = Math.cos(turn), s = Math.sin(turn);
      for (let i = start; i < start + SECTION_SIDES; i++) {
        const ou = profile.position.getComponent(i, profile.u) - center[profile.u];
        const ov = profile.position.getComponent(i, profile.v) - center[profile.v];
        profile.position.setComponent(i, profile.u, center[profile.u] + du + c * ou - s * ov);
        profile.position.setComponent(i, profile.v, center[profile.v] + dv + s * ou + c * ov);
        const nu = pipeNormal.getComponent(i, profile.u), nv = pipeNormal.getComponent(i, profile.v);
        pipeNormal.setComponent(i, profile.u, c * nu - s * nv);
        pipeNormal.setComponent(i, profile.v, s * nu + c * nv);
        pipeVertices++;
      }
    }
    profile.position.needsUpdate = true;
    pipeNormal.needsUpdate = true;
    profile.mesh.geometry.computeBoundingBox();
    profile.mesh.geometry.computeBoundingSphere();
  }
  correctedScenes.add(cube);
  return {
    bodyVertices, pipeVertices, meanPipeRadius: pipeProfiles.map(({ mean }) => mean),
    jacobian: { min: minimumJacobian, mean: jacobianSum / bodyVertices, max: maximumJacobian },
  };
}
