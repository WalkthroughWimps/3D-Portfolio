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
  const pivotSet = new Set(pivots.values());
  for (const name of names) {
    const pivot = pivots.get(name);
    pivot.traverse(node => {
      if (!node.isMesh) return;
      let parent = node.parent;
      while (parent && parent !== pivot) { if (pivotSet.has(parent)) return; parent = parent.parent; }
      const original = node.material;
      const owned = Array.isArray(original) ? original.map(m => m.clone()) : original.clone();
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
      entries.length = 0;
    }
  };
}
