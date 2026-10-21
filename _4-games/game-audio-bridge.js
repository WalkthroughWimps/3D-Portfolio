import { ensureAudioConsentPrompt, isAudioAllowed, onAudioConsentChange } from '../_7-shared-scripts/audio-consent.js';

export function createGameAudioBridge(options = {}) {
  const canUseSound = () => typeof document === 'undefined' || isAudioAllowed();
  const cfg = {
    retryCount: Number.isFinite(options.retryCount) ? options.retryCount : 10,
    retryDelayMs: Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 250,
    onStatus: typeof options.onStatus === 'function' ? options.onStatus : null
  };

  let lastVolume01 = 1;
  let muted = !canUseSound();
  let available = false;
  let lastReason = 'init';
  let boundFrame = null;
  let boundInterface = null;
  let bindGeneration = 0;
  let retryTimer = null;
  let disposed = false;

  function notify(reason) {
    if (cfg.onStatus) cfg.onStatus({ available, reason, muted, volume: lastVolume01 });
  }

  function isSameOrigin(frameEl) {
    if (!frameEl || !frameEl.contentWindow) return false;
    try {
      void frameEl.contentWindow.location.href;
      return true;
    } catch {
      return false;
    }
  }

  function getC3AudioInterface(frameEl) {
    try {
      const win = frameEl?.contentWindow;
      if (!win) return null;
      return win.C3Audio_DOMInterface || win.self?.C3Audio_DOMInterface || null;
    } catch {
      return null;
    }
  }

  function bindInterface(frameEl) {
    if (!frameEl) {
      available = false;
      lastReason = 'no-frame';
      boundInterface = null;
      notify(lastReason);
      return false;
    }
    if (!isSameOrigin(frameEl)) {
      available = false;
      lastReason = 'cross-origin';
      boundInterface = null;
      notify(lastReason);
      return false;
    }
    const domAudio = getC3AudioInterface(frameEl);
    if (!domAudio) {
      available = false;
      lastReason = 'no-interface';
      boundInterface = null;
      notify(lastReason);
      return false;
    }
    boundInterface = domAudio;
    available = true;
    lastReason = 'ok';
    notify(lastReason);
    return true;
  }

  function applyVolume() {
    if (!boundInterface) return false;
    const vol = muted || !canUseSound() ? 0 : lastVolume01;
    if (typeof boundInterface._SetMasterVolume === 'function') {
      try {
        boundInterface._SetMasterVolume({ vol });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  function setVolume01(vol01) {
    if (disposed) return false;
    const vol = Math.max(0, Math.min(2, Number.isFinite(vol01) ? vol01 : 0));
    lastVolume01 = vol;
    return applyVolume();
  }

  function setMuted(nextMuted) {
    if (disposed) return false;
    if (!nextMuted && !canUseSound()) {
      setMuted(true);
      notify('consent-required');
      const generation = bindGeneration;
      void ensureAudioConsentPrompt().then(state => {
        if (!disposed && state.allowed && generation === bindGeneration && boundFrame?.isConnected) setMuted(false);
      });
      return false;
    }
    muted = !!nextMuted;
    let volumeApplied = muted ? false : applyVolume();
    let silentApplied = false;
    if (boundInterface && typeof boundInterface._SetSilent === 'function') {
      try {
        boundInterface._SetSilent({ isSilent: muted });
        silentApplied = true;
      } catch {
        /* ignore */
      }
    }
    if (muted) volumeApplied = applyVolume();
    notify('mute');
    return silentApplied || volumeApplied;
  }

  function attach(frameEl) {
    if (disposed) return;
    detach();
    boundFrame = frameEl || null;
    if (!boundFrame) {
      return;
    }
    const generation = bindGeneration;
    let attempts = 0;
    const attemptBind = () => {
      retryTimer = null;
      if (generation !== bindGeneration || !boundFrame || !boundFrame.isConnected) return;
      attempts += 1;
      if (bindInterface(boundFrame)) {
        setMuted(muted || !canUseSound());
        return;
      }
      if (attempts < cfg.retryCount) {
        retryTimer = setTimeout(attemptBind, cfg.retryDelayMs);
      }
    };
    attemptBind();
  }

  function detach() {
    bindGeneration += 1;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    boundFrame = null;
    boundInterface = null;
    available = false;
    lastReason = 'no-frame';
    notify(lastReason);
  }

  function getState() {
    return { available, muted, volume: lastVolume01, reason: lastReason };
  }

  const stopConsentWatch = onAudioConsentChange(allowed => {
    if (!allowed) setMuted(true);
  });

  function dispose() {
    if (disposed) return;
    stopConsentWatch();
    detach();
    disposed = true;
  }

  return {
    attach,
    detach,
    dispose,
    getState,
    setVolume01,
    setMuted
  };
}
