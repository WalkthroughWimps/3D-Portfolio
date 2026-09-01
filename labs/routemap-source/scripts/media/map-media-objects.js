"use strict";

// Map owns media placement and behavior. The Media tab remains the shared
// presentation/layout studio; this small coordinator reuses the established
// media manager rather than creating a second set of records and uploads.
let stickerMediaDialogContext = null;

function stickerMediaOwner(sticker) {
  const trip = activeTrip?.();
  if (!trip || !sticker) return null;
  if (sticker.scope !== "stop") return trip.days?.[sticker.routeIndex] || null;
  const stop = synchronizeTripStops?.(trip)?.find(candidate => candidate.id === sticker.stopId);
  if (!stop || !sticker.dayIso) return null;
  stop.dayContent ||= {};
  stop.dayContent[sticker.dayIso] ||= { media: [], stickers: [], timelineEndAction: "default" };
  return stop.dayContent[sticker.dayIso];
}

function stickerMediaDialog() {
  let dialog = document.querySelector("#stickerMediaEventDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "stickerMediaEventDialog";
  dialog.className = "sticker-media-event-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="sticker-media-event-card">
      <button class="sticker-media-dialog-close" value="cancel" aria-label="Close">×</button>
      <strong id="stickerMediaEventDialogTitle">Choose event media</strong>
      <p>Choose what this sticker event opens.</p>
      <div class="sticker-media-kind-grid">
        <button type="button" data-sticker-media-kind="image">Picture</button>
        <button type="button" data-sticker-media-kind="video">Video</button>
        <button type="button" data-sticker-media-kind="audio">Audio</button>
        <button type="button" data-sticker-media-kind="youtube">YouTube</button>
        <button type="button" data-sticker-media-kind="blog">Note</button>
        <button type="button" data-sticker-media-kind="preset">Preset</button>
      </div>
      <div id="stickerMediaPresetPicker" class="sticker-media-preset-picker" hidden></div>
      <input id="stickerMediaEventFile" type="file" accept="image/*,video/*,audio/*" hidden>
      <div id="stickerMediaEventTextFields" class="sticker-media-event-text-fields" hidden>
        <label><span id="stickerMediaEventTextLabel">YouTube link</span><input id="stickerMediaEventTextTitle" type="text" maxlength="100" placeholder="Title (optional)"></label>
        <label id="stickerMediaEventUrlRow"><span>YouTube link</span><input id="stickerMediaEventUrl" type="url" placeholder="https://youtu.be/..."></label>
        <label id="stickerMediaEventBodyRow" hidden><span>Text</span><textarea id="stickerMediaEventBody" rows="5" maxlength="4000" placeholder="Write the text event"></textarea></label>
        <button id="stickerMediaEventSaveText" type="button">Assign media</button>
      </div>
      <button id="stickerMediaEventClear" type="button" class="secondary-action">Remove this event media</button>
    </form>`;
  document.body.append(dialog);
  const file = dialog.querySelector("#stickerMediaEventFile");
  dialog.addEventListener("click", event => {
    const kind = event.target.closest("[data-sticker-media-kind]")?.dataset.stickerMediaKind;
    if (!kind) return;
    if (kind === "preset") {
      populateStickerMediaEventLayouts();
      dialog.querySelector("#stickerMediaPresetPicker").hidden = false;
      return;
    }
    if (["image", "video", "audio"].includes(kind)) {
      file.accept = kind === "image" ? "image/*" : `${kind}/*`;
      file.dataset.kind = kind;
      file.click();
      return;
    }
    if (kind === "blog") {
      stickerMediaCreateAndAssign({ kind: "blog", title: "Note" });
      return;
    }
    dialog.querySelector("#stickerMediaEventTextFields").hidden = false;
    dialog.querySelector("#stickerMediaEventTextLabel").textContent = kind === "youtube" ? "YouTube" : "Text entry";
    dialog.querySelector("#stickerMediaEventUrlRow").hidden = kind !== "youtube";
    dialog.querySelector("#stickerMediaEventBodyRow").hidden = kind !== "blog";
    dialog.querySelector("#stickerMediaEventSaveText").dataset.kind = kind;
  });
  file.addEventListener("change", event => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    stickerMediaCreateAndAssign({ kind: mediaKindFromType(selected.type), file: selected });
    event.target.value = "";
  });
  dialog.querySelector("#stickerMediaEventSaveText").addEventListener("click", async event => {
    const kind = event.currentTarget.dataset.kind;
    const title = dialog.querySelector("#stickerMediaEventTextTitle").value.trim();
    if (kind === "youtube") return stickerMediaCreateAndAssign({ kind, title, url: dialog.querySelector("#stickerMediaEventUrl").value.trim() });
  });
  dialog.querySelector("#stickerMediaEventClear").addEventListener("click", () => {
    const context = stickerMediaDialogContext;
    if (context) assignStickerMediaEvent(context.sticker, context.slot, "");
    dialog.close();
  });
  return dialog;
}

function populateStickerMediaEventLayouts(selectedId = "default") {
  const picker = stickerMediaDialog()?.querySelector("#stickerMediaPresetPicker");
  if (!picker) return;
  picker.replaceChildren();
  (mediaPresentationState?.layouts || []).forEach(layout => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sticker-media-preset-card";
    button.draggable = true;
    button.classList.toggle("is-selected", layout.id === selectedId);
    button.textContent = layout.name;
    button.addEventListener("click", () => stickerMediaCreateAndAssign({ kind: "preset", title: layout.name, layoutId: layout.id }));
    button.addEventListener("dragstart", event => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-rv-preset-layout", layout.id);
    });
    picker.append(button);
  });
}

async function stickerMediaCreateAndAssign({ kind, file = null, title = "", url = "", text = "", layoutId = "default" }) {
  const context = stickerMediaDialogContext;
  const owner = stickerMediaOwner(context?.sticker);
  if (!context || !owner) return;
  let item;
  if (file) {
    const localFile = await rvMediaStoreFile(file);
    item = normalizeTripMedia({ name: file.name, kind, type: file.type, url: localFile.url, assetId: localFile.assetId, layoutId });
  } else if (kind === "youtube") {
    const embedUrl = youtubeEmbedUrl?.(url);
    if (!embedUrl) return setTripStatus?.("Enter a valid YouTube link.", true);
    const metadata = await youtubeMetadata?.(url);
    item = normalizeTripMedia({ name: title || metadata?.title || "YouTube video", kind, type: "text/youtube", url: embedUrl, thumbnailUrl: metadata?.thumbnailUrl || "", layoutId });
  } else if (kind === "preset") {
    item = normalizeTripMedia({ name: title || "Media preset", kind: "preset", type: "application/x-rv-preset", layoutId, presetSlots: {} });
  } else {
    item = normalizeTripMedia({ name: title || "Note", kind: "blog", type: "text/plain", text, layoutId, notePrimed: false });
  }
  owner.media ||= [];
  owner.media.push(item);
  selectedTripMediaId = item.id;
  assignStickerMediaEvent(context.sticker, context.slot, item.id);
  saveTrips?.();
  renderTripMedia?.();
  stickerMediaDialog()?.close();
  // Adding a visual event is an authoring action: immediately show the new
  // result on the map, using the exact Media-tab presentation for its type.
  if (["image", "video", "youtube", "blog", "preset"].includes(item.kind)) {
    openJourneyMedia?.(item, { eventContext: { sticker: context.sticker, slot: context.slot } });
  }
}

function openStickerMediaEventDialog(sticker, slot) {
  stickerMediaDialogContext = { sticker, slot };
  const dialog = stickerMediaDialog();
  const existing = sticker.mediaEvents?.[slot] ? findTripMediaRecord?.(sticker.mediaEvents[slot])?.item : null;
  // A file-backed event goes straight back to the operating-system picker on
  // click. Text and YouTube reopen their editable fields instead.
  if (["image", "video", "audio"].includes(existing?.kind)) {
    const file = dialog.querySelector("#stickerMediaEventFile");
    file.accept = `${existing.kind}/*`;
    file.dataset.kind = existing.kind;
    file.click();
    return;
  }
  if (existing?.kind === "blog") {
    openJourneyMedia?.(existing, { eventContext: { sticker, slot } });
    return;
  }
  dialog.querySelector("#stickerMediaEventDialogTitle").textContent = `Event media: ${sticker.label}`;
  const textFields = dialog.querySelector("#stickerMediaEventTextFields");
  dialog.querySelector("#stickerMediaPresetPicker").hidden = true;
  const textKind = existing?.kind === "youtube" ? "youtube" : existing?.kind === "blog" ? "blog" : "";
  textFields.hidden = !textKind;
  dialog.querySelector("#stickerMediaEventTextTitle").value = existing?.name || "";
  dialog.querySelector("#stickerMediaEventUrl").value = textKind === "youtube" ? (existing?.url || "") : "";
  dialog.querySelector("#stickerMediaEventBody").value = textKind === "blog" ? (existing?.text || "") : "";
  if (textKind) {
    dialog.querySelector("#stickerMediaEventTextLabel").textContent = textKind === "youtube" ? "YouTube" : "Text entry";
    dialog.querySelector("#stickerMediaEventUrlRow").hidden = textKind !== "youtube";
    dialog.querySelector("#stickerMediaEventBodyRow").hidden = textKind !== "blog";
    dialog.querySelector("#stickerMediaEventSaveText").dataset.kind = textKind;
  }
  if (!dialog.open) dialog.showModal();
}

function mapMediaAllRecords() {
  const trip = activeTrip?.();
  if (!trip) return [];
  const records = [];
  (trip.days || []).forEach((route, routeIndex) => (route.media || []).forEach(item => records.push({ item, target: "route", routeIndex, owner: route })));
  (synchronizeTripStops?.(trip) || trip.stops || []).forEach((stop, stopIndex) => {
    migrateLegacyStopMedia?.(stop);
    Object.entries(stop.dayContent || {}).forEach(([day, content]) => (content?.media || []).forEach(item => records.push({ item, target: "stop-day", stopIndex, stopId: stop.id, day, owner: content })));
  });
  return records;
}

function stickerMediaRecordsForSticker(sticker) {
  // Events can deliberately reuse any media asset in this trip. The sticker
  // owns *when* it fires; the media record only supplies *what* it opens.
  // Owner labels make cross-route/day choices explicit instead of hiding them.
  if (!sticker || typeof mapMediaAllRecords !== "function") return [];
  return mapMediaAllRecords();
}

function stickerMediaRecordLabel(record) {
  if (!record?.item) return "Untitled media";
  const owner = record.target === "stop-day"
    ? `${synchronizeTripStops?.(activeTrip?.())?.[record.stopIndex]?.name || "Stop"} · ${record.day}`
    : `Route ${Number(record.routeIndex) + 1}`;
  return `${owner} — ${record.item.name || mediaTypeLabel?.(record.item) || "Media"}`;
}

function syncStickerMediaEvent(sticker) {
  if (!sticker?.mediaId) return;
  const record = mapMediaAllRecords().find(candidate => candidate.item.id === sticker.mediaId);
  if (!record) return;
  record.item.stickerId = sticker.id;
  record.item.mapObjectType = sticker.objectClass === "pin" ? "pin" : "sticker";
  record.item.activation = sticker.activation || "either";
  saveTrips?.();
}

function assignMediaToSticker(sticker, mediaId) {
  if (!sticker) return;
  const record = stickerMediaRecordsForSticker(sticker).find(candidate => candidate.item.id === mediaId);
  sticker.mediaId = record?.item.id || "";
  if (record) {
    sticker.label = record.item.name || sticker.label;
    sticker.imageUrl = record.item.customThumbnailUrl || record.item.thumbnailUrl || (record.item.kind === "image" ? record.item.url : "") || sticker.imageUrl;
    syncStickerMediaEvent(sticker);
  }
  saveTrips?.();
  renderStickers?.();
}

function assignStickerMediaEvent(sticker, slot, mediaId) {
  if (!sticker || !["appear", "click", "hover"].includes(slot)) return;
  sticker.mediaEvents ||= {};
  if (mediaId) {
    sticker.mediaEvents[slot] = mediaId;
    const kind = findTripMediaRecord?.(mediaId)?.item?.kind;
    // An event initially inherits its Media-tab presentation.  Per-event
    // geometry is only created when the author actually adjusts it.
    if (["image", "video", "youtube", "blog", "preset"].includes(kind)) {
      sticker.mediaEventOptions ||= {};
      sticker.mediaEventOptions[slot] ||= {};
    }
  }
  else {
    delete sticker.mediaEvents[slot];
    if (sticker.mediaEventOptions) delete sticker.mediaEventOptions[slot];
  }
  if (!Object.keys(sticker.mediaEvents).length) delete sticker.mediaEvents;
  if (sticker.mediaEventOptions && !Object.keys(sticker.mediaEventOptions).length) delete sticker.mediaEventOptions;
  saveTrips?.();
  renderStickers?.();
}

function migrateLegacyMediaPinsToStickerObjects() {
  const trip = activeTrip?.();
  if (!trip) return;
  let changed = false;
  mapMediaAllRecords().forEach(record => {
    const item = record.item;
    if (item.stickerId || !Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
    const stop = record.target === "stop-day" ? synchronizeTripStops(trip)[record.stopIndex] : null;
    const imageUrl = item.customThumbnailUrl || item.thumbnailUrl || (item.kind === "image" ? item.url : "");
    const sticker = normalizeSticker({
      label: item.name,
      imageUrl,
      objectClass: item.mapObjectType === "pin" ? "pin" : "media",
      mediaId: item.id,
      lat: item.lat,
      lon: item.lon,
      scope: stop ? "stop" : "route",
      routeIndex: stop ? null : record.routeIndex,
      stopId: stop?.id || "",
      dayIso: record.day || "",
      placedView: stop ? "stop" : "route",
      activation: item.activation || "either"
    });
    if (!sticker) return;
    trip.stickers ||= [];
    trip.stickers.push(sticker);
    item.stickerId = sticker.id;
    changed = true;
  });
  if (changed) { saveTrips?.(); renderStickers?.(); renderMediaMarkers?.(); }
}

function mapMediaApplyObjectSettings() {
  const record = mapMediaSelectedRecord();
  const assignment = document.querySelector("#mapMediaAssignment");
  const activation = document.querySelector("#mapMediaActivation");
  const layout = document.querySelector("#mapMediaLayout");
  const timelineAt = document.querySelector("#mapMediaTimelineAt");
  if (!record || !assignment || !activation || !layout || !timelineAt) return;
  record.item.mapObjectType = assignment.value;
  record.item.activation = activation.value;
  record.item.layoutId = layout.value || "default";
  record.item.timelineAt = Math.max(0, Math.min(1, Number(timelineAt.value) || 0));
  const sticker = activeTrip?.()?.stickers?.find(candidate => candidate.id === record.item.stickerId);
  if (sticker) {
    // A pin is a media-bearing sticker with a pin presentation.  Keeping the
    // media reference on the same object means it can use the same trigger,
    // selection, grouping, and drag rules as every other sticker.
    sticker.objectClass = assignment.value === "pin" ? "pin" : "media";
    sticker.mediaId = record.item.id;
    sticker.activation = activation.value;
    if (assignment.value === "sticker" && selectedStickerId && selectedStickerId !== sticker.id) {
      sticker.objectClass = "media";
    }
    syncStickerMediaEvent(sticker);
    renderStickers?.();
  }
  saveTrips?.();
  renderMediaMarkers?.();
}

function renderMapMediaWorkspace() {
  const workspace = document.querySelector("#mapMediaWorkspace");
  const picker = document.querySelector("#mapMediaObjectPicker");
  const assignment = document.querySelector("#mapMediaAssignment");
  const activation = document.querySelector("#mapMediaActivation");
  const layout = document.querySelector("#mapMediaLayout");
  const timelineAt = document.querySelector("#mapMediaTimelineAt");
  const timelineAtValue = document.querySelector("#mapMediaTimelineAtValue");
  if (!workspace || !picker || !assignment || !activation || !layout || !timelineAt) return;
  const records = mapMediaAllRecords();
  picker.replaceChildren(new Option(records.length ? "Choose a media object" : "No media objects yet", ""));
  records.forEach(({ item }) => {
    const label = `${mediaTypeLabel?.(item) || item.kind}: ${item.name}`;
    picker.append(new Option(label, item.id, false, item.id === selectedTripMediaId));
  });
  const selected = mapMediaSelectedRecord()?.item || null;
  workspace.classList.toggle("has-selected-media", Boolean(selected));
  assignment.value = selected?.mapObjectType || "pin";
  activation.value = selected?.activation || (selected?.kind === "null" ? "timeline" : "either");
  activation.querySelector('option[value="click"]').disabled = selected?.kind === "null";
  activation.querySelector('option[value="either"]').disabled = selected?.kind === "null";
  if (selected?.kind === "null" && !["timeline", "automatic"].includes(activation.value)) activation.value = "timeline";
  layout.replaceChildren(new Option("Use media default layout", "default"));
  (mediaPresentationState?.layouts || []).forEach(item => layout.append(new Option(item.name, item.id, false, item.id === selected?.layoutId)));
  timelineAt.value = String(selected?.timelineAt ?? .5);
  if (timelineAtValue) timelineAtValue.value = `${Math.round(Number(timelineAt.value) * 100)}%`;
  [assignment, activation, layout, timelineAt].forEach(control => { control.disabled = !selected; });
  const detail = workspace.querySelector(".map-media-object-status");
  if (detail) detail.textContent = selected
    ? (selected.kind === "null" ? "NULL is editor-visible and trigger-only on the USER site." : `Editing ${selected.name}.`)
    : "Add media, then select it here or directly on the map.";
}

function addMapNullObject() {
  if (createMapObjectSticker({ objectClass: "null", label: "NULL" })) setTripStatus?.("Added NULL timeline object.");
}

function initializeMapMediaWorkspace() {
  const mapPanel = document.querySelector("#panelMapUi");
  const manager = document.querySelector(".media-manager-section");
  if (!mapPanel || !manager || document.querySelector("#mapMediaWorkspace")) return;
  manager.querySelector(".section-label")?.replaceChildren("Media");
  manager.setAttribute("aria-label", "Map media");
  manager.querySelector(".media-target-control span")?.replaceChildren("Attach media to");
  manager.querySelector(".route-service-note")?.replaceChildren("Add a map media object, then place it, assign it to a sticker, or use it as a timeline cue. The Media tab controls appearance and layouts.");

  const workspace = document.createElement("section");
  workspace.id = "mapMediaWorkspace";
  workspace.className = "map-media-workspace panel-section";
  workspace.setAttribute("aria-label", "Map media objects");
  workspace.innerHTML = `
    <p class="section-label">Map objects</p>
    <div class="map-media-add-grid">
      <button type="button" data-map-media-add="image">Image</button>
      <button type="button" data-map-media-add="video">Video</button>
      <button type="button" data-map-media-add="audio">Audio</button>
      <button type="button" data-map-media-add="youtube">YouTube</button>
      <button type="button" data-map-media-add="blog">Text</button>
      <button type="button" data-map-media-add="null">NULL</button>
    </div>
    <label class="text-control"><span>Existing media objects</span><select id="mapMediaObjectPicker"></select></label>
    <div class="map-media-object-controls">
      <label class="text-control"><span>Map object</span><select id="mapMediaAssignment"><option value="pin">Pin</option><option value="sticker">Selected sticker</option><option value="standalone">Standalone</option><option value="timeline">Timeline cue</option></select></label>
      <label class="text-control"><span>Activation</span><select id="mapMediaActivation"><option value="either">Automatic or click</option><option value="automatic">Automatic</option><option value="click">Click / tap</option><option value="timeline">Timeline cue</option></select></label>
      <label class="text-control"><span>Layout</span><select id="mapMediaLayout"></select></label>
      <label class="range-control"><span>Timeline cue</span><input id="mapMediaTimelineAt" type="range" min="0" max="1" step="0.01" value="0.5"><output id="mapMediaTimelineAtValue">50%</output></label>
    </div>
    <p class="map-media-object-status route-service-note" aria-live="polite"></p>`;
  mapPanel.append(manager);
  mapPanel.insertBefore(workspace, manager);

  workspace.addEventListener("click", event => {
    const button = event.target.closest("[data-map-media-add]");
    if (!button) return;
    const kind = button.dataset.mapMediaAdd;
    if (kind === "null") return addMapNullObject();
    if (kind === "youtube") return document.querySelector("#tripYouTubeUrl")?.focus();
    if (kind === "blog") return document.querySelector("#tripBlogTitle")?.focus();
    mapMediaPendingKind = kind;
    // Stops are containers for their days only.  Always select the current
    // stop-day owner before handing the file to the shared media editor.
    if (selectedStopDayIso && activeJourneyStop?.()?.id && els.tripMediaTarget) els.tripMediaTarget.value = "stop-day";
    const input = document.querySelector("#tripMediaInput");
    if (!input) return;
    input.accept = kind === "image" ? "image/*" : kind === "video" ? "video/*" : "audio/*";
    input.click();
  });
  document.querySelector("#mapMediaObjectPicker")?.addEventListener("change", event => {
    const record = mapMediaAllRecords().find(item => item.item.id === event.target.value);
    if (!record) return;
    selectedTripMediaId = record.item.id;
    if (els.tripMediaTarget) els.tripMediaTarget.value = record.target;
    renderTripMedia?.();
    renderMapMediaWorkspace();
  });
  ["#mapMediaAssignment", "#mapMediaActivation", "#mapMediaLayout", "#mapMediaTimelineAt"].forEach(selector => document.querySelector(selector)?.addEventListener("input", mapMediaApplyObjectSettings));
  document.querySelector("#tripMediaInput")?.addEventListener("change", () => {
    if (!mapMediaPendingKind) return;
    const record = mapMediaSelectedRecord();
    if (record) {
      record.item.mapObjectType = "pin";
      record.item.activation = "either";
      const imageUrl = record.item.customThumbnailUrl || record.item.thumbnailUrl || (record.item.kind === "image" ? record.item.url : "");
      const sticker = createMapObjectSticker({ objectClass: "pin", label: record.item.name, imageUrl, mediaId: record.item.id });
      if (sticker) record.item.stickerId = sticker.id;
      saveTrips?.();
    }
    mapMediaPendingKind = "";
    renderMapMediaWorkspace();
  });
  const baseRender = window.renderTripMedia;
  window.renderTripMedia = function mapMediaAwareRenderTripMedia(...args) {
    const result = baseRender?.apply(this, args);
    renderMapMediaWorkspace();
    return result;
  };
  const baseRefreshTriggers = window.refreshStickerTriggersForPlayback;
  window.refreshStickerTriggersForPlayback = function mapMediaAwareTriggerRefresh(progress) {
    const previous = lastStickerPlaybackProgress;
    const result = baseRefreshTriggers?.call(this, progress);
    refreshStickerMediaEventsForTimeline?.({ mode: "route", previous, next: progress, direction: state.playback.direction || 1 });
    return result;
  };
  migrateLegacyMediaPinsToStickerObjects();
  renderMapMediaWorkspace();
}

// Map Objects no longer owns a UI or a second creation workflow.  Retain the
// migration and route playback bridge while Stickers FX owns all new media.
const baseRefreshTriggers = window.refreshStickerTriggersForPlayback;
window.refreshStickerTriggersForPlayback = function stickerMediaTriggerRefresh(progress) {
  const previous = lastStickerPlaybackProgress;
  const result = baseRefreshTriggers?.call(this, progress);
  refreshStickerMediaEventsForTimeline?.({ mode: "route", previous, next: progress, direction: state.playback.direction || 1 });
  return result;
};
migrateLegacyMediaPinsToStickerObjects();
