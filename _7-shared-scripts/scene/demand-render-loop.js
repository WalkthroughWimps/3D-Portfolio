// A static scene redraws only when its owner invalidates it. Damping/animation
// can invalidate from inside draw; requests are coalesced into one next frame.
export function createDemandRenderLoop({ draw, target = document,
  requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame } = {}) {
  let frame = null;
  let disposed = false;
  function invalidate() {
    if (disposed || target.hidden || frame !== null) return;
    frame = requestFrame(time => {
      frame = null;
      if (!disposed && !target.hidden) draw(time);
    });
  }
  function visibilityChanged() {
    if (target.hidden) {
      if (frame !== null) cancelFrame(frame);
      frame = null;
    } else invalidate();
  }
  target.addEventListener('visibilitychange', visibilityChanged);
  return { invalidate,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      target.removeEventListener('visibilitychange', visibilityChanged);
    }
  };
}
