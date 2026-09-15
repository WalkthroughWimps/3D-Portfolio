console.log('%c[shared-video-controls] loaded', 'color:#00ffcc;font-weight:bold');
console.log('%c[shared-video-controls] primary API active', 'color:#00ccff;font-weight:bold');

// Shared video controls helpers (copied from video-player-controls.js).
import { isAudioAllowed } from './audio-consent.js';

export class PlayerState {
  constructor() {
    this.playingFull = false;
    this.fullIndex = -1;
    this.activeIndex = -1;
    this.seeking = false;
    this.controlsVisible = 0;
    this.controlsTarget = 0;
    this.controlsAnimStart = 0;
    this.lastPointerMoveTs = 0;
    this.fullStopTimer = 0;
    this.zooming = false;
    this.zoomStart = 0;
    this.zoomingOut = false;
    this.zoomOutStart = 0;
    this.zoomFrom = { x: 0, y: 0, w: 0, h: 0 };
    this.zoomOutTo = { x: 0, y: 0, w: 0, h: 0 };
  }

  reset() {
    console.log('[VideoPlayer] Resetting state, playingFull before:', this.playingFull);
    this.playingFull = false;
    this.fullIndex = -1;
    this.activeIndex = -1;
    this.seeking = false;
    this.controlsVisible = 0;
    this.controlsTarget = 0;
    this.zooming = false;
    this.zoomingOut = false;
    console.log('[VideoPlayer] State reset complete, playingFull after:', this.playingFull);
  }
}

export const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2];
const PRESERVE_PITCH_KEY = 'site.audio.preservePitch';

export function createDefaultUiState() {
  return {
    playbackRateIndex: playbackRates.indexOf(1) >= 0 ? playbackRates.indexOf(1) : 0,
    preservePitch: getStoredPreservePitch(),
    lastVolume: 0.6
  };
}

export function getStoredPreservePitch() {
  try {
    const raw = localStorage.getItem(PRESERVE_PITCH_KEY);
    if (raw === null) return false;
    return raw !== 'false';
  } catch (e) {
    return false;
  }
}

export function setStoredPreservePitch(preserve) {
  const next = preserve !== false;
  try { localStorage.setItem(PRESERVE_PITCH_KEY, next ? 'true' : 'false'); } catch (e) { /* ignore */ }
  return next;
}

export function setPreservePitchFlag(media, preserve) {
  if (!media) return;
  try { media.preservesPitch = preserve; } catch (e) { /* ignore */ }
  try { media.mozPreservesPitch = preserve; } catch (e) { /* ignore */ }
  try { media.webkitPreservesPitch = preserve; } catch (e) { /* ignore */ }
}

export function applyPlaybackSettings(media, uiState = createDefaultUiState(), rates = playbackRates) {
  if (!media) return;
  const rate = rates[Math.max(0, Math.min(rates.length - 1, uiState.playbackRateIndex))];
  try { media.playbackRate = rate; } catch (e) { /* ignore */ }
  setPreservePitchFlag(media, uiState.preservePitch);
}

export function applyAudioPlaybackSettings(audio, uiState = createDefaultUiState(), rates = playbackRates) {
  if (!audio) return;
  const rate = rates[Math.max(0, Math.min(rates.length - 1, uiState.playbackRateIndex))];
  try { audio.playbackRate = rate; } catch (e) { /* ignore */ }
  setPreservePitchFlag(audio, uiState.preservePitch);
}

export function toggleMute(media, uiState = createDefaultUiState()) {
  if (!media) return uiState;
  if (media.muted || media.volume <= 0.0001) {
    const target = uiState.lastVolume > 0.001 ? uiState.lastVolume : 0.5;
    media.muted = false;
    try { media.volume = target; } catch (e) { /* ignore */ }
  } else {
    uiState.lastVolume = media.volume || uiState.lastVolume || 0.5;
    media.muted = true;
    try { media.volume = 0; } catch (e) { /* ignore */ }
  }
  return uiState;
}

export function playMedia(media) {
  if (!media) return;
  try { media.play().catch(() => {}); } catch (e) { /* ignore */ }
}

export function pauseMedia(media) {
  if (!media) return;
  try { media.pause(); } catch (e) { /* ignore */ }
}

export function seekMediaWithFreeze(video, time, opts = {}) {
  if (!video || !Number.isFinite(time)) return;
  const audio = opts.audio || null;
  const syncMs = Number.isFinite(opts.syncMs) ? opts.syncMs : 0;
  const wasPlaying = !video.paused && !video.ended;
  const audioWasPlaying = !!audio && !audio.paused && !audio.ended;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  const target = duration == null ? Math.max(0, time) : Math.max(0, Math.min(duration, time));
  const resume = () => {
    if (audio) {
      try { audio.currentTime = Math.max(0, target - (syncMs / 1000)); } catch (e) { /* ignore */ }
      if (audioWasPlaying || wasPlaying) {
        try { audio.play().catch(() => {}); } catch (e) { /* ignore */ }
      }
    }
    if (wasPlaying) {
      try { video.play().catch(() => {}); } catch (e) { /* ignore */ }
    }
  };
  try { video.pause(); } catch (e) { /* ignore */ }
  if (audio) {
    try { audio.pause(); } catch (e) { /* ignore */ }
  }
  try {
    video.addEventListener('seeked', resume, { once: true });
    video.addEventListener('canplay', resume, { once: true });
  } catch (e) { /* ignore */ }
  try { video.currentTime = target; } catch (e) { resume(); }
}

export function togglePlay(media) {
  if (!media) return;
  if (media.paused) playMedia(media);
  else pauseMedia(media);
}

export function getBufferedAhead(media) {
  try {
    if (!media || !media.buffered || media.buffered.length === 0) return 0;
    const t = media.currentTime || 0;
    for (let i = 0; i < media.buffered.length; i++) {
      const start = media.buffered.start(i);
      const end = media.buffered.end(i);
      if (t >= start && t <= end) return Math.max(0, end - t);
    }
  } catch (e) { /* ignore */ }
  return 0;
}

const AUDIO_ALLOWED_KEY = 'site.audio.allowed';
const AUDIO_SYNC_KEY = 'site.audio.sync';
const DEFAULT_SYNC_MS = -270;

export function getStoredSyncMs() {
  const raw = localStorage.getItem(AUDIO_SYNC_KEY);
  if (raw === null) {
    try { localStorage.setItem(AUDIO_SYNC_KEY, String(DEFAULT_SYNC_MS)); } catch (e) { /* ignore */ }
    return DEFAULT_SYNC_MS;
  }
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_SYNC_MS;
}

export function canUseAudio(allowSound = true) {
  return !!allowSound && isAudioAllowed();
}

export function createAudioSyncState() {
  return {
    driftEma: 0,
    lastAdjustTs: 0,
    lastHardTs: 0,
    rateAdjusted: false,
    lastDrift: 0,
    lastDriftSmooth: 0,
    lastAheadA: 0,
    lastAheadV: 0,
    didHardSeek: false,
    didSoftAdjust: false
  };
}

export function syncAudioToVideo(video, audio, state, opts = {}) {
  if (!video || !audio || !state) return;
  const allowSound = opts.allowSound !== false;
  if (!canUseAudio(allowSound)) return;
  if (video.paused || audio.paused) return;
  if (video.seeking || audio.seeking) return;
  if (!Number.isFinite(video.currentTime)) return;
  if (audio.readyState < 2) return;

  const syncMs = Number.isFinite(opts.syncMs) ? opts.syncMs : getStoredSyncMs();
  const syncSec = syncMs / 1000;
  let target = video.currentTime - syncSec;
  if (target < 0) target = 0;

  const drift = audio.currentTime - target;
  const absDrift = Math.abs(drift);
  const now = Number.isFinite(opts.now) ? opts.now : performance.now();

  state.didHardSeek = false;
  state.didSoftAdjust = false;

  const aAhead = getBufferedAhead(audio);
  const vAhead = getBufferedAhead(video);
  state.lastAheadA = aAhead;
  state.lastAheadV = vAhead;
  if (aAhead < 0.15) return;
  if (vAhead < 0.10) return;

  const alpha = 0.15;
  const prevEma = Number.isFinite(state.driftEma) ? state.driftEma : 0;
  state.driftEma = prevEma * (1 - alpha) + drift * alpha;
  const driftSmooth = state.driftEma;
  state.lastDrift = drift;
  state.lastDriftSmooth = driftSmooth;

  const hardThreshold = opts.force ? 0 : 0.9;
  const hardCooldown = 1500;
  const canHardSeek = absDrift > hardThreshold &&
    aAhead >= 1.0 && vAhead >= 0.5 &&
    (now - state.lastHardTs) > hardCooldown;

  if (canHardSeek) {
    try { audio.currentTime = target; } catch (e) { /* ignore */ }
    state.driftEma = 0;
    applyAudioPlaybackSettings(audio, opts.uiState, opts.rates);
    state.lastHardTs = now;
    state.rateAdjusted = false;
    state.didHardSeek = true;
    return;
  }

  const softThreshold = 0.08;
  const maxAdjust = 0.012;
  const adjustInterval = 120;
  const kP = 0.35;
  if (Math.abs(driftSmooth) > softThreshold && (now - state.lastAdjustTs) > adjustInterval) {
    const baseRate = video.playbackRate || 1;
    const adjust = Math.max(-maxAdjust, Math.min(maxAdjust, -driftSmooth * kP));
    try { audio.playbackRate = baseRate * (1 + adjust); } catch (e) { /* ignore */ }
    setPreservePitchFlag(audio, (opts.uiState && opts.uiState.preservePitch));
    state.lastAdjustTs = now;
    state.rateAdjusted = true;
    state.didSoftAdjust = true;
    return;
  }

  if (state.rateAdjusted && (now - state.lastAdjustTs) > 400) {
    applyAudioPlaybackSettings(audio, opts.uiState, opts.rates);
    state.rateAdjusted = false;
  }
}

function getCssVar(name, fallback) {
  try {
    const bodyRaw = document.body ? getComputedStyle(document.body).getPropertyValue(name) : '';
    const bodyTrimmed = bodyRaw ? bodyRaw.trim() : '';
    if (bodyTrimmed) return bodyTrimmed;
    const rootRaw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const rootTrimmed = rootRaw ? rootRaw.trim() : '';
    return rootTrimmed || fallback;
  } catch (e) {
    return fallback;
  }
}

function getControlsTheme() {
  const bg = getCssVar('--controls-bg', getCssVar('--primary-color', '#111'));
  const fg = getCssVar('--controls-fg', getCssVar('--hl-tertiary-color', '#fff'));
  const alphaRaw = getCssVar('--controls-bg-alpha', '0.9');
  const bgAlpha = Number.isFinite(parseFloat(alphaRaw)) ? parseFloat(alphaRaw) : 1;
  return { bg, fg, bgAlpha };
}

export function drawBackButton(ctx, rect, color) {
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w * 0.68, rect.y + rect.h * 0.22);
  ctx.lineTo(rect.x + rect.w * 0.32, rect.y + rect.h * 0.50);
  ctx.lineTo(rect.x + rect.w * 0.68, rect.y + rect.h * 0.78);
  ctx.stroke();
}

export function drawPlayButton(ctx, rect, paused, color) {
  ctx.fillStyle = color || '#fff';
  if (paused) {
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w * 0.30, rect.y + rect.h * 0.20);
    ctx.lineTo(rect.x + rect.w * 0.30, rect.y + rect.h * 0.80);
    ctx.lineTo(rect.x + rect.w * 0.80, rect.y + rect.h * 0.50);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(rect.x + rect.w * 0.25, rect.y + rect.h * 0.20, rect.w * 0.20, rect.h * 0.60);
    ctx.fillRect(rect.x + rect.w * 0.55, rect.y + rect.h * 0.20, rect.w * 0.20, rect.h * 0.60);
  }
}

export function drawMuteButton(ctx, rect, muted, color) {
  ctx.fillStyle = color || '#fff';
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w * 0.20, rect.y + rect.h * 0.35);
  ctx.lineTo(rect.x + rect.w * 0.40, rect.y + rect.h * 0.35);
  ctx.lineTo(rect.x + rect.w * 0.60, rect.y + rect.h * 0.15);
  ctx.lineTo(rect.x + rect.w * 0.60, rect.y + rect.h * 0.85);
  ctx.lineTo(rect.x + rect.w * 0.40, rect.y + rect.h * 0.65);
  ctx.lineTo(rect.x + rect.w * 0.20, rect.y + rect.h * 0.65);
  ctx.closePath();
  ctx.fill();

  if (muted) {
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w * 0.70, rect.y + rect.h * 0.30);
    ctx.lineTo(rect.x + rect.w * 0.94, rect.y + rect.h * 0.70);
    ctx.moveTo(rect.x + rect.w * 0.94, rect.y + rect.h * 0.30);
    ctx.lineTo(rect.x + rect.w * 0.70, rect.y + rect.h * 0.70);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(rect.x + rect.w * 0.70, rect.y + rect.h * 0.50, rect.w * 0.15, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }
}

export function drawProgressBar(ctx, rect, video, color, alpha = 1) {
  const fg = color || '#fff';
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = fg;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();

  const progress = video && video.duration > 0 ? video.currentTime / video.duration : 0;
  ctx.fillStyle = fg;
  ctx.fillRect(rect.x, rect.y, rect.w * progress, rect.h);

  const dotX = rect.x + rect.w * progress;
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(dotX, rect.y + rect.h / 2, 6, 0, Math.PI * 2);
  ctx.fill();
}

function formatTime(t) {
  if (!isFinite(t) || t < 0) return '0:00';
  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function drawCenterPlayOverlay(ctx, rect, color, alpha = 1) {
  if (!ctx || !rect) return;
  const size = Math.min(rect.w, rect.h) * 0.22;
  const x = rect.x + (rect.w - size) / 2;
  const y = rect.y + (rect.h - size) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = Math.max(3, Math.round(size * 0.08));
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color || '#fff';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.46, y + size * 0.32);
  ctx.lineTo(x + size * 0.46, y + size * 0.68);
  ctx.lineTo(x + size * 0.72, y + size * 0.50);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawTransportFlashOverlay(ctx, rect, kind, color, alpha = 1, scale = 1) {
  if (!ctx || !rect || !kind) return;
  const size = Math.min(rect.w, rect.h) * 0.20 * Math.max(0.75, scale);
  const x = rect.x + (rect.w - size) / 2;
  const y = rect.y + (rect.h - size) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = Math.max(2, Math.round(size * 0.035));
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.5, size * 0.43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color || '#fff';
  if (kind === 'pause') {
    const barW = size * 0.14;
    const gap = size * 0.10;
    const barH = size * 0.42;
    const leftX = x + size * 0.5 - gap * 0.5 - barW;
    const topY = y + size * 0.5 - barH * 0.5;
    ctx.fillRect(leftX, topY, barW, barH);
    ctx.fillRect(leftX + barW + gap, topY, barW, barH);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.42, y + size * 0.32);
    ctx.lineTo(x + size * 0.42, y + size * 0.68);
    ctx.lineTo(x + size * 0.72, y + size * 0.50);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function createVideoControlsUI(options = {}) {
  const state = { current: null };
  let viewportProvider = null;
  let onAction = null;
  const enablePointer = options.enablePointer !== false;
  let transportFlash = null;
  let sliderDrag = null;
  const hoverPreview = {
    visible: false,
    ratio: 0,
    time: 0,
    lastRatio: -1,
    seekToken: 0,
    video: null
  };

  function getControlAvailability(s) {
    const incoming = (s && s.controls) || {};
    const defaults = {
      exit: !!(s && s.canPlay),
      play: !!(s && s.canPlay),
      mute: !!(s && s.canPlay),
      volume: !!(s && s.canPlay),
      seek: !!(s && s.canSeek),
      speed: false,
      pitch: false,
      sync: false,
      tablet: false,
      fullscreen: false
    };
    return { ...defaults, ...incoming };
  }

  function setViewportRectProvider(fn) {
    viewportProvider = fn;
  }

  function setState(next) {
    state.current = next || null;
  }

  function setOnAction(fn) {
    onAction = fn;
  }

  function getLayout(cw, ch) {
    const barH = Math.max(24, Math.round(ch * 0.11));
    const icon = Math.round(barH * 0.46);
    const pad = Math.round(barH * 0.28);
    const topY = 0;
    const bottomY = ch - barH;
    const progressH = Math.max(4, Math.round(barH * 0.08));
    const iconRowY = bottomY + Math.round(barH * 0.60);
    const iconTop = Math.round(iconRowY - icon / 2);
    const boxW = Math.round(icon * 1.42);
    const boxH = Math.round(icon * 0.95);
    const sliderW = Math.max(Math.round(cw * 0.13), Math.round(icon * 2.3));
    const timeW = Math.max(Math.round(cw * 0.20), Math.round(icon * 3.6));
    const rightGap = Math.max(8, Math.round(pad * 0.8));
    const dividerW = Math.max(2, Math.round(pad * 0.16));

    let cursor = cw - pad;
    const fullscreen = { x: cursor - icon, y: iconTop, w: icon, h: icon };
    cursor = fullscreen.x - rightGap;
    const tablet = { x: cursor - icon, y: iconTop, w: icon, h: icon };
    cursor = tablet.x - rightGap;
    const pitch = { x: cursor - boxW, y: Math.round(iconRowY - boxH / 2), w: boxW, h: boxH };
    const dividerLeft = { x: pitch.x - Math.round(rightGap * 0.55) - Math.floor(dividerW / 2), y: iconTop + Math.round(icon * 0.14), w: dividerW, h: Math.round(icon * 0.72) };
    cursor = dividerLeft.x - Math.round(rightGap * 0.55);
    const speed = { x: cursor - boxW, y: iconTop, w: boxW, h: icon };
    const dividerRight = { x: tablet.x - Math.round(rightGap * 0.5) - Math.floor(dividerW / 2), y: iconTop + Math.round(icon * 0.14), w: dividerW, h: Math.round(icon * 0.72) };
    const time = { x: Math.round(cw / 2 - timeW / 2), y: iconTop, w: timeW, h: icon };
    const play = { x: pad, y: iconTop, w: icon, h: icon };
    const mute = { x: play.x + play.w + Math.round(pad * 0.55), y: iconTop, w: icon, h: icon };
    const volumeSlider = {
      x: mute.x + mute.w + Math.round(pad * 0.95),
      y: Math.round(iconRowY - (barH * 0.16) / 2),
      w: sliderW,
      h: Math.max(4, Math.round(barH * 0.16))
    };
    const progress = {
      x: pad,
      // Keep the seek rail wholly inside the lower physical frame.  The
      // earlier bleed looked stylish on the largest tablet but obscured too
      // much of the smaller Arcade and Music displays.
      y: bottomY + Math.round(barH * 0.14),
      w: cw - pad * 2,
      h: progressH
    };
    const back = { x: pad, y: topY + Math.round((barH - icon) / 2), w: icon, h: icon };
    const sync = { x: cw - pad - icon, y: topY + Math.round((barH - icon) / 2), w: icon, h: icon };
    const syncSliderW = Math.max(Math.round(cw * 0.23), Math.round(icon * 3.6));
    const syncSlider = {
      x: sync.x - Math.round(pad * 0.45) - syncSliderW,
      y: topY + Math.round(barH * 0.58),
      w: syncSliderW,
      h: Math.max(7, Math.round(barH * 0.17))
    };
    const syncTextY = syncSlider.y - Math.max(8, Math.round(barH * 0.16));
    const titleLeft = back.x + back.w + Math.round(pad * 0.8);
    const titleRight = syncSlider.x - Math.round(pad * 0.8);
    const titleRect = {
      x: titleLeft,
      y: topY + Math.round(barH * 0.18),
      w: Math.max(0, titleRight - titleLeft),
      h: Math.round(barH * 0.64)
    };

    return {
      topBar: { x: 0, y: topY, w: cw, h: barH },
      bottomBar: { x: 0, y: bottomY, w: cw, h: barH },
      barH,
      back,
      titleRect,
      sync,
      syncSlider,
      syncTextY,
      play,
      mute,
      volumeSlider,
      progress,
      time,
      speed,
      pitch,
      tablet,
      fullscreen,
      dividerLeft,
      dividerRight,
      videoRect: { x: 0, y: 0, w: cw, h: ch }
    };
  }

  function drawDisabledOverlay(ctx, rect, alpha) {
    if (!ctx || !rect) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.38;
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = Math.max(2, Math.round(rect.h * 0.08));
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w * 0.24, rect.y + rect.h * 0.26);
    ctx.lineTo(rect.x + rect.w * 0.76, rect.y + rect.h * 0.74);
    ctx.stroke();
    ctx.restore();
  }

  function drawLabelBox(ctx, rect, textLines, color, alpha, disabled = false) {
    ctx.save();
    ctx.globalAlpha = disabled ? alpha * 0.4 : alpha;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (Array.isArray(textLines) && textLines.length === 2) {
      ctx.font = `${Math.round(rect.h * 0.38)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(textLines[0], rect.x + rect.w / 2, rect.y + rect.h * 0.38);
      ctx.fillText(textLines[1], rect.x + rect.w / 2, rect.y + rect.h * 0.76);
    } else {
      ctx.font = `${Math.round(rect.h * 0.5)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(String(textLines || ''), rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    }
    ctx.restore();
    if (disabled) drawDisabledOverlay(ctx, rect, alpha);
  }

  function drawDivider(ctx, rect, color, alpha) {
    if (!ctx || !rect) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawFocusButton(ctx, rect, focused, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.round(rect.h * 0.09));
    const inset = focused ? rect.w * 0.17 : rect.w * 0.28;
    const w = rect.w - inset * 2;
    const h = rect.h - inset * 2;
    ctx.strokeRect(rect.x + inset, rect.y + inset, w, h);
    // The smaller inner frame means “focus this display”; the broad frame
    // means “return to the normal camera view”, without requiring an icon font.
    if (!focused) {
      const inner = rect.w * 0.12;
      ctx.strokeRect(rect.x + inset + inner, rect.y + inset + inner, Math.max(1, w - inner * 2), Math.max(1, h - inner * 2));
    }
    ctx.restore();
  }

  function drawVolumeSlider(ctx, rect, volume, theme, alpha, enabled, dragScale = 1) {
    if (!ctx || !rect) return;
    const v = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    const knobR = Math.max(6, Math.round(Math.min(rect.w, rect.h * 3.8) * 0.11)) * dragScale;
    const trackX = rect.x + knobR;
    const trackW = Math.max(1, rect.w - knobR * 2);
    const trackY = rect.y + rect.h / 2;
    const trackH = Math.max(4, Math.round(rect.h * 0.58));
    const knobX = trackX + trackW * v;
    const knobY = trackY;

    ctx.save();
    ctx.globalAlpha = enabled ? alpha : alpha * 0.25;
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = trackH;
    ctx.globalAlpha = enabled ? alpha * 0.22 : alpha * 0.10;
    ctx.beginPath();
    ctx.moveTo(trackX, trackY);
    ctx.lineTo(trackX + trackW, trackY);
    ctx.stroke();
    ctx.globalAlpha = enabled ? alpha : alpha * 0.25;
    ctx.beginPath();
    ctx.moveTo(trackX, trackY);
    ctx.lineTo(knobX, trackY);
    ctx.stroke();

    ctx.fillStyle = theme.fg;
    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = Math.max(1, Math.round(knobR * 0.16));
    ctx.beginPath();
    ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = Math.max(1, Math.round(knobR * 0.13));
    ctx.lineCap = 'round';
    const barGap = knobR * 0.34;
    const barBase = knobY + knobR * 0.42;
    const heights = [0.52, 0.82, 0.36];
    for (let i = 0; i < 3; i++) {
      const x = knobX + (i - 1) * barGap;
      const h = knobR * heights[i];
      ctx.beginPath();
      ctx.moveTo(x, barBase);
      ctx.lineTo(x, barBase - h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHoverPreview(ctx, ui, s, theme, alpha) {
    if (!hoverPreview.visible || !s || !s.canSeek) return;
    const previewVideo = s.previewVideo || s.lqVideo || null;
    if (!previewVideo) return;
    const previewW = Math.max(190, Math.min(Math.round(ui.videoRect.w * 0.46), 360));
    const aspect = previewVideo.videoWidth && previewVideo.videoHeight ? previewVideo.videoWidth / previewVideo.videoHeight : 16 / 9;
    const previewH = Math.round(previewW / aspect);
    const labelH = Math.max(24, Math.round(previewH * 0.18));
    const dotX = ui.progress.x + ui.progress.w * hoverPreview.ratio;
    const x = Math.max(6, Math.min(ui.videoRect.w - previewW - 6, Math.round(dotX - previewW / 2)));
    const y = Math.max(6, Math.round(ui.progress.y - previewH - labelH - 10));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(x - 2, y - 2, previewW + 4, previewH + labelH + 4);
    if (previewVideo.readyState >= 2) {
      try { ctx.drawImage(previewVideo, x, y, previewW, previewH); } catch (e) { /* ignore */ }
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, previewW, previewH);
    }
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, previewW + 1, previewH + 1);
    ctx.fillStyle = theme.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(15, Math.round(previewH * 0.16))}px "Source Sans 3","Segoe UI",sans-serif`;
    ctx.fillText(formatTime(hoverPreview.time), x + previewW / 2, y + previewH + labelH / 2);
    ctx.restore();
  }

  function draw(ctx, meta = {}) {
    if (!ctx || !ctx.canvas) return;
    const s = state.current;
    if (!s || !s.canPlay) return;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const ui = getLayout(cw, ch);
    const alpha = Number.isFinite(meta.alpha) ? meta.alpha : 1;
    const controls = getControlAvailability(s);
    const syncRangeMs = Number.isFinite(s.syncRangeMs) ? Math.max(100, s.syncRangeMs) : 500;
    const syncMs = Number.isFinite(s.syncMs) ? s.syncMs : 0;
    const syncRatio = Math.max(0, Math.min(1, (syncMs + syncRangeMs) / (syncRangeMs * 2)));
    const volume = Math.max(0, Math.min(1, Number.isFinite(s.volume) ? s.volume : 0));
    const timeStr = `${formatTime(s.currentTime || 0)} / ${formatTime(s.duration || 0)}`;
    const rateLabel = `${Number.isFinite(s.playbackRate) ? s.playbackRate : 1}x`;
    const pitchLabel = s.preservePitch === false ? ['Time', 'Stretch'] : ['Pitch', 'Shift'];
    const title = String(s.title || '').trim();

    const theme = getControlsTheme();
    ctx.save();
    ctx.globalAlpha = alpha * theme.bgAlpha;
    const topGradient = ctx.createLinearGradient(0, ui.topBar.y, 0, ui.topBar.y + ui.topBar.h);
    topGradient.addColorStop(0, theme.bg);
    topGradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGradient;
    ctx.fillRect(ui.topBar.x, ui.topBar.y, ui.topBar.w, ui.topBar.h);
    const bottomGradient = ctx.createLinearGradient(0, ui.bottomBar.y, 0, ui.bottomBar.y + ui.bottomBar.h);
    bottomGradient.addColorStop(0, 'rgba(0,0,0,0)');
    bottomGradient.addColorStop(0.18, theme.bg);
    bottomGradient.addColorStop(1, theme.bg);
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(ui.bottomBar.x, ui.bottomBar.y - Math.max(0, Math.round(ui.barH * 0.35)), ui.bottomBar.w, ui.bottomBar.h + Math.max(0, Math.round(ui.barH * 0.35)));
    ctx.restore();

    if (controls.exit) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawBackButton(ctx, ui.back, theme.fg);
      ctx.restore();
    }

    if (ui.titleRect.w > 0 && title) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = theme.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(ui.barH * 0.42)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(title, ui.titleRect.x + ui.titleRect.w / 2, ui.titleRect.y + ui.titleRect.h / 2 + 1);
      ctx.restore();
    }

    if (controls.sync) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = theme.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(ui.sync.h * 0.82)}px "Material Symbols Rounded","Material Symbols Outlined","Material Icons"`;
      ctx.fillText('schedule', ui.sync.x + ui.sync.w / 2, ui.sync.y + ui.sync.h / 2 + 1);
      ctx.fillRect(ui.syncSlider.x, ui.syncSlider.y, ui.syncSlider.w, ui.syncSlider.h);
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillRect(ui.syncSlider.x, ui.syncSlider.y, ui.syncSlider.w * syncRatio, ui.syncSlider.h);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(ui.syncSlider.x + ui.syncSlider.w * syncRatio, ui.syncSlider.y + ui.syncSlider.h / 2, Math.max(4, Math.round(ui.syncSlider.h * 0.9)) * (sliderDrag === 'sync' ? 1.25 : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `700 ${Math.round(ui.barH * 0.31)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(`SYNC ${syncMs} ms`, ui.syncSlider.x + ui.syncSlider.w / 2, ui.syncTextY);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = controls.play ? alpha : alpha * 0.4;
    drawPlayButton(ctx, ui.play, !s.playing, theme.fg);
    ctx.restore();
    if (!controls.play) drawDisabledOverlay(ctx, ui.play, alpha);

    ctx.save();
    ctx.globalAlpha = controls.mute ? alpha : alpha * 0.4;
    drawMuteButton(ctx, ui.mute, !!s.muted, theme.fg);
    ctx.restore();
    if (!controls.mute) drawDisabledOverlay(ctx, ui.mute, alpha);

    drawVolumeSlider(ctx, ui.volumeSlider, volume, theme, alpha, controls.volume, sliderDrag === 'volume' ? 1.25 : 1);
    if (!controls.volume) drawDisabledOverlay(ctx, ui.volumeSlider, alpha);

    ctx.save();
    ctx.globalAlpha = controls.seek ? alpha : alpha * 0.3;
    drawProgressBar(ctx, ui.progress, { currentTime: s.currentTime || 0, duration: s.duration || 0 }, theme.fg, controls.seek ? alpha : alpha * 0.35);
    ctx.restore();
    if (!controls.seek) drawDisabledOverlay(ctx, ui.progress, alpha);
    drawHoverPreview(ctx, ui, s, theme, alpha);

    drawLabelBox(ctx, ui.time, timeStr, theme.fg, alpha, false);
    if (controls.speed) drawLabelBox(ctx, ui.speed, rateLabel, theme.fg, alpha, false);
    if (controls.pitch) {
      drawLabelBox(ctx, ui.pitch, pitchLabel, theme.fg, alpha, false);
      if (controls.speed) drawDivider(ctx, ui.dividerLeft, theme.fg, alpha);
    }

    if (controls.tablet) {
      if (controls.pitch || controls.speed) drawDivider(ctx, ui.dividerRight, theme.fg, alpha);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = theme.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(ui.tablet.h * 0.82)}px "Material Symbols Rounded","Material Symbols Outlined","Material Icons"`;
      ctx.fillText(s.tabletView ? 'picture_in_picture_center' : 'capture', ui.tablet.x + ui.tablet.w / 2, ui.tablet.y + ui.tablet.h / 2 + 1);
      ctx.restore();
    }

    if (controls.fullscreen) {
      drawFocusButton(ctx, ui.fullscreen, !!s.fullscreen, theme.fg, alpha);
    }

    if (transportFlash) {
      const elapsed = performance.now() - transportFlash.startedAt;
      const t = Math.max(0, Math.min(1, elapsed / Math.max(1, transportFlash.durationMs)));
      if (t >= 1) {
        transportFlash = null;
      } else {
        const flashAlpha = alpha * (1 - t);
        const flashScale = 1 + (t * 0.32);
        drawTransportFlashOverlay(ctx, ui.videoRect, transportFlash.kind, theme.fg, flashAlpha, flashScale);
      }
    }
  }

  function getPointerPosition(ev, meta = {}) {
    if (Number.isFinite(ev?.canvasX) && Number.isFinite(ev?.canvasY)) {
      const cw = meta.canvasWidth || 1;
      const ch = meta.canvasHeight || 1;
      return { x: ev.canvasX, y: ev.canvasY, cw, ch };
    }
    const rect = viewportProvider ? viewportProvider() : null;
    if (!rect || !rect.width || !rect.height) return null;
    const cw = meta.canvasWidth || rect.width;
    const ch = meta.canvasHeight || rect.height;
    return {
      x: ((ev.clientX - rect.left) / rect.width) * cw,
      y: ((ev.clientY - rect.top) / rect.height) * ch,
      cw,
      ch
    };
  }

  function inspectPointerEvent(ev, meta = {}) {
    const s = state.current;
    if (!s) return { hit: false, handled: false, action: null };
    const pos = getPointerPosition(ev, meta);
    if (!pos) return { hit: false, handled: false, action: null };
    const { x, y, cw, ch } = pos;
    const ui = getLayout(cw, ch);
    const controls = getControlAvailability(s);
    const syncRangeMs = Number.isFinite(s.syncRangeMs) ? Math.max(100, s.syncRangeMs) : 500;
    const within = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (within(ui.back)) {
      return { hit: true, handled: !!controls.exit, action: controls.exit ? { type: 'exit' } : null, control: 'exit' };
    }
    if (within(ui.play)) {
      return { hit: true, handled: !!controls.play, action: controls.play ? { type: 'togglePlay' } : null, control: 'play' };
    }
    if (within(ui.mute)) {
      return { hit: true, handled: !!controls.mute, action: controls.mute ? { type: 'toggleMute' } : null, control: 'mute' };
    }
    if (within(ui.tablet)) {
      return { hit: true, handled: !!controls.tablet, action: controls.tablet ? { type: 'toggleTablet' } : null, control: 'tablet' };
    }
    if (within(ui.fullscreen)) {
      return { hit: true, handled: !!controls.fullscreen, action: controls.fullscreen ? { type: 'toggleFullscreen' } : null, control: 'fullscreen' };
    }
    if (within(ui.speed)) {
      return { hit: true, handled: !!controls.speed, action: controls.speed ? { type: 'cyclePlaybackRate' } : null, control: 'speed' };
    }
    if (within(ui.pitch)) {
      return { hit: true, handled: !!controls.pitch, action: controls.pitch ? { type: 'togglePitch' } : null, control: 'pitch' };
    }
    if (within(ui.sync) || within(ui.syncSlider)) {
      const ratio = Math.max(0, Math.min(1, (x - ui.syncSlider.x) / ui.syncSlider.w));
      const syncMs = Math.round((ratio * 2 - 1) * syncRangeMs);
      return { hit: true, handled: !!controls.sync, action: controls.sync ? { type: 'setSyncMs', value: syncMs, ratio } : null, control: 'sync' };
    }
    if (y >= ui.progress.y - 6 && y <= ui.progress.y + ui.progress.h + 6 && x >= ui.progress.x && x <= ui.progress.x + ui.progress.w) {
      const ratio = Math.max(0, Math.min(1, (x - ui.progress.x) / ui.progress.w));
      return { hit: true, handled: !!controls.seek, action: controls.seek ? { type: 'seekToRatio', ratio } : null, control: 'seek' };
    }
    if (y >= ui.volumeSlider.y - 6 && y <= ui.volumeSlider.y + ui.volumeSlider.h + 6 && x >= ui.volumeSlider.x && x <= ui.volumeSlider.x + ui.volumeSlider.w) {
      const ratio = Math.max(0, Math.min(1, (x - ui.volumeSlider.x) / ui.volumeSlider.w));
      return { hit: true, handled: !!controls.volume, action: controls.volume ? { type: 'setVolume', volume: ratio } : null, control: 'volume' };
    }
    return { hit: false, handled: false, action: null, control: null };
  }

  function handlePointerEvent(ev, meta = {}) {
    if (!enablePointer) return false;
    if (meta && typeof meta.delegate === 'function') return !!meta.delegate(ev);
    const eventType = String(ev?.type || '');
    if (eventType && eventType !== 'pointerdown' && eventType !== 'mousedown' && eventType !== 'click' && eventType !== 'touchstart') {
      return false;
    }
    const result = inspectPointerEvent(ev, meta);
    if (!result.hit) return false;
    if (result.handled && ['volume', 'sync', 'seek'].includes(result.control)) sliderDrag = result.control;
    if (result.handled && result.action?.type === 'togglePlay') {
      // A small, non-blocking transport acknowledgement makes screen clicks
      // understandable even while the chrome is fading away.
      transportFlash = {
        kind: state.current?.playing ? 'pause' : 'play',
        startedAt: performance.now(),
        durationMs: 500
      };
    }
    if (result.handled && onAction && result.action) onAction(result.action);
    return !!result.handled;
  }

  function handlePointerMove(ev, meta = {}) {
    const s = state.current;
    if (!s || !s.canSeek) {
      hoverPreview.visible = false;
      return false;
    }
    const pos = getPointerPosition(ev, meta);
    if (!pos) {
      hoverPreview.visible = false;
      return false;
    }
    const ui = getLayout(pos.cw, pos.ch);
    if (sliderDrag) {
      const rect = sliderDrag === 'volume' ? ui.volumeSlider : (sliderDrag === 'sync' ? ui.syncSlider : ui.progress);
      // A held slider follows only along its own axis. Leaving either end
      // pauses the value instead of snapping it to 0 or 100%; re-entering the
      // range resumes the drag exactly where the pointer is.
      if (pos.x >= rect.x && pos.x <= rect.x + rect.w) {
        const ratio = Math.max(0, Math.min(1, (pos.x - rect.x) / rect.w));
        if (sliderDrag === 'volume') onAction?.({ type: 'setVolume', volume: ratio });
        if (sliderDrag === 'seek') onAction?.({ type: 'seekToRatio', ratio });
        if (sliderDrag === 'sync') onAction?.({ type: 'setSyncMs', value: Math.round((ratio * 2 - 1) * (Number.isFinite(s.syncRangeMs) ? Math.max(100, s.syncRangeMs) : 500)), ratio });
      }
      return true;
    }
    const yHit = pos.y >= ui.progress.y - 10 && pos.y <= ui.progress.y + ui.progress.h + 10;
    const xHit = pos.x >= ui.progress.x && pos.x <= ui.progress.x + ui.progress.w;
    if (!xHit || !yHit) {
      hoverPreview.visible = false;
      hoverPreview.lastRatio = -1;
      return false;
    }
    const ratio = Math.max(0, Math.min(1, (pos.x - ui.progress.x) / ui.progress.w));
    const duration = Number.isFinite(s.duration) ? s.duration : 0;
    const time = duration > 0 ? duration * ratio : 0;
    hoverPreview.visible = true;
    hoverPreview.ratio = ratio;
    hoverPreview.time = time;
    const previewVideo = s.previewVideo || s.lqVideo || null;
    if (previewVideo && Math.abs(ratio - hoverPreview.lastRatio) >= 0.006) {
      hoverPreview.lastRatio = ratio;
      hoverPreview.video = previewVideo;
      const token = ++hoverPreview.seekToken;
      try { previewVideo.pause(); } catch (e) { /* ignore */ }
      try {
        const dur = Number.isFinite(previewVideo.duration) && previewVideo.duration > 0 ? previewVideo.duration : duration;
        previewVideo.currentTime = Math.max(0, Math.min(dur || time, time));
        previewVideo.addEventListener('seeked', () => {
          if (hoverPreview.seekToken !== token) return;
          hoverPreview.visible = true;
        }, { once: true });
      } catch (e) { /* ignore */ }
    }
    return true;
  }

  return {
    setViewportRectProvider,
    setState,
    draw,
    handlePointerMove,
    clearHoverPreview() {
      hoverPreview.visible = false;
      hoverPreview.lastRatio = -1;
    },
    endPointerInteraction() { sliderDrag = null; },
    handlePointerEvent,
    inspectPointerEvent,
    notifyTransportToggle(kind) {
      transportFlash = {
        kind: kind === 'pause' ? 'pause' : 'play',
        startedAt: performance.now(),
        durationMs: 500
      };
    },
    set onAction(fn) { setOnAction(fn); },
    get onAction() { return onAction; }
  };
}

// Shared, intentionally compact version of YouTube's shortcut reference.
// Pages call this only while a player is active, so piano/menu controls remain
// discoverable in their normal contexts.
export function showVideoKeyboardShortcuts() {
  const existing = document.getElementById('shared-video-shortcuts');
  if (existing) { existing.remove(); return; }
  const dialog = document.createElement('section');
  dialog.id = 'shared-video-shortcuts';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Video keyboard shortcuts');
  dialog.style.cssText = 'position:fixed;z-index:2147483647;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 32px));background:#18181b;color:#f4f4f5;border:1px solid #52525b;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:22px;font:16px/1.45 "Segoe UI",sans-serif;';
  dialog.innerHTML = '<button aria-label="Close shortcut help" style="position:absolute;right:12px;top:8px;border:0;background:none;color:inherit;font-size:28px;cursor:pointer">×</button><h2 style="margin:0 0 14px;font-size:24px">Keyboard shortcuts</h2><div style="display:grid;grid-template-columns:1fr auto;gap:8px 20px"><span>Play / pause</span><kbd>Space or K</kbd><span>Back / forward 10 seconds</span><kbd>J / L</kbd><span>Back / forward 5 seconds</span><kbd>← / →</kbd><span>Volume</span><kbd>↑ / ↓</kbd><span>Mute</span><kbd>M</kbd><span>Playback speed</span><kbd>Shift + , / .</kbd><span>Previous / next frame (paused)</span><kbd>, / .</kbd><span>Seek to a percentage</span><kbd>0–9</kbd><span>Exit player</span><kbd>Esc</kbd><span>Show / hide this help</span><kbd>Shift + /</kbd></div>';
  const close = () => dialog.remove();
  dialog.querySelector('button')?.addEventListener('click', close);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  document.body.appendChild(dialog);
}
