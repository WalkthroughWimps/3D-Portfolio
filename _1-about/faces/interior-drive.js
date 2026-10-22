import * as THREE from 'three';
import {getSpeakerSurface} from './speaker-response.js';
import {createNotesProjector} from './notes-projector.js';

const TAU = Math.PI * 2;
const palettes = {cyan: [0x62dcff, 0xe4aa65], amber: [0xffbd56, 0xffefbf], violet: [0xb79aff, 0xff98c5]};

/** Cube-owned interior. All resources are ours; no source mesh or transform is changed. */
export function createInteriorDrive(faces) {
  let host = null, root = null, lattice = null, rotor = null, output = null, shaft = null;
  let armature = null, gimbalX = null, gimbalZ = null, gyroscope = null;
  let magnetMount = null, magnetRotor = null;
  let suspended = false, reduced = false, elapsed = 0, motorPhase = 0, contrastGain = 1, signature = '', options = {};
  let clockRoot = null, profile = [];
  let projector = null, faceSettings = {};
  const resources = new Set(), pulses = [];
  const clockTip = new THREE.Vector3(), spindleAxis = new THREE.Vector3(0, 1, 0), spin = new THREE.Quaternion();
  const inverseWorld = new THREE.Quaternion(), stabilization = new THREE.Quaternion(), gimbalAngles = new THREE.Euler(0, 0, 0, 'XZY');
  const own = resource => { resources.add(resource); return resource; };
  const metal = (color, metalness = .7) => own(new THREE.MeshStandardMaterial({color, metalness, roughness: .32, emissive: color, emissiveIntensity: .035}));
  function mesh(geometry, material, parent, name) {
    const node = new THREE.Mesh(own(geometry), material); node.name = name; parent.add(node); return node;
  }
  function ring(parent, radius, tube, material, name) {
    return mesh(new THREE.TorusGeometry(radius, tube, 8, 72), material, parent, name);
  }
  function rod(parent, a, b, radius, material, name) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const node = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 12), material, parent, name);
    node.position.copy(from).add(to).multiplyScalar(.5);
    node.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return node;
  }
  function energyMaterial(color, reverse = false, speaker = false) {
    const material = own(new THREE.ShaderMaterial({
      defines: speaker ? {SPEAKER_LATTICE: 1} : {},
      uniforms: {tint: {value: new THREE.Color(color)}, phase: {value: 0}, glow: {value: .65}, reverse: {value: reverse ? -1 : 1}, speakerDisplacement: {value: 0}, speakerNormal: {value: new THREE.Vector3(0, 0, 1)}},
      vertexShader: `varying vec2 flowUV;
        #ifdef SPEAKER_LATTICE
          attribute float speakerWeight; uniform float speakerDisplacement; uniform vec3 speakerNormal;
        #endif
        void main(){ flowUV=uv; vec3 p=position;
          #ifdef SPEAKER_LATTICE
            p+=speakerNormal*speakerDisplacement*speakerWeight;
          #endif
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `varying vec2 flowUV; uniform vec3 tint; uniform float phase,glow,reverse;
        void main(){ float crest=pow(.5+.5*cos(6.2831853*(flowUV.x*3.0-phase*reverse)),18.0);
          gl_FragColor=vec4(tint*(.28+glow*.55+crest*(.35+glow)),.42+glow*.25+crest*.25); }`,
      transparent: true, depthWrite: false, toneMapped: false
    }));
    pulses.push(material); return material;
  }
  function tube(parent, points, material, name, radius = .0035) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(24, points.length * 2), radius, 5, false), material, parent, name);
  }
  function group(parent, name) {
    const node = new THREE.Group(); node.name = name; parent.add(node); return node;
  }
  function pivots(parent, axis, inner, outer, material, name) {
    for (const sign of [-1, 1]) {
      const a = [0, 0, 0], b = [0, 0, 0]; a[axis] = sign * inner; b[axis] = sign * outer;
      rod(parent, a, b, .014, material, `${name} trunnion`);
      const bearing = ring(parent, .022, .006, material, `${name} bearing`);
      bearing.position.fromArray(b);
      bearing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().setComponent(axis, 1));
    }
  }
  function orientGyroscope(dt = 0, immediate = false) {
    // X -> Z -> Y are actual nested pivots. Their compensation trails the
    // cube-mounted bearings, then settles to world-up after the cube stops.
    root.getWorldQuaternion(inverseWorld).invert();
    if (immediate || reduced) stabilization.copy(inverseWorld);
    else {
      stabilization.slerp(inverseWorld, 1 - Math.exp(-Math.max(0, dt) / .32));
      if (stabilization.angleTo(inverseWorld) < 1e-5) stabilization.copy(inverseWorld);
    }
    gimbalAngles.setFromQuaternion(stabilization, 'XZY');
    gimbalX.rotation.x = gimbalAngles.x;
    gimbalZ.rotation.z = gimbalAngles.z;
    gyroscope.rotation.y = gimbalAngles.y;
  }
  function surfaceProfile() {
    const samples = [], point = new THREE.Vector3();
    host.cube.updateWorldMatrix(true, true);
    const inverse = host.cube.matrixWorld.clone().invert();
    faces.get('skills').backing?.traverse(node => {
      if (!node.isMesh) return;
      const transform = new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld);
      const position = node.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(transform);
        const r = Math.hypot(point.x, point.y);
        if (r < .88 && point.z > .45) samples.push({r, z: point.z});
      }
    });
    samples.sort((a, b) => a.r - b.r);
    profile = [];
    for (const sample of samples) {
      const previous = profile.at(-1);
      if (previous && sample.r - previous.r < .003) previous.z = Math.min(previous.z, sample.z);
      else profile.push({...sample});
    }
  }
  function bowlDepth(radius) {
    const upper = profile.findIndex(point => point.r >= radius);
    if (upper < 0) return (profile.at(-1)?.z ?? .88) - .016;
    if (!upper) return profile[0].z - .016;
    const a = profile[upper - 1], b = profile[upper], t = (radius - a.r) / (b.r - a.r);
    return THREE.MathUtils.lerp(a.z, b.z, t) - .016;
  }
  function clearLattice() {
    if (!lattice) return;
    const materials = new Set();
    lattice.traverse(node => {
      if (node.geometry) { node.geometry.dispose(); resources.delete(node.geometry); }
      if (node.material) materials.add(node.material);
    });
    for (const material of materials) {
      material.dispose(); resources.delete(material);
      const index = pulses.indexOf(material); if (index >= 0) pulses.splice(index, 1);
    }
    lattice.removeFromParent(); lattice = null;
  }
  function followSpeaker(node) {
    const surface = getSpeakerSurface(faces.get('skills').backing);
    if (!surface) return;
    surface.mesh.updateWorldMatrix(true, false); host.cube.updateWorldMatrix(true, false);
    const toSurface = surface.mesh.matrixWorld.clone().invert().multiply(host.cube.matrixWorld);
    const normal = new THREE.Vector3().setComponent(surface.axis, 1).applyMatrix3(new THREE.Matrix3().setFromMatrix4(toSurface.clone().invert()));
    const position = node.geometry.attributes.position, weights = new Float32Array(position.count), point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) weights[i] = surface.weightAt(point.fromBufferAttribute(position, i).applyMatrix4(toSurface));
    node.geometry.setAttribute('speakerWeight', new THREE.BufferAttribute(weights, 1));
    node.material.uniforms.speakerNormal.value.copy(normal);
    node.geometry.computeBoundingSphere(); node.geometry.boundingSphere.radius += .007;
    // Speakers update after the interior in the shared loop. Sampling here uses
    // the current frame's exact field, including when the backing is invisible.
    node.onBeforeRender = () => {
      node.material.uniforms.speakerDisplacement.value = surface.displacement;
      node.material.uniformsNeedUpdate = true;
    };
  }
  function rebuildLattice() {
    if (!root) return;
    const next = JSON.stringify([options.pattern, options.strands, options.turns, options.color]);
    if (next === signature) return;
    signature = next; clearLattice();
    lattice = new THREE.Group(); lattice.name = 'Skills inward spheroid energy lattice'; root.add(lattice);
    const colors = palettes[options.color] || palettes.cyan;
    const directions = options.pattern === 'ascending' ? [1] : options.pattern === 'descending' ? [-1] : [1, -1];
    for (const direction of directions) {
      const material = energyMaterial(colors[direction === 1 ? 0 : 1], direction < 0, true);
      const count = Math.round(options.strands ?? 9), turns = options.turns ?? 1.35;
      const frameRadius = Math.max(.055, (profile.at(-1)?.r ?? .88) - .005);
      for (let strand = 0; strand < count; strand++) {
        const points = [];
        for (let i = 0; i <= 96; i++) {
          const t = i / 96, radius = THREE.MathUtils.lerp(.055, frameRadius, t), angle = strand / count * TAU + direction * turns * TAU * t;
          points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, bowlDepth(radius)));
        }
        followSpeaker(tube(lattice, points, material, `${direction > 0 ? 'Ascending' : 'Descending'} spheroid strand ${strand + 1}`, .0024));
      }
    }
  }
  function detach() {
    projector?.dispose(); projector = null;
    root?.removeFromParent();
    for (const resource of resources) resource.dispose();
    resources.clear(); pulses.length = 0;
    host = root = lattice = rotor = output = shaft = clockRoot = null;
    armature = gimbalX = gimbalZ = gyroscope = null;
    magnetMount = magnetRotor = null;
    profile = []; signature = ''; elapsed = 0; motorPhase = 0;
  }
  return {
    attach(context) {
      detach(); host = context; suspended = false;
      root = new THREE.Group(); root.name = 'Cube central clockwork and power distribution'; host.cube.add(root);
      const brass = metal(0xd3a75b), steel = metal(0x69818e), dark = metal(0x172b36, .35), silver = metal(0x99b9bf);
      const cyan = own(new THREE.MeshBasicMaterial({color: 0x6fdaec, toneMapped: false}));
      armature = group(root, 'Cube-fixed power armature');
      for (const [axis, angle] of [['x', 0], ['x', Math.PI / 2], ['y', Math.PI / 2]]) {
        const rail = ring(armature, .343, .008, steel, 'Spherical outer bearing rail'); rail.rotation[axis] = angle;
      }
      // Concentric rings connect through alternating, freely turning trunnions.
      // Radial spacing keeps the rings clear at every gimbal angle.
      pivots(armature, 0, .301, .335, brass, 'Outer X');
      gimbalX = group(root, 'Gyroscope X gimbal');
      ring(gimbalX, .301, .010, silver, 'Outer gyroscope ring').rotation.x = Math.PI / 2;
      pivots(gimbalX, 2, .260, .301, brass, 'Middle Z');
      gimbalZ = group(gimbalX, 'Gyroscope Z gimbal');
      ring(gimbalZ, .260, .011, brass, 'Inner gyroscope ring').rotation.y = Math.PI / 2;
      pivots(gimbalZ, 1, .183, .260, silver, 'Upright Y spindle');
      gyroscope = group(gimbalZ, 'World-upright gyroscope');
      rod(gyroscope, [0, -.185, 0], [0, .185, 0], .014, silver, 'Vertical gyroscope spindle');
      for (const y of [-.158, .158]) {
        const cap = mesh(new THREE.SphereGeometry(.025, 16, 12), brass, gyroscope, 'Gyroscope spindle cap');
        cap.position.y = y;
      }
      rotor = group(gyroscope, 'Gyroscope flywheel');
      ring(rotor, .171, .024, brass, 'Weighted flywheel rim').rotation.x = Math.PI / 2;
      ring(rotor, .138, .005, silver, 'Flywheel inner trim').rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(.062, .062, .046, 32), dark, rotor, 'Flywheel hub');
      for (let i = 0; i < 6; i++) {
        const angle = i / 6 * TAU;
        rod(rotor, [.056 * Math.cos(angle), 0, .056 * Math.sin(angle)], [.151 * Math.cos(angle), 0, .151 * Math.sin(angle)], .009, brass, 'Flywheel spoke');
      }
      const jewel = mesh(new THREE.SphereGeometry(.038, 20, 12), cyan, gyroscope, 'Luminous drive core'); jewel.position.y = .055;
      // The clock's existing minute input is on the tilted Y spindle. This output
      // uses that same absolute motor phase; the fast wheel represents its reduction.
      output = group(armature, 'Clock minute-input drive coupling');
      const collar = ring(output, .055, .012, brass, 'Clock drive collar'); collar.rotation.x = Math.PI / 2;
      rod(output, [0, -.035, 0], [0, .035, 0], .026, dark, 'Clock spindle hub');
      shaft = rod(armature, [0, -.355, 0], [0, -.46, 0], .014, silver, 'Clock inner magnetic drive shaft');
      for (const y of [-.36, -.43]) {
        const bearing = ring(armature, .034, .009, brass, 'Clock shaft bearing'); bearing.position.y = y; bearing.rotation.x = Math.PI / 2;
      }
      magnetMount = group(armature, 'Clock magnetic generator mount'); magnetMount.position.y = -.42;
      ring(magnetMount, .061, .005, brass, 'Clock magnetic drive bearing').rotation.x = Math.PI / 2;
      magnetRotor = group(magnetMount, 'Clock spinning magnet');
      mesh(new THREE.CylinderGeometry(.046, .046, .008, 40), silver, magnetRotor, 'Clock interior magnet wheel');
      const poleMaterials = [metal(0xc93643, .4), metal(0x357bc4, .4)];
      for (let pole = 0; pole < 2; pole++) {
        const magnet = mesh(new THREE.CylinderGeometry(.014, .014, .004, 20), poleMaterials[pole], magnetRotor, pole ? 'Clock south pole' : 'Clock north pole');
        magnet.position.set(pole ? .025 : -.025, -.006, 0);
      }
      const bus = energyMaterial(0x62dcff);
      for (const [name, points] of [
        ['Skills energy feed', [[0, 0, .343], [.015, 0, .375], [.01, 0, .405], [0, 0, .43]]],
        ['About speaker signal', [[.343, 0, 0], [.375, .015, 0], [.405, .01, 0], [.43, 0, 0]]],
        ['Refs speaker signal', [[0, 0, -.343], [.015, 0, -.375], [.01, 0, -.405], [0, 0, -.43]]]
      ]) {
        const path = points.map(point => new THREE.Vector3(...point));
        tube(armature, path, dark, `${name} insulated conduit`, .012);
        tube(armature, path.map(point => point.clone().add(new THREE.Vector3(0, .013, 0))), bus, name, .0035);
        const socket = mesh(new THREE.SphereGeometry(.024, 16, 12), silver, armature, `${name} rotary socket`); socket.position.copy(path[0]);
        const union = ring(armature, .026, .005, brass, `${name} swivel union`); union.position.copy(path[0]);
        union.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), path[0].clone().normalize());
        const terminal = mesh(new THREE.SphereGeometry(.022, 16, 12), brass, armature, `${name} terminal`); terminal.position.copy(path.at(-1));
        terminal.userData.powerTerminal = true;
        const pickup = ring(armature, .033, .0035, brass, `${name} contactless pickup`); pickup.position.copy(path.at(-1)); pickup.quaternion.copy(union.quaternion);
      }
      rod(armature, [0, .343, 0], [0, .40, 0], .016, silver, 'Odd rotary power control arm');
      const oddCoupling = ring(armature, .032, .007, brass, 'Odd fixed rotary coupling'); oddCoupling.rotation.x = Math.PI/2; oddCoupling.position.y = .40;
      projector = createNotesProjector(armature, host.cube, faces.get('notes')); projector.applySettings({about:faceSettings});
      orientGyroscope(0, true); surfaceProfile(); rebuildLattice();
    },
    update(dt) {
      if (!host || suspended) return;
      orientGyroscope(dt);
      projector?.update();
      const clock = faces.get('clock')?.runtime, clockState = clock?.state;
      const paused = reduced || clockState?.paused || !clockState?.ready;
      if (!paused) {
        // The clock supplies the phase, so its pause/reduced-motion behavior also
        // holds the central drive. Wrapped input still closes every geared turn.
        const phase = clockState.motorAngle ?? clockState.angles?.[6] ?? 0;
        rotor.rotation.y = phase * 3600;
        motorPhase = phase;
      }
      if (!reduced && !faces.get('skills')?.assembly?.userReducedMotion && !clockState?.paused) elapsed += Math.min(.05, Math.max(0, dt)) * (options.speed ?? .24);
      for (const material of pulses) {
        material.uniforms.phase.value = elapsed;
        material.uniforms.glow.value = (options.glow ?? .65) * contrastGain;
      }
      const input = clock?.magneticDriveTarget;
      if (clock?.root && input && clock.root !== clockRoot) {
        clockRoot = clock.root;
        clockTip.copy(input.center);
        const start = new THREE.Vector3(0, -.355, 0), delta = clockTip.clone().sub(start);
        shaft.position.copy(start).add(clockTip).multiplyScalar(.5);
        shaft.scale.y = delta.length() / .105;
        shaft.quaternion.setFromUnitVectors(spindleAxis, delta.normalize());
        magnetMount.position.copy(clockTip);
        magnetMount.quaternion.setFromUnitVectors(spindleAxis, input.normal.clone().normalize());
      }
      output.position.set(0, -.355, 0);
      output.quaternion.copy(shaft.quaternion).multiply(spin.setFromAxisAngle(spindleAxis, motorPhase));
      const magneticPhase = clock?.magneticInput?.phase;
      if (!paused) magnetRotor.rotation.y = magneticPhase ?? motorPhase * 3600;
      magnetMount.visible = shaft.visible = output.visible = faceSettings.clock?.enabled !== false;
      // Keep the field present through cube turns. The opaque backing occludes it
      // from outside; its paths stay inset from the measured skin on the inside.
      if (lattice) lattice.visible = faceSettings.skills?.enabled !== false && options.enabled !== false;
    },
    applySettings(snapshot) {
      faceSettings = snapshot.about || {}; projector?.applySettings(snapshot);
      options = snapshot.about?.spheroid || {}; reduced = Boolean(snapshot.accessibility?.reducedMotion);
      const contrast = THREE.MathUtils.clamp(snapshot.start?.contrast ?? .5, 0, 1);
      contrastGain = .08 + (2.4 - .08) * contrast * contrast * (3 - 2 * contrast);
      rebuildLattice();
    },
    suspend() { suspended = true; }, resume() { suspended = false; },
    detach, dispose: detach,
    get root() { return root; }, get lattice() { return lattice; }
  };
}
