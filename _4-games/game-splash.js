// Both the cabinet and selected-work preview render this same splash content.
// Future animated media belongs here, so the two entry points stay in sync.
export const GAME_SPLASH_IMAGES = Object.freeze(Object.fromEntries(
  ['battleship', 'train-mania', 'plinko', 'pick-a-square', 'you-be-the-server']
    .map(id => [id, new URL(`../games/${id}.png`, import.meta.url).href])
));
const backgroundColors = new WeakMap();
export function paintGameSplash(ctx, rect, { image, title, progress = 0, accent = '#d6a7ff' }) {
  const ready = progress >= .999;
  const pad = Math.min(rect.w, rect.h) * .04;
  const box = { x: rect.x + pad, y: rect.y + pad, w: rect.w - pad * 2, h: rect.h - pad * 2 };
  ctx.save();
  ctx.fillStyle = '#090b12';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  if (image?.complete && image.naturalWidth) {
    const scale = Math.min(box.w / image.naturalWidth, box.h / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    const x = box.x + (box.w - w) / 2, y = box.y + (box.h - h) / 2;
    ctx.drawImage(image, x, y, w, h);
    if (!backgroundColors.has(image)) {
      let color = '#090b12';
      try {
        const sample = document.createElement('canvas'); sample.width = sample.height = 1;
        const context = sample.getContext('2d'); context.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
        const pixel = context.getImageData(0, 0, 1, 1).data;
        color = `rgb(${pixel[0]},${pixel[1]},${pixel[2]})`;
      } catch { /* retain a readable fallback if cross-origin sampling is unavailable */ }
      backgroundColors.set(image, color);
    }
    ctx.fillStyle = backgroundColors.get(image);
    ctx.fillRect(x, y, w, h * .29);
    ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.round(h * .12)}px "Source Sans 3","Segoe UI",sans-serif`;
    ctx.fillText(title, x + w / 2, y + h * .13, w * .9);
  } else {
    ctx.fillStyle = accent; ctx.textAlign = 'center'; ctx.font = `700 ${rect.h * .08}px sans-serif`;
    ctx.fillText(title, rect.x + rect.w / 2, rect.y + rect.h * .25);
  }
  const bar = { x: rect.x + rect.w * .14, y: rect.y + rect.h * .78, w: rect.w * .72, h: Math.max(12, rect.h * .04) };
  ctx.fillStyle = '#ffffff24'; ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  ctx.fillStyle = accent; ctx.fillRect(bar.x, bar.y, bar.w * progress, bar.h);
  const play = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, r: Math.min(rect.w, rect.h) * .07 };
  ctx.globalAlpha = ready ? 1 : .3;
  ctx.beginPath(); ctx.arc(play.x, play.y, play.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2e6ff'; ctx.beginPath();
  ctx.moveTo(play.x + play.r * .25, play.y);
  ctx.lineTo(play.x - play.r * .2, play.y - play.r * .35);
  ctx.lineTo(play.x - play.r * .2, play.y + play.r * .35);
  ctx.closePath(); ctx.fill(); ctx.restore();
  return play;
}
