/* Timeline transport button state and accessibility labels. */
function updateTimelineTransportUi(mode = timelineTransportMode()) {
  if (timelineTransport.running && timelineTransport.mode !== mode) pauseTimelineTransport();
  const enabled = mode === "stop" ? Boolean(activeJourneyStop() && selectedStopDayIso) : Boolean(activeRoute()?.displayPoints?.length);
  [els.timelinePlayBackward, els.timelineStepBackward, els.timelineStepForward, els.timelinePlayForward, els.timelineLoop, els.timelinePlaybackSpeed]
    .filter(Boolean).forEach(control => { control.disabled = !enabled; });
  [els.timelineStepBackward, els.timelineStepForward].filter(Boolean).forEach(control => { control.disabled = !enabled || timelineTransport.running; });
  if (els.timelineLoop) els.timelineLoop.setAttribute("aria-pressed", String(timelineTransport.loop));
  [els.timelinePlayBackward, els.timelinePlayForward].filter(Boolean).forEach(button => {
    const direction = button === els.timelinePlayBackward ? -1 : 1;
    const active = timelineTransport.running && timelineTransport.direction === direction;
    button.textContent = active ? "\u23F8" : direction < 0 ? "\u25C0" : "\u25B6";
    button.title = active ? "Pause timeline" : direction < 0 ? "Play backward" : "Play forward";
    button.setAttribute("aria-label", button.title);
    button.classList.toggle("is-active", active);
  });
  if (els.timelinePlaybackSpeed) els.timelinePlaybackSpeed.value = String(timelineTransport.speed);
}
