import { SIZE, boundsOf, isClosed, makePath, outsideSegments } from './drawing-model.js';

// Cache flat, bright artwork with a narrow contrast keyline. No blur or light
// simulation is needed for the highlight look. Translation/rotation only composite
// an image; geometry and style edits invalidate the affected shape explicitly.
export function createArtworkCache() {
  const entries = new Map(), budget = SIZE * SIZE * 8;
  let pixels = 0, generation = 0, pixelLimit = budget, hits = 0, builds = 0;
  const versions = new WeakMap(), outlines = new WeakMap();
  const composite = document.createElement('canvas'); composite.width = composite.height = SIZE;
  const compositeContext = composite.getContext('2d'); let previous = [], previousGeneration = -1;
  function evict(shape) {
    const entry = entries.get(shape); if (!entry) return;
    pixels -= entry.pixels; entries.delete(shape); entry.canvas.width = entry.canvas.height = 0;
  }
  function invalidate(shape) { evict(shape); versions.set(shape, (versions.get(shape) || 0) + 1); }
  function clear() { generation++; for (const shape of entries.keys()) evict(shape); }
  function paint(context, shape, contrast, brightness) {
    let entry = entries.get(shape);
    if (entry && entry.pixels > pixelLimit * 1.1) { evict(shape); entry = null; }
    if (!entry) {
      builds++;
      const bounds = boundsOf([{ ...shape, x: 0, y: 0, rotation: 0 }]);
      const ease = contrast * contrast * (3 - 2 * contrast), edge = 1 + ease * 1.5;
      const pad = shape.stroke ? Math.ceil((shape.strokeWidth + edge) / 2) + 2 : 2;
      const x = Math.floor(bounds.left - pad), y = Math.floor(bounds.top - pad);
      const width = Math.ceil(bounds.right + pad - x), height = Math.ceil(bounds.bottom + pad - y);
      const scale = Math.min(1, 1536 / Math.max(width, height), Math.sqrt(pixelLimit / (width * height)));
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
      const image = canvas.getContext('2d'); image.scale(scale, scale); image.translate(-x, -y);
      image.lineCap = image.lineJoin = 'round'; const path = makePath(shape);
      if (shape.fill && isClosed(shape)) { image.globalAlpha = .45 + .2 * brightness; image.fillStyle = shape.fill; image.fill(path); image.globalAlpha = 1; }
      if (shape.stroke) {
        const hex = shape.stroke.slice(1), channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
        const light = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        image.strokeStyle = light > .55 ? `rgba(7,17,27,${.45 + ease * .35})` : `rgba(240,250,255,${.45 + ease * .35})`; image.lineWidth = shape.strokeWidth + edge; image.stroke(path);
        image.strokeStyle = shape.stroke; image.lineWidth = shape.strokeWidth; image.stroke(path);
      }
      entry = { canvas, x, y, width: canvas.width / scale, height: canvas.height / scale, pixels: canvas.width * canvas.height };
      while (pixels + entry.pixels > budget && entries.size) evict(entries.keys().next().value);
      entries.set(shape, entry); pixels += entry.pixels;
    } else { hits++; entries.delete(shape); entries.set(shape, entry); }
    context.drawImage(entry.canvas, entry.x, entry.y, entry.width, entry.height);
  }
  function compose(context, shapes, contrast, brightness, emphasis = null) {
    const changed = generation !== previousGeneration || previous.length !== shapes.length || shapes.some((shape, i) => {
      const old = previous[i]; return old.shape !== shape || old.version !== (versions.get(shape) || 0) || old.x !== shape.x || old.y !== shape.y || old.rotation !== shape.rotation || old.dimmed !== Boolean(emphasis && !emphasis(shape));
    });
    if (changed) {
      pixelLimit = Math.max(128 * 128, Math.floor(budget * .96 / Math.max(1, shapes.length)));
      compositeContext.clearRect(0, 0, SIZE, SIZE);
      for (const shape of shapes) { compositeContext.save(); compositeContext.globalAlpha=emphasis && !emphasis(shape) ? .18 : 1; compositeContext.translate(shape.x, shape.y); compositeContext.rotate(shape.rotation); paint(compositeContext, shape, contrast, brightness); compositeContext.restore(); }
      previous = shapes.map(shape => ({ shape, dimmed:Boolean(emphasis && !emphasis(shape)), version: versions.get(shape) || 0, x: shape.x, y: shape.y, rotation: shape.rotation })); previousGeneration = generation;
    }
    context.drawImage(composite, 0, 0);
  }
  function outline(shape, tolerance = 1.5) {
    let record = outlines.get(shape); const version = versions.get(shape) || 0;
    if (!record || record.version !== version || record.x !== shape.x || record.y !== shape.y || record.rotation !== shape.rotation) {
      record = { version, x: shape.x, y: shape.y, rotation: shape.rotation, levels: new Map() }; outlines.set(shape, record);
    }
    if (!record.levels.has(tolerance)) record.levels.set(tolerance, outsideSegments(shape, tolerance));
    return record.levels.get(tolerance);
  }
  return { paint, compose, outline, invalidate, clear,
    get stats() { return {pixels, pixelBudget: budget, entries: entries.size, hits, builds, compositePixels: composite.width * composite.height}; },
    prune(shapes) { const alive = new Set(shapes); for (const shape of entries.keys()) if (!alive.has(shape)) evict(shape); },
    dispose() { clear(); previous = []; composite.width = composite.height = 0; } };
}
