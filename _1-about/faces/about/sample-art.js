import {layoutCaption} from './caption-layout.mjs';

function cover(ctx, image, size, x = 0, y = 0) {
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  const edge = Math.min(width, height), sx = (width - edge) / 2, sy = (height - edge) / 2;
  ctx.drawImage(image, sx, sy, edge, edge, x, y, size, size);
}

/** Direct Cartesian artwork: every front-facing annulus samples this same sharp canvas. */
export function paintSample(canvas, sample, photo) {
  const ctx = canvas.getContext('2d'), size = canvas.width, center = size / 2;
  const lines = Array.isArray(sample?.lines) ? sample.lines : [];
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, size, size);
  if (photo) cover(ctx, photo, size);
  else { ctx.fillStyle = '#172332'; ctx.fillRect(0, 0, size, size); }

  if (!lines.some(line => line.trim())) return;
  // Quiet the lower third while keeping the user's artwork visible around the caption.
  const shade = ctx.createLinearGradient(0, size * .62, 0, size * .96);
  shade.addColorStop(0, '#122b4400'); shade.addColorStop(.35, '#152d5799'); shade.addColorStop(1, '#122440bb');
  ctx.fillStyle = shade; ctx.fillRect(0, size * .62, size, size * .38);

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
  const scale = size / 2048;
  const layout = layoutCaption(lines, (text, fontSize) => {
    ctx.font = `900 ${fontSize * scale}px Arial, sans-serif`;
    return ctx.measureText(text).width / scale;
  });
  for (const line of layout.lines) {
    const fontSize = layout.fontSize * scale;
    ctx.font = `900 ${fontSize}px Arial, sans-serif`;
    const y = line.baseline * scale, textWidth = line.textWidth * scale, pad = 34 * scale;
    ctx.fillStyle = '#142b46b8'; ctx.beginPath();
    ctx.roundRect(center - textWidth / 2 - pad, y - fontSize - 13 * scale,
      textWidth + pad * 2, fontSize + 38 * scale, 30 * scale); ctx.fill();
    ctx.strokeStyle = '#142840'; ctx.lineWidth = 12 * scale; ctx.strokeText(line.text, center, y);
    ctx.fillStyle = '#fff9e9'; ctx.fillText(line.text, center, y);
  }
}

/** The reverse is deliberately stable abstract color, with no readable front content. */
export function paintRear(canvas) {
  const ctx = canvas.getContext('2d'), size = canvas.width;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#121c28'; ctx.fillRect(0, 0, size, size);
}
