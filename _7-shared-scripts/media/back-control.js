// Bright accents distinguish Return from transport icons on each page.
const ACCENTS = Object.freeze({
  start: '#73ead7', about: '#ff748e', videos: '#60cfff',
  graphics: '#ffbe57', games: '#b7ef65', music: '#e0a1ff', docs: '#ffe88a'
});

export function getBackControlColor(root = document) {
  const page = root.body?.dataset.page || root.defaultView?.location.pathname.match(/_\d+-([^/]+)/)?.[1] || 'start';
  const override = root.defaultView?.getComputedStyle(root.documentElement).getPropertyValue('--media-back-accent').trim();
  return override || ACCENTS[page] || ACCENTS.start;
}

/** Uses the existing hit area, with a solid badge and a full return arrow. */
export function drawBackControl(ctx, rect, { alpha, hovered = false, accent } = {}) {
  const side = Math.min(rect.w, rect.h) * .92;
  const x = rect.x + (rect.w - side) / 2;
  const y = rect.y + (rect.h - side) / 2;
  const radius = side * .22;
  ctx.save();
  if (Number.isFinite(alpha)) ctx.globalAlpha *= alpha;
  ctx.fillStyle = accent || getBackControlColor(ctx.canvas?.ownerDocument || document);
  ctx.strokeStyle = '#10131b';
  ctx.lineWidth = Math.max(1, side * .035);
  if (hovered) { ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = side * .25; }
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + side - radius, y);
  ctx.quadraticCurveTo(x + side, y, x + side, y + radius);
  ctx.lineTo(x + side, y + side - radius);
  ctx.quadraticCurveTo(x + side, y + side, x + side - radius, y + side);
  ctx.lineTo(x + radius, y + side);
  ctx.quadraticCurveTo(x, y + side, x, y + side - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = side * .1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + side * .5, y + side * .25);
  ctx.lineTo(x + side * .25, y + side * .5);
  ctx.lineTo(x + side * .5, y + side * .75);
  ctx.moveTo(x + side * .28, y + side * .5);
  ctx.lineTo(x + side * .77, y + side * .5);
  ctx.stroke();
  ctx.restore();
}
