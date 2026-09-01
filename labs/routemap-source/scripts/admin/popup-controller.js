"use strict";

let popupDragState = null;

if (typeof document !== "undefined") {
  document.addEventListener("contextmenu", event => {
    event.preventDefault();
  }, true);

  // A dismissal click belongs to the popup, never to the page behind it.
  // This shared capture handler covers the static popovers and the short-lived
  // menus created by the editors without requiring each one to duplicate it.
  const outsideDismissSelector = [
    ".selection-type-popup:not([hidden])",
    ".stop-calendar-popover:not([hidden])",
    ".users-arrange-popover:not([hidden])",
    ".users-placement-menu:not([hidden])",
    ".panel-section-gap-menu:not([hidden])",
    ".keyframe-type-menu",
    ".users-control-placement-menu",
    ".users-gizmo-replace-menu",
    ".users-gizmo-quick-tools",
    ".users-layout-preset-dialog",
    ".trip-export-dialog:not([hidden])",
    ".users-viewport-resize-dialog:not([hidden])"
  ].join(",");
  const dismissOutsidePopup = popup => {
    if (popup.matches(".keyframe-type-menu, .users-control-placement-menu, .users-gizmo-replace-menu, .users-gizmo-quick-tools, .users-layout-preset-dialog")) popup.remove();
    else popup.hidden = true;
  };
  document.addEventListener("pointerdown", event => {
    const popups = [...document.querySelectorAll(outsideDismissSelector)]
      .filter(popup => !popup.hidden && getComputedStyle(popup).display !== "none");
    const outside = popups.filter(popup => !popup.contains(event.target));
    if (!outside.length) return;
    outside.forEach(dismissOutsidePopup);
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

function placePopup(panel, x, y, margin = 10) {
  if (!panel) return;
  panel.hidden = false;
  const rect = panel.getBoundingClientRect();
  const left = clamp(x, margin, Math.max(margin, window.innerWidth - rect.width - margin));
  const top = clamp(y, margin, Math.max(margin, window.innerHeight - rect.height - margin));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function keepPopupOnScreen(panel, margin = 10) {
  if (!panel || panel.hidden) return;
  const rect = panel.getBoundingClientRect();
  placePopup(panel, rect.left, rect.top, margin);
}

function makePopupDraggable(panel, { handleSelector = ".style-panel-head", holdMs = 650 } = {}) {
  const handle = panel?.querySelector(handleSelector);
  if (!handle) return false;
  let holdTimer = null;

  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    holdTimer = window.setTimeout(() => {
      const rect = panel.getBoundingClientRect();
      popupDragState = {
        panel,
        pointerId: event.pointerId,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top
      };
      handle.setPointerCapture(event.pointerId);
      panel.classList.add("is-dragging");
    }, holdMs);
  });

  handle.addEventListener("pointermove", event => {
    if (!popupDragState || popupDragState.pointerId !== event.pointerId) return;
    event.preventDefault();
    placePopup(panel, event.clientX - popupDragState.offsetX, event.clientY - popupDragState.offsetY);
  });

  const stopDrag = event => {
    window.clearTimeout(holdTimer);
    if (popupDragState?.pointerId === event.pointerId) {
      panel.classList.remove("is-dragging");
      popupDragState = null;
    }
  };

  handle.addEventListener("pointerup", stopDrag);
  handle.addEventListener("pointercancel", stopDrag);
  handle.addEventListener("pointerleave", () => window.clearTimeout(holdTimer));
  return true;
}

function registerDismissiblePopup({
  isOpen,
  contains,
  dismiss,
  eventName = "pointerdown",
  capture = false,
  escape = true
}) {
  if (typeof isOpen !== "function" || typeof contains !== "function" || typeof dismiss !== "function") {
    throw new TypeError("Dismissible popups require isOpen, contains, and dismiss callbacks.");
  }
  const onPointer = event => {
    if (isOpen() && !contains(event)) dismiss(event);
  };
  const onKey = event => {
    if (escape && event.key === "Escape" && isOpen()) dismiss(event);
  };
  document.addEventListener(eventName, onPointer, capture);
  if (escape) document.addEventListener("keydown", onKey);
  return () => {
    document.removeEventListener(eventName, onPointer, capture);
    if (escape) document.removeEventListener("keydown", onKey);
  };
}
