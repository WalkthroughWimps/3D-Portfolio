import * as THREE from 'three';
import {handAngles} from './winding.js';

const names = ['hour', 'minute'];
const faceMaterial = color => new THREE.MeshStandardMaterial({color, metalness: .58, roughness: .32, side: THREE.DoubleSide});

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
export function createClockHands(root, carrier, adapter = null) {
  const mount = root.getObjectByName(adapter?.mountNode || 'clock-fixed-mount') || root;
  const radius = adapter?.grooveRadius ?? .819, frontY = adapter?.frontY ?? -1.253;
  const handY = adapter?.handY ?? -1.271;
  mount.updateWorldMatrix(true, true); carrier.updateWorldMatrix(true, true);
  const ringY = depth => carrier.worldToLocal(mount.localToWorld(new THREE.Vector3(0, depth, 0))).y;
  const pivot = {}, meshes = {}, owned = new Set();
  for (const [i, name] of names.entries()) {
    const group = new THREE.Group(); group.name = `Clock ${name} hand pivot`;
    group.position.y = handY - i * .004;
    mount.add(group); pivot[name] = group;
    const mesh = new THREE.Mesh(profile('baton', .3, .02), faceMaterial('#ffffff'));
    mesh.name = `Clock ${name} hand`; group.add(mesh); meshes[name] = mesh;
    owned.add(mesh.geometry); owned.add(mesh.material);
  }
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
      const start = name === 'minute' ? settings.hourLength + .012 : -.045;
      const signature = `${style}:${length}:${girth}:${start}`;
      if (mesh.userData.signature !== signature) {
        owned.delete(mesh.geometry); mesh.geometry.dispose();
        mesh.geometry = profile(style, length, girth, start); owned.add(mesh.geometry);
        mesh.userData.signature = signature;
      }
      mesh.material.color.set(settings[`${name}Color`]);
      pivot[name].visible = settings[`${name}Visible`];
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
    pivot.hour.rotation.y = preview?.kind === 'hour' ? preview.angle : angles.hour;
    pivot.minute.rotation.y = preview?.kind === 'minute' ? preview.angle : angles.minute;
    marker.rotation.y = preview?.kind === 'second' ? preview.angle : markerPhase;
  }
  return {groove, hit, marker, pivot, meshes, radius, configure, update,
    getTargets(kind) {return kind === 'second' ? [hit, markerMesh] : [meshes[kind]];},
    dispose() {
      if (oldPointer) oldPointer.visible = originalPointerVisible;
      for (const name of names) pivot[name].removeFromParent();
      groove.removeFromParent(); lips.forEach(lip => lip.removeFromParent()); hit.removeFromParent(); marker.removeFromParent();
      owned.forEach(resource => resource.dispose()); owned.clear();
    }};
}
