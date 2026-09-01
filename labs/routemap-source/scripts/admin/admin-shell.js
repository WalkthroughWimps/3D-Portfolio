"use strict";

const SECTION_COLOR_OPTIONS = Object.freeze([
  { id: "red", label: "Red" }, { id: "orange", label: "Orange" },
  { id: "yellow", label: "Yellow" }, { id: "green", label: "Green" },
  { id: "teal", label: "Teal" }, { id: "blue", label: "Blue" },
  { id: "violet", label: "Violet" }, { id: "pink", label: "Pink" },
  { id: "brown", label: "Brown" }, { id: "black", label: "Black" },
  { id: "grey", label: "Grey" }, { id: "white", label: "White" }
]);
const PANEL_SECTION_COLOR_COUNT = SECTION_COLOR_OPTIONS.length;
const SECTION_COLOR_PALETTE = Object.freeze([
  { tint: "#fff2f0", accent: "#c44f45", darkAccent: "#ff9387" }, { tint: "#fff3e4", accent: "#b96820", darkAccent: "#ffab61" },
  { tint: "#fff9df", accent: "#a98213", darkAccent: "#f3cc4e" }, { tint: "#eff9ed", accent: "#47884d", darkAccent: "#89d38d" },
  { tint: "#e8fbf8", accent: "#168b83", darkAccent: "#6ed8cf" }, { tint: "#eff7ff", accent: "#397cb4", darkAccent: "#83c7fb" },
  { tint: "#f6f0ff", accent: "#7656b5", darkAccent: "#bda0f4" }, { tint: "#fff0f6", accent: "#c45080", darkAccent: "#ff9fbe" },
  { tint: "#f5ece4", accent: "#7e5134", darkAccent: "#d7a57d" }, { tint: "#edf0f2", accent: "#1c2b33", darkAccent: "#aebdc4" },
  { tint: "#f1f3f4", accent: "#6d767b", darkAccent: "#c5cdd1" }, { tint: "#ffffff", accent: "#bfcbd1", darkAccent: "#ffffff" }
]);

let dropdownWheelQuietUntil = 0;
let dropdownWheelLastChange = 0;
const dropdownWheelHoverStarted = new WeakMap();
let panelTabExitTimer = 0;
let pendingPanelTabTransition = null;

function initializeDropdownWheelNavigation() {
  dropdownWheelQuietUntil = performance.now() + 2000;
  document.addEventListener("pointerover", event => {
    const select = event.target instanceof Element ? event.target.closest("select") : null;
    if (!select || select.disabled || dropdownWheelHoverStarted.has(select)) return;
    dropdownWheelHoverStarted.set(select, performance.now());
  }, true);
  document.addEventListener("pointerout", event => {
    const select = event.target instanceof Element ? event.target.closest("select") : null;
    if (!select || select.contains(event.relatedTarget)) return;
    dropdownWheelHoverStarted.delete(select);
  }, true);
  document.addEventListener("wheel", event => {
    const now = performance.now();
    const select = event.target instanceof Element ? event.target.closest("select") : null;
    if (!select || select.disabled) {
      dropdownWheelQuietUntil = now + 2000;
      return;
    }
    const hoverStarted = dropdownWheelHoverStarted.get(select) ?? now;
    dropdownWheelHoverStarted.set(select, hoverStarted);
    const readyAt = Math.max(dropdownWheelQuietUntil, hoverStarted) + 500;
    if (now < readyAt) {
      dropdownWheelQuietUntil = now + 2000;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (now - dropdownWheelLastChange < 140 || !event.deltaY) return;
    const direction = event.deltaY > 0 ? 1 : -1;
    let nextIndex = select.selectedIndex;
    do {
      nextIndex += direction;
    } while (nextIndex >= 0 && nextIndex < select.options.length && select.options[nextIndex].disabled);
    if (nextIndex < 0 || nextIndex >= select.options.length || nextIndex === select.selectedIndex) return;
    dropdownWheelLastChange = now;
    select.selectedIndex = nextIndex;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, { capture: true, passive: false });
}

function initializePanelScrollContainment() {
  const rail = document.querySelector(".panel-tab-panels");
  if (!rail || rail.dataset.scrollContainmentInitialized === "true") return;
  rail.dataset.scrollContainmentInitialized = "true";
  // Leaflet listens globally for wheel gestures.  Keep a gesture that begins
  // inside the editor rail with the rail, particularly on the Media tab.
  rail.addEventListener("wheel", event => {
    if (activePanelTabId() === "media") event.stopPropagation();
  }, { capture: true, passive: true });
}

function isEditorSite() {
  return appState.siteMode !== "user";
}

function activePanelTabId() {
  return panelTabs.find(tab => tab.getAttribute("aria-selected") === "true")?.dataset.panelTab || "map-ui";
}

function isUsersBuilderMode() {
  return isEditorSite() && activePanelTabId() === "users";
}

function setPanelTab(tabId, { afterSecondaryExit = false, previewOpenAfterExit = null } = {}) {
  const previousTabId = activePanelTabId();
  const nextTabId = panelTabs.some(tab => tab.dataset.panelTab === tabId) ? tabId : "map-ui";
  // A running exit owns the stage.  Retarget it rather than letting a second
  // click reveal a destination panel halfway through the current exit.
  if (pendingPanelTabTransition && !afterSecondaryExit) {
    pendingPanelTabTransition.nextTabId = nextTabId;
    return;
  }
  const changingTabs = previousTabId !== nextTabId;
  // Media previews belong to the current map context. They must never leak
  // into a different authoring tab, even if a tab switch is triggered by code.
  if (changingTabs && !els.mediaViewer?.hidden) closeJourneyMedia?.();
  // Trips → Animation is the reference: recognize an outgoing panel by its
  // rendered accessibility state as well as its animation class.
  const previewIsOpen = !els.imagePreviewDrawer?.hidden
    && els.imagePreviewDrawer?.getAttribute("aria-hidden") !== "true";
  const themesDrawerIsOpen = !els.elementsStyleDrawer?.hidden
    && els.elementsStyleDrawer?.getAttribute("aria-hidden") !== "true";
  const nextSupportsPreview = nextTabId === "map-ui" || nextTabId === "trips";
  const previewStates = rvStorageReadJson("rv-map-secondary-preview-state-v2", {}) || {};
  // Any open secondary drawer hands off as open. This makes Themes →
  // Animation/Trips use the exact same transaction as Animation → Trips,
  // while a deliberately closed destination preview remains closed.
  const nextPreviewOpen = nextSupportsPreview && (previewIsOpen || previewStates[nextTabId] !== false);
  // Animation ↔ Trips defines the shared secondary-panel handoff: an outgoing
  // panel always finishes its exit before *any* destination tab is shown.
  if (changingTabs && !afterSecondaryExit && (previewIsOpen || themesDrawerIsOpen)) {
    const previewWasOpen = previewIsOpen;
    pendingPanelTabTransition = { nextTabId, previewWasOpen };
    if (previewWasOpen) setImagePreviewDrawerOpen(false, {
      animate: true,
      refresh: false,
      persist: false,
      fullTurn: nextPreviewOpen,
      fullTurnTargetOpen: nextPreviewOpen
    });
    if (themesDrawerIsOpen) setElementsDrawerOpen(false, {
      animate: true,
      fullTurn: nextPreviewOpen,
      fullTurnTargetOpen: nextPreviewOpen
    });
    clearTimeout(panelTabExitTimer);
    // This is deliberately longer than the 460 ms drawer exit so the next
    // tab cannot mount a second drawer while the old one is still painted.
    panelTabExitTimer = window.setTimeout(() => {
      const transition = pendingPanelTabTransition;
      pendingPanelTabTransition = null;
      if (!transition) return;
      const targetSupportsPreview = transition.nextTabId === "map-ui" || transition.nextTabId === "trips";
      setPanelTab(transition.nextTabId, {
        afterSecondaryExit: true,
        previewOpenAfterExit: targetSupportsPreview && (transition.previewWasOpen
          || (rvStorageReadJson("rv-map-secondary-preview-state-v2", {}) || {})[transition.nextTabId] !== false)
      });
    }, 520);
    return;
  }
  if (previousTabId === "users" && nextTabId !== "users") saveUserAuthoredViewport?.();
  document.body.classList.toggle("media-builder-mode", isEditorSite() && nextTabId === "media");
  panelTabs.forEach(tab => {
    tab.setAttribute("aria-selected", tab.dataset.panelTab === nextTabId ? "true" : "false");
  });
  panelTabPanels.forEach(panel => {
    panel.hidden = panel.dataset.panelTabPanel !== nextTabId;
  });
  if (nextTabId === "users" && previousTabId !== "users") restoreUserAuthoredViewport?.();
  // Themes' layer drawer is deliberately transient: it always starts closed
  // when Themes is selected, without playing a close animation during a tab swap.
  if (nextTabId === "elements") setElementsDrawerOpen(false, { animate: false });
  if (nextTabId !== "trips") {
    pendingMediaPinId = null;
    els.mapCanvas.classList.remove("is-placing-media-pin");
  }
  if (nextTabId === "users") {
    if (userRecordState.active || userRecordState.sessionIds.length) stopUserRecordMode();
    renderUsersPanelRegistryPreview();
  }
  updateRecordedControlsWorkflow();
  renderMediaMarkers();
  positionRouteThemePicker();
  updateSecondaryPanelAvailability(previousTabId, { previewOpenAfterExit });
  updateUsersBuilderWorkspace();
  renderMediaStyleEditor();
  renderSplashMediaPreview?.();
  syncMapAfterPanelLayoutChange();
  updateExplicitNavigationControls?.();
}

function updateRecordedControlsWorkflow() {
  if (els.usersStagingAdminPanel) els.usersStagingAdminPanel.hidden = true;
  closeUserPlacementMenu();
  closeUserControlPlacementMenu();
  updateUsersBuilderWorkspace();
}

let userPreviewEditorCamera = null;

function restoreUserPreviewCamera(camera) {
  if (!camera || !map) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    map.invalidateSize({ animate: false });
    map.setView(camera.center, camera.zoom, { animate: false });
  }));
}

function frameUserPreviewMap() {
  if (!map) return;
  // The map container is nested inside the authored viewport.  Its size changes
  // after the mode class is applied, so fit only after each relevant layout pass
  // has settled.  Fitting the outer device, or fitting before the nested canvas
  // has resized, is what made the public view drift from the editor guide.
  const fit = () => {
    if (appState.siteMode !== "user") return;
    const bounds = journeyViewportLeafletBounds?.(activeJourneyViewportCorners?.(userDevicePreviewMode));
    if (!bounds?.isValid?.()) return;
    map.invalidateSize({ animate: false });
    // The guide's geographic edges are usually between integer zoom levels.
    // `fitBounds` otherwise rounds them to Leaflet's normal zoom snap (1),
    // making the USER crop visibly wider or taller than the editor rectangle.
    const zoomSnap = map.options.zoomSnap;
    map.options.zoomSnap = 0;
    map.fitBounds(bounds, { animate: false, padding: [0, 0] });
    map.options.zoomSnap = zoomSnap;
    syncMapLibreToLeaflet?.(null, { resize: true });
    const viewportRect = els.userMapViewport?.getBoundingClientRect?.();
    const mapRect = map.getContainer?.().getBoundingClientRect?.();
    globalThis.rvViewportTransferDiagnostic = {
      editor: { source: "saved journey/device GPS corners" },
      user: {
        viewport: viewportRect && { x: viewportRect.left, y: viewportRect.top, width: viewportRect.width, height: viewportRect.height },
        map: mapRect && { x: mapRect.left, y: mapRect.top, width: mapRect.width, height: mapRect.height },
        center: map.getCenter(), zoom: map.getZoom()
      },
      device: userDevicePreviewMode,
      authored: readUserAuthoredViewport?.(userDevicePreviewMode) || null
    };
    console.debug("[RV viewport transfer]", globalThis.rvViewportTransferDiagnostic);
  };
  requestAnimationFrame(() => requestAnimationFrame(fit));
  [90, 260, 560].forEach(delay => window.setTimeout(fit, delay));
}

function hideSiteModeSwapLoadingSurfaces() {
  // A mode swap is only a comparison of two renderings of the same state. Hide
  // every startup surface immediately and once more after queued map callbacks.
  const hide = () => {
    if (els.welcomeGate) {
      els.welcomeGate.hidden = true;
      els.welcomeGate.classList.remove("is-dismissed");
    }
    if (els.empty) {
      els.empty.hidden = true;
      els.empty.classList.remove("startup-loading-state", "is-complete", "is-fading");
    }
    setMapElementsLoading?.(false);
  };
  hide();
  [0, 80, 260].forEach(delay => window.setTimeout(hide, delay));
}

function applySiteMode(nextMode = appState.siteMode) {
  const enteringUserPreview = nextMode === "user" && appState.siteMode !== "user";
  const returningToEditor = nextMode !== "user" && appState.siteMode === "user";
  // Capture only the non-UI editor guide. The UI tab is a layout canvas and
  // must never become a second geographic source for the public map.
  if (enteringUserPreview) saveActiveJourneyViewportForDevice?.(userDevicePreviewMode, els.editorPreviewGuideViewport);
  if (enteringUserPreview && map) userPreviewEditorCamera = { center: map.getCenter(), zoom: map.getZoom() };
  globalThis.rvSuppressLoadingSurfaces = enteringUserPreview || returningToEditor;
  updateAppState({ siteMode: RV_RUNTIME_ENVIRONMENT.publicSite ? "user" : nextMode });
  document.body.classList.toggle("public-site-build", RV_RUNTIME_ENVIRONMENT.publicSite);
  document.body.classList.toggle("labs-local-only", RV_RUNTIME_ENVIRONMENT.labsLocalOnly);
  document.body.classList.toggle("user-site-mode", appState.siteMode === "user");
  document.body.classList.toggle("edit-site-mode", appState.siteMode !== "user");
  document.body.classList.remove("users-builder-mode");
  if (els.siteModeToggle) {
    const userMode = appState.siteMode === "user";
    els.siteModeToggle.textContent = userMode ? "BACK TO EDITOR" : "USER site";
    els.siteModeToggle.setAttribute("aria-pressed", String(userMode));
  }
  // Switching between editor and User preview is never an application load.
  if (enteringUserPreview || returningToEditor) {
    welcomeGateDismissed = true;
    if (welcomeGateTimer) { window.clearInterval(welcomeGateTimer); welcomeGateTimer = 0; }
    hideSiteModeSwapLoadingSurfaces();
  }
  document.querySelector("#sfxConsentDialog")?.setAttribute("hidden", "");
  if (appState.siteMode === "user") {
    setElementsDrawerOpen(false, { animate: false });
    els.stylePanel.hidden = true;
    closeRouteThemePicker?.();
    // Previewing is a live inspection of the current map, never a fresh
    // visitor session: keep its camera, journey, and stop exactly in place.
  } else {
    setUserThemePanelOpen(false);
    setUserMaterialPanelOpen(false);
  }
  renderMediaMarkers();
  renderCityLabels();
  refreshEndpointMarkers();
  renderRouteAnimationStartIcon();
  applyMapInteractionLocks();
  updateRecordedControlsWorkflow();
  renderUserSiteControls();
  updateUsersBuilderWorkspace();
  updateUserDeviceFrameVisibility();
  syncMapAfterPanelLayoutChange();
  if (enteringUserPreview) frameUserPreviewMap();
  if (returningToEditor) restoreUserPreviewCamera(userPreviewEditorCamera);
  updateExplicitNavigationControls?.();
}

function panelForTabId(tabId) {
  return panelTabPanels.find(panel => panel.dataset.panelTabPanel === tabId) || null;
}

function tabIdForPanel(panel) {
  return panel?.dataset.panelTabPanel || null;
}

// The theme picker lives inside the Map Styles tab for layout, but it is a
// fixed overlay rather than a stack section. Keep it out of every section
// operation so it cannot create phantom positions or disabled move buttons.
function managedPanelSections(panel) {
  return [...(panel?.querySelectorAll?.(":scope > .panel-section") || [])]
    .filter(section => !section.classList.contains("route-theme-section"));
}

function panelSectionId(section, index = 0) {
  if (section.dataset.panelSectionId) return section.dataset.panelSectionId;
  const panel = section.closest("[data-panel-tab-panel]");
  const tabId = tabIdForPanel(panel) || "panel";
  const label = section.querySelector(":scope > .section-label, :scope > .eyebrow, :scope > .section-collapse-button .section-collapse-title");
  const title = label?.textContent?.trim() || section.getAttribute("aria-label") || section.id || `section-${index}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `section-${index}`;
  section.dataset.panelSectionId = `${tabId}:${section.id || slug}`;
  return section.dataset.panelSectionId;
}

function readPanelSectionOrder() {
  const parsed = rvStorageReadJson(PANEL_SECTION_ORDER_KEY, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function readPinnedPanelSection() {
  const value = rvStorageReadJson(PANEL_SECTION_PIN_KEY, null);
  return value && typeof value.sectionId === "string" && ["top", "bottom"].includes(value.position) ? value : null;
}

function applyPinnedPanelSection() {
  const pinned = readPinnedPanelSection();
  document.querySelectorAll(".panel-section.is-section-pinned-top, .panel-section.is-section-pinned-bottom")
    .forEach(section => section.classList.remove("is-section-pinned-top", "is-section-pinned-bottom"));
  if (!pinned) return;
  const section = [...document.querySelectorAll(".panel-tab-panel > .panel-section")]
    .find((candidate, index) => panelSectionId(candidate, index) === pinned.sectionId);
  if (!section) return;
  const panel = section.closest("[data-panel-tab-panel]");
  const sections = managedPanelSections(panel);
  if (pinned.position === "top") panel.insertBefore(section, sections[0] || null);
  else panel.append(section);
  section.classList.add(pinned.position === "top" ? "is-section-pinned-top" : "is-section-pinned-bottom");
}

function savePanelSectionOrder() {
  const order = Object.fromEntries(panelTabPanels.map(panel => [
    tabIdForPanel(panel),
    managedPanelSections(panel).map(section => panelSectionId(section))
  ]));
  rvStorageWriteJson(PANEL_SECTION_ORDER_KEY, order);
  const groups = Object.fromEntries(panelTabPanels.map(panel => [
    tabIdForPanel(panel),
    Object.fromEntries(managedPanelSections(panel)
      .filter(section => section.dataset.sectionGroup)
      .map(section => [panelSectionId(section), section.dataset.sectionGroup]))
  ]));
  rvStorageWriteJson(PANEL_SECTION_GROUPS_KEY, groups);
  const dividers = Object.fromEntries(panelTabPanels.map(panel => [
    tabIdForPanel(panel),
    Object.fromEntries(managedPanelSections(panel)
      .filter(section => section.dataset.dividerAfter)
      .map(section => [panelSectionId(section), {
        style: section.dataset.dividerAfter,
        color: section.dataset.dividerColor || section.dataset.sectionColor || "0"
      }]))
  ]));
  rvStorageWriteJson(PANEL_SECTION_DIVIDERS_KEY, dividers);
}

function applySavedPanelSectionOrder() {
  const order = readPanelSectionOrder();
  const allSections = [...document.querySelectorAll(".panel-tab-panel > .panel-section")]
    .filter(section => !section.classList.contains("route-theme-section"));
  const byId = new Map(allSections.map((section, index) => [panelSectionId(section, index), section]));
  panelTabPanels.forEach(panel => {
    const tabId = tabIdForPanel(panel);
    const ids = Array.isArray(order[tabId]) ? order[tabId] : [];
    if (!ids.length) return;
    ids.forEach(id => {
      if (!String(id).startsWith(`${tabId}:`)) return;
      const section = byId.get(id);
      if (section) panel.append(section);
    });
    const groups = rvStorageReadJson(PANEL_SECTION_GROUPS_KEY, {}) || {};
    Object.entries(groups[tabId] || {}).forEach(([id, groupId]) => {
      const section = byId.get(id);
      if (section && section.parentElement === panel) section.dataset.sectionGroup = String(groupId);
    });
    const dividers = rvStorageReadJson(PANEL_SECTION_DIVIDERS_KEY, {}) || {};
    Object.entries(dividers[tabId] || {}).forEach(([id, divider]) => {
      const section = byId.get(id);
      if (!section || section.parentElement !== panel) return;
      section.dataset.dividerAfter = String(divider?.style || "thin");
      section.dataset.dividerColor = String(divider?.color || "0");
    });
  });
  applyPinnedPanelSection();
}

// Keep each tab in the order an author normally works.  This is deliberately
// tab-local: it never moves a section to a different tab.  A versioned first
// run preserves later manual rearrangement through the existing section-order
// controls while giving older saved layouts one sensible migration.
const PANEL_SECTION_WORKFLOW_VERSION = "2026-08-21-grouped-controls-v1";
const PANEL_SECTION_WORKFLOW_ORDER = Object.freeze({
  "map-ui": [
    "Map feature selection", "Journey styles", "Overview route controls",
    "Route icon controls", "Route camera animation controls", "Route timeline and sticker animation",
    "Stop marker controls", "Map stickers", "Stickers FX", "Local road files"
  ],
  elements: [
    "Naming conventions", "Section styles", "Map font styles", "Tooltips",
    "Map element toggles", "Route map themes", "Visited states styles",
    "Journey styles", "Overview route controls", "Music tracks", "Sound effects",
    "Map presets", "All UI settings", "Road package downloads"
  ],
  trips: ["Trips", "Journeys", "Stops", "Routes", "Landmarks", "Road package downloads"],
  media: ["Default media style", "Media type style", "Map appearance with media", "Media layout presets"],
  users: [
    "Site in development page", "Site loading screen", "User layout tools",
    "User View Builder", "Gizmos", "Quick-bound Gizmos", "User Panels",
    "Recorded Assignments", "User Layout Placeholder"
  ]
});

// These controls have fixed tab ownership. Repair any persisted drag/drop or
// legacy migration placement before applying order or section chrome.
const FIXED_PANEL_SECTION_OWNERS = Object.freeze({
  "Default media style": "media",
  "Media type style": "media",
  "Map appearance with media": "media",
  "Media layout presets": "media",
  "Site in development page": "users",
  "Site loading screen": "users"
});

function restoreFixedPanelSectionOwnership() {
  Object.entries(FIXED_PANEL_SECTION_OWNERS).forEach(([label, tabId]) => {
    const target = panelForTabId(tabId);
    if (!target) return;
    [...document.querySelectorAll(".panel-tab-panel > .panel-section")]
      .filter(candidate => candidate.getAttribute("aria-label") === label)
      .forEach(section => {
        if (section.parentElement !== target) target.append(section);
      });
  });
}

function applyWorkflowSectionOrder({ force = false } = {}) {
  restoreFixedPanelSectionOwnership();
  if (!force && rvStorageReadJson(PANEL_SECTION_WORKFLOW_VERSION_KEY, "") === PANEL_SECTION_WORKFLOW_VERSION) return false;
  let changed = false;
  panelTabPanels.forEach(panel => {
    const wanted = PANEL_SECTION_WORKFLOW_ORDER[tabIdForPanel(panel)] || [];
    if (!wanted.length) return;
    const sections = [...panel.querySelectorAll(":scope > .panel-section")];
    const rank = section => {
      const label = section.getAttribute("aria-label") || "";
      const index = wanted.indexOf(label);
      return index < 0 ? wanted.length : index;
    };
    const ordered = [...sections].sort((left, right) => rank(left) - rank(right));
    if (ordered.some((section, index) => section !== sections[index])) changed = true;
    ordered.forEach(section => panel.append(section));
  });
  if (changed) savePanelSectionOrder();
  rvStorageWriteJson(PANEL_SECTION_WORKFLOW_VERSION_KEY, PANEL_SECTION_WORKFLOW_VERSION);
  return changed;
}

function updatePanelSectionChrome(liveLoop = null) {
  const storedLoop = liveLoop || globalThis.rvSectionColorLoop || rvStorageReadJson(PANEL_SECTION_COLOR_LOOP_KEY, SECTION_COLOR_OPTIONS.map(option => option.id));
  const colorLoop = Array.isArray(storedLoop)
    ? storedLoop.filter(id => SECTION_COLOR_OPTIONS.some(option => option.id === id))
    : [];
  const activeLoop = colorLoop.length ? colorLoop : SECTION_COLOR_OPTIONS.map(option => option.id);
  const wrapAcrossTabs = rvStorageReadJson(PANEL_SECTION_COLOR_WRAP_TABS_KEY, true) !== false;
  const colorIndexFor = index => SECTION_COLOR_OPTIONS.findIndex(option => option.id === activeLoop[index % activeLoop.length]);
  const applySectionChrome = (section, index, sections, colorIndex) => {
    const paletteIndex = colorIndexFor(colorIndex);
    const palette = SECTION_COLOR_PALETTE[paletteIndex] || SECTION_COLOR_PALETTE[0];
    section.dataset.sectionColor = String(paletteIndex);
    section.dataset.sectionColorId = activeLoop[colorIndex % activeLoop.length];
    // Inline variables make reassignment immediate even when a theme-specific
    // rule or a stale cached stylesheet was previously setting the section.
    const darkMode = document.body.classList.contains("dark-ui-theme");
    const accent = darkMode ? palette.darkAccent : palette.accent;
    section.style.setProperty("--section-accent", accent, "important");
    section.style.setProperty("--section-tint", darkMode
      ? `color-mix(in srgb, var(--panel), ${accent} 25%)`
      : palette.tint, "important");
    const groupId = section.dataset.sectionGroup || "";
    const isGroupLeader = Boolean(groupId) && sections[index - 1]?.dataset.sectionGroup !== groupId;
    section.classList.toggle("is-section-group-member", Boolean(groupId) && !isGroupLeader);
  };
  const applyPanel = panel => {
    const sections = managedPanelSections(panel);
    sections.forEach((section, index) => applySectionChrome(section, index, sections, index));
  };

  let colorCursor = 0;
  panelTabs.forEach(tab => {
    const panel = panelForTabId(tab.dataset.panelTab);
    const sections = managedPanelSections(panel);
    sections.forEach((section, index) => applySectionChrome(section, index, sections, (wrapAcrossTabs ? colorCursor : 0) + index));
    if (wrapAcrossTabs) colorCursor += sections.length;
  });

  // The UI appearance editor is intentionally nested inside the normal Users
  // tab instead of living in its former side panel.  Give those generated
  // accordions the same palette loop immediately, rather than leaving their
  // host's old white-panel styling visible.
  const usersAppearanceSections = [...document.querySelectorAll("#usersAppearanceSections > .panel-section")];
  usersAppearanceSections.forEach((section, index) => {
    applySectionChrome(section, index, usersAppearanceSections, colorCursor + index);
  });

  const mapElements = [...document.querySelectorAll("#panelElements > .panel-section")]
    .find(section => /map elements/i.test(section.getAttribute("aria-label") || section.querySelector(":scope > .section-label")?.textContent || ""));
  const mapElementsColor = Number(mapElements?.dataset.sectionColor);
  if (els.stylePanel) {
    els.stylePanel.dataset.sectionColor = String((Number.isFinite(mapElementsColor) ? mapElementsColor + 1 : 0) % PANEL_SECTION_COLOR_COUNT);
  }
}

function initializePanelTabCustomization() {
  const tabList = document.querySelector(".panel-tabs");
  const recordButton = tabList?.querySelector(".panel-record-button");
  if (!tabList || tabList.dataset.customTabsInitialized === "true") return;
  tabList.dataset.customTabsInitialized = "true";
  const tabs = () => [...tabList.querySelectorAll("[data-panel-tab]")];
  const settings = rvStorageReadJson(PANEL_TAB_SETTINGS_KEY, {}) || {};
  const save = () => {
    settings.order = tabs().map(tab => tab.dataset.panelTab);
    settings.names = Object.fromEntries(tabs().map(tab => [tab.dataset.panelTab, tab.textContent.trim()]));
    rvStorageWriteJson(PANEL_TAB_SETTINGS_KEY, settings);
  };
  const placeTabAndPanel = (tab, before) => {
    tabList.insertBefore(tab, before || recordButton);
    const panel = document.querySelector(`[data-panel-tab-panel="${tab.dataset.panelTab}"]`);
    const beforePanel = before ? document.querySelector(`[data-panel-tab-panel="${before.dataset.panelTab}"]`) : null;
    if (panel?.parentElement) panel.parentElement.insertBefore(panel, beforePanel || null);
  };
  (settings.order || []).forEach(id => {
    const tab = tabs().find(item => item.dataset.panelTab === id);
    if (tab) placeTabAndPanel(tab, recordButton);
  });
  tabs().forEach(tab => {
    const name = settings.names?.[tab.dataset.panelTab];
    if (typeof name === "string" && name.trim()) tab.textContent = name.trim();
    tab.draggable = true;
    tab.addEventListener("contextmenu", event => {
      event.preventDefault();
      const proposed = window.prompt("Tab name", tab.textContent.trim());
      if (proposed === null) return;
      const name = proposed.trim();
      if (!name) return;
      // Tab labels are intentionally local strings, never terminology tokens.
      tab.textContent = name;
      tab.dataset.customTabName = "true";
      save();
    });
    tab.addEventListener("dragstart", event => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-rv-panel-tab", tab.dataset.panelTab);
      tab.classList.add("is-tab-dragging");
    });
    tab.addEventListener("dragend", () => tabs().forEach(item => item.classList.remove("is-tab-dragging", "is-tab-drop-before", "is-tab-drop-after")));
    tab.addEventListener("dragover", event => {
      const id = event.dataTransfer.getData("application/x-rv-panel-tab");
      if (!id || id === tab.dataset.panelTab) return;
      event.preventDefault();
      const before = event.clientX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2;
      tabs().forEach(item => item.classList.remove("is-tab-drop-before", "is-tab-drop-after"));
      tab.classList.add(before ? "is-tab-drop-before" : "is-tab-drop-after");
    });
    tab.addEventListener("drop", event => {
      const id = event.dataTransfer.getData("application/x-rv-panel-tab");
      const dragged = tabs().find(item => item.dataset.panelTab === id);
      if (!dragged || dragged === tab) return;
      event.preventDefault();
      const before = event.clientX < tab.getBoundingClientRect().left + tab.getBoundingClientRect().width / 2;
      placeTabAndPanel(dragged, before ? tab : tab.nextElementSibling);
      save();
      updatePanelSectionChrome();
    });
  });
}

function initializeSectionStyles() {
  const optionsRow = document.querySelector("#sectionColorOptions");
  const loopRow = document.querySelector("#sectionColorLoop");
  const wrapTabsInput = document.querySelector("#sectionColorWrapTabs");
  if (!optionsRow || !loopRow || optionsRow.dataset.initialized === "true") return;
  optionsRow.dataset.initialized = "true";
  initializePanelTabCustomization();
  let colorLoop = rvStorageReadJson(PANEL_SECTION_COLOR_LOOP_KEY, SECTION_COLOR_OPTIONS.map(option => option.id));
  colorLoop = Array.isArray(colorLoop) ? colorLoop.filter(id => SECTION_COLOR_OPTIONS.some(option => option.id === id)) : [];
  const pinnedSlots = document.querySelector("#pinnedSectionColorSlots");
  let pinnedColors = rvStorageReadJson(PINNED_SECTION_COLORS_KEY, {}) || {};
  if (wrapTabsInput) {
    wrapTabsInput.checked = rvStorageReadJson(PANEL_SECTION_COLOR_WRAP_TABS_KEY, true) !== false;
    wrapTabsInput.addEventListener("change", () => {
      rvStorageWriteJson(PANEL_SECTION_COLOR_WRAP_TABS_KEY, wrapTabsInput.checked);
      updatePanelSectionChrome(colorLoop);
    });
  }
  const paletteForId = id => SECTION_COLOR_PALETTE[SECTION_COLOR_OPTIONS.findIndex(option => option.id === id)] || null;
  const applyPinnedColors = () => {
    const root = document.documentElement;
    ["trip", "journey", "stop-day", "route", "tools"].forEach(key => {
      const palette = paletteForId(pinnedColors[key]);
      if (palette) root.style.setProperty(`--pinned-${key}-accent`, palette.accent);
      else root.style.removeProperty(`--pinned-${key}-accent`);
      pinnedSlots?.querySelector(`[data-pinned-color-slot="${key}"]`)?.setAttribute("data-section-color-id", pinnedColors[key] || "");
    });
  };
  const persist = () => { globalThis.rvSectionColorLoop = [...colorLoop]; rvStorageWriteJson(PANEL_SECTION_COLOR_LOOP_KEY, colorLoop); updatePanelSectionChrome(colorLoop); };
  const animateBetweenTiles = (sourceRect, target, id) => {
    if (!sourceRect || !target) return;
    const targetRect = target.getBoundingClientRect();
    const ghost = document.createElement("span"); ghost.className = "section-color-fly"; ghost.dataset.sectionColorId = id;
    ghost.style.left = `${sourceRect.left}px`; ghost.style.top = `${sourceRect.top}px`; ghost.textContent = id.slice(0, 1).toUpperCase(); document.body.append(ghost);
    ghost.animate([{ transform: "translate(0, 0) scale(1)", opacity: .9 }, { transform: `translate(${targetRect.left - sourceRect.left}px, ${targetRect.top - sourceRect.top}px) scale(.88)`, opacity: .35 }], { duration: 260, easing: "cubic-bezier(.2,.8,.25,1)" }).finished.finally(() => ghost.remove());
  };
  const clearDropPreview = () => loopRow.querySelectorAll(".is-color-drop-before, .is-color-drop-after").forEach(tile => tile.classList.remove("is-color-drop-before", "is-color-drop-after"));
  const payload = event => { try { return JSON.parse(event.dataTransfer.getData("application/x-rv-section-color")); } catch { return null; } };
  const addAt = (id, index = colorLoop.length, sourceRect = null) => {
    if (colorLoop.includes(id)) return false;
    colorLoop.splice(Math.max(0, Math.min(index, colorLoop.length)), 0, id); persist(); render();
    requestAnimationFrame(() => animateBetweenTiles(sourceRect, loopRow.querySelector(`[data-section-color-id="${id}"]`), id)); return true;
  };
  const removeId = (id, sourceRect = null) => {
    const index = colorLoop.indexOf(id); if (index < 0) return false;
    colorLoop.splice(index, 1); persist(); render();
    requestAnimationFrame(() => animateBetweenTiles(sourceRect, optionsRow.querySelector(`[data-section-color-id="${id}"]`), id)); return true;
  };
  const moveTo = (id, index) => {
    const from = colorLoop.indexOf(id); if (from < 0) return false;
    colorLoop.splice(from, 1); colorLoop.splice(Math.max(0, Math.min(index, colorLoop.length)), 0, id); persist(); render(); return true;
  };
  const render = () => {
    optionsRow.replaceChildren(); loopRow.replaceChildren();
    SECTION_COLOR_OPTIONS.forEach(option => {
      const assigned = colorLoop.includes(option.id); const tile = document.createElement("button");
      tile.type = "button"; tile.draggable = !assigned; tile.className = "section-color-tile"; tile.dataset.sectionColorId = option.id; tile.dataset.helpIgnore = "true"; tile.setAttribute("aria-label", `Add ${option.label} to color loop`); tile.textContent = option.label.slice(0, 1); tile.classList.toggle("is-assigned", assigned);
      tile.addEventListener("click", () => { if (!assigned) addAt(option.id, colorLoop.length, tile.getBoundingClientRect()); });
      tile.addEventListener("contextmenu", event => { event.preventDefault(); if (assigned) removeId(option.id, tile.getBoundingClientRect()); });
      tile.addEventListener("dragstart", event => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-rv-section-color", JSON.stringify({ id: option.id, source: "options" })); }); optionsRow.append(tile);
    });
    colorLoop.forEach((id, index) => {
      const option = SECTION_COLOR_OPTIONS.find(item => item.id === id); if (!option) return; const tile = document.createElement("button"); tile.type = "button"; tile.draggable = true; tile.className = "section-color-tile is-loop-tile"; tile.dataset.sectionColorId = id; tile.dataset.helpIgnore = "true"; tile.textContent = option.label.slice(0, 1);
      tile.addEventListener("contextmenu", event => { event.preventDefault(); removeId(id, tile.getBoundingClientRect()); });
      tile.addEventListener("dragstart", event => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-rv-section-color", JSON.stringify({ id, source: "loop" })); });
      tile.addEventListener("dragover", event => { const data = payload(event); if (!data || (data.source === "loop" && data.id === id)) return; event.preventDefault(); clearDropPreview(); const before = event.clientX < tile.getBoundingClientRect().left + tile.getBoundingClientRect().width / 2; tile.classList.add(before ? "is-color-drop-before" : "is-color-drop-after"); });
      tile.addEventListener("dragleave", clearDropPreview); tile.addEventListener("drop", event => { const data = payload(event); if (!data) return; event.preventDefault(); const before = event.clientX < tile.getBoundingClientRect().left + tile.getBoundingClientRect().width / 2; const targetIndex = index + (before ? 0 : 1); clearDropPreview(); if (data.source === "options") addAt(data.id, targetIndex); else moveTo(data.id, targetIndex - (colorLoop.indexOf(data.id) < targetIndex ? 1 : 0)); }); loopRow.append(tile);
    });
  };
  loopRow.addEventListener("dragover", event => { const data = payload(event); if (!data) return; event.preventDefault(); clearDropPreview(); });
  loopRow.addEventListener("drop", event => { const data = payload(event); if (!data || event.target.closest(".section-color-tile")) return; event.preventDefault(); if (data.source === "options") addAt(data.id); else moveTo(data.id, colorLoop.length); });
  optionsRow.addEventListener("dragover", event => { const data = payload(event); if (data?.source === "loop") event.preventDefault(); });
  optionsRow.addEventListener("drop", event => { const data = payload(event); if (data?.source !== "loop") return; event.preventDefault(); const source = loopRow.querySelector(`[data-section-color-id="${data.id}"]`); removeId(data.id, source?.getBoundingClientRect()); });
  pinnedSlots?.querySelectorAll("[data-pinned-color-slot]").forEach(slot => {
    slot.addEventListener("dragover", event => { if (payload(event)?.id) event.preventDefault(); });
    slot.addEventListener("drop", event => { const data = payload(event); if (!data?.id) return; event.preventDefault(); pinnedColors[slot.dataset.pinnedColorSlot] = data.id; rvStorageWriteJson(PINNED_SECTION_COLORS_KEY, pinnedColors); applyPinnedColors(); });
    slot.addEventListener("contextmenu", event => { event.preventDefault(); delete pinnedColors[slot.dataset.pinnedColorSlot]; rvStorageWriteJson(PINNED_SECTION_COLORS_KEY, pinnedColors); applyPinnedColors(); });
  });
  globalThis.rvSectionColorLoop = [...colorLoop];
  render(); persist();
  applyPinnedColors();
}

function panelSectionGroupMembers(section) {
  const panel = section?.closest("[data-panel-tab-panel]");
  const groupId = section?.dataset.sectionGroup || "";
  if (!panel || !groupId) return section ? [section] : [];
  const sections = managedPanelSections(panel);
  const index = sections.indexOf(section);
  if (index < 0) return [section];
  const members = [section];
  for (let cursor = index - 1; sections[cursor]?.dataset.sectionGroup === groupId; cursor -= 1) members.unshift(sections[cursor]);
  for (let cursor = index + 1; sections[cursor]?.dataset.sectionGroup === groupId; cursor += 1) members.push(sections[cursor]);
  return members;
}

function movePanelSectionSetBefore(sections, target, before = true) {
  if (!sections.length || !target) return;
  const fragment = document.createDocumentFragment();
  sections.forEach(section => fragment.append(section));
  target.parentElement.insertBefore(fragment, before ? target : target.nextSibling);
}

let panelSectionPointerDrag = null;

function clearPanelSectionDropState() {
  document.querySelectorAll(".panel-section.is-section-drop-before, .panel-section.is-section-drop-after")
    .forEach(section => section.classList.remove("is-section-drop-before", "is-section-drop-after"));
}

function finishPanelSectionDrag() {
  const drag = panelSectionPointerDrag;
  if (drag?.previewTimer) window.clearTimeout(drag.previewTimer);
  drag?.section.classList.remove("is-section-dragging");
  if (drag?.handle?.hasPointerCapture?.(drag.pointerId)) {
    drag.handle.releasePointerCapture(drag.pointerId);
  }
  panelSectionPointerDrag = null;
  clearPanelSectionDropState();
}

function panelSectionDropTarget(panel, movingSections, y, direction = 0) {
  const moving = new Set(movingSections);
  const sections = managedPanelSections(panel).filter(item => !moving.has(item));
  // A group is addressed only through its first section. Hovering one of its
  // joined followers must not split it or make it react prematurely.
  const targets = sections.filter((item, index) => {
    const groupId = item.dataset.sectionGroup || "";
    return !groupId || sections[index - 1]?.dataset.sectionGroup !== groupId;
  });
  const hovered = targets.find(item => {
    const rect = item.getBoundingClientRect();
    return y >= rect.top && y <= rect.bottom;
  });
  if (hovered) {
    const group = panelSectionGroupMembers(hovered);
    // Moving down means the hovered item takes the dragged item's old place
    // immediately. For a joined run, use its tail so the whole run stays
    // together; moving upward retains the conventional insert-before preview.
    return direction > 0
      ? { target: group.at(-1), before: false }
      : { target: group[0], before: true };
  }
  const next = targets.find(item => y < item.getBoundingClientRect().top);
  return next ? { target: next, before: true } : { target: targets.at(-1) || null, before: false };
}

function previewPanelSectionDrop(drag) {
  if (!drag?.target) return;
  movePanelSectionSetBefore(drag.sections, drag.target, drag.before);
  updatePanelSectionChrome();
}

function panelSectionPointerMove(event) {
  const drag = panelSectionPointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
  drag.active = true;
  drag.section.classList.add("is-section-dragging");
  clearPanelSectionDropState();
  const panel = drag.section.parentElement;
  const deltaY = event.clientY - drag.lastY;
  if (deltaY) drag.direction = Math.sign(deltaY);
  drag.lastY = event.clientY;
  const drop = panelSectionDropTarget(panel, drag.sections, event.clientY, drag.direction);
  if (!drop.target) {
    drag.target = null;
    event.preventDefault();
    return;
  }
  drag.target = drop.target;
  drag.before = drop.before;
  drop.target.classList.add(drop.before ? "is-section-drop-before" : "is-section-drop-after");
  if (drag.previewTarget !== drop.target || drag.previewBefore !== drop.before) {
    if (drag.previewTimer) window.clearTimeout(drag.previewTimer);
    drag.previewTarget = drop.target;
    drag.previewBefore = drop.before;
    drag.previewTimer = window.setTimeout(() => {
      if (panelSectionPointerDrag === drag) previewPanelSectionDrop(drag);
    }, 110);
  }
  event.preventDefault();
}

function panelSectionPointerUp(event) {
  const drag = panelSectionPointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (drag.active && drag.target) {
    if (drag.previewTimer) window.clearTimeout(drag.previewTimer);
    previewPanelSectionDrop(drag);
    updatePanelSectionChrome();
    savePanelSectionOrder();
  }
  if (drag.active) event.preventDefault();
  finishPanelSectionDrag();
}

function cancelPanelSectionPointerDrag(event) {
  const drag = panelSectionPointerDrag;
  if (!drag || (event?.pointerId != null && drag.pointerId !== event.pointerId)) return;
  finishPanelSectionDrag();
}

if (typeof document !== "undefined") {
  document.addEventListener("pointermove", panelSectionPointerMove, { passive: false });
  document.addEventListener("pointerup", panelSectionPointerUp);
  document.addEventListener("pointercancel", cancelPanelSectionPointerDrag);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !panelSectionPointerDrag) return;
    event.preventDefault();
    cancelPanelSectionPointerDrag();
  });
}

function ensurePanelSectionDragHandle(section) {
  const header = section.querySelector(":scope > .section-collapse-button");
  if (!header || header.querySelector(".section-drag-handle")) return;
  const handle = document.createElement("span");
  handle.className = "section-drag-handle";
  handle.role = "button";
  handle.tabIndex = 0;
  handle.draggable = false;
  handle.textContent = "⠿";
  handle.setAttribute("aria-label", "Drag to reorder section");
  handle.dataset.help = "Drag this section directly to a new position in the tab.";
  handle.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
  });
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cancelPanelSectionPointerDrag();
    handle.focus();
    panelSectionPointerDrag = {
      section,
      sections: panelSectionGroupMembers(section),
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastY: event.clientY,
      direction: 0,
      active: false,
      target: null,
      before: true,
      previewTimer: null,
      previewTarget: null,
      previewBefore: true
    };
    handle.setPointerCapture?.(event.pointerId);
  });
  header.append(handle);
}

function movePanelSection(section, direction) {
  const currentPanel = section.closest("[data-panel-tab-panel]");
  if (!currentPanel) return;
  const sections = managedPanelSections(currentPanel);
  const moving = panelSectionGroupMembers(section);
  const currentIndex = sections.indexOf(moving[0]);
  const lastIndex = sections.indexOf(moving.at(-1));
  if (currentIndex === -1) return;
  if (direction < 0 && currentIndex > 0) {
    movePanelSectionSetBefore(moving, sections[currentIndex - 1]);
  } else if (direction > 0 && lastIndex < sections.length - 1) {
    movePanelSectionSetBefore(moving, sections[lastIndex + 1], false);
  } else {
    updatePanelSectionChrome();
    return;
  }
  updatePanelSectionChrome();
  savePanelSectionOrder();
}

function togglePanelSectionPair(section) {
  const panel = section?.closest("[data-panel-tab-panel]");
  if (!panel) return;
  const sections = managedPanelSections(panel);
  const index = sections.indexOf(section);
  const next = sections[index + 1];
  if (!next) return;
  if (section.dataset.sectionGroup && section.dataset.sectionGroup === next.dataset.sectionGroup) {
    const members = panelSectionGroupMembers(section);
    const splitAt = members.indexOf(next);
    const above = members.slice(0, splitAt);
    const below = members.slice(splitAt);
    const nextGroupId = () => "group-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    members.forEach(member => delete member.dataset.sectionGroup);
    if (above.length > 1) {
      const aboveGroupId = nextGroupId();
      above.forEach(member => { member.dataset.sectionGroup = aboveGroupId; });
    }
    if (below.length > 1) {
      const belowGroupId = nextGroupId();
      below.forEach(member => { member.dataset.sectionGroup = belowGroupId; });
    }
  } else {
    const groupId = section.dataset.sectionGroup || next.dataset.sectionGroup || `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const adjacent = [...panelSectionGroupMembers(section), ...panelSectionGroupMembers(next)];
    adjacent.forEach(member => { member.dataset.sectionGroup = groupId; });
  }
  updatePanelSectionChrome();
  savePanelSectionOrder();
}

function detachPanelSectionFromGroup(section) {
  const members = panelSectionGroupMembers(section);
  if (members.length < 2) return;
  const sectionIndex = members.indexOf(section);
  const above = members.slice(0, sectionIndex);
  const below = members.slice(sectionIndex + 1);
  members.forEach(member => delete member.dataset.sectionGroup);
  const regroup = items => {
    if (items.length < 2) return;
    const groupId = "group-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    items.forEach(item => { item.dataset.sectionGroup = groupId; });
  };
  regroup(above);
  regroup(below);
}

function pinPanelSection(section, position) {
  if (!section || !["top", "bottom"].includes(position)) return;
  detachPanelSectionFromGroup(section);
  const sectionId = panelSectionId(section);
  const current = readPinnedPanelSection();
  const isSamePin = current?.sectionId === sectionId && current.position === position;
  rvStorageWriteJson(PANEL_SECTION_PIN_KEY, isSamePin ? null : { sectionId, position });
  applyPinnedPanelSection();
  updatePanelSectionChrome();
  savePanelSectionOrder();
}

function panelSectionPinCandidate(panel, y) {
  const sections = managedPanelSections(panel);
  if (!sections.length) return null;
  const first = sections[0];
  const last = sections.at(-1);
  const firstRect = first.getBoundingClientRect();
  const lastRect = last.getBoundingClientRect();
  if (y >= firstRect.top - 10 && y < firstRect.top) return { section: first, position: "top" };
  if (y > lastRect.bottom && y <= lastRect.bottom + 10) return { section: last, position: "bottom" };
  return null;
}

function togglePanelSectionPairAtGap(panel, y) {
  const pair = panelSectionGapPair(panel, y);
  if (!pair) return false;
  togglePanelSectionPair(pair.previous);
  return true;
}

function panelSectionGapPair(panel, y) {
  const sections = managedPanelSections(panel);
  for (let index = 0; index < sections.length - 1; index += 1) {
    const previous = sections[index];
    const next = sections[index + 1];
    const previousRect = previous.getBoundingClientRect();
    const nextRect = next.getBoundingClientRect();
    // Permit the actual gutter and a two-pixel seam, never the body of a
    // section. This keeps grouping from competing with section controls.
    const gapTop = Math.min(previousRect.bottom, nextRect.top) - 2;
    const gapBottom = Math.max(previousRect.bottom, nextRect.top) + 2;
    if (y >= gapTop && y <= gapBottom) return { previous, next };
  }
  return null;
}

function setPanelSectionDivider(section, style = "", color = "") {
  if (!section) return;
  if (!style) {
    delete section.dataset.dividerAfter;
    delete section.dataset.dividerColor;
  } else {
    section.dataset.dividerAfter = style;
    section.dataset.dividerColor = String(color || section.dataset.sectionColor || "0");
  }
  savePanelSectionOrder();
}

let panelSectionGapMenu = null;
function openPanelSectionGapMenu(pair, x, y) {
  if (!pair) return;
  if (!panelSectionGapMenu) {
    panelSectionGapMenu = document.createElement("div");
    panelSectionGapMenu.className = "panel-section-gap-menu";
    panelSectionGapMenu.setAttribute("role", "menu");
    document.body.append(panelSectionGapMenu);
  }
  const section = pair.previous;
  const grouped = section.dataset.sectionGroup && section.dataset.sectionGroup === pair.next.dataset.sectionGroup;
  const dividerStyle = section.dataset.dividerAfter || "";
  const groupButton = document.createElement("button");
  groupButton.type = "button";
  groupButton.textContent = grouped ? "Ungroup here" : "Group sections";
  groupButton.addEventListener("click", () => {
    togglePanelSectionPair(section);
    panelSectionGapMenu.hidden = true;
  });
  const dividerSelect = document.createElement("select");
  dividerSelect.setAttribute("aria-label", "Divider style");
  [["", "No divider"], ["thin", "Thin line"], ["thick", "Thick line"], ["double", "Thin–thick–thin"], ["dashed", "Dashed"], ["dotted", "Dotted"]]
    .forEach(([value, label]) => dividerSelect.append(new Option(label, value, false, value === dividerStyle)));
  const colorSelect = document.createElement("select");
  colorSelect.setAttribute("aria-label", "Divider color");
  Array.from({ length: PANEL_SECTION_COLOR_COUNT }, (_, index) => index)
    .forEach(index => colorSelect.append(new Option("UI color " + (index + 1), String(index), false, String(index) === (section.dataset.dividerColor || section.dataset.sectionColor || "0"))));
  const applyDivider = document.createElement("button");
  applyDivider.type = "button";
  applyDivider.textContent = "Apply divider";
  applyDivider.addEventListener("click", () => {
    setPanelSectionDivider(section, dividerSelect.value, colorSelect.value);
    panelSectionGapMenu.hidden = true;
  });
  panelSectionGapMenu.replaceChildren(groupButton, dividerSelect, colorSelect, applyDivider);
  panelSectionGapMenu.style.left = Math.min(x, window.innerWidth - 190) + "px";
  panelSectionGapMenu.style.top = Math.min(y, window.innerHeight - 150) + "px";
  panelSectionGapMenu.hidden = false;
}

if (typeof document !== "undefined") {
  document.addEventListener("click", event => {
    if (event.button !== 0) return;
    if (event.target.closest?.(".route-theme-section")) return;
    // A header/control click always belongs to that control, even if it lands
    // on a two-pixel seam at the bottom of the header.
    if (event.target.closest?.("button, input, select, label, summary, a")) return;
    const panel = event.target.closest?.("[data-panel-tab-panel]");
    if (!panel) return;
    const pin = panelSectionPinCandidate(panel, event.clientY);
    if (pin) {
      pinPanelSection(pin.section, pin.position);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (togglePanelSectionPairAtGap(panel, event.clientY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

let panelSectionGapHint = null;
let panelSectionGapHintTimer = null;

function hidePanelSectionGapHint() {
  window.clearTimeout(panelSectionGapHintTimer);
  panelSectionGapHintTimer = null;
  panelSectionGapHint?.setAttribute("hidden", "");
}

function showPanelSectionGapHint(event) {
  if (event.target.closest?.(".route-theme-section")) {
    hidePanelSectionGapHint();
    return;
  }
  if (event.target.closest?.("button, input, select, label, summary, a")) {
    hidePanelSectionGapHint();
    return;
  }
  const panel = event.target.closest?.("[data-panel-tab-panel]");
  const pin = panel && panelSectionPinCandidate(panel, event.clientY);
  if (pin) {
    if (!panelSectionGapHint) {
      panelSectionGapHint = document.createElement("div");
      panelSectionGapHint.className = "panel-section-gap-hint";
      panelSectionGapHint.setAttribute("role", "tooltip");
      document.body.append(panelSectionGapHint);
    }
    document.querySelectorAll(".panel-tab-panel.is-section-gap-target")
      .forEach(item => item.classList.toggle("is-section-gap-target", item === panel));
    window.clearTimeout(panelSectionGapHintTimer);
    panelSectionGapHintTimer = window.setTimeout(() => {
      panelSectionGapHint.textContent = `Click to pin this section to the ${pin.position}`;
      panelSectionGapHint.style.left = `${event.clientX + 12}px`;
      panelSectionGapHint.style.top = `${event.clientY + 12}px`;
      panelSectionGapHint.removeAttribute("hidden");
    }, 650);
    return;
  }
  const eligible = panel && togglePanelSectionPairAtGapPreview(panel, event.clientY);
  document.querySelectorAll(".panel-tab-panel.is-section-gap-target")
    .forEach(item => item.classList.toggle("is-section-gap-target", item === panel && Boolean(eligible)));
  if (!eligible) {
    hidePanelSectionGapHint();
    return;
  }
  if (!panelSectionGapHint) {
    panelSectionGapHint = document.createElement("div");
    panelSectionGapHint.className = "panel-section-gap-hint";
    panelSectionGapHint.setAttribute("role", "tooltip");
    document.body.append(panelSectionGapHint);
  }
  window.clearTimeout(panelSectionGapHintTimer);
  const pointerX = event.clientX;
  const pointerY = event.clientY;
  panelSectionGapHintTimer = window.setTimeout(() => {
    const stillEligible = panel?.matches(":hover") && togglePanelSectionPairAtGapPreview(panel, pointerY);
    if (!stillEligible) return;
    panelSectionGapHint.textContent = "Click the gap to group / ungroup";
    panelSectionGapHint.style.left = `${pointerX + 12}px`;
    panelSectionGapHint.style.top = `${pointerY + 12}px`;
    panelSectionGapHint.removeAttribute("hidden");
  }, 650);
}

function togglePanelSectionPairAtGapPreview(panel, y) {
  return Boolean(panelSectionGapPair(panel, y));
}

if (typeof document !== "undefined") {
  document.addEventListener("pointermove", showPanelSectionGapHint, { passive: true });
  document.addEventListener("pointerdown", event => {
    hidePanelSectionGapHint();
    if (panelSectionGapMenu && !panelSectionGapMenu.contains(event.target)) panelSectionGapMenu.hidden = true;
    document.querySelectorAll(".panel-tab-panel.is-section-gap-target")
      .forEach(panel => panel.classList.remove("is-section-gap-target"));
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !panelSectionGapMenu || panelSectionGapMenu.hidden) return;
    panelSectionGapMenu.hidden = true;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  document.addEventListener("contextmenu", event => {
    const panel = event.target.closest?.("[data-panel-tab-panel]");
    if (!panel || event.target.closest?.("button, input, select, label, summary, a")) return;
    const pair = panelSectionGapPair(panel, event.clientY);
    if (!pair) return;
    event.preventDefault();
    event.stopPropagation();
    openPanelSectionGapMenu(pair, event.clientX, event.clientY);
  }, true);
}

function setPanelSectionCollapsed(section, collapsed) {
  const button = section.querySelector(":scope > .section-collapse-button");
  section.classList.toggle("is-collapsed", collapsed);
  if (button) {
    button.setAttribute("aria-expanded", String(!collapsed));
    button.querySelector(".section-collapse-arrow").textContent = ">";
  }
}

function toggleUnpinnedSectionGroup(section) {
  const panel = section.closest("[data-panel-tab-panel]");
  if (!panel) return;
  const sections = managedPanelSections(panel);
  const shouldCollapse = sections.some(item => !item.classList.contains("is-collapsed"));
  sections.forEach(item => setPanelSectionCollapsed(item, shouldCollapse));
}

function togglePinnedSectionGroup() {
  const sections = [...document.querySelectorAll(".pinned-journey-section .pinned-subsection")];
  const shouldClose = sections.some(item => item.open);
  sections.forEach(item => {
    item.open = !shouldClose;
  });
}
