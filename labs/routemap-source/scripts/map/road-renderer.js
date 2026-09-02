"use strict";

// OSM/local road loading, detail selection, vector rendering, and road packages.

function loadLocalRoadSourceState() {
  const parsed = rvStorageReadJson(LOCAL_ROAD_SOURCE_KEY, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}

function saveLocalRoadSourceState(source) {
  localRoadSourceState = source;
  if (source) {
    rvStorageWriteJson(LOCAL_ROAD_SOURCE_KEY, {
      name: source.name,
      fileNames: source.fileNames || [],
      selectedAt: source.selectedAt
    });
  } else {
    rvStorageRemove(LOCAL_ROAD_SOURCE_KEY);
  }
  renderLocalRoadSourceStatus();
}

function renderLocalRoadSourceStatus() {
  if (!els?.roadFolderStatus) return;
  if (roadStatusOverride) {
    els.roadFolderStatus.textContent = roadStatusOverride;
    return;
  }
  if (!localRoadPackagesEnabled()) {
    els.roadFolderStatus.textContent = "Local road packages disabled — using MapLibre OSM vector tiles.";
    return;
  }
  const loadedCount = osmRoadLayer?.getLayers?.().length || 0;
  const loadedText = loadedCount ? ` ${loadedCount.toLocaleString()} road segments loaded.` : "";
  if (mapLibreBasemapEnabled()) {
    const suffix = mapLibreStatusMessage ? ` ${mapLibreStatusMessage}` : "";
    els.roadFolderStatus.textContent = `Using OSM-derived road basemap tiles. Roads, land, and water render together for stable pan and zoom.${suffix}`;
    return;
  }
  if (localRoadPackageState?.foundFiles?.length) {
    const names = localRoadPackageState.foundFiles.map(file => file.name).join(", ");
    els.roadFolderStatus.textContent = `Using project road package: ${names}.${loadedText}`;
    return;
  }
  if (streetVectorOverlay?.classList?.contains("is-ready")) {
    els.roadFolderStatus.textContent = "Using transparent OpenFreeMap vector roads over the Leaflet land/water map. Add a local road package here when you want offline/project-local roads.";
    return;
  }
  if (localRoadPackageState?.manifestFound) {
    const missing = localRoadPackageState.missingFiles?.join(", ") || "PMTiles files";
    els.roadFolderStatus.textContent = `Project road package manifest found. Missing: ${missing}.${loadedText}`;
    return;
  }
  if (!localRoadSourceState) {
    els.roadFolderStatus.textContent = `Using line-only OSM roads when available.${loadedText} Add a local GeoJSON road package for project-specific roads.`;
    return;
  }
  const fileCount = localRoadSourceState.fileNames?.length || 0;
  els.roadFolderStatus.textContent = `${localRoadSourceState.name || "Roads folder"} selected (${fileCount} road file${fileCount === 1 ? "" : "s"}).`;
}

function setRoadStatus(message = "") {
  roadStatusOverride = message;
  if (els?.roadFolderStatus) {
    els.roadFolderStatus.textContent = message;
  }
  if (els?.status) {
    els.status.textContent = message;
  }
}

function enableOsmRoadFallback() {
  const checkbox = document.getElementById("enableMapLibre");
  if (checkbox) checkbox.checked = true;

  if (typeof setUseMapLibreRoads === "function") {
    setUseMapLibreRoads(true);
  } else if (typeof setMapLibreEnabled === "function") {
    setMapLibreEnabled(true);
  }

  if (typeof refreshRoadLayers === "function") {
    refreshRoadLayers();
  } else if (typeof renderRoadLayers === "function") {
    renderRoadLayers();
  } else if (typeof refreshMapElements === "function") {
    refreshMapElements();
  } else if (typeof refreshStreetStyle === "function") {
    refreshStreetStyle();
  }
  setRoadStatus("Local road package not found — using OSM roads");
}



function disableLocalRoadVectorLayers() {
  osmRoadAbortController?.abort();
  osmRoadAbortController = null;
  osmRoadLayer.clearLayers();
  streetVectorMap?.remove?.();
  streetVectorMap = null;
  streetVectorReadyPromise = null;
  streetVectorStyleSignature = "";
  if (streetVectorOverlay) {
    streetVectorOverlay.classList.remove("is-ready");
    streetVectorOverlay.hidden = true;
    streetVectorOverlay.dataset.layers = "0";
  }
}

function localRoadPackagesEnabled() {
  return ENABLE_LOCAL_ROAD_PACKAGES && baseMapMode !== "maplibre";
}

function updateLocalRoadPackageControls() {
  const disabled = !localRoadPackagesEnabled();
  [els.downloadRoadPackage, els.downloadRoadPackageElements, els.downloadRoadPackageTrips, els.chooseRoadFolder]
    .filter(Boolean)
    .forEach(button => {
      button.disabled = disabled;
      button.hidden = disabled;
    });
  if (els.roadFolderInput) {
    els.roadFolderInput.disabled = disabled;
  }
  if (disabled) {
    setRoadStatus("Local road packages disabled - using MapLibre OSM vector tiles.");
    return;
  }
}



function activeStreetDetailValue() {
  return map.getZoom() < STREET_DETAIL_SWITCH_ZOOM
    ? STREET_DETAIL_ZOOMED_OUT
    : STREET_DETAIL_ZOOMED_IN;
}

function activeStreetDetail() {
  const value = activeStreetDetailValue();
  return STREET_DETAIL_OPTIONS.find(option => option.value === value) || STREET_DETAIL_OPTIONS[0];
}

function streetDetailForRoadBounds(bounds) {
  const area = roadBoundsArea(bounds);
  if (area > 620) {
    return STREET_DETAIL_OPTIONS.find(option => option.value === "interstates") || activeStreetDetail();
  }
  if (area > 180) {
    return STREET_DETAIL_OPTIONS.find(option => option.value === "highways") || activeStreetDetail();
  }
  return activeStreetDetail();
}

function osmRoadBaseClass(value = "") {
  return String(value).replace(/_link$/, "");
}

function osmRoadAllowedValues(detail) {
  if (!detail || detail.value === "none") return [];
  return detail.classes.flatMap(className => {
    const values = [className];
    if (["motorway", "trunk", "primary", "secondary"].includes(className)) {
      values.push(`${className}_link`);
    }
    return values;
  });
}

function osmRoadRank(highway) {
  const baseClass = osmRoadBaseClass(highway);
  const index = OSM_ROAD_CLASS_ORDER.indexOf(baseClass);
  return index === -1 ? 1 : OSM_ROAD_CLASS_ORDER.length - index;
}

function osmRoadFeatureStyle(feature) {
  const highway = feature?.properties?.highway || "";
  const streetOn = majorRoadsVisible();
  const style = streetOn ? layerStyles.majorRoads : layerStyles.minorRoads;
  const rank = osmRoadRank(highway);
  const majorScale = clamp(style.size || 0.7, 0.18, 1.5);
  const isLink = /_link$/.test(highway);
  const width = clamp((0.45 + rank * 0.18) * majorScale * (isLink ? 0.76 : 1), 0.55, 3.4);
  return {
    color: style.color,
    weight: width,
    opacity: clamp((streetOn ? 0.92 : 0.5) * majorScale * styleOpacity(streetOn ? "majorRoads" : "minorRoads"), 0, 0.95),
    lineCap: "round",
    lineJoin: "round",
    interactive: false
  };
}

function overpassBoundsKey(bounds) {
  const round = value => Math.round(value * 20) / 20;
  return [round(bounds.getSouth()), round(bounds.getWest()), round(bounds.getNorth()), round(bounds.getEast())].join(",");
}

function clampedRoadBounds() {
  const bounds = map.getBounds().pad(0.18);
  const south = clamp(bounds.getSouth(), -85, 85);
  const north = clamp(bounds.getNorth(), -85, 85);
  const west = clamp(bounds.getWest(), -180, 180);
  const east = clamp(bounds.getEast(), -180, 180);
  return L.latLngBounds([south, west], [north, east]);
}

function roadBoundsArea(bounds) {
  return Math.abs(bounds.getNorth() - bounds.getSouth()) * Math.abs(bounds.getEast() - bounds.getWest());
}

function overpassRoadQuery(bounds, roadValues) {
  const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].map(value => value.toFixed(5)).join(",");
  const roadPattern = roadValues.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return `[out:json][timeout:18];(way["highway"~"^(${roadPattern})$"](${bbox}););out geom;`;
}

async function fetchOverpassJson(query, { signal = null, purpose = "OSM data" } = {}) {
  const failures = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LIVE_OSM_ROAD_ENDPOINT_TIMEOUT);
    const abortHandler = () => controller.abort();
    signal?.addEventListener?.("abort", abortHandler, { once: true });
    try {
      const response = await rvServiceFetch("overpass", endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }).toString(),
        signal: controller.signal
      });
      if (!response.ok) {
        failures.push(`${new URL(endpoint).hostname}: ${response.status}`);
        continue;
      }
      return await response.json();
    } catch (error) {
      if (signal?.aborted) throw error;
      let host = endpoint;
      try {
        host = new URL(endpoint).hostname;
      } catch {
        // Keep the full endpoint if URL parsing fails.
      }
      failures.push(`${host}: ${error?.name === "AbortError" ? "timed out" : error?.message || "request blocked"}`);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener?.("abort", abortHandler);
    }
  }
  throw new Error(`${purpose} could not be loaded from Overpass mirrors (${failures.join("; ")}).`);
}

function overpassToGeoJson(data) {
  return {
    type: "FeatureCollection",
    features: (data.elements || [])
      .filter(element => element.type === "way" && Array.isArray(element.geometry) && element.geometry.length > 1)
      .map(element => ({
        type: "Feature",
        properties: {
          id: element.id,
          highway: element.tags?.highway || "",
          name: element.tags?.name || ""
        },
        geometry: {
          type: "LineString",
          coordinates: element.geometry.map(point => [point.lon, point.lat])
        }
      }))
  };
}

function refreshOsmRoadLayerStyle() {
  osmRoadLayer.setStyle(feature => osmRoadFeatureStyle(feature));
}

function localRoadPackageUrl(fileName) {
  return new URL(`${ROAD_PACKAGE_BASE_URL}${fileName}`, window.location.href).href;
}

async function urlExists(url) {
  try {
    const response = await fetch(url, { method: "HEAD", cache: "no-store" });
    if (response.ok) return true;
    if (response.status !== 405) return false;
  } catch {
    // Some local servers do not support HEAD consistently; try a tiny range request.
  }
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Range: "bytes=0-0" }
    });
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

async function loadProjectRoadPackageState() {
  if (!localRoadPackagesEnabled()) {
    localRoadPackageState = null;
    localRoadPackagePromise = null;
    renderLocalRoadSourceStatus();
    return null;
  }
  if (localRoadPackagePromise) return localRoadPackagePromise;
  localRoadPackagePromise = (async () => {
    const manifestUrl = localRoadPackageUrl(ROAD_PACKAGE_MANIFEST_EXPORT_NAME);
    let expectedFiles = LOCAL_ROAD_PACKAGE_FILES;
    let manifestFound = false;
    try {
      const response = await fetch(LOCAL_ROAD_PACKAGE_MANIFEST_URL, { cache: "no-store" });
      manifestFound = response.ok;
      if (response.ok) {
        const manifest = await response.json();
        const files = (manifest.expectedFiles || [])
          .map(file => file?.name)
          .filter(name => /\.(pmtiles|geojson|json)$/i.test(name));
        if (files.length) expectedFiles = files;
      }
    } catch {
      manifestFound = false;
    }
    const foundFiles = [];
    const missingFiles = [];
    for (const fileName of expectedFiles) {
      const url = localRoadPackageUrl(fileName);
      if (await urlExists(url)) {
        foundFiles.push({ name: fileName, url });
      } else {
        missingFiles.push(fileName);
      }
    }
    localRoadPackageState = {
      manifestFound,
      manifestUrl,
      expectedFiles,
      foundFiles,
      missingFiles
    };
    const packageFile = foundFiles.find(file => /road package\.json$/i.test(file.name));
    try {
      if (!packageFile) {
        throw new Error(`Road package not found: ${missingFiles.join(", ") || "no package JSON"}`);
      }
      const response = await fetch(packageFile.url, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Road package not found: ${response.status}`);
      }

      const roadPackage = await response.json();
      if (!loadRoadDataPackage(roadPackage)) {
        throw new Error("Road package is invalid.");
      }
      setRoadStatus("Using local road package");
    } catch (error) {
      console.warn("Local road package unavailable; using OSM fallback.", error);
      enableOsmRoadFallback();
      setRoadStatus("Local road package not found — using OSM roads");
    }
    renderLocalRoadSourceStatus();
    return localRoadPackageState;
  })();
  return localRoadPackagePromise;
}

function ensurePmtilesProtocol() {
  if (!window.maplibregl || !window.pmtiles) return false;
  if (pmtilesProtocol) return true;
  pmtilesProtocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);
  return true;
}

function localRoadLinePaint(kind) {
  const streetOn = majorRoadsVisible();
  const style = streetOn ? layerStyles.majorRoads : layerStyles.minorRoads;
  const styleKey = streetOn ? "majorRoads" : "minorRoads";
  const baseOpacity = streetOn ? 0.92 : 0.5;
  const widthScale = clamp(style.size || 0.7, 0.18, 1.5);
  const widthStops = kind === "motorway"
    ? [3, 1.4, 7, 2.3, 12, 4.8]
    : kind === "major"
      ? [3, 0.8, 7, 1.3, 12, 2.4]
      : [5, 0.45, 7, 0.8, 10, 1.35, 13, 1.9];
  return {
    "line-color": style.color,
    "line-opacity": clamp(baseOpacity * widthScale * styleOpacity(styleKey), 0, 0.95),
    "line-width": ["interpolate", ["linear"], ["zoom"], ...widthStops.map((value, index) => index % 2 ? value * widthScale : value)]
  };
}

function buildLocalRoadVectorStyle(files) {
  const sources = Object.fromEntries(files.map(file => [
    file.name.replace(/\.pmtiles$/i, "").replace(/[^a-z0-9_-]+/gi, "-"),
    { type: "vector", url: `pmtiles://${file.url}` }
  ]));
  const layers = [
    { id: `${STREET_VECTOR_LAYER_PREFIX}-background`, type: "background", paint: { "background-color": "rgba(0,0,0,0)", "background-opacity": 0 } }
  ];
  Object.keys(sources).forEach(sourceId => {
    LOCAL_ROAD_SOURCE_LAYERS.forEach(sourceLayer => {
      layers.push({
        id: `${STREET_VECTOR_LAYER_PREFIX}-${sourceId}-${sourceLayer}-all`,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        minzoom: STREET_DETAIL_SWITCH_ZOOM,
        filter: ["match", ["get", "class"], ["secondary"], true, false],
        layout: { visibility: "visible", "line-cap": "round", "line-join": "round" },
        paint: localRoadLinePaint("thoroughfare")
      });
      layers.push({
        id: `${STREET_VECTOR_LAYER_PREFIX}-${sourceId}-${sourceLayer}-major`,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        filter: ["match", ["get", "class"], ["trunk", "primary"], true, false],
        layout: { visibility: "visible", "line-cap": "round", "line-join": "round" },
        paint: localRoadLinePaint("major")
      });
      layers.push({
        id: `${STREET_VECTOR_LAYER_PREFIX}-${sourceId}-${sourceLayer}-motorway`,
        type: "line",
        source: sourceId,
        "source-layer": sourceLayer,
        filter: ["==", ["get", "class"], "motorway"],
        layout: { visibility: "visible", "line-cap": "round", "line-join": "round" },
        paint: localRoadLinePaint("motorway")
      });
    });
  });
  return { version: 8, sources, layers };
}

function roadFeatureMatchesDetail(feature, detail = activeStreetDetail()) {
  const highway = feature?.properties?.highway || feature?.properties?.class || "";
  const normalized = String(highway).replace(/_link$/i, "");
  return osmRoadAllowedValues(detail).some(value => value === highway || value === normalized);
}

function loadRoadFeatureCollections(collections = []) {
  const detail = activeStreetDetail();
  const features = collections.flatMap(collection => Array.isArray(collection?.features) ? collection.features : []);
  osmRoadAbortController?.abort();
  streetVectorOverlay.classList.remove("is-ready");
  streetVectorOverlay.hidden = true;
  streetVectorOverlay.dataset.layers = "1";
  streetVectorMap?.remove();
  streetVectorMap = null;
  streetVectorReadyPromise = null;
  streetVectorStyleSignature = "";
  osmRoadLayer.clearLayers();
  osmRoadLayer.addData({
    type: "FeatureCollection",
    features: features.filter(feature => roadFeatureMatchesDetail(feature, detail))
  });
  refreshOsmRoadLayerStyle();
  renderLocalRoadSourceStatus();
}

function loadRoadDataPackage(packageData) {
  if (!packageData || packageData.packageType !== "rv-map-road-data-package") return false;
  const files = packageData.files && typeof packageData.files === "object" ? packageData.files : {};
  loadRoadFeatureCollections(Object.values(files));
  localRoadPackageState = {
    manifestFound: true,
    manifestUrl: "",
    expectedFiles: Object.keys(files),
    foundFiles: Object.keys(files).map(name => ({ name, url: "" })),
    missingFiles: packageData.failedFiles || []
  };
  renderLocalRoadSourceStatus();
  return true;
}

async function loadLocalRoadGeoJsonFile(file) {
  if (localRoadGeoJsonCache.has(file.url)) return localRoadGeoJsonCache.get(file.url);
  const response = await fetch(file.url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Road file ${file.name} could not be loaded.`);
  const data = await response.json();
  localRoadGeoJsonCache.set(file.url, data);
  return data;
}

async function loadLocalRoadGeoJsonLayer(files) {
  const geoJsonFiles = files.filter(file => /\.(geojson|json)$/i.test(file.name));
  if (!geoJsonFiles.length) return false;
  const detail = activeStreetDetail();
  const roadValues = osmRoadAllowedValues(detail);
  osmRoadAbortController?.abort();
  streetVectorOverlay.classList.remove("is-ready");
  streetVectorOverlay.hidden = true;
  streetVectorOverlay.dataset.layers = "1";
  streetVectorMap?.remove();
  streetVectorMap = null;
  streetVectorReadyPromise = null;
  streetVectorStyleSignature = "";
  osmRoadLayer.clearLayers();
  if (!roadValues.length) return true;
  const filesData = await Promise.all(geoJsonFiles.map(loadLocalRoadGeoJsonFile));
  loadRoadFeatureCollections(filesData);
  renderLocalRoadSourceStatus();
  return true;
}

async function ensureLocalStreetVectorMap() {
  if (!localRoadPackagesEnabled()) return false;
  const packageState = await loadProjectRoadPackageState();
  if (!packageState.foundFiles.length) return false;
  const geoJsonFiles = packageState.foundFiles.filter(file => /\.geojson$/i.test(file.name));
  if (geoJsonFiles.length) {
    return loadLocalRoadGeoJsonLayer(packageState.foundFiles);
  }
  return false;
}

async function loadOsmRoads() {
  if (mapLibreBasemapEnabled()) {
    osmRoadLayer.clearLayers();
    osmRoadAbortController?.abort();
    osmRoadAbortController = null;
    return;
  }
  if (!ENABLE_LIVE_OSM_ROADS || map.getZoom() < LIVE_OSM_ROAD_MIN_ZOOM) {
    osmRoadAbortController?.abort();
    osmRoadAbortController = null;
    osmRoadLayer.clearLayers();
    if (els.roadFolderStatus && !localRoadPackageState?.foundFiles?.length) {
      els.roadFolderStatus.textContent = "Road package missing. Live roads load only when zoomed in to keep the map responsive.";
    }
    return;
  }
  const bounds = clampedRoadBounds();
  const detail = streetDetailForRoadBounds(bounds);
  const roadValues = osmRoadAllowedValues(detail);
  const visible = Boolean(anyRoadsVisible() && roadValues.length);
  osmRoadAbortController?.abort();
  osmRoadAbortController = null;
  if (!visible) {
    osmRoadLayer.clearLayers();
    return;
  }

  const queryArea = roadBoundsArea(bounds);
  if (queryArea > 2600) {
    osmRoadLayer.clearLayers();
    return;
  }

  const cacheKey = `${detail.value}:${overpassBoundsKey(bounds)}`;
  const fetchId = ++osmRoadFetchId;
  let geojson = osmRoadCache.get(cacheKey);
  if (!geojson) {
    const controller = new AbortController();
    osmRoadAbortController = controller;
    const overpassData = await fetchOverpassJson(overpassRoadQuery(bounds, roadValues), {
      signal: controller.signal,
      purpose: "Line-only OSM roads"
    });
    geojson = overpassToGeoJson(overpassData);
    if (controller.signal.aborted) return;
    osmRoadCache.set(cacheKey, geojson);
    if (osmRoadCache.size > 24) {
      osmRoadCache.delete(osmRoadCache.keys().next().value);
    }
    if (osmRoadAbortController === controller) {
      osmRoadAbortController = null;
    }
  }
  if (fetchId !== osmRoadFetchId) return;
  osmRoadLayer.clearLayers();
  osmRoadLayer.addData(geojson);
  refreshOsmRoadLayerStyle();
  if (els.roadFolderStatus && !localRoadPackageState?.foundFiles?.length) {
    const count = geojson.features?.length || 0;
    els.roadFolderStatus.textContent = count
      ? `Using line-only OSM roads. ${count.toLocaleString()} road segments loaded.`
      : "Line-only OSM roads loaded, but no roads matched this view and zoom level.";
  }
  renderLocalRoadSourceStatus();
}

function scheduleOsmRoadRefresh(delay = 250) {
  clearTimeout(osmRoadRefreshTimer);
  osmRoadRefreshTimer = setTimeout(() => {
    loadOsmRoads().catch(error => {
      if (error?.name === "AbortError") return;
      streetLayer.setOpacity(0);
      faintStreetLayer.setOpacity(0);
      if (els.roadFolderStatus) {
        els.roadFolderStatus.textContent = `Line-only OSM roads could not be loaded: ${error?.message || "request failed"}.`;
      }
    });
  }, delay);
}



function thoroughfareOpacity(zoom = map.getZoom()) {
  const style = majorRoadsVisible() ? layerStyles.majorRoads : layerStyles.minorRoads;
  return clamp((zoom - 5.7) / 1.8, 0, 1) * clamp(style.size * 0.72, 0.22, 0.72);
}

function setThoroughfareVisibility(visible) {
  if (!streetVectorMap) return;
  const layerId = `${STREET_VECTOR_LAYER_PREFIX}-thoroughfare`;
  if (!streetVectorMap.getLayer(layerId)) return;
  streetVectorMap.setPaintProperty(layerId, "line-opacity", visible ? thoroughfareOpacity() : 0);
}

function sizeStreetVectorOverlay() {
  const size = map.getSize();
  streetVectorOverlay.style.width = `${size.x}px`;
  streetVectorOverlay.style.height = `${size.y}px`;
}

function roadZoomOpacity(zoom = map.getZoom()) {
  return clamp(
    (zoom - ROAD_FADE_MIN_ZOOM) / (ROAD_FADE_MAX_ZOOM - ROAD_FADE_MIN_ZOOM),
    0,
    1
  );
}

function updateRoadZoomOpacity(zoom = map.getZoom()) {
  const opacity = roadZoomOpacity(zoom);
  const labelsVisible = Boolean(els.toggleSmallTowns?.checked || els.toggleCities?.checked || els.toggleCapitals?.checked);
  streetVectorOverlay.style.setProperty("--vector-overlay-opacity", (labelsVisible ? 1 : opacity).toFixed(3));
  const streetContainer = streetLayer.getContainer?.() || streetLayer._container;
  const faintStreetContainer = faintStreetLayer.getContainer?.() || faintStreetLayer._container;
  if (streetContainer) streetContainer.style.setProperty("--road-zoom-opacity", "1");
  if (faintStreetContainer) faintStreetContainer.style.setProperty("--road-zoom-opacity", "1");
  const osmPane = map.getPane("streetPane");
  if (osmPane) osmPane.style.opacity = "1";
}

function waitForMapLibreEvent(target, eventName, timeout = 12000, options = {}) {
  return new Promise((resolve, reject) => {
    const fallbackEvents = Array.isArray(options.fallbackEvents) ? options.fallbackEvents : [];
    const predicate = typeof options.predicate === "function" ? options.predicate : () => true;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Street renderer timed out waiting for ${eventName}.`));
    }, timeout);
    const cleanup = () => {
      clearTimeout(timer);
      target.off(eventName, handleLoad);
      target.off("error", handleError);
      fallbackEvents.forEach(name => target.off(name, handleFallback));
    };
    const handleLoad = () => {
      cleanup();
      resolve();
    };
    const handleError = event => {
      console.warn("Street renderer reported a non-fatal load warning.", event?.error || event);
    };
    const handleFallback = () => {
      if (predicate()) handleLoad();
    };
    target.once(eventName, handleLoad);
    target.once("error", handleError);
    fallbackEvents.forEach(name => target.on(name, handleFallback));
  });
}

async function ensureStreetVectorMap() {
  if (!window.maplibregl) return false;
  const buildId = ++streetVectorBuildId;
  streetVectorOverlay.hidden = false;
  sizeStreetVectorOverlay();
  if (!streetVectorBaseStyle) {
    streetVectorBaseStylePromise ||= fetchMapLibreStyle(MAPLIBRE_STYLES[0]);
    try {
      streetVectorBaseStyle = await streetVectorBaseStylePromise;
    } catch (error) {
      streetVectorBaseStylePromise = null;
      throw error;
    }
  }
  if (buildId !== streetVectorBuildId) return null;
  const center = map.getCenter();
  const style = buildStreetVectorStyle(streetVectorBaseStyle);
  const hasVectorRoads = style.layers.some(layer => layer.id?.startsWith(`${STREET_VECTOR_LAYER_PREFIX}-motorway`) || layer.id?.startsWith(`${STREET_VECTOR_LAYER_PREFIX}-major`));
  const signature = JSON.stringify({
    highway: highwaysVisible(),
    street: majorRoadsVisible(),
    faint: minorRoadsVisible(),
    railroads: els.toggleRailroads?.checked,
    smallTowns: els.toggleSmallTowns?.checked,
    cities: els.toggleCities?.checked,
    capitols: els.toggleCapitals?.checked,
    color: majorRoadsVisible() ? layerStyles.majorRoads.color : layerStyles.minorRoads.color,
    landColor: styleColor("land"),
    cityColor: layerStyles.cities.color,
    capitalColor: layerStyles.capitols.color,
    smallTownColor: layerStyles.smallTowns.color,
    size: majorRoadsVisible() ? layerStyles.majorRoads.size : layerStyles.minorRoads.size,
    citySize: layerStyles.cities.size,
    capitalSize: layerStyles.capitols.size,
    smallTownSize: layerStyles.smallTowns.size,
    cityFont: layerStyles.cities.font,
    capitalFont: layerStyles.capitols.font,
    smallTownFont: layerStyles.smallTowns.font,
    cityWeight: layerStyles.cities.fontWeight,
    capitalWeight: layerStyles.capitols.fontWeight,
    smallTownWeight: layerStyles.smallTowns.fontWeight,
    layers: style.layers.map(layer => layer.id)
  });
  streetVectorOverlay.dataset.layers = String(hasVectorRoads ? 1 : 0);
  if (!streetVectorMap) {
    streetVectorMap = new maplibregl.Map({
      container: streetVectorOverlay,
      style,
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { alpha: true },
      pitch: 0,
      bearing: 0
    });
    streetVectorStyleSignature = signature;
    streetVectorReadyPromise = waitForMapLibreEvent(streetVectorMap, "load");
  } else if (signature !== streetVectorStyleSignature) {
    streetVectorStyleSignature = signature;
    streetVectorReadyPromise = waitForMapLibreEvent(streetVectorMap, "styledata");
    streetVectorMap.setStyle(style);
  }
  await streetVectorReadyPromise;
  if (buildId !== streetVectorBuildId) return null;
  streetLayer.setOpacity(0);
  faintStreetLayer.setOpacity(0);
  osmRoadLayer.clearLayers();
  sizeStreetVectorOverlay();
  streetVectorMap.resize();
  syncStreetVectorToLeaflet();
  streetVectorMap.triggerRepaint();
  streetVectorOverlay.classList.add("is-ready");
  updateRoadZoomOpacity();
  renderLocalRoadSourceStatus();
  setThoroughfareVisibility(true);
  return hasVectorRoads;
}

function syncStreetVectorToLeaflet(targetZoom = null) {
  if (Number.isFinite(targetZoom)) {
    streetVectorPendingZoom = targetZoom;
  }
  if (!streetVectorMap || streetVectorSyncFrame) return;
  streetVectorSyncFrame = true;
  try {
    if (!streetVectorMap) return;
    sizeStreetVectorOverlay();
    streetVectorMap.resize();
    const center = map.getCenter();
    const zoom = Number.isFinite(streetVectorPendingZoom) ? streetVectorPendingZoom : map.getZoom();
    streetVectorPendingZoom = null;
    streetVectorMap.jumpTo({
      center: [center.lng, center.lat],
      zoom,
      bearing: 0,
      pitch: 0
    });
  } finally {
    streetVectorSyncFrame = null;
  }
}

function refreshStreetVectorStyle() {
  if (!localRoadPackagesEnabled()) {
    disableLocalRoadVectorLayers();
    refreshOsmRoadLayerStyle();
    renderLocalRoadSourceStatus();
    return;
  }
  if (mapLibreBasemapEnabled()) {
    streetLayer.setOpacity(0);
    faintStreetLayer.setOpacity(0);
    osmRoadAbortController?.abort();
    osmRoadLayer.clearLayers();
    streetVectorOverlay.classList.remove("is-ready");
    streetVectorOverlay.hidden = true;
    streetVectorOverlay.dataset.layers = "0";
    streetVectorMap?.remove();
    streetVectorMap = null;
    streetVectorReadyPromise = null;
    streetVectorStyleSignature = "";
    setLeafletBasePanesForMapLibre(true);
    return;
  }
  if (!anyRoadsVisible()) {
    streetVectorOverlay.classList.remove("is-ready");
    streetVectorOverlay.hidden = true;
    streetVectorOverlay.dataset.layers = "0";
    streetVectorMap?.remove();
    streetVectorMap = null;
    streetVectorReadyPromise = null;
    streetVectorStyleSignature = "";
    osmRoadAbortController?.abort();
    osmRoadLayer.clearLayers();
    return;
  }
  refreshOsmRoadLayerStyle();
  if (!ENABLE_WEBGL_ROAD_RENDERER) {
    streetVectorOverlay.classList.remove("is-ready");
    streetVectorOverlay.hidden = true;
    streetVectorOverlay.dataset.layers = "0";
    streetVectorMap?.remove();
    streetVectorMap = null;
    streetVectorReadyPromise = null;
    streetVectorStyleSignature = "";
    if (localRoadPackagesEnabled()) {
      ensureLocalStreetVectorMap()
        .then(hasLocalRoads => {
          if (!hasLocalRoads) scheduleOsmRoadRefresh(900);
        })
        .catch(error => {
          console.warn("Local road package could not be loaded; using line-only OSM roads.", error);
          scheduleOsmRoadRefresh(900);
        });
    }
    return;
  }
  ensureLocalStreetVectorMap()
    .then(hasVectorRoads => {
      if (hasVectorRoads) return true;
      streetVectorOverlay.classList.remove("is-ready");
      streetVectorOverlay.hidden = true;
      streetVectorOverlay.dataset.layers = "0";
      streetVectorMap?.remove();
      streetVectorMap = null;
      streetVectorReadyPromise = null;
      streetVectorStyleSignature = "";
      return false;
    })
    .then(hasVectorRoads => {
      if (!hasVectorRoads) scheduleOsmRoadRefresh(900);
    })
    .catch(error => {
      console.warn("Street vector renderer could not be loaded; using line-only OSM roads.", error);
      streetVectorOverlay.classList.remove("is-ready");
      streetVectorOverlay.hidden = true;
      streetVectorOverlay.dataset.layers = "0";
      streetVectorMap?.remove();
      streetVectorMap = null;
      streetVectorReadyPromise = null;
      streetVectorStyleSignature = "";
      scheduleOsmRoadRefresh(900);
    });
}



function roadPackageRouteName() {
  const routes = activeTrip()?.days?.length ? activeTrip().days : state.routes;
  const firstRoute = routes?.[0];
  const lastRoute = routes?.[routes.length - 1];
  const startName = routeEndpointName(firstRoute, "start");
  const endName = routeEndpointName(lastRoute, "end");
  if (startName && endName && startName !== "Start" && endName !== "End") {
    return `${startName} to ${endName}`;
  }
  return activeTrip()?.name || "RV trip";
}

function roadPackageDownloadName(extension = "json") {
  return `${safeDownloadName(roadPackageRouteName())} road package.${extension}`;
}

function roadPackageManifest() {
  const tripName = activeTrip()?.name || "Current RV trip";
  const routeName = roadPackageRouteName();
  return {
    version: 1,
    packageType: "rv-map-road-package",
    tripName,
    routeName,
    expectedFiles: [
      {
        name: roadPackageDownloadName(),
        purpose: "Self-contained road package with selected journey corridor roads."
      }
    ],
    folderUse: `For this project, put the road package JSON in ${ROAD_PACKAGE_BASE_URL} next to this manifest, or use Choose roads folder.`,
    browserNote: "Browsers cannot force a download location. Use Choose roads folder to load a downloaded package immediately.",
    generatedAt: new Date().toISOString()
  };
}

function boundsForPointSets(pointSets, pad = 0.35) {
  const points = pointSets.flat().filter(point => Number.isFinite(point?.lat) && Number.isFinite(point?.lon));
  if (!points.length) return null;
  return L.latLngBounds(points.map(point => [point.lat, point.lon])).pad(pad);
}

function mergeRoadFeatureCollections(collections) {
  const seen = new Set();
  const features = [];
  collections.flatMap(collection => collection?.features || []).forEach(feature => {
    const key = feature.properties?.id || JSON.stringify(feature.geometry?.coordinates?.slice?.(0, 2));
    if (seen.has(key)) return;
    seen.add(key);
    features.push(feature);
  });
  return { type: "FeatureCollection", features };
}

async function fetchRoadsForBounds(bounds, classes = STREET_DETAIL_OPTIONS.find(option => option.value === "primary").classes) {
  if (!bounds?.isValid()) return { type: "FeatureCollection", features: [] };
  const values = osmRoadAllowedValues({ value: "custom", classes });
  const data = await fetchOverpassJson(overpassRoadQuery(bounds, values), {
    purpose: "Road package download"
  });
  return overpassToGeoJson(data);
}

async function fetchRoadsForRoutes(routes, onProgress = null) {
  const routeBounds = routes
    .map(route => boundsForPointSets([route.displayPoints?.length ? route.displayPoints : route.points], 0.22))
    .filter(Boolean);
  const collections = [];
  for (let index = 0; index < routeBounds.length; index += 1) {
    onProgress?.(index + 1, routeBounds.length);
    const bounds = routeBounds[index];
    collections.push(await fetchRoadsForBounds(bounds));
  }
  return mergeRoadFeatureCollections(collections);
}

async function loadRouteFileForRoadPackage(routeFile) {
  const response = await fetch(routeFile.path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${routeFile.path} could not be loaded.`);
  const parsed = parseRouteFile(await response.text(), routeFile.path);
  return {
    points: parsed.points,
    displayPoints: smoothRoutePoints(parsed.points)
  };
}

async function downloadRoadGeoJsonPackage() {
  const manifest = roadPackageManifest();
  const result = { downloaded: [], failed: [] };
  const packageData = {
    ...manifest,
    packageType: "rv-map-road-data-package",
    files: {}
  };
  try {
    let packageRoutes = state.routes.length ? [...state.routes] : [];
    if (!packageRoutes.length) {
      packageRoutes = await Promise.all(DEFAULT_ROUTE_FILES.map(loadRouteFileForRoadPackage));
    }
    packageData.files["trip-corridor-roads.geojson"] = await fetchRoadsForRoutes(packageRoutes, (current, total) => {
      const message = `Downloading roads for route corridor ${current} of ${total}...`;
      if (els.status) els.status.textContent = message;
      if (els.roadFolderStatus) els.roadFolderStatus.textContent = message;
    });
    result.downloaded.push("trip-corridor-roads.geojson");
  } catch (error) {
    console.warn("Trip corridor roads could not be downloaded.", error);
    result.failed.push("trip-corridor-roads.geojson");
  }

  try {
    const response = await fetch(THEME_SETTINGS_MAP_PATH, { cache: "no-store" });
    if (response.ok) {
      const parsed = parseRouteFile(await response.text(), THEME_SETTINGS_MAP_PATH);
      const themeRoute = { points: parsed.points, displayPoints: smoothRoutePoints(parsed.points) };
      if (els.status) els.status.textContent = "Downloading roads for settings journey...";
      packageData.files["theme-settings-roads.geojson"] = await fetchRoadsForRoutes([themeRoute]);
      result.downloaded.push("theme-settings-roads.geojson");
    }
  } catch (error) {
    console.warn("Settings journey roads could not be downloaded.", error);
    result.failed.push("theme-settings-roads.geojson");
  }
  packageData.downloadedFiles = result.downloaded;
  packageData.failedFiles = result.failed;
  packageData.roadSegmentCount = Object.values(packageData.files)
    .reduce((total, collection) => total + (collection?.features?.length || 0), 0);
  if (!packageData.roadSegmentCount) {
    throw new Error("No road geometry was downloaded. Check the network connection and try again while viewing a smaller journey area.");
  }
  downloadJson(roadPackageDownloadName(), packageData);
  result.downloaded.unshift(roadPackageDownloadName());
  return result;
}

function roadPackageFileNamesFromList(files) {
  return [...files]
    .map(file => file.name || file.webkitRelativePath?.split(/[\\/]/).pop() || "")
    .filter(name => /\.(pmtiles|mbtiles|geojson|json)$/i.test(name));
}

async function chooseRoadFolderWithPicker() {
  const handle = await window.showDirectoryPicker({ mode: "read" });
  const fileNames = [];
  const collections = [];
  let loadedPackage = false;
  for await (const entry of handle.values()) {
    if (entry.kind === "file" && /\.(pmtiles|mbtiles|geojson|json)$/i.test(entry.name)) {
      fileNames.push(entry.name);
      if (/\.(geojson|json)$/i.test(entry.name)) {
        try {
          const file = await entry.getFile();
          const parsed = await readJsonFile(file);
          if (loadRoadDataPackage(parsed)) {
            loadedPackage = true;
          } else if (Array.isArray(parsed.features)) {
            collections.push(parsed);
          }
        } catch {
          // Ignore non-road JSON files in the selected folder.
        }
      }
    }
  }
  if (!loadedPackage && collections.length) loadRoadFeatureCollections(collections);
  saveLocalRoadSourceState({
    name: handle.name,
    fileNames,
    selectedAt: new Date().toISOString()
  });
  setRoadStatus(loadedPackage ? "Using local road package" : `Using ${handle.name} as the local roads folder.`);
}

async function chooseRoadFolderWithInput(files) {
  const fileNames = roadPackageFileNamesFromList(files);
  const firstPath = files?.[0]?.webkitRelativePath || "";
  const folderName = firstPath.split(/[\\/]/).filter(Boolean)[0] || "Selected roads folder";
  const collections = [];
  let loadedPackage = false;
  for (const file of [...files]) {
    if (!/\.(geojson|json)$/i.test(file.name)) continue;
    try {
      const parsed = await readJsonFile(file);
      if (loadRoadDataPackage(parsed)) {
        loadedPackage = true;
      } else if (Array.isArray(parsed.features)) {
        collections.push(parsed);
      }
    } catch {
      // Ignore non-road JSON files in the selected folder.
    }
  }
  if (!loadedPackage && collections.length) loadRoadFeatureCollections(collections);
  saveLocalRoadSourceState({
    name: folderName,
    fileNames,
    selectedAt: new Date().toISOString()
  });
  setRoadStatus(loadedPackage ? "Using local road package" : `Using ${folderName} as the local roads folder.`);
}



async function preloadRoadsForView(center, zoom) {
  const preloadTasks = [mapLibreBasemapEnabled()
    ? preloadMapLibreView(center, zoom)
    : preloadView(center, zoom)];

  if (localRoadPackagesEnabled() && typeof loadProjectRoadPackageState === "function") {
    preloadTasks.push(loadProjectRoadPackageState().catch(() => null));
  }

  const results = await Promise.allSettled(preloadTasks);
  return results[0]?.status === "fulfilled"
    ? results[0].value
    : { ready: false, requested: 0 };
}
