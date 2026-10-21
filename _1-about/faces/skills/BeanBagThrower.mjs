import * as THREE from 'three';
import {createBeanBagSounds} from './BeanBagSounds.mjs';
import {createBeanBagVisuals} from './BeanBagVisuals.mjs';

const directions=['E','NE','N','NW','W','SW','S','SE'];
const visible=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};
const clamp=THREE.MathUtils.clamp;
/** A center cell and eight compass cells, enlarged smoothly with card thickness. */
export function beanBagCell(x,y,width,weight=0){
  const half=width*THREE.MathUtils.lerp(1/6,.28,clamp(weight,0,1));
  const gx=Math.abs(x)<=half?0:Math.sign(x),gy=Math.abs(y)<=half?0:Math.sign(y);
  return gx||gy?directions[(Math.round(Math.atan2(gy,gx)/(Math.PI/4))+8)%8]:null;
}
const pointOn=(plan,t)=>new THREE.Vector3().copy(plan.start).multiplyScalar((1-t)**2).addScaledVector(plan.control,2*t*(1-t)).addScaledVector(plan.end,t*t);
function puffTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,1,32,32,32);
  g.addColorStop(0,'#fff');g.addColorStop(.35,'#ffffffb0');g.addColorStop(1,'#ffffff00');
  ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(canvas);
}
const TUTORIAL_KEY='about.skills.beanBags.aimPowerTutorial.v2';
const GRAVITY=3.2,FLIGHT_TIME=1.3,OVERDRAW_START=.86;
const offsets=[new THREE.Vector2(0,0),...[-1,0,1].flatMap(x=>[-1,0,1].filter(y=>x||y).map(y=>new THREE.Vector2(x,y)))];

/** Owns the held bag, slingshot gesture, complete arc plans and their recovery. */
export function createBeanBagThrower({assembly:a,camera,canvas,getBacking,getSettings=()=>({}),getContainer=()=>null,supply,visuals:providedVisuals,getRecoveryTarget=()=>null,onCatch=()=>{},onDestroy=()=>{}}){
  const ownsVisuals=!providedVisuals,visuals=providedVisuals||createBeanBagVisuals();
  const m=a.motion,scene=(()=>{let n=a.model;while(n.parent)n=n.parent;return n;})(),root=new THREE.Group();
  root.name='Skills thrown bean bags';scene.add(root);
  // The corrected cube shell supplies the physical scale of the slingshot lane.
  // Resolve the exported source node, not the bounds of deployed cards or bags.
  const shell=a.rawNodes.get('cube.main Export')||a.rawNodes.get('cube.main');
  if(!shell)throw new Error('Skills slingshot requires the corrected cube shell');
  a.rig.deployNode.updateWorldMatrix(true,false);shell.updateWorldMatrix(true,true);
  const shellToFace=a.rig.deployNode.matrixWorld.clone().invert(),shellPoint=new THREE.Vector3();
  let shellLeft=Infinity,shellRight=-Infinity;
  shell.traverse(node=>{if(!node.isMesh||!node.geometry?.attributes?.position)return;
    const position=node.geometry.attributes.position;
    for(let i=0;i<position.count;i++){
      shellPoint.fromBufferAttribute(position,i).applyMatrix4(node.matrixWorld).applyMatrix4(shellToFace);
      shellLeft=Math.min(shellLeft,shellPoint.x);shellRight=Math.max(shellRight,shellPoint.x);
    }
  });
  const cubeWidth=shellRight-shellLeft;
  if(!(cubeWidth>1&&cubeWidth<3))throw new Error('Skills slingshot could not measure the cube width');
  const launchStandoff=cubeWidth;
  const smoke=puffTexture(),sounds=createBeanBagSounds(()=>getSettings().audio),bags=[],puffs=[],events=new AbortController();
  const ray=new THREE.Raycaster(),sweep=new THREE.Raycaster(),ndc=new THREE.Vector2();
  let modeActive=false,heldId=null,heldMesh=null,pickupPointer=null,gesture=null,suspended=false,disposed=false,serial=0,lastPlan=null,contrastGain=1;
  let pointer=null,cursorHidden=false;
  const totals={throws:0,hits:0,thunks:0,misses:0,backings:0,burns:0,bagCollisions:0,fumbles:0};
  const dock=document.createElement('div');dock.className='skills-beanbag-dock';
  dock.innerHTML='<style>.skills-beanbag-dock{position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:12;display:flex;align-items:center;gap:8px;width:max-content;max-width:calc(100vw - 28px);box-sizing:border-box;padding:6px 10px;border:1px solid #a4b2bd;border-radius:10px;background:#17212bea;color:#f8f3df;font:13px/1.25 system-ui}.skills-beanbag-dock[hidden]{display:none}.skills-beanbag-dock button{flex:none;border:1px solid #b6d3ba;border-radius:6px;padding:6px 9px;background:#b8e5b1;color:#142115;font:inherit;cursor:pointer}.skills-beanbag-dock span{max-width:260px}@media(max-width:480px){.skills-beanbag-dock{bottom:64px;left:calc(50% - 16px);width:min(300px,calc(100vw - 64px));font-size:11px;padding:4px 6px;gap:5px}.skills-beanbag-dock span{max-width:none;min-width:0}}</style><button type="button" title="Pick up a bag or return to cards (B)">Pick up a bag</button><span>Click a bean bag in the basket</span>';
  dock.hidden=true;document.body.append(dock);
  const button=dock.querySelector('button'),hint=dock.querySelector('span');
  const notice=document.createElement('div');notice.className='skills-beanbag-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  notice.style.cssText='position:fixed;left:50%;bottom:112px;transform:translateX(-50%);z-index:13;max-width:min(90vw,360px);padding:7px 11px;border-radius:9px;background:#17212bea;color:#f8f3df;font:13px/1.3 system-ui;text-align:center;pointer-events:none';
  notice.hidden=true;document.body.append(notice);
  const sling=document.createElement('div');sling.className='skills-slingshot';sling.style.cssText='position:fixed;inset:0;z-index:11;pointer-events:none;display:none';
  sling.innerHTML='<style>canvas[data-skills-bag-cursor="true"]{cursor:none!important}</style><svg width="100%" height="100%" aria-hidden="true"><path class="fork" fill="none" stroke="#b99a5d" stroke-width="5" stroke-linecap="round"/><path class="bands" fill="none" stroke="#ecb66c" stroke-width="2" stroke-linecap="round"/><path class="preview" fill="none" stroke="#f5d188" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/><circle class="target" r="8" fill="none" stroke="#bcd5e8" stroke-width="1.5"/><circle class="impact" r="8" fill="none" stroke="#ffce69" stroke-width="2"/><path class="power-track" fill="none" stroke="#a4b2bd" stroke-width="6" stroke-linecap="round"/><path class="overdraw-zone" fill="none" stroke="#e94742" stroke-width="6" stroke-linecap="round"/><path class="power-normal" fill="none" stroke="#ffce69" stroke-width="6" stroke-linecap="round"/><path class="power-overdraw" fill="none" stroke="#ff625e" stroke-width="7" stroke-linecap="round"/><text class="power-label" fill="#f8f3df" font-size="12" font-family="system-ui">POWER</text></svg>';
  document.body.append(sling);
  const tutorial=document.createElement('div');tutorial.className='skills-sling-tutorial';
  tutorial.style.cssText='position:fixed;left:16px;top:175px;z-index:14;pointer-events:none;width:min(300px,calc(100vw - 28px));box-sizing:border-box;padding:11px 14px;border:1px solid #e0bf82;border-radius:11px;background:#17212bf2;color:#f8f3df;font:13px/1.35 system-ui;text-align:center;box-shadow:0 0 var(--skills-tutorial-glow,10px) #e0bf82';
  tutorial.innerHTML='<style>@media(max-width:480px){.skills-sling-tutorial{top:220px!important}}</style><strong>Bean bag slingshot</strong><div class="demo" aria-hidden="true">◎ · · · ◉</div>Aim with the bean bag cursor. Press to lock aim, pull down for power, then release. The red OVERDRAW zone flubs the shot sideways.';
  tutorial.hidden=true;document.body.append(tutorial);
  let noticeTimer=0,tutorialTimer=0,tutorialSeen=false;
  const showNotice=message=>{if(!message)return;notice.textContent=message;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;notice.textContent='';},4200);};
  const unsubscribe=supply?.subscribe(event=>{refreshHint();showNotice(event.message);});
  function refreshHint(){const state=supply?.snapshot(),count=state?.availableIds.length??0;hint.textContent=!modeActive?`Click a bean bag · ${count} available`:heldId===null?state?.inFlight.length?'Waiting for a bag to return · Esc exits':'Out of bean bags · Esc exits':`Bag ${(heldId%4)+1} · aim, press to lock, pull down, release · Esc exits`;button.textContent=modeActive?'Return to cards':'Pick up a bag';button.setAttribute('aria-pressed',String(modeActive));}
  function allowed(){return !disposed&&!suspended&&!a.suspended&&m.focused&&!m.paused&&getSettings().about?.skills?.enabled!==false;}
  function showTutorial(){
    let seen=tutorialSeen;try{seen ||= localStorage.getItem(TUTORIAL_KEY)==='1';}catch{/* private storage */}
    if(seen)return;tutorialSeen=true;
    try{localStorage.setItem(TUTORIAL_KEY,'1');}catch{/* current visit still shows once */}
    tutorial.classList.toggle('reduced',Boolean(m.reducedMotion));tutorial.hidden=false;
    clearTimeout(tutorialTimer);tutorialTimer=setTimeout(()=>{tutorial.hidden=true;},6500);
  }
  function screenBasis(){const q=camera.getWorldQuaternion(new THREE.Quaternion());return{up:new THREE.Vector3(0,1,0).applyQuaternion(q),right:new THREE.Vector3(1,0,0).applyQuaternion(q)};}
  function screenToPlane(x,y,plane){
    const rect=canvas.getBoundingClientRect();ndc.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    ray.setFromCamera(ndc,camera);return ray.ray.intersectPlane(plane,new THREE.Vector3());
  }
  function launchPlane(){
    a.model.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const matrix=a.rig.deployNode.matrixWorld,normal=new THREE.Vector3(0,0,1).transformDirection(matrix);
    const face=[...m.panels.values()][0].center.clone().applyMatrix4(matrix);
    return{normal,matrix,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,face.clone().addScaledVector(normal,launchStandoff)),face,
      facePlane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,face)};
  }
  function cardWidthPixels(){
    const panel=[...m.panels.values()].find(p=>p.record.geometry?.neutralSize?.[0]);
    if(!panel)return 55;
    a.rig.deployNode.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const width=panel.record.geometry.neutralSize[0],matrix=a.rig.deployNode.matrixWorld;
    const one=panel.center.clone().add(new THREE.Vector3(-width/2,0,0)).applyMatrix4(matrix).project(camera);
    const two=panel.center.clone().add(new THREE.Vector3(width/2,0,0)).applyMatrix4(matrix).project(camera);
    return Math.max(12,Math.abs(two.x-one.x)*canvas.getBoundingClientRect().width/2);
  }
  function fixedLaunchPosition(info=launchPlane()){
    const rect=canvas.getBoundingClientRect();
    return screenToPlane(rect.left+rect.width*.5,rect.bottom-Math.max(155,rect.height*.22),info.plane);
  }
  function project(point){const rect=canvas.getBoundingClientRect(),p=point.clone().project(camera);
    return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};}
  function cursorAt(x,y,type='mouse'){
    pointer={x,y,type};
    const rect=canvas.getBoundingClientRect(),inside=x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;
    const sceneHit=inside&&document.elementFromPoint(x,y)===canvas;
    const show=heldId!==null&&inside&&(type!=='mouse'||sceneHit)&&!disposed&&!suspended;
    if(show&&heldMesh){const point=screenToPlane(x,y,launchPlane().plane);if(point)heldMesh.position.copy(point);
      heldMesh.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));}
    if(heldMesh)heldMesh.visible=show;
    if(show&&type==='mouse'&&!cursorHidden){canvas.dataset.skillsBagCursor='true';cursorHidden=true;}
    else if((!show||type!=='mouse')&&cursorHidden){delete canvas.dataset.skillsBagCursor;cursorHidden=false;}
  }
  function drawSling(){
    if(!modeActive||heldId===null||!allowed()){sling.style.display='none';return;}
    const start=gesture?.start||fixedLaunchPosition();if(!start){sling.style.display='none';return;}
    camera.updateMatrixWorld(true);const at=project(start),svg=sling.querySelector('svg');sling.style.display='block';
    svg.querySelector('.fork').setAttribute('d',`M ${at.x-12} ${at.y-17} L ${at.x} ${at.y+4} L ${at.x+12} ${at.y-17}`);
    svg.querySelector('.bands').setAttribute('d',`M ${at.x-12} ${at.y-17} L ${at.x} ${at.y} L ${at.x+12} ${at.y-17}`);
    const preview=svg.querySelector('.preview'),target=svg.querySelector('.target'),impact=svg.querySelector('.impact');
    const track=svg.querySelector('.power-track'),zone=svg.querySelector('.overdraw-zone'),normal=svg.querySelector('.power-normal'),overdraw=svg.querySelector('.power-overdraw'),label=svg.querySelector('.power-label');
    const active=Boolean(gesture?.plan);preview.style.display=target.style.display=impact.style.display=track.style.display=zone.style.display=normal.style.display=overdraw.style.display=label.style.display=active?'':'none';
    if(!active)return;
    const pts=[];for(let i=0;i<=28;i++){const p=project(pointOn(gesture.plan,i/28));pts.push(`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);}
    preview.setAttribute('d',pts.join(' '));const aim=project(gesture.aim),end=project(gesture.plan.end);
    target.setAttribute('cx',String(aim.x));target.setAttribute('cy',String(aim.y));
    impact.setAttribute('cx',String(end.x));impact.setAttribute('cy',String(end.y));
    impact.setAttribute('stroke',gesture.plan.kind==='fumble'?'#e94742':'#ffce69');
    const x=at.x+29,y=at.y-52,length=105,power=gesture.fraction;
    track.setAttribute('d',`M ${x} ${y} L ${x} ${y+length}`);
    zone.setAttribute('d',`M ${x} ${y+length*OVERDRAW_START} L ${x} ${y+length}`);
    normal.setAttribute('d',`M ${x} ${y} L ${x} ${y+length*Math.min(power,OVERDRAW_START)}`);
    overdraw.setAttribute('d',`M ${x} ${y+length*OVERDRAW_START} L ${x} ${y+length*power}`);
    overdraw.style.strokeOpacity=String((power>=OVERDRAW_START?1:.45)*clamp(.24+.56*contrastGain,0,1));
    label.setAttribute('x',String(x+10));label.setAttribute('y',String(y+12));
    label.textContent=power>=OVERDRAW_START?'OVERDRAW':'POWER';label.setAttribute('fill',power>=OVERDRAW_START?'#ff6b64':'#f8f3df');
  }
  function arm(id,position){
    if(!allowed()||heldId!==null||supply?.reserve(id)!==id)return false;
    // The Skills bearing may still be settling after face entry. Lock its current
    // screen-upright target before a world-space aim or flight is prepared.
    a.faceCarrier?.update(0,camera,true);
    modeActive=true;
    heldId=id;heldMesh=visuals.create(id);root.add(heldMesh);heldMesh.position.copy(position);heldMesh.visible=false;
    sounds.unlock();refreshHint();showTutorial();a.input?.setThrowHandler(()=>true);
    if(pointer)cursorAt(pointer.x,pointer.y,pointer.type);drawSling();return true;
  }
  function cancel(){
    modeActive=false;
    const captured=gesture?.pointerId??pickupPointer;
    if(captured!==null&&captured!==undefined){try{canvas.releasePointerCapture(captured);}catch{/* capture may already be gone */}}
    gesture=null;pickupPointer=null;heldMesh?.removeFromParent();heldMesh=null;
    if(heldId!==null)supply?.recover(heldId);
    heldId=null;tutorial.hidden=true;a.input?.setThrowHandler(null);cursorAt(pointer?.x??-1,pointer?.y??-1,pointer?.type);drawSling();refreshHint();
  }
  function clampPouch(x,y){
    const max=clamp(2*cardWidthPixels(),48,Math.max(70,Math.min(innerWidth,innerHeight)*.55));
    const pull=clamp(y-gesture.pressY,0,max);
    if(!gesture.plan||Math.abs(pull-gesture.pull)>.05){gesture.maxPull=max;gesture.pull=pull;gesture.fraction=pull/max;
      gesture.plan=planShot({aim:gesture.aim,start:gesture.start,fraction:gesture.fraction});}
    cursorAt(x,y,gesture.pointerType);drawSling();
  }
  function consume(e){e.preventDefault();e.stopImmediatePropagation();}
  function onDown(e){
    if(!allowed())return;
    if(e.button!==0){if(modeActive)cancel();return;}
    if(heldId===null){
      if(modeActive){consume(e);return;}
      const picked=getContainer()?.pickStoredBag(e);if(!picked)return;
      if(!arm(picked.id,picked.position))return;
      cursorAt(e.clientX,e.clientY,e.pointerType);
      pickupPointer=e.pointerId;try{canvas.setPointerCapture(e.pointerId);}catch{/* capture optional */}
      consume(e);return;
    }
    if(pickupPointer!==null||gesture)return;
    const info=launchPlane(),aim=screenToPlane(e.clientX,e.clientY,info.facePlane),start=fixedLaunchPosition(info);
    if(!aim||!start)return;
    gesture={pointerId:e.pointerId,pointerType:e.pointerType,pressY:e.clientY,aim,start,pull:0,maxPull:2*cardWidthPixels(),fraction:0,plan:null};
    try{canvas.setPointerCapture(e.pointerId);}catch{/* capture optional */}
    clampPouch(e.clientX,e.clientY);consume(e);
  }
  function onMove(e){if(e.pointerType==='mouse')pointer={x:e.clientX,y:e.clientY,type:'mouse'};
    if(gesture?.pointerId===e.pointerId){clampPouch(e.clientX,e.clientY);consume(e);}
    else if(heldId!==null)cursorAt(e.clientX,e.clientY,e.pointerType);}
  function onUp(e){
    if(pickupPointer===e.pointerId){pickupPointer=null;try{canvas.releasePointerCapture(e.pointerId);}catch{/* already released */}
      if(e.pointerType!=='mouse')cursorAt(-1,-1,e.pointerType);consume(e);return;}
    if(!gesture||gesture.pointerId!==e.pointerId)return;
    if(e.button!==0){cancel();return;}
    const plan=gesture.plan,from=heldMesh?.position.clone();gesture=null;
    try{canvas.releasePointerCapture(e.pointerId);}catch{/* already released */}
    launch(plan,from);drawSling();consume(e);
  }
  function onCancel(e){if((e.type==='pointercancel'||e.type==='lostpointercapture')&&(gesture?.pointerId===e.pointerId||pickupPointer===e.pointerId))cancel();}
  canvas.addEventListener('pointerdown',onDown,{capture:true,signal:events.signal});
  canvas.addEventListener('pointermove',onMove,{capture:true,signal:events.signal});
  window.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'){pointer={x:e.clientX,y:e.clientY,type:'mouse'};
    if(modeActive&&!gesture)cursorAt(e.clientX,e.clientY,'mouse');}},{capture:true,signal:events.signal});
  canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')cursorAt(-1,-1,'mouse');},{signal:events.signal});
  canvas.addEventListener('pointerup',onUp,{capture:true,signal:events.signal});
  canvas.addEventListener('pointercancel',onCancel,{capture:true,signal:events.signal});
  canvas.addEventListener('lostpointercapture',onCancel,{signal:events.signal});
  canvas.addEventListener('contextmenu',e=>{if(modeActive){e.preventDefault();cancel();}},{capture:true,signal:events.signal});
  window.addEventListener('blur',cancel,{signal:events.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();},{signal:events.signal});
  function pickFirstAvailable(){
    const id=supply?.snapshot().availableIds[0],bag=getContainer()?.storedBags[id];
    if(id===undefined||!bag){showNotice('There are no bean bags ready.');return;}
    bag.updateWorldMatrix(true,false);arm(id,bag.getWorldPosition(new THREE.Vector3()));
  }
  function armNextAvailable(){
    if(!modeActive||heldId!==null||!allowed())return false;
    const id=supply?.snapshot().availableIds[0],bag=getContainer()?.storedBags[id];
    if(id===undefined||!bag)return false;
    bag.updateWorldMatrix(true,false);return arm(id,bag.getWorldPosition(new THREE.Vector3()));
  }
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&modeActive){cancel();e.preventDefault();return;}
    if(e.defaultPrevented||e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.target?.closest?.('input,select,textarea,button,a,[contenteditable=true]')||document.querySelector('dialog[open]')||!allowed())return;
    if(e.key.toLowerCase()==='b'){e.preventDefault();if(modeActive)cancel();else pickFirstAvailable();}
  },{signal:events.signal});
  button.addEventListener('click',()=>{
    if(modeActive)cancel();
    else pickFirstAvailable();
    canvas.focus({preventScroll:true});
  },{signal:events.signal});

  function profile(panel){
    const g=panel.record.geometry||{},morph=panel.morphs?.[0],index=morph?.morphTargetDictionary?.Clicked;
    const weight=clamp(morph?.morphTargetInfluences?.[index]??0,0,1);
    return{weight,width:THREE.MathUtils.lerp(g.neutralSize?.[0]||.277,g.clickedSize?.[0]||.24,weight),
      radius:THREE.MathUtils.lerp(g.neutralCornerRadius??.035,g.clickedCornerRadius??.095,weight)};
  }
  function footprintCandidates(point,panels,matrix,reference=null){
    const local=point.clone().applyMatrix4(matrix.clone().invert()),normal=new THREE.Vector3(0,0,1).transformDirection(matrix);
    return panels.filter(panel=>{
      const id=panel.record.panelId;
      if(m.active.has(id)||m.queue.has(id)||!visible(panel.body))return false;
      if(reference&&Math.abs(panel.center.z-reference.center.z)>.065)return false;
      if(Math.abs(local.z-panel.center.z)>.09)return false;
      const bodyNormal=new THREE.Vector3(0,0,1).transformDirection(panel.body.matrixWorld);
      if(Math.abs(bodyNormal.dot(normal))<.85)return false;
      const spec=profile(panel),x=Math.abs(local.x-panel.center.x),y=Math.abs(local.y-panel.center.y);
      const core=Math.max(0,spec.width/2-spec.radius),qx=x-core,qy=y-core;
      const signed=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-spec.radius;
      if(signed>.055)return false;
      // Offset-only contact in a squircle's round corner is an open gap.
      if(spec.weight>.5&&signed>0&&x>core&&y>core)return false;
      return true;
    }).map(panel=>({panel,point,center:false,virtual:true}));
  }
  function fourSquircleCenter(from,to,panels,matrix){
    const clicked=panels.filter(p=>p.record.axes&&profile(p).weight>.9&&visible(p.body)&&!m.active.has(p.record.panelId));
    const byKey=new Map(clicked.map(p=>[`${Math.round(p.center.x*1000)}:${Math.round(p.center.y*1000)}`,p]));
    const rect=canvas.getBoundingClientRect(),inverse=matrix.clone().invert();
    for(const p of clicked){
      const x=p.center.x,y=p.center.y,step=.306;
      const group=[p,byKey.get(`${Math.round((x+step)*1000)}:${Math.round(y*1000)}`),
        byKey.get(`${Math.round(x*1000)}:${Math.round((y+step)*1000)}`),
        byKey.get(`${Math.round((x+step)*1000)}:${Math.round((y+step)*1000)}`)];
      if(group.some(q=>!q))continue;
      const vertex=new THREE.Vector3(x+step/2,y+step/2,p.center.z).applyMatrix4(matrix);
      const segment=to.clone().sub(from),fraction=clamp(vertex.clone().sub(from).dot(segment)/Math.max(1e-9,segment.lengthSq()),0,1);
      const at=from.clone().addScaledVector(segment,fraction),flat=at.clone().applyMatrix4(inverse);
      if(Math.abs(flat.z-p.center.z)>.038)continue;
      const a=at.project(camera),b=vertex.project(camera);
      if(Math.hypot((a.x-b.x)*rect.width/2,(a.y-b.y)*rect.height/2)>3)continue;
      return{fraction,point:from.clone().addScaledVector(segment,fraction),panels:group};
    }
    return null;
  }
  function sharedContacts(cardHits,point,matrix,exactFour=false){
    const inverse=matrix.clone().invert(),local=point.clone().applyMatrix4(inverse),dedup=new Map();
    for(const hit of cardHits){
      const panel=hit.panel,spec=profile(panel),at=local.clone().sub(panel.center);
      // A bag's edge may graze a rounded corner while its center is in the
      // open gap. Such offset-only grazes do not activate that squircle.
      const core=spec.width/2-spec.radius;
      if(spec.weight>.5&&!hit.center&&!hit.special&&Math.abs(at.x)>core&&Math.abs(at.y)>core)continue;
      const id=panel.record.panelId,prior=dedup.get(id);
      if(!prior||hit.center)dedup.set(id,hit);
    }
    const chosen=[...dedup.values()].map(hit=>hit.panel);
    if(!chosen.length)return[];
    const first=chosen[0],firstProfile=profile(first),special=exactFour&&chosen.length>=4&&chosen.every(p=>profile(p).weight>.9);
    const allowedPair=p=>{
      if(p===first||special)return true;
      const dx=Math.abs(p.center.x-first.center.x),dy=Math.abs(p.center.y-first.center.y);
      if(dx>.35||dy>.35)return false;
      const clicked=firstProfile.weight>.5||profile(p).weight>.5;
      if(!clicked)return true;
      if((dx>.15)===(dy>.15))return false;
      for(const q of [first,p]){
        const spec=profile(q),along=dx>.15?local.y-q.center.y:local.x-q.center.x;
        if(Math.abs(along)>spec.width/2-spec.radius+.003)return false;
      }
      return true;
    };
    return chosen.filter(allowedPair).map(panel=>{
      const spec=profile(panel),at=local.clone().sub(panel.center);
      return{panelId:panel.record.panelId,direction:beanBagCell(at.x,at.y,spec.width,spec.weight),point:point.clone()};
    });
  }
  function planShot(shot){
    if(!allowed()||!shot)return null;
    const {matrix,normal,facePlane}=launchPlane(),{up,right}=screenBasis();
    const start=shot.start?.clone()||fixedLaunchPosition(),aim=shot.aim?.clone()||screenToPlane(shot.anchor?.x,shot.anchor?.y,facePlane);
    if(!start||!aim)return null;
    const fraction=clamp(shot.fraction,0,1),fumble=fraction>=OVERDRAW_START;
    // The same constant-gravity trajectory supplies preview, collision sweep and flight.
    // At medium power it reaches the locked aim; weak pulls expire before the face.
    const speed=.17+1.38*Math.min(fraction/OVERDRAW_START,1),duration=fumble?.25:FLIGHT_TIME;
    // The face lies one launchStandoff along the flight axis. A slower shot takes
    // longer to reach it, so its gravity lift must use that actual crossing time.
    // Cap the lift for weak pulls; those still fall short instead of auto-reaching.
    const timeToFace=.65/speed,liftTime=Math.min(timeToFace,1.05);
    const velocity=fumble?right.clone().multiplyScalar((serial%2?1:-1)*2).addScaledVector(normal,-1.1).addScaledVector(up,.35):
      aim.clone().sub(start).multiplyScalar(speed/.65).addScaledVector(up,GRAVITY*liftTime/2);
    const end=start.clone().addScaledVector(velocity,duration).addScaledVector(up,-GRAVITY*duration*duration/2);
    const control=start.clone().addScaledVector(velocity,duration/2);
    const plan={start,control,end,duration,velocity,gravity:GRAVITY,aim,
      normal,up,right,fraction,kind:fumble?'fumble':'miss',contacts:[],panelId:null,direction:null,other:null};
    if(fumble)return plan;
    const panels=[...m.panels.values()].filter(p=>a.rig.isPanelVisible(p.record.panelId)&&p.meshes.some(visible));
    a.model.updateMatrixWorld(true);
    const owners=new Map(),meshes=[];for(const p of panels)for(const mesh of p.meshes){meshes.push(mesh);owners.set(mesh,p);}
    const backing=getBacking(),backingMeshes=[];backing?.traverse?.(node=>{if(node.isMesh)backingMeshes.push(node);});
    let previous=start.clone(),found=null;
    for(let sample=1;sample<=64&&!found;sample++){
      const next=pointOn(plan,sample/64),delta=next.clone().sub(previous),distance=delta.length();
      if(distance<1e-8){previous=next;continue;}
      const candidates=[],skin=[];
      for(const offset of offsets){
        const shift=right.clone().multiplyScalar(offset.x*.05).addScaledVector(up,offset.y*.05);
        sweep.set(previous.clone().add(shift),delta.clone().divideScalar(distance));sweep.far=distance+.001;
        for(const hit of sweep.intersectObjects(meshes,false))if(visible(hit.object)){
          const panel=owners.get(hit.object);if(panel)candidates.push({panel,fraction:(sample-1+hit.distance/distance)/64,point:hit.point,center:offset.lengthSq()===0});
        }
        if(backingMeshes.length)for(const hit of sweep.intersectObjects(backingMeshes,false))skin.push({fraction:(sample-1+hit.distance/distance)/64,point:hit.point});
      }
      const four=fourSquircleCenter(previous,next,panels,matrix);
      if(four)candidates.push(...four.panels.map(panel=>({panel,fraction:(sample-1+four.fraction)/64,point:four.point,special:true})));
      const fromLocal=previous.clone().applyMatrix4(matrix.clone().invert()),toLocal=next.clone().applyMatrix4(matrix.clone().invert());
      const faceDepth=(panels[0]?.center.z??0)+.015,denominator=toLocal.z-fromLocal.z;
      const crossing=Math.abs(denominator)>1e-8?(faceDepth-fromLocal.z)/denominator:-1;
      if(crossing>=0&&crossing<=1){
        const point=previous.clone().lerp(next,crossing);
        candidates.push(...footprintCandidates(point,panels,matrix).map(hit=>({...hit,fraction:(sample-1+crossing)/64})));
      }
      candidates.sort((a,b)=>a.fraction-b.fraction);skin.sort((a,b)=>a.fraction-b.fraction);
      const nearest=candidates[0],surface=skin[0];
      if(nearest&&(!surface||nearest.fraction<=surface.fraction+.002)){
        const at=pointOn(plan,nearest.fraction);
        const exactFour=candidates.some(c=>c.special&&c.fraction<=nearest.fraction+.035);
        const close=candidates.filter(c=>c.fraction<=nearest.fraction+.035&&(!exactFour||c.special));
        if(!exactFour)close.push(...footprintCandidates(at,panels,matrix,nearest.panel).map(hit=>({...hit,fraction:nearest.fraction})));
        const contacts=sharedContacts(close,at,matrix,exactFour);
        if(contacts.length)found={fraction:nearest.fraction,point:at,kind:contacts.some(c=>c.direction)?'hit':'thunk',contacts};
      }else if(surface)found={fraction:surface.fraction,point:pointOn(plan,surface.fraction),kind:visible(backing)?'backing':'energy',contacts:[]};
      previous=next;
    }
    if(found){
      // Reparameterize the prefix of the original quadratic without flattening its arc.
      const t=clamp(found.fraction,.025,1),mid=pointOn(plan,t/2);
      plan.end.copy(found.point);plan.control.copy(mid).multiplyScalar(2).addScaledVector(plan.start,-.5).addScaledVector(plan.end,-.5);
      plan.duration=Math.max(.1,plan.duration*t);plan.kind=found.kind;plan.contacts=found.contacts;
      plan.panelId=found.contacts[0]?.panelId||null;plan.direction=found.contacts[0]?.direction||null;
    }
    for(let sample=1;sample<=40;sample++){
      const t=sample/40,at=pointOn(plan,t);
      const other=bags.find(b=>{const predicted=predict(b,t*plan.duration);return predicted&&predicted.distanceTo(at)<.09;});
      if(other){const mid=pointOn(plan,t/2);plan.kind='bag';plan.other=other;plan.end.copy(at);
        plan.control.copy(mid).multiplyScalar(2).addScaledVector(plan.start,-.5).addScaledVector(plan.end,-.5);plan.duration*=t;break;}
    }
    return plan;
  }
  function predict(bag,dt){
    if(bag.phase==='flight'){const time=bag.age+dt;if(time<=bag.plan.duration)return pointOn(bag.plan,time/bag.plan.duration);
      if(bag.plan.kind==='energy')return null;const after=time-bag.plan.duration;
      return bag.plan.end.clone().addScaledVector(bag.plan.normal,.8*after).addScaledVector(bag.plan.up,-.2*after-1.6*after*after);}
    if(bag.phase==='slide')return bag.mesh.position.clone().addScaledVector(bag.velocity,dt).addScaledVector(bag.plan.up,-.6*dt*dt).addScaledVector(bag.departure,Math.max(0,bag.age+dt-.16));
    if(bag.phase==='fall')return bag.mesh.position.clone().addScaledVector(bag.velocity,dt).addScaledVector(bag.plan.up,-1.6*dt*dt);
    return null;
  }
  function launch(plan,from=null){
    if(heldId===null)return false;
    const id=heldId,mesh=heldMesh;
    heldId=null;heldMesh=null;refreshHint();
    cursorAt(pointer?.x??-1,pointer?.y??-1,pointer?.type);
    if(!plan){mesh?.removeFromParent();supply?.recover(id);return false;}
    sounds.unlock();serial++;mesh.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
    mesh.visible=true;mesh.position.copy(from||plan.start);
    const loading=Boolean(from&&from.distanceTo(plan.start)>.08);
    bags.push({id,mesh,plan,age:0,phase:loading?'load':'flight',loadStart:from?.clone(),velocity:new THREE.Vector3(),spin:new THREE.Vector3(2.3,3.2,1.7)});
    lastPlan=plan;totals.throws++;return true;
  }
  // Programmatic review entry retains the older API; UI throws always require pickup and release.
  function planThrow(x,y){return planShot({anchor:{x,y},fraction:.55});}
  function throwAt(x,y){if(heldId!==null)return false;const id=supply?.snapshot().availableIds[0];if(id===undefined)return false;
    const position=getContainer()?.storedBags[id]?.getWorldPosition(new THREE.Vector3())||new THREE.Vector3();
    if(!arm(id,position))return false;return launch(planThrow(x,y));}
  function removeBag(bag,recover=true,notifyCatch=true){bag.mesh.removeFromParent();const index=bags.indexOf(bag);if(index>=0)bags.splice(index,1);if(recover&&index>=0){supply?.recover(bag.id);if(notifyCatch)onCatch(bag.id);}}
  function beginRecovery(bag){const target=getRecoveryTarget(bag.id,bag.mesh.position.clone());if(!target?.isVector3)return false;
    bag.phase='recover';bag.age=0;bag.recovery={start:bag.mesh.position.clone(),control:bag.mesh.position.clone().lerp(target,.5).addScaledVector(bag.plan.up,.16),end:target.clone()};return true;}
  function puff(point,plan){
    if(puffs.length>=4)removePuff(puffs[0]);const group=new THREE.Group();group.position.copy(point);root.add(group);const particles=[],count=m.reducedMotion?3:18;
    for(let i=0;i<count;i++){const fire=i<count*.45,material=new THREE.SpriteMaterial({map:smoke,color:fire?'#ff9a28':'#6c7178',transparent:true,depthWrite:false,opacity:1,blending:fire?THREE.AdditiveBlending:THREE.NormalBlending});
      const sprite=new THREE.Sprite(material);sprite.scale.setScalar(fire?.08:.13);group.add(sprite);
      particles.push({sprite,fire,velocity:plan.right.clone().multiplyScalar((i%5-2)*.12).addScaledVector(plan.up,.18+(i%4)*.07).addScaledVector(plan.normal,.12+(i%3)*.07)});}
    puffs.push({group,particles,age:0,duration:m.reducedMotion?.2:.95});
  }
  function removePuff(puff){for(const p of puff.particles)p.sprite.material.dispose();puff.group.removeFromParent();const i=puffs.indexOf(puff);if(i>=0)puffs.splice(i,1);}
  function impact(bag){
    const plan=bag.plan;bag.mesh.position.copy(plan.end);
    if(plan.kind==='hit'){
      totals.hits++;
      a.rig.deployNode.updateWorldMatrix(true,false);
      const inverse=a.rig.deployNode.matrixWorld.clone().invert();
      for(const contact of plan.contacts){if(contact.direction)m.impactSpin(contact.panelId,contact.direction);a.requestCardContact(contact.panelId,contact.point.clone().applyMatrix4(inverse));}
      sounds.play('hit');
    }else{
      sounds.play('miss');
      if(plan.kind==='thunk'){totals.thunks++;a.rig.deployNode.updateWorldMatrix(true,false);for(const contact of plan.contacts)a.requestCardContact(contact.panelId,contact.point.clone().applyMatrix4(a.rig.deployNode.matrixWorld.clone().invert()));}
      else if(plan.kind==='energy'){totals.burns++;puff(plan.end,plan);supply?.destroy(bag.id);onDestroy(bag.id);removeBag(bag,false);return;}
      else if(plan.kind==='backing')totals.backings++;
      else if(plan.kind==='fumble'){totals.fumbles++;totals.misses++;}
      else if(plan.kind==='bag'){totals.bagCollisions++;if(bags.includes(plan.other)){plan.other.phase='fall';plan.other.velocity.copy(plan.normal).multiplyScalar(.85).addScaledVector(plan.right,-.4);}}
      else totals.misses++;
    }
    bag.phase=plan.kind==='thunk'||plan.kind==='backing'?'slide':'fall';bag.age=0;
    const direction=plan.direction;
    const sideways=direction?new THREE.Vector3(...({E:[1,0,0],NE:[1,1,0],N:[0,1,0],NW:[-1,1,0],W:[-1,0,0],SW:[-1,-1,0],S:[0,-1,0],SE:[1,-1,0]}[direction])).transformDirection(a.rig.deployNode.matrixWorld):plan.right.clone().multiplyScalar((serial%2?1:-1)*.25);
    bag.departure=plan.normal.clone().multiplyScalar(plan.kind==='backing'?.45:1.05);
    bag.velocity.copy(sideways).multiplyScalar(.4).addScaledVector(plan.up,-.2);if(bag.phase==='fall')bag.velocity.add(bag.departure);
    bag.mesh.scale.set(1.12,1.12,.7);
  }
  function clear(){cancel();for(const b of [...bags])removeBag(b,true,false);for(const p of [...puffs])removePuff(p);sounds.suspend();}
  function update(dt){
    const hidden=!allowed();if(dock.hidden!==hidden)dock.hidden=hidden;
    if(!allowed()&&modeActive)cancel();
    if(modeActive&&heldId===null)armNextAvailable();
    if(heldId!==null&&pointer)cursorAt(pointer.x,pointer.y,pointer.type);
    drawSling();
    tutorial.classList.toggle('reduced',Boolean(m.reducedMotion));
    if(hidden)tutorial.hidden=true;
    if(disposed||suspended||a.suspended||m.paused||document.hidden)return;
    const step=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    for(const bag of [...bags]){
      bag.age+=step;
      if(bag.phase==='load'){bag.mesh.position.copy(bag.loadStart).lerp(bag.plan.start,Math.min(1,bag.age/.1));
        if(bag.age>=.1){bag.mesh.position.copy(bag.plan.start);bag.phase='flight';bag.age=0;}}
      else if(bag.phase==='flight'){bag.mesh.position.copy(pointOn(bag.plan,Math.min(1,bag.age/bag.plan.duration)));if(bag.age>=bag.plan.duration)impact(bag);}
      else if(bag.phase==='slide'){bag.velocity.addScaledVector(bag.plan.up,-1.2*step);bag.mesh.position.addScaledVector(bag.velocity,step);if(bag.age>=.16){bag.phase='fall';bag.age=0;bag.velocity.add(bag.departure);}}
      else if(bag.phase==='recover'){bag.mesh.position.copy(pointOn(bag.recovery,Math.min(1,bag.age/.42)));bag.mesh.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,step*8));if(bag.age>=.42){removeBag(bag);continue;}}
      else{bag.velocity.addScaledVector(bag.plan.up,-3.2*step);bag.mesh.position.addScaledVector(bag.velocity,step);bag.mesh.scale.lerp(new THREE.Vector3(1,1,1),Math.min(1,step*6));}
      if(!m.reducedMotion){bag.mesh.rotation.x+=bag.spin.x*step;bag.mesh.rotation.z+=bag.spin.z*step;}
      const projected=bag.mesh.position.clone().project(camera);
      if(bag.phase==='fall'&&(bag.age>.42||projected.y<-.82))beginRecovery(bag);
      if(bag.phase==='fall'&&(projected.y< -1.18||bag.age>3.5))removeBag(bag);
    }
    for(const effect of [...puffs]){effect.age+=step;const t=effect.age/effect.duration;
      for(const p of effect.particles){p.sprite.position.addScaledVector(p.velocity,step);p.sprite.scale.setScalar((p.fire?.08:.13)*(1+t*2));p.sprite.material.opacity=Math.max(0,1-t*(p.fire?1.8:1))*contrastGain;}
      if(t>=1)removePuff(effect);}
  }
  const previousReset=m.onReset,reset=()=>{previousReset?.();clear();};m.onReset=reset;
  refreshHint();
  return{planShot,planThrow,throwAt,update,clear,cancel,setContrast(gain){
      contrastGain=clamp(Number.isFinite(gain)?gain:1,0,2);
      const opacity=clamp(.24+.56*contrastGain,0,1),glow=Math.round(2+9*contrastGain);
      sling.querySelector('.bands').style.strokeOpacity=String(opacity);
      sling.querySelector('.fork').style.strokeOpacity=String(opacity);
      sling.querySelector('.preview').style.strokeOpacity=String(opacity);
      sling.querySelector('.target').style.strokeOpacity=String(opacity);
      sling.querySelector('.impact').style.strokeOpacity=String(opacity);
      sling.querySelector('.power-normal').style.strokeOpacity=String(opacity);
      sling.querySelector('.overdraw-zone').style.strokeOpacity=String(opacity*.7);
      sling.querySelector('.power-overdraw').style.opacity=String(opacity);
      sling.style.filter=`drop-shadow(0 0 ${glow}px rgba(236,182,108,${Math.min(1,.45*contrastGain)}))`;
      tutorial.style.setProperty('--skills-tutorial-glow',`${Math.round(2+9*contrastGain)}px`);
      tutorial.style.borderColor=`rgba(224,191,130,${opacity})`;
      tutorial.querySelector('.demo').style.opacity=String(opacity);
    },
    syncSettings:sounds.sync,get mode(){return modeActive;},get heldId(){return heldId;},get gestureActive(){return Boolean(gesture);},endGesture:cancel,
    get bags(){return bags;},get lastPlan(){return lastPlan;},get launchStandoff(){return launchStandoff;},get cubeWidth(){return cubeWidth;},
    getStats:()=>({...totals,active:bags.length,puffs:puffs.length,modeActive,heldId,heldVisible:heldMesh?.visible??false,pull:gesture?.pull??0,maxPull:gesture?.maxPull??0,
      aim:gesture?.aim?.toArray()??null,previewStart:gesture?.plan?.start?.toArray()??null,
      previewControl:gesture?.plan?.control?.toArray()??null,previewEnd:gesture?.plan?.end?.toArray()??null,
      previewDuration:gesture?.plan?.duration??null,previewKind:gesture?.plan?.kind??null,supply:supply?.snapshot(),sounds:sounds.getStats()}),
    suspend(){suspended=true;dock.hidden=true;notice.hidden=true;clear();},resume(){suspended=false;},
    dispose(){if(disposed)return;disposed=true;events.abort();unsubscribe?.();clearTimeout(noticeTimer);clearTimeout(tutorialTimer);notice.remove();tutorial.remove();sling.remove();
      if(m.onReset===reset)m.onReset=previousReset;a.input?.setThrowHandler(null);clear();sounds.dispose();dock.remove();root.removeFromParent();smoke.dispose();if(ownsVisuals)visuals.dispose();}
  };
}





