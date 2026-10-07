import { bootstrapPage } from '../_7-shared-scripts/core/bootstrap.js';
void bootstrapPage({ pageId: 'videos' }).catch(error => console.error('Shared bootstrap failed', error));
import { previewSegments } from './preview-segments.js';
import { getEffectiveAudioSettings } from '../_7-shared-scripts/audio-settings.js';
import { getSharedSettings } from '../_7-shared-scripts/core/settings.js';
import { getSyncOffsetMs } from '../_7-shared-scripts/global-sync.js';
import { createTabletFocus } from './tablet-focus.js';
﻿// videos.js — minimal orchestrator for the Videos page (clean, minimal debug panel)
/* eslint-disable no-unused-vars */
import * as THREE from 'three';
import VideoPlayer from '../_7-shared-scripts/video-player-controls.js?v=tablet-ui-1';
import { createVideoControlsUI } from '../_7-shared-scripts/shared-video-controls.js';
import { loadTabletGlb, initTabletFromGltf, applyBlenderAlignment } from './videos-tablet.js';
import { createVideosVideoAdapter } from './videos-video-adapter.js';
import { assetUrl, corsProbe, isLocalDev } from '../_7-shared-scripts/assets-config.js';
import { ensureAudioConsentPrompt, isAudioAllowed, onAudioConsentChange } from '../_7-shared-scripts/audio-consent.js';

console.log('%c[videos] boot OK', 'color:#ff9f1a;font-weight:700;', { ts: Date.now() });

const USE_SHARED_CONTROLS = true;

const videosPageConfig = {
  intro: {
    enabled: true,
    video: assetUrl('../Renders/tablet-animation.webm'),
    audio: assetUrl('../Renders/tablet_animation_1.opus'),
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
    },
    // Keep orbiting useful without allowing the camera to enter the tablet
    // and expose the display overlay at an unusable grazing angle.
    controls: {
      minDistance: 5.5,
      maxDistance: 14.0
    }
  }
};

if (isLocalDev() || new URLSearchParams(window.location.search || '').has('assetsDebug')) {
  corsProbe('../Renders/tablet-animation.webm');
  corsProbe('../Renders/tablet_animation_1.opus');
}

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
  phase: 'loading',
  completionReason: null,
  startPending: false,
  audioRequested: false,
  audioPlayPending: false,
  audioGeneration: 0,
  audioPlaying: false,
  audioBlocked: false,
  readyTimer: null,
  timers: [],
  cleanups: [],
  listeners: [],
  unsubscribeConsent: null,
  unsubscribeSettings: null,
  onTerminal: null,
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

function markIntroDone(reason = 'skip') {
  if (introState.done) return;
  introState.done = true;
  introState.phase = reason === 'ended' ? 'completed' : 'skipped';
  introState.completionReason = reason;
  try { document.body.dataset.introDone = 'true'; } catch (e) { /* ignore */ }
  try { document.body.dataset.introCompletionReason = reason; } catch (e) { /* ignore */ }
  if (introState.readyTimer) clearTimeout(introState.readyTimer);
  introState.timers.splice(0).forEach(clearTimeout);
  introState.cleanups.splice(0).forEach(cleanup => cleanup());
  introState.readyTimer = null;
  introState.unsubscribeConsent?.();
  introState.unsubscribeSettings?.();
  introState.unsubscribeConsent = introState.unsubscribeSettings = null;
  introState.listeners.splice(0).forEach(([target, type, fn]) => target.removeEventListener(type, fn));
  if (introState.videoEl) {
    introState.videoEl.classList.remove('visible');
    introState.videoEl.classList.add('hidden');
    try {
      introState.videoEl.pause();
    } catch (e) { /* ignore */ }
  }
  if (introState.audioEl) {
    introState.audioGeneration++;
    introState.audioPlayPending = false;
    const audioEl = introState.audioEl;
    const endingAudioSettings = getStoredAudioSettings();
    const audioTail = reason === 'ended' && isAudioAllowed() && !audioEl.paused && !endingAudioSettings.muted && Number(endingAudioSettings.volume) > 0.001 && Number.isFinite(audioEl.duration) && audioEl.currentTime < audioEl.duration - 0.01;
    if (audioTail) {
      audioEl.addEventListener('ended', () => {
        try { audioEl.removeAttribute('src'); audioEl.load(); } catch (e) { /* ignore */ }
        introState.audioEl = null; introState.audioPlaying = false; introState.audioRequested = false;
      }, { once: true });
    } else {
      try { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); } catch (e) { /* ignore */ }
      introState.audioEl = null;
    }
  }
  if (introState.skipBtn) {
    introState.skipBtn.classList.add('hidden');
  }
  if (introState.gateEl) {
    introState.gateEl.classList.add('is-hidden');
  }
  tryStartDrop();
  introState.onTerminal?.(reason);
}

function getStoredSyncMs() { return getSyncOffsetMs(); }

function getStoredAudioSettings() {
  return getEffectiveAudioSettings();
}

function setupIntroVideo() {
  if (!introState.enabled) return;
  const videoEl = document.getElementById('tabletIntro');
  if (!videoEl) {
    introState.phase = 'error';
    return;
  }
  introState.videoEl = videoEl;
  videoEl.crossOrigin = 'anonymous';
  videoEl.src = videosPageConfig.intro.video;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  videoEl.classList.add('visible');
  videoEl.preload = 'auto';
  videoEl.load();
  const gate = document.getElementById('introGate');
  const playBtn = document.getElementById('introPlay');
  const loadBar = document.getElementById('introLoadBar');
  const loadText = document.getElementById('introLoadText');
  introState.gateEl = gate || null;
  introState.playBtn = playBtn || null;
  introState.loadBar = loadBar || null;
  introState.loadText = loadText || null;
  if (gate) {
    gate.classList.remove('is-hidden');
    gate.classList.remove('hidden');
    introState.gateShown = true;
  }
  if (playBtn) {
    playBtn.disabled = true;
  }
  const listen = (target, type, fn) => { target.addEventListener(type, fn); introState.listeners.push([target, type, fn]); };
  const showMessage = (message, { recoverable = false, sound = false } = {}) => {
    if (introState.loadText) introState.loadText.textContent = message;
    if (introState.gateEl) introState.gateEl.classList.remove('is-hidden');
    const silentBtn = document.getElementById('introContinueSilent');
    if (silentBtn) silentBtn.hidden = !sound;
    if (introState.playBtn) {
      introState.playBtn.textContent = sound ? 'Retry sound' : (recoverable ? 'Retry' : 'Play');
      introState.playBtn.disabled = sound || recoverable ? false : videoEl.readyState < 2;
    }
  };
  const stopIntroAudio = ({ clearRequest = true } = {}) => {
    introState.audioGeneration++;
    introState.audioPlayPending = false;
    introState.audioEl?.pause();
    introState.audioPlaying = false;
    if (clearRequest) introState.audioRequested = false;
  };
  const applyAudioSettings = () => {
    const audioEl = introState.audioEl;
    if (!audioEl) return;
    const consent = isAudioAllowed();
    const stored = getStoredAudioSettings();
    const volume = Math.max(0, Math.min(1, Number(stored.volume) || 0));
    audioEl.volume = volume;
    audioEl.playbackRate = videoEl.playbackRate || 1;
    if (!consent || stored.muted || volume <= 0.001) {
      stopIntroAudio(); audioEl.muted = true;
      if (!consent) introState.audioBlocked = false;
      return;
    }
    const syncSec = getStoredSyncMs() / 1000;
    const target = Math.max(0, videoEl.currentTime - syncSec);
    audioEl.muted = !introState.audioPlaying || videoEl.paused || videoEl.readyState < 2 ||
      audioEl.readyState < 2 || videoEl.currentTime < syncSec ||
      Math.abs(audioEl.currentTime - target) > 0.18;
  };
  const prepareAudio = () => {
    if (!isAudioAllowed() || !videosPageConfig.intro.audio) return;
    if (introState.audioEl) {
      if (introState.audioEl.error) { introState.audioEl.src = videosPageConfig.intro.audio; introState.audioEl.load(); }
      return;
    }
    const audioEl = document.createElement('audio');
    audioEl.crossOrigin = 'anonymous'; audioEl.preload = 'auto'; audioEl.src = videosPageConfig.intro.audio;
    audioEl.addEventListener('error', () => {
      if (introState.done) return;
      const started = !['loading', 'ready'].includes(introState.phase);
      stopIntroAudio();
      introState.audioBlocked = true;
      if (started && videoEl.paused) showMessage('Sound could not load. Retry sound or continue silently.', { sound: true });
    });
    audioEl.addEventListener('playing', () => {
      if (introState.done) { audioEl.pause(); return; }
      introState.audioPlaying = true;
      alignAudio();
    });
    audioEl.addEventListener('pause', () => { introState.audioPlaying = false; });
    audioEl.addEventListener('waiting', () => {
      if (introState.done || !introState.audioRequested) return;
      introState.audioPlaying = false;
      audioEl.muted = true;
    });
    introState.audioEl = audioEl;
    audioEl.load();
  };
  const alignAudio = () => {
    const audioEl = introState.audioEl;
    if (!audioEl || (!introState.audioPlaying && !introState.audioRequested) || audioEl.readyState < 1) return;
    const target = Math.max(0, videoEl.currentTime - getStoredSyncMs() / 1000);
    try { if (Math.abs(audioEl.currentTime - target) > 0.12) audioEl.currentTime = target; } catch (e) { /* wait for metadata */ }
    audioEl.playbackRate = videoEl.playbackRate || 1;
    applyAudioSettings();
  };
  const startAudioFromGesture = () => {
    prepareAudio(); applyAudioSettings();
    const audioEl = introState.audioEl;
    if (!audioEl || !isAudioAllowed()) return true;
    const settings = getStoredAudioSettings();
    if (settings.muted || Number(settings.volume) <= 0.001) return true;
    const syncMs = getStoredSyncMs();
    introState.audioRequested = true;
    introState.audioBlocked = false;
    audioEl.muted = true;
    if (audioEl.readyState >= 1) {
      try { audioEl.currentTime = Math.max(0, videoEl.currentTime - syncMs / 1000); } catch (e) { /* metadata race */ }
    }
    requestAudioPlayback(audioEl);
    return true;
  };
  const requestAudioPlayback = (audioEl) => {
    if (!audioEl || introState.audioPlayPending || introState.audioPlaying) return;
    const generation = ++introState.audioGeneration;
    introState.audioPlayPending = true;
    try {
      Promise.resolve(audioEl.play()).then(() => {
        if (generation !== introState.audioGeneration || !introState.audioRequested || !isAudioAllowed() || audioEl.paused) return;
        introState.audioPlayPending = false; introState.audioBlocked = false; introState.audioPlaying = true; alignAudio();
      }).catch(() => {
        if (generation !== introState.audioGeneration) return;
        introState.audioPlayPending = false; introState.audioPlaying = false;
        if (introState.audioRequested && isAudioAllowed()) {
          introState.audioBlocked = true;
          if (videoEl.paused) showMessage('Sound is blocked. Retry sound or continue silently.', { sound: true });
        }
      });
    } catch (error) {
      if (generation !== introState.audioGeneration) return;
      introState.audioPlayPending = false; introState.audioPlaying = false; introState.audioBlocked = true;
      if (videoEl.paused) showMessage('Sound is blocked. Retry sound or continue silently.', { sound: true });
    }
  };
  const startVideo = () => {
    if (introState.done || introState.startPending) return;
    if (videoEl.error) { try { videoEl.load(); } catch (e) {} }
    introState.startPending = true; introState.phase = 'starting';
    if (introState.playBtn) introState.playBtn.disabled = true;
    try {
      const result = videoEl.play();
      Promise.resolve(result).then(() => {
        introState.startPending = false;
        if (introState.done) { videoEl.pause(); return; }
        introState.phase = 'playing';
        introState.gateEl?.classList.add('is-hidden');
      }).catch(() => {
        introState.startPending = false; introState.phase = 'blocked';
        stopIntroAudio();
        showMessage('Playback could not start. Retry when the video is ready, or Skip.', { recoverable: true });
      });
    } catch (error) {
      introState.startPending = false; introState.phase = 'blocked';
      stopIntroAudio();
      showMessage('Playback could not start. Retry when the video is ready, or Skip.', { recoverable: true });
    }
  };
  if (playBtn) listen(playBtn, 'click', () => {
    if (!startAudioFromGesture()) return;
    if (videoEl.paused) startVideo();
  });
  const continueSilent = document.getElementById('introContinueSilent');
  if (continueSilent) { continueSilent.hidden = true; listen(continueSilent, 'click', () => { stopIntroAudio(); introState.audioBlocked = false; introState.gateEl?.classList.add('is-hidden'); if (videoEl.paused) startVideo(); }); }
  listen(videoEl, 'ended', () => markIntroDone('ended'));
  listen(videoEl, 'playing', () => {
    if (introState.done) return;
    introState.startPending = false;
    introState.phase = 'playing';
    introState.gateEl?.classList.add('is-hidden');
    if (introState.audioRequested && isAudioAllowed()) { alignAudio(); requestAudioPlayback(introState.audioEl); }
  });
  listen(videoEl, 'waiting', () => { introState.phase = 'buffering'; stopIntroAudio({ clearRequest: false }); showMessage('Buffering… Playback will continue when the video is ready.'); });
  listen(videoEl, 'stalled', () => { if (!videoEl.paused) { introState.phase = 'buffering'; stopIntroAudio({ clearRequest: false }); showMessage('Buffering… Playback will continue when the video is ready.'); } });
  listen(videoEl, 'error', () => { introState.phase = 'error'; stopIntroAudio(); showMessage('The intro video could not load. Retry or Skip.', { recoverable: true }); });
  listen(videoEl, 'pause', () => { if (!introState.done && !videoEl.ended && !introState.startPending && !introState.audioBlocked) { introState.phase = 'paused'; stopIntroAudio({ clearRequest: false }); showMessage('Paused. Select Play to resume.'); } });
  listen(videoEl, 'timeupdate', alignAudio);
  listen(videoEl, 'ratechange', () => { if (introState.audioEl) introState.audioEl.playbackRate = videoEl.playbackRate || 1; alignAudio(); });
  listen(document, 'visibilitychange', () => { if (document.hidden && !introState.done && !videoEl.paused) { videoEl.pause(); introState.audioEl?.pause(); showMessage('Paused while this tab was hidden. Select Play to resume.'); } });
  introState.unsubscribeConsent = onAudioConsentChange((allowed) => {
    if (!allowed) { stopIntroAudio(); introState.audioBlocked = false; }
    else prepareAudio();
    applyAudioSettings();
  });
  introState.unsubscribeSettings = getSharedSettings().subscribe((snapshot, change) => {
    if (change.changed.some(key => key.startsWith('audio.'))) { applyAudioSettings(); alignAudio(); }
  });
  prepareAudio();
  const updateLoad = () => {
    if (!introState.loadBar || !introState.loadText) return;
    const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
    let ratio = 0;
    let ready = false;
    if (duration > 0 && videoEl.buffered && videoEl.buffered.length) {
      const end = videoEl.buffered.end(videoEl.buffered.length - 1);
      ratio = Math.max(0, Math.min(1, end / duration));
      ready = videoEl.readyState >= 2;
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
    if (introState.playBtn && !introState.startPending) { introState.playBtn.disabled = !ready; if (ready && ['loading','ready'].includes(introState.phase)) introState.playBtn.textContent = 'Play'; }
    if (introState.phase === 'loading' || introState.phase === 'ready') {
      introState.phase = ready ? 'ready' : 'loading';
      introState.loadText.textContent = ready ? 'Ready to play' : 'Loading video…';
    }
  };
  ['progress', 'loadedmetadata', 'loadeddata', 'durationchange', 'canplay', 'canplaythrough', 'stalled'].forEach(type => listen(videoEl, type, updateLoad));
  updateLoad();
  introState.readyTimer = setTimeout(() => {
    if (!introState.done && videoEl.readyState < 2) showMessage('Still loading. Keep waiting, Retry, or Skip.', { recoverable: true });
  }, 15000);
  introState.timers.push(introState.readyTimer);
}

function setupIntroSkip() {
  const btn = document.getElementById('introSkip');
  introState.skipBtn = btn || null;
  if (!btn) return;
  if (!introState.enabled) {
    btn.classList.add('hidden');
    return;
  }
  const listen = (target, type, fn) => { target.addEventListener(type, fn); introState.listeners.push([target, type, fn]); };
  listen(btn, 'click', () => markIntroDone('skip'));
  const placeNearNav = () => {
    if (window.innerWidth <= 768) {
      // Narrow navigation fills its own row; CSS places Skip below it.
      introState.skipBtn.style.removeProperty('left');
      introState.skipBtn.style.removeProperty('top');
      return true;
    }
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
        if (placeNearNav()) { clearInterval(timer); }
      }, 250);
      introState.cleanups.push(() => clearInterval(timer));
      const timeout = setTimeout(() => clearInterval(timer), 6000);
      introState.timers.push(timeout);
    }
  };
  startPlacement();
  listen(window, 'resize', () => placeNearNav());
  listen(window, 'keydown', (e) => {
    if (introState.done) return;
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      markIntroDone('skip');
    }
  });
}

function showLoadingUIImmediately() {
  try { document.documentElement.classList.remove('videos-boot'); } catch (e) { /* ignore */ }
  const gate = document.getElementById('introGate');
  const playBtn = document.getElementById('introPlay');
  const loadBar = document.getElementById('introLoadBar');
  const loadText = document.getElementById('introLoadText');
  if (gate) {
    gate.classList.remove('is-hidden');
    gate.classList.remove('hidden');
  }
  if (loadText) loadText.textContent = 'Loading...';
  if (loadBar) loadBar.style.width = '8%';
  if (playBtn) playBtn.disabled = true;
}

function onReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

onReady(async () => {
  showLoadingUIImmediately();
  await ensureAudioConsentPrompt({
    title: 'Allow sound?',
    message: 'This page can play sound for the Videos player. Allow audio playback?'
  });
  requestAnimationFrame(() => {
    // Delay heavy initialization slightly to allow first paint and make
    // the page interactive immediately. This prevents blocking the UI
    // when navigating from other pages.
    setTimeout(() => {
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

  let camera = null; let controls = null; let animId = null; let tabletFocus = null;

  let pendingRenderSize = null;
  const renderedSize = new THREE.Vector2();
  function resizeRenderer() {
    try {
      const w = window.innerWidth;
      const h = Math.max(1, window.innerHeight);
      pendingRenderSize = { w, h };
      if (camera && camera.isPerspectiveCamera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('resize', resizeRenderer);
  resizeRenderer();
  setupIntroVideo();
  setupIntroSkip();

  function animate() {
    // Resizing clears WebGL. Resize immediately before drawing, never in a
    // separate animation callback after the scene has already been rendered.
    if (pendingRenderSize) {
      renderer.getSize(renderedSize);
      if (renderedSize.x !== pendingRenderSize.w || renderedSize.y !== pendingRenderSize.h) {
        renderer.setSize(pendingRenderSize.w, pendingRenderSize.h, false);
      }
      pendingRenderSize = null;
    }
    try { if (controls?.enabled && typeof controls.update === 'function') controls.update(); if (camera) renderer.render(scene, camera); }
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

  const primaryPath = assetUrl('../assets/glb/video-tablet.glb');
  const allowSound = isAudioAllowed();

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
              const setTabletFocus = tabletFocus = createTabletFocus({ camera: refs.camera, controls: refs.controls, tabletGroup: refs.tabletGroup, screenMesh: refs.screenMesh, renderer });
              const gridApi = VideoPlayer.createGrid(refs.screenMesh, renderer, refs.camera, refs.tabletGroup, videosPageConfig, { allowSound, replaceScreenMaterial: true, previewSegments, setTabletFocus, deferPreloadUntilIntro: introState.enabled });
              if (USE_SHARED_CONTROLS && gridApi) {
                const adapter = createVideosVideoAdapter({
                  getActiveVideo: () => gridApi.getActiveVideo?.(),
                  getActivePreviewVideo: () => gridApi.getActivePreviewVideo?.(),
                  getActiveAudio: () => gridApi.getActiveAudio?.(),
                  getViewportRect: () => gridApi.getViewportRect?.(),
                  getAudioSettings: () => gridApi.getAudioSettings?.(),
                  getTitle: () => gridApi.getTitle?.(),
                  setVolume: (v) => gridApi.setVolumeRatio?.(v),
                  toggleMute: () => gridApi.toggleMute?.(),
                  setPlaybackRate: (rate) => gridApi.setPlaybackRate?.(rate),
                  getPreservePitch: () => gridApi.getPreservePitch?.(),
                  togglePitch: () => gridApi.togglePitch?.(),
                  getSyncMs: () => gridApi.getSyncMs?.(),
                  setSyncMs: (value) => gridApi.setSyncMs?.(value),
                  play: () => gridApi.playActiveVideo?.(),
                  pause: () => gridApi.pauseActiveVideo?.(),
                  isTabletView: () => gridApi.isTabletView?.(),
                  toggleTabletView: () => gridApi.toggleTabletView?.(),
                  exit: () => gridApi.exitPlayback?.()
                });
                const ui = createVideoControlsUI();
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
        tabletFocus?.initialize();
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

        if (!introState.preloadStarted) {
          introState.preloadStarted = true;
          introState.onTerminal = () => {
            if (introState.gridPreloadStarted) return;
            introState.gridPreloadStarted = true;
            window.__videoGridSchedulePreload?.();
          };
          if (introState.done) introState.onTerminal(introState.completionReason || 'disabled');
        }

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

    }, 50);
  });
});
