// videos-tablet.js
// Helpers for GLB/tablet handling extracted from videos.js
import * as THREE from 'three';
import { computeScreenUvBounds } from '../_7-shared-scripts/scene/screen-surface.js';
export { computeScreenUvBounds, createMaskTextureForPlane, createTabletRaycaster, applyScreenCanvasTexture, createScreenOverlay, createScreenOverlayPlane, createPlanarOverlay } from '../_7-shared-scripts/scene/screen-surface.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { assetUrl, corsProbe, isLocalDev } from '../_7-shared-scripts/assets-config.js';
import { applyStandardGlbMouseControlMode, installStandardGlbMouseControls } from '../_7-shared-scripts/shared-glb-mouse-controls.js';

const DEBUG_PINK_RECT = false; // draw a diagnostic 16:9 plane in front of the screen
const SCREEN_W = 5.1520628;
const SCREEN_H_TARGET = 2.898035369653893; // 16:9 height derived from screen width
const NORMALIZE_SCREEN_UV = true;
let didLogScreenUv = false;
THREE.DefaultLoadingManager.setURLModifier((url) => assetUrl(url));

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
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    applyStandardGlbMouseControlMode(controls, { enabled: true, allowRotate: true, allowZoom: true });
    try {
      controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
      controls.screenSpacePanning = true;
    } catch (e) { /* ignore */ }
    // Sensible defaults; page-level tablet settings take precedence. The
    // previous lookup ignored `tabletAlignment`, leaving the Videos tablet at
    // a 0.5-unit minimum and allowing the camera to enter the display.
    const controlConfig = (config && config.tabletAlignment && config.tabletAlignment.controls)
      || (config && config.controls)
      || config
      || {};
    controls.minDistance = Number.isFinite(controlConfig.minDistance) ? controlConfig.minDistance : 0.5;
    controls.maxDistance = Number.isFinite(controlConfig.maxDistance) ? controlConfig.maxDistance : 10.0;
    controls.rotateSpeed = Number.isFinite(controlConfig.rotateSpeed) ? controlConfig.rotateSpeed : 0.65;
    controls.zoomSpeed = Number.isFinite(controlConfig.zoomSpeed) ? controlConfig.zoomSpeed : 0.9;

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
    function raycastModelHit(clientX, clientY) {
      const rect = domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = tabletGroup ? raycaster.intersectObject(tabletGroup, true) : [];
      return hits.length ? hits[0] : null;
    }
    controls.userData = controls.userData || {};
    controls.userData.raycastModelHit = raycastModelHit;
    controls.userData.sharedMouse = installStandardGlbMouseControls({
      controls,
      domElement,
      canInteract: () => !!(controls && controls.enabled)
    });
    return controls;
  } catch (e) {
    console.warn('setupTabletControls failed:', e);
    return null;
  }
}

// Create a raycaster helper for the tablet screen. Returns { hitFromEvent(ev, rect) }
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
    const enc = (p) => encodeURI(assetUrl(p));
    const resolved = enc(path);
    loader.load(resolved, onLoaded, onProgress, onError || ((e) => {
      console.error('GLTF LOAD FAILED:', resolved, e);
    }));
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
