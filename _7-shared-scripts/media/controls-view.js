import { snapSyncMs } from '../global-sync.js';
import { createControlsInput } from './controls-input.js';

const syncDragPreferenceKey = 'video-sync-unlimited-drag';
let syncDragPreference = null;
try { syncDragPreference = localStorage.getItem(syncDragPreferenceKey); } catch {}

function showSyncDragPreference() {
  if (document.getElementById('sync-drag-preference')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'sync-drag-preference';
  const theme = getControlsTheme();
  dialog.style.cssText = `max-width:420px;padding:24px;border:1px solid ${theme.fg};border-radius:14px;background:${theme.bg};color:${theme.fg};font:17px/1.5 "Segoe UI",sans-serif;`;
  dialog.setAttribute('aria-labelledby', 'sync-drag-heading');
  dialog.innerHTML = '<h2 id="sync-drag-heading" style="margin-top:0">Unlimited sync dragging?</h2><p>Hide the pointer while dragging and keep adjusting past the screen edges. Release the mouse or press Esc to restore the pointer. Your browser may still show its pointer-control notice.</p><p>Your choice is remembered in this browser. After choosing, drag the sync slider again.</p><button data-choice="enabled">Enable unlimited dragging</button> <button data-choice="disabled">Use normal dragging</button>';
  for (const button of dialog.querySelectorAll('button')) {
    button.style.cssText = 'padding:10px;margin:4px 0;border:1px solid currentColor;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:inherit';
    button.addEventListener('click', () => {
      syncDragPreference = button.dataset.choice;
      try { localStorage.setItem(syncDragPreferenceKey, syncDragPreference); } catch {}
      dialog.close();
    });
  }
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}

function getCssVar(name, fallback) {
  try {
    const bodyRaw = document.body ? getComputedStyle(document.body).getPropertyValue(name) : '';
    const bodyTrimmed = bodyRaw ? bodyRaw.trim() : '';
    if (bodyTrimmed) return bodyTrimmed;
    const rootRaw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const rootTrimmed = rootRaw ? rootRaw.trim() : '';
    return rootTrimmed || fallback;
  } catch {
    return fallback;
  }
}

function getControlsTheme() {
  const bg = getCssVar('--controls-bg', getCssVar('--primary-color', '#111'));
  const fg = getCssVar('--controls-fg', getCssVar('--hl-tertiary-color', '#fff'));
  const alphaRaw = getCssVar('--controls-bg-alpha', '0.9');
  const bgAlpha = Number.isFinite(parseFloat(alphaRaw)) ? parseFloat(alphaRaw) : 1;
  return { bg, fg, bgAlpha };
}

export function drawBackButton(ctx, rect, color) {
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w * 0.68, rect.y + rect.h * 0.22);
  ctx.lineTo(rect.x + rect.w * 0.32, rect.y + rect.h * 0.50);
  ctx.lineTo(rect.x + rect.w * 0.68, rect.y + rect.h * 0.78);
  ctx.stroke();
}

export function drawPlayButton(ctx, rect, paused, color) {
  ctx.fillStyle = color || '#fff';
  if (paused) {
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w * 0.30, rect.y + rect.h * 0.20);
    ctx.lineTo(rect.x + rect.w * 0.30, rect.y + rect.h * 0.80);
    ctx.lineTo(rect.x + rect.w * 0.80, rect.y + rect.h * 0.50);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(rect.x + rect.w * 0.25, rect.y + rect.h * 0.20, rect.w * 0.20, rect.h * 0.60);
    ctx.fillRect(rect.x + rect.w * 0.55, rect.y + rect.h * 0.20, rect.w * 0.20, rect.h * 0.60);
  }
}

export function drawMuteButton(ctx, rect, muted, color) {
  ctx.fillStyle = color || '#fff';
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w * 0.20, rect.y + rect.h * 0.35);
  ctx.lineTo(rect.x + rect.w * 0.40, rect.y + rect.h * 0.35);
  ctx.lineTo(rect.x + rect.w * 0.60, rect.y + rect.h * 0.15);
  ctx.lineTo(rect.x + rect.w * 0.60, rect.y + rect.h * 0.85);
  ctx.lineTo(rect.x + rect.w * 0.40, rect.y + rect.h * 0.65);
  ctx.lineTo(rect.x + rect.w * 0.20, rect.y + rect.h * 0.65);
  ctx.closePath();
  ctx.fill();

  if (muted) {
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w * 0.70, rect.y + rect.h * 0.30);
    ctx.lineTo(rect.x + rect.w * 0.94, rect.y + rect.h * 0.70);
    ctx.moveTo(rect.x + rect.w * 0.94, rect.y + rect.h * 0.30);
    ctx.lineTo(rect.x + rect.w * 0.70, rect.y + rect.h * 0.70);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(rect.x + rect.w * 0.70, rect.y + rect.h * 0.50, rect.w * 0.15, -Math.PI / 4, Math.PI / 4);
    ctx.stroke();
  }
}

export function drawProgressBar(ctx, rect, video, color, alpha = 1) {
  const fg = color || '#fff';
  ctx.save();
  ctx.globalAlpha = alpha * 0.35;
  ctx.fillStyle = fg;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();

  const progress = video && video.duration > 0 ? video.currentTime / video.duration : 0;
  ctx.fillStyle = fg;
  ctx.fillRect(rect.x, rect.y, rect.w * progress, rect.h);

  const dotX = rect.x + rect.w * progress;
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(dotX, rect.y + rect.h / 2, 6, 0, Math.PI * 2);
  ctx.fill();
}

function formatTime(t) {
  if (!isFinite(t) || t < 0) return '0:00';
  const minutes = Math.floor(t / 60);
  const seconds = Math.floor(t % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function drawTransportFlashOverlay(ctx, rect, kind, color, alpha = 1, scale = 1) {
  if (!ctx || !rect || !kind) return;
  const size = Math.min(rect.w, rect.h) * 0.20 * Math.max(0.75, scale);
  const x = rect.x + (rect.w - size) / 2;
  const y = rect.y + (rect.h - size) / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color || '#fff';
  ctx.lineWidth = Math.max(2, Math.round(size * 0.035));
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.5, size * 0.43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color || '#fff';
  if (kind === 'pause') {
    const barW = size * 0.14;
    const gap = size * 0.10;
    const barH = size * 0.42;
    const leftX = x + size * 0.5 - gap * 0.5 - barW;
    const topY = y + size * 0.5 - barH * 0.5;
    ctx.fillRect(leftX, topY, barW, barH);
    ctx.fillRect(leftX + barW + gap, topY, barW, barH);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + size * 0.42, y + size * 0.32);
    ctx.lineTo(x + size * 0.42, y + size * 0.68);
    ctx.lineTo(x + size * 0.72, y + size * 0.50);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function createVideoControlsUI(options = {}) {
  const state = { current: null };
  let disposed = false;
  let previewSeekTarget = null;
  let previewSeekHandler = null;
  let viewportProvider = null;
  let onAction = null;
  const enablePointer = options.enablePointer !== false;
  let transportFlash = null;
  let sliderDrag = null;
  let syncDrag = null;
  let endSyncDrag = null;
  let speedExpanded = false;
  let speedOutsideSince = 0;
  const speedChoices = [0.5, 0.75, 1, 1.25, 1.5, 2];
  function beginSyncDrag(ev) {
    const target = ev.target || document.querySelector('canvas');
    if (!target) return false;
    endSyncDrag?.();
    if (!['enabled', 'disabled'].includes(syncDragPreference)) {
      sliderDrag = null; syncDrag = null;
      showSyncDragPreference();
      return false;
    }
    const abort = new AbortController();
    const oldCursor = target.style.cursor;
    const initial = state.current?.syncMs || 0;
    let travel = 0, lastX = ev.clientX, lastPointerMoveTime = -Infinity;
    // Pointer lock hides the cursor exactly when the browser saves its position.
    // Keep it visible during acquisition and when permission is denied.
    const finish = () => {
      abort.abort(); target.style.cursor = oldCursor;
      if (document.pointerLockElement === target) document.exitPointerLock?.();
      sliderDrag = null; syncDrag = null; endSyncDrag = null;
    };
    endSyncDrag = finish;
    const move = event => {
      const locked = document.pointerLockElement === target;
      // The host cancels pointerdown, which can suppress compatibility mouse
      // events. Prefer pointermove, including under lock. Older implementations
      // send only mousemove under lock; ignore its duplicate when both arrive.
      if (event.type === 'pointermove') lastPointerMoveTime = event.timeStamp;
      else if (!locked || Math.abs(event.timeStamp - lastPointerMoveTime) < 2) return;
      const delta = locked ? event.movementX : event.clientX - lastX;
      lastX = event.clientX;
      if (Number.isFinite(delta)) travel += delta;
      onAction?.({type:'setSyncMs',value:snapSyncMs(initial + Math.round(travel / 2) * 5)});
    };
    window.addEventListener('pointermove', move, {signal:abort.signal, capture:true});
    window.addEventListener('mousemove', move, {signal:abort.signal, capture:true});
    for (const type of ['mouseup','pointerup','pointercancel']) window.addEventListener(type,finish,{signal:abort.signal,capture:true});
    window.addEventListener('blur',finish,{signal:abort.signal});
    document.addEventListener('pointerlockchange',()=>{ if (!document.pointerLockElement) finish(); },{signal:abort.signal});
    if (syncDragPreference === 'enabled') {
      try { const request=target.requestPointerLock?.(); request?.then?.(()=>{if(abort.signal.aborted && document.pointerLockElement===target)document.exitPointerLock?.();}).catch(()=>{}); } catch {}
    }
    return true;
  }
  const hoverPreview = {
    visible: false,
    ratio: 0,
    time: 0,
    lastRatio: -1,
    seekToken: 0,
    video: null
  };

  function getControlAvailability(s) {
    const incoming = (s && s.controls) || {};
    const defaults = {
      exit: !!(s && s.canPlay),
      play: !!(s && s.canPlay),
      mute: !!(s && s.canPlay),
      volume: !!(s && s.canPlay),
      seek: !!(s && s.canSeek),
      speed: false,
      pitch: false,
      sync: false,
      tablet: false,
      fullscreen: false
    };
    return { ...defaults, ...incoming };
  }

  function setViewportRectProvider(fn) {
    viewportProvider = fn;
  }

  function setState(next) {
    if (disposed) return;
    state.current = next || null;
  }

  function setOnAction(fn) {
    onAction = fn;
  }

  function getLayout(cw, ch) {
    const barH = Math.max(24, Math.round(ch * 0.11));
    const icon = Math.round(barH * 0.46);
    const pad = Math.round(barH * 0.28);
    const topY = 0;
    const bottomY = ch - barH;
    const progressH = Math.max(4, Math.round(barH * 0.08));
    const iconRowY = bottomY + Math.round(barH * 0.60);
    const iconTop = Math.round(iconRowY - icon / 2);
    const boxW = Math.round(icon * 1.42);
    const boxH = Math.round(icon * 0.95);
    const sliderW = speedExpanded ? cw * 0.08 : Math.max(Math.round(cw * 0.13), Math.round(icon * 2.3));
    const timeW = speedExpanded ? cw * 0.14 : Math.max(Math.round(cw * 0.20), Math.round(icon * 3.6));
    const rightGap = Math.max(8, Math.round(pad * 0.8));
    const dividerW = Math.max(2, Math.round(pad * 0.16));

    let cursor = cw - pad;
    const fullscreen = { x: cursor - icon, y: iconTop, w: icon, h: icon };
    cursor = fullscreen.x - rightGap;
    const tablet = { x: state.current?.controls?.fullscreen ? cursor - icon : fullscreen.x, y: iconTop, w: icon, h: icon };
    const help = { x: tablet.x - rightGap - icon, y: iconTop, w: icon, h: icon };
    cursor = help.x - rightGap;
    const pitch = { x: cursor - boxW, y: Math.round(iconRowY - boxH / 2), w: boxW, h: boxH };
    const dividerLeft = { x: pitch.x - Math.round(rightGap * 0.55) - Math.floor(dividerW / 2), y: iconTop + Math.round(icon * 0.14), w: dividerW, h: Math.round(icon * 0.72) };
    cursor = dividerLeft.x - Math.round(rightGap * 0.55);
    const speed = { x: cursor - boxW, y: iconTop, w: boxW, h: icon };
    const dividerRight = { x: tablet.x - Math.round(rightGap * 0.5) - Math.floor(dividerW / 2), y: iconTop + Math.round(icon * 0.14), w: dividerW, h: Math.round(icon * 0.72) };
    const speedStops = speedChoices.map((rate,i)=>({x:speed.x + speed.w - (6-i)*boxW*.95,y:iconTop,w:boxW*.95,h:icon,rate}));
    const time = { x: speedExpanded ? speedStops[0].x - timeW - rightGap : Math.round(cw / 2 - timeW / 2), y: iconTop, w: timeW, h: icon };
    const play = { x: pad, y: iconTop, w: icon, h: icon };
    const mute = { x: play.x + play.w + Math.round(pad * 0.55), y: iconTop, w: icon, h: icon };
    const volumeSlider = {
      x: mute.x + mute.w + Math.round(pad * 0.95),
      y: Math.round(iconRowY - (barH * 0.16) / 2),
      w: sliderW,
      h: Math.max(4, Math.round(barH * 0.16))
    };
    const progress = {
      x: pad,
      // Keep the seek rail wholly inside the lower physical frame.  The
      // earlier bleed looked stylish on the largest tablet but obscured too
      // much of the smaller Arcade and Music displays.
      y: bottomY + Math.round(barH * 0.14),
      w: cw - pad * 2,
      h: progressH
    };
    const back = { x: pad, y: topY + Math.round((barH - icon) / 2), w: icon, h: icon };
    const sync = { x: cw - pad - icon, y: topY + Math.round((barH - icon) / 2), w: icon, h: icon };
    const syncArrowSize = Math.max(18, Math.round(icon * 0.72));
    const syncArrowGap = Math.max(6, Math.round(pad * 0.28));
    const syncIncrease = {
      x: cw - pad - syncArrowSize,
      y: topY + Math.round((barH - syncArrowSize) / 2),
      w: syncArrowSize,
      h: syncArrowSize
    };
    const syncSliderW = Math.max(Math.round(cw * 0.23), Math.round(icon * 3.6));
    const syncSlider = {
      x: syncIncrease.x - syncArrowGap - syncSliderW,
      y: topY + Math.round(barH * 0.58),
      w: syncSliderW,
      h: Math.max(7, Math.round(barH * 0.17))
    };
    const syncDecrease = {
      x: syncSlider.x - syncArrowGap - syncArrowSize,
      y: syncIncrease.y,
      w: syncArrowSize,
      h: syncArrowSize
    };
    syncIncrease.y = syncDecrease.y = syncSlider.y + (syncSlider.h - syncArrowSize) / 2;
    const syncTextY = syncSlider.y - Math.max(8, Math.round(barH * 0.16));
    const titleLeft = back.x + back.w + Math.round(pad * 0.8);
    const titleRight = syncDecrease.x - Math.round(pad * 0.8);
    const titleRect = {
      x: titleLeft,
      y: topY + Math.round(barH * 0.18),
      w: Math.max(0, titleRight - titleLeft),
      h: Math.round(barH * 0.64)
    };

    return {
      topBar: { x: 0, y: topY, w: cw, h: barH },
      bottomBar: { x: 0, y: bottomY, w: cw, h: barH },
      barH,
      back,
      titleRect,
      sync,
      syncDecrease,
      syncSlider,
      syncIncrease,
      syncTextY,
      play,
      mute,
      volumeSlider,
      progress,
      time,
      speed, help, speedStops,
      pitch,
      tablet,
      fullscreen,
      dividerLeft,
      dividerRight,
      videoRect: { x: 0, y: 0, w: cw, h: ch }
    };
  }

  function drawDisabledOverlay(ctx, rect, alpha) {
    if (!ctx || !rect) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.38;
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = Math.max(2, Math.round(rect.h * 0.08));
    ctx.beginPath();
    ctx.moveTo(rect.x + rect.w * 0.24, rect.y + rect.h * 0.26);
    ctx.lineTo(rect.x + rect.w * 0.76, rect.y + rect.h * 0.74);
    ctx.stroke();
    ctx.restore();
  }

  function drawLabelBox(ctx, rect, textLines, color, alpha, disabled = false) {
    ctx.save();
    ctx.globalAlpha = disabled ? alpha * 0.4 : alpha;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (Array.isArray(textLines) && textLines.length === 2) {
      ctx.font = `${Math.round(rect.h * 0.48)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(textLines[0], rect.x + rect.w / 2, rect.y + rect.h * 0.38);
      ctx.fillText(textLines[1], rect.x + rect.w / 2, rect.y + rect.h * 0.76);
    } else {
      ctx.font = `${Math.round(rect.h * 0.62)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(String(textLines || ''), rect.x + rect.w / 2, rect.y + rect.h / 2 + 1);
    }
    ctx.restore();
    if (disabled) drawDisabledOverlay(ctx, rect, alpha);
  }

  function drawDivider(ctx, rect, color, alpha) {
    if (!ctx || !rect) return;
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawStepArrow(ctx, rect, direction, color, alpha) {
    if (!ctx || !rect) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const halfW = rect.w * 0.24;
    const halfH = rect.h * 0.34;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    if (direction < 0) {
      ctx.moveTo(cx - halfW, cy);
      ctx.lineTo(cx + halfW, cy - halfH);
      ctx.lineTo(cx + halfW, cy + halfH);
    } else {
      ctx.moveTo(cx + halfW, cy);
      ctx.lineTo(cx - halfW, cy - halfH);
      ctx.lineTo(cx - halfW, cy + halfH);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFocusButton(ctx, rect, focused, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // A proper four-corner icon stays legible at the tablet's projected size.
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, rect.h * 0.075);
    ctx.lineCap = 'round';
    const pad = rect.w * (focused ? 0.16 : 0.2), arm = rect.w * (focused ? 0.16 : 0.22);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = rect.x + rect.w / 2 + sx * (rect.w / 2 - pad);
      const y = rect.y + rect.h / 2 + sy * (rect.h / 2 - pad);
      const cx = focused ? x - sx * arm : x;
      const cy = focused ? y - sy * arm : y;
      const direction = focused ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx + direction * sx * arm, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + direction * sy * arm);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVolumeSlider(ctx, rect, volume, theme, alpha, enabled, dragScale = 1) {
    if (!ctx || !rect) return;
    const v = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    const knobR = Math.max(6, Math.round(Math.min(rect.w, rect.h * 3.8) * 0.11)) * dragScale;
    const trackX = rect.x + knobR;
    const trackW = Math.max(1, rect.w - knobR * 2);
    const trackY = rect.y + rect.h / 2;
    const trackH = Math.max(4, Math.round(rect.h * 0.58));
    const knobX = trackX + trackW * v;
    const knobY = trackY;

    ctx.save();
    ctx.globalAlpha = enabled ? alpha : alpha * 0.25;
    ctx.lineCap = 'round';
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = trackH;
    ctx.globalAlpha = enabled ? alpha * 0.22 : alpha * 0.10;
    ctx.beginPath();
    ctx.moveTo(trackX, trackY);
    ctx.lineTo(trackX + trackW, trackY);
    ctx.stroke();
    ctx.globalAlpha = enabled ? alpha : alpha * 0.25;
    ctx.beginPath();
    ctx.moveTo(trackX, trackY);
    ctx.lineTo(knobX, trackY);
    ctx.stroke();

    ctx.fillStyle = theme.fg;
    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = Math.max(1, Math.round(knobR * 0.16));
    ctx.beginPath();
    ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = theme.bg;
    ctx.lineWidth = Math.max(1, Math.round(knobR * 0.13));
    ctx.lineCap = 'round';
    const barGap = knobR * 0.34;
    const barBase = knobY + knobR * 0.42;
    const heights = [0.52, 0.82, 0.36];
    for (let i = 0; i < 3; i++) {
      const x = knobX + (i - 1) * barGap;
      const h = knobR * heights[i];
      ctx.beginPath();
      ctx.moveTo(x, barBase);
      ctx.lineTo(x, barBase - h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHoverPreview(ctx, ui, s, theme, alpha) {
    if (!hoverPreview.visible || !s || !s.canSeek) return;
    const previewVideo = s.previewVideo || s.lqVideo || null;
    if (!previewVideo) return;
    const previewW = Math.max(190, Math.min(Math.round(ui.videoRect.w * 0.46), 360));
    const aspect = previewVideo.videoWidth && previewVideo.videoHeight ? previewVideo.videoWidth / previewVideo.videoHeight : 16 / 9;
    const previewH = Math.round(previewW / aspect);
    const labelH = Math.max(24, Math.round(previewH * 0.18));
    const dotX = ui.progress.x + ui.progress.w * hoverPreview.ratio;
    const x = Math.max(6, Math.min(ui.videoRect.w - previewW - 6, Math.round(dotX - previewW / 2)));
    const y = Math.max(6, Math.round(ui.progress.y - previewH - labelH - 10));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(x - 2, y - 2, previewW + 4, previewH + labelH + 4);
    if (previewVideo.readyState >= 2) {
      try { ctx.drawImage(previewVideo, x, y, previewW, previewH); } catch { /* ignore */ }
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y, previewW, previewH);
    }
    ctx.strokeStyle = theme.fg;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 0.5, y - 0.5, previewW + 1, previewH + 1);
    ctx.fillStyle = theme.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(15, Math.round(previewH * 0.16))}px "Source Sans 3","Segoe UI",sans-serif`;
    ctx.fillText(formatTime(hoverPreview.time), x + previewW / 2, y + previewH + labelH / 2);
    ctx.restore();
  }

  function draw(ctx, meta = {}) {
    if (!ctx || !ctx.canvas) return;
    const s = state.current;
    if (!s || !s.canPlay) return;
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const ui = getLayout(cw, ch);
    const alpha = Number.isFinite(meta.alpha) ? meta.alpha : 1;
    const controls = getControlAvailability(s);
    const syncRangeMs = Number.isFinite(s.syncRangeMs) ? Math.max(100, s.syncRangeMs) : 3000;
    const syncMs = Number.isFinite(s.syncMs) ? s.syncMs : 0;
    const syncRatio = Math.max(0, Math.min(1, (syncMs + syncRangeMs) / (syncRangeMs * 2)));
    const volume = Math.max(0, Math.min(1, Number.isFinite(s.volume) ? s.volume : 0));
    const timeStr = `${formatTime(s.currentTime || 0)} / ${formatTime(s.duration || 0)}`;
    const rateLabel = `${Number.isFinite(s.playbackRate) ? s.playbackRate : 1}x`;
    const pitchLabel = s.preservePitch === false ? ['Time', 'Stretch'] : ['Pitch', 'Shift'];
    const title = String(s.title || '').trim();

    const theme = getControlsTheme();
    ctx.save();
    ctx.globalAlpha = alpha * theme.bgAlpha;
    const topGradient = ctx.createLinearGradient(0, ui.topBar.y, 0, ui.topBar.y + ui.topBar.h);
    topGradient.addColorStop(0, theme.bg);
    topGradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topGradient;
    ctx.fillRect(ui.topBar.x, ui.topBar.y, ui.topBar.w, ui.topBar.h);
    const bottomGradient = ctx.createLinearGradient(0, ui.bottomBar.y, 0, ui.bottomBar.y + ui.bottomBar.h);
    bottomGradient.addColorStop(0, 'rgba(0,0,0,0)');
    bottomGradient.addColorStop(0.18, theme.bg);
    bottomGradient.addColorStop(1, theme.bg);
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(ui.bottomBar.x, ui.bottomBar.y - Math.max(0, Math.round(ui.barH * 0.35)), ui.bottomBar.w, ui.bottomBar.h + Math.max(0, Math.round(ui.barH * 0.35)));
    ctx.restore();

    if (controls.exit) {
      ctx.save();
      ctx.globalAlpha = alpha;
      drawBackButton(ctx, ui.back, theme.fg);
      ctx.restore();
    }

    if (ui.titleRect.w > 0 && title) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = theme.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(ui.barH * 0.42)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(title, ui.titleRect.x + ui.titleRect.w / 2, ui.titleRect.y + ui.titleRect.h / 2 + 1);
      ctx.restore();
    }

    if (controls.sync) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = theme.fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(ui.sync.h * 0.82)}px "Material Symbols Rounded","Material Symbols Outlined","Material Icons"`;

      drawStepArrow(ctx, ui.syncDecrease, -1, theme.fg, alpha);
      drawStepArrow(ctx, ui.syncIncrease, 1, theme.fg, alpha);
      ctx.fillRect(ui.syncSlider.x, ui.syncSlider.y, ui.syncSlider.w, ui.syncSlider.h);
      ctx.globalAlpha = alpha * 0.45;
      ctx.fillRect(ui.syncSlider.x, ui.syncSlider.y, ui.syncSlider.w * syncRatio, ui.syncSlider.h);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(ui.syncSlider.x + ui.syncSlider.w * syncRatio, ui.syncSlider.y + ui.syncSlider.h / 2, Math.max(4, Math.round(ui.syncSlider.h * 0.9)) * (sliderDrag === 'sync' ? 1.25 : 1), 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `${Math.round(ui.barH * 0.28)}px "Source Sans 3","Segoe UI",sans-serif`;
      ctx.fillText(`SYNC ${syncMs} ms`, ui.syncSlider.x + ui.syncSlider.w / 2, ui.syncTextY);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = controls.play ? alpha : alpha * 0.4;
    drawPlayButton(ctx, ui.play, !s.playing, theme.fg);
    ctx.restore();
    if (!controls.play) drawDisabledOverlay(ctx, ui.play, alpha);

    ctx.save();
    ctx.globalAlpha = controls.mute ? alpha : alpha * 0.4;
    drawMuteButton(ctx, ui.mute, !!s.muted, theme.fg);
    ctx.restore();
    if (!controls.mute) drawDisabledOverlay(ctx, ui.mute, alpha);

    drawVolumeSlider(ctx, ui.volumeSlider, volume, theme, alpha, controls.volume, sliderDrag === 'volume' ? 1.25 : 1);
    if (!controls.volume) drawDisabledOverlay(ctx, ui.volumeSlider, alpha);

    ctx.save();
    ctx.globalAlpha = controls.seek ? alpha : alpha * 0.3;
    drawProgressBar(ctx, ui.progress, { currentTime: s.currentTime || 0, duration: s.duration || 0 }, theme.fg, controls.seek ? alpha : alpha * 0.35);
    ctx.restore();
    if (!controls.seek) drawDisabledOverlay(ctx, ui.progress, alpha);
    drawHoverPreview(ctx, ui, s, theme, alpha);

    drawLabelBox(ctx, ui.time, timeStr, theme.fg, alpha, false);
    if (speedExpanded && speedOutsideSince && performance.now()-speedOutsideSince>1500) speedExpanded=false;
    if (controls.speed) {
      if (speedExpanded) ui.speedStops.forEach(stop => {
        const selected = Math.abs((s.playbackRate || 1) - stop.rate) < .01;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = theme.fg;
        ctx.fillStyle = theme.fg;
        ctx.lineWidth = selected ? 3 : 1;
        ctx.strokeRect(stop.x + 3, stop.y + 2, stop.w - 6, stop.h - 4);
        ctx.font = `${Math.round(stop.h * .40)}px "Source Sans 3","Segoe UI",sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(stop.rate + 'x', stop.x + stop.w / 2, stop.y + stop.h / 2);
        ctx.restore();
      });
      else drawLabelBox(ctx, ui.speed, rateLabel, theme.fg, alpha, false);
    }
    if (controls.tablet || controls.fullscreen) {
      ctx.save(); ctx.globalAlpha=alpha; ctx.strokeStyle=theme.fg; ctx.lineWidth=Math.max(2,ui.help.h*.06);
      ctx.beginPath();ctx.arc(ui.help.x+ui.help.w/2,ui.help.y+ui.help.h/2,ui.help.h*.4,0,Math.PI*2);ctx.stroke();ctx.restore();
      drawLabelBox(ctx,ui.help,'?',theme.fg,alpha,false);
    }
    if (controls.pitch) {
      drawLabelBox(ctx, ui.pitch, pitchLabel, theme.fg, alpha, false);
      if (controls.speed) drawDivider(ctx, ui.dividerLeft, theme.fg, alpha);
    }

    if (controls.tablet) {
      if (controls.pitch || controls.speed) drawDivider(ctx, ui.dividerRight, theme.fg, alpha);
      drawFocusButton(ctx, ui.tablet, !!s.tabletView, theme.fg, alpha);
    }

    if (controls.fullscreen) {
      drawFocusButton(ctx, ui.fullscreen, !!s.fullscreen, theme.fg, alpha);
    }

    if (transportFlash) {
      const elapsed = performance.now() - transportFlash.startedAt;
      const t = Math.max(0, Math.min(1, elapsed / Math.max(1, transportFlash.durationMs)));
      if (t >= 1) {
        transportFlash = null;
      } else {
        const flashAlpha = alpha * (1 - t);
        const flashScale = 1 + (t * 0.32);
        drawTransportFlashOverlay(ctx, ui.videoRect, transportFlash.kind, theme.fg, flashAlpha, flashScale);
      }
    }
  }

  const { getPointerPosition, inspectPointerEvent } = createControlsInput({
    getState: () => state.current, getLayout, getControlAvailability,
    getViewportRect: () => viewportProvider?.(), isSpeedExpanded: () => speedExpanded,
    snapSyncMs
  });

  function handlePointerEvent(ev, meta = {}) {
    if (disposed) return false;
    if (!enablePointer) return false;
    if (meta && typeof meta.delegate === 'function') return !!meta.delegate(ev);
    const eventType = String(ev?.type || '');
    if (eventType && eventType !== 'pointerdown' && eventType !== 'mousedown' && eventType !== 'click' && eventType !== 'touchstart') {
      return false;
    }
    const result = inspectPointerEvent(ev, meta);
    if (!result.hit) return false;
    if (result.control === 'speedStop' && eventType === 'click') return true;
    // Only a press can begin slider ownership. A browser fires `click` after
    // pointerup (including after a long drag); treating that trailing click as
    // another drag start leaves the seek/volume control latched to hover moves.
    const beginsPointerGesture = !eventType
      || eventType === 'pointerdown'
      || eventType === 'mousedown'
      || eventType === 'touchstart';
    if (result.handled && beginsPointerGesture && ['volume', 'sync', 'seek'].includes(result.control)) {
      sliderDrag = result.control;
      if (sliderDrag === 'sync') {
        const pos = getPointerPosition(ev, meta);
        if (!beginSyncDrag(ev)) return true;
        syncDrag = { x: Number.isFinite(ev.clientX) ? ev.clientX : pos.x * 800 / pos.cw, value: state.current?.syncMs || 0 };
      }
      hoverPreview.visible = false;
      hoverPreview.lastRatio = -1;
    }
    if (result.handled && result.action?.type === 'togglePlay') {
      // A small, non-blocking transport acknowledgement makes screen clicks
      // understandable even while the chrome is fading away.
      transportFlash = {
        kind: state.current?.playing ? 'pause' : 'play',
        startedAt: performance.now(),
        durationMs: 500
      };
    }
    if (result.action?.type === 'expandSpeed') { if(eventType !== 'click'){speedExpanded=!speedExpanded;speedOutsideSince=0;} return true; }
    if (result.action?.type === 'shortcutHelp') { if(eventType !== 'click')showVideoKeyboardShortcuts(); return true; }
    if (result.handled && onAction && result.action && !(result.control === 'sync' && eventType === 'click')) onAction(result.action);
    return !!result.handled;
  }

  function handlePointerMove(ev, meta = {}) {
    if (disposed) return false;
    // Relative mouse events own sync dragging, even off the projected tablet.
    if (endSyncDrag) return true;
    // A release can occur outside a projected WebGL control surface. Recover
    // on the next move as well as through each host page's explicit release
    // handler so one slider can never remain latched indefinitely.
    if (sliderDrag && typeof ev?.buttons === 'number' && ev.buttons === 0) {
      sliderDrag = null;
    }
    const s = state.current;
    if (!s || (!s.canSeek && !sliderDrag)) {
      hoverPreview.visible = false;
      return false;
    }
    const pos = getPointerPosition(ev, meta);
    if (!pos) {
      hoverPreview.visible = false;
      return false;
    }
    const ui = getLayout(pos.cw, pos.ch);
    if (sliderDrag) {
      hoverPreview.visible = false;
      hoverPreview.lastRatio = -1;
      if (sliderDrag === 'sync' && syncDrag) {
        const x = Number.isFinite(ev.clientX) ? ev.clientX : pos.x * 800 / pos.cw;
        const value = snapSyncMs(syncDrag.value + Math.round((x - syncDrag.x) / 2) * 5);
        onAction?.({ type: 'setSyncMs', value });
        return true;
      }
      const rect = sliderDrag === 'volume' ? ui.volumeSlider : (sliderDrag === 'sync' ? ui.syncSlider : ui.progress);
      // A held slider follows only along its own axis. Leaving either end
      // pauses the value instead of snapping it to 0 or 100%; re-entering the
      // range resumes the drag exactly where the pointer is.
      if (pos.x >= rect.x && pos.x <= rect.x + rect.w) {
        const ratio = Math.max(0, Math.min(1, (pos.x - rect.x) / rect.w));
        if (sliderDrag === 'volume') onAction?.({ type: 'setVolume', volume: ratio });
        if (sliderDrag === 'seek') onAction?.({ type: 'seekToRatio', ratio });
        if (sliderDrag === 'sync') onAction?.({ type: 'setSyncMs', value: Math.round((ratio * 2 - 1) * (Number.isFinite(s.syncRangeMs) ? Math.max(100, s.syncRangeMs) : 3000)), ratio });
      }
      return true;
    }
    if (speedExpanded) {
      const first=ui.speedStops[0], last=ui.speedStops[5];
      const inside=pos.x>=first.x-10 && pos.x<=last.x+last.w+10 && pos.y>=first.y-10 && pos.y<=first.y+first.h+10;
      if(inside)speedOutsideSince=0;else if(!speedOutsideSince)speedOutsideSince=performance.now();
    }
    const yHit = pos.y >= ui.progress.y - 10 && pos.y <= ui.progress.y + ui.progress.h + 10;
    const xHit = pos.x >= ui.progress.x && pos.x <= ui.progress.x + ui.progress.w;
    if (!xHit || !yHit) {
      hoverPreview.visible = false;
      hoverPreview.lastRatio = -1;
      return false;
    }
    const ratio = Math.max(0, Math.min(1, (pos.x - ui.progress.x) / ui.progress.w));
    const duration = Number.isFinite(s.duration) ? s.duration : 0;
    const time = duration > 0 ? duration * ratio : 0;
    hoverPreview.visible = true;
    hoverPreview.ratio = ratio;
    hoverPreview.time = time;
    const previewVideo = s.previewVideo || s.lqVideo || null;
    if (previewVideo && Math.abs(ratio - hoverPreview.lastRatio) >= 0.006) {
      previewSeekTarget?.removeEventListener?.('seeked', previewSeekHandler);
      hoverPreview.lastRatio = ratio;
      hoverPreview.video = previewVideo;
      const token = ++hoverPreview.seekToken;
      try { previewVideo.pause(); } catch { /* ignore */ }
      try {
        const dur = Number.isFinite(previewVideo.duration) && previewVideo.duration > 0 ? previewVideo.duration : duration;
        previewVideo.currentTime = Math.max(0, Math.min(dur || time, time));
        previewSeekTarget = previewVideo;
        previewSeekHandler = () => {
          if (hoverPreview.seekToken !== token) return;
          hoverPreview.visible = true;
          previewSeekTarget = null;
          previewSeekHandler = null;
        };
        previewVideo.addEventListener('seeked', previewSeekHandler, { once: true });
      } catch { /* ignore */ }
    }
    return true;
  }

  return {
    setViewportRectProvider,
    setState,
    draw,
    handlePointerMove,
    clearHoverPreview() {
      if(speedExpanded && !speedOutsideSince)speedOutsideSince=performance.now();
      hoverPreview.visible = false;
      hoverPreview.lastRatio = -1;
    },
    endPointerInteraction() {
      endSyncDrag?.();
      sliderDrag = null;
      syncDrag = null;
      hoverPreview.visible = false;
      hoverPreview.lastRatio = -1;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      endSyncDrag?.();
      previewSeekTarget?.removeEventListener?.('seeked', previewSeekHandler);
      previewSeekTarget = null;
      previewSeekHandler = null;
      hoverPreview.seekToken++;
      hoverPreview.video = null;
      hoverPreview.visible = false;
      state.current = null;
      viewportProvider = null;
      onAction = null;
    },
    handlePointerEvent,
    inspectPointerEvent,
    notifyTransportToggle(kind) {
      transportFlash = {
        kind: kind === 'pause' ? 'pause' : 'play',
        startedAt: performance.now(),
        durationMs: 500
      };
    },
    set onAction(fn) { setOnAction(fn); },
    get onAction() { return onAction; }
  };
}

// Shared, intentionally compact version of YouTube's shortcut reference.
// Pages call this only while a player is active, so piano/menu controls remain
// discoverable in their normal contexts.
export function showVideoKeyboardShortcuts() {
  const existing = document.getElementById('shared-video-shortcuts');
  if (existing) { existing.remove(); return; }
  const dialog = document.createElement('section');
  dialog.id = 'shared-video-shortcuts';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Video keyboard shortcuts');
  dialog.style.cssText = 'position:fixed;z-index:2147483647;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 32px));background:#18181b;color:#f4f4f5;border:1px solid #52525b;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.6);padding:22px;font:16px/1.45 "Segoe UI",sans-serif;';
  dialog.innerHTML = '<button aria-label="Close shortcut help" style="position:absolute;right:12px;top:8px;border:0;background:none;color:inherit;font-size:28px;cursor:pointer">×</button><h2 style="margin:0 0 14px;font-size:24px">Keyboard shortcuts</h2><div style="display:grid;grid-template-columns:1fr auto;gap:8px 20px"><span>Play / pause</span><kbd>Space or K</kbd><span>Back / forward 10 seconds</span><kbd>J / L</kbd><span>Back / forward 5 seconds</span><kbd>← / →</kbd><span>Volume</span><kbd>↑ / ↓</kbd><span>Mute</span><kbd>M</kbd><span>Toggle tablet view</span><kbd>F</kbd><span>Playback speed</span><kbd>Shift + , / .</kbd><span>Previous / next frame (paused)</span><kbd>, / .</kbd><span>Seek to a percentage</span><kbd>0–9</kbd><span>Exit player</span><kbd>Esc</kbd><span>Show / hide this help</span><kbd>Shift + /</kbd></div>';
  const close = () => dialog.remove();
  const theme = getControlsTheme();
  dialog.style.background = theme.bg;
  dialog.style.color = theme.fg;
  dialog.style.borderColor = theme.fg;
  dialog.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'Escape') close();
  });
  dialog.querySelector('button')?.addEventListener('click', close);
  const dragSettings = document.createElement('button');
  dragSettings.textContent = 'Sync dragging preference…';
  dragSettings.style.cssText = 'margin-top:18px;padding:8px;border:1px solid currentColor;background:transparent;color:inherit;border-radius:6px;cursor:pointer';
  dragSettings.addEventListener('click', () => { close(); showSyncDragPreference(); });
  dialog.appendChild(dragSettings);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  document.body.appendChild(dialog);
  dialog.querySelector('button')?.focus();
}
