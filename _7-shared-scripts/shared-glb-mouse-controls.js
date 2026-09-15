import * as THREE from 'three';

const MOUSE_NONE = -1;

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
    LEFT: THREE.MOUSE.PAN,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE
  };
  try { controls.update(); } catch (e) { /* ignore */ }
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
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.ROTATE
  };
  try { controls.update(); } catch (e) { /* ignore */ }
}

export function installStandardGlbMouseControls({
  controls,
  domElement,
  canInteract = null
} = {}) {
  if (!controls || !domElement) return null;

  const canUse = () => {
    if (!controls || !controls.enabled) return false;
    return typeof canInteract === 'function' ? !!canInteract() : true;
  };

  const onContextMenu = (event) => {
    if (canUse()) event.preventDefault();
  };

  const onPointerDown = (event) => {
    if (event.button !== 1) return;
    controls.enablePan = false;
  };

  domElement.addEventListener('contextmenu', onContextMenu, { capture: true });
  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });

  return {
    dispose() {
      domElement.removeEventListener('contextmenu', onContextMenu, { capture: true });
      domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
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
  pivotOnRightDown = true
} = {}) {
  if (!controls || !camera || !domElement) return null;

  let focusAnimId = null;
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
    if (pendingMiddleSingleClick) {
      clearTimeout(pendingMiddleSingleClick.timerId);
      pendingMiddleSingleClick = null;
    }
  };

  const startFocusAnimation = (target, { durationMs = focusDurationMs } = {}) => {
    if (!target || !controls || !camera) return;
    cancelFocusAnimation();
    const startTarget = controls.target.clone();
    const startPos = camera.position.clone();
    const startDistance = startPos.distanceTo(startTarget);
    const dir = startPos.clone().sub(startTarget).normalize();
    const wasEnabled = controls.enabled;
    const wasRotate = controls.enableRotate;
    const wasZoom = controls.enableZoom;
    const wasPan = controls.enablePan;
    controls.enabled = false;
    controls.enablePan = false;
    const startTime = performance.now();
    const tick = (now) => {
      const t = Math.max(0, Math.min(1, (now - startTime) / Math.max(1, durationMs)));
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const nextTarget = startTarget.clone().lerp(target, eased);
      controls.target.copy(nextTarget);
      camera.position.copy(nextTarget.clone().add(dir.clone().multiplyScalar(startDistance)));
      try { camera.updateMatrixWorld(true); } catch (e) { /* ignore */ }
      try { controls.update(); } catch (e) { /* ignore */ }
      if (t < 1) {
        focusAnimId = requestAnimationFrame(tick);
      } else {
        focusAnimId = null;
        controls.enabled = wasEnabled;
        controls.enableRotate = wasRotate;
        controls.enableZoom = wasZoom;
        controls.enablePan = wasPan;
        try { controls.update(); } catch (e) { /* ignore */ }
      }
    };
    focusAnimId = requestAnimationFrame(tick);
  };

  const onPointerDown = (event) => {
    if (event.button !== 1 && event.button !== 2) return;
    if (!canUse()) return;
    if (event.button === 1) {
      event.preventDefault();
      controls.enablePan = true;
      const hit = typeof getHitPoint === 'function' ? getHitPoint(event) : null;
      middlePointerState = {
        downAt: performance.now(),
        x: event.clientX,
        y: event.clientY,
        point: hit ? hit.clone() : null
      };
      return;
    }
    if (event.button === 2) {
      if (pivotOnRightDown && typeof getHitPoint === 'function') {
        const hit = getHitPoint(event);
        if (hit) {
          controls.target.copy(hit);
          try { controls.update(); } catch (e) { /* ignore */ }
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
    const clickPoint = middlePointerState.point ? middlePointerState.point.clone() : null;
    if (isDouble) {
      cancelFocusAnimation();
      const defaultPoint = typeof getDefaultFocusPoint === 'function' ? getDefaultFocusPoint() : null;
      if (defaultPoint) startFocusAnimation(defaultPoint.clone ? defaultPoint.clone() : defaultPoint, { durationMs: 320 });
    } else if (clickPoint) {
      pendingMiddleSingleClick = {
        timerId: setTimeout(() => {
          startFocusAnimation(clickPoint, { durationMs: 320 });
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
