import * as THREE from 'three';
import {pathsFromV7Manifest} from './lattice-paths.mjs';
import {ReflectedFilamentField} from './ReflectedFilamentField.mjs';
import {RigVisuals} from './RigVisuals.mjs';
import {PanelMotion} from './preview-motion.mjs';
import {PanelRipple} from './PanelRipple.mjs';
import {RippleFieldCoupler} from './RippleFieldCoupler.mjs';
import {mountPanelInput} from './preview-input.mjs';
import {PanelGraphicOrientation} from './PanelGraphicOrientation.mjs';
import {CardNameFrame,CornerActionArtwork} from './CardNameFrame.mjs';
import {FaceCarrierRoll} from './FaceCarrierRoll.mjs';
import {createFastPassSurprises} from './FastPassSurprise.mjs';

const finite=Number.isFinite;

/** Attach the skills mechanism to a host-owned GLTF scene, camera, renderer, and loop. */
export function createPanelAssembly({model,gltf,manifest,renderer,camera,interactive=true,autoFocus=false,onSelect=()=>{}}){
  if(!model||!gltf?.parser||!manifest||!renderer||!camera)throw new TypeError('Model, GLTF parser, manifest, renderer and camera required');
  const rawNodes=new Map(),nameMap={},morphPanels=new Set();
  model.traverse(object=>{const association=gltf.parser.associations.get(object);
    if(association?.nodes!==undefined){const node=gltf.parser.json.nodes[association.nodes];
      if(node?.name){rawNodes.set(node.name,object);nameMap[node.name]=object.name;}}
    if(object.isMesh&&object.morphTargetDictionary?.Clicked!==undefined){let owner=object;
      while(owner&&!owner.userData.panel_id)owner=owner.parent;
      if(owner?.userData.panel_id)morphPanels.add(owner.userData.panel_id);}});
  const findRawNode=name=>rawNodes.get(name)||model.getObjectByName(name);
  const rig=new RigVisuals(model,manifest,findRawNode),motion=new PanelMotion(rig,manifest,findRawNode),ripple=new PanelRipple(manifest);
  motion.setRippleGraph(ripple);
  const graphics=new PanelGraphicOrientation(motion);
  const nameFrames=new CardNameFrame({motion,graphics});
  const surprise=createFastPassSurprises({artwork:nameFrames,motion,isIncomingHidden:(id,cycle)=>{
    const panel=motion.panels.get(id);
    rig.deployNode.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
    const frontAtStart=new THREE.Vector3(0,0,1).applyQuaternion(cycle.start||panel.baseQuaternion).z>=0;
    const incomingNormal=new THREE.Vector3(0,0,frontAtStart?-1:1).applyQuaternion(panel.baseQuaternion).transformDirection(rig.deployNode.matrixWorld);
    const towardCamera=camera.getWorldPosition(new THREE.Vector3()).sub(panel.center.clone().applyMatrix4(rig.deployNode.matrixWorld)).normalize();
    return incomingNormal.dot(towardCamera)<-.15;
  }});
  graphics.bindArtwork();nameFrames.invalidate();nameFrames.update();motion.onDisplayChange=(id,options)=>graphics.syncDisplay(id,options);
  const faceCarrier=manifest.clearanceMetadata?.faceBearing?.enabled?new FaceCarrierRoll({rig,motion,model,manifest,findRawNode}):null;
  const rippleReview={active:false,clickToPulse:false,influenceCards:true,excitation:'flip',strength:.025,axis:'H'};
  const zeroRipple=new Float64Array(ripple.count);
  const pendingPulses=new Map();const initialOverrides=rig.getPathOverrides();
  let pathResult=pathsFromV7Manifest(manifest,{pathOverrides:initialOverrides});
  const field=new ReflectedFilamentField(pathResult.paths,{axleDiameter:rig.options.axleDiameter});rig.deployNode.add(field);
  ripple.setCapTips(initialOverrides.perimeterPanels,initialOverrides.squareVisualAxes);
  const coupler=new RippleFieldCoupler(field,ripple);
  let hostReduced=false,userReduced=false,effectElapsed=0,disposed=false,suspended=false;
  let cornerAction=null;
  let pendingFocus=null,focusAge=0,contactSerial=0;
  motion.canRetract=()=>((rippleReview.active&&!rippleReview.influenceCards)||ripple.canRetract())&&pendingPulses.size===0&&(!faceCarrier||faceCarrier.canRetract());
  motion.onFlipStart=({panelId,axis})=>{graphics.prepareFlip(panelId,axis);};
  motion.onFlipEnd=({panelId})=>nameFrames.clearPlaceholder(panelId);
  motion.onFlipProgress=({panelId,axis,angle,previousAngle})=>{
    const p=motion.panels.get(panelId);
    // Each further half-turn exposes the other print. Prepare it while it is
    // hidden, including when a corner action extends an existing turn.
    if(p?.turn)for(let boundary=Math.floor(previousAngle/Math.PI)+1;boundary*Math.PI<angle;boundary++){
      if(boundary<1)continue;
      const start=motion._turnQuaternion(p.turn,boundary*Math.PI,new THREE.Quaternion());
      graphics.prepareFlip(panelId,axis,{start,desired:motion.getLogicalSide(panelId)});
    }
    if(!p || !ripple.index.has(panelId))return;
    const morph=p.morphs[0],w=morph?.morphTargetInfluences?.[morph.morphTargetDictionary.Clicked]||0;
    const size=p.record.geometry?.neutralSize?.[0]||p.record.energyPolicy?.flipPullWidthM||.2;
    const clicked=p.record.geometry?.clickedSize?.[0]||size;
    // Bounded web tug follows the edge's signed normal travel, then releases as it returns.
    ripple.impulseFlip(panelId,[axis.x,axis.y],ripple.options.flipCoupling*(Math.sin(angle)-Math.sin(previousAngle)),(size+(clicked-size)*w)/2);
  };
  motion.onShapeProgress=({panelId,value,previousValue})=>{
    const p=motion.panels.get(panelId);if(!p||!ripple.index.has(panelId)||hostReduced||userReduced)return;
    // A growing offset/thickness profile briefly tugs the local web.
    const centerShift=rig.options.clickedCardOffset??0;
    const growth=(rig.options.clickedCardThickness-rig.options.neutralCardThickness)||0;
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(p.baseQuaternion).z;
    const impulse=(value-previousValue)*(centerShift+growth*.25)*normal*40;
    if(impulse){
      if(rig.deployment===1)ripple.impulse(panelId,impulse);
      else pendingPulses.set(panelId,(pendingPulses.get(panelId)||0)+impulse);
    }
  };
  motion.onReset=()=>{cornerAction=null;nameFrames.clearPlaceholders();graphics.reset();faceCarrier?.reset();};
  if(autoFocus)motion.setAutoFocus(true);
  const assembly={model,manifest,renderer,camera,rig,motion,ripple,field,coupler,graphics,nameFrames,faceCarrier,input:null,pendingPulses,rippleReview,
    rawNodes,nameMap,morphPanels:[...morphPanels],get pathResult(){return pathResult;},get effectElapsed(){return effectElapsed;},
    get hostReducedMotion(){return hostReduced;},get userReducedMotion(){return userReduced;},get suspended(){return suspended;},
    get cornerActionBusy(){return isCornerActionBusy();},requestCornerAction,
    setHostReducedMotion(value){hostReduced=Boolean(value);refreshPolicy();},
    setUserReducedMotion(value){userReduced=Boolean(value);refreshPolicy();},
    refreshPolicy,update,updateFocus,nonfocalSettled,rebuildPathsFromRig,requestRipplePulse,requestCardContact,setRippleReview,requestReviewRipple,getRippleTransferStats,
    setClicked:(id,value)=>motion.setClicked(id,value),setAllClicked:value=>motion.setAllClicked(value),invertClicked:()=>motion.invertClicked(),
    toggleDisplayBaseline:()=>motion.toggleDisplayBaseline(),getLogicalSide:id=>motion.getLogicalSide(id),getDisplayState:id=>motion.getDisplayState(id),
    setArtwork:(id,maps)=>graphics.setArtwork(id,maps),
    setFocused(value){motion.setAutoFocus(false);motion.setFocused(value);},
    setTarget(value){motion.setAutoFocus(false);motion.setTarget(value);},
    suspend(){suspended=true;nameFrames.clearPlaceholders();},resume(){suspended=false;},dispose};
  function getCornerActions(){
    model.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const corners=manifest.perimeterPanels.filter(p=>p.kind==='curved_corner').map(p=>{
      const panel=motion.panels.get(p.panelId),ndc=panel.center.clone().applyMatrix4(rig.deployNode.matrixWorld).project(camera);
      return{id:p.panelId,x:ndc.x,y:ndc.y};
    }).sort((a,b)=>b.y-a.y);
    const top=corners.slice(0,2).sort((a,b)=>a.x-b.x),bottom=corners.slice(2).sort((a,b)=>a.x-b.x);
    return Object.fromEntries([[top[0]?.id,'set-all-unclicked'],[top[1]?.id,'set-all-clicked'],
      [bottom[0]?.id,'show-names-or-icons'],[bottom[1]?.id,'toggle-clicked']]);
  }
  const cornerActions={
    'set-all-unclicked':()=>motion.normalizeAllClicked(false),'set-all-clicked':()=>motion.normalizeAllClicked(true),
    'show-names-or-icons':()=>motion.toggleDisplayBaselineAnimated(),'toggle-clicked':()=>motion.invertClicked()};
  assembly.getCornerActions=getCornerActions;motion.getCornerActions=getCornerActions;
  const cornerArtwork=new CornerActionArtwork({motion,manifest,getCornerActions,onChange:()=>assembly.requestRender?.()});assembly.cornerArtwork=cornerArtwork;
  if(interactive)assembly.input=mountPanelInput({renderer,camera,motion,model,manifest,findRawNode,onSelect,onFastPass:surprise,
    onClick:(id,hit)=>{
      const corner=Boolean(getCornerActions()[id]);
      // Consume rejected corner presses before they can inject contacts or fall
      // through to an ordinary hinge flip.
      if(corner&&!requestCornerAction(id))return true;
      requestCardContact(id,hit.contactPoint||hit.facePoint);
      if(rippleReview.active&&rippleReview.clickToPulse)requestReviewRipple(id,hit.zone);
      return corner;
    }});
  return assembly;

  function isCornerActionBusy(){
    if(!cornerAction)return false;
    if(cornerAction.starting)return true;
    for(const id of cornerAction.panelIds){
      const panel=motion.panels.get(id),pending=motion.queue.get(id),turn=motion.active.get(id);
      const flipping=cornerAction.flips&&((pending&&(!pending.hover||pending.exitCommitted||pending.afterAlignment))||
        (turn&&(!turn.hover||turn.exitCommitted||turn.afterAlignment)));
      if(panel.clickProgress<1||flipping)return true;
    }
    cornerAction=null;return false;
  }
  function requestCornerAction(id){
    const action=getCornerActions()[id];
    if(disposed||!action||isCornerActionBusy()||!motion.focused||motion.paused||!rig.isPanelVisible(id))return false;
    cornerAction={starting:true,flips:true,panelIds:manifest.squarePanels.map(panel=>panel.panelId)};
    try{
      if(cornerActions[action]()===false){cornerAction=null;return false;}
      cornerAction.starting=false;assembly.requestRender?.();return true;
    }catch(error){cornerAction=null;throw error;}
  }

  function refreshPolicy(){if(disposed)return;const reduced=hostReduced||userReduced;
    field.setOptions({reducedMotion:reduced});motion.reducedMotion=reduced;ripple.reducedMotion=reduced;
    motion.paused=field.options.paused;ripple.paused=field.options.paused;
    if(reduced||field.options.paused){pendingPulses.clear();ripple.clear();motion.setRippleArray(ripple.ids,ripple.height);coupler.update();}
  }
  function settleReduced(){if(field.options.paused||document.hidden)return;
    for(let i=0;i<40;i++){motion.update(0);
      if(motion.queue.size===0&&motion.active.size===0&&Math.abs(rig.deployment-motion.target)<1e-8)break;}
  }
  function update(dt){if(disposed||suspended||document.hidden)return false;
    cornerArtwork.update();
    dt=Math.max(0,Math.min(.1,finite(dt)?dt:0));model.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    if(motion.autoFocus)updateFocus(dt);
    if(!field.options.paused)faceCarrier?.update(dt,camera,hostReduced||userReduced);
    if(hostReduced||userReduced){settleReduced();nameFrames.update();field.update(effectElapsed,camera);coupler.captureSecondaryRest();coupler.update();return true;}
    if(field.options.paused){if(!ripple.sleeping||pendingPulses.size){pendingPulses.clear();ripple.clear();motion.setRippleArray(ripple.ids,ripple.height);coupler.update();}return false;}
    if(!motion.focused)pendingPulses.clear();
    if(rig.deployment===1&&pendingPulses.size){for(const [id,pulse] of pendingPulses)if(typeof pulse==='number')ripple.impulse(id,pulse);else if(pulse.kind==='pointer-contact')ripple.impulseAt(...pulse.point,pulse.strength);else injectReviewPulse(pulse);pendingPulses.clear();}
    ripple.setSettling(!(rippleReview.active&&!rippleReview.influenceCards)&&(motion.target<1||!motion.focused)&&motion.active.size===0);
    ripple.update(dt);applyRippleToCards();motion.update(dt);nameFrames.update();
    if(!nonfocalSettled()){effectElapsed+=dt;field.update(effectElapsed,camera);coupler.captureSecondaryRest();coupler.update();}
    return true;
  }
  function updateFocus(dt=0){rig.deployNode.updateMatrixWorld(true);model.updateMatrixWorld(true);
    const faceZ=motion.panels.values().next().value.center.z;
    const face=new THREE.Vector3(0,0,faceZ).applyMatrix4(rig.deployNode.matrixWorld);
    const normal=new THREE.Vector3(0,0,1).transformDirection(rig.deployNode.matrixWorld);
    const worldCamera=camera.getWorldPosition(new THREE.Vector3());
    const inFront=worldCamera.clone().sub(face).dot(normal)>0;
    const local=worldCamera.clone().applyMatrix4(new THREE.Matrix4().copy(model.matrixWorld).invert());
    const side=Math.max(Math.abs(local.x),Math.abs(local.y));
    const dominant=motion.focused?local.z>side*.94:local.z>side*1.08;
    const next=inFront&&dominant;
    if(next===motion.focused){pendingFocus=null;focusAge=0;return;}
    if(pendingFocus!==next){pendingFocus=next;focusAge=0;}
    focusAge+=Math.max(0,dt);
    // Brief edge crossings should not pump deployment in and out. Roll tracks
    // screen orientation independently and already starts during this dwell.
    if(hostReduced||userReduced||focusAge>=(next ? .16 : .45)){motion.setFocused(next);pendingFocus=null;focusAge=0;}
  }
  function nonfocalSettled(){return Boolean(motion.autoFocus&&!motion.focused&&rig.deployment===0&&
    motion.active.size===0&&motion.queue.size===0&&ripple.canRetract()&&pendingFocus===null&&(!faceCarrier||faceCarrier.isSettled()));}
  function rebuildPathsFromRig(){const overrides=rig.getPathOverrides();pathResult=pathsFromV7Manifest(manifest,{pathOverrides:overrides});
    ripple.setCapTips(overrides.perimeterPanels,overrides.squareVisualAxes);field.setPaths(pathResult.paths,{axleDiameter:rig.options.axleDiameter});coupler.update();return pathResult;}
  function requestRipplePulse(panelId,strength){if(!motion.focused||!rig.isPanelVisible(panelId)||!ripple.index.has(panelId)||!finite(strength)||hostReduced||userReduced)return false;
    if(rig.deployment===1)return ripple.impulse(panelId,strength);
    pendingPulses.set(panelId,(pendingPulses.get(panelId)||0)+strength);return true;}
  function requestCardContact(panelId,point){
    if(!motion.focused||!rig.isPanelVisible(panelId)||hostReduced||userReduced||field.options.paused||!ripple.options.enabled||!point||!finite(point.x)||!finite(point.y))return false;
    // A click presses into the face at the raycast contact, independently of
    // shape toggles and the optional diagnostic flip pulls.
    const pulse={kind:'pointer-contact',point:[point.x,point.y],strength:-1};
    motion.setTarget(1);
    if(rig.deployment===1)return ripple.impulseAt(...pulse.point,pulse.strength);
    pendingPulses.set(`pointer-contact:${++contactSerial}`,pulse);return true;
  }
  function applyRippleToCards(){const enabled=(!rippleReview.active||rippleReview.influenceCards)&&rig.deployment===1;
    motion.setRippleArray(ripple.ids,enabled?ripple.height:zeroRipple);}
  function getRippleTransferStats(){let appliedPeak=0,tiltPeak=0,edgePeak=0;for(const id of ripple.ids){const p=motion.panels.get(id);const center=Math.abs(p.pivot.position.z-p.restPosition.z),tilt=p.tiltQuaternion.angleTo(new THREE.Quaternion());appliedPeak=Math.max(appliedPeak,center);tiltPeak=Math.max(tiltPeak,tilt);edgePeak=Math.max(edgePeak,center+2*p.radius*Math.sin(tilt/2));}
    return{fieldPeak:ripple.getStats().maxHeight,appliedPeak,tiltPeak,edgePeak,
      normalTravelLimitM:motion.normalTravelLimitM,combinedPoseLimitM:motion.combinedPoseLimitM,
      enabled:!rippleReview.active||rippleReview.influenceCards,fullyRaised:rig.deployment===1};}
  function setRippleReview(partial={}){
    for(const key of ['active','clickToPulse','influenceCards'])if(Object.hasOwn(partial,key))rippleReview[key]=Boolean(partial[key]);
    if(['flip','contact'].includes(partial.excitation))rippleReview.excitation=partial.excitation;
    if(['H','V','D+','D-'].includes(partial.axis))rippleReview.axis=partial.axis;
    if(finite(partial.strength))rippleReview.strength=Math.max(-.25,Math.min(.25,partial.strength));
    if(rippleReview.active&&rippleReview.influenceCards&&motion.focused)motion.setTarget(1);
    applyRippleToCards();ripple._notify();return rippleReview;
  }
  function requestReviewRipple(panelId,zone=null){
    if(!motion.focused||hostReduced||userReduced||field.options.paused||!ripple.options.enabled)return false;
    const p=motion.panels.get(panelId);if(!p||!rig.isPanelVisible(panelId))return false;
    if(rippleReview.influenceCards)motion.setTarget(1);
    const axis=p.turn?.axis||p.lastFlipAxis||motion._axis(p,zone||'N');
    const pulse={panelId,zone,strength:rippleReview.strength,excitation:rippleReview.excitation,axisVector:[axis.x,axis.y]};
    if(rippleReview.influenceCards&&rig.deployment!==1){const key=`review:${panelId}:${pulse.axisVector.join(',')}:${pulse.excitation}`,before=pendingPulses.get(key);
      pulse.strength+=typeof before==='object'?before.strength:0;if(Math.abs(pulse.strength)<1e-12)pendingPulses.delete(key);else pendingPulses.set(key,pulse);return true;}
    return injectReviewPulse(pulse);
  }
  function injectReviewPulse({panelId,strength,excitation,axisVector}){
    const p=motion.panels.get(panelId);
    // A diagnostic tap represents a short accumulated contact, rather than one
    // simulation frame of the much longer flip input. Keep the graph's clamps.
    const contactStrength=strength*32;
    if(excitation==='flip'&&ripple.index.has(panelId)){
      const fallback=motion._axis(p,'N');
      return ripple.impulseFlip(panelId,axisVector||[fallback.x,fallback.y],contactStrength*ripple.options.flipCoupling,
        (p.record.geometry?.neutralSize?.[0]||p.record.energyPolicy?.flipPullWidthM||.2)/2);
    }
    return ripple.impulseAt(p.center.x,p.center.y,contactStrength);
  }
  function dispose(){if(disposed)return;disposed=true;cornerAction=null;assembly.input?.dispose();pendingPulses.clear();
    coupler.dispose();ripple.dispose();motion.dispose();cornerArtwork.dispose();nameFrames.dispose();graphics.dispose();field.dispose();faceCarrier?.dispose();rig.dispose();rig.deployNode.remove(field);}
}

