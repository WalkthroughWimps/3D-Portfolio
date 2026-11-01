const clamp01 = value => Math.max(0, Math.min(1, value));

export function sampleInstrumentSlide(transition, now) {
  if (!transition.duration) return transition.to;
  const t = clamp01((now - transition.start) / transition.duration);
  const eased = t * t * (3 - 2 * t);
  return transition.from + (transition.to - transition.from) * eased;
}

// Stay dirty until the target has actually been painted. A time-only redraw
// gate can skip the final frame and leave the chooser's hit areas disabled.
export function sampleScreenTransition(transition, now) {
  const progress = sampleInstrumentSlide(transition, now);
  if(transition.duration && now >= transition.start + transition.duration){
    transition.from = transition.to;
    transition.duration = 0;
  }
  return progress;
}

// All positions share one animated coordinate system. The moving button's
// left edge clips the second panel, including its pointer hit rectangles.
export function layoutInstrumentPanels({ width, panelWidth, rowTop, rowHeight, gap, divider, progress }) {
  const p = clamp01(progress);
  const buttonSize = rowHeight * .58;
  const fullWidth = panelWidth * 2 + gap * 2 + buttonSize;
  const singleX = (width - panelWidth) / 2;
  const dualX = Math.max(gap, Math.min(width - fullWidth - gap, divider - panelWidth - gap));
  const leftX = singleX + (dualX - singleX) * p;
  const rightX = leftX + panelWidth + gap;
  const buttonX = rightX + (panelWidth + gap) * p;
  return {
    leftX, rightX,
    button: { x: buttonX, y: rowTop + (rowHeight - buttonSize) / 2, w: buttonSize, h: buttonSize },
    clipRight: buttonX,
    rightVisible: p > 0
  };
}

export function clipInstrumentHit(rect, leftEdge) {
  const right = Math.min(rect.x + rect.w, leftEdge);
  return right > rect.x ? { ...rect, w: right - rect.x } : null;
}

export function musicPlayerRect(width, height) {
  const x = width * 3.5 / 12;
  const w = width * 5 / 12;
  const h = Math.min(height, w * 9 / 16);
  return { x, y: (height - h) / 2, w, h };
}

// Expand around the screen center so both side panels give the video room.
export function layoutMusicVideoZones(width, height, progress = 0) {
  const p = clamp01(progress);
  const base = musicPlayerRect(width, height);
  const baseRightW = width - base.x - base.w;
  const expandedW = Math.max(base.w, Math.min(height * 16 / 9, width * .8));
  const midW = base.w + (expandedW - base.w) * p;
  const videoH = base.h + (expandedW * 9 / 16 - base.h) * p;
  const leftW = (width - midW) / 2;
  const rightX = leftW + midW;
  return {
    leftW, midW, rightX, rightW: width - rightX,
    leftScale: Math.min(1, leftW / base.x),
    rightScale: Math.min(1, (width - rightX) / baseRightW),
    video: {x:leftW,y:(height-videoH)/2,w:midW,h:videoH},
    recorder: {x:rightX+baseRightW*.08*p,y:height*2/3,w:baseRightW,h:height/3}
  };
}

export function fitRecorderPreview(bounds) {
  return { ...bounds };
}

export function recorderPreviewSource(width, height, bounds) {
  const scale = Math.max(bounds.w / width, bounds.h / height);
  return { x: 0, y: 0, w: bounds.w / scale, h: bounds.h / scale };
}
