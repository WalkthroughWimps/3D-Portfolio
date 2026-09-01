"use strict";

// Media placeholders, viewer presentation, and map marker rendering.

function selectedMediaPresentationStyle({ resolved = false } = {}) {
  if (mediaStyleEditingDefault) return mediaPresentationState.defaultStyle;
  const type = els.mediaStyleType?.value || "youtube";
  const style = mediaPresentationState.types[type] || mediaPresentationState.types.youtube;
  return resolved && style.useDefault ? mediaPresentationState.defaultStyle : style;
}

function mediaPresentationStyleForKind(kind) {
  const type = kind === "blog" ? "text" : MEDIA_STYLE_TYPES.includes(kind) ? kind : "video";
  const style = mediaPresentationState.types[type];
  return style?.useDefault ? mediaPresentationState.defaultStyle : style;
}

function setMediaStyleVariables(target, style) {
  if (!target || !style) return;
  target.style.setProperty("--media-style-background", style.background);
  target.style.setProperty("--media-style-border", style.border);
  target.style.setProperty("--media-style-text", style.text);
  target.style.setProperty("--media-style-radius", `${style.radius}px`);
  target.style.setProperty("--media-style-border-width", `${style.borderWidth}px`);
  target.style.setProperty("--media-style-padding", `${style.padding}px`);
  target.style.setProperty("--media-style-shadow", String(style.shadow));
  target.style.setProperty("--media-style-fit", style.fit);
}

// The normal editor keeps #userMapViewport as a display-contents wrapper, so
// it has no useful rendered rectangle there.  Its editor guide, however,
// draws the exact camera rectangle that the visitor sees.  Keep media tied to
// that rectangle—not the map zone or the surrounding device.
function mediaPresentationViewportRect() {
  const rendered = rect => rect && rect.width >= 20 && rect.height >= 20 ? rect : null;
  // In Map, Themes, and Trips the inner guide is the real camera boundary.
  // It already includes the editor's uniform device scale and translation.
  const guideViewport = rendered(els.editorPreviewGuideViewport?.getBoundingClientRect?.());
  if (guideViewport) return guideViewport;

  const stage = els.mapCanvas?.closest(".map-stage")?.getBoundingClientRect?.();
  // Bounds may be hidden while the Media tab is active.  Recreate the same
  // guide rectangle from its saved drawing geometry in that case, rather than
  // falling back to the much larger map-stage coordinate system.
  const guide = els.editorPreviewGuide;
  const guideGeometry = typeof userEditorGuideGeometry !== "undefined" ? userEditorGuideGeometry : null;
  if (stage && guide && guideGeometry?.source?.viewport && guideGeometry.width >= 20 && guideGeometry.height >= 20) {
    const scale = Math.max(.01, Number(typeof userEditorGuideTransform !== "undefined" ? userEditorGuideTransform?.scale : 1) || 1);
    const translateX = Number(typeof userEditorGuideTransform !== "undefined" ? userEditorGuideTransform?.x : 0) || 0;
    const translateY = Number(typeof userEditorGuideTransform !== "undefined" ? userEditorGuideTransform?.y : 0) || 0;
    const width = guideGeometry.width;
    const height = guideGeometry.height;
    const baseLeft = Number.parseFloat(guide.style.left) || 0;
    const baseTop = Number.parseFloat(guide.style.top) || 0;
    const viewport = guideGeometry.source.viewport;
    const left = stage.left + baseLeft + translateX + ((1 - scale) * width / 2) + (Number(viewport.x) || 0) * width * scale;
    const top = stage.top + baseTop + translateY + ((1 - scale) * height / 2) + (Number(viewport.y) || 0) * height * scale;
    const viewportWidth = Math.max(1, (Number(viewport.width) || 0) * width * scale);
    const viewportHeight = Math.max(1, (Number(viewport.height) || 0) * height * scale);
    if (viewportWidth >= 20 && viewportHeight >= 20) return {
      left, top, width: viewportWidth, height: viewportHeight,
      right: left + viewportWidth, bottom: top + viewportHeight
    };
  }

  // The public/UI builders render a real map viewport, so it is authoritative
  // there and avoids relying on editor-only guide state.
  const publicViewport = rendered(els.userMapViewport?.getBoundingClientRect?.());
  if (publicViewport) return publicViewport;

  // Last-resort compatibility for old editor sessions before a guide has been
  // initialized.  This keeps a media window usable, but is intentionally not
  // the normal path because these raw stage metrics describe a different box.
  const metrics = typeof userPreviewCompositionMetrics === "function"
    ? userPreviewCompositionMetrics()
    : null;
  if (stage && metrics?.viewportWidth >= 20 && metrics?.viewportHeight >= 20) return {
    left: stage.left + metrics.viewportLeft,
    top: stage.top + metrics.viewportTop,
    right: stage.left + metrics.viewportRight,
    bottom: stage.top + metrics.viewportBottom,
    width: metrics.viewportWidth,
    height: metrics.viewportHeight
  };
  return els.mapCanvas?.getBoundingClientRect?.() || null;
}

function applyMediaMapTreatment(active) {
  const stage = els.mapCanvas?.closest(".map-stage");
  if (!stage) return;
  const treatment = mediaPresentationState.map;
  stage.classList.toggle("media-map-treatment-active", Boolean(active));
  stage.dataset.mediaMapVisibility = treatment.visibility;
  stage.style.setProperty("--media-map-opacity", String(treatment.visibility === "hidden" ? 0 : treatment.visibility === "visible" ? 1 : treatment.opacity));
  stage.style.setProperty("--media-map-blur", `${treatment.blur}px`);
  stage.style.setProperty("--media-map-blend", treatment.blend);
}

function clearRetiredMediaTabCameraOverride() {
  const stage = els.mapCanvas?.closest(".map-stage");
  const mapViewport = els.userMapViewport;
  if (!stage?.classList.contains("media-tab-camera") || !mapViewport) return;
  stage.classList.remove("media-tab-camera");
  ["left", "top", "right", "bottom", "width", "height"].forEach(property => mapViewport.style.removeProperty(property));
  requestAnimationFrame(() => map?.invalidateSize?.({ pan: false }));
}

function applyMediaPresentationToViewer(kind, layoutInstance = null) {
  const style = mediaPresentationStyleForKind(kind);
  setMediaStyleVariables(els.mediaViewer, style);
  els.mediaViewer.dataset.fullscreenTarget = style.fullscreenTarget;
  if (els.mediaViewerFullscreen) els.mediaViewerFullscreen.hidden = !style.fullscreen;
  const viewport = mediaPresentationViewportRect();
  const stage = els.mapCanvas?.closest(".map-stage")?.getBoundingClientRect();
  const instance = layoutInstance && typeof layoutInstance === "object" ? layoutInstance : null;
  // Media-tab type settings are the shared preset.  An event instance can
  // override only geometry, leaving its look linked to the preset.
  const geometry = { ...style, ...(instance || {}) };
  els.mediaViewer.classList.toggle("has-layout-instance", Boolean(instance));
  if (viewport && stage && viewport.width && viewport.height) {
    const x = Math.max(0, Math.min(1, Number(geometry.x) || 0));
    const y = Math.max(0, Math.min(1, Number(geometry.y) || 0));
    const width = Math.max(.12, Math.min(1 - x, Number(geometry.width) || .76));
    const height = Math.max(.12, Math.min(1 - y, Number(geometry.height) || .68));
    els.mediaViewer.style.left = `${viewport.left - stage.left + x * viewport.width}px`;
    els.mediaViewer.style.top = `${viewport.top - stage.top + y * viewport.height}px`;
    els.mediaViewer.style.width = `${width * viewport.width}px`;
    els.mediaViewer.style.height = `${height * viewport.height}px`;
  } else {
    els.mediaViewer.style.removeProperty("left");
    els.mediaViewer.style.removeProperty("top");
    els.mediaViewer.style.removeProperty("width");
    els.mediaViewer.style.removeProperty("height");
  }
  applyMediaMapTreatment(true);
}

function createMediaPlaceholderContent(type) {
  const content = document.createElement("div");
  content.className = `media-style-placeholder-content media-style-placeholder-${type}`;
  if (type === "youtube" || type === "video") {
    const play = document.createElement("span");
    play.className = "media-placeholder-play";
    play.textContent = "▶";
    const label = document.createElement("strong");
    label.textContent = type === "youtube" ? "YouTube video" : "Video";
    content.append(play, label);
  } else if (type === "image") {
    content.innerHTML = "<span aria-hidden='true'>▧</span><strong>Picture</strong>";
  } else if (type === "audio") {
    content.innerHTML = "<strong>Audio</strong><span class='media-placeholder-wave' aria-hidden='true'>▂▅▃▇▆▂▅▃▆</span>";
  } else {
    content.innerHTML = "<strong>Text entry</strong><p>A trip note, caption, or journal entry can be styled here.</p>";
  }
  return content;
}

function createMediaLayoutPreviewContent(layout) {
  const content = document.createElement("div");
  content.className = `media-combo-preview media-combo-${layout?.template || "split"}`;
  content.classList.toggle("has-containing-frame", layout?.frame !== false);
  content.style.setProperty("--media-combo-gap", `${layout?.gap || 0}px`);
  content.style.setProperty("--media-combo-padding", `${layout?.framePadding || 0}px`);
  content.style.setProperty("--media-combo-radius", `${layout?.frameRadius || 0}px`);
  content.style.gridTemplateColumns = `repeat(${Math.max(1, Number(layout?.columns) || 1)}, minmax(0, 1fr))`;
  const slot = (kind, text = "") => {
    const node = document.createElement("span");
    node.className = `media-combo-slot media-combo-slot-${kind}`;
    node.innerHTML = kind === "image" ? "<i></i>" : kind === "video" ? "<b>▶</b>" : kind === "audio" ? "<b>♫</b><i>▂▅▃▇▆</i>" : `<i>${text || "Trip notes"}</i><i></i><i></i>`;
    return node;
  };
  const slots = typeof normalizeMediaLayoutSlots === "function"
    ? normalizeMediaLayoutSlots(layout?.slots, layout?.template)
    : [{ kind: "image", label: "Picture" }, { kind: "text", label: "Story" }];
  slots.forEach(item => content.append(slot(item.kind, item.label)));
  return content;
}

function renderMediaStylePlaceholder() {
  if (!els.mediaStylePreview) return;
  const visible = activePanelTabId() === "media";
  els.mediaStylePreview.hidden = !visible;
  els.mediaStylePreview.replaceChildren();
  applyMediaMapTreatment(visible || !els.mediaViewer?.hidden);
  clearRetiredMediaTabCameraOverride();
  if (!visible) return;
  const style = mediaLayoutPreviewMode ? mediaPresentationState.defaultStyle : selectedMediaPresentationStyle({ resolved: true });
  const type = mediaLayoutPreviewMode ? "layout" : mediaStyleEditingDefault ? "default" : (els.mediaStyleType?.value || "youtube");
  const viewportRect = mediaPresentationViewportRect();
  const stageRect = els.mapCanvas?.closest(".map-stage")?.getBoundingClientRect();
  if (!viewportRect || !stageRect || !viewportRect.width || !viewportRect.height) return;
  const box = document.createElement("div");
  box.className = "media-style-placeholder";
  box.dataset.mediaPlaceholder = type;
  box.style.left = `${viewportRect.left - stageRect.left + style.x * viewportRect.width}px`;
  box.style.top = `${viewportRect.top - stageRect.top + style.y * viewportRect.height}px`;
  box.style.width = `${Math.min(style.width, 1 - style.x) * viewportRect.width}px`;
  box.style.height = `${Math.min(style.height, 1 - style.y) * viewportRect.height}px`;
  setMediaStyleVariables(box, style);
  const badge = document.createElement("span");
  badge.className = "media-style-placeholder-badge";
  const selectedLayout = mediaPresentationState.layouts.find(layout => layout.id === mediaPresentationState.selectedLayout);
  badge.textContent = mediaLayoutPreviewMode ? "Layout preview" : mediaStyleEditingDefault ? "Default style" : mediaTypeLabel({ kind: type === "text" ? "blog" : type });
  box.append(badge, mediaLayoutPreviewMode ? createMediaLayoutPreviewContent(selectedLayout) : createMediaPlaceholderContent(type === "default" ? "text" : type));
  ["n", "ne", "e", "se", "s", "sw", "w", "nw"].forEach(handle => {
    const grip = document.createElement("span");
    grip.className = `media-style-handle media-style-handle-${handle}`;
    grip.dataset.mediaStyleHandle = handle;
    box.append(grip);
  });
  els.mediaStylePreview.append(box);
  box.addEventListener("pointerdown", startMediaPlaceholderTransform);
}



function formatMediaTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function updateMediaViewerControls() {
  const media = activeViewerMediaElement;
  if (!media) return;
  const duration = Number.isFinite(media.duration) ? media.duration : 0;
  els.mediaPlayhead.max = String(duration || 100);
  els.mediaPlayhead.value = String(duration ? media.currentTime : 0);
  els.mediaTime.textContent = `${formatMediaTime(media.currentTime)} / ${formatMediaTime(duration)}`;
  els.mediaPlayPause.querySelector(".material-symbols-rounded").textContent = media.paused ? "play_arrow" : "pause";
  els.mediaPlayPause.setAttribute("aria-label", media.paused ? "Play" : "Pause");
  els.mediaMute.querySelector(".material-symbols-rounded").textContent = media.muted || media.volume === 0 ? "volume_off" : "volume_up";
  els.mediaMute.setAttribute("aria-label", media.muted ? "Unmute" : "Mute");
  els.mediaVolume.value = String(media.muted ? 0 : media.volume);
}

let presetSlotDialogContext = null;
let selectedMediaPresetFrame = null;
const STICKY_NOTE_DAD_JOKES = Object.freeze([
  "Why did the scarecrow win an award? Because he was outstanding in his field.",
  "I only know 25 letters of the alphabet. I don't know y.",
  "What do you call cheese that isn't yours? Nacho cheese.",
  "I used to hate facial hair, but then it grew on me.",
  "Why don't eggs tell jokes? They'd crack each other up.",
  "I told my suitcase there would be no vacations this year. Now I'm dealing with emotional baggage."
]);

function stickyNotePrompt(item) {
  const key = String(item?.id || "note");
  const hash = [...key].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 0);
  return STICKY_NOTE_DAD_JOKES[hash % STICKY_NOTE_DAD_JOKES.length];
}

function mediaPresetFrameMatches(item, slots, slotId) {
  return selectedMediaPresetFrame?.item === item
    && selectedMediaPresetFrame?.slots === slots
    && selectedMediaPresetFrame?.slotId === slotId;
}

function refreshMediaPresetFrame(item, playbackOptions) {
  saveTrips?.();
  openJourneyMedia(item, playbackOptions);
}

function enableMediaPresetVisualDrag(visual, frame, selection) {
  visual.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    selectedMediaPresetFrame = selection;
    const { value, item, playbackOptions } = selection;
    const startX = event.clientX; const startY = event.clientY;
    const startOffsetX = Number(value.offsetX) || 0; const startOffsetY = Number(value.offsetY) || 0;
    const bounds = frame.getBoundingClientRect();
    const move = next => {
      value.offsetX = Math.max(-1, Math.min(1, startOffsetX + ((next.clientX - startX) / Math.max(1, bounds.width)) * 2));
      value.offsetY = Math.max(-1, Math.min(1, startOffsetY + ((next.clientY - startY) / Math.max(1, bounds.height)) * 2));
      visual.style.transform = `translate(${value.offsetX * 50}%, ${value.offsetY * 50}%) scale(${Number(value.scale) || 1})`;
    };
    const done = () => { window.removeEventListener("pointermove", move); refreshMediaPresetFrame(item, playbackOptions); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", done, { once: true });
  });
}

function createMediaPresetFrameInspector(item, playbackOptions) {
  const selected = selectedMediaPresetFrame;
  if (!selected || selected.item !== item || !selected.value) return null;
  const { value } = selected;
  const mediaKind = selected.kind || value.kind;
  const inspector = document.createElement("aside");
  inspector.className = "media-preset-frame-inspector";
  const heading = document.createElement("strong");
  heading.textContent = mediaKind === "text" ? "Text controls" : mediaKind === "video" ? "Video controls" : "Picture controls";
  inspector.append(heading);
  const commit = () => refreshMediaPresetFrame(item, playbackOptions);
  const range = (label, key, min, max, step, fallback) => {
    const control = document.createElement("label");
    const title = document.createElement("span"); title.textContent = label;
    const input = document.createElement("input");
    input.type = "range"; input.min = String(min); input.max = String(max); input.step = String(step);
    input.value = String(Number.isFinite(Number(value[key])) ? value[key] : fallback);
    const output = document.createElement("output"); output.textContent = `${Math.round(Number(input.value) * (max <= 3 ? 100 : 1))}${max <= 3 ? "%" : ""}`;
    input.addEventListener("input", () => { value[key] = Number(input.value); output.textContent = `${Math.round(Number(input.value) * (max <= 3 ? 100 : 1))}${max <= 3 ? "%" : ""}`; commit(); });
    control.append(title, input, output); inspector.append(control);
  };
  const select = (label, key, values, fallback) => {
    const control = document.createElement("label"); const title = document.createElement("span"); title.textContent = label;
    const input = document.createElement("select");
    values.forEach(([id, text]) => { const option = document.createElement("option"); option.value = id; option.textContent = text; input.append(option); });
    input.value = value[key] || fallback;
    input.addEventListener("change", () => { value[key] = input.value; commit(); });
    control.append(title, input); inspector.append(control);
  };
  if (mediaKind === "text") {
    const color = document.createElement("label"); color.innerHTML = "<span>Font color</span>";
    const input = document.createElement("input"); input.type = "color"; input.value = value.color || "#f8fafc";
    input.addEventListener("input", () => { value.color = input.value; commit(); }); color.append(input); inspector.append(color);
    range("Font size", "fontSize", .6, 2.4, .05, 1);
  } else {
    select("Crop", "fit", [["contain", "Fit"], ["cover", "Crop to fill"], ["fill", "Stretch fill"]], "contain");
    range("Size", "scale", .25, 3, .05, 1);
    range("Horizontal", "offsetX", -1, 1, .02, 0);
    range("Vertical", "offsetY", -1, 1, .02, 0);
    if (mediaKind === "video") {
      range("Brightness", "brightness", .25, 2, .05, 1);
      range("Contrast", "contrast", .25, 2, .05, 1);
      range("Color", "saturate", 0, 2, .05, 1);
    }
    const replace = document.createElement("button"); replace.type = "button"; replace.textContent = "Replace media";
    replace.addEventListener("click", () => {
      presetSlotDialogContext = { item, slots: selected.slots, slotId: selected.slotId, playbackOptions };
      const dialog = mediaPresetSlotDialog(); if (!dialog.open) dialog.showModal();
    });
    inspector.append(replace);
  }
  return inspector;
}

function mediaPresetSlotDialog() {
  let dialog = document.querySelector("#mediaPresetSlotDialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "mediaPresetSlotDialog";
  dialog.className = "sticker-media-event-dialog";
  dialog.innerHTML = `<form method="dialog" class="sticker-media-event-card"><button class="sticker-media-dialog-close" value="cancel" aria-label="Close">×</button><strong>Add to frame</strong><div class="sticker-media-kind-grid"><button type="button" data-preset-slot-kind="image">Picture</button><button type="button" data-preset-slot-kind="text">Text</button><button type="button" data-preset-slot-kind="preset">Preset</button></div><div id="mediaPresetNestedPicker" class="sticker-media-preset-picker" hidden></div><input id="mediaPresetSlotFile" type="file" accept="image/*" hidden></form>`;
  document.body.append(dialog);
  const file = dialog.querySelector("#mediaPresetSlotFile");
  const commit = value => {
    const context = presetSlotDialogContext;
    if (!context) return;
    context.slots[context.slotId] = value;
    saveTrips?.();
    dialog.close();
    openJourneyMedia(context.item, context.playbackOptions);
  };
  dialog.addEventListener("click", event => {
    const kind = event.target.closest("[data-preset-slot-kind]")?.dataset.presetSlotKind;
    if (!kind) return;
    if (kind === "image") { file.click(); return; }
    if (kind === "text") { commit({ kind: "text", text: "Click to edit text" }); return; }
    const picker = dialog.querySelector("#mediaPresetNestedPicker");
    picker.hidden = false; picker.replaceChildren();
    (mediaPresentationState?.layouts || []).forEach(layout => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = layout.name;
      button.addEventListener("click", () => commit({ kind: "preset", layoutId: layout.id, slots: {} })); picker.append(button);
    });
  });
  file.addEventListener("change", event => {
    const selected = event.target.files?.[0];
    if (selected) commit({ kind: "image", name: selected.name, url: URL.createObjectURL(selected) });
    event.target.value = "";
  });
  return dialog;
}

function renderMediaPresetSlots({ item, layoutId, slots, playbackOptions, depth = 0 }) {
  const layout = (mediaPresentationState?.layouts || []).find(candidate => candidate.id === layoutId)
    || mediaPresentationState?.layouts?.[0]
    || { columns: 1, frame: true, slots: [{ kind: "text", label: "Content" }] };
  const container = document.createElement("div");
  container.className = "media-preset-instance";
  container.style.gridTemplateColumns = `repeat(${Math.max(1, Number(layout.columns) || 1)}, minmax(0, 1fr))`;
  container.style.setProperty("--media-combo-gap", `${layout.gap || 0}px`);
  const definitions = normalizeMediaLayoutSlots?.(layout.slots, layout.template) || layout.slots || [];
  definitions.forEach((definition, index) => {
    const slotId = `slot-${index + 1}`;
    const value = slots[slotId] || null;
    const frame = document.createElement("div"); frame.className = "media-preset-frame"; frame.dataset.slotId = slotId;
    frame.classList.toggle("is-selected", mediaPresetFrameMatches(item, slots, slotId));
    frame.style.gridColumn = `span ${Math.max(1, Math.min(Number(layout.columns) || 1, Number(value?.spanX) || 1))}`;
    frame.style.gridRow = `span ${Math.max(1, Math.min(6, Number(value?.spanY) || 1))}`;
    frame.draggable = Boolean(value);
    const save = next => { slots[slotId] = next; saveTrips?.(); };
    const openSlotChooser = () => {
      presetSlotDialogContext = { item, slots, slotId, playbackOptions };
      const dialog = mediaPresetSlotDialog(); if (!dialog.open) dialog.showModal();
    };
    if (value?.kind === "text" || (!value && definition.kind === "text")) {
      const field = document.createElement("textarea"); field.className = "media-preset-text"; field.value = value?.text || ""; field.placeholder = definition.label || "Write text";
      field.addEventListener("input", () => save({ kind: "text", text: field.value }));
      field.addEventListener("click", event => event.stopPropagation());
      if (value) {
        field.style.color = value.color || "#f8fafc";
        field.style.fontSize = `${Number(value.fontSize) || 1}em`;
      }
      frame.append(field);
    } else if (value?.kind === "image" && value.url) {
      const image = document.createElement("img"); image.src = value.url; image.alt = value.name || "Preset image";
      image.style.objectFit = value.fit || "contain";
      image.style.transform = `translate(${(Number(value.offsetX) || 0) * 50}%, ${(Number(value.offsetY) || 0) * 50}%) scale(${Number(value.scale) || 1})`;
      const selection = { item, slots, slotId, value, kind: "image", playbackOptions };
      image.addEventListener("click", event => { event.stopPropagation(); selectedMediaPresetFrame = selection; openJourneyMedia(item, playbackOptions); });
      enableMediaPresetVisualDrag(image, frame, selection);
      frame.append(image);
    } else if (value?.kind === "media") {
      const media = findTripMediaRecord?.(value.mediaId)?.item;
      if (media?.kind === "image" && media.url) {
        const image = document.createElement("img"); image.src = media.url; image.alt = media.name || "Preset media";
        image.style.objectFit = value.fit || "contain";
        image.style.transform = `translate(${(Number(value.offsetX) || 0) * 50}%, ${(Number(value.offsetY) || 0) * 50}%) scale(${Number(value.scale) || 1})`;
        const selection = { item, slots, slotId, value, kind: "image", playbackOptions };
        image.addEventListener("click", event => { event.stopPropagation(); selectedMediaPresetFrame = selection; openJourneyMedia(item, playbackOptions); });
        enableMediaPresetVisualDrag(image, frame, selection);
        frame.append(image);
      } else if (media?.kind === "video" && media.url) {
        const video = document.createElement("video"); video.src = media.url; video.muted = true; video.playsInline = true; video.preload = "metadata";
        video.style.objectFit = value.fit || "contain";
        video.style.transform = `translate(${(Number(value.offsetX) || 0) * 50}%, ${(Number(value.offsetY) || 0) * 50}%) scale(${Number(value.scale) || 1})`;
        video.style.filter = `brightness(${Number(value.brightness) || 1}) contrast(${Number(value.contrast) || 1}) saturate(${Number(value.saturate) || 1})`;
        const selection = { item, slots, slotId, value, kind: "video", playbackOptions };
        video.addEventListener("click", event => { event.stopPropagation(); selectedMediaPresetFrame = selection; openJourneyMedia(item, playbackOptions); });
        enableMediaPresetVisualDrag(video, frame, selection);
        frame.append(video);
      } else if (media?.kind === "preset" && depth < 1) {
        frame.classList.add("has-nested-preset");
        frame.append(renderMediaPresetSlots({ item: media, layoutId: media.layoutId, slots: media.presetSlots ||= {}, playbackOptions, depth: depth + 1 }));
      } else {
        const label = document.createElement("strong"); label.className = "media-preset-media-label"; label.textContent = media?.name || "Missing media"; frame.append(label);
      }
    } else if (value?.kind === "preset" && depth < 1) {
      frame.classList.add("has-nested-preset");
      frame.append(renderMediaPresetSlots({ item, layoutId: value.layoutId, slots: value.slots ||= {}, playbackOptions, depth: depth + 1 }));
    } else {
      const add = document.createElement("button"); add.type = "button"; add.className = "media-preset-add"; add.textContent = `+ ${definition.label || "Add media"}`;
      add.addEventListener("click", openSlotChooser);
      frame.append(add);
    }
    frame.addEventListener("click", event => {
      if (event.target.closest("textarea, button, .has-nested-preset")) return;
      if (value) {
        selectedMediaPresetFrame = { item, slots, slotId, value, kind: value.kind === "text" ? "text" : "image", playbackOptions };
        openJourneyMedia(item, playbackOptions);
        return;
      }
      openSlotChooser();
    });
    frame.addEventListener("contextmenu", event => { event.preventDefault(); event.stopPropagation(); if (slots[slotId]) { delete slots[slotId]; saveTrips?.(); openJourneyMedia(item, playbackOptions); } });
    frame.addEventListener("dragstart", event => { if (!slots[slotId]) return event.preventDefault(); event.dataTransfer.setData("application/x-rv-preset-slot", JSON.stringify({ itemId: item.id, slotId })); });
    frame.addEventListener("dragover", event => { if (event.dataTransfer.types.includes("application/x-rv-preset-slot")) event.preventDefault(); });
    frame.addEventListener("drop", event => {
      const raw = event.dataTransfer.getData("application/x-rv-preset-slot"); if (!raw) return;
      event.preventDefault();
      try { const source = JSON.parse(raw); if (source.itemId !== item.id || source.slotId === slotId) return; const prior = slots[slotId]; slots[slotId] = slots[source.slotId]; if (prior) slots[source.slotId] = prior; else delete slots[source.slotId]; saveTrips?.(); openJourneyMedia(item, playbackOptions); } catch {}
    });
    frame.addEventListener("dragover", event => {
      if (event.dataTransfer.types.includes("application/x-rv-preset-media") || event.dataTransfer.types.includes("application/x-rv-preset-layout")) event.preventDefault();
    });
    frame.addEventListener("drop", event => {
      const mediaRaw = event.dataTransfer.getData("application/x-rv-preset-media");
      const layoutId = event.dataTransfer.getData("application/x-rv-preset-layout");
      if (!mediaRaw && !layoutId) return;
      event.preventDefault(); event.stopPropagation();
      if (layoutId) slots[slotId] = { kind: "preset", layoutId, slots: {} };
      else try { const payload = JSON.parse(mediaRaw); if (payload.mediaId) slots[slotId] = { kind: "media", mediaId: payload.mediaId }; } catch { return; }
      saveTrips?.(); openJourneyMedia(item, playbackOptions);
    });
    if (value) {
      const resize = document.createElement("button"); resize.type = "button"; resize.className = "media-preset-resize"; resize.title = "Drag to resize this frame"; resize.setAttribute("aria-label", "Resize frame");
      resize.addEventListener("pointerdown", event => {
        event.preventDefault(); event.stopPropagation();
        const startX = event.clientX; const startY = event.clientY;
        const startSpanX = Number(value.spanX) || 1; const startSpanY = Number(value.spanY) || 1;
        const columns = Math.max(1, Number(layout.columns) || 1);
        const cellWidth = Math.max(32, container.getBoundingClientRect().width / columns);
        const cellHeight = Math.max(80, frame.getBoundingClientRect().height / startSpanY);
        const move = next => {
          value.spanX = Math.max(1, Math.min(columns, Math.round(startSpanX + (next.clientX - startX) / cellWidth)));
          value.spanY = Math.max(1, Math.min(6, Math.round(startSpanY + (next.clientY - startY) / cellHeight)));
          frame.style.gridColumn = `span ${value.spanX}`; frame.style.gridRow = `span ${value.spanY}`;
        };
        const done = () => { window.removeEventListener("pointermove", move); saveTrips?.(); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", done, { once: true });
      });
      frame.append(resize);
    }
    container.append(frame);
  });
  return container;
}

function renderMediaPresetInstance(item, playbackOptions = {}) {
  const content = document.createElement("div"); content.className = "media-preset-viewer";
  content.append(renderMediaPresetSlots({ item, layoutId: item.layoutId, slots: item.presetSlots ||= {}, playbackOptions }));
  const inspector = createMediaPresetFrameInspector(item, playbackOptions);
  if (inspector) { content.classList.add("has-frame-inspector"); content.append(inspector); }
  content.addEventListener("click", event => {
    if (event.target !== content || !playbackOptions.eventContext) return;
    if (!window.confirm("Remove this preset from the sticker event?")) return;
    assignStickerMediaEvent?.(playbackOptions.eventContext.sticker, playbackOptions.eventContext.slot, "");
    closeJourneyMedia();
  });
  return content;
}

function closeJourneyMedia() {
  if (typeof sfxPlayEvent === "function" && !els.mediaViewer.hidden) sfxPlayEvent("media.close");
  activeViewerMediaElement?.pause?.();
  activeViewerMediaElement = null;
  els.mediaViewer.hidden = true;
  els.mediaViewer.classList.remove("is-fullscreen");
  if (document.fullscreenElement === els.mediaViewer) document.exitFullscreen?.();
  els.mediaViewerContent.replaceChildren();
  document.body.classList.remove("is-media-preview-open");
  applyMediaMapTreatment(activePanelTabId() === "media");
}

function enableMediaViewerLayoutEditing(item) {
  if (!isEditorSite?.() || !item || els.mediaViewer.dataset.layoutEditingBound === "true") return;
  els.mediaViewer.dataset.layoutEditingBound = "true";
  els.mediaViewer.addEventListener("pointerdown", event => {
    if (!isEditorSite?.() || event.button !== 0 || event.target.closest("button, input, textarea, iframe, video, audio")) return;
    const titleBar = event.target.closest("#mediaViewerTitle");
    const rect = els.mediaViewer.getBoundingClientRect();
    const resize = !titleBar && event.clientX > rect.right - 28 && event.clientY > rect.bottom - 28;
    if (!titleBar && !resize) return;
    const currentId = els.mediaViewer.dataset.mediaId || item.id;
    const active = findTripMediaRecord?.(currentId)?.item || item;
    const viewport = mediaPresentationViewportRect();
    if (!viewport) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, left: rect.left - viewport.left, top: rect.top - viewport.top, width: rect.width, height: rect.height };
    const move = next => {
      const dx = next.clientX - start.x, dy = next.clientY - start.y;
      const width = resize ? clamp(start.width + dx, 120, viewport.width) : start.width;
      const height = resize ? clamp(start.height + dy, 90, viewport.height) : start.height;
      const left = resize ? start.left : clamp(start.left + dx, 0, Math.max(0, viewport.width - width));
      const top = resize ? start.top : clamp(start.top + dy, 0, Math.max(0, viewport.height - height));
      active.layoutInstance = { x: left / viewport.width, y: top / viewport.height, width: width / viewport.width, height: height / viewport.height };
      applyMediaPresentationToViewer(active.kind, active.layoutInstance);
    };
    const finish = () => { window.removeEventListener("pointermove", move); saveTrips?.(); markProjectDirty?.("journeys"); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish, { once: true });
  });
}

function openJourneyMedia(item, playbackOptions = {}) {
  closeJourneyMedia();
  if (typeof sfxPlayEvent === "function") sfxPlayEvent("media.open");
  selectedTripMediaId = item.id;
  els.mediaViewerTitle.textContent = item.name;
  els.mediaViewer.dataset.mediaId = item.id;
  els.mediaViewer.hidden = false;
  document.body.classList.add("is-media-preview-open");
  els.mediaViewerControls.hidden = !["video", "audio"].includes(item.kind);
  const layoutInstance = playbackOptions.layoutInstance || item.layoutInstance || null;
  applyMediaPresentationToViewer(item.kind, layoutInstance);
  enableMediaViewerLayoutEditing(item);

  if (item.kind === "preset") {
    els.mediaViewerContent.append(renderMediaPresetInstance(item, playbackOptions));
    return;
  }

  if (item.kind === "blog") {
    const article = document.createElement("article");
    article.className = "media-sticky-note";
    const text = document.createElement("textarea");
    text.className = "media-sticky-note-text";
    text.setAttribute("aria-label", "Note text");
    text.value = item.text || stickyNotePrompt(item);
    text.addEventListener("input", () => {
      item.text = text.value;
      item.notePrimed = true;
      saveTrips?.();
    });
    text.addEventListener("click", () => {
      if (item.notePrimed) return;
      item.notePrimed = true;
      saveTrips?.();
      requestAnimationFrame(() => text.select());
    });
    article.append(text);
    els.mediaViewerContent.append(article);
    applyMediaPresentationToViewer(item.kind, layoutInstance);
    return;
  }
  if (!item.url) {
    const article = document.createElement("article");
    article.textContent = "This local media file needs to be added again before it can be shown.";
    els.mediaViewerContent.append(article);
    return;
  }
  if (item.kind === "image") {
    const image = document.createElement("img");
    image.src = item.url;
    image.alt = item.name;
    els.mediaViewerContent.append(image);
    applyMediaPresentationToViewer(item.kind, layoutInstance);
    return;
  }

  if (item.kind === "youtube") {
    const frame = document.createElement("iframe");
    const youtubeUrl = new URL(item.url);
    youtubeUrl.searchParams.set("autoplay", "1");
    youtubeUrl.searchParams.set("playsinline", "1");
    youtubeUrl.searchParams.set("rel", "0");
    frame.src = youtubeUrl.toString();
    frame.title = item.name;
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    els.mediaViewerContent.append(frame);
    applyMediaPresentationToViewer(item.kind, layoutInstance);
    return;
  }

  const media = document.createElement(item.kind === "video" ? "video" : "audio");
  media.src = item.url;
  media.preload = "metadata";
  media.playsInline = true;
  media.volume = playbackOptions.muted ? 0 : Math.max(0, Math.min(1, Number(playbackOptions.volume ?? els.mediaVolume.value)));
  media.loop = Boolean(playbackOptions.loop);
  ["loadedmetadata", "timeupdate", "play", "pause", "volumechange", "ended"]
    .forEach(eventName => media.addEventListener(eventName, updateMediaViewerControls));
  media.addEventListener("play", () => { if (typeof sfxPlayEvent === "function") sfxPlayEvent("media.play"); });
  media.addEventListener("pause", () => { if (typeof sfxPlayEvent === "function" && !media.ended) sfxPlayEvent("media.pause"); });
  activeViewerMediaElement = media;
  els.mediaViewerContent.append(media);
  applyMediaPresentationToViewer(item.kind, layoutInstance);
  updateMediaViewerControls();
}

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !els.mediaViewer?.hidden) {
    event.preventDefault();
    closeJourneyMedia();
  }
}, true);

function mediaOrderLabel(order, style = "decimal") {
  const alpha = value => {
    let result = "";
    let next = Math.max(1, value);
    while (next > 0) {
      next -= 1;
      result = String.fromCharCode(65 + next % 26) + result;
      next = Math.floor(next / 26);
    }
    return result;
  };
  const roman = value => {
    const pairs = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let result = "";
    let next = Math.max(1, value);
    pairs.forEach(([amount, glyph]) => {
      while (next >= amount) { result += glyph; next -= amount; }
    });
    return result;
  };
  if (style === "none") return "";
  if (style === "roman-lower") return roman(order).toLowerCase();
  if (style === "roman-upper") return roman(order);
  if (style === "alpha-lower") return alpha(order).toLowerCase();
  if (style === "alpha-upper") return alpha(order);
  return String(order);
}

function mediaPinIcon(item, order, numberingStyle = "decimal") {
  const color = item.pinColor || MEDIA_PIN_COLORS[item.kind] || MEDIA_PIN_COLORS.blog;
  const pinType = item.pinType || (item.kind === "image" ? "preview" : "symbol");
  const label = item.name.trim().charAt(0).toUpperCase() || "M";
  const previewUrl = item.customThumbnailUrl || item.thumbnailUrl || (item.kind === "image" ? item.url : "");
  const orderLabel = mediaOrderLabel(order, numberingStyle);
  const content = pinType === "preview" && previewUrl
    ? `<img src="${escapeHtml(previewUrl)}" alt="">`
    : pinType === "number"
      ? `<span>${escapeHtml(orderLabel)}</span>`
      : pinType === "letter"
        ? `<span>${escapeHtml(label)}</span>`
        : pinType === "blank"
          ? ""
          : `<span>${MEDIA_PIN_SYMBOLS[item.kind] || "M"}</span>`;
  return L.divIcon({
    className: "media-pin-icon",
    html: `<span class="media-pin-marker media-pin-style-${escapeHtml(item.pinStyle || "default")}" style="--media-pin-color:${color}" title="${escapeHtml(`${order}. ${item.name}`)}">${content}</span>`,
    iconSize: [44, 44],
    iconAnchor: [8, 40],
    popupAnchor: [12, -38]
  });
}

function mediaPopupContent(item, order) {
  const content = document.createElement("div");
  content.className = "media-pin-popup";
  const title = document.createElement("strong");
  title.textContent = `${order}. ${item.name}`;
  const type = document.createElement("p");
  type.textContent = mediaTypeLabel(item);
  const preview = document.createElement("button");
  preview.type = "button";
  preview.textContent = "Open";
  preview.addEventListener("click", () => {
    selectTripMedia(item);
    document.querySelector("#tabTrips")?.click();
  });
  content.append(title, type, preview);
  return content;
}

function addMediaMarker(item, index, owner, route, target) {
  // The marker is now a classed sticker. Keep its media record for content,
  // styles, and layouts, but do not render a duplicate legacy pin.
  if (item.stickerId) return;
  // Null objects are intentionally visible while authoring so their timeline
  // cues can be selected and arranged, but never render on the USER site.
  if (item.kind === "null" && !isEditorSite()) return;
  if (!Number.isFinite(item.lat) || !Number.isFinite(item.lon)) return;
  const pinsAreDraggable = isEditorSite() && ["trips", "media"].includes(activePanelTabId());
  const numberingStyle = owner.mediaNumberingStyle || "decimal";
  const marker = L.marker([item.lat, item.lon], {
    pane: "mediaPane",
    icon: mediaPinIcon(item, index + 1, numberingStyle),
    keyboard: true,
    riseOnHover: true,
    zIndexOffset: 1800 + index * 20,
    draggable: false
  }).bindPopup(mediaPopupContent(item, index + 1));
  marker.on("click", event => {
    if (typeof marqueeSuppressClickUntil !== "undefined" && performance.now() < marqueeSuppressClickUntil) return;
    if (!isEditorSite()) {
      if (item.kind !== "null" && ["click", "either"].includes(item.activation || "either")) openJourneyMedia(item);
      return;
    }
    if (els.selectionTypeMediaPins?.checked) selectMediaPin?.(item.id, { toggle: Boolean(event.originalEvent?.shiftKey) });
    selectedTripMediaId = item.id;
    if (els.tripMediaTarget) els.tripMediaTarget.value = target;
    if (target === "stop") {
      const stopIndex = (activeTrip()?.stops || []).findIndex(stop => stop.id === owner.id);
      if (stopIndex >= 0) selectedStopIndex = stopIndex;
    }
  });
  marker.on("add", () => {
    const element = marker.getElement?.();
    if (!element) return;
    element.dataset.mediaPinId = item.id;
    element.classList.toggle("is-map-feature-selected", Boolean(selectedMediaPinIds?.has(item.id)));
  });
  const beginMediaMarkerDrag = () => {
    selectedTripMediaId = item.id;
    marker.setZIndexOffset(5000);
    if (els.tripMediaTarget) els.tripMediaTarget.value = target;
    if (target === "stop") {
      const stopIndex = (activeTrip()?.stops || []).findIndex(stop => stop.id === owner.id);
      if (stopIndex >= 0) selectedStopIndex = stopIndex;
    }
    marker.closePopup();
  };
  const finishMediaMarkerDrag = position => {
    const currentRecord = findTripMediaRecord(item.id);
    const currentItem = currentRecord?.item || item;
    const currentOwner = currentRecord?.owner || owner;
    const currentRoute = currentRecord?.route || route;
    currentItem.sourceLat = position.lat;
    currentItem.sourceLon = position.lng;
    currentItem.lat = position.lat;
    currentItem.lon = position.lng;
    currentItem.stopPositionCustom = target === "stop";
    currentItem.routeAnchor = null;
    applyAutomaticMediaOrder(currentOwner, currentRoute);
    saveTrips();
    renderTripMedia();
    renderMediaMarkers();
    setTripStatus(`Moved ${item.name}.`);
  };
  if (pinsAreDraggable) {
    bindMapFeaturePointerDrag(marker, {
      onStart: beginMediaMarkerDrag,
      onEnd: finishMediaMarkerDrag
    });
  }
  mediaMarkerGroup.addLayer(marker);
}

function renderMediaMarkers() {
  // Media is a content asset now.  Stickers/pins are the only authored map
  // objects, so legacy media records never create their own parallel marker.
  mediaMarkerGroup.clearLayers();
}
