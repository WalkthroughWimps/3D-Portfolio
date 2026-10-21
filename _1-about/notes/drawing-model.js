import { restoreGears } from './gear-model.js';
export const SIZE = 1000;
export const RADIUS = 496;
export const PALETTE = [
  ['Ivory', '#f3f4e8'], ['Charcoal', '#263342'], ['Cyan', '#56d9ed'],
  ['Blue', '#729fff'], ['Coral', '#ff827b'], ['Amber', '#ffd16b'],
  ['Mint', '#79e6ba'], ['Violet', '#c4a0ff'], ['Pink', '#ff9fda'],
  ['Orange', '#ffa451'], ['Sand', '#d6b58b']
];
export const TYPES = ['pencil', 'path', 'line', 'rectangle', 'ellipse', 'polygon', 'diamond', 'heart', 'star', 'arc', 'torus', 'pacman'];
export const clone = value => JSON.parse(JSON.stringify(value));
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const rotate = (p, angle) => ({ x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle) });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const multiply = (p, n) => ({ x: p.x * n, y: p.y * n });
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const toLocal = (p, shape) => rotate(subtract(p, shape), -shape.rotation);
export const toWorld = (p, shape) => add(rotate(p, shape.rotation), shape);
export const onGlass = p => p && Math.hypot(p.x - SIZE / 2, p.y - SIZE / 2) <= RADIUS;
export function constrainPoint(p) {
  const delta = subtract(p, { x: SIZE / 2, y: SIZE / 2 });
  return add({ x: SIZE / 2, y: SIZE / 2 }, multiply(delta, Math.min(1, (RADIUS - 2) / (Math.hypot(delta.x, delta.y) || 1))));
}
export function snapPoint(origin, p) {
  const d = subtract(p, origin), length = Math.hypot(d.x, d.y), angle = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 12)) * Math.PI / 12;
  return add(origin, { x: Math.cos(angle) * length, y: Math.sin(angle) * length });
}
export function shapeFromDrag(type, start, end, style, constrained = false) {
  if (type === 'line' && constrained) end = snapPoint(start, end);
  let d = subtract(end, start);
  if (constrained && type !== 'line') {
    const side = Math.max(Math.abs(d.x), Math.abs(d.y)); d = { x: (Math.sign(d.x) || 1) * side, y: (Math.sign(d.y) || 1) * side };
  }
  const shape = { ...style, id: style.id || crypto.randomUUID(), type, x: start.x + d.x / 2, y: start.y + d.y / 2,
    width: Math.max(4, Math.abs(d.x)), height: Math.max(4, Math.abs(d.y)), rotation: style.rotation || 0 };
  if (type === 'line') shape.points = [multiply(d, -.5), multiply(d, .5)];
  return shape;
}
export const anchor = (x, y, incoming = { x: 0, y: 0 }, outgoing = { x: 0, y: 0 }) => ({ x, y, in: incoming, out: outgoing });
// Cubic arc pieces share the same anchors as editable vector shapes.
function ellipseArc(w,h,start,end,contour=0) {
  const count=Math.max(1,Math.ceil(Math.abs(end-start)/(Math.PI/2))), step=(end-start)/count;
  return Array.from({length:count+1},(_,i)=>{
    const angle=start+i*step,k=4/3*Math.tan(step/4),p=anchor(Math.cos(angle)*w,Math.sin(angle)*h);
    if(i)p.in={x:Math.sin(angle)*w*k,y:-Math.cos(angle)*h*k};
    if(i<count)p.out={x:-Math.sin(angle)*w*k,y:Math.cos(angle)*h*k};
    return {...p,contour};
  });
}
function contours(points) {
  const result=[]; for(const [index,point] of points.entries()) {
    if(!result.length || point.move || (result.at(-1)[0].point.contour||0)!==(point.contour||0))result.push([]);
    result.at(-1).push({point,index});
  } return result;
}
export function shapeAnchors(shape) {
  if (shape.anchors) return clone(shape.anchors);
  const w = shape.width / 2, h = shape.height / 2;
  if (['arc','torus','pacman'].includes(shape.type)) {
    const depth=clamp(shape.depth ?? .5,.005,.995), inner=1-depth;
    if(shape.type==='pacman') {
      const half=depth*Math.PI;
      return [anchor(0,0),...ellipseArc(w,h,half,Math.PI*2-half)];
    }
    if(shape.type==='arc')return [...ellipseArc(w,h,Math.PI,Math.PI*2),...ellipseArc(w*inner,h*inner,Math.PI*2,Math.PI)];
    // Opposite winding leaves the central hole transparent, including hit testing.
    return [...ellipseArc(w,h,0,Math.PI*2).slice(0,-1).map((a,i)=>i===0?{...a,in:{x:0,y:-h*.5522847498307936}}:a),
      ...ellipseArc(w*inner,h*inner,Math.PI*2,0,1).slice(0,-1).map((a,i)=>i===0?{...a,in:{x:0,y:h*inner*.5522847498307936}}:a)];
  }
  if (shape.type === 'line') return shape.points.map(p => anchor(p.x, p.y));
  if (shape.type === 'rectangle') return [anchor(-w, -h), anchor(w, -h), anchor(w, h), anchor(-w, h)];
  if (shape.type === 'diamond') return [anchor(0, -h), anchor(w, 0), anchor(0, h), anchor(-w, 0)];
  if (shape.type === 'ellipse') {
    const k = .5522847498307936;
    return [anchor(0, -h, { x: -w * k, y: 0 }, { x: w * k, y: 0 }), anchor(w, 0, { x: 0, y: -h * k }, { x: 0, y: h * k }),
      anchor(0, h, { x: w * k, y: 0 }, { x: -w * k, y: 0 }), anchor(-w, 0, { x: 0, y: h * k }, { x: 0, y: -h * k })];
  }
  if (shape.type === 'polygon' || shape.type === 'star') {
    const sides = clamp(Math.round(shape.sides || (shape.type === 'star' ? 5 : 3)), 3, 24), count = sides * (shape.type === 'star' ? 2 : 1);
    return Array.from({ length: count }, (_, i) => {
      const angle = i * Math.PI * 2 / count - Math.PI / 2;
      const radius = shape.type === 'star' && i % 2 ? 1 - clamp(shape.depth ?? .55, 0, .995) : 1;
      return anchor(Math.cos(angle) * w * radius, Math.sin(angle) * h * radius);
    });
  }
  if (shape.type === 'heart') {
    const notch = -h + clamp(shape.depth ?? .5, 0, .995) * 2 * h;
    return [anchor(0, notch, { x: .55 * w, y: -h - notch }, { x: -.55 * w, y: -h - notch }),
      anchor(-w, -.45 * h, { x: 0, y: -.55 * h }, { x: 0, y: .6 * h }),
      anchor(0, h, { x: -.3 * w, y: -.3 * h }, { x: .3 * w, y: -.3 * h }),
      anchor(w, -.45 * h, { x: 0, y: .6 * h }, { x: 0, y: -.55 * h })];
  }
  return [];
}
export const isClosed = shape => !['line', 'pencil'].includes(shape.type) && (shape.type !== 'path' || Boolean(shape.closed));
export function cubic(a, b, c, d, t) {
  const s = 1 - t;
  return { x: s ** 3 * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t ** 3 * d.x,
    y: s ** 3 * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t ** 3 * d.y };
}
export function splitCurve(anchors, index, t, closed) {
  const result = clone(anchors), a = result[index], peers = result.filter(p=>(p.contour||0)===(a?.contour||0)), b = peers[(peers.indexOf(a)+1)%peers.length];
  if (!a || !b || !closed && index === result.length - 1) return result;
  const lerp = (p, q) => add(multiply(p, 1 - t), multiply(q, t));
  const p0 = { x: a.x, y: a.y }, p3 = { x: b.x, y: b.y }, straight = Math.hypot(a.out.x, a.out.y, b.in.x, b.in.y) < .001;
  const p1 = straight ? add(p0, multiply(subtract(p3, p0), 1 / 3)) : add(a, a.out);
  const p2 = straight ? add(p0, multiply(subtract(p3, p0), 2 / 3)) : add(b, b.in);
  const q0 = lerp(p0, p1), q1 = lerp(p1, p2), q2 = lerp(p2, p3), r0 = lerp(q0, q1), r1 = lerp(q1, q2), s = lerp(r0, r1);
  a.out = subtract(q0, p0); b.in = subtract(q2, p3);
  result.splice(index + 1, 0, {...anchor(s.x, s.y, subtract(r0, s), subtract(r1, s)),contour:a.contour||0});
  return result;
}
export function segmentDistance(p, a, b) {
  const d = subtract(b, a), squared = d.x * d.x + d.y * d.y;
  const t = squared ? clamp(((p.x - a.x) * d.x + (p.y - a.y) * d.y) / squared, 0, 1) : 0;
  return { distance: distance(p, add(a, multiply(d, t))), t };
}
export function simplified(points, tolerance) {
  if (points.length < 3 || tolerance <= 0) return points;
  const keep = new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop(); let best = tolerance, found = -1;
    for (let i = first + 1; i < last; i++) { const d = segmentDistance(points[i], points[first], points[last]).distance; if (d > best) { best = d; found = i; } }
    if (found !== -1) { keep.add(found); stack.push([first, found], [found, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}
function pencilAnchors(shape) {
  const amount = shape.smoothing ?? .45, points = simplified(shape.points || [], amount * 7);
  return points.map((p, i) => {
    const delta = multiply(subtract(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]), amount / 6);
    return anchor(p.x, p.y, i ? multiply(delta, -1) : { x: 0, y: 0 }, i < points.length - 1 ? delta : { x: 0, y: 0 });
  });
}
export function makePath(shape) {
  const path = new Path2D(), points = shape.type === 'pencil' ? pencilAnchors(shape) : shapeAnchors(shape);
  if (!points.length) return path;
  for(const contour of contours(points)) {
    const vertices=contour.map(p=>p.point);path.moveTo(vertices[0].x,vertices[0].y);
    if(vertices.length===1)path.lineTo(vertices[0].x+.01,vertices[0].y);
    const count=vertices.length-(isClosed(shape)?0:1);
    for(let i=0;i<count;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];path.bezierCurveTo(a.x+a.out.x,a.y+a.out.y,b.x+b.in.x,b.y+b.in.y,b.x,b.y);}
    if(isClosed(shape))path.closePath();
  }
  return path;
}
export function flattenShape(shape, steps = 20) {
  const anchors = shape.type === 'pencil' ? pencilAnchors(shape) : shapeAnchors(shape), points = [];
  if (!anchors.length) return points;
  for(const contour of contours(anchors)) {
    points.push({...toWorld(contour[0].point,shape),segment:contour[0].index,t:0,move:true});
    const count=contour.length-(isClosed(shape)?0:1);
    for(let i=0;i<count;i++) {
      const {point:a,index}=contour[i],b=contour[(i+1)%contour.length].point;
      const curved=Math.hypot(a.out.x,a.out.y,b.in.x,b.in.y)>.001,n=curved?steps:1;
      for(let j=1;j<=n;j++)points.push({...toWorld(cubic(a,add(a,a.out),add(b,b.in),b,j/n),shape),segment:index,t:j/n});
    }
  }
  return points;
}
export function boundsOf(shapes) {
  const points = shapes.flatMap(s => flattenShape(s));
  if (!points.length) return { x: 500, y: 500, width: 4, height: 4, left: 498, right: 502, top: 498, bottom: 502, rotation: 0 };
  const xs = points.map(p => p.x), ys = points.map(p => p.y), left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return { x: (left + right) / 2, y: (top + bottom) / 2, width: Math.max(4, right - left), height: Math.max(4, bottom - top), left, right, top, bottom, rotation: 0 };
}
export function rebaseShape(shape) {
  const unrotated = { ...shape, x: 0, y: 0, rotation: 0 }, bounds = boundsOf([unrotated]);
  const center = { x: bounds.x, y: bounds.y }, world = toWorld(center, shape);
  if (shape.points) shape.points = shape.points.map(p => subtract(p, center));
  if (shape.anchors) shape.anchors = shape.anchors.map(a => ({ ...a, x: a.x - center.x, y: a.y - center.y }));
  shape.x = world.x; shape.y = world.y; shape.width = bounds.width; shape.height = bounds.height;
}
export function normalizePencil(shape, points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y), x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2;
  shape.x = x; shape.y = y; shape.width = Math.max(4, Math.max(...xs) - Math.min(...xs)); shape.height = Math.max(4, Math.max(...ys) - Math.min(...ys));
  shape.points = points.map(p => ({ x: p.x - x, y: p.y - y }));
}
export const RESIZE_HANDLES = Object.freeze([[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]]);
export function handles(shape, unit) {
  if (shape.type === 'line') {
    const points = shape.points.map(p => toWorld(p, shape)), middle = multiply(add(points[0], points[1]), .5), d = subtract(points[1], points[0]), length = Math.hypot(d.x, d.y) || 1;
    return [...points, add(middle, { x: d.y / length * unit * 4, y: -d.x / length * unit * 4 })];
  }
  const w = Math.max(shape.width, unit * 2) / 2, h = Math.max(shape.height, unit * 2) / 2;
  return [...RESIZE_HANDLES.map(([x, y]) => ({ x: x * w, y: y * h })), { x: 0, y: -h - unit * 4 }].map(p => toWorld(p, shape));
}
export function scaledShape(original, sx, sy, scaleStrokes) {
  const shape = clone(original); shape.width *= sx; shape.height *= sy;
  if (shape.points) shape.points = shape.points.map(p => ({ x: p.x * sx, y: p.y * sy }));
  if (shape.anchors) shape.anchors = shape.anchors.map(a => ({ ...a, x: a.x * sx, y: a.y * sy, in: { x: a.in.x * sx, y: a.in.y * sy }, out: { x: a.out.x * sx, y: a.out.y * sy } }));
  if (scaleStrokes) shape.strokeWidth = clamp(original.strokeWidth * Math.sqrt(sx * sy), .5, 100);
  return shape;
}
export function resizeShape(original, handle, point, scaleStrokes, preserveRatio, opposite = false) {
  const signs = RESIZE_HANDLES[handle];
  const fixed = opposite ? toWorld({ x: -signs[0] * original.width / 2, y: -signs[1] * original.height / 2 }, original) : original;
  const delta = rotate(subtract(point, fixed), -original.rotation), span = opposite ? 1 : 2;
  let width = signs[0] ? clamp(signs[0] * delta.x * span, 4, 3000) : original.width;
  let height = signs[1] ? clamp(signs[1] * delta.y * span, 4, 3000) : original.height;
  if (preserveRatio) {
    const desired = !signs[0] ? height / original.height : !signs[1] ? width / original.width : Math.max(width / original.width, height / original.height);
    const factor = clamp(desired, Math.max(4 / original.width, 4 / original.height), Math.min(3000 / original.width, 3000 / original.height));
    width = original.width * factor; height = original.height * factor;
  }
  const shape = scaledShape(original, width / original.width, height / original.height, scaleStrokes);
  if (opposite) Object.assign(shape, add(fixed, rotate({ x: signs[0] * width / 2, y: signs[1] * height / 2 }, original.rotation)));
  return shape;
}
export function resizeShapes(originals, frame, handle, point, scaleStrokes, preserveRatio, opposite = false) {
  if (originals.length === 1) return [resizeShape(originals[0], handle, point, scaleStrokes, preserveRatio, opposite)];
  const next = resizeShape(frame, handle, point, scaleStrokes, preserveRatio, opposite), sx = next.width / frame.width, sy = next.height / frame.height;
  return originals.map(base => {
    const delta = toLocal(base, frame), center = toWorld({ x: delta.x * sx, y: delta.y * sy }, next);
    const angle = base.rotation - frame.rotation, c = Math.cos(angle), s = Math.sin(angle);
    const xx = sx * c * c + sy * s * s, yy = sx * s * s + sy * c * c, xy = (sy - sx) * s * c;
    const vector = p => ({ x: xx * p.x + xy * p.y, y: xy * p.x + yy * p.y });
    let shape;
    if (Math.abs(xy) < 1e-10) shape = scaledShape(base, xx, yy, scaleStrokes);
    else {
      shape = clone(base);
      if (base.points) shape.points = base.points.map(vector);
      if (base.type !== 'pencil' && base.type !== 'line') shape.anchors = shapeAnchors(base).map(a => ({ ...a, ...vector(a), in: vector(a.in), out: vector(a.out) }));
      shape.width = Math.abs(xx) * base.width + Math.abs(xy) * base.height;
      shape.height = Math.abs(xy) * base.width + Math.abs(yy) * base.height;
      if (scaleStrokes) shape.strokeWidth = clamp(base.strokeWidth * Math.sqrt(sx * sy), .5, 100);
    }
    return Object.assign(shape, center);
  });
}
export function pointInPolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if(a.move)continue;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function intersectsGlass(shape) {
  const points = flattenShape(shape), center = { x: SIZE / 2, y: SIZE / 2 };
  const filled = Boolean(shape.fill && isClosed(shape)), radius = RADIUS + (shape.stroke ? shape.strokeWidth / 2 : 0);
  if (!points.length || !shape.stroke && !filled) return false;
  if (points.some(p => distance(p, center) <= radius)) return true;
  for (let i = 1; i < points.length; i++) if (!points[i].move && segmentDistance(center, points[i - 1], points[i]).distance <= radius) return true;
  return filled && pointInPolygon(center, points);
}
// Clip the faint continuation to the outside of the circular glass. These
// segments are rendered on its existing 3D carrier, behind all DOM controls.
export function outsideSegments(shape, tolerance = 0) {
  if (!shape.stroke && !(shape.fill && isClosed(shape))) return [];
  const pad = Math.hypot(shape.width, shape.height) * .6;
  if (!shape.anchors && Math.hypot(shape.x - SIZE / 2, shape.y - SIZE / 2) + pad <= RADIUS) return [];
  const points = flattenShape(shape);
  return outsidePathSegments(tolerance > 0 ? contours(points).flatMap(c=>simplified(c.map(p=>p.point),tolerance)) : points);
}
export function outsidePathSegments(points) {
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    if(points[i].move)continue;
    const a = points[i - 1], b = points[i], delta = subtract(b, a), offset = subtract(a, { x: SIZE / 2, y: SIZE / 2 });
    const aa = delta.x ** 2 + delta.y ** 2; if (aa < 1e-12) continue;
    const bb = 2 * (offset.x * delta.x + offset.y * delta.y), cc = offset.x ** 2 + offset.y ** 2 - RADIUS ** 2;
    const discriminant = bb * bb - 4 * aa * cc, cuts = [0, 1];
    if (discriminant > 0) for (const sign of [-1, 1]) { const t = (-bb + sign * Math.sqrt(discriminant)) / (2 * aa); if (t > 0 && t < 1) cuts.push(t); }
    cuts.sort((x, y) => x - y);
    for (let j = 1; j < cuts.length; j++) {
      const middle = add(offset, multiply(delta, (cuts[j - 1] + cuts[j]) / 2));
      if (Math.hypot(middle.x, middle.y) > RADIUS) segments.push([add(a, multiply(delta, cuts[j - 1])), add(a, multiply(delta, cuts[j]))]);
    }
  }
  return segments;
}
export function dimensionShapes(originals, field, value, scaleStrokes) {
  if (originals.length === 1 && originals[0].type === 'line') {
    const shape = clone(originals[0]), delta = subtract(shape.points[1], shape.points[0]);
    const axis = field === 'width' ? 'x' : 'y'; delta[axis] = (Math.sign(delta[axis]) || 1) * clamp(value, 4, 3000);
    shape.points = [multiply(delta, -.5), multiply(delta, .5)]; shape.width = Math.max(4, Math.abs(delta.x)); shape.height = Math.max(4, Math.abs(delta.y));
    return [shape];
  }
  const frame = originals.length === 1 ? originals[0] : boundsOf(originals), factor = clamp(value, 4, 3000) / frame[field];
  return originals.map(base => {
    const multiple = originals.length > 1, bounded = multiple ? Math.min(factor, ...originals.map(s => Math.min(3000 / s.width, 3000 / s.height))) : factor;
    const sx = multiple || field === 'width' ? bounded : 1, sy = multiple || field === 'height' ? bounded : 1;
    const shape = scaledShape(base, sx, sy, scaleStrokes);
    if (multiple) Object.assign(shape, add(frame, multiply(subtract(base, frame), bounded)));
    return shape;
  });
}
export function overlapsRect(shape, rect) {
  const points = flattenShape(shape), pad = shape.stroke ? shape.strokeWidth / 2 : 0;
  const left = rect.left - pad, right = rect.right + pad, top = rect.top - pad, bottom = rect.bottom + pad;
  const within = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (points.some(within)) return true;
  for (let i = 1; i < points.length; i++) {
    if(points[i].move)continue;
    const a = points[i - 1], b = points[i]; let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x - left], [dx, right - a.x], [-dy, a.y - top], [dy, bottom - a.y]]) {
      if (p === 0 && q < 0) { t1 = -1; break; }
      if (p < 0) t0 = Math.max(t0, q / p); else if (p > 0) t1 = Math.min(t1, q / p);
    }
    if (t0 <= t1 && t1 >= 0 && t0 <= 1) return true;
  }
  return isClosed(shape) && [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }].some(p => pointInPolygon(p, points));
}

export function emptyDocument() { return { version: 2, objects: [], groups: [], gears: [], layers: [{ id: 'pane-1', name: 'Pane 1', visible: true, locked: false }], activeLayer: 'pane-1' }; }
export function restoreDocument(value) {
  const doc = emptyDocument();
  if (![1, 2].includes(value?.version) || !Array.isArray(value.objects) || value.objects.length > 300) return doc;
  const colors = new Set(PALETTE.map(([, c]) => c));
  if (value.version === 2 && Array.isArray(value.layers)) {
    const ids = new Set(); doc.layers = value.layers.slice(0, 3).filter(l => typeof l?.id === 'string' && !ids.has(l.id) && ids.add(l.id)).map(l => ({ id: l.id.slice(0, 80), name: String(l.name || 'Pane').slice(0, 60), visible: l.visible !== false, locked: Boolean(l.locked) }));
    if (!doc.layers.length) doc.layers = emptyDocument().layers;
  }
  const layerIds = new Set(doc.layers.map(l => l.id)), ids = new Set();
  const pointOK = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 12000 && Math.abs(p.y) <= 12000;
  for (const raw of value.objects) {
    if (!raw || typeof raw.id !== 'string' || raw.id.length > 80 || ids.has(raw.id)) continue;
    const type = value.version === 1 ? ({ pen: 'pencil', triangle: 'polygon' }[raw.type] || raw.type) : raw.type;
    if (!TYPES.includes(type) || !['x', 'y', 'width', 'height', 'rotation', 'strokeWidth'].every(k => Number.isFinite(raw[k])) ||
      Math.abs(raw.x) > 6000 || Math.abs(raw.y) > 6000 || raw.width < 4 || raw.height < 4 || raw.width > 6000 || raw.height > 6000 ||
      raw.strokeWidth < .5 || raw.strokeWidth > 100 || raw.stroke !== null && !colors.has(raw.stroke) || raw.fill !== null && !colors.has(raw.fill)) continue;
    if (['pencil', 'line'].includes(type) && (!Array.isArray(raw.points) || raw.points.length < (type === 'line' ? 2 : 1) || raw.points.length > 4000 || !raw.points.every(pointOK))) continue;
    if (raw.anchors && (!Array.isArray(raw.anchors) || raw.anchors.length > 200 || !raw.anchors.every(a => pointOK(a) && pointOK(a.in) && pointOK(a.out)))) continue;
    if (type === 'path' && !raw.anchors?.length) continue;
    if (raw.points && (!Array.isArray(raw.points) || !raw.points.every(pointOK))) continue;
    const shape = { id: raw.id.slice(0, 80), name: String(raw.name || type[0].toUpperCase() + type.slice(1)).slice(0, 60), type,
      x: raw.x, y: raw.y, width: raw.width, height: raw.height, rotation: raw.rotation, strokeWidth: raw.strokeWidth, stroke: raw.stroke, fill: raw.fill,
      layerId: layerIds.has(raw.layerId) ? raw.layerId : doc.layers[0].id, groupId: typeof raw.groupId === 'string' ? raw.groupId : null, visible: raw.visible !== false,
      order: Number.isFinite(raw.order) ? raw.order : doc.objects.length, sides: clamp(Math.round(Number.isFinite(raw.sides) ? raw.sides : type === 'star' ? 5 : 3), 3, 24),
      depth: clamp(Number.isFinite(raw.depth) ? raw.depth : .5, 0, 1), smoothing: clamp(Number.isFinite(raw.smoothing) ? raw.smoothing : .45, 0, 1), closed: Boolean(raw.closed) };
    if (raw.points) shape.points = raw.points.slice(0, type === 'line' ? 2 : 4000).map(p => ({ x: p.x, y: p.y }));
    if (raw.anchors) shape.anchors = clone(raw.anchors);
    ids.add(raw.id); doc.objects.push(shape);
  }
  if (value.version === 2 && Array.isArray(value.groups)) {
    for (const g of value.groups.slice(0, 300)) if (g && typeof g.id === 'string' && !ids.has(g.id) && layerIds.has(g.layerId)) {
      ids.add(g.id); doc.groups.push({ id: g.id, name: String(g.name || 'Group').slice(0, 60), layerId: g.layerId, parentId: typeof g.parentId === 'string' ? g.parentId : null, order: Number.isFinite(g.order) ? g.order : 0, visible: g.visible !== false });
    }
    const groups = new Map(doc.groups.map(g => [g.id, g]));
    for (const g of doc.groups) if (g.parentId) {
      const parent = groups.get(g.parentId);
      if (!parent || parent.layerId !== g.layerId || parent.parentId || parent === g) g.parentId = null;
    }
    for (const s of doc.objects) if (!groups.has(s.groupId) || groups.get(s.groupId).layerId !== s.layerId) s.groupId = null;
  } else doc.objects.forEach(s => { s.groupId = null; });
  doc.gears = restoreGears(value.gears, doc.layers);
  doc.activeLayer = layerIds.has(value.activeLayer) ? value.activeLayer : doc.layers[0].id;
  return doc;
}
