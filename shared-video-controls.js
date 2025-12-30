console.log('%c[shared-video-controls] loaded', 'color:#00ffcc;font-weight:bold');
console.log('%c[shared-video-controls] primary API active', 'color:#00ccff;font-weight:bold');

// Shared video controls helpers (copied from video-player-controls.js).

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

export function createDefaultUiState() {
  return {
    playbackRateIndex: playbackRates.indexOf(1) >= 0 ? playbackRates.indexOf(1) : 0,
    preservePitch: true,
    lastVolume: 0.6
  };
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

export function getStoredSyncMs() {
  const raw = parseInt(localStorage.getItem(AUDIO_SYNC_KEY) || '0', 10);
  return Number.isFinite(raw) ? raw : 0;
}

export function canUseAudio(allowSound = true) {
  return !!allowSound && localStorage.getItem(AUDIO_ALLOWED_KEY) === 'true';
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
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const trimmed = raw ? raw.trim() : '';
    return trimmed || fallback;
  } catch (e) {
    return fallback;
  }
}

function getControlsTheme() {
  const bg = getCssVar('--controls-bg', '#111');
  const fg = getCssVar('--controls-fg', '#fff');
  const alphaRaw = getCssVar('--controls-bg-alpha', '0.85');
  const bgAlpha = Number.isFinite(parseFloat(alphaRaw)) ? parseFloat(alphaRaw) : 0.85;
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

export function createVideoControlsUI(options = {}) {
  const state = { current: null };
  let viewportProvider = null;
  let onAction = null;
  const enablePointer = options.enablePointer !== false;

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
    const barH = Math.max(24, Math.round(ch * 0.08));
    const icon = Math.round(barH * 0.5);
    const pad = Math.round(barH * 0.25);
    return {
      top: { x: 0, y: 0, w: cw, h: barH, back: { x: pad, y: (barH - icon) / 2, w: icon, h: icon } },
      bottom: {
        x: 0,
        y: ch - barH,
        w: cw,
        h: barH,
        play: { x: pad, y: ch - barH + (barH - icon) / 2, w: icon, h: icon },
        mute: { x: pad * 2 + icon, y: ch - barH + (barH - icon) / 2, w: icon, h: icon },
        progress: { x: pad * 3 + icon * 2, y: ch - barH + barH / 2 - 2, w: cw - (pad * 4 + icon * 2), h: 4 }
      }
    };
  }

  function draw(ctx, meta = {}) {
    if (meta && typeof meta.drawLegacy === 'function') {
      meta.drawLegacy();
      return;
    }
    if (!ctx || !ctx.canvas) return;
    const s = state.current;
    if (!s || !s.canPlay) return;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const ui = getLayout(cw, ch);
    const alpha = Number.isFinite(meta.alpha) ? meta.alpha : 1;

    const theme = getControlsTheme();
    ctx.save();
    ctx.globalAlpha = alpha * theme.bgAlpha;
    ctx.fillStyle = theme.bg;
    ctx.fillRect(ui.top.x, ui.top.y, ui.top.w, ui.top.h);
    ctx.fillRect(ui.bottom.x, ui.bottom.y, ui.bottom.w, ui.bottom.h);

    ctx.globalAlpha = alpha;
    drawBackButton(ctx, ui.top.back, theme.fg);
    drawPlayButton(ctx, ui.bottom.play, !s.playing, theme.fg);
    drawMuteButton(ctx, ui.bottom.mute, !!s.muted, theme.fg);
    drawProgressBar(ctx, ui.bottom.progress, { currentTime: s.currentTime || 0, duration: s.duration || 0 }, theme.fg, alpha);
    ctx.restore();
  }

  function handlePointerEvent(ev, meta = {}) {
    if (!enablePointer) return false;
    if (meta && typeof meta.delegate === 'function') return !!meta.delegate(ev);
    const s = state.current;
    if (!s) return false;
    const rect = viewportProvider ? viewportProvider() : null;
    if (!rect || !rect.width || !rect.height) return false;
    const x = ((ev.clientX - rect.left) / rect.width) * (meta.canvasWidth || rect.width);
    const y = ((ev.clientY - rect.top) / rect.height) * (meta.canvasHeight || rect.height);
    const ui = getLayout(meta.canvasWidth || rect.width, meta.canvasHeight || rect.height);
    const within = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (within(ui.top.back)) {
      if (onAction) onAction({ type: 'exit' });
      return true;
    }
    if (within(ui.bottom.play)) {
      if (onAction) onAction({ type: 'togglePlay' });
      return true;
    }
    if (within(ui.bottom.mute)) {
      if (onAction) onAction({ type: 'toggleMute' });
      return true;
    }
    if (y >= ui.bottom.progress.y - 6 && y <= ui.bottom.progress.y + ui.bottom.progress.h + 6) {
      const ratio = Math.max(0, Math.min(1, (x - ui.bottom.progress.x) / ui.bottom.progress.w));
      if (onAction) onAction({ type: 'seekToRatio', ratio });
      return true;
    }
    return false;
  }

  return {
    setViewportRectProvider,
    setState,
    draw,
    handlePointerEvent,
    set onAction(fn) { setOnAction(fn); },
    get onAction() { return onAction; }
  };
}
