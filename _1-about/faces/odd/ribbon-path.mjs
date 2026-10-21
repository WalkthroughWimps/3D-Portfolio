import {solveReelRoute,guideArcPoint,tangentRunPoint} from './reel-route.mjs?v=smooth-winding-1';
export const RIBBON = Object.freeze({halfSpan:.72, width:.065, lanePitch:.075, foldedWidth:.028, lanes:4, rows:256, columns:8, secondsInView:15, frontDepth:.245, reelLift:-.03, recess:-.24, coreRadius:.085, fullRadius:.160, flangeRadius:.185, dividerRadius:.172, frontWheelRadius:.075, guideX:.744, takeup:[-.32,.32], supply:[.32,-.32]});
// The tape's centerline leaves clearance around each guide cylinder.
export const GUIDE = Object.freeze({centerZ:.227, radius:.017, tapeRadius:.0185, approachEnd:.16, wrapEnd:.44});
export const FOLDERS = Object.freeze({centers:[.68,.68,.68,.68],length:.08,outerHeight:.073,outerBack:.125,outerFront:.033,entryHeight:.069,exitHeight:.035,entryDepth:.010,exitDepth:.014,wall:.002,axialShare:.90,entryU:.51,exitU:.66,guideStartU:.69,guideEndU:.82});
export const EXIT_GUIDE=Object.freeze({x:.61,tapeRadius:.028,bodyRadius:.012,bodyLength:.021});
export const REEL_FRAMES=Object.freeze({takeup:{angle:Math.PI/12,lift:.01},supply:{angle:-Math.PI/12,lift:-.002}});
export function reelPoint(x,y,z,takeup=false){const frame=takeup?REEL_FRAMES.takeup:REEL_FRAMES.supply,center=takeup?RIBBON.takeup:RIBBON.supply,c=Math.cos(frame.angle),s=Math.sin(frame.angle);return {x:center[0]+c*x+s*z,y:center[1]+y,z:RIBBON.reelLift+frame.lift-s*x+c*z};}
export const laneHeight = lane => RIBBON.lanePitch * (1.5 - lane);
export const laneDepth = (lane,takeup=false) => .059 + (takeup?3-lane:lane) * .037;
export const secondsAtX = (x,position) => position+x*RIBBON.secondsInView/(2*RIBBON.halfSpan);
export const clipX = (seconds,position) => (seconds-position)*2*RIBBON.halfSpan/RIBBON.secondsInView;
const smooth = t => {const f=Math.max(0,Math.min(1,t));return f*f*(3-2*f);};
// One half stays flat while the other turns over the center crease.
export function foldedOffset(u,fold){const half=(u-.5)*RIBBON.width,angle=fold*Math.PI,compression=1-fold*(1-RIBBON.foldedWidth/(RIBBON.width/2));return {across:((u<=.5?half:half*Math.cos(angle))+fold*RIBBON.width/4)*compression,lift:u<=.5?0:half*Math.sin(angle)+fold*.0012*Math.min(1,(u-.5)*20)};}
export function reelRadii(position) {
  const fraction = Math.max(0, Math.min(1, position / 60));
  // The square of the wound radius follows the amount of remaining fabric.
  const {coreRadius:core,fullRadius:full}=RIBBON;
  return {supply:Math.sqrt(core ** 2 + (full ** 2 - core ** 2) * (1 - fraction)), takeup:Math.sqrt(core ** 2 + (full ** 2 - core ** 2) * fraction)};
}
export function reelAngle(position, takeup = false) {
  const radii=reelRadii(position),slope=(RIBBON.fullRadius**2-RIBBON.coreRadius**2)/60,speed=RIBBON.halfSpan*2/RIBBON.secondsInView;
  const base=takeup?-2*speed*(radii.takeup-RIBBON.coreRadius)/slope:-2*speed*(radii.supply-RIBBON.fullRadius)/slope;
  return -base+(takeup?1:-1)*speed*(position<0?position:position>60?position-60:0)/(takeup?radii.takeup:radii.supply);
}
function cubic(a,b,c,d,t){const s=1-t;return s*s*s*a+3*s*s*t*b+3*s*t*t*c+t*t*t*d;}
export const folderEndX=(side,lane,input=false)=>side*(FOLDERS.centers[lane]+(input?1:-1)*FOLDERS.length/2);
const routeCache=new Map();
const folderDepthCache=new Map();
export function folderExitDepth(side,lane){
  const key=side+':'+lane;if(folderDepthCache.has(key))return folderDepthCache.get(key);
  const takeup=side<0,frame=takeup?REEL_FRAMES.takeup:REEL_FRAMES.supply,center=takeup?RIBBON.takeup:RIBBON.supply,rear=GUIDE.centerZ-GUIDE.tapeRadius;
  const plan=solveReelRoute({side,laneY:laneHeight(lane),radius:(RIBBON.coreRadius+RIBBON.fullRadius)/2+.002,axial:laneDepth(lane,takeup),reelCenter:center,frameAngle:frame.angle,frameLift:frame.lift,reelLift:RIBBON.reelLift,rearZ:rear,guideX:EXIT_GUIDE.x,guideRadius:EXIT_GUIDE.tapeRadius});
  const planeB=RIBBON.reelLift+frame.lift+(plan.axial-Math.sin(frame.angle)*(plan.B.x-center[0]))/Math.cos(frame.angle);
  const depth=Math.min(.232,rear+(planeB-rear)*FOLDERS.axialShare);folderDepthCache.set(key,depth);return depth;
}
// Fit a continuous thin shell around the actual folding surface, including
// the wing's longitudinal sweep when the tape changes axial depth.
const folderProfiles=new Map();
export function folderChannelProfile(side,lane){
  const key=side+':'+lane;if(folderProfiles.has(key))return folderProfiles.get(key);
  const count=24,rear=GUIDE.centerZ-GUIDE.tapeRadius,wall=FOLDERS.wall;
  const bins=Array.from({length:count},()=>({half:0,back:Infinity,front:-Infinity}));
  const start=side<0?.30-.12*FOLDERS.guideStartU:.70+.12*GUIDE.wrapEnd;
  const end=side<0?.30-.12*GUIDE.wrapEnd:.70+.12*FOLDERS.guideStartU;
  const point=(t,u)=>{
    const p=ribbonPoint(t,30,0,lane),a=ribbonPoint(t-.00001,30,0,lane),b=ribbonPoint(t+.00001,30,0,lane);
    let tx=b.x-a.x,ty=b.y-a.y,tz=b.z-a.z;const length=Math.hypot(tx,ty,tz);tx/=length;ty/=length;tz/=length;
    let wx=p.widthX||0,wy=p.widthY,wz=p.widthZ;const dot=wx*tx+wy*ty+wz*tz;wx-=tx*dot;wy-=ty*dot;wz-=tz*dot;const width=Math.hypot(wx,wy,wz);wx/=width;wy/=width;wz/=width;
    const nx=ty*wz-tz*wy,ny=tz*wx-tx*wz,nz=tx*wy-ty*wx,f=foldedOffset(u,p.fold);
    return {q:(side*FOLDERS.centers[lane]+side*FOLDERS.length/2-(p.x+wx*f.across+nx*f.lift))*side/FOLDERS.length,y:Math.abs(p.y-laneHeight(lane)+wy*f.across+ny*f.lift),z:p.z+wz*f.across+nz*f.lift-rear};
  };
  // Include the real mesh triangles' full bounding extents in every crossed
  // longitudinal cell. Their interiors then fit even between source rows.
  const first=Math.max(0,Math.floor(start*RIBBON.rows)),last=Math.min(RIBBON.rows,Math.ceil(end*RIBBON.rows));
  for(let row=first;row<last;row++)for(let col=0;col<RIBBON.columns;col++){
    const a=point(row/RIBBON.rows,col/RIBBON.columns),b=point((row+1)/RIBBON.rows,col/RIBBON.columns),c=point(row/RIBBON.rows,(col+1)/RIBBON.columns),d=point((row+1)/RIBBON.rows,(col+1)/RIBBON.columns);
    for(const triangle of [[a,b,c],[b,d,c]]){
      const lo=Math.max(0,Math.floor(Math.min(...triangle.map(p=>p.q))*count)),hi=Math.min(count-1,Math.floor(Math.max(...triangle.map(p=>p.q))*count));
      for(let i=lo;i<=hi;i++){const bin=bins[i];bin.half=Math.max(bin.half,...triangle.map(p=>p.y));bin.back=Math.min(bin.back,...triangle.map(p=>p.z));bin.front=Math.max(bin.front,...triangle.map(p=>p.z));}
    }
  }
  const profile=Array.from({length:count+1},(_,i)=>{
    const around=bins.slice(Math.max(0,i-2),Math.min(count,i+2)),half=Math.max(...around.map(b=>b.half))+.0015,back=Math.min(...around.map(b=>b.back))-.002,front=Math.max(...around.map(b=>b.front))+.002;
    return [i/count,half,back,front,half+wall,back-wall,front+wall];
  });
  // A convex envelope removes little sampling ledges from the housing: its
  // outline has broad continuous slopes instead of a staircase at the mouth.
  const envelope=(column,upper)=>{
    const hull=[];
    for(const station of profile){const p=[station[0],station[column]];while(hull.length>1){const a=hull[hull.length-2],b=hull[hull.length-1],cross=(b[0]-a[0])*(p[1]-b[1])-(b[1]-a[1])*(p[0]-b[0]);if(upper?cross<0:cross>0)break;hull.pop();}hull.push(p);}
    return x=>{let i=0;while(i<hull.length-2&&x>hull[i+1][0])i++;const a=hull[i],b=hull[i+1];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);};
  };
  const half=envelope(1,true),back=envelope(2,false),front=envelope(3,true);
  for(const station of profile){const q=station[0];station[1]=half(q);station[2]=back(q);station[3]=front(q);station[4]=station[1]+wall;station[5]=station[2]-wall;station[6]=station[3]+wall;}
  folderProfiles.set(key,profile);return profile;
}
export function reelRoutePlan(side,lane,radius){
  const key=side+':'+lane,cached=routeCache.get(key);if(cached?.radius===radius)return cached.plan;
  const takeup=side<0,frame=takeup?REEL_FRAMES.takeup:REEL_FRAMES.supply;
  const plan=solveReelRoute({side,laneY:laneHeight(lane),radius:radius+.002,axial:laneDepth(lane,takeup),reelCenter:takeup?RIBBON.takeup:RIBBON.supply,frameAngle:frame.angle,frameLift:frame.lift,reelLift:RIBBON.reelLift,rearZ:folderExitDepth(side,lane),guideX:EXIT_GUIDE.x,guideRadius:EXIT_GUIDE.tapeRadius});
  routeCache.set(key,{radius,plan});return plan;
}
function guideRoute(u,side,lane,radius){
  const h=laneHeight(lane),cx=side*RIBBON.guideX,front=RIBBON.frontDepth,top=GUIDE.centerZ+GUIDE.tapeRadius,rear=GUIDE.centerZ-GUIDE.tapeRadius;
  let x,y=h,z,fold=0,widthX=0,widthY=1,widthZ=0;
  if(u<GUIDE.approachEnd){
    const v=u/GUIDE.approachEnd;
    x=side*(RIBBON.halfSpan+(RIBBON.guideX-RIBBON.halfSpan)*v);
    // Meet the bed's shallow crown and leave horizontally at the roller tangent.
    z=cubic(front,front-.00022,top,top,v);
  }else if(u<GUIDE.wrapEnd){
    const angle=Math.PI*(u-GUIDE.approachEnd)/(GUIDE.wrapEnd-GUIDE.approachEnd);
    x=cx+side*GUIDE.tapeRadius*Math.sin(angle);z=GUIDE.centerZ+GUIDE.tapeRadius*Math.cos(angle);
  }else if(u<FOLDERS.entryU){
    const v=(u-GUIDE.wrapEnd)/(FOLDERS.entryU-GUIDE.wrapEnd);
    x=side*RIBBON.guideX+(folderEndX(side,lane,true)-side*RIBBON.guideX)*v;z=rear;
  }else if(u<FOLDERS.exitU){
    const v=(u-FOLDERS.entryU)/(FOLDERS.exitU-FOLDERS.entryU);
    x=folderEndX(side,lane,true)+(folderEndX(side,lane)-folderEndX(side,lane,true))*v;
    z=rear+(folderExitDepth(side,lane)-rear)*smooth(v);fold=smooth(v);
  }else if(u<FOLDERS.guideStartU){
    const v=(u-FOLDERS.exitU)/(FOLDERS.guideStartU-FOLDERS.exitU);
    x=folderEndX(side,lane)+(side*EXIT_GUIDE.x-folderEndX(side,lane))*v;z=folderExitDepth(side,lane);fold=1;
    const roll=.15*smooth(v),turn=roll*Math.PI/2,frame=side<0?REEL_FRAMES.takeup:REEL_FRAMES.supply;
    widthX=Math.sin(frame.angle)*Math.sin(turn);widthY=Math.cos(turn);widthZ=Math.cos(frame.angle)*Math.sin(turn);
  }else{
    const plan=reelRoutePlan(side,lane,radius),frame=side<0?REEL_FRAMES.takeup:REEL_FRAMES.supply;
    let roll;
    if(u<FOLDERS.guideEndU){
      const v=(u-FOLDERS.guideStartU)/(FOLDERS.guideEndU-FOLDERS.guideStartU),p=guideArcPoint(plan,v);({x,y,z}=p);roll=.15+.35*smooth(v);
    }else{
      const v=(u-FOLDERS.guideEndU)/(1-FOLDERS.guideEndU),p=tangentRunPoint(plan,v);({x,y,z}=p);roll=.5+.5*smooth(v);
    }
    const turn=roll*Math.PI/2;
    widthX=Math.sin(frame.angle)*Math.sin(turn);widthY=Math.cos(turn);widthZ=Math.cos(frame.angle)*Math.sin(turn);fold=1;
  }
  return {x,y,z,widthX,widthY,widthZ,fold};
}
export function ribbonPoint(t, position, flex = 0, lane = 0) {
  const radii=reelRadii(position),left=radii.takeup,right=radii.supply,h=laneHeight(lane),front=RIBBON.frontDepth,span=RIBBON.halfSpan;
  let x,y,z,free=0,seconds,widthX=0,widthY=0,widthZ=1,fold=1;
  if(t<.18){
    const f=t/.18,angle=reelRoutePlan(-1,lane,left).theta+Math.PI*2*(1-f),radius=left+.002-.006*(1-smooth(f/.20)),p=reelPoint(radius*Math.cos(angle),radius*Math.sin(angle),laneDepth(lane,true),true);({x,y,z}=p);widthX=Math.sin(REEL_FRAMES.takeup.angle);widthZ=Math.cos(REEL_FRAMES.takeup.angle);
    seconds=position-7.5-(.30-t)*18;
  }else if(t<.30){
    const route=guideRoute((.30-t)/.12,-1,lane,left);({x,y,z,widthX,widthY,widthZ,fold}=route);seconds=position-7.5-(.30-t)*18;
  }else if(t<=.70){
    const f=(t-.30)/.40;x=-span+f*2*span;y=h;free=Math.sin(Math.PI*f)**2;
    z=front+.004*Math.sin(Math.PI*f)+flex*free;seconds=secondsAtX(x,position);widthY=1;widthZ=0;fold=0;
  }else if(t<=.82){
    const route=guideRoute((t-.70)/.12,1,lane,right);({x,y,z,widthX,widthY,widthZ,fold}=route);seconds=position+7.5+(t-.70)*18;
  }else{
    const f=(t-.82)/.18,angle=reelRoutePlan(1,lane,right).theta+f*Math.PI*2,radius=right+.002-.006*smooth((f-.80)/.20),p=reelPoint(radius*Math.cos(angle),radius*Math.sin(angle),laneDepth(lane));({x,y,z}=p);widthX=Math.sin(REEL_FRAMES.supply.angle);widthZ=Math.cos(REEL_FRAMES.supply.angle);
    seconds=position+7.5+(t-.70)*18;
  }
  return {x,y,z,free,seconds,widthX,widthY,widthZ,fold};
}

/** Damped bending offsets for a guided ribbon; the drums remain fixed constraints. */
export function createRibbonFlex(count = 33) {
  const offsets = new Float32Array(count), velocities = new Float32Array(count);
  return {
    offsets,
    step(dt, moving, phase, reduced = false) {
      if (reduced) { offsets.fill(0); velocities.fill(0); return; }
      const steps = Math.max(1, Math.ceil(Math.min(.05, Math.max(0, dt)) * 120)), h = Math.min(.05, Math.max(0, dt)) / steps;
      for (let step = 0; step < steps; step++) {
        for (let i = 1; i < count - 1; i++) {
          const bend = offsets[i - 1] + offsets[i + 1] - 2 * offsets[i];
          const drive = moving ? .045 * Math.sin(phase * 9 - i * .48) : 0;
          velocities[i] += (-100 * offsets[i] + 65 * bend - 12 * velocities[i] + drive) * h;
        }
        for (let i = 1; i < count - 1; i++) offsets[i] = Math.max(-.006, Math.min(.006, offsets[i] + velocities[i] * h));
      }
    },
    sample(t) { const x = Math.max(0, Math.min(count - 1, t * (count - 1))), i = Math.floor(x); return offsets[i] * (1 - x + i) + offsets[Math.min(count - 1, i + 1)] * (x - i); },
    get settled() { return offsets.every(x => Math.abs(x) < .000002) && velocities.every(x => Math.abs(x) < .00002); }
  };
}
