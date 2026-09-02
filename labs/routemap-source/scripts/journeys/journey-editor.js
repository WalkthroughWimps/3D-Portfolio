"use strict";

// Route-tab selection, rendering, stop-date editor, and calendar interactions.

function renderDayRouteEditor(route) {
  const isFirstDay = state.activeRouteIndex === 0;
  const canEditRoute = Boolean(route?.isRestDay || route?.startAddress && route?.endAddress);
  els.editDayRoute.disabled = !route || !canEditRoute;
  els.dayRouteEditor.hidden = !route || !canEditRoute || !dayRouteEditorOpen;
  if (!route || !canEditRoute) return;

  const restDay = Boolean(route.isRestDay);
  els.editDayIndependentStartRow.hidden = isFirstDay;
  els.editDayIndependentStart.checked = isFirstDay || Boolean(route.independentStart);
  els.editDayRestDay.checked = restDay;
  const linkedStart = !isFirstDay && !els.editDayIndependentStart.checked;
  const previousRoute = state.routes[state.activeRouteIndex - 1];
  const previousMovingRoute = lastMovingRouteBefore(state.activeRouteIndex);
  els.editDayStartAddress.value = restDay && els.editDayIndependentStart.checked
    ? ""
    : linkedStart
    ? previousRoute?.endQuery || previousRoute?.endAddress || route.startQuery || route.startAddress
    : route.startQuery || route.startAddress;
  if (linkedStart || restDay) clearRequiredState(els.editDayStartAddress);
  els.editDayStartAddress.disabled = linkedStart || restDay;
  els.editDayStartAddressLabel.textContent = "Starting location";
  els.editDayEndAddress.value = restDay && !els.editDayIndependentStart.checked
    ? previousMovingRoute?.endQuery || previousMovingRoute?.endAddress || route.endQuery || route.endAddress
    : route.endQuery || route.endAddress;
  els.editDayEndAddress.disabled = restDay && !els.editDayIndependentStart.checked && Boolean(previousMovingRoute);
  if (els.editDayEndAddress.disabled) clearRequiredState(els.editDayEndAddress);
}

function renderNewDayStartControl() {
  const previousRoute = activeTrip()?.days.at(-1);
  const hasPreviousDay = Boolean(previousRoute);
  const restDay = Boolean(els.newDayRestDay.checked);
  const previousMovingRoute = lastMovingRouteBefore(activeTrip()?.days.length || 0);
  els.newDayIndependentStartRow.hidden = !hasPreviousDay;
  if (!hasPreviousDay) {
    els.newDayIndependentStart.checked = true;
  } else if (restDay && !previousMovingRoute) {
    els.newDayIndependentStart.checked = true;
  }
  const independentRestDay = restDay && els.newDayIndependentStart.checked;
  const linkedStart = hasPreviousDay && !els.newDayIndependentStart.checked;
  els.routeStartAddress.disabled = linkedStart || restDay;
  els.routeStartAddressLabel.textContent = "Starting location";
  if (restDay) {
    els.routeStartAddress.value = "";
    clearRequiredState(els.routeStartAddress);
    if (!independentRestDay && previousMovingRoute) {
      els.routeEndAddress.value = previousMovingRoute.endQuery || previousMovingRoute.endAddress || "";
      els.routeEndAddress.disabled = true;
      clearRequiredState(els.routeEndAddress);
    } else {
      els.routeEndAddress.disabled = false;
    }
  } else if (linkedStart) {
    els.routeStartAddress.value = previousRoute.endQuery || previousRoute.endAddress || "";
    clearRequiredState(els.routeStartAddress);
    els.routeEndAddress.disabled = false;
  } else {
    els.routeEndAddress.disabled = false;
  }
  window.RVAccessibility?.refreshKeyboardOnlyTabStops();
}

function formatZoneScale(value) {
  return Number(value).toFixed(2);
}

function updateDayZoneModifyControls() {
  const trip = activeTrip();
  const modifyIndex = state.overviewZoneModifyIndex;
  const modifyingByDay = !els.dayZoneModifyPanel.hidden;
  const route = Number.isInteger(modifyIndex)
    ? state.routes[modifyIndex]
    : modifyingByDay ? null : activeRoute();
  const tripSettings = tripZoneSettings(trip);
  els.zoneDisplayType.value = tripSettings.displayType;
  els.overviewZoneSize.value = String(tripSettings.size);
  els.overviewZoneSizeValue.textContent = String(Math.round(tripSettings.size));
  els.routeZoneSize.value = String(tripSettings.routeSize);
  els.routeZoneOffset.value = String(tripSettings.routeOffset);
  els.routeZoneSizeValue.textContent = String(Math.round(tripSettings.routeSize));
  els.routeZoneOffsetValue.textContent = String(Math.round(tripSettings.routeOffset));
  els.routeZoneModeControls.hidden = tripSettings.displayType !== "route";

  const hasRoute = Boolean(route);
  [els.dayZoneShape, els.dayZoneVerticalSize, els.dayZoneHorizontalSize, els.dayZoneVerticalOffset, els.dayZoneHorizontalOffset]
    .forEach(input => { input.disabled = !hasRoute; });
  if (!hasRoute) return;

  const settings = routeZoneSettings(route, trip);
  els.dayZoneShape.value = settings.shape;
  els.dayZoneVerticalSize.value = String(settings.verticalSize);
  els.dayZoneHorizontalSize.value = String(settings.horizontalSize);
  els.dayZoneVerticalOffset.value = String(settings.verticalOffset);
  els.dayZoneHorizontalOffset.value = String(settings.horizontalOffset);
  els.dayZoneVerticalSizeValue.textContent = formatZoneScale(settings.verticalSize);
  els.dayZoneHorizontalSizeValue.textContent = formatZoneScale(settings.horizontalSize);
  els.dayZoneVerticalOffsetValue.textContent = String(Math.round(settings.verticalOffset));
  els.dayZoneHorizontalOffsetValue.textContent = String(Math.round(settings.horizontalOffset));
}

function renderTripDayList() {
  const trip = activeTrip();
  els.tripDayList.replaceChildren();
  els.tripRouteDropdown?.replaceChildren();
  (trip?.days || []).forEach((day, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trip-day-button";
    button.setAttribute("aria-pressed", String(index === state.activeRouteIndex));
    const dayName = day.label || `Route ${index + 1}`;
    const routeName = `${routeEndpointName(day, "start")} → ${routeEndpointName(day, "end")}`;
    button.innerHTML = `<strong>${escapeHtml(routeName)}</strong><span>${escapeHtml(dayName)}</span>`;
    button.title = `${routeName} — ${dayName}`;
    button.addEventListener("click", () => {
      dayRouteEditorOpen = false;
      selectedStopIndex = Math.min(index + 1, synchronizeTripStops(trip).length - 1);
      if (els.tripMediaTarget) els.tripMediaTarget.value = "route";
      setActiveRoute(index);
    });
    els.tripDayList.append(button);
    els.tripRouteDropdown?.append(new Option(`${routeName} — ${dayName}`, String(index), false, index === state.activeRouteIndex));
  });
  if (els.tripRouteDropdown) els.tripRouteDropdown.disabled = !(trip?.days || []).length;
  renderRouteWaypointManager();
}

function waypointDisplayLocation(waypoint, index) {
  const label = String(waypoint?.label || "").trim();
  if (label && !/^Waypoint\s+\d+$/i.test(label)) return label;
  const lat = Number(waypoint?.lat);
  const lon = Number(waypoint?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon)
    ? `${lat.toFixed(5)}, ${lon.toFixed(5)}`
    : `${terminologyValue("waypoint")} ${index + 1}`;
}

function moveRouteWaypoint(route, fromIndex, toIndex) {
  const waypoints = normalizeRouteWaypoints(route?.waypoints);
  if (!route || fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= waypoints.length || toIndex >= waypoints.length) return;
  const [moved] = waypoints.splice(fromIndex, 1);
  waypoints.splice(toIndex, 0, moved);
  route.waypoints = waypoints;
  rebuildRouteAfterWaypointEdit(route, "Reordering waypoints and rebuilding route...");
}

function renderRouteWaypointManager() {
  if (!els.routeWaypointManager || !els.routeWaypointList) return;
  const route = activeRoute();
  const waypoints = normalizeRouteWaypoints(route?.waypoints);
  els.routeWaypointManager.hidden = !waypoints.length;
  els.routeWaypointList.replaceChildren();
  waypoints.forEach((waypoint, index) => {
    const row = document.createElement("div");
    row.className = "route-waypoint-row";
    row.draggable = true;
    row.dataset.waypointIndex = String(index);
    const handle = document.createElement("span");
    handle.className = "route-waypoint-handle";
    handle.textContent = "⠿";
    handle.title = "Drag to reorder waypoint";
    const input = document.createElement("input");
    input.type = "text";
    input.value = waypointDisplayLocation(waypoint, index);
    input.setAttribute("aria-label", `Rename waypoint ${index + 1}`);
    input.addEventListener("change", () => {
      waypoint.label = input.value.trim() || waypointDisplayLocation(waypoint, index);
      route.waypoints = waypoints;
      saveTrips();
      markProjectDirty("journeys");
      renderRouteWaypoints();
    });
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.title = "Move waypoint earlier";
    up.disabled = index === 0;
    up.addEventListener("click", () => moveRouteWaypoint(route, index, index - 1));
    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.title = "Move waypoint later";
    down.disabled = index === waypoints.length - 1;
    down.addEventListener("click", () => moveRouteWaypoint(route, index, index + 1));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger-action";
    remove.textContent = "×";
    remove.title = "Delete waypoint";
    remove.addEventListener("click", () => removeRouteWaypoint(route, waypoint.id));
    row.addEventListener("dragstart", event => event.dataTransfer?.setData("text/plain", String(index)));
    row.addEventListener("dragover", event => event.preventDefault());
    row.addEventListener("drop", event => {
      event.preventDefault();
      moveRouteWaypoint(route, Number(event.dataTransfer?.getData("text/plain")), index);
    });
    row.append(handle, input, up, down, remove);
    els.routeWaypointList.append(row);
  });
}

let selectedStopIndex = 0;
let selectedStopDayIso = "";
let stopCalendarView = null;
let stopCalendarRangeStart = "";

function allJourneyStopRows() {
  const rows = [];
  state.trips.forEach((trip, tripIndex) => {
    synchronizeTripStops(trip).forEach((stop, localStopIndex) => {
      const previous = rows.at(-1);
      if (localStopIndex === 0 && previous?.stop.id === stop.id) return;
      rows.push({ trip, tripIndex, stop, localStopIndex });
    });
  });
  return rows;
}

function moveJourneyBoundary(boundaryIndex, routeCut) {
  if (!Number.isInteger(boundaryIndex) || boundaryIndex < 0 || boundaryIndex >= state.trips.length - 1) return;
  const routeCounts = state.trips.map(trip => trip.days.length);
  const cuts = routeCounts.slice(0, -1).map((_, index) => routeCounts.slice(0, index + 1).reduce((sum, count) => sum + count, 0));
  const previousCut = boundaryIndex > 0 ? cuts[boundaryIndex - 1] : 0;
  const totalRoutes = routeCounts.reduce((sum, count) => sum + count, 0);
  const nextCut = boundaryIndex < cuts.length - 1 ? cuts[boundaryIndex + 1] : totalRoutes;
  const nextBoundary = clamp(Number(routeCut), previousCut + 1, nextCut - 1);
  if (nextBoundary === cuts[boundaryIndex]) return;

  const stopById = new Map(state.trips.flatMap(trip => synchronizeTripStops(trip)).map(stop => [stop.id, stop]));
  const routes = state.trips.flatMap(trip => trip.days);
  cuts[boundaryIndex] = nextBoundary;
  let start = 0;
  state.trips.forEach((trip, tripIndex) => {
    const end = tripIndex < cuts.length ? cuts[tripIndex] : routes.length;
    trip.days = routes.slice(start, end);
    const stopRecords = trip.days.length
      ? [stopById.get(trip.days[0].startStopId), ...trip.days.map(route => stopById.get(route.endStopId))].filter(Boolean)
      : [];
    synchronizeTripStops(trip, stopRecords);
    start = end;
  });
  state.routes = activeTrip()?.days || [];
  state.activeRouteIndex = clamp(state.activeRouteIndex, 0, Math.max(0, state.routes.length - 1));
  selectedStopIndex = clamp(selectedStopIndex, 0, Math.max(0, synchronizeTripStops(activeTrip()).length - 1));
  saveTrips();
  renderTripManager();
  renderRouteDayButtons();
  renderRoute(false);
  renderCityLabels();
  applyToggleState(getToggleState());
  updateUsViewButton();
}

function uniqueJourneyContinuationName(sourceName) {
  const base = `${String(sourceName || "Journey").trim()} continuation`;
  const names = new Set(state.trips.map(trip => String(trip.name || "").toLocaleLowerCase()));
  if (!names.has(base.toLocaleLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

function copyJourneyPresentation(source, target) {
  target.dayNamePattern = source.dayNamePattern || DEFAULT_DAY_NAME_PATTERN;
  target.tripStartDate = source.tripStartDate || "";
  target.zoneSettings = normalizeZoneSettings(source.zoneSettings, DEFAULT_ZONE_SETTINGS);
  target.markerSettings = cloneMarkerSettings(source.markerSettings || DEFAULT_MARKER_SETTINGS);
  target.landmarkSettings = cloneLandmarkSettings(source.landmarkSettings || landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS);
  target.displayPositions = normalizeDisplayPositions(source.displayPositions);
  target.journeyStyle = normalizeJourneyStyle(source.journeyStyle, state.trips.indexOf(source));
  target.stickerDefaults = normalizeStickerDefaults(source.stickerDefaults);
  target.timelineDefaults = normalizeTimelineDefaults(source.timelineDefaults);
}

function addJourneyBoundaryAtRouteCut(routeCut) {
  const counts = state.trips.map(trip => trip.days.length);
  const totalRoutes = counts.reduce((sum, count) => sum + count, 0);
  const cut = Number(routeCut);
  if (!Number.isInteger(cut) || cut <= 0 || cut >= totalRoutes) {
    setTripStatus("A journey break must leave at least one route on each side.", true);
    return false;
  }
  const existingCuts = counts.slice(0, -1).map((_, index) => counts.slice(0, index + 1).reduce((sum, count) => sum + count, 0));
  if (existingCuts.includes(cut)) {
    setTripStatus("A journey already begins at that stop.");
    return false;
  }

  let sourceIndex = -1;
  let routesBeforeSource = 0;
  for (let index = 0, running = 0; index < counts.length; index += 1) {
    const next = running + counts[index];
    if (cut > running && cut < next) {
      sourceIndex = index;
      routesBeforeSource = running;
      break;
    }
    running = next;
  }
  const source = state.trips[sourceIndex];
  if (!source) return false;

  const activeJourney = activeTrip();
  const savedStops = synchronizeTripStops(source).map(stop => normalizeTripStop(stop));
  const localCut = cut - routesBeforeSource;
  const followingRoutes = source.days.slice(localCut);
  source.days = source.days.slice(0, localCut);
  synchronizeTripStops(source, savedStops);

  const emptyFollowingJourney = state.trips[sourceIndex + 1]?.days?.length === 0
    ? state.trips[sourceIndex + 1]
    : null;
  const followingJourney = emptyFollowingJourney || makeTrip(uniqueJourneyContinuationName(source.name));
  if (!emptyFollowingJourney) {
    copyJourneyPresentation(source, followingJourney);
    state.trips.splice(sourceIndex + 1, 0, followingJourney);
  }
  followingJourney.days = followingRoutes;
  synchronizeTripStops(followingJourney, savedStops);

  state.activeTripIndex = Math.max(0, state.trips.indexOf(activeJourney));
  state.routes = activeTrip()?.days || [];
  state.activeRouteIndex = clamp(state.activeRouteIndex, 0, Math.max(0, state.routes.length - 1));
  selectedStopIndex = clamp(selectedStopIndex, 0, Math.max(0, synchronizeTripStops(activeTrip()).length - 1));
  saveTrips();
  renderTripManager();
  renderRouteDayButtons();
  renderRoute(false);
  renderCityLabels();
  applyToggleState(getToggleState());
  updateUsViewButton();
  setTripStatus(`Started ${followingJourney.name} at ${synchronizeTripStops(followingJourney)[0]?.name || "the selected stop"}.`);
  return true;
}

function appendJourneyBreakRow(tripIndex, routeCut) {
  const trip = state.trips[tripIndex];
  if (!trip) return;
  const row = document.createElement("div");
  row.className = "journey-break-row";
  const boundaryIndex = tripIndex - 1;
  row.draggable = tripIndex > 0;
  row.classList.toggle("is-fixed", tripIndex === 0);
  if (tripIndex > 0) row.dataset.boundaryIndex = String(boundaryIndex);
  row.dataset.routeCut = String(routeCut);
  row.title = tripIndex > 0
    ? `Drag to change where ${trip.name} begins.`
    : `${trip.name} begins here.`;
  row.innerHTML = `<span></span><strong>${escapeHtml(trip.name)}</strong><span></span>`;
  row.addEventListener("dragstart", event => {
    if (tripIndex === 0) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-rv-journey-boundary", String(boundaryIndex));
    els.tripStopList.classList.add("is-moving-journey-break");
  });
  row.addEventListener("dragend", () => els.tripStopList.classList.remove("is-moving-journey-break"));
  els.tripStopList.append(row);
}

function activeJourneyStop() {
  const trip = activeTrip();
  const stops = synchronizeTripStops(trip);
  selectedStopIndex = clamp(selectedStopIndex, 0, Math.max(0, stops.length - 1));
  return stops[selectedStopIndex] || null;
}

function stopDayIsoValues(stop) {
  const arrival = isoDateValue(stop?.arrivalDate || stop?.departureDate);
  const departure = isoDateValue(stop?.departureDate || arrival);
  if (!arrival) return [];
  const [start, end] = arrival <= departure ? [arrival, departure] : [departure, arrival];
  const dates = [];
  const cursor = new Date(`${start}T12:00:00`);
  while (dateToIso(cursor) <= end && dates.length < 366) {
    dates.push(dateToIso(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// Stop stickers created before day-specific content existed had no day stamp,
// making one record appear on every day of a multi-day stop. Preserve those
// stickers by assigning them to that stop's first day the next time it is
// opened; newly created stop stickers are stamped at creation time.
function assignLegacyStopStickersToFirstDay(trip = activeTrip()) {
  if (!trip?.stickers) return false;
  const stops = synchronizeTripStops(trip);
  let changed = false;
  trip.stickers.forEach(sticker => {
    if (sticker.scope !== "stop" || sticker.dayIso || !sticker.stopId) return;
    const firstDay = stopDayIsoValues(stops.find(stop => stop.id === sticker.stopId))[0] || "";
    if (!firstDay) return;
    sticker.dayIso = firstDay;
    changed = true;
  });
  return changed;
}

function selectStopDay(iso, { focus = true } = {}) {
  const stop = activeJourneyStop();
  const dates = stopDayIsoValues(stop);
  state.noDaySelected = false;
  selectedStopDayIso = dates.includes(iso) ? iso : dates[0] || "";
  if (assignLegacyStopStickersToFirstDay()) {
    saveTrips?.();
    markProjectDirty?.("journeys");
  }
  if (els.tripMediaTarget?.value === "stop") els.tripMediaTarget.value = "stop-day";
  if (focus) focusJourneyStop(selectedStopIndex, { animate: false, selectedDay: selectedStopDayIso });
  renderStopDayLists();
  renderTripMedia?.();
  renderMediaMarkers?.();
  refreshEndpointMarkers?.();
  renderStickers?.();
}

function activeStopDayContent() {
  const stop = activeJourneyStop();
  if (!stop || !selectedStopDayIso) return null;
  stop.dayContent ||= {};
  stop.dayContent[selectedStopDayIso] ||= { media: [], stickers: [], timelineEndAction: "default" };
  return stop.dayContent[selectedStopDayIso];
}

function stopDaySequenceNumber(stop, localIndex, stopIndex = selectedStopIndex) {
  const trip = activeTrip();
  if (!trip?.followStopDaySequence) return localIndex + 1;
  const stops = synchronizeTripStops(trip);
  const before = stops.slice(0, stopIndex)
    .reduce((total, candidate) => total + stopDayIsoValues(candidate).length, 0);
  return before + localIndex + 1;
}

function stopDayOptionLabel(stop, iso, index) {
  return `Day ${stopDaySequenceNumber(stop, index)} - ${displayDateValue(iso)}`;
}

function mountStopAnimationsManager() {
  const mount = els.stopAnimationsMount;
  const section = els.tripStopDayList?.closest(".stop-days-manager-section");
  const timeline = document.querySelector(".timeline-section");
  const panel = mount?.closest("[data-panel-tab-panel]");
  if (!mount || !panel || !section) return;
  // These are ordinary panel sections. Keeping them in a private mount made
  // them skip the shared accordion, ordering, and color-cycle behaviors.
  if (section.parentElement === mount) panel.append(section);
  if (timeline?.parentElement === mount) panel.append(timeline);
  enhanceCollapsibleSections?.();
}

function renderStopDayLists() {
  const stop = activeJourneyStop();
  const dates = stopDayIsoValues(stop);
  if (!state.noDaySelected && !dates.includes(selectedStopDayIso)) selectedStopDayIso = dates[0] || "";
  if (els.stopDaySelect) {
    els.stopDaySelect.replaceChildren();
    els.stopDaySelect.append(new Option("None selected — day defaults", "", false, state.noDaySelected));
    dates.forEach((iso, index) => els.stopDaySelect.append(new Option(stopDayOptionLabel(stop, iso, index), iso, false, iso === selectedStopDayIso)));
    if (!dates.length) els.stopDaySelect.append(new Option("Set an arrival date first", "", true, true));
    els.stopDaySelect.disabled = !dates.length;
  }
  if (!els.tripStopDayList) return;
  els.tripStopDayList.replaceChildren();
  if (!dates.length) {
    const empty = document.createElement("p");
    empty.className = "section-note";
    empty.textContent = "Set an arrival date to create this stop's day list.";
    els.tripStopDayList.append(empty);
    return;
  }
  dates.forEach((iso, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trip-day-button trip-stop-day-button";
    button.setAttribute("aria-pressed", String(iso === selectedStopDayIso));
    button.innerHTML = `<strong>Day ${stopDaySequenceNumber(stop, index)}</strong><span>${escapeHtml(displayDateValue(iso))}</span>`;
    button.addEventListener("click", () => selectStopDay(iso));
    els.tripStopDayList.append(button);
  });
}

function renderTripStopListLegacy() {
  const trip = activeTrip();
  const stops = synchronizeTripStops(trip);
  if (!els.tripStopList) return;
  els.tripStopList.replaceChildren();
  els.tripStopDropdown?.replaceChildren();
  stops.forEach((stop, index) => {
    const dates = stop.arrivalDate || stop.departureDate
      ? `${displayDateValue(stop.arrivalDate || stop.departureDate)}${stop.departureDate && stop.departureDate !== stop.arrivalDate ? `–${displayDateValue(stop.departureDate)}` : ""}`
      : "Dates not set";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "trip-day-button trip-stop-button";
    button.setAttribute("aria-pressed", String(index === selectedStopIndex));
    button.innerHTML = `<strong>${escapeHtml(`${index + 1}. ${stop.name}`)}</strong><span>${escapeHtml(dates)}</span>`;
    button.addEventListener("click", () => {
      if (els.tripMediaTarget) els.tripMediaTarget.value = "stop-day";
      focusJourneyStop(index);
      selectedTripMediaId = null;
      renderTripMedia();
    });
    els.tripStopList.append(button);
    els.tripStopDropdown?.append(new Option(`${index + 1}. ${stop.name} — ${dates}`, String(index), false, index === selectedStopIndex));
  });
  if (els.tripStopDropdown) els.tripStopDropdown.disabled = !stops.length;
}

function renderTripStopList() {
  if (!els.tripStopList) return;
  els.tripStopList.replaceChildren();
  els.tripStopDropdown?.replaceChildren();
  const rows = allJourneyStopRows();
  let routeCut = 0;
  let globalStopIndex = 0;
  state.trips.forEach((trip, tripIndex) => {
    appendJourneyBreakRow(tripIndex, routeCut);
    const stops = synchronizeTripStops(trip);
    const group = document.createElement("optgroup");
    group.label = trip.name;
    stops.forEach((stop, localStopIndex) => {
      const duplicatesPreviousBoundary = tripIndex > 0
        && localStopIndex === 0
        && state.trips.slice(0, tripIndex).some(previousTrip => synchronizeTripStops(previousTrip).at(-1)?.id === stop.id);
      if (duplicatesPreviousBoundary) return;
      const dates = stop.arrivalDate || stop.departureDate
        ? `${displayDateValue(stop.arrivalDate || stop.departureDate)}${stop.departureDate && stop.departureDate !== stop.arrivalDate ? ` - ${displayDateValue(stop.departureDate)}` : ""}`
        : "Dates not set";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "trip-day-button trip-stop-button";
      button.setAttribute("aria-pressed", String(tripIndex === state.activeTripIndex && localStopIndex === selectedStopIndex));
      button.dataset.tripIndex = String(tripIndex);
      button.dataset.stopIndex = String(localStopIndex);
      button.dataset.globalStopIndex = String(globalStopIndex);
      button.dataset.routeCut = String(routeCut + localStopIndex);
      button.innerHTML = `<strong>${escapeHtml(`${globalStopIndex + 1}. ${stop.name}`)}</strong><span>${escapeHtml(dates)}</span>`;
      button.addEventListener("click", () => {
        if (els.tripMediaTarget) els.tripMediaTarget.value = "stop-day";
        if (tripIndex !== state.activeTripIndex) selectTrip(tripIndex, { stopIndex: localStopIndex });
        else focusJourneyStop(localStopIndex);
        selectedTripMediaId = null;
        renderTripMedia();
      });
      button.addEventListener("contextmenu", event => {
        event.preventDefault();
        event.stopPropagation();
        addJourneyBoundaryAtRouteCut(Number(button.dataset.routeCut));
      });
      button.dataset.help = "Click to focus this stop. Right-click to start a new journey here.";
      button.addEventListener("dragover", event => {
        if (![...event.dataTransfer.types].includes("application/x-rv-journey-boundary")) return;
        event.preventDefault();
        button.classList.add("is-break-drop-target");
      });
      button.addEventListener("dragleave", () => button.classList.remove("is-break-drop-target"));
      button.addEventListener("drop", event => {
        const boundaryIndex = Number(event.dataTransfer.getData("application/x-rv-journey-boundary"));
        if (!Number.isInteger(boundaryIndex)) return;
        event.preventDefault();
        button.classList.remove("is-break-drop-target");
        moveJourneyBoundary(boundaryIndex, Number(button.dataset.routeCut));
      });
      els.tripStopList.append(button);
      group.append(new Option(`${globalStopIndex + 1}. ${stop.name} - ${dates}`, `${tripIndex}:${localStopIndex}`, false, tripIndex === state.activeTripIndex && localStopIndex === selectedStopIndex));
      globalStopIndex += 1;
    });
    els.tripStopDropdown?.append(group);
    routeCut += trip.days.length;
  });
  if (els.tripStopDropdown) els.tripStopDropdown.disabled = !rows.length;
}

function renderStopDateEditor() {
  if (!els.stopArrivalDate) return;
  const stop = activeJourneyStop();
  const enabled = Boolean(stop);
  [els.stopArrivalDate, els.stopDepartureDate, els.stopCalendarButton, els.editStopStartDate, els.editStopEndDate, els.editStopCalendarButton].forEach(control => {
    if (control) control.disabled = !enabled;
  });
  if (!stop) {
    els.stopArrivalDate.value = "";
    els.stopDepartureDate.value = "";
    if (els.editStopStartDate) els.editStopStartDate.value = "";
    if (els.editStopEndDate) els.editStopEndDate.value = "";
    return;
  }
  if (document.activeElement !== els.stopArrivalDate) els.stopArrivalDate.value = displayDateValue(stop.arrivalDate);
  if (document.activeElement !== els.stopDepartureDate) els.stopDepartureDate.value = displayDateValue(stop.departureDate);
  if (document.activeElement !== els.editStopStartDate) els.editStopStartDate.value = displayDateValue(stop.arrivalDate);
  if (document.activeElement !== els.editStopEndDate) els.editStopEndDate.value = displayDateValue(stop.departureDate);
  els.stopArrivalDate.removeAttribute("aria-invalid");
  els.stopDepartureDate.removeAttribute("aria-invalid");
  els.editStopStartDate?.removeAttribute("aria-invalid");
  els.editStopEndDate?.removeAttribute("aria-invalid");
  els.stopDateMessage?.classList.remove("is-error");
  if (els.stopDateMessage) els.stopDateMessage.textContent = stop.arrivalDate && stop.departureDate
    ? `${stop.name}: ${displayDateValue(stop.arrivalDate)}–${displayDateValue(stop.departureDate)}`
    : "Flexible dates: 7/15/2026, 2026-07-15, or July 15 2026.";
  if (els.editStopDateMessage) els.editStopDateMessage.textContent = els.stopDateMessage?.textContent || "";
  els.editStopDateMessage?.classList.remove("is-error");
  if (!els.stopDateMessage?.classList.contains("is-error")) {
    els.stopDateMessage.textContent = "";
    if (els.editStopDateMessage) els.editStopDateMessage.textContent = "";
  }
  renderStopDayLists();
}

function setStopDateMessage(message, isError = false) {
  [els.stopDateMessage, els.editStopDateMessage].forEach(output => {
    if (!output) return;
    output.textContent = message;
    output.classList.toggle("is-error", isError);
  });
}

function commitStopDateInput(input, field) {
  const stop = activeJourneyStop();
  if (!stop || !input) return false;
  const parsed = parseFlexibleDate(input.value);
  if (parsed === null) {
    input.setAttribute("aria-invalid", "true");
    setStopDateMessage("Enter a recognizable date, such as 7/15/2026 or July 15 2026.", true);
    return false;
  }
  const other = field === "arrivalDate" ? stop.departureDate : stop.arrivalDate;
  if (parsed && other && (field === "arrivalDate" ? parsed > other : parsed < other)) {
    input.setAttribute("aria-invalid", "true");
    setStopDateMessage("The end date must be on or after the start date.", true);
    return false;
  }
  stop[field] = parsed || "";
  // A blank Leave field is a valid one-day stop. Do not manufacture a
  // departure date or show a range when both endpoint dates are the same.
  if (field === "arrivalDate" && !stop.arrivalDate) stop.departureDate = "";
  if (field === "departureDate" && stop.departureDate === stop.arrivalDate) stop.departureDate = "";
  selectedStopDayIso = stop.arrivalDate || stop.departureDate || "";
  input.value = displayDateValue(stop[field]);
  input.removeAttribute("aria-invalid");
  updateLegDatesAroundStop(activeTrip(), selectedStopIndex);
  resequenceTripDayLabels(activeTrip());
  saveTrips();
  renderTripDayList();
  renderRouteDayButtons();
  renderStopDateEditor();
  updateDayNamePatternTooltip();
  renderStopCalendar();
  return true;
}

let stopCalendarSurface = "pinned";
let stopCalendarDragStart = "";
let stopCalendarDragEnd = "";
let stopCalendarDragEndpoint = "arrival";
let stopCalendarDragging = false;
let stopCalendarDragMoved = false;
let stopCalendarSuppressClick = false;

function stopCalendarElements(surface = stopCalendarSurface) {
  return surface === "editor"
    ? {
      button: els.editStopCalendarButton,
      popover: els.editStopCalendarPopover,
      month: els.editStopCalendarMonth,
      grid: els.editStopCalendarGrid,
      hint: els.editStopCalendarHint
    }
    : {
      button: els.stopCalendarButton,
      popover: els.stopCalendarPopover,
      month: els.stopCalendarMonth,
      grid: els.stopCalendarGrid,
      hint: els.stopCalendarHint
    };
}

function applyStopCalendarRange(firstIso, secondIso, { save = true } = {}) {
  const stop = activeJourneyStop();
  const range = normalizeIsoDateRange(firstIso, secondIso);
  if (!stop || !range) return;
  stop.arrivalDate = range.start;
  stop.departureDate = range.start === range.end ? "" : range.end;
  updateLegDatesAroundStop(activeTrip(), selectedStopIndex);
  if (save) {
    resequenceTripDayLabels(activeTrip());
    saveTrips();
    renderTripDayList();
    renderRouteDayButtons();
  }
  renderStopDateEditor();
  updateDayNamePatternTooltip();
}

function persistStopCalendarDates() {
  updateLegDatesAroundStop(activeTrip(), selectedStopIndex);
  selectedStopDayIso = activeJourneyStop()?.arrivalDate || activeJourneyStop()?.departureDate || "";
  resequenceTripDayLabels(activeTrip());
  saveTrips();
  renderTripDayList();
  renderRouteDayButtons();
  renderStopDateEditor();
  updateDayNamePatternTooltip();
}

function nearestStopCalendarMarble(stop, iso) {
  if (!stop?.arrivalDate) return "arrival";
  if (!stop.departureDate) return iso === stop.arrivalDate ? "arrival" : "departure";
  const distance = date => Math.abs(new Date(`${iso}T12:00:00`) - new Date(`${date}T12:00:00`));
  return distance(stop.arrivalDate) <= distance(stop.departureDate) ? "arrival" : "departure";
}

function moveStopCalendarMarble(endpoint, iso, { save = true } = {}) {
  const stop = activeJourneyStop();
  if (!stop || !isoDateValue(iso)) return;
  let arrival = stop.arrivalDate || iso;
  let departure = stop.departureDate || "";
  if (endpoint === "arrival") arrival = iso;
  else departure = iso;
  if (departure && arrival > departure) [arrival, departure] = [departure, arrival];
  stop.arrivalDate = arrival;
  // One marble is represented by a blank Leave field. It keeps identifiers
  // concise and lets the calendar show both handles in the same place.
  stop.departureDate = departure && departure !== arrival ? departure : "";
  if (save) persistStopCalendarDates();
  else {
    renderStopDateEditor();
    updateStopCalendarRangeClasses();
  }
}

function updateStopCalendarRangeClasses(grid = stopCalendarElements().grid) {
  const stop = activeJourneyStop();
  if (!grid || !stop) return;
  grid.querySelectorAll("button[data-date]").forEach(button => {
    const iso = button.dataset.date;
    button.classList.toggle("is-in-range", isoDateInRange(iso, stop.arrivalDate, stop.departureDate));
    button.classList.toggle("is-range-edge", iso === stop.arrivalDate || iso === stop.departureDate);
  });
}

function finishStopCalendarDrag() {
  if (!stopCalendarDragging) return;
  const moved = stopCalendarDragMoved && stopCalendarDragStart && stopCalendarDragEnd;
  stopCalendarDragging = false;
  if (!moved) return;
  persistStopCalendarDates();
  stopCalendarRangeStart = "";
  stopCalendarSuppressClick = true;
  renderStopCalendar();
  requestAnimationFrame(() => { stopCalendarSuppressClick = false; });
}

function renderStopCalendar() {
  const calendar = stopCalendarElements();
  if (!calendar.grid || calendar.popover?.hidden) return;
  const stop = activeJourneyStop();
  if (!stop) return;
  if (!stopCalendarView) {
    const focus = nearestStopDate();
    const [year, month] = focus.split("-").map(Number);
    stopCalendarView = new Date(year, month - 1, 1);
  }
  const year = stopCalendarView.getFullYear();
  const month = stopCalendarView.getMonth();
  calendar.month.textContent = stopCalendarView.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  calendar.grid.replaceChildren();
  calendarMonthDates(stopCalendarView).forEach(({ date, iso, outsideMonth }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(date.getDate());
    button.dataset.date = iso;
    button.classList.toggle("is-outside-month", outsideMonth);
    button.classList.toggle("is-in-range", isoDateInRange(iso, stop.arrivalDate, stop.departureDate));
    button.classList.toggle("is-range-edge", iso === stop.arrivalDate || iso === stop.departureDate);
    button.setAttribute("aria-label", date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
    button.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      stopCalendarDragStart = iso;
      stopCalendarDragEnd = iso;
      stopCalendarDragEndpoint = nearestStopCalendarMarble(stop, iso);
      stopCalendarDragging = true;
      stopCalendarDragMoved = false;
    });
    button.addEventListener("pointerenter", event => {
      if (!stopCalendarDragging || !(event.buttons & 1)) return;
      stopCalendarDragEnd = iso;
      stopCalendarDragMoved = stopCalendarDragMoved || iso !== stopCalendarDragStart;
      if (stopCalendarDragMoved) {
        moveStopCalendarMarble(stopCalendarDragEndpoint, iso, { save: false });
        updateStopCalendarRangeClasses(calendar.grid);
      }
    });
    button.addEventListener("pointerup", finishStopCalendarDrag);
    button.addEventListener("click", () => {
      if (!stopCalendarSuppressClick) selectStopCalendarDate(iso);
    });
    calendar.grid.append(button);
  });
  calendar.hint.textContent = "Click a date to move the closest endpoint, or drag an endpoint marble.";
}

function selectStopCalendarDate(iso) {
  const stop = activeJourneyStop();
  if (!stop) return;
  moveStopCalendarMarble(nearestStopCalendarMarble(stop, iso), iso);
  renderStopCalendar();
}

function renderPinnedDaySelect() {
  if (!els.routeDaySelect) return;
  const trip = activeTrip();
  const stops = synchronizeTripStops(trip);
  selectedStopIndex = clamp(selectedStopIndex, 0, Math.max(0, stops.length - 1));
  const selectedValue = state.noStopSelected ? "defaults" : state.selectionScope === "journey" ? "all" : `stop:${selectedStopIndex}`;
  els.routeDaySelect.replaceChildren();
  els.routeDaySelect.append(new Option("None selected — stop defaults", "defaults", false, selectedValue === "defaults"));
  stops.forEach((stop, index) => {
    const dates = stop.arrivalDate || stop.departureDate
      ? ` — ${displayDateValue(stop.arrivalDate || stop.departureDate)}${stop.departureDate && stop.departureDate !== stop.arrivalDate ? `–${displayDateValue(stop.departureDate)}` : ""}`
      : "";
    els.routeDaySelect.append(new Option(`${index + 1}. ${stop.name}${dates}`, `stop:${index}`, false, selectedValue === `stop:${index}`));
  });
  if (stops.length) {
    els.routeDaySelect.append(new Option("All stops — whole journey", "all", false, selectedValue === "all"));
  }
  els.routeDaySelect.disabled = !stops.length;
  if (els.renameDayButton) els.renameDayButton.disabled = !activeRoute();
  renderStopDateEditor();
}

function renderPinnedRouteSelect() {
  if (!els.pinnedRouteSelect) return;
  els.pinnedRouteSelect.replaceChildren();
  const wholeJourney = state.selectionScope === "journey";
  if (wholeJourney) {
    els.pinnedRouteSelect.append(new Option("All routes — whole journey", "all", true, true));
  }
  state.routes.forEach((route, index) => {
    const start = routeEndpointName(route, "start");
    const end = routeEndpointName(route, "end");
    els.pinnedRouteSelect.append(new Option(`${start} → ${end}`, String(index), false, !wholeJourney && index === state.activeRouteIndex));
  });
  els.pinnedRouteSelect.disabled = !state.routes.length;
}

function renderTripManager() {
  const trip = activeTrip();
  const route = activeRoute();
  renderElementsRouteSelect();
  els.tripSelect.replaceChildren();
  // "settings" is the established no-item target for this selector. Naming it
  // plainly makes its default-editing role discoverable without changing the
  // legacy preview behavior while the remaining scoped selectors are migrated.
  els.tripSelect.append(new Option("None selected — journey defaults", "settings", false, state.noJourneySelected));
  state.trips.forEach((item, index) => {
    els.tripSelect.append(new Option(item.name, String(index), false, !state.noJourneySelected && !elementsPreviewMode && index === state.activeTripIndex));
  });
  renderPinnedDaySelect();
  mountStopAnimationsManager();
  if (els.followStopDaySequence) els.followStopDaySequence.checked = Boolean(trip?.followStopDaySequence);
  renderPinnedRouteSelect();
  renderJourneyStyleControls?.();
  const stickerDefaults = selectedStickerDefaults?.() || normalizeStickerDefaults(trip?.stickerDefaults);
  if (els.stickerDefaultVisibility) {
    els.stickerDefaultVisibility.value = stickerDefaults.visibility;
  }
  if (els.stickerDefaultSize) {
    const size = stickerDefaults.size;
    els.stickerDefaultSize.value = String(size);
    els.stickerDefaultSizeValue.textContent = String(size);
  }

  renderTripDayList();
  renderTripStopList();

  if (trip) {
    els.dayNamePattern.value = trip.dayNamePattern || DEFAULT_DAY_NAME_PATTERN;
  }
  updateDayNamePatternTooltip();
  els.newDayLabel.disabled = Boolean(els.newDaySequence?.checked);
  updateNewDaySequencePreview();
  els.editDayLabel.value = route?.label || "";
  els.editDaySequenceNumber.value = sequenceNumberInputValue(route?.sequenceNumber);
  els.editDaySequenceDate.value = route?.sequenceDate || "";
  els.editDaySummary.value = route?.summary || "";
  els.editDayRestDay.checked = Boolean(route?.isRestDay);
  els.editDayLabel.disabled = !route;
  els.editDaySequenceNumber.disabled = !route;
  els.editDaySequenceDate.disabled = !route;
  els.editDaySummary.disabled = !route;
  els.editDayRestDay.disabled = !route;
  els.saveDayDetails.disabled = !route;
  els.deleteDay.disabled = !route;
  renderDayRouteEditor(route);
  if (els.tripMediaInput) els.tripMediaInput.disabled = !route;
  if (els.tripBlogTitle) els.tripBlogTitle.disabled = !route;
  if (els.tripBlogText) els.tripBlogText.disabled = !route;
  if (els.addTripBlog) els.addTripBlog.disabled = !route;
  if (els.updateTripBlog) els.updateTripBlog.disabled = !route || selectedTripMedia()?.kind !== "blog";
  els.deleteTrip.disabled = state.trips.length <= 1;
  if (els.deleteSelectedStop) els.deleteSelectedStop.disabled = !activeJourneyStop() || !trip?.days?.length;
  renderNewDayStartControl();
  renderTripMedia();
  renderLandmarks();
  updateDayZoneModifyControls();
  renderMarkerControls();
  renderTripGroupSelect?.();
}

function activeTripGroup() {
  return state.tripGroups?.[state.activeTripGroupIndex] || null;
}

function renderTripGroupSelect() {
  if (!els.topTripSelect) return;
  els.topTripSelect.replaceChildren();
  (state.tripGroups || []).forEach((group, index) => {
    els.topTripSelect.append(new Option(group.name || `Trip ${index + 1}`, String(index), false, index === state.activeTripGroupIndex));
  });
  els.deleteTopTrip && (els.deleteTopTrip.disabled = (state.tripGroups?.length || 0) <= 1);
}

function selectTripGroup(index) {
  const group = state.tripGroups?.[index];
  if (!group) return;
  stopPlayback();
  closeJourneyMedia();
  state.activeTripGroupIndex = index;
  state.trips = group.journeys;
  state.activeTripIndex = clamp(Number(group.activeJourneyIndex) || 0, 0, Math.max(0, state.trips.length - 1));
  const journey = activeTrip();
  state.routes = journey?.days || [];
  state.activeRouteIndex = 0;
  state.noJourneySelected = false;
  renderTripManager();
  if (journey?.days?.length) enterUsOverview();
  else showEmptyTrip();
  saveTrips();
}

function addTripGroup(name) {
  const label = String(name || "").trim();
  if (!label) return false;
  state.tripGroups ||= [];
  state.tripGroups.push({
    id: `trip-group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: label,
    journeys: [makeTrip("Untitled Journey")],
    activeJourneyIndex: 0
  });
  selectTripGroup(state.tripGroups.length - 1);
  setTripStatus(`Added ${label}.`);
  return true;
}

function renameTripGroup(name) {
  const group = activeTripGroup();
  if (!group || !String(name || "").trim()) return false;
  group.name = String(name).trim();
  renderTripGroupSelect();
  saveTrips();
  return true;
}

function deleteActiveTripGroup() {
  if ((state.tripGroups?.length || 0) <= 1) return false;
  const removed = state.tripGroups.splice(state.activeTripGroupIndex, 1)[0];
  selectTripGroup(clamp(state.activeTripGroupIndex, 0, state.tripGroups.length - 1));
  setTripStatus(`Deleted ${removed.name}.`);
  return true;
}



function selectTrip(index, { stopIndex = 0, overview = false, animate = false } = {}) {
  if (typeof sfxPlayEvent === "function") sfxPlayEvent("journey.change");
  const trip = state.trips[index];
  if (!trip) return;
  state.noJourneySelected = false;
  state.noStopSelected = false;
  state.noDaySelected = false;
  stopPlayback();
  closeJourneyMedia();
  dayRouteEditorOpen = false;
  state.overviewHomeView = null;
  state.activeTripIndex = index;
  state.routes = trip.days;
  state.activeRouteIndex = 0;
  selectedStopIndex = clamp(stopIndex, 0, Math.max(0, synchronizeTripStops(trip).length - 1));
  synchronizeTripStops(trip);
  renderTripManager();
  if (trip.days.length) {
    if (overview) setOverviewMode({ animate, loadingLocationName: "" });
    else focusJourneyStop(selectedStopIndex, { animate: false, initial: selectedStopIndex === 0 });
  } else {
    showEmptyTrip();
  }
  saveTrips();
}

function openJourneyOverview(index) {
  selectTrip(index, { overview: true, animate: true });
}



function renderRouteDayButtons() {
  els.routeDayButtons.replaceChildren();
  state.routes.forEach((route, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = route.label || `Day ${index + 1}`;
    const overviewSelected = state.overviewMode && state.overviewFocusIndex === null && state.overviewHover.activeIndex === index;
    button.setAttribute("aria-pressed", !state.overviewMode && index === state.activeRouteIndex || state.overviewMode && state.overviewFocusIndex === index || overviewSelected ? "true" : "false");
    button.addEventListener("click", () => {
      dayRouteEditorOpen = false;
      if (state.overviewMode) {
        chooseOverviewZoneDay(index);
      } else {
        setActiveRoute(index);
      }
    });
    els.routeDayButtons.append(button);
  });
  if (state.routes.length) {
    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.textContent = "All";
    allButton.setAttribute("aria-pressed", state.overviewMode && state.overviewFocusIndex === null && state.overviewHover.activeIndex === null ? "true" : "false");
    allButton.addEventListener("click", () => {
      dayRouteEditorOpen = false;
      setOverviewMode();
    });
    els.routeDayButtons.append(allButton);
  }
}



function setStopCalendarOpen(surface, opening) {
  const calendar = stopCalendarElements(surface);
  const other = stopCalendarElements(surface === "editor" ? "pinned" : "editor");
  if (other.popover) other.popover.hidden = true;
  other.button?.setAttribute("aria-expanded", "false");
  stopCalendarSurface = surface;
  calendar.popover.hidden = !opening;
  calendar.button.setAttribute("aria-expanded", String(opening));
  stopCalendarRangeStart = "";
  stopCalendarDragging = false;
  if (!opening) return;
  const focus = nearestStopDate();
  const [year, month] = focus.split("-").map(Number);
  stopCalendarView = new Date(year, month - 1, 1);
  renderStopCalendar();
}

function appendRouteToActiveTrip(route) {
  let trip = activeTrip();
  if (!trip) {
    trip = makeTrip("My Trip");
    state.trips.push(trip);
    state.activeTripIndex = state.trips.length - 1;
  }
  route.zoneSettings = normalizeZoneSettings(route.zoneSettings, tripZoneSettings(trip));
  route.markerSettings = normalizeMarkerSettings(route.markerSettings, tripMarkerSettings(trip));
  trip.days.push(route);
  synchronizeTripStops(trip);
  resequenceTripDayLabels(trip);
  state.routes = trip.days;
  state.activeRouteIndex = trip.days.length - 1;
  saveTrips();
  renderTripManager();
  setActiveRoute(state.activeRouteIndex);
}

function insertRoutesIntoActiveTrip(routes, insertIndex, options = {}) {
  let trip = activeTrip();
  if (!trip) {
    trip = makeTrip("My Trip");
    state.trips.push(trip);
    state.activeTripIndex = state.trips.length - 1;
  }
  const existingRouteIds = new Set(state.trips.flatMap(item => item.days.map(day => day.id)));
  const normalizedRoutes = routes.map(route => {
    route.id = makeUniqueRouteId(route.id, existingRouteIds);
    route.zoneSettings = normalizeZoneSettings(route.zoneSettings, tripZoneSettings(trip));
    route.markerSettings = normalizeMarkerSettings(route.markerSettings, tripMarkerSettings(trip));
    route.autoLabel = true;
    return route;
  });
  const index = clamp(Number(insertIndex) || 0, 0, trip.days.length);
  if (normalizedRoutes.length) {
    normalizedRoutes[0].sequenceNumber = sequenceNumberFromInput(options.sequenceNumber);
    normalizedRoutes[0].sequenceDate = options.sequenceDate || "";
  }
  trip.days.splice(index, 0, ...normalizedRoutes);
  synchronizeTripStops(trip);
  enableAutoLabelsFrom(trip, index);
  resequenceTripDayLabels(trip);
  state.routes = trip.days;
  state.activeRouteIndex = index;
  saveTrips();
  renderTripManager();
  setActiveRoute(state.activeRouteIndex);
}

function renderRouteImportPositionOptions() {
  if (!els.routeImportPosition) return;
  const trip = activeTrip();
  const days = trip?.days || [];
  const defaultIndex = clamp(state.activeRouteIndex + 1, 0, days.length);
  els.routeImportPosition.replaceChildren(new Option("At beginning", "0", false, defaultIndex === 0));
  days.forEach((day, index) => {
    els.routeImportPosition.append(new Option(`After ${day.label || `Day ${index + 1}`}`, String(index + 1), false, defaultIndex === index + 1));
  });
  if (!days.length) {
    els.routeImportPosition.replaceChildren(new Option("Start journey", "0", true, true));
  }
}

function openRouteImportDialog(routes, conversions = []) {
  pendingRouteImportRoutes = routes;
  pendingRouteImportConversions = conversions;
  renderRouteImportPositionOptions();
  if (els.routeImportSequenceNumber) els.routeImportSequenceNumber.value = "Auto";
  if (els.routeImportSequenceDate) els.routeImportSequenceDate.value = "";
  if (els.routeImportSummary) {
    els.routeImportSummary.textContent = `Ready to import ${routes.length} day${routes.length === 1 ? "" : "s"}. Following generated day names will be updated.`;
  }
  els.routeImportDialog.hidden = false;
  els.routeImportApply?.focus();
}

function closeRouteImportDialog() {
  pendingRouteImportRoutes = [];
  pendingRouteImportConversions = [];
  if (els.routeImportDialog) els.routeImportDialog.hidden = true;
}

let lastGeocodeRequestAt = 0;



async function geocodeAddress(query) {
  const waitTime = Math.max(0, 1100 - (Date.now() - lastGeocodeRequestAt));
  if (waitTime) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);
  lastGeocodeRequestAt = Date.now();
  const response = await rvServiceFetch("nominatim", url, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Location search failed (${response.status}).`);
  const [result] = await response.json();
  if (!result) throw new Error(`No location found for "${query}".`);
  return {
    lat: Number(result.lat),
    lon: Number(result.lon),
    label: result.display_name || query
  };
}

async function buildAddressRoute(startQuery, endQuery, statusMessage = "Building the road route...", options = {}) {
  const start = await geocodeAddress(startQuery);
  const end = await geocodeAddress(endQuery);
  return buildRouteFromLocations(start, end, {
    ...options,
    startQuery,
    endQuery,
    statusMessage
  });
}

function coordinateQuery(point) {
  return `${Number(point.lat).toFixed(5)}, ${Number(point.lon).toFixed(5)}`;
}

function routeLocationFromPoint(point, fallbackLabel = "Map point") {
  return {
    lat: Number(point.lat),
    lon: Number(point.lon),
    label: fallbackLabel || coordinateQuery(point)
  };
}

async function buildRouteFromLocations(start, end, {
  startQuery = start?.label || coordinateQuery(start),
  endQuery = end?.label || coordinateQuery(end),
  statusMessage = "Building the road route...",
  waypoints = []
} = {}) {
  setTripStatus(statusMessage);
  const normalizedWaypoints = normalizeRouteWaypoints(waypoints);
  const waypointCoordinates = normalizedWaypoints
    .map(waypoint => `${waypoint.routeLon},${waypoint.routeLat}`);
  const coordinates = [
    `${start.lon},${start.lat}`,
    ...waypointCoordinates,
    `${end.lon},${end.lat}`
  ].join(";");
  const url = `${OSRM_ROUTE_URL}/${coordinates}?overview=full&geometries=geojson&steps=false&continue_straight=false`;
  const response = await rvServiceFetch("osrm", url);
  if (!response.ok) throw new Error(`Road routing failed (${response.status}).`);
  const payload = await response.json();
  const result = payload.routes?.[0];
  if (!result?.geometry?.coordinates?.length) {
    throw new Error("No drivable route was found between those locations.");
  }
  return {
    startQuery,
    endQuery,
    start,
    end,
    waypoints: normalizedWaypoints,
    points: result.geometry.coordinates.map(([lon, lat]) => ({ lat, lon })),
    durationSeconds: result.duration,
    distanceMeters: result.distance
  };
}



function lastMovingRouteBefore(index = activeTrip()?.days.length || 0) {
  const days = activeTrip()?.days || [];
  for (let dayIndex = Math.min(index - 1, days.length - 1); dayIndex >= 0; dayIndex -= 1) {
    if (!days[dayIndex].isRestDay) return days[dayIndex];
  }
  return null;
}

function routeEndPoint(route) {
  const points = route?.displayPoints?.length ? route.displayPoints : route?.points || [];
  return points.length ? points[points.length - 1] : null;
}

function restDayRouteFromLocation(label, location, meta = {}) {
  const point = { lat: location.lat, lon: location.lon };
  const address = location.label || meta.endQuery || "Rest stop";
  const query = meta.endQuery || address;
  return makeRoute({ title: label, points: [point, { ...point }] }, {
    label,
    summary: `${query} rest day`,
    source: "Rest day",
    durationSeconds: 0,
    startAddress: meta.startAddress || "",
    endAddress: address,
    startQuery: meta.startQuery || "",
    endQuery: query,
    independentStart: Boolean(meta.independentStart),
    isRestDay: true,
    addressHistory: [query, address, meta.startAddress, meta.startQuery].filter(Boolean)
  });
}

async function buildRestDayRoute(label, endQuery, { independentStart = false, routeIndex = null } = {}) {
  if (!independentStart) {
    const previousMovingRoute = lastMovingRouteBefore(Number.isInteger(routeIndex) ? routeIndex : activeTrip()?.days.length || 0);
    const point = routeEndPoint(previousMovingRoute);
    const endAddress = previousMovingRoute?.endAddress || previousMovingRoute?.endQuery || endQuery;
    if (!point || !endAddress) {
      throw new Error("No previous moving destination is available. Start this rest day somewhere new instead.");
    }
    return restDayRouteFromLocation(label, {
      lat: point.lat,
      lon: point.lon,
      label: endAddress
    }, {
      endQuery: previousMovingRoute.endQuery || endAddress,
      independentStart: false
    });
  }
  const end = await geocodeAddress(endQuery);
  return restDayRouteFromLocation(label, end, {
    endQuery,
    independentStart: true
  });
}

function syncEndpointMedia(route) {
  const points = route?.displayPoints?.length ? route.displayPoints : route?.points || [];
  if (!points.length) return;
  route.media.forEach(item => {
    if (item.routeAnchor === "start") {
      item.lat = points[0].lat;
      item.lon = points[0].lon;
      item.sourceLat = item.lat;
      item.sourceLon = item.lon;
    } else if (item.routeAnchor === "end") {
      const end = points[points.length - 1];
      item.lat = end.lat;
      item.lon = end.lon;
      item.sourceLat = item.lat;
      item.sourceLon = item.lon;
    }
  });
}

function applyAddressRouteResult(route, result, independentStart) {
  route.points = result.points;
  route.displayPoints = smoothRoutePoints(result.points);
  route.durationSeconds = result.durationSeconds;
  route.startAddress = result.start.label;
  route.endAddress = result.end.label;
  route.startQuery = result.startQuery;
  route.endQuery = result.endQuery;
  route.waypoints = normalizeRouteWaypoints(result.waypoints);
  route.summary = `${result.startQuery} to ${result.endQuery}`;
  route.independentStart = Boolean(independentStart);
  route.isRestDay = false;
  route.source = "Address route";
  rememberRouteAddresses(
    route,
    result.startQuery,
    result.endQuery,
    result.start.label,
    result.end.label
  );
  syncEndpointMedia(route);
  applyAutomaticMediaOrder(route);
}

function applyRestDayRouteResult(route, restRoute) {
  route.points = restRoute.points;
  route.displayPoints = restRoute.displayPoints;
  route.durationSeconds = 0;
  route.startAddress = restRoute.startAddress;
  route.endAddress = restRoute.endAddress;
  route.startQuery = restRoute.startQuery;
  route.endQuery = restRoute.endQuery;
  route.summary = restRoute.summary;
  route.independentStart = restRoute.independentStart;
  route.isRestDay = true;
  route.source = "Rest day";
  route.addressHistory = [...new Set([...(route.addressHistory || []), ...(restRoute.addressHistory || [])])];
  syncEndpointMedia(route);
  applyAutomaticMediaOrder(route);
}

function routeEditPointFromLatLng(latlng, route = activeRoute()) {
  const rawPoint = { lat: latlng.lat, lon: latlng.lng };
  const nearest = nearestRoutePoint(route, rawPoint.lat, rawPoint.lon);
  const useSnappedRoutePoint = Number.isFinite(nearest.distance) && nearest.distance <= ROUTE_WAYPOINT_SNAP_METERS;
  return {
    ...rawPoint,
    routeLat: useSnappedRoutePoint ? nearest.lat : rawPoint.lat,
    routeLon: useSnappedRoutePoint ? nearest.lon : rawPoint.lon,
    snapped: useSnappedRoutePoint,
    distance: nearest.distance
  };
}

function orderedRouteWaypoints(route, nextWaypoint = null) {
  const waypoints = normalizeRouteWaypoints(route?.waypoints);
  if (nextWaypoint) waypoints.push(nextWaypoint);
  return waypoints
    .map(waypoint => ({
      ...waypoint,
      progress: mediaRouteProgress(route, { lat: waypoint.routeLat, lon: waypoint.routeLon })
    }))
    .sort((a, b) => a.progress - b.progress)
    .map(({ progress, ...waypoint }) => waypoint);
}

function routeWaypointIcon(index) {
  return L.divIcon({
    className: "route-waypoint-edit-icon",
    html: `<span title="Waypoint ${index + 1}">${index + 1}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 20],
    popupAnchor: [0, -18]
  });
}

function rebuildRouteAfterWaypointEdit(route, statusMessage = "Updating waypoints and rebuilding route...") {
  if (!route) return Promise.resolve(false);
  const start = route.points?.[0];
  const end = route.points?.[route.points.length - 1];
  if (!start || !end) return Promise.resolve(false);
  return buildRouteFromLocations(
    routeLocationFromPoint(start, routeEndpointName(route, "start")),
    routeLocationFromPoint(end, routeEndpointName(route, "end")),
    {
      startQuery: route.startQuery || route.startAddress || routeEndpointName(route, "start"),
      endQuery: route.endQuery || route.endAddress || routeEndpointName(route, "end"),
      statusMessage,
      waypoints: route.waypoints
    }
  ).then(result => {
    applyAddressRouteResult(route, result, route.independentStart);
    state.points = route.points;
    state.displayPoints = route.displayPoints;
    saveTrips();
    renderTripManager();
    renderRoute(false);
    renderRouteDayButtons();
    renderRouteWaypointManager();
    updateStats();
    setTripStatus(`Updated waypoints for ${route.label || "this route"}.`);
    return true;
  }).catch(error => {
    setTripStatus(error.message || "The waypoint could not be removed.", true);
    return false;
  });
}

function removeRouteWaypoint(route, waypointId) {
  if (!route) return;
  route.waypoints = normalizeRouteWaypoints(route.waypoints).filter(waypoint => waypoint.id !== waypointId);
  rebuildRouteAfterWaypointEdit(route, "Removing waypoint and rebuilding route...");
}

function waypointPopupContent(route, waypoint, index) {
  const content = document.createElement("div");
  content.className = "route-waypoint-popup";
  const title = document.createElement("strong");
  title.textContent = waypoint.label || `Waypoint ${index + 1}`;
  const note = document.createElement("p");
  note.textContent = "Editing-only route waypoint.";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Delete waypoint";
  button.addEventListener("click", () => {
    map.closePopup();
    removeRouteWaypoint(route, waypoint.id);
  });
  content.append(title, note, button);
  return content;
}

function renderRouteWaypoints() {
  routeWaypointGroup.clearLayers();
  renderRouteWaypointManager();
  if (!els.showRouteWaypoints?.checked || (state.overviewMode && state.overviewFocusIndex === null)) return;
  const route = activeRoute();
  const waypoints = normalizeRouteWaypoints(route?.waypoints);
  waypoints.forEach((waypoint, index) => {
    const marker = L.marker([waypoint.lat, waypoint.lon], {
      pane: "markerPane",
      keyboard: false,
      riseOnHover: true,
      icon: routeWaypointIcon(index)
    }).bindPopup(waypointPopupContent(route, waypoint, index));
    routeWaypointGroup.addLayer(marker);
  });
}



async function updateRouteFromMapPin(kind, latlng) {
  const route = activeRoute();
  const routeIndex = state.activeRouteIndex;
  if (!route || route.isRestDay || (state.overviewMode && state.overviewFocusIndex === null)) return;
  const points = route.points || [];
  if (points.length < 2) {
    setTripStatus("This route does not have enough points to edit from the map.", true);
    return;
  }
  const editPoint = routeEditPointFromLatLng(latlng, route);
  const startPoint = points[0];
  const endPoint = points[points.length - 1];
  const existingStart = routeLocationFromPoint(startPoint, routeEndpointName(route, "start"));
  const existingEnd = routeLocationFromPoint(endPoint, routeEndpointName(route, "end"));
  const routeNameSnapshot = snapshotRouteEndpointNames(route);
  const nextRoute = state.routes[routeIndex + 1];
  const nextNameSnapshot = snapshotRouteEndpointNames(nextRoute);

  try {
    setTripStatus(`Updating ${route.label || "route"}...`);
    let result;
    let nextResult = null;
    let nextIndependentStart = route.independentStart;
    if (kind === "start") {
      const start = routeLocationFromPoint(editPoint, coordinateQuery(editPoint));
      result = await buildRouteFromLocations(start, existingEnd, {
        startQuery: coordinateQuery(editPoint),
        endQuery: route.endQuery || route.endAddress || existingEnd.label,
        statusMessage: "Routing from the new start point...",
        waypoints: normalizeRouteWaypoints(route.waypoints)
      });
      nextIndependentStart = true;
    } else if (kind === "end") {
      const end = routeLocationFromPoint(editPoint, coordinateQuery(editPoint));
      result = await buildRouteFromLocations(existingStart, end, {
        startQuery: route.startQuery || route.startAddress || existingStart.label,
        endQuery: coordinateQuery(editPoint),
        statusMessage: "Routing to the new end point...",
        waypoints: normalizeRouteWaypoints(route.waypoints)
      });
      if (nextRoute && !nextRoute.independentStart && !nextRoute.isRestDay) {
        const nextEndPoint = nextRoute.points?.[nextRoute.points.length - 1];
        if (nextEndPoint) {
          nextResult = await buildRouteFromLocations(
            routeLocationFromPoint(editPoint, routeEndpointName(route, "end")),
            routeLocationFromPoint(nextEndPoint, routeEndpointName(nextRoute, "end")),
            {
              startQuery: nextRoute.startQuery || route.endQuery || route.endAddress || routeEndpointName(route, "end"),
              endQuery: nextRoute.endQuery || nextRoute.endAddress || routeEndpointName(nextRoute, "end"),
              statusMessage: `Updating ${nextRoute.label || "next day"} to begin at the new endpoint...`,
              waypoints: normalizeRouteWaypoints(nextRoute.waypoints)
            }
          );
        }
      }
    } else {
      const waypoint = {
        id: `waypoint-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        lat: editPoint.lat,
        lon: editPoint.lon,
        routeLat: editPoint.routeLat,
        routeLon: editPoint.routeLon,
        label: `Waypoint ${(route.waypoints?.length || 0) + 1}`
      };
      result = await buildRouteFromLocations(existingStart, existingEnd, {
        startQuery: route.startQuery || route.startAddress || existingStart.label,
        endQuery: route.endQuery || route.endAddress || existingEnd.label,
        statusMessage: editPoint.snapped
          ? "Routing through the nearest road point..."
          : "Routing through the selected waypoint...",
        waypoints: orderedRouteWaypoints(route, waypoint)
      });
    }

    applyAddressRouteResult(route, result, nextIndependentStart);
    restoreRouteEndpointNames(route, routeNameSnapshot);
    if (kind === "start") {
      route.startNameIndependent = true;
      route.startName = routeNameSnapshot?.startName
        || routeNameSnapshot?.startQuery
        || routeNameSnapshot?.startAddress
        || existingStart.label;
      route.summary = `${routeEndpointName(route, "start")} to ${routeEndpointName(route, "end")}`;
    }
    if (nextRoute && nextResult) {
      applyAddressRouteResult(nextRoute, nextResult, false);
      restoreRouteEndpointNames(nextRoute, nextNameSnapshot);
    }
    state.points = route.points;
    state.displayPoints = route.displayPoints;
    saveTrips();
    renderTripManager();
    state.activeRouteIndex = routeIndex;
    renderRoute(false);
    renderRouteDayButtons();
    updateStats();
    setTripStatus(kind === "waypoint"
      ? `Added waypoint to ${route.label || "this route"}.`
      : `Updated ${kind === "start" ? "start" : "end"} point for ${route.label || "this route"}.`);
  } catch (error) {
    setTripStatus(error.message || "The route could not be updated from that map point.", true);
  }
}



function openRouteEditPopup(latlng) {
  const route = activeRoute();
  if (!route || route.isRestDay || (state.overviewMode && state.overviewFocusIndex === null)) return;
  const content = document.createElement("div");
  content.className = "route-edit-popup";
  const title = document.createElement("strong");
  title.textContent = "Modify this route";
  const note = document.createElement("p");
  note.textContent = "Choose how to use this map point.";
  const actions = document.createElement("div");
  actions.className = "route-edit-popup-actions";
  [
    ["start", "Start point"],
    ["end", "End point"],
    ["waypoint", "Waypoint"]
  ].forEach(([kind, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => {
      map.closePopup();
      updateRouteFromMapPin(kind, latlng);
    });
    actions.append(button);
  });
  content.append(title, note, actions);
  L.popup({ closeButton: true, autoPan: true })
    .setLatLng(latlng)
    .setContent(content)
    .openOn(map);
}

async function createRouteFromAddresses() {
  const previousRoute = activeTrip()?.days.at(-1);
  const independentStart = !previousRoute || els.newDayIndependentStart.checked;
  const restDay = Boolean(els.newDayRestDay.checked);
  updateNewDaySequencePreview();
  const nameInputs = els.newDaySequence.checked ? [] : [els.newDayLabel];
  const requiredInputs = restDay
    ? independentStart ? [...nameInputs, els.routeEndAddress] : nameInputs
    : independentStart
    ? [...nameInputs, els.routeStartAddress, els.routeEndAddress]
    : [...nameInputs, els.routeEndAddress];
  if (!validateRequiredInputs(requiredInputs)) {
    setTripStatus("Complete the required route fields.", true);
    return false;
  }
  const autoLabel = Boolean(els.newDaySequence.checked);
  const label = autoLabel ? formatDaySequenceName(activeTrip(), activeTrip()?.days.length || 0) : els.newDayLabel.value.trim();
  if (restDay) {
    els.createAddressRoute.disabled = true;
    setTripStatus("Adding rest day...");
    try {
      const endQuery = independentStart ? els.routeEndAddress.value.trim() : "";
      const route = await buildRestDayRoute(label, endQuery, { independentStart });
      route.autoLabel = autoLabel;
      appendRouteToActiveTrip(route);
      els.newDayLabel.value = "";
      els.routeStartAddress.value = "";
      els.routeEndAddress.value = "";
      els.newDayRestDay.checked = false;
      els.newDayIndependentStart.checked = false;
      renderNewDayStartControl();
      updateNewDaySequencePreview();
      requiredInputs.forEach(clearRequiredState);
      setTripStatus(`Added ${label} as a rest day.`);
      return true;
    } catch (error) {
      setTripStatus(error.message || "The rest day could not be created.", true);
      return false;
    } finally {
      els.createAddressRoute.disabled = false;
    }
  }
  const startQuery = independentStart
    ? els.routeStartAddress.value.trim()
    : previousRoute.endQuery || previousRoute.endAddress || "";
  const endQuery = els.routeEndAddress.value.trim();
  if (!startQuery) {
    setTripStatus("The previous route has no destination address. Give this route an independent start instead.", true);
    return false;
  }

  els.createAddressRoute.disabled = true;
  setTripStatus("Finding locations...");
  try {
    const result = await buildAddressRoute(startQuery, endQuery);
    const route = makeRoute({ title: label, points: result.points }, {
      label,
      summary: `${startQuery} to ${endQuery}`,
      source: "Address route",
      durationSeconds: result.durationSeconds,
      startAddress: result.start.label,
      endAddress: result.end.label,
      startQuery,
      endQuery,
      independentStart,
      isRestDay: false,
      autoLabel,
      addressHistory: [startQuery, endQuery, result.start.label, result.end.label]
    });
    appendRouteToActiveTrip(route);
    els.newDayLabel.value = "";
    els.routeStartAddress.value = "";
    els.routeEndAddress.value = "";
    els.newDayIndependentStart.checked = false;
    renderNewDayStartControl();
    updateNewDaySequencePreview();
    requiredInputs.forEach(clearRequiredState);
    setTripStatus(`Added ${label}: ${Math.round(result.distanceMeters / 1609.344).toLocaleString()} mi.`);
    return true;
  } catch (error) {
    setTripStatus(error.message || "The route could not be created.", true);
    return false;
  } finally {
    els.createAddressRoute.disabled = false;
  }
}

async function updateSelectedDayRoute() {
  const route = activeRoute();
  const routeIndex = state.activeRouteIndex;
  if (!route) return false;
  const isFirstDay = routeIndex === 0;
  const independentStart = isFirstDay || els.editDayIndependentStart.checked;
  const restDay = Boolean(els.editDayRestDay.checked);
  const previousRoute = state.routes[routeIndex - 1];
  const startQuery = independentStart
    ? els.editDayStartAddress.value.trim()
    : previousRoute?.endQuery || previousRoute?.endAddress || "";
  const endQuery = els.editDayEndAddress.value.trim();
  const requiredInputs = restDay
    ? independentStart ? [els.editDayEndAddress] : []
    : independentStart
    ? [els.editDayStartAddress, els.editDayEndAddress]
    : [els.editDayEndAddress];
  if (!validateRequiredInputs(requiredInputs) || (!restDay && !startQuery)) {
    setTripStatus("Complete the required route fields.", true);
    return false;
  }

  els.applyDayRouteEdit.disabled = true;
  els.cancelDayRouteEdit.disabled = true;
  setTripStatus(`Updating ${route.label}...`);
  try {
    if (restDay) {
      const restRoute = await buildRestDayRoute(route.label, endQuery, { independentStart, routeIndex });
      const nextRoute = state.routes[routeIndex + 1];
      let nextResult = null;
      if (nextRoute && !nextRoute.independentStart && !nextRoute.isRestDay) {
        const nextEndQuery = nextRoute.endQuery || nextRoute.endAddress;
        if (!nextEndQuery) {
          throw new Error(`${nextRoute.label} has no destination address. Mark it as an independent start before updating this route.`);
        }
        nextResult = await buildAddressRoute(
          restRoute.endQuery || restRoute.endAddress,
          nextEndQuery,
          `Updating ${nextRoute.label} to begin at the rest-day location...`
        );
      }
      applyRestDayRouteResult(route, restRoute);
      if (nextRoute && nextResult) {
        applyAddressRouteResult(nextRoute, nextResult, false);
      }
      state.points = route.points;
      state.displayPoints = route.displayPoints;
      dayRouteEditorOpen = false;
      saveTrips();
      renderTripManager();
      setActiveRoute(routeIndex, true, false);
      setTripStatus(nextResult
        ? `Updated ${route.label} as a rest day and moved ${nextRoute.label}'s start to that location.`
        : `Updated ${route.label} as a rest day.`);
      return true;
    }
    const currentResult = await buildAddressRoute(
      startQuery,
      endQuery,
      `Building the updated route for ${route.label}...`
    );
    const nextRoute = state.routes[routeIndex + 1];
    let nextResult = null;
    if (nextRoute && !nextRoute.independentStart) {
      const nextEndQuery = nextRoute.endQuery || nextRoute.endAddress;
      if (!nextEndQuery) {
        throw new Error(`${nextRoute.label} has no destination address. Mark it as an independent start before updating this route.`);
      }
      nextResult = await buildAddressRoute(
        endQuery,
        nextEndQuery,
        `Updating ${nextRoute.label} to begin at the new destination...`
      );
    }

    applyAddressRouteResult(route, currentResult, independentStart);
    if (nextRoute && nextResult) {
      applyAddressRouteResult(nextRoute, nextResult, false);
    }
    state.points = route.points;
    state.displayPoints = route.displayPoints;
    dayRouteEditorOpen = false;
    saveTrips();
    renderTripManager();
    setActiveRoute(routeIndex, true, false);
    setTripStatus(nextResult
      ? `Updated ${route.label} and moved ${nextRoute.label}'s start to the new destination.`
      : `Updated ${route.label}.`);
    return true;
  } catch (error) {
    setTripStatus(error.message || "The route could not be updated.", true);
    return false;
  } finally {
    els.applyDayRouteEdit.disabled = false;
    els.cancelDayRouteEdit.disabled = false;
  }
}



function loadRoutes(routes, activeIndex = 0, persist = true, initialView = "stop") {
  if (!state.trips.length) {
    state.trips = [makeTrip("Western RV Trip", routes)];
    state.activeTripIndex = 0;
  } else {
    activeTrip().days = routes;
  }
  synchronizeTripStops(activeTrip());
  resequenceTripDayLabels(activeTrip());
  state.routes = routes;
  state.activeRouteIndex = activeIndex;
  if (persist) saveTrips();
  renderTripManager();
  if (initialView === "us") showInitialUsOverview();
  else showInitialJourneyStop();
}

function loadRouteFile(text, sourceLabel) {
  const parsed = parseRouteFile(text, sourceLabel);
  updateNewDaySequencePreview();
  const autoLabel = Boolean(els.newDaySequence?.checked);
  const label = autoLabel ? formatDaySequenceName(activeTrip(), activeTrip()?.days.length || 0) : els.newDayLabel?.value.trim() || parsed.title || `Day ${(activeTrip()?.days.length || 0) + 1}`;
  appendRouteToActiveTrip(makeRoute(parsed, { label, source: sourceLabel, autoLabel }));
}

function routesFromJourneyJson(text, sourceLabel) {
  const payload = JSON.parse(text);
  const trips = hydrateTripsPayload(payload);
  return trips.flatMap(trip => trip.days.map(day => {
    day.source = sourceLabel;
    day.autoLabel = true;
    return day;
  }));
}

function uploadedRoutesToJsonPayload(routes, name) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    activeTripIndex: 0,
    activeRouteIndex: 0,
    trips: [{
      ...makeTrip(name || "Imported route", routes),
      name: name || "Imported route",
      days: routes
    }]
  };
}

async function routesFromUploadFiles(files) {
  const routes = [];
  const conversions = [];
  for (const file of files) {
    const text = await file.text();
    if (/\.json$/i.test(file.name) || /^\s*[\[{]/.test(text)) {
      routes.push(...routesFromJourneyJson(text, file.name));
      continue;
    }
    const parsedRoutes = parseRouteFileRoutes(text, file.name);
    const fileRoutes = parsedRoutes.map((parsed, index) => makeRoute(parsed, {
      label: parsed.title || `${file.name.replace(/\.[^.]+$/, "")} ${index + 1}`,
      source: file.name,
      autoLabel: true
    }));
    routes.push(...fileRoutes);
    conversions.push({
      fileName: file.name,
      routes: fileRoutes
    });
  }
  return { routes, conversions };
}

async function ensureLaverneLoopStartingLeg() {
  if (laverneLoopRepairInProgress) return;
  const trip = activeTrip();
  if (!trip || !/laverne/i.test(trip.name || "") || !/colorado springs/i.test(trip.name || "")) return;
  const first = trip.days[0];
  if (!first) return;
  const hasEdmond = trip.days.some(day => /edmond/i.test(`${day.startQuery} ${day.startAddress} ${day.endQuery} ${day.endAddress} ${day.summary}`));
  const startsAtLaverne = /laverne/i.test(`${first.startQuery} ${first.startAddress} ${first.summary}`);
  if (hasEdmond || !startsAtLaverne) return;
  laverneLoopRepairInProgress = true;
  try {
    setTripStatus("Adding missing Edmond, OK to Laverne, OK first day...");
    const result = await buildAddressRoute("Edmond, OK", "Laverne, OK", "Building missing first route day...");
    const route = makeRoute({ title: "Day 1", points: result.points }, {
      label: "Day 1",
      summary: "Edmond, OK to Laverne, OK",
      source: "Address route",
      durationSeconds: result.durationSeconds,
      startAddress: result.start.label,
      endAddress: result.end.label,
      startQuery: "Edmond, OK",
      endQuery: "Laverne, OK",
      independentStart: true,
      autoLabel: true,
      addressHistory: ["Edmond, OK", "Laverne, OK", result.start.label, result.end.label]
    });
    route.zoneSettings = normalizeZoneSettings(route.zoneSettings, tripZoneSettings(trip));
    route.markerSettings = normalizeMarkerSettings(route.markerSettings, tripMarkerSettings(trip));
    trip.days.unshift(route);
    synchronizeTripStops(trip);
    resequenceTripDayLabels(trip);
    state.routes = trip.days;
    state.activeRouteIndex = 0;
    saveTrips();
    renderTripManager();
    showInitialJourneyStop();
    setTripStatus("Added the missing first route from Edmond, OK to Laverne, OK.");
  } catch (error) {
    setTripStatus(error.message || "Could not add the missing first day.", true);
  } finally {
    laverneLoopRepairInProgress = false;
  }
}

async function loadDefaultRoutes() {
  const restored = restoreSavedTrips();
  if (restored.restored) {
    const retiredMediaCount = removeRetiredDefaultMedia();
    if (retiredMediaCount) saveTrips();
    const addedJourneyCount = await mergeMissingDefaultJourneys();
    renderTripManager();
    if (activeTrip()?.days.length) {
      showInitialJourneyStop();
      ensureLaverneLoopStartingLeg();
    } else {
      showEmptyTrip();
    }
    if (addedJourneyCount) {
      setTripStatus(`Added ${addedJourneyCount} new project journey${addedJourneyCount === 1 ? "" : "s"} without changing your saved journey.`);
    }
    return;
  }
  if (restored.error) {
    showEmptyTrip();
    els.empty.textContent = "Saved journey data could not be opened. It was preserved for recovery and was not overwritten.";
    els.status.textContent = restored.error.message;
    setTripStatus("Saved journeys need recovery. Default routes were not loaded over them.", true);
    return;
  }
  if (await loadDefaultJourneyFile()) {
    renderTripManager();
    if (activeTrip()?.days.length) {
      showInitialJourneyStop();
      ensureLaverneLoopStartingLeg();
    } else {
      showEmptyTrip();
    }
    return;
  }
  try {
    const routeResults = await Promise.all(DEFAULT_ROUTE_FILES.map(async routeFile => {
      const response = await fetch(routeFile.path);
      if (!response.ok) throw new Error(`Could not load ${routeFile.path}.`);
      const parsed = parseRouteFile(await response.text(), routeFile.path);
      return makeRoute(parsed, {
        label: routeFile.label,
        summary: routeFile.summary,
        source: routeFile.path,
        color: routeFile.color
      });
    }));
    // Fallback route files should honor the same first-stop saved view as the
    // project journey file, rather than unexpectedly opening the US overview.
    loadRoutes(routeResults, 0, false, "stop");
    ensureLaverneLoopStartingLeg();
  } catch (error) {
    try {
      const response = await fetch(KML_PATH);
      if (!response.ok) throw error;
      const parsed = parseRouteFile(await response.text(), KML_PATH);
      loadRoutes([makeRoute(parsed, { label: parsed.title, source: KML_PATH })], 0, false);
    } catch (fallbackError) {
      cancelInitialRouteLoading();
      els.empty.hidden = false;
      els.empty.textContent = "Open this page through a local web server, or choose a GPX/KML file with the loader.";
      els.status.textContent = fallbackError.message;
    }
  }
}

function initializeJourneyEditor() {
  els.tripSelect.addEventListener("change", () => {
    if (els.tripSelect.value === "settings") {
      if (elementsPreviewMode) exitElementsPreview();
      state.noJourneySelected = true;
      // The landmark editor already has a durable project-default scope.
      // Enter it with the no-journey selection so all map-feature controls
      // agree on what "None selected" means.
      if (typeof landmarkSettingsScope !== "undefined") landmarkSettingsScope = "default";
      if (typeof selectedLandmarkStopKey !== "undefined") selectedLandmarkStopKey = "";
      enterUsOverview();
      return;
    }
    if (elementsPreviewMode) exitElementsPreview();
    selectTrip(Number(els.tripSelect.value));
  });
}
