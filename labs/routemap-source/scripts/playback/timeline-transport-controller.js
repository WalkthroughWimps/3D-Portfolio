/* Playback clock for route and stop timelines. */
function pauseTimelineTransport() {
  if (timelineTransport.frameId) cancelAnimationFrame(timelineTransport.frameId);
  timelineTransport.frameId = 0;
  timelineTransport.running = false;
  timelineTransport.startProgress = timelineTransport.progress;
  timelineTransport.startedAt = 0;
  if (timelineTransport.mode === "route") state.playback.active = false;
  updateTimelineTransportUi(timelineTransport.mode || timelineTransportMode());
}

function completeTimelineTransport() {
  pauseTimelineTransport();
  if (els.status) els.status.textContent = "Timeline playback stopped at the end.";
}

function tickTimelineTransport(now) {
  if (!timelineTransport.running) return;
  const duration = timelineTransportDuration(timelineTransport.mode);
  const elapsed = Math.max(0, now - timelineTransport.startedAt);
  const next = timelineTransport.startProgress + (timelineTransport.direction * elapsed * timelineTransport.speed) / (duration * 1000);
  if (next <= 0 || next >= 1) {
    setTimelineTransportProgress(timelineTransport.mode, clamp(next, 0, 1));
    if (timelineTransport.loop) {
      setTimelineTransportProgress(timelineTransport.mode, timelineTransport.direction > 0 ? 0 : 1);
      timelineTransport.startedAt = now;
      timelineTransport.startProgress = timelineTransport.progress;
    } else {
      completeTimelineTransport();
      return;
    }
  } else setTimelineTransportProgress(timelineTransport.mode, next);
  timelineTransport.frameId = requestAnimationFrame(tickTimelineTransport);
}

function playTimelineTransport(direction = 1) {
  const mode = timelineTransportMode();
  if (mode === "route" && !activeRoute()?.displayPoints?.length) return;
  if (mode === "stop" && (!activeJourneyStop() || !selectedStopDayIso)) return;
  if (timelineTransport.mode !== mode) {
    pauseTimelineTransport();
    timelineTransport.progress = mode === "route" ? clamp(state.playback.progress || 0, 0, 1) : clamp((stopTimelinePlaybackSeconds || 0) / timelineTransportDuration("stop"), 0, 1);
  }
  timelineTransport.mode = mode;
  timelineTransport.direction = direction < 0 ? -1 : 1;
  if ((timelineTransport.direction > 0 && timelineTransport.progress >= 1) || (timelineTransport.direction < 0 && timelineTransport.progress <= 0)) timelineTransport.progress = timelineTransport.direction > 0 ? 0 : 1;
  if (mode === "route") {
    stopPlayback();
    state.playback.progress = timelineTransport.progress;
    state.playback.direction = timelineTransport.direction;
    state.playback.hasStarted = true;
    state.playback.active = true;
  }
  timelineTransport.running = true;
  timelineTransport.startedAt = performance.now();
  timelineTransport.startProgress = timelineTransport.progress;
  setTimelineTransportProgress(mode, timelineTransport.progress);
  updateTimelineTransportUi(mode);
  timelineTransport.frameId = requestAnimationFrame(tickTimelineTransport);
}

function stepTimelineTransport(direction = 1) {
  const mode = timelineTransportMode();
  pauseTimelineTransport();
  timelineTransport.mode = mode;
  timelineTransport.direction = direction < 0 ? -1 : 1;
  const frame = mode === "stop" ? 1 / 30 / timelineTransportDuration(mode) : 1 / 120;
  const current = mode === "route" ? state.playback.progress || 0 : (stopTimelinePlaybackSeconds || 0) / timelineTransportDuration(mode);
  setTimelineTransportProgress(mode, current + timelineTransport.direction * frame);
  updateTimelineTransportUi(mode);
}
