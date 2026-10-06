// Pointer coordinates are CSS pixels at the boundary; layout/view own logical
// canvas dimensions and DPR. No page media or rendering dependency enters here.
export function createControlsInput({ getState, getLayout, getControlAvailability, getViewportRect, isSpeedExpanded, snapSyncMs }) {
  function getPointerPosition(ev, meta = {}) {
    if (Number.isFinite(ev?.canvasX) && Number.isFinite(ev?.canvasY)) {
      const cw = meta.canvasWidth || 1;
      const ch = meta.canvasHeight || 1;
      return { x: ev.canvasX, y: ev.canvasY, cw, ch };
    }
    const rect = getViewportRect?.() || null;
    if (!rect || !rect.width || !rect.height) return null;
    const cw = meta.canvasWidth || rect.width;
    const ch = meta.canvasHeight || rect.height;
    return {
      x: ((ev.clientX - rect.left) / rect.width) * cw,
      y: ((ev.clientY - rect.top) / rect.height) * ch,
      cw,
      ch
    };
  }

  function inspectPointerEvent(ev, meta = {}) {
    const s = getState();
    if (!s) return { hit: false, handled: false, action: null };
    const pos = getPointerPosition(ev, meta);
    if (!pos) return { hit: false, handled: false, action: null };
    const { x, y, cw, ch } = pos;
    const ui = getLayout(cw, ch);
    const controls = getControlAvailability(s);
    const syncRangeMs = Number.isFinite(s.syncRangeMs) ? Math.max(100, s.syncRangeMs) : 3000;
    const within = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

    if (within(ui.back)) {
      return { hit: true, handled: !!controls.exit, action: controls.exit ? { type: 'exit' } : null, control: 'exit' };
    }
    if (within(ui.play)) {
      return { hit: true, handled: !!controls.play, action: controls.play ? { type: 'togglePlay' } : null, control: 'play' };
    }
    if (within(ui.mute)) {
      return { hit: true, handled: !!controls.mute, action: controls.mute ? { type: 'toggleMute' } : null, control: 'mute' };
    }
    if ((controls.tablet || controls.fullscreen) && within(ui.help)) return {hit:true,handled:true,control:'help',action:{type:'shortcutHelp'}};
    if (controls.speed && isSpeedExpanded()) {
      const stop=ui.speedStops.find(within);
      if(stop)return {hit:true,handled:true,control:'speedStop',action:{type:'setRate',rate:stop.rate}};
    }
    if (within(ui.tablet) && controls.tablet) {
      return { hit: true, handled: !!controls.tablet, action: controls.tablet ? { type: 'toggleTablet' } : null, control: 'tablet' };
    }
    if (within(ui.fullscreen)) {
      return { hit: true, handled: !!controls.fullscreen, action: controls.fullscreen ? { type: 'toggleFullscreen' } : null, control: 'fullscreen' };
    }
    if (within(ui.speed)) {
      return { hit: true, handled: !!controls.speed, action: controls.speed ? { type: 'expandSpeed' } : null, control: 'speed' };
    }
    if (within(ui.pitch)) {
      return { hit: true, handled: !!controls.pitch, action: controls.pitch ? { type: 'togglePitch' } : null, control: 'pitch' };
    }
    if (within(ui.syncDecrease) || within(ui.syncIncrease)) {
      const direction = within(ui.syncDecrease) ? -1 : 1;
      const step = Number(ev?.button) === 2 ? 10 : 5;
      const current = Number.isFinite(s.syncMs) ? s.syncMs : 0;
      const value = Math.max(-syncRangeMs, Math.min(syncRangeMs, current + direction * step));
      return { hit: true, handled: !!controls.sync, action: controls.sync ? { type: 'setSyncMs', value } : null, control: 'sync-step' };
    }
    if (x >= ui.syncSlider.x - 8 && x <= ui.syncSlider.x + ui.syncSlider.w + 8 && y >= ui.syncSlider.y - ui.barH * 0.16 && y <= ui.syncSlider.y + ui.syncSlider.h + ui.barH * 0.16) {
      const ratio = Math.max(0, Math.min(1, (x - ui.syncSlider.x) / ui.syncSlider.w));
      const syncMs = snapSyncMs(s.syncMs || 0);
      return { hit: true, handled: !!controls.sync, action: controls.sync ? { type: 'setSyncMs', value: syncMs, ratio } : null, control: 'sync' };
    }
    if (y >= ui.progress.y - 6 && y <= ui.progress.y + ui.progress.h + 6 && x >= ui.progress.x && x <= ui.progress.x + ui.progress.w) {
      const ratio = Math.max(0, Math.min(1, (x - ui.progress.x) / ui.progress.w));
      return { hit: true, handled: !!controls.seek, action: controls.seek ? { type: 'seekToRatio', ratio } : null, control: 'seek' };
    }
    if (y >= ui.volumeSlider.y - 6 && y <= ui.volumeSlider.y + ui.volumeSlider.h + 6 && x >= ui.volumeSlider.x && x <= ui.volumeSlider.x + ui.volumeSlider.w) {
      const ratio = Math.max(0, Math.min(1, (x - ui.volumeSlider.x) / ui.volumeSlider.w));
      return { hit: true, handled: !!controls.volume, action: controls.volume ? { type: 'setVolume', volume: ratio } : null, control: 'volume' };
    }
    return { hit: false, handled: false, action: null, control: null };
  }

  return { getPointerPosition, inspectPointerEvent };
}
