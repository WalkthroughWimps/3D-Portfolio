"use strict";

const settingRegistry = new Map();
const autoDiscoveredSettingIds = new Set();
const unsupportedSettingIds = new Set();
const settingRegistryAuditState = {
  explicitIds: new Set(),
  duplicates: [],
  skipped: [],
  scannedRoots: [],
  excludedRoots: [
    "#panelUsers",
    "#usersStagingAdminPanel",
    "#userThemePanel",
    "#userMaterialPanel",
    "#mediaViewer",
    "#welcomeGate",
    "#usageOverlay",
    ".map-feature-toolbar",
    ".welcome-gate",
    "#tripMediaPreview",
    "#tripMediaList"
  ]
};
const ADMIN_SETTING_SCAN_ROOTS = [
  "#panelMapUi",
  "#panelElements",
  "#panelTrips .day-manager-section",
  "#panelTrips .landmarks-section",
  ".pinned-journey-section",
  "#stylePanel",
  "#uiThemePanel"
];
const UNSUPPORTED_ADMIN_CONTROL_SELECTOR = [
  "button[id]",
  "input[type='file'][id]",
  "input[type='search'][id]",
  "input[type='date'][id]",
  "input[type='number'][id]",
  "input[type='hidden'][id]"
].join(", ");
const SUPPORTED_ADMIN_CONTROL_SELECTOR = [
  "input[type='checkbox'][id]",
  "input[type='range'][id]",
  "input[type='color'][id]",
  "input[type='text'][id]",
  "select[id]",
  "textarea[id]"
].join(", ");
const AUTO_DISCOVERY_EXCLUDED_SELECTOR = [
  "#panelUsers",
  "#usersStagingAdminPanel",
  ".users-staging-admin-panel",
  ".users-registry-preview",
  ".trip-media-list",
  ".trip-media-preview",
  "#landmarkGrid",
  "#tripDayList",
  "#routeThemeGrid",
  "#textureLibraryPanel",
  ".map-feature-toolbar",
  ".media-viewer",
  "#welcomeGate",
  "#usageOverlay"
].join(", ");
const MANUAL_REVIEW_ID_PATTERN = /(?:^|)(?:tripSelect|topTripSelect|routeDaySelect|elementsRouteSelect|tripRenameInput|dayRename|newTripName|newDayLabel|routeStartAddress|routeEndAddress|editDay|tripBlog|tripMedia|routeImport|roadFolder|saveAll|landmarkUploadInput|tripRouteInput|import|export|delete|restore|create|apply|cancel|status|input)(?:$|)/i;
const SETTING_TEXT_ID_EXCLUSION_PATTERN = /(?:^|)(?:tripRenameInput|dayRename|newTripName|newDayLabel|routeStartAddress|routeEndAddress|editDay(Start|End|Independent|Sequence|Label|Summary)|tripBlog|tripMedia|routeImport|roadFolder|saveAll)(?:$|)/i;

function registerSetting(entry) {
  if (!entry || typeof entry !== "object" || !entry.id) return null;
  const normalized = {
    label: "",
    userLabel: "",
    tab: "",
    section: "",
    controlType: "text",
    source: null,
    exportKey: "",
    defaultValue: null,
    userSafe: false,
    userGroup: "",
    userPanel: "",
    discovery: "manual",
    manualReview: false,
    reason: "",
    getValue: () => undefined,
    setValue: () => {},
    ...entry
  };
  if (settingRegistry.has(normalized.id)) {
    console.warn(`Setting registry already contains "${normalized.id}".`);
    return settingRegistry.get(normalized.id);
  }
  settingRegistry.set(normalized.id, normalized);
  if (normalized.discovery === "manual") {
    settingRegistryAuditState.explicitIds.add(normalized.id);
  } else if (normalized.discovery === "auto") {
    autoDiscoveredSettingIds.add(normalized.id);
  }
  if (normalized.manualReview || !normalized.userSafe) {
    unsupportedSettingIds.add(normalized.id);
  }
  return normalized;
}

function getSettingEntry(id) {
  return settingRegistry.get(id) || null;
}

function getAllSettings() {
  return Array.from(settingRegistry.values());
}

function getUserSafeSettings() {
  return getAllSettings().filter(entry => entry.userSafe);
}

function getUnsupportedSettings() {
  return getAllSettings().filter(entry => entry.manualReview || entry.controlType === "unsupported" || entry.controlType === "adminAction");
}

function resolveSettingSource(entry) {
  if (!entry) return null;
  try {
    if (typeof entry.source === "function") return entry.source() || null;
    if (typeof entry.source === "string") return document.querySelector(entry.source);
    return entry.source || null;
  } catch {
    return null;
  }
}

function getSettingValue(id) {
  const entry = getSettingEntry(id);
  if (!entry || typeof entry.getValue !== "function") return undefined;
  try {
    return entry.getValue();
  } catch (error) {
    console.warn(`Unable to read setting "${id}".`, error);
    return undefined;
  }
}

function setSettingValue(id, value, ctx = {}) {
  const entry = getSettingEntry(id);
  if (!entry || typeof entry.setValue !== "function") return false;
  try {
    entry.setValue(value, ctx);
    return true;
  } catch (error) {
    console.warn(`Unable to apply setting "${id}".`, error);
    return false;
  }
}

function syncSettingSourceAttributes() {
  document.querySelectorAll("[data-setting-id]").forEach(element => {
    if (!getSettingEntry(element.dataset.settingId)) {
      delete element.dataset.settingId;
    }
  });
  getAllSettings().forEach(entry => {
    const source = resolveSettingSource(entry);
    if (!source || !source.dataset) return;
    if (!entry.userSafe) return;
    source.dataset.settingId = entry.id;
    const target = resolveRecordableSettingElement(entry);
    if (target?.dataset && (!target.dataset.settingId || target.dataset.settingId === entry.id)) {
      target.dataset.settingId = entry.id;
    }
  });
}

function dispatchRegisteredSettingEvent(element, type = "change") {
  if (!element || typeof element.dispatchEvent !== "function") return;
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

function humanizeSettingToken(value) {
  const raw = String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "Setting";
  return raw.replace(/\b\w/g, character => character.toUpperCase());
}

const USER_PANEL_LABELS = Object.freeze({
  top: "Header",
  right: "Right side",
  bottom: "Footer",
  left: "Left side"
});

function userPanelDisplayLabel(panel) {
  return USER_PANEL_LABELS[panel] || humanizeSettingToken(panel);
}

function friendlyBuilderSectionLabel(value) {
  const label = humanizeSettingToken(value).replace(/\bUi\b/g, "UI");
  return label
    .replace(/^Route Map /i, "")
    .replace(/^User View /i, "")
    .replace(/^Map /i, "Map ")
    .trim() || "Settings";
}

function friendlySettingLabel(entry) {
  if (!entry) return "Setting";
  if (entry.userLabel) return entry.userLabel;
  const baseLabel = safeText({ textContent: entry.label || "" }) || humanizeSettingToken(entry.id || "setting");
  const sectionLabel = friendlyBuilderSectionLabel(entry.userGroup || entry.section || "");
  if (!sectionLabel || baseLabel.toLowerCase().includes(sectionLabel.toLowerCase())) {
    return baseLabel;
  }
  if (/^(show|hide|color|size|width|height|opacity|theme|font|background|image|display|speed|style)\b/i.test(baseLabel)) {
    return `${sectionLabel}: ${baseLabel}`;
  }
  return baseLabel;
}

function friendlySettingMeta(entry) {
  const group = friendlyBuilderSectionLabel(entry?.userGroup || entry?.section || "Settings");
  const tab = entry?.tab || "Admin";
  return `${group} • ${tab}`;
}

function safeText(node) {
  return String(node?.textContent || "").replace(/\s+/g, " ").trim();
}

function inferSettingTab(element) {
  const panel = element?.closest?.("[data-panel-tab-panel]");
  const tabId = panel?.dataset?.panelTabPanel;
  if (tabId === "map-ui") return "Route Display";
  if (tabId === "elements") return "Themes";
  if (tabId === "trips") return "Journeys";
  if (tabId === "users") return "Users";
  if (element?.closest?.(".pinned-journey-section")) return "Route Display";
  if (element?.closest?.("#stylePanel") || element?.closest?.("#uiThemePanel")) return "Themes";
  return "Admin";
}

function inferSettingSection(element) {
  const panelSection = element?.closest?.(".panel-section");
  if (panelSection) {
    const headerText = safeText(
      panelSection.querySelector(":scope > .section-collapse-button .section-collapse-title")
      || panelSection.querySelector(":scope > .section-label")
      || panelSection.querySelector(":scope > .eyebrow")
    );
    if (headerText) return headerText;
    const aria = panelSection.getAttribute("aria-label");
    if (aria) return aria;
  }
  const details = element?.closest?.("details");
  const summaryText = safeText(details?.querySelector(":scope > summary"));
  if (summaryText) return summaryText;
  const pinned = element?.closest?.(".pinned-subsection");
  const pinnedText = safeText(pinned?.querySelector(":scope > summary .pinned-summary-label"));
  if (pinnedText) return pinnedText;
  return humanizeSettingToken(element?.id || "setting");
}

function inferSettingLabel(element) {
  const directLabel = document.querySelector(`label[for="${element.id}"]`);
  const directLabelText = safeText(directLabel);
  if (directLabelText) return directLabelText;
  const container = element.closest(
    ".text-control, .toggle-button, .range-control, .checkbox-line, .field-label-inline, .route-color-controls label, label"
  );
  const containerLabel = safeText(
    container?.querySelector?.(":scope > span")
    || container?.querySelector?.(":scope > strong")
    || container?.querySelector?.(".field-label-inline > label:first-child")
    || container?.querySelector?.(":scope > legend")
  );
  if (containerLabel) return containerLabel;
  const summaryText = safeText(element.closest("details")?.querySelector(":scope > summary"));
  if (summaryText) return summaryText;
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;
  return humanizeSettingToken(element.id);
}

function inferControlType(element) {
  if (!element) return "text";
  if (element.tagName === "SELECT") return "select";
  if (element.tagName === "TEXTAREA") return "textarea";
  if (element.tagName === "BUTTON") return "adminAction";
  const type = String(element.type || "").toLowerCase();
  if (type === "checkbox" || type === "range" || type === "color" || type === "text" || type === "file" || type === "search" || type === "date" || type === "number") {
    return type;
  }
  return "text";
}

function inferSettingDefaultValue(element, controlType) {
  if (controlType === "checkbox") return Boolean(element.checked);
  return element.value ?? "";
}

function inferUserPanel(tab) {
  if (tab === "Route Display" || tab === "Journeys") return "bottom";
  return "right";
}

function isExcludedDiscoveryElement(element) {
  return !element || Boolean(element.closest(AUTO_DISCOVERY_EXCLUDED_SELECTOR));
}

function matchesManualReviewPattern(element) {
  return MANUAL_REVIEW_ID_PATTERN.test(element?.id || "");
}

function classifyAutoDiscoveredControl(element) {
  const controlType = inferControlType(element);
  if (!element?.id) return { status: "skip", reason: "missing-id", controlType };
  if (isExcludedDiscoveryElement(element)) return { status: "skip", reason: "excluded-area", controlType };
  if (matchesManualReviewPattern(element)) return { status: "manualReview", reason: "manual-review-pattern", controlType };
  if (controlType === "text" && SETTING_TEXT_ID_EXCLUSION_PATTERN.test(element.id)) {
    return { status: "manualReview", reason: "rename-or-route-input", controlType };
  }
  return { status: "userSafe", reason: "", controlType };
}

function readGenericDiscoveredValue(element, controlType) {
  if (!element) return undefined;
  if (controlType === "checkbox") return Boolean(element.checked);
  return element.value;
}

function writeGenericDiscoveredValue(element, controlType, value) {
  if (!element) return;
  if (controlType === "checkbox") {
    element.checked = Boolean(value);
    dispatchRegisteredSettingEvent(element, "change");
    return;
  }
  element.value = value == null ? "" : String(value);
  dispatchRegisteredSettingEvent(element, controlType === "range" || controlType === "color" || controlType === "text" || controlType === "textarea" ? "input" : "change");
  dispatchRegisteredSettingEvent(element, "change");
}

function existingSettingForSource(element) {
  return getAllSettings().find(entry => resolveSettingSource(entry) === element) || null;
}

function discoverAutoRegistryEntry(element, { manualReview = false, reason = "", controlType = inferControlType(element) } = {}) {
  const existing = existingSettingForSource(element);
  if (existing) {
    settingRegistryAuditState.duplicates.push({
      id: existing.id,
      sourceId: element.id,
      reason: "existing-source"
    });
    return existing;
  }
  const id = `admin.${element.id}`;
  if (settingRegistry.has(id)) {
    settingRegistryAuditState.duplicates.push({
      id,
      sourceId: element.id,
      reason: "existing-id"
    });
    return settingRegistry.get(id);
  }
  const tab = inferSettingTab(element);
  const section = inferSettingSection(element);
  const label = inferSettingLabel(element);
  return registerSetting({
    id,
    label,
    userLabel: label,
    tab,
    section,
    controlType: manualReview ? (controlType === "button" ? "adminAction" : "unsupported") : controlType,
    source: element,
    exportKey: id,
    defaultValue: inferSettingDefaultValue(element, controlType),
    userSafe: !manualReview,
    userGroup: section,
    userPanel: inferUserPanel(tab),
    discovery: "auto",
    manualReview,
    reason,
    getValue: () => readGenericDiscoveredValue(element, controlType),
    setValue: value => writeGenericDiscoveredValue(element, controlType, value)
  });
}

function clearAutoDiscoveredSettings() {
  [...autoDiscoveredSettingIds, ...unsupportedSettingIds].forEach(id => {
    if (!settingRegistryAuditState.explicitIds.has(id)) {
      settingRegistry.delete(id);
    }
  });
  autoDiscoveredSettingIds.clear();
  unsupportedSettingIds.clear();
  settingRegistryAuditState.duplicates = [];
  settingRegistryAuditState.skipped = [];
  settingRegistryAuditState.scannedRoots = [];
}

function discoverRegistryControlsInRoot(root) {
  if (!root) return;
  settingRegistryAuditState.scannedRoots.push(root.id ? `#${root.id}` : root.className || root.tagName.toLowerCase());
  const seen = new Set();
  root.querySelectorAll(`${SUPPORTED_ADMIN_CONTROL_SELECTOR}, ${UNSUPPORTED_ADMIN_CONTROL_SELECTOR}`).forEach(element => {
    if (!element?.id || seen.has(element)) return;
    seen.add(element);
    const tagKey = `${element.tagName.toLowerCase()}#${element.id}`;
    const supported = element.matches(SUPPORTED_ADMIN_CONTROL_SELECTOR);
    if (!supported) {
      if (!isExcludedDiscoveryElement(element)) {
        discoverAutoRegistryEntry(element, {
          manualReview: true,
          reason: "unsupported-control-type",
          controlType: inferControlType(element)
        });
      }
      return;
    }
    const classification = classifyAutoDiscoveredControl(element);
    if (classification.status === "skip") {
      settingRegistryAuditState.skipped.push({ id: element.id, reason: classification.reason, selector: tagKey });
      return;
    }
    discoverAutoRegistryEntry(element, {
      manualReview: classification.status !== "userSafe",
      reason: classification.reason,
      controlType: classification.controlType
    });
  });
}

function discoverAdministratorSettings() {
  clearAutoDiscoveredSettings();
  syncSettingSourceAttributes();
  ADMIN_SETTING_SCAN_ROOTS.forEach(selector => {
    document.querySelectorAll(selector).forEach(root => discoverRegistryControlsInRoot(root));
  });
  syncSettingSourceAttributes();
}

function auditSettingRegistry() {
  return {
    explicit: settingRegistryAuditState.explicitIds.size,
    autoDiscovered: getAllSettings().filter(entry => entry.discovery === "auto" && !entry.manualReview).length,
    userSafe: getUserSafeSettings().length,
    unsupported: getUnsupportedSettings().length,
    duplicates: [...settingRegistryAuditState.duplicates],
    skipped: [...settingRegistryAuditState.skipped],
    scannedRoots: [...settingRegistryAuditState.scannedRoots],
    excludedRoots: [...settingRegistryAuditState.excludedRoots]
  };
}

const EXPLICIT_USER_CONTROL_ADAPTERS = Object.freeze({
  "route.animateHovered": {
    source: () => els.animateOverviewRoutes,
    getValue: () => Boolean(els.animateOverviewRoutes?.checked),
    setValue: value => {
      if (!els.animateOverviewRoutes) return;
      els.animateOverviewRoutes.checked = Boolean(value);
      updateOverviewRouteAnimationControls();
    }
  },
  "route.animationTime": {
    source: () => els.overviewRouteAnimationTime,
    getValue: () => Number(els.overviewRouteAnimationTime?.value) || 0.6,
    setValue: value => {
      if (!els.overviewRouteAnimationTime) return;
      const min = Number(els.overviewRouteAnimationTime.min) || 0.1;
      const max = Number(els.overviewRouteAnimationTime.max) || 2;
      els.overviewRouteAnimationTime.value = String(clamp(Number(value) || 0.6, min, max));
      updateOverviewRouteAnimationControls();
    }
  },
  "route.zoomedDaySpeed": {
    source: () => els.routePlaybackSpeed,
    getValue: () => Number(els.routePlaybackSpeed?.value || els.playbackSpeed?.value) || 1,
    setValue: value => {
      if (!els.routePlaybackSpeed && !els.playbackSpeed) return;
      const target = els.routePlaybackSpeed || els.playbackSpeed;
      const min = Number(target?.min) || 0.25;
      const max = Number(target?.max) || 3;
      const next = clamp(Number(value) || 1, min, max);
      if (els.routePlaybackSpeed) els.routePlaybackSpeed.value = String(next);
      if (els.playbackSpeed) els.playbackSpeed.value = String(next);
      updateRoutePlaybackSpeedControl();
    }
  },
  "route.selectedColor": routeColorControlAdapter("selected", () => els.selectedRouteColor),
  "route.precedingColor": routeColorControlAdapter("preceding", () => els.precedingRouteColor),
  "route.followingColor": routeColorControlAdapter("following", () => els.followingRouteColor),
  "route.fillColor": routeColorControlAdapter("fill", () => els.routeFillColor),
  "marker.imageDisplay": {
    source: () => els.markerImageDisplay,
    getValue: () => els.markerImageDisplay?.value || "before",
    setValue: value => {
      if (!els.markerImageDisplay) return;
      els.markerImageDisplay.value = String(value || "before");
      dispatchRegisteredSettingEvent(els.markerImageDisplay, "change");
    }
  },
  "landmark.enabled": {
    source: () => els.landmarksEnabled,
    getValue: () => Boolean(els.landmarksEnabled?.checked),
    setValue: value => {
      if (!els.landmarksEnabled) return;
      els.landmarksEnabled.checked = Boolean(value);
      dispatchRegisteredSettingEvent(els.landmarksEnabled, "change");
    }
  },
  "landmark.imageDisplay": {
    source: () => els.landmarkImageDisplay,
    getValue: () => els.landmarkImageDisplay?.value || "reached",
    setValue: value => {
      if (!els.landmarkImageDisplay) return;
      els.landmarkImageDisplay.value = String(value || "reached");
      dispatchRegisteredSettingEvent(els.landmarkImageDisplay, "change");
    }
  },
  "dayStats.showGps": {
    source: () => els.showEndpointGps,
    getValue: () => Boolean(els.showEndpointGps?.checked),
    setValue: value => {
      if (!els.showEndpointGps) return;
      els.showEndpointGps.checked = Boolean(value);
      dispatchRegisteredSettingEvent(els.showEndpointGps, "change");
    }
  }
});

function routeColorControlAdapter(colorKey, resolveElement) {
  return {
    source: resolveElement,
    getValue: () => normalizeHex(resolveElement()?.value) || DEFAULT_ROUTE_DISPLAY_COLORS[colorKey],
    setValue: value => {
      const element = resolveElement();
      if (!element) return;
      element.value = normalizeHex(value) || DEFAULT_ROUTE_DISPLAY_COLORS[colorKey];
      refreshRouteDisplayColors();
    }
  };
}

function registerExplicitUserControls() {
  const adapterIds = new Set(Object.keys(EXPLICIT_USER_CONTROL_ADAPTERS));
  const missingAdapters = [...EXPLICIT_USER_CONTROL_IDS].filter(id => !adapterIds.has(id));
  const unknownAdapters = [...adapterIds].filter(id => !EXPLICIT_USER_CONTROL_IDS.has(id));
  if (missingAdapters.length || unknownAdapters.length) {
    console.warn("User control catalog adapter mismatch.", { missingAdapters, unknownAdapters });
  }
  EXPLICIT_USER_CONTROL_CATALOG.forEach(definition => {
    const adapter = EXPLICIT_USER_CONTROL_ADAPTERS[definition.id];
    if (adapter) registerSetting({ ...definition, ...adapter });
  });
}

registerExplicitUserControls();
