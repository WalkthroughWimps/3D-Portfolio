"use strict";

// Durable Users sections, controls, appearance, presets, normalization, and history state.

function isUserViewPanelEnabled(panel) {
  const normalizedPanel = validUserViewPanel(panel);
  if (!normalizedPanel) return false;
  return Boolean(userViewDraft.panels?.[normalizedPanel]?.enabled);
}

function panelHasPlacedSettings(panel) {
  const normalizedPanel = validUserViewPanel(panel);
  if (!normalizedPanel) return false;
  const sections = Array.isArray(userViewDraft.panels?.[normalizedPanel]?.sections)
    ? userViewDraft.panels[normalizedPanel].sections
    : [];
  return sections.some(section => Array.isArray(section?.items) && section.items.some(item => item?.type === "setting" && item?.settingId));
}



function getUserViewDraft() {
  try {
    return structuredClone(userViewDraft);
  } catch {
    return JSON.parse(JSON.stringify(userViewDraft));
  }
}

function validUserViewPanel(panel) {
  return Object.prototype.hasOwnProperty.call(USER_VIEW_PANEL_EDGES, panel) ? panel : "";
}

function validUserViewEdge(panel, edge) {
  const normalizedPanel = validUserViewPanel(panel);
  if (!normalizedPanel) return "";
  return USER_VIEW_PANEL_EDGES[normalizedPanel].includes(edge) ? edge : "";
}

function sectionIdForPlacement(group, panel, edge) {
  return `section-${safeDownloadName(group || "settings")}-${panel}-${edge}`;
}

function findPlacedSetting(settingId) {
  if (!settingId) return null;
  for (const [panelName, panelState] of Object.entries(userViewDraft.panels)) {
    const sections = Array.isArray(panelState?.sections) ? panelState.sections : [];
    for (const [sectionIndex, section] of sections.entries()) {
      const itemIndex = section?.items?.findIndex?.(item => item?.settingId === settingId) ?? -1;
      if (itemIndex >= 0) {
        return {
          panel: panelName,
          sectionIndex,
          itemIndex,
          section
        };
      }
    }
  }
  return null;
}

function removePlacedSetting(settingId) {
  const found = findPlacedSetting(settingId);
  if (!found) return false;
  const panelState = userViewDraft.panels[found.panel];
  const section = panelState.sections[found.sectionIndex];
  section.items.splice(found.itemIndex, 1);
  if (!section.items.length) {
    panelState.sections.splice(found.sectionIndex, 1);
  }
  return true;
}

function normalizePlacedSection(section, panel, edge) {
  if (!section || !Array.isArray(section.items)) return null;
  return {
    ...section,
    items: section.items.filter(item => item?.type === "setting" && item?.settingId),
    placement: {
      panel,
      edge
    }
  };
}

function ensureUserViewSection(panel, edge, label) {
  const normalizedPanel = validUserViewPanel(panel);
  const normalizedEdge = validUserViewEdge(normalizedPanel, edge);
  if (!normalizedPanel || !normalizedEdge) return null;
  const panelState = userViewDraft.panels[normalizedPanel];
  if (!panelState?.sections) return null;
  const sectionId = sectionIdForPlacement(label, normalizedPanel, normalizedEdge);
  let section = panelState.sections.find(candidate => candidate?.id === sectionId);
  if (!section) {
    section = {
      id: sectionId,
      label: label || "Settings",
      items: [],
      placement: {
        panel: normalizedPanel,
        edge: normalizedEdge
      }
    };
    panelState.sections.push(section);
  }
  return normalizePlacedSection(section, normalizedPanel, normalizedEdge);
}



function userRecordSessionEntries() {
  return userRecordState.sessionIds
    .map(id => getSettingEntry(id))
    .filter(entry => entry && entry.userSafe);
}

function createDefaultUserViewDraft() {
  return {
    recordedControls: [],
    layout: { elements: [] },
    panels: {
      top: { enabled: false, sections: [] },
      right: { enabled: false, sections: [] },
      bottom: { enabled: false, sections: [] },
      left: { enabled: false, sections: [] }
    },
    pinned: {
      tabs: [],
      panels: []
    }
  };
}

function cloneUserViewDraftState(draft = createDefaultUserViewDraft()) {
  try {
    return structuredClone(draft);
  } catch {
    return JSON.parse(JSON.stringify(draft));
  }
}

function sanitizeUserViewDraft(raw) {
  const fallback = createDefaultUserViewDraft();
  const source = raw && typeof raw === "object" ? raw : {};
  const placedIds = new Set();
  const sectionsByPanel = {};
  const validPanels = Object.keys(USER_VIEW_PANEL_EDGES);

  const normalizePlacedItem = item => {
    if (!item || item.type !== "setting" || typeof item.settingId !== "string") return null;
    const settingId = item.settingId.trim();
    if (!settingId || placedIds.has(settingId)) return null;
    placedIds.add(settingId);
    return { type: "setting", settingId };
  };

  validPanels.forEach(panel => {
    const panelSource = source.panels && typeof source.panels === "object" ? source.panels[panel] : null;
    const rawSections = Array.isArray(panelSource?.sections) ? panelSource.sections : [];
    const sections = [];
    rawSections.forEach((section, index) => {
      if (!section || typeof section !== "object") return;
      const edge = validUserViewEdge(panel, section?.placement?.edge);
      if (!edge) return;
      const items = Array.isArray(section.items)
        ? section.items.map(normalizePlacedItem).filter(Boolean)
        : [];
      if (!items.length) return;
      sections.push({
        id: String(section.id || `section-${panel}-${edge}-${index + 1}`),
        label: String(section.label || "Settings"),
        items,
        placement: {
          panel,
          edge
        }
      });
    });
    sectionsByPanel[panel] = {
      enabled: Boolean(panelSource?.enabled) || sections.length > 0,
      sections
    };
  });

  const layout = sanitizeUserLayout(source.layout);
  const layoutControlIds = new Set(layout.elements.flatMap(element =>
    element.type === "section" && Array.isArray(element.controls)
      ? element.controls.map(item => item.controlId)
      : []
  ));
  const rawRecordedControls = Array.isArray(source.recordedControls) ? source.recordedControls : source.staged;
  const recordedControls = Array.isArray(rawRecordedControls)
    ? rawRecordedControls
      .filter(settingId => typeof settingId === "string")
      .map(settingId => settingId.trim())
      .filter(settingId => settingId && !placedIds.has(settingId) && !layoutControlIds.has(settingId))
      .filter((settingId, index, list) => list.indexOf(settingId) === index)
    : [];

  const pinnedSource = source.pinned && typeof source.pinned === "object" ? source.pinned : {};
  const pinned = {
    tabs: Array.isArray(pinnedSource.tabs)
      ? pinnedSource.tabs.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean)
      : fallback.pinned.tabs,
    panels: Array.isArray(pinnedSource.panels)
      ? pinnedSource.panels.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean)
      : fallback.pinned.panels
  };

  return {
    recordedControls,
    layout,
    panels: {
      top: sectionsByPanel.top || { enabled: false, sections: [] },
      right: sectionsByPanel.right || { enabled: false, sections: [] },
      bottom: sectionsByPanel.bottom || { enabled: false, sections: [] },
      left: sectionsByPanel.left || { enabled: false, sections: [] }
    },
    pinned
  };
}

function serializeUserViewDraft() {
  return cloneUserViewDraftState(sanitizeUserViewDraft(userViewDraft));
}

function normalizeUserControlAppearance(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = {};
  USER_CONTROL_APPEARANCE_SCHEMA.forEach(group => group.fields.forEach(field => {
    if (field.type === "select") {
      const allowed = (field.options || []).map(option => option[0]);
      next[field.key] = allowed.includes(source[field.key]) ? source[field.key] : field.value;
      return;
    }
    if (field.type === "color") {
      next[field.key] = normalizeHex(source[field.key]) || field.value;
      return;
    }
    const value = Number(source[field.key]);
    next[field.key] = Number.isFinite(value) ? clamp(value, field.min, field.max) : field.value;
  }));
  return next;
}

function normalizeUserControlAppearanceOverrides(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized = normalizeUserControlAppearance(source);
  const allowed = new Set(USER_CONTROL_APPEARANCE_SCHEMA.flatMap(group => group.fields.map(field => field.key)));
  return Object.fromEntries(Object.keys(source).filter(key => allowed.has(key)).map(key => [key, normalized[key]]));
}

function effectiveUserControlAppearance(item = null) {
  return { ...userControlAppearance, ...normalizeUserControlAppearanceOverrides(item?.appearance) };
}



function normalizeUserFrameGeometryRecord(raw, fallback = userFrameGeometry) {
  const source = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(["top", "right", "bottom", "left"].map(edge => {
    const value = Number(source[edge]);
    const fallbackValue = Number(fallback?.[edge]) || 96;
    return [edge, Number.isFinite(value) ? clamp(Math.round(value), 0, 2000) : fallbackValue];
  }));
}

function normalizeUserLayoutPresets(rawPresets) {
  if (!Array.isArray(rawPresets)) return [];
  const ids = new Set();
  return rawPresets.slice(0, 80).map((preset, index) => {
    if (!preset || typeof preset !== "object") return null;
    const name = String(preset.name || "").trim().slice(0, 60);
    if (!name) return null;
    let id = String(preset.id || `layout-preset-${index + 1}`).replace(/[^a-z0-9_-]/gi, "-").slice(0, 90);
    while (ids.has(id)) id = `${id}-${index + 1}`;
    ids.add(id);
    return {
      id,
      name,
      draft: sanitizeUserViewDraft(preset.draft),
      frame: normalizeUserFrameGeometryRecord(preset.frame),
      appearance: normalizeUserControlAppearance(preset.appearance)
    };
  }).filter(Boolean);
}

function loadUserLayoutPresets() {
  return normalizeUserLayoutPresets(rvStorageReadJson(USER_LAYOUT_PRESETS_KEY, []));
}

function saveUserLayoutPresets(presets) {
  const saved = rvStorageWriteJson(USER_LAYOUT_PRESETS_KEY, normalizeUserLayoutPresets(presets));
  if (!saved) {
    setUserLayoutStatus("Layout presets could not be saved in this browser.", true);
    return false;
  }
  if (userBuilderPersistenceReady) saveUserBuilderLocalState();
  return true;
}

const USER_VIEWPORT_APPEARANCE_FIELDS = Object.freeze([
  { key: "screenRadius", css: "--user-screen-radius", type: "length", fallback: "22px", min: 0, max: 80 },
  { key: "bezelSize", css: "--user-map-bezel-size", type: "length", fallback: "8px", min: 0, max: 40 },
  { key: "bezelHighlight", css: "--user-map-bezel-highlight", type: "color", fallback: "rgb(255 255 255 / 0.35)" },
  { key: "bezelShadow", css: "--user-map-bezel-shadow", type: "color", fallback: "rgb(0 0 0 / 0.34)" },
  { key: "innerShadow", css: "--user-map-inner-shadow", type: "shadow", fallback: "inset 0 2px 8px rgb(0 0 0 / 0.22)" },
  { key: "strokeColor", css: "--user-frame-stroke-color", type: "color", fallback: "rgb(255 255 255 / 0.12)" },
  { key: "strokeWidth", css: "--user-frame-stroke-width", type: "length", fallback: "1px", min: 0, max: 20 },
  { key: "strokeOpacity", css: "--user-frame-stroke-opacity", type: "number", fallback: "1", min: 0, max: 1 },
  { key: "strokeStyle", css: "--user-frame-stroke-style", type: "style", fallback: "solid" }
]);

function normalizeUserViewportAppearance(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(USER_VIEWPORT_APPEARANCE_FIELDS.map(field => {
    const value = String(source[field.key] ?? "").trim();
    if (field.type === "length") {
      const number = Number.parseFloat(value);
      return [field.key, Number.isFinite(number) ? `${clamp(number, field.min, field.max)}px` : field.fallback];
    }
    if (field.type === "number") {
      const number = Number(value);
      return [field.key, Number.isFinite(number) ? String(clamp(number, field.min, field.max)) : field.fallback];
    }
    if (field.type === "style") {
      return [field.key, ["none", "solid", "dashed", "dotted", "double", "groove", "ridge", "inset", "outset"].includes(value) ? value : field.fallback];
    }
    if (field.type === "color") {
      return [field.key, value && globalThis.CSS?.supports?.("color", value) ? value : field.fallback];
    }
    return [field.key, value && globalThis.CSS?.supports?.("box-shadow", value) ? value : field.fallback];
  }));
}

function serializeUserViewportAppearance() {
  const stage = els.mapCanvas?.closest?.(".map-stage");
  const style = getComputedStyle(stage || document.documentElement);
  return normalizeUserViewportAppearance(Object.fromEntries(USER_VIEWPORT_APPEARANCE_FIELDS.map(field => [
    field.key,
    style.getPropertyValue(field.css).trim() || field.fallback
  ])));
}

function applyUserViewportAppearance(raw) {
  const appearance = normalizeUserViewportAppearance(raw);
  const stage = els.mapCanvas?.closest?.(".map-stage");
  [document.documentElement, stage].filter(Boolean).forEach(target => {
    USER_VIEWPORT_APPEARANCE_FIELDS.forEach(field => target.style.setProperty(field.css, appearance[field.key]));
  });
  return appearance;
}

function serializeUserBuilderPersistenceState() {
  return {
    version: USER_BUILDER_STATE_VERSION,
    draft: serializeUserViewDraft(),
    frameGeometry: normalizeUserFrameGeometryRecord(userFrameGeometryForStorage()),
    viewportAppearance: serializeUserViewportAppearance(),
    appearance: normalizeUserControlAppearance(userControlAppearance),
    layoutPresets: loadUserLayoutPresets(),
    deviceLayouts: loadUserDeviceLayouts?.() || {}
  };
}

function saveUserBuilderLocalState() {
  const saved = rvStorageWriteJson(USER_BUILDER_STATE_KEY, serializeUserBuilderPersistenceState());
  if (userDevicePreviewMode !== "custom") saveUserDeviceLayout?.(userDevicePreviewMode);
  return saved;
}

function applyUserBuilderPersistenceState(rawState, { saveLocal = true, resetHistory = true } = {}) {
  const source = rawState && typeof rawState === "object" ? rawState : {};
  const draft = source.draft || source.userViewDraft || null;
  if (draft) applyUserViewDraftState(draft);
  if (source.appearance && typeof source.appearance === "object") {
    const legacyAppearance = Object.keys(source.appearance).length === 1 && source.appearance.leatherColor
      ? { ...userControlAppearance, leatherColor: source.appearance.leatherColor }
      : source.appearance;
    Object.assign(userControlAppearance, normalizeUserControlAppearance(legacyAppearance));
    applyUserControlAppearance({ save: true, render: false });
    renderUserAppearanceSections();
  }
  if (source.viewportAppearance && typeof source.viewportAppearance === "object") {
    applyUserViewportAppearance(source.viewportAppearance);
  }
  if (source.frameGeometry && typeof source.frameGeometry === "object") {
    setUserFrameGeometry(normalizeUserFrameGeometryRecord(source.frameGeometry), {
      activeEdges: ["top", "right", "bottom", "left"],
      render: false,
      resizeMap: true
    });
    saveUserFrameGeometry();
  }
  if (Array.isArray(source.layoutPresets)) {
    saveUserLayoutPresets(source.layoutPresets);
    renderUserLayoutPresetOptions();
  }
  if (source.deviceLayouts && typeof source.deviceLayouts === "object") rvStorageWriteJson(USER_DEVICE_LAYOUTS_KEY, source.deviceLayouts);
  renderUserViewDraftUi();
  if (resetHistory) resetUserBuilderHistory("Restore User builder state");
  if (saveLocal) saveUserBuilderLocalState();
  return serializeUserBuilderPersistenceState();
}

function restoreUserBuilderLocalState() {
  const parsed = rvStorageReadJson(USER_BUILDER_STATE_KEY, null);
  if (!parsed || typeof parsed !== "object") return false;
  applyUserBuilderPersistenceState(parsed, { saveLocal: false, resetHistory: true });
  return true;
}

window.rvUserBuilderPersistence = {
  version: USER_BUILDER_STATE_VERSION,
  serialize: serializeUserBuilderPersistenceState,
  apply: state => applyUserBuilderPersistenceState(state),
  save: saveUserBuilderLocalState,
  restore: restoreUserBuilderLocalState
};



function serializeUserBuilderHistoryState() {
  return {
    userView: {
      draft: serializeUserViewDraft(),
      appearance: cloneUserViewDraftState(userControlAppearance)
    },
    frameGeometry: normalizeUserFrameGeometryRecord(userFrameGeometryForStorage()),
    viewportAppearance: serializeUserViewportAppearance(),
    layoutPresets: loadUserLayoutPresets()
  };
}

function normalizeUserBuilderHistoryState(rawState) {
  const source = rawState && typeof rawState === "object" ? rawState : {};
  return {
    userView: {
      draft: sanitizeUserViewDraft(source.userView?.draft),
      appearance: normalizeUserControlAppearance(source.userView?.appearance)
    },
    frameGeometry: normalizeUserFrameGeometryRecord(source.frameGeometry),
    viewportAppearance: normalizeUserViewportAppearance(source.viewportAppearance),
    layoutPresets: Array.isArray(source.layoutPresets)
      ? normalizeUserLayoutPresets(source.layoutPresets)
      : loadUserLayoutPresets()
  };
}

function cloneUserBuilderHistorySnapshot(state) {
  try {
    return structuredClone(state);
  } catch {
    return JSON.parse(JSON.stringify(state));
  }
}

function userBuilderHistorySignature(state) {
  return JSON.stringify(normalizeUserBuilderHistoryState(state));
}

function updateUserBuilderHistoryButtons() {
  if (els.usersUndoBuilder) {
    els.usersUndoBuilder.disabled = userBuilderHistoryState.undoStack.length <= 1;
  }
  if (els.usersRedoBuilder) {
    els.usersRedoBuilder.disabled = userBuilderHistoryState.redoStack.length === 0;
  }
}

function clearUserBuilderRedoStack() {
  userBuilderHistoryState.redoStack.length = 0;
  updateUserBuilderHistoryButtons();
}

function resetUserBuilderHistory(label = "Reset builder state") {
  const state = normalizeUserBuilderHistoryState(serializeUserBuilderHistoryState());
  const signature = userBuilderHistorySignature(state);
  userBuilderHistoryState.undoStack = [{
    label,
    signature,
    state: cloneUserBuilderHistorySnapshot(state)
  }];
  userBuilderHistoryState.redoStack = [];
  updateUserBuilderHistoryButtons();
}

function pushUserBuilderHistory(label = "Update builder state") {
  if (userBuilderHistoryState.applying) return false;
  const state = normalizeUserBuilderHistoryState(serializeUserBuilderHistoryState());
  const signature = userBuilderHistorySignature(state);
  const last = userBuilderHistoryState.undoStack[userBuilderHistoryState.undoStack.length - 1];
  if (last?.signature === signature) {
    updateUserBuilderHistoryButtons();
    return false;
  }
  if (typeof markUserLayoutPresetModified === "function") markUserLayoutPresetModified(label);
  userBuilderHistoryState.undoStack.push({
    label,
    signature,
    state: cloneUserBuilderHistorySnapshot(state)
  });
  if (userBuilderHistoryState.undoStack.length > userBuilderHistoryState.maxEntries) {
    userBuilderHistoryState.undoStack.splice(0, userBuilderHistoryState.undoStack.length - userBuilderHistoryState.maxEntries);
  }
  clearUserBuilderRedoStack();
  updateUserBuilderHistoryButtons();
  if (userBuilderPersistenceReady) saveUserBuilderLocalState();
  return true;
}

function applyUserBuilderHistoryState(state) {
  restoreUserDevicePreview();
  const nextState = normalizeUserBuilderHistoryState(state);
  userBuilderHistoryState.applying = true;
  try {
    Object.assign(userControlAppearance, nextState.userView.appearance);
    applyUserControlAppearance({ save: true, render: true });
    renderUserAppearanceSections();
    applyUserViewportAppearance(nextState.viewportAppearance);
    setUserFrameGeometry(nextState.frameGeometry, {
      activeEdges: ["top", "right", "bottom", "left"],
      render: false,
      resizeMap: true
    });
    saveUserFrameGeometry();
    saveUserLayoutPresets(nextState.layoutPresets);
    renderUserLayoutPresetOptions();
    applyUserViewDraftState(nextState.userView.draft);
  } finally {
    userBuilderHistoryState.applying = false;
  }
  updateUserBuilderHistoryButtons();
  if (userBuilderPersistenceReady) saveUserBuilderLocalState();
  return true;
}

function undoUserBuilderChange() {
  if (userBuilderHistoryState.undoStack.length <= 1) return false;
  const current = userBuilderHistoryState.undoStack.pop();
  if (current) {
    userBuilderHistoryState.redoStack.push(current);
  }
  const previous = userBuilderHistoryState.undoStack[userBuilderHistoryState.undoStack.length - 1];
  if (!previous) {
    updateUserBuilderHistoryButtons();
    return false;
  }
  applyUserBuilderHistoryState(previous.state);
  return true;
}

function redoUserBuilderChange() {
  if (!userBuilderHistoryState.redoStack.length) return false;
  const next = userBuilderHistoryState.redoStack.pop();
  if (!next) {
    updateUserBuilderHistoryButtons();
    return false;
  }
  userBuilderHistoryState.undoStack.push(next);
  applyUserBuilderHistoryState(next.state);
  return true;
}



function normalizeUserLayoutControlConfig(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const numericText = value => String(value ?? "").trim() && Number.isFinite(Number(value)) ? String(value).trim() : "";
  const selectOptions = Array.isArray(source.selectOptions)
    ? source.selectOptions.slice(0, 60).map(option => ({
      label: String(option?.label ?? option?.value ?? "").trim().slice(0, 80),
      value: String(option?.value ?? option?.label ?? "").trim().slice(0, 120)
    })).filter(option => option.label && option.value)
    : [];
  return {
    buttonText: String(source.buttonText || "").trim().slice(0, 80),
    buttonShape: ["inherit", "rounded", "pill", "circle", "square"].includes(source.buttonShape) ? source.buttonShape : "inherit",
    gizmoTemplateId: userGizmoTemplate(String(source.gizmoTemplateId || ""))?.id || "",
    alwaysUseStyle: Boolean(source.alwaysUseStyle),
    sfx: {
      activate: typeof sfxNormalizeAssignment === "function" ? sfxNormalizeAssignment(source.sfx?.activate) : (source.sfx?.activate || null),
      change: typeof sfxNormalizeAssignment === "function" ? sfxNormalizeAssignment(source.sfx?.change) : (source.sfx?.change || null)
    },
    rangeMin: numericText(source.rangeMin),
    rangeMax: numericText(source.rangeMax),
    rangeStep: numericText(source.rangeStep),
    showValue: source.showValue !== false,
    selectOptions
  };
}


// Flip-ready layout invariant: a section keeps one stable identity while its
// controls use `face` and nested elements use `parentFace`. This avoids cloning
// geometry or assignments when the future UI exposes the back face.
function normalizeUserLayoutFace(value) {
  return USER_LAYOUT_FACES.includes(value) ? value : "front";
}

function normalizeUserLayoutFlip(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {};
  const enabled = Boolean(source.enabled);
  return {
    enabled,
    defaultFace: enabled ? normalizeUserLayoutFace(source.defaultFace || source.activeFace) : "front",
    axis: source.axis === "vertical" ? "vertical" : "horizontal",
    durationMs: clamp(Number.isFinite(Number(source.durationMs)) ? Math.round(Number(source.durationMs)) : 420, 120, 1600)
  };
}



function sanitizeUserLayout(rawLayout) {
  const rawElements = Array.isArray(rawLayout?.elements) ? rawLayout.elements : [];
  const ids = new Set();
  const normalized = [];
  const placedControlIds = new Set();
  const unit = value => clamp(Number.isFinite(Number(value)) ? Number(value) : 0, 0, 1);
  rawElements.forEach((element, index) => {
    if (!element || (element.type !== "section" && element.type !== "divider")) return;
    const region = validUserViewPanel(element.region);
    if (!region) return;
    let id = String(element.id || `layout-${element.type}-${index + 1}`).replace(/[^a-z0-9_-]/gi, "-");
    while (ids.has(id)) id = `${id}-${index + 1}`;
    ids.add(id);
    const parentId = typeof element.parentId === "string" ? element.parentId : "";
    if (element.type === "section") {
      const x = unit(element.x);
      const y = unit(element.y);
      const rawControls = Array.isArray(element.controls) ? element.controls : [];
      const legacyColumns = rawControls.length === 2 ? 2 : Math.min(3, Math.max(1, rawControls.length));
      const legacyRows = Math.max(1, Math.ceil(rawControls.length / legacyColumns));
      const controls = rawControls.length
        ? rawControls.map((item, controlIndex) => {
          const controlId = String(item?.controlId || item?.settingId || "").trim();
          if (!controlId || placedControlIds.has(controlId)) return null;
          placedControlIds.add(controlId);
          const hasGeometry = [item?.x, item?.y, item?.width, item?.height].every(value => Number.isFinite(Number(value)));
          const defaultWidth = 1 / legacyColumns;
          const defaultHeight = 1 / legacyRows;
          const controlX = hasGeometry ? unit(item.x) : (controlIndex % legacyColumns) * defaultWidth;
          const controlY = hasGeometry ? unit(item.y) : Math.floor(controlIndex / legacyColumns) * defaultHeight;
          return {
            type: "control",
            controlId,
            face: normalizeUserLayoutFace(item?.face),
            source: userLayoutBuiltinControl(controlId) ? "builtin" : "recorded",
            assignedControlId: String(item?.assignedControlId || "").trim(),
            customLabel: String(item?.customLabel || "").trim().slice(0, 80),
            showLabel: item?.showLabel !== false,
            controlConfig: normalizeUserLayoutControlConfig(item?.controlConfig),
            appearance: normalizeUserControlAppearanceOverrides(item?.appearance),
            x: controlX,
            y: controlY,
            width: clamp(hasGeometry ? unit(item.width) : defaultWidth, 0.08, 1 - controlX),
            height: clamp(hasGeometry ? unit(item.height) : defaultHeight, 0.08, 1 - controlY)
          };
        }).filter(Boolean)
        : [];
      normalized.push({
        id,
        type: "section",
        region,
        parentId,
        parentFace: parentId ? normalizeUserLayoutFace(element.parentFace) : "front",
        label: String(element.label || (parentId ? "Subsection" : "Section")),
        frameHost: Boolean(element.frameHost),
        flip: normalizeUserLayoutFlip(element.flip),
        x,
        y,
        width: clamp(unit(element.width) || 0.2, 0.04, 1 - x),
        height: clamp(unit(element.height) || 0.2, 0.04, 1 - y),
        controls
      });
      return;
    }
    normalized.push({
      id,
      type: "divider",
      region,
      parentId,
      parentFace: parentId ? normalizeUserLayoutFace(element.parentFace) : "front",
      x1: unit(element.x1),
      y1: unit(element.y1),
      x2: unit(element.x2),
      y2: unit(element.y2)
    });
  });
  const sectionIds = new Set(normalized.filter(element => element.type === "section").map(element => element.id));
  normalized.forEach(element => {
    if (element.parentId && !sectionIds.has(element.parentId)) element.parentId = "";
  });
  return { version: USER_LAYOUT_SCHEMA_VERSION, elements: normalized };
}

function userLayoutElements() {
  if (!userViewDraft.layout) userViewDraft.layout = { elements: [] };
  if (!Array.isArray(userViewDraft.layout.elements)) userViewDraft.layout.elements = [];
  return userViewDraft.layout.elements;
}

function userLayoutElementById(id) {
  return userLayoutElements().find(element => element.id === id) || null;
}

function userLayoutSectionActiveFace(sectionOrId) {
  const section = typeof sectionOrId === "string" ? userLayoutElementById(sectionOrId) : sectionOrId;
  if (section?.type !== "section") return "front";
  const configuredFace = normalizeUserLayoutFlip(section.flip).defaultFace;
  return normalizeUserLayoutFace(userLayoutSectionRuntimeFaces.get(section.id) || configuredFace);
}

function userLayoutSectionFaceControls(sectionOrId, face = null) {
  const section = typeof sectionOrId === "string" ? userLayoutElementById(sectionOrId) : sectionOrId;
  if (section?.type !== "section") return [];
  const requestedFace = normalizeUserLayoutFace(face || userLayoutSectionActiveFace(section));
  return (section.controls || []).filter(control => normalizeUserLayoutFace(control?.face) === requestedFace);
}

function userLayoutSectionFaceChildren(sectionId, face = null) {
  const requestedFace = normalizeUserLayoutFace(face || userLayoutSectionActiveFace(sectionId));
  return userLayoutElements().filter(element =>
    element.parentId === sectionId && normalizeUserLayoutFace(element.parentFace) === requestedFace
  );
}

function userLayoutSectionFaceSnapshot(sectionId, face = null) {
  const requestedFace = normalizeUserLayoutFace(face || userLayoutSectionActiveFace(sectionId));
  return {
    face: requestedFace,
    controls: userLayoutSectionFaceControls(sectionId, requestedFace),
    elements: userLayoutSectionFaceChildren(sectionId, requestedFace)
  };
}

function findUserLayoutControl(controlId) {
  if (!controlId) return null;
  for (const section of userLayoutElements()) {
    if (section.type !== "section" || !Array.isArray(section.controls)) continue;
    const index = section.controls.findIndex(item => item?.controlId === controlId);
    if (index >= 0) return { section, item: section.controls[index], index };
  }
  return null;
}

function userLayoutSectionHasGeometry(sectionId) {
  return userLayoutElements().some(element => element.parentId === sectionId);
}

function userLayoutControlDisplayLabel(item) {
  const custom = String(item?.customLabel || "").trim();
  if (custom) return custom;
  const definition = userLayoutBuiltinControl(item?.controlId);
  if (definition) return definition.label;
  const entry = getSettingEntry(item?.controlId);
  return entry ? friendlySettingLabel(entry) : "Control";
}



function userLayoutSectionDepth(section) {
  let depth = 0;
  let current = section;
  const visited = new Set();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    depth += 1;
    current = userLayoutElementById(current.parentId);
  }
  return depth;
}

function userLayoutSectionDescendants(sectionId) {
  const descendants = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    userLayoutElements().forEach(element => {
      if (!element.parentId || (element.parentId !== sectionId && !descendants.has(element.parentId)) || descendants.has(element.id)) return;
      descendants.add(element.id);
      changed = true;
    });
  }
  return descendants;
}

function userLayoutSectionSubtreeDepth(sectionId, depth = 0) {
  const children = userLayoutElements().filter(element => element.type === "section" && element.parentId === sectionId);
  if (!children.length) return depth;
  return Math.max(...children.map(child => userLayoutSectionSubtreeDepth(child.id, depth + 1)));
}



function loadUserControlAppearance() {
  return {
    ...USER_CONTROL_APPEARANCE_DEFAULTS,
    ...(rvStorageReadJson(USER_CONTROL_APPEARANCE_KEY, null) || {})
  };
}
const userControlAppearance = loadUserControlAppearance();
const usersBuilderAdminPanelHomes = new Map();
const userBuilderHistoryState = {
  undoStack: [],
  redoStack: [],
  applying: false,
  maxEntries: 80
};
const USER_VIEW_PANEL_EDGES = {
  top: ["left", "right"],
  bottom: ["left", "right"],
  left: ["top", "bottom"],
  right: ["top", "bottom"]
};
const USER_LAYOUT_SCHEMA_VERSION = 2;
const USER_LAYOUT_FACES = Object.freeze(["front", "back"]);
// Runtime face changes stay ephemeral; `flip.defaultFace` is the saved design choice.
const userLayoutSectionRuntimeFaces = new Map();
let usersPlacementMenuState = null;
let selectedUserLayoutControlId = "";
const selectedUserLayoutControlIds = new Set();
let userLayoutControlManipulationState = null;
let userControlPlacementMenuState = null;
let userGizmoStylePaint = null;
const USER_GIZMO_STYLE_PRESETS_KEY = "rv-user-gizmo-style-presets-v1";
let userDividerStyleWorkbenchMode = "draw";
let userDividerStyleWorkbenchPoints = [];
let elementsPreviewState = null;
let elementsPreviewMode = false;
let elementsPreviewRoutesPromise = null;
let showOverviewDeadZonePreview = false;
let elementsPreviewRoutes = null;
let elementsPreviewRouteSelection = "settings";
let elementsDrawerHideTimer = null;
let elementsDrawerToggleButton = null;
let localRoadSourceState = loadLocalRoadSourceState();
let roadStatusOverride = "";
let pendingLandmarkStopKey = "";
let landmarkSettingsScope = "default";

function loadLandmarkDefaultSettings() {
  const parsed = rvStorageReadJson(LANDMARK_DEFAULTS_KEY, null);
  return normalizeLandmarkSettings(parsed || DEFAULT_LANDMARK_SETTINGS);
}

let landmarkDefaultSettings = null;
let routeStopNamesVisible = true;
let routeDisplayVisible = true;
let pendingLandmarkDefaultScope = null;



function applyUserViewDraftState(rawDraft) {
  const nextDraft = sanitizeUserViewDraft(rawDraft);
  userViewDraft.recordedControls.splice(0, userViewDraft.recordedControls.length, ...nextDraft.recordedControls);
  if (!userViewDraft.layout) userViewDraft.layout = { elements: [] };
  userViewDraft.layout.version = nextDraft.layout.version;
  userViewDraft.layout.elements.splice(
    0,
    userViewDraft.layout.elements.length,
    ...cloneUserViewDraftState(nextDraft.layout.elements)
  );
  [...selectedUserLayoutElementIds].forEach(id => {
    if (!userLayoutElementById(id)) selectedUserLayoutElementIds.delete(id);
  });
  [...selectedUserLayoutControlIds].forEach(id => {
    if (!findUserLayoutControl(id)) selectedUserLayoutControlIds.delete(id);
  });
  selectedUserLayoutElementId = [...selectedUserLayoutElementIds][0] || "";
  selectedUserLayoutControlId = [...selectedUserLayoutControlIds][0] || "";
  updateUserArrangementControls();
  updateUserGeometryFields();
  Object.keys(USER_VIEW_PANEL_EDGES).forEach(panel => {
    if (!userViewDraft.panels[panel]) {
      userViewDraft.panels[panel] = { enabled: false, sections: [] };
    }
    userViewDraft.panels[panel].enabled = Boolean(nextDraft.panels[panel]?.enabled);
    userViewDraft.panels[panel].sections.splice(
      0,
      userViewDraft.panels[panel].sections.length,
      ...cloneUserViewDraftState(nextDraft.panels[panel].sections)
    );
  });
  userViewDraft.pinned.tabs.splice(0, userViewDraft.pinned.tabs.length, ...nextDraft.pinned.tabs);
  userViewDraft.pinned.panels.splice(0, userViewDraft.pinned.panels.length, ...nextDraft.pinned.panels);
  renderUserViewDraftUi();
}

function resolveRecordableSettingElement(entry) {
  const source = resolveSettingSource(entry);
  if (!source) return null;
  return source.closest(
    ".users-registry-item, .route-color-controls label, .text-control, .toggle-button, .range-control, .checkbox-line, .marker-stroke-row, .icon-control-group label, .style-twirl label, .style-size-section label, .field-label-inline, label"
  ) || source;
}
