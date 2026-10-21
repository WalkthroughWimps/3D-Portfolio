import {laneHeight,RIBBON} from './ribbon-path.mjs?v=addon-layout-2';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const ease=v=>{const t=clamp(v);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t,dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0),norm=a=>Math.hypot(...a),unit=a=>{const n=norm(a);return a.map(v=>v/Math.max(n,1e-8));};
// The folded links double back along the panel edge. Their small depth offset
// separates the returning link from the outgoing rails inside the narrow gap.
const baseX=.37,upper=.23,forearm=.23,hand=.04;
const foldedElbowX=baseX-Math.sqrt(upper**2-.021**2-.006**2);
const foldedKnuckleX=foldedElbowX+Math.sqrt(forearm**2-.021**2-.037**2);
const foldedWristX=foldedKnuckleX-hand;
export const ARM_LAYOUT=Object.freeze({upper,forearm,hand,shoulderLift:.035,baseX,restY:.184,baseZ:.25,upperZ:.292,lowerZ:.292,restZ:.25+.035,foldedWristX,foldedWristZ:.328,travelZ:.37,stationSeconds:1.25,stationX:.12,maxWorkX:.18,toolLength:.040});
export function segmentGap(p,q,a,b){const u=q.map((n,i)=>n-p[i]),v=b.map((n,i)=>n-a[i]),w=p.map((n,i)=>n-a[i]),aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w),den=aa*cc-bb*bb;let x=den>1e-12?clamp((bb*ee-cc*dd)/den):0,y=clamp((bb*x+ee)/Math.max(cc,1e-12));x=clamp((bb*y-dd)/Math.max(aa,1e-12));y=clamp((bb*x+ee)/Math.max(cc,1e-12));return norm(w.map((n,i)=>n+u[i]*x-v[i]*y));}
export function foldedArm(side){
  const base=[side*ARM_LAYOUT.baseX,side*ARM_LAYOUT.restY,ARM_LAYOUT.baseZ],shoulder=[base[0],base[1],ARM_LAYOUT.restZ],elbow=[side*foldedElbowX,side*.163,.291],knuckle=[side*foldedKnuckleX,side*.184,ARM_LAYOUT.foldedWristZ],wrist=[side*foldedWristX,side*.184,ARM_LAYOUT.foldedWristZ];
  return {base,shoulder,elbow,knuckle,wrist};
}
function circleAngle(center,u,v,radius,side,preferred,minZ){
  const tau=Math.PI*2;let arcs=[[0,tau]];
  for(const[normal,limit]of[[[side,0,0],.044],[[0,0,1],minZ]]){
    const A=radius*dot(u,normal),B=radius*dot(v,normal),R=Math.hypot(A,B),C=limit-dot(center,normal);
    if(R<1e-12){if(C>1e-10)throw Error('Empty arm clearance circle.');continue;}
    if(C<=-R)continue;if(C>R+1e-10)throw Error('Empty arm clearance circle.');
    const angle=Math.atan2(B,A),half=Math.acos(clamp(C/R,-1,1)),windows=[];
    for(let n=-2;n<=2;n++)windows.push([angle-half+n*tau,angle+half+n*tau]);
    arcs=arcs.flatMap(([a,b])=>windows.map(([c,d])=>[Math.max(a,c),Math.min(b,d)]).filter(([c,d])=>c<=d+1e-10));
  }
  if(!arcs.length)throw Error('Empty arm clearance circle.');
  const A=dot(preferred,u),B=dot(preferred,v),desired=Math.atan2(B,A);let result=0,score=-Infinity;
  for(const[a,b]of arcs)for(let n=-1;n<=2;n++){const angle=clamp(desired+n*tau,a,b),value=A*Math.cos(angle)+B*Math.sin(angle);if(value>score){score=value;result=angle;}}
  return result;
}
/** Analytic two-link arm with a rigid short wrist. The elbow follows one
 * scheduled swivel and the tools lift clear before traversing the bed. */
export function solveArm(base,target,side,avoid=[],{extension=1,toolDirection=[0,0,-1],preferredElbow=null}={}){
  const fold=ease(extension),direction=unit(toolDirection);
  const shoulder=[base[0],base[1],base[2]+ARM_LAYOUT.shoulderLift];
  const knuckle=target.map((v,i)=>v-direction[i]*ARM_LAYOUT.hand),delta=knuckle.map((v,i)=>v-shoulder[i]),distance=norm(delta),A=ARM_LAYOUT.upper,B=ARM_LAYOUT.forearm;
  if(distance<=Math.abs(A-B)||distance>=A+B)throw Error('Arm target outside the rigid workspace.');
  const d=unit(delta),up=unit([-d[0]*d[2],-d[1]*d[2],1-d[2]*d[2]]),lateral=[d[1]*up[2]-d[2]*up[1],d[2]*up[0]-d[0]*up[2],d[0]*up[1]-d[1]*up[0]];
  const a=(A*A-B*B+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,A*A-a*a)),center=shoulder.map((v,i)=>v+d[i]*a);
  const hingeRoll=mix(Math.PI/2,-.35,fold);
  const preferred=preferredElbow?preferredElbow.map((v,i)=>v-center[i]):up.map((v,i)=>v*Math.cos(hingeRoll)+lateral[i]*Math.sin(hingeRoll));
  const angle=circleAngle(center,up,lateral,height,side,preferred,shoulder[2]);
  const elbow=center.map((v,i)=>v+height*(up[i]*Math.cos(angle)+lateral[i]*Math.sin(angle))),wrist=[...target];
  if(target[2]===shoulder[2]&&direction[2]===0)elbow[2]=shoulder[2];
  const toolA=wrist.map((v,i)=>v+toolDirection[i]*.012),toolB=wrist.map((v,i)=>v+toolDirection[i]*ARM_LAYOUT.toolLength);
  let gap=Math.min(segmentGap(shoulder,elbow,toolA,toolB),segmentGap(elbow,knuckle,toolA,toolB));
  for(const o of avoid)if(o.a)gap=Math.min(gap,segmentGap(elbow,knuckle,o.a,o.b)-o.radius,segmentGap(knuckle,wrist,o.a,o.b)-o.radius);
  return {base:[...base],shoulder,elbow,knuckle,wrist,toolGap:gap};
}
export function canPairMove(job){const delta=(job?.to?.start??0)-(job?.from?.start??0);return job?.kind==='move'&&delta>=1.25&&delta<=3.5;}
export function workStations(job){if(!job?.from||!job?.to||job.pass!=='paired')return {remove:-.12,write:.12};const gap=clamp((job.to.start-job.from.start)*RIBBON.halfSpan*2/RIBBON.secondsInView,.12,.336);return {remove:-gap/2,write:gap/2};}
export function armPose(side,lane,progress=0,{x=side*.12,active=true,phase=0,working=false,surface=null}={}){
  const global=clamp(Math.min((progress-.04)/.24,(.96-progress)/.20)),reach=active?ease(global):0,flapOpen=active?ease(Math.min(progress/.04,(1-progress)/.04)):0,rest=foldedArm(side),work=[side*clamp(Math.abs(x),.06,.18),surface?.y??laneHeight(lane),surface?.z??.252];
  const move=ease((reach-.30)/.45),lift=ease(reach/.30),lower=ease((reach-.82)/.18);
  const toolDirection=unit([-side*.989*(1-move),-side*.148*(1-move),-move]);
  const stagingX=side*.33,stagingY=side*.166,target=[mix(stagingX,work[0],move),mix(stagingY,work[1],move),0];
  const high=ARM_LAYOUT.travelZ;
  // The elbow guide selects a continuous branch of the exact two-link circle.
  // It is a direction preference, not a joint target.
  const raisedElbow=[side*.20,side*.32,.52];
  if(reach<.30){
    const direction=unit([mix(-side,toolDirection[0],lift),toolDirection[1]*lift,0]);
    const wrist=rest.wrist.map((v,i)=>mix(v,[stagingX,stagingY,high][i],lift));
    const elbow=rest.elbow.map((v,i)=>mix(v,raisedElbow[i],lift));
    const pose=solveArm(rest.base,wrist,side,[],{extension:0,toolDirection:direction,preferredElbow:elbow});
    return {...pose,work,toolDirection:direction,extension:0,reach,flapOpen,travel:global,stage:!reach?'rest':'unfold'};
  }
  target[2]=mix(mix(ARM_LAYOUT.restZ,high,lift),work[2]+ARM_LAYOUT.toolLength,lower);
  if(active&&working&&reach===1&&side>0)target[2]+=.0015*Math.sin(phase);if(active&&working&&reach===1&&side<0)target[1]+=.0025*Math.sin(phase*.32);
  const extension=move;
  const preferredElbow=[side*mix(.20,.22,move),mix(side*.32,work[1],move),.52];
  const pose=solveArm(rest.base,target,side,[],{extension,toolDirection,preferredElbow});
  return {...pose,work,toolDirection,extension,reach,flapOpen,travel:global,stage:!reach?'rest':reach===1?'work':'unfold'};
}
export function clothFeed(job,position){if(!job)return {position,fraction:1,working:false};const p=job.progress,fraction=clamp((p-.28)/.48),stations=workStations(job),removing=job.pass==='unpick',source=removing?job.from??job:job.to??job,stationSeconds=(removing?stations.remove:stations.write)*RIBBON.secondsInView/(2*RIBBON.halfSpan),start=source.start-stationSeconds,end=start+source.seconds,travel=job.stage==='travel'&&job.previous?mix(clothFeed({...job.previous,progress:.76,stage:'work',previous:null},position).position,start,ease(job.stageFraction)):null;return {position:travel??(p<.28?mix(position,start,ease(p/.28)):p<=.76?mix(start,end,fraction):mix(end,position,ease((p-.76)/.24))),fraction,removeFraction:job.pass==='sew'?1:fraction,writeFraction:removing?0:fraction,arrival:ease(p/.28),working:job.stage==='work',stations,base:start};}
