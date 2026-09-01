"use strict";

// Route/UI theme selection, editing, color tools, typography, and texture controls.

let routeThemePickerSnapshot = null;
let routeThemePickerAnchor = null;

function captureRouteThemePickerSnapshot() {
  return {
    themeId: activeRouteThemeId,
    providerId: activeProviderThemeId,
    mapLibreStyleId: activeMapLibreStyleId,
    mode: mapThemeMode,
    state: structuredClone(getCurrentRouteThemeState())
  };
}

function openRouteThemePicker() {
  routeThemePickerSnapshot ||= captureRouteThemePickerSnapshot();
  // Capture the picker position once. Pinned editor sections may expand or
  // collapse while Themes is open, but that must not move this fixed panel.
  routeThemePickerAnchor = null;
  setPanelTab("elements");
  const panel = document.querySelector("#panelElements");
  panel?.classList.remove("theme-picker-closing");
  panel?.classList.add("theme-picker-open");
  positionRouteThemePicker();
  requestAnimationFrame(() => {
    positionRouteThemePicker();
  });
  syncMapAfterPanelLayoutChange();
}

function closeRouteThemePicker() {
  const panel = document.querySelector("#panelElements");
  if (!panel?.classList.contains("theme-picker-open")) return;
  panel.classList.add("theme-picker-closing");
  window.setTimeout(() => {
    panel.classList.remove("theme-picker-open", "theme-picker-closing");
    routeThemePickerAnchor = null;
  }, 150);
  syncMapAfterPanelLayoutChange();
}

async function cancelRouteThemePicker() {
  const snapshot = routeThemePickerSnapshot;
  routeThemePickerSnapshot = null;
  if (snapshot) {
    activeRouteThemeId = snapshot.themeId;
    activeProviderThemeId = snapshot.providerId;
    activeMapLibreStyleId = snapshot.mapLibreStyleId;
    setMapThemeMode(snapshot.mode || "custom");
    applyUiThemeState(snapshot.state.uiTheme);
    applyStyleState(snapshot.state.styles);
    applyToggleState(snapshot.state.toggles);
    if (typeof snapshot.state.controls?.textureScaleWithMap === "boolean") {
      els.textureScaleWithMap.checked = snapshot.state.controls.textureScaleWithMap;
      updateTextureScaleModeLabel();
    }
    applyRouteStackOrder(snapshot.state.controls?.routeStackOrder);
    setRouteThemeTexture(snapshot.state.texture);
    activeTheme = activeThemeFromLayerStyles();
    if (mapLibreBasemapEnabled()) await ensureSingleMapLibreThemeBase(activeTheme);
    else applyThemeToAllRenderers(activeTheme);
    applyHighContrastRouteDisplayColors?.();
    renderRouteThemeGrid();
    updateCurrentThemeSummary();
  }
  closeRouteThemePicker();
}

function positionRouteThemePicker({ reanchor = false } = {}) {
  const picker = document.querySelector(".route-theme-section");
  const panel = document.querySelector(".panel");
  const footer = document.querySelector(".panel-footer-theme");
  if (!picker || !panel) return;
  if (reanchor) routeThemePickerAnchor = null;
  if (!routeThemePickerAnchor) {
    const panelRect = panel.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    const bottom = footerRect ? Math.max(0, window.innerHeight - footerRect.top) : Math.max(0, window.innerHeight - panelRect.bottom);
    routeThemePickerAnchor = {
      top: Math.round(panelRect.top - 8),
      left: Math.round(panelRect.left),
      width: Math.round(panelRect.width),
      bottom: Math.round(bottom)
    };
  }
  picker.style.setProperty("--theme-picker-top", `${routeThemePickerAnchor.top}px`);
  picker.style.setProperty("--theme-picker-left", `${routeThemePickerAnchor.left}px`);
  picker.style.setProperty("--theme-picker-width", `${routeThemePickerAnchor.width}px`);
  picker.style.setProperty("--theme-picker-bottom", `${routeThemePickerAnchor.bottom}px`);
}

// This primary toolbar control must be available even if a later, unrelated
// map-control initializer is unavailable. Keeping its binding next to the
// picker also prevents a cached map bootstrap from leaving the button inert.
document.querySelector("#topThemeButton")?.addEventListener("click", () => {
  if (typeof isUsersBuilderMode === "function" && isUsersBuilderMode()) {
    closeRouteThemePicker();
    setUserThemePanelOpen?.(els.userThemePanel?.hidden !== false);
    return;
  }
  const panel = document.querySelector("#panelElements");
  if (panel?.classList.contains("theme-picker-open")) closeRouteThemePicker();
  else openRouteThemePicker();
});



function loadPresets() {
  return rvStorageReadJson(TOGGLE_PRESETS_KEY, {}) || {};
}

function savePresets(presets) {
  rvStorageWriteJson(TOGGLE_PRESETS_KEY, presets);
}

function renderPresetOptions() {
  const presets = loadPresets();
  els.presetSelect.replaceChildren(new Option("Presets", ""));
  Object.keys(presets).sort().forEach(name => {
    els.presetSelect.append(new Option(name, name));
  });
}



function getStyleState() {
  return Object.fromEntries(styleEditorLayerKeys().map(key => {
    const style = layerStyles[key];
    return [
    key,
    {
      color: style.color,
      size: style.size,
      colorHigh: style.colorHigh,
      blend: style.blend,
      font: style.font,
      fontWeight: style.fontWeight,
      italic: style.italic,
      fontStretch: style.fontStretch,
      fontScaleY: style.fontScaleY,
      letterSpacing: style.letterSpacing,
      wordSpacing: style.wordSpacing,
      textCase: style.textCase,
      labelBackground: style.labelBackground,
      labelBackgroundColor: style.labelBackgroundColor,
      labelBackgroundOpacity: style.labelBackgroundOpacity,
      dashLength: style.dashLength,
      dashGap: style.dashGap,
      dashLocked: style.dashLocked,
      opacity: style.opacity,
      fillOpacity: style.fillOpacity,
      texture: { ...styleTexture(key) }
    }
  ];
  }));
}

function applyStyleState(styleState) {
  const migratedStyleState = { ...styleState };
  const legacyStyleMap = {
    streets: "majorRoads",
    faintStreets: "minorRoads",
    stateLines: "stateBorders",
    faintStateLines: "countyBorders",
    capitols: "capitals"
  };
  Object.entries(legacyStyleMap).forEach(([legacyKey, semanticKey]) => {
    if (styleState[legacyKey] && !migratedStyleState[semanticKey]) {
      migratedStyleState[semanticKey] = { ...styleState[legacyKey] };
    }
  });
  if (styleState.streets && !migratedStyleState.highways) {
    migratedStyleState.highways = { ...styleState.streets };
  }
  if (styleState.stateLines && !migratedStyleState.countryBorders) {
    migratedStyleState.countryBorders = { ...styleState.stateLines };
  }
  if (styleState.dayZones && !styleState.dayZoneFill) {
    migratedStyleState.dayZoneFill = {
      color: styleState.dayZones.color,
      size: styleState.dayZones.fillOpacity,
      opacity: styleState.dayZones.fillOpacity,
      blend: styleState.dayZones.blend
    };
  }
  if (styleState.dayZones && !styleState.dayZoneStroke) {
    migratedStyleState.dayZoneStroke = {
      color: styleState.dayZones.color,
      size: styleState.dayZones.size,
      opacity: styleState.dayZones.opacity,
      dashLength: styleState.dayZones.dashLength,
      dashGap: styleState.dayZones.dashGap,
      dashLocked: styleState.dayZones.dashLocked,
      blend: styleState.dayZones.blend
    };
  }
  Object.entries(migratedStyleState).forEach(([key, values]) => {
    if (!layerStyles[key]) return;
    if (typeof values.color === "string") {
      layerStyles[key].color = values.color;
    }
    if (Number.isFinite(values.size)) {
      layerStyles[key].size = clamp(values.size, layerStyles[key].min, layerStyles[key].max);
    }
    if (typeof values.colorHigh === "string") {
      layerStyles[key].colorHigh = values.colorHigh;
    }
    if (typeof values.blend === "string") {
      layerStyles[key].blend = values.blend;
    }
    if (typeof values.font === "string" && MAP_TEXT_TYPEFACES.some(typeface => typeface.value === values.font)) {
      layerStyles[key].font = values.font;
    }
    if (Number.isFinite(values.fontWeight) && Number.isFinite(layerStyles[key].fontWeight)) {
      layerStyles[key].fontWeight = clamp(values.fontWeight, 400, 800);
    }
    if (typeof values.italic === "boolean" && typeof layerStyles[key].italic === "boolean") {
      layerStyles[key].italic = values.italic;
    }
    if (Number.isFinite(values.fontStretch) && Number.isFinite(layerStyles[key].fontStretch)) {
      layerStyles[key].fontStretch = clamp(values.fontStretch, 70, 140);
    }
    if (Number.isFinite(values.fontScaleY) && Number.isFinite(layerStyles[key].fontScaleY)) {
      layerStyles[key].fontScaleY = clamp(values.fontScaleY, 80, 130);
    }
    if (Number.isFinite(values.letterSpacing) && Number.isFinite(layerStyles[key].letterSpacing)) {
      layerStyles[key].letterSpacing = clamp(values.letterSpacing, -0.08, 0.16);
    }
    if (Number.isFinite(values.wordSpacing) && Number.isFinite(layerStyles[key].wordSpacing)) {
      layerStyles[key].wordSpacing = clamp(values.wordSpacing, -0.08, 0.18);
    }
    if (typeof values.textCase === "string" && "textCase" in layerStyles[key]) {
      layerStyles[key].textCase = ["normal", "title", "upper", "lower"].includes(values.textCase) ? values.textCase : "normal";
    }
    if (typeof values.labelBackground === "boolean" && "labelBackground" in layerStyles[key]) {
      layerStyles[key].labelBackground = values.labelBackground;
    }
    if (typeof values.labelBackgroundColor === "string" && "labelBackgroundColor" in layerStyles[key]) {
      layerStyles[key].labelBackgroundColor = normalizeHex(values.labelBackgroundColor) || layerStyles[key].labelBackgroundColor;
    }
    if (Number.isFinite(values.labelBackgroundOpacity) && Number.isFinite(layerStyles[key].labelBackgroundOpacity)) {
      layerStyles[key].labelBackgroundOpacity = clamp(values.labelBackgroundOpacity, 0, 1);
    }
    if (Number.isFinite(values.dashLength) && Number.isFinite(layerStyles[key].dashLength)) {
      layerStyles[key].dashLength = clamp(values.dashLength, 0, 40);
    }
    if (Number.isFinite(values.dashGap) && Number.isFinite(layerStyles[key].dashGap)) {
      layerStyles[key].dashGap = clamp(values.dashGap, 0, 40);
    }
    if (typeof values.dashLocked === "boolean" && typeof layerStyles[key].dashLocked === "boolean") {
      layerStyles[key].dashLocked = values.dashLocked;
      if (values.dashLocked) layerStyles[key].dashGap = layerStyles[key].dashLength;
    }
    if (Number.isFinite(values.opacity) && Number.isFinite(layerStyles[key].opacity)) {
      layerStyles[key].opacity = clamp(values.opacity, 0, 1);
    }
    if (Number.isFinite(values.fillOpacity) && Number.isFinite(layerStyles[key].fillOpacity)) {
      layerStyles[key].fillOpacity = clamp(values.fillOpacity, 0, 0.5);
    }
    if (values.texture && typeof values.texture === "object") {
      layerStyles[key].texture = layerTexture({
        enabled: values.texture.enabled !== false,
        type: LAYER_TEXTURE_BACKGROUNDS[values.texture.type] ? values.texture.type : DEFAULT_LAYER_TEXTURE.type,
        opacity: Number.isFinite(values.texture.opacity) ? clamp(values.texture.opacity, 0, 1) : DEFAULT_LAYER_TEXTURE.opacity,
        blend: isTextureBlendMode(values.texture.blend) ? values.texture.blend : DEFAULT_LAYER_TEXTURE.blend,
        blendAmount: Number.isFinite(values.texture.blendAmount) ? clamp(values.texture.blendAmount, 0, 1) : DEFAULT_LAYER_TEXTURE.blendAmount,
        scale: Number.isFinite(values.texture.scale) ? clamp(values.texture.scale, 0.35, 4) : DEFAULT_LAYER_TEXTURE.scale,
        secondaryEnabled: false,
        secondaryType: DEFAULT_LAYER_TEXTURE.secondaryType,
        secondaryScale: Number.isFinite(values.texture.scale) ? clamp(values.texture.scale, 0.35, 4) : DEFAULT_LAYER_TEXTURE.scale,
        secondaryOpacity: 0,
        secondaryBlend: DEFAULT_LAYER_TEXTURE.secondaryBlend
      });
    }
  });
  refreshStyledLayers();
  applyThemeToAllRenderers(activeThemeFromLayerStyles());
  syncFontControlsFromStyle();
}

// Partial theme presets deliberately store a mask and a small snapshot, rather
// than a second complete theme format. That makes a "Water texture and color"
// preset safe to use on any other map theme without replacing its roads or UI.
const THEME_PRESET_CATEGORIES = Object.freeze([
  { id: "water", label: "Water", styleKeys: ["water"] },
  { id: "land", label: "Land & terrain", styleKeys: ["land", "parks", "deserts", "buildings"] },
  { id: "roads", label: "Roads & rail", styleKeys: ["highways", "majorRoads", "minorRoads", "railroads"] },
  { id: "labels", label: "Labels & places", styleKeys: ["smallTowns", "cities", "capitals", "pois"] },
  { id: "boundaries", label: "Boundaries", styleKeys: ["countryBorders", "stateBorders", "countyBorders"] },
  { id: "topography", label: "Topography", styleKeys: ["topography", "faintTopography"] },
  { id: "route", label: "Route & day overlays", styleKeys: ["route", "faintRoute", "dayZoneFill", "dayZoneStroke"] },
  { id: "ui", label: "UI panel", ui: true },
  { id: "controls", label: "Map controls", controls: true, toggles: true }
]);

let editingThemePresetId = null;

function loadThemePresets() {
  return rvStorageReadJson(THEME_PRESETS_KEY, {}) || {};
}

function saveThemePresets(presets) {
  rvStorageWriteJson(THEME_PRESETS_KEY, presets);
}

function themePresetCategory(id) {
  return THEME_PRESET_CATEGORIES.find(category => category.id === id);
}

function themePresetMask(mask = {}) {
  return Object.fromEntries(THEME_PRESET_CATEGORIES.map(category => [category.id, mask[category.id] === true]));
}

function styleSnapshotForKeys(keys = [], source = getStyleState()) {
  return Object.fromEntries(keys.filter(key => source[key]).map(key => [key, structuredClone(source[key])]));
}

function captureThemePresetValues(mask) {
  const state = getCurrentRouteThemeState();
  const values = { styles: {} };
  THEME_PRESET_CATEGORIES.forEach(category => {
    if (!mask[category.id]) return;
    if (category.styleKeys) Object.assign(values.styles, styleSnapshotForKeys(category.styleKeys, state.styles));
    if (category.ui) values.uiTheme = structuredClone(state.uiTheme);
    if (category.controls) values.controls = structuredClone(state.controls);
    if (category.toggles) values.toggles = structuredClone(state.toggles);
  });
  return values;
}

function normalizeThemePreset(id, preset) {
  const mask = themePresetMask(preset?.mask);
  return {
    id,
    label: String(preset?.label || "Untitled preset").trim() || "Untitled preset",
    mask,
    values: preset?.values && typeof preset.values === "object" ? preset.values : { styles: {} },
    createdAt: preset?.createdAt || new Date().toISOString(),
    updatedAt: preset?.updatedAt || preset?.createdAt || new Date().toISOString()
  };
}

function selectedThemePresetCategories(preset) {
  return THEME_PRESET_CATEGORIES.filter(category => preset.mask?.[category.id]);
}

function themePresetDescription(preset) {
  const labels = selectedThemePresetCategories(preset).map(category => category.label);
  return labels.length ? labels.join(" · ") : "No settings selected";
}

function mergeThemePresetIntoTheme(theme, preset) {
  const merged = structuredClone(theme || getCurrentRouteThemeState());
  merged.styles ||= {};
  const values = preset.values || {};
  selectedThemePresetCategories(preset).forEach(category => {
    if (category.styleKeys) {
      category.styleKeys.forEach(key => {
        if (values.styles?.[key]) merged.styles[key] = structuredClone(values.styles[key]);
      });
    }
    if (category.ui && values.uiTheme) merged.uiTheme = structuredClone(values.uiTheme);
    if (category.controls && values.controls) merged.controls = { ...merged.controls, ...structuredClone(values.controls) };
    if (category.toggles && values.toggles) merged.toggles = { ...merged.toggles, ...structuredClone(values.toggles) };
  });
  return merged;
}

async function applyThemePreset(preset) {
  if (!preset) return;
  saveActiveThemeDraft();
  const next = mergeThemePresetIntoTheme(getCurrentRouteThemeState(), preset);
  if (next.uiTheme) applyUiThemeState(next.uiTheme);
  if (next.styles) applyStyleState(next.styles);
  if (typeof next.controls?.textureScaleWithMap === "boolean") {
    els.textureScaleWithMap.checked = next.controls.textureScaleWithMap;
    updateTextureScaleModeLabel();
  }
  if (next.controls?.routeStackOrder) applyRouteStackOrder(next.controls.routeStackOrder);
  if (next.toggles) applyToggleState(next.toggles);
  activeTheme = activeThemeFromLayerStyles();
  if (mapLibreBasemapEnabled()) await ensureSingleMapLibreThemeBase(activeTheme);
  else applyThemeToAllRenderers(activeTheme);
  applyHighContrastRouteDisplayColors?.();
  updateCurrentThemeSummary();
  els.status.textContent = `Applied ${preset.label}: ${themePresetDescription(preset)}.`;
}

function renderThemePresetDefaultOptions() {
  if (!els.themePresetDefaultSelect) return;
  const selected = localStorage.getItem(THEME_PRESET_DEFAULT_KEY) || "";
  const presets = Object.entries(loadThemePresets()).map(([id, preset]) => normalizeThemePreset(id, preset));
  els.themePresetDefaultSelect.replaceChildren(new Option("None selected", ""));
  presets.sort((a, b) => a.label.localeCompare(b.label)).forEach(preset => {
    els.themePresetDefaultSelect.append(new Option(preset.label, preset.id));
  });
  els.themePresetDefaultSelect.value = presets.some(preset => preset.id === selected) ? selected : "";
}

function renderThemePresetGrid() {
  if (!els.themePresetGrid) return;
  const view = localStorage.getItem("rv-map-theme-preset-view-v1") || "grid";
  els.themePresetGrid.classList.toggle("is-scrollable", view === "scroll");
  els.themePresetGrid.classList.toggle("is-expanded", view === "expanded");
  if (els.themePresetView) els.themePresetView.value = view;
  const presets = Object.entries(loadThemePresets())
    .map(([id, preset]) => normalizeThemePreset(id, preset))
    .sort((a, b) => a.label.localeCompare(b.label));
  els.themePresetGrid.replaceChildren();
  if (!presets.length) {
    const empty = document.createElement("p");
    empty.className = "provider-status";
    empty.textContent = "No partial presets yet. Create one from the current theme.";
    els.themePresetGrid.append(empty);
  }
  presets.forEach(preset => {
    const card = document.createElement("article");
    card.className = "theme-preset-item";
    card.draggable = true;
    card.dataset.themePreset = preset.id;
    card.title = "Drag onto a saved theme to apply these selected parts to that theme.";
    const title = document.createElement("strong");
    title.textContent = preset.label;
    const description = document.createElement("span");
    description.textContent = themePresetDescription(preset);
    const actions = document.createElement("div");
    const apply = document.createElement("button");
    apply.type = "button";
    apply.dataset.applyThemePreset = preset.id;
    apply.textContent = "Apply";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.dataset.editThemePreset = preset.id;
    edit.textContent = "Edit";
    const duplicate = document.createElement("button");
    duplicate.type = "button";
    duplicate.dataset.duplicateThemePreset = preset.id;
    duplicate.textContent = "Copy";
    actions.append(apply, edit, duplicate);
    card.append(title, description, actions);
    els.themePresetGrid.append(card);
  });
  renderThemePresetDefaultOptions();
}

function renderThemePresetDialog(preset = null) {
  editingThemePresetId = preset?.id || null;
  const current = preset || { label: "", mask: themePresetMask() };
  els.themePresetDialogTitle.textContent = preset ? "Edit theme preset" : "Create theme preset";
  els.themePresetName.value = current.label || "";
  els.themePresetCategories.replaceChildren();
  THEME_PRESET_CATEGORIES.forEach(category => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = category.id;
    input.checked = current.mask?.[category.id] ?? (category.id === "water" || category.id === "land");
    const text = document.createElement("span");
    text.textContent = category.label;
    const count = document.createElement("small");
    count.textContent = category.styleKeys ? `${category.styleKeys.length} groups` : "settings";
    label.append(input, text, count);
    els.themePresetCategories.append(label);
  });
  els.themePresetDelete.hidden = !preset;
  els.themePresetApply.hidden = !preset;
  els.themePresetSave.hidden = false;
  updateThemePresetDialogSummary();
  els.themePresetDialog.hidden = false;
  els.themePresetName.focus();
}

function dialogThemePresetMask() {
  return Object.fromEntries(THEME_PRESET_CATEGORIES.map(category => [
    category.id,
    Boolean(els.themePresetCategories.querySelector(`input[value="${category.id}"]`)?.checked)
  ]));
}

function updateThemePresetDialogSummary() {
  const chosen = THEME_PRESET_CATEGORIES.filter(category => dialogThemePresetMask()[category.id]);
  els.themePresetSummary.textContent = chosen.length
    ? `${chosen.length} categories will be included. Existing settings outside those categories remain untouched when applied.`
    : "Choose at least one category to make a usable preset.";
}

function closeThemePresetDialog() {
  els.themePresetDialog.hidden = true;
  editingThemePresetId = null;
}

function saveThemePresetFromDialog() {
  const label = els.themePresetName.value.trim();
  const mask = dialogThemePresetMask();
  if (!label || !Object.values(mask).some(Boolean)) {
    els.themePresetSummary.textContent = "Give this preset a name and choose at least one category.";
    return;
  }
  const presets = loadThemePresets();
  const id = editingThemePresetId || `theme-preset-${Date.now().toString(36)}`;
  const previous = presets[id];
  presets[id] = {
    label,
    mask,
    values: captureThemePresetValues(mask),
    createdAt: previous?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveThemePresets(presets);
  closeThemePresetDialog();
  renderThemePresetGrid();
  els.status.textContent = `Saved theme preset: ${label}.`;
}



async function applyRouteTheme(themeId) {
  const theme = allRouteThemes()[themeId];
  if (!theme) return;
  saveActiveThemeDraft();
  if (mapLibreBasemapEnabled()) {
    await selectCustomMapTheme(themeId);
    return;
  }
  setMapThemeMode("custom");
  activeProviderThemeId = null;
  activeRouteThemeId = themeId;
  rememberMixedToggleState();
  applyUiThemeState(theme.uiTheme);
  applyStyleState(theme.styles);
  if (typeof theme.controls?.textureScaleWithMap === "boolean") {
    els.textureScaleWithMap.checked = theme.controls.textureScaleWithMap;
    updateTextureScaleModeLabel();
  }
  applyRouteStackOrder(theme.controls?.routeStackOrder);
  layerStyles.texture.size = theme.texture?.opacity ?? layerStyles.texture.size;
  applyToggleState(theme.toggles);
  setRouteThemeTexture(theme.texture);
  refreshStyledLayers();
  applyThemeToAllRenderers(activeThemeFromLayerStyles());
  applyHighContrastRouteDisplayColors?.();
  renderRouteThemeGrid();
  updateCurrentThemeSummary();
}

function mapLibreStyleToRouteTheme(style) {
  const colors = style?.colors || {};
  const roadColor = colors.road || "#d6a84f";
  const boundaryColor = colors.boundary || "#d0a6b6";
  const labelColor = colors.label || "#31495f";
  return {
    label: style?.label || "OSM style",
    description: style?.description || "OpenStreetMap provider style",
    uiTheme: getUiThemeState(),
    controls: {
      textureScaleWithMap: els.textureScaleWithMap?.checked
    },
    toggles: getToggleState(),
    styles: {
      // Keep the project's selected overlays while applying a provider palette.
      land: { color: colors.land || colors.background || "#f2ead8", texture: { ...styleTexture("land") } },
      water: { color: colors.water || "#b9dce8", texture: { ...styleTexture("water") } },
      parks: { color: colors.park || colors.land || "#b7d4a8", texture: { ...styleTexture("parks") } },
      buildings: { color: colors.building || "#d6cbb6", texture: { ...styleTexture("buildings") } },
      highways: { color: roadColor },
      majorRoads: { color: roadColor },
      minorRoads: { color: colors.minorRoad || roadColor },
      railroads: { color: colors.rail || "#766f64" },
      smallTowns: { color: labelColor },
      cities: { color: labelColor },
      capitols: { color: labelColor },
      pois: { color: colors.poi || colors.park || "#4f6f57" },
      countryBorders: { color: boundaryColor },
      stateBorders: { color: boundaryColor },
      countyBorders: { color: colors.countyBoundary || boundaryColor },
      topography: { color: colors.topoHigh || colors.topoLow || colors.land || "#c9ae43" },
      faintTopography: { color: colors.topoLow || colors.land || "#c9ae43" },
      dayZoneFill: { color: layerStyles.dayZoneFill?.color || "#1450ad" },
      dayZoneStroke: { color: layerStyles.dayZoneStroke?.color || "#1450ad" }
    },
    texture: {
      className: "",
      opacity: 0
    }
  };
}

async function applyMapProviderTheme(styleId) {
  const style = MAPLIBRE_STYLES.find(item => item.id === styleId);
  if (!style) return;

  // Do not call mapLibreMap.setStyle() for theme-card clicks.
  // Provider themes are now color presets applied to the single editable MapLibre basemap.
  // This avoids provider-style layer swaps, which were causing road/base alignment drift.
  saveActiveThemeDraft();
  // Provider palettes change map colors, while project texture overlays remain editable.
  const providerTheme = mapLibreStyleToRouteTheme(style);

  activeProviderThemeId = null;
  activeMapLibreStyleId = MAPLIBRE_STYLES[0]?.id || styleId;
  activeRouteThemeId = `osm-${styleId}`;
  setMapThemeMode("custom");

  rememberMixedToggleState();
  applyStyleState(providerTheme.styles);
  applyToggleState(providerTheme.toggles);
  activeTheme = activeThemeFromLayerStyles();

  await ensureSingleMapLibreThemeBase(activeTheme);
  applyHighContrastRouteDisplayColors?.();

  renderRouteThemeGrid();
  updateCurrentThemeSummary();
  updateToggleSwatches();
  setMapLibreStatus(`${style.label} colors applied to editable MapLibre theme.`);
}

async function selectCustomMapTheme(themeId) {
  const sourceTheme = getThemeForEditing(themeId);
  if (!sourceTheme) return;
  saveActiveThemeDraft();

  // Saved themes use the semantic MapLibre path, including their texture overlays.
  const theme = sourceTheme;

  setMapThemeMode("custom");
  activeProviderThemeId = null;
  activeRouteThemeId = themeId;
  rememberMixedToggleState();
  applyUiThemeState(theme.uiTheme);
  applyStyleState(theme.styles);
  if (typeof theme.controls?.textureScaleWithMap === "boolean") {
    els.textureScaleWithMap.checked = theme.controls.textureScaleWithMap;
    updateTextureScaleModeLabel();
  }
  applyRouteStackOrder(theme.controls?.routeStackOrder);
  applyToggleState(theme.toggles);
  activeTheme = activeThemeFromLayerStyles();

  if (mapLibreBasemapEnabled()) {
    await ensureSingleMapLibreThemeBase(activeTheme);
  } else {
    applyThemeToAllRenderers(activeTheme);
  }
  applyHighContrastRouteDisplayColors?.();
  renderRouteThemeGrid();
  updateCurrentThemeSummary();
}



function loadCustomRouteThemes() {
  return rvStorageReadJson(ROUTE_THEMES_KEY, {}) || {};
}

function saveCustomRouteThemes(themes) {
  rvStorageWriteJson(ROUTE_THEMES_KEY, themes);
}

function allRouteThemes() {
  const themes = { ...ROUTE_THEME_PRESETS, ...loadCustomRouteThemes() };
  return Object.fromEntries(Object.entries(themes).map(([id, theme]) => [
    id,
    { ...theme, styles: completeThemeStyles(theme.styles) }
  ]));
}

function loadThemeDrafts() {
  return rvStorageReadJson(ROUTE_THEME_DRAFTS_KEY, {}) || {};
}

function saveThemeDraft(themeId, themeData) {
  if (!themeId || !themeData) return;
  const drafts = loadThemeDrafts();
  drafts[themeId] = {
    ...structuredClone(themeData),
    modifiedAt: new Date().toISOString()
  };
  rvStorageWriteJson(ROUTE_THEME_DRAFTS_KEY, drafts);
}

function getThemeForEditing(themeId) {
  const drafts = loadThemeDrafts();
  const builtIns = allRouteThemes();
  return completeTheme(drafts[themeId] || builtIns[themeId]);
}

function saveActiveThemeDraft() {
  if (!activeRouteThemeId || mapThemeMode !== "custom") return;
  const current = allRouteThemes()[activeRouteThemeId];
  if (!current) return;
  saveThemeDraft(
    activeRouteThemeId,
    getCurrentRouteThemeState(current.label || readableTextureName(activeRouteThemeId), current.description || "Saved from current map")
  );
}

function getCurrentRouteThemeState(label = "Custom Theme", description = "Saved from current map") {
  return {
    label,
    description,
    uiTheme: getUiThemeState(),
    controls: {
      textureScaleWithMap: els.textureScaleWithMap.checked,
      routeStackOrder
    },
    toggles: getToggleState(),
    styles: getStyleState(),
    texture: {
      className: "route-theme-watercolor",
      opacity: layerStyles.texture.size,
      landA: hexToRgbTriplet(styleColor("land")),
      landB: hexToRgbTriplet(styleColor("land")),
      waterA: hexToRgbTriplet(styleColor("water")),
      waterB: hexToRgbTriplet(styleColor("water"))
    }
  };
}

function routeThemeCardStyle(theme) {
  const land = theme.styles?.land?.color || "#efd6a5";
  const water = theme.styles?.water?.color || "#5bc5d7";
  return `--stadia-a:${land};--stadia-b:${water};--stadia-contours:0.18;`;
}

const SIMPLIFIED_BUILT_IN_THEME_IDS = new Set([
  "watercolor-parchment",
  "stadia-ink",
  "stadia-pirate",
  "stadia-plastic",
  "national-park",
  "desert-survey",
  "mangrove-coast",
  "miami-deco",
  "glacial-chart",
  "lavender-survey",
  "charcoal-print",
  "blueprint",
  "midnight-orchid"
]);

const SIMPLIFIED_THEME_NAMES = Object.freeze({
  "watercolor-parchment": "Gold Light",
  "stadia-ink": "Neutral Light",
  "stadia-pirate": "Brown Light",
  "stadia-plastic": "Yellow Bright",
  "national-park": "Green Light",
  "desert-survey": "Orange Light",
  "mangrove-coast": "Green Cool",
  "miami-deco": "Coral Light",
  "glacial-chart": "Blue Ice",
  "lavender-survey": "Purple Light",
  "charcoal-print": "Neutral Dark",
  "stadia-night": "Blue Night",
  "blueprint": "Blue Dark",
  "midnight-orchid": "Purple Dark"
});

const THEME_COLOR_FAMILY_OVERRIDES = Object.freeze({
  "watercolor-parchment": "Yellow",
  "stadia-ink": "Neutral",
  "stadia-pirate": "Orange",
  "stadia-plastic": "Yellow",
  "national-park": "Green",
  "desert-survey": "Orange",
  "mangrove-coast": "Green",
  "miami-deco": "Red",
  "glacial-chart": "Blue",
  "lavender-survey": "Purple",
  "charcoal-print": "Neutral",
  "stadia-night": "Blue",
  "blueprint": "Blue",
  "midnight-orchid": "Purple"
});

function routeThemeColorFamily(theme, id = "") {
  if (THEME_COLOR_FAMILY_OVERRIDES[id]) return THEME_COLOR_FAMILY_OVERRIDES[id];
  const land = normalizeHex(theme.styles?.land?.color) || "#efd6a5";
  const landHsl = hexToHsl(land);
  if (landHsl.s < 14) return "Neutral";
  if (landHsl.h < 15 || landHsl.h >= 345) return "Red";
  if (landHsl.h < 45) return "Orange";
  if (landHsl.h < 70) return "Yellow";
  if (landHsl.h < 165) return "Green";
  if (landHsl.h < 200) return "Teal";
  if (landHsl.h < 255) return "Blue";
  if (landHsl.h < 330) return "Purple";
  return "Red";
}

function routeThemeBrightness(theme) {
  const luminance = relativeLuminance(normalizeHex(theme.styles?.land?.color) || "#efd6a5");
  if (luminance >= 0.7) return "Light";
  if (luminance >= 0.35) return "Medium";
  return "Dark";
}

function visibleRouteThemeEntry(id) {
  if (!Object.prototype.hasOwnProperty.call(ROUTE_THEME_PRESETS, id)) return true;
  return SIMPLIFIED_BUILT_IN_THEME_IDS.has(id) || id === activeRouteThemeId;
}

function sortedRouteThemeEntries() {
  const groupOrder = ["Neutral", "Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple"];
  return Object.entries(allRouteThemes())
    .filter(([id]) => visibleRouteThemeEntry(id))
    .map(([id, theme]) => ({ id, theme, group: routeThemeColorFamily(theme, id) }))
    .sort((a, b) => {
      const groupDiff = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
      if (groupDiff) return groupDiff;
      const lightDiff = relativeLuminance(b.theme.styles?.land?.color || "#efd6a5") - relativeLuminance(a.theme.styles?.land?.color || "#efd6a5");
      if (Math.abs(lightDiff) > 0.001) return lightDiff;
      return (SIMPLIFIED_THEME_NAMES[a.id] || a.theme.label || a.id).localeCompare(SIMPLIFIED_THEME_NAMES[b.id] || b.theme.label || b.id);
    });
}



function renderRouteThemeGrid() {
  if (!els.routeThemeGrid) return;
  els.routeThemeGrid.replaceChildren();
  const providerHeading = document.createElement("p");
  providerHeading.className = "route-theme-group-heading";
  providerHeading.textContent = "OSM Provider Styles";
  els.routeThemeGrid.append(providerHeading);
  MAPLIBRE_STYLES.forEach(style => {
    const button = document.createElement("button");
    button.className = "map-style-card route-theme-card route-theme-card-provider";
    button.type = "button";
    button.dataset.mapProviderTheme = style.id;
    button.setAttribute("aria-pressed", String(activeRouteThemeId === `osm-${style.id}`));
    button.setAttribute("style", routeThemeCardStyle(mapLibreStyleToRouteTheme(style)));
    const title = document.createElement("strong");
    title.textContent = style.label;
    const description = document.createElement("span");
    description.textContent = style.description || "OSM provider style";
    button.append(title, description);
    els.routeThemeGrid.append(button);
  });
  let currentGroup = "";
  sortedRouteThemeEntries().forEach(({ id, theme, group }) => {
    if (group !== currentGroup) {
      currentGroup = group;
      const heading = document.createElement("p");
      heading.className = "route-theme-group-heading";
      heading.textContent = group;
      els.routeThemeGrid.append(heading);
    }
    const button = document.createElement("button");
    button.className = "map-style-card route-theme-card";
    button.type = "button";
    button.dataset.routeTheme = id;
    button.setAttribute("aria-pressed", String(id === activeRouteThemeId));
    button.setAttribute("style", routeThemeCardStyle(theme));
    const title = document.createElement("strong");
    title.textContent = SIMPLIFIED_THEME_NAMES[id] || theme.label || readableTextureName(id);
    const description = document.createElement("span");
    description.textContent = `${routeThemeBrightness(theme)} · ${themeMaterialBestMatchLabel(theme, id)}`;
    const land = theme.styles?.land?.color || "#efd6a5";
    const city = theme.styles?.cities?.color || readableTextColor(land);
    const route = theme.styles?.route?.color || "#d9442e";
    const panel = theme.uiTheme?.panel || DEFAULT_UI_THEME.panel;
    button.title = `Contrast — UI ${contrastRatio(readableTextColor(panel), panel).toFixed(1)}:1; labels ${contrastRatio(city, land).toFixed(1)}:1; route ${contrastRatio(route, land).toFixed(1)}:1`;
    button.append(title, description);
    els.routeThemeGrid.append(button);
  });
  const addButton = document.createElement("button");
  addButton.className = "map-style-card route-theme-card route-theme-card-add";
  addButton.type = "button";
  addButton.innerHTML = "<strong>New Theme</strong><span>Save current map</span>";
  addButton.addEventListener("click", saveCurrentRouteTheme);
  els.routeThemeGrid.append(addButton);
  updateCurrentThemeSummary();
  renderThemePresetGrid();
}

function updateCurrentThemeSummary() {
  const theme = allRouteThemes()[activeRouteThemeId];
  const providerStyle = String(activeRouteThemeId).startsWith("osm-")
    ? MAPLIBRE_STYLES.find(style => `osm-${style.id}` === activeRouteThemeId)
    : null;
  const activeColors = providerStyle
    ? mapLibreStyleToRouteTheme(providerStyle).styles
    : theme?.styles || activeThemeFromLayerStyles();
  const button = els.openRouteThemePicker;
  const landColor = activeColors?.land?.color || theme?.styles?.land?.color || "#25313d";
  const textColor = activeColors?.cities?.color || activeColors?.smallTowns?.color || activeColors?.capitals?.color || theme?.styles?.cities?.color || "#fff8e8";
  if (button) {
    button.style.setProperty("--current-theme-bg", landColor);
    button.style.setProperty("--current-theme-fg", textColor);
    button.style.setProperty("--current-theme-border", `color-mix(in srgb, ${landColor} 72%, ${textColor})`);
    button.title = providerStyle?.description || theme?.description || "Route map theme";
  }
  if (els.currentRouteThemeName) {
    els.currentRouteThemeName.textContent = providerStyle?.label || SIMPLIFIED_THEME_NAMES[activeRouteThemeId] || theme?.label || readableTextureName(activeRouteThemeId);
  }
  refreshUserMaterialControls();
  refreshUserMaterialRecommendationPanel();
}

function saveCurrentRouteTheme() {
  const name = prompt("Theme name");
  if (!name?.trim()) return;
  const id = `custom-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || Date.now()}`;
  const themes = loadCustomRouteThemes();
  const defaultPresetId = localStorage.getItem(THEME_PRESET_DEFAULT_KEY) || "";
  const defaultPreset = defaultPresetId && loadThemePresets()[defaultPresetId];
  themes[id] = defaultPreset
    ? mergeThemePresetIntoTheme(getCurrentRouteThemeState(name.trim()), normalizeThemePreset(defaultPresetId, defaultPreset))
    : getCurrentRouteThemeState(name.trim());
  themes[id].label = name.trim();
  saveCustomRouteThemes(themes);
  activeRouteThemeId = id;
  renderRouteThemeGrid();
  updateCurrentThemeSummary();
}

function updateCurrentRouteTheme() {
  const current = allRouteThemes()[activeRouteThemeId];
  if (!current) return;
  const themes = loadCustomRouteThemes();
  themes[activeRouteThemeId] = getCurrentRouteThemeState(
    current.label || readableTextureName(activeRouteThemeId),
    current.description || "Updated from current map"
  );
  saveCustomRouteThemes(themes);
  renderRouteThemeGrid();
  updateCurrentThemeSummary();
  els.status.textContent = `Updated theme: ${themes[activeRouteThemeId].label}`;
}



function loadStylePresets() {
  return rvStorageReadJson(STYLE_PRESETS_KEY, {}) || {};
}

function saveStylePresets(presets) {
  rvStorageWriteJson(STYLE_PRESETS_KEY, presets);
}

function renderStylePresetOptions() {
  const presets = loadStylePresets();
  els.stylePresetSelect.replaceChildren(new Option("Style presets", ""));
  Object.keys(presets).sort().forEach(name => {
    els.stylePresetSelect.append(new Option(name, name));
  });
}

document.addEventListener("DOMContentLoaded", () => {
  els.saveThemePreset?.addEventListener("click", () => renderThemePresetDialog());
  els.themePresetGrid?.addEventListener("click", event => {
    const apply = event.target.closest("[data-apply-theme-preset]");
    const edit = event.target.closest("[data-edit-theme-preset]");
    const duplicate = event.target.closest("[data-duplicate-theme-preset]");
    const presets = loadThemePresets();
    if (apply) {
      const preset = presets[apply.dataset.applyThemePreset];
      if (preset) applyThemePreset(normalizeThemePreset(apply.dataset.applyThemePreset, preset));
    }
    if (edit) {
      const preset = presets[edit.dataset.editThemePreset];
      if (preset) renderThemePresetDialog(normalizeThemePreset(edit.dataset.editThemePreset, preset));
    }
    if (duplicate) {
      const source = presets[duplicate.dataset.duplicateThemePreset];
      if (!source) return;
      const id = `theme-preset-${Date.now().toString(36)}`;
      presets[id] = {
        ...structuredClone(source),
        label: `${source.label || "Theme preset"} copy`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      saveThemePresets(presets);
      renderThemePresetGrid();
      els.status.textContent = `Copied theme preset: ${presets[id].label}.`;
    }
  });
  els.themePresetGrid?.addEventListener("dragstart", event => {
    const card = event.target.closest("[data-theme-preset]");
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-rv-theme-preset", card.dataset.themePreset);
    event.dataTransfer.setData("text/plain", card.dataset.themePreset);
  });
  els.routeThemeGrid?.addEventListener("dragover", event => {
    const card = event.target.closest("[data-route-theme]");
    if (!card || !Array.from(event.dataTransfer?.types || []).includes("application/x-rv-theme-preset")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    card.classList.add("preset-drop-target");
  });
  els.routeThemeGrid?.addEventListener("dragleave", event => {
    event.target.closest("[data-route-theme]")?.classList.remove("preset-drop-target");
  });
  els.routeThemeGrid?.addEventListener("drop", event => {
    const card = event.target.closest("[data-route-theme]");
    if (!card) return;
    const presetId = event.dataTransfer?.getData("application/x-rv-theme-preset");
    const stored = loadThemePresets()[presetId];
    card.classList.remove("preset-drop-target");
    if (!stored) return;
    event.preventDefault();
    const preset = normalizeThemePreset(presetId, stored);
    const themeId = card.dataset.routeTheme;
    const theme = getThemeForEditing(themeId);
    if (!theme) return;
    saveThemeDraft(themeId, mergeThemePresetIntoTheme(theme, preset));
    if (themeId === activeRouteThemeId) applyThemePreset(preset);
    renderRouteThemeGrid();
    els.status.textContent = `Applied ${preset.label} to ${SIMPLIFIED_THEME_NAMES[themeId] || theme.label}.`;
  });
  els.themePresetDefaultSelect?.addEventListener("change", () => {
    localStorage.setItem(THEME_PRESET_DEFAULT_KEY, els.themePresetDefaultSelect.value);
    els.status.textContent = els.themePresetDefaultSelect.value
      ? "New-theme preset selected. It will be available when creating a new theme."
      : "New themes will begin with no preset selected.";
  });
  els.themePresetView?.addEventListener("change", () => {
    localStorage.setItem("rv-map-theme-preset-view-v1", els.themePresetView.value);
    renderThemePresetGrid();
  });
  els.themePresetCategories?.addEventListener("change", updateThemePresetDialogSummary);
  els.themePresetCancel?.addEventListener("click", closeThemePresetDialog);
  els.themePresetSave?.addEventListener("click", saveThemePresetFromDialog);
  els.themePresetApply?.addEventListener("click", () => {
    const preset = editingThemePresetId && loadThemePresets()[editingThemePresetId];
    if (preset) applyThemePreset(normalizeThemePreset(editingThemePresetId, preset));
    closeThemePresetDialog();
  });
  els.themePresetDelete?.addEventListener("click", () => {
    if (!editingThemePresetId) return;
    const presets = loadThemePresets();
    const label = presets[editingThemePresetId]?.label || "Theme preset";
    delete presets[editingThemePresetId];
    saveThemePresets(presets);
    if (localStorage.getItem(THEME_PRESET_DEFAULT_KEY) === editingThemePresetId) localStorage.removeItem(THEME_PRESET_DEFAULT_KEY);
    closeThemePresetDialog();
    renderThemePresetGrid();
    els.status.textContent = `Deleted theme preset: ${label}.`;
  });
  els.stylePresetSelect?.addEventListener("change", () => {
    const presets = loadStylePresets();
    const preset = presets[els.stylePresetSelect.value];
    if (preset) applyStyleState(preset);
  });

  els.saveStylePreset?.addEventListener("click", () => {
    const name = prompt("Style preset name");
    if (!name?.trim()) return;
    const presets = loadStylePresets();
    presets[name.trim()] = getStyleState();
    saveStylePresets(presets);
    renderStylePresetOptions();
    els.stylePresetSelect.value = name.trim();
  });
  renderThemePresetGrid();
}, { once: true });
