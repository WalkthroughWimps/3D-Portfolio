import { seekMediaWithFreeze, clampSeekRatio } from './transport.js';

// Page-neutral playback contract. A page supplies media elements and only the
// actions it genuinely owns; the controller owns the standard player behavior.
export function createMediaController(options = {}) {
  const getVideo = options.getActiveVideo || (() => null);
  const getAudio = options.getActiveAudio || (() => null);
  const getPreview = options.getActivePreviewVideo || (() => null);
  const getViewportRect = options.getViewportRect || (() => null);
  const getTitle = options.getTitle || (() => '');
  const getCapabilities = options.getCapabilities || (() => ({}));
  const getAudioSettings = options.getAudioSettings || null;
  const getSyncMs = options.getSyncMs || (() => 0);
  const listeners = new Set();
  const mediaEvents = ['play', 'pause', 'timeupdate', 'durationchange', 'volumechange', 'ratechange', 'seeking', 'seeked', 'ended', 'loadedmetadata'];
  let boundVideo = null;
  let boundAudio = null;
  let disposed = false;
  let status = 'ready';
  let error = null;

  function getState() {
    const video = getVideo();
    const audio = getAudio();
    const capabilities = getCapabilities(video, audio) || {};
    const settings = getAudioSettings ? getAudioSettings() : null;
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    const canPlay = !!video && (capabilities.canPlay ?? true);
    const canSeek = canPlay && duration > 0 && (capabilities.canSeek ?? true);
    return {
      title: getTitle(video, audio),
      playing: !!video && !video.paused && !video.ended,
      muted: settings ? !!settings.muted : (audio ? !!audio.muted : !!video?.muted),
      volume: settings ? settings.volume : (audio ? audio.volume : (video?.volume ?? 0)),
      currentTime: video?.currentTime || 0,
      duration,
      playbackRate: video?.playbackRate || 1,
      previewVideo: getPreview(),
      status, error,
      canPlay,
      canSeek,
      preservePitch: !!options.getPreservePitch?.(),
      syncMs: Number.isFinite(getSyncMs()) ? getSyncMs() : 0,
      syncRangeMs: Number.isFinite(options.syncRangeMs) ? options.syncRangeMs : 3000,
      fullscreen: !!options.isFullscreen?.(),
      tabletView: !!options.isTabletView?.(),
      controls: {
        exit: capabilities.exit ?? true,
        play: capabilities.play ?? canPlay,
        mute: canPlay && (capabilities.mute ?? true),
        volume: canPlay && (capabilities.volume ?? true),
        seek: canSeek && (capabilities.seek ?? true),
        speed: canPlay && (capabilities.speed ?? false),
        pitch: canPlay && (capabilities.pitch ?? false),
        sync: canPlay && (capabilities.sync ?? false),
        tablet: canPlay && (capabilities.tablet ?? false),
        fullscreen: canPlay && (capabilities.fullscreen ?? false)
      }
    };
  }

  function notify() {
    if (disposed) return;
    const state = getState();
    for (const listener of [...listeners]) listener(state);
  }
  function refresh() {
    if (disposed) return;
    const video = getVideo(), audio = getAudio();
    if (video !== boundVideo || audio !== boundAudio) {
      for (const media of [boundVideo, boundAudio]) for (const event of mediaEvents) media?.removeEventListener?.(event, notify);
      boundVideo = video; boundAudio = audio;
      for (const media of [boundVideo, boundAudio]) for (const event of mediaEvents) media?.addEventListener?.(event, notify);
    }
    notify();
  }
  function subscribe(listener, { signal, immediate = false } = {}) {
    if (disposed || typeof listener !== 'function') return () => {};
    listeners.add(listener);
    const stop = () => { listeners.delete(listener); signal?.removeEventListener?.('abort', stop); };
    signal?.addEventListener?.('abort', stop, { once: true });
    if (signal?.aborted) stop();
    else if (immediate) listener(getState());
    return stop;
  }
  function run(callback) {
    try {
      const result = callback();
      if (result?.then) result.catch(failure => { status = 'error'; error = failure; notify(); });
      else notify();
      return result;
    } catch (failure) { status = 'error'; error = failure; notify(); throw failure; }
  }

  function dispatch(action) {
    if (disposed || !action?.type) return;
    const video = getVideo();
    const audio = getAudio();
    const control = {
      togglePlay: 'play', play: 'play', pause: 'play', seekToRatio: 'seek',
      setVolume: 'volume', toggleMute: 'mute', cyclePlaybackRate: 'speed', setRate: 'speed',
      togglePitch: 'pitch', setSyncMs: 'sync', toggleTablet: 'tablet', toggleFullscreen: 'fullscreen', exit: 'exit'
    }[action.type];
    if (!control || !getState().controls[control]) return;
    if (action.type === 'togglePlay') return run(() => video?.paused ? options.play?.(video, audio) : options.pause?.(video, audio));
    if (action.type === 'play') return run(() => options.play?.(video, audio));
    if (action.type === 'pause') return run(() => options.pause?.(video, audio));
    if (action.type === 'seekToRatio' && Number.isFinite(video?.duration) && video.duration > 0) {
      const ratio = clampSeekRatio(action.ratio);
      // An installed callback owns the seek even when it returns undefined.
      if (typeof options.seek === 'function') return run(() => options.seek(ratio, video, audio));
      return run(() => seekMediaWithFreeze(video, video.duration * ratio, { audio, syncMs: getSyncMs() }));
    }
    if (action.type === 'setVolume') return run(() => options.setVolume?.(Math.max(0, Math.min(1, Number(action.volume) || 0)), video, audio));
    if (action.type === 'toggleMute') return run(() => options.toggleMute?.(video, audio));
    if (action.type === 'cyclePlaybackRate') return run(() => options.cyclePlaybackRate?.(video, audio));
    if (action.type === 'setRate') {
      const rate = Number(action.rate);
      const [min, max] = options.rateRange || [0.5, 2];
      if (!Number.isFinite(rate) || rate < min || rate > max) return;
      return run(() => options.setPlaybackRate?.(rate, video, audio));
    }
    if (action.type === 'togglePitch') return run(() => options.togglePitch?.());
    if (action.type === 'setSyncMs') return run(() => options.setSyncMs?.(Number(action.value)));
    if (action.type === 'toggleTablet') return run(() => options.toggleTabletView?.());
    if (action.type === 'toggleFullscreen') return run(() => options.toggleFullscreen?.());
    if (action.type === 'exit') return run(() => options.exit?.());
  }

  return { getViewportRect, getState, dispatch, subscribe, refresh,
    dispose() {
      if (disposed) return;
      for (const media of [boundVideo, boundAudio]) for (const event of mediaEvents) media?.removeEventListener?.(event, notify);
      boundVideo = null; boundAudio = null; listeners.clear(); disposed = true;
    }
  };
}
