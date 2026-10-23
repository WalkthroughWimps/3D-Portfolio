import * as THREE from 'three';
import {THICKNESS, ringBounds} from './band-shape.mjs';


function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  return texture;
}

function discUvs(geometry, radius) {
  const positions = geometry.getAttribute('position'), uvs = geometry.getAttribute('uv');
  for (let i = 0; i < positions.count; i++) {
    uvs.setXY(i, positions.getX(i) / (2 * radius) + .5, positions.getY(i) / (2 * radius) + .5);
  }
  uvs.needsUpdate = true;
  return geometry;
}

function faceMaterial(map, side) {
  const material = new THREE.MeshBasicMaterial({map, side});
  material.userData.transform = new THREE.Vector4(1, 0, 0, 1);
  material.userData.motionBlur = new THREE.Vector4();
  material.onBeforeCompile = shader => {
    shader.uniforms.uFaceTransform = {value: material.userData.transform};
    material.userData.uniform = shader.uniforms.uFaceTransform;
    shader.uniforms.uMotionBlur = {value: material.userData.motionBlur};
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nuniform vec4 uFaceTransform;\nuniform vec4 uMotionBlur;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
      `#ifdef USE_MAP
        vec2 p = vMapUv - vec2(.5);
        vec2 adjusted = vec2(uFaceTransform.x * p.x + uFaceTransform.y * p.y,
          uFaceTransform.z * p.x + uFaceTransform.w * p.y) + vec2(.5);
        vec4 ink = texture2D(map, adjusted);
        if (abs(uMotionBlur.x) + abs(uMotionBlur.y) > 0.00001) {
          vec2 hinge = normalize(uMotionBlur.zw);
          vec2 across = vec2(-hinge.y, hinge.x);
          vec2 sweep = vec2(-p.y, p.x) * uMotionBlur.x
            + across * dot(p, across) * uMotionBlur.y * 0.45;
          vec2 mappedSweep = vec2(uFaceTransform.x * sweep.x + uFaceTransform.y * sweep.y,
            uFaceTransform.z * sweep.x + uFaceTransform.w * sweep.y);
          ink = texture2D(map, adjusted - mappedSweep) * 0.12
            + texture2D(map, adjusted - mappedSweep * 0.5) * 0.23
            + ink * 0.30
            + texture2D(map, adjusted + mappedSweep * 0.5) * 0.23
            + texture2D(map, adjusted + mappedSweep) * 0.12;
        }
        diffuseColor *= ink;
      #endif`);
  };
  material.customProgramCacheKey = () => 'about-orbital-face-blur-v2';
  return material;
}

function sideGeometry(inner, outer) {
  const vertices = [], indices = [], segments = 128;
  for (const radius of [inner, outer]) {
    for (let j = 0; j <= segments; j++) {
      const a = j / segments * Math.PI * 2;
      vertices.push(radius * Math.cos(a), radius * Math.sin(a), -THICKNESS / 2,
        radius * Math.cos(a), radius * Math.sin(a), THICKNESS / 2);
    }
    const base = (vertices.length / 3) - 2 * (segments + 1);
    for (let j = 0; j < segments; j++) {
      const k = base + 2 * j;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createSiliconeBands(frontCanvases, rearCanvas, shape) {
  const frontTextures = frontCanvases.map(canvasTexture), rearTexture = canvasTexture(rearCanvas);
  const group = new THREE.Group(); group.name = 'About rigid picture rings';
  const carrier = new THREE.Group(); carrier.name = 'Upright About display'; group.add(carrier);
  const rotor = new THREE.Group(); rotor.name = 'Centered ring carrier'; carrier.add(rotor);
  const rings = [], geometries = [], materials = [];
  const wallMaterial = new THREE.MeshStandardMaterial({color: '#304450', roughness: .8, side: THREE.DoubleSide});
  materials.push(wallMaterial);
  // The glass is an annulus outside the moving silhouette. Its inner edge and
  // the bezel follow the edited disc radius; no glass crosses behind a disc.
  const glassOuter = .9, bezelInner = shape.outerRadius + .002;
  const bezelOuter = Math.min(glassOuter - .001, shape.outerRadius + .014);
  const paneInner = Math.min(glassOuter - .0005, bezelOuter - .001);
  const paneGeometry = new THREE.RingGeometry(paneInner, glassOuter, 256);
  const frameGeometry = new THREE.RingGeometry(.888, .909, 256);
  const bezelGeometry = new THREE.RingGeometry(bezelInner, bezelOuter, 256);
  const bezelWallGeometry = new THREE.CylinderGeometry(bezelOuter, bezelOuter, 1, 256, 1, true);
  bezelWallGeometry.rotateX(Math.PI / 2);
  geometries.push(paneGeometry, frameGeometry, bezelGeometry, bezelWallGeometry);
  const paneMaterial = new THREE.MeshPhysicalMaterial({color: '#8ca7ab', metalness: .05,
    roughness: .2, transparent: true, opacity: .26, side: THREE.DoubleSide,
    depthWrite: false, emissive: '#558897', emissiveIntensity: .04});
  const bezelMaterial = new THREE.MeshStandardMaterial({color: '#304e59', metalness: .5,
    roughness: .34, side: THREE.DoubleSide, emissive: '#4a8290', emissiveIntensity: .1});
  const frameMaterial = new THREE.MeshStandardMaterial({color: '#536c73', metalness: .55,
    roughness: .3, side: THREE.DoubleSide, emissive: '#6e9ca4', emissiveIntensity: .08});
  materials.push(paneMaterial, bezelMaterial, frameMaterial);
  const pane = new THREE.Mesh(paneGeometry, paneMaterial); pane.name = 'Frame-held annular glass';
  const frame = new THREE.Mesh(frameGeometry, frameMaterial); frame.name = 'Outer glass retaining frame';
  const bezel = new THREE.Mesh(bezelGeometry, bezelMaterial); bezel.name = 'Glass-to-disc bezel';
  const bezelWall = new THREE.Mesh(bezelWallGeometry, bezelMaterial); bezelWall.name = 'Bezel depth wall';
  carrier.add(pane, frame, bezel, bezelWall);
  for (let index = 0; index < shape.count; index++) {
    const {inner, outer, midRadius} = ringBounds(shape, index);
    const geometry = discUvs(new THREE.RingGeometry(inner, outer, 256), shape.outerRadius);
    const wallGeometry = sideGeometry(inner, outer);
    geometries.push(geometry, wallGeometry);
    const pivot = new THREE.Group(); pivot.name = `Rigid ring ${index + 1}`;
    const front = faceMaterial(frontTextures[0], THREE.FrontSide);
    const back = faceMaterial(rearTexture, THREE.BackSide);
    materials.push(front, back);
    const frontMesh = new THREE.Mesh(geometry, front);
    const backMesh = new THREE.Mesh(geometry, back);
    const walls = new THREE.Mesh(wallGeometry, wallMaterial);
    frontMesh.position.z = THICKNESS / 2;
    backMesh.position.z = -THICKNESS / 2;
    pivot.add(frontMesh, backMesh, walls); rotor.add(pivot);
    rings.push({pivot, front, frontMesh, backMesh, walls, radius: midRadius, inner, outer,
      sides: [{material: front, kind: 'art', slot: 0}, {material: back, kind: 'abstract', slot: null}],
      parity: 0, targetReady: false, oldCleared: false, committed: true, orbit: 0, flip: 0});
  }
  const centerRadius = shape.centerRadius - shape.gap / 2;
  const centerGeometry = discUvs(new THREE.CircleGeometry(centerRadius, 192), shape.outerRadius);
  geometries.push(centerGeometry);
  const centerPivot = new THREE.Group(); centerPivot.name = 'Artwork continuation center';
  const centerFrontMaterial = faceMaterial(frontTextures[0], THREE.FrontSide);
  const centerBackMaterial = faceMaterial(rearTexture, THREE.BackSide);
  materials.push(centerFrontMaterial, centerBackMaterial);
  const centerFront = new THREE.Mesh(centerGeometry, centerFrontMaterial);
  const centerBack = new THREE.Mesh(centerGeometry, centerBackMaterial);
  centerFront.position.z = THICKNESS / 2;
  centerBack.position.z = -THICKNESS / 2;
  centerPivot.add(centerFront, centerBack); rotor.add(centerPivot);
  const center = {pivot: centerPivot, front: centerFrontMaterial, frontMesh: centerFront, backMesh: centerBack,
    radius: centerRadius,
    sides: [{material: centerFrontMaterial, kind: 'art', slot: 0}, {material: centerBackMaterial, kind: 'abstract', slot: null}],
    parity: 0, targetReady: false, oldCleared: false, committed: true, orbit: 0, flip: 0};
  function setSide(piece, sideIndex, kind, slot = null, endpoint = null) {
    const side = piece.sides[sideIndex], material = side.material;
    side.kind = kind; side.slot = kind === 'art' ? slot : null;
    material.map = kind === 'art' ? frontTextures[slot] : rearTexture;
    material.needsUpdate = true;
    const transform = material.userData.transform;
    if (kind === 'art' && endpoint) {
      const x = new THREE.Vector3(1, 0, 0).applyQuaternion(endpoint);
      const y = new THREE.Vector3(0, 1, 0).applyQuaternion(endpoint);
      transform.set(x.x, y.x, x.y, y.y);
    } else transform.set(1, 0, 0, 1);
    if (material.userData.uniform) material.userData.uniform.value = transform;
  }
  function setMotionBlur(piece, orbitSpan = 0, flipSpan = 0) {
    const axis = piece.axis || {x: 1, y: 0};
    for (const side of piece.sides) side.material.userData.motionBlur
      .set(orbitSpan, flipSpan, axis.x, axis.y);
  }
  return {group, carrier, rotor, pane, frame, bezel, bezelWall, rings, center, shape, centerFront, centerBack, frontTextures, rearTexture,
    setMountDepth(restDepth) {
      pane.position.z = -.075;
      frame.position.z = -.066;
      bezel.position.z = restDepth + THICKNESS / 2 + .001;
      const span = pane.position.z - bezel.position.z;
      bezelWall.position.z = (pane.position.z + bezel.position.z) / 2;
      bezelWall.scale.z = Math.max(.001, Math.abs(span));
    },
    setContrast(gain) {
      const value = Math.max(0, Math.min(4.8, Number.isFinite(gain) ? gain : 1));
      paneMaterial.opacity = Math.min(.65, .09 + .17 * value);
      paneMaterial.emissiveIntensity = .04 * value;
      bezelMaterial.emissiveIntensity = .1 * value;
      frameMaterial.emissiveIntensity = .08 * value;
    },
    setSide, setMotionBlur,
    setFront(slot) {
      for (const piece of [...rings, center]) {
        piece.pivot.quaternion.identity(); piece.parity = 0; piece.orbit = piece.flip = 0;
        setSide(piece, 0, 'art', slot, piece.pivot.quaternion);
        setSide(piece, 1, 'abstract');
        piece.committed = true;
      }
    },
    dispose() {
      group.removeFromParent();
      frontTextures.forEach(item => item.dispose()); rearTexture.dispose();
      geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
    }};
}
