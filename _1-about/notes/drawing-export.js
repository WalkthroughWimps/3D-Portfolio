import { SIZE, RADIUS, boundsOf } from './drawing-model.js';
import { orderedObjects, nodeVisible } from './drawing-document.js';

export function renderDrawingPng(document, artwork, contrast, brightness, { backgroundColor = '#46657f', includeClippedArt = false } = {}) {
  const shapes = orderedObjects(document).filter(shape => nodeVisible(document, shape));
  const frame = { left:0, top:0, right:SIZE, bottom:SIZE };
  if (includeClippedArt) {
    for (const shape of shapes) {
      const bounds = boundsOf([shape]);
      const pad = Math.max(4, (shape.stroke ? Number(shape.strokeWidth) || 0 : 0) / 2 + 3);
      frame.left = Math.min(frame.left, bounds.left - pad);
      frame.top = Math.min(frame.top, bounds.top - pad);
      frame.right = Math.max(frame.right, bounds.right + pad);
      frame.bottom = Math.max(frame.bottom, bounds.bottom + pad);
    }
  }
  const padding = includeClippedArt ? 24 : 0;
  frame.left -= padding; frame.top -= padding; frame.right += padding; frame.bottom += padding;
  const spanX = frame.right - frame.left, spanY = frame.bottom - frame.top;
  const scale = Math.min(1024 / SIZE, 2048 / spanX, 2048 / spanY);
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = Math.max(1, Math.min(2048, Math.ceil(spanX * scale)));
  canvas.height = Math.max(1, Math.min(2048, Math.ceil(spanY * scale)));
  const context = canvas.getContext('2d');
  context.save();
  context.scale(scale, scale);
  context.translate(-frame.left, -frame.top);
  if (backgroundColor !== null) {
    context.fillStyle = /^#[0-9a-f]{6}$/i.test(backgroundColor) ? backgroundColor : '#46657f';
    context.beginPath();
    context.arc(SIZE / 2, SIZE / 2, RADIUS, 0, Math.PI * 2);
    context.fill();
  }
  if (!includeClippedArt) {
    context.beginPath();
    context.arc(SIZE / 2, SIZE / 2, RADIUS, 0, Math.PI * 2);
    context.clip();
  }
  for (const shape of shapes) {
    context.save();
    context.translate(shape.x, shape.y);
    context.rotate(shape.rotation);
    artwork.paint(context, shape, contrast, brightness);
    context.restore();
  }
  context.restore();
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG image.')), 'image/png'));
}
