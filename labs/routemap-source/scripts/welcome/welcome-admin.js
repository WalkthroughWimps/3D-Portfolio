"use strict";

// The public landing page is deliberately independent from the map runtime.
// This editor owns only the serializable screen description saved in UI settings.
const WELCOME_DEVICES = ["desktop", "tablet", "phone"];
const WELCOME_DEFAULT_ELEMENTS = [
  { id: "welcome-eyebrow", type: "eyebrow", content: "Retired for Travel" },
  { id: "welcome-heading", type: "heading", content: "Site in development" },
  { id: "welcome-copy", type: "text", content: "A new road-story experience is being prepared. Please check back soon." }
];
const WELCOME_DEFAULT_LAYOUTS = {
  desktop: { "welcome-eyebrow": { x: 12, y: 25, w: 50, h: 7 }, "welcome-heading": { x: 12, y: 33, w: 58, h: 24 }, "welcome-copy": { x: 12, y: 60, w: 42, h: 18 } },
  tablet: { "welcome-eyebrow": { x: 10, y: 22, w: 70, h: 7 }, "welcome-heading": { x: 10, y: 30, w: 75, h: 24 }, "welcome-copy": { x: 10, y: 58, w: 68, h: 19 } },
  phone: { "welcome-eyebrow": { x: 9, y: 19, w: 82, h: 7 }, "welcome-heading": { x: 9, y: 28, w: 82, h: 25 }, "welcome-copy": { x: 9, y: 59, w: 80, h: 19 } }
};

const WELCOME_DEFAULT_BACKGROUND = { color: "#16333c", pattern: "dots", material: "smooth", imageUrl: "" };
const WELCOME_DEFAULT_LOADING = { title: "RV Route Map", message: "Journey around the country with freedom in your hair." };
const MAINTENANCE_ROUTE_ICONS = new Set(["🧸", "🦙", "🏎️", "🌪️", "🚐", "🚂", "⛵", "🚀", "🤖", "🐕", "🐈", "🛸", "🚜", "🦊", "🦕", "🎈"]);
const WELCOME_DEFAULT_MAINTENANCE_ROUTE = Object.freeze({ icon: "🚐", size: 54 });
let welcomeScreenState = { version: 1, publicStatus: "development", elements: [], layouts: {}, background: { ...WELCOME_DEFAULT_BACKGROUND }, loadingScreen: { ...WELCOME_DEFAULT_LOADING }, maintenanceRoute: { ...WELCOME_DEFAULT_MAINTENANCE_ROUTE } };
let welcomeActiveDevice = "desktop";
let welcomeSelectedId = "";
let welcomePendingMediaId = "";
const welcomeNewElementIds = new Set();
let welcomeFullCanvasOpen = false;
let welcomeFullCanvasMode = "welcome";
let splashPreviewTarget = "maintenance";
let splashMaintenanceSection = null;
let splashWelcomeSection = null;
let welcomeDrawMode = false;

function welcomeClone(value) { return JSON.parse(JSON.stringify(value)); }
function normalizeMaintenanceRoute(value = {}) {
  const icon = MAINTENANCE_ROUTE_ICONS.has(value?.icon) ? value.icon : WELCOME_DEFAULT_MAINTENANCE_ROUTE.icon;
  const size = Math.max(28, Math.min(88, Number(value?.size) || WELCOME_DEFAULT_MAINTENANCE_ROUTE.size));
  return { icon, size };
}
function isMaintenanceSiteMode() {
  return Boolean(globalThis.RV_RUNTIME_ENVIRONMENT?.publicSite) && welcomeScreenState.publicStatus === "maintenance";
}
function getMaintenanceRouteSettings() { return { ...welcomeScreenState.maintenanceRoute }; }
function setMaintenanceRouteSettings(patch = {}) {
  welcomeScreenState.maintenanceRoute = normalizeMaintenanceRoute({ ...welcomeScreenState.maintenanceRoute, ...patch });
  welcomeMarkDirty();
  document.dispatchEvent(new CustomEvent("rvmaintenancechange", { detail: getMaintenanceRouteSettings() }));
}
function applyMaintenanceSiteMode() {
  const active = isMaintenanceSiteMode();
  document.body?.classList.toggle("maintenance-site-mode", active);
  document.dispatchEvent(new CustomEvent("rvmaintenancechange", { detail: getMaintenanceRouteSettings() }));
}
function welcomeId() { return `welcome-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function welcomeDeviceLayoutKey(value) { return String(value || "").includes("phone") ? "phone" : String(value || "").includes("tablet") ? "tablet" : "desktop"; }
function welcomeElementById(id) { return welcomeScreenState.elements.find(element => element.id === id) || null; }
function welcomeDefaultGeometry(index) {
  // New content begins centred. A small cascade keeps successive additions
  // selectable without disturbing any existing, deliberately placed content.
  const offset = (index % 5) * 2;
  return { x: 30 + offset, y: 38 + offset, w: 40, h: 16, rotation: 0 };
}
function welcomeClampGeometry(value = {}) {
  const width = Math.max(8, Math.min(100, Number(value.w) || 30));
  const height = Math.max(5, Math.min(100, Number(value.h) || 16));
  return {
    x: Math.max(0, Math.min(100 - width, Number(value.x) || 0)),
    y: Math.max(0, Math.min(100 - height, Number(value.y) || 0)),
    w: width,
    h: height,
    rotation: Math.max(-180, Math.min(180, Number(value.rotation) || 0))
  };
}
function ensureWelcomeLayouts() {
  const layouts = welcomeScreenState.layouts && typeof welcomeScreenState.layouts === "object" ? welcomeScreenState.layouts : {};
  WELCOME_DEVICES.forEach(device => {
    if (!layouts[device] || typeof layouts[device] !== "object") layouts[device] = {};
    welcomeScreenState.elements.forEach((element, index) => {
      if (!layouts[device][element.id]) {
        const defaultGeometry = WELCOME_DEFAULT_LAYOUTS[device]?.[element.id] || welcomeDefaultGeometry(index);
        layouts[device][element.id] = welcomeClampGeometry(defaultGeometry);
      } else {
        layouts[device][element.id] = welcomeClampGeometry(layouts[device][element.id]);
      }
    });
  });
  welcomeScreenState.layouts = layouts;
}
function normalizeWelcomeScreen(value) {
  const source = value && typeof value === "object" ? value : {};
  welcomeScreenState = {
    version: 1,
    publicStatus: ["development", "live", "maintenance"].includes(source.publicStatus) ? source.publicStatus : "development",
    elements: Array.isArray(source.elements) && source.elements.length ? source.elements.map(element => ({ ...element })) : welcomeClone(WELCOME_DEFAULT_ELEMENTS),
    layouts: welcomeClone(source.layouts || {}),
    background: { ...WELCOME_DEFAULT_BACKGROUND, ...(source.background || {}) },
    loadingScreen: { ...WELCOME_DEFAULT_LOADING, ...(source.loadingScreen || {}) },
    maintenanceRoute: normalizeMaintenanceRoute(source.maintenanceRoute)
  };
  ensureWelcomeLayouts();
}
function getWelcomeScreenState() {
  ensureWelcomeLayouts();
  return welcomeClone(welcomeScreenState);
}
function applyWelcomeScreenState(value) {
  normalizeWelcomeScreen(value);
  applyMaintenanceSiteMode();
  const loading = welcomeScreenState.loadingScreen;
  const title = document.querySelector("#welcomeGateTitle");
  const message = document.querySelector("#welcomeGateMessage");
  if (title) title.textContent = loading.title;
  if (message) message.textContent = loading.message;
  renderWelcomeEditor();
}
function welcomeMarkDirty() {
  if (typeof markProjectDirty === "function") markProjectDirty("ui");
}
function welcomeElementPreview(element) {
  if (["heading", "eyebrow", "text"].includes(element.type)) return document.createTextNode(element.content || "Untitled text");
  if (element.type === "button") {
    const button = document.createElement("span"); button.className = "welcome-preview-button"; button.textContent = element.content || "Button"; return button;
  }
  if (element.type === "image" || element.type === "video") {
    if (!element.url) return document.createTextNode(`Right-click to add ${element.type}`);
    const media = document.createElement(element.type === "video" ? "video" : "img");
    media.src = element.url; media.alt = element.alt || ""; media.muted = true; if (element.type === "video") media.controls = true; return media;
  }
  if (element.type === "slideshow") {
    const slides = Array.isArray(element.slides) ? element.slides : [];
    if (!slides.length) return document.createTextNode("Right-click to add slideshow images");
    const image = document.createElement("img"); image.src = slides[0]; image.alt = "Slideshow preview"; return image;
  }
  if (element.type === "section") {
    const section = document.createElement("div"); section.className = "welcome-preview-section";
    if (element.url) { const image = document.createElement("img"); image.src = element.url; image.alt = "Section image"; section.append(image); }
    const label = document.createElement("strong"); label.textContent = element.content || "Section"; section.append(label); return section;
  }
  if (element.type === "content-frame") {
    const mediaType = element.mediaType || "text";
    if (mediaType === "image") { if (!element.url) return document.createTextNode("Choose picture"); const image = document.createElement("img"); image.src = element.url; image.alt = element.alt || ""; return image; }
    if (mediaType === "video") { if (!element.url) return document.createTextNode("Choose video"); const video = document.createElement("video"); video.src = element.url; video.controls = true; video.muted = true; return video; }
    if (mediaType === "youtube") { const preview = document.createElement("span"); preview.className = "welcome-youtube-placeholder"; preview.textContent = element.url ? "YouTube video" : "Paste YouTube link"; return preview; }
    return document.createTextNode(element.content || "Type text");
  }
  return document.createTextNode("Welcome element");
}
function welcomeParentSectionForPoint(x, y) {
  return welcomeScreenState.elements.find(element => {
    if (element.type !== "section") return false;
    const geometry = welcomeScreenState.layouts[welcomeActiveDevice]?.[element.id];
    return geometry && x >= geometry.x && x <= geometry.x + geometry.w && y >= geometry.y && y <= geometry.y + geometry.h;
  }) || null;
}
function welcomeAutosizeTextFrame(element) {
  if (element.type !== "content-frame" || (element.mediaType || "text") !== "text") return;
  const geometry = welcomeScreenState.layouts[welcomeActiveDevice]?.[element.id];
  if (!geometry) return;
  const parent = welcomeElementById(element.parentId);
  const parentGeometry = parent && welcomeScreenState.layouts[welcomeActiveDevice]?.[parent.id];
  const characters = Math.max(1, String(element.content || "").length);
  const width = Math.min(parentGeometry?.w || 82, Math.max(12, Math.ceil(characters / 18) * 12));
  geometry.w = width; geometry.h = Math.max(6, Math.ceil(characters / 40) * 7);
  geometry.x = parentGeometry ? parentGeometry.x + (parentGeometry.w - width) / 2 : 50 - width / 2;
}
function renderWelcomeInspector() {
  const host = document.querySelector("#welcomeElementInspector");
  const element = welcomeElementById(welcomeSelectedId);
  if (!host) return;
  host.replaceChildren();
  if (!element) { host.textContent = "Select a welcome element to edit its text, link, or media."; return; }
  const geometry = welcomeScreenState.layouts[welcomeActiveDevice][element.id];
  const addField = (label, property, value, type = "text") => {
    const field = document.createElement("label"); field.innerHTML = `<span>${label}</span>`;
    const input = document.createElement(type === "textarea" ? "textarea" : "input"); input.type = type === "textarea" ? undefined : type; input.value = value ?? "";
    input.addEventListener("change", () => { element[property] = input.value; welcomeAutosizeTextFrame(element); welcomeMarkDirty(); renderWelcomeEditor(); });
    field.append(input); host.append(field);
  };
  addField("Type", "type", element.type); // Readable identifier; type cannot be changed accidentally.
  host.lastElementChild.querySelector("input").readOnly = true;
  if (["heading", "eyebrow", "text", "button"].includes(element.type)) addField("Text", "content", element.content, "textarea");
  if (element.type === "content-frame") {
    const actions = document.createElement("div"); actions.className = "welcome-content-type-actions";
    [["text", "Text"], ["image", "Picture"], ["youtube", "YouTube"], ["video", "Video"]].forEach(([type, label]) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = label;
      button.classList.toggle("is-active", (element.mediaType || "text") === type);
      button.addEventListener("click", () => { element.mediaType = type; if (["image", "video"].includes(type)) welcomeChooseMedia(element.id); welcomeAutosizeTextFrame(element); welcomeMarkDirty(); renderWelcomeEditor(); }); actions.append(button);
    });
    host.append(actions);
    if ((element.mediaType || "text") === "text") addField("Text", "content", element.content, "textarea");
    if ((element.mediaType || "text") === "youtube") addField("YouTube link", "url", element.url || "");
    if (["image", "video"].includes(element.mediaType)) { addField("Media URL", "url", element.url || ""); const replace = document.createElement("button"); replace.type = "button"; replace.textContent = "Choose replacement file"; replace.addEventListener("click", () => welcomeChooseMedia(element.id)); host.append(replace); }
  }
  if (element.type === "button") addField("Link", "href", element.href || "#");
  if (["image", "video", "section"].includes(element.type)) {
    addField("Media URL", "url", element.url || "");
    const replace = document.createElement("button"); replace.type = "button"; replace.textContent = "Choose replacement file"; replace.addEventListener("click", () => welcomeChooseMedia(element.id)); host.append(replace);
  }
  if (element.type === "section") addField("Corner radius", "radius", element.radius || 18, "number");
  if (element.type === "slideshow") {
    addField("Slide seconds", "duration", element.duration || 5000, "number");
    const addSlide = document.createElement("button"); addSlide.type = "button"; addSlide.textContent = `Add slide (${(element.slides || []).length})`; addSlide.addEventListener("click", () => welcomeChooseMedia(element.id)); host.append(addSlide);
  }
  ["x", "y", "w", "h", "rotation"].forEach(key => {
    addField(key === "w" ? "Width %" : key === "h" ? "Height %" : key === "rotation" ? "Rotation °" : `${key.toUpperCase()} %`, key, geometry[key], "number");
    const input = host.lastElementChild.querySelector("input");
    input.addEventListener("change", () => { geometry[key] = Number(input.value); welcomeScreenState.layouts[welcomeActiveDevice][element.id] = welcomeClampGeometry(geometry); welcomeMarkDirty(); renderWelcomeEditor(); });
  });
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "welcome-remove"; remove.textContent = "Remove element";
  remove.addEventListener("click", () => {
    if (!confirm(`Remove this ${element.type}?`)) return;
    welcomeScreenState.elements = welcomeScreenState.elements.filter(item => item.id !== element.id);
    Object.values(welcomeScreenState.layouts).forEach(layout => delete layout[element.id]);
    welcomeSelectedId = ""; welcomeMarkDirty(); renderWelcomeEditor();
  });
  host.append(remove);
}
function renderWelcomeEditor() {
  const stage = document.querySelector("#welcomeEditorStage");
  if (!stage) return;
  const globalDevice = document.querySelector("#usersDevicePreviewSelect")?.value || "desktop-16-9";
  welcomeActiveDevice = globalDevice.includes("phone") ? "phone" : globalDevice.includes("tablet") ? "tablet" : "desktop";
  const status = document.querySelector("#welcomePublicStatus");
  if (status) status.value = welcomeScreenState.publicStatus;
  const backgroundColor = document.querySelector("#welcomeBackgroundColor");
  const backgroundPattern = document.querySelector("#welcomeBackgroundPattern");
  const backgroundMaterial = document.querySelector("#welcomeBackgroundMaterial");
  if (backgroundColor) backgroundColor.value = welcomeScreenState.background.color;
  if (backgroundPattern) backgroundPattern.value = welcomeScreenState.background.pattern;
  if (backgroundMaterial) backgroundMaterial.value = welcomeScreenState.background.material;
  const loadingTitle = document.querySelector("#loadingScreenTitle");
  const loadingMessage = document.querySelector("#loadingScreenMessage");
  if (loadingTitle) loadingTitle.value = welcomeScreenState.loadingScreen.title;
  if (loadingMessage) loadingMessage.value = welcomeScreenState.loadingScreen.message;
  ensureWelcomeLayouts();
  stage.dataset.device = welcomeActiveDevice;
  stage.dataset.pattern = welcomeScreenState.background.pattern;
  stage.dataset.material = welcomeScreenState.background.material;
  stage.style.setProperty("--welcome-background", welcomeScreenState.background.color);
  stage.style.setProperty("--welcome-background-image", welcomeScreenState.background.imageUrl ? `url(${JSON.stringify(welcomeScreenState.background.imageUrl)})` : "none");
  stage.style.backgroundImage = welcomeScreenState.background.imageUrl ? `url(${JSON.stringify(welcomeScreenState.background.imageUrl)})` : "";
  stage.replaceChildren(...welcomeScreenState.elements.map(element => {
    const geometry = welcomeScreenState.layouts[welcomeActiveDevice][element.id];
    const item = document.createElement("article");
    item.className = `welcome-editor-item welcome-editor-${element.type}${element.id === welcomeSelectedId ? " is-selected" : ""}`;
    item.dataset.welcomeId = element.id;
    item.style.cssText = `left:${geometry.x}%;top:${geometry.y}%;width:${geometry.w}%;height:${geometry.h}%;transform:rotate(${geometry.rotation || 0}deg);`;
    item.style.borderRadius = `${Number(element.radius) || 0}px`;
    item.append(welcomeElementPreview(element));
    const handle = document.createElement("i"); handle.className = "welcome-resize-handle"; handle.title = "Drag to resize"; item.append(handle);
    const rotate = document.createElement("i"); rotate.className = "welcome-rotate-handle"; rotate.title = "Drag to rotate"; item.append(rotate);
    item.addEventListener("pointerdown", event => welcomeStartGeometryDrag(event, element.id, event.target === handle ? "resize" : event.target === rotate ? "rotate" : "move"));
    item.addEventListener("contextmenu", event => {
      if (!["image", "video", "slideshow", "section"].includes(element.type)) return;
      event.preventDefault(); welcomeChooseMedia(element.id);
    });
    return item;
  }));
  renderWelcomeInspector();
  renderWelcomeFullCanvas();
  renderSplashMediaPreview();
}

function renderSplashMediaPreview() {
  const host = document.querySelector("#splashMediaPreview");
  if (!host) return;
  const selectedSection = splashPreviewTarget === "maintenance" ? splashMaintenanceSection : splashWelcomeSection;
  const visible = activePanelTabId?.() === "users" && selectedSection && !selectedSection.classList.contains("is-collapsed");
  host.hidden = !visible;
  const mediaPreview = document.querySelector("#mediaStylePreview");
  if (mediaPreview) mediaPreview.hidden = visible;
  if (!visible) return;
  host.dataset.device = document.querySelector("#usersDevicePreviewSelect")?.selectedOptions?.[0]?.textContent || "Device";
  host.style.setProperty("--welcome-background", welcomeScreenState.background.color);
  host.style.setProperty("--welcome-background-image", welcomeScreenState.background.imageUrl ? `url(${JSON.stringify(welcomeScreenState.background.imageUrl)})` : "none");
  host.dataset.pattern = welcomeScreenState.background.pattern;
  host.dataset.material = welcomeScreenState.background.material;
  const device = document.createElement("div");
  device.className = "splash-media-device";
  const dimensions = document.createElement("span");
  dimensions.className = "splash-media-dimensions";
  dimensions.textContent = host.dataset.device;
  device.append(dimensions);
  // The maintenance and welcome surfaces share the same composition system.
  // Until the loading screen gains its own saved element collection, it uses
  // the welcome composition with its own title/message substituted in place.
  const loading = splashPreviewTarget === "welcome" ? welcomeScreenState.loadingScreen : null;
  const elements = loading
    ? welcomeScreenState.elements.map(element => element.id === "welcome-heading" ? { ...element, content: loading.title } : element.id === "welcome-copy" ? { ...element, content: loading.message } : element)
    : welcomeScreenState.elements;
  elements.forEach(element => {
    const geometry = welcomeScreenState.layouts[welcomeActiveDevice]?.[element.id];
    if (!geometry) return;
    const item = document.createElement("article");
    item.className = `welcome-editor-item welcome-editor-${element.type}${element.id === welcomeSelectedId ? " is-selected" : ""}`;
    item.style.cssText = `left:${geometry.x}%;top:${geometry.y}%;width:${geometry.w}%;height:${geometry.h}%;transform:rotate(${geometry.rotation || 0}deg);`;
    item.style.borderRadius = `${Number(element.radius) || 0}px`;
    item.append(welcomeElementPreview(element));
    const resize = document.createElement("i"); resize.className = "welcome-resize-handle"; item.append(resize);
    const rotate = document.createElement("i"); rotate.className = "welcome-rotate-handle"; item.append(rotate);
    item.addEventListener("pointerdown", event => welcomeStartGeometryDrag(event, element.id, event.target === resize ? "resize" : event.target === rotate ? "rotate" : "move", device));
    item.addEventListener("contextmenu", event => { if (["image", "video", "slideshow", "section"].includes(element.type)) { event.preventDefault(); welcomeChooseMedia(element.id); } });
    device.append(item);
  });
  host.replaceChildren(device);
}

function bindSplashEditorSections() {
  // These are public-site editors, not media-style controls. Keep them in
  // the UI tab; they only share the media preview surface while being edited.
  const maintenance = document.querySelector(".welcome-editor-section");
  const welcome = document.querySelector(".loading-screen-section");
  splashMaintenanceSection = maintenance;
  splashWelcomeSection = welcome;
  if (!maintenance || !welcome) return;
  const selectPreview = (target) => {
    splashPreviewTarget = target;
    // Collapse buttons toggle after their click handler; wait one turn so the
    // preview observes the newly open/closed state.
    window.setTimeout(renderSplashMediaPreview, 0);
  };
  maintenance?.addEventListener("focusin", () => selectPreview("maintenance"));
  maintenance?.addEventListener("click", () => selectPreview("maintenance"));
  welcome?.addEventListener("focusin", () => selectPreview("welcome"));
  welcome?.addEventListener("click", () => selectPreview("welcome"));
}

function welcomePreviewItems(host) {
  return welcomeScreenState.elements.map(element => {
    const geometry = welcomeScreenState.layouts[welcomeActiveDevice][element.id];
    const item = document.createElement("article");
    item.className = `welcome-editor-item welcome-editor-${element.type}${element.id === welcomeSelectedId ? " is-selected" : ""}`;
    item.dataset.welcomeId = element.id;
    item.style.cssText = `left:${geometry.x}%;top:${geometry.y}%;width:${geometry.w}%;height:${geometry.h}%;transform:rotate(${geometry.rotation || 0}deg);`;
    item.style.borderRadius = `${Number(element.radius) || 0}px`;
    item.append(welcomeElementPreview(element));
    const handle = document.createElement("i"); handle.className = "welcome-resize-handle"; item.append(handle);
    const rotate = document.createElement("i"); rotate.className = "welcome-rotate-handle"; item.append(rotate);
    item.addEventListener("pointerdown", event => welcomeStartGeometryDrag(event, element.id, event.target === handle ? "resize" : event.target === rotate ? "rotate" : "move", host));
    item.addEventListener("contextmenu", event => { if (["image", "video", "slideshow", "section"].includes(element.type)) { event.preventDefault(); welcomeChooseMedia(element.id); } });
    return item;
  });
}

function renderWelcomeFullCanvas() {
  const canvas = document.querySelector("#welcomeFullCanvas");
  if (!canvas) return;
  document.body.classList.toggle("welcome-page-edit-mode", welcomeFullCanvasOpen);
  canvas.hidden = !welcomeFullCanvasOpen;
  if (!welcomeFullCanvasOpen) return;
  canvas.dataset.device = welcomeActiveDevice;
  canvas.dataset.pattern = welcomeScreenState.background.pattern;
  canvas.dataset.material = welcomeScreenState.background.material;
  canvas.style.setProperty("--welcome-background", welcomeScreenState.background.color);
  canvas.style.setProperty("--welcome-background-image", welcomeScreenState.background.imageUrl ? `url(${JSON.stringify(welcomeScreenState.background.imageUrl)})` : "none");
  canvas.style.backgroundImage = welcomeScreenState.background.imageUrl ? `url(${JSON.stringify(welcomeScreenState.background.imageUrl)})` : "";
  canvas.replaceChildren();
  if (welcomeFullCanvasMode === "loading") {
    const loading = welcomeScreenState.loadingScreen || {};
    const card = document.createElement("div"); card.className = "welcome-loading-canvas-card embedded-panel";
    card.innerHTML = `<strong>${loading.title}</strong><p>${loading.message}</p><span>Loading roads and map features…</span>`;
    canvas.append(card);
  } else {
    canvas.append(...welcomePreviewItems(canvas));
  }
  const actions = document.createElement("div"); actions.className = "welcome-canvas-actions";
  ["section", "heading", "text", "image", "video"].forEach(type => {
    const add = document.createElement("button"); add.type = "button"; add.textContent = `Add ${type}`; add.addEventListener("click", () => welcomeAddElement(type)); actions.append(add);
  });
  const publish = document.createElement("button"); publish.type = "button"; publish.textContent = "Publish to site"; publish.addEventListener("click", () => document.querySelector("#publishSite")?.click()); actions.append(publish);
  const done = document.createElement("button"); done.type = "button"; done.textContent = "Edits done"; done.addEventListener("click", () => { welcomeFullCanvasOpen = false; renderWelcomeFullCanvas(); }); actions.append(done);
  canvas.append(actions);
  const close = document.createElement("button"); close.type = "button"; close.className = "welcome-canvas-close"; close.textContent = "Close editor";
  close.addEventListener("click", () => { welcomeFullCanvasOpen = false; renderWelcomeFullCanvas(); });
  canvas.append(close);
}
function welcomeStartGeometryDrag(event, id, operation, stageOverride = null) {
  if (event.button !== 0) return;
  const stage = stageOverride || document.querySelector("#welcomeEditorStage");
  const original = { ...welcomeScreenState.layouts[welcomeActiveDevice][id] };
  const rect = stage.getBoundingClientRect();
  const start = { x: event.clientX, y: event.clientY, shift: event.shiftKey, ctrl: event.ctrlKey };
  welcomeSelectedId = id; event.preventDefault();
  const move = moveEvent => {
    let dx = (moveEvent.clientX - start.x) / rect.width * 100;
    let dy = (moveEvent.clientY - start.y) / rect.height * 100;
    if (operation === "rotate") {
      const centerX = rect.left + ((original.x + original.w / 2) / 100) * rect.width;
      const centerY = rect.top + ((original.y + original.h / 2) / 100) * rect.height;
      let rotation = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI + 90;
      if (moveEvent.shiftKey || start.shift) rotation = Math.round(rotation / 15) * 15;
      welcomeScreenState.layouts[welcomeActiveDevice][id] = welcomeClampGeometry({ ...original, rotation }); renderWelcomeEditor(); return;
    }
    if ((moveEvent.shiftKey || start.shift) && operation === "move") {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
    }
    const centeredResize = operation === "resize" && (moveEvent.ctrlKey || start.ctrl);
    if (operation === "resize" && (moveEvent.shiftKey || start.shift)) {
      // Shift keeps the starting rectangle's proportion while the user sizes.
      const ratio = original.w / Math.max(original.h, 0.001);
      if (Math.abs(dx) >= Math.abs(dy)) dy = dx / ratio;
      else dx = dy * ratio;
    }
    const next = operation === "resize"
      ? { ...original, x: centeredResize ? original.x - dx / 2 : original.x, y: centeredResize ? original.y - dy / 2 : original.y, w: original.w + dx, h: original.h + dy }
      : { ...original, x: original.x + dx, y: original.y + dy };
    const element = welcomeElementById(id);
    if (operation === "move" && (element?.type === "section" || element?.type === "content-frame")) {
      const parent = element.type === "content-frame" && welcomeElementById(element.parentId);
      const parentGeometry = parent && welcomeScreenState.layouts[welcomeActiveDevice]?.[parent.id];
      const center = parentGeometry ? parentGeometry.x + parentGeometry.w / 2 : 50;
      if (Math.abs(next.x + next.w / 2 - center) < 4) next.x = center - next.w / 2;
    }
    welcomeScreenState.layouts[welcomeActiveDevice][id] = welcomeClampGeometry(next); renderWelcomeEditor();
  };
  const end = () => { window.removeEventListener("pointermove", move); welcomeMarkDirty(); };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
}
function welcomeChooseMedia(id) {
  welcomePendingMediaId = id;
  document.querySelector("#welcomeMediaFile")?.click();
}
function welcomeAddElement(type) {
  const element = { id: welcomeId(), type, content: type === "heading" ? "New heading" : type === "button" ? "Coming soon" : type === "section" ? "New section" : "New text", radius: type === "section" ? 18 : 0 };
  if (type === "slideshow") element.slides = [];
  if (["image", "video", "section"].includes(type)) element.url = "";
  welcomeScreenState.elements.push(element); welcomeNewElementIds.add(element.id); ensureWelcomeLayouts(); welcomeSelectedId = element.id; welcomeMarkDirty(); renderWelcomeEditor();
  if (["image", "video", "slideshow", "section"].includes(type)) welcomeChooseMedia(element.id);
}
function welcomeDrawSection(event) {
  if (!welcomeDrawMode || event.button !== 0 || event.target.closest(".welcome-editor-item")) return;
  const stage = event.currentTarget;
  const rect = stage.getBoundingClientRect();
  const start = { x: event.clientX, y: event.clientY };
  const draft = document.createElement("i"); draft.className = "welcome-draw-draft"; stage.append(draft);
  const draw = moveEvent => {
    const x1 = (start.x - rect.left) / rect.width * 100, y1 = (start.y - rect.top) / rect.height * 100;
    const x2 = (moveEvent.clientX - rect.left) / rect.width * 100, y2 = (moveEvent.clientY - rect.top) / rect.height * 100;
    draft.style.cssText = `left:${Math.min(x1, x2)}%;top:${Math.min(y1, y2)}%;width:${Math.abs(x2 - x1)}%;height:${Math.abs(y2 - y1)}%;`;
  };
  const end = moveEvent => {
    window.removeEventListener("pointermove", draw); draft.remove();
    const x1 = (start.x - rect.left) / rect.width * 100, y1 = (start.y - rect.top) / rect.height * 100;
    const x2 = (moveEvent.clientX - rect.left) / rect.width * 100, y2 = (moveEvent.clientY - rect.top) / rect.height * 100;
    const width = Math.abs(x2 - x1), height = Math.abs(y2 - y1);
    if (width < 2 && height < 2) return;
    const divider = width < 4 || height < 4;
    const parent = welcomeParentSectionForPoint((x1 + x2) / 2, (y1 + y2) / 2);
    const element = parent && !divider
      ? { id: welcomeId(), type: "content-frame", mediaType: "text", content: "Type text", parentId: parent.id, radius: 0 }
      : { id: welcomeId(), type: divider ? "text" : "section", content: divider ? "" : "Section", radius: divider ? 0 : 18, divider };
    welcomeScreenState.elements.push(element); ensureWelcomeLayouts();
    const parentGeometry = parent && welcomeScreenState.layouts[welcomeActiveDevice][parent.id];
    const frameWidth = Math.max(width, divider ? 1 : 8), frameHeight = Math.max(height, divider ? 1 : 6);
    welcomeScreenState.layouts[welcomeActiveDevice][element.id] = welcomeClampGeometry(parentGeometry && element.type === "content-frame"
      ? { x: parentGeometry.x + (parentGeometry.w - frameWidth) / 2, y: parentGeometry.y + (parentGeometry.h - frameHeight) / 2, w: frameWidth, h: frameHeight }
      : { x: Math.min(x1, x2), y: Math.min(y1, y2), w: frameWidth, h: frameHeight });
    welcomeSelectedId = element.id; welcomeMarkDirty(); renderWelcomeEditor();
  };
  window.addEventListener("pointermove", draw); window.addEventListener("pointerup", end, { once: true });
}
function welcomeFitNewItems() {
  const layout = welcomeScreenState.layouts[welcomeActiveDevice];
  const candidates = welcomeScreenState.elements.filter(element => welcomeNewElementIds.has(element.id));
  candidates.forEach((element, index) => {
    // This is intentionally limited to newly added items: existing, edited
    // coordinates are never reflowed by a device switch or a fit action.
    layout[element.id] = welcomeClampGeometry({ x: 8 + (index % 2) * 46, y: 8 + Math.floor(index / 2) * 22, w: 40, h: 17 });
  });
  if (!candidates.length && typeof els !== "undefined" && els.status) els.status.textContent = "No newly added welcome items need fitting on this device.";
  welcomeMarkDirty(); renderWelcomeEditor();
}
function initializeWelcomeScreenEditor() {
  bindSplashEditorSections();
  // Keep the real save/publish controls together with the theme controls
  // rather than mirroring stale status text in a second panel.
  const exportPanel = document.querySelector("#projectExportStatus");
  const footerHost = document.querySelector("#footerProjectStatusHost");
  if (exportPanel && footerHost) footerHost.append(exportPanel);
  // Splash editing stays in the UI tab; the earlier floating edit mode is
  // retired so nothing is injected inside the device.
  welcomeFullCanvasOpen = false;
  document.body.classList.remove("welcome-page-edit-mode");
  document.querySelector("#usersDevicePreviewSelect")?.addEventListener("change", () => window.setTimeout(renderWelcomeEditor, 0));
  document.querySelector("#welcomeDrawSplash")?.addEventListener("click", event => {
    welcomeDrawMode = !welcomeDrawMode;
    event.currentTarget.setAttribute("aria-pressed", String(welcomeDrawMode));
    event.currentTarget.textContent = welcomeDrawMode ? "Drawing splash…" : "Draw splashy splash";
    document.querySelector("#welcomeEditorStage")?.classList.toggle("is-drawing", welcomeDrawMode);
  });
  document.querySelector("#welcomeEditorStage")?.addEventListener("pointerdown", welcomeDrawSection);
  document.querySelector("#welcomePublicStatus")?.addEventListener("change", event => { welcomeScreenState.publicStatus = event.target.value; applyMaintenanceSiteMode(); welcomeMarkDirty(); renderWelcomeEditor(); });
  [["#welcomeBackgroundColor", "color"], ["#welcomeBackgroundPattern", "pattern"], ["#welcomeBackgroundMaterial", "material"]].forEach(([selector, key]) => {
    document.querySelector(selector)?.addEventListener("input", event => { welcomeScreenState.background[key] = event.target.value; welcomeMarkDirty(); renderWelcomeEditor(); });
    document.querySelector(selector)?.addEventListener("change", event => { welcomeScreenState.background[key] = event.target.value; welcomeMarkDirty(); renderWelcomeEditor(); });
  });
  document.querySelector("#welcomeOpenCanvas")?.remove();
  document.querySelector("#loadingScreenOpenCanvas")?.remove();
  [["#loadingScreenTitle", "title"], ["#loadingScreenMessage", "message"]].forEach(([selector, key]) => {
    document.querySelector(selector)?.addEventListener("change", event => { welcomeScreenState.loadingScreen[key] = event.target.value; welcomeMarkDirty(); renderWelcomeFullCanvas(); });
  });
  document.querySelector("#welcomeFitLayout")?.addEventListener("click", welcomeFitNewItems);
  document.querySelector("#welcomeResetLayout")?.addEventListener("click", () => {
    if (!confirm(`Reset the ${welcomeActiveDevice} welcome layout? Other device layouts are preserved.`)) return;
    welcomeScreenState.layouts[welcomeActiveDevice] = {}; ensureWelcomeLayouts(); welcomeMarkDirty(); renderWelcomeEditor();
  });
  document.querySelector("#welcomeImportLayout")?.addEventListener("click", () => {
    const from = document.querySelector("#welcomeImportDevice")?.value;
    const sourceKey = welcomeDeviceLayoutKey(from);
    if (!WELCOME_DEVICES.includes(sourceKey) || !confirm(`Replace the ${welcomeActiveDevice} layout with ${from}?`)) return;
    welcomeScreenState.layouts[welcomeActiveDevice] = welcomeClone(welcomeScreenState.layouts[sourceKey]); welcomeMarkDirty(); renderWelcomeEditor();
  });
  document.querySelector("#welcomeMediaFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0]; const element = welcomeElementById(welcomePendingMediaId); event.target.value = "";
    if (!file || !element) return;
    const reader = new FileReader();
    reader.onload = () => { if (element.type === "slideshow") element.slides = [...(element.slides || []), reader.result]; else element.url = reader.result; welcomeMarkDirty(); renderWelcomeEditor(); };
    reader.readAsDataURL(file);
  });
  document.querySelector("#welcomeBackgroundImage")?.addEventListener("click", () => document.querySelector("#welcomeBackgroundFile")?.click());
  document.querySelector("#welcomeClearBackgroundImage")?.addEventListener("click", () => { welcomeScreenState.background.imageUrl = ""; welcomeMarkDirty(); renderWelcomeEditor(); });
  document.querySelector("#welcomeBackgroundFile")?.addEventListener("change", event => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { welcomeScreenState.background.imageUrl = reader.result; welcomeMarkDirty(); renderWelcomeEditor(); };
    reader.readAsDataURL(file);
  });
  renderWelcomeEditor();
}

document.addEventListener("DOMContentLoaded", initializeWelcomeScreenEditor);
