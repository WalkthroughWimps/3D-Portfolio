"use strict";

// Media presentation controls and interactive placeholder transforms.

function startMediaPlaceholderTransform(event) {
  if (event.button !== 0 && event.pointerType !== "touch") return;
  const box = event.currentTarget;
  const handle = event.target.closest("[data-media-style-handle]")?.dataset.mediaStyleHandle || "move";
  const style = mediaLayoutPreviewMode ? mediaPresentationState.defaultStyle : selectedMediaPresentationStyle({ resolved: false });
  if (!mediaStyleEditingDefault && style.useDefault) {
    const localStyle = selectedMediaPresentationStyle({ resolved: true });
    Object.assign(style, localStyle, { useDefault: false });
    if (els.mediaUseDefaultStyle) els.mediaUseDefaultStyle.checked = false;
  }
  const viewport = mediaPresentationViewportRect?.();
  const stage = els.mapCanvas?.closest(".map-stage")?.getBoundingClientRect();
  if (!viewport || !stage) return;
  event.preventDefault();
  box.setPointerCapture?.(event.pointerId);
  const boxRect = box.getBoundingClientRect();
  const minimumWidth = Math.min(70, viewport.width);
  const minimumHeight = Math.min(55, viewport.height);
  const start = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    left: clamp(boxRect.left - viewport.left, 0, Math.max(0, viewport.width - minimumWidth)),
    top: clamp(boxRect.top - viewport.top, 0, Math.max(0, viewport.height - minimumHeight)),
    width: clamp(boxRect.width, minimumWidth, viewport.width),
    height: clamp(boxRect.height, minimumHeight, viewport.height)
  };
  start.right = Math.min(viewport.width, start.left + start.width);
  start.bottom = Math.min(viewport.height, start.top + start.height);
  const move = moveEvent => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const dx = moveEvent.clientX - start.pointerX;
    const dy = moveEvent.clientY - start.pointerY;
    let { left, top, right, bottom } = start;
    if (handle === "move") {
      const width = right - left;
      const height = bottom - top;
      left = clamp(left + dx, 0, Math.max(0, viewport.width - width));
      top = clamp(top + dy, 0, Math.max(0, viewport.height - height));
      right = left + width;
      bottom = top + height;
    } else {
      if (handle.includes("e")) right = clamp(start.right + dx, start.left + minimumWidth, viewport.width);
      if (handle.includes("s")) bottom = clamp(start.bottom + dy, start.top + minimumHeight, viewport.height);
      if (handle.includes("w")) left = clamp(start.left + dx, 0, start.right - minimumWidth);
      if (handle.includes("n")) top = clamp(start.top + dy, 0, start.bottom - minimumHeight);
    }
    Object.assign(style, {
      x: left / viewport.width,
      y: top / viewport.height,
      width: (right - left) / viewport.width,
      height: (bottom - top) / viewport.height
    });
    box.style.left = `${viewport.left - stage.left + left}px`;
    box.style.top = `${viewport.top - stage.top + top}px`;
    box.style.width = `${right - left}px`;
    box.style.height = `${bottom - top}px`;
  };
  const finish = finishEvent => {
    if (finishEvent?.pointerId !== undefined && finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", finish);
    saveMediaPresentationState();
    renderMediaStylePlaceholder();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", finish);
}

function renderMediaLayoutPresets() {
  if (!els.mediaLayoutPresetGrid) return;
  els.mediaLayoutPresetGrid.replaceChildren();
  mediaPresentationState.layouts.forEach(layout => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "media-layout-preset-card";
    button.classList.toggle("is-selected", layout.id === mediaPresentationState.selectedLayout);
    button.dataset.mediaLayoutId = layout.id;
    const preview = document.createElement("span");
    preview.className = "media-layout-mini-preview";
    preview.append(createMediaLayoutPreviewContent(layout));
    const name = document.createElement("span");
    name.className = "media-layout-preset-name";
    name.textContent = layout.name;
    button.setAttribute("aria-label", layout.name);
    button.title = layout.name;
    button.append(preview, name);
    button.addEventListener("click", () => {
      mediaPresentationState.selectedLayout = layout.id;
      mediaLayoutPreviewMode = true;
      mediaStyleEditingDefault = false;
      els.mediaLayoutColumns.value = String(layout.columns);
      els.mediaLayoutGap.value = String(layout.gap);
      els.mediaLayoutFrame.checked = layout.frame !== false;
      els.mediaLayoutFramePadding.value = String(layout.framePadding || 0);
      els.mediaLayoutFrameRadius.value = String(layout.frameRadius || 0);
      saveMediaPresentationState();
      renderMediaLayoutPresets();
      renderMediaStylePlaceholder();
    });
    els.mediaLayoutPresetGrid.append(button);
  });
  const selected = mediaPresentationState.layouts.find(layout => layout.id === mediaPresentationState.selectedLayout);
  if (selected) {
    els.mediaLayoutName.value = selected.name;
    els.mediaLayoutColumns.value = String(selected.columns);
    els.mediaLayoutGap.value = String(selected.gap);
    els.mediaLayoutFrame.checked = selected.frame !== false;
    els.mediaLayoutFramePadding.value = String(selected.framePadding || 0);
    els.mediaLayoutFrameRadius.value = String(selected.frameRadius || 0);
    els.mediaDeleteLayout.disabled = Boolean(selected.builtin);
    els.mediaUpdateLayout.disabled = Boolean(selected.builtin);
    renderMediaLayoutSlots(selected);
  }
}

function renderMediaLayoutSlots(layout) {
  const list = els.mediaLayoutSlotList;
  if (!list || !layout) return;
  const slots = normalizeMediaLayoutSlots(layout.slots, layout.template);
  layout.slots = slots;
  list.replaceChildren();
  slots.forEach((slot, index) => {
    const row = document.createElement("div");
    row.className = "media-layout-slot-row";
    const type = document.createElement("select");
    type.setAttribute("aria-label", `Slot ${index + 1} type`);
    ["image", "video", "audio", "text"].forEach(kind => type.append(new Option(kind[0].toUpperCase() + kind.slice(1), kind, false, kind === slot.kind)));
    const label = document.createElement("input");
    label.type = "text";
    label.maxLength = 60;
    label.value = slot.label;
    label.setAttribute("aria-label", `Slot ${index + 1} label`);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.disabled = slots.length <= 1 || layout.builtin;
    const commit = () => {
      if (layout.builtin) return;
      slot.kind = type.value;
      slot.label = label.value.trim() || `Content ${index + 1}`;
      layout.template = "custom";
      saveMediaPresentationState();
      mediaLayoutPreviewMode = true;
      renderMediaStylePlaceholder();
    };
    type.addEventListener("change", commit);
    label.addEventListener("change", commit);
    remove.addEventListener("click", () => {
      if (layout.builtin || layout.slots.length <= 1) return;
      layout.slots.splice(index, 1);
      layout.template = "custom";
      saveMediaPresentationState();
      renderMediaLayoutPresets();
      renderMediaStylePlaceholder();
    });
    type.disabled = layout.builtin;
    label.disabled = layout.builtin;
    row.append(type, label, remove);
    list.append(row);
  });
  if (els.mediaAddLayoutSlot) els.mediaAddLayoutSlot.disabled = Boolean(layout.builtin) || slots.length >= 12;
}

function copySelectedMediaLayout({ name = "" } = {}) {
  const source = mediaPresentationState.layouts.find(item => item.id === mediaPresentationState.selectedLayout);
  if (!source) return null;
  const layout = {
    ...cloneMediaLayout(source),
    id: `media-layout-${Date.now()}`,
    name: name || `${source.name} copy`,
    template: "custom",
    builtin: false
  };
  mediaPresentationState.layouts.push(layout);
  mediaPresentationState.selectedLayout = layout.id;
  return layout;
}

function renderMediaStyleEditor() {
  if (!els.mediaStyleType) return;
  const stored = selectedMediaPresentationStyle({ resolved: false });
  const style = selectedMediaPresentationStyle({ resolved: true });
  document.querySelectorAll("[data-media-style-type]").forEach(button => {
    button.classList.toggle("is-selected", !mediaLayoutPreviewMode && !mediaStyleEditingDefault && button.dataset.mediaStyleType === els.mediaStyleType.value);
  });
  els.mediaUseDefaultStyle.checked = !mediaStyleEditingDefault && stored.useDefault;
  els.mediaUseDefaultStyle.disabled = mediaStyleEditingDefault;
  els.mediaStyleBackground.value = style.background;
  els.mediaStyleBorder.value = style.border;
  els.mediaStyleText.value = style.text;
  els.mediaStyleRadius.value = String(style.radius);
  els.mediaStyleBorderWidth.value = String(style.borderWidth);
  els.mediaStylePadding.value = String(style.padding);
  els.mediaStyleShadow.value = String(style.shadow);
  els.mediaStyleFit.value = style.fit;
  els.mediaFullscreenEnabled.checked = style.fullscreen;
  els.mediaFullscreenTarget.hidden = !style.fullscreen;
  els.mediaFullscreenTarget.value = style.fullscreenTarget;
  const inherited = !mediaStyleEditingDefault && stored.useDefault;
  [els.mediaStyleBackground, els.mediaStyleBorder, els.mediaStyleText, els.mediaStyleRadius,
    els.mediaStyleBorderWidth, els.mediaStylePadding, els.mediaStyleShadow, els.mediaStyleFit,
    els.mediaFullscreenEnabled, els.mediaFullscreenTarget].forEach(control => { if (control) control.disabled = inherited; });
  els.mediaMapVisibility.value = mediaPresentationState.map.visibility;
  els.mediaMapBlend.value = mediaPresentationState.map.blend;
  els.mediaMapOpacity.value = String(mediaPresentationState.map.opacity);
  els.mediaMapBlur.value = String(mediaPresentationState.map.blur);
  renderMediaLayoutPresets();
  renderMediaStylePlaceholder();
}

function updateMediaStyleFromControls() {
  const style = selectedMediaPresentationStyle({ resolved: false });
  Object.assign(style, {
    background: els.mediaStyleBackground.value,
    border: els.mediaStyleBorder.value,
    text: els.mediaStyleText.value,
    radius: Number(els.mediaStyleRadius.value),
    borderWidth: Number(els.mediaStyleBorderWidth.value),
    padding: Number(els.mediaStylePadding.value),
    shadow: Number(els.mediaStyleShadow.value),
    fit: els.mediaStyleFit.value,
    fullscreen: els.mediaFullscreenEnabled.checked,
    fullscreenTarget: els.mediaFullscreenTarget.value
  });
  els.mediaFullscreenTarget.hidden = !style.fullscreen;
  saveMediaPresentationState();
  renderMediaStylePlaceholder();
}

function initializeMediaEditor() {
  els.mediaStyleType?.addEventListener("change", () => {
    mediaStyleEditingDefault = false;
    mediaLayoutPreviewMode = false;
    renderMediaStyleEditor();
  });
  document.querySelectorAll("[data-media-style-type]").forEach(button => {
    button.addEventListener("click", () => {
      els.mediaStyleType.value = button.dataset.mediaStyleType;
      mediaStyleEditingDefault = false;
      mediaLayoutPreviewMode = false;
      renderMediaStyleEditor();
    });
  });
  els.mediaShowDefaultPlaceholder?.addEventListener("click", () => {
    mediaStyleEditingDefault = true;
    mediaLayoutPreviewMode = false;
    renderMediaStyleEditor();
  });
  els.mediaUseDefaultStyle?.addEventListener("change", () => {
    selectedMediaPresentationStyle({ resolved: false }).useDefault = els.mediaUseDefaultStyle.checked;
    saveMediaPresentationState();
    renderMediaStyleEditor();
  });
  [els.mediaStyleBackground, els.mediaStyleBorder, els.mediaStyleText, els.mediaStyleRadius,
    els.mediaStyleBorderWidth, els.mediaStylePadding, els.mediaStyleShadow, els.mediaStyleFit,
    els.mediaFullscreenEnabled, els.mediaFullscreenTarget].forEach(control => {
    control?.addEventListener("input", updateMediaStyleFromControls);
    control?.addEventListener("change", updateMediaStyleFromControls);
  });
  [els.mediaMapVisibility, els.mediaMapBlend, els.mediaMapOpacity, els.mediaMapBlur].forEach(control => {
    control?.addEventListener("input", () => {
      mediaPresentationState.map = {
        visibility: els.mediaMapVisibility.value,
        blend: els.mediaMapBlend.value,
        opacity: Number(els.mediaMapOpacity.value),
        blur: Number(els.mediaMapBlur.value)
      };
      saveMediaPresentationState();
      applyMediaMapTreatment(activePanelTabId() === "media" || !els.mediaViewer?.hidden);
    });
  });
  els.mediaUpdateLayout?.addEventListener("click", () => {
    const layout = mediaPresentationState.layouts.find(item => item.id === mediaPresentationState.selectedLayout);
    if (!layout || layout.builtin) return;
    layout.name = els.mediaLayoutName.value.trim() || layout.name;
    layout.columns = clamp(Math.round(Number(els.mediaLayoutColumns.value) || 1), 1, 6);
    layout.gap = clamp(Number(els.mediaLayoutGap.value) || 0, 0, 80);
    layout.frame = els.mediaLayoutFrame.checked;
    layout.framePadding = clamp(Number(els.mediaLayoutFramePadding.value) || 0, 0, 80);
    layout.frameRadius = clamp(Number(els.mediaLayoutFrameRadius.value) || 0, 0, 80);
    layout.template = "custom";
    saveMediaPresentationState();
    renderMediaLayoutPresets();
  });
  els.mediaDuplicateLayout?.addEventListener("click", () => {
    if (!copySelectedMediaLayout()) return;
    saveMediaPresentationState();
    mediaLayoutPreviewMode = true;
    renderMediaLayoutPresets();
    renderMediaStylePlaceholder();
  });
  els.mediaAddLayoutSlot?.addEventListener("click", () => {
    const layout = mediaPresentationState.layouts.find(item => item.id === mediaPresentationState.selectedLayout);
    if (!layout || layout.builtin || layout.slots?.length >= 12) return;
    layout.slots = normalizeMediaLayoutSlots(layout.slots, layout.template);
    layout.slots.push({ id: `slot-${Date.now()}`, kind: "text", label: "New content" });
    layout.template = "custom";
    saveMediaPresentationState();
    renderMediaLayoutPresets();
    renderMediaStylePlaceholder();
  });
  els.mediaEditLayout?.addEventListener("click", () => {
    mediaLayoutPreviewMode = true;
    renderMediaStylePlaceholder();
    els.mediaLayoutColumns?.focus();
  });
  [els.mediaLayoutColumns, els.mediaLayoutGap, els.mediaLayoutFrame, els.mediaLayoutFramePadding, els.mediaLayoutFrameRadius].forEach(control => {
    control?.addEventListener("input", () => {
      const layout = mediaPresentationState.layouts.find(item => item.id === mediaPresentationState.selectedLayout);
      if (!layout) return;
      layout.columns = clamp(Math.round(Number(els.mediaLayoutColumns.value) || 1), 1, 6);
      layout.gap = clamp(Number(els.mediaLayoutGap.value) || 0, 0, 80);
      layout.frame = els.mediaLayoutFrame.checked;
      layout.framePadding = clamp(Number(els.mediaLayoutFramePadding.value) || 0, 0, 80);
      layout.frameRadius = clamp(Number(els.mediaLayoutFrameRadius.value) || 0, 0, 80);
      mediaLayoutPreviewMode = true;
      renderMediaStylePlaceholder();
    });
  });
  els.mediaSaveLayout?.addEventListener("click", () => {
    const name = window.prompt("Name this media layout preset:", "New media layout")?.trim();
    if (!name) return;
    const layout = {
      id: `media-layout-${Date.now()}`,
      name,
      columns: clamp(Math.round(Number(els.mediaLayoutColumns.value) || 1), 1, 6),
      gap: clamp(Number(els.mediaLayoutGap.value) || 0, 0, 80),
      template: "custom",
      frame: els.mediaLayoutFrame.checked,
      framePadding: clamp(Number(els.mediaLayoutFramePadding.value) || 0, 0, 80),
      frameRadius: clamp(Number(els.mediaLayoutFrameRadius.value) || 0, 0, 80),
      builtin: false,
      slots: normalizeMediaLayoutSlots(mediaPresentationState.layouts.find(item => item.id === mediaPresentationState.selectedLayout)?.slots, mediaPresentationState.layouts.find(item => item.id === mediaPresentationState.selectedLayout)?.template)
    };
    mediaPresentationState.layouts.push(layout);
    mediaPresentationState.selectedLayout = layout.id;
    saveMediaPresentationState();
    renderMediaLayoutPresets();
  });
  els.mediaDeleteLayout?.addEventListener("click", () => {
    const layout = mediaPresentationState.layouts.find(item => item.id === mediaPresentationState.selectedLayout);
    if (!layout || layout.builtin) return;
    mediaPresentationState.layouts = mediaPresentationState.layouts.filter(item => item.id !== layout.id);
    mediaPresentationState.selectedLayout = mediaPresentationState.layouts[0]?.id || "story";
    saveMediaPresentationState();
    renderMediaLayoutPresets();
  });


}

function tripMediaTargetKind() {
  // Stops are containers for days only. Keep the old value readable so older
  // saved UI state cannot send new media back onto a stop object.
  return ["stop", "stop-day"].includes(els.tripMediaTarget?.value) ? "stop-day" : "route";
}

function migrateLegacyStopMedia(stop = activeJourneyStop()) {
  if (!stop?.media?.length) return;
  const dayIso = stop === activeJourneyStop() ? (selectedStopDayIso || stopDayIsoValues(stop)[0]) : stopDayIsoValues(stop)[0];
  if (!dayIso) return;
  stop.dayContent ||= {};
  stop.dayContent[dayIso] ||= { media: [], stickers: [], timelineEndAction: "default" };
  stop.dayContent[dayIso].media ||= [];
  stop.dayContent[dayIso].media.push(...stop.media);
  stop.media = [];
  saveTrips?.();
}

function activeTripMediaOwner() {
  if (tripMediaTargetKind() === "stop-day") {
    migrateLegacyStopMedia();
    return activeStopDayContent();
  }
  return activeRoute();
}

function selectedTripMedia() {
  return activeTripMediaOwner()?.media?.find(item => item.id === selectedTripMediaId) || null;
}

function findTripMediaRecord(id) {
  const trip = activeTrip();
  if (!trip || !id) return null;
  for (const route of trip.days || []) {
    const item = route.media?.find(media => media.id === id);
    if (item) return { item, owner: route, route, target: "route" };
  }
  for (const stop of synchronizeTripStops(trip)) {
    // Old projects may still contain stop-owned records. Move them onto the
    // first authored day before looking up current records.
    migrateLegacyStopMedia(stop);
    for (const [iso, content] of Object.entries(stop.dayContent || {})) {
      const dayItem = content?.media?.find(media => media.id === id);
      if (dayItem) return { item: dayItem, owner: content, route: activeRoute(), target: "stop-day", day: iso };
    }
  }
  return null;
}

function routeMidpoint(route) {
  const points = route?.displayPoints?.length ? route.displayPoints : route?.points;
  return points?.length ? points[Math.floor((points.length - 1) / 2)] : null;
}

function mediaDefaultPoint(route, index = 0) {
  const points = route?.displayPoints?.length ? route.displayPoints : route?.points;
  if (!points?.length) return null;
  const fraction = (index + 1) / (index + 2);
  return points[Math.round((points.length - 1) * fraction)];
}

function nearestRoutePoint(route, lat, lon) {
  const points = route?.displayPoints?.length ? route.displayPoints : route?.points || [];
  if (!points.length) return { lat, lon };
  const target = L.latLng(lat, lon);
  return points.reduce((nearest, point) => {
    const distance = target.distanceTo(L.latLng(point.lat, point.lon));
    return distance < nearest.distance ? { lat: point.lat, lon: point.lon, distance } : nearest;
  }, { lat: points[0].lat, lon: points[0].lon, distance: Infinity });
}

function mediaRouteProgress(route, item) {
  const points = route?.displayPoints?.length ? route.displayPoints : route?.points || [];
  if (points.length < 2 || !Number.isFinite(item?.lat) || !Number.isFinite(item?.lon)) {
    return Infinity;
  }
  const target = map.project(L.latLng(item.lat, item.lon), 18);
  let closestDistanceSquared = Infinity;
  let closestProgress = Infinity;
  let traversedDistance = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const projectedStart = map.project(L.latLng(start.lat, start.lon), 18);
    const projectedEnd = map.project(L.latLng(end.lat, end.lon), 18);
    const deltaX = projectedEnd.x - projectedStart.x;
    const deltaY = projectedEnd.y - projectedStart.y;
    const segmentLengthSquared = deltaX ** 2 + deltaY ** 2;
    const projection = segmentLengthSquared
      ? clamp(
          ((target.x - projectedStart.x) * deltaX + (target.y - projectedStart.y) * deltaY)
            / segmentLengthSquared,
          0,
          1
        )
      : 0;
    const nearestX = projectedStart.x + deltaX * projection;
    const nearestY = projectedStart.y + deltaY * projection;
    const distanceSquared = (target.x - nearestX) ** 2 + (target.y - nearestY) ** 2;
    const segmentDistance = L.latLng(start.lat, start.lon).distanceTo(L.latLng(end.lat, end.lon));

    if (distanceSquared < closestDistanceSquared) {
      closestDistanceSquared = distanceSquared;
      closestProgress = traversedDistance + segmentDistance * projection;
    }
    traversedDistance += segmentDistance;
  }

  return closestProgress;
}

function applyAutomaticMediaOrder(owner, route = activeRoute()) {
  if (!owner) return;
  owner.media ||= [];
  if (owner === route) {
    owner.media.forEach(item => ensureMediaLocation(item, route));
  } else {
    owner.media.forEach((item, index) => ensureStopMediaLocation(item, owner, index));
  }
  if (owner !== route || owner.mediaManualOrder || owner.media.length < 2) return;
  const originalOrder = new Map(owner.media.map((item, index) => [item.id, index]));
  owner.media.sort((first, second) => {
    const progressDifference = mediaRouteProgress(route, first) - mediaRouteProgress(route, second);
    return Number.isFinite(progressDifference) && Math.abs(progressDifference) > 0.01
      ? progressDifference
      : originalOrder.get(first.id) - originalOrder.get(second.id);
  });
}

function ensureStopMediaLocation(item, stop, index = 0) {
  if (item?.stopPositionCustom && Number.isFinite(item.lat) && Number.isFinite(item.lon)) return;
  if (!Number.isFinite(stop?.lat) || !Number.isFinite(stop?.lon)) return;
  const ring = Math.floor(index / 8) + 1;
  const angle = -Math.PI / 2 + (index % 8) * Math.PI / 4;
  const radius = 54 * ring;
  if (typeof map !== "undefined" && map?.latLngToLayerPoint && typeof L !== "undefined") {
    const stopPoint = map.latLngToLayerPoint(L.latLng(stop.lat, stop.lon));
    const displayPoint = stopPoint.add(L.point(Math.cos(angle) * radius, Math.sin(angle) * radius));
    const displayLocation = map.layerPointToLatLng(displayPoint);
    item.lat = displayLocation.lat;
    item.lon = displayLocation.lng;
  } else {
    const offset = 0.0045 * ring;
    item.lat = stop.lat + Math.sin(angle) * offset;
    item.lon = stop.lon + Math.cos(angle) * offset;
  }
  item.sourceLat = stop.lat;
  item.sourceLon = stop.lon;
  item.stopPositionCustom = false;
  item.address = stop.address || stop.name || "Stop";
  item.routeAnchor = null;
}

function placeMediaForOwner(item, owner, route, lat, lon, address = "") {
  if (owner === route) {
    placeMediaNearRoute(item, route, lat, lon, address);
    return;
  }
  item.sourceLat = lat;
  item.sourceLon = lon;
  item.lat = lat;
  item.lon = lon;
  item.stopPositionCustom = true;
  item.address = address || owner?.address || owner?.name || "Stop";
  item.routeAnchor = null;
}

function placeMediaNearRoute(item, route, lat, lon, address = "") {
  const snapped = nearestRoutePoint(route, lat, lon);
  item.sourceLat = lat;
  item.sourceLon = lon;
  item.lat = snapped.lat;
  item.lon = snapped.lon;
  item.address = address;
  item.routeAnchor = null;
}

function ensureMediaLocation(item, route) {
  if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) return;
  const midpoint = routeMidpoint(route);
  if (midpoint) placeMediaNearRoute(item, route, midpoint.lat, midpoint.lon);
}

function snapMediaToRouteEndpoint(item, route, endpoint) {
  const points = route?.displayPoints?.length ? route.displayPoints : route?.points || [];
  const point = endpoint === "start" ? points[0] : points[points.length - 1];
  if (!item || !point) return;
  item.sourceLat = point.lat;
  item.sourceLon = point.lon;
  item.lat = point.lat;
  item.lon = point.lon;
  item.address = endpoint === "start" ? "Route start" : "Route end";
  item.routeAnchor = endpoint;
}

function mediaTypeLabel(item) {
  return item.kind === "image" ? "Picture"
    : item.kind === "video" ? "Video"
      : item.kind === "youtube" ? "YouTube video"
      : item.kind === "audio" ? "Audio"
        : item.kind === "null" ? "NULL timeline cue"
        : item.kind === "preset" ? "Media preset"
        : "Text / blog";
}

function createMediaThumb(item) {
  const thumb = document.createElement("span");
  thumb.className = "trip-media-list-thumb";
  thumb.style.setProperty("--media-pin-color", item.pinColor || MEDIA_PIN_COLORS[item.kind] || MEDIA_PIN_COLORS.blog);
  const previewUrl = item.customThumbnailUrl || item.thumbnailUrl || (item.kind === "image" ? item.url : "");
  if (previewUrl) {
    const image = document.createElement("img");
    image.src = previewUrl;
    image.alt = "";
    thumb.append(image);
  } else {
    thumb.textContent = MEDIA_PIN_SYMBOLS[item.kind] || "M";
  }
  return thumb;
}

function currentBlogDraftKey() {
  const selected = selectedTripMedia();
  return selected?.kind === "blog" ? selected.id : NEW_BLOG_DRAFT_KEY;
}

function blogEditorValues() {
  return {
    name: els.tripBlogTitle.value,
    text: els.tripBlogText.value
  };
}

function saveBlogEditorDraft() {
  if (els.tripBlogTitle.disabled) return;
  blogDrafts.set(currentBlogDraftKey(), blogEditorValues());
}

function updateBlogEditorState() {
  const selected = selectedTripMedia();
  const selectedBlog = selected?.kind === "blog" ? selected : null;
  const values = blogEditorValues();
  const modified = Boolean(selectedBlog)
    && (values.name !== selectedBlog.name || values.text !== selectedBlog.text);
  els.tripBlogTitle.classList.toggle("is-modified", modified);
  els.tripBlogText.classList.toggle("is-modified", modified);
  els.updateTripBlog.disabled = !selectedBlog;
}

function populateBlogEditor() {
  const selected = selectedTripMedia();
  const selectedBlog = selected?.kind === "blog" ? selected : null;
  const key = selectedBlog?.id || NEW_BLOG_DRAFT_KEY;
  const draft = blogDrafts.get(key);
  els.tripBlogTitle.value = draft?.name ?? selectedBlog?.name ?? "";
  els.tripBlogText.value = draft?.text ?? selectedBlog?.text ?? "";
  [els.tripBlogTitle, els.tripBlogText].forEach(clearRequiredState);
  updateBlogEditorState();
}

function rememberRouteAddresses(route, ...addresses) {
  if (!route) return;
  route.addressHistory ||= [];
  const existing = new Set(route.addressHistory.map(address => address.toLocaleLowerCase()));
  addresses.forEach(value => {
    const address = String(value || "").trim();
    const key = address.toLocaleLowerCase();
    if (!address || existing.has(key) || ["day start", "day end", "route start", "route end"].includes(key)) return;
    route.addressHistory.push(address);
    existing.add(key);
  });
}

function renderTripMediaAddressList(route, owner = route) {
  const syntheticAddresses = new Set(["Day start", "Day end", "Route start", "Route end"]);
  const addresses = [
    ...(route?.addressHistory || []),
    route?.startAddress,
    route?.endAddress,
    owner?.address,
    ...(owner?.media || []).map(item => item.address)
  ]
    .map(address => String(address || "").trim())
    .filter(address => address && !syntheticAddresses.has(address));
  const uniqueAddresses = [...new Map(addresses.map(address => [address.toLocaleLowerCase(), address])).values()];
  els.tripMediaSavedAddress.replaceChildren(
    new Option(uniqueAddresses.length ? "Choose an address" : "No saved addresses yet", ""),
    ...uniqueAddresses.map(address => new Option(address, address))
  );
  els.tripMediaSavedAddress.disabled = !uniqueAddresses.length;
}

function selectTripMedia(item) {
  saveBlogEditorDraft();
  selectedTripMediaId = item?.id || null;
  pendingMediaPinId = null;
  els.mapCanvas.classList.remove("is-placing-media-pin");
  renderTripMedia();
  if (item) previewTripMedia(item);
}

function renderTripMedia() {
  if (!els.tripMediaList || !els.tripMediaPreview) return;
  const route = activeRoute();
  const owner = activeTripMediaOwner();
  applyAutomaticMediaOrder(owner, route);
  renderTripMediaAddressList(route, owner);
  const media = owner?.media || [];
  els.manualMediaOrder.checked = Boolean(owner?.mediaManualOrder);
  els.manualMediaOrder.disabled = !owner;
  if (els.tripMediaNumberingStyle) {
    els.tripMediaNumberingStyle.value = owner?.mediaNumberingStyle || "decimal";
    els.tripMediaNumberingStyle.disabled = !owner;
  }
  if (selectedTripMediaId && !media.some(item => item.id === selectedTripMediaId)) {
    selectedTripMediaId = null;
  }
  populateBlogEditor();
  els.tripMediaList.replaceChildren();
  els.tripMediaPreview.replaceChildren();
  els.tripMediaPreview.hidden = true;

  media.forEach((item, index) => {
    if (owner === route) ensureMediaLocation(item, route);
    else ensureStopMediaLocation(item, owner, index);
    const row = document.createElement("div");
    row.className = "trip-media-row";
    row.classList.toggle("is-manual-order", Boolean(owner.mediaManualOrder));
    row.dataset.mediaId = item.id;
    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "trip-media-drag-handle";
    dragHandle.setAttribute("aria-label", `Drag to reorder ${item.name}`);
    dragHandle.title = "Drag to reorder";
    dragHandle.hidden = !owner.mediaManualOrder;
    const dragLines = document.createElement("span");
    dragLines.setAttribute("aria-hidden", "true");
    dragHandle.append(dragLines);
    const open = document.createElement("button");
    open.type = "button";
    open.className = "trip-media-open";
    open.setAttribute("aria-pressed", String(item.id === selectedTripMediaId));
    const copy = document.createElement("span");
    copy.className = "trip-media-open-copy";
    const name = document.createElement("strong");
    const orderLabel = mediaOrderLabel(index + 1, owner.mediaNumberingStyle || "decimal");
    name.textContent = `${orderLabel ? `${orderLabel}. ` : ""}${item.name}`;
    const detail = document.createElement("span");
    detail.textContent = `${mediaTypeLabel(item)}${Number.isFinite(item.lat) ? " - pinned" : ""}${item.kind !== "blog" && !item.url ? " - file needed" : ""}`;
    copy.append(name, detail);
    open.append(createMediaThumb(item), copy);
    open.addEventListener("click", () => selectTripMedia(item));
    const actions = document.createElement("div");
    actions.className = "trip-media-row-actions";
    if (!['blog', 'youtube'].includes(item.kind)) {
      const reload = document.createElement("label");
      reload.className = "trip-media-reload";
      reload.textContent = item.url ? "Replace file" : "Reload file";
      const reloadInput = document.createElement("input");
      reloadInput.type = "file";
      reloadInput.accept = "image/*,audio/*,video/*";
      reloadInput.addEventListener("change", async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        const kind = mediaKindFromType(file.type);
        if (kind === "blog") {
          setTripStatus("Choose a picture, video, or audio file.", true);
          event.target.value = "";
          return;
        }
        let localFile;
        try { localFile = await rvMediaStoreFile(file); }
        catch (error) { setTripStatus(error.message || "This device could not save the media file.", true); return; }
        revokeTemporaryMediaUrl(item.url);
        item.url = localFile.url;
        item.assetId = localFile.assetId;
        item.type = file.type;
        item.kind = kind;
        item.name = file.name || item.name;
        selectedTripMediaId = item.id;
        saveTrips();
        renderTripMedia();
        renderMediaMarkers();
        previewTripMedia(item);
        setTripStatus(`Reloaded ${item.name}.`);
      });
      reload.append(reloadInput);
      actions.append(reload);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "trip-media-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      revokeTemporaryMediaUrl(item.url);
      owner.media.splice(index, 1);
      if (selectedTripMediaId === item.id) selectedTripMediaId = null;
      saveTrips();
      renderTripMedia();
      renderMediaMarkers();
    });
    actions.append(remove);
    dragHandle.addEventListener("pointerdown", event => {
      if (!owner.mediaManualOrder) return;
      if (event.button !== 0 && event.pointerType !== "touch") return;
      event.preventDefault();
      dragHandle.setPointerCapture(event.pointerId);
      row.classList.add("is-dragging");
      dragHandle.classList.add("is-dragging");

      const moveRow = moveEvent => {
        moveEvent.preventDefault();
        const nextRow = [...els.tripMediaList.querySelectorAll(".trip-media-row")]
          .filter(mediaRow => mediaRow !== row)
          .find(mediaRow => {
            const box = mediaRow.getBoundingClientRect();
            return moveEvent.clientY < box.top + box.height / 2;
          });
        els.tripMediaList.insertBefore(row, nextRow || null);
      };

      const finishDrag = () => {
        document.removeEventListener("pointermove", moveRow);
        document.removeEventListener("pointerup", finishDrag);
        document.removeEventListener("pointercancel", finishDrag);
        row.classList.remove("is-dragging");
        dragHandle.classList.remove("is-dragging");
        const mediaById = new Map(owner.media.map(mediaItem => [mediaItem.id, mediaItem]));
        owner.media = [...els.tripMediaList.querySelectorAll(".trip-media-row")]
          .map(mediaRow => mediaById.get(mediaRow.dataset.mediaId))
          .filter(Boolean);
        saveTrips();
        renderTripMedia();
        renderMediaMarkers();
      };

      document.addEventListener("pointermove", moveRow, { passive: false });
      document.addEventListener("pointerup", finishDrag);
      document.addEventListener("pointercancel", finishDrag);
    });
    row.append(dragHandle, open, actions);
    els.tripMediaList.append(row);
  });

  const selected = selectedTripMedia();
  els.tripMediaLocation.hidden = !selected;
  const routeOwned = owner === route;
  [els.snapTripMediaStart, els.snapTripMediaEnd].forEach(button => {
    if (button) button.disabled = !selected || !routeOwned;
  });
  if (selected) {
    els.tripMediaLocationTitle.textContent = selected.name;
    els.tripMediaPinType.value = selected.pinType || "symbol";
    els.tripMediaPinColor.value = selected.pinColor || MEDIA_PIN_COLORS[selected.kind] || MEDIA_PIN_COLORS.blog;
    els.tripMediaPinStyle.value = selected.pinStyle || "default";
    const automaticThumbnailUrl = selected.thumbnailUrl || (selected.kind === "image" ? selected.url : "");
    const displayedThumbnailUrl = selected.customThumbnailUrl || automaticThumbnailUrl;
    els.tripMediaThumbnailPreview.replaceChildren();
    if (displayedThumbnailUrl) {
      const image = document.createElement("img");
      image.src = displayedThumbnailUrl;
      image.alt = "";
      els.tripMediaThumbnailPreview.append(image);
    } else {
      els.tripMediaThumbnailPreview.textContent = MEDIA_PIN_SYMBOLS[selected.kind] || "M";
    }
    els.tripMediaThumbnailPreview.classList.toggle("has-image", Boolean(displayedThumbnailUrl));
    els.tripMediaThumbnailName.textContent = selected.customThumbnailUrl
      ? selected.customThumbnailName || "Custom image"
      : automaticThumbnailUrl
        ? "Using the automatic thumbnail"
        : "No automatic thumbnail available";
    els.tripMediaThumbnailReset.disabled = !selected.customThumbnailUrl;
    els.tripMediaAddress.value = selected.address || "";
    els.tripMediaLocationStatus.textContent = Number.isFinite(selected.lat)
      ? !routeOwned
        ? "Pin is placed around the selected stop. Drag it while the Journeys or Media tab is open."
        : selected.routeAnchor === "start"
        ? "Pinned to the start of the route. It will open when this route is selected."
        : selected.routeAnchor === "end"
          ? "Pinned to the end of the route."
          : "Pin is placed on the map. Drag it while the Journeys tab is open."
      : "Choose an address or click the map to place this pin.";
  }
}

function previewTripMedia(item) {
  if (!els.tripMediaPreview) return;
  els.tripMediaPreview.replaceChildren();
  if (item.kind === "blog") {
    const article = document.createElement("article");
    const title = document.createElement("strong");
    title.textContent = item.name;
    const text = document.createElement("p");
    text.textContent = item.text;
    article.append(title, text);
    els.tripMediaPreview.append(article);
    els.tripMediaPreview.hidden = false;
    return;
  }
  if (!item.url) {
    const note = document.createElement("p");
    note.className = "route-service-note";
    note.textContent = "This local file must be added again after reloading the page.";
    els.tripMediaPreview.append(note);
    els.tripMediaPreview.hidden = false;
    return;
  }
  if (item.kind === "image") {
    const image = document.createElement("img");
    image.src = item.url;
    image.alt = item.name;
    els.tripMediaPreview.append(image);
    els.tripMediaPreview.hidden = false;
    return;
  }
  if (item.kind === "youtube") {
    const frame = document.createElement("iframe");
    frame.src = item.url;
    frame.title = item.name;
    frame.loading = "lazy";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    els.tripMediaPreview.append(frame);
    els.tripMediaPreview.hidden = false;
    return;
  }
  const mediaElement = document.createElement(item.kind === "video" ? "video" : "audio");
  mediaElement.controls = true;
  mediaElement.src = item.url;
  mediaElement.preload = "metadata";
  if (mediaElement instanceof HTMLVideoElement) {
    mediaElement.playsInline = true;
  }
  els.tripMediaPreview.append(mediaElement);
  els.tripMediaPreview.hidden = false;
}
