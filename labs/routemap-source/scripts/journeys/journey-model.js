"use strict";

// Durable journey, stop, and route-leg records. Rendering and editor state do
// not belong here; temporary calls into legacy normalizers are compatibility
// adapters until their owning phases are extracted.

function normalizeRouteWaypoints(waypoints = []) {
  if (!Array.isArray(waypoints)) return [];
  return waypoints
    .map((waypoint, index) => {
      const lat = Number(waypoint?.lat);
      const lon = Number(waypoint?.lon);
      const routeLat = Number(waypoint?.routeLat);
      const routeLon = Number(waypoint?.routeLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        id: waypoint.id || `waypoint-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        lat,
        lon,
        routeLat: Number.isFinite(routeLat) ? routeLat : lat,
        routeLon: Number.isFinite(routeLon) ? routeLon : lon,
        label: String(waypoint.label || `Waypoint ${index + 1}`)
      };
    })
    .filter(Boolean);
}

function makeRoute(parsed, meta = {}) {
  const label = meta.label || parsed.title;
  return {
    id: meta.id || `day-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: parsed.title,
    label,
    summary: meta.summary || meta.destination || parsed.title,
    source: meta.source || label,
    color: meta.color || ROUTE_COLOR,
    durationSeconds: Number(meta.durationSeconds) || null,
    startAddress: meta.startAddress || "",
    endAddress: meta.endAddress || "",
    startName: meta.startName || "",
    endName: meta.endName || "",
    startNameIndependent: Boolean(meta.startNameIndependent),
    startQuery: meta.startQuery || meta.startAddress || "",
    endQuery: meta.endQuery || meta.endAddress || "",
    isRestDay: Boolean(meta.isRestDay),
    autoLabel: meta.autoLabel !== undefined ? Boolean(meta.autoLabel) : false,
    sequenceNumber: Number.isFinite(Number(meta.sequenceNumber)) && Number(meta.sequenceNumber) > 0 ? Math.floor(Number(meta.sequenceNumber)) : null,
    sequenceDate: /^\d{4}-\d{2}-\d{2}$/.test(meta.sequenceDate || "") ? meta.sequenceDate : "",
    startStopId: String(meta.startStopId || ""),
    endStopId: String(meta.endStopId || ""),
    travelStartDate: /^\d{4}-\d{2}-\d{2}$/.test(meta.travelStartDate || "") ? meta.travelStartDate : "",
    travelEndDate: /^\d{4}-\d{2}-\d{2}$/.test(meta.travelEndDate || "") ? meta.travelEndDate : "",
    savedView: normalizeSavedMapView(meta.savedView),
    independentStart: meta.independentStart === undefined
      ? meta.source !== "Address route"
      : Boolean(meta.independentStart),
    addressHistory: Array.isArray(meta.addressHistory)
      ? [...new Set(meta.addressHistory.map(address => String(address || "").trim()).filter(Boolean))]
      : [],
    waypoints: normalizeRouteWaypoints(meta.waypoints),
    zoneSettings: normalizeZoneSettings(meta.zoneSettings, {}),
    markerSettings: normalizeMarkerSettings(meta.markerSettings, {}),
    markerEndpoints: normalizeMarkerEndpoints(meta.markerEndpoints, normalizeMarkerSettings(meta.markerSettings, {})),
    mediaManualOrder: Boolean(meta.mediaManualOrder),
    mediaNumberingStyle: ["none", "decimal", "roman-lower", "roman-upper", "alpha-lower", "alpha-upper"].includes(meta.mediaNumberingStyle)
      ? meta.mediaNumberingStyle
      : "decimal",
    media: Array.isArray(meta.media) ? meta.media.map(normalizeTripMedia) : [],
    points: parsed.points,
    displayPoints: smoothRoutePoints(parsed.points)
  };
}



function activeTrip() {
  return state.trips[state.activeTripIndex] || null;
}

function isoDateValue(value = "") {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function makeStopId() {
  return `stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTripStop(stop = {}, fallback = {}) {
  const lat = Number(stop.lat ?? fallback.lat);
  const lon = Number(stop.lon ?? fallback.lon);
  return {
    id: String(stop.id || fallback.id || makeStopId()),
    name: String(stop.name || fallback.name || "Stop").trim() || "Stop",
    address: String(stop.address || fallback.address || "").trim(),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    arrivalDate: isoDateValue(stop.arrivalDate || fallback.arrivalDate),
    departureDate: isoDateValue(stop.departureDate || fallback.departureDate),
    mediaManualOrder: Boolean(stop.mediaManualOrder ?? fallback.mediaManualOrder),
    mediaNumberingStyle: ["none", "decimal", "roman-lower", "roman-upper", "alpha-lower", "alpha-upper"].includes(stop.mediaNumberingStyle)
      ? stop.mediaNumberingStyle
      : ["none", "decimal", "roman-lower", "roman-upper", "alpha-lower", "alpha-upper"].includes(fallback.mediaNumberingStyle)
        ? fallback.mediaNumberingStyle
        : "decimal",
    savedView: normalizeSavedMapView(stop.savedView || fallback.savedView),
    media: Array.isArray(stop.media)
      ? stop.media.map(normalizeTripMedia)
      : Array.isArray(fallback.media)
        ? fallback.media.map(normalizeTripMedia)
        : [],
    dayContent: Object.fromEntries(Object.entries(stop.dayContent && typeof stop.dayContent === "object" ? stop.dayContent : {}).map(([iso, content]) => [
      iso,
      {
        media: Array.isArray(content?.media) ? content.media.map(normalizeTripMedia) : [],
        stickers: normalizeTripStickers(content?.stickers),
        timelineEndAction: ["default", "wait", "next"].includes(content?.timelineEndAction) ? content.timelineEndAction : "default"
      }
    ]))
  };
}

function normalizeSavedMapView(view = null) {
  const lat = Number(view?.lat);
  const lon = Number(view?.lon);
  const zoom = Number(view?.zoom);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(zoom)) return null;
  return { lat: clamp(lat, -90, 90), lon: clamp(lon, -180, 180), zoom: clamp(zoom, 1, 20) };
}

// A journey can preserve the exact geographic rectangle shown by each User
// device.  Keep all four corners, rather than only a center/zoom, so a map
// composition remains portable across differently shaped viewports.
function normalizeJourneyViewportCorners(value = null) {
  if (!value || typeof value !== "object") return null;
  const normalizeCorner = corner => {
    const lat = Number(corner?.lat);
    const lon = Number(corner?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat: Math.max(-90, Math.min(90, lat)), lon: Math.max(-180, Math.min(180, lon)) };
  };
  const northWest = normalizeCorner(value.northWest);
  const northEast = normalizeCorner(value.northEast);
  const southEast = normalizeCorner(value.southEast);
  const southWest = normalizeCorner(value.southWest);
  if (!northWest || !northEast || !southEast || !southWest) return null;
  return { northWest, northEast, southEast, southWest };
}

function normalizeJourneyViewportBoundsByDevice(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([device, corners]) => [String(device || "").trim(), normalizeJourneyViewportCorners(corners)])
    .filter(([device, corners]) => device && corners));
}

function normalizeJourneyStyle(style = {}, fallbackIndex = 0) {
  const fallbackColor = typeof JOURNEY_OVERVIEW_COLORS !== "undefined"
    ? JOURNEY_OVERVIEW_COLORS[fallbackIndex % JOURNEY_OVERVIEW_COLORS.length]
    : DEFAULT_JOURNEY_STYLE.routeColor;
  const features = style?.usFeatures && typeof style.usFeatures === "object" ? style.usFeatures : {};
  const routeLabelVisibility = ["always", "never", "hover", "active"].includes(style?.routeLabelVisibility)
    ? style.routeLabelVisibility : DEFAULT_JOURNEY_STYLE.routeLabelVisibility;
  const routeLabelContent = ["all", "route", "endpoints", "start", "end"].includes(style?.routeLabelContent)
    ? style.routeLabelContent : "all";
  return {
    routeColor: /^#[0-9a-f]{6}$/i.test(style?.routeColor || "") ? style.routeColor : fallbackColor,
    usRouteWidth: clamp(Number(style?.usRouteWidth ?? DEFAULT_JOURNEY_STYLE.usRouteWidth), 2, 24),
    outlineColor: /^#[0-9a-f]{6}$/i.test(style?.outlineColor || "") ? style.outlineColor : DEFAULT_JOURNEY_STYLE.outlineColor,
    outlineWidth: clamp(Number(style?.outlineWidth ?? DEFAULT_JOURNEY_STYLE.outlineWidth), 0, 16),
    outlineOpacity: clamp(Number(style?.outlineOpacity ?? DEFAULT_JOURNEY_STYLE.outlineOpacity), 0, 1),
    routeLabelVisibility,
    routeLabelContent,
    usFeatures: Object.fromEntries(Object.entries(DEFAULT_JOURNEY_STYLE.usFeatures).map(([key, value]) => [key, Boolean(features[key] ?? value)]))
  };
}

function normalizeSticker(sticker = {}, index = 0) {
  const lat = Number(sticker.lat);
  const lon = Number(sticker.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const visibility = STICKER_VISIBILITY_OPTIONS.includes(sticker.visibility)
    ? sticker.visibility
    : "inherit";
  const legacySize = clamp(Number(sticker.size) || 64, 20, 320);
  const rawSizes = sticker.sizesByView && typeof sticker.sizesByView === "object" ? sticker.sizesByView : {};
  const sizesByView = Object.fromEntries(["us", "journey", "route", "stop"].map(view => [
    view,
    clamp(Number(rawSizes[view]) || legacySize, 20, 320)
  ]));
  const placedView = ["us", "journey", "route", "stop"].includes(sticker.placedView)
    ? sticker.placedView
    : "journey";
  const normalizePinStrokeStack = (strokes, color, size, prefix) => {
    const source = Array.isArray(strokes) && strokes.length ? strokes : [{ color, size }];
    return source.slice(0, 8).map((stroke, strokeIndex) => ({
      id: String(stroke?.id || `${prefix}-${Date.now()}-${index}-${strokeIndex}`),
      color: /^#[0-9a-f]{6}$/i.test(stroke?.color || "") ? stroke.color : color,
      size: clamp(Number(stroke?.size) || 0, 0, 12),
      hidden: Boolean(stroke?.hidden) || Number(stroke?.size) <= 0
    }));
  };
  return {
    id: String(sticker.id || `sticker-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`),
    libraryId: String(sticker.libraryId || "custom"),
    label: String(sticker.label || "Sticker"),
    imageUrl: String(sticker.imageUrl || ""),
    objectClass: ["sticker", "pin", "media", "null"].includes(sticker.objectClass) ? sticker.objectClass : "sticker",
    mediaId: String(sticker.mediaId || ""),
    mediaEvents: Object.fromEntries(Object.entries(sticker.mediaEvents || {}).filter(([slot, mediaId]) => ["appear", "click", "hover"].includes(slot) && typeof mediaId === "string" && mediaId)),
    mediaEventOptions: Object.fromEntries(Object.entries(sticker.mediaEventOptions || {}).filter(([slot]) => ["appear", "click", "hover"].includes(slot)).map(([slot, options]) => [slot, {
      volume: clamp(Number.isFinite(Number(options?.volume)) ? Number(options.volume) : 1, 0, 1),
      muted: Boolean(options?.muted),
      loop: Boolean(options?.loop),
      // Event placement is an override of its template—not a second template.
      layoutInstance: options?.layoutInstance && typeof options.layoutInstance === "object" ? (() => {
        const instance = {
          x: clamp(Number(options.layoutInstance.x) || 0, 0, 1),
          y: clamp(Number(options.layoutInstance.y) || 0, 0, 1),
          width: clamp(Number(options.layoutInstance.width) || .76, .12, 1),
          height: clamp(Number(options.layoutInstance.height) || .68, .12, 1)
        };
        // Previous builds created this default override for every event.
        // Discard that exact legacy value so those events again inherit the
        // current Media-tab type preset; deliberate adjustments remain local.
        const legacyDefault = (instance.x === .12 && instance.y === .12 && instance.width === .76 && instance.height === .68)
          // The next default was an almost-full-frame event rectangle.  It
          // was written for every legacy sticker event, so it too must link
          // back to the shared Media preset rather than pinning old geometry.
          || (instance.x === .01 && instance.y === .02 && instance.width === .98 && instance.height === .96);
        return legacyDefault ? null : instance;
      })() : null
    }])),
    pin: (() => {
      const bodyStrokeColor = /^#[0-9a-f]{6}$/i.test(sticker.pin?.bodyStrokeColor || "") ? sticker.pin.bodyStrokeColor : "#ffffff";
      const bodyStrokeWidth = clamp(Number(sticker.pin?.bodyStrokeWidth) || 3, 0, 12);
      const graphicStrokeColor = /^#[0-9a-f]{6}$/i.test(sticker.pin?.graphicStrokeColor || "") ? sticker.pin.graphicStrokeColor : "#ffffff";
      const graphicStrokeWidth = clamp(Number(sticker.pin?.graphicStrokeWidth) || 0, 0, 12);
      return {
      style: ["graphic", "symbol", "letter", "number", "preview", "blank"].includes(sticker.pin?.style) ? sticker.pin.style : "graphic",
      shapeEnabled: sticker.objectClass === "pin" ? true : Boolean(sticker.pin?.shapeEnabled),
      symbol: String(sticker.pin?.symbol || "•"),
      color: /^#[0-9a-f]{6}$/i.test(sticker.pin?.color || "") ? sticker.pin.color : "#1f7a5c",
      variant: ["down-left", "down-middle", "down-right"].includes(sticker.pin?.variant)
        ? sticker.pin.variant
        : ({ "default": "down-left", "slot-1": "down-middle", "slot-2": "down-right" }[sticker.pin?.variant] || "down-middle"),
      shape: ["round", "square", "shield", "teardrop", "arrow", "heart", "plus", "speech", "note", "diamond", "hexagon", "octagon", "star", "notched-square", "capsule"].includes(sticker.pin?.shape) ? sticker.pin.shape : "round",
      noteText: String(sticker.pin?.noteText || "").slice(0, 8000),
      graphicUrl: String(sticker.pin?.graphicUrl || ""),
      graphicScale: clamp(Number(sticker.pin?.graphicScale) || 0.62, 0.15, 1.5),
      bodyStrokeColor,
      bodyStrokeWidth,
      graphicStrokeColor,
      graphicStrokeWidth,
      bodyStrokes: normalizePinStrokeStack(sticker.pin?.bodyStrokes, bodyStrokeColor, bodyStrokeWidth, "pin-body-stroke"),
      graphicStrokes: normalizePinStrokeStack(sticker.pin?.graphicStrokes, graphicStrokeColor, graphicStrokeWidth, "pin-graphic-stroke")
    };
    })(),
    activation: ["either", "automatic", "click", "timeline", "arrival", "departure"].includes(sticker.activation) ? sticker.activation : "either",
    customViewEnabled: Boolean(sticker.customViewEnabled),
    customView: normalizeSavedMapView(sticker.customView),
    customViewDelay: clamp(Number(sticker.customViewDelay) || 0, 0, 12),
    customViewRange: (() => {
      const start = clamp(Number(sticker.customViewRange?.start ?? sticker.triggerProgress) || 0, 0, 1);
      const end = clamp(Number(sticker.customViewRange?.end ?? sticker.triggerProgress) || 0, 0, 1);
      return { start: Math.min(start, end), end: Math.max(start, end) };
    })(),
    lat: clamp(lat, -90, 90),
    lon: clamp(lon, -180, 180),
    size: sizesByView[placedView],
    sizesByView,
    placedView,
    scope: ["route", "stop", "journey", "us"].includes(sticker.scope) ? sticker.scope : (Number.isInteger(sticker.routeIndex) ? "route" : placedView),
    placedZoom: clamp(Number(sticker.placedZoom) || 8, 1, 20),
    routeIndex: sticker.routeIndex !== null && sticker.routeIndex !== undefined && Number.isInteger(Number(sticker.routeIndex)) ? Math.max(0, Number(sticker.routeIndex)) : null,
    showAtAllZooms: Boolean(sticker.showAtAllZooms),
    visibility,
    stopId: String(sticker.stopId || ""),
    dayIso: isoDateValue(sticker.dayIso),
    timelineTime: Math.max(0, Number(sticker.timelineTime) || 0),
    triggerProgress: clamp(Number(sticker.triggerProgress) || 0, 0, 1),
    animation: {
      preset: ["fade", "bounce", "drop", "pop", "custom"].includes(sticker.animation?.preset) ? sticker.animation.preset : "fade",
      duration: clamp(Number(sticker.animation?.duration) || 0.5, 0.1, 3),
      frameCount: clamp(Math.round(Number(sticker.animation?.frameCount) || Math.round((Number(sticker.animation?.duration) || .5) * 30)), 1, 600),
      splitScale: Boolean(sticker.animation?.splitScale),
      splitPosition: Boolean(sticker.animation?.splitPosition),
      uniformScale: sticker.animation?.uniformScale !== false,
      loopMode: ["none", "timeline", "view"].includes(sticker.animation?.loopMode) ? sticker.animation.loopMode : "none",
      loopDelay: clamp(Number(sticker.animation?.loopDelay) || 0, 0, 5),
      pathFollowRoute: Boolean(sticker.animation?.pathFollowRoute),
      customPath: (Array.isArray(sticker.animation?.customPath) ? sticker.animation.customPath : []).map(point => ({ lat: Number(point.lat), lon: Number(point.lon) })).filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon)),
      opacity: clamp(Number.isFinite(Number(sticker.animation?.opacity)) ? Number(sticker.animation.opacity) : 1, 0, 1),
      scale: clamp(Number(sticker.animation?.scale) || 1, 0.1, 2),
      scaleX: clamp(Number(sticker.animation?.scaleX) || Number(sticker.animation?.scale) || 1, 0.1, 2),
      scaleY: clamp(Number(sticker.animation?.scaleY) || Number(sticker.animation?.scale) || 1, 0.1, 2),
      positionX: clamp(Number(sticker.animation?.positionX) || 0, -100, 100),
      positionY: clamp(Number(sticker.animation?.positionY) || 0, -100, 100),
      rotation: clamp(Number(sticker.animation?.rotation) || 0, -180, 180),
      keyframes: Object.fromEntries(["opacity", "scale", "scaleX", "scaleY", "rotation", "positionX", "positionY"].map(property => [property, (Array.isArray(sticker.animation?.keyframes?.[property]) ? sticker.animation.keyframes[property] : []).map(frame => ({ time: clamp(Number(frame.time) || 0, 0, 1), value: Number(frame.value) || 0, easing: ["linear", "ease", "ease-in", "ease-out", "hold", "bounce"].includes(frame.easing) ? frame.easing : "linear", intensity: clamp(Number(frame.intensity) || 1, 0.2, 2), pathMode: ["straight", "in-curve", "out-curve", "zig-zag", "wavy"].includes(frame.pathMode) ? frame.pathMode : "straight", pathFrequency: clamp(Math.round(Number(frame.pathFrequency) || 2), 1, 8) }))]))
    },
    sfx: {
      appear: typeof sfxNormalizeAssignment === "function" ? sfxNormalizeAssignment(sticker.sfx?.appear) : (sticker.sfx?.appear || null),
      hover: typeof sfxNormalizeAssignment === "function" ? sfxNormalizeAssignment(sticker.sfx?.hover) : (sticker.sfx?.hover || null)
    }
  };
}

function normalizeTripStickers(stickers = []) {
  return Array.isArray(stickers) ? stickers.map(normalizeSticker).filter(Boolean) : [];
}

function normalizeTripAnnotations(annotations = []) {
  const validTypes = new Set(["line", "arrow", "box"]);
  return (Array.isArray(annotations) ? annotations : []).map((annotation, index) => {
    const points = (Array.isArray(annotation?.points) ? annotation.points : [])
      .map(point => ({ lat: Number(point?.lat), lon: Number(point?.lon) }))
      .filter(point => Number.isFinite(point.lat) && Number.isFinite(point.lon));
    return {
      id: String(annotation?.id || `annotation-${Date.now()}-${index}`),
      type: validTypes.has(annotation?.type) ? annotation.type : "line",
      points,
      color: /^#[0-9a-f]{6}$/i.test(annotation?.color || "") ? annotation.color : "#2f6f55",
      weight: clamp(Number(annotation?.weight) || 4, 1, 16),
      opacity: clamp(Number(annotation?.opacity) || .9, .1, 1)
    };
  }).filter(annotation => annotation.points.length >= 2);
}

// Defaults are durable editor data, not a fallback baked into individual
// stickers. This is the first scoped-default record used by the universal
// "None selected" workflow; future appearance fields can be added here
// without rewriting existing sticker records.
function normalizeStickerDefaults(defaults = {}) {
  return {
    visibility: STICKER_VISIBILITY_OPTIONS.includes(defaults?.visibility)
      ? defaults.visibility
      : DEFAULT_STICKER_VISIBILITY,
    size: clamp(Number(defaults?.size) || 64, 20, 320)
  };
}

function normalizeProjectDefaults(defaults = {}) {
  return {
    sticker: normalizeStickerDefaults(defaults?.sticker),
    marker: normalizeMarkerSettings(defaults?.marker, DEFAULT_MARKER_SETTINGS)
  };
}

function normalizeTimelineDefaults(defaults = {}) {
  return {
    dayEndAction: ["wait", "next"].includes(defaults?.dayEndAction) ? defaults.dayEndAction : "wait"
  };
}

// Stops are the durable journey records; route "days" remain connecting legs
// so existing saved journeys and route editing continue to work unchanged.
const RETIRED_DEFAULT_MEDIA_IDS = new Set([
  "media-1784611358232-uodi6d",
  "media-1784606473405-pz5akv",
  "media-1784606367475-pdzhfe"
]);

function synchronizeTripStops(trip, savedStops = trip?.stops) {
  if (!trip) return [];
  const routes = trip.days || [];
  if (!routes.length) {
    trip.stops = [];
    return trip.stops;
  }
  const existing = Array.isArray(savedStops) ? savedStops : [];
  const endpointData = [
    { routeIndex: 0, anchor: "start" },
    ...routes.map((route, routeIndex) => ({ routeIndex, anchor: "end" }))
  ];
  trip.stops = endpointData.map((endpoint, stopIndex) => {
    const route = routes[endpoint.routeIndex];
    const point = sharedStopPointForEndpoint(trip, endpoint.routeIndex, endpoint.anchor);
    const linkedId = endpoint.anchor === "start" ? route?.startStopId : route?.endStopId;
    const prior = existing.find(stop => linkedId && stop.id === linkedId) || existing[stopIndex] || {};
    const neighboringDate = endpoint.anchor === "start"
      ? route?.sequenceDate || ""
      : route?.sequenceDate || "";
    const fallback = {
      id: linkedId,
      name: sharedStopNameForEndpoint(trip, endpoint.routeIndex, endpoint.anchor),
      address: endpoint.anchor === "start" ? route?.startAddress : route?.endAddress,
      lat: point?.lat,
      lon: point?.lon,
      arrivalDate: endpoint.anchor === "end" ? neighboringDate : "",
      departureDate: endpoint.anchor === "start" ? neighboringDate : routes[endpoint.routeIndex + 1]?.sequenceDate || ""
    };
    return normalizeTripStop(prior, fallback);
  });
  routes.forEach((route, index) => {
    const start = trip.stops[index];
    const end = trip.stops[index + 1];
    route.startStopId = start?.id || "";
    route.endStopId = end?.id || "";
    route.travelStartDate = isoDateValue(route.travelStartDate || start?.departureDate || end?.arrivalDate);
    route.travelEndDate = isoDateValue(route.travelEndDate || end?.arrivalDate || start?.departureDate);
  });
  return trip.stops;
}

// These embeds were accidentally checked into the default journey data.  Keep
// this migration deliberately ID-scoped so it only cleans those obsolete
// defaults from already-saved browsers; it never affects user-added media.
function removeRetiredDefaultMedia(trips = state.trips) {
  let removed = 0;
  (trips || []).forEach(trip => {
    const owners = [...(trip.days || []), ...synchronizeTripStops(trip)];
    owners.forEach(owner => {
      if (!Array.isArray(owner?.media)) return;
      const retained = owner.media.filter(item => !RETIRED_DEFAULT_MEDIA_IDS.has(item?.id));
      removed += owner.media.length - retained.length;
      owner.media = retained;
    });
  });
  return removed;
}



function makeTrip(name, days = []) {
  const trip = {
    id: `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || "Untitled Trip",
    dayNamePattern: DEFAULT_DAY_NAME_PATTERN,
    tripStartDate: "",
    zoneSettings: { ...DEFAULT_ZONE_SETTINGS },
    markerSettings: cloneMarkerSettings(state?.projectDefaults?.marker || DEFAULT_MARKER_SETTINGS),
    landmarkSettings: cloneLandmarkSettings(landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS),
    displayPositions: normalizeDisplayPositions(),
    journeyStyle: normalizeJourneyStyle({}, state.trips.length),
    savedView: null,
    viewportBoundsByDevice: {},
    stickerDefaults: normalizeStickerDefaults(state?.projectDefaults?.sticker),
    timelineDefaults: normalizeTimelineDefaults(),
    stickers: [],
    annotations: [],
    stops: [],
    days
  };
  synchronizeTripStops(trip);
  return trip;
}



function routeEndpointName(route, kind) {
  if (!route) return kind === "start" ? "Start" : "End";
  if (kind === "start") {
    const routeIndex = state.routes.indexOf(route);
    if (!route.startNameIndependent && routeIndex > 0) {
      return routeEndpointName(state.routes[routeIndex - 1], "end");
    }
    if (route.startName) return route.startName;
  }
  if (kind === "end" && route.endName) return route.endName;
  const summary = route?.summary || route?.title || "";
  const parts = summary.split(/\s+\bto\b\s+/i).map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) return kind === "start" ? parts[0] : parts[parts.length - 1];
  if (kind === "start" && (route.startQuery || route.startAddress)) return route.startQuery || route.startAddress;
  if (kind === "end" && (route.endQuery || route.endAddress)) return route.endQuery || route.endAddress;
  return kind === "start" ? "Start" : "End";
}



function activeRoute() {
  return state.routes[state.activeRouteIndex] || null;
}



function sharedStopKeyForEndpoint(trip, routeIndex, anchor) {
  const days = trip?.days || state.routes;
  const route = days[routeIndex];
  const linkedStopId = anchor === "start" ? route?.startStopId : route?.endStopId;
  if (linkedStopId) return linkedStopId;
  if (anchor === "start" && routeIndex > 0) {
    return landmarkStopKey(`day boundary ${routeIndex - 1} ${routeIndex}`);
  }
  if (anchor === "end" && routeIndex < days.length - 1) {
    return landmarkStopKey(`day boundary ${routeIndex} ${routeIndex + 1}`);
  }
  return landmarkStopKey(routeEndpointName(days[routeIndex], anchor)) || `${routeIndex}:${anchor}`;
}

function sharedStopNameForEndpoint(trip, routeIndex, anchor) {
  const days = trip?.days || state.routes;
  if (anchor === "start" && routeIndex > 0) {
    return routeEndpointName(days[routeIndex - 1], "end");
  }
  return routeEndpointName(days[routeIndex], anchor);
}

function sharedStopPointForEndpoint(trip, routeIndex, anchor) {
  const days = trip?.days || state.routes;
  const route = days[routeIndex];
  if (anchor === "start" && routeIndex > 0) {
    const previousRoute = days[routeIndex - 1];
    const previousPoints = previousRoute?.points || [];
    return previousPoints[previousPoints.length - 1] || route?.points?.[0] || null;
  }
  const points = route?.points || [];
  return anchor === "end" ? points[points.length - 1] || null : points[0] || null;
}



function serializeTrips(trips = state.trips) {
  return trips.map((trip, tripIndex) => {
    synchronizeTripStops(trip);
    return ({
    id: trip.id,
    name: trip.name,
    dayNamePattern: trip.dayNamePattern || DEFAULT_DAY_NAME_PATTERN,
    tripStartDate: trip.tripStartDate || "",
    zoneSettings: normalizeZoneSettings(trip.zoneSettings, DEFAULT_ZONE_SETTINGS),
    markerSettings: normalizeMarkerSettings(trip.markerSettings, DEFAULT_MARKER_SETTINGS),
    landmarkSettings: normalizeLandmarkSettings(trip.landmarkSettings),
    displayPositions: normalizeDisplayPositions(trip.displayPositions),
    journeyStyle: normalizeJourneyStyle(trip.journeyStyle, tripIndex),
    savedView: normalizeSavedMapView(trip.savedView),
    viewportBoundsByDevice: normalizeJourneyViewportBoundsByDevice(trip.viewportBoundsByDevice),
    stickerDefaults: normalizeStickerDefaults(trip.stickerDefaults),
    timelineDefaults: normalizeTimelineDefaults(trip.timelineDefaults),
    stickers: normalizeTripStickers(trip.stickers),
    annotations: normalizeTripAnnotations(trip.annotations),
    stops: trip.stops.map(stop => {
      const normalized = normalizeTripStop(stop);
      return {
        ...normalized,
        media: normalized.media.map(serializeTripMediaRecord)
      };
    }),
    days: trip.days.map(route => ({
      id: route.id,
      title: route.title,
      label: route.label,
      summary: route.summary,
      source: route.source,
      color: route.color,
      durationSeconds: route.durationSeconds,
      startAddress: route.startAddress,
      endAddress: route.endAddress,
      startName: route.startName,
      endName: route.endName,
      startNameIndependent: route.startNameIndependent,
      startQuery: route.startQuery,
      endQuery: route.endQuery,
      isRestDay: route.isRestDay,
      autoLabel: route.autoLabel,
      sequenceNumber: route.sequenceNumber,
      sequenceDate: route.sequenceDate,
      startStopId: route.startStopId,
      endStopId: route.endStopId,
      travelStartDate: route.travelStartDate,
      travelEndDate: route.travelEndDate,
      independentStart: route.independentStart,
      addressHistory: route.addressHistory,
      waypoints: normalizeRouteWaypoints(route.waypoints),
      zoneSettings: normalizeZoneSettings(route.zoneSettings, normalizeZoneSettings(trip.zoneSettings, DEFAULT_ZONE_SETTINGS)),
      markerSettings: normalizeMarkerSettings(route.markerSettings, normalizeMarkerSettings(trip.markerSettings, DEFAULT_MARKER_SETTINGS)),
      markerEndpoints: normalizeMarkerEndpoints(route.markerEndpoints, normalizeMarkerSettings(route.markerSettings, normalizeMarkerSettings(trip.markerSettings, DEFAULT_MARKER_SETTINGS))),
      savedView: normalizeSavedMapView(route.savedView),
      mediaManualOrder: route.mediaManualOrder,
      mediaNumberingStyle: route.mediaNumberingStyle || "decimal",
      media: route.media.map(serializeTripMediaRecord),
      points: route.points
    }))
  });
  });
}



function isValidTripsPayload(payload) {
  return Array.isArray(payload?.tripGroups)
    ? payload.tripGroups.length > 0 && payload.tripGroups.every(group => Array.isArray(group?.journeys) && group.journeys.every(trip => Array.isArray(trip?.days)))
    : Array.isArray(payload?.trips)
    && payload.trips.length > 0
    && payload.trips.every(trip => Array.isArray(trip?.days));
}

function makeUniqueTripId(baseId, existingIds) {
  let nextId = baseId || `trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  while (existingIds.has(nextId)) {
    nextId = `${baseId || "trip"}-${Math.random().toString(36).slice(2, 8)}`;
  }
  existingIds.add(nextId);
  return nextId;
}

function makeUniqueRouteId(baseId, existingIds) {
  let nextId = baseId || `day-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  while (existingIds.has(nextId)) {
    nextId = `${baseId || "day"}-${Math.random().toString(36).slice(2, 8)}`;
  }
  existingIds.add(nextId);
  return nextId;
}

function appendTripsPayload(saved) {
  const incomingTrips = hydrateTripsPayload(saved);
  const existingTripIds = new Set(state.trips.map(trip => trip.id));
  const existingRouteIds = new Set(state.trips.flatMap(trip => trip.days.map(day => day.id)));
  incomingTrips.forEach(trip => {
    trip.id = makeUniqueTripId(trip.id, existingTripIds);
    trip.days.forEach(day => {
      day.id = makeUniqueRouteId(day.id, existingRouteIds);
    });
  });
  const firstNewTripIndex = state.trips.length;
  state.trips.push(...incomingTrips);
  state.activeTripIndex = firstNewTripIndex;
  state.routes = state.trips[firstNewTripIndex].days;
  state.activeRouteIndex = clamp(Number(saved.activeRouteIndex) || 0, 0, Math.max(0, state.routes.length - 1));
  return incomingTrips;
}



function hydrateTripsPayload(saved) {
  if (!isValidTripsPayload(saved)) {
    throw new Error("Saved journey data is missing its journey list.");
  }
  const trips = saved.trips.map((trip, tripIndex) => {
    const tripZoneSettings = normalizeZoneSettings(trip.zoneSettings, DEFAULT_ZONE_SETTINGS);
    const tripMarkerSettings = normalizeMarkerSettings(trip.markerSettings, DEFAULT_MARKER_SETTINGS);
    const hydratedTrip = makeTrip(trip.name, (trip.days || []).map(day => {
      if (!Array.isArray(day.points) || day.points.length < 2) {
        throw new Error(`${day.label || day.title || "A saved day"} has no usable route points.`);
      }
      return makeRoute({
        title: day.title || day.label || "Route",
        points: day.points
      }, {
        ...day,
        autoLabel: day.autoLabel !== undefined ? day.autoLabel : /^day\s+\d+$/i.test(day.label || day.title || ""),
        zoneSettings: normalizeZoneSettings(day.zoneSettings, tripZoneSettings),
        markerSettings: normalizeMarkerSettings(day.markerSettings, tripMarkerSettings),
        markerEndpoints: normalizeMarkerEndpoints(day.markerEndpoints, normalizeMarkerSettings(day.markerSettings, tripMarkerSettings)),
        media: day.media || []
      });
    }));
    hydratedTrip.id = trip.id || hydratedTrip.id;
    hydratedTrip.dayNamePattern = trip.dayNamePattern || DEFAULT_DAY_NAME_PATTERN;
    hydratedTrip.tripStartDate = trip.tripStartDate || "";
    hydratedTrip.zoneSettings = tripZoneSettings;
    hydratedTrip.markerSettings = tripMarkerSettings;
    hydratedTrip.landmarkSettings = normalizeLandmarkSettings(trip.landmarkSettings);
    hydratedTrip.displayPositions = normalizeDisplayPositions(trip.displayPositions);
    hydratedTrip.journeyStyle = normalizeJourneyStyle(trip.journeyStyle, tripIndex);
    hydratedTrip.savedView = normalizeSavedMapView(trip.savedView);
    hydratedTrip.viewportBoundsByDevice = normalizeJourneyViewportBoundsByDevice(trip.viewportBoundsByDevice);
    hydratedTrip.stickerDefaults = normalizeStickerDefaults(trip.stickerDefaults);
    hydratedTrip.timelineDefaults = normalizeTimelineDefaults(trip.timelineDefaults);
    hydratedTrip.stickers = normalizeTripStickers(trip.stickers);
    hydratedTrip.annotations = normalizeTripAnnotations(trip.annotations);
    hydratedTrip.days.forEach((route, routeIndex) => {
      route.savedView = normalizeSavedMapView(trip.days?.[routeIndex]?.savedView);
    });
    synchronizeTripStops(hydratedTrip, trip.stops);
    resequenceTripDayLabels(hydratedTrip);
    return hydratedTrip;
  });
  return trips;
}

function applyTripsPayload(saved) {
  const groups = Array.isArray(saved.tripGroups)
    ? saved.tripGroups.map((group, index) => ({
      id: String(group.id || `trip-group-${Date.now()}-${index}`),
      name: String(group.name || `Trip ${index + 1}`),
      journeys: hydrateTripsPayload({ trips: group.journeys })
    }))
    : [{ id: "trip-group-1", name: "Trip 1", journeys: hydrateTripsPayload(saved) }];
  state.projectDefaults = normalizeProjectDefaults(saved.projectDefaults);
  state.tripGroups = groups;
  state.activeTripGroupIndex = clamp(Number(saved.activeTripGroupIndex) || 0, 0, groups.length - 1);
  const activeGroup = groups[state.activeTripGroupIndex];
  state.trips = activeGroup.journeys;
  state.itineraryRevision = String(saved.itineraryRevision || "");
  state.activeTripIndex = clamp(Number(activeGroup.activeJourneyIndex ?? saved.activeTripIndex) || 0, 0, state.trips.length - 1);
  const trip = activeTrip();
  state.routes = trip?.days || [];
  state.activeRouteIndex = clamp(Number(saved.activeRouteIndex) || 0, 0, Math.max(0, state.routes.length - 1));
  renderTripGroupSelect?.();
}
