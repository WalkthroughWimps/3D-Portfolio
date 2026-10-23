import * as THREE from 'three';

const MOUSE_NONE = -1;

// Keep a page's current centering offset fixed while the camera target is
// panned. Store it as viewport fractions so a resize does not revive old pixels.
export function createPanAwareCenterProjection(camera, { onClear = null } = {}) {
  let held = null;
  return {
    update({ enabled, panned, width, height, getCenter }) {
      if (!enabled || !width || !height || !getCenter) {
        if (held) {
          camera.clearViewOffset();
          held = null;
          onClear?.();
        }
        return;
      }
      if (panned) {
        if (held) camera.setViewOffset(width, height, held.x * width, held.y * height, width, height);
        return;
      }
      if (camera.view?.enabled) camera.clearViewOffset();
      camera.updateMatrixWorld(true);
      const ndc = getCenter().project(camera);
      if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return;
      held = { x: ndc.x / 2, y: -ndc.y / 2 };
      camera.setViewOffset(width, height, held.x * width, held.y * height, width, height);
    }
  };
}

export function applyStartPageMouseControlMode(controls, {
  enabled = true,
  allowRotate = true,
  allowZoom = true
} = {}) {
  if (!controls) return;
  controls.enabled = !!enabled;
  controls.enableRotate = !!allowRotate;
  controls.enableZoom = !!allowZoom;
  controls.enablePan = false;
  controls.mouseButtons = {
    LEFT: MOUSE_NONE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE
  };
  try { controls.update(); } catch  { /* ignore */ }
}

export function applyStandardGlbMouseControlMode(controls, {
  enabled = true,
  allowRotate = true,
  allowZoom = true
} = {}) {
  if (!controls) return;
  controls.enabled = !!enabled;
  controls.enableRotate = !!allowRotate;
  controls.enableZoom = !!allowZoom;
  controls.enablePan = false;
  controls.mouseButtons = {
    LEFT: MOUSE_NONE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE
  };
  try { controls.update(); } catch  { /* ignore */ }
}

export function installStandardGlbMouseControls({
  controls,
  domElement,
  canInteract = null
} = {}) {
  if (!controls || !domElement) return null;
  let defaultTarget = null;
  let defaultDirection = null;
  let pointerState = null;
  let lastClick = { button: -1, at: 0 };
  const camera = controls.object;

  const captureDefaultPose = () => {
    if (!camera || !controls.target) return;
    defaultTarget = controls.target.clone();
    defaultDirection = camera.position.clone().sub(controls.target);
    if (defaultDirection.lengthSq() > 1e-12) defaultDirection.normalize();
  };

  const canUse = () => {
    if (!controls || !controls.enabled) return false;
    return typeof canInteract === 'function' ? !!canInteract() : true;
  };

  const onContextMenu = (event) => {
    if (canUse()) event.preventDefault();
  };

  const onPointerDown = (event) => {
    if (event.button !== 1 && event.button !== 2) return;
    if (!canUse()) { pointerState = null; return; }
    if (event.button === 1) { event.preventDefault(); controls.enablePan = true; }
    pointerState = { button: event.button, at: performance.now(), x: event.clientX, y: event.clientY, moved: 0 };
  };

  const onPointerMove = (event) => {
    if (!pointerState) return;
    pointerState.moved += Math.hypot(event.clientX - pointerState.x, event.clientY - pointerState.y);
    pointerState.x = event.clientX;
    pointerState.y = event.clientY;
  };

  const onPointerUp = (event) => {
    if (event.button === 1) controls.enablePan = false;
    const state = pointerState;
    pointerState = null;
    if (!state || state.button !== event.button || !canUse()) { lastClick = { button: -1, at: 0 }; return; }
    const now = performance.now();
    if (now - state.at > 240 || state.moved + Math.hypot(event.clientX - state.x, event.clientY - state.y) > 6) {
      lastClick = { button: -1, at: 0 };
      return;
    }
    if (lastClick.button !== event.button || now - lastClick.at > 320) {
      lastClick = { button: event.button, at: now };
      return;
    }
    lastClick = { button: -1, at: 0 };
    if (!defaultTarget || !defaultDirection) return;
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update(); // Flush any queued orbit/pan delta before applying the reset.
    if (event.button === 1) {
      // Move both ends of the orbit by the same amount; retain distance and view.
      camera.position.add(defaultTarget.clone().sub(controls.target));
      controls.target.copy(defaultTarget);
    } else {
      // Restore the settled viewing direction around the current pan target.
      const distance = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).addScaledVector(defaultDirection, distance);
    }
    controls.update();
    controls.enableDamping = damping;
    event.preventDefault();
  };

  const onPointerCancel = () => { pointerState = null; lastClick = { button: -1, at: 0 }; controls.enablePan = false; };

  domElement.addEventListener('contextmenu', onContextMenu, { capture: true });
  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  domElement.addEventListener('pointermove', onPointerMove, { capture: true });
  domElement.addEventListener('pointerup', onPointerUp, { capture: true });
  domElement.addEventListener('pointercancel', onPointerCancel, { capture: true });

  return {
    captureDefaultPose,
    isPanned: () => !!defaultTarget && controls.target.distanceToSquared(defaultTarget) > 1e-8,
    dispose() {
      domElement.removeEventListener('contextmenu', onContextMenu, { capture: true });
      domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
      domElement.removeEventListener('pointermove', onPointerMove, { capture: true });
      domElement.removeEventListener('pointerup', onPointerUp, { capture: true });
      domElement.removeEventListener('pointercancel', onPointerCancel, { capture: true });
    }
  };
}

export function installStartPageStyleMouseControls({
  controls,
  camera,
  domElement,
  focusDurationMs = 320,
  getHitPoint = null,
  getDefaultFocusPoint = null,
  canInteract = null,
  pivotOnRightDown = true,
  handleRightButton = true,
  interruptFocusOnMiddleDown = false,
  onMiddleDown = null,
  onFocusStart = null,
  onFocusComplete = null
} = {}) {
  if (!controls || !camera || !domElement) return null;

  let focusAnimId = null;
  let restoreFocusControls = null;
  let middlePointerState = null;
  let lastMiddleClickTime = 0;
  let pendingMiddleSingleClick = null;

  const canUse = () => {
    if (!controls || !controls.enabled) return false;
    return typeof canInteract === 'function' ? !!canInteract() : true;
  };

  const cancelFocusAnimation = () => {
    if (focusAnimId) {
      cancelAnimationFrame(focusAnimId);
      focusAnimId = null;
    }
    restoreFocusControls?.();
    restoreFocusControls = null;
    if (pendingMiddleSingleClick) {
      clearTimeout(pendingMiddleSingleClick.timerId);
      pendingMiddleSingleClick = null;
    }
  };

  const startFocusAnimation = (target, { durationMs = focusDurationMs } = {}) => {
    if (!target || !controls || !camera) return;
    cancelFocusAnimation();
    onFocusStart?.(target);
    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();
    const startDistance = startPos.distanceTo(startTarget);
    const dir = startPos.clone().sub(startTarget).normalize();
    const wasEnabled = controls.enabled;
    const wasRotate = controls.enableRotate;
    const wasZoom = controls.enableZoom;
    const wasPan = controls.enablePan;
    restoreFocusControls = () => {
      controls.enabled = wasEnabled;
      controls.enableRotate = wasRotate;
      controls.enableZoom = wasZoom;
      controls.enablePan = wasPan;
    };
    controls.enabled = false;
    controls.enablePan = false;
    durationMs = typeof durationMs === 'function' ? durationMs() : durationMs;
    const startTime = performance.now();
    const tick = (now) => {
      const t = Math.max(0, Math.min(1, (now - startTime) / Math.max(1, durationMs)));
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const liveTarget = typeof target.resolve === 'function' ? target.resolve() : target;
      if (!liveTarget) { cancelFocusAnimation(); return; }
      const nextTarget = startTarget.clone().lerp(liveTarget, eased);
      controls.target.copy(nextTarget);
      camera.position.copy(nextTarget.clone().add(dir.clone().multiplyScalar(startDistance)));
      try { camera.updateMatrixWorld(true); } catch  { /* ignore */ }
      try { controls.update(); } catch  { /* ignore */ }
      if (t < 1) {
        focusAnimId = requestAnimationFrame(tick);
      } else {
        focusAnimId = null;
        restoreFocusControls?.();
        restoreFocusControls = null;
        try { controls.update(); } catch  { /* ignore */ }
        onFocusComplete?.(target);
      }
    };
    focusAnimId = requestAnimationFrame(tick);
  };

  const onPointerDown = (event) => {
    if (event.button !== 1 && event.button !== 2) return;
    // Hosts with their own mouse-based rotation need the compatibility mousedown.
    if (event.button === 2 && !handleRightButton) return;
    if (event.button === 1 && interruptFocusOnMiddleDown && restoreFocusControls)
      cancelFocusAnimation();
    if (!canUse()) return;
    if (event.button === 1) {
      event.preventDefault();
      onMiddleDown?.();
      controls.enablePan = true;
      const hit = typeof getHitPoint === 'function' ? getHitPoint(event) : null;
      middlePointerState = {
        downAt: performance.now(),
        x: event.clientX,
        y: event.clientY,
        point: hit ? (typeof hit.resolve === 'function' ? hit : hit.clone()) : null
      };
      return;
    }
    if (event.button === 2) {
      if (pivotOnRightDown && typeof getHitPoint === 'function') {
        const hit = getHitPoint(event);
        if (hit) {
          controls.target.copy(hit);
          try { controls.update(); } catch  { /* ignore */ }
        }
      }
      event.preventDefault();
    }
  };

  const onPointerUp = (event) => {
    if (event.button !== 1) return;
    controls.enablePan = false;
    if (!middlePointerState || !canUse()) {
      middlePointerState = null;
      return;
    }
    const now = performance.now();
    const duration = now - middlePointerState.downAt;
    const dx = event.clientX - middlePointerState.x;
    const dy = event.clientY - middlePointerState.y;
    const moved = Math.hypot(dx, dy);
    const isShortClick = duration <= 240 && moved <= 6;
    if (!isShortClick) {
      middlePointerState = null;
      return;
    }
    const isDouble = (now - lastMiddleClickTime) <= 320;
    const clickPoint = middlePointerState.point;
    if (isDouble) {
      cancelFocusAnimation();
      const defaultPoint = typeof getDefaultFocusPoint === 'function' ? getDefaultFocusPoint() : null;
      if (defaultPoint) startFocusAnimation(defaultPoint.clone ? defaultPoint.clone() : defaultPoint);
    } else if (clickPoint) {
      pendingMiddleSingleClick = {
        timerId: setTimeout(() => {
          startFocusAnimation(clickPoint);
          pendingMiddleSingleClick = null;
        }, 320)
      };
    }
    lastMiddleClickTime = now;
    middlePointerState = null;
  };

  const onPointerCancel = () => {
    controls.enablePan = false;
    middlePointerState = null;
  };

  const onContextMenu = (event) => {
    if (canUse()) event.preventDefault();
  };

  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  domElement.addEventListener('pointerup', onPointerUp, { capture: true });
  domElement.addEventListener('pointercancel', onPointerCancel, { capture: true });
  domElement.addEventListener('contextmenu', onContextMenu, { capture: true });

  return {
    startFocusAnimation,
    cancelFocusAnimation,
    dispose() {
      cancelFocusAnimation();
      domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
      domElement.removeEventListener('pointerup', onPointerUp, { capture: true });
      domElement.removeEventListener('pointercancel', onPointerCancel, { capture: true });
      domElement.removeEventListener('contextmenu', onContextMenu, { capture: true });
    }
  };
}
