// Only the Start iframe uses this bridge. Standalone Construct startup is unchanged.
if (new URLSearchParams(location.search).get('embed') === '1') {
  let runtimeClass;
  let ready = false;
  let started = false;
  let allowed = false;
  let volume = 0;
  const generation = new URLSearchParams(location.search).get('generation') || '';
  const parentOrigin = location.origin;
  let audioOwner;
  let runtimeHandler;
  const pendingPlay = [];
  function audio() { return audioOwner; }
  function silence() {
    const owner = audio();
    if (!owner) return;
    try { owner._SetSilent?.({ isSilent: !started || !allowed }); } catch { /* runtime may still be attaching */ }
    try { owner._SetMasterVolume?.({ vol: started && allowed ? volume : 0 }); } catch { /* runtime may still be attaching */ }
  }
  Object.defineProperty(window, 'C3Audio_DOMInterface', {
    configurable: true,
    get() { return audioOwner; },
    set(owner) {
      audioOwner = owner;
      if (!owner || owner.__startEmbedWrapped) return;
      owner.__startEmbedWrapped = true;
      const createContext = owner._CreateAudioContext;
      owner._CreateAudioContext = async function (...args) {
        const result = await createContext.apply(this, args);
        silence();
        return result;
      };
      const runtimePlay = owner._Play;
      owner._Play = function (...args) {
        if (!started) { pendingPlay.push(args); return; }
        silence();
        return runtimePlay.apply(this, args);
      };
      owner.__startEmbedFlush = () => {
        silence();
        for (const args of pendingPlay.splice(0)) {
          try { void Promise.resolve(runtimePlay.apply(owner, args)).catch(() => {}); } catch { /* game may have stopped */ }
        }
      };
      silence();
    }
  });
  function suspend(next) {
    try { runtimeHandler?._OnVisibilityChange?.(next || document.hidden); } catch { /* runtime may be detaching */ }
  }
  function publish(type) {
    if (window.parent !== window) window.parent.postMessage({ type, generation }, parentOrigin);
  }
  Object.defineProperty(window, 'RuntimeInterface', {
    configurable: true,
    get() { return runtimeClass; },
    set(value) {
      runtimeClass = value;
      if (!value?.prototype?._OnRuntimeReady) return;
      const original = value.prototype._OnRuntimeReady;
      value.prototype._OnRuntimeReady = function (...args) {
        const result = original.apply(this, args);
        runtimeHandler = this._domHandlers?.find(handler => handler.GetComponentID?.() === 'runtime');
        if (runtimeHandler?._OnVisibilityChange) {
          const changeVisibility = runtimeHandler._OnVisibilityChange;
          runtimeHandler._OnVisibilityChange = function (hidden) { return changeVisibility.call(this, hidden || !started); };
        }
        suspend(true);
        ready = true;
        silence();
        publish('start-plunky-ready');
        return result;
      };
    }
  });
  window.addEventListener('message', event => {
    if (event.origin !== parentOrigin || event.source !== window.parent || event.data?.generation !== generation) return;
    const { type } = event.data;
    if (type === 'start-plunky-settings') {
      allowed = event.data.allowed === true;
      volume = Math.max(0, Math.min(1, Number(event.data.volume) || 0));
      silence();
    } else if (type === 'start-plunky-play' && ready) {
      started = true;
      silence();
      suspend(false);
      audioOwner?.__startEmbedFlush?.();
      requestAnimationFrame(() => requestAnimationFrame(() => { if (started) publish('start-plunky-playing'); }));
    } else if (type === 'start-plunky-stop') {
      started = false;
      pendingPlay.length = 0;
      suspend(true);
      silence();
    }
  });
  window.addEventListener('pagehide', () => { started = false; pendingPlay.length = 0; suspend(true); silence(); });
}
