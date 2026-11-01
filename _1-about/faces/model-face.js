/** Borrowed GLTF nodes: face modules never reparent or dispose them. The host's reversible layout owns reparenting. */
export function createModelFace({id, backingName, componentNames = []}) {
  let backing = null, components = [];
  return {
    id, backingName,
    get backing() { return backing; },
    get components() { return components; },
    attach({findNode}) {
      backing = findNode(backingName);
      if (!backing) throw new Error(`Missing ${id} backing: ${backingName}`);
      components = componentNames.map(findNode).filter(Boolean);
    },
    update() {}, suspend() {}, resume() {},
    detach() { backing = null; components = []; },
    dispose() { this.detach(); }
  };
}
