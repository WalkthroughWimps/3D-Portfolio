// videos.js — minimal orchestrator for the Videos page (clean, minimal debug panel)
/* eslint-disable no-unused-vars */
import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import VideoPlayer from './video-player-controls.js?v=tablet-ui-1';
import { createVideoControlsUI } from './shared-video-controls.js';
import { loadTabletGlb, initTabletFromGltf, applyBlenderAlignment } from './videos-tablet.js';
import { createVideosVideoAdapter } from './videos-video-adapter.js';
import { assetUrl } from './assets-config.js';

console.log('%c[videos] boot OK', 'color:#ff9f1a;font-weight:700;', { ts: Date.now() });

const USE_SHARED_CONTROLS = true;

const videosPageConfig = {
  intro: {
    enabled: true,
    video: assetUrl('Renders/tablet-animation.webm'),
    audio: assetUrl('Renders/tablet_animation_1.opus'),
    maxWaitMs: 12000,
    dropDurationMs: 1200,
    dropOffsetFactor: 2.2
  },
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

const introState = {
  enabled: !!(videosPageConfig && videosPageConfig.intro && videosPageConfig.intro.enabled),
  done: !(videosPageConfig && videosPageConfig.intro && videosPageConfig.intro.enabled),
  videoEl: null,
  audioEl: null,
  timeoutId: null,
  audioTimer: null,
  forceReadyTimer: null,
  audioStarted: false,
  skipBtn: null,
  gateEl: null,
  playBtn: null,
  loadBar: null,
  loadText: null,
  gateShown: false
};

const dropAnim = {
  active: false,
  ready: false,
  start: 0,
  durationMs: (videosPageConfig && videosPageConfig.intro && videosPageConfig.intro.dropDurationMs) || 1200,
  fromY: 0,
  toY: 0,
  group: null
};

function tryStartDrop() {
  if (!introState.done || !dropAnim.ready || dropAnim.active || !dropAnim.group) return;
  dropAnim.active = true;
  dropAnim.start = performance.now();
}

function markIntroDone() {
  if (introState.done) return;
  introState.done = true;
  try { document.body.dataset.introDone = 'true'; } catch (e) { /* ignore */ }
  if (introState.timeoutId) {
    clearTimeout(introState.timeoutId);
    introState.timeoutId = null;
  }
  if (introState.audioTimer) {
    clearTimeout(introState.audioTimer);
    introState.audioTimer = null;
  }
  if (introState.forceReadyTimer) {
    clearTimeout(introState.forceReadyTimer);
    introState.forceReadyTimer = null;
  }
  if (introState.videoEl) {
    introState.videoEl.classList.remove('visible');
    introState.videoEl.classList.add('hidden');
    try {
      introState.videoEl.pause();
    } catch (e) { /* ignore */ }
  }
  if (introState.audioEl) {
    try { introState.audioEl.pause(); } catch (e) { /* ignore */ }
  }
  if (introState.skipBtn) {
    introState.skipBtn.classList.add('hidden');
  }
  if (introState.gateEl) {
    introState.gateEl.classList.add('hidden');
  }
  tryStartDrop();
}

function getStoredSyncMs() {
  try {
    const v = localStorage.getItem('site.audio.sync');
    if (v === null) {
      localStorage.setItem('site.audio.sync', '-270');
      return -270;
    }
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : -270;
  } catch (e) {
    return -270;
  }
}

function getStoredAudioSettings() {
  const AUDIO_VOLUME_KEY = 'site.audio.volume';
  const AUDIO_MUTED_KEY = 'site.audio.muted';
  try {
    const volume = Math.max(0, Math.min(1, parseFloat(localStorage.getItem(AUDIO_VOLUME_KEY) || '1')));
    const muted = localStorage.getItem(AUDIO_MUTED_KEY) === 'true';
    return { volume, muted };
  } catch (e) {
    return { volume: 1, muted: false };
  }
}

function startIntroAudio(videoEl) {
  if (!introState.audioEl || introState.audioStarted) return;
  const audioEl = introState.audioEl;
  const stored = getStoredAudioSettings();
  const safeVol = Math.max(0, Math.min(1, stored.volume || 0));
  try { audioEl.volume = stored.muted ? 0 : safeVol; } catch (e) { /* ignore */ }
  try { audioEl.muted = !!stored.muted; } catch (e) { /* ignore */ }
  if (stored.muted || safeVol <= 0.001) return;
  const syncMs = getStoredSyncMs();
  const ct = videoEl && Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
  introState.audioStarted = true;
  if (syncMs >= 0) {
    if (audioEl.readyState >= 1) {
      try { audioEl.currentTime = ct; } catch (e) { /* ignore */ }
    }
    introState.audioTimer = setTimeout(() => {
      try {
        const p = audioEl.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => { introState.audioStarted = false; });
        }
      } catch (e) { introState.audioStarted = false; }
    }, syncMs);
  } else {
    const offset = Math.abs(syncMs) / 1000;
    if (audioEl.readyState >= 1) {
      try { audioEl.currentTime = ct + offset; } catch (e) { /* ignore */ }
    }
    try {
      const p = audioEl.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => { introState.audioStarted = false; });
      }
    } catch (e) { introState.audioStarted = false; }
  }
}

function setupIntroVideo() {
  if (!introState.enabled) return;
  const videoEl = document.getElementById('tabletIntro');
  if (!videoEl) {
    markIntroDone();
    return;
  }
  let allowSound = false;
  try {
    allowSound = (new URLSearchParams(location.search)).get('sound') === '1'
      || localStorage.getItem('site.audio.allowed') === 'true';
  } catch (e) { /* ignore */ }
  introState.videoEl = videoEl;
  videoEl.crossOrigin = 'anonymous';
  videoEl.src = videosPageConfig.intro.video;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.classList.add('visible');
  videoEl.load();
  if (allowSound && videosPageConfig.intro && videosPageConfig.intro.audio) {
    const audioEl = document.createElement('audio');
    audioEl.crossOrigin = 'anonymous';
    audioEl.preload = 'auto';
    audioEl.src = videosPageConfig.intro.audio;
    audioEl.crossOrigin = 'anonymous';
    introState.audioEl = audioEl;
    document.body.appendChild(audioEl);
    try { audioEl.load(); } catch (e) { /* ignore */ }
  }
  const finishOnce = () => markIntroDone();
  videoEl.addEventListener('ended', finishOnce, { once: true });
  videoEl.addEventListener('error', finishOnce, { once: true });
  videoEl.addEventListener('play', () => {
    startIntroAudio(videoEl);
    if (!introState.timeoutId) {
      introState.timeoutId = setTimeout(finishOnce, videosPageConfig.intro.maxWaitMs || 6000);
    }
  }, { once: true });
  videoEl.addEventListener('timeupdate', () => {
    if (!introState.audioStarted) startIntroAudio(videoEl);
  });
  const gate = document.getElementById('introGate');
  const playBtn = document.getElementById('introPlay');
  const loadBar = document.getElementById('introLoadBar');
  const loadText = document.getElementById('introLoadText');
  introState.gateEl = gate || null;
  introState.playBtn = playBtn || null;
  introState.loadBar = loadBar || null;
  introState.loadText = loadText || null;
  if (gate) {
    gate.classList.remove('hidden');
    introState.gateShown = true;
  }
  if (playBtn) {
    playBtn.disabled = true;
    playBtn.addEventListener('click', () => {
      if (introState.done) return;
      if (playBtn.disabled) return;
      try { videoEl.play(); } catch (e) { /* ignore */ }
      startIntroAudio(videoEl);
      if (!introState.timeoutId) {
        introState.timeoutId = setTimeout(finishOnce, videosPageConfig.intro.maxWaitMs || 6000);
      }
      if (introState.gateEl) introState.gateEl.classList.add('hidden');
    });
  }
  const updateLoad = () => {
    if (!introState.loadBar || !introState.loadText) return;
    const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
    let ratio = 0;
    let ready = false;
    if (duration > 0 && videoEl.buffered && videoEl.buffered.length) {
      const end = videoEl.buffered.end(videoEl.buffered.length - 1);
      ratio = Math.max(0, Math.min(1, end / duration));
      ready = ratio >= 0.98;
    } else if (videoEl.readyState >= 3) {
      ratio = 1;
      ready = true;
    } else if (videoEl.readyState >= 2) {
      ratio = Math.max(ratio, 0.7);
      ready = true;
    } else if (videoEl.readyState >= 1) {
      ratio = 0.35;
    }
    introState.loadBar.style.width = `${Math.round(ratio * 100)}%`;
    if (introState.playBtn) introState.playBtn.disabled = !ready;
    introState.loadText.textContent = ready ? 'Ready' : 'Loading…';
  };
  videoEl.addEventListener('progress', updateLoad);
  videoEl.addEventListener('loadedmetadata', updateLoad);
  videoEl.addEventListener('loadeddata', updateLoad);
  videoEl.addEventListener('durationchange', updateLoad);
  videoEl.addEventListener('canplay', updateLoad);
  videoEl.addEventListener('canplaythrough', updateLoad);
  videoEl.addEventListener('stalled', updateLoad);
  updateLoad();
  if (!introState.forceReadyTimer) {
    const readyFallbackMs = 5000;
    introState.forceReadyTimer = setTimeout(() => {
      if (introState.done) return;
      if (introState.loadBar) introState.loadBar.style.width = '100%';
      if (introState.loadText) introState.loadText.textContent = 'Ready';
      if (introState.playBtn) introState.playBtn.disabled = false;
    }, readyFallbackMs);
  }
}

function setupIntroSkip() {
  const btn = document.getElementById('introSkip');
  introState.skipBtn = btn || null;
  if (!btn) return;
  if (!introState.enabled) {
    btn.classList.add('hidden');
    return;
  }
  btn.addEventListener('click', () => {
    markIntroDone();
  });
  const placeNearNav = () => {
    const navBg = document.querySelector('.navigation-bg');
    if (!navBg || !introState.skipBtn) return false;
    const rect = navBg.getBoundingClientRect();
    const btnRect = introState.skipBtn.getBoundingClientRect();
    const gap = Math.max(10, Math.round(rect.height * 0.12));
    const left = Math.max(8, Math.round(rect.left - btnRect.width - gap));
    const top = Math.round(rect.top + (rect.height - btnRect.height) / 2);
    introState.skipBtn.style.left = `${left}px`;
    introState.skipBtn.style.top = `${Math.max(8, top)}px`;
    return true;
  };
  const startPlacement = () => {
    if (!placeNearNav()) {
      const timer = setInterval(() => {
        if (placeNearNav()) clearInterval(timer);
      }, 250);
      setTimeout(() => clearInterval(timer), 6000);
    }
  };
  startPlacement();
  window.addEventListener('resize', () => placeNearNav());
  window.addEventListener('keydown', (e) => {
    if (introState.done) return;
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      markIntroDone();
    }
  });
}

function onReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

onReady(() => {
  if (!introState.enabled) {
    try { document.body.dataset.introDone = 'true'; } catch (e) { /* ignore */ }
  }
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
  setupIntroVideo();
  setupIntroSkip();

  function animate() {
    try { if (controls && typeof controls.update === 'function') controls.update(); if (camera) renderer.render(scene, camera); }
    catch (e) { /* ignore */ }
    if (dropAnim.active && dropAnim.group) {
      const t = Math.min(1, (performance.now() - dropAnim.start) / dropAnim.durationMs);
      const k = 1 - Math.pow(1 - t, 3);
      const y = dropAnim.fromY + (dropAnim.toY - dropAnim.fromY) * k;
      dropAnim.group.position.y = y;
      dropAnim.group.updateMatrixWorld(true);
      if (t >= 1) dropAnim.active = false;
    }
    animId = requestAnimationFrame(animate);
  }

  const primaryPath = assetUrl('glb/video-tablet.glb');
  const allowSound = (new URLSearchParams(location.search)).get('sound') === '1' || localStorage.getItem('site.audio.allowed') === 'true';

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
              const gridApi = VideoPlayer.createGrid(refs.screenMesh, renderer, refs.camera, refs.tabletGroup, videosPageConfig, { allowSound, replaceScreenMaterial: true });
              if (USE_SHARED_CONTROLS && gridApi) {
                const adapter = createVideosVideoAdapter({
                  getActiveVideo: () => gridApi.getActiveVideo?.(),
                  getActiveAudio: () => gridApi.getActiveAudio?.(),
                  getViewportRect: () => gridApi.getViewportRect?.(),
                  getAudioSettings: () => gridApi.getAudioSettings?.(),
                  setVolume: (v) => gridApi.setVolumeRatio?.(v),
                  toggleMute: () => gridApi.toggleMute?.(),
                  setPlaybackRate: (rate) => gridApi.setPlaybackRate?.(rate),
                  exit: () => gridApi.exitPlayback?.()
                });
                const ui = createVideoControlsUI({ enablePointer: false });
                ui.setViewportRectProvider(adapter.getViewportRect);
                ui.onAction = (action) => adapter.dispatch(action);
                gridApi.setSharedControls?.(ui, adapter);
                console.log('%c[videos] shared controls ENABLED', 'color:#00ff66;font-weight:bold');
              } else {
                console.log('%c[videos] legacy controls ENABLED', 'color:#ffaa00;font-weight:bold');
              }

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

        try { applyBlenderAlignment({ tabletGroupRef: refs.tabletGroup, camera: refs.camera, controls, renderer, videosPageConfig }); } catch (e) { /* ignore */ }
        try {
          if (introState.enabled && refs && refs.tabletGroup) {
            const box = new THREE.Box3().setFromObject(refs.tabletGroup);
            const size = new THREE.Vector3();
            box.getSize(size);
            const offsetFactor = (videosPageConfig.intro && Number.isFinite(videosPageConfig.intro.dropOffsetFactor))
              ? videosPageConfig.intro.dropOffsetFactor
              : 0.85;
            const finalY = refs.tabletGroup.position.y;
            const startY = finalY + size.y * offsetFactor;
            dropAnim.group = refs.tabletGroup;
            dropAnim.fromY = startY;
            dropAnim.toY = finalY;
            dropAnim.durationMs = videosPageConfig.intro.dropDurationMs || dropAnim.durationMs;
            dropAnim.ready = true;
            refs.tabletGroup.position.y = startY;
            refs.tabletGroup.updateMatrixWorld(true);
            tryStartDrop();
          }
        } catch (e) { console.warn('[videos] intro drop setup failed', e); }

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
