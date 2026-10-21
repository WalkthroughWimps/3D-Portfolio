import * as THREE from 'three';

const POINTS = {N:[0,1], NE:[1,1], E:[1,0], SE:[1,-1], S:[0,-1], SW:[-1,-1], W:[-1,0], NW:[-1,1]};

/** Ray based invisible compass zones. Orbit drags are excluded before any click action. */
export function mountPanelInput({renderer, camera, motion, model, manifest, findRawNode, onSelect, onClick=()=>false,canHover=()=>true,onFastPass=()=>{}}) {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const fixedNames=[...Object.keys(manifest.originalSourceSignatures||{}),'V2 frame inner lip'];
  const fixedMeshes=fixedNames.flatMap(name=>{
    const node=findRawNode(manifest.exportNodeNames?.[name]||name);
    if(!node)return[];
    const result=[];node.traverse(o=>{if(o.isMesh)result.push(o);});return result;
  });
  const visible = object => {for(let o=object;o;o=o.parent)if(!o.visible)return false;return true;};
  let down = null, lastHover = null, lastPlane = null, lastMotion = null, pointerEntry = true;
  let pointerSample = null, hoverStarted = 0, hoverSpeed = 0;
  let throwHandler=null;
  const plane = new THREE.Plane();
  const inverseCarriage = new THREE.Matrix4();
  const carriagePoint = e => {
    const rect = canvas.getBoundingClientRect();
    ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    motion.rig.deployNode.updateMatrixWorld(true);
    const carriage = motion.rig.deployNode.matrixWorld;
    const face = new THREE.Vector3(0,0,motion.panels.values().next().value.center.z).applyMatrix4(carriage);
    const normal = new THREE.Vector3(0,0,1).transformDirection(carriage);
    if (camera.getWorldPosition(new THREE.Vector3()).sub(face).dot(normal) <= 0) return null;
    plane.setFromNormalAndCoplanarPoint(normal,face);
    const point = raycaster.ray.intersectPlane(plane,new THREE.Vector3());
    return point ? point.applyMatrix4(inverseCarriage.copy(carriage).invert()) : null;
  };
  const hitAt = e => {
    const facePoint = carriagePoint(e);
    if (!facePoint) return null;
    // Neutral plane footprints remain hittable while a live mesh is edge-on.
    const candidates=[...motion.panels.values()].filter(panel=>{
      if(!motion.rig.isPanelVisible(panel.record.panelId))return false;
      const local=facePoint.clone().sub(panel.center);
      const width=panel.record.geometry?.neutralSize?.[0]||Math.min(.29,panel.radius*1.45);
      return Math.abs(local.x)<=width*.5&&Math.abs(local.y)<=width*.5;
    }).sort((a,b)=>a.center.distanceToSquared(facePoint)-b.center.distanceToSquared(facePoint));
    for (const panel of candidates) {
      const hit=raycaster.intersectObjects(panel.meshes,false).find(item=>visible(item.object));
      const blocker=hit&&raycaster.intersectObjects(fixedMeshes,false).find(other=>visible(other.object)&&other.distance<hit.distance-.0005);
      if (blocker) return null;
      const local = facePoint.clone().sub(panel.center);
      const neutral = panel.record.geometry?.neutralSize?.[0] || .277;
      const clicked = panel.record.geometry?.clickedSize?.[0] || neutral;
      const influence = panel.morphs[0]?.morphTargetInfluences?.[panel.morphs[0]?.morphTargetDictionary?.Clicked] || 0;
      const width = neutral + (clicked-neutral)*influence;
      let zone = null, best = Infinity;
      for (const [name, [x,y]] of Object.entries(POINTS)) {
        const scale = .37 * width;
        const distance = Math.hypot(local.x-x*scale, local.y-y*scale);
        if (distance < best && Math.max(Math.abs(local.x-x*scale),Math.abs(local.y-y*scale)) <= width*.1) {
          best = distance;zone = name;
        }
      }
      const center = Math.hypot(local.x,local.y) <= width*.12;
      const contactPoint=hit?.point.clone().applyMatrix4(inverseCarriage.copy(motion.rig.deployNode.matrixWorld).invert())||facePoint.clone();
      return {panel, zone, center, local, facePoint,contactPoint};
    }
    return null;
  };
  const directions=['E','NE','N','NW','W','SW','S','SE'];
  const recordMotion=(from,to)=>{
    if(!from||!to)return;
    const delta=to.clone().sub(from);
    if(Math.hypot(delta.x,delta.y)>1e-8)lastMotion=delta;
  };
  const movementDirection=(id,entering)=>{
    if(!motion.panels.get(id)?.record.axes||!lastMotion)return undefined;
    // Entry presses away from the approaching pointer; exit tips toward its
    // departing path. Position within the card does not choose the hinge.
    const sign=entering?-1:1;
    return directions[(Math.round(Math.atan2(lastMotion.y*sign,lastMotion.x*sign)/(Math.PI/4))+8)%8];
  };
  const exitHover=(point,event)=>{
    recordMotion(lastPlane,point);
    if(lastHover){const flipped=motion.hoverExit(lastHover,movementDirection(lastHover,false));if(flipped&&event)onFastPass(lastHover,{speed:hoverSpeed,duration:event.timeStamp-hoverStarted});}
    lastHover=null;hoverSpeed=0;
  };
  const onDown = e => {if(e.button!==0){exitHover(carriagePoint(e));lastPlane=null;lastMotion=null;return;}down = {id:e.pointerId,x:e.clientX,y:e.clientY,drag:false,hit:hitAt(e)};};
  const onMove = e => {
    if (down?.id === e.pointerId && Math.hypot(e.clientX-down.x,e.clientY-down.y) > 5) down.drag = true;
    if (throwHandler || !pointerEntry || !canHover() || e.pointerType !== 'mouse' || e.buttons || down) {pointerSample=null;return;}
    const elapsed=pointerSample?e.timeStamp-pointerSample.time:0;
    const speed=elapsed>0&&elapsed<=100?Math.hypot(e.clientX-pointerSample.x,e.clientY-pointerSample.y)/elapsed*1000:0;
    pointerSample={x:e.clientX,y:e.clientY,time:e.timeStamp};hoverSpeed=Math.max(hoverSpeed,speed);
    const facePoint = carriagePoint(e);
    const previous=lastPlane||((e.movementX||e.movementY)?carriagePoint({clientX:e.clientX-e.movementX,clientY:e.clientY-e.movementY}):null);
    recordMotion(previous,facePoint);
    const hit = hitAt(e);
    if (hit) {
      const id = hit.panel.record.panelId;
      if(lastHover!==id){
        exitHover(facePoint,e);
        motion.hoverEnter(id,movementDirection(id,true));
        hoverStarted=e.timeStamp;hoverSpeed=speed;
        onSelect(id);
      }
      lastHover = id;
    } else exitHover(facePoint,e);
    if (facePoint) lastPlane = facePoint;
  };
  const onUp = e => {
    if (!down || e.pointerId !== down.id) return;
    const prior = down;down = null;
    if (prior.drag || Math.hypot(e.clientX-prior.x,e.clientY-prior.y) > 5) return;
    const hit = hitAt(e);
    const corner=hit?.panel.record.kind==='curved_corner';
    if(!corner&&throwHandler?.(e,hit))return;
    if (!hit || hit.panel !== prior.hit?.panel) return;
    const id = hit.panel.record.panelId;
    onSelect(id);
    if(onClick(id,hit))return;
    // Mouse uses directional entry by default; touch and the optional click tester remain available.
    if(pointerEntry){
      if(hit.panel.record.axes)motion.clickToggle(id);else motion.flip(id);
      return;
    }
    if (hit.panel.record.axes) {
      if (hit.center) motion.clickToggle(id);
      else if (hit.zone) motion.flip(id,hit.zone);
    } else motion.flip(id);
  };
  const onLeave = e => {exitHover(e?.type==='pointerleave'?carriagePoint(e):lastPlane,e?.type==='pointerleave'?e:null);lastPlane = null;lastMotion=null;down = null;pointerSample=null;};
  canvas.addEventListener('pointerdown',onDown);
  canvas.addEventListener('pointermove',onMove);
  canvas.addEventListener('pointerup',onUp);
  canvas.addEventListener('pointercancel',onLeave);
  canvas.addEventListener('pointerleave',onLeave);
  return {setPointerEntry(value){exitHover(lastPlane);pointerEntry = Boolean(value);lastPlane = null;lastMotion=null;pointerSample=null;},get pointerEntry(){return pointerEntry;},
    setThrowHandler(handler){exitHover(lastPlane);throwHandler=typeof handler==='function'?handler:null;},
    hitAt,dispose(){throwHandler=null;canvas.removeEventListener('pointerdown',onDown);canvas.removeEventListener('pointermove',onMove);
      canvas.removeEventListener('pointerup',onUp);canvas.removeEventListener('pointercancel',onLeave);canvas.removeEventListener('pointerleave',onLeave);}};
}
