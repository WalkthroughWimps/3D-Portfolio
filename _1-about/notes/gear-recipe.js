import { HOLES, gearGeometry, gearOutlines, gearSizing, independentGearSetup, validateGearRecipe } from './gear-model.js';

const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const point = (x, y, contour = 0) => ({ x, y, contour });
export { validateGearRecipe } from './gear-model.js';

export function makeGearRecipe(setup, kind, progress, shape) {
  const sized = independentGearSetup(setup);
  return validateGearRecipe({ version: 1, kind, guide: sized.guide, roller: sized.roller,
    largeTeeth: sized.largeTeeth, smallTeeth: sized.smallTeeth, hole: HOLES.indexOf(sized.hole) + 1,
    inside: Boolean(sized.inside), phase: finite(sized.phase, 0, 1) ? sized.phase : 0,
    progress: kind === 'trace' ? progress : Math.max(0, Math.min(1, progress)),
    baseWidth: shape.width, baseHeight: shape.height }, shape);
}

export function gearRecipeBounds(recipe) {
  const sizing = gearSizing(recipe);
  return { largeTeeth: [sizing.minLarge, sizing.maxLarge], smallTeeth: [sizing.minSmall, sizing.maxSmall], hole: [1, 10] };
}

function sourceGeometry(recipe) {
  const setup = { guide: recipe.guide, roller: recipe.roller, largeTeeth: recipe.largeTeeth,
    smallTeeth: recipe.smallTeeth, hole: HOLES[recipe.hole - 1], inside: recipe.inside,
    phase: recipe.phase, x: 500, y: 500, layout: 'pane' };
  const geometry = gearGeometry(setup, recipe.kind === 'trace');
  if (recipe.kind === 'trace') {
    const points = recipe.progress === 1 ? geometry.points : geometry.points.slice(0, Math.max(2, Math.floor(recipe.progress * (geometry.points.length - 1)) + 1));
    return { points };
  }
  const { guide, roller, pose } = gearOutlines(setup, recipe.progress, geometry);
  const circle = (pins, radius, firstContour) => pins.flatMap((pin, index) => Array.from({ length: 12 }, (_, i) => {
    const angle = -i * Math.PI / 6, reach = typeof radius === 'function' ? radius(pin) : radius;
    return point(pin.x + reach * Math.cos(angle), pin.y + reach * Math.sin(angle), firstContour + index);
  }));
  const vertices = recipe.kind === 'large'
    ? [...guide, ...circle([{ x: 500, y: 500 }], Math.max(4, geometry.track.radius * .12), 1)]
    : [...roller, ...circle(pose.pins, pin => Math.max(1.5, Math.min(4, geometry.radius * .055)) * (pin.hole === setup.hole ? 1.4 : 1), 1)];
  return { anchors: vertices };
}

export function regenerateGearShape(shape, field, value) {
  const old = validateGearRecipe(shape.gearRecipe, shape);
  if (!old || !['largeTeeth', 'smallTeeth', 'hole'].includes(field) || !Number.isInteger(value)) return null;
  const [min, max] = gearRecipeBounds(old)[field];
  if (value < min || value > max || value === old[field]) return null;
  const requested = { ...old, [field]: value };
  const sized = gearSizing(requested);
  requested.largeTeeth = sized.largeTeeth; requested.smallTeeth = sized.smallTeeth;
  const geometry = sourceGeometry(requested);
  const vertices = geometry.points || geometry.anchors;
  if (geometry.anchors?.length > 2200 || geometry.points?.length > 4000 || !vertices?.length) return null;
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const vertex of vertices) { left = Math.min(left, vertex.x); right = Math.max(right, vertex.x); top = Math.min(top, vertex.y); bottom = Math.max(bottom, vertex.y); }
  const baseWidth = Math.max(4, right - left), baseHeight = Math.max(4, bottom - top);
  const sx = shape.width / old.baseWidth, sy = shape.height / old.baseHeight;
  const width = baseWidth * sx, height = baseHeight * sy;
  if (!finite(width, 4, 6000) || !finite(height, 4, 6000)) return null;
  const cx = (left + right) / 2, cy = (top + bottom) / 2;
  const next = { width, height, gearRecipe: { ...requested, baseWidth, baseHeight } };
  if (geometry.points) next.points = geometry.points.map(vertex => ({ x: (vertex.x - cx) * sx, y: (vertex.y - cy) * sy }));
  else next.anchors = geometry.anchors.map(vertex => ({ x: (vertex.x - cx) * sx, y: (vertex.y - cy) * sy,
    in: { x: 0, y: 0 }, out: { x: 0, y: 0 }, contour: vertex.contour || 0 }));
  return next;
}
