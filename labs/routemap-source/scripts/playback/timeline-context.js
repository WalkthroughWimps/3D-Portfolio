/* Shared timeline context and duration resolution. */
function timelineTransportMode() {
  return !state.overviewMode && Boolean(state.selectionScope === "stop" || selectedStopDayIso) && selectedStopDayIso ? "stop" : "route";
}

function timelineTransportDuration(mode = timelineTransportMode()) {
  return mode === "stop" ? stopTimelineDuration(activeStopTimelineStickers()) : 8;
}
