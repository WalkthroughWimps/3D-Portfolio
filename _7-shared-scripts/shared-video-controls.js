import { setPreservePitchFlag, syncTargetTime } from './media/transport.js';
import { getSavedAudioSettings, patchAudioSettings } from './audio-settings.js';
export { setPreservePitchFlag, seekMediaWithFreeze } from './media/transport.js';
import { getSyncOffsetMs } from './global-sync.js';
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

export function createDefaultUiState() {
  return {
    playbackRateIndex: playbackRates.indexOf(1) >= 0 ? playbackRates.indexOf(1) : 0,
    preservePitch: getStoredPreservePitch(),
    lastVolume: 0.6
  };
}

export function getStoredPreservePitch() {
  return getSavedAudioSettings().preservePitch;
}

export function setStoredPreservePitch(preserve) {
  const next = preserve !== false;
  patchAudioSettings({ preservePitch: next });
  return next;
}

export function applyPlaybackSettings(media, uiState = createDefaultUiState(), rates = playbackRates) {
  if (!media) return;
  const rate = rates[Math.max(0, Math.min(rates.length - 1, uiState.playbackRateIndex))];
  try { media.playbackRate = rate; } catch { /* ignore */ }
  setPreservePitchFlag(media, uiState.preservePitch);
}

export function applyAudioPlaybackSettings(audio, uiState = createDefaultUiState(), rates = playbackRates) {
  if (!audio) return;
  const rate = rates[Math.max(0, Math.min(rates.length - 1, uiState.playbackRateIndex))];
  try { audio.playbackRate = rate; } catch { /* ignore */ }
  setPreservePitchFlag(audio, uiState.preservePitch);
}

export function toggleMute(media, uiState = createDefaultUiState()) {
  if (!media) return uiState;
  if (media.muted || media.volume <= 0.0001) {
    const target = uiState.lastVolume > 0.001 ? uiState.lastVolume : 0.5;
    media.muted = false;
    try { media.volume = target; } catch { /* ignore */ }
  } else {
    uiState.lastVolume = media.volume || uiState.lastVolume || 0.5;
    media.muted = true;
    try { media.volume = 0; } catch { /* ignore */ }
  }
  return uiState;
}

export function playMedia(media) {
  if (!media) return;
  try { media.play().catch(() => {}); } catch { /* ignore */ }
}

export function pauseMedia(media) {
  if (!media) return;
  try { media.pause(); } catch { /* ignore */ }
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
  } catch { /* ignore */ }
  return 0;
}

export function getStoredSyncMs() { return getSyncOffsetMs(); }

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
  let target = syncTargetTime(video.currentTime, syncMs);

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
    try { audio.currentTime = target; } catch { /* ignore */ }
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
    try { audio.playbackRate = baseRate * (1 + adjust); } catch { /* ignore */ }
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

// Compatibility exports for Start, Videos, Games, and Music.
export { drawBackButton, drawPlayButton, drawMuteButton, drawProgressBar,
  drawTransportFlashOverlay, createVideoControlsUI, showVideoKeyboardShortcuts } from './media/controls-view.js';
