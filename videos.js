// videos.js — minimal orchestrator for the Videos page (clean, minimal debug panel)
/* eslint-disable no-unused-vars */
import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import VideoPlayer from './video-player-controls.js?v=tablet-ui-1';
import { loadTabletGlb, initTabletFromGltf, applyBlenderAlignment } from './videos-tablet.js';

const videosPageConfig = {
  intro: { enabled: false, video: 'Renders/tablet-animation.webm', maxWaitMs: 6000 },
  tabletAlignment: {
    enabled: true,
    autoFlip: false,
    screenMeshName: 'tablet_screen003',
    // Preserve legacy behavior choices from backups: prefer GLB camera when present
    forceBlenderPose: false,
    useGlbCamera: true,
    requireGlbCamera: true,
    camera: {
      fovY: 24.0,
      aspect: 1.777778,
      pos: { x: -0.232, y: 10.139, z: 4.770 },
      rotXYZ: { x: THREE.MathUtils.degToRad(-1.7), y: THREE.MathUtils.degToRad(2.8), z: THREE.MathUtils.degToRad(-0.1) }
    },
    tabletWorld: {
      pos: { x: 0.0, y: 0.0, z: 0.0 },
      rotXYZ: { x: 0.0, y: THREE.MathUtils.degToRad(180), z: THREE.MathUtils.degToRad(180) },
      scale: { x: 1.0, y: 1.0, z: 1.0 }
    },
    view: {
      distance: 10.44,
      azimuthOffsetDeg: 0.0,
      elevationOffsetDeg: 70.0
    }
  }
};

// Load saved tablet pose if present
try {
  const saved = localStorage.getItem('videosPage_tabletPose');
  if (saved) {
    try { videosPageConfig.tabletAlignment.tabletWorld = JSON.parse(saved); console.log('[videos] Loaded saved tablet pose'); } catch (e) { console.warn('Failed parse saved pose', e); }
  }
} catch (e) { /* ignore */ }

function onReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

onReady(() => {
  // ensure canvas
  let canvas = document.getElementById('glCanvas');
  if (!canvas) {
    try {
      const container = document.querySelector('.viewer-wrap') || document.querySelector('.tablet-stage') || document.body;
      canvas = document.createElement('canvas'); canvas.id = 'glCanvas'; canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.display = 'block'; canvas.setAttribute('aria-hidden','true');
      container.appendChild(canvas);
      console.warn('[videos] Created fallback #glCanvas');
    } catch (e) { console.warn('[videos] Failed create canvas', e); }
  }
  if (!canvas) return;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  try { renderer.outputColorSpace = THREE.SRGBColorSpace; } catch (e) { /* ignore */ }
  // Match backup renderer settings for better HDR/tone and shadow support
  try { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; } catch (e) { /* ignore */ }
  try { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; } catch (e) { /* ignore */ }
  try { renderer.physicallyCorrectLights = true; } catch (e) { /* ignore */ }

  const scene = new THREE.Scene();
  // Lighting rig: hemisphere + key + fill + rim + under + subtle ambient
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.85);
  scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.25); // primary (shadow) light
  keyLight.position.set(4, 6, 8);
  keyLight.castShadow = true;
  try { keyLight.shadow.mapSize.set(2048, 2048); keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 30; } catch (e) { /* ignore */ }
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
  fillLight.position.set(-6, 3, -4);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
  rimLight.position.set(0, 5, -8);
  scene.add(rimLight);
  // Soft underlight to gently illuminate the underside/front when tilted down
  const underLight = new THREE.DirectionalLight(0xffffff, 0.35);
  underLight.position.set(0, -3, 2);
  scene.add(underLight);
  scene.add(underLight.target);
  const subtleAmbient = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(subtleAmbient);

  let camera = null; let controls = null; let animId = null;

  function resizeRenderer() {
    try {
      const w = window.innerWidth;
      const headerEl = document.querySelector('.header') || document.getElementById('patterned-background');
      const headerRect = headerEl && headerEl.getBoundingClientRect ? headerEl.getBoundingClientRect() : { bottom: 0 };
      const availH = Math.max(1, window.innerHeight - Math.max(0, Math.round(headerRect.bottom || 0)));
      try { const stage = document.querySelector('.tablet-stage'); if (stage && stage.style) { stage.style.top = (headerRect.bottom||0)+'px'; stage.style.height = availH+'px'; } } catch (e) {}
      renderer.setSize(w, availH, false);
      if (camera && camera.isPerspectiveCamera) { camera.aspect = w / availH; camera.updateProjectionMatrix(); }
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('resize', resizeRenderer);
  resizeRenderer();

  function animate() {
    try { if (controls && typeof controls.update === 'function') controls.update(); if (camera) renderer.render(scene, camera); }
    catch (e) { /* ignore */ }
    // update debug UI
    try {
      const camEl = document.getElementById('tp_camera');
      const tabEl = document.getElementById('tp_tablet');
      if (camEl && camera) {
        const x = (Math.abs(camera.position.x) < 0.5) ? 0 : Number(camera.position.x.toFixed(1));
        camEl.textContent = `cam: ${x}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`;
      }
      try {
        const refs = window.__videos_debug && window.__videos_debug._refs ? window.__videos_debug._refs : null;
        if (tabEl && refs && refs.tabletGroup) {
          const p = refs.tabletGroup.position; const ry = (refs.tabletGroup.rotation && refs.tabletGroup.rotation.y) ? (refs.tabletGroup.rotation.y * 180 / Math.PI) : 0;
          tabEl.textContent = `tablet: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  rotY:${ry.toFixed(1)}°`;
        }
      } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }

    animId = requestAnimationFrame(animate);
  }

  const primaryPath = (window && window.mediaUrl) ? window.mediaUrl('glb/video-tablet.glb') : 'glb/video-tablet.glb';
  const allowSound = (new URLSearchParams(location.search)).get('sound') === '1' || localStorage.getItem('allowSound') === 'true';

  // load GLB and init
  const doLoadGlb = () => {
    loadTabletGlb(primaryPath, (gltf) => {
      try {
        const refs = initTabletFromGltf(gltf, { scene, renderer, canvas, underLight: null, videosPageConfig });
        window.__videos_debug = window.__videos_debug || {};
        window.__videos_debug._refs = refs;

        try { camera = refs.camera || camera; } catch (e) {}
        try { controls = refs.controls || controls; } catch (e) {}
        resizeRenderer(); if (!animId) animate();

        // If GLB provided a dolly/embedded camera, prefer it and enforce
        // the reference pose from the provided screenshot so the tablet
        // appears upright and framed as expected.
        try {
          if (refs && refs.camera && refs.camera.userData && refs.camera.userData.comesFromGLB) {
            // Reference pose (from user's screenshot)
            const refCamPos = new THREE.Vector3(0, -1.9, -6.1);
            const refTarget = new THREE.Vector3(-0.0, -0.2, 0.1);
            try {
              refs.camera.position.copy(refCamPos);
              if (refs.controls && refs.controls.target) refs.controls.target.copy(refTarget);
              if (refs.tabletGroup) {
                // Apply tablet rotation from config if present (saved backup),
                // otherwise fall back to legacy double-flip (Y=180°, Z=180°)
                try {
                  const tcfg = videosPageConfig && videosPageConfig.tabletAlignment && videosPageConfig.tabletAlignment.tabletWorld;
                  if (tcfg && tcfg.rotXYZ) {
                    refs.tabletGroup.rotation.set(tcfg.rotXYZ.x || 0, tcfg.rotXYZ.y || 0, tcfg.rotXYZ.z || 0);
                  } else {
                    refs.tabletGroup.rotation.set(0, Math.PI, Math.PI);
                  }
                } catch (e) {
                  try { refs.tabletGroup.rotation.y = Math.PI; refs.tabletGroup.rotation.z = Math.PI; } catch (ee) { /* ignore */ }
                }
                refs.tabletGroup.updateMatrixWorld(true);
              }
              if (refs.camera.isPerspectiveCamera) refs.camera.updateProjectionMatrix();
              try { if (refs.controls) refs.controls.update(); } catch (e) {}
              console.log('[videos] Applied reference GLB camera pose from screenshot');
            } catch (e) { console.warn('[videos] failed applying reference pose', e); }
          }
        } catch (e) { /* ignore */ }

        // apply saved pose if present
        try {
          const cfgPose = videosPageConfig && videosPageConfig.tabletAlignment && videosPageConfig.tabletAlignment.tabletWorld;
          if (cfgPose && refs && refs.tabletGroup) {
            try {
              if (cfgPose.pos) refs.tabletGroup.position.set(cfgPose.pos.x||0,cfgPose.pos.y||0,cfgPose.pos.z||0);
              if (cfgPose.rotXYZ) refs.tabletGroup.rotation.set(cfgPose.rotXYZ.x||0,cfgPose.rotXYZ.y||0,cfgPose.rotXYZ.z||0);
              if (cfgPose.scale) refs.tabletGroup.scale.set(cfgPose.scale.x||1,cfgPose.scale.y||1,cfgPose.scale.z||1);
              refs.tabletGroup.updateMatrixWorld(true);
            } catch (e) { console.warn('Failed to apply saved pose', e); }
          }
        } catch (e) {}

        // create grid / UI on screen mesh
        try {
          if (refs && refs.screenMesh && refs.camera) {
            // Ensure the screen mesh is oriented toward the camera. If the
            // mesh's surface normal points away from the camera, rotate it
            // 180deg around Y so the front face faces the camera. This
            // matches previous behavior where `tablet_screen003` faced camera.
            try {
              const sm = refs.screenMesh;
              const cam = refs.camera;
              const worldPos = sm.getWorldPosition(new THREE.Vector3());
              const toCam = new THREE.Vector3().subVectors(cam.position, worldPos).normalize();
              const worldQuat = sm.getWorldQuaternion(new THREE.Quaternion());
              const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat).normalize();
              if (normal.dot(toCam) < 0) {
                console.log('[videos] screenMesh appears back-facing to camera — deferring flip to overlay creation');
              }
            } catch (e) { /* ignore orientation check errors */ }

            if (VideoPlayer && typeof VideoPlayer.createGrid === 'function') {
              VideoPlayer.createGrid(refs.screenMesh, renderer, refs.camera, refs.tabletGroup, videosPageConfig, { allowSound, replaceScreenMaterial: true });

              // Detect whether the screen is upside-down relative to the
              // camera (screen local +Y should point roughly toward camera
              // up in camera space). If upside-down, flip the tablet around
              // its local Z by 180° so the UI appears upright.
              try {
                const screen = refs.screenMesh;
                const cam = refs.camera;
                if (screen && cam) {
                  const centerWorld = screen.getWorldPosition(new THREE.Vector3());
                  const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(screen.getWorldQuaternion(new THREE.Quaternion())).normalize();
                  // Map two world points into camera local space to get up vector in camera coords
                  const pA = centerWorld.clone();
                  const pB = centerWorld.clone().add(upWorld);
                  const aCam = cam.worldToLocal(pA.clone());
                  const bCam = cam.worldToLocal(pB.clone());
                  const upCam = bCam.sub(aCam).normalize();
                  // If the up vector in camera space points downward (y < 0), it's upside-down
                  if (upCam.y < -0.05) {
                    console.log('[videos] detected upside-down screen — rotating tablet 180° around local Z');
                    // Rotate around tablet's local Z by PI
                    try {
                      refs.tabletGroup.rotation.z += Math.PI;
                      refs.tabletGroup.updateMatrixWorld(true);
                    } catch (e) { console.warn('failed flip tablet', e); }
                  }
                }
              } catch (e) { /* ignore detection errors */ }
            }
          }
        } catch (e) { console.warn('createGrid failed', e); }

        // minimal debug panel: camera + tablet + enable-pan (tablet pan)
        try {
          if (!document.getElementById('tablet-debug-panel')) {
            const dp = document.createElement('div');
            dp.id = 'tablet-debug-panel';
            dp.style.cssText = 'position:fixed;right:12px;top:84px;z-index:80;background:rgba(0,0,0,0.6);color:#fff;padding:8px;border-radius:8px;font:12px/1.2 monospace;max-width:260px;';
            dp.innerHTML = `
              <div id="tp_camera">cam:</div>
              <div id="tp_tablet" style="margin-top:6px">tablet:</div>
              <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
                <button id="tp_toggle_pan">Enable Pan</button>
                <button id="tp_toggle_underlight">UnderLight: On</button>
              </div>`;
            document.body.appendChild(dp);

            // Underlight toggle: allow quick on/off for visual testing
            try {
              const underBtn = document.getElementById('tp_toggle_underlight');
              if (underBtn && typeof underLight !== 'undefined') {
                const prev = { intensity: underLight.intensity };
                underBtn.addEventListener('click', () => {
                  try {
                    if ((underLight.intensity || 0) > 0.001) {
                      underLight.intensity = 0.0;
                      underBtn.textContent = 'UnderLight: Off';
                    } else {
                      underLight.intensity = prev.intensity || 0.35;
                      underBtn.textContent = 'UnderLight: On';
                    }
                    // force update
                    try { underLight.updateMatrixWorld && underLight.updateMatrixWorld(); } catch (e) {}
                  } catch (e) { /* ignore */ }
                });
              }
            } catch (e) { /* ignore underlight UI errors */ }

            // tablet-pan implementation: raycast to plane and move tabletGroup
            const toggle = document.getElementById('tp_toggle_pan');
            const state = { enabled:false, dragging:false, startPoint:new THREE.Vector3(), startPos:new THREE.Vector3(), plane:null };
            const domEl = renderer.domElement || document;

            toggle.addEventListener('click', () => {
              state.enabled = !state.enabled;
              toggle.textContent = state.enabled ? 'Disable Pan' : 'Enable Pan';
            });

            const pointerDown = (ev) => {
              try {
                if (!state.enabled || !refs || !refs.tabletGroup || !refs.camera) return;
                const rect = domEl.getBoundingClientRect();
                const ndc = new THREE.Vector2(((ev.clientX-rect.left)/rect.width)*2-1, -((ev.clientY-rect.top)/rect.height)*2+1);
                const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, refs.camera);
                const worldPos = new THREE.Vector3(); refs.tabletGroup.getWorldPosition(worldPos);
                const camDir = new THREE.Vector3(); refs.camera.getWorldDirection(camDir);
                state.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, worldPos);
                const inter = new THREE.Vector3();
                if (ray.ray.intersectPlane(state.plane, inter)) {
                  state.dragging = true; state.startPoint.copy(inter); state.startPos.copy(refs.tabletGroup.position);
                  ev.preventDefault();
                }
              } catch (e) { /* ignore */ }
            };
            const pointerMove = (ev) => {
              try {
                if (!state.dragging || !refs || !refs.tabletGroup || !refs.camera) return;
                const rect = domEl.getBoundingClientRect();
                const ndc = new THREE.Vector2(((ev.clientX-rect.left)/rect.width)*2-1, -((ev.clientY-rect.top)/rect.height)*2+1);
                const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, refs.camera);
                const inter = new THREE.Vector3();
                if (ray.ray.intersectPlane(state.plane, inter)) {
                  const delta = new THREE.Vector3().subVectors(inter, state.startPoint);
                  const newPos = new THREE.Vector3().addVectors(state.startPos, delta);
                  refs.tabletGroup.position.copy(newPos); refs.tabletGroup.updateMatrixWorld(true);
                  ev.preventDefault();
                }
              } catch (e) { /* ignore */ }
            };
            const pointerUp = () => { state.dragging = false; };

            domEl.addEventListener('pointerdown', pointerDown);
            domEl.addEventListener('pointermove', pointerMove);
            domEl.addEventListener('pointerup', pointerUp);
            domEl.addEventListener('pointercancel', pointerUp);
          }
        } catch (e) { /* ignore debug panel errors */ }

        try { applyBlenderAlignment({ tabletGroupRef: refs.tabletGroup, camera: refs.camera, controls, renderer, videosPageConfig }); } catch (e) { /* ignore */ }

      } catch (e) { console.warn('loadTabletGlb init failed', e); }
    }, undefined, (err) => { console.warn('Failed to load GLB', err); });
  };

  // start: lazy-load GLB only when the relevant container becomes visible.
  let __videos_glb_loaded = false;
  const __startGlbLoad = () => { if (__videos_glb_loaded) return; __videos_glb_loaded = true; try { doLoadGlb(); } catch (e) { console.warn('doLoadGlb failed', e); } };
  try {
    const container = document.querySelector('.tablet-stage') || document.querySelector('.viewer-wrap') || null;
    if (container && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) { __startGlbLoad(); io.disconnect(); } });
      }, { threshold: 0.01 });
      io.observe(container);
      // Also ensure if the page is already visible and container intersects immediately we load.
      // If IntersectionObserver fails to trigger within a few seconds, fall back to immediate load.
      setTimeout(() => { if (!__videos_glb_loaded) { try { const rect = container.getBoundingClientRect(); if (rect && rect.bottom > 0) __startGlbLoad(); } catch (e) {} } }, 2500);
    } else if (document.visibilityState === 'visible') {
      __startGlbLoad();
    } else {
      // No container found — preserve previous behavior and load immediately
      __startGlbLoad();
    }
  } catch (e) {
    try { __startGlbLoad(); } catch (ee) { /* ignore */ }
  }

  // reset helper
  window.resetGridInteraction = function resetGridInteraction() {
    try { const api = window.__tabletPlayerApi; if (api && typeof api.reset === 'function') return api.reset(); } catch (e) { /* ignore */ }
    console.log('resetGridInteraction: no player API available');
  };

});
