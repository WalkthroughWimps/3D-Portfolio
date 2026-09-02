"use strict";

// User-facing frame, section, control, registry, and builder preview rendering.

function renderUsersPanelManagement() {
  const buttonsByPanel = {
    top: [els.usersAddPanelTop, els.usersRemovePanelTop],
    right: [els.usersAddPanelRight, els.usersRemovePanelRight],
    bottom: [els.usersAddPanelBottom, els.usersRemovePanelBottom],
    left: [els.usersAddPanelLeft, els.usersRemovePanelLeft]
  };
  Object.entries(buttonsByPanel).forEach(([panel, [addButton, removeButton]]) => {
    const enabled = isUserViewPanelEnabled(panel);
    const populated = panelHasPlacedSettings(panel);
    if (addButton) addButton.disabled = enabled;
    if (removeButton) removeButton.disabled = !enabled && !populated;
  });
}

function renderUsersPanelRegistryPreview() {
  if (!els.usersRegistryPreview) return;
  const recordedEntries = userViewDraft.recordedControls.map(getSettingEntry).filter(entry => entry?.userSafe);
  if (els.usersRegistrySummary) {
    els.usersRegistrySummary.textContent = `(${recordedEntries.length})`;
    els.usersRegistrySummary.setAttribute("aria-label", `${recordedEntries.length} recorded assignments`);
  }
  els.usersRegistryPreview.replaceChildren();
  if (!recordedEntries.length) {
    const selectedEmpty = document.createElement("p");
    selectedEmpty.className = "users-registry-empty";
    selectedEmpty.textContent = "No assignable controls have been recorded yet.";
    els.usersRegistryPreview.append(selectedEmpty);
    return;
  }
  const list = document.createElement("div");
  list.className = "users-compact-control-stack";
  list.dataset.usersRecordedControls = "true";
  recordedEntries.forEach(entry => {
    list.append(createUsersCompactControlCard(entry, { removable: true }));
  });
  els.usersRegistryPreview.append(list);
}

const USER_LAYOUT_BUILTIN_CONTROLS = Object.freeze([
  { id: "builtin.previousDay", label: "Previous day", text: "Previous" },
  { id: "builtin.nextDay", label: "Next day", text: "Next" },
  { id: "builtin.viewWholeTrip", label: "Journey / US view", text: "View journey" },
  { id: "builtin.storyTheme", label: "Theme select", text: "Theme" },
  { id: "builtin.storyPrevious", label: "Story previous", text: "Back" },
  { id: "builtin.storyNext", label: "Story next", text: "Start story" },
  { id: "builtin.storyJourney", label: "Story journey view", text: "Journey" },
  { id: "builtin.storyUs", label: "Story US view", text: "US" },
  { id: "builtin.siteLogo", label: "Site logo", text: "Logo placeholder" }
]);

const USER_GIZMO_CATEGORIES = Object.freeze([
  {
    id: "analog-70s",
    label: "70s Analog",
    description: "Raised molded keys, mechanical toggles, sliders, and instrument knobs.",
    items: [
      { id: "analog-key", label: "Raised key", kind: "button", text: "PLAY", style: "analog" },
      { id: "analog-round-key", label: "Round key", kind: "button", text: "GO", shape: "circle", style: "analog" },
      { id: "analog-wide-key", label: "Wide function key", kind: "button", text: "OVERVIEW", shape: "wide", style: "analog" },
      { id: "analog-record", label: "Record key", kind: "button", text: "RECORD", style: "analog-record" },
      { id: "analog-toggle", label: "Lever toggle", kind: "toggle", style: "analog" },
      { id: "analog-slider", label: "Travel slider", kind: "range", style: "analog" },
      { id: "analog-fader", label: "Vertical fader", kind: "range", orientation: "vertical", style: "analog" },
      { id: "analog-knob", label: "Rotary knob", kind: "knob", style: "analog" },
      { id: "analog-rocker", label: "Rocker switch", kind: "toggle", style: "rocker" },
      { id: "analog-select", label: "Channel selector", kind: "select", style: "analog" },
      { id: "analog-input", label: "Label window", kind: "text", style: "analog" },
      { id: "analog-date", label: "Date window", kind: "date", style: "analog" },
      { id: "analog-stepper", label: "Mechanical stepper", kind: "stepper", style: "analog" },
      { id: "analog-transport", label: "Transport controls", kind: "transport", style: "analog" },
      { id: "analog-display", label: "Counter display", kind: "display", text: "03", style: "analog" },
      { id: "analog-meter", label: "Needle meter", kind: "meter", text: "62%", style: "analog" },
      { id: "analog-lamp", label: "Pilot lamp", kind: "light", style: "analog" },
      { id: "analog-decal", label: "Stamped decal", kind: "decal", text: "NAV", style: "analog" }
    ]
  },
  {
    id: "night-drive",
    label: "Night Drive",
    description: "Dark glass, restrained blue illumination, and low-glare controls.",
    items: [
      { id: "glow-home", label: "Glowing home", kind: "icon-button", icon: "truck", style: "glow" },
      { id: "glow-key", label: "Illuminated key", kind: "button", text: "GO", style: "glow" },
      { id: "glow-round-key", label: "Halo key", kind: "button", text: "GPS", shape: "circle", style: "glow" },
      { id: "glow-toggle", label: "Lighted toggle", kind: "toggle", style: "glow" },
      { id: "glow-slider", label: "Lighted slider", kind: "range", style: "glow" },
      { id: "glow-knob", label: "Illuminated dial", kind: "knob", style: "glow" },
      { id: "glow-select", label: "Glass dropdown", kind: "select", style: "glow" },
      { id: "glow-input", label: "Illuminated input", kind: "text", style: "glow" },
      { id: "glow-search", label: "Search console", kind: "search", style: "glow" },
      { id: "glow-date", label: "Digital date", kind: "date", style: "glow" },
      { id: "glow-color", label: "Light color well", kind: "color", style: "glow" },
      { id: "glow-segments", label: "Mode segments", kind: "segmented", style: "glow" },
      { id: "glow-transport", label: "Media transport", kind: "transport", style: "glow" },
      { id: "glow-direction", label: "Direction pad", kind: "direction", style: "glow" },
      { id: "glow-display", label: "Digital display", kind: "display-panel", text: "ROUTE 03", style: "glow" },
      { id: "glow-meter", label: "Signal meter", kind: "meter", text: "82%", style: "glow" },
      { id: "glow-lamp", label: "Status light", kind: "light", style: "glow" },
      { id: "glow-decal", label: "Luminous icon", kind: "decal", icon: "truck", style: "glow" }
    ]
  },
  {
    id: "soft-molded",
    label: "Soft Molded",
    description: "Quiet, rounded controls for plastic, rubber, and lighter material themes.",
    items: [
      { id: "soft-key", label: "Soft key", kind: "button", text: "SELECT", style: "soft" },
      { id: "soft-round-key", label: "Round soft key", kind: "button", text: "+", shape: "circle", style: "soft" },
      { id: "soft-toggle", label: "Soft toggle", kind: "toggle", style: "soft" },
      { id: "soft-rocker", label: "Molded rocker", kind: "toggle", style: "soft-rocker" },
      { id: "soft-slider", label: "Soft slider", kind: "range", style: "soft" },
      { id: "soft-knob", label: "Rubber dial", kind: "knob", style: "soft" },
      { id: "soft-dropdown", label: "Compact dropdown", kind: "select", style: "soft" },
      { id: "soft-segmented", label: "Wide dropdown", kind: "select", style: "soft-wide" },
      { id: "soft-input", label: "Compact input", kind: "text", style: "soft" },
      { id: "soft-search", label: "Rounded search", kind: "search", style: "soft" },
      { id: "soft-date", label: "Date field", kind: "date", style: "soft" },
      { id: "soft-color", label: "Color well", kind: "color", style: "soft" },
      { id: "soft-stepper", label: "Value stepper", kind: "stepper", style: "soft" },
      { id: "soft-segments", label: "Segmented choice", kind: "segmented", style: "soft" },
      { id: "soft-transport", label: "Compact transport", kind: "transport", style: "soft" },
      { id: "soft-display", label: "Information panel", kind: "display-panel", text: "READY", style: "soft" },
      { id: "soft-meter", label: "Progress display", kind: "meter", text: "68%", style: "soft" },
      { id: "soft-lamp", label: "Soft indicator", kind: "light", style: "soft" },
      { id: "soft-decal", label: "Printed label", kind: "decal", text: "MAP", style: "soft" }
    ]
  },
  {
    id: "instrument-metal",
    label: "Instrument Metal",
    description: "Chrome and dark hardware suited to brushed metal and walnut panels.",
    items: [
      { id: "metal-knob", label: "Machined knob", kind: "knob", style: "metal" },
      { id: "metal-key", label: "Metal key", kind: "button", text: "MODE", style: "metal" },
      { id: "metal-round-key", label: "Bezel key", kind: "button", text: "SET", shape: "circle", style: "metal" },
      { id: "metal-toggle", label: "Batten toggle", kind: "toggle", style: "metal" },
      { id: "metal-rocker", label: "Metal rocker", kind: "toggle", style: "metal-rocker" },
      { id: "metal-slider", label: "Channel slider", kind: "range", style: "metal" },
      { id: "metal-fader", label: "Vertical channel", kind: "range", orientation: "vertical", style: "metal" },
      { id: "metal-select", label: "Detent selector", kind: "select", style: "metal" },
      { id: "metal-input", label: "Engraved input", kind: "text", style: "metal" },
      { id: "metal-search", label: "Instrument search", kind: "search", style: "metal" },
      { id: "metal-date", label: "Calendar field", kind: "date", style: "metal" },
      { id: "metal-color", label: "Metal color well", kind: "color", style: "metal" },
      { id: "metal-stepper", label: "Detent stepper", kind: "stepper", style: "metal" },
      { id: "metal-segments", label: "Selector bank", kind: "segmented", style: "metal" },
      { id: "metal-transport", label: "Deck transport", kind: "transport", style: "metal" },
      { id: "metal-direction", label: "Navigation pad", kind: "direction", style: "metal" },
      { id: "metal-display", label: "Instrument display", kind: "display-panel", text: "12.8 V", style: "metal" },
      { id: "metal-meter", label: "Arc gauge", kind: "meter", text: "74%", style: "metal" },
      { id: "metal-lamp", label: "Bezel light", kind: "light", style: "metal" },
      { id: "metal-decal", label: "Engraved decal", kind: "decal", text: "AUX", style: "metal" }
    ]
  }
]);

const USER_GIZMO_ROLE_LABELS = Object.freeze({
  button: "Action buttons",
  toggle: "Toggles & switches",
  range: "Sliders & faders",
  knob: "Dials & knobs",
  select: "Dropdowns",
  segmented: "Segmented choices",
  stepper: "Steppers",
  text: "Text inputs",
  search: "Search inputs",
  date: "Date controls",
  color: "Color controls",
  transport: "Media & navigation",
  direction: "Direction controls",
  display: "Displays & readouts",
  meter: "Meters & progress",
  light: "Indicator lights",
  decal: "Decals & labels"
});

const USER_GIZMO_RECOMMENDED_IDS = new Set([
  "analog-key", "analog-round-key", "analog-toggle", "analog-slider", "analog-knob", "analog-select",
  "analog-stepper", "analog-transport", "analog-display", "analog-meter", "analog-lamp", "analog-decal",
  "glow-home", "glow-search", "glow-display", "glow-lamp",
  "soft-key", "soft-toggle", "soft-dropdown", "soft-input", "soft-date", "soft-color", "soft-segments",
  "metal-knob", "metal-toggle", "metal-slider", "metal-select", "metal-direction", "metal-display"
]);

const USER_GIZMO_CURATION_KEY = "rv-user-gizmo-curation-v1";
const userGizmoCurationState = {
  initialized: false,
  selectMode: false,
  role: "all",
  selected: new Set()
};

function userGizmoRole(definition) {
  const kind = String(definition?.kind || "button");
  if (["icon-button", "button"].includes(kind)) return "button";
  if (["display", "display-panel"].includes(kind)) return "display";
  return kind;
}

function userGizmoCatalogSize(definition) {
  const role = userGizmoRole(definition);
  if (["button", "knob", "light", "decal"].includes(role) && definition?.shape !== "wide") return "compact";
  if (["range", "select", "text", "search", "date", "display", "meter", "transport", "direction", "segmented"].includes(role)) return "wide";
  return "standard";
}

function userGizmoSourceMetadata(definition) {
  const praashooFamily = ["analog-key", "analog-round-key", "analog-wide-key", "analog-record"].includes(definition?.id);
  return praashooFamily
    ? { creator: "Praashoo7-inspired family", source: "https://uiverse.io/Praashoo7/average-swan-99" }
    : { creator: "RV builder coordinated variant", source: "local" };
}

function userGizmoTemplate(templateId) {
  for (const category of USER_GIZMO_CATEGORIES) {
    const item = category.items.find(candidate => candidate.id === templateId);
    if (item) return { ...item, categoryId: category.id, categoryLabel: category.label };
  }
  return null;
}

function userGizmoTemplateFromControlId(controlId) {
  const match = String(controlId || "").match(/^gizmo\.([a-z0-9-]+)\./i);
  return match ? userGizmoTemplate(match[1]) : null;
}

function nextUserGizmoControlId(templateId) {
  return `gizmo.${templateId}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function defaultUserGizmoTemplateForEntry(entry) {
  const type = String(entry?.controlType || entry?.type || "").toLowerCase();
  const fallback = ["button", "adminaction", "submit", "reset"].includes(type) ? userGizmoTemplate("analog-key")
    : ["checkbox", "radio", "toggle"].includes(type) ? userGizmoTemplate("analog-toggle")
      : type === "range" ? userGizmoTemplate("analog-slider")
        : type === "select" ? userGizmoTemplate("soft-dropdown")
          : type === "color" ? userGizmoTemplate("soft-color")
            : userGizmoTemplate("soft-input");
  const categoryId = typeof document !== "undefined" ? userQuery("#usersGizmoCategory")?.value : "";
  const category = USER_GIZMO_CATEGORIES.find(candidate => candidate.id === categoryId);
  if (!category || !fallback) return fallback;
  const role = userGizmoRole(fallback);
  const matches = category.items.filter(candidate => userGizmoRole(candidate) === role);
  return matches.find(candidate => USER_GIZMO_RECOMMENDED_IDS.has(candidate.id)) || matches[0] || fallback;
}

function userLayoutBuiltinControl(controlId) {
  const builtin = USER_LAYOUT_BUILTIN_CONTROLS.find(control => control.id === controlId);
  if (builtin) return builtin;
  const gizmo = userGizmoTemplateFromControlId(controlId);
  return gizmo ? {
    ...gizmo,
    id: controlId,
    text: gizmo.text || gizmo.label,
    controlType: gizmo.kind,
    gizmo: true
  } : null;
}

function createUserGizmoFace(definition, { interactive = false } = {}) {
  const face = document.createElement("div");
  face.className = `user-gizmo-face user-gizmo-${definition.kind} user-gizmo-style-${definition.style}`;
  face.dataset.gizmoMotion = definition.motion || (["knob", "range"].includes(definition.kind) ? "continuous" : ["toggle", "light"].includes(definition.kind) ? "toggle" : "press");
  if (definition.shape) face.dataset.gizmoShape = definition.shape;
  if (definition.orientation) face.dataset.gizmoOrientation = definition.orientation;
  if (definition.kind === "button" || definition.kind === "icon-button") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "user-gizmo-button";
    if (definition.kind === "icon-button") {
      const icon = document.createElement("span");
      icon.className = "user-gizmo-icon user-gizmo-icon-truck";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.setAttribute("aria-label", definition.label);
    } else {
      button.textContent = definition.text || definition.label;
    }
    button.disabled = !interactive;
    face.append(button);
    return face;
  }
  if (definition.kind === "range" || definition.kind === "knob") {
    const range = document.createElement("input");
    range.type = "range";
    range.min = "0";
    range.max = "100";
    range.value = definition.kind === "knob" ? "40" : "58";
    range.disabled = !interactive;
    range.setAttribute("aria-label", definition.label);
    const updateMotion = () => {
      const ratio = clamp((Number(range.value) - Number(range.min)) / Math.max(1, Number(range.max) - Number(range.min)), 0, 1);
      face.style.setProperty("--gizmo-position", `${ratio * 100}%`);
      face.style.setProperty("--gizmo-turn", `${-135 + ratio * 270}deg`);
    };
    updateMotion();
    range.addEventListener("input", updateMotion);
    face.append(range);
    return face;
  }
  if (definition.kind === "select") {
    const select = document.createElement("select");
    select.setAttribute("aria-label", definition.label);
    ["MAP", "ROUTE", "MEDIA"].forEach(value => select.append(new Option(value, value)));
    select.disabled = !interactive;
    face.append(select);
    return face;
  }
  if (definition.kind === "display" || definition.kind === "display-panel") {
    const output = document.createElement("output");
    output.className = "user-gizmo-display-value";
    output.value = definition.text || "88.8";
    output.textContent = output.value;
    output.setAttribute("aria-label", definition.label);
    face.append(output);
    return face;
  }
  if (definition.kind === "meter") {
    const meter = document.createElement("div");
    meter.className = "user-gizmo-meter-track";
    const fill = document.createElement("span");
    fill.style.setProperty("--gizmo-position", definition.text || "72%");
    const output = document.createElement("output");
    output.className = "user-gizmo-meter-value";
    output.value = definition.text || "72%";
    output.textContent = output.value;
    meter.append(fill, output);
    face.append(meter);
    return face;
  }
  if (definition.kind === "decal") {
    const decal = document.createElement("span");
    decal.className = "user-gizmo-decal";
    if (definition.icon === "truck") {
      const icon = document.createElement("span");
      icon.className = "user-gizmo-icon user-gizmo-icon-truck";
      icon.setAttribute("aria-hidden", "true");
      decal.append(icon);
    } else {
      decal.textContent = definition.text || definition.label;
    }
    face.append(decal);
    return face;
  }
  if (definition.kind === "light") {
    const label = document.createElement("label");
    label.className = "user-gizmo-light-control";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.disabled = !interactive;
    input.setAttribute("aria-label", definition.label);
    const visual = document.createElement("span");
    visual.setAttribute("aria-hidden", "true");
    label.append(input, visual);
    face.append(label);
    return face;
  }
  if (definition.kind === "stepper") {
    const stepper = document.createElement("div");
    stepper.className = "user-gizmo-stepper-control";
    const output = document.createElement("output");
    let value = 3;
    output.value = String(value);
    output.textContent = output.value;
    const makeButton = (text, delta) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.disabled = !interactive;
      button.addEventListener("click", () => {
        value += delta;
        output.value = String(value);
        output.textContent = output.value;
      });
      return button;
    };
    stepper.append(makeButton("−", -1), output, makeButton("+", 1));
    face.append(stepper);
    return face;
  }
  if (definition.kind === "segmented") {
    const group = document.createElement("div");
    group.className = "user-gizmo-segmented-control";
    ["2D", "3D", "MAP"].forEach((text, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.disabled = !interactive;
      button.setAttribute("aria-pressed", String(index === 0));
      button.addEventListener("click", () => group.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item === button))));
      group.append(button);
    });
    face.append(group);
    return face;
  }
  if (definition.kind === "transport" || definition.kind === "direction") {
    const group = document.createElement("div");
    group.className = `user-gizmo-${definition.kind}-control`;
    const labels = definition.kind === "transport" ? ["◀", "▶", "■"] : ["←", "●", "→"];
    labels.forEach(text => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.disabled = !interactive;
      group.append(button);
    });
    face.append(group);
    return face;
  }
  if (["text", "search", "date", "color"].includes(definition.kind)) {
    const input = document.createElement("input");
    input.type = definition.kind === "color" ? "color" : definition.kind === "date" ? "date" : definition.kind === "search" ? "search" : "text";
    if (["text", "search"].includes(definition.kind)) input.placeholder = definition.kind === "search" ? "SEARCH" : "INPUT";
    input.disabled = !interactive;
    input.setAttribute("aria-label", definition.label);
    face.append(input);
    return face;
  }
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.disabled = !interactive;
  input.setAttribute("aria-label", definition.label);
  const visual = document.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  label.append(input, visual);
  face.append(label);
  return face;
}

function syncUserGizmoFaceFromRecordedControl(face, controlId) {
  const entry = getSettingEntry(controlId);
  const source = resolveSettingSource(entry);
  const target = face?.querySelector("button, input, select, textarea, output");
  if (!entry?.userSafe || !source || !target) return false;
  if ("disabled" in target) target.disabled = false;
  if (target.matches("input[type='range']") && source.matches?.("input[type='range']")) {
    ["min", "max", "step"].forEach(attribute => {
      if (source.hasAttribute(attribute)) target.setAttribute(attribute, source.getAttribute(attribute));
    });
  }
  if (target.matches("input[type='checkbox'], input[type='radio']")) target.checked = Boolean(source.checked);
  else if (target.matches("output")) {
    target.value = source.matches?.("input[type='checkbox'], input[type='radio']")
      ? (source.checked ? "ON" : "OFF")
      : String(source.value ?? source.textContent ?? "");
    target.textContent = target.value;
  } else if (!target.matches("button") && "value" in target) target.value = String(source.value ?? "");
  if (target.matches("input[type='range']") && face.classList.contains("user-gizmo-knob")) {
    const min = Number(target.min) || 0;
    const max = Number(target.max) || 100;
    const ratio = max === min ? 0 : (Number(target.value) - min) / (max - min);
    target.style.setProperty("--gizmo-turn", `${-135 + clamp(ratio, 0, 1) * 270}deg`);
  }
  return true;
}

function bindUserGizmoFaceToRecordedControl(face, controlId) {
  const entry = getSettingEntry(controlId);
  const source = resolveSettingSource(entry);
  const target = face?.querySelector("button, input, select, textarea, output");
  if (!entry?.userSafe || !source || !target) return false;
  target.disabled = false;
  if (target.matches("select") && source.matches?.("select")) {
    target.replaceChildren(...Array.from(source.options || []).map(option => new Option(option.textContent, option.value)));
  }
  syncUserGizmoFaceFromRecordedControl(face, controlId);
  if (target.matches("output")) return true;
  if (target.matches("button")) {
    target.addEventListener("click", () => source.click?.());
    return true;
  }
  const dispatchSource = eventType => source.dispatchEvent(new Event(eventType, { bubbles: true }));
  const syncToSource = event => {
    if (target.matches("input[type='checkbox'], input[type='radio']")) source.checked = target.checked;
    else if ("value" in source) source.value = target.value;
    dispatchSource(event.type === "change" ? "change" : "input");
    if (event.type !== "change") dispatchSource("change");
  };
  target.addEventListener("input", syncToSource);
  target.addEventListener("change", syncToSource);
  return true;
}

function allUserGizmoTemplates() {
  return USER_GIZMO_CATEGORIES.flatMap(category => category.items.map(item => ({
    ...item,
    categoryId: category.id,
    categoryLabel: category.label
  })));
}

function initializeUserGizmoCuration() {
  if (userGizmoCurationState.initialized) return;
  const saved = rvStorageReadJson(USER_GIZMO_CURATION_KEY, []);
  const validIds = new Set(allUserGizmoTemplates().map(item => item.id));
  userGizmoCurationState.selected = new Set(
    (Array.isArray(saved) ? saved : []).filter(id => validIds.has(id))
  );
  userGizmoCurationState.initialized = true;
}

function persistUserGizmoCuration() {
  rvStorageWriteJson(USER_GIZMO_CURATION_KEY, [...userGizmoCurationState.selected]);
}

function exportUserGizmoCuration() {
  const selected = allUserGizmoTemplates()
    .filter(item => userGizmoCurationState.selected.has(item.id))
    .map(item => ({
      id: item.id,
      label: item.label,
      role: userGizmoRole(item),
      collection: item.categoryLabel,
      style: item.style,
      kind: item.kind,
      recommended: USER_GIZMO_RECOMMENDED_IDS.has(item.id),
      ...userGizmoSourceMetadata(item)
    }));
  if (!selected.length) return false;
  downloadJson("User Gizmo final selection.json", {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    purpose: "Unbound Gizmo design shortlist",
    selected
  });
  setUserLayoutStatus(`${selected.length} Gizmo candidate${selected.length === 1 ? "" : "s"} exported.`);
  return true;
}

function renderUsersGizmoLibrary() {
  const categorySelect = userQuery("#usersGizmoCategory");
  const roleSelect = userQuery("#usersGizmoRoleFilter");
  const selectMode = userQuery("#usersGizmoSelectMode");
  const selectRecommended = userQuery("#usersGizmoSelectRecommended");
  const clearSelection = userQuery("#usersGizmoClearSelection");
  const exportSelection = userQuery("#usersGizmoExportSelection");
  const selectionCount = userQuery("#usersGizmoSelectionCount");
  const host = userQuery("#usersGizmoLibrary");
  if (!categorySelect || !roleSelect || !host) return;
  initializeUserGizmoCuration();

  const previousCategory = categorySelect.value;
  categorySelect.replaceChildren(new Option("All collections", "all"), ...USER_GIZMO_CATEGORIES.map(category => new Option(category.label, category.id)));
  categorySelect.value = previousCategory === "all" || USER_GIZMO_CATEGORIES.some(category => category.id === previousCategory)
    ? previousCategory
    : USER_GIZMO_CATEGORIES[0].id;

  roleSelect.replaceChildren(new Option("All controller types", "all"), ...Object.entries(USER_GIZMO_ROLE_LABELS).map(([id, label]) => new Option(label, id)));
  roleSelect.value = Object.prototype.hasOwnProperty.call(USER_GIZMO_ROLE_LABELS, userGizmoCurationState.role)
    ? userGizmoCurationState.role
    : "all";

  const visibleTemplates = () => allUserGizmoTemplates().filter(template =>
    (categorySelect.value === "all" || template.categoryId === categorySelect.value)
    && (roleSelect.value === "all" || userGizmoRole(template) === roleSelect.value)
  );

  const updateCurationControls = () => {
    const count = userGizmoCurationState.selected.size;
    selectMode?.setAttribute("aria-pressed", String(userGizmoCurationState.selectMode));
    if (selectMode) selectMode.textContent = userGizmoCurationState.selectMode ? "Done selecting" : "Select mode";
    if (selectionCount) selectionCount.textContent = `${count} selected`;
    if (exportSelection) exportSelection.disabled = count === 0;
  };

  const toggleCandidate = templateId => {
    if (userGizmoCurationState.selected.has(templateId)) userGizmoCurationState.selected.delete(templateId);
    else userGizmoCurationState.selected.add(templateId);
    persistUserGizmoCuration();
    renderCatalog();
  };

  const renderCatalog = () => {
    const templates = visibleTemplates();
    host.replaceChildren();
    const category = USER_GIZMO_CATEGORIES.find(candidate => candidate.id === categorySelect.value);
    const description = document.createElement("p");
    description.className = "users-gizmo-category-description";
    description.textContent = category?.description || `${templates.length} candidates across coordinated material families.`;
    host.append(description);
    const grid = document.createElement("div");
    grid.className = "users-gizmo-grid";
    grid.classList.toggle("is-curation-mode", userGizmoCurationState.selectMode);
    templates.forEach(template => {
      const selected = userGizmoCurationState.selected.has(template.id);
      const recommended = USER_GIZMO_RECOMMENDED_IDS.has(template.id);
      const card = document.createElement("article");
      card.className = "users-gizmo-card is-gizmo-drag-surface";
      card.classList.toggle("is-curation-selected", selected);
      card.dataset.gizmoTemplate = template.id;
      card.dataset.gizmoRole = userGizmoRole(template);
      card.dataset.gizmoSize = userGizmoCatalogSize(template);
      const sourceMetadata = userGizmoSourceMetadata(template);
      card.dataset.gizmoCreator = sourceMetadata.creator;
      const heading = document.createElement("strong");
      heading.textContent = template.label;
      const badges = document.createElement("span");
      badges.className = "users-gizmo-card-badges";
      if (recommended) {
        const badge = document.createElement("span");
        badge.className = "users-gizmo-recommended-badge";
        badge.textContent = "Best fit";
        badges.append(badge);
      }
      const choose = document.createElement("button");
      choose.type = "button";
      choose.className = "users-gizmo-selection-toggle";
      choose.hidden = !userGizmoCurationState.selectMode;
      choose.setAttribute("aria-pressed", String(selected));
      choose.setAttribute("aria-label", `${selected ? "Remove" : "Add"} ${template.label} ${selected ? "from" : "to"} final selection`);
      choose.textContent = selected ? "✓" : "+";
      choose.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
        toggleCandidate(template.id);
      });
      badges.append(choose);
      const preview = createUserGizmoFace(template, { interactive: true });
      card.title = `${userGizmoCurationState.selectMode
        ? `Test ${template.label}, then select it for export`
        : `Hold and drag ${template.label} onto the frame`} · ${sourceMetadata.creator}`;
      card.addEventListener("pointerdown", event => {
        if (userGizmoCurationState.selectMode) {
          if (event.target.closest("button, input, select, textarea, label")) return;
          event.preventDefault();
          event.stopPropagation();
          toggleCandidate(template.id);
          return;
        }
        const controlId = nextUserGizmoControlId(template.id);
        beginUserBuilderPointerDrag(event, controlId, "builtin", {
          allowInteractive: true,
          activationBounds: preview
        });
      });
      card.append(heading, badges, preview);
      grid.append(card);
    });
    if (!templates.length) {
      const empty = document.createElement("p");
      empty.className = "users-registry-empty";
      empty.textContent = "No Gizmos match this collection and controller type.";
      host.append(empty);
    } else {
      host.append(grid);
    }
    updateCurationControls();
  };

  const applyCollectionToPlacedGizmos = categoryId => {
    const category = USER_GIZMO_CATEGORIES.find(candidate => candidate.id === categoryId);
    if (!category) return;
    let changed = 0;
    userLayoutElements().filter(element => element.type === "section").forEach(section => {
      (section.controls || []).forEach(item => {
        const config = normalizeUserLayoutControlConfig(item.controlConfig);
        if (config.alwaysUseStyle) return;
        const current = userGizmoTemplate(config.gizmoTemplateId) || userGizmoTemplateFromControlId(item.controlId);
        if (!current) return;
        const role = userGizmoRole(current);
        const matches = category.items.filter(candidate => userGizmoRole(candidate) === role);
        const replacement = matches.find(candidate => USER_GIZMO_RECOMMENDED_IDS.has(candidate.id)) || matches[0];
        if (!replacement || replacement.id === current.id) return;
        item.controlConfig = normalizeUserLayoutControlConfig({ ...item.controlConfig, gizmoTemplateId: replacement.id });
        changed += 1;
      });
    });
    if (changed) {
      renderUserViewDraftUi();
      pushUserBuilderHistory(`Apply ${category.label} collection to ${changed} Gizmo${changed === 1 ? "" : "s"}`);
      setUserLayoutStatus(`${changed} placed Gizmo${changed === 1 ? " now follows" : "s now follow"} ${category.label}. Locked Gizmos were left unchanged.`);
    }
  };

  categorySelect.onchange = () => {
    applyCollectionToPlacedGizmos(categorySelect.value);
    renderCatalog();
  };
  roleSelect.onchange = () => {
    userGizmoCurationState.role = roleSelect.value;
    renderCatalog();
  };
  if (selectMode) selectMode.onclick = () => {
    userGizmoCurationState.selectMode = !userGizmoCurationState.selectMode;
    renderCatalog();
  };
  if (selectRecommended) selectRecommended.onclick = () => {
    visibleTemplates().filter(item => USER_GIZMO_RECOMMENDED_IDS.has(item.id)).forEach(item => userGizmoCurationState.selected.add(item.id));
    persistUserGizmoCuration();
    renderCatalog();
  };
  if (clearSelection) clearSelection.onclick = () => {
    userGizmoCurationState.selected.clear();
    persistUserGizmoCuration();
    renderCatalog();
  };
  if (exportSelection) exportSelection.onclick = exportUserGizmoCuration;
  renderCatalog();
}

function createUsersCompactControlCard(entry, { removable = false } = {}) {
  const card = document.createElement("article");
  card.className = "users-compact-control-card";
  card.dataset.settingId = entry?.id || "";
  card.dataset.userBuilderCard = "true";
  card.dataset.userBuilderDraggable = entry?.userSafe ? "true" : "false";
  card.dataset.userPlacementSource = "recorded";
  card.draggable = false;
  const name = document.createElement("strong");
  name.className = "users-compact-control-name";
  name.textContent = friendlySettingLabel(entry);
  const representative = defaultUserGizmoTemplateForEntry(entry);
  const preview = createUserGizmoFace(representative, { interactive: false });
  preview.classList.add("users-recorded-gizmo-preview");
  preview.title = `${representative.label} is the default representative gizmo for this control`;
  card.append(name, preview);
  if (removable) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "users-compact-control-remove";
    remove.dataset.recordedRemoveId = entry.id;
    remove.setAttribute("aria-label", `Remove ${friendlySettingLabel(entry)} from recorded controls`);
    remove.textContent = "×";
    card.append(remove);
  }
  card.addEventListener("dragstart", event => beginUserBuilderControlDrag(event, entry.id, "recorded"));
  card.addEventListener("dragend", clearUserBuilderDragState);
  card.addEventListener("pointerdown", event => beginUserBuilderPointerDrag(event, entry.id, "recorded"));
  return card;
}

function renderUsersHigherLevelControls() {
  if (!els.usersHigherLevelControls) return;
  els.usersHigherLevelControls.replaceChildren();
  USER_LAYOUT_BUILTIN_CONTROLS.forEach(({ id, label, text }) => {
    const card = document.createElement("article");
    card.className = "users-compact-control-card";
    card.dataset.controlId = id;
    card.dataset.userBuilderCard = "true";
    card.dataset.userBuilderDraggable = "true";
    card.dataset.userPlacementSource = "builtin";
    card.draggable = false;
    const name = document.createElement("strong");
    name.className = "users-compact-control-name";
    name.textContent = label;
    const preview = document.createElement("div");
    preview.className = "users-registry-control-preview";
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = true;
    button.textContent = text;
    preview.append(button);
    card.append(name, preview);
    card.addEventListener("dragstart", event => beginUserBuilderControlDrag(event, id, "builtin"));
    card.addEventListener("dragend", clearUserBuilderDragState);
    card.addEventListener("pointerdown", event => beginUserBuilderPointerDrag(event, id, "builtin"));
    els.usersHigherLevelControls.append(card);
  });
}

function renderUserViewDraftUi() {
  renderUsersPanelRegistryPreview();
  renderUsersGizmoLibrary();
  renderUsersHigherLevelControls();
  renderUsersPanelManagement();
  renderUserPanelLayoutPreview();
  renderUserSiteControls();
  updateUsersBuilderWorkspace();
  renderUserFrameLayout();
  updateUserBuilderHistoryButtons();
  updateUserLayoutPresetManagementControls();
}

let userBuilderDragState = null;
let userBuilderPointerDragState = null;



function userSitePanelElement(panel) {
  if (panel === "top") return els.userSitePanelTop;
  if (panel === "left") return els.userSitePanelLeft;
  if (panel === "right") return els.userSitePanelRight;
  if (panel === "bottom") return els.userSitePanelBottom;
  return null;
}

function explicitUserPanelSections(panel) {
  const sections = Array.isArray(userViewDraft.panels?.[panel]?.sections) ? userViewDraft.panels[panel].sections : [];
  return sections
    .map(section => ({
      section,
      items: Array.isArray(section?.items)
        ? section.items.filter(item => item?.type === "setting" && item?.settingId)
        : []
    }))
    .map(({ section, items }) => ({
      section,
      entries: items.map(item => ({
        item,
        entry: getSettingEntry(item.settingId)
      }))
    }))
    .filter(candidate => candidate.entries.length);
}

function supportedUserControlType(controlType) {
  return new Set(["checkbox", "range", "color", "select", "text", "textarea"]).has(controlType);
}

function syncUserControlDisplay(entry, control, valueNode = null) {
  if (!entry || !control) return;
  const nextValue = getSettingValue(entry.id);
  if (entry.controlType === "checkbox") {
    control.checked = Boolean(nextValue);
    return;
  }
  if (entry.controlType === "range") {
    control.value = String(nextValue ?? entry.defaultValue ?? control.value ?? "");
    if (valueNode) valueNode.textContent = String(control.value);
    return;
  }
  if (entry.controlType === "color") {
    control.value = normalizeHex(nextValue) || normalizeHex(entry.defaultValue) || "#25313d";
    return;
  }
  control.value = String(nextValue ?? entry.defaultValue ?? "");
}

function createUnsupportedUserControl(entry, state = "Unsupported") {
  const row = document.createElement("article");
  row.className = "user-site-setting-row";
  const head = document.createElement("div");
  head.className = "user-site-setting-head";
  const label = document.createElement("strong");
  label.className = "user-site-setting-label";
  label.textContent = entry?.userLabel || entry?.label || entry?.id || "Unknown setting";
  head.append(label);
  row.append(head);
  const note = document.createElement("div");
  note.className = "user-site-setting-unsupported";
  note.textContent = `${state}: ${entry?.id || "missing-setting"}`;
  row.append(note);
  return row;
}

function createUserSelectControl(entry, source, options = {}) {
  const select = document.createElement("select");
  const configuredOptions = normalizeUserLayoutControlConfig(options.controlConfig).selectOptions;
  const sourceOptions = source?.tagName === "SELECT" ? Array.from(source.options || []).map(option => ({ label: option.textContent, value: option.value })) : [];
  const choices = configuredOptions.length ? configuredOptions : sourceOptions;
  if (!choices.length) return null;
  choices.forEach(option => {
    select.append(new Option(option.label, option.value));
  });
  syncUserControlDisplay(entry, select);
  select.addEventListener("change", () => {
    setSettingValue(entry.id, select.value, { source: "user-renderer" });
    syncUserControlDisplay(entry, select);
  });
  return select;
}

function createUserRangeControl(entry, source, options = {}) {
  const range = document.createElement("input");
  range.type = "range";
  const config = normalizeUserLayoutControlConfig(options.controlConfig);
  range.min = config.rangeMin || source?.min || "0";
  range.max = config.rangeMax || source?.max || "100";
  range.step = config.rangeStep || source?.step || "1";
  const value = document.createElement("span");
  value.className = "user-site-setting-value";
  syncUserControlDisplay(entry, range, value);
  range.addEventListener("input", () => {
    value.textContent = String(range.value);
    setSettingValue(entry.id, range.value, { source: "user-renderer" });
    syncUserControlDisplay(entry, range, value);
  });
  return { control: range, valueNode: value };
}

function createUserSiteSettingRow(entry, fallbackId = "", options = {}) {
  if (!entry) {
    return createUnsupportedUserControl({
      id: fallbackId || "missing-setting",
      label: fallbackId || "Missing setting",
      userLabel: fallbackId || "Missing setting"
    }, "Unavailable");
  }
  if (!entry.userSafe) return createUnsupportedUserControl(entry, "Unavailable");
  const source = resolveSettingSource(entry);
  if (!supportedUserControlType(entry.controlType)) {
    return createUnsupportedUserControl(entry, "Unsupported");
  }
  const row = document.createElement("article");
  row.className = "user-site-setting-row";
  row.dataset.settingId = entry.id;
  const head = document.createElement("div");
  head.className = "user-site-setting-head";
  const label = document.createElement("strong");
  label.className = "user-site-setting-label";
  const displayLabel = String(options.customLabel || "").trim() || entry.userLabel || entry.label || entry.id;
  label.textContent = displayLabel;
  label.hidden = options.showLabel === false;
  head.append(label);
  head.hidden = options.showLabel === false;
  row.append(head);

  if (entry.controlType === "checkbox") {
    const wrapper = document.createElement("label");
    wrapper.className = "user-site-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    const text = document.createElement("span");
    text.textContent = displayLabel;
    text.hidden = options.showLabel === false;
    input.setAttribute("aria-label", displayLabel);
    syncUserControlDisplay(entry, input);
    input.addEventListener("change", () => {
      setSettingValue(entry.id, input.checked, { source: "user-renderer" });
      syncUserControlDisplay(entry, input);
    });
    wrapper.append(input, text);
    row.append(wrapper);
    return row;
  }

  if (entry.controlType === "range") {
    const { control, valueNode } = createUserRangeControl(entry, source, options);
    control.setAttribute("aria-label", displayLabel);
    if (normalizeUserLayoutControlConfig(options.controlConfig).showValue) {
      head.hidden = false;
      head.append(valueNode);
    }
    row.append(control);
    return row;
  }

  if (entry.controlType === "select") {
    const select = createUserSelectControl(entry, source, options);
    if (!select) return createUnsupportedUserControl(entry, "Unavailable");
    select.setAttribute("aria-label", displayLabel);
    row.append(select);
    return row;
  }

  if (entry.controlType === "color") {
    const input = document.createElement("input");
    input.type = "color";
    input.setAttribute("aria-label", displayLabel);
    syncUserControlDisplay(entry, input);
    input.addEventListener("input", () => {
      setSettingValue(entry.id, input.value, { source: "user-renderer" });
      syncUserControlDisplay(entry, input);
    });
    row.append(input);
    return row;
  }

  if (entry.controlType === "textarea") {
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", displayLabel);
    syncUserControlDisplay(entry, textarea);
    textarea.addEventListener("change", () => {
      setSettingValue(entry.id, textarea.value, { source: "user-renderer" });
      syncUserControlDisplay(entry, textarea);
    });
    row.append(textarea);
    return row;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.setAttribute("aria-label", displayLabel);
  syncUserControlDisplay(entry, input);
  input.addEventListener("change", () => {
    setSettingValue(entry.id, input.value, { source: "user-renderer" });
    syncUserControlDisplay(entry, input);
  });
  row.append(input);
  return row;
}

function builderSettingDisplayValue(entry) {
  if (!entry) return "Unavailable";
  const value = getSettingValue(entry.id);
  if (entry.controlType === "checkbox") {
    return value ? "On" : "Off";
  }
  if (entry.controlType === "color") {
    return normalizeHex(value) || normalizeHex(entry.defaultValue) || "#000000";
  }
  if (entry.controlType === "range") {
    return `${value ?? entry.defaultValue ?? "--"}`;
  }
  if (entry.controlType === "select") {
    const source = resolveSettingSource(entry);
    const option = source?.tagName === "SELECT"
      ? Array.from(source.options || []).find(candidate => String(candidate.value) === String(value))
      : null;
    return option?.textContent?.trim() || String(value ?? entry.defaultValue ?? "--");
  }
  return String(value ?? entry.defaultValue ?? "--");
}

function createUserBuilderSettingCard(entry, settingId, panel) {
  const card = document.createElement("article");
  card.className = "user-builder-setting-card";
  card.dataset.settingId = settingId || entry?.id || "";
  card.dataset.userBuilderCard = "true";
  card.dataset.userBuilderDraggable = "true";
  card.dataset.userPlacementSource = "placed";
  card.dataset.userPlacementPanel = panel;
  card.draggable = isUsersBuilderMode();
  const head = document.createElement("div");
  head.className = "user-builder-setting-card-head";
  const title = document.createElement("strong");
  title.className = "user-builder-setting-card-title";
  title.textContent = friendlySettingLabel(entry);
  const type = document.createElement("span");
  type.className = "user-builder-setting-card-type";
  type.textContent = humanizeSettingToken(entry?.controlType || "setting");
  head.append(title, type);
  const value = document.createElement("div");
  value.className = "user-builder-setting-card-value";
  value.textContent = builderSettingDisplayValue(entry);
  const meta = document.createElement("div");
  meta.className = "user-builder-setting-card-meta";
  meta.textContent = friendlySettingMeta(entry);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "user-builder-setting-remove";
  remove.dataset.userPlacedRemoveId = settingId || entry?.id || "";
  remove.setAttribute("aria-label", `Return ${friendlySettingLabel(entry)} to recorded controls`);
  remove.title = "Return to recorded controls";
  remove.textContent = "×";
  card.addEventListener("dragstart", event => {
    beginUserBuilderDrag(event, card.dataset.settingId, "placed");
  });
  card.addEventListener("dragend", clearUserBuilderDragState);
  card.append(head, value, meta, remove);
  return card;
}

function renderUserSitePanel(panel) {
  const host = userSitePanelElement(panel);
  if (!host) return;
  host.replaceChildren();
  const sections = explicitUserPanelSections(panel);
  const builderMode = isUsersBuilderMode();
  const footerShell = panel === "bottom";
  const hasExplicitContent = sections.length > 0;
  const enabled = isUserViewPanelEnabled(panel);
  const populated = panelHasPlacedSettings(panel);
  const visible = appState.siteMode === "user"
    ? footerShell || ((enabled || populated) && hasExplicitContent)
    : builderMode && (footerShell || enabled || populated);
  host.hidden = !visible;
  host.dataset.userBuilderPanel = panel;
  host.dataset.userBuilderDropzone = builderMode ? "true" : "false";
  host.classList.toggle("is-builder-visible", builderMode && visible);
  if (!visible) return;
  if (builderMode && !sections.length) {
    const empty = document.createElement("section");
    empty.className = "user-edge-blank-section";
    empty.dataset.userBuilderBlankSection = panel;
    const title = document.createElement("strong");
    title.textContent = `${userPanelDisplayLabel(panel)} section`;
    const hint = document.createElement("span");
    hint.textContent = "No settings placed • right-click to remove";
    empty.append(title, hint);
    host.append(empty);
    return;
  }
  sections.forEach(({ section, entries }) => {
    const sectionCard = document.createElement("section");
    sectionCard.className = "user-site-section";
    sectionCard.dataset.edgeAlign = section?.placement?.edge || "";
    const head = document.createElement("div");
    head.className = "user-site-section-head";
    const title = document.createElement("strong");
    title.textContent = friendlyBuilderSectionLabel(section?.label || "Settings");
    const edge = document.createElement("span");
    edge.textContent = builderMode ? userPanelDisplayLabel(panel) : humanizeSettingToken(section?.placement?.edge || "");
    head.append(title, edge);
    sectionCard.append(head);
    const items = document.createElement("div");
    items.className = "user-site-section-items";
    entries.forEach(({ item, entry }) => {
      items.append(builderMode
        ? createUserBuilderSettingCard(entry, item?.settingId || "", panel)
        : createUserSiteSettingRow(entry, item?.settingId || ""));
    });
    sectionCard.append(items);
    host.append(sectionCard);
  });
}

function renderUserSiteControls() {
  ["top", "left", "right", "bottom"].forEach(renderUserSitePanel);
}

window.rvUserSiteControls = {
  render: renderUserSiteControls,
  refreshValues: refreshUserRuntimeControlValues
};



function createUsersRegistryControlPreview(entry, options = {}) {
  const preview = document.createElement("div");
  preview.className = "users-registry-control-preview";
  preview.dataset.controlType = entry?.controlType || "setting";
  preview.setAttribute("aria-label", `${friendlySettingLabel(entry)} control preview`);
  preview.setAttribute("inert", "");
  const source = resolveSettingSource(entry);
  let previewSource = source;
  let clone = previewSource?.cloneNode?.(true) || null;
  if (!clone) {
    if (entry?.controlType === "checkbox") {
      clone = document.createElement("label");
      clone.className = "checkbox-line";
      const input = document.createElement("input");
      input.type = "checkbox";
      const text = document.createElement("span");
      text.textContent = friendlySettingLabel(entry);
      clone.append(input, text);
    } else if (entry?.controlType === "range") {
      clone = document.createElement("input");
      clone.type = "range";
      clone.min = "0";
      clone.max = "100";
    } else if (entry?.controlType === "select") {
      clone = document.createElement("select");
      clone.append(new Option(builderSettingDisplayValue(entry), String(getSettingValue(entry.id) ?? "")));
    } else if (entry?.controlType === "color") {
      clone = document.createElement("input");
      clone.type = "color";
    } else if (entry?.controlType === "textarea") {
      clone = document.createElement("textarea");
    } else if (entry?.controlType === "button" || entry?.controlType === "adminAction") {
      clone = document.createElement("button");
      clone.type = "button";
      clone.textContent = friendlySettingLabel(entry);
    } else {
      clone = document.createElement("input");
      clone.type = "text";
    }
  }
  [clone, ...clone.querySelectorAll("*")].forEach(node => {
    node.removeAttribute?.("id");
    node.removeAttribute?.("name");
    node.removeAttribute?.("for");
    node.removeAttribute?.("aria-controls");
    node.removeAttribute?.("aria-describedby");
    node.removeAttribute?.("data-setting-source");
    if (node.matches?.("input, select, textarea, button")) node.tabIndex = -1;
  });
  const control = clone.matches?.("input, select, textarea, button")
    ? clone
    : clone.querySelector?.("input, select, textarea, button");
  const config = normalizeUserLayoutControlConfig(options.controlConfig);
  if (control?.matches?.("input[type='range']")) {
    if (config.rangeMin) control.min = config.rangeMin;
    if (config.rangeMax) control.max = config.rangeMax;
    if (config.rangeStep) control.step = config.rangeStep;
  }
  if (control?.matches?.("select") && config.selectOptions.length) {
    control.replaceChildren(...config.selectOptions.map(option => new Option(option.label, option.value)));
  }
  if (control?.matches?.("button") && config.buttonText) control.textContent = config.buttonText;
  const value = getSettingValue(entry?.id);
  if (control?.matches?.("input[type='checkbox'], input[type='radio']")) {
    control.checked = Boolean(value);
  } else if (control?.matches?.("input[type='color']")) {
    control.value = normalizeHex(value) || normalizeHex(entry?.defaultValue) || "#25313d";
  } else if (control && "value" in control && !control.matches?.("button")) {
    control.value = String(value ?? entry?.defaultValue ?? control.value ?? "");
  }
  preview.append(clone);
  if (control?.matches?.("input[type='range']") && config.showValue !== false) {
    const valueReadout = document.createElement("output");
    valueReadout.className = "users-registry-control-value";
    valueReadout.textContent = builderSettingDisplayValue(entry);
    preview.append(valueReadout);
  }
  return preview;
}

function createUsersRegistryCard(entry, {
  selected = false,
  removable = false,
  removeLabel = "Remove",
  sourceType = "",
  panel = "",
  edge = "",
  compact = false,
  stageAction = false
} = {}) {
  const item = document.createElement("article");
  item.className = `users-registry-item${removable ? " users-staging-item" : ""}${compact ? " users-registry-item-compact" : ""}`;
  if (entry?.id) item.dataset.settingId = entry.id;
  item.dataset.userBuilderCard = "true";
  item.dataset.userBuilderDraggable = sourceType || stageAction || removable ? "true" : "false";
  if (sourceType) item.dataset.userPlacementSource = sourceType;
  if (panel) item.dataset.userPlacementPanel = panel;
  if (edge) item.dataset.userPlacementEdge = edge;
  item.draggable = Boolean(sourceType || stageAction || removable) && isUsersBuilderMode();
  item.classList.toggle("recordable-setting", selected && userRecordState.active);
  item.classList.toggle("is-record-selected", selected);

  const head = document.createElement("div");
  head.className = "users-registry-item-head";

  const title = document.createElement("strong");
  title.className = "users-registry-item-title";
  title.textContent = friendlySettingLabel(entry);

  const id = document.createElement("code");
  id.className = "users-registry-item-id";
  id.textContent = entry?.id || "--";

  head.append(title, id);

  const meta = document.createElement("div");
  meta.className = "users-registry-item-meta";
    [
      ["Type", entry?.controlType || "--"],
      ["Group", friendlyBuilderSectionLabel(entry?.userGroup || entry?.section || "--")],
      ["Panel", panel && edge ? `${userPanelDisplayLabel(panel)} • ${humanizeSettingToken(edge)}` : (entry?.userPanel ? userPanelDisplayLabel(entry.userPanel) : "--")]
    ].forEach(([label, value]) => {
    const field = document.createElement("span");
    const heading = document.createElement("strong");
    heading.textContent = label;
    const detail = document.createElement("em");
    detail.textContent = value;
    field.append(heading, detail);
    meta.append(field);
  });

  const controlPreview = createUsersRegistryControlPreview(entry);
  item.append(head, controlPreview, meta);
  if (stageAction && entry?.id) {
    const placementState = settingPlacementStatus(entry.id);
    const stageButton = document.createElement("button");
    stageButton.type = "button";
    stageButton.className = "users-registry-stage-button";
    stageButton.dataset.stageSettingId = entry.id;
    stageButton.dataset.stageState = placementState;
    if (placementState === "placed") {
      stageButton.textContent = "Placed";
      stageButton.disabled = true;
    } else if (placementState === "recorded") {
      stageButton.textContent = "Recorded";
      stageButton.disabled = true;
    } else {
      stageButton.textContent = "Add control";
    }
    item.append(stageButton);
  }
  if (removable) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "users-staging-remove";
    remove.textContent = removeLabel;
    remove.dataset.stagedRemoveId = entry?.id || "";
    item.append(remove);
  }
  item.addEventListener("dragstart", event => {
    if (!item.draggable) {
      event.preventDefault();
      return;
    }
    const resolvedSource = sourceType || (removable ? "staged" : "available");
    beginUserBuilderDrag(event, item.dataset.settingId, resolvedSource);
  });
  item.addEventListener("dragend", clearUserBuilderDragState);
  return item;
}

function renderUserPanelLayoutPreview() {
  if (!els.usersLayoutPreview) return;
  els.usersLayoutPreview.replaceChildren();
  const order = ["top", "left", "right", "bottom"];
  order.forEach(panelName => {
    const enabled = isUserViewPanelEnabled(panelName);
    const populated = panelHasPlacedSettings(panelName);
    if (!enabled && !populated) return;
    const panelCard = document.createElement("section");
    panelCard.className = `users-layout-panel users-layout-panel-${panelName}`;
    panelCard.dataset.userBuilderPanel = panelName;
    panelCard.dataset.userBuilderDropzone = "true";
      const heading = document.createElement("div");
      heading.className = "users-layout-panel-head";
      const title = document.createElement("strong");
      title.textContent = userPanelDisplayLabel(panelName);
      const hint = document.createElement("span");
      hint.textContent = "User panel";
    heading.append(title, hint);
    panelCard.append(heading);

    const sections = Array.isArray(userViewDraft.panels?.[panelName]?.sections) ? userViewDraft.panels[panelName].sections : [];
    const explicitSections = sections
      .map(section => ({
        section,
        items: Array.isArray(section?.items)
          ? section.items.filter(item => item?.type === "setting" && item?.settingId && getSettingEntry(item.settingId)?.userSafe)
          : []
      }))
      .filter(candidate => candidate.items.length);
    if (!explicitSections.length) {
      const empty = document.createElement("p");
      empty.className = "users-layout-panel-empty";
      empty.textContent = "No settings placed";
      panelCard.append(empty);
      els.usersLayoutPreview.append(panelCard);
      return;
    }
    explicitSections.forEach(({ section, items }) => {
      const sectionCard = document.createElement("article");
      sectionCard.className = "users-layout-section";
        const sectionHeading = document.createElement("div");
        sectionHeading.className = "users-layout-section-head";
        const sectionTitle = document.createElement("strong");
        sectionTitle.textContent = friendlyBuilderSectionLabel(section.label || "Settings");
        const sectionPlacement = document.createElement("span");
        sectionPlacement.textContent = `${userPanelDisplayLabel(panelName)} • ${humanizeSettingToken(section?.placement?.edge || "--")}`;
      sectionHeading.append(sectionTitle, sectionPlacement);
      sectionCard.append(sectionHeading);

      const itemList = document.createElement("div");
      itemList.className = "users-layout-section-items";
      items.forEach(item => {
        const entry = getSettingEntry(item?.settingId);
        if (!entry?.userSafe) return;
        itemList.append(createUsersRegistryCard(entry, {
          compact: true,
          sourceType: "placed",
          panel: panelName,
          edge: section?.placement?.edge || ""
        }));
      });
      sectionCard.append(itemList);
      panelCard.append(sectionCard);
    });
    els.usersLayoutPreview.append(panelCard);
  });
}

const panelTabs = userQueryAll("[data-panel-tab]");
const panelTabPanels = userQueryAll("[data-panel-tab-panel]");
const userRecordState = {
  active: false,
  paused: false,
  sessionIds: []
};
const userViewDraft = {
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
const USER_DEVICE_PREVIEW_PRESETS = Object.freeze({
  "desktop-16-9": { label: "Desktop 16:9", ratio: 16 / 9, compact: false, frame: { top: 0.1, right: 0.1, bottom: 0.14, left: 0.1 } },
  "desktop-4-3": { label: "Desktop 4:3", ratio: 4 / 3, compact: false, frame: { top: 0.1, right: 0.1, bottom: 0.14, left: 0.1 } },
  "tablet-landscape": { label: "Tablet landscape", ratio: 4 / 3, compact: true, maxWidth: 880, maxHeight: 660, frame: { top: 0.09, right: 0.07, bottom: 0.2, left: 0.07 } },
  "tablet-portrait": { label: "Tablet portrait", ratio: 3 / 4, compact: true, maxWidth: 600, maxHeight: 800, frame: { top: 0.09, right: 0.06, bottom: 0.24, left: 0.06 } },
  "phone-landscape": { label: "Phone landscape", ratio: 19.5 / 9, compact: true, maxWidth: 780, maxHeight: 360, frame: { top: 0.08, right: 0.05, bottom: 0.24, left: 0.05 } },
  "phone-portrait": { label: "Phone portrait", ratio: 9 / 19.5, compact: true, maxWidth: 360, maxHeight: 780, frame: { top: 0.08, right: 0.05, bottom: 0.3, left: 0.05 } }
});
const userFrameGeometry = loadUserFrameGeometry();
const userFrameCornerOwnership = {
  "top-left": "top",
  "top-right": "top",
  "bottom-right": "bottom",
  "bottom-left": "bottom"
};
let userFrameBuilderToolsReady = false;
let userMapViewportResizeFrame = 0;
let userMapViewportResizeState = null;
let userDevicePreviewMode = "desktop-16-9";
let userDevicePreviewBaseGeometry = null;
let userDevicePreviewInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let userDevicePreviewCustomCompact = false;
let userDevicePreviewBaseCompact = false;
let userDevicePreviewRefreshFrame = 0;
let userDevicePreviewStageDimensions = null;
let userRuntimeLayoutFrame = 0;
let userRuntimeValueRefreshFrame = 0;
let userLayoutDrawingEnabled = false;
let userLayoutGestureState = null;
let userLayoutManipulationState = null;
let selectedUserLayoutElementId = "";
const selectedUserLayoutElementIds = new Set();
let userLayoutSelectionEmphasized = true;
let userLayoutSnapMode = "smart";
let userLayoutFreeTransform = false;
let userGeometryValidationTimer = 0;
let userPropertyValidationTimer = 0;
let pendingUserGeometryResize = null;
let userBuilderPersistenceReady = false;
const USER_MATERIAL_TEXTURES = Object.freeze({
  none: "none",
  "dark-leather": "url(\"assets/textures/transparent/dark-leather.png\")",
  "pebbled-leather": "url(\"assets/textures/pebbled-leather-gray.png\")",
  "brushed-aluminum": "url(\"assets/textures/transparent/brushed-alum.png\")",
  "gun-metal": "url(\"assets/textures/transparent/gun-metal.png\")",
  rubber: "url(\"assets/textures/transparent/rubber-grip.png\")",
  walnut: "url(\"assets/textures/transparent/tileable-wood-colored.png\")",
  canvas: "url(\"assets/textures/transparent/fabric-1-dark.png\")",
  felt: "url(\"assets/textures/transparent/black-felt.png\")",
  paper: "url(\"assets/textures/transparent/natural-paper.png\")"
});
const USER_CONSTRUCTION_PROFILES = Object.freeze({
  flat: { bevel: 0, shadow: 0.2 },
  raised: { bevel: 1, shadow: 1 },
  recessed: { bevel: 0.75, shadow: 0.65 },
  beveled: { bevel: 1.4, shadow: 1.15 },
  stitched: { bevel: 0.65, shadow: 0.72 },
  inset: { bevel: 0.45, shadow: 0.5 },
  hardware: { bevel: 1.75, shadow: 1.3 }
});
const USER_MATERIAL_PRESETS = Object.freeze({
  "leather-saddle": { label: "Saddle leather + dark controls", values: { constructionStyle: "stitched", surfaceTexture: "dark-leather", leatherColor: "#6b3f2a", panelSurface: "#76503e", surfaceTint: "#704631", textureOpacity: 0.34, textureScale: 150, materialGloss: 0.16, bevelDepth: 3, highlightStrength: 0.32, edgeContrast: 0.52, pressDepth: 2, buttonFill: "#35424d", buttonText: "#fff8e8", sliderTrack: "#272d31", sliderThumb: "#b9aa96", dropdownFill: "#f5ead8", dropdownStroke: "#4c3a31", textFill: "#fff8e8", textStroke: "#5b473b" } },
  "leather-black": { label: "Black leather + chrome", values: { constructionStyle: "beveled", surfaceTexture: "pebbled-leather", leatherColor: "#202225", panelSurface: "#2a2d31", surfaceTint: "#25282c", textureOpacity: 0.42, textureScale: 118, materialGloss: 0.28, bevelDepth: 4, highlightStrength: 0.46, edgeContrast: 0.68, pressDepth: 2, buttonFill: "#191c20", buttonText: "#f6f2e8", sliderTrack: "#0f1114", sliderThumb: "#c5c9ca", dropdownFill: "#272b2f", dropdownStroke: "#9ba0a3", textFill: "#202327", textStroke: "#888f93", labelColor: "#f4efe5" } },
  "plastic-graphite": { label: "Graphite molded plastic", values: { constructionStyle: "raised", surfaceTexture: "none", leatherColor: "#34383d", panelSurface: "#3d4248", surfaceTint: "#3b4046", textureOpacity: 0, textureScale: 120, materialGloss: 0.48, bevelDepth: 4, highlightStrength: 0.42, edgeContrast: 0.58, pressDepth: 2, buttonFill: "#2d3238", buttonText: "#f7f7f4", sliderTrack: "#191c20", sliderThumb: "#5b6269", dropdownFill: "#e8e9e7", dropdownStroke: "#4e555b", textFill: "#f4f4f1", textStroke: "#555b60" } },
  "plastic-cream": { label: "Warm molded plastic", values: { constructionStyle: "raised", surfaceTexture: "none", leatherColor: "#b9aa8c", panelSurface: "#d1c4a8", surfaceTint: "#d8cdb6", textureOpacity: 0, textureScale: 120, materialGloss: 0.38, bevelDepth: 3, highlightStrength: 0.5, edgeContrast: 0.38, pressDepth: 2, buttonFill: "#796b55", buttonText: "#fffdf7", sliderTrack: "#8f846f", sliderThumb: "#ded4bf", dropdownFill: "#fffaf0", dropdownStroke: "#8f826b", textFill: "#fffdf8", textStroke: "#95876f" } },
  "metal-brushed": { label: "Brushed aluminum", values: { constructionStyle: "hardware", surfaceTexture: "brushed-aluminum", leatherColor: "#555b5e", panelSurface: "#8b9193", surfaceTint: "#9ba0a1", textureOpacity: 0.48, textureScale: 96, materialGloss: 0.72, bevelDepth: 4, highlightStrength: 0.72, edgeContrast: 0.82, pressDepth: 1, buttonFill: "#707679", buttonText: "#111416", sliderTrack: "#313638", sliderThumb: "#bfc4c4", dropdownFill: "#d4d7d6", dropdownStroke: "#4e5557", textFill: "#eceeed", textStroke: "#565d5f", labelColor: "#171b1d" } },
  "metal-painted": { label: "Painted vintage metal", values: { constructionStyle: "beveled", surfaceTexture: "gun-metal", leatherColor: "#35454a", panelSurface: "#40565b", surfaceTint: "#496066", textureOpacity: 0.24, textureScale: 132, materialGloss: 0.36, bevelDepth: 4, highlightStrength: 0.4, edgeContrast: 0.7, pressDepth: 2, buttonFill: "#25373c", buttonText: "#f4ecd9", sliderTrack: "#162529", sliderThumb: "#b6a57d", dropdownFill: "#d9d3c5", dropdownStroke: "#3c4d50", textFill: "#eee9dc", textStroke: "#43565a" } },
  rubber: { label: "Soft-touch rubber", values: { constructionStyle: "inset", surfaceTexture: "rubber", leatherColor: "#242729", panelSurface: "#2f3335", surfaceTint: "#2c3032", textureOpacity: 0.32, textureScale: 104, materialGloss: 0.08, bevelDepth: 2, highlightStrength: 0.18, edgeContrast: 0.46, pressDepth: 2, buttonFill: "#222628", buttonText: "#f3f4ef", sliderTrack: "#101314", sliderThumb: "#4a5053", dropdownFill: "#303537", dropdownStroke: "#676e70", textFill: "#292e30", textStroke: "#686f71", labelColor: "#f0f1ec" } },
  walnut: { label: "Walnut and brass", values: { constructionStyle: "beveled", surfaceTexture: "walnut", leatherColor: "#4a2d20", panelSurface: "#5d3827", surfaceTint: "#5a3423", textureOpacity: 0.42, textureScale: 180, materialGloss: 0.34, bevelDepth: 3, highlightStrength: 0.38, edgeContrast: 0.66, pressDepth: 2, buttonFill: "#8e7341", buttonText: "#20160e", sliderTrack: "#342218", sliderThumb: "#c2a462", dropdownFill: "#efe1c4", dropdownStroke: "#6d4d2f", textFill: "#f7ecd7", textStroke: "#715034" } },
  canvas: { label: "Canvas field kit", values: { constructionStyle: "stitched", surfaceTexture: "canvas", leatherColor: "#4a4b36", panelSurface: "#626249", surfaceTint: "#5b5c43", textureOpacity: 0.38, textureScale: 124, materialGloss: 0.06, bevelDepth: 2, highlightStrength: 0.18, edgeContrast: 0.42, pressDepth: 2, buttonFill: "#3e4335", buttonText: "#f4ecd5", sliderTrack: "#292c23", sliderThumb: "#a79d78", dropdownFill: "#e6dfc7", dropdownStroke: "#66634b", textFill: "#f1ead7", textStroke: "#6d684f" } }
});

const THEME_MATERIAL_RECOMMENDATIONS = Object.freeze({
  Neutral: {
    best: { material: "Leather", label: "dark blue", color: "#20384d", preset: "leather-saddle" },
    Leather: [["dark blue", "#20384d", "leather-saddle"], ["forest", "#30483b", "leather-saddle"], ["saddle", "#65422f", "leather-saddle"]],
    Plastic: [["graphite", "#343a40", "plastic-graphite"], ["warm cream", "#b7a887", "plastic-cream"]],
    Metal: [["silver", "#747d82", "metal-brushed"], ["blue gray", "#3d535c", "metal-painted"]]
  },
  Red: {
    best: { material: "Leather", label: "forest", color: "#29483a", preset: "leather-saddle" },
    Leather: [["forest", "#29483a", "leather-saddle"], ["dark blue", "#203b56", "leather-saddle"], ["charcoal", "#292d31", "leather-black"]],
    Plastic: [["navy", "#293c55", "plastic-graphite"], ["warm cream", "#b9aa8c", "plastic-cream"]],
    Metal: [["gunmetal", "#465359", "metal-painted"], ["silver", "#858b8d", "metal-brushed"]]
  },
  Orange: {
    best: { material: "Leather", label: "navy", color: "#203a55", preset: "leather-saddle" },
    Leather: [["navy", "#203a55", "leather-saddle"], ["deep teal", "#24494b", "leather-saddle"], ["charcoal", "#292d31", "leather-black"]],
    Plastic: [["graphite", "#343a40", "plastic-graphite"], ["blue gray", "#40576a", "plastic-graphite"]],
    Metal: [["blue steel", "#506671", "metal-painted"], ["silver", "#7e8588", "metal-brushed"]]
  },
  Yellow: {
    best: { material: "Leather", label: "dark blue", color: "#1f3b57", preset: "leather-saddle" },
    Leather: [["dark blue", "#1f3b57", "leather-saddle"], ["forest", "#2d4939", "leather-saddle"], ["oxblood", "#562c31", "leather-saddle"]],
    Plastic: [["graphite", "#333a42", "plastic-graphite"], ["deep green", "#364b3e", "plastic-graphite"]],
    Metal: [["gunmetal", "#46545b", "metal-painted"], ["brushed silver", "#858b8c", "metal-brushed"]]
  },
  Green: {
    best: { material: "Leather", label: "oxblood", color: "#582e32", preset: "leather-saddle" },
    Leather: [["oxblood", "#582e32", "leather-saddle"], ["dark blue", "#213a55", "leather-saddle"], ["walnut", "#4b3024", "leather-saddle"]],
    Plastic: [["graphite", "#343a3f", "plastic-graphite"], ["warm cream", "#b6a786", "plastic-cream"]],
    Metal: [["warm gray", "#716d67", "metal-brushed"], ["painted blue", "#3e5662", "metal-painted"]]
  },
  Teal: {
    best: { material: "Leather", label: "walnut brown", color: "#503426", preset: "leather-saddle" },
    Leather: [["walnut brown", "#503426", "leather-saddle"], ["oxblood", "#542e34", "leather-saddle"], ["charcoal", "#292d31", "leather-black"]],
    Plastic: [["graphite", "#353a3f", "plastic-graphite"], ["warm cream", "#b9aa8d", "plastic-cream"]],
    Metal: [["warm silver", "#817b72", "metal-brushed"], ["gunmetal", "#45545a", "metal-painted"]]
  },
  Blue: {
    best: { material: "Leather", label: "saddle", color: "#65422f", preset: "leather-saddle" },
    Leather: [["saddle", "#65422f", "leather-saddle"], ["oxblood", "#572f35", "leather-saddle"], ["forest", "#30463a", "leather-saddle"]],
    Plastic: [["warm cream", "#b8aa8c", "plastic-cream"], ["graphite", "#353a40", "plastic-graphite"]],
    Metal: [["warm silver", "#817a70", "metal-brushed"], ["dark bronze", "#665747", "metal-painted"]]
  },
  Purple: {
    best: { material: "Leather", label: "dark blue", color: "#203a56", preset: "leather-saddle" },
    Leather: [["dark blue", "#203a56", "leather-saddle"], ["forest", "#2e493b", "leather-saddle"], ["charcoal", "#292d32", "leather-black"]],
    Plastic: [["navy", "#2c3d55", "plastic-graphite"], ["warm cream", "#b7aa8d", "plastic-cream"]],
    Metal: [["blue steel", "#526771", "metal-painted"], ["silver", "#858a8c", "metal-brushed"]]
  }
});

function materialRecommendationsForTheme(theme, themeId = "") {
  const family = routeThemeColorFamily(theme || {}, themeId);
  return { family, ...(THEME_MATERIAL_RECOMMENDATIONS[family] || THEME_MATERIAL_RECOMMENDATIONS.Neutral) };
}

function themeMaterialBestMatchLabel(theme, themeId = "") {
  const recommendation = materialRecommendationsForTheme(theme, themeId).best;
  return `${recommendation.label} ${recommendation.material.toLowerCase()}`;
}

function activeThemeForMaterialRecommendations() {
  const theme = allRouteThemes()[activeRouteThemeId];
  if (theme) return { id: activeRouteThemeId, theme };
  const providerId = String(activeRouteThemeId || "").replace(/^osm-/, "");
  const provider = MAPLIBRE_STYLES.find(style => style.id === providerId);
  return { id: activeRouteThemeId, theme: provider ? mapLibreStyleToRouteTheme(provider) : completeTheme({ styles: getStyleState(), uiTheme: getUiThemeState() }) };
}

function applyThemeMaterialRecommendation(recommendation) {
  const preset = USER_MATERIAL_PRESETS[recommendation?.preset];
  const color = normalizeHex(recommendation?.color);
  if (!preset || !color) return false;
  const dark = relativeLuminance(color) < 0.36;
  Object.assign(userControlAppearance, cloneUserViewDraftState(preset.values), {
    materialPreset: "custom",
    leatherColor: color,
    panelSurface: mixHex(color, dark ? "#ffffff" : "#000000", dark ? 0.1 : 0.08),
    surfaceTint: mixHex(color, dark ? "#ffffff" : "#000000", dark ? 0.05 : 0.13)
  });
  userControlAppearance.sectionFill = userControlAppearance.panelSurface;
  userControlAppearance.subsectionFill = userControlAppearance.surfaceTint;
  userControlAppearance.sectionStroke = preset.values.buttonText;
  userControlAppearance.subsectionStroke = preset.values.buttonText;
  applyUserControlAppearance({ save: true, render: true });
  renderUserAppearanceSections();
  pushUserBuilderHistory(`Apply ${recommendation.label} ${recommendation.material.toLowerCase()} recommendation`);
  setUserLayoutStatus(`${recommendation.label} ${recommendation.material.toLowerCase()} applied.`);
  return true;
}
const USER_CONTROL_APPEARANCE_SCHEMA = [
  { title: "Materials", fields: [
    { key: "materialPreset", label: "Material preset", type: "select", hidden: true, value: "leather-saddle", options: [["leather-saddle", "Saddle leather"], ["leather-black", "Black leather"], ["plastic-graphite", "Graphite plastic"], ["plastic-cream", "Warm plastic"], ["metal-brushed", "Brushed aluminum"], ["metal-painted", "Painted metal"], ["rubber", "Rubber"], ["walnut", "Walnut"], ["canvas", "Canvas"], ["custom", "Custom"]] },
    { key: "constructionStyle", label: "Construction", type: "select", hidden: true, value: "stitched", options: [["flat", "Flat"], ["raised", "Raised"], ["recessed", "Recessed"], ["beveled", "Beveled"], ["stitched", "Stitched"], ["inset", "Inset"], ["hardware", "Instrument hardware"]] },
    { key: "surfaceTexture", label: "Surface texture", type: "select", value: "dark-leather", options: [["none", "None / smooth"], ["dark-leather", "Dark leather"], ["pebbled-leather", "Pebbled leather"], ["brushed-aluminum", "Brushed aluminum"], ["gun-metal", "Gun metal"], ["rubber", "Rubber grip"], ["walnut", "Walnut"], ["canvas", "Canvas"], ["felt", "Felt"], ["paper", "Natural paper"]] },
    { key: "leatherColor", label: "Leather", css: "--users-shell-leather-color", type: "color", value: "#6b3f2a" },
    { key: "panelSurface", label: "Panel surface", css: "--user-panel-surface-color", type: "color", value: "#76503e" },
    { key: "surfaceTint", label: "Surface tint", css: "--user-material-surface-tint", type: "color", value: "#704631" },
    { key: "textureOpacity", label: "Texture strength", css: "--user-material-texture-opacity", type: "range", min: 0, max: 1, step: 0.02, value: 0.34 },
    { key: "textureScale", label: "Texture scale", css: "--user-material-texture-scale", type: "range", min: 32, max: 320, step: 4, unit: "px", value: 150 },
    { key: "materialGloss", label: "Gloss", css: "--user-material-gloss", type: "range", min: 0, max: 1, step: 0.02, value: 0.16 },
    { key: "bevelDepth", label: "Bevel depth", css: "--user-material-bevel-depth", type: "range", min: 0, max: 10, step: 0.5, unit: "px", value: 3 },
    { key: "highlightStrength", label: "Highlight", css: "--user-material-highlight-strength", type: "range", min: 0, max: 1, step: 0.02, value: 0.32 },
    { key: "edgeContrast", label: "Edge contrast", css: "--user-material-edge-contrast", type: "range", min: 0, max: 1, step: 0.02, value: 0.52 },
    { key: "pressDepth", label: "Press depth", css: "--user-material-press-depth", type: "range", min: 0, max: 6, step: 0.5, unit: "px", value: 2 }
  ] },
  { title: "Sections", fields: [
    { key: "sectionFill", label: "Fill", css: "--user-section-fill", type: "color", value: "#835f4f" },
    { key: "sectionStroke", label: "Stroke", css: "--user-section-stroke", type: "color", value: "#fff8e8" },
    { key: "sectionStrokeWidth", label: "Stroke width", css: "--user-section-stroke-width-ui", type: "range", min: 0, max: 8, step: 1, unit: "px", value: 2 },
    { key: "sectionRadius", label: "Corner radius", css: "--user-section-radius-ui", type: "range", min: 0, max: 36, step: 1, unit: "px", value: 10 },
    { key: "sectionOpacity", label: "Opacity", css: "--user-section-opacity-ui", type: "range", min: 0.1, max: 1, step: 0.05, value: 1 }
  ] },
  { title: "Subsections", fields: [
    { key: "subsectionFill", label: "Fill", css: "--user-subsection-fill", type: "color", value: "#9a7b6c" },
    { key: "subsectionStroke", label: "Stroke", css: "--user-subsection-stroke", type: "color", value: "#fff8e8" },
    { key: "subsectionStrokeWidth", label: "Stroke width", css: "--user-subsection-stroke-width-ui", type: "range", min: 0, max: 6, step: 1, unit: "px", value: 1 },
    { key: "subsectionRadius", label: "Corner radius", css: "--user-subsection-radius-ui", type: "range", min: 0, max: 36, step: 1, unit: "px", value: 10 },
    { key: "subsectionOpacity", label: "Opacity", css: "--user-subsection-opacity-ui", type: "range", min: 0.1, max: 1, step: 0.05, value: 1 }
  ] },
  { title: "Dividers", fields: [
    { key: "dividerStyle", label: "Line style", css: "--user-divider-style", type: "select", value: "solid", options: [
      ["solid", "Solid"], ["thick-thin", "Thick over thin"], ["thin-thick", "Thin over thick"],
      ["double", "Double"], ["dashed", "Dashed"], ["dotted", "Dotted"], ["glow", "Soft glow"], ["inlay", "Inlay guide (line hidden)"], ["custom", "Custom style workbench"]
    ] },
    { key: "dividerColor", label: "Color", css: "--user-divider-color", type: "color", value: "#fff8e8" },
    { key: "dividerWidth", label: "Thickness", css: "--user-divider-width", type: "range", min: 1, max: 12, step: 1, unit: "px", value: 3 },
    { key: "dividerSecondaryWidth", label: "Second line", css: "--user-divider-secondary-width", type: "range", min: 1, max: 12, step: 1, unit: "px", value: 1, showWhen: { key: "dividerStyle", values: ["thick-thin", "thin-thick", "double"] } },
    { key: "dividerLineGap", label: "Line gap", css: "--user-divider-line-gap", type: "range", min: 1, max: 12, step: 1, unit: "px", value: 3, showWhen: { key: "dividerStyle", values: ["thick-thin", "thin-thick", "double"] } },
    { key: "dividerDashLength", label: "Dash / dot size", css: "--user-divider-dash-length", type: "range", min: 2, max: 28, step: 1, unit: "px", value: 10, showWhen: { key: "dividerStyle", values: ["dashed", "dotted"] } },
    { key: "dividerDashGap", label: "Dash gap", css: "--user-divider-dash-gap", type: "range", min: 2, max: 28, step: 1, unit: "px", value: 7, showWhen: { key: "dividerStyle", values: ["dashed", "dotted"] } },
    { key: "dividerGlowSize", label: "Glow size", css: "--user-divider-glow-size", type: "range", min: 2, max: 24, step: 1, unit: "px", value: 8, showWhen: { key: "dividerStyle", values: ["glow"] } },
    { key: "dividerOpacity", label: "Opacity", css: "--user-divider-opacity", type: "range", min: 0.1, max: 1, step: 0.05, value: 0.94 }
  ] },
  { title: "Sliders", fields: [
    { key: "sliderAccent", label: "Accent", css: "--user-slider-accent", type: "color", value: "#4772e0" },
    { key: "sliderTrack", label: "Track", css: "--user-slider-track", type: "color", value: "#e4e2ea" },
    { key: "sliderThumb", label: "Thumb", css: "--user-slider-thumb", type: "color", value: "#6d7080" }
  ] },
  { title: "Dropdowns", fields: [
    { key: "dropdownFill", label: "Fill", css: "--user-dropdown-fill", type: "color", value: "#fffdf8" },
    { key: "dropdownStroke", label: "Stroke", css: "--user-dropdown-stroke", type: "color", value: "#8e9299" },
    { key: "dropdownRadius", label: "Corner radius", css: "--user-dropdown-radius", type: "range", min: 0, max: 24, step: 1, unit: "px", value: 8 }
  ] },
  { title: "Checkboxes & Toggles", fields: [
    { key: "toggleAccent", label: "Accent", css: "--user-toggle-accent", type: "color", value: "#4772e0" },
    { key: "toggleSize", label: "Control size", css: "--user-toggle-size", type: "range", min: 14, max: 32, step: 1, unit: "px", value: 20 }
  ] },
  { title: "Buttons", fields: [
    { key: "buttonFill", label: "Fill", css: "--user-button-fill", type: "color", value: "#384653" },
    { key: "buttonText", label: "Text", css: "--user-button-text", type: "color", value: "#fffdf8" },
    { key: "buttonShape", label: "Default shape", type: "select", value: "rounded", options: [["rounded", "Rounded"], ["pill", "Pill"], ["circle", "Circle"], ["square", "Square"]] },
    { key: "buttonRadius", label: "Corner radius", css: "--user-button-radius", type: "range", min: 0, max: 24, step: 1, unit: "px", value: 8 },
    { key: "buttonEdgeStyle", label: "Edging", type: "select", value: "material", options: [["none", "None"], ["material", "Material bevel"], ["solid", "Solid"], ["inset", "Inset"], ["outset", "Raised"], ["stitched", "Sewn / stitched"]] },
    { key: "buttonEdgeColor", label: "Edge color", css: "--user-button-edge-color", type: "color", value: "#20272d" },
    { key: "buttonEdgeWidth", label: "Edge thickness", css: "--user-button-edge-width", type: "range", min: 0, max: 12, step: 0.5, unit: "px", value: 2 }
  ] },
  { title: "Inlays", fields: [
    { key: "inlayTargets", label: "Apply around", type: "select", value: "off", options: [["off", "Off"], ["buttons", "Buttons"], ["dividers", "Dividers"], ["both", "Buttons and dividers"]] },
    { key: "inlayColor", label: "Material", css: "--user-inlay-color", type: "color", value: "#30251f" },
    { key: "inlayOffset", label: "Offset", css: "--user-inlay-offset", type: "range", min: 0, max: 32, step: 1, unit: "px", value: 6 },
    { key: "inlayRadius", label: "Corner radius", css: "--user-inlay-radius", type: "range", min: 0, max: 40, step: 1, unit: "px", value: 12 }
  ] },
  { title: "Text Fields", fields: [
    { key: "textFill", label: "Fill", css: "--user-text-control-fill", type: "color", value: "#fffdf8" },
    { key: "textStroke", label: "Stroke", css: "--user-text-control-stroke", type: "color", value: "#8e9299" },
    { key: "textRadius", label: "Corner radius", css: "--user-text-control-radius", type: "range", min: 0, max: 24, step: 1, unit: "px", value: 8 }
  ] },
  { title: "Color Controls", fields: [
    { key: "colorRadius", label: "Corner radius", css: "--user-color-control-radius", type: "range", min: 0, max: 24, step: 1, unit: "px", value: 10 },
    { key: "colorHeight", label: "Swatch height", css: "--user-color-control-height", type: "range", min: 28, max: 72, step: 1, unit: "px", value: 42 }
  ] },
  { title: "Labels & Typography", fields: [
    { key: "labelColor", label: "Label color", css: "--user-control-label-color", type: "color", value: "#25313d" },
    { key: "fontFamily", label: "Font", css: "--user-control-font-family", type: "select", value: "inherit", options: [["inherit", "Theme font"], ["Arial, sans-serif", "Arial"], ["Verdana, sans-serif", "Verdana"], ["Georgia, serif", "Georgia"], ["'Courier New', monospace", "Courier"]] },
    { key: "fontSize", label: "Font size", css: "--user-control-font-size", type: "range", min: 11, max: 26, step: 1, unit: "px", value: 16 },
    { key: "fontWeight", label: "Font weight", css: "--user-control-font-weight", type: "range", min: 400, max: 950, step: 50, value: 800 }
  ] }
];
const USER_CONTROL_APPEARANCE_DEFAULTS = Object.fromEntries(USER_CONTROL_APPEARANCE_SCHEMA.flatMap(group => group.fields.map(field => [field.key, field.value])));


function userLayoutSourceButton(controlId) {
  return {
    "builtin.previousDay": els.previousDay,
    "builtin.nextDay": els.nextDay,
    "builtin.viewWholeTrip": els.usView,
    "builtin.storyTheme": els.storyThemeSelect,
    "builtin.storyPrevious": els.storyPrevious,
    "builtin.storyNext": els.storyNext,
    "builtin.storyJourney": els.storyJourneyView,
    "builtin.storyUs": els.storyUsView
  }[controlId] || null;
}

function createUserLayoutBuiltinControl(item, builderMode) {
  const definition = userLayoutBuiltinControl(item.controlId);
  if (!definition) return null;
  const config = normalizeUserLayoutControlConfig(item.controlConfig);
  const replacementTemplate = userGizmoTemplate(config.gizmoTemplateId);
  const visualDefinition = replacementTemplate ? {
    ...replacementTemplate,
    id: item.controlId,
    text: ["button", "icon-button", "transport", "direction"].includes(String(replacementTemplate.kind))
      ? config.buttonText || userLayoutControlDisplayLabel(item)
      : replacementTemplate.text || replacementTemplate.label,
    controlType: replacementTemplate.kind,
    gizmo: true
  } : definition;
  const card = document.createElement("article");
  card.className = "user-layout-builtin-control user-layout-placed-control";
  card.dataset.controlId = item.controlId;
  const name = document.createElement("strong");
  name.textContent = userLayoutControlDisplayLabel(item);
  const sourceButton = userLayoutSourceButton(item.controlId);
  if (visualDefinition.gizmo) {
    card.classList.add("user-layout-gizmo-control");
    card.dataset.gizmoTemplate = replacementTemplate?.id || userGizmoTemplateFromControlId(item.controlId)?.id || "";
    card.dataset.assignedControlId = item.assignedControlId || "";
    if (item.showLabel !== false) card.append(name);
    const face = createUserGizmoFace(visualDefinition, { interactive: true });
    if (!builderMode && item.assignedControlId) bindUserGizmoFaceToRecordedControl(face, item.assignedControlId);
    if (!builderMode && sourceButton) {
      face.querySelectorAll("button").forEach(button => { button.disabled = Boolean(sourceButton.disabled); });
      face.addEventListener("click", event => {
        if (!event.target.closest("button") || sourceButton.disabled) return;
        sourceButton.click();
        requestAnimationFrame(refreshUserRuntimeControlValues);
      });
    }
    card.append(face);
    return card;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = config.buttonText || definition.text;
  button.setAttribute("aria-label", userLayoutControlDisplayLabel(item));
  button.dataset.buttonShape = config.buttonShape;
  button.disabled = builderMode || item.controlId === "builtin.siteLogo" || Boolean(sourceButton?.disabled);
  if (!builderMode && sourceButton) button.addEventListener("click", () => {
    sourceButton.click();
    requestAnimationFrame(refreshUserRuntimeControlValues);
  });
  if (item.showLabel !== false) card.append(name);
  card.append(button);
  return card;
}



function createUserLayoutPlacedControl(item, builderMode) {
  if (item?.source === "builtin" || userLayoutBuiltinControl(item?.controlId)) {
    const card = createUserLayoutBuiltinControl(item, builderMode);
    if (!card) return null;
    if (builderMode) {
      card.dataset.userBuilderCard = "true";
      card.draggable = false;
      card.addEventListener("dragstart", event => beginUserBuilderControlDrag(event, item.controlId, "layout"));
      card.addEventListener("dragend", clearUserBuilderDragState);
    }
    return card;
  }
  const entry = getSettingEntry(item?.controlId);
  if (!entry?.userSafe) return null;
  const config = normalizeUserLayoutControlConfig(item.controlConfig);
  const replacementTemplate = userGizmoTemplate(config.gizmoTemplateId);
  if (replacementTemplate) {
    const visualDefinition = {
      ...replacementTemplate,
      text: ["button", "icon-button", "transport", "direction"].includes(String(replacementTemplate.kind))
        ? config.buttonText || userLayoutControlDisplayLabel(item)
        : replacementTemplate.text || replacementTemplate.label
    };
    const card = document.createElement("article");
    card.className = "user-layout-gizmo-control user-layout-recorded-gizmo-control user-layout-placed-control";
    card.dataset.controlId = item.controlId;
    card.dataset.assignedControlId = item.controlId;
    card.dataset.gizmoTemplate = replacementTemplate.id;
    const name = document.createElement("strong");
    name.className = "users-compact-control-name";
    name.textContent = userLayoutControlDisplayLabel(item);
    if (item.showLabel !== false) card.append(name);
    const face = createUserGizmoFace(visualDefinition, { interactive: true });
    if (!builderMode) bindUserGizmoFaceToRecordedControl(face, item.controlId);
    card.append(face);
    if (builderMode) {
      card.dataset.userBuilderCard = "true";
      card.draggable = false;
      card.addEventListener("dragstart", event => beginUserBuilderControlDrag(event, item.controlId, "layout"));
      card.addEventListener("dragend", clearUserBuilderDragState);
    }
    return card;
  }
  if (!builderMode) {
    const row = createUserSiteSettingRow(entry, item.controlId, item);
    row.classList.add("user-layout-placed-control");
    return row;
  }
  const card = document.createElement("article");
  card.className = "users-compact-control-card user-layout-placed-control";
  card.dataset.controlId = item.controlId;
  card.dataset.userBuilderCard = "true";
  card.draggable = false;
  const name = document.createElement("strong");
  name.className = "users-compact-control-name";
  name.textContent = userLayoutControlDisplayLabel(item);
  if (item.showLabel !== false) card.append(name);
  card.append(createUsersRegistryControlPreview(entry, item));
  card.addEventListener("dragstart", event => beginUserBuilderControlDrag(event, item.controlId, "layout"));
  card.addEventListener("dragend", clearUserBuilderDragState);
  return card;
}

function renderUserLayoutControls(content, section) {
  const controls = Array.isArray(section.controls) ? section.controls : [];
  if (!controls.length) return;
  const stack = document.createElement("div");
  stack.className = "user-layout-control-stack";
  controls.forEach(item => {
    const control = createUserLayoutPlacedControl(item, isUsersBuilderMode());
    if (!control) return;
    const object = document.createElement("div");
    object.className = "user-layout-control-object";
    object.dataset.controlId = item.controlId;
    object.style.left = `${item.x * 100}%`;
    object.style.top = `${item.y * 100}%`;
    object.style.width = `${item.width * 100}%`;
    object.style.height = `${item.height * 100}%`;
    const objectAppearance = effectiveUserControlAppearance(item);
    USER_CONTROL_APPEARANCE_SCHEMA.forEach(group => group.fields.forEach(field => {
      if (!field.css || !Object.prototype.hasOwnProperty.call(item.appearance || {}, field.key)) return;
      object.style.setProperty(field.css, `${objectAppearance[field.key]}${field.unit || ""}`);
    }));
    object.dataset.userButtonEdgeStyle = objectAppearance.buttonEdgeStyle || "material";
    const isButton = Boolean(userLayoutBuiltinControl(item.controlId) || control.querySelector("button"));
    if (isButton) {
      object.dataset.buttonShape = userLayoutControlButtonShape(item);
      if (["buttons", "both"].includes(userControlAppearance.inlayTargets)) {
        const inlay = document.createElement("span");
        inlay.className = "user-control-inlay";
        inlay.setAttribute("aria-hidden", "true");
        object.append(inlay);
      }
    }
    object.classList.toggle("is-selected", isUsersBuilderMode() && selectedUserLayoutControlIds.has(item.controlId));
    object.append(control);
    if (isUsersBuilderMode()) {
      const definition = userLayoutBuiltinControl(item.controlId);
      const assigned = Boolean(item.assignedControlId || (!definition?.gizmo && (definition || getSettingEntry(item.controlId))));
      const assignment = document.createElement("button");
      assignment.type = "button";
      assignment.className = "user-gizmo-assignment-state";
      assignment.classList.toggle("is-assigned", assigned);
      assignment.textContent = assigned ? "●" : "○";
      assignment.title = assigned ? "This gizmo is assigned" : "This gizmo is not assigned";
      assignment.setAttribute("aria-label", assignment.title);
      assignment.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
      });
      assignment.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        selectUserLayoutControl(item.controlId);
        openUserGizmoQuickTools(item.controlId, assignment);
      });
      object.append(assignment);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "user-layout-control-remove";
      remove.dataset.userLayoutControlRemove = item.controlId;
      remove.setAttribute("aria-label", definition
        ? `Remove ${definition.label} from section`
        : `Return ${friendlySettingLabel(getSettingEntry(item.controlId))} to recorded controls`);
      remove.textContent = "\u00d7";
      remove.addEventListener("pointerdown", event => {
        event.preventDefault();
        event.stopPropagation();
      });
      remove.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        removeUserLayoutControl(item.controlId, { returnRecorded: !definition });
      });
      object.append(remove);
      ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach(name => appendUserLayoutHandle(object, name));
      object.addEventListener("pointerdown", beginUserLayoutControlManipulation);
    }
    stack.append(object);
  });
  content.append(stack);
}



function appendUserLayoutHandle(node, name) {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = `user-layout-handle user-layout-handle-${name}`;
  handle.dataset.layoutHandle = name;
  handle.tabIndex = -1;
  handle.setAttribute("aria-label", `${name} resize handle`);
  node.append(handle);
}

function renderUserLayoutChildren(host, region, parentId = "", depth = 0) {
  const metrics = userLayoutHostMetrics(host);
  if (!metrics) return;
  const builderMode = isUsersBuilderMode();
  userLayoutElements()
    .filter(element => element.region === region && (element.parentId || "") === parentId)
    .forEach(element => {
      const node = document.createElement("div");
      node.className = `user-layout-object user-layout-${element.type}-object`;
      node.dataset.layoutElementId = element.id;
      node.dataset.layoutDepth = String(depth);
      if (element.type === "divider") node.dataset.dividerStyle = userControlAppearance.dividerStyle || "solid";
      node.classList.toggle("is-selected", selectedUserLayoutElementIds.has(element.id) && isUsersBuilderMode());
      node.classList.toggle("is-selection-muted", selectedUserLayoutElementIds.has(element.id) && !userLayoutSelectionEmphasized);
      if (builderMode) {
        node.addEventListener("pointerenter", () => {
          if (selectedUserLayoutElementIds.has(element.id)) setUserLayoutSelectionEmphasized(true);
        });
      }
      if (element.type === "section") {
        const left = metrics.padding + element.x * metrics.width;
        const top = metrics.padding + element.y * metrics.height;
        node.style.left = `${left}px`;
        node.style.top = `${top}px`;
        const sectionWidth = Math.max(depth ? 52 : 64, element.width * metrics.width);
        const sectionHeight = Math.max(depth ? 36 : 44, element.height * metrics.height);
        node.style.width = `${sectionWidth}px`;
        node.style.height = `${sectionHeight}px`;
        node.classList.toggle("is-user-frame-control-host", Boolean(element.frameHost));
        node.classList.toggle("is-user-runtime-compact", !builderMode && (sectionWidth < 190 || sectionHeight < 96));
        node.classList.toggle("is-user-runtime-micro", !builderMode && (sectionWidth < 128 || sectionHeight < 66));
        const label = document.createElement("span");
        label.className = "user-layout-section-label";
        label.textContent = element.label || (depth ? "Subsection" : "Section");
        const content = document.createElement("div");
        content.className = "user-layout-section-content";
        content.dataset.layoutParentId = element.id;
        if (!element.frameHost) node.append(label);
        node.append(content);
        renderUserLayoutControls(content, element);
        if (builderMode && !element.frameHost) {
          bindUserLayoutControlDropTarget(node, element, content);
          ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach(name => appendUserLayoutHandle(node, name));
        }
        host.append(node);
        renderUserLayoutChildren(content, region, element.id, depth + 1);
      } else {
        const x1 = metrics.padding + element.x1 * metrics.width;
        const y1 = metrics.padding + element.y1 * metrics.height;
        const x2 = metrics.padding + element.x2 * metrics.width;
        const y2 = metrics.padding + element.y2 * metrics.height;
        const length = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        node.style.left = `${x1}px`;
        node.style.top = `${y1 - 10}px`;
        node.style.width = `${Math.max(1, length)}px`;
        node.style.transform = `rotate(${angle}deg)`;
        if (builderMode) {
          appendUserLayoutHandle(node, "start");
          appendUserLayoutHandle(node, "end");
        }
        host.append(node);
      }
      if (builderMode && !element.frameHost) node.addEventListener("pointerdown", beginUserLayoutManipulation);
    });
}

function renderUserFrameLayout() {
  const layer = els.userFrameLayoutLayer;
  if (!layer) return;
  const visible = isUsersBuilderMode() || appState.siteMode === "user";
  const hasAuthoredLayout = visible && userLayoutElements().length > 0;
  document.body.classList.toggle("has-authored-user-layout", hasAuthoredLayout);
  layer.hidden = !visible;
  layer.setAttribute("aria-hidden", visible ? "false" : "true");
  layer.replaceChildren();
  if (!visible) return;
  const builderMode = isUsersBuilderMode();
  const grid = document.createElement("div");
  grid.className = "user-device-layout-grid";
  grid.setAttribute("aria-hidden", "true");
  ["top-left", "top", "top-right", "left", "map", "right", "bottom-left", "bottom", "bottom-right"].forEach(cell => {
    const node = document.createElement("div");
    node.className = `user-device-layout-cell user-device-layout-cell-${cell}`;
    node.dataset.deviceCell = cell;
    grid.append(node);
  });
  layer.append(grid);
  ["top", "right", "bottom", "left"].forEach(region => {
    const host = document.createElement("div");
    host.className = `user-layout-region user-layout-region-${region}`;
    host.dataset.layoutRegion = region;
    if (builderMode) {
      host.addEventListener("pointerdown", beginUserLayoutGesture);
      host.addEventListener("pointerdown", event => {
        if (userLayoutDrawingEnabled || event.button !== 0) return;
        if (event.target.closest?.(".user-layout-object, .user-layout-control-object")) return;
        clearUserLayoutSelection();
      });
      host.addEventListener("pointerleave", () => setUserLayoutSelectionEmphasized(false));
    }
    layer.append(host);
    renderUserLayoutChildren(host, region);
  });
  if (!userSquareGeometryRenderGuard && normalizeRenderedSquareUserButtonGeometries()) {
    userSquareGeometryRenderGuard = true;
    renderUserFrameLayout();
    userSquareGeometryRenderGuard = false;
  }
  if (builderMode && typeof markUserGizmoStylePaintTargets === "function") markUserGizmoStylePaintTargets();
}

function refreshUserRuntimeControlValues() {
  if (appState.siteMode !== "user") return;
  userQueryAll(".user-frame-layout-layer .user-site-setting-row[data-setting-id]").forEach(row => {
    const entry = getSettingEntry(row.dataset.settingId);
    const control = row.querySelector("input, select, textarea");
    if (!entry || !control) return;
    syncUserControlDisplay(entry, control, row.querySelector(".user-site-setting-value"));
  });
  userQueryAll(".user-frame-layout-layer :is(.user-layout-gizmo-control, .user-layout-builtin-control)[data-control-id]").forEach(card => {
    if (card.classList.contains("user-layout-gizmo-control")) {
      const assignedControlId = card.dataset.assignedControlId || "";
      if (assignedControlId) syncUserGizmoFaceFromRecordedControl(card.querySelector(".user-gizmo-face"), assignedControlId);
      const sourceButton = userLayoutSourceButton(card.dataset.controlId);
      if (sourceButton) card.querySelectorAll("button").forEach(button => { button.disabled = Boolean(sourceButton.disabled); });
      return;
    }
    const button = card.querySelector("button");
    const sourceButton = userLayoutSourceButton(card.dataset.controlId);
    if (button) button.disabled = card.dataset.controlId === "builtin.siteLogo" || Boolean(sourceButton?.disabled);
  });
}

function scheduleUserRuntimeValueRefresh() {
  if (appState.siteMode !== "user") return;
  cancelAnimationFrame(userRuntimeValueRefreshFrame);
  userRuntimeValueRefreshFrame = requestAnimationFrame(() => {
    userRuntimeValueRefreshFrame = 0;
    refreshUserRuntimeControlValues();
  });
}

document.addEventListener("input", scheduleUserRuntimeValueRefresh);
document.addEventListener("change", scheduleUserRuntimeValueRefresh);

function scheduleUserRuntimeLayoutRefresh() {
  cancelAnimationFrame(userRuntimeLayoutFrame);
  userRuntimeLayoutFrame = requestAnimationFrame(() => {
    userRuntimeLayoutFrame = 0;
    if (appState.siteMode !== "user" && !isUsersBuilderMode()) return;
    const geometryChanged = revalidateUserFrameGeometryForStage();
    if (!geometryChanged) {
      renderUserFrameLayout();
      scheduleUserMapViewportResize();
    }
  });
}



function renderUserMapViewportResizeLayer() {
  const layer = els.userMapViewportResizeLayer;
  if (!layer) return;
  // Editor tabs use the isolated nested guide rather than legacy live-frame
  // handles; those old handles are still reserved for the Users builder.
  const active = canEditUserMapViewportBounds?.() && isUsersBuilderMode();
  layer.hidden = !active;
  layer.setAttribute("aria-hidden", active ? "false" : "true");
  layer.replaceChildren();
  if (!active) return;
  const directions = [
    "top", "right", "bottom", "left",
    "top-left", "top-right", "bottom-right", "bottom-left"
  ];
  directions.forEach(direction => {
    const handle = document.createElement("button");
    const isCorner = direction.includes("-");
    handle.type = "button";
    handle.className = isCorner
      ? `user-map-resize-corner user-map-resize-corner-${direction}`
      : `user-map-resize-edge user-map-resize-edge-${direction}`;
    handle.tabIndex = -1;
    handle.setAttribute("aria-label", `Resize map viewport from the ${direction.replace("-", " ")}`);
    handle.addEventListener("pointerdown", event => beginUserMapViewportResize(event, direction));
    layer.append(handle);
  });
  const move = document.createElement("button");
  move.type = "button";
  move.className = "user-map-move-handle";
  move.tabIndex = -1;
  move.setAttribute("aria-label", "Move map viewport");
  move.title = "Move map viewport without resizing it";
  move.innerHTML = '<span aria-hidden="true">✥</span>';
  move.addEventListener("pointerdown", beginUserDevicePreviewMove);
  layer.append(move);
}

function renderUserDevicePreviewResizeLayer() {
  const layer = els.userDevicePreviewResizeLayer;
  if (!layer) return;
  const active = canEditUserDeviceBounds?.() && isUsersBuilderMode();
  layer.hidden = !active;
  layer.setAttribute("aria-hidden", active ? "false" : "true");
  layer.replaceChildren();
  if (!active) return;
  ["top", "right", "bottom", "left", "top-left", "top-right", "bottom-right", "bottom-left"].forEach(direction => {
    const handle = document.createElement("button");
    const isCorner = direction.includes("-");
    handle.type = "button";
    handle.className = isCorner
      ? `user-device-resize-corner user-device-resize-corner-${direction}`
      : `user-device-resize-edge user-device-resize-edge-${direction}`;
    handle.tabIndex = -1;
    handle.setAttribute("aria-label", `Resize device outline from the ${direction.replace("-", " ")}`);
    handle.addEventListener("pointerdown", event => beginUserDevicePreviewResize(event, direction));
    layer.append(handle);
  });
  const move = document.createElement("button");
  move.type = "button";
  move.className = "user-device-move-handle";
  move.tabIndex = -1;
  move.title = "Move device outline";
  move.setAttribute("aria-label", "Move device outline");
  move.innerHTML = '<span aria-hidden="true">✥</span>';
  move.addEventListener("pointerdown", beginUserDevicePreviewMove);
  layer.append(move);
}



function renderUserFrameBuilderTools() {
  const tools = userQuery("#userFrameBuilderTools");
  if (!tools) return;
  tools.replaceChildren();
  const builderMode = isUsersBuilderMode();
  tools.setAttribute("aria-hidden", builderMode ? "false" : "true");
  tools.hidden = !builderMode;
  ["top", "right", "bottom", "left"].forEach(panel => {
    const host = userSitePanelElement(panel);
    if (!host) return;
    host.classList.remove(
      "corner-owner-top-left-top", "corner-owner-top-left-left",
      "corner-owner-top-right-top", "corner-owner-top-right-right",
      "corner-owner-bottom-right-bottom", "corner-owner-bottom-right-right",
      "corner-owner-bottom-left-bottom", "corner-owner-bottom-left-left"
    );
  });
  Object.entries(userFrameCornerOwnership).forEach(([corner, owner]) => {
    userSitePanelElement(owner)?.classList.add(`corner-owner-${corner}-${owner}`);
  });
  ["top", "right", "bottom", "left"].forEach(edge => {
    const panelState = userViewDraft.panels?.[edge];
    const hasContent = panelHasPlacedSettings(edge);
    if (!panelState?.enabled && !hasContent) {
      const add = createUserFrameButton(
        `user-frame-add user-frame-add-${edge}`,
        "+",
        `Add ${frameEdgeLabel(edge)} section`,
        () => addUserViewPanel(edge)
      );
      add.dataset.userFrameAdd = edge;
      add.addEventListener("dragover", event => {
        if (!isUsersBuilderMode()) return;
        event.preventDefault();
        add.classList.add("is-user-builder-drop-target");
      });
      add.addEventListener("dragleave", () => add.classList.remove("is-user-builder-drop-target"));
      add.addEventListener("drop", event => {
        if (!isUsersBuilderMode()) return;
        event.preventDefault();
        event.stopPropagation();
        add.classList.remove("is-user-builder-drop-target");
        addUserViewPanel(edge);
        handleUserBuilderDrop(event, edge);
        clearUserBuilderDragState();
      });
      tools.append(add);
    }
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = `user-frame-resize-handle user-frame-resize-${edge}`;
    handle.title = `Resize ${edge} frame edge`;
    handle.setAttribute("aria-label", handle.title);
    handle.addEventListener("pointerdown", event => beginUserFrameResize(event, edge));
    tools.append(handle);
  });
  ["top-left", "top-right", "bottom-right", "bottom-left"].forEach(corner => {
    const first = corner.split("-")[0];
    const second = corner.split("-")[1];
    if (!isUserViewPanelEnabled(first) || !isUserViewPanelEnabled(second)) return;
    const swap = createUserFrameButton(
      `user-frame-corner-swap user-frame-corner-${corner}`,
      "↔",
      `Swap ${frameEdgeLabel(first)} and ${frameEdgeLabel(second)} corner ownership`,
      () => toggleUserFrameCorner(corner)
    );
    swap.dataset.userFrameCorner = corner;
    tools.append(swap);
  });
}
