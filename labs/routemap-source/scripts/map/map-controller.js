"use strict";

// Renderer coordination, shared refreshes, and public map preloading operations.

function applyThemeToAllRenderers(theme = activeThemeFromLayerStyles()) {
  if (!theme || applyingSharedTheme) return;
  applyingSharedTheme = true;
  activeTheme = activeThemeFromLayerStyles();
  if (DEBUG_MAPLIBRE_THEME) {
    console.log("Applying theme:", activeTheme);
  }
  try {
    applyThemeToCustomRenderer(activeTheme);
    applyThemeToMapLibreRenderer(activeTheme);
    applyTextureOverlays(activeTheme);
  } finally {
    applyingSharedTheme = false;
  }
}

function syncSharedThemeAfterStyleRefresh() {
  if (applyingSharedTheme) return;
  if (mapThemeMode === "provider") {
    refreshLayerTextureOverlays();
    return;
  }
  activeTheme = activeThemeFromLayerStyles();
  applyThemeToMapLibreRenderer(activeTheme);
  applyTextureOverlays(activeTheme);
}



function targetTileUrls(center, zoom) {
  const tileZoom = Math.max(0, Math.round(zoom));
  const tileSize = 256;
  const centerPoint = map.project(center, tileZoom);
  const size = map.getSize();
  const margin = L.point(tileSize, tileSize);
  const min = centerPoint.subtract(size.divideBy(2)).subtract(margin).divideBy(tileSize).floor();
  const max = centerPoint.add(size.divideBy(2)).add(margin).divideBy(tileSize).floor();
  const maxTile = 2 ** tileZoom;
  const urls = new Set();
  const templates = [
    OSM_TILE_URL,
    "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}"
  ];

  for (let y = Math.max(0, min.y); y <= Math.min(maxTile - 1, max.y); y += 1) {
    for (let x = min.x; x <= max.x; x += 1) {
      const wrappedX = ((x % maxTile) + maxTile) % maxTile;
      templates.forEach(template => urls.add(tileUrl(template, wrappedX, y, tileZoom)));
    }
  }
  return [...urls];
}

async function preloadView(center, zoom) {
  const urls = targetTileUrls(center, zoom);
  if (!urls.length) return { ready: true, requested: 0 };
  return Promise.race([
    Promise.allSettled(urls.map(url => new Promise(resolve => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = resolve;
      image.src = url;
    }))).then(() => ({ ready: true, requested: urls.length })),
    new Promise(resolve => setTimeout(() => resolve({ ready: false, requested: urls.length }), VIEW_PRELOAD_TIMEOUT))
  ]);
}

function warmViewAfterMove(center, zoom) {
  const warmNextRoute = () => {
    const nextRoute = state.routes[state.activeRouteIndex + 1];
    if (!mapLibreBasemapEnabled() || !nextRoute?.displayPoints?.length) return;
    const bounds = routeLatLngBounds(nextRoute);
    if (!bounds?.isValid()) return;
    const nextView = viewForBounds(bounds, { padding: OVERVIEW_FIT_PADDING });
    void preloadRoadsForView(nextView.center, nextView.zoom);
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warmNextRoute, { timeout: 2000 });
  } else {
    window.setTimeout(warmNextRoute, 600);
  }
}



function refreshStyledLayers() {
  refreshNewElementLayers();
  refreshTopographyStyle();
  refreshStreetStyle();
  if (activeRoute()) {
    renderRoute(false);
    if (state.playback.hasStarted) {
      renderPlayback();
    }
  }
  rebuildCityLabels();
  restyleStateLines();
  updateToggleSwatches();
  applyToggleState(getToggleState());
  syncSharedThemeAfterStyleRefresh();
  saveActiveThemeDraft();
}

let styledLayerRefreshFrame = 0;

function scheduleStyledLayerRefresh() {
  if (styledLayerRefreshFrame) return;
  styledLayerRefreshFrame = requestAnimationFrame(() => {
    styledLayerRefreshFrame = 0;
    refreshStyledLayers();
  });
}

function flushStyledLayerRefresh() {
  if (styledLayerRefreshFrame) {
    cancelAnimationFrame(styledLayerRefreshFrame);
    styledLayerRefreshFrame = 0;
  }
  refreshStyledLayers();
}
