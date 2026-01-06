// videos-tablet.js
// Helpers for GLB/tablet handling extracted from videos.js
import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.159.0/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/OrbitControls.js';

const DEBUG_PINK_RECT = false; // draw a diagnostic 16:9 plane in front of the screen
const SCREEN_W = 5.1520628;
const SCREEN_H_TARGET = 2.898035369653893; // 16:9 height derived from screen width
const NORMALIZE_SCREEN_UV = true;
let didLogScreenUv = false;

/* eslint-disable no-unused-vars */

export function normalizeTablet(gltf, opts = {}) {
  const tabletRoot = gltf.scene;
  tabletRoot.position.set(0, 0, 0);
  tabletRoot.rotation.set(0, 0, 0);
  tabletRoot.scale.set(1, 1, 1);

  const box = new THREE.Box3().setFromObject(tabletRoot);
  const center = box.getCenter(new THREE.Vector3());
  tabletRoot.position.sub(center);

  // Apply a gentle forward tilt only when explicitly requested via options.
  // The legacy `stupid.js` approach does NOT tilt the model and instead
  // frames the camera. Prefer that behavior by default to avoid unexpected
  // rotations. Callers may set { applyTilt: true } to keep the older tilt.
  if (opts && opts.applyTilt) {
    tabletRoot.rotation.x = -Math.PI * 0.08;
  }

  tabletRoot.traverse(obj => {
    if (obj.isMesh && (obj.name || '').toLowerCase().includes('screen')) {
      obj.userData.isTabletScreen = true;
    }
  });

  tabletRoot.updateMatrixWorld(true);
  return tabletRoot;
}

export function computeScreenUvBounds(mesh) {
  try {
    const g = mesh && mesh.geometry;
    const uvAttr = g && g.attributes && g.attributes.uv;
    if (!uvAttr) {
      console.warn('No UVs on screenMesh; cannot normalize.');
      return null;
    }
    let umin = Infinity, umax = -Infinity;
    let vmin = Infinity, vmax = -Infinity;
    for (let i = 0; i < uvAttr.count; i++) {
      const u = uvAttr.getX(i);
      const v = uvAttr.getY(i);
      if (u < umin) umin = u;
      if (u > umax) umax = u;
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
    const bounds = {
      umin,
      umax,
      vmin,
      vmax,
      spanU: umax - umin,
      spanV: vmax - vmin
    };
    return bounds;
  } catch (err) {
    console.warn('computeScreenUvBounds failed:', err);
    return null;
  }
}

// Create a mask texture in the plane's UV space that masks out regions outside
// the screen mesh. Draws the screenMesh triangles into the plane's canvas coords.
export function createMaskTextureForPlane(screenMesh, planeMesh, canvas) {
  try {
    if (!screenMesh || !planeMesh || !canvas) return null;
    const geo = screenMesh.geometry;
    const posAttr = geo && geo.attributes && geo.attributes.position;
    const idxAttr = geo && geo.index;
    if (!posAttr) return null;

    const mask = document.createElement('canvas');
    // Supersample mask to reduce seams / aliasing between triangles
    const SS = 2; // supersampling factor
    mask.width = Math.max(1, Math.round(canvas.width * SS));
    mask.height = Math.max(1, Math.round(canvas.height * SS));
    const ctx = mask.getContext('2d');
    if (!ctx) return null;
    // Clear
    ctx.clearRect(0, 0, mask.width, mask.height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, mask.width, mask.height);
    ctx.fillStyle = '#fff';

    function localToPlane(v) {
      const p = v.clone();
      screenMesh.localToWorld(p);
      planeMesh.worldToLocal(p);
      return p;
    }

    ctx.beginPath();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const triCount = idxAttr ? idxAttr.count / 3 : posAttr.count / 3;
    for (let i = 0; i < triCount; i++) {
      let a, b, c;
      if (idxAttr) {
        a = idxAttr.getX(i * 3 + 0);
        b = idxAttr.getX(i * 3 + 1);
        c = idxAttr.getX(i * 3 + 2);
      } else {
        a = i * 3 + 0;
        b = i * 3 + 1;
        c = i * 3 + 2;
      }
      const ax = posAttr.getX(a), ay = posAttr.getY(a), az = posAttr.getZ(a);
      const bx = posAttr.getX(b), by = posAttr.getY(b), bz = posAttr.getZ(b);
      const cx = posAttr.getX(c), cy = posAttr.getY(c), cz = posAttr.getZ(c);
      const va = new THREE.Vector3(ax, ay, az);
      const vb = new THREE.Vector3(bx, by, bz);
      const vc = new THREE.Vector3(cx, cy, cz);
      const pa = localToPlane(va);
      const pb = localToPlane(vb);
      const pc = localToPlane(vc);
      // plane extents
      const pw = planeMesh.geometry.parameters.width || 1;
      const ph = planeMesh.geometry.parameters.height || 1;
      const axc = ((pa.x + pw / 2) / pw) * mask.width;
      const ayc = mask.height - (((pa.y + ph / 2) / ph) * mask.height);
      const bxc = ((pb.x + pw / 2) / pw) * mask.width;
      const byc = mask.height - (((pb.y + ph / 2) / ph) * mask.height);
      const cxc = ((pc.x + pw / 2) / pw) * mask.width;
      const cyc = mask.height - (((pc.y + ph / 2) / ph) * mask.height);
      ctx.moveTo(axc, ayc); ctx.lineTo(bxc, byc); ctx.lineTo(cxc, cyc); ctx.closePath();
    }
    // Fill and stroke once for all triangles to avoid hairline seams
    ctx.fill();
    // Slight blur + stroke to remove tiny seams between triangles
    try { ctx.filter = 'blur(0.75px)'; } catch (e) { /* ignore */ }
    ctx.lineWidth = Math.max(1, SS);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    try { ctx.filter = 'none'; } catch (e) { /* ignore */ }
    const tex = new THREE.CanvasTexture(mask);
    // Improve sampling for downscale to avoid aliasing artifacts
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    try { tex.colorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }
    tex.flipY = true;
    tex.needsUpdate = true;
    return tex;
  } catch (e) { return null; }
}

// Fit camera to object helper (ported from stupid.js)
export function fitCameraToObject(camera, object, controls, offset = 1.25) {
  try {
    const box = new THREE.Box3().setFromObject(object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = sphere.radius;
    if (radius === 0) return;
    if (camera.isPerspectiveCamera) {
      const fov = camera.fov * (Math.PI / 180);
      const cameraDistance = Math.abs(radius / Math.sin(fov / 2)) * offset;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const newPos = center.clone().sub(dir.multiplyScalar(cameraDistance));
      camera.position.copy(newPos);
      camera.updateMatrixWorld(true);
      if (controls) {
        controls.target.copy(center);
        controls.update();
      }
    } else if (camera.isOrthographicCamera) {
      camera.zoom = Math.min(
        camera.right / (box.getSize(new THREE.Vector3()).x || 1),
        camera.top / (box.getSize(new THREE.Vector3()).y || 1)
      ) * offset;
      camera.updateProjectionMatrix();
      camera.position.copy(center.clone().add(new THREE.Vector3(0, 0, 1)));
      if (controls) { controls.target.copy(center); controls.update(); }
    }
  } catch (e) { console.warn('fitCameraToObject failed:', e); }
}

// Create and configure OrbitControls that are intended to control the tablet
export function setupTabletControls({ camera, domElement, tabletGroup, modelCenter, config } = {}) {
  try {
    if (!camera || !domElement) return null;
    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    // By default, lock panning to keep rotation origin at the tablet center.
    // Callers can override via config.enablePan = true.
    controls.enablePan = !!(config && config.enablePan);
      try {
        controls.mouseButtons = {
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE
        };
        controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
        // Use camera-space panning behavior (matches `stupid.js`) so pan moves
        // relative to the viewing plane (prevents forward/back pan movement).
        // This makes vertical drags move the tablet up/down in view space.
        controls.screenSpacePanning = true;
      } catch (e) { /* ignore */ }
    // sensible defaults; callers may override
    controls.minDistance = (config && config.minDistance) || 0.5;
    controls.maxDistance = (config && config.maxDistance) || 10.0;
    controls.rotateSpeed = (config && config.rotateSpeed) || 0.65;
    controls.zoomSpeed = (config && config.zoomSpeed) || 0.9;

    if (modelCenter && modelCenter.isVector3) {
      controls.target.copy(modelCenter);
      controls.update();
    } else if (tabletGroup) {
      try {
        const box = new THREE.Box3().setFromObject(tabletGroup);
        const center = box.getCenter(new THREE.Vector3());
        controls.target.copy(center);
        controls.update();
      } catch { }
    }
    return controls;
  } catch (e) {
    console.warn('setupTabletControls failed:', e);
    return null;
  }
}

// Create a raycaster helper for the tablet screen. Returns { hitFromEvent(ev, rect) }
export function createTabletRaycaster(camera, screenMesh) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  return {
    hitFromEvent(ev, rect) {
      try {
        if (!ev || !camera || !screenMesh) return null;
        if (!rect) {
          rect = ev.target && ev.target.getBoundingClientRect ? ev.target.getBoundingClientRect() : (document.body.getBoundingClientRect && document.body.getBoundingClientRect());
        }
        ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(screenMesh, true);
        return (hits && hits.length) ? hits[0] : null;
      } catch (e) { return null; }
    }
  };
}

// Attach an offscreen canvas as a CanvasTexture to the screen mesh and compute UV remap info
export function applyScreenCanvasTexture({ screenMesh, gridCanvas, renderer } = {}) {
  try {
    if (!screenMesh || !gridCanvas) return null;
    const CW = gridCanvas.width, CH = gridCanvas.height;
    const texture = new THREE.CanvasTexture(gridCanvas);
    try { texture.colorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }
    // Reduce oblique-angle blur by increasing anisotropy and explicit filters
    try { texture.anisotropy = Math.max(texture.anisotropy || 1, 16); } catch (e) { /* ignore */ }
    try { texture.minFilter = THREE.LinearMipMapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = true; } catch (e) { /* ignore */ }
    texture.flipY = false;
    texture.needsUpdate = true;

    const mat = Array.isArray(screenMesh.material) ? screenMesh.material[0] : screenMesh.material;
    if (mat) {
      mat.map = texture;
      try { mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1.0; mat.emissiveMap = texture; } catch (e) { /* ignore */ }
      mat.needsUpdate = true;
    }

    let uvRemap = { repeatU: 1, repeatV: 1, offsetU: 0, offsetV: 0 };
    try {
      const bounds = computeScreenUvBounds(screenMesh);
      if (bounds && Number.isFinite(bounds.spanU) && Number.isFinite(bounds.spanV) && bounds.spanU > 0 && bounds.spanV > 0) {
        const repU = 1 / bounds.spanU;
        const repV = 1 / bounds.spanV;
        const offU = -bounds.umin / bounds.spanU;
        const offV = -bounds.vmin / bounds.spanV;
        uvRemap = { repeatU: repU, repeatV: repV, offsetU: offU, offsetV: offV };
        if (NORMALIZE_SCREEN_UV) {
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.repeat.set(repU, repV);
          texture.offset.set(offU, offV);
          texture.needsUpdate = true;
          if (!didLogScreenUv) {
            console.log('[ScreenUV]', bounds);
            didLogScreenUv = true;
          }
        }
      }
    } catch (e) { /* ignore */ }

    function uvToCanvas(uv) {
      const u = uv.x * uvRemap.repeatU + uvRemap.offsetU;
      const v = uv.y * uvRemap.repeatV + uvRemap.offsetV;
      return {
        x: THREE.MathUtils.clamp(u, 0, 1) * CW,
        y: THREE.MathUtils.clamp(v, 0, 1) * CH
      };
    }

    return { texture, uvRemap, uvToCanvas };
  } catch (e) {
    console.warn('applyScreenCanvasTexture failed:', e);
    return null;
  }
}

// Try to create an overlay mesh that uses the provided texture. If overlay
// creation fails, fall back to applying the texture directly to the
// screen material. Returns the overlay mesh (or null when fallback applied).
export function createScreenOverlay({ screenMesh, texture, gridCanvas, alwaysOnTop = false, doubleSided = false, camera = null, expand = 1.01, shiftXFrac = -0.002 } = {}) {
  try {
    if (!screenMesh) return null;
    let tex = texture;
    if (!tex && gridCanvas) tex = new THREE.CanvasTexture(gridCanvas);
    if (tex) {
      try { tex.anisotropy = Math.max(tex.anisotropy || 1, 16); } catch (e) { /* ignore */ }
      try { tex.minFilter = THREE.LinearMipMapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; } catch (e) { /* ignore */ }
      try { tex.needsUpdate = true; } catch (e) { /* ignore */ }
    }
    if (tex) {
      try { tex.anisotropy = Math.max(tex.anisotropy || 1, 16); } catch (e) { /* ignore */ }
      try { tex.minFilter = THREE.LinearMipMapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; } catch (e) { /* ignore */ }
      try { tex.needsUpdate = true; } catch (e) { /* ignore */ }
    }
    if (!tex) return null;
    try { tex.colorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }
    // For a PlaneGeometry overlay, we want canvas (top-left origin) to appear upright.
    tex.flipY = true;

    // IMPORTANT: fit a 16:9 overlay plane within the screen bounds so the
    // canvas maps without stretching.
    screenMesh.updateWorldMatrix(true, false);
    const bbox = new THREE.Box3().setFromObject(screenMesh);
    const size = bbox.getSize(new THREE.Vector3());
    const centerWorld = bbox.getCenter(new THREE.Vector3());

    const aspect = 16 / 9;
    let w = Math.max(0.001, size.x);
    let h = w / aspect;
    if (h > size.y) {
      h = Math.max(0.001, size.y);
      w = h * aspect;
    }
    // Slight expansion so the overlay bleeds beyond the screen edge.
    w = Math.max(0.001, w * expand);
    h = Math.max(0.001, h * expand);

    const planeGeo = new THREE.PlaneGeometry(w, h);
    const overlayMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 1,
      depthTest: !alwaysOnTop,
      depthWrite: false,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide
    });

    const overlayMesh = new THREE.Mesh(planeGeo, overlayMat);
    overlayMesh.name = 'screenOverlay';
    overlayMesh.renderOrder = alwaysOnTop ? 99999 : 1500;

    // Position at the screen center in screen-local coordinates.
    const localCenter = screenMesh.worldToLocal(centerWorld.clone());
    overlayMesh.position.copy(localCenter);
    overlayMesh.scale.set(1, 1, 1);

    // Orient overlay so its +Z faces the screen mesh surface normal at the
    // screen center, and offset it a hair along that normal to avoid z-fighting
    try {
      const geo = screenMesh.geometry;
      const centerWorld = bbox.getCenter(new THREE.Vector3());
      // approximate world normal by finding the triangle whose centroid is
      // closest to the mesh's world center and using its normal
      let worldNormal = new THREE.Vector3(0, 0, 1);
      if (geo && geo.attributes && geo.attributes.position) {
        const pos = geo.attributes.position;
        const idx = geo.index;
        let bestDist = Infinity;
        const triCount = idx ? idx.count / 3 : pos.count / 3;
        for (let i = 0; i < triCount; i++) {
          const a = idx ? idx.getX(i * 3 + 0) : i * 3 + 0;
          const b = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
          const c = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
          const va = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
          const vb = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
          const vc = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));
          const centroid = va.clone().add(vb).add(vc).multiplyScalar(1 / 3);
          const worldCent = centroid.clone(); screenMesh.localToWorld(worldCent);
          const d = worldCent.distanceTo(centerWorld);
          if (d < bestDist) {
            bestDist = d;
            const n = vc.clone().sub(vb).cross(va.clone().sub(vb)).normalize();
            worldNormal.copy(n);
          }
        }
      }
      // transform normal into world-space and normalize
      try { worldNormal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(screenMesh.matrixWorld)).normalize(); } catch (e) { /* ignore */ }

      // create quaternion that maps plane +Z -> worldNormal
      const worldQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
      // Attempt to remove roll by aligning plane +Y to screen mesh local +Y
      try {
        const screenWorldQuat = new THREE.Quaternion(); screenMesh.getWorldQuaternion(screenWorldQuat);
        const screenUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(screenWorldQuat).normalize();
        // plane +Y after applying worldQuat
        const planeUpAfter = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat).normalize();
        // Project both onto plane orthogonal to worldNormal
        const pA = planeUpAfter.clone().projectOnPlane(worldNormal).normalize();
        const pB = screenUpWorld.clone().projectOnPlane(worldNormal).normalize();
        if (pA.lengthSq() > 0.000001 && pB.lengthSq() > 0.000001) {
          let dot = THREE.MathUtils.clamp(pA.dot(pB), -1, 1);
          let angle = Math.acos(dot);
          const cross = pA.clone().cross(pB);
          if (cross.dot(worldNormal) < 0) angle = -angle;
          const rotAroundNormal = new THREE.Quaternion().setFromAxisAngle(worldNormal, angle);
          worldQuat.premultiply(rotAroundNormal);
        }
        const localQuat = screenWorldQuat.clone().invert().multiply(worldQuat);
        overlayMesh.quaternion.copy(localQuat);
      } catch (e) {
        const screenWorldQuat = new THREE.Quaternion(); screenMesh.getWorldQuaternion(screenWorldQuat);
        const localQuat = screenWorldQuat.clone().invert().multiply(worldQuat);
        overlayMesh.quaternion.copy(localQuat);
      }

      // compute a tiny offset along the normal in screen-local coords
      const normalLocal = worldNormal.clone().applyQuaternion(screenWorldQuat.clone().invert());
      const bs = size.length() || 1;
      const offset = Math.max(0.00025 * bs, 0.0005);
      overlayMesh.position.add(normalLocal.multiplyScalar(offset));
    } catch (e) { /* ignore orientation errors */ }

    // Apply lateral shift if requested (preserve existing behavior)
    try { overlayMesh.position.x += shiftXFrac * size.x; } catch (e) { /* ignore */ }
    screenMesh.add(overlayMesh);
    overlayMesh.updateMatrixWorld(true);

    // If a camera is provided and we ended up facing away, flip the plane.
    try {
      if (camera && camera.position && overlayMesh.getWorldPosition) {
        const p = overlayMesh.getWorldPosition(new THREE.Vector3());
        const toCam = new THREE.Vector3().subVectors(camera.position, p).normalize();
        const n = new THREE.Vector3(0, 0, 1).transformDirection(overlayMesh.matrixWorld).normalize();
        if (n.dot(toCam) < 0) {
          overlayMesh.rotateY(Math.PI);
          overlayMesh.updateMatrixWorld(true);
        }
      }
    } catch (e) { /* ignore */ }

    // Create mask texture so only regions overlapping the screen mesh remain visible
    try {
      const maskTex = createMaskTextureForPlane(screenMesh, overlayMesh, gridCanvas);
      if (maskTex) { overlayMat.alphaMap = maskTex; overlayMat.alphaTest = 0.01; overlayMat.needsUpdate = true; }
    } catch (e) { /* ignore */ }
    return overlayMesh;
  } catch (err) {
    console.warn('createScreenOverlay failed, attempting planar overlay before material fallback', err);
    try {
      let fbTex = texture || (gridCanvas ? new THREE.CanvasTexture(gridCanvas) : null);
      if (fbTex) {
        try { fbTex.anisotropy = Math.max(fbTex.anisotropy || 1, 16); } catch (e) { }
        try { fbTex.minFilter = THREE.LinearMipMapLinearFilter; fbTex.magFilter = THREE.LinearFilter; fbTex.generateMipmaps = true; } catch (e) { }
        try { fbTex.needsUpdate = true; } catch (e) { }
      }
      const planar = createPlanarOverlay({ screenMesh, texture: fbTex, doubleSided: true, gridCanvas });
      if (planar) return planar;
    } catch (e) { /* ignore planar fallback errors */ }
    try {
      // fallback: apply texture to material
      const mat = Array.isArray(screenMesh.material) ? screenMesh.material[0] : screenMesh.material;
      if (mat) {
        let fb = texture || (gridCanvas ? new THREE.CanvasTexture(gridCanvas) : null);
        if (fb) {
          try { fb.anisotropy = Math.max(fb.anisotropy || 1, 16); } catch (e) { }
          try { fb.minFilter = THREE.LinearMipMapLinearFilter; fb.magFilter = THREE.LinearFilter; fb.generateMipmaps = true; } catch (e) { }
          try { fb.needsUpdate = true; } catch (e) { }
        }
        mat.map = fb;
        try { mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = 1.0; mat.emissiveMap = mat.map; } catch (e) { /* ignore */ }
        mat.needsUpdate = true;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
}

// Create an additional overlay plane attached to the screen mesh with an explicit
// size and center offset in the screen mesh's local space. Intended for placing
// UI panels above/below the main 16:9 content without stretching it.
export function createScreenOverlayPlane({
  screenMesh,
  texture,
  gridCanvas,
  width,
  height,
  centerOffset = null,
  alwaysOnTop = false,
  doubleSided = false,
  camera = null,
  name = 'screenOverlayPlane'
} = {}) {
  try {
    if (!screenMesh) return null;
    let tex = texture;
    if (!tex && gridCanvas) tex = new THREE.CanvasTexture(gridCanvas);
    if (!tex) return null;
    try { tex.colorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }
    tex.flipY = true;

    screenMesh.updateWorldMatrix(true, false);
    const bbox = new THREE.Box3().setFromObject(screenMesh);
    const size = bbox.getSize(new THREE.Vector3());
    const centerWorld = bbox.getCenter(new THREE.Vector3());

    // Slightly expand the overlay plane so panels bleed beyond the screen edge
    const expand = 1.01;
    const w = Math.max(0.001, (width ?? size.x) * expand);
    const h = Math.max(0.001, (height ?? size.y) * expand);
    const planeGeo = new THREE.PlaneGeometry(w, h);
    const overlayMat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 1,
      depthTest: !alwaysOnTop,
      depthWrite: false,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide
    });

    const overlayMesh = new THREE.Mesh(planeGeo, overlayMat);
    overlayMesh.name = name;
    overlayMesh.renderOrder = alwaysOnTop ? 99999 : 1500;

    const localCenter = screenMesh.worldToLocal(centerWorld.clone());
    overlayMesh.position.copy(localCenter);
    if (centerOffset) {
      overlayMesh.position.add(new THREE.Vector3(centerOffset.x || 0, centerOffset.y || 0, centerOffset.z || 0));
    }
    overlayMesh.scale.set(1, 1, 1);

    // Orient overlay plane to match screen surface normal and offset slightly
    try {
      const geo = screenMesh.geometry;
      const centerWorld = bbox.getCenter(new THREE.Vector3());
      let worldNormal = new THREE.Vector3(0, 0, 1);
      if (geo && geo.attributes && geo.attributes.position) {
        const pos = geo.attributes.position;
        const idx = geo.index;
        let bestDist = Infinity;
        const triCount = idx ? idx.count / 3 : pos.count / 3;
        for (let i = 0; i < triCount; i++) {
          const a = idx ? idx.getX(i * 3 + 0) : i * 3 + 0;
          const b = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
          const c = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
          const va = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
          const vb = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
          const vc = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));
          const centroid = va.clone().add(vb).add(vc).multiplyScalar(1 / 3);
          const worldCent = centroid.clone(); screenMesh.localToWorld(worldCent);
          const d = worldCent.distanceTo(centerWorld);
          if (d < bestDist) {
            bestDist = d;
            const n = vc.clone().sub(vb).cross(va.clone().sub(vb)).normalize();
            worldNormal.copy(n);
          }
        }
      }
      try { worldNormal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(screenMesh.matrixWorld)).normalize(); } catch (e) { /* ignore */ }
      const worldQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
      try {
        const screenWorldQuat = new THREE.Quaternion(); screenMesh.getWorldQuaternion(screenWorldQuat);
        const screenUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(screenWorldQuat).normalize();
        const planeUpAfter = new THREE.Vector3(0, 1, 0).applyQuaternion(worldQuat).normalize();
        const pA = planeUpAfter.clone().projectOnPlane(worldNormal).normalize();
        const pB = screenUpWorld.clone().projectOnPlane(worldNormal).normalize();
        if (pA.lengthSq() > 0.000001 && pB.lengthSq() > 0.000001) {
          let dot = THREE.MathUtils.clamp(pA.dot(pB), -1, 1);
          let angle = Math.acos(dot);
          const cross = pA.clone().cross(pB);
          if (cross.dot(worldNormal) < 0) angle = -angle;
          const rotAroundNormal = new THREE.Quaternion().setFromAxisAngle(worldNormal, angle);
          worldQuat.premultiply(rotAroundNormal);
        }
        const localQuat = screenWorldQuat.clone().invert().multiply(worldQuat);
        overlayMesh.quaternion.copy(localQuat);
      } catch (e) {
        const screenWorldQuat = new THREE.Quaternion(); screenMesh.getWorldQuaternion(screenWorldQuat);
        const localQuat = screenWorldQuat.clone().invert().multiply(worldQuat);
        overlayMesh.quaternion.copy(localQuat);
      }
      const normalLocal = worldNormal.clone().applyQuaternion(screenWorldQuat.clone().invert());
      const bs = size.length() || 1;
      const offset = Math.max(0.00025 * bs, 0.0005);
      overlayMesh.position.add(normalLocal.multiplyScalar(offset));
    } catch (e) { /* ignore */ }

    // small left shift to visually nudge the plane inward for rounded screen edges
    try { overlayMesh.position.x += -0.002 * size.x; } catch (e) { }

    screenMesh.add(overlayMesh);
    overlayMesh.updateMatrixWorld(true);

    // If a camera is provided and we ended up facing away, flip the plane.
    try {
      if (camera && camera.position && overlayMesh.getWorldPosition) {
        const p = overlayMesh.getWorldPosition(new THREE.Vector3());
        const toCam = new THREE.Vector3().subVectors(camera.position, p).normalize();
        const n = new THREE.Vector3(0, 0, 1).transformDirection(overlayMesh.matrixWorld).normalize();
        if (n.dot(toCam) < 0) {
          overlayMesh.rotateY(Math.PI);
          overlayMesh.updateMatrixWorld(true);
        }
      }
    } catch (e) { /* ignore */ }

    // Mask to screen mesh
    try { const mask = createMaskTextureForPlane(screenMesh, overlayMesh, gridCanvas || document.createElement('canvas')); if (mask) { overlayMat.alphaMap = mask; overlayMat.alphaTest = 0.01; overlayMat.needsUpdate = true; } } catch (e) { /* ignore */ }
    return overlayMesh;
  } catch (err) {
    console.warn('createScreenOverlayPlane failed:', err);
    return null;
  }
}

// Create a simple planar overlay that matches the screen mesh bounding box
// and attaches the provided texture. This is a robust fallback when the
// screen mesh has broken/missing UVs or cloning the geometry leads to
// stretched mapping artifacts.
export function createPlanarOverlay({ screenMesh, texture, doubleSided = false, gridCanvas = null } = {}) {
  try {
    if (!screenMesh || !texture) return null;
    // compute world-space bounding box for the screen mesh
    screenMesh.updateWorldMatrix(true, false);
    const bbox = new THREE.Box3().setFromObject(screenMesh);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    // fit a 16:9 rect inside the screen bounds
    const aspect = 16 / 9;
    let w = Math.max(0.001, size.x);
    let h = w / aspect;
    if (h > size.y) { h = Math.max(0.001, size.y); w = h * aspect; }
    // Expand slightly beyond screen bounds to hide seams
    const expand = 1.01;
    w = Math.max(0.001, w * expand);
    h = Math.max(0.001, h * expand);

    const planeGeo = new THREE.PlaneGeometry(w, h);
    const overlayMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide });
    const plane = new THREE.Mesh(planeGeo, overlayMat);
    plane.name = 'screenPlaneOverlay';
    plane.renderOrder = 999;

    // Parent the plane to the screen mesh so transforms follow. Compute the
    // plane's local center by converting the world-space center into the
    // screen mesh's local coordinates.
    const localCenter = screenMesh.worldToLocal(center.clone());
    plane.position.copy(localCenter);
    plane.scale.set(1, 1, 1);

    // Orient plane to match screen surface normal and offset slightly outward
    try {
      const geo = screenMesh.geometry;
      let worldNormal = new THREE.Vector3(0, 0, 1);
      if (geo && geo.attributes && geo.attributes.position) {
        const pos = geo.attributes.position;
        const idx = geo.index;
        let bestDist = Infinity;
        const triCount = idx ? idx.count / 3 : pos.count / 3;
        const centerWorld = bbox.getCenter(new THREE.Vector3());
        for (let i = 0; i < triCount; i++) {
          const a = idx ? idx.getX(i * 3 + 0) : i * 3 + 0;
          const b = idx ? idx.getX(i * 3 + 1) : i * 3 + 1;
          const c = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
          const va = new THREE.Vector3(pos.getX(a), pos.getY(a), pos.getZ(a));
          const vb = new THREE.Vector3(pos.getX(b), pos.getY(b), pos.getZ(b));
          const vc = new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c));
          const centroid = va.clone().add(vb).add(vc).multiplyScalar(1 / 3);
          const worldCent = centroid.clone(); screenMesh.localToWorld(worldCent);
          const d = worldCent.distanceTo(centerWorld);
          if (d < bestDist) {
            bestDist = d;
            const n = vc.clone().sub(vb).cross(va.clone().sub(vb)).normalize();
            worldNormal.copy(n);
          }
        }
      }
      try { worldNormal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(screenMesh.matrixWorld)).normalize(); } catch (e) { }
      const worldQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
      const screenWorldQuat = new THREE.Quaternion(); screenMesh.getWorldQuaternion(screenWorldQuat);
      const localQuat = screenWorldQuat.clone().invert().multiply(worldQuat);
      plane.quaternion.copy(localQuat);
      const normalLocal = worldNormal.clone().applyQuaternion(screenWorldQuat.clone().invert());
      const bs = size.length() || 1;
      const offset = Math.max(0.00025 * bs, 0.0005);
      plane.position.add(normalLocal.multiplyScalar(offset));
    } catch (e) { /* ignore */ }
    // add as child so it follows mesh transforms
    screenMesh.add(plane);

    // Slight outward nudge along local +Z to avoid z-fighting
    try {
      const bs = size.length() || 1;
      const offsetLocal = new THREE.Vector3(0, 0, 0.001 * bs);
      plane.position.add(offsetLocal);
    } catch (e) { /* ignore */ }

    try {
      const mask = createMaskTextureForPlane(screenMesh, plane, gridCanvas || (texture && texture.image ? texture.image : null));
      if (mask) { overlayMat.alphaMap = mask; overlayMat.alphaTest = 0.01; overlayMat.needsUpdate = true; }
    } catch (e) { /* ignore */ }
    return plane;
  } catch (e) {
    console.warn('createPlanarOverlay failed:', e);
    return null;
  }
}

// Update OrbitControls min/max distances based on model box and camera FOV so the tablet covers desired fraction
export function updateZoomBoundsForCoverage({ camera, controls, modelBox, renderer } = {}) {
  try {
    if (!camera || !controls || !modelBox || !renderer) return;
    const modelSize = new THREE.Vector3();
    modelBox.getSize(modelSize);
    const vfov = THREE.MathUtils.degToRad(camera.fov || 25);
    const aspect = Math.max(0.1, renderer.domElement.clientWidth / Math.max(1, renderer.domElement.clientHeight));
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const H = Math.max(0.001, modelSize.y);
    const W = Math.max(0.001, modelSize.x);
    const dFitH = (H / 2) / Math.tan(vfov / 2);
    const dFitW = (W / 2) / Math.tan(hfov / 2);
    const dFit = Math.max(dFitH, dFitW);
    const fraction = 0.5;
    const dFor50 = dFit / fraction;
    controls.maxDistance = Math.max(dFor50, dFit * 1.05);
    controls.minDistance = Math.max(0.25, dFit * 0.8);
    if (controls.maxDistance <= controls.minDistance) controls.maxDistance = controls.minDistance * 1.25;
    // adjust camera if outside new bounds
    const fromTarget = new THREE.Vector3().copy(camera.position).sub(controls.target);
    const currentDist = fromTarget.length();
    let desired = THREE.MathUtils.clamp(currentDist || controls.maxDistance, controls.minDistance * 1.05, controls.maxDistance * 0.95);
    if (!isFinite(currentDist) || currentDist < controls.minDistance || currentDist > controls.maxDistance) desired = controls.maxDistance * 0.92;
    if (desired > 0) {
      fromTarget.setLength(desired);
      camera.position.copy(controls.target).add(fromTarget);
      camera.updateProjectionMatrix();
      controls.update();
    }
  } catch (e) { /* ignore */ }
}

export function applyBlenderAlignment({tabletGroupRef, camera, controls, renderer, videosPageConfig}) {
  try {
    if (!tabletGroupRef || !camera || !renderer) return;
    const canvasEl = renderer.domElement;
    const aspect = canvasEl && canvasEl.clientHeight > 0 ? canvasEl.clientWidth / canvasEl.clientHeight : (camera.aspect || 16 / 9);
    // Compute tablet center once for controls target
    const box = new THREE.Box3().setFromObject(tabletGroupRef);
    const center = box.getCenter(new THREE.Vector3());

    // Apply tablet pose from config if available
    const cfg = videosPageConfig.tabletAlignment;
    if (cfg && cfg.tabletWorld) {
      const t = cfg.tabletWorld;
      const preferGlbCam = !!(camera.userData && camera.userData.comesFromGLB) && !cfg.forceBlenderPose;
      if (!preferGlbCam) {
        if (t.pos) tabletGroupRef.position.set(t.pos.x || 0, t.pos.y || 0, t.pos.z || 0);
        if (t.rotXYZ) tabletGroupRef.rotation.set(t.rotXYZ.x || 0, t.rotXYZ.y || 0, t.rotXYZ.z || 0);
      }
      if (t.scale) tabletGroupRef.scale.set(t.scale.x || 1, t.scale.y || 1, t.scale.z || 1);
    }

    if (camera.userData && camera.userData.comesFromGLB) {
      if (camera.isPerspectiveCamera) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      if (controls) {
        const tabletCenter = new THREE.Vector3();
        if (tabletGroupRef) {
          const box = new THREE.Box3().setFromObject(tabletGroupRef);
          box.getCenter(tabletCenter);
        }
        controls.target.copy(tabletCenter);
        controls.update();
      }
      console.log('Using GLB dolly rig camera position and orientation');
      try { window.__freezeAutoZoom = true; } catch (e) { /* ignore */ }
      return;
    }

    const cameraConfig = cfg && cfg.camera;
    if (camera.isPerspectiveCamera) {
      camera.fov = (cameraConfig && cameraConfig.fovY) || 24.0;
      camera.aspect = aspect;
      camera.near = 0.1; camera.far = 100;
      camera.updateProjectionMatrix();
    }

    try {
      const vfov = THREE.MathUtils.degToRad(camera.fov || 25);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
      const size = new THREE.Vector3();
      new THREE.Box3().setFromObject(tabletGroupRef).getSize(size);
      const dFitH = (Math.max(0.001, size.y) / 2) / Math.tan(vfov / 2);
      const dFitW = (Math.max(0.001, size.x) / 2) / Math.tan(hfov / 2);
      const d = Math.max(dFitH, dFitW) * 1.15;
      const az = THREE.MathUtils.degToRad(0);
      const el = THREE.MathUtils.degToRad(70);
      const x = d * Math.cos(el) * Math.cos(az);
      const z = d * Math.cos(el) * Math.sin(az);
      const y = d * Math.sin(el);
      if (!camera.userData || !camera.userData.comesFromGLB) {
        camera.position.set(center.x + x, center.y + y, center.z + z);
        camera.lookAt(center);
      }
    } catch (e) {
      camera.position.set(center.x, center.y + 3, center.z + 5);
      camera.lookAt(center);
    }
    camera.updateMatrixWorld(true);
    if (controls) { controls.target.copy(center); controls.update(); }
    try { window.__freezeAutoZoom = true; } catch (e) { /* ignore */ }
  } catch (e) { /* silent */ }
}

export function loadTabletGlb(path, onLoaded, onProgress, onError) {
  try {
    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');
    const enc = (p) => encodeURI(p);
    loader.load(enc(path), onLoaded, onProgress, onError || (() => {}));
  } catch (e) {
    console.warn('loadTabletGlb failed:', e);
    try { if (onError) onError(e); } catch (err) { /* ignore */ }
  }
}

// Initialize the scene/camera/tablet from a loaded GLTF. Returns an object
// with commonly-used references so callers can continue with page-level
// orchestration (e.g. create the VideoPlayer grid texture). This encapsulates
// GLB-specific setup that used to live inside `videos.js`.
export function initTabletFromGltf(gltf, {
  scene, renderer, canvas, underLight, videosPageConfig
} = {}) {
  try {
    try { normalizeTablet(gltf, { applyTilt: false }); } catch (e) { /* fallback */ }
    const tabletGroup = new THREE.Group();
    scene.add(tabletGroup);
    tabletGroup.add(gltf.scene);
    try { if (underLight) underLight.target = tabletGroup; } catch (e) { /* ignore */ }

    // Track for caller
    const tabletGroupRef = tabletGroup;
    // Expose a small set of derived values to the caller
    const cameras = [];
    const lights = [];
    gltf.scene.traverse(obj => {
      if (obj.isCamera) cameras.push(obj);
      if (obj.isLight) lights.push(obj);
    });

    let camera = null;
    const gltfHasCameras = (gltf.cameras && gltf.cameras.length > 0);
    if (gltfHasCameras) {
      camera = gltf.cameras[0];
      // Detach camera into world space so OrbitControls can operate
      try {
        camera.updateMatrixWorld(true);
        const wp = new THREE.Vector3();
        const wq = new THREE.Quaternion();
        const ws = new THREE.Vector3();
        camera.matrixWorld.decompose(wp, wq, ws);
        if (camera.parent) camera.parent.remove(camera);
        scene.add(camera);
        camera.position.copy(wp);
        camera.quaternion.copy(wq);
        camera.scale.copy(ws);
        camera.updateMatrixWorld(true);
      } catch (e) { /* ignore */ }
      camera.userData = camera.userData || {};
      camera.userData.comesFromGLB = true;
    } else if (cameras.length) {
      camera = cameras[0];
      camera.userData = camera.userData || {};
    } else {
      const aspectFallback = (() => {
        try {
          if (renderer?.domElement?.clientHeight > 0) {
            return renderer.domElement.clientWidth / renderer.domElement.clientHeight;
          }
        } catch { }
        return (typeof window !== 'undefined' && window.innerHeight > 0)
          ? window.innerWidth / window.innerHeight
          : 16 / 9;
      })();
      const fov = videosPageConfig?.tabletAlignment?.camera?.fovY ?? 25;
      camera = new THREE.PerspectiveCamera(fov, aspectFallback, 0.1, 100);
      camera.position.set(0, 2, 6);
      camera.lookAt(new THREE.Vector3());
      camera.userData = { comesFromGLB: false };
    }

    // Compute model bounds and center for downstream camera targeting
    // declare as `let` so we can recompute after a potential auto-flip
    let modelBox = new THREE.Box3().setFromObject(tabletGroupRef);
    let modelCenter = modelBox.getCenter(new THREE.Vector3());
    try { if (camera && camera.isPerspectiveCamera) camera.lookAt(modelCenter); } catch (e) { /* ignore */ }

    // Create OrbitControls for callers (if renderer/dom element available)
    let controls = null;
    try {
      if (renderer && renderer.domElement) {
        controls = setupTabletControls({ camera, domElement: renderer.domElement, tabletGroup, modelCenter, config: videosPageConfig });
      }
    } catch (e) { /* ignore */ }

    // Compute screen mesh and UV bounds (caller may use these)
    let screenMesh = null;
    try {
      // First, list candidates with UVs from the gltf
      const candidates = listScreenCandidatesFromGltf(gltf.scene);

      // Allow the page config to force a specific mesh name/uuid (strict match first).
      const forcedName = videosPageConfig && videosPageConfig.tabletAlignment && videosPageConfig.tabletAlignment.screenMeshName;
      const forbidden = videosPageConfig && videosPageConfig.tabletAlignment && videosPageConfig.tabletAlignment.forbiddenPattern
        ? new RegExp(videosPageConfig.tabletAlignment.forbiddenPattern, 'i')
        : /^Plane631/i;

      if (forcedName) {
        // Only accept exact name or uuid matches for forced selection to avoid
        // accidental substring matches that target incidental geometry.
        const forced = candidates.find(c => (c.name === forcedName) || (c.uuid === forcedName));
        if (forced && !forbidden.test(forced.name || '')) screenMesh = forced.mesh;
      }

      // If not forced, choose the preferred mesh by name/material heuristics (and reject forbidden names)
      if (!screenMesh) {
        screenMesh = pickFrontScreenMesh(candidates, { forbiddenPattern: forbidden, strictName: 'tablet_screen003' });
      }

      // Last-resort fallback: pick the first mesh with UVs that is not forbidden
      if (!screenMesh) {
        gltf.scene.traverse(node => {
          if (!screenMesh && node.isMesh) {
            const geom = node.geometry;
            if (geom && geom.attributes && geom.attributes.uv && !forbidden.test(node.name || '')) screenMesh = node;
          }
        });
      }

    if (screenMesh) {
      console.log('[videos-table] Using screenMesh:', screenMesh.name || screenMesh.uuid);
      // Flatten the native screen texture to solid black so gaps don't reveal the baked-in image.
      try {
        const mat = Array.isArray(screenMesh.material) ? screenMesh.material[0] : screenMesh.material;
        if (mat) {
          if (!screenMesh.userData._origMaterialProps) {
            screenMesh.userData._origMaterialProps = { map: mat.map, emissiveMap: mat.emissiveMap, color: mat.color ? mat.color.clone() : null };
          }
          mat.map = null;
          mat.emissiveMap = null;
          if (mat.color) mat.color.set(0x0A163B);
          try { mat.emissive = new THREE.Color(0x0A163B); } catch (e) { /* ignore */ }
          mat.needsUpdate = true;
        }
      } catch (e) { /* ignore */ }
    } else {
      console.warn('[videos-table] No screenMesh found (deterministic selection); some interactions may fall back to raycast heuristics.');
    }
    } catch (e) {
      console.warn('[videos-table] screen selection failed:', e);
    }

    // Compute UV remap info for the chosen screenMesh (if helper exists)
    let uvRemap = null;
    try {
      if (typeof computeScreenUvBounds === 'function' && screenMesh) {
        uvRemap = computeScreenUvBounds(screenMesh);
      }
    } catch (e) { /* ignore */ }

    // Auto-flip heuristics removed: tablet orientation should be controlled
    // explicitly by page config or manual controls. No automatic flipping here.

    // If the GLB did not provide a camera, attempt to frame using a smart
    // auto-fit (stupid.js behavior) so the tablet appears at a sensible size.
    try {
      if (!camera.userData || !camera.userData.comesFromGLB) {
        fitCameraToObject(camera, tabletGroupRef, controls, 1.25);
        // Let applyBlenderAlignment still run to apply any page-specific tweaks
        applyBlenderAlignment({ tabletGroupRef, camera, controls: controls, renderer, videosPageConfig });
      } else {
        // If the camera came from the GLB, still run alignment but prefer the GLB camera
        applyBlenderAlignment({ tabletGroupRef, camera, controls: controls, renderer, videosPageConfig });
      }
    } catch (e) { /* ignore */ }

    // Return minimal set of references the page code needs to continue
    return {
      tabletGroup,
      screenMesh,
      controls,
      uvRemap,
      camera,
      modelCenter
    };
  } catch (e) {
    console.warn('initTabletFromGltf failed:', e);
    throw e;
  }
}

// --- Screen selection helpers (top-level) ---------------------------------

function listScreenCandidatesFromGltf(root) {
  const results = [];
  if (!root || typeof root.traverse !== 'function') return results;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const geom = obj.geometry;
    if (!geom || !geom.attributes || !geom.attributes.uv) return;
    const material = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const materialName = material && material.name ? material.name : "";
    results.push({
      mesh: obj,
      name: obj.name || "",
      uuid: obj.uuid,
      hasUV: !!geom.attributes.uv,
      materialName
    });
  });
  if (!window.__videos_debug) window.__videos_debug = {};
  window.__videos_debug.listScreenCandidatesFromGltf = () =>
    results.map(({ mesh, name, uuid, hasUV, materialName }) => ({ name, uuid, hasUV, materialName }));
  return results;
}

function pickFrontScreenMesh(candidates, opts = {}) {
  if (!candidates || !candidates.length) return null;
  const forbiddenPattern = opts.forbiddenPattern instanceof RegExp ? opts.forbiddenPattern : new RegExp(opts.forbiddenPattern || '^Plane631', 'i');
  const STRICT_NAME = (opts.strictName || 'tablet_screen003').toString();
  const PREFERRED_NAMES = [STRICT_NAME, "tablet_screen", "screen", "Screen"];
  const PREFERRED_MATERIALS = ["Screen", "screen"];

  // filter out forbidden
  const forbiddenCandidates = candidates.filter(c => forbiddenPattern.test(c.name || ""));
  const allowed = candidates.filter(c => !(forbiddenPattern.test(c.name || "")));

  // 1) exact mesh-name preference (case-insensitive strict match first)
  for (const c of allowed) {
    if (!c.name) continue;
    if (c.name === STRICT_NAME || c.name.toLowerCase() === STRICT_NAME.toLowerCase()) {
      console.log('[videos-tablet] pickFrontScreenMesh: selected strict name', c.name);
      return c.mesh;
    }
  }
  // 2) prefer other well-known names in the list
  for (const c of allowed) {
    if (!c.name) continue;
    if (PREFERRED_NAMES.includes(c.name) || PREFERRED_NAMES.includes(c.name.toLowerCase())) return c.mesh;
  }

  // 2) material-name match
  for (const c of allowed) {
    if (PREFERRED_MATERIALS.includes(c.materialName)) return c.mesh;
  }

  // 4) name substring heuristic (e.g., contains 'screen' or 'tablet')
  for (const c of allowed) {
    if (/screen|display|tablet/i.test(c.name || '')) return c.mesh;
  }

  // 4) fallback: largest XY bounding-area among allowed meshes
  let best = null;
  let bestArea = 0;
  for (const c of allowed) {
    const g = c.mesh.geometry;
    try { if (g && !g.boundingBox && typeof g.computeBoundingBox === 'function') g.computeBoundingBox(); } catch (e) { /* ignore */ }
    if (!g || !g.boundingBox) continue;
    const bb = g.boundingBox;
    const dx = Math.abs(bb.max.x - bb.min.x);
    const dy = Math.abs(bb.max.y - bb.min.y);
    const area = dx * dy;
    if (area > bestArea) { bestArea = area; best = c.mesh; }
  }
  if (best) return best;
  // If we have forbidden candidates and no allowed candidates, log a helpful warning
  if (forbiddenCandidates && forbiddenCandidates.length && !allowed.length) {
    console.warn('[videos-tablet] All candidate screen meshes matched forbidden pattern; first forbidden:', forbiddenCandidates[0].name);
  }
  // no valid candidates
  return null;
}
