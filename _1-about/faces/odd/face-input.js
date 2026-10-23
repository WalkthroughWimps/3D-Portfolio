import {snapTapePosition,heldWindDistance} from './tape-bed.mjs?v=bed-1';
import * as THREE from 'three';
import {RIBBON} from './ribbon-path.mjs?v=addon-layout-2';
import {clipAtPoint,clipEdgeAtPoint,proposeClipEdge,proposeClipMove} from './clip-gesture.mjs?v=clip-reverse-2';
import {getSharedSettings} from '../../../_7-shared-scripts/core/settings.js';

/** One captured gesture belongs to the face; the host retains right-button rotation. */
export function createFaceInput({context,rig,deck,perform,onInputOwnership=()=>{}}) {
  const events=new AbortController(),canvas=context.canvas,ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),normal=new THREE.Vector3();
  let gesture=null,preview=null,hoverEdge=null,hoverLane=-1,hoverMainMeter=false,enabled=true,wheelTimer=null;
  function edgeAt(event,found){if(deck.locked||!found?.object.userData.oddRibbon)return null;const p=rig.group.worldToLocal(found.point.clone()),position=rig.tapePosition??deck.position,lane=Math.max(0,Math.min(3,Math.round(1.5-p.y/RIBBON.lanePitch)));return clipEdgeAtPoint(deck.engine.clips,p,position,{selected:deck.selected,stackBlends:getSharedSettings().get().about.odd.stackBlends,timeOverride:rig.timeAtX(p.x,lane)});}
  function setHover(found){const action=found?.object.userData.oddAction;hoverLane=found?.object.userData.oddMeterLane??(action?.startsWith('lane-max:')?Number(action.split(':')[1]):-1);hoverMainMeter=Boolean(found?.object.userData.oddMainMeter);}
  function setRay(event){const r=canvas.getBoundingClientRect();ndc.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,context.camera);}
  function hit(event){setRay(event);rig.group.getWorldDirection(normal);if(ray.ray.direction.dot(normal)>-.12)return;return ray.intersectObjects(rig.targets,true)[0];}
  function planePoint(event,z=RIBBON.frontDepth){
    setRay(event);rig.group.getWorldDirection(normal);const origin=rig.group.localToWorld(new THREE.Vector3(0,0,z));
    const p=ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal,origin),new THREE.Vector3());
    return p?rig.group.worldToLocal(p):null;
  }
  function consume(event){event.preventDefault();event.stopImmediatePropagation();}
  function release(){const old=gesture;gesture=null;preview=null;hoverEdge=null;hoverLane=-1;hoverMainMeter=false;if(old?.kind==='edge')deck.previewRate(null);if(old&&canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id);if(old)onInputOwnership(false);canvas.style.cursor='';return old;}
  function cancel(){clearTimeout(wheelTimer);wheelTimer=null;hoverLane=-1;const old=release();if(old?.changed&&old.kind==='dial')deck.setControl(old.key,old.value);if(old?.kind==='lane-max')deck.engine.setLane(old.lane,{gain:old.value});if(old?.kind==='volume-slide')deck.setVolume(old.value);if(old?.changed&&old.kind==='seek')deck.engine.seek(old.value);}
  function volume(event){const p=planePoint(event,.319);if(p)deck.setVolume(Math.round(Math.max(0,Math.min(2,(p.x+.20)/.20))*100)/100);}
  function wind(){if(gesture?.kind!=='wind'||deck.locked)return;const total=heldWindDistance((performance.now()-gesture.startedAt)/1000,gesture.step),delta=total-gesture.wound;gesture.wound=total;if(delta)deck.engine.seek(deck.engine.targetPosition+delta);}
  canvas.addEventListener('pointerdown',event=>{
    if(!enabled||event.button!==0)return;
    const found=hit(event);if(!found)return;const action=found.object.userData.oddAction;if(!action)return;
    canvas.focus({preventScroll:true});
    if(action==='unstick'){perform(action);consume(event);return;}
    const local=rig.group.worldToLocal(found.point.clone()),origin=planePoint(event);if(!origin)return;
    const next={id:event.pointerId,action,x:event.clientX,y:event.clientY,origin,kind:'button',changed:false,copy:event.altKey};
    if(action.startsWith('wind:')&&!deck.locked){next.kind='wind';next.step=Number(action.split(':')[1]);next.startedAt=performance.now();next.wound=0;deck.engine.seek(deck.engine.targetPosition+next.step);}
    else if(action==='volume-slide'){next.kind='volume-slide';next.value=deck.engine.volume;}
    else if(action.startsWith('lane-max:')){if(deck.locked)return;next.kind='lane-max';next.lane=Number(action.split(':')[1]);next.value=deck.engine.lanes[next.lane].gain;hoverLane=next.lane;}
    else if(action.startsWith('dial:')){
      const key=action.split(':')[1],field=deck.root.querySelector('[data-control="'+key+'"]');if(field.disabled)return;
      next.kind='dial';next.key=key;next.value=+field.value;next.min=+field.min;next.max=+field.max;next.step=+field.step;
    }else if(action==='seek'&&!deck.locked){next.kind='seek';next.value=deck.engine.tick().position;}
    else if(action.startsWith('field:')&&!deck.locked){const c=deck.engine.clips.find(c=>c.id===deck.selected);if(c){next.kind='field';next.key=action.split(':')[1];next.value=c[next.key];}}
    else if(found.object.userData.oddRibbon&&!deck.locked&&Math.abs(local.x)<=RIBBON.halfSpan&&Math.abs(local.y)<=RIBBON.lanePitch*1.5+RIBBON.width/2){
      const edge=edgeAt(event,found);
      if(edge){next.playhead=rig.tapePosition??deck.position;rig.holdTape();deck.selectClip(edge.clip.id);deck.engine.pause();next.kind='edge';next.clip={...edge.clip};next.edge=edge.edge;next.band=edge.band;next.time=edge.time;hoverEdge=edge;}
      else {
      const c=clipAtPoint(deck.engine.clips,local,rig.tapePosition??deck.engine.tick().position,deck.selected,event.ctrlKey||event.metaKey,rig.timeAtX(local.x,Math.max(0,Math.min(3,Math.round(1.5-local.y/RIBBON.lanePitch)))),getSharedSettings().get().about.odd.stackBlends);
      if(c){next.playhead=rig.tapePosition??deck.position;rig.holdTape();deck.selectClip(c.id);deck.engine.pause();next.kind='clip';next.clip={...c};}
      else{next.kind='tape';next.value=deck.position;}
      }
    }
    if(!['clip','edge','lane-max'].includes(next.kind)&&action!=='unstick')rig.pauseWork();
    gesture=next;canvas.setPointerCapture(event.pointerId);if(next.kind==='volume-slide')canvas.style.cursor='none';onInputOwnership(true);consume(event);
  },{capture:true,signal:events.signal});
  canvas.addEventListener('pointermove',event=>{
    if(!enabled)return;
    if(!gesture){const found=hit(event),action=found?.object.userData.oddAction;setHover(found);hoverEdge=edgeAt(event,found);canvas.style.cursor=hoverEdge?'ew-resize':found?.object.userData.oddRibbon?'grab':action?.startsWith('dial:')||action?.startsWith('lane-max:')?'ns-resize':action==='seek'||action==='volume-slide'?'ew-resize':action?'pointer':'';return;}
    if(gesture.id!==event.pointerId)return;consume(event);
    const g=gesture;if(g.kind==='wind')return;if(Math.hypot(event.clientX-g.x,event.clientY-g.y)>4)g.changed=true;
    if(g.kind==='volume-slide'){if(g.changed)volume(event);return;}if(!g.changed)return;
    if(g.kind==='lane-max'){const range=rig.meterRanges[g.lane],point=planePoint(event,range.z);if(point)deck.engine.setLane(g.lane,{gain:Math.round(Math.max(0,Math.min(1,(point.y-range.minY)/(range.maxY-range.minY)))*100)/100});return;}
    if(g.kind==='dial'){const value=Math.round(Math.max(g.min,Math.min(g.max,g.value+(g.y-event.clientY)/150*(g.max-g.min)))/g.step)*g.step;deck.setControl(g.key,value);}
    if(g.kind==='seek')deck.engine.seek(Math.round((g.value+(event.clientX-g.x)/10)*10)/10);
    if(g.kind==='tape'){const point=planePoint(event);if(point)deck.engine.seek(g.value-(point.x-g.origin.x)*RIBBON.secondsInView/(2*RIBBON.halfSpan));}
    if(g.kind==='field'){g.next=Math.round((g.value+(g.y-event.clientY)*.02)*100)/100;}
    if(g.kind==='clip'){const point=planePoint(event);g.copy=g.copy||event.altKey;if(point)preview=proposeClipMove(deck.engine.clips,g.clip,g.origin,point,g.copy,{snap:true,playhead:g.playhead,tolerance:event.shiftKey?.28:.14});canvas.style.cursor=preview?.valid?(g.copy?'copy':'grabbing'):'not-allowed';}
    if(g.kind==='edge'){const point=planePoint(event);if(point){const lane=g.clip.lane,time=rig.timeAtX(point.x,lane);preview=proposeClipEdge(deck.engine.clips,g.clip,g.edge,time,{stretch:event.shiftKey});hoverEdge={clip:preview.clip,edge:preview.edge,time:preview.edge==='start'?preview.clip.start:preview.clip.start+(preview.clip.out-preview.clip.in)/preview.clip.rate,band:g.band};deck.previewRate(preview.stretch?preview.clip.rate:null,preview.clip.reversed);canvas.style.cursor=preview.valid?'ew-resize':'not-allowed';}}
  },{capture:true,signal:events.signal});
  canvas.addEventListener('pointerup',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;consume(event);wind();const g=gesture,p=preview;release();
    if(g.kind==='lane-max'){const r=canvas.getBoundingClientRect();if(event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)setHover(hit(event));}
    if(g.kind==='clip'&&g.changed){if(p?.valid)deck.placeClip(g.clip.id,{start:p.clip.start,lane:p.clip.lane,in:p.clip.in,out:p.clip.out},g.copy);else deck.message('No clear stretch there. The original clip is unchanged.');return;}
    if(g.kind==='edge'&&g.changed){if(p?.valid)deck.placeClip(g.clip.id,{start:p.clip.start,in:p.clip.in,out:p.clip.out,rate:p.clip.rate,reversed:p.clip.reversed});else deck.message('That edge cannot move there. The original clip is unchanged.');return;}
    if(g.kind==='field'&&g.changed){deck.editSelected({[g.key]:g.next??g.value});return;}
    if(['wind','tape','seek'].includes(g.kind))deck.engine.seek(snapTapePosition(deck.engine.targetPosition));
    if(g.kind==='wind'||g.changed)return;
    perform(g.kind==='clip'?'selected':g.action,event);
  },{capture:true,signal:events.signal});
  for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,event=>{if(gesture?.id===event.pointerId)cancel();},{signal:events.signal});
  function facing(){const p=context.cube.worldToLocal(context.camera.getWorldPosition(new THREE.Vector3()));return p.y>Math.max(Math.abs(p.x),Math.abs(p.z))*1.02;}
  window.addEventListener('keydown',event=>{if(gesture&&event.key==='Escape'){consume(event);cancel();return;}if(!enabled||gesture||!facing()||event.defaultPrevented||event.target?.closest?.('.review-panel,.settings-context-menu,input,select,textarea,[contenteditable="true"]')||document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])'))return;if(['ArrowLeft','ArrowRight','Home','End',' '].includes(event.key))rig.pauseWork();deck.handleShortcut(event);},{capture:true,signal:events.signal});
  canvas.addEventListener('wheel',event=>{if(!enabled||deck.locked||gesture||(!event.shiftKey&&Math.abs(event.deltaX)<=Math.abs(event.deltaY)))return;const found=hit(event);if(!found)return;rig.pauseWork();deck.engine.seek(deck.engine.targetPosition+(event.deltaX||event.deltaY)*.015);clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{if(!gesture&&!deck.locked)deck.engine.seek(snapTapePosition(deck.engine.targetPosition));},180);consume(event);},{capture:true,passive:false,signal:events.signal});
  canvas.addEventListener('pointerleave',()=>{if(!gesture){hoverEdge=null;hoverLane=-1;hoverMainMeter=false;}},{signal:events.signal});
  return {tick(){if(enabled)wind();},get active(){return Boolean(gesture);},get preview(){return preview;},get hoverEdge(){return hoverEdge;},get hoverLane(){return hoverLane;},get hoverMainMeter(){return hoverMainMeter;},get fieldPreview(){return gesture?.kind==='field'&&gesture.changed?{key:gesture.key,value:gesture.next}:null;},set enabled(value){enabled=value;if(!enabled)cancel();},cancel,dispose(){clearTimeout(wheelTimer);cancel();events.abort();canvas.style.cursor='';}};
}
