// Normalize invalid inline user-select values before third-party map libraries
// can trigger noisy Firefox console parse warnings.
(function normalizeInlineUserSelectValues() {
  if (typeof window === "undefined" || typeof CSSStyleDeclaration === "undefined") return;
  const normalize = value => {
    const text = String(value ?? "").trim();
    if (!text) return text;
    if (typeof CSS !== "undefined" && CSS.supports && CSS.supports("user-select", text)) return text;
    if (/^(none|auto|text|all)$/i.test(text)) return text.toLowerCase();
    if (/none/i.test(text)) return "none";
    if (/text/i.test(text)) return "text";
    return "auto";
  };
  const proto = CSSStyleDeclaration.prototype;
  const originalSetProperty = proto.setProperty;
  if (typeof originalSetProperty === "function" && !originalSetProperty.__rvMapUserSelectPatched) {
    const patchedSetProperty = function(name, value, priority) {
      if (String(name).toLowerCase() === "user-select") {
        return originalSetProperty.call(this, name, normalize(value), priority);
      }
      return originalSetProperty.call(this, name, value, priority);
    };
    patchedSetProperty.__rvMapUserSelectPatched = true;
    proto.setProperty = patchedSetProperty;
  }
  const descriptor = Object.getOwnPropertyDescriptor(proto, "userSelect");
  if (descriptor?.set && !descriptor.set.__rvMapUserSelectPatched) {
    const originalSet = descriptor.set;
    const originalGet = descriptor.get;
    const patchedSet = function(value) {
      return originalSet.call(this, normalize(value));
    };
    patchedSet.__rvMapUserSelectPatched = true;
    Object.defineProperty(proto, "userSelect", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: originalGet,
      set: patchedSet
    });
  }
  const cssTextDescriptor = Object.getOwnPropertyDescriptor(proto, "cssText");
  if (cssTextDescriptor?.set && !cssTextDescriptor.set.__rvMapUserSelectPatched) {
    const originalCssTextSet = cssTextDescriptor.set;
    const originalCssTextGet = cssTextDescriptor.get;
    const patchedCssTextSet = function(value) {
      const cleanValue = String(value ?? "").replace(/user-select\s*:\s*([^;]+)/gi, (_match, rawValue) => `user-select:${normalize(rawValue)}`);
      return originalCssTextSet.call(this, cleanValue);
    };
    patchedCssTextSet.__rvMapUserSelectPatched = true;
    Object.defineProperty(proto, "cssText", {
      configurable: true,
      enumerable: cssTextDescriptor.enumerable,
      get: originalCssTextGet,
      set: patchedCssTextSet
    });
  }
  const elementPrototype = globalThis.Element?.prototype;
  const originalSetAttribute = elementPrototype?.setAttribute;
  if (typeof originalSetAttribute === "function" && !originalSetAttribute.__rvMapUserSelectPatched) {
    const patchedSetAttribute = function(name, value) {
      if (String(name).toLowerCase() === "style" && typeof value === "string") {
        value = value.replace(/user-select\s*:\s*([^;]+)/gi, (_match, rawValue) => `user-select:${normalize(rawValue)}`);
      }
      return originalSetAttribute.call(this, name, value);
    };
    patchedSetAttribute.__rvMapUserSelectPatched = true;
    elementPrototype.setAttribute = patchedSetAttribute;
  }
})();

function isActiveAdminTextEditor(target) {
  if (!(target instanceof Element) || !target.matches(":focus")) return false;
  if (!target.closest("#usersBuilderAdminGrid, #usersAppearanceAdminPanel, #usersStagingAdminPanel, .panel, .users-admin-panel")) return false;
  return target.matches("textarea, [contenteditable='true'], input[type='text'], input[type='search'], input[type='url'], input[type='email'], input[type='tel'], input[type='number'], input:not([type])");
}

document.addEventListener("selectstart", event => {
  if (!isActiveAdminTextEditor(event.target)) event.preventDefault();
}, true);

const state = {
  trips: [],
  tripGroups: [],
  activeTripGroupIndex: 0,
  itineraryRevision: "",
  activeTripIndex: 0,
  // A no-journey selection is an editor context, not an invalid active index:
  // the map can still show the US overview while defaults are being edited.
  noJourneySelected: false,
  noStopSelected: false,
  noDaySelected: false,
  projectDefaults: normalizeProjectDefaults(),
  routes: [],
  activeRouteIndex: 0,
  overviewMode: false,
  selectionScope: "journey",
  points: [],
  displayPoints: [],
  title: "Untitled Map",
  routeLayer: null,
  markerLayer: null,
  stateLineGeoJson: null,
  playback: {
    active: false,
    direction: 1,
    progress: 0,
    hasStarted: false,
    frameId: null,
    lastTime: null,
    layer: null,
    icon: null,
    pathLength: 0,
    targetProgress: null,
    targetMediaId: null,
    townHideKey: "",
    followLastPanAt: 0,
    followPanUntil: 0,
    followCenter: null,
    followZoom: null,
    speedIndex: 2,
    pendingDirection: null,
    // The playback module owns this sealed navigation command.  Nothing in
    // the camera, renderer, or user-layout layers may derive a new route from
    // the current visual selection while it exists.
    session: null,
    requestId: 0
  },
  overviewHover: {
    candidate: null,
    timer: null,
    activeIndex: null,
    lockedIndex: null,
    filledIndex: null,
    icon: null,
    townHideKey: ""
  },
  overviewFocusIndex: null,
  overviewFocusZoom: null,
  overviewHomeView: null,
  contiguousUsMode: false,
  overviewZoneModifyIndex: null,
  overviewMarkerModifyIndex: null,
  markerModifyTarget: null,
  markerFlashTarget: null,
  overviewZoneRects: []
};

let welcomeGateDismissed = false;
let welcomeGateConsentChosen = false;
// Startup consent is part of the real visitor flow. Editor/user-mode swaps
// still suppress it below because those are previews, not new visits.
const BYPASS_WELCOME_AND_MEDIA_GATE = false;
const SHOW_USAGE_OVERLAY = false;
if (BYPASS_WELCOME_AND_MEDIA_GATE) globalThis.rvSuppressLoadingSurfaces = true;
// Keep the welcome screen as a brief bit of flavor on a cold start, without
// turning it into a 20-second gate before the editor can be used.
const WELCOME_GATE_MIN_VISIBLE_MS = 3500;
const CONTIGUOUS_US_BOUNDS = Object.freeze([
  [24.35, -124.9],
  [49.55, -66.7]
]);
const JOURNEY_OVERVIEW_COLORS = Object.freeze([
  "#d1495b",
  "#00798c",
  "#edae49",
  "#30638e",
  "#6a994e",
  "#9b5de5",
  "#f77f00",
  "#2a9d8f"
]);
const TERMINOLOGY_STORAGE_KEY = "rv-map-terminology-v1";
const US_VIEW_STORAGE_KEY = "rv-map-us-saved-view-v1";
const US_JOURNEY_ROUTE_WIDTH_STORAGE_KEY = "rv-map-us-journey-route-width-v1";
const CUSTOM_STICKER_LIBRARY_KEY = "rv-map-custom-stickers-v1";
const PIN_LIBRARY_COLORS_KEY = "rv-map-pin-library-colors-v1";
let terminologyState = {
  ...DEFAULT_TERMINOLOGY,
  ...(rvStorageReadJson(TERMINOLOGY_STORAGE_KEY, {}) || {})
};
let savedUsMapView = normalizeSavedMapView(rvStorageReadJson(US_VIEW_STORAGE_KEY, null));
let usJourneyRouteWidth = clamp(Number(rvStorageReadJson(US_JOURNEY_ROUTE_WIDTH_STORAGE_KEY, DEFAULT_JOURNEY_STYLE.usRouteWidth)), 2, 24);
let customStickerLibrary = Array.isArray(rvStorageReadJson(CUSTOM_STICKER_LIBRARY_KEY, []))
  ? rvStorageReadJson(CUSTOM_STICKER_LIBRARY_KEY, [])
  : [];
let stickerLibraryCategory = "all";
let pinLibraryColor = "#2f6f55";
let pinLibraryRecentColors = Array.isArray(rvStorageReadJson(PIN_LIBRARY_COLORS_KEY, []))
  ? rvStorageReadJson(PIN_LIBRARY_COLORS_KEY, []).filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 12)
  : [];
let selectedStickerId = "";
let selectedStickerIds = new Set();
let selectedEndpointFeatureKeys = new Set();
let selectedEndpointFeatureKey = "";
let routeAnimationIconSelected = false;
let stickerStylePopup = null;

// These are deliberately familiar, outdoors-oriented alternatives—not a new
// sticker class. They reuse the same compact artwork pipeline and therefore
// stay just as portable/offline as the original library item.
const STICKER_STYLE_VARIANTS = Object.freeze({
  evergreen: ["evergreen", "cactus", "wildflower", "mountain"],
  mountains: ["mountains", "mountain", "evergreen", "cactus"],
  campfire: ["campfire", "coffee", "picnic", "fire"],
  sasquatch: ["sasquatch", "bear", "wolf", "moose", "bison", "raccoon", "turtle", "yeti", "dragon"],
  bear: ["bear", "wolf", "moose", "bison", "raccoon", "turtle", "yeti", "dragon"],
  deer: ["deer", "moose", "bison", "bear", "wolf", "raccoon"],
  wolf: ["wolf", "bear", "moose", "bison", "raccoon", "yeti", "dragon"],
  moose: ["moose", "deer", "bison", "bear", "wolf"],
  bison: ["bison", "moose", "deer", "bear", "wolf"],
  raccoon: ["raccoon", "bear", "beaver", "turtle", "owl"],
  turtle: ["turtle", "beaver", "fish", "owl", "butterfly"],
  yeti: ["yeti", "sasquatch", "bear", "wolf", "dragon"]
});

function stickerLibraryItem(id) {
  return [...DEFAULT_STICKER_LIBRARY, ...customStickerLibrary].find(item => item.id === id) || null;
}

function stickerVariantItems(sticker) {
  const ids = STICKER_STYLE_VARIANTS[sticker?.libraryId] || [];
  return ids.map(stickerLibraryItem).filter(item => item?.url);
}

function stickerStylePopupVisual(shape, color) {
  return `<b class="sticker-library-pin is-shape-${escapeHtml(shape)}" style="--object-pin-color:${escapeHtml(color)}"><i></i></b>`;
}

function closeStickerStylePopup() {
  stickerStylePopup?.remove();
  stickerStylePopup = null;
}

function openStickerStylePopup(sticker, pointerEvent) {
  if (!sticker || !isEditorSite()) return;
  closeStickerStylePopup();
  const before = stickerSnapshot(sticker);
  const popup = document.createElement("section");
  popup.className = "sticker-style-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `Edit ${sticker.label} style`);
  const color = () => sticker.pin?.color || "#2f6f55";
  const preview = document.createElement("div");
  preview.className = "sticker-style-popup-preview";
  const refresh = () => {
    const artwork = sticker.pin?.style === "graphic" && (sticker.pin?.graphicUrl || sticker.imageUrl);
    preview.innerHTML = sticker.objectClass === "null"
      ? '<b class="sticker-library-null">NULL</b>'
      : artwork
        ? `<img src="${escapeHtml(artwork)}" alt="${escapeHtml(sticker.label)}">`
        : stickerStylePopupVisual(sticker.pin?.shape || "round", color());
    renderStickers();
  };
  const title = document.createElement("strong"); title.textContent = `${sticker.label} style`;
  const colors = document.createElement("div"); colors.className = "sticker-style-popup-colors";
  ["#2f6f55", "#d1495b", "#e49b38", "#397cb4", "#7656b5", "#ad4f83", "#7e5134", "#25313d"].forEach(value => {
    const button = document.createElement("button"); button.type = "button"; button.title = `Use ${value}`; button.style.setProperty("--sticker-style-color", value);
    button.addEventListener("click", () => { sticker.pin ||= {}; sticker.pin.color = value; sticker.pin.shapeEnabled = true; refresh(); });
    colors.append(button);
  });
  const shapes = document.createElement("div"); shapes.className = "sticker-style-popup-shapes";
  ["round", "square", "teardrop", "arrow", "heart", "plus", "speech", "note", "diamond", "hexagon", "octagon", "star", "notched-square", "capsule"].forEach(shape => {
    const button = document.createElement("button"); button.type = "button"; button.title = shape.replace(/-/g, " "); button.innerHTML = stickerStylePopupVisual(shape, color());
    button.addEventListener("click", () => { sticker.pin ||= {}; sticker.pin.shape = shape; sticker.pin.shapeEnabled = true; refresh(); });
    shapes.append(button);
  });
  const variants = stickerVariantItems(sticker);
  const artworkChoices = document.createElement("div"); artworkChoices.className = "sticker-style-popup-artwork";
  if (variants.length) {
    const heading = document.createElement("span"); heading.textContent = "Artwork"; artworkChoices.append(heading);
    variants.forEach(variant => {
      const button = document.createElement("button"); button.type = "button"; button.title = variant.label;
      button.innerHTML = `<img src="${escapeHtml(variant.url)}" alt="${escapeHtml(variant.label)}">`;
      button.addEventListener("click", () => {
        sticker.imageUrl = variant.url;
        sticker.pin ||= {};
        sticker.pin.graphicUrl = variant.url;
        sticker.pin.style = "graphic";
        sticker.pin.shapeEnabled = false;
        sticker.label = variant.label;
        refresh();
      });
      artworkChoices.append(button);
    });
  }
  const actions = document.createElement("footer"); actions.className = "sticker-style-popup-actions";
  const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => {
    Object.keys(sticker).forEach(key => delete sticker[key]);
    Object.assign(sticker, before);
    renderStickers(); closeStickerStylePopup();
  });
  const confirm = document.createElement("button"); confirm.type = "button"; confirm.textContent = "OK";
  confirm.addEventListener("click", () => {
    recordStickerHistory({ before, after: stickerSnapshot(sticker) });
    saveTrips(); markProjectDirty("journeys"); renderStickers(); closeStickerStylePopup();
  });
  actions.append(cancel, confirm); popup.append(title, preview, colors, shapes, artworkChoices, actions);
  popup.style.left = `${Math.min(window.innerWidth - 284, Math.max(10, Number(pointerEvent?.clientX || 20) + 14))}px`;
  popup.style.top = `${Math.max(10, Number(pointerEvent?.clientY || 20) + 14)}px`;
  document.body.append(popup);
  const bounds = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(10, Math.min(window.innerWidth - bounds.width - 10, bounds.left))}px`;
  popup.style.top = `${Math.max(10, Math.min(window.innerHeight - bounds.height - 10, bounds.top))}px`;
  stickerStylePopup = popup; refresh();
}

function selectEndpointFeature(kind, routeIndex, anchor, { toggle = false } = {}) {
  const key = `${kind}:${routeIndex}:${anchor}`;
  const priorPrimary = selectedEndpointFeatureKey;
  if (toggle && selectedEndpointFeatureKeys.has(key)) selectedEndpointFeatureKeys.delete(key);
  else {
    if (!toggle) {
      selectedStickerId = "";
      selectedStickerIds.clear();
      selectedEndpointFeatureKeys.clear();
      routeAnimationIconSelected = false;
    }
    selectedEndpointFeatureKeys.add(key);
  }
  // Additive selection must not steal the active feature that owns the
  // inspector and its stronger visual treatment.
  selectedEndpointFeatureKey = toggle && selectedEndpointFeatureKeys.has(priorPrimary)
    ? priorPrimary
    : (selectedEndpointFeatureKeys.has(key) ? key : [...selectedEndpointFeatureKeys][0] || "");
}

function selectSticker(stickerId, { toggle = false, additive = false } = {}) {
  if (!stickerId) return;
  const priorPrimary = selectedStickerId;
  if (!els.mediaViewer?.hidden && !toggle && !additive && priorPrimary && priorPrimary !== stickerId) closeJourneyMedia?.();
  const groupMembers = stickerGroupForId(stickerId)?.[1] || [stickerId];
  if (toggle && groupMembers.every(id => selectedStickerIds.has(id))) groupMembers.forEach(id => selectedStickerIds.delete(id));
  else {
    // An ordinary click establishes a new selection. Shift-click is the only
    // map gesture that intentionally leaves the blue soft-selection frames.
    if (!additive && !toggle) {
      selectedStickerIds.clear();
      selectedEndpointFeatureKeys.clear();
      selectedEndpointFeatureKey = "";
      routeAnimationIconSelected = false;
    }
    groupMembers.forEach(id => selectedStickerIds.add(id));
  }
  // Shift-click builds a selection without stealing the primary object that
  // owns the inspector and glow. A normal click on a group deliberately does.
  selectedStickerId = (toggle || additive) && selectedStickerIds.has(priorPrimary)
    ? priorPrimary
    : (selectedStickerIds.has(stickerId) ? stickerId : [...selectedStickerIds].at(-1) || "");
}

function clearStickerSelection() {
  // A working media preview is tied to one selected sticker. It must not
  // linger after that object is deselected through any map gesture.
  if (!els.mediaViewer?.hidden) closeJourneyMedia?.();
  selectedStickerIds.clear();
  selectedEndpointFeatureKeys.clear();
  selectedEndpointFeatureKey = "";
  routeAnimationIconSelected = false;
  selectedStickerId = "";
  selectedTimelineStickerId = "";
}

function selectedStickerRecords() {
  const selected = selectedStickerIds.size ? selectedStickerIds : new Set(selectedStickerId ? [selectedStickerId] : []);
  return (activeTrip()?.stickers || []).filter(sticker => selected.has(sticker.id));
}

function stickerGroups(trip = activeTrip()) {
  if (!trip) return {};
  trip.stickerGroups ||= {};
  Object.entries(trip.stickerGroups).forEach(([id, members]) => {
    const valid = [...new Set((members || []).filter(member => (trip.stickers || []).some(sticker => sticker.id === member)))];
    if (valid.length > 1) trip.stickerGroups[id] = valid;
    else delete trip.stickerGroups[id];
  });
  return trip.stickerGroups;
}

function stickerGroupForId(stickerId, trip = activeTrip()) {
  return Object.entries(stickerGroups(trip)).find(([, members]) => members.includes(stickerId)) || null;
}

function groupSelectedStickers() {
  const trip = activeTrip();
  const initial = selectedStickerRecords().map(sticker => sticker.id);
  if (!trip || initial.length < 2) return false;
  const groups = stickerGroups(trip);
  const members = new Set(initial);
  initial.forEach(id => stickerGroupForId(id, trip)?.[1].forEach(member => members.add(member)));
  Object.entries(groups).forEach(([groupId, groupMembers]) => {
    if (groupMembers.some(member => members.has(member))) delete groups[groupId];
  });
  const groupId = `sticker-group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  groups[groupId] = [...members];
  selectedStickerIds = members;
  selectedStickerId = [...members][0] || "";
  saveTrips(); markProjectDirty("journeys"); renderStickers();
  els.status.textContent = `Grouped ${members.size} stickers.`;
  return true;
}

function ungroupSelectedStickers() {
  const trip = activeTrip();
  if (!trip) return false;
  const selected = new Set(selectedStickerRecords().map(sticker => sticker.id));
  const groups = stickerGroups(trip);
  const removed = Object.entries(groups).filter(([, members]) => members.some(member => selected.has(member)));
  if (!removed.length) return false;
  removed.forEach(([groupId]) => delete groups[groupId]);
  saveTrips(); markProjectDirty("journeys"); renderStickers();
  els.status.textContent = "Ungrouped selected stickers.";
  return true;
}

function updateSelectionControls() {
  const count = selectedStickerRecords().length + selectedEndpointFeatureKeys.size + Number(routeAnimationIconSelected);
  if (els.selectionCount) els.selectionCount.textContent = `${count} selected`;
  if (els.selectionGroup) els.selectionGroup.disabled = selectedStickerRecords().length < 2;
  if (els.selectionUngroup) els.selectionUngroup.disabled = !selectedStickerRecords().some(sticker => stickerGroupForId(sticker.id));
  renderSelectionShortcutMenu();
}
const stickerHistoryByScope = new Map();
const STICKER_HISTORY_MAX_ENTRIES = 180;
const STICKER_HISTORY_MAX_TOTAL_ENTRIES = 500;
let stickerHistorySequence = 0;
let stickerControlHistoryBefore = null;
let stickerAnimationHistoryBefore = null;
let stickerClipboard = null;

function stickerHistoryScopeKey(trip = activeTrip()) {
  if (!trip) return "";
  const view = currentStickerViewKey();
  if (view === "stop") return `${trip.id}:stop:${activeJourneyStop()?.id || "none"}:${selectedStopDayIso || "none"}`;
  if (view === "route") return `${trip.id}:route:${state.activeRouteIndex}`;
  return `${trip.id}:${view}`;
}

function stickerSnapshot(sticker) {
  return sticker ? structuredClone(sticker) : null;
}

function recordStickerHistory({ trip = activeTrip(), before = null, after = null, scopeKey = stickerHistoryScopeKey(trip) } = {}) {
  if (!trip || !scopeKey) return;
  const beforeText = JSON.stringify(before);
  const afterText = JSON.stringify(after);
  if (beforeText === afterText) return;
  const history = stickerHistoryByScope.get(scopeKey) || { undo: [], redo: [] };
  history.undo.push({ tripId: trip.id, stickerId: after?.id || before?.id || "", before, after, sequence: ++stickerHistorySequence });
  if (history.undo.length > STICKER_HISTORY_MAX_ENTRIES) history.undo.splice(0, history.undo.length - STICKER_HISTORY_MAX_ENTRIES);
  history.redo = [];
  stickerHistoryByScope.set(scopeKey, history);
  const allEntries = [...stickerHistoryByScope.values()].flatMap(item => [...item.undo, ...item.redo]);
  if (allEntries.length > STICKER_HISTORY_MAX_TOTAL_ENTRIES) {
    const oldest = allEntries.sort((a, b) => a.sequence - b.sequence).slice(0, allEntries.length - STICKER_HISTORY_MAX_TOTAL_ENTRIES);
    oldest.forEach(command => {
      stickerHistoryByScope.forEach(history => {
        [history.undo, history.redo].forEach(stack => {
          const index = stack.indexOf(command);
          if (index >= 0) stack.splice(index, 1);
        });
      });
    });
  }
}

function applyStickerHistoryCommand(command, direction) {
  const trip = state.trips.find(item => item.id === command.tripId);
  const snapshot = direction === "undo" ? command.before : command.after;
  if (!trip) return false;
  const index = (trip.stickers || []).findIndex(sticker => sticker.id === command.stickerId);
  if (snapshot) {
    if (index >= 0) trip.stickers[index] = normalizeSticker(snapshot);
    else trip.stickers.push(normalizeSticker(snapshot));
    selectedStickerId = snapshot.id;
  } else if (index >= 0) {
    trip.stickers.splice(index, 1);
    if (selectedStickerId === command.stickerId) selectedStickerId = "";
  }
  saveTrips();
  markProjectDirty("journeys");
  renderStickerSelectionControls();
  renderStickers();
  return true;
}

function runStickerHistory(direction) {
  const history = stickerHistoryByScope.get(stickerHistoryScopeKey());
  if (!history) return false;
  const source = direction === "undo" ? history.undo : history.redo;
  const destination = direction === "undo" ? history.redo : history.undo;
  const command = source.pop();
  if (!command || !applyStickerHistoryCommand(command, direction)) return false;
  destination.push(command);
  els.status.textContent = direction === "undo" ? "Undid sticker edit." : "Redid sticker edit.";
  return true;
}

function copySelectedSticker() {
  const sticker = selectedStickerRecord();
  renderSelectionShortcutMenu();
  if (!sticker) return false;
  stickerClipboard = stickerSnapshot(sticker);
  els.status.textContent = `Copied sticker: ${sticker.label}.`;
  return true;
}

function pasteStickerCopy() {
  const trip = activeTrip();
  if (!trip || !stickerClipboard) return false;
  const scope = currentStickerViewKey();
  const source = stickerSnapshot(stickerClipboard);
  const sourcePoint = map?.latLngToContainerPoint?.([source.lat, source.lon]);
  const offset = sourcePoint && map?.containerPointToLatLng
    ? map.containerPointToLatLng(sourcePoint.add([24, 24]))
    : { lat: source.lat + 0.0004, lng: source.lon + 0.0004 };
  delete source.id;
  source.label = `${source.label} copy`;
  source.lat = offset.lat;
  source.lon = offset.lng;
  source.placedView = scope;
  source.scope = scope;
  source.routeIndex = scope === "us" || scope === "journey" ? null : state.activeRouteIndex;
  source.stopId = scope === "stop" ? activeJourneyStop()?.id || "" : "";
  source.dayIso = scope === "stop" ? selectedStopDayIso || "" : "";
  const pasted = normalizeSticker(source);
  trip.stickers ||= [];
  trip.stickers.push(pasted);
  selectedStickerId = pasted.id;
  recordStickerHistory({ trip, before: null, after: stickerSnapshot(pasted) });
  saveTrips();
  markProjectDirty("journeys");
  renderStickerSelectionControls();
  renderStickers();
  els.status.textContent = `Pasted sticker: ${pasted.label}.`;
  return true;
}

function cutSelectedSticker() {
  const trip = activeTrip();
  const sticker = selectedStickerRecord();
  if (!trip || !sticker || !copySelectedSticker()) return false;
  recordStickerHistory({ trip, before: stickerSnapshot(sticker), after: null });
  trip.stickers = trip.stickers.filter(item => item.id !== sticker.id);
  selectedStickerId = "";
  saveTrips();
  markProjectDirty("journeys");
  renderStickerSelectionControls();
  renderStickers();
  els.status.textContent = `Cut sticker: ${sticker.label}.`;
  return true;
}
let hoveredStickerId = "";
let timelineHoveredStickerIds = new Set();

function setTimelineHover(ids = []) {
  timelineHoveredStickerIds = new Set(ids);
  document.querySelectorAll(".map-sticker-icon[data-sticker-id]").forEach(icon => {
    icon.querySelector(".map-sticker-frame")?.classList.toggle("is-timeline-focused", timelineFocusesSticker(icon.dataset.stickerId));
  });
}

function timelineFocusesSticker(stickerId) {
  return selectedTimelineStickerId === stickerId || timelineHoveredStickerIds.has(stickerId);
}
const lastStickerRenderedSizes = new Map();
let lastVisibleStickerIds = new Set();
const projectDirtyCategories = new Set();
let welcomeGateShownAt = Date.now();
let welcomeGateTimer = 0;
let welcomeGateMapMessage = "Loading roads and map features...";
let welcomeGateLastStateKey = "";
const USER_STORY_PROGRESS_KEY = "rv-map-user-story-progress-v1";
let userStoryProgress = { started: false, startMediaSeen: false };

const layerStyles = {
  land: { label: "Land", color: "#efd6a5", size: 1, min: 0, max: 1, opacity: 1, blend: "normal", texture: layerTexture() },
  water: { label: "Water", color: "#5bc5d7", size: 1, min: 0, max: 1, opacity: 1, blend: "normal", texture: layerTexture({ opacity: 0.1, blend: "soft-light", blendAmount: 0.75 }) },
  deserts: { label: "Deserts", color: "#d9b56d", size: 1, min: 0, max: 1, opacity: 0.5, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  texture: { label: "Texture", color: "#a87c52", size: 0.72, min: 0, max: 1, opacity: 1, blend: "multiply", texture: layerTexture({ opacity: 0.12 }) },
  parks: { label: "Parks", color: "#9dbc79", size: 0.36, min: 0, max: 1, opacity: 0.44, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  buildings: { label: "Buildings", color: "#d8c9ab", size: 0.46, min: 0, max: 1, opacity: 0.62, blend: "normal", texture: layerTexture({ type: "none", opacity: 0 }) },
  // Contours need a little room beyond the former 1.0 maximum, not the
  // enormous illustrated-relief range that made the control misleading.
  topography: { label: "Topography", color: "#d8d09a", colorHigh: "#6f8b58", size: 0.58, min: 0, max: 1.5, opacity: 1, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  faintTopography: { label: "Faint topo", color: "#e8dfb9", colorHigh: "#8fa07a", size: 0.22, min: 0, max: 1.5, opacity: 1, blend: "soft-light", texture: layerTexture({ type: "none", opacity: 0 }) },
  highways: { label: "Highways", color: "#a6783a", size: 0.9, min: 0, max: 1.4, opacity: 1, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  majorRoads: { label: "Major roads", color: "#8d6a3f", size: 0.82, min: 0, max: 1.4, opacity: 1, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  minorRoads: { label: "Minor roads", color: "#8d6a3f", size: 0.34, min: 0, max: 1.1, opacity: 1, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  railroads: { label: "Railroads", color: "#6f655a", size: 0.34, min: 0, max: 1.1, opacity: 0.75, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  streets: { label: "Streets", color: "#8d6a3f", size: 0.82, min: 0, max: 1, opacity: 1, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  faintStreets: { label: "Faint streets", color: "#8d6a3f", size: 0.34, min: 0, max: 1, opacity: 1, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  countryBorders: { label: "Country borders", color: "#a7697b", size: 1.35, min: 0.5, max: 5, opacity: 1, blend: "normal", zoomScale: true, texture: layerTexture({ type: "none", opacity: 0 }) },
  stateBorders: { label: "State borders", color: "#b97a88", size: 1, min: 0.5, max: 4, opacity: 1, blend: "normal", zoomScale: true, texture: layerTexture({ type: "none", opacity: 0 }) },
  countyBorders: { label: "County borders", color: "#b97a88", size: 0.7, min: 0.5, max: 3, opacity: 0.18, blend: "normal", zoomScale: true, texture: layerTexture({ type: "none", opacity: 0 }) },
  stateLines: { label: "State lines", color: "#b97a88", size: 1, min: 0.5, max: 4, opacity: 1, blend: "normal", zoomScale: true, texture: layerTexture() },
  faintStateLines: { label: "Faint states", color: "#b97a88", size: 1, min: 0.5, max: 3, opacity: 0.18, zoomScale: true, texture: layerTexture() },
  visitedStates: { label: "Visited states", color: "#2777d8", size: 0.22, min: 0, max: 1, opacity: 0.22, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  route: { label: "Route", color: ROUTE_COLOR, size: 5, min: 2, max: 12, opacity: 1, blend: "normal", halo: 4, zoomScale: true, texture: layerTexture() },
  faintRoute: { label: "Faint route", color: ROUTE_COLOR, size: 4, min: 1, max: 10, opacity: 0.24, blend: "normal", zoomScale: true, texture: layerTexture({ opacity: 0.04 }) },
  startEnd: { label: "Start/end", color: "#9f2d1e", size: 7, min: 3, max: 16, opacity: 1, blend: "normal", zoomScale: true, texture: layerTexture() },
  dayZoneFill: { label: "Day zone fill", color: "#25313d", size: 0.08, min: 0, max: 0.5, opacity: 0.08, blend: "multiply", texture: layerTexture({ type: "none", opacity: 0 }) },
  dayZoneStroke: { label: "Day zone stroke", color: "#25313d", size: 2, min: 0.5, max: 8, dashLength: 8, dashGap: 10, dashLocked: false, opacity: 0.68, blend: "normal", texture: layerTexture({ type: "none", opacity: 0 }) },
  smallTowns: { label: "Small towns", color: "#5d6874", size: 11, min: 8, max: 18, opacity: 1, blend: "normal", font: "noto-sans", fontWeight: 550, italic: false, fontStretch: 100, fontScaleY: 100, letterSpacing: 0, wordSpacing: 0, textCase: "normal", labelBackground: true, labelBackgroundColor: "#ffffff", labelBackgroundOpacity: 0.84, minZoom: 7, zoomScale: true, texture: layerTexture() },
  cities: { label: "Regional labels", color: "#25313d", size: 12.5, min: 9, max: 22, opacity: 1, blend: "normal", font: "noto-sans", fontWeight: 650, italic: false, fontStretch: 104, fontScaleY: 104, letterSpacing: 0.01, wordSpacing: 0.02, textCase: "normal", labelBackground: true, labelBackgroundColor: "#ffffff", labelBackgroundOpacity: 0.86, minZoom: 5, zoomScale: true, texture: layerTexture() },
  pois: { label: "POIs", color: "#526b55", size: 10.5, min: 8, max: 18, opacity: 0.92, blend: "normal", font: "noto-sans", fontWeight: 550, italic: false, fontStretch: 100, fontScaleY: 100, letterSpacing: 0, wordSpacing: 0, textCase: "normal", labelBackground: true, labelBackgroundColor: "#ffffff", labelBackgroundOpacity: 0.82, minZoom: 8, zoomScale: true, texture: layerTexture({ type: "none", opacity: 0 }) },
  routeStopLabels: { label: "Route stop labels", color: "#25313d", size: 12.5, min: 8, max: 24, opacity: 1, blend: "normal", font: "noto-sans", fontWeight: 650, italic: false, fontStretch: 104, fontScaleY: 104, letterSpacing: 0, wordSpacing: 0.02, textCase: "normal", labelBackground: true, labelBackgroundColor: "#ffffff", labelBackgroundOpacity: 0.88, minZoom: 3.8, zoomScale: true, texture: layerTexture({ type: "none", opacity: 0 }) },
  capitals: { label: "Capitals", color: "#7f2c1e", size: 12.5, min: 9, max: 24, opacity: 1, blend: "normal", font: "noto-sans", fontWeight: 700, italic: false, fontStretch: 106, fontScaleY: 106, letterSpacing: 0.02, wordSpacing: 0.03, textCase: "normal", labelBackground: true, labelBackgroundColor: "#ffffff", labelBackgroundOpacity: 0.88, zoomScale: true, texture: layerTexture({ type: "none", opacity: 0 }) },
  capitols: { label: "Capitols", color: "#7f2c1e", size: 12.5, min: 9, max: 24, opacity: 1, blend: "normal", font: "noto-sans", fontWeight: 700, italic: false, fontStretch: 106, fontScaleY: 106, letterSpacing: 0.02, wordSpacing: 0.03, textCase: "normal", labelBackground: true, labelBackgroundColor: "#ffffff", labelBackgroundOpacity: 0.88, zoomScale: true, texture: layerTexture() }
};

layerStyles.streets = layerStyles.majorRoads;
layerStyles.faintStreets = layerStyles.minorRoads;
layerStyles.stateLines = layerStyles.stateBorders;
layerStyles.faintStateLines = layerStyles.countyBorders;
layerStyles.capitols = layerStyles.capitals;

const uiFontStyle = {
  label: "UI panels",
  color: "#25313d",
  size: 13,
  min: 10,
  max: 18,
  opacity: 1,
  blend: "normal",
  font: "noto-sans",
  fontWeight: 650,
  italic: false,
  fontStretch: 100,
  fontScaleY: 100,
  letterSpacing: 0,
  wordSpacing: 0,
  textCase: "normal",
  labelBackground: false,
  labelBackgroundColor: "#ffffff",
  labelBackgroundOpacity: 0
};

const COLOR_SWATCHES = [
  "#d9442e", "#9f2d1e", "#b97a88", "#25313d",
  "#5d6874", "#1f7a5c", "#2f6fbb", "#7f2c1e",
  "#f2a900", "#7a4fd6", "#222222", "#ffffff"
];

function unusedPaletteStrokeColor(strokes = [], fallback = COLOR_SWATCHES[0]) {
  const used = new Set((strokes || []).map(stroke => String(stroke?.color || "").toLowerCase()));
  return COLOR_SWATCHES.find(color => !used.has(color.toLowerCase())) || fallback;
}

const MAX_RECENT_COLORS = 12;
const MAX_SAVED_COLORS = 36;
const TRADEMARK_ASSOCIATED_COLORS = [
  { name: "Tiffany Blue", color: "#81d8d0" },
  { name: "T-Mobile Magenta", color: "#e20074" },
  { name: "UPS Brown", color: "#351c15" },
  { name: "Barbie Pink", color: "#e0218a" },
  { name: "Target Red", color: "#cc0000" }
];
const TRADEMARK_COLOR_DISTANCE = 18;

function completeTheme(theme = {}) {
  const source = theme && typeof theme === "object" ? theme : {};
  return {
    ...source,
    label: source.label || "Custom Theme",
    description: source.description || "Editable MapLibre theme",
    uiTheme: source.uiTheme || getUiThemeState?.() || {},
    controls: { ...(source.controls || {}) },
    toggles: { ...(source.toggles || getToggleState?.() || {}) },
    styles: completeThemeStyles(source.styles || {}),
    texture: source.texture ?? null
  };
}

const els = {
  empty: document.querySelector("#emptyState"),
  mapCanvas: document.querySelector("#map"),
  title: document.querySelector("#routeTitle"),
  routeDayButtons: document.querySelector("#routeDayButtons"),
  distance: document.querySelector("#distanceValue"),
  points: document.querySelector("#pointsValue"),
  start: document.querySelector("#startValue"),
  end: document.querySelector("#endValue"),
  startName: document.querySelector("#startNameValue"),
  endName: document.querySelector("#endNameValue"),
  startGps: document.querySelector("#startGpsValue"),
  endGps: document.querySelector("#endGpsValue"),
  status: document.querySelector("#statusText"),
  input: document.querySelector("#kmlInput"),
  downloadRoadPackage: document.querySelector("#downloadRoadPackage"),
  downloadRoadPackageElements: document.querySelector("#downloadRoadPackageElements"),
  downloadRoadPackageTrips: document.querySelector("#downloadRoadPackageTrips"),
  chooseRoadFolder: document.querySelector("#chooseRoadFolder"),
  roadFolderInput: document.querySelector("#roadFolderInput"),
  roadFolderStatus: document.querySelector("#roadFolderStatus"),
  zoomIn: document.querySelector("#zoomIn"),
  zoomOut: document.querySelector("#zoomOut"),
  reset: document.querySelector("#resetView"),
  setMapView: document.querySelector("#setMapView"),
  panLeft: document.querySelector("#panLeft"),
  panRight: document.querySelector("#panRight"),
  usView: document.querySelector("#usView"),
  featureToggleMarkers: document.querySelector("#featureToggleMarkers"),
  featureToggleStopNames: document.querySelector("#featureToggleStopNames"),
  featureToggleRoute: document.querySelector("#featureToggleRoute"),
  featureToggleRouteIcon: document.querySelector("#featureToggleRouteIcon"),
  featureToggleLandmarks: document.querySelector("#featureToggleLandmarks"),
  reverseRoute: document.querySelector("#reverseRoute"),
  playRoute: document.querySelector("#playRoute"),
  previousJourney: document.querySelector("#previousJourney"),
  nextJourney: document.querySelector("#nextJourney"),
  previousRoute: document.querySelector("#previousRoute"),
  nextRoute: document.querySelector("#nextRoute"),
  previousStop: document.querySelector("#previousStop"),
  nextStop: document.querySelector("#nextStop"),
  previousStoryDay: document.querySelector("#previousStoryDay"),
  nextStoryDay: document.querySelector("#nextStoryDay"),
  playTripAnimation: document.querySelector("#playTripAnimation"),
  playbackSpeed: document.querySelector("#playbackSpeed"),
  routePlaybackSpeed: document.querySelector("#routePlaybackSpeed"),
  routePlaybackSpeedValue: document.querySelector("#routePlaybackSpeedValue"),
  routePlaybackSpeedLevels: [...document.querySelectorAll("[data-route-playback-speed-level]")],
  routeCameraMode: document.querySelector("#routeCameraMode"),
  routeFollowCameraControls: document.querySelector("#routeFollowCameraControls"),
  routeFollowZoom: document.querySelector("#routeFollowZoom"),
  routeFollowZoomValue: document.querySelector("#routeFollowZoomValue"),
  routeFollowDeadZone: document.querySelector("#routeFollowDeadZone"),
  routeFollowDeadZoneValue: document.querySelector("#routeFollowDeadZoneValue"),
  routeFollowTurnAware: document.querySelector("#routeFollowTurnAware"),
  journeyProgress: document.querySelector("#journeyProgress"),
  previousDay: document.querySelector("#previousDay"),
  nextDay: document.querySelector("#nextDay"),
  zoneModifyMapPrompt: document.querySelector("#zoneModifyMapPrompt"),
  mediaViewer: document.querySelector("#mediaViewer"),
  mediaViewerTitle: document.querySelector("#mediaViewerTitle"),
  mediaViewerContent: document.querySelector("#mediaViewerContent"),
  mediaViewerControls: document.querySelector("#mediaViewerControls"),
  mediaViewerViewport: document.querySelector("#mediaViewerViewport"),
  mediaViewerFullscreen: document.querySelector("#mediaViewerFullscreen"),
  closeMediaViewer: document.querySelector("#closeMediaViewer"),
  mediaPlayPause: document.querySelector("#mediaPlayPause"),
  mediaPlayhead: document.querySelector("#mediaPlayhead"),
  mediaTime: document.querySelector("#mediaTime"),
  mediaMute: document.querySelector("#mediaMute"),
  mediaVolume: document.querySelector("#mediaVolume"),
  mediaStylePreview: document.querySelector("#mediaStylePreview"),
  stickerMediaPreview: document.querySelector("#stickerMediaPreview"),
  splashMediaPreview: document.querySelector("#splashMediaPreview"),
  mediaStyleType: document.querySelector("#mediaStyleType"),
  mediaUseDefaultStyle: document.querySelector("#mediaUseDefaultStyle"),
  mediaStyleBackground: document.querySelector("#mediaStyleBackground"),
  mediaStyleBorder: document.querySelector("#mediaStyleBorder"),
  mediaStyleText: document.querySelector("#mediaStyleText"),
  mediaStyleRadius: document.querySelector("#mediaStyleRadius"),
  mediaStyleBorderWidth: document.querySelector("#mediaStyleBorderWidth"),
  mediaStylePadding: document.querySelector("#mediaStylePadding"),
  mediaStyleShadow: document.querySelector("#mediaStyleShadow"),
  mediaStyleFit: document.querySelector("#mediaStyleFit"),
  mediaFullscreenEnabled: document.querySelector("#mediaFullscreenEnabled"),
  mediaFullscreenTarget: document.querySelector("#mediaFullscreenTarget"),
  mediaMapVisibility: document.querySelector("#mediaMapVisibility"),
  mediaMapBlend: document.querySelector("#mediaMapBlend"),
  mediaMapOpacity: document.querySelector("#mediaMapOpacity"),
  mediaMapBlur: document.querySelector("#mediaMapBlur"),
  mediaShowDefaultPlaceholder: document.querySelector("#mediaShowDefaultPlaceholder"),
  mediaLayoutPresetGrid: document.querySelector("#mediaLayoutPresetGrid"),
  mediaLayoutName: document.querySelector("#mediaLayoutName"),
  mediaLayoutColumns: document.querySelector("#mediaLayoutColumns"),
  mediaLayoutGap: document.querySelector("#mediaLayoutGap"),
  mediaLayoutFrame: document.querySelector("#mediaLayoutFrame"),
  mediaLayoutFramePadding: document.querySelector("#mediaLayoutFramePadding"),
  mediaLayoutFrameRadius: document.querySelector("#mediaLayoutFrameRadius"),
  mediaLayoutSlotList: document.querySelector("#mediaLayoutSlotList"),
  mediaAddLayoutSlot: document.querySelector("#mediaAddLayoutSlot"),
  mediaEditLayout: document.querySelector("#mediaEditLayout"),
  mediaUpdateLayout: document.querySelector("#mediaUpdateLayout"),
  mediaDuplicateLayout: document.querySelector("#mediaDuplicateLayout"),
  mediaSaveLayout: document.querySelector("#mediaSaveLayout"),
  mediaDeleteLayout: document.querySelector("#mediaDeleteLayout"),
  usageOverlay: document.querySelector("#usageOverlay"),
  siteModeToggle: document.querySelector("#siteModeToggle"),
  userJumpToStart: document.querySelector("#userJumpToStart"),
  tabUsers: document.querySelector("#tabUsers"),
  panelUsers: document.querySelector("#panelUsers"),
  userRecordButton: document.querySelector("#userRecordButton"),
  usersStagingAdminPanel: document.querySelector("#usersStagingAdminPanel"),
  usersAddRecordedToStaging: document.querySelector("#usersAddRecordedToStaging"),
  usersClearRecordedSession: document.querySelector("#usersClearRecordedSession"),
  usersClearStaging: document.querySelector("#usersClearStaging"),
  usersStagingList: document.querySelector("#usersStagingList"),
  userMaterialControls: document.querySelector("#userMaterialControls"),
  userThemeButton: document.querySelector("#userThemeButton"),
  userStoryDock: document.querySelector("#userStoryDock"),
  randomThemeButton: document.querySelector("#randomThemeButton"),
  storyThemeSelect: document.querySelector("#storyThemeSelect"),
  storyPrevious: document.querySelector("#storyPrevious"),
  storyNext: document.querySelector("#storyNext"),
  storyJourneyView: document.querySelector("#storyJourneyView"),
  storyUsView: document.querySelector("#storyUsView"),
  userMaterialButton: document.querySelector("#userMaterialButton"),
  userThemePanel: document.querySelector("#userThemePanel"),
  userMaterialPanel: document.querySelector("#userMaterialPanel"),
  userDeviceFrame: document.querySelector("#userDeviceFrame"),
  mapBoundsOverlay: document.querySelector("#mapBoundsOverlay"),
  deviceBoundsOverlay: document.querySelector("#deviceBoundsOverlay"),
  editorPreviewGuide: document.querySelector("#editorPreviewGuide"),
  editorPreviewGuideViewport: document.querySelector("#editorPreviewGuideViewport"),
  editorPreviewGuideLabel: document.querySelector("#editorPreviewGuideLabel"),
  userMapViewport: document.querySelector("#userMapViewport"),
  userMapViewportResizeLayer: document.querySelector("#userMapViewportResizeLayer"),
  userDevicePreviewResizeLayer: document.querySelector("#userDevicePreviewResizeLayer"),
  userFrameLayoutLayer: document.querySelector("#userFrameLayoutLayer"),
  usersBuilderAdminGrid: document.querySelector("#usersBuilderAdminGrid"),
  userSitePanelTop: document.querySelector("#userSitePanelTop"),
  userSitePanelLeft: document.querySelector("#userSitePanelLeft"),
  userSitePanelRight: document.querySelector("#userSitePanelRight"),
  userSitePanelBottom: document.querySelector("#userSitePanelBottom"),
  usersBuilderWorkspace: document.querySelector("#usersBuilderWorkspace"),
  usersAppearanceAdminPanel: document.querySelector("#usersAppearanceAdminPanel"),
  usersLeatherColor: document.querySelector("#usersLeatherColor"),
  usersAppearanceSections: document.querySelector("#usersAppearanceSections"),
  usersHigherLevelControls: document.querySelector("#usersHigherLevelControls"),
  usersArrangeGridButton: document.querySelector("#usersArrangeGridButton"),
  usersArrangeGridMenu: document.querySelector("#usersArrangeGridMenu"),
  usersArrangeGridColumns: document.querySelector("#usersArrangeGridColumns"),
  usersArrangeGridGap: document.querySelector("#usersArrangeGridGap"),
  usersArrangeGridApply: document.querySelector("#usersArrangeGridApply"),
  usersSnapMenuButton: document.querySelector("#usersSnapMenuButton"),
  usersSnapMenu: document.querySelector("#usersSnapMenu"),
  usersDevicePreviewToolbar: document.querySelector("#usersDevicePreviewToolbar"),
  usersDevicePreviewSelect: document.querySelector("#usersDevicePreviewSelect"),
  usersDevicePreviewStatus: document.querySelector("#usersDevicePreviewStatus"),
  showMapBounds: document.querySelector("#showMapBounds"),
  lockUserDevicePreview: document.querySelector("#lockUserDevicePreview"),
  autofitUserDevicePreview: document.querySelector("#autofitUserDevicePreview"),
  usersLayoutPresetSelect: document.querySelector("#usersLayoutPresetSelect"),
  usersAddLayoutPreset: document.querySelector("#usersAddLayoutPreset"),
  usersRenameLayoutPreset: document.querySelector("#usersRenameLayoutPreset"),
  usersDuplicateLayoutPreset: document.querySelector("#usersDuplicateLayoutPreset"),
  usersDeleteLayoutPreset: document.querySelector("#usersDeleteLayoutPreset"),
  usersResetLayout: document.querySelector("#usersResetLayout"),
  usersGeometryFields: document.querySelector("#usersGeometryFields"),
  usersGeometryError: document.querySelector("#usersGeometryError"),
  usersGeometryNameLabel: document.querySelector("#usersGeometryNameLabel"),
  usersGeometryName: document.querySelector("#usersGeometryName"),
  usersGeometryRotationLabel: document.querySelector("#usersGeometryRotationLabel"),
  usersGeometryRotation: document.querySelector("#usersGeometryRotation"),
  usersElementContainerLabel: document.querySelector("#usersElementContainerLabel"),
  usersElementContainer: document.querySelector("#usersElementContainer"),
  usersControlInspector: document.querySelector("#usersControlInspector"),
  usersControlCustomLabel: document.querySelector("#usersControlCustomLabel"),
  usersControlShowLabel: document.querySelector("#usersControlShowLabel"),
  usersControlContainer: document.querySelector("#usersControlContainer"),
  usersControlTypeOptions: document.querySelector("#usersControlTypeOptions"),
  usersFreeTransformToggle: document.querySelector("#usersFreeTransformToggle"),
  usersViewportResizeDialog: document.querySelector("#usersViewportResizeDialog"),
  usersViewportResizeCopy: document.querySelector("#usersViewportResizeCopy"),
  usersViewportResizeCancel: document.querySelector("#usersViewportResizeCancel"),
  usersViewportResizeConfirm: document.querySelector("#usersViewportResizeConfirm"),
  usersUndoBuilder: document.querySelector("#usersUndoBuilder"),
  usersRedoBuilder: document.querySelector("#usersRedoBuilder"),
  usersLayoutDrawToggle: document.querySelector("#usersLayoutDrawToggle"),
  usersLayoutDeleteSelected: document.querySelector("#usersLayoutDeleteSelected"),
  usersLayoutDrawingStatus: document.querySelector("#usersLayoutDrawingStatus"),
  usersRegistrySummary: document.querySelector("#usersRegistrySummary"),
  usersRegistryPreview: document.querySelector("#usersRegistryPreview"),
  usersRecordedSessionStatus: document.querySelector("#usersRecordedSessionStatus"),
  usersPanelManager: document.querySelector("#usersPanelManager"),
  usersAddPanelTop: document.querySelector("#usersAddPanelTop"),
  usersRemovePanelTop: document.querySelector("#usersRemovePanelTop"),
  usersAddPanelRight: document.querySelector("#usersAddPanelRight"),
  usersRemovePanelRight: document.querySelector("#usersRemovePanelRight"),
  usersAddPanelBottom: document.querySelector("#usersAddPanelBottom"),
  usersRemovePanelBottom: document.querySelector("#usersRemovePanelBottom"),
  usersAddPanelLeft: document.querySelector("#usersAddPanelLeft"),
  usersRemovePanelLeft: document.querySelector("#usersRemovePanelLeft"),
  usersExitBuilder: document.querySelector("#usersExitBuilder"),
  usersLayoutPreview: document.querySelector("#usersLayoutPreview"),
  usersPlacementMenu: document.querySelector("#usersPlacementMenu"),
  welcomeGate: document.querySelector("#welcomeGate"),
  welcomeGateStatus: document.querySelector("#welcomeGateStatus"),
  welcomeGateDetail: document.querySelector("#welcomeGateDetail"),
  welcomeGateProgressFill: document.querySelector("#welcomeGateProgressFill"),
  welcomeGateImage: document.querySelector("#welcomeGateImage"),
  welcomeGateConsent: document.querySelector("#welcomeGateConsent"),
  welcomeGateAllow: document.querySelector("#welcomeGateAllow"),
  welcomeGateDecline: document.querySelector("#welcomeGateDecline"),
  imagePreviewDrawer: document.querySelector("#imagePreviewDrawer"),
  toggleImagePreviewDrawer: document.querySelector("#toggleImagePreviewDrawer"),
  imagePreviewTitle: document.querySelector("#imagePreviewTitle"),
  imagePreviewContent: document.querySelector("#imagePreviewContent"),
  allowPan: document.querySelector("#allowPan"),
  allowZoom: document.querySelector("#allowZoom"),
  overviewDeadZone: document.querySelector("#overviewDeadZone"),
  overviewZoneSize: document.querySelector("#overviewZoneSize"),
  overviewZoneSizeValue: document.querySelector("#overviewZoneSizeValue"),
  zoneDisplayType: document.querySelector("#zoneDisplayType"),
  routeZoneModeControls: document.querySelector("#routeZoneModeControls"),
  routeZoneSize: document.querySelector("#routeZoneSize"),
  routeZoneSizeValue: document.querySelector("#routeZoneSizeValue"),
  routeZoneOffset: document.querySelector("#routeZoneOffset"),
  routeZoneOffsetValue: document.querySelector("#routeZoneOffsetValue"),
  selectedRouteColor: document.querySelector("#selectedRouteColor"),
  precedingRouteColor: document.querySelector("#precedingRouteColor"),
  followingRouteColor: document.querySelector("#followingRouteColor"),
  routeFillColor: document.querySelector("#routeFillColor"),
  terminologyControls: [...document.querySelectorAll("[data-terminology-key]")],
  journeyStyleTarget: document.querySelector("#journeyStyleTarget"),
  journeyStyleColor: document.querySelector("#journeyStyleColor"),
  journeyStyleUsWidth: document.querySelector("#journeyStyleUsWidth"),
  journeyStyleUsWidthValue: document.querySelector("#journeyStyleUsWidthValue"),
  journeyStyleOutlineColor: document.querySelector("#journeyStyleOutlineColor"),
  journeyStyleOutlineWidth: document.querySelector("#journeyStyleOutlineWidth"),
  journeyStyleOutlineWidthValue: document.querySelector("#journeyStyleOutlineWidthValue"),
  journeyStyleOutlineOpacity: document.querySelector("#journeyStyleOutlineOpacity"),
  journeyStyleOutlineOpacityValue: document.querySelector("#journeyStyleOutlineOpacityValue"),
  journeyStyleRouteLabelVisibility: document.querySelector("#journeyStyleRouteLabelVisibility"),
  journeyStyleRouteLabelContent: document.querySelector("#journeyStyleRouteLabelContent"),
  journeyUsFeatures: [...document.querySelectorAll("[data-journey-us-feature]")],
  enableMapLibre: document.querySelector("#enableMapLibre"),
  zoneDefaultsFromTrip: document.querySelector("#zoneDefaultsFromTrip"),
  zoneDefaultsFromFile: document.querySelector("#zoneDefaultsFromFile"),
  modifyZonesByDay: document.querySelector("#modifyZonesByDay"),
  dayZoneModifyPanel: document.querySelector("#dayZoneModifyPanel"),
  dayZoneShape: document.querySelector("#dayZoneShape"),
  dayZoneVerticalSize: document.querySelector("#dayZoneVerticalSize"),
  dayZoneVerticalSizeValue: document.querySelector("#dayZoneVerticalSizeValue"),
  dayZoneHorizontalSize: document.querySelector("#dayZoneHorizontalSize"),
  dayZoneHorizontalSizeValue: document.querySelector("#dayZoneHorizontalSizeValue"),
  dayZoneVerticalOffset: document.querySelector("#dayZoneVerticalOffset"),
  dayZoneVerticalOffsetValue: document.querySelector("#dayZoneVerticalOffsetValue"),
  dayZoneHorizontalOffset: document.querySelector("#dayZoneHorizontalOffset"),
  dayZoneHorizontalOffsetValue: document.querySelector("#dayZoneHorizontalOffsetValue"),
  markerShape: document.querySelector("#markerShape"),
  markerSize: document.querySelector("#markerSize"),
  markerSizeValue: document.querySelector("#markerSizeValue"),
  markerFillEnabled: document.querySelector("#markerFillEnabled"),
  markerFillColor: document.querySelector("#markerFillColor"),
  markerStrokeList: document.querySelector("#markerStrokeList"),
  addMarkerStroke: document.querySelector("#addMarkerStroke"),
  markerImageUpload: document.querySelector("#markerImageUpload"),
  markerImageRecent: document.querySelector("#markerImageRecent"),
  markerPreview: document.querySelector("#markerPreview"),
  markerImageDisplay: document.querySelector("#markerImageDisplay"),
  markerImageSize: document.querySelector("#markerImageSize"),
  markerImageSizeValue: document.querySelector("#markerImageSizeValue"),
  markerShapeSize: document.querySelector("#markerShapeSize"),
  markerShapeSizeValue: document.querySelector("#markerShapeSizeValue"),
  markerImageStrokeList: document.querySelector("#markerImageStrokeList"),
  addMarkerImageStroke: document.querySelector("#addMarkerImageStroke"),
  modifyMarkersByDay: document.querySelector("#modifyMarkersByDay"),
  dayMarkerModifyPanel: document.querySelector("#dayMarkerModifyPanel"),
  markerOverrideSize: document.querySelector("#markerOverrideSize"),
  markerOverrideSizeValue: document.querySelector("#markerOverrideSizeValue"),
  animateOverviewRoutes: document.querySelector("#animateOverviewRoutes"),
  overviewRouteAnimationTime: document.querySelector("#overviewRouteAnimationTime"),
  overviewRouteAnimationTimeValue: document.querySelector("#overviewRouteAnimationTimeValue"),
  routeAnimationIconEnabled: document.querySelector("#routeAnimationIconEnabled"),
  routeAnimationIconHideAtTown: document.querySelector("#routeAnimationIconHideAtTown"),
  routeAnimationIconUpload: document.querySelector("#routeAnimationIconUpload"),
  routeAnimationIconRecent: document.querySelector("#routeAnimationIconRecent"),
  exportRouteAnimationIcon: document.querySelector("#exportRouteAnimationIcon"),
  routeAnimationIconPreview: document.querySelector("#routeAnimationIconPreview"),
  routeAnimationIconSize: document.querySelector("#routeAnimationIconSize"),
  routeAnimationIconSizeValue: document.querySelector("#routeAnimationIconSizeValue"),
  maintenanceMapControls: document.querySelector("#maintenanceMapControls"),
  maintenanceRouteIconGrid: document.querySelector("#maintenanceRouteIconGrid"),
  maintenanceRouteIconSize: document.querySelector("#maintenanceRouteIconSize"),
  maintenanceMapZoomControl: document.querySelector("#maintenanceMapZoomControl"),
  maintenanceMapZoom: document.querySelector("#maintenanceMapZoom"),
  routeAnimationIconImageSize: document.querySelector("#routeAnimationIconImageSize"),
  routeAnimationIconImageSizeValue: document.querySelector("#routeAnimationIconImageSizeValue"),
  routeAnimationIconShapeSize: document.querySelector("#routeAnimationIconShapeSize"),
  routeAnimationIconShapeSizeValue: document.querySelector("#routeAnimationIconShapeSizeValue"),
  routeAnimationIconBackgroundEnabled: document.querySelector("#routeAnimationIconBackgroundEnabled"),
  routeAnimationIconBackgroundShape: document.querySelector("#routeAnimationIconBackgroundShape"),
  routeAnimationIconFillEnabled: document.querySelector("#routeAnimationIconFillEnabled"),
  routeAnimationIconFillMode: document.querySelector("#routeAnimationIconFillMode"),
  routeAnimationIconBackgroundFill: document.querySelector("#routeAnimationIconBackgroundFill"),
  routeAnimationIconStrokeList: document.querySelector("#routeAnimationIconStrokeList"),
  addRouteAnimationIconStroke: document.querySelector("#addRouteAnimationIconStroke"),
  routeAnimationIconImageStrokeList: document.querySelector("#routeAnimationIconImageStrokeList"),
  addRouteAnimationIconImageStroke: document.querySelector("#addRouteAnimationIconImageStroke"),
  tripAnimationSeparateIcon: document.querySelector("#tripAnimationSeparateIcon"),
  tripAnimationIconPreview: document.querySelector("#tripAnimationIconPreview"),
  tripAnimationIconControls: document.querySelector("#tripAnimationIconControls"),
  tripAnimationIconRecent: document.querySelector("#tripAnimationIconRecent"),
  tripAnimationIconSize: document.querySelector("#tripAnimationIconSize"),
  tripAnimationIconSizeValue: document.querySelector("#tripAnimationIconSizeValue"),
  stickerDefaultVisibility: document.querySelector("#stickerDefaultVisibility"),
  stickerDefaultSize: document.querySelector("#stickerDefaultSize"),
  stickerDefaultSizeValue: document.querySelector("#stickerDefaultSizeValue"),
  stickerUpload: document.querySelector("#stickerUpload"),
  stickerCustomText: document.querySelector("#stickerCustomText"),
  stickerCustomColor: document.querySelector("#stickerCustomColor"),
  createTextSticker: document.querySelector("#createTextSticker"),
  stickerLibrary: document.querySelector("#stickerLibrary"),
  stickerLibraryTabs: document.querySelector("#stickerLibraryTabs"),
  pinLibraryControls: document.querySelector("#pinLibraryControls"),
  pinLibraryColor: document.querySelector("#pinLibraryColor"),
  pinLibraryRecentColors: document.querySelector("#pinLibraryRecentColors"),
  stickerLibraryView: document.querySelector("#stickerLibraryView"),
  stickerSelectionControls: document.querySelector("#stickerSelectionControls"),
  routeTimeline: document.querySelector("#routeTimeline"),
  timelinePlayBackward: document.querySelector("#timelinePlayBackward"),
  timelineStepBackward: document.querySelector("#timelineStepBackward"),
  timelinePause: document.querySelector("#timelinePause"),
  timelineStepForward: document.querySelector("#timelineStepForward"),
  timelinePlayForward: document.querySelector("#timelinePlayForward"),
  timelineLoop: document.querySelector("#timelineLoop"),
  timelinePlaybackSpeed: document.querySelector("#timelinePlaybackSpeed"),
  selectionTypeStickers: document.querySelector("#selectionTypeStickers"),
  selectionTypeLandmarks: document.querySelector("#selectionTypeLandmarks"),
  selectionTypeMarkers: document.querySelector("#selectionTypeMarkers"),
  selectionTypeRouteIcon: document.querySelector("#selectionTypeRouteIcon"),
  selectionSelectAll: document.querySelector("#selectionSelectAll"),
  selectionSelectNone: document.querySelector("#selectionSelectNone"),
  selectionSelectByType: document.querySelector("#selectionSelectByType"),
  selectionGroup: document.querySelector("#selectionGroup"),
  selectionUngroup: document.querySelector("#selectionUngroup"),
  selectionCount: document.querySelector("#selectionCount"),
  selectionShortcutDock: document.querySelector("#selectionShortcutDock"),
  routeTimelineTitle: document.querySelector("#routeTimelineTitle"),
  routeTimelineNote: document.querySelector("#routeTimelineNote"),
  stopTimelineEndActionRow: document.querySelector("#stopTimelineEndActionRow"),
  stopTimelineEndAction: document.querySelector("#stopTimelineEndAction"),
  timelineDefaultEndActionRow: document.querySelector("#timelineDefaultEndActionRow"),
  timelineDefaultEndAction: document.querySelector("#timelineDefaultEndAction"),
  routeTimelineTrackHeight: document.querySelector("#routeTimelineTrackHeight"),
  routeTimelineTrackHeightValue: document.querySelector("#routeTimelineTrackHeightValue"),
  stickerAnimationTarget: document.querySelector("#stickerAnimationTarget"),
  stickerAnimationPreview: document.querySelector("#stickerAnimationPreview"),
  stickerAnimationPreset: document.querySelector("#stickerAnimationPreset"),
  stickerAnimationDuration: document.querySelector("#stickerAnimationDuration"),
  stickerAnimationDurationValue: document.querySelector("#stickerAnimationDurationValue"),
  stickerAnimationOpacity: document.querySelector("#stickerAnimationOpacity"),
  stickerAnimationOpacityValue: document.querySelector("#stickerAnimationOpacityValue"),
  stickerAnimationScale: document.querySelector("#stickerAnimationScale"),
  stickerAnimationScaleValue: document.querySelector("#stickerAnimationScaleValue"),
  stickerAnimationSplitScale: document.querySelector("#stickerAnimationSplitScale"),
  stickerAnimationScaleY: document.querySelector("#stickerAnimationScaleY"),
  stickerAnimationScaleYRow: document.querySelector("#stickerAnimationScaleYRow"),
  stickerAnimationScaleXText: document.querySelector("#stickerAnimationScaleXText"),
  stickerAnimationScaleYText: document.querySelector("#stickerAnimationScaleYText"),
  stickerAnimationUniformScale: document.querySelector("#stickerAnimationUniformScale"),
  stickerAnimationRotation: document.querySelector("#stickerAnimationRotation"),
  stickerAnimationRotationValue: document.querySelector("#stickerAnimationRotationValue"),
  stickerAnimationPositionX: document.querySelector("#stickerAnimationPositionX"),
  stickerAnimationPositionY: document.querySelector("#stickerAnimationPositionY"),
  stickerAnimationPositionXValue: document.querySelector("#stickerAnimationPositionXValue"),
  stickerAnimationPositionYValue: document.querySelector("#stickerAnimationPositionYValue"),
  stickerAnimationSplitPosition: document.querySelector("#stickerAnimationSplitPosition"),
  stickerAnimationPositionXLabel: document.querySelector("#stickerAnimationPositionXLabel"),
  stickerAnimationPositionXText: document.querySelector("#stickerAnimationPositionXText"),
  stickerAnimationPositionYText: document.querySelector("#stickerAnimationPositionYText"),
  stickerAnimationPlayhead: document.querySelector("#stickerAnimationPlayhead"),
  stickerAnimationPlayheadValue: document.querySelector("#stickerAnimationPlayheadValue"),
  stickerAnimationFrame: document.querySelector("#stickerAnimationFrame"),
  stickerAnimationFrameCount: document.querySelector("#stickerAnimationFrameCount"),
  copyStickerKeyframes: document.querySelector("#copyStickerKeyframes"),
  pasteStickerKeyframes: document.querySelector("#pasteStickerKeyframes"),
  stickerAnimationPlayBackward: document.querySelector("#stickerAnimationPlayBackward"),
  stickerAnimationStepBackward: document.querySelector("#stickerAnimationStepBackward"),
  stickerAnimationStepForward: document.querySelector("#stickerAnimationStepForward"),
  stickerAnimationPlayForward: document.querySelector("#stickerAnimationPlayForward"),
  stickerAnimationLoop: document.querySelector("#stickerAnimationLoop"),
  stickerAnimationLoopMode: document.querySelector("#stickerAnimationLoopMode"),
  stickerAnimationLoopDelay: document.querySelector("#stickerAnimationLoopDelay"),
  stickerAnimationLoopDelayValue: document.querySelector("#stickerAnimationLoopDelayValue"),
  annotationType: document.querySelector("#annotationType"),
  annotationColor: document.querySelector("#annotationColor"),
  annotationWeight: document.querySelector("#annotationWeight"),
  annotationWeightValue: document.querySelector("#annotationWeightValue"),
  beginAnnotation: document.querySelector("#beginAnnotation"),
  finishAnnotation: document.querySelector("#finishAnnotation"),
  clearAnnotations: document.querySelector("#clearAnnotations"),
  drawStickerPath: document.querySelector("#drawStickerPath"),
  finishStickerPath: document.querySelector("#finishStickerPath"),
  clearStickerPath: document.querySelector("#clearStickerPath"),
  snapStickerPathToRoute: document.querySelector("#snapStickerPathToRoute"),
  stickerKeyframeEditor: document.querySelector("#stickerKeyframeEditor"),
  stickerKeyframeEasing: document.querySelector("#stickerKeyframeEasing"),
  stickerKeyframeIntensity: document.querySelector("#stickerKeyframeIntensity"),
  stickerKeyframeIntensityValue: document.querySelector("#stickerKeyframeIntensityValue"),
  stickerPositionPathModeRow: document.querySelector("#stickerPositionPathModeRow"),
  stickerPositionPathMode: document.querySelector("#stickerPositionPathMode"),
  stickerPositionPathFrequencyRow: document.querySelector("#stickerPositionPathFrequencyRow"),
  stickerPositionPathFrequency: document.querySelector("#stickerPositionPathFrequency"),
  stickerPositionPathFrequencyValue: document.querySelector("#stickerPositionPathFrequencyValue"),
  deleteStickerKeyframe: document.querySelector("#deleteStickerKeyframe"),
  stickerKeyframeTracks: document.querySelector("#stickerKeyframeTracks"),
  saveStickerAnimationPreset: document.querySelector("#saveStickerAnimationPreset"),
  applyStickerAnimationToMatching: document.querySelector("#applyStickerAnimationToMatching"),
  selectedStickerName: document.querySelector("#selectedStickerName"),
  selectedStickerVisibility: document.querySelector("#selectedStickerVisibility"),
  selectedStickerSize: document.querySelector("#selectedStickerSize"),
  selectedStickerSizeValue: document.querySelector("#selectedStickerSizeValue"),
  selectedStickerAllZooms: document.querySelector("#selectedStickerAllZooms"),
  deleteSelectedSticker: document.querySelector("#deleteSelectedSticker"),
  toggleStreet: document.querySelector("#toggleStreet"),
  toggleFaintStreet: document.querySelector("#toggleFaintStreet"),
  toggleTopo: document.querySelector("#toggleTopo"),
  toggleFaintTopo: document.querySelector("#toggleFaintTopo"),
  toggleStates: document.querySelector("#toggleStates"),
  toggleFaintStates: document.querySelector("#toggleFaintStates"),
  toggleCountryBorders: document.querySelector("#toggleCountryBorders"),
  toggleParks: document.querySelector("#toggleParks"),
  toggleBuildings: document.querySelector("#toggleBuildings"),
  toggleHighways: document.querySelector("#toggleHighways"),
  toggleRailroads: document.querySelector("#toggleRailroads"),
  colorVisitedStates: document.querySelector("#colorVisitedStates"),
  toggleSmallTowns: document.querySelector("#toggleSmallTowns"),
  toggleCities: document.querySelector("#toggleCities"),
  toggleCapitals: document.querySelector("#toggleCapitals"),
  togglePois: document.querySelector("#togglePois"),
  toggleRoute: document.querySelector("#toggleRoute"),
  toggleFaintRoute: document.querySelector("#toggleFaintRoute"),
  toggleMarkers: document.querySelector("#toggleMarkers"),
  toggleDayZoneFill: document.querySelector("#toggleDayZoneFill"),
  toggleDayZoneStroke: document.querySelector("#toggleDayZoneStroke"),
  toggleLand: document.querySelector("#toggleLand"),
  toggleWater: document.querySelector("#toggleWater"),
  toggleDeserts: document.querySelector("#toggleDeserts"),
  toggleTexture: document.querySelector("#toggleTexture"),
  textureScaleWithMap: document.querySelector("#textureScaleWithMap"),
  textureScaleModeLabel: document.querySelector("#textureScaleModeLabel"),
  currentRouteThemeName: document.querySelector("#currentRouteThemeName"),
  openRouteThemePicker: document.querySelector("#openRouteThemePicker"),
  topThemeButton: document.querySelector("#topThemeButton"),
  updateCurrentTheme: document.querySelector("#updateCurrentTheme"),
  saveCurrentThemeQuick: document.querySelector("#saveCurrentThemeQuick"),
  closeRouteThemePicker: document.querySelector("#closeRouteThemePicker"),
  cancelRouteThemePicker: document.querySelector("#cancelRouteThemePicker"),
  elementsStyleDrawer: document.querySelector("#elementsStyleDrawer"),
  routeThemeGrid: document.querySelector("#routeThemeGrid"),
  themePresetGrid: document.querySelector("#themePresetGrid"),
  themePresetView: document.querySelector("#themePresetView"),
  themePresetDefaultSelect: document.querySelector("#themePresetDefaultSelect"),
  saveThemePreset: document.querySelector("#saveThemePreset"),
  themePresetDialog: document.querySelector("#themePresetDialog"),
  themePresetDialogTitle: document.querySelector("#themePresetDialogTitle"),
  themePresetName: document.querySelector("#themePresetName"),
  themePresetCategories: document.querySelector("#themePresetCategories"),
  themePresetSummary: document.querySelector("#themePresetSummary"),
  themePresetDelete: document.querySelector("#themePresetDelete"),
  themePresetCancel: document.querySelector("#themePresetCancel"),
  themePresetSave: document.querySelector("#themePresetSave"),
  themePresetApply: document.querySelector("#themePresetApply"),
  elementsRouteSelect: document.querySelector("#elementsRouteSelect"),
  journeyViewAll: document.querySelector("#journeyViewAll"),
  saveRouteTheme: document.querySelector("#saveRouteTheme"),
  toggleAllOn: document.querySelector("#toggleAllOn"),
  toggleAllOff: document.querySelector("#toggleAllOff"),
  presetSelect: document.querySelector("#presetSelect"),
  savePreset: document.querySelector("#savePreset"),
  stylePresetSelect: document.querySelector("#stylePresetSelect"),
  saveStylePreset: document.querySelector("#saveStylePreset"),
  exportStyles: document.querySelector("#exportStyles"),
  saveStylesToProject: document.querySelector("#saveStylesToProject"),
  importStyles: document.querySelector("#importStyles"),
  saveAllSettings: document.querySelector("#saveAllSettings"),
  exportUiSettings: document.querySelector("#exportUiSettings"),
  saveUiSettingsToProject: document.querySelector("#saveUiSettingsToProject"),
  importUiSettings: document.querySelector("#importUiSettings"),
  topTripSelect: document.querySelector("#topTripSelect"),
  newTopTripName: document.querySelector("#newTopTripName"),
  addTopTrip: document.querySelector("#addTopTrip"),
  deleteTopTrip: document.querySelector("#deleteTopTrip"),
  tripSelect: document.querySelector("#tripSelect"),
  tripTierRenameInput: document.querySelector("#tripTierRenameInput"),
  tripTierEditName: document.querySelector("#tripTierEditName"),
  tripRenameInput: document.querySelector("#tripRenameInput"),
  routeDaySelect: document.querySelector("#routeDaySelect"),
  stopDaySelect: document.querySelector("#stopDaySelect"),
  followStopDaySequence: document.querySelector("#followStopDaySequence"),
  pinnedRouteSelect: document.querySelector("#pinnedRouteSelect"),
  stopArrivalDate: document.querySelector("#stopArrivalDate"),
  stopDepartureDate: document.querySelector("#stopDepartureDate"),
  stopCalendarButton: document.querySelector("#stopCalendarButton"),
  stopCalendarPopover: document.querySelector("#stopCalendarPopover"),
  stopCalendarPrevious: document.querySelector("#stopCalendarPrevious"),
  stopCalendarNext: document.querySelector("#stopCalendarNext"),
  stopCalendarMonth: document.querySelector("#stopCalendarMonth"),
  stopCalendarGrid: document.querySelector("#stopCalendarGrid"),
  stopCalendarHint: document.querySelector("#stopCalendarHint"),
  stopDateMessage: document.querySelector("#stopDateMessage"),
  stopDatesToggle: document.querySelector("#stopDatesToggle"),
  stopStatsToggle: document.querySelector("#stopStatsToggle"),
  stopDatesSubsection: document.querySelector("#stopDatesSubsection"),
  stopStatsSubsection: document.querySelector("#stopStatsSubsection"),
  showEndpointGps: document.querySelector("#showEndpointGps"),
  dayRenameFields: document.querySelector("#dayRenameFields"),
  dayRenameNameInput: document.querySelector("#dayRenameNameInput"),
  dayRenameStartInput: document.querySelector("#dayRenameStartInput"),
  dayRenameEndInput: document.querySelector("#dayRenameEndInput"),
  dayRenameIndependentStartName: document.querySelector("#dayRenameIndependentStartName"),
  renameDayButton: document.querySelector("#renameDayButton"),
  newTripName: document.querySelector("#newTripName"),
  addTrip: document.querySelector("#addTrip"),
  exportTrips: document.querySelector("#exportTrips"),
  saveJourneysToProject: document.querySelector("#saveJourneysToProject"),
  importTrips: document.querySelector("#importTrips"),
  tripExportDialog: document.querySelector("#tripExportDialog"),
  tripExportList: document.querySelector("#tripExportList"),
  tripExportAll: document.querySelector("#tripExportAll"),
  tripExportCancel: document.querySelector("#tripExportCancel"),
  tripExportOkay: document.querySelector("#tripExportOkay"),
  routeImportDialog: document.querySelector("#routeImportDialog"),
  routeImportPosition: document.querySelector("#routeImportPosition"),
  routeImportSequenceNumber: document.querySelector("#routeImportSequenceNumber"),
  routeImportSequenceDate: document.querySelector("#routeImportSequenceDate"),
  routeImportSummary: document.querySelector("#routeImportSummary"),
  routeImportCancel: document.querySelector("#routeImportCancel"),
  routeImportApply: document.querySelector("#routeImportApply"),
  restoreTripsBackup: document.querySelector("#restoreTripsBackup"),
  deleteTrip: document.querySelector("#deleteTrip"),
  newDayLabel: document.querySelector("#newDayLabel"),
  newDaySequence: document.querySelector("#newDaySequence"),
  dayNamePattern: document.querySelector("#dayNamePattern"),
  dayNamePatternTooltip: document.querySelector("#dayNamePatternTooltip"),
  dayNamePatternExample: document.querySelector("#dayNamePatternExample"),
  newDayRestDay: document.querySelector("#newDayRestDay"),
  newDayIndependentStartRow: document.querySelector("#newDayIndependentStartRow"),
  newDayIndependentStart: document.querySelector("#newDayIndependentStart"),
  routeStartAddressRow: document.querySelector("#routeStartAddressRow"),
  routeStartAddressLabel: document.querySelector("#routeStartAddressLabel"),
  routeStartAddress: document.querySelector("#routeStartAddress"),
  routeEndAddress: document.querySelector("#routeEndAddress"),
  createAddressRoute: document.querySelector("#createAddressRoute"),
  tripRouteInput: document.querySelector("#tripRouteInput"),
  tripDayList: document.querySelector("#tripDayList"),
  tripDayListMode: document.querySelector("#tripDayListMode"),
  tripRouteDropdown: document.querySelector("#tripRouteDropdown"),
  routeWaypointManager: document.querySelector("#routeWaypointManager"),
  routeWaypointList: document.querySelector("#routeWaypointList"),
  tripStopList: document.querySelector("#tripStopList"),
  tripStopListMode: document.querySelector("#tripStopListMode"),
  tripStopDropdown: document.querySelector("#tripStopDropdown"),
  deleteSelectedStop: document.querySelector("#deleteSelectedStop"),
  deleteJourneyMode: document.querySelector("#deleteJourneyMode"),
  stopAnimationsMount: document.querySelector("#stopAnimationsMount"),
  tripStopDayList: document.querySelector("#tripStopDayList"),
  editDayLabel: document.querySelector("#editDayLabel"),
  editDaySequenceNumber: document.querySelector("#editDaySequenceNumber"),
  editDaySequenceDate: document.querySelector("#editDaySequenceDate"),
  editStopStartDate: document.querySelector("#editStopStartDate"),
  editStopEndDate: document.querySelector("#editStopEndDate"),
  editStopCalendarButton: document.querySelector("#editStopCalendarButton"),
  editStopCalendarPopover: document.querySelector("#editStopCalendarPopover"),
  editStopCalendarPrevious: document.querySelector("#editStopCalendarPrevious"),
  editStopCalendarNext: document.querySelector("#editStopCalendarNext"),
  editStopCalendarMonth: document.querySelector("#editStopCalendarMonth"),
  editStopCalendarGrid: document.querySelector("#editStopCalendarGrid"),
  editStopCalendarHint: document.querySelector("#editStopCalendarHint"),
  editStopDateMessage: document.querySelector("#editStopDateMessage"),
  editDaySummary: document.querySelector("#editDaySummary"),
  showRouteWaypoints: document.querySelector("#showRouteWaypoints"),
  editDayRestDay: document.querySelector("#editDayRestDay"),
  saveDayDetails: document.querySelector("#saveDayDetails"),
  editDayRoute: document.querySelector("#editDayRoute"),
  dayRouteEditor: document.querySelector("#dayRouteEditor"),
  editDayIndependentStartRow: document.querySelector("#editDayIndependentStartRow"),
  editDayIndependentStart: document.querySelector("#editDayIndependentStart"),
  editDayStartAddressRow: document.querySelector("#editDayStartAddressRow"),
  editDayStartAddressLabel: document.querySelector("#editDayStartAddressLabel"),
  editDayStartAddress: document.querySelector("#editDayStartAddress"),
  editDayEndAddress: document.querySelector("#editDayEndAddress"),
  cancelDayRouteEdit: document.querySelector("#cancelDayRouteEdit"),
  applyDayRouteEdit: document.querySelector("#applyDayRouteEdit"),
  deleteDay: document.querySelector("#deleteDay"),
  tripMediaInput: document.querySelector("#tripMediaInput"),
  tripMediaTarget: document.querySelector("#tripMediaTarget"),
  tripMediaNumberingStyle: document.querySelector("#tripMediaNumberingStyle"),
  tripYouTubeUrl: document.querySelector("#tripYouTubeUrl"),
  addTripYouTube: document.querySelector("#addTripYouTube"),
  tripBlogTitle: document.querySelector("#tripBlogTitle"),
  tripBlogText: document.querySelector("#tripBlogText"),
  addTripBlog: document.querySelector("#addTripBlog"),
  updateTripBlog: document.querySelector("#updateTripBlog"),
  manualMediaOrder: document.querySelector("#manualMediaOrder"),
  tripMediaList: document.querySelector("#tripMediaList"),
  tripMediaLocation: document.querySelector("#tripMediaLocation"),
  tripMediaLocationTitle: document.querySelector("#tripMediaLocationTitle"),
  tripMediaPinType: document.querySelector("#tripMediaPinType"),
  tripMediaPinColor: document.querySelector("#tripMediaPinColor"),
  tripMediaPinStyle: document.querySelector("#tripMediaPinStyle"),
  tripMediaThumbnailPreview: document.querySelector("#tripMediaThumbnailPreview"),
  tripMediaThumbnailName: document.querySelector("#tripMediaThumbnailName"),
  tripMediaThumbnailUpload: document.querySelector("#tripMediaThumbnailUpload"),
  tripMediaThumbnailReset: document.querySelector("#tripMediaThumbnailReset"),
  tripMediaSavedAddress: document.querySelector("#tripMediaSavedAddress"),
  tripMediaAddress: document.querySelector("#tripMediaAddress"),
  placeTripMediaAddress: document.querySelector("#placeTripMediaAddress"),
  placeTripMediaMap: document.querySelector("#placeTripMediaMap"),
  snapTripMediaStart: document.querySelector("#snapTripMediaStart"),
  snapTripMediaEnd: document.querySelector("#snapTripMediaEnd"),
  tripMediaLocationStatus: document.querySelector("#tripMediaLocationStatus"),
  tripMediaPreview: document.querySelector("#tripMediaPreview"),
  landmarksEnabled: document.querySelector("#landmarksEnabled"),
  landmarkImageDisplay: document.querySelector("#landmarkImageDisplay"),
  landmarkGlobalSize: document.querySelector("#landmarkGlobalSize"),
  landmarkGlobalSizeValue: document.querySelector("#landmarkGlobalSizeValue"),
  defaultLandmarkTile: document.querySelector("#defaultLandmarkTile"),
  landmarkGrid: document.querySelector("#landmarkGrid"),
  landmarkUploadInput: document.querySelector("#landmarkUploadInput"),
  chooseLandmarkImage: document.querySelector("#chooseLandmarkImage"),
  landmarkImageDialog: document.querySelector("#landmarkImageDialog"),
  landmarkImageDialogClose: document.querySelector("#landmarkImageDialogClose"),
  landmarkImageUpload: document.querySelector("#landmarkImageUpload"),
  landmarkCatalogForm: document.querySelector("#landmarkCatalogForm"),
  landmarkCatalogSearch: document.querySelector("#landmarkCatalogSearch"),
  landmarkCatalogStatus: document.querySelector("#landmarkCatalogStatus"),
  landmarkCatalogResults: document.querySelector("#landmarkCatalogResults"),
  landmarkPreview: document.querySelector("#landmarkPreview"),
  journeyLandmarkPanel: document.querySelector("#journeyLandmarkPanel"),
  journeyDefaultLandmark: document.querySelector("#journeyDefaultLandmark"),
  journeyDefaultLandmarkPreview: document.querySelector("#journeyDefaultLandmarkPreview"),
  journeyCurrentLandmark: document.querySelector("#journeyCurrentLandmark"),
  journeyCurrentLandmarkPreview: document.querySelector("#journeyCurrentLandmarkPreview"),
  journeyCurrentLandmarkName: document.querySelector("#journeyCurrentLandmarkName"),
  landmarkSize: document.querySelector("#landmarkSize"),
  landmarkSizeValue: document.querySelector("#landmarkSizeValue"),
  landmarkImageSize: document.querySelector("#landmarkImageSize"),
  landmarkImageSizeValue: document.querySelector("#landmarkImageSizeValue"),
  landmarkShapeSize: document.querySelector("#landmarkShapeSize"),
  landmarkShapeSizeValue: document.querySelector("#landmarkShapeSizeValue"),
  landmarkShapeEnabled: document.querySelector("#landmarkShapeEnabled"),
  landmarkShape: document.querySelector("#landmarkShape"),
  landmarkFillColor: document.querySelector("#landmarkFillColor"),
  landmarkFillMode: document.querySelector("#landmarkFillMode"),
  landmarkImageStrokeList: document.querySelector("#landmarkImageStrokeList"),
  landmarkStrokeList: document.querySelector("#landmarkStrokeList"),
  addLandmarkImageStroke: document.querySelector("#addLandmarkImageStroke"),
  addLandmarkStroke: document.querySelector("#addLandmarkStroke"),
  landmarkSettingsScope: document.querySelector("#landmarkSettingsScope"),
  saveLandmarkDefault: document.querySelector("#saveLandmarkDefault"),
  applyLandmarkDefault: document.querySelector("#applyLandmarkDefault"),
  applyLandmarkDefaultSizing: document.querySelector("#applyLandmarkDefaultSizing"),
  landmarkDefaultDialog: document.querySelector("#landmarkDefaultDialog"),
  landmarkDefaultSelectAll: document.querySelector("#landmarkDefaultSelectAll"),
  landmarkDefaultSelectNone: document.querySelector("#landmarkDefaultSelectNone"),
  landmarkDefaultTargetAll: document.querySelector("#landmarkDefaultTargetAll"),
  landmarkDefaultTargetNone: document.querySelector("#landmarkDefaultTargetNone"),
  landmarkDefaultTargets: document.querySelector("#landmarkDefaultTargets"),
  landmarkDefaultCancel: document.querySelector("#landmarkDefaultCancel"),
  landmarkDefaultApply: document.querySelector("#landmarkDefaultApply"),
  saveAllDialog: document.querySelector("#saveAllDialog"),
  saveAllSelectAll: document.querySelector("#saveAllSelectAll"),
  saveAllSelectNone: document.querySelector("#saveAllSelectNone"),
  saveAllCancel: document.querySelector("#saveAllCancel"),
  saveAllOkay: document.querySelector("#saveAllOkay"),
  projectExportStatus: document.querySelector("#projectExportStatus"),
  projectExportSummary: document.querySelector("#projectExportSummary"),
  projectSyncStatus: document.querySelector("#projectSyncStatus"),
  exportAllSettings: document.querySelector("#exportAllSettings"),
  publishSite: document.querySelector("#publishSite"),
  publishDialog: document.querySelector("#publishDialog"),
  publishMethod: document.querySelector("#publishMethod"),
  publishSiteUrl: document.querySelector("#publishSiteUrl"),
  publishRepository: document.querySelector("#publishRepository"),
  publishBranch: document.querySelector("#publishBranch"),
  publishMethodNote: document.querySelector("#publishMethodNote"),
  publishCancel: document.querySelector("#publishCancel"),
  publishSaveConfiguration: document.querySelector("#publishSaveConfiguration"),
  useDefaultLandmarkForAll: document.querySelector("#useDefaultLandmarkForAll"),
  landmarkPerStopShapes: document.querySelector("#landmarkPerStopShapes"),
  landmarkShapeStop: document.querySelector("#landmarkShapeStop"),
  landmarkStopShape: document.querySelector("#landmarkStopShape"),
  tripStatus: document.querySelector("#tripStatus"),
  fontStyleTarget: document.querySelector("#fontStyleTarget"),
  fontStylePreview: document.querySelector("#fontStylePreview"),
  fontStyleColor: document.querySelector("#fontStyleColor"),
  fontStyleTypeface: document.querySelector("#fontStyleTypeface"),
  fontStyleWeight: document.querySelector("#fontStyleWeight"),
  fontStyleItalic: document.querySelector("#fontStyleItalic"),
  fontStyleCase: document.querySelector("#fontStyleCase"),
  fontStyleBackground: document.querySelector("#fontStyleBackground"),
  fontStyleBackgroundColor: document.querySelector("#fontStyleBackgroundColor"),
  fontStyleBackgroundOpacity: document.querySelector("#fontStyleBackgroundOpacity"),
  fontStyleBackgroundOpacityValue: document.querySelector("#fontStyleBackgroundOpacityValue"),
  fontStyleSize: document.querySelector("#fontStyleSize"),
  fontStyleSizeValue: document.querySelector("#fontStyleSizeValue"),
  fontStyleThickness: document.querySelector("#fontStyleThickness"),
  fontStyleThicknessValue: document.querySelector("#fontStyleThicknessValue"),
  fontStyleStretch: document.querySelector("#fontStyleStretch"),
  fontStyleStretchValue: document.querySelector("#fontStyleStretchValue"),
  fontStyleScaleY: document.querySelector("#fontStyleScaleY"),
  fontStyleScaleYValue: document.querySelector("#fontStyleScaleYValue"),
  fontStyleKerning: document.querySelector("#fontStyleKerning"),
  fontStyleKerningValue: document.querySelector("#fontStyleKerningValue"),
  fontStyleSpacing: document.querySelector("#fontStyleSpacing"),
  fontStyleSpacingValue: document.querySelector("#fontStyleSpacingValue"),
  stylePanel: document.querySelector("#stylePanel"),
  styleLayerSelect: document.querySelector("#styleLayerSelect"),
  styleSizeSection: document.querySelector("#styleSizeSection"),
  styleBlendRow: document.querySelector("#styleBlendRow"),
  styleSizeLabel: document.querySelector("#styleSizeLabel"),
  styleTextSection: document.querySelector("#styleTextSection"),
  styleTypeface: document.querySelector("#styleTypeface"),
  styleFontWeight: document.querySelector("#styleFontWeight"),
  styleAppearanceSection: document.querySelector("#styleAppearanceSection"),
  styleOpacity: document.querySelector("#styleOpacity"),
  styleBlend: document.querySelector("#styleBlend"),
  stylePreview: document.querySelector("#stylePreview"),
  styleColorWarning: document.querySelector("#styleColorWarning"),
  styleColorWarningText: document.querySelector("#styleColorWarningText"),
  styleColorField: document.querySelector("#styleColorField"),
  styleRed: document.querySelector("#styleRed"),
  styleGreen: document.querySelector("#styleGreen"),
  styleBlue: document.querySelector("#styleBlue"),
  styleHex: document.querySelector("#styleHex"),
  styleRecentSwatches: document.querySelector("#styleRecentSwatches"),
  styleSwatches: document.querySelector("#styleSwatches"),
  styleSavedSwatches: document.querySelector("#styleSavedSwatches"),
  styleSavedColorCount: document.querySelector("#styleSavedColorCount"),
  styleSize: document.querySelector("#styleSize"),
  styleTextureSection: document.querySelector("#styleTextureSection"),
  styleTextureEnabled: document.querySelector("#styleTextureEnabled"),
  styleTextureMapLibreNote: document.querySelector("#styleTextureMapLibreNote"),
  styleSecondaryTextureSection: document.querySelector("#styleSecondaryTextureSection"),
  styleTextureType: document.querySelector("#styleTextureType"),
  styleTextureSize: document.querySelector("#styleTextureSize"),
  styleTextureOpacity: document.querySelector("#styleTextureOpacity"),
  styleTextureBlend: document.querySelector("#styleTextureBlend"),
  styleTextureBlendEnabled: document.querySelector("#styleTextureBlendEnabled"),
  styleTextureBlendAmount: document.querySelector("#styleTextureBlendAmount"),
  topographyColorSection: document.querySelector("#topographyColorSection"),
  topographyMapLibreNote: document.querySelector("#topographyMapLibreNote"),
  styleTopoLowColor: document.querySelector("#styleTopoLowColor"),
  styleTopoHighColor: document.querySelector("#styleTopoHighColor"),
  styleLineSection: document.querySelector("#styleLineSection"),
  styleZoneSectionTitle: document.querySelector("#styleZoneSectionTitle"),
  styleDashLockRow: document.querySelector("#styleDashLockRow"),
  styleDashLengthRow: document.querySelector("#styleDashLengthRow"),
  styleDashGapRow: document.querySelector("#styleDashGapRow"),
  styleLockDashPattern: document.querySelector("#styleLockDashPattern"),
  styleDashLength: document.querySelector("#styleDashLength"),
  styleDashGap: document.querySelector("#styleDashGap"),
  styleTextureChoices: document.querySelector("#styleTextureChoices"),
  styleSecondaryTextureChoices: document.querySelector("#styleSecondaryTextureChoices"),
  textureCompatibilityScore: document.querySelector("#textureCompatibilityScore"),
  updateTextureCompatibility: document.querySelector("#updateTextureCompatibility"),
  openTextureLibrary: document.querySelector("#openTextureLibrary"),
  exportTextureManifest: document.querySelector("#exportTextureManifest"),
  musicTrackButton: document.querySelector("#musicTrackButton"),
  musicTrackInput: document.querySelector("#musicTrackInput"),
  musicSection: document.querySelector("#musicSection"),
  musicTripSelect: document.querySelector("#musicTripSelect"),
  musicJourneySelect: document.querySelector("#musicJourneySelect"),
  musicRouteSelect: document.querySelector("#musicRouteSelect"),
  musicStopSelect: document.querySelector("#musicStopSelect"),
  musicDaySelect: document.querySelector("#musicDaySelect"),
  musicAssignmentEditor: document.querySelector("#musicAssignmentEditor"),
  saveTextureManifestToProject: document.querySelector("#saveTextureManifestToProject"),
  exportCombinedTexture: document.querySelector("#exportCombinedTexture"),
  textureLibraryPanel: document.querySelector("#textureLibraryPanel"),
  textureLibrarySearch: document.querySelector("#textureLibrarySearch"),
  textureLibraryCount: document.querySelector("#textureLibraryCount"),
  textureLibraryGrid: document.querySelector("#textureLibraryGrid"),
  closeTextureLibrary: document.querySelector("#closeTextureLibrary"),
  styleSecondaryTextureEnabled: document.querySelector("#styleSecondaryTextureEnabled"),
  styleSecondaryTextureType: document.querySelector("#styleSecondaryTextureType"),
  styleSecondaryTextureSize: document.querySelector("#styleSecondaryTextureSize"),
  styleSecondaryTextureOpacity: document.querySelector("#styleSecondaryTextureOpacity"),
  styleSecondaryTextureBlend: document.querySelector("#styleSecondaryTextureBlend"),
  closeStylePanel: document.querySelector("#closeStylePanel"),
  editUiTheme: document.querySelector("#editUiTheme"),
  uiThemePanel: document.querySelector("#uiThemePanel"),
  closeUiThemePanel: document.querySelector("#closeUiThemePanel"),
  uiThemePanelColor: document.querySelector("#uiThemePanelColor"),
  uiThemeSurfaceColor: document.querySelector("#uiThemeSurfaceColor"),
  uiThemeHighlightColor: document.querySelector("#uiThemeHighlightColor"),
  uiThemeFont: document.querySelector("#uiThemeFont"),
  uiThemeTexture: document.querySelector("#uiThemeTexture"),
  uiThemeTextureOpacity: document.querySelector("#uiThemeTextureOpacity"),
  uiThemeTextureBlend: document.querySelector("#uiThemeTextureBlend")
};


syncSettingSourceAttributes();

window.rvSettingRegistry = {
  getAllSettings,
  getUserSafeSettings,
  getUnsupportedSettings,
  getSettingEntry,
  getSettingValue,
  setSettingValue,
  audit: auditSettingRegistry
};

window.rvUserViewDraft = {
  getDraft: getUserViewDraft,
  serialize: () => serializeUserViewDraft(),
  applyDraft: rawDraft => applyUserViewDraftState(rawDraft),
  resetDraft: () => applyUserViewDraftState(createDefaultUserViewDraft()),
  addPanel: panel => addUserViewPanel(panel),
  removePanel: panel => removeUserViewPanel(panel),
  setPanelEnabled: (panel, enabled) => setUserViewPanelEnabled(panel, enabled),
  addRecordedControls,
  clearRecordedControls,
  addRecordedSessionToStaging: addRecordedControls,
  clearRecordedSession,
  clearUserViewStaging: clearRecordedControls,
  placeSettingInPanel,
  sendPlacedSettingToStaging: returnPlacedControlToRecorded,
  findPlacedSetting,
  getLayout: () => cloneUserViewDraftState(userViewDraft.layout),
  deleteLayoutElement: id => {
    selectUserLayoutElement(id);
    return deleteSelectedUserLayoutElement();
  }
};

window.rvUserBuilderHistory = {
  undo: undoUserBuilderChange,
  redo: redoUserBuilderChange,
  state: () => ({
    undoDepth: userBuilderHistoryState.undoStack.length,
    redoDepth: userBuilderHistoryState.redoStack.length,
    current: serializeUserBuilderHistoryState()
  })
};

function welcomeGateStateSnapshot(message = "") {
  const mapReady = mapElementsProbablyReady();
  const timerReady = welcomeGateTimerReady();
  const secondsRemaining = Math.ceil(welcomeGateTimerRemainingMs() / 1000);
  const detailMessage = message || welcomeGateMapMessage || "Loading roads and map features...";
  let status = "Preparing your route map.";
  let detail = "Map features are ready.";
  if (!timerReady && !mapReady) {
    status = "Waiting on timer and map features.";
    detail = `${secondsRemaining}s remaining. ${detailMessage}`;
  } else if (!timerReady) {
    status = "Waiting on timer.";
    detail = `${secondsRemaining}s remaining. Map features are ready.`;
  } else if (!mapReady) {
    status = "Waiting on map features.";
    detail = detailMessage;
  }
  return {
    timerReady,
    mapReady,
    ready: timerReady && mapReady,
    status,
    detail,
    secondsRemaining,
    progress: clamp((WELCOME_GATE_MIN_VISIBLE_MS - welcomeGateTimerRemainingMs()) / WELCOME_GATE_MIN_VISIBLE_MS, 0, 1)
  };
}

function applyWelcomeGateState(snapshot) {
  if (!els.welcomeGate || welcomeGateDismissed) return;
  const next = snapshot || welcomeGateStateSnapshot();
  els.welcomeGate.classList.toggle("is-ready", next.ready);
  if (els.welcomeGateStatus) els.welcomeGateStatus.textContent = next.status;
  if (els.welcomeGateDetail) els.welcomeGateDetail.textContent = next.detail;
  if (els.welcomeGateProgressFill) {
    els.welcomeGateProgressFill.style.width = `${Math.round(next.progress * 100)}%`;
  }
  // The same two controls become the loading actions after consent. Before
  // completion, skipping is available; afterward, continuing is the only
  // meaningful option.
  if (welcomeGateConsentChosen) {
    if (els.welcomeGateAllow) els.welcomeGateAllow.disabled = !next.ready;
    // "Skip loading" must always be a real escape hatch. A slow or offline
    // basemap must not leave the welcome surface permanently on top of the UI.
    if (els.welcomeGateDecline) els.welcomeGateDecline.disabled = false;
  }
}

function ensureWelcomeGateTimer() {
  if (welcomeGateDismissed || welcomeGateTimer) return;
  welcomeGateTimer = window.setInterval(() => {
    if (welcomeGateDismissed || !els.welcomeGate || els.welcomeGate.hidden) {
      window.clearInterval(welcomeGateTimer);
      welcomeGateTimer = 0;
      return;
    }
    const snapshot = welcomeGateStateSnapshot();
    // Include progress itself so the bar advances smoothly instead of only
    // repainting when the rounded seconds label changes.
    const stateKey = `${snapshot.timerReady}:${snapshot.mapReady}:${Math.round(snapshot.progress * 100)}:${snapshot.detail}`;
    if (stateKey !== welcomeGateLastStateKey) {
      welcomeGateLastStateKey = stateKey;
      applyWelcomeGateState(snapshot);
    }
    if (snapshot.ready) {
      window.clearInterval(welcomeGateTimer);
      welcomeGateTimer = 0;
    }
  }, 250);
}

function setWelcomeGateReady(ready, message = "") {
  if (!els.welcomeGate || welcomeGateDismissed) return;
  welcomeGateMapMessage = message || (ready ? "Map features are ready." : welcomeGateMapMessage);
  applyWelcomeGateState(welcomeGateStateSnapshot(message));
  ensureWelcomeGateTimer();
}

function dismissWelcomeGate() {
  if (!els.welcomeGate) return;
  welcomeGateDismissed = true;
  if (welcomeGateTimer) {
    window.clearInterval(welcomeGateTimer);
    welcomeGateTimer = 0;
  }
  els.welcomeGate.classList.add("is-dismissed");
  window.setTimeout(() => {
    els.welcomeGate.hidden = true;
  }, 950);
}

function rotateWelcomeGateImage() {
  if (!els.welcomeGateImage || welcomeGateDismissed) return;
  const next = nextJumpImageUrl();
  els.welcomeGateImage.classList.add("is-changing");
  window.setTimeout(() => {
    els.welcomeGateImage.src = next;
    els.welcomeGateImage.classList.remove("is-changing");
  }, 220);
}

function refreshWelcomeGateState(message = "") {
  if (BYPASS_WELCOME_AND_MEDIA_GATE) {
    welcomeGateDismissed = true;
    if (welcomeGateTimer) { window.clearInterval(welcomeGateTimer); welcomeGateTimer = 0; }
    if (els.welcomeGate) { els.welcomeGate.classList.add("is-dismissed"); els.welcomeGate.hidden = true; }
    return true;
  }
  if (message) welcomeGateMapMessage = message;
  const snapshot = welcomeGateStateSnapshot(message);
  applyWelcomeGateState(snapshot);
  ensureWelcomeGateTimer();
  return snapshot.ready;
}

function sectionSettingsPayload(section) {
  return {
    version: 1,
    kind: "rv-map-section-settings",
    exportedAt: new Date().toISOString(),
    sectionId: section?.dataset.sectionId || "",
    sectionLabel: section?.querySelector(".section-collapse-title")?.textContent?.trim() || section?.getAttribute("aria-label") || "",
    journeys: getJourneysExportPayload(),
    styles: getStyleExportPayload(),
    ui: getUiSettingsExportPayload()
  };
}

function routeIndexForStopPair(trip, startName, endName) {
  const stops = synchronizeTripStops(trip);
  return stops.findIndex((stop, index) => index < stops.length - 1
    && stop.name === startName && stops[index + 1]?.name === endName);
}

function applyRouteStickerSettingsPayload(payload) {
  const sourceTrip = payload?.journeys?.trips?.find(trip => trip.id === activeTrip()?.id)
    || payload?.journeys?.trips?.find(trip => trip.name === activeTrip()?.name);
  if (!sourceTrip) return false;
  const sourceRouteIndex = Number.isInteger(payload.journeys.activeRouteIndex) ? payload.journeys.activeRouteIndex : 0;
  const sourceStops = sourceTrip.stops || [];
  const targetRouteIndex = routeIndexForStopPair(activeTrip(), sourceStops[sourceRouteIndex]?.name, sourceStops[sourceRouteIndex + 1]?.name);
  if (targetRouteIndex < 0) return false;
  const imported = (sourceTrip.stickers || []).filter(sticker => sticker.scope === "route" && sticker.routeIndex === sourceRouteIndex);
  if (!imported.length) return false;
  const target = activeTrip();
  target.stickers = normalizeTripStickers([
    ...(target.stickers || []).filter(sticker => !(sticker.scope === "route" && sticker.routeIndex === targetRouteIndex)),
    ...imported.map(sticker => ({ ...structuredClone(sticker), scope: "route", routeIndex: targetRouteIndex }))
  ]);
  saveTrips();
  if (state.activeRouteIndex === targetRouteIndex) {
    state.selectionScope = "route";
    renderStickers();
    renderRouteTimeline();
  }
  return true;
}

function applySectionSettingsPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid section settings file.");
  }

  const label = String(payload.sectionLabel || "").toLowerCase();
  if ((label.includes("route timeline") || label.includes("sticker effects")) && applyRouteStickerSettingsPayload(payload)) {
    if (els.status) els.status.textContent = "Imported Edmond, OK → Laverne, OK route sticker timeline.";
    return;
  }

  if (payload.journeys?.trips) {
    applyTripsPayload(payload.journeys);
    saveTrips();
    renderTripManager();
    showInitialJourneyStop();
  }

  if (payload.styles?.styles) {
    applyStyleState(payload.styles.styles);
  }

  if (payload.ui?.uiSettings) {
    applyUiSettingsState(payload.ui);
  }

  renderRoute(false);
  refreshEndpointMarkers();
  renderCityLabels();
  renderRouteAnimationStartIcon();
  updateMapFeatureToolbar();
}

function addSectionExportImportControls(section) {
  if (!section || section.querySelector(":scope > .section-export-actions")) return;

  const actions = document.createElement("div");
  actions.className = "section-export-actions";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export section";
  exportButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    const payload = sectionSettingsPayload(section);
    const sectionLabel = payload.sectionLabel;
    const sectionName = safeDownloadName(sectionLabel || section.dataset.sectionId || "section");
    downloadJson(`${sectionName} settings.json`, payload);
  });

  const importLabel = document.createElement("label");
  importLabel.className = "section-import-button";
  importLabel.innerHTML = `<span>Import section</span>`;

  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("click", event => event.stopPropagation());
  input.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      applySectionSettingsPayload(await readJsonFile(file));
      if (els.status) els.status.textContent = `Imported ${file.name}`;
    } catch (error) {
      console.error("Section settings import failed.", error);
      if (els.status) els.status.textContent = "Section settings import failed.";
    } finally {
      event.target.value = "";
    }
  });

  importLabel.append(input);
  actions.append(exportButton, importLabel);
  section.append(actions);
}

function enhanceCollapsibleSections() {
  restoreFixedPanelSectionOwnership?.();
  applySavedPanelSectionOrder();
  applyWorkflowSectionOrder?.();
  document.querySelectorAll(".panel-tab-panel .panel-section").forEach((section, index) => {
    // The theme picker is an overlay panel, not a rearrangeable/collapsible section.
    if (section.classList.contains("route-theme-section")) return;
    if (section.querySelector(":scope > .section-collapse-button")) {
      section.querySelector(":scope > .section-collapse-button .section-move-controls")?.remove();
      ensurePanelSectionDragHandle(section);
      addSectionExportImportControls(section);
      return;
    }
    panelSectionId(section, index);
    const label = section.querySelector(":scope > .section-label, :scope > .eyebrow");
    const title = label?.textContent?.trim() || section.getAttribute("aria-label");
    if (!title) return;
    label?.remove();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "section-collapse-button";
    // Fresh editor sessions start compact; people can still open any section
    // they need without the panel arriving as a wall of controls.
    section.classList.add("is-collapsed");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = `<span class="section-collapse-arrow" aria-hidden="true">v</span><span>${title}</span>`;
    button.querySelector(".section-collapse-arrow").textContent = ">";
    button.querySelector("span:last-child")?.classList.add("section-collapse-title");
    const moveControls = document.createElement("span");
    moveControls.className = "section-move-controls";
    const moveUp = document.createElement("span");
    moveUp.className = "section-move-button section-move-up";
    moveUp.role = "button";
    moveUp.tabIndex = 0;
    moveUp.textContent = "▲";
    const moveDown = document.createElement("span");
    moveDown.className = "section-move-button section-move-down";
    moveDown.role = "button";
    moveDown.tabIndex = 0;
    moveDown.textContent = "▼";
    [moveUp, moveDown].forEach((control, controlIndex) => {
      const move = event => {
        event.preventDefault();
        event.stopPropagation();
        movePanelSection(section, controlIndex === 0 ? -1 : 1);
      };
      control.addEventListener("click", move);
      control.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") move(event);
      });
    });
    moveControls.append(moveUp, moveDown);
    button.append(moveControls);
    moveControls.remove();
    button.addEventListener("click", () => {
      const collapsed = section.classList.toggle("is-collapsed");
      button.setAttribute("aria-expanded", String(!collapsed));
      button.querySelector(".section-collapse-arrow").textContent = ">";
    });
    button.addEventListener("click", () => {
      const collapsed = section.classList.contains("is-collapsed");
      button.querySelector(".section-collapse-arrow").textContent = ">";
    });
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      toggleUnpinnedSectionGroup(section);
    });
    section.prepend(button);
    ensurePanelSectionDragHandle(section);
    addSectionExportImportControls(section);
  });
  updatePanelSectionChrome();
}

function organizeAdminControlPanels() {
  const moveSection = (selector, panelSelector) => {
    const section = document.querySelector(selector);
    const panel = document.querySelector(panelSelector);
    if (section && panel && section.parentElement !== panel) panel.append(section);
  };

  // Keep content management with Journeys and visual treatments with Themes.
  // The controls retain their IDs, so their existing event handlers stay intact.
  moveSection(".naming-conventions-section", "#panelTrips");
  moveSection(".journey-styles-section", "#panelElements");
  moveSection(".route-controls-section", "#panelElements");
}

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: false,
  zoomSnap: 0.05,
  zoomDelta: 0.5
});
map.attributionControl.setPosition("bottomright");
const selectionLegendControl = L.control({ position: "bottomright" });
selectionLegendControl.onAdd = () => {
  const legend = L.DomUtil.create("aside", "map-selection-legend");
  legend.setAttribute("aria-label", "Object outline legend");
  legend.innerHTML = `
    <strong>Object outlines</strong>
    <div><i class="map-legend-sample map-legend-selected"></i><span>Ungrouped</span></div>
    <div><i class="map-legend-sample map-legend-group"></i><span>Grouped</span></div>
    <div><i class="map-legend-sample map-legend-timeline"></i><span>Current timeline item</span></div>
    <div><i class="map-legend-sample map-legend-null"></i><span>Null (doesn't show)</span></div>`;
  L.DomEvent.disableClickPropagation(legend);
  L.DomEvent.disableScrollPropagation(legend);
  return legend;
};

// Preview surfaces accept a dropped file as if it had been chosen through the
// nearby file picker.  Text files also expose a small, format-neutral draft
// payload for the upcoming media-preset editor.
function bindPreviewFileDrop(target, input = null, { media = false } = {}) {
  if (!target || target.dataset.previewDropBound === "true") return;
  target.dataset.previewDropBound = "true";
  target.addEventListener("dragover", event => { if (event.dataTransfer?.files?.length) { event.preventDefault(); target.classList.add("is-drop-target"); } });
  target.addEventListener("dragleave", () => target.classList.remove("is-drop-target"));
  target.addEventListener("drop", async event => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    event.preventDefault(); target.classList.remove("is-drop-target");
    if (input) {
      const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    let textDraft = null;
    if (media && (/^text\//.test(file.type) || /\.(txt|md|markdown|html?)$/i.test(file.name))) {
      const raw = await file.text();
      const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      textDraft = { title: lines[0] || file.name.replace(/\.[^.]+$/, ""), headings: lines.filter(line => /^#{1,6}\s+/.test(line)).map(line => line.replace(/^#+\s+/, "")), body: lines.filter(line => !/^#{1,6}\s+/.test(line)).join("\n\n") };
    }
    window.dispatchEvent(new CustomEvent("rv:preview-media-drop", { detail: { file, textDraft } }));
  });
}
selectionLegendControl.addTo(map);
const streetVectorOverlay = document.createElement("div");
streetVectorOverlay.id = "streetVectorOverlay";
streetVectorOverlay.className = "street-vector-overlay";
streetVectorOverlay.hidden = true;
const mapLibreBasemap = document.createElement("div");
mapLibreBasemap.id = "mapLibreBasemap";
mapLibreBasemap.className = "maplibre-basemap";
mapLibreBasemap.hidden = true;
const mapThemeOverlay = document.createElement("div");
mapThemeOverlay.className = "map-theme-overlay";
els.mapCanvas.append(mapLibreBasemap);
els.mapCanvas.append(mapThemeOverlay);
const layerTextureOverlays = Object.fromEntries(["land", "water", "texture"].map(key => {
  const overlay = document.createElement("div");
  overlay.className = "map-layer-texture-overlay";
  overlay.dataset.layerTexture = key;
  overlay.style.setProperty("--layer-texture-z", key === "water" ? "211" : key === "land" ? "216" : "352");
  els.mapCanvas.append(overlay);
  return [key, overlay];
}));
const topographyTintOverlay = document.createElement("div");
topographyTintOverlay.className = "topography-tint-overlay";
els.mapCanvas.append(topographyTintOverlay);

map.createPane("topographyPane");
map.createPane("roadBasemapPane");
map.createPane("oceanPane");
map.createPane("landPane");
map.createPane("waterPane");
map.createPane("streetPane");
map.createPane("streetVectorPane");
map.createPane("boundaryPane");
map.createPane("zoneFillPane");
map.createPane("zoneHaloPane");
map.createPane("zoneStrokePane");
map.createPane("faintRoutePane");
map.createPane("activeRoutePane");
map.createPane("routePane");
map.createPane("labelPane");
map.createPane("mediaPane");
const PANE_Z_INDEXES = {
  roadBasemapPane: 205,
  oceanPane: 210,
  landPane: 215,
  waterPane: 225,
  topographyPane: 240,
  streetPane: 300,
  streetVectorPane: 302,
  boundaryPane: 340,
  zoneFillPane: 430,
  zoneHaloPane: 432,
  zoneStrokePane: 435,
  faintRoutePane: 438,
  activeRoutePane: 440,
  routePane: 445,
  labelPane: 560,
  mediaPane: 620
};
Object.entries(PANE_Z_INDEXES).forEach(([paneName, zIndex]) => {
  map.getPane(paneName).style.zIndex = zIndex;
});
map.getPane("streetVectorPane").append(streetVectorOverlay);

const oceanRenderer = L.svg({ pane: "oceanPane", padding: 1 });
const landRenderer = L.svg({ pane: "landPane", padding: 1 });
const waterBodyRenderer = L.svg({ pane: "waterPane", padding: 1 });
const boundaryRenderer = L.svg({ pane: "boundaryPane", padding: 1 });
const zoneFillRenderer = L.svg({ pane: "zoneFillPane", padding: 1 });
const zoneHaloRenderer = L.svg({ pane: "zoneHaloPane", padding: 1 });
const zoneStrokeRenderer = L.svg({ pane: "zoneStrokePane", padding: 1 });
const activeRouteRenderer = L.svg({ pane: "activeRoutePane", padding: 1 });
const faintRouteRenderer = L.svg({ pane: "faintRoutePane", padding: 1 });
const streetRoadRenderer = L.svg({ pane: "streetPane", padding: 1 });
let lockedSelectionZoom = null;
let lockedSelectionBounds = null;
let cameraMoveEndHandler = null;
let cameraTransitionActive = false;
let cameraPreloadId = 0;
const STARTUP_LOADING_MIN_MS = 3000;
const STARTUP_THEME_SEQUENCE_DELAY_MS = 3000;
const STARTUP_THEME_SEQUENCE = Object.freeze(["liberty", "positron", "ember"]);
const DEFAULT_MAPLIBRE_STYLE_ID = "liberty";
const MAP_TRANSITION_LOADING_MIN_MS = 3000;
const startupLoadingStartedAt = Date.now();
let initialRouteViewPending = true;
let initialRouteViewFinished = false;
const JUMP_IMAGE_URLS = [
  "assets/jump images/jump image 00.png",
  "assets/jump images/jump image 01.png",
  "assets/jump images/jump image 02.png",
  "assets/jump images/jump image 03.png",
  "assets/jump images/jump image 04.png"
];
let jumpImageQueue = [];
let lastJumpImageUrl = "";
let loadingOverlayToken = 0;
let mapElementsLoadingDepth = 0;
const locationJumpImageCache = new Map();
let mapTransitionLoadingActive = false;
let mapTransitionLoadingStartedAt = 0;
let overviewRouteAnimationFrame = null;
let overviewRouteIconAnimationFrame = null;
let stadiaLayer = null;
let mapLibreMap = null;
let mapLibreThemeRefreshTimer = null;
let mapLibreOpenMapTileErrors = 0;
let mapLibreStyleLoadStartedAt = 0;
let mapLibreStatusMessage = "";
let streetVectorMap = null;
let streetVectorBaseStyle = null;
let streetVectorBaseStylePromise = null;
let streetVectorBuildId = 0;
let streetVectorStyleSignature = "";
let streetVectorSyncFrame = null;
let streetVectorPendingZoom = null;
let streetVectorReadyPromise = null;
let pmtilesProtocol = null;
let localRoadPackagePromise = null;
let localRoadPackageState = null;
let osmRoadFetchId = 0;
let osmRoadAbortController = null;
let osmRoadRefreshTimer = null;
const osmRoadCache = new Map();
const localRoadGeoJsonCache = new Map();
let osmPlaceFetchId = 0;
let osmPlaceAbortController = null;
let osmPlaceRefreshTimer = null;
let routeRenderFrame = null;
let lastStreetDetailValue = null;
let osmPlaceLabels = [];
let renderedCityLabels = [];
const osmPlaceCache = new Map();
const DEBUG_MAPLIBRE_THEME = false;
let activeRouteThemeId = "watercolor-parchment";
let activeStadiaStyleId = "parchment";
let editingStadiaStyleId = null;
let activeMapLibreStyleId = "liberty";
let editingMapLibreStyleId = null;
let defaultSettingsLoaded = false;
let defaultSettingsLoading = false;
const ENABLE_LOCAL_ROAD_PACKAGES = false;
let baseMapMode = "maplibre";
let mapThemeMode = "custom";
let activeProviderThemeId = null;
let activeTheme = null;
let applyingSharedTheme = false;
let applyingMapLibreSemanticTheme = false;
let loadingMapLibreProviderStyle = false;
let startupThemeSequenceStarted = false;
const mapStartupTiming = {
  startedAt: performance.now(),
  marks: {}
};

function markMapStartup(name, detail = null) {
  const elapsedMs = Math.round(performance.now() - mapStartupTiming.startedAt);
  mapStartupTiming.marks[name] = detail === null ? { elapsedMs } : { elapsedMs, detail };
}

window.rvMapStartupDiagnostics = () => structuredClone({
  ...mapStartupTiming,
  totalElapsedMs: Math.round(performance.now() - mapStartupTiming.startedAt),
  mapLibreLayers: mapLibreLayerIds().length,
  routeCount: state.routes.length,
  routePoints: state.routes.reduce((total, route) => total + (route.displayPoints?.length || route.points?.length || 0), 0)
});
window.rvMapResourceDiagnostics = () => performance.getEntriesByType("resource")
  .map(entry => ({
    name: entry.name,
    durationMs: Math.round(entry.duration),
    transferBytes: entry.transferSize || 0,
    decodedBytes: entry.decodedBodySize || 0,
    type: entry.initiatorType
  }))
  .sort((first, second) => second.durationMs - first.durationMs);
let syncingMapLibreToLeaflet = false;
let syncMapLibreFrame = 0;
let routeStackOrder = "route-on-top";
let selectedTripMediaId = null;
let pendingMediaPinId = null;
let selectedLandmarkStopKey = "default";
let pendingRouteImportRoutes = [];
let pendingRouteImportConversions = [];
let activeViewerMediaElement = null;
let dayRouteEditorOpen = false;
let laverneLoopRepairInProgress = false;
const blogDrafts = new Map();
const landmarkImageUrlCache = new Map();
const landmarkImageHydrationBatches = new WeakMap();
const NEW_BLOG_DRAFT_KEY = "new-blog";
const LAND_BOUNDS = [[-85, -180], [85, 180]];
const STREET_VECTOR_LAYER_PREFIX = "rv-street-vector";
const MAPLIBRE_ROUTE_SOURCE_ID = "rv-route-source";
const MAPLIBRE_ROUTE_LAYER_IDS = [
  "rv-route-marker",
  "rv-route-marker-halo",
  "rv-route-playback",
  "rv-route-active",
  "rv-route-halo",
  "rv-route-faint"
];
const LAND_GEOJSON_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";
const LAKES_GEOJSON_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson";
const RIVERS_GEOJSON_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson";

const OSM_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
const OSM_ROAD_BASEMAP_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>';

const roadBasemapLayer = L.tileLayer(OSM_ROAD_BASEMAP_URL, {
  maxZoom: 20,
  keepBuffer: 6,
  updateWhenZooming: true,
  pane: "roadBasemapPane",
  className: "road-basemap-tiles",
  attribution: OSM_ATTRIBUTION
});

const streetLayer = L.tileLayer(OSM_TILE_URL, {
  maxZoom: 19,
  keepBuffer: 6,
  updateWhenZooming: true,
  opacity: layerStyles.streets.size,
  pane: "streetPane",
  className: "street-line-tiles",
  attribution: OSM_ATTRIBUTION
});

const faintStreetLayer = L.tileLayer(OSM_TILE_URL, {
  maxZoom: 19,
  keepBuffer: 6,
  updateWhenZooming: true,
  opacity: layerStyles.faintStreets.size,
  pane: "streetPane",
  className: "street-line-tiles faint-street-line-tiles",
  attribution: OSM_ATTRIBUTION
});

const osmRoadLayer = L.geoJSON(null, {
  pane: "streetPane",
  renderer: streetRoadRenderer,
  interactive: false,
  style: feature => osmRoadFeatureStyle(feature)
}).addTo(map);

const topoLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", {
  maxNativeZoom: 16,
  maxZoom: 24,
  keepBuffer: 6,
  updateWhenZooming: true,
  opacity: layerStyles.topography.size,
  pane: "topographyPane",
  className: "topography-tiles",
  attribution: "Terrain: Esri, USGS, NOAA"
});

const faintTopoLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", {
  maxNativeZoom: 16,
  maxZoom: 24,
  keepBuffer: 6,
  updateWhenZooming: true,
  opacity: layerStyles.faintTopography.size,
  pane: "topographyPane",
  className: "topography-tiles",
  attribution: "Terrain: Esri, USGS, NOAA"
});

const waterFillLayer = L.rectangle(LAND_BOUNDS, {
  pane: "oceanPane",
  renderer: oceanRenderer,
  stroke: false,
  fillColor: layerFill("water"),
  fillOpacity: layerStyles.water.size,
  interactive: false
}).addTo(map);

const landLayer = L.geoJSON(null, {
  pane: "landPane",
  renderer: landRenderer,
  interactive: false,
  style: () => ({
    stroke: false,
    fillColor: layerFill("land"),
    fillOpacity: layerStyles.land.size
  })
}).addTo(map);

const lakeLayer = L.geoJSON(null, {
  pane: "waterPane",
  renderer: waterBodyRenderer,
  interactive: false,
  style: () => ({
    color: styleColor("water"),
    weight: 0.5,
    opacity: 0.45,
    fillColor: waterBodyFill(),
    fillOpacity: layerStyles.water.size
  })
}).addTo(map);

const riverLayer = L.geoJSON(null, {
  pane: "waterPane",
  renderer: waterBodyRenderer,
  interactive: false,
  style: () => ({
    color: styleColor("water"),
    weight: 1.1,
    opacity: clamp(layerStyles.water.size * 0.82, 0, 1),
    lineCap: "round",
    lineJoin: "round",
    fillOpacity: 0
  })
}).addTo(map);

const waterGroup = L.layerGroup([waterFillLayer, lakeLayer, riverLayer]).addTo(map);

async function loadLandMask() {
  try {
    const response = await fetch(LAND_GEOJSON_URL);
    if (!response.ok) throw new Error("Land mask data could not be loaded.");
    landLayer.addData(await response.json());
    refreshNewElementLayers();
  } catch (error) {
    L.rectangle(LAND_BOUNDS, {
      pane: "landPane",
      renderer: landRenderer,
      stroke: false,
      fillColor: layerFill("land"),
      fillOpacity: layerStyles.land.size,
      interactive: false
    }).addTo(landLayer);
    refreshNewElementLayers();
    els.status.textContent = `${els.status.textContent} Land mask unavailable.`;
  }
}

async function loadWaterFeatures() {
  try {
    const [lakesResponse, riversResponse] = await Promise.all([
      fetch(LAKES_GEOJSON_URL),
      fetch(RIVERS_GEOJSON_URL)
    ]);
    if (!lakesResponse.ok || !riversResponse.ok) {
      throw new Error("Water feature data could not be loaded.");
    }
    lakeLayer.addData(await lakesResponse.json());
    riverLayer.addData(await riversResponse.json());
    refreshNewElementLayers();
  } catch (error) {
    els.status.textContent = `${els.status.textContent} Inland water unavailable.`;
  }
}

function syncNewElementLayerOrder() {
  Object.entries(PANE_Z_INDEXES).forEach(([paneName, zIndex]) => {
    const pane = map.getPane(paneName);
    if (pane) pane.style.zIndex = zIndex;
  });
  if (map.hasLayer(landLayer)) landLayer.bringToBack();
  if (map.hasLayer(waterFillLayer)) waterFillLayer.bringToBack();
  if (map.hasLayer(lakeLayer)) lakeLayer.bringToFront();
  if (map.hasLayer(riverLayer)) riverLayer.bringToFront();
}

function setRouteThemeTexture(texture = null) {
  mapThemeOverlay.classList.remove("stadia-style-plastic", "route-theme-watercolor");
  mapThemeOverlay.style.background = "none";
  mapThemeOverlay.style.mixBlendMode = "normal";
  mapThemeOverlay.style.opacity = "0";
  if (!texture) return;
  if (mapLibreBasemapEnabled()) return;
  document.documentElement.style.setProperty("--route-theme-land-a", texture.landA || "240 214 165");
  document.documentElement.style.setProperty("--route-theme-land-b", texture.landB || "168 124 82");
  document.documentElement.style.setProperty("--route-theme-water-a", texture.waterA || "91 197 215");
  document.documentElement.style.setProperty("--route-theme-water-b", texture.waterB || "17 127 154");
  mapThemeOverlay.classList.add(texture.className);
  mapThemeOverlay.style.opacity = String(texture.opacity ?? 0.65);
  mapThemeOverlay.style.mixBlendMode = "multiply";
}

function refreshNewElementLayers() {
  syncNewElementLayerOrder();
  landLayer.setStyle({
    fillColor: layerFill("land"),
    fillOpacity: els.toggleLand.checked ? layerStyles.land.size * styleOpacity("land") : 0
  });
  waterFillLayer.setStyle({
    fillColor: layerFill("water"),
    fillOpacity: els.toggleWater.checked ? layerStyles.water.size * styleOpacity("water") : 0
  });
  lakeLayer.setStyle({
    color: styleColor("water"),
    weight: 0.5,
    opacity: els.toggleWater.checked ? 0.45 * styleOpacity("water") : 0,
    fillColor: waterBodyFill(),
    fillOpacity: els.toggleWater.checked ? layerStyles.water.size * styleOpacity("water") : 0
  });
  riverLayer.setStyle({
    color: styleColor("water"),
    opacity: els.toggleWater.checked ? clamp(layerStyles.water.size * 0.82 * styleOpacity("water"), 0, 1) : 0
  });
  map.getPane("landPane").style.mixBlendMode = styleBlend("land");
  map.getPane("oceanPane").style.mixBlendMode = styleBlend("water");
  map.getPane("waterPane").style.mixBlendMode = styleBlend("water");
  refreshLayerTextureOverlays();
  document.documentElement.style.setProperty("--route-theme-land-a", hexToRgbTriplet(styleColor("land")));
  document.documentElement.style.setProperty("--route-theme-water-a", hexToRgbTriplet(styleColor("water")));
  document.documentElement.style.setProperty("--route-theme-texture-opacity", String(els.toggleTexture.checked ? layerStyles.texture.size * styleOpacity("texture") : 0));
  mapThemeOverlay.style.opacity = els.toggleTexture.checked && mapThemeOverlay.classList.contains("route-theme-watercolor")
    ? String(layerStyles.texture.size * styleOpacity("texture"))
    : mapThemeOverlay.style.opacity;
  mapThemeOverlay.style.mixBlendMode = styleBlend("texture");
}

function setPinnedStopSubsection(button, content, expanded) {
  if (!button || !content) return;
  const isExpanded = Boolean(expanded);
  button.setAttribute("aria-expanded", String(isExpanded));
  content.hidden = !isExpanded;
  button.querySelector(".pinned-stop-twirl-arrow")?.classList.toggle("is-expanded", isExpanded);
}

function initializePinnedStopSubsections() {
  const entries = [
    [els.stopDatesToggle, els.stopDatesSubsection],
    [els.stopStatsToggle, els.stopStatsSubsection]
  ];
  entries.forEach(([button, content]) => {
    if (!button || !content) return;
    if (button.dataset.pinnedTwirlBound === "true") return;
    button.dataset.pinnedTwirlBound = "true";
    setPinnedStopSubsection(button, content, button.getAttribute("aria-expanded") === "true");
    button.addEventListener("click", () => {
      setPinnedStopSubsection(button, content, button.getAttribute("aria-expanded") !== "true");
    });
  });
  els.showEndpointGps?.addEventListener("click", () => {
    setPinnedStopSubsection(els.stopStatsToggle, els.stopStatsSubsection, true);
  });
}

function updateStadiaThemeDebug() {
  if (!els.stadiaThemeDebug) return;
  const style = STADIA_STYLES.find(item => item.id === editingStadiaStyleId) || activeStadiaStyle();
  const rootStyle = getComputedStyle(document.documentElement);
  const overlayStyle = getComputedStyle(mapThemeOverlay);
  const rect = mapThemeOverlay.getBoundingClientRect();
  const streetPane = map.getPane("streetPane");
  els.stadiaThemeDebug.textContent = [
    `active: ${activeStadiaStyleId}`,
    `editing: ${editingStadiaStyleId || "(none)"}`,
    `enabled: ${els.enableStadia.checked}`,
    `style: ${style?.id} / ${style?.tileStyle}`,
    `swatch: ${(style?.swatch || []).join(" -> ")}`,
    `css a: ${rootStyle.getPropertyValue("--stadia-map-a-rgb").trim()}`,
    `css b: ${rootStyle.getPropertyValue("--stadia-map-b-rgb").trim()}`,
    `blend: ${rootStyle.getPropertyValue("--stadia-topo-blend").trim()}`,
    `contours: ${rootStyle.getPropertyValue("--stadia-topo-contours").trim()}`,
    `overlay classes: ${mapThemeOverlay.className}`,
    `overlay size: ${Math.round(rect.width)}x${Math.round(rect.height)}`,
    `overlay opacity: ${overlayStyle.opacity}`,
    `overlay blend: ${overlayStyle.mixBlendMode}`,
    `overlay bg: ${overlayStyle.backgroundImage.slice(0, 180)}${overlayStyle.backgroundImage.length > 180 ? "..." : ""}`,
    `overlay z: ${overlayStyle.zIndex}`,
    `street pane z: ${streetPane ? getComputedStyle(streetPane).zIndex : "(missing)"}`,
    `in map: ${els.mapCanvas.contains(mapThemeOverlay)}`
  ].join("\n");
}

function stadiaFilterControls(style) {
  return {
    brightness: filterValue(style.filter, "brightness", 1),
    saturation: filterValue(style.filter, "saturate", 1),
    contrast: filterValue(style.filter, "contrast", 1),
    sepia: filterValue(style.filter, "sepia", 0),
    hue: filterValue(style.filter, "hue-rotate", 0)
  };
}

function composeStadiaFilter() {
  return [
    `sepia(${Number(els.stadiaThemeSepia.value).toFixed(2)})`,
    `saturate(${Number(els.stadiaThemeSaturation.value).toFixed(2)})`,
    `contrast(${Number(els.stadiaThemeContrast.value).toFixed(2)})`,
    `brightness(${Number(els.stadiaThemeBrightness.value).toFixed(2)})`,
    `hue-rotate(${Math.round(Number(els.stadiaThemeHue.value))}deg)`
  ].join(" ");
}

function applyStadiaThemeEdit() {
  const style = STADIA_STYLES.find(item => item.id === editingStadiaStyleId);
  if (!style) return;
  const previousTileStyle = style.tileStyle;
  style.tileStyle = els.stadiaThemeBase.value;
  style.swatch = [els.stadiaThemeSwatchA.value, els.stadiaThemeSwatchB.value];
  style.filter = composeStadiaFilter();
  style.contours = Number(els.stadiaThemeContours.value);
  style.blend = Number(els.stadiaThemeBlend.value);
  style.textColor = els.stadiaThemeTextColor.value;
  style.textBg = els.stadiaThemeTextBg.value;
  style.textBgOpacity = Number(els.stadiaThemeTextBgOpacity.value);
  renderStadiaStyleGrid();
  if (style.tileStyle !== previousTileStyle) {
    rebuildStadiaLayer();
  }
  if (els.enableStadia.checked) {
    setStadiaEnabled(true);
  }
  updateStadiaThemeDebug();
}

function openStadiaThemePanel(styleId, event) {
  const style = STADIA_STYLES.find(item => item.id === styleId);
  if (!style) return;
  editingStadiaStyleId = styleId;
  const filter = stadiaFilterControls(style);
  els.stadiaThemeTitle.textContent = style.label;
  els.stadiaThemeBase.value = style.tileStyle;
  els.stadiaThemeSwatchA.value = style.swatch[0];
  els.stadiaThemeSwatchB.value = style.swatch[1];
  els.stadiaThemeBrightness.value = filter.brightness;
  els.stadiaThemeSaturation.value = filter.saturation;
  els.stadiaThemeContrast.value = filter.contrast;
  els.stadiaThemeSepia.value = filter.sepia;
  els.stadiaThemeHue.value = filter.hue;
  els.stadiaThemeContours.value = style.contours ?? 0.24;
  els.stadiaThemeBlend.value = style.blend ?? 0.2;
  els.stadiaThemeTextColor.value = style.textColor || "#111827";
  els.stadiaThemeTextBg.value = style.textBg || "#ffffff";
  els.stadiaThemeTextBgOpacity.value = style.textBgOpacity ?? 0.76;
  placePopup(els.stadiaThemePanel, event.clientX, event.clientY);
  updateStadiaThemeDebug();
}

function renderProviderStyleGrid(grid, styles, activeStyleId, onSelect, onContext) {
  grid.replaceChildren();
  styles.forEach(style => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-style-card";
    button.setAttribute("aria-pressed", style.id === activeStyleId ? "true" : "false");
    button.style.setProperty("--stadia-a", style.swatch[0]);
    button.style.setProperty("--stadia-b", style.swatch[1]);
    button.style.setProperty("--stadia-contours", style.contours ?? 0.24);
    button.style.setProperty("--stadia-blend", style.blend ?? 0.2);
    button.style.setProperty("--stadia-card-text", style.cardTextColor || "#172033");
    button.style.setProperty("--stadia-card-text-bg-rgb", hexToRgbTriplet(style.textBg || style.colors?.halo || "#ffffff"));
    button.style.setProperty("--stadia-card-text-bg-opacity", style.textBgOpacity ?? 0.82);
    button.innerHTML = `<strong>${style.label}</strong><span>${style.description}</span>`;
    button.addEventListener("click", () => onSelect(style.id));
    if (onContext) {
      button.addEventListener("contextmenu", event => {
        event.preventDefault();
        onContext(style.id, event);
      });
    }
    grid.append(button);
  });
}

function renderStadiaStyleGrid() {
  renderProviderStyleGrid(els.stadiaStyleGrid, STADIA_STYLES, activeStadiaStyleId, styleId => {
    activeStadiaStyleId = styleId;
    renderStadiaStyleGrid();
    rebuildStadiaLayer();
    if (els.enableStadia.checked) {
      setStadiaEnabled(true);
    } else {
      applyToggleState(getToggleState());
    }
  }, openStadiaThemePanel);
}

function renderStadiaThemeEditorOptions() {
  els.stadiaThemeBase.replaceChildren();
  STADIA_TILE_STYLE_OPTIONS.forEach(option => {
    els.stadiaThemeBase.append(new Option(option.label, option.value));
  });
}

function activeStadiaStyle() {
  return STADIA_STYLES.find(style => style.id === activeStadiaStyleId) || STADIA_STYLES[0];
}

function clampedPlaceBounds() {
  const bounds = map.getBounds().pad(0.24);
  const south = clamp(bounds.getSouth(), -85, 85);
  const north = clamp(bounds.getNorth(), -85, 85);
  const west = clamp(bounds.getWest(), -180, 180);
  const east = clamp(bounds.getEast(), -180, 180);
  return L.latLngBounds([south, west], [north, east]);
}

function overpassPlaceBoundsKey(bounds) {
  const round = value => Math.round(value * 4) / 4;
  return [round(bounds.getSouth()), round(bounds.getWest()), round(bounds.getNorth()), round(bounds.getEast())].join(",");
}

function overpassPlaceQuery(bounds) {
  const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].map(value => value.toFixed(5)).join(",");
  const populatedPlacePattern = "^([5-9][0-9]{4}|[1-9][0-9]{5,}|[5-9][0-9],[0-9]{3}|[1-9][0-9]{2},[0-9]{3}|[1-9][0-9]?,[0-9]{3},[0-9]{3})$";
  return `[out:json][timeout:18];(
node["place"~"^(city|town)$"]["population"~"${populatedPlacePattern}"](${bbox});
relation["place"~"^(city|town)$"]["population"~"${populatedPlacePattern}"](${bbox});
node["place"~"^(city|town)$"]["capital"](${bbox});
relation["place"~"^(city|town)$"]["capital"](${bbox});
);out center 900;`;
}

function parseOsmPopulation(value) {
  const parsed = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOsmCapital(tags = {}) {
  const capital = String(tags.capital || "").toLowerCase();
  return Boolean(capital && capital !== "no");
}

function normalizeOsmPlace(element) {
  const tags = element.tags || {};
  const name = tags.name || tags["name:en"];
  const lat = Number(element.lat ?? element.center?.lat);
  const lon = Number(element.lon ?? element.center?.lon);
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const population = parseOsmPopulation(tags.population);
  const capital = isOsmCapital(tags);
  const osmPlace = tags.place || "";
  if (!capital && population < OSM_TOWN_POPULATION_MIN) return null;

  const type = capital ? "capital" : population >= OSM_CITY_POPULATION_MIN ? "city" : "small-town";

  return {
    name,
    lat,
    lon,
    type,
    population,
    capital,
    osmPlace,
    score: (capital ? 2000000 : 0) + population
  };
}

function dedupeOsmPlaces(places) {
  const selected = [];
  places
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .forEach(place => {
      const duplicate = selected.some(existing => (
        existing.name.toLocaleLowerCase() === place.name.toLocaleLowerCase() &&
        Math.hypot(existing.lat - place.lat, existing.lon - place.lon) < 0.42
      ));
      if (!duplicate) selected.push(place);
    });
  return selected;
}

function labelBudgetForZoom(zoom = map.getZoom()) {
  if (zoom < 4.8) return 12;
  if (zoom < 5.7) return 22;
  if (zoom < 6.8) return 38;
  return 72;
}

function cityLayerKey(city) {
  if (city.osmPlace === "route-endpoint") return "routeStopLabels";
  return city.type === "capital" ? "capitols" : city.type === "city" ? "cities" : "smallTowns";
}

function normalizeRouteStopLabel(value = "") {
  return String(value || "")
    .toLocaleLowerCase()
    .replace(/\b(united states|usa|canada)\b/g, "")
    .replace(/\b(city|town|village|cdp)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function activeRouteStopLabelSet() {
  const names = new Set();
  state.routes.forEach(route => {
    [
      route.startQuery,
      route.startAddress,
      route.endQuery,
      route.endAddress,
      route.summary?.split(" to ")[0],
      route.summary?.split(" to ").slice(1).join(" to ")
    ].forEach(value => {
      const name = normalizeRouteStopLabel(routePlaceName(value || ""));
      if (name) names.add(name);
    });
  });
  return names;
}

function cityLayerEnabled(city) {
  if (city.osmPlace === "route-endpoint") {
    return routeStopNamesVisible;
  }
  if (city.type === "capital") return Boolean(els.toggleCapitals?.checked);
  if (city.type === "city") return Boolean(els.toggleCities?.checked);
  return Boolean(els.toggleSmallTowns?.checked);
}

function cityLabelPixelRect(city) {
  const key = cityLayerKey(city);
  const point = map.latLngToLayerPoint([city.lat, city.lon]);
  const size = styleSize(key);
  const { width, height } = cityLabelSize(city, size);
  if (city.labelRect) return city.labelRect;
  return {
    minX: point.x - width / 2,
    maxX: point.x + width / 2,
    minY: point.y - height / 2,
    maxY: point.y + height / 2
  };
}

function cityLabelSize(city, size = styleSize(cityLayerKey(city))) {
  const key = cityLayerKey(city);
  const stretch = styleFontStretch(key) / 100;
  const scaleY = styleFontScaleY(key) / 100;
  const letterSpacing = styleLetterSpacing(key) * size;
  const wordSpacing = styleWordSpacing(key) * size;
  const words = String(city.name || "").trim().split(/\s+/).length;
  return {
    width: clamp((city.name.length * (size * 0.68 + letterSpacing) + Math.max(0, words - 1) * wordSpacing + 18) * stretch, 58, 220),
    height: clamp((size + 10) * scaleY, 18, 36)
  };
}

function routeStrokeObstacleRects() {
  const stride = map.getZoom() < 5.8 ? 34 : 20;
  const routePad = styleSize("route") + layerStyles.route.halo + 3;
  return state.routes.flatMap(route => {
    const points = route.displayPoints?.length ? route.displayPoints : route.points || [];
    return points
      .filter((_, index) => index % stride === 0)
      .map(point => {
        const pixel = map.latLngToLayerPoint([point.lat, point.lon]);
        return {
          minX: pixel.x - routePad,
          maxX: pixel.x + routePad,
          minY: pixel.y - routePad,
          maxY: pixel.y + routePad
        };
      });
  });
}

function endpointMarkerObstacleRects() {
  const markerPad = Math.max(10, styleSize("startEnd") * 10);
  return state.routes.flatMap(route => {
    const points = route.displayPoints?.length ? route.displayPoints : route.points || [];
    if (!points.length) return [];
    return [points[0], points[points.length - 1]].map(point => {
      const pixel = map.latLngToLayerPoint([point.lat, point.lon]);
      return {
        minX: pixel.x - markerPad,
        maxX: pixel.x + markerPad,
        minY: pixel.y - markerPad,
        maxY: pixel.y + markerPad
      };
    });
  });
}

function placeEndpointLabel(city, placedRects, avoidRects) {
  const point = map.latLngToLayerPoint([city.lat, city.lon]);
  const { width, height } = cityLabelSize(city);
  const manualOffset = displayPositionForKey(labelDisplayPositionKey(city)).current;
  const hasManualPosition = Math.abs(manualOffset.x) > 0.01 || Math.abs(manualOffset.y) > 0.01;
  if (hasManualPosition) {
    const center = point.add(L.point(manualOffset.x, manualOffset.y));
    const rect = {
      minX: center.x - width / 2,
      maxX: center.x + width / 2,
      minY: center.y - height / 2,
      maxY: center.y + height / 2
    };
    city.labelRect = rect;
    city.labelSize = { width, height };
    city.labelCenter = map.layerPointToLatLng(center);
    city.labelAnchor = [width / 2, height / 2];
    placedRects.push(rect);
    return;
  }
  const markerClearance = Math.max(5, styleSize("startEnd") * 4);
  const rings = [markerClearance, markerClearance + 5, markerClearance + 11, markerClearance + 18];
  const baseCandidates = rings.flatMap((gap, ringIndex) => [
    { minX: point.x + gap, minY: point.y - height / 2, rank: ringIndex * 10 + 0 },
    { minX: point.x - gap - width, minY: point.y - height / 2, rank: ringIndex * 10 + 1 },
    { minX: point.x - width / 2, minY: point.y - gap - height, rank: ringIndex * 10 + 2 },
    { minX: point.x - width / 2, minY: point.y + gap, rank: ringIndex * 10 + 3 },
    { minX: point.x + gap * 0.7, minY: point.y - gap * 0.7 - height, rank: ringIndex * 10 + 4 },
    { minX: point.x - gap * 0.7 - width, minY: point.y - gap * 0.7 - height, rank: ringIndex * 10 + 5 },
    { minX: point.x + gap * 0.7, minY: point.y + gap * 0.7, rank: ringIndex * 10 + 6 },
    { minX: point.x - gap * 0.7 - width, minY: point.y + gap * 0.7, rank: ringIndex * 10 + 7 }
  ]);
  const candidates = baseCandidates.map(candidate => ({
    ...candidate,
    maxX: candidate.minX + width,
    maxY: candidate.minY + height
  }));
  const viewport = map.getSize();
  const scored = candidates.map(candidate => {
    const offscreenPenalty = (
      Math.max(0, -candidate.minX) +
      Math.max(0, -candidate.minY) +
      Math.max(0, candidate.maxX - viewport.x) +
      Math.max(0, candidate.maxY - viewport.y)
    ) * 4000;
    const centerX = candidate.minX + width / 2;
    const centerY = candidate.minY + height / 2;
    const distancePenalty = Math.hypot(centerX - point.x, centerY - point.y) * 2;
    const obstaclePenalty = avoidRects.some(rect => rectsOverlap(candidate, rect, 1)) ? 1000000 : 0;
    const labelPenalty = placedRects.some(rect => rectsOverlap(candidate, rect, 3)) ? 10000000 : 0;
    return { candidate, score: candidate.rank * 120 + distancePenalty + offscreenPenalty + obstaclePenalty + labelPenalty };
  }).sort((a, b) => a.score - b.score);
  const rect = scored[0].candidate;
  city.labelRect = rect;
  city.labelSize = { width, height };
  city.labelCenter = map.layerPointToLatLng([
    rect.minX + width / 2,
    rect.minY + height / 2
  ]);
  city.labelAnchor = [width / 2, height / 2];
  placedRects.push(rect);
}

function routePlaceName(value = "") {
  const text = String(value || "")
    .replace(/\b(united states|usa|canada)\b/ig, "")
    .replace(/\d{4,}/g, "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
  if (!text.length) return "";
  return text[0].replace(/\s+/g, " ");
}

function routeEndpointPlaceLabels() {
  const labels = [];
  const seen = new Set();
  state.routes.forEach((route, index) => {
    const points = route.displayPoints?.length ? route.displayPoints : route.points;
    if (!Array.isArray(points) || !points.length) return;
    [
      { name: routePlaceName(route.startQuery || route.startAddress || route.summary?.split(" to ")[0]), point: points[0], anchor: "start" },
      { name: routePlaceName(route.endQuery || route.endAddress || route.summary?.split(" to ").slice(1).join(" to ")), point: points[points.length - 1], anchor: "end" }
    ].forEach((entry, endpointIndex) => {
      if (!entry.name || !Number.isFinite(entry.point?.lat) || !Number.isFinite(entry.point?.lon)) return;
      const key = `${entry.name.toLocaleLowerCase()}:${Math.round(entry.point.lat * 10) / 10}:${Math.round(entry.point.lon * 10) / 10}`;
      if (seen.has(key)) return;
      seen.add(key);
      labels.push({
        name: entry.name,
        lat: entry.point.lat,
        lon: entry.point.lon,
        type: "city",
        population: 0,
        capital: false,
        osmPlace: "route-endpoint",
        displayPositionKey: sharedStopKeyForEndpoint(activeTrip(), index, entry.anchor),
        score: 1500000 - index * 100 - endpointIndex
      });
    });
  });
  return labels;
}

function selectCityLabelsForView() {
  if (!map || !map.getBounds) return [];
  const zoom = map.getZoom();
  const budget = labelBudgetForZoom(zoom);
  const bounds = map.getBounds().pad(0.04);
  const routeLabels = state.contiguousUsMode ? [] : routeEndpointPlaceLabels();
  const candidates = dedupeOsmPlaces([...routeLabels, ...osmPlaceLabels])
    .filter(city => bounds.contains([city.lat, city.lon]))
    .filter(shouldRenderCityLabel)
    .sort((a, b) => b.score - a.score);
  const selected = [];
  const placedRects = [];
  const avoidRects = [...routeStrokeObstacleRects(), ...endpointMarkerObstacleRects()];
  const margin = zoom < 6 ? 10 : 6;

  candidates.some(city => {
    if (city.osmPlace === "route-endpoint") {
      placeEndpointLabel(city, placedRects, avoidRects);
      selected.push(city);
      return selected.length >= budget;
    }
    const rect = cityLabelPixelRect(city);
    if (
      placedRects.some(existing => rectsOverlap(rect, existing, margin)) ||
      avoidRects.some(existing => rectsOverlap(rect, existing, 4))
    ) return false;
    selected.push(city);
    placedRects.push(rect);
    return selected.length >= budget;
  });

  return selected;
}

async function loadOsmPlaceLabels() {
  if (!ENABLE_OVERPASS_PLACE_LABELS) {
    osmPlaceAbortController?.abort();
    renderCityLabels();
    return;
  }
  const visible = Boolean(els.toggleSmallTowns?.checked || els.toggleCities?.checked || els.toggleCapitals?.checked);
  if (!visible) {
    renderCityLabels();
    return;
  }

  const bounds = clampedPlaceBounds();
  if (roadBoundsArea(bounds) > 6200) {
    renderCityLabels();
    return;
  }

  const cacheKey = overpassPlaceBoundsKey(bounds);
  const fetchId = ++osmPlaceFetchId;
  let places = osmPlaceCache.get(cacheKey);
  if (!places) {
    osmPlaceAbortController?.abort();
    const controller = new AbortController();
    osmPlaceAbortController = controller;
    const data = await fetchOverpassJson(overpassPlaceQuery(bounds), {
      signal: controller.signal,
      purpose: "OSM place labels"
    });
    if (controller.signal.aborted) return;
    places = dedupeOsmPlaces((data.elements || []).map(normalizeOsmPlace));
    osmPlaceCache.set(cacheKey, places);
    if (osmPlaceCache.size > OSM_PLACE_CACHE_LIMIT) {
      osmPlaceCache.delete(osmPlaceCache.keys().next().value);
    }
    if (osmPlaceAbortController === controller) {
      osmPlaceAbortController = null;
    }
  }
  if (fetchId !== osmPlaceFetchId) return;
  osmPlaceLabels = places;
  renderCityLabels();
}

function scheduleOsmPlaceRefresh(delay = OSM_PLACE_FETCH_DELAY) {
  clearTimeout(osmPlaceRefreshTimer);
  osmPlaceRefreshTimer = setTimeout(() => {
    loadOsmPlaceLabels().catch(error => {
      if (error?.name === "AbortError") return;
      console.warn("OSM place labels could not be loaded.", error);
      renderCityLabels();
    });
  }, delay);
}

function buildStreetVectorStyle(baseStyle) {
  const highwaysOn = Boolean(els.toggleHighways?.checked);
  const majorOn = Boolean(els.toggleStreet?.checked);
  const minorOn = Boolean(els.toggleFaintStreet?.checked);
  const railOn = Boolean(els.toggleRailroads?.checked);
  const buildingsOn = Boolean(els.toggleBuildings?.checked);
  const landOn = Boolean(els.toggleLand?.checked);
  const roadLayer = (baseStyle.layers || []).find(layer => (
    layer.type === "line" &&
    layer["source-layer"] === "transportation" &&
    layer.source &&
    baseStyle.sources?.[layer.source]
  ));
  const landuseLayer = (baseStyle.layers || []).find(layer => (
    layer.type === "fill" &&
    layer["source-layer"] === "landuse" &&
    layer.source &&
    baseStyle.sources?.[layer.source]
  ));
  const buildingLayer = (baseStyle.layers || []).find(layer => (
    layer.type === "fill" &&
    layer["source-layer"] === "building" &&
    layer.source &&
    baseStyle.sources?.[layer.source]
  ));
  const placeLayer = (baseStyle.layers || []).find(layer => (
    layer.type === "symbol" &&
    layer["source-layer"] &&
    /place/i.test(`${layer.id} ${layer["source-layer"]}`) &&
    layer.source &&
    baseStyle.sources?.[layer.source]
  ));
  const sourceName = roadLayer?.source || landuseLayer?.source || buildingLayer?.source || placeLayer?.source;
  const roadSourceLayer = roadLayer?.["source-layer"] || "transportation";
  const landuseSourceLayer = landuseLayer?.["source-layer"] || "landuse";
  const buildingSourceLayer = buildingLayer?.["source-layer"] || "building";
  const placeSourceLayer = placeLayer?.["source-layer"] || "place";
  const canUseVectorPlaceLabels = Boolean(placeLayer);
  const majorClasses = ["trunk", "primary"];
  const thoroughfareClasses = [
    "secondary"
  ];
  const style = {
    version: 8,
    glyphs: baseStyle.glyphs,
    sources: sourceName ? {
      [sourceName]: JSON.parse(JSON.stringify(baseStyle.sources[sourceName]))
    } : {},
    layers: [
      { id: `${STREET_VECTOR_LAYER_PREFIX}-background`, type: "background", paint: { "background-color": "rgba(0,0,0,0)", "background-opacity": 0 } }
    ]
  };
  if (!sourceName) return style;

  if (highwaysOn || majorOn || minorOn || railOn || buildingsOn || landOn) {
    const landColor = styleColor("land");
    const landIsDark = relativeLuminance(landColor) < 0.35;
    const urbanFill = landIsDark ? mixHex(landColor, "#fffdf8", 0.18) : mixHex(landColor, "#fffdf8", 0.72);
    const urbanOpacity = landOn ? clamp(styleOpacity("land") * 0.42, 0, 0.58) : 0;
    if (landuseLayer && landOn) {
      style.layers.push({
        id: `${STREET_VECTOR_LAYER_PREFIX}-urban-land`,
        type: "fill",
        source: sourceName,
        "source-layer": landuseSourceLayer,
        minzoom: 5,
        filter: [
          "all",
          ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
          ["match", ["get", "class"], ["residential", "commercial", "industrial", "retail"], true, false]
        ],
        paint: {
          "fill-color": urbanFill,
          "fill-opacity": [
            "interpolate", ["linear"], ["zoom"],
            5, clamp(urbanOpacity * 0.18, 0, 0.22),
            7, clamp(urbanOpacity * 0.62, 0, 0.36),
            10, urbanOpacity
          ]
        }
      });
    }
    if (buildingLayer && buildingsOn) {
      style.layers.push({
        id: `${STREET_VECTOR_LAYER_PREFIX}-buildings`,
        type: "fill",
        source: sourceName,
        "source-layer": buildingSourceLayer,
        minzoom: 13,
        paint: {
          "fill-color": styleColor("buildings"),
          "fill-opacity": styleOpacity("buildings")
        }
      });
    }
    const commonLayer = (key, opacity = styleOpacity(key)) => ({
      type: "line",
      source: sourceName,
      "source-layer": roadSourceLayer,
      layout: {
        visibility: "visible",
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": styleColor(key),
        "line-opacity": clamp(opacity, 0, 1),
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          3, 0.8,
          7, 1.3,
          12, 2.2
        ]
      }
    });
    if (highwaysOn) style.layers.push({
      ...commonLayer("highways"),
      id: `${STREET_VECTOR_LAYER_PREFIX}-motorway`,
      filter: ["==", ["get", "class"], "motorway"],
      paint: {
        ...commonLayer("highways").paint,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          3, 1.4,
          7, 2.3,
          12, 4.8
        ]
      }
    });
    if (majorOn) style.layers.push({
      ...commonLayer("majorRoads"),
      id: `${STREET_VECTOR_LAYER_PREFIX}-major`,
      filter: ["match", ["get", "class"], majorClasses, true, false]
    });
    if (majorOn) style.layers.push({
      ...commonLayer("majorRoads"),
      id: `${STREET_VECTOR_LAYER_PREFIX}-secondary`,
      filter: ["match", ["get", "class"], ["secondary"], true, false],
      paint: {
        ...commonLayer("majorRoads").paint,
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          5, 0.45,
          7, 0.8,
          10, 1.35,
          13, 1.9
        ]
      }
    });
    if (minorOn) style.layers.push({
      ...commonLayer("minorRoads"),
      id: `${STREET_VECTOR_LAYER_PREFIX}-local`,
      filter: ["match", ["get", "class"], ["tertiary", "residential", "unclassified", "service", "path", "track"], true, false],
      paint: { ...commonLayer("minorRoads").paint, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 13, 2.1] }
    });
    if (railOn) style.layers.push({
      ...commonLayer("railroads"),
      id: `${STREET_VECTOR_LAYER_PREFIX}-rail`,
      filter: ["match", ["get", "class"], ["rail", "railway", "subway", "tram"], true, false],
      paint: { ...commonLayer("railroads").paint, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.7, 12, 2.4], "line-dasharray": [2, 1.4] }
    });
    if (canUseVectorPlaceLabels && (els.toggleSmallTowns?.checked || els.toggleCities?.checked || els.toggleCapitals?.checked)) {
      style.layers.push({
        id: `${STREET_VECTOR_LAYER_PREFIX}-labels`, type: "symbol", source: sourceName, "source-layer": placeSourceLayer,
        minzoom: 4,
        layout: { "text-field": ["coalesce", ["get", "name"], ["get", "name:en"]], "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 10, 14] },
        paint: { "text-color": readableTextColor(styleColor("land")), "text-halo-color": styleColor("land"), "text-halo-width": 1.2 }
      });
    }
  }

  return style;
}

function routeFeature(route, kind, color, opacity = 1) {
  return {
    type: "Feature",
    properties: {
      kind,
      color,
      opacity,
      routeWidth: styleSize("route"),
      faintWidth: styleSize("faintRoute"),
      haloWidth: styleSize("route") + layerStyles.route.halo
    },
    geometry: {
      type: "LineString",
      coordinates: route.displayPoints.map(point => [point.lon, point.lat])
    }
  };
}

function markerFeature(point, label) {
  return {
    type: "Feature",
    properties: {
      kind: "marker",
      label,
      color: styleColor("startEnd"),
      radius: styleSize("startEnd"),
      opacity: styleOpacity("startEnd")
    },
    geometry: {
      type: "Point",
      coordinates: [point.lon, point.lat]
    }
  };
}

function partialRoutePoints(points, progress) {
  const clampedProgress = clamp(progress, 0, 1);
  if (points.length < 2) return points;
  if (clampedProgress <= 0) return [points[0], points[0]];
  if (clampedProgress >= 1) return points;

  const segments = points.slice(1).map((point, index) => ({
    start: points[index],
    end: point,
    length: haversineMiles(points[index], point)
  }));
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = total * clampedProgress;
  const partial = [points[0]];

  for (const segment of segments) {
    if (remaining >= segment.length) {
      partial.push(segment.end);
      remaining -= segment.length;
      continue;
    }
    const ratio = segment.length ? remaining / segment.length : 0;
    partial.push({
      lat: segment.start.lat + (segment.end.lat - segment.start.lat) * ratio,
      lon: segment.start.lon + (segment.end.lon - segment.start.lon) * ratio
    });
    break;
  }

  return partial;
}

function routeProgressPoint(points, progress) {
  const partial = partialRoutePoints(points, progress);
  return partial[partial.length - 1] || points[0] || null;
}

function waitForStartupThemeStep(ms = STARTUP_THEME_SEQUENCE_DELAY_MS) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function runStartupThemeSequence() {
  if (startupThemeSequenceStarted) return;
  startupThemeSequenceStarted = true;
  if (!window.maplibregl) return;
  if (!mapLibreBasemapEnabled()) {
    setMapLibreEnabled(true);
  }

  for (let index = 0; index < STARTUP_THEME_SEQUENCE.length; index += 1) {
    const styleId = STARTUP_THEME_SEQUENCE[index];
    if (!MAPLIBRE_STYLES.some(style => style.id === styleId)) continue;
    try {
      await selectMapLibreTheme(styleId);
      if (index < STARTUP_THEME_SEQUENCE.length - 1) {
        await waitForStartupThemeStep();
      }
    } catch (error) {
      console.warn(`Startup theme step failed: ${styleId}`, error);
    }
  }
}

function openMapLibreThemePanel(styleId, event) {
  const style = MAPLIBRE_STYLES.find(item => item.id === styleId);
  if (!style) return;
  editingMapLibreStyleId = styleId;
  els.mapLibreThemeTitle.textContent = style.label;
  els.mapLibreLandColor.value = mapLibreLandColor(style.colors);
  els.mapLibreTopoHighColor.value = mapLibreTopoHighColor(style.colors);
  els.mapLibreWaterColor.value = style.colors.water;
  els.mapLibreRoadColor.value = style.colors.road;
  els.mapLibreBoundaryColor.value = style.colors.boundary;
  els.mapLibreLabelColor.value = style.colors.label;
  els.mapLibreHaloColor.value = style.colors.halo;
  els.mapLibreRelief.value = style.contours ?? 0.25;
  placePopup(els.mapLibreThemePanel, event.clientX, event.clientY);
}

function applyMapLibreThemeEdit() {
  const style = MAPLIBRE_STYLES.find(item => item.id === editingMapLibreStyleId);
  if (!style) return;
  style.colors.land = els.mapLibreLandColor.value;
  style.colors.topoLow = els.mapLibreLandColor.value;
  style.colors.topoHigh = els.mapLibreTopoHighColor.value;
  style.colors.water = els.mapLibreWaterColor.value;
  style.colors.road = els.mapLibreRoadColor.value;
  style.colors.boundary = els.mapLibreBoundaryColor.value;
  style.colors.label = els.mapLibreLabelColor.value;
  style.colors.halo = els.mapLibreHaloColor.value;
  style.contours = Number(els.mapLibreRelief.value);
  style.blend = Number(els.mapLibreRelief.value);
  style.swatch = [style.colors.topoLow, style.colors.topoHigh];
  renderMapLibreStyleGrid();
  if (mapLibreBasemapEnabled() && style.id === activeMapLibreStyleId) {
    applyMapProviderTheme(style.id);
  }
}

const routeGroup = L.featureGroup().addTo(map);
const faintRouteGroup = L.featureGroup().addTo(map);
const overviewHoverRouteGroup = L.featureGroup().addTo(map);
const subduedRouteGroup = L.featureGroup().addTo(map);
const playbackGroup = L.featureGroup().addTo(map);
const routeHoverZoneGroup = L.featureGroup().addTo(map);
const markerGroup = L.featureGroup().addTo(map);
const routeWaypointGroup = L.featureGroup().addTo(map);
const mediaMarkerGroup = L.featureGroup().addTo(map);
const stickerGroup = L.featureGroup().addTo(map);
const annotationGroup = L.featureGroup().addTo(map);
const stateLineGroup = L.featureGroup().addTo(map);
const faintStateLineGroup = L.featureGroup();
const smallTownGroup = L.featureGroup().addTo(map);
const cityGroup = L.featureGroup().addTo(map);
const capitalGroup = L.featureGroup().addTo(map);

function terminologyValue(key, { plural = false, lower = false } = {}) {
  const base = String(terminologyState[key] || DEFAULT_TERMINOLOGY[key] || key).trim();
  const value = plural ? (/s$/i.test(base) ? base : `${base}s`) : base;
  return lower ? value.toLocaleLowerCase() : value;
}

function replaceTerminologyInTemplate(template) {
  let result = String(template || "");
  Object.keys(DEFAULT_TERMINOLOGY).forEach(key => {
    const original = DEFAULT_TERMINOLOGY[key];
    const replacement = terminologyValue(key);
    result = result
      .replace(new RegExp(`\\b${original}s\\b`, "g"), terminologyValue(key, { plural: true }))
      .replace(new RegExp(`\\b${original.toLocaleLowerCase()}s\\b`, "g"), terminologyValue(key, { plural: true, lower: true }))
      .replace(new RegExp(`\\b${original}\\b`, "g"), replacement)
      .replace(new RegExp(`\\b${original.toLocaleLowerCase()}\\b`, "g"), terminologyValue(key, { lower: true }));
  });
  return result;
}

function applyTerminology() {
  els.terminologyControls.forEach(input => {
    input.value = terminologyValue(input.dataset.terminologyKey);
  });
  document.querySelectorAll(".section-label, [role='tab'], .compact-section-note, .panel-section legend, .panel-section label > span").forEach(element => {
    if (!element.dataset.terminologyTemplate) element.dataset.terminologyTemplate = element.textContent;
    element.textContent = replaceTerminologyInTemplate(element.dataset.terminologyTemplate);
  });
  document.documentElement.style.setProperty("--term-trip", `"${terminologyValue("trip")}"`);
}

function updateProjectExportStatus() {
  if (!els.projectExportStatus || !els.projectExportSummary) return;
  const labels = {
    journeys: terminologyValue("journey", { plural: true }),
    styles: "map styles",
    ui: "UI settings",
    textures: "textures"
  };
  const dirty = [...projectDirtyCategories];
  els.projectExportStatus.classList.toggle("has-unsaved-changes", dirty.length > 0);
  els.projectExportSummary.textContent = dirty.length
    ? `Changes pending publish: ${dirty.map(key => labels[key] || key).join(", ")}.`
    : "No unpublished settings changes.";
  saveAllCategoryInputs().forEach(input => {
    input.closest("label")?.classList.toggle("has-unexported-change", projectDirtyCategories.has(input.dataset.saveAllCategory));
  });
  positionProjectExportStatus();
}

function positionProjectExportStatus() {
  if (!els.projectExportStatus || !els.mapCanvas) return;
  const mapRect = els.mapCanvas.getBoundingClientRect();
  const attribution = els.mapCanvas.querySelector(".leaflet-control-attribution");
  const attributionRect = attribution?.getBoundingClientRect();
  const safeBottom = attributionRect && attributionRect.width
    ? Math.max(10, mapRect.bottom - attributionRect.top + 7)
    : 10;
  els.projectExportStatus.style.right = `${Math.max(8, window.innerWidth - mapRect.right + 8)}px`;
  els.projectExportStatus.style.bottom = `${Math.max(8, window.innerHeight - mapRect.bottom + safeBottom)}px`;
  els.projectExportStatus.style.maxWidth = `${Math.max(220, Math.min(520, mapRect.width - 16))}px`;
}

function markProjectDirty(category) {
  if (!category) return;
  projectDirtyCategories.add(category);
  updateProjectExportStatus();
  rvProjectSync?.queue?.();
}

function currentJourneyStyle(index = Number(els.journeyStyleTarget?.value)) {
  const targetIndex = Number.isInteger(index) && index >= 0 ? index : state.activeTripIndex;
  const trip = state.trips[targetIndex];
  if (!trip) return normalizeJourneyStyle({}, targetIndex);
  trip.journeyStyle = normalizeJourneyStyle(trip.journeyStyle, targetIndex);
  return trip.journeyStyle;
}

function renderJourneyStyleControls() {
  if (!els.journeyStyleTarget) return;
  const requested = Number(els.journeyStyleTarget.value);
  const selectedIndex = Number.isInteger(requested) && state.trips[requested] ? requested : state.activeTripIndex;
  els.journeyStyleTarget.replaceChildren(...state.trips.map((trip, index) => new Option(trip.name || `${terminologyValue("journey")} ${index + 1}`, String(index), false, index === selectedIndex)));
  const style = currentJourneyStyle(selectedIndex);
  els.journeyStyleColor.value = style.routeColor;
  els.journeyStyleUsWidth.value = String(usJourneyRouteWidth);
  els.journeyStyleUsWidthValue.textContent = String(usJourneyRouteWidth);
  els.journeyStyleOutlineColor.value = style.outlineColor;
  els.journeyStyleOutlineWidth.value = String(style.outlineWidth);
  els.journeyStyleOutlineWidthValue.textContent = String(style.outlineWidth);
  els.journeyStyleOutlineOpacity.value = String(style.outlineOpacity);
  els.journeyStyleOutlineOpacityValue.textContent = style.outlineOpacity.toFixed(2).replace(/0$/, "");
  if (els.journeyStyleRouteLabelVisibility) els.journeyStyleRouteLabelVisibility.value = style.routeLabelVisibility;
  if (els.journeyStyleRouteLabelContent) els.journeyStyleRouteLabelContent.value = style.routeLabelContent;
  els.journeyUsFeatures.forEach(input => {
    input.checked = Boolean(style.usFeatures[input.dataset.journeyUsFeature]);
  });
}

function updateJourneyStyleFromControls() {
  const index = Number(els.journeyStyleTarget?.value);
  const trip = state.trips[index];
  if (!trip) return;
  const style = currentJourneyStyle(index);
  const sharedOutline = {
    outlineColor: els.journeyStyleOutlineColor.value,
    outlineWidth: Number(els.journeyStyleOutlineWidth.value),
    outlineOpacity: Number(els.journeyStyleOutlineOpacity.value)
  };
  trip.journeyStyle = normalizeJourneyStyle({
    ...style,
    routeColor: els.journeyStyleColor.value,
    routeLabelVisibility: els.journeyStyleRouteLabelVisibility?.value,
    routeLabelContent: els.journeyStyleRouteLabelContent?.value,
    ...sharedOutline,
    usFeatures: Object.fromEntries(els.journeyUsFeatures.map(input => [input.dataset.journeyUsFeature, input.checked]))
  }, index);
  state.trips.forEach((candidate, candidateIndex) => {
    if (candidate === trip) return;
    candidate.journeyStyle = normalizeJourneyStyle({
      ...currentJourneyStyle(candidateIndex),
      ...sharedOutline
    }, candidateIndex);
  });
  els.journeyStyleOutlineWidthValue.textContent = String(trip.journeyStyle.outlineWidth);
  els.journeyStyleOutlineOpacityValue.textContent = trip.journeyStyle.outlineOpacity.toFixed(2).replace(/0$/, "");
  saveTrips();
  markProjectDirty("journeys");
  if (state.contiguousUsMode) renderRoute(false);
}

function updateUsJourneyRouteWidth() {
  usJourneyRouteWidth = clamp(Number(els.journeyStyleUsWidth?.value), 2, 24);
  els.journeyStyleUsWidthValue.textContent = String(usJourneyRouteWidth);
  rvStorageWriteJson(US_JOURNEY_ROUTE_WIDTH_STORAGE_KEY, usJourneyRouteWidth);
  markProjectDirty("ui");
  if (state.contiguousUsMode) renderRoute(false);
}

function allStickerLibraryItems() {
  return [...DEFAULT_STICKER_LIBRARY, ...customStickerLibrary]
    .filter(item => item?.id && (item?.url || ["pin", "null"].includes(item?.objectClass)));
}

function renderStickerLibrary() {
  if (!els.stickerLibrary) return;
  // "Pins" was renamed to "Shapes".  Accept the old in-memory category
  // during an open editor session so a saved tab selection cannot strand the
  // library on an empty view.
  if (stickerLibraryCategory === "pins") stickerLibraryCategory = "shapes";
  els.stickerLibrary.classList.toggle("is-expanded", els.stickerLibraryView?.value === "expand");
  els.stickerLibrary.classList.toggle("is-pin-picker", stickerLibraryCategory === "shapes");
  if (els.pinLibraryControls) els.pinLibraryControls.hidden = stickerLibraryCategory !== "shapes";
  if (els.pinLibraryColor) els.pinLibraryColor.value = pinLibraryColor;
  if (els.pinLibraryRecentColors) {
    els.pinLibraryRecentColors.replaceChildren(...pinLibraryRecentColors.map(color => {
      const swatch = document.createElement("button");
      swatch.type = "button"; swatch.style.setProperty("--pin-swatch", color); swatch.title = `Use ${color}`;
      swatch.addEventListener("click", () => { pinLibraryColor = color; renderStickerLibrary(); });
      return swatch;
    }));
  }
  els.stickerLibrary.replaceChildren();
  const makeTile = (item, pin = item.pin, labelOverride = "") => {
    const tile = document.createElement("div");
    tile.className = "sticker-library-item";
    if (item.objectClass === "pin") tile.classList.add("is-pin");
    if (item.objectClass === "null") tile.classList.add("is-null");
    tile.draggable = true;
    tile.dataset.stickerLibraryId = item.id;
    tile.dataset.help = `Drag ${item.label} onto the map.`;
    const visual = item.objectClass === "null"
      ? '<b class="sticker-library-null">NULL</b>'
      : item.objectClass === "pin"
      ? `<b class="sticker-library-pin is-${escapeHtml(pin?.variant || "down-middle")} is-shape-${escapeHtml(pin?.shape || "round")}" style="--object-pin-color:${escapeHtml(pinLibraryColor)}"><i></i></b>`
      : `<img src="${escapeHtml(item.url)}" alt="">`;
    tile.innerHTML = `${visual}<span>${escapeHtml(labelOverride || item.label)}</span>`;
    tile.addEventListener("dragstart", event => {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("application/x-rv-sticker", JSON.stringify(item.objectClass === "pin" ? { id: item.id, pin: { ...pin, color: pinLibraryColor } } : { id: item.id }));
    });
    return tile;
  };
  const items = allStickerLibraryItems()
    .filter(item => stickerLibraryCategory === "all" || item.category === stickerLibraryCategory)
    .sort((first, second) => first.objectClass === "null" ? -1 : second.objectClass === "null" ? 1 : 0);
  items.forEach(item => els.stickerLibrary.append(makeTile(item)));
}

function rememberPinLibraryColor(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || "")) return;
  pinLibraryRecentColors = [color, ...pinLibraryRecentColors.filter(item => item !== color)].slice(0, 12);
  rvStorageWriteJson(PIN_LIBRARY_COLORS_KEY, pinLibraryRecentColors);
}

function selectedStickerRecord() {
  return state.trips.flatMap(trip => trip.stickers || []).find(sticker => sticker.id === selectedStickerId) || null;
}

function currentStickerViewKey() {
  if (state.contiguousUsMode) return "us";
  if (Number.isInteger(state.overviewFocusIndex)) return "route";
  if (state.overviewMode) return "journey";
  return state.selectionScope || "stop";
}

function updatePinnedSelectionHighlights() {
  const scope = currentStickerViewKey();
  [els.tripSelect, els.topTripSelect].filter(Boolean).forEach(select => select.classList.toggle("is-viewing", scope === "journey"));
  [els.routeDaySelect].filter(Boolean).forEach(select => select.classList.toggle("is-viewing", scope === "stop"));
  [els.pinnedRouteSelect].filter(Boolean).forEach(select => select.classList.toggle("is-viewing", scope === "route"));
}

function stickerBaseSizeForView(sticker, view = currentStickerViewKey()) {
  return clamp(Number(sticker?.sizesByView?.[view]) || Number(sticker?.size) || 64, 20, 320);
}

function initializePinnedSectionVisibility() {
  const sections = {
    trip: document.querySelector(".pinned-trip-details"),
    journey: document.querySelector(".pinned-journey-details"),
    "stop-day": document.querySelector(".pinned-day-details"),
    route: document.querySelector(".pinned-route-details")
  };
  const tabs = [...document.querySelectorAll("[data-pinned-section-toggle]")];
  const footerTab = document.querySelector("[data-pinned-footer-toggle]");
  const footer = document.querySelector(".panel-footer-theme");
  const footerDetails = document.querySelector("[data-pinned-tools-details]");
  // The footer tab must remain available when Tools itself is hidden. Keeping
  // it beside the other fixed tabs also gives it the same stacking behavior.
  if (footerTab && footerTab.parentElement !== document.body) document.body.append(footerTab);
  // The Trip tier begins tucked away; its compact tab exposes the US-level
  // selector without consuming another permanent editor row.
  const desired = Object.fromEntries(Object.keys(sections).map(key => [key, key !== "trip"]));
  rvStorageWriteJson(PINNED_SECTION_VISIBILITY_KEY, desired);
  const easingChoices = {
    "curved-valley": { timing: "cubic-bezier(.68, 0, .32, 1)", hint: "Curved valley: slow at both edges, with a decisive middle pass." },
    "smooth-step": { timing: "cubic-bezier(.65, 0, .35, 1)", hint: "Smooth step: a restrained, dependable ease-in and ease-out." },
    "soft-spring": { timing: "cubic-bezier(.34, 1.38, .64, 1)", hint: "Soft spring: a gentle overshoot before settling into place." },
    cinema: { timing: "cubic-bezier(.76, 0, .24, 1)", hint: "Cinema glide: longer anticipation and a calm landing." },
    snappy: { timing: "cubic-bezier(.2, .9, .25, 1)", hint: "Snappy settle: quick response with a small easing tail." }
  };
  const easingSelect = document.querySelector("#pinnedSectionEasing");
  const easingHint = document.querySelector("#pinnedSectionEasingHint");
  const speedInput = document.querySelector("#pinnedSectionSpeed");
  const speedValue = document.querySelector("#pinnedSectionSpeedValue");
  const pinnedPanelScroller = document.querySelector(".panel-tab-panels");
  let queue = [];
  let activeAnimation = null;
  let activeTask = null;
  let burstClicks = 0;
  const pinnedAnimationSpeed = () => clamp(Number(speedInput?.value) || 1, 0.25, 2);
  const syncPinnedAnimationSpeed = () => {
    if (!speedInput) return;
    speedInput.value = String(clamp(Number(rvStorageReadJson(PINNED_SECTION_SPEED_KEY, speedInput.value)) || 1, 0.25, 2));
    if (speedValue) speedValue.textContent = `${Number(speedInput.value).toFixed(2).replace(/\.00$/, "")}×`;
  };
  syncPinnedAnimationSpeed();
  speedInput?.addEventListener("input", () => {
    if (speedValue) speedValue.textContent = `${Number(speedInput.value).toFixed(2).replace(/\.00$/, "")}×`;
    rvStorageWriteJson(PINNED_SECTION_SPEED_KEY, Number(speedInput.value));
  });
  const setTabState = (key, visible) => {
    const tab = tabs.find(item => item.dataset.pinnedSectionToggle === key);
    if (!tab) return;
    tab.setAttribute("aria-pressed", String(visible));
    tab.classList.toggle("is-active", visible);
  };
  const setInitialVisible = (key, visible) => {
    sections[key]?.toggleAttribute("hidden", !visible);
    setTabState(key, visible);
  };
  const captureSideTabSlots = () => {
    const journeyRect = sections.journey?.getBoundingClientRect();
    tabs.forEach(tab => {
      const section = sections[tab.dataset.pinnedSectionToggle];
      const rect = section?.getBoundingClientRect();
      const width = Number.parseFloat(getComputedStyle(tab).getPropertyValue("--pinned-tab-width")) || tab.getBoundingClientRect().width || 28;
      // A hidden section has a zero rectangle. Trip is deliberately hidden on
      // first load, so park its fixed tab directly above the Journey slot.
      const hiddenTripSlot = tab.dataset.pinnedSectionToggle === "trip" && section?.hidden;
      const top = hiddenTripSlot ? (journeyRect?.top || 32) - 32 : (rect?.top || 0);
      const left = hiddenTripSlot ? (journeyRect?.left || width) : (rect?.left || 0);
      tab.dataset.slotTop = String(Math.round(top));
      tab.dataset.slotLeft = String(Math.round(left - width));
      tab.dataset.slotHeight = String(Math.max(1, Math.round(rect?.height || 1)));
    });
  };
  const positionSideTabs = () => tabs.forEach((tab, index) => {
    // Slots are captured from the fully visible initial layout (and on an
    // actual viewport resize). Clicking a tab only changes its active color;
    // it must never make the fixed rail shuffle around.
    // Clear the nearby secondary-panel twirl handle while retaining this
    // section's anchor relationship.
    tab.style.left = `${(Number(tab.dataset.slotLeft) || 0) - 8}px`;
    tab.style.height = "28px";
    tab.style.top = `${(Number(tab.dataset.slotTop) || 0) + 3}px`;
    tab.style.zIndex = String(40 - index);
  });
  const positionFooterTab = (capture = false) => {
    const firstTab = tabs[0];
    if (!footerTab || !firstTab) return;
    footerTab.style.left = `${Math.round(firstTab.getBoundingClientRect().left)}px`;
    // The Device tab always matches the closed summary, not the expanded
    // details content above it.
    if (footer && !footer.hidden && (capture || !footerTab.dataset.slotTop)) {
      const rect = footerDetails?.querySelector("summary")?.getBoundingClientRect() || footer.getBoundingClientRect();
      footerTab.dataset.slotTop = String(Math.round(rect.top + 2));
      footerTab.dataset.slotHeight = "28";
    }
    footerTab.style.top = `${Number(footerTab.dataset.slotTop) || 0}px`;
    footerTab.style.height = `${Number(footerTab.dataset.slotHeight) || 28}px`;
  };
  // The first action remains the advertised two seconds. Each additional
  // queued click is 10% faster, capped before it can outrun a normal pointer.
  const currentSpeed = () => Math.min(2.59, 1.1 ** Math.max(0, burstClicks - 1));
  const updateActiveSpeed = () => {
    if (activeAnimation) activeAnimation.updatePlaybackRate(currentSpeed());
  };
  const runNext = () => {
    if (activeTask) return;
    const task = queue.shift();
    if (!task) { burstClicks = 0; return; }
    activeTask = task;
    const section = sections[task.key];
    if (!section) { activeTask = null; runNext(); return; }
    const visibleBefore = Object.values(sections).some(item => !item.hidden);
    const duration = 2000 / pinnedAnimationSpeed();
    const choice = easingChoices[easingSelect?.value] || easingChoices["curved-valley"];
    Object.values(sections).forEach((item, index) => { item.style.zIndex = String(10 - index); });
    section.style.zIndex = "0";
    section.style.overflow = "hidden";
    if (task.visible) {
      section.hidden = false;
      const height = section.scrollHeight;
      activeAnimation = section.animate([
        { height: "0px", opacity: 0, clipPath: "inset(100% 0 0 0)", transform: "translateY(-18px)" },
        { height: `${height}px`, opacity: 1, clipPath: "inset(0 0 0 0)", transform: "translate(0, 0)" }
      ], { duration, easing: choice.timing, fill: "both" });
    } else {
      const height = section.getBoundingClientRect().height;
      activeAnimation = section.animate([
        { height: `${height}px`, opacity: 1, clipPath: "inset(0 0 0 0)", transform: "translate(0, 0)" },
        { height: "0px", opacity: 0, clipPath: "inset(100% 0 0 0)", transform: "translateY(-18px)" }
      ], { duration, easing: choice.timing, fill: "both" });
    }
    updateActiveSpeed();
    activeAnimation.finished.catch(() => {}).then(() => {
      section.getAnimations().forEach(animation => animation.cancel());
      section.style.removeProperty("height"); section.style.removeProperty("opacity"); section.style.removeProperty("clip-path"); section.style.removeProperty("transform"); section.style.removeProperty("overflow"); section.style.removeProperty("z-index");
      section.hidden = !task.visible;
      activeAnimation = null; activeTask = null;
      positionSideTabs();
      runNext();
    });
  };
  Object.entries(desired).forEach(([key, visible]) => setInitialVisible(key, visible));
  footerTab?.setAttribute("aria-pressed", "true");
  footerTab?.classList.add("is-active");
  const savedToolsDetailsOpen = rvStorageReadJson(PINNED_TOOLS_DETAILS_KEY, false) === true;
  if (footerDetails) footerDetails.open = savedToolsDetailsOpen;
  requestAnimationFrame(() => { captureSideTabSlots(); positionSideTabs(); positionFooterTab(true); });
  window.addEventListener("resize", () => {
    if (Object.values(sections).every(section => !section.hidden)) {
      captureSideTabSlots();
    }
    positionSideTabs(); positionFooterTab(true);
  });
  pinnedPanelScroller?.addEventListener("scroll", () => { positionSideTabs(); positionFooterTab(); }, { passive: true });
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const key = tab.dataset.pinnedSectionToggle;
      desired[key] = !desired[key];
      setTabState(key, desired[key]);
      const current = rvStorageReadJson(PINNED_SECTION_VISIBILITY_KEY, {}) || {};
      current[key] = desired[key]; rvStorageWriteJson(PINNED_SECTION_VISIBILITY_KEY, current);
      burstClicks = Math.min(11, burstClicks + 1);
      updateActiveSpeed();
      queue.push({ key, visible: desired[key] });
      positionSideTabs(); positionFooterTab();
      runNext();
    });
  });
  const syncEasingHint = () => {
    const choice = easingChoices[easingSelect?.value] || easingChoices["curved-valley"];
    if (easingHint) easingHint.textContent = choice.hint;
  };
  easingSelect?.addEventListener("change", syncEasingHint);
  syncEasingHint();

  let footerAnimation = null;
  let footerMotionId = 0;
  const toolsMotion = () => ({
    duration: 520 / pinnedAnimationSpeed(),
    easing: (easingChoices[easingSelect?.value] || easingChoices.snappy).timing,
    fill: "both"
  });
  const setToolsVisible = visible => {
    if (!footer || !footerTab) return;
    const motionId = ++footerMotionId;
    footerAnimation?.cancel();
    footerTab.setAttribute("aria-pressed", String(visible));
    footerTab.classList.toggle("is-active", visible);
    if (visible) {
      footer.hidden = false;
      const height = footer.scrollHeight;
      footerAnimation = footer.animate([
        { height: "0px", opacity: 0, clipPath: "inset(100% 0 0 0)", transform: "translateY(-18px)" },
        { height: `${height}px`, opacity: 1, clipPath: "inset(0 0 0 0)", transform: "translateY(0)" }
      ], toolsMotion());
    } else {
      const height = footer.getBoundingClientRect().height;
      footerAnimation = footer.animate([
        { height: `${height}px`, opacity: 1, clipPath: "inset(0 0 0 0)", transform: "translateY(0)" },
        { height: "0px", opacity: 0, clipPath: "inset(100% 0 0 0)", transform: "translateY(-18px)" }
      ], toolsMotion());
    }
    footerAnimation.finished.catch(() => {}).then(() => {
      if (motionId !== footerMotionId) return;
      footer.getAnimations().forEach(animation => animation.cancel());
      if (!visible) footer.hidden = true;
      footerAnimation = null;
    });
  };
  footerTab?.addEventListener("click", () => {
    setToolsVisible(Boolean(footer?.hidden));
  });
  footerDetails?.addEventListener("toggle", () => rvStorageWriteJson(PINNED_TOOLS_DETAILS_KEY, footerDetails.open));
}

function stickerSizeForView(sticker, view = currentStickerViewKey()) {
  const placedZoom = Number(sticker?.placedZoom);
  const zoom = Number(map?.getZoom?.());
  // Keep the chosen size at (and above) placement zoom, while allowing a
  // sticker to recede naturally as an admin zooms out for more map context.
  const zoomScale = Number.isFinite(placedZoom) && Number.isFinite(zoom)
    ? clamp(2 ** ((zoom - placedZoom) * 0.18), 0.35, 1)
    : 1;
  return clamp(stickerBaseSizeForView(sticker, view) * zoomScale, 12, 320);
}

function setStickerSizeForView(sticker, size, view = currentStickerViewKey()) {
  if (!sticker) return;
  sticker.sizesByView = {
    us: stickerBaseSizeForView(sticker, "us"),
    journey: stickerBaseSizeForView(sticker, "journey"),
    route: stickerBaseSizeForView(sticker, "route"),
    stop: stickerBaseSizeForView(sticker, "stop")
  };
  sticker.sizesByView[view] = clamp(Number(size) || 64, 20, 320);
  sticker.size = sticker.sizesByView[view];
}

function renderStickerSelectionControls() {
  const sticker = selectedStickerRecord();
  if (!els.stickerSelectionControls) return;
  els.stickerSelectionControls.hidden = !sticker;
  if (!sticker) return;
  els.selectedStickerName.textContent = sticker.label;
  els.selectedStickerVisibility.value = sticker.visibility;
  const size = stickerBaseSizeForView(sticker);
  els.selectedStickerSize.value = String(size);
  els.selectedStickerSizeValue.textContent = String(size);
  els.selectedStickerAllZooms.checked = sticker.showAtAllZooms;
}

function effectiveStickerVisibility(sticker, trip) {
  return sticker.visibility === "inherit"
    ? (trip.stickerDefaults?.visibility || DEFAULT_STICKER_VISIBILITY)
    : sticker.visibility;
}

function selectedStickerDefaults() {
  return state.noJourneySelected
    ? normalizeProjectDefaults(state.projectDefaults).sticker
    : normalizeStickerDefaults(activeTrip()?.stickerDefaults);
}

function stickerShouldRender(sticker, trip) {
  if (sticker.objectClass === "null" && !isEditorSite()) return false;
  const visibility = effectiveStickerVisibility(sticker, trip);
  if (visibility === "never") return false;
  if (!sticker.showAtAllZooms && sticker.placedView !== currentStickerViewKey()) return false;
  if (state.contiguousUsMode) {
    // An explicit per-sticker "Always" + "Show at all zooms" choice wins over
    // the journey-wide US-view feature switch. The feature switch still
    // controls inherited and view-local stickers.
    if (sticker.showAtAllZooms && visibility === "always") return true;
    return Boolean(trip.journeyStyle?.usFeatures?.stickers);
  }
  if (trip !== activeTrip()) return false;
  // In a zoomed route/stop view, keep the stage and its timeline focused on
  // this leg. Journey and US views intentionally retain their broader rules.
  if (sticker.scope === "route" && !(currentStickerViewKey() === "route" && sticker.routeIndex === state.activeRouteIndex)) return false;
  if (sticker.scope === "stop" && !(!state.overviewMode && state.selectionScope === "stop" && sticker.stopId === synchronizeTripStops(trip)[selectedStopIndex]?.id)) return false;
  if (sticker.dayIso && (!(!state.overviewMode && state.selectionScope === "stop") || sticker.stopId !== synchronizeTripStops(trip)[selectedStopIndex]?.id || sticker.dayIso !== selectedStopDayIso)) return false;
  if (!state.overviewMode && Number.isInteger(sticker.routeIndex) && sticker.routeIndex !== state.activeRouteIndex) return false;
  if (!state.overviewMode && !Number.isInteger(sticker.routeIndex)) return false;
  if (visibility === "always" || visibility === "hover") return true;
  const stopIndex = synchronizeTripStops(trip).findIndex(stop => stop.id === sticker.stopId);
  if (state.playback.active && sticker.routeIndex === state.activeRouteIndex && state.playback.progress < (Number(sticker.triggerProgress) || 0)) return false;
  if (stopIndex < 0) return true;
  return visibility === "reached" ? stopIndex <= selectedStopIndex : stopIndex > selectedStopIndex;
}

function stickerObjectMarkup(sticker) {
  const objectClass = sticker.objectClass || "sticker";
  // A Null remains absent on the USER site, but in the editor it may carry a
  // shape. That makes it the deliberately empty pin building block.
  if (objectClass === "null" && !sticker.pin?.shapeEnabled) return '<span class="map-null-object">NULL</span>';
  const usesShapeLayer = objectClass === "pin" || Boolean(sticker.pin?.shapeEnabled);
  if (usesShapeLayer) {
    if (sticker.pin?.style === "preview" && sticker.imageUrl) {
      return `<span class="map-pin-object is-preview"><img src="${escapeHtml(sticker.imageUrl)}" alt="${escapeHtml(sticker.label)}"></span>`;
    }
    const number = Math.max(1, (activeTrip()?.stickers || []).filter(item => item.objectClass === "pin").findIndex(item => item.id === sticker.id) + 1);
    const graphicUrl = sticker.pin?.graphicUrl || (objectClass === "sticker" ? sticker.imageUrl : "");
    const graphic = sticker.pin?.style === "graphic" && graphicUrl
      ? `<img class="map-pin-graphic" src="${escapeHtml(graphicUrl)}" alt="${escapeHtml(sticker.label)}">`
      : "";
    const glyph = objectClass === "null" || sticker.pin?.style === "blank" || graphic ? "" : sticker.pin?.style === "letter" ? sticker.label.slice(0, 1) : sticker.pin?.style === "number" ? String(number) : sticker.pin?.symbol || "•";
    const note = sticker.pin?.shape === "note" ? `<span class="map-pin-note">${escapeHtml(sticker.pin?.noteText || "")}</span>` : "";
    return `<span class="map-pin-object${objectClass !== "pin" ? " is-sticker-graphic" : ""}${objectClass === "null" ? " is-null-shape" : ""} is-${escapeHtml(sticker.pin?.variant || "down-middle")} is-shape-${escapeHtml(sticker.pin?.shape || "round")}">${graphic}${note}${escapeHtml(glyph)}</span>`;
  }
  if (sticker.imageUrl) return `<img src="${escapeHtml(sticker.imageUrl)}" alt="${escapeHtml(sticker.label)}">`;
  return '<span class="map-media-object">MEDIA</span>';
}

function pinStrokeRenderStyle(strokes, fallbackColor = "#fff", fallbackSize = 0) {
  const source = Array.isArray(strokes) && strokes.length ? strokes : [{ color: fallbackColor, size: fallbackSize }];
  const visible = source.filter(stroke => !stroke.hidden && Number(stroke.size) > 0);
  const first = visible[0] || { color: fallbackColor, size: fallbackSize };
  let radius = Number(first.size) || 0;
  const shadows = visible.slice(1).map(stroke => {
    radius += Number(stroke.size) || 0;
    return `0 0 0 ${radius}px ${stroke.color}`;
  });
  return {
    color: first.color || fallbackColor,
    width: `${Math.max(0, Number(first.size) || 0)}px`,
    shadow: [...shadows, "0 2px 5px #0007"].join(", "),
    filter: visible.map(stroke => `drop-shadow(0 0 ${Math.max(0, Number(stroke.size) || 0)}px ${stroke.color})`).join(" ") || "none"
  };
}

function openStickerEventMedia(sticker, slot) {
  const mediaId = sticker?.mediaEvents?.[slot] || "";
  const media = mediaId ? findTripMediaRecord?.(mediaId)?.item : null;
  if (media) openJourneyMedia?.(media, { ...(sticker.mediaEventOptions?.[slot] || {}), eventContext: { sticker, slot } });
}

function refreshStickerMediaPreview() {
  const preview = els.stickerMediaPreview;
  if (!preview) return;
  const sticker = selectedStickerRecord();
  const mediaId = ["appear", "click", "hover"].map(slot => sticker?.mediaEvents?.[slot]).find(Boolean) || sticker?.mediaId || "";
  const item = mediaId ? findTripMediaRecord?.(mediaId)?.item : null;
  preview.replaceChildren();
  preview.hidden = false;
  if (!item) {
    preview.innerHTML = '<span class="media-preview-placeholder">No event media selected</span>';
    return;
  }
  const imageUrl = item.customThumbnailUrl || item.thumbnailUrl || (item.kind === "image" ? item.url : "");
  if (imageUrl) {
    const image = document.createElement("img"); image.src = imageUrl; image.alt = item.name || "Media preview"; preview.append(image);
  } else {
    const label = document.createElement("span"); label.className = "media-preview-placeholder"; label.textContent = item.kind === "audio" ? "AUDIO" : item.kind === "video" || item.kind === "youtube" ? "VIDEO" : item.kind === "blog" ? "TEXT" : "MEDIA"; preview.append(label);
  }
  preview.title = item.name || "Media preview";
}

function renderStickers() {
  updateSelectionControls();
  updatePinnedSelectionHighlights();
  refreshStickerMediaPreview();
  stickerGroup.clearLayers();
  renderStickerSelectionControls();
  const visibleStickerIds = new Set();
  const trips = state.contiguousUsMode ? state.trips : [activeTrip()].filter(Boolean);
  trips.forEach(trip => {
    trip.journeyStyle = normalizeJourneyStyle(trip.journeyStyle, state.trips.indexOf(trip));
    trip.stickers = normalizeTripStickers(trip.stickers);
    trip.stickers.filter(sticker => stickerShouldRender(sticker, trip)).forEach(sticker => {
      visibleStickerIds.add(sticker.id);
      const visibility = effectiveStickerVisibility(sticker, trip);
      const animation = stickerAnimation(sticker);
      // During a stop timeline, mount future stickers once in a hidden state.
      // Revealing them in place avoids reconstructing the other Leaflet markers
      // (and therefore avoids cancelling an animation already in progress).
      const isPendingTimelineCue = isStopTimelineStickerPending(sticker, trip);
      const entranceClass = isPendingTimelineCue
        ? " is-timeline-pending"
        : (timelineTransport.scrubbing || lastVisibleStickerIds.has(sticker.id) ? "" : ` is-${animation.preset}`);
      const size = stickerSizeForView(sticker);
      const bodyStroke = pinStrokeRenderStyle(sticker.pin?.bodyStrokes, sticker.pin?.bodyStrokeColor || "#fff", sticker.pin?.bodyStrokeWidth || 3);
      const graphicStroke = pinStrokeRenderStyle(sticker.pin?.graphicStrokes, sticker.pin?.graphicStrokeColor || "#fff", sticker.pin?.graphicStrokeWidth || 0);
      const previousSize = lastStickerRenderedSizes.get(sticker.id) || size;
      const marker = L.marker([sticker.lat, sticker.lon], {
        pane: "markerPane",
        interactive: true,
        icon: L.divIcon({
          className: "map-sticker-icon",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div class="map-sticker-frame is-object-${escapeHtml(sticker.objectClass || "sticker")}${selectedStickerIds.has(sticker.id) ? " is-selected" : ""}${selectedStickerId === sticker.id ? " is-selection-active" : ""}${stickerGroupForId(sticker.id) ? " is-grouped" : ""}${timelineFocusesSticker(sticker.id) ? " is-timeline-focused" : ""}${visibility === "hover" ? " is-hover-only" : ""}${entranceClass}" style="--sticker-animation-duration:${animation.duration}s;--sticker-animation-opacity:${animation.opacity};--sticker-animation-scale:${animation.scale};--sticker-animation-rotation:${animation.rotation}deg;--object-pin-color:${escapeHtml(sticker.pin?.color || "#1f7a5c")};--pin-stroke-color:${escapeHtml(bodyStroke.color)};--pin-stroke-width:${bodyStroke.width};--pin-body-shadow:${escapeHtml(bodyStroke.shadow)};--pin-graphic-stroke:${escapeHtml(graphicStroke.color)};--pin-graphic-stroke-width:${graphicStroke.width};--pin-graphic-filter:${escapeHtml(graphicStroke.filter)};--pin-graphic-scale:${Number(sticker.pin?.graphicScale) || .62};">${stickerObjectMarkup(sticker)}</div>`
        })
      });
      marker._rvStickerId = sticker.id;
      marker.on("click", event => {
        if (performance.now() < marqueeSuppressClickUntil) return;
        if (performance.now() < Number(marker._rvSuppressClickUntil || 0)) return;
        L.DomEvent.stop(event);
        const clickMediaId = sticker.mediaEvents?.click || (sticker.objectClass !== "null" && ["click", "either"].includes(sticker.activation || "either") ? sticker.mediaId : "");
        if (!isEditorSite() && clickMediaId) {
          if (sticker.mediaEvents?.click) openStickerEventMedia(sticker, "click");
          else {
            const media = findTripMediaRecord?.(clickMediaId)?.item;
            if (media) openJourneyMedia?.(media);
          }
          return;
        }
        selectSticker(sticker.id, { toggle: Boolean(event.originalEvent?.shiftKey), additive: Boolean(event.originalEvent?.shiftKey) });
        renderStickerSelectionControls();
        renderStickers();
      });
      marker.on("contextmenu", event => {
        if (!isEditorSite()) return;
        L.DomEvent.stop(event);
        event.originalEvent?.preventDefault?.();
        event.originalEvent?.stopPropagation?.();
        selectSticker(sticker.id);
        openStickerStylePopup(sticker, event.originalEvent);
      });
      marker.on("mouseover", () => {
        if (performance.now() < marqueeSuppressHoverUntil) return;
        hoveredStickerId = sticker.id;
        if (visibility === "hover" && typeof sfxPlayStickerEvent === "function") sfxPlayStickerEvent(sticker, "hover");
        if (!isEditorSite() && visibility === "hover" && sticker.mediaEvents?.hover) {
          openStickerEventMedia(sticker, "hover");
        }
      });
      marker.on("mouseout", () => { hoveredStickerId = ""; });
      marker.on("add", () => {
        const element = marker.getElement();
        if (element) {
          element.dataset.stickerId = sticker.id;
          element.dataset.stickerLibraryId = sticker.libraryId;
          const frame = element.querySelector(".map-sticker-frame");
          if (frame && animation.preset === "custom" && stopTimelinePlaybackSeconds !== null && !isStopTimelineStickerPending(sticker, trip)) playCustomStickerOnMap(sticker, frame);
          if (frame && previousSize !== size) {
            frame.animate(
              [{ transform: `scale(${previousSize / size})` }, { transform: "scale(1)" }],
              { duration: 260, easing: "cubic-bezier(.2,.75,.25,1)" }
            );
          }
        }
        lastStickerRenderedSizes.set(sticker.id, size);
      });
      bindMapFeaturePointerDrag(marker, {
        onStart: event => {
          // Dragging changes position only. A click selects separately, so a
          // drag or Shift gesture cannot steal the primary selection.
          const members = stickerGroupForId(sticker.id, trip)?.[1] || [sticker.id];
          marker._rvStickerGroupBefore = members.map(id => {
            const item = (trip.stickers || []).find(candidate => candidate.id === id);
            return item ? stickerSnapshot(item) : null;
          }).filter(Boolean);
          marker._rvGroupPreviewLayers = [...stickerGroup.getLayers()]
            .filter(layer => members.includes(layer._rvStickerId) && layer !== marker)
            .map(layer => ({ layer, origin: layer.getLatLng() }));
        },
        onMove: latLng => {
          const before = marker._rvStickerGroupBefore;
          const origin = before?.find(item => item.id === sticker.id) || before?.[0];
          if (!origin) return;
          const deltaLat = latLng.lat - origin.lat;
          const deltaLon = latLng.lng - origin.lon;
          marker._rvGroupPreviewLayers?.forEach(({ layer, origin: memberOrigin }) => {
            layer.setLatLng([memberOrigin.lat + deltaLat, memberOrigin.lng + deltaLon]);
          });
        },
        onEnd: latLng => {
          const before = marker._rvStickerGroupBefore || [stickerSnapshot(sticker)];
          const origin = before.find(item => item.id === sticker.id) || before[0];
          const deltaLat = latLng.lat - origin.lat;
          const deltaLon = latLng.lng - origin.lon;
          before.forEach(snapshot => {
            const item = (trip.stickers || []).find(candidate => candidate.id === snapshot.id);
            if (!item) return;
            item.lat = snapshot.lat + deltaLat;
            item.lon = snapshot.lon + deltaLon;
            recordStickerHistory({ trip, before: snapshot, after: stickerSnapshot(item) });
          });
          marker._rvStickerGroupBefore = null;
          marker._rvGroupPreviewLayers = null;
          saveTrips();
          markProjectDirty("journeys");
          renderStickers();
        }
      });
      stickerGroup.addLayer(marker);
    });
  });
  if (state.playback.active && typeof sfxPlayStickerEvent === "function") {
    const newlyVisible = [...visibleStickerIds].find(id => !lastVisibleStickerIds.has(id));
    const sticker = newlyVisible ? state.trips.flatMap(trip => trip.stickers || []).find(item => item.id === newlyVisible) : null;
    if (sticker) sfxPlayStickerEvent(sticker, "appear");
  }
  lastVisibleStickerIds = visibleStickerIds;
  renderAnnotations();
  renderRouteTimeline();
  if (typeof sfxRenderStickerEditor === "function") sfxRenderStickerEditor();
}

function addStickerAtLibraryItem(item, latLng, pinOverride = null) {
  const trip = activeTrip();
  if (!trip || !item || !latLng) return;
  trip.stickers = normalizeTripStickers(trip.stickers);
  const nearestStop = synchronizeTripStops(trip).reduce((best, stop) => {
    if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return best;
    const distance = map.distance(latLng, L.latLng(stop.lat, stop.lon));
    return !best || distance < best.distance ? { stop, distance } : best;
  }, null)?.stop;
  const defaultSize = normalizeStickerDefaults(trip.stickerDefaults).size;
  const sticker = normalizeSticker({
    libraryId: item.id,
    label: item.label,
    imageUrl: item.url || "",
    objectClass: item.objectClass || "sticker",
    pin: pinOverride || item.pin || undefined,
    lat: latLng.lat,
    lon: latLng.lng,
    size: defaultSize,
    placedZoom: map.getZoom(),
    placedView: currentStickerViewKey(),
    scope: currentStickerViewKey(),
    routeIndex: state.activeRouteIndex,
    sizesByView: { us: defaultSize, journey: defaultSize, route: defaultSize, stop: defaultSize },
    visibility: "inherit",
    // A sticker placed while viewing a stop belongs to the selected day.  Do
    // not infer that from the nearest stop: a sticker can be positioned at
    // any point in the stop view and still be part of that day's story.
    stopId: currentStickerViewKey() === "stop" ? activeJourneyStop()?.id || "" : nearestStop?.id || "",
    dayIso: currentStickerViewKey() === "stop" ? selectedStopDayIso : ""
  });
  trip.stickers.push(sticker);
  recordStickerHistory({ trip, before: null, after: stickerSnapshot(sticker) });
  selectedStickerId = sticker.id;
  saveTrips();
  markProjectDirty("journeys");
  renderStickerSelectionControls();
  renderStickers();
}

let timelinePreviewMarker = null;
let selectedTimelineStickerId = "";
let expandedTimelineGroupIds = new Set();
let lastStickerPlaybackProgress = null;
let selectedStickerKeyframe = null;
let selectedStickerKeyframes = new Set();
let copiedStickerKeyframes = [];
const stickerAnimationTransport = { frameId: 0, running: false, direction: 1, loop: false, startedAt: 0, startProgress: 0 };
let stopTimelinePlaybackSeconds = null;
const timelineTransport = { frameId: 0, scrubRenderFrame: 0, scrubRenderFinal: false, lastTime: 0, startedAt: 0, startProgress: 0, mode: "", progress: 0, direction: 1, running: false, loop: false, speed: 1, scrubbing: false };
const stickerMediaEventIds = new Set();

// Sticker-owned media events deliberately use the same timing coordinates as
// their sticker: route progress for a route, seconds for one selected stop
// day.  This keeps one media object out of every unrelated timeline.
function refreshStickerMediaEventsForTimeline({ mode, previous, next, direction = 1 }) {
  const trip = activeTrip();
  if (!trip || !Number.isFinite(previous) || !Number.isFinite(next) || previous === next) return;
  const stop = mode === "stop" ? activeJourneyStop?.() : null;
  const prefix = `${mode}:`;
  if (next <= 0 && direction >= 0) [...stickerMediaEventIds].filter(id => id.startsWith(prefix)).forEach(id => stickerMediaEventIds.delete(id));
  (trip.stickers || []).forEach(sticker => {
    const inContext = mode === "stop"
      ? sticker.scope === "stop" && sticker.stopId === stop?.id && sticker.dayIso === selectedStopDayIso
      : sticker.scope === "route" && sticker.routeIndex === state.activeRouteIndex;
    if (!inContext) return;
    const cue = mode === "stop" ? Number(sticker.timelineTime) || 0 : Number(sticker.triggerProgress) || 0;
    const eventId = `${mode}:${sticker.id}`;
    const viewStart = Number(sticker.customViewRange?.start);
    const crossedViewStart = mode === "route" && sticker.customViewEnabled && sticker.customView
      && direction >= 0 && previous < viewStart && next >= viewStart;
    if (crossedViewStart) moveToView([sticker.customView.lat, sticker.customView.lon], sticker.customView.zoom, { animate: true, loadingLocationName: "" });
    const crossedForward = direction >= 0 ? previous < cue && next >= cue : false;
    const crossedBackward = direction < 0 ? previous > cue && next <= cue : false;
    if (crossedBackward) { stickerMediaEventIds.delete(eventId); return; }
    if (!crossedForward || stickerMediaEventIds.has(eventId)) return;
    stickerMediaEventIds.add(eventId);
    const trigger = () => {
      if (sticker.objectClass === "null") {
        window.dispatchEvent(new CustomEvent("rv:map-null-trigger", { detail: { sticker, mode } }));
        return;
      }
      const mediaId = sticker.mediaEvents?.appear || (["automatic", "either", "timeline"].includes(sticker.activation || "either") ? sticker.mediaId : "");
      if (!mediaId) return;
      if (sticker.mediaEvents?.appear) openStickerEventMedia(sticker, "appear");
      else {
        const media = findTripMediaRecord?.(mediaId)?.item;
        if (media) openJourneyMedia?.(media);
      }
    };
    const delay = sticker.customViewEnabled && mode === "route" ? Number(sticker.customViewDelay) || 0 : 0;
    if (delay > 0) window.setTimeout(trigger, delay * 1000);
    else trigger();
  });
}

function refreshStickerTriggersForPlayback(progress) {
  const routeIndex = state.activeRouteIndex;
  const previous = lastStickerPlaybackProgress;
  lastStickerPlaybackProgress = progress;
  if (!Number.isFinite(previous) || previous === progress) return;
  const crossed = (activeTrip()?.stickers || []).some(sticker => sticker.routeIndex === routeIndex && (
    state.playback.direction >= 0
      ? previous < sticker.triggerProgress && progress >= sticker.triggerProgress
      : previous > sticker.triggerProgress && progress <= sticker.triggerProgress
  ));
  if (crossed) renderStickers();
}

function stickerAnimation(sticker) {
  return sticker?.animation || { preset: "fade", duration: 0.5, opacity: 1, scale: 1, rotation: 0, keyframes: {} };
}

function previewTimelineTrigger(progress) {
  const route = activeRoute();
  const point = routeProgressPoint(route?.displayPoints || route?.points || [], clamp(progress, 0, 1));
  if (!point) return;
  if (!timelinePreviewMarker) {
    timelinePreviewMarker = L.circleMarker([point.lat, point.lon], { pane: "markerPane", radius: 14, color: readableTextColor(styleColor("route")), weight: 3, fillColor: styleColor("route"), fillOpacity: 0.28, interactive: false }).addTo(map);
  } else timelinePreviewMarker.setLatLng([point.lat, point.lon]);
}

function renderRouteTimeline({ fitRoute = false } = {}) {
  const timeline = els.routeTimeline;
  const trip = activeTrip();
  if (!timeline || !trip) return;
  const selectedStopId = synchronizeTripStops(trip)[selectedStopIndex]?.id || "";
  // A selected stop day is the authoritative stop context. This remains true
  // while route rendering briefly updates selectionScope during a camera move.
  const isStopContext = !state.overviewMode && Boolean(state.selectionScope === "stop" || selectedStopDayIso);
  const isStopDayView = isStopContext && Boolean(selectedStopDayIso);
  const isStopDefaultView = isStopContext && !isStopDayView;
  if (els.routeTimelineTitle) els.routeTimelineTitle.textContent = isStopDayView || isStopDefaultView ? "STOP ANIMATION" : "ROUTE ANIMATION";
  if (els.routeTimelineNote) els.routeTimelineNote.textContent = isStopDayView
    ? "Arrange stickers and media by seconds. Empty time is preserved; the day ends just after its last event."
    : isStopDefaultView
      ? "Choose what a stop day does when it finishes. Individual days can override this default."
      : "Drag a sticker block to choose where it activates on the whole route. Overlapping stickers automatically use another track.";
  if (els.stopTimelineEndActionRow) els.stopTimelineEndActionRow.hidden = !isStopDayView;
  if (els.timelineDefaultEndActionRow) els.timelineDefaultEndActionRow.hidden = !isStopDefaultView;
  const dayContent = isStopDayView ? activeStopDayContent?.() : null;
  if (els.stopTimelineEndAction && isStopDayView) els.stopTimelineEndAction.value = dayContent?.timelineEndAction || "default";
  if (els.timelineDefaultEndAction && isStopDefaultView) els.timelineDefaultEndAction.value = normalizeTimelineDefaults(trip.timelineDefaults).dayEndAction;
  const route = activeRoute();
  timeline.replaceChildren();
  const routeStops = route
    ? [synchronizeTripStops(trip)[state.activeRouteIndex]?.id, synchronizeTripStops(trip)[state.activeRouteIndex + 1]?.id].filter(Boolean)
    : [];
  const stickers = (trip.stickers || []).filter(sticker => isStopDayView
    ? sticker.scope === "stop" && sticker.stopId === selectedStopId && sticker.dayIso === selectedStopDayIso
    : sticker.scope === "route" && sticker.routeIndex === state.activeRouteIndex
  );
  const duration = isStopDayView ? stopTimelineDuration(stickers) : timelineTransportDuration("route");
  const ruler = document.createElement("div");
  ruler.className = "timeline-time-ruler";
  for (let tick = 0; tick <= 4; tick += 1) {
    const label = document.createElement("span");
    label.textContent = `${(duration * tick / 4).toFixed(tick === 0 ? 0 : 1)}s`;
    ruler.append(label);
  }
  timeline.append(ruler);
  const visibleGroups = Object.entries(stickerGroups(trip))
    .map(([id, memberIds]) => [id, stickers.filter(sticker => memberIds.includes(sticker.id))])
    .filter(([, members]) => members.length > 1);
  const groupedIds = new Set(visibleGroups.flatMap(([, members]) => members.map(sticker => sticker.id)));
  const tracks = [];
  stickers.filter(sticker => !groupedIds.has(sticker.id)).forEach(sticker => {
    const progress = isStopDayView ? clamp((Number(sticker.timelineTime) || 0) / duration, 0, 1) : clamp(Number(sticker.triggerProgress) || 0, 0, 1);
    const end = clamp(progress + (isStopDayView ? (Number(sticker.animation?.duration) || 0.5) / duration : 0.11), 0, 1);
    let track = tracks.find(items => items.every(item => progress >= item.end || end <= item.progress));
    if (!track) { track = []; tracks.push(track); }
    track.push({ sticker, progress, end });
  });
  if (!tracks.length && !visibleGroups.length) timeline.innerHTML = '<span class="timeline-empty">Add stickers to create activation blocks.</span>';
  tracks.forEach((items, index) => {
    const row = document.createElement("div"); row.className = "timeline-track";
    const label = document.createElement("span"); label.textContent = index ? `Track ${index + 1}` : "Stickers"; row.append(label);
    const lane = document.createElement("div"); lane.className = "timeline-lane";
    items.forEach(({ sticker, progress }) => {
      if (sticker.customViewEnabled && !isStopDayView) {
        const range = document.createElement("div"); range.className = "timeline-camera-range";
        const bounds = sticker.customViewRange || { start: progress, end: progress };
        range.style.left = `${clamp(Number(bounds.start) || 0, 0, 1) * 100}%`;
        range.style.width = `${Math.max(1, (clamp(Number(bounds.end) || 0, 0, 1) - clamp(Number(bounds.start) || 0, 0, 1)) * 100)}%`;
        range.innerHTML = '<span class="timeline-camera-handle is-start" aria-label="Drag camera view start"></span><span class="timeline-camera-handle is-end" aria-label="Drag camera view end"></span>';
        bindTimelineCameraRange(range, { lane, sticker }); lane.append(range);
      }
      const block = document.createElement("button"); block.type = "button"; block.className = "timeline-sticker-block";
      block.dataset.stickerId = sticker.id;
      block.style.left = `${progress * 100}%`; block.style.width = `${Math.max(5, isStopDayView ? (Number(sticker.animation?.duration) || 0.5) / duration * 100 : 11)}%`; block.classList.toggle("is-selected", selectedTimelineStickerId === sticker.id); block.classList.toggle("is-hovered", timelineHoveredStickerIds.has(sticker.id)); block.innerHTML = `<img src="${escapeHtml(sticker.imageUrl)}" alt=""><span>${escapeHtml(sticker.label)}</span>`;
      bindTimelineStickerBlockDrag(block, { lane, sticker, isStopDayView, duration, progress, route });
      block.addEventListener("click", () => { selectedTimelineStickerId = sticker.id; setTimelineHover([sticker.id]); renderStickerAnimationEditor(); previewTimelineTrigger(sticker.triggerProgress); });
      block.addEventListener("mouseenter", () => setTimelineHover([sticker.id]));
      block.addEventListener("mouseleave", () => setTimelineHover());
      lane.append(block);
    });
    row.append(lane); timeline.append(row);
  });
  visibleGroups.forEach(([groupId, members]) => {
    const positions = members.map(sticker => isStopDayView
      ? clamp((Number(sticker.timelineTime) || 0) / duration, 0, 1)
      : clamp(Number(sticker.triggerProgress) || 0, 0, 1));
    const starts = positions.map((position, index) => position);
    const ends = positions.map((position, index) => isStopDayView
      ? clamp(position + (Number(members[index].animation?.duration) || 0.5) / duration, 0, 1)
      : clamp(position + 0.11, 0, 1));
    const start = Math.min(...starts);
    const end = Math.max(...ends);
    const expanded = expandedTimelineGroupIds.has(groupId);
    const row = document.createElement("div"); row.className = "timeline-track timeline-group-track";
    const label = document.createElement("span"); label.textContent = expanded ? "⌄ Group" : "› Group"; row.append(label);
    const lane = document.createElement("div"); lane.className = "timeline-lane";
    const block = document.createElement("button"); block.type = "button"; block.className = "timeline-group-block";
    block.style.left = `${start * 100}%`; block.style.width = `${Math.max(11, (end - start) * 100 + 11)}%`;
    block.textContent = `${expanded ? "Hide" : "Show"} ${members.length} grouped stickers`;
    block.addEventListener("click", () => {
      if (expandedTimelineGroupIds.has(groupId)) expandedTimelineGroupIds.delete(groupId);
      else expandedTimelineGroupIds.add(groupId);
      renderRouteTimeline();
    });
    block.addEventListener("mouseenter", () => setTimelineHover(members.map(member => member.id)));
    block.addEventListener("mouseleave", () => setTimelineHover());
    lane.append(block); row.append(lane); timeline.append(row);
    if (!expanded) return;
    const childTracks = [];
    members.map((sticker, index) => ({ sticker, index, start: positions[index], end: ends[index] }))
      .sort((first, second) => first.start - second.start)
      .forEach(item => {
        let track = childTracks.find(items => items.every(existing => item.start >= existing.end || item.end <= existing.start));
        if (!track) { track = []; childTracks.push(track); }
        track.push(item);
      });
    childTracks.forEach(items => {
      const child = document.createElement("div"); child.className = "timeline-track timeline-group-child";
      const childLabel = document.createElement("span"); childLabel.textContent = "↳"; child.append(childLabel);
      const childLane = document.createElement("div"); childLane.className = "timeline-lane";
      items.forEach(({ sticker, index }) => {
        const childBlock = document.createElement("button"); childBlock.type = "button"; childBlock.className = "timeline-sticker-block";
        childBlock.dataset.stickerId = sticker.id;
        childBlock.style.left = `${positions[index] * 100}%`; childBlock.style.width = `${Math.max(5, isStopDayView ? (Number(sticker.animation?.duration) || 0.5) / duration * 100 : 11)}%`; childBlock.classList.toggle("is-selected", selectedTimelineStickerId === sticker.id); childBlock.classList.toggle("is-hovered", timelineHoveredStickerIds.has(sticker.id));
        childBlock.innerHTML = `<img src="${escapeHtml(sticker.imageUrl)}" alt=""><span>${escapeHtml(sticker.label)}</span>`;
        bindTimelineStickerBlockDrag(childBlock, { lane: childLane, sticker, isStopDayView, duration, progress: positions[index], route });
        childBlock.addEventListener("click", () => { selectedTimelineStickerId = sticker.id; setTimelineHover([sticker.id]); renderStickerAnimationEditor(); });
        childBlock.addEventListener("mouseenter", () => setTimelineHover([sticker.id]));
        childBlock.addEventListener("mouseleave", () => setTimelineHover());
        childLane.append(childBlock);
      });
      child.append(childLane); timeline.append(child);
    });
  });
  if (fitRoute && route?.displayPoints?.length) moveToBounds(routeLatLngBounds(route), { animate: true, padding: [64, 64] });
  appendTimelinePlayhead(timeline, isStopDayView ? "stop" : "route");
  updateTimelineTransportUi(isStopDayView ? "stop" : "route");
  renderStickerAnimationEditor();
}

function stopTimelineDuration(stickers = []) {
  return Math.max(5, ...stickers.map(sticker => (Number(sticker.timelineTime) || 0) + (Number(sticker.animation?.duration) || 0.5) + 0.5));
}

function bindTimelineStickerBlockDrag(block, { lane, sticker, isStopDayView, duration, progress, route }) {
  block.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    if (!isStopDayView && route?.displayPoints?.length) moveToBounds(routeLatLngBounds(route), { animate: true, padding: [64, 64] });
    selectedTimelineStickerId = sticker.id;
    setTimelineHover([sticker.id]);
    if (!isStopDayView) previewTimelineTrigger(progress);
    const before = stickerSnapshot(sticker);
    const bounds = lane.getBoundingClientRect();
    const update = move => {
      const next = clamp((move.clientX - bounds.left) / bounds.width, 0, 1);
      if (isStopDayView) sticker.timelineTime = next * duration;
      else {
        sticker.triggerProgress = next;
        if (sticker.customViewEnabled) {
          sticker.customViewRange ||= { start: next, end: next };
          if (next < sticker.customViewRange.start) sticker.customViewRange.start = next;
          if (next > sticker.customViewRange.end) sticker.customViewRange.end = next;
        }
      }
      block.style.left = `${next * 100}%`;
      if (!isStopDayView) previewTimelineTrigger(next);
    };
    const finish = () => {
      document.removeEventListener("pointermove", update);
      recordStickerHistory({ before, after: stickerSnapshot(sticker) });
      saveTrips(); markProjectDirty("journeys"); renderStickers();
    };
    document.addEventListener("pointermove", update);
    document.addEventListener("pointerup", finish, { once: true });
  });
}

function bindTimelineCameraRange(range, { lane, sticker }) {
  range.addEventListener("pointerdown", event => {
    const handle = event.target.closest(".timeline-camera-handle");
    if (!handle) return;
    event.preventDefault(); event.stopPropagation();
    const edge = handle.classList.contains("is-start") ? "start" : "end";
    const bounds = lane.getBoundingClientRect();
    const update = move => {
      const value = clamp((move.clientX - bounds.left) / bounds.width, 0, 1);
      sticker.customViewRange ||= { start: Number(sticker.triggerProgress) || 0, end: Number(sticker.triggerProgress) || 0 };
      if (edge === "start") sticker.customViewRange.start = Math.min(value, sticker.customViewRange.end - .005);
      else sticker.customViewRange.end = Math.max(value, sticker.customViewRange.start + .005);
      range.style.left = `${sticker.customViewRange.start * 100}%`;
      range.style.width = `${Math.max(1, (sticker.customViewRange.end - sticker.customViewRange.start) * 100)}%`;
    };
    const done = () => { document.removeEventListener("pointermove", update); saveTrips(); markProjectDirty("journeys"); renderRouteTimeline(); };
    document.addEventListener("pointermove", update); document.addEventListener("pointerup", done, { once: true });
  });
}

function activeStopTimelineStickers() {
  const stop = activeJourneyStop();
  return (activeTrip()?.stickers || []).filter(sticker => sticker.scope === "stop" && sticker.stopId === stop?.id && sticker.dayIso === selectedStopDayIso);
}

function isStopTimelineStickerPending(sticker, trip = activeTrip()) {
  if (stopTimelinePlaybackSeconds === null || !sticker || sticker.scope !== "stop") return false;
  const stopId = synchronizeTripStops(trip)[selectedStopIndex]?.id || "";
  return sticker.stopId === stopId
    && sticker.dayIso === selectedStopDayIso
    && stopTimelinePlaybackSeconds < (Number(sticker.timelineTime) || 0);
}

function revealStopTimelineCues(previousSeconds, nextSeconds) {
  if (!Number.isFinite(previousSeconds) || nextSeconds < previousSeconds) return;
  activeStopTimelineStickers().forEach(sticker => {
    const cue = Number(sticker.timelineTime) || 0;
    if (!(cue > previousSeconds && cue <= nextSeconds)) return;
    const frame = document.querySelector(`.map-sticker-icon[data-sticker-id="${CSS.escape(sticker.id)}"] .map-sticker-frame`);
    if (!frame) return;
    const animation = stickerAnimation(sticker);
    frame.classList.remove("is-timeline-pending", "is-fade", "is-bounce", "is-drop", "is-pop");
    // Restart only this sticker's entrance animation; existing stickers keep
    // their DOM and continue their configured durations uninterrupted.
    void frame.offsetWidth;
    frame.classList.add(`is-${animation.preset}`);
    if (animation.preset === "custom") playCustomStickerOnMap(sticker, frame);
    lastVisibleStickerIds.add(sticker.id);
  });
}

function playCustomStickerOnMap(sticker, frame) {
  const animation = stickerAnimation(sticker);
  const startedAt = performance.now();
  const duration = Math.max(.1, Number(animation.duration) || .5) * 1000;
  const loop = animation.loopMode === "view" || animation.loopMode === "timeline";
  const draw = now => {
    const elapsed = now - startedAt;
    const progress = clamp((elapsed % duration) / duration, 0, 1);
    const values = stickerPreviewFrameAt(animation, progress);
    const mapPathOffset = customStickerPathOffset(animation.customPath, progress);
    frame.style.opacity = String(values.opacity);
    frame.style.transform = `translate(${values.x + mapPathOffset.x}px, ${values.y + mapPathOffset.y}px) rotate(${values.rotation}deg) scale(${values.scaleX || values.scale}, ${values.scaleY || values.scale})`;
    if (!loop && elapsed >= duration) return;
    if (!frame.isConnected) return;
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

function reverseStopTimelineCues(previousSeconds, nextSeconds) {
  if (!Number.isFinite(previousSeconds) || nextSeconds > previousSeconds) return;
  activeStopTimelineStickers().forEach(sticker => {
    const cue = Number(sticker.timelineTime) || 0;
    const duration = Number(sticker.animation?.duration) || 0.5;
    const end = cue + duration;
    const frame = document.querySelector(`.map-sticker-icon[data-sticker-id="${CSS.escape(sticker.id)}"] .map-sticker-frame`);
    if (!frame) return;
    if (previousSeconds >= end && nextSeconds < end) {
      const animation = stickerAnimation(sticker);
      frame.classList.remove("is-timeline-pending", "is-timeline-reversing", "is-fade", "is-bounce", "is-drop", "is-pop");
      frame.style.setProperty("--timeline-reverse-duration", `${duration / timelineTransport.speed}s`);
      void frame.offsetWidth;
      frame.classList.add(`is-${animation.preset}`, "is-timeline-reversing");
    }
    if (previousSeconds > cue && nextSeconds <= cue) {
      frame.classList.add("is-timeline-pending");
      frame.classList.remove("is-timeline-reversing");
    }
  });
}

function playStopTimeline() {
  playTimelineTransport(1);
}

function renderStickerAnimationEditor() {
  const trip = activeTrip(); if (!trip || !els.stickerAnimationTarget) return;
  const stickers = trip.stickers || [];
  if (selectedTimelineStickerId && !stickers.some(sticker => sticker.id === selectedTimelineStickerId)) selectedTimelineStickerId = "";
  els.stickerAnimationTarget.replaceChildren(...stickers.map(sticker => new Option(sticker.label, sticker.id, false, sticker.id === selectedTimelineStickerId)));
  const sticker = stickers.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  const animation = stickerAnimation(sticker);
  if (els.deleteStickerKeyframe) els.deleteStickerKeyframe.disabled = !selectedStickerKeyframes.size;
  const playhead = clamp(Number(els.stickerAnimationPlayhead?.value) || 0, 0, 1);
  const frameCount = stickerAnimationFrameCount(animation);
  if (els.stickerAnimationFrame) { els.stickerAnimationFrame.max = String(frameCount); els.stickerAnimationFrame.value = String(Math.round(playhead * frameCount)); }
  if (els.stickerAnimationFrameCount) els.stickerAnimationFrameCount.value = String(frameCount);
  const frameValues = stickerAnimationFrameAt(animation, playhead);
  els.stickerAnimationPreset.value = animation.preset; els.stickerAnimationDuration.value = animation.duration; els.stickerAnimationOpacity.value = frameValues.opacity; els.stickerAnimationScale.value = animation.splitScale ? frameValues.scaleX : frameValues.scale; els.stickerAnimationRotation.value = frameValues.rotation;
  if (els.stickerAnimationScaleY) els.stickerAnimationScaleY.value = String(frameValues.scaleY);
  if (els.stickerAnimationPositionX) els.stickerAnimationPositionX.value = String(frameValues.positionX);
  if (els.stickerAnimationPositionY) els.stickerAnimationPositionY.value = String(frameValues.positionY);
  if (els.stickerAnimationScaleXText) els.stickerAnimationScaleXText.value = String(frameValues.scaleX);
  if (els.stickerAnimationScaleYText) els.stickerAnimationScaleYText.value = String(frameValues.scaleY);
  if (els.stickerAnimationPositionXText) els.stickerAnimationPositionXText.value = String(frameValues.positionX);
  if (els.stickerAnimationPositionYText) els.stickerAnimationPositionYText.value = String(frameValues.positionY);
  if (els.stickerAnimationUniformScale) els.stickerAnimationUniformScale.checked = animation.uniformScale !== false;
  if (els.stickerAnimationPlayheadValue) els.stickerAnimationPlayheadValue.textContent = `${Math.round(playhead * 100)}% · ${(playhead * Number(animation.duration || 0.5)).toFixed(1)}s`;
  const selectedFrame = selectedStickerKeyframe?.frame;
  if (els.stickerKeyframeEditor) els.stickerKeyframeEditor.hidden = !selectedFrame;
  if (selectedFrame) {
    if (els.stickerKeyframeEasing) els.stickerKeyframeEasing.value = selectedFrame.easing || "linear";
    if (els.stickerKeyframeIntensity) els.stickerKeyframeIntensity.value = String(selectedFrame.intensity || 1);
    if (els.stickerKeyframeIntensityValue) els.stickerKeyframeIntensityValue.textContent = `${Math.round((selectedFrame.intensity || 1) * 100)}%`;
  }
  const isPositionFrame = Boolean(selectedStickerKeyframe && /^position/.test(selectedStickerKeyframe.property));
  if (els.stickerPositionPathModeRow) els.stickerPositionPathModeRow.hidden = !isPositionFrame;
  if (els.stickerPositionPathFrequencyRow) els.stickerPositionPathFrequencyRow.hidden = !isPositionFrame || !["zig-zag", "wavy"].includes(selectedFrame?.pathMode);
  if (isPositionFrame) {
    if (els.stickerPositionPathMode) els.stickerPositionPathMode.value = selectedFrame.pathMode || "straight";
    if (els.stickerPositionPathFrequency) els.stickerPositionPathFrequency.value = String(selectedFrame.pathFrequency || 2);
    if (els.stickerPositionPathFrequencyValue) els.stickerPositionPathFrequencyValue.textContent = String(selectedFrame.pathFrequency || 2);
  }
  els.stickerAnimationDurationValue.textContent = `${Number(animation.duration).toFixed(1)}s`; els.stickerAnimationOpacityValue.textContent = `${Math.round(animation.opacity * 100)}%`; els.stickerAnimationScaleValue.textContent = `${Math.round(animation.scale * 100)}%`; els.stickerAnimationRotationValue.textContent = `${animation.rotation}°`;
  const preview = stickerPreviewFrameAt(animation, playhead);
  if (els.stickerAnimationPreview) els.stickerAnimationPreview.innerHTML = `<img style="--preview-opacity:${preview.opacity};--preview-scale:${preview.scale};--preview-rotation:${preview.rotation}deg;--preview-x:${preview.x}px;--preview-y:${preview.y}px" src="${escapeHtml(sticker.imageUrl)}" alt="${escapeHtml(sticker.label)}">`;
  renderStickerKeyframeTracks(sticker);
  renderSupplementalStickerKeyframeTracks(sticker);
}

function renderSupplementalStickerKeyframeTracks(sticker) {
  const tracks = els.stickerKeyframeTracks; if (!tracks) return;
  const animation = stickerAnimation(sticker);
  const placeTransformControl = (control, order, column) => {
    const row = control?.closest("label"); if (!row) return;
    row.style.order = String(order); row.style.gridColumn = String(column); row.style.display = "grid";
  };
  placeTransformControl(els.stickerAnimationScale, 5, "1");
  placeTransformControl(els.stickerAnimationScaleY, 6, "2");
  placeTransformControl(els.stickerAnimationPositionX, 8, "1");
  placeTransformControl(els.stickerAnimationPositionY, 9, "2");
  if (els.stickerAnimationScale?.closest("label")?.querySelector("span")) els.stickerAnimationScale.closest("label").querySelector("span").textContent = "Scale X";
  if (els.stickerAnimationPositionXLabel) els.stickerAnimationPositionXLabel.textContent = "Position X";
  if (els.stickerAnimationLoopMode) els.stickerAnimationLoopMode.value = animation.loopMode || "none";
  if (els.stickerAnimationLoopDelay) els.stickerAnimationLoopDelay.value = String(animation.loopDelay || 0);
  if (els.stickerAnimationLoopDelayValue) els.stickerAnimationLoopDelayValue.textContent = `${Number(animation.loopDelay || 0).toFixed(1)}s`;
  const properties = [
    ...(animation.splitScale ? [["scaleY", "Scale Y"]] : []),
    ["positionX", animation.splitPosition ? "Position X" : "Position"],
    ...(animation.splitPosition ? [["positionY", "Position Y"]] : [])
  ];
  properties.forEach(([property, label]) => {
    const row = document.createElement("div"); row.className = "sticker-keyframe-track";
    row.innerHTML = `<span aria-hidden="true">↗</span><strong>${label}</strong><div class="keyframe-lane"></div>`;
    const lane = row.querySelector(".keyframe-lane");
    lane.style.setProperty("--keyframe-playhead", `${clamp(Number(els.stickerAnimationPlayhead?.value) || 0, 0, 1) * 100}%`);
    (animation.keyframes?.[property] || []).forEach(frame => {
      const key = document.createElement("button"); key.type = "button"; key.className = "sticker-keyframe"; key.style.left = `${frame.time * 100}%`; key._rvFrame = frame;
      key.classList.toggle("is-selected", selectedStickerKeyframes.has(frame));
      key.addEventListener("click", () => { selectedStickerKeyframe = { property, frame }; selectedStickerKeyframes = new Set([frame]); renderStickerAnimationEditor(); });
      key.addEventListener("pointerdown", event => {
        event.preventDefault(); event.stopPropagation(); const bounds = lane.getBoundingClientRect();
        const move = next => { frame.time = clamp((next.clientX - bounds.left) / bounds.width, 0, 1); key.style.left = `${frame.time * 100}%`; };
        const done = () => { document.removeEventListener("pointermove", move); saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor(); };
        document.addEventListener("pointermove", move); document.addEventListener("pointerup", done, { once: true });
      });
      lane.append(key);
    });
    tracks.append(row);
  });
}

function playStickerAnimationPreview(direction = 1) {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId);
  if (!sticker || !els.stickerAnimationPlayhead) return;
  cancelAnimationFrame(stickerAnimationTransport.frameId);
  stickerAnimationTransport.direction = direction < 0 ? -1 : 1;
  stickerAnimationTransport.loop ||= (stickerAnimation(sticker).loopMode || "none") !== "none";
  stickerAnimationTransport.running = true;
  stickerAnimationTransport.startedAt = performance.now();
  stickerAnimationTransport.startProgress = Number(els.stickerAnimationPlayhead.value) || 0;
  const animation = stickerAnimation(sticker);
  const seamlessEnd = stickerAnimationLoopsSeamlessly(animation)
    ? 1 - 1 / stickerAnimationFrameCount(animation)
    : 1;
  const tick = now => {
    const duration = Math.max(.1, Number(animation.duration) || .5);
    let next = stickerAnimationTransport.startProgress + stickerAnimationTransport.direction * (now - stickerAnimationTransport.startedAt) / (duration * 1000);
    const edge = stickerAnimationTransport.direction > 0 ? seamlessEnd : 0;
    if ((stickerAnimationTransport.direction > 0 && next >= edge) || (stickerAnimationTransport.direction < 0 && next <= edge)) {
      next = edge;
      els.stickerAnimationPlayhead.value = String(next); renderStickerAnimationEditor();
      if (!stickerAnimationTransport.loop) { stickerAnimationTransport.running = false; return; }
      const delay = clamp(Number(animation.loopDelay) || 0, 0, 5) * 1000;
      if (delay) { stickerAnimationTransport.running = false; window.setTimeout(() => playStickerAnimationPreview(stickerAnimationTransport.direction), delay); return; }
      stickerAnimationTransport.startedAt = now; stickerAnimationTransport.startProgress = stickerAnimationTransport.direction > 0 ? 0 : seamlessEnd;
    } else { els.stickerAnimationPlayhead.value = String(next); renderStickerAnimationEditor(); }
    stickerAnimationTransport.frameId = requestAnimationFrame(tick);
  };
  stickerAnimationTransport.frameId = requestAnimationFrame(tick);
}

function updateSelectedStickerAnimation(property = "") {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId) || selectedStickerRecord(); if (!sticker) return;
  const animation = stickerAnimation(sticker);
  if (els.stickerAnimationSplitScale) els.stickerAnimationSplitScale.checked = Boolean(animation.splitScale);
  if (els.stickerAnimationSplitPosition) els.stickerAnimationSplitPosition.checked = Boolean(animation.splitPosition);
  if (els.stickerAnimationScaleYRow) els.stickerAnimationScaleYRow.hidden = !animation.splitScale;
  if (els.stickerAnimationScaleY) els.stickerAnimationScaleY.value = String(animation.scaleY ?? animation.scale);
  if (els.stickerAnimationPositionY?.closest("label")) els.stickerAnimationPositionY.closest("label").hidden = !animation.splitPosition;
  if (els.stickerAnimationPositionXLabel) els.stickerAnimationPositionXLabel.textContent = animation.splitPosition ? "Position X" : "Position";
  if (els.stickerAnimationSplitScale) els.stickerAnimationSplitScale.checked = Boolean(animation.splitScale);
  if (els.stickerAnimationSplitPosition) els.stickerAnimationSplitPosition.checked = Boolean(animation.splitPosition);
  if (property) {
    animation.keyframes ||= {}; animation.keyframes[property] ||= [];
    const time = clamp(Number(els.stickerAnimationPlayhead?.value) || 0, 0, 1);
    const value = Number(els[`stickerAnimation${property[0].toUpperCase()}${property.slice(1)}`]?.value) || 0;
    let frame = animation.keyframes[property].find(item => Math.abs(item.time - time) < 0.005);
    if (!frame) {
      frame = { time, value, easing: "ease", intensity: 1 };
      animation.keyframes[property].push(frame);
    } else frame.value = value;
    selectedStickerKeyframe = { property, frame };
    selectedStickerKeyframes = new Set([frame]);
  } else if (selectedStickerKeyframe?.frame) {
    selectedStickerKeyframe.frame.value = Number(els[`stickerAnimation${selectedStickerKeyframe.property[0].toUpperCase()}${selectedStickerKeyframe.property.slice(1)}`]?.value) || 0;
  }
  sticker.animation = { ...animation, preset: els.stickerAnimationPreset.value, duration: Number(els.stickerAnimationDuration.value), opacity: Number(els.stickerAnimationOpacity.value), scale: Number(els.stickerAnimationScale.value), rotation: Number(els.stickerAnimationRotation.value) };
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
}

function renderStickerKeyframeTracks(sticker) {
  const tracks = els.stickerKeyframeTracks; if (!tracks) return;
  tracks.replaceChildren();
  const animation = stickerAnimation(sticker);
  [["opacity", "◐"], ["scale", "⤢"], ["rotation", "↻"]].forEach(([property, icon]) => {
    const row = document.createElement("div"); row.className = "sticker-keyframe-track";
    row.innerHTML = `<span title="${property}">${icon}</span><strong>${property}</strong><div class="keyframe-lane"></div>`;
    const lane = row.querySelector(".keyframe-lane");
    lane.style.setProperty("--keyframe-playhead", `${clamp(Number(els.stickerAnimationPlayhead?.value) || 0, 0, 1) * 100}%`);
    (animation.keyframes?.[property] || []).forEach(frame => {
      const key = document.createElement("button"); key.type = "button"; key.className = "sticker-keyframe"; key.style.left = `${frame.time * 100}%`; key.title = `${property}: ${frame.value} (${frame.easing || "linear"})`; key._rvFrame = frame;
      key.classList.toggle("is-selected", selectedStickerKeyframes.has(frame));
      key.addEventListener("click", event => {
        event.stopPropagation();
        if (event.shiftKey) { if (selectedStickerKeyframes.has(frame)) selectedStickerKeyframes.delete(frame); else selectedStickerKeyframes.add(frame); }
        else selectedStickerKeyframes = new Set([frame]);
        selectedStickerKeyframe = { property, frame };
        if (property === "opacity") els.stickerAnimationOpacity.value = frame.value;
        if (property === "scale") els.stickerAnimationScale.value = frame.value;
        if (property === "rotation") els.stickerAnimationRotation.value = frame.value;
        renderStickerAnimationEditor();
      });
      key.addEventListener("pointerdown", event => {
        selectedStickerKeyframe = { property, frame };
        if (!event.shiftKey && !selectedStickerKeyframes.has(frame)) selectedStickerKeyframes = new Set([frame]);
        const bounds = lane.getBoundingClientRect(); const move = next => { frame.time = clamp((next.clientX - bounds.left) / bounds.width, 0, 1); key.style.left = `${frame.time * 100}%`; };
        const done = () => { document.removeEventListener("pointermove", move); saveTrips(); markProjectDirty("journeys"); renderStickerKeyframeTracks(sticker); };
        document.addEventListener("pointermove", move); document.addEventListener("pointerup", done, { once: true }); event.preventDefault();
      });
      key.addEventListener("contextmenu", event => {
        event.preventDefault(); event.stopPropagation(); selectedStickerKeyframe = { property, frame }; selectedStickerKeyframes = new Set([frame]);
        document.querySelector(".keyframe-type-menu")?.remove();
        const menu = document.createElement("div"); menu.className = "keyframe-type-menu";
        ["linear", "ease", "ease-in", "ease-out", "hold", "bounce"].forEach(type => { const option = document.createElement("button"); option.type = "button"; option.textContent = type.replace(/(^|-)([a-z])/g, (_, dash, letter) => `${dash ? " " : ""}${letter.toUpperCase()}`); option.classList.toggle("is-active", (frame.easing || "linear") === type); option.addEventListener("click", () => { frame.easing = type; menu.remove(); saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor(); }); menu.append(option); });
        menu.style.left = `${event.clientX}px`; menu.style.top = `${event.clientY}px`; document.body.append(menu);
        window.setTimeout(() => document.addEventListener("pointerdown", () => menu.remove(), { once: true }), 0);
      });
      lane.append(key);
    });
    lane.addEventListener("pointerdown", event => {
      if (event.target !== lane) return;
      const bounds = lane.getBoundingClientRect(); const start = event.clientX; const marquee = document.createElement("span"); marquee.className = "keyframe-marquee"; lane.append(marquee);
      const paint = move => { marquee.style.left = `${Math.min(start, move.clientX) - bounds.left}px`; marquee.style.width = `${Math.abs(move.clientX - start)}px`; };
      const done = move => { document.removeEventListener("pointermove", paint); marquee.remove(); if (Math.abs(move.clientX - start) < 5) { if (els.stickerAnimationPlayhead) els.stickerAnimationPlayhead.value = String(clamp((move.clientX - bounds.left) / bounds.width, 0, 1)); selectedStickerKeyframe = null; selectedStickerKeyframes.clear(); renderStickerAnimationEditor(); return; } if (!event.shiftKey) selectedStickerKeyframes.clear(); const min = Math.min(start, move.clientX), max = Math.max(start, move.clientX); lane.querySelectorAll(".sticker-keyframe").forEach(button => { const rect = button.getBoundingClientRect(); if (rect.left + rect.width / 2 >= min && rect.left + rect.width / 2 <= max) selectedStickerKeyframes.add(button._rvFrame); }); const selected = [...selectedStickerKeyframes].at(-1); if (selected) selectedStickerKeyframe = { property, frame: selected }; renderStickerAnimationEditor(); };
      document.addEventListener("pointermove", paint); document.addEventListener("pointerup", done, { once: true }); event.preventDefault();
    });
    tracks.append(row);
  });
}

function addStickerKeyframe(property) {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId) || selectedStickerRecord(); if (!sticker) return;
  const before = stickerSnapshot(sticker);
  const animation = stickerAnimation(sticker); animation.keyframes ||= {}; animation.keyframes[property] ||= [];
  const time = clamp(Number(els.stickerAnimationPlayhead?.value) || 0, 0, 1);
  const value = Number(els[`stickerAnimation${property[0].toUpperCase()}${property.slice(1)}`]?.value) || 0;
  const frame = animation.keyframes[property].find(item => Math.abs(item.time - time) < 0.005) || { time, value, easing: "ease", intensity: 1 };
  if (!animation.keyframes[property].includes(frame)) animation.keyframes[property].push(frame);
  else frame.value = value;
  selectedStickerKeyframe = { property, frame }; selectedStickerKeyframes = new Set([frame]);
  sticker.animation = animation;
  recordStickerHistory({ before, after: stickerSnapshot(sticker) });
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor(); renderRouteTimeline();
}

function deleteSelectedStickerKeyframe() {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId) || selectedStickerRecord();
  if (!sticker || !selectedStickerKeyframes.size) return;
  const before = stickerSnapshot(sticker);
  Object.values(stickerAnimation(sticker).keyframes || {}).forEach(frames => frames && frames.splice(0, frames.length, ...frames.filter(frame => !selectedStickerKeyframes.has(frame))));
  selectedStickerKeyframe = null; selectedStickerKeyframes.clear();
  recordStickerHistory({ before, after: stickerSnapshot(sticker) });
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor(); renderRouteTimeline();
}

function selectedStickerKeyframeRecords(sticker) {
  const animation = stickerAnimation(sticker);
  return Object.entries(animation.keyframes || {}).flatMap(([property, frames]) => (frames || []).filter(frame => selectedStickerKeyframes.has(frame)).map(frame => ({ property, frame })));
}

function copySelectedStickerKeyframes() {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  copiedStickerKeyframes = selectedStickerKeyframeRecords(sticker).map(({ property, frame }) => ({ property, frame: structuredClone(frame) }));
  if (els.status) els.status.textContent = copiedStickerKeyframes.length ? `Copied ${copiedStickerKeyframes.length} keyframe${copiedStickerKeyframes.length === 1 ? "" : "s"}.` : "Select keyframes to copy.";
}

function pasteStickerKeyframes() {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker || !copiedStickerKeyframes.length) return;
  const before = stickerSnapshot(sticker); const animation = stickerAnimation(sticker);
  const base = Math.min(...copiedStickerKeyframes.map(item => item.frame.time));
  const target = clamp(Number(els.stickerAnimationPlayhead?.value) || 0, 0, 1);
  animation.keyframes ||= {}; selectedStickerKeyframes.clear();
  copiedStickerKeyframes.forEach(({ property, frame }) => {
    animation.keyframes[property] ||= [];
    const time = clamp(target + frame.time - base, 0, 1);
    const copy = { ...structuredClone(frame), time };
    const existing = animation.keyframes[property].find(item => Math.abs(item.time - time) < .005);
    if (existing) Object.assign(existing, copy), selectedStickerKeyframes.add(existing);
    else animation.keyframes[property].push(copy), selectedStickerKeyframes.add(copy);
  });
  sticker.animation = animation; selectedStickerKeyframe = selectedStickerKeyframeRecords(sticker).at(-1) || null;
  recordStickerHistory({ before, after: stickerSnapshot(sticker) }); saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
}

function currentMapViewRecord() {
  const center = map.getCenter();
  return normalizeSavedMapView({ lat: center.lat, lon: center.lng, zoom: map.getZoom() });
}

function activeJourneyViewportCorners(device = userDevicePreviewMode) {
  return normalizeJourneyViewportCorners(activeTrip()?.viewportBoundsByDevice?.[device]);
}

function journeyViewportCornersFromElement(element = els.editorPreviewGuideViewport) {
  // The white guide on non-UI editor tabs is the sole geographic authority.
  // The UI canvas is deliberately excluded: it edits widget geometry only.
  const source = element;
  const mapRect = map?.getContainer?.()?.getBoundingClientRect?.();
  const viewportRect = source?.getBoundingClientRect?.();
  if (!map || !mapRect || !viewportRect || viewportRect.width < 2 || viewportRect.height < 2) return null;
  const at = (x, y) => {
    const point = map.containerPointToLatLng([x - mapRect.left, y - mapRect.top]);
    return { lat: point.lat, lon: point.lng };
  };
  return normalizeJourneyViewportCorners({
    northWest: at(viewportRect.left, viewportRect.top),
    northEast: at(viewportRect.right, viewportRect.top),
    southEast: at(viewportRect.right, viewportRect.bottom),
    southWest: at(viewportRect.left, viewportRect.bottom)
  });
}

function journeyViewportLeafletBounds(corners) {
  const normalized = normalizeJourneyViewportCorners(corners);
  if (!normalized || !globalThis.L) return null;
  // All four saved GPS corners participate in the public viewport bounds.
  // Leaflet's north-up camera reduces them to a rectangular extent internally.
  return L.latLngBounds(Object.values(normalized).map(corner => [corner.lat, corner.lon]));
}

function saveActiveJourneyViewportForDevice(device = userDevicePreviewMode, element = els.editorPreviewGuideViewport) {
  const trip = activeTrip();
  const corners = journeyViewportCornersFromElement(element);
  if (!trip || !corners) return false;
  trip.viewportBoundsByDevice ||= {};
  trip.viewportBoundsByDevice[device] = corners;
  saveTrips();
  markProjectDirty("journeys");
  return true;
}

function updateSetMapViewState() {
  const button = els.setMapView;
  if (!button || !map) return;
  const saved = normalizeSavedMapView(currentSavedViewTarget()?.get?.());
  const current = currentMapViewRecord();
  const savedPoint = saved && map.project([saved.lat, saved.lon], current.zoom);
  const currentPoint = map.project([current.lat, current.lon], current.zoom);
  const matches = Boolean(saved && Math.abs(saved.zoom - current.zoom) < 0.01 && savedPoint.distanceTo(currentPoint) < 1.5);
  button.classList.toggle("is-saved-view", matches);
  const customSticker = selectedStickerRecord?.();
  const isCustomStickerView = Boolean(customSticker?.customViewEnabled);
  button.classList.toggle("is-custom-sticker-view", isCustomStickerView);
  button.textContent = isCustomStickerView ? "Set sticker view" : "Set view";
  button.setAttribute("aria-pressed", String(matches));
  button.title = matches ? "Current camera is saved for this view" : `Save this camera position for the ${isCustomStickerView ? "selected sticker" : "current view"}`;
}

function currentSavedViewTarget() {
  const selectedSticker = selectedStickerRecord?.();
  if (!state.contiguousUsMode && selectedSticker?.customViewEnabled) return {
    label: `${selectedSticker.label || "Sticker"} custom view`,
    get: () => selectedSticker.customView,
    set: value => { selectedSticker.customView = value; }
  };
  if (state.contiguousUsMode) return { label: "US view", get: () => savedUsMapView, set: value => {
    savedUsMapView = value;
    rvStorageWriteJson(US_VIEW_STORAGE_KEY, value);
  } };
  if (state.overviewMode && state.overviewFocusIndex === null) return { label: `${activeTrip()?.name || terminologyValue("journey")} view`, get: () => activeTrip()?.savedView, set: value => { activeTrip().savedView = value; } };
  if (state.overviewMode && Number.isInteger(state.overviewFocusIndex)) return { label: `${terminologyValue("route")} view`, get: () => state.routes[state.overviewFocusIndex]?.savedView, set: value => { state.routes[state.overviewFocusIndex].savedView = value; } };
  if (state.selectionScope === "route") return { label: `${terminologyValue("route")} view`, get: () => activeRoute()?.savedView, set: value => { if (activeRoute()) activeRoute().savedView = value; } };
  const stop = synchronizeTripStops(activeTrip())[selectedStopIndex];
  return { label: `${stop?.name || terminologyValue("stop")} view`, get: () => stop?.savedView, set: value => { if (stop) stop.savedView = value; } };
}

function restoreSavedCurrentView({ animate = true } = {}) {
  const target = currentSavedViewTarget();
  const view = normalizeSavedMapView(target?.get?.());
  if (!view) return false;
  moveToView([view.lat, view.lon], view.zoom, { animate, loadingLocationName: "" });
  return true;
}

els.terminologyControls.forEach(input => {
  const updateTerminology = () => {
    const key = input.dataset.terminologyKey;
    const value = input.value.trim();
    terminologyState[key] = value || DEFAULT_TERMINOLOGY[key];
    rvStorageWriteJson(TERMINOLOGY_STORAGE_KEY, terminologyState);
    applyTerminology();
    renderTripManager();
    updateUsViewButton();
    markProjectDirty("ui");
  };
  input.addEventListener("input", updateTerminology);
  input.addEventListener("change", updateTerminology);
  input.addEventListener("blur", updateTerminology);
});

els.journeyStyleTarget?.addEventListener("change", renderJourneyStyleControls);
[els.journeyStyleColor, els.journeyStyleOutlineColor, els.journeyStyleOutlineWidth, els.journeyStyleOutlineOpacity, els.journeyStyleRouteLabelVisibility, els.journeyStyleRouteLabelContent, ...els.journeyUsFeatures].forEach(input => {
  input?.addEventListener("input", updateJourneyStyleFromControls);
  input?.addEventListener("change", updateJourneyStyleFromControls);
});
els.journeyStyleUsWidth?.addEventListener("input", updateUsJourneyRouteWidth);
els.journeyStyleUsWidth?.addEventListener("change", updateUsJourneyRouteWidth);

els.setMapView?.addEventListener("click", () => {
  const target = currentSavedViewTarget();
  const view = currentMapViewRecord();
  target?.set?.(view);
  // A saved view is also a composition checkpoint. Rebase editable marker,
  // landmark, label, and route-animation offsets to this zoom so returning
  // here recreates the arrangement the editor just approved.
  if (!state.contiguousUsMode) rebaseDisplayPositionsForSavedView(view);
  if (!state.contiguousUsMode) saveTrips();
  // When the device guide is visible in the editor, its inner white rectangle
  // is the composition being approved. Save those four geographic corners at
  // the journey level alongside the usual camera checkpoint.
  if (!state.contiguousUsMode && isEditorSite?.() && els.showMapBounds?.checked) {
    saveActiveJourneyViewportForDevice();
  }
  markProjectDirty(state.contiguousUsMode ? "ui" : "journeys");
  els.status.textContent = `Saved ${target?.label || "map view"}.`;
  updateSetMapViewState();
});

map?.on?.("moveend zoomend", updateSetMapViewState);

function updateStickerDefaultsFromControls() {
  const target = state.noJourneySelected ? state.projectDefaults : activeTrip();
  if (!target) return;
  const current = state.noJourneySelected ? target.sticker : target.stickerDefaults;
  const next = normalizeStickerDefaults({
    ...current,
    visibility: els.stickerDefaultVisibility.value,
    size: Number(els.stickerDefaultSize?.value)
  });
  if (state.noJourneySelected) target.sticker = next;
  else target.stickerDefaults = next;
  if (els.stickerDefaultSizeValue) els.stickerDefaultSizeValue.textContent = String(next.size);
  saveTrips();
  markProjectDirty("journeys");
  renderStickers();
}
[els.stickerDefaultVisibility, els.stickerDefaultSize].forEach(input => {
  input?.addEventListener("input", updateStickerDefaultsFromControls);
  input?.addEventListener("change", updateStickerDefaultsFromControls);
});

els.stickerUpload?.addEventListener("change", event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const item = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label: file.name.replace(/\.[^.]+$/, "") || "Custom sticker",
      url: String(reader.result || "")
    };
    customStickerLibrary.push(item);
    rvStorageWriteJson(CUSTOM_STICKER_LIBRARY_KEY, customStickerLibrary);
    renderStickerLibrary();
    markProjectDirty("ui");
  });
  reader.readAsDataURL(file);
  event.target.value = "";
});

els.createTextSticker?.addEventListener("click", () => {
  const text = String(els.stickerCustomText?.value || "").trim().slice(0, 4);
  if (!text) {
    els.stickerCustomText?.focus();
    return;
  }
  const color = els.stickerCustomColor?.value || "#2f6f55";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><text x="64" y="70" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${text.length > 2 ? 46 : 78}" font-weight="800" fill="${escapeHtml(color)}">${escapeHtml(text)}</text></svg>`;
  customStickerLibrary.push({
    id: `custom-text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: text,
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  });
  rvStorageWriteJson(CUSTOM_STICKER_LIBRARY_KEY, customStickerLibrary);
  els.stickerCustomText.value = "";
  renderStickerLibrary();
  markProjectDirty("ui");
});

const mapDropTarget = map.getContainer();
mapDropTarget.addEventListener("dragover", event => {
  if (event.dataTransfer?.types?.includes("application/x-rv-sticker")) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }
});
mapDropTarget.addEventListener("drop", event => {
  const raw = event.dataTransfer?.getData("application/x-rv-sticker");
  let payload;
  try { payload = JSON.parse(raw || ""); } catch { payload = { id: raw }; }
  const id = payload?.id;
  if (!id) return;
  event.preventDefault();
  const item = allStickerLibraryItems().find(candidate => candidate.id === id);
  if (!item) return;
  const rect = mapDropTarget.getBoundingClientRect();
  const point = L.point(event.clientX - rect.left, event.clientY - rect.top);
  addStickerAtLibraryItem(item, map.containerPointToLatLng(point), payload?.pin);
});

function updateSelectedStickerFromControls() {
  const sticker = selectedStickerRecord();
  if (!sticker) return;
  sticker.visibility = els.selectedStickerVisibility.value;
  setStickerSizeForView(sticker, Number(els.selectedStickerSize.value));
  sticker.showAtAllZooms = els.selectedStickerAllZooms.checked;
  els.selectedStickerSizeValue.textContent = String(stickerSizeForView(sticker));
  saveTrips();
  markProjectDirty("journeys");
  renderStickers();
}
[els.selectedStickerVisibility, els.selectedStickerSize, els.selectedStickerAllZooms].forEach(input => {
  input?.addEventListener("pointerdown", () => { stickerControlHistoryBefore = stickerSnapshot(selectedStickerRecord()); });
  input?.addEventListener("focus", () => { stickerControlHistoryBefore ||= stickerSnapshot(selectedStickerRecord()); });
  input?.addEventListener("input", updateSelectedStickerFromControls);
  input?.addEventListener("change", () => {
    const sticker = selectedStickerRecord();
    updateSelectedStickerFromControls();
    recordStickerHistory({ before: stickerControlHistoryBefore, after: stickerSnapshot(selectedStickerRecord()) });
    stickerControlHistoryBefore = null;
  });
});
function deleteStickerRecords(stickers = selectedStickerRecords()) {
  const trip = activeTrip();
  if (trip && stickers.length) {
    stickers.forEach(sticker => recordStickerHistory({ trip, before: stickerSnapshot(sticker), after: null }));
    const deleted = new Set(stickers.map(sticker => sticker.id));
    trip.stickers = (trip.stickers || []).filter(item => !deleted.has(item.id));
    stickerGroups(trip);
  }
  clearStickerSelection();
  saveTrips();
  markProjectDirty("journeys");
  renderStickerSelectionControls();
  renderStickers();
}

els.deleteSelectedSticker?.addEventListener("click", () => {
  deleteStickerRecords();
});

function selectAllVisibleStickers() {
  const trip = activeTrip();
  selectedStickerIds = new Set((trip?.stickers || []).filter(sticker => stickerShouldRender(sticker, trip)).map(sticker => sticker.id));
  selectedStickerId = [...selectedStickerIds][0] || "";
  renderStickerSelectionControls(); renderStickers();
}

function selectAllEnabledFeatures() {
  clearStickerSelection();
  const trip = activeTrip();
  if (els.selectionTypeStickers?.checked) {
    selectedStickerIds = new Set((trip?.stickers || []).filter(sticker => stickerShouldRender(sticker, trip)).map(sticker => sticker.id));
    selectedStickerId = [...selectedStickerIds][0] || "";
  }
  if (els.selectionTypeMarkers?.checked || els.selectionTypeLandmarks?.checked) {
    (state.routes || []).forEach((route, routeIndex) => ["start", "end"].forEach(anchor => {
      const kind = landmarkMarkerSettingsFor(route, routeIndex, anchor) ? "landmark" : "marker";
      if ((kind === "landmark" ? els.selectionTypeLandmarks : els.selectionTypeMarkers)?.checked) selectedEndpointFeatureKeys.add(`${kind}:${routeIndex}:${anchor}`);
    }));
    selectedEndpointFeatureKey = [...selectedEndpointFeatureKeys][0] || "";
  }
  if (els.selectionTypeRouteIcon?.checked && state.playback.icon) routeAnimationIconSelected = true;
  renderStickerSelectionControls(); renderStickers(); refreshEndpointMarkers(); renderMediaMarkers(); updateSelectionControls();
}

let selectionTypePopup = null;
let selectionShortcutMenu = els.selectionShortcutDock;
let selectionShortcutToggle = null;
let selectionMarqueeHint = null;

function selectionShortcutRows() {
  return [
    [["Ctrl", "A"], "Select enabled features"],
    [["Ctrl", "Shift", "A"], "Clear selection"],
    [["Ctrl", "(Shift)", "G"], "(Un)group selected objects"],
    [["Scroll", "(Shift)"], "Scroll to scale (all)"],
    [["F8"], "Show selected object in timeline"],
    [["F9"], "Jump to selected object properties"],
    [["Shift", "Click"], "Add or remove a feature", "assets/SVG/mouse_LMB.svg", "Left mouse button"],
    [["Drag"], "Select intersecting features when panning is off", "assets/SVG/mouse_LMB.svg", "Left mouse button"],
    [["Right", "Click"], "Delete selected sticker", "assets/SVG/mouse_RMB.svg", "Right mouse button"]
  ];
}

function renderSelectionShortcutMenu() {
  if (!selectionShortcutMenu) return;
  const title = document.createElement("strong");
  title.textContent = "Shortcuts";
  const rows = selectionShortcutRows().map(([keys, label, mouseIcon = "", mouseLabel = ""]) => {
    const row = document.createElement("div");
    row.className = "selection-shortcut-row";
    if (mouseIcon) {
      const mouse = document.createElement("img");
      mouse.className = "selection-shortcut-mouse";
      mouse.src = mouseIcon;
      mouse.alt = mouseLabel;
      row.append(mouse);
    }
    const body = document.createElement("div");
    body.className = "selection-shortcut-body";
    const keysWrap = document.createElement("span");
    keysWrap.className = "selection-shortcut-keys";
    keys.forEach((key, index) => {
      if (index) keysWrap.append(" + ");
      const keyElement = document.createElement("kbd");
      keyElement.textContent = key;
      keysWrap.append(keyElement);
    });
    const description = document.createElement("span");
    description.textContent = label;
    body.append(keysWrap, description);
    row.append(body);
    return row;
  });
  selectionShortcutMenu.replaceChildren(title, ...rows);
  if (selectionShortcutMenu.dataset.shortcutDockInitialized !== "true") selectionShortcutMenu.dataset.shortcutDockInitialized = "true";
  if (!selectionShortcutToggle) {
    selectionShortcutToggle = document.createElement("button");
    selectionShortcutToggle.id = "toggleSelectionShortcutDock";
    selectionShortcutToggle.type = "button";
    selectionShortcutToggle.className = "selection-shortcut-toggle secondary-wheel-toggle";
    selectionShortcutToggle.setAttribute("aria-label", "Show selection shortcuts");
    applySecondaryWheelToggle(selectionShortcutToggle);
    selectionShortcutToggle.addEventListener("click", () => {
      const open = !selectionShortcutMenu.classList.contains("is-collapsed");
      selectionShortcutMenu.classList.toggle("is-collapsed", open);
      selectionShortcutToggle.setAttribute("aria-expanded", String(!open));
      selectionShortcutToggle.setAttribute("aria-label", open ? "Show selection shortcuts" : "Hide selection shortcuts");
      syncSecondaryWheelToggle(selectionShortcutToggle, !open, { animate: true });
    });
  }
  // The wheel is deliberately a sibling, not a child. The drawer slides while
  // the wheel stays on the left map edge and never obscures shortcut text.
  document.body.append(selectionShortcutToggle);
  const stageRect = els.mapCanvas?.closest(".map-stage")?.getBoundingClientRect();
  const mapTop = stageRect?.top || 0;
  const mapBottom = stageRect?.bottom || window.innerHeight;
  const menuHeight = selectionShortcutMenu.offsetHeight || 260;
  const menuTop = Math.max(mapTop + 8, Math.min(mapBottom - menuHeight - 8, mapTop + (mapBottom - mapTop - menuHeight) / 2));
  selectionShortcutMenu.style.left = "0px";
  selectionShortcutMenu.style.right = "auto";
  selectionShortcutMenu.style.top = `${Math.round(menuTop)}px`;
  selectionShortcutMenu.style.bottom = "auto";
  // The flipped SVG puts its alignment guide exactly at the left map edge.
  selectionShortcutToggle.style.left = `${Math.round(stageRect?.left || 0)}px`;
  selectionShortcutToggle.style.right = "auto";
  // Keep the wheel below the shortcut rows instead of treating it as a footer.
  // It may overlap the panel edge a little, but never a shortcut itself.
  selectionShortcutToggle.style.top = `${Math.round(Math.min(mapBottom - 52, menuTop + menuHeight + 6))}px`;
  selectionShortcutToggle.style.bottom = "auto";
  const shortcutOpen = !selectionShortcutMenu.classList.contains("is-collapsed");
  selectionShortcutToggle.setAttribute("aria-expanded", String(shortcutOpen));
  selectionShortcutToggle.setAttribute("aria-label", shortcutOpen ? "Hide selection shortcuts" : "Show selection shortcuts");
  syncSecondaryWheelToggle(selectionShortcutToggle, shortcutOpen, { animate: false });
}

function mountMapSelectionDock() {
  const section = document.querySelector(".selection-section[aria-label='Map feature selection']");
  const stage = els.mapCanvas?.closest(".map-stage");
  if (!section || !stage) return;
  if (section.parentElement !== stage) stage.append(section);
  // Selection is a live map tool, not a portable settings bundle.
  section.querySelector(":scope > .section-export-actions")?.remove();
  section.classList.add("map-selection-dock");
  let heading = section.querySelector(":scope > .selection-dock-heading");
  if (!heading) {
    heading = document.createElement("div");
    heading.className = "selection-dock-heading";
    const label = section.querySelector(":scope > .section-label");
    const count = section.querySelector("#selectionCount");
    if (label) heading.append(label);
    if (count) heading.append(count);
    section.prepend(heading);
  }
  const stageRect = stage.getBoundingClientRect();
  const anchorRect = els.usView?.getBoundingClientRect();
  if (!anchorRect) return;
  section.style.left = `${Math.round(anchorRect.right - stageRect.left + 8)}px`;
  section.style.bottom = `${Math.round(stageRect.bottom - anchorRect.bottom)}px`;
}

function revealSelectedStickerWorkspace(target = "timeline") {
  const sticker = selectedStickerRecord();
  if (!sticker) return false;
  setPanelTab?.("map-ui");
  const selector = target === "timeline" ? ".timeline-section" : ".sticker-sfx-section";
  window.setTimeout(() => {
    const section = document.querySelector(selector);
    if (!section) return;
    section.classList.remove("is-collapsed");
    section.querySelector(":scope > .section-collapse-button")?.setAttribute("aria-expanded", "true");
    if (target === "timeline") {
      selectedTimelineStickerId = sticker.id;
      renderRouteTimeline();
    } else {
      sfxSelectedStickerId = sticker.id;
      sfxRenderStickerEditor?.();
    }
    section.scrollIntoView({ block: "start", behavior: "smooth" });
    // Browsers intentionally do not allow scripted pointer movement. Focus and
    // highlight the requested object instead, which gives the same hand-off.
    const item = target === "timeline"
      ? section.querySelector(`.timeline-sticker-block[data-sticker-id="${CSS.escape(sticker.id)}"]`)
      : section.querySelector(`.sticker-sfx-tile[data-sticker-id="${CSS.escape(sticker.id)}"]`);
    item?.focus({ preventScroll: true });
    item?.classList.add("is-shortcut-target");
    window.setTimeout(() => item?.classList.remove("is-shortcut-target"), 1300);
  }, 280);
  return true;
}

function setSelectionMarqueeHint(visible) {
  if (!selectionMarqueeHint) {
    selectionMarqueeHint = document.createElement("div");
    selectionMarqueeHint.className = "selection-marquee-hint";
    document.body.append(selectionMarqueeHint);
  }
  selectionMarqueeHint.hidden = !visible;
  if (visible) selectionMarqueeHint.textContent = "Hold Shift while dragging to select only features fully inside the box.";
}

renderSelectionShortcutMenu();
mountMapSelectionDock();
window.addEventListener("resize", () => requestAnimationFrame(renderSelectionShortcutMenu));
window.addEventListener("resize", () => requestAnimationFrame(mountMapSelectionDock));
function openSelectionTypePopup(anchor) {
  if (!selectionTypePopup) {
    selectionTypePopup = document.createElement("div");
    selectionTypePopup.className = "selection-type-popup";
    selectionTypePopup.setAttribute("role", "dialog");
    document.body.append(selectionTypePopup);
  }
  const types = [["selectionTypeStickers", "Stickers"], ["selectionTypeLandmarks", "Landmarks"], ["selectionTypeMarkers", "Markers"], ["selectionTypeRouteIcon", "Route icon"]];
  const fields = types.map(([id, label]) => {
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = els[id]?.checked;
    const field = document.createElement("label"); field.append(input, ` ${label}`); return [id, field, input];
  });
  const apply = document.createElement("button"); apply.type = "button"; apply.textContent = "Select enabled";
  apply.addEventListener("click", () => { fields.forEach(([id,, input]) => { els[id].checked = input.checked; }); selectionTypePopup.hidden = true; selectAllEnabledFeatures(); });
  const close = document.createElement("button"); close.type = "button"; close.textContent = "Cancel"; close.addEventListener("click", () => { selectionTypePopup.hidden = true; });
  selectionTypePopup.replaceChildren(...fields.map(([, field]) => field), apply, close);
  const rect = anchor.getBoundingClientRect(); selectionTypePopup.style.left = `${rect.left}px`; selectionTypePopup.style.top = `${rect.bottom + 6}px`; selectionTypePopup.hidden = false;
}

let stickerMarqueeState = null;
let marqueeSuppressClickUntil = 0;
let marqueeSuppressHoverUntil = 0;

function marqueeSelectionEnabled() {
  const typeEnabled = [els.selectionTypeStickers, els.selectionTypeLandmarks, els.selectionTypeMarkers, els.selectionTypeRouteIcon].some(input => input?.checked);
  return Boolean(isEditorSite?.() && typeEnabled && map?.dragging && !map.dragging.enabled());
}

function finishStickerMarqueeSelection(event) {
  const marquee = stickerMarqueeState;
  if (!marquee) return;
  stickerMarqueeState = null;
  document.removeEventListener("pointermove", updateStickerMarqueeSelection, true);
  document.removeEventListener("pointerup", finishStickerMarqueeSelection, true);
  marquee.element.remove();
  setSelectionMarqueeHint(false);
  const left = Math.min(marquee.startX, event.clientX);
  const right = Math.max(marquee.startX, event.clientX);
  const top = Math.min(marquee.startY, event.clientY);
  const bottom = Math.max(marquee.startY, event.clientY);
  if (right - left < 5 && bottom - top < 5) return;
  marqueeSuppressClickUntil = performance.now() + 300;
  marqueeSuppressHoverUntil = performance.now() + 360;
  const trip = activeTrip();
  if (!event.shiftKey) clearStickerSelection();
  const selectedByMarquee = element => {
    const rect = element.getBoundingClientRect();
  if (event.shiftKey) return rect.left >= left && rect.right <= right && rect.top >= top && rect.bottom <= bottom;
    return rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
  };
  if (els.selectionTypeStickers?.checked) els.mapCanvas.querySelectorAll("[data-sticker-id]").forEach(element => { if (selectedByMarquee(element)) selectedStickerIds.add(element.dataset.stickerId); });
  if (els.selectionTypeLandmarks?.checked || els.selectionTypeMarkers?.checked) {
    els.mapCanvas.querySelectorAll(".route-endpoint-marker").forEach(element => {
      if (!selectedByMarquee(element)) return;
      const kind = element.dataset.graphicKind;
      if ((kind === "landmark" ? els.selectionTypeLandmarks : els.selectionTypeMarkers)?.checked) selectedEndpointFeatureKeys.add(`${kind}:${element.dataset.routeIndex}:${element.dataset.anchor}`);
    });
  }
  if (els.selectionTypeRouteIcon?.checked && state.playback.icon?.getElement?.() && selectedByMarquee(state.playback.icon.getElement())) routeAnimationIconSelected = true;
  if (!selectedStickerIds.has(selectedStickerId)) selectedStickerId = [...selectedStickerIds][0] || "";
  if (!selectedEndpointFeatureKeys.has(selectedEndpointFeatureKey)) selectedEndpointFeatureKey = [...selectedEndpointFeatureKeys][0] || "";
  renderStickerSelectionControls(); renderStickers(); refreshEndpointMarkers(); renderMediaMarkers(); updateSelectionControls();
}

function updateStickerMarqueeSelection(event) {
  const marquee = stickerMarqueeState;
  if (!marquee) return;
  const left = Math.min(marquee.startX, event.clientX);
  const top = Math.min(marquee.startY, event.clientY);
  marquee.element.style.left = `${left}px`;
  marquee.element.style.top = `${top}px`;
  marquee.element.style.width = `${Math.abs(event.clientX - marquee.startX)}px`;
  marquee.element.style.height = `${Math.abs(event.clientY - marquee.startY)}px`;
}

function startStickerMarqueeSelection(event) {
  if (!marqueeSelectionEnabled() || event.button !== 0 || event.target.closest?.(".leaflet-marker-icon, button, input, select, label")) return;
  const bounds = els.mapCanvas.getBoundingClientRect();
  const element = document.createElement("div");
  element.className = "map-selection-marquee";
  document.body.append(element);
  stickerMarqueeState = { startX: event.clientX, startY: event.clientY, bounds, element };
  setSelectionMarqueeHint(true);
  document.addEventListener("pointermove", updateStickerMarqueeSelection, true);
  document.addEventListener("pointerup", finishStickerMarqueeSelection, true);
  event.preventDefault();
}

let annotationDraft = null;

function annotationLatLngs(annotation) {
  return (annotation?.points || []).map(point => [point.lat, point.lon]);
}

function annotationLayer(annotation, { preview = false } = {}) {
  const options = {
    color: annotation.color,
    weight: annotation.weight,
    opacity: preview ? .65 : annotation.opacity,
    dashArray: preview ? "7 6" : null,
    interactive: false
  };
  const points = annotationLatLngs(annotation);
  if (annotation.type === "box") return L.rectangle([points[0], points[1]], options);
  const group = L.featureGroup();
  group.addLayer(L.polyline(points, options));
  if (annotation.type === "arrow" && points.length > 1) {
    const end = points[points.length - 1];
    group.addLayer(L.marker(end, {
      interactive: false,
      icon: L.divIcon({
        className: "map-annotation-arrowhead",
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        html: `<span style="--annotation-color:${escapeHtml(annotation.color)}">▶</span>`
      })
    }));
  }
  return group;
}

function renderAnnotations() {
  annotationGroup.clearLayers();
  const trips = state.contiguousUsMode ? state.trips : [activeTrip()].filter(Boolean);
  trips.forEach(trip => {
    trip.annotations = normalizeTripAnnotations(trip.annotations);
    trip.annotations.forEach(annotation => annotationGroup.addLayer(annotationLayer(annotation)));
  });
  if (annotationDraft?.points?.length) annotationGroup.addLayer(annotationLayer(annotationDraft, { preview: true }));
}

function updateAnnotationToolUi() {
  const drawing = Boolean(annotationDraft);
  if (els.beginAnnotation) els.beginAnnotation.disabled = drawing;
  if (els.finishAnnotation) els.finishAnnotation.disabled = !drawing || annotationDraft.points.length < 2;
  if (els.mapCanvas) els.mapCanvas.classList.toggle("is-drawing-annotation", drawing);
  if (els.annotationWeightValue) els.annotationWeightValue.textContent = String(els.annotationWeight?.value || 4);
}

function beginAnnotationDrawing() {
  if (!activeTrip()) return;
  annotationDraft = {
    type: els.annotationType?.value || "line",
    color: els.annotationColor?.value || "#2f6f55",
    weight: Number(els.annotationWeight?.value) || 4,
    opacity: .9,
    points: []
  };
  updateAnnotationToolUi();
  els.status.textContent = annotationDraft.type === "box"
    ? "Click two opposite corners on the map."
    : "Click points on the map, then choose Finish drawing.";
}

function finishAnnotationDrawing() {
  if (!annotationDraft || annotationDraft.points.length < 2) return;
  const trip = activeTrip();
  if (!trip) return;
  trip.annotations ||= [];
  trip.annotations.push({ ...annotationDraft, id: `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
  annotationDraft = null;
  saveTrips();
  markProjectDirty("journeys");
  renderAnnotations();
  updateAnnotationToolUi();
  els.status.textContent = "Map drawing saved with this journey.";
}

function clearJourneyAnnotations() {
  const trip = activeTrip();
  if (!trip?.annotations?.length) return;
  if (!window.confirm("Remove all map drawings from this journey?")) return;
  trip.annotations = [];
  annotationDraft = null;
  saveTrips();
  markProjectDirty("journeys");
  renderAnnotations();
  updateAnnotationToolUi();
}

els.mapCanvas?.addEventListener("pointerdown", startStickerMarqueeSelection, { capture: true, passive: false });

els.selectionSelectAll?.addEventListener("click", selectAllEnabledFeatures);
els.selectionSelectNone?.addEventListener("click", () => { clearStickerSelection(); renderStickerSelectionControls(); renderStickers(); });
els.selectionSelectByType?.addEventListener("click", event => openSelectionTypePopup(event.currentTarget));
document.addEventListener("keydown", event => {
  if (event.altKey && event.key.toLowerCase() === "t" && !event.ctrlKey && !event.metaKey) {
    const timeline = document.querySelector(".timeline-section");
    if (timeline) {
      timeline.classList.remove("is-collapsed");
      timeline.querySelector(":scope > .section-collapse-button")?.setAttribute("aria-expanded", "true");
      timeline.scrollIntoView({ block: "nearest", behavior: "smooth" });
      event.preventDefault();
    }
    return;
  }
  if (event.key !== "Escape") return;
  let closed = false;
  if (selectionTypePopup && !selectionTypePopup.hidden) { selectionTypePopup.hidden = true; closed = true; }
  if (closed) event.preventDefault();
});
els.selectionGroup?.addEventListener("click", groupSelectedStickers);
els.selectionUngroup?.addEventListener("click", ungroupSelectedStickers);

map.on("click", event => {
  if (annotationDraft) {
    annotationDraft.points.push({ lat: event.latlng.lat, lon: event.latlng.lng });
    if (annotationDraft.type === "box" && annotationDraft.points.length > 2) annotationDraft.points = annotationDraft.points.slice(-2);
    renderAnnotations();
    updateAnnotationToolUi();
    return;
  }
  if (stickerPathDraft) {
    const point = els.snapStickerPathToRoute?.checked ? nearestPointOnActiveRoute(event.latlng) : event.latlng;
    stickerPathDraft.points.push(point);
    stickerPathDraft.layer.setLatLngs(stickerPathDraft.points);
    return;
  }
  if (performance.now() < marqueeSuppressClickUntil) return;
  if (!selectedStickerId && !selectedEndpointFeatureKeys.size && !routeAnimationIconSelected) return;
  if (event.originalEvent?.target?.closest?.(".map-sticker-icon, .route-endpoint-marker, .media-marker")) return;
  clearStickerSelection();
  renderStickerSelectionControls();
  renderStickers();
});

document.addEventListener("keydown", event => {
  const tag = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) return;
  const key = String(event.key || "").toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && key === "z") {
    event.preventDefault();
    runStickerHistory(event.shiftKey ? "redo" : "undo");
    return;
  }
  if (modifier && key === "u") {
    event.preventDefault();
    runStickerHistory("redo");
    return;
  }
  const mapOwnsFocus = event.target === document.body || event.target === els.mapCanvas || els.mapCanvas?.contains(event.target) || Boolean(event.target?.closest?.(".leaflet-container, .map-stage"));
  if (modifier && key === "a" && mapOwnsFocus) {
    event.preventDefault();
    if (event.shiftKey) clearStickerSelection();
    else selectAllVisibleStickers();
    renderStickerSelectionControls(); renderStickers();
    return;
  }
  if (event.key === "F8" && mapOwnsFocus) {
    event.preventDefault();
    revealSelectedStickerWorkspace("timeline");
    return;
  }
  if (event.key === "F9" && mapOwnsFocus) {
    event.preventDefault();
    revealSelectedStickerWorkspace("properties");
    return;
  }
  if (modifier && event.shiftKey && key === "g" && mapOwnsFocus) {
    event.preventDefault(); ungroupSelectedStickers(); return;
  }
  if (modifier && key === "g" && mapOwnsFocus) {
    event.preventDefault(); groupSelectedStickers(); return;
  }
  if (modifier && key === "c" && selectedStickerId) {
    event.preventDefault();
    copySelectedSticker();
    return;
  }
  if (modifier && key === "v" && stickerClipboard) {
    event.preventDefault();
    pasteStickerCopy();
    return;
  }
  if (modifier && key === "x" && selectedStickerId) {
    event.preventDefault();
    cutSelectedSticker();
    return;
  }
  if (modifier && key === "d" && selectedStickerId) {
    event.preventDefault();
    if (copySelectedSticker()) pasteStickerCopy();
    return;
  }
  if (event.key === "Delete" && selectedStickerId && !selectedStickerKeyframes.size) {
    event.preventDefault();
    els.deleteSelectedSticker?.click();
  }
});

document.addEventListener("change", event => {
  if (!event.isTrusted) return;
  const panel = event.target.closest?.("[data-panel-tab-panel]")?.dataset.panelTabPanel;
  if (panel === "elements") { markProjectDirty("styles"); markProjectDirty("ui"); }
  else if (panel === "map-ui") markProjectDirty("ui");
  else if (panel === "trips") markProjectDirty("journeys");
  else if (panel) markProjectDirty("ui");
}, true);

applyTerminology();
renderStickerLibrary();
renderStickerSelectionControls();
updateProjectExportStatus();
window.addEventListener("resize", positionProjectExportStatus, { passive: true });
if (window.ResizeObserver && els.mapCanvas) {
  new ResizeObserver(positionProjectExportStatus).observe(els.mapCanvas);
}

function updateRouteStackControls() {
  document.querySelectorAll("[data-route-stack-toggle]").forEach(button => {
    const target = button.dataset.routeStackToggle;
    const isOnTop = routeStackOrder === `${target}-on-top`;
    const layerName = target === "faintRoute" ? "faint route" : "route";
    button.textContent = isOnTop ? "Move to bottom" : "Move to top";
    button.setAttribute("aria-label", `${button.textContent} ${layerName}`);
    button.dataset.help = `Draw the ${layerName} ${isOnTop ? "below" : "above"} the other route line.`;
  });
}

function applyRouteStackOrder(order = routeStackOrder) {
  routeStackOrder = order === "faintRoute-on-top" ? "faintRoute-on-top" : "route-on-top";
  const activePane = map.getPane("activeRoutePane");
  const faintPane = map.getPane("faintRoutePane");
  if (routeStackOrder === "route-on-top") {
    PANE_Z_INDEXES.activeRoutePane = 440;
    PANE_Z_INDEXES.faintRoutePane = 438;
    activePane.style.zIndex = 440;
    faintPane.style.zIndex = 438;
    faintRouteGroup.bringToBack();
    routeGroup.bringToFront();
  } else {
    PANE_Z_INDEXES.activeRoutePane = 438;
    PANE_Z_INDEXES.faintRoutePane = 440;
    activePane.style.zIndex = 438;
    faintPane.style.zIndex = 440;
    routeGroup.bringToBack();
    faintRouteGroup.bringToFront();
  }
  if (mapLibreMap?.getLayer("rv-route-active") && mapLibreMap.getLayer("rv-route-faint")) {
    if (routeStackOrder === "route-on-top") {
      mapLibreMap.moveLayer("rv-route-active", "rv-route-playback");
    } else {
      mapLibreMap.moveLayer("rv-route-faint", "rv-route-playback");
    }
  }
  playbackGroup.bringToFront();
  overviewHoverRouteGroup.bringToFront();
  updateRouteStackControls();
}

function toggleRouteStackOrder() {
  applyRouteStackOrder(routeStackOrder === "route-on-top" ? "faintRoute-on-top" : "route-on-top");
}

map.setView([39.5, -98.35], 5);

function splitPointsIntoDayLegs(points, count = 3) {
  if (points.length < count + 1) return [points];
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances[index] = distances[index - 1] + haversineMiles(points[index - 1], points[index]);
  }

  const total = distances[distances.length - 1];
  const legs = [];
  let startIndex = 0;
  for (let legIndex = 1; legIndex <= count; legIndex += 1) {
    const target = total * legIndex / count;
    let endIndex = legIndex === count ? points.length - 1 : distances.findIndex(distance => distance >= target);
    endIndex = Math.max(startIndex + 1, endIndex);
    legs.push(points.slice(startIndex, endIndex + 1));
    startIndex = endIndex;
  }
  return legs.filter(leg => leg.length >= 2);
}

async function loadElementsPreviewRoutes() {
  if (elementsPreviewRoutes) return elementsPreviewRoutes;
  if (!elementsPreviewRoutesPromise) {
    elementsPreviewRoutesPromise = fetch(THEME_SETTINGS_MAP_PATH)
      .then(response => {
        if (!response.ok) throw new Error(`Could not load ${THEME_SETTINGS_MAP_PATH}.`);
        return response.text();
      })
      .then(text => {
        const parsed = parseRouteFile(text, THEME_SETTINGS_MAP_PATH);
        const colors = ["#d9442e", "#2f6fbb", "#1f7a5c"];
        elementsPreviewRoutes = splitPointsIntoDayLegs(parsed.points, 3).map((points, index) => makeRoute({
          title: parsed.title,
          points
        }, {
          label: `Day ${index + 1}`,
          summary: `Theme settings leg ${index + 1}`,
          source: THEME_SETTINGS_MAP_PATH,
          color: colors[index % colors.length]
        }));
        return elementsPreviewRoutes;
      });
  }
  return elementsPreviewRoutesPromise;
}

function cloneRouteForElementsPreview(route, labelPrefix = "") {
  if (!route) return null;
  const label = [labelPrefix, route.label || route.title || "Route"].filter(Boolean).join(" - ");
  return {
    ...route,
    id: `${route.id || "route"}-elements-preview`,
    label,
    title: route.title || label,
    summary: route.summary || route.source || label,
    points: (route.points || []).map(point => ({ ...point })),
    displayPoints: (route.displayPoints || route.points || []).map(point => ({ ...point })),
    media: []
  };
}

function selectedElementsPreviewRoutes() {
  if (elementsPreviewRouteSelection === "settings") {
    return loadElementsPreviewRoutes().then(routes => ({
      routes,
      status: `Using ${THEME_SETTINGS_MAP_PATH} for Settings Journey`
    }));
  }
  const match = /^trip:(\d+):day:(\d+)$/.exec(elementsPreviewRouteSelection);
  if (match) {
    const tripIndex = Number(match[1]);
    const dayIndex = Number(match[2]);
    const trip = state.trips[tripIndex];
    const route = trip?.days?.[dayIndex];
    const previewRoute = cloneRouteForElementsPreview(route, trip?.name || "");
    if (previewRoute) {
      return Promise.resolve({
        routes: [previewRoute],
        status: `Previewing ${previewRoute.label}`
      });
    }
  }
  elementsPreviewRouteSelection = "settings";
  return selectedElementsPreviewRoutes();
}

function renderElementsRouteSelect() {
  if (!els.elementsRouteSelect) return;
  const previous = elementsPreviewRouteSelection || els.elementsRouteSelect.value || "settings";
  // The settings target is the route-level default context. Keep its stable
  // value for backwards compatibility with saved editor state.
  els.elementsRouteSelect.replaceChildren(new Option("None selected — route defaults", "settings", false, previous === "settings"));
  state.trips.forEach((trip, tripIndex) => {
    (trip.days || []).forEach((route, dayIndex) => {
      const value = `trip:${tripIndex}:day:${dayIndex}`;
      const dayName = route.label || route.title || `Day ${dayIndex + 1}`;
      const tripName = trip.name || `Leg list ${tripIndex + 1}`;
      els.elementsRouteSelect.append(new Option(`${tripName} - ${dayName}`, value, false, previous === value));
    });
  });
  const valid = [...els.elementsRouteSelect.options].some(option => option.value === previous);
  elementsPreviewRouteSelection = valid ? previous : "settings";
  els.elementsRouteSelect.value = elementsPreviewRouteSelection;
}

async function enterElementsPreview() {
  if (!map) return;
  elementsPreviewMode = true;
  if (!elementsPreviewState) {
    elementsPreviewState = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      overviewMode: state.overviewMode,
      focusIndex: state.overviewFocusIndex,
      focusZoom: state.overviewFocusZoom,
      activeIndex: state.activeRouteIndex,
      routes: state.routes
    };
  }
  try {
    const preview = await selectedElementsPreviewRoutes();
    if (!elementsPreviewMode) return;
    state.routes = preview.routes;
    state.activeRouteIndex = 0;
    map.invalidateSize({ animate: false });
    const drawerWidth = els.elementsStyleDrawer?.getBoundingClientRect().width || 0;
    setOverviewMode({
      paddingTopLeft: OVERVIEW_FIT_PADDING,
      paddingBottomRight: [OVERVIEW_FIT_PADDING[0] + drawerWidth, OVERVIEW_FIT_PADDING[1]]
    });
    els.status.textContent = preview.status;
    renderTripManager();
  } catch (error) {
    els.status.textContent = error.message;
  }
}

function exitElementsPreview() {
  elementsPreviewMode = false;
  if (!elementsPreviewState) return;
  const previous = elementsPreviewState;
  elementsPreviewState = null;
  state.routes = previous.routes;
  state.overviewMode = previous.overviewMode;
  state.overviewFocusIndex = previous.focusIndex;
  state.overviewFocusZoom = previous.focusZoom;
  state.activeRouteIndex = previous.activeIndex;
  const route = activeRoute();
  if (route) {
    state.points = route.points;
    state.displayPoints = route.displayPoints;
    state.title = route.label || route.title;
    updateStats();
  }
  renderRouteDayButtons();
  renderRoute(false);
  map.invalidateSize({ animate: false });
  moveToView(previous.center, previous.zoom, {
    onComplete: () => {
      renderRoute(false);
      applyMapInteractionLocks();
      applyToggleState(getToggleState());
      renderTripManager();
    }
  });
}

function currentZoomScale(zoom = map.getZoom()) {
  // Geographic features already enlarge as the map zooms in. Keep their
  // screen-space styling from becoming heavier at the same time.
  return clamp(1.28 - zoom * 0.065, 0.55, 1.08);
}

function styleSize(key) {
  const style = layerStyles[key];
  const scale = style.zoomScale ? currentZoomScale() : 1;
  return clamp(style.size * scale, style.min, style.max);
}

function updateRouteStrokeZoomMultiplier(zoom = map.getZoom()) {
  const scale = currentZoomScale(zoom);
  document.querySelectorAll("path.leaflet-route-stroke").forEach(path => {
    const drawnWidth = Number(path.getAttribute("stroke-width")) || Number.parseFloat(path.style.strokeWidth) || 0;
    if (!drawnWidth) return;
    const baseWidth = Number(path.dataset.routeStrokeBaseWidth) || drawnWidth / Math.max(currentZoomScale(map.getZoom()), 0.01);
    path.dataset.routeStrokeBaseWidth = String(baseWidth);
    path.style.strokeWidth = `${baseWidth * scale}px`;
  });
}

function styleColor(key) {
  return layerStyles[key].color;
}

function styleOpacity(key) {
  return clamp(Number.isFinite(layerStyles[key]?.opacity) ? layerStyles[key].opacity : 1, 0, 1);
}

function styleBlend(key) {
  return isTextureBlendMode(layerStyles[key]?.blend) ? layerStyles[key].blend : "normal";
}

function isTextStyleLayer(key) {
  return key === "smallTowns" || key === "cities" || key === "capitols" || key === "capitals" || key === "pois" || key === "routeStopLabels";
}

function textTypeface(value) {
  return MAP_TEXT_TYPEFACES.find(typeface => typeface.value === value) || MAP_TEXT_TYPEFACES[0];
}

function styleFontFamily(key) {
  return textTypeface(layerStyles[key]?.font).css;
}

function styleVectorFontStack(key, fallback = ["Noto Sans Regular"]) {
  const stack = textTypeface(layerStyles[key]?.font).vector || [];
  return [...new Set([...stack, ...fallback])];
}

function styleVectorFontStackForStyle(style = {}, fallback = ["Noto Sans Regular"]) {
  const stack = textTypeface(style.font).vector || [];
  const variants = [];
  if (style.fontWeight >= 650 && style.italic) variants.push("Noto Sans Bold Italic");
  if (style.fontWeight >= 650) variants.push("Noto Sans Bold");
  if (style.italic) variants.push("Noto Sans Italic");
  return [...new Set([...variants, ...stack, ...fallback])];
}

function styleFontWeight(key) {
  const weight = Number(layerStyles[key]?.fontWeight);
  return Number.isFinite(weight) ? clamp(weight, 400, 800) : 550;
}

function styleItalic(key) {
  return Boolean(layerStyles[key]?.italic);
}

function styleFontStretch(key) {
  const stretch = Number(layerStyles[key]?.fontStretch);
  return Number.isFinite(stretch) ? clamp(stretch, 70, 140) : 100;
}

function styleFontScaleY(key) {
  const scale = Number(layerStyles[key]?.fontScaleY);
  return Number.isFinite(scale) ? clamp(scale, 80, 130) : 100;
}

function styleLetterSpacing(key) {
  const spacing = Number(layerStyles[key]?.letterSpacing);
  return Number.isFinite(spacing) ? clamp(spacing, -0.08, 0.16) : 0;
}

function styleWordSpacing(key) {
  const spacing = Number(layerStyles[key]?.wordSpacing);
  return Number.isFinite(spacing) ? clamp(spacing, -0.08, 0.18) : 0;
}

function styleTextCase(key) {
  const value = layerStyles[key]?.textCase;
  return value === "upper" || value === "lower" || value === "title" ? value : "normal";
}

function styleLabelBackgroundColor(key) {
  return normalizeHex(layerStyles[key]?.labelBackgroundColor) || "#ffffff";
}

function styleLabelBackgroundOpacity(key) {
  const opacity = Number(layerStyles[key]?.labelBackgroundOpacity);
  return Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 0.86;
}

function formatMapLabelText(text, key) {
  const value = String(text || "");
  const mode = styleTextCase(key);
  if (mode === "upper") return value.toLocaleUpperCase();
  if (mode === "lower") return value.toLocaleLowerCase();
  if (mode === "title") {
    return value.toLocaleLowerCase().replace(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*/gu, word => (
      word.charAt(0).toLocaleUpperCase() + word.slice(1)
    ));
  }
  return value;
}

function labelHaloWidthForStyle(key) {
  const size = styleSize(key);
  return clamp(size / 7, 1.25, 3.4);
}

function applyLayerElementBlend(layer, key) {
  const element = layer?.getElement?.();
  if (element) element.style.mixBlendMode = styleBlend(key);
}

function styleHighColor(key) {
  return layerStyles[key].colorHigh || layerStyles[key].color;
}

function semanticTextureState(key) {
  const texture = styleTexture(key);
  return {
    texture: texture.type || "none",
    textureOpacity: texture.type === "none" ? 0 : clamp(texture.opacity * texture.blendAmount, 0, 1),
    textureBlend: isTextureBlendMode(texture.blend) ? texture.blend : "multiply",
    secondaryTexture: texture.secondaryEnabled ? texture.secondaryType : "none",
    secondaryTextureOpacity: texture.secondaryEnabled && texture.secondaryType !== "none" ? clamp(texture.secondaryOpacity, 0, 1) : 0,
    secondaryTextureBlend: isTextureBlendMode(texture.secondaryBlend) ? texture.secondaryBlend : "multiply"
  };
}

function semanticFontState(key) {
  return {
    size: styleSize(key),
    font: layerStyles[key]?.font,
    fontWeight: styleFontWeight(key),
    italic: styleItalic(key),
    fontStretch: styleFontStretch(key),
    fontScaleY: styleFontScaleY(key),
    letterSpacing: styleLetterSpacing(key),
    wordSpacing: styleWordSpacing(key),
    textCase: styleTextCase(key),
    labelBackground: Boolean(layerStyles[key]?.labelBackground),
    labelBackgroundColor: styleLabelBackgroundColor(key),
    labelBackgroundOpacity: styleLabelBackgroundOpacity(key),
    haloWidth: labelHaloWidthForStyle(key)
  };
}

function activeThemeFromLayerStyles() {
  return {
    land: {
      color: styleColor("land"),
      opacity: styleOpacity("land"),
      ...semanticTextureState("land")
    },
    water: {
      color: styleColor("water"),
      opacity: styleOpacity("water"),
      ...semanticTextureState("water")
    },
    deserts: {
      color: styleColor("deserts"),
      opacity: styleOpacity("deserts"),
      ...semanticTextureState("deserts")
    },
    parks: {
      color: styleColor("parks"),
      opacity: styleOpacity("parks"),
      ...semanticTextureState("parks")
    },
    buildings: {
      color: styleColor("buildings"),
      opacity: styleOpacity("buildings"),
      ...semanticTextureState("buildings")
    },
    topography: {
      color: styleColor("topography"),
      colorHigh: styleHighColor("topography"),
      opacity: styleOpacity("topography"),
      size: styleSize("topography")
    },
    faintTopography: {
      color: styleColor("faintTopography"),
      colorHigh: styleHighColor("faintTopography"),
      opacity: styleOpacity("faintTopography"),
      size: styleSize("faintTopography")
    },
    highways: {
      color: styleColor("highways"),
      opacity: styleOpacity("highways"),
      width: layerStyles.highways.size
    },
    majorRoads: {
      color: styleColor("majorRoads"),
      opacity: styleOpacity("majorRoads"),
      width: layerStyles.majorRoads.size
    },
    minorRoads: {
      color: styleColor("minorRoads"),
      opacity: styleOpacity("minorRoads"),
      width: layerStyles.minorRoads.size
    },
    railroads: {
      color: styleColor("railroads"),
      opacity: styleOpacity("railroads"),
      width: layerStyles.railroads.size
    },
    streets: {
      color: styleColor("majorRoads"),
      opacity: styleOpacity("majorRoads"),
      width: layerStyles.majorRoads.size
    },
    faintStreets: {
      color: styleColor("minorRoads"),
      opacity: styleOpacity("minorRoads"),
      width: layerStyles.minorRoads.size
    },
    stateLines: {
      color: styleColor("stateBorders"),
      opacity: styleOpacity("stateBorders"),
      width: layerStyles.stateBorders.size
    },
    countryBorders: {
      color: styleColor("countryBorders"),
      opacity: styleOpacity("countryBorders"),
      width: layerStyles.countryBorders.size
    },
    stateBorders: {
      color: styleColor("stateBorders"),
      opacity: styleOpacity("stateBorders"),
      width: layerStyles.stateBorders.size
    },
    countyBorders: {
      color: styleColor("countyBorders"),
      opacity: styleOpacity("countyBorders"),
      width: layerStyles.countyBorders.size
    },
    labels: {
      color: styleColor("cities"),
      opacity: Math.max(styleOpacity("smallTowns"), styleOpacity("cities"), styleOpacity("capitols"), styleOpacity("pois"))
    },
    smallTowns: {
      color: styleColor("smallTowns"),
      opacity: styleOpacity("smallTowns"),
      ...semanticFontState("smallTowns")
    },
    cities: {
      color: styleColor("cities"),
      opacity: styleOpacity("cities"),
      ...semanticFontState("cities")
    },
    capitals: {
      color: styleColor("capitols"),
      opacity: styleOpacity("capitols"),
      ...semanticFontState("capitols")
    },
    pois: {
      color: styleColor("pois"),
      opacity: styleOpacity("pois"),
      ...semanticFontState("pois")
    },
    texture: {
      color: styleColor("texture"),
      opacity: styleOpacity("texture"),
      ...semanticTextureState("texture")
    }
  };
}

const MAPLIBRE_THEME_LAYER_ROLES = {
  land: ["land", "landcover", "landuse", "park", "forest", "wood", "background"],
  water: ["water", "waterway", "ocean", "lake", "river"],
  road: ["road-primary", "road-secondary", "road-trunk", "road-motorway", "motorway", "trunk", "primary", "secondary", "major"],
  "minor-road": ["road-minor", "road-service", "road-path", "minor", "service", "tertiary", "track", "path"],
  boundary: ["boundary", "admin", "border", "state"],
  label: ["place-label", "road-label", "water-label", "label", "place", "city", "town"]
};

const MAP_THEME_GROUPS = {
  land: [],
  water: [],
  deserts: [],
  parks: [],
  buildings: [],
  highways: [],
  majorRoads: [],
  minorRoads: [],
  railroads: [],
  smallTowns: [],
  cities: [],
  capitals: [],
  pois: [],
  countryBorders: [],
  stateBorders: [],
  countyBorders: []
};

let mapThemeLayerGroupsSignature = "";

function haversineMiles(a, b) {
  const miles = 3958.8;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * miles * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function routeMiles(points) {
  return points.slice(1).reduce((total, point, index) => total + haversineMiles(points[index], point), 0);
}

function formatPoint(point) {
  return `${point.lat.toFixed(4)}, ${point.lon.toFixed(4)}`;
}

function setEndpointCell(cell, name, point) {
  if (!cell) return;
  cell.replaceChildren();
  const nameEl = document.createElement("span");
  nameEl.className = "endpoint-name";
  nameEl.textContent = name;
  const coordsEl = document.createElement("span");
  coordsEl.className = "endpoint-coordinates";
  coordsEl.textContent = formatPoint(point);
  coordsEl.hidden = !Boolean(els.showEndpointGps?.checked);
  cell.append(nameEl, coordsEl);
}

function setEndpointStats(kind, name, point) {
  const isStart = kind === "start";
  const nameTarget = isStart ? els.startName : els.endName;
  const gpsTarget = isStart ? els.startGps : els.endGps;
  const legacyTarget = isStart ? els.start : els.end;
  const coordinates = point ? formatPoint(point) : "--";
  if (nameTarget) nameTarget.textContent = name || "--";
  if (gpsTarget) {
    gpsTarget.textContent = coordinates;
    gpsTarget.hidden = !Boolean(els.showEndpointGps?.checked);
  }
  if (legacyTarget) setEndpointCell(legacyTarget, name, point);
}

function snapshotRouteEndpointNames(route) {
  return route ? {
    startAddress: route.startAddress || "",
    endAddress: route.endAddress || "",
    startQuery: route.startQuery || "",
    endQuery: route.endQuery || "",
    startName: route.startName || "",
    endName: route.endName || "",
    startNameIndependent: Boolean(route.startNameIndependent)
  } : null;
}

function restoreRouteEndpointNames(route, snapshot) {
  if (!route || !snapshot) return;
  route.startAddress = snapshot.startAddress || route.startAddress;
  route.endAddress = snapshot.endAddress || route.endAddress;
  route.startQuery = snapshot.startQuery || route.startQuery;
  route.endQuery = snapshot.endQuery || route.endQuery;
  route.startName = snapshot.startName;
  route.endName = snapshot.endName;
  route.startNameIndependent = snapshot.startNameIndependent;
  route.summary = `${routeEndpointName(route, "start")} to ${routeEndpointName(route, "end")}`;
}

function toLatLng(point) {
  return [point.lat, point.lon];
}

function routePointSegmentDistanceSquared(point, start, end) {
  let x = start.lon;
  let y = start.lat;
  let dx = end.lon - x;
  let dy = end.lat - y;
  if (dx || dy) {
    const t = ((point.lon - x) * dx + (point.lat - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end.lon;
      y = end.lat;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = point.lon - x;
  dy = point.lat - y;
  return dx * dx + dy * dy;
}

function simplifyRouteSection(points, first, last, toleranceSquared, keep) {
  const sections = [[first, last]];
  while (sections.length) {
    const [sectionFirst, sectionLast] = sections.pop();
    let furthestDistance = toleranceSquared;
    let furthestIndex = -1;
    for (let index = sectionFirst + 1; index < sectionLast; index += 1) {
      const distance = routePointSegmentDistanceSquared(points[index], points[sectionFirst], points[sectionLast]);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthestIndex = index;
      }
    }
    if (furthestIndex < 0) continue;
    keep.add(furthestIndex);
    if (furthestIndex - sectionFirst > 1) sections.push([sectionFirst, furthestIndex]);
    if (sectionLast - furthestIndex > 1) sections.push([furthestIndex, sectionLast]);
  }
}

function smoothRoutePoints(points, tolerance = 0.00008, maxPoints = 1400) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  const keep = new Set([0, points.length - 1]);
  simplifyRouteSection(points, 0, points.length - 1, tolerance * tolerance, keep);
  let simplified = [...keep].sort((a, b) => a - b).map(index => points[index]);
  if (simplified.length > maxPoints) {
    const capped = [simplified[0]];
    const stride = (simplified.length - 1) / (maxPoints - 1);
    for (let index = 1; index < maxPoints - 1; index += 1) {
      capped.push(simplified[Math.round(index * stride)]);
    }
    capped.push(simplified[simplified.length - 1]);
    simplified = capped;
  }
  return simplified;
}

function markerShapePath(shape) {
  switch (shape) {
    case "pin":
      return "M32 5C20 5 10 14.6 10 26.5C10 42 32 59 32 59S54 42 54 26.5C54 14.6 44 5 32 5Z";
    case "square":
      return "M12 12H52V52H12Z";
    case "diamond":
      return "M32 7L57 32L32 57L7 32Z";
    case "star":
      return "M32 6L39.2 23.2L57.8 24.8L43.7 37L48 55.2L32 45.6L16 55.2L20.3 37L6.2 24.8L24.8 23.2Z";
    case "heart":
      return "M32 55S9 41.2 9 23.5C9 14.8 15.7 9 23.3 9C27.6 9 30.4 11.1 32 13.5C33.6 11.1 36.4 9 40.7 9C48.3 9 55 14.8 55 23.5C55 41.2 32 55 32 55Z";
    case "triangle":
      return "M32 8L57 54H7Z";
    case "hexagon":
      return "M32 6L54 19V45L32 58L10 45V19Z";
    case "octagon":
      return "M23 7H41L57 23V41L41 57H23L7 41V23Z";
    case "cross":
      return "M24 7H40V24H57V40H40V57H24V40H7V24H24Z";
    case "shield":
      return "M32 6L54 14V29C54 43 44 52 32 58C20 52 10 43 10 29V14Z";
    case "capsule":
      return "M18 12H46A20 20 0 0 1 46 52H18A20 20 0 0 1 18 12Z";
    default:
      return "M32 6A26 26 0 1 1 32 58A26 26 0 1 1 32 6";
  }
}

function loadRouteAnimationIconRecents() {
  const parsed = rvStorageReadJson(ROUTE_ANIMATION_ICON_RECENTS_KEY, []);
  return Array.isArray(parsed)
    ? parsed
        .filter(item => item && typeof item.url === "string" && item.url.startsWith("data:image/"))
        .map(item => ({
          name: String(item.name || "Uploaded icon"),
          url: item.url
        }))
        .slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS)
    : [];
}

function saveRouteAnimationIconRecents(recents) {
  rvStorageWriteJson(ROUTE_ANIMATION_ICON_RECENTS_KEY, recents.slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS));
}

let routeAnimationIconRecents = loadRouteAnimationIconRecents();
let townMarkerImageRecents = loadStoredImageRecents(TOWN_MARKER_IMAGE_RECENTS_KEY);

function loadStoredImageRecents(key) {
  const parsed = rvStorageReadJson(key, []);
  return Array.isArray(parsed)
    ? parsed
        .filter(item => item && typeof item.url === "string" && item.url.startsWith("data:image/"))
        .map(item => ({ name: String(item.name || "Uploaded image"), url: item.url }))
        .slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS)
    : [];
}

function saveStoredImageRecents(key, recents) {
  rvStorageWriteJson(key, recents.slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS));
}

function normalizeRouteAnimationIconSettings(settings = DEFAULT_ROUTE_ANIMATION_ICON) {
  const source = settings && typeof settings === "object" ? settings : {};
  const fallbackStrokes = DEFAULT_ROUTE_ANIMATION_ICON.strokes.map(normalizeMarkerStroke);
  const strokes = Array.isArray(source.strokes)
    ? source.strokes.map(normalizeMarkerStroke)
    : fallbackStrokes;
  const imageStrokes = Array.isArray(source.imageStrokes)
    ? source.imageStrokes.map(normalizeMarkerStroke)
    : (DEFAULT_ROUTE_ANIMATION_ICON.imageStrokes || []).map(normalizeMarkerStroke);
  const fillMode = ["shape", "image", "none"].includes(source.fillMode)
    ? source.fillMode
    : source.fillEnabled === false
      ? "none"
      : DEFAULT_ROUTE_ANIMATION_ICON.fillMode;
  return {
    enabled: source.enabled !== false,
    hideAtTown: ROUTE_ANIMATION_HIDE_TARGETS.has(source.hideAtTown) ? source.hideAtTown : DEFAULT_ROUTE_ANIMATION_ICON.hideAtTown,
    imageUrl: typeof source.imageUrl === "string" && (
      source.imageUrl.startsWith("data:image/") ||
      source.imageUrl.startsWith("blob:") ||
      source.imageUrl.startsWith("assets/") ||
      /^https?:\/\//i.test(source.imageUrl)
    ) ? source.imageUrl : DEFAULT_ROUTE_ANIMATION_ICON.imageUrl,
    imageName: String(source.imageName || ""),
    size: clamp(Number(source.size ?? DEFAULT_ROUTE_ANIMATION_ICON.size), 0, 100),
    imageSize: clamp(Number(source.imageSize ?? DEFAULT_ROUTE_ANIMATION_ICON.imageSize), 0, ROUTE_ANIMATION_IMAGE_SIZE_MAX),
    backgroundEnabled: source.backgroundEnabled !== false,
    backgroundShape: MARKER_SHAPES.has(source.backgroundShape) ? source.backgroundShape : DEFAULT_ROUTE_ANIMATION_ICON.backgroundShape,
    backgroundSize: clamp(Number(source.backgroundSize ?? source.shapeSize ?? DEFAULT_ROUTE_ANIMATION_ICON.backgroundSize), 0, ROUTE_ANIMATION_SHAPE_SIZE_MAX),
    fillEnabled: fillMode !== "none",
    fillMode,
    backgroundFill: /^#[0-9a-f]{6}$/i.test(source.backgroundFill || "") ? source.backgroundFill : DEFAULT_ROUTE_ANIMATION_ICON.backgroundFill,
    strokes,
    imageStrokes
  };
}

function routeAnimationIconSizePx(settings) {
  if (!settings.enabled || settings.size <= 0) return 0;
  if (typeof isMaintenanceSiteMode === "function" && isMaintenanceSiteMode()) {
    return Math.round(getMaintenanceRouteSettings().size);
  }
  return Math.round(10 + settings.size * 0.5);
}

function maintenanceRouteIconSymbol() {
  return typeof isMaintenanceSiteMode === "function" && isMaintenanceSiteMode()
    ? getMaintenanceRouteSettings().icon
    : "";
}

function sizeSliderToInternal(value, max) {
  const sliderMax = max === ROUTE_ANIMATION_IMAGE_SIZE_MAX ? IMAGE_SIZE_SLIDER_MAX : 100;
  const slider = clamp(Number(value), 0, sliderMax);
  return slider <= 0 ? 0 : Math.round(slider / sliderMax * max);
}

function internalSizeToSlider(value, max) {
  const sliderMax = max === ROUTE_ANIMATION_IMAGE_SIZE_MAX ? IMAGE_SIZE_SLIDER_MAX : 100;
  return Math.round(clamp(Number(value), 0, max) / max * sliderMax);
}

function getRouteAnimationIconSettings({ trip = false } = {}) {
  const base = normalizeRouteAnimationIconSettings({
    enabled: els.routeAnimationIconEnabled?.checked,
    hideAtTown: els.routeAnimationIconHideAtTown?.value,
    imageUrl: els.routeAnimationIconRecent?.value || "",
    imageName: els.routeAnimationIconRecent?.selectedOptions?.[0]?.textContent || "",
    size: Number(els.routeAnimationIconSize?.value ?? DEFAULT_ROUTE_ANIMATION_ICON.size),
    imageSize: sizeSliderToInternal(els.routeAnimationIconImageSize?.value ?? internalSizeToSlider(DEFAULT_ROUTE_ANIMATION_ICON.imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX), ROUTE_ANIMATION_IMAGE_SIZE_MAX),
    backgroundEnabled: els.routeAnimationIconBackgroundEnabled?.checked,
    backgroundShape: els.routeAnimationIconBackgroundShape?.value,
    backgroundSize: sizeSliderToInternal(els.routeAnimationIconShapeSize?.value ?? internalSizeToSlider(DEFAULT_ROUTE_ANIMATION_ICON.backgroundSize, ROUTE_ANIMATION_SHAPE_SIZE_MAX), ROUTE_ANIMATION_SHAPE_SIZE_MAX),
    fillEnabled: els.routeAnimationIconFillMode ? els.routeAnimationIconFillMode.value !== "none" : els.routeAnimationIconFillEnabled?.checked,
    fillMode: els.routeAnimationIconFillMode?.value,
    backgroundFill: els.routeAnimationIconBackgroundFill?.value,
    strokes: currentRouteAnimationIconStrokes(),
    imageStrokes: currentRouteAnimationIconImageStrokes()
  });
  // Maintenance deliberately owns a tiny, predictable icon vocabulary. It
  // must not inherit a large uploaded editor icon from the normal map UI.
  if (typeof isMaintenanceSiteMode === "function" && isMaintenanceSiteMode()) {
    return normalizeRouteAnimationIconSettings({ ...base, enabled: true, imageUrl: "", imageName: "", size: 100 });
  }
  if (!(trip || state.playback?.tripAnimation) || !els.tripAnimationSeparateIcon?.checked) return base;
  return normalizeRouteAnimationIconSettings({
    ...base,
    imageUrl: els.tripAnimationIconRecent?.value || base.imageUrl,
    imageName: els.tripAnimationIconRecent?.selectedOptions?.[0]?.textContent || base.imageName,
    size: Number(els.tripAnimationIconSize?.value ?? base.size)
  });
}

function currentRouteAnimationIconStrokes() {
  if (!els.routeAnimationIconStrokeList) return DEFAULT_ROUTE_ANIMATION_ICON.strokes.map(normalizeMarkerStroke);
  const rows = [...els.routeAnimationIconStrokeList.querySelectorAll(".marker-stroke-row")];
  return rows.map((row, index) => normalizeMarkerStroke({
    id: row.dataset.strokeId || `route-icon-stroke-${index}`,
    color: row.querySelector('input[type="color"]')?.value,
    size: Number(row.querySelector('input[type="range"]')?.value),
    hidden: row.dataset.strokeHidden === "true"
  }, index));
}

function currentRouteAnimationIconImageStrokes() {
  if (!els.routeAnimationIconImageStrokeList) return (DEFAULT_ROUTE_ANIMATION_ICON.imageStrokes || []).map(normalizeMarkerStroke);
  const rows = [...els.routeAnimationIconImageStrokeList.querySelectorAll(".marker-stroke-row")];
  return rows.map((row, index) => normalizeMarkerStroke({
    id: row.dataset.strokeId || `route-icon-image-stroke-${index}`,
    color: row.querySelector('input[type="color"]')?.value,
    size: Number(row.querySelector('input[type="range"]')?.value),
    hidden: row.dataset.strokeHidden === "true"
  }, index));
}

function renderRouteAnimationIconRecentOptions() {
  if (!els.routeAnimationIconRecent) return;
  const currentValue = els.routeAnimationIconRecent.value;
  els.routeAnimationIconRecent.replaceChildren(new Option("Default arrow", ""));
  routeAnimationIconRecents.forEach((item, index) => {
    const option = new Option(item.name || `Uploaded icon ${index + 1}`, item.url);
    els.routeAnimationIconRecent.append(option);
  });
  if ([...els.routeAnimationIconRecent.options].some(option => option.value === currentValue)) {
    els.routeAnimationIconRecent.value = currentValue;
  }
  if (els.tripAnimationIconRecent) {
    const tripCurrent = els.tripAnimationIconRecent.value;
    els.tripAnimationIconRecent.replaceChildren(new Option("Use route animation icon", ""));
    routeAnimationIconRecents.forEach((item, index) => els.tripAnimationIconRecent.append(new Option(item.name || `Uploaded icon ${index + 1}`, item.url)));
    if ([...els.tripAnimationIconRecent.options].some(option => option.value === tripCurrent)) els.tripAnimationIconRecent.value = tripCurrent;
  }
}

function renderTownMarkerImageRecentOptions() {
  if (!els.markerImageRecent) return;
  const currentValue = els.markerImageRecent.value;
  els.markerImageRecent.replaceChildren(new Option("Default marker", ""));
  townMarkerImageRecents.forEach((item, index) => {
    els.markerImageRecent.append(new Option(item.name || `Marker image ${index + 1}`, item.url));
  });
  if ([...els.markerImageRecent.options].some(option => option.value === currentValue)) {
    els.markerImageRecent.value = currentValue;
  }
}

function applyRouteAnimationIconSettings(settings = DEFAULT_ROUTE_ANIMATION_ICON) {
  const normalized = normalizeRouteAnimationIconSettings(settings);
  if (els.routeAnimationIconEnabled) els.routeAnimationIconEnabled.checked = normalized.enabled;
  if (els.routeAnimationIconHideAtTown) els.routeAnimationIconHideAtTown.value = normalized.hideAtTown;
  if (els.routeAnimationIconSize) els.routeAnimationIconSize.value = String(normalized.size);
  if (els.routeAnimationIconSizeValue) els.routeAnimationIconSizeValue.textContent = normalized.size === 0 ? "Off" : String(Math.round(normalized.size));
  const imageSlider = internalSizeToSlider(normalized.imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX);
  const shapeSlider = internalSizeToSlider(normalized.backgroundSize, ROUTE_ANIMATION_SHAPE_SIZE_MAX);
  if (els.routeAnimationIconImageSize) els.routeAnimationIconImageSize.value = String(imageSlider);
  if (els.routeAnimationIconImageSizeValue) els.routeAnimationIconImageSizeValue.textContent = imageSlider === 0 ? "Off" : String(imageSlider);
  if (els.routeAnimationIconShapeSize) els.routeAnimationIconShapeSize.value = String(shapeSlider);
  if (els.routeAnimationIconShapeSizeValue) els.routeAnimationIconShapeSizeValue.textContent = shapeSlider === 0 ? "Off" : String(shapeSlider);
  if (els.routeAnimationIconBackgroundEnabled) els.routeAnimationIconBackgroundEnabled.checked = normalized.backgroundEnabled;
  if (els.routeAnimationIconBackgroundShape) els.routeAnimationIconBackgroundShape.value = normalized.backgroundShape;
  if (els.routeAnimationIconFillEnabled) els.routeAnimationIconFillEnabled.checked = normalized.fillEnabled;
  if (els.routeAnimationIconFillMode) els.routeAnimationIconFillMode.value = normalized.fillMode;
  if (els.routeAnimationIconBackgroundFill) els.routeAnimationIconBackgroundFill.value = normalized.backgroundFill;
  renderRouteAnimationIconStrokeControls(normalized.strokes);
  renderRouteAnimationIconImageStrokeControls(normalized.imageStrokes);
  if (normalized.imageUrl && !routeAnimationIconRecents.some(item => item.url === normalized.imageUrl)) {
    routeAnimationIconRecents = [{ name: normalized.imageName || "Imported icon", url: normalized.imageUrl }, ...routeAnimationIconRecents].slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS);
    saveRouteAnimationIconRecents(routeAnimationIconRecents);
  }
  renderRouteAnimationIconRecentOptions();
  if (els.routeAnimationIconRecent) els.routeAnimationIconRecent.value = normalized.imageUrl;
  updateRouteAnimationIconControls();
}

function updateTripAnimationIconControls() {
  if (!els.tripAnimationSeparateIcon) return;
  const separate = els.tripAnimationSeparateIcon.checked;
  if (els.tripAnimationIconControls) els.tripAnimationIconControls.hidden = !separate;
  if (els.tripAnimationIconSizeValue) els.tripAnimationIconSizeValue.textContent = els.tripAnimationIconSize?.value || "0";
  const previewSettings = getRouteAnimationIconSettings({ trip: true });
  if (els.tripAnimationIconPreview) {
    els.tripAnimationIconPreview.innerHTML = routeAnimationLeafletIcon(previewSettings, { iconSize: 74 }).options.html || "";
  }
}

function routeAnimationLeafletIcon(settings = getRouteAnimationIconSettings(), options = {}) {
  const iconSettings = normalizeRouteAnimationIconSettings(settings);
  const iconSize = options.iconSize || routeAnimationIconSizePx(iconSettings);
  if (!iconSize) {
    return L.divIcon({ className: "route-playback-icon is-hidden", html: "", iconSize: [0, 0], iconAnchor: [0, 0] });
  }
  const noFill = iconSettings.fillMode === "none";
  const fitToImage = iconSettings.fillMode === "image" && iconSettings.imageUrl;
  const path = markerShapePath(iconSettings.backgroundShape);
  const strokeScale = Math.max(0.28, iconSettings.size / 100);
  const shapeInset = Math.max(-20, (100 - iconSettings.backgroundSize) / 2);
  const visibleShapeStrokes = iconSettings.strokes.filter(stroke => !stroke.hidden);
  const shapeStrokes = !noFill && !fitToImage ? visibleShapeStrokes.map((stroke, index) => ({ stroke, index })).reverse().map(({ stroke, index }) => {
    const cumulative = visibleShapeStrokes.slice(0, index + 1).reduce((total, item) => total + item.size, 0) * strokeScale;
    const width = Math.max(0, cumulative * 2 + 0.35);
    return `<path d="${path}" fill="none" stroke="${stroke.color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join("") : "";
  const fill = !noFill && iconSettings.fillMode !== "image" ? iconSettings.backgroundFill : "none";
  const background = iconSettings.backgroundEnabled && !fitToImage && !noFill
    ? `<svg class="route-playback-icon-shape" style="z-index:1;inset:${shapeInset}%;" viewBox="0 0 64 64" aria-hidden="true">${shapeStrokes}<path d="${path}" fill="${fill}" stroke="none"/></svg>`
    : "";
  const visibleImageStrokes = iconSettings.imageStrokes.filter(stroke => !stroke.hidden);
  const imageStrokeSvg = iconSettings.imageUrl && visibleImageStrokes.length
    ? routeAnimationImageStrokeSvg(iconSettings, visibleImageStrokes)
    : "";
  const imageLayer = fitToImage
    ? routeAnimationImageCompositeSvg(iconSettings)
    : iconSettings.imageUrl
      ? routeAnimationImageSvg(iconSettings.imageUrl, iconSettings.imageSize)
      : "";
  const maintenanceIcon = maintenanceRouteIconSymbol();
  const content = iconSettings.imageUrl
    ? ""
    : maintenanceIcon
      ? `<span class="route-playback-icon-content route-playback-icon-maintenance" aria-hidden="true">${escapeHtml(maintenanceIcon)}</span>`
    : `<span class="route-playback-icon-content"><span class="material-symbols-rounded" aria-hidden="true">navigation</span></span>`;
  return L.divIcon({
    className: "route-playback-icon",
    html: `<span class="route-playback-icon-frame" style="width:${iconSize}px;height:${iconSize}px;">${imageStrokeSvg}${background}${content}${imageLayer}</span>`,
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize / 2, iconSize / 2]
  });
}

function routeAnimationImageSvg(imageUrl, imageSize = DEFAULT_ROUTE_ANIMATION_ICON.imageSize) {
  if (!String(imageUrl || "").trim()) return "";
  const href = escapeHtml(imageUrl);
  const sliderSize = internalSizeToSlider(imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX);
  const boxSize = sliderSize / 100 * 64;
  const x = (64 - boxSize) / 2;
  const y = (64 - boxSize) / 2;
  return `<svg class="route-playback-icon-image" style="z-index:20;inset:0;width:100%;height:100%;" viewBox="0 0 64 64" aria-hidden="true"><image href="${href}" x="${x}" y="${y}" width="${boxSize}" height="${boxSize}" preserveAspectRatio="xMidYMid meet"/></svg>`;
}

function routeAnimationImageCompositeSvg(iconSettings) {
  if (!String(iconSettings?.imageUrl || "").trim()) return "";
  const filterId = `route-image-fill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const contentBox = routeAnimationImageContentBox();
  const href = escapeHtml(iconSettings.imageUrl);
  const inset = Math.max(-50, (100 - internalSizeToSlider(iconSettings.imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX)) / 2);
  return `<svg class="route-playback-icon-image-composite" style="inset:${inset}%;" viewBox="0 0 64 64" aria-hidden="true">
    <filter id="${filterId}" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">
      <feFlood flood-color="${iconSettings.backgroundFill}" result="color"/>
      <feComposite in="color" in2="SourceAlpha" operator="in"/>
    </filter>
    <image href="${href}" x="${contentBox.x}" y="${contentBox.y}" width="${contentBox.size}" height="${contentBox.size}" preserveAspectRatio="xMidYMid meet" filter="url(#${filterId})"/>
    <image href="${href}" x="${contentBox.x}" y="${contentBox.y}" width="${contentBox.size}" height="${contentBox.size}" preserveAspectRatio="xMidYMid meet"/>
  </svg>`;
}

function routeAnimationImageStrokeSvg(iconSettings, strokes = iconSettings.imageStrokes || []) {
  if (!String(iconSettings?.imageUrl || "").trim()) return "";
  const filterId = `route-image-stroke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const sliderSize = internalSizeToSlider(iconSettings.imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX);
  const boxSize = sliderSize / 100 * 64;
  const contentBox = {
    x: (64 - boxSize) / 2,
    y: (64 - boxSize) / 2,
    size: boxSize
  };
  const markup = strokes.map((stroke, index) => {
    const radius = Math.max(0.2, strokes.slice(0, index + 1).reduce((total, item) => total + item.size, 0) * 0.55);
    return `
      <filter id="${filterId}-${index}" x="-75%" y="-75%" width="250%" height="250%" color-interpolation-filters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="${radius.toFixed(2)}" result="expanded"/>
        <feComposite in="expanded" in2="SourceAlpha" operator="out" result="ring"/>
        <feFlood flood-color="${stroke.color}" result="color"/>
        <feComposite in="color" in2="ring" operator="in"/>
      </filter>
      <image href="${escapeHtml(iconSettings.imageUrl)}" x="${contentBox.x}" y="${contentBox.y}" width="${contentBox.size}" height="${contentBox.size}" preserveAspectRatio="xMidYMid meet" filter="url(#${filterId}-${index})"/>`;
  }).reverse().join("");
  return `<svg class="route-playback-icon-image-strokes" viewBox="0 0 64 64" aria-hidden="true">${markup}</svg>`;
}

function routeAnimationImageFillSvg(iconSettings) {
  if (!String(iconSettings?.imageUrl || "").trim()) return "";
  const filterId = `route-image-fill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const contentBox = routeAnimationImageContentBox();
  const href = escapeHtml(iconSettings.imageUrl);
  return `<svg class="route-playback-icon-image-fill" viewBox="0 0 64 64" aria-hidden="true">
    <filter id="${filterId}" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">
      <feFlood flood-color="${iconSettings.backgroundFill}" result="color"/>
      <feComposite in="color" in2="SourceAlpha" operator="in"/>
    </filter>
    <image href="${href}" x="${contentBox.x}" y="${contentBox.y}" width="${contentBox.size}" height="${contentBox.size}" preserveAspectRatio="xMidYMid meet" filter="url(#${filterId})"/>
  </svg>`;
}

function routeAnimationImageContentBox() {
  return { x: 14, y: 14, size: 36 };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const url = typeof reader.result === "string" ? reader.result : "";
      url ? resolve(url) : reject(new Error("Icon upload could not be read."));
    });
    reader.addEventListener("error", () => reject(reader.error || new Error("Icon upload failed.")));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Icon image could not be loaded."));
    image.src = src;
  });
}

async function optimizeRouteAnimationIconUpload(file) {
  const originalUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalUrl);
  const width = image.naturalWidth || image.width || ROUTE_ANIMATION_ICON_MAX_SOURCE_PX;
  const height = image.naturalHeight || image.height || ROUTE_ANIMATION_ICON_MAX_SOURCE_PX;
  const scale = Math.min(1, ROUTE_ANIMATION_ICON_MAX_SOURCE_PX / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) return { name: file.name || "Uploaded icon", url: originalUrl };
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const optimizedUrl = canvas.toDataURL("image/png");
  const baseName = (file.name || "uploaded-icon").replace(/\.[^.]+$/, "");
  return {
    name: `${baseName} optimized.png`,
    url: optimizedUrl,
    originalName: file.name || "",
    originalWidth: width,
    originalHeight: height,
    width: targetWidth,
    height: targetHeight
  };
}

async function exportRouteAnimationIconPng() {
  const settings = getRouteAnimationIconSettings();
  if (!settings.imageUrl) {
    if (els.status) els.status.textContent = "Upload or choose an icon before exporting.";
    return;
  }
  const image = await loadImageElement(settings.imageUrl);
  const sourceWidth = image.naturalWidth || image.width || ROUTE_ANIMATION_ICON_MAX_SOURCE_PX;
  const sourceHeight = image.naturalHeight || image.height || ROUTE_ANIMATION_ICON_MAX_SOURCE_PX;
  const exportSize = ROUTE_ANIMATION_ICON_MAX_SOURCE_PX;
  const scale = Math.min(exportSize / sourceWidth, exportSize / sourceHeight);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = exportSize;
  canvas.height = exportSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the icon export.");
  context.clearRect(0, 0, exportSize, exportSize);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    Math.round((exportSize - targetWidth) / 2),
    Math.round((exportSize - targetHeight) / 2),
    targetWidth,
    targetHeight
  );
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not create the icon PNG.");
  const name = safeDownloadName((settings.imageName || "route animation icon").replace(/\.[^.]+$/, ""));
  downloadBlob(`${name} ${exportSize}px.png`, blob);
  if (els.status) {
    els.status.textContent = `Exported ${exportSize} x ${exportSize} icon PNG from ${sourceWidth} x ${sourceHeight}.`;
  }
}

function refreshRouteAnimationIcon({ replayOverview = false } = {}) {
  const icon = routeAnimationLeafletIcon();
  if (state.playback.icon) {
    state.playback.icon._rvPresentationKey = "";
    updateRouteAnimationIconPresentation(state.playback.icon, state.activeRouteIndex, state.playback.progress);
  }
  const settings = getRouteAnimationIconSettings();
  if (state.overviewHover.icon) {
    if (settings.enabled && settings.size > 0) {
      state.overviewHover.icon.setIcon(icon);
    } else {
      overviewHoverRouteGroup.removeLayer(state.overviewHover.icon);
      state.overviewHover.icon = null;
    }
  } else if (!replayOverview && settings.enabled && settings.size > 0 && state.overviewMode && state.overviewHover.activeIndex !== null) {
    const route = state.routes[state.overviewHover.activeIndex];
    const point = route?.displayPoints?.[route.displayPoints.length - 1] || route?.displayPoints?.[0];
    if (point) {
      state.overviewHover.icon = L.marker(toLatLng(point), {
        pane: "markerPane",
        interactive: false,
        keyboard: false,
        icon
      });
      overviewHoverRouteGroup.addLayer(state.overviewHover.icon);
    }
  }
  renderRouteAnimationIconPreview();
  renderRouteAnimationStartIcon();
  refreshEndpointMarkers();
  if (replayOverview && state.overviewMode && state.overviewHover.activeIndex !== null) {
    animateOverviewRoute(state.overviewHover.activeIndex);
  }
}

function renderRouteAnimationIconPreview() {
  if (!els.routeAnimationIconPreview) return;
  const settings = normalizeRouteAnimationIconSettings(getRouteAnimationIconSettings());
  const previewSettings = {
    ...settings,
    size: 100
  };
  const icon = routeAnimationLeafletIcon(previewSettings, { iconSize: 92 });
  els.routeAnimationIconPreview.innerHTML = icon.options.html || "";
  addPreviewNudgeControls(els.routeAnimationIconPreview, "routeAnimation");
  updateImagePreviewDrawer(els.routeAnimationIconPreview, "Route animation icon");
}

function updateRouteAnimationIconControls() {
  const settings = getRouteAnimationIconSettings();
  updateTripAnimationIconControls();
  if (els.routeAnimationIconSizeValue) {
    els.routeAnimationIconSizeValue.textContent = settings.size === 0 ? "Off" : String(Math.round(settings.size));
  }
  if (els.routeAnimationIconImageSizeValue) {
    const value = internalSizeToSlider(settings.imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX);
    els.routeAnimationIconImageSizeValue.textContent = value === 0 ? "Off" : String(value);
  }
  if (els.routeAnimationIconShapeSizeValue) {
    const value = internalSizeToSlider(settings.backgroundSize, ROUTE_ANIMATION_SHAPE_SIZE_MAX);
    els.routeAnimationIconShapeSizeValue.textContent = value === 0 ? "Off" : String(value);
  }
  const disabled = !settings.enabled;
  [
    els.routeAnimationIconUpload,
    els.routeAnimationIconRecent,
    els.routeAnimationIconSize,
    els.routeAnimationIconImageSize,
    els.routeAnimationIconShapeSize,
    els.routeAnimationIconBackgroundEnabled,
    els.routeAnimationIconBackgroundShape,
    els.routeAnimationIconFillEnabled,
    els.routeAnimationIconFillMode,
    els.routeAnimationIconBackgroundFill,
    els.addRouteAnimationIconStroke,
    els.addRouteAnimationIconImageStroke
  ].forEach(control => {
    if (control) control.disabled = disabled;
  });
  if (els.exportRouteAnimationIcon) {
    els.exportRouteAnimationIcon.disabled = disabled || !settings.imageUrl;
  }
  const backgroundDisabled = disabled || !settings.backgroundEnabled;
  const noFill = settings.fillMode === "none";
  if (els.routeAnimationIconBackgroundShape) {
    els.routeAnimationIconBackgroundShape.disabled = backgroundDisabled || settings.fillMode === "image" || noFill;
  }
  [els.routeAnimationIconFillEnabled, els.routeAnimationIconFillMode].forEach(control => {
    if (control) control.disabled = disabled;
  });
  if (els.routeAnimationIconBackgroundFill) {
    els.routeAnimationIconBackgroundFill.disabled = backgroundDisabled || noFill;
  }
  if (els.addRouteAnimationIconStroke) {
    els.addRouteAnimationIconStroke.disabled = disabled || noFill;
  }
  if (els.addRouteAnimationIconImageStroke) {
    els.addRouteAnimationIconImageStroke.disabled = disabled || !settings.imageUrl;
  }
  els.routeAnimationIconStrokeList?.querySelectorAll("input, button").forEach(control => {
    control.disabled = disabled || noFill;
  });
  els.routeAnimationIconStrokeList?.classList.toggle("is-disabled", disabled || noFill);
  els.routeAnimationIconImageStrokeList?.querySelectorAll("input, button").forEach(control => {
    control.disabled = disabled || !settings.imageUrl;
  });
  els.routeAnimationIconImageStrokeList?.classList.toggle("is-disabled", disabled || !settings.imageUrl);
  refreshRouteAnimationIcon();
  updateMapFeatureToolbar();
}

function renderRouteAnimationIconStrokeControls(strokes = DEFAULT_ROUTE_ANIMATION_ICON.strokes) {
  renderRouteAnimationStrokeList(els.routeAnimationIconStrokeList, strokes, "shape");
}

function renderRouteAnimationIconImageStrokeControls(strokes = DEFAULT_ROUTE_ANIMATION_ICON.imageStrokes) {
  renderRouteAnimationStrokeList(els.routeAnimationIconImageStrokeList, strokes, "image");
}

function renderRouteAnimationStrokeList(list, strokes = [], kind = "shape") {
  if (!list) return;
  const normalized = strokes.map(normalizeMarkerStroke);
  list.replaceChildren();
  normalized.forEach((stroke, index) => {
    const row = document.createElement("div");
    row.className = "marker-stroke-row";
    row.classList.toggle("is-stroke-hidden", stroke.hidden);
    row.dataset.strokeId = stroke.id;
    row.dataset.strokeHidden = String(stroke.hidden);

    const grip = document.createElement("span");
    grip.className = "marker-stroke-grip";
    grip.draggable = true;
    grip.setAttribute("aria-hidden", "true");
    grip.dataset.help = `Drag this handle to reorder ${kind} strokes.`;

    const color = document.createElement("input");
    color.type = "color";
    color.value = stroke.color;
    color.dataset.help = `Changes this animation icon ${kind} stroke color.`;
    color.addEventListener("input", updateRouteAnimationIconControls);

    const sizeValue = document.createElement("button");
    sizeValue.type = "button";
    sizeValue.className = "stroke-visibility-toggle";
    sizeValue.setAttribute("aria-pressed", String(!stroke.hidden));
    setStrokeVisibilityIcon(sizeValue, stroke.size);
    sizeValue.dataset.help = "Temporarily hides or shows this stroke without deleting it.";
    sizeValue.addEventListener("click", () => {
      const hidden = row.dataset.strokeHidden !== "true";
      row.dataset.strokeHidden = String(hidden);
      row.classList.toggle("is-stroke-hidden", hidden);
      sizeValue.setAttribute("aria-pressed", String(!hidden));
      setStrokeVisibilityIcon(sizeValue, slider.value);
      updateRouteAnimationIconControls();
    });

    const divider = document.createElement("span");
    divider.className = "marker-stroke-divider";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "8";
    slider.step = "1";
    slider.value = String(stroke.size);
    const tickList = document.createElement("datalist");
    tickList.id = `route-stroke-ticks-${kind}-${stroke.id}`;
    for (let tick = 0; tick <= 8; tick += 1) tickList.append(new Option(String(tick), String(tick)));
    slider.setAttribute("list", tickList.id);
    slider.dataset.snapPoints = "0,1,2,3,4,5,6,7,8";
    slider.dataset.help = `Changes this animation icon ${kind} stroke thickness.`;
    slider.addEventListener("input", () => {
      const hidden = Number(slider.value) <= 0;
      row.dataset.strokeHidden = String(hidden);
      row.classList.toggle("is-stroke-hidden", hidden);
      sizeValue.setAttribute("aria-pressed", String(!hidden));
      setStrokeVisibilityIcon(sizeValue, slider.value);
      updateRouteAnimationIconControls();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.dataset.help = `Removes this ${kind} stroke from the animation icon.`;
    remove.addEventListener("click", () => {
      row.remove();
      updateRouteAnimationIconControls();
    });

    grip.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", stroke.id);
      row.classList.add("is-dragging");
    });
    grip.addEventListener("dragend", () => row.classList.remove("is-dragging"));
    row.addEventListener("dragover", event => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      const draggedRow = list.querySelector(`[data-stroke-id="${CSS.escape(draggedId)}"]`);
      if (!draggedRow || draggedRow === row) return;
      const box = row.getBoundingClientRect();
      list.insertBefore(draggedRow, event.clientY < box.top + box.height / 2 ? row : row.nextSibling);
    });
    row.addEventListener("drop", event => {
      event.preventDefault();
      updateRouteAnimationIconControls();
    });

    row.append(grip, color, sizeValue, divider, slider, remove, tickList);
    list.append(row);
  });
}

function markerSvg(settings, options = {}) {
  const marker = normalizeMarkerSettings(settings, options.fallback || DEFAULT_MARKER_SETTINGS, options.maxSize || MARKER_SIZE_INTERNAL_MAX);
  if (marker.size <= 0) {
    return { iconSize: 0, html: "" };
  }
  const strokeScale = Math.min(1, marker.size);
  const baseSize = Number.isFinite(options.baseSizePx)
    ? Math.max(1, options.baseSizePx)
    : Math.max(1, styleSize("startEnd") * 2 * marker.size);
  const shapeVisible = marker.shapeEnabled !== false && marker.fillMode !== "none";
  const showImage = Boolean(options.imageVisible && marker.imageUrl);
  const shapeStrokes = shapeVisible ? marker.strokes.filter(stroke => !stroke.hidden) : [];
  const visibleImageStrokes = showImage ? marker.imageStrokes.filter(stroke => !stroke.hidden) : [];
  const strokeTotal = Math.max(
    shapeStrokes.reduce((total, stroke) => total + stroke.size, 0),
    visibleImageStrokes.reduce((total, stroke) => total + stroke.size, 0)
  ) * strokeScale;
  const padding = Math.max(1, 8 * strokeScale);
  const iconSize = Math.max(1, Math.ceil(baseSize + strokeTotal * 2 + padding));
  const scale = iconSize / 64;
  const path = markerShapePath(marker.shape);
  const shapeInset = Math.max(-20, (100 - marker.shapeSize) / 2);
  const imageInset = Math.max(-50, (100 - internalSizeToSlider(marker.imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX)) / 2);
  const strokeMarkup = shapeStrokes.map((stroke, index) => ({ stroke, index })).reverse().map(({ stroke, index }) => {
    const cumulative = shapeStrokes.slice(0, index + 1).reduce((total, item) => total + item.size, 0) * strokeScale;
    const width = Math.max(0, (cumulative * 2 + 0.35 * strokeScale) / scale);
    return `<path d="${path}" fill="none" stroke="${stroke.color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }).join("");
  const imageStrokeMarkup = showImage ? visibleImageStrokes.map((stroke, index) => {
    const radius = Math.max(0.2, visibleImageStrokes.slice(0, index + 1).reduce((total, item) => total + item.size, 0) * 0.55);
    const filterId = `town-marker-image-stroke-${index}-${Math.random().toString(36).slice(2, 7)}`;
    return `
      <filter id="${filterId}" x="-35%" y="-35%" width="170%" height="170%" color-interpolation-filters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="${radius.toFixed(2)}" result="expanded"/>
        <feComposite in="expanded" in2="SourceAlpha" operator="out" result="ring"/>
        <feFlood flood-color="${stroke.color}" result="color"/>
        <feComposite in="color" in2="ring" operator="in"/>
      </filter>
      <image href="${escapeHtml(marker.imageUrl)}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid meet" filter="url(#${filterId})"/>`;
  }).reverse().join("") : "";
  const fill = shapeVisible && marker.fillEnabled && marker.fillMode === "shape" ? marker.fillColor : "none";
  const selectedGlow = options.selected && shapeVisible
    ? `<path class="route-endpoint-marker-glow" d="${path}" fill="none" stroke="${readableTextColor(marker.fillColor)}" stroke-width="${Math.max(2, 6 * strokeScale / scale)}" stroke-linejoin="round" stroke-linecap="round"/>`
    : "";
  const shapeMarkup = shapeVisible
    ? `<svg class="route-endpoint-marker-svg" viewBox="0 0 64 64" style="inset:${shapeInset}%;">${selectedGlow}${strokeMarkup}<path d="${path}" fill="${fill}" stroke="none"/></svg>`
    : "";
  const imageMarkup = showImage
    ? `<svg class="route-endpoint-marker-image-layer" style="inset:${imageInset}%;" viewBox="0 0 64 64">${imageStrokeMarkup}<image href="${escapeHtml(marker.imageUrl)}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>`
    : "";
  const imageFillMarkup = showImage && marker.fillEnabled && marker.fillMode === "image"
    ? (() => {
      const filterId = `town-marker-image-fill-${Math.random().toString(36).slice(2, 7)}`;
      return `<svg class="route-endpoint-marker-image-layer" style="inset:${imageInset}%;" viewBox="0 0 64 64">
        <filter id="${filterId}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
          <feFlood flood-color="${marker.fillColor}" result="color"/>
          <feComposite in="color" in2="SourceAlpha" operator="in"/>
        </filter>
        <image href="${escapeHtml(marker.imageUrl)}" x="0" y="0" width="64" height="64" preserveAspectRatio="xMidYMid meet" filter="url(#${filterId})"/>
      </svg>`;
    })()
    : "";
  return {
    iconSize,
    html: `<span class="route-endpoint-marker-frame${options.flash ? " is-flashing" : ""}${options.selected ? " is-selected" : ""}" style="width:${iconSize}px;height:${iconSize}px;opacity:${styleOpacity("startEnd")};mix-blend-mode:${styleBlend("startEnd")};">${shapeMarkup}${imageFillMarkup}${imageMarkup}</span>`
  };
}

function markerImageVisible(routeIndex, anchor, marker) {
  return Boolean(marker.imageUrl && markerDisplayVisible(routeIndex, anchor, marker));
}

function markerDisplayVisible(routeIndex, anchor, marker) {
  if (marker.imageDisplay === "never") return false;
  if (marker.imageDisplay === "always") return true;
  const reached = Number.isInteger(routeIndex) && (
    overviewRouteReached(routeIndex) ||
    routeIndex < state.activeRouteIndex ||
    (routeIndex === state.activeRouteIndex && (anchor === "start" || state.playback.hasStarted))
  );
  if (marker.imageDisplay === "before") return !reached;
  if (!Number.isInteger(routeIndex)) return false;
  if (overviewRouteReached(routeIndex)) return true;
  if (routeIndex < state.activeRouteIndex) return true;
  if (routeIndex > state.activeRouteIndex) return false;
  return anchor === "start" || state.playback.hasStarted;
}

function tripLandmarkSettings(trip = activeTrip()) {
  if (!trip) return cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
  trip.landmarkSettings = normalizeLandmarkSettings(trip.landmarkSettings);
  return trip.landmarkSettings;
}

function landmarkStopsForTrip(trip = activeTrip()) {
  if (!trip?.days?.length) return [];
  const stops = [];
  const addStop = (routeIndex, anchor) => {
    const trimmed = String(sharedStopNameForEndpoint(trip, routeIndex, anchor) || "").trim();
    const key = sharedStopKeyForEndpoint(trip, routeIndex, anchor);
    if (!key || stops.some(stop => stop.key === key)) return;
    stops.push({ key, name: trimmed, routeIndex, anchor });
  };
  addStop(0, "start");
  trip.days.forEach((route, index) => {
    addStop(index, "end");
  });
  return stops;
}

function landmarkStopForMarker(route, routeIndex, anchor, trip = activeTrip()) {
  const name = sharedStopNameForEndpoint(trip, routeIndex, anchor);
  const key = sharedStopKeyForEndpoint(trip, routeIndex, anchor);
  if (!key) return null;
  const known = landmarkStopsForTrip(trip).find(stop => stop.key === key);
  return known || { key, name, routeIndex, anchor };
}

function landmarkImageVisible(routeIndex, anchor, settings) {
  if (!settings.enabled || settings.imageDisplay === "never") return false;
  if (settings.imageDisplay === "always") return true;
  if (!Number.isInteger(routeIndex)) return false;
  // A landmark belongs to a stop, not to the leg currently selected for
  // editing. Using the selected stop keeps "Show after reached" honest when
  // the user arrives from either direction or returns to a saved stop view.
  const stopIndex = anchor === "start" ? routeIndex : routeIndex + 1;
  return stopIndex <= selectedStopIndex;
}

function landmarkMarkerSettingsFor(route, routeIndex, anchor, { forceVisible = false } = {}) {
  const trip = activeTrip();
  const landmarks = tripLandmarkSettings(trip);
  if (!landmarks.enabled) return null;
  const stop = landmarkStopForMarker(route, routeIndex, anchor, trip);
  if (!stop) return null;
  const legacyStopKey = landmarkStopKey(stop.name);
  const stopSettings = landmarks.stops[stop.key]
    || landmarks.stops[legacyStopKey]
    || Object.values(landmarks.stops).find(candidate => landmarkStopKey(candidate?.name) === landmarkStopKey(stop.name))
    || {};
  const showLocationImage = forceVisible || landmarkImageVisible(routeIndex, anchor, landmarks);
  if (!showLocationImage) return null;
  const defaultLandmarkMarker = normalizeMarkerSettings((landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS).marker, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX);
  const baseMarker = landmarks.useDefaultForAll ? defaultLandmarkMarker : landmarks.marker;
  const imageUrl = landmarks.useDefaultForAll
    ? defaultLandmarkMarker.imageUrl || DEFAULT_LANDMARK_IMAGE_URL
    : stopSettings.imageUrl || DEFAULT_LANDMARK_IMAGE_URL;
  const imageName = landmarks.useDefaultForAll
    ? defaultLandmarkMarker.imageName || "Default landmark"
    : stopSettings.imageName || "Default landmark";
  const stopMarker = landmarks.useDefaultForAll
    ? null
    : stopSettings.marker || (landmarks.perStopShapes && MARKER_SHAPES.has(stopSettings.shape) ? { shape: stopSettings.shape } : null);
  const stopIndex = anchor === "start" ? routeIndex : routeIndex + 1;
  const emphasizeReachedStop = !state.overviewMode && !state.playback.active && selectedStopIndex === stopIndex;
  const emphasis = emphasizeReachedStop ? 2 : 1;
  const journeyScale = clamp(Number(landmarks.scale ?? 1), 0, 2);
  return normalizeMarkerSettings({
    ...baseMarker,
    ...(stopMarker || {}),
    size: Number((stopMarker || {}).size ?? baseMarker.size) * journeyScale * emphasis,
    imageSize: Number((stopMarker || {}).imageSize ?? baseMarker.imageSize),
    shapeSize: Number((stopMarker || {}).shapeSize ?? baseMarker.shapeSize),
    imageDisplay: "always",
    imageUrl,
    imageName,
    fillEnabled: baseMarker.fillMode === "none" ? false : baseMarker.fillEnabled
  }, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_RENDER_SIZE_INTERNAL_MAX);
}

function markerTargetId(routeIndex, anchor) {
  return sharedStopKeyForEndpoint(activeTrip(), routeIndex, anchor) || `${routeIndex}:${anchor}`;
}

function routeAnimationHideAtTownTarget() {
  return getRouteAnimationIconSettings().hideAtTown || DEFAULT_ROUTE_ANIMATION_ICON.hideAtTown;
}

function routeAnimationEndpointThresholdMeters(route) {
  const iconSize = routeAnimationIconSizePx(getRouteAnimationIconSettings());
  return Math.max(110, iconSize * 3.2, routeDistanceMeters(route) * 0.004);
}

function animationIconNearEndpoint(iconMarker, route, anchor) {
  if (!iconMarker || !route?.points?.length) return false;
  const endpoint = anchor === "end" ? route.points[route.points.length - 1] : route.points[0];
  const iconLatLng = iconMarker.getLatLng?.();
  if (!iconLatLng || !Number.isFinite(endpoint?.lat) || !Number.isFinite(endpoint?.lon)) return false;
  return iconLatLng.distanceTo(toLatLng(endpoint)) <= routeAnimationEndpointThresholdMeters(route);
}

function shouldHideTownLayerForAnimation(routeIndex, anchor, layerType) {
  const hideTarget = routeAnimationHideAtTownTarget();
  if (hideTarget === "none") return false;
  if (hideTarget !== "both" && hideTarget !== layerType) return false;
  if (!getRouteAnimationIconSettings().enabled) return false;

  const route = state.routes[routeIndex];
  if (!route?.displayPoints?.length) return false;

  if (state.overviewMode && state.overviewFocusIndex === null) {
    return animationIconNearEndpoint(state.overviewHover.icon, route, anchor);
  }

  if (routeIndex !== state.activeRouteIndex || !state.playback.icon) return false;
  if (!state.playback.hasStarted && anchor !== "start") return false;
  return animationIconNearEndpoint(state.playback.icon, route, anchor);
}

function sharedMarkerEndpointSource(trip, routeIndex, anchor) {
  const days = trip?.days || state.routes;
  const route = days[routeIndex];
  if (anchor === "start" && routeIndex > 0) {
    return { route: days[routeIndex - 1], anchor: "end" };
  }
  return { route, anchor };
}

function markerEndpointSettings(route, anchor, trip = activeTrip(), routeIndex = state.routes.indexOf(route)) {
  const resolvedIndex = Number.isInteger(routeIndex) && routeIndex >= 0 ? routeIndex : state.routes.indexOf(route);
  const source = sharedMarkerEndpointSource(trip, resolvedIndex, anchor);
  const sourceRoute = source.route || route;
  const base = routeMarkerSettings(sourceRoute, trip);
  const endpoints = sourceRoute?.markerEndpoints && typeof sourceRoute.markerEndpoints === "object" ? sourceRoute.markerEndpoints : {};
  return normalizeMarkerSettings(endpoints[source.anchor], base);
}

function adjustLandmarkFromWheel(routeIndex, anchor, direction, allLandmarks) {
  const trip = activeTrip();
  if (!trip) return;
  const landmarks = tripLandmarkSettings(trip);
  if (allLandmarks) {
    landmarks.scale = clamp(Number(landmarks.scale || 1) + direction * 0.05, 0, 2);
  } else {
    const stop = landmarkStopForMarker(state.routes[routeIndex], routeIndex, anchor, trip);
    if (!stop) return;
    const existing = landmarks.stops[stop.key] || landmarks.stops[landmarkStopKey(stop.name)] || {};
    const base = normalizeMarkerSettings(existing.marker, landmarks.marker, LANDMARK_SIZE_INTERNAL_MAX);
    const slider = clamp(landmarkSizeToSlider(base.size) + direction * 2, 0, MARKER_SIZE_SLIDER_MAX);
    landmarks.stops[stop.key] = {
      ...existing,
      name: stop.name,
      marker: normalizeMarkerSettings({ ...base, size: landmarkSliderToSize(slider) }, landmarks.marker, LANDMARK_SIZE_INTERNAL_MAX)
    };
  }
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  scheduleTripsSave();
  refreshEndpointMarkers();
  renderLandmarks();
}

function adjustEndpointMarkerFromWheel(routeIndex, anchor, direction) {
  const trip = activeTrip();
  const source = sharedMarkerEndpointSource(trip, routeIndex, anchor);
  if (!source.route) return;
  const base = routeMarkerSettings(source.route, trip);
  const current = normalizeMarkerSettings(source.route.markerEndpoints?.[source.anchor], base);
  const slider = clamp(markerSizeToSlider(current.size) + direction * 2, 0, MARKER_SIZE_SLIDER_MAX);
  source.route.markerEndpoints ||= {};
  source.route.markerEndpoints[source.anchor] = normalizeMarkerSettings({ ...current, size: markerSliderToSize(slider) }, base);
  scheduleTripsSave();
  refreshEndpointMarkers();
}

function adjustRouteAnimationIconFromWheel(direction) {
  if (!els.routeAnimationIconSize) return;
  els.routeAnimationIconSize.value = String(clamp(Number(els.routeAnimationIconSize.value) + direction * 2, 0, 100));
  els.routeAnimationIconSize.dispatchEvent(new Event("input", { bubbles: true }));
}

function adjustStickerFromWheel(stickerId, direction, { all = false, matching = false } = {}) {
  const source = state.trips.flatMap(trip => trip.stickers || []).find(sticker => sticker.id === stickerId);
  if (!source) return;
  const view = currentStickerViewKey();
  const visibleTrips = state.contiguousUsMode ? state.trips : [activeTrip()].filter(Boolean);
  const targets = visibleTrips
    .flatMap(trip => trip.stickers || [])
    .filter(sticker => (all || matching)
      ? (!matching || sticker.libraryId === source.libraryId)
      : sticker.id === source.id);
  targets.forEach(sticker => {
    const trip = visibleTrips.find(candidate => candidate.stickers?.includes(sticker)) || activeTrip();
    const before = stickerSnapshot(sticker);
    setStickerSizeForView(sticker, stickerBaseSizeForView(sticker, view) + direction * 4, view);
    recordStickerHistory({ trip, before, after: stickerSnapshot(sticker) });
  });
  saveTrips();
  markProjectDirty("journeys");
  renderStickerSelectionControls();
  renderStickers();
}

function handleMapGraphicWheel(event) {
  if (!isEditorSite()) return;
  // Wheel gestures have one unambiguous job at a time. When map zoom is
  // enabled, leave the event entirely to Leaflet; feature scaling is only
  // available while the editor's zoom lock is on.
  if (els.allowZoom?.checked) return;
  const markerElement = event.target.closest?.(".leaflet-marker-icon");
  const animationIcon = event.target.closest?.(".route-playback-icon");
  const dayLabel = event.target.closest?.(".stop-landmark-day-label");
  if (!markerElement && !animationIcon && !dayLabel) return;
  const direction = event.deltaY < 0 ? 1 : -1;
  // Leaflet registers its own wheel listener on the map container. Stopping
  // propagation alone still permits listeners on that same element to zoom,
  // which produced the alternating scale/zoom behavior.
  const claimWheel = () => {
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };
  if (dayLabel) {
    const stopIndex = Number(markerElement?.dataset.stopIndex);
    const stop = synchronizeTripStops(activeTrip())[stopIndex];
    if (!stop) return;
    claimWheel();
    stop.dayLabelScale = clamp(Number(stop.dayLabelScale || 1) + direction * 0.08, 0.65, 2.2);
    saveTrips();
    refreshEndpointMarkers();
    return;
  }
  if (animationIcon) {
    claimWheel();
    adjustRouteAnimationIconFromWheel(direction);
    return;
  }
  if (markerElement?.dataset.stickerId) {
    claimWheel();
    adjustStickerFromWheel(markerElement.dataset.stickerId, direction, {
      all: event.shiftKey && !event.ctrlKey,
      matching: event.shiftKey && event.ctrlKey
    });
    return;
  }
  const kind = markerElement.dataset.graphicKind;
  if (!kind) return;
  claimWheel();
  const routeIndex = Number(markerElement.dataset.routeIndex);
  const anchor = markerElement.dataset.anchor;
  if (kind === "landmark") adjustLandmarkFromWheel(routeIndex, anchor, direction, event.shiftKey);
  else if (kind === "marker") adjustEndpointMarkerFromWheel(routeIndex, anchor, direction);
}

els.mapCanvas?.addEventListener("wheel", handleMapGraphicWheel, { capture: true, passive: false });

function makeMarker(point, label, route = activeRoute(), routeIndex = state.activeRouteIndex, anchor = "start") {
  const markerPoint = sharedStopPointForEndpoint(activeTrip(), routeIndex, anchor) || point;
  const targetId = markerTargetId(routeIndex, anchor);
  const landmarkSettings = landmarkMarkerSettingsFor(route, routeIndex, anchor);
  const hoverLandmarkSettings = landmarkMarkerSettingsFor(route, routeIndex, anchor, { forceVisible: true });
  if (landmarkSettings && shouldHideTownLayerForAnimation(routeIndex, anchor, "landmark")) {
    return L.marker(toLatLng(markerPoint), {
      pane: "routePane",
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "route-endpoint-marker is-hidden", html: "", iconSize: [0, 0], iconAnchor: [0, 0] })
    });
  }
  const routeMarker = markerEndpointSettings(route, anchor, activeTrip(), routeIndex);
  if (!landmarkSettings && shouldHideTownLayerForAnimation(routeIndex, anchor, "marker")) {
    return L.marker(toLatLng(markerPoint), {
      pane: "routePane",
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: "route-endpoint-marker is-hidden", html: "", iconSize: [0, 0], iconAnchor: [0, 0] })
    });
  }
  const settings = landmarkSettings || routeMarker;
  const displayPositionKey = markerDisplayPositionKey(routeIndex, anchor, Boolean(landmarkSettings));
  const displayVisible = landmarkSettings ? true : markerDisplayVisible(routeIndex, anchor, routeMarker);
  const selected = selectedEndpointFeatureKey === `${landmarkSettings ? "landmark" : "marker"}:${routeIndex}:${anchor}`;
  const flash = state.markerFlashTarget === targetId;
  const renderIcon = (currentSettings, isLandmark) => markerSvg(currentSettings, {
    selected,
    flash,
    imageVisible: isLandmark || markerImageVisible(routeIndex, anchor, currentSettings),
    fallback: isLandmark ? DEFAULT_LANDMARK_SETTINGS.marker : DEFAULT_MARKER_SETTINGS,
    maxSize: isLandmark ? LANDMARK_RENDER_SIZE_INTERNAL_MAX : MARKER_SIZE_INTERNAL_MAX,
    baseSizePx: isLandmark
      ? routeAnimationIconSizePx({
          enabled: true,
          // Five was the former landmark maximum. Keeping it as the visual
          // reference preserves existing sizes while the new 0-10 range can
          // genuinely grow to roughly twice the former maximum.
          size: currentSettings.size / (MARKER_SIZE_INTERNAL_MAX * 2) * MARKER_SIZE_SLIDER_MAX
        })
      : null
  });
  const icon = displayVisible ? renderIcon(settings, Boolean(landmarkSettings)) : { iconSize: 0, html: "" };
  const hoverIcon = hoverLandmarkSettings && !landmarkSettings && displayVisible
    ? renderIcon(hoverLandmarkSettings, true)
    : null;
  const renderedIconSize = Math.max(icon.iconSize || 0, hoverIcon?.iconSize || 0);
  const renderedIconHtml = hoverIcon
    ? `<span class="endpoint-marker-resting">${icon.html}</span><span class="endpoint-marker-landmark-hover">${hoverIcon.html}</span>`
    : icon.html;
  const stopIndex = anchor === "start" ? routeIndex : routeIndex + 1;
  const stop = synchronizeTripStops(activeTrip())[stopIndex];
  const stopDays = stop && typeof stopDayIsoValues === "function" ? stopDayIsoValues(stop) : [];
  const activeDayIndex = stopIndex === selectedStopIndex && selectedStopDayIso
    ? Math.max(0, stopDays.indexOf(selectedStopDayIso))
    : 0;
  const dayNumber = stop && typeof stopDaySequenceNumber === "function"
    ? stopDaySequenceNumber(stop, activeDayIndex, stopIndex)
    : 0;
  const dayLabel = state.selectionScope === "stop" && stopIndex === selectedStopIndex && dayNumber ? `Day ${dayNumber}` : "";
  const iconHtmlWithDay = landmarkSettings && dayLabel
    ? `${renderedIconHtml}<span class="stop-landmark-day-label" data-stop-index="${stopIndex}" data-day-index="${activeDayIndex}"><button type="button" data-stop-day-nav="previous" ${activeDayIndex <= 0 ? "disabled" : ""} aria-label="Previous stop day">‹</button><strong>${dayLabel}</strong><button type="button" data-stop-day-nav="next" ${activeDayIndex >= stopDays.length - 1 ? "disabled" : ""} aria-label="Next stop day">›</button></span>`
    : renderedIconHtml;
  const baseLatLng = toLatLng(markerPoint);
  const marker = L.marker(offsetLatLngByPixels(baseLatLng, displayPositionKey), {
    pane: "routePane",
    draggable: false,
    interactive: true,
    keyboard: false,
    icon: L.divIcon({
      className: `route-endpoint-marker${hoverIcon ? " has-hover-landmark" : ""}`,
      html: renderedIconHtml,
      iconSize: [renderedIconSize, renderedIconSize],
      iconAnchor: [renderedIconSize / 2, renderedIconSize / 2]
    })
  });
  marker.on("add", () => {
    const element = marker.getElement?.();
    if (!element) return;
    element.dataset.graphicKind = landmarkSettings ? "landmark" : "marker";
    element.dataset.routeIndex = String(routeIndex);
    element.dataset.anchor = anchor;
    const selectionKey = `${landmarkSettings ? "landmark" : "marker"}:${routeIndex}:${anchor}`;
    element.classList.toggle("is-map-feature-selected", selectedEndpointFeatureKeys.has(selectionKey));
    element.classList.toggle("is-map-feature-active", selectedEndpointFeatureKey === selectionKey);
    element.title = landmarkSettings
      ? "Scroll to resize this landmark. Hold Shift to resize all landmarks."
      : "Scroll to resize this stop marker.";
  });
  marker.on("click", event => {
    if (performance.now() < marqueeSuppressClickUntil) return;
    if (performance.now() < Number(marker._rvSuppressClickUntil || 0)) return;
    const kind = landmarkSettings ? "landmark" : "marker";
    const enabled = kind === "landmark" ? els.selectionTypeLandmarks?.checked : els.selectionTypeMarkers?.checked;
    if (enabled) selectEndpointFeature(kind, routeIndex, anchor, { toggle: Boolean(event.originalEvent?.shiftKey) });
    if (Number.isInteger(stopIndex)) focusJourneyStop(stopIndex);
    state.markerModifyTarget = { routeIndex, anchor };
    renderMarkerControls();
    refreshImagePreviewDrawer?.();
    refreshEndpointMarkers();
  });
  bindDisplayPositionHandlers(marker, displayPositionKey, baseLatLng);
  if (landmarkSettings && dayLabel && stop) {
    const labelPositionKey = `day-label:${stop.id}`;
    const labelScale = clamp(Number(stop.dayLabelScale) || 1, 0.65, 2.2);
    const labelMarker = L.marker(offsetLatLngByPixels(baseLatLng, labelPositionKey), {
      pane: "labelPane",
      interactive: true,
      keyboard: true,
      icon: L.divIcon({
        className: "stop-day-label-marker",
        iconSize: [150, 30],
        iconAnchor: [75, 32],
        html: `<span class="stop-landmark-day-label" style="--day-label-scale:${labelScale}"><button type="button" data-stop-day-nav="previous" ${activeDayIndex <= 0 ? "disabled" : ""} aria-label="Previous stop day">‹</button><strong>${dayLabel}</strong><button type="button" data-stop-day-nav="next" ${activeDayIndex >= stopDays.length - 1 ? "disabled" : ""} aria-label="Next stop day">›</button></span>`
      })
    });
    labelMarker.on("add", () => {
      const element = labelMarker.getElement?.();
      if (!element) return;
      element.title = "Drag to move this day label. Scroll to resize it.";
      element.querySelectorAll("[data-stop-day-nav]").forEach(button => {
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          const direction = button.dataset.stopDayNav === "next" ? 1 : -1;
          const nextIndex = clamp(activeDayIndex + direction, 0, Math.max(0, stopDays.length - 1));
          if (!stopDays[nextIndex]) return;
          if (stopIndex !== selectedStopIndex) focusJourneyStop(stopIndex, { animate: false });
          selectStopDay(stopDays[nextIndex]);
        });
      });
      const labelMarkerElement = element.closest(".leaflet-marker-icon");
      if (labelMarkerElement) labelMarkerElement.dataset.stopIndex = String(stopIndex);
    });
    labelMarker.on("click", event => L.DomEvent.stop(event));
    bindDisplayPositionHandlers(labelMarker, labelPositionKey, baseLatLng);
    markerGroup.addLayer(labelMarker);
  }
  return marker;
}

function refreshEndpointMarkers() {
  markerGroup.clearLayers();
  if (state.contiguousUsMode) return;
  const routeData = activeRoute();
  if (!routeData) return;
  if (state.overviewMode) {
    const renderedStops = new Set();
    const addSharedMarker = (point, label, route, index, anchor) => {
      const key = sharedStopKeyForEndpoint(activeTrip(), index, anchor);
      if (renderedStops.has(key)) return;
      renderedStops.add(key);
      markerGroup.addLayer(makeMarker(point, label, route, index, anchor));
    };
    state.routes.forEach((route, index) => {
      addSharedMarker(route.points[0], `${route.label || `Day ${index + 1}`} start`, route, index, "start");
      addSharedMarker(route.points[route.points.length - 1], `${route.label || `Day ${index + 1}`} end`, route, index, "end");
    });
    return;
  }
  markerGroup.addLayer(makeMarker(routeData.points[0], "Start", routeData, state.activeRouteIndex, "start"));
  markerGroup.addLayer(makeMarker(routeData.points[routeData.points.length - 1], "End", routeData, state.activeRouteIndex, "end"));
}

function animationTownHideKeyForRoute(routeIndex, iconMarker) {
  const hideTarget = routeAnimationHideAtTownTarget();
  if (hideTarget === "none" || !iconMarker) return "";
  const route = state.routes[routeIndex];
  if (!route) return "";
  const anchors = ["start", "end"].filter(anchor => animationIconNearEndpoint(iconMarker, route, anchor));
  return anchors.length ? `${hideTarget}:${routeIndex}:${anchors.join("+")}` : "";
}

function refreshMarkersWhenAnimationTownHideChanges(scope, routeIndex, iconMarker) {
  const key = animationTownHideKeyForRoute(routeIndex, iconMarker);
  const target = scope === "overview" ? state.overviewHover : state.playback;
  if (target.townHideKey === key) return;
  target.townHideKey = key;
  refreshEndpointMarkers();
}

function updateToggleSwatches() {
  const providerStyles = mapThemeMode === "provider" ? mapLibreStyleToRouteTheme(activeMapLibreStyle()).styles : null;
  document.querySelectorAll(".element-control[data-style-key]").forEach(button => {
    const key = button.dataset.styleKey;
    const style = providerStyles?.[key] || layerStyles[key];
    if (style) {
      button.style.setProperty("--swatch", style.color);
      button.style.setProperty("--stack-label-color", readableTextColor(style.color));
    }
  });
}

function normalizeDisplayOffset(value = {}) {
  return {
    x: Number.isFinite(Number(value.x)) ? Number(value.x) : 0,
    y: Number.isFinite(Number(value.y)) ? Number(value.y) : 0
  };
}

function normalizeDisplayPosition(value = {}) {
  return {
    start: normalizeDisplayOffset(value.start),
    current: normalizeDisplayOffset(value.current ?? value.offset),
    // Offsets are screen pixels, so retain the zoom at which they were
    // authored. This keeps a dragged landmark/icon geographically anchored
    // while still returning to the exact composition of its saved view.
    startZoom: Number.isFinite(Number(value.startZoom)) ? Number(value.startZoom) : null,
    currentZoom: Number.isFinite(Number(value.currentZoom ?? value.zoom)) ? Number(value.currentZoom ?? value.zoom) : null
  };
}

function normalizeDisplayPositions(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const items = source.items && typeof source.items === "object" ? source.items : source;
  return {
    version: DISPLAY_POSITIONS_VERSION,
    items: Object.fromEntries(Object.entries(items || {})
      .filter(([key]) => key && key !== "version")
      .map(([key, item]) => [key, normalizeDisplayPosition(item)]))
  };
}

function tripDisplayPositions(trip = activeTrip()) {
  if (!trip) return normalizeDisplayPositions();
  trip.displayPositions = normalizeDisplayPositions(trip.displayPositions);
  return trip.displayPositions;
}

function displayPositionForKey(key, trip = activeTrip()) {
  if (!key) return normalizeDisplayPosition();
  const positions = tripDisplayPositions(trip);
  if (!positions.items[key]) {
    // Landmarks replace their stop marker after the stop is reached. Older
    // projects stored their offsets separately; inherit that placement once
    // so the replacement happens at precisely the same map location.
    const landmarkKey = key.startsWith("marker:") ? `landmark:${key.slice("marker:".length)}` : "";
    positions.items[key] = normalizeDisplayPosition(landmarkKey && positions.items[landmarkKey]);
  }
  return positions.items[key];
}

function setDisplayPositionOffset(key, offset, mode = "current", { save = true, rerender = true, trip = activeTrip() } = {}) {
  if (!key) return;
  if (!trip) return;
  const item = displayPositionForKey(key, trip);
  const zoom = map?.getZoom?.();
  const target = mode === "start" ? "start" : "current";
  item[target] = normalizeDisplayOffset(offset);
  item[`${target}Zoom`] = Number.isFinite(zoom) ? zoom : null;
  if (mode === "start") {
    item.current = normalizeDisplayOffset(offset);
    item.currentZoom = item.startZoom;
  }
  if (save) saveTrips();
  if (rerender) {
    renderRoute(false);
    renderCityLabels();
  }
}

function resetDisplayPositionOffset(key) {
  const item = displayPositionForKey(key);
  setDisplayPositionOffset(key, displayOffsetAtZoom(item.start, item.startZoom, map.getZoom()), "current");
}

function setDisplayPositionStartFromCurrent(key) {
  const item = displayPositionForKey(key);
  const current = displayOffsetAtZoom(item.current, item.currentZoom, map.getZoom());
  setDisplayPositionOffset(key, current, "start");
}

function displayOffsetAtZoom(offset, referenceZoom, zoom = map.getZoom()) {
  const normalized = normalizeDisplayOffset(offset);
  if (!Number.isFinite(referenceZoom) || !Number.isFinite(zoom)) return normalized;
  const scale = 2 ** clamp(zoom - referenceZoom, -12, 12);
  return { x: normalized.x * scale, y: normalized.y * scale };
}

function offsetLatLngByPixels(latLng, key, trip = activeTrip()) {
  if (!key) return latLng;
  const position = displayPositionForKey(key, trip);
  const offset = displayOffsetAtZoom(position.current, position.currentZoom);
  if (!offset.x && !offset.y) return latLng;
  const point = map.latLngToLayerPoint(latLng);
  return map.layerPointToLatLng([point.x + offset.x, point.y + offset.y]);
}

function rebaseDisplayPositionsForSavedView(view, trip = activeTrip()) {
  if (!view || !trip) return;
  const zoom = Number(view.zoom);
  const currentZoom = map.getZoom();
  if (!Number.isFinite(zoom) || !Number.isFinite(currentZoom)) return;
  Object.values(tripDisplayPositions(trip).items).forEach(position => {
    position.start = displayOffsetAtZoom(position.start, position.startZoom, currentZoom);
    position.current = displayOffsetAtZoom(position.current, position.currentZoom, currentZoom);
    position.startZoom = zoom;
    position.currentZoom = zoom;
  });
}

function offsetFromBaseLatLng(baseLatLng, movedLatLng) {
  const base = map.latLngToLayerPoint(baseLatLng);
  const moved = map.latLngToLayerPoint(movedLatLng);
  return normalizeDisplayOffset({ x: moved.x - base.x, y: moved.y - base.y });
}

function mapContainerPointFromPointer(event) {
  const container = map.getContainer();
  const rect = container.getBoundingClientRect();
  const scaleX = rect.width ? container.clientWidth / rect.width : 1;
  const scaleY = rect.height ? container.clientHeight / rect.height : 1;
  return L.point(
    (event.clientX - rect.left) * scaleX,
    (event.clientY - rect.top) * scaleY
  );
}

function bindMapFeaturePointerDrag(layer, options = {}) {
  if (!layer) return layer;
  layer.dragging?.disable?.();
  let detach = null;

  const install = () => {
    detach?.();
    const element = layer.getElement?.();
    if (!element) return;
    let dragging = false;
    let pointerId = null;
    let grabOffset = L.point(0, 0);
    let mapDragWasEnabled = false;
    let dragStartPoint = null;
    let moved = false;

    const suppressPostDragClick = event => {
      if (performance.now() > Number(layer._rvSuppressClickUntil || 0)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
    };

    const finish = event => {
      if (!dragging || (event?.pointerId != null && event.pointerId !== pointerId)) return;
      dragging = false;
      layer._rvUserDragging = false;
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", finish, true);
      if (mapDragWasEnabled) map.dragging.enable();
      if (moved) layer._rvSuppressClickUntil = performance.now() + 420;
      try {
        if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId);
      } catch (error) {
        // The element may have been re-rendered while the pointer was down.
      }
      // A pointer release is not necessarily a drag. Only a real movement
      // should persist a new position or trigger a feature re-render.
      if (moved) options.onEnd?.(layer.getLatLng(), event);
    };

    const move = event => {
      if (!dragging || event.pointerId !== pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const pointerPoint = mapContainerPointFromPointer(event);
      if (!moved && dragStartPoint && pointerPoint.distanceTo(dragStartPoint) >= 3) moved = true;
      const nextPoint = pointerPoint.add(grabOffset);
      const nextLatLng = map.containerPointToLatLng(nextPoint);
      layer.setLatLng(nextLatLng);
      options.onMove?.(nextLatLng, event);
    };

    const start = event => {
      if (!isEditorSite() || document.body.classList.contains("is-device-preview-unlocked") || event.button !== 0) return;
      if (event.target?.closest?.("[data-stop-day-nav]")) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      pointerId = event.pointerId;
      layer._rvUserDragging = true;
      layer.closePopup?.();
      mapDragWasEnabled = Boolean(map.dragging?.enabled?.());
      if (mapDragWasEnabled) map.dragging.disable();
      const pointerPoint = mapContainerPointFromPointer(event);
      dragStartPoint = pointerPoint;
      moved = false;
      grabOffset = map.latLngToContainerPoint(layer.getLatLng()).subtract(pointerPoint);
      element.setPointerCapture?.(pointerId);
      document.addEventListener("pointermove", move, { capture: true, passive: false });
      document.addEventListener("pointerup", finish, true);
      document.addEventListener("pointercancel", finish, true);
      options.onStart?.(event);
    };

    element.addEventListener("pointerdown", start, { capture: true, passive: false });
    element.addEventListener("click", suppressPostDragClick, true);
    detach = () => {
      element.removeEventListener("pointerdown", start, true);
      element.removeEventListener("click", suppressPostDragClick, true);
    };
  };

  layer.on("add", install);
  layer.on("remove", () => detach?.());
  if (layer.getElement?.()) install();
  return layer;
}

function bindDisplayPositionHandlers(layer, key, baseLatLng, options = {}) {
  if (!layer || !key || !baseLatLng) return layer;
  bindMapFeaturePointerDrag(layer, {
    onEnd: droppedLatLng => {
      if (!isEditorSite()) return;
      setDisplayPositionOffset(key, offsetFromBaseLatLng(baseLatLng, droppedLatLng), "current", { rerender: false, trip: options.trip || activeTrip() });
      layer.setLatLng(droppedLatLng);
      options.afterDrop?.(droppedLatLng);
    }
  });
  layer.on("contextmenu", event => {
    if (!isEditorSite()) return;
    L.DomEvent?.stop?.(event);
    event.originalEvent?.preventDefault?.();
    event.originalEvent?.stopPropagation?.();
    resetDisplayPositionOffset(key);
  });
  layer.on("mousedown", event => {
    if (!isEditorSite()) return;
    if (event.originalEvent?.button !== 1) return;
    L.DomEvent?.stop?.(event);
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation?.();
    setDisplayPositionStartFromCurrent(key);
  });
  return layer;
}

function markerDisplayPositionKey(routeIndex, anchor, isLandmark = false) {
  const stopKey = markerTargetId(routeIndex, anchor);
  // A landmark is the visual replacement for a stop marker, not a separate
  // map pin. They deliberately share one draggable placement.
  return `marker:${stopKey}`;
}

function labelDisplayPositionKey(city) {
  return city?.displayPositionKey ? `label:${city.displayPositionKey}` : "";
}

function routeAnimationStopPresentation(routeIndex = state.activeRouteIndex, progress = state.playback.progress) {
  if (!Number.isInteger(routeIndex) || !Number.isFinite(Number(progress))) return null;
  const numericProgress = Number(progress);
  const anchor = numericProgress <= 0.001 ? "start" : numericProgress >= 0.999 ? "end" : "";
  if (!anchor) return null;
  return {
    key: `route-animation-icon:${markerTargetId(routeIndex, anchor)}`,
    anchor,
    offset: { x: 12, y: 12 },
    scale: 0.72
  };
}

function routeAnimationDisplayPositionKey(routeIndex = null, progress = null) {
  return routeAnimationStopPresentation(routeIndex, progress)?.key || "route-animation-icon";
}

function routeAnimationOffsetLatLng(point, routeIndex = null, progress = null) {
  const presentation = routeAnimationStopPresentation(routeIndex, progress);
  const key = presentation?.key || routeAnimationDisplayPositionKey();
  if (!presentation) return offsetLatLngByPixels(toLatLng(point), key);
  const positions = tripDisplayPositions();
  if (!positions.items[key]) {
    positions.items[key] = normalizeDisplayPosition({ start: presentation.offset, current: presentation.offset });
  }
  const amount = typeof routeAnimationPresentationAmount === "function"
    ? routeAnimationPresentationAmount(routeIndex ?? state.activeRouteIndex, progress ?? state.playback.progress)
    : 1;
  const offset = positions.items[key].current;
  const base = map.latLngToLayerPoint(toLatLng(point));
  return map.layerPointToLatLng([base.x + offset.x * amount, base.y + offset.y * amount]);
}

function routeAnimationIconForProgress(settings = getRouteAnimationIconSettings(), routeIndex = null, progress = null) {
  const presentation = routeAnimationStopPresentation(routeIndex, progress);
  if (!presentation) return routeAnimationLeafletIcon(settings);
  const amount = typeof routeAnimationPresentationAmount === "function"
    ? routeAnimationPresentationAmount(routeIndex ?? state.activeRouteIndex, progress ?? state.playback.progress)
    : 1;
  return routeAnimationLeafletIcon({
    ...settings,
    size: settings.size * (1 + (presentation.scale - 1) * amount)
  });
}

function updateRouteAnimationIconPresentation(marker, routeIndex, progress, force = false) {
  if (!marker) return;
  const amount = typeof routeAnimationPresentationAmount === "function"
    ? routeAnimationPresentationAmount(routeIndex, progress)
    : 1;
  const key = `${routeAnimationStopPresentation(routeIndex, progress)?.key || "moving"}:${amount.toFixed(3)}`;
  if (!force && marker._rvPresentationKey === key) return;
  marker._rvPresentationKey = key;
  marker.setIcon(routeAnimationIconForProgress(getRouteAnimationIconSettings(), routeIndex, progress));
}

function bindRouteAnimationIconHandlers(marker, basePointProvider, displayKeyProvider = null) {
  if (!marker) return marker;
  marker.on("add", () => {
    marker.getElement?.().classList.toggle("is-map-feature-selected", routeAnimationIconSelected);
    marker.getElement?.().classList.toggle("is-map-feature-active", routeAnimationIconSelected);
  });
  marker.on("click", event => {
    if (performance.now() < marqueeSuppressClickUntil) return;
    if (!els.selectionTypeRouteIcon?.checked) return;
    if (event.originalEvent?.shiftKey) routeAnimationIconSelected = !routeAnimationIconSelected;
    else {
      selectedStickerId = "";
      selectedStickerIds.clear();
      selectedEndpointFeatureKeys.clear();
      selectedEndpointFeatureKey = "";
      routeAnimationIconSelected = true;
    }
    updateSelectionControls();
    marker.getElement?.classList.toggle("is-map-feature-selected", routeAnimationIconSelected);
    marker.getElement?.classList.toggle("is-map-feature-active", routeAnimationIconSelected);
  });
  bindMapFeaturePointerDrag(marker, {
    onEnd: droppedLatLng => {
      if (!isEditorSite()) return;
      const point = typeof basePointProvider === "function" ? basePointProvider() : null;
      if (!point) return;
      const key = typeof displayKeyProvider === "function" ? displayKeyProvider() : routeAnimationDisplayPositionKey();
      setDisplayPositionOffset(key, offsetFromBaseLatLng(toLatLng(point), droppedLatLng), "current", {
        rerender: false
      });
    }
  });
  marker.on("contextmenu", event => {
    if (!isEditorSite()) return;
    L.DomEvent?.stop?.(event);
    event.originalEvent?.preventDefault?.();
    event.originalEvent?.stopPropagation?.();
    const key = typeof displayKeyProvider === "function" ? displayKeyProvider() : routeAnimationDisplayPositionKey();
    resetDisplayPositionOffset(key);
  });
  marker.on("mousedown", event => {
    if (!isEditorSite()) return;
    if (event.originalEvent?.button !== 1) return;
    L.DomEvent?.stop?.(event);
    event.originalEvent.preventDefault();
    event.originalEvent.stopPropagation?.();
    const key = typeof displayKeyProvider === "function" ? displayKeyProvider() : routeAnimationDisplayPositionKey();
    setDisplayPositionStartFromCurrent(key);
  });
  return marker;
}

function updateDayNamePatternTooltip() {
  if (!els.dayNamePatternExample) return;
  const dayIndex = clamp(state.activeRouteIndex, 0, Math.max(0, activeTrip()?.days?.length - 1));
  const number = activeTrip()?.days?.length ? sequenceNumberForTripDay(activeTrip(), dayIndex) : 3;
  const date = dateForTripDay(activeTrip(), dayIndex) || new Date(2026, 6, 15, 12);
  const pattern = els.dayNamePattern?.value.trim() || DEFAULT_DAY_NAME_PATTERN;
  els.dayNamePatternExample.textContent = `example: ${formatDayPattern(pattern, number, date, dayNameContext(activeTrip(), dayIndex))}`;
}

function updateNewDaySequencePreview() {
  const trip = activeTrip();
  if (!trip || !els.newDaySequence?.checked) return;
  els.newDayLabel.value = formatDaySequenceName(trip, trip.days.length);
  clearRequiredState(els.newDayLabel);
}

function normalizeZoneSettings(settings = {}, fallback = DEFAULT_ZONE_SETTINGS) {
  const source = settings && typeof settings === "object" ? settings : {};
  return {
    displayType: ZONE_DISPLAY_TYPES.has(source.displayType) ? source.displayType : (ZONE_DISPLAY_TYPES.has(fallback.displayType) ? fallback.displayType : DEFAULT_ZONE_SETTINGS.displayType),
    size: clamp(Number(source.size ?? fallback.size ?? DEFAULT_ZONE_SETTINGS.size), 8, 120),
    shape: ZONE_SHAPES.has(source.shape) ? source.shape : (ZONE_SHAPES.has(fallback.shape) ? fallback.shape : DEFAULT_ZONE_SETTINGS.shape),
    routeSize: clamp(Number(source.routeSize ?? fallback.routeSize ?? DEFAULT_ZONE_SETTINGS.routeSize), 1, 80),
    routeOffset: clamp(Number(source.routeOffset ?? fallback.routeOffset ?? DEFAULT_ZONE_SETTINGS.routeOffset), -80, 80),
    verticalSize: clamp(Number(source.verticalSize ?? fallback.verticalSize ?? DEFAULT_ZONE_SETTINGS.verticalSize), 0.5, 2.5),
    horizontalSize: clamp(Number(source.horizontalSize ?? fallback.horizontalSize ?? DEFAULT_ZONE_SETTINGS.horizontalSize), 0.5, 2.5),
    verticalOffset: clamp(Number(source.verticalOffset ?? fallback.verticalOffset ?? DEFAULT_ZONE_SETTINGS.verticalOffset), -120, 120),
    horizontalOffset: clamp(Number(source.horizontalOffset ?? fallback.horizontalOffset ?? DEFAULT_ZONE_SETTINGS.horizontalOffset), -120, 120)
  };
}

function cloneMarkerSettings(settings = DEFAULT_MARKER_SETTINGS) {
  return {
    shape: settings.shape,
    size: settings.size,
    imageUrl: settings.imageUrl || "",
    imageName: settings.imageName || "",
    imageDisplay: settings.imageDisplay || "reached",
    imageSize: settings.imageSize ?? DEFAULT_MARKER_SETTINGS.imageSize,
    shapeSize: settings.shapeSize ?? DEFAULT_MARKER_SETTINGS.shapeSize,
    fillEnabled: settings.fillEnabled,
    fillMode: settings.fillMode || "shape",
    shapeEnabled: settings.shapeEnabled !== false,
    fillColor: settings.fillColor,
    strokes: (settings.strokes || []).map(stroke => ({ ...stroke })),
    imageStrokes: (settings.imageStrokes || []).map(stroke => ({ ...stroke }))
  };
}

function markerSizeToSlider(size) {
  return Math.round(clamp(Number(size), 0, MARKER_SIZE_INTERNAL_MAX) / MARKER_SIZE_INTERNAL_MAX * MARKER_SIZE_SLIDER_MAX);
}

function markerSliderToSize(value) {
  const sliderValue = clamp(Number(value), 0, MARKER_SIZE_SLIDER_MAX);
  return Number((sliderValue / MARKER_SIZE_SLIDER_MAX * MARKER_SIZE_INTERNAL_MAX).toFixed(3));
}

function landmarkSizeToSlider(size) {
  return Math.round(clamp(Number(size), 0, LANDMARK_SIZE_INTERNAL_MAX) / LANDMARK_SIZE_INTERNAL_MAX * MARKER_SIZE_SLIDER_MAX);
}

function landmarkSliderToSize(value) {
  const sliderValue = clamp(Number(value), 0, MARKER_SIZE_SLIDER_MAX);
  return Number((sliderValue / MARKER_SIZE_SLIDER_MAX * LANDMARK_SIZE_INTERNAL_MAX).toFixed(3));
}

function formatMarkerSizeValue(size) {
  const sliderValue = markerSizeToSlider(size);
  return sliderValue === 0 ? "Off" : String(sliderValue);
}

function formatLandmarkSizeValue(size) {
  const sliderValue = landmarkSizeToSlider(size);
  return sliderValue === 0 ? "Off" : String(sliderValue);
}

function normalizeMarkerStroke(stroke = {}, index = 0) {
  const size = clamp(Number(stroke.size ?? 1), 0, 8);
  return {
    id: stroke.id || `stroke-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    color: /^#[0-9a-f]{6}$/i.test(stroke.color || "") ? stroke.color : "#fffdf8",
    size,
    hidden: Boolean(stroke.hidden) || size <= 0
  };
}

function setStrokeVisibilityIcon(button, size) {
  if (!button) return;
  const iconNumber = clamp(Math.round(Number(size) || 1), 1, 8);
  const visible = button.getAttribute("aria-pressed") !== "false" && Number(size) > 0;
  button.textContent = "";
  button.style.backgroundImage = visible
    ? `url("assets/icons/eye numbers/eye open ${iconNumber}.png")`
    : 'url("assets/icons/eye closed.png")';
  button.setAttribute("aria-label", visible ? `Hide stroke ${iconNumber}` : `Show stroke ${iconNumber}`);
}

function normalizeMarkerSettings(settings = {}, fallback = DEFAULT_MARKER_SETTINGS, maxSize = MARKER_SIZE_INTERNAL_MAX) {
  const source = settings && typeof settings === "object" ? settings : {};
  const base = fallback && typeof fallback === "object" ? fallback : DEFAULT_MARKER_SETTINGS;
  const strokes = Array.isArray(source.strokes)
    ? source.strokes.map(normalizeMarkerStroke)
    : (base.strokes || DEFAULT_MARKER_SETTINGS.strokes).map(normalizeMarkerStroke);
  const imageStrokes = Array.isArray(source.imageStrokes)
    ? source.imageStrokes.map(normalizeMarkerStroke)
    : (base.imageStrokes || DEFAULT_MARKER_SETTINGS.imageStrokes || []).map(normalizeMarkerStroke);
  const imageDisplay = ["always", "reached", "before", "never"].includes(source.imageDisplay)
    ? source.imageDisplay
    : ["always", "reached", "before", "never"].includes(base.imageDisplay)
      ? base.imageDisplay
      : DEFAULT_MARKER_SETTINGS.imageDisplay;
  const rawImageSource = source.imageSource && typeof source.imageSource === "object"
    ? source.imageSource
    : base.imageSource && typeof base.imageSource === "object" ? base.imageSource : {};
  const imageSource = {
    provider: String(rawImageSource.provider || "").slice(0, 80),
    pageUrl: /^https?:\/\//i.test(rawImageSource.pageUrl || "") ? rawImageSource.pageUrl : "",
    creator: String(rawImageSource.creator || "").slice(0, 500),
    license: String(rawImageSource.license || "").slice(0, 160),
    licenseUrl: /^https?:\/\//i.test(rawImageSource.licenseUrl || "") ? rawImageSource.licenseUrl : ""
  };
  return {
    shape: MARKER_SHAPES.has(source.shape) ? source.shape : (MARKER_SHAPES.has(base.shape) ? base.shape : DEFAULT_MARKER_SETTINGS.shape),
    size: clamp(Number(source.size ?? base.size ?? DEFAULT_MARKER_SETTINGS.size), 0, maxSize),
    imageUrl: typeof source.imageUrl === "string" && (source.imageUrl.startsWith("data:image/") || source.imageUrl.startsWith("blob:") || source.imageUrl.startsWith("assets/") || /^https?:\/\//i.test(source.imageUrl))
      ? source.imageUrl
      : typeof base.imageUrl === "string" && (base.imageUrl.startsWith("data:image/") || base.imageUrl.startsWith("blob:") || base.imageUrl.startsWith("assets/") || /^https?:\/\//i.test(base.imageUrl))
        ? base.imageUrl
        : "",
    imageName: String(source.imageName || base.imageName || ""),
    imageSource,
    imageDisplay,
    imageSize: clamp(Number(source.imageSize ?? base.imageSize ?? DEFAULT_MARKER_SETTINGS.imageSize), 0, ROUTE_ANIMATION_IMAGE_SIZE_MAX),
    shapeSize: clamp(Number(source.shapeSize ?? base.shapeSize ?? DEFAULT_MARKER_SETTINGS.shapeSize), 0, ROUTE_ANIMATION_SHAPE_SIZE_MAX),
    fillEnabled: typeof source.fillEnabled === "boolean" ? source.fillEnabled : base.fillEnabled !== false,
    fillMode: ["shape", "image", "none"].includes(source.fillMode) ? source.fillMode : (["shape", "image", "none"].includes(base.fillMode) ? base.fillMode : "shape"),
    shapeEnabled: typeof source.shapeEnabled === "boolean" ? source.shapeEnabled : base.shapeEnabled !== false,
    fillColor: /^#[0-9a-f]{6}$/i.test(source.fillColor || "") ? source.fillColor : (base.fillColor || DEFAULT_MARKER_SETTINGS.fillColor),
    strokes,
    imageStrokes
  };
}

function normalizeMarkerEndpoints(endpoints = {}, fallback = DEFAULT_MARKER_SETTINGS) {
  const source = endpoints && typeof endpoints === "object" ? endpoints : {};
  const normalized = {};
  ["start", "end"].forEach(anchor => {
    if (source[anchor]) normalized[anchor] = normalizeMarkerSettings(source[anchor], fallback);
  });
  return normalized;
}

function landmarkStopKey(name = "") {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function landmarkFileNameBase(name = "") {
  const text = String(name || "").replace(/\s+/g, " ").trim();
  if (!text) return "Landmark";
  const parts = text.split(",").map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1].toUpperCase().slice(0, 2)}`;
  }
  return text;
}

function landmarkImageNameVariants(name = "") {
  const cleanName = landmarkFileNameBase(name);
  const noComma = cleanName.replace(/\s*,\s*/g, " ");
  const city = cleanName.split(",")[0]?.trim() || "";
  return uniqueStrings([
    cleanName,
    noComma,
    city,
    cleanName.toLowerCase(),
    noComma.toLowerCase(),
    city.toLowerCase(),
    noComma.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
    noComma.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  ]);
}

// Keep automatic landmark discovery quiet. The old filename-probing approach
// made 20–40 intentional 404 requests per stop before falling back to the
// default art. Explicit uploads continue to work; this list is only for the
// bundled artwork that can safely be selected without a network probe.
const LOCAL_LANDMARK_ASSET_FILES = new Map([
  "Aztec, NM.png", "Boise City, OK.png", "Canon City, CO.png", "Colorado Springs, CO.png",
  "Edmond, OK.png", "Fredonia, AZ.png", "Greeley, CO.png", "La Junta, CO.png",
  "Laverne, OK.png", "Lemoyne, NE.png", "Lincoln, NE.png", "Moab, UT.png",
  "Parachute, CO.png", "Springdale, UT.png", "Torrey, UT.png", "Tuba City, AZ.png",
  "Villa Grove, CO.png"
].map(file => [landmarkStopKey(file.replace(/\.[^.]+$/, "")), file]));

function knownLandmarkImageUrl(name = "") {
  const file = LOCAL_LANDMARK_ASSET_FILES.get(landmarkStopKey(name));
  return file ? encodeURI(`assets/landmarks/${file}`) : "";
}

function landmarkImageCandidateUrls(name = "") {
  const knownUrl = knownLandmarkImageUrl(name);
  return knownUrl ? [knownUrl] : [];
}

function firstLandmarkImageCandidateUrl(name = "") {
  return landmarkImageCandidateUrls(name)[0] || "";
}

function applyImageFallbacks(image, urls, fallbackUrl = DEFAULT_LANDMARK_IMAGE_URL) {
  const candidates = uniqueStrings([...urls, fallbackUrl]);
  let index = 0;
  image.onerror = () => {
    index += 1;
    if (index < candidates.length) {
      image.src = candidates[index];
    }
  };
  image.src = candidates[0] || fallbackUrl;
}

async function resolveLandmarkImageForStop(stop) {
  const cacheKey = stop?.key || landmarkStopKey(stop?.name);
  if (!cacheKey) return "";
  if (landmarkImageUrlCache.has(cacheKey)) return landmarkImageUrlCache.get(cacheKey);
  for (const url of landmarkImageCandidateUrls(stop?.name)) {
    if (await imageUrlCanLoad(url)) {
      landmarkImageUrlCache.set(cacheKey, url);
      return url;
    }
  }
  landmarkImageUrlCache.set(cacheKey, "");
  return "";
}

function hydrateLandmarkAssetImages(trip = activeTrip()) {
  if (!trip || typeof trip !== "object") return Promise.resolve(false);
  const activeBatch = landmarkImageHydrationBatches.get(trip);
  if (activeBatch) return activeBatch;
  const landmarks = tripLandmarkSettings(trip);
  const unresolvedStops = landmarkStopsForTrip(trip).filter(stop => {
    const legacyStopKey = landmarkStopKey(stop.name);
    if (landmarks.stops[stop.key]?.imageUrl || landmarks.stops[legacyStopKey]?.imageUrl) return false;
    const cacheKey = stop.key || legacyStopKey;
    return !landmarkImageUrlCache.has(cacheKey) || Boolean(landmarkImageUrlCache.get(cacheKey));
  });
  if (!unresolvedStops.length) return Promise.resolve(false);

  const batch = Promise.all(unresolvedStops.map(async stop => ({
    stop,
    url: await resolveLandmarkImageForStop(stop)
  }))).then(results => {
    const current = tripLandmarkSettings(trip);
    let changed = false;
    results.forEach(({ stop, url }) => {
      if (!url) return;
      const legacyStopKey = landmarkStopKey(stop.name);
      if (current.stops[stop.key]?.imageUrl || current.stops[legacyStopKey]?.imageUrl) return;
      current.stops[stop.key] = {
        ...(current.stops[stop.key] || {}),
        name: stop.name,
        imageUrl: url,
        imageName: `${landmarkFileNameBase(stop.name)}.${url.split(".").pop() || "png"}`
      };
      changed = true;
    });
    if (!changed) return false;
    trip.landmarkSettings = normalizeLandmarkSettings(current);
    if (activeTrip() === trip) {
      scheduleTripsSave();
      renderRoute(false);
      renderLandmarks();
    }
    return true;
  }).catch(() => false).finally(() => {
    landmarkImageHydrationBatches.delete(trip);
  });
  landmarkImageHydrationBatches.set(trip, batch);
  return batch;
}

function normalizeLandmarkSettings(settings = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const stops = {};
  Object.entries(source.stops && typeof source.stops === "object" ? source.stops : {}).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    const normalizedKey = landmarkStopKey(key || value.name);
    if (!normalizedKey) return;
    stops[normalizedKey] = {
      name: String(value.name || key || "").trim(),
      imageUrl: value.imageUrl || DEFAULT_LANDMARK_IMAGE_URL,
      imageName: value.imageName || "Landmark",
      imageSource: value.imageSource && typeof value.imageSource === "object" ? value.imageSource : {},
      shape: MARKER_SHAPES.has(value.shape) ? value.shape : "",
      marker: value.marker && typeof value.marker === "object"
        ? normalizeMarkerSettings(value.marker, source.marker || DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX)
        : null
    };
  });
  return {
    enabled: Boolean(source.enabled ?? DEFAULT_LANDMARK_SETTINGS.enabled),
    imageDisplay: ["always", "reached", "never"].includes(source.imageDisplay)
      ? source.imageDisplay
      : DEFAULT_LANDMARK_SETTINGS.imageDisplay,
    perStopShapes: Boolean(source.perStopShapes ?? DEFAULT_LANDMARK_SETTINGS.perStopShapes),
    useDefaultForAll: Boolean(source.useDefaultForAll ?? DEFAULT_LANDMARK_SETTINGS.useDefaultForAll),
    scale: clamp(Number(source.scale ?? DEFAULT_LANDMARK_SETTINGS.scale), 0, 2),
    marker: normalizeMarkerSettings(source.marker, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX),
    stops
  };
}

function cloneLandmarkSettings(settings = DEFAULT_LANDMARK_SETTINGS) {
  return normalizeLandmarkSettings(JSON.parse(JSON.stringify(settings || DEFAULT_LANDMARK_SETTINGS)));
}

landmarkDefaultSettings = loadLandmarkDefaultSettings();

function saveLandmarkDefaultSettings(settings) {
  landmarkDefaultSettings = normalizeLandmarkSettings(settings);
  rvStorageWriteJson(LANDMARK_DEFAULTS_KEY, landmarkDefaultSettings);
}

function tripZoneSettings(trip = activeTrip()) {
  if (!trip) return { ...DEFAULT_ZONE_SETTINGS };
  trip.zoneSettings = normalizeZoneSettings(trip.zoneSettings, DEFAULT_ZONE_SETTINGS);
  return trip.zoneSettings;
}

function routeZoneSettings(route, trip = activeTrip()) {
  const base = tripZoneSettings(trip);
  route.zoneSettings = normalizeZoneSettings(route.zoneSettings, base);
  return route.zoneSettings;
}

function tripMarkerSettings(trip = activeTrip()) {
  if (!trip) return cloneMarkerSettings(DEFAULT_MARKER_SETTINGS);
  trip.markerSettings = normalizeMarkerSettings(trip.markerSettings, DEFAULT_MARKER_SETTINGS);
  return trip.markerSettings;
}

function routeMarkerSettings(route, trip = activeTrip()) {
  const base = tripMarkerSettings(trip);
  route.markerSettings = normalizeMarkerSettings(route.markerSettings, base);
  return route.markerSettings;
}

function scheduleRouteRender() {
  if (routeRenderFrame) return;
  routeRenderFrame = requestAnimationFrame(() => {
    routeRenderFrame = null;
    renderRoute(false);
    if (state.overviewMode) applyMapInteractionLocks();
  });
}

function finishTripsRestore(message) {
  selectedTripMediaId = null;
  pendingMediaPinId = null;
  closeJourneyMedia();
  renderTripManager();
  if (activeTrip()?.days.length) {
    showInitialJourneyStop();
    ensureLaverneLoopStartingLeg();
  } else {
    showEmptyTrip();
  }
  setTripStatus(message);
}

function setTripStatus(message = "", isError = false) {
  els.tripStatus.textContent = message;
  els.tripStatus.classList.toggle("is-error", isError);
}

function clearRequiredState(input) {
  input.classList.remove("required-missing");
  input.removeAttribute("aria-invalid");
  if (input.dataset.defaultPlaceholder) {
    input.placeholder = input.dataset.defaultPlaceholder;
  }
}

function markRequiredState(input) {
  input.dataset.defaultPlaceholder ||= input.placeholder;
  input.value = "";
  input.placeholder = input.dataset.requiredMessage || "Required";
  input.classList.add("required-missing");
  input.setAttribute("aria-invalid", "true");
}

function validateRequiredInputs(inputs) {
  let firstMissing = null;
  inputs.forEach(input => {
    if (input.value.trim()) {
      clearRequiredState(input);
      return;
    }
    markRequiredState(input);
    firstMissing ||= input;
  });
  firstMissing?.focus();
  return !firstMissing;
}

function addTripFromInput() {
  if (!validateRequiredInputs([els.newTripName])) {
    setTripStatus("Enter a trip name.", true);
    return false;
  }
  const name = els.newTripName.value.trim();
  state.trips.push(makeTrip(name));
  els.newTripName.value = "";
  clearRequiredState(els.newTripName);
  saveTrips();
  renderTripManager();
  setTripStatus(`Added ${name}. Choose it when you are ready to work on it.`);
  return true;
}

function showEmptyTrip() {
  cancelInitialRouteLoading();
  stopPlayback();
  state.routes = [];
  state.activeRouteIndex = 0;
  state.overviewMode = false;
  state.overviewZoneModifyIndex = null;
  state.overviewMarkerModifyIndex = null;
  state.markerModifyTarget = null;
  els.zoneModifyMapPrompt.hidden = true;
  state.points = [];
  state.displayPoints = [];
  routeGroup.clearLayers();
  faintRouteGroup.clearLayers();
  subduedRouteGroup.clearLayers();
  markerGroup.clearLayers();
  playbackGroup.clearLayers();
  routeHoverZoneGroup.clearLayers();
  els.empty.hidden = false;
  els.empty.textContent = "Add a route day from the Journeys tab.";
  els.status.textContent = "This trip has no route days.";
  renderRouteDayButtons();
  updateStats();
  setPlaybackButtons();
  updateUsViewButton();
}

function saveLandmarkSettings(settings, options = {}) {
  const trip = activeTrip();
  const normalized = normalizeLandmarkSettings(settings);
  if (landmarkSettingsScope === "default" || landmarkSettingsScope === "trip") {
    saveLandmarkDefaultSettings(normalized);
    if (options.renderControls !== false) renderLandmarks();
    if (!options.defer) {
      setTripStatus(landmarkSettingsScope === "trip"
        ? "Updated the Trip 1 landmark default."
        : "Updated the default landmark settings.");
    }
    return;
  }
  if (!trip) return;
  const current = tripLandmarkSettings(trip);
  if (landmarkSettingsScope && landmarkSettingsScope !== "journey" && landmarkSettingsScope !== "default" && landmarkSettingsScope !== "trip") {
    const stop = landmarkStopsForTrip(trip).find(item => item.key === landmarkSettingsScope);
    current.enabled = normalized.enabled;
    current.imageDisplay = normalized.imageDisplay;
    const previous = current.stops[landmarkSettingsScope] || current.stops[landmarkStopKey(stop?.name)] || {};
    current.stops[landmarkSettingsScope] = {
      ...previous,
      name: stop?.name || previous.name || landmarkSettingsScope,
      imageUrl: normalized.marker.imageUrl || previous.imageUrl || DEFAULT_LANDMARK_IMAGE_URL,
      imageName: normalized.marker.imageName || previous.imageName || stop?.name || "Landmark",
      imageSource: normalized.marker.imageSource || previous.imageSource || {},
      shape: normalized.marker.shape || previous.shape || "",
      marker: normalizeMarkerSettings(normalized.marker, current.marker, LANDMARK_SIZE_INTERNAL_MAX)
    };
    trip.landmarkSettings = normalizeLandmarkSettings(current);
  } else {
    trip.landmarkSettings = normalized;
  }
  if (options.defer) {
    scheduleTripsSave();
    scheduleRouteRender();
  } else {
    saveTrips();
    renderRoute(false);
  }
  if (options.renderControls !== false) renderLandmarks();
}

function applyDefaultLandmarkSizingToAllStops() {
  const trip = activeTrip();
  if (!trip) return;
  const defaults = cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
  const defaultMarker = normalizeMarkerSettings(defaults.marker, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX);
  const landmarks = tripLandmarkSettings(trip);
  const sizing = {
    size: defaultMarker.size,
    imageSize: defaultMarker.imageSize,
    shapeSize: defaultMarker.shapeSize,
    strokes: defaultMarker.strokes.map(normalizeMarkerStroke),
    imageStrokes: defaultMarker.imageStrokes.map(normalizeMarkerStroke)
  };
  landmarks.marker = normalizeMarkerSettings({
    ...landmarks.marker,
    ...sizing
  }, landmarks.marker, LANDMARK_SIZE_INTERNAL_MAX);
  landmarkStopsForTrip(trip).forEach(stop => {
    const previous = landmarks.stops[stop.key] || landmarks.stops[landmarkStopKey(stop.name)] || {};
    landmarks.stops[stop.key] = {
      ...previous,
      name: stop.name,
      marker: normalizeMarkerSettings({
        ...(previous.marker || {}),
        ...sizing
      }, landmarks.marker, LANDMARK_SIZE_INTERNAL_MAX)
    };
  });
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  saveTrips();
  renderRoute(false);
  renderLandmarks();
  setTripStatus("Applied the default landmark size and strokes to all landmarks.");
}

function editableLandmarkSettings() {
  if (landmarkSettingsScope === "default" || landmarkSettingsScope === "trip") {
    return cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
  }
  const landmarks = cloneLandmarkSettings(tripLandmarkSettings());
  if (landmarkSettingsScope && landmarkSettingsScope !== "journey") {
    const stop = landmarkStopsForTrip().find(item => item.key === landmarkSettingsScope);
    const stopSettings = landmarks.stops[landmarkSettingsScope] || landmarks.stops[landmarkStopKey(stop?.name)] || {};
    landmarks.marker = normalizeMarkerSettings({
      ...landmarks.marker,
      ...(stopSettings.marker || {}),
      imageUrl: stopSettings.imageUrl || landmarks.marker.imageUrl || DEFAULT_LANDMARK_IMAGE_URL,
      imageName: stopSettings.imageName || stop?.name || landmarks.marker.imageName,
      imageSource: stopSettings.imageSource || landmarks.marker.imageSource || {}
    }, landmarks.marker, LANDMARK_SIZE_INTERNAL_MAX);
  }
  return landmarks;
}

function updateLandmarkOutputValues(marker) {
  const sizeValue = landmarkSizeToSlider(marker.size);
  const imageValue = internalSizeToSlider(marker.imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX);
  const shapeValue = internalSizeToSlider(marker.shapeSize, ROUTE_ANIMATION_SHAPE_SIZE_MAX);
  if (els.landmarkSize) els.landmarkSize.value = String(sizeValue);
  if (els.landmarkSizeValue) els.landmarkSizeValue.textContent = sizeValue === 0 ? "Off" : String(sizeValue);
  if (els.landmarkImageSize) els.landmarkImageSize.value = String(imageValue);
  if (els.landmarkImageSizeValue) els.landmarkImageSizeValue.textContent = imageValue === 0 ? "Off" : String(imageValue);
  if (els.landmarkShapeSize) els.landmarkShapeSize.value = String(shapeValue);
  if (els.landmarkShapeSizeValue) els.landmarkShapeSizeValue.textContent = shapeValue === 0 ? "Off" : String(shapeValue);
}

function renderLandmarkStrokeList(list, strokes, kind) {
  if (!list) return;
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  list.replaceChildren();
  strokes.forEach((stroke, index) => {
    const row = document.createElement("div");
    row.className = "marker-stroke-row";
    row.classList.toggle("is-stroke-hidden", stroke.hidden);
    row.dataset.strokeId = stroke.id;
    row.dataset.strokeHidden = String(stroke.hidden);
    const grip = document.createElement("span");
    grip.className = "marker-stroke-grip";
    grip.setAttribute("aria-hidden", "true");
    const color = document.createElement("input");
    color.type = "color";
    color.value = stroke.color;
    color.addEventListener("input", () => {
      const next = cloneMarkerSettings(marker);
      next[kind][index] = { ...next[kind][index], color: color.value };
      saveLandmarkSettings({ ...landmarks, marker: next });
    });
    const sizeValue = document.createElement("button");
    sizeValue.type = "button";
    sizeValue.className = "stroke-visibility-toggle";
    sizeValue.setAttribute("aria-pressed", String(!stroke.hidden));
    setStrokeVisibilityIcon(sizeValue, stroke.size);
    sizeValue.dataset.help = "Temporarily hides or shows this landmark stroke without deleting it.";
    sizeValue.addEventListener("click", () => {
      const next = cloneMarkerSettings(marker);
      next[kind][index] = { ...next[kind][index], hidden: !next[kind][index].hidden };
      saveLandmarkSettings({ ...landmarks, marker: next });
    });
    const divider = document.createElement("span");
    divider.className = "marker-stroke-divider";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "8";
    slider.step = "1";
    slider.value = String(stroke.size);
    slider.addEventListener("input", () => {
      const next = cloneMarkerSettings(marker);
      const hidden = Number(slider.value) <= 0;
      next[kind][index] = { ...next[kind][index], size: Number(slider.value), hidden };
      sizeValue.setAttribute("aria-pressed", String(!hidden));
      setStrokeVisibilityIcon(sizeValue, slider.value);
      saveLandmarkSettings({ ...landmarks, marker: next });
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      const next = cloneMarkerSettings(marker);
      next[kind].splice(index, 1);
      saveLandmarkSettings({ ...landmarks, marker: next });
    });
    row.append(grip, color, sizeValue, divider, slider, remove);
    list.append(row);
  });
}

function splitStopNameAndState(name = "") {
  const text = String(name || "").trim();
  const parts = text.split(",").map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    return { town: text || "Stop", state: "--" };
  }
  const state = parts[parts.length - 1].replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  const town = parts.slice(0, -1).join(", ").trim();
  return { town: town || text || "Stop", state: state || "--" };
}

function renderLandmarkPreview(marker) {
  if (!els.landmarkPreview) return;
  els.landmarkPreview.replaceChildren();
  const svg = markerSvg(marker, {
    imageVisible: true,
    fallback: DEFAULT_LANDMARK_SETTINGS.marker,
    maxSize: LANDMARK_SIZE_INTERNAL_MAX,
    baseSizePx: 96
  });
  const preview = document.createElement("div");
  preview.className = "landmark-preview-icon";
  preview.innerHTML = svg.html;
  els.landmarkPreview.append(preview);
  addPreviewNudgeControls(els.landmarkPreview, "landmark");
  updateImagePreviewDrawer(els.landmarkPreview, "Landmark preview");
}

function renderDefaultLandmarkTile() {
  if (!els.defaultLandmarkTile) return;
  const defaults = cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
  const marker = normalizeMarkerSettings(defaults.marker, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX);
  const icon = markerSvg(marker, {
    imageVisible: true,
    fallback: DEFAULT_LANDMARK_SETTINGS.marker,
    maxSize: LANDMARK_SIZE_INTERNAL_MAX,
    baseSizePx: 92
  });
  els.defaultLandmarkTile.classList.toggle("is-selected", landmarkSettingsScope === "default");
  els.defaultLandmarkTile.dataset.help = "Click to edit the default landmark. Right-click to choose or upload its image.";
  els.defaultLandmarkTile.innerHTML = `
    <div class="default-landmark-tile-preview">${icon.html}</div>
    <div class="default-landmark-tile-text">
      <strong>Default landmark</strong>
      <span>Used when a stop has no custom landmark.</span>
    </div>
  `;
}

function featureButtonIconHtml(kind) {
  if (kind === "marker") {
    const target = markerSettingsTarget?.();
    const settings = target?.settings || DEFAULT_MARKER_SETTINGS;
    return markerSvg(settings, {
      imageVisible: true,
      fallback: DEFAULT_MARKER_SETTINGS,
      maxSize: MARKER_SIZE_INTERNAL_MAX,
      baseSizePx: 34
    }).html;
  }
  if (kind === "landmark") {
    const defaults = cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
    return markerSvg(defaults.marker, {
      imageVisible: true,
      fallback: DEFAULT_LANDMARK_SETTINGS.marker,
      maxSize: LANDMARK_SIZE_INTERNAL_MAX,
      baseSizePx: 34
    }).html;
  }
  if (kind === "routeIcon") {
    return routeAnimationLeafletIcon(getRouteAnimationIconSettings(), { iconSize: 34 }).options.html || "";
  }
  if (kind === "route") {
    return `<svg viewBox="0 0 42 28" aria-hidden="true"><path d="M4 20 C 11 6, 20 27, 28 10 S 35 16, 38 8" fill="none" stroke="${escapeHtml(layerStyles.route?.color || "#2b7ed8")}" stroke-width="7" stroke-linecap="round"/><path d="M4 20 C 11 6, 20 27, 28 10 S 35 16, 38 8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/></svg>`;
  }
  return `<span class="feature-stop-name-icon">Aa</span>`;
}

function featureStateLabel(kind) {
  if (kind === "marker") return els.markerImageDisplay?.selectedOptions?.[0]?.textContent || "Markers";
  if (kind === "landmark") {
    if (!els.landmarksEnabled?.checked) return "Landmarks off";
    return els.landmarkImageDisplay?.selectedOptions?.[0]?.textContent || "Landmarks";
  }
  if (kind === "routeIcon") return els.routeAnimationIconEnabled?.checked ? "Animation icon on" : "Animation icon off";
  if (kind === "route") return els.toggleRoute?.checked ? "Route on" : "Route off";
  return routeStopNamesVisible ? "Stop names on" : "Stop names off";
}

function featureButtonIconSignature(kind) {
  if (kind === "marker") {
    return JSON.stringify(markerSettingsTarget?.()?.settings || DEFAULT_MARKER_SETTINGS);
  }
  if (kind === "landmark") {
    return JSON.stringify((landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS).marker);
  }
  if (kind === "routeIcon") return JSON.stringify(getRouteAnimationIconSettings());
  if (kind === "route") return String(layerStyles.route?.color || "#2b7ed8");
  return kind;
}

function updateMapFeatureToolbar() {
  const buttons = [
    [els.featureToggleMarkers, "marker"],
    [els.featureToggleStopNames, "stopNames"],
    [els.featureToggleRoute, "route"],
    [els.featureToggleRouteIcon, "routeIcon"],
    [els.featureToggleLandmarks, "landmark"]
  ];
  buttons.forEach(([button, kind]) => {
    if (!button) return;
    const iconSignature = featureButtonIconSignature(kind);
    if (button.dataset.iconSignature !== iconSignature) {
      button.innerHTML = featureButtonIconHtml(kind);
      button.dataset.iconSignature = iconSignature;
    }
    const hidden =
      (kind === "marker" && els.markerImageDisplay?.value === "never") ||
      (kind === "route" && !routeDisplayVisible) ||
      (kind === "routeIcon" && !els.routeAnimationIconEnabled?.checked) ||
      (kind === "landmark" && !els.landmarksEnabled?.checked) ||
      (kind === "stopNames" && !routeStopNamesVisible);
    button.classList.toggle("is-hidden-state", hidden);
    const stateLabel = featureStateLabel(kind);
    button.title = stateLabel;
    button.dataset.help = `Cycles ${kind === "stopNames" ? "route stop names" : stateLabel.toLowerCase()}.`;
  });
  if (typeof musicRefreshButton === "function") musicRefreshButton();
}

function cycleSelect(select, values) {
  if (!select || !values.length) return "";
  const index = values.indexOf(select.value);
  const next = values[(index + 1) % values.length];
  select.value = next;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return next;
}

function landmarkDefaultDialogState() {
  const stored = rvStorageReadJson(LANDMARK_DEFAULT_DIALOG_KEY, {});
  return {
    categories: Array.isArray(stored?.categories)
      ? stored.categories
      : ["global", "size", "shape", "imageStrokes", "shapeStrokes"],
    targets: Array.isArray(stored?.targets) ? stored.targets : []
  };
}

function journeyLandmarkPreviewMarkup(marker) {
  return markerSvg(marker, {
    imageVisible: true,
    fallback: DEFAULT_LANDMARK_SETTINGS.marker,
    maxSize: LANDMARK_SIZE_INTERNAL_MAX,
    baseSizePx: 58
  }).html;
}

function renderJourneyLandmarkPanel() {
  if (!els.journeyLandmarkPanel) return;
  const trip = activeTrip();
  const stops = landmarkStopsForTrip(trip);
  const selectedStop = stops[clamp(selectedStopIndex, 0, Math.max(0, stops.length - 1))] || null;
  const defaults = cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
  const journey = tripLandmarkSettings(trip);
  const stopSettings = selectedStop
    ? journey.stops[selectedStop.key] || journey.stops[landmarkStopKey(selectedStop.name)] || {}
    : {};
  const currentMarker = normalizeMarkerSettings({
    ...journey.marker,
    ...(stopSettings.marker || {}),
    imageUrl: stopSettings.imageUrl || journey.marker.imageUrl || DEFAULT_LANDMARK_IMAGE_URL,
    imageName: stopSettings.imageName || selectedStop?.name || journey.marker.imageName
  }, journey.marker, LANDMARK_SIZE_INTERNAL_MAX);
  els.journeyDefaultLandmarkPreview.innerHTML = journeyLandmarkPreviewMarkup(defaults.marker);
  els.journeyCurrentLandmarkPreview.innerHTML = journeyLandmarkPreviewMarkup(currentMarker);
  const selectedLandmarkKey = selectedStop?.key ? `landmark:${selectedStop.key}` : "";
  addPreviewNudgeControls(els.journeyDefaultLandmarkPreview, "landmark", () => selectedLandmarkKey);
  addPreviewNudgeControls(els.journeyCurrentLandmarkPreview, "landmark", () => selectedLandmarkKey);
  els.journeyCurrentLandmarkName.textContent = selectedStop?.name || "No stop selected";
  els.journeyCurrentLandmark.disabled = !selectedStop;
  els.journeyCurrentLandmark.dataset.landmarkScope = selectedStop?.key || "";
}

function openJourneyLandmarkEditor(scope) {
  if (!scope) return;
  landmarkSettingsScope = scope;
  selectedLandmarkStopKey = scope === "default" ? "" : scope;
  document.querySelector('[data-panel-tab="map-ui"]')?.click();
  renderLandmarks();
  document.querySelector(".landmarks-section")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
}

function saveLandmarkDefaultDialogState() {
  rvStorageWriteJson(LANDMARK_DEFAULT_DIALOG_KEY, {
    categories: [...selectedLandmarkDefaultCategories()],
    targets: [...selectedLandmarkDefaultTargets()]
  });
}

function renderLandmarkDefaultTargets(scope = landmarkSettingsScope) {
  if (!els.landmarkDefaultTargets) return;
  const stops = landmarkStopsForTrip();
  const saved = new Set(landmarkDefaultDialogState().targets);
  if (!saved.size && scope && !["default", "journey", "trip"].includes(scope)) saved.add(scope);
  els.landmarkDefaultTargets.replaceChildren();
  stops.forEach(stop => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.landmarkDefaultTarget = stop.key;
    checkbox.checked = saved.has(stop.key);
    checkbox.addEventListener("change", saveLandmarkDefaultDialogState);
    const name = document.createElement("span");
    name.textContent = stop.name;
    label.append(checkbox, name);
    els.landmarkDefaultTargets.append(label);
  });
}

function openLandmarkDefaultDialog(scope = landmarkSettingsScope) {
  pendingLandmarkDefaultScope = scope || landmarkSettingsScope || "journey";
  const savedCategories = new Set(landmarkDefaultDialogState().categories);
  els.landmarkDefaultDialog?.querySelectorAll("[data-landmark-default-category]").forEach(input => {
    input.checked = savedCategories.has(input.dataset.landmarkDefaultCategory);
  });
  renderLandmarkDefaultTargets(pendingLandmarkDefaultScope);
  if (els.landmarkDefaultDialog) els.landmarkDefaultDialog.hidden = false;
}

function landmarkImageDialogSearchText(scope = pendingLandmarkStopKey) {
  if (!scope || scope === "default") return "";
  return landmarkStopsForTrip().find(stop => stop.key === scope)?.name || "";
}

function closeLandmarkImageDialog({ preserveTarget = false } = {}) {
  if (els.landmarkImageDialog) els.landmarkImageDialog.hidden = true;
  if (!preserveTarget) pendingLandmarkStopKey = "";
}

function openLandmarkImageDialog(scope = landmarkSettingsScope) {
  const target = scope && scope !== "journey" && scope !== "trip" ? scope : "default";
  pendingLandmarkStopKey = target;
  landmarkSettingsScope = target;
  selectedLandmarkStopKey = target === "default" ? "" : target;
  renderLandmarks();
  if (els.landmarkCatalogSearch) els.landmarkCatalogSearch.value = landmarkImageDialogSearchText(target);
  if (els.landmarkCatalogResults) els.landmarkCatalogResults.replaceChildren();
  if (els.landmarkCatalogStatus) els.landmarkCatalogStatus.textContent = "Searches only when requested.";
  if (els.landmarkImageDialog) els.landmarkImageDialog.hidden = false;
  requestAnimationFrame(() => els.landmarkCatalogSearch?.focus());
}

function commonsMetadataText(value = "") {
  const documentValue = new DOMParser().parseFromString(String(value || ""), "text/html");
  return String(documentValue.body.textContent || "").replace(/\s+/g, " ").trim();
}

function normalizeCommonsLandmarkResult(page = {}) {
  const info = page.imageinfo?.[0] || {};
  const metadata = info.extmetadata || {};
  const title = String(page.title || "").replace(/^File:/i, "").trim();
  const pageTitle = String(page.title || "").replace(/ /g, "_");
  return {
    title,
    imageUrl: info.thumburl || info.url || "",
    pageUrl: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(pageTitle)}`,
    creator: commonsMetadataText(metadata.Artist?.value || metadata.Credit?.value || "Unknown creator"),
    license: commonsMetadataText(metadata.LicenseShortName?.value || metadata.UsageTerms?.value || "See source"),
    licenseUrl: /^https?:\/\//i.test(metadata.LicenseUrl?.value || "") ? metadata.LicenseUrl.value : ""
  };
}

async function searchCommonsLandmarkImages(query) {
  const url = new URL(WIKIMEDIA_COMMONS_API_URL);
  const params = {
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "24",
    gsrsearch: `${query} landmark`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "420",
    iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms",
    origin: "*"
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await rvServiceFetch("commons", url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Online image search failed (${response.status}).`);
  const payload = await response.json();
  return (payload.query?.pages || []).map(normalizeCommonsLandmarkResult).filter(item => item.imageUrl);
}

function applyCommonsLandmarkImage(item) {
  const imageSource = {
    provider: "Wikimedia Commons",
    pageUrl: item.pageUrl,
    creator: item.creator,
    license: item.license,
    licenseUrl: item.licenseUrl
  };
  if (pendingLandmarkStopKey === "default") {
    const defaults = cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
    defaults.marker = normalizeMarkerSettings({
      ...defaults.marker,
      imageUrl: item.imageUrl,
      imageName: item.title,
      imageSource
    }, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX);
    saveLandmarkDefaultSettings(defaults);
  } else {
    const trip = activeTrip();
    if (!trip || !pendingLandmarkStopKey) return;
    const landmarks = tripLandmarkSettings(trip);
    const stop = landmarkStopsForTrip(trip).find(candidate => candidate.key === pendingLandmarkStopKey);
    const previous = landmarks.stops[pendingLandmarkStopKey] || landmarks.stops[landmarkStopKey(stop?.name)] || {};
    landmarks.stops[pendingLandmarkStopKey] = {
      ...previous,
      name: stop?.name || previous.name || pendingLandmarkStopKey,
      imageUrl: item.imageUrl,
      imageName: item.title,
      imageSource,
      marker: normalizeMarkerSettings({
        ...(previous.marker || landmarks.marker),
        imageUrl: item.imageUrl,
        imageName: item.title,
        imageSource
      }, landmarks.marker, LANDMARK_SIZE_INTERNAL_MAX)
    };
    landmarks.enabled = true;
    trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
    saveTrips();
  }
  renderRoute(false);
  renderLandmarks();
  closeLandmarkImageDialog();
  setTripStatus(`Selected “${item.title}” from Wikimedia Commons. Source and license details were saved.`);
}

function renderCommonsLandmarkResults(items) {
  if (!els.landmarkCatalogResults) return;
  els.landmarkCatalogResults.replaceChildren();
  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "landmark-catalog-card";
    const image = document.createElement("img");
    image.src = item.imageUrl;
    image.alt = "";
    image.loading = "lazy";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const credit = document.createElement("span");
    credit.textContent = `${item.creator || "Unknown creator"} · ${item.license || "See source"}`;
    const actions = document.createElement("div");
    const source = document.createElement("a");
    source.href = item.pageUrl;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "Source";
    const use = document.createElement("button");
    use.type = "button";
    use.textContent = "Use image";
    use.addEventListener("click", () => applyCommonsLandmarkImage(item));
    actions.append(source, use);
    copy.append(title, credit, actions);
    card.append(image, copy);
    els.landmarkCatalogResults.append(card);
  });
}

function closeLandmarkDefaultDialog() {
  pendingLandmarkDefaultScope = null;
  if (els.landmarkDefaultDialog) els.landmarkDefaultDialog.hidden = true;
}

function selectedLandmarkDefaultCategories() {
  return new Set([...els.landmarkDefaultDialog?.querySelectorAll("[data-landmark-default-category]:checked") || []]
    .map(input => input.dataset.landmarkDefaultCategory));
}

function selectedLandmarkDefaultTargets() {
  return new Set([...els.landmarkDefaultTargets?.querySelectorAll("[data-landmark-default-target]:checked") || []]
    .map(input => input.dataset.landmarkDefaultTarget));
}

function applyMarkerDefaultsByCategory(targetMarker, defaultMarker, categories) {
  const next = cloneMarkerSettings(targetMarker);
  if (categories.has("image")) {
    next.imageUrl = defaultMarker.imageUrl;
    next.imageName = defaultMarker.imageName;
    next.imageSize = defaultMarker.imageSize;
  }
  if (categories.has("size")) {
    next.size = defaultMarker.size;
  }
  if (categories.has("shape")) {
    next.shape = defaultMarker.shape;
    next.shapeEnabled = defaultMarker.shapeEnabled;
    next.shapeSize = defaultMarker.shapeSize;
    next.fillEnabled = defaultMarker.fillEnabled;
    next.fillColor = defaultMarker.fillColor;
    next.fillMode = defaultMarker.fillMode;
  }
  if (categories.has("imageStrokes")) {
    next.imageStrokes = defaultMarker.imageStrokes.map(normalizeMarkerStroke);
  }
  if (categories.has("shapeStrokes")) {
    next.strokes = defaultMarker.strokes.map(normalizeMarkerStroke);
  }
  return normalizeMarkerSettings(next, targetMarker, LANDMARK_SIZE_INTERNAL_MAX);
}

function applySelectedLandmarkDefaults() {
  const trip = activeTrip();
  const categories = selectedLandmarkDefaultCategories();
  const targetKeys = selectedLandmarkDefaultTargets();
  const defaults = cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
  const defaultMarker = normalizeMarkerSettings(defaults.marker, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX);
  if (!categories.size) {
    closeLandmarkDefaultDialog();
    return;
  }
  if (!trip) {
    closeLandmarkDefaultDialog();
    return;
  }
  const landmarks = tripLandmarkSettings(trip);
  if (categories.has("global")) {
    landmarks.enabled = defaults.enabled;
    landmarks.imageDisplay = defaults.imageDisplay;
    landmarks.perStopShapes = defaults.perStopShapes;
    landmarks.useDefaultForAll = defaults.useDefaultForAll;
    landmarks.scale = defaults.scale;
  }
  if (!targetKeys.size && ["journey", "trip"].includes(pendingLandmarkDefaultScope)) {
    landmarks.marker = applyMarkerDefaultsByCategory(landmarks.marker, defaultMarker, categories);
  }
  targetKeys.forEach(targetKey => {
    const stop = landmarkStopsForTrip(trip).find(item => item.key === targetKey);
    if (!stop) return;
    const previous = landmarks.stops[targetKey] || landmarks.stops[landmarkStopKey(stop.name)] || {};
    landmarks.stops[targetKey] = {
      ...previous,
      name: stop.name,
      imageUrl: categories.has("image") ? defaultMarker.imageUrl || DEFAULT_LANDMARK_IMAGE_URL : previous.imageUrl || DEFAULT_LANDMARK_IMAGE_URL,
      imageName: categories.has("image") ? defaultMarker.imageName || "Default landmark" : previous.imageName || stop.name || "Landmark",
      marker: applyMarkerDefaultsByCategory(previous.marker || landmarks.marker, defaultMarker, categories)
    };
  });
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  saveTrips();
  renderRoute(false);
  renderLandmarks();
  closeLandmarkDefaultDialog();
  saveLandmarkDefaultDialogState();
  setTripStatus(`Applied selected default settings to ${targetKeys.size || "the journey"} landmark${targetKeys.size === 1 ? "" : "s"}.`);
}

function anchorWholeJourneyNavigation() {
  const route = state.routes[0];
  if (!route) return;
  // Whole-journey and US views do not have a selected leg. Leaving a prior
  // leg selected made the route selector, stop selector, and rendered map
  // disagree after moving between those views.
  state.activeRouteIndex = 0;
  selectedStopIndex = 0;
  state.points = route.points;
  state.displayPoints = route.displayPoints;
  state.title = route.label || route.title;
  state.playback.progress = 0;
  state.playback.hasStarted = false;
}

function setActiveRoute(index, fit = true, showStartMedia = true) {
  const route = state.routes[index];
  if (!route) return;
  const previousIndex = state.activeRouteIndex;
  const previousRoute = state.routes[previousIndex];
  const adjacentTransition = Math.abs(index - previousIndex) === 1;
  const loadingLocationName = adjacentTransition && previousRoute
    ? index > previousIndex
      ? endpointJumpLocation(previousRoute, "end")
      : endpointJumpLocation(previousRoute, "start")
    : endpointJumpLocation(route, "start");
  clearOverviewHoverTimer();
  closeJourneyMedia();
  state.overviewHover.activeIndex = null;
  state.overviewHover.lockedIndex = null;
  clearOverviewReachedRoute();
  state.overviewFocusIndex = null;
  state.overviewFocusZoom = null;
  stopPlayback();
  state.overviewMode = false;
  state.selectionScope = "route";
  state.noStopSelected = false;
  state.noDaySelected = false;
  if (typeof selectedStopDayIso !== "undefined") selectedStopDayIso = "";
  updatePinnedSelectionHighlights();
  state.activeRouteIndex = index;
  // Selecting a route means its beginning is the active playback position.
  // Stop focus overwrites this below with the selected stop, but route focus
  // must not silently advance Next onto the following leg.
  selectedStopIndex = clamp(index, 0, Math.max(0, synchronizeTripStops(activeTrip()).length - 1));
  state.overviewZoneModifyIndex = null;
  state.overviewMarkerModifyIndex = null;
  state.markerModifyTarget = null;
  els.zoneModifyMapPrompt.hidden = true;
  state.points = route.points;
  state.displayPoints = route.displayPoints;
  state.title = route.label || route.title;
  state.playback.progress = 0;
  state.playback.hasStarted = false;
  els.empty.hidden = true;
  els.status.textContent = `Using ${route.source}`;
  renderRouteDayButtons();
  updateStats();
  const completeRouteFocus = () => {
    applyMapInteractionLocks();
    applyToggleState(getToggleState());
    renderCityLabels();
    if (showStartMedia) openStartOfDayMedia(route);
  };
  renderRoute(false);
  if (fit) {
    moveToSelectionCamera({
      scope: "route",
      routeIndex: index,
      preload: false,
      loadingLocationName,
      onComplete: completeRouteFocus
    });
  } else if (!fit) {
    completeRouteFocus();
  }
  applyToggleState(getToggleState());
  renderCityLabels();
  renderTripManager();
  updateExplicitNavigationControls();
}

function selectOverviewRoute(index, options = {}) {
  const route = state.routes[index];
  if (!route || !state.overviewMode) return;
  const shouldRender = options.render !== false;
  clearOverviewHoverTimer();
  stopPlayback();
  state.activeRouteIndex = index;
  state.points = route.points;
  state.displayPoints = route.displayPoints;
  state.title = route.label || route.title;
  state.playback.progress = 0;
  state.playback.hasStarted = false;
  els.status.textContent = `Using ${route.source}`;
  renderRouteDayButtons();
  updateStats();
  if (shouldRender) renderRoute(false);
  applyToggleState(getToggleState());
  renderCityLabels();
  renderTripManager();
}

function chooseOverviewZoneDay(index) {
  const route = state.routes[index];
  if (!route) return;
  const modifyingZones = Boolean(els.dayZoneModifyPanel && !els.dayZoneModifyPanel.hidden);
  if (!modifyingZones) {
    zoomToOverviewZone(index);
    return;
  }
  if (!state.overviewMode) {
    state.overviewMode = true;
  }
  state.overviewHover.activeIndex = index;
  state.overviewHover.lockedIndex = index;
  state.overviewZoneModifyIndex = index;
  state.overviewMarkerModifyIndex = index;
  state.overviewFocusIndex = null;
  state.overviewFocusZoom = null;
  selectedTripMediaId = null;
  selectOverviewRoute(index);
  updateDayZoneModifyControls();
  renderMarkerControls();
  renderRoute(false);
}

function shuffledJumpImages() {
  const images = [...JUMP_IMAGE_URLS];
  for (let index = images.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [images[index], images[swapIndex]] = [images[swapIndex], images[index]];
  }
  if (images.length > 1 && images[0] === lastJumpImageUrl) {
    [images[0], images[1]] = [images[1], images[0]];
  }
  return images;
}

function nextJumpImageUrl() {
  if (!jumpImageQueue.length) {
    jumpImageQueue = shuffledJumpImages();
  }
  const next = jumpImageQueue.shift() || JUMP_IMAGE_URLS[0];
  lastJumpImageUrl = next;
  return next;
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function jumpImageNameVariants(locationName) {
  const cleanName = String(locationName || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleanName) return [];
  const noComma = cleanName.replace(/\s*,\s*/g, " ");
  const firstPart = cleanName.split(",")[0]?.trim() || "";
  const lowercase = cleanName.toLowerCase();
  const slug = noComma
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const underscoreSlug = noComma
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return uniqueStrings([
    cleanName,
    noComma,
    firstPart,
    lowercase,
    noComma.toLowerCase(),
    firstPart.toLowerCase(),
    slug,
    underscoreSlug
  ]);
}

function jumpImageCandidateUrls(locationName) {
  const extensions = ["png", "jpg", "jpeg", "webp"];
  return jumpImageNameVariants(locationName).flatMap(name =>
    extensions.map(extension => encodeURI(`assets/jump images/${name}.${extension}`))
  );
}

function firstJumpImageCandidateUrl(locationName) {
  return jumpImageCandidateUrls(locationName)[0] || "";
}

function imageUrlCanLoad(url) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

async function resolveJumpImageForLocation(locationName) {
  const cacheKey = String(locationName || "").trim().toLowerCase();
  if (!cacheKey) return "";
  if (locationJumpImageCache.has(cacheKey)) {
    return locationJumpImageCache.get(cacheKey);
  }
  for (const url of jumpImageCandidateUrls(locationName)) {
    if (await imageUrlCanLoad(url)) {
      locationJumpImageCache.set(cacheKey, url);
      return url;
    }
  }
  locationJumpImageCache.set(cacheKey, "");
  return "";
}

function endpointJumpLocation(route, endpoint) {
  return route ? routeEndpointName(route, endpoint) : "";
}

function setLoadingOverlayImage(imageUrl, token = loadingOverlayToken) {
  if (!imageUrl || token !== loadingOverlayToken || els.empty?.hidden) return;
  const image = els.empty.querySelector(".startup-loading-card img");
  if (image) image.src = imageUrl;
}

function warmJumpImages() {
  JUMP_IMAGE_URLS.forEach(url => {
    const image = new Image();
    image.src = url;
  });
}

function setLoadingOverlayContent({ imageUrl = nextJumpImageUrl(), fallbackImageUrl = "", text = "Loading map..." } = {}) {
  if (BYPASS_WELCOME_AND_MEDIA_GATE) {
    if (els.empty) els.empty.hidden = true;
    return;
  }
  els.empty.replaceChildren();
  const card = document.createElement("div");
  card.className = "startup-loading-card";
  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = "Jump image";
  if (fallbackImageUrl) {
    image.onerror = () => {
      image.onerror = null;
      image.src = fallbackImageUrl;
    };
  }
  const label = document.createElement("span");
  label.textContent = text;
  const bar = document.createElement("div");
  bar.className = "startup-loading-bar";
  bar.setAttribute("aria-hidden", "true");
  const fill = document.createElement("div");
  fill.className = "startup-loading-bar-fill";
  // Do not depend solely on a CSS keyframe for visible startup feedback. This
  // explicit transition also works when reduced-motion settings disable the
  // animation or when the loading card is rebuilt during startup.
  fill.style.width = "6%";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (fill.isConnected) fill.style.width = "92%";
  }));
  bar.append(fill);
  card.append(image, label, bar);
  els.empty.append(card);
}

function showMapLoadingOverlay(options = {}) {
  // EDIT ↔ USER is an immediate comparison surface, not a loading transition.
  // Resize/camera work can arrive asynchronously after the mode toggle, so
  // enforce that policy at the one function that actually reveals this UI.
  if (globalThis.rvSuppressLoadingSurfaces) {
    if (els.empty) els.empty.hidden = true;
    return null;
  }
  const token = ++loadingOverlayToken;
  const contentOptions = { ...options };
  if (!contentOptions.imageUrl && contentOptions.locationName) {
    contentOptions.imageUrl = firstJumpImageCandidateUrl(contentOptions.locationName);
    contentOptions.fallbackImageUrl = nextJumpImageUrl();
  }
  setLoadingOverlayContent(contentOptions);
  mapTransitionLoadingStartedAt = Date.now();
  els.empty.hidden = false;
  els.empty.classList.remove("is-complete", "is-fading");
  els.empty.classList.add("startup-loading-state");
  if (options.locationName) {
    resolveJumpImageForLocation(options.locationName)
      .then(url => setLoadingOverlayImage(url, token))
      .catch(() => {});
  }
  return token;
}

function fadeMapLoadingOverlay({ minRemaining = 0 } = {}) {
  const overlay = els.empty;
  if (!overlay || overlay.hidden) return;
  overlay.classList.add("is-complete");
  window.setTimeout(() => {
    overlay.classList.add("is-fading");
    window.setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove("startup-loading-state", "is-complete", "is-fading");
    }, 560);
  }, Math.max(0, minRemaining));
}

function finishInitialRouteLoading() {
  if (initialRouteViewFinished) return;
  initialRouteViewFinished = true;
  initialRouteViewPending = false;
  const elapsed = Date.now() - startupLoadingStartedAt;
  const remaining = Math.max(0, STARTUP_LOADING_MIN_MS - elapsed);
  fadeMapLoadingOverlay({ minRemaining: remaining });
}

function startupLoadingOverlayActive() {
  return Boolean(!els.empty?.hidden && els.empty?.classList.contains("startup-loading-state"));
}

function cancelInitialRouteLoading() {
  initialRouteViewPending = false;
  initialRouteViewFinished = true;
  els.empty?.classList.remove("startup-loading-state", "is-complete", "is-fading");
}

function setOverviewMode(fitOptions = {}) {
  if (!state.routes.length) return;
  if (typeof sfxPlayEvent === "function") sfxPlayEvent("view.journey");
  const isInitialRouteView = initialRouteViewPending;
  const suppliedOnComplete = fitOptions.onComplete;
  const loadingLocationName = fitOptions.loadingLocationName ?? endpointJumpLocation(activeRoute(), "end");
  const overviewFitOptions = isInitialRouteView
    ? { ...fitOptions, loadingLocationName, animate: false }
    : { ...fitOptions, loadingLocationName };
  clearOverviewHoverTimer();
  closeJourneyMedia();
  stopPlayback();
  anchorWholeJourneyNavigation();
  state.overviewMode = true;
  state.selectionScope = "journey";
  updatePinnedSelectionHighlights();
  state.contiguousUsMode = false;
  state.overviewHomeView = null;
  state.overviewHover.activeIndex = null;
  state.overviewHover.lockedIndex = null;
  clearOverviewReachedRoute();
  state.overviewFocusIndex = null;
  state.overviewFocusZoom = null;
  state.overviewZoneModifyIndex = null;
  state.overviewMarkerModifyIndex = null;
  state.overviewZoneRects = [];
  if (!isInitialRouteView) {
    if (!startupLoadingOverlayActive()) els.empty.hidden = true;
  }
  els.status.textContent = "Showing all route days";
  renderRouteDayButtons();
  updateStats();
  const completeJourneyFocus = () => {
    captureOverviewHomeView();
    applyMapInteractionLocks();
    applyToggleState(getToggleState());
    renderCityLabels();
    if (isInitialRouteView) finishInitialRouteLoading();
    else if (!startupLoadingOverlayActive()) els.empty.hidden = true;
    suppliedOnComplete?.();
  };
  renderRoute(false);
  moveToSelectionCamera({ scope: "journey", ...overviewFitOptions, onComplete: completeJourneyFocus });
  applyToggleState(getToggleState());
  renderCityLabels();
  renderTripManager();
  updateUsViewButton();
}

function setRenameMode(kind, active) {
  const isTrip = kind === "trip";
  const select = isTrip ? els.tripSelect : els.routeDaySelect;
  const input = isTrip ? els.tripRenameInput : els.dayRenameFields;
  const button = isTrip ? els.journeyViewAll : els.renameDayButton;
  if (!select || !input || !button) return;
  if (active) {
    if (isTrip) {
      input.value = activeTrip()?.name || "";
    } else {
      const route = activeRoute();
      const routeIndex = state.activeRouteIndex;
      const stop = activeJourneyStop();
      const linkedStart = routeIndex > 0 && !route?.startNameIndependent;
      els.dayRenameNameInput.value = stop?.name || route?.label || "";
      els.dayRenameStartInput.value = routeEndpointName(route, "start");
      els.dayRenameEndInput.value = routeEndpointName(route, "end");
      els.dayRenameIndependentStartName.checked = !linkedStart;
      els.dayRenameStartInput.disabled = linkedStart;
    }
    select.hidden = true;
    input.hidden = false;
    button.textContent = "Update name";
    const focusTarget = isTrip ? input : els.dayRenameNameInput;
    focusTarget.focus();
    focusTarget.select();
    return;
  }
  input.hidden = true;
  select.hidden = false;
  button.textContent = "Edit name";
}

function updateRename(kind) {
  const isTrip = kind === "trip";
  const input = isTrip ? els.tripRenameInput : els.dayRenameNameInput;
  const value = input?.value.trim();
  if (!value) {
    setRenameMode(kind, false);
    return;
  }
  if (isTrip) {
    const trip = activeTrip();
    if (trip) trip.name = value;
  } else {
    const trip = activeTrip();
    const stop = activeJourneyStop();
    const route = activeRoute();
    if (trip && stop) {
      stop.name = value;
      const incoming = trip.days[selectedStopIndex - 1];
      const outgoing = trip.days[selectedStopIndex];
      if (incoming) {
        incoming.endName = value;
        incoming.label = value;
        incoming.title = value;
        incoming.autoLabel = false;
        incoming.summary = `${routeEndpointName(incoming, "start")} to ${value}`;
      }
      if (outgoing) {
        outgoing.startName = value;
        outgoing.startNameIndependent = true;
        outgoing.summary = `${value} to ${routeEndpointName(outgoing, "end")}`;
      }
    } else if (route) {
      route.label = value;
      route.title = value;
      route.autoLabel = false;
      route.startNameIndependent = Boolean(els.dayRenameIndependentStartName?.checked);
      route.startName = route.startNameIndependent ? els.dayRenameStartInput.value.trim() : "";
      route.endName = els.dayRenameEndInput.value.trim();
      route.summary = `${routeEndpointName(route, "start")} to ${routeEndpointName(route, "end")}`;
    }
  }
  saveTrips();
  renderTripManager();
  updateStats();
  renderRouteDayButtons();
  setRenameMode(kind, false);
}

els.journeyViewAll?.addEventListener("click", () => {
  if (els.tripRenameInput && !els.tripRenameInput.hidden) updateRename("trip");
  else setRenameMode("trip", true);
});

els.renameDayButton?.addEventListener("click", () => {
  if (els.dayRenameFields && !els.dayRenameFields.hidden) updateRename("day");
  else setRenameMode("day", true);
});

[
  ["trip", els.tripRenameInput],
  ["day", els.dayRenameNameInput],
  ["day", els.dayRenameStartInput],
  ["day", els.dayRenameEndInput]
].forEach(([kind, input]) => {
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      updateRename(kind);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setRenameMode(kind, false);
    }
  });
});

els.dayRenameIndependentStartName?.addEventListener("change", () => {
  const route = activeRoute();
  const linkedStart = state.activeRouteIndex > 0 && !els.dayRenameIndependentStartName.checked;
  els.dayRenameStartInput.disabled = linkedStart;
  if (linkedStart) {
    els.dayRenameStartInput.value = routeEndpointName(route, "start");
  } else {
    els.dayRenameStartInput.focus();
    els.dayRenameStartInput.select();
  }
});

els.routeDaySelect?.addEventListener("change", () => {
  if (els.routeDaySelect.value === "defaults") {
    state.noStopSelected = true;
    state.noDaySelected = true;
    selectedStopDayIso = "";
    setOverviewMode({ animate: true, loadingLocationName: "" });
    return;
  }
  if (els.routeDaySelect.value === "all") {
    state.noStopSelected = false;
    state.noDaySelected = false;
    setOverviewMode();
    return;
  }
  const match = els.routeDaySelect.value.match(/^stop:(\d+)$/);
  if (match) {
    state.noStopSelected = false;
    state.noDaySelected = false;
    if (els.tripMediaTarget) els.tripMediaTarget.value = "stop-day";
    focusJourneyStop(Number(match[1]));
    selectedTripMediaId = null;
    renderTripMedia();
  }
});

els.stopDaySelect?.addEventListener("change", () => {
  if (!els.stopDaySelect.value) {
    state.noDaySelected = true;
    selectedStopDayIso = "";
    renderStopDayLists();
    renderTripMedia();
    renderMediaMarkers();
    renderStickers();
    return;
  }
  selectStopDay(els.stopDaySelect.value);
});

els.followStopDaySequence?.addEventListener("change", () => {
  const trip = activeTrip();
  if (!trip) return;
  trip.followStopDaySequence = els.followStopDaySequence.checked;
  saveTrips();
  renderTripManager();
  renderStopDayLists();
});

els.pinnedRouteSelect?.addEventListener("change", () => {
  if (els.pinnedRouteSelect.value === "all") {
    setOverviewMode({ animate: true, loadingLocationName: "" });
    return;
  }
  const index = Number(els.pinnedRouteSelect.value);
  if (!Number.isInteger(index) || !state.routes[index]) return;
  if (els.tripMediaTarget) els.tripMediaTarget.value = "route";
  selectedStopIndex = Math.min(index + 1, synchronizeTripStops(activeTrip()).length - 1);
  setActiveRoute(index);
});

[
  [els.stopArrivalDate, "arrivalDate"],
  [els.stopDepartureDate, "departureDate"],
  [els.editStopStartDate, "arrivalDate"],
  [els.editStopEndDate, "departureDate"]
].forEach(([input, field]) => {
  input?.addEventListener("change", () => commitStopDateInput(input, field));
  input?.addEventListener("blur", () => commitStopDateInput(input, field));
  input?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (commitStopDateInput(input, field)) input.blur();
  });
});

els.stopCalendarButton?.addEventListener("click", event => {
  event.stopPropagation();
  const opening = els.stopCalendarPopover.hidden;
  setStopCalendarOpen("pinned", opening);
});

els.editStopCalendarButton?.addEventListener("click", event => {
  event.stopPropagation();
  const opening = els.editStopCalendarPopover.hidden;
  setStopCalendarOpen("editor", opening);
});

[
  [els.stopCalendarPrevious, -1, "pinned"],
  [els.stopCalendarNext, 1, "pinned"],
  [els.editStopCalendarPrevious, -1, "editor"],
  [els.editStopCalendarNext, 1, "editor"]
].forEach(([button, direction, surface]) => {
  button?.addEventListener("click", () => {
    stopCalendarSurface = surface;
    stopCalendarView = new Date(stopCalendarView.getFullYear(), stopCalendarView.getMonth() + direction, 1);
    renderStopCalendar();
  });
});

document.addEventListener("pointerdown", event => {
  const calendar = stopCalendarElements();
  if (calendar.popover?.hidden) return;
  if (calendar.popover.contains(event.target) || calendar.button?.contains(event.target)) return;
  calendar.popover.hidden = true;
  calendar.button?.setAttribute("aria-expanded", "false");
  stopCalendarRangeStart = "";
});

document.addEventListener("pointerup", finishStopCalendarDrag);

[els.tripSelect, els.routeDaySelect, els.stopDaySelect, els.pinnedRouteSelect, els.tripRenameInput, els.journeyViewAll, els.renameDayButton].filter(Boolean).forEach(control => {
  control.addEventListener("click", event => event.stopPropagation());
  control.addEventListener("pointerdown", event => event.stopPropagation());
  control.addEventListener("contextmenu", event => event.stopPropagation());
  control.addEventListener("keydown", event => event.stopPropagation());
});

els.elementsRouteSelect?.addEventListener("change", () => {
  elementsPreviewRouteSelection = els.elementsRouteSelect.value || "settings";
  if (elementsPreviewMode) enterElementsPreview();
});

els.addTrip.addEventListener("click", addTripFromInput);
els.addTopTrip?.addEventListener("click", () => {
  const name = els.newTopTripName?.value.trim();
  if (!name) {
    setTripStatus("Enter a trip name.", true);
    els.newTopTripName?.focus();
    return;
  }
  if (addTripGroup(name)) els.newTopTripName.value = "";
});
els.newTopTripName?.addEventListener("keydown", event => {
  if (event.key === "Enter") { event.preventDefault(); els.addTopTrip?.click(); }
});
els.deleteTopTrip?.addEventListener("click", () => deleteActiveTripGroup());

function selectedTripExportIndexes() {
  return [...els.tripExportList.querySelectorAll("input[type='checkbox']")]
    .filter(input => input.checked)
    .map(input => Number(input.value))
    .filter(index => Number.isInteger(index) && state.trips[index]);
}

function updateTripExportDialogState() {
  const checkboxes = [...els.tripExportList.querySelectorAll("input[type='checkbox']")];
  const allSelected = checkboxes.length > 0 && checkboxes.every(input => input.checked);
  const hasSelection = checkboxes.some(input => input.checked);
  els.tripExportAll.disabled = allSelected;
  els.tripExportOkay.disabled = !hasSelection;
}

function closeTripExportDialog() {
  els.tripExportDialog.hidden = true;
  els.exportTrips.focus();
}

function openTripExportDialog() {
  els.tripExportList.replaceChildren();
  state.trips.forEach((trip, index) => {
    const label = document.createElement("label");
    label.className = "trip-export-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = String(index);
    checkbox.checked = true;
    checkbox.addEventListener("change", updateTripExportDialogState);
    const text = document.createElement("span");
    text.textContent = `${trip.name} (${trip.days.length} day${trip.days.length === 1 ? "" : "s"})`;
    label.append(checkbox, text);
    els.tripExportList.append(label);
  });
  els.tripExportDialog.hidden = false;
  updateTripExportDialogState();
  els.tripExportOkay.focus();
}

function exportSelectedTrips(indexes) {
  const trips = serializeSelectedTrips(indexes);
  if (!trips.length) {
    setTripStatus("Choose at least one journey to export.", true);
    return;
  }
  const format = document.querySelector("input[name='tripExportFormat']:checked")?.value || "kml";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileBase = trips.length === 1 ? trips[0].name : `All ${timestamp}`;
  if (format === "json") {
    downloadJson(`${safeDownloadName(fileBase)}.json`, getJourneysExportPayload(indexes));
    setTripStatus(`Exported ${trips.length} journey${trips.length === 1 ? "" : "s"} as JSON.`);
    return;
  }
  downloadBlob(`${safeDownloadName(fileBase)}.kml`, new Blob([journeysToKml(trips)], {
    type: "application/vnd.google-earth.kml+xml"
  }));
  setTripStatus(`Exported ${trips.length} journey${trips.length === 1 ? "" : "s"} as KML.`);
}

els.exportTrips.addEventListener("click", openTripExportDialog);

els.saveJourneysToProject?.addEventListener("click", () => {
  saveProjectSettingsFile(JOURNEYS_EXPORT_NAME, getJourneysExportPayload(), "trips/rv-map-journeys.json");
});

els.tripExportAll.addEventListener("click", () => {
  els.tripExportList.querySelectorAll("input[type='checkbox']").forEach(input => {
    input.checked = true;
  });
  updateTripExportDialogState();
});

els.tripExportCancel.addEventListener("click", closeTripExportDialog);

els.tripExportOkay.addEventListener("click", () => {
  const indexes = selectedTripExportIndexes();
  exportSelectedTrips(indexes);
  closeTripExportDialog();
});

els.tripExportDialog.addEventListener("click", event => {
  if (event.target === els.tripExportDialog) {
    closeTripExportDialog();
  }
});

els.tripExportDialog.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeTripExportDialog();
  }
});

els.importTrips.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const imported = await readJsonFile(file);
    const currentPayload = rvStorageGet(TRIPS_STORAGE_KEY);
    if (currentPayload) rememberTripsBackup(currentPayload);
    const incomingTrips = appendTripsPayload(imported);
    saveTrips();
    finishTripsRestore(`Imported ${incomingTrips.length} journey${incomingTrips.length === 1 ? "" : "s"} from ${file.name}.`);
  } catch (error) {
    setTripStatus(error.message || "The journey backup could not be imported.", true);
  } finally {
    event.target.value = "";
  }
});

els.restoreTripsBackup.addEventListener("click", async () => {
  els.restoreTripsBackup.disabled = true;
  try {
    const backup = await latestTripsBackup();
    if (!backup?.payload) {
      setTripStatus("No automatic journey backup is available yet.", true);
      return;
    }
    const saved = JSON.parse(backup.payload);
    hydrateTripsPayload(saved);
    applyTripsPayload(saved);
    saveTrips();
    finishTripsRestore(`Restored backup from ${new Date(backup.savedAt).toLocaleString()}.`);
  } catch (error) {
    setTripStatus(error.message || "The automatic journey backup could not be restored.", true);
  } finally {
    els.restoreTripsBackup.disabled = false;
  }
});

els.deleteTrip.addEventListener("click", () => {
  if (state.trips.length <= 1) return;
  const removed = state.trips.splice(state.activeTripIndex, 1)[0];
  if (els.deleteJourneyMode?.value === "keep-stops") {
    const receiver = state.trips[Math.max(0, state.activeTripIndex - 1)] || state.trips[0];
    receiver.days.push(...removed.days);
    synchronizeTripStops(receiver);
  } else {
    removed.days.forEach(day => {
      day.media?.forEach(item => item.url && URL.revokeObjectURL(item.url));
    });
  }
  state.activeTripIndex = clamp(state.activeTripIndex, 0, state.trips.length - 1);
  selectTrip(state.activeTripIndex);
  setTripStatus(els.deleteJourneyMode?.value === "keep-stops"
    ? `Deleted ${removed.name}; its stops were kept in the neighboring journey.`
    : `Deleted ${removed.name} and its stops.`);
});

els.deleteSelectedStop?.addEventListener("click", () => {
  const trip = activeTrip();
  if (!trip?.days?.length) return;
  const routeIndex = selectedStopIndex === 0 ? 0 : selectedStopIndex - 1;
  const removed = trip.days.splice(routeIndex, 1)[0];
  removed?.media?.forEach(item => item.url && URL.revokeObjectURL(item.url));
  selectedStopIndex = clamp(Math.min(selectedStopIndex, trip.days.length), 0, Math.max(0, trip.days.length));
  synchronizeTripStops(trip);
  saveTrips();
  renderTripManager();
  setTripStatus(`Deleted the selected stop and its attached route leg.`);
});

els.createAddressRoute.addEventListener("click", createRouteFromAddresses);

function updateTripDayNameSettings() {
  const trip = activeTrip();
  if (!trip) return;
  trip.dayNamePattern = els.dayNamePattern.value.trim() || DEFAULT_DAY_NAME_PATTERN;
  resequenceTripDayLabels(trip);
  updateNewDaySequencePreview();
  saveTrips();
  renderRouteDayButtons();
  renderTripManager();
}

els.newDaySequence.addEventListener("change", () => {
  els.newDayLabel.disabled = els.newDaySequence.checked;
  updateNewDaySequencePreview();
  if (!els.newDaySequence.checked) {
    els.newDayLabel.value = "";
    els.newDayLabel.focus();
  }
});

els.dayNamePattern.addEventListener("change", updateTripDayNameSettings);
els.dayNamePattern.addEventListener("input", updateDayNamePatternTooltip);

function dayNameTokenFromTarget(target) {
  const grid = target?.closest?.(".day-name-token-grid");
  if (!grid) return "";
  const code = target.closest("code") || target.closest("span")?.previousElementSibling;
  return code?.tagName === "CODE" ? code.textContent.trim() : "";
}

els.dayNamePatternTooltip?.addEventListener("pointerdown", event => {
  if (!dayNameTokenFromTarget(event.target)) return;
  // Preserve the input's focus and its current text-selection range.
  event.preventDefault();
});

els.dayNamePatternTooltip?.addEventListener("click", event => {
  const token = dayNameTokenFromTarget(event.target);
  if (!token) return;
  const start = Number.isInteger(els.dayNamePattern.selectionStart) ? els.dayNamePattern.selectionStart : els.dayNamePattern.value.length;
  const end = Number.isInteger(els.dayNamePattern.selectionEnd) ? els.dayNamePattern.selectionEnd : start;
  els.dayNamePattern.setRangeText(token, start, end, "end");
  els.dayNamePattern.dispatchEvent(new Event("input", { bubbles: true }));
  els.dayNamePattern.focus({ preventScroll: true });
});

function positionDayNamePatternTooltip() {
  if (!els.dayNamePatternTooltip || els.dayNamePatternTooltip.hidden) return;
  const inputRect = els.dayNamePattern.getBoundingClientRect();
  const tooltipRect = els.dayNamePatternTooltip.getBoundingClientRect();
  const gap = 7;
  const edge = 12;
  const spaceBelow = window.innerHeight - inputRect.bottom - edge;
  const spaceAbove = inputRect.top - edge;
  const placeBelow = spaceBelow >= tooltipRect.height + gap || spaceBelow >= spaceAbove;
  const top = placeBelow
    ? Math.min(inputRect.bottom + gap, window.innerHeight - tooltipRect.height - edge)
    : Math.max(edge, inputRect.top - tooltipRect.height - gap);
  const left = clamp(inputRect.left, edge, Math.max(edge, window.innerWidth - tooltipRect.width - edge));
  els.dayNamePatternTooltip.style.top = `${Math.round(top)}px`;
  els.dayNamePatternTooltip.style.left = `${Math.round(left)}px`;
}

els.dayNamePattern.addEventListener("focus", () => {
  if (!els.dayNamePatternTooltip) return;
  updateDayNamePatternTooltip();
  if (els.dayNamePatternTooltip.parentElement !== document.body) {
    document.body.append(els.dayNamePatternTooltip);
  }
  els.dayNamePatternTooltip.hidden = false;
  requestAnimationFrame(positionDayNamePatternTooltip);
});
els.dayNamePattern.addEventListener("blur", () => {
  if (els.dayNamePatternTooltip) els.dayNamePatternTooltip.hidden = true;
});
window.addEventListener("resize", positionDayNamePatternTooltip);
window.addEventListener("scroll", positionDayNamePatternTooltip, true);

els.newDayIndependentStart.addEventListener("change", () => {
  renderNewDayStartControl();
  if (!els.routeStartAddress.disabled && !els.newDayRestDay.checked) {
    els.routeStartAddress.focus();
  } else if (els.newDayRestDay.checked && !els.routeEndAddress.disabled) {
    els.routeEndAddress.focus();
  }
});

els.newDayRestDay.addEventListener("change", () => {
  renderNewDayStartControl();
  clearRequiredState(els.routeStartAddress);
  clearRequiredState(els.routeEndAddress);
  if (els.newDayRestDay.checked && !els.routeEndAddress.disabled) {
    els.routeEndAddress.focus();
  }
});

[els.newTripName, els.newDayLabel, els.routeStartAddress, els.routeEndAddress].forEach(input => {
  input.dataset.defaultPlaceholder = input.placeholder;
  input.addEventListener("input", () => {
    if (input.value.trim()) {
      clearRequiredState(input);
    }
  });
});

els.newTripName.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  addTripFromInput();
});

[els.newDayLabel, els.routeStartAddress, els.routeEndAddress].forEach(input => {
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    createRouteFromAddresses();
  });
});

els.tripRouteInput.addEventListener("change", async event => {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  try {
    const { routes, conversions } = await routesFromUploadFiles(files);
    if (!routes.length) throw new Error("No usable route days were found.");
    openRouteImportDialog(routes, conversions);
  } catch (error) {
    setTripStatus(error.message || "The route file could not be added.", true);
  } finally {
    event.target.value = "";
  }
});

els.routeImportCancel?.addEventListener("click", closeRouteImportDialog);

els.routeImportDialog?.addEventListener("click", event => {
  if (event.target === els.routeImportDialog) closeRouteImportDialog();
});

els.routeImportApply?.addEventListener("click", () => {
  if (!pendingRouteImportRoutes.length) {
    closeRouteImportDialog();
    return;
  }
  const count = pendingRouteImportRoutes.length;
  const conversions = [...pendingRouteImportConversions];
  insertRoutesIntoActiveTrip(pendingRouteImportRoutes, Number(els.routeImportPosition?.value || 0), {
    sequenceNumber: els.routeImportSequenceNumber?.value || "",
    sequenceDate: els.routeImportSequenceDate?.value || ""
  });
  conversions.forEach(conversion => {
    const baseName = conversion.fileName.replace(/\.[^.]+$/, "");
    const payload = uploadedRoutesToJsonPayload(conversion.routes, baseName);
    downloadJson(`${safeDownloadName(baseName)}.json`, payload);
  });
  closeRouteImportDialog();
  setTripStatus(`Imported ${count} day${count === 1 ? "" : "s"}${conversions.length ? ` and converted ${conversions.length} file${conversions.length === 1 ? "" : "s"} to JSON.` : "."}`);
});

els.saveDayDetails.addEventListener("click", () => {
  const route = activeRoute();
  if (!route) return;
  const previousLabel = route.label;
  const previousNumber = route.sequenceNumber;
  const previousDate = route.sequenceDate;
  route.sequenceNumber = sequenceNumberFromInput(els.editDaySequenceNumber.value);
  route.sequenceDate = els.editDaySequenceDate.value || "";
  els.editDaySequenceNumber.value = sequenceNumberInputValue(route.sequenceNumber);
  const expectedAutoLabel = formatDaySequenceName(activeTrip(), state.activeRouteIndex);
  const typedLabel = els.editDayLabel.value.trim();
  const sequenceChanged = route.sequenceNumber !== previousNumber || route.sequenceDate !== previousDate;
  route.autoLabel = sequenceChanged || !typedLabel || route.autoLabel && typedLabel === previousLabel || typedLabel === expectedAutoLabel;
  if (sequenceChanged) {
    enableAutoLabelsFrom(activeTrip(), state.activeRouteIndex);
  }
  if (!route.autoLabel) {
    route.label = typedLabel || route.label;
    route.title = route.label;
  }
  route.summary = els.editDaySummary.value.trim() || route.summary;
  resequenceTripDayLabels(activeTrip());
  saveTrips();
  renderRouteDayButtons();
  renderTripManager();
  updateStats();
  renderRoute(false);
  setTripStatus(`Saved ${route.label}.`);
});

els.showRouteWaypoints?.addEventListener("change", renderRouteWaypoints);
function applyTripDayListMode(mode) {
  const nextMode = ["expand", "dropdown"].includes(mode) ? mode : "scroll";
  els.tripDayList?.classList.toggle("is-scrollable", nextMode === "scroll");
  if (els.tripDayList) els.tripDayList.hidden = nextMode === "dropdown";
  if (els.tripRouteDropdown) els.tripRouteDropdown.hidden = nextMode !== "dropdown";
  if (els.tripDayListMode) els.tripDayListMode.value = nextMode;
  rvStorageSet(TRIP_DAY_LIST_MODE_KEY, nextMode);
}

function applyTripStopListMode(mode) {
  const nextMode = ["expand", "dropdown"].includes(mode) ? mode : "scroll";
  els.tripStopList?.classList.toggle("is-scrollable", nextMode === "scroll");
  if (els.tripStopList) els.tripStopList.hidden = nextMode === "dropdown";
  if (els.tripStopDropdown) els.tripStopDropdown.hidden = nextMode !== "dropdown";
  if (els.tripStopListMode) els.tripStopListMode.value = nextMode;
  rvStorageSet(TRIP_STOP_LIST_MODE_KEY, nextMode);
}

let initialTripDayListMode = rvStorageGet(TRIP_DAY_LIST_MODE_KEY, "scroll");
applyTripDayListMode(initialTripDayListMode);
els.tripDayListMode?.addEventListener("change", event => applyTripDayListMode(event.target.value));
let initialTripStopListMode = rvStorageGet(TRIP_STOP_LIST_MODE_KEY, "scroll");
applyTripStopListMode(initialTripStopListMode);
els.tripStopListMode?.addEventListener("change", event => applyTripStopListMode(event.target.value));
els.tripRouteDropdown?.addEventListener("change", event => {
  const index = Number(event.target.value);
  if (!Number.isInteger(index) || !state.routes[index]) return;
  if (els.tripMediaTarget) els.tripMediaTarget.value = "route";
  selectedStopIndex = Math.min(index + 1, synchronizeTripStops(activeTrip()).length - 1);
  setActiveRoute(index);
});
els.tripStopDropdown?.addEventListener("change", event => {
  const [tripValue, stopValue] = String(event.target.value).split(":");
  const tripIndex = Number(tripValue);
  const index = Number(stopValue);
  if (Number.isInteger(tripIndex) && Number.isInteger(index)) {
    if (els.tripMediaTarget) els.tripMediaTarget.value = "stop-day";
    if (tripIndex !== state.activeTripIndex) selectTrip(tripIndex, { stopIndex: index });
    else focusJourneyStop(index);
    selectedTripMediaId = null;
    renderTripMedia();
  }
});
els.showEndpointGps?.addEventListener("change", updateStats);

els.editDayRoute.addEventListener("click", () => {
  const route = activeRoute();
  if (!route?.isRestDay && (!route?.startAddress || !route?.endAddress)) {
    setTripStatus("This route has no editable address endpoints. Add or recreate it from addresses first.", true);
    return;
  }
  dayRouteEditorOpen = !dayRouteEditorOpen;
  renderDayRouteEditor(route);
  if (dayRouteEditorOpen) {
    els.editDayEndAddress.focus();
  }
});

els.editDayIndependentStart.addEventListener("change", () => {
  renderDayRouteEditor(activeRoute());
  if (!els.editDayStartAddress.disabled && !els.editDayRestDay.checked) {
    els.editDayStartAddress.focus();
  } else if (els.editDayRestDay.checked && !els.editDayEndAddress.disabled) {
    els.editDayEndAddress.focus();
  }
  window.RVAccessibility?.refreshKeyboardOnlyTabStops();
});

els.editDayRestDay.addEventListener("change", () => {
  renderDayRouteEditor(activeRoute());
  clearRequiredState(els.editDayStartAddress);
  clearRequiredState(els.editDayEndAddress);
  if (els.editDayRestDay.checked && !els.editDayEndAddress.disabled) {
    els.editDayEndAddress.focus();
  }
});

function previewSelectedDaySequence() {
  const route = activeRoute();
  const trip = activeTrip();
  if (!route || !trip) return;
  const originalNumber = route.sequenceNumber;
  const originalDate = route.sequenceDate;
  const originalAutoStates = trip.days.map(day => ({ route: day, autoLabel: day.autoLabel, label: day.label, title: day.title }));
  route.sequenceNumber = sequenceNumberFromInput(els.editDaySequenceNumber.value);
  route.sequenceDate = els.editDaySequenceDate.value || "";
  enableAutoLabelsFrom(trip, state.activeRouteIndex);
  resequenceTripDayLabels(trip);
  els.editDayLabel.value = formatDaySequenceName(trip, state.activeRouteIndex);
  renderRouteDayButtons();
  renderTripDayList();
  originalAutoStates.forEach(item => {
    item.route.autoLabel = item.autoLabel;
    item.route.label = item.label;
    item.route.title = item.title;
  });
  route.sequenceNumber = originalNumber;
  route.sequenceDate = originalDate;
}

[els.editDaySequenceNumber, els.editDaySequenceDate].forEach(input => {
  input.addEventListener("input", previewSelectedDaySequence);
  input.addEventListener("change", previewSelectedDaySequence);
});

els.editDaySequenceNumber.addEventListener("keydown", event => {
  if (event.key !== "ArrowDown") return;
  const current = sequenceNumberFromInput(els.editDaySequenceNumber.value);
  if (current === null || current <= 1) {
    event.preventDefault();
    els.editDaySequenceNumber.value = "Auto";
    previewSelectedDaySequence();
  }
});

els.cancelDayRouteEdit.addEventListener("click", () => {
  dayRouteEditorOpen = false;
  renderDayRouteEditor(activeRoute());
  setTripStatus("Route changes canceled.");
});

els.applyDayRouteEdit.addEventListener("click", updateSelectedDayRoute);

[els.editDayStartAddress, els.editDayEndAddress].forEach(input => {
  input.dataset.defaultPlaceholder = input.placeholder;
  input.addEventListener("input", () => {
    if (input.value.trim()) clearRequiredState(input);
  });
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    updateSelectedDayRoute();
  });
});

els.deleteDay.addEventListener("click", () => {
  const trip = activeTrip();
  const route = activeRoute();
  if (!trip || !route) return;
  route.media?.forEach(item => item.url && URL.revokeObjectURL(item.url));
  dayRouteEditorOpen = false;
  trip.days.splice(state.activeRouteIndex, 1);
  synchronizeTripStops(trip);
  resequenceTripDayLabels(trip);
  state.routes = trip.days;
  state.activeRouteIndex = clamp(state.activeRouteIndex, 0, Math.max(0, trip.days.length - 1));
  saveTrips();
  renderTripManager();
  if (trip.days.length) {
    setActiveRoute(state.activeRouteIndex);
  } else {
    showEmptyTrip();
  }
  setTripStatus(`Deleted ${route.label}.`);
});

// Legacy media-management controls are optional while their data remains
// readable for migrated sticker events.
if (els.tripMediaInput) {
els.tripMediaInput?.addEventListener("change", async event => {
  const route = activeRoute();
  const owner = activeTripMediaOwner();
  if (!owner) return;
  owner.media ||= [];
  for (const file of [...(event.target.files || [])]) {
    let localFile;
    try { localFile = await rvMediaStoreFile(file); }
    catch (error) { setTripStatus(error.message || "This device could not save the media file.", true); continue; }
    const item = normalizeTripMedia({
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      kind: mediaKindFromType(file.type),
      type: file.type,
      url: localFile.url,
      assetId: localFile.assetId
    });
    const point = owner === route ? mediaDefaultPoint(route, owner.media.length) : null;
    if (point) placeMediaNearRoute(item, route, point.lat, point.lon);
    else ensureStopMediaLocation(item, owner, owner.media.length);
    owner.media.push(item);
    selectedTripMediaId = item.id;
  }
  event.target.value = "";
  applyAutomaticMediaOrder(route);
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
  setTripStatus("Attached media to " + (owner === route ? route.label : owner.name) + ".");
});

els.addTripYouTube?.addEventListener("click", async () => {
  const route = activeRoute();
  const owner = activeTripMediaOwner();
  if (!owner) return;
  owner.media ||= [];
  const enteredUrl = els.tripYouTubeUrl?.value;
  const url = youtubeEmbedUrl(enteredUrl);
  if (!url) {
    els.tripYouTubeUrl?.classList.add("is-required-missing");
    setTripStatus("Enter a valid YouTube watch, share, Shorts, live, or embed link.", true);
    return;
  }
  els.tripYouTubeUrl.classList.remove("is-required-missing");
  els.addTripYouTube.disabled = true;
  const metadata = await youtubeMetadata(enteredUrl);
  const item = normalizeTripMedia({
    name: metadata.title,
    kind: "youtube",
    type: "text/youtube",
    url,
    thumbnailUrl: metadata.thumbnailUrl
  });
  const point = owner === route ? mediaDefaultPoint(route, owner.media.length) : null;
  if (point) placeMediaNearRoute(item, route, point.lat, point.lon);
  else ensureStopMediaLocation(item, owner, owner.media.length);
  owner.media.push(item);
  selectedTripMediaId = item.id;
  els.tripYouTubeUrl.value = "";
  applyAutomaticMediaOrder(owner, route);
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
  renderStickers();
  previewTripMedia(item);
  setTripStatus(`Added ${item.name}.`);
});

els.addTripBlog?.addEventListener("click", () => {
  const route = activeRoute();
  const owner = activeTripMediaOwner();
  if (!owner) return;
  owner.media ||= [];
  if (!validateRequiredInputs([els.tripBlogTitle, els.tripBlogText])) {
    setTripStatus("Complete the blog title and text.", true);
    return;
  }
  const sourceDraftKey = currentBlogDraftKey();
  const item = normalizeTripMedia({
    name: els.tripBlogTitle.value.trim(),
    kind: "blog",
    type: "text/plain",
    text: els.tripBlogText.value.trim()
  });
  const point = owner === route ? mediaDefaultPoint(route, owner.media.length) : null;
  if (point) placeMediaNearRoute(item, route, point.lat, point.lon);
  else ensureStopMediaLocation(item, owner, owner.media.length);
  owner.media.push(item);
  selectedTripMediaId = item.id;
  if (sourceDraftKey === NEW_BLOG_DRAFT_KEY) {
    blogDrafts.delete(NEW_BLOG_DRAFT_KEY);
  }
  [els.tripBlogTitle, els.tripBlogText].forEach(clearRequiredState);
  applyAutomaticMediaOrder(owner, route);
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
  setTripStatus(`Added ${item.name}.`);
});

els.updateTripBlog?.addEventListener("click", () => {
  const item = selectedTripMedia();
  if (!item || item.kind !== "blog") return;
  if (!validateRequiredInputs([els.tripBlogTitle, els.tripBlogText])) {
    setTripStatus("Complete the blog title and text.", true);
    return;
  }
  item.name = els.tripBlogTitle.value.trim();
  item.text = els.tripBlogText.value.trim();
  blogDrafts.delete(item.id);
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
  previewTripMedia(item);
  els.addTripYouTube.disabled = false;
  setTripStatus(`Updated ${item.name}.`);
});

[els.tripBlogTitle, els.tripBlogText].forEach(input => {
  input.addEventListener("input", () => {
    if (input.value.trim()) clearRequiredState(input);
    saveBlogEditorDraft();
    updateBlogEditorState();
  });
});

function updateSelectedMediaPinAppearance() {
  const item = selectedTripMedia();
  if (!item) return;
  item.pinType = els.tripMediaPinType.value;
  item.pinColor = els.tripMediaPinColor.value;
  item.pinStyle = els.tripMediaPinStyle.value;
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
}

[els.tripMediaPinType, els.tripMediaPinColor, els.tripMediaPinStyle]
  .forEach(input => input.addEventListener("change", updateSelectedMediaPinAppearance));

els.tripMediaThumbnailUpload?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  const item = selectedTripMedia();
  if (!file || !item) return;
  try {
    const thumbnail = await optimizeMediaThumbnailUpload(file);
    item.customThumbnailUrl = thumbnail.url;
    item.customThumbnailName = thumbnail.name;
    item.pinType = "preview";
    saveTrips();
    renderTripMedia();
    renderMediaMarkers();
    setTripStatus(`Custom thumbnail applied to ${item.name}.`);
  } catch (error) {
    setTripStatus(error.message || "The custom thumbnail could not be applied.", true);
  } finally {
    event.target.value = "";
  }
});

els.tripMediaThumbnailReset?.addEventListener("click", () => {
  const item = selectedTripMedia();
  if (!item) return;
  item.customThumbnailUrl = "";
  item.customThumbnailName = "";
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
  setTripStatus(`Automatic thumbnail restored for ${item.name}.`);
});

function snapSelectedMedia(endpoint) {
  const route = activeRoute();
  const owner = activeTripMediaOwner();
  const item = selectedTripMedia();
  if (!route || !item || owner !== route) {
    setTripStatus("Stop media can be placed around its stop; endpoint snapping applies only to route media.", true);
    return;
  }
  rememberRouteAddresses(route, item.address);
  snapMediaToRouteEndpoint(item, route, endpoint);
  applyAutomaticMediaOrder(owner, route);
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
  setTripStatus(endpoint === "start"
    ? `${item.name} will open when ${route.label} is selected.`
    : `${item.name} is pinned to the end of ${route.label}.`);
}

els.snapTripMediaStart?.addEventListener("click", () => snapSelectedMedia("start"));
els.snapTripMediaEnd?.addEventListener("click", () => snapSelectedMedia("end"));

els.tripMediaSavedAddress?.addEventListener("change", () => {
  if (!els.tripMediaSavedAddress.value) return;
  els.tripMediaAddress.value = els.tripMediaSavedAddress.value;
  clearRequiredState(els.tripMediaAddress);
});

els.placeTripMediaAddress?.addEventListener("click", async () => {
  const route = activeRoute();
  const owner = activeTripMediaOwner();
  const item = selectedTripMedia();
  if (!owner || !item) return;
  if (!validateRequiredInputs([els.tripMediaAddress])) {
    setTripStatus("Enter an address for the selected media.", true);
    return;
  }
  els.placeTripMediaAddress.disabled = true;
  els.tripMediaLocationStatus.textContent = "Finding location...";
  try {
    const enteredAddress = els.tripMediaAddress.value.trim();
    const location = await geocodeAddress(enteredAddress);
    rememberRouteAddresses(route, enteredAddress, location.label);
    placeMediaForOwner(item, owner, route, location.lat, location.lon, enteredAddress);
    applyAutomaticMediaOrder(owner, route);
    saveTrips();
    renderTripMedia();
    renderMediaMarkers();
    setTripStatus(`Placed ${item.name} near ${location.label}.`);
  } catch (error) {
    els.tripMediaLocationStatus.textContent = error.message || "The pin could not be placed.";
    setTripStatus(els.tripMediaLocationStatus.textContent, true);
  } finally {
    els.placeTripMediaAddress.disabled = false;
  }
});

els.placeTripMediaMap?.addEventListener("click", () => {
  const item = selectedTripMedia();
  if (!item) return;
  pendingMediaPinId = item.id;
  els.mapCanvas.classList.add("is-placing-media-pin");
  els.tripMediaLocationStatus.textContent = "Click near the desired location on the map.";
  setTripStatus(`Click the map to place ${item.name}.`);
});

map.on("click", event => {
  if (!pendingMediaPinId) return;
  const record = findTripMediaRecord(pendingMediaPinId);
  const route = record?.route || activeRoute();
  const owner = record?.owner;
  const item = record?.item;
  pendingMediaPinId = null;
  els.mapCanvas.classList.remove("is-placing-media-pin");
  if (!owner || !item) return;
  rememberRouteAddresses(route, item.address);
  placeMediaForOwner(item, owner, route, event.latlng.lat, event.latlng.lng);
  applyAutomaticMediaOrder(owner, route);
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
  setTripStatus(`Placed ${item.name} on the map.`);
});

els.manualMediaOrder?.addEventListener("change", () => {
  const route = activeRoute();
  const owner = activeTripMediaOwner();
  if (!owner) return;
  owner.mediaManualOrder = els.manualMediaOrder.checked;
  applyAutomaticMediaOrder(owner, route);
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
  setTripStatus(owner.mediaManualOrder
    ? "Manual media ordering enabled. Drag the handles to rearrange items."
    : "Media ordered automatically from the start to the end of the route.");
});

}

els.zoomIn.addEventListener("click", () => map.zoomIn());
els.zoomOut.addEventListener("click", () => {
  if (state.overviewMode && state.overviewFocusIndex !== null) {
    restoreOverviewHome();
    return;
  }
  map.zoomOut();
});
els.panLeft?.addEventListener("click", () => map.panBy([-Math.round(map.getSize().x * 0.28), 0]));
els.panRight?.addEventListener("click", () => map.panBy([Math.round(map.getSize().x * 0.28), 0]));

function updateMapControlHelp() {
  [els.zoomIn, els.zoomOut].forEach(button => {
    button?.setAttribute("data-help", `Right click to ${els.allowZoom.checked ? "turn zoom off" : "turn zoom on"}.`);
    button?.classList.toggle("is-lock-enabled", els.allowZoom.checked);
  });
  [els.panLeft, els.panRight].forEach(button => {
    button?.setAttribute("data-help", `Right click to ${els.allowPan.checked ? "turn pan off" : "turn pan on"}.`);
    button?.classList.toggle("is-lock-enabled", els.allowPan.checked);
  });
}

function toggleMapLock(input) {
  if (!input) return;
  input.checked = !input.checked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  updateMapControlHelp();
}

[els.zoomIn, els.zoomOut].forEach(button => {
  button?.addEventListener("contextmenu", event => {
    event.preventDefault();
    toggleMapLock(els.allowZoom);
  });
});

[els.panLeft, els.panRight].forEach(button => {
  button?.addEventListener("contextmenu", event => {
    event.preventDefault();
    toggleMapLock(els.allowPan);
  });
});

els.previousDay?.setAttribute("data-help", "Animate the previous route leg.");
els.nextDay?.setAttribute("data-help", "Animate the next route leg.");
function updateUsViewButton() {
  if (!els.usView) return;
  const isEntireJourney = state.overviewMode && !state.contiguousUsMode && state.overviewFocusIndex === null;
  const label = isEntireJourney ? "View US" : "View entire journey";
  els.usView.dataset.viewMode = isEntireJourney ? "us" : "journey";
  els.usView.querySelector("span").textContent = label;
  els.usView.title = label;
  els.usView.setAttribute("aria-label", label);
  updateExplicitNavigationControls();
}

function enterUsOverview({ initial = false } = {}) {
  if (!state.trips.some(trip => trip.days?.length)) return;
  if (typeof sfxPlayEvent === "function" && !initial) sfxPlayEvent("view.us");
  clearOverviewHoverTimer();
  closeJourneyMedia();
  stopPlayback();
  // At country scale, motorway/trunk roads are the useful reference layer.
  // Keep them available even if local street detail was hidden in a close-up.
  if (els.toggleHighways && !els.toggleHighways.checked) {
    els.toggleHighways.checked = true;
    applyToggleState(getToggleState());
  }
  anchorWholeJourneyNavigation();
  state.overviewMode = true;
  state.contiguousUsMode = true;
  state.overviewHomeView = null;
  state.overviewFocusIndex = null;
  state.overviewFocusZoom = null;
  state.overviewHover.activeIndex = null;
  state.overviewHover.lockedIndex = null;
  clearOverviewReachedRoute();
  renderRouteDayButtons();
  // Refresh the controls after anchoring the whole-map state; otherwise they
  // can display the leg selected before entering US view.
  renderTripManager();
  renderRoute(false);
  renderCityLabels();
  els.status.textContent = "Showing all journeys";
  const onComplete = () => {
    applyMapInteractionLocks();
    applyToggleState(getToggleState());
    updateUsViewButton();
    if (initial) finishInitialRouteLoading();
  };
  moveToSelectionCamera({ scope: "us", loadingLocationName: "", onComplete });
  updateUsViewButton();
}

els.usView.addEventListener("click", () => {
  const isEntireJourney = state.overviewMode && !state.contiguousUsMode && state.overviewFocusIndex === null;
  if (isEntireJourney) enterUsOverview();
  else setOverviewMode({ animate: true, loadingLocationName: "" });
});

const mapHierarchyForwardStack = [];

function currentMapHierarchyRecord() {
  return {
    mode: currentStickerViewKey(),
    tripIndex: state.activeTripIndex,
    routeIndex: state.activeRouteIndex,
    stopIndex: selectedStopIndex
  };
}

function restoreMapHierarchyRecord(record) {
  if (!record) return;
  if (record.mode === "us") {
    enterUsOverview();
    return;
  }
  if (record.tripIndex !== state.activeTripIndex) selectTrip(record.tripIndex, { overview: true, animate: false });
  if (record.mode === "journey") {
    setOverviewMode({ animate: true, loadingLocationName: "" });
  } else if (record.mode === "route") {
    state.overviewMode = true;
    state.contiguousUsMode = false;
    zoomToOverviewZone(clamp(record.routeIndex, 0, Math.max(0, state.routes.length - 1)));
  } else {
    focusJourneyStop(record.stopIndex, { animate: true });
  }
}

function navigateMapHierarchyOut() {
  const current = currentMapHierarchyRecord();
  if (current.mode === "us") return false;
  mapHierarchyForwardStack.push(current);
  if (current.mode === "stop") {
    state.overviewMode = true;
    state.contiguousUsMode = false;
    zoomToOverviewZone(state.activeRouteIndex);
  } else if (current.mode === "route") {
    setOverviewMode({ animate: true, loadingLocationName: "" });
  } else {
    enterUsOverview();
  }
  return true;
}

function navigateMapHierarchyIn() {
  const record = mapHierarchyForwardStack.pop();
  if (!record) return false;
  restoreMapHierarchyRecord(record);
  return true;
}

function guardBrowserHistoryForMap() {
  if (!history.state?.rvMapGuard) history.replaceState({ ...(history.state || {}), rvMapGuard: true }, "", location.href);
  history.pushState({ rvMapGuard: true, rvMapSentinel: true }, "", location.href);
}

guardBrowserHistoryForMap();
window.addEventListener("popstate", () => {
  navigateMapHierarchyOut();
  history.pushState({ rvMapGuard: true, rvMapSentinel: true }, "", location.href);
});
window.addEventListener("auxclick", event => {
  if (event.button !== 3 && event.button !== 4) return;
  event.preventDefault();
  if (event.button === 3) navigateMapHierarchyOut();
  else navigateMapHierarchyIn();
}, true);
updateUsViewButton();
els.reset.addEventListener("click", () => {
  if (restoreSavedCurrentView()) return;
  if (state.overviewMode && state.overviewFocusIndex !== null) {
    restoreOverviewHome();
    return;
  }
  const loadingLocationName = state.overviewMode
    ? ""
    : endpointJumpLocation(activeRoute(), "end");
  fitCurrentSelection({
    loadingLocationName,
    onComplete: () => {
      captureOverviewHomeView();
      applyMapInteractionLocks();
      applyToggleState(getToggleState());
    }
  });
});

function updateExplicitNavigationControls() {
  const routeCount = state.routes.length;
  const stopCount = synchronizeTripStops(activeTrip()).length;
  const atJourneyStart = state.activeTripIndex <= 0;
  const atJourneyEnd = state.activeTripIndex >= state.trips.length - 1;
  const atRouteStart = state.activeRouteIndex <= 0;
  const atRouteEnd = state.activeRouteIndex >= routeCount - 1;
  const atStopStart = selectedStopIndex <= 0;
  const atStopEnd = selectedStopIndex >= stopCount - 1;
  if (els.previousJourney) els.previousJourney.disabled = atJourneyStart;
  if (els.nextJourney) els.nextJourney.disabled = atJourneyEnd;
  if (els.previousRoute) els.previousRoute.disabled = atRouteStart || !routeCount;
  if (els.nextRoute) els.nextRoute.disabled = atRouteEnd || !routeCount;
  if (els.previousStoryDay) els.previousStoryDay.disabled = atRouteStart || !routeCount;
  if (els.nextStoryDay) els.nextStoryDay.disabled = atRouteEnd || !routeCount;
  if (els.previousStop) els.previousStop.disabled = atStopStart || !stopCount;
  if (els.nextStop) els.nextStop.disabled = atStopEnd || !stopCount;
  const showStoryDock = appState.siteMode === "user" || (isEditorSite?.() && activePanelTabId?.() === "users");
  if (els.userStoryDock) els.userStoryDock.hidden = !showStoryDock;
  const storyAction = userStoryNextAction();
  if (els.storyPrevious) els.storyPrevious.disabled = !userStoryProgress.started || (state.activeTripIndex === 0 && atStopStart);
  if (els.storyNext) els.storyNext.textContent = storyAction.label;
  if (els.storyNext) els.storyNext.title = storyAction.title;
}

function saveUserStoryProgress() {
  userStoryProgress = {
    ...userStoryProgress,
    tripIndex: state.activeTripIndex,
    stopIndex: selectedStopIndex,
    routeIndex: state.activeRouteIndex
  };
  rvStorageWriteJson(USER_STORY_PROGRESS_KEY, userStoryProgress);
}

function userStoryStartMedia() {
  return activeRoute()?.media?.find(item => item.routeAnchor === "start") || null;
}

function userStoryNextAction() {
  if (!userStoryProgress.started) return { label: "Begin\ntrip", title: "Begin at the first stop" };
  const stops = synchronizeTripStops(activeTrip());
  if (!stops.length) return { label: "No\nstops", title: "This trip has no stops" };
  if (!userStoryProgress.startMediaSeen && userStoryStartMedia()) return { label: "Watch\nvideo", title: "Watch this stop's video" };
  if (!els.mediaViewer?.hidden) return { label: "Continue", title: "Continue along the route" };
  if (selectedStopIndex >= stops.length - 1) {
    return state.activeTripIndex < state.trips.length - 1
      ? { label: "Next\ntrip", title: "Begin the next trip" }
      : { label: "Trip\ncomplete", title: "You have reached the end" };
  }
  const nextStop = stops[selectedStopIndex + 1];
  return { label: `Proceed to\n${nextStop?.name || "next stop"}`, title: `Travel to ${nextStop?.name || "the next stop"}` };
}

function beginUserStory() {
  userStoryProgress = { started: true, startMediaSeen: false };
  selectTrip(0, { stopIndex: 0, overview: false, animate: true });
  saveUserStoryProgress();
  updateExplicitNavigationControls();
}

function restoreUserStoryProgress() {
  const saved = rvStorageReadJson(USER_STORY_PROGRESS_KEY, null);
  if (!saved?.started || !state.trips.length) {
    userStoryProgress = { started: false, startMediaSeen: false };
    enterUsOverview();
    updateExplicitNavigationControls();
    return;
  }
  const tripIndex = clamp(Number(saved.tripIndex) || 0, 0, state.trips.length - 1);
  userStoryProgress = { ...saved, started: true };
  selectTrip(tripIndex, { stopIndex: Number(saved.stopIndex) || 0, overview: false, animate: false });
  updateExplicitNavigationControls();
}

function advanceUserStory() {
  if (!userStoryProgress.started) return beginUserStory();
  const startMedia = userStoryStartMedia();
  if (!userStoryProgress.startMediaSeen && startMedia) {
    userStoryProgress.startMediaSeen = true;
    openJourneyMedia(startMedia);
    saveUserStoryProgress();
    updateExplicitNavigationControls();
    return;
  }
  const stops = synchronizeTripStops(activeTrip());
  if (selectedStopIndex >= stops.length - 1) {
    if (state.activeTripIndex < state.trips.length - 1) {
      userStoryProgress = { started: true, startMediaSeen: false };
      selectTrip(state.activeTripIndex + 1, { stopIndex: 0, overview: false, animate: true });
      saveUserStoryProgress();
      updateExplicitNavigationControls();
    }
    return;
  }
  requestJourneyStep(1);
  saveUserStoryProgress();
  updateExplicitNavigationControls();
}

function navigateJourney(delta) {
  const target = clamp(state.activeTripIndex + delta, 0, Math.max(0, state.trips.length - 1));
  if (target === state.activeTripIndex) return;
  selectTrip(target, { overview: true, animate: true });
  updateExplicitNavigationControls();
}

function navigateRouteOverview(delta) {
  const target = clamp(state.activeRouteIndex + delta, 0, Math.max(0, state.routes.length - 1));
  if (target === state.activeRouteIndex && state.overviewMode && state.overviewFocusIndex === target) return;
  state.overviewMode = true;
  state.contiguousUsMode = false;
  state.overviewFocusIndex = null;
  state.overviewFocusZoom = null;
  state.overviewHomeView = null;
  zoomToOverviewZone(target);
  updateExplicitNavigationControls();
}

function navigateStop(delta) {
  const stops = synchronizeTripStops(activeTrip());
  const target = clamp(selectedStopIndex + delta, 0, Math.max(0, stops.length - 1));
  if (target === selectedStopIndex) return;
  // Previous/Next select a stop; they must not inherit a partially drawn
  // playback leg. Cancel the old transaction before the new route is chosen.
  stopPlayback();
  state.playback.progress = 0;
  state.playback.hasStarted = false;
  focusJourneyStop(target, { animate: true });
  updateExplicitNavigationControls();
}

function animateAdjacentStop(direction) {
  requestJourneyStep(direction);
}

function navigateStoryDay(delta) {
  const target = clamp(state.activeRouteIndex + delta, 0, Math.max(0, state.routes.length - 1));
  if (target === state.activeRouteIndex) return;
  moveToDay(target);
  updateExplicitNavigationControls();
}

els.playRoute.addEventListener("click", () => {
  navigatePrimaryPlayback(1);
});

els.playTripAnimation?.addEventListener("click", () => {
  startTripAnimation();
});

els.reverseRoute.addEventListener("click", () => {
  navigatePrimaryPlayback(-1);
});

els.previousJourney?.addEventListener("click", () => navigateJourney(-1));
els.nextJourney?.addEventListener("click", () => navigateJourney(1));
els.previousRoute?.addEventListener("click", () => navigateRouteOverview(-1));
els.nextRoute?.addEventListener("click", () => navigateRouteOverview(1));
els.previousStop?.addEventListener("click", () => navigateStop(-1));
els.nextStop?.addEventListener("click", () => navigateStop(1));
els.previousStoryDay?.addEventListener("click", () => navigateStoryDay(-1));
els.nextStoryDay?.addEventListener("click", () => navigateStoryDay(1));

function navigatePrimaryPlayback(delta) {
  const navigation = primaryPlaybackNavigation?.(delta);
  if (!navigation || navigation.disabled) return;
  if (navigation.scope === "journey") navigateJourney(delta);
  else if (navigation.scope === "route") navigateRouteOverview(delta);
  else navigateStop(delta);
}

function initializePinnedTripTier() {
  const renameInput = els.tripTierRenameInput;
  const renameButton = els.tripTierEditName;
  const tripSelect = els.topTripSelect;
  if (!tripSelect || tripSelect.dataset.pinnedTripTierInitialized === "true") return;
  tripSelect.dataset.pinnedTripTierInitialized = "true";
  renderTripGroupSelect();
  tripSelect.addEventListener("change", () => selectTripGroup(Number(tripSelect.value)));
  const commit = () => {
    const name = renameInput?.value.trim();
    if (name) {
      renameTripGroup(name);
    }
    if (renameInput) renameInput.hidden = true;
    if (renameButton) renameButton.textContent = "Edit name";
  };
  renameButton?.addEventListener("click", event => {
    event.stopPropagation();
    if (!renameInput) return;
    if (!renameInput.hidden) { commit(); return; }
    renameInput.value = tripSelect.selectedOptions[0]?.textContent || "Trip 1";
    renameInput.hidden = false;
    renameButton.textContent = "Done";
    renameInput.focus();
    renameInput.select();
  });
  renameInput?.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); commit(); }
    if (event.key === "Escape") { renameInput.hidden = true; renameButton.textContent = "Edit name"; }
  });
}

initializePinnedTripTier();

els.previousDay.addEventListener("click", () => {
  if (typeof sfxPlayEvent === "function") sfxPlayEvent("stop.previous");
  animateAdjacentStop(-1);
});

els.tripMediaTarget?.addEventListener("change", () => {
  selectedTripMediaId = null;
  renderTripMedia();
  renderMediaMarkers();
});

els.tripMediaNumberingStyle?.addEventListener("change", () => {
  const owner = activeTripMediaOwner();
  if (!owner) return;
  owner.mediaNumberingStyle = els.tripMediaNumberingStyle.value;
  saveTrips();
  renderTripMedia();
  renderMediaMarkers();
});

els.nextDay.addEventListener("click", () => {
  if (typeof sfxPlayEvent === "function") sfxPlayEvent("stop.next");
  animateAdjacentStop(1);
});

els.siteModeToggle?.addEventListener("click", () => {
  // User preview is an in-place view of the current editor state. Do not
  // replay loading or consent UI, and do not reset the active map position.
  applySiteMode(appState.siteMode === "user" ? "edit" : "user");
});

els.userJumpToStart?.addEventListener("click", () => {
  beginUserStory();
});

function advanceWelcomeGateAfterConsent() {
  welcomeGateConsentChosen = true;
  els.welcomeGateConsent?.querySelector("span")?.replaceChildren("Loading choices are ready.");
  if (els.welcomeGateDecline) els.welcomeGateDecline.textContent = "Skip loading";
  if (els.welcomeGateAllow) els.welcomeGateAllow.textContent = "Proceed";
  refreshWelcomeGateState();
}

els.welcomeGateAllow?.addEventListener("click", () => {
  if (welcomeGateConsentChosen) {
    if (refreshWelcomeGateState()) dismissWelcomeGate();
    return;
  }
  if (typeof sfxGrantAudioPermission === "function") sfxGrantAudioPermission();
  else if (typeof sfxAudioAllowed !== "undefined") sfxAudioAllowed = true;
  els.welcomeGateDetail.textContent = "Sound and video enabled for this session.";
  advanceWelcomeGateAfterConsent();
});
els.welcomeGateDecline?.addEventListener("click", () => {
  if (welcomeGateConsentChosen) {
    dismissWelcomeGate();
    return;
  }
  els.welcomeGateDetail.textContent = "Sound and video remain off for this session.";
  advanceWelcomeGateAfterConsent();
});

window.setInterval(rotateWelcomeGateImage, 5000);

els.storyNext?.addEventListener("click", () => {
  advanceUserStory();
});

els.storyPrevious?.addEventListener("click", () => {
  if (!state.contiguousUsMode && !state.overviewMode) requestJourneyStep(-1);
  updateExplicitNavigationControls();
});
els.storyJourneyView?.addEventListener("click", () => setOverviewMode({ animate: true, loadingLocationName: "" }));
els.storyUsView?.addEventListener("click", () => enterUsOverview());
els.storyThemeSelect?.addEventListener("click", () => setUserThemePanelOpen(true));
els.randomThemeButton?.addEventListener("click", async () => {
  const choices = [
    ...MAPLIBRE_STYLES.map(style => ({ provider: style.id })),
    ...sortedRouteThemeEntries().map(({ id }) => ({ route: id }))
  ].filter(choice => choice.provider ? activeRouteThemeId !== `osm-${choice.provider}` : activeRouteThemeId !== choice.route);
  const choice = choices[Math.floor(Math.random() * choices.length)];
  if (!choice) return;
  if (choice.provider) await applyMapProviderTheme(choice.provider);
  else await selectCustomMapTheme(choice.route);
  refreshUserMaterialControls();
});

els.userThemeButton?.addEventListener("click", () => {
  setUserThemePanelOpen(els.userThemePanel?.hidden !== false);
});

els.userMaterialButton?.addEventListener("click", () => {
  setUserMaterialPanelOpen(els.userMaterialPanel?.hidden !== false);
});

els.userThemePanel?.addEventListener("click", async event => {
  const button = event.target.closest("button");
  if (!button || button.classList.contains("user-picker-close")) return;
  const providerTheme = button.dataset.userProviderTheme;
  const routeTheme = button.dataset.userRouteTheme;
  if (providerTheme) {
    await applyMapProviderTheme(providerTheme);
  } else if (routeTheme) {
    await selectCustomMapTheme(routeTheme);
  }
  renderUserThemePanel();
  refreshUserMaterialControls();
});

els.userMaterialPanel?.addEventListener("click", event => {
  const button = event.target.closest("[data-user-material-choice]");
  if (!button) return;
  setUserMaterial(button.dataset.userMaterialChoice);
  renderUserMaterialPanel();
  setUserMaterialPanelOpen(false);
});

document.addEventListener("click", event => {
  if (event.target.closest("#openRouteThemePicker, #userThemeButton, #userThemePanel, #userMaterialButton, #userMaterialPanel")) return;
  setUserThemePanelOpen(false);
  setUserMaterialPanelOpen(false);
});

els.toggleImagePreviewDrawer?.addEventListener("click", () => {
  toggleActiveSecondaryPanel?.();
});

els.closeMediaViewer.addEventListener("click", closeJourneyMedia);
els.mediaViewerViewport.addEventListener("click", () => {
  els.mediaViewer.classList.remove("is-fullscreen");
  if (document.fullscreenElement === els.mediaViewer) document.exitFullscreen?.();
});
els.mediaViewerFullscreen.addEventListener("click", () => {
  const kind = selectedTripMedia()?.kind || "video";
  const style = mediaPresentationStyleForKind(kind);
  if (style.fullscreenTarget === "browser" && els.mediaViewer.requestFullscreen) {
    els.mediaViewer.requestFullscreen().catch(() => els.mediaViewer.classList.add("is-fullscreen"));
  } else {
    els.mediaViewer.classList.add("is-fullscreen");
  }
});
els.mediaPlayPause.addEventListener("click", () => {
  if (!activeViewerMediaElement) return;
  if (activeViewerMediaElement.paused) {
    activeViewerMediaElement.play().catch(() => {});
  } else {
    activeViewerMediaElement.pause();
  }
});
els.mediaPlayhead.addEventListener("input", () => {
  if (!activeViewerMediaElement || !Number.isFinite(activeViewerMediaElement.duration)) return;
  activeViewerMediaElement.currentTime = Number(els.mediaPlayhead.value);
});
els.mediaMute.addEventListener("click", () => {
  if (!activeViewerMediaElement) return;
  activeViewerMediaElement.muted = !activeViewerMediaElement.muted;
});
els.mediaVolume.addEventListener("input", () => {
  if (!activeViewerMediaElement) return;
  activeViewerMediaElement.muted = false;
  activeViewerMediaElement.volume = Number(els.mediaVolume.value);
});

document.addEventListener("keydown", event => {
  const tagName = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName) && !els.mediaViewer.contains(event.target)) return;
  if (!els.mediaViewer.hidden && activeViewerMediaElement) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      activeViewerMediaElement.currentTime = clamp(
        activeViewerMediaElement.currentTime + direction * 5,
        0,
        Number.isFinite(activeViewerMediaElement.duration) ? activeViewerMediaElement.duration : Infinity
      );
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      activeViewerMediaElement.muted = false;
      activeViewerMediaElement.volume = clamp(activeViewerMediaElement.volume + direction * 0.05, 0, 1);
    } else if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      els.mediaPlayPause.click();
    } else if (event.key === "Escape") {
      closeJourneyMedia();
    }
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    requestJourneyStep(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    requestJourneyStep(-1);
  }
});

els.allowPan.addEventListener("change", () => {
  applyMapInteractionLocks();
  updateMapControlHelp();
});

els.allowZoom.addEventListener("change", () => {
  applyMapInteractionLocks();
  updateMapControlHelp();
});

[
  { input: els.allowPan, mode: "pan" },
  { input: els.allowZoom, mode: "zoom" }
].forEach(({ input, mode }) => {
  const label = input?.closest("label");
  if (!label) return;
  label.dataset.help = `Right click to ${mode}`;
  label.addEventListener("contextmenu", event => {
    event.preventDefault();
    input.checked = !input.checked;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
});

function updateTextureScaleModeLabel() {
  els.textureScaleModeLabel.textContent = textureScalesWithMap()
    ? "Texture size: Relative to map"
    : "Texture size: Fixed on screen";
}

els.textureScaleWithMap.addEventListener("change", () => {
  ensureThemeEditableRenderer();
  updateTextureScaleModeLabel();
  setTextureZoomCompensation();
  textureZoomStart = null;
  refreshStyledLayers();
});

const overviewDeadZoneControl = els.overviewDeadZone.closest(".range-control");
const sidePanel = document.querySelector(".panel");

function overviewBoxModeActive() {
  return state.overviewMode && state.overviewFocusIndex === null && tripZoneSettings(activeTrip()).displayType === "rectangle";
}

sidePanel?.addEventListener("mouseenter", () => {
  if (overviewBoxModeActive()) renderRoute(false);
});

sidePanel?.addEventListener("mouseleave", () => {
  if (overviewBoxModeActive()) renderRoute(false);
});

function refreshOverviewZonesAfterSettingChange(options = {}) {
  if (options.defer) {
    scheduleTripsSave();
  } else {
    saveTrips();
  }
  updateDayZoneModifyControls();
  clearOverviewHoverTimer();
  if (state.overviewMode) {
    if (options.defer) {
      scheduleRouteRender();
    } else {
      renderRoute(false);
      applyMapInteractionLocks();
    }
  }
}

els.overviewDeadZone.addEventListener("input", () => {
  clearOverviewHoverTimer();
  showOverviewDeadZonePreview = overviewDeadZoneControl?.matches(":hover") ?? true;
  if (state.overviewMode) {
    renderRoute(false);
    applyMapInteractionLocks();
  }
});

function hideOverviewDeadZonePreview() {
  if (!showOverviewDeadZonePreview) return;
  showOverviewDeadZonePreview = false;
  if (state.overviewMode) {
    renderRoute(false);
    applyMapInteractionLocks();
  }
}

els.overviewDeadZone.addEventListener("change", hideOverviewDeadZonePreview);
els.overviewDeadZone.addEventListener("blur", hideOverviewDeadZonePreview);
els.overviewDeadZone.addEventListener("pointercancel", hideOverviewDeadZonePreview);
overviewDeadZoneControl?.addEventListener("pointerleave", hideOverviewDeadZonePreview);
document.addEventListener("pointerup", () => {
  if (!overviewDeadZoneControl?.matches(":hover")) hideOverviewDeadZonePreview();
});

els.overviewZoneSize.addEventListener("input", () => {
  const trip = activeTrip();
  if (!trip) return;
  const size = clamp(Number(els.overviewZoneSize.value), Number(els.overviewZoneSize.min), Number(els.overviewZoneSize.max));
  trip.zoneSettings = normalizeZoneSettings({ ...tripZoneSettings(trip), size }, DEFAULT_ZONE_SETTINGS);
  trip.days.forEach(route => {
    route.zoneSettings = normalizeZoneSettings({ ...routeZoneSettings(route, trip), size }, trip.zoneSettings);
  });
  refreshOverviewZonesAfterSettingChange();
});

els.zoneDisplayType.addEventListener("change", () => {
  const trip = activeTrip();
  if (!trip) return;
  const displayType = els.zoneDisplayType.value;
  trip.zoneSettings = normalizeZoneSettings({ ...tripZoneSettings(trip), displayType }, DEFAULT_ZONE_SETTINGS);
  trip.days.forEach(route => {
    route.zoneSettings = normalizeZoneSettings({ ...routeZoneSettings(route, trip), displayType }, trip.zoneSettings);
  });
  refreshOverviewZonesAfterSettingChange();
});

els.routeZoneSize.addEventListener("input", () => {
  const trip = activeTrip();
  if (!trip) return;
  const routeSize = clamp(Number(els.routeZoneSize.value), Number(els.routeZoneSize.min), Number(els.routeZoneSize.max));
  trip.zoneSettings = normalizeZoneSettings({ ...tripZoneSettings(trip), routeSize }, DEFAULT_ZONE_SETTINGS);
  trip.days.forEach(route => {
    route.zoneSettings = normalizeZoneSettings({ ...routeZoneSettings(route, trip), routeSize }, trip.zoneSettings);
  });
  els.routeZoneSizeValue.textContent = String(Math.round(routeSize));
  refreshOverviewZonesAfterSettingChange({ defer: true });
});

els.routeZoneOffset.addEventListener("input", () => {
  const trip = activeTrip();
  if (!trip) return;
  const routeOffset = clamp(Number(els.routeZoneOffset.value), Number(els.routeZoneOffset.min), Number(els.routeZoneOffset.max));
  trip.zoneSettings = normalizeZoneSettings({ ...tripZoneSettings(trip), routeOffset }, DEFAULT_ZONE_SETTINGS);
  trip.days.forEach(route => {
    route.zoneSettings = normalizeZoneSettings({ ...routeZoneSettings(route, trip), routeOffset }, trip.zoneSettings);
  });
  els.routeZoneOffsetValue.textContent = String(Math.round(routeOffset));
  refreshOverviewZonesAfterSettingChange({ defer: true });
});

function setActiveRouteZoneSetting(key, value) {
  const modifyIndex = state.overviewZoneModifyIndex;
  const route = Number.isInteger(modifyIndex) ? state.routes[modifyIndex] : activeRoute();
  const trip = activeTrip();
  if (!route || !trip) return;
  route.zoneSettings = normalizeZoneSettings({ ...routeZoneSettings(route, trip), [key]: value }, tripZoneSettings(trip));
  refreshOverviewZonesAfterSettingChange();
}

els.dayZoneShape.addEventListener("change", () => {
  setActiveRouteZoneSetting("shape", els.dayZoneShape.value);
});

function markerSettingsTarget() {
  if (state.noJourneySelected) {
    state.projectDefaults = normalizeProjectDefaults(state.projectDefaults);
    return {
      owner: state.projectDefaults,
      settings: state.projectDefaults.marker,
      fallback: DEFAULT_MARKER_SETTINGS,
      isDay: false,
      isProjectDefault: true
    };
  }
  const trip = activeTrip();
  if (!trip) return null;
  return { owner: trip, settings: tripMarkerSettings(trip), fallback: DEFAULT_MARKER_SETTINGS, isDay: false };
}

function saveMarkerSettingsTarget(settings, options = {}) {
  const target = markerSettingsTarget();
  if (!target) {
    updateMapFeatureToolbar();
    return;
  }
  const defer = options.defer === true;
  const renderControls = options.renderControls !== false;
  if (target.isMarker) {
    target.owner.markerEndpoints ||= {};
    target.owner.markerEndpoints[target.anchor] = normalizeMarkerSettings(settings, target.fallback);
  } else {
    if (target.isProjectDefault) target.owner.marker = normalizeMarkerSettings(settings, target.fallback);
    else target.owner.markerSettings = normalizeMarkerSettings(settings, target.fallback);
  }
  if (!target.isMarker && !target.isProjectDefault && Array.isArray(target.owner.days)) {
    target.owner.days.forEach(route => {
      route.markerSettings = cloneMarkerSettings(target.owner.markerSettings);
    });
  }
  if (defer) {
    scheduleTripsSave();
    scheduleRouteRender();
  } else {
    saveTrips();
    renderRoute(false);
  }
  if (renderControls) renderMarkerControls();
}

function renderMarkerControls() {
  const target = markerSettingsTarget();
  const hasTarget = Boolean(target);
  [els.markerShape, els.markerSize, els.markerFillEnabled, els.markerFillColor, els.addMarkerStroke, els.markerOverrideSize, els.markerImageUpload, els.markerImageRecent, els.markerImageDisplay, els.markerImageSize, els.markerShapeSize, els.addMarkerImageStroke]
    .filter(Boolean)
    .forEach(input => { input.disabled = !hasTarget; });
  els.markerStrokeList.replaceChildren();
  els.markerImageStrokeList?.replaceChildren();
  els.markerPreview?.replaceChildren();
  if (!target) return;

  const settings = target.settings;
  renderMarkerPreview(settings);
  els.markerShape.value = settings.shape;
  els.markerSize.value = String(markerSizeToSlider(settings.size));
  els.markerSizeValue.textContent = formatMarkerSizeValue(settings.size);
  if (els.markerOverrideSize) els.markerOverrideSize.value = String(markerSizeToSlider(settings.size));
  if (els.markerOverrideSizeValue) els.markerOverrideSizeValue.textContent = formatMarkerSizeValue(settings.size);
  renderTownMarkerImageRecentOptions();
  if (els.markerImageRecent) els.markerImageRecent.value = settings.imageUrl || "";
  if (els.markerImageDisplay) els.markerImageDisplay.value = settings.imageDisplay;
  const markerImageSlider = internalSizeToSlider(settings.imageSize, ROUTE_ANIMATION_IMAGE_SIZE_MAX);
  const markerShapeSlider = internalSizeToSlider(settings.shapeSize, ROUTE_ANIMATION_SHAPE_SIZE_MAX);
  if (els.markerImageSize) els.markerImageSize.value = String(markerImageSlider);
  if (els.markerImageSizeValue) els.markerImageSizeValue.textContent = markerImageSlider === 0 ? "Off" : String(markerImageSlider);
  if (els.markerShapeSize) els.markerShapeSize.value = String(markerShapeSlider);
  if (els.markerShapeSizeValue) els.markerShapeSizeValue.textContent = markerShapeSlider === 0 ? "Off" : String(markerShapeSlider);
  els.markerFillEnabled.checked = settings.fillEnabled;
  els.markerFillColor.value = settings.fillColor;

  settings.strokes.forEach((stroke, index) => {
    const row = document.createElement("div");
    row.className = "marker-stroke-row";
    row.classList.toggle("is-stroke-hidden", stroke.hidden);
    row.dataset.strokeId = stroke.id;
    row.dataset.strokeHidden = String(stroke.hidden);
    const grip = document.createElement("span");
    grip.className = "marker-stroke-grip";
    grip.draggable = true;
    grip.setAttribute("aria-hidden", "true");
    grip.dataset.help = "Drag this handle to reorder marker strokes. Stroke sizes and colors move with the row.";

    const color = document.createElement("input");
    color.type = "color";
    color.value = stroke.color;
    color.dataset.help = "Changes this stroke's color.";
    color.addEventListener("input", () => {
      const next = cloneMarkerSettings(settings);
      next.strokes[index] = { ...next.strokes[index], color: color.value };
      saveMarkerSettingsTarget(next);
    });

    const sizeValue = document.createElement("button");
    sizeValue.type = "button";
    sizeValue.className = "stroke-visibility-toggle";
    sizeValue.setAttribute("aria-pressed", String(!stroke.hidden));
    setStrokeVisibilityIcon(sizeValue, stroke.size);
    sizeValue.dataset.help = "Temporarily hides or shows this stroke without deleting it.";
    sizeValue.addEventListener("click", () => {
      const next = cloneMarkerSettings(settings);
      next.strokes[index] = { ...next.strokes[index], hidden: !next.strokes[index].hidden };
      saveMarkerSettingsTarget(next);
    });

    const divider = document.createElement("span");
    divider.className = "marker-stroke-divider";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "8";
    slider.step = "1";
    slider.value = String(stroke.size);
    slider.dataset.help = "Changes this stroke's visible thickness.";
    slider.addEventListener("input", () => {
      const next = cloneMarkerSettings(settings);
      const hidden = Number(slider.value) <= 0;
      next.strokes[index] = { ...next.strokes[index], size: Number(slider.value), hidden };
      sizeValue.setAttribute("aria-pressed", String(!hidden));
      setStrokeVisibilityIcon(sizeValue, slider.value);
      saveMarkerSettingsTarget(next);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.dataset.help = "Removes this stroke from the marker.";
    remove.addEventListener("click", () => {
      const next = cloneMarkerSettings(settings);
      next.strokes.splice(index, 1);
      saveMarkerSettingsTarget(next);
    });

    grip.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", stroke.id);
      event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", event => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData("text/plain");
      if (!draggedId || draggedId === stroke.id) return;
      const next = cloneMarkerSettings(settings);
      const from = next.strokes.findIndex(item => item.id === draggedId);
      const to = next.strokes.findIndex(item => item.id === stroke.id);
      if (from < 0 || to < 0) return;
      const [moved] = next.strokes.splice(from, 1);
      next.strokes.splice(to, 0, moved);
      saveMarkerSettingsTarget(next);
    });

    row.append(grip, color, sizeValue, divider, slider, remove);
    els.markerStrokeList.append(row);
  });
  renderMarkerImageStrokeControls(settings);
  updateMapFeatureToolbar();
}

function renderMarkerPreview(settings) {
  if (!els.markerPreview) return;
  els.markerPreview.replaceChildren();
  const svg = markerSvg(settings, {
    imageVisible: true,
    fallback: DEFAULT_MARKER_SETTINGS,
    maxSize: MARKER_SIZE_INTERNAL_MAX,
    baseSizePx: 92
  });
  const preview = document.createElement("div");
  preview.className = "landmark-preview-icon";
  preview.innerHTML = svg.html;
  els.markerPreview.append(preview);
  addPreviewNudgeControls(els.markerPreview, "marker");
  updateImagePreviewDrawer(els.markerPreview, "Marker preview");
}

function renderMarkerImageStrokeControls(settings) {
  if (!els.markerImageStrokeList) return;
  els.markerImageStrokeList.replaceChildren();
  settings.imageStrokes.forEach((stroke, index) => {
    const row = document.createElement("div");
    row.className = "marker-stroke-row";
    row.classList.toggle("is-stroke-hidden", stroke.hidden);
    row.dataset.strokeId = stroke.id;
    row.dataset.strokeHidden = String(stroke.hidden);
    const grip = document.createElement("span");
    grip.className = "marker-stroke-grip";
    grip.draggable = true;
    grip.setAttribute("aria-hidden", "true");
    grip.dataset.help = "Drag this handle to reorder marker image strokes.";
    const color = document.createElement("input");
    color.type = "color";
    color.value = stroke.color;
    color.dataset.help = "Changes this marker image stroke color.";
    color.addEventListener("input", () => {
      const target = markerSettingsTarget();
      if (!target) return;
      const next = cloneMarkerSettings(target.settings);
      next.imageStrokes[index] = { ...next.imageStrokes[index], color: color.value };
      saveMarkerSettingsTarget(next);
    });
    const sizeValue = document.createElement("button");
    sizeValue.type = "button";
    sizeValue.className = "stroke-visibility-toggle";
    sizeValue.setAttribute("aria-pressed", String(!stroke.hidden));
    setStrokeVisibilityIcon(sizeValue, stroke.size);
    sizeValue.dataset.help = "Temporarily hides or shows this image stroke without deleting it.";
    sizeValue.addEventListener("click", () => {
      const target = markerSettingsTarget();
      if (!target) return;
      const next = cloneMarkerSettings(target.settings);
      next.imageStrokes[index] = { ...next.imageStrokes[index], hidden: !next.imageStrokes[index].hidden };
      saveMarkerSettingsTarget(next);
    });
    const divider = document.createElement("span");
    divider.className = "marker-stroke-divider";
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "8";
    slider.step = "1";
    slider.value = String(stroke.size);
    slider.dataset.help = "Changes this marker image stroke thickness.";
    slider.addEventListener("input", () => {
      const target = markerSettingsTarget();
      if (!target) return;
      const next = cloneMarkerSettings(target.settings);
      const hidden = Number(slider.value) <= 0;
      next.imageStrokes[index] = { ...next.imageStrokes[index], size: Number(slider.value), hidden };
      sizeValue.setAttribute("aria-pressed", String(!hidden));
      setStrokeVisibilityIcon(sizeValue, slider.value);
      saveMarkerSettingsTarget(next);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.dataset.help = "Removes this marker image stroke.";
    remove.addEventListener("click", () => {
      const target = markerSettingsTarget();
      if (!target) return;
      const next = cloneMarkerSettings(target.settings);
      next.imageStrokes.splice(index, 1);
      saveMarkerSettingsTarget(next);
    });
    row.append(grip, color, sizeValue, divider, slider, remove);
    els.markerImageStrokeList.append(row);
  });
}

els.markerShape.addEventListener("change", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  saveMarkerSettingsTarget({ ...target.settings, shape: els.markerShape.value });
});

els.markerSize.addEventListener("input", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  const size = markerSliderToSize(els.markerSize.value);
  els.markerSizeValue.textContent = formatMarkerSizeValue(size);
  saveMarkerSettingsTarget({ ...target.settings, size }, { defer: true, renderControls: false });
});

els.markerOverrideSize?.addEventListener("input", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  const size = markerSliderToSize(els.markerOverrideSize.value);
  els.markerOverrideSizeValue.textContent = formatMarkerSizeValue(size);
  saveMarkerSettingsTarget({ ...target.settings, size }, { defer: true, renderControls: false });
});

els.markerFillEnabled.addEventListener("change", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  saveMarkerSettingsTarget({ ...target.settings, fillEnabled: els.markerFillEnabled.checked });
});

els.markerFillColor.addEventListener("input", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  saveMarkerSettingsTarget({ ...target.settings, fillColor: els.markerFillColor.value });
});

els.markerImageRecent?.addEventListener("change", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  const option = els.markerImageRecent.selectedOptions?.[0];
  saveMarkerSettingsTarget({
    ...target.settings,
    imageUrl: els.markerImageRecent.value || "",
    imageName: option?.textContent || ""
  });
});

els.markerImageDisplay?.addEventListener("change", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  saveMarkerSettingsTarget({ ...target.settings, imageDisplay: els.markerImageDisplay.value });
});

els.markerImageSize?.addEventListener("input", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  const imageSize = sizeSliderToInternal(els.markerImageSize.value, ROUTE_ANIMATION_IMAGE_SIZE_MAX);
  const sliderValue = Number(els.markerImageSize.value);
  if (els.markerImageSizeValue) els.markerImageSizeValue.textContent = sliderValue === 0 ? "Off" : String(Math.round(sliderValue));
  saveMarkerSettingsTarget({ ...target.settings, imageSize }, { defer: true, renderControls: false });
});

els.markerShapeSize?.addEventListener("input", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  const shapeSize = sizeSliderToInternal(els.markerShapeSize.value, ROUTE_ANIMATION_SHAPE_SIZE_MAX);
  const sliderValue = Number(els.markerShapeSize.value);
  if (els.markerShapeSizeValue) els.markerShapeSizeValue.textContent = sliderValue === 0 ? "Off" : String(Math.round(sliderValue));
  saveMarkerSettingsTarget({ ...target.settings, shapeSize }, { defer: true, renderControls: false });
});

els.markerImageUpload?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const optimized = await optimizeRouteAnimationIconUpload(file);
    const url = optimized.url;
    townMarkerImageRecents = [
      { name: optimized.name || file.name || "Marker image", url },
      ...townMarkerImageRecents.filter(item => item.url !== url)
    ].slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS);
    saveStoredImageRecents(TOWN_MARKER_IMAGE_RECENTS_KEY, townMarkerImageRecents);
    renderTownMarkerImageRecentOptions();
    if (els.markerImageRecent) els.markerImageRecent.value = url;
    const target = markerSettingsTarget();
    if (target) {
      saveMarkerSettingsTarget({ ...target.settings, imageUrl: url, imageName: optimized.name || file.name || "Marker image" });
    }
    const markerFilename = `${uploadBaseName(file, "marker image")}.png`;
    await downloadDataUrlAsset(url, markerFilename, "assets/markers");
  } catch (error) {
    if (els.status) els.status.textContent = error.message || "Marker image upload failed.";
  } finally {
    event.target.value = "";
  }
});

els.addMarkerStroke.addEventListener("click", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  const next = cloneMarkerSettings(target.settings);
  next.strokes.push({ id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, color: unusedPaletteStrokeColor(next.strokes, "#111827"), size: 1 });
  saveMarkerSettingsTarget(next);
});

els.addMarkerImageStroke?.addEventListener("click", () => {
  const target = markerSettingsTarget();
  if (!target) return;
  const next = cloneMarkerSettings(target.settings);
  next.imageStrokes.push({ id: `image-stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, color: unusedPaletteStrokeColor(next.imageStrokes, "#fffdf8"), size: 1 });
  saveMarkerSettingsTarget(next);
});

els.landmarksEnabled?.addEventListener("change", () => {
  const trip = activeTrip();
  if (!trip) return;
  const landmarks = tripLandmarkSettings(trip);
  landmarks.enabled = els.landmarksEnabled.checked;
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  saveTrips();
  renderRoute(false);
  renderLandmarks();
});

els.landmarkImageDisplay?.addEventListener("change", () => {
  const trip = activeTrip();
  if (!trip) return;
  const landmarks = tripLandmarkSettings(trip);
  landmarks.imageDisplay = els.landmarkImageDisplay.value;
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  saveTrips();
  renderRoute(false);
  renderLandmarks();
});

els.landmarkGlobalSize?.addEventListener("input", () => {
  const trip = activeTrip();
  if (!trip) return;
  const landmarks = tripLandmarkSettings(trip);
  landmarks.scale = clamp(Number(els.landmarkGlobalSize.value) / 100, 0, 2);
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  if (els.landmarkGlobalSizeValue) {
    els.landmarkGlobalSizeValue.textContent = landmarks.scale === 0 ? "Off" : `${Math.round(landmarks.scale * 100)}%`;
  }
  scheduleTripsSave();
  scheduleRouteRender();
});

els.useDefaultLandmarkForAll?.addEventListener("change", () => {
  const trip = activeTrip();
  if (!trip) return;
  const landmarks = tripLandmarkSettings(trip);
  landmarks.useDefaultForAll = els.useDefaultLandmarkForAll.checked;
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  saveTrips();
  renderRoute(false);
  renderLandmarks();
});

els.landmarkSize?.addEventListener("input", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.size = landmarkSliderToSize(els.landmarkSize.value);
  if (els.landmarkSizeValue) els.landmarkSizeValue.textContent = formatLandmarkSizeValue(marker.size);
  saveLandmarkSettings({ ...landmarks, marker }, { defer: true, renderControls: false });
});

els.landmarkImageSize?.addEventListener("input", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.imageSize = sizeSliderToInternal(els.landmarkImageSize.value, ROUTE_ANIMATION_IMAGE_SIZE_MAX);
  const value = Number(els.landmarkImageSize.value);
  if (els.landmarkImageSizeValue) els.landmarkImageSizeValue.textContent = value === 0 ? "Off" : String(value);
  saveLandmarkSettings({ ...landmarks, marker }, { defer: true, renderControls: false });
});

els.landmarkShapeSize?.addEventListener("input", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.shapeSize = sizeSliderToInternal(els.landmarkShapeSize.value, ROUTE_ANIMATION_SHAPE_SIZE_MAX);
  const value = Number(els.landmarkShapeSize.value);
  if (els.landmarkShapeSizeValue) els.landmarkShapeSizeValue.textContent = value === 0 ? "Off" : String(value);
  saveLandmarkSettings({ ...landmarks, marker }, { defer: true, renderControls: false });
});

els.landmarkShapeEnabled?.addEventListener("change", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.shapeEnabled = els.landmarkShapeEnabled.checked;
  saveLandmarkSettings({ ...landmarks, marker });
});

els.landmarkShape?.addEventListener("change", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.shape = els.landmarkShape.value;
  saveLandmarkSettings({ ...landmarks, marker });
});

els.landmarkFillColor?.addEventListener("input", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.fillColor = els.landmarkFillColor.value;
  saveLandmarkSettings({ ...landmarks, marker });
});

els.landmarkFillMode?.addEventListener("change", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.fillMode = els.landmarkFillMode.value;
  marker.fillEnabled = marker.fillMode !== "none";
  saveLandmarkSettings({ ...landmarks, marker });
});

els.addLandmarkImageStroke?.addEventListener("click", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.imageStrokes.push({ id: `landmark-image-stroke-${Date.now()}`, color: unusedPaletteStrokeColor(marker.imageStrokes, "#fffdf8"), size: 1 });
  saveLandmarkSettings({ ...landmarks, marker });
});

els.addLandmarkStroke?.addEventListener("click", () => {
  const landmarks = editableLandmarkSettings();
  const marker = cloneMarkerSettings(landmarks.marker);
  marker.strokes.push({ id: `landmark-stroke-${Date.now()}`, color: unusedPaletteStrokeColor(marker.strokes, "#fffdf8"), size: 1 });
  saveLandmarkSettings({ ...landmarks, marker });
});

els.landmarkSettingsScope?.addEventListener("change", () => {
  landmarkSettingsScope = els.landmarkSettingsScope.value || "default";
  selectedLandmarkStopKey = landmarkSettingsScope === "default" ? "" : landmarkSettingsScope;
  renderLandmarks();
});

els.saveLandmarkDefault?.addEventListener("click", () => {
  const source = editableLandmarkSettings();
  saveLandmarkDefaultSettings(source);
  renderLandmarks();
  setTripStatus("Saved the selected landmark settings as the default.");
});

els.applyLandmarkDefault?.addEventListener("click", () => {
  openLandmarkDefaultDialog(landmarkSettingsScope);
});

els.applyLandmarkDefaultSizing?.addEventListener("click", applyDefaultLandmarkSizingToAllStops);

els.defaultLandmarkTile?.addEventListener("click", () => {
  landmarkSettingsScope = "default";
  selectedLandmarkStopKey = "";
  renderLandmarks();
});

els.defaultLandmarkTile?.addEventListener("contextmenu", event => {
  event.preventDefault();
  openLandmarkImageDialog("default");
});

els.chooseLandmarkImage?.addEventListener("click", () => openLandmarkImageDialog(landmarkSettingsScope));
els.landmarkImageDialogClose?.addEventListener("click", () => closeLandmarkImageDialog());
els.landmarkImageDialog?.addEventListener("click", event => {
  if (event.target === els.landmarkImageDialog) closeLandmarkImageDialog();
});
els.landmarkImageUpload?.addEventListener("click", () => {
  closeLandmarkImageDialog({ preserveTarget: true });
  els.landmarkUploadInput?.click();
});
els.landmarkCatalogForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const query = els.landmarkCatalogSearch?.value.trim() || "";
  if (query.length < 2) {
    if (els.landmarkCatalogStatus) els.landmarkCatalogStatus.textContent = "Enter at least two characters.";
    return;
  }
  if (els.landmarkCatalogStatus) els.landmarkCatalogStatus.textContent = "Searching Wikimedia Commons…";
  if (els.landmarkCatalogResults) els.landmarkCatalogResults.replaceChildren();
  try {
    const results = await searchCommonsLandmarkImages(query);
    renderCommonsLandmarkResults(results);
    if (els.landmarkCatalogStatus) els.landmarkCatalogStatus.textContent = results.length
      ? `${results.length} reusable images found. Review the source before selecting one.`
      : "No matching images found. Try the city, landmark, or state name.";
  } catch (error) {
    if (els.landmarkCatalogStatus) els.landmarkCatalogStatus.textContent = error.message || "Online image search failed.";
  }
});

els.landmarkDefaultSelectAll?.addEventListener("click", () => {
  els.landmarkDefaultDialog?.querySelectorAll("[data-landmark-default-category]").forEach(input => { input.checked = true; });
  saveLandmarkDefaultDialogState();
});

els.landmarkDefaultSelectNone?.addEventListener("click", () => {
  els.landmarkDefaultDialog?.querySelectorAll("[data-landmark-default-category]").forEach(input => { input.checked = false; });
  saveLandmarkDefaultDialogState();
});

els.landmarkDefaultDialog?.querySelectorAll("[data-landmark-default-category]").forEach(input => {
  input.addEventListener("change", saveLandmarkDefaultDialogState);
});

els.landmarkDefaultTargetAll?.addEventListener("click", () => {
  els.landmarkDefaultTargets?.querySelectorAll("[data-landmark-default-target]").forEach(input => { input.checked = true; });
  saveLandmarkDefaultDialogState();
});

els.landmarkDefaultTargetNone?.addEventListener("click", () => {
  els.landmarkDefaultTargets?.querySelectorAll("[data-landmark-default-target]").forEach(input => { input.checked = false; });
  saveLandmarkDefaultDialogState();
});

els.landmarkDefaultCancel?.addEventListener("click", closeLandmarkDefaultDialog);
els.landmarkDefaultApply?.addEventListener("click", applySelectedLandmarkDefaults);
els.landmarkDefaultDialog?.addEventListener("click", event => {
  if (event.target === els.landmarkDefaultDialog) closeLandmarkDefaultDialog();
});

els.landmarkPerStopShapes?.addEventListener("change", () => {
  const trip = activeTrip();
  if (!trip) return;
  const landmarks = tripLandmarkSettings(trip);
  landmarks.perStopShapes = els.landmarkPerStopShapes.checked;
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  saveTrips();
  renderRoute(false);
  renderLandmarks();
});

els.landmarkShapeStop?.addEventListener("change", renderLandmarks);

els.landmarkStopShape?.addEventListener("change", () => {
  const trip = activeTrip();
  const key = els.landmarkShapeStop?.value;
  if (!trip || !key || !MARKER_SHAPES.has(els.landmarkStopShape.value)) return;
  const landmarks = tripLandmarkSettings(trip);
  const stop = landmarkStopsForTrip(trip).find(item => item.key === key);
  const previous = landmarks.stops[key] || landmarks.stops[landmarkStopKey(stop?.name)] || {};
  landmarks.stops[key] = {
    ...previous,
    name: stop?.name || previous.name || key,
    imageUrl: previous.imageUrl || DEFAULT_LANDMARK_IMAGE_URL,
    imageName: previous.imageName || "Landmark",
    shape: els.landmarkStopShape.value
  };
  landmarks.perStopShapes = true;
  trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
  saveTrips();
  renderRoute(false);
  renderLandmarks();
});

els.landmarkUploadInput?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  const trip = activeTrip();
  if (!file || !pendingLandmarkStopKey) return;
  try {
    const optimized = await optimizeRouteAnimationIconUpload(file);
    if (pendingLandmarkStopKey === "default") {
      const defaults = cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
      defaults.marker = normalizeMarkerSettings({
        ...defaults.marker,
        imageUrl: optimized.url,
        imageName: optimized.name || `${landmarkFileNameBase("default landmark")}.png`,
        imageSource: {}
      }, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX);
      saveLandmarkDefaultSettings(defaults);
      const response = await fetch(optimized.url);
      const blob = await response.blob();
      downloadBlob("Default landmark.png", blob);
      renderRoute(false);
      renderLandmarks();
      setTripStatus("Updated the default landmark image. Put the downloaded PNG in assets/landmarks to make it permanent.");
      return;
    }
    if (!trip) return;
    const landmarks = tripLandmarkSettings(trip);
    const stop = landmarkStopsForTrip(trip).find(item => item.key === pendingLandmarkStopKey);
    const previous = landmarks.stops[pendingLandmarkStopKey] || landmarks.stops[landmarkStopKey(stop?.name)] || {};
    landmarks.stops[pendingLandmarkStopKey] = {
      ...previous,
      name: stop?.name || pendingLandmarkStopKey,
      imageUrl: optimized.url,
      imageName: `${landmarkFileNameBase(stop?.name || pendingLandmarkStopKey)}.png`,
      imageSource: {},
      marker: previous.marker || normalizeMarkerSettings(landmarks.marker, DEFAULT_LANDMARK_SETTINGS.marker, LANDMARK_SIZE_INTERNAL_MAX)
    };
    landmarks.enabled = true;
    trip.landmarkSettings = normalizeLandmarkSettings(landmarks);
    saveTrips();
    const response = await fetch(optimized.url);
    const blob = await response.blob();
    downloadBlob(`${safeDownloadName(landmarkFileNameBase(stop?.name || pendingLandmarkStopKey))}.png`, blob);
    renderRoute(false);
    renderLandmarks();
    setTripStatus(`Updated landmark for ${stop?.name || "stop"}. Put the downloaded PNG in assets/landmarks to make it permanent.`);
  } catch (error) {
    setTripStatus(error.message || "Landmark upload failed.", true);
  } finally {
    pendingLandmarkStopKey = "";
    event.target.value = "";
  }
});

els.modifyMarkersByDay?.addEventListener("click", () => {
  if (!els.dayMarkerModifyPanel) return;
  const open = els.dayMarkerModifyPanel.hidden;
  els.dayMarkerModifyPanel.hidden = !open;
  els.zoneModifyMapPrompt.hidden = !open && els.dayZoneModifyPanel.hidden;
  if (open) els.zoneModifyMapPrompt.textContent = "CHOOSE A MARKER TO MODIFY";
  if (open) {
    state.overviewMarkerModifyIndex = null;
    state.markerModifyTarget = null;
    if (!state.overviewMode && state.routes.length) setOverviewMode({ fit: true });
  }
  els.modifyMarkersByDay.setAttribute("aria-expanded", String(open));
  renderMarkerControls();
  if (state.overviewMode) renderRoute(false);
});

els.modifyZonesByDay.addEventListener("click", () => {
  const open = els.dayZoneModifyPanel.hidden;
  els.dayZoneModifyPanel.hidden = !open;
  els.zoneModifyMapPrompt.hidden = !open;
  if (open) els.zoneModifyMapPrompt.textContent = "CHOOSE A DAY TO MODIFY";
  if (open) {
    state.overviewZoneModifyIndex = null;
    if (!state.overviewMode && state.routes.length) setOverviewMode({ fit: true });
  }
  els.modifyZonesByDay.setAttribute("aria-expanded", String(open));
  updateDayZoneModifyControls();
  if (state.overviewMode) renderRoute(false);
});

els.dayZoneVerticalSize.addEventListener("input", () => {
  setActiveRouteZoneSetting("verticalSize", Number(els.dayZoneVerticalSize.value));
});

els.dayZoneHorizontalSize.addEventListener("input", () => {
  setActiveRouteZoneSetting("horizontalSize", Number(els.dayZoneHorizontalSize.value));
});

els.dayZoneVerticalOffset.addEventListener("input", () => {
  setActiveRouteZoneSetting("verticalOffset", Number(els.dayZoneVerticalOffset.value));
});

els.dayZoneHorizontalOffset.addEventListener("input", () => {
  setActiveRouteZoneSetting("horizontalOffset", Number(els.dayZoneHorizontalOffset.value));
});

els.zoneDefaultsFromTrip.addEventListener("click", () => {
  const trip = activeTrip();
  if (!trip) return;
  const settings = tripZoneSettings(trip);
  trip.days.forEach(route => {
    route.zoneSettings = { ...settings };
  });
  setTripStatus("Applied current trip zone values to every day.");
  refreshOverviewZonesAfterSettingChange();
});

els.zoneDefaultsFromFile.addEventListener("click", () => {
  const trip = activeTrip();
  if (!trip) return;
  trip.zoneSettings = { ...DEFAULT_ZONE_SETTINGS };
  trip.days.forEach(route => {
    route.zoneSettings = { ...DEFAULT_ZONE_SETTINGS };
  });
  setTripStatus("Applied default file zone values to every day.");
  refreshOverviewZonesAfterSettingChange();
});

function updateOverviewRouteAnimationControls() {
  const duration = clamp(Number(els.overviewRouteAnimationTime.value) || 0.6, 0.1, 2);
  els.overviewRouteAnimationTime.value = String(duration);
  els.overviewRouteAnimationTimeValue.textContent = `${duration.toFixed(1)}s`;
  els.overviewRouteAnimationTime.disabled = !els.animateOverviewRoutes.checked;
  if (state.overviewMode && state.overviewFocusIndex === null && state.overviewHover.activeIndex !== null && !sidePanelHovered()) {
    animateOverviewRoute(state.overviewHover.activeIndex);
  }
}

function updateRoutePlaybackSpeedControl() {
  if (!els.routePlaybackSpeed || !els.playbackSpeed) return;
  const levels = routePlaybackSpeedLevels();
  state.playback.speedIndex = clamp(Math.round(Number(state.playback.speedIndex) || 0), 0, levels.length - 1);
  const speed = levels[state.playback.speedIndex];
  els.routePlaybackSpeed.value = String(speed);
  els.playbackSpeed.value = String(speed);
  els.routePlaybackSpeedLevels?.forEach((button, index) => {
    const active = index === state.playback.speedIndex;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.title = `Speed ${index + 1}: ${levels[index].toFixed(2)}x`;
  });
  if (els.routePlaybackSpeedValue) {
    els.routePlaybackSpeedValue.textContent = `Speed ${state.playback.speedIndex + 1} · ${speed.toFixed(2)}x`;
  }
}

function routePlaybackSpeedLevels() {
  return [0.5, 0.75, 1, 1.5, 2];
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function startUsageOverlay() {
  if (!els.usageOverlay || !SHOW_USAGE_OVERLAY) {
    if (els.usageOverlay) els.usageOverlay.hidden = true;
    return;
  }
  els.usageOverlay.hidden = false;
  els.usageOverlay.title = "Show or collapse performance details";
  els.usageOverlay.textContent = "FPS -- · Frame -- ms · JS n/a · Routes -- · Points --";
  let frames = 0;
  let lastUpdate = performance.now();
  let lastFrame = lastUpdate;
  let frameMs = 0;
  const updateText = (fps = "--") => {
    const memory = performance.memory
      ? `${formatBytes(performance.memory.usedJSHeapSize)} / ${formatBytes(performance.memory.jsHeapSizeLimit)}`
      : "n/a";
    const points = state.routes.reduce((total, route) => total + (route.displayPoints?.length || 0), 0);
    els.usageOverlay.textContent = `FPS ${fps} · ${Number.isFinite(frameMs) && frameMs > 0 ? frameMs.toFixed(1) : "--"} ms · JS ${memory} · Routes ${state.routes.length} · Points ${points}`;
  };
  const tick = now => {
    frames += 1;
    frameMs = frameMs * 0.88 + (now - lastFrame) * 0.12;
    lastFrame = now;
    if (now - lastUpdate >= 600) {
      const fps = Math.round(frames * 1000 / (now - lastUpdate));
      updateText(fps);
      frames = 0;
      lastUpdate = now;
    }
    requestAnimationFrame(tick);
  };
  window.setInterval(() => updateText("--"), 3000);
  requestAnimationFrame(tick);
}

els.usageOverlay?.addEventListener("click", () => {
  const match = els.usageOverlay.textContent.match(/FPS\s+([^\s]+)/);
  if (match) els.usageOverlay.dataset.fps = match[1];
  els.usageOverlay.classList.toggle("is-collapsed");
});

els.animateOverviewRoutes.addEventListener("change", updateOverviewRouteAnimationControls);
els.overviewRouteAnimationTime.addEventListener("input", updateOverviewRouteAnimationControls);
els.routePlaybackSpeedLevels?.forEach((button, index) => {
  button.addEventListener("click", () => {
    state.playback.speedIndex = index;
    updateRoutePlaybackSpeedControl();
  });
});
els.stickerLibraryView?.addEventListener("change", renderStickerLibrary);
els.stickerLibraryTabs?.addEventListener("click", event => {
  const tab = event.target.closest("[data-sticker-category]");
  if (!tab) return;
  stickerLibraryCategory = tab.dataset.stickerCategory || "all";
  els.stickerLibraryTabs.querySelectorAll("[data-sticker-category]").forEach(button => button.setAttribute("aria-selected", String(button === tab)));
  renderStickerLibrary();
});
els.pinLibraryColor?.addEventListener("input", () => {
  pinLibraryColor = els.pinLibraryColor.value;
  rememberPinLibraryColor(pinLibraryColor);
  renderStickerLibrary();
});

els.stickerAnimationTarget?.addEventListener("change", event => { selectedTimelineStickerId = event.target.value; renderStickerAnimationEditor(); });
els.stopTimelineEndAction?.addEventListener("change", () => {
  const content = activeStopDayContent?.();
  if (!content) return;
  content.timelineEndAction = els.stopTimelineEndAction.value;
  saveTrips();
  markProjectDirty("journeys");
});
els.timelineDefaultEndAction?.addEventListener("change", () => {
  const trip = activeTrip();
  if (!trip) return;
  trip.timelineDefaults = normalizeTimelineDefaults({ dayEndAction: els.timelineDefaultEndAction.value });
  saveTrips();
  markProjectDirty("journeys");
  renderRouteTimeline();
});
els.timelinePlayBackward?.addEventListener("click", () => timelineTransport.running && timelineTransport.direction < 0 ? pauseTimelineTransport() : playTimelineTransport(-1));
els.timelineStepBackward?.addEventListener("click", () => stepTimelineTransport(-1));
els.timelineStepForward?.addEventListener("click", () => stepTimelineTransport(1));
els.timelinePlayForward?.addEventListener("click", () => timelineTransport.running && timelineTransport.direction > 0 ? pauseTimelineTransport() : playTimelineTransport(1));
els.timelineLoop?.addEventListener("click", () => {
  timelineTransport.loop = !timelineTransport.loop;
  updateTimelineTransportUi();
});
els.timelinePlaybackSpeed?.addEventListener("change", () => {
  timelineTransport.speed = clamp(Number(els.timelinePlaybackSpeed.value) || 1, 0.25, 4);
  if (timelineTransport.running) {
    // Keep the current frame fixed when speed changes, then measure the next
    // segment from that exact frame so the playhead never jumps.
    timelineTransport.startedAt = performance.now();
    timelineTransport.startProgress = timelineTransport.progress;
  }
  updateTimelineTransportUi();
});
els.stickerAnimationPlayhead?.addEventListener("input", () => { selectedStickerKeyframe = null; selectedStickerKeyframes.clear(); renderStickerAnimationEditor(); });
els.stickerAnimationFrame?.addEventListener("input", () => {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker || !els.stickerAnimationPlayhead) return;
  const frames = stickerAnimationFrameCount(stickerAnimation(sticker));
  els.stickerAnimationPlayhead.value = String(clamp(Number(els.stickerAnimationFrame.value) || 0, 0, frames) / frames);
  selectedStickerKeyframe = null; selectedStickerKeyframes.clear(); renderStickerAnimationEditor();
});
els.stickerAnimationFrameCount?.addEventListener("change", () => {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  sticker.animation = { ...stickerAnimation(sticker), frameCount: clamp(Math.round(Number(els.stickerAnimationFrameCount.value) || 1), 1, 600) };
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
});
function setStickerAnimationSplit(property, enabled) {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  sticker.animation = { ...stickerAnimation(sticker), [property]: enabled };
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
}
els.stickerAnimationSplitScale?.addEventListener("change", () => setStickerAnimationSplit("splitScale", els.stickerAnimationSplitScale.checked));
els.stickerAnimationSplitPosition?.addEventListener("change", () => setStickerAnimationSplit("splitPosition", els.stickerAnimationSplitPosition.checked));
function updateSplitStickerKeyframe(property, value) {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  const animation = stickerAnimation(sticker); animation.keyframes ||= {}; animation.keyframes[property] ||= [];
  const time = clamp(Number(els.stickerAnimationPlayhead?.value) || 0, 0, 1);
  let frame = animation.keyframes[property].find(item => Math.abs(item.time - time) < .005);
  if (!frame) { frame = { time, value, easing: "ease", intensity: 1 }; animation.keyframes[property].push(frame); }
  else frame.value = value;
  animation[property] = value; sticker.animation = animation;
  selectedStickerKeyframe = { property, frame }; selectedStickerKeyframes = new Set([frame]);
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
}
els.stickerAnimationScaleY?.addEventListener("input", () => updateSplitStickerKeyframe("scaleY", Number(els.stickerAnimationScaleY.value)));
els.stickerAnimationScale?.addEventListener("input", () => {
  updateSplitStickerKeyframe("scaleX", Number(els.stickerAnimationScale.value));
  if (els.stickerAnimationUniformScale?.checked) updateSplitStickerKeyframe("scaleY", Number(els.stickerAnimationScale.value));
});
els.stickerAnimationPositionX?.addEventListener("input", () => updateSplitStickerKeyframe("positionX", Number(els.stickerAnimationPositionX.value)));
els.stickerAnimationPositionY?.addEventListener("input", () => updateSplitStickerKeyframe("positionY", Number(els.stickerAnimationPositionY.value)));
function updateTransformText(property, control) {
  const value = Number(control.value); if (!Number.isFinite(value)) return;
  updateSplitStickerKeyframe(property, value);
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  if ((property === "scaleX" || property === "scaleY") && els.stickerAnimationUniformScale?.checked) {
    const other = property === "scaleX" ? "scaleY" : "scaleX";
    updateSplitStickerKeyframe(other, value);
  }
}
els.stickerAnimationScaleXText?.addEventListener("change", () => updateTransformText("scaleX", els.stickerAnimationScaleXText));
els.stickerAnimationScaleYText?.addEventListener("change", () => updateTransformText("scaleY", els.stickerAnimationScaleYText));
els.stickerAnimationPositionXText?.addEventListener("change", () => updateTransformText("positionX", els.stickerAnimationPositionXText));
els.stickerAnimationPositionYText?.addEventListener("change", () => updateTransformText("positionY", els.stickerAnimationPositionYText));
els.stickerAnimationUniformScale?.addEventListener("change", () => {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  sticker.animation = { ...stickerAnimation(sticker), uniformScale: els.stickerAnimationUniformScale.checked };
  if (els.stickerAnimationUniformScale.checked) updateTransformText("scaleX", els.stickerAnimationScaleXText);
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
});
els.copyStickerKeyframes?.addEventListener("click", copySelectedStickerKeyframes);
els.pasteStickerKeyframes?.addEventListener("click", pasteStickerKeyframes);
els.stickerAnimationPlayBackward?.addEventListener("click", () => stickerAnimationTransport.running ? (cancelAnimationFrame(stickerAnimationTransport.frameId), stickerAnimationTransport.running = false) : playStickerAnimationPreview(-1));
els.stickerAnimationPlayForward?.addEventListener("click", () => stickerAnimationTransport.running ? (cancelAnimationFrame(stickerAnimationTransport.frameId), stickerAnimationTransport.running = false) : playStickerAnimationPreview(1));
els.stickerAnimationStepBackward?.addEventListener("click", () => { if (!els.stickerAnimationPlayhead) return; els.stickerAnimationPlayhead.value = String(clamp(Number(els.stickerAnimationPlayhead.value) - 1 / 30, 0, 1)); renderStickerAnimationEditor(); });
els.stickerAnimationStepForward?.addEventListener("click", () => { if (!els.stickerAnimationPlayhead) return; els.stickerAnimationPlayhead.value = String(clamp(Number(els.stickerAnimationPlayhead.value) + 1 / 30, 0, 1)); renderStickerAnimationEditor(); });
els.stickerAnimationLoop?.addEventListener("click", () => { stickerAnimationTransport.loop = !stickerAnimationTransport.loop; els.stickerAnimationLoop.setAttribute("aria-pressed", String(stickerAnimationTransport.loop)); });
function updateStickerAnimationLoopSettings() {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  sticker.animation = { ...stickerAnimation(sticker), loopMode: els.stickerAnimationLoopMode?.value || "none", loopDelay: clamp(Number(els.stickerAnimationLoopDelay?.value) || 0, 0, 5) };
  if (els.stickerAnimationLoopDelayValue) els.stickerAnimationLoopDelayValue.textContent = `${Number(sticker.animation.loopDelay).toFixed(1)}s`;
  saveTrips(); markProjectDirty("journeys");
}
els.stickerAnimationLoopMode?.addEventListener("change", updateStickerAnimationLoopSettings);
els.stickerAnimationLoopDelay?.addEventListener("input", updateStickerAnimationLoopSettings);
els.annotationWeight?.addEventListener("input", updateAnnotationToolUi);
els.beginAnnotation?.addEventListener("click", beginAnnotationDrawing);
els.finishAnnotation?.addEventListener("click", finishAnnotationDrawing);
els.clearAnnotations?.addEventListener("click", clearJourneyAnnotations);
els.drawStickerPath?.addEventListener("click", beginStickerPathDrawing);
els.finishStickerPath?.addEventListener("click", finishStickerPathDrawing);
els.clearStickerPath?.addEventListener("click", clearStickerPath);
els.deleteStickerKeyframe?.addEventListener("click", deleteSelectedStickerKeyframe);
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    const tag = event.target?.tagName;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
    if (event.key.toLowerCase() === "c" && selectedStickerKeyframes.size) { event.preventDefault(); copySelectedStickerKeyframes(); return; }
    if (event.key.toLowerCase() === "v" && copiedStickerKeyframes.length) { event.preventDefault(); pasteStickerKeyframes(); return; }
  }
  if (event.key !== "Delete" || !selectedStickerKeyframes.size) return;
  const tag = event.target?.tagName;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
  event.preventDefault();
  deleteSelectedStickerKeyframe();
});
const updateTimelineTrackHeight = () => {
  const height = clamp(Number(els.routeTimelineTrackHeight?.value) || 44, 32, 116);
  els.routeTimeline?.style.setProperty("--timeline-track-height", `${height}px`);
  if (els.routeTimelineTrackHeightValue) els.routeTimelineTrackHeightValue.textContent = `${height}px`;
};

// The picker remains a clean asset library. Per-sticker behaviour belongs
// with sound and animation controls in the unified Sticker Effects workspace.
const stickerEffectsSection = document.querySelector(".sticker-sfx-section");
if (stickerEffectsSection && els.stickerSelectionControls) {
  const effectAnchor = document.querySelector("#stickerSfxEditor");
  if (effectAnchor) effectAnchor.after(els.stickerSelectionControls);
}
els.routeTimelineTrackHeight?.addEventListener("input", updateTimelineTrackHeight);
els.routeTimeline?.addEventListener("wheel", event => {
  if (!event.shiftKey) return;
  event.preventDefault();
  if (els.routeTimelineTrackHeight) {
    els.routeTimelineTrackHeight.value = String(clamp(Number(els.routeTimelineTrackHeight.value) + (event.deltaY < 0 ? 4 : -4), 32, 116));
    updateTimelineTrackHeight();
  }
}, { passive: false });
[els.stickerAnimationPreset, els.stickerAnimationDuration, els.stickerAnimationOpacity, els.stickerAnimationScale, els.stickerAnimationRotation].forEach(input => {
  input?.addEventListener("pointerdown", () => {
    const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId) || selectedStickerRecord();
    stickerAnimationHistoryBefore = stickerSnapshot(sticker);
  });
  input?.addEventListener("focus", () => {
    const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId) || selectedStickerRecord();
    stickerAnimationHistoryBefore ||= stickerSnapshot(sticker);
  });
  input?.addEventListener("input", () => {
    const property = input === els.stickerAnimationOpacity ? "opacity"
      : input === els.stickerAnimationScale ? "scale"
        : input === els.stickerAnimationRotation ? "rotation" : "";
    updateSelectedStickerAnimation(property);
  });
  input?.addEventListener("change", () => {
    const property = input === els.stickerAnimationOpacity ? "opacity"
      : input === els.stickerAnimationScale ? "scale"
        : input === els.stickerAnimationRotation ? "rotation" : "";
    updateSelectedStickerAnimation(property);
    const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId) || selectedStickerRecord();
    recordStickerHistory({ before: stickerAnimationHistoryBefore, after: stickerSnapshot(sticker) });
    stickerAnimationHistoryBefore = null;
  });
});
els.stickerKeyframeEasing?.addEventListener("change", () => {
  if (!selectedStickerKeyframe?.frame) return;
  selectedStickerKeyframe.frame.easing = els.stickerKeyframeEasing.value;
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
});
els.stickerKeyframeIntensity?.addEventListener("input", () => {
  if (!selectedStickerKeyframe?.frame) return;
  selectedStickerKeyframe.frame.intensity = clamp(Number(els.stickerKeyframeIntensity.value) || 1, 0.2, 2);
  if (els.stickerKeyframeIntensityValue) els.stickerKeyframeIntensityValue.textContent = `${Math.round(selectedStickerKeyframe.frame.intensity * 100)}%`;
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
});
function updateSelectedPositionPath() {
  if (!selectedStickerKeyframe || !/^position/.test(selectedStickerKeyframe.property)) return;
  const frame = selectedStickerKeyframe.frame;
  frame.pathMode = els.stickerPositionPathMode?.value || "straight";
  frame.pathFrequency = clamp(Math.round(Number(els.stickerPositionPathFrequency?.value) || 2), 1, 8);
  if (els.stickerPositionPathFrequencyValue) els.stickerPositionPathFrequencyValue.textContent = String(frame.pathFrequency);
  saveTrips(); markProjectDirty("journeys"); renderStickerAnimationEditor();
}
els.stickerPositionPathMode?.addEventListener("change", updateSelectedPositionPath);
els.stickerPositionPathFrequency?.addEventListener("input", updateSelectedPositionPath);
document.querySelectorAll("[data-sticker-keyframe]").forEach(button => button.addEventListener("click", () => addStickerKeyframe(button.dataset.stickerKeyframe)));
els.saveStickerAnimationPreset?.addEventListener("click", () => {
  const sticker = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!sticker) return;
  sticker.animationPresetName = `${sticker.label} preset`; saveTrips(); markProjectDirty("journeys"); els.status.textContent = "Sticker animation preset saved on this sticker.";
});
els.applyStickerAnimationToMatching?.addEventListener("click", () => {
  const source = activeTrip()?.stickers?.find(item => item.id === selectedTimelineStickerId); if (!source) return;
  activeTrip().stickers.filter(item => item.libraryId === source.libraryId).forEach(item => { item.animation = { ...stickerAnimation(source) }; });
  saveTrips(); markProjectDirty("journeys"); renderStickers(); renderStickerAnimationEditor();
});
els.routeCameraMode?.addEventListener("change", updateRouteCameraControls);
els.routeFollowZoom?.addEventListener("input", updateRouteCameraControls);
els.routeFollowDeadZone?.addEventListener("input", updateRouteCameraControls);
els.routeFollowTurnAware?.addEventListener("change", updateRouteCameraControls);
[els.tripAnimationSeparateIcon, els.tripAnimationIconRecent, els.tripAnimationIconSize].forEach(control => {
  control?.addEventListener("input", updateTripAnimationIconControls);
  control?.addEventListener("change", updateTripAnimationIconControls);
});

[els.selectedRouteColor, els.precedingRouteColor, els.followingRouteColor, els.routeFillColor].forEach(input => {
  input?.addEventListener("input", refreshRouteDisplayColors);
  input?.addEventListener("change", refreshRouteDisplayColors);
});

els.enableMapLibre?.addEventListener("change", () => {
  setMapLibreEnabled(els.enableMapLibre.checked);
  if (els.status) {
    els.status.textContent = els.enableMapLibre.checked
      ? "Using OSM-derived road basemap tiles for locked roads, land, and water."
      : "Using styled SVG map layers.";
  }
});

[
  els.routeAnimationIconEnabled,
  els.routeAnimationIconHideAtTown,
  els.routeAnimationIconRecent,
  els.routeAnimationIconSize,
  els.routeAnimationIconImageSize,
  els.routeAnimationIconShapeSize,
  els.routeAnimationIconBackgroundEnabled,
  els.routeAnimationIconBackgroundShape,
  els.routeAnimationIconFillEnabled,
  els.routeAnimationIconFillMode,
  els.routeAnimationIconBackgroundFill,
  els.addRouteAnimationIconStroke,
  els.addRouteAnimationIconImageStroke
].forEach(control => {
  control?.addEventListener("input", updateRouteAnimationIconControls);
  control?.addEventListener("change", updateRouteAnimationIconControls);
});

els.addRouteAnimationIconStroke?.addEventListener("click", () => {
  const strokes = currentRouteAnimationIconStrokes();
  strokes.push(normalizeMarkerStroke({
    id: `route-icon-stroke-${Date.now()}`,
    color: unusedPaletteStrokeColor(strokes, "#fffdf8"),
    size: 2
  }));
  renderRouteAnimationIconStrokeControls(strokes);
  updateRouteAnimationIconControls();
});

els.addRouteAnimationIconImageStroke?.addEventListener("click", () => {
  const strokes = currentRouteAnimationIconImageStrokes();
  strokes.push(normalizeMarkerStroke({
    id: `route-icon-image-stroke-${Date.now()}`,
    color: unusedPaletteStrokeColor(strokes, "#fffdf8"),
    size: 2
  }));
  renderRouteAnimationIconImageStrokeControls(strokes);
  updateRouteAnimationIconControls();
});

els.routeAnimationIconUpload?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const optimized = await optimizeRouteAnimationIconUpload(file);
    const url = optimized.url;
    if (!url.startsWith("data:image/")) throw new Error("Choose an image file for the route animation icon.");
    routeAnimationIconRecents = [
      { name: optimized.name || file.name || "Uploaded icon", url },
      ...routeAnimationIconRecents.filter(item => item.url !== url)
    ].slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS);
    saveRouteAnimationIconRecents(routeAnimationIconRecents);
    renderRouteAnimationIconRecentOptions();
    els.routeAnimationIconRecent.value = url;
    updateRouteAnimationIconControls();
    const iconFilename = `${uploadBaseName(file, "route icon")}.png`;
    await downloadDataUrlAsset(url, iconFilename, "assets/route icons");
    if (optimized.originalWidth > optimized.width || optimized.originalHeight > optimized.height) {
      els.status.textContent = `Optimized icon from ${optimized.originalWidth}x${optimized.originalHeight} to ${optimized.width}x${optimized.height}. Put ${iconFilename} in assets/route icons to make it permanent.`;
    }
  } catch (error) {
    els.status.textContent = error.message || "Icon upload failed.";
  } finally {
    event.target.value = "";
  }
});

els.exportRouteAnimationIcon?.addEventListener("click", async () => {
  try {
    await exportRouteAnimationIconPng();
  } catch (error) {
    console.warn(error);
    if (els.status) els.status.textContent = error.message || "Could not export the icon PNG.";
  }
});

function setLayerVisible(layer, visible) {
  if (!layer) return;
  if (visible && !map.hasLayer(layer)) {
    layer.addTo(map);
  }

  if (!visible && map.hasLayer(layer)) {
    map.removeLayer(layer);
  }
}

function shouldShowControl(control) {
  const style = layerStyles[control.key];
  if (mapLibreBasemapEnabled() && control.basemap) {
    return false;
  }
  if (control.alwaysVisible) {
    return !style?.minZoom || map.getZoom() >= style.minZoom;
  }
  if (control.key === "land" || control.key === "water" || control.key === "deserts" || control.key === "parks" || control.key === "buildings" || control.key === "texture") {
    return control.input.checked;
  }
  if (control.key === "smallTowns" || control.key === "cities" || control.key === "capitols" || control.key === "pois") {
    return control.input.checked;
  }
  if (control.key === "route" && state.playback.hasStarted) {
    return false;
  }
  if (control.key === "route" || control.key === "faintRoute") {
    return routeDisplayVisible && (control.input.checked || control.alwaysVisible) && (!style?.minZoom || map.getZoom() >= style.minZoom);
  }
  return (control.input.checked || control.forceVisible?.()) && (!style?.minZoom || map.getZoom() >= style.minZoom);
}

const toggleControls = [
  { key: "land", input: els.toggleLand, layer: landLayer, basemap: true },
  { key: "water", input: els.toggleWater, layer: waterGroup, basemap: true },
  { key: "deserts", input: els.toggleDeserts, layer: null, basemap: true },
  { key: "parks", input: els.toggleParks, layer: null, basemap: true },
  { key: "buildings", input: els.toggleBuildings, layer: null, basemap: true },
  { key: "texture", input: els.toggleTexture, layer: null, basemap: true },
  { key: "highways", input: els.toggleHighways, layer: null, basemap: true, alwaysVisible: true },
  { key: "majorRoads", input: els.toggleStreet, layer: streetLayer, basemap: true, aliases: ["streets"] },
  { key: "minorRoads", input: els.toggleFaintStreet, layer: faintStreetLayer, basemap: true, aliases: ["faintStreets"] },
  { key: "railroads", input: els.toggleRailroads, layer: null, basemap: true },
  { key: "topography", input: els.toggleTopo, layer: topoLayer, basemap: true },
  { key: "faintTopography", input: els.toggleFaintTopo, layer: faintTopoLayer, basemap: true },
  { key: "countryBorders", input: els.toggleCountryBorders, layer: null },
  { key: "stateBorders", input: els.toggleStates, layer: stateLineGroup, aliases: ["stateLines"] },
  { key: "countyBorders", input: els.toggleFaintStates, layer: faintStateLineGroup, aliases: ["faintStateLines"] },
  { key: "visitedStates", input: els.colorVisitedStates, layer: null },
  { key: "smallTowns", input: els.toggleSmallTowns, layer: smallTownGroup },
  { key: "cities", input: els.toggleCities, layer: cityGroup },
  { key: "capitols", input: els.toggleCapitals, layer: capitalGroup },
  { key: "pois", input: els.togglePois, layer: null },
  { key: "route", input: els.toggleRoute, layer: routeGroup, alwaysVisible: true },
  { key: "faintRoute", input: els.toggleFaintRoute, layer: faintRouteGroup, alwaysVisible: true },
  { key: "startEnd", input: els.toggleMarkers, layer: markerGroup, alwaysVisible: true },
  { key: "dayZoneFill", input: els.toggleDayZoneFill, layer: null },
  { key: "dayZoneStroke", input: els.toggleDayZoneStroke, layer: null }
];

let lastMixedToggleState = getToggleState();

function getToggleState() {
  const state = Object.fromEntries(toggleControls.map(control => [control.key, control.input.checked]));
  state.streets = state.majorRoads;
  state.faintStreets = state.minorRoads;
  state.stateLines = state.stateBorders;
  state.faintStateLines = state.countyBorders;
  return state;
}

function optionalToggleValues(toggleState) {
  return toggleControls
    .filter(control => !control.alwaysVisible)
    .map(control => Boolean(toggleState[control.key]));
}

function isMixedToggleState(toggleState) {
  const values = optionalToggleValues(toggleState);
  return values.some(Boolean) && values.some(value => !value);
}

function normalizeToggleStateForApply(toggleState = {}) {
  const normalized = { ...toggleState };
  if (Object.prototype.hasOwnProperty.call(normalized, "streets") && !Object.prototype.hasOwnProperty.call(normalized, "majorRoads")) {
    normalized.majorRoads = normalized.streets;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "faintStreets") && !Object.prototype.hasOwnProperty.call(normalized, "minorRoads")) {
    normalized.minorRoads = normalized.faintStreets;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "stateLines") && !Object.prototype.hasOwnProperty.call(normalized, "stateBorders")) {
    normalized.stateBorders = normalized.stateLines;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "faintStateLines") && !Object.prototype.hasOwnProperty.call(normalized, "countyBorders")) {
    normalized.countyBorders = normalized.faintStateLines;
  }
  if (!Object.prototype.hasOwnProperty.call(normalized, "highways") && Object.prototype.hasOwnProperty.call(normalized, "majorRoads")) {
    normalized.highways = normalized.majorRoads;
  }
  const hasStreetState = Object.prototype.hasOwnProperty.call(normalized, "streets") ||
    Object.prototype.hasOwnProperty.call(normalized, "faintStreets") ||
    Object.prototype.hasOwnProperty.call(normalized, "majorRoads") ||
    Object.prototype.hasOwnProperty.call(normalized, "minorRoads");
  if (hasStreetState && !normalized.majorRoads && !normalized.minorRoads && !normalized.highways) {
    normalized.majorRoads = true;
  }
  return normalized;
}

function rememberMixedToggleState(toggleState = getToggleState()) {
  if (isMixedToggleState(toggleState)) {
    lastMixedToggleState = { ...toggleState };
  }
}

function applyToggleState(toggleState) {
  const normalizedToggleState = normalizeToggleStateForApply(toggleState);
  const previousDayZoneFill = els.toggleDayZoneFill.checked;
  const previousDayZoneStroke = els.toggleDayZoneStroke.checked;
  toggleControls.forEach(control => {
    if (control.alwaysVisible) {
      control.input.checked = true;
    }
    if (Object.prototype.hasOwnProperty.call(normalizedToggleState, control.key)) {
      control.input.checked = control.alwaysVisible || Boolean(normalizedToggleState[control.key]);
    }
    setLayerVisible(control.layer, shouldShowControl(control));
  });
  refreshNewElementLayers();
  refreshTopographyStyle();
  refreshStreetStyle();
  applyRouteStackOrder();
  updateMapFeatureToolbar();
  if (
    state.overviewMode &&
    (previousDayZoneFill !== els.toggleDayZoneFill.checked ||
      previousDayZoneStroke !== els.toggleDayZoneStroke.checked)
  ) {
    renderRoute(false);
  }
}

function makeUniformToggleState(checked) {
  return Object.fromEntries(toggleControls.map(control => [control.key, control.alwaysVisible || checked]));
}

function allTogglesMatch(toggleState, checked) {
  return optionalToggleValues(toggleState).every(value => value === checked);
}

function applyBulkToggle(checked) {
  const currentState = getToggleState();
  rememberMixedToggleState(currentState);
  applyToggleState(makeUniformToggleState(checked));
  renderCityLabels();
  scheduleOsmPlaceRefresh(0);
}

toggleControls.forEach(control => {
  control.input.addEventListener("change", () => {
    if (control.alwaysVisible && !control.input.checked) control.input.checked = true;
    rememberMixedToggleState();
    setLayerVisible(control.layer, shouldShowControl(control));
    refreshNewElementLayers();
    refreshTopographyStyle();
    refreshStreetStyle();
    if (["smallTowns", "cities", "capitols", "pois"].includes(control.key)) {
      renderCityLabels();
      scheduleOsmPlaceRefresh(0);
    }
    if ((control.key === "dayZoneFill" || control.key === "dayZoneStroke") && state.overviewMode) renderRoute(false);
  });

  control.input.closest(".element-control")?.addEventListener("wheel", event => {
    const style = layerStyles[control.key];
    if (!style) return;
    event.preventDefault();
    if (control.key === "dayZoneFill") {
      const direction = event.deltaY < 0 ? 1 : -1;
      style.opacity = clamp(style.opacity + direction * 0.02, 0, 0.5);
      style.size = style.opacity;
      refreshStyledLayers();
      return;
    }
    const step = event.shiftKey ? 0.25 : 0.5;
    const direction = event.deltaY < 0 ? 1 : -1;
    style.size = clamp(style.size + direction * step, style.min, style.max);
    refreshStyledLayers();
  }, { passive: false });
});

els.featureToggleMarkers?.addEventListener("click", () => {
  if (!els.markerImageDisplay) return;
  els.markerImageDisplay.value = els.markerImageDisplay.value === "never" ? "always" : "never";
  els.markerImageDisplay.dispatchEvent(new Event("change", { bubbles: true }));
  updateMapFeatureToolbar();
});

els.featureToggleStopNames?.addEventListener("click", () => {
  routeStopNamesVisible = !routeStopNamesVisible;
  renderCityLabels();
  updateMapFeatureToolbar();
});

els.featureToggleRoute?.addEventListener("click", () => {
  routeDisplayVisible = !routeDisplayVisible;
  setLayerVisible(routeGroup, routeDisplayVisible && shouldShowControl(toggleControls.find(control => control.key === "route")));
  setLayerVisible(faintRouteGroup, routeDisplayVisible && shouldShowControl(toggleControls.find(control => control.key === "faintRoute")));
  updateMapFeatureToolbar();
});

els.featureToggleRouteIcon?.addEventListener("click", () => {
  if (!els.routeAnimationIconEnabled) return;
  els.routeAnimationIconEnabled.checked = !els.routeAnimationIconEnabled.checked;
  updateRouteAnimationIconControls();
});

els.featureToggleLandmarks?.addEventListener("click", () => {
  const landmarks = tripLandmarkSettings();
  if (!landmarks.enabled || landmarks.imageDisplay === "never") {
    saveLandmarkSettings({ ...landmarks, enabled: true, imageDisplay: "always" });
    return;
  }
  saveLandmarkSettings({ ...landmarks, enabled: false, imageDisplay: "never" });
});

map.on("zoomend", () => {
  setTextureZoomCompensation();
  textureZoomStart = null;
  setCameraTextureSuppressed(false);
  syncMapLibreToLeaflet(null, { resize: true });
  if (
    state.overviewMode &&
    state.overviewFocusIndex !== null &&
    state.overviewFocusZoom !== null &&
    map.getZoom() < state.overviewFocusZoom - 0.1
  ) {
    restoreOverviewHome();
    return;
  }
  rebuildCityLabels();
  applyToggleState(getToggleState());
  // Unlike normal routes, the US overview has its own country-scale width.
  // Rebuild it here so that width follows the completed zoom, not the stale
  // zoom at which the overview was entered.
  if (state.contiguousUsMode) renderRoute(false);
  // Zooming only changes zoom-dependent map presentation. Avoid rebuilding
  // routes, playback, state lines, swatches, and persisted theme state here.
  refreshTopographyStyle();
  refreshStreetStyle();
  scheduleOsmPlaceRefresh(80);
  syncStreetVectorToLeaflet();
  updateRoadZoomOpacity();
  renderMediaMarkers();
  renderStickers();
  lastStreetDetailValue = activeStreetDetailValue();
  requestAnimationFrame(() => setThoroughfareVisibility(true));
});

map.on("zoomstart", () => {
  textureZoomStart = map._zoom;
  setThoroughfareVisibility(false);
  setCameraTextureSuppressed(true);
});

map.on("movestart", () => {
  setCameraTextureSuppressed(true);
});

map.on("zoom", () => {
  updateRouteStrokeZoomMultiplier(map.getZoom());
  updateRoadZoomOpacity();
  setTextureZoomCompensation(map.getZoom());
  syncMapLibreToLeaflet(map.getZoom());
  syncStreetVectorToLeaflet(map.getZoom());
  if (textureScalesWithMap()) {
    refreshLayerTextureOverlays(map.getZoom());
  }
});

map.on("zoomanim", event => {
  updateRouteStrokeZoomMultiplier(event.zoom);
  updateRoadZoomOpacity(event.zoom);
  setTextureZoomCompensation(event.zoom);
  syncMapLibreToLeaflet(event.zoom, { center: event.center });
  syncStreetVectorToLeaflet(event.zoom);
});

map.on("moveend", () => {
  syncMapLibreToLeaflet(null, { resize: true });
  syncStreetVectorToLeaflet();
  if (anyRoadsVisible() && Number(streetVectorOverlay.dataset.layers || 0) === 0) {
    scheduleOsmRoadRefresh(900);
  }
  scheduleOsmPlaceRefresh(160);
  setCameraTextureSuppressed(false);
});

map.on("move", () => {
  syncMapLibreToLeaflet();
  syncStreetVectorToLeaflet();
});

function routeEditContextMenuAllowed() {
  return Boolean(activeRoute())
    && currentStickerViewKey() === "route"
    && !pendingMediaPinId
    && !(state.overviewMode && state.overviewFocusIndex === null);
}

let lastRouteEditContextMenuAt = 0;

map.on("contextmenu", event => {
  if (!routeEditContextMenuAllowed()) return;
  lastRouteEditContextMenuAt = Date.now();
  event.originalEvent?.preventDefault?.();
  openRouteEditPopup(event.latlng);
});

map.getContainer()?.addEventListener("contextmenu", event => {
  if (!routeEditContextMenuAllowed()) return;
  if (Date.now() - lastRouteEditContextMenuAt < 180) return;
  if (event.target?.closest?.(".leaflet-control, .leaflet-popup, button, input, select, textarea, a")) return;
  event.preventDefault();
  lastRouteEditContextMenuAt = Date.now();
  const bounds = map.getContainer().getBoundingClientRect();
  const point = L.point(event.clientX - bounds.left, event.clientY - bounds.top);
  openRouteEditPopup(map.containerPointToLatLng(point));
});

map.on("mousemove", event => {
  if (state.overviewMode && state.overviewFocusIndex === null && state.overviewHover.activeIndex !== null) {
    releaseOverviewHoverIfPointerLeft(event);
  }
});

let resizeRefreshTimer = null;

function refreshMapForCurrentLayout({ fit = false } = {}) {
  if (mapLibreMap) {
    mapLibreMap.resize();
    syncMapLibreToLeaflet(null, { resize: true });
  }
  if (streetVectorMap) {
    sizeStreetVectorOverlay();
    streetVectorMap.resize();
    syncStreetVectorToLeaflet();
  }
  if (!activeRoute()) return;
  if (cameraTransitionActive) {
    renderRoute(false);
    applyToggleState(getToggleState());
    return;
  }
  if (state.overviewMode && state.overviewFocusIndex === null) {
    renderRoute(fit, { animate: false });
    captureOverviewHomeView();
  } else if (state.overviewMode) {
    renderRoute(false);
  }
  applyMapInteractionLocks();
  applyToggleState(getToggleState());
}

function scheduleResponsiveMapRefresh({ fit = false } = {}) {
  clearTimeout(resizeRefreshTimer);
  resizeRefreshTimer = setTimeout(() => {
    map.invalidateSize({ animate: false });
    refreshMapForCurrentLayout({ fit });
  }, 120);
}

map.on("resize", () => {
  scheduleResponsiveMapRefresh({ fit: appState.siteMode !== "user" });
});

bindPreviewFileDrop(els.markerPreview, els.markerImageUpload);
bindPreviewFileDrop(els.routeAnimationIconPreview, els.routeAnimationIconUpload);
bindPreviewFileDrop(els.stickerMediaPreview, null, { media: true });

if (window.ResizeObserver) {
  const mapStageResizeObserver = new ResizeObserver(() => {
    scheduleResponsiveMapRefresh({ fit: appState.siteMode !== "user" });
    scheduleUserRuntimeLayoutRefresh();
    scheduleUserDevicePreviewRefresh();
  });
  mapStageResizeObserver.observe(els.mapCanvas);
  const userStage = els.mapCanvas?.closest?.(".map-stage");
  if (userStage && userStage !== els.mapCanvas) mapStageResizeObserver.observe(userStage);
}

els.toggleAllOn.addEventListener("click", () => {
  applyBulkToggle(true);
});

els.toggleAllOff.addEventListener("click", () => {
  applyBulkToggle(false);
});

els.routeThemeGrid?.addEventListener("click", event => {
  const providerButton = event.target.closest("[data-map-provider-theme]");
  if (providerButton && !providerButton.disabled) {
    applyMapProviderTheme(providerButton.dataset.mapProviderTheme);
    return;
  }
  const button = event.target.closest("[data-route-theme]");
  if (!button || button.disabled) return;
  applyRouteTheme(button.dataset.routeTheme);
});

els.saveRouteTheme?.addEventListener("click", saveCurrentRouteTheme);
els.saveCurrentThemeQuick?.addEventListener("click", saveCurrentRouteTheme);
els.updateCurrentTheme?.addEventListener("click", updateCurrentRouteTheme);
function toggleRouteThemePicker() {
  if (isUsersBuilderMode()) {
    closeRouteThemePicker();
    setUserThemePanelOpen(els.userThemePanel?.hidden !== false);
    return;
  }
  const panel = document.querySelector("#panelElements");
  if (panel?.classList.contains("theme-picker-open")) {
    closeRouteThemePicker();
  } else {
    openRouteThemePicker();
  }
}
els.openRouteThemePicker?.addEventListener("click", toggleRouteThemePicker);
els.closeRouteThemePicker?.addEventListener("click", () => {
  routeThemePickerSnapshot = null;
  closeRouteThemePicker();
});
els.cancelRouteThemePicker?.addEventListener("click", cancelRouteThemePicker);
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !document.querySelector("#panelElements")?.classList.contains("theme-picker-open")) return;
  event.preventDefault();
  cancelRouteThemePicker();
});
window.addEventListener("resize", () => positionRouteThemePicker({ reanchor: true }));

[
  els.uiThemePanelColor,
  els.uiThemeSurfaceColor,
  els.uiThemeHighlightColor,
  els.uiThemeFont,
  els.uiThemeTexture,
  els.uiThemeTextureOpacity,
  els.uiThemeTextureBlend
].forEach(input => {
  input.addEventListener("input", () => applyUiThemeState(getUiThemeState()));
  input.addEventListener("change", () => applyUiThemeState(getUiThemeState()));
});

els.editUiTheme.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  const rect = els.editUiTheme.getBoundingClientRect();
  placePopup(els.uiThemePanel, rect.left, rect.top - 330);
  syncMapAfterPanelLayoutChange();
});

els.closeUiThemePanel.addEventListener("click", event => {
  event.preventDefault();
  event.stopPropagation();
  els.uiThemePanel.hidden = true;
  syncMapAfterPanelLayoutChange();
});

els.presetSelect.addEventListener("change", () => {
  const presets = loadPresets();
  const preset = presets[els.presetSelect.value];
  if (!preset) return;
  rememberMixedToggleState();
  applyToggleState(preset);
});

els.savePreset.addEventListener("click", () => {
  const name = prompt("Preset name");
  if (!name?.trim()) return;
  const presets = loadPresets();
  presets[name.trim()] = getToggleState();
  savePresets(presets);
  renderPresetOptions();
  els.presetSelect.value = name.trim();
});

async function downloadDataUrlAsset(dataUrl, filename, folderLabel) {
  if (!dataUrl?.startsWith?.("data:image/")) return;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  downloadBlob(filename, blob);
  if (els.status) {
    els.status.textContent = `Downloaded ${filename}. Put it in ${folderLabel} to make it permanent.`;
  }
}

function uploadBaseName(file, fallback = "uploaded image") {
  const source = file?.name || fallback;
  return safeDownloadName(source.replace(/\.[^.]+$/, "") || fallback);
}

async function loadDefaultStyleFile({ apply = true } = {}) {
  try {
    const response = await fetch(DEFAULT_STYLE_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = await response.json();
    if (apply) applyStyleState(parsed.styles || parsed);
    return parsed;
  } catch (error) {
    // The exported style file is optional.
    return null;
  }
}

async function loadDefaultUiSettingsFile({ apply = true } = {}) {
  try {
    const response = await fetch(DEFAULT_UI_SETTINGS_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const parsed = await response.json();
    if (apply) applyUiSettingsState(parsed);
    return parsed;
  } catch (error) {
    // The exported UI settings file is optional.
    return null;
  }
}

async function fetchDefaultJourneyPayload() {
  for (const url of DEFAULT_JOURNEY_URLS) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      return { payload: await response.json(), url };
    } catch (error) {
      // Project journey defaults are optional; try the next known location.
    }
  }
  return null;
}

async function loadDefaultJourneyFile() {
  const result = await fetchDefaultJourneyPayload();
  if (!result) return false;
  applyTripsPayload(result.payload);
  setTripStatus(`Using ${result.url} for project journeys.`);
  return true;
}

async function mergeMissingDefaultJourneys() {
  const result = await fetchDefaultJourneyPayload();
  if (!result?.payload?.trips?.length) return 0;
  const defaultRevision = String(result.payload.itineraryRevision || "");
  let itineraryUpdated = false;
  if (defaultRevision && defaultRevision !== state.itineraryRevision) {
    const defaultStops = new Map(result.payload.trips.flatMap(trip => trip.stops || []).map(stop => [stop.id, stop]));
    const defaultRoutes = new Map(result.payload.trips.flatMap(trip => trip.days || []).map(route => [route.id, route]));
    state.trips.forEach(trip => {
      synchronizeTripStops(trip).forEach(stop => {
        const source = defaultStops.get(stop.id);
        if (!source) return;
        stop.arrivalDate = isoDateValue(source.arrivalDate);
        stop.departureDate = isoDateValue(source.departureDate);
        itineraryUpdated = true;
      });
      trip.days.forEach(route => {
        const source = defaultRoutes.get(route.id);
        if (!source) return;
        route.travelStartDate = isoDateValue(source.travelStartDate);
        route.travelEndDate = isoDateValue(source.travelEndDate);
        route.sequenceDate = isoDateValue(source.sequenceDate);
        itineraryUpdated = true;
      });
      const firstStop = synchronizeTripStops(trip)[0];
      if (firstStop?.arrivalDate) trip.tripStartDate = firstStop.arrivalDate;
    });
    state.itineraryRevision = defaultRevision;
  }
  const existingIds = new Set(state.trips.map(trip => trip.id));
  const missingRecords = result.payload.trips.filter(trip => trip?.id && !existingIds.has(trip.id));
  const incoming = missingRecords.length
    ? hydrateTripsPayload({ ...result.payload, trips: missingRecords })
    : [];
  if (incoming.length) state.trips.push(...incoming);
  if (itineraryUpdated || incoming.length) saveTrips();
  return incoming.length;
}

async function loadDefaultSettingsFiles() {
  defaultSettingsLoading = true;
  try {
    const [uiSettings, styleSettings] = await Promise.all([
      loadDefaultUiSettingsFile({ apply: false }),
      loadDefaultStyleFile({ apply: false })
    ]);
    // Preserve the established precedence: broad UI defaults first, then the
    // dedicated style file. Only the network reads happen concurrently.
    if (uiSettings) applyUiSettingsState(uiSettings, { preserveTerminology: true });
    if (styleSettings) applyStyleState(styleSettings.styles || styleSettings);
  } finally {
    defaultSettingsLoading = false;
  }
}

function getStyleExportPayload() {
  return {
    version: 1,
    styles: getStyleState()
  };
}

function getUiSettingsExportPayload() {
  return {
    uiSettings: getUiSettingsState()
  };
}

async function saveProjectSettingsFile(filename, payload, projectPath) {
  const result = await saveJsonToChosenFile(filename, payload);
  if (result.method === "cancelled") return;
  const action = result.method === "file" ? `Exported ${result.name}` : `Downloaded ${filename}`;
  els.status.textContent = `${action}. Suggested project path: ${projectPath}`;
}

const DEFAULT_PUBLISH_CONFIG = Object.freeze({
  method: "github",
  siteUrl: "https://retiredfortravel.com",
  repository: "WalkthroughWimps/RV-website",
  branch: "main"
});

function normalizedPublishConfig(value = {}) {
  return {
    method: DEFAULT_PUBLISH_CONFIG.method,
    siteUrl: String(value.siteUrl || DEFAULT_PUBLISH_CONFIG.siteUrl).trim().slice(0, 300),
    repository: String(value.repository || DEFAULT_PUBLISH_CONFIG.repository).trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").slice(0, 200),
    branch: String(value.branch || DEFAULT_PUBLISH_CONFIG.branch).trim().slice(0, 120) || DEFAULT_PUBLISH_CONFIG.branch
  };
}

function refreshMaintenanceMapUi() {
  const active = typeof isMaintenanceSiteMode === "function" && isMaintenanceSiteMode();
  if (els.maintenanceMapControls) els.maintenanceMapControls.hidden = !active;
  if (els.maintenanceMapZoomControl) els.maintenanceMapZoomControl.hidden = !active;
  if (!active) return;
  const settings = getMaintenanceRouteSettings();
  if (els.maintenanceRouteIconSize) els.maintenanceRouteIconSize.value = String(settings.size);
  els.maintenanceRouteIconGrid?.querySelectorAll("[data-maintenance-route-icon]").forEach(button => {
    const selected = button.dataset.maintenanceRouteIcon === settings.icon;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  updateMaintenanceMapZoomControl();
  requestAnimationFrame(() => refreshRouteAnimationIcon());
}

function updateMaintenanceMapZoomControl() {
  if (!els.maintenanceMapZoom || !(typeof isMaintenanceSiteMode === "function" && isMaintenanceSiteMode())) return;
  const min = Number.isFinite(map.getMinZoom?.()) ? map.getMinZoom() : 3;
  const max = Number.isFinite(map.getMaxZoom?.()) ? map.getMaxZoom() : 18;
  els.maintenanceMapZoom.min = String(min);
  els.maintenanceMapZoom.max = String(max);
  els.maintenanceMapZoom.value = String(Math.max(min, Math.min(max, map.getZoom())));
}

els.maintenanceRouteIconGrid?.addEventListener("click", event => {
  const button = event.target.closest("[data-maintenance-route-icon]");
  if (!button || typeof setMaintenanceRouteSettings !== "function") return;
  setMaintenanceRouteSettings({ icon: button.dataset.maintenanceRouteIcon });
});
els.maintenanceRouteIconSize?.addEventListener("input", event => {
  if (typeof setMaintenanceRouteSettings !== "function") return;
  setMaintenanceRouteSettings({ size: Number(event.target.value) });
});
els.maintenanceMapZoom?.addEventListener("input", event => {
  if (!(typeof isMaintenanceSiteMode === "function" && isMaintenanceSiteMode())) return;
  map.setZoom(Number(event.target.value));
});
map.on("zoomend", updateMaintenanceMapZoomControl);
document.addEventListener("rvmaintenancechange", refreshMaintenanceMapUi);

function getPublishConfig() {
  return normalizedPublishConfig(rvStorageReadJson(PUBLISH_CONFIG_STORAGE_KEY, {}));
}

function savePublishConfig(config) {
  const normalized = normalizedPublishConfig(config);
  rvStorageWriteJson(PUBLISH_CONFIG_STORAGE_KEY, normalized);
  return normalized;
}

function publishMethodDescription(method) {
  const descriptions = {
    "manual-godaddy": "Build the production package locally, then upload its contents to your GoDaddy site root. No online credentials are stored here.",
    github: "Cloudflare Pages deploys each commit pushed to the configured production branch. Connect the repository in Cloudflare once, then use Git normally.",
    "deploy-api": "Future connector: send a signed release to a hosting-provider deployment API. This requires a protected server endpoint.",
    "local-bridge": "Future connector: send the release to a small local helper that can run the production build and deploy with your local credentials."
  };
  return descriptions[method] || descriptions["manual-godaddy"];
}

function renderPublishDialog() {
  const config = getPublishConfig();
  if (els.publishMethod) els.publishMethod.value = config.method;
  if (els.publishSiteUrl) els.publishSiteUrl.value = config.siteUrl;
  if (els.publishRepository) els.publishRepository.value = config.repository;
  if (els.publishBranch) els.publishBranch.value = config.branch;
  if (els.publishMethodNote) els.publishMethodNote.textContent = publishMethodDescription(config.method);
}

function openPublishDialog() {
  if (RV_RUNTIME_ENVIRONMENT.labsLocalOnly) {
    if (els.status) els.status.textContent = "Labs is browser-local only. Publishing is disabled in this copy.";
    return;
  }
  if (!els.publishDialog) return;
  renderPublishDialog();
  els.publishDialog.hidden = false;
  els.publishMethod?.focus();
}

function closePublishDialog() {
  if (!els.publishDialog) return;
  els.publishDialog.hidden = true;
  els.publishSite?.focus();
}

els.exportStyles.addEventListener("click", () => {
  downloadJson(STYLE_EXPORT_NAME, getStyleExportPayload());
});

els.saveStylesToProject?.addEventListener("click", () => {
  saveProjectSettingsFile(STYLE_EXPORT_NAME, getStyleExportPayload(), "assets/files/styles/rv-map-styles.json");
});

els.importStyles.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = await readJsonFile(file);
    applyStyleState(parsed.styles || parsed);
    els.status.textContent = `Imported ${file.name}`;
  } catch (error) {
    els.status.textContent = "Style import failed.";
  } finally {
    event.target.value = "";
  }
});

function getActivePanelTab() {
  return panelTabs.find(tab => tab.getAttribute("aria-selected") === "true")?.dataset.panelTab || "map-ui";
}

function getUiSettingsState() {
  return {
    version: 2,
    terminology: { ...terminologyState },
    savedUsMapView: normalizeSavedMapView(savedUsMapView),
    usJourneyRouteWidth,
    customStickerLibrary: customStickerLibrary.map(item => ({ ...item })),
    // Users is a workspace, not an admin landing page. Do not persist it as
    // the page that opens after an admin refresh.
    activeTab: getActivePanelTab() === "users" ? "map-ui" : getActivePanelTab(),
    mapElements: getToggleState(),
    styles: getStyleState(),
    controls: {
      playbackSpeed: Number(els.playbackSpeed.value),
      playbackSpeedLevels: routePlaybackSpeedLevels(),
      playbackSpeedIndex: state.playback.speedIndex,
      allowPan: els.allowPan.checked,
      allowZoom: els.allowZoom.checked,
      textureScaleWithMap: els.textureScaleWithMap.checked,
      routeStackOrder,
      overviewDeadZone: Number(els.overviewDeadZone.value),
      overviewZoneSize: Number(els.overviewZoneSize.value),
      routeDisplayColors: getRouteDisplayColors(),
      animateOverviewRoutes: els.animateOverviewRoutes.checked,
      overviewRouteAnimationTime: Number(els.overviewRouteAnimationTime.value),
      routeCamera: {
        mode: routeCameraMode(),
        zoom: Number(els.routeFollowZoom?.value) || 10,
        deadZone: Number(els.routeFollowDeadZone?.value) || 20,
        turnAware: Boolean(els.routeFollowTurnAware?.checked)
      },
      routeAnimationIcon: getRouteAnimationIconSettings(),
      tripAnimationIcon: {
        separate: Boolean(els.tripAnimationSeparateIcon?.checked),
        imageUrl: els.tripAnimationIconRecent?.value || "",
        size: Number(els.tripAnimationIconSize?.value) || 40
      },
      routeAnimationIconRecents,
      townMarkerImageRecents,
      streetDetail: {
        out: STREET_DETAIL_ZOOMED_OUT,
        in: STREET_DETAIL_ZOOMED_IN
      }
    },
    localRoadSource: localRoadSourceState ? {
      name: localRoadSourceState.name,
      fileNames: localRoadSourceState.fileNames || [],
      selectedAt: localRoadSourceState.selectedAt
    } : null,
    featureVisibility: {
      route: routeDisplayVisible,
      routeStopNames: routeStopNamesVisible
    },
    landmarkDefaults: cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS),
    panelSectionOrder: readPanelSectionOrder(),
    uiTheme: getUiThemeState(),
    mediaPresentation: typeof mediaPresentationState !== "undefined" ? structuredClone(mediaPresentationState) : null,
    sfx: typeof sfxExportState === "function" ? sfxExportState() : null,
    music: typeof musicExportState === "function" ? musicExportState() : null,
    mapLibre: {
      enabled: mapLibreBasemapEnabled(),
      styleUrlOverride: els.mapLibreApiKey?.value || "",
      style: activeMapLibreStyleId,
      themes: getMapLibreThemeState()
    },
    userView: serializeUserBuilderPersistenceState(),
    welcomeScreen: typeof getWelcomeScreenState === "function" ? getWelcomeScreenState() : null,
    publishing: getPublishConfig(),
    presets: {
      mapElements: loadPresets(),
      styles: loadStylePresets(),
      routeThemes: loadCustomRouteThemes()
    }
  };
}

function getStadiaThemeState() {
  return Object.fromEntries(STADIA_STYLES.map(style => [
    style.id,
    {
      tileStyle: style.tileStyle,
      swatch: style.swatch,
      filter: style.filter,
      contours: style.contours,
      blend: style.blend,
      textColor: style.textColor,
      textBg: style.textBg,
      textBgOpacity: style.textBgOpacity
    }
  ]));
}

function getMapLibreThemeState() {
  return Object.fromEntries(MAPLIBRE_STYLES.map(style => [
    style.id,
    {
      styleUrl: style.styleUrl,
      swatch: style.swatch,
      contours: style.contours,
      blend: style.blend,
      colors: { ...style.colors }
    }
  ]));
}

function getUiThemeState() {
  return {
    panel: els.uiThemePanelColor.value || DEFAULT_UI_THEME.panel,
    surface: els.uiThemeSurfaceColor.value || DEFAULT_UI_THEME.surface,
    highlight: els.uiThemeHighlightColor.value || DEFAULT_UI_THEME.highlight,
    font: els.uiThemeFont.value || DEFAULT_UI_THEME.font,
    texture: els.uiThemeTexture.value || DEFAULT_UI_THEME.texture,
    textureOpacity: Number(els.uiThemeTextureOpacity.value || DEFAULT_UI_THEME.textureOpacity),
    textureBlend: els.uiThemeTextureBlend.value || DEFAULT_UI_THEME.textureBlend
  };
}

function applyUiThemeState(theme = DEFAULT_UI_THEME) {
  const next = { ...DEFAULT_UI_THEME, ...theme };
  els.uiThemePanelColor.value = next.panel;
  els.uiThemeSurfaceColor.value = next.surface;
  els.uiThemeHighlightColor.value = next.highlight;
  els.uiThemeFont.value = next.font;
  els.uiThemeTexture.value = next.texture;
  els.uiThemeTextureOpacity.value = next.textureOpacity;
  els.uiThemeTextureBlend.value = next.textureBlend;
  document.documentElement.style.setProperty("--panel", next.panel);
  document.documentElement.style.setProperty("--surface", next.surface);
  document.documentElement.style.setProperty("--control", next.highlight);
  const panelText = readableTextColor(next.panel);
  const surfaceText = readableTextColor(next.surface);
  const darkPanel = relativeLuminance(next.panel) < 0.36;
  document.documentElement.classList.toggle("dark-ui-theme", darkPanel);
  document.documentElement.style.setProperty("--ink", panelText);
  document.documentElement.style.setProperty("--surface-text", surfaceText);
  document.documentElement.style.setProperty("--muted", darkPanel ? mixHex(panelText, next.panel, 0.24) : mixHex(panelText, next.surface, 0.36));
  document.documentElement.style.setProperty("--line", darkPanel ? mixHex(panelText, next.panel, 0.62) : mixHex(panelText, next.surface, 0.62));
  document.documentElement.style.setProperty("--control-text", readableTextColor(next.highlight));
  document.documentElement.style.setProperty("--label-halo", relativeLuminance(styleColor("land")) > 0.48 ? "#ffffff" : "#12202b");
  document.documentElement.style.setProperty("--ui-font", next.font);
  document.documentElement.style.setProperty("--ui-texture", UI_THEME_TEXTURES[next.texture] || "none");
  document.documentElement.style.setProperty("--ui-texture-opacity", String(next.textureOpacity));
  document.documentElement.style.setProperty("--ui-texture-blend", next.textureBlend);
}

function applyUiControlsState(controls = {}) {
  if (Number.isFinite(Number(controls.playbackSpeedIndex))) {
    state.playback.speedIndex = clamp(Math.round(Number(controls.playbackSpeedIndex)), 0, 4);
  } else if (Number.isFinite(controls.playbackSpeed)) {
    const legacySpeed = clamp(controls.playbackSpeed, Number(els.playbackSpeed.min), Number(els.playbackSpeed.max));
    const levels = routePlaybackSpeedLevels();
    state.playback.speedIndex = levels.reduce((bestIndex, value, index) => (
      Math.abs(value - legacySpeed) < Math.abs(levels[bestIndex] - legacySpeed) ? index : bestIndex
    ), 0);
  }
  updateRoutePlaybackSpeedControl();
  if (typeof controls.allowPan === "boolean") {
    els.allowPan.checked = controls.allowPan;
  }
  if (typeof controls.allowZoom === "boolean") {
    els.allowZoom.checked = controls.allowZoom;
  }
  if (typeof controls.textureScaleWithMap === "boolean") {
    els.textureScaleWithMap.checked = controls.textureScaleWithMap;
    updateTextureScaleModeLabel();
    refreshStyledLayers();
  }
  applyRouteStackOrder(controls.routeStackOrder);
  if (Number.isFinite(controls.overviewDeadZone)) {
    els.overviewDeadZone.value = String(clamp(controls.overviewDeadZone, Number(els.overviewDeadZone.min), Number(els.overviewDeadZone.max)));
  }
  if (Number.isFinite(controls.overviewZoneSize)) {
    els.overviewZoneSize.value = String(clamp(controls.overviewZoneSize, Number(els.overviewZoneSize.min), Number(els.overviewZoneSize.max)));
    els.overviewZoneSizeValue.textContent = els.overviewZoneSize.value;
  }
  if (controls.routeDisplayColors && typeof controls.routeDisplayColors === "object") {
    applyRouteDisplayColors(controls.routeDisplayColors);
  }
  // Older exports may contain colors that disappear into a new theme. Always
  // normalize the editable swatches against the active land and water palette.
  applyHighContrastRouteDisplayColors?.();
  if (typeof controls.animateOverviewRoutes === "boolean") {
    els.animateOverviewRoutes.checked = controls.animateOverviewRoutes;
  }
  if (Number.isFinite(controls.overviewRouteAnimationTime)) {
    els.overviewRouteAnimationTime.value = String(clamp(
      controls.overviewRouteAnimationTime,
      Number(els.overviewRouteAnimationTime.min),
      Number(els.overviewRouteAnimationTime.max)
    ));
  }
  if (controls.routeCamera && typeof controls.routeCamera === "object") {
    const camera = controls.routeCamera;
    if (els.routeCameraMode) els.routeCameraMode.value = ["overview", "saved", "follow", "static"].includes(camera.mode) ? camera.mode : "overview";
    if (Number.isFinite(camera.zoom) && els.routeFollowZoom) els.routeFollowZoom.value = String(clamp(camera.zoom, Number(els.routeFollowZoom.min), Number(els.routeFollowZoom.max)));
    if (Number.isFinite(camera.deadZone) && els.routeFollowDeadZone) els.routeFollowDeadZone.value = String(clamp(camera.deadZone, Number(els.routeFollowDeadZone.min), Number(els.routeFollowDeadZone.max)));
    if (typeof camera.turnAware === "boolean" && els.routeFollowTurnAware) els.routeFollowTurnAware.checked = camera.turnAware;
  }
  updateRouteCameraControls();
  if (Array.isArray(controls.routeAnimationIconRecents)) {
    routeAnimationIconRecents = controls.routeAnimationIconRecents
      .filter(item => item && typeof item.url === "string" && item.url.startsWith("data:image/"))
      .map(item => ({ name: String(item.name || "Uploaded icon"), url: item.url }))
      .slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS);
    saveRouteAnimationIconRecents(routeAnimationIconRecents);
    renderRouteAnimationIconRecentOptions();
  }
  if (Array.isArray(controls.townMarkerImageRecents)) {
    townMarkerImageRecents = controls.townMarkerImageRecents
      .filter(item => item && typeof item.url === "string" && item.url.startsWith("data:image/"))
      .map(item => ({ name: String(item.name || "Marker image"), url: item.url }))
      .slice(0, MAX_ROUTE_ANIMATION_ICON_RECENTS);
    saveStoredImageRecents(TOWN_MARKER_IMAGE_RECENTS_KEY, townMarkerImageRecents);
    renderTownMarkerImageRecentOptions();
  }
  if (controls.routeAnimationIcon && typeof controls.routeAnimationIcon === "object") {
    applyRouteAnimationIconSettings(controls.routeAnimationIcon);
  } else {
    applyRouteAnimationIconSettings(DEFAULT_ROUTE_ANIMATION_ICON);
  }
  if (controls.tripAnimationIcon && typeof controls.tripAnimationIcon === "object") {
    if (els.tripAnimationSeparateIcon) els.tripAnimationSeparateIcon.checked = Boolean(controls.tripAnimationIcon.separate);
    if (els.tripAnimationIconRecent) els.tripAnimationIconRecent.value = controls.tripAnimationIcon.imageUrl || "";
    if (Number.isFinite(Number(controls.tripAnimationIcon.size)) && els.tripAnimationIconSize) els.tripAnimationIconSize.value = String(clamp(Number(controls.tripAnimationIcon.size), 0, 100));
  }
  updateTripAnimationIconControls();
  updateOverviewRouteAnimationControls();
  clearOverviewHoverTimer();
  if (state.overviewMode) {
    renderRoute(false);
  }
  if (!els.allowPan.checked || !els.allowZoom.checked) {
    fitSelectionThenApplyLocks();
  } else {
    applyMapInteractionLocks();
  }
}

function applyStadiaState(stadia = {}) {
  if (typeof stadia.apiKey === "string") {
    els.stadiaApiKey.value = stadia.apiKey;
  }
  if (stadia.themes && typeof stadia.themes === "object") {
    Object.entries(stadia.themes).forEach(([id, values]) => {
      const style = STADIA_STYLES.find(item => item.id === id);
      if (!style || !values) return;
      if (typeof values.tileStyle === "string") {
        style.tileStyle = values.tileStyle;
      }
      if (Array.isArray(values.swatch) && values.swatch.length === 2) {
        style.swatch = values.swatch;
      }
      if (typeof values.filter === "string") {
        style.filter = values.filter;
      }
      if (Number.isFinite(values.contours)) {
        style.contours = values.contours;
      }
      if (Number.isFinite(values.blend)) {
        style.blend = values.blend;
      }
      if (typeof values.textColor === "string") {
        style.textColor = values.textColor;
      }
      if (typeof values.textBg === "string") {
        style.textBg = values.textBg;
      }
      if (Number.isFinite(values.textBgOpacity)) {
        style.textBgOpacity = values.textBgOpacity;
      }
    });
  }
  if (typeof stadia.style === "string" && STADIA_STYLES.some(style => style.id === stadia.style)) {
    activeStadiaStyleId = stadia.style;
  }
  renderStadiaStyleGrid();
  rebuildStadiaLayer();
  if (typeof stadia.enabled === "boolean") {
    setStadiaEnabled(stadia.enabled);
  }
}

function applyMapLibreState(mapLibre = {}) {
  if (typeof mapLibre.styleUrlOverride === "string" || typeof mapLibre.apiKey === "string") {
    if (els.mapLibreApiKey) {
      els.mapLibreApiKey.value = mapLibre.styleUrlOverride || mapLibre.apiKey || "";
    }
  }
  if (mapLibre.themes && typeof mapLibre.themes === "object") {
    Object.entries(mapLibre.themes).forEach(([id, values]) => {
      const style = MAPLIBRE_STYLES.find(item => item.id === id);
      if (!style || !values) return;
      if (typeof values.styleUrl === "string") {
        style.styleUrl = values.styleUrl;
      }
      if (Array.isArray(values.swatch) && values.swatch.length === 2) {
        style.swatch = values.swatch;
      }
      if (Number.isFinite(values.contours)) {
        style.contours = values.contours;
      }
      if (Number.isFinite(values.blend)) {
        style.blend = values.blend;
      }
      if (values.colors && typeof values.colors === "object") {
        style.colors = { ...style.colors, ...values.colors };
        if (!style.colors.topoLow) {
          style.colors.topoLow = style.colors.land;
        }
        if (!style.colors.topoHigh) {
          style.colors.topoHigh = style.colors.road || style.colors.boundary;
        }
      }
    });
  }
  if (typeof mapLibre.style === "string" && MAPLIBRE_STYLES.some(style => style.id === mapLibre.style)) {
    activeMapLibreStyleId = mapLibre.style;
  }
  renderMapLibreStyleGrid();
  if (typeof mapLibre.enabled === "boolean") {
    if (defaultSettingsLoading) {
      els.enableMapLibre.checked = mapLibre.enabled;
      baseMapMode = mapLibre.enabled ? "maplibre" : "leaflet-fallback";
    } else {
      setMapLibreEnabled(mapLibre.enabled);
    }
  }
}

function applyUiSettingsState(settings, { preserveTerminology = false } = {}) {
  const payload = settings?.uiSettings || settings;
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid UI settings file.");
  }

  if (payload.terminology && typeof payload.terminology === "object") {
    const savedTerminology = preserveTerminology
      ? rvStorageReadJson(TERMINOLOGY_STORAGE_KEY, {})
      : {};
    terminologyState = { ...DEFAULT_TERMINOLOGY, ...payload.terminology, ...(savedTerminology || {}) };
    rvStorageWriteJson(TERMINOLOGY_STORAGE_KEY, terminologyState);
    applyTerminology();
  }
  if (payload.savedUsMapView) {
    savedUsMapView = normalizeSavedMapView(payload.savedUsMapView);
    rvStorageWriteJson(US_VIEW_STORAGE_KEY, savedUsMapView);
  }
  if (Number.isFinite(Number(payload.usJourneyRouteWidth))) {
    usJourneyRouteWidth = clamp(Number(payload.usJourneyRouteWidth), 2, 24);
    rvStorageWriteJson(US_JOURNEY_ROUTE_WIDTH_STORAGE_KEY, usJourneyRouteWidth);
    if (els.journeyStyleUsWidth) els.journeyStyleUsWidth.value = String(usJourneyRouteWidth);
    if (els.journeyStyleUsWidthValue) els.journeyStyleUsWidthValue.textContent = String(usJourneyRouteWidth);
  }
  if (Array.isArray(payload.customStickerLibrary)) {
    customStickerLibrary = payload.customStickerLibrary.filter(item => item?.id && item?.url);
    rvStorageWriteJson(CUSTOM_STICKER_LIBRARY_KEY, customStickerLibrary);
    renderStickerLibrary();
  }
  if (payload.publishing && typeof payload.publishing === "object") {
    savePublishConfig(payload.publishing);
  }

  if (payload.presets?.mapElements && typeof payload.presets.mapElements === "object") {
    savePresets(payload.presets.mapElements);
    renderPresetOptions();
  }
  if (payload.presets?.styles && typeof payload.presets.styles === "object") {
    saveStylePresets(payload.presets.styles);
    renderStylePresetOptions();
  }
  if (payload.presets?.routeThemes && typeof payload.presets.routeThemes === "object") {
    saveCustomRouteThemes(payload.presets.routeThemes);
    renderRouteThemeGrid();
  }
  if (payload.styles) {
    applyStyleState(payload.styles);
  }
  if (payload.mapElements) {
    rememberMixedToggleState();
    applyToggleState(payload.mapElements);
  }
  if (payload.controls) {
    applyUiControlsState(payload.controls);
  }
  if ("localRoadSource" in payload) {
    saveLocalRoadSourceState(payload.localRoadSource || null);
  }
  if (payload.featureVisibility && typeof payload.featureVisibility === "object") {
    if (typeof payload.featureVisibility.route === "boolean") {
      routeDisplayVisible = payload.featureVisibility.route;
    }
    if (typeof payload.featureVisibility.routeStopNames === "boolean") {
      routeStopNamesVisible = payload.featureVisibility.routeStopNames;
    }
  }
  if (payload.landmarkDefaults && typeof payload.landmarkDefaults === "object") {
    saveLandmarkDefaultSettings(payload.landmarkDefaults);
    renderLandmarks();
  }
  if (payload.uiTheme) {
    applyUiThemeState(payload.uiTheme);
  }
  if (payload.mediaPresentation && typeof payload.mediaPresentation === "object" && typeof loadMediaPresentationState === "function") {
    rvStorageWriteJson(MEDIA_PRESENTATION_KEY, payload.mediaPresentation);
    mediaPresentationState = loadMediaPresentationState();
  }
  if (payload.sfx && typeof sfxApplySettings === "function") {
    sfxApplySettings(payload.sfx);
  }
  if (payload.music && typeof musicApplySettings === "function") {
    musicApplySettings(payload.music);
  }
  if (payload.mapLibre) {
    applyMapLibreState(payload.mapLibre);
  }
  if (payload.userView && typeof payload.userView === "object") {
    applyUserBuilderPersistenceState(payload.userView, {
      saveLocal: userBuilderPersistenceReady,
      resetHistory: false
    });
  }
  if (payload.panelSectionOrder && typeof payload.panelSectionOrder === "object") {
    rvStorageWriteJson(PANEL_SECTION_ORDER_KEY, payload.panelSectionOrder);
    applySavedPanelSectionOrder();
    updatePanelSectionChrome();
  }
  if (payload.activeTab) {
    setPanelTab(payload.activeTab === "users" ? "map-ui" : payload.activeTab);
  }
  if (payload.welcomeScreen && typeof applyWelcomeScreenState === "function") {
    applyWelcomeScreenState(payload.welcomeScreen);
  }

  updateToggleSwatches();
  renderCityLabels();
  updateMapFeatureToolbar();
  renderUserViewDraftUi();
  refreshMaintenanceMapUi();
  resetUserBuilderHistory("Apply UI settings");
}

els.exportUiSettings.addEventListener("click", () => {
  downloadJson(UI_SETTINGS_EXPORT_NAME, getUiSettingsExportPayload());
});

els.saveUiSettingsToProject?.addEventListener("click", () => {
  saveProjectSettingsFile(UI_SETTINGS_EXPORT_NAME, getUiSettingsExportPayload(), "assets/files/settings/rv-map-ui-settings.json");
});

els.importUiSettings.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    applyUiSettingsState(await readJsonFile(file));
    els.status.textContent = `Imported ${file.name}`;
  } catch (error) {
    els.status.textContent = "UI settings import failed.";
  } finally {
    event.target.value = "";
  }
});

function saveAllCategoryInputs() {
  return [...(els.saveAllDialog?.querySelectorAll("[data-save-all-category]") || [])];
}

function selectedSaveAllCategories() {
  return new Set(saveAllCategoryInputs()
    .filter(input => input.checked)
    .map(input => input.dataset.saveAllCategory));
}

function closeSaveAllDialog() {
  if (!els.saveAllDialog) return;
  els.saveAllDialog.hidden = true;
  els.saveAllSettings?.focus();
}

function openSaveAllDialog() {
  if (!els.saveAllDialog) return;
  saveAllCategoryInputs().forEach(input => {
    input.checked = true;
  });
  els.saveAllDialog.hidden = false;
  els.saveAllOkay?.focus();
}

async function exportSaveAllCategories() {
  const categories = selectedSaveAllCategories();
  if (!categories.size) {
    els.status.textContent = "Choose at least one settings category to save.";
    return;
  }
  if (payload.welcomeScreen && typeof applyWelcomeScreenState === "function") {
    applyWelcomeScreenState(payload.welcomeScreen);
  }

  const files = {
    journeys: { name: JOURNEYS_EXPORT_NAME, payload: getJourneysExportPayload(), path: "trips/rv-map-journeys.json" },
    styles: { name: STYLE_EXPORT_NAME, payload: getStyleExportPayload(), path: "assets/files/styles/rv-map-styles.json" },
    ui: { name: UI_SETTINGS_EXPORT_NAME, payload: getUiSettingsExportPayload(), path: "assets/files/settings/rv-map-ui-settings.json" },
    textures: { name: TEXTURE_MANIFEST_EXPORT_NAME, payload: getTextureManifestExportPayload(), path: "assets/files/textures/rv-map-textures-manifest.json" }
  };
  const saved = [];
  for (const category of categories) {
    const file = files[category];
    if (!file) continue;
    const result = await saveJsonToChosenFile(file.name, file.payload);
    if (result.method === "cancelled") continue;
    saved.push(file.path);
  }
  updateProjectExportStatus();

  closeSaveAllDialog();
  els.status.textContent = saved.length
    ? `Exported ${saved.length} project settings file${saved.length === 1 ? "" : "s"}. Local changes remain pending publish.`
    : "No settings files were exported.";
}

els.saveAllSettings?.addEventListener("click", openSaveAllDialog);
els.saveAllSelectAll?.addEventListener("click", () => {
  saveAllCategoryInputs().forEach(input => {
    input.checked = true;
  });
});
els.saveAllSelectNone?.addEventListener("click", () => {
  saveAllCategoryInputs().forEach(input => {
    input.checked = false;
  });
});
els.saveAllCancel?.addEventListener("click", closeSaveAllDialog);
els.saveAllOkay?.addEventListener("click", exportSaveAllCategories);
els.exportAllSettings?.addEventListener("click", openSaveAllDialog);
els.saveAllDialog?.addEventListener("click", event => {
  if (event.target === els.saveAllDialog) {
    closeSaveAllDialog();
  }
});
els.saveAllDialog?.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeSaveAllDialog();
  }
});

els.publishSite?.addEventListener("click", openPublishDialog);
els.publishCancel?.addEventListener("click", closePublishDialog);
els.publishMethod?.addEventListener("change", () => {
  if (els.publishMethodNote) els.publishMethodNote.textContent = publishMethodDescription(els.publishMethod.value);
});
els.publishSaveConfiguration?.addEventListener("click", () => {
  (async () => {
    const published = await rvProjectSync?.publish?.();
    if (!published) {
      els.status.textContent = "Everything remains saved locally. GitHub publishing needs its Cloudflare secret configured.";
      return;
    }
    projectDirtyCategories.clear();
    updateProjectExportStatus();
    closePublishDialog();
    els.status.textContent = "Published to GitHub. Cloudflare Pages is deploying the updated site.";
  })();
});
els.publishDialog?.addEventListener("click", event => {
  if (event.target === els.publishDialog) closePublishDialog();
});
els.publishDialog?.addEventListener("keydown", event => {
  if (event.key === "Escape") closePublishDialog();
});

let activeStyleKey = "land";
let recentColors = loadStoredColors(RECENT_COLORS_KEY, MAX_RECENT_COLORS);
let savedColors = loadStoredColors(SAVED_COLORS_KEY, MAX_SAVED_COLORS);
let colorFieldPointerDown = false;
let colorFieldImage = null;
let robustColorPicker = null;
let robustColorPickerTarget = null;
let robustColorPickerValue = "#d9442e";

function ensureRobustColorPicker() {
  if (robustColorPicker) return robustColorPicker;
  const panel = document.createElement("div");
  panel.className = "robust-color-picker";
  panel.hidden = true;
  panel.innerHTML = `
    <div class="robust-color-picker-preview" aria-hidden="true"></div>
    <span class="robust-color-picker-label">Palette</span>
    <div class="robust-color-picker-swatches" data-picker-swatches="palette"></div>
    <canvas class="robust-color-picker-field" width="260" height="140" aria-label="Color spectrum"></canvas>
    <div class="robust-rgb-grid">
      <label><span>R</span><input class="robust-color-picker-r" type="range" min="0" max="255" step="1"><output>0</output></label>
      <label><span>G</span><input class="robust-color-picker-g" type="range" min="0" max="255" step="1"><output>0</output></label>
      <label><span>B</span><input class="robust-color-picker-b" type="range" min="0" max="255" step="1"><output>0</output></label>
    </div>
    <label class="robust-color-picker-native-row">
      <span>Color</span>
      <input class="robust-color-picker-native" type="color">
    </label>
    <label class="robust-color-picker-hex-row">
      <span>Hex</span>
      <input class="robust-color-picker-hex" type="text" maxlength="7" spellcheck="false">
    </label>
    <span class="robust-color-picker-label">Recent</span>
    <div class="robust-color-picker-swatches" data-picker-swatches="recent"></div>
    <span class="robust-color-picker-label">Favorites</span>
    <div class="robust-color-picker-swatches" data-picker-swatches="saved"></div>
    <div class="robust-color-picker-actions">
      <button class="robust-color-picker-eyedropper" type="button"><span class="material-symbols-rounded" aria-hidden="true">colorize</span><span>Eyedropper</span></button>
      <button class="robust-color-picker-cancel" type="button">Cancel</button>
      <button class="robust-color-picker-ok" type="button">OK</button>
    </div>
    <small class="robust-color-picker-status" role="status" aria-live="polite"></small>
  `;
  document.body.append(panel);
  const field = panel.querySelector(".robust-color-picker-field");
  const nativeInput = panel.querySelector(".robust-color-picker-native");
  const hexInput = panel.querySelector(".robust-color-picker-hex");
  const rgbInputs = [
    panel.querySelector(".robust-color-picker-r"),
    panel.querySelector(".robust-color-picker-g"),
    panel.querySelector(".robust-color-picker-b")
  ];
  const eyedropper = panel.querySelector(".robust-color-picker-eyedropper");
  const pickerStatus = panel.querySelector(".robust-color-picker-status");
  const cancel = panel.querySelector(".robust-color-picker-cancel");
  const ok = panel.querySelector(".robust-color-picker-ok");
  let fieldPointerDown = false;

  const renderSwatchSet = () => {
    const renderInto = (name, colors, saved = false) => {
      const container = panel.querySelector(`[data-picker-swatches="${name}"]`);
      if (!container) return;
      container.replaceChildren(...colors.map(color => {
        const normalized = normalizeHex(color);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "style-swatch";
        button.title = `${normalized || color}. Right-click to ${savedColors.includes(normalized) ? "remove from" : "add to"} favorites.`;
        button.style.setProperty("--swatch-color", normalized || color);
        button.classList.toggle("is-saved", saved || savedColors.includes(normalized));
        button.addEventListener("click", () => update(normalized || color));
        button.addEventListener("contextmenu", event => {
          event.preventDefault();
          if (normalized) {
            toggleSavedColor(normalized);
            renderSwatchSet();
          }
        });
        return button;
      }));
    };
    renderInto("palette", COLOR_SWATCHES);
    renderInto("recent", recentColors);
    renderInto("saved", savedColors, true);
  };

  const drawField = color => {
    const context = field.getContext("2d");
    const { width, height } = field;
    const hueGradient = context.createLinearGradient(0, 0, width, 0);
    for (let i = 0; i <= 360; i += 30) {
      hueGradient.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
    }
    context.fillStyle = hueGradient;
    context.fillRect(0, 0, width, height);
    const whiteGradient = context.createLinearGradient(0, 0, 0, height);
    whiteGradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    whiteGradient.addColorStop(0.48, "rgba(255, 255, 255, 0)");
    whiteGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = whiteGradient;
    context.fillRect(0, 0, width, height);
    const blackGradient = context.createLinearGradient(0, 0, 0, height);
    blackGradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    blackGradient.addColorStop(1, "rgba(0, 0, 0, 1)");
    context.fillStyle = blackGradient;
    context.fillRect(0, 0, width, height);
    const rgb = hexToRgb(color) || { r: 217, g: 68, b: 46 };
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    const chroma = max - min;
    let hue = 0;
    if (chroma > 0) {
      if (max === rgb.r) hue = ((rgb.g - rgb.b) / chroma) % 6;
      else if (max === rgb.g) hue = (rgb.b - rgb.r) / chroma + 2;
      else hue = (rgb.r - rgb.g) / chroma + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    const x = clamp((hue / 360) * width, 0, width);
    const y = clamp((1 - max / 255) * height, 0, height);
    context.beginPath();
    context.arc(x, y, 5, 0, Math.PI * 2);
    context.lineWidth = 2;
    context.strokeStyle = "#ffffff";
    context.stroke();
    context.lineWidth = 1;
    context.strokeStyle = "#25313d";
    context.stroke();
  };

  const update = (color, { syncRgb = true, syncField = true } = {}) => {
    const normalized = normalizeHex(color);
    if (!normalized) return;
    robustColorPickerValue = normalized;
    nativeInput.value = normalized;
    hexInput.value = normalized;
    panel.style.setProperty("--picker-color", normalized);
    const rgb = hexToRgb(normalized);
    if (rgb && syncRgb) {
      [rgb.r, rgb.g, rgb.b].forEach((value, index) => {
        rgbInputs[index].value = String(value);
        rgbInputs[index].nextElementSibling.textContent = String(value);
      });
    }
    if (syncField) drawField(normalized);
  };

  nativeInput.addEventListener("input", () => update(nativeInput.value));
  hexInput.addEventListener("input", () => {
    const normalized = normalizeHex(hexInput.value);
    if (normalized) update(normalized);
  });
  rgbInputs.forEach(input => {
    input.addEventListener("input", () => {
      const values = rgbInputs.map(item => clamp(Number(item.value), 0, 255));
      rgbInputs.forEach((item, index) => {
        item.nextElementSibling.textContent = String(values[index]);
      });
      update(rgbToHex(values[0], values[1], values[2]), { syncRgb: false });
    });
  });
  const pickFieldColor = event => {
    const rect = field.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    if (y <= 0.012) {
      update("#ffffff");
      return;
    }
    if (y >= 0.988) {
      update("#000000");
      return;
    }
    const hue = x * 360;
    const lightness = clamp(100 - y * 100, 0, 100);
    const saturation = clamp(100 - Math.max(0, y - 0.7) * 95, 28, 100);
    update(hslToHex(hue, saturation, lightness));
  };
  field.addEventListener("pointerdown", event => {
    fieldPointerDown = true;
    field.setPointerCapture?.(event.pointerId);
    pickFieldColor(event);
  });
  field.addEventListener("pointermove", event => {
    if (fieldPointerDown) pickFieldColor(event);
  });
  field.addEventListener("pointerup", () => {
    fieldPointerDown = false;
  });
  field.addEventListener("pointercancel", () => {
    fieldPointerDown = false;
  });
  // Chromium exposes EyeDropper directly. Other browsers still receive a
  // useful fallback through their native color chooser.
  eyedropper.disabled = false;
  const activateEyedropper = async () => {
    if (document.documentElement.classList.contains("is-page-color-sampling")) return;
    const EyeDropperApi = globalThis.EyeDropper;
    if (typeof EyeDropperApi !== "function") {
      pickerStatus.textContent = "Click a color anywhere on the page. Press Escape to cancel.";
      panel.style.visibility = "hidden";
      document.documentElement.classList.add("is-page-color-sampling");

      const cssColorToHex = value => {
        const normalized = normalizeHex(value);
        if (normalized) return normalized;
        const channels = String(value || "").match(/[\d.]+/g)?.slice(0, 3).map(Number);
        return channels?.length === 3 ? rgbToHex(channels[0], channels[1], channels[2]) : null;
      };
      const pixelFromCanvas = (canvas, clientX, clientY) => {
        try {
          const rect = canvas.getBoundingClientRect();
          const x = clamp(Math.floor((clientX - rect.left) / Math.max(1, rect.width) * canvas.width), 0, canvas.width - 1);
          const y = clamp(Math.floor((clientY - rect.top) / Math.max(1, rect.height) * canvas.height), 0, canvas.height - 1);
          const pixel = canvas.getContext("2d", { willReadFrequently: true })?.getImageData(x, y, 1, 1)?.data;
          return pixel && pixel[3] ? rgbToHex(pixel[0], pixel[1], pixel[2]) : null;
        } catch (error) {
          return null;
        }
      };
      const sampleElementColor = (target, clientX, clientY) => {
        if (!target) return null;
        if (target instanceof HTMLCanvasElement) return pixelFromCanvas(target, clientX, clientY);
        if (target instanceof HTMLImageElement && target.complete && target.naturalWidth) {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = target.naturalWidth;
            canvas.height = target.naturalHeight;
            canvas.getContext("2d").drawImage(target, 0, 0);
            const rect = target.getBoundingClientRect();
            const x = clamp(Math.floor((clientX - rect.left) / Math.max(1, rect.width) * canvas.width), 0, canvas.width - 1);
            const y = clamp(Math.floor((clientY - rect.top) / Math.max(1, rect.height) * canvas.height), 0, canvas.height - 1);
            const pixel = canvas.getContext("2d", { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
            if (pixel[3]) return rgbToHex(pixel[0], pixel[1], pixel[2]);
          } catch (error) {
            // Cross-origin map images cannot be sampled; use their surrounding style below.
          }
        }
        let node = target;
        for (let depth = 0; node && depth < 7; depth += 1, node = node.parentElement) {
          const attributeColor = node.getAttribute?.("fill") || node.getAttribute?.("stroke");
          if (attributeColor && attributeColor !== "none") {
            const parsed = cssColorToHex(attributeColor);
            if (parsed) return parsed;
          }
          const style = getComputedStyle(node);
          if (style.backgroundColor && style.backgroundColor !== "transparent" && !/^rgba?\(0[ ,]+0[ ,]+0(?:[ /,]+0(?:\.0+)?)?\)$/.test(style.backgroundColor)) {
            const parsed = cssColorToHex(style.backgroundColor);
            if (parsed) return parsed;
          }
          const parsedText = cssColorToHex(style.color);
          if (parsedText) return parsedText;
        }
        return null;
      };
      let sampleClickBlocker = null;
      const cleanupSampling = () => {
        document.removeEventListener("pointerdown", samplePage, true);
        document.removeEventListener("keydown", cancelSampling, true);
        if (sampleClickBlocker) document.removeEventListener("click", sampleClickBlocker, true);
        document.documentElement.classList.remove("is-page-color-sampling");
        panel.style.visibility = "";
      };
      const cancelSampling = event => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        cleanupSampling();
        pickerStatus.textContent = "Eyedropper canceled.";
      };
      const samplePage = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const sampled = sampleElementColor(target, event.clientX, event.clientY);
        document.removeEventListener("pointerdown", samplePage, true);
        document.removeEventListener("keydown", cancelSampling, true);
        let completed = false;
        const complete = () => {
          if (completed) return;
          completed = true;
          cleanupSampling();
          if (sampled) {
            update(sampled);
            pickerStatus.textContent = `Sampled ${sampled}.`;
          } else {
            pickerStatus.textContent = "That pixel cannot be read by this browser. Try a nearby UI color or the native color field.";
          }
        };
        sampleClickBlocker = clickEvent => {
          clickEvent.preventDefault();
          clickEvent.stopImmediatePropagation();
          complete();
        };
        document.addEventListener("click", sampleClickBlocker, true);
        window.setTimeout(complete, 400);
      };
      window.setTimeout(() => {
        document.addEventListener("pointerdown", samplePage, true);
        document.addEventListener("keydown", cancelSampling, true);
      }, 0);
      return;
    }
    try {
      const result = await new EyeDropperApi().open();
      update(result.sRGBHex);
    } catch (error) {
      // The user can cancel the eyedropper without changing the pending color.
    }
  };
  eyedropper.addEventListener("click", activateEyedropper);
  eyedropper.addEventListener("pointerdown", event => {
    if (typeof globalThis.EyeDropper === "function") return;
    event.preventDefault();
    event.stopPropagation();
    activateEyedropper();
  }, true);
  panel.activateEyedropper = activateEyedropper;
  cancel.addEventListener("click", closeRobustColorPicker);
  ok.addEventListener("click", commitRobustColorPicker);
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeRobustColorPicker();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commitRobustColorPicker();
    }
  });
  panel.renderSwatches = renderSwatchSet;
  panel.updateColor = update;
  robustColorPicker = panel;
  return panel;
}

function openRobustColorPicker(target, x, y) {
  const panel = ensureRobustColorPicker();
  robustColorPickerTarget = target;
  const current = normalizeHex(target.value) || "#d9442e";
  robustColorPickerValue = current;
  panel.renderSwatches?.();
  panel.updateColor?.(current);
  panel.hidden = false;
  placePopup(panel, x, y);
  panel.querySelector(".robust-color-picker-hex").focus({ preventScroll: true });
}

function closeRobustColorPicker() {
  if (!robustColorPicker) return;
  robustColorPicker.hidden = true;
  robustColorPickerTarget = null;
}

function commitRobustColorPicker() {
  const target = robustColorPickerTarget;
  const color = normalizeHex(robustColorPickerValue);
  if (!target || !color) {
    closeRobustColorPicker();
    return;
  }
  target.value = color;
  rememberRecentColor(color);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  closeRobustColorPicker();
}

function shouldUseRobustColorPicker(target) {
  return target instanceof HTMLInputElement
    && target.type === "color"
    && !target.closest(".robust-color-picker");
}

document.addEventListener("pointerdown", event => {
  if (!shouldUseRobustColorPicker(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  openRobustColorPicker(event.target, event.clientX, event.clientY);
}, true);

document.addEventListener("click", event => {
  if (!shouldUseRobustColorPicker(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
}, true);

document.addEventListener("keydown", event => {
  if (!shouldUseRobustColorPicker(event.target) || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  const rect = event.target.getBoundingClientRect();
  openRobustColorPicker(event.target, rect.left, rect.bottom + 6);
}, true);

registerDismissiblePopup({
  isOpen: () => Boolean(robustColorPicker && !robustColorPicker.hidden),
  contains: event => document.documentElement.classList.contains("is-page-color-sampling")
    || event.target === robustColorPickerTarget
    || Boolean(robustColorPicker?.contains(event.target)),
  dismiss: closeRobustColorPicker,
  capture: true,
  escape: false
});

const activateDelegatedRobustEyedropper = event => {
  if (!event.target.closest?.(".robust-color-picker-eyedropper")) return;
  event.preventDefault();
  event.stopPropagation();
  robustColorPicker?.activateEyedropper?.();
};
document.addEventListener("pointerdown", activateDelegatedRobustEyedropper, true);
document.addEventListener("click", activateDelegatedRobustEyedropper, true);

function hexToHsl(hex) {
  const normalized = normalizeHex(hex) || "#d9442e";
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  let hue = 0;
  let saturation = 0;

  if (delta) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    if (max === g) hue = 60 * ((b - r) / delta + 2);
    if (max === b) hue = 60 * ((r - g) / delta + 4);
  }

  return {
    h: Math.round((hue + 360) % 360),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  };
}

function hslToHex(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lightness - chroma / 2;
  const [r1, g1, b1] = h < 60 ? [chroma, x, 0]
    : h < 120 ? [x, chroma, 0]
    : h < 180 ? [0, chroma, x]
    : h < 240 ? [0, x, chroma]
    : h < 300 ? [x, 0, chroma]
    : [chroma, 0, x];
  const toHex = value => Math.round((value + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function rgbDistance(colorA, colorB) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function trademarkColorMatch(color) {
  return TRADEMARK_ASSOCIATED_COLORS.find(candidate => rgbDistance(color, candidate.color) <= TRADEMARK_COLOR_DISTANCE) || null;
}

function loadStoredColors(key, maxColors) {
  const colors = rvStorageReadJson(key, []);
  if (!Array.isArray(colors)) return [];
  return colors.map(normalizeHex).filter(Boolean).slice(0, maxColors);
}

function storeColors(key, colors) {
  rvStorageWriteJson(key, colors);
}

function rememberRecentColor(color) {
  const normalized = normalizeHex(color);
  if (!normalized) return;
  recentColors = [normalized, ...recentColors.filter(item => item !== normalized)].slice(0, MAX_RECENT_COLORS);
  storeColors(RECENT_COLORS_KEY, recentColors);
  renderColorCollections();
}

function toggleSavedColor(color) {
  const normalized = normalizeHex(color);
  if (!normalized) return;
  if (savedColors.includes(normalized)) {
    savedColors = savedColors.filter(item => item !== normalized);
  } else {
    savedColors = [normalized, ...savedColors].slice(0, MAX_SAVED_COLORS);
  }
  storeColors(SAVED_COLORS_KEY, savedColors);
  renderColorCollections();
}

function syncRgbControlsFromColor(hex) {
  const rgb = hexToRgb(hex);
  els.styleRed.value = rgb.r;
  els.styleGreen.value = rgb.g;
  els.styleBlue.value = rgb.b;
}

function syncColorFieldFromColor(hex) {
  drawColorField(hex);
}

function loadPickerColor(hex, syncControls = true) {
  const normalized = normalizeHex(hex);
  if (!normalized) return;
  pickerColor = normalized;
  els.styleHex.value = normalized;
  els.stylePreview.style.setProperty("--picked-color", normalized);
  updateTexturePreviewColor();

  if (syncControls) {
    syncRgbControlsFromColor(normalized);
    syncColorFieldFromColor(normalized);
  }
  updateTrademarkColorWarning(normalized);
}

function commitPickerColor(hex, syncControls = true) {
  const normalized = normalizeHex(hex);
  if (!normalized) return;
  if (mapThemeMode === "provider") {
    ensureThemeEditableRenderer();
  }
  loadPickerColor(normalized, syncControls);
  if (!activeStyleKey || !layerStyles[activeStyleKey]) return;
  layerStyles[activeStyleKey].color = normalized;
  updateTrademarkColorWarning(normalized);
  scheduleStyledLayerRefresh();
}

function setPickerColor(hex, syncControls = true) {
  commitPickerColor(hex, syncControls);
}

function drawColorField(selectedColor = layerStyles[activeStyleKey]?.color || "#d9442e") {
  const canvas = els.styleColorField;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const selectedHsl = hexToHsl(selectedColor);
  if (!colorFieldImage) {
    colorFieldImage = context.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const lightness = 100 - y / Math.max(1, height - 1) * 100;
      for (let x = 0; x < width; x += 1) {
        const hue = x / Math.max(1, width - 1) * 360;
        const color = hslToHex(hue, 78, lightness);
        const offset = (y * width + x) * 4;
        colorFieldImage.data[offset] = parseInt(color.slice(1, 3), 16);
        colorFieldImage.data[offset + 1] = parseInt(color.slice(3, 5), 16);
        colorFieldImage.data[offset + 2] = parseInt(color.slice(5, 7), 16);
        colorFieldImage.data[offset + 3] = 255;
      }
    }
  }

  context.putImageData(colorFieldImage, 0, 0);
  const markerX = selectedHsl.h / 360 * width;
  const markerY = (100 - clamp(selectedHsl.l, 0, 100)) / 100 * height;
  context.beginPath();
  context.arc(clamp(markerX, 7, width - 7), clamp(markerY, 7, height - 7), 6, 0, Math.PI * 2);
  context.lineWidth = 3;
  context.strokeStyle = "#ffffff";
  context.stroke();
  context.lineWidth = 1;
  context.strokeStyle = "#1f2933";
  context.stroke();
}

function pickColorField(event) {
  const rect = els.styleColorField.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, rect.width);
  const y = clamp(event.clientY - rect.top, 0, rect.height);
  const relativeY = y / Math.max(1, rect.height);
  const color = relativeY <= 0.012
    ? "#ffffff"
    : relativeY >= 0.988
      ? "#000000"
      : hslToHex(
          x / Math.max(1, rect.width) * 360,
          78,
          100 - relativeY * 100
        );
  commitPickerColor(color);
  if (activeStyleKey === "topography" || activeStyleKey === "faintTopography") {
    els.styleTopoLowColor.value = color;
  }
}

function updateTrademarkColorWarning(color) {
  const match = trademarkColorMatch(color);
  els.styleColorWarning.hidden = !match;
  els.styleColorWarningText.textContent = match
    ? `Potential trademark-associated color: ${match.name}. Colors are not copyrighted, but brand use can be restricted.`
    : "";
}

function applyTopographyRampControls() {
  if (activeStyleKey !== "topography" && activeStyleKey !== "faintTopography") return;
  layerStyles[activeStyleKey].color = els.styleTopoLowColor.value;
  layerStyles[activeStyleKey].colorHigh = els.styleTopoHighColor.value;
  setPickerColor(els.styleTopoLowColor.value);
}

function selectStyleLayer(key) {
  const providerStyles = mapThemeMode === "provider" ? mapLibreStyleToRouteTheme(activeMapLibreStyle()).styles : null;
  const style = providerStyles?.[key] || layerStyles[key];
  if (!style) return;
  const texture = styleTexture(key);
  activeStyleKey = key;
  els.styleLayerSelect.value = key;
  document.querySelectorAll("#styleLayerVisualPicker [data-style-layer-key]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.styleLayerKey === key);
  });
  loadPickerColor(style.color);
  els.styleOpacity.value = String(styleOpacity(key));
  els.styleBlend.value = styleBlend(key);
  const usesTexture = usesTextureSizeControl(key);
  const isDayZoneFill = key === "dayZoneFill";
  const isDayZoneStroke = key === "dayZoneStroke";
  const isTextStyle = isTextStyleLayer(key);
  const isTopoStyle = key === "topography" || key === "faintTopography";
  els.styleSizeSection.hidden = isDayZoneFill || usesTexture;
  els.styleSizeLabel.textContent = key === "topography" || key === "faintTopography"
    ? (mapLibreBasemapEnabled() ? "Contour Width" : "Relief Strength")
    : isTextStyle ? "Font Size" : "Stroke Width";
  els.styleTextSection.hidden = !isTextStyle;
  if (isTextStyle) {
    els.styleTypeface.value = textTypeface(style.font).value;
    els.styleFontWeight.value = String(styleFontWeight(key));
    updateTypefaceSelectPreview(els.styleTypeface);
  }
  els.styleTextureSection.hidden = !usesTexture;
  els.styleSecondaryTextureSection.hidden = !usesTexture;
  refreshTextureControlHonesty(key);
  if (!usesTextureSizeControl(key)) {
    els.styleSize.min = style.min;
    // The Leaflet fallback interprets this as hillshade strength, which has a
    // useful physical range of 0–1.  The broader range is specifically for
    // MapLibre's contour-width renderer.
    els.styleSize.max = isTopoStyle && !mapLibreBasemapEnabled()
      ? Math.min(style.max, 1)
      : style.max;
    els.styleSize.step = 0.25;
    els.styleSize.value = style.size;
  }
  els.styleTextureType.value = texture.type;
  if (els.styleTextureEnabled) els.styleTextureEnabled.checked = texture.enabled !== false && texture.type !== "none";
  els.styleTextureSize.value = texture.scale || DEFAULT_LAYER_TEXTURE.scale;
  els.styleTextureOpacity.value = texture.opacity;
  els.styleTextureBlend.value = texture.blend;
  if (els.styleTextureBlendEnabled) els.styleTextureBlendEnabled.checked = texture.blend !== "normal";
  els.styleTextureBlendAmount.value = texture.blendAmount;
  const isDayZoneStyle = isDayZoneFill || isDayZoneStroke;
  els.topographyColorSection.hidden = !isTopoStyle;
  els.topographyMapLibreNote.hidden = !isTopoStyle || !mapLibreBasemapEnabled();
  els.styleBlendRow.hidden = isTopoStyle && mapLibreBasemapEnabled();
  els.styleLineSection.hidden = !isDayZoneStyle;
  if (isDayZoneStyle) {
    els.styleLineSection.open = true;
    els.styleZoneSectionTitle.textContent = "Day Zone Settings";
    [els.styleDashLockRow, els.styleDashLengthRow, els.styleDashGapRow]
      .forEach(row => { row.hidden = !isDayZoneStroke; });
    if (isDayZoneStroke) {
      els.styleLockDashPattern.checked = Boolean(style.dashLocked);
      els.styleDashLength.value = String(style.dashLength);
      els.styleDashGap.value = String(style.dashGap);
    }
  }
  if (isTopoStyle) {
    els.styleTopoLowColor.value = style.color;
    els.styleTopoHighColor.value = styleHighColor(key);
  }
  els.styleSecondaryTextureEnabled.checked = Boolean(texture.secondaryEnabled && texture.secondaryType !== "none");
  els.styleSecondaryTextureSection.hidden = !usesTexture;
  els.styleSecondaryTextureSection.open = Boolean(texture.secondaryEnabled && texture.secondaryType !== "none");
  els.styleSecondaryTextureType.value = texture.secondaryType;
  els.styleSecondaryTextureSize.value = texture.secondaryScale || texture.scale || DEFAULT_LAYER_TEXTURE.scale;
  els.styleSecondaryTextureOpacity.value = texture.secondaryOpacity;
  els.styleSecondaryTextureBlend.value = texture.secondaryBlend;
  renderSecondaryTextureOptions();
  updateTextureChoiceSelection();
  document.querySelectorAll(".element-control[data-style-key]").forEach(control => {
    const selected = control.dataset.styleKey === key;
    control.classList.toggle("is-selected", selected);
    control.querySelector(".element-select-button")?.setAttribute("aria-pressed", String(selected));
  });
}

function positionStylePanel(x, y) {
  if (els.stylePanel.classList.contains("inline-style-panel")) {
    els.stylePanel.hidden = false;
    return;
  }
  els.stylePanel.hidden = false;
  const panelRect = els.stylePanel.getBoundingClientRect();
  els.stylePanel.style.left = "";
  els.stylePanel.style.top = `${Math.max(12, Math.min(y, window.innerHeight - panelRect.height - 12))}px`;
}

function mountInlineStyleEditor() {
  if (!els.elementsStyleDrawer || !els.stylePanel) return;
  els.elementsStyleDrawer.append(els.stylePanel);
  els.stylePanel.classList.add("inline-style-panel");
  els.stylePanel.hidden = false;
  els.elementsStyleDrawer.hidden = activePanelTabId() !== "elements";
}

const ELEMENT_HELP = {
  route: "The main line showing the selected day's travel route.",
  faintRoute: "A lighter route line used for days that are not currently selected.",
  startEnd: "The markers showing where a day's route begins and ends.",
  land: "The background color and texture used for land.",
  water: "The background color and texture used for oceans, lakes, and rivers.",
  parks: "Parks, forests, grass, recreation areas, cemeteries, golf courses, and reserves.",
  buildings: "Building fills and outlines in detailed basemap views.",
  texture: "An extra paper or surface texture placed across the map.",
  highways: "Motorways and trunk roads.",
  majorRoads: "Primary, secondary, and tertiary roads.",
  minorRoads: "Residential, service, unclassified roads, paths, and trails.",
  railroads: "Rail, subway, and tram lines.",
  streets: "Legacy alias for major roads.",
  faintStreets: "Legacy alias for minor roads.",
  smallTowns: "Labels for smaller towns. These appear only when the map is close enough.",
  cities: "Labels for larger cities.",
  capitols: "Labels for capitals and major administrative centers.",
  pois: "Points of interest such as airports, museums, attractions, hospitals, and park labels.",
  countryBorders: "International border lines.",
  stateBorders: "State and province border lines.",
  countyBorders: "County and local administrative border lines.",
  stateLines: "Legacy alias for state borders.",
  faintStateLines: "Legacy alias for county borders.",
  topography: "Contour/elevation lines. Adjust color, opacity, and stroke width from the style panel.",
  faintTopography: "Contour labels. Adjust label color and opacity from the style panel.",
  dayZoneFill: "The shaded area inside each day's overview box.",
  dayZoneStroke: "The border around each day's overview box."
};

function initializeHelpfulTooltips() {
  const tooltip = document.createElement("div");
  tooltip.id = "helpTooltip";
  tooltip.className = "help-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);
  const placementInput = document.querySelector("#helpTooltipPlacement");
  const colorInput = document.querySelector("#helpTooltipColor");
  const fontColorInput = document.querySelector("#helpTooltipFontColor");
  const matchInput = document.querySelector("#helpTooltipMatch");
  const strokeColorInput = document.querySelector("#helpTooltipStrokeColor");
  const strokeWidthInput = document.querySelector("#helpTooltipStrokeWidth");
  const strokeWidthValue = document.querySelector("#helpTooltipStrokeWidthValue");
  const radiusInput = document.querySelector("#helpTooltipRadius");
  const radiusValue = document.querySelector("#helpTooltipRadiusValue");
  const glowInput = document.querySelector("#helpTooltipGlow");
  let tooltipSettings = rvStorageReadJson(HELP_TOOLTIP_SETTINGS_KEY, {}) || {};
  const applyTooltipTheme = (target = null) => {
    const color = /^#[0-9a-f]{6}$/i.test(tooltipSettings.color || "") ? tooltipSettings.color : "#48c8ff";
    const matchesTarget = tooltipSettings.match === true && target;
    const targetStyle = matchesTarget ? getComputedStyle(target) : null;
    const background = targetStyle?.backgroundColor && targetStyle.backgroundColor !== "rgba(0, 0, 0, 0)" ? targetStyle.backgroundColor : color;
    const text = targetStyle?.color || "";
    tooltip.style.setProperty("--help-tooltip-color", background);
    const rgb = color.match(/[a-f\d]{2}/gi).map(value => Number.parseInt(value, 16));
    const luminance = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    const fontColor = /^#[0-9a-f]{6}$/i.test(tooltipSettings.fontColor || "") ? tooltipSettings.fontColor : (luminance > 150 ? "#071923" : "#f7fbfc");
    tooltip.style.setProperty("--help-tooltip-text", matchesTarget && text ? text : fontColor);
    const strokeColor = /^#[0-9a-f]{6}$/i.test(tooltipSettings.strokeColor || "") ? tooltipSettings.strokeColor : "#087eae";
    const strokeWidth = clamp(Number(tooltipSettings.strokeWidth ?? 2), 0, 6);
    const radius = clamp(Number(tooltipSettings.radius ?? 9), 0, 18);
    tooltip.style.setProperty("--help-tooltip-stroke-color", matchesTarget ? background : strokeColor);
    tooltip.style.setProperty("--help-tooltip-stroke-width", `${strokeWidth}px`);
    tooltip.style.setProperty("--help-tooltip-radius", `${radius}px`);
    tooltip.style.setProperty("--help-tooltip-glow", tooltipSettings.glow && strokeWidth ? `0 0 ${strokeWidth * 3}px ${strokeWidth}px ${matchesTarget ? background : strokeColor}` : "0 0 transparent");
    if (placementInput) placementInput.value = tooltipSettings.placement || "map-closest";
    if (colorInput) colorInput.value = color;
    if (fontColorInput) fontColorInput.value = fontColor;
    if (matchInput) matchInput.checked = tooltipSettings.match === true;
    if (strokeColorInput) strokeColorInput.value = strokeColor;
    if (strokeWidthInput) strokeWidthInput.value = String(strokeWidth);
    if (strokeWidthValue) strokeWidthValue.textContent = `${strokeWidth}px`;
    if (radiusInput) radiusInput.value = String(radius);
    if (radiusValue) radiusValue.textContent = `${radius}px`;
    if (glowInput) glowInput.checked = tooltipSettings.glow === true;
    document.querySelector(".tooltip-color-row")?.classList.toggle("is-matching", tooltipSettings.match === true);
  };
  const saveTooltipSettings = () => {
    tooltipSettings = {
      placement: placementInput?.value || "map-closest", color: colorInput?.value || "#48c8ff", fontColor: fontColorInput?.value || "#071923",
      match: matchInput?.checked === true, strokeColor: strokeColorInput?.value || "#087eae",
      strokeWidth: Number(strokeWidthInput?.value) || 0, radius: Number(radiusInput?.value) || 0,
      glow: glowInput?.checked === true
    };
    rvStorageWriteJson(HELP_TOOLTIP_SETTINGS_KEY, tooltipSettings);
    applyTooltipTheme();
  };
  placementInput?.addEventListener("change", saveTooltipSettings);
  colorInput?.addEventListener("input", saveTooltipSettings);
  fontColorInput?.addEventListener("input", saveTooltipSettings);
  matchInput?.addEventListener("change", saveTooltipSettings);
  strokeColorInput?.addEventListener("input", saveTooltipSettings);
  strokeWidthInput?.addEventListener("input", saveTooltipSettings);
  radiusInput?.addEventListener("input", saveTooltipSettings);
  glowInput?.addEventListener("change", saveTooltipSettings);
  applyTooltipTheme();

  const fallbackHelpText = element => {
    const explicit = element.getAttribute("aria-label") || element.getAttribute("placeholder") || "";
    const labelCaption = element.matches("label")
      ? element.querySelector(":scope > span, :scope > .field-label-inline > label")?.textContent?.trim().replace(/\s+/g, " ")
      : element.closest("label")?.querySelector(":scope > span, :scope > .field-label-inline > label")?.textContent?.trim().replace(/\s+/g, " ") || "";
    const text = element.textContent?.trim().replace(/\s+/g, " ") || "";
    if (element.matches("button")) return explicit || (text ? `Activate ${text}.` : "");
    if (element.matches("select")) return explicit || (labelCaption ? `Changes ${labelCaption}.` : "Choose an option.");
    if (element.matches("input[type='checkbox']")) return explicit || "Turn this option on or off.";
    if (element.matches("input[type='range']")) return explicit || "Drag to adjust this value.";
    if (element.matches("input, textarea")) return explicit || "Enter a value.";
    if (element.matches("label")) return labelCaption ? `Adjust ${labelCaption}.` : text ? `Adjust ${text}.` : "";
    return explicit || text;
  };

  const helpBySelector = {
    "#tabMapUi": "Route display controls for viewing journeys and adjusting route behavior.",
    "#tabElements": "Theme controls for map parts, colors, textures, and saved styles.",
    "#tabTrips": "Manage journeys, route days, pictures, videos, audio, and written notes.",
    "#usersLayoutDrawToggle": "Turn gesture drawing on or off. Drag horizontally or vertically for a divider, or far enough in both directions for a section.",
    "#usersLayoutDeleteSelected": "Remove the selected section, subsection, or divider.",
    "#allowPan": "Allows the map to be moved by dragging. Leave this off to keep the map in place.",
    "#allowZoom": "Allows wheel, pinch, and double-click zooming. Leave this off to prevent accidental zooming.",
    "#animateOverviewRoutes": "When the pointer rests over a day, its route draws across the map.",
    "#overviewRouteAnimationTime": "Controls how quickly a hovered route draws.",
    "#routePlaybackSpeed": "Controls the moving icon and route reveal speed when using Previous and Next in zoomed day view.",
    "#overviewDeadZone": "Shrinks the clickable area inside each day box. Move right to require the pointer to be nearer the center before that day activates.",
    "#overviewZoneSize": "Changes the default padding around each route's start, middle, and end when drawing overview day zones.",
    "#zoneDisplayType": "Switches overview zones between box-shaped areas and route-following bands. Each mode keeps its own settings.",
    "#routeZoneSize": "Controls the full width of route-mode day zones around each route line. This changes the hover/zone band, not the visible route stroke.",
    "#routeZoneOffset": "Moves route-mode day zones to one side of the route without changing the route itself.",
    "#modifyZonesByDay": "Opens per-day zone size and offset controls. Choose a day in overview mode, then adjust only that day's box.",
    "#dayZoneShape": "Changes the selected day's rectangle-mode zone shape.",
    "#dayZoneVerticalSize": "Scales the selected day's zone taller or shorter.",
    "#dayZoneHorizontalSize": "Scales the selected day's zone wider or narrower.",
    "#dayZoneVerticalOffset": "Moves the selected day's zone up or down without changing the route.",
    "#dayZoneHorizontalOffset": "Moves the selected day's zone left or right without changing the route.",
    "#zoneDefaultsFromTrip": "Copies the current trip's zone defaults onto every day in this trip.",
    "#zoneDefaultsFromFile": "Resets this trip's zone settings to the built-in file defaults.",
    "#markerShape": "Changes the shape used for route start and end markers.",
    "#markerSize": "Changes the default marker size from 0 to 100. Set to 0 to hide markers; 40 matches the standard size.",
    "#markerPreview": "Right-click to upload the marker image used before or instead of a landmark image.",
    "#markerImageUpload": "Hidden file picker for marker images. Right-click the marker preview to upload.",
    "#markerImageRecent": "Chooses a recently uploaded image for town/start-end markers, or keeps the default marker. Right-click to upload a new image.",
    "#markerImageDisplay": "Controls whether the whole marker, including image, shape, fill, and strokes, shows before a stop is reached, after it is reached, always, or never.",
    "#markerImageSize": "Resizes only the uploaded marker image layer.",
    "#markerShapeSize": "Resizes only the marker shape/backdrop layer.",
    "#markerFillColor": "Changes the marker fill color.",
    "#markerFillEnabled": "Turns the marker fill on or off while keeping strokes available.",
    "#markerStrokeList": "Lists marker strokes from inside to outside. Drag a row handle to change the order.",
    "#addMarkerStroke": "Adds another outer marker stroke to the stroke stack.",
    "#markerImageStrokeList": "Lists strokes around the uploaded marker image. These are separate from shape strokes.",
    "#addMarkerImageStroke": "Adds another stroke around the uploaded marker image.",
    "#routeAnimationIconEnabled": "Shows a moving icon at the front of an animated route reveal or zoomed day playback.",
    "#routeAnimationIconHideAtTown": "Chooses whether the moving icon temporarily hides the town marker, landmark, both, or neither while it is on that stop.",
    "#routeAnimationIconPreview": "Right-click to upload a logo, truck, RV, or other image for the moving route icon.",
    "#routeAnimationIconUpload": "Hidden file picker for route animation icons. Right-click the icon preview to upload.",
    "#routeAnimationIconRecent": "Chooses from recently uploaded route animation icons, or uses the default arrow. Right-click to upload a new icon.",
    "#exportRouteAnimationIcon": "Exports the selected upload as a transparent 256px PNG that is ready to save in assets/icons or upload to Cloudflare.",
    "#routeAnimationIconSize": "Changes the whole moving icon size from hidden at 0 to large at 100.",
    "#routeAnimationIconImageSize": "Resizes only the uploaded image inside the moving icon.",
    "#routeAnimationIconShapeSize": "Resizes only the marker-shaped layer behind or around the moving icon.",
    "#routeAnimationIconBackgroundEnabled": "Shows the separate marker-shaped layer for the moving icon.",
    "#routeAnimationIconBackgroundShape": "Chooses the shape used by the moving icon's shape layer.",
    "#routeAnimationIconBackgroundFill": "Changes the fill color of the moving icon backdrop.",
    "#routeAnimationIconFillMode": "Chooses whether the moving icon uses a marker-shaped fill, no fill or strokes, or a fill fitted to the uploaded image opacity.",
    "#routeAnimationIconFillEnabled": "Turns the moving icon backdrop fill on or off while keeping strokes available.",
    "#routeAnimationIconStrokeList": "Lists strokes for the moving icon shape layer.",
    "#addRouteAnimationIconStroke": "Adds another stroke to the moving icon shape layer.",
    "#routeAnimationIconImageStrokeList": "Lists strokes around the uploaded PNG's visible pixels. Transparent pixels are ignored.",
    "#addRouteAnimationIconImageStroke": "Adds a stroke around the uploaded PNG image only, following its transparency edge.",
    "#textureScaleWithMap": "Chooses whether textures grow with the map or stay the same size on the screen.",
    "#toggleAllOn": "Shows every map element.",
    "#toggleAllOff": "Hides every optional map element.",
    "#openRouteThemePicker": "Opens the saved map themes.",
    "#updateCurrentTheme": "Replaces the current theme with the changes shown now.",
    "#saveCurrentThemeQuick": "Saves these settings as a new theme.",
    "#styleSize": "Changes line width or font size depending on the selected map element.",
    "#showRouteWaypoints": "Shows editing-only waypoint pins for the selected day. These pins are hidden for normal map viewing.",
    "#styleTextureEnabled": "Turns the selected layer's texture on or off without losing the texture settings.",
    "#styleTextureSize": "Changes the primary texture size. When combined with a secondary texture, export uses the nearest compatible repeat.",
    "#styleSecondaryTextureSize": "Changes the secondary texture size. The compatibility score shows how large the shared repeat tile becomes.",
    "#textureCompatibilityScore": "Shows the largest side of the combined repeat tile for the current texture pair, capped at 2000px.",
    "#updateTextureCompatibility": "Recalculates the compatibility score for the currently selected texture pair.",
    "#exportCombinedTexture": "Exports the current primary and secondary texture setup as one smallest-repeat PNG tile. Choose Land, Water, or Texture to show this control.",
    "#styleTypeface": "Changes the typeface used for selected town, city, or capital labels.",
    "#styleFontWeight": "Changes how light or bold the selected map labels appear.",
    "#styleColorField": "Choose a color by clicking or dragging within this color area.",
    "#styleLockDashPattern": "Keeps the dash length and the empty gap at the same value.",
    "#styleDashLength": "Controls how long each visible part of the dashed border is.",
    "#styleDashGap": "Controls the empty space between parts of the dashed border.",
    "#styleOpacity": "Controls how solid or transparent the selected map element is.",
    "#styleBlend": "Changes how the selected element's color mixes with the map underneath it.",
    "#journeyViewAll": "Edits the current journey name.",
    "#topTripSelect": "Placeholder trip selector for the higher-level trip group. Trip 1 contains the current journeys.",
    "#newTripName": "Enter a name for a new journey.",
    "#newDaySequence": "When on, the day name is generated from the trip's day-name format and updates when days are reordered.",
    "#selectedRouteColor": "Color for the selected or hovered route segment.",
    "#precedingRouteColor": "Color for route segments before the selected segment.",
    "#followingRouteColor": "Color for route segments after the selected segment.",
    "#routeFillColor": "Solid fill color used by the route that is actively animating in.",
    "#enableMapLibre": "Uses a normal OSM-derived tiled road map under the route so roads, land, and water stay aligned at every zoom.",
    "#downloadRoadPackage": "Downloads the road package manifest plus GeoJSON road files for the selected journey.",
    "#downloadRoadPackageElements": "Downloads all road files needed by the selected journey.",
    "#downloadRoadPackageTrips": "Downloads all road files needed by the selected journey.",
    "#chooseRoadFolder": "Choose the folder containing local PMTiles or road GeoJSON files.",
    "#roadFolderStatus": "Shows whether project-local PMTiles road files are available.",
    "#addTrip": "Adds the new journey after a name has been entered.",
    "#exportTrips": "Opens a chooser so you can export all journeys or selected journeys as KML or full-fidelity JSON.",
    "#importTrips": "Imports journeys from a JSON file and adds them to the current journeys.",
    "#restoreTripsBackup": "Restores the most recent automatic journey backup from this browser.",
    "#deleteTrip": "Deletes the currently selected journey.",
    "#tripSelect": "Chooses which journey is active.",
    "#newDayLabel": "Names the next route day you add.",
    "#newDayRestDay": "Creates a zero-mile day at the previous moving day's destination, or at a new destination when starting somewhere new.",
    "#routeStartAddress": "Starting address, town, or place for the new route day.",
    "#routeEndAddress": "Destination address, town, place, or rest-day location.",
    "#createAddressRoute": "Finds a driving route between the starting location and destination.",
    "#tripRouteInput": "Adds one or more GPX, KML, or JSON route days to the current journey.",
    "#editDayLabel": "Renames the selected route day.",
    "#editDaySequenceNumber": "Sets the generated number anchor for this selected day. Use Auto, blank, or 0 to follow normal order.",
    "#editDaySequenceDate": "Sets the generated date anchor for this selected day. Following generated days continue from this date.",
    "#editDaySummary": "Changes the description shown for the selected route day.",
    "#saveDayDetails": "Saves the selected day's name, generated numbering/date anchors, and description.",
    "#editDayRoute": "Opens controls for changing the selected day's route.",
    "#editDayRestDay": "Changes this entry between a moving route and a zero-mile stay.",
    "#deleteDay": "Deletes the selected route day.",
    "#tripMediaInput": "Adds pictures, video, or audio to the selected route day.",
    "#manualMediaOrder": "Turn this on to arrange media yourself. Leave it off to order media from route start to route end.",
    "#landmarksEnabled": "Shows landmark images at each stop on the journey. When visible, landmarks override normal marker images.",
    "#landmarkImageDisplay": "Controls whether landmark images always show, show only after the stop is reached, or never show.",
    "#landmarkGrid": "Click a stop tile to edit that landmark. Right-click a tile to upload an image for that town.",
    "#landmarkSize": "Changes the overall landmark marker size from hidden at 0 to large at 100.",
    "#landmarkImageSize": "Resizes only the uploaded landmark image layer.",
    "#landmarkShapeSize": "Resizes only the landmark shape layer.",
    "#landmarkShapeEnabled": "Shows or hides the marker-shaped layer behind the landmark image.",
    "#landmarkShape": "Chooses the shape used by the landmark marker layer.",
    "#landmarkFillColor": "Changes the landmark shape fill color.",
    "#landmarkFillMode": "Chooses whether the landmark uses a shape fill, a fill fitted to the image, or no fill/strokes.",
    "#landmarkImageStrokeList": "Lists strokes around the landmark image. Transparent pixels are ignored.",
    "#addLandmarkImageStroke": "Adds another stroke around the landmark image only.",
    "#landmarkStrokeList": "Lists strokes around the landmark shape layer.",
    "#addLandmarkStroke": "Adds another stroke around the landmark shape layer.",
    "#landmarkSettingsScope": "Chooses whether the controls edit this journey's landmarks or the saved default for new journeys.",
    "#saveLandmarkDefault": "Saves the current journey landmark settings as the default.",
    "#applyLandmarkDefault": "Copies the saved default landmark settings into this journey.",
    "#applyLandmarkDefaultSizing": "Copies only the saved default landmark size and stroke widths to every landmark.",
    "#useDefaultLandmarkForAll": "Uses the saved default landmark image and style for every stop, while still following the image display rule.",
    "#landmarkPerStopShapes": "Allows individual stops to use a different landmark shape while keeping the same shared style.",
    "#landmarkShapeStop": "Chooses which stop's landmark shape to edit.",
    "#landmarkStopShape": "Sets the shape override for the selected landmark stop.",
    "#keyboardOnlyToggle": "Shows keyboard-friendly controls and tab stops.",
    "#usView": "Moves between the current journey overview and the all-journey US overview.",
    "#resetView": "Resets the map view and panel layout controls.",
    "#zoomIn": "Zoom in. Right click to toggle zoom locking.",
    "#zoomOut": "Zoom out. Right click to toggle zoom locking.",
    "#panLeft": "Pan the map left. Right click to toggle panning.",
    "#panRight": "Pan the map right. Right click to toggle panning.",
    "#previousDay": "Move to the previous day.",
    "#nextDay": "Move to the next day."
  };

  Object.entries(helpBySelector).forEach(([selector, help]) => {
    const element = document.querySelector(selector);
    const target = element?.matches("input, select, textarea") ? element.closest("label") || element : element;
    target?.setAttribute("data-help", help);
  });
  document.querySelectorAll(".element-control[data-style-key]").forEach(control => {
    control.setAttribute("data-help", ELEMENT_HELP[control.dataset.styleKey] || "Select this map element to change its appearance.");
  });
  const sectionHelp = {
    "journey stops": "Create, arrange, and choose the stops that make up this journey.",
    "days": "Choose a calendar day at the selected stop. One entry is created for every date in its stay.",
    "routes": "Edit the driving routes that connect one stop to the next.",
    "media": "Add and arrange photos, videos, audio, and notes for the selected route or stop.",
    "landmarks": "Set the images and marker styling used for each stop landmark.",
    "themes": "Choose and customize the map's colors, textures, and visual treatment.",
    "animation": "Control route playback speed, camera behavior, and route display.",
    "users": "Arrange the public visitor view and choose which controls visitors can use.",
    "settings": "Manage project-wide preferences, saved files, and editor behavior."
  };
  document.querySelectorAll(".section-collapse-button").forEach(button => {
    const section = button.closest(".panel-section");
    const label = button.querySelector(".section-collapse-title")?.textContent?.trim().toLowerCase() || section?.getAttribute("aria-label")?.trim().toLowerCase() || "";
    const purpose = sectionHelp[label] || `Open or collapse the ${label || "section"} controls.`;
    button.setAttribute("data-help", `${purpose} Right-click to expand or collapse all sections in this tab.`);
  });
  const pinnedHelp = {
    ".pinned-journey-details > summary": "Choose or rename the active journey.",
    ".pinned-day-details > summary": "Choose a stop and open its dates and day selector.",
    ".pinned-route-details > summary": "Choose the active travel route and view its route details."
  };
  Object.entries(pinnedHelp).forEach(([selector, help]) => document.querySelector(selector)?.setAttribute("data-help", help));
  document.querySelectorAll(".marker-stroke-grip").forEach(grip => {
    grip.setAttribute("data-help", "Drag this handle to reorder marker strokes. Stroke sizes and colors move with the row.");
  });
  document.querySelectorAll("#sectionColorOptions, #sectionColorLoop, #pinnedSectionColorSlots").forEach(container => {
    container.querySelectorAll("button").forEach(button => {
      button.removeAttribute("data-help");
      button.removeAttribute("title");
      button.dataset.helpIgnore = "true";
    });
  });
  document.querySelectorAll("button:not([data-help]):not([data-help-ignore]):not([role='tab']), label:not([data-help]):not([data-help-ignore]), select:not([data-help]):not([data-help-ignore]), input:not([data-help]):not([data-help-ignore]), textarea:not([data-help]):not([data-help-ignore])").forEach(element => {
    const help = fallbackHelpText(element);
    if (help) element.setAttribute("data-help", help);
  });
  document.querySelectorAll("[title]").forEach(element => {
    const helpTarget = element.closest(".element-control[data-help]") || element;
    if (!helpTarget.dataset.help) helpTarget.dataset.help = element.title;
    element.removeAttribute("title");
  });

  let showTimer = null;
  let activeTarget = null;
  const hide = () => {
    clearTimeout(showTimer);
    activeTarget?.removeAttribute("aria-describedby");
    activeTarget = null;
    tooltip.hidden = true;
  };
  const position = (target, pointerEvent = null) => {
    // The map viewport has its own spatial rules: controls affecting route
    // animation report into the marker-preview area, leaving their panel
    // controls visible while the user works.
    const previewAnchor = target.closest(".route-animation-icon-section") ? els.markerPreview : null;
    const rect = (previewAnchor || target).getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const mapRect = els.mapCanvas?.getBoundingClientRect();
    if (!mapRect) {
      tooltip.style.left = `${clamp(rect.right + 12, 8, window.innerWidth - tooltipRect.width - 8)}px`;
      tooltip.style.top = `${clamp(rect.bottom + 12, 8, window.innerHeight - tooltipRect.height - 8)}px`;
      return;
    }
    const placement = tooltipSettings.placement || "map-closest";
    const margin = 18;
    const centerX = pointerEvent?.clientX ?? rect.left + rect.width / 2;
    const centerY = pointerEvent?.clientY ?? rect.top + rect.height / 2;
    const clampMapX = value => clamp(value, mapRect.left + margin, mapRect.right - tooltipRect.width - margin);
    const clampMapY = value => clamp(value, mapRect.top + margin, mapRect.bottom - tooltipRect.height - margin);
    const targetIsOnMap = centerX >= mapRect.left && centerX <= mapRect.right && centerY >= mapRect.top && centerY <= mapRect.bottom;
    if (target.matches("[role='tab']")) {
      tooltip.style.left = `${Math.round(clamp(rect.left, 8, window.innerWidth - tooltipRect.width - 8))}px`;
      tooltip.style.top = `${Math.round(clamp(rect.bottom + 10, 8, window.innerHeight - tooltipRect.height - 8))}px`;
      return;
    }
    if (targetIsOnMap && placement === "map-closest") {
      const gap = 10;
      const below = rect.bottom + gap;
      const above = rect.top - tooltipRect.height - gap;
      const top = below + tooltipRect.height <= mapRect.bottom - margin || above < mapRect.top + margin ? below : above;
      tooltip.style.left = `${Math.round(clampMapX(rect.left + (rect.width - tooltipRect.width) / 2))}px`;
      tooltip.style.top = `${Math.round(clampMapY(top))}px`;
      return;
    }
    if (!targetIsOnMap && placement === "map-closest") {
      // Editor controls must never be obscured by their own help. Prefer an
      // adjacent side, then fall back above or below the control.
      const gap = 12;
      const roomRight = window.innerWidth - rect.right - gap;
      const roomLeft = rect.left - gap;
      const roomBelow = window.innerHeight - rect.bottom - gap;
      const roomAbove = rect.top - gap;
      let left;
      let top;
      if (roomRight >= tooltipRect.width || roomRight >= roomLeft) {
        left = rect.right + gap;
        top = rect.top + (rect.height - tooltipRect.height) / 2;
      } else if (roomLeft >= tooltipRect.width) {
        left = rect.left - tooltipRect.width - gap;
        top = rect.top + (rect.height - tooltipRect.height) / 2;
      } else if (roomBelow >= tooltipRect.height || roomBelow >= roomAbove) {
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        top = rect.bottom + gap;
      } else {
        left = rect.left + (rect.width - tooltipRect.width) / 2;
        top = rect.top - tooltipRect.height - gap;
      }
      tooltip.style.left = `${Math.round(clamp(left, 8, window.innerWidth - tooltipRect.width - 8))}px`;
      tooltip.style.top = `${Math.round(clamp(top, 8, window.innerHeight - tooltipRect.height - 8))}px`;
    } else if (placement === "cursor") {
      tooltip.style.left = `${Math.round(clamp(centerX + 12, 8, window.innerWidth - tooltipRect.width - 8))}px`;
      tooltip.style.top = `${Math.round(clamp(centerY + 12, 8, window.innerHeight - tooltipRect.height - 8))}px`;
    } else if (placement === "target") {
      // Keep contextual help out of the hovered item's way: favor the space
      // beneath it, then use the space above if that is the roomier option.
      const gap = 10;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const top = spaceBelow >= tooltipRect.height || spaceBelow >= spaceAbove
        ? rect.bottom + gap
        : rect.top - tooltipRect.height - gap;
      tooltip.style.left = `${Math.round(clamp(rect.left + (rect.width - tooltipRect.width) / 2, 8, window.innerWidth - tooltipRect.width - 8))}px`;
      tooltip.style.top = `${Math.round(clamp(top, 8, window.innerHeight - tooltipRect.height - 8))}px`;
    } else if (placement === "map-bottom-right" || placement === "map-top-right" || placement === "map-middle") {
      const left = placement === "map-middle" ? mapRect.left + (mapRect.width - tooltipRect.width) / 2 : mapRect.right - tooltipRect.width - margin;
      const top = placement === "map-bottom-right" ? mapRect.bottom - tooltipRect.height - margin : placement === "map-top-right" ? mapRect.top + margin : mapRect.top + (mapRect.height - tooltipRect.height) / 2;
      tooltip.style.left = `${Math.round(clampMapX(left))}px`;
      tooltip.style.top = `${Math.round(clampMapY(top))}px`;
    } else {
      // Closest map edge: choose an edge by distance, preserving the target's
      // coordinate on the other axis instead of snapping every tooltip corner.
      const distances = { left: Math.abs(centerX - mapRect.left), right: Math.abs(centerX - mapRect.right), top: Math.abs(centerY - mapRect.top), bottom: Math.abs(centerY - mapRect.bottom) };
      const edge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
      const left = edge === "left" ? mapRect.left + margin : edge === "right" ? mapRect.right - tooltipRect.width - margin : centerX - tooltipRect.width / 2;
      const top = edge === "top" ? mapRect.top + margin : edge === "bottom" ? mapRect.bottom - tooltipRect.height - margin : centerY - tooltipRect.height / 2;
      tooltip.style.left = `${Math.round(clampMapX(left))}px`;
      tooltip.style.top = `${Math.round(clampMapY(top))}px`;
    }
  };
  const show = (target, pointerEvent = null) => {
    const help = target?.dataset.help;
    if (!help) return;
    activeTarget?.removeAttribute("aria-describedby");
    activeTarget = target;
    tooltip.textContent = help;
    applyTooltipTheme(target);
    tooltip.hidden = false;
    target.setAttribute("aria-describedby", tooltip.id);
    position(target, pointerEvent);
  };

  document.addEventListener("pointerover", event => {
    const target = event.target.closest("[data-help]");
    if (!target || target === activeTarget) return;
    clearTimeout(showTimer);
    showTimer = window.setTimeout(() => show(target, event), 650);
  });
  document.addEventListener("pointerout", event => {
    const target = event.target.closest("[data-help]");
    if (!target || target.contains(event.relatedTarget)) return;
    hide();
  });
  document.addEventListener("focusin", event => {
    const target = event.target.closest("[data-help]");
    if (target) show(target);
  });
  document.addEventListener("focusout", event => {
    if (event.target.closest("[data-help]")) hide();
  });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

document.querySelectorAll("[data-style-select]").forEach(button => {
  button.disabled = false;
  button.removeAttribute("aria-disabled");
  button.title = "Edit this theme layer.";
  button.addEventListener("click", event => {
    const key = button.dataset.styleSelect;
    if (!key) return;
    setElementsDrawerOpen(true);
    selectStyleLayer(key);
    positionStylePanel(event.clientX, event.clientY);
  });
});

document.querySelectorAll("[data-route-stack-toggle]").forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleRouteStackOrder();
  });
});

function renderStyleLayerOptions() {
  els.styleLayerSelect.replaceChildren();
  styleEditorLayerKeys().forEach(key => {
    const style = layerStyles[key];
    els.styleLayerSelect.append(new Option(style.label, key));
  });
  let picker = document.querySelector("#styleLayerVisualPicker");
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "styleLayerVisualPicker";
    picker.className = "style-layer-visual-picker";
    els.styleLayerSelect.closest("label")?.append(picker);
  }
  picker.replaceChildren(...styleEditorLayerKeys().map(key => {
    const style = layerStyles[key];
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.styleLayerKey = key;
    button.innerHTML = `<i style="--layer-swatch:${style.color}"></i><span>${style.label}</span>`;
    button.addEventListener("click", () => {
      els.styleLayerSelect.value = key;
      els.styleLayerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return button;
  }));
  selectStyleLayer(activeStyleKey);
}

function styleEditorLayerKeys() {
  return [
    "land", "water", "parks", "buildings",
    "topography", "faintTopography",
    "smallTowns", "cities", "capitols", "pois", "routeStopLabels",
    "highways", "majorRoads", "minorRoads", "railroads",
    "countryBorders", "stateBorders", "countyBorders",
    "route", "faintRoute", "startEnd",
    "dayZoneFill", "dayZoneStroke"
  ].filter(key => layerStyles[key]);
}

function renderTextStyleOptions() {
  const createTypefaceOption = typeface => {
    const option = new Option(typeface.label, typeface.value);
    const previewWeight = typeface.value === "arial-black" || typeface.value === "impact" ? "800" : "650";
    option.setAttribute(
      "style",
      [
        `font-family: ${typeface.css}`,
        `font-weight: ${previewWeight}`,
        "font-size: 1.02rem"
      ].join("; ")
    );
    option.title = `Preview ${typeface.label}`;
    return option;
  };

  els.styleTypeface.replaceChildren(...MAP_TEXT_TYPEFACES.map(createTypefaceOption));
  els.fontStyleTypeface?.replaceChildren(...MAP_TEXT_TYPEFACES.map(createTypefaceOption));
  updateTypefaceSelectPreview(els.styleTypeface);
  updateTypefaceSelectPreview(els.fontStyleTypeface);
}

function updateTypefaceSelectPreview(select) {
  if (!select) return;
  const typeface = textTypeface(select.value);
  select.style.fontFamily = typeface.css;
  select.style.fontWeight = typeface.value === "arial-black" || typeface.value === "impact" ? "800" : "700";
}

function activeFontStyleKey() {
  const key = els.fontStyleTarget?.value || "cities";
  if (key === "ui") return "ui";
  return isTextStyleLayer(key) ? key : "cities";
}

function activeFontStyle() {
  const key = activeFontStyleKey();
  return key === "ui" ? uiFontStyle : layerStyles[key];
}

function fontStyleSize(style, key) {
  if (key === "ui") return clamp(Number(style.size), style.min, style.max);
  return styleSize(key);
}

function fontStyleFamily(style, key) {
  return key === "ui" ? textTypeface(style.font).css : styleFontFamily(key);
}

function fontStyleWeight(style, key) {
  if (key === "ui") return clamp(Number(style.fontWeight), 400, 800);
  return styleFontWeight(key);
}

function fontStyleItalicValue(style, key) {
  return key === "ui" ? Boolean(style.italic) : styleItalic(key);
}

function fontStyleStretchValue(style, key) {
  if (key === "ui") return clamp(Number(style.fontStretch), 70, 140);
  return styleFontStretch(key);
}

function fontStyleScaleYValue(style, key) {
  if (key === "ui") return clamp(Number(style.fontScaleY), 80, 130);
  return styleFontScaleY(key);
}

function fontStyleLetterSpacingValue(style, key) {
  if (key === "ui") return clamp(Number(style.letterSpacing), -0.08, 0.16);
  return styleLetterSpacing(key);
}

function fontStyleWordSpacingValue(style, key) {
  if (key === "ui") return clamp(Number(style.wordSpacing), -0.08, 0.18);
  return styleWordSpacing(key);
}

function fontStyleHaloWidth(style, key) {
  if (key === "ui") return 1.4;
  return labelHaloWidthForStyle(key);
}

function applyUiFontStyle() {
  document.documentElement.style.setProperty("--ui-font", textTypeface(uiFontStyle.font).css);
  document.documentElement.style.setProperty("--ui-font-style", uiFontStyle.italic ? "italic" : "normal");
  document.documentElement.style.setProperty("--ui-font-color", uiFontStyle.color);
  document.documentElement.style.setProperty("--ui-font-weight", String(uiFontStyle.fontWeight));
  document.documentElement.style.setProperty("--ui-font-stretch", `${uiFontStyle.fontStretch}%`);
  document.documentElement.style.setProperty("--ui-font-scale-y", String(uiFontStyle.fontScaleY / 100));
  document.documentElement.style.setProperty("--ui-letter-spacing", `${uiFontStyle.letterSpacing}em`);
}

function updateFontOutput(input, output, suffix = "") {
  if (!input || !output) return;
  const value = Number(input.value);
  output.textContent = Number.isFinite(value) ? `${value.toFixed(suffix === "em" ? 2 : 0)}${suffix}` : "";
}

function syncFontControlsFromStyle() {
  const key = activeFontStyleKey();
  const style = activeFontStyle();
  if (!style || !els.fontStyleTarget) return;
  els.fontStyleColor.value = normalizeHex(style.color) || "#25313d";
  els.fontStyleTypeface.value = textTypeface(style.font).value;
  updateTypefaceSelectPreview(els.fontStyleTypeface);
  els.fontStyleWeight.value = String(fontStyleWeight(style, key));
  els.fontStyleItalic.checked = fontStyleItalicValue(style, key);
  els.fontStyleCase.value = style.textCase || "normal";
  els.fontStyleBackground.checked = Boolean(style.labelBackground);
  els.fontStyleBackgroundColor.value = normalizeHex(style.labelBackgroundColor) || "#ffffff";
  els.fontStyleBackgroundOpacity.value = String(Number.isFinite(style.labelBackgroundOpacity) ? style.labelBackgroundOpacity : 0.86);
  els.fontStyleSize.min = style.min;
  els.fontStyleSize.max = style.max;
  els.fontStyleSize.value = String(fontStyleSize(style, key));
  els.fontStyleThickness.value = String(fontStyleWeight(style, key));
  els.fontStyleStretch.value = String(fontStyleStretchValue(style, key));
  els.fontStyleScaleY.value = String(fontStyleScaleYValue(style, key));
  els.fontStyleKerning.value = String(fontStyleLetterSpacingValue(style, key));
  els.fontStyleSpacing.value = String(fontStyleWordSpacingValue(style, key));
  updateFontControlsPreview();
}

function updateFontControlsPreview() {
  const key = activeFontStyleKey();
  const style = activeFontStyle();
  if (!style || !els.fontStylePreview) return;
  const sample = key === "ui" ? "Route Display" : key === "smallTowns" ? "Albuquerque" : key === "capitols" ? "United States" : key === "pois" ? "National Park" : key === "routeStopLabels" ? "Tuba City" : "Colorado Springs";
  els.fontStylePreview.textContent = key === "ui" ? sample : formatMapLabelText(sample, key);
  els.fontStylePreview.style.color = style.color;
  els.fontStylePreview.style.setProperty("--label-halo", labelHaloColor(style.color));
  els.fontStylePreview.style.setProperty("--label-halo-width", `${fontStyleHaloWidth(style, key)}px`);
  els.fontStylePreview.style.setProperty("--label-bg-rgb", style.labelBackground ? hexToRgbTriplet(style.labelBackgroundColor || "#ffffff") : "255 255 255");
  els.fontStylePreview.style.setProperty("--label-bg-opacity", style.labelBackground ? String(style.labelBackgroundOpacity ?? 0.86) : "0");
  els.fontStylePreview.style.fontFamily = fontStyleFamily(style, key);
  els.fontStylePreview.style.fontSize = `${fontStyleSize(style, key)}px`;
  els.fontStylePreview.style.fontWeight = String(fontStyleWeight(style, key));
  els.fontStylePreview.style.fontStyle = fontStyleItalicValue(style, key) ? "italic" : "normal";
  els.fontStylePreview.style.letterSpacing = `${fontStyleLetterSpacingValue(style, key)}em`;
  els.fontStylePreview.style.wordSpacing = `${fontStyleWordSpacingValue(style, key)}em`;
  els.fontStylePreview.style.transform = `scale(${fontStyleStretchValue(style, key) / 100}, ${fontStyleScaleYValue(style, key) / 100})`;
  updateFontOutput(els.fontStyleSize, els.fontStyleSizeValue);
  updateFontOutput(els.fontStyleThickness, els.fontStyleThicknessValue);
  updateFontOutput(els.fontStyleStretch, els.fontStyleStretchValue, "%");
  updateFontOutput(els.fontStyleScaleY, els.fontStyleScaleYValue, "%");
  updateFontOutput(els.fontStyleKerning, els.fontStyleKerningValue, "em");
  updateFontOutput(els.fontStyleSpacing, els.fontStyleSpacingValue, "em");
  if (els.fontStyleBackgroundOpacityValue) {
    els.fontStyleBackgroundOpacityValue.textContent = Number(els.fontStyleBackgroundOpacity?.value || 0).toFixed(2);
  }
}

function applyFontControlsToStyle() {
  const key = activeFontStyleKey();
  const style = activeFontStyle();
  if (!style) return;
  style.color = normalizeHex(els.fontStyleColor.value) || style.color;
  style.font = els.fontStyleTypeface.value;
  style.fontWeight = clamp(Number(els.fontStyleThickness.value || els.fontStyleWeight.value), 400, 800);
  els.fontStyleWeight.value = String(style.fontWeight);
  els.fontStyleThickness.value = String(style.fontWeight);
  style.italic = Boolean(els.fontStyleItalic.checked);
  style.size = clamp(Number(els.fontStyleSize.value), style.min, style.max);
  style.fontStretch = clamp(Number(els.fontStyleStretch.value), 70, 140);
  style.fontScaleY = clamp(Number(els.fontStyleScaleY.value), 80, 130);
  style.letterSpacing = clamp(Number(els.fontStyleKerning.value), -0.08, 0.16);
  style.wordSpacing = clamp(Number(els.fontStyleSpacing.value), -0.08, 0.18);
  style.textCase = els.fontStyleCase.value;
  style.labelBackground = Boolean(els.fontStyleBackground.checked);
  style.labelBackgroundColor = normalizeHex(els.fontStyleBackgroundColor.value) || style.labelBackgroundColor || "#ffffff";
  style.labelBackgroundOpacity = clamp(Number(els.fontStyleBackgroundOpacity.value), 0, 1);
  if (key === "ui") {
    applyUiFontStyle();
  }
  if (els.styleLayerSelect?.value === key) selectStyleLayer(key);
  updateFontControlsPreview();
  if (key !== "ui") scheduleStyledLayerRefresh();
}

function createColorSwatch(color, { saved = false } = {}) {
  const button = document.createElement("button");
  button.className = "style-swatch";
  button.type = "button";
  button.title = color;
  button.style.setProperty("--swatch-color", color);
  button.classList.toggle("is-saved", saved);
  button.addEventListener("click", () => {
    commitPickerColor(color);
    rememberRecentColor(color);
  });
  button.addEventListener("contextmenu", event => {
    event.preventDefault();
    toggleSavedColor(color);
  });
  return button;
}

function renderColorCollections() {
  els.styleRecentSwatches.replaceChildren(...recentColors.map(color => createColorSwatch(color, {
    saved: savedColors.includes(color)
  })));
  els.styleSwatches.replaceChildren(...COLOR_SWATCHES.map(color => createColorSwatch(color, {
    saved: savedColors.includes(color)
  })));
  els.styleSavedSwatches.replaceChildren(...savedColors.map(color => createColorSwatch(color, { saved: true })));
  els.styleSavedColorCount.textContent = `${savedColors.length} / ${MAX_SAVED_COLORS}`;
}

function texturePreviewUrl(texture) {
  return textureAssetUrl(texture) || texture?.sourceUrl;
}

function textureUseUrl(texture) {
  return textureAssetUrl(texture) || texturePreviewUrl(texture);
}

function updateTexturePreviewColor() {
  const color = activeStyleKey ? styleColor(activeStyleKey) : "#eadfba";
  document.documentElement.style.setProperty("--texture-preview-color", color);
}

function createTextureChoice(texture, { compact = false, target = "primary" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = compact ? "texture-choice texture-choice-compact" : "texture-choice";
  button.dataset.textureId = texture.id;
  button.title = `${texture.category}: ${texture.purpose || texture.label}. Right-click to add or remove this texture from the quick list.`;
  button.setAttribute("aria-pressed", "false");
  const previewUrl = texturePreviewUrl(texture);
  const useUrl = textureUseUrl(texture);
  if (previewUrl) button.style.setProperty("--texture-url", `url("${previewUrl}")`);
  if (useUrl) button.style.setProperty("--texture-use-url", `url("${useUrl}")`);
  const thumb = document.createElement("span");
  thumb.className = "texture-thumb";
  const label = document.createElement("strong");
  label.textContent = texture.label;
  button.append(thumb, label);
  if (texture.recommended) {
    const badge = document.createElement("span");
    badge.className = "texture-badge";
    badge.textContent = "Recommended";
    button.append(badge);
  }
  if (!texture.localAvailable && texture.id !== "none") {
    const badge = document.createElement("span");
    badge.className = "texture-badge texture-badge-muted";
    badge.textContent = "Web";
    button.append(badge);
  }
  button.addEventListener("click", () => {
    if (target === "secondary") {
      els.styleSecondaryTextureType.value = texture.id;
    } else {
      els.styleTextureType.value = texture.id;
    }
    applyActiveTextureControls();
    updateTextureChoiceSelection();
  });
  if (!compact) {
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      const ids = quickTextureIds();
      const next = ids.includes(texture.id) ? ids.filter(id => id !== texture.id) : [...ids, texture.id];
      saveQuickTextureIds(next);
      renderTextureOptions();
      renderTextureLibrary();
    });
  }
  return button;
}

const QUICK_TEXTURE_IDS_KEY = "rv-map-quick-texture-ids";
function quickTextureIds() {
  const stored = rvStorageReadJson(QUICK_TEXTURE_IDS_KEY, null);
  const ids = Array.isArray(stored) ? stored : FEATURED_TEXTURE_IDS;
  return ids.filter(id => LAYER_TEXTURE_BY_ID[id]);
}
function saveQuickTextureIds(ids) {
  rvStorageWriteJson(QUICK_TEXTURE_IDS_KEY, [...new Set(ids)].slice(0, 80));
}

function renderSecondaryTextureOptions() {
  if (!els.styleSecondaryTextureType) return;
  const current = els.styleSecondaryTextureType.value || DEFAULT_LAYER_TEXTURE.secondaryType;
  const textures = sortedTextures(LAYER_TEXTURES);
  const hasCurrent = textures.some(texture => texture.id === current);
  els.styleSecondaryTextureType.replaceChildren(...groupedTextureSelectOptions(textures));
  els.styleSecondaryTextureType.value = hasCurrent ? current : DEFAULT_LAYER_TEXTURE.secondaryType;
  renderSecondaryTextureChoices();
  updateTextureChoiceSelection();
  updateTextureCompatibilityScore();
}

function renderSecondaryTextureChoices() {
  if (!els.styleSecondaryTextureChoices) return;
  els.styleSecondaryTextureChoices.replaceChildren();
  const textures = quickTextureIds()
    .map(id => LAYER_TEXTURE_BY_ID[id])
    .filter(Boolean)
    .sort((a, b) => {
      const categoryCompare = TEXTURE_SORTER.compare(a.category || "Other", b.category || "Other");
      return categoryCompare || TEXTURE_SORTER.compare(a.label || a.id, b.label || b.id);
    });
  groupedTextures(textures, { includeNone: false }).forEach(group => {
    els.styleSecondaryTextureChoices.append(textureGroupHeading(group.category));
    group.textures.forEach(texture => {
      els.styleSecondaryTextureChoices.append(createTextureChoice(texture, { compact: true, target: "secondary" }));
    });
  });
}

function renderTextureOptions() {
  const blendOptions = TEXTURE_BLEND_MODES.map(([value, label]) => new Option(label, value));
  els.styleTextureBlend.replaceChildren(...blendOptions.map(option => option.cloneNode(true)));
  els.styleSecondaryTextureBlend.replaceChildren(...blendOptions.map(option => option.cloneNode(true)));
  els.styleBlend.replaceChildren(...blendOptions.map(option => option.cloneNode(true)));
  const options = groupedTextureSelectOptions(sortedTextures(LAYER_TEXTURES));
  els.styleTextureType.replaceChildren(...options.map(option => option.cloneNode(true)));
  els.styleTextureChoices.replaceChildren();
  const textures = quickTextureIds()
    .map(id => LAYER_TEXTURE_BY_ID[id])
    .filter(Boolean)
    .sort((a, b) => {
      const categoryCompare = TEXTURE_SORTER.compare(a.category || "Other", b.category || "Other");
      return categoryCompare || TEXTURE_SORTER.compare(a.label || a.id, b.label || b.id);
    });
  groupedTextures(textures, { includeNone: false }).forEach(group => {
    els.styleTextureChoices.append(textureGroupHeading(group.category));
    group.textures.forEach(texture => {
      els.styleTextureChoices.append(createTextureChoice(texture, { compact: true }));
    });
  });
  renderSecondaryTextureOptions();
  updateTexturePreviewColor();
  updateTextureChoiceSelection();
}

function updateTextureChoiceSelection() {
  els.styleTextureChoices?.querySelectorAll("[data-texture-id]").forEach(button => {
    button.setAttribute("aria-pressed", button.dataset.textureId === els.styleTextureType.value ? "true" : "false");
  });
  els.styleSecondaryTextureChoices?.querySelectorAll("[data-texture-id]").forEach(button => {
    button.setAttribute("aria-pressed", button.dataset.textureId === els.styleSecondaryTextureType.value ? "true" : "false");
  });
  els.textureLibraryGrid?.querySelectorAll("[data-texture-id]").forEach(button => {
    button.setAttribute("aria-pressed", button.dataset.textureId === els.styleTextureType.value ? "true" : "false");
  });
}

function applyActiveTextureControls() {
  if (!activeStyleKey) return;
  ensureThemeEditableRenderer();
  const selectedTexture = LAYER_TEXTURE_BY_ID[els.styleTextureType.value];
  const selectedSecondaryTexture = LAYER_TEXTURE_BY_ID[els.styleSecondaryTextureType.value];
  let opacity = Number(els.styleTextureOpacity.value);
  let blendAmount = Number(els.styleTextureBlendAmount.value);
  let secondaryOpacity = Number(els.styleSecondaryTextureOpacity.value);
  if (selectedTexture?.id !== "none" && opacity <= 0) {
    opacity = selectedTexture?.defaultOpacity || DEFAULT_LAYER_TEXTURE.opacity;
    els.styleTextureOpacity.value = String(opacity);
  }
  if (selectedTexture?.id !== "none" && blendAmount <= 0) {
    blendAmount = DEFAULT_LAYER_TEXTURE.blendAmount;
    els.styleTextureBlendAmount.value = String(blendAmount);
  }
  if (
    els.styleSecondaryTextureEnabled?.checked
    && selectedSecondaryTexture?.id !== "none"
    && secondaryOpacity <= 0
  ) {
    secondaryOpacity = selectedSecondaryTexture?.defaultOpacity || DEFAULT_LAYER_TEXTURE.secondaryOpacity;
    els.styleSecondaryTextureOpacity.value = String(secondaryOpacity);
  }
  layerStyles[activeStyleKey].texture = layerTexture({
    enabled: Boolean(els.styleTextureEnabled?.checked) && els.styleTextureType.value !== "none",
    type: els.styleTextureType.value,
    opacity,
    blend: els.styleTextureBlendEnabled?.checked ? els.styleTextureBlend.value : "normal",
    blendAmount,
    scale: usesTextureSizeControl(activeStyleKey) ? Number(els.styleTextureSize.value) : styleTexture(activeStyleKey).scale,
    secondaryEnabled: Boolean(els.styleSecondaryTextureEnabled?.checked) && els.styleSecondaryTextureType.value !== "none",
    secondaryType: els.styleSecondaryTextureType.value,
    secondaryScale: Number(els.styleSecondaryTextureSize.value),
    secondaryOpacity,
    secondaryBlend: els.styleSecondaryTextureBlend.value
  });
  updateTextureChoiceSelection();
  updateTextureCompatibilityScore();
  scheduleStyledLayerRefresh();
}

function visibleTextureLibraryItems() {
  const query = (els.textureLibrarySearch?.value || "").trim().toLowerCase();
  return LAYER_TEXTURES
    .filter(texture => texture.id !== "none")
    .filter(texture => {
      if (!query) return true;
      return [texture.label, texture.id, texture.category, texture.author].some(value => String(value || "").toLowerCase().includes(query));
    });
}

function renderTextureLibrary() {
  if (!els.textureLibraryGrid) return;
  const textures = visibleTextureLibraryItems();
  els.textureLibraryGrid.replaceChildren();
  groupedTextures(textures, { includeNone: false }).forEach(group => {
    els.textureLibraryGrid.append(textureGroupHeading(group.category));
    group.textures.forEach(texture => els.textureLibraryGrid.append(createTextureChoice(texture)));
  });
  if (els.textureLibraryCount) {
    els.textureLibraryCount.textContent = `${textures.length} of ${LAYER_TEXTURES.length - 1} textures`;
  }
  updateTexturePreviewColor();
  updateTextureChoiceSelection();
}

function openTextureLibrary() {
  if (!els.textureLibraryPanel) return;
  els.textureLibraryPanel.hidden = false;
  renderTextureLibrary();
  els.textureLibrarySearch?.focus();
  syncMapAfterPanelLayoutChange();
}

function closeTextureLibrary() {
  if (els.textureLibraryPanel) els.textureLibraryPanel.hidden = true;
  syncMapAfterPanelLayoutChange();
}

function getTextureManifestExportPayload() {
  return {
    source: "https://www.transparenttextures.com/",
    localFolder: TRANSPARENT_TEXTURE_LOCAL_DIR,
    generatedAt: new Date().toISOString(),
    usedTextures: LAYER_TEXTURES.filter(texture => texture.id !== "none").map(texture => ({
      id: texture.id,
      label: texture.label,
      category: texture.category,
      file: texture.file || `${texture.id}.png`,
      localPath: texture.localUrl || `${TRANSPARENT_TEXTURE_LOCAL_DIR}${texture.file || `${texture.id}.png`}`,
      localAvailable: Boolean(texture.localAvailable),
      previewUrl: texture.sourceUrl || texture.url,
      downloadUrl: texture.sourceUrl || texture.url,
      sourcePage: texture.page || "https://www.transparenttextures.com/"
    }))
  };
}

function exportTextureManifest() {
  downloadJson(TEXTURE_MANIFEST_EXPORT_NAME, getTextureManifestExportPayload());
}

els.saveTextureManifestToProject?.addEventListener("click", () => {
  saveProjectSettingsFile(TEXTURE_MANIFEST_EXPORT_NAME, getTextureManifestExportPayload(), "assets/files/textures/rv-map-textures-manifest.json");
});

function projectSyncSnapshot() {
  return {
    journeys: getJourneysExportPayload(),
    styles: getStyleExportPayload(),
    ui: getUiSettingsExportPayload(),
    textures: getTextureManifestExportPayload()
  };
}

function applyProjectSyncSnapshot(snapshot = {}) {
  if (snapshot.journeys && typeof applyTripsPayload === "function") {
    applyTripsPayload(snapshot.journeys);
    saveTrips();
    renderTripManager?.();
    renderRoute?.(false);
  }
  if (snapshot.styles) applyStyleState(snapshot.styles.styles || snapshot.styles);
  if (snapshot.ui) applyUiSettingsState(snapshot.ui);
  updateProjectExportStatus();
}

rvProjectSync?.register?.({ getSnapshot: projectSyncSnapshot, applySnapshot: applyProjectSyncSnapshot });
rvProjectSync?.subscribe?.(status => {
  if (els.projectSyncStatus) els.projectSyncStatus.textContent = status;
});
window.addEventListener("load", () => rvProjectSync?.start?.(), { once: true });
