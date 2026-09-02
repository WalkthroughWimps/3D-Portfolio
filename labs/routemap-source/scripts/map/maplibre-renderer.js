"use strict";

// MapLibre basemap lifecycle, provider styles, semantic theming, routes, and synchronization.

function defaultMapLibreStyle() {
  return MAPLIBRE_STYLES.find(style => style.id === DEFAULT_MAPLIBRE_STYLE_ID) || MAPLIBRE_STYLES[0];
}

function activeMapLibreStyle() {
  return MAPLIBRE_STYLES.find(style => style.id === activeMapLibreStyleId) || defaultMapLibreStyle();
}

function mapLibreStyleUrl(style = activeMapLibreStyle()) {
  const override = els.mapLibreApiKey?.value.trim();
  return override || style.styleUrl;
}

function setMapThemeMode(mode = "custom") {
  // Provider styles are now treated as editable semantic themes.
  // Keeping the runtime mode as custom avoids a second, non-editable theme path.
  mapThemeMode = "custom";
}

function texturelessLayerTexture() {
  return layerTexture({
    enabled: false,
    type: "none",
    opacity: 0,
    blend: "normal",
    blendAmount: 0,
    secondaryEnabled: false,
    secondaryType: "none",
    secondaryScale: 1,
    secondaryOpacity: 0,
    secondaryBlend: "normal"
  });
}

function clearEditableMapTextures() {
  Object.values(layerStyles).forEach(style => {
    if (style && typeof style === "object" && style.texture) {
      style.texture = texturelessLayerTexture();
    }
  });
  if (layerStyles.texture) {
    layerStyles.texture.size = 0;
    layerStyles.texture.opacity = 0;
  }
  setRouteThemeTexture(null);
  refreshLayerTextureOverlays?.();
}

function styleStateWithoutTextures(styleState = {}) {
  return Object.fromEntries(Object.entries(styleState || {}).map(([key, value]) => {
    if (!value || typeof value !== "object") return [key, value];
    const clean = { ...value };
    delete clean.texture;
    return [key, clean];
  }));
}

function themeWithoutTextures(theme = {}) {
  return {
    ...theme,
    styles: styleStateWithoutTextures(theme.styles || {}),
    texture: null
  };
}

function mapLibreStyleReadyForSemanticTheme() {
  return Boolean(mapLibreMap?.getStyle?.()?.layers?.length > 1);
}

function mapElementsProbablyReady() {
  if (!mapLibreBasemapEnabled()) return true;
  if (!mapLibreMap || mapLibreBasemap.hidden) return false;
  if (!mapLibreStyleReadyForSemanticTheme()) return false;
  if (mapLibreLayerIds().length > 20) return true;
  if (typeof mapLibreMap.loaded === "function" && mapLibreMap.loaded()) return true;
  if (typeof mapLibreMap.areTilesLoaded === "function" && mapLibreMap.areTilesLoaded()) return true;
  return false;
}

function setMapElementsLoading(loading) {
  const stage = els.mapCanvas?.closest?.(".map-stage");
  if (!stage) return;
  // Editor/User preview switching is a view change, never a load. Async map
  // work may finish afterward, so suppress the surface at its source.
  if (globalThis.rvSuppressLoadingSurfaces) {
    clearMapElementsLoading();
    if (els.empty) els.empty.hidden = true;
    if (els.welcomeGate) els.welcomeGate.hidden = true;
    return;
  }
  if (loading) {
    mapElementsLoadingDepth += 1;
    stage.classList.add("is-map-elements-loading");
    setWelcomeGateReady(false, "Loading roads and map features...");
    return;
  }
  mapElementsLoadingDepth = Math.max(0, mapElementsLoadingDepth - 1);
  if (mapElementsLoadingDepth === 0) {
    stage.classList.remove("is-map-elements-loading");
    refreshWelcomeGateState();
  }
}

function clearMapElementsLoading() {
  const stage = els.mapCanvas?.closest?.(".map-stage");
  mapElementsLoadingDepth = 0;
  stage?.classList.remove("is-map-elements-loading");
  refreshWelcomeGateState();
}

function waitForMapElementsReady({ timeout = 20000, minDelay = 160 } = {}) {
  if (!mapLibreBasemapEnabled()) return Promise.resolve(true);
  const startedAt = Date.now();
  return new Promise(resolve => {
    let timer = null;
    const finish = ready => {
      clearTimeout(timer);
      if (ready) setWelcomeGateReady(true, "Map ready.");
      resolve(ready);
    };
    const check = () => {
      if (!mapLibreBasemapEnabled()) {
        finish(true);
        return;
      }
      if (Date.now() - startedAt >= timeout) {
        finish(mapElementsProbablyReady());
        return;
      }
      if (Date.now() - startedAt >= minDelay && mapElementsProbablyReady()) {
        finish(true);
        return;
      }
      timer = window.setTimeout(check, 120);
    };
    check();
  });
}

async function guardMapElementLoad(task, options = {}) {
  setMapElementsLoading(true);
  try {
    const result = typeof task === "function" ? await task() : task;
    let ready = await waitForMapElementsReady(options);
    if (!ready && mapLibreBasemapEnabled() && mapLibreLayerIds().length <= 1 && !options.skipRecovery) {
      console.warn("MapLibre style still has no themeable layers; retrying base style load.");
      await loadCustomMapLibreTheme(activeTheme || activeThemeFromLayerStyles(), { forceBaseReload: true });
      ready = await waitForMapElementsReady({ ...options, timeout: Math.max(4000, Number(options.timeout) || 0), skipRecovery: true });
    }
    if (!ready && mapLibreBasemapEnabled()) {
      setMapLibreStatus("Map elements are still loading. Try switching themes or refreshing if the map remains blank.");
      console.warn("Map elements did not fully report ready before timeout.", {
        layers: mapLibreLayerIds().length,
        loaded: mapLibreMap?.loaded?.(),
        tilesLoaded: mapLibreMap?.areTilesLoaded?.()
      });
    }
    return result;
  } finally {
    clearMapElementsLoading();
  }
}

async function ensureSingleMapLibreThemeBase(theme = activeThemeFromLayerStyles()) {
  baseMapMode = "maplibre";
  if (els.enableMapLibre) {
    els.enableMapLibre.checked = true;
  }
  disableLeafletRasterBasemap();
  disableLocalRoadVectorLayers();
  mapLibreBasemap.hidden = false;
  els.mapCanvas.classList.add("using-maplibre-basemap");
  setLeafletBasePanesForMapLibre(true);

  if (!mapLibreMap || !mapLibreStyleReadyForSemanticTheme()) {
    await loadCustomMapLibreTheme(theme);
    return;
  }

  refreshMapLibreThemeGroups(mapLibreMap.getStyle());
  applyThemeToMapLibreRenderer(theme);
  applyTextureOverlays(theme);
  refreshEndpointMarkers?.();
  syncMapLibreToLeaflet?.(null, { resize: true });
  setMapLibreBasemapVisible(true);
  updateLocalRoadPackageControls();
}

function disableLeafletRasterBasemap() {
  setLayerVisible(roadBasemapLayer, false);
  setLayerVisible(streetLayer, false);
  setLayerVisible(faintStreetLayer, false);
}

function setMapLibreBasemapVisible(visible) {
  if (!mapLibreBasemap) return;
  mapLibreBasemap.style.visibility = visible ? "" : "hidden";
  mapLibreBasemap.style.opacity = visible ? "1" : "0";
  mapLibreBasemap.style.pointerEvents = visible ? "" : "none";
}

async function fetchMapLibreStyle(style = activeMapLibreStyle()) {
  const styleUrl = mapLibreStyleUrl(style);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(styleUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`OpenFreeMap style failed to load (${response.status}).`);
    }
    return normalizeMapLibreStyleUrls(await response.json(), styleUrl);
  } finally {
    window.clearTimeout(timeout);
  }
}

// These GeoJSON layers are only visible when the vector basemap is unavailable.
// Loading them during the normal MapLibre startup competes with the map style,
// tiles, and journey data for bandwidth and main-thread parsing time.
let leafletFallbackFeaturePromise = null;

function ensureLeafletFallbackFeatures() {
  if (!leafletFallbackFeaturePromise) {
    markMapStartup("leaflet-fallback-features-begin");
    leafletFallbackFeaturePromise = Promise.allSettled([
      loadLandMask(),
      loadWaterFeatures(),
      loadStateLines()
    ]).then(results => {
      markMapStartup("leaflet-fallback-features-ready");
      return results;
    });
  }
  return leafletFallbackFeaturePromise;
}

function absoluteStyleUrl(value, baseUrl) {
  if (!value || /^[a-z]+:\/\//i.test(value) || value.startsWith("mapbox://")) {
    return value;
  }
  return new URL(value, baseUrl).toString();
}

function normalizeMapLibreStyleUrls(style, baseUrl) {
  if (style.sprite) {
    style.sprite = absoluteStyleUrl(style.sprite, baseUrl);
  }
  if (style.glyphs) {
    style.glyphs = absoluteStyleUrl(style.glyphs, baseUrl);
  }
  Object.values(style.sources || {}).forEach(source => {
    if (typeof source.url === "string") {
      const cleanUrl = source.url.trim();
      if (cleanUrl) source.url = absoluteStyleUrl(cleanUrl, baseUrl);
      else delete source.url;
    }
    if (Array.isArray(source.tiles)) {
      source.tiles = source.tiles
        .filter(tileUrl => typeof tileUrl === "string" && tileUrl.trim())
        .map(tileUrl => absoluteStyleUrl(tileUrl.trim(), baseUrl));
    }
  });
  return style;
}

function setMapLibreStatus(message = "") {
  mapLibreStatusMessage = message;
  if (els.mapLibreStatus) {
    els.mapLibreStatus.textContent = message;
  }
  renderLocalRoadSourceStatus();
}

function mapLibreBasemapEnabled() {
  return baseMapMode === "maplibre" && Boolean(els.enableMapLibre?.checked);
}

function mapLibreLayerIds(mapInstance = mapLibreMap) {
  return mapInstance?.getStyle?.()?.layers?.map(layer => layer.id) || [];
}

function logMapLibreStyleState(label = "MapLibre style", mapInstance = mapLibreMap) {
  if (!DEBUG_MAPLIBRE_THEME) return;
  const style = mapInstance?.getStyle?.();
  console.log(`${label}:`, style);
  console.log(`${label} layers:`, style?.layers?.map(layer => layer.id));
  console.log("Layer count:", style?.layers?.length || 0);
}

function highwaysVisible() {
  return Boolean(els.toggleHighways?.checked);
}

function majorRoadsVisible() {
  return Boolean(els.toggleStreet?.checked || highwaysVisible());
}

function minorRoadsVisible() {
  return Boolean(els.toggleFaintStreet?.checked);
}

function anyRoadsVisible() {
  return Boolean(majorRoadsVisible() || minorRoadsVisible() || els.toggleRailroads?.checked);
}

function repaintMapLibreSemanticTheme({ resize = false } = {}) {
  if (!mapLibreBasemapEnabled() || mapThemeMode !== "custom") return;
  activeTheme = activeThemeFromLayerStyles();
  refreshMapLibreThemeGroups(mapLibreMap?.getStyle?.());
  applyThemeToMapLibreRenderer(activeTheme);
  applyTextureOverlays(activeTheme);
  updateMapLibreRouteLayerPaint?.();
  if (resize) {
    syncMapLibreToLeaflet?.(null, { resize: true });
  }
}

function scheduleMapLibreThemeRefresh(delay = 60) {
  clearTimeout(mapLibreThemeRefreshTimer);
  if (!mapLibreBasemapEnabled()) return;
  if (mapThemeMode !== "custom") return;
  mapLibreThemeRefreshTimer = setTimeout(() => {
    repaintMapLibreSemanticTheme({ resize: false });
  }, delay);
}

function handleMapLibreError(event) {
  const message = event?.error?.message || String(event?.error || "OpenFreeMap style failed to load.");
  const details = {
    message,
    sourceId: String(event?.sourceId || event?.source?.id || ""),
    layerId: String(event?.layer?.id || event?.style?.id || ""),
    tile: event?.tile?.tileID?.canonical ? String(event.tile.tileID.canonical) : ""
  };
  window.__rvMapLibreErrorDetails ||= [];
  window.__rvMapLibreErrorDetails.push(details);
  window.__rvMapLibreErrorDetails = window.__rvMapLibreErrorDetails.slice(-100);
  handleMapLibreError.reported ||= new Set();
  const fingerprint = JSON.stringify(details);
  if (!handleMapLibreError.reported.has(fingerprint)) {
    handleMapLibreError.reported.add(fingerprint);
    console.error(`MapLibre style error: ${message}`, details);
  }
  setMapLibreStatus(message);
  const sourceId = String(event?.sourceId || event?.source?.id || "").toLowerCase();
  const age = Date.now() - mapLibreStyleLoadStartedAt;
  const isPrimaryVectorTileError = sourceId === "openmaptiles" || message.toLowerCase().includes("openmaptiles");
  if (!mapLibreBasemapEnabled() || !isPrimaryVectorTileError || age > 15000) {
    return;
  }
  mapLibreOpenMapTileErrors += 1;
  if (mapLibreOpenMapTileErrors >= 6) {
    fallbackToLeafletRoadsFromMapLibre(new Error("OpenFreeMap vector tiles failed repeatedly; using Leaflet road fallback."));
  }
}

const MAPLIBRE_HIDDEN_BASE_PANES = [
  "roadBasemapPane",
  "oceanPane",
  "landPane",
  "waterPane",
  "topographyPane",
  "streetPane",
  "streetVectorPane",
  "boundaryPane"
];

function setLeafletBasePanesForMapLibre(enabled) {
  MAPLIBRE_HIDDEN_BASE_PANES.forEach(paneName => {
    const pane = map.getPane(paneName);
    if (!pane) return;
    pane.style.opacity = enabled ? "0" : "";
    pane.style.pointerEvents = enabled ? "none" : "";
  });
  if (roadBasemapLayer) {
    setLayerVisible(roadBasemapLayer, !enabled);
  }
  [mapThemeOverlay, topographyTintOverlay].forEach(overlay => {
    if (!overlay) return;
    overlay.style.opacity = enabled ? "0" : "";
    overlay.style.pointerEvents = enabled ? "none" : "";
  });
  Object.values(layerTextureOverlays).forEach(overlay => {
    if (overlay) overlay.style.pointerEvents = "none";
  });
  streetVectorOverlay.hidden = true;
  streetVectorOverlay.classList.remove("is-ready");
}

const MAPLIBRE_LEAFLET_ZOOM_OFFSET = 1;

function leafletZoomToMapLibreZoom(leafletZoom) {
  const zoom = Number(leafletZoom);
  return Number.isFinite(zoom) ? zoom - MAPLIBRE_LEAFLET_ZOOM_OFFSET : zoom;
}

function mapLibreZoomToLeafletZoom(mapLibreZoom) {
  const zoom = Number(mapLibreZoom);
  return Number.isFinite(zoom) ? zoom + MAPLIBRE_LEAFLET_ZOOM_OFFSET : zoom;
}

function syncMapLibreToLeaflet(targetZoom = null, options = {}) {
  if (!mapLibreMap || baseMapMode !== "maplibre") return;
  if (syncingMapLibreToLeaflet) return;
  syncingMapLibreToLeaflet = true;
  try {
    const center = options.center || map.getCenter();
    const leafletZoom = Number.isFinite(targetZoom) ? targetZoom : map.getZoom();
    const zoom = leafletZoomToMapLibreZoom(leafletZoom);
    if (options.resize) {
      mapLibreMap.resize();
    }
    mapLibreMap.jumpTo({
      center: [center.lng, center.lat],
      zoom,
      bearing: 0,
      pitch: 0
    });
    applyMapLibreRoadDetailVisibility(leafletZoom);
  } finally {
    syncingMapLibreToLeaflet = false;
  }
}

let mapLibreRoadDetailVisibilityKey = "";

function isMapLibreRoadLayer(layer) {
  if (!layer || !["line", "symbol"].includes(layer.type)) return false;
  const text = mapLibreLayerText(layer);
  return /transportation|transport|road|highway|motorway|trunk|primary|secondary|tertiary|residential|service|unclassified|street/.test(text);
}

function isMapLibreLocalRoadLayer(layer) {
  const text = mapLibreLayerText(layer);
  return !/motorway|trunk|primary|secondary|highway/.test(text)
    || /tertiary|residential|service|unclassified|minor|local|street|track|path/.test(text);
}

// Keep neighborhood streets and their names out of the broad overview, but
// bring both back together at close range.  Road-name symbols must be handled
// explicitly: they are symbol layers, so the generic line-road styling never
// touched them before.
function applyMapLibreRoadDetailVisibility(leafletZoom = map.getZoom()) {
  if (!mapLibreMap?.getStyle?.()) return;
  const closeRoadZoom = 10;
  const closeLabelZoom = 11;
  const key = [Math.floor(leafletZoom * 4) / 4, majorRoadsVisible(), minorRoadsVisible()].join(":");
  if (key === mapLibreRoadDetailVisibilityKey) return;
  mapLibreRoadDetailVisibilityKey = key;
  mapLibreMap.getStyle().layers.forEach(layer => {
    if (!isMapLibreRoadLayer(layer) || !mapLibreMap.getLayer(layer.id)) return;
    const local = isMapLibreLocalRoadLayer(layer);
    const visible = local
      // Close-detail streets are intentionally automatic. The minor-road
      // toggle still controls the overview treatment, but a user who zooms
      // into a town needs the street fabric and names to orient themselves.
      ? leafletZoom >= (layer.type === "symbol" ? closeLabelZoom : closeRoadZoom)
      : majorRoadsVisible();
    try {
      mapLibreMap.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
      if (local && layer.type === "line" && visible) {
        // Several OpenFreeMap styles use a generic transportation layer. It
        // is a minor-road layer semantically, but it has no class in its id,
        // so the editable-theme pass can leave its original near-zero opacity
        // in place. Set the close-detail stroke explicitly.
        mapLibreMap.setPaintProperty(layer.id, "line-color", styleColor("minorRoads"));
        mapLibreMap.setPaintProperty(layer.id, "line-opacity", clamp(0.64 + styleOpacity("minorRoads") * 0.28, 0.64, 0.92));
        mapLibreMap.setPaintProperty(layer.id, "line-width", mapLibreRoadWidth(mapLibreLayerText(layer)));
      }
    } catch (error) {
      console.warn(`Could not update road detail visibility for ${layer.id}.`, error);
    }
  });
}

function syncMediaBuilderViewportGeometry() {
  const viewport = els.userMapViewport;
  const stage = els.mapCanvas?.closest(".map-stage");
  if (!viewport || !stage) return;
  // Media previews use the same device and camera rectangle as the other
  // three map tabs. Media changes the placeholder inside that rectangle, not
  // the rectangle itself.
  viewport.style.removeProperty("width");
  viewport.style.removeProperty("height");
  viewport.style.top = `calc(var(--user-device-preview-top, 0px) + ${userFrameGeometry?.top ?? 96}px)`;
  viewport.style.right = `calc(var(--user-device-preview-right, 0px) + ${userFrameGeometry?.right ?? 96}px)`;
  viewport.style.bottom = `calc(var(--user-device-preview-bottom, 0px) + ${userFrameGeometry?.bottom ?? 128}px)`;
  viewport.style.left = `calc(var(--user-device-preview-left, 0px) + ${userFrameGeometry?.left ?? 96}px)`;
}

function syncMapAfterPanelLayoutChange() {
  requestAnimationFrame(() => {
    syncMediaBuilderViewportGeometry();
    updateSecondaryDrawerTogglePosition();
    positionRouteThemePicker();
    map.invalidateSize({ animate: false });
    if (mapLibreMap) {
      mapLibreMap.resize();
      syncMapLibreToLeaflet(null, { resize: true });
    }
    syncStreetVectorToLeaflet();
    refreshMapForCurrentLayout({ fit: false });
    if (document.body.classList.contains("media-builder-mode")) renderMediaStylePlaceholder();
  });
}

function fallbackToLeafletRoadsFromMapLibre(error) {
  if (els.enableMapLibre) {
    els.enableMapLibre.checked = false;
  }
  baseMapMode = "leaflet-fallback";
  mapLibreBasemap.hidden = true;
  els.mapCanvas.classList.remove("using-maplibre-basemap");
  setLeafletBasePanesForMapLibre(false);
  mapLibreMap?.remove();
  mapLibreMap = null;
  clearTimeout(mapLibreThemeRefreshTimer);
  setMapLibreStatus(error?.message || "Vector basemap failed; using Leaflet layers.");
  refreshNewElementLayers();
  refreshTopographyStyle();
  if (localRoadPackagesEnabled()) {
    loadProjectRoadPackageState().finally(() => {
      refreshStreetStyle();
      if (anyRoadsVisible()) {
        scheduleOsmRoadRefresh(0);
      }
    });
  } else {
    refreshStreetStyle();
  }
  renderLocalRoadSourceStatus();
  updateLocalRoadPackageControls();
  refreshTextureControlHonesty();
  void ensureLeafletFallbackFeatures();
}

function mapLibreLineWidth(size) {
  return [
    "interpolate", ["linear"], ["zoom"],
    3, Math.max(1, size * 0.58),
    6, size,
    10, size * 1.42
  ];
}



function mapLibreRouteFeatures() {
  const routeData = activeRoute();
  if (!routeData) return [];
  const features = [];

  if (state.overviewMode) {
    const focusIndex = state.overviewFocusIndex;
    state.routes.forEach((route, index) => {
      const focused = index === focusIndex;
      if (focused) {
        features.push(routeFeature(route, "halo", "#fffdf8", 0.88 * styleOpacity("route")));
        features.push(routeFeature(route, "active", styleColor("route"), styleOpacity("route")));
      }
      features.push(routeFeature(route, "faint", styleColor("faintRoute"), styleOpacity("faintRoute")));
    });
  } else {
    state.routes.forEach((route, index) => {
      if (index !== state.activeRouteIndex && els.toggleFaintRoute.checked) {
        features.push(routeFeature(route, "faint", styleColor("faintRoute"), styleOpacity("faintRoute")));
      }
    });
    if (els.toggleRoute.checked && !state.playback.hasStarted) {
      features.push(routeFeature(routeData, "halo", "#fffdf8", 0.88 * styleOpacity("route")));
      features.push(routeFeature(routeData, "active", styleColor("route"), styleOpacity("route")));
    }
    if (els.toggleFaintRoute.checked || state.playback.hasStarted) {
      features.push(routeFeature(routeData, "faint", styleColor("faintRoute"), styleOpacity("faintRoute")));
    }
  }

  if (state.playback.hasStarted) {
    const playbackPoints = state.playback.session?.points?.length
      ? state.playback.session.points
      : routeData.displayPoints;
    features.push({
      ...routeFeature({ displayPoints: partialRoutePoints(playbackPoints, state.playback.progress) }, "playback", styleColor("route"), styleOpacity("route"))
    });
  }

  if (els.toggleMarkers.checked && !state.overviewMode) {
    features.push(markerFeature(routeData.points[0], "Start"));
    features.push(markerFeature(routeData.points[routeData.points.length - 1], "End"));
  }

  return features;
}

function removeMapLibreRoutes() {
  if (!mapLibreMap) return;
  MAPLIBRE_ROUTE_LAYER_IDS.forEach(id => {
    if (mapLibreMap.getLayer(id)) {
      mapLibreMap.removeLayer(id);
    }
  });
  if (mapLibreMap.getSource(MAPLIBRE_ROUTE_SOURCE_ID)) {
    mapLibreMap.removeSource(MAPLIBRE_ROUTE_SOURCE_ID);
  }
}

function addMapLibreRouteLayers() {
  mapLibreMap.addLayer({
    id: "rv-route-faint",
    type: "line",
    source: MAPLIBRE_ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "faint"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": mapLibreLineWidth(styleSize("faintRoute")),
      "line-opacity": ["get", "opacity"]
    }
  });
  mapLibreMap.addLayer({
    id: "rv-route-halo",
    type: "line",
    source: MAPLIBRE_ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "halo"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": mapLibreLineWidth(styleSize("route") + layerStyles.route.halo),
      "line-opacity": ["get", "opacity"]
    }
  });
  mapLibreMap.addLayer({
    id: "rv-route-active",
    type: "line",
    source: MAPLIBRE_ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "active"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": mapLibreLineWidth(styleSize("route")),
      "line-opacity": ["get", "opacity"]
    }
  });
  mapLibreMap.addLayer({
    id: "rv-route-playback",
    type: "line",
    source: MAPLIBRE_ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "playback"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-width": mapLibreLineWidth(styleSize("route")),
      "line-opacity": ["get", "opacity"]
    }
  });
  mapLibreMap.addLayer({
    id: "rv-route-marker-halo",
    type: "circle",
    source: MAPLIBRE_ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "marker"],
    paint: {
      "circle-color": "#fffdf8",
      "circle-radius": mapLibreLineWidth(styleSize("startEnd") + 3),
      "circle-opacity": ["get", "opacity"]
    }
  });
  mapLibreMap.addLayer({
    id: "rv-route-marker",
    type: "circle",
    source: MAPLIBRE_ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "marker"],
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": mapLibreLineWidth(styleSize("startEnd")),
      "circle-opacity": ["get", "opacity"],
      "circle-stroke-color": "#fffdf8",
      "circle-stroke-width": 1
    }
  });
}

function updateMapLibreRouteLayerPaint() {
  if (mapLibreMap.getLayer("rv-route-faint")) {
    mapLibreMap.setPaintProperty("rv-route-faint", "line-width", mapLibreLineWidth(styleSize("faintRoute")));
  }
  if (mapLibreMap.getLayer("rv-route-halo")) {
    mapLibreMap.setPaintProperty("rv-route-halo", "line-width", mapLibreLineWidth(styleSize("route") + layerStyles.route.halo));
  }
  if (mapLibreMap.getLayer("rv-route-active")) {
    mapLibreMap.setPaintProperty("rv-route-active", "line-width", mapLibreLineWidth(styleSize("route")));
  }
  if (mapLibreMap.getLayer("rv-route-playback")) {
    mapLibreMap.setPaintProperty("rv-route-playback", "line-width", mapLibreLineWidth(styleSize("route")));
  }
  if (mapLibreMap.getLayer("rv-route-marker-halo")) {
    mapLibreMap.setPaintProperty("rv-route-marker-halo", "circle-radius", mapLibreLineWidth(styleSize("startEnd") + 3));
  }
  if (mapLibreMap.getLayer("rv-route-marker")) {
    mapLibreMap.setPaintProperty("rv-route-marker", "circle-radius", mapLibreLineWidth(styleSize("startEnd")));
  }
}

function syncMapLibreRoutes(force = true) {
  removeMapLibreRoutes();
}

function mapLibreLandColor(colors) {
  return colors.topoLow || colors.land;
}

function mapLibreTopoHighColor(colors) {
  return colors.topoHigh || colors.road || colors.boundary;
}

function mapLibreRoadColor(themeColors) {
  if (highwaysVisible()) return styleColor("highways");
  if (majorRoadsVisible()) return styleColor("majorRoads");
  if (minorRoadsVisible()) return styleColor("minorRoads");
  return themeColors.road;
}

function mapLibreRoadOpacity() {
  if (majorRoadsVisible()) {
    return clamp(0.48 + styleOpacity("majorRoads") * 0.44, 0.34, 0.96);
  }
  if (minorRoadsVisible()) {
    return clamp(0.18 + styleOpacity("minorRoads") * 0.32, 0.14, 0.58);
  }
  return 0;
}

function mapLibreRoadWidth(layerText) {
  const streetScale = clamp(styleSize("majorRoads") || 0.82, 0.15, 1.4);
  const faintScale = clamp(styleSize("minorRoads") || 0.42, 0.08, 1.1);
  const scale = majorRoadsVisible() ? streetScale : faintScale;
  const isMotorway = layerText.includes("motorway") || layerText.includes("trunk");
  const isMajor = isMotorway || layerText.includes("major") || layerText.includes("primary") || layerText.includes("secondary");
  const isMinor = layerText.includes("minor") || layerText.includes("path") || layerText.includes("service");
  const low = isMajor ? 0.65 : isMinor ? 0.12 : 0.28;
  const mid = isMajor ? 1.35 : isMinor ? 0.42 : 0.74;
  const high = isMajor ? 3.15 : isMinor ? 1.1 : 1.85;
  return [
    "interpolate", ["linear"], ["zoom"],
    3, low * scale,
    6, mid * scale,
    10, high * scale,
    13, high * scale * 1.45
  ];
}

function addOpenFreeContourLayers(style, theme) {
  const contourOpacity = clamp(Number(theme.contours ?? 0), 0, 1);
  if (contourOpacity <= 0) return;

  style.sources = style.sources || {};
  style.sources[OPENFREE_CONTOUR_SOURCE_ID] = {
    type: "vector",
    url: OPENFREE_CONTOUR_TILEJSON_URL
  };

  const colors = theme.colors;
  const low = mapLibreLandColor(colors);
  const high = mapLibreTopoHighColor(colors);
  const indexContourFilter = ["any", ["==", ["get", "idx"], true], ["==", ["get", "idx"], 1], ["==", ["get", "idx"], "true"]];
  const firstSymbolIndex = style.layers.findIndex(layer => layer.type === "symbol");
  const contourLayers = [
    {
      id: "openfree-contours",
      type: "line",
      source: OPENFREE_CONTOUR_SOURCE_ID,
      "source-layer": "contours",
      minzoom: OPENFREE_CONTOUR_MIN_ZOOM,
      maxzoom: OPENFREE_CONTOUR_MAX_DISPLAY_ZOOM,
      paint: {
        "line-color": [
          "interpolate", ["linear"], ["to-number", ["get", "ele"], 0],
          0, low,
          2500, low,
          6500, high,
          11000, high
        ],
        "line-opacity": [
          "case",
          indexContourFilter,
          clamp(contourOpacity * 0.84, 0, 0.84),
          clamp(contourOpacity * 0.36, 0, 0.42)
        ],
        "line-width": [
          "case",
          indexContourFilter,
          1.05,
          0.55
        ]
      }
    }
  ];

  if (firstSymbolIndex === -1) {
    style.layers.push(...contourLayers);
  } else {
    style.layers.splice(firstSymbolIndex, 0, ...contourLayers);
  }
}

function themedMapLibreStyle(baseStyle, theme = activeMapLibreStyle()) {
  const colors = theme.colors;
  const style = JSON.parse(JSON.stringify(baseStyle));
  if (!style?.layers) return style;
  const roadColor = mapLibreRoadColor(colors);
  const roadOpacity = mapLibreRoadOpacity();

  style.layers.forEach(layer => {
    const layerText = `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();
    layer.paint = layer.paint || {};
    if (layer.type === "background") {
      layer.paint["background-color"] = colors.background || mapLibreLandColor(colors);
    }
    if (layer.type === "fill") {
      if (layerText.includes("water")) {
        layer.paint["fill-color"] = colors.water;
      } else if (layerText.includes("park") || layerText.includes("wood") || layerText.includes("forest") || layerText.includes("landcover") || layerText.includes("landuse")) {
        layer.paint["fill-color"] = colors.park;
      } else if (layerText.includes("building")) {
        layer.paint["fill-color"] = colors.halo;
      } else if (layerText.includes("land") || layerText.includes("earth") || layerText.includes("place") || layerText.includes("background")) {
        layer.paint["fill-color"] = mapLibreLandColor(colors);
      } else {
        layer.paint["fill-color"] = mapLibreLandColor(colors);
      }
      layer.paint["fill-opacity"] = 0.94;
    }
    if (layer.type === "line") {
      if (layerText.includes("boundary") || layerText.includes("admin") || layerText.includes("border") || layerText.includes("state")) {
        layer.paint["line-color"] = colors.boundary;
        layer.paint["line-opacity"] = 0.82;
      } else if (layerText.includes("contour")) {
        layer.paint["line-color"] = mapLibreTopoHighColor(colors);
        layer.paint["line-opacity"] = clamp(theme.contours, 0, 0.86);
      } else if (layerText.includes("road") || layerText.includes("highway") || layerText.includes("transport")) {
        layer.paint["line-color"] = roadColor;
        layer.paint["line-opacity"] = roadOpacity;
        layer.paint["line-width"] = mapLibreRoadWidth(layerText);
      }
    }
    if (layer.type === "symbol") {
      layer.paint["text-color"] = colors.label;
      layer.paint["text-halo-color"] = colors.halo;
      layer.paint["text-halo-width"] = 1.3;
    }
  });
  addOpenFreeContourLayers(style, theme);
  return style;
}

async function loadCustomMapLibreTheme(theme = activeThemeFromLayerStyles(), { forceBaseReload = false } = {}) {
  if (!window.maplibregl) {
    setMapLibreStatus("MapLibre did not load. Check the network connection and refresh.");
    return;
  }
  if (!mapLibreMap) {
    buildMapLibreMap({ deferThemeLoad: true });
  }
  if (!mapLibreMap) return;
  baseMapMode = "maplibre";
  if (els.enableMapLibre) {
    els.enableMapLibre.checked = true;
  }
  disableLeafletRasterBasemap();
  disableLocalRoadVectorLayers();
  mapLibreBasemap.hidden = false;
  els.mapCanvas.classList.add("using-maplibre-basemap");
  setLeafletBasePanesForMapLibre(true);
  setMapThemeMode("custom");
  activeProviderThemeId = null;
  activeTheme = completeTheme(theme || activeThemeFromLayerStyles());
  setMapElementsLoading(true);

  // Do not rebuild the MapLibre style graph for ordinary theme/color changes.
  // Rebuilding with setStyle() while Leaflet overlays are present is what makes
  // the basemap and route overlays drift apart. Keep one stable vector basemap
  // and only mutate paint properties after the first successful load.
  if (!forceBaseReload && mapLibreStyleReadyForSemanticTheme()) {
    refreshMapLibreThemeGroups(mapLibreMap.getStyle());
    repaintMapLibreSemanticTheme({ resize: true });
    refreshEndpointMarkers?.();
    setMapLibreBasemapVisible(true);
    updateLocalRoadPackageControls();
    setMapLibreStatus("Editable MapLibre OSM vector basemap active.");
    await waitForMapElementsReady({ timeout: 20000, minDelay: 80 });
    setMapElementsLoading(false);
    return;
  }
  const preservedLeafletCenter = map.getCenter();
  const preservedLeafletZoom = map.getZoom();
  const preservedMapLibreCamera = {
    center: [preservedLeafletCenter.lng, preservedLeafletCenter.lat],
    zoom: leafletZoomToMapLibreZoom(preservedLeafletZoom),
    bearing: 0,
    pitch: 0
  };
  try {
    map.stop();
    mapLibreMap?.stop?.();
    setMapLibreBasemapVisible(false);
    mapLibreOpenMapTileErrors = 0;
    mapLibreStyleLoadStartedAt = Date.now();
    const baseStyle = await fetchMapLibreStyle(defaultMapLibreStyle());
    const safeStyle = structuredClone(baseStyle);
    delete safeStyle.center;
    delete safeStyle.zoom;
    delete safeStyle.bearing;
    delete safeStyle.pitch;
    delete safeStyle.bounds;
    if (mapLibreMap) {
      const ready = waitForMapLibreEvent(mapLibreMap, "style.load", 15000, {
        fallbackEvents: ["styledata"],
        predicate: () => mapLibreLayerIds().length > 1
      }).catch(error => {
        console.warn("MapLibre base style did not report style.load; applying theme with available layers.", error);
      });
      const idle = waitForMapLibreEvent(mapLibreMap, "idle", 15000, {
        fallbackEvents: ["render", "sourcedata"],
        predicate: () => Boolean(mapLibreMap.loaded?.() || mapLibreMap.areTilesLoaded?.())
      }).catch(error => {
        console.warn("MapLibre base style did not report idle; showing available layers.", error);
      });
      mapLibreMap.setStyle(safeStyle);
      mapLibreMap.jumpTo(preservedMapLibreCamera);
      syncMapLibreToLeaflet(null, { resize: true });
      await ready;
      markMapStartup("map-style-ready", { layers: mapLibreLayerIds().length });
      // A usable style should be shown immediately. Tile, glyph, and sprite
      // requests may continue in the background without holding the startup UI.
      void idle.then(() => markMapStartup("map-idle", { layers: mapLibreLayerIds().length }));
      logMapLibreStyleState("Loaded MapLibre style");
      if (mapLibreLayerIds().length <= 1) {
        setMapLibreStatus("Unable to load OSM theme. Using default OSM style.");
        return;
      }
      mapLibreOpenMapTileErrors = 0;
      refreshMapLibreThemeGroups(mapLibreMap.getStyle());
      repaintMapLibreSemanticTheme({ resize: true });
      refreshMapLibreTopographyStyle();
      refreshEndpointMarkers?.();
      mapLibreMap.jumpTo(preservedMapLibreCamera);
      syncMapLibreToLeaflet(null, { resize: true });
      updateLocalRoadPackageControls();
      setMapLibreBasemapVisible(true);
    }
    setMapLibreStatus("OpenFreeMap vector basemap loaded.");
  } catch (error) {
    console.warn("OpenFreeMap vector basemap failed; falling back to Leaflet roads.", error);
    fallbackToLeafletRoadsFromMapLibre(error);
  } finally {
    await waitForMapElementsReady({ timeout: 20000, minDelay: 160 });
    setMapElementsLoading(false);
  }
}

async function loadMapLibreTheme() {
  if (mapLibreStyleReadyForSemanticTheme()) {
    repaintMapLibreSemanticTheme({ resize: true });
    return true;
  }
  const style = defaultMapLibreStyle();
  activeMapLibreStyleId = style.id;
  activeRouteThemeId = `osm-${style.id}`;
  activeTheme = mapLibreStyleToRouteTheme(style);
  const result = await loadCustomMapLibreTheme(activeTheme, { forceBaseReload: true });
  renderRouteThemeGrid();
  updateCurrentThemeSummary();
  return result;
}

async function selectMapLibreTheme(styleId) {
  // Legacy provider-style selector. Keep it as a color-preset selector only.
  // Do not call mapLibreMap.setStyle() here; the app uses one stable MapLibre
  // basemap and applies every theme through semantic paint updates.
  await applyMapProviderTheme(styleId);
  return true;
}



function refreshMapLibreSemanticTheme() {
  if (baseMapMode !== "maplibre") return;
  if (mapThemeMode !== "custom") return;
  if (!mapLibreMap?.getStyle?.() || applyingMapLibreSemanticTheme || loadingMapLibreProviderStyle) return;
  if (mapLibreLayerIds().length <= 1) return;
  activeTheme = activeTheme || activeThemeFromLayerStyles();
  applyThemeToMapLibreRenderer(activeTheme);
  applyTextureOverlays(activeTheme);
}

function buildMapLibreMap(options = {}) {
  if (!window.maplibregl) {
    setMapLibreStatus("MapLibre did not load. Check the network connection and refresh.");
    return;
  }
  const center = map.getCenter();
  mapLibreBasemap.hidden = false;
  if (!mapLibreMap) {
    mapLibreMap = new maplibregl.Map({
      container: mapLibreBasemap,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "empty-background", type: "background", paint: { "background-color": activeMapLibreStyle().colors.background } }]
      },
      center: [center.lng, center.lat],
      zoom: leafletZoomToMapLibreZoom(map.getZoom()),
      pitch: 0,
      bearing: 0,
      interactive: false,
      attributionControl: true
    });
    window.rvMapLibreMap = mapLibreMap;
    window.rvMapLibreDebug = () => ({
      enabled: mapLibreBasemapEnabled(),
      status: mapLibreStatusMessage,
      hidden: mapLibreBasemap.hidden,
      layers: mapLibreMap?.getStyle?.().layers?.length || 0,
      roadLayers: (mapLibreMap?.getStyle?.().layers || []).filter(layer => {
        const layerText = `${layer.id} ${layer["source-layer"] || ""}`.toLowerCase();
        return layer.type === "line" && /road|highway|transport/.test(layerText);
      }).map(layer => ({
        id: layer.id,
        opacity: layer.paint?.["line-opacity"],
        width: layer.paint?.["line-width"],
        color: layer.paint?.["line-color"]
      })),
      topographyLayers: (mapLibreMap?.getStyle?.().layers || [])
        .filter(layer => layer.id === "openfree-contours" || layer.id === MAPLIBRE_RELIEF_LAYER_ID || isProviderTopographyLayer(layer))
        .map(layer => ({
          id: layer.id,
          source: layer.source,
          visibility: layer.layout?.visibility || "visible",
          minzoom: layer.minzoom,
          maxzoom: layer.maxzoom
        })),
      textureLayers: (mapLibreMap?.getStyle?.().layers || [])
        .filter(layer => String(layer.id || "").startsWith(MAPLIBRE_TEXTURE_LAYER_PREFIX))
        .map(layer => ({ id: layer.id, source: layer.source, sourceLayer: layer["source-layer"] || null }))
    });
    mapLibreMap.on("load", () => {
      logMapLibreStyleState("Initial MapLibre style");
      if (!options.deferThemeLoad) {
        loadMapLibreTheme();
      }
      syncMapLibreToLeaflet(null, { resize: true });
    });
    mapLibreMap.on("styledata", () => {
      const style = mapLibreMap?.getStyle?.();
      if (!style || mapLibreThemeGroupSignature(style) === mapThemeLayerGroupsSignature) return;
      refreshMapLibreSemanticTheme();
      refreshMapLibreTopographyStyle();
    });
    mapLibreMap.on("error", handleMapLibreError);
    return;
  }
  if (!options.deferThemeLoad) {
    loadMapLibreTheme();
  }
  syncMapLibreToLeaflet(null, { resize: true });
}

function setMapLibreEnabled(enabled, { deferThemeLoad = false } = {}) {
  if (els.enableMapLibre) {
    els.enableMapLibre.checked = enabled;
  }
  baseMapMode = enabled ? "maplibre" : "leaflet-fallback";
  els.mapCanvas.classList.toggle("using-maplibre-basemap", enabled);
  setLeafletBasePanesForMapLibre(enabled);
  if (enabled) {
    if (mapThemeMode !== "provider") setMapThemeMode("custom");
    setRouteThemeTexture(null);
    if (typeof setStadiaEnabled === "function") {
      setStadiaEnabled(false);
    }
    clearTimeout(mapLibreThemeRefreshTimer);
    disableLocalRoadVectorLayers();
    disableLeafletRasterBasemap();
    mapLibreBasemap.hidden = false;
    setMapLibreStatus("Loading OSM vector style...");
    buildMapLibreMap({ deferThemeLoad: true });
    if (!deferThemeLoad && defaultSettingsLoaded) {
      guardMapElementLoad(() => loadMapLibreTheme(), { timeout: 12000, minDelay: 220 })
        .finally(clearMapElementsLoading);
    }
  } else {
    clearMapElementsLoading();
    mapLibreBasemap.hidden = true;
    baseMapMode = "leaflet-fallback";
    mapLibreMap?.remove();
    mapLibreMap = null;
    setLayerVisible(roadBasemapLayer, false);
    removeMapLibreRoutes();
    setMapLibreStatus("");
    if (localRoadPackagesEnabled()) {
      loadProjectRoadPackageState().then(() => {
        refreshStreetStyle();
      });
    } else {
      refreshStreetStyle();
    }
    void ensureLeafletFallbackFeatures();
  }
  applyToggleState(getToggleState());
  if (enabled && mapThemeMode === "custom" && mapLibreStyleReadyForSemanticTheme()) {
    applyThemeToMapLibreRenderer(activeTheme || activeThemeFromLayerStyles());
    applyTextureOverlays(activeTheme || activeThemeFromLayerStyles());
  }
  renderLocalRoadSourceStatus();
  updateLocalRoadPackageControls();
}

function renderMapLibreStyleGrid() {
  if (!els.mapLibreStyleGrid) return;
  renderProviderStyleGrid(els.mapLibreStyleGrid, MAPLIBRE_STYLES, activeMapLibreStyleId, async styleId => {
    activeMapLibreStyleId = styleId;
    renderMapLibreStyleGrid();
    if (mapLibreBasemapEnabled()) {
      await selectMapLibreTheme(styleId);
    }
  }, openMapLibreThemePanel);
}



function emptyMapThemeGroups() {
  return Object.fromEntries(Object.keys(MAP_THEME_GROUPS).map(key => [key, []]));
}

function mapLibreLayerText(layer) {
  let filterText = "";
  try {
    filterText = JSON.stringify(layer?.filter || "");
  } catch (error) {
    filterText = "";
  }
  return `${layer?.id || ""} ${layer?.["source-layer"] || ""} ${filterText}`.toLowerCase();
}

function mapLibreAdminLevel(layerText) {
  const match = layerText.match(/admin[_ -]?level[^0-9]{0,12}(\d+)/);
  return match ? Number(match[1]) : null;
}

function semanticGroupsForMapLibreLayer(layer) {
  const groups = [];
  if (String(layer?.id || "").startsWith(MAPLIBRE_TEXTURE_LAYER_PREFIX)) return groups;
  const layerText = mapLibreLayerText(layer);
  const sourceLayer = String(layer?.["source-layer"] || "").toLowerCase();
  const paint = layer?.paint || {};
  const isTransportation = /transportation|transport|road|highway|aeroway/.test(sourceLayer) || /transportation|transport|road|highway|aeroway/.test(layerText);
  const isPlace = /place|settlement|locality/.test(sourceLayer) || /place|settlement|locality/.test(layerText);
  const isPoi = /poi|aerodrome|airport|housenumber|mountain_peak/.test(sourceLayer) || /poi|aerodrome|airport|attraction|hospital|school|museum|park|shop|restaurant|cafe|hotel|station/.test(layerText);
  const isBoundary = /boundary|admin|border/.test(sourceLayer) || /boundary|admin|border/.test(layerText);
  if (layer.type === "background") {
    groups.push("land");
    return groups;
  }
  if (layer.type === "fill") {
    if (/water|waterway|ocean|lake|river/.test(layerText)) groups.push("water");
    else if (/desert|sand|dune|badlands|barren/.test(layerText)) groups.push("deserts");
    else if (/park|forest|wood|grass|green|cemetery|golf|recreation|reserve|protected|nature|pitch|landcover|landuse_park|landuse_recreation|landuse_cemetery/.test(layerText)) groups.push("parks");
    else if (/building/.test(layerText)) groups.push("buildings");
    else if (paint["fill-color"] !== undefined || /land|landuse|earth|residential|suburb|commercial|industrial|farmland|barren|sand|background|aeroway|hospital|school|railway/.test(layerText)) groups.push("land");
  }
  if (layer.type === "line") {
    if (/water|waterway|river|stream|canal/.test(layerText)) groups.push("water");
    if (/rail|subway|tram|train/.test(layerText)) groups.push("railroads");
    if (/motorway|trunk|interstate|freeway/.test(layerText)) groups.push("highways");
    else if (/primary|secondary|tertiary|major|main|class\":?[\" ]?(primary|secondary|tertiary)/.test(layerText)) groups.push("majorRoads");
    else if (isTransportation || /residential|service|unclassified|minor|track|path|trail|foot|cycle|pedestrian|steps/.test(layerText)) groups.push("minorRoads");
    if (/building/.test(layerText)) groups.push("buildings");
    if (isBoundary || /country|state|county|province|maritime/.test(layerText)) {
      const adminLevel = mapLibreAdminLevel(layerText);
      if (/country|admin[_ -]?0|admin[_ -]?2|maritime/.test(layerText) || adminLevel === 2) groups.push("countryBorders");
      else if (/state|province|admin[_ -]?4/.test(layerText) || adminLevel === 4) groups.push("stateBorders");
      else groups.push("countyBorders");
    }
  }
  if (layer.type === "symbol") {
    if (isPoi || /airport|poi|museum|hospital|attraction|park|school|college|university|station|transit|shop|restaurant|cafe|hotel|place_of_worship|label_poi/.test(layerText)) groups.push("pois");
    // Country and state labels are administrative labels, not settlements.
    // Classifying them before the broad place rule keeps the Fonts controls
    // honest: "Small towns" only controls town-scale places.
    else if (/capital|admin|country[-_ ]?label|state[-_ ]?label|province[-_ ]?label/.test(layerText)) groups.push("capitals");
    else if (/city|metro|place[_ -]?city|settlement-major/.test(layerText)) groups.push("cities");
    else if (isPlace || /town|village|hamlet|suburb|neighbourhood|neighborhood|locality|settlement|place/.test(layerText)) groups.push("smallTowns");
  }
  return [...new Set(groups)];
}

function buildMapLibreThemeGroups(style = mapLibreMap?.getStyle?.()) {
  const groups = emptyMapThemeGroups();
  (style?.layers || []).forEach(layer => {
    semanticGroupsForMapLibreLayer(layer).forEach(group => {
      if (groups[group]) groups[group].push(layer.id);
    });
  });
  return groups;
}

function mapLibreThemeGroupSignature(style = mapLibreMap?.getStyle?.()) {
  return JSON.stringify((style?.layers || []).map(layer => [layer.id, layer.type, layer.source, layer["source-layer"]]));
}

function refreshMapLibreThemeGroups(style = mapLibreMap?.getStyle?.()) {
  const signature = mapLibreThemeGroupSignature(style);
  if (signature === mapThemeLayerGroupsSignature) return MAP_THEME_GROUPS;
  mapThemeLayerGroupsSignature = signature;
  const groups = buildMapLibreThemeGroups(style);
  Object.keys(MAP_THEME_GROUPS).forEach(key => {
    MAP_THEME_GROUPS[key] = groups[key] || [];
  });
  if (DEBUG_MAPLIBRE_THEME) {
    console.log("MapLibre semantic theme groups:", MAP_THEME_GROUPS);
  }
  return MAP_THEME_GROUPS;
}

function mapLibreLayerMatchesRole(layer, role) {
  if (!layer) return false;
  const layerText = mapLibreLayerText(layer);
  if (role === "label") {
    return layer.type === "symbol" && MAPLIBRE_THEME_LAYER_ROLES.label.some(token => layerText.includes(token));
  }
  if (role === "road" || role === "minor-road") {
    if (layer.type !== "line") return false;
    const isRoad = /road|highway|transport|motorway|trunk|primary|secondary|tertiary|minor|service|track|path/.test(layerText);
    if (!isRoad) return false;
    const isMinor = /minor|service|tertiary|track|path|foot|cycle/.test(layerText);
    return role === "minor-road" ? isMinor : !isMinor;
  }
  if (role === "boundary") {
    return layer.type === "line" && /boundary|admin|border|state/.test(layerText);
  }
  if (role === "water") {
    return (layer.type === "fill" || layer.type === "line") && /water|waterway|ocean|lake|river/.test(layerText);
  }
  if (role === "land") {
    if (layer.type === "background") return true;
    return layer.type === "fill" && /land|landcover|landuse|park|forest|wood|earth|background/.test(layerText);
  }
  return MAPLIBRE_THEME_LAYER_ROLES[role]?.some(token => layerText.includes(token)) || false;
}

function mapLibrePaintPropertyForLayer(layer, property) {
  if (layer.type === "background" && property === "fill-color") return "background-color";
  if (layer.type === "background" && property === "fill-opacity") return "background-opacity";
  if (layer.type === "fill" && property.startsWith("fill-")) return property;
  if (layer.type === "line" && property.startsWith("line-")) return property;
  if (layer.type === "symbol" && property.startsWith("text-")) return property;
  return null;
}

function createMapLibreThemeContext(mapInstance = mapLibreMap) {
  if (!mapInstance?.getStyle?.()) return null;
  const mapStyle = mapInstance.getStyle();
  return {
    mapStyle,
    groups: refreshMapLibreThemeGroups(mapStyle),
    layersById: new Map((mapStyle.layers || []).map(layer => [layer.id, layer]))
  };
}

function applyThemeGroup(groupName, style = {}, mapInstance = mapLibreMap, context = null) {
  const themeContext = context || createMapLibreThemeContext(mapInstance);
  if (!themeContext) return;
  const { groups, layersById } = themeContext;
  const layerIds = groups[groupName] || [];
  layerIds.forEach(layerId => {
    const layer = layersById.get(layerId);
    if (!layer || !mapInstance.getLayer(layerId)) return;
    const color = style.color;
    const opacity = Number.isFinite(style.opacity) ? style.opacity : 1;
    const width = Number.isFinite(style.width) ? style.width : style.size;
    try {
      if (layer.type === "background") {
        if (color) mapInstance.setPaintProperty(layerId, "background-color", color);
        mapInstance.setPaintProperty(layerId, "background-opacity", opacity);
      } else if (layer.type === "fill") {
        if (color) mapInstance.setPaintProperty(layerId, "fill-color", color);
        mapInstance.setPaintProperty(layerId, "fill-opacity", opacity);
      } else if (layer.type === "line") {
        if (color) mapInstance.setPaintProperty(layerId, "line-color", color);
        mapInstance.setPaintProperty(layerId, "line-opacity", opacity);
        if (Number.isFinite(width)) {
          mapInstance.setPaintProperty(layerId, "line-width", mapLibreLineWidth(width));
        }
      } else if (layer.type === "symbol") {
        if (color) {
          mapInstance.setPaintProperty(layerId, "text-color", color);
          mapInstance.setPaintProperty(layerId, "text-halo-color", labelHaloColor(color));
          mapInstance.setPaintProperty(layerId, "text-halo-width", Number.isFinite(style.haloWidth) ? style.haloWidth : clamp((Number(style.size) || 12) / 7, 1.25, 3.4));
          mapInstance.setPaintProperty(layerId, "icon-color", color);
        }
        mapInstance.setPaintProperty(layerId, "text-opacity", opacity);
        mapInstance.setPaintProperty(layerId, "icon-opacity", opacity);
        if (Number.isFinite(style.size)) {
          mapInstance.setLayoutProperty(layerId, "text-size", style.size);
        }
        if (typeof style.font === "string") {
          mapInstance.setLayoutProperty(layerId, "text-font", styleVectorFontStackForStyle(style));
        }
        if (Number.isFinite(style.letterSpacing)) {
          mapInstance.setLayoutProperty(layerId, "text-letter-spacing", clamp(style.letterSpacing, -0.08, 0.16));
        }
        if (style.textCase === "upper" || style.textCase === "lower") {
          mapInstance.setLayoutProperty(layerId, "text-transform", style.textCase === "upper" ? "uppercase" : "lowercase");
        } else if (style.textCase === "normal") {
          mapInstance.setLayoutProperty(layerId, "text-transform", "none");
        }
      }
    } catch (error) {
      console.warn(`Could not apply ${groupName} theme to ${layerId}.`, error);
    }
  });
}

function applyMapLibrePaintBySemanticRole(role, paint = {}) {
  if (!mapLibreMap?.getStyle?.()) return;
  const style = mapLibreMap.getStyle();
  (style.layers || []).forEach(layer => {
    if (!mapLibreLayerMatchesRole(layer, role) || !mapLibreMap.getLayer(layer.id)) return;
    Object.entries(paint).forEach(([property, value]) => {
      const paintProperty = mapLibrePaintPropertyForLayer(layer, property);
      if (!paintProperty) return;
      try {
        mapLibreMap.setPaintProperty(layer.id, paintProperty, value);
      } catch (error) {
        console.warn(`Could not apply ${role} theme paint to ${layer.id}.`, error);
      }
    });
  });
}

async function exportMapLibreThemeLayers() {
  const debugMap = mapLibreMap || streetVectorMap || window.rvMapLibreMap;
  let style = debugMap?.getStyle?.();
  if (!style?.layers?.length) {
    try {
      const baseStyle = streetVectorBaseStyle || await fetchMapLibreStyle(MAPLIBRE_STYLES[0]);
      streetVectorBaseStyle = baseStyle;
      style = buildStreetVectorStyle(baseStyle);
    } catch (error) {
      console.warn("MapLibre map is not available.", error);
      return;
    }
  }
  if (!style || !Array.isArray(style.layers)) {
    console.warn("MapLibre style layers are not available.");
    return;
  }

  const themeableLayers = style.layers
    .map(layer => ({
      id: layer.id,
      type: layer.type,
      source: layer.source ?? null,
      sourceLayer: layer["source-layer"] ?? null,

      fillColor: layer.paint?.["fill-color"] ?? null,
      fillOpacity: layer.paint?.["fill-opacity"] ?? null,

      lineColor: layer.paint?.["line-color"] ?? null,
      lineOpacity: layer.paint?.["line-opacity"] ?? null,
      lineWidth: layer.paint?.["line-width"] ?? null,

      textColor: layer.paint?.["text-color"] ?? null,
      textHaloColor: layer.paint?.["text-halo-color"] ?? null,
      textHaloWidth: layer.paint?.["text-halo-width"] ?? null,

      visibility: layer.layout?.visibility ?? "visible"
    }))
    .filter(layer =>
      layer.fillColor !== null ||
      layer.lineColor !== null ||
      layer.textColor !== null ||
      layer.textHaloColor !== null
    );

  downloadJson("maplibre-theme-layers.json", themeableLayers);
}

window.exportMapLibreThemeLayers = exportMapLibreThemeLayers;

function applyThemeToMapLibreRenderer(theme = activeThemeFromLayerStyles()) {
  if (mapThemeMode !== "custom") return;
  if (!theme) return;
  if (!mapLibreMap?.getStyle?.()) {
    return;
  }
  if (applyingMapLibreSemanticTheme) return;
  applyingMapLibreSemanticTheme = true;
  try {
    const themeContext = createMapLibreThemeContext(mapLibreMap);
    if (!themeContext) return;
    const applyGroup = (groupName, groupStyle) => applyThemeGroup(groupName, groupStyle, mapLibreMap, themeContext);
    if (DEBUG_MAPLIBRE_THEME) {
      console.log("MapLibre style layers:", themeContext.mapStyle.layers?.map(layer => layer.id));
    }
    applyGroup("land", {
      ...theme.land,
      opacity: els.toggleLand?.checked ? theme.land.opacity ?? 1 : 0
    });
    applyGroup("water", {
      ...theme.water,
      opacity: els.toggleWater?.checked ? theme.water.opacity ?? 1 : 0
    });
    applyGroup("parks", {
      ...theme.parks,
      opacity: els.toggleParks?.checked ? theme.parks.opacity ?? 1 : 0
    });
    applyGroup("deserts", {
      ...theme.deserts,
      opacity: els.toggleDeserts?.checked ? theme.deserts.opacity ?? 1 : 0
    });
    applyGroup("buildings", {
      ...theme.buildings,
      opacity: els.toggleBuildings?.checked ? theme.buildings.opacity ?? 1 : 0
    });
    applyGroup("highways", {
      ...theme.highways,
      opacity: els.toggleHighways?.checked ? theme.highways.opacity ?? 1 : 0
    });
    applyGroup("majorRoads", {
      ...theme.majorRoads,
      opacity: els.toggleStreet?.checked ? theme.majorRoads.opacity ?? 1 : 0
    });
    applyGroup("minorRoads", {
      ...theme.minorRoads,
      opacity: els.toggleFaintStreet?.checked ? theme.minorRoads.opacity ?? 1 : 0
    });
    applyGroup("railroads", {
      ...theme.railroads,
      opacity: els.toggleRailroads?.checked ? theme.railroads.opacity ?? 1 : 0
    });
    applyGroup("smallTowns", {
      ...theme.smallTowns,
      opacity: els.toggleSmallTowns?.checked ? theme.smallTowns.opacity ?? 1 : 0
    });
    applyGroup("cities", {
      ...theme.cities,
      opacity: els.toggleCities?.checked ? theme.cities.opacity ?? 1 : 0
    });
    applyGroup("capitals", {
      ...theme.capitals,
      opacity: els.toggleCapitals?.checked ? theme.capitals.opacity ?? 1 : 0
    });
    applyGroup("pois", {
      ...theme.pois,
      opacity: els.togglePois?.checked ? theme.pois.opacity ?? 1 : 0
    });
    applyGroup("countryBorders", {
      ...theme.countryBorders,
      opacity: els.toggleCountryBorders?.checked ? theme.countryBorders.opacity ?? 1 : 0
    });
    applyGroup("stateBorders", {
      ...theme.stateBorders,
      opacity: els.toggleStates?.checked ? theme.stateBorders.opacity ?? 1 : 0
    });
    applyGroup("countyBorders", {
      ...theme.countyBorders,
      opacity: els.toggleFaintStates?.checked ? theme.countyBorders.opacity ?? 1 : 0
    });
    refreshMapLibreTopographyStyle();
    // A style reload restores each layer's declared visibility. Reapply the
    // close-detail road rule even when the Leaflet zoom itself has not moved.
    mapLibreRoadDetailVisibilityKey = "";
    applyMapLibreRoadDetailVisibility(map.getZoom());
  } finally {
    requestAnimationFrame(() => {
      applyingMapLibreSemanticTheme = false;
    });
  }
}



function mapTileCoordinates(center, zoom, marginTiles = 1) {
  const tileZoom = Math.max(0, Math.round(zoom));
  const tileSize = 256;
  const centerPoint = map.project(center, tileZoom);
  const size = map.getSize();
  const margin = L.point(tileSize * marginTiles, tileSize * marginTiles);
  const min = centerPoint.subtract(size.divideBy(2)).subtract(margin).divideBy(tileSize).floor();
  const max = centerPoint.add(size.divideBy(2)).add(margin).divideBy(tileSize).floor();
  const maxTile = 2 ** tileZoom;
  const coordinates = [];
  for (let y = Math.max(0, min.y); y <= Math.min(maxTile - 1, max.y); y += 1) {
    for (let x = min.x; x <= max.x; x += 1) {
      coordinates.push({ x: ((x % maxTile) + maxTile) % maxTile, y, z: tileZoom, maxTile });
    }
  }
  return coordinates;
}

function mapTileTemplateUrl(template, coordinate) {
  return String(template)
    .replace(/\{z\}/g, String(coordinate.z))
    .replace(/\{x\}/g, String(coordinate.x))
    .replace(/\{y\}/g, String(coordinate.y))
    .replace(/\{-y\}/g, String(coordinate.maxTile - coordinate.y - 1))
    .replace(/\{ratio\}/g, window.devicePixelRatio > 1 ? "@2x" : "")
    .replace(/\{r\}/g, window.devicePixelRatio > 1 ? "@2x" : "");
}

async function mapLibreTileSourceDescriptor(source = {}) {
  if (Array.isArray(source.tiles) && source.tiles.length) {
    return { tiles: source.tiles, minzoom: source.minzoom ?? 0, maxzoom: source.maxzoom ?? 22 };
  }
  if (!source.url || !/^https?:/i.test(source.url)) return null;
  if (!mapLibreTileJsonCache.has(source.url)) {
    const request = fetch(source.url, { cache: "force-cache" })
      .then(response => response.ok ? response.json() : null)
      .catch(() => null);
    mapLibreTileJsonCache.set(source.url, request);
  }
  const tileJson = await Promise.race([
    mapLibreTileJsonCache.get(source.url),
    new Promise(resolve => window.setTimeout(() => resolve(null), 1200))
  ]);
  if (!Array.isArray(tileJson?.tiles) || !tileJson.tiles.length) return null;
  return {
    tiles: tileJson.tiles,
    minzoom: tileJson.minzoom ?? source.minzoom ?? 0,
    maxzoom: tileJson.maxzoom ?? source.maxzoom ?? 22
  };
}

function cameraCorridorCenters(start, end, steps = MAPLIBRE_PRELOAD_CORRIDOR_STEPS) {
  const startLat = Number(start?.lat);
  const startLng = Number(start?.lng);
  const endLat = Number(end?.lat);
  const endLng = Number(end?.lng);
  if (![startLat, startLng, endLat, endLng].every(Number.isFinite)) return [end];
  let longitudeDelta = endLng - startLng;
  if (longitudeDelta > 180) longitudeDelta -= 360;
  if (longitudeDelta < -180) longitudeDelta += 360;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const amount = index / Math.max(1, steps);
    return L.latLng(
      startLat + (endLat - startLat) * amount,
      startLng + longitudeDelta * amount
    );
  });
}

async function mapLibreTargetTileUrls(center, zoom, startCenter = map.getCenter()) {
  const style = mapLibreMap?.getStyle?.();
  if (!style?.sources || !Array.isArray(style.layers)) return [];
  const visibleSourceIds = new Set(style.layers
    .filter(layer => layer.source && layer.layout?.visibility !== "none")
    .map(layer => layer.source));
  const descriptors = (await Promise.all([...visibleSourceIds].map(async sourceId => ({
    descriptor: await mapLibreTileSourceDescriptor(style.sources[sourceId])
  })))).filter(item => item.descriptor);
  const urls = new Set();
  // Warm the destination first, then work backward along the camera path if
  // the bounded request budget has room.
  for (const sampleCenter of cameraCorridorCenters(startCenter, center).reverse()) {
    for (const { descriptor } of descriptors) {
      const sourceZoom = clamp(
        Math.round(leafletZoomToMapLibreZoom(zoom)),
        Number(descriptor.minzoom) || 0,
        Number(descriptor.maxzoom) || 22
      );
      for (const coordinate of mapTileCoordinates(sampleCenter, sourceZoom, 1)) {
        for (const template of descriptor.tiles) {
          urls.add(mapTileTemplateUrl(template, coordinate));
          if (urls.size >= MAPLIBRE_PRELOAD_REQUEST_LIMIT) return [...urls];
        }
      }
    }
  }
  return [...urls];
}



async function preloadMapLibreView(center, zoom) {
  const urls = await mapLibreTargetTileUrls(center, zoom);
  if (!urls.length) return { ready: false, requested: 0 };
  const fetches = urls.map(url => fetch(url, { cache: "force-cache" })
    .then(response => response.ok ? response.arrayBuffer() : null)
    .catch(() => null));
  return Promise.race([
    Promise.allSettled(fetches).then(() => ({ ready: true, requested: urls.length })),
    new Promise(resolve => setTimeout(() => resolve({ ready: false, requested: urls.length }), VIEW_PRELOAD_TIMEOUT))
  ]);
}
