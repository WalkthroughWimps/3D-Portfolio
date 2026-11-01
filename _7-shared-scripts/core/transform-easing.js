export const TRANSFORM_RESET_EASINGS = Object.freeze([
  ['linear', 'Linear'],
  ['smoothstep', 'Smoothstep'],
  ['smootherstep', 'Smootherstep'],
  ['inQuad', 'Ease in quad'],
  ['outQuad', 'Ease out quad'],
  ['inOutQuad', 'Ease in/out quad'],
  ['inOutCubic', 'Ease in/out cubic'],
  ['inOutSine', 'Ease in/out sine']
]);

const curves = Object.freeze({
  linear: t => t,
  smoothstep: t => t * t * (3 - 2 * t),
  smootherstep: t => t * t * t * (10 + t * (-15 + 6 * t)),
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2
});

export function resolveTransformResetEasing(id, progress, fallback = 'smoothstep') {
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  return (curves[id] || curves[fallback] || curves.smoothstep)(t);
}
