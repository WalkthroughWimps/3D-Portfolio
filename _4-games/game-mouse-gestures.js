// A secondary-button press over a game starts undecided. Only movement gives
// it to OrbitControls; releasing a short, still press gives it to the game.
export function installGameMouseGestures({ element, hitGame, clickGame, downGame, upGame, pressOverlay, onCameraStart, threshold = 6, clickMs = 400 }) {
  let gesture = null;
  let replaying = false;
  const win = element.ownerDocument.defaultView;
  const consume = event => { event.preventDefault(); event.stopImmediatePropagation(); };
  function replay(type, event) {
    replaying = true;
    try {
      element.dispatchEvent(new win.PointerEvent(type, { bubbles:true, cancelable:true,
        pointerId:event.pointerId, pointerType:event.pointerType || 'mouse', isPrimary:true,
        clientX:event.clientX, clientY:event.clientY, button:event.button, buttons:event.buttons }));
    } finally { replaying = false; }
  }
  function release(id) { try { element.releasePointerCapture(id); } catch { /* already released */ } }
  function cancel() {
    const old = gesture;
    gesture = null;
    if (!old) return;
    if (old.phase === 'game') upGame(old.hit, old.down.button);
    if (old.phase === 'camera') replay('pointercancel', old.down);
    release(old.down.pointerId);
  }
  function down(event) {
    if (replaying) return;
    if (pressOverlay?.(event)) {
      gesture = {phase:'overlay', down:event};
      try { element.setPointerCapture(event.pointerId); } catch { /* synthetic test input */ }
      consume(event); return;
    }
    if (event.button !== 1 && event.button !== 2) return;
    const hit = hitGame(event);
    if (!hit) return;
    gesture = {phase:'pending', down:event, hit, x:event.clientX, y:event.clientY, travel:0, at:performance.now()};
    try { element.setPointerCapture(event.pointerId); } catch { /* synthetic test input */ }
    consume(event);
  }
  function move(event) {
    if (replaying || !gesture || event.pointerId !== gesture.down.pointerId) return;
    if (gesture.phase === 'camera') return;
    if (gesture.phase === 'overlay') { consume(event); return; }
    if (gesture.phase === 'game') return;
    gesture.travel += Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y);
    gesture.x = event.clientX; gesture.y = event.clientY;
    if (gesture.travel > threshold) {
      gesture.phase = 'camera';
      onCameraStart?.();
      replay('pointerdown', gesture.down);
      replay('pointermove', event);
    }
    consume(event);
  }
  function up(event) {
    if (replaying || !gesture || event.pointerId !== gesture.down.pointerId) return;
    const old = gesture;
    gesture = null;
    if (old.phase === 'camera') return; // OrbitControls receives the real release.
    consume(event);
    release(old.down.pointerId);
    if (event.type === 'pointercancel') {
      if (old.phase === 'game') upGame(old.hit, old.down.button);
      return;
    }
    if (old.phase === 'game') upGame(hitGame(event) || old.hit, old.down.button);
    if (old.phase === 'pending' && performance.now() - old.at <= clickMs &&
        old.travel + Math.hypot(event.clientX-old.x, event.clientY-old.y) <= threshold) clickGame(old.hit, old.down.button);
  }
  function wheel() {
    // Holding MMB while scrolling belongs to the game's score/character edit.
    if (gesture?.phase === 'pending' && gesture.down.button === 1) {
      gesture.phase = 'game';
      downGame(gesture.hit, 1);
    }
  }
  const bindings = [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel]];
  for (const [type,fn] of bindings) element.addEventListener(type,fn,{capture:true});
  win.addEventListener('blur',cancel);
  return {
    isCameraGesture: () => gesture?.phase === 'camera',
    cancel,
    dispose() { cancel(); for (const [type,fn] of bindings) element.removeEventListener(type,fn,{capture:true}); win.removeEventListener('blur',cancel); }
  };
}
