"use strict";

// Users selection, drag/drop, resize, drawing, keyboard transforms, and previews.

let imagePreviewExitTimer = 0;
let imagePreviewEnterTimer = 0;

function clearUserBuilderDropzoneState() {
  userQueryAll(".is-user-builder-drop-target").forEach(node => {
    node.classList.remove("is-user-builder-drop-target");
  });
}

function clearUserBuilderDragState() {
  clearUserBuilderDropzoneState();
  userBuilderDragState?.sourceElement?.classList.remove("is-user-builder-dragging");
  userBuilderDragState = null;
  document.body.classList.remove("is-user-builder-dragging-control");
}

function clearUserBuilderPointerDragState() {
  const state = userBuilderPointerDragState;
  clearTimeout(state?.zoneTimer);
  state?.sourceElement?.classList.remove("is-user-builder-dragging");
  state?.ghost?.remove();
  state?.preview?.remove();
  state?.highlight?.classList.remove("is-user-builder-drop-target");
  state?.frameRegionNode?.classList.remove("is-user-builder-drop-target");
  userQueryAll(".is-gizmo-binding-compatible, .is-gizmo-binding-incompatible, .is-gizmo-binding-hover, .is-gizmo-binding-rejected, .is-gizmo-style-replace-target, .is-gizmo-style-replace-rejected").forEach(node => {
    node.classList.remove("is-gizmo-binding-compatible", "is-gizmo-binding-incompatible", "is-gizmo-binding-hover", "is-gizmo-binding-rejected", "is-gizmo-style-replace-target", "is-gizmo-style-replace-rejected");
  });
  userBuilderPointerDragState = null;
  document.body.classList.remove("is-user-builder-dragging-control");
}

function userGizmoStyleFamily(definition) {
  const role = String(definition?.kind || definition?.controlType || definition?.type || "button").toLowerCase();
  if (["button", "icon-button", "adminaction", "submit", "reset", "transport", "direction"].includes(role)) return "button";
  if (["checkbox", "radio", "toggle", "light"].includes(role)) return "toggle";
  if (["range", "knob", "stepper"].includes(role)) return "continuous";
  if (["select", "dropdown", "segmented"].includes(role)) return "choice";
  if (["text", "textarea", "number", "url", "email", "search", "date", "color"].includes(role)) return "input";
  if (["display", "display-panel", "meter"].includes(role)) return "display";
  return role;
}

function canReplaceUserLayoutControlGizmoStyle(targetItem, incomingControlId) {
  const incoming = userLayoutBuiltinControl(incomingControlId);
  const target = userLayoutBuiltinControl(targetItem?.controlId) || getSettingEntry(targetItem?.controlId);
  return Boolean(incoming?.gizmo && target && userGizmoStyleFamily(incoming) === userGizmoStyleFamily(target));
}

function replaceUserLayoutControlGizmoStyle(targetControlId, incomingControlId) {
  const placement = findUserLayoutControl(targetControlId);
  const incoming = userLayoutBuiltinControl(incomingControlId);
  const template = userGizmoTemplateFromControlId(incomingControlId);
  if (!placement || !incoming?.gizmo || !template || !canReplaceUserLayoutControlGizmoStyle(placement.item, incomingControlId)) return false;
  placement.item.controlConfig = normalizeUserLayoutControlConfig({
    ...placement.item.controlConfig,
    gizmoTemplateId: template.id
  });
  renderUserViewDraftUi();
  selectUserLayoutControl(targetControlId);
  setUserLayoutStatus(`${userLayoutControlDisplayLabel(placement.item)} now uses the ${template.label} style.`);
  pushUserBuilderHistory(`Change ${userLayoutControlDisplayLabel(placement.item)} Gizmo style`);
  return true;
}

function userGizmoAcceptsRecordedControl(gizmoItem, controlId) {
  const definition = userLayoutBuiltinControl(gizmoItem?.controlId);
  const entry = getSettingEntry(controlId);
  if (!definition?.gizmo || !entry?.userSafe) return false;
  const gizmoType = String(definition.controlType || definition.kind || "button").toLowerCase();
  const controlType = String(entry.controlType || entry.type || "").toLowerCase();
  if (["button", "icon-button"].includes(gizmoType)) return ["button", "adminaction", "submit", "reset"].includes(controlType);
  if (["toggle", "light"].includes(gizmoType)) return ["checkbox", "radio", "toggle"].includes(controlType);
  if (["range", "knob"].includes(gizmoType)) return controlType === "range";
  if (gizmoType === "select") return controlType === "select";
  if (gizmoType === "segmented") return ["select", "radio"].includes(controlType);
  if (gizmoType === "stepper") return ["range", "number"].includes(controlType);
  if (["transport", "direction"].includes(gizmoType)) return ["button", "adminaction"].includes(controlType);
  if (gizmoType === "color") return controlType === "color";
  if (["text", "search", "date"].includes(gizmoType)) return ["text", "textarea", "number", "date", "url", "email", "search"].includes(controlType);
  if (["display", "display-panel", "meter"].includes(gizmoType)) {
    return ["checkbox", "radio", "toggle", "range", "select", "text", "textarea", "number", "date", "url", "email", "search", "color"].includes(controlType);
  }
  return false;
}

function markUserGizmoBindingTargets(controlId) {
  userQueryAll(".user-layout-control-object[data-control-id]").forEach(node => {
    const placement = findUserLayoutControl(node.dataset.controlId);
    if (!userLayoutBuiltinControl(placement?.item?.controlId)?.gizmo) return;
    node.classList.toggle("is-gizmo-binding-compatible", userGizmoAcceptsRecordedControl(placement.item, controlId));
    node.classList.toggle("is-gizmo-binding-incompatible", !userGizmoAcceptsRecordedControl(placement.item, controlId));
  });
}

function commitRecordedControlToUserGizmo(gizmoId, controlId, { overwrite = false } = {}) {
  const placement = findUserLayoutControl(gizmoId);
  const entry = getSettingEntry(controlId);
  if (!placement || !entry?.userSafe || !userGizmoAcceptsRecordedControl(placement.item, controlId)) return false;
  const currentId = String(placement.item.assignedControlId || "");
  if (currentId && currentId !== controlId && !overwrite) {
    openUserGizmoReplaceMenu(gizmoId, controlId, currentId);
    return true;
  }
  placement.item.assignedControlId = controlId;
  userViewDraft.recordedControls = userViewDraft.recordedControls.filter(id => id !== controlId);
  renderUserViewDraftUi();
  selectUserLayoutControl(gizmoId);
  setUserLayoutStatus(`${friendlySettingLabel(entry)} assigned to ${userLayoutControlDisplayLabel(placement.item)}.`);
  pushUserBuilderHistory(`Assign ${friendlySettingLabel(entry)} to gizmo`);
  return true;
}

function openUserGizmoReplaceMenu(gizmoId, controlId, currentId) {
  userQuery(".users-gizmo-replace-menu")?.remove();
  const incoming = getSettingEntry(controlId);
  const current = getSettingEntry(currentId);
  const menu = document.createElement("div");
  menu.className = "users-gizmo-replace-menu";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Replace gizmo assignment");
  const title = document.createElement("strong");
  title.textContent = "Replace assigned control?";
  const copy = document.createElement("p");
  copy.textContent = `${current ? friendlySettingLabel(current) : "The current control"} is assigned now. Replace it with ${friendlySettingLabel(incoming)}?`;
  const actions = document.createElement("div");
  const replace = document.createElement("button");
  replace.type = "button";
  replace.textContent = "Replace";
  replace.addEventListener("click", () => {
    menu.remove();
    commitRecordedControlToUserGizmo(gizmoId, controlId, { overwrite: true });
  });
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Keep current";
  cancel.addEventListener("click", () => menu.remove());
  actions.append(cancel, replace);
  menu.append(title, copy, actions);
  document.body.append(menu);
}

function resolveUserControlDropZone(sectionNode, elements, clientX, clientY, movingControlId) {
  const content = sectionNode?.querySelector(":scope > .user-layout-section-content");
  const rect = content?.getBoundingClientRect();
  if (!rect?.width || !rect?.height) return null;
  const targetId = elements
    .map(element => element.closest?.(".user-layout-control-object")?.dataset.controlId)
    .find(id => id && id !== movingControlId) || "";
  if (targetId) {
    const targetNode = content.querySelector(`.user-layout-control-object[data-control-id="${CSS.escape(targetId)}"]`);
    const targetRect = targetNode?.getBoundingClientRect();
    if (targetRect) {
      const dx = clientX - (targetRect.left + targetRect.width / 2);
      const dy = clientY - (targetRect.top + targetRect.height / 2);
      const mode = Math.abs(dx / targetRect.width) >= Math.abs(dy / targetRect.height)
        ? (dx < 0 ? "left" : "right")
        : (dy < 0 ? "above" : "below");
      return { key: `${sectionNode.dataset.layoutElementId}:${targetId}:${mode}`, mode, targetId, content };
    }
  }
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  const mode = y < 0.18 ? "top-row"
    : y > 0.82 ? "bottom-row"
      : x < 0.16 ? "left-column"
        : x > 0.84 ? "right-column"
          : "smart";
  const cellX = Math.max(0, Math.min(9, Math.floor(x * 10)));
  const cellY = Math.max(0, Math.min(9, Math.floor(y * 10)));
  return {
    key: `${sectionNode.dataset.layoutElementId}:${mode}:${cellX}:${cellY}`,
    mode,
    targetId: "",
    content,
    anchorX: clamp(x, 0, 1),
    anchorY: clamp(y, 0, 1)
  };
}

function createUserControlDropPreviewContent(controlId, item = null) {
  const entry = getSettingEntry(controlId);
  if (entry?.userSafe) {
    const fragment = document.createDocumentFragment();
    const name = document.createElement("strong");
    name.className = "users-compact-control-name";
    name.textContent = item ? userLayoutControlDisplayLabel(item) : friendlySettingLabel(entry);
    fragment.append(name, createUsersRegistryControlPreview(entry, item || {}));
    return fragment;
  }
  const definition = userLayoutBuiltinControl(controlId);
  if (definition?.gizmo) {
    const previewItem = item || {
      type: "control", controlId, source: "builtin", customLabel: "", showLabel: true,
      controlConfig: normalizeUserLayoutControlConfig()
    };
    return createUserLayoutBuiltinControl(previewItem, true);
  }
  const fragment = document.createDocumentFragment();
  const name = document.createElement("strong");
  name.textContent = item ? userLayoutControlDisplayLabel(item) : definition?.label || "Control";
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = true;
  button.textContent = normalizeUserLayoutControlConfig(item?.controlConfig).buttonText || definition?.text || "Control";
  fragment.append(name, button);
  return fragment;
}

function placeUserLayoutControlAtAnchor(section, item, rect, anchorX = 0.5, anchorY = 0.5) {
  if (!section || !item || !rect?.width || !rect?.height) return false;
  const width = clamp(item.width, 42 / rect.width, 1);
  const height = clamp(item.height, 42 / rect.height, 1);
  const base = {
    ...item,
    width,
    height,
    x: clamp(anchorX - width / 2, 0, 1 - width),
    y: clamp(anchorY - height / 2, 0, 1 - height)
  };
  if (userLayoutControlCandidateFits(section, base, item.controlId)) {
    Object.assign(item, base);
    return true;
  }
  const step = 8;
  const candidates = [];
  for (let radius = step; radius <= Math.max(rect.width, rect.height); radius += step) {
    [[radius, 0], [-radius, 0], [0, radius], [0, -radius], [radius, radius], [radius, -radius], [-radius, radius], [-radius, -radius]].forEach(([dx, dy]) => {
      candidates.push({
        ...base,
        x: clamp(base.x + dx / rect.width, 0, 1 - width),
        y: clamp(base.y + dy / rect.height, 0, 1 - height),
        distance: Math.hypot(dx, dy)
      });
    });
    const match = candidates
      .sort((a, b) => a.distance - b.distance)
      .find(candidate => userLayoutControlCandidateFits(section, candidate, item.controlId));
    if (match) {
      delete match.distance;
      Object.assign(item, match);
      return true;
    }
  }
  return false;
}

function previewUserControlDrop(state, zone) {
  state.preview?.remove();
  state.preview = null;
  state.previewPlacement = null;
  const sectionId = state.sectionNode?.dataset.layoutElementId || "";
  const liveSection = userLayoutElementById(sectionId);
  if (!liveSection || !zone?.content) return;
  const section = cloneUserViewDraftState(liveSection);
  section.controls = (section.controls || []).filter(control => control.controlId !== state.controlId);
  const existing = findUserLayoutControl(state.controlId);
  const item = existing
    ? cloneUserViewDraftState(existing.item)
    : { type: "control", controlId: state.controlId, source: userLayoutBuiltinControl(state.controlId) ? "builtin" : "recorded", customLabel: "", showLabel: true, controlConfig: normalizeUserLayoutControlConfig(), x: 0, y: 0, width: 1, height: 1 };
  const targetRect = zone.content.getBoundingClientRect();
  if (existing && state.draggedSize && targetRect.width && targetRect.height) {
    item.width = clamp(state.draggedSize.width / targetRect.width, 0.04, 1);
    item.height = clamp(state.draggedSize.height / targetRect.height, 0.04, 1);
  }
  if (zone.mode === "smart") {
    if (existing) {
      if (!placeUserLayoutControlAtAnchor(section, item, targetRect, zone.anchorX, zone.anchorY)) return;
    } else if (!placeUserLayoutControlInOpenSpace(section, item, { anchorX: zone.anchorX, anchorY: zone.anchorY })) return;
  } else {
    applyUserLayoutControlPlacement(section, item, zone.targetId, zone.mode);
  }
  const preview = document.createElement("div");
  preview.className = "user-control-drop-preview";
  preview.style.left = `${item.x * 100}%`;
  preview.style.top = `${item.y * 100}%`;
  preview.style.width = `${item.width * 100}%`;
  preview.style.height = `${item.height * 100}%`;
  preview.dataset.previewControlType = getSettingEntry(state.controlId)?.type || (userLayoutBuiltinControl(state.controlId) ? "button" : "control");
  if (userLayoutControlIsButton(item)) preview.dataset.buttonShape = userLayoutControlButtonShape(item);
  preview.append(createUserControlDropPreviewContent(state.controlId, item));
  preview.querySelectorAll("input, select, button, textarea").forEach(control => {
    control.disabled = true;
    control.removeAttribute("id");
    control.removeAttribute("name");
    control.tabIndex = -1;
  });
  zone.content.append(preview);
  state.preview = preview;
  state.previewPlacement = zone.mode === "smart"
    ? { targetId: "", mode: "smart", geometry: { x: item.x, y: item.y, width: item.width, height: item.height } }
    : { targetId: zone.targetId, mode: zone.mode };
}

function bounceUserBuilderControlSource(sourceElement) {
  if (!sourceElement?.isConnected) return;
  sourceElement.classList.remove("is-user-builder-bouncing");
  requestAnimationFrame(() => {
    sourceElement.classList.add("is-user-builder-bouncing");
    window.setTimeout(() => sourceElement.classList.remove("is-user-builder-bouncing"), 420);
  });
}

function beginUserBuilderPointerDrag(event, controlId, source, options = {}) {
  if (!isUsersBuilderMode() || event.button !== 0 || !controlId || userBuilderPointerDragState || userLayoutControlManipulationState) return false;
  if (isActiveAdminTextEditor(event.target)) return false;
  if (event.target.closest(".user-layout-control-remove, .users-compact-control-remove")) return false;
  const valid = source === "layout"
    ? Boolean(findUserLayoutControl(controlId))
    : source === "builtin" ? Boolean(userLayoutBuiltinControl(controlId)) : Boolean(getSettingEntry(controlId)?.userSafe);
  if (!valid) return false;
  const interactiveTarget = Boolean(options.allowInteractive && event.target.closest?.("button, input, select, textarea, label"));
  const activationRect = options.activationBounds?.getBoundingClientRect?.() || null;
  if (!interactiveTarget) event.preventDefault();
  event.stopPropagation();
  const sourceElement = source === "layout"
    ? event.currentTarget.closest?.(".user-layout-control-object") || event.currentTarget
    : event.currentTarget;
  const sourcePlacement = source === "layout" ? findUserLayoutControl(controlId) : null;
  const sourceContentRect = sourceElement.closest?.(".user-layout-section-content")?.getBoundingClientRect();
  userBuilderPointerDragState = {
    pointerId: event.pointerId,
    controlId,
    source,
    sourceElement,
    draggedSize: sourcePlacement && sourceContentRect ? {
      width: sourcePlacement.item.width * sourceContentRect.width,
      height: sourcePlacement.item.height * sourceContentRect.height
    } : null,
    startX: event.clientX,
    startY: event.clientY,
    interactiveTarget,
    activationRect,
    active: false,
    ghost: null,
    highlight: null,
    sectionNode: null,
    targetControlId: "",
    zoneKey: "",
    zoneTimer: 0,
    preview: null,
    previewPlacement: null,
    currentZone: null,
    bindingTargetId: "",
    bindingRejected: false,
    bindingHover: null,
    styleReplacementTargetId: "",
    styleReplacementHover: null,
    styleReplacementRejected: false,
    frameRegion: "",
    frameRegionNode: null
  };
  const update = moveEvent => {
    const state = userBuilderPointerDragState;
    if (!state || moveEvent.pointerId !== state.pointerId) return;
    if (!state.active) {
      const outsideInteractiveFrame = state.interactiveTarget && state.activationRect
        ? moveEvent.clientX < state.activationRect.left || moveEvent.clientX > state.activationRect.right
          || moveEvent.clientY < state.activationRect.top || moveEvent.clientY > state.activationRect.bottom
        : false;
      if (state.interactiveTarget && !outsideInteractiveFrame) return;
      if (!state.interactiveTarget && Math.hypot(moveEvent.clientX - state.startX, moveEvent.clientY - state.startY) < 6) return;
      moveEvent.preventDefault();
    }
    if (!state.active) {
      state.active = true;
      state.sourceElement.classList.add("is-user-builder-dragging");
      document.body.classList.add("is-user-builder-dragging-control");
      const ghost = document.createElement("div");
      ghost.className = "users-control-drag-ghost";
      const entry = getSettingEntry(controlId);
      if (entry && source === "recorded") {
        const template = defaultUserGizmoTemplateForEntry(entry);
        const preview = template ? createUserGizmoFace(template, { interactive: false }) : null;
        const name = document.createElement("span");
        name.textContent = friendlySettingLabel(entry);
        if (preview) ghost.append(preview);
        ghost.append(name);
      } else {
        ghost.textContent = entry ? friendlySettingLabel(entry) : userLayoutBuiltinControl(controlId)?.label || "Control";
      }
      document.body.append(ghost);
      state.ghost = ghost;
      setUserLayoutStatus("Drag the control into a section.");
      if (source === "recorded") markUserGizmoBindingTargets(controlId);
    }
    state.ghost.style.left = `${moveEvent.clientX + 12}px`;
    state.ghost.style.top = `${moveEvent.clientY + 12}px`;
    const elements = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
    state.bindingHover?.classList.remove("is-gizmo-binding-hover", "is-gizmo-binding-rejected");
    state.bindingHover = null;
    state.bindingTargetId = "";
    state.bindingRejected = false;
    state.styleReplacementHover?.classList.remove("is-gizmo-style-replace-target", "is-gizmo-style-replace-rejected");
    state.styleReplacementHover = null;
    state.styleReplacementTargetId = "";
    state.styleReplacementRejected = false;
    const hoveredGizmo = source === "recorded"
      ? elements.map(element => element.closest?.(".user-layout-control-object[data-control-id]")).find(node => userLayoutBuiltinControl(node?.dataset.controlId)?.gizmo)
      : null;
    if (hoveredGizmo) {
      const hoveredPlacement = findUserLayoutControl(hoveredGizmo.dataset.controlId);
      const compatible = userGizmoAcceptsRecordedControl(hoveredPlacement?.item, controlId);
      hoveredGizmo.classList.add(compatible ? "is-gizmo-binding-hover" : "is-gizmo-binding-rejected");
      state.bindingHover = hoveredGizmo;
      state.bindingTargetId = compatible ? hoveredGizmo.dataset.controlId : "";
      state.bindingRejected = !compatible;
      state.highlight?.classList.remove("is-user-builder-drop-target");
      state.highlight = null;
      state.sectionNode = null;
      state.currentZone = null;
      clearTimeout(state.zoneTimer);
      state.preview?.remove();
      state.preview = null;
      state.previewPlacement = null;
      return;
    }
    const incomingDefinition = source === "builtin" ? userLayoutBuiltinControl(controlId) : null;
    const hoveredPlacedControl = incomingDefinition?.gizmo
      ? elements.map(element => element.closest?.(".user-layout-control-object[data-control-id]")).find(Boolean)
      : null;
    if (hoveredPlacedControl) {
      const hoveredPlacement = findUserLayoutControl(hoveredPlacedControl.dataset.controlId);
      const compatible = canReplaceUserLayoutControlGizmoStyle(hoveredPlacement?.item, controlId);
      hoveredPlacedControl.classList.add(compatible ? "is-gizmo-style-replace-target" : "is-gizmo-style-replace-rejected");
      state.styleReplacementHover = hoveredPlacedControl;
      state.styleReplacementTargetId = compatible ? hoveredPlacedControl.dataset.controlId : "";
      state.styleReplacementRejected = !compatible;
      state.highlight?.classList.remove("is-user-builder-drop-target");
      state.highlight = null;
      state.sectionNode = null;
      state.currentZone = null;
      clearTimeout(state.zoneTimer);
      state.preview?.remove();
      state.preview = null;
      state.previewPlacement = null;
      state.ghost.textContent = compatible ? "Replace style" : "Incompatible Gizmo";
      return;
    }
    const sectionNode = elements.map(element => element.closest?.(".user-layout-section-object")).find(Boolean) || null;
    const sectionId = sectionNode?.dataset.layoutElementId || "";
    const canDrop = sectionId && canDropUserLayoutControl(controlId, sectionId, { allowReposition: source === "layout" });
    const highlight = canDrop ? sectionNode.querySelector(":scope > .user-layout-section-content") : null;
    if (highlight !== state.highlight) {
      state.highlight?.classList.remove("is-user-builder-drop-target");
      highlight?.classList.add("is-user-builder-drop-target");
      state.highlight = highlight;
    }
    state.sectionNode = canDrop ? sectionNode : null;
    state.frameRegionNode?.classList.remove("is-user-builder-drop-target");
    state.frameRegionNode = null;
    state.frameRegion = "";
    if (!canDrop) {
      const regionNode = elements.map(element => element.closest?.(".user-layout-region[data-layout-region]")).find(Boolean) || null;
      if (regionNode) {
        state.frameRegionNode = regionNode;
        state.frameRegion = regionNode.dataset.layoutRegion || "";
        regionNode.classList.add("is-user-builder-drop-target");
      }
    }
    const zone = canDrop ? resolveUserControlDropZone(sectionNode, elements, moveEvent.clientX, moveEvent.clientY, controlId) : null;
    state.currentZone = zone;
    state.targetControlId = zone?.targetId || "";
    if (zone?.key !== state.zoneKey) {
      clearTimeout(state.zoneTimer);
      state.preview?.remove();
      state.preview = null;
      state.previewPlacement = null;
      state.zoneKey = zone?.key || "";
      if (zone) state.zoneTimer = window.setTimeout(() => {
        if (userBuilderPointerDragState === state && state.zoneKey === zone.key && state.currentZone) {
          previewUserControlDrop(state, state.currentZone);
        }
      }, 200);
    }
  };
  const finish = finishEvent => {
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", cancel);
    const state = userBuilderPointerDragState;
    if (!state || finishEvent.pointerId !== state.pointerId) return;
    const sectionId = state.sectionNode?.dataset.layoutElementId || "";
    const targetControlId = state.targetControlId;
    if (!state.previewPlacement && state.currentZone) previewUserControlDrop(state, state.currentZone);
    const previewPlacement = state.previewPlacement ? cloneUserViewDraftState(state.previewPlacement) : null;
    const currentZone = state.currentZone ? {
      targetId: state.currentZone.targetId,
      mode: state.currentZone.mode,
      anchorX: state.currentZone.anchorX,
      anchorY: state.currentZone.anchorY
    } : null;
    const wasActive = state.active;
    const bindingTargetId = state.bindingTargetId;
    const bindingRejected = state.bindingRejected;
    const styleReplacementTargetId = state.styleReplacementTargetId;
    const styleReplacementRejected = state.styleReplacementRejected;
    const frameRegion = state.frameRegion;
    const sourceElement = state.sourceElement;
    const x = finishEvent.clientX;
    const y = finishEvent.clientY;
    clearUserBuilderPointerDragState();
    if (!wasActive) {
      if (source === "layout") selectUserLayoutControl(controlId, { toggle: finishEvent.shiftKey, additive: finishEvent.shiftKey });
      return;
    }
    if (bindingTargetId) {
      commitRecordedControlToUserGizmo(bindingTargetId, controlId);
      return;
    }
    if (styleReplacementTargetId) {
      replaceUserLayoutControlGizmoStyle(styleReplacementTargetId, controlId);
      return;
    }
    if (styleReplacementRejected) {
      bounceUserBuilderControlSource(sourceElement);
      setUserLayoutStatus("That Gizmo style is not compatible with this control.", true);
      return;
    }
    if (bindingRejected) {
      bounceUserBuilderControlSource(sourceElement);
      setUserLayoutStatus("That gizmo cannot represent this kind of control.", true);
      return;
    }
    if (!sectionId) {
      if (frameRegion) {
        const frameHost = ensureUserLayoutFrameHost(frameRegion);
        renderUserFrameLayout();
        const content = document.querySelector(`[data-layout-parent-id="${CSS.escape(frameHost.id)}"]`);
        const rect = content?.getBoundingClientRect();
        const anchorX = rect ? clamp((x - rect.left) / Math.max(1, rect.width), 0, 1) : 0.5;
        const anchorY = rect ? clamp((y - rect.top) / Math.max(1, rect.height), 0, 1) : 0.5;
        placeUserLayoutControl(controlId, frameHost.id, source, { mode: "smart", anchorX, anchorY }, { allowReposition: source === "layout" });
        return;
      }
      bounceUserBuilderControlSource(sourceElement);
      setUserLayoutStatus("That area cannot contain a control, so it returned to its original position.", true);
      return;
    }
    if (previewPlacement) {
      placeUserLayoutControl(controlId, sectionId, source, previewPlacement, { allowReposition: source === "layout" });
      return;
    }
    if (currentZone) {
      placeUserLayoutControl(controlId, sectionId, source, currentZone, { allowReposition: source === "layout" });
      return;
    }
    const section = userLayoutElementById(sectionId);
    const fallbackTarget = section?.controls?.find(control => control.controlId !== controlId)?.controlId || "";
    if (targetControlId || fallbackTarget) {
      openUserControlPlacementMenu({ controlId, sectionId, targetId: targetControlId || fallbackTarget, source, x: x + 8, y: y + 8 });
    } else {
      placeUserLayoutControl(controlId, sectionId, source, { mode: "smart" }, { allowReposition: source === "layout" });
    }
  };
  const cancel = cancelEvent => {
    if (cancelEvent.type === "keydown" && cancelEvent.key !== "Escape") return;
    if (cancelEvent.type !== "keydown" && cancelEvent.pointerId !== userBuilderPointerDragState?.pointerId) return;
    cancelEvent.preventDefault?.();
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", cancel);
    clearUserBuilderPointerDragState();
    setUserLayoutStatus("Control move canceled.");
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", cancel);
  return true;
}

function builderDragPayload(settingId, source) {
  return JSON.stringify({
    settingId: typeof settingId === "string" ? settingId : "",
    source: typeof source === "string" ? source : ""
  });
}

function readBuilderDragPayload(event) {
  const transfer = event?.dataTransfer;
  if (!transfer) return null;
  const raw = transfer.getData("application/x-rv-user-setting") || transfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      settingId: typeof parsed?.settingId === "string" ? parsed.settingId : "",
      source: typeof parsed?.source === "string" ? parsed.source : ""
    };
  } catch {
    return {
      settingId: raw.trim(),
      source: ""
    };
  }
}

function beginUserBuilderDrag(event, settingId, source) {
  if (!isUsersBuilderMode() || !event?.dataTransfer || !settingId) return false;
  const entry = getSettingEntry(settingId);
  if (!entry?.userSafe) return false;
  const sourceElement = event.currentTarget?.closest?.("[data-user-builder-card='true']") || event.currentTarget || null;
  const payload = builderDragPayload(settingId, source);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-rv-user-setting", payload);
  event.dataTransfer.setData("text/plain", settingId);
  userBuilderDragState = {
    settingId,
    source,
    sourceElement
  };
  sourceElement?.classList.add("is-user-builder-dragging");
  clearUserBuilderDropzoneState();
  document.body.classList.add("is-user-builder-dragging-control");
  return true;
}

function builderControlDragPayload(controlId, source) {
  return JSON.stringify({
    controlId: typeof controlId === "string" ? controlId : "",
    source: typeof source === "string" ? source : ""
  });
}

function readBuilderControlDragPayload(event) {
  const transfer = event?.dataTransfer;
  if (!transfer) return null;
  const raw = transfer.getData("application/x-rv-user-control");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return {
        controlId: typeof parsed?.controlId === "string" ? parsed.controlId : "",
        source: typeof parsed?.source === "string" ? parsed.source : ""
      };
    } catch {
      return null;
    }
  }
  const legacy = readBuilderDragPayload(event);
  return legacy?.settingId ? { controlId: legacy.settingId, source: legacy.source || "recorded" } : null;
}

function beginUserBuilderControlDrag(event, controlId, source) {
  if (!isUsersBuilderMode() || !event?.dataTransfer || !controlId) return false;
  const valid = source === "layout"
    ? Boolean(findUserLayoutControl(controlId))
    : source === "builtin" ? Boolean(userLayoutBuiltinControl(controlId)) : Boolean(getSettingEntry(controlId)?.userSafe);
  if (!valid) return false;
  const sourceElement = event.currentTarget?.closest?.("[data-user-builder-card='true']") || event.currentTarget || null;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-rv-user-control", builderControlDragPayload(controlId, source));
  event.dataTransfer.setData("text/plain", controlId);
  userBuilderDragState = { controlId, settingId: source === "builtin" ? "" : controlId, source, sourceElement };
  sourceElement?.classList.add("is-user-builder-dragging");
  clearUserBuilderDropzoneState();
  document.body.classList.add("is-user-builder-dragging-control");
  return true;
}

function canDropUserBuilderSetting(settingId, panel) {
  const normalizedPanel = validUserViewPanel(panel);
  if (!normalizedPanel || !settingId) return false;
  const entry = getSettingEntry(settingId);
  if (!entry?.userSafe) return false;
  if (normalizedPanel === "bottom" && isUsersBuilderMode()) return true;
  return isUserViewPanelEnabled(normalizedPanel) || panelHasPlacedSettings(normalizedPanel);
}

function handleUserBuilderDrop(event, panel) {
  if (!isUsersBuilderMode()) return false;
  const normalizedPanel = validUserViewPanel(panel);
  if (!normalizedPanel) return false;
  const payload = readBuilderDragPayload(event);
  const settingId = payload?.settingId || userBuilderDragState?.settingId || "";
  if (!canDropUserBuilderSetting(settingId, normalizedPanel)) return false;
  const defaultEdge = normalizedPanel === "top" || normalizedPanel === "bottom" ? "left" : "top";
  return Boolean(placeSettingInPanel(settingId, normalizedPanel, defaultEdge));
}

function placeSettingInPanel(settingId, panel, edge) {
  const entry = getSettingEntry(settingId);
  const normalizedPanel = validUserViewPanel(panel);
  const normalizedEdge = validUserViewEdge(normalizedPanel, edge);
  if (!entry?.userSafe || !normalizedPanel || !normalizedEdge) return false;
  setUserViewPanelEnabled(normalizedPanel, true, { render: false });
  removePlacedSetting(settingId);
  userViewDraft.recordedControls = userViewDraft.recordedControls.filter(id => id !== settingId);
  const section = ensureUserViewSection(normalizedPanel, normalizedEdge, entry.userGroup || entry.section || "Settings");
  if (!section) return false;
  const panelSection = userViewDraft.panels[normalizedPanel].sections.find(candidate => candidate?.id === section.id);
  if (!panelSection.items.some(item => item?.settingId === settingId)) {
    panelSection.items.push({ type: "setting", settingId });
  }
  renderUserViewDraftUi();
  pushUserBuilderHistory(`Place ${friendlySettingLabel(entry)} in ${userPanelDisplayLabel(normalizedPanel)}`);
  return true;
}

function settingPlacementStatus(settingId) {
  if (!settingId) return "none";
  if (findPlacedSetting(settingId) || findUserLayoutControl(settingId)) return "placed";
  if (userViewDraft.recordedControls.includes(settingId)) return "recorded";
  return "none";
}

function addControlToRecorded(settingId) {
  if (!settingId) return false;
  const entry = getSettingEntry(settingId);
  if (!entry?.userSafe) return false;
  if (findPlacedSetting(settingId) || findUserLayoutControl(settingId) || userViewDraft.recordedControls.includes(settingId)) return false;
  userViewDraft.recordedControls.push(settingId);
  renderUserViewDraftUi();
  pushUserBuilderHistory(`Add ${friendlySettingLabel(entry)} to recorded controls`);
  return true;
}

function returnPlacedControlToRecorded(settingId) {
  if (!settingId) return false;
  const removed = removePlacedSetting(settingId);
  const entry = getSettingEntry(settingId);
  if (removed && entry?.userSafe && !userViewDraft.recordedControls.includes(settingId)) {
    userViewDraft.recordedControls.push(settingId);
  }
  renderUserViewDraftUi();
  if (removed) {
    pushUserBuilderHistory(`Return ${friendlySettingLabel(entry)} to recorded controls`);
  }
  return removed;
}

function closeUserPlacementMenu() {
  usersPlacementMenuState = null;
  if (els.usersPlacementMenu) {
    els.usersPlacementMenu.hidden = true;
    els.usersPlacementMenu.replaceChildren();
  }
}

function createUsersPlacementAction(label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "users-placement-action";
  button.textContent = label;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    handler();
  });
  return button;
}

function openUserPlacementMenu(settingId, sourceType, event) {
  const entry = getSettingEntry(settingId);
  if (!entry?.userSafe || !els.usersPlacementMenu || activePanelTabId() !== "users") return;
  event.preventDefault();
  event.stopPropagation();
  const menu = els.usersPlacementMenu;
  menu.replaceChildren();
  const title = document.createElement("strong");
  title.className = "users-placement-title";
  title.textContent = friendlySettingLabel(entry);
  menu.append(title);
  if (sourceType === "placed") {
    menu.append(createUsersPlacementAction("Remove", () => {
      returnPlacedControlToRecorded(settingId);
      closeUserPlacementMenu();
    }));
    menu.append(createUsersPlacementAction("Return to recorded controls", () => {
      returnPlacedControlToRecorded(settingId);
      closeUserPlacementMenu();
    }));
    const disabled = document.createElement("button");
    disabled.type = "button";
    disabled.className = "users-placement-action";
    disabled.disabled = true;
    disabled.textContent = "Nudge tools";
    menu.append(disabled);
  } else {
    Object.entries(USER_VIEW_PANEL_EDGES).forEach(([panel, edges]) => {
      const group = document.createElement("section");
      group.className = "users-placement-group";
      const heading = document.createElement("span");
      heading.className = "users-placement-group-title";
      heading.textContent = userPanelDisplayLabel(panel);
      group.append(heading);
      const actions = document.createElement("div");
      actions.className = "users-placement-group-actions";
      edges.forEach(edge => {
        actions.append(createUsersPlacementAction(
          humanizeSettingToken(edge),
          () => {
            placeSettingInPanel(settingId, panel, edge);
            closeUserPlacementMenu();
          }
        ));
      });
      group.append(actions);
      menu.append(group);
    });
  }
  menu.hidden = false;
  usersPlacementMenuState = {
    settingId,
    sourceType
  };
  const rect = els.mapCanvas?.getBoundingClientRect?.();
  const provisionalLeft = event.clientX + 8;
  const provisionalTop = event.clientY + 8;
  requestAnimationFrame(() => {
    if (!rect || menu.hidden) return;
    const menuRect = menu.getBoundingClientRect();
    const maxLeft = rect.right - menuRect.width - 10;
    const maxTop = rect.bottom - menuRect.height - 10;
    const left = clamp(provisionalLeft, rect.left + 10, Math.max(rect.left + 10, maxLeft));
    const top = clamp(provisionalTop, rect.top + 10, Math.max(rect.top + 10, maxTop));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  });
}

function addRecordedControls({ clearSession = false } = {}) {
  let added = 0;
  userRecordSessionEntries().forEach(entry => {
    if (!entry || userViewDraft.recordedControls.includes(entry.id) || findPlacedSetting(entry.id) || findUserLayoutControl(entry.id)) return;
    userViewDraft.recordedControls.push(entry.id);
    added += 1;
  });
  if (clearSession) {
    userRecordState.sessionIds = [];
  }
  renderUserViewDraftUi();
  if (added > 0) {
    pushUserBuilderHistory(`Add ${added} recorded control${added === 1 ? "" : "s"}`);
  }
  return added;
}

function clearRecordedSession() {
  userRecordState.sessionIds = [];
  syncUserRecordUiState();
}

function clearRecordedControls() {
  if (!userViewDraft.recordedControls.length) return;
  userViewDraft.recordedControls = [];
  renderUserViewDraftUi();
  pushUserBuilderHistory("Clear recorded controls");
}

function setUserViewPanelEnabled(panel, enabled, { render = true, historyLabel = "" } = {}) {
  const normalizedPanel = validUserViewPanel(panel);
  if (!normalizedPanel) return false;
  const panelState = userViewDraft.panels?.[normalizedPanel];
  if (!panelState) return false;
  const nextEnabled = Boolean(enabled);
  if (panelState.enabled === nextEnabled) {
    if (render) renderUserViewDraftUi();
    return false;
  }
  panelState.enabled = nextEnabled;
  if (render) renderUserViewDraftUi();
  if (historyLabel) {
    pushUserBuilderHistory(historyLabel);
  }
  return true;
}

function addUserViewPanel(panel) {
  const normalizedPanel = validUserViewPanel(panel);
  return setUserViewPanelEnabled(normalizedPanel, true, {
    historyLabel: `Add ${userPanelDisplayLabel(normalizedPanel)} panel`
  });
}

function removeUserViewPanel(panel) {
  const normalizedPanel = validUserViewPanel(panel);
  if (!normalizedPanel) return false;
  const panelState = userViewDraft.panels?.[normalizedPanel];
  if (!panelState) return false;
  const returnedIds = [];
  (panelState.sections || []).forEach(section => {
    (section?.items || []).forEach(item => {
      if (item?.type !== "setting" || !item?.settingId) return;
      if (!returnedIds.includes(item.settingId)) returnedIds.push(item.settingId);
    });
  });
  returnedIds.forEach(settingId => {
    if (!userViewDraft.recordedControls.includes(settingId)) {
      userViewDraft.recordedControls.push(settingId);
    }
  });
  panelState.sections = [];
  panelState.enabled = false;
  renderUserViewDraftUi();
  pushUserBuilderHistory(`Remove ${userPanelDisplayLabel(normalizedPanel)} panel`);
  return true;
}

function removeRecordedControlId(settingId) {
  if (!settingId) return;
  const entry = getSettingEntry(settingId);
  const nextRecordedControls = userViewDraft.recordedControls.filter(id => id !== settingId);
  if (nextRecordedControls.length === userViewDraft.recordedControls.length) return;
  userViewDraft.recordedControls = nextRecordedControls;
  renderUserViewDraftUi();
  pushUserBuilderHistory(`Remove ${friendlySettingLabel(entry)} from recorded controls`);
}



function refreshUserRecordTargets() {
  getUserSafeSettings().forEach(entry => {
    const target = resolveRecordableSettingElement(entry);
    if (!target) return;
    target.classList.toggle("recordable-setting", userRecordState.active);
    target.classList.toggle("is-record-selected", userRecordState.sessionIds.includes(entry.id));
  });
}

function syncUserRecordUiState() {
  if (els.userRecordButton) {
    els.userRecordButton.setAttribute("aria-pressed", userRecordState.active ? "true" : "false");
    els.userRecordButton.classList.toggle("is-paused", userRecordState.paused && !userRecordState.active);
    els.userRecordButton.classList.toggle("is-active", userRecordState.active);
    els.userRecordButton.textContent = userRecordState.active ? "✕" : "●";
    els.userRecordButton.title = userRecordState.active
      ? "Stop recording exposed controls."
      : userRecordState.paused
        ? "Recording paused. Click to resume."
        : "Record exposed controls.";
    els.userRecordButton.setAttribute("aria-label", els.userRecordButton.title);
  }
  if (els.panelUsers?.closest(".panel")) {
    const panel = els.panelUsers.closest(".panel");
    panel.classList.toggle("is-user-recording", userRecordState.active);
    panel.classList.toggle("is-user-recording-paused", userRecordState.paused && !userRecordState.active);
  }
  refreshUserRecordTargets();
  renderUserViewDraftUi();
  updateRecordedControlsWorkflow();
}

function startUserRecordMode() {
  userRecordState.active = true;
  userRecordState.paused = false;
  syncUserRecordUiState();
}

function stopUserRecordMode({ paused = false } = {}) {
  if (!paused && userRecordState.sessionIds.length) {
    addRecordedControls({ clearSession: true });
  }
  userRecordState.active = false;
  userRecordState.paused = paused;
  syncUserRecordUiState();
}

function toggleRecordedSettingId(settingId) {
  if (!settingId) return;
  const entry = getSettingEntry(settingId);
  if (!entry || !entry.userSafe) return;
  const index = userRecordState.sessionIds.indexOf(settingId);
  if (index >= 0) {
    userRecordState.sessionIds.splice(index, 1);
  } else {
    userRecordState.sessionIds.push(settingId);
  }
  syncUserRecordUiState();
}

function collectRecordableSectionSettingIds(section) {
  if (!section) return [];
  const ids = new Set();
  getUserSafeSettings().forEach(entry => {
    const source = resolveSettingSource(entry);
    const target = resolveRecordableSettingElement(entry);
    if ((source && section.contains(source)) || (target && section.contains(target))) {
      ids.add(entry.id);
    }
  });
  section.querySelectorAll("[data-setting-id]").forEach(element => {
    const id = element.dataset.settingId;
    if (id && getSettingEntry(id)?.userSafe) {
      ids.add(id);
    }
  });
  return [...ids];
}

function toggleRecordedSection(section) {
  if (!section) return;
  const ids = collectRecordableSectionSettingIds(section);
  if (!ids.length) return;
  const allSelected = ids.every(id => userRecordState.sessionIds.includes(id));
  if (allSelected) {
    userRecordState.sessionIds = userRecordState.sessionIds.filter(id => !ids.includes(id));
  } else {
    ids.forEach(id => {
      if (!userRecordState.sessionIds.includes(id)) {
        userRecordState.sessionIds.push(id);
      }
    });
  }
  syncUserRecordUiState();
}

function resolveSettingIdFromRecordTarget(target) {
  const direct = target?.closest?.("[data-setting-id]");
  if (direct?.dataset?.settingId) return direct.dataset.settingId;
  const wrapper = target?.closest?.("label, .text-control, .toggle-button, .range-control, .field-label-inline, .route-color-controls label");
  const nested = wrapper?.querySelector?.("[data-setting-id]");
  return nested?.dataset?.settingId || "";
}

function handleUserRecordCapture(event) {
  if (!userRecordState.active) return;
  if (event.target.closest("#userRecordButton")) return;
  if (event.target.closest("[data-recorded-remove-id], [data-staged-remove-id]")) return;
  const sectionHeader = event.target.closest(".section-collapse-button, .section-label");
  if (sectionHeader) {
    const section = sectionHeader.closest(".panel-section");
    if (section && !section.closest("#panelUsers")) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleRecordedSection(section);
    }
    return;
  }
  const recordedSessionItem = event.target.closest("#panelUsers [data-users-recorded-session] .users-registry-item[data-setting-id]");
  if (recordedSessionItem) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggleRecordedSettingId(recordedSessionItem.dataset.settingId);
    return;
  }
  const availableSessionItem = event.target.closest("#panelUsers [data-users-available-settings] .users-registry-item[data-setting-id]");
  if (availableSessionItem) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    toggleRecordedSettingId(availableSessionItem.dataset.settingId);
    return;
  }
  const settingId = resolveSettingIdFromRecordTarget(event.target);
  if (!settingId) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  toggleRecordedSettingId(settingId);
}

function updateSecondaryDrawerTogglePosition() {
  const root = document.documentElement;
  const panel = document.querySelector(".panel");
  const stage = els.mapCanvas?.closest?.(".map-stage");
  const panelRect = panel?.getBoundingClientRect?.();
  const stageRect = stage?.getBoundingClientRect?.();
  const left = panelRect?.left || stageRect?.right || window.innerWidth;
  // Anchor all secondary controls to the primary panel itself. Pinned sections
  // vary by tab, so using their height made the wheel jump vertically.
  // This is a stage-level anchor, not a panel-content measurement: the panel
  // itself can move as tabs change, but the wheel must not.
  const top = (stageRect?.top || 0) + 156;
  root.style.setProperty("--secondary-drawer-toggle-left", `${Math.round(left)}px`);
  root.style.setProperty("--secondary-drawer-toggle-top", `${Math.round(top)}px`);
}

function ensureImagePreviewDrawerToggleMounted() {
  if (!els.toggleImagePreviewDrawer) return;
  applySecondaryWheelToggle(els.toggleImagePreviewDrawer);
  if (els.toggleImagePreviewDrawer.parentElement !== document.body) {
    document.body.append(els.toggleImagePreviewDrawer);
  }
}

function secondaryWheelMarkup() {
  // Kept structurally aligned with assets/SVG/svg_arrow_wheel.svg. The
  // right-alignment guide and rotate point are intentional named anchors.
  return `<svg class="drawer-wheel-arrow" viewBox="0 0 500 500" aria-hidden="true"><g id="bg" class="drawer-wheel-bg"><circle cx="253.05" cy="250" r="236.38" fill="#333"/></g><g id="base_arrow" class="drawer-wheel-base-arrow"><path d="M366.73,464.92c-2.79,0-5.56-.75-8.02-2.17L14.36,263.93c-5.04-2.91-8.04-8.12-8.04-13.93,0-5.82,3.01-11.02,8.04-13.93L358.71,37.26c2.46-1.42,5.24-2.17,8.03-2.17,8.88,0,16.1,7.22,16.1,16.1v397.62c0,4.43-1.75,8.55-4.92,11.59-3,2.87-7.07,4.52-11.19,4.52h0Z" fill="#fcee21"/><path d="M366.73,39.08c6.31,0,12.11,5.05,12.11,12.1v397.62c0,7.06-5.79,12.1-12.11,12.1-2.01,0-4.08-.51-6.02-1.64L16.36,260.47c-8.06-4.65-8.06-16.28,0-20.93L360.71,40.72c1.95-1.12,4.01-1.64,6.02-1.64h0ZM366.73,31.08c-3.49,0-6.96.94-10.02,2.71L12.36,232.6c-6.29,3.63-10.04,10.13-10.04,17.4s3.75,13.76,10.04,17.4l344.35,198.81c3.07,1.77,6.54,2.71,10.02,2.71,11.09,0,20.11-9.02,20.11-20.1V51.19c0-11.09-9.02-20.1-20.1-20.1h0Z" fill="#333"/></g><g id="twirl_arrow" class="drawer-wheel-twirl-arrow"><path d="M311.72,401.4c-2.79,0-5.56-.75-8.02-2.17l-234.33-135.29c-5.04-2.91-8.04-8.12-8.04-13.93s3.01-11.02,8.04-13.93l234.33-135.29c2.46-1.42,5.24-2.17,8.02-2.17,8.88,0,16.11,7.22,16.11,16.1v270.58c0,4.43-1.75,8.55-4.92,11.59-3,2.87-7.07,4.52-11.19,4.52h0Z" fill="#ff1d25"/><path d="M311.72,102.6c6.31,0,12.11,5.05,12.11,12.1v270.58c0,7.06-5.79,12.1-12.11,12.1-2.01,0-4.08-.51-6.02-1.64l-234.33-135.29c-8.06-4.65-8.06-16.28,0-20.93l234.33-135.29c1.95-1.12,4.01-1.64,6.02-1.64h0ZM311.72,94.6c-3.49,0-6.95.94-10.02,2.71L67.37,232.6c-6.29,3.63-10.04,10.13-10.04,17.4s3.75,13.76,10.04,17.4l234.33,135.29c3.07,1.77,6.54,2.71,10.02,2.71,11.09,0,20.11-9.02,20.11-20.1V114.71c0-11.09-9.02-20.1-20.11-20.1h0Z" fill="#333"/></g><line id="right_align_to_main_UI_panel" x1="427.81" y1="0" x2="427.81" y2="500" fill="none"/><path id="rotate_point" d="M190.76,250" fill="none"/></svg>`;
}

function applySecondaryWheelToggle(button) {
  if (!button) return;
  // This icon is intentionally self-describing. Keep its aria-label for
  // assistive technology, but opt it out of the editor's hover-help system.
  button.removeAttribute("data-help");
  button.removeAttribute("title");
  button.dataset.helpIgnore = "true";
  if (button.dataset.secondaryWheel === "true") return;
  button.classList.add("secondary-wheel-toggle");
  button.innerHTML = secondaryWheelMarkup();
  button.dataset.secondaryWheel = "true";
}

function syncSecondaryWheelToggle(button, open, { animate = false, fullTurn = false, fullTurnTargetOpen = false } = {}) {
  if (!button) return;
  applySecondaryWheelToggle(button);
  if (button.dataset.secondaryHandoffSpin === "true" && !fullTurn) return;
  const previousOpen = button.dataset.secondaryWheelOpen;
  button.classList.remove("is-wheel-state-changing");
  if (fullTurn) {
    // Do not apply the interim "closed" class before a handoff starts. That
    // class changes the SVG's resting angle and caused Trips → Animation to
    // flash left before the clockwise turn could take over.
    const finalOpen = Boolean(fullTurnTargetOpen);
    button.dataset.secondaryHandoffSpin = "true";
    button.dataset.secondaryHandoffFinalOpen = String(finalOpen);
    button.style.setProperty("--drawer-arrow-from", "180deg");
    button.style.setProperty("--drawer-arrow-animation-to", finalOpen ? "540deg" : "360deg");
    button.style.setProperty("--drawer-arrow-duration", "1040ms");
    window.setTimeout(() => {
      const resolvedOpen = button.dataset.secondaryHandoffFinalOpen === "true";
      delete button.dataset.secondaryHandoffSpin;
      delete button.dataset.secondaryHandoffFinalOpen;
      button.classList.toggle("is-collapsed-toggle", !resolvedOpen);
      button.dataset.secondaryWheelOpen = String(resolvedOpen);
      button.classList.remove("is-wheel-state-changing");
    }, 1040);
    void button.offsetWidth;
    button.classList.add("is-wheel-state-changing");
    return;
  }
  button.classList.toggle("is-collapsed-toggle", !open);
  button.dataset.secondaryWheelOpen = String(Boolean(open));
  if (!animate || previousOpen === undefined || previousOpen === String(Boolean(open))) return;
  button.style.setProperty("--drawer-arrow-from", previousOpen === "true" ? "180deg" : "0deg");
  button.style.setProperty("--drawer-arrow-animation-to", "var(--drawer-arrow-turn)");
  button.style.setProperty("--drawer-arrow-duration", "300ms");
  void button.offsetWidth;
  button.classList.add("is-wheel-state-changing");
}

function updateSharedSecondaryWheel({ animate = false, fullTurn = false, fullTurnTargetOpen = false } = {}) {
  const wheel = els.toggleImagePreviewDrawer;
  if (!wheel) return;
  ensureImagePreviewDrawerToggleMounted();
  const tabId = activePanelTabId();
  const isUsersTab = tabId === "users" || !isEditorSite();
  const isMediaTab = tabId === "media";
  const isElementsTab = tabId === "elements";
  const supportsPreview = tabId === "map-ui" || tabId === "trips";
  const open = isElementsTab
    ? Boolean(els.elementsStyleDrawer?.classList.contains("is-open"))
    : supportsPreview && Boolean(!els.imagePreviewDrawer?.hidden && els.imagePreviewDrawer?.getAttribute("aria-hidden") !== "true");
  // UI retains the shared wheel as a stable spatial landmark, but has no
  // secondary map drawer to open. Keep it visible and visibly unavailable.
  wheel.hidden = !isEditorSite();
  wheel.disabled = isMediaTab || isUsersTab;
  wheel.classList.toggle("is-secondary-wheel-disabled", isMediaTab || isUsersTab);
  wheel.setAttribute("aria-expanded", String(open));
  wheel.setAttribute("aria-label", isMediaTab || isUsersTab
    ? `No secondary panel on ${isUsersTab ? "UI" : "Media"}`
    : open ? "Collapse secondary panel" : "Expand secondary panel");
  syncSecondaryWheelToggle(wheel, open, { animate, fullTurn, fullTurnTargetOpen });
}

function toggleActiveSecondaryPanel() {
  const tabId = activePanelTabId();
  if (tabId === "elements") {
    setElementsDrawerOpen(!els.elementsStyleDrawer?.classList.contains("is-open"));
  } else if (tabId === "map-ui" || tabId === "trips") {
    setImagePreviewDrawerOpen(els.toggleImagePreviewDrawer?.getAttribute("aria-expanded") !== "true");
  }
}

function updateElementsDrawerToggleState(options = {}) {
  updateSharedSecondaryWheel(options);
}

function setElementsDrawerOpen(open, { animate = true, fullTurn = false, fullTurnTargetOpen = false } = {}) {
  if (!els.elementsStyleDrawer) return;
  ensureElementsDrawerToggle();
  updateSecondaryDrawerTogglePosition();
  clearTimeout(elementsDrawerHideTimer);
  if (open) {
    els.elementsStyleDrawer.hidden = false;
    els.elementsStyleDrawer.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => {
      els.elementsStyleDrawer.classList.add("is-open");
      updateElementsDrawerToggleState({ animate, fullTurn, fullTurnTargetOpen });
    });
    syncMapAfterPanelLayoutChange();
    return;
  }
  els.elementsStyleDrawer.classList.remove("is-open");
  els.elementsStyleDrawer.setAttribute("aria-hidden", "true");
  updateElementsDrawerToggleState({ animate, fullTurn, fullTurnTargetOpen });
  if (!animate) {
    clearTimeout(elementsDrawerHideTimer);
    els.elementsStyleDrawer.hidden = true;
    syncMapAfterPanelLayoutChange();
    return;
  }
  elementsDrawerHideTimer = window.setTimeout(() => {
    if (!els.elementsStyleDrawer.classList.contains("is-open")) {
      els.elementsStyleDrawer.hidden = true;
    }
  }, 520);
  syncMapAfterPanelLayoutChange();
}

function ensureThemeEditableRenderer() {
  if (!mapLibreBasemapEnabled()) return;
  if (mapThemeMode === "custom") return;
  const providerTheme = getActiveProviderThemeAsSemanticTheme();
  if (providerTheme?.styles) {
    Object.entries(providerTheme.styles).forEach(([key, style]) => {
      if (!layerStyles[key]) return;
      if (typeof style.color === "string") layerStyles[key].color = style.color;
      if (typeof style.size === "number") layerStyles[key].size = clamp(style.size, layerStyles[key].min, layerStyles[key].max);
      if (typeof style.opacity === "number") layerStyles[key].opacity = clamp(style.opacity, 0, 1);
      if (typeof style.blend === "string") layerStyles[key].blend = style.blend;
      if (typeof style.colorHigh === "string") layerStyles[key].colorHigh = style.colorHigh;
    });
  }
  setMapThemeMode("custom");
  activeProviderThemeId = null;
  activeTheme = activeThemeFromLayerStyles();
  if (els.status) {
    els.status.textContent = "Using custom theme mode so map colors and textures can be edited.";
  }
  applyThemeToMapLibreRenderer(activeTheme);
  applyTextureOverlays(activeTheme);
}

function getActiveProviderThemeAsSemanticTheme() {
  if (mapThemeMode !== "provider") return null;
  const providerStyle = activeProviderThemeId
    ? MAPLIBRE_STYLES.find(item => item.id === activeProviderThemeId)
    : activeMapLibreStyle();
  return providerStyle ? mapLibreStyleToRouteTheme(providerStyle) : null;
}



function removeUserLayoutControl(controlId, { returnRecorded = true, history = true } = {}) {
  const placement = findUserLayoutControl(controlId);
  if (!placement) return false;
  placement.section.controls.splice(placement.index, 1);
  if (placement.section.frameHost && placement.section.controls.length === 0) {
    userViewDraft.layout.elements = userLayoutElements().filter(element => element.id !== placement.section.id);
  }
  selectedUserLayoutControlIds.delete(controlId);
  selectedUserLayoutControlId = [...selectedUserLayoutControlIds][0] || "";
  const entry = getSettingEntry(controlId);
  if (returnRecorded && entry?.userSafe && !userViewDraft.recordedControls.includes(controlId)) {
    userViewDraft.recordedControls.push(controlId);
  }
  renderUserViewDraftUi();
  if (history) pushUserBuilderHistory(`Remove ${entry ? friendlySettingLabel(entry) : userLayoutBuiltinControl(controlId)?.label || "control"} from section`);
  return true;
}

function ensureUserLayoutFrameHost(region) {
  const validRegion = validUserViewPanel(region);
  if (!validRegion) return null;
  let host = userLayoutElements().find(element => element.type === "section" && element.frameHost && element.region === validRegion);
  if (host) return host;
  host = {
    id: nextUserLayoutId(`frame-controls-${validRegion}`),
    type: "section",
    region: validRegion,
    parentId: "",
    parentFace: "front",
    label: "Frame controls",
    frameHost: true,
    flip: normalizeUserLayoutFlip(),
    controls: [],
    x: 0,
    y: 0,
    width: 1,
    height: 1
  };
  userViewDraft.layout.elements.push(host);
  return host;
}

function closeUserControlPlacementMenu() {
  document.querySelector("#usersControlPlacementMenu")?.remove();
  userControlPlacementMenuState = null;
}

function openUserControlPlacementMenu({ controlId, sectionId, targetId, source, x, y }) {
  closeUserControlPlacementMenu();
  userControlPlacementMenuState = { controlId, sectionId, targetId, source };
  const menu = document.createElement("div");
  menu.id = "usersControlPlacementMenu";
  menu.className = "users-control-placement-menu";
  menu.setAttribute("role", "menu");
  const title = document.createElement("strong");
  title.textContent = "Place control";
  menu.append(title);
  [["right", "To the right"], ["left", "To the left"], ["above", "Above this control"], ["below", "Below this control"], ["top-row", "New row above"], ["bottom-row", "New row below"], ["row", "Arrange all as a row"], ["column", "Arrange all as a column"], ["right-column", "New right column"], ["left-column", "New left column"]].forEach(([mode, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = label;
    button.addEventListener("click", () => {
      placeUserLayoutControl(controlId, sectionId, source, { targetId, mode });
      closeUserControlPlacementMenu();
    });
    menu.append(button);
  });
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${clamp(x, 8, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${clamp(y, 8, window.innerHeight - rect.height - 8)}px`;
}

function placeUserLayoutControl(controlId, sectionId, source = "recorded", placement = {}, { allowReposition = false } = {}) {
  if (!canDropUserLayoutControl(controlId, sectionId, { allowReposition })) {
    setUserLayoutStatus("That control is already in this section or cannot be placed here.", true);
    return false;
  }
  const beforeLayout = cloneUserViewDraftState(userViewDraft.layout);
  const beforeRecorded = [...userViewDraft.recordedControls];
  const existing = findUserLayoutControl(controlId);
  const previousSection = existing?.section || null;
  const existingSettings = existing ? {
    assignedControlId: String(existing.item.assignedControlId || ""),
    customLabel: String(existing.item.customLabel || ""),
    showLabel: existing.item.showLabel !== false,
    controlConfig: normalizeUserLayoutControlConfig(existing.item.controlConfig),
    appearance: normalizeUserControlAppearanceOverrides(existing.item.appearance)
  } : {
    assignedControlId: "",
    customLabel: "",
    showLabel: true,
    controlConfig: normalizeUserLayoutControlConfig({
      gizmoTemplateId: source === "recorded" ? defaultUserGizmoTemplateForEntry(getSettingEntry(controlId))?.id : ""
    }),
    appearance: {}
  };
  if (existing) existing.section.controls.splice(existing.index, 1);
  if (previousSection?.frameHost && previousSection.controls.length === 0) {
    userViewDraft.layout.elements = userLayoutElements().filter(element => element.id !== previousSection.id);
  }
  const section = userLayoutElementById(sectionId);
  if (!Array.isArray(section.controls)) section.controls = [];
  const item = {
    type: "control",
    controlId,
    face: userLayoutSectionActiveFace(section),
    source: userLayoutBuiltinControl(controlId) ? "builtin" : "recorded",
    ...existingSettings,
    x: 0,
    y: 0,
    width: 1,
    height: 1
  };
  if (placement.geometry) {
    Object.assign(item, placement.geometry);
  } else if (placement.mode === "smart" || !section.controls.length) {
    if (!placeUserLayoutControlInOpenSpace(section, item, placement)) {
      userViewDraft.layout = beforeLayout;
      userViewDraft.recordedControls.splice(0, userViewDraft.recordedControls.length, ...beforeRecorded);
      renderUserViewDraftUi();
      setUserLayoutStatus("That section does not have enough open space for the control.", true);
      return false;
    }
  } else {
    applyUserLayoutControlPlacement(section, item, placement.targetId || "", placement.mode || "row");
  }
  section.controls.push(item);
  userViewDraft.recordedControls = userViewDraft.recordedControls.filter(id => id !== controlId);
  renderUserViewDraftUi();
  if (!userLayoutSectionControlsFit(sectionId)) {
    userViewDraft.layout = beforeLayout;
    userViewDraft.recordedControls.splice(0, userViewDraft.recordedControls.length, ...beforeRecorded);
    renderUserViewDraftUi();
    setUserLayoutStatus("That control needs more room. Enlarge the section before placing it.", true);
    return false;
  }
  const label = getSettingEntry(controlId) ? friendlySettingLabel(getSettingEntry(controlId)) : userLayoutBuiltinControl(controlId)?.label || "Control";
  setUserLayoutStatus(`${label} placed in ${section.label || "section"}.`);
  pushUserBuilderHistory(`Place ${label} in ${section.label || "section"}`);
  return true;
}

function bindUserLayoutControlDropTarget(target, section, highlightTarget = target) {
  target.addEventListener("dragenter", event => {
    const payload = readBuilderControlDragPayload(event);
    const controlId = payload?.controlId || userBuilderDragState?.controlId || userBuilderDragState?.settingId || "";
    if (!canDropUserLayoutControl(controlId, section.id)) return;
    event.preventDefault();
    event.stopPropagation();
    highlightTarget.classList.add("is-user-builder-drop-target");
  });
  target.addEventListener("dragover", event => {
    const payload = readBuilderControlDragPayload(event);
    const controlId = payload?.controlId || userBuilderDragState?.controlId || userBuilderDragState?.settingId || "";
    if (!canDropUserLayoutControl(controlId, section.id)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    highlightTarget.classList.add("is-user-builder-drop-target");
  });
  target.addEventListener("dragleave", event => {
    if (event.relatedTarget && target.contains(event.relatedTarget)) return;
    highlightTarget.classList.remove("is-user-builder-drop-target");
  });
  target.addEventListener("drop", event => {
    const payload = readBuilderControlDragPayload(event);
    const controlId = payload?.controlId || userBuilderDragState?.controlId || userBuilderDragState?.settingId || "";
    if (!canDropUserLayoutControl(controlId, section.id)) return;
    event.preventDefault();
    event.stopPropagation();
    highlightTarget.classList.remove("is-user-builder-drop-target");
    const targetControl = event.target.closest?.(".user-layout-control-object")?.dataset.controlId || "";
    const fallbackTarget = section.controls.find(control => control.controlId !== controlId)?.controlId || "";
    const source = payload?.source || userBuilderDragState?.source || "recorded";
    if ((targetControl && targetControl !== controlId) || fallbackTarget) {
      openUserControlPlacementMenu({ controlId, sectionId: section.id, targetId: targetControl || fallbackTarget, source, x: event.clientX + 8, y: event.clientY + 8 });
    } else {
      placeUserLayoutControl(controlId, section.id, source);
    }
    clearUserBuilderDragState();
  });
}

function beginUserLayoutControlManipulation(event) {
  if (!isUsersBuilderMode() || event.button !== 0 || userLayoutControlManipulationState || userBuilderPointerDragState) return;
  const object = event.currentTarget;
  if (event.target.closest("[data-user-layout-control-remove]")) return;
  const controlId = object.dataset.controlId;
  const placement = findUserLayoutControl(controlId);
  if (!placement) return;
  if (userGizmoStylePaint) {
    event.preventDefault();
    event.stopPropagation();
    if (userGizmoStyleFamily(userGizmoDefinitionForItem(placement.item)) !== userGizmoStylePaint.family) {
      setUserLayoutStatus("That Gizmo is not compatible with the copied style.", true);
      return;
    }
    placement.item.appearance = normalizeUserControlAppearanceOverrides(userGizmoStylePaint.appearance);
    placement.item.controlConfig = normalizeUserLayoutControlConfig({
      ...placement.item.controlConfig,
      buttonShape: userGizmoStylePaint.buttonShape,
      gizmoTemplateId: userGizmoStylePaint.gizmoTemplateId || placement.item.controlConfig?.gizmoTemplateId
    });
    renderUserFrameLayout();
    selectUserLayoutControl(controlId);
    markUserGizmoStylePaintTargets();
    pushUserBuilderHistory(`Paste Gizmo style onto ${userLayoutControlDisplayLabel(placement.item)}`);
    setUserLayoutStatus(`Style pasted onto ${userLayoutControlDisplayLabel(placement.item)}. Paint mode remains on.`);
    return;
  }
  const handle = event.target.closest("[data-layout-handle]")?.dataset.layoutHandle || "move";
  const interactiveGesture = handle === "move" && Boolean(event.target.closest(".user-gizmo-face button, .user-gizmo-face input, .user-gizmo-face select, .user-gizmo-face textarea, .user-gizmo-face label"));
  if (!interactiveGesture) event.preventDefault();
  event.stopPropagation();
  const content = object.closest(".user-layout-section-content");
  const rect = content.getBoundingClientRect();
  const objectRect = object.getBoundingClientRect();
  selectUserLayoutControl(controlId, { render: false });
  userLayoutControlManipulationState = {
    pointerId: event.pointerId,
    controlId,
    sectionId: placement.section.id,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    metrics: rect,
    grabOffsetX: (event.clientX - objectRect.left) / Math.max(1, objectRect.width),
    grabOffsetY: (event.clientY - objectRect.top) / Math.max(1, objectRect.height),
    lastClientX: event.clientX,
    lastClientY: event.clientY,
    active: !interactiveGesture,
    activationRect: objectRect,
    dropSectionId: "",
    dropRegion: "",
    dropTarget: null,
    invalidExternalDrop: false,
    mapDropRejected: false,
    targetTooSmall: false,
    initial: cloneUserViewDraftState(placement.item),
    lastValid: cloneUserViewDraftState(placement.item)
  };
  if (!interactiveGesture) {
    object.classList.add("is-transforming");
    document.body.classList.add("is-transforming-user-gizmo");
    object.setPointerCapture?.(event.pointerId);
  }
  const update = moveEvent => {
    const state = userLayoutControlManipulationState;
    const currentPlacement = findUserLayoutControl(state?.controlId);
    if (!state || !currentPlacement) return;
    if (!state.active) {
      const bounds = state.activationRect;
      const outside = moveEvent.clientX < bounds.left || moveEvent.clientX > bounds.right
        || moveEvent.clientY < bounds.top || moveEvent.clientY > bounds.bottom;
      if (!outside) return;
      state.active = true;
      moveEvent.preventDefault();
      object.classList.add("is-transforming");
      document.body.classList.add("is-transforming-user-gizmo");
      object.setPointerCapture?.(state.pointerId);
    }
    state.lastClientX = moveEvent.clientX;
    state.lastClientY = moveEvent.clientY;
    const dx = (moveEvent.clientX - state.startX) / state.metrics.width;
    const dy = (moveEvent.clientY - state.startY) / state.metrics.height;
    const next = cloneUserViewDraftState(state.initial);
    if (state.handle === "move") {
      const mapRect = els.userMapViewport?.getBoundingClientRect?.();
      const mapDropRejected = !currentPlacement.item?.allowMapOverlap && mapRect
        && moveEvent.clientX >= mapRect.left && moveEvent.clientX <= mapRect.right
        && moveEvent.clientY >= mapRect.top && moveEvent.clientY <= mapRect.bottom;
      const elementsAtPointer = document.elementsFromPoint(moveEvent.clientX, moveEvent.clientY);
      const dropContent = elementsAtPointer
        .map(node => node.closest?.(".user-layout-section-content"))
        .find(content => content && content.dataset.layoutParentId !== state.sectionId);
      const dropSectionId = dropContent?.dataset.layoutParentId || "";
      const dropRegionNode = !dropContent
        ? elementsAtPointer
          .map(node => node.closest?.(".user-layout-region[data-layout-region]"))
          .find(region => region && region !== object.closest(".user-layout-region[data-layout-region]"))
        : null;
      state.dropTarget?.classList.remove("is-direct-transform-drop-target");
      state.dropTarget = !mapDropRejected && dropSectionId && dropSectionId !== state.sectionId ? dropContent : null;
      state.dropSectionId = state.dropTarget ? dropSectionId : "";
      state.dropRegion = mapDropRejected ? "" : (dropRegionNode?.dataset.layoutRegion || "");
      state.mapDropRejected = Boolean(mapDropRejected);
      const insideSource = moveEvent.clientX >= state.metrics.left && moveEvent.clientX <= state.metrics.right
        && moveEvent.clientY >= state.metrics.top && moveEvent.clientY <= state.metrics.bottom;
      state.invalidExternalDrop = state.mapDropRejected || (!insideSource && !state.dropSectionId && !state.dropRegion);
      state.dropTarget?.classList.add("is-direct-transform-drop-target");
      if (state.dropSectionId || state.dropRegion || state.invalidExternalDrop) {
        object.style.left = `${(state.initial.x + dx) * 100}%`;
        object.style.top = `${(state.initial.y + dy) * 100}%`;
        return;
      }
      next.x = clamp(next.x + dx, 0, 1 - next.width);
      next.y = clamp(next.y + dy, 0, 1 - next.height);
      applyUserLayoutControlSnap(next, currentPlacement.section, state.metrics, controlId);
    } else {
      if (userLayoutControlUsesSquareGeometry(next)) {
        const width = state.metrics.width;
        const height = state.metrics.height;
        const initialLeft = state.initial.x * width;
        const initialTop = state.initial.y * height;
        const initialSize = Math.min(state.initial.width * width, state.initial.height * height);
        const initialRight = initialLeft + initialSize;
        const initialBottom = initialTop + initialSize;
        const centerX = initialLeft + initialSize / 2;
        const centerY = initialTop + initialSize / 2;
        const dxPixels = moveEvent.clientX - state.startX;
        const dyPixels = moveEvent.clientY - state.startY;
        const horizontalDelta = state.handle.includes("w") ? -dxPixels : dxPixels;
        const verticalDelta = state.handle.includes("n") ? -dyPixels : dyPixels;
        const sideHandle = ["n", "e", "s", "w"].includes(state.handle);
        const desiredDelta = state.handle === "n" || state.handle === "s"
          ? verticalDelta
          : state.handle === "e" || state.handle === "w"
            ? horizontalDelta
            : Math.abs(horizontalDelta) >= Math.abs(verticalDelta) ? horizontalDelta : verticalDelta;
        const horizontalMaximum = sideHandle ? Math.min(centerX * 2, (width - centerX) * 2)
          : state.handle.includes("w") ? initialRight
          : state.handle.includes("e") ? width - initialLeft
            : Math.min(centerX * 2, (width - centerX) * 2);
        const verticalMaximum = sideHandle ? Math.min(centerY * 2, (height - centerY) * 2)
          : state.handle.includes("n") ? initialBottom
          : state.handle.includes("s") ? height - initialTop
            : Math.min(centerY * 2, (height - centerY) * 2);
        const size = clamp(initialSize + desiredDelta * (sideHandle ? 2 : 1), 42, Math.max(42, Math.min(horizontalMaximum, verticalMaximum)));
        const left = sideHandle ? centerX - size / 2
          : state.handle.includes("w") ? initialRight - size
          : state.handle.includes("e") ? initialLeft
            : centerX - size / 2;
        const top = sideHandle ? centerY - size / 2
          : state.handle.includes("n") ? initialBottom - size
          : state.handle.includes("s") ? initialTop
            : centerY - size / 2;
        next.x = left / width;
        next.y = top / height;
        next.width = size / width;
        next.height = size / height;
      } else {
        const minW = 72 / state.metrics.width;
        const minH = 42 / state.metrics.height;
        if (state.handle.includes("e")) next.width = clamp(next.width + dx, minW, 1 - next.x);
        if (state.handle.includes("s")) next.height = clamp(next.height + dy, minH, 1 - next.y);
        if (state.handle.includes("w")) {
          const right = state.initial.x + state.initial.width;
          next.x = clamp(state.initial.x + dx, 0, right - minW);
          next.width = right - next.x;
        }
        if (state.handle.includes("n")) {
          const bottom = state.initial.y + state.initial.height;
          next.y = clamp(state.initial.y + dy, 0, bottom - minH);
          next.height = bottom - next.y;
        }
        if (moveEvent.shiftKey) {
          const width = state.metrics.width;
          const height = state.metrics.height;
          const initialWidthPx = state.initial.width * width;
          const initialHeightPx = state.initial.height * height;
          const aspect = initialWidthPx / Math.max(1, initialHeightPx);
          let widthPx = next.width * width;
          let heightPx = next.height * height;
          const horizontalHandle = state.handle.includes("e") || state.handle.includes("w");
          const verticalHandle = state.handle.includes("n") || state.handle.includes("s");
          if (horizontalHandle && !verticalHandle) heightPx = widthPx / aspect;
          else if (verticalHandle && !horizontalHandle) widthPx = heightPx * aspect;
          else if (Math.abs(widthPx - initialWidthPx) >= Math.abs(heightPx - initialHeightPx)) heightPx = widthPx / aspect;
          else widthPx = heightPx * aspect;
          widthPx = clamp(widthPx, 42, width);
          heightPx = clamp(heightPx, 42, height);
          const initialRight = (state.initial.x + state.initial.width) * width;
          const initialBottom = (state.initial.y + state.initial.height) * height;
          const centerX = (state.initial.x + state.initial.width / 2) * width;
          const centerY = (state.initial.y + state.initial.height / 2) * height;
          const leftPx = state.handle.includes("w") ? initialRight - widthPx
            : state.handle.includes("e") ? state.initial.x * width
              : centerX - widthPx / 2;
          const topPx = state.handle.includes("n") ? initialBottom - heightPx
            : state.handle.includes("s") ? state.initial.y * height
              : centerY - heightPx / 2;
          next.x = clamp(leftPx / width, 0, 1 - widthPx / width);
          next.y = clamp(topPx / height, 0, 1 - heightPx / height);
          next.width = widthPx / width;
          next.height = heightPx / height;
        }
      }
    }
    if (!userLayoutControlCandidateFits(currentPlacement.section, next, controlId)) {
      setUserLayoutStatus("Control spacing barrier reached.", true);
      return;
    }
    Object.assign(currentPlacement.item, next);
    state.lastValid = cloneUserViewDraftState(next);
    object.style.left = `${next.x * 100}%`;
    object.style.top = `${next.y * 100}%`;
    object.style.width = `${next.width * 100}%`;
    object.style.height = `${next.height * 100}%`;
    updateUserGeometryFields();
  };
  const removeListeners = () => {
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", cancel);
  };
  const finish = finishEvent => {
    const state = userLayoutControlManipulationState;
    if (!state || (Number.isFinite(finishEvent?.pointerId) && finishEvent.pointerId !== state.pointerId)) return;
    removeListeners();
    if (!state.active) {
      userLayoutControlManipulationState = null;
      return;
    }
    let current = findUserLayoutControl(state.controlId)?.item;
    let rejectedDrop = false;
    if (state.invalidExternalDrop) {
      const sourcePlacement = findUserLayoutControl(state.controlId);
      if (sourcePlacement) Object.assign(sourcePlacement.item, state.initial);
      current = sourcePlacement?.item || current;
      rejectedDrop = true;
    } else if (state.dropSectionId || state.dropRegion) {
      const sourcePlacement = findUserLayoutControl(state.controlId);
      const targetSection = state.dropSectionId ? userLayoutElementById(state.dropSectionId) : ensureUserLayoutFrameHost(state.dropRegion);
      if (!state.dropSectionId) renderUserFrameLayout();
      const targetContent = state.dropSectionId
        ? state.dropTarget
        : userQuery(userLayoutElementSelector("data-layout-parent-id", targetSection?.id));
      if (sourcePlacement && targetSection?.type === "section" && targetContent) {
        const targetRect = targetContent.getBoundingClientRect();
        const width = state.initial.width * state.metrics.width / Math.max(1, targetRect.width);
        const height = state.initial.height * state.metrics.height / Math.max(1, targetRect.height);
        state.targetTooSmall = !sourcePlacement?.item?.allowLayoutOverflow && (width > 1 || height > 1);
        const candidate = {
          ...state.initial,
          face: userLayoutSectionActiveFace(targetSection),
          width: clamp(width, 0.08, 1),
          height: clamp(height, 0.08, 1),
          x: clamp((state.lastClientX - targetRect.left) / targetRect.width - state.grabOffsetX * width, 0, 1 - width),
          y: clamp((state.lastClientY - targetRect.top) / targetRect.height - state.grabOffsetY * height, 0, 1 - height)
        };
        if (!state.targetTooSmall && userLayoutControlCandidateFits(targetSection, candidate, state.controlId)) {
          sourcePlacement.section.controls.splice(sourcePlacement.index, 1);
          if (sourcePlacement.section.frameHost && sourcePlacement.section.controls.length === 0) {
            userViewDraft.layout.elements = userLayoutElements().filter(element => element.id !== sourcePlacement.section.id);
          }
          targetSection.controls ||= [];
          targetSection.controls.push(candidate);
          current = candidate;
        } else {
          rejectedDrop = true;
        }
      }
    }
    state.dropTarget?.classList.remove("is-direct-transform-drop-target");
    object.classList.remove("is-transforming");
    if (object.hasPointerCapture?.(state.pointerId)) object.releasePointerCapture(state.pointerId);
    document.body.classList.remove("is-transforming-user-gizmo");
    userLayoutControlManipulationState = null;
    renderUserFrameLayout();
    updateUserGeometryFields();
    if (rejectedDrop) {
      const restored = userQuery(`.user-layout-control-object${userLayoutElementSelector("data-control-id", state.controlId)}`);
      bounceUserBuilderControlSource(restored);
      setUserLayoutStatus(state.mapDropRejected
        ? "The map viewport is protected, so the gizmo returned to its starting position."
        : "That cell is too small for this gizmo, so it returned to its starting position.", true);
    }
    if (current && JSON.stringify(current) !== JSON.stringify(state.initial)) {
      pushUserBuilderHistory("Resize or move User UI control");
    }
  };
  const cancel = cancelEvent => {
    const state = userLayoutControlManipulationState;
    if (!state) return;
    if (cancelEvent.type === "keydown" && cancelEvent.key !== "Escape") return;
    if (cancelEvent.type !== "keydown" && cancelEvent.pointerId !== state.pointerId) return;
    cancelEvent.preventDefault?.();
    removeListeners();
    const placement = findUserLayoutControl(state.controlId);
    if (placement) Object.assign(placement.item, state.initial);
    object.classList.remove("is-transforming");
    state.dropTarget?.classList.remove("is-direct-transform-drop-target");
    if (object.hasPointerCapture?.(state.pointerId)) object.releasePointerCapture(state.pointerId);
    document.body.classList.remove("is-transforming-user-gizmo");
    userLayoutControlManipulationState = null;
    renderUserFrameLayout();
    updateUserGeometryFields();
    setUserLayoutStatus("Control resize or move canceled.");
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", finish);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", cancel);
}

function userGizmoDefinitionForItem(item) {
  return userGizmoTemplate(normalizeUserLayoutControlConfig(item?.controlConfig).gizmoTemplateId)
    || userLayoutBuiltinControl(item?.controlId)
    || getSettingEntry(item?.controlId);
}

function markUserGizmoStylePaintTargets() {
  userQueryAll(".user-layout-control-object[data-control-id]").forEach(node => {
    const placement = findUserLayoutControl(node.dataset.controlId);
    const compatible = Boolean(userGizmoStylePaint && placement
      && userGizmoStyleFamily(userGizmoDefinitionForItem(placement.item)) === userGizmoStylePaint.family);
    node.classList.toggle("is-user-style-paint-compatible", compatible);
    node.classList.toggle("is-user-style-paint-incompatible", Boolean(userGizmoStylePaint && !compatible));
  });
}

function userGizmoStylePayload(item) {
  const config = normalizeUserLayoutControlConfig(item?.controlConfig);
  const definition = userGizmoDefinitionForItem(item);
  return {
    family: userGizmoStyleFamily(definition),
    appearance: normalizeUserControlAppearanceOverrides(item?.appearance),
    buttonShape: userLayoutControlButtonShape(item),
    gizmoTemplateId: config.gizmoTemplateId
  };
}

function loadUserGizmoStylePresets() {
  const saved = rvStorageReadJson(USER_GIZMO_STYLE_PRESETS_KEY, []);
  return Array.isArray(saved) ? saved.filter(item => item?.name && item?.style).slice(0, 60) : [];
}

function openUserGizmoQuickTools(controlId, anchor) {
  userQuery(".users-gizmo-quick-tools")?.remove();
  const placement = findUserLayoutControl(controlId);
  if (!placement) return;
  const original = cloneUserViewDraftState({ appearance: placement.item.appearance || {}, controlConfig: placement.item.controlConfig || {} });
  const originalPaint = userGizmoStylePaint ? cloneUserViewDraftState(userGizmoStylePaint) : null;
  const menu = document.createElement("div");
  menu.className = "users-gizmo-quick-tools";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", `Quick appearance tools for ${userLayoutControlDisplayLabel(placement.item)}`);
  const title = document.createElement("strong");
  title.textContent = userLayoutControlDisplayLabel(placement.item);
  menu.append(title);
  const field = (labelText, control) => {
    const label = document.createElement("label");
    label.append(labelText, control);
    menu.append(label);
    return control;
  };
  const shape = document.createElement("select");
  [["inherit", "Template shape"], ["rounded", "Rounded"], ["pill", "Pill"], ["circle", "Circle"], ["square", "Square"]].forEach(([value, text]) => shape.append(new Option(text, value)));
  shape.value = normalizeUserLayoutControlConfig(placement.item.controlConfig).buttonShape;
  field("Shape", shape);
  const fill = document.createElement("input"); fill.type = "color"; fill.value = effectiveUserControlAppearance(placement.item).buttonFill;
  field("Fill", fill);
  const textColor = document.createElement("input"); textColor.type = "color"; textColor.value = effectiveUserControlAppearance(placement.item).buttonText;
  field("Font color", textColor);
  const font = document.createElement("select");
  [["inherit", "Theme font"], ["Arial, sans-serif", "Arial"], ["Verdana, sans-serif", "Verdana"], ["Georgia, serif", "Georgia"], ["'Courier New', monospace", "Courier"]].forEach(([value, text]) => font.append(new Option(text, value)));
  font.value = effectiveUserControlAppearance(placement.item).fontFamily;
  field("Font", font);
  const edge = document.createElement("select");
  [["none", "No edge"], ["material", "Material bevel"], ["solid", "Solid"], ["inset", "Inset"], ["outset", "Raised"], ["stitched", "Sewn / stitched"]].forEach(([value, text]) => edge.append(new Option(text, value)));
  edge.value = effectiveUserControlAppearance(placement.item).buttonEdgeStyle;
  field("Edging", edge);
  const edgeWidth = document.createElement("input"); edgeWidth.type = "range"; edgeWidth.min = "0"; edgeWidth.max = "12"; edgeWidth.step = "0.5"; edgeWidth.value = effectiveUserControlAppearance(placement.item).buttonEdgeWidth;
  field("Edge thickness", edgeWidth);
  const update = () => {
    placement.item.controlConfig = normalizeUserLayoutControlConfig({ ...placement.item.controlConfig, buttonShape: shape.value });
    placement.item.appearance = normalizeUserControlAppearanceOverrides({
      ...placement.item.appearance,
      buttonFill: fill.value,
      buttonText: textColor.value,
      fontFamily: font.value,
      buttonEdgeStyle: edge.value,
      buttonEdgeWidth: Number(edgeWidth.value)
    });
    renderUserFrameLayout();
  };
  [shape, fill, textColor, font, edge, edgeWidth].forEach(control => control.addEventListener("input", update));
  if (typeof sfxCreateGizmoSection === "function") menu.append(sfxCreateGizmoSection(placement, { compact: true }));
  const presets = document.createElement("select");
  presets.append(new Option("Apply style preset…", ""));
  loadUserGizmoStylePresets().filter(preset => preset.style.family === userGizmoStylePayload(placement.item).family).forEach((preset, index) => presets.append(new Option(preset.name, String(index))));
  presets.addEventListener("change", () => {
    const compatible = loadUserGizmoStylePresets().filter(preset => preset.style.family === userGizmoStylePayload(placement.item).family);
    const preset = compatible[Number(presets.value)];
    if (!preset) return;
    placement.item.appearance = normalizeUserControlAppearanceOverrides(preset.style.appearance);
    placement.item.controlConfig = normalizeUserLayoutControlConfig({ ...placement.item.controlConfig, buttonShape: preset.style.buttonShape, gizmoTemplateId: preset.style.gizmoTemplateId || placement.item.controlConfig?.gizmoTemplateId });
    renderUserViewDraftUi();
  });
  const presetRow = document.createElement("div"); presetRow.className = "users-gizmo-preset-row";
  const paint = document.createElement("button"); paint.type = "button"; paint.textContent = userGizmoStylePaint ? "Stop painting" : "◩ Paint style";
  const refreshPaint = () => {
    document.body.classList.toggle("is-painting-user-gizmo-styles", Boolean(userGizmoStylePaint));
    paint.textContent = userGizmoStylePaint ? "Stop painting" : "◩ Paint style";
    markUserGizmoStylePaintTargets();
  };
  paint.addEventListener("click", () => {
    userGizmoStylePaint = userGizmoStylePaint ? null : userGizmoStylePayload(placement.item);
    refreshPaint();
    setUserLayoutStatus(userGizmoStylePaint ? "Paint style is on. Compatible Gizmos glow; incompatible Gizmos are dimmed." : "Paint style is off.");
  });
  presetRow.append(presets, paint);
  menu.append(presetRow);
  const presetGrid = document.createElement("div");
  presetGrid.className = "users-gizmo-preset-preview-grid";
  loadUserGizmoStylePresets()
    .filter(preset => preset.style.family === userGizmoStylePayload(placement.item).family)
    .forEach(preset => {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.title = `Apply ${preset.name}`;
      const template = userGizmoTemplate(preset.style.gizmoTemplateId)
        || userGizmoTemplate(normalizeUserLayoutControlConfig(placement.item.controlConfig).gizmoTemplateId);
      const preview = template ? createUserGizmoFace(template, { interactive: false }) : document.createElement("span");
      preview.style.setProperty("--user-button-fill", preset.style.appearance?.buttonFill || "#384653");
      preview.style.setProperty("--user-button-text", preset.style.appearance?.buttonText || "#fffdf8");
      const name = document.createElement("span");
      name.textContent = preset.name;
      tile.append(preview, name);
      tile.addEventListener("click", () => {
        placement.item.appearance = normalizeUserControlAppearanceOverrides(preset.style.appearance);
        placement.item.controlConfig = normalizeUserLayoutControlConfig({
          ...placement.item.controlConfig,
          buttonShape: preset.style.buttonShape,
          gizmoTemplateId: preset.style.gizmoTemplateId || placement.item.controlConfig?.gizmoTemplateId
        });
        renderUserViewDraftUi();
      });
      presetGrid.append(tile);
    });
  if (presetGrid.childElementCount) menu.append(presetGrid);
  const actions = document.createElement("div"); actions.className = "users-gizmo-quick-actions";
  const save = document.createElement("button"); save.type = "button"; save.textContent = "Save preset";
  save.addEventListener("click", () => {
    const name = window.prompt("Name this Gizmo style preset:", userLayoutControlDisplayLabel(placement.item));
    if (!String(name || "").trim()) return;
    const saved = loadUserGizmoStylePresets();
    saved.push({ name: String(name).trim().slice(0, 60), style: userGizmoStylePayload(placement.item) });
    rvStorageWriteJson(USER_GIZMO_STYLE_PRESETS_KEY, saved);
    setUserLayoutStatus(`${name} style preset saved.`);
  });
  const okay = document.createElement("button"); okay.type = "button"; okay.textContent = "OK";
  okay.addEventListener("click", () => {
    menu.remove();
    pushUserBuilderHistory(`Update ${userLayoutControlDisplayLabel(placement.item)} appearance`);
  });
  const cancelButton = document.createElement("button"); cancelButton.type = "button"; cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () => {
    placement.item.appearance = normalizeUserControlAppearanceOverrides(original.appearance);
    placement.item.controlConfig = normalizeUserLayoutControlConfig(original.controlConfig);
    userGizmoStylePaint = originalPaint;
    document.body.classList.toggle("is-painting-user-gizmo-styles", Boolean(userGizmoStylePaint));
    menu.remove();
    renderUserFrameLayout();
    markUserGizmoStylePaintTargets();
    setUserLayoutStatus("Quick appearance changes canceled.");
  });
  actions.append(save, okay, cancelButton); menu.append(actions);
  document.body.append(menu);
  const rect = menu.getBoundingClientRect();
  const anchorRect = capturedAnchorRect || { left: window.innerWidth / 2, right: window.innerWidth / 2, top: window.innerHeight / 2, bottom: window.innerHeight / 2, width: 0, height: 0 };
  const roomRight = window.innerWidth - anchorRect.right;
  const roomLeft = anchorRect.left;
  const preferredLeft = roomRight >= rect.width + 12 || roomRight >= roomLeft
    ? anchorRect.right + 10
    : anchorRect.left - rect.width - 10;
  const preferredTop = anchorRect.top + anchorRect.height / 2 - rect.height / 2;
  menu.style.left = `${clamp(preferredLeft, 8, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${clamp(preferredTop, 8, window.innerHeight - rect.height - 8)}px`;
}



function setUserLayoutStatus(message, blocked = false) {
  if (els.usersLayoutDrawingStatus) els.usersLayoutDrawingStatus.textContent = message;
  els.userFrameLayoutLayer?.classList.toggle("is-layout-blocked", blocked);
}

function selectUserLayoutElement(id = "", { toggle = false, additive = false } = {}) {
  const validId = userLayoutElementById(id) ? id : "";
  if (validId) {
    selectedUserLayoutControlIds.clear();
    selectedUserLayoutControlId = "";
  }
  if (!additive && !toggle) selectedUserLayoutElementIds.clear();
  if (validId) {
    if (toggle && selectedUserLayoutElementIds.has(validId)) selectedUserLayoutElementIds.delete(validId);
    else selectedUserLayoutElementIds.add(validId);
  }
  selectedUserLayoutElementId = validId && selectedUserLayoutElementIds.has(validId)
    ? validId
    : [...selectedUserLayoutElementIds][0] || "";
  if (validId) userLayoutSelectionEmphasized = true;
  if (els.usersLayoutDeleteSelected) els.usersLayoutDeleteSelected.disabled = selectedUserLayoutElementIds.size === 0;
  updateUserArrangementControls();
  updateUserGeometryFields();
  renderUserAppearanceSections();
  renderUserViewDraftUi();
}

function clearUserLayoutSelection({ render = true } = {}) {
  selectedUserLayoutElementIds.clear();
  selectedUserLayoutControlIds.clear();
  selectedUserLayoutElementId = "";
  selectedUserLayoutControlId = "";
  userLayoutSelectionEmphasized = false;
  if (els.usersLayoutDeleteSelected) els.usersLayoutDeleteSelected.disabled = true;
  updateUserArrangementControls();
  updateUserGeometryFields();
  renderUserAppearanceSections();
  if (render) renderUserFrameLayout();
}

function selectUserLayoutControl(controlId = "", { toggle = false, additive = false, render = true } = {}) {
  const validId = findUserLayoutControl(controlId) ? controlId : "";
  if (!additive && !toggle) selectedUserLayoutControlIds.clear();
  if (validId) {
    if (toggle && selectedUserLayoutControlIds.has(validId)) selectedUserLayoutControlIds.delete(validId);
    else selectedUserLayoutControlIds.add(validId);
  }
  selectedUserLayoutControlId = validId && selectedUserLayoutControlIds.has(validId)
    ? validId
    : [...selectedUserLayoutControlIds][0] || "";
  selectedUserLayoutElementIds.clear();
  selectedUserLayoutElementId = "";
  if (els.usersLayoutDeleteSelected) els.usersLayoutDeleteSelected.disabled = selectedUserLayoutControlIds.size === 0;
  updateUserArrangementControls();
  updateUserGeometryFields();
  renderUserAppearanceSections();
  if (render) renderUserFrameLayout();
  else userQueryAll(".user-layout-control-object[data-control-id]").forEach(node => {
    node.classList.toggle("is-selected", selectedUserLayoutControlIds.has(node.dataset.controlId));
  });
}

function setUserLayoutSelectionEmphasized(emphasized) {
  userLayoutSelectionEmphasized = Boolean(emphasized);
  userQueryAll(".user-layout-object.is-selected").forEach(node => {
    node.classList.toggle("is-selection-muted", !userLayoutSelectionEmphasized);
  });
}

function addUserLayoutGestureElement(state) {
  const metrics = userLayoutHostMetrics(state.host);
  if (!metrics) return false;
  const first = state.start;
  const last = state.current || first;
  const left = Math.min(first.x, last.x);
  const right = Math.max(first.x, last.x);
  const top = Math.min(first.y, last.y);
  const bottom = Math.max(first.y, last.y);
  const width = right - left;
  const height = bottom - top;
  const sectionGesture = width >= (state.parentId ? 44 : 56) && height >= (state.parentId ? 34 : 42);
  let candidate;
  if (sectionGesture) {
    candidate = {
      id: nextUserLayoutId(state.parentId ? "subsection" : "section"),
      type: "section",
      region: state.region,
      parentId: state.parentId,
      parentFace: state.parentId ? userLayoutSectionActiveFace(state.parentId) : "front",
      label: state.parentId ? "Subsection" : "Section",
      flip: normalizeUserLayoutFlip(),
      controls: [],
      x: clamp(left / metrics.width, 0, 1),
      y: clamp(top / metrics.height, 0, 1),
      width: clamp(width / metrics.width, 0.04, 1),
      height: clamp(height / metrics.height, 0.04, 1)
    };
  } else {
    if (Math.max(width, height) < 28) {
      setUserLayoutStatus("Drag farther for a divider, or farther in both directions for a section.", true);
      return false;
    }
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const snappedEnd = Math.abs(dx) >= Math.abs(dy)
      ? { x: last.x, y: first.y }
      : { x: first.x, y: last.y };
    candidate = {
      id: nextUserLayoutId("divider"),
      type: "divider",
      region: state.region,
      parentId: state.parentId,
      parentFace: state.parentId ? userLayoutSectionActiveFace(state.parentId) : "front",
      x1: clamp(first.x / metrics.width, 0, 1),
      y1: clamp(first.y / metrics.height, 0, 1),
      x2: clamp(snappedEnd.x / metrics.width, 0, 1),
      y2: clamp(snappedEnd.y / metrics.height, 0, 1)
    };
  }
  if (!userLayoutCandidateFits(candidate, state.host)) {
    setUserLayoutStatus("That shape needs more room and cannot overlap another UI element.", true);
    return false;
  }
  userLayoutElements().push(candidate);
  selectedUserLayoutElementIds.clear();
  selectedUserLayoutElementIds.add(candidate.id);
  selectedUserLayoutElementId = candidate.id;
  updateUserArrangementControls();
  updateUserGeometryFields();
  revalidateUserFrameGeometryForStage();
  renderUserFrameLayout();
  if (els.usersLayoutDeleteSelected) els.usersLayoutDeleteSelected.disabled = false;
  setUserLayoutStatus(candidate.type === "section" ? `${candidate.label} added.` : "Divider added.");
  pushUserBuilderHistory(`Draw ${candidate.label || "divider"}`);
  return true;
}

function beginUserLayoutGesture(event) {
  if (!userLayoutDrawingEnabled || !isUsersBuilderMode() || event.button !== 0) return;
  if (event.target.closest(".user-layout-handle")) return;
  const regionHost = event.currentTarget;
  const sectionContent = event.target.closest(".user-layout-section-content");
  const host = sectionContent || regionHost;
  const parentId = sectionContent?.dataset.layoutParentId || "";
  event.preventDefault();
  event.stopPropagation();
  regionHost.setPointerCapture?.(event.pointerId);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("user-layout-sketch");
  const hostMetrics = userLayoutHostMetrics(host);
  svg.style.inset = `${hostMetrics.padding}px`;
  svg.style.width = `${hostMetrics.width}px`;
  svg.style.height = `${hostMetrics.height}px`;
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  svg.append(polyline);
  host.append(svg);
  userLayoutGestureState = {
    pointerId: event.pointerId,
    captureHost: regionHost,
    host,
    region: regionHost.dataset.layoutRegion,
    parentId,
    svg,
    polyline,
    start: userLayoutPointInHost(event, host),
    current: userLayoutPointInHost(event, host)
  };
  const update = moveEvent => {
    const state = userLayoutGestureState;
    if (!state || moveEvent.pointerId !== state.pointerId) return;
    const point = userLayoutPointInHost(moveEvent, state.host);
    state.current = point;
    const dx = point.x - state.start.x;
    const dy = point.y - state.start.y;
    const box = Math.abs(dx) >= (state.parentId ? 44 : 56) && Math.abs(dy) >= (state.parentId ? 34 : 42);
    const points = box
      ? [state.start, { x: point.x, y: state.start.y }, point, { x: state.start.x, y: point.y }, state.start]
      : [state.start, Math.abs(dx) >= Math.abs(dy) ? { x: point.x, y: state.start.y } : { x: state.start.x, y: point.y }];
    state.polyline.setAttribute("points", points.map(item => `${item.x},${item.y}`).join(" "));
    state.svg.classList.toggle("is-box-preview", box);
  };
  const finish = finishEvent => {
    const state = userLayoutGestureState;
    if (!state || finishEvent.pointerId !== state.pointerId) return;
    state.captureHost.releasePointerCapture?.(state.pointerId);
    state.captureHost.removeEventListener("pointermove", update);
    state.captureHost.removeEventListener("pointerup", finish);
    state.captureHost.removeEventListener("pointercancel", cancel);
    state.svg.remove();
    userLayoutGestureState = null;
    addUserLayoutGestureElement(state);
  };
  const cancel = cancelEvent => {
    const state = userLayoutGestureState;
    if (!state || cancelEvent.pointerId !== state.pointerId) return;
    state.svg.remove();
    userLayoutGestureState = null;
    renderUserFrameLayout();
  };
  regionHost.addEventListener("pointermove", update);
  regionHost.addEventListener("pointerup", finish);
  regionHost.addEventListener("pointercancel", cancel);
}

function beginUserLayoutManipulation(event) {
  if (userLayoutDrawingEnabled || !isUsersBuilderMode() || event.button !== 0) return;
  if (event.target.closest(".user-layout-control-stack")) return;
  const node = event.currentTarget;
  const element = userLayoutElementById(node.dataset.layoutElementId);
  if (!element) return;
  event.preventDefault();
  event.stopPropagation();
  const host = element.parentId
    ? node.parentElement
    : node.closest(".user-layout-region");
  const metrics = userLayoutHostMetrics(host);
  const handle = event.target.closest("[data-layout-handle]")?.dataset.layoutHandle || "move";
  selectUserLayoutElement(element.id, { toggle: event.shiftKey, additive: event.shiftKey });
  if (!selectedUserLayoutElementIds.has(element.id)) return;
  userLayoutManipulationState = {
    id: element.id,
    handle,
    host,
    metrics,
    startX: event.clientX,
    startY: event.clientY,
    initial: cloneUserViewDraftState(element),
    sectionContents: element.type === "section" ? captureUserLayoutSectionContents(element, metrics) : null,
    lastValid: cloneUserViewDraftState(element),
    signature: JSON.stringify(element)
  };
  renderUserFrameLayout();
  const update = moveEvent => {
    const state = userLayoutManipulationState;
    const current = userLayoutElementById(state?.id);
    if (!state || !current) return;
    const dx = (moveEvent.clientX - state.startX) / state.metrics.width;
    const dy = (moveEvent.clientY - state.startY) / state.metrics.height;
    const next = cloneUserViewDraftState(state.initial);
    if (next.type === "divider") {
      if (state.handle === "start") {
        next.x1 = clamp(state.initial.x1 + dx, 0, 1);
        next.y1 = clamp(state.initial.y1 + dy, 0, 1);
      } else if (state.handle === "end") {
        next.x2 = clamp(state.initial.x2 + dx, 0, 1);
        next.y2 = clamp(state.initial.y2 + dy, 0, 1);
      } else {
        const minX = Math.min(state.initial.x1, state.initial.x2);
        const maxX = Math.max(state.initial.x1, state.initial.x2);
        const minY = Math.min(state.initial.y1, state.initial.y2);
        const maxY = Math.max(state.initial.y1, state.initial.y2);
        const moveX = clamp(dx, -minX, 1 - maxX);
        const moveY = clamp(dy, -minY, 1 - maxY);
        next.x1 += moveX; next.x2 += moveX; next.y1 += moveY; next.y2 += moveY;
      }
      if (Math.hypot((next.x2 - next.x1) * state.metrics.width, (next.y2 - next.y1) * state.metrics.height) < 28) return;
    } else if (state.handle === "move") {
      next.x = clamp(state.initial.x + dx, 0, 1 - next.width);
      next.y = clamp(state.initial.y + dy, 0, 1 - next.height);
    } else {
      const minWidth = (next.parentId ? 52 : 64) / state.metrics.width;
      const minHeight = (next.parentId ? 36 : 44) / state.metrics.height;
      if (state.handle.includes("e")) next.width = clamp(state.initial.width + dx, minWidth, 1 - next.x);
      if (state.handle.includes("s")) next.height = clamp(state.initial.height + dy, minHeight, 1 - next.y);
      if (state.handle.includes("w")) {
        const right = state.initial.x + state.initial.width;
        next.x = clamp(state.initial.x + dx, 0, right - minWidth);
        next.width = right - next.x;
      }
      if (state.handle.includes("n")) {
        const bottom = state.initial.y + state.initial.height;
        next.y = clamp(state.initial.y + dy, 0, bottom - minHeight);
        next.height = bottom - next.y;
      }
    }
    applyUserLayoutSnap(next, state.metrics);
    const liveHost = next.parentId
      ? document.querySelector(`[data-layout-parent-id="${CSS.escape(next.parentId)}"]`)
      : document.querySelector(`.user-layout-region-${next.region}`);
    if (!userLayoutCandidateFits(next, liveHost, next.id)) {
      setUserLayoutStatus("Spacing barrier reached.", true);
      document.querySelector(`[data-layout-element-id="${CSS.escape(next.id)}"]`)?.classList.add("is-layout-blocked");
      return;
    }
    const rebasedContents = next.type === "section" && state.handle !== "move"
      ? rebaseUserLayoutSectionContentsForResize(state.initial, next, state.sectionContents, state.metrics)
      : null;
    if (next.type === "section" && state.handle !== "move" && !rebasedContents) {
      setUserLayoutStatus("The section cannot be resized through its child objects.", true);
      document.querySelector(`[data-layout-element-id="${CSS.escape(next.id)}"]`)?.classList.add("is-layout-blocked");
      return;
    }
    Object.assign(current, next);
    if (rebasedContents) applyRebasedUserLayoutSectionContents(current, rebasedContents);
    renderUserFrameLayout();
    if (next.type === "section" && Array.isArray(next.controls) && next.controls.length && !userLayoutSectionControlsFit(next.id)) {
      Object.assign(current, state.lastValid);
      renderUserFrameLayout();
      setUserLayoutStatus("The section cannot be made smaller without crowding its controls.", true);
      return;
    }
    state.lastValid = cloneUserViewDraftState(next);
    setUserLayoutStatus(next.type === "divider" ? "Divider adjusted." : `${next.label} adjusted.`);
  };
  const finish = () => {
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", finish);
    const state = userLayoutManipulationState;
    userLayoutManipulationState = null;
    const current = userLayoutElementById(state?.id);
    if (current && JSON.stringify(current) !== state.signature) {
      revalidateUserFrameGeometryForStage();
      pushUserBuilderHistory(`Adjust ${current.label || "divider"}`);
    }
    updateUserGeometryFields();
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", finish, { once: true });
}

function deleteSelectedUserLayoutElement() {
  if (selectedUserLayoutControlIds.size) {
    [...selectedUserLayoutControlIds].forEach(controlId => {
      const placement = findUserLayoutControl(controlId);
      if (!placement) return;
      placement.section.controls.splice(placement.index, 1);
      const entry = getSettingEntry(controlId);
      if (entry?.userSafe && !userViewDraft.recordedControls.includes(controlId)) userViewDraft.recordedControls.push(controlId);
    });
    selectedUserLayoutControlIds.clear();
    selectedUserLayoutControlId = "";
    if (els.usersLayoutDeleteSelected) els.usersLayoutDeleteSelected.disabled = true;
    updateUserArrangementControls();
    updateUserGeometryFields();
    renderUserViewDraftUi();
    setUserLayoutStatus("Control removed from the section.");
    pushUserBuilderHistory("Remove User UI control");
    return true;
  }
  if (!selectedUserLayoutElementIds.size) return false;
  const descendants = new Set(selectedUserLayoutElementIds);
  let changed = true;
  while (changed) {
    changed = false;
    userLayoutElements().forEach(element => {
      if (element.parentId && descendants.has(element.parentId) && !descendants.has(element.id)) {
        descendants.add(element.id);
        changed = true;
      }
    });
  }
  userLayoutElements().forEach(element => {
    if (!descendants.has(element.id) || element.type !== "section" || !Array.isArray(element.controls)) return;
    element.controls.forEach(item => {
      const entry = getSettingEntry(item?.controlId);
      if (entry?.userSafe && !userViewDraft.recordedControls.includes(item.controlId)) {
        userViewDraft.recordedControls.push(item.controlId);
      }
    });
  });
  userViewDraft.layout.elements = userLayoutElements().filter(element => !descendants.has(element.id));
  selectedUserLayoutElementId = "";
  selectedUserLayoutElementIds.clear();
  if (els.usersLayoutDeleteSelected) els.usersLayoutDeleteSelected.disabled = true;
  updateUserArrangementControls();
  updateUserGeometryFields();
  renderUserViewDraftUi();
  setUserLayoutStatus("Layout element removed.");
  pushUserBuilderHistory("Remove layout element");
  return true;
}

function nudgeSelectedUserLayoutControls(key, pixels) {
  const placements = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
  if (!placements.length) return false;
  const before = new Map(placements.map(({ item }) => [item.controlId, cloneUserViewDraftState(item)]));
  placements.forEach(placement => {
    const content = document.querySelector(`[data-layout-parent-id="${CSS.escape(placement.section.id)}"]`);
    const rect = content?.getBoundingClientRect();
    if (!rect) return;
    if (key === "ArrowLeft") placement.item.x -= pixels / rect.width;
    if (key === "ArrowRight") placement.item.x += pixels / rect.width;
    if (key === "ArrowUp") placement.item.y -= pixels / rect.height;
    if (key === "ArrowDown") placement.item.y += pixels / rect.height;
  });
  const valid = placements.every(({ section, item }) => userLayoutControlCandidateFits(section, item, item.controlId));
  if (!valid) {
    before.forEach((state, id) => Object.assign(findUserLayoutControl(id)?.item || {}, state));
    setUserLayoutStatus("Control spacing barrier reached.", true);
    return false;
  }
  renderUserFrameLayout();
  updateUserGeometryFields();
  pushUserBuilderHistory(`Nudge User UI control ${pixels}px`);
  return true;
}

function setUserLayoutDrawingEnabled(enabled) {
  userLayoutDrawingEnabled = Boolean(enabled) && isUsersBuilderMode();
  document.body.classList.toggle("is-user-layout-drawing", userLayoutDrawingEnabled);
  els.usersLayoutDrawToggle?.setAttribute("aria-pressed", userLayoutDrawingEnabled ? "true" : "false");
  if (els.usersLayoutDrawToggle) els.usersLayoutDrawToggle.textContent = userLayoutDrawingEnabled ? "Drawing on" : "Draw layout";
  setUserLayoutStatus(userLayoutDrawingEnabled
    ? "Drag mostly horizontally or vertically for a divider. Drag far enough in both directions for a section, or a subsection inside a section."
    : "Select an element to move, resize, rotate, or delete it.");
  renderUserFrameLayout();
}



function scheduleUserMapViewportResize() {
  cancelAnimationFrame(userMapViewportResizeFrame);
  userMapViewportResizeFrame = requestAnimationFrame(() => {
    userMapViewportResizeFrame = 0;
    try {
      map?.invalidateSize?.({ animate: false });
      mapLibreMap?.resize?.();
    } catch {
      // The map can be unavailable during startup; the next normal layout refresh will size it.
    }
  });
}

function applyUserFrameGeometry({ render = true, resizeMap = false, layoutSnapshot = null, ignoreLayoutConstraints = false, allowOverflow = false } = {}) {
  if (!allowOverflow) {
    const constrained = constrainUserFrameGeometry(userFrameGeometry, [], { ignoreLayout: ignoreLayoutConstraints });
    Object.assign(userFrameGeometry, constrained.geometry);
  }
  const root = document.documentElement;
  const stage = els.mapCanvas?.closest?.(".map-stage");
  [root, stage].filter(Boolean).forEach(target => {
    target.style.setProperty("--user-frame-edge-top", `${userFrameGeometry.top}px`);
    target.style.setProperty("--user-frame-edge-right", `${userFrameGeometry.right}px`);
    target.style.setProperty("--user-frame-edge-bottom", `${userFrameGeometry.bottom}px`);
    target.style.setProperty("--user-frame-edge-left", `${userFrameGeometry.left}px`);
    target.style.setProperty("--user-frame-top-height", `${userFrameGeometry.top}px`);
    target.style.setProperty("--user-frame-bottom-height", `${userFrameGeometry.bottom}px`);
    target.style.setProperty("--user-frame-left-width", `${userFrameGeometry.left}px`);
    target.style.setProperty("--user-frame-right-width", `${userFrameGeometry.right}px`);
    target.style.setProperty("--user-map-viewport-top", `${userFrameGeometry.top}px`);
    target.style.setProperty("--user-map-viewport-right", `${userFrameGeometry.right}px`);
    target.style.setProperty("--user-map-viewport-bottom", `${userFrameGeometry.bottom}px`);
    target.style.setProperty("--user-map-viewport-left", `${userFrameGeometry.left}px`);
  });
  if (els.userMapViewport) {
    els.userMapViewport.style.top = `calc(var(--user-device-preview-top, 0px) + ${userFrameGeometry.top}px)`;
    els.userMapViewport.style.right = `calc(var(--user-device-preview-right, 0px) + ${userFrameGeometry.right}px)`;
    els.userMapViewport.style.bottom = `calc(var(--user-device-preview-bottom, 0px) + ${userFrameGeometry.bottom}px)`;
    els.userMapViewport.style.left = `calc(var(--user-device-preview-left, 0px) + ${userFrameGeometry.left}px)`;
  }
  if (layoutSnapshot && !rebaseUserFrameLayoutFromPixelSnapshot(layoutSnapshot)) return false;
  updateUserDevicePreviewStatus();
  updateUserDeviceBoundsLabel?.();
  renderUserFrameLayout();
  if (render) renderUserSiteControls();
  if (resizeMap || appState.siteMode === "user" || isUsersBuilderMode()) {
    scheduleUserMapViewportResize();
  }
  return true;
}

function userFrameGeometryForStorage() {
  return userDevicePreviewMode !== "custom" && userDevicePreviewBaseGeometry
    ? userDevicePreviewBaseGeometry
    : userFrameGeometry;
}

function saveUserFrameGeometry() {
  rvStorageWriteJson(USER_FRAME_GEOMETRY_KEY, userFrameGeometryForStorage());
}

function revalidateUserFrameGeometryForStage() {
  if (appState.siteMode !== "user" && !isUsersBuilderMode()) return false;
  const result = setUserFrameGeometry(userFrameGeometry, {
    render: false,
    resizeMap: true,
    allowOverflow: true
  });
  if (result.changed) saveUserFrameGeometry();
  scheduleUserDevicePreviewRefresh();
  return result.changed;
}

function setUserFrameGeometry(nextGeometry, { activeEdges = [], render = true, resizeMap = false, ignoreLayoutConstraints = false, allowOverflow = false } = {}) {
  const layoutSnapshot = allowOverflow ? null : captureUserFrameLayoutPixelSnapshot();
  const previousGeometry = { ...userFrameGeometry };
  const result = allowOverflow
    ? { geometry: Object.fromEntries(["top", "right", "bottom", "left"].map(edge => [edge, Math.round(Number(nextGeometry?.[edge]) || 0)])), limits: {} }
    : constrainUserFrameGeometry(nextGeometry, activeEdges, { ignoreLayout: ignoreLayoutConstraints });
  const changed = ["top", "right", "bottom", "left"].some(edge => userFrameGeometry[edge] !== result.geometry[edge]);
  if (!changed) return { changed: false, limits: result.limits };
  Object.assign(userFrameGeometry, result.geometry);
  const applied = applyUserFrameGeometry({ render, resizeMap, layoutSnapshot, ignoreLayoutConstraints, allowOverflow });
  if (!applied) {
    Object.assign(userFrameGeometry, previousGeometry);
    applyUserFrameGeometry({ render, resizeMap });
    return { changed: false, limits: Object.fromEntries(activeEdges.map(edge => [edge, true])) };
  }
  // Keep the cross-tab source current while the Users authoring canvas is
  // being resized; switching tabs then consumes this exact rendered state.
  if (isUsersBuilderMode()) requestAnimationFrame(() => saveUserAuthoredViewport?.());
  return { changed: true, limits: result.limits };
}

function setUserFrameEdge(edge, value) {
  if (!Object.prototype.hasOwnProperty.call(userFrameGeometry, edge)) return false;
  return setUserFrameGeometry({ ...userFrameGeometry, [edge]: value }, {
    activeEdges: [edge],
    resizeMap: true
  }).changed;
}

function frameEdgeLabel(edge) {
  return edge.charAt(0).toUpperCase() + edge.slice(1);
}

function createUserFrameButton(className, label, title, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.addEventListener("click", callback);
  return button;
}

function beginUserFrameResize(event, edge) {
  if (!isUsersBuilderMode() || event.button !== 0) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const initial = { ...userFrameGeometry };
  const update = moveEvent => {
    let delta = 0;
    if (edge === "top") delta = moveEvent.clientY - startY;
    if (edge === "right") delta = startX - moveEvent.clientX;
    if (edge === "bottom") delta = startY - moveEvent.clientY;
    if (edge === "left") delta = moveEvent.clientX - startX;
    setUserFrameGeometry({ ...initial, [edge]: initial[edge] + delta }, {
      activeEdges: [edge],
      resizeMap: true
    });
  };
  const finish = () => {
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", finish);
    saveUserFrameGeometry();
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", finish, { once: true });
}

function setUserMapViewportLimitState(limits = {}) {
  const layer = els.userMapViewportResizeLayer;
  if (!layer) return;
  ["top", "right", "bottom", "left"].forEach(edge => {
    layer.classList.toggle(`is-map-viewport-limit-${edge}`, Boolean(limits[edge]));
  });
  layer.classList.toggle("is-map-viewport-limit-x", Boolean(limits.left || limits.right));
  layer.classList.toggle("is-map-viewport-limit-y", Boolean(limits.top || limits.bottom));
}

function scaleUserPreviewComposition(factor, { insets = userDevicePreviewInsets, geometry = userFrameGeometry } = {}) {
  return transformUserPreviewComposition({ scale: factor, insets, geometry });
}

function resizeUserPreviewCompositionFromEdge({ delta = 0, scale = null, direction = "right", basis = "viewport", insets = userDevicePreviewInsets, geometry = userFrameGeometry } = {}) {
  const metrics = userPreviewCompositionMetrics(insets, geometry);
  const edges = direction.split("-");
  const horizontal = edges.includes("left") || edges.includes("right");
  const vertical = edges.includes("top") || edges.includes("bottom");
  const width = basis === "device" ? metrics.deviceRight - metrics.deviceLeft : metrics.viewportWidth;
  const height = basis === "device" ? metrics.deviceBottom - metrics.deviceTop : metrics.viewportHeight;
  const size = horizontal ? width : height;
  let factor = Math.max(.12, Number.isFinite(scale) ? scale : 1 + delta / Math.max(1, size));
  // In Users, the physical device is authored on-screen. Keep its outer
  // bounds within that screen while still scaling its inner map in lockstep.
  if (basis === "device" && isUsersBuilderMode()) {
    const stage = userDevicePreviewStageRect();
    const deviceWidth = Math.max(1, metrics.deviceRight - metrics.deviceLeft);
    const deviceHeight = Math.max(1, metrics.deviceBottom - metrics.deviceTop);
    const limits = [];
    if (edges.includes("right")) limits.push(((stage?.width || metrics.deviceRight) - metrics.deviceLeft) / deviceWidth);
    if (edges.includes("left")) limits.push(metrics.deviceRight / deviceWidth);
    if (edges.includes("bottom")) limits.push(((stage?.height || metrics.deviceBottom) - metrics.deviceTop) / deviceHeight);
    if (edges.includes("top")) limits.push(metrics.deviceBottom / deviceHeight);
    factor = Math.min(factor, ...limits.filter(Number.isFinite));
  }
  const widthDelta = width * (factor - 1);
  const heightDelta = height * (factor - 1);
  const centerX = (metrics.viewportLeft + metrics.viewportRight) / 2 + (horizontal ? (edges.includes("right") ? widthDelta / 2 : -widthDelta / 2) : 0);
  const centerY = (metrics.viewportTop + metrics.viewportBottom) / 2 + (vertical ? (edges.includes("bottom") ? heightDelta / 2 : -heightDelta / 2) : 0);
  return transformUserPreviewComposition({ scale: factor, viewportCenterX: centerX, viewportCenterY: centerY, insets, geometry });
}

function beginUserMapViewportResize(event, direction) {
  if (!canEditUserMapViewportBounds() || event.button !== 0) return;
  const activeEdges = direction.split("-");
  const zone = event.currentTarget;
  event.preventDefault();
  event.stopPropagation();
  zone?.setPointerCapture?.(event.pointerId);
  userMapViewportResizeState = {
    direction,
    activeEdges,
    startX: event.clientX,
    startY: event.clientY,
    initial: { ...userFrameGeometry },
    initialDeviceInsets: { ...userDevicePreviewInsets },
    pointerId: event.pointerId,
    zone
  };
  document.body.classList.add("is-resizing-map-viewport");
  setUserMapViewportLimitState();

  const update = moveEvent => {
    const resizeState = userMapViewportResizeState;
    if (!resizeState || moveEvent.pointerId !== resizeState.pointerId) return;
    const deltaX = moveEvent.clientX - resizeState.startX;
    const deltaY = moveEvent.clientY - resizeState.startY;
    // The Users tab is where the public map viewport itself is authored.
    // Here its edges are deliberately independent of the outer device shell.
    if (isUsersBuilderMode()) {
      const next = { ...resizeState.initial };
      if (resizeState.activeEdges.includes("top")) next.top += deltaY;
      if (resizeState.activeEdges.includes("right")) next.right -= deltaX;
      if (resizeState.activeEdges.includes("bottom")) next.bottom -= deltaY;
      if (resizeState.activeEdges.includes("left")) next.left += deltaX;
      const result = setUserFrameGeometry(next, {
        activeEdges: resizeState.activeEdges,
        render: false,
        resizeMap: true
      });
      setUserMapViewportLimitState(result.limits);
      return;
    }
    // Elsewhere this guide is a convenient proxy for the whole preview, so it
    // keeps the device shell and its viewport in their existing proportion.
    const horizontal = resizeState.activeEdges.includes("left") || resizeState.activeEdges.includes("right");
    const vertical = resizeState.activeEdges.includes("top") || resizeState.activeEdges.includes("bottom");
    const metrics = userPreviewCompositionMetrics(resizeState.initialDeviceInsets, resizeState.initial);
    const horizontalDelta = deltaX * (resizeState.activeEdges.includes("right") ? 1 : -1);
    const verticalDelta = deltaY * (resizeState.activeEdges.includes("bottom") ? 1 : -1);
    const horizontalFactor = 1 + horizontalDelta / Math.max(1, metrics.viewportWidth);
    const verticalFactor = 1 + verticalDelta / Math.max(1, metrics.viewportHeight);
    const factor = horizontal && vertical
      ? (Math.abs(horizontalFactor - 1) >= Math.abs(verticalFactor - 1) ? horizontalFactor : verticalFactor)
      : (horizontal ? horizontalFactor : verticalFactor);
    const result = resizeUserPreviewCompositionFromEdge({
      scale: factor,
      direction: resizeState.direction,
      basis: "viewport",
      insets: resizeState.initialDeviceInsets,
      geometry: resizeState.initial
    });
    setUserMapViewportLimitState(result.limits);
  };

  const finish = finishEvent => {
    const resizeState = userMapViewportResizeState;
    if (!resizeState || (finishEvent?.pointerId != null && finishEvent.pointerId !== resizeState.pointerId)) return;
    resizeState.zone?.releasePointerCapture?.(resizeState.pointerId);
    resizeState.zone?.removeEventListener("pointermove", update);
    resizeState.zone?.removeEventListener("pointerup", finish);
    resizeState.zone?.removeEventListener("pointercancel", finish);
    document.body.classList.remove("is-resizing-map-viewport");
    setUserMapViewportLimitState();
    userMapViewportResizeState = null;
    saveUserFrameGeometry();
    applyUserFrameGeometry({ render: true, resizeMap: true, allowOverflow: true });
    if (isUsersBuilderMode()) saveUserAuthoredViewport?.();
  };

  zone?.addEventListener("pointermove", update);
  zone?.addEventListener("pointerup", finish);
  zone?.addEventListener("pointercancel", finish);
}

function beginUserMapViewportMove(event) {
  if (!canEditUserMapViewportBounds() || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  const initial = { ...userFrameGeometry };
  const bounds = frameGeometryBounds({ ignoreLayout: true });
  const movementScale = 0.35;
  handle.setPointerCapture?.(pointerId);
  document.body.classList.add("is-moving-map-viewport");
  const update = moveEvent => {
    if (moveEvent.pointerId !== pointerId) return;
    const dx = clamp((moveEvent.clientX - startX) * movementScale, bounds.minByEdge.left - initial.left, initial.right - bounds.minByEdge.right);
    const dy = clamp((moveEvent.clientY - startY) * movementScale, bounds.minByEdge.top - initial.top, initial.bottom - bounds.minByEdge.bottom);
    const result = setUserFrameGeometry({
      top: initial.top + dy,
      right: initial.right - dx,
      bottom: initial.bottom - dy,
      left: initial.left + dx
    }, {
      activeEdges: ["top", "right", "bottom", "left"],
      render: false,
      resizeMap: true,
      ignoreLayoutConstraints: true
    });
    setUserMapViewportLimitState(result.limits);
  };
  const finish = finishEvent => {
    if (finishEvent?.pointerId != null && finishEvent.pointerId !== pointerId) return;
    handle.releasePointerCapture?.(pointerId);
    handle.removeEventListener("pointermove", update);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    document.body.classList.remove("is-moving-map-viewport");
    setUserMapViewportLimitState();
    saveUserFrameGeometry();
    applyUserFrameGeometry({ render: true, resizeMap: true, ignoreLayoutConstraints: true });
    if (isUsersBuilderMode()) saveUserAuthoredViewport?.();
    pushUserBuilderHistory("Move map viewport");
  };
  handle.addEventListener("pointermove", update);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

function canEditUserDeviceBounds() {
  return isEditorSite() && !isUsersBuilderMode() && Boolean(els.showMapBounds?.checked) && !els.lockUserDevicePreview?.checked;
}

function canEditUserMapViewportBounds() {
  return isEditorSite() && Boolean(els.showMapBounds?.checked) && !els.lockUserDevicePreview?.checked;
}

function beginUserDevicePreviewResize(event, direction) {
  if (!canEditUserDeviceBounds() || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const initial = { ...userDevicePreviewInsets };
  const initialGeometry = { ...userFrameGeometry };
  const pointerId = event.pointerId;
  const activeEdges = direction.split("-");
  handle.setPointerCapture?.(pointerId);
  document.body.classList.add("is-resizing-device-preview");
  const update = moveEvent => {
    if (moveEvent.pointerId !== pointerId) return;
    const dx = moveEvent.clientX - event.clientX;
    const dy = moveEvent.clientY - event.clientY;
    const horizontal = activeEdges.includes("left") || activeEdges.includes("right");
    const vertical = activeEdges.includes("top") || activeEdges.includes("bottom");
    const metrics = userPreviewCompositionMetrics(initial, initialGeometry);
    const horizontalDelta = dx * (activeEdges.includes("right") ? 1 : -1);
    const verticalDelta = dy * (activeEdges.includes("bottom") ? 1 : -1);
    const horizontalFactor = 1 + horizontalDelta / Math.max(1, metrics.deviceRight - metrics.deviceLeft);
    const verticalFactor = 1 + verticalDelta / Math.max(1, metrics.deviceBottom - metrics.deviceTop);
    const factor = horizontal && vertical
      ? (Math.abs(horizontalFactor - 1) >= Math.abs(verticalFactor - 1) ? horizontalFactor : verticalFactor)
      : (horizontal ? horizontalFactor : verticalFactor);
    resizeUserPreviewCompositionFromEdge({
      scale: factor,
      direction,
      basis: "device",
      insets: initial,
      geometry: initialGeometry
    });
  };
  const finish = finishEvent => {
    if (finishEvent?.pointerId != null && finishEvent.pointerId !== pointerId) return;
    handle.releasePointerCapture?.(pointerId);
    handle.removeEventListener("pointermove", update);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    document.body.classList.remove("is-resizing-device-preview");
    setUserDevicePreviewInsets(userDevicePreviewInsets, { save: true });
    saveUserFrameGeometry();
    if (isUsersBuilderMode()) saveUserAuthoredViewport?.();
  };
  handle.addEventListener("pointermove", update);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

function beginUserDevicePreviewMove(event) {
  if (!canEditUserDeviceBounds() || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const handle = event.currentTarget;
  const initial = { ...userDevicePreviewInsets };
  const pointerId = event.pointerId;
  handle.setPointerCapture?.(pointerId);
  document.body.classList.add("is-moving-device-preview");
  const update = moveEvent => {
    if (moveEvent.pointerId !== pointerId) return;
    const dx = moveEvent.clientX - event.clientX;
    const dy = moveEvent.clientY - event.clientY;
    setUserDevicePreviewInsets({
      top: initial.top + dy,
      right: initial.right - dx,
      bottom: initial.bottom - dy,
      left: initial.left + dx
    });
  };
  const finish = finishEvent => {
    if (finishEvent?.pointerId != null && finishEvent.pointerId !== pointerId) return;
    handle.releasePointerCapture?.(pointerId);
    handle.removeEventListener("pointermove", update);
    handle.removeEventListener("pointerup", finish);
    handle.removeEventListener("pointercancel", finish);
    document.body.classList.remove("is-moving-device-preview");
    setUserDevicePreviewInsets(userDevicePreviewInsets, { save: true });
    if (isUsersBuilderMode()) saveUserAuthoredViewport?.();
  };
  handle.addEventListener("pointermove", update);
  handle.addEventListener("pointerup", finish);
  handle.addEventListener("pointercancel", finish);
}

function toggleUserFrameCorner(corner) {
  const owner = userFrameCornerOwnership[corner];
  userFrameCornerOwnership[corner] = owner === corner.split("-")[0]
    ? corner.split("-")[1]
    : corner.split("-")[0];
  renderUserFrameBuilderTools();
}



function updateUserDeviceFrameVisibility() {
  if (!els.userDeviceFrame) return;
  // The UI tab owns viewport sizing and gizmo placement.  Its map rectangle is
  // always visible, but the enclosing device rectangle is a Custom-only aid;
  // named devices must not add a second, hard-coded surface to the layout.
  const showingMapViewport = isUsersBuilderMode() || (Boolean(els.showMapBounds?.checked) && isEditorSite());
  const editorGuide = showingMapViewport && !isUsersBuilderMode();
  const showingCustomDeviceBounds = isUsersBuilderMode() && userDevicePreviewMode === "custom";
  document.body.classList.toggle("show-map-bounds", showingMapViewport);
  document.body.classList.toggle("is-device-preview-unlocked", isEditorSite() && showingMapViewport && !els.lockUserDevicePreview?.checked);
  const visible = showingCustomDeviceBounds;
  els.userDeviceFrame.hidden = !visible;
  els.userDeviceFrame.setAttribute("aria-hidden", visible ? "false" : "true");
  if (els.mapBoundsOverlay) {
    els.mapBoundsOverlay.hidden = !showingMapViewport || editorGuide;
    els.mapBoundsOverlay.setAttribute("aria-hidden", !showingMapViewport || editorGuide ? "true" : "false");
  }
  if (els.deviceBoundsOverlay) {
    els.deviceBoundsOverlay.hidden = !showingCustomDeviceBounds;
    els.deviceBoundsOverlay.setAttribute("aria-hidden", showingCustomDeviceBounds ? "false" : "true");
  }
  if (els.editorPreviewGuide) {
    els.editorPreviewGuide.hidden = !editorGuide;
    els.editorPreviewGuide.setAttribute("aria-hidden", editorGuide ? "false" : "true");
  }
}

function updateUsersBuilderAdminGrid(active) {
  const grid = els.usersBuilderAdminGrid;
  if (!grid) return;
  const mainPanel = document.querySelector(".map-shell > .panel") || grid.querySelector(":scope > .panel");
  // The UI editor now uses the same stable right-hand panel as every other
  // editor tab. Appearance sections live inside #panelUsers.
  const panels = [mainPanel].filter(Boolean);
  panels.forEach(panel => {
    if (usersBuilderAdminPanelHomes.has(panel)) return;
    const marker = document.createComment("users-builder-admin-panel-home");
    panel.before(marker);
    usersBuilderAdminPanelHomes.set(panel, marker);
  });
  panels.forEach(panel => usersBuilderAdminPanelHomes.get(panel)?.after(panel));
  grid.hidden = true;
  grid.setAttribute("aria-hidden", "true");
}

function moveUsersAppearanceToolsIntoMainPanel() {
  const source = els.usersAppearanceAdminPanel;
  const usersPanel = document.querySelector("#panelUsers");
  const appearanceHost = usersPanel?.querySelector(".users-appearance-host");
  if (!source || !usersPanel || !appearanceHost || !source.childElementCount) return;
  let section = usersPanel.querySelector(".users-appearance-tools-host");
  if (!section) {
    section = document.createElement("section");
    section.className = "panel-section users-shell-section users-appearance-tools-host";
    section.setAttribute("aria-label", "User layout tools");
    section.innerHTML = "<button type='button' class='section-collapse-button' aria-expanded='true'><span class='section-collapse-arrow' aria-hidden='true'>&gt;</span><span class='section-collapse-title'>User Layout Tools</span></button>";
    section.querySelector(".section-collapse-button")?.addEventListener("click", () => {
      setPanelSectionCollapsed(section, !section.classList.contains("is-collapsed"));
    });
    usersPanel.insertBefore(section, appearanceHost);
  }
  while (source.firstChild) section.append(source.firstChild);
  updatePanelSectionChrome?.();
}

function updateUsersBuilderWorkspace() {
  const active = isUsersBuilderMode();
  if (!active && userLayoutDrawingEnabled) setUserLayoutDrawingEnabled(false);
  document.body.classList.toggle("users-builder-mode", active);
  if (active) clearUserEditorGuideGeometry?.();
  if (active) moveUsersAppearanceToolsIntoMainPanel();
  updateUsersBuilderAdminGrid(active);
  if (els.usersBuilderWorkspace) {
    els.usersBuilderWorkspace.hidden = !active;
    els.usersBuilderWorkspace.setAttribute("aria-hidden", active ? "false" : "true");
  }
  if (els.usersAppearanceAdminPanel) els.usersAppearanceAdminPanel.hidden = true;
  applyUsersShellLeatherColor();
  applyUserFrameGeometry({ render: false, allowOverflow: true });
  renderUserFrameBuilderTools();
  renderUserMapViewportResizeLayer();
  renderUserDevicePreviewResizeLayer();
  document.documentElement.style.setProperty("--users-builder-right-offset", "0px");
  document.querySelectorAll("[data-user-builder-card='true']").forEach(node => {
    node.draggable = false;
  });
  requestAnimationFrame(() => {
    if (active) {
      // Entering Users must not silently autofit and overwrite the authored
      // device composition. Autofit remains an explicit toolbar action.
      // A device being authored for the first time is the one exception: give
      // that empty slot its preset starting ratio, then save it as its own
      // source. Existing device keys are never regenerated here.
      if (!readUserAuthoredViewport?.(userDevicePreviewMode)) {
        applyUserDevicePreviewPreset?.(userDevicePreviewMode);
        constrainUserViewportToDevice?.();
        saveUserAuthoredViewport?.();
      }
      // Keep any browser/taskbar safety adjustment confined to the UI canvas.
      // It never supplies a map camera or public USER viewport.
      keepUserDevicePreviewWithinVisibleStage?.();
      renderUserDevicePreviewResizeLayer();
    } else {
      applyUserAuthoredViewportProportionsForEditor?.();
      renderUserMapViewportResizeLayer();
      renderUserDevicePreviewResizeLayer();
      // Let panel layout, map sizing, and any old Users-only refresh drain
      // before making the editor guide pair authoritative. The second frame
      // is intentional: the panel-width transition itself schedules work.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (isUsersBuilderMode()) return;
          applyUserAuthoredViewportProportionsForEditor?.();
          renderUserMapViewportResizeLayer();
          renderUserDevicePreviewResizeLayer();
        });
      });
    }
  });
  updateUserDeviceFrameVisibility();
  renderUserFrameLayout();
  if (active) {
    updateUserArrangementControls();
    updateUserGeometryFields();
  }
  updateUserDevicePreviewToolbar();
  if (!active) {
    clearUserBuilderDragState();
  }
}

function initializeUsersInteractions() {
  panelTabs.forEach(tab => {
    tab.addEventListener("click", () => setPanelTab(tab.dataset.panelTab));
  });
  window.addEventListener("resize", () => {
    if (!isUsersBuilderMode()) return;
    requestAnimationFrame(() => {
      if (keepUserDevicePreviewWithinVisibleStage?.()) renderUserDevicePreviewResizeLayer?.();
    });
  });
  els.usersExitBuilder?.addEventListener("click", () => setPanelTab("map-ui"));
  els.showMapBounds?.addEventListener("change", () => {
    updateUserDeviceFrameVisibility();
    if (!isUsersBuilderMode()) applyUserAuthoredViewportProportionsForEditor?.();
    if (isUsersBuilderMode() && els.showMapBounds.checked && els.usersDevicePreviewSelect?.value !== "custom") {
      setUserDevicePreviewMode(els.usersDevicePreviewSelect.value);
    }
    map.invalidateSize?.({ animate: false });
    renderUserMapViewportResizeLayer();
    renderUserDevicePreviewResizeLayer();
  });
  els.lockUserDevicePreview?.addEventListener("change", () => {
    document.body.classList.toggle("is-device-preview-unlocked", isEditorSite() && Boolean(els.showMapBounds?.checked) && !els.lockUserDevicePreview.checked);
    renderUserMapViewportResizeLayer();
    renderUserDevicePreviewResizeLayer();
  });
  els.showMapBounds?.addEventListener("change", () => document.body.classList.toggle("is-device-preview-unlocked", isEditorSite() && Boolean(els.showMapBounds.checked) && !els.lockUserDevicePreview?.checked));
  document.addEventListener("wheel", event => {
    // The guide sits alongside the map, so listen at the stage boundary rather
    // than the map element. This keeps wheel scaling available over its border
    // and handles as well as over the viewport itself.
    if (!event.target?.closest?.(".map-stage") || !isEditorSite() || !els.showMapBounds?.checked) return;
    if (!els.lockUserDevicePreview?.checked) {
      const factor = Math.exp(clamp(-event.deltaY, -180, 180) * .0016);
      if (userEditorGuideGeometry && !isUsersBuilderMode()) {
        userEditorGuideTransform.scale = clamp(userEditorGuideTransform.scale * factor, .12, 8);
        renderUserEditorGuideTransform?.();
      } else {
        scaleUserPreviewComposition(factor);
        saveUserAuthoredViewport?.();
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // LOCK freezes the device guide. Map zoom remains strictly the map's own
    // normal 1:1 wheel behavior and only when its separate zoom lock permits it.
    if (!els.allowZoom?.checked) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, { capture: true, passive: false });
  els.autofitUserDevicePreview?.addEventListener("click", () => {
    if (!isEditorSite()) return;
    autofitUserDevicePreview?.();
    renderUserMapViewportResizeLayer();
    renderUserDevicePreviewResizeLayer();
  });

  els.userRecordButton?.addEventListener("click", () => {
    if (userRecordState.active) {
      stopUserRecordMode();
      return;
    }
    startUserRecordMode();
  });

  els.usersUndoBuilder?.addEventListener("click", () => {
    undoUserBuilderChange();
  });
  els.usersRedoBuilder?.addEventListener("click", () => {
    redoUserBuilderChange();
  });
  els.usersDevicePreviewSelect?.addEventListener("change", () => {
    setUserDevicePreviewMode(els.usersDevicePreviewSelect.value);
  });
  els.usersLayoutPresetSelect?.addEventListener("change", () => {
    const value = els.usersLayoutPresetSelect.value;
    if (value) applyUserLayoutPreset(value);
    else activeUserLayoutPresetId = "";
    updateUserLayoutPresetManagementControls();
  });
  els.usersAddLayoutPreset?.addEventListener("click", openUserLayoutPresetNamingDialog);
  els.usersRenameLayoutPreset?.addEventListener("click", renameSelectedUserLayoutPreset);
  els.usersDuplicateLayoutPreset?.addEventListener("click", duplicateSelectedUserLayoutPreset);
  els.usersDeleteLayoutPreset?.addEventListener("click", deleteSelectedUserLayoutPreset);
  els.usersResetLayout?.addEventListener("click", clearCurrentUserLayout);
  renderUserLayoutPresetOptions();
  els.usersLayoutDrawToggle?.addEventListener("click", () => {
    const active = els.usersLayoutDrawToggle?.getAttribute("aria-pressed") === "true";
    setUserLayoutDrawingEnabled(!active);
  });
  els.usersLayoutDeleteSelected?.addEventListener("click", deleteSelectedUserLayoutElement);
  document.querySelectorAll("[data-users-editor-pane]").forEach(button => {
    button.addEventListener("click", () => setUsersEditorPane(button.dataset.usersEditorPane));
  });
  els.usersFreeTransformToggle?.addEventListener("click", () => {
    setUserLayoutFreeTransform(!userLayoutFreeTransform);
  });
  document.querySelectorAll("[data-user-arrange]").forEach(button => {
    button.addEventListener("click", () => arrangeSelectedUserLayout(button.dataset.userArrange));
  });
  els.usersArrangeGridButton?.addEventListener("click", () => {
    const open = els.usersArrangeGridMenu?.hidden !== false;
    if (els.usersArrangeGridMenu) els.usersArrangeGridMenu.hidden = !open;
    els.usersArrangeGridButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  els.usersArrangeGridApply?.addEventListener("click", () => {
    arrangeSelectedUserLayoutGrid(Number(els.usersArrangeGridColumns?.value), Number(els.usersArrangeGridGap?.value));
    if (els.usersArrangeGridMenu) els.usersArrangeGridMenu.hidden = true;
    els.usersArrangeGridButton?.setAttribute("aria-expanded", "false");
  });
  els.usersSnapMenuButton?.addEventListener("click", () => {
    const open = els.usersSnapMenu?.hidden !== false;
    if (els.usersSnapMenu) els.usersSnapMenu.hidden = !open;
    els.usersSnapMenuButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.querySelectorAll("[data-user-snap]").forEach(button => {
    button.addEventListener("click", () => {
      userLayoutSnapMode = ["grid", "objects", "smart", "none"].includes(button.dataset.userSnap) ? button.dataset.userSnap : "smart";
      updateUserArrangementControls();
      if (els.usersSnapMenu) els.usersSnapMenu.hidden = true;
      els.usersSnapMenuButton?.setAttribute("aria-expanded", "false");
      setUserLayoutStatus(`${button.textContent.trim()} enabled.`);
    });
  });
  els.usersGeometryFields?.querySelectorAll("[data-user-geometry]").forEach(input => {
    input.addEventListener("input", () => {
      const selected = [...selectedUserLayoutControlIds].map(findUserLayoutControl).filter(Boolean);
      if (selected.length === 1 && userLayoutControlUsesSquareGeometry(selected[0].item) && ["width", "height"].includes(input.dataset.userGeometry)) {
        const otherKey = input.dataset.userGeometry === "width" ? "height" : "width";
        const other = els.usersGeometryFields.querySelector(`[data-user-geometry="${otherKey}"]`);
        if (other) other.value = input.value;
      }
      validateUserGeometryFieldsAfterDelay();
    });
    input.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      clearTimeout(userGeometryValidationTimer);
      const values = {};
      els.usersGeometryFields.querySelectorAll("[data-user-geometry]").forEach(field => {
        values[field.dataset.userGeometry] = Number(field.value.trim());
      });
      applyUserGeometryValues(values);
    });
  });
  els.usersGeometryName?.addEventListener("input", () => {
    clearTimeout(userPropertyValidationTimer);
    userPropertyValidationTimer = window.setTimeout(() => applyUserSectionName(els.usersGeometryName.value), 2000);
  });
  els.usersGeometryName?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    clearTimeout(userPropertyValidationTimer);
    applyUserSectionName(els.usersGeometryName.value);
  });
  els.usersGeometryRotation?.addEventListener("input", () => {
    clearTimeout(userPropertyValidationTimer);
    userPropertyValidationTimer = window.setTimeout(() => applyUserDividerRotation(els.usersGeometryRotation.value), 2000);
  });
  els.usersGeometryRotation?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    clearTimeout(userPropertyValidationTimer);
    applyUserDividerRotation(els.usersGeometryRotation.value);
  });
  els.usersElementContainer?.addEventListener("change", () => {
    reparentSelectedUserSection(els.usersElementContainer.value);
  });
  els.usersControlCustomLabel?.addEventListener("input", () => {
    clearTimeout(userPropertyValidationTimer);
    userPropertyValidationTimer = window.setTimeout(() => applyUserControlInspectorSettings({
      customLabel: els.usersControlCustomLabel.value
    }), 2000);
  });
  els.usersControlCustomLabel?.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    clearTimeout(userPropertyValidationTimer);
    applyUserControlInspectorSettings({ customLabel: els.usersControlCustomLabel.value });
  });
  els.usersControlShowLabel?.addEventListener("change", () => {
    applyUserControlInspectorSettings({ showLabel: els.usersControlShowLabel.checked });
  });
  els.usersControlContainer?.addEventListener("change", () => {
    moveSelectedUserControlToSection(els.usersControlContainer.value);
  });
  els.usersViewportResizeCancel?.addEventListener("click", () => {
    pendingUserGeometryResize = null;
    if (els.usersViewportResizeDialog) els.usersViewportResizeDialog.hidden = true;
  });
  els.usersViewportResizeConfirm?.addEventListener("click", () => {
    const pending = pendingUserGeometryResize;
    pendingUserGeometryResize = null;
    if (els.usersViewportResizeDialog) els.usersViewportResizeDialog.hidden = true;
    if (!pending || !userLayoutElementById(pending.elementId)) return;
    selectUserLayoutElement(pending.elementId);
    applyUserGeometryValues(pending.values, { allowResize: true });
  });
  window.addEventListener("keydown", event => {
    if (!isUsersBuilderMode() || (!selectedUserLayoutElementId && !selectedUserLayoutControlIds.size) || userLayoutDrawingEnabled) return;
    const target = event.target;
    if (target?.matches?.("input, textarea, select, [contenteditable='true']")) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selectedUserLayoutControlIds.size) {
      event.preventDefault();
      nudgeSelectedUserLayoutControls(event.key, event.shiftKey ? 10 : 1);
      return;
    }
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    event.preventDefault();
    deleteSelectedUserLayoutElement();
  });
  document.addEventListener("pointerdown", event => {
    if (!isUsersBuilderMode() || !selectedUserLayoutElementIds.size) return;
    if (event.target.closest?.(".user-layout-object")) return;
    setUserLayoutSelectionEmphasized(false);
  });
  registerDismissiblePopup({
    isOpen: () => Boolean(userControlPlacementMenuState),
    contains: event => Boolean(event.target.closest?.("#usersControlPlacementMenu")),
    dismiss: closeUserControlPlacementMenu
  });
  els.usersClearStaging?.addEventListener("click", clearRecordedControls);
  els.usersLeatherColor?.addEventListener("input", event => {
    setUsersShellLeatherColor(event.target.value);
  });
  els.usersLeatherColor?.addEventListener("change", event => {
    const nextColor = setUsersShellLeatherColor(event.target.value);
    if (nextColor) {
      pushUserBuilderHistory("Update user panel leather color");
    }
  });
  els.usersAddPanelTop?.addEventListener("click", () => addUserViewPanel("top"));
  els.usersRemovePanelTop?.addEventListener("click", () => removeUserViewPanel("top"));
  els.usersAddPanelRight?.addEventListener("click", () => addUserViewPanel("right"));
  els.usersRemovePanelRight?.addEventListener("click", () => removeUserViewPanel("right"));
  els.usersAddPanelBottom?.addEventListener("click", () => addUserViewPanel("bottom"));
  els.usersRemovePanelBottom?.addEventListener("click", () => removeUserViewPanel("bottom"));
  els.usersAddPanelLeft?.addEventListener("click", () => addUserViewPanel("left"));
  els.usersRemovePanelLeft?.addEventListener("click", () => removeUserViewPanel("left"));
  els.usersStagingList?.addEventListener("click", event => {
    const button = event.target.closest("[data-staged-remove-id]");
    if (!button) return;
    removeRecordedControlId(button.dataset.stagedRemoveId);
  });
  els.usersRegistryPreview?.addEventListener("click", event => {
    const removeButton = event.target.closest("[data-recorded-remove-id]");
    if (removeButton) {
      removeRecordedControlId(removeButton.dataset.recordedRemoveId);
      return;
    }
    const stageButton = event.target.closest("[data-stage-setting-id]");
    if (stageButton) {
      addControlToRecorded(stageButton.dataset.stageSettingId);
      return;
    }
  });
  [
    els.userSitePanelTop,
    els.userSitePanelLeft,
    els.userSitePanelRight,
    els.userSitePanelBottom
  ].forEach(host => {
    host?.addEventListener("dragenter", event => {
      if (!isUsersBuilderMode()) return;
      const panel = host.dataset.userBuilderPanel || "";
      const payload = readBuilderDragPayload(event);
      const settingId = payload?.settingId || userBuilderDragState?.settingId || "";
      if (!canDropUserBuilderSetting(settingId, panel)) return;
      event.preventDefault();
      host.classList.add("is-user-builder-drop-target");
    });
    host?.addEventListener("dragover", event => {
      if (!isUsersBuilderMode()) return;
      const panel = host.dataset.userBuilderPanel || "";
      const payload = readBuilderDragPayload(event);
      const settingId = payload?.settingId || userBuilderDragState?.settingId || "";
      if (!canDropUserBuilderSetting(settingId, panel)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      host.classList.add("is-user-builder-drop-target");
    });
    host?.addEventListener("dragleave", event => {
      if (!isUsersBuilderMode()) return;
      if (event.relatedTarget && host.contains(event.relatedTarget)) return;
      host.classList.remove("is-user-builder-drop-target");
    });
    host?.addEventListener("drop", event => {
      if (!isUsersBuilderMode()) return;
      const panel = host.dataset.userBuilderPanel || "";
      event.preventDefault();
      event.stopPropagation();
      host.classList.remove("is-user-builder-drop-target");
      handleUserBuilderDrop(event, panel);
      clearUserBuilderDragState();
    });
    host?.addEventListener("click", event => {
      if (!isUsersBuilderMode()) return;
      const removeButton = event.target.closest("[data-user-placed-remove-id]");
      if (removeButton) {
        event.preventDefault();
        event.stopPropagation();
        returnPlacedControlToRecorded(removeButton.dataset.userPlacedRemoveId);
        return;
      }
      const card = event.target.closest("[data-user-builder-card='true']");
      if (card) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    host?.addEventListener("contextmenu", event => {
      if (!isUsersBuilderMode()) return;
      const blankSection = event.target.closest("[data-user-builder-blank-section]");
      if (blankSection) {
        event.preventDefault();
        event.stopPropagation();
        removeUserViewPanel(blankSection.dataset.userBuilderBlankSection);
        return;
      }
      const card = event.target.closest(".user-builder-setting-card[data-setting-id]");
      if (!card) return;
      openUserPlacementMenu(card.dataset.settingId, "placed", event);
    });
  });
  els.panelUsers?.addEventListener("contextmenu", event => {
    if (activePanelTabId() !== "users") return;
    const card = event.target.closest(".users-registry-item[data-setting-id][data-user-placement-source]");
    if (!card) return;
    openUserPlacementMenu(card.dataset.settingId, card.dataset.userPlacementSource, event);
  });
  els.usersStagingAdminPanel?.addEventListener("contextmenu", event => {
    if (activePanelTabId() !== "users") return;
    const card = event.target.closest(".users-registry-item[data-setting-id][data-user-placement-source]");
    if (!card) return;
    openUserPlacementMenu(card.dataset.settingId, card.dataset.userPlacementSource, event);
  });
  registerDismissiblePopup({
    isOpen: () => Boolean(usersPlacementMenuState),
    contains: event => Boolean(event.target.closest?.("#usersPlacementMenu")),
    dismiss: closeUserPlacementMenu,
    eventName: "click",
    capture: true
  });

  document.addEventListener("keydown", event => {
    if (!isUsersBuilderMode()) return;
    if (event.key === "Escape" && !isEditableShortcutTarget(event.target)) {
      event.preventDefault();
      setPanelTab("map-ui");
      return;
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
      && String(event.key || "").toLowerCase() === "f"
      && !isEditableShortcutTarget(event.target)) {
      event.preventDefault();
      setUserLayoutFreeTransform(!userLayoutFreeTransform);
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (isEditableShortcutTarget(event.target)) return;
    const key = String(event.key || "").toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        redoUserBuilderChange();
      } else {
        undoUserBuilderChange();
      }
      return;
    }
    if (key === "y") {
      event.preventDefault();
      redoUserBuilderChange();
    }
  });

  document.addEventListener("click", handleUserRecordCapture, true);
  syncUserRecordUiState();
}

function initializePinnedSectionContextMenus() {
  document.querySelectorAll(".pinned-journey-section .pinned-subsection > summary").forEach(summary => {
    summary.addEventListener("contextmenu", event => {
      event.preventDefault();
      togglePinnedSectionGroup();
    });
  });
}

function imageContextUpload(event, input, options = {}) {
  if (!input) return;
  const uiRegion = event.currentTarget?.closest?.(".panel, .image-preview-drawer");
  if (!uiRegion) return;
  event.preventDefault();
  event.stopPropagation();
  if (typeof options.beforeOpen === "function" && options.beforeOpen(event) === false) return;
  input.click();
}

function initializePanelImageContextUploads() {
  [
    els.markerPreview,
    els.markerImageRecent?.closest?.(".text-control")
  ].filter(Boolean).forEach(control => {
    control.addEventListener("contextmenu", event => imageContextUpload(event, els.markerImageUpload));
  });

  [
    els.routeAnimationIconPreview,
    els.routeAnimationIconPreview?.closest?.(".route-animation-icon-preview-wrap"),
    els.routeAnimationIconRecent?.closest?.(".text-control")
  ].filter(Boolean).forEach(control => {
    control.addEventListener("contextmenu", event => imageContextUpload(event, els.routeAnimationIconUpload));
  });

  els.landmarkPreview?.addEventListener("contextmenu", event => {
    imageContextUpload(event, els.landmarkUploadInput, {
      beforeOpen: () => {
        if (landmarkSettingsScope === "default" || landmarkSettingsScope === "journey" || landmarkSettingsScope === "trip") {
          pendingLandmarkStopKey = "";
          return false;
        }
        pendingLandmarkStopKey = landmarkSettingsScope;
        return true;
      }
    });
  });
}

function nudgePreviewTargetKey(kind) {
  if (kind === "routeAnimation") return routeAnimationDisplayPositionKey();
  if (kind === "landmark") {
    return landmarkSettingsScope && !["default", "journey", "trip"].includes(landmarkSettingsScope)
      ? `landmark:${landmarkSettingsScope}`
      : "";
  }
  if (kind === "marker") {
    const target = state.markerModifyTarget || (selectedStopIndex > 0
      ? { routeIndex: selectedStopIndex - 1, anchor: "end" }
      : { routeIndex: 0, anchor: "start" });
    return Number.isInteger(target.routeIndex) ? markerDisplayPositionKey(target.routeIndex, target.anchor || "start", false) : "";
  }
  return "";
}

function nudgeDisplayPosition(key, dx, dy, multiplier = 1) {
  if (!isEditorSite()) return;
  if (!key) return;
  const item = displayPositionForKey(key);
  setDisplayPositionOffset(key, {
    x: item.current.x + dx * multiplier,
    y: item.current.y + dy * multiplier
  }, "current");
}

function addPreviewNudgeControls(container, kind, keyProvider = null) {
  if (!container || container.querySelector(".position-nudge-pad")) return;
  const pad = document.createElement("div");
  pad.className = "position-nudge-pad";
  pad.dataset.help = "Click to nudge 4 pixels. Shift-click nudges 1 pixel. Right-click nudges 20 pixels.";
  [
    ["top", 0, -DISPLAY_NUDGE_STEP_PX, "Move up"],
    ["right", DISPLAY_NUDGE_STEP_PX, 0, "Move right"],
    ["bottom", 0, DISPLAY_NUDGE_STEP_PX, "Move down"],
    ["left", -DISPLAY_NUDGE_STEP_PX, 0, "Move left"]
  ].forEach(([direction, dx, dy, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `position-nudge-arrow position-nudge-${direction}`;
    button.setAttribute("aria-label", label);
    button.dataset.help = `${label} 4 pixels. Shift-click for 1 pixel; right-click for 20 pixels.`;
    button.textContent = direction === "top" ? "^" : direction === "right" ? ">" : direction === "bottom" ? "v" : "<";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const key = typeof keyProvider === "function" ? keyProvider() : nudgePreviewTargetKey(kind);
      nudgeDisplayPosition(key, dx, dy, event.shiftKey ? 0.25 : 1);
    });
    button.addEventListener("contextmenu", event => {
      event.preventDefault();
      event.stopPropagation();
      const key = typeof keyProvider === "function" ? keyProvider() : nudgePreviewTargetKey(kind);
      nudgeDisplayPosition(key, dx, dy, DISPLAY_NUDGE_FAST_MULTIPLIER);
    });
    pad.append(button);
  });
  container.append(pad);
}

function initializePreviewNudgeControls() {
  addPreviewNudgeControls(els.markerPreview, "marker");
  addPreviewNudgeControls(els.routeAnimationIconPreview, "routeAnimation");
  addPreviewNudgeControls(els.landmarkPreview, "landmark");
}

function ensureElementsDrawerToggle() {
  if (!els.elementsStyleDrawer || elementsDrawerToggleButton) return;
  // The wheel is deliberately a singleton. Themes uses the same control as
  // Animation and Trips; only its target drawer changes with the active tab.
  elementsDrawerToggleButton = els.toggleImagePreviewDrawer || null;
  ensureImagePreviewDrawerToggleMounted();
}

function imagePreviewDefinitionsForActiveTab() {
  if (activePanelTabId() === "trips") {
    const trip = activeTrip();
    const stops = landmarkStopsForTrip(trip);
    const stop = stops[clamp(selectedStopIndex, 0, Math.max(0, stops.length - 1))] || null;
    const journey = tripLandmarkSettings(trip);
    const selected = stop
      ? journey.stops[stop.key] || journey.stops[landmarkStopKey(stop.name)] || {}
      : {};
    const currentMarker = normalizeMarkerSettings({
      ...journey.marker,
      ...(selected.marker || {}),
      imageUrl: selected.imageUrl || journey.marker.imageUrl || DEFAULT_LANDMARK_IMAGE_URL,
      imageName: selected.imageName || stop?.name || journey.marker.imageName
    }, journey.marker, LANDMARK_SIZE_INTERNAL_MAX);
    const defaultMarker = normalizeMarkerSettings(
      (landmarkDefaultSettings || DEFAULT_LANDMARK_SETTINGS).marker,
      DEFAULT_LANDMARK_SETTINGS.marker,
      LANDMARK_SIZE_INTERNAL_MAX
    );
    const makeSource = marker => {
      const source = document.createElement("div");
      source.className = "landmark-preview";
      source.innerHTML = journeyLandmarkPreviewMarkup(marker);
      return source;
    };
    const stopKey = stop?.key || "";
    return [{
        title: "Default landmark",
        source: makeSource(defaultMarker),
        kind: "landmark",
        keyProvider: () => stopKey ? `landmark:${stopKey}` : "",
        onActivate: () => openJourneyLandmarkEditor("default")
      }, {
        title: stop ? `Current stop · ${stop.name}` : "Current stop",
        source: makeSource(currentMarker),
        kind: "landmark",
        keyProvider: () => stopKey ? `landmark:${stopKey}` : "",
        onActivate: stopKey ? () => openJourneyLandmarkEditor(stopKey) : null
    }];
  }
  if (activePanelTabId() !== "map-ui") return [];
  return [
    {
      title: "Route animation icon",
      source: els.routeAnimationIconPreview,
      kind: "routeAnimation",
      uploadInput: els.routeAnimationIconUpload,
      onPreviewHover: setRouteAnimationPreviewHover
    },
    {
      title: "Marker preview",
      source: els.markerPreview,
      kind: "marker",
      uploadInput: els.markerImageUpload
    },
    {
      title: "Media preview",
      source: els.stickerMediaPreview,
      kind: "media",
      onActivate: () => {
        const sticker = typeof selectedStickerRecord === "function" ? selectedStickerRecord() : null;
        const mediaId = ["appear", "click", "hover"].map(slot => sticker?.mediaEvents?.[slot]).find(Boolean) || sticker?.mediaId || "";
        const media = mediaId ? findTripMediaRecord?.(mediaId)?.item : null;
        if (media) openJourneyMedia?.(media, sticker?.mediaEventOptions?.appear || {});
      }
    }
  ].filter(item => item.source);
}

function appendImagePreviewDrawerItem(definition) {
  const block = document.createElement("section");
  block.className = "secondary-image-preview-block";
  const title = document.createElement("strong");
  title.className = "secondary-image-preview-title";
  title.textContent = definition.title;
  const frame = document.createElement("div");
  frame.className = "route-animation-icon-preview-wrap secondary-image-preview-frame";
  frame.setAttribute("aria-label", definition.title);
  frame.setAttribute("role", "button");
  frame.tabIndex = 0;
  const clone = definition.source.cloneNode(true);
  clone.hidden = false;
  // Build the route-icon drawer preview from the same live settings used by
  // Leaflet, instead of relying on a previously cloned editor preview.
  if (definition.kind === "routeAnimation") {
    clone.innerHTML = routeAnimationLeafletIcon(getRouteAnimationIconSettings(), { iconSize: 92 }).options.html || "";
  }
  clone.removeAttribute("id");
  clone.classList.remove("secondary-preview-source");
  clone.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
  clone.querySelectorAll(".position-nudge-pad").forEach(node => node.remove());
  addPreviewNudgeControls(clone, definition.kind, definition.keyProvider);
  [frame, clone].forEach(node => {
    node.addEventListener("contextmenu", event => imageContextUpload(event, definition.uploadInput));
  });
  frame.addEventListener("wheel", event => {
    const sizeInput = definition.kind === "routeAnimation"
      ? els.routeAnimationIconSize
      : definition.kind === "marker"
        ? els.markerSize
        : definition.kind === "landmark"
          ? els.landmarkSize
          : null;
    if (!sizeInput) return;
    event.preventDefault();
    event.stopPropagation();
    const minimum = Number(sizeInput.min || 0);
    const maximum = Number(sizeInput.max || 100);
    const step = Math.max(Number(sizeInput.step || 1), 2);
    sizeInput.value = String(clamp(Number(sizeInput.value) + (event.deltaY < 0 ? step : -step), minimum, maximum));
    sizeInput.dispatchEvent(new Event("input", { bubbles: true }));
  }, { passive: false });
  if (definition.onPreviewHover) {
    frame.addEventListener("pointerenter", () => definition.onPreviewHover(true));
    frame.addEventListener("pointerleave", () => definition.onPreviewHover(false));
  }
  if (definition.onActivate) {
    frame.addEventListener("click", event => {
      if (event.target.closest(".position-nudge-arrow")) return;
      definition.onActivate();
    });
    frame.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      definition.onActivate();
    });
  }
  frame.append(clone);
  block.append(title, frame);
  els.imagePreviewContent.append(block);
}

function refreshImagePreviewDrawer() {
  if (!els.imagePreviewDrawer || !els.imagePreviewContent) return;
  const definitions = imagePreviewDefinitionsForActiveTab();
  const hasDefinitions = definitions.length > 0 && isEditorSite();
  if (!hasDefinitions) {
    // Rendering can happen while a tab handoff is in flight. It may replace
    // the preview's contents, but it must never alter drawer visibility: the
    // tab-transition controller is the sole owner of that state.
    els.imagePreviewContent.replaceChildren();
    return;
  }
  els.imagePreviewTitle.textContent = activePanelTabId() === "trips" ? "Landmarks" : "Image previews";
  els.imagePreviewContent.replaceChildren();
  definitions.forEach(appendImagePreviewDrawerItem);
}

function setImagePreviewDrawerOpen(open, { animate = true, refresh = true, persist = true, fullTurn = false, fullTurnTargetOpen = false } = {}) {
  if (!els.imagePreviewDrawer) return;
  ensureImagePreviewDrawerToggleMounted();
  updateSecondaryDrawerTogglePosition();
  clearTimeout(imagePreviewExitTimer);
  if (open) {
    els.imagePreviewDrawer.style.animation = animate ? "" : "none";
    els.imagePreviewDrawer.hidden = false;
    els.imagePreviewDrawer.classList.remove("is-exiting", "is-collapsed", "is-open");
    if (animate) void els.imagePreviewDrawer.offsetWidth;
    els.imagePreviewDrawer.classList.add("is-open");
    if (refresh) refreshImagePreviewDrawer();
  } else {
    els.imagePreviewDrawer.classList.remove("is-open");
    els.imagePreviewDrawer.classList.add("is-collapsed");
    if (animate && !els.imagePreviewDrawer.hidden) {
      els.imagePreviewDrawer.classList.add("is-exiting");
      imagePreviewExitTimer = window.setTimeout(() => {
        if (!els.imagePreviewDrawer.classList.contains("is-open")) {
          els.imagePreviewDrawer.hidden = true;
          els.imagePreviewDrawer.classList.remove("is-exiting");
        }
      }, 460);
    } else {
      els.imagePreviewDrawer.classList.remove("is-exiting");
      els.imagePreviewDrawer.hidden = true;
    }
  }
  els.imagePreviewDrawer.setAttribute("aria-hidden", String(!open));
  updateSharedSecondaryWheel({ animate, fullTurn, fullTurnTargetOpen });
  const tabId = activePanelTabId();
  if (persist && (tabId === "map-ui" || tabId === "trips")) {
    const states = rvStorageReadJson("rv-map-secondary-preview-state-v2", {}) || {};
    states[tabId] = Boolean(open);
    rvStorageWriteJson("rv-map-secondary-preview-state-v2", states);
  }
  if (!animate) requestAnimationFrame(() => els.imagePreviewDrawer.style.removeProperty("animation"));
}

function updateImagePreviewDrawer(source, title = "Image preview") {
  refreshImagePreviewDrawer();
}

function updateSecondaryPanelAvailability(previousTabId = "", { previewOpenAfterExit = null } = {}) {
  ensureElementsDrawerToggle();
  ensureImagePreviewDrawerToggleMounted();
  const activeTab = activePanelTabId();
  // Tab changes are a single transaction in setPanelTab: exit, switch, then
  // enter.  This function only mounts the destination state; it must never
  // launch another exit or it races the transaction that brought us here.
  setElementsDrawerOpen(false, { animate: false });
  const targetSupportsPreview = activeTab === "map-ui" || activeTab === "trips";
  clearTimeout(imagePreviewEnterTimer);
  if (targetSupportsPreview) {
    const states = rvStorageReadJson("rv-map-secondary-preview-state-v2", {}) || {};
    // A visible Animation/Trips preview carries across an open-to-open tab
    // handoff.  Otherwise honour the destination tab's saved toggle state.
    const open = typeof previewOpenAfterExit === "boolean" ? previewOpenAfterExit : states[activeTab] !== false;
    setImagePreviewDrawerOpen(open, { animate: Boolean(open), refresh: true, persist: false });
  } else {
    setImagePreviewDrawerOpen(false, { animate: false, refresh: false, persist: false });
  }
  updateSecondaryDrawerTogglePosition();
}

function setLeatherColor(color) {
  document.documentElement.style.setProperty("--leather-color", color);
}

function setLeatherTextureOpacity(opacity) {
  document.documentElement.style.setProperty("--leather-texture-opacity", String(opacity));
}

function setLeatherBlendMode(mode) {
  document.documentElement.style.setProperty("--leather-blend-mode", mode);
}

window.setLeatherColor = setLeatherColor;
window.setLeatherTextureOpacity = setLeatherTextureOpacity;
window.setLeatherBlendMode = setLeatherBlendMode;
