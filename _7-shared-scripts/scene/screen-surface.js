// Page-neutral screen canvas, overlay, and raycast primitives.
/* eslint-disable no-unused-vars -- preserves the moved legacy helper catch blocks */
import * as THREE from 'three';
const NORMALIZE_SCREEN_UV = true;
let didLogScreenUv = false;

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
