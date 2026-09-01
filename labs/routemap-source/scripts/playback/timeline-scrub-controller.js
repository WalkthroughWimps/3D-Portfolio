/* Coalesced playhead rendering for rapid timeline seeking. */
function syncTimelinePlayheads(progress = timelineTransport.progress) {
  document.querySelectorAll(".route-timeline").forEach(timeline => {
    timeline.style.setProperty("--timeline-progress", String(clamp(progress, 0, 1)));
  });
}

function queueTimelineScrubRender({ final = false } = {}) {
  timelineTransport.scrubRenderFinal ||= final;
  if (timelineTransport.scrubRenderFrame) return;
  timelineTransport.scrubRenderFrame = requestAnimationFrame(() => {
    timelineTransport.scrubRenderFrame = 0;
    const shouldRender = timelineTransport.scrubbing || timelineTransport.scrubRenderFinal;
    timelineTransport.scrubRenderFinal = false;
    if (shouldRender) renderStickers();
  });
}

function finishTimelineScrub() {
  timelineTransport.scrubbing = false;
  queueTimelineScrubRender({ final: true });
}
