"use strict";

// Users bounds, spacing, nesting, collision, snapping, grid, and frame constraints.

function userLayoutControlButtonShape(item) {
  const config = normalizeUserLayoutControlConfig(item?.controlConfig);
  if (config.buttonShape !== "inherit") return config.buttonShape;
  const template = userGizmoTemplate(config.gizmoTemplateId) || userGizmoTemplateFromControlId(item?.controlId);
  return template?.shape || userControlAppearance.buttonShape;
}

function userLayoutControlIsButton(item) {
  const entry = getSettingEntry(item?.controlId);
  const definition = userLayoutBuiltinControl(item?.controlId);
  const definitionType = String(definition?.controlType || (definition ? "button" : "")).toLowerCase();
  return Boolean(["button", "icon-button", "submit", "reset"].includes(definitionType || String(entry?.controlType || entry?.type || "").toLowerCase()));
}

function userLayoutControlUsesSquareGeometry(item) {
  return userLayoutControlIsButton(item) && ["circle", "square"].includes(userLayoutControlButtonShape(item));
}

function squareUserLayoutControlCandidate(item, rect, preferredSize = null) {
  if (!item || !rect?.width || !rect?.height) return item;
  const currentWidth = item.width * rect.width;
  const currentHeight = item.height * rect.height;
  const centerX = (item.x + item.width / 2) * rect.width;
  const centerY = (item.y + item.height / 2) * rect.height;
  const maximum = Math.max(1, Math.min(rect.width, rect.height, centerX * 2, (rect.width - centerX) * 2, centerY * 2, (rect.height - centerY) * 2));
  const size = clamp(Number.isFinite(preferredSize) ? preferredSize : Math.min(currentWidth, currentHeight), 42, Math.max(42, maximum));
  item.width = size / rect.width;
  item.height = size / rect.height;
  item.x = clamp((centerX - size / 2) / rect.width, 0, 1 - item.width);
  item.y = clamp((centerY - size / 2) / rect.height, 0, 1 - item.height);
  return item;
}

function constrainInheritedUserButtonGeometriesToShape() {
  if (!["circle", "square"].includes(userControlAppearance.buttonShape)) return false;
  let changed = false;
  userLayoutElements().filter(element => element.type === "section").forEach(section => {
    const content = document.querySelector(`[data-layout-parent-id="${CSS.escape(section.id)}"]`);
    const rect = content?.getBoundingClientRect();
    if (!rect) return;
    (section.controls || []).forEach(item => {
      if (normalizeUserLayoutControlConfig(item.controlConfig).buttonShape !== "inherit" || !userLayoutControlIsButton(item)) return;
      const candidate = squareUserLayoutControlCandidate(cloneUserViewDraftState(item), rect);
      if (!userLayoutControlCandidateFits(section, candidate, item.controlId)) return;
      if (Math.abs(item.width * rect.width - item.height * rect.height) > 0.5) {
        Object.assign(item, candidate);
        changed = true;
      }
    });
  });
  return changed;
}

let userSquareGeometryRenderGuard = false;

function normalizeRenderedSquareUserButtonGeometries() {
  let changed = false;
  userLayoutElements().filter(element => element.type === "section").forEach(section => {
    const content = document.querySelector(`[data-layout-parent-id="${CSS.escape(section.id)}"]`);
    const rect = content?.getBoundingClientRect();
    if (!rect) return;
    (section.controls || []).forEach(item => {
      if (!userLayoutControlUsesSquareGeometry(item)) return;
      if (Math.abs(item.width * rect.width - item.height * rect.height) <= 0.5) return;
      const candidate = squareUserLayoutControlCandidate(cloneUserViewDraftState(item), rect);
      if (!userLayoutControlCandidateFits(section, candidate, item.controlId)) return;
      Object.assign(item, candidate);
      changed = true;
    });
  });
  return changed;
}



function canDropUserLayoutControl(controlId, sectionId, { allowReposition = false } = {}) {
  const section = userLayoutElementById(sectionId);
  if (!section || section.type !== "section" || !controlId) return false;
  const valid = Boolean(userLayoutBuiltinControl(controlId) || getSettingEntry(controlId)?.userSafe);
  if (!valid) return false;
  const placed = findUserLayoutControl(controlId);
  return !placed || allowReposition || placed.section.id !== sectionId;
}

function userLayoutControlCandidateFits(section, candidate, ignoreControlId = "") {
  if (!section || !candidate) return false;
  const ignoredControlIds = ignoreControlId instanceof Set
    ? ignoreControlId
    : new Set(Array.isArray(ignoreControlId) ? ignoreControlId : [ignoreControlId].filter(Boolean));
  if (candidate.x < 0 || candidate.y < 0 || candidate.x + candidate.width > 1.0001 || candidate.y + candidate.height > 1.0001) return false;
  const content = document.querySelector(`[data-layout-parent-id="${CSS.escape(section.id)}"]`);
  const rect = content?.getBoundingClientRect();
  const minimumWidth = userLayoutControlUsesSquareGeometry(candidate) ? 42 : 72;
  if (rect && (candidate.width * rect.width < minimumWidth || candidate.height * rect.height < 42)) return false;
  if (userLayoutFreeTransform || userLayoutSnapMode === "none") return true;
  const clearOfControls = (section.controls || []).every(other => {
    if (!other || ignoredControlIds.has(other.controlId) || other.controlId === candidate.controlId) return true;
    return candidate.x + candidate.width <= other.x + 0.0001 || other.x + other.width <= candidate.x + 0.0001 ||
      candidate.y + candidate.height <= other.y + 0.0001 || other.y + other.height <= candidate.y + 0.0001;
  });
  if (!clearOfControls) return false;
  const children = userLayoutElements().filter(element => element.parentId === section.id);
  return children.every(element => {
    const width = Math.max(1, rect?.width || 1000);
    const height = Math.max(1, rect?.height || 1000);
    const pixelRect = userLayoutElementRect(element, { width, height });
    if (!pixelRect) return true;
    const elementRect = { left: pixelRect.left / width, right: pixelRect.right / width, top: pixelRect.top / height, bottom: pixelRect.bottom / height };
    return candidate.x + candidate.width <= elementRect.left + 0.0001 || elementRect.right <= candidate.x + 0.0001 ||
      candidate.y + candidate.height <= elementRect.top + 0.0001 || elementRect.bottom <= candidate.y + 0.0001;
  });
}

function userLayoutSectionControlsFit(sectionId) {
  const section = userLayoutElementById(sectionId);
  if (!section || !Array.isArray(section.controls)) return true;
  return section.controls.every(item => userLayoutControlCandidateFits(section, item, item.controlId));
}

function captureUserLayoutSectionContents(section, hostMetrics) {
  if (!section || section.type !== "section" || !hostMetrics) return null;
  const content = document.querySelector(`[data-layout-parent-id="${CSS.escape(section.id)}"]`);
  const contentRect = content?.getBoundingClientRect();
  const outerWidth = Math.max(1, section.width * hostMetrics.width);
  const outerHeight = Math.max(1, section.height * hostMetrics.height);
  const contentWidth = Math.max(1, contentRect?.width || outerWidth);
  const contentHeight = Math.max(1, contentRect?.height || outerHeight);
  return {
    contentWidth,
    contentHeight,
    insetWidth: Math.max(0, outerWidth - contentWidth),
    insetHeight: Math.max(0, outerHeight - contentHeight),
    controls: (section.controls || []).map(control => cloneUserViewDraftState(control)),
    children: userLayoutElements()
      .filter(element => element.parentId === section.id)
      .map(element => cloneUserViewDraftState(element))
  };
}

function rebaseUserLayoutSectionContentsForResize(before, after, snapshot, hostMetrics) {
  if (!before || !after || !snapshot || !hostMetrics) return null;
  const shiftX = (after.x - before.x) * hostMetrics.width;
  const shiftY = (after.y - before.y) * hostMetrics.height;
  const nextWidth = Math.max(1, after.width * hostMetrics.width - snapshot.insetWidth);
  const nextHeight = Math.max(1, after.height * hostMetrics.height - snapshot.insetHeight);
  const rebaseBox = item => ({
    ...cloneUserViewDraftState(item),
    x: (item.x * snapshot.contentWidth - shiftX) / nextWidth,
    y: (item.y * snapshot.contentHeight - shiftY) / nextHeight,
    width: item.width * snapshot.contentWidth / nextWidth,
    height: item.height * snapshot.contentHeight / nextHeight
  });
  const rebaseDivider = item => ({
    ...cloneUserViewDraftState(item),
    x1: (item.x1 * snapshot.contentWidth - shiftX) / nextWidth,
    y1: (item.y1 * snapshot.contentHeight - shiftY) / nextHeight,
    x2: (item.x2 * snapshot.contentWidth - shiftX) / nextWidth,
    y2: (item.y2 * snapshot.contentHeight - shiftY) / nextHeight
  });
  const controls = snapshot.controls.map(rebaseBox);
  const children = snapshot.children.map(child => child.type === "section" ? rebaseBox(child) : rebaseDivider(child));
  const boxInside = item => item.x >= -0.0001 && item.y >= -0.0001 && item.x + item.width <= 1.0001 && item.y + item.height <= 1.0001;
  const dividerInside = item => [item.x1, item.y1, item.x2, item.y2].every(value => value >= -0.0001 && value <= 1.0001);
  if (!controls.every(boxInside) || !children.every(child => child.type === "section" ? boxInside(child) : dividerInside(child))) return null;
  return { controls, children };
}

function applyRebasedUserLayoutSectionContents(section, rebased) {
  if (!section || !rebased) return false;
  section.controls = rebased.controls.map(control => cloneUserViewDraftState(control));
  const byId = new Map(rebased.children.map(child => [child.id, child]));
  userLayoutElements().forEach(element => {
    const next = byId.get(element.id);
    if (next) Object.assign(element, cloneUserViewDraftState(next));
  });
  return true;
}

function applyUserLayoutControlPlacement(section, item, targetId = "", mode = "row") {
  const target = section.controls.find(control => control.controlId === targetId);
  const all = [...section.controls, item];
  if (mode === "top-row" || mode === "bottom-row") {
    const newRowHeight = 0.36;
    const remainingHeight = 1 - newRowHeight;
    section.controls.forEach(control => {
      control.y = mode === "top-row" ? newRowHeight + control.y * remainingHeight : control.y * remainingHeight;
      control.height *= remainingHeight;
    });
    Object.assign(item, { x: 0, y: mode === "top-row" ? 0 : remainingHeight, width: 1, height: newRowHeight });
    return;
  }
  if (!target || mode === "row") {
    all.forEach((control, index) => Object.assign(control, { x: index / all.length, y: 0, width: 1 / all.length, height: 1 }));
    return;
  }
  if (mode === "column") {
    all.forEach((control, index) => Object.assign(control, { x: 0, y: index / all.length, width: 1, height: 1 / all.length }));
    return;
  }
  if (mode === "right-column" || mode === "left-column") {
    const newWidth = 0.36;
    section.controls.forEach(control => {
      control.x = mode === "right-column" ? control.x * (1 - newWidth) : newWidth + control.x * (1 - newWidth);
      control.width *= 1 - newWidth;
    });
    Object.assign(item, { x: mode === "right-column" ? 1 - newWidth : 0, y: 0, width: newWidth, height: 1 });
    return;
  }
  const original = { x: target.x, y: target.y, width: target.width, height: target.height };
  if (mode === "right" || mode === "left") {
    const half = original.width / 2;
    Object.assign(target, { x: mode === "right" ? original.x : original.x + half, width: half });
    Object.assign(item, { x: mode === "right" ? original.x + half : original.x, y: original.y, width: half, height: original.height });
    return;
  }
  const half = original.height / 2;
  Object.assign(target, { y: mode === "below" ? original.y : original.y + half, height: half });
  Object.assign(item, { x: original.x, y: mode === "below" ? original.y + half : original.y, width: original.width, height: half });
}

function preferredUserLayoutControlSize(controlId, rect) {
  const definition = userLayoutBuiltinControl(controlId);
  const type = String(getSettingEntry(controlId)?.type || definition?.controlType || (definition ? "button" : "control")).toLowerCase();
  const widthPx = ["range", "select", "dropdown"].includes(type) ? 230
    : ["color", "text", "number"].includes(type) ? 190
      : 170;
  const heightPx = type === "range" ? 58 : ["select", "dropdown", "text", "number", "color"].includes(type) ? 52 : 46;
  return {
    width: clamp(widthPx / Math.max(1, rect?.width || widthPx), 0.12, 1),
    height: clamp(heightPx / Math.max(1, rect?.height || heightPx), 0.08, 1)
  };
}

function placeUserLayoutControlInOpenSpace(section, item, { anchorX = 0, anchorY = 0 } = {}) {
  const content = document.querySelector(`[data-layout-parent-id="${CSS.escape(section.id)}"]`);
  const rect = content?.getBoundingClientRect();
  const preferred = preferredUserLayoutControlSize(item.controlId, rect);
  const widths = [...new Set([preferred.width, Math.min(1, preferred.width * 1.25), 0.5, 1])];
  const heights = [...new Set([preferred.height, Math.min(1, preferred.height * 1.2), 0.25])];
  for (const height of heights) {
    for (const width of widths) {
      const candidates = [];
      for (let y = 0; y + height <= 1.0001; y += 0.04) {
        for (let x = 0; x + width <= 1.0001; x += 0.04) {
          const candidate = { ...item, x, y, width, height };
          const centerX = x + width / 2;
          const centerY = y + height / 2;
          candidates.push({ candidate, distance: Math.hypot(centerX - anchorX, centerY - anchorY) });
        }
      }
      candidates.sort((a, b) => a.distance - b.distance);
      const match = candidates.find(({ candidate }) => userLayoutControlCandidateFits(section, candidate, item.controlId));
      if (match) {
        Object.assign(item, match.candidate);
        return true;
      }
    }
  }
  return false;
}



function applyUserLayoutControlSnap(candidate, section, rect, ignoreControlId = "") {
  if (!candidate || !section || !rect || userLayoutFreeTransform || userLayoutSnapMode === "none") return candidate;
  if (userLayoutSnapMode === "grid" || userLayoutSnapMode === "smart") {
    const grid = 12;
    candidate.x = clamp(Math.round(candidate.x * rect.width / grid) * grid / rect.width, 0, 1 - candidate.width);
    candidate.y = clamp(Math.round(candidate.y * rect.height / grid) * grid / rect.height, 0, 1 - candidate.height);
  }
  if (userLayoutSnapMode !== "objects" && userLayoutSnapMode !== "smart") return candidate;
  const threshold = 8;
  const gap = userLayoutSpacing("--user-layout-setting-gap", 8);
  const candidatePixels = {
    left: candidate.x * rect.width,
    right: (candidate.x + candidate.width) * rect.width,
    top: candidate.y * rect.height,
    bottom: (candidate.y + candidate.height) * rect.height
  };
  candidatePixels.centerX = (candidatePixels.left + candidatePixels.right) / 2;
  candidatePixels.centerY = (candidatePixels.top + candidatePixels.bottom) / 2;
  const xDeltas = [];
  const yDeltas = [];
  (section.controls || []).forEach(other => {
    if (!other || other.controlId === ignoreControlId || other.controlId === candidate.controlId) return;
    const otherPixels = {
      left: other.x * rect.width,
      right: (other.x + other.width) * rect.width,
      top: other.y * rect.height,
      bottom: (other.y + other.height) * rect.height
    };
    otherPixels.centerX = (otherPixels.left + otherPixels.right) / 2;
    otherPixels.centerY = (otherPixels.top + otherPixels.bottom) / 2;
    xDeltas.push(
      otherPixels.left - candidatePixels.left,
      otherPixels.right - candidatePixels.right,
      otherPixels.centerX - candidatePixels.centerX,
      otherPixels.right + gap - candidatePixels.left,
      otherPixels.left - gap - candidatePixels.right
    );
    yDeltas.push(
      otherPixels.top - candidatePixels.top,
      otherPixels.bottom - candidatePixels.bottom,
      otherPixels.centerY - candidatePixels.centerY,
      otherPixels.bottom + gap - candidatePixels.top,
      otherPixels.top - gap - candidatePixels.bottom
    );
  });
  const closest = deltas => deltas
    .filter(delta => Math.abs(delta) <= threshold)
    .sort((a, b) => Math.abs(a) - Math.abs(b))[0];
  const snapX = closest(xDeltas);
  const snapY = closest(yDeltas);
  if (Number.isFinite(snapX)) candidate.x = clamp(candidate.x + snapX / rect.width, 0, 1 - candidate.width);
  if (Number.isFinite(snapY)) candidate.y = clamp(candidate.y + snapY / rect.height, 0, 1 - candidate.height);
  return candidate;
}



function userLayoutSpacing(name, fallback) {
  const stage = els.mapCanvas?.closest?.(".map-stage");
  const value = Number.parseFloat(getComputedStyle(stage || document.documentElement).getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

function userLayoutGapFor(element) {
  if (element?.type === "divider") return userLayoutSpacing("--user-layout-divider-gap", 8);
  if (element?.parentId) return userLayoutSpacing("--user-layout-subsection-gap", 10);
  return userLayoutSpacing("--user-layout-section-gap", 12);
}

function userLayoutFrameGap() {
  return userLayoutSpacing("--user-layout-frame-gap", 12);
}

function selectedUserLayoutElements() {
  return userLayoutElements().filter(element => selectedUserLayoutElementIds.has(element.id));
}



function liveUserLayoutHost(element) {
  if (!element) return null;
  return element.parentId
    ? document.querySelector(`[data-layout-parent-id="${CSS.escape(element.parentId)}"]`)
    : document.querySelector(`.user-layout-region-${element.region}`);
}

function translateUserLayoutElement(element, dx, dy) {
  if (element.type === "section") {
    element.x += dx;
    element.y += dy;
    return;
  }
  element.x1 += dx; element.x2 += dx; element.y1 += dy; element.y2 += dy;
}

function arrangeSelectedUserControls(action) {
  const placements = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
  if (placements.length < 2) return false;
  const section = placements[0].section;
  if (placements.some(placement => placement.section.id !== section.id)) {
    setUserLayoutStatus("Control alignment requires controls from the same section.", true);
    return false;
  }
  const before = new Map(placements.map(({ item }) => [item.controlId, cloneUserViewDraftState(item)]));
  const items = placements.map(placement => placement.item);
  const left = Math.min(...items.map(item => item.x));
  const right = Math.max(...items.map(item => item.x + item.width));
  const top = Math.min(...items.map(item => item.y));
  const bottom = Math.max(...items.map(item => item.y + item.height));
  if (["left", "right", "center", "top", "bottom", "middle"].includes(action)) {
    items.forEach(item => {
      if (action === "left") item.x = left;
      if (action === "right") item.x = right - item.width;
      if (action === "center") item.x = (left + right - item.width) / 2;
      if (action === "top") item.y = top;
      if (action === "bottom") item.y = bottom - item.height;
      if (action === "middle") item.y = (top + bottom - item.height) / 2;
    });
  } else {
    const horizontal = action.endsWith("x");
    const sorted = [...items].sort((a, b) => horizontal ? (a.x + a.width / 2) - (b.x + b.width / 2) : (a.y + a.height / 2) - (b.y + b.height / 2));
    if (action.startsWith("distribute")) {
      const first = horizontal ? sorted[0].x + sorted[0].width / 2 : sorted[0].y + sorted[0].height / 2;
      const last = horizontal ? sorted.at(-1).x + sorted.at(-1).width / 2 : sorted.at(-1).y + sorted.at(-1).height / 2;
      sorted.forEach((item, index) => {
        const center = first + (last - first) * index / Math.max(1, sorted.length - 1);
        if (horizontal) item.x = center - item.width / 2;
        else item.y = center - item.height / 2;
      });
    } else {
      const occupied = sorted.reduce((sum, item) => sum + (horizontal ? item.width : item.height), 0);
      const extent = horizontal ? right - left : bottom - top;
      const gap = Math.max(0, (extent - occupied) / Math.max(1, sorted.length - 1));
      let cursor = horizontal ? left : top;
      sorted.forEach(item => {
        if (horizontal) item.x = cursor;
        else item.y = cursor;
        cursor += (horizontal ? item.width : item.height) + gap;
      });
    }
  }
  if (!items.every(item => userLayoutControlCandidateFits(section, item, item.controlId))) {
    before.forEach((state, id) => Object.assign(findUserLayoutControl(id)?.item || {}, state));
    setUserLayoutStatus("That alignment would overlap controls.", true);
    renderUserFrameLayout();
    return false;
  }
  renderUserFrameLayout();
  updateUserGeometryFields();
  pushUserBuilderHistory(`Arrange User UI controls: ${action}`);
  return true;
}

function arrangeSelectedUserLayout(action) {
  if (selectedUserLayoutControlIds.size >= 2) return arrangeSelectedUserControls(action);
  const before = new Map(selectedUserLayoutElements().map(element => [element.id, cloneUserViewDraftState(element)]));
  const groups = new Map();
  selectedUserLayoutElements().forEach(element => {
    const key = `${element.region}:${element.parentId || "root"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(element);
  });
  let changed = false;
  groups.forEach(elements => {
    if (elements.length < 2) return;
    const host = liveUserLayoutHost(elements[0]);
    const metrics = userLayoutHostMetrics(host);
    if (!metrics) return;
    const data = elements.map(element => ({ element, rect: userLayoutElementRect(element, metrics) }));
    const left = Math.min(...data.map(item => item.rect.left));
    const right = Math.max(...data.map(item => item.rect.right));
    const top = Math.min(...data.map(item => item.rect.top));
    const bottom = Math.max(...data.map(item => item.rect.bottom));
    if (["left", "right", "center", "top", "bottom", "middle"].includes(action)) {
      data.forEach(item => {
        let dx = 0;
        let dy = 0;
        if (action === "left") dx = (left - item.rect.left) / metrics.width;
        if (action === "right") dx = (right - item.rect.right) / metrics.width;
        if (action === "center") dx = ((left + right) / 2 - (item.rect.left + item.rect.right) / 2) / metrics.width;
        if (action === "top") dy = (top - item.rect.top) / metrics.height;
        if (action === "bottom") dy = (bottom - item.rect.bottom) / metrics.height;
        if (action === "middle") dy = ((top + bottom) / 2 - (item.rect.top + item.rect.bottom) / 2) / metrics.height;
        translateUserLayoutElement(item.element, dx, dy);
      });
      changed = true;
      return;
    }
    const horizontal = action.endsWith("x");
    const sorted = [...data].sort((a, b) => horizontal
      ? (a.rect.left + a.rect.right) - (b.rect.left + b.rect.right)
      : (a.rect.top + a.rect.bottom) - (b.rect.top + b.rect.bottom));
    if (action.startsWith("distribute")) {
      const firstCenter = horizontal ? (sorted[0].rect.left + sorted[0].rect.right) / 2 : (sorted[0].rect.top + sorted[0].rect.bottom) / 2;
      const lastCenter = horizontal ? (sorted.at(-1).rect.left + sorted.at(-1).rect.right) / 2 : (sorted.at(-1).rect.top + sorted.at(-1).rect.bottom) / 2;
      sorted.forEach((item, index) => {
        const target = firstCenter + ((lastCenter - firstCenter) * index / Math.max(1, sorted.length - 1));
        const current = horizontal ? (item.rect.left + item.rect.right) / 2 : (item.rect.top + item.rect.bottom) / 2;
        translateUserLayoutElement(item.element, horizontal ? (target - current) / metrics.width : 0, horizontal ? 0 : (target - current) / metrics.height);
      });
      changed = true;
      return;
    }
    const occupied = sorted.reduce((sum, item) => sum + (horizontal ? item.rect.right - item.rect.left : item.rect.bottom - item.rect.top), 0);
    const extent = horizontal ? right - left : bottom - top;
    const gap = Math.max(0, (extent - occupied) / Math.max(1, sorted.length - 1));
    let cursor = horizontal ? left : top;
    sorted.forEach(item => {
      const start = horizontal ? item.rect.left : item.rect.top;
      translateUserLayoutElement(item.element, horizontal ? (cursor - start) / metrics.width : 0, horizontal ? 0 : (cursor - start) / metrics.height);
      cursor += (horizontal ? item.rect.right - item.rect.left : item.rect.bottom - item.rect.top) + gap;
    });
    changed = true;
  });
  if (!changed) return false;
  const valid = selectedUserLayoutElements().every(element => userLayoutCandidateFits(element, liveUserLayoutHost(element), element.id));
  if (!valid) {
    before.forEach((state, id) => Object.assign(userLayoutElementById(id), state));
    setUserLayoutStatus("That arrangement would overlap controls or their spacing margins.", true);
    renderUserFrameLayout();
    return false;
  }
  renderUserFrameLayout();
  updateUserGeometryFields();
  pushUserBuilderHistory(`Arrange User UI objects: ${action}`);
  return true;
}

function arrangeSelectedUserLayoutGrid(columns, gap) {
  if (selectedUserLayoutControlIds.size >= 2) {
    const placements = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
    const section = placements[0]?.section;
    if (!section || placements.some(placement => placement.section.id !== section.id)) return false;
    const content = document.querySelector(`[data-layout-parent-id="${CSS.escape(section.id)}"]`);
    const rect = content?.getBoundingClientRect();
    if (!rect) return false;
    const cols = clamp(Number.isFinite(columns) ? Math.round(columns) : 2, 1, placements.length);
    const rows = Math.ceil(placements.length / cols);
    const gridGap = Math.max(
      userLayoutSpacing("--user-layout-setting-gap", 8),
      clamp(Number(gap) || 0, 0, 80)
    );
    const ordered = [...placements].sort((a, b) => (a.item.y - b.item.y) || (a.item.x - b.item.x));
    const preferredSizes = ordered.map(({ item }) => preferredUserLayoutControlSize(item.controlId, rect));
    let cellWidth = Math.max(72, ...preferredSizes.map(size => size.width * rect.width));
    let cellHeight = Math.max(42, ...preferredSizes.map(size => size.height * rect.height));
    const availableCellWidth = (rect.width - gridGap * (cols - 1)) / cols;
    const availableCellHeight = (rect.height - gridGap * (rows - 1)) / rows;
    cellWidth = Math.min(cellWidth, availableCellWidth);
    cellHeight = Math.min(cellHeight, availableCellHeight);
    if (cellWidth < 72 || cellHeight < 42) {
      setUserLayoutStatus("That grid needs a larger section or fewer columns.", true);
      return false;
    }
    const gridWidth = cols * cellWidth + (cols - 1) * gridGap;
    const gridHeight = rows * cellHeight + (rows - 1) * gridGap;
    const currentLeft = Math.min(...ordered.map(({ item }) => item.x * rect.width));
    const currentTop = Math.min(...ordered.map(({ item }) => item.y * rect.height));
    const originX = clamp(currentLeft, 0, Math.max(0, rect.width - gridWidth));
    const originY = clamp(currentTop, 0, Math.max(0, rect.height - gridHeight));
    const selectedIds = new Set(ordered.map(({ item }) => item.controlId));
    const before = new Map(placements.map(({ item }) => [item.controlId, cloneUserViewDraftState(item)]));
    ordered.forEach(({ item }, index) => Object.assign(item, {
      x: (originX + (index % cols) * (cellWidth + gridGap)) / rect.width,
      y: (originY + Math.floor(index / cols) * (cellHeight + gridGap)) / rect.height,
      width: cellWidth / rect.width,
      height: cellHeight / rect.height
    }));
    if (!ordered.every(({ item }) => userLayoutControlCandidateFits(section, item, selectedIds))) {
      before.forEach((state, id) => Object.assign(findUserLayoutControl(id)?.item || {}, state));
      setUserLayoutStatus("The grid would overlap another control or subsection.", true);
      renderUserFrameLayout();
      return false;
    }
    renderUserFrameLayout();
    updateUserGeometryFields();
    setUserLayoutStatus(`${ordered.length} controls arranged in a ${cols}-column grid.`);
    pushUserBuilderHistory("Arrange User UI controls as a grid");
    return true;
  }
  const elements = selectedUserLayoutElements();
  if (elements.length < 2) return false;
  const first = elements[0];
  const before = new Map(elements.map(element => [element.id, cloneUserViewDraftState(element)]));
  if (elements.some(element => element.region !== first.region || (element.parentId || "") !== (first.parentId || ""))) {
    setUserLayoutStatus("Grid arrangement requires objects from the same frame area or section.", true);
    return false;
  }
  const host = liveUserLayoutHost(first);
  const metrics = userLayoutHostMetrics(host);
  if (!metrics) return false;
  const data = elements
    .map(element => ({ element, rect: userLayoutElementRect(element, metrics) }))
    .sort((a, b) => (a.rect.top - b.rect.top) || (a.rect.left - b.rect.left));
  const bounds = {
    left: Math.min(...data.map(item => item.rect.left)),
    top: Math.min(...data.map(item => item.rect.top)),
    right: Math.max(...data.map(item => item.rect.right)),
    bottom: Math.max(...data.map(item => item.rect.bottom))
  };
  const cols = clamp(Number.isFinite(columns) ? Math.round(columns) : 2, 1, Math.min(12, elements.length));
  const rows = Math.ceil(elements.length / cols);
  const requiredGap = Math.max(...elements.map(element => userLayoutGapFor(element)));
  const gridGap = Math.max(requiredGap, clamp(Number(gap) || 0, 0, 80));
  const objectWidth = Math.max(...data.map(item => item.rect.right - item.rect.left));
  const objectHeight = Math.max(...data.map(item => item.rect.bottom - item.rect.top));
  const cellWidth = objectWidth + gridGap;
  const cellHeight = objectHeight + gridGap;
  const gridWidth = cols * objectWidth + (cols - 1) * gridGap;
  const gridHeight = rows * objectHeight + (rows - 1) * gridGap;
  if (gridWidth > metrics.width || gridHeight > metrics.height) {
    setUserLayoutStatus("Those objects need a larger frame area, fewer columns, or a smaller gap.", true);
    return false;
  }
  const originX = clamp(bounds.left, 0, metrics.width - gridWidth);
  const originY = clamp(bounds.top, 0, metrics.height - gridHeight);
  data.forEach((item, index) => {
    const column = index % cols;
    const row = Math.floor(index / cols);
    const targetLeft = originX + column * cellWidth;
    const targetTop = originY + row * cellHeight;
    translateUserLayoutElement(item.element, (targetLeft - item.rect.left) / metrics.width, (targetTop - item.rect.top) / metrics.height);
  });
  const selectedIds = new Set(elements.map(element => element.id));
  if (!elements.every(element => userLayoutCandidateFits(element, liveUserLayoutHost(element), selectedIds))) {
    before.forEach((state, id) => Object.assign(userLayoutElementById(id), state));
    setUserLayoutStatus("The selected objects do not fit that grid without overlapping.", true);
    renderUserFrameLayout();
    return false;
  }
  renderUserFrameLayout();
  updateUserGeometryFields();
  setUserLayoutStatus(`${elements.length} objects arranged in a ${cols}-column grid.`);
  pushUserBuilderHistory(`Arrange ${elements.length} User UI objects as a grid`);
  return true;
}

function applyUserLayoutSnap(candidate, metrics) {
  if (!candidate || !metrics || userLayoutFreeTransform || userLayoutSnapMode === "none") return candidate;
  const grid = 12;
  const snapUnit = (value, size, enabled) => enabled ? Math.round(value * size / grid) * grid / size : value;
  if (userLayoutSnapMode === "grid" || userLayoutSnapMode === "smart") {
    if (candidate.type === "section") {
      candidate.x = clamp(snapUnit(candidate.x, metrics.width, true), 0, 1 - candidate.width);
      candidate.y = clamp(snapUnit(candidate.y, metrics.height, true), 0, 1 - candidate.height);
    } else {
      candidate.x1 = snapUnit(candidate.x1, metrics.width, true);
      candidate.y1 = snapUnit(candidate.y1, metrics.height, true);
      candidate.x2 = snapUnit(candidate.x2, metrics.width, true);
      candidate.y2 = snapUnit(candidate.y2, metrics.height, true);
    }
  }
  if (candidate.type !== "section" || (userLayoutSnapMode !== "objects" && userLayoutSnapMode !== "smart")) return candidate;
  const threshold = 8;
  const candidateRect = userLayoutElementRect(candidate, metrics);
  const siblings = userLayoutElements().filter(element => element.id !== candidate.id && element.region === candidate.region && (element.parentId || "") === (candidate.parentId || ""));
  siblings.forEach(sibling => {
    const rect = userLayoutElementRect(sibling, metrics);
    const xPairs = [[candidateRect.left, rect.left], [candidateRect.right, rect.right], [(candidateRect.left + candidateRect.right) / 2, (rect.left + rect.right) / 2]];
    const yPairs = [[candidateRect.top, rect.top], [candidateRect.bottom, rect.bottom], [(candidateRect.top + candidateRect.bottom) / 2, (rect.top + rect.bottom) / 2]];
    const xMatch = xPairs.find(pair => Math.abs(pair[0] - pair[1]) <= threshold);
    const yMatch = yPairs.find(pair => Math.abs(pair[0] - pair[1]) <= threshold);
    if (xMatch) candidate.x = clamp(candidate.x + (xMatch[1] - xMatch[0]) / metrics.width, 0, 1 - candidate.width);
    if (yMatch) candidate.y = clamp(candidate.y + (yMatch[1] - yMatch[0]) / metrics.height, 0, 1 - candidate.height);
  });
  return candidate;
}

function userGeometryValuesForElement(element, metrics) {
  const rect = userLayoutElementRect(element, metrics);
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.right - rect.left),
    height: Math.round(rect.bottom - rect.top)
  };
}



function userLayoutHostMetrics(host) {
  if (!host) return null;
  const isRegion = host.classList.contains("user-layout-region");
  const padding = isRegion ? userLayoutFrameGap() : 0;
  return {
    host,
    padding,
    width: Math.max(1, host.clientWidth - padding * 2),
    height: Math.max(1, host.clientHeight - padding * 2)
  };
}

function userLayoutElementRect(element, metrics) {
  if (!element || !metrics) return null;
  if (element.type === "section") {
    return {
      left: element.x * metrics.width,
      top: element.y * metrics.height,
      right: (element.x + element.width) * metrics.width,
      bottom: (element.y + element.height) * metrics.height
    };
  }
  const x1 = element.x1 * metrics.width;
  const y1 = element.y1 * metrics.height;
  const x2 = element.x2 * metrics.width;
  const y2 = element.y2 * metrics.height;
  return {
    left: Math.min(x1, x2) - 2,
    top: Math.min(y1, y2) - 2,
    right: Math.max(x1, x2) + 2,
    bottom: Math.max(y1, y2) + 2
  };
}

function expandedUserLayoutRect(rect, amount) {
  return {
    left: rect.left - amount,
    top: rect.top - amount,
    right: rect.right + amount,
    bottom: rect.bottom + amount
  };
}

function userLayoutRectsOverlap(first, second) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

function userLayoutCandidateFits(candidate, host, ignoreId = "") {
  const metrics = userLayoutHostMetrics(host);
  const rect = userLayoutElementRect(candidate, metrics);
  if (!metrics || !rect) return false;
  const ignoredIds = ignoreId instanceof Set
    ? ignoreId
    : new Set(Array.isArray(ignoreId) ? ignoreId : [ignoreId].filter(Boolean));
  const ownGap = userLayoutGapFor(candidate);
  if (rect.left < 0 || rect.top < 0 || rect.right > metrics.width || rect.bottom > metrics.height) return false;
  if (userLayoutFreeTransform) return true;
  const siblings = userLayoutElements().filter(element =>
    !element.frameHost &&
    !ignoredIds.has(element.id) &&
    element.region === candidate.region &&
    (element.parentId || "") === (candidate.parentId || "")
  );
  const clearOfLayout = !siblings.some(element => {
    const otherRect = userLayoutElementRect(element, metrics);
    const gap = Math.max(ownGap, userLayoutGapFor(element));
    return userLayoutRectsOverlap(expandedUserLayoutRect(rect, gap / 2), expandedUserLayoutRect(otherRect, gap / 2));
  });
  if (!clearOfLayout || !candidate.parentId) return clearOfLayout;
  const parent = userLayoutElementById(candidate.parentId);
  return (parent?.controls || []).every(control => {
    const controlRect = {
      left: control.x * metrics.width,
      top: control.y * metrics.height,
      right: (control.x + control.width) * metrics.width,
      bottom: (control.y + control.height) * metrics.height
    };
    return !userLayoutRectsOverlap(expandedUserLayoutRect(rect, ownGap / 2), expandedUserLayoutRect(controlRect, ownGap / 2));
  });
}



function userLayoutPointInHost(event, host) {
  const rect = host.getBoundingClientRect();
  const metrics = userLayoutHostMetrics(host);
  return {
    x: clamp(event.clientX - rect.left - metrics.padding, 0, metrics.width),
    y: clamp(event.clientY - rect.top - metrics.padding, 0, metrics.height)
  };
}

function userLayoutPathLength(points) {
  return points.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

function nextUserLayoutId(type) {
  return `layout-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}



function userLayoutSectionMinimumAxisSize(section, axis, visited = new Set()) {
  if (!section || section.type !== "section" || visited.has(section.id)) return axis === "x" ? 64 : 44;
  visited.add(section.id);
  let required = axis === "x" ? 64 : 44;
  const controls = Array.isArray(section.controls) ? section.controls : [];
  controls.forEach(control => {
    const span = axis === "x" ? Number(control.width) : Number(control.height);
    if (!Number.isFinite(span) || span <= 0) return;
    required = Math.max(required, (axis === "x" ? 72 : 42) / span);
  });
  userLayoutElements().filter(element => element.parentId === section.id).forEach(child => {
    if (child.type === "section") {
      const span = axis === "x" ? Number(child.width) : Number(child.height);
      if (!Number.isFinite(span) || span <= 0) return;
      required = Math.max(required, userLayoutSectionMinimumAxisSize(child, axis, visited) / span);
      return;
    }
    const span = axis === "x" ? Math.abs(Number(child.x2) - Number(child.x1)) : Math.abs(Number(child.y2) - Number(child.y1));
    if (Number.isFinite(span) && span > 0.02) required = Math.max(required, 28 / span);
  });
  if (axis === "y") required += 26;
  return required + userLayoutSpacing("--user-layout-subsection-gap", 10) * 2;
}

function userLayoutMinimumInset(edge, stageWidth, stageHeight, fallback) {
  const axisIsHorizontal = edge === "left" || edge === "right";
  const frameGap = userLayoutFrameGap();
  const topLevel = userLayoutElements().filter(element => element.region === edge && !element.parentId && !element.frameHost);
  if (!topLevel.length) return fallback;
  const liveHost = document.querySelector(`.user-layout-region-${edge}`);
  const liveMetrics = userLayoutHostMetrics(liveHost);
  if (liveMetrics) {
    const requiredExtent = Math.max(...topLevel.map(element => {
      const rect = userLayoutElementRect(element, liveMetrics);
      return axisIsHorizontal ? rect?.right || 0 : rect?.bottom || 0;
    }));
    const liveRequired = Math.ceil(requiredExtent + frameGap * 2);
    const axisLimit = axisIsHorizontal ? stageWidth / 3 : stageHeight / 3;
    return Math.ceil(clamp(Math.max(fallback, liveRequired), fallback, Math.max(fallback, axisLimit)));
  }
  let required = fallback;
  topLevel.forEach(element => {
    if (element.type === "section") {
      const normalizedSize = axisIsHorizontal ? element.width : element.height;
      const minimumSize = userLayoutSectionMinimumAxisSize(element, axisIsHorizontal ? "x" : "y");
      required = Math.max(required, frameGap * 2 + minimumSize / Math.max(0.04, normalizedSize));
      return;
    }
    const span = axisIsHorizontal ? Math.abs(element.x2 - element.x1) : Math.abs(element.y2 - element.y1);
    const minimumSize = span > 0.08 ? 28 / span : 8;
    required = Math.max(required, frameGap * 2 + minimumSize);
  });
  const axisLimit = axisIsHorizontal ? stageWidth / 3 : stageHeight / 3;
  return Math.ceil(clamp(required, fallback, Math.max(fallback, axisLimit)));
}

function captureUserFrameLayoutPixelSnapshot() {
  const snapshot = new Map();
  userLayoutElements().filter(element => !element.parentId && !element.frameHost).forEach(element => {
    const host = document.querySelector(`.user-layout-region-${element.region}`);
    const metrics = userLayoutHostMetrics(host);
    if (!metrics) return;
    if (element.type === "section") {
      snapshot.set(element.id, {
        type: "section", region: element.region,
        left: element.x * metrics.width, top: element.y * metrics.height,
        width: element.width * metrics.width, height: element.height * metrics.height,
        spaceRatioX: metrics.width > element.width * metrics.width
          ? (element.x * metrics.width) / (metrics.width - element.width * metrics.width)
          : 0,
        spaceRatioY: metrics.height > element.height * metrics.height
          ? (element.y * metrics.height) / (metrics.height - element.height * metrics.height)
          : 0
      });
      return;
    }
    snapshot.set(element.id, {
      type: "divider", region: element.region,
      x1: element.x1 * metrics.width, y1: element.y1 * metrics.height,
      x2: element.x2 * metrics.width, y2: element.y2 * metrics.height
    });
  });
  return snapshot;
}

function rebaseUserFrameLayoutFromPixelSnapshot(snapshot) {
  if (!(snapshot instanceof Map) || snapshot.size === 0) return true;
  const pending = [];
  for (const [id, saved] of snapshot) {
    const element = userLayoutElementById(id);
    const host = document.querySelector(`.user-layout-region-${saved.region}`);
    const metrics = userLayoutHostMetrics(host);
    if (!element || !metrics) continue;
    if (saved.type === "section") {
      if (saved.width > metrics.width + 0.5 || saved.height > metrics.height + 0.5) return false;
      const width = saved.width / metrics.width;
      const height = saved.height / metrics.height;
      pending.push([element, {
        x: clamp((Math.max(0, metrics.width - saved.width) * saved.spaceRatioX) / metrics.width, 0, 1 - width),
        y: clamp((Math.max(0, metrics.height - saved.height) * saved.spaceRatioY) / metrics.height, 0, 1 - height), width, height
      }]);
      continue;
    }
    const minX = Math.min(saved.x1, saved.x2);
    const maxX = Math.max(saved.x1, saved.x2);
    const minY = Math.min(saved.y1, saved.y2);
    const maxY = Math.max(saved.y1, saved.y2);
    if (maxX - minX > metrics.width + 0.5 || maxY - minY > metrics.height + 0.5) return false;
    const shiftX = minX < 0 ? -minX : maxX > metrics.width ? metrics.width - maxX : 0;
    const shiftY = minY < 0 ? -minY : maxY > metrics.height ? metrics.height - maxY : 0;
    pending.push([element, {
      x1: (saved.x1 + shiftX) / metrics.width, y1: (saved.y1 + shiftY) / metrics.height,
      x2: (saved.x2 + shiftX) / metrics.width, y2: (saved.y2 + shiftY) / metrics.height
    }]);
  }
  pending.forEach(([element, next]) => Object.assign(element, next));
  return true;
}

function frameGeometryBounds({ ignoreLayout = false } = {}) {
  const rect = els.mapCanvas?.closest(".map-stage")?.getBoundingClientRect?.();
  const stageWidth = rect?.width || window.innerWidth;
  const stageHeight = rect?.height || window.innerHeight;
  const width = Math.max(1, stageWidth - userDevicePreviewInsets.left - userDevicePreviewInsets.right);
  const height = Math.max(1, stageHeight - userDevicePreviewInsets.top - userDevicePreviewInsets.bottom);
  const minEdgeGap = Math.max(8, Math.min(28, Math.floor(width / 6), Math.floor(height / 6)));
  const minByEdge = ignoreLayout ? { top: minEdgeGap, right: minEdgeGap, bottom: minEdgeGap, left: minEdgeGap } : {
    top: userLayoutMinimumInset("top", width, height, minEdgeGap),
    right: userLayoutMinimumInset("right", width, height, minEdgeGap),
    bottom: userLayoutMinimumInset("bottom", width, height, minEdgeGap),
    left: userLayoutMinimumInset("left", width, height, minEdgeGap)
  };
  return {
    min: minEdgeGap,
    minByEdge,
    maxHorizontalTotal: userDevicePreviewMode === "custom" && !userDevicePreviewCustomCompact
      ? Math.max(minByEdge.left + minByEdge.right, Math.floor(width / 3))
      : Math.max(minByEdge.left + minByEdge.right, width - Math.min(240, Math.floor(width * 0.28))),
    maxVerticalTotal: userDevicePreviewMode === "custom" && !userDevicePreviewCustomCompact
      ? Math.max(minByEdge.top + minByEdge.bottom, Math.floor(height / 3))
      : Math.max(minByEdge.top + minByEdge.bottom, height - Math.min(180, Math.floor(height * 0.28)))
  };
}



function constrainUserFrameGeometry(nextGeometry, activeEdges = [], { ignoreLayout = false } = {}) {
  const bounds = frameGeometryBounds({ ignoreLayout });
  const limits = { top: false, right: false, bottom: false, left: false };
  const next = Object.fromEntries(["top", "right", "bottom", "left"].map(edge => [
    edge,
    Math.max(bounds.minByEdge[edge], Math.round(Number(nextGeometry?.[edge]) || 0))
  ]));
  activeEdges.forEach(edge => {
    if (Number(nextGeometry?.[edge]) < bounds.minByEdge[edge]) limits[edge] = true;
  });
  const constrainAxis = (first, second, maxTotal) => {
    const total = next[first] + next[second];
    if (total <= maxTotal) return;
    const firstActive = activeEdges.includes(first);
    const secondActive = activeEdges.includes(second);
    if (firstActive && !secondActive) {
      next[first] = Math.max(bounds.minByEdge[first], maxTotal - next[second]);
      limits[first] = true;
      return;
    }
    if (secondActive && !firstActive) {
      next[second] = Math.max(bounds.minByEdge[second], maxTotal - next[first]);
      limits[second] = true;
      return;
    }
    const scale = maxTotal > 0 ? maxTotal / total : 0;
    next[first] = Math.max(bounds.minByEdge[first], Math.floor(next[first] * scale));
    next[second] = Math.max(bounds.minByEdge[second], maxTotal - next[first]);
    limits[first] = true;
    limits[second] = true;
  };
  constrainAxis("left", "right", bounds.maxHorizontalTotal);
  constrainAxis("top", "bottom", bounds.maxVerticalTotal);
  return { geometry: next, limits };
}
