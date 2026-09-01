"use strict";

// Leaflet fallback styling, labels, routes, markers, and custom vector layers.

function rasterTintFilter(hex) {
  const hsl = hexToHsl(hex);
  const invert = clamp(hsl.l + 4, 18, 88);
  const saturation = clamp(hsl.s * 18, 260, 2400);
  const brightness = clamp(0.78 + hsl.l / 85, 0.86, 1.45);
  return `brightness(0) saturate(100%) invert(${invert}%) sepia(78%) saturate(${saturation}%) hue-rotate(${hsl.h - 38}deg) brightness(${brightness}) contrast(96%)`;
}

function applyStreetTileStyle(layer, style, visible) {
  if (!layer) return;

  const opacity = visible
    ? clamp((style?.opacity ?? style?.size ?? 0.75), 0, 1)
    : 0;

  layer.setOpacity(opacity);

  const container = layer.getContainer?.() || layer._container;
  if (!container) return;

  container.style.filter = "";
  container.style.mixBlendMode = "normal";
  container.style.display = visible ? "" : "none";
}

function refreshStreetStyle() {
  if (mapLibreBasemapEnabled()) {
    applyStreetTileStyle(streetLayer, layerStyles.majorRoads, false);
    applyStreetTileStyle(faintStreetLayer, layerStyles.minorRoads, false);
    streetVectorOverlay.style.mixBlendMode = "normal";
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
    if (mapLibreMap) {
      scheduleMapLibreThemeRefresh();
    } else {
      applyThemeToMapLibreRenderer(activeTheme || activeThemeFromLayerStyles());
      applyTextureOverlays(activeTheme || activeThemeFromLayerStyles());
    }
    return;
  }
  applyStreetTileStyle(streetLayer, layerStyles.majorRoads, majorRoadsVisible());
  applyStreetTileStyle(faintStreetLayer, layerStyles.minorRoads, minorRoadsVisible());
  const pane = map.getPane("streetPane");
  if (pane) {
    pane.style.filter = "";
    pane.style.mixBlendMode = "normal";
  }
  streetVectorOverlay.style.mixBlendMode = "normal";
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
  refreshStreetVectorStyle();
}



function setCustomLayerColor(key, color) {
  if (layerStyles[key] && typeof color === "string") {
    layerStyles[key].color = color;
  }
}

function applyThemeToCustomRenderer(theme = activeThemeFromLayerStyles()) {
  if (!theme) return;
  setCustomLayerColor("land", theme.land?.color);
  setCustomLayerColor("water", theme.water?.color);
  setCustomLayerColor("parks", theme.parks?.color);
  setCustomLayerColor("buildings", theme.buildings?.color);
  setCustomLayerColor("highways", theme.highways?.color);
  setCustomLayerColor("majorRoads", theme.majorRoads?.color);
  setCustomLayerColor("minorRoads", theme.minorRoads?.color);
  setCustomLayerColor("railroads", theme.railroads?.color);
  setCustomLayerColor("countryBorders", theme.countryBorders?.color);
  setCustomLayerColor("stateBorders", theme.stateBorders?.color);
  setCustomLayerColor("countyBorders", theme.countyBorders?.color);
  refreshStyledLayers();
}



function makeCityLabel(city) {
  const key = cityLayerKey(city);
  const style = layerStyles[key];
  const size = styleSize(key);
  const halo = labelHaloColor(style.color);
  const fontFamily = styleFontFamily(key).replace(/"/g, "'");
  const stretch = styleFontStretch(key) / 100;
  const scaleY = styleFontScaleY(key) / 100;
  const labelSize = city.labelSize || cityLabelSize(city, size);
  const labelAnchor = city.labelAnchor || [labelSize.width / 2, labelSize.height / 2];
  const backgroundColor = style.labelBackground ? styleLabelBackgroundColor(key) : "transparent";
  const backgroundOpacity = style.labelBackground ? styleLabelBackgroundOpacity(key) : 0;
  const backgroundRgb = style.labelBackground ? hexToRgbTriplet(backgroundColor) : "255 255 255";
  const labelText = escapeHtml(formatMapLabelText(city.name, key));
  const icon = L.divIcon({
    className: "",
    html: `<span class="city-label ${city.type}" style="color: ${style.color}; --label-halo: ${halo}; --label-halo-width: ${labelHaloWidthForStyle(key)}px; --label-bg-rgb: ${backgroundRgb}; --label-bg-opacity: ${backgroundOpacity}; font-family: ${fontFamily}; font-size: ${size}px; font-weight: ${styleFontWeight(key)}; font-style: ${styleItalic(key) ? "italic" : "normal"}; letter-spacing: ${styleLetterSpacing(key)}em; word-spacing: ${styleWordSpacing(key)}em; opacity: ${styleOpacity(key)}; mix-blend-mode: ${styleBlend(key)}; transform: scale(${stretch}, ${scaleY});">${labelText}</span>`,
    iconSize: [labelSize.width, labelSize.height],
    iconAnchor: labelAnchor
  });

  return L.marker(city.labelCenter || [city.lat, city.lon], {
    icon,
    pane: "labelPane",
    draggable: false,
    interactive: city.osmPlace === "route-endpoint",
    keyboard: false
  });
}

function cityLabelMinZoom(city) {
  if (city.osmPlace === "route-endpoint") return 3.8;
  if (city.type === "capital") return city.population >= 500000 ? 4.6 : 5.2;
  if (city.population >= 1000000) return 4.8;
  if (city.population >= 500000) return 5.4;
  if (city.population >= OSM_CITY_POPULATION_MIN) return 6.0;
  return 7.8;
}

function shouldRenderCityLabel(city) {
  if (!cityLayerEnabled(city)) return false;
  if (city.osmPlace !== "route-endpoint") {
    const stopNames = activeRouteStopLabelSet();
    if (stopNames.has(normalizeRouteStopLabel(city.name))) return false;
  }
  const zoom = map.getZoom();
  return zoom >= cityLabelMinZoom(city);
}

function addCityLabelToGroup(city) {
  if (!shouldRenderCityLabel(city)) return;
  const label = makeCityLabel(city);
  if (city.osmPlace === "route-endpoint") {
    bindDisplayPositionHandlers(label, labelDisplayPositionKey(city), L.latLng(city.lat, city.lon), {
      afterDrop: () => renderCityLabels()
    });
  }
  if (city.type === "capital") {
    capitalGroup.addLayer(label);
  } else if (city.type === "city") {
    cityGroup.addLayer(label);
  } else {
    smallTownGroup.addLayer(label);
  }
}

function stateLineStyle(key) {
  const style = layerStyles[key];
  const textureOptions = texturedLineOptions(key, styleOpacity(key));
  return {
    color: texturedStrokePaint(key, boundaryRenderer),
    weight: styleSize(key),
    opacity: textureOptions.opacity,
    dashArray: textureOptions.dashArray,
    lineCap: textureOptions.lineCap,
    fillOpacity: 0
  };
}

async function loadStateLines() {
  try {
    const response = await fetch(STATE_LINES_URL);
    if (!response.ok) throw new Error("State line data could not be loaded.");
    const geojson = await response.json();
    state.stateLineGeoJson = geojson;
    L.geoJSON(geojson, {
      pane: "boundaryPane",
      renderer: boundaryRenderer,
      interactive: false,
      style: stateLineStyle("stateLines")
    }).addTo(stateLineGroup);
    L.geoJSON(geojson, {
      pane: "boundaryPane",
      renderer: boundaryRenderer,
      interactive: false,
      style: stateLineStyle("faintStateLines")
    }).addTo(faintStateLineGroup);
    restyleStateLines();
  } catch (error) {
    els.status.textContent = `${els.status.textContent} State lines unavailable.`;
  }
}



function renderCityLabels() {
  smallTownGroup.clearLayers();
  cityGroup.clearLayers();
  capitalGroup.clearLayers();
  renderedCityLabels = selectCityLabelsForView();
  renderedCityLabels.forEach(addCityLabelToGroup);
}



function rebuildCityLabels() {
  renderCityLabels();
}

function restyleStateLines() {
  stateLineGroup.eachLayer(layer => {
    layer.setStyle?.(stateLineStyle("stateLines"));
    applyLayerElementBlend(layer, "stateLines");
    layer.eachLayer?.(child => applyLayerElementBlend(child, "stateLines"));
  });
  faintStateLineGroup.eachLayer(layer => {
    layer.setStyle?.(stateLineStyle("faintStateLines"));
    applyLayerElementBlend(layer, "faintStateLines");
    layer.eachLayer?.(child => applyLayerElementBlend(child, "faintStateLines"));
  });
}


function journeyOverviewColor(index) {
  return normalizeJourneyStyle(state.trips[index]?.journeyStyle, index).routeColor;
}

function usJourneyRouteWeight() {
  // US overview routes are intentionally prominent at country scale, but they
  // need to yield visual space as the map reveals local detail.
  const zoom = map?.getZoom?.() ?? 4.5;
  const scale = Math.pow(2, (4.5 - zoom) * 0.24);
  return clamp(usJourneyRouteWidth * scale, 1.5, 24);
}

function renderUsJourneyOverview() {
  const layers = [];
  state.trips.forEach((trip, tripIndex) => {
    const journeyStyle = normalizeJourneyStyle(trip.journeyStyle, tripIndex);
    trip.journeyStyle = journeyStyle;
    if (!journeyStyle.usFeatures.route) return;
    const color = journeyStyle.routeColor;
    const routeWeight = usJourneyRouteWeight();
    const overviewScale = routeWeight / Math.max(usJourneyRouteWidth, 1);
    const outlineWidth = journeyStyle.outlineWidth * overviewScale;
    const hoverWeight = Math.max(1, routeWeight * 0.16);
    const journeyLines = [];
    const journeyPoints = [];
    (trip.days || []).forEach((route, routeIndex) => {
      if (!route?.displayPoints?.length) return;
      const latLngs = route.displayPoints.map(toLatLng);
      journeyPoints.push(...latLngs);
      const halo = L.polyline(latLngs, {
        color: journeyStyle.outlineColor,
        weight: routeWeight + outlineWidth * 2,
        opacity: outlineWidth > 0 ? journeyStyle.outlineOpacity : 0,
        pane: "faintRoutePane",
        renderer: faintRouteRenderer,
        className: "leaflet-journey-overview-route journey-overview-halo",
        lineCap: "round",
        lineJoin: "round"
      });
      const line = L.polyline(latLngs, {
        color,
        weight: routeWeight,
        opacity: 0.96,
        pane: "activeRoutePane",
        renderer: activeRouteRenderer,
        className: "leaflet-journey-overview-route",
        lineCap: "round",
        lineJoin: "round"
      });
      [halo, line].forEach(layer => {
        // Country view shows journeys instead of an unreadable stack of routes.
        const labelsAllowed = false;
        if (labelsAllowed) {
          const content = journeyStyle.routeLabelContent || "all";
          const name = route.label || `${terminologyValue("route")} ${routeIndex + 1}`;
          const start = routePlaceName(route.startQuery || route.startAddress || route.summary?.split(" to ")[0]) || "Start";
          const end = routePlaceName(route.endQuery || route.endAddress || route.summary?.split(" to ").slice(1).join(" to ")) || "End";
          const endpoints = content === "start" ? start : content === "end" ? end : `${start} → ${end}`;
          const label = content === "route" ? escapeHtml(name)
            : content === "endpoints" || content === "start" || content === "end" ? escapeHtml(endpoints)
              : `<strong>${escapeHtml(name)}</strong><span>${escapeHtml(endpoints)}</span>`;
          layer.bindTooltip(label, {
            sticky: journeyStyle.routeLabelVisibility !== "always",
            permanent: journeyStyle.routeLabelVisibility === "always",
            direction: "top",
            className: "journey-overview-tooltip"
          });
        }
        layer.on("click", () => openJourneyOverview(tripIndex));
        layer.on("mouseover", () => line.setStyle({ weight: routeWeight + hoverWeight, opacity: 1 }));
        layer.on("mouseout", () => line.setStyle({ weight: routeWeight, opacity: 0.96 }));
      });
      faintRouteGroup.addLayer(halo);
      routeGroup.addLayer(line);
      journeyLines.push(line);
      layers.push(halo, line);
    });
    if (journeyStyle.usFeatures.labels && journeyPoints.length) {
      const baseLatLng = L.latLngBounds(journeyPoints).getCenter();
      const label = L.marker(offsetLatLngByPixels(baseLatLng, "journey-label", trip), {
        pane: "labelPane",
        interactive: true,
        keyboard: true,
        icon: L.divIcon({
          className: "journey-overview-label-icon",
          html: `<button class="journey-overview-label" type="button">${escapeHtml(trip.name || `Journey ${tripIndex + 1}`)}</button>`,
          iconSize: [148, 38],
          iconAnchor: [74, 19]
        })
      });
      label.on("click", () => openJourneyOverview(tripIndex));
      label.on("mouseover", () => journeyLines.forEach(line => line.setStyle({ weight: routeWeight + hoverWeight, opacity: 1 })));
      label.on("mouseout", () => journeyLines.forEach(line => line.setStyle({ weight: routeWeight, opacity: 0.96 })));
      bindDisplayPositionHandlers(label, "journey-label", baseLatLng, { trip });
      routeGroup.addLayer(label);
      layers.push(label);
    }
  });
  state.routeLayer = layers.find(layer => layer.getBounds) || null;
  return layers;
}



function renderRoute(fit = true, fitOptions = {}) {
  routeGroup.clearLayers();
  faintRouteGroup.clearLayers();
  clearOverviewRouteAnimation();
  subduedRouteGroup.clearLayers();
  playbackGroup.clearLayers();
  routeHoverZoneGroup.clearLayers();
  mediaMarkerGroup.clearLayers();
  stickerGroup.clearLayers();
  markerGroup.clearLayers();
  routeWaypointGroup.clearLayers();
  state.routeLayer = null;
  const routeData = activeRoute();
  let zoneRects = [];

  if (state.contiguousUsMode) {
    renderUsJourneyOverview();
    renderStickers();
    state.playback.layer = null;
    state.playback.icon = null;
    state.playback.pathLength = 0;
    const activeUsFeatures = normalizeJourneyStyle(activeTrip()?.journeyStyle, state.activeTripIndex).usFeatures;
    if (activeUsFeatures.landmarks || activeUsFeatures.stopMarkers) refreshEndpointMarkers();
    if (activeUsFeatures.mediaPins) renderMediaMarkers();
    applyRouteStackOrder();
    if (fit) {
      moveToBounds(L.latLngBounds(CONTIGUOUS_US_BOUNDS), fitOptions);
    }
    setPlaybackButtons();
    updateUsViewButton();
    return;
  }
  renderStickers();
  if (!routeData) {
    updateUsViewButton();
    return;
  }

  const drawActiveRoute = route => {
    const latLngs = route.displayPoints.map(toLatLng);
    const routeIndex = state.routes.indexOf(route);
    const routeColor = routeProgressColor(routeIndex);
    const halo = L.polyline(latLngs, {
    color: "#fffdf8",
    weight: styleSize("route") + layerStyles.route.halo,
    opacity: 0.88 * styleOpacity("route"),
    pane: "activeRoutePane",
    renderer: activeRouteRenderer,
    className: "leaflet-route-stroke",
    lineCap: "round",
    lineJoin: "round"
  });
    const activeLine = L.polyline(latLngs, {
    color: routeColor,
    weight: styleSize("route"),
    opacity: styleOpacity("route"),
    dashArray: null,
    pane: "activeRoutePane",
    renderer: activeRouteRenderer,
    className: "leaflet-route-stroke",
    lineCap: "round",
    lineJoin: "round"
  });
    halo.on("mouseover", event => scheduleOverviewHover(routeIndex, event));
    activeLine.on("mouseover", event => scheduleOverviewHover(routeIndex, event));
    halo.on("mouseout", () => cancelOverviewHover(routeIndex));
    activeLine.on("mouseout", () => cancelOverviewHover(routeIndex));
    const selectRoute = () => state.overviewMode ? zoomToOverviewZone(routeIndex) : setActiveRoute(routeIndex, true);
    halo.on("click", selectRoute);
    activeLine.on("click", selectRoute);
    routeGroup.addLayer(halo);
    routeGroup.addLayer(activeLine);
    applyLayerElementBlend(halo, "route");
    applyLayerElementBlend(activeLine, "route");
    state.routeLayer = activeLine;
    return activeLine;
  };

  const drawFaintRoute = (route, index, color) => {
    const hovered = state.overviewMode && state.overviewHover.activeIndex === index;
    const lineColor = color || routeProgressColor(index);
    const faintLine = L.polyline(route.displayPoints.map(toLatLng), {
      color: lineColor,
    weight: hovered ? styleSize("route") : styleSize("faintRoute"),
    opacity: hovered ? clamp(styleOpacity("faintRoute"), 0.72, 1) : clamp(styleOpacity("faintRoute"), 0.34, 0.78),
    dashArray: null,
    pane: "faintRoutePane",
    renderer: faintRouteRenderer,
    className: "leaflet-route-stroke",
    lineCap: "round",
    lineJoin: "round"
    });
    faintLine.on("mouseover", event => scheduleOverviewHover(index, event));
    faintLine.on("mouseout", () => cancelOverviewHover(index));
    // A broad transparent stroke makes every route reliably selectable, even
    // when a stop is focused and the visual faint route is deliberately thin.
    const hitArea = L.polyline(route.displayPoints.map(toLatLng), {
      pane: "routePane",
      color: lineColor,
      weight: Math.max(styleSize("route"), styleSize("faintRoute")) + 22,
      opacity: 0,
      interactive: true,
      bubblingMouseEvents: false,
      lineCap: "round",
      lineJoin: "round"
    });
    const selectRoute = () => state.overviewMode ? zoomToOverviewZone(index) : setActiveRoute(index, true);
    faintLine.on("click", selectRoute);
    hitArea.on("click", selectRoute);
    hitArea.on("mouseover", event => scheduleOverviewHover(index, event));
    hitArea.on("mouseout", () => cancelOverviewHover(index));
    faintRouteGroup.addLayer(faintLine);
    routeGroup.addLayer(hitArea);
    applyLayerElementBlend(faintLine, "faintRoute");
    return faintLine;
  };

  if (state.overviewMode) {
    const unitsPerPixel = fit ? overviewUnitsForFit() : projectedUnitsForCurrentZoom();
    zoneRects = overviewZoneRects(unitsPerPixel);
    const placedLabelRects = [];
    const focusIndex = state.overviewFocusIndex;
    if (focusIndex === null) {
      state.overviewZoneRects = zoneRects;
    }
    state.routes.forEach((route, index) => {
      const zone = zoneRects.find(item => item.index === index);
      if (zone && focusIndex === null) {
        addRouteHoverZone(route, index, zone.outer, zone.inner, zone.zoom, unitsPerPixel, placedLabelRects);
      }
      drawFaintRoute(route, index, routeProgressColor(index));
      if (index === focusIndex) {
        drawActiveRoute(route);
      }
    });
  } else {
    state.routes.forEach((route, index) => {
      if (index !== state.activeRouteIndex) {
        drawFaintRoute(route, index, routeProgressColor(index));
      }
    });
    // While a sealed playback leg is active, its immutable partial path is
    // the only prominent route.  Leaving the pre-animation full route beneath
    // it produced a visible, briefly incorrect line before the next renderer
    // update caught up.
    if (!state.playback.hasStarted) drawActiveRoute(routeData);
    drawFaintRoute(routeData, state.activeRouteIndex, routeProgressColor(state.activeRouteIndex));
  }

  state.playback.layer = null;
  state.playback.icon = null;
  state.playback.pathLength = 0;
  refreshEndpointMarkers();
  renderRouteAnimationStartIcon();
  renderRouteWaypoints();
  renderMediaMarkers();
  applyRouteStackOrder();
  if (fit) {
    const bounds = state.overviewMode && zoneRects?.length
      ? overviewFitBoundsFromRects(zoneRects)
      : state.overviewMode
        ? allRoutesLatLngBounds()
        : L.featureGroup(routeGroup.getLayers()).getBounds();
    if (bounds?.isValid()) {
      moveToBounds(bounds, fitOptions);
    }
  }
  setPlaybackButtons();
  updateUsViewButton();
  if (state.overviewMode && state.overviewFocusIndex === null && state.overviewHover.activeIndex !== null) {
    animateOverviewRoute(state.overviewHover.activeIndex);
  }
}



function renderLandmarks() {
  if (!els.landmarkGrid) return;
  const trip = activeTrip();
  const journeyLandmarks = tripLandmarkSettings(trip);
  const stops = landmarkStopsForTrip(trip);
  hydrateLandmarkAssetImages(trip);
  if (landmarkSettingsScope !== "default" && !stops.some(stop => stop.key === landmarkSettingsScope)) {
    landmarkSettingsScope = stops[0]?.key || "default";
  }
  const landmarks = editableLandmarkSettings();
  const marker = landmarks.marker;
  if (els.landmarkSettingsScope) {
    const options = [
      new Option("Default landmark", "default"),
      ...stops.map(stop => new Option(stop.name, stop.key))
    ];
    els.landmarkSettingsScope.replaceChildren(...options);
    els.landmarkSettingsScope.value = [...els.landmarkSettingsScope.options].some(option => option.value === landmarkSettingsScope)
      ? landmarkSettingsScope
      : "default";
  }
  // Visibility belongs to the journey, not to whichever default/stop style is
  // currently selected in the landmark editor. Keeping these controls bound to
  // the journey prevents an apparently enabled default from leaving the actual
  // journey markers disabled.
  els.landmarksEnabled.checked = journeyLandmarks.enabled;
  els.landmarkImageDisplay.value = journeyLandmarks.imageDisplay;
  if (els.landmarkGlobalSize) els.landmarkGlobalSize.value = String(Math.round(journeyLandmarks.scale * 100));
  if (els.landmarkGlobalSizeValue) {
    const scalePercent = Math.round(journeyLandmarks.scale * 100);
    els.landmarkGlobalSizeValue.textContent = scalePercent === 0 ? "Off" : `${scalePercent}%`;
  }
  if (els.useDefaultLandmarkForAll) els.useDefaultLandmarkForAll.checked = journeyLandmarks.useDefaultForAll;
  if (els.landmarkPerStopShapes) els.landmarkPerStopShapes.checked = journeyLandmarks.perStopShapes;
  updateLandmarkOutputValues(marker);
  if (els.landmarkShapeEnabled) els.landmarkShapeEnabled.checked = marker.shapeEnabled !== false;
  if (els.landmarkShape) els.landmarkShape.value = marker.shape;
  if (els.landmarkFillColor) els.landmarkFillColor.value = marker.fillColor;
  if (els.landmarkFillMode) els.landmarkFillMode.value = marker.fillMode || "shape";
  renderLandmarkStrokeList(els.landmarkImageStrokeList, marker.imageStrokes, "imageStrokes");
  renderLandmarkStrokeList(els.landmarkStrokeList, marker.strokes, "strokes");
  renderLandmarkPreview(marker);
  renderDefaultLandmarkTile();
  if (els.landmarkShapeStop) {
    const previous = els.landmarkShapeStop.value;
    els.landmarkShapeStop.replaceChildren(...stops.map(stop => new Option(stop.name, stop.key)));
    els.landmarkShapeStop.value = stops.some(stop => stop.key === previous) ? previous : stops[0]?.key || "";
  }
  const selectedStop = stops.find(stop => stop.key === els.landmarkShapeStop?.value);
  const selectedStopSettings = selectedStop
    ? journeyLandmarks.stops[selectedStop.key] || journeyLandmarks.stops[landmarkStopKey(selectedStop.name)] || {}
    : {};
  if (els.landmarkStopShape) {
    els.landmarkStopShape.value = MARKER_SHAPES.has(selectedStopSettings.shape) ? selectedStopSettings.shape : marker.shape;
    els.landmarkStopShape.disabled = !journeyLandmarks.perStopShapes || !selectedStop;
  }
  if (els.landmarkShapeStop) els.landmarkShapeStop.disabled = !journeyLandmarks.perStopShapes || !stops.length;
  els.landmarkGrid.replaceChildren();
  stops.forEach(stop => {
    const selected = journeyLandmarks.stops[stop.key] || journeyLandmarks.stops[landmarkStopKey(stop.name)] || {};
    const imageUrl = selected.imageUrl || firstLandmarkImageCandidateUrl(stop.name) || DEFAULT_LANDMARK_IMAGE_URL;
    const button = document.createElement("button");
    button.className = "landmark-tile";
    button.classList.toggle("is-selected", landmarkSettingsScope === stop.key);
    button.type = "button";
    button.dataset.stopKey = stop.key;
    button.dataset.help = "Click to edit this landmark. Right-click to choose or upload its image.";
    const nameParts = splitStopNameAndState(stop.name);
    const label = document.createElement("span");
    label.className = "landmark-tile-name";
    const townLine = document.createElement("span");
    townLine.className = "landmark-town-name";
    townLine.textContent = nameParts.town;
    const stateLine = document.createElement("span");
    stateLine.className = "landmark-state-abbr";
    stateLine.textContent = nameParts.state;
    label.append(townLine, stateLine);
    const image = document.createElement("img");
    image.alt = `${stop.name} landmark`;
    applyImageFallbacks(image, landmarkImageCandidateUrls(stop.name), selected.imageUrl || DEFAULT_LANDMARK_IMAGE_URL);
    if (selected.imageUrl) image.src = selected.imageUrl;
    button.append(image, label);
    button.addEventListener("click", () => {
      landmarkSettingsScope = stop.key;
      selectedLandmarkStopKey = stop.key;
      renderLandmarks();
    });
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      openLandmarkImageDialog(stop.key);
    });
    els.landmarkGrid.append(button);
  });
  renderJourneyLandmarkPanel();
  refreshImagePreviewDrawer();
  updateMapFeatureToolbar();
}
