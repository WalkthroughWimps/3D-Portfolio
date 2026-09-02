"use strict";

// Leaflet hillshade and MapLibre relief/contour layer preparation and styling.

const OPENFREE_CONTOUR_SOURCE_ID = "osm-us-contours-feet";
const OPENFREE_CONTOUR_LAYER_IDS = [
  "openfree-contours"
];
const OPENFREE_CONTOUR_TILEJSON_URL = "https://tiles.openstreetmap.us/vector/contours-feet.json";
const OPENFREE_CONTOUR_MIN_ZOOM = 8;
const OPENFREE_CONTOUR_MAX_DISPLAY_ZOOM = 24;
const MAPLIBRE_RELIEF_SOURCE_ID = "rv-terrain-dem";
const MAPLIBRE_RELIEF_LAYER_ID = "rv-terrain-hillshade";
const MAPLIBRE_RELIEF_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const MAPLIBRE_RELIEF_MAX_SOURCE_ZOOM = 15;


function refreshTopographyStyle() {
  if (mapLibreBasemapEnabled()) {
    topoLayer.setOpacity(0);
    faintTopoLayer.setOpacity(0);
    topographyTintOverlay.style.opacity = "0";
    refreshMapLibreTopographyStyle();
    return;
  }
  refreshMapLibreTopographyStyle({ forceHidden: true });
  topoLayer.setOpacity(els.toggleTopo.checked ? layerStyles.topography.size * styleOpacity("topography") : 0);
  faintTopoLayer.setOpacity(els.toggleFaintTopo.checked ? layerStyles.faintTopography.size * styleOpacity("faintTopography") : 0);
  const topographyVisible = els.toggleTopo.checked || els.toggleFaintTopo.checked;
  const activeStyle = els.toggleTopo.checked ? layerStyles.topography : layerStyles.faintTopography;
  const low = styleColor(els.toggleTopo.checked ? "topography" : "faintTopography");
  const high = styleHighColor(els.toggleTopo.checked ? "topography" : "faintTopography");
  const opacity = topographyVisible ? clamp((activeStyle.size ?? 0.5) * 0.72 * styleOpacity(els.toggleTopo.checked ? "topography" : "faintTopography"), 0, 0.78) : 0;
  topographyTintOverlay.style.opacity = String(opacity);
  topographyTintOverlay.style.mixBlendMode = activeStyle.blend || "multiply";
  topographyTintOverlay.style.background = [
    `linear-gradient(135deg, ${low}, ${high})`,
    `radial-gradient(circle at 28% 18%, ${high}, transparent 34%)`,
    `radial-gradient(circle at 72% 82%, ${low}, transparent 40%)`
  ].join(", ");
  const pane = map.getPane("topographyPane");
  if (pane) pane.style.mixBlendMode = styleBlend(els.toggleTopo.checked ? "topography" : "faintTopography");
}

function mapLibreTopographyBeforeLayerId() {
  const layers = mapLibreMap?.getStyle?.()?.layers || [];
  const symbolLayer = layers.find(layer => layer.type === "symbol");
  return symbolLayer?.id;
}

function mapLibreReliefBeforeLayerId() {
  const layers = mapLibreMap?.getStyle?.()?.layers || [];
  const firstWaterLayer = layers.find(layer => (
    (layer.type === "fill" || layer.type === "line")
    && semanticGroupsForMapLibreLayer(layer).includes("water")
  ));
  if (firstWaterLayer) return firstWaterLayer.id;
  return layers.find(layer => layer.type === "line" || layer.type === "symbol")?.id;
}

function isMapLibreSurfaceEffectLayer(layer) {
  const id = String(layer?.id || "");
  return id.startsWith(MAPLIBRE_TEXTURE_LAYER_PREFIX)
    || id === MAPLIBRE_RELIEF_LAYER_ID
    || OPENFREE_CONTOUR_LAYER_IDS.includes(id);
}

function moveMapLibreLayerBefore(layerId, beforeId) {
  if (!mapLibreMap?.getLayer?.(layerId) || !beforeId || layerId === beforeId || !mapLibreMap.getLayer(beforeId)) return;
  try {
    mapLibreMap.moveLayer(layerId, beforeId);
  } catch (error) {
    console.warn(`Map surface layer ${layerId} could not be reordered.`, error);
  }
}

function reorderMapLibreSurfaceLayers() {
  if (!mapLibreMap?.getStyle?.()) return;
  const baseLayers = (mapLibreMap.getStyle().layers || []).filter(layer => !isMapLibreSurfaceEffectLayer(layer));
  const firstThematicFill = baseLayers.find(layer => {
    if (layer.type !== "fill") return false;
    const groups = semanticGroupsForMapLibreLayer(layer);
    return groups.some(group => group === "parks" || group === "water" || group === "buildings");
  })?.id;
  const firstLineOrSymbol = baseLayers.find(layer => layer.type === "line" || layer.type === "symbol")?.id;
  const reliefBefore = baseLayers.find(layer => (
    (layer.type === "fill" || layer.type === "line")
    && semanticGroupsForMapLibreLayer(layer).includes("water")
  ))?.id || firstLineOrSymbol;
  const firstSymbol = baseLayers.find(layer => layer.type === "symbol")?.id;

  moveMapLibreLayerBefore(`${MAPLIBRE_TEXTURE_LAYER_PREFIX}land-surface`, firstThematicFill || firstLineOrSymbol);
  moveMapLibreLayerBefore(MAPLIBRE_RELIEF_LAYER_ID, reliefBefore);
  moveMapLibreLayerBefore("openfree-contours", firstSymbol);
}

function mapLibreColorWithAlpha(color, alpha) {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function isProviderTopographyLayer(layer) {
  if (
    !layer
    || layer.id === "openfree-contours"
    || layer.source === OPENFREE_CONTOUR_SOURCE_ID
    || layer.id === MAPLIBRE_RELIEF_LAYER_ID
    || layer.source === MAPLIBRE_RELIEF_SOURCE_ID
  ) return false;
  if (layer.type === "hillshade") return true;
  const text = `${layer.id || ""} ${layer.source || ""} ${layer["source-layer"] || ""}`.toLowerCase();
  return /(^|[^a-z])(contours?|hillshade|relief|terrain|elevation|dem)([^a-z]|$)/.test(text);
}

function suppressProviderTopographyLayers() {
  const layers = mapLibreMap?.getStyle?.()?.layers || [];
  layers.filter(isProviderTopographyLayer).forEach(layer => {
    setMapLibreLayerVisibility(layer.id, false);
  });
}



function ensureMapLibreTopographyLayers() {
  if (!mapLibreMap?.getStyle?.() || !mapLibreBasemapEnabled()) return false;
  const style = mapLibreMap.getStyle();
  if (!Array.isArray(style.layers) || !style.layers.length) return false;
  try {
    if (!mapLibreMap.getSource(OPENFREE_CONTOUR_SOURCE_ID)) {
      mapLibreMap.addSource(OPENFREE_CONTOUR_SOURCE_ID, {
        type: "vector",
        url: OPENFREE_CONTOUR_TILEJSON_URL
      });
    }
    if (!mapLibreMap.getSource(MAPLIBRE_RELIEF_SOURCE_ID)) {
      mapLibreMap.addSource(MAPLIBRE_RELIEF_SOURCE_ID, {
        type: "raster-dem",
        tiles: [MAPLIBRE_RELIEF_TILE_URL],
        tileSize: 256,
        maxzoom: MAPLIBRE_RELIEF_MAX_SOURCE_ZOOM,
        encoding: "terrarium",
        attribution: "Terrain: Mapzen terrain tiles via AWS Open Data"
      });
    }
    if (!mapLibreMap.getLayer(MAPLIBRE_RELIEF_LAYER_ID)) {
      mapLibreMap.addLayer({
        id: MAPLIBRE_RELIEF_LAYER_ID,
        type: "hillshade",
        source: MAPLIBRE_RELIEF_SOURCE_ID,
        minzoom: 0,
        maxzoom: OPENFREE_CONTOUR_MAX_DISPLAY_ZOOM,
        layout: { visibility: "none" },
        paint: {
          "hillshade-exaggeration": 0,
          "hillshade-shadow-color": mapLibreColorWithAlpha(styleHighColor("topography"), 0.42),
          "hillshade-highlight-color": mapLibreColorWithAlpha(mixHex(styleColor("topography"), "#ffffff", 0.72), 0.22),
          "hillshade-accent-color": mapLibreColorWithAlpha(mixHex(styleHighColor("topography"), "#111827", 0.28), 0.3),
          "hillshade-illumination-direction": 315,
          "hillshade-illumination-altitude": 42,
          "hillshade-illumination-anchor": "map",
          "hillshade-method": "igor"
        }
      }, mapLibreReliefBeforeLayerId());
    }
    const beforeId = mapLibreTopographyBeforeLayerId();
    if (!mapLibreMap.getLayer("openfree-contours")) {
      mapLibreMap.addLayer({
        id: "openfree-contours",
        type: "line",
        source: OPENFREE_CONTOUR_SOURCE_ID,
        "source-layer": "contours",
        minzoom: OPENFREE_CONTOUR_MIN_ZOOM,
        layout: {
          visibility: "none",
          "line-cap": "round",
          "line-join": "round"
        },
        paint: {
          "line-color": styleColor("topography"),
          "line-opacity": 0,
          "line-width": 0
        }
      }, beforeId);
    }
    if (mapLibreMap.getLayer("openfree-contour-labels")) {
      mapLibreMap.removeLayer("openfree-contour-labels");
    }
    mapLibreMap.setLayerZoomRange(
      "openfree-contours",
      OPENFREE_CONTOUR_MIN_ZOOM,
      OPENFREE_CONTOUR_MAX_DISPLAY_ZOOM
    );
    return true;
  } catch (error) {
    console.warn("MapLibre contour topography layers could not be prepared.", error);
    return false;
  }
}

function setMapLibreLayerVisibility(layerId, visible) {
  if (!mapLibreMap?.getLayer?.(layerId)) return;
  try {
    const nextVisibility = visible ? "visible" : "none";
    const currentVisibility = mapLibreMap.getLayoutProperty(layerId, "visibility") || "visible";
    if (currentVisibility !== nextVisibility) {
      mapLibreMap.setLayoutProperty(layerId, "visibility", nextVisibility);
    }
  } catch (error) {
    console.warn(`MapLibre layer ${layerId} visibility could not be updated.`, error);
  }
}

function refreshMapLibreTopographyStyle({ forceHidden = false } = {}) {
  if (!mapLibreMap?.getStyle?.()) return;
  suppressProviderTopographyLayers();
  if (forceHidden || !mapLibreBasemapEnabled()) {
    OPENFREE_CONTOUR_LAYER_IDS.forEach(layerId => setMapLibreLayerVisibility(layerId, false));
    setMapLibreLayerVisibility(MAPLIBRE_RELIEF_LAYER_ID, false);
    return;
  }
  const topoVisible = Boolean(els.toggleTopo.checked);
  const faintVisible = Boolean(els.toggleFaintTopo.checked);
  if (!topoVisible && !faintVisible) {
    OPENFREE_CONTOUR_LAYER_IDS.forEach(layerId => setMapLibreLayerVisibility(layerId, false));
    setMapLibreLayerVisibility(MAPLIBRE_RELIEF_LAYER_ID, false);
    return;
  }
  if (!ensureMapLibreTopographyLayers()) return;
  const activeKey = topoVisible ? "topography" : "faintTopography";
  const contourOpacity = topoVisible || faintVisible
    ? clamp(
      topoVisible
        ? styleOpacity("topography") * 0.82
        : styleOpacity("faintTopography") * 0.34,
      0,
      0.9
    )
    : 0;
  const contourLowColor = styleColor(activeKey);
  const contourHighColor = styleHighColor(activeKey);
  const indexContourFilter = ["any", ["==", ["get", "idx"], true], ["==", ["get", "idx"], 1], ["==", ["get", "idx"], "true"]];
  const contourFeatureOpacity = [
    "case",
    indexContourFilter,
    contourOpacity,
    clamp(contourOpacity * 0.44, 0, 0.42)
  ];
  const contourWidth = [
    "case",
    indexContourFilter,
    Math.max(0.35, styleSize(activeKey) * 1.45),
    Math.max(0.18, styleSize(activeKey) * 0.72)
  ];
  const reliefStrength = topoVisible
    ? clamp(styleSize("topography") * styleOpacity("topography"), 0, 1)
    : faintVisible
      ? clamp(styleSize("faintTopography") * styleOpacity("faintTopography") * 0.72, 0, 0.72)
      : 0;
  const reliefByZoom = [
    "interpolate", ["linear"], ["zoom"],
    0, reliefStrength * 0.55,
    4, reliefStrength * 0.88,
    7, reliefStrength * 0.86,
    9, reliefStrength * 0.72,
    11, reliefStrength * 0.52,
    14, reliefStrength * 0.28,
    17, reliefStrength * 0.14,
    20, reliefStrength * 0.07,
    24, reliefStrength * 0.035
  ];
  const reliefShadow = mapLibreColorWithAlpha(mixHex(contourHighColor, "#111827", 0.3), topoVisible ? 0.46 : 0.3);
  const reliefHighlight = mapLibreColorWithAlpha(mixHex(contourLowColor, "#ffffff", 0.74), topoVisible ? 0.24 : 0.16);
  const reliefAccent = mapLibreColorWithAlpha(mixHex(contourHighColor, "#111827", 0.38), topoVisible ? 0.32 : 0.2);
  try {
    setMapLibreLayerVisibility(MAPLIBRE_RELIEF_LAYER_ID, topoVisible || faintVisible);
    mapLibreMap.setPaintProperty(MAPLIBRE_RELIEF_LAYER_ID, "hillshade-exaggeration", reliefByZoom);
    mapLibreMap.setPaintProperty(MAPLIBRE_RELIEF_LAYER_ID, "hillshade-shadow-color", reliefShadow);
    mapLibreMap.setPaintProperty(MAPLIBRE_RELIEF_LAYER_ID, "hillshade-highlight-color", reliefHighlight);
    mapLibreMap.setPaintProperty(MAPLIBRE_RELIEF_LAYER_ID, "hillshade-accent-color", reliefAccent);
    mapLibreMap.setPaintProperty(MAPLIBRE_RELIEF_LAYER_ID, "hillshade-illumination-altitude", 42);
    mapLibreMap.setPaintProperty(MAPLIBRE_RELIEF_LAYER_ID, "hillshade-illumination-anchor", "map");
    mapLibreMap.setPaintProperty(MAPLIBRE_RELIEF_LAYER_ID, "hillshade-method", "igor");
    setMapLibreLayerVisibility("openfree-contours", topoVisible || faintVisible);
    mapLibreMap.setPaintProperty("openfree-contours", "line-color", [
      "interpolate", ["linear"], ["to-number", ["get", "ele"], 0],
      0, contourLowColor,
      2500, contourLowColor,
      6500, contourHighColor,
      11000, contourHighColor
    ]);
    mapLibreMap.setPaintProperty("openfree-contours", "line-opacity", [
      "interpolate", ["linear"], ["zoom"],
      OPENFREE_CONTOUR_MIN_ZOOM, ["*", contourFeatureOpacity, 0.42],
      10, ["*", contourFeatureOpacity, 0.88],
      13, ["*", contourFeatureOpacity, 0.72],
      16, ["*", contourFeatureOpacity, 0.5],
      20, ["*", contourFeatureOpacity, 0.3],
      OPENFREE_CONTOUR_MAX_DISPLAY_ZOOM, ["*", contourFeatureOpacity, 0.2]
    ]);
    mapLibreMap.setPaintProperty("openfree-contours", "line-width", contourWidth);
    reorderMapLibreSurfaceLayers();
  } catch (error) {
    console.warn("MapLibre contour topography style could not be updated.", error);
  }
}
