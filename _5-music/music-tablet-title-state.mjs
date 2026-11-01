export const TRACK_TITLE_DEFAULTS = Object.freeze({
  idleTimeout: 1200,
  hoverDelay: 100,
  fadeDuration: 180,
  transitionGap: 80
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

/** One owner for track title hover, idle, and crossfade timing. */
export function createTrackTitleController({
  initial = 'Choose a Track',
  onChange = () => {},
  now = () => performance.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  reducedMotion = () => false,
  settings = TRACK_TITLE_DEFAULTS
} = {}) {
  let current = initial;
  let alpha = 1;
  let incoming = null;
  let incomingAlpha = 0;
  let phase = 'idle';
  let phaseStart = 0;
  let desired = initial;
  let hovered = null;
  let selected = null;
  let welcome = true;
  let timer = null;
  let frame = null;
  let disposed = false;
  let options = { ...TRACK_TITLE_DEFAULTS, ...settings };

  const snapshot = () => ({ text: current, alpha, incoming, incomingAlpha, phase });
  const publish = () => { if (!disposed) onChange(snapshot()); };
  const clearPending = () => { if (timer !== null) clearTimer(timer); timer = null; };
  const stopFrame = () => { if (frame !== null) cancelFrame(frame); frame = null; };
  const schedule = (callback, delay) => {
    clearPending();
    timer = setTimer(() => { timer = null; if (!disposed) callback(); }, Math.max(0, delay));
  };

  function animate(time) {
    frame = null;
    if (disposed) return;
    const duration = Math.max(0, Number(options.fadeDuration) || 0);
    if (phase === 'crossfade') {
      const progress = duration ? clamp((time - phaseStart) / duration, 0, 1) : 1;
      alpha = 1 - progress;
      const overlap = Math.min(options.transitionGap, duration * 0.35);
      incomingAlpha = overlap ? clamp((progress - (1 - overlap / Math.max(1, duration))) / (overlap / Math.max(1, duration)), 0, 1) : progress;
      if (progress >= 1) {
        current = incoming ?? desired;
        incoming = null;
        incomingAlpha = 0;
        alpha = 1;
        phase = 'idle';
        syncIdleTitle();
      } else frame = requestFrame(animate);
    }
    publish();
  }

  function transitionTo(text) {
    desired = text;
    if (phase === 'crossfade') { desired = text; incoming = text; publish(); return; }
    clearPending();
    if (text === current && phase === 'idle') return;
    if (reducedMotion()) {
      stopFrame();
      phase = 'idle'; current = desired; incoming = null; incomingAlpha = 0; alpha = 1; publish();
      return;
    }
    if (phase === 'crossfade') return;
    phase = 'crossfade'; incoming = desired; incomingAlpha = 0; alpha = 1; phaseStart = now();
    stopFrame(); frame = requestFrame(animate); publish();
  }

  function syncIdleTitle() {
    clearPending();
    if (phase === 'crossfade') {
      if (hovered) { desired = hovered; incoming = hovered; }
      return;
    }
    if (!welcome || selected) return;
    if (hovered) {
      if (hovered === desired) return;
      const key = hovered;
      schedule(() => { if (welcome && !selected && hovered === key) transitionTo(key); }, options.hoverDelay);
    } else if (current !== initial || phase !== 'idle') {
      schedule(() => { if (welcome && !selected && !hovered) transitionTo(initial); }, options.idleTimeout);
    }
  }

  return {
    get: snapshot,
    setSettings(next = {}) {
      options = {
        idleTimeout: clamp(next.idleTimeout ?? options.idleTimeout, 0, 3000),
        hoverDelay: clamp(next.hoverDelay ?? options.hoverDelay, 0, 500),
        fadeDuration: clamp(next.fadeDuration ?? options.fadeDuration, 0, 600),
        transitionGap: clamp(next.transitionGap ?? options.transitionGap, 0, 400)
      };
      if (reducedMotion()) {
        if (phase !== 'idle') transitionTo(desired);
      } else syncIdleTitle();
    },
    setHover(key) {
      hovered = key || null;
      if (welcome && !selected) syncIdleTitle();
    },
    setContext({ selectedKey = null, isWelcome = false } = {}) {
      selected = selectedKey || null;
      welcome = Boolean(isWelcome);
      if (!welcome && selected) { clearPending(); transitionTo(selected); }
      else syncIdleTitle();
    },
    dispose() { disposed = true; clearPending(); stopFrame(); }
  };
}
