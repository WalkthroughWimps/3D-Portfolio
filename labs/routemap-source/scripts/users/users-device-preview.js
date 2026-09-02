"use strict";

// 16:9, 4:3, tablet, phone, and custom device frame previews.
const USER_DEVICE_LAYOUTS_KEY = "rv-user-device-layouts-v1";
const USER_AUTHORED_VIEWPORT_KEY = "rv-user-authored-viewport-v1";
let userEditorGuideGeometry = null;
let userEditorGuideTransform = { x: 0, y: 0, scale: 1 };
let userEditorGuidePointerBound = false;

function userAuthoredViewportStorageKey(mode = userDevicePreviewMode) {
  return `${USER_AUTHORED_VIEWPORT_KEY}:${mode || "desktop-16-9"}`;
}

function readUserAuthoredViewport(mode = userDevicePreviewMode) {
  const exact = rvStorageReadJson(userAuthoredViewportStorageKey(mode), null);
  if (exact) return exact;
  // Legacy data was a single shared key. It is safe only when it explicitly
  // belongs to the selected device; otherwise it leaks one preset into another.
  const legacy = rvStorageReadJson(USER_AUTHORED_VIEWPORT_KEY, null);
  return legacy?.mode === mode ? legacy : null;
}

function clearUserEditorGuideGeometry() {
  userEditorGuideGeometry = null;
  userEditorGuideTransform = { x: 0, y: 0, scale: 1 };
  if (els.editorPreviewGuide) {
    els.editorPreviewGuide.hidden = true;
    els.editorPreviewGuide.setAttribute("aria-hidden", "true");
    ["left", "top", "width", "height", "transform"].forEach(property => els.editorPreviewGuide.style.removeProperty(property));
  }
  [
    els.deviceBoundsOverlay,
    els.mapBoundsOverlay,
    els.userDevicePreviewResizeLayer,
    els.userMapViewportResizeLayer
  ].filter(Boolean).forEach(node => node.style.removeProperty("inset"));
}

function renderUserEditorGuideTransform() {
  const guide = els.editorPreviewGuide;
  if (!guide) return;
  const state = userEditorGuideTransform;
  guide.style.transform = `translate(${Math.round(state.x)}px, ${Math.round(state.y)}px) scale(${state.scale})`;
}

function beginUserEditorGuideGesture(event) {
  if (!canEditUserDeviceBounds?.() || event.button !== 0 || !userEditorGuideGeometry) return;
  const guide = els.editorPreviewGuide;
  if (!guide) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = guide.getBoundingClientRect();
  const handle = event.currentTarget?.dataset?.editorGuideHandle || "";
  const edgeX = handle.includes("left") ? -1 : handle.includes("right") ? 1 : 0;
  const edgeY = handle.includes("top") ? -1 : handle.includes("bottom") ? 1 : 0;
  const start = { x: event.clientX, y: event.clientY, transform: { ...userEditorGuideTransform }, rect };
  guide.setPointerCapture?.(event.pointerId);
  const move = moveEvent => {
    const dx = moveEvent.clientX - start.x;
    const dy = moveEvent.clientY - start.y;
    if (!edgeX && !edgeY) {
      userEditorGuideTransform.x = start.transform.x + dx;
      userEditorGuideTransform.y = start.transform.y + dy;
    } else {
      const dimension = edgeX ? start.rect.width : start.rect.height;
      const delta = edgeX ? dx * edgeX : dy * edgeY;
      userEditorGuideTransform.scale = clamp(start.transform.scale * (1 + delta / Math.max(80, dimension)), .12, 8);
    }
    renderUserEditorGuideTransform();
  };
  const finish = () => {
    guide.releasePointerCapture?.(event.pointerId);
    guide.removeEventListener("pointermove", move);
    guide.removeEventListener("pointerup", finish);
    guide.removeEventListener("pointercancel", finish);
  };
  guide.addEventListener("pointermove", move);
  guide.addEventListener("pointerup", finish);
  guide.addEventListener("pointercancel", finish);
}

function applyUserEditorGuideGeometry(stage, source, label) {
  const guide = els.editorPreviewGuide;
  const viewport = els.editorPreviewGuideViewport;
  if (!guide || !viewport || !stage?.width || !stage?.height) return false;
  // The move affordance belongs to the map viewport, not the decorative
  // device outline. Keep it there even when this markup is reused on reload.
  const moveHandle = guide.querySelector(".editor-preview-guide-move");
  if (moveHandle && moveHandle.parentElement !== viewport) viewport.append(moveHandle);
  const sourceWidth = Math.max(1, Number(source.width));
  const sourceHeight = Math.max(1, Number(source.height));
  const scale = Math.min((stage.width - 36) / sourceWidth, (stage.height - 36) / sourceHeight);
  const width = Math.max(1, sourceWidth * scale);
  const height = Math.max(1, sourceHeight * scale);
  const map = source.viewport;
  userEditorGuideGeometry = { source: { ...source, viewport: { ...map } }, width, height };
  guide.style.left = `${Math.round((stage.width - width) / 2)}px`;
  guide.style.top = `${Math.round((stage.height - height) / 2)}px`;
  guide.style.width = `${Math.round(width)}px`;
  guide.style.height = `${Math.round(height)}px`;
  viewport.style.left = `${map.x * 100}%`;
  viewport.style.top = `${map.y * 100}%`;
  viewport.style.width = `${map.width * 100}%`;
  viewport.style.height = `${map.height * 100}%`;
  const ratio = sourceWidth / sourceHeight;
  if (els.editorPreviewGuideLabel) els.editorPreviewGuideLabel.textContent = `${label} · ${sourceWidth} × ${sourceHeight} · ${ratio.toFixed(3)}`;
  guide.hidden = !(Boolean(els.showMapBounds?.checked) && isEditorSite() && !isUsersBuilderMode());
  guide.setAttribute("aria-hidden", guide.hidden ? "true" : "false");
  renderUserEditorGuideTransform();
  if (!userEditorGuidePointerBound) {
    guide.querySelectorAll("[data-editor-guide-handle]").forEach(handle => {
      handle.addEventListener("pointerdown", beginUserEditorGuideGesture);
    });
    userEditorGuidePointerBound = true;
  }
  return true;
}

function saveUserAuthoredViewport() {
  const metrics = userPreviewCompositionMetrics();
  // The visible cyan device bounds are derived from preview insets, not from
  // userDeviceFrame (that node is the decorative shell and has its own
  // margins).  Pair that exact outer rectangle with the rendered viewport.
  const stageRect = userDevicePreviewStageRect();
  const viewportRect = els.userMapViewport?.getBoundingClientRect?.();
  const renderedDevice = {
    left: (stageRect?.left || 0) + metrics.deviceLeft,
    top: (stageRect?.top || 0) + metrics.deviceTop,
    width: Math.max(1, metrics.deviceRight - metrics.deviceLeft),
    height: Math.max(1, metrics.deviceBottom - metrics.deviceTop)
  };
  const useRenderedRects = isUsersBuilderMode()
    && renderedDevice.width >= 80 && renderedDevice.height >= 80
    && viewportRect?.width >= 20 && viewportRect?.height >= 20;
  const deviceWidth = renderedDevice.width;
  const deviceHeight = renderedDevice.height;
  const renderedViewport = useRenderedRects ? {
    x: clamp((viewportRect.left - renderedDevice.left) / deviceWidth, 0, .98),
    y: clamp((viewportRect.top - renderedDevice.top) / deviceHeight, 0, .98),
    width: clamp(viewportRect.width / deviceWidth, .02, 1),
    height: clamp(viewportRect.height / deviceHeight, .02, 1)
  } : null;
  if (renderedViewport) {
    renderedViewport.width = Math.min(renderedViewport.width, 1 - renderedViewport.x);
    renderedViewport.height = Math.min(renderedViewport.height, 1 - renderedViewport.y);
  }
  const authored = {
    version: 2,
    mode: userDevicePreviewMode,
    previewInsets: { ...userDevicePreviewInsets },
    frameGeometry: { ...userFrameGeometry },
    deviceSize: {
      width: deviceWidth,
      height: deviceHeight
    },
    viewportFractions: {
      top: renderedViewport ? renderedViewport.y : userFrameGeometry.top / deviceHeight,
      right: renderedViewport ? 1 - renderedViewport.x - renderedViewport.width : userFrameGeometry.right / deviceWidth,
      bottom: renderedViewport ? 1 - renderedViewport.y - renderedViewport.height : userFrameGeometry.bottom / deviceHeight,
      left: renderedViewport ? renderedViewport.x : userFrameGeometry.left / deviceWidth
    },
    // This explicit pair is the cross-tab contract: an editor may scale or
    // move it, but it may not independently recalculate either rectangle.
    composition: {
      deviceRatio: deviceWidth / deviceHeight,
      viewport: renderedViewport || {
        x: userFrameGeometry.left / deviceWidth,
        y: userFrameGeometry.top / deviceHeight,
        width: metrics.viewportWidth / deviceWidth,
        height: metrics.viewportHeight / deviceHeight
      }
    }
  };
  rvStorageWriteJson(userAuthoredViewportStorageKey(), authored);
  // Preserve the former key as a one-release migration fallback.
  rvStorageWriteJson(USER_AUTHORED_VIEWPORT_KEY, authored);
}

function restoreUserAuthoredViewport() {
  const saved = readUserAuthoredViewport();
  if (!saved?.previewInsets || !saved?.frameGeometry) return false;
  userDevicePreviewMode = saved.mode === "custom" || USER_DEVICE_PREVIEW_PRESETS[saved.mode] ? saved.mode : "desktop-16-9";
  applyUserDevicePreviewInsets(saved.previewInsets, { snap: false });
  setUserFrameGeometry(saved.frameGeometry, {
    activeEdges: ["top", "right", "bottom", "left"],
    render: true,
    resizeMap: true,
    allowOverflow: true
  });
  updateUserDevicePreviewToolbar();
  return true;
}

function loadUserDeviceLayouts() {
  const parsed = rvStorageReadJson(USER_DEVICE_LAYOUTS_KEY, {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function saveUserDeviceLayout(mode = userDevicePreviewMode) {
  if (mode !== "custom" && !USER_DEVICE_PREVIEW_PRESETS[mode]) return;
  const layouts = loadUserDeviceLayouts();
  layouts[mode] = {
    draft: serializeUserViewDraft(),
    frameGeometry: { ...userFrameGeometry },
    previewInsets: { ...userDevicePreviewInsets }
  };
  rvStorageWriteJson(USER_DEVICE_LAYOUTS_KEY, layouts);
}

function restoreUserDeviceLayout(mode) {
  const saved = loadUserDeviceLayouts()[mode];
  if (!saved?.draft || !saved?.frameGeometry) return false;
  applyUserViewDraftState(saved.draft);
  // A named device's outside rectangle is always derived from its preset and
  // the current Users canvas. Restoring historical pixel insets here was
  // reintroducing a square editor layout immediately after 16:9 autofit.
  // Only Custom is allowed to retain manually authored outer bounds.
  if (mode === "custom" && saved.previewInsets) applyUserDevicePreviewInsets(saved.previewInsets);
  setUserFrameGeometry(saved.frameGeometry, {
    activeEdges: ["top", "right", "bottom", "left"],
    render: true,
    resizeMap: true,
    allowOverflow: true
  });
  return true;
}

function setUserDevicePreviewInsets(insets, { save = false, snap = false } = {}) {
  // Insets are deliberately allowed past every stage edge. The preview is a
  // composition, not a constrained child of the map zone.
  const next = Object.fromEntries(["top", "right", "bottom", "left"].map(edge => [
    edge,
    Math.round(Number(insets?.[edge]) || 0)
  ]));
  applyUserDevicePreviewInsets(next, { snap });
  updateUserDevicePreviewStatus();
  if (save) saveUserDeviceLayout(userDevicePreviewMode);
  return next;
}

function userPreviewCompositionMetrics(insets = userDevicePreviewInsets, geometry = userFrameGeometry) {
  const stage = userDevicePreviewStageRect();
  const stageWidth = stage?.width || window.innerWidth;
  const stageHeight = stage?.height || window.innerHeight;
  const deviceLeft = Number(insets.left);
  const deviceTop = Number(insets.top);
  const deviceRight = stageWidth - Number(insets.right);
  const deviceBottom = stageHeight - Number(insets.bottom);
  const viewportLeft = deviceLeft + Number(geometry.left);
  const viewportTop = deviceTop + Number(geometry.top);
  const viewportRight = deviceRight - Number(geometry.right);
  const viewportBottom = deviceBottom - Number(geometry.bottom);
  return { stageWidth, stageHeight, deviceLeft, deviceTop, deviceRight, deviceBottom, viewportLeft, viewportTop, viewportRight, viewportBottom,
    viewportWidth: Math.max(1, viewportRight - viewportLeft), viewportHeight: Math.max(1, viewportBottom - viewportTop) };
}

// The device outline and its map viewport are one composition. Every resize,
// zoom, move, and autofit operation comes through this viewport-first transform.
function transformUserPreviewComposition({ scale = 1, viewportCenterX = null, viewportCenterY = null, insets = userDevicePreviewInsets, geometry: sourceGeometry = userFrameGeometry } = {}) {
  // Pointer gestures always transform from their captured starting geometry.
  // That avoids compounding a start-relative pointer delta on every move.
  const previous = userPreviewCompositionMetrics(insets, sourceGeometry);
  const nextScale = clamp(Number(scale) || 1, 0.12, 8);
  const oldCenterX = (previous.viewportLeft + previous.viewportRight) / 2;
  const oldCenterY = (previous.viewportTop + previous.viewportBottom) / 2;
  const centerX = Number.isFinite(viewportCenterX) ? viewportCenterX : oldCenterX;
  const centerY = Number.isFinite(viewportCenterY) ? viewportCenterY : oldCenterY;
  const width = previous.viewportWidth * nextScale;
  const height = previous.viewportHeight * nextScale;
  const viewportLeft = centerX - width / 2;
  const viewportTop = centerY - height / 2;
  const geometry = {
    top: sourceGeometry.top * nextScale,
    right: sourceGeometry.right * nextScale,
    bottom: sourceGeometry.bottom * nextScale,
    left: sourceGeometry.left * nextScale
  };
  const deviceLeft = viewportLeft - geometry.left;
  const deviceTop = viewportTop - geometry.top;
  const deviceRight = viewportLeft + width + geometry.right;
  const deviceBottom = viewportTop + height + geometry.bottom;
  setUserDevicePreviewInsets({
    left: deviceLeft, top: deviceTop,
    right: previous.stageWidth - deviceRight,
    bottom: previous.stageHeight - deviceBottom
  }, { snap: false });
  return setUserFrameGeometry(geometry, {
    activeEdges: ["top", "right", "bottom", "left"], render: false, resizeMap: true, allowOverflow: true
  });
}

function loadUserFrameGeometry() {
  const defaults = { top: 96, right: 96, bottom: 128, left: 96 };
  const parsed = rvStorageReadJson(USER_FRAME_GEOMETRY_KEY, null);
  return Object.fromEntries(Object.entries(defaults).map(([edge, value]) => {
    const next = Number(parsed?.[edge]);
    return [edge, Number.isFinite(next) ? Math.round(next) : value];
  }));
}

function splitUserDevicePreviewInset(total, firstMinimum, secondMinimum) {
  let first = Math.round(total / 2);
  let second = total - first;
  if (first < firstMinimum) {
    first = firstMinimum;
    second = total - first;
  }
  if (second < secondMinimum) {
    second = secondMinimum;
    first = total - second;
  }
  return [Math.max(firstMinimum, first), Math.max(secondMinimum, second)];
}

function userDevicePreviewStageRect() {
  return els.mapCanvas?.closest(".map-stage")?.getBoundingClientRect?.() || null;
}

// The public device is one physical composition. When an editor panel changes
// the width of the map zone, preserve its on-screen rectangle by letting the
// far inset become negative instead of squeezing the public view narrower.
function rebaseUserPreviewForStage() {
  const stage = userDevicePreviewStageRect();
  if (!stage?.width || !stage?.height) return false;
  const current = { width: Math.round(stage.width), height: Math.round(stage.height) };
  const previous = userDevicePreviewStageDimensions;
  userDevicePreviewStageDimensions = current;
  if (!previous || (previous.width === current.width && previous.height === current.height)) return false;
  setUserDevicePreviewInsets({
    ...userDevicePreviewInsets,
    right: userDevicePreviewInsets.right - (current.width - previous.width),
    bottom: userDevicePreviewInsets.bottom - (current.height - previous.height)
  }, { snap: false });
  return true;
}

function applyUserAuthoredViewportProportionsForEditor() {
  if (!isEditorSite() || isUsersBuilderMode()) return false;
  const saved = readUserAuthoredViewport();
  const stage = userDevicePreviewStageRect();
  if (!stage?.width || !stage?.height) return false;
  const preset = USER_DEVICE_PREVIEW_PRESETS[saved?.mode] || USER_DEVICE_PREVIEW_PRESETS[userDevicePreviewMode] || USER_DEVICE_PREVIEW_PRESETS["desktop-16-9"];
  const authoredSize = saved?.deviceSize || {};
  const authoredWidth = Math.max(1, Number(authoredSize.width) || 1);
  const authoredHeight = Math.max(1, Number(authoredSize.height) || 1);
  // Named devices have a non-negotiable physical ratio. A previous editor
  // preview may have stored a bad pixel size, but it must never turn Desktop
  // 16:9 into a square guide. Custom is the sole mode that uses its authored
  // device ratio.
  // The editor column is a different canvas from the Users tab. It can only
  // choose a uniform scale for the saved composition—not a new ratio.
  const fractions = saved?.viewportFractions || preset.frame || { top: .08, right: .06, bottom: .1, left: .06 };
  // Fractions are the only cross-tab source of truth: neither the old stage
  // size nor a previous editor preview may influence this relationship.
  const viewport = saved?.composition?.viewport;
  const normalized = viewport
    ? {
        left: clamp(Number(viewport.x) || 0, 0, .98),
        top: clamp(Number(viewport.y) || 0, 0, .98),
        right: clamp(1 - (Number(viewport.x) || 0) - (Number(viewport.width) || 0), 0, .98),
        bottom: clamp(1 - (Number(viewport.y) || 0) - (Number(viewport.height) || 0), 0, .98)
      }
    : {
        top: clamp(Number(fractions.top) || 0, 0, .98),
        right: clamp(Number(fractions.right) || 0, 0, .98),
        bottom: clamp(Number(fractions.bottom) || 0, 0, .98),
        left: clamp(Number(fractions.left) || 0, 0, .98)
      };
  if (normalized.left + normalized.right > .98) normalized.right = Math.max(0, .98 - normalized.left);
  if (normalized.top + normalized.bottom > .98) normalized.bottom = Math.max(0, .98 - normalized.top);
  const hasUsableSource = authoredWidth >= 80 && authoredHeight >= 80;
  const fallbackWidth = 1600;
  const source = {
    width: hasUsableSource ? authoredWidth : fallbackWidth,
    height: hasUsableSource ? authoredHeight : fallbackWidth / preset.ratio,
    viewport: {
      x: normalized.left,
      y: normalized.top,
      width: Math.max(.02, 1 - normalized.left - normalized.right),
      height: Math.max(.02, 1 - normalized.top - normalized.bottom)
    }
  };
  // One-way copy: editors render this guide but never write Users geometry.
  const label = preset.label || "Custom";
  applyUserEditorGuideGeometry(stage, source, label);
  requestAnimationFrame(() => {
    if (isUsersBuilderMode() || !isEditorSite()) return;
    applyUserEditorGuideGeometry(userDevicePreviewStageRect(), source, label);
  });
  return true;
}

function applyUserDevicePreviewInsets(insets = {}, { snap = false } = {}) {
  userDevicePreviewInsets = Object.fromEntries(["top", "right", "bottom", "left"].map(edge => [
    edge,
    Math.round(Number(insets?.[edge]) || 0)
  ]));
  if (snap) {
    [["left", "right"], ["top", "bottom"]].forEach(([first, second]) => {
      if (Math.abs(userDevicePreviewInsets[first] - userDevicePreviewInsets[second]) <= 8) {
        const matched = Math.round((userDevicePreviewInsets[first] + userDevicePreviewInsets[second]) / 2);
        userDevicePreviewInsets[first] = matched;
        userDevicePreviewInsets[second] = matched;
      }
    });
  }
  const stage = els.mapCanvas?.closest?.(".map-stage");
  [document.documentElement, stage].filter(Boolean).forEach(target => {
    Object.entries(userDevicePreviewInsets).forEach(([edge, value]) => {
      target.style.setProperty(`--user-device-preview-${edge}`, `${value}px`);
    });
  });
  const alignedX = userDevicePreviewInsets.left === userDevicePreviewInsets.right;
  const alignedY = userDevicePreviewInsets.top === userDevicePreviewInsets.bottom;
  [els.deviceBoundsOverlay, els.userDevicePreviewResizeLayer].filter(Boolean).forEach(target => {
    target.classList.toggle("is-device-aligned-x", alignedX);
    target.classList.toggle("is-device-aligned-y", alignedY);
  });
}

function userDevicePreviewSize() {
  const rect = userDevicePreviewStageRect();
  return {
    width: Math.max(0, (rect?.width || 0) - userDevicePreviewInsets.left - userDevicePreviewInsets.right),
    height: Math.max(0, (rect?.height || 0) - userDevicePreviewInsets.top - userDevicePreviewInsets.bottom)
  };
}

function updateUserDevicePreviewStatus() {
  if (!els.usersDevicePreviewStatus) return;
  const rect = userDevicePreviewStageRect();
  if (!rect) {
    els.usersDevicePreviewStatus.textContent = userDevicePreviewMode === "custom" ? "Current frame" : "Preview";
    return;
  }
  const device = userDevicePreviewSize();
  els.usersDevicePreviewStatus.textContent = `${Math.round(device.width)} × ${Math.round(device.height)} device`;
  if (els.mapBoundsOverlay) {
    const label = USER_DEVICE_PREVIEW_PRESETS[userDevicePreviewMode]?.label || "Custom";
    const size = userDevicePreviewSize();
    els.mapBoundsOverlay.dataset.device = `${label} · ${Math.round(size.width)} × ${Math.round(size.height)}`;
  }
}

function updateUserDeviceBoundsLabel() {
  const device = userDevicePreviewSize();
  if (els.mapBoundsOverlay) els.mapBoundsOverlay.dataset.device = "Map viewport";
  if (!els.deviceBoundsOverlay) return;
  const label = USER_DEVICE_PREVIEW_PRESETS[userDevicePreviewMode]?.label || "Custom";
  els.deviceBoundsOverlay.dataset.device = `${label} - ${Math.round(device.width)} x ${Math.round(device.height)} device`;
}

function updateUserDevicePreviewToolbar() {
  const active = isEditorSite();
  if (els.usersDevicePreviewToolbar) els.usersDevicePreviewToolbar.hidden = !active;
  if (els.usersDevicePreviewSelect) els.usersDevicePreviewSelect.value = userDevicePreviewMode;
  if (active) document.body.dataset.userDevicePreview = userDevicePreviewMode;
  else delete document.body.dataset.userDevicePreview;
  updateUserDevicePreviewStatus();
  updateUserDeviceBoundsLabel();
}

function applyUserDevicePreviewPreset(mode = userDevicePreviewMode) {
  const preset = USER_DEVICE_PREVIEW_PRESETS[mode];
  const rect = userDevicePreviewStageRect();
  if (!preset || !rect?.width || !rect?.height || !isEditorSite()) return false;
  const margin = clamp(Math.round(Math.min(rect.width, rect.height) * 0.035), 18, 52);
  const adminReserve = preset.compact
    ? clamp(Math.round(rect.width * 0.2), 250, 370) + margin
    : 0;
  const availableWidth = Math.max(240, rect.width - margin * 2 - adminReserve * 2);
  const availableHeight = Math.max(180, rect.height - margin * 2);
  let width = availableWidth;
  let height = width / preset.ratio;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * preset.ratio;
  }
  const maximumScale = Math.min(
    1,
    preset.maxWidth ? preset.maxWidth / width : 1,
    preset.maxHeight ? preset.maxHeight / height : 1
  );
  width *= maximumScale;
  height *= maximumScale;
  applyUserDevicePreviewInsets({
    left: (rect.width - width) / 2,
    right: (rect.width - width) / 2,
    top: (rect.height - height) / 2,
    bottom: (rect.height - height) / 2
  });
  const device = userDevicePreviewSize();
  const desiredFrame = Object.fromEntries(["top", "right", "bottom", "left"].map(edge => [
    edge,
    Math.round((edge === "top" || edge === "bottom" ? device.height : device.width) * preset.frame[edge])
  ]));
  const result = setUserFrameGeometry(desiredFrame, {
    activeEdges: ["top", "right", "bottom", "left"],
    render: true,
    resizeMap: true
  });
  updateUserDevicePreviewStatus();
  return result.changed;
}

function autofitUserDeviceBoundsForUsers() {
  if (!isUsersBuilderMode()) return false;
  const stage = userDevicePreviewStageRect();
  const preset = USER_DEVICE_PREVIEW_PRESETS[userDevicePreviewMode] || USER_DEVICE_PREVIEW_PRESETS["desktop-16-9"];
  if (!stage?.width || !stage?.height || !preset) return false;
  // Leave room for the visible outline and its label even when browser chrome
  // makes the authoring stage unusually short.
  const horizontalMargin = 22;
  const topMargin = 38;
  const bottomMargin = 28;
  let width = Math.max(1, stage.width - horizontalMargin * 2);
  let height = width / preset.ratio;
  if (height > stage.height - topMargin - bottomMargin) {
    height = Math.max(1, stage.height - topMargin - bottomMargin);
    width = height * preset.ratio;
  }
  setUserDevicePreviewInsets({
    left: (stage.width - width) / 2,
    right: (stage.width - width) / 2,
    top: Math.max(topMargin, (stage.height - height) / 2),
    bottom: Math.max(bottomMargin, (stage.height - height) / 2)
  }, { snap: false });
  updateUserDevicePreviewStatus();
  return true;
}

function keepUserDevicePreviewWithinVisibleStage() {
  const canvas = document.querySelector(".map-stage");
  if (!isUsersBuilderMode()) {
    canvas?.style.setProperty("--ui-canvas-safe-scale", "1");
    return false;
  }
  const stage = userDevicePreviewStageRect();
  if (!stage?.width || !stage?.height) return false;
  const device = userDevicePreviewSize();
  const safe = { left: 22, right: 22, top: 38, bottom: 28 };
  const availableWidth = Math.max(1, stage.width - safe.left - safe.right);
  const availableHeight = Math.max(1, stage.height - safe.top - safe.bottom);
  const scale = Math.min(1, availableWidth / Math.max(1, device.width), availableHeight / Math.max(1, device.height));
  const previous = Number.parseFloat(canvas?.style.getPropertyValue("--ui-canvas-safe-scale")) || 1;
  canvas?.style.setProperty("--ui-canvas-safe-scale", String(Math.max(.1, scale)));
  // This is deliberately presentation-only. It never changes persisted device
  // insets, map viewport geometry, or the public USER layout.
  return Math.abs(previous - scale) > .001;
}

function constrainUserViewportToDevice() {
  if (!isUsersBuilderMode()) return false;
  const device = userDevicePreviewSize();
  const minimumWidth = 160;
  const minimumHeight = 120;
  const next = Object.fromEntries(["top", "right", "bottom", "left"].map(edge => [edge, Math.max(0, Math.round(Number(userFrameGeometry[edge]) || 0))]));
  const maxHorizontalInsets = Math.max(0, device.width - minimumWidth);
  const maxVerticalInsets = Math.max(0, device.height - minimumHeight);
  if (next.left + next.right > maxHorizontalInsets) next.right = Math.max(0, maxHorizontalInsets - next.left);
  if (next.top + next.bottom > maxVerticalInsets) next.bottom = Math.max(0, maxVerticalInsets - next.top);
  return setUserFrameGeometry(next, {
    activeEdges: ["top", "right", "bottom", "left"],
    render: true,
    resizeMap: true,
    allowOverflow: true
  }).changed;
}

function autofitUserDevicePreview() {
  if (!isEditorSite()) return false;
  if (isUsersBuilderMode()) {
    const changed = autofitUserDeviceBoundsForUsers();
    constrainUserViewportToDevice();
    saveUserAuthoredViewport();
    return changed;
  }
  // Editor tabs keep the map visible across the full map zone. Autofit only
  // restores the Users-authored guide pair; it does not treat surrounding UI
  // as geometry that can collapse that pair into a tiny fallback rectangle.
  const applied = applyUserAuthoredViewportProportionsForEditor();
  if (applied) {
    userEditorGuideTransform = { x: 0, y: 0, scale: 1 };
    renderUserEditorGuideTransform();
    renderUserMapViewportResizeLayer?.();
    renderUserDevicePreviewResizeLayer?.();
  }
  return applied;

  const current = userPreviewCompositionMetrics();
  const margin = 24;
  const stageRect = userDevicePreviewStageRect();
  const safe = { left: margin, top: margin, right: current.stageWidth - margin, bottom: current.stageHeight - margin };
  const blockers = [
    ".map-shell > .panel:not([hidden])",
    ".pinned-journey-section:not([hidden])",
    ".map-top-utility-bar:not([hidden])",
    ".selection-shortcut-menu:not(:empty)",
    ".map-selection-legend:not([hidden])",
    ".map-control-cluster:not([hidden])",
    ".map-feature-toolbar:not([hidden])",
    ".playback-panel:not([hidden])",
    ".day-edge-control:not([hidden])",
    ".usage-overlay:not([hidden])",
    "#projectExportStatus:not([hidden])",
    ".maintenance-map-controls:not([hidden])",
    ".user-material-controls:not([hidden])",
    ".user-site-controls:not([hidden])"
  ];
  if (stageRect) {
    document.querySelectorAll(blockers.join(",")).forEach(blocker => {
      const rect = blocker.getBoundingClientRect();
      const left = Math.max(0, rect.left - stageRect.left);
      const right = Math.min(current.stageWidth, rect.right - stageRect.left);
      const top = Math.max(0, rect.top - stageRect.top);
      const bottom = Math.min(current.stageHeight, rect.bottom - stageRect.top);
      if (right <= left || bottom <= top) return;
      // Any visible map-zone UI is a hard obstacle. Reserve its nearest stage
      // edge so the fitted viewport cannot hide it—even a small corner legend.
      const distances = { left, right: current.stageWidth - right, top, bottom: current.stageHeight - bottom };
      const nearest = Object.entries(distances).sort((a, b) => a[1] - b[1])[0]?.[0];
      if (nearest === "left") safe.left = Math.max(safe.left, right + margin);
      if (nearest === "right") safe.right = Math.min(safe.right, left - margin);
      if (nearest === "top") safe.top = Math.max(safe.top, bottom + margin);
      if (nearest === "bottom") safe.bottom = Math.min(safe.bottom, top - margin);
    });
  }
  const availableWidth = Math.max(1, safe.right - safe.left);
  const availableHeight = Math.max(1, safe.bottom - safe.top);
  const fitScale = Math.min(
    Math.max(.12, availableWidth / current.viewportWidth),
    Math.max(.12, availableHeight / current.viewportHeight)
  );
  const result = transformUserPreviewComposition({
    scale: fitScale,
    viewportCenterX: (safe.left + safe.right) / 2,
    viewportCenterY: (safe.top + safe.bottom) / 2
  });
  applyUserFrameGeometry({ render: true, resizeMap: true, allowOverflow: true });
  saveUserDeviceLayout(userDevicePreviewMode);
  if (isUsersBuilderMode()) saveUserAuthoredViewport();
  return result.changed;
}

function setUserDevicePreviewMode(mode) {
  const next = mode === "custom" || USER_DEVICE_PREVIEW_PRESETS[mode] ? mode : "custom";
  if (!isUsersBuilderMode() && isEditorSite()) {
    userDevicePreviewMode = next;
    userEditorGuideTransform = { x: 0, y: 0, scale: 1 };
    applyUserAuthoredViewportProportionsForEditor();
    updateUserDevicePreviewToolbar();
    return;
  }
  if (next === userDevicePreviewMode && next !== "custom") {
    if (!restoreUserDeviceLayout(next)) applyUserDevicePreviewPreset(next);
    updateUserDevicePreviewToolbar();
    return;
  }
  if (isUsersBuilderMode()) saveUserAuthoredViewport();
  if (userDevicePreviewMode !== "custom") saveUserDeviceLayout(userDevicePreviewMode);
  if (userDevicePreviewMode === "custom" && next !== "custom") {
    userDevicePreviewBaseGeometry = { ...userFrameGeometry };
    userDevicePreviewBaseCompact = userDevicePreviewCustomCompact;
  }
  userDevicePreviewMode = next;
  userDevicePreviewCustomCompact = false;
  if (next === "custom") {
    applyUserDevicePreviewInsets();
    if (userDevicePreviewBaseGeometry) {
      const original = userDevicePreviewBaseGeometry;
      userDevicePreviewBaseGeometry = null;
      userDevicePreviewCustomCompact = userDevicePreviewBaseCompact;
      userDevicePreviewBaseCompact = false;
      setUserFrameGeometry(original, { render: true, resizeMap: true });
    }
  } else {
    if (!restoreUserDeviceLayout(next)) applyUserDevicePreviewPreset(next);
  }
  updateUserDevicePreviewToolbar();
  if (isUsersBuilderMode()) saveUserAuthoredViewport();
  const label = USER_DEVICE_PREVIEW_PRESETS[next]?.label || "Custom";
  setUserLayoutStatus(`${label} preview selected. Its device-specific layout is active.`);
}

function adoptCurrentUserDevicePreviewAsCustom() {
  if (userDevicePreviewMode === "custom") return;
  userDevicePreviewMode = "custom";
  userDevicePreviewBaseGeometry = null;
  userDevicePreviewBaseCompact = false;
  userDevicePreviewCustomCompact = true;
  updateUserDevicePreviewToolbar();
}

function restoreUserDevicePreview() {
  if (userDevicePreviewMode === "custom") return;
  const original = userDevicePreviewBaseGeometry;
  const originalCompact = userDevicePreviewBaseCompact;
  userDevicePreviewMode = "custom";
  userDevicePreviewBaseGeometry = null;
  userDevicePreviewBaseCompact = false;
  userDevicePreviewCustomCompact = originalCompact;
  applyUserDevicePreviewInsets();
  if (original) setUserFrameGeometry(original, { render: true, resizeMap: true });
  updateUserDevicePreviewToolbar();
}

function scheduleUserDevicePreviewRefresh() {
  if (userDevicePreviewMode === "custom" || !isUsersBuilderMode()) return;
  // A stage/panel refresh must never regenerate a preset or autofit the
  // Users-authored composition. Its normalized contract is persistent; only
  // an explicit preset selection or explicit Autofit may alter it.
  cancelAnimationFrame(userDevicePreviewRefreshFrame);
  userDevicePreviewRefreshFrame = requestAnimationFrame(() => {
    userDevicePreviewRefreshFrame = 0;
    // This refresh belongs exclusively to the Users builder. If the user
    // changed tabs before the frame ran, applying its cached layout here
    // would overwrite the editor's uniformly scaled guide composition.
    if (!isUsersBuilderMode()) return;
    restoreUserDeviceLayout(userDevicePreviewMode);
    saveUserAuthoredViewport?.();
  });
}
