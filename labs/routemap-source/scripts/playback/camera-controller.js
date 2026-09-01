"use strict";

// Camera fitting, smooth route following, view locks, fades, and texture compensation.

function defaultSelectionBounds() {
  if (state.contiguousUsMode) {
    return L.latLngBounds(CONTIGUOUS_US_BOUNDS);
  }
  if (state.overviewMode) {
    return allRoutesLatLngBounds();
  }

  return state.routeLayer?.getBounds() || null;
}

function releaseMapViewLocks() {
  map.setMaxBounds(null);
  map.setMinZoom(0);
  map.setMaxZoom(20);
}

function viewForBounds(bounds, options = {}) {
  const padding = L.point(options.padding || OVERVIEW_FIT_PADDING);
  const paddingTopLeft = L.point(options.paddingTopLeft || padding);
  const paddingBottomRight = L.point(options.paddingBottomRight || padding);
  const zoom = map.getBoundsZoom(bounds, false, paddingTopLeft.add(paddingBottomRight));
  const paddingOffset = paddingBottomRight.subtract(paddingTopLeft).divideBy(2);
  const swPoint = map.project(bounds.getSouthWest(), zoom);
  const nePoint = map.project(bounds.getNorthEast(), zoom);

  return {
    center: map.unproject(swPoint.add(nePoint).divideBy(2).add(paddingOffset), zoom),
    zoom
  };
}

const DEFAULT_STOP_FOCUS_ZOOM = 13.25;
const ROUTE_FOCUS_PADDING = [64, 64];

function editorViewportFitPadding() {
  const size = map.getSize();
  const narrow = size.x < 760;
  // Keep selected geography clear of the map-edge editing docks.
  return {
    paddingTopLeft: [narrow ? 70 : 82, narrow ? 104 : 92],
    paddingBottomRight: [narrow ? 78 : 176, narrow ? 150 : 118]
  };
}

// The sole policy for selection cameras. Renderers and navigation handlers
// choose a selection; this resolver chooses its center and zoom. A normal
// selection must always frame the selected geography. Saved views are an
// explicit composition checkpoint (restored by Reset), not a substitute for
// a route, journey, or US overview fit.
function selectionCameraTarget({ scope = state.selectionScope, routeIndex = state.activeRouteIndex, stopIndex = selectedStopIndex } = {}) {
  if (state.contiguousUsMode || scope === "us") {
    const fallback = viewForBounds(L.latLngBounds(CONTIGUOUS_US_BOUNDS), { padding: OVERVIEW_FIT_PADDING });
    return { scope: "us", ...fallback, saved: false };
  }
  if (scope === "journey") {
    const bounds = allRoutesLatLngBounds();
    const fallback = bounds?.isValid() ? viewForBounds(bounds, { padding: OVERVIEW_FIT_PADDING }) : null;
    return fallback ? { scope, ...fallback, saved: false } : null;
  }
  if (scope === "route") {
    const route = state.routes[routeIndex];
    if (!route) return null;
    const bounds = routeLatLngBounds(route);
    const fallback = bounds?.isValid() ? viewForBounds(bounds, { padding: ROUTE_FOCUS_PADDING, ...editorViewportFitPadding() }) : null;
    return fallback ? { scope, ...fallback, saved: false } : null;
  }
  const stop = synchronizeTripStops(activeTrip())[stopIndex];
  if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return null;
  const zoom = DEFAULT_STOP_FOCUS_ZOOM;
  const padding = editorViewportFitPadding();
  const offset = L.point(padding.paddingBottomRight).subtract(L.point(padding.paddingTopLeft)).divideBy(2);
  const center = map.unproject(map.project(L.latLng(stop.lat, stop.lon), zoom).add(offset), zoom);
  return { scope: "stop", center, zoom, saved: false };
}

function tileUrl(template, x, y, zoom) {
  const subdomains = ["a", "b", "c", "d"];
  return template
    .replace("{s}", subdomains[Math.abs(x + y) % subdomains.length])
    .replace("{z}", String(zoom))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{r}", window.devicePixelRatio > 1 ? "@2x" : "");
}

const mapLibreTileJsonCache = new Map();

function beginCameraFade(zoomingOut) {
  if (!els.mapCanvas) return;
  els.mapCanvas.classList.add("is-camera-transitioning", "is-camera-fading-out");
  els.mapCanvas.classList.toggle("is-zooming-in", !zoomingOut);
}

function revealCameraFade() {
  if (!els.mapCanvas) return;
  requestAnimationFrame(() => {
    els.mapCanvas.classList.remove("is-camera-fading-out");
    els.mapCanvas.classList.add("is-camera-fading-in");
  });
}

function endCameraFade() {
  if (!els.mapCanvas) return;
  els.mapCanvas.classList.remove(
    "is-camera-transitioning",
    "is-camera-fading-out",
    "is-camera-fading-in",
    "is-zooming-in"
  );
}

// Used by bounded navigation handoffs. Invalidating the preload token also
// prevents a delayed road preload from starting a stale fly-to after playback
// has already been allowed to continue with the map currently on screen.
function cancelPendingCameraMove({ notify = true } = {}) {
  cameraPreloadId += 1;
  if (cameraMoveEndHandler) {
    const cancelledHandler = cameraMoveEndHandler;
    map.off("moveend", cancelledHandler);
    cameraMoveEndHandler = null;
    if (notify) cancelledHandler.onCancel?.();
  }
  map.stop();
  cameraTransitionActive = false;
  endCameraFade();
  if (mapLibreBasemapEnabled()) setMapElementsLoading(false);
}

function preloadRoadsWithTimeout(center, zoom, timeout = 7000) {
  let timeoutId = 0;
  const deadline = new Promise(resolve => {
    timeoutId = window.setTimeout(() => resolve({ ready: false, requested: 0, timedOut: true }), timeout);
  });
  return Promise.race([preloadRoadsForView(center, zoom), deadline])
    .finally(() => window.clearTimeout(timeoutId));
}

// Leaflet owns the camera. Basemap and local-road renderers only mirror it,
// so commit one exact Leaflet position before a caller can treat a move as
// complete. This prevents stale mirror updates from leaving layers apart.
function commitDefinitiveCameraView(center, zoom) {
  const currentCenter = map.getCenter();
  if (Math.abs(map.getZoom() - zoom) > 0.01 || currentCenter.distanceTo(center) > 1) {
    map.setView(center, zoom, { animate: false });
  }
  syncMapLibreToLeaflet(zoom, { center, resize: true });
  syncStreetVectorToLeaflet?.(zoom);
}

async function moveToView(center, zoom, {
  animate = true,
  duration = ROUTE_FIT_DURATION,
  loadingLocationName = "",
  mapReadyTimeout = 7000,
  preload = true,
  onCameraSettled = null,
  onComplete = null,
  onCancel = null
} = {}) {
  if (!center || !Number.isFinite(zoom)) return;
  releaseMapViewLocks();
  const moveId = ++cameraPreloadId;

  const currentCenter = map.getCenter();
  const isSameView = Math.abs(map.getZoom() - zoom) < 0.01 && currentCenter.distanceTo(center) < 1;
  if (!animate || isSameView) {
    if (cameraMoveEndHandler) {
      const cancelledHandler = cameraMoveEndHandler;
      map.off("moveend", cancelledHandler);
      cameraMoveEndHandler = null;
      cancelledHandler.onCancel?.();
    }
    if (mapLibreBasemapEnabled()) setMapElementsLoading(true);
    endCameraFade();
    cameraTransitionActive = false;
    commitDefinitiveCameraView(center, zoom);
    onCameraSettled?.();
    await waitForMapElementsReady({ timeout: mapReadyTimeout, minDelay: 120 });
    if (moveId !== cameraPreloadId) return;
    if (mapLibreBasemapEnabled()) setMapElementsLoading(false);
    onComplete?.();
    return;
  }

  if (cameraMoveEndHandler) {
    const cancelledHandler = cameraMoveEndHandler;
    map.off("moveend", cancelledHandler);
    cameraMoveEndHandler = null;
    cancelledHandler.onCancel?.();
    endCameraFade();
  }
  map.stop();
  const zoomingOut = zoom < map.getZoom() - 0.01;
  const preserveVisibleMap = mapLibreBasemapEnabled();
  if (!preserveVisibleMap) beginCameraFade(zoomingOut);
  if (mapLibreBasemapEnabled()) setMapElementsLoading(true);
  if (!preserveVisibleMap) {
    mapTransitionLoadingActive = true;
    showMapLoadingOverlay({ text: "Loading map...", locationName: loadingLocationName });
  }
  // A road/tile prefetch improves the camera transition, but it is never
  // allowed to strand a stop transition or disable Next/Previous indefinitely.
  const preloadResult = preload
    ? await preloadRoadsWithTimeout(center, zoom, mapReadyTimeout)
    : { ready: false, requested: 0, skipped: true };
  if (preserveVisibleMap) {
    markMapStartup("last-camera-preload", preloadResult);
  }
  if (moveId !== cameraPreloadId) {
    endCameraFade();
    if (mapLibreBasemapEnabled()) setMapElementsLoading(false);
    if (mapTransitionLoadingActive) {
      mapTransitionLoadingActive = false;
      const elapsed = Date.now() - mapTransitionLoadingStartedAt;
      fadeMapLoadingOverlay({ minRemaining: Math.max(0, MAP_TRANSITION_LOADING_MIN_MS - elapsed) });
    }
    onCancel?.();
    return;
  }
  cameraTransitionActive = true;
  if (!preserveVisibleMap) revealCameraFade();
  let moveCompleted = false;
  let moveFallbackTimer = null;
  const completeMove = () => {
    if (moveCompleted || moveId !== cameraPreloadId) return;
    moveCompleted = true;
    if (moveFallbackTimer) {
      window.clearTimeout(moveFallbackTimer);
      moveFallbackTimer = null;
    }
    map.off("moveend", completeMove);
    if (cameraMoveEndHandler === completeMove) cameraMoveEndHandler = null;
    cameraTransitionActive = false;
    commitDefinitiveCameraView(center, zoom);
    if (!zoomingOut) {
      warmViewAfterMove(center, zoom);
    }
    onCameraSettled?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        waitForMapElementsReady({ timeout: mapReadyTimeout, minDelay: 120 }).finally(() => {
          if (moveId !== cameraPreloadId) return;
          onComplete?.();
          endCameraFade();
          if (mapLibreBasemapEnabled()) setMapElementsLoading(false);
          if (mapTransitionLoadingActive) {
            mapTransitionLoadingActive = false;
            const elapsed = Date.now() - mapTransitionLoadingStartedAt;
            fadeMapLoadingOverlay({ minRemaining: Math.max(0, MAP_TRANSITION_LOADING_MIN_MS - elapsed) });
          }
        });
      });
    });
  };
  completeMove.onCancel = onCancel;
  cameraMoveEndHandler = completeMove;
  map.once("moveend", completeMove);
  map.flyTo(center, zoom, {
    animate: true,
    duration,
    easeLinearity: 0.2
  });
  // Leaflet can omit moveend after an interrupted/locked flyTo. Do not leave
  // playback waiting for a user-generated map nudge in that case.
  moveFallbackTimer = window.setTimeout(() => {
    if (moveCompleted || moveId !== cameraPreloadId) return;
    const latestCenter = map.getCenter();
    if (Math.abs(map.getZoom() - zoom) > 0.01 || latestCenter.distanceTo(center) > 2) {
      map.setView(center, zoom, { animate: false });
    }
    completeMove();
  }, Math.ceil(duration * 1000) + 450);
}

function moveToBounds(bounds, {
  animate = true,
  duration = ROUTE_FIT_DURATION,
  padding = OVERVIEW_FIT_PADDING,
  paddingTopLeft = null,
  paddingBottomRight = null,
  loadingLocationName = "",
  mapReadyTimeout = 7000,
  preload = true,
  onCameraSettled = null,
  onComplete = null,
  onCancel = null
} = {}) {
  if (!bounds?.isValid()) return;

  // Bounds zoom calculation respects the map's current min/max zoom. Release
  // selection locks first so programmatic fits can reach their actual target.
  releaseMapViewLocks();
  const view = viewForBounds(bounds, {
    padding,
    paddingTopLeft,
    paddingBottomRight
  });
  moveToView(view.center, view.zoom, { animate, duration, loadingLocationName, mapReadyTimeout, preload, onCameraSettled, onComplete, onCancel });
}

function fitCurrentSelection(options = {}) {
  if (elementsPreviewMode) return;
  moveToSelectionCamera(options);
}

function moveToSelectionCamera(options = {}) {
  // viewForBounds delegates to Leaflet's getBoundsZoom, which honors the
  // current min/max zoom. Selection views commonly start from a locked stop
  // close-up, so release that old lock *before* calculating a route, journey,
  // or US target; otherwise every target is silently clamped to the close-up.
  releaseMapViewLocks();
  const target = selectionCameraTarget(options);
  if (!target) return false;
  // Selection is an immediate user-visible action.  Do not leave a previous
  // camera flight on screen while tiles for the next view are being warmed.
  // moveToView cancels that prior flight before applying this target.
  moveToView(target.center, target.zoom, { ...options, preload: options.preload ?? false });
  return true;
}

function applyMapInteractionLocks() {
  if (elementsPreviewMode) {
    lockedSelectionZoom = map.getZoom();
    lockedSelectionBounds = map.getBounds();
    map.dragging.disable();
    map.keyboard.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.setMaxBounds(lockedSelectionBounds);
    map.setMinZoom(lockedSelectionZoom);
    map.setMaxZoom(lockedSelectionZoom);
    return;
  }
  lockedSelectionZoom = map.getZoom();
  lockedSelectionBounds = map.getBounds();

  if (els.allowPan.checked) {
    map.dragging.enable();
    map.keyboard.enable();
    map.setMaxBounds(null);
  } else {
    map.dragging.disable();
    map.keyboard.disable();
    map.setMaxBounds(lockedSelectionBounds);
  }

  if (els.allowZoom.checked) {
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.enable();
    map.setMinZoom(0);
    map.setMaxZoom(20);
  } else {
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.setMinZoom(lockedSelectionZoom);
    map.setMaxZoom(lockedSelectionZoom);
  }
}

function fitSelectionThenApplyLocks() {
  if (elementsPreviewMode) {
    applyMapInteractionLocks();
    return;
  }
  const bounds = defaultSelectionBounds();
  if (!bounds?.isValid()) {
    applyMapInteractionLocks();
    return;
  }
  moveToBounds(bounds, {
    onComplete: () => {
      applyMapInteractionLocks();
      applyToggleState(getToggleState());
    }
  });
}

function updateStats() {
  const wholeTripSelected = state.overviewMode && state.overviewFocusIndex === null && state.overviewHover.activeIndex === null;
  const routeData = wholeTripSelected ? null : activeRoute();
  document.querySelector(".pinned-day-stats-gps")?.toggleAttribute("hidden", !Boolean(els.showEndpointGps?.checked));
  if (!routeData) {
    const routes = state.routes;
    els.title.textContent = elementsPreviewMode
      ? "Settings Journey"
      : wholeTripSelected ? activeTrip()?.name || "Whole Trip" : activeTrip()?.name || "Untitled Trip";
    els.distance.textContent = routes.length ? `${Math.round(routes.reduce((sum, route) => sum + routeMiles(route.points), 0)).toLocaleString()} mi` : "--";
    if (els.points) els.points.textContent = routes.length ? routes.reduce((sum, route) => sum + route.points.length, 0).toLocaleString() : "--";
    if (routes.length) {
      const firstRoute = routes[0];
      const lastRoute = routes[routes.length - 1];
      setEndpointStats("start", routeEndpointName(firstRoute, "start"), firstRoute.points[0]);
      setEndpointStats("end", routeEndpointName(lastRoute, "end"), lastRoute.points[lastRoute.points.length - 1]);
    } else {
      setEndpointStats("start", "--", null);
      setEndpointStats("end", "--", null);
    }
    return;
  }
  const start = routeData.points[0];
  const end = routeData.points[routeData.points.length - 1];
  els.title.textContent = routeData.label || routeData.title;
  els.distance.textContent = `${Math.round(routeMiles(routeData.points)).toLocaleString()} mi`;
  if (els.points) els.points.textContent = routeData.points.length.toLocaleString();
  setEndpointStats("start", routeEndpointName(routeData, "start"), start);
  setEndpointStats("end", routeEndpointName(routeData, "end"), end);
}

function getRouteDisplayColors() {
  return {
    selected: normalizeHex(els.selectedRouteColor?.value) || DEFAULT_ROUTE_DISPLAY_COLORS.selected,
    preceding: normalizeHex(els.precedingRouteColor?.value) || DEFAULT_ROUTE_DISPLAY_COLORS.preceding,
    following: normalizeHex(els.followingRouteColor?.value) || DEFAULT_ROUTE_DISPLAY_COLORS.following,
    fill: normalizeHex(els.routeFillColor?.value) || DEFAULT_ROUTE_DISPLAY_COLORS.fill
  };
}

function routeDisplayColorsForActiveTheme() {
  // Route roles need to remain readable over both the land and water visible
  // in a theme. Pick from distinct, deliberately saturated role palettes and
  // score candidates by their weakest contrast against either surface.
  const land = normalizeHex(styleColor?.("land")) || "#25313d";
  const water = normalizeHex(styleColor?.("water")) || "#5bc5d7";
  const surfaces = [land, water];
  const darkMap = relativeLuminance(land) < 0.42;
  const palettes = darkMap
    ? {
        selected: ["#ffd166", "#ffe29a", "#f8fbff"],
        preceding: ["#7ee8fa", "#5eead4", "#a7f3d0"],
        following: ["#ff9a8b", "#ffb36b", "#ff7a59"],
        fill: ["#f8fbff", "#ffe29a", "#7ee8fa"]
      }
    : {
        selected: ["#087f5b", "#0b6e4f", "#14532d"],
        preceding: ["#155ec7", "#075985", "#1d4ed8"],
        following: ["#b42318", "#9f2d1e", "#c2410c"],
        fill: ["#151c2c", "#203047", "#2c1c3d"]
      };
  const bestForSurfaces = candidates => candidates
    .map(color => ({ color, contrast: Math.min(...surfaces.map(surface => contrastRatio(color, surface)))}))
    .sort((a, b) => b.contrast - a.contrast)[0]?.color || candidates[0];
  return Object.fromEntries(Object.entries(palettes).map(([role, candidates]) => [role, bestForSurfaces(candidates)]));
}

function applyHighContrastRouteDisplayColors() {
  applyRouteDisplayColors(routeDisplayColorsForActiveTheme());
  refreshRouteDisplayColors();
}

function applyRouteDisplayColors(colors = DEFAULT_ROUTE_DISPLAY_COLORS) {
  const next = { ...DEFAULT_ROUTE_DISPLAY_COLORS, ...colors };
  if (els.selectedRouteColor) els.selectedRouteColor.value = normalizeHex(next.selected) || DEFAULT_ROUTE_DISPLAY_COLORS.selected;
  if (els.precedingRouteColor) els.precedingRouteColor.value = normalizeHex(next.preceding) || DEFAULT_ROUTE_DISPLAY_COLORS.preceding;
  if (els.followingRouteColor) els.followingRouteColor.value = normalizeHex(next.following) || DEFAULT_ROUTE_DISPLAY_COLORS.following;
  if (els.routeFillColor) els.routeFillColor.value = normalizeHex(next.fill) || DEFAULT_ROUTE_DISPLAY_COLORS.fill;
}

function refreshRouteDisplayColors() {
  renderRoute(false);
}

function routeProgressColor(index) {
  const hoverIndex = state.overviewMode && state.overviewHover.activeIndex !== null
    ? state.overviewHover.activeIndex
    : state.activeRouteIndex;
  const colors = getRouteDisplayColors();
  return index < hoverIndex ? colors.preceding : index > hoverIndex ? colors.following : colors.selected;
}



function routeCameraMode() {
  const mode = els.routeCameraMode?.value;
  return ["overview", "saved", "follow", "static"].includes(mode) ? mode : "overview";
}

function routeCameraFollowsIcon() {
  return routeCameraMode() === "follow";
}

// Route data uses { lat, lon }, while Leaflet uses { lat, lng }. Keep that
// conversion at the camera boundary so a Leaflet LatLng is never sent through
// helpers intended for raw route points.
function routeCoordinate(point) {
  const lat = Number(point?.lat);
  const lng = Number(point?.lng ?? point?.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function routeLatLng(point) {
  const coordinate = routeCoordinate(point);
  return coordinate ? L.latLng(coordinate.lat, coordinate.lng) : null;
}

function routePointBearing(first, second) {
  const firstCoordinate = routeCoordinate(first);
  const secondCoordinate = routeCoordinate(second);
  if (!firstCoordinate || !secondCoordinate) return 0;
  const latitude = ((firstCoordinate.lat + secondCoordinate.lat) / 2) * Math.PI / 180;
  const x = (secondCoordinate.lng - firstCoordinate.lng) * Math.cos(latitude);
  const y = secondCoordinate.lat - firstCoordinate.lat;
  return Math.atan2(x, y) * 180 / Math.PI;
}

function routeBearingDifference(first, second) {
  return Math.abs(((second - first + 540) % 360) - 180);
}

function routeTurnDensity(route, progress) {
  if (!els.routeFollowTurnAware?.checked) return 0;
  const points = route?.displayPoints || route?.points || [];
  if (points.length < 5) return 0;
  const centerIndex = clamp(Math.round(clamp(progress, 0, 1) * (points.length - 1)), 1, points.length - 2);
  const stride = Math.max(1, Math.round(points.length * 0.006));
  const sampleIndexes = [-2, -1, 0, 1, 2]
    .map(offset => clamp(centerIndex + offset * stride, 0, points.length - 1));
  const headings = sampleIndexes.slice(1).map((index, sampleIndex) => (
    routePointBearing(points[sampleIndexes[sampleIndex]], points[index])
  ));
  if (headings.length < 2) return 0;
  const totalTurn = headings.slice(1).reduce((sum, heading, index) => (
    sum + routeBearingDifference(headings[index], heading)
  ), 0);
  return clamp(totalTurn / ((headings.length - 1) * 70), 0, 1);
}

function routeFollowCorridorCenter(route, progress, direction, turnDensity) {
  const points = route?.displayPoints || route?.points || [];
  if (!points.length) return null;
  // Follow a piece of the route, rather than the animation marker itself.
  // Keeping a little route behind and substantially more ahead in the camera
  // target makes bends read as a continuous curve instead of a sequence of
  // corrections for every road vertex.
  const offsets = [-0.026, -0.008, 0.018, 0.05, 0.086, 0.13]
    .map(offset => offset * direction * (1 - turnDensity * 0.35));
  const weights = [0.42, 0.7, 1, 1.25, 1.15, 0.82];
  const samples = offsets.map((offset, index) => ({
    point: routeCoordinate(routeProgressPoint(points, clamp(progress + offset, 0, 1))),
    weight: weights[index]
  })).filter(sample => sample.point);
  if (!samples.length) return null;
  const totalWeight = samples.reduce((total, sample) => total + sample.weight, 0);
  return L.latLng(
    samples.reduce((total, sample) => total + sample.point.lat * sample.weight, 0) / totalWeight,
    samples.reduce((total, sample) => total + sample.point.lng * sample.weight, 0) / totalWeight
  );
}

function routeFollowSafeZoom(route, progress, direction, center, preferredZoom) {
  const points = route?.displayPoints || route?.points || [];
  const size = map?.getSize?.();
  if (!points.length || !center || !size?.x || !size?.y) return preferredZoom;

  // Work in screen pixels at the editor's preferred zoom.  The corridor
  // samples preserve a little route behind the icon and more route ahead;
  // this lets the camera follow the route's shape, not every icon position.
  const corridorOffsets = [-0.045, -0.016, 0, 0.042, 0.095, 0.16]
    .map(offset => clamp(progress + offset * direction, 0, 1));
  const centerPixel = map.project(center, preferredZoom);
  const furthest = corridorOffsets.reduce((largest, sampleProgress) => {
    const sample = routeCoordinate(routeProgressPoint(points, sampleProgress));
    if (!sample) return largest;
    const pixel = map.project(sample, preferredZoom);
    return L.point(Math.max(largest.x, Math.abs(pixel.x - centerPixel.x)), Math.max(largest.y, Math.abs(pixel.y - centerPixel.y)));
  }, L.point(0, 0));
  // Reserve 16% of the viewport for controls and visual breathing room. A
  // scale above 1 means the current zoom would push part of the corridor out.
  const usableHalfWidth = Math.max(1, size.x * 0.42);
  const usableHalfHeight = Math.max(1, size.y * 0.42);
  const scale = Math.max(1, furthest.x / usableHalfWidth, furthest.y / usableHalfHeight);
  return clamp(preferredZoom - Math.log2(scale), map.getMinZoom(), map.getMaxZoom());
}

function smoothRouteFollowCenter(nextCenter, turnDensity) {
  const previousCenter = state.playback.followCenter;
  if (!previousCenter) {
    state.playback.followCenter = nextCenter;
    return nextCenter;
  }
  // This runs once per animation frame.  A modest low-pass filter removes
  // tiny GPS/display-point kinks without leaving the icon behind the camera.
  const blend = 0.12 + turnDensity * 0.06;
  const previous = map.project(previousCenter, map.getZoom());
  const next = map.project(nextCenter, map.getZoom());
  const center = map.unproject(previous.multiplyBy(1 - blend).add(next.multiplyBy(blend)), map.getZoom());
  state.playback.followCenter = center;
  return center;
}

function updateRouteFollowCamera(route, progress, timestamp) {
  if (!routeCameraFollowsIcon() || !state.playback.active || !map?._loaded) return;
  // Only pause corrections while the occasional safety zoom settles. Ordinary
  // corridor corrections below deliberately run every playback frame.
  if (timestamp < state.playback.followPanUntil) return;
  const turnDensity = routeTurnDensity(route, progress);

  const direction = state.playback.direction || 1;
  const corridorCenter = routeFollowCorridorCenter(route, progress, direction, turnDensity);
  if (!corridorCenter) return;
  const followCenter = smoothRouteFollowCenter(corridorCenter, turnDensity);
  const preferredZoom = clamp(Number(els.routeFollowZoom?.value) || 10, 6, 15);
  const requiredZoom = routeFollowSafeZoom(route, progress, direction, followCenter, preferredZoom);
  const followZoom = Math.min(state.playback.followZoom ?? preferredZoom, requiredZoom);
  state.playback.followZoom = followZoom;
  if (followZoom < map.getZoom() - 0.12) {
    state.playback.followLastPanAt = timestamp;
    state.playback.followPanUntil = timestamp + 420;
    // Zoom out around the existing map center; never recenter on the icon.
    map.setView(map.getCenter(), followZoom, { animate: true, duration: 0.6, noMoveStart: true });
    return;
  }
  const trackedPixel = map.latLngToContainerPoint(followCenter);
  const size = map.getSize();
  const viewportCenter = L.point(size.x / 2, size.y / 2);
  const looseCenterPercent = clamp(Number(els.routeFollowDeadZone?.value) || 20, 8, 36) / 100;
  const turnTolerance = 1.32 + turnDensity * 0.28;
  const halfWidth = size.x * looseCenterPercent / 2 * turnTolerance;
  const halfHeight = size.y * looseCenterPercent / 2 * turnTolerance;
  const rawOffset = trackedPixel.subtract(viewportCenter);
  const correction = L.point(
    Math.sign(rawOffset.x) * Math.max(0, Math.abs(rawOffset.x) - halfWidth),
    Math.sign(rawOffset.y) * Math.max(0, Math.abs(rawOffset.y) - halfHeight)
  );
  if (Math.abs(correction.x) < 0.2 && Math.abs(correction.y) < 0.2) return;

  // Do a small correction every playback frame instead of launching a
  // half-second pan and waiting for it to finish.  That old cadence was the
  // source of the visible catch-up jumps.  Keeping the correction bounded
  // lets the icon sit loosely near centre while the camera follows the route
  // corridor, rather than each individual route vertex.
  const response = 0.22 - turnDensity * 0.05;
  const maximumStep = 36 + turnDensity * 10;
  const correctionLength = Math.hypot(correction.x, correction.y);
  const boundedCorrection = correctionLength > maximumStep
    ? correction.multiplyBy(maximumStep / correctionLength)
    : correction;
  state.playback.followLastPanAt = timestamp;
  state.playback.followPanUntil = timestamp;
  map.panBy(boundedCorrection.multiplyBy(response), {
    animate: false,
    noMoveStart: true
  });
}

function updateRouteCameraControls() {
  if (!els.routeCameraMode) return;
  const follows = routeCameraFollowsIcon();
  if (els.routeFollowCameraControls) els.routeFollowCameraControls.hidden = !follows;
  const zoom = clamp(Number(els.routeFollowZoom?.value) || 10, 6, 15);
  const deadZone = clamp(Number(els.routeFollowDeadZone?.value) || 20, 8, 36);
  if (els.routeFollowZoom) els.routeFollowZoom.value = String(zoom);
  if (els.routeFollowDeadZone) els.routeFollowDeadZone.value = String(deadZone);
  if (els.routeFollowZoomValue) els.routeFollowZoomValue.textContent = zoom.toFixed(2);
  if (els.routeFollowDeadZoneValue) els.routeFollowDeadZoneValue.textContent = `${Math.round(deadZone)}%`;
  state.playback.followLastPanAt = 0;
  state.playback.followPanUntil = 0;
  state.playback.followZoom = null;
}

function moveToRouteFollowView(route, progress, direction, onComplete, duration = ROUTE_FIT_DURATION) {
  const turnDensity = routeTurnDensity(route, progress);
  // Enter corridor mode from the actual departure/arrival stop. The camera
  // still uses the corridor-safe zoom below, but it no longer visibly jumps
  // ahead to a mid-route framing before the animation begins.
  const atRouteEndpoint = progress <= 0.001 || progress >= 0.999;
  const point = atRouteEndpoint
    ? routeProgressPoint(route?.displayPoints || route?.points || [], progress)
    : routeFollowCorridorCenter(route, progress, direction, turnDensity);
  if (!point) {
    onComplete?.();
    return;
  }
  const center = routeLatLng(point);
  if (!center) {
    onComplete?.();
    return;
  }
  state.playback.followCenter = center;
  const preferredZoom = clamp(Number(els.routeFollowZoom?.value) || 10, 6, 15);
  const zoom = routeFollowSafeZoom(route, progress, direction, center, preferredZoom);
  state.playback.followZoom = zoom;
  try {
    void preloadRoadsForView(center, zoom)
      .then(result => markMapStartup("route-follow-preload", result))
      .catch(() => markMapStartup("route-follow-preload", { ready: false, requested: 0 }));

    // Follow-mode entry joins the same transaction as every other view. It
    // must not create a second direct Leaflet flyTo that can outlive a later
    // route, stop, or US selection.
    moveToView(center, zoom, {
      duration: clamp(Number(duration) || ROUTE_FIT_DURATION, 0.35, 2.6),
      preload: false,
      // Do not begin drawing the moving route until the follow view's
      // basemap, roads, and mirrored layers have reported ready.
      onComplete,
      onCancel: onComplete
    });
  } catch {
    // The camera is optional for playback. A bad map state must never prevent
    // the route timeline from launching.
    onComplete?.();
  }
}




let textureZoomStart = null;
let cameraTextureRestoreTimer = null;

function setCameraTextureSuppressed(suppressed) {
  clearTimeout(cameraTextureRestoreTimer);
  if (suppressed) {
    const wasSuppressed = els.mapCanvas.classList.contains("is-camera-moving");
    els.mapCanvas.classList.add("is-camera-moving");
    if (!wasSuppressed) refreshNewElementLayers();
    return;
  }
  cameraTextureRestoreTimer = setTimeout(() => {
    els.mapCanvas.classList.remove("is-camera-moving");
    refreshNewElementLayers();
  }, 180);
}

function setTextureZoomCompensation(targetZoom = null) {
  if (textureScalesWithMap()) return;
  const cameraScale = Number.isFinite(targetZoom) && Number.isFinite(textureZoomStart)
    ? 2 ** (targetZoom - textureZoomStart)
    : 1;
  document.querySelectorAll('pattern[id^="rv-"][id$="-texture-pattern"]').forEach(pattern => {
    const baseSize = Number(pattern.dataset.baseTextureSize);
    if (!Number.isFinite(baseSize) || baseSize <= 0) return;
    const compensatedSize = baseSize / cameraScale;
    pattern.setAttribute("width", String(compensatedSize));
    pattern.setAttribute("height", String(compensatedSize));
    pattern.querySelectorAll("image").forEach(image => {
      image.setAttribute("width", String(compensatedSize));
      image.setAttribute("height", String(compensatedSize));
    });
  });
}
