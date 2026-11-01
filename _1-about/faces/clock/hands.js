import * as THREE from 'three';
import {handAngles} from './winding.js';

const names = ['hour', 'minute'];
const faceMaterial = color => new THREE.MeshStandardMaterial({color, metalness: .58, roughness: .32, side: THREE.DoubleSide});

function addDialAndAxles(mount, handY, hourPivot, minutePivot, owned) {
  const dark = faceMaterial('#d8c7a0'), steel = faceMaterial('#c7d7df');
  owned.add(dark); owned.add(steel);
  const extras = new THREE.Group(); extras.name = 'Clock fixed reference ticks'; mount.add(extras);
  const ticks = [];
  for (const [length, labels] of [[.075, [['twelve', 0]]], [.045, [['three', Math.PI / 2], ['six', Math.PI], ['nine', -Math.PI / 2]]]]) {
    const geometry = new THREE.BoxGeometry(.014, .004, length), instances = new THREE.InstancedMesh(geometry, dark, labels.length);
    instances.name = `Clock ${labels.length === 1 ? 'twelve' : 'three six nine'} reference ticks`;
    const pose = new THREE.Object3D();
    labels.forEach(([label, angle], i) => {
      pose.position.set(Math.sin(angle) * .78, handY - .01, Math.cos(angle) * .78); pose.rotation.set(0, angle, 0);
      pose.updateMatrix(); instances.setMatrixAt(i, pose.matrix); ticks.push(label);
    });
    instances.instanceMatrix.needsUpdate = true; extras.add(instances); owned.add(geometry);
  }
  // The closed lathe contour gives the sleeve real inner and outer walls plus annular ends.
  const sleeveGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(.007, -.004), new THREE.Vector2(.016, -.004),
    new THREE.Vector2(.016, .034), new THREE.Vector2(.0085, .034),
    new THREE.Vector2(.0085, .100), new THREE.Vector2(.0065, .100),
    new THREE.Vector2(.0065, -.004), new THREE.Vector2(.007, -.004)
  ], 20);
  const sleeve = new THREE.Mesh(sleeveGeometry, dark);
  sleeve.name = 'Clock hollow hour axle sleeve';
  hourPivot.add(sleeve); owned.add(sleeve.geometry);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.018, .004, 8, 24), dark);
  ring.name = 'Clock rounded hollow hour hand root'; ring.rotation.x = Math.PI / 2;
  ring.position.y = -.004; hourPivot.add(ring); owned.add(ring.geometry);
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, .12, 12), steel);
  spindle.name = 'Clock minute inner spindle';
  spindle.position.y = .054; minutePivot.add(spindle); owned.add(spindle.geometry);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.005, 10, 8), steel);
  tip.name = 'Clock rounded minute axle end'; tip.scale.y = .5; tip.position.y = -.004;
  minutePivot.add(tip); owned.add(tip.geometry);
  return {group: extras, ticks, sleeve, spindle, ring};
}

function glassStripGeometry(length, girth, overlap = 0) {
  const start = -overlap, end = length + overlap;
  const shape = new THREE.Shape(), half = Math.max(.003, girth * .43), radius = Math.min(half, (end - start) / 5);
  shape.moveTo(-half + radius, start); shape.lineTo(half - radius, start);
  shape.quadraticCurveTo(half, start, half, start + radius); shape.lineTo(half, end - radius);
  shape.quadraticCurveTo(half, end, half - radius, end); shape.lineTo(-half + radius, end);
  shape.quadraticCurveTo(-half, end, -half, end - radius); shape.lineTo(-half, start + radius);
  shape.quadraticCurveTo(-half, start, -half + radius, start);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: .002, bevelEnabled: true, bevelSegments: 1, bevelSize: .001, bevelThickness: .001, steps: 1});
  geometry.rotateX(Math.PI / 2); return geometry;
}

function addGlassMinuteStem(group, length, girth, owned) {
  const material = new THREE.MeshPhysicalMaterial({color: '#d8f4ff', roughness: .16, metalness: 0, clearcoat: .14, clearcoatRoughness: .28, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide});
  owned.add(material);
  const stem = new THREE.Mesh(glassStripGeometry(length, girth), material);
  stem.name = 'Clock glass minute inner stem';
  stem.userData.stemLength = length;
  group.add(stem); owned.add(stem.geometry);
}

export function addSpiralRails(root, manifest, owned = new Set()) {
  const nodes = manifest.nodes;
  const minuteAnchor = [.95, -1.003, 0], secondsAnchor = [.299, -1.003, .902];
  const radialPoints = (angle, values) => values.map(([radius, y]) => [radius * Math.cos(angle), y, radius * Math.sin(angle)]);
  const paths = [
    ['minute', ['clock-minute-1', 'clock-minute-2', 'clock-minute-3', 'clock-minute-4', 'clock-minute-5', 'clock-minute-6', 'clock-minute-7', 'clock-minute-8', 'clock-minute-9'],
      radialPoints(0, [[.95, -1.003], [.89, -.94], [.87, -.915], [.82, -.891], [.74, -.821], [.70, -.795]]), []],
    ['seconds', ['clock-minute-6', 'clock-second-1', 'clock-second-2', 'clock-second-3', 'clock-second-4', 'clock-second-5', 'clock-second-6'], [],
      radialPoints(Math.atan2(nodes['clock-second-6'].center[2], nodes['clock-second-6'].center[0]), [[.82, nodes['clock-second-6'].center[1] + .035], [.87, -.915], [.89, -.94], [.95, -1.003]])]
  ];
  const material = faceMaterial('#77838c'); owned.add(material);
  const rails = [];
  const axleIds = new Set();
  for (const [name, ids, leadIn, leadOut] of paths) {
    const points = [
      ...leadIn.map(point => new THREE.Vector3(...point)),
      ...ids.map(id => {
      const p = nodes[id].center;
      if (id === 'clock-minute-9') {
        const toward = nodes['clock-minute-8'].center;
        const dx = toward[0] - p[0], dz = toward[2] - p[2], length = Math.hypot(dx, dz) || 1;
        return new THREE.Vector3(p[0] + dx / length * .012, p[1] + .037, p[2] + dz / length * .012);
      }
      return new THREE.Vector3(p[0], p[1] + .037, p[2]);
      }),
      ...leadOut.map(point => new THREE.Vector3(...point))
    ];
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(32, ids.length * 10), .003, 5, false), material);
    rail.name = `Clock ${name} curved spiral rail`;
    rail.userData.stickySurfaceId = `clock.${name}-spiral-rail`;
    root.add(rail); owned.add(rail.geometry); rails.push(rail);
    ids.forEach(id => axleIds.add(id));
  }
  axleIds.add('clock-drive');
  const centerDepth = -.8537;
  const central = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(.009, -.0665), new THREE.Vector2(.011, -.0665), new THREE.Vector2(.011, .0665),
    new THREE.Vector2(.009, .0665), new THREE.Vector2(.009, -.0665)
  ], 20), material);
  central.name = 'Clock hollow central bearing bridge'; central.position.y = centerDepth; root.add(central); owned.add(central.geometry);
  central.userData.stickySurfaceId = 'clock.central-bearing';
  axleIds.delete('clock-minute-9'); axleIds.delete('clock-drive');
  const ids = [...axleIds], axleGeometry = new THREE.CylinderGeometry(.0105, .0105, .0525, 12);
  const axles = new THREE.InstancedMesh(axleGeometry, material, ids.length), transform = new THREE.Object3D();
  axles.name = 'Clock fixed axle posts'; axles.userData.gearIds = ids;
  axles.userData.stickySurfaceId = 'clock.gear-axle-posts';
  ids.forEach((id, i) => {
    const center = nodes[id].center;
    transform.position.set(center[0], center[1] + .01075, center[2]);
    transform.updateMatrix(); axles.setMatrixAt(i, transform.matrix);
  });
  axles.instanceMatrix.needsUpdate = true;
  // Posts bridge the rear gear faces to their static curved rails.
  root.add(axles); owned.add(axleGeometry);
  const feet = new THREE.Group(); feet.name = 'Clock stationary chassis rim feet';
  const footGeometry = new THREE.CylinderGeometry(.014, .014, .006, 16), footMaterial = faceMaterial('#77838c');
  owned.add(footGeometry); owned.add(footMaterial);
  for (const [i, point] of [minuteAnchor, secondsAnchor].entries()) {
    const foot = new THREE.Mesh(footGeometry, footMaterial); foot.name = `Clock fixed rim foot ${i + 1}`;
    foot.userData.stickySurfaceId = `clock.fixed-rim-foot-${i + 1}`;
    foot.position.set(point[0], point[1], point[2]); feet.add(foot);
  }
  const pinGeometry = new THREE.CylinderGeometry(.0022, .0022, 1, 8), pinMaterial = faceMaterial('#77838c');
  const pins = new THREE.InstancedMesh(pinGeometry, pinMaterial, 2); pins.name = 'Clock axial sliding rim pins'; pins.userData.stickySurfaceId = 'clock.axial-sliding-rim-pins';
  owned.add(pinGeometry); owned.add(pinMaterial); root.add(pins);
  return {rails, feet, pins, anchors: [minuteAnchor, secondsAnchor], stationaryDepth: -1.003};
}

/** Positive Z is the hand's radial tip. A minute start above zero leaves true open space. */
function profile(style, length, girth, start = -.045) {
  const shape = new THREE.Shape(), half = girth / 2;
  const patterns = {
    baton: [[-1,0],[-1,1],[1,1],[1,0]],
    tapered: [[-1,0],[-.85,.64],[0,1],[.85,.64],[1,0]],
    skeleton: [[-1,0],[-1,1],[1,1],[1,0]],
    'slim-arrow': [[-.52,0],[-.52,.73],[-1.8,.73],[0,1],[1.8,.73],[.52,.73],[.52,0]],
    chevron: [[-.55,0],[-.55,.68],[-1.7,.68],[-.62,1],[0,.83],[.62,1],[1.7,.68],[.55,.68],[.55,0]],
    'art-deco': [[-.7,0],[-.7,.22],[-1,.22],[-1,.55],[-1.4,.55],[0,1],[1.4,.55],[1,.55],[1,.22],[.7,.22],[.7,0]],
    spade: [[-.48,0],[-.48,.58],[-1.55,.77],[-1.18,.94],[0,1],[1.18,.94],[1.55,.77],[.48,.58],[.48,0]],
    breguet: [[-.52,0],[-.52,.62],[-1.45,.76],[-1.42,.87],[0,1],[1.42,.87],[1.45,.76],[.52,.62],[.52,0]],
    rocket: [[-.58,0],[-.58,.68],[-1.55,.9],[-1,1],[-.3,.87],[0,.79],[.3,.87],[1,1],[1.55,.9],[.58,.68],[.58,0]]
  };
  const points = patterns[style] || patterns.baton;
  const toPoint = ([x,t]) => [x * half, start + (length - start) * t];
  points.forEach((point, i) => {const [x,y] = toPoint(point); if (i) shape.lineTo(x,y); else shape.moveTo(x,y);});
  shape.closePath();
  if ((style === 'skeleton' || style === 'breguet') && length - start > .14) {
    const hole = new THREE.Path();
    if (style === 'breguet') {
      const radius = Math.min(girth * .36, (length - start) * .045);
      hole.absellipse(0, start + (length - start) * .81, radius, radius, 0, Math.PI * 2, true);
    } else {
      const inset = Math.min(girth * .22, .01), lo = start + (length - start) * .24, hi = start + (length - start) * .78;
      hole.moveTo(-half + inset, lo); hole.lineTo(half - inset, lo);
      hole.lineTo(half - inset, hi); hole.lineTo(-half + inset, hi); hole.closePath();
    }
    shape.holes.push(hole);
  }
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Owned hands and shallow groove; accepts measured V9 adapter or V8 legacy positions. */
export function createClockHands(root, carrier, adapter = null, manifest = null, authoredSpace = root.parent, camera = null) {
  const mount = root.getObjectByName(adapter?.mountNode || 'clock-fixed-mount') || root;
  const radius = adapter?.grooveRadius ?? .819, frontY = adapter?.frontY ?? -1.253;
  const handY = adapter?.handY ?? -1.271;
  mount.updateWorldMatrix(true, true); carrier.updateWorldMatrix(true, true);
  const ringY = depth => carrier.worldToLocal(mount.localToWorld(new THREE.Vector3(0, depth, 0))).y;
  const pivot = {}, meshes = {}, owned = new Set();
  let orientationOffset = 0, lastFullOffset = null;
  const worldUp = new THREE.Vector3(), faceNormal = new THREE.Vector3(), viewDirection = new THREE.Vector3();
  const mountPosition = new THREE.Vector3(), worldQuaternion = new THREE.Quaternion(), inverseQuaternion = new THREE.Quaternion();
  const cameraQuaternion = new THREE.Quaternion(), localUp = new THREE.Vector3();
  let supportFrame = null, supportComponents = null;
  if (adapter && manifest?.nodes) {
    supportFrame = new THREE.Group(); supportFrame.name = 'Clock static spiral support frame'; root.add(supportFrame);
    supportComponents = addSpiralRails(supportFrame, manifest, owned);
    authoredSpace?.add(supportComponents.feet);
  }
  for (const [i, name] of names.entries()) {
    const group = new THREE.Group(); group.name = `Clock ${name} hand pivot`;
    group.position.y = handY - i * .012;
    mount.add(group); pivot[name] = group;
    const mesh = new THREE.Mesh(profile('baton', .3, .02, name === 'hour' ? .014 : -.045), faceMaterial('#ffffff'));
    mesh.name = `Clock ${name} hand`; group.add(mesh); meshes[name] = mesh;
    owned.add(mesh.geometry); owned.add(mesh.material);
  }
  const extras = adapter ? addDialAndAxles(mount, handY, pivot.hour, pivot.minute, owned) : null;
  if (adapter) addGlassMinuteStem(pivot.minute, .23, .02, owned);
  const grooveMaterial = faceMaterial('#24232a'); owned.add(grooveMaterial);
  const groove = new THREE.Mesh(new THREE.TorusGeometry(radius, .012, 6, 128), grooveMaterial);
  groove.name = 'Clock seconds groove'; groove.rotation.x = Math.PI / 2;
  groove.position.y = ringY(frontY); carrier.add(groove); owned.add(groove.geometry);
  const lipMaterial = faceMaterial('#a98b55'); owned.add(lipMaterial);
  const lips = [radius - .017, radius + .017].map((r, i) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, .0035, 5, 128), lipMaterial);
    mesh.name = `Clock groove lip ${i + 1}`; mesh.rotation.x = Math.PI / 2;
    mesh.position.y = ringY(frontY - .004); carrier.add(mesh); owned.add(mesh.geometry); return mesh;
  });
  const hit = new THREE.Mesh(new THREE.TorusGeometry(radius, .029, 4, 128), new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}));
  hit.name = 'Clock seconds groove hit area'; hit.rotation.x = Math.PI / 2; hit.position.y = ringY(frontY - .005);
  carrier.add(hit); owned.add(hit.geometry); owned.add(hit.material);
  const marker = new THREE.Group(); marker.name = 'Clock seconds marker pivot'; marker.position.y = ringY(handY - .008); carrier.add(marker);
  const markerMesh = new THREE.Mesh(profile('baton', .30, .018), faceMaterial('#e27d66'));
  markerMesh.position.z = radius; markerMesh.rotation.y = Math.PI;
  markerMesh.name = 'Clock plain seconds baton'; marker.add(markerMesh);
  owned.add(markerMesh.geometry); owned.add(markerMesh.material);
  let oldPointer = null;
  if (!adapter) root.traverse(node => {if (/Clock[_ ]V8[_ ]baked[_ ]36[_ ]Spatial/i.test(node.name)) oldPointer = node;});
  const originalPointerVisible = oldPointer?.visible;
  if (oldPointer) oldPointer.visible = false;
  function configure(settings) {
    if (!settings) return;
    for (const name of names) {
      const mesh = meshes[name], style = settings[`${name}Style`];
      const length = settings[`${name}Length`], girth = settings[`${name}Girth`];
      const start = name === 'minute' ? settings.hourLength + .012 : .014;
      const signature = `${style}:${length}:${girth}:${start}`;
      if (mesh.userData.signature !== signature) {
        owned.delete(mesh.geometry); mesh.geometry.dispose();
        mesh.geometry = profile(style, length, girth, start); owned.add(mesh.geometry);
        mesh.userData.signature = signature;
      }
      mesh.material.color.set(settings[`${name}Color`]);
      pivot[name].visible = settings[`${name}Visible`];
    }
    const stemLength = Math.max(.02, settings.hourLength + .012), stemGirth = settings.minuteGirth;
    const stem = pivot.minute.getObjectByName('Clock glass minute inner stem');
    const stemSignature = `${stemLength}:${stemGirth}`;
    if (stem && stem.userData.stemSignature !== stemSignature) {
      owned.delete(stem.geometry); stem.geometry.dispose();
      stem.geometry = glassStripGeometry(stemLength, stemGirth, stemGirth * .28); owned.add(stem.geometry);
      stem.userData.stemLength = stemLength; stem.userData.stemSignature = stemSignature;
    }
    const secondSignature = `${settings.secondStyle}:${settings.secondLength}:${settings.secondGirth}`;
    if (markerMesh.userData.signature !== secondSignature) {
      owned.delete(markerMesh.geometry); markerMesh.geometry.dispose();
      markerMesh.geometry = profile(settings.secondStyle, settings.secondLength, settings.secondGirth);
      owned.add(markerMesh.geometry); markerMesh.userData.signature = secondSignature;
    }
    markerMesh.material.color.set(settings.secondColor);
    marker.visible = settings.secondVisible;
    groove.visible = hit.visible = settings.showGroove;
    lips.forEach(lip => {lip.visible = settings.showGroove;});
    lipMaterial.color.set(settings.grooveColor);
  }
  function update(date, markerPhase, preview = null) {
    const angles = handAngles(date);
    if (camera) {
      mount.updateWorldMatrix(true, false);
      mount.getWorldQuaternion(worldQuaternion);
      faceNormal.set(0, -1, 0).applyQuaternion(worldQuaternion).normalize();
      mount.getWorldPosition(mountPosition);
      camera.getWorldPosition(viewDirection).sub(mountPosition).normalize();
      const facing = faceNormal.dot(viewDirection);
      if (facing > .3) {
        camera.getWorldQuaternion(cameraQuaternion);
        worldUp.set(0, 1, 0).applyQuaternion(cameraQuaternion);
        worldUp.addScaledVector(faceNormal, -worldUp.dot(faceNormal));
        if (worldUp.lengthSq() > 1e-8) {
          inverseQuaternion.copy(worldQuaternion).invert();
          localUp.copy(worldUp).normalize().applyQuaternion(inverseQuaternion);
          let fullOffset = Math.atan2(localUp.x, localUp.z);
          if (lastFullOffset !== null)
            fullOffset = lastFullOffset + Math.atan2(Math.sin(fullOffset - lastFullOffset), Math.cos(fullOffset - lastFullOffset));
          lastFullOffset = fullOffset;
          const blend = THREE.MathUtils.smoothstep(facing, .3, .9);
          orientationOffset = fullOffset * blend;
        } else { orientationOffset = 0; lastFullOffset = null; }
      } else { orientationOffset = 0; lastFullOffset = null; }
    }
    if (extras) extras.group.rotation.y = orientationOffset;
    pivot.hour.rotation.y = (preview?.kind === 'hour' ? preview.angle : angles.hour) + orientationOffset;
    pivot.minute.rotation.y = (preview?.kind === 'minute' ? preview.angle : angles.minute) + orientationOffset;
    marker.rotation.y = (preview?.kind === 'second' ? preview.angle : markerPhase) + orientationOffset;
  }
  function updateSupportLinks() {
    if (!supportComponents || !authoredSpace) return;
    root.updateWorldMatrix(true, true); authoredSpace.updateWorldMatrix(true, true);
    const axis = new THREE.Vector3(0, 1, 0), pose = new THREE.Object3D();
    supportComponents.anchors.forEach((anchor, i) => {
      const start = new THREE.Vector3(...anchor), end = root.worldToLocal(authoredSpace.localToWorld(start.clone()));
      const delta = end.sub(start), distance = delta.length();
      pose.position.copy(start).addScaledVector(delta, .5);
      pose.quaternion.setFromUnitVectors(axis, distance > 1e-6 ? delta.normalize() : axis);
      pose.scale.set(1, distance, 1); pose.updateMatrix(); supportComponents.pins.setMatrixAt(i, pose.matrix);
    });
    supportComponents.pins.instanceMatrix.needsUpdate = true;
  }
  function setVisible(visible) {
    if (supportComponents) {supportComponents.feet.visible = visible; supportComponents.pins.visible = visible;}
  }
  return {groove, hit, marker, pivot, meshes, radius, extras, configure, update, updateSupportLinks, setVisible,
    get screenUprightOffset() {return orientationOffset;},
    get components() {return supportComponents ? [supportComponents.feet] : [];},
    getTargets(kind) {return kind === 'second' ? [hit, markerMesh] : [meshes[kind]];},
    dispose() {
      if (oldPointer) oldPointer.visible = originalPointerVisible;
      supportFrame?.removeFromParent();
      extras?.group.removeFromParent();
      supportComponents?.feet.removeFromParent();
      for (const name of names) pivot[name].removeFromParent();
      groove.removeFromParent(); lips.forEach(lip => lip.removeFromParent()); hit.removeFromParent(); marker.removeFromParent();
      owned.forEach(resource => resource.dispose()); owned.clear();
    }};
}
