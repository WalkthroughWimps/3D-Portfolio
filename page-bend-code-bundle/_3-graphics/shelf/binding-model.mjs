import {WIDTH,HEIGHT,SHEETS} from './page-geometry.mjs';

export const DEFAULT_BINDING=Object.freeze({pageThickness:.007,coverThickness:.022,coverFlex:.22,bookFlex:.25,
  jointInset:.08,jointDepth:.45,spineRound:.55,spineLift:.35,spineMobility:.65,overhang:.025,spineType:'sewn'});
export const MIN_PROGRESS=-1;
export const MAX_PROGRESS=SHEETS+1;
export const SPINE_SEGMENTS=40; // Four mesh spans per fixed hinge interval.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const nearestAngle=(a,target)=>target+Math.atan2(Math.sin(a-target),Math.cos(a-target));

export function phaseAt(progress){
  const p=clamp(progress,MIN_PROGRESS,MAX_PROGRESS);
  const frontOpen=clamp(p+1),backClose=clamp(p-SHEETS);
  return {progress:p,pageProgress:clamp(p,0,SHEETS),frontAngle:Math.PI*frontOpen,backAngle:Math.PI*backClose,
    opening:Math.sin((frontOpen-backClose)*Math.PI/2),frontClosure:1-frontOpen,backClosure:backClose,
    closed:p<=MIN_PROGRESS+.00001||p>=MAX_PROGRESS-.00001};
}

export function bindingModel(progress,settings={},pageFlex=.8,flexPose=0,sourceTurns=null,sourceFlipStrength=null){
  const c={...DEFAULT_BINDING,...settings};
  for(const key of ['coverFlex','bookFlex','jointDepth','spineRound','spineLift','spineMobility'])c[key]=clamp(c[key]);
  c.pageThickness=clamp(c.pageThickness,.002,.030);c.coverThickness=clamp(c.coverThickness,.004,.05);
  c.jointInset=clamp(c.jointInset,.015,.24);c.overhang=clamp(c.overhang,.005,.07);
  const ordinary=phaseAt(progress),overrides=sourceTurns&&sourceTurns.length===SHEETS+2?sourceTurns.map(t=>clamp(t)):null;
  const phase=overrides?{...ordinary,pageProgress:overrides.slice(1,-1).reduce((n,t)=>n+t,0),frontAngle:Math.PI*overrides[0],backAngle:Math.PI*overrides.at(-1),
    frontClosure:1-overrides[0],backClosure:overrides.at(-1),opening:Math.sin((overrides[0]-overrides.at(-1))*Math.PI/2),closed:overrides[0]<1e-6||overrides.at(-1)>1-1e-6}:ordinary;
  const open=phase.opening,balance=phase.pageProgress/SHEETS*2-1;
  const gap=.0015,joinGap=.002;
  const blockHeight=SHEETS*c.pageThickness+(SHEETS-1)*gap;
  const closedChord=blockHeight+c.coverThickness+joinGap*2;
  const rounded=c.spineType!=='square';
  // Material hinge stations are constructed ONCE for a given thickness. Each
  // interval is a rigid link; a turn can rotate it, never rescale/reparameterize
  // it. The old global-length constraint allowed individual intervals to slide.
  const ys=[-closedChord/2,...Array.from({length:SHEETS},(_,i)=>-closedChord/2+c.coverThickness/2+joinGap+i*(c.pageThickness+gap)+c.pageThickness/2),closedChord/2];
  const rest=ys.map(y=>({x:rounded?-closedChord*.5*c.spineRound*Math.sqrt(Math.max(0,1-(y*2/closedChord)**2)):0,y}));
  const hingeRestLengths=rest.slice(1).map((p,i)=>Math.hypot(p.x-rest[i].x,p.y-rest[i].y));
  const restAngles=rest.slice(1).map((p,i)=>Math.atan2(p.y-rest[i].y,p.x-rest[i].x));
  const turns=overrides?overrides.slice(1,-1):Array.from({length:SHEETS},(_,i)=>clamp(phase.pageProgress-i));
  const raw=[phase.backAngle,...turns.slice().reverse().map(t=>Math.PI*t),phase.frontAngle];
  // Neighboring leaves transmit their turning load through the same spine.
  // Smooth the angular field, not the hinge positions or their rest lengths.
  const spread=.65+c.spineMobility*.85+c.bookFlex*.25;
  const rotations=raw.map((angle,i)=>{
    if(i===0||i===raw.length-1)return angle;
    let weight=0,total=0;
    for(let j=0;j<raw.length;j++){const w=Math.exp(-.5*((j-i)/spread)**2);total+=raw[j]*w;weight+=w;}
    return total/weight;
  });
  const rock=balance*.065*c.bookFlex*c.spineMobility*open;
  const hinges=[{x:0,y:0}];
  for(let i=0;i<hingeRestLengths.length;i++){
    const q=(i+.5)/hingeRestLengths.length;
    const angle=restAngles[i]+(rotations[i]+rotations[i+1])/2+rock+c.spineLift*.24*open*Math.sin(2*Math.PI*q);
    const previous=hinges.at(-1),length=hingeRestLengths[i];
    hinges.push({x:previous.x+Math.cos(angle)*length,y:previous.y+Math.sin(angle)*length});
  }
  const center={x:(hinges[0].x+hinges.at(-1).x)/2,y:(hinges[0].y+hinges.at(-1).y)/2};
  for(const p of hinges){p.x-=center.x;p.y-=center.y;}
  const innerPoint=q=>chainPoint(hinges,q);
  // A hollow case has a separate slack strip, with its own fixed segment
  // lengths. Endpoint-constrained FABRIK lets it lift off the sewn liner.
  let casePoints=hinges,caseRestLengths=hingeRestLengths;
  if(c.spineType==='hollow'){
    const offset=.004+c.coverThickness*.35;
    const restCase=Array.from({length:SPINE_SEGMENTS+1},(_,i)=>{
      const q=i/SPINE_SEGMENTS,p=chainPoint(rest,q),d=offset*Math.sin(Math.PI*q);
      return {x:p.x-Math.sin(p.angle)*d,y:p.y+Math.cos(p.angle)*d};
    });
    caseRestLengths=restCase.slice(1).map((p,i)=>Math.hypot(p.x-restCase[i].x,p.y-restCase[i].y));
    const guide=Array.from({length:SPINE_SEGMENTS+1},(_,i)=>{
      const q=i/SPINE_SEGMENTS,p=innerPoint(q),d=(offset+open*c.spineLift*.018)*Math.sin(Math.PI*q);
      return {x:p.x-Math.sin(p.angle)*d,y:p.y+Math.cos(p.angle)*d};
    });
    casePoints=constrainChain(guide,caseRestLengths,hinges[0],hinges.at(-1));
  }
  const point=(q,inner=false)=>inner?innerPoint(q):chainPoint(casePoints,q);
  const restLength=caseRestLengths.reduce((a,b)=>a+b,0);
  const chord=Math.hypot(hinges.at(-1).x-hinges[0].x,hinges.at(-1).y-hinges[0].y);
  const frontJoint=point(1),backJoint=point(0);
  const frontJointAngle=nearestAngle(frontJoint.angle,phase.frontAngle);
  const backJointAngle=nearestAngle(backJoint.angle+Math.PI,phase.backAngle);
  const boardTilt=open*(.025+.12*c.bookFlex);
  const frontBoard=phase.frontAngle+boardTilt+rock,backBoard=phase.backAngle-boardTilt+rock;
  const curvature=clamp(flexPose,-1,1)*c.bookFlex*(.25+.75*c.coverFlex)*.42/WIDTH;
  // The narrow hinge chain stays inextensible under the review load. Flex
  // accumulates smoothly beyond it into both cover boards and leaf bodies.
  const bindingExtent=Math.max(...hinges.map(p=>Math.abs(p.x)),...casePoints.map(p=>Math.abs(p.x)))+.015;
  const warp=(x,y)=>{
    const sign=Math.sign(x),s=Math.max(0,Math.abs(x)-bindingExtent),a=curvature*sign*s;
    return Math.abs(curvature)<1e-10||s===0?{x,y,rotation:0}:{x:sign*bindingExtent+Math.sin(a)/curvature-y*Math.sin(a),y:(1-Math.cos(a))/curvature+y*Math.cos(a),rotation:a};
  };
  // Establish a common support plane from the binding, not a separate lift
  // for each board. Cover foreedges will settle onto this plane under load.
  const tableY=Math.min(frontJoint.y-c.coverThickness/2,backJoint.y-c.coverThickness/2,
    ...hinges.map(p=>p.y-c.pageThickness/2),
    ...Array.from({length:SPINE_SEGMENTS+1},(_,i)=>{const p=point(i/SPINE_SEGMENTS);return p.y-Math.abs(Math.cos(p.angle))*Math.min(c.coverThickness,.018)/2;}));
  const coverCache=new Map();
  const cover=(side,nx=48)=>{
    const cacheKey=side+nx;if(coverCache.has(cacheKey))return coverCache.get(cacheKey);
    const front=side==='front',origin=front?frontJoint:backJoint;
    const rootAngle=front?frontJointAngle:backJointAngle,boardAngle=front?frontBoard:backBoard;
    const sign=front?1:-1,width=WIDTH+c.overhang;
    const freeProfile=integratedProfile(origin,width,nx,(u,s)=>{
      const hinge=Math.exp(-s/(c.jointInset*.7));
      return lerp(boardAngle,rootAngle,hinge)+sign*c.coverFlex*.11*open*Math.sin(Math.PI*u);
    });
    const landed=front?smooth(.76,1,1-phase.frontClosure):1-smooth(0,.24,phase.backClosure);
    const closing=front?smooth(.82,1,phase.frontClosure):smooth(.82,1,phase.backClosure);
    const scale=c.jointInset*(.48+.35*c.coverFlex),plane=tableY+c.coverThickness/2;
    const thicknessAt=u=>c.coverThickness*(1-c.jointDepth*.6*Math.exp(-Math.pow((u*width-c.jointInset)/.022,2)));
    // Source Page Time can turn a cover and its neighboring leaf together.
    // Give the coupled leaf solve a provisional free board to avoid a circular
    // cover -> leaf -> cover seating dependency during that fan motion.
    if(overrides)coverCache.set(cacheKey,{width,height:HEIGHT+c.overhang*2,thickness:c.coverThickness,profile:freeProfile,warp,contactWeight:landed,closingWeight:closing,thicknessAt});
    const rootSlope=Math.sin(rootAngle);
    const groundedHeight=s=>{
      const u=s/width,flex=.1+c.coverFlex*.75;
      const baseline=plane+(origin.y-plane)*lerp(1-u,(1-u)**2,flex);
      const initialSlope=-(origin.y-plane)/width*(1+flex);
      const hinge=(rootSlope-initialSlope)*s*Math.exp(-s/scale)*(1-u)**2;
      // Unilateral table support: the board can leave the table, never sink
      // through it. Segment lengths are recovered in horizontal projection.
      return Math.max(plane,baseline+hinge);
    };
    let closedHeight=null;
    if(closing>0){
      // The closing board follows the actual outermost leaf, not an unrelated
      // nominal opening angle. Only the supported side is evaluated by that
      // leaf, so this does not introduce a page/cover solve cycle.
      const leaf=page(front?0:SHEETS-1),clearance=.0004;
      const surface=s=>{const p=leaf.profile(Math.min(1,s/WIDTH));return p.y+Math.abs(Math.cos(p.angle))*c.pageThickness/2+c.coverThickness/2+clearance;};
      const correction=origin.y-surface(0);
      const seated=s=>surface(s)+correction*Math.exp(-s/scale);
      const slope=(seated(.0001)-seated(0))/.0001;
      const reach=Math.max(width/nx*3,c.jointInset*1.5);
      closedHeight=s=>Math.max(surface(s),seated(s)+(rootSlope-slope)*s*Math.exp(-s/scale)*Math.max(0,1-s/reach)**3);
    }
    const profile=landed>0||closing>0?profileFromHeights(origin,width,nx,s=>{
      const free=freeProfile(s/width).y;
      return closing>0?lerp(free,closedHeight(s),closing):lerp(free,groundedHeight(s),landed);
    },Math.cos(boardAngle)>=0?1:-1,rootAngle):freeProfile;
    const result={width,height:HEIGHT+c.overhang*2,thickness:c.coverThickness,profile,warp,
      contactWeight:landed,closingWeight:closing,
      thicknessAt};
    coverCache.set(cacheKey,result);return result;
  };
  const pageCache=new Map();
  const page=(index,nx=32)=>{
    const cacheKey=index+':'+nx;if(pageCache.has(cacheKey))return pageCache.get(cacheKey);
    const station=SHEETS-index,q=station/(SHEETS+1);
    const origin=point(q,true),turn=turns[index],bend=clamp(pageFlex);
    const rootAngle=rotations[station]+rock;
    const pressure=turns.reduce((sum,t,j)=>sum+Math.sin(Math.PI*t)*Math.exp(-Math.abs(j-index)/1.7)*(j===index?.35:1),0);
    // A curved root curve alone does not preserve stack order: each leaf must
    // also settle onto its own layer above the board. Solve a gentle shoulder
    // angle to hit that layer, retaining fixed-length tangent integration.
    const shoulder=(c.jointInset+.08+blockHeight*.5)*(1-.4*Math.max(phase.frontClosure,phase.backClosure));
    const flatAngle=side=>{
      const isFront=side==='front',board=cover(side),angle=board.profile(1).angle;
      const nxNormal=-Math.sin(angle),nyNormal=Math.cos(angle);
      const layer=c.coverThickness/2+joinGap+(isFront?index:SHEETS-1-index)*(c.pageThickness+gap)+c.pageThickness/2;
      const tip=board.profile(WIDTH/board.width);
      const target=tip.x*nxNormal+tip.y*nyNormal+(isFront?-layer:layer);
      const weight=s=>(1-Math.exp(-s/.035))*lerp(1,.08+.92*Math.exp(-s/shoulder),bend);
      const baseline=s=>{
        const rooted=Math.exp(-s/lerp(.025,shoulder,bend));
        const boardAngle=board.profile(s/board.width).angle;
        const sharedLift=(isFront?-1:1)*pressure*bend*(.11+blockHeight*.35)*Math.sin(Math.PI*s/(shoulder*2))*Math.exp(-s/shoulder);
        return lerp(boardAngle,rootAngle,rooted)+sharedLift;
      };
      const endProjection=amplitude=>{
        let x=origin.x,y=origin.y;
        for(let j=0;j<nx;j++){const s=(j+.5)*WIDTH/nx,a=baseline(s)+amplitude*weight(s);x+=Math.cos(a)*WIDTH/nx;y+=Math.sin(a)*WIDTH/nx;}
        return x*nxNormal+y*nyNormal;
      };
      let low=-1.35,high=1.35;
      for(let j=0;j<22;j++){const mid=(low+high)/2;if(endProjection(mid)>target)high=mid;else low=mid;}
      const amplitude=(low+high)/2;
      return s=>baseline(s)+amplitude*weight(s);
    };
    const rightAngle=turn<1?flatAngle('back'):null,leftAngle=turn>0?flatAngle('front'):null;
    const curl=sourceFlipStrength===null?1:clamp(sourceFlipStrength/.05,-2,2);
    const profile=integratedProfile(origin,WIDTH,nx,(u,s)=>(turn===0?rightAngle(s):turn===1?leftAngle(s):lerp(rightAngle(s),leftAngle(s),turn))+.82*bend*curl*Math.sin(Math.PI*turn)*Math.sin(Math.PI*u)*(1-2*u));
    const result={width:WIDTH,height:HEIGHT,thickness:c.pageThickness,profile,warp,q,turn,root:origin,hingeAngle:rootAngle,pressure};
    pageCache.set(cacheKey,result);return result;
  };
  const spine=(inner=false)=>({width:inner?hingeRestLengths.reduce((a,b)=>a+b,0):restLength,height:HEIGHT+c.overhang*2,thickness:inner?.003:Math.min(c.coverThickness,.018),profile:u=>point(u,inner),warp});
  const proxy=nx=>({width:WIDTH,height:HEIGHT,thickness:blockHeight,
    profile:integratedProfile({x:0,y:0},WIDTH,nx,()=>phase.backClosure>.5?Math.PI:0),warp});
  return {settings:c,phase,point,cover,page,spine,proxy,warp,chord,restLength,blockHeight,
    closedThickness:closedChord+c.coverThickness,frontJoint,backJoint,hinges,hingeRestLengths,caseRestLengths,rotations,tableY};
}

// Heights encode support/contact. Recover x from each fixed material length,
// rather than pushing vertices vertically and stretching the board.
function profileFromHeights(origin,width,segments,heightAt,direction,rootAngle){
  const points=[{...origin,angle:rootAngle}],ds=width/segments;
  for(let i=1;i<=segments;i++){
    const previous=points.at(-1),dy=clamp(heightAt(i*ds)-previous.y,-ds*.999999,ds*.999999);
    const dx=direction*Math.sqrt(Math.max(0,ds*ds-dy*dy));
    points.push({x:previous.x+dx,y:previous.y+dy,angle:nearestAngle(Math.atan2(dy,dx),direction>0?0:Math.PI)});
  }
  for(let i=1;i<segments;i++)points[i].angle=nearestAngle((nearestAngle(points[i].angle,points[i+1].angle)+points[i+1].angle)/2,points[i].angle);
  return sampledProfile(points);
}

function sampledProfile(points){
  const n=points.length-1;
  return u=>{const p=clamp(u)*n,i=Math.min(n-1,Math.floor(p)),t=p-i,a=points[i],b=points[i+1];
    return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),angle:lerp(a.angle,nearestAngle(b.angle,a.angle),t)};};
}

function chainPoint(points,q){
  const position=clamp(q)*(points.length-1),i=Math.min(points.length-2,Math.floor(position)),t=position-i;
  const a=points[i],b=points[i+1];
  return {x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),angle:Math.atan2(b.y-a.y,b.x-a.x)};
}

function constrainChain(guide,lengths,start,end){
  const points=guide.map(p=>({...p}));
  const place=(i,j,length)=>{
    const dx=points[i].x-points[j].x,dy=points[i].y-points[j].y,d=Math.hypot(dx,dy)||1e-10;
    points[i]={x:points[j].x+dx/d*length,y:points[j].y+dy/d*length};
  };
  for(let iteration=0;iteration<600;iteration++){
    points[points.length-1]={...end};
    for(let i=points.length-2;i>=0;i--)place(i,i+1,lengths[i]);
    points[0]={...start};
    for(let i=1;i<points.length;i++)place(i,i-1,lengths[i-1]);
    if(Math.hypot(points.at(-1).x-end.x,points.at(-1).y-end.y)<1e-10)break;
  }
  return points;
}

export function integratedProfile(origin,width,segments,angleAt){
  const points=[];let x=origin.x,y=origin.y;
  for(let i=0;i<=segments;i++){
    if(i){const s=(i-.5)*width/segments,a=angleAt((i-.5)/segments,s);x+=Math.cos(a)*width/segments;y+=Math.sin(a)*width/segments;}
    points.push({x,y,angle:angleAt(i/segments,i*width/segments)});
  }
  return sampledProfile(points);
}

export function curveLength(fn,segments=80){
  let length=0,previous=fn(0);
  for(let i=1;i<=segments;i++){const p=fn(i/segments);length+=Math.hypot(p.x-previous.x,p.y-previous.y);previous=p;}
  return length;
}
