/* Completion policy for stop-day timeline previews. */
function finishStopTimelinePlayback() {
  stopTimelinePlaybackSeconds = null;
  const trip = activeTrip();
  const stop = activeJourneyStop();
  const content = activeStopDayContent?.();
  if (!trip || !stop || !content) return;
  const configured = content.timelineEndAction || "default";
  const action = configured === "default" ? normalizeTimelineDefaults(trip.timelineDefaults).dayEndAction : configured;
  if (action !== "next") {
    if (els.status) els.status.textContent = "Day timeline complete. Waiting for the main Next button.";
    return;
  }
  const dates = stopDayIsoValues(stop);
  const next = dates[dates.indexOf(selectedStopDayIso) + 1];
  if (next) {
    selectStopDay(next);
    if (els.status) els.status.textContent = "Day timeline complete. Continued to the next day.";
  } else {
    animateAdjacentStop(1);
    if (els.status) els.status.textContent = "Day timeline complete. Continued to the next stop.";
  }
}
