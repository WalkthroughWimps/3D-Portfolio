// This is the Start page's established highlight mapping, shared by the
// original highlights and the runtime rocker/knob/port presentation.
export function contrastHighlightIntensity(value) {
    const t = Math.max(0, Math.min(1, value));
    return .08 + 2.32 * t * t * (3 - 2 * t);
}

export function createControllerAccents(model) {
    const records = [];
    model.traverse(mesh => {
        if(!mesh.isMesh) return;
        let knob = false, port = false;
        for(let node = mesh; node && node !== model; node = node.parent) {
            knob ||= /^knob-(vol|sync)$/.test(node.name);
            port ||= /VGA.*Port.*Female/i.test(node.name);
        }
        if(!knob && !port) return;
        const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const materials = source.map(material => {
            const bluePort = port && /^(Blue plastic|slider-glow)$/i.test(material.name);
            const knobGlow = knob && /^(meter-glow|meter-knob-side|meter-knob-rim)$/i.test(material.name);
            if(!bluePort && !knobGlow) return material;
            const clone = material.clone();
            clone.userData = { ...clone.userData, controllerOwned: true, startAccent: true };
            if(!clone.emissive) { clone.dispose(); return material; }
            if(bluePort && clone.emissive.getHex() === 0) clone.emissive.set(0x238cff);
            return clone;
        });
        if(materials.every((material, i) => material === source[i])) return;
        records.push({ mesh, material: mesh.material, owned: materials.filter((material, i) => material !== source[i]) });
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
    function update(contrast) {
        const intensity = contrastHighlightIntensity(contrast);
        for(const { owned } of records) for(const material of owned) material.emissiveIntensity = intensity;
    }
    let disposed = false;
    function dispose() {
        if(disposed) return;
        disposed = true;
        for(const record of records) {
            record.mesh.material = record.material;
            record.owned.forEach(material => material.dispose());
        }
    }
    return { update, dispose };
}
