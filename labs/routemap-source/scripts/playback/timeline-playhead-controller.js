/* Timeline playhead creation and pointer-driven seeking. */
function appendTimelinePlayhead(timeline, mode) {
  const playhead = document.createElement("button");
  playhead.type = "button";
  playhead.className = "timeline-playhead";
  playhead.setAttribute("aria-label", "Set timeline playhead");
  const progress = mode === "route" ? state.playback.progress || 0 : (stopTimelinePlaybackSeconds || 0) / timelineTransportDuration("stop");
  timeline.style.setProperty("--timeline-progress", String(clamp(progress, 0, 1)));
  playhead.style.setProperty("--timeline-playhead-height", `${Math.max(0, timeline.clientHeight - 16)}px`);
  const setFromPointer = event => {
    const lane = timeline.querySelector(".timeline-lane");
    const rect = lane?.getBoundingClientRect();
    if (!rect?.width) return;
    setTimelineTransportProgress(mode, clamp((event.clientX - rect.left) / rect.width, 0, 1));
  };
  playhead.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    pauseTimelineTransport();
    timelineTransport.scrubbing = true;
    setFromPointer(event);
    const move = next => { if (next.pointerId === event.pointerId) setFromPointer(next); };
    const finish = next => {
      if (next.pointerId !== event.pointerId) return;
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", finish, true);
      finishTimelineScrub();
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", finish, true);
  });
  timeline.append(playhead);
  const seekFromEvent = event => {
    const lane = event.target.closest?.(".timeline-lane") || timeline.querySelector(".timeline-lane");
    const isRuler = Boolean(event.target.closest?.(".timeline-time-ruler"));
    if (!lane || (!isRuler && !event.target.closest?.(".timeline-lane"))) return;
    if (event.target.closest(".timeline-sticker-block, .timeline-group-block, .timeline-playhead")) return;
    event.preventDefault();
    const rect = lane.getBoundingClientRect();
    setTimelineTransportProgress(mode, clamp((event.clientX - rect.left) / rect.width, 0, 1));
  };
  timeline.addEventListener("pointerdown", event => {
    const lane = event.target.closest?.(".timeline-lane") || timeline.querySelector(".timeline-lane");
    const isRuler = Boolean(event.target.closest?.(".timeline-time-ruler"));
    if (!lane || (!isRuler && !event.target.closest?.(".timeline-lane"))) return;
    if (event.target.closest(".timeline-sticker-block, .timeline-group-block, .timeline-playhead")) return;
    event.preventDefault();
    const startX = event.clientX;
    timelineTransport.scrubbing = true;
    seekFromEvent(event);
    const move = next => {
      if (next.pointerId !== event.pointerId || Math.abs(next.clientX - startX) < 6) return;
      seekFromEvent(next);
    };
    const finish = next => {
      if (next.pointerId !== event.pointerId) return;
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", finish, true);
      finishTimelineScrub();
    };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", finish, true);
  }, { capture: true });
  timeline.addEventListener("click", event => {
    if (event.detail === 0) seekFromEvent(event);
  }, { capture: true });
}
