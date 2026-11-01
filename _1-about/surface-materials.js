import * as THREE from 'three';

// Surface detail lives in roughness and shallow bump, so theme colors and the shared highlight
// contrast curve remain the sole source of color and glow.
const FINISH = Object.freeze({
  red: 'enamel',
  blue: 'enamel',
  'V6 bearing dark metal': 'machined',
  'V6 fixed carrier metal': 'machined'
});

function hash(x, y, seed) {
  let n = Math.imul(x + seed, 374761393) + Math.imul(y - seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function textureFor(kind) {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const noise = hash(x, y, kind === 'enamel' ? 19 : 67) - .5;
    // Long fine grain in the metal; the enamel has a quiet, even micrograin.
    const line = kind === 'machined' ? hash(0, y, 37) - .5 : 0;
    const value = kind === 'enamel'
      ? .88 + noise * .09
      : .84 + line * .19 + noise * .045;
    const offset = (y * size + x) * 4;
    // Three samples red for bump height and green for roughness.
    const height = kind === 'enamel' ? .5 + noise * .68 : .5 + line * .54 + noise * .18;
    data[offset] = Math.round(255 * THREE.MathUtils.clamp(height, .12, .88));
    data[offset + 1] = Math.round(255 * THREE.MathUtils.clamp(value, .68, .98));
    data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `About ${kind} roughness pilot`;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'enamel' ? 1.5 : 2, kind === 'enamel' ? 1.5 : 2);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** Borrow the GLB, replace only UV-equipped target mesh materials, and restore them on disposal. */
export function createAboutSurfacePilot(model) {
  const textures = {enamel: textureFor('enamel'), machined: textureFor('machined')};
  const clones = new Map(), entries = [];
  let enabled = true, disposed = false;
  model.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('uv')) return;
    const original = mesh.material;
    const source = Array.isArray(original) ? original : [original];
    if (!source.some(material => FINISH[material?.name])) return;
    const replacement = source.map(material => {
      const kind = FINISH[material?.name];
      if (!kind) return material;
      if (!clones.has(material)) {
        const owned = material.clone();
        owned.roughnessMap = textures[kind];
        owned.roughness = kind === 'enamel' ? .53 : .4;
        owned.bumpMap = textures[kind];
        owned.bumpScale = kind === 'enamel' ? .05 : .025;
        owned.needsUpdate = true;
        clones.set(material, owned);
      }
      return clones.get(material);
    });
    mesh.material = Array.isArray(original) ? replacement : replacement[0];
    entries.push({mesh, original, replacement: mesh.material});
  });

  const stats = Object.freeze({
    texturedMeshes: entries.length,
    clonedMaterials: clones.size,
    textures: 2,
    textureBytesUncompressed: 2 * 256 * 256 * 4 * 4 / 3,
    addedDrawCalls: 0,
    skippedWithoutUv: (() => {
      let count = 0;
      model.traverse(mesh => {
        if (mesh.isMesh && !mesh.geometry?.getAttribute('uv') &&
          [mesh.material].flat().some(material => FINISH[material?.name])) count++;
      });
      return count;
    })()
  });

  return {
    get materials() { return [...clones.values()]; },
    get enabled() { return enabled && !disposed; },
    diagnostics() { return {...stats, enabled: enabled && !disposed, disposed}; },
    setEnabled(value) {
      if (disposed) return;
      enabled = Boolean(value);
      for (const {mesh, original, replacement} of entries) mesh.material = enabled ? replacement : original;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const {mesh, original} of entries) mesh.material = original;
      for (const material of clones.values()) material.dispose();
      for (const texture of Object.values(textures)) texture.dispose();
      entries.length = 0;
      clones.clear();
    }
  };
}
