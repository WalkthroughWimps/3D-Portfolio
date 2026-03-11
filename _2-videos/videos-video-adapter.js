export function createVideosVideoAdapter(ctx = {}) {
  const getActiveVideo = ctx.getActiveVideo || (() => null);
  const getActiveAudio = ctx.getActiveAudio || (() => null);
  const getViewportRect = ctx.getViewportRect || (() => null);
  const getAudioSettings = ctx.getAudioSettings || null;
  const setVolume = ctx.setVolume || null;
  const toggleMute = ctx.toggleMute || null;
  const setPlaybackRate = ctx.setPlaybackRate || null;
  const exit = ctx.exit || (() => {});

  function getState() {
    const video = getActiveVideo();
    const audio = getActiveAudio();
    const audioSettings = getAudioSettings ? getAudioSettings() : null;
    const muted = audioSettings ? !!audioSettings.muted : (audio ? !!audio.muted : !!(video && video.muted));
    const volume = audioSettings ? audioSettings.volume : (audio ? (audio.volume || 0) : (video ? (video.volume || 0) : 0));
    const duration = video && isFinite(video.duration) ? video.duration : 0;
    const currentTime = video && isFinite(video.currentTime) ? video.currentTime : 0;
    const playbackRate = video && isFinite(video.playbackRate) ? video.playbackRate : 1;
    const canPlay = !!video;
    const canSeek = !!video && isFinite(duration) && duration > 0;
    const playing = !!video && !video.paused && !video.ended;
    return {
      playing,
      muted,
      volume,
      currentTime,
      duration,
      playbackRate,
      canPlay,
      canSeek
    };
  }

  function dispatch(action) {
    if (!action || !action.type) return;
    const video = getActiveVideo();
    const audio = getActiveAudio();
    switch (action.type) {
      case 'togglePlay':
        if (!video) return;
        if (video.paused) video.play().catch(() => {});
        else video.pause();
        return;
      case 'play':
        if (video) video.play().catch(() => {});
        return;
      case 'pause':
        if (video) video.pause();
        return;
      case 'seekToRatio': {
        if (!video || !isFinite(video.duration) || video.duration <= 0) return;
        const ratio = Math.max(0, Math.min(1, Number(action.ratio)));
        try { video.currentTime = video.duration * ratio; } catch (e) { /* ignore */ }
        return;
      }
      case 'setRate': {
        const rate = Number(action.rate);
        if (!isFinite(rate) || rate <= 0) return;
        if (setPlaybackRate) setPlaybackRate(rate);
        else if (video) video.playbackRate = rate;
        return;
      }
      case 'setVolume': {
        const v = Math.max(0, Math.min(1, Number(action.volume)));
        if (setVolume) setVolume(v);
        else if (audio) audio.volume = v;
        else if (video) video.volume = v;
        return;
      }
      case 'toggleMute':
        if (toggleMute) toggleMute();
        else if (audio) audio.muted = !audio.muted;
        else if (video) video.muted = !video.muted;
        return;
      case 'exit':
        exit();
        return;
      default:
        return;
    }
  }

  return {
    getViewportRect,
    getState,
    dispatch
  };
}
