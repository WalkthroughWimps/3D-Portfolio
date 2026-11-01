import * as THREE from 'three';

export const FINISHES = Object.freeze({
  brass: {color: '#c6a55d', metalness: .82, roughness: .28},
  steel: {color: '#aebbc3', metalness: .88, roughness: .32},
  copper: {color: '#b7734e', metalness: .82, roughness: .3},
  antique: {color: '#6e6249', metalness: .68, roughness: .56}
});

export function readFinishes(value) {
  try { const result = value ? JSON.parse(value) : {}; return result && typeof result === 'object' && !Array.isArray(result) ? result : {}; } catch { return {}; }
}

export function createGearAppearance(pivots, names) {
  const entries = [];
  const environment = makeSatinEnvironment();
  const roughnessGrain = makeBrushedRoughness();
  const geometryClones = [];
  const pivotSet = new Set(pivots.values());
  for (const name of names) {
    const pivot = pivots.get(name);
    pivot.traverse(node => {
      if (!node.isMesh) return;
      let parent = node.parent;
      while (parent && parent !== pivot) { if (pivotSet.has(parent)) return; parent = parent.parent; }
      const original = node.material;
      const originalGeometry = node.geometry;
      if (!node.geometry.attributes.uv) {
        const geometry = originalGeometry.clone(), positions = geometry.attributes.position, uvs = new Float32Array(positions.count * 2);
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), z = positions.getZ(i);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
        }
        const width = Math.max(1e-6, maxX - minX), height = Math.max(1e-6, maxZ - minZ);
        for (let i = 0; i < positions.count; i++) {
          uvs[i * 2] = (positions.getX(i) - minX) / width;
          uvs[i * 2 + 1] = (positions.getZ(i) - minZ) / height;
        }
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        node.geometry = geometry; geometryClones.push({node, original: originalGeometry, geometry});
      }
      const owned = Array.isArray(original) ? original.map(m => m.clone()) : original.clone();
      for (const material of [owned].flat()) {
        if (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial) continue;
        material.envMap = environment;
        material.envMapIntensity = .42;
        material.roughnessMap = roughnessGrain;
      }
      node.material = owned;
      entries.push({name, node, original, owned});
    });
  }
  return {
    apply(value, contrast = .5) {
      const settings = readFinishes(value), curve = .08 + 2.32 * contrast * contrast * (3 - 2 * contrast);
      for (const {name, owned} of entries) {
        const item = settings[name] || settings.all || {preset: 'brass'};
        const base = FINISHES[item.preset] || FINISHES.brass;
        for (const material of [owned].flat()) {
          if (!material.color) continue;
          material.color.set(item.color || base.color);
          if ('metalness' in material) material.metalness = item.metalness ?? base.metalness;
          if ('roughness' in material) material.roughness = item.roughness ?? base.roughness;
          if (material.envMap) material.envMapIntensity = .25 * curve;
          if (material.emissive && material.emissive.getHex() !== 0) material.emissiveIntensity = curve;
          material.needsUpdate = true;
        }
      }
    },
    dispose() {
      for (const {node, original, owned} of entries) {
        node.material = original;
        for (const material of [owned].flat()) material.dispose();
      }
      for (const {node, original, geometry} of geometryClones) {node.geometry = original; geometry.dispose();}
      environment.dispose();
      roughnessGrain.dispose();
      entries.length = 0;
    }
  };
}

function makeBrushedRoughness() {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = ((x * 17 + y * 11) % 9) - 4;
    const value = Math.max(232, Math.min(255, 245 + grain));
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  return texture;
}
function makeSatinEnvironment() {
  const width = 64, height = 32, data = new Uint8Array(width * height * 4);
  const highlights = [
    {x: .12, y: .28, w: .11, h: .46, power: .66},
    {x: .49, y: .18, w: .17, h: .32, power: .54},
    {x: .82, y: .34, w: .08, h: .52, power: .42}
  ];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    let light = .025;
    for (const h of highlights) {
      const du = Math.min(Math.abs(u - h.x), 1 - Math.abs(u - h.x));
      const dx = du / h.w, dy = (v - h.y) / h.h;
      light += h.power * Math.exp(-2.8 * (dx * dx + dy * dy));
    }
    const i = (y * width + x) * 4;
    data[i] = Math.min(255, light * 225); data[i + 1] = Math.min(255, light * 232);
    data[i + 2] = Math.min(255, light * 240); data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
