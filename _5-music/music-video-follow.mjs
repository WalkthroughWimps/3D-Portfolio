// Muted picture follows the recorded audio clock. Never change the audio or
// wait seconds for a large startup/decoder error to converge through speed alone.
export function followRecordedVideo(video, {targetTime, rate, playing, seek = false, nowMs}, state) {
  if(!video || !Number.isFinite(targetTime)) return;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity;
  const target = Math.max(0, Math.min(duration, targetTime));
  const baseRate = Math.max(.0625, Math.min(16, rate || 1));
  const current = video.currentTime || 0;
  const drift = target - current;
  const setRate = value => { try{ video.playbackRate = value; }catch{} };
  const align = () => {
    try{ video.currentTime = target; state.lastSeekMs = nowMs; }catch{}
  };
  if(!playing || targetTime < 0 || targetTime >= duration){
    setRate(baseRate);
    try{ video.pause(); }catch{}
    if(!video.seeking && (seek || targetTime >= duration) && Math.abs(drift) > .015) align();
    return;
  }
  if(video.seeking){ setRate(baseRate); return; }
  const decoded = !Number.isFinite(video.readyState) || video.readyState >= 2;
  const needsRecovery = decoded && Math.abs(drift) > .18
    && nowMs - (state.lastSeekMs ?? -Infinity) >= 1000;
  if((seek && Math.abs(drift) > .015) || needsRecovery){
    align();
    setRate(baseRate);
  } else {
    const limit = baseRate * .06;
    const correction = Math.abs(drift) > .025 ? Math.max(-limit, Math.min(limit, drift * .5)) : 0;
    setRate(baseRate + correction);
  }
  if(video.paused && !video.ended){
    try{ video.play().catch(() => {}); }catch{}
  }
}
