// Page-neutral media transport primitives.
/* eslint-disable no-unused-vars -- preserves the moved legacy seek fallback catch blocks */
export const clampSeekRatio = ratio => Math.max(0, Math.min(1, Number(ratio) || 0));
export const syncTargetTime = (videoTime, syncMs) => Math.max(0, videoTime - (syncMs / 1000));
export function setPreservePitchFlag(media, preserve) {
  if (!media) return;
  try { media.preservesPitch = preserve; } catch (e) { /* ignore */ }
  try { media.mozPreservesPitch = preserve; } catch (e) { /* ignore */ }
  try { media.webkitPreservesPitch = preserve; } catch (e) { /* ignore */ }
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
