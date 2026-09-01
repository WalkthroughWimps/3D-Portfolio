"use strict";

// Whole-trip overview geometry, hover zones, route previews, and focus restoration.

let overviewRouteAnimationToken = 0;

function overviewRouteReached(routeIndex) {
  return Number.isInteger(routeIndex)
    && state.overviewMode
    && state.overviewFocusIndex === null
    && state.overviewHover.filledIndex === routeIndex;
}



function clearOverviewHoverTimer() {
  if (state.overviewHover.timer) {
    clearTimeout(state.overviewHover.timer);
    state.overviewHover.timer = null;
  }
}

function clearOverviewRouteAnimation() {
  overviewRouteAnimationToken += 1;
  if (overviewRouteAnimationFrame) {
    cancelAnimationFrame(overviewRouteAnimationFrame);
    overviewRouteAnimationFrame = null;
  }
  if (overviewRouteIconAnimationFrame) {
    cancelAnimationFrame(overviewRouteIconAnimationFrame);
    overviewRouteIconAnimationFrame = null;
  }
  overviewHoverRouteGroup.clearLayers();
  state.overviewHover.icon = null;
  state.overviewHover.townHideKey = "";
}

function clearOverviewReachedRoute() {
  state.overviewHover.filledIndex = null;
}

function markOverviewRouteReached(index) {
  if (!Number.isInteger(index)) return;
  if (!state.overviewMode || state.overviewFocusIndex !== null) return;
  if (state.overviewHover.activeIndex !== index) return;
  if (state.overviewHover.filledIndex === index) return;
  state.overviewHover.filledIndex = index;
  refreshEndpointMarkers();
}

function clearOverviewHoverState(render = true) {
  clearOverviewHoverTimer();
  state.overviewHover.candidate = null;
  state.overviewHover.activeIndex = null;
  state.overviewHover.lockedIndex = null;
  clearOverviewReachedRoute();
  clearOverviewRouteAnimation();
  if (render) {
    renderRouteDayButtons();
    updateStats();
    renderRoute(false);
  }
}

function animateOverviewRoute(index) {
  clearOverviewRouteAnimation();
  // Whole-trip mode is deliberately static. Route drawing, media pins, and
  // the moving icon resume after the admin or visitor focuses a route.
  if (state.overviewMode && state.overviewFocusIndex === null) return;
  const route = state.routes[index];
  if (!route || !state.overviewMode || state.overviewFocusIndex !== null) return;
  if (state.overviewHover.filledIndex !== index) clearOverviewReachedRoute();

  const token = overviewRouteAnimationToken;
  const initialPoints = partialRoutePoints(route.displayPoints, 0).map(toLatLng);
  const lines = [
    L.polyline(initialPoints, {
      color: "#fffdf8",
      weight: styleSize("route") + layerStyles.route.halo,
      opacity: 0.88 * styleOpacity("route"),
      pane: "activeRoutePane",
      renderer: activeRouteRenderer,
      interactive: false,
      lineCap: "round",
      lineJoin: "round"
    }),
    L.polyline(initialPoints, {
      color: getRouteDisplayColors().fill,
      weight: styleSize("route"),
      opacity: styleOpacity("route"),
      pane: "activeRoutePane",
      renderer: activeRouteRenderer,
      interactive: false,
      lineCap: "round",
      lineJoin: "round"
    })
  ];
  lines.forEach(line => overviewHoverRouteGroup.addLayer(line));
  lines.forEach(line => applyLayerElementBlend(line, "route"));
  const iconSettings = getRouteAnimationIconSettings();
  const shouldShowIcon = iconSettings.enabled && iconSettings.size > 0 && route.displayPoints.length > 0;
  const iconMarker = shouldShowIcon
    ? L.marker(toLatLng(route.displayPoints[0]), {
        pane: "markerPane",
        interactive: true,
        draggable: false,
        keyboard: false,
        icon: routeAnimationLeafletIcon(iconSettings)
      })
    : null;
  if (iconMarker) {
    let currentIconBasePoint = route.displayPoints[0];
    bindRouteAnimationIconHandlers(iconMarker, () => currentIconBasePoint);
    overviewHoverRouteGroup.addLayer(iconMarker);
    state.overviewHover.icon = iconMarker;
    refreshMarkersWhenAnimationTownHideChanges("overview", index, iconMarker);
  }

  const beginAnimation = () => {
    overviewRouteAnimationFrame = null;
    if (token !== overviewRouteAnimationToken || state.overviewHover.activeIndex !== index) return;
    if (!els.animateOverviewRoutes.checked) {
      const fullPoints = route.displayPoints.map(toLatLng);
      lines.forEach(line => line.setLatLngs(fullPoints));
      const endPoint = route.displayPoints[route.displayPoints.length - 1];
      if (iconMarker && endPoint && !iconMarker._rvUserDragging) {
        currentIconBasePoint = endPoint;
        iconMarker.setLatLng(toLatLng(endPoint));
      }
      refreshMarkersWhenAnimationTownHideChanges("overview", index, iconMarker);
      markOverviewRouteReached(index);
      return;
    }
    const projected = route.displayPoints.map(point => map.latLngToLayerPoint(toLatLng(point)));
    const pixelLength = projected.slice(1).reduce((total, point, pointIndex) => total + point.distanceTo(projected[pointIndex]), 0);
    const durationMs = routeAnimationDurationForPath(pixelLength) * 1000;
    const startTime = performance.now();
    const moveRouteAndIcon = now => {
      if (token !== overviewRouteAnimationToken || state.overviewHover.activeIndex !== index) return;
      const progress = clamp((now - startTime) / durationMs, 0, 1);
      const visiblePoints = partialRoutePoints(route.displayPoints, progress).map(toLatLng);
      lines.forEach(line => line.setLatLngs(visiblePoints));
      const progressPoint = routeProgressPoint(route.displayPoints, progress);
      if (iconMarker && progressPoint) {
        currentIconBasePoint = progressPoint;
        if (!iconMarker._rvUserDragging) iconMarker.setLatLng(toLatLng(progressPoint));
      }
      refreshMarkersWhenAnimationTownHideChanges("overview", index, iconMarker);
      if (progress < 1) {
        overviewRouteAnimationFrame = requestAnimationFrame(moveRouteAndIcon);
      } else {
        overviewRouteAnimationFrame = null;
        markOverviewRouteReached(index);
      }
    };
    overviewRouteAnimationFrame = requestAnimationFrame(moveRouteAndIcon);
  };
  overviewRouteAnimationFrame = requestAnimationFrame(beginAnimation);
}



function sidePanelHovered() {
  return document.querySelector(".panel")?.matches(":hover") === true;
}



function scheduleOverviewHover(index, event = null) {
  if (!state.overviewMode || state.overviewFocusIndex !== null) return false;
  clearOverviewHoverTimer();
  if (index === state.overviewHover.lockedIndex) return true;
  if (!canRouteTakeHover(index)) {
    releaseOverviewHoverIfPointerLeft(event);
    return false;
  }
  state.overviewHover.candidate = index;
  state.overviewHover.activeIndex = index;
  state.overviewHover.lockedIndex = index;
  selectOverviewRoute(index, { render: false });
  renderRoute(false);
  // Rebuilding the overview replaces the hovered Leaflet zone. Its synthetic
  // mouseout used to unlock the route immediately, causing the replacement
  // zone to restart the animation on every mousemove. Restore the lock after
  // the rebuild so the path and icon receive one uninterrupted animation.
  state.overviewHover.candidate = index;
  state.overviewHover.activeIndex = index;
  state.overviewHover.lockedIndex = index;
  animateOverviewRoute(index);
  return true;
}

function cancelOverviewHover(index) {
  if (state.overviewHover.lockedIndex === index) {
    clearOverviewHoverTimer();
    state.overviewHover.lockedIndex = null;
    state.overviewHover.candidate = null;
  } else if (state.overviewHover.candidate === index) {
    state.overviewHover.candidate = null;
    clearOverviewHoverTimer();
  }
}

function releaseOverviewHoverIfPointerLeft(event = null) {
  const lockedIndex = state.overviewHover.lockedIndex;
  if (lockedIndex === null || !event?.latlng) return;
  const activeRoute = state.routes[lockedIndex];
  if (!activeRoute) {
    clearOverviewHoverState(true);
    return;
  }
  const unitsPerPixel = projectedUnitsForCurrentZoom();
  const pointer = map.project(event.latlng, 0);
  const settings = routeZoneSettings(activeRoute);
  const distance = distanceToProjectedRoute(pointer, activeRoute, unitsPerPixel, settings);
  const releasePixels = Math.max(
    Number(els.routeZoneSize?.value || settings.routeSize || 22) * 1.85,
    styleSize("route") + layerStyles.route.halo + 22
  );
  if (distance > releasePixels * unitsPerPixel) {
    state.overviewHover.lockedIndex = null;
    state.overviewHover.candidate = null;
  }
}



function projectRoutePoint(point) {
  return map.project(toLatLng(point), 0);
}

function unprojectOverviewPoint(point) {
  return map.unproject([point.x, point.y], 0);
}

function rectToBounds(rect) {
  return L.latLngBounds(
    unprojectOverviewPoint({ x: rect.minX, y: rect.maxY }),
    unprojectOverviewPoint({ x: rect.maxX, y: rect.minY })
  );
}

function rectToZoneLatLngs(rect, shape = "rect") {
  if (shape === "ellipse") {
    const points = [];
    const radiusX = (rect.maxX - rect.minX) / 2;
    const radiusY = (rect.maxY - rect.minY) / 2;
    for (let index = 0; index < 36; index += 1) {
      const angle = (Math.PI * 2 * index) / 36;
      points.push(unprojectOverviewPoint({
        x: rect.centerX + Math.cos(angle) * radiusX,
        y: rect.centerY + Math.sin(angle) * radiusY
      }));
    }
    return points;
  }
  if (shape === "diamond" || shape === "route-hull") {
    return [
      unprojectOverviewPoint({ x: rect.centerX, y: rect.minY }),
      unprojectOverviewPoint({ x: rect.maxX, y: rect.centerY }),
      unprojectOverviewPoint({ x: rect.centerX, y: rect.maxY }),
      unprojectOverviewPoint({ x: rect.minX, y: rect.centerY })
    ];
  }
  return [
    unprojectOverviewPoint({ x: rect.minX, y: rect.minY }),
    unprojectOverviewPoint({ x: rect.maxX, y: rect.minY }),
    unprojectOverviewPoint({ x: rect.maxX, y: rect.maxY }),
    unprojectOverviewPoint({ x: rect.minX, y: rect.maxY })
  ];
}

function routeProjectedPoints(route, unitsPerPixel, settings = routeZoneSettings(route)) {
  const points = route.displayPoints.map(projectRoutePoint);
  if (!settings.routeOffset) return points;
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: point.x + (-dy / length) * settings.routeOffset * unitsPerPixel,
      y: point.y + (dx / length) * settings.routeOffset * unitsPerPixel
    };
  });
}

function routeProjectedPathLatLngs(route, unitsPerPixel, settings = routeZoneSettings(route)) {
  return routeProjectedPoints(route, unitsPerPixel, settings).map(unprojectOverviewPoint);
}

function distanceToProjectedSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

function distanceToProjectedRoute(point, route, unitsPerPixel, settings = routeZoneSettings(route)) {
  const points = routeProjectedPoints(route, unitsPerPixel, settings);
  if (points.length < 2) return Infinity;
  return points.slice(1).reduce((minimum, end, index) => {
    return Math.min(minimum, distanceToProjectedSegment(point, points[index], end));
  }, Infinity);
}

function canRouteTakeHover(nextIndex) {
  const activeIndex = state.overviewHover.lockedIndex;
  if (activeIndex === null || activeIndex === nextIndex) return true;
  if (Math.abs(nextIndex - activeIndex) === 1) return true;
  return false;
}

function projectedRectForPoints(points, padding = 0) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return {
    minX: Math.min(...xs) - padding,
    maxX: Math.max(...xs) + padding,
    minY: Math.min(...ys) - padding,
    maxY: Math.max(...ys) + padding,
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centerY: (Math.min(...ys) + Math.max(...ys)) / 2
  };
}

function insetRect(rect, inset) {
  return {
    minX: rect.minX + inset,
    maxX: rect.maxX - inset,
    minY: rect.minY + inset,
    maxY: rect.maxY - inset
  };
}

function combineRects(rects) {
  if (!rects.length) return null;
  return rects.reduce((combined, rect) => ({
    minX: Math.min(combined.minX, rect.minX),
    maxX: Math.max(combined.maxX, rect.maxX),
    minY: Math.min(combined.minY, rect.minY),
    maxY: Math.max(combined.maxY, rect.maxY)
  }), { ...rects[0] });
}

function projectedBoundsForRoutes() {
  const points = state.routes.flatMap(route => route.displayPoints.map(projectRoutePoint));
  return combineRects(points.map(point => ({
    minX: point.x,
    maxX: point.x,
    minY: point.y,
    maxY: point.y
  })));
}

function projectedUnitsAtZoom(zoom) {
  return 1 / (2 ** zoom);
}

function projectedUnitsForCurrentZoom() {
  return projectedUnitsAtZoom(map.getZoom());
}

function initialOverviewUnits() {
  const bounds = projectedBoundsForRoutes();
  if (!bounds) return projectedUnitsForCurrentZoom();
  const width = Math.max(bounds.maxX - bounds.minX, 0.000001);
  const height = Math.max(bounds.maxY - bounds.minY, 0.000001);
  const size = map.getSize();
  const contentWidth = Math.max(size.x - OVERVIEW_FIT_PADDING[0] * 2, 320);
  const contentHeight = Math.max(size.y - OVERVIEW_FIT_PADDING[1] * 2, 240);
  return Math.max(width / contentWidth, height / contentHeight);
}

function routeInnerProjectedRect(route, unitsPerPixel) {
  const settings = routeZoneSettings(route);
  const points = route.displayPoints.map(projectRoutePoint);
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const paddingX = settings.size * settings.horizontalSize * unitsPerPixel;
  const paddingY = settings.size * settings.verticalSize * unitsPerPixel;
  let minX = Math.min(...xs) - paddingX;
  let maxX = Math.max(...xs) + paddingX;
  let minY = Math.min(...ys) - paddingY;
  let maxY = Math.max(...ys) + paddingY;
  const minWidth = Math.max(72, settings.size * 2.4) * settings.horizontalSize * unitsPerPixel;
  const minHeight = Math.max(52, settings.size * 1.8) * settings.verticalSize * unitsPerPixel;
  const centerY = (minY + maxY) / 2;

  if (maxY - minY < minHeight) {
    minY = centerY - minHeight / 2;
    maxY = centerY + minHeight / 2;
  }

  const centerX = (minX + maxX) / 2;
  if (maxX - minX < minWidth) {
    minX = centerX - minWidth / 2;
    maxX = centerX + minWidth / 2;
  }
  const offsetX = settings.horizontalOffset * unitsPerPixel;
  const offsetY = settings.verticalOffset * unitsPerPixel;
  minX += offsetX;
  maxX += offsetX;
  minY += offsetY;
  maxY += offsetY;
  return {
    minX,
    maxX,
    minY,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function routeProjectedZone(route, unitsPerPixel) {
  const settings = routeZoneSettings(route);
  if (settings.displayType === "route") {
    const routePoints = routeProjectedPoints(route, unitsPerPixel, settings);
    const padding = settings.routeSize * unitsPerPixel;
    const outer = projectedRectForPoints(routePoints, padding);
    return { inner: outer, outer, routePoints };
  }
  const inner = routeInnerProjectedRect(route, unitsPerPixel);
  const outer = {
    minX: inner.minX,
    maxX: inner.maxX,
    minY: inner.minY,
    maxY: inner.maxY,
    centerX: inner.centerX,
    centerY: inner.centerY
  };

  return { inner, outer };
}

function routeZoomProjectedRect(route, unitsPerPixel) {
  const points = route.displayPoints.map(projectRoutePoint);
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const routeWidth = Math.max(Math.max(...xs) - Math.min(...xs), unitsPerPixel);
  const routeHeight = Math.max(Math.max(...ys) - Math.min(...ys), unitsPerPixel);
  const paddingX = Math.max(routeWidth * 0.06, 12 * unitsPerPixel);
  const paddingY = Math.max(routeHeight * 0.1, 12 * unitsPerPixel);
  const padded = {
    minX: Math.min(...xs) - paddingX,
    maxX: Math.max(...xs) + paddingX,
    minY: Math.min(...ys) - paddingY,
    maxY: Math.max(...ys) + paddingY
  };
  padded.centerX = (padded.minX + padded.maxX) / 2;
  padded.centerY = (padded.minY + padded.maxY) / 2;
  const width = Math.max(padded.maxX - padded.minX, unitsPerPixel);
  const height = Math.max(padded.maxY - padded.minY, unitsPerPixel);
  const size = map.getSize();
  const viewportRatio = Math.max(size.x, 1) / Math.max(size.y, 1);
  let zoomWidth = width;
  let zoomHeight = zoomWidth / viewportRatio;

  if (zoomHeight < height) {
    zoomHeight = height;
    zoomWidth = zoomHeight * viewportRatio;
  }

  return {
    minX: padded.centerX - zoomWidth / 2,
    maxX: padded.centerX + zoomWidth / 2,
    minY: padded.centerY - zoomHeight / 2,
    maxY: padded.centerY + zoomHeight / 2,
    centerX: padded.centerX,
    centerY: padded.centerY
  };
}

function overviewZoneRects(unitsPerPixel = projectedUnitsForCurrentZoom()) {
  const zones = state.routes.map((route, index) => ({
    route,
    index,
    ...routeProjectedZone(route, unitsPerPixel),
    zoom: routeZoomProjectedRect(route, unitsPerPixel)
  }));
  return zones;
}

function overviewFitBoundsFromRects(zoneRects) {
  const routeBounds = projectedBoundsForRoutes();
  const zoneBounds = combineRects(zoneRects.map(zone => zone.outer));
  const combined = combineRects([routeBounds, zoneBounds].filter(Boolean));
  return combined ? rectToBounds(combined) : null;
}

function overviewUnitsForFit() {
  let units = initialOverviewUnits();
  for (let index = 0; index < 4; index += 1) {
    const bounds = overviewFitBoundsFromRects(overviewZoneRects(units));
    if (!bounds?.isValid()) break;
    units = projectedUnitsAtZoom(map.getBoundsZoom(bounds, false, OVERVIEW_FIT_PADDING));
  }
  return units;
}

function rectsOverlap(a, b, margin = 0) {
  return !(a.maxX + margin < b.minX || a.minX - margin > b.maxX || a.maxY + margin < b.minY || a.minY - margin > b.maxY);
}

function cityLabelRects(unitsPerPixel) {
  return renderedCityLabels.map(city => {
    const point = map.project([city.lat, city.lon], 0);
    return {
      minX: point.x - 58 * unitsPerPixel,
      maxX: point.x + 58 * unitsPerPixel,
      minY: point.y - 12 * unitsPerPixel,
      maxY: point.y + 12 * unitsPerPixel
    };
  });
}

function bestLabelPoint(rect, route, unitsPerPixel, placedRects = []) {
  const halfWidth = 62 * unitsPerPixel;
  const halfHeight = 30 * unitsPerPixel;
  const routePoints = route.displayPoints.map(projectRoutePoint);
  const xs = routePoints.map(point => point.x);
  const ys = routePoints.map(point => point.y);
  const routeRect = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
  routeRect.centerX = (routeRect.minX + routeRect.maxX) / 2;
  routeRect.centerY = (routeRect.minY + routeRect.maxY) / 2;
  const gap = 22 * unitsPerPixel;
  const routeWidth = routeRect.maxX - routeRect.minX;
  const routeHeight = routeRect.maxY - routeRect.minY;
  const horizontalRoute = routeWidth >= routeHeight;
  const candidates = [
    { x: routeRect.centerX, y: routeRect.minY - halfHeight - gap, preferred: horizontalRoute ? 1 : 0 },
    { x: routeRect.centerX, y: routeRect.maxY + halfHeight + gap, preferred: horizontalRoute ? 1 : 0 },
    { x: routeRect.minX - halfWidth - gap, y: routeRect.centerY, preferred: horizontalRoute ? 0 : 1 },
    { x: routeRect.maxX + halfWidth + gap, y: routeRect.centerY, preferred: horizontalRoute ? 0 : 1 },
    { x: routeRect.minX - halfWidth - gap, y: routeRect.minY - halfHeight - gap, preferred: 0 },
    { x: routeRect.maxX + halfWidth + gap, y: routeRect.minY - halfHeight - gap, preferred: 0 },
    { x: routeRect.maxX + halfWidth + gap, y: routeRect.maxY + halfHeight + gap, preferred: 0 },
    { x: routeRect.minX - halfWidth - gap, y: routeRect.maxY + halfHeight + gap, preferred: 0 },
    { x: rect.centerX, y: rect.minY - halfHeight - gap, preferred: 0 },
    { x: rect.centerX, y: rect.maxY + halfHeight + gap, preferred: 0 }
  ];
  const sampled = routePoints.filter((_, index) => index % 24 === 0);
  const avoidRects = [...cityLabelRects(unitsPerPixel), ...placedRects];
  let best = candidates[0];
  let bestDistance = -Infinity;

  candidates.forEach(candidate => {
    const nearest = sampled.reduce((minimum, point) => {
      const distance = (point.x - candidate.x) ** 2 + (point.y - candidate.y) ** 2;
      return Math.min(minimum, distance);
    }, Infinity);
    const labelRect = {
      minX: candidate.x - halfWidth,
      maxX: candidate.x + halfWidth,
      minY: candidate.y - halfHeight,
      maxY: candidate.y + halfHeight
    };
    const routeOverlapPenalty = rectsOverlap(labelRect, routeRect, 8 * unitsPerPixel) ? 10000000 : 0;
    const collisionPenalty = avoidRects.some(avoidRect => rectsOverlap(labelRect, avoidRect, 12 * unitsPerPixel)) ? 1000000 : 0;
    const zoneDistancePenalty = (
      Math.max(0, rect.minX - candidate.x, candidate.x - rect.maxX) ** 2
      + Math.max(0, rect.minY - candidate.y, candidate.y - rect.maxY) ** 2
    ) * 0.16;
    const score = nearest + candidate.preferred * 5000 * unitsPerPixel * unitsPerPixel - collisionPenalty - routeOverlapPenalty - zoneDistancePenalty;
    if (score > bestDistance) {
      bestDistance = score;
      best = candidate;
    }
  });

  return {
    latLng: unprojectOverviewPoint(best),
    rect: {
      minX: best.x - halfWidth,
      maxX: best.x + halfWidth,
      minY: best.y - halfHeight,
      maxY: best.y + halfHeight
    }
  };
}

function routeZoneLabelText(route, index) {
  const style = normalizeJourneyStyle(activeTrip()?.journeyStyle, state.activeTripIndex);
  const content = style.routeLabelContent || "all";
  const routeName = route.label || `Day ${index + 1}`;
  const start = routePlaceName(route.startQuery || route.startAddress || route.summary?.split(" to ")[0]) || "Start";
  const end = routePlaceName(route.endQuery || route.endAddress || route.summary?.split(" to ").slice(1).join(" to ")) || "End";
  const endpointText = content === "start" ? start : content === "end" ? end : `${start} → ${end}`;
  return {
    name: content === "endpoints" || content === "start" || content === "end" ? "" : routeName,
    endpoints: content === "route" ? "" : endpointText
  };
}

function addRouteZoneLabel(route, index, innerRect, unitsPerPixel, placedRects) {
  const placement = bestLabelPoint(innerRect, route, unitsPerPixel, placedRects);
  placedRects.push(placement.rect);
  const text = routeZoneLabelText(route, index);
  const label = L.marker(placement.latLng, {
    pane: "labelPane",
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: "route-zone-label-icon",
      html: `<span class="route-zone-label" style="--zone-color: ${route.color};">${text.name ? `<strong>${escapeHtml(text.name)}</strong>` : ""}${text.endpoints ? `<span>${escapeHtml(text.endpoints)}</span>` : ""}</span>`,
      iconSize: [124, 60],
      iconAnchor: [62, 30]
    })
  });
  routeHoverZoneGroup.addLayer(label);
}

function overviewZoneStyle(active = false, route = null) {
  const land = normalizeHex(styleColor("land")) || "#ebe3d4";
  const fillColor = normalizeHex(styleColor("dayZoneFill")) || "#25313d";
  const strokeColor = normalizeHex(styleColor("dayZoneStroke")) || "#25313d";
  const activeColor = normalizeHex(route?.color) || strokeColor;
  const darkBackground = relativeLuminance(land) < 0.42;
  const halo = bestContrastColor(strokeColor, darkBackground ? ["#05111d", "#000000", "#26313d"] : ["#ffffff", "#fff8e8", "#f6e7be"]);
  const baseWeight = styleSize("dayZoneStroke");
  const baseOpacity = clamp(Number(layerStyles.dayZoneStroke.opacity), 0, 1);
  const baseFillOpacity = styleOpacity("dayZoneFill");
  const dashLength = Math.max(0, layerStyles.dayZoneStroke.dashLength);
  const dashGap = Math.max(0, layerStyles.dayZoneStroke.dashGap);
  return {
    fillColor: active ? activeColor : fillColor,
    strokeColor: active ? activeColor : strokeColor,
    halo,
    strokeOpacity: active ? Math.min(1, baseOpacity * 1.35) : baseOpacity,
    haloOpacity: clamp((active ? 0.62 : 0.42) * (baseOpacity / 0.68), 0, 1),
    fillOpacity: active ? Math.max(0.18, Math.min(1, baseFillOpacity * 2.2)) : baseFillOpacity,
    guideOpacity: active ? 0.55 : 0.32,
    weight: active ? baseWeight * 1.25 : baseWeight,
    haloWeight: active ? baseWeight + 3 : baseWeight + 2,
    dashArray: dashLength > 0 ? `${dashLength} ${dashGap}` : null,
    fillBlend: isTextureBlendMode(layerStyles.dayZoneFill.blend) ? layerStyles.dayZoneFill.blend : "normal",
    strokeBlend: isTextureBlendMode(layerStyles.dayZoneStroke.blend) ? layerStyles.dayZoneStroke.blend : "normal"
  };
}

function addRouteHoverZone(route, index, outerRect, innerRect, zoomRect, unitsPerPixel, placedLabelRects) {
  const overlapRect = outerRect;
  const settings = routeZoneSettings(route);
  const deadZoneInset = Number(els.overviewDeadZone.value || 30) * unitsPerPixel;
  const maxDeadZoneInset = Math.max(0, Math.min(
    (overlapRect.maxX - overlapRect.minX) / 2 - unitsPerPixel,
    (overlapRect.maxY - overlapRect.minY) / 2 - unitsPerPixel
  ));
  const hoverRect = deadZoneInset > 0 ? insetRect(overlapRect, Math.min(deadZoneInset, maxDeadZoneInset)) : overlapRect;
  const routeMode = settings.displayType === "route";
  const activeHoverIndex = state.overviewHover.activeIndex;
  const adjacentToActiveHover = activeHoverIndex !== null && Math.abs(index - activeHoverIndex) === 1;
  const panelHovered = document.querySelector(".panel")?.matches(":hover");
  if (!routeMode && activeHoverIndex !== null && index !== activeHoverIndex && !adjacentToActiveHover && !panelHovered) {
    return;
  }
  const routeLatLngs = routeProjectedPathLatLngs(route, unitsPerPixel, settings);
  const zoneShape = settings.shape;
  const zoneLatLngs = rectToZoneLatLngs(overlapRect, zoneShape);
  const hoverLatLngs = rectToZoneLatLngs(hoverRect, zoneShape);
  const isActive = state.overviewMode && (index === state.overviewHover.activeIndex || index === state.overviewZoneModifyIndex);
  let zoneStyle = overviewZoneStyle(isActive, route);
  if (!routeMode && activeHoverIndex !== null && (adjacentToActiveHover || panelHovered) && !isActive) {
    zoneStyle = {
      ...zoneStyle,
      fillOpacity: zoneStyle.fillOpacity * 0.42,
      strokeOpacity: zoneStyle.strokeOpacity * 0.55,
      haloOpacity: zoneStyle.haloOpacity * 0.45
    };
  }
  const zoneHalo = routeMode ? L.polyline(routeLatLngs, {
    pane: "zoneHaloPane",
    renderer: zoneHaloRenderer,
    color: zoneStyle.halo,
    weight: settings.routeSize + zoneStyle.haloWeight,
    opacity: zoneStyle.haloOpacity,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
    bubblingMouseEvents: false
  }) : L.polygon(zoneLatLngs, {
    pane: "zoneHaloPane",
    renderer: zoneHaloRenderer,
    color: zoneStyle.halo,
    weight: zoneStyle.haloWeight,
    opacity: zoneStyle.haloOpacity,
    dashArray: zoneStyle.dashArray,
    fill: false,
    interactive: false,
    bubblingMouseEvents: false
  });
  const zoneFill = routeMode ? L.polyline(routeLatLngs, {
    pane: "zoneFillPane",
    renderer: zoneFillRenderer,
    color: zoneStyle.fillColor,
    weight: settings.routeSize,
    opacity: zoneStyle.fillOpacity,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
    bubblingMouseEvents: false
  }) : L.polygon(zoneLatLngs, {
    pane: "zoneFillPane",
    renderer: zoneFillRenderer,
    stroke: false,
    fill: true,
    fillColor: zoneStyle.fillColor,
    fillOpacity: zoneStyle.fillOpacity,
    interactive: false,
    bubblingMouseEvents: false
  });
  const zoneStroke = routeMode ? L.polyline(routeLatLngs, {
    pane: "zoneStrokePane",
    renderer: zoneStrokeRenderer,
    color: zoneStyle.strokeColor,
    weight: Math.max(1, zoneStyle.weight),
    opacity: zoneStyle.strokeOpacity,
    dashArray: zoneStyle.dashArray,
    lineCap: "round",
    lineJoin: "round",
    interactive: false,
    bubblingMouseEvents: false
  }) : L.polygon(zoneLatLngs, {
    pane: "zoneStrokePane",
    renderer: zoneStrokeRenderer,
    color: zoneStyle.strokeColor,
    weight: zoneStyle.weight,
    opacity: zoneStyle.strokeOpacity,
    dashArray: zoneStyle.dashArray,
    fill: false,
    interactive: false,
    bubblingMouseEvents: false
  });
  const hoverZone = routeMode ? L.polyline(routeLatLngs, {
    pane: "routePane",
    color: zoneStyle.strokeColor,
    weight: Math.max(settings.routeSize + Math.max(16, deadZoneInset / unitsPerPixel), settings.routeSize + 12),
    opacity: 0,
    interactive: true,
    bubblingMouseEvents: false,
    lineCap: "round",
    lineJoin: "round"
  }) : L.polygon(hoverLatLngs, {
    pane: "routePane",
    color: zoneStyle.strokeColor,
    weight: 1,
    opacity: 0,
    fill: true,
    fillColor: zoneStyle.fillColor,
    fillOpacity: 0.01,
    interactive: true,
    bubblingMouseEvents: false
  });
  const deadZonePreview = showOverviewDeadZonePreview ? (routeMode ? L.polyline(routeLatLngs, {
    pane: "routePane",
    color: "#ffffff",
    weight: Math.max(settings.routeSize + Math.max(16, deadZoneInset / unitsPerPixel), settings.routeSize + 12),
    opacity: 1,
    interactive: false,
    className: "overview-dead-zone-preview",
    lineCap: "round",
    lineJoin: "round"
  }) : L.polygon(hoverLatLngs, {
    pane: "routePane",
    color: "#ffffff",
    weight: 3,
    opacity: 1,
    fill: false,
    interactive: false,
    className: "overview-dead-zone-preview"
  })) : null;
  const applyZoneFillStyle = style => {
    zoneFill.setStyle({ fillColor: style.fillColor, fillOpacity: style.fillOpacity });
    map.getPane("zoneFillPane").style.mixBlendMode = style.fillBlend;
    const path = zoneFill.getElement();
    if (!path) return;
    path.style.mixBlendMode = "normal";
    path.style.fillOpacity = String(style.fillOpacity);
  };
  const brighten = event => {
    if (!scheduleOverviewHover(index, event)) return;
    const activeStyle = overviewZoneStyle(true, route);
    zoneHalo.setStyle({ color: activeStyle.halo, weight: activeStyle.haloWeight, opacity: activeStyle.haloOpacity, dashArray: activeStyle.dashArray });
    applyZoneFillStyle(activeStyle);
    zoneStroke.setStyle({ color: activeStyle.strokeColor, weight: activeStyle.weight, opacity: activeStyle.strokeOpacity, dashArray: activeStyle.dashArray });
    hoverZone.setStyle({ color: activeStyle.strokeColor, fillColor: activeStyle.fillColor });
  };
  const dim = () => {
    if (!isActive) {
      const inactiveStyle = overviewZoneStyle(false, route);
      zoneHalo.setStyle({ color: inactiveStyle.halo, weight: inactiveStyle.haloWeight, opacity: inactiveStyle.haloOpacity, dashArray: inactiveStyle.dashArray });
      applyZoneFillStyle(inactiveStyle);
      zoneStroke.setStyle({ color: inactiveStyle.strokeColor, weight: inactiveStyle.weight, opacity: inactiveStyle.strokeOpacity, dashArray: inactiveStyle.dashArray });
      hoverZone.setStyle({ color: inactiveStyle.strokeColor, fillColor: inactiveStyle.fillColor });
    }
    cancelOverviewHover(index);
  };
  const chooseZone = () => chooseOverviewZoneDay(index);

  hoverZone.on("mouseover", brighten);
  hoverZone.on("mousemove", brighten);
  hoverZone.on("mouseout", dim);
  hoverZone.on("click", chooseZone);
  if (els.toggleDayZoneFill.checked) {
    routeHoverZoneGroup.addLayer(zoneFill);
    applyZoneFillStyle(zoneStyle);
  }
  if (els.toggleDayZoneStroke.checked) {
    routeHoverZoneGroup.addLayer(zoneHalo);
    routeHoverZoneGroup.addLayer(zoneStroke);
    map.getPane("zoneStrokePane").style.mixBlendMode = zoneStyle.strokeBlend;
  }
  routeHoverZoneGroup.addLayer(hoverZone);
  if (deadZonePreview) routeHoverZoneGroup.addLayer(deadZonePreview);
  const labelVisibility = normalizeJourneyStyle(activeTrip()?.journeyStyle, state.activeTripIndex).routeLabelVisibility;
  const shouldShowLabel = labelVisibility === "always"
    || (labelVisibility === "hover" && activeHoverIndex === index)
    || (labelVisibility === "active" && isActive);
  if (shouldShowLabel) addRouteZoneLabel(route, index, innerRect, unitsPerPixel, placedLabelRects);
}

function routeLatLngBounds(route) {
  return L.latLngBounds(route.displayPoints.map(toLatLng));
}

function allRoutesLatLngBounds() {
  const points = state.routes.flatMap(route => route.displayPoints.map(toLatLng));
  return points.length ? L.latLngBounds(points) : null;
}

function captureOverviewHomeView() {
  if (!state.overviewMode || state.contiguousUsMode || state.overviewFocusIndex !== null) return;
  state.overviewHomeView = {
    tripId: activeTrip()?.id || "",
    center: map.getCenter(),
    zoom: map.getZoom()
  };
}

function restoreOverviewHome() {
  if (!state.overviewMode) return;
  state.contiguousUsMode = false;
  const focusedRoute = Number.isInteger(state.overviewFocusIndex)
    ? state.routes[state.overviewFocusIndex]
    : activeRoute();
  const loadingLocationName = endpointJumpLocation(focusedRoute, "end");
  state.overviewFocusIndex = null;
  state.selectionScope = "journey";
  updatePinnedSelectionHighlights?.();
  state.overviewFocusZoom = null;
  state.overviewHover.activeIndex = null;
  state.overviewHover.lockedIndex = null;
  clearOverviewReachedRoute();
  clearOverviewHoverTimer();
  renderRouteDayButtons();
  updateStats();
  renderRoute(false);
  const homeView = state.overviewHomeView?.tripId === activeTrip()?.id
    ? state.overviewHomeView
    : null;
  if (homeView) {
    moveToView(homeView.center, homeView.zoom, {
      loadingLocationName,
      onComplete: () => {
        renderRoute(false);
        applyMapInteractionLocks();
        applyToggleState(getToggleState());
        updateUsViewButton();
      }
    });
  } else {
    renderRoute(true, {
      loadingLocationName,
      onComplete: () => {
        captureOverviewHomeView();
        applyMapInteractionLocks();
        applyToggleState(getToggleState());
        updateUsViewButton();
      }
    });
  }
  applyToggleState(getToggleState());
  updateUsViewButton();
}

function zoomToOverviewZone(index, zoomRect = null) {
  if (typeof sfxPlayEvent === "function") sfxPlayEvent("view.route");
  const route = state.routes[index];
  if (!route || !state.overviewMode) return;
  closeJourneyMedia();

  captureOverviewHomeView();
  clearOverviewHoverTimer();
  stopPlayback();
  state.overviewFocusIndex = index;
  state.selectionScope = "route";
  updatePinnedSelectionHighlights?.();
  state.contiguousUsMode = false;
  state.overviewFocusZoom = null;
  state.overviewHover.activeIndex = null;
  state.overviewHover.lockedIndex = null;
  clearOverviewReachedRoute();
  state.activeRouteIndex = index;
  renderTripManager?.();
  // A focused route ends at the next stop. Keep the stop selector in lockstep
  // with the leg so later Previous/Next actions cannot start from a stale stop.
  selectedStopIndex = clamp(index + 1, 0, Math.max(0, synchronizeTripStops(activeTrip()).length - 1));
  state.points = route.points;
  state.displayPoints = route.displayPoints;
  state.title = route.label || route.title;
  state.playback.progress = 0;
  state.playback.hasStarted = false;
  els.status.textContent = `Using ${route.source}`;
  renderRouteDayButtons();
  updateStats();
  renderRoute(false);
  applyToggleState(getToggleState());

  moveToSelectionCamera({
    scope: "route",
    routeIndex: index,
    loadingLocationName: endpointJumpLocation(route, "start"),
    onComplete: () => {
      state.overviewFocusZoom = map.getZoom();
      renderRoute(false);
      applyMapInteractionLocks();
      openStartOfDayMedia(route);
    }
  });
  updateUsViewButton();
}
