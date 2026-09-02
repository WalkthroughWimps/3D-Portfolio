"use strict";

// Converts legacy or partial theme styles into the complete semantic style
// shape consumed by both map renderers.

function completeThemeStyles(styles = {}, palette = {}) {
  const legacyDayZones = styles.dayZones || {};
  if (!styles.dayZoneFill && Object.keys(legacyDayZones).length) {
    styles = {
      ...styles,
      dayZoneFill: {
        color: legacyDayZones.color || "#25313d",
        size: Number.isFinite(legacyDayZones.fillOpacity) ? legacyDayZones.fillOpacity : 0.08,
        opacity: Number.isFinite(legacyDayZones.fillOpacity) ? legacyDayZones.fillOpacity : 0.08,
        blend: legacyDayZones.blend || "multiply"
      }
    };
  }
  if (!styles.dayZoneStroke && Object.keys(legacyDayZones).length) {
    styles = {
      ...styles,
      dayZoneStroke: {
        color: legacyDayZones.color || "#25313d",
        size: Number.isFinite(legacyDayZones.size) ? legacyDayZones.size : 2,
        opacity: Number.isFinite(legacyDayZones.opacity) ? legacyDayZones.opacity : 0.68,
        dashLength: Number.isFinite(legacyDayZones.dashLength) ? legacyDayZones.dashLength : 8,
        dashGap: Number.isFinite(legacyDayZones.dashGap) ? legacyDayZones.dashGap : 10,
        dashLocked: Boolean(legacyDayZones.dashLocked),
        blend: legacyDayZones.blend || "normal"
      }
    };
  }
  const land = palette.land || styles.land?.color || "#efd6a5";
  const water = palette.water || styles.water?.color || "#5bc5d7";
  const landIsDark = relativeLuminance(land) < 0.35;
  const labelCandidates = landIsDark ? ["#f8fbff", "#ffd166", "#dff8ef", "#111827"] : ["#142033", "#4b2218", "#073b4c", "#fffdf8"];
  const lineCandidates = landIsDark ? ["#ffd166", "#8ee3ef", "#f2f7ff", "#ff8a70"] : ["#23384c", "#9f2d1e", "#0b7285", "#6b3f1f"];
  const ink = ensureContrastColor(palette.ink || styles.cities?.color || readableTextColor(land), land, 4.5, labelCandidates);
  const muted = ensureContrastColor(palette.muted || styles.smallTowns?.color || mixHex(ink, land, 0.22), land, 3, labelCandidates);
  const route = ensureContrastColor(palette.route || styles.route?.color || "#2b8fc4", land, 3.2, ["#d62828", "#0077b6", "#ffd166", "#ff7b54", "#1f7a5c"]);
  const roadSeed = mixHex(route, land, landIsDark ? 0.18 : 0.34);
  const road = ensureContrastColor(palette.road || styles.streets?.color || roadSeed, land, 2.5, [roadSeed, ...lineCandidates]);
  const boundary = ensureContrastColor(palette.boundary || styles.stateLines?.color || "#b97a88", land, 2, lineCandidates);
  const faintRoute = ensureContrastColor(palette.faintRoute || styles.faintRoute?.color || mixHex(route, land, 0.25), land, 2, lineCandidates);
  const marker = ensureContrastColor(palette.marker || styles.startEnd?.color || "#9f2d1e", land, 3.8, ["#d62828", "#ff775e", "#ffd166", "#111827", "#fffdf8"]);
  const topoLow = palette.topoLow || styles.topography?.color || mixHex(land, landIsDark ? "#ffffff" : "#000000", 0.18);
  const topoHigh = ensureContrastColor(palette.topoHigh || styles.topography?.colorHigh || mixHex(ink, land, 0.25), land, 1.7, lineCandidates);
  const result = {
    land: { color: land, size: 1, opacity: 1, blend: "normal", texture: themeLayerTexture("natural-paper", 0.3, "multiply", 1.6, "tactile-noise-light", 0.04), ...styles.land },
    water: { color: water, size: 1, opacity: 1, blend: "normal", texture: themeLayerTexture("washi", 0.18, "soft-light", 1.1), ...styles.water },
    texture: { color: palette.texture || mixHex(land, ink, 0.42), size: 0.28, opacity: 1, blend: "multiply", texture: themeLayerTexture("natural-paper", 0.1, "multiply", 1.2), ...styles.texture },
    topography: { color: topoLow, colorHigh: topoHigh, size: 0.44, opacity: 1, blend: "multiply", texture: themeLayerTexture("none", 0), ...styles.topography },
    faintTopography: { color: mixHex(topoLow, land, 0.45), colorHigh: mixHex(topoHigh, land, 0.35), size: 0.18, opacity: 1, blend: "soft-light", texture: themeLayerTexture("none", 0), ...styles.faintTopography },
    streets: { color: road, size: 0.92, opacity: 1, blend: landIsDark ? "screen" : "multiply", texture: themeLayerTexture("none", 0), ...styles.streets },
    faintStreets: { color: ensureContrastColor(mixHex(road, land, 0.18), land, 1.9, lineCandidates), size: 0.48, opacity: 1, blend: landIsDark ? "screen" : "multiply", texture: themeLayerTexture("none", 0), ...styles.faintStreets },
    stateLines: { color: boundary, size: 1.05, opacity: 1, blend: "normal", texture: themeLayerTexture("none", 0), ...styles.stateLines },
    faintStateLines: { color: mixHex(boundary, land, 0.38), size: 0.74, opacity: 0.18, blend: "normal", texture: themeLayerTexture("none", 0), ...styles.faintStateLines },
    visitedStates: { color: route, size: 0.22, opacity: 0.22, blend: "multiply", texture: themeLayerTexture("none", 0), ...styles.visitedStates },
    route: { color: route, size: 5.3, opacity: 1, blend: "normal", texture: themeLayerTexture("none", 0), ...styles.route },
    faintRoute: { color: faintRoute, size: 4, opacity: 0.24, blend: "normal", texture: themeLayerTexture("none", 0), ...styles.faintRoute },
    startEnd: { color: marker, size: 7.2, opacity: 1, blend: "normal", texture: themeLayerTexture("none", 0), ...styles.startEnd },
    dayZoneFill: { color: boundary, size: 0.08, opacity: 0.08, blend: landIsDark ? "screen" : "multiply", texture: themeLayerTexture("none", 0), ...styles.dayZoneFill },
    dayZoneStroke: { color: boundary, size: 2, dashLength: 8, dashGap: 10, dashLocked: false, opacity: 0.68, blend: "normal", texture: themeLayerTexture("none", 0), ...styles.dayZoneStroke },
    smallTowns: { color: muted, size: 10, opacity: 1, blend: "normal", font: "noto-sans", fontWeight: 500, texture: themeLayerTexture("none", 0), ...styles.smallTowns },
    cities: { color: ink, size: 12.5, opacity: 1, blend: "normal", font: "noto-sans", fontWeight: 500, texture: themeLayerTexture("none", 0), ...styles.cities },
    capitols: { color: marker, size: 12.5, opacity: 1, blend: "normal", font: "noto-sans", fontWeight: 600, texture: themeLayerTexture("none", 0), ...styles.capitols }
  };
  result.cities.color = ensureContrastColor(result.cities.color, land, 4.5, labelCandidates);
  result.capitols.color = ensureContrastColor(result.capitols.color, land, 4.5, [marker, ...labelCandidates]);
  result.smallTowns.color = ensureContrastColor(result.smallTowns.color, land, 3, labelCandidates);
  result.streets.color = ensureContrastColor(result.streets.color, land, 2.5, lineCandidates);
  result.streets.size = Math.max(result.streets.size || 0, 0.82);
  result.faintStreets.color = ensureContrastColor(result.faintStreets.color, land, 1.9, lineCandidates);
  result.faintStreets.size = Math.max(result.faintStreets.size || 0, 0.38);
  result.stateLines.color = ensureContrastColor(result.stateLines.color, land, 2, lineCandidates);
  result.route.color = ensureContrastColor(result.route.color, land, 3.2, ["#d62828", "#0077b6", "#ffd166", "#ff7b54", "#1f7a5c", "#111827", "#fffdf8"]);
  result.startEnd.color = ensureContrastColor(result.startEnd.color, land, 3.8, ["#d62828", "#ff775e", "#ffd166", "#111827", "#fffdf8"]);
  // Semantic MapLibre theme groups. These keys are the single source used by the
  // Theme panel and by applyThemeToMapLibreRenderer(). Keep the old legacy keys
  // above for backward compatibility, but always expose the expanded semantic set.
  result.parks = {
    color: palette.park || styles.parks?.color || mixHex(land, landIsDark ? "#7fbf7f" : "#6fae63", landIsDark ? 0.32 : 0.42),
    size: 0.36,
    opacity: 0.44,
    blend: landIsDark ? "screen" : "multiply",
    texture: themeLayerTexture("none", 0),
    ...styles.parks
  };
  result.buildings = {
    color: palette.building || styles.buildings?.color || mixHex(land, ink, landIsDark ? 0.18 : 0.12),
    size: 0.46,
    opacity: 0.62,
    blend: "normal",
    texture: themeLayerTexture("none", 0),
    ...styles.buildings
  };
  result.highways = {
    ...result.streets,
    label: "Highways",
    color: palette.highway || styles.highways?.color || result.streets.color,
    size: Number.isFinite(styles.highways?.size) ? styles.highways.size : Math.max(result.streets.size || 0, 0.9),
    opacity: Number.isFinite(styles.highways?.opacity) ? styles.highways.opacity : result.streets.opacity,
    texture: themeLayerTexture("none", 0),
    ...styles.highways
  };
  result.majorRoads = {
    ...result.streets,
    label: "Major roads",
    color: palette.majorRoad || styles.majorRoads?.color || result.streets.color,
    size: Number.isFinite(styles.majorRoads?.size) ? styles.majorRoads.size : result.streets.size,
    opacity: Number.isFinite(styles.majorRoads?.opacity) ? styles.majorRoads.opacity : result.streets.opacity,
    texture: themeLayerTexture("none", 0),
    ...styles.majorRoads
  };
  result.minorRoads = {
    ...result.faintStreets,
    label: "Minor roads",
    color: palette.minorRoad || styles.minorRoads?.color || result.faintStreets.color,
    size: Number.isFinite(styles.minorRoads?.size) ? styles.minorRoads.size : result.faintStreets.size,
    opacity: Number.isFinite(styles.minorRoads?.opacity) ? styles.minorRoads.opacity : result.faintStreets.opacity,
    texture: themeLayerTexture("none", 0),
    ...styles.minorRoads
  };
  result.railroads = {
    label: "Railroads",
    color: palette.rail || styles.railroads?.color || mixHex(boundary, ink, 0.28),
    size: 0.34,
    opacity: 0.75,
    blend: "multiply",
    texture: themeLayerTexture("none", 0),
    ...styles.railroads
  };
  result.pois = {
    label: "POIs",
    color: palette.poi || styles.pois?.color || mixHex(result.parks.color, ink, 0.25),
    size: 10.5,
    opacity: 0.92,
    blend: "normal",
    font: "noto-sans",
    fontWeight: 500,
    texture: themeLayerTexture("none", 0),
    ...styles.pois
  };
  result.capitals = {
    ...result.capitols,
    label: "Capitals",
    color: styles.capitals?.color || result.capitols.color,
    texture: themeLayerTexture("none", 0),
    ...styles.capitals
  };
  result.countryBorders = {
    ...result.stateLines,
    label: "Country borders",
    color: palette.countryBoundary || styles.countryBorders?.color || result.stateLines.color,
    size: Number.isFinite(styles.countryBorders?.size) ? styles.countryBorders.size : Math.max(result.stateLines.size || 0, 1.35),
    opacity: Number.isFinite(styles.countryBorders?.opacity) ? styles.countryBorders.opacity : result.stateLines.opacity,
    texture: themeLayerTexture("none", 0),
    ...styles.countryBorders
  };
  result.stateBorders = {
    ...result.stateLines,
    label: "State borders",
    color: palette.stateBoundary || styles.stateBorders?.color || result.stateLines.color,
    size: Number.isFinite(styles.stateBorders?.size) ? styles.stateBorders.size : result.stateLines.size,
    opacity: Number.isFinite(styles.stateBorders?.opacity) ? styles.stateBorders.opacity : result.stateLines.opacity,
    texture: themeLayerTexture("none", 0),
    ...styles.stateBorders
  };
  result.countyBorders = {
    ...result.faintStateLines,
    label: "County borders",
    color: palette.countyBoundary || styles.countyBorders?.color || result.faintStateLines.color,
    size: Number.isFinite(styles.countyBorders?.size) ? styles.countyBorders.size : result.faintStateLines.size,
    opacity: Number.isFinite(styles.countyBorders?.opacity) ? styles.countyBorders.opacity : result.faintStateLines.opacity,
    texture: themeLayerTexture("none", 0),
    ...styles.countyBorders
  };
  result.topography.colorHigh = ensureContrastColor(result.topography.colorHigh, land, 1.7, lineCandidates);
  return result;
}
