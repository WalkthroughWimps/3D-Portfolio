const power = n => ({
  in: t => t ** n,
  out: t => 1 - (1 - t) ** n,
  inOut: t => t < .5 ? (2 * t) ** n / 2 : 1 - (2 - 2 * t) ** n / 2
});
const sine = {
  in: t => 1 - Math.cos(t * Math.PI / 2),
  out: t => Math.sin(t * Math.PI / 2),
  inOut: t => (1 - Math.cos(t * Math.PI)) / 2
};
const expo = {
  in: t => (2 ** (10 * t) - 1) / 1023,
  out: t => 1 - (2 ** (10 * (1 - t)) - 1) / 1023,
  inOut: t => t < .5 ? (2 ** (20 * t) - 1) / 2046 : 1 - (2 ** (20 * (1 - t)) - 1) / 2046
};
const circ = {
  in: t => 1 - Math.sqrt(1 - t * t),
  out: t => Math.sqrt(1 - (t - 1) ** 2),
  inOut: t => t < .5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2
    : (1 + Math.sqrt(1 - (2 * t - 2) ** 2)) / 2
};
export const EASING_GROUPS = Object.freeze([
  {name: 'Basic', curves: [['linear', 'Linear'], ['smoothstep', 'Smoothstep'], ['smootherstep', 'Smootherstep']]},
  ...[['Sine', sine], ['Quad', power(2)], ['Cubic', power(3)], ['Quart', power(4)],
    ['Quint', power(5)], ['Expo', expo], ['Circ', circ]].map(([name]) => ({
    name, curves: [['in', `Ease in ${name}`], ['out', `Ease out ${name}`],
      ['inOut', `Ease in/out ${name}`]].map(([direction, label]) => [`${direction}${name}`, label])
  }))
]);
const curves = {linear: t => t, smoothstep: t => t * t * (3 - 2 * t),
  smootherstep: t => t * t * t * (t * (t * 6 - 15) + 10)};
for (const [name, group] of [['Sine', sine], ['Quad', power(2)], ['Cubic', power(3)],
  ['Quart', power(4)], ['Quint', power(5)], ['Expo', expo], ['Circ', circ]]) {
  for (const [direction, fn] of Object.entries(group)) curves[`${direction}${name}`] = fn;
}
export const EASING_IDS = Object.freeze(Object.keys(curves));
export const EASING_LABELS = Object.freeze(Object.fromEntries(EASING_GROUPS.flatMap(group => group.curves)));
export const DEFAULT_EASING_POOL = Object.freeze(['linear', 'smoothstep', 'inOutSine', 'inOutCubic']);
export function easeAt(t, id) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.min(1, Math.max(0, (curves[id] || curves.linear)(t)));
}
