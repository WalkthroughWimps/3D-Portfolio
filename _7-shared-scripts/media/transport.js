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


const pendingSeeks = new WeakMap();
export function seekMediaWithFreeze(video, time, opts = {}) {
  if (!video || !Number.isFinite(time)) return;
  const audio = opts.audio || null;
  const syncMs = Number.isFinite(opts.syncMs) ? opts.syncMs : 0;
  const previous = pendingSeeks.get(video);
  const wasPlaying = !!previous?.wasPlaying || (!video.paused && !video.ended);
  const audioWasPlaying = !!previous?.audioWasPlaying || (!!audio && !audio.paused && !audio.ended);
  previous?.cancel();
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  const target = duration == null ? Math.max(0, time) : Math.max(0, Math.min(duration, time));
  const request = {wasPlaying,audioWasPlaying,cancel:cleanup};
  function cleanup(){
    video.removeEventListener?.('seeked', ready);
    video.removeEventListener?.('canplay', ready);
    if(pendingSeeks.get(video) === request) pendingSeeks.delete(video);
  }
  function resume(position = target){
    cleanup();
    if(opts.canResume && !opts.canResume()) return;
    if (audio) {
      try { audio.currentTime = Math.max(0, position - (syncMs / 1000)); } catch (e) { /* ignore */ }
      if (audioWasPlaying || wasPlaying) {
        try { audio.play().catch(() => {}); } catch (e) { /* ignore */ }
      }
    }
    if (wasPlaying) {
      try { video.play().catch(() => {}); } catch (e) { /* ignore */ }
    }
  }
  function ready(){
    if(pendingSeeks.get(video) !== request || video.seeking
      || (Number.isFinite(video.readyState) && video.readyState < 2)
      || Math.abs(video.currentTime - target) > .05) return;
    resume();
  }
  pendingSeeks.set(video, request);
  try { video.pause(); } catch (e) { /* ignore */ }
  if (audio) {
    try { audio.pause(); } catch (e) { /* ignore */ }
  }
  try {
    video.addEventListener('seeked', ready);
    video.addEventListener('canplay', ready);
  } catch (e) { /* ignore */ }
  try { video.currentTime = target; } catch (e) { resume(video.currentTime || 0); return; }
  queueMicrotask(ready);
}
