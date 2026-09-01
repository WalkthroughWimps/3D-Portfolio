/* Timeline progress updates bridge the route player and stop-day sticker cues. */
function setTimelineTransportProgress(mode, progress) {
  const normalized = clamp(progress, 0, 1);
  const previousProgress = timelineTransport.progress;
  const isReverseStopTick = mode === "stop" && timelineTransport.running && timelineTransport.direction < 0 && normalized < previousProgress;
  if ((normalized < previousProgress || normalized === 0) && !isReverseStopTick) lastVisibleStickerIds.clear();
  timelineTransport.progress = normalized;
  syncTimelinePlayheads(normalized);
  if (mode === "route") {
    state.playback.progress = normalized;
    state.playback.direction = timelineTransport.direction;
    state.playback.hasStarted = true;
    renderPlayback();
    refreshStickerTriggersForPlayback(normalized);
    return;
  }
  const previousSeconds = stopTimelinePlaybackSeconds;
  const nextSeconds = normalized * timelineTransportDuration("stop");
  stopTimelinePlaybackSeconds = nextSeconds;
  if (timelineTransport.scrubbing) queueTimelineScrubRender();
  else if (previousSeconds == null || normalized === 0 && !isReverseStopTick) renderStickers();
  else if (isReverseStopTick && nextSeconds < previousSeconds) reverseStopTimelineCues(previousSeconds, nextSeconds);
  else if (nextSeconds < previousSeconds) renderStickers();
  else revealStopTimelineCues(previousSeconds, nextSeconds);
  refreshStickerMediaEventsForTimeline?.({ mode: "stop", previous: previousSeconds, next: nextSeconds, direction: timelineTransport.direction || 1 });
}
