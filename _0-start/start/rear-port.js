import * as THREE from 'three';

// Remove baked cabinet copies of the port and stabilize its plastic finish.
// Preserve the connector's authored metal rim and blue socket detail.
export function repairRearPort(model) {
    let port;
    model.traverse(node => { if(/VGA.*Port.*Female/i.test(node.name)) port = node; });
    if(!port) return () => {};
    const restored = [];
    const geometries = [];
    model.updateMatrixWorld(true);
    // The combined cabinet also contains baked copies of the connector's
    // triangles, assigned wood/foot-glow finishes. Match full triangles, rather
    // than removing a rectangular patch that could damage the rear panel.
    const epsilon = .00001;
    const buckets = new Map();
    const key = p => `${Math.floor(p.x / epsilon)},${Math.floor(p.y / epsilon)},${Math.floor(p.z / epsilon)}`;
    const readTriangles = (mesh, visit) => {
        const position = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const count = index ? index.count : position.count;
        for(let i = 0; i < count; i += 3) {
            const indices = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j);
            const points = indices.map(j => port.worldToLocal(mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(position, j))));
            visit(points, indices);
        }
    };
    const center = points => points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3);
    const portMeshes = new Set();
    port.traverse(mesh => {
        if(!mesh.isMesh) return;
        portMeshes.add(mesh);
        readTriangles(mesh, points => {
            const hash = key(center(points));
            if(!buckets.has(hash)) buckets.set(hash, []);
            buckets.get(hash).push(points);
        });
    });
    const bounds = new THREE.Box3().setFromObject(port);
    model.traverse(mesh => {
        if(!mesh.isMesh || portMeshes.has(mesh) || !bounds.intersectsBox(new THREE.Box3().setFromObject(mesh))) return;
        const kept = [];
        let removed = 0;
        readTriangles(mesh, (points, indices) => {
            const c = center(points), cell = [c.x, c.y, c.z].map(v => Math.floor(v / epsilon));
            let duplicate = false;
            for(let x = -1; x <= 1 && !duplicate; x++) for(let y = -1; y <= 1 && !duplicate; y++) for(let z = -1; z <= 1 && !duplicate; z++) {
                const candidates = buckets.get(`${cell[0] + x},${cell[1] + y},${cell[2] + z}`) || [];
                duplicate = candidates.some(candidate => points.every(p => candidate.some(q => p.distanceToSquared(q) < epsilon * epsilon)));
            }
            if(duplicate) removed++; else kept.push(...indices);
        });
        if(!removed) return;
        geometries.push({ mesh, geometry: mesh.geometry });
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.setIndex(kept);
        mesh.geometry.computeBoundingBox(); mesh.geometry.computeBoundingSphere();
        mesh.geometry.userData.rearPortDuplicateTriangles = removed;
    });
    for(const mesh of port.children) {
        if(!mesh.isMesh || mesh.name !== 'Plane023_1' || !/Black plastic/i.test(mesh.material?.name)) continue;
        restored.push({ mesh, material: mesh.material });
        mesh.material = mesh.material.clone();
        mesh.material.metalnessMap = null;
        mesh.material.roughnessMap = null;
        mesh.material.metalness = 0;
        mesh.material.roughness = .62;
    }
    // The imported screw wells are open tubes extending through the cabinet.
    // Close their deep ends so rear wood/underlighting cannot clip into them.
    const caps = [];
    const capGeometry = new THREE.CircleGeometry(.021, 32);
    const capMaterial = new THREE.MeshStandardMaterial({ color: 0x141a22, metalness: 0, roughness: .9 });
    for(const x of [-.1844, .1844]) {
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.name = 'start-port-screw-well-end';
        cap.position.set(x, .09084, .02);
        cap.rotation.y = Math.PI;
        port.add(cap); caps.push(cap);
    }
    let disposed = false;
    return () => {
        if(disposed) return;
        disposed = true;
        for(const { mesh, material } of restored) {
            mesh.material.dispose();
            mesh.material = material;
        }
        caps.forEach(cap => cap.removeFromParent());
        capGeometry.dispose(); capMaterial.dispose();
        for(const { mesh, geometry } of geometries) { mesh.geometry.dispose(); mesh.geometry = geometry; }
    };
}

