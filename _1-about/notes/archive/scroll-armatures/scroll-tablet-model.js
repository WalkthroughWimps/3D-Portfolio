export const SCROLL_RIG = Object.freeze({radius: .835, openingRadius: .895, frameRadius: .9, seat: .045, lift: .18, openSeconds: 2.8, closeSeconds: 2, maxWidth: 1.35, bobRadius: .024, rodGap: .058, screenZ: .9});
export const TABLET_SCREENS = Object.freeze([{width:546,height:900},{width:546,height:900}].map(Object.freeze));
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const range = (p, a, b) => smooth((p - a) / (b - a));
const mix = (a, b, t) => a + (b - a) * t;

export function createScrollMotion() {
  let progress = 0, lift = 0;
  return { update(dt, open, reduced = false, options = {}) {
    const target = open ? 1 : 0;
    const speed = Math.max(.25, Math.min(3, open || !options.separateSpeeds ? options.armSpeed ?? 1 : options.foldSpeed ?? 1));
    progress = reduced ? target : Math.max(0, Math.min(1, progress + (open ? 1 : -1) * Math.max(0, dt) * speed / (open ? SCROLL_RIG.openSeconds : SCROLL_RIG.closeSeconds)));
    const desiredLift = SCROLL_RIG.lift * Math.max(progress>0 ? 1 : 0, clamp(options.facing ?? range(progress,0,.24)));
    const travel=SCROLL_RIG.lift*Math.max(0,dt)/(desiredLift>lift?.25:.35);
    lift=reduced?desiredLift:desiredLift>lift?Math.min(desiredLift,lift+travel):Math.max(desiredLift,lift-travel);
    return this.state;
  }, reset() { progress = 0; lift = 0; return this.state; },
  get state() { return {progress, lift, reach: range(progress, 0, .64) * range(lift / SCROLL_RIG.lift, .9, 1), unroll: range(progress, .78, 1), ready: progress >= .9999}; } };
}

// Both top rollers travel upward. Each guide folds into a nested, fixed-length
// pair parallel to the dowels; the carriage cannot pass its hinge until locked.
export function scrollPose(side, motion, target) {
  const width = Math.min(SCROLL_RIG.maxWidth,target.width), reach=motion.reach;
  const clearX=side*(SCROLL_RIG.radius+width/2+.16), storedY=-side*.48;
  let x=mix(0,clearX,range(reach,0,.2)), y=storedY, z=.2;
  if(reach>=.3)z=mix(.2,.36,range(reach,.3,.65));
  const orientation=range(reach,.65,1);
  // Keep a tilted screen's whole rectangle in front of the glass. Finite
  // carrier links bound the dolly, rather than changing their physical length.
  const targetZ=Math.max(.36,Math.min(2.1,target.z??.36));
  if(reach>=.65){x=mix(clearX,target.x,orientation);y=mix(storedY,target.y-target.height/2,orientation);z=mix(.36,targetZ,orientation);}
  const fold=range(motion.progress,.64,.78), height=mix(SCROLL_RIG.rodGap,target.height,motion.unroll);
  return {side,x,z,yaw:0,width,height,orientation,fixedY:y,movingY:y+height,centerY:y+height/2,direction:-1,
    fold,locked:fold>=.999999,guideLength:(target.height+SCROLL_RIG.rodGap+.04)/2,
    pole:range(reach,.2,.3),track:range(reach,.3,.65),roll:-target.height*motion.unroll/.035,radius:mix(.023,.015,motion.unroll)};
}

const add=(a,b)=>a.map((v,i)=>v+b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const norm=a=>mul(a,1/Math.max(1e-12,Math.hypot(...a)));
export function rotateScrollPoint(v,q={x:0,y:0,z:0,w:1}) {
  const u=[q.x,q.y,q.z], cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  return add(add(mul(u,2*dot(u,v)),mul(v,q.w*q.w-dot(u,u))),mul(cross,2*q.w));
}

export function railAssembly(pose,rotation) {
  const p=pose,side=p.side,gap=SCROLL_RIG.rodGap,theta=p.fold*Math.PI/2;
  const d1=[side*Math.cos(theta),Math.sin(theta),0],d2=[-d1[0],d1[1],0];
  const origin=[p.x-side*(p.width/2+.037),p.fixedY,p.z];
  const point=v=>add(origin,rotateScrollPoint(v,rotation));
  const hinge=mul(d1,p.guideLength),tip=add(hinge,mul(d2,p.guideLength));
  const travel=p.locked?p.height+gap:gap*(1+Math.sin(theta));
  const onRail=travel<=p.guideLength?mul(d1,travel):add(hinge,mul(d2,travel-p.guideLength));
  const offset= p.locked?[0,-gap,0]:add(mul(d1,-gap*Math.sin(theta)),[0,0,gap*Math.cos(theta)]);
  const upper=add(onRail,offset),center=mul(upper,.5);
  const section=travel<=p.guideLength?0:1,railDirection=section?d2:d1;
  const railNormal=[-railDirection[1],railDirection[0],0],railRadius=section?.011:.009;
  const rollerLocals=(section?[0]:[-.023,.023]).flatMap(z=>[-1,1].map(sign=>add(add(onRail,[0,0,z]),mul(railNormal,sign*(railRadius+.017)))));
  const lower=point([0,0,0]);
  const base=[side*.85,-side*.18,.2+.16*p.track];
  // Two equal rigid carrier links. A continuous pole turns their parking
  // plane toward the outward normal. Solve once; never rewrite a wrist.
  const linkLength=Math.max(.9,(.85+p.width/2+.037)*.8),maxReach=2*linkLength-.02;
  let delta=sub(lower,base),distance=Math.hypot(...delta),limited=false;
  if(distance>maxReach){const shift=mul(delta,maxReach/distance-1);origin.splice(0,3,...add(origin,shift));limited=true;delta=sub(point([0,0,0]),base);distance=Math.hypot(...delta);}
  const axis=norm(delta),pole=[0,side*(1-p.pole),p.pole];
  let perpendicular=sub(pole,mul(axis,dot(pole,axis)));
  if(Math.hypot(...perpendicular)<1e-6)perpendicular=sub([0,0,-1],mul(axis,-axis[2]));
  perpendicular=norm(perpendicular);
  const elbow=add(add(base,mul(delta,.5)),mul(perpendicular,Math.sqrt(Math.max(0,linkLength**2-distance**2/4))));
  // Re-evaluate all endpoints after a bounded travel clamp through one origin.
  return {point,origin,limited,base,elbow,lower:point([0,0,0]),upper:point(upper),carriage:point(onRail),
    hinge:point(hinge),tip:point(tip),rails:[...[-.023,.023].map(z=>[point([0,0,z]),point(add(hinge,[0,0,z])),.009]),[point(hinge),point(tip),.011]],
    screen:point(add(center,[side*(p.width/2+.037),0,.008])),upperLocal:upper,
    links:[[base,elbow,.009],[elbow,point([0,0,0]),.009]],linkLength,carriageTravel:travel,
    rollers:rollerLocals.map(v=>({center:point(v),axle:[point(add(v,[0,0,-.007])),point(add(v,[0,0,.007]))],radius:.017})),
    mountingLength:Math.hypot(...offset),railLengths:[p.guideLength,p.guideLength]};
}

export function faceExposure(normalFacing) { return range(normalFacing, .45, .94); }

export function scrollViewport({width, height, availableRight = width, top = 110, fit = false, glassLeft = width / 2 - 250, glassRight = width / 2 + 250, glassCenterY = height / 2}) {
  const end = Math.max(0, Math.min(width, availableRight)), margin = end<680?18:40, compact = end < 1050;
  const usable = Math.max(1,end-2*margin),narrow=end<680,stacked=false;
  const panelTop = Math.min(Math.max(12,top),Math.max(12,height-160));
  const bottom=58; // Keep the site's fixed bottom action buttons accessible.
  const heightLimit=Math.max(1,Math.min(TABLET_SCREENS[0].height,height-panelTop-bottom,compact?height*(narrow?.38:.54):Infinity));
  const scale=Math.max(.01,Math.min(1,heightLimit/TABLET_SCREENS[0].height,(usable-12)/(TABLET_SCREENS[0].width+TABLET_SCREENS[1].width)));
  const leftWidth=TABLET_SCREENS[0].width*scale,rightWidth=TABLET_SCREENS[1].width*scale,panelHeight=TABLET_SCREENS[0].height*scale;
  const bound = (n,lo,hi) => Math.max(lo,Math.min(hi,n)), gap = 32;
  let zoom = 1, offset = (width - end) / 2;
  if (fit && !narrow && end - 2*margin-leftWidth-rightWidth-2*gap > 200) {
    const diameter = Math.max(1, glassRight-glassLeft), free = end-2*margin-leftWidth-rightWidth-2*gap;
    zoom = Math.min(1,free/diameter);
    offset = width/2 + ((glassLeft+glassRight)/2-width/2)*zoom - (end+leftWidth-rightWidth)/2;
  }
  const rimLeft = width/2+(glassLeft-width/2)*zoom-offset, rimRight = width/2+(glassRight-width/2)*zoom-offset;
  const y = bound(glassCenterY-panelHeight/2,panelTop,height-panelHeight-bottom);
  const left = {x:bound(rimLeft-gap-leftWidth,margin,end-margin-leftWidth),y,width:leftWidth,height:panelHeight};
  const right = {x:bound(rimRight+gap,margin,end-margin-rightWidth),y,width:rightWidth,height:panelHeight};
  return {left,right,compact,narrow,stacked,zoom,offset,dockLeft:(rimLeft+rimRight)/2,hidden:end<300};
}

// Project the immutable pixel rectangle for native text-editor placement; display pixels stay on the mesh.
export function quadMatrix(points, width, height) {
  if (!(width > 0 && height > 0) || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const [a,b,c,d] = points, dx1 = b.x-c.x, dx2 = d.x-c.x, dx3 = a.x-b.x+c.x-d.x;
  const dy1 = b.y-c.y, dy2 = d.y-c.y, dy3 = a.y-b.y+c.y-d.y, det = dx1*dy2-dx2*dy1;
  if (Math.abs(det) < 1e-7) return null;
  const g = (dx3*dy2-dx2*dy3)/det, h = (dx1*dy3-dx3*dy1)/det;
  return [(b.x-a.x+g*b.x)/width,(b.y-a.y+g*b.y)/width,0,g/width,
    (d.x-a.x+h*d.x)/height,(d.y-a.y+h*d.y)/height,0,h/height,0,0,1,0,a.x,a.y,0,1];
}
