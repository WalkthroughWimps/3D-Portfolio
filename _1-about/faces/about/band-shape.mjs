export const DEFAULT_GEOMETRY = Object.freeze({count: 24, outerDiameter: 1.1, innerDiameter: .34, gap: 0});
export const THICKNESS = .012;
export const CLEARANCE_MARGIN = .035;

/** Distances are cube units. Preserve a positive visible width at every extreme. */
export function normalizeGeometry(value = {}) {
  const number = (key, low, high) => {
    const candidate = Number(value[key]);
    return Number.isFinite(candidate) ? Math.min(high, Math.max(low, candidate)) : DEFAULT_GEOMETRY[key];
  };
  const count = Math.round(number('count', 1, 60));
  const outerDiameter = number('outerDiameter', .6, 1.7);
  const innerDiameter = Math.min(number('innerDiameter', .08, 1.3), outerDiameter - .08);
  const radialStep = (outerDiameter - innerDiameter) / (2 * count);
  const gap = Math.min(number('gap', 0, .03), radialStep * .75);
  return {count, outerDiameter, innerDiameter, gap,
    outerRadius: outerDiameter / 2, centerRadius: innerDiameter / 2,
    radialStep, visibleWidth: radialStep - gap};
}

export function ringBounds(shape, index) {
  const start = shape.centerRadius + index * shape.radialStep;
  return {inner: start + shape.gap / 2, outer: start + shape.radialStep - shape.gap / 2,
    midRadius: start + shape.radialStep / 2};
}
