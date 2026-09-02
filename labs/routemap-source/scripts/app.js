"use strict";

// Explicit application event wiring and ordered startup.

let applicationInitialized = false;

function initializeApplication() {
  if (applicationInitialized) return;
  applicationInitialized = true;

  if (typeof document !== "undefined") {
    initializePinnedSectionVisibility?.();
    initializeSectionStyles?.();
  }
  initializeUsersInteractions();
  initializeJourneyEditor();
  initializeMediaEditor();
  initializeDropdownWheelNavigation();
  initializePanelScrollContainment?.();

  els.journeyDefaultLandmark?.addEventListener("click", () => openJourneyLandmarkEditor("default"));
  els.journeyCurrentLandmark?.addEventListener("click", () => openJourneyLandmarkEditor(els.journeyCurrentLandmark.dataset.landmarkScope));

  els.styleLayerSelect.addEventListener("change", () => {
    selectStyleLayer(els.styleLayerSelect.value);
  });

  els.styleTextureEnabled?.addEventListener("click", event => {
    event.stopPropagation();
  });
  els.styleTextureEnabled?.closest("label")?.addEventListener("click", event => {
    event.stopPropagation();
  });

  els.openTextureLibrary?.addEventListener("click", openTextureLibrary);
  els.closeTextureLibrary?.addEventListener("click", closeTextureLibrary);
  els.textureLibrarySearch?.addEventListener("input", renderTextureLibrary);
  els.exportTextureManifest?.addEventListener("click", exportTextureManifest);
  els.exportCombinedTexture?.addEventListener("click", () => {
    exportCombinedTexturePng().catch(error => {
      console.warn("Combined texture export failed.", error);
      els.status.textContent = error.message || "Could not export the combined texture PNG.";
    });
  });
  els.updateTextureCompatibility?.addEventListener("click", () => {
    updateTextureCompatibilityScore({ force: true });
  });

  els.textureLibraryPanel?.addEventListener("click", event => {
    if (event.target === els.textureLibraryPanel) closeTextureLibrary();
  });

  els.styleHex.addEventListener("change", () => {
    const normalized = normalizeHex(els.styleHex.value);
    if (normalized) {
      commitPickerColor(normalized);
      rememberRecentColor(normalized);
    } else if (activeStyleKey) {
      els.styleHex.value = layerStyles[activeStyleKey].color;
    }
  });

  els.styleColorField.addEventListener("pointerdown", event => {
    colorFieldPointerDown = true;
    els.styleColorField.setPointerCapture(event.pointerId);
    pickColorField(event);
  });

  els.styleColorField.addEventListener("pointermove", event => {
    if (colorFieldPointerDown) pickColorField(event);
  });

  els.styleColorField.addEventListener("pointerup", () => {
    colorFieldPointerDown = false;
    rememberRecentColor(layerStyles[activeStyleKey]?.color);
  });

  els.styleColorField.addEventListener("pointercancel", () => {
    colorFieldPointerDown = false;
  });

  [els.styleRed, els.styleGreen, els.styleBlue].forEach(input => {
    input.addEventListener("input", () => {
      const color = rgbToHex(els.styleRed.value, els.styleGreen.value, els.styleBlue.value);
      commitPickerColor(color, false);
      if (activeStyleKey === "topography" || activeStyleKey === "faintTopography") {
        els.styleTopoLowColor.value = color;
      }
    });
    input.addEventListener("change", () => {
      rememberRecentColor(rgbToHex(els.styleRed.value, els.styleGreen.value, els.styleBlue.value));
    });
  });

  [els.styleTopoLowColor, els.styleTopoHighColor].forEach(input => {
    input.addEventListener("input", applyTopographyRampControls);
    input.addEventListener("change", applyTopographyRampControls);
  });

  function applyDayZoneLineControls(changedInput = null) {
    if (activeStyleKey !== "dayZoneStroke") return;
    const dashLocked = els.styleLockDashPattern.checked;
    if (dashLocked && changedInput === els.styleDashGap) {
      els.styleDashLength.value = els.styleDashGap.value;
    } else if (dashLocked) {
      els.styleDashGap.value = els.styleDashLength.value;
    }
    layerStyles.dayZoneStroke.dashLocked = dashLocked;
    layerStyles.dayZoneStroke.dashLength = Number(els.styleDashLength.value);
    layerStyles.dayZoneStroke.dashGap = Number(els.styleDashGap.value);
    scheduleStyledLayerRefresh();
  }

  els.styleLockDashPattern.addEventListener("change", () => {
    applyDayZoneLineControls(els.styleDashLength);
  });

  [els.styleDashLength, els.styleDashGap].forEach(input => {
    input.addEventListener("input", () => {
      applyDayZoneLineControls(input);
    });
    input.addEventListener("change", () => {
      applyDayZoneLineControls(input);
      flushStyledLayerRefresh();
    });
  });

  [els.styleOpacity, els.styleBlend].forEach(input => {
    input.addEventListener("input", () => {
      if (!activeStyleKey) return;
      layerStyles[activeStyleKey].opacity = Number(els.styleOpacity.value);
      layerStyles[activeStyleKey].blend = els.styleBlend.value;
      if (activeStyleKey === "dayZoneFill") {
        layerStyles.dayZoneFill.size = layerStyles.dayZoneFill.opacity;
      }
      scheduleStyledLayerRefresh();
    });
    input.addEventListener("change", () => {
      if (!activeStyleKey) return;
      layerStyles[activeStyleKey].opacity = Number(els.styleOpacity.value);
      layerStyles[activeStyleKey].blend = els.styleBlend.value;
      flushStyledLayerRefresh();
    });
  });

  [els.styleTypeface, els.styleFontWeight].forEach(input => {
    input.addEventListener("change", () => {
      if (!activeStyleKey || !isTextStyleLayer(activeStyleKey)) return;
      updateTypefaceSelectPreview(els.styleTypeface);
      layerStyles[activeStyleKey].font = els.styleTypeface.value;
      layerStyles[activeStyleKey].fontWeight = Number(els.styleFontWeight.value);
      refreshStyledLayers();
      if (els.fontStyleTarget?.value === activeStyleKey) syncFontControlsFromStyle();
    });
  });

  els.fontStyleTarget?.addEventListener("change", syncFontControlsFromStyle);
  els.fontStyleWeight?.addEventListener("change", () => {
    els.fontStyleThickness.value = els.fontStyleWeight.value;
    applyFontControlsToStyle();
  });
  [
    els.fontStyleColor,
    els.fontStyleTypeface,
    els.fontStyleItalic,
    els.fontStyleCase,
    els.fontStyleBackground,
    els.fontStyleBackgroundColor,
    els.fontStyleBackgroundOpacity,
    els.fontStyleSize,
    els.fontStyleThickness,
    els.fontStyleStretch,
    els.fontStyleScaleY,
    els.fontStyleKerning,
    els.fontStyleSpacing
  ].forEach(input => {
    input?.addEventListener("input", () => {
      updateTypefaceSelectPreview(els.fontStyleTypeface);
      applyFontControlsToStyle();
    });
    input?.addEventListener("change", () => {
      updateTypefaceSelectPreview(els.fontStyleTypeface);
      applyFontControlsToStyle();
    });
  });

  els.styleSize.addEventListener("input", () => {
    if (!activeStyleKey) return;
    layerStyles[activeStyleKey].size = Number(els.styleSize.value);
    scheduleStyledLayerRefresh();
    if (els.fontStyleTarget?.value === activeStyleKey) syncFontControlsFromStyle();
  });

  [
    els.styleTextureEnabled,
    els.styleTextureType,
    els.styleTextureSize,
    els.styleTextureOpacity,
    els.styleTextureBlend,
    els.styleTextureBlendEnabled,
    els.styleTextureBlendAmount,
    els.styleSecondaryTextureEnabled,
    els.styleSecondaryTextureType,
    els.styleSecondaryTextureSize,
    els.styleSecondaryTextureOpacity,
    els.styleSecondaryTextureBlend
  ].forEach(input => {
    input.addEventListener("input", () => {
      applyActiveTextureControls();
    });
    input.addEventListener("change", () => {
      if (input === els.styleSecondaryTextureEnabled) {
        els.styleSecondaryTextureSection.open = els.styleSecondaryTextureEnabled.checked;
      }
      applyActiveTextureControls();
      flushStyledLayerRefresh();
    });
  });

  els.closeStylePanel.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    els.stylePanel.hidden = true;
    syncMapAfterPanelLayoutChange();
  });

  document.addEventListener("click", event => {
    if (!els.stylePanel.classList.contains("inline-style-panel") && !els.stylePanel.hidden && !els.stylePanel.contains(event.target)) {
      els.stylePanel.hidden = true;
    }
    if (!els.uiThemePanel.hidden && !els.uiThemePanel.contains(event.target)) {
      els.uiThemePanel.hidden = true;
    }
  });

  window.addEventListener("resize", () => {
    revalidateUserFrameGeometryForStage();
    updateSecondaryDrawerTogglePosition();
    keepPopupOnScreen(els.stylePanel);
    keepPopupOnScreen(els.uiThemePanel);
    scheduleResponsiveMapRefresh({ fit: true });
  });

  els.input?.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      loadRouteFile(await file.text(), file.name);
    } catch (error) {
      els.status.textContent = error.message;
    }
  });

  const roadDownloadButtons = [els.downloadRoadPackage, els.downloadRoadPackageElements, els.downloadRoadPackageTrips].filter(Boolean);

  async function handleRoadPackageDownload() {
    roadDownloadButtons.forEach(button => { button.disabled = true; });
    setRoadStatus("Road package download started");
    try {
      const result = await downloadRoadGeoJsonPackage();
      const downloaded = result.downloaded.join(", ");
      const failed = result.failed.length ? ` Failed: ${result.failed.join(", ")}.` : "";
      setRoadStatus(`Downloaded ${downloaded}. Put ${roadPackageDownloadName()} in ${ROAD_PACKAGE_BASE_URL} so the app can load streets locally.${failed}`);
    } catch (error) {
      console.warn("Road package download failed.", error);
      const detail = error?.message ? ` ${error.message}` : "";
      setRoadStatus(`Road package download failed${detail}`);
    } finally {
      roadDownloadButtons.forEach(button => { button.disabled = false; });
    }
  }

  roadDownloadButtons.forEach(button => {
    button.addEventListener("click", handleRoadPackageDownload);
  });

  els.chooseRoadFolder?.addEventListener("click", async () => {
    if (window.showDirectoryPicker) {
      try {
        await chooseRoadFolderWithPicker();
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
        els.status.textContent = "Folder picker failed; use the file chooser fallback.";
      }
    }
    els.roadFolderInput?.click();
  });

  els.roadFolderInput?.addEventListener("change", event => {
    if (event.target.files?.length) {
      chooseRoadFolderWithInput(event.target.files);
    }
    event.target.value = "";
  });

  renderPresetOptions();
  renderStylePresetOptions();
  applyUiThemeState(DEFAULT_UI_THEME);
  updateTextureScaleModeLabel();
  organizeAdminControlPanels();
  enhanceCollapsibleSections();
  initializePinnedSectionContextMenus();
  initializePinnedStopSubsections();
  initializePanelImageContextUploads();
  initializePreviewNudgeControls();
  setImagePreviewDrawerOpen(true);
  mountInlineStyleEditor();
  updateSecondaryPanelAvailability();
  updateOverviewRouteAnimationControls();
  updateRoutePlaybackSpeedControl();
  updateRouteCameraControls();
  applyRouteDisplayColors(DEFAULT_ROUTE_DISPLAY_COLORS);
  renderRouteAnimationIconRecentOptions();
  renderTownMarkerImageRecentOptions();
  applyRouteAnimationIconSettings(DEFAULT_ROUTE_ANIMATION_ICON);
  updateMapFeatureToolbar();
  startUsageOverlay();
  updateRoadZoomOpacity();
  makePopupDraggable(els.uiThemePanel);
  renderTextureOptions();
  warmTextureDimensions();
  renderTextStyleOptions();
  syncFontControlsFromStyle();
  renderStyleLayerOptions();
  discoverAdministratorSettings();
  applyUserControlAppearance({ save: false, render: false });
  renderUserAppearanceSections();
  updateUserArrangementControls();
  renderMediaStyleEditor();
  syncUserRecordUiState();
  renderColorCollections();
  updateToggleSwatches();
  updateRouteStackControls();
  renderRouteThemeGrid();
  warmJumpImages();
  setLoadingOverlayContent({ imageUrl: nextJumpImageUrl(), text: "Loading route..." });
  welcomeGateShownAt = Date.now();
  welcomeGateMapMessage = "Loading roads and map features...";
  refreshWelcomeGateState();
  updateMapControlHelp();
  renderLocalRoadSourceStatus();
  updateLocalRoadPackageControls();
  resetUserBuilderHistory("Initial builder state");
  applySiteMode(appState.siteMode);
  initializeHelpfulTooltips();
  setUserMaterial(appState.userMaterial);
  refreshUserMaterialControls();
  async function initializeDefaultMapStartup() {
    setMapElementsLoading(true);
    markMapStartup("startup-begin");
    try {
      await loadDefaultSettingsFiles();
      markMapStartup("settings-ready");

      const restoredUserBuilderState = restoreUserBuilderLocalState();
      userBuilderPersistenceReady = true;
      if (!restoredUserBuilderState) saveUserBuilderLocalState();
      defaultSettingsLoaded = true;
      activeMapLibreStyleId = DEFAULT_MAPLIBRE_STYLE_ID;
      activeRouteThemeId = `osm-${DEFAULT_MAPLIBRE_STYLE_ID}`;
      setRouteThemeTexture({
        className: "route-theme-watercolor",
        opacity: layerStyles.texture.size,
        landA: hexToRgbTriplet(styleColor("land")),
        landB: hexToRgbTriplet(styleColor("land")),
        waterA: hexToRgbTriplet(styleColor("water")),
        waterB: hexToRgbTriplet(styleColor("water"))
      });
      refreshStyledLayers();
      renderRouteThemeGrid();

      // Startup owns one MapLibre build. The empty renderer is created only
      // after project settings are ready, then the editable style is applied once.
      setMapLibreEnabled(true, { deferThemeLoad: true });
      await applyMapProviderTheme(DEFAULT_MAPLIBRE_STYLE_ID);
      await hydrateLandmarkAssetImages(activeTrip());
      const ready = await waitForMapElementsReady({ timeout: 20000, minDelay: 120 });
      markMapStartup("map-ready", { ready, layers: mapLibreLayerIds().length });
      if (!ready) {
        setMapLibreStatus("The base map is still filling in. Controls and routes are ready to use.");
      }
    } catch (error) {
      console.warn("Map startup did not complete normally; using the available fallback layers.", error);
      setMapLibreStatus("The online base map could not finish loading. Using available fallback layers.");
      setWelcomeGateReady(true, "Map controls ready; online base map unavailable.");
      markMapStartup("map-startup-error", error?.message || String(error));
    } finally {
      clearMapElementsLoading();
    }
  }

  function scheduleSecondaryMapData() {
    const load = () => scheduleOsmPlaceRefresh(0);
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(load, { timeout: 2500 });
    } else {
      setTimeout(load, 1200);
    }
  }

  // Give the visible basemap first use of the network and renderer. Journey
  // parsing begins as soon as the style graph is usable, rather than competing
  // with it from the first frame. Optional custom labels wait for browser idle.
  void initializeDefaultMapStartup().finally(() => {
    markMapStartup("routes-begin");
    return loadDefaultRoutes().catch(error => {
      console.warn("Default journeys did not finish loading.", error);
    }).finally(() => {
      rvMediaHydrateLocalAssets?.().then(() => {
        renderTripMedia?.();
        renderMediaMarkers?.();
      }).catch(error => console.warn("Local media could not be restored.", error));
      markMapStartup("routes-ready", {
        routes: state.routes.length,
        points: state.routes.reduce((total, route) => total + (route.displayPoints?.length || route.points?.length || 0), 0)
      });
      scheduleSecondaryMapData();
    });
  });

}
