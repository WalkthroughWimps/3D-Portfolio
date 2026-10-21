// All guides share a 96-tooth pitch perimeter. Every roller is smooth and
// strictly convex; arc-length contact makes the unusual profiles roll, not slide.
export const GUIDES = [{ id: 'circle', label: 'Circle', sides: 0 }, { id: 'triangle', label: 'Rounded triangle', sides: 3 }, { id: 'square', label: 'Rounded square', sides: 4 }, { id: 'plus', label: 'Rounded plus', sides: 0, teeth: 288 }, { id: 'hexagon', label: 'Hexagon', sides: 6 }, { id: 'pentagon', label: 'Pentagon', sides: 5 }];
export const ROLLERS = [
  { id: 'circle-24', teeth: 24, label: 'Circle 24', harmonics: [] },
  { id: 'circle-32', teeth: 32, label: 'Circle 32', harmonics: [] },
  { id: 'circle-36', teeth: 36, label: 'Circle 36', harmonics: [] },
  { id: 'oval', teeth: 28, label: 'Oval 28', harmonics: [[2, .2, 0]] },
  { id: 'egg', teeth: 30, label: 'Egg 30', harmonics: [[2, .1, 0], [3, .045, 0]] },
  { id: 'triangle', teeth: 24, label: 'Trio 24', harmonics: [[3, .11, -Math.PI / 2]] },
  { id: 'square', teeth: 32, label: 'Squircle 32', harmonics: [[4, -.06, 0]] },
  { id: 'diamond', teeth: 36, label: 'Diamond 36', harmonics: [[4, .06, 0]] },
  { id: 'pebble', teeth: 40, label: 'Pebble 40', harmonics: [[2, .08, .4], [3, .06, 1.1]] }
];
export const HOLES = [.18, .26, .34, .42, .5, .59, .68, .76, .83, .9];
const TAU = Math.PI * 2, PANE_RADIUS = 496;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
export const closureLaps = (teeth, guideTeeth = 96) => teeth / gcd(guideTeeth, teeth);
export const rollerFor = setup => ROLLERS.find(r => r.id === setup.roller) || ROLLERS.find(r => r.teeth === setup.teeth) || ROLLERS[1];
// h is a support function; h+h'' is the positive radius of curvature.
// Its mean is one, so every profile has perimeter 2πr at the common pitch.
export function rollerProfile(roller, radius = 1) {
  const harmonics = roller.harmonics;
  function atNormal(angle) {
    let h = 1, derivative = 0, curvature = 1, arc = angle;
    for (const [n, amplitude, phase] of harmonics) {
      const t = n * angle + phase;
      h += amplitude * Math.cos(t); derivative -= n * amplitude * Math.sin(t);
      curvature += (1 - n * n) * amplitude * Math.cos(t);
      arc += (1 - n * n) * amplitude / n * (Math.sin(t) - Math.sin(phase));
    }
    return { x: radius * (h * Math.cos(angle) - derivative * Math.sin(angle)), y: radius * (h * Math.sin(angle) + derivative * Math.cos(angle)), normal: angle, arc: radius * arc, curvature: radius * curvature };
  }
  function atArc(s) {
    const laps = Math.floor(s / (TAU * radius)), local = s / radius - laps * TAU;
    let low = 0, high = TAU, angle = local;
    for (let i = 0; i < 18; i++) {
      const p = atNormal(angle), error = p.arc / radius - local;
      if (Math.abs(error) < 1e-12) break;
      if (error > 0) high = angle; else low = angle;
      const next = angle - error / (p.curvature / radius);
      angle = next > low && next < high ? next : (low + high) / 2;
    }
    return atNormal(angle + laps * TAU);
  }
  const outline = Array.from({ length: 193 }, (_, i) => atNormal(i / 192 * TAU));
  const bound = Math.max(...outline.map(p => Math.hypot(p.x, p.y))) * 1.001;
  return { atNormal, atArc, outline, bound, length: TAU * radius };
}
export function pinPositions(radius) {
  // A spiral, safely inside even the narrowest curated support function.
  return HOLES.map((hole, i) => { const angle = i * .72, reach = radius * hole * .77; return { hole, x: reach * Math.cos(angle), y: reach * Math.sin(angle) }; });
}
export function guideTrack(id, scale = 1) {
  const radius = 220 * scale, length = TAU * radius, sides = GUIDES.find(g => g.id === id)?.sides || 0;
  if (id === 'plus') return plusTrack(radius);
  if (!sides) return { length, radius, innerCurve:radius, teeth: 96, at(s) { const angle = s / radius; return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), normal: angle }; } };
  const a = 140, b = 50, factor = length / (2 * sides * a * Math.sin(Math.PI / sides) + TAU * b), core = a * factor, corner = b * factor;
  const vertices = Array.from({ length: sides }, (_, i) => ({ x: core * Math.cos(i * TAU / sides - Math.PI / 2), y: core * Math.sin(i * TAU / sides - Math.PI / 2) }));
  const edge = 2 * core * Math.sin(Math.PI / sides), arc = corner * TAU / sides, section = edge + arc;
  const initial = Math.atan2(vertices[1].y - vertices[0].y, vertices[1].x - vertices[0].x) - Math.PI / 2;
  return { length, radius: core + corner, innerCurve:corner, teeth: 96, at(s) {
    const laps = Math.floor(s / length), local = ((s % length) + length) % length, i = Math.min(sides - 1, Math.floor(local / section)), t = local - i * section;
    const v = vertices[i], next = vertices[(i + 1) % sides], normal = initial + i * TAU / sides;
    if (t <= edge) return { x: v.x + (next.x - v.x) * t / edge + corner * Math.cos(normal), y: v.y + (next.y - v.y) * t / edge + corner * Math.sin(normal), normal: normal + laps * TAU };
    const turn = normal + (t - edge) / corner;
    return { x: next.x + corner * Math.cos(turn), y: next.y + corner * Math.sin(turn), normal: turn + laps * TAU };
  } };
}
// Smooth cross track. The recess curvature and 288-tooth perimeter keep
// all nine rollers clear of the concave pockets, including their full bodies.
function plusTrack(radius) {
  const count = 4096, table = [0], step = TAU / count;
  const speed = t => Math.hypot(1 + .18 * Math.cos(4 * t), -.72 * Math.sin(4 * t)) * radius;
  for (let i = 1; i <= count; i++) table.push(table[i - 1] + speed((i - .5) * step) * step);
  const length = table[count];
  return { length, radius: radius * 1.18, innerCurve:radius*.25, teeth: 288, at(s) {
    const laps = Math.floor(s / length), local = ((s % length) + length) % length;
    let low = 0, high = count;
    while (high - low > 1) { const mid = (low + high) >> 1; if (table[mid] <= local) low = mid; else high = mid; }
    const angle = (low + (local - table[low]) / (table[high] - table[low])) * step;
    const r = radius * (1 + .18 * Math.cos(4 * angle)), derivative = radius * -.72 * Math.sin(4 * angle);
    return { x: r * Math.cos(angle), y: r * Math.sin(angle), normal: angle - Math.atan2(derivative, r) + laps * TAU };
  } };
}
const sizeBoundsCache = new Map();
const baseTracks=new Map();
const baseTrack=id=>{if(!baseTracks.has(id))baseTracks.set(id,guideTrack(id));return baseTracks.get(id);};
const boundedInt=(n,min,max)=>Math.max(min,Math.min(max,Math.round(Number.isFinite(n)?n:min)));
const maxCurve=roller=>1+roller.harmonics.reduce((sum,[n,a])=>sum+Math.abs((1-n*n)*a),0);

/** Independent tooth counts share one pitch, so changing one gear's size does
 * not scale its partner. Integer counts also give an exact closure period. */
export function gearSizing(setup) {
  const base=baseTrack(setup.guide),roller=rollerFor(setup),pitch=base.length/TAU/base.teeth;
  const maxLarge=Math.floor(470/base.radius*base.teeth);
  const constrained=Boolean(setup.inside)||setup.guide==='plus';
  const minLarge=constrained?Math.max(24,Math.ceil(8*pitch*maxCurve(roller)*base.teeth/(base.innerCurve*.82))):24;
  const largeTeeth=boundedInt(setup.largeTeeth??base.teeth,minLarge,maxLarge);
  const maxSmall=constrained?Math.max(8,Math.min(80,Math.floor(base.innerCurve*largeTeeth/base.teeth*.82/(pitch*maxCurve(roller))))):80;
  const smallTeeth=boundedInt(setup.smallTeeth??roller.teeth,8,maxSmall);
  return {largeTeeth,smallTeeth,minLarge,maxLarge,minSmall:8,maxSmall,pitch};
}
export function independentGearSetup(setup) {
  if(Number.isFinite(setup.largeTeeth)||Number.isFinite(setup.smallTeeth)){const {largeTeeth,smallTeeth}=gearSizing(setup);return {...setup,largeTeeth,smallTeeth};}
  const base=baseTrack(setup.guide),geom=gearGeometry(setup,false),pitch=base.length/TAU/base.teeth;
  const {largeTeeth,smallTeeth}=gearSizing({...setup,largeTeeth:base.teeth*geom.track.length/base.length,smallTeeth:geom.radius/pitch});
  return {...setup,largeTeeth,smallTeeth};
}
export function fitGearSetup(setup,compact=false) {
  const s=gearSizing(setup),base=baseTrack(setup.guide),bound=rollerProfile(rollerFor(setup)).bound,target=compact?300:470;
  const small=setup.inside?s.smallTeeth:Math.min(s.smallTeeth,Math.floor((target-base.radius*s.minLarge/base.teeth)/(2*s.pitch*bound)));
  const allowance=target-(setup.inside?0:2*bound*s.pitch*small);
  const {largeTeeth,smallTeeth}=gearSizing({...setup,smallTeeth:small,largeTeeth:Math.floor(allowance/base.radius*base.teeth)});
  return {...setup,largeTeeth,smallTeeth,x:500,y:500,layout:compact?'compact':'pane',size:null,scale:1};
}
export function gearSizeBounds(setup) {
  const key = [setup.guide, rollerFor(setup).id, setup.inside, setup.layout].join(':');
  if (sizeBoundsCache.has(key)) return sizeBoundsCache.get(key);
  const geom = gearGeometry({ ...setup, size: null, scale: 1, x: 500, y: 500, phase: 0 }, false);
  let closest = Infinity;
  for (let i = 0; i < 192; i++) {
    const pose = geom.pose(i / (192 * closureLaps(rollerFor(setup).teeth, geom.track.teeth)));
    closest = Math.min(closest, Math.hypot(pose.center.x - 500, pose.center.y - 500));
  }
  const result = { min: .25, max: Math.min(8, 460 / closest) }; sizeBoundsCache.set(key, result); return result;
}
export function gearSizePercent(setup) {
  if (Number.isFinite(setup.size)) return setup.size;
  const bounds = gearSizeBounds(setup); return Math.max(0, Math.min(100, ((setup.scale || 1) - bounds.min) / (bounds.max - bounds.min) * 100));
}
export function snapGuide(point, previousSnap = null) {
  const targets = [{ id: 'center', label: 'Center', x: 500, y: 500 }, ...Array.from({ length: 8 }, (_, i) => ({ id: String(i), label: ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][i], x: 500 + PANE_RADIUS * Math.cos(i * TAU / 8), y: 500 + PANE_RADIUS * Math.sin(i * TAU / 8) }))];
  const nearest = targets.map(t => ({ ...t, distance: Math.hypot(point.x - t.x, point.y - t.y) })).sort((a, b) => a.distance - b.distance)[0];
  const threshold = nearest.id === previousSnap ? 72 : nearest.id === 'center' ? 56 : 42;
  return nearest.distance <= threshold ? nearest : null;
}
export function gearGeometry(setup, sample = true) {
  const roller = rollerFor(setup), inside = Boolean(setup.inside);
  const independent=Number.isFinite(setup.largeTeeth)||Number.isFinite(setup.smallTeeth)||(inside&&setup.guide!=='circle');
  const sizing=independent?gearSizing(setup):null;
  const base = guideTrack(setup.guide), baseRadius = base.length / TAU * roller.teeth / base.teeth, baseProfile = rollerProfile(roller, baseRadius);
  const baseEnvelope = inside ? base.radius : base.radius + 2 * baseProfile.bound;
  const bounds = !independent&&Number.isFinite(setup.size) ? gearSizeBounds(setup) : null;
  const scale = independent?sizing.largeTeeth/base.teeth:(bounds ? bounds.min + (bounds.max - bounds.min) * setup.size / 100 : setup.scale || 1) * (setup.layout === 'pane' ? 480 / baseEnvelope : Math.min(1, 470 / baseEnvelope));
  const track = guideTrack(setup.guide, scale);
  if(independent)track.teeth=sizing.largeTeeth;
  const teeth=sizing?.smallTeeth??roller.teeth,radius = track.length / TAU * teeth / track.teeth, profile = rollerProfile(roller, radius);
  const pins = pinPositions(radius), pin = pins.find(p => p.hole === setup.hole) || pins[6];
  const sign = inside ? 1 : -1, initialArc = profile.atNormal(inside ? 0 : Math.PI).arc;
  const laps=closureLaps(teeth,track.teeth),total = track.length * laps, phase = Number.isFinite(setup.phase) ? setup.phase : 0;
  function pose(progress) {
    const s = (Math.max(0, Math.min(1, progress)) * total) + phase * track.length, contact = track.at(s), body = profile.atArc(initialArc + sign * s);
    const rotation = contact.normal + (inside ? 0 : Math.PI) - body.normal, cos = Math.cos(rotation), sin = Math.sin(rotation);
    const center = { x: setup.x + contact.x - body.x * cos + body.y * sin, y: setup.y + contact.y - body.x * sin - body.y * cos };
    const world = p => ({ x: center.x + p.x * cos - p.y * sin, y: center.y + p.x * sin + p.y * cos });
    return { center, pen: world(pin), rotation, radius, contact: { x: setup.x + contact.x, y: setup.y + contact.y }, pins: pins.map(p => ({ ...world(p), hole: p.hole })), world };
  }
  const count = independent?Math.min(3999,Math.max(2400,laps*240)):2400, points = sample ? Array.from({ length: count + 1 }, (_, i) => pose(i / count).pen) : [];
  if (sample) points[count] = { ...points[0] };
  return { track, radius, profile, pins, total, points, pose, laps, teeth, envelope: inside ? track.radius : track.radius + 2 * profile.bound };
}
// Changing the roller chooses its most visible starting contact, never a new
// guide position. For rim placements this keeps the roller on the glass.
export function visibleGearPhase(setup) {
  const geom = gearGeometry({ ...setup, phase: 0 }, false); let best = 0, bestScore = Infinity;
  for (let i = 0; i < 192; i++) {
    const pose = geom.pose(i / (192 * geom.laps)), score = Math.hypot(pose.center.x - 500, pose.center.y - 500) + geom.profile.bound;
    if (score < bestScore) { best = i / 192; bestScore = score; }
  }
  return best;
}
export function restoreGears(value, layers) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(s => s && layers.some(l => l.id === s.layerId) && !seen.has(s.layerId) && seen.add(s.layerId)).slice(0, 3).map(s => {
    const roller = rollerFor(s), guide = GUIDES.some(g => g.id === s.guide) ? s.guide : 'circle';
    const result = { layerId: s.layerId, guide, roller: roller.id, teeth: roller.teeth, hole: HOLES.includes(s.hole) ? s.hole : .68,
      size: Number.isFinite(s.size) ? Math.max(0, Math.min(100, s.size)) : null, scale: Math.max(.25, Math.min(8, Number.isFinite(s.scale) ? s.scale : 1)), layout: s.layout === 'compact' ? 'compact' : 'pane',
      x: Math.max(4, Math.min(996, Number.isFinite(s.x) ? s.x : 500)), y: Math.max(4, Math.min(996, Number.isFinite(s.y) ? s.y : 500)),
      phase: Number.isFinite(s.phase) ? ((s.phase % 1) + 1) % 1 : 0, inside: s.inside===true || guide === 'circle' && s.inside !== false };
    if(Number.isFinite(s.largeTeeth)||Number.isFinite(s.smallTeeth)) {
      const {largeTeeth,smallTeeth}=gearSizing({...result,largeTeeth:s.largeTeeth,smallTeeth:s.smallTeeth});Object.assign(result,{largeTeeth,smallTeeth});
    }
    const dx = result.x - 500, dy = result.y - 500, factor = Math.min(1, 496 / (Math.hypot(dx, dy) || 1));
    result.x = 500 + dx * factor; result.y = 500 + dy * factor; return result;
  });
}

// The hover cue and the gesture use the same generous hit regions.
export function gearInteraction(geometry, setup, point, progress = 0) {
  if (!point) return 'none';
  const pose = geometry.pose(progress);
  if (Math.hypot(point.x - pose.center.x, point.y - pose.center.y) <= geometry.profile.bound + 18) return 'trace';
  const local = { x: point.x - setup.x, y: point.y - setup.y };
  if (setup.guide === 'circle') return Math.hypot(local.x, local.y) <= geometry.track.radius + 24 ? 'place' : 'none';
  const outline = Array.from({ length: 193 }, (_, i) => geometry.track.at(i / 192 * geometry.track.length));
  let inside = false;
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1], b = outline[i];
    if ((a.y > local.y) !== (b.y > local.y) && local.x < (b.x - a.x) * (local.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((local.x - a.x) * dx + (local.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(local.x - a.x - dx * t, local.y - a.y - dy * t) < 24) return 'place';
  }
  return inside ? 'place' : 'none';
}
