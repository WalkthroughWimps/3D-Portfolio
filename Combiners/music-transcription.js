// Tablet screen overlay for the music page (piano tablet)
// Creates a canvas texture on the `pe'rPad_screen` mesh and
// draws a sheet-music style UI with a yellow frame and controls.

import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';

// Palette shared with piano scene: yellow frame + white-key glow green
const PALETTE = {
  bg: '#050913',          // tablet background
  frame: '#ffd54f',       // yellow frame
  staffLines: '#f5f5f5',  // light staff lines
  staffBars: '#e0e0e0',   // bar lines / beat ticks
  text: '#f5f5f5',
  panelBg: '#060a12',
  panelBorder: '#ffd54f',
  // Match GlowMaterials['keys_white_glow'].color (0x17FF1C)
  accentGreen: '#17ff1c'
};

// Layout helper: computes content rect, panel area, staff areas, bars and beats
function computeLayout(CW, CH, margin, opts = {}) {
  const bars = opts.bars || 4;
  const beatsPerBar = opts.beatsPerBar || 4;

  const contentRect = {
    x: margin,
    y: margin,
    w: CW - margin * 2,
    h: CH - margin * 2
  };

  const panelFrac = 0.16; // narrow control strip
  const gutterX = Math.round(contentRect.w * 0.02);
  const panelRect = {
    x: contentRect.x,
    y: contentRect.y,
    w: Math.round(contentRect.w * panelFrac),
    h: contentRect.h
  };

  const rightInset = Math.round(contentRect.w * 0.035); // extra breathing room on right
  const staffRect = {
    x: panelRect.x + panelRect.w + gutterX,
    y: contentRect.y,
    w: contentRect.w - panelRect.w - gutterX - rightInset,
    h: contentRect.h
  };

  // Vertical padding so staff blocks have similar margins top/bottom
  const topPad = Math.round(staffRect.h * 0.12);
  const bottomPad = topPad;
  const usableH = staffRect.h - topPad - bottomPad;
  const gap = Math.round(usableH * 0.10);
  const bandH = Math.floor((usableH - gap) / 2);

  const trebleRect = {
    x: staffRect.x,
    y: staffRect.y + topPad,
    w: staffRect.w,
    h: bandH
  };
  const bassRect = {
    x: staffRect.x,
    y: trebleRect.y + trebleRect.h + gap,
    w: staffRect.w,
    h: bandH
  };

  const barWidth = staffRect.w / bars;
  const barRects = [];
  const beatX = [];
  for (let b = 0; b < bars; b++) {
    const bx = staffRect.x + b * barWidth;
    const bw = barWidth;
    barRects.push({ x: bx, y: staffRect.y, w: bw, h: staffRect.h });
    const beats = [];
    for (let i = 0; i < beatsPerBar; i++) {
      const t = (i + 0.5) / beatsPerBar; // center of beat
      beats.push(bx + bw * t);
    }
    beatX.push(beats);
  }

  return {
    contentRect,
    panelRect,
    staffRect,
    trebleRect,
    bassRect,
    bars,
    beatsPerBar,
    barRects,
    beatX
  };
}

function drawTabletFrame(ctx, CW, CH, margin) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = PALETTE.frame;
  ctx.lineWidth = 4;
  ctx.strokeRect(margin + 0.5, margin + 0.5, CW - margin * 2 - 1, CH - margin * 2 - 1);
}

function drawStaffBand(ctx, rect) {
  const lineGap = rect.h / 10; // 11-line system (0..10), middle implied
  ctx.strokeStyle = PALETTE.staffLines;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  // Draw top 5 and bottom 5 lines; leave center gap where middle line will appear only for notes
  for (let i = 0; i < 5; i++) {
    const y = rect.y + i * lineGap;
    ctx.beginPath();
    ctx.moveTo(rect.x, Math.round(y) + 0.5);
    ctx.lineTo(rect.x + rect.w, Math.round(y) + 0.5);
    ctx.stroke();
  }
  for (let i = 6; i < 11; i++) {
    const y = rect.y + i * lineGap;
    ctx.beginPath();
    ctx.moveTo(rect.x, Math.round(y) + 0.5);
    ctx.lineTo(rect.x + rect.w, Math.round(y) + 0.5);
    ctx.stroke();
  }
}

function drawBarsAndBeats(ctx, layout) {
  const { trebleRect, bassRect, barRects, beatsPerBar } = layout;
  ctx.strokeStyle = PALETTE.staffBars;
  ctx.lineWidth = 3;
  const lineGapTop = trebleRect.h / 10;
  const lineGapBot = bassRect.h / 10;
  const topBandTop = trebleRect.y;
  const topBandBottom = trebleRect.y + lineGapTop * 10;   // full 11-line band (0..10)
  const bottomBandTop = bassRect.y;
  const bottomBandBottom = bassRect.y + lineGapBot * 10;  // full 11-line band

  // Bar lines: one at each bar start plus a final at the end
  const totalBars = barRects.length;
  for (let i = 0; i <= totalBars; i++) {
    const brIndex = (i === totalBars) ? totalBars - 1 : i;
    const br = barRects[brIndex];
    const x = Math.round(i === totalBars ? (br.x + br.w) : br.x);
    // top band (full 11-line range, middle line implied by gap only in staff renderer)
    ctx.beginPath();
    ctx.moveTo(x + 0.5, topBandTop);
    ctx.lineTo(x + 0.5, topBandBottom);
    ctx.stroke();
    // bottom band
    ctx.beginPath();
    ctx.moveTo(x + 0.5, bottomBandTop);
    ctx.lineTo(x + 0.5, bottomBandBottom);
    ctx.stroke();
  }

  // Note-entry guide lines (sky blue), 4 per bar per staff band
  ctx.save();
  ctx.strokeStyle = '#87ceeb'; // sky blue
  ctx.lineWidth = 1.5;
  barRects.forEach((br) => {
    const bx = br.x;
    const bw = br.w;
    for (let i = 0; i < beatsPerBar; i++) {
      const t = (i + 0.5) / beatsPerBar;
      const x = bx + bw * t;
      // From just below first line to just above last line in each 11-line band
      const bandSpanTop = (topBandBottom - topBandTop);
      const bandSpanBot = (bottomBandBottom - bottomBandTop);
      const topPadSeg = bandSpanTop * 0.06;
      const botPadSeg = bandSpanBot * 0.06;
      // top staff band
      ctx.beginPath();
      ctx.moveTo(x + 0.5, topBandTop + topPadSeg);
      ctx.lineTo(x + 0.5, topBandBottom - topPadSeg);
      ctx.stroke();
      // bottom staff band
      ctx.beginPath();
      ctx.moveTo(x + 0.5, bottomBandTop + botPadSeg);
      ctx.lineTo(x + 0.5, bottomBandBottom - botPadSeg);
      ctx.stroke();
    }
  });
  ctx.restore();
}

// Map a vertical canvas Y position within a staff band to a staff index 0..10
// Intentionally unused helper for mapping Y to staff index; keep for future use.
// eslint-disable-next-line no-unused-vars
function _yToStaffIndex(y, rect) {
  const lineGap = rect.h / 10;
  const rel = (y - rect.y) / lineGap;
  return Math.max(0, Math.min(10, Math.round(rel)));
}

// Simple note-head drawing for quarter notes
function drawQuarterNote(ctx, x, y, color) {
  const rx = 10;
  const ry = 9; // slightly taller than space between staff lines
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 8);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Draw all user-entered notes on top of grid
function drawNotes(ctx, layout, state) {
  if (!state || !state.notes || state.notes.length === 0) return;
  const { trebleRect, bassRect, beatsPerBar, barRects } = layout;
  const lineGapTop = trebleRect.h / 10;
  const lineGapBot = bassRect.h / 10;
  state.notes.forEach((note) => {
    const barRect = barRects[note.bar];
    if (!barRect) return;
    const bx = barRect.x;
    const bw = barRect.w;
    const beatCenter = bx + bw * ((note.beat + 0.5) / beatsPerBar);
    const isTop = note.staff === 'top';
    const bandRect = isTop ? trebleRect : bassRect;
    const lineGap = isTop ? lineGapTop : lineGapBot;
    const y = bandRect.y + note.position * lineGap;
    drawQuarterNote(ctx, beatCenter, y, PALETTE.accentGreen);
  });
}

function drawControlPanel(ctx, layout, state) {
  const { panelRect } = layout;
  const r = panelRect;

  ctx.fillStyle = PALETTE.panelBg;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = PALETTE.panelBorder;
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

  const pad = Math.round(r.w * 0.16);
  const playH = Math.round(r.h * 0.10);
  const playRect = {
    x: r.x + pad,
    y: r.y + pad,
    w: r.w - pad * 2,
    h: playH
  };

  // Play/pause button
  const playing = !!(state && state.playback && state.playback.isPlaying);
  ctx.save();
  ctx.globalAlpha = 0.88; // let tablet texture show through
  ctx.fillStyle = playing ? PALETTE.accentGreen : '#111722';
  const radius = Math.round(playRect.h * 0.35);
  roundRect(ctx, playRect.x, playRect.y, playRect.w, playRect.h, radius);
  ctx.fill();
  ctx.restore();

  // Icon
  ctx.fillStyle = PALETTE.text;
  ctx.strokeStyle = PALETTE.text;
  const cx = playRect.x + playRect.w * 0.5;
  const cy = playRect.y + playRect.h * 0.5;
  const iconW = playRect.w * 0.14;
  const iconH = playRect.h * 0.46;
  ctx.beginPath();
  if (!playing) {
    // Play triangle
    ctx.moveTo(cx - iconW * 0.4, cy - iconH * 0.5);
    ctx.lineTo(cx - iconW * 0.4, cy + iconH * 0.5);
    ctx.lineTo(cx + iconW * 0.6, cy);
    ctx.closePath();
    ctx.fill();
  } else {
    // Pause bars
    const barW = iconW * 0.32;
    ctx.fillRect(cx - barW - barW * 0.3, cy - iconH * 0.5, barW, iconH);
    ctx.fillRect(cx + barW * 0.3, cy - iconH * 0.5, barW, iconH);
  }

  // Note/rest selector slots
  const selectorTop = playRect.y + playRect.h + pad * 1.3;
  const slotH = Math.round(r.h * 0.09);
  const gapY = Math.round(r.h * 0.03);
  const labels = ['Quarter Note', 'Quarter Rest'];
  const selectedIndex = state && typeof state.selectedToolIndex === 'number'
    ? state.selectedToolIndex
    : 0;

  ctx.font = `${Math.round(slotH * 0.40)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  labels.forEach((label, i) => {
    const y = selectorTop + i * (slotH + gapY);
    const slotRect = { x: r.x + pad, y, w: r.w - pad * 2, h: slotH };
    const isSel = i === selectedIndex;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = isSel ? 'rgba(23,255,28,0.18)' : 'rgba(255,255,255,0.03)';
    roundRect(ctx, slotRect.x, slotRect.y, slotRect.w, slotRect.h, Math.round(slotH * 0.4));
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = isSel ? PALETTE.accentGreen : PALETTE.staffBars;
    ctx.lineWidth = 2;
    roundRect(ctx, slotRect.x, slotRect.y, slotRect.w, slotRect.h, Math.round(slotH * 0.4));
    ctx.stroke();

    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(label, slotRect.x + slotRect.w / 2, slotRect.y + slotRect.h / 2);
    ctx.textAlign = 'start';
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Utility to attach a canvas texture and initial sheet UI to the tablet screen.
// Call this from the piano scene once the GLB is loaded and added to the scene.

export function setupMusicTabletScreen(rootObject3D) {
  if (!rootObject3D || !rootObject3D.isObject3D) return null;

  let screenMesh = rootObject3D.getObjectByName("pe'rPad_screen");
  if (!screenMesh) {
    rootObject3D.traverse(obj => {
      if (!screenMesh && obj.isMesh && /pe'rpad_screen/i.test(obj.name || '')) {
        screenMesh = obj;
      }
    });
  }
  if (!screenMesh || !screenMesh.material) return null;

  const CW = 2048;
  const CH = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const margin = 30;
  const layout = computeLayout(CW, CH, margin, { bars: 4, beatsPerBar: 4 });

  drawTabletFrame(ctx, CW, CH, margin);
  drawStaffBand(ctx, layout.trebleRect);
  drawStaffBand(ctx, layout.bassRect);
  drawBarsAndBeats(ctx, layout);
  const initialState = {
    playback: { isPlaying: false },
    selectedToolIndex: 0,
    // Single test note: first beat of first bar, roughly middle of top staff
    notes: [
      { staff: 'top', bar: 0, beat: 0, position: 5, midi: 72 }
    ]
  };
  drawControlPanel(ctx, layout, initialState);
  drawNotes(ctx, layout, initialState);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.flipY = false;

  // If UVs only occupy a sub-rect, remap so our canvas fills it
  try {
    const geo = screenMesh.geometry;
    if (geo && geo.attributes && geo.attributes.uv) {
      const uv = geo.attributes.uv;
      let umin = 1, vmin = 1, umax = 0, vmax = 0;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        if (u < umin) umin = u;
        if (u > umax) umax = u;
        if (v < vmin) vmin = v;
        if (v > vmax) vmax = v;
      }
      const ur = Math.max(1e-4, umax - umin);
      const vr = Math.max(1e-4, vmax - vmin);
      const repU = 1 / ur;
      const repV = 1 / vr;
      const offU = -umin / ur;
      const offV = -vmin / vr;
      texture.repeat.set(repU, repV);
      texture.offset.set(offU, offV);
    }
  } catch {
    // Fallback: leave texture at default mapping
  }

  const mat = Array.isArray(screenMesh.material) ? screenMesh.material[0] : screenMesh.material;
  mat.map = texture;
  mat.emissive = new THREE.Color(0xffffff);
  mat.emissiveIntensity = 1.0;
  mat.emissiveMap = texture;
  mat.needsUpdate = true;

  return { canvas, ctx, texture, screenMesh, layout, state: initialState };
}
