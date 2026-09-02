/* Leaflet-specific saved-path tools for sticker animations. */
let stickerPathDraft = null;

function nearestPointOnActiveRoute(latlng) {
  const points = activeRoute()?.displayPoints || activeRoute()?.points || [];
  if (!points.length) return latlng;
  return points.reduce((nearest, point) => {
    const candidate = L.latLng(point.lat, point.lon);
    return map.distance(latlng, candidate) < map.distance(latlng, nearest) ? candidate : nearest;
  }, L.latLng(points[0].lat, points[0].lon));
}

function beginStickerPathDrawing() {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  stickerPathDraft?.layer?.remove();
  stickerPathDraft = { sticker, points: [], layer: L.polyline([], { color: "#ffcf46", weight: 4, dashArray: "6 5" }).addTo(map) };
  if (els.drawStickerPath) els.drawStickerPath.disabled = true;
  if (els.finishStickerPath) els.finishStickerPath.disabled = false;
  if (els.status) els.status.textContent = "Click the map to add path points, then choose Finish path.";
}

function finishStickerPathDrawing() {
  const draft = stickerPathDraft; if (!draft) return;
  if (draft.points.length >= 2) {
    draft.sticker.animation = { ...stickerAnimation(draft.sticker), customPath: draft.points.map(point => ({ lat: point.lat, lon: point.lng })), pathFollowRoute: Boolean(els.snapStickerPathToRoute?.checked) };
    saveTrips(); markProjectDirty("journeys");
  }
  draft.layer.remove(); stickerPathDraft = null;
  if (els.drawStickerPath) els.drawStickerPath.disabled = false;
  if (els.finishStickerPath) els.finishStickerPath.disabled = true;
  renderStickerAnimationEditor();
}

function clearStickerPath() {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  sticker.animation = { ...stickerAnimation(sticker), customPath: [], pathFollowRoute: false };
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
}

function customStickerPathOffset(path, progress) {
  if (!Array.isArray(path) || path.length < 2) return { x: 0, y: 0 };
  const origin = map.latLngToLayerPoint([path[0].lat, path[0].lon]);
  const scaled = clamp(progress, 0, 1) * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(scaled)); const amount = scaled - index;
  const from = path[index], to = path[index + 1];
  const point = map.latLngToLayerPoint([from.lat + (to.lat - from.lat) * amount, from.lon + (to.lon - from.lon) * amount]);
  return { x: point.x - origin.x, y: point.y - origin.y };
}
