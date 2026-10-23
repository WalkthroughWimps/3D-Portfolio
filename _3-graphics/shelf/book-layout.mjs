import * as THREE from 'three';
import {restingPage} from './page-turn-input.mjs';

export const upright=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),Math.PI/2);
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const contextFold=amount=>smooth(amount/.25);
export const readerOpen=amount=>smooth((amount-.4)/.6);
export class GridPages{
  progress=0;
  commit(progress){this.progress=restingPage(progress);return this.progress;}
  focus(){return this.progress;}
}
export function poseBox(p,bounds){
  return new THREE.Box3(new THREE.Vector3().fromArray(bounds.min),new THREE.Vector3().fromArray(bounds.max)).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position),new THREE.Quaternion().fromArray(p.quaternion),new THREE.Vector3().fromArray(p.scaleVector)));
}
export function overviewPoses(poses,layout){
  return poses.map(p=>{
    if(layout!=='grid')return p;
    // About 0.07 degrees: visible only on close inspection, not a tilted grid.
    const q=upright.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.0012*Math.sin(p.grade*1.7)));
    return {...p,quaternion:q.toArray()};
  });
}
export function gridPoses(poses,aspect=2){
  const home=overviewPoses(poses,'grid');
  if(aspect>=1.6)return home;
  // Preserve the authored 3×2 grid on wide screens; use 2×3 where fitting
  // three open books across would make every book unnecessarily small.
  return home.map((p,i)=>({...p,position:[(Math.floor(i/3)-.5)*1.98+.433,(1-i%3)*1.42,p.position[2]],gridRows:3}));
}
export function gridView(home,bounds,aspect){
  const box=new THREE.Box3();for(const p of home)box.union(poseBox(p,bounds));
  const view=tightView(box,aspect,{fillX:.98,fillY:.82}),offset=box.getSize(new THREE.Vector3()).y*.04;
  view.target.y+=offset;view.position.y+=offset;return view;
}
export function gridReflow(from,to,t){
  const travel=smooth((t-.2)/.6),lift=smooth(t/.2)*(1-smooth((t-.8)/.2));
  return from.map((p,i)=>({...p,position:p.position.map((v,k)=>v+(to[i].position[k]-v)*travel+(k===2?(i+1)*.22*lift:0)),quaternion:new THREE.Quaternion().fromArray(p.quaternion).slerp(new THREE.Quaternion().fromArray(to[i].quaternion),travel).toArray(),scaleVector:p.scaleVector.map((v,k)=>v+(to[i].scaleVector[k]-v)*travel)}));
}
export function focusPoses(grade,readingBounds,layout='grid',sourceEnd=null,gridHome=null,aspect=2){
  const center=new THREE.Box3(new THREE.Vector3().fromArray(readingBounds.min),new THREE.Vector3().fromArray(readingBounds.max)).getCenter(new THREE.Vector3());
  return Array.from({length:6},(_,i)=>{
    const chosen=i+1===grade,scale=layout==='spread'?2.05:(gridHome?.[0].gridRows===3?1.8*Math.min(1,aspect/1.25):1.24);
    // The fan is part of the authored spread pose. Selecting a reader must not
    // rearrange its neighbours into the grid's thumbnail strip.
    if(!chosen&&layout==='spread'&&sourceEnd)return {...sourceEnd[i],position:sourceEnd[i].position.map((v,k)=>v+(k===1?.55:0)),preserveFan:true};
    if(!chosen&&layout==='grid')return {...(gridHome||sourceEnd)[i],stationary:true,pinned:true};
    const q=upright.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.0008*Math.sin(i*2.1)));
    const position=new THREE.Vector3(0,layout==='spread'?.05:0,layout==='spread'?2.2:.15).sub(center.clone().multiplyScalar(scale).applyQuaternion(q));
    return {grade:i+1,position:position.toArray(),quaternion:q.toArray(),scaleVector:[scale,scale,scale],scale,home:layout==='grid'?(gridHome||sourceEnd)[i]:null};
  });
}
export function blendFocus(poses,sourceEnd,targets,amount){
  return poses.map((p,i)=>{
    if(targets[i].stationary)return {...p,...targets[i]};
    if(targets[i].home){
      const target=targets[i],home=target.home,travel=smooth((amount-.1)/.9),lift=smooth(amount/.35);
      return {...p,position:home.position.map((v,k)=>v+(target.position[k]-v)*(k===2?lift:travel)),quaternion:new THREE.Quaternion().fromArray(home.quaternion).slerp(new THREE.Quaternion().fromArray(target.quaternion),travel).toArray(),scaleVector:home.scaleVector.map((v,k)=>v+(target.scaleVector[k]-v)*travel)};
    }
    // Preserve authored travel, applying only the endpoint's presentation delta.
    const end=sourceEnd[i],target=targets[i],chosen=target.scale>1,travel=chosen?amount:smooth((amount-.25)/.6),shrink=chosen?amount:contextFold(amount),q0=new THREE.Quaternion().fromArray(end.quaternion),q1=new THREE.Quaternion().fromArray(target.quaternion);
    const delta=q1.multiply(q0.invert()),rotation=new THREE.Quaternion().slerp(delta,chosen?amount:travel).multiply(new THREE.Quaternion().fromArray(p.quaternion));
    const position=p.position.map((v,k)=>v+(target.position[k]-end.position[k])*travel);
    // Close/shrink before crossing rows, with separate depth lanes behind the
    // reader; reunite only after the thumbnails reach their non-touching slots.
    if(!chosen&&!target.preserveFan){const lane=1+sourceEnd.filter((p,j)=>p.position[2]>end.position[2]+.00001||Math.abs(p.position[2]-end.position[2])<=.00001&&j<i).length;position[2]-=lane*.22*(Math.sin(Math.PI*travel)+Math.sin(Math.PI*amount));}
    return {...p,position,quaternion:rotation.toArray(),scaleVector:p.scaleVector.map((v,k)=>v*(1+(target.scaleVector[k]/end.scaleVector[k]-1)*shrink))};
  });
}
export function readerFrame(target,readingBounds){
  const box=poseBox(target,readingBounds);
  // Reserve only a small peek of the fan, rather than fitting its full height.
  box.max.y+=.5;
  return box;
}
// A shot is planned from the complete clip, including its destination. Camera
// position and target are then held throughout playback, even over a small pile.
export function animationBounds(sample,clips,bounds,extraBox=null){
  const box=extraBox?extraBox.clone():new THREE.Box3();
  for(const [start,end] of clips){
    const steps=Math.max(1,Math.ceil(Math.abs(end-start)/2));
    for(let i=0;i<=steps;i++)for(const p of sample(start+(end-start)*i/steps))box.union(poseBox(p,bounds(p)));
  }
  return box;
}
export function tightView(box,aspect,{fillX=.94,fillY=.80}={}){
  const target=box.getCenter(new THREE.Vector3()),tanY=Math.tan(35*Math.PI/360),tanX=tanY*aspect;
  let distance=0;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])distance=Math.max(distance,Math.abs(x-target.x)/(tanX*fillX)+z-target.z,Math.abs(y-target.y)/(tanY*fillY)+z-target.z);
  return {target,position:target.clone().add(new THREE.Vector3(0,0,Math.max(.5,distance)))};
}
export function visibleFaces(progress){
  const p=Math.max(-1,Math.min(10,Math.round(progress)));
  if(p===-1)return ['front.jpg'];if(p===10)return ['back.jpg'];
  return [p===0?'inside-front.jpg':`page-${String(p*2).padStart(2,'0')}.jpg`,p===9?'inside-back.jpg':`page-${String(p*2+1).padStart(2,'0')}.jpg`];
}
export function gridArtworkFiles(progress){
  const files=new Set(['front.jpg','back.jpg']);
  for(let p=Math.floor(progress)-1;p<=Math.ceil(progress)+1;p++)for(const file of visibleFaces(p))files.add(file);
  return [...files];
}
export {prepareFocusContacts,applyFocusContacts} from './focus-contact-path.mjs';
