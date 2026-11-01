const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

export function withMusicCanvasState(ctx, draw) {
  ctx.save();
  try { return draw(); } finally { ctx.restore(); }
}

export function drawMusicTrackIcon(ctx, circle, { image, hover, color, drawImage }) {
  const {x, y, r, alpha} = circle;
  if (![x, y, r, alpha].every(Number.isFinite) || r <= 0 || alpha <= 0) return;
  withMusicCanvasState(ctx, () => {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#123c29';
    ctx.fill();
    ctx.clip();
    if (image && image.complete && image.naturalWidth) drawImage(ctx, image, x-r, y-r, r*2, r*2);
  });
  const lineWidth = Math.max(2, r * (hover ? .07 : .04));
  const ringRadius = r - lineWidth / 2;
  if (!Number.isFinite(ringRadius) || ringRadius <= 0) return;
  withMusicCanvasState(ctx, () => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
  });
}

// Keep source indices stable so the selected Woods/Forests hit never becomes Baby.
export function layoutSelectedMusicTrackIcons(circles, { selectedIndex, progress, leftW, height }) {
  const p = clamp(progress, 0, 1);
  return circles.map((circle, index) => {
    const selected = index === selectedIndex;
    const radius = Math.min(leftW * .25, height * .22);
    return {
      x: selected ? circle.x + (leftW / 2 - circle.x) * p : circle.x,
      y: selected ? circle.y + (height * .43 - circle.y) * p : circle.y,
      r: selected ? circle.r + (radius - circle.r) * p : circle.r * (1 - p),
      alpha: selected ? 1 : 1 - p,
      interactive: p < .01 || selected
    };
  });
}

// Fractions refer to the fixed space between the Play Tracks heading and song box.
export function layoutMusicTrackIcons({ leftW, cellW, cellH, titleY, nameY, iconSize = .27, horizontalSpacing = .26, verticalOffset = .22, trackCount = 3 }) {
  const titleFontH = Math.max(16, Math.round(cellH * .88));
  const areaTop = titleY + titleFontH / 2 + cellH * .16;
  const areaBottom = nameY - cellH * .65;
  const areaHeight = Math.max(1, areaBottom - areaTop);
  const midY = (areaTop + areaBottom) / 2;
  const offset = clamp(verticalOffset, 0, .34) * areaHeight;
  const centerY = midY - offset;
  const outerY = midY + offset;
  const requestedRadius = clamp(iconSize, .16, .32) * areaHeight;
  let radius = Math.max(1, Math.min(requestedRadius, centerY - areaTop, areaBottom - outerY));
  const sideMargin = Math.max(8, cellW * .12);
  const requestedDistance = clamp(horizontalSpacing, .12, .36) * leftW;
  const initialDistance = Math.min(requestedDistance, Math.max(0, leftW / 2 - radius - sideMargin));
  const gap = Math.max(2, cellH * .06);
  if (trackCount > 3) {
    const rows = trackCount > 4 ? 3 : 2;
    const labelRoom = cellH * .7;
    const rowHeight = areaHeight / rows;
    const halfColumns = clamp(horizontalSpacing, .21, .29) * leftW;
    const sizeFactor = clamp(iconSize / .27, .65, 1.15);
    const radiusLimit = Math.min(leftW * .22, halfColumns - gap, rowHeight / 2 - labelRoom / 2 - gap);
    const r = Math.max(1, radiusLimit * Math.min(1, sizeFactor));
    const spare = rowHeight - (r * 2 + labelRoom);
    const shift = clamp(verticalOffset, 0, .34) * Math.max(0, spare) * .4;
    const slots = [[0,0],[0,1],[1,0],[1,1],[0,2],[1,2]];
    return { area: { top: areaTop, bottom: areaBottom, midY }, circles: slots.slice(0, Math.min(6, trackCount)).map(([col,row]) => ({
      x: leftW / 2 + (col ? halfColumns : -halfColumns),
      y: areaTop + rowHeight * (row + .5) - labelRoom / 2 - shift,
      r
    })) };
  }
  // The outer pair is 2*distance apart; only center-to-outer uses the diagonal.
  radius = Math.max(1, Math.min(radius, initialDistance - gap / 2, (Math.hypot(initialDistance, 2 * offset) - gap) / 2));
  const distance = Math.min(requestedDistance, Math.max(0, leftW / 2 - radius - sideMargin));
  return {
    area: { top: areaTop, bottom: areaBottom, midY },
    circles: [
      { x: leftW / 2, y: centerY, r: radius },
      { x: leftW / 2 - distance, y: outerY, r: radius },
      { x: leftW / 2 + distance, y: outerY, r: radius }
    ]
  };
}
