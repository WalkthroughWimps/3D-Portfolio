import * as THREE from 'three';
import { getSharedSettings } from './core/settings.js';
import { resolveTransformResetEasing } from './core/transform-easing.js';
import { panelViewport } from './core/panel-viewport.js';

const MOUSE_NONE = -1;

export function transformResetDuration(kind, baseMs) {
  const settings = getSharedSettings().get();
  const motionOff = settings.accessibility?.reducedMotion === true ||
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (motionOff || settings.interaction?.animateResets === false) return 0;
  const speed = Number(settings.interaction?.[kind === 'rotation' ? 'rotationResetSpeed' : 'panResetSpeed']);
  return baseMs / (Number.isFinite(speed) && speed > 0 ? speed : 1);
}

// Keep a page's current centering offset fixed while the camera target is
// panned. Store it as viewport fractions so a resize does not revive old pixels.
export function createPanAwareCenterProjection(camera, { onClear = null, viewportElement = null } = {}) {
  let held = null;
  let appliedPanel = null;
  return {
    update({ enabled, panned, width, height, getCenter }) {
      const panelX = panelViewport(viewportElement).offsetX;
      if (!enabled || !width || !height || !getCenter) {
        if (held) {
          camera.clearViewOffset();
          held = null;
          appliedPanel = null;
          onClear?.();
        }
        if (!width || !height) return;
        const view = camera.view?.enabled ? camera.view : null;
        const stillOurs = appliedPanel && view && view.offsetX === appliedPanel.x && view.offsetY === appliedPanel.y;
        const baseX = stillOurs ? appliedPanel.baseX : view?.offsetX || 0;
        const baseY = stillOurs ? appliedPanel.baseY : view?.offsetY || 0;
        const nextX = baseX + panelX;
        if (nextX || baseY) {
          if (!view || view.offsetX !== nextX || view.offsetY !== baseY || view.fullWidth !== width || view.fullHeight !== height)
            camera.setViewOffset(width, height, nextX, baseY, width, height);
        } else if (view) camera.clearViewOffset();
        appliedPanel = { x: nextX, y: baseY, baseX, baseY };
        return;
      }
      appliedPanel = null;
      if (panned) {
        if (held || panelX) camera.setViewOffset(width, height, (held?.x || 0) * width + panelX, (held?.y || 0) * height, width, height);
        else if (camera.view?.enabled) camera.clearViewOffset();
        return;
      }
      if (camera.view?.enabled) camera.clearViewOffset();
      camera.updateMatrixWorld(true);
      const ndc = getCenter().project(camera);
      if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)) return;
      held = { x: ndc.x / 2, y: -ndc.y / 2 };
      camera.setViewOffset(width, height, held.x * width + panelX, held.y * height, width, height);
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
  let resetFrame = null;
  let restoreReset = null;
  let resetGeneration = 0;

  const cancelReset = () => {
    resetGeneration++;
    if (resetFrame !== null) cancelAnimationFrame(resetFrame);
    resetFrame = null;
    restoreReset?.();
    restoreReset = null;
  };

  const startReset = button => {
    if (!defaultTarget || !defaultDirection) return;
    cancelReset();
    const damping = controls.enableDamping;
    const visibleTarget = controls.target.clone();
    const visiblePosition = camera.position.clone();
    controls.enableDamping = false;
    controls.update(); // Clear queued damping without moving the visible start pose.
    controls.target.copy(visibleTarget);
    camera.position.copy(visiblePosition);
    controls.update();
    const fromTarget = controls.target.clone();
    const fromPosition = camera.position.clone();
    const distance = fromPosition.distanceTo(fromTarget);
    const fromDirection = fromPosition.clone().sub(fromTarget).normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(fromDirection, defaultDirection);
    const duration = transformResetDuration(button === 1 ? 'pan' : 'rotation', 460);
    const easingId = getSharedSettings().get().interaction?.[button === 1 ? 'panResetEasing' : 'rotationResetEasing'];
    const wasEnabled = controls.enabled;
    restoreReset = () => { controls.enabled = wasEnabled; controls.enableDamping = damping; };
    controls.enabled = false;
    const start = performance.now();
    const tick = now => {
      const progress = duration ? Math.min(1, Math.max(0, (now - start) / duration)) : 1;
      const t = resolveTransformResetEasing(easingId, progress, 'smoothstep');
      if (button === 1) {
        controls.target.copy(fromTarget).lerp(defaultTarget, t);
        camera.position.copy(fromPosition).add(controls.target.clone().sub(fromTarget));
      } else {
        const direction = fromDirection.clone().applyQuaternion(new THREE.Quaternion().slerp(rotation, t));
        camera.position.copy(controls.target).addScaledVector(direction, distance);
      }
      controls.update();
      if (progress < 1) resetFrame = requestAnimationFrame(tick);
      else { resetFrame = null; restoreReset?.(); restoreReset = null; }
    };
    if (duration) resetFrame = requestAnimationFrame(tick);
    else tick(start);
  };

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
    cancelReset();
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
    // OrbitControls releases its pointer capture later in this event dispatch.
    const generation = resetGeneration;
    queueMicrotask(() => { if (generation === resetGeneration && canUse()) startReset(event.button); });
    event.preventDefault();
  };

  const onPointerCancel = () => { cancelReset(); pointerState = null; lastClick = { button: -1, at: 0 }; controls.enablePan = false; };
  const onWheel = () => { if (restoreReset) cancelReset(); };

  domElement.addEventListener('contextmenu', onContextMenu, { capture: true });
  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  domElement.addEventListener('pointermove', onPointerMove, { capture: true });
  domElement.addEventListener('pointerup', onPointerUp, { capture: true });
  domElement.addEventListener('pointercancel', onPointerCancel, { capture: true });
  domElement.addEventListener('wheel', onWheel, { capture: true });

  return {
    captureDefaultPose,
    cancelReset,
    isPanned: () => !!defaultTarget && controls.target.distanceToSquared(defaultTarget) > 1e-8,
    dispose() {
      cancelReset();
      domElement.removeEventListener('contextmenu', onContextMenu, { capture: true });
      domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
      domElement.removeEventListener('pointermove', onPointerMove, { capture: true });
      domElement.removeEventListener('pointerup', onPointerUp, { capture: true });
      domElement.removeEventListener('pointercancel', onPointerCancel, { capture: true });
      domElement.removeEventListener('wheel', onWheel, { capture: true });
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
  let focusResetActive = false;
  let focusGeneration = 0;
  let focusDisposed = false;

  const canUse = () => {
    if (!controls || !controls.enabled) return false;
    return typeof canInteract === 'function' ? !!canInteract() : true;
  };

  const cancelFocusAnimation = () => {
    focusGeneration++;
    focusResetActive = false;
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

  const startFocusAnimation = (target, { durationMs = focusDurationMs, reset = false } = {}) => {
    if (!target || !controls || !camera) return;
    cancelFocusAnimation();
    focusResetActive = reset;
    onFocusStart?.(target);
    const wasDamping = controls.enableDamping;
    if (reset) {
      const visibleTarget = controls.target.clone();
      const visiblePosition = camera.position.clone();
      controls.enableDamping = false;
      controls.update();
      controls.target.copy(visibleTarget);
      camera.position.copy(visiblePosition);
      controls.update();
    }
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
      controls.enableDamping = wasDamping;
    };
    controls.enabled = false;
    controls.enablePan = false;
    durationMs = typeof durationMs === 'function' ? durationMs() : durationMs;
    if (reset) durationMs = transformResetDuration('pan', durationMs);
    const resetEasingId = reset ? getSharedSettings().get().interaction?.panResetEasing : null;
    const startTime = performance.now();
    const tick = (now) => {
      const t = durationMs <= 0 ? 1 : Math.max(0, Math.min(1, (now - startTime) / durationMs));
      const eased = reset ? resolveTransformResetEasing(resetEasingId, t, 'inOutQuad') :
        (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
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
        focusResetActive = false;
        restoreFocusControls?.();
        restoreFocusControls = null;
        try { controls.update(); } catch  { /* ignore */ }
        onFocusComplete?.(target);
      }
    };
    if (durationMs <= 0) tick(startTime);
    else focusAnimId = requestAnimationFrame(tick);
  };

  const onPointerDown = (event) => {
    if (focusResetActive) cancelFocusAnimation();
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
      const generation = focusGeneration;
      if (defaultPoint) queueMicrotask(() => {
        if (!focusDisposed && generation === focusGeneration && canUse())
          startFocusAnimation(defaultPoint.clone ? defaultPoint.clone() : defaultPoint, { reset: true });
      });
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
    if (focusResetActive) cancelFocusAnimation();
    controls.enablePan = false;
    middlePointerState = null;
  };

  const onContextMenu = (event) => {
    if (canUse()) event.preventDefault();
  };
  const onWheel = () => { if (focusResetActive) cancelFocusAnimation(); };

  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  domElement.addEventListener('pointerup', onPointerUp, { capture: true });
  domElement.addEventListener('pointercancel', onPointerCancel, { capture: true });
  domElement.addEventListener('contextmenu', onContextMenu, { capture: true });
  domElement.addEventListener('wheel', onWheel, { capture: true });

  return {
    startFocusAnimation,
    cancelFocusAnimation,
    dispose() {
      focusDisposed = true;
      cancelFocusAnimation();
      domElement.removeEventListener('pointerdown', onPointerDown, { capture: true });
      domElement.removeEventListener('pointerup', onPointerUp, { capture: true });
      domElement.removeEventListener('pointercancel', onPointerCancel, { capture: true });
      domElement.removeEventListener('contextmenu', onContextMenu, { capture: true });
      domElement.removeEventListener('wheel', onWheel, { capture: true });
    }
  };
}
