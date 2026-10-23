import { SIZE, RADIUS } from './drawing-model.js';
import { orderedObjects, nodeVisible } from './drawing-document.js';

export function renderDrawingPng(document, artwork, contrast, brightness) {
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const context = canvas.getContext('2d');
  context.fillStyle = '#46657f';
  context.fillRect(0, 0, 1024, 1024);
  context.save();
  context.scale(1024 / SIZE, 1024 / SIZE);
  context.beginPath();
  context.arc(SIZE / 2, SIZE / 2, RADIUS, 0, Math.PI * 2);
  context.clip();
  artwork.compose(context, orderedObjects(document).filter(shape => nodeVisible(document, shape)), contrast, brightness);
  context.restore();
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG image.')), 'image/png'));
}
