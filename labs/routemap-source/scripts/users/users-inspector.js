"use strict";

// Users appearance, geometry fields, alignment, materials, and history controls.

function applyUserControlAppearance({ save = false, render = false } = {}) {
  const normalized = normalizeUserControlAppearance(userControlAppearance);
  Object.assign(userControlAppearance, normalized);
  const stage = els.mapCanvas?.closest?.(".map-stage");
  USER_CONTROL_APPEARANCE_SCHEMA.forEach(group => group.fields.forEach(field => {
    if (!field.css) return;
    const value = normalized[field.key];
    const cssValue = `${value}${field.unit || ""}`;
    document.documentElement.style.setProperty(field.css, cssValue);
    stage?.style.setProperty(field.css, cssValue);
  }));
  const texture = USER_MATERIAL_TEXTURES[normalized.surfaceTexture] || "none";
  const construction = USER_CONSTRUCTION_PROFILES[normalized.constructionStyle] || USER_CONSTRUCTION_PROFILES.raised;
  const derived = {
    "--user-material-texture-image": texture,
    "--user-material-effective-bevel": `${normalized.bevelDepth * construction.bevel}px`,
    "--user-material-shadow-strength": construction.shadow,
    "--user-material-highlight-percent": `${Math.round(normalized.highlightStrength * 52)}%`,
    "--user-material-edge-percent": `${Math.round(normalized.edgeContrast * 64)}%`,
    "--user-material-gloss-percent": `${Math.round(normalized.materialGloss * 44)}%`,
    "--user-material-texture-cover-percent": `${Math.round(100 - normalized.textureOpacity * 72)}%`
  };
  [document.documentElement, stage].filter(Boolean).forEach(target => {
    Object.entries(derived).forEach(([property, value]) => target.style.setProperty(property, value));
    target.dataset.userMaterial = normalized.materialPreset;
    target.dataset.userConstruction = normalized.constructionStyle;
    target.dataset.userButtonShape = normalized.buttonShape;
    target.dataset.userInlayTargets = normalized.inlayTargets;
  });
  constrainInheritedUserButtonGeometriesToShape();
  rvStorageSet(USERS_SHELL_LEATHER_COLOR_KEY, normalized.leatherColor);
  if (save) rvStorageWriteJson(USER_CONTROL_APPEARANCE_KEY, normalized);
  if (render) renderUserFrameLayout();
}

function applyUserMaterialPreset(presetId) {
  const preset = USER_MATERIAL_PRESETS[presetId];
  if (!preset) return false;
  Object.assign(userControlAppearance, cloneUserViewDraftState(preset.values), {
    materialPreset: presetId,
    sectionFill: preset.values.panelSurface,
    subsectionFill: preset.values.surfaceTint,
    sectionStroke: preset.values.buttonText,
    subsectionStroke: preset.values.buttonText
  });
  userControlAppearance.labelColor = readableTextColor(userControlAppearance.panelSurface);
  applyUserControlAppearance({ save: true, render: true });
  renderUserAppearanceSections();
  pushUserBuilderHistory(`Apply ${preset.label} material preset`);
  setUserLayoutStatus(`${preset.label} material applied.`);
  return true;
}

function usersAppearancePanelSections() {
  return [...(els.usersAppearanceSections?.children || [])]
    .filter(section => section.matches(".panel-section"));
}

function toggleUsersAppearanceSectionGroup() {
  const sections = usersAppearancePanelSections();
  const shouldCollapse = sections.some(section => !section.classList.contains("is-collapsed"));
  sections.forEach(section => setPanelSectionCollapsed(section, shouldCollapse));
}

function createUsersAppearanceSectionHeading(section, title) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "section-collapse-button";
  button.setAttribute("aria-expanded", "true");
  button.innerHTML = `<span class="section-collapse-arrow" aria-hidden="true">v</span><span class="section-collapse-title"></span>`;
  button.querySelector(".section-collapse-title").textContent = title;
  button.addEventListener("click", () => {
    setPanelSectionCollapsed(section, !section.classList.contains("is-collapsed"));
  });
  button.addEventListener("contextmenu", event => {
    event.preventDefault();
    event.stopPropagation();
    toggleUsersAppearanceSectionGroup();
  });
  return button;
}

function createUserMaterialPresetPanel() {
  const panel = document.createElement("section");
  panel.className = "users-material-preset-panel panel-section";
  panel.dataset.usersAppearanceSection = "material-presets";
  const heading = createUsersAppearanceSectionHeading(panel, "Material Presets");
  const body = document.createElement("div");
  body.className = "users-material-preset-body";
  const note = document.createElement("small");
  note.className = "users-material-preset-note";
  note.textContent = "Sets the surface, construction, and coordinated control colors. Detailed sections below remain editable.";
  const controls = document.createElement("div");
  controls.className = "users-material-preset-controls";
  const presetLabel = document.createElement("label");
  presetLabel.append(document.createTextNode("Material"));
  const presetSelect = document.createElement("select");
  Object.entries(USER_MATERIAL_PRESETS).forEach(([id, preset]) => presetSelect.append(new Option(preset.label, id)));
  presetSelect.append(new Option("Custom", "custom"));
  presetSelect.value = userControlAppearance.materialPreset;
  presetSelect.addEventListener("change", () => {
    if (presetSelect.value === "custom") {
      userControlAppearance.materialPreset = "custom";
      applyUserControlAppearance({ save: true, render: true });
      pushUserBuilderHistory("Set custom material appearance");
      return;
    }
    applyUserMaterialPreset(presetSelect.value);
  });
  presetLabel.append(presetSelect);
  const constructionLabel = document.createElement("label");
  constructionLabel.append(document.createTextNode("Construction"));
  const constructionSelect = document.createElement("select");
  [["flat", "Flat"], ["raised", "Raised"], ["recessed", "Recessed"], ["beveled", "Beveled"], ["stitched", "Stitched"], ["inset", "Inset"], ["hardware", "Instrument hardware"]].forEach(([value, label]) => constructionSelect.append(new Option(label, value)));
  constructionSelect.value = userControlAppearance.constructionStyle;
  constructionSelect.addEventListener("change", () => {
    userControlAppearance.constructionStyle = constructionSelect.value;
    userControlAppearance.materialPreset = "custom";
    applyUserControlAppearance({ save: true, render: true });
    renderUserAppearanceSections();
    pushUserBuilderHistory("Update material construction");
  });
  constructionLabel.append(constructionSelect);
  controls.append(presetLabel, constructionLabel);
  const samples = document.createElement("div");
  samples.className = "users-material-samples";
  samples.innerHTML = `<button type="button">Button</button><label>Slider<input type="range" min="0" max="100" value="62" disabled></label><label>Dropdown<select disabled><option>Option</option></select></label>`;
  body.append(note, controls, createUserMaterialRecommendationPanel(), samples);
  panel.append(heading, body);
  return panel;
}

function createUserMaterialRecommendationPanel() {
  const current = activeThemeForMaterialRecommendations();
  const recommendations = materialRecommendationsForTheme(current.theme, current.id);
  const panel = document.createElement("section");
  panel.className = "users-material-recommendations";
  const heading = document.createElement("div");
  heading.className = "users-material-recommendations-heading";
  const title = document.createElement("strong");
  title.textContent = `Recommended for ${SIMPLIFIED_THEME_NAMES[current.id] || current.theme?.label || "current theme"}`;
  const bestButton = document.createElement("button");
  bestButton.type = "button";
  bestButton.textContent = `Use best: ${recommendations.best.label} ${recommendations.best.material.toLowerCase()}`;
  bestButton.addEventListener("click", () => applyThemeMaterialRecommendation(recommendations.best));
  heading.append(title, bestButton);
  panel.append(heading);
  ["Leather", "Plastic", "Metal"].forEach(material => {
    const row = document.createElement("div");
    row.className = "users-material-recommendation-row";
    const label = document.createElement("span");
    label.textContent = material;
    const choices = document.createElement("div");
    choices.className = "users-material-recommendation-choices";
    (recommendations[material] || []).forEach(([name, color, preset]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.style.setProperty("--recommended-material-color", color);
      button.innerHTML = `<i aria-hidden="true"></i><span>${escapeHtml(name)}</span>`;
      button.title = `Apply ${name} ${material.toLowerCase()}`;
      button.addEventListener("click", () => applyThemeMaterialRecommendation({ material, label: name, color, preset }));
      choices.append(button);
    });
    row.append(label, choices);
    panel.append(row);
  });
  return panel;
}

function refreshUserMaterialRecommendationPanel() {
  const current = els.usersAppearanceSections?.querySelector(".users-material-recommendations");
  if (current) current.replaceWith(createUserMaterialRecommendationPanel());
}

let activeUserLayoutPresetId = "";

function markUserLayoutPresetModified(label = "") {
  if (!activeUserLayoutPresetId) return;
  if (/^(Apply |Save .* layout preset|Rename layout preset|Duplicate |Delete )/.test(String(label))) return;
  activeUserLayoutPresetId = "";
  renderUserLayoutPresetOptions();
}

function renderUserLayoutPresetOptions(selectedValue = null) {
  if (!els.usersLayoutPresetSelect) return;
  const presets = loadUserLayoutPresets();
  const availableIds = new Set(["builtin.smart-atlas", ...presets.map(preset => preset.id)]);
  if (selectedValue !== null) activeUserLayoutPresetId = availableIds.has(selectedValue) ? selectedValue : "";
  else if (!availableIds.has(activeUserLayoutPresetId)) activeUserLayoutPresetId = "";
  const currentName = activeUserLayoutPresetId === "builtin.smart-atlas"
    ? "Smart Atlas console"
    : presets.find(preset => preset.id === activeUserLayoutPresetId)?.name || "unsaved";
  const current = new Option(`Current layout · ${currentName}`, "");
  const separator = new Option("──────── saved presets ────────", "__preset-separator");
  separator.disabled = true;
  const smartAtlas = new Option(`${activeUserLayoutPresetId === "builtin.smart-atlas" ? "✓ " : ""}Smart Atlas console`, "builtin.smart-atlas");
  els.usersLayoutPresetSelect.replaceChildren(current, separator, smartAtlas);
  presets.forEach(preset => {
    const selectedMark = activeUserLayoutPresetId === preset.id ? "✓ " : "";
    els.usersLayoutPresetSelect.append(new Option(`${selectedMark}${preset.name}`, preset.id));
  });
  els.usersLayoutPresetSelect.value = activeUserLayoutPresetId;
  updateUserLayoutPresetManagementControls();
}

function updateUserLayoutPresetManagementControls() {
  const selected = els.usersLayoutPresetSelect?.value || "";
  const isSaved = Boolean(selected && selected !== "builtin.smart-atlas");
  if (els.usersRenameLayoutPreset) els.usersRenameLayoutPreset.disabled = !isSaved;
  if (els.usersDeleteLayoutPreset) els.usersDeleteLayoutPreset.disabled = !isSaved;
  if (els.usersDuplicateLayoutPreset) els.usersDuplicateLayoutPreset.disabled = !selected;
  if (els.usersResetLayout) els.usersResetLayout.disabled = !userViewDraft.layout.elements.length;
}

function createSmartAtlasStarterDraft() {
  const recorded = [...userViewDraft.recordedControls];
  const control = (controlId, x, y, width, height, controlConfig = {}) => ({
    type: "control",
    controlId,
    source: "builtin",
    showLabel: false,
    controlConfig,
    x,
    y,
    width,
    height
  });
  const gizmo = (templateId, key, x, y, width, height, buttonText = "") => control(
    `gizmo.${templateId}.smart-atlas-${key}`,
    x,
    y,
    width,
    height,
    { gizmoTemplateId: templateId, buttonText }
  );
  const elements = [
    {
      id: "preset-atlas-brand", type: "section", region: "top", parentId: "", label: "Smart Atlas", x: 0.015, y: 0.08, width: 0.23, height: 0.82,
      controls: [
        control("builtin.siteLogo", 0.02, 0.08, 0.28, 0.84, { gizmoTemplateId: "glow-home", buttonShape: "circle" }),
        gizmo("analog-decal", "brand", 0.33, 0.18, 0.64, 0.64)
      ]
    },
    {
      id: "preset-atlas-trip", type: "section", region: "top", parentId: "", label: "Current trip", x: 0.27, y: 0.08, width: 0.46, height: 0.82,
      controls: [gizmo("glow-display", "trip", 0.02, 0.1, 0.96, 0.8)]
    },
    {
      id: "preset-atlas-status", type: "section", region: "top", parentId: "", label: "Status", x: 0.755, y: 0.08, width: 0.23, height: 0.82,
      controls: [
        gizmo("analog-lamp", "gps", 0.04, 0.18, 0.18, 0.64),
        gizmo("analog-meter", "signal", 0.25, 0.12, 0.42, 0.76),
        gizmo("analog-display", "clock", 0.7, 0.12, 0.27, 0.76)
      ]
    },
    {
      id: "preset-atlas-navigation", type: "section", region: "left", parentId: "", label: "Navigation", x: 0.06, y: 0.03, width: 0.88, height: 0.24,
      controls: [
        gizmo("analog-wide-key", "home", 0.04, 0.08, 0.92, 0.4, "HOME"),
        gizmo("analog-wide-key", "favorites", 0.04, 0.54, 0.92, 0.4, "FAVORITES")
      ]
    },
    {
      id: "preset-atlas-map-tools", type: "section", region: "left", parentId: "", label: "Map tools", x: 0.06, y: 0.3, width: 0.88, height: 0.66,
      controls: [
        gizmo("analog-fader", "zoom", 0.05, 0.04, 0.28, 0.65),
        gizmo("analog-fader", "brightness", 0.36, 0.04, 0.28, 0.65),
        gizmo("analog-stepper", "tilt", 0.67, 0.04, 0.28, 0.28),
        control("builtin.viewWholeTrip", 0.67, 0.38, 0.28, 0.57, { gizmoTemplateId: "analog-key", buttonText: "VIEW" })
      ]
    },
    {
      id: "preset-atlas-search", type: "section", region: "right", parentId: "", label: "Search & go", x: 0.04, y: 0.025, width: 0.92, height: 0.13,
      controls: [gizmo("analog-input", "search", 0.03, 0.1, 0.94, 0.8)]
    },
    {
      id: "preset-atlas-map-view", type: "section", region: "right", parentId: "", label: "Map view", x: 0.04, y: 0.175, width: 0.92, height: 0.17,
      controls: [
        gizmo("analog-select", "map-style", 0.03, 0.08, 0.94, 0.4),
        gizmo("analog-transport", "map-modes", 0.03, 0.54, 0.94, 0.4)
      ]
    },
    {
      id: "preset-atlas-layers", type: "section", region: "right", parentId: "", label: "Route layers", x: 0.04, y: 0.365, width: 0.92, height: 0.32,
      controls: [
        gizmo("analog-toggle", "route", 0.04, 0.06, 0.42, 0.19),
        gizmo("analog-toggle", "waypoints", 0.53, 0.06, 0.42, 0.19),
        gizmo("analog-toggle", "roads", 0.04, 0.29, 0.42, 0.19),
        gizmo("analog-toggle", "places", 0.53, 0.29, 0.42, 0.19),
        gizmo("analog-display", "waypoint-list", 0.04, 0.53, 0.91, 0.42)
      ]
    },
    {
      id: "preset-atlas-summary", type: "section", region: "right", parentId: "", label: "Trip summary", x: 0.04, y: 0.715, width: 0.92, height: 0.255,
      controls: [
        gizmo("analog-meter", "distance", 0.04, 0.1, 0.35, 0.8),
        gizmo("analog-display", "summary", 0.43, 0.1, 0.53, 0.8)
      ]
    },
    {
      id: "preset-atlas-map-actions", type: "section", region: "bottom", parentId: "", label: "Map actions", x: 0.015, y: 0.08, width: 0.28, height: 0.84,
      controls: [
        gizmo("analog-wide-key", "center-map", 0.02, 0.15, 0.47, 0.7, "CENTER MAP"),
        gizmo("analog-wide-key", "recenter", 0.51, 0.15, 0.47, 0.7, "RE-CENTER")
      ]
    },
    {
      id: "preset-atlas-playback", type: "section", region: "bottom", parentId: "", label: "Playback", x: 0.32, y: 0.08, width: 0.38, height: 0.84,
      controls: [
        control("builtin.previousDay", 0.02, 0.08, 0.25, 0.84, { gizmoTemplateId: "analog-round-key", buttonShape: "circle", buttonText: "◀" }),
        gizmo("analog-display", "day-counter", 0.3, 0.25, 0.4, 0.5),
        control("builtin.nextDay", 0.73, 0.08, 0.25, 0.84, { gizmoTemplateId: "analog-round-key", buttonShape: "circle", buttonText: "▶" })
      ]
    },
    {
      id: "preset-atlas-trip-actions", type: "section", region: "bottom", parentId: "", label: "Trip actions", x: 0.725, y: 0.08, width: 0.26, height: 0.84,
      controls: [
        gizmo("analog-wide-key", "overview", 0.02, 0.15, 0.47, 0.7, "OVERVIEW"),
        gizmo("analog-wide-key", "statistics", 0.51, 0.15, 0.47, 0.7, "TRIP STATS")
      ]
    }
  ];
  const next = serializeUserViewDraft();
  next.layout = { elements };
  next.recordedControls = recorded;
  return sanitizeUserViewDraft(next);
}

function applyUserLayoutPreset(preset) {
  restoreUserDevicePreview();
  const builtIn = preset === "builtin.smart-atlas";
  const saved = builtIn ? null : loadUserLayoutPresets().find(candidate => candidate.id === preset);
  if (!builtIn && !saved) return false;
  const previous = {
    draft: serializeUserViewDraft(),
    frame: normalizeUserFrameGeometryRecord(userFrameGeometryForStorage()),
    appearance: normalizeUserControlAppearance(userControlAppearance)
  };
  try {
    if (saved?.appearance) {
      Object.assign(userControlAppearance, normalizeUserControlAppearance(saved.appearance));
      applyUserControlAppearance({ save: true, render: false });
      renderUserAppearanceSections();
    }
    const geometry = builtIn ? { top: 118, right: 280, bottom: 132, left: 190 } : saved.frame;
    if (geometry) {
      setUserFrameGeometry(geometry, { activeEdges: ["top", "right", "bottom", "left"], render: false, resizeMap: true });
      saveUserFrameGeometry();
    }
    applyUserViewDraftState(builtIn ? createSmartAtlasStarterDraft() : saved.draft);
  } catch {
    Object.assign(userControlAppearance, previous.appearance);
    applyUserControlAppearance({ save: true, render: false });
    setUserFrameGeometry(previous.frame, { activeEdges: ["top", "right", "bottom", "left"], render: false, resizeMap: true });
    applyUserViewDraftState(previous.draft);
    renderUserAppearanceSections();
    setUserLayoutStatus("That preset could not be applied. The current layout was restored.", true);
    return false;
  }
  pushUserBuilderHistory(builtIn ? "Apply Smart Atlas starter" : `Apply ${saved.name} layout preset`);
  setUserLayoutStatus(`${builtIn ? "Smart Atlas starter" : saved.name} applied.`);
  renderUserLayoutPresetOptions(preset);
  return true;
}

function openUserLayoutPresetDialog({ title, initialName = "", submitLabel, destructive = false, onSubmit }) {
  userQuery("#usersLayoutPresetDialog")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "usersLayoutPresetDialog";
  overlay.className = "users-layout-preset-dialog";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  const form = document.createElement("form");
  form.className = "users-layout-preset-card";
  const heading = document.createElement("strong");
  heading.textContent = title;
  form.append(heading);
  let input = null;
  if (initialName !== null) {
    const label = document.createElement("label");
    label.textContent = "Name";
    input = document.createElement("input");
    input.name = "name";
    input.type = "text";
    input.maxLength = 60;
    input.autocomplete = "off";
    input.required = true;
    input.value = initialName;
    label.append(input);
    form.append(label);
  }
  const actions = document.createElement("div");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = submitLabel;
  if (destructive) submit.classList.add("is-destructive");
  actions.append(cancel, submit);
  form.append(actions);
  overlay.append(form);
  document.body.append(overlay);
  (input || cancel).focus();
  input?.select();
  cancel.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("pointerdown", event => { if (event.target === overlay) overlay.remove(); });
  overlay.addEventListener("keydown", event => { if (event.key === "Escape") overlay.remove(); });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = input ? input.value.trim() : "";
    if (input && !name) return;
    if (onSubmit(name) === false) return;
    overlay.remove();
  });
}

function openUserLayoutPresetNamingDialog() {
  openUserLayoutPresetDialog({
    title: "Save layout preset",
    initialName: "",
    submitLabel: "Save preset",
    onSubmit: name => {
    const presets = loadUserLayoutPresets();
    const id = `layout-preset-${Date.now().toString(36)}`;
    presets.push({ id, name, draft: serializeUserViewDraft(), frame: { ...userFrameGeometryForStorage() }, appearance: cloneUserViewDraftState(userControlAppearance) });
      if (!saveUserLayoutPresets(presets)) return false;
    renderUserLayoutPresetOptions(id);
      pushUserBuilderHistory(`Save ${name} layout preset`);
    setUserLayoutStatus(`${name} preset saved.`);
      return true;
    }
  });
}

function renameSelectedUserLayoutPreset() {
  const id = els.usersLayoutPresetSelect?.value || "";
  const presets = loadUserLayoutPresets();
  const preset = presets.find(candidate => candidate.id === id);
  if (!preset) return false;
  openUserLayoutPresetDialog({
    title: "Rename layout preset",
    initialName: preset.name,
    submitLabel: "Rename preset",
    onSubmit: name => {
      preset.name = name;
      if (!saveUserLayoutPresets(presets)) return false;
      renderUserLayoutPresetOptions(id);
      pushUserBuilderHistory(`Rename layout preset to ${name}`);
      setUserLayoutStatus(`Preset renamed to ${name}.`);
      return true;
    }
  });
  return true;
}

function uniqueUserLayoutPresetName(baseName, presets) {
  const names = new Set(presets.map(preset => preset.name.toLocaleLowerCase()));
  let name = `${baseName} copy`.slice(0, 60);
  let suffix = 2;
  while (names.has(name.toLocaleLowerCase())) {
    const ending = ` copy ${suffix++}`;
    name = `${baseName.slice(0, 60 - ending.length)}${ending}`;
  }
  return name;
}

function duplicateSelectedUserLayoutPreset() {
  const selected = els.usersLayoutPresetSelect?.value || "";
  if (!selected) return false;
  const presets = loadUserLayoutPresets();
  const builtIn = selected === "builtin.smart-atlas";
  const source = builtIn ? {
    name: "Smart Atlas starter",
    draft: createSmartAtlasStarterDraft(),
    frame: { top: 118, right: 280, bottom: 132, left: 190 },
    appearance: normalizeUserControlAppearance(userControlAppearance)
  } : presets.find(preset => preset.id === selected);
  if (!source) return false;
  const id = `layout-preset-${Date.now().toString(36)}`;
  const name = uniqueUserLayoutPresetName(source.name, presets);
  presets.push({
    id,
    name,
    draft: cloneUserViewDraftState(source.draft),
    frame: { ...source.frame },
    appearance: cloneUserViewDraftState(source.appearance)
  });
  if (!saveUserLayoutPresets(presets)) return false;
  renderUserLayoutPresetOptions(id);
  pushUserBuilderHistory(`Duplicate ${source.name} layout preset`);
  setUserLayoutStatus(`${name} preset created.`);
  return true;
}

function deleteSelectedUserLayoutPreset() {
  const id = els.usersLayoutPresetSelect?.value || "";
  const presets = loadUserLayoutPresets();
  const preset = presets.find(candidate => candidate.id === id);
  if (!preset) return false;
  openUserLayoutPresetDialog({
    title: `Delete “${preset.name}”?`,
    initialName: null,
    submitLabel: "Delete preset",
    destructive: true,
    onSubmit: () => {
      if (!saveUserLayoutPresets(presets.filter(candidate => candidate.id !== id))) return false;
      activeUserLayoutPresetId = "";
      renderUserLayoutPresetOptions();
      pushUserBuilderHistory(`Delete ${preset.name} layout preset`);
      setUserLayoutStatus(`${preset.name} preset deleted.`);
      return true;
    }
  });
  return true;
}

function clearCurrentUserLayout() {
  if (!userViewDraft.layout.elements.length) return false;
  openUserLayoutPresetDialog({
    title: "Clear the current layout?",
    initialName: null,
    submitLabel: "Clear layout",
    destructive: true,
    onSubmit: () => {
      const draft = serializeUserViewDraft();
      const returnedControls = draft.layout.elements.flatMap(element =>
        (element.controls || []).filter(control => control.source !== "builtin").map(control => control.controlId)
      );
      draft.recordedControls = [...new Set([...draft.recordedControls, ...returnedControls])];
      draft.layout = { elements: [] };
      applyUserViewDraftState(draft);
      activeUserLayoutPresetId = "";
      renderUserLayoutPresetOptions();
      pushUserBuilderHistory("Clear User layout");
      setUserLayoutStatus("The layout was cleared. Recorded controls were returned to the library.");
      return true;
    }
  });
  return true;
}

function userAppearanceEditorContext() {
  const selectedElements = selectedUserLayoutElements();
  const selectedControls = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
  if (selectedControls.length === 1 && selectedElements.length === 0) {
    const placement = selectedControls[0];
    const definition = userLayoutBuiltinControl(placement.item.controlId);
    const entry = getSettingEntry(placement.item.controlId);
    const type = String(definition?.controlType || (definition ? "button" : entry?.controlType || entry?.type || "")).toLowerCase();
    const groups = ["button", "icon-button"].includes(type) ? ["Buttons", "Inlays", "Labels & Typography"]
      : ["range", "knob", "meter"].includes(type) ? ["Sliders", "Labels & Typography"]
        : ["select", "segmented"].includes(type) ? ["Dropdowns", "Labels & Typography"]
          : ["checkbox", "radio", "toggle", "light"].includes(type) ? ["Checkboxes & Toggles", "Labels & Typography"]
            : type === "color" ? ["Color Controls", "Labels & Typography"]
              : type === "decal" ? ["Labels & Typography"]
              : ["Text Fields", "Labels & Typography"];
    return { label: `Gizmo appearance · ${userLayoutControlDisplayLabel(placement.item)}`, groups, showMaterialPresets: false };
  }
  if (selectedElements.length === 1 && selectedControls.length === 0) {
    const element = selectedElements[0];
    if (element.type === "divider") return { label: "Divider appearance", groups: ["Dividers", "Inlays"], showMaterialPresets: false };
    const subsection = Boolean(element.parentId);
    return {
      label: `${subsection ? "Subsection" : "Section"} appearance · ${element.label || (subsection ? "Subsection" : "Section")}`,
      groups: [subsection ? "Subsections" : "Sections"],
      showMaterialPresets: false
    };
  }
  if (selectedElements.length + selectedControls.length > 1) {
    return { label: "Multiple selection", groups: [], showMaterialPresets: false };
  }
  return { label: "Global User UI appearance", groups: ["Materials"], showMaterialPresets: true };
}

function renderUserAppearanceSections() {
  const host = els.usersAppearanceSections;
  if (!host) return;
  const context = userAppearanceEditorContext();
  const hadRenderedSections = host.children.length > 0;
  const collapsedSections = new Set(
    [...host.querySelectorAll(":scope > [data-users-appearance-section].is-collapsed")]
      .map(section => section.dataset.usersAppearanceSection)
  );
  host.replaceChildren();
  const contextHeading = document.createElement("div");
  contextHeading.className = "users-appearance-context-heading";
  const contextEyebrow = document.createElement("span");
  contextEyebrow.textContent = selectedUserLayoutElementIds.size || selectedUserLayoutControlIds.size ? "Selected object" : "Frame defaults";
  const contextTitle = document.createElement("strong");
  contextTitle.textContent = context.label;
  contextHeading.append(contextEyebrow, contextTitle);
  const selectedGizmo = selectedUserLayoutControlIds.size === 1
    ? findUserLayoutControl([...selectedUserLayoutControlIds][0])
    : null;
  const selectedGizmoTemplate = userGizmoTemplate(normalizeUserLayoutControlConfig(selectedGizmo?.item?.controlConfig).gizmoTemplateId)
    || userGizmoTemplateFromControlId(selectedGizmo?.item?.controlId);
  const selectedGizmoDefinition = selectedGizmoTemplate || userLayoutBuiltinControl(selectedGizmo?.item?.controlId);
  if (selectedGizmoTemplate || selectedGizmoDefinition?.gizmo) {
    const styleLabel = document.createElement("label");
    styleLabel.className = "users-gizmo-style-picker";
    const styleCaption = document.createElement("span");
    styleCaption.textContent = "Gizmo style";
    const styleSelect = document.createElement("select");
    const currentKind = selectedGizmoDefinition.controlType || selectedGizmoDefinition.kind;
    USER_GIZMO_CATEGORIES.forEach(category => {
      const group = document.createElement("optgroup");
      group.label = category.label;
      category.items.filter(item => {
        const family = kind => ["button", "icon-button", "transport", "direction"].includes(kind) ? "button"
          : ["range", "knob", "meter"].includes(kind) ? "continuous"
            : ["toggle", "light"].includes(kind) ? "indicator"
              : ["display", "display-panel"].includes(kind) ? "display"
                : ["select", "segmented"].includes(kind) ? "choice"
                  : ["text", "search", "date"].includes(kind) ? "input"
                : kind;
        return family(item.kind) === family(currentKind);
      }).forEach(item => group.append(new Option(item.label, item.id)));
      if (group.children.length) styleSelect.append(group);
    });
    styleSelect.value = selectedGizmoTemplate?.id || "";
    styleSelect.addEventListener("change", () => {
      const nextTemplate = userGizmoTemplate(styleSelect.value);
      if (!nextTemplate) return;
      selectedGizmo.item.controlConfig = normalizeUserLayoutControlConfig({ ...selectedGizmo.item.controlConfig, gizmoTemplateId: nextTemplate.id });
      renderUserViewDraftUi();
      renderUserAppearanceSections();
      pushUserBuilderHistory(`Change gizmo style to ${nextTemplate.label}`);
    });
    styleLabel.append(styleCaption, styleSelect);
    contextHeading.append(styleLabel);
    const lockLabel = document.createElement("label");
    lockLabel.className = "users-gizmo-style-lock";
    const lockInput = document.createElement("input");
    lockInput.type = "checkbox";
    lockInput.checked = normalizeUserLayoutControlConfig(selectedGizmo.item.controlConfig).alwaysUseStyle;
    lockInput.addEventListener("change", () => {
      selectedGizmo.item.controlConfig = normalizeUserLayoutControlConfig({
        ...selectedGizmo.item.controlConfig,
        alwaysUseStyle: lockInput.checked
      });
      pushUserBuilderHistory(`${lockInput.checked ? "Lock" : "Follow collection for"} ${userLayoutControlDisplayLabel(selectedGizmo.item)} Gizmo style`);
    });
    lockLabel.append(lockInput, " Always use this Gizmo style");
    contextHeading.append(lockLabel);
  }
  host.append(contextHeading);
  if (selectedGizmo && typeof sfxCreateGizmoSection === "function") {
    host.append(sfxCreateGizmoSection(selectedGizmo));
  }
  if (context.showMaterialPresets) {
    const materialPanel = createUserMaterialPresetPanel();
    if (collapsedSections.has("material-presets")) setPanelSectionCollapsed(materialPanel, true);
    host.append(materialPanel);
  }
  USER_CONTROL_APPEARANCE_SCHEMA.filter(group => context.groups.includes(group.title)).forEach((group, groupIndex) => {
    const section = document.createElement("section");
    section.className = "users-appearance-group panel-section";
    section.dataset.usersAppearanceSection = `appearance-${group.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const heading = createUsersAppearanceSectionHeading(section, group.title);
    const fields = document.createElement("div");
    fields.className = "users-appearance-fields";
    const selectedControl = selectedUserLayoutControlIds.size === 1
      ? findUserLayoutControl([...selectedUserLayoutControlIds][0])
      : null;
    const currentAppearance = () => selectedControl ? effectiveUserControlAppearance(selectedControl.item) : userControlAppearance;
    const readFieldValue = field => selectedControl && field.key === "buttonShape"
      ? userLayoutControlButtonShape(selectedControl.item)
      : currentAppearance()[field.key];
    const writeFieldValue = (field, value) => {
      if (!selectedControl) {
        userControlAppearance[field.key] = value;
        return;
      }
      if (field.key === "buttonShape") {
        selectedControl.item.controlConfig = normalizeUserLayoutControlConfig({ ...selectedControl.item.controlConfig, buttonShape: value });
        return;
      }
      selectedControl.item.appearance = normalizeUserControlAppearanceOverrides({ ...selectedControl.item.appearance, [field.key]: value });
    };
    const syncConditionalFields = () => {
      fields.querySelectorAll("[data-user-appearance-condition]").forEach(label => {
        const condition = JSON.parse(label.dataset.userAppearanceCondition || "{}");
        label.hidden = !condition.values?.includes(currentAppearance()[condition.key]);
      });
      const workbench = fields.querySelector(".users-divider-style-workbench");
      if (workbench) workbench.hidden = userControlAppearance.dividerStyle !== "custom";
    };
    group.fields.filter(field => !field.hidden).forEach(field => {
      const label = document.createElement("label");
      label.className = "users-appearance-field";
      if (field.showWhen) label.dataset.userAppearanceCondition = JSON.stringify(field.showWhen);
      const caption = document.createElement("span");
      caption.textContent = field.label;
      const input = field.type === "select" ? document.createElement("select") : document.createElement("input");
      if (field.type !== "select") input.type = field.type;
      if (field.type === "select") {
        (field.options || []).forEach(([value, text]) => input.append(new Option(text, value)));
      }
      input.dataset.userAppearanceKey = field.key;
      if (field.type === "range") {
        input.min = String(field.min);
        input.max = String(field.max);
        input.step = String(field.step);
      }
      input.value = String(readFieldValue(field));
      input.addEventListener("input", () => {
        const value = field.type === "color" || field.type === "select" ? input.value : Number(input.value);
        writeFieldValue(field, value);
        if (!selectedControl && group.title === "Materials") {
          userControlAppearance.materialPreset = "custom";
          const presetSelect = host.querySelector(".users-material-preset-controls select");
          if (presetSelect) presetSelect.value = "custom";
        }
        if (selectedControl) renderUserFrameLayout();
        else applyUserControlAppearance({ render: true });
        syncConditionalFields();
      });
      input.addEventListener("change", () => {
        const value = field.type === "color" || field.type === "select" ? input.value : Number(input.value);
        writeFieldValue(field, value);
        if (!selectedControl && group.title === "Materials") {
          userControlAppearance.materialPreset = "custom";
          const presetSelect = host.querySelector(".users-material-preset-controls select");
          if (presetSelect) presetSelect.value = "custom";
        }
        if (selectedControl) renderUserFrameLayout();
        else applyUserControlAppearance({ save: true, render: true });
        syncConditionalFields();
        pushUserBuilderHistory(`Update ${group.title.toLowerCase()} appearance`);
      });
      label.append(caption, input);
      fields.append(label);
    });
    if (group.title === "Dividers") fields.append(createUserDividerStyleWorkbench());
    syncConditionalFields();
    section.append(heading, fields);
    const wasCollapsed = collapsedSections.has(section.dataset.usersAppearanceSection);
    setPanelSectionCollapsed(section, hadRenderedSections ? wasCollapsed : groupIndex !== 0);
    host.append(section);
  });
  updatePanelSectionChrome();
}

function createUserDividerStyleWorkbench() {
  const workbench = document.createElement("section");
  workbench.className = "users-divider-style-workbench";
  workbench.setAttribute("aria-label", "Custom divider style workbench placeholder");
  const heading = document.createElement("strong");
  heading.textContent = "Custom line workbench";
  const note = document.createElement("small");
  note.textContent = "Vector editor foundation: sketch with a mouse or pen, then refine anchors and curve handles.";
  const tools = document.createElement("div");
  tools.className = "users-divider-workbench-tools";
  [["draw", "Draw"], ["pen", "Pen"], ["anchor", "Anchors"], ["curve", "Curves"]].forEach(([mode, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.dividerWorkbenchMode = mode;
    button.classList.toggle("is-active", mode === userDividerStyleWorkbenchMode);
    button.textContent = label;
    button.addEventListener("click", () => {
      userDividerStyleWorkbenchMode = mode;
      tools.querySelectorAll("button").forEach(candidate => candidate.classList.toggle("is-active", candidate === button));
    });
    tools.append(button);
  });
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 120;
  canvas.className = "users-divider-style-canvas";
  canvas.setAttribute("aria-label", "Custom divider drawing placeholder");
  initializeUserDividerStyleWorkbench(canvas);
  workbench.append(heading, note, tools, canvas);
  return workbench;
}

function initializeUserDividerStyleWorkbench(canvas) {
  const draw = () => {
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = userControlAppearance.dividerColor || "#fff8e8";
    context.lineWidth = Math.max(2, Number(userControlAppearance.dividerWidth) || 3);
    context.lineCap = "round";
    if (userDividerStyleWorkbenchPoints.length < 2) {
      context.setLineDash([8, 7]);
      context.beginPath(); context.moveTo(28, 60); context.lineTo(452, 60); context.stroke();
      context.setLineDash([]);
      return;
    }
    context.beginPath();
    userDividerStyleWorkbenchPoints.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.stroke();
    if (userDividerStyleWorkbenchMode === "anchor" || userDividerStyleWorkbenchMode === "curve") {
      userDividerStyleWorkbenchPoints.forEach(point => {
        context.fillStyle = "#e34f9b"; context.beginPath(); context.arc(point.x, point.y, 5, 0, Math.PI * 2); context.fill();
      });
    }
  };
  let drawing = false;
  canvas.addEventListener("pointerdown", event => {
    drawing = true;
    if (userDividerStyleWorkbenchMode === "draw") userDividerStyleWorkbenchPoints = [];
    const rect = canvas.getBoundingClientRect();
    userDividerStyleWorkbenchPoints.push({ x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height });
    canvas.setPointerCapture?.(event.pointerId);
    draw();
  });
  canvas.addEventListener("pointermove", event => {
    if (!drawing || userDividerStyleWorkbenchMode !== "draw") return;
    const rect = canvas.getBoundingClientRect();
    userDividerStyleWorkbenchPoints.push({ x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height });
    draw();
  });
  canvas.addEventListener("pointerup", () => { drawing = false; draw(); });
  canvas.addEventListener("pointercancel", () => { drawing = false; });
  draw();
}



function updateUserArrangementControls() {
  const count = selectedUserLayoutControlIds.size || selectedUserLayoutElementIds.size;
  userQueryAll("[data-user-arrange]").forEach(button => {
    button.disabled = count < 2;
  });
  if (els.usersArrangeGridButton) els.usersArrangeGridButton.disabled = count < 2;
  userQueryAll("[data-user-snap]").forEach(button => {
    button.classList.toggle("is-active", button.dataset.userSnap === userLayoutSnapMode);
  });
  if (els.usersFreeTransformToggle) {
    els.usersFreeTransformToggle.setAttribute("aria-pressed", String(userLayoutFreeTransform));
    els.usersFreeTransformToggle.classList.toggle("is-active", userLayoutFreeTransform);
  }
}

function setUserLayoutFreeTransform(enabled, { announce = true } = {}) {
  userLayoutFreeTransform = Boolean(enabled);
  document.body.classList.toggle("users-free-transform-active", userLayoutFreeTransform);
  updateUserArrangementControls();
  if (announce) {
    setUserLayoutStatus(userLayoutFreeTransform
      ? "Free transform enabled. Snapping and spacing barriers are off; frame bounds remain active."
      : "Free transform disabled. Smart placement rules are active.");
  }
}

function setUsersEditorPane(paneId) {
  const next = ["geometry", "control", "transform"].includes(paneId) ? paneId : "geometry";
  userQueryAll("[data-users-editor-pane]").forEach(button => {
    button.setAttribute("aria-selected", String(button.dataset.usersEditorPane === next));
  });
  userQueryAll("[data-users-editor-content]").forEach(content => {
    content.hidden = content.dataset.usersEditorContent !== next;
  });
}

function updateUserGeometryFields() {
  const fields = els.usersGeometryFields;
  if (!fields) return;
  const selected = selectedUserLayoutElements();
  const selectedControls = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
  fields.hidden = selected.length !== 1 && selectedControls.length !== 1;
  if (fields.hidden) {
    if (els.usersControlInspector) els.usersControlInspector.hidden = true;
    return;
  }
  updateUserControlInspector(selectedControls);
  const selectedElement = selected.length === 1 ? selected[0] : null;
  const canName = selectedElement?.type === "section";
  const canRotate = selectedElement?.type === "divider";
  if (els.usersGeometryNameLabel) els.usersGeometryNameLabel.hidden = !canName;
  if (els.usersGeometryRotationLabel) els.usersGeometryRotationLabel.hidden = !canRotate;
  if (els.usersElementContainerLabel) els.usersElementContainerLabel.hidden = !canName;
  if (canName && els.usersGeometryName) els.usersGeometryName.value = selectedElement.label || (selectedElement.parentId ? "Subsection" : "Section");
  if (canName) updateUserElementContainerOptions(selectedElement);
  if (canRotate && els.usersGeometryRotation) {
    const metrics = userLayoutHostMetrics(liveUserLayoutHost(selectedElement));
    const dx = (selectedElement.x2 - selectedElement.x1) * (metrics?.width || 1);
    const dy = (selectedElement.y2 - selectedElement.y1) * (metrics?.height || 1);
    els.usersGeometryRotation.value = String(Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10);
  }
  let values;
  if (selectedControls.length === 1) {
    const placement = selectedControls[0];
    const content = userQuery(userLayoutElementSelector("data-layout-parent-id", placement.section.id));
    const rect = content?.getBoundingClientRect();
    if (!rect) return;
    values = {
      x: Math.round(placement.item.x * rect.width),
      y: Math.round(placement.item.y * rect.height),
      width: Math.round(placement.item.width * rect.width),
      height: Math.round(placement.item.height * rect.height)
    };
  } else {
    const element = selected[0];
    const metrics = userLayoutHostMetrics(liveUserLayoutHost(element));
    if (!metrics) return;
    values = userGeometryValuesForElement(element, metrics);
  }
  fields.querySelectorAll("[data-user-geometry]").forEach(input => {
    input.value = String(values[input.dataset.userGeometry]);
    input.classList.remove("is-invalid");
  });
  if (els.usersGeometryError) els.usersGeometryError.hidden = true;
}

function updateUserControlInspector(selectedControls = []) {
  const placement = selectedControls.length === 1 ? selectedControls[0] : null;
  if (els.usersControlInspector) els.usersControlInspector.hidden = !placement;
  if (!placement) return;
  if (els.usersControlCustomLabel) els.usersControlCustomLabel.value = placement.item.customLabel || "";
  if (els.usersControlShowLabel) els.usersControlShowLabel.checked = placement.item.showLabel !== false;
  if (els.usersControlContainer) {
    const sections = userLayoutElements().filter(element => element.type === "section");
    els.usersControlContainer.replaceChildren(...sections.map(section => {
      const depth = section.parentId ? 1 : 0;
      const region = section.region ? `${section.region.charAt(0).toUpperCase()}${section.region.slice(1)}` : "Frame";
      return new Option(`${depth ? "\u2514 " : ""}${section.label || (depth ? "Subsection" : "Section")} (${region})`, section.id);
    }));
    els.usersControlContainer.value = placement.section.id;
  }
  renderUserControlTypeOptions(placement);
}

function userControlConfigField(labelText, value, onCommit, { type = "text", inputMode = "decimal", options = [] } = {}) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = type === "select" ? document.createElement("select") : document.createElement("input");
  if (type !== "select") input.type = type;
  if (type === "select") options.forEach(([optionValue, optionLabel]) => input.append(new Option(optionLabel, optionValue)));
  if (inputMode) input.inputMode = inputMode;
  if (type === "checkbox") input.checked = Boolean(value);
  else input.value = String(value ?? "");
  input.addEventListener(type === "checkbox" ? "change" : "change", () => onCommit(type === "checkbox" ? input.checked : input.value));
  label.append(input);
  return label;
}

function renderUserControlTypeOptions(placement) {
  const host = els.usersControlTypeOptions;
  if (!host) return;
  host.replaceChildren();
  if (!placement) return;
  const item = placement.item;
  const definition = userLayoutBuiltinControl(item.controlId);
  const entry = getSettingEntry(item.controlId);
  const type = definition ? "button" : entry?.controlType || "";
  const config = normalizeUserLayoutControlConfig(item.controlConfig);
  if (type === "button") {
    host.append(
      userControlConfigField("Button text", config.buttonText || definition?.text || "", value => applyUserControlConfig({ buttonText: value }), { inputMode: "text" }),
      userControlConfigField("Shape", config.buttonShape, value => applyUserControlConfig({ buttonShape: value }), {
        type: "select",
        inputMode: "",
        options: [["inherit", "Use appearance default"], ["rounded", "Rounded"], ["pill", "Pill"], ["circle", "Circle"], ["square", "Square"]]
      })
    );
    return;
  }
  if (type === "range") {
    const source = resolveSettingSource(entry);
    host.append(
      userControlConfigField("Minimum", config.rangeMin || source?.min || "", value => applyUserControlConfig({ rangeMin: value })),
      userControlConfigField("Maximum", config.rangeMax || source?.max || "", value => applyUserControlConfig({ rangeMax: value })),
      userControlConfigField("Step", config.rangeStep || source?.step || "", value => applyUserControlConfig({ rangeStep: value })),
      userControlConfigField("Show value", config.showValue, value => applyUserControlConfig({ showValue: value }), { type: "checkbox", inputMode: "" })
    );
    return;
  }
  if (type === "select") {
    const label = document.createElement("label");
    label.className = "users-control-options-list";
    label.textContent = "Dropdown options (Label = value)";
    const textarea = document.createElement("textarea");
    const source = resolveSettingSource(entry);
    const choices = config.selectOptions.length
      ? config.selectOptions
      : Array.from(source?.options || []).map(option => ({ label: option.textContent, value: option.value }));
    textarea.value = choices.map(option => `${option.label} = ${option.value}`).join("\n");
    textarea.addEventListener("change", () => {
      const options = textarea.value.split(/\r?\n/).map(line => {
        const separator = line.indexOf("=");
        const labelText = (separator >= 0 ? line.slice(0, separator) : line).trim();
        const value = (separator >= 0 ? line.slice(separator + 1) : line).trim();
        return { label: labelText, value };
      }).filter(option => option.label && option.value);
      if (!options.length) {
        showUserGeometryError("Add at least one dropdown option using Label = value.");
        return;
      }
      applyUserControlConfig({ selectOptions: options });
    });
    label.append(textarea);
    host.append(label);
  }
}

function applyUserControlConfig(patch = {}) {
  const selected = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
  if (selected.length !== 1) return false;
  const placement = selected[0];
  const item = placement.item;
  const next = normalizeUserLayoutControlConfig({ ...item.controlConfig, ...patch });
  const entry = getSettingEntry(item.controlId);
  if (entry?.controlType === "range") {
    const minimum = next.rangeMin === "" ? null : Number(next.rangeMin);
    const maximum = next.rangeMax === "" ? null : Number(next.rangeMax);
    const step = next.rangeStep === "" ? null : Number(next.rangeStep);
    if ((minimum != null && maximum != null && minimum >= maximum) || (step != null && step <= 0)) {
      showUserGeometryError("Range minimum must be below maximum, and step must be greater than zero.");
      return false;
    }
  }
  const candidate = cloneUserViewDraftState(item);
  candidate.controlConfig = next;
  if (Object.prototype.hasOwnProperty.call(patch, "buttonShape") && userLayoutControlUsesSquareGeometry(candidate)) {
    const content = userQuery(userLayoutElementSelector("data-layout-parent-id", placement.section.id));
    const rect = content?.getBoundingClientRect();
    if (!rect) return false;
    squareUserLayoutControlCandidate(candidate, rect);
    if (!userLayoutControlCandidateFits(placement.section, candidate, item.controlId)) {
      showUserGeometryError("There is not enough clear square space for that button shape. Move the control or enlarge its section first.");
      return false;
    }
  }
  Object.assign(item, candidate);
  fieldsClearUserGeometryError();
  renderUserFrameLayout();
  updateUserGeometryFields();
  pushUserBuilderHistory("Configure User UI control");
  return true;
}

function applyUserControlInspectorSettings({ customLabel, showLabel } = {}) {
  const selected = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
  if (selected.length !== 1) return false;
  const item = selected[0].item;
  const nextLabel = customLabel == null ? item.customLabel || "" : String(customLabel).trim().slice(0, 80);
  const nextShowLabel = showLabel == null ? item.showLabel !== false : Boolean(showLabel);
  if (item.customLabel === nextLabel && (item.showLabel !== false) === nextShowLabel) return true;
  item.customLabel = nextLabel;
  item.showLabel = nextShowLabel;
  renderUserFrameLayout();
  updateUserGeometryFields();
  pushUserBuilderHistory("Update User UI control label");
  return true;
}

function moveSelectedUserControlToSection(sectionId) {
  const selected = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
  if (selected.length !== 1 || selected[0].section.id === sectionId) return false;
  const controlId = selected[0].item.controlId;
  const label = userLayoutControlDisplayLabel(selected[0].item);
  const moved = placeUserLayoutControl(controlId, sectionId, "layout", { mode: "smart", anchorX: 0, anchorY: 0 }, { allowReposition: true });
  if (moved) {
    selectUserLayoutControl(controlId);
    setUserLayoutStatus(`${label} moved to another section.`);
  }
  return moved;
}

function updateUserElementContainerOptions(section) {
  if (!els.usersElementContainer || !section) return;
  const excluded = userLayoutSectionDescendants(section.id);
  excluded.add(section.id);
  const regionLabel = `${section.region.charAt(0).toUpperCase()}${section.region.slice(1)} frame area`;
  const options = [new Option(regionLabel, "")];
  userLayoutElements()
    .filter(candidate => candidate.type === "section" && candidate.region === section.region && !excluded.has(candidate.id) && userLayoutSectionDepth(candidate) < 2)
    .sort((a, b) => userLayoutSectionDepth(a) - userLayoutSectionDepth(b) || String(a.label).localeCompare(String(b.label)))
    .forEach(candidate => {
      const depth = userLayoutSectionDepth(candidate);
      options.push(new Option(`${"\u2514 ".repeat(depth + 1)}${candidate.label || "Section"}`, candidate.id));
    });
  els.usersElementContainer.replaceChildren(...options);
  els.usersElementContainer.value = section.parentId || "";
}

function reparentSelectedUserSection(parentId = "") {
  const selected = selectedUserLayoutElements();
  const section = selected.length === 1 && selected[0].type === "section" ? selected[0] : null;
  if (!section || (section.parentId || "") === parentId) return false;
  const parent = parentId ? userLayoutElementById(parentId) : null;
  const excluded = userLayoutSectionDescendants(section.id);
  if ((parentId && (!parent || parent.type !== "section" || parent.region !== section.region)) || excluded.has(parentId) || parentId === section.id) {
    showUserGeometryError("That container would create an invalid section hierarchy.");
    updateUserElementContainerOptions(section);
    return false;
  }
  const nextDepth = parent ? userLayoutSectionDepth(parent) + 1 : 0;
  if (nextDepth + userLayoutSectionSubtreeDepth(section.id) > 2) {
    showUserGeometryError("Sections can be nested up to three levels deep.");
    updateUserElementContainerOptions(section);
    return false;
  }
  const oldHost = liveUserLayoutHost(section);
  const oldMetrics = userLayoutHostMetrics(oldHost);
  const oldRect = userLayoutElementRect(section, oldMetrics);
  const targetHost = parent
    ? userQuery(userLayoutElementSelector("data-layout-parent-id", parent.id))
    : userQuery(`.user-layout-region-${section.region}`);
  const targetMetrics = userLayoutHostMetrics(targetHost);
  if (!oldRect || !targetMetrics) return false;
  const width = (oldRect.right - oldRect.left) / targetMetrics.width;
  const height = (oldRect.bottom - oldRect.top) / targetMetrics.height;
  if (width > 1 || height > 1) {
    showUserGeometryError("That section is larger than the selected container.");
    updateUserElementContainerOptions(section);
    return false;
  }
  const original = cloneUserViewDraftState(section);
  let candidate = null;
  for (let y = 0; y + height <= 1.0001 && !candidate; y += 0.04) {
    for (let x = 0; x + width <= 1.0001; x += 0.04) {
      const next = { ...section, parentId: parent?.id || "", x, y, width, height };
      if (userLayoutCandidateFits(next, targetHost, section.id)) {
        candidate = next;
        break;
      }
    }
  }
  if (!candidate) {
    showUserGeometryError("The selected container does not have enough open space for this section.");
    updateUserElementContainerOptions(section);
    return false;
  }
  Object.assign(section, candidate);
  renderUserFrameLayout();
  if (!userLayoutSectionControlsFit(section.id)) {
    Object.assign(section, original);
    renderUserFrameLayout();
    showUserGeometryError("The section's controls would not fit in that container.");
    updateUserElementContainerOptions(section);
    return false;
  }
  fieldsClearUserGeometryError();
  updateUserGeometryFields();
  revalidateUserFrameGeometryForStage();
  pushUserBuilderHistory(`Move ${section.label || "section"} to another container`);
  return true;
}

function applyUserSectionName(value) {
  const selected = selectedUserLayoutElements();
  if (selected.length !== 1 || selected[0].type !== "section") return false;
  const name = String(value || "").trim().slice(0, 80);
  if (!name) {
    showUserGeometryError("Enter a name for this section.");
    return false;
  }
  if (selected[0].label === name) return true;
  selected[0].label = name;
  fieldsClearUserGeometryError();
  renderUserFrameLayout();
  pushUserBuilderHistory(`Rename User UI ${selected[0].parentId ? "subsection" : "section"}`);
  return true;
}

function applyUserDividerRotation(value) {
  const selected = selectedUserLayoutElements();
  const divider = selected.length === 1 && selected[0].type === "divider" ? selected[0] : null;
  const degrees = Number(value);
  const host = divider ? liveUserLayoutHost(divider) : null;
  const metrics = userLayoutHostMetrics(host);
  if (!divider || !metrics || !Number.isFinite(degrees)) {
    showUserGeometryError("Enter a numeric divider angle.");
    return false;
  }
  const start = { x: divider.x1 * metrics.width, y: divider.y1 * metrics.height };
  const end = { x: divider.x2 * metrics.width, y: divider.y2 * metrics.height };
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const halfLength = Math.hypot(end.x - start.x, end.y - start.y) / 2;
  const radians = degrees * Math.PI / 180;
  const dx = Math.cos(radians) * halfLength;
  const dy = Math.sin(radians) * halfLength;
  const candidate = {
    ...divider,
    x1: (center.x - dx) / metrics.width,
    y1: (center.y - dy) / metrics.height,
    x2: (center.x + dx) / metrics.width,
    y2: (center.y + dy) / metrics.height
  };
  if (!userLayoutCandidateFits(candidate, host, divider.id)) {
    showUserGeometryError("That angle would cross the frame boundary or another UI element.");
    return false;
  }
  Object.assign(divider, candidate);
  fieldsClearUserGeometryError();
  renderUserFrameLayout();
  updateUserGeometryFields();
  pushUserBuilderHistory("Rotate User UI divider");
  return true;
}

function applyUserControlGeometryValues(values) {
  const selected = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
  if (selected.length !== 1) return false;
  const placement = selected[0];
  const content = userQuery(userLayoutElementSelector("data-layout-parent-id", placement.section.id));
  const rect = content?.getBoundingClientRect();
  if (!rect || Object.values(values).some(value => !Number.isFinite(value))) {
    showUserGeometryError("Enter numbers for X, Y, width, and height.");
    return false;
  }
  const squareGeometry = userLayoutControlUsesSquareGeometry(placement.item);
  const minimumWidth = squareGeometry ? 42 : 72;
  if (squareGeometry && Math.abs(values.width - values.height) > 0.5) {
    showUserGeometryError("Circular and square controls must have matching width and height values.");
    return false;
  }
  if (values.x < 0 || values.y < 0 || values.width < minimumWidth || values.height < 42) {
    showUserGeometryError(squareGeometry
      ? "Control values must be positive. Minimum square size is 42 × 42px."
      : "Control values must be positive. Minimum size is 72 × 42px.");
    return false;
  }
  if (values.x + values.width > rect.width || values.y + values.height > rect.height) {
    showUserGeometryError("Those values extend outside the section. Reduce the position or size.");
    return false;
  }
  const candidate = {
    ...placement.item,
    x: values.x / rect.width,
    y: values.y / rect.height,
    width: values.width / rect.width,
    height: values.height / rect.height
  };
  if (!userLayoutControlCandidateFits(placement.section, candidate, placement.item.controlId)) {
    showUserGeometryError("Those values would overlap another control.");
    return false;
  }
  Object.assign(placement.item, candidate);
  fieldsClearUserGeometryError();
  renderUserFrameLayout();
  updateUserGeometryFields();
  pushUserBuilderHistory("Set User UI control geometry");
  return true;
}

function fieldsClearUserGeometryError() {
  els.usersGeometryFields?.querySelectorAll("[data-user-geometry]").forEach(input => input.classList.remove("is-invalid"));
  if (els.usersGeometryError) els.usersGeometryError.hidden = true;
}

function showUserGeometryError(message) {
  if (els.usersGeometryError) {
    els.usersGeometryError.textContent = message;
    els.usersGeometryError.hidden = false;
  }
  els.usersGeometryFields?.querySelectorAll("[data-user-geometry]").forEach(input => input.classList.add("is-invalid"));
}

function candidateFromUserGeometryValues(element, metrics, values) {
  const next = cloneUserViewDraftState(element);
  if (element.type === "section") {
    next.x = values.x / metrics.width;
    next.y = values.y / metrics.height;
    next.width = values.width / metrics.width;
    next.height = values.height / metrics.height;
    return next;
  }
  const old = userGeometryValuesForElement(element, metrics);
  const oldWidth = Math.max(1, old.width);
  const oldHeight = Math.max(1, old.height);
  const endpoints = [
    { x: element.x1 * metrics.width, y: element.y1 * metrics.height },
    { x: element.x2 * metrics.width, y: element.y2 * metrics.height }
  ];
  const scaled = endpoints.map(point => ({
    x: values.x + ((point.x - old.x) / oldWidth) * values.width,
    y: values.y + ((point.y - old.y) / oldHeight) * values.height
  }));
  next.x1 = scaled[0].x / metrics.width;
  next.y1 = scaled[0].y / metrics.height;
  next.x2 = scaled[1].x / metrics.width;
  next.y2 = scaled[1].y / metrics.height;
  return next;
}

function applyUserGeometryValues(values, { allowResize = false } = {}) {
  if (selectedUserLayoutControlIds.size === 1 && selectedUserLayoutElementIds.size === 0) {
    return applyUserControlGeometryValues(values);
  }
  const selected = selectedUserLayoutElements();
  if (selected.length !== 1) return false;
  const element = selected[0];
  const host = liveUserLayoutHost(element);
  const metrics = userLayoutHostMetrics(host);
  const minimumWidth = element.type === "section" ? (element.parentId ? 52 : 64) : 0;
  const minimumHeight = element.type === "section" ? (element.parentId ? 36 : 44) : 0;
  if (Object.values(values).some(value => !Number.isFinite(value))) {
    showUserGeometryError("Enter numbers for X, Y, width, and height.");
    return false;
  }
  if (values.x < 0 || values.y < 0 || values.width < minimumWidth || values.height < minimumHeight) {
    showUserGeometryError(`Values must be positive. Minimum size is ${minimumWidth} × ${minimumHeight}px.`);
    return false;
  }
  if (element.type === "divider" && Math.hypot(values.width, values.height) < 28) {
    showUserGeometryError("A divider must remain at least 28px long.");
    return false;
  }
  const overflowX = Math.max(0, values.x + values.width - metrics.width);
  const overflowY = Math.max(0, values.y + values.height - metrics.height);
  if (overflowX || overflowY) {
    const thicknessCanGrow = !element.parentId && ((element.region === "left" || element.region === "right") ? !overflowY : !overflowX);
    const needed = (element.region === "left" || element.region === "right") ? overflowX : overflowY;
    if (!thicknessCanGrow || needed <= 0) {
      showUserGeometryError("Those values extend outside this frame area. Reduce the position or size.");
      return false;
    }
    const bounds = frameGeometryBounds();
    const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" }[element.region];
    const maxTotal = element.region === "left" || element.region === "right"
      ? bounds.maxHorizontalTotal
      : bounds.maxVerticalTotal;
    const maximumEdge = maxTotal - userFrameGeometry[opposite];
    if (userFrameGeometry[element.region] + needed > maximumEdge) {
      showUserGeometryError(`Those values need more ${element.region} frame space than the current viewport limits allow.`);
      return false;
    }
    if (!allowResize) {
      pendingUserGeometryResize = { elementId: element.id, values: { ...values }, needed: Math.ceil(needed) };
      if (els.usersViewportResizeCopy) {
        els.usersViewportResizeCopy.textContent = `This value needs ${Math.ceil(needed)}px more ${element.region} frame space. Resize the map viewport to make room?`;
      }
      if (els.usersViewportResizeDialog) els.usersViewportResizeDialog.hidden = false;
      return false;
    }
    const nextGeometry = { ...userFrameGeometry, [element.region]: userFrameGeometry[element.region] + Math.ceil(needed) };
    const result = setUserFrameGeometry(nextGeometry, { activeEdges: [element.region], render: false, resizeMap: true });
    if (!result.changed && result.limits[element.region]) {
      showUserGeometryError("The map viewport cannot shrink far enough to fit those values.");
      return false;
    }
    return applyUserGeometryValues(values, { allowResize: true });
  }
  const candidate = candidateFromUserGeometryValues(element, metrics, values);
  if (!userLayoutCandidateFits(candidate, host, element.id)) {
    showUserGeometryError("Those values would overlap another User UI control or its spacing margin.");
    return false;
  }
  Object.assign(element, candidate);
  els.usersGeometryFields?.querySelectorAll("[data-user-geometry]").forEach(input => input.classList.remove("is-invalid"));
  if (els.usersGeometryError) els.usersGeometryError.hidden = true;
  renderUserFrameLayout();
  updateUserGeometryFields();
  revalidateUserFrameGeometryForStage();
  pushUserBuilderHistory(`Set ${element.label || "divider"} geometry`);
  return true;
}

function validateUserGeometryFieldsAfterDelay() {
  clearTimeout(userGeometryValidationTimer);
  userGeometryValidationTimer = window.setTimeout(() => {
    const values = {};
    els.usersGeometryFields?.querySelectorAll("[data-user-geometry]").forEach(input => {
      values[input.dataset.userGeometry] = Number(input.value.trim());
    });
    applyUserGeometryValues(values);
  }, 2000);
}



function activeUserMaterialDefinition() {
  return USER_MATERIALS.find(material => material.id === appState.userMaterial) || USER_MATERIALS[0];
}

function defaultUsersShellLeatherColor() {
  return activeUserMaterialDefinition()?.color || "#6b3f2a";
}

function currentUsersShellLeatherColor() {
  return normalizeHex(
    rvStorageGet(USERS_SHELL_LEATHER_COLOR_KEY)
    || document.documentElement.style.getPropertyValue("--users-shell-leather-color")
    || defaultUsersShellLeatherColor()
  ) || defaultUsersShellLeatherColor();
}

function applyUsersShellLeatherColor(color = currentUsersShellLeatherColor()) {
  const nextColor = normalizeHex(color) || defaultUsersShellLeatherColor();
  document.documentElement.style.setProperty("--users-shell-leather-color", nextColor);
  if (els.usersLeatherColor) {
    els.usersLeatherColor.value = nextColor;
  }
  return nextColor;
}

function setUsersShellLeatherColor(color) {
  const nextColor = applyUsersShellLeatherColor(color);
  rvStorageSet(USERS_SHELL_LEATHER_COLOR_KEY, nextColor);
  return nextColor;
}

function isEditableShortcutTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest("[contenteditable='true']")) return true;
  const tagName = target.tagName?.toLowerCase?.() || "";
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function setUserMaterial(materialId) {
  const material = USER_MATERIALS.find(item => item.id === materialId) || USER_MATERIALS[0];
  updateAppState({ userMaterial: material.id });
  setLeatherColor(material.color);
  setLeatherTextureOpacity(material.opacity);
  setLeatherBlendMode(material.blend);
  applyUsersShellLeatherColor();
  refreshUserMaterialControls();
}

function currentThemeLabelAndStyle() {
  const theme = allRouteThemes()[activeRouteThemeId];
  const providerStyle = String(activeRouteThemeId).startsWith("osm-")
    ? MAPLIBRE_STYLES.find(style => `osm-${style.id}` === activeRouteThemeId)
    : null;
  const routeTheme = providerStyle ? mapLibreStyleToRouteTheme(providerStyle) : theme;
  return {
    label: providerStyle?.label || SIMPLIFIED_THEME_NAMES[activeRouteThemeId] || theme?.label || readableTextureName(activeRouteThemeId || "Theme"),
    description: providerStyle?.description || (theme ? `${routeThemeBrightness(theme)} · ${themeMaterialBestMatchLabel(theme, activeRouteThemeId)}` : "Route map theme"),
    style: routeThemeCardStyle(routeTheme || completeTheme())
  };
}

function refreshUserMaterialControls() {
  if (els.userThemeButton) {
    const theme = currentThemeLabelAndStyle();
    els.userThemeButton.setAttribute("style", theme.style);
    els.userThemeButton.querySelector("strong").textContent = theme.label;
    els.userThemeButton.querySelector("span").textContent = theme.description;
    els.userThemeButton.title = theme.description;
  }
  if (els.userMaterialButton) {
    const material = activeUserMaterialDefinition();
    els.userMaterialButton.style.setProperty("--user-material-color", material.color);
    els.userMaterialButton.querySelector("strong").textContent = material.label;
    els.userMaterialButton.querySelector("span").textContent = "Material";
    els.userMaterialButton.title = `Choose ${material.label} or another site material.`;
  }
  if (els.randomThemeButton) {
    const glow = styleColor("highways") || "#5bc5d7";
    els.randomThemeButton.style.setProperty("--story-theme-glow", glow);
    els.randomThemeButton.classList.remove("theme-glow-refresh");
    // Restart the short dim-to-bright animation for both picker and random changes.
    void els.randomThemeButton.offsetWidth;
    els.randomThemeButton.classList.add("theme-glow-refresh");
  }
}

function setUserThemePanelOpen(open) {
  if (!els.userThemePanel || !els.userThemeButton) return;
  els.userThemePanel.hidden = !open;
  els.userThemeButton.setAttribute("aria-expanded", String(open));
  if (open) {
    setUserMaterialPanelOpen(false);
    renderUserThemePanel();
  }
}

function setUserMaterialPanelOpen(open) {
  if (!els.userMaterialPanel || !els.userMaterialButton) return;
  els.userMaterialPanel.hidden = !open;
  els.userMaterialButton.setAttribute("aria-expanded", String(open));
  if (open) {
    setUserThemePanelOpen(false);
    renderUserMaterialPanel();
  }
}

function appendUserThemeCard(parent, { id, theme, provider = false }) {
  const button = document.createElement("button");
  button.className = "map-style-card user-theme-choice";
  button.type = "button";
  button.setAttribute("aria-pressed", String(provider ? activeRouteThemeId === `osm-${id}` : activeRouteThemeId === id));
  button.setAttribute("style", routeThemeCardStyle(theme));
  button.dataset.userProviderTheme = provider ? id : "";
  button.dataset.userRouteTheme = provider ? "" : id;
  const title = document.createElement("strong");
  title.textContent = provider ? theme.label || readableTextureName(id) : SIMPLIFIED_THEME_NAMES[id] || theme.label || readableTextureName(id);
  const description = document.createElement("span");
  description.textContent = provider ? theme.description || "OSM provider style" : `${routeThemeBrightness(theme)} · ${themeMaterialBestMatchLabel(theme, id)}`;
  button.append(title, description);
  parent.append(button);
}

function renderUserThemePanel() {
  if (!els.userThemePanel) return;
  els.userThemePanel.replaceChildren();
  const head = document.createElement("div");
  head.className = "user-picker-head";
  const title = document.createElement("div");
  title.innerHTML = "<strong>Theme</strong><span>Choose a map theme</span>";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Done";
  close.addEventListener("click", () => setUserThemePanelOpen(false));
  head.append(title, close);
  const grid = document.createElement("div");
  grid.className = "user-theme-grid";
  MAPLIBRE_STYLES.forEach(style => appendUserThemeCard(grid, {
    id: style.id,
    provider: true,
    theme: mapLibreStyleToRouteTheme(style)
  }));
  sortedRouteThemeEntries().forEach(({ id, theme }) => appendUserThemeCard(grid, { id, theme }));
  els.userThemePanel.append(head, grid);
}

function renderUserMaterialPanel() {
  if (!els.userMaterialPanel) return;
  els.userMaterialPanel.replaceChildren();
  USER_MATERIALS.forEach(material => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "user-material-choice";
    button.dataset.userMaterialChoice = material.id;
    button.setAttribute("aria-pressed", String(material.id === appState.userMaterial));
    button.style.setProperty("--user-material-color", material.color);
    button.innerHTML = `<strong>${material.label}</strong><span>${material.blend}</span>`;
    els.userMaterialPanel.append(button);
  });
}

function welcomeGateTimerRemainingMs() {
  return Math.max(0, WELCOME_GATE_MIN_VISIBLE_MS - (Date.now() - welcomeGateShownAt));
}

function welcomeGateTimerReady() {
  return welcomeGateTimerRemainingMs() <= 0;
}
