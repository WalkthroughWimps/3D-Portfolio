import { seekMediaWithFreeze } from './shared-video-controls.js';

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

  function getState() {
    const video = getVideo();
    const audio = getAudio();
    const capabilities = getCapabilities(video, audio) || {};
    const settings = getAudioSettings ? getAudioSettings() : null;
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    const canPlay = capabilities.canPlay ?? !!video;
    const canSeek = capabilities.canSeek ?? (canPlay && duration > 0);
    return {
      title: getTitle(video, audio),
      playing: !!video && !video.paused && !video.ended,
      muted: settings ? !!settings.muted : (audio ? !!audio.muted : !!video?.muted),
      volume: settings ? settings.volume : (audio ? (audio.volume || 0) : (video?.volume || 0)),
      currentTime: video?.currentTime || 0,
      duration,
      playbackRate: video?.playbackRate || 1,
      previewVideo: getPreview(),
      canPlay,
      canSeek,
      preservePitch: !!options.getPreservePitch?.(),
      syncMs: Number.isFinite(getSyncMs()) ? getSyncMs() : 0,
      syncRangeMs: Number.isFinite(options.syncRangeMs) ? options.syncRangeMs : 500,
      fullscreen: !!options.isFullscreen?.(),
      controls: {
        exit: capabilities.exit ?? true,
        play: capabilities.play ?? canPlay,
        mute: capabilities.mute ?? canPlay,
        volume: capabilities.volume ?? canPlay,
        seek: capabilities.seek ?? canSeek,
        speed: capabilities.speed ?? false,
        pitch: capabilities.pitch ?? false,
        sync: capabilities.sync ?? false,
        tablet: capabilities.tablet ?? false,
        fullscreen: capabilities.fullscreen ?? false
      }
    };
  }

  function dispatch(action) {
    if (!action?.type) return;
    const video = getVideo();
    const audio = getAudio();
    if (action.type === 'togglePlay') return video?.paused ? options.play?.(video, audio) : options.pause?.(video, audio);
    if (action.type === 'play') return options.play?.(video, audio);
    if (action.type === 'pause') return options.pause?.(video, audio);
    if (action.type === 'seekToRatio' && video?.duration > 0) {
      const ratio = Math.max(0, Math.min(1, Number(action.ratio) || 0));
      return options.seek?.(ratio, video, audio) || seekMediaWithFreeze(video, video.duration * ratio, { audio, syncMs: getSyncMs() });
    }
    if (action.type === 'setVolume') return options.setVolume?.(Math.max(0, Math.min(1, Number(action.volume) || 0)), video, audio);
    if (action.type === 'toggleMute') return options.toggleMute?.(video, audio);
    if (action.type === 'cyclePlaybackRate') return options.cyclePlaybackRate?.(video, audio);
    if (action.type === 'setRate') return options.setPlaybackRate?.(Number(action.rate), video, audio);
    if (action.type === 'togglePitch') return options.togglePitch?.();
    if (action.type === 'setSyncMs') return options.setSyncMs?.(Number(action.value));
    if (action.type === 'toggleTablet') return options.toggleTabletView?.();
    if (action.type === 'toggleFullscreen') return options.toggleFullscreen?.();
    if (action.type === 'exit') return options.exit?.();
  }

  return { getViewportRect, getState, dispatch };
}
