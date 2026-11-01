// Bounded geometry recognition for completed, human-authored drawing changes.
// Call with the new/edited object id; never call while painting or restoring a document.
export const NOTE_AWARDS = Object.freeze({ circle: 'refs-blank-plate', key: 'refs-cabinet-key' });
const TYPES = new Set(['pencil', 'path', 'line', 'ellipse', 'rectangle', 'polygon', 'diamond', 'heart', 'star', 'arc', 'torus', 'pacman']);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dot = (a, b) => a.x * b.x + a.y * b.y;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const norm = a => { const n = Math.hypot(a.x, a.y) || 1; return { x: a.x / n, y: a.y / n }; };
const world = (p, s) => ({ x: s.x + p.x * Math.cos(s.rotation || 0) - p.y * Math.sin(s.rotation || 0), y: s.y + p.x * Math.sin(s.rotation || 0) + p.y * Math.cos(s.rotation || 0) });
function samples(s) {
  if (!TYPES.has(s?.type)) return [];
  if (s.type === 'path' || Array.isArray(s.anchors)) {
    let a = s.anchors; if (!Array.isArray(a) || a.length < 2) return [];
    // Compound paths contain holes. Inspect their largest closed outline, not
    // an artificial line connecting the outer loop to a hole.
    if (a.some((point,i) => i && (point.move || (point.contour || 0) !== (a[i-1].contour || 0)))) {
      const groups = []; for (const point of a) {
        if (!groups.length || point.move || (point.contour || 0) !== (groups.at(-1).at(-1).contour || 0)) groups.push([]);
        groups.at(-1).push(point);
      }
      a = groups.sort((one,two) => {
        const area = group => { const xs=group.map(p=>p.x),ys=group.map(p=>p.y); return (Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)); };
        return area(two)-area(one);
      })[0];
    }
    const p = [], closed = s.closed ?? s.type !== 'path', count = closed ? a.length : a.length-1;
    // Cubic handles matter: four pen anchors can describe a round loop.
    for (let i=0;i<count;i++) {
      const first=a[i], last=a[(i+1)%a.length], out=first.out||{x:0,y:0}, incoming=last.in||{x:0,y:0};
      for (let j=0;j<6;j++) {
        const t=j/6,u=1-t;
        p.push(world({x:u*u*u*first.x+3*u*u*t*(first.x+out.x)+3*u*t*t*(last.x+incoming.x)+t*t*t*last.x,
          y:u*u*u*first.y+3*u*u*t*(first.y+out.y)+3*u*t*t*(last.y+incoming.y)+t*t*t*last.y},s));
      }
    }
    if (!closed) p.push(world(a.at(-1),s));
    const stride=Math.max(1,Math.ceil(p.length/128)); return p.filter((_,i)=>i%stride===0 || i===p.length-1);
  }
  if (s.type === 'ellipse' || s.type === 'torus') return Array.from({ length: 24 }, (_, i) => world({ x: Math.cos(i * Math.PI / 12) * s.width / 2, y: Math.sin(i * Math.PI / 12) * s.height / 2 }, s));
  if (s.type === 'rectangle') return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => world({ x: x*s.width/2, y: y*s.height/2 },s));
  if (s.type === 'diamond') return [[0,-1],[1,0],[0,1],[-1,0]].map(([x,y]) => world({ x: x*s.width/2, y: y*s.height/2 },s));
  if (s.type === 'polygon') { const n = Math.min(24,Math.max(3,s.sides||3)); return Array.from({ length: n },(_,i)=>world({x:Math.cos(i*2*Math.PI/n)*s.width/2,y:Math.sin(i*2*Math.PI/n)*s.height/2},s)); }
  if (s.type === 'arc') return Array.from({ length: 13 }, (_,i) => world({x:Math.cos(Math.PI+i*Math.PI/12)*s.width/2,y:Math.sin(Math.PI+i*Math.PI/12)*s.height/2},s));
  const source = s.type === 'path' ? s.anchors : s.points;
  if (!Array.isArray(source) || source.length < 2) return [];
  // At most 129 source points per object, regardless of raw pencil sample count.
  const stride = Math.max(1, Math.ceil(source.length / 128)), picked = [];
  for (let i = 0; i < source.length; i += stride) picked.push(world(source[i], s));
  if ((source.length - 1) % stride) picked.push(world(source.at(-1), s));
  return picked;
}
function measured(p, shape) {
  if (p.length < 2) return null;
  const xs = p.map(v => v.x), ys = p.map(v => v.y), left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const center = { x: (left + right) / 2, y: (top + bottom) / 2 }, width = right - left, height = bottom - top, size = Math.max(width, height);
  return { shape, p, center, width, height, size, start: p[0], end: p.at(-1) };
}
const measure = s => measured(samples(s),s);
function evenPoints(points, count=24) {
  const closed=[...points,points[0]], lengths=[0];
  for(let i=1;i<closed.length;i++)lengths.push(lengths.at(-1)+dist(closed[i-1],closed[i]));
  const total=lengths.at(-1); if(total<1)return points;
  const result=[];let segment=1;
  for(let i=0;i<count;i++) {
    const target=total*i/count;while(segment<lengths.length-1&&lengths[segment]<target)segment++;
    const t=(target-lengths[segment-1])/(lengths[segment]-lengths[segment-1]||1),a=closed[segment-1],b=closed[segment];
    result.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  }
  return result;
}
function ring(m) {
  if (!m || m.size < 17 || Math.min(m.width, m.height) / m.size < .54) return false;
  if ((m.shape.type === 'ellipse' || m.shape.type === 'torus') && !m.shape.anchors) return true;
  if (m.shape.type === 'polygon' && !m.shape.anchors) return (m.shape.sides || 3) >= 7 && Math.min(m.width,m.height)/m.size >= .7;
  if (!['pencil','path'].includes(m.shape.type) && !Array.isArray(m.shape.anchors)) return false;
  const closed = m.shape.closed ?? (m.shape.type !== 'path' && m.shape.type !== 'pencil');
  if (!closed && dist(m.start, m.end) > m.size * .34) return false;
  // Wobbly loops need occupancy around the center; a short bent line must fail.
  const sectors = new Set(m.p.map(p => Math.floor((Math.atan2(p.y - m.center.y, p.x - m.center.x) + Math.PI) / (Math.PI / 4)) % 8));
  if (sectors.size < 6) return false;
  // Equal arc spacing exposes the sharp 90-degree turns of a drawn rectangle.
  const even=evenPoints(m.p);let sharp=0;
  for(let i=0;i<even.length;i++) {
    if(!closed && (i===0 || i===even.length-1))continue;
    const a=norm(sub(even[i],even[(i+even.length-1)%even.length])),b=norm(sub(even[(i+1)%even.length],even[i]));
    if(Math.acos(Math.max(-1,Math.min(1,dot(a,b))))>1.12)sharp++;
  }
  return sharp < 2;
}
function toothFeatures(points, shape, head, axis, shaftLength) {
  const radius = head.size / 2;
  // Keep short teeth connected to the axis, and admit offset roots beside a
  // thick or wobbly shaft. Both passes still require an outward rise.
  const bands = [
    {rootBand:Math.max(3,radius*.22),tipBand:Math.max(5,radius*.34),minRise:Math.max(5,radius*.2)},
    {rootBand:Math.max(4,radius*.5),tipBand:Math.max(6,radius*.55),minRise:Math.max(5,radius*.24)}
  ];
  const perpendicular = { x: -axis.y, y: axis.x };
  const projected = points.map(p => { const d = sub(p, head.center); return { along: dot(d, axis), across: dot(d, perpendicular), point: p }; });
  const features = [];
  for (const {rootBand,tipBand,minRise} of bands) for (let i = 0; i < projected.length && features.length < 8;) {
    if (Math.abs(projected[i].across) < tipBand) { i++; continue; }
    const start = i;
    while (i < projected.length && Math.abs(projected[i].across) >= rootBand) i++;
    const end = i - 1;
    let before=null,after=null;
    for(let j=start-1;j>=Math.max(0,start-16);j--)if(Math.abs(projected[j].across)<rootBand){before=projected[j];break;}
    for(let j=i;j<Math.min(projected.length,i+16);j++)if(Math.abs(projected[j].across)<rootBand){after=projected[j];break;}
    const root = before || after;
    if (!root) continue;
    let tip = projected[start];
    for (let j = start + 1; j <= end; j++) if (Math.abs(projected[j].across) > Math.abs(tip.across)) tip = projected[j];
    const rise = Math.abs(tip.across - root.across), run = Math.abs(tip.along - root.along);
    if (rise < minRise || rise < run * .85 || root.along < Math.max(radius * .85, shaftLength * .58) || root.along > shaftLength + radius) continue;
    const from = projected.indexOf(root), to = projected.indexOf(tip), lo = Math.min(from,to), hi = Math.max(from,to);
    const direct = sub(tip.point,root.point), directLength = Math.hypot(direct.x,direct.y);
    let deviation = 0;
    for (let j=lo+1;j<hi;j++) {
      const d=sub(projected[j].point,root.point);
      deviation=Math.max(deviation,Math.abs(d.x*direct.y-d.y*direct.x)/directLength);
    }
    const jog=['pencil','path'].includes(shape.type) && deviation > Math.max(1.2, rise * .08);
    // The narrow and wide passes may see different roots for the same tooth.
    // Its physical tip identifies one excursion even when roots are far apart.
    const duplicate=features.find(f=>f.side===Math.sign(tip.across)&&dist(f.tip,tip.point)<Math.max(2,radius*.08));
    if(duplicate){duplicate.jog ||= jog;duplicate.reach=Math.max(duplicate.reach,Math.abs(tip.across));}
    else features.push({ along: root.along, side: Math.sign(tip.across), reach: Math.abs(tip.across), tip:tip.point, jog });
  }
  return features;
}
function threeTeeth(features, head, shaftLength) {
  const radius = head.size/2, spacing = Math.max(3.5,radius*.15), span = Math.max(radius*1.8,shaftLength*.38), tipGap=Math.max(2,radius*.08);
  for (const side of [-1,1]) {
    const row=features.filter(f=>f.side===side).sort((a,b)=>a.along-b.along).slice(0,24);
    for(let i=0;i<row.length-2;i++)for(let j=i+1;j<row.length-1;j++)for(let k=j+1;k<row.length;k++) {
      if(row[j].along-row[i].along<spacing || row[k].along-row[j].along<spacing || row[k].along-row[i].along>span)continue;
      // Direct and joined detections can have different roots but the same tip.
      if(dist(row[i].tip,row[j].tip)<tipGap || dist(row[j].tip,row[k].tip)<tipGap || dist(row[i].tip,row[k].tip)<tipGap)continue;
      if(row[i].jog || row[k].jog)return [row[i],row[j],row[k]];
    }
  }
  return null;
}
function joinedToothFeatures(candidates, head, axis, shaftLength) {
  const maxGap=Math.max(3,head.size*.07), pieces=[];
  for(const item of candidates) {
    const s=item.shape;
    if(s.type==='rectangle') {
      if(Math.max(s.width,s.height)/Math.max(1,Math.min(s.width,s.height))<2)continue;
      const half=s.width>s.height?{x:s.width/2,y:0}:{x:0,y:s.height/2};
      pieces.push({id:s.id,p:[world({x:-half.x,y:-half.y},s),world(half,s)]});
    } else if(['pencil','path','line'].includes(s.type) && !s.closed)pieces.push({id:s.id,p:item.p});
  }
  const result=[],limited=pieces.slice(-16);let examined=0;
  function extend(path,used,depth) {
    if(++examined>128)return;
    if(depth>=2)result.push(...toothFeatures(path,{type:'pencil'},head,axis,shaftLength).filter(f=>f.jog).map(f=>({...f,sources:[...used]})));
    if(depth===3 || result.length>=24 || examined>=128)return;
    for(const piece of limited) {
      if(used.has(piece.id))continue;
      for(const oriented of [piece.p,[...piece.p].reverse()]) {
        if(dist(path.at(-1),oriented[0])>maxGap)continue;
        const next=[...path,...oriented.slice(1)];
        const stride=Math.max(1,Math.ceil(next.length/128));
        const bounded=next.length>129?next.filter((_,i)=>i%stride===0||i===next.length-1):next;
        extend(bounded,new Set([...used,piece.id]),depth+1);
      }
    }
  }
  for(const piece of limited)for(const p of [piece.p,[...piece.p].reverse()])extend(p,new Set([piece.id]),1);
  return result;
}
function keyFit(head, farEnd, features) {
  const axis=norm(sub(farEnd,head.center)), perpendicular={x:-axis.y,y:axis.x};
  const reach=Math.max(...features.map(f=>f.reach),head.size*.32), side=features[0].side;
  return {head:head.center,end:farEnd,side:{x:farEnd.x+perpendicular.x*reach*side,y:farEnd.y+perpendicular.y*reach*side}};
}
function singleKey(m) {
  if (!['pencil','path'].includes(m.shape.type) || m.p.length < 15 || m.p.length > 129) return null;
  // The same pen/pencil object may trace the ring, stem and bit continuously.
  for (const sequence of [m.p,[...m.p].reverse()]) {
    for(let i=0;i<Math.min(sequence.length-9,45);i+=2) for(let j=i+8;j<Math.min(sequence.length-2,i+80);j+=2) {
      const head=measured(sequence.slice(i,j+1),m.shape);
      if(!head || !ring({...head,shape:{...m.shape,closed:false}}))continue;
      const tail=sequence.slice(j),radius=head.size/2;
      if(dist(tail[0],head.center)>radius*1.8)continue;
      const axes=[];
      for(const p of [...tail].sort((a,b)=>dist(b,head.center)-dist(a,head.center))) {
        const length=dist(p,head.center);if(length<radius*2.4)break;
        const axis=norm(sub(p,head.center));
        if(axes.some(entry=>dot(entry.axis,axis)>.997))continue;
        axes.push({axis,length});if(axes.length===8)break;
      }
      for(const {axis,length} of axes) {
        const features=threeTeeth(toothFeatures(tail,m.shape,head,axis,length),head,length);
        if(features)return keyFit(head,{x:head.center.x+axis.x*length,y:head.center.y+axis.y*length},features);
      }
    }
  }
  return null;
}
function near(a, b, margin) { return a && b && Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) <= (a.size + b.size) / 2 + margin; }
function stemAxis(points, head) {
  const mean={x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length};
  let xx=0,xy=0,yy=0;
  for(const p of points){const x=p.x-mean.x,y=p.y-mean.y;xx+=x*x;xy+=x*y;yy+=y*y;}
  if(xx+yy<1)return null;
  const angle=Math.atan2(2*xy,xx-yy)/2,axis={x:Math.cos(angle),y:Math.sin(angle)};
  const far=points.reduce((best,p)=>dist(p,head)>dist(best,head)?p:best,points[0]);
  return dot(sub(far,head),axis)<0?{x:-axis.x,y:-axis.y}:axis;
}
function longestStrokeAxis(points, head) {
  let best=null, length=0;
  for(let i=1;i<points.length;i++) {
    const delta=sub(points[i],points[i-1]),size=Math.hypot(delta.x,delta.y);
    if(size>length){best=delta;length=size;}
  }
  if(!best || length<1)return null;
  let axis=norm(best);
  const far=points.reduce((current,p)=>dist(p,head)>dist(current,head)?p:current,points[0]);
  if(dot(sub(far,head),axis)<0)axis={x:-axis.x,y:-axis.y};
  return axis;
}
function discoveryBounds(items) {
  const points = items.flatMap(item => item.p);
  return points.length ? { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)),
    width: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
    height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) } : null;
}
function joinedRing(items, changedId) {
  const pieces = items.filter(m => ['line','pencil','path'].includes(m.shape.type) && !m.shape.closed && m.p.length >= 2).slice(-16);
  if (pieces.length < 3 || !pieces.some(m=>m.shape.id===changedId)) return null;
  const gap = 6, maxSteps = 128; let steps=0;
  function walk(points, ids) {
    if (++steps > maxSteps) return null;
    if (ids.size >= 3 && dist(points[0],points.at(-1)) <= gap) {
      const candidate=measured(points,{type:'pencil',closed:true});
      if (ring(candidate)) return candidate;
    }
    if (ids.size >= 12 || points.length >= 128) return null;
    for (const piece of pieces) {
      if (ids.has(piece.shape.id)) continue;
      for (const oriented of [piece.p,[...piece.p].reverse()]) {
        if (dist(points.at(-1),oriented[0]) > gap) continue;
        const joined=[...points,...oriented.slice(1)];
        const stride=Math.max(1,Math.ceil(joined.length/128));
        const bounded=joined.length>129?joined.filter((_,i)=>i%stride===0||i===joined.length-1):joined;
        const result=walk(bounded,new Set([...ids,piece.shape.id])); if (result) return result;
      }
    }
    return null;
  }
  const seed=pieces.find(m=>m.shape.id===changedId);
  for (const points of [seed.p,[...seed.p].reverse()]) { const found=walk(points,new Set([changedId])); if (found) return found; }
  return null;
}
export function detectNotesDiscovery(objects, changedId) {
  const seed = objects.find(s => s.id === changedId); if (!seed || !TYPES.has(seed.type)) return { circle: false, key: false, examined: 0 };
  const origin = measure(seed); if (!origin) return { circle: false, key: false, examined: 0 };
  // Cheap metadata box gate before sampling. Limits clutter to nearby authored objects.
  const close = objects.filter(s => s !== seed && TYPES.has(s.type) && Math.abs(s.x - seed.x) <= 340 + (s.width || 0) / 2 && Math.abs(s.y - seed.y) <= 340 + (s.height || 0) / 2).slice(-31);
  close.push(seed); // At most 31 neighbors plus the changed object.
  const ms = close.map(s => s === seed ? origin : measure(s)).filter(Boolean), rings = ms.filter(ring), ringSet = new Set(rings);
  let key = false, keyBounds = null, keyBasis = null;
  for (const head of rings) {
    const radius = head.size / 2;
    for (const shaft of ms) {
      if (shaft === head || ringSet.has(shaft) || shaft.size < radius * .85 || shaft.size > radius * 10 || !near(head, shaft, shaft.size * .25)) continue;
      const nearEnd = shaft.p.reduce((best,p)=>dist(p,head.center)<dist(best,head.center)?p:best,shaft.p[0]);
      const farEnd = shaft.p.reduce((best,p)=>dist(p,head.center)>dist(best,head.center)?p:best,shaft.p[0]);
      if (dist(nearEnd, head.center) > radius + Math.max(15, radius * .65)) continue;
      const direct=norm(sub(farEnd,head.center)), principal=stemAxis(shaft.p,head.center), stroke=longestStrokeAxis(shaft.p,head.center);
      const axes=[stroke,principal,direct].filter((axis,i,list)=>axis && !list.slice(0,i).some(previous=>previous && dot(axis,previous)>.997));
      for(const axis of axes) {
        const length=Math.max(...shaft.p.map(p=>dot(sub(p,head.center),axis)));
        if(length<radius*2.4)continue;
        const teeth = ms.filter(t => t !== head && t !== shaft && !ringSet.has(t) && t.size >= 9 && t.size <= Math.max(radius * 1.7, 90) && near(t, shaft, Math.max(25, radius * 1.5)));
        const features = [shaft,...teeth].flatMap(t => toothFeatures(t.p,t.shape,head,axis,length).map(f=>({...f,sources:[t.shape.id]})));
        // The two jogged outer teeth may each be several short editable pieces;
        // one straight middle tooth is enough to justify the bounded join pass.
        if(features.length >= 1 && teeth.length >= 3)features.push(...joinedToothFeatures(teeth,head,axis,length));
        const winning = threeTeeth(features,head,length);
        if (winning && [head, shaft, ...teeth].some(m => m.shape.id === changedId)) {
          const used = new Set(winning.flatMap(feature => feature.sources));
          key = true; keyBasis = keyFit(head,{x:head.center.x+axis.x*length,y:head.center.y+axis.y*length},winning);
          keyBounds = discoveryBounds([head,shaft,...teeth.filter(t=>used.has(t.shape.id))]); break;
        }
      }
      if (key) break;
    }
    if (key) break;
  }
  const continuousKey = !key && singleKey(origin);
  key ||= Boolean(continuousKey); keyBasis ||= continuousKey || null;
  const assembledRing = !rings.some(m => m.shape.id === changedId) && !continuousKey ? joinedRing(ms,changedId) : null;
  const circle = rings.some(m => m.shape.id === changedId) || Boolean(continuousKey) || Boolean(assembledRing);
  return { circle, key, examined: ms.length,
    circleBounds: circle ? discoveryBounds([rings.find(m => m.shape.id === changedId) || assembledRing || origin]) : null,
    keyBounds: key ? keyBounds || discoveryBounds([origin]) : null, keyFit: keyBasis };
}

export function createNoteAwardStore(storage = globalThis.localStorage, prefix = 'site.about.notes.award.') {
  const listeners = new Set(), held = new Set(), persistent = new Set();
  for (const id of Object.values(NOTE_AWARDS)) {
    try { if (storage.getItem(prefix + id) === '1') { held.add(id); persistent.add(id); } } catch { /* Session fallback. */ }
  }
  const get = () => Object.values(NOTE_AWARDS).filter(id => held.has(id)).map(id => ({ id, persisted: persistent.has(id) }));
  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  function award(id) {
    if (!Object.values(NOTE_AWARDS).includes(id) || held.has(id)) return null;
    let persisted = false;
    try {
      if (storage.getItem(prefix + id) === '1') { held.add(id); persistent.add(id); return null; }
      storage.setItem(prefix + id, '1'); persisted = storage.getItem(prefix + id) === '1';
    } catch { /* Keep a session receipt and report that it was not saved. */ }
    held.add(id); if (persisted) persistent.add(id);
    const receipt = { id, persisted }; listeners.forEach(fn => fn(receipt)); return receipt;
  }
  function acceptStorage(event) {
    if (event.key && event.newValue === '1' && event.key.startsWith(prefix)) {
      const id = event.key.slice(prefix.length); if (!Object.values(NOTE_AWARDS).includes(id)) return;
      persistent.add(id); if (!held.has(id)) { held.add(id); listeners.forEach(fn => fn({ id, persisted: true, remote: true })); }
    }
  }
  return { get, subscribe, award, acceptStorage };
}
export const noteAwards = createNoteAwardStore();
