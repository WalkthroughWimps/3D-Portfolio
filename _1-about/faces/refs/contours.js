// Diagram-space boundaries shared by the ink drawing and the cabinet tooling.
const STEPS = 192;
const polygon = points => points.map(([x, y]) => ({x, y}));
const ellipse = frame => Array.from({length: STEPS}, (_, i) => {
  const a = i * 2 * Math.PI / STEPS;
  return {x: frame.x + frame.width * Math.cos(a) / 2,
    y: frame.y + frame.height * Math.sin(a) / 2};
});
const cubic = (from, a, b, to, steps = 64) => Array.from({length: steps}, (_, i) => {
  const t = (i + 1) / steps, u = 1 - t;
  return {x: u ** 3 * from.x + 3 * u ** 2 * t * a.x + 3 * u * t ** 2 * b.x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u ** 2 * t * a.y + 3 * u * t ** 2 * b.y + t ** 3 * to.y};
});
const arc = (cx, cy, radius, start, end, steps = 96) =>
  Array.from({length: steps + 1}, (_, i) => ({x: cx + radius * Math.cos(start + (end - start) * i / steps),
    y: cy + radius * Math.sin(start + (end - start) * i / steps)}));

function baseContour(id, frame) {
  const x0 = frame.x - frame.width / 2, x1 = frame.x + frame.width / 2;
  const y0 = frame.y - frame.height / 2, y1 = frame.y + frame.height / 2;
  if (id === 'portrait' || id === 'aperture') return ellipse(frame);
  if (id === 'leftBay' || id === 'rightBay') return polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  if (id === 'leftCrescent' || id === 'rightCrescent') {
    const sign = id === 'leftCrescent' ? -1 : 1;
    const p = (x, y) => ({x: 365 + sign * x, y});
    const a = p(257, 318), b = p(295, 337), c = p(295, 473), d = p(257, 493);
    return [a, ...cubic(a, p(278, 319), p(294, 325), b),
      ...cubic(b, p(295, 354), p(295, 456), c),
      ...cubic(c, p(294, 491), p(278, 489), d)];
  }
  if (id === 'leftArch' || id === 'rightArch') return [
    {x: x0, y: y1}, {x: x0, y: y0 + 30},
    ...arc(frame.x, y0 + 30, frame.width / 2, Math.PI, 2 * Math.PI).slice(1),
    {x: x1, y: y1}];
  if (id === 'plaque') {
    const r = 6;
    return [{x: x0 + r, y: y0}, {x: x1 - r, y: y0},
      ...arc(x1 - r, y0 + r, r, -Math.PI / 2, 0, 8).slice(1),
      {x: x1, y: y1 - r}, ...arc(x1 - r, y1 - r, r, 0, Math.PI / 2, 8).slice(1),
      {x: x0 + r, y: y1}, ...arc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, 8).slice(1),
      {x: x0, y: y0 + r}, ...arc(x0 + r, y0 + r, r, Math.PI, 3 * Math.PI / 2, 8).slice(1)];
  }
  return [];
}

export const REFS_POCKET_IDS = Object.freeze(['portrait', 'aperture', 'leftBay', 'rightBay',
  'leftCrescent', 'rightCrescent', 'leftArch', 'rightArch', 'plaque']);

/** The same resolved frames drive the 2D strokes and 3D cutouts. */
export function getRefsCompartmentContours(baseFrames, frames) {
  return Object.fromEntries(REFS_POCKET_IDS.map(id => {
    const base = baseFrames[id], target = frames[id];
    return [id, baseContour(id, base).map(p => ({
      x: target.x + (p.x - base.x) * target.width / base.width,
      y: target.y + (p.y - base.y) * target.height / base.height
    }))];
  }));
}
