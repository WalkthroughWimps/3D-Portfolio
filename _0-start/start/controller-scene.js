// The Start scene owns its renderer and the GLTF instance. A late loader
// completion can call this directly without touching a disposed page.
export function disposeControllerSceneResources(scene) {
  if (!scene) return;
  const released = new Set();
  const release = resource => {
    if (!resource || released.has(resource) || typeof resource.dispose !== 'function') return;
    released.add(resource);
    resource.dispose();
  };
  scene.traverse?.(node => {
    release(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) release(value);
      release(material);
    }
  });
}
