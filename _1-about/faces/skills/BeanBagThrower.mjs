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
const AIM_MAX_ANGLE=THREE.MathUtils.degToRad(34),AIM_MAX_HEIGHT=.55,POWER_START=.32,POSE_TIME=.72;
const offsets=[new THREE.Vector2(0,0),...[-1,0,1].flatMap(x=>[-1,0,1].filter(y=>x||y).map(y=>new THREE.Vector2(x,y)))];

/** Owns the held bag, placement/throw input, complete arc plans and their recovery. */
export function createBeanBagThrower({assembly:a,camera,controls,canvas,getBacking,getSettings=()=>({}),getContainer=()=>null,supply,visuals:providedVisuals,getRecoveryTarget=()=>null,onCatch=()=>{},onDestroy=()=>{}}){
  const ownsVisuals=!providedVisuals,visuals=providedVisuals||createBeanBagVisuals();
  const m=a.motion,scene=(()=>{let n=a.model;while(n.parent)n=n.parent;return n;})(),root=new THREE.Group();
  root.name='Skills thrown bean bags';scene.add(root);
  const slingGroup=new THREE.Group();slingGroup.name='Ground-planted beanbag slingshot';root.add(slingGroup);
  const slingMaterial=new THREE.MeshStandardMaterial({color:'#b99a5d',metalness:.55,roughness:.38,emissive:'#6a3f16',emissiveIntensity:.6});
  const slingDark=new THREE.MeshStandardMaterial({color:'#382b1b',metalness:.3,roughness:.5});
  const slingRod=new THREE.CylinderGeometry(.009,.012,1,10);
  function slingBar(from,to,radius=1){const vector=to.clone().sub(from),mesh=new THREE.Mesh(slingRod,slingMaterial);mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vector.clone().normalize());mesh.scale.set(radius,vector.length(),radius);slingGroup.add(mesh);return mesh;}
  slingBar(new THREE.Vector3(-.055,0,0),new THREE.Vector3(-.055,.13,0));slingBar(new THREE.Vector3(.055,0,0),new THREE.Vector3(.055,.13,0));
  slingBar(new THREE.Vector3(-.055,.13,0),new THREE.Vector3(-.027,.145,0),.72);slingBar(new THREE.Vector3(.055,.13,0),new THREE.Vector3(.027,.145,0),.72);
  const pouchGeometry=new THREE.SphereGeometry(.026,12,8),pouch=new THREE.Mesh(pouchGeometry,slingDark);pouch.scale.set(1,.55,.8);pouch.position.set(0,.012,.012);slingGroup.add(pouch);
  const bandGeometry=new THREE.CylinderGeometry(.0025,.0025,1,6),bandMaterial=new THREE.MeshStandardMaterial({color:'#ecb66c',emissive:'#ad6a29'});
  const bands=[new THREE.Mesh(bandGeometry,bandMaterial),new THREE.Mesh(bandGeometry,bandMaterial)];
  for(const band of bands)slingGroup.add(band);
  const glowTexture=puffTexture(),groundGlow=new THREE.Mesh(new THREE.PlaneGeometry(.32,.24),new THREE.MeshBasicMaterial({map:glowTexture,color:'#f5d188',transparent:true,opacity:.24,depthWrite:false,blending:THREE.AdditiveBlending}));
  groundGlow.name='Beanbag slingshot floor glow';groundGlow.rotation.x=-Math.PI/2;groundGlow.position.y=.004;root.add(groundGlow);
  const floorShadowMaterial=new THREE.LineBasicMaterial({color:'#f5d188',transparent:true,opacity:.58,depthWrite:false});
  const floorArcLine=new THREE.Line(new THREE.BufferGeometry(),floorShadowMaterial);floorArcLine.name='Beanbag arc glow shadow on floor';root.add(floorArcLine);floorArcLine.visible=false;
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
  const floorBounds=new THREE.Box3();
  const smoke=puffTexture(),sounds=createBeanBagSounds(()=>getSettings().audio),bags=[],puffs=[],events=new AbortController();
  const ray=new THREE.Raycaster(),sweep=new THREE.Raycaster(),ndc=new THREE.Vector2();
  let modeActive=false,heldId=null,heldMesh=null,suspended=false,disposed=false,serial=0,lastPlan=null,contrastGain=1;
  let phase='placement',aimPoint=null,aimAngle=0,aimHeight=0,power=POWER_START,powerOriginY=0,powerOrigin=POWER_START,powerPlan=null,lastThrowX=0;
  let slingPosition=null,placementPointer=null,shotPointer=null,floorY=0,cursorAnimation=null,bagLoadAnimation=null,slingRise=1;
  let entryPose=null,poseAnimation=null,capturedPose=getSettings().beanbags?.pose||null,entryAutoFocus=null;
  let gameSettings={mode:'simple'};
  let pointer=null,cursorHidden=false,togglePointer=null;
  const totals={throws:0,hits:0,thunks:0,misses:0,backings:0,burns:0,bagCollisions:0,fumbles:0};
  const dock=document.createElement('div');dock.className='skills-beanbag-dock';
  dock.innerHTML='<style>.skills-beanbag-dock{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:12;display:flex;align-items:center;gap:8px;width:max-content;max-width:calc(100vw - 28px);box-sizing:border-box;padding:6px 10px;border:1px solid #a4b2bd;border-radius:10px;background:#17212bea;color:#f8f3df;font:13px/1.25 system-ui;pointer-events:none}.skills-beanbag-dock[hidden]{display:none}.skills-beanbag-dock span{max-width:420px}@media(max-width:480px){.skills-beanbag-dock{bottom:16px;left:50%;width:min(300px,calc(100vw - 100px));font-size:11px;padding:4px 6px;gap:5px}.skills-beanbag-dock span{max-width:none;min-width:0}}</style><span>Click the basket to start or stop · click a card to toss</span>';
  dock.hidden=true;document.body.append(dock);
  const hint=dock.querySelector('span');
  const notice=document.createElement('div');notice.className='skills-beanbag-notice';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
  notice.style.cssText='position:fixed;left:50%;bottom:112px;transform:translateX(-50%);z-index:13;max-width:min(90vw,360px);padding:7px 11px;border-radius:9px;background:#17212bea;color:#f8f3df;font:13px/1.3 system-ui;text-align:center;pointer-events:none';
  notice.hidden=true;document.body.append(notice);
  const help=document.createElement('div');help.className='skills-beanbag-help';
  help.setAttribute('role','status');help.setAttribute('aria-live','polite');
  help.style.cssText='position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:14;max-width:min(90vw,420px);box-sizing:border-box;padding:9px 13px;border:1px solid #e0bf82;border-radius:10px;background:#17212bf2;color:#f8f3df;font:13px/1.35 system-ui;text-align:center;pointer-events:none;box-shadow:0 0 var(--skills-help-glow,10px) #e0bf82';
  help.textContent='Click a card to toss. Esc, B, or the basket exits. Middle-drag pans; right-drag rotates.';
  help.hidden=true;document.body.append(help);
  const sling=document.createElement('div');sling.className='skills-slingshot';sling.style.cssText='position:fixed;inset:0;z-index:11;pointer-events:none;display:none';
  sling.innerHTML='<style>canvas[data-skills-bag-cursor="true"]{cursor:none!important}</style><svg width="100%" height="100%" aria-hidden="true"><path class="fork" fill="none" stroke="#b99a5d" stroke-width="5" stroke-linecap="round"/><path class="bands" fill="none" stroke="#ecb66c" stroke-width="2" stroke-linecap="round"/><path class="floor-shadow" fill="none" stroke="#f5d188" stroke-width="8" stroke-linecap="round" opacity=".42"/><path class="preview" fill="none" stroke="#f5d188" stroke-width="3" stroke-linecap="round"/><circle class="target" r="7" fill="none" stroke="#bcd5e8" stroke-width="1.5"/><circle class="impact" r="8" fill="none" stroke="#ffce69" stroke-width="2"/><path class="fake-pointer" d="M0 0 L0 20 L6 15 L11 25 L15 23 L10 13 L18 12 Z" fill="#fff4c2" stroke="#17212b" stroke-width="1.5"/><path class="power-track" fill="none" stroke="#a4b2bd" stroke-width="6" stroke-linecap="round"/><path class="overdraw-zone" fill="none" stroke="#e94742" stroke-width="6" stroke-linecap="round"/><path class="power-normal" fill="none" stroke="#ffce69" stroke-width="6" stroke-linecap="round"/><path class="power-overdraw" fill="none" stroke="#ff625e" stroke-width="7" stroke-linecap="round"/><text class="power-label" fill="#f8f3df" font-size="12" font-family="system-ui">POWER</text></svg>';
  document.body.append(sling);
  const cursorBag=document.createElement('div');cursorBag.className='skills-beanbag-cursor';cursorBag.setAttribute('aria-hidden','true');
  cursorBag.style.cssText='position:fixed;z-index:13;width:22px;height:19px;border:2px solid #f0dbc3;border-radius:42%;box-sizing:border-box;background:repeating-linear-gradient(35deg,#db7866 0 3px,#c86759 3px 5px);box-shadow:0 0 8px rgba(236,182,108,.7);pointer-events:none;transform:translate(-50%,-50%)';
  cursorBag.hidden=true;document.body.append(cursorBag);
  const tutorial=document.createElement('div');tutorial.className='skills-sling-tutorial';
  tutorial.style.cssText='position:fixed;left:16px;top:175px;z-index:14;pointer-events:none;width:min(300px,calc(100vw - 28px));box-sizing:border-box;padding:11px 14px;border:1px solid #e0bf82;border-radius:11px;background:#17212bf2;color:#f8f3df;font:13px/1.35 system-ui;text-align:center;box-shadow:0 0 var(--skills-tutorial-glow,10px) #e0bf82';
  tutorial.innerHTML='<style>@media(max-width:480px){.skills-sling-tutorial{top:220px!important}}</style><strong>Bean bag slingshot</strong><div class="demo" aria-hidden="true">◎ · · · ◉</div>Placement: ←/→ moves the sling across the face; ↑/↓ changes its distance from the cube. Hold LMB: ←/→ aims; ↑/↓ sets power. Release to throw.';
  tutorial.hidden=true;document.body.append(tutorial);
  let noticeTimer=0,tutorialTimer=0,helpTimer=0,tutorialSeen=false;
  const showNotice=message=>{if(!message)return;notice.textContent=message;notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;notice.textContent='';},4200);};
  const unsubscribe=supply?.subscribe(event=>{refreshHint();showNotice(event.message);});
  function refreshHint(){hint.textContent=modeActive?'Click a card to toss · click the basket or press Esc to exit':'Click the basket to start beanbag toss';}
  function allowed(){
    return !disposed&&!suspended&&!a.suspended&&Boolean(m.focused)&&!m.paused&&getSettings().about?.skills?.enabled!==false;
  }
  function showHelp(){
    clearTimeout(helpTimer);help.hidden=false;
    helpTimer=setTimeout(()=>{help.hidden=true;},5000);
  }
  function hideHelp(){clearTimeout(helpTimer);help.hidden=true;}
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
    const face=new THREE.Vector3(0,0,0).applyMatrix4(matrix);
    const cardDepth=[...m.panels.values()].find(panel=>panel.record.axes)?.center.z??0;
    return{normal,matrix,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,face.clone().addScaledVector(normal,launchStandoff)),face,
      facePlane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,face.clone().addScaledVector(normal,cardDepth))};
  }
  function fixedLaunchPosition(info=launchPlane()){
    if(slingPosition)return slingPosition.clone().add(new THREE.Vector3(0,.145,0));
    const anchor=getContainer()?.floorAnchor?.();
    const base=info.face.clone();base.y=anchor?.y??base.y;
    const depthAxis=new THREE.Vector3(info.normal.x,0,info.normal.z).normalize();
    return base.addScaledVector(depthAxis,launchStandoff).add(new THREE.Vector3(0,.145,0));
  }
  function updateGroundPlan(plan){
    if(floorArcLine.geometry)floorArcLine.geometry.dispose();
    if(!plan){floorArcLine.visible=false;return;}
    updateFloorY();
    const points=[];for(let i=0;i<=18;i++){const point=pointOn(plan,(i/18)*.5);points.push(new THREE.Vector3(point.x,floorY+.006,point.z));}
    floorArcLine.geometry=new THREE.BufferGeometry().setFromPoints(points);floorArcLine.visible=true;
  }
  function placementPlane(){
    updateFloorY();
    return new THREE.Plane(new THREE.Vector3(0,1,0),-floorY);
  }
  function updateFloorY(){
    shell.updateWorldMatrix(true,true);
    floorY=floorBounds.setFromObject(shell).min.y-.06;
  }
  function moveSlingByPointerDelta(dx,dy){
    const info=launchPlane();placementPlane();
    const up=new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(up,info.normal).normalize();
    if(right.lengthSq()<.5)right.set(1,0,0);
    const depthAxis=new THREE.Vector3(info.normal.x,0,info.normal.z).normalize();
    if(depthAxis.lengthSq()<.5)depthAxis.set(0,0,1);
    const rect=canvas.getBoundingClientRect(),base=info.face.clone();base.y=floorY;
    const relative=(slingPosition||fixedLaunchPosition(info)).sub(base);
    const side=clamp(relative.dot(right)+(rect.width?dx/rect.width*cubeWidth*1.56:0),-cubeWidth*.78,cubeWidth*.78);
    const depth=clamp(relative.dot(depthAxis)-(rect.height?dy/rect.height*cubeWidth*1.9:0),cubeWidth*.45,cubeWidth*2.35);
    slingPosition=base.addScaledVector(right,side).addScaledVector(depthAxis,depth);
    slingGroup.position.copy(slingPosition).add(new THREE.Vector3(0,-.16*(1-slingRise),0));groundGlow.position.set(slingPosition.x,floorY+.003,slingPosition.z);
    if(heldMesh&&!bagLoadAnimation){heldMesh.position.copy(slingPosition).add(new THREE.Vector3(0,.145,0));heldMesh.visible=true;}
  }
  function aimForAngle(){
    const info=launchPlane(),up=new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(up,info.normal).normalize();
    if(right.lengthSq()<.5)right.set(1,0,0);
    return info.face.clone().addScaledVector(right,Math.tan(aimAngle)*launchStandoff*.85);
  }
  function project(point){const rect=canvas.getBoundingClientRect(),p=point.clone().project(camera);
    return{x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};}
  function matrixFromTransform(value){
    return new THREE.Matrix4().compose(new THREE.Vector3(...value.position),new THREE.Quaternion(...value.quaternion),new THREE.Vector3(...value.scale));
  }
  function takePoseSnapshot(){
    const backing=getBacking();if(!backing)return null;
    a.model.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);backing.updateWorldMatrix(true,false);
    const cameraWorld=camera.matrixWorld.clone(),cubeWorld=a.model.matrixWorld.clone(),faceWorld=backing.matrixWorld.clone();
    const cameraInverse=cameraWorld.clone().invert(),faceInverse=faceWorld.clone().invert();
    const faceInCamera=new THREE.Matrix4().multiplyMatrices(cameraInverse,faceWorld);
    const cubeInCamera=new THREE.Matrix4().multiplyMatrices(cameraInverse,cubeWorld);
    const cubeToFace=new THREE.Matrix4().multiplyMatrices(faceInverse,cubeWorld);
    const cameraPosition=new THREE.Vector3(),cameraQuaternion=new THREE.Quaternion(),cameraScale=new THREE.Vector3();
    cameraWorld.decompose(cameraPosition,cameraQuaternion,cameraScale);
    const unpack=matrix=>{const p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();matrix.decompose(p,q,s);return{position:p.toArray(),quaternion:q.toArray(),scale:s.toArray()};};
    return{camera:{position:cameraPosition.toArray(),quaternion:cameraQuaternion.toArray(),target:controls?.target?.toArray()||[0,0,0],zoom:camera.zoom,viewOffsetRatio:camera.view?.enabled?camera.view.offsetX/Math.max(1,camera.view.fullWidth):0},cube:unpack(cubeInCamera),face:unpack(faceInCamera),cubeToFace:unpack(cubeToFace)};
  }
  function publishPoseDebug(){
    const metrics={
      'Beanbag camera position':capturedPose?.camera.position.map(value=>value.toFixed(3)).join(', ')||'not captured',
      'Beanbag camera quaternion':capturedPose?.camera.quaternion.map(value=>value.toFixed(3)).join(', ')||'not captured',
      'Beanbag face in camera':capturedPose?`${capturedPose.face.position.map(value=>value.toFixed(3)).join(', ')} | ${capturedPose.face.quaternion.map(value=>value.toFixed(3)).join(', ')}`:'not captured',
      'Beanbag cube in camera':capturedPose?`${capturedPose.cube.position.map(value=>value.toFixed(3)).join(', ')} | ${capturedPose.cube.quaternion.map(value=>value.toFixed(3)).join(', ')}`:'not captured',
      'Beanbag cube relative to face':capturedPose?`${capturedPose.cubeToFace.position.map(value=>value.toFixed(3)).join(', ')} | ${capturedPose.cubeToFace.quaternion.map(value=>value.toFixed(3)).join(', ')}`:'not captured'
    };
    window.registerDebugHooks?.({actions:{'Capture beanbag view from current camera/cube':capturePresentationPose},flags:{'Beanbag view pose':capturedPose?'Captured':'Not captured'},metrics});
  }
  function capturePresentationPose(){
    const pose=takePoseSnapshot();if(!pose)return null;
    capturedPose=pose;gameSettings.pose=structuredClone(pose);gameSettings.presetName='';publishPoseDebug();return structuredClone(pose);
  }
  function clone(value){return value==null?value:structuredClone(value);}
  function getGameSettings(){return{mode:'simple'};}
  function setGameSettings(next={}){
    // Ignore saved slingshot modes and captured camera poses from older visits.
    void next;gameSettings={mode:'simple'};refreshHint();
  }
  function saveViewPreset(name){
    const key=String(name||'').trim().slice(0,32);if(!key)return false;
    const pose=clone(capturedPose);if(!pose)return false;
    gameSettings.presets={...gameSettings.presets,[key]:pose};gameSettings.presetName=key;gameSettings.pose=clone(pose);capturedPose=clone(pose);publishPoseDebug();return true;
  }
  function applyViewPreset(name){
    const pose=gameSettings.presets?.[name];if(!pose)return false;
    gameSettings.presetName=name;gameSettings.pose=clone(pose);capturedPose=clone(pose);publishPoseDebug();return true;
  }
  function targetTransformFromSnapshot(snapshot){
    if(!snapshot)return null;
    a.model.updateWorldMatrix(true,false);
    const savedCameraWorld=new THREE.Matrix4().compose(new THREE.Vector3(...snapshot.camera.position),new THREE.Quaternion(...snapshot.camera.quaternion),new THREE.Vector3(1,1,1));
    const targetFaceWorld=new THREE.Matrix4().multiplyMatrices(savedCameraWorld,matrixFromTransform(snapshot.face));
    const targetCubeWorld=new THREE.Matrix4().multiplyMatrices(targetFaceWorld,matrixFromTransform(snapshot.cubeToFace));
    const parentInverse=a.model.parent?a.model.parent.matrixWorld.clone().invert():new THREE.Matrix4();
    const targetLocal=new THREE.Matrix4().multiplyMatrices(parentInverse,targetCubeWorld);
    const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();targetLocal.decompose(position,quaternion,scale);
    const cameraParentInverse=camera.parent?camera.parent.matrixWorld.clone().invert():new THREE.Matrix4();
    const cameraLocal=cameraParentInverse.multiply(savedCameraWorld),cameraPosition=new THREE.Vector3(),cameraQuaternion=new THREE.Quaternion(),cameraScale=new THREE.Vector3();
    cameraLocal.decompose(cameraPosition,cameraQuaternion,cameraScale);
    return{position,quaternion,scale,cameraPosition,cameraQuaternion,cameraTarget:new THREE.Vector3(...(snapshot.camera.target||[0,0,0]))};
  }
  function animatePose(target,kind){
    if(!target){poseAnimation=null;if(kind==='out'){a.input?.setThrowHandler(null);entryPose=null;}return;}
    const from={position:a.model.position.clone(),quaternion:a.model.quaternion.clone(),scale:a.model.scale.clone(),cameraPosition:camera.position.clone(),cameraQuaternion:camera.quaternion.clone(),cameraTarget:controls?.target?.clone()||new THREE.Vector3()};
    poseAnimation={kind,elapsed:0,duration:POSE_TIME,from,to:target,active:true};
    if(m.reducedMotion){a.model.position.copy(target.position);a.model.quaternion.copy(target.quaternion);a.model.scale.copy(target.scale);camera.position.copy(target.cameraPosition);camera.quaternion.copy(target.cameraQuaternion);if(controls)controls.target.copy(target.cameraTarget);poseAnimation.active=false;
      if(kind==='out'){a.input?.setThrowHandler(null);entryPose=null;}}
    publishPoseDebug();refreshHint();
  }
  function beginPresentation(){
    entryAutoFocus=m.autoFocus;m.setAutoFocus(false);m.setFocused(true);
    entryPose={position:a.model.position.clone(),quaternion:a.model.quaternion.clone(),scale:a.model.scale.clone(),cameraPosition:camera.position.clone(),cameraQuaternion:camera.quaternion.clone(),cameraTarget:controls?.target?.clone()||new THREE.Vector3()};
    capturedPose ||= clone(gameSettings.pose);
    if(capturedPose)animatePose(targetTransformFromSnapshot(capturedPose),'in');
    else{
      const normal=new THREE.Vector3(0,0,1).transformDirection(a.rig.deployNode.matrixWorld);
      const shift=new THREE.Vector3(normal.x,0,normal.z).normalize().multiplyScalar(launchStandoff*.42).add(new THREE.Vector3(0,-.24,0));
      const back=camera.position.clone().sub(entryPose.cameraTarget).normalize().multiplyScalar(launchStandoff*.95);
      animatePose({...entryPose,quaternion:entryPose.quaternion.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),THREE.MathUtils.degToRad(18))),
        cameraPosition:entryPose.cameraPosition.clone().add(shift).add(back),cameraTarget:entryPose.cameraTarget.clone().add(shift)},'in');
    }
  }
  function endPresentation(){
    if(entryPose)animatePose(entryPose,'out');
    else {poseAnimation=null;a.input?.setThrowHandler(null);}
    if(entryAutoFocus!==null){m.setAutoFocus(entryAutoFocus);entryAutoFocus=null;}
  }
  function updatePoseAnimation(dt){
    if(!poseAnimation?.active)return;
    poseAnimation.elapsed+=Math.max(0,dt);
    const t=clamp(poseAnimation.elapsed/poseAnimation.duration,0,1),ease=t*t*(3-2*t);
    const currentTarget=poseAnimation.kind==='in'?targetTransformFromSnapshot(capturedPose):poseAnimation.to;
    if(currentTarget)poseAnimation.to=currentTarget;
    a.model.position.copy(poseAnimation.from.position).lerp(poseAnimation.to.position,ease);
    a.model.quaternion.copy(poseAnimation.from.quaternion).slerp(poseAnimation.to.quaternion,ease);
    a.model.scale.copy(poseAnimation.from.scale).lerp(poseAnimation.to.scale,ease);
    camera.position.copy(poseAnimation.from.cameraPosition).lerp(poseAnimation.to.cameraPosition,ease);
    camera.quaternion.copy(poseAnimation.from.cameraQuaternion).slerp(poseAnimation.to.cameraQuaternion,ease);
    if(controls)controls.target.copy(poseAnimation.from.cameraTarget).lerp(poseAnimation.to.cameraTarget,ease);
    if(t>=1){a.model.position.copy(poseAnimation.to.position);a.model.quaternion.copy(poseAnimation.to.quaternion);a.model.scale.copy(poseAnimation.to.scale);camera.position.copy(poseAnimation.to.cameraPosition);camera.quaternion.copy(poseAnimation.to.cameraQuaternion);if(controls)controls.target.copy(poseAnimation.to.cameraTarget);poseAnimation.active=false;
      if(modeActive&&poseAnimation.kind==='in'){placementPlane();slingPosition=fixedLaunchPosition().add(new THREE.Vector3(0,-.145,0));groundGlow.position.set(slingPosition.x,floorY+.003,slingPosition.z);aimPoint=aimForAngle();
        if(heldMesh){const from=heldMesh.position.clone(),to=slingPosition.clone().add(new THREE.Vector3(0,.145,0));bagLoadAnimation={from,elapsed:0};cursorAnimation={from:project(from),to:project(to),elapsed:0};}poseSling();}
      if(!modeActive){a.input?.setThrowHandler(null);entryPose=null;}refreshHint();}
    a.model.updateMatrixWorld(true);
  }
  function cursorAt(x,y,type='mouse'){
    pointer={x,y,type};
    cursorBag.hidden=!modeActive||phase!=='simple'||x<0||y<0;
    if(!cursorBag.hidden){cursorBag.style.left=`${x}px`;cursorBag.style.top=`${y}px`;}
    if(heldMesh){heldMesh.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));heldMesh.visible=true;}
    if(modeActive&&!cursorHidden){canvas.dataset.skillsBagCursor='true';cursorHidden=true;}
    else if(!modeActive&&cursorHidden){delete canvas.dataset.skillsBagCursor;cursorHidden=false;}
  }
  function poseSling(){
    if(!slingPosition)return;
    slingGroup.position.copy(slingPosition).add(new THREE.Vector3(0,-.16*(1-slingRise),0));
    const pull=phase==='throw'?power*.09:0;
    pouch.position.set(Math.sin(aimAngle)*pull,.145-Math.min(.035,pull*.35),.012+pull);
    for(let i=0;i<2;i++){
      const from=new THREE.Vector3(i? .027:-.027,.145,0),to=pouch.position.clone(),vector=to.clone().sub(from),band=bands[i];
      band.position.copy(from).add(to).multiplyScalar(.5);
      band.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vector.clone().normalize());band.scale.y=vector.length();
    }
    if(heldMesh&&!bagLoadAnimation&&!poseAnimation?.active)heldMesh.position.copy(slingGroup.position).add(pouch.position);
  }
  function drawSling(){
    if(!modeActive||heldId===null||!allowed()){sling.style.display='none';return;}
    const start=powerPlan?.start||fixedLaunchPosition();if(!start){sling.style.display='none';return;}
    camera.updateMatrixWorld(true);const at=project(start),svg=sling.querySelector('svg');sling.style.display='block';
    slingGroup.visible=true;groundGlow.visible=true;poseSling();groundGlow.position.set((slingPosition||start).x,floorY+.003,(slingPosition||start).z);
    svg.querySelector('.fork').style.display=svg.querySelector('.bands').style.display='none';
    const preview=svg.querySelector('.preview'),target=svg.querySelector('.target'),impact=svg.querySelector('.impact');
    const track=svg.querySelector('.power-track'),zone=svg.querySelector('.overdraw-zone'),normal=svg.querySelector('.power-normal'),overdraw=svg.querySelector('.power-overdraw'),label=svg.querySelector('.power-label');
    const active=phase==='throw'&&Boolean(powerPlan),hasAim=Boolean(aimPoint);
    preview.style.display=svg.querySelector('.floor-shadow').style.display=track.style.display=zone.style.display=normal.style.display=overdraw.style.display=label.style.display=active?'':'none';
    impact.style.display=target.style.display='none';floorArcLine.visible=active;
    const fake=svg.querySelector('.fake-pointer');
    if(cursorAnimation){const t=clamp(cursorAnimation.elapsed/.48,0,1),ease=t*t*(3-2*t),x=THREE.MathUtils.lerp(cursorAnimation.from.x,cursorAnimation.to.x,ease),y=THREE.MathUtils.lerp(cursorAnimation.from.y,cursorAnimation.to.y,ease);fake.style.display=t>=1?'none':'block';fake.setAttribute('transform',`translate(${x.toFixed(1)} ${y.toFixed(1)})`);if(t>=1)cursorAnimation=null;}else fake.style.display='none';
    if(!active)return;
    const pts=[],shadowPts=[];for(let i=0;i<=28;i++){const t=(i/28)*.5,p=project(pointOn(powerPlan,t)),ground=project(new THREE.Vector3(pointOn(powerPlan,t).x,floorY+.007,pointOn(powerPlan,t).z));pts.push(`${i?'L':'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);shadowPts.push(`${i?'L':'M'} ${ground.x.toFixed(1)} ${ground.y.toFixed(1)}`);}
    preview.setAttribute('d',pts.join(' '));svg.querySelector('.floor-shadow').setAttribute('d',shadowPts.join(' '));
    const x=at.x+29,y=at.y-52,length=105;
    track.setAttribute('d',`M ${x} ${y} L ${x} ${y+length}`);
    zone.setAttribute('d',`M ${x} ${y+length*OVERDRAW_START} L ${x} ${y+length}`);
    normal.setAttribute('d',`M ${x} ${y} L ${x} ${y+length*Math.min(power,OVERDRAW_START)}`);
    overdraw.setAttribute('d',`M ${x} ${y+length*OVERDRAW_START} L ${x} ${y+length*power}`);
    overdraw.style.strokeOpacity=String((power>=OVERDRAW_START?1:.45)*clamp(.24+.56*contrastGain,0,1));
    label.setAttribute('x',String(x+10));label.setAttribute('y',String(y+12));
    label.textContent=power>=OVERDRAW_START?'OVERDRAW':'POWER';label.setAttribute('fill',power>=OVERDRAW_START?'#ff6b64':'#f8f3df');
  }
  function arm(id,position,pointerOrigin=null){
    if(!allowed()||poseAnimation?.active||heldId!==null||supply?.reserve(id)!==id)return false;
    // The Skills bearing may still be settling after face entry. Lock its current
    // screen-upright target before a world-space aim or flight is prepared.
    a.faceCarrier?.update(0,camera,true);
    a.model.updateWorldMatrix(true,true);
    if(!modeActive)beginPresentation();
    modeActive=true;canvas.dataset.skillsBagCursor='true';cursorHidden=true;
    const before=project(position);
    heldId=id;heldMesh=visuals.create(id);root.add(heldMesh);heldMesh.position.copy(position);heldMesh.visible=true;
    placementPlane();if(!slingPosition)slingPosition=fixedLaunchPosition().add(new THREE.Vector3(0,-.145,0));slingRise=0;poseSling();groundGlow.position.set(slingPosition.x,floorY+.003,slingPosition.z);
    const after=project(slingPosition.clone().add(new THREE.Vector3(0,.145,0)));cursorAnimation=poseAnimation?.active?null:{from:before,to:after,elapsed:0};bagLoadAnimation=poseAnimation?.active?null:{from:position.clone(),elapsed:0};
    phase='placement';aimAngle=0;aimHeight=0;power=POWER_START;powerPlan=null;
    const rect=canvas.getBoundingClientRect();
    placementPointer=pointerOrigin?{x:pointerOrigin.x,y:pointerOrigin.y}:pointer?{x:pointer.x,y:pointer.y}:{x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    pointer={...placementPointer,type:pointerOrigin?.type||pointer?.type||'mouse'};
    sounds.unlock();refreshHint();showTutorial();a.input?.setThrowHandler(()=>true);
    aimPoint=aimForAngle();
    drawSling();return true;
  }
  function cancel(){
    if(!modeActive&&!heldMesh)return;
    modeActive=false;
    if(shotPointer!==null){try{canvas.releasePointerCapture(shotPointer);}catch{/* capture may already be gone */}}
    shotPointer=null;heldMesh?.removeFromParent();heldMesh=null;bagLoadAnimation=null;phase='placement';aimPoint=null;powerPlan=null;placementPointer=null;
    if(heldId!==null)supply?.recover(heldId);
    heldId=null;tutorial.hidden=true;hideHelp();endPresentation();delete canvas.dataset.skillsBagCursor;cursorHidden=false;cursorBag.hidden=true;slingGroup.visible=false;groundGlow.visible=false;floorArcLine.visible=false;drawSling();refreshHint();
  }
  function startSimpleMode(){
    if(!allowed())return false;
    modeActive=true;phase='simple';slingGroup.visible=false;groundGlow.visible=false;
    canvas.dataset.skillsBagCursor='true';cursorHidden=true;sounds.unlock();
    a.input?.setThrowHandler(()=>true);refreshHint();showHelp();return true;
  }
  function tossAt(x,y){
    if(!modeActive||!allowed())return false;
    const id=supply.reserve(),source=getContainer()?.storedBags[id%4];
    source?.updateWorldMatrix(true,false);
    const from=source?.getWorldPosition(new THREE.Vector3())||fixedLaunchPosition();
    const aim=screenToPlane(x,y,launchPlane().facePlane);
    const plan=aim&&planShot({aim,start:fixedLaunchPosition(),fraction:.58});
    if(!plan){supply.recover(id);return false;}
    const mesh=visuals.create(id);root.add(mesh);mesh.position.copy(from);
    mesh.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion()));
    if(bags.length>=96)removeBag(bags[0]);
    bags.push({id,mesh,plan,age:0,phase:'load',loadStart:from.clone(),velocity:new THREE.Vector3(),spin:new THREE.Vector3(2.3,3.2,1.7)});
    lastPlan=plan;totals.throws++;return true;
  }
  function updateThrowPlan(){
    if(!aimPoint)return;
    aimPoint=aimForAngle();powerPlan=planShot({aim:aimPoint,start:fixedLaunchPosition(),fraction:power});
    if(powerPlan)lastPlan=powerPlan;
    updateGroundPlan(powerPlan);
    drawSling();
  }
  function handleThrowHorizontal(dx){const rect=canvas.getBoundingClientRect();if(rect.width)aimAngle=clamp(aimAngle+dx/rect.width*AIM_MAX_ANGLE*2,-AIM_MAX_ANGLE,AIM_MAX_ANGLE);}
  function updatePointer(x,y,type='mouse'){
    pointer={x,y,type};if(!modeActive||heldId===null||poseAnimation?.active)return;
    if(phase==='placement'){
      if(!placementPointer)placementPointer={x,y};
      const dx=x-placementPointer.x,dy=y-placementPointer.y;placementPointer={x,y};
      moveSlingByPointerDelta(dx,dy);aimPoint=aimForAngle();cursorAt(x,y,type);drawSling();
    }else if(phase==='fast'){
      cursorAt(x,y,type);
    }else{
      const rect=canvas.getBoundingClientRect();handleThrowHorizontal(x-lastThrowX);lastThrowX=x;
      if(rect.height)power=clamp(powerOrigin+(powerOriginY-y)/rect.height*1.6,0,1);
      updateThrowPlan();
    }
  }
  function consume(e){e.preventDefault();e.stopImmediatePropagation();}
  function onDown(e){
    if(!allowed())return;
    if(e.button!==0)return;
    if(getContainer()?.hitTray?.(e)){
      if(modeActive)cancel();else {startSimpleMode();cursorAt(e.clientX,e.clientY,e.pointerType);}
      togglePointer=e.pointerId;
      consume(e);return;
    }
    if(modeActive){shotPointer=e.pointerId;consume(e);return;}
    if(poseAnimation?.active){consume(e);return;}
    if(heldId===null){
      if(modeActive)consume(e);return;
    }
    if(shotPointer!==null){consume(e);return;}
    if(phase==='placement'){
    if(gameSettings.mode==='fast-toss'){
        pointer={x:e.clientX,y:e.clientY,type:e.pointerType};placementPointer={x:e.clientX,y:e.clientY};
        phase='fast';shotPointer=e.pointerId;try{canvas.setPointerCapture(e.pointerId);}catch{/* capture optional */}
        consume(e);return;
      }
      pointer={x:e.clientX,y:e.clientY,type:e.pointerType};placementPointer={x:e.clientX,y:e.clientY};phase='throw';
      power=POWER_START;powerOrigin=power;powerOriginY=e.clientY;lastThrowX=e.clientX;
      aimPoint=aimForAngle();shotPointer=e.pointerId;try{canvas.setPointerCapture(e.pointerId);}catch{/* capture optional */}
      refreshHint();updateThrowPlan();consume(e);return;
    }
  }
  function onMove(e){
    if(e.buttons&6||document.pointerLockElement===canvas)return;
    if(modeActive){cursorAt(e.clientX,e.clientY,e.pointerType);consume(e);return;}if(heldId!==null){updatePointer(e.clientX,e.clientY,e.pointerType);consume(e);}}
  function onUp(e){
    if(togglePointer===e.pointerId){togglePointer=null;consume(e);return;}
    if(modeActive&&phase==='simple'&&shotPointer===e.pointerId){shotPointer=null;tossAt(e.clientX,e.clientY);consume(e);return;}
    if(shotPointer===e.pointerId){shotPointer=null;try{canvas.releasePointerCapture(e.pointerId);}catch{/* already released */}
      pointer={x:e.clientX,y:e.clientY,type:e.pointerType};placementPointer={x:e.clientX,y:e.clientY};
      const fast=phase==='fast',aim=fast?screenToPlane(e.clientX,e.clientY,launchPlane().facePlane):null;
      const plan=fast?(aim&&planShot({aim,start:fixedLaunchPosition(),fraction:.58})):powerPlan,from=heldMesh?.position.clone();
      launch(plan,from);phase='placement';aimPoint=null;powerPlan=null;updateGroundPlan(null);if(fast)armNextAvailable();refreshHint();drawSling();consume(e);}
  }
  function onCancel(e){if(togglePointer===e.pointerId)togglePointer=null;if((e.type==='pointercancel'||e.type==='lostpointercapture')&&shotPointer===e.pointerId){shotPointer=null;pointer={x:e.clientX,y:e.clientY,type:e.pointerType};placementPointer={x:e.clientX,y:e.clientY};phase='placement';powerPlan=null;updateGroundPlan(null);}}
  canvas.addEventListener('pointerdown',onDown,{capture:true,signal:events.signal});
  canvas.addEventListener('pointermove',onMove,{capture:true,signal:events.signal});
  window.addEventListener('debug-ui-ready',publishPoseDebug,{signal:events.signal});
  canvas.addEventListener('pointerenter',e=>{if(modeActive)cursorAt(e.clientX,e.clientY,e.pointerType);else if(e.pointerType==='mouse'&&phase==='placement')placementPointer={x:e.clientX,y:e.clientY};},{signal:events.signal});
  canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')cursorAt(-1,-1,'mouse');},{signal:events.signal});
  canvas.addEventListener('pointerup',onUp,{capture:true,signal:events.signal});
  canvas.addEventListener('pointercancel',onCancel,{capture:true,signal:events.signal});
  canvas.addEventListener('lostpointercapture',onCancel,{signal:events.signal});
  canvas.addEventListener('contextmenu',e=>{if(modeActive)e.preventDefault();},{capture:true,signal:events.signal});
  window.addEventListener('blur',cancel,{signal:events.signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();},{signal:events.signal});
  function pickFirstAvailable(pointerOrigin=null){
    const id=supply?.snapshot().availableIds[0],bag=getContainer()?.storedBags[id];
    if(id===undefined||!bag){showNotice('There are no bean bags ready.');return;}
    bag.updateWorldMatrix(true,false);arm(id,bag.getWorldPosition(new THREE.Vector3()),pointerOrigin);
  }
  function armNextAvailable(){
    if(!modeActive||heldId!==null||!allowed())return false;
    const id=supply?.snapshot().availableIds[0],bag=getContainer()?.storedBags[id];
    if(id===undefined||!bag)return false;
    bag.updateWorldMatrix(true,false);return arm(id,bag.getWorldPosition(new THREE.Vector3()));
  }
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&(modeActive||poseAnimation?.active)){cancel();e.preventDefault();return;}
    if(e.defaultPrevented||e.repeat||e.ctrlKey||e.altKey||e.metaKey||e.target?.closest?.('input,select,textarea,button,a,[contenteditable=true]')||document.querySelector('dialog[open]')||!allowed())return;
    if(e.key.toLowerCase()==='b'){e.preventDefault();if(modeActive)cancel();else startSimpleMode();}
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
    placementPlane();
    const {matrix,normal,facePlane}=launchPlane(),up=new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(up,normal).normalize();
    const start=shot.start?.clone()||fixedLaunchPosition(),aim=shot.aim?.clone()||screenToPlane(shot.anchor?.x,shot.anchor?.y,facePlane);
    if(!start||!aim)return null;
    const fraction=clamp(shot.fraction,0,1),fumble=fraction>=OVERDRAW_START;
    // The same constant-gravity trajectory supplies preview, collision sweep and flight.
    // At medium power it reaches the locked aim; weak pulls expire before the face.
    const speed=.17+1.38*Math.min(fraction/OVERDRAW_START,1);
    // The face lies one launchStandoff along the flight axis. A slower shot takes
    // longer to reach it, so its gravity lift must use that actual crossing time.
    // Cap the lift for weak pulls; those still fall short instead of auto-reaching.
    const timeToFace=.65/speed,liftTime=Math.min(timeToFace,1.05);
    const velocity=fumble?right.clone().multiplyScalar((serial%2?1:-1)*2).addScaledVector(normal,-1.1).addScaledVector(up,.35):
      gameSettings.mode==='normal'?
        normal.clone().multiplyScalar(-(.28+2.65*fraction)).addScaledVector(right,Math.tan(aimAngle)*(.28+2.65*fraction)).addScaledVector(up,.5+3.4*fraction):
        aim.clone().sub(start).multiplyScalar(speed/.65).addScaledVector(up,GRAVITY*liftTime/2);
    const groundHeight=Math.max(.05,start.y-floorY);
    const duration=fumble?.25:gameSettings.mode==='normal'?
      (velocity.y+Math.sqrt(velocity.y**2+2*GRAVITY*groundHeight))/GRAVITY:FLIGHT_TIME;
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
    if(bag.phase==='slide')return bag.mesh.position.clone().addScaledVector(bag.velocity,dt).addScaledVector(bag.plan.up,-.6*dt*dt);
    if(bag.phase==='fall'){
      const predicted=bag.mesh.position.clone();
      predicted.y=Math.max(floorY+bagFloorClearance,predicted.y+bag.velocity.y*dt-GRAVITY*dt*dt/2);
      return predicted;
    }
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
  function throwAt(x,y){return tossAt(x,y);}
  function removeBag(bag,recover=true,notifyCatch=true){bag.mesh.removeFromParent();const index=bags.indexOf(bag);if(index>=0)bags.splice(index,1);if(recover&&index>=0){supply?.recover(bag.id);if(notifyCatch)onCatch(bag.id);}}
  const bagFloorClearance=.045;
  function beginFloorHops(bag){
    const target=getRecoveryTarget(bag.id,bag.mesh.position);
    if(!target?.isVector3){removeBag(bag);return;}
    const distance=Math.hypot(target.x-bag.mesh.position.x,target.z-bag.mesh.position.z);
    const count=Math.max(1,Math.min(8,Math.ceil(distance/.36)));
    bag.hops={origin:bag.mesh.position.clone(),target:target.clone(),count,index:0,
      start:bag.mesh.position.clone(),end:new THREE.Vector3(),distance};
    bag.phase='land';bag.age=0;bag.velocity.set(0,0,0);
    bag.mesh.position.y=floorY+bagFloorClearance;
    camera.getWorldQuaternion(bag.mesh.quaternion);
  }
  function startHop(bag){
    const hop=bag.hops,index=hop.index+1,final=index===hop.count;
    hop.start.copy(bag.mesh.position);
    hop.end.copy(hop.origin).lerp(hop.target,index/hop.count);
    if(!final)hop.end.y=floorY+bagFloorClearance;
    hop.duration=m.reducedMotion?.19:(final?.32:.29);
    hop.height=m.reducedMotion?.055:(final?.19:.13);
    hop.index=index;bag.phase='hop';bag.age=0;
  }
  function shapeBag(bag){
    const reduced=m.reducedMotion,softness=reduced?.085:.2;
    let compression=0;
    if(bag.phase==='land')compression=softness*Math.exp(-bag.age*(reduced?27:17));
    else if(bag.phase==='hop'){
      const t=clamp(bag.age/bag.hops.duration,0,1);
      compression=softness*(Math.exp(-t*22)+Math.exp(-(1-t)*22));
    }else if(bag.phase==='fall'||bag.phase==='slide')compression=softness*.4*Math.exp(-bag.age*9);
    bag.mesh.scale.set(1+compression*.55,1-compression,1+compression*.32);
  }
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
      sounds.play(plan.kind==='thunk'?'hit':'miss');
      if(plan.kind==='thunk'){totals.hits++;totals.thunks++;a.rig.deployNode.updateWorldMatrix(true,false);for(const contact of plan.contacts){m.clickToggle(contact.panelId);m.alignCard(contact.panelId,m.getLogicalSide(contact.panelId));a.requestCardContact(contact.panelId,contact.point.clone().applyMatrix4(a.rig.deployNode.matrixWorld.clone().invert()));}}
      else if(plan.kind==='energy'){totals.burns++;puff(plan.end,plan);supply?.destroy(bag.id);onDestroy(bag.id);removeBag(bag,false);return;}
      else if(plan.kind==='backing')totals.backings++;
      else if(plan.kind==='fumble'){totals.fumbles++;totals.misses++;}
      else if(plan.kind==='bag'){totals.bagCollisions++;if(bags.includes(plan.other)){plan.other.phase='fall';plan.other.velocity.copy(plan.normal).multiplyScalar(.85).addScaledVector(plan.right,-.4);}}
      else totals.misses++;
    }
    bag.phase=['hit','thunk','backing'].includes(plan.kind)?'slide':'fall';bag.age=0;
    const direction=plan.direction;
    const sideways=direction?new THREE.Vector3(...({E:[1,0,0],NE:[1,1,0],N:[0,1,0],NW:[-1,1,0],W:[-1,0,0],SW:[-1,-1,0],S:[0,-1,0],SE:[1,-1,0]}[direction])).transformDirection(a.rig.deployNode.matrixWorld):plan.right.clone().multiplyScalar((bag.id%2?1:-1)*(plan.kind==='thunk'?2:.25));
    bag.velocity.copy(sideways).multiplyScalar(.4).addScaledVector(plan.up,-.2);
    if(bag.phase==='slide')bag.velocity.addScaledVector(plan.normal,.8);
    bag.mesh.scale.set(1.1,.84,1.05);
  }
  function clear(){cancel();for(const b of [...bags])removeBag(b,true,false);for(const p of [...puffs])removePuff(p);sounds.suspend();}
  function update(dt){
    const hidden=!allowed();if(dock.hidden!==hidden)dock.hidden=hidden;
    if(!allowed()&&modeActive)cancel();
    updatePoseAnimation(dt);
    const step=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    if(modeActive&&heldId!==null){if(poseAnimation?.active&&poseAnimation.kind==='in'){const source=getContainer()?.storedBags[heldId];source?.updateWorldMatrix(true,false);if(source)heldMesh?.position.copy(source.getWorldPosition(new THREE.Vector3()));}
      else{slingRise=clamp(slingRise+step/.38,0,1);poseSling();if(bagLoadAnimation&&heldMesh){bagLoadAnimation.elapsed+=step;const t=clamp(bagLoadAnimation.elapsed/.48,0,1),ease=t*t*(3-2*t);heldMesh.position.copy(bagLoadAnimation.from).lerp(slingGroup.position.clone().add(pouch.position),ease);if(t>=1)bagLoadAnimation=null;}}}
    if(cursorAnimation)cursorAnimation.elapsed+=step;
    if(heldId!==null&&pointer)cursorAt(pointer.x,pointer.y,pointer.type);
    drawSling();
    tutorial.classList.toggle('reduced',Boolean(m.reducedMotion));
    if(hidden)tutorial.hidden=true;
    if(disposed||suspended||a.suspended||m.paused||document.hidden)return;
    for(const bag of [...bags]){
      bag.age+=step;
      if(bag.phase==='load'){bag.mesh.position.copy(bag.loadStart).lerp(bag.plan.start,Math.min(1,bag.age/.1));
        if(bag.age>=.1){bag.mesh.position.copy(bag.plan.start);bag.phase='flight';bag.age=0;}}
      else if(bag.phase==='flight'){bag.mesh.position.copy(pointOn(bag.plan,Math.min(1,bag.age/bag.plan.duration)));if(bag.age>=bag.plan.duration)impact(bag);}
      else if(bag.phase==='slide'){
        bag.velocity.addScaledVector(bag.plan.up,-1.2*step);bag.mesh.position.addScaledVector(bag.velocity,step);
        if(bag.age>=.12){bag.phase='fall';bag.age=0;bag.velocity.x=0;bag.velocity.z=0;bag.velocity.y=Math.min(0,bag.velocity.y);}
      }
      else if(bag.phase==='fall'){
        bag.velocity.y-=GRAVITY*step;bag.mesh.position.y=Math.max(floorY+bagFloorClearance,bag.mesh.position.y+bag.velocity.y*step);
      }
      else if(bag.phase==='land'){
        if(bag.age>=(m.reducedMotion?.035:.085))startHop(bag);
      }
      else if(bag.phase==='hop'){
        const hop=bag.hops,t=clamp(bag.age/hop.duration,0,1);
        bag.mesh.position.copy(hop.start).lerp(hop.end,t);
        bag.mesh.position.y+=Math.sin(Math.PI*t)*hop.height;
        if(t>=1){bag.mesh.position.copy(hop.end);
          if(hop.index===hop.count){removeBag(bag);continue;}
          bag.phase='land';bag.age=0;
        }
      }
      if(bag.phase==='fall'&&bag.mesh.position.y<=floorY+bagFloorClearance+1e-5)beginFloorHops(bag);
      shapeBag(bag);
      if(!m.reducedMotion&&(bag.phase==='load'||bag.phase==='flight'||bag.phase==='slide'||bag.phase==='fall')){
        bag.mesh.rotation.x+=bag.spin.x*step;bag.mesh.rotation.z+=bag.spin.z*step;
      }
    }
    for(const effect of [...puffs]){effect.age+=step;const t=effect.age/effect.duration;
      for(const p of effect.particles){p.sprite.position.addScaledVector(p.velocity,step);p.sprite.scale.setScalar((p.fire?.08:.13)*(1+t*2));p.sprite.material.opacity=Math.max(0,1-t*(p.fire?1.8:1))*contrastGain;}
      if(t>=1)removePuff(effect);}
  }
  const previousReset=m.onReset,reset=()=>{previousReset?.();clear();};m.onReset=reset;
  refreshHint();publishPoseDebug();
  return{planShot,planThrow,throwAt,update,clear,cancel,setContrast(gain){
      contrastGain=clamp(Number.isFinite(gain)?gain:1,0,2);
      const opacity=clamp(.24+.56*contrastGain,0,1),glow=Math.round(2+9*contrastGain);
      slingMaterial.emissiveIntensity=.12+1.1*clamp(contrastGain,0,1);
      groundGlow.material.opacity=clamp(.08+.2*contrastGain,0,.5);
      floorShadowMaterial.opacity=clamp(.2+.48*contrastGain,0,1);
      sling.querySelector('.preview').style.strokeOpacity=String(opacity);
      sling.querySelector('.floor-shadow').style.strokeOpacity=String(clamp(.18+.5*contrastGain,0,1));
      sling.querySelector('.target').style.strokeOpacity=String(opacity);
      sling.querySelector('.impact').style.strokeOpacity=String(opacity);
      sling.querySelector('.power-normal').style.strokeOpacity=String(opacity);
      sling.querySelector('.overdraw-zone').style.strokeOpacity=String(opacity*.7);
      sling.querySelector('.power-overdraw').style.opacity=String(opacity);
      sling.style.filter=`drop-shadow(0 0 ${glow}px rgba(236,182,108,${Math.min(1,.45*contrastGain)}))`;
      cursorBag.style.boxShadow=`0 0 ${glow}px rgba(236,182,108,${Math.min(1,.7*contrastGain)})`;
      help.style.setProperty('--skills-help-glow',`${glow}px`);
      help.style.borderColor=`rgba(224,191,130,${opacity})`;
      tutorial.style.setProperty('--skills-tutorial-glow',`${Math.round(2+9*contrastGain)}px`);
      tutorial.style.borderColor=`rgba(224,191,130,${opacity})`;
      tutorial.querySelector('.demo').style.opacity=String(opacity);
    },
    syncSettings:sounds.sync,get mode(){return modeActive;},get heldId(){return heldId;},get gestureActive(){return Boolean(heldId!==null||poseAnimation?.active);},
    endGesture({preserveModes=false}={}){if(preserveModes&&modeActive&&phase==='simple'){
      if(shotPointer!==null){try{canvas.releasePointerCapture(shotPointer);}catch{/* capture may already be gone */}}
      shotPointer=null;cursorBag.hidden=true;return;
    }cancel();},
    get presentationCamera(){return capturedPose?.camera||null;},
    get bags(){return bags;},get lastPlan(){return lastPlan;},get launchStandoff(){return launchStandoff;},get cubeWidth(){return cubeWidth;},
    get slingObject(){return slingGroup;},
    capturePresentationPose,getSettings:getGameSettings,setSettings:setGameSettings,saveViewPreset,applyViewPreset,
    getStats:()=>({...totals,active:bags.length,puffs:puffs.length,modeActive,interactionPhase:phase,heldId,shotPointer,heldVisible:heldMesh?.visible??false,
      aim:aimPoint?.toArray()??null,aimAngle,aimHeight,power,previewStart:powerPlan?.start?.toArray()??null,
      previewControl:powerPlan?.control?.toArray()??null,previewEnd:powerPlan?.end?.toArray()??null,
      previewDuration:powerPlan?.duration??null,previewKind:powerPlan?.kind??null,poseAnimating:Boolean(poseAnimation?.active),capturedPose:capturedPose?JSON.parse(JSON.stringify(capturedPose)):null,
      slingPosition:slingPosition?.toArray()??null,slingRise,heldPosition:heldMesh?.position.toArray()??null,
      cubePosition:a.model.position.toArray(),cubeQuaternion:a.model.quaternion.toArray(),supply:supply?.snapshot(),sounds:sounds.getStats()}),
    suspend(){suspended=true;dock.hidden=true;notice.hidden=true;clear();if(entryPose){a.model.position.copy(entryPose.position);a.model.quaternion.copy(entryPose.quaternion);a.model.scale.copy(entryPose.scale);camera.position.copy(entryPose.cameraPosition);camera.quaternion.copy(entryPose.cameraQuaternion);if(controls)controls.target.copy(entryPose.cameraTarget);}poseAnimation=null;entryPose=null;a.input?.setThrowHandler(null);},resume(){suspended=false;},
    dispose(){if(disposed)return;disposed=true;events.abort();unsubscribe?.();clearTimeout(noticeTimer);clearTimeout(tutorialTimer);hideHelp();notice.remove();tutorial.remove();help.remove();sling.remove();cursorBag.remove();
      if(m.onReset===reset)m.onReset=previousReset;a.input?.setThrowHandler(null);if(entryPose){a.model.position.copy(entryPose.position);a.model.quaternion.copy(entryPose.quaternion);a.model.scale.copy(entryPose.scale);camera.position.copy(entryPose.cameraPosition);camera.quaternion.copy(entryPose.cameraQuaternion);if(controls)controls.target.copy(entryPose.cameraTarget);}poseAnimation=null;entryPose=null;clear();sounds.dispose();dock.remove();root.removeFromParent();slingRod.dispose();pouchGeometry.dispose();bandGeometry.dispose();bandMaterial.dispose();slingMaterial.dispose();slingDark.dispose();groundGlow.geometry.dispose();groundGlow.material.dispose();floorArcLine.geometry.dispose();floorShadowMaterial.dispose();glowTexture.dispose();smoke.dispose();if(ownsVisuals)visuals.dispose();}
  };
}





