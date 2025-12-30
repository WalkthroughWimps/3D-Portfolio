export function createGamesVideoAdapter(ctx = {}) {
  const getViewportRect = ctx.getViewportRect || (() => null);
  const getScreenRect = ctx.getScreenRect || (() => null);
  const getActiveVideo = ctx.getActiveVideo || (() => null);
  const getActiveAudio = ctx.getActiveAudio || (() => null);
  const getContentMode = ctx.getContentMode || (() => null);
  const setVolume = ctx.setVolume || null;
  const toggleMute = ctx.toggleMute || null;
  const setPlaybackRate = ctx.setPlaybackRate || null;
  const exit = ctx.exit || (() => {});

  function getState() {
    const video = getActiveVideo();
    const audio = getActiveAudio();
    if (!video) {
      return {
        playing: false,
        muted: audio ? !!audio.muted : true,
        volume: audio ? (audio.volume || 0) : 0,
        currentTime: 0,
        duration: 0,
        playbackRate: 1,
        canPlay: false,
        canSeek: false
      };
    }
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const canSeek = Number.isFinite(video.duration) && video.duration > 0;
    const mode = getContentMode ? getContentMode() : null;
    const canPlay = !!video && mode === 'video';

    return {
      playing: !video.paused && !video.ended,
      muted: audio ? !!audio.muted : !!video.muted,
      volume: audio ? (audio.volume || 0) : (video.volume || 0),
      currentTime: video.currentTime || 0,
      duration,
      playbackRate: video.playbackRate || 1,
      canPlay,
      canSeek
    };
  }

  function isActive() {
    const video = getActiveVideo();
    const mode = getContentMode ? getContentMode() : null;
    return !!video && mode === 'video';
  }

  function dispatch(action) {
    if (!action) return;
    const video = getActiveVideo();
    const audio = getActiveAudio();
    switch (action.type) {
      case 'play':
        if (video) video.play().catch(() => {});
        break;
      case 'pause':
        if (video) video.pause();
        break;
      case 'togglePlay':
        if (!video) break;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
        break;
      case 'seekToRatio': {
        if (!video || !Number.isFinite(video.duration) || video.duration <= 0) break;
        const ratio = Math.max(0, Math.min(1, action.ratio || 0));
        try { video.currentTime = ratio * video.duration; } catch (e) { /* ignore */ }
        break;
      }
      case 'setRate':
        if (setPlaybackRate) setPlaybackRate(action.rate);
        else if (video && Number.isFinite(action.rate)) video.playbackRate = action.rate;
        break;
      case 'setVolume':
        if (setVolume) setVolume(action.volume);
        else if (audio && Number.isFinite(action.volume)) {
          audio.volume = Math.max(0, Math.min(1, action.volume));
          if (audio.volume > 0.001) audio.muted = false;
        }
        break;
      case 'toggleMute':
        if (toggleMute) toggleMute();
        else if (audio) audio.muted = !audio.muted;
        break;
      case 'exit':
        exit();
        break;
      default:
        break;
    }
  }

  return {
    getScreenRect,
    getViewportRect,
    getState,
    isActive,
    dispatch
  };
}
