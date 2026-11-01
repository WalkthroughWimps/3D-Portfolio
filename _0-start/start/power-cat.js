import * as THREE from 'three';
import { repairRearPort } from './rear-port.js';
import { contrastHighlightIntensity } from './controller-accents.js';
import { createCatGhost } from './cat-ghost.js';

const smooth = t => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

// Owns the added rocker, cat/port presentation materials, and temporary power
// mask. Saved scene settings are never changed by the blackout.
export function createPowerCat({ model, scene, animations, allowAnimation, onChange, onBlackout }) {
    const plate = model.getObjectByName('switch-plate');
    const cat = model.getObjectByName('switch-cat');
    const hand = model.getObjectByName('ManekinekoH');
    if(!plate || !cat || !hand) return null;
    const restorePort = repairRearPort(model);
    const resources = new Set();
    const originals = [];
    const oldCat = { parent: cat.parent, position: cat.position.clone(), quaternion: cat.quaternion.clone(), scale: cat.scale.clone(), visible: cat.visible };
    const oldHand = { position: hand.position.clone(), quaternion: hand.quaternion.clone() };
    const oldSwitches = ['switch-on', 'switch-off001'].map(name => model.getObjectByName(name)).filter(Boolean);
    const switchVisibility = oldSwitches.map(node => node.visible);
    oldSwitches.forEach(node => { node.visible = false; });
    const own = value => { resources.add(value); return value; };
    const rocker = new THREE.Group();
    rocker.name = 'start-power-rocker';
    // The pivot and curved body sit inside the case (+Z). Only the shallow
    // press faces cross the mounting plane; a depressed face is parallel to it.
    const rockerCenterZ = .035;
    rocker.position.z = rockerCenterZ;
    plate.add(rocker);
    const shellMaterial = own(new THREE.MeshStandardMaterial({ color: 0xf4f2ed, metalness: 0, roughness: .38 }));
    const blueMaterial = own(new THREE.MeshStandardMaterial({ color: 0x2588e5, emissive: 0x238cff, metalness: .08, roughness: .38 }));
    blueMaterial.userData.controllerOwned = true;
    // Keep the partial cylinder as a mechanical backing, entirely behind the
    // panel. It must never become an exposed wheel on the outside of the case.
    const radius = .065, width = .132;
    const start = THREE.MathUtils.degToRad(330);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(radius * Math.cos(start), radius * Math.sin(start));
    shape.absarc(0, 0, radius, start, start + THREE.MathUtils.degToRad(240), false);
    shape.lineTo(0, 0);
    shape.closePath();
    const backingGeometry = own(new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 48 }));
    backingGeometry.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -width / 2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    const backing = new THREE.Mesh(backingGeometry, shellMaterial);
    backing.name = 'start-power-partial-cylinder';
    backing.position.z = .055;
    rocker.add(backing);
    const tilt = THREE.MathUtils.degToRad(6);
    const faceZ = -.039;
    // One closed shell avoids two overlapping bevels along the central fold.
    const profile = new THREE.Shape();
    const endZ = faceZ - .138 * Math.tan(tilt);
    profile.moveTo(-.138, endZ); profile.lineTo(0, faceZ);
    profile.lineTo(.138, endZ); profile.lineTo(.138, faceZ + .008);
    profile.lineTo(-.138, faceZ + .008); profile.closePath();
    const frontGeometry = own(new THREE.ExtrudeGeometry(profile, { depth: width,
        bevelEnabled: true, bevelSize: .001, bevelThickness: .001, bevelSegments: 3, curveSegments: 8 }));
    frontGeometry.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -width / 2, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
    const front = new THREE.Mesh(frontGeometry, shellMaterial);
    front.name = 'start-power-white-shell'; rocker.add(front);
    const pressFaces = [];
    const markFace = (symbol, upper) => {
        const slope = upper ? -tilt : tilt;
        const half = new THREE.Group();
        half.name = `start-power-${symbol.toLowerCase()}-face`;
        half.position.z = faceZ;
        half.rotation.x = slope;
        const center = upper ? .069 : -.069;
        // Real raised blue geometry replaces the flat white texture decals.
        const indicator = symbol === 'O'
            ? new THREE.Mesh(own(new THREE.TorusGeometry(.027, .004, 12, 48)), blueMaterial)
            : new THREE.Mesh(own(new THREE.CapsuleGeometry(.004, .049, 6, 14)), blueMaterial);
        indicator.position.set(0, center, -.0035);
        half.add(indicator);
        rocker.add(half);
        pressFaces.push(half);
    };
    markFace('O', true);
    markFace('I', false);
    const target = new THREE.Object3D();
    target.name = 'start-power-contact-target';
    target.position.set(0, -.065 * Math.cos(tilt), faceZ - .065 * Math.sin(tilt) - .0075);
    rocker.add(target);
    const onAngle = -tilt, offAngle = tilt;
    rocker.rotation.x = onAngle;

    const catMaterials = [];
    cat.traverse(mesh => {
        if(!mesh.isMesh) return;
        const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        originals.push({ mesh, material: mesh.material });
        const materials = source.map(material => {
            // A prelit cat has no light spill onto the powered-off controller.
            const clone = own(new THREE.MeshBasicMaterial({ map: material.map, color: material.color?.clone() || 0xffffff,
                side: material.side, transparent: true, opacity: 0, toneMapped: false }));
            clone.userData.powerCat = true;
            catMaterials.push(clone);
            return clone;
        });
        mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });
    plate.attach(cat);
    cat.position.set(0, 0, 0);
    // The asset's face points toward local +Z. The review camera is at -Z,
    // so native yaw shows its back and faces the cat toward the rocker.
    cat.quaternion.identity();
    const track = animations.flatMap(clip => clip.tracks).find(track => /manekinekoh\.quaternion/i.test(track.name));
    const duration = track ? track.times[track.times.length - 1] : 1.20833;
    const contactTime = .625;
    const restPitch = 2 * Math.atan2(oldHand.quaternion.x, oldHand.quaternion.w);
    let endPitch = .6;
    if(track) for(let i = 0; i < track.values.length; i += 4) endPitch = Math.max(endPitch, 2 * Math.atan2(track.values[i], track.values[i + 3]));
    const setHandPitch = pitch => hand.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
    hand.geometry.computeBoundingBox();
    const positions = hand.geometry.getAttribute('position');
    const tip = new THREE.Vector3();
    for(let i = 0; i < positions.count; i++) {
        if(positions.getY(i) > tip.y) tip.fromBufferAttribute(positions, i);
    }
    const paw = new THREE.Object3D();
    paw.name = 'start-cat-paw-contact'; paw.position.copy(tip); hand.add(paw);
    const p = new THREE.Vector3(), goal = new THREE.Vector3();
    const plateTarget = angle => {
        rocker.rotation.x = angle;
        model.updateMatrixWorld(true);
        return plate.worldToLocal(target.getWorldPosition(new THREE.Vector3()));
    };
    const onTarget = plateTarget(onAngle);
    let floorY = Infinity;
    const feet = model.getObjectByName('feet');
    feet?.traverse(mesh => {
        if(!mesh.isMesh) return;
        const vertices = mesh.geometry.attributes.position;
        for(let i = 0; i < vertices.count; i++) {
            p.fromBufferAttribute(vertices, i); mesh.localToWorld(p); plate.worldToLocal(p);
            floorY = Math.min(floorY, p.y);
        }
    });
    if(!Number.isFinite(floorY)) floorY = onTarget.y - .5;
    cat.geometry.computeBoundingBox();
    const baseY = cat.geometry.boundingBox.min.y;
    const contactTip = tip.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), endPitch).add(oldHand.position);
    // Size from the shared table plane to the lower ON face, then translate
    // horizontally into place. The torso remains upright and grounded.
    cat.scale.setScalar((onTarget.y - floorY) / (contactTip.y - baseY));
    cat.position.copy(onTarget).sub(contactTip.multiplyScalar(cat.scale.x));
    cat.position.y = floorY - baseY * cat.scale.y;
    rocker.rotation.x = offAngle;
    model.updateMatrixWorld(true);
    cat.worldToLocal(target.getWorldPosition(goal)).sub(oldHand.position);
    const contactPitch = Math.max(restPitch, Math.min(endPitch, Math.atan2(goal.z, goal.y) - Math.atan2(tip.z, tip.y)));
    rocker.rotation.x = onAngle;
    setHandPitch(restPitch);
    cat.visible = false;
    const ghost = createCatGhost({ cat, parent: plate, materials: catMaterials, baseY,
        height: cat.geometry.boundingBox.max.y - baseY, own });
    let powered = true, busy = false, startedAt = 0, animated = true, phase = 'on';
    const lightMask = [], materialMask = [];
    let disposed = false;
    function publish() { onChange?.({ powered, busy, phase }); }
    function fade(amount) {
        cat.visible = amount > 0;
        catMaterials.forEach(material => { material.opacity = amount * .84; material.depthWrite = false; });
    }
    function restore() {
        powered = true; busy = false; phase = 'on';
        rocker.rotation.x = onAngle;
        ghost.reset();
        setHandPitch(restPitch); fade(0); publish();
    }
    function activate(now = performance.now()) {
        if(disposed) return;
        if(busy || !powered) { restore(); return; }
        onBlackout?.();
        powered = false; busy = true; phase = 'off'; startedAt = now;
        animated = allowAnimation();
        publish();
    }
    function update(now = performance.now()) {
        if(!busy || disposed) return;
        const t = Math.max(0, (now - startedAt) / 1000);
        if(!animated) {
            ghost.reset();
            rocker.rotation.x = offAngle;
            setHandPitch(contactPitch); fade(t < .35 ? 1 : 0);
            if(t >= .35) restore();
            return;
        }
        const fadeStart = .15, reachStart = .65, contact = reachStart + contactTime, pressEnd = contact + .16;
        const holdEnd = pressEnd + .18;
        const releaseEnd = holdEnd + Math.min(.28, duration - contactTime);
        const dissolveDuration = .45, end = releaseEnd + dissolveDuration;
        ghost.update(t, { arrival: reachStart, departure: releaseEnd, end });
        if(t < fadeStart) rocker.rotation.x = THREE.MathUtils.lerp(onAngle, offAngle, smooth(t / fadeStart));
        else if(t < contact) rocker.rotation.x = offAngle;
        else rocker.rotation.x = THREE.MathUtils.lerp(offAngle, onAngle, smooth((t - contact) / .16));
        if(t < contact) setHandPitch(THREE.MathUtils.lerp(restPitch, contactPitch, smooth((t - reachStart) / contactTime)));
        else if(t < holdEnd) {
            // A one-axis joint follows the closest point on its natural arc;
            // never slide the shoulder to fake contact with the surface.
            model.updateMatrixWorld(true);
            cat.worldToLocal(target.getWorldPosition(goal)).sub(oldHand.position);
            const pitch = Math.atan2(goal.z, goal.y) - Math.atan2(tip.z, tip.y);
            setHandPitch(Math.max(contactPitch, Math.min(endPitch, pitch)));
        } else setHandPitch(THREE.MathUtils.lerp(endPitch, restPitch, smooth((t - holdEnd) / (releaseEnd - holdEnd))));
        fade(t < releaseEnd ? smooth((t - fadeStart) / (reachStart - fadeStart))
            : 1 - .3 * smooth((t - releaseEnd) / dissolveDuration));
        const nextPhase = t < reachStart ? 'appearing' : t < contact ? 'reaching' : t < pressEnd ? 'pressing'
            : t < releaseEnd ? 'disappearing' : 'dissolving';
        const nextPower = t >= pressEnd;
        if(nextPower !== powered || phase !== nextPhase) { powered = nextPower; phase = nextPhase; publish(); }
        if(t >= end) restore();
    }
    function beforeRender() {
        if(powered) return;
        const seen = new Set();
        scene.traverse(node => {
            if(node.isLight) { lightMask.push([node, node.intensity]); node.intensity = 0; }
            if(!node.isMesh) return;
            for(const material of Array.isArray(node.material) ? node.material : [node.material]) {
                if(!material || material.userData?.powerCat || seen.has(material)) continue;
                seen.add(material);
                const record = { material, emissive: material.emissiveIntensity, environment: material.envMapIntensity };
                if(material.color) { record.color = material.color.clone(); material.color.set(0); }
                if('emissiveIntensity' in material) material.emissiveIntensity = 0;
                if('envMapIntensity' in material) material.envMapIntensity = 0;
                materialMask.push(record);
            }
        });
    }
    function afterRender() {
        for(const [light, intensity] of lightMask) light.intensity = intensity;
        lightMask.length = 0;
        for(const record of materialMask) {
            const { material } = record;
            if(record.color) material.color.copy(record.color);
            if(record.emissive !== undefined) material.emissiveIntensity = record.emissive;
            if(record.environment !== undefined) material.envMapIntensity = record.environment;
        }
        materialMask.length = 0;
    }
    function owns(node) { for(let current = node; current && current !== model; current = current.parent) if(current === plate) return true; return false; }
    function inspect() {
        model.updateMatrixWorld(true);
        let backingFrontZ = Infinity;
        const vertex = new THREE.Vector3();
        const positions = backingGeometry.getAttribute('position');
        for(let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i); backing.localToWorld(vertex); plate.worldToLocal(vertex);
            backingFrontZ = Math.min(backingFrontZ, vertex.z);
        }
        return { powered, busy, phase, paw: paw.getWorldPosition(new THREE.Vector3()).toArray(), target: target.getWorldPosition(new THREE.Vector3()).toArray(),
            contactError: paw.getWorldPosition(p).distanceTo(target.getWorldPosition(goal)), backingVertices: positions.count,
            backingFrontZ, shoulderDisplacement: hand.position.distanceTo(oldHand.position), bodyPitch: cat.rotation.x,
            catScale: cat.scale.x, floorY, catBaseY: cat.position.y + baseY * cat.scale.y,
            ghost: ghost.inspect(),
            faceAngles: pressFaces.map(face => face.rotation.x + rocker.rotation.x) };
    }
    function frame(camera, controls) {
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(plate);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const distance = Math.max(size.y, size.x / Math.max(.5, camera.aspect)) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.5;
        const forward = new THREE.Vector3(0, 0, -1).transformDirection(plate.matrixWorld);
        const right = new THREE.Vector3(1, 0, 0).transformDirection(plate.matrixWorld);
        camera.up.set(0, 1, 0).transformDirection(plate.matrixWorld);
        camera.position.copy(center).addScaledVector(forward, distance).addScaledVector(right, distance * .16);
        const damping = controls.enableDamping;
        controls.enableDamping = false;
        controls.minDistance = Math.min(controls.minDistance, distance * .5);
        controls.maxDistance = Math.max(controls.maxDistance, distance * 3);
        controls.target.copy(center); controls.update();
        controls.enableDamping = damping;
    }
    function dispose() {
        if(disposed) return;
        afterRender(); restore(); disposed = true;
        ghost.dispose();
        paw.removeFromParent(); rocker.removeFromParent();
        oldCat.parent.add(cat); cat.position.copy(oldCat.position); cat.quaternion.copy(oldCat.quaternion); cat.scale.copy(oldCat.scale); cat.visible = oldCat.visible;
        hand.position.copy(oldHand.position); hand.quaternion.copy(oldHand.quaternion);
        originals.forEach(({ mesh, material }) => { mesh.material = material; });
        oldSwitches.forEach((node, i) => { node.visible = switchVisibility[i]; });
        restorePort();
        resources.forEach(resource => resource.dispose());
    }
    publish();
    function setContrast(value) { blueMaterial.emissiveIntensity = contrastHighlightIntensity(value); }
    return { activate, update, beforeRender, afterRender, owns, inspect, frame, dispose, restore, setContrast,
        get powered() { return powered; }, get busy() { return busy; } };
}
