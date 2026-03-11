export function createGameAudioBridge(options = {}) {
  const cfg = {
    retryCount: Number.isFinite(options.retryCount) ? options.retryCount : 10,
    retryDelayMs: Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : 250,
    onStatus: typeof options.onStatus === 'function' ? options.onStatus : null
  };

  let lastVolume01 = 1;
  let muted = false;
  let available = false;
  let lastReason = 'init';
  let boundFrame = null;
  let boundInterface = null;

  function notify(reason) {
    if (cfg.onStatus) cfg.onStatus({ available, reason, muted, volume: lastVolume01 });
  }

  function isSameOrigin(frameEl) {
    if (!frameEl || !frameEl.contentWindow) return false;
    try {
      void frameEl.contentWindow.location.href;
      return true;
    } catch (e) {
      return false;
    }
  }

  function getC3AudioInterface(frameEl) {
    try {
      const win = frameEl?.contentWindow;
      if (!win) return null;
      return win.C3Audio_DOMInterface || win.self?.C3Audio_DOMInterface || null;
    } catch (e) {
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

  function setVolume01(vol01) {
    const vol = Math.max(0, Math.min(2, Number.isFinite(vol01) ? vol01 : 0));
    lastVolume01 = vol;
    if (!boundInterface) return false;
    if (typeof boundInterface._SetMasterVolume === 'function') {
      try {
        boundInterface._SetMasterVolume({ vol });
        return true;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  function setMuted(nextMuted) {
    muted = !!nextMuted;
    if (boundInterface && typeof boundInterface._SetSilent === 'function') {
      try {
        boundInterface._SetSilent({ isSilent: muted });
        return true;
      } catch (e) {
        /* ignore */
      }
    }
    if (muted) {
      return setVolume01(0);
    }
    return setVolume01(lastVolume01);
  }

  function attach(frameEl) {
    boundFrame = frameEl || null;
    if (!boundFrame) {
      available = false;
      lastReason = 'no-frame';
      boundInterface = null;
      notify(lastReason);
      return;
    }
    let attempts = 0;
    const attemptBind = () => {
      attempts += 1;
      if (bindInterface(boundFrame)) {
        setVolume01(lastVolume01);
        if (muted) setMuted(true);
        return;
      }
      if (attempts < cfg.retryCount) {
        setTimeout(attemptBind, cfg.retryDelayMs);
      }
    };
    attemptBind();
  }

  function getState() {
    return { available, muted, volume: lastVolume01, reason: lastReason };
  }

  return {
    attach,
    getState,
    setVolume01,
    setMuted
  };
}
