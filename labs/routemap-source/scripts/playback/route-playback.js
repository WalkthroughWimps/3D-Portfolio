"use strict";

// Route progress, journey targets, animation icon state, and playback sequencing.

let routeAnimationPreviewHoverActive = false;
let routeAnimationPresentationBlend = null;
let routeAnimationPresentationFrame = null;
let routeAnimationPresentationToken = 0;

function routeAnimationPresentationAmount(routeIndex, progress) {
  const presentation = routeAnimationStopPresentation(routeIndex, progress);
  if (!presentation) return 0;
  if (
    routeAnimationPresentationBlend
    && routeAnimationPresentationBlend.routeIndex === routeIndex
    && routeAnimationPresentationBlend.anchor === presentation.anchor
  ) {
    return routeAnimationPresentationBlend.amount;
  }
  return state.playback.active ? 0 : 1;
}

function cancelRouteAnimationPresentation() {
  routeAnimationPresentationToken += 1;
  if (routeAnimationPresentationFrame) cancelAnimationFrame(routeAnimationPresentationFrame);
  routeAnimationPresentationFrame = null;
  routeAnimationPresentationBlend = null;
}

function animateRouteAnimationPresentation(routeIndex, progress, from, to, onComplete) {
  cancelRouteAnimationPresentation();
  const route = state.routes[routeIndex];
  const presentation = routeAnimationStopPresentation(routeIndex, progress);
  const point = routeProgressPoint(route?.displayPoints || [], progress);
  if (!route || !presentation || !point || !state.playback.icon) {
    onComplete?.();
    return;
  }
  const token = routeAnimationPresentationToken;
  const startedAt = performance.now();
  const duration = 360;
  const step = now => {
    if (token !== routeAnimationPresentationToken) return;
    const raw = clamp((now - startedAt) / duration, 0, 1);
    const eased = raw * raw * (3 - 2 * raw);
    routeAnimationPresentationBlend = {
      routeIndex,
      anchor: presentation.anchor,
      amount: from + (to - from) * eased
    };
    updateRouteAnimationIconPresentation(state.playback.icon, routeIndex, progress, true);
    state.playback.icon.setLatLng(routeAnimationOffsetLatLng(point, routeIndex, progress));
    if (raw < 1) {
      routeAnimationPresentationFrame = requestAnimationFrame(step);
      return;
    }
    routeAnimationPresentationFrame = null;
    routeAnimationPresentationBlend = null;
    onComplete?.();
  };
  routeAnimationPresentationFrame = requestAnimationFrame(step);
}

function setRouteAnimationPreviewHover(active) {
  routeAnimationPreviewHoverActive = Boolean(active);
  if (!(state.overviewMode && state.overviewFocusIndex === null)) return;
  playbackGroup.clearLayers();
  state.playback.icon = null;
  state.playback.layer = null;
  if (routeAnimationPreviewHoverActive) renderRouteAnimationStartIcon();
}

function routeAnimationDurationForPath(pathLength) {
  const baseDuration = clamp(Number(els.overviewRouteAnimationTime.value) || 0.6, 0.1, 2);
  const lengthRatio = Math.max(0.08, Number(pathLength) / ROUTE_ANIMATION_REFERENCE_PATH_PX);
  return Math.max(ROUTE_ANIMATION_MIN_DURATION, baseDuration * lengthRatio);
}



function renderPlayback() {
  if (!state.playback.hasStarted) return;
  const routeData = activeRoute();
  if (!routeData) return;
  const points = state.playback.session?.points?.length
    ? state.playback.session.points
    : routeData.displayPoints;
  if (!points?.length) return;

  if (!state.playback.layer) {
    state.playback.layer = L.polyline(partialRoutePoints(points, state.playback.progress).map(toLatLng), {
      color: getRouteDisplayColors().fill,
      weight: styleSize("route"),
      opacity: 0,
      pane: "activeRoutePane",
      renderer: activeRouteRenderer,
      className: "leaflet-route-stroke",
      lineCap: "round",
      lineJoin: "round"
    });
    playbackGroup.addLayer(state.playback.layer);
    applyLayerElementBlend(state.playback.layer, "route");
  } else {
    state.playback.layer.setLatLngs(partialRoutePoints(points, state.playback.progress).map(toLatLng));
    state.playback.layer.setStyle({
      color: getRouteDisplayColors().fill,
      weight: styleSize("route")
    });
  }

  const path = state.playback.layer.getElement();
  if (path) {
    path.style.strokeDasharray = "none";
    path.style.strokeDashoffset = "0";
    path.style.transition = "none";
    path.style.opacity = "1";
    path.style.mixBlendMode = styleBlend("route");
  }
  state.playback.layer.setStyle({
    opacity: styleOpacity("route"),
    color: getRouteDisplayColors().fill,
    weight: styleSize("route")
  });

  const progressPoint = routeProgressPoint(points, state.playback.progress);
  if (progressPoint) {
    if (!state.playback.icon) {
      state.playback.icon = L.marker(routeAnimationOffsetLatLng(progressPoint, state.activeRouteIndex, state.playback.progress), {
        pane: "markerPane",
        interactive: true,
        draggable: false,
        keyboard: false,
        icon: routeAnimationIconForProgress(getRouteAnimationIconSettings(), state.activeRouteIndex, state.playback.progress)
      });
      bindRouteAnimationIconHandlers(
        state.playback.icon,
        () => routeProgressPoint(points, state.playback.progress),
        () => routeAnimationDisplayPositionKey(state.activeRouteIndex, state.playback.progress)
      );
      playbackGroup.addLayer(state.playback.icon);
    } else {
      updateRouteAnimationIconPresentation(state.playback.icon, state.activeRouteIndex, state.playback.progress);
      if (!state.playback.icon._rvUserDragging) {
        state.playback.icon.setLatLng(routeAnimationOffsetLatLng(progressPoint, state.activeRouteIndex, state.playback.progress));
      }
    }
    refreshMarkersWhenAnimationTownHideChanges("playback", state.activeRouteIndex, state.playback.icon);
  }
}



function renderRouteAnimationStartIcon() {
  if (state.overviewMode && state.overviewFocusIndex === null && !routeAnimationPreviewHoverActive) return;
  if (state.playback.hasStarted || state.playback.icon) return;
  const routeData = activeRoute();
  if (!routeData?.displayPoints?.length) return;
  const iconSettings = getRouteAnimationIconSettings();
  if (!iconSettings.enabled || routeAnimationIconSizePx(iconSettings) <= 0) return;
  const startPoint = routeData.displayPoints[0];
  state.playback.icon = L.marker(routeAnimationOffsetLatLng(startPoint, state.activeRouteIndex, 0), {
    pane: "markerPane",
    interactive: true,
    draggable: false,
    keyboard: false,
    icon: routeAnimationIconForProgress(iconSettings, state.activeRouteIndex, 0)
  });
  bindRouteAnimationIconHandlers(
    state.playback.icon,
    () => activeRoute()?.displayPoints?.[0],
    () => routeAnimationDisplayPositionKey(state.activeRouteIndex, 0)
  );
  playbackGroup.addLayer(state.playback.icon);
  refreshMarkersWhenAnimationTownHideChanges("playback", state.activeRouteIndex, state.playback.icon);
}

function setPlaybackButtons() {
  const disabled = !activeRoute() || state.overviewMode && state.overviewFocusIndex === null;
  const stopCount = synchronizeTripStops(activeTrip()).length;
  const inMotion = state.playback.active
    || state.playback.transitioning
    || state.playback.pendingDirection === 1
    || state.playback.pendingDirection === -1
    || state.playback.session?.phase === "paused"
    || state.playback.session?.phase === "framing";
  // The prominent Previous/Next buttons are navigation, not a second playback
  // mechanism. Timeline transport owns route animation from now on.
  const previousNavigation = primaryPlaybackNavigation(-1);
  const nextNavigation = primaryPlaybackNavigation(1);
  els.playRoute.disabled = inMotion || nextNavigation.disabled;
  els.reverseRoute.disabled = inMotion || previousNavigation.disabled;
  renderPrimaryPlaybackButton(els.reverseRoute, previousNavigation);
  renderPrimaryPlaybackButton(els.playRoute, nextNavigation);
  // A running command owns the selected stop until it reaches a media event
  // or destination.  Disabled controls ensure every visual Next/Previous
  // proxy follows that same rule instead of producing a second command.
  els.previousDay.disabled = disabled || inMotion || !stopCount || selectedStopIndex <= 0;
  els.nextDay.disabled = disabled || (state.playback.session?.phase !== "paused" && (inMotion || !stopCount || selectedStopIndex >= stopCount - 1));
  const route = activeRoute();
  const mediaCount = route?.media?.length || 0;
  const stop = activeJourneyStop();
  els.journeyProgress.textContent = route
    ? `${stop?.name || route.label || `Stop ${selectedStopIndex + 1}`} - ${mediaCount} media item${mediaCount === 1 ? "" : "s"}`
    : "No stop";
  const tripAnimationAvailable = state.contiguousUsMode && state.trips.some(trip => trip.days?.length);
  if (els.playTripAnimation) {
    els.playTripAnimation.hidden = !tripAnimationAvailable;
    els.playTripAnimation.classList.toggle("is-running", Boolean(state.playback.tripAnimation));
    els.playTripAnimation.querySelector("span:last-child").textContent = state.playback.tripAnimation ? "Stop" : "Play trip animation";
  }
}

function stopPlayback() {
  clearPlaybackSession();
  lastStickerPlaybackProgress = null;
  state.playback.townHideKey = "";
  state.playback.followLastPanAt = 0;
  state.playback.followPanUntil = 0;
  state.playback.followCenter = null;
  state.playback.followZoom = null;
  if (state.playback.tripAnimation) {
    state.playback.tripAnimation = false;
    if (typeof state.playback.tripRouteVisible === "boolean") routeDisplayVisible = state.playback.tripRouteVisible;
    state.playback.tripRouteVisible = undefined;
  }
  refreshEndpointMarkers();
  applyToggleState(getToggleState());
  setPlaybackButtons();
}



function routeDistanceMeters(route) {
  const points = route?.displayPoints?.length ? route.displayPoints : route?.points || [];
  return points.slice(1).reduce((total, point, index) => (
    total + L.latLng(points[index].lat, points[index].lon).distanceTo(L.latLng(point.lat, point.lon))
  ), 0);
}

function mediaProgressFraction(route, item) {
  const total = routeDistanceMeters(route);
  if (!total) return 0;
  return clamp(mediaRouteProgress(route, item) / total, 0, 1);
}

function journeyTargets(route) {
  if (!route) return [];
  applyAutomaticMediaOrder(route);
  return [
    { progress: 0, kind: "start" },
    ...route.media.map(item => ({
      progress: mediaProgressFraction(route, item),
      kind: "media",
      mediaId: item.id
    })),
    { progress: 1, kind: "end" }
  ].sort((first, second) => first.progress - second.progress);
}

function openStartOfDayMedia(route) {
  const item = route?.media.find(media => media.routeAnchor === "start");
  if (item) openJourneyMedia(item);
}

function focusJourneyStop(stopIndex, {
  animate = true,
  duration = ROUTE_FIT_DURATION,
  initial = false,
  preserveCamera = false,
  selectedDay = null,
  onComplete = null,
  onCancel = null
} = {}) {
  const stops = synchronizeTripStops(activeTrip());
  const stop = stops[stopIndex];
  if (!stop || !Number.isFinite(stop.lat) || !Number.isFinite(stop.lon)) return false;
  state.noStopSelected = false;
  state.noDaySelected = false;
  selectedStopIndex = stopIndex;
  if (typeof selectedStopDayIso !== "undefined") selectedStopDayIso = selectedDay || "";
  state.selectionScope = "stop";
  updatePinnedSelectionHighlights?.();
  if (typeof sfxPlayEvent === "function") sfxPlayEvent("view.stop");
  state.contiguousUsMode = false;
  const routeIndex = clamp(stopIndex > 0 ? stopIndex - 1 : 0, 0, Math.max(0, state.routes.length - 1));
  if (state.activeRouteIndex !== routeIndex || state.overviewMode) {
    setActiveRoute(routeIndex, false, false);
  } else {
    renderTripManager();
  }
  // setActiveRoute establishes route scope as part of its own transition.
  // A marker/stop click must finish in stop scope so every selector and the
  // Set view button refer to the stop that was actually chosen.
  state.selectionScope = "stop";
  updatePinnedSelectionHighlights?.();
  selectedStopIndex = stopIndex;
  renderTripManager();
  renderRoute(false);
  if (preserveCamera) {
    applyMapInteractionLocks();
    applyToggleState(getToggleState());
    renderCityLabels();
    onComplete?.();
  } else moveToSelectionCamera({
    scope: "stop",
    stopIndex,
    animate,
    duration,
    // A selection must take the camera immediately; road warming can happen
    // after the selected stop is already on screen.
    preload: false,
    loadingLocationName: stop.name,
    onComplete: () => {
      applyMapInteractionLocks();
      applyToggleState(getToggleState());
      renderCityLabels();
      if (initial) finishInitialRouteLoading();
      onComplete?.();
    },
    onCancel
  });
  updateExplicitNavigationControls?.();
  return true;
}

function showInitialJourneyStop() {
  const preferredTripIndex = state.trips.findIndex(trip => synchronizeTripStops(trip).some(stop => /\bedmond\b/i.test(stop?.name || "")));
  if (preferredTripIndex >= 0) {
    const preferredStops = synchronizeTripStops(state.trips[preferredTripIndex]);
    const preferredStopIndex = preferredStops.findIndex(stop => /\bedmond\b/i.test(stop?.name || ""));
    if (state.activeTripIndex !== preferredTripIndex) {
      selectTrip(preferredTripIndex, { stopIndex: preferredStopIndex, overview: false, animate: false });
      return;
    }
    selectedStopIndex = preferredStopIndex;
  } else {
    selectedStopIndex = 0;
  }
  if (!focusJourneyStop(selectedStopIndex, { animate: false, initial: true })) setOverviewMode();
}

function primaryPlaybackNavigation(direction) {
  if (state.contiguousUsMode) {
    const target = state.trips[state.activeTripIndex + direction];
    return { scope: "journey", disabled: !target, label: target?.name || (direction < 0 ? "First journey" : "Last journey") };
  }
  if (state.overviewMode) {
    const target = state.routes[state.activeRouteIndex + direction];
    return { scope: "route", disabled: !target, label: target?.label || (direction < 0 ? "First route" : "Last route") };
  }
  const stops = synchronizeTripStops(activeTrip());
  const target = stops[selectedStopIndex + direction];
  return { scope: "stop", disabled: !target, label: target?.name || (direction < 0 ? "First stop" : "Last stop") };
}

function renderPrimaryPlaybackButton(button, navigation) {
  if (!button || !navigation) return;
  const command = button.querySelector(".playback-command");
  const target = button.querySelector(".playback-target");
  const type = navigation.scope === "journey" ? "Journey" : navigation.scope === "route" ? "Route" : "Stop";
  if (command) command.textContent = button === els.reverseRoute ? "Previous" : "Next";
  if (target) target.textContent = navigation.label || type;
  button.title = `${button === els.reverseRoute ? "Show previous" : "Show next"} ${type.toLowerCase()}: ${navigation.label || type}`;
}

function showInitialUsOverview() {
  selectedStopIndex = 0;
  if (state.trips.some(trip => trip.days?.length)) {
    enterUsOverview({ initial: true });
  } else {
    showInitialJourneyStop();
  }
}

function moveToDay(index, journeyProgress = null) {
  const route = state.routes[index];
  if (!route) return;
  const previousIndex = state.activeRouteIndex;
  const previousRoute = state.routes[previousIndex];
  const loadingLocationName = index > previousIndex
    ? endpointJumpLocation(previousRoute, "end")
    : index < previousIndex
      ? endpointJumpLocation(previousRoute, "start")
      : endpointJumpLocation(route, "start");
  closeJourneyMedia();
  setActiveRoute(index, false, false);
  if (Number.isFinite(journeyProgress)) {
    state.playback.progress = clamp(journeyProgress, 0, 1);
    state.playback.hasStarted = true;
    applyToggleState(getToggleState());
    renderPlayback();
  }
  moveToBounds(routeLatLngBounds(route), {
    paddingTopLeft: [54, 42],
    paddingBottomRight: [54, 42],
    loadingLocationName,
    onComplete: () => {
      applyMapInteractionLocks();
      applyToggleState(getToggleState());
      if (!Number.isFinite(journeyProgress) || journeyProgress <= 0.0001) {
        openStartOfDayMedia(route);
      }
    }
  });
  updateExplicitNavigationControls?.();
}

// Playback is deliberately a small state machine.  A session is an immutable
// stop-to-stop command; map and camera code only present it and never decide
// where it should go next.  This replaces the former chain of camera callbacks
// that could silently lose a Next/Previous click until another map event fired.
function clearPlaybackSession({ keepProgress = false } = {}) {
  cancelRouteAnimationPresentation();
  state.playback.requestId = (Number(state.playback.requestId) || 0) + 1;
  if (state.playback.frameId) cancelAnimationFrame(state.playback.frameId);
  state.playback.frameId = null;
  state.playback.active = false;
  state.playback.transitioning = false;
  state.playback.pendingDirection = null;
  state.playback.lastTime = null;
  state.playback.targetProgress = null;
  state.playback.targetMediaId = null;
  state.playback.session = null;
  playbackGroup.clearLayers();
  state.playback.layer = null;
  state.playback.icon = null;
  if (!keepProgress) state.playback.hasStarted = false;
}

function displayPlaybackLeg(leg) {
  const route = state.routes[leg.routeIndex];
  if (!route) return false;
  clearOverviewHoverTimer?.();
  closeJourneyMedia();
  state.overviewMode = false;
  state.contiguousUsMode = false;
  state.overviewFocusIndex = null;
  state.overviewFocusZoom = null;
  state.activeRouteIndex = leg.routeIndex;
  state.points = route.points;
  state.displayPoints = route.displayPoints;
  state.title = route.label || route.title;
  playbackGroup.clearLayers();
  state.playback.layer = null;
  state.playback.icon = null;
  renderRoute(false);
  return true;
}

function playbackTargetIndex(targets, progress, direction) {
  const epsilon = 0.0005;
  if (direction > 0) return targets.findIndex(target => target.progress > progress + epsilon);
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    if (targets[index].progress < progress - epsilon) return index;
  }
  return -1;
}

function launchPlaybackSession(session, targetIndex) {
  const target = session.targets[targetIndex];
  if (!target || state.playback.session !== session) return false;
  session.phase = "running";
  session.targetIndex = targetIndex;
  state.playback.direction = session.leg.direction;
  state.playback.active = true;
  state.playback.hasStarted = true;
  state.playback.lastTime = null;
  state.playback.targetProgress = target.progress;
  state.playback.targetMediaId = target.mediaId || null;
  state.playback.followLastPanAt = 0;
  state.playback.followPanUntil = 0;
  state.playback.followCenter = null;
  state.playback.followZoom = null;
  lastStickerPlaybackProgress = state.playback.progress;
  // Re-evaluate route sticker triggers now that playback is genuinely active.
  // Before this point the route framing may have rendered every sticker.
  renderStickers?.();
  if (typeof sfxPlayEvent === "function") sfxPlayEvent(session.leg.direction > 0 ? "route.start" : "route.reverse");
  applyToggleState(getToggleState());
  // Replace the pre-animation full route before creating the partial line.
  // This prevents two renderers from briefly showing different geometries.
  renderRoute(false);
  renderPlayback();
  setPlaybackButtons();
  state.playback.frameId = requestAnimationFrame(stepPlayback);
  return true;
}

function routePlaybackCameraDuration() {
  const speed = clamp(Number(els.playbackSpeed?.value) || 1, 0.5, 2);
  return clamp(ROUTE_FIT_DURATION / speed, 0.55, 2.4);
}

function routePlaybackCameraBeat(duration) {
  // Keep a readable pause after the frame settles, scaled to the chosen
  // speed instead of feeling identical at every playback rate.
  return Math.round(clamp(duration * 1000 * 0.5, 650, 1400));
}

function presentPlaybackRoute(session, onReady) {
  const route = state.routes[session.leg.routeIndex];
  if (!route) return onReady?.();
  // The camera gets a bounded, visible head start.  The session is already
  // sealed, so the callback can only launch this exact leg; it cannot select a
  // different route or leave navigation dependent on a later map nudge.
  const locationName = endpointJumpLocation(route, session.leg.direction > 0 ? "start" : "end");
  const cameraDuration = routePlaybackCameraDuration();
  showMapLoadingOverlay({ text: "Loading route...", locationName });
  const jumpImageStartedAt = Date.now();
  const jumpImageMinimumMs = 3000;
  let finished = false;
  const finish = () => {
    if (finished || state.playback.session !== session) return;
    finished = true;
    window.clearTimeout(fallbackTimer);
    const remainingJumpImageMs = Math.max(0, jumpImageMinimumMs - (Date.now() - jumpImageStartedAt));
    fadeMapLoadingOverlay({ minRemaining: remainingJumpImageMs });
    // The overlay takes 560ms to finish fading. Wait until it is completely
    // gone, then leave the fully framed, fully loaded map visible for one
    // deliberate beat before the first moving-route frame is rendered.
    window.setTimeout(() => {
      if (state.playback.session === session) onReady?.();
    }, remainingJumpImageMs + 560 + routePlaybackCameraBeat(cameraDuration));
  };
  const fallbackTimer = window.setTimeout(finish, 30000);
  const destinationStop = synchronizeTripStops(activeTrip())[session.leg.toStopIndex];
  const routeBounds = routeLatLngBounds(route);
  const routeView = routeBounds?.isValid()
    ? viewForBounds(routeBounds, { paddingTopLeft: [54, 42], paddingBottomRight: [54, 42] })
    : null;
  const savedDestinationView = normalizeSavedMapView(destinationStop?.savedView);
  const destinationView = savedDestinationView
    ? { center: L.latLng(savedDestinationView.lat, savedDestinationView.lon), zoom: savedDestinationView.zoom }
    : Number.isFinite(destinationStop?.lat) && Number.isFinite(destinationStop?.lon)
      ? { center: L.latLng(destinationStop.lat, destinationStop.lon), zoom: clamp(10, map.getMinZoom(), map.getMaxZoom()) }
      : null;
  // Preload the current, route, and destination views before moving the
  // camera. This keeps every part of the visible pan prepared behind the jump
  // image and prevents the route from outrunning its tiles or road layers.
  const warmViews = [
    { center: map.getCenter(), zoom: map.getZoom() },
    routeView,
    destinationView
  ]
    .filter(view => view?.center && Number.isFinite(view.zoom));
  const beginCamera = () => {
    if (state.playback.session !== session) return;
    try {
    const mode = routeCameraMode();
    if (mode === "static") {
      void waitForMapElementsReady({ timeout: 20000, minDelay: 120 }).finally(finish);
      return;
    }
    if (mode === "follow") {
      moveToRouteFollowView(route, state.playback.progress, session.leg.direction, finish, cameraDuration);
      return;
    }
    const saved = mode === "saved" ? normalizeSavedMapView(route.savedView) : null;
    if (saved) {
      moveToView(L.latLng(saved.lat, saved.lon), saved.zoom, {
        loadingLocationName: locationName,
        duration: cameraDuration,
        mapReadyTimeout: 20000,
        preload: false,
        onComplete: finish,
        onCancel: finish
      });
      return;
    }
    moveToBounds(routeLatLngBounds(route), {
      paddingTopLeft: [54, 42],
      paddingBottomRight: [54, 42],
      loadingLocationName: locationName,
      duration: cameraDuration,
      mapReadyTimeout: 20000,
      preload: false,
      onComplete: finish,
      onCancel: finish
    });
  } catch {
    finish();
  }
  };
  void Promise.allSettled(warmViews.map(view => preloadRoadsWithTimeout(view.center, view.zoom, 7000)))
    .finally(beginCamera);
}

function finishJourneyTarget() {
  const session = state.playback.session;
  if (!session || session.phase !== "running") return;
  const target = session.targets[session.targetIndex];
  const route = state.routes[session.leg.routeIndex];
  if (!target || !route) {
    clearPlaybackSession({ keepProgress: true });
    setPlaybackButtons();
    return;
  }
  state.playback.active = false;
  state.playback.frameId = null;
  state.playback.lastTime = null;
  state.playback.targetProgress = null;
  state.playback.targetMediaId = null;

  if (target.kind === "media") {
    session.phase = "paused";
    const item = route.media.find(media => media.id === target.mediaId);
    if (item) openJourneyMedia(item);
    setPlaybackButtons();
    updateExplicitNavigationControls?.();
    return;
  }

  if (session.tripAnimation) {
    const nextRouteIndex = session.leg.routeIndex + 1;
    if (nextRouteIndex < state.routes.length) {
      beginTripAnimationRoute(nextRouteIndex);
      return;
    }
    stopPlayback();
    renderRoute(false);
    renderPlayback();
    setPlaybackButtons();
    return;
  }

  if (typeof sfxPlayEvent === "function") {
    sfxPlayEvent("route.complete");
    sfxPlayEvent("stop.reached");
  }
  const destination = session.leg.toStopIndex;
  clearPlaybackSession();
  refreshEndpointMarkers();
  applyToggleState(getToggleState());
  // Corridor mode owns a continuous camera path. Reframing the destination
  // stop here used to create a final, jarring route-view → stop-view jump.
  focusJourneyStop(destination, {
    animate: true,
    duration: routePlaybackCameraDuration(),
    preserveCamera: routeCameraFollowsIcon()
  });
  if (session.leg.direction > 0 && userStoryProgress?.started) {
    userStoryProgress.startMediaSeen = false;
    saveUserStoryProgress?.();
  }
  setPlaybackButtons();
  updateExplicitNavigationControls?.();
}

function stepPlayback(timestamp) {
  const session = state.playback.session;
  if (!state.playback.active || !session || session.phase !== "running") return;
  if (state.activeRouteIndex !== session.leg.routeIndex) {
    clearPlaybackSession();
    setPlaybackButtons();
    return;
  }
  if (!state.playback.lastTime) {
    state.playback.lastTime = timestamp;
    state.playback.frameId = requestAnimationFrame(stepPlayback);
    return;
  }
  const elapsed = timestamp - state.playback.lastTime;
  state.playback.lastTime = timestamp;
  const target = session.targets[session.targetIndex];
  const speed = Number(els.playbackSpeed.value) || 1;
  const next = state.playback.progress + session.leg.direction * elapsed * 0.00012 * speed;
  state.playback.progress = session.leg.direction > 0
    ? Math.min(target.progress, next)
    : Math.max(target.progress, next);
  renderPlayback();
  refreshStickerTriggersForPlayback?.(state.playback.progress);
  updateRouteFollowCamera(activeRoute(), state.playback.progress, timestamp);
  if (Math.abs(state.playback.progress - target.progress) < 0.00001) {
    finishJourneyTarget();
    return;
  }
  state.playback.frameId = requestAnimationFrame(stepPlayback);
}

function resumePausedPlayback(session) {
  const nextIndex = session.targetIndex + session.leg.direction;
  if (!launchPlaybackSession(session, nextIndex)) {
    clearPlaybackSession({ keepProgress: true });
    setPlaybackButtons();
    return false;
  }
  return true;
}

// This is the only public command for a stop-to-stop transition.  Repeated
// clicks do not queue, change speed, or calculate a new route from transient
// map state.  A paused route-media event is the one intentional continuation.
function requestJourneyStep(direction) {
  const normalizedDirection = direction < 0 ? -1 : 1;
  const existing = state.playback.session;
  if (existing) {
    if (existing.phase === "paused" && existing.leg.direction === normalizedDirection) {
      return resumePausedPlayback(existing);
    }
    return false;
  }
  const stops = synchronizeTripStops(activeTrip());
  const sourceStopIndex = selectedStopIndex;
  const routeIndex = normalizedDirection > 0 ? sourceStopIndex : sourceStopIndex - 1;
  const destination = sourceStopIndex + normalizedDirection;
  if (!stops[sourceStopIndex] || !stops[destination] || routeIndex < 0 || routeIndex >= state.routes.length) return false;

  clearPlaybackSession();
  // A playback command replaces the stop view immediately.  Even Static
  // camera mode must not allow an already-running stop flyTo to continue.
  cancelPendingCameraMove({ notify: false });
  const leg = Object.freeze({ routeIndex, fromStopIndex: sourceStopIndex, toStopIndex: destination, direction: normalizedDirection });
  if (!displayPlaybackLeg(leg)) return false;
  selectedStopIndex = sourceStopIndex;
  state.playback.progress = normalizedDirection > 0 ? 0 : 1;
  const session = {
    id: state.playback.requestId,
    leg,
    targets: journeyTargets(activeRoute()),
    points: Object.freeze((activeRoute()?.displayPoints || []).map(point => Object.freeze({ lat: point.lat, lon: point.lon }))),
    targetIndex: -1,
    phase: "starting"
  };
  state.playback.session = session;
  const targetIndex = playbackTargetIndex(session.targets, state.playback.progress, normalizedDirection);
  if (targetIndex < 0) {
    clearPlaybackSession();
    setPlaybackButtons();
    return false;
  }
  session.phase = "framing";
  setPlaybackButtons();
  presentPlaybackRoute(session, () => launchPlaybackSession(session, targetIndex));
  return true;
}

// Retained as the route-toolbar API.  It deliberately delegates to the same
// command as every visible Next/Previous button, so there is no second engine.
function startPlayback(direction) {
  if (!activeRoute()) return false;
  if (state.playback.session) stopPlayback();
  selectedStopIndex = direction < 0
    ? clamp(state.activeRouteIndex + 1, 0, Math.max(0, state.routes.length))
    : clamp(state.activeRouteIndex, 0, Math.max(0, state.routes.length - 1));
  return requestJourneyStep(direction);
}

function beginTripAnimationRoute(routeIndex) {
  const route = state.routes[routeIndex];
  if (!route) return false;
  state.activeRouteIndex = routeIndex;
  state.points = route.points;
  state.displayPoints = route.displayPoints;
  state.title = route.label || route.title;
  state.playback.progress = 0;
  state.playback.hasStarted = true;
  playbackGroup.clearLayers();
  state.playback.layer = null;
  state.playback.icon = null;
  const session = {
    id: (Number(state.playback.requestId) || 0) + 1,
    leg: Object.freeze({ routeIndex, fromStopIndex: routeIndex, toStopIndex: routeIndex + 1, direction: 1 }),
    targets: [{ progress: 1, kind: "end" }],
    points: Object.freeze((route.displayPoints || []).map(point => Object.freeze({ lat: point.lat, lon: point.lon }))),
    targetIndex: 0,
    phase: "running",
    tripAnimation: true
  };
  state.playback.requestId = session.id;
  state.playback.session = session;
  state.playback.direction = 1;
  state.playback.active = true;
  state.playback.lastTime = null;
  state.playback.targetProgress = 1;
  state.playback.targetMediaId = null;
  renderPlayback();
  setPlaybackButtons();
  state.playback.frameId = requestAnimationFrame(stepPlayback);
  return true;
}

function startTripAnimation() {
  if (!state.contiguousUsMode || !state.routes.length) return;
  if (state.playback.tripAnimation) {
    stopPlayback();
    renderRoute(false);
    return;
  }
  stopPlayback();
  state.playback.tripAnimation = true;
  state.playback.tripRouteVisible = routeDisplayVisible;
  routeDisplayVisible = false;
  selectedStopIndex = 0;
  state.playback.followLastPanAt = 0;
  state.playback.followPanUntil = 0;
  state.playback.followCenter = null;
  applyToggleState(getToggleState());
  renderRoute(false);
  beginTripAnimationRoute(0);
}
