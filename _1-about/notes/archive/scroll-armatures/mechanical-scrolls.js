import * as THREE from 'three';
import {SCROLL_RIG, createScrollMotion, scrollPose, quadMatrix, TABLET_SCREENS, railAssembly} from './scroll-tablet-model.js';

const Y = new THREE.Vector3(0, 1, 0);

/** Face-owned frame, two folding roller guides and two blank-while-moving scrolls. */
export function createMechanicalScrolls(mount, carrier) {
  const resources = new Set(), own = value => { resources.add(value); return value; };
  const root = new THREE.Group(); root.name = 'Notes scroll frame and twin roller tracks'; carrier.add(root);
  const metal = own(new THREE.MeshStandardMaterial({color: '#879aa5', metalness: .65, roughness: .32}));
  const brass = own(new THREE.MeshStandardMaterial({color: '#d5ac68', metalness: .55, roughness: .38}));
  const dark = own(new THREE.MeshStandardMaterial({color: '#3e5260', metalness: .35, roughness: .45}));
  const screen = own(new THREE.MeshBasicMaterial({color: '#101d25', side: THREE.DoubleSide}));
  const ringGeo = own(new THREE.TorusGeometry(SCROLL_RIG.frameRadius, .014, 8, 112));
  const frame = new THREE.Mesh(ringGeo, metal); frame.name = 'Notes lifting circular glass bezel'; root.add(frame);
  const seat = new THREE.Mesh(own(new THREE.TorusGeometry(.9, .007, 6, 112)), dark); seat.name = 'Notes fixed circular frame seat'; seat.position.z = SCROLL_RIG.seat-.01; mount.add(seat);
  const edge = new THREE.Mesh(own(new THREE.TorusGeometry(SCROLL_RIG.radius+.002, .003, 5, 112)), brass); edge.name = 'Notes glass retaining lip'; edge.position.z = .005; root.add(edge);
  const annulusMaterial = own(dark.clone()); annulusMaterial.side = THREE.DoubleSide;
  const annulus = new THREE.Mesh(own(new THREE.RingGeometry(SCROLL_RIG.radius-.002,.904,112)),annulusMaterial); annulus.name = 'Notes glass frame shoulder annulus'; annulus.position.z=-.01; root.add(annulus);
  const rodGeo = own(new THREE.CylinderGeometry(1, 1, 1, 10)), ballGeo = own(new THREE.SphereGeometry(1, 12, 8));
  const batches = [];
  function batch(geometry, material, count, name) {
    const mesh = own(new THREE.InstancedMesh(geometry, material, count)); mesh.name = name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; root.add(mesh);
    const entry = {mesh, count: 0}; batches.push(entry); return entry;
  }
  const rods = batch(rodGeo, dark, 32, 'Notes anchored slide tracks');
  const shafts = batch(rodGeo, metal, 64, 'Notes folding guide rails and carrier links');
  const joints = batch(ballGeo, brass, 64, 'Notes seated hinge and roller bearings');
  const carriages = batch(rodGeo, dark, 24, 'Notes rail carriage rollers and end stops');
  const accents = batch(ballGeo, brass, 24, 'Notes bearing caps');
  const spindles = batch(rodGeo, brass, 12, 'Notes upward scroll spindles');
  const sleeves = batch(rodGeo, screen, 2, 'Notes rolled flexible display sleeves');
  const dummy = new THREE.Object3D(), delta = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  function place(pool, point, scale, rotation = null) {
    dummy.position.set(...point); dummy.scale.set(...scale); dummy.quaternion.identity();
    if (rotation) dummy.quaternion.copy(rotation); dummy.updateMatrix(); pool.mesh.setMatrixAt(pool.count++, dummy.matrix);
  }
  function rod(pool, from, to, radius) {
    a.set(...from); b.set(...to); delta.subVectors(b, a); dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.scale.set(radius, Math.max(.0001, delta.length()), radius); dummy.quaternion.setFromUnitVectors(Y, delta.normalize()); dummy.updateMatrix(); pool.mesh.setMatrixAt(pool.count++, dummy.matrix);
  }
  const screenGeometry=own(new THREE.PlaneGeometry(1,1));
  const tablets = [-1, 1].map((side,index) => {
    const material=own(screen.clone());material.transparent=true;material.side=THREE.FrontSide;material.depthTest=false;material.depthWrite=false;material.toneMapped=false;
    const sheet = new THREE.Mesh(screenGeometry, material);sheet.renderOrder=20; sheet.name = side < 0 ? 'Notes gear scroll display' : 'Notes drawing and layers scroll display'; root.add(sheet);
    return {side, sheet, target: {x: side * 1.6, y: 0, width: 1.2, height: 1.2*TABLET_SCREENS[index].height/TABLET_SCREENS[index].width}, logical: TABLET_SCREENS[index], texture:null, powered:false, pose: null};
  });
  const motion = createScrollMotion(); let state = motion.state, lastProgress = -1, lastLift = -1, dirty = true, disposed = false;
  const lastProjection = new THREE.Matrix4(), lastCamera = new THREE.Matrix4(), lastLayoutCarrier = new THREE.Matrix4(); let lastBounds = null, lastRectangles = null;
  const projectedCamera = new THREE.Matrix4(), projectedView = new THREE.Matrix4(), projectedCarrier = new THREE.Matrix4();
  let wantsOpen=false,fallbackRequested=false,floatingControls=false,fallbackReason=[];
  const controlsReady=()=>state.ready||(floatingControls&&wantsOpen);
  const publicState=()=>({...state,physicalReady:state.ready,ready:controlsReady(),floating:floatingControls,fallbackRequested,fallbackReason});
  let poseRevision = 0, projectedRevision = -1, projectedBounds = null, projectionCache = null;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), normal = new THREE.Vector3(), center = new THREE.Vector3(), hit = new THREE.Vector3();
  const carrierRotation=new THREE.Quaternion(), cameraRotation=new THREE.Quaternion(), screenRotation=new THREE.Quaternion(), poseRotation=new THREE.Quaternion();
  function pointAt(x, y, camera, bounds, floating=false) {
    ndc.set((x - bounds.left) / bounds.width * 2 - 1, 1 - (y - bounds.top) / bounds.height * 2); ray.setFromCamera(ndc, camera);
    camera.getWorldDirection(normal);
    if(floating)camera.getWorldPosition(center).addScaledVector(normal,.5);
    else {center.set(0,0,SCROLL_RIG.screenZ);carrier.localToWorld(center);}
    plane.setFromNormalAndCoplanarPoint(normal, center);
    return ray.ray.intersectPlane(plane, hit) ? carrier.worldToLocal(hit.clone()) : null;
  }
  function layout(camera, bounds, rectangles) {
    carrier.updateWorldMatrix(true, false); camera.updateMatrixWorld(true);
    if (lastBounds && lastBounds.width === bounds.width && lastBounds.height === bounds.height && lastProjection.equals(camera.projectionMatrix) && lastCamera.equals(camera.matrixWorld) && lastLayoutCarrier.equals(carrier.matrixWorld) && rectangles.every((r,i)=>['x','y','width','height'].every(k=>r[k]===lastRectangles[i][k])) && (state.progress >= .26||fallbackRequested)) return;
    const resized=!lastBounds || lastBounds.width!==bounds.width || lastBounds.height!==bounds.height;
    lastProjection.copy(camera.projectionMatrix); lastCamera.copy(camera.matrixWorld); lastLayoutCarrier.copy(carrier.matrixWorld); lastBounds = {width:bounds.width,height:bounds.height}; lastRectangles = rectangles.map(r=>({...r}));
    carrier.getWorldQuaternion(carrierRotation);camera.getWorldQuaternion(cameraRotation);
    screenRotation.copy(carrierRotation).invert().multiply(cameraRotation);
    let fits=true;const candidates=[],reasons=[];
    rectangles.forEach((rect, i) => {
      const middle = pointAt(bounds.left + rect.x + rect.width / 2, bounds.top + rect.y + rect.height / 2, camera, bounds);
      const left = pointAt(bounds.left + rect.x, bounds.top + rect.y + rect.height / 2, camera, bounds);
      const right = pointAt(bounds.left + rect.x + rect.width, bounds.top + rect.y + rect.height / 2, camera, bounds);
      const top = pointAt(bounds.left + rect.x + rect.width / 2, bounds.top + rect.y, camera, bounds);
      const bottom = pointAt(bounds.left + rect.x + rect.width / 2, bounds.top + rect.y + rect.height, camera, bounds);
      const floatingMiddle=pointAt(bounds.left+rect.x+rect.width/2,bounds.top+rect.y+rect.height/2,camera,bounds,true);
      const floatingLeft=pointAt(bounds.left+rect.x,bounds.top+rect.y+rect.height/2,camera,bounds,true);
      const floatingRight=pointAt(bounds.left+rect.x+rect.width,bounds.top+rect.y+rect.height/2,camera,bounds,true);
      if(floatingMiddle&&floatingLeft&&floatingRight)tablets[i].floating={center:floatingMiddle,width:floatingRight.distanceTo(floatingLeft),height:floatingRight.distanceTo(floatingLeft)*TABLET_SCREENS[i].height/TABLET_SCREENS[i].width,rotation:screenRotation.clone()};
      if (!middle || !left || !right || !top || !bottom) {fits=false;reasons.push("camera-inside-tablet-plane");return;}
      const spec=TABLET_SCREENS[i], scale=Math.max(.00001,Math.min((right.distanceTo(left)-.016)/spec.width,(bottom.distanceTo(top)-.016)/spec.height));
      const tablet=tablets[i];
      // Keep the rod rigid as the camera/frame moves. Dolly the flat tablet
      // along its view ray to retain the allocated pixel rectangle instead.
      if(!tablet.rigidWidth || resized)tablet.rigidWidth=Math.min(SCROLL_RIG.maxWidth,spec.width*scale);
      const ratio=tablet.rigidWidth/(spec.width*scale),cameraLocal=carrier.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
      middle.sub(cameraLocal).multiplyScalar(ratio).add(cameraLocal);
      const height=tablet.rigidWidth*spec.height/spec.width;
      const corner=new THREE.Vector3(tablet.side*(tablet.rigidWidth/2+.037),height/2,0).applyQuaternion(screenRotation);
      const lower=middle.clone().sub(corner);
      // A camera-facing screen may tilt through the glass if only its center
      // is kept forward. Clear the entire rectangle, including its long rail.
      const axisX=new THREE.Vector3(1,0,0).applyQuaternion(screenRotation),axisY=new THREE.Vector3(0,1,0).applyQuaternion(screenRotation);
      const front=Math.min(0,axisX.z*tablet.side*(tablet.rigidWidth+.08))+Math.min(0,axisY.z*(height+.14));
      lower.z=Math.max(lower.z,.065-front);
      const target={x:lower.x+tablet.side*(tablet.rigidWidth/2+.037),y:lower.y+height/2,z:lower.z,width:tablet.rigidWidth,height,rotation:screenRotation.clone()};
      candidates[i]=target;
      const proposed=scrollPose(tablet.side,{reach:1,progress:1,unroll:1},target),solved=railAssembly(proposed,screenRotation);
      if(solved.limited){fits=false;reasons.push("carrier-reach");}
      const corners=[[-.5,.5],[.5,.5],[.5,-.5],[-.5,-.5]].map(([x,y])=>{
        const v=new THREE.Vector3(x*target.width,y*target.height,0).applyQuaternion(screenRotation).add(new THREE.Vector3(...solved.screen));carrier.localToWorld(v);v.project(camera);return v;
      });
      const pixels=corners.map(v=>({x:(v.x+1)*bounds.width/2,y:(1-v.y)*bounds.height/2}));
      const projectedHeight=Math.abs(pixels[2].y-pixels[1].y),tolerance=fallbackRequested?.015:.03;
      if(corners.some(v=>v.z<-1||v.z>1)||pixels.some(v=>v.x<rect.x-8||v.x>rect.x+rect.width+8||v.y<rect.y-8||v.y>rect.y+rect.height+8)||projectedHeight/rect.height>1+tolerance){fits=false;reasons.push({screen:i,heightRatio:projectedHeight/rect.height,pixels,target:{x:target.x,y:target.y,z:target.z}});}
    });
    fallbackRequested=!fits;fallbackReason=reasons;
    if(fits)candidates.forEach((target,i)=>{tablets[i].target=target;});
    floatingControls=fallbackRequested||(floatingControls&&!state.ready);
    dirty = true; projectionCache = null; paintPose();
  }
  function paintPose() {
    if (!dirty && lastProgress === state.progress && lastLift === state.lift) return; dirty = false; lastProgress = state.progress; lastLift = state.lift; poseRevision++;
    carrier.position.z = SCROLL_RIG.seat+state.lift;
    batches.forEach(pool => { pool.count = 0; });
    for (let i = 0; i < 4; i++) { const angle = Math.PI/4+i*Math.PI/2, x = .865*Math.cos(angle), y = .865*Math.sin(angle);
      rod(rods,[x,y,-state.lift-.015],[x,y,-.02],.007); rod(shafts,[x,y,-state.lift],[x,y,.002],.0035);
    }
    for (const tablet of tablets) {
      const pose = scrollPose(tablet.side, state, tablet.target); tablet.pose = pose;
      const powered=controlsReady();
      if(tablet.powered!==powered){tablet.powered=powered;tablet.sheet.material.map=powered?tablet.texture:null;tablet.sheet.material.color.set(powered?'#ffffff':'#101d25');tablet.sheet.material.needsUpdate=true;}
      poseRotation.identity().slerp(tablet.target.rotation??new THREE.Quaternion(),pose.orientation);
      const assembly=railAssembly(pose,poseRotation);tablet.assembly=assembly;
      const at=assembly.point,upper=assembly.upperLocal;
      if(floatingControls&&tablet.floating){
        const f=tablet.floating;tablet.sheet.visible=wantsOpen;tablet.sheet.position.copy(f.center);tablet.sheet.scale.set(f.width,f.height,.012);tablet.sheet.quaternion.copy(f.rotation);
      }else{tablet.sheet.visible = state.unroll > .001; tablet.sheet.position.set(...assembly.screen); tablet.sheet.scale.set(pose.width,pose.height,.012); tablet.sheet.quaternion.copy(poseRotation);}
      // Once packed, the hardware is visually tucked away in the floating view.
      // Keep it off the drawing glass while the user works at close zoom.
      if(floatingControls&&state.progress<=.0001)continue;
      // Frame-fixed three-stage normal track. Every nested section keeps its
      // .12 length and .04 overlap at full extension; its carriage owns the links.
      const bx=tablet.side*.85,by=-tablet.side*.18;
      rod(rods,[bx,by,.08],[bx/Math.hypot(bx,by)*.87,by/Math.hypot(bx,by)*.87,-.014],.009);
      for(let i=0;i<3;i++){
        const offset=.08*pose.track*i;
        rod(i?shafts:rods,[bx,by,.08+offset],[bx,by,.2+offset],.011-i*.002);
      }
      assembly.links.forEach(([a,b,r])=>rod(shafts,a,b,r));
      [assembly.base,assembly.elbow,assembly.lower].forEach(p=>place(joints,p,[.019,.019,.019]));
      assembly.rails.forEach(([a,b,r])=>rod(shafts,a,b,r));
      place(joints,assembly.hinge,[.022,.022,.022]);
      // Fixed lower bearing and rigid, .058-long upper carriage mounting link.
      rod(shafts,assembly.carriage,assembly.upper,.007);
      for(const point of [assembly.lower,assembly.upper])place(joints,point,[.026,.026,.026]);
      assembly.rollers.forEach(wheel=>rod(carriages,...wheel.axle,wheel.radius));
      rod(carriages,at([-.025,0,0]),at([.025,0,0]),.016);
      const stopAxis=new THREE.Vector3(.025,0,0).applyQuaternion(poseRotation).toArray();
      rod(carriages,assembly.tip.map((v,i)=>v-stopAxis[i]),assembly.tip.map((v,i)=>v+stopAxis[i]),.016);
      for (const v of [[0,0,0],upper]) {
        rod(spindles,at([v[0]-tablet.side*.001,v[1],v[2]]),at([v[0]+tablet.side*(pose.width+.074),v[1],v[2]]),.013);
        for (const end of [0,1]) {
          const pos=[v[0]+end*tablet.side*(pose.width+.074),v[1],v[2]];
          place(joints,at(pos),Array(3).fill(SCROLL_RIG.bobRadius));
          place(accents,at([pos[0],pos[1]+Math.cos(pose.roll)*.024,pos[2]+Math.sin(pose.roll)*.024]),[.006,.006,.006]);
        }
      }
      if (state.unroll < .999) {
        rod(sleeves,at([tablet.side*.037,0,0]),at([tablet.side*(pose.width+.037),0,0]),pose.radius+.004);
      }
    }
    for (const pool of batches) { pool.mesh.count = pool.count; pool.mesh.visible = pool.count > 0; pool.mesh.instanceMatrix.needsUpdate = true; }
    root.updateWorldMatrix(true,true);
  }
  const projected = new THREE.Vector3();
  function project(camera, bounds) {
    carrier.updateWorldMatrix(true,false);
    if (projectionCache && projectedRevision === poseRevision && projectedCamera.equals(camera.matrixWorld) && projectedView.equals(camera.projectionMatrix) && projectedCarrier.equals(carrier.matrixWorld) && ['left','top','width','height'].every(k=>projectedBounds[k]===bounds[k])) return projectionCache;
    projectedRevision = poseRevision; projectedCamera.copy(camera.matrixWorld); projectedView.copy(camera.projectionMatrix); projectedCarrier.copy(carrier.matrixWorld); projectedBounds = {left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height};
    projectionCache = tablets.map(tablet => {
      const p = tablet.pose; if (!p || !controlsReady() || !tablet.sheet.visible) return null;
      tablet.sheet.updateWorldMatrix(true,false);
      let visible = true;
      const points = [[-.5,.5],[.5,.5],[.5,-.5],[-.5,-.5]].map(([x,y])=>{
        projected.set(x,y,0).applyMatrix4(tablet.sheet.matrixWorld).project(camera);
        if (projected.z < -1 || projected.z > 1) visible = false;
        return {x:bounds.left+(projected.x+1)*bounds.width/2,y:bounds.top+(1-projected.y)*bounds.height/2};
      });
      const area = points.reduce((sum,a,i)=>{const b=points[(i+1)%4];return sum+a.x*b.y-b.x*a.y;},0);
      if (!visible || area < 2) return null;
      return quadMatrix(points,tablet.logical.width,tablet.logical.height);
    });
    return projectionCache;
  }
  paintPose();
  function screenPoint(index,event,camera,bounds) {
    const tablet=tablets[index];ndc.set((event.clientX-bounds.left)/bounds.width*2-1,1-(event.clientY-bounds.top)/bounds.height*2);ray.setFromCamera(ndc,camera);
    tablet.sheet.updateWorldMatrix(true,false);tablet.sheet.getWorldPosition(center);normal.set(0,0,1).transformDirection(tablet.sheet.matrixWorld);plane.setFromNormalAndCoplanarPoint(normal,center);
    if(!ray.ray.intersectPlane(plane,hit))return null;
    const local=tablet.sheet.worldToLocal(hit.clone());return {index,x:(local.x+.5)*tablet.logical.width,y:(.5-local.y)*tablet.logical.height};
  }
  return {root, layout, project, screenPoint,
    setTextures(textures){tablets.forEach((t,i)=>{t.texture=textures[i];t.sheet.material.map=controlsReady()?t.texture:null;t.sheet.material.needsUpdate=true;});},
    hitScreen(event,camera,bounds){if(!controlsReady())return null;for(let i=tablets.length-1;i>=0;i--){const p=screenPoint(i,event,camera,bounds);if(p&&p.x>=0&&p.y>=0&&p.x<=tablets[i].logical.width&&p.y<=tablets[i].logical.height)return p;}return null;},
    update(dt, open, reduced, options) { if (disposed) return publicState(); if(wantsOpen!==Boolean(open))dirty=true;wantsOpen=Boolean(open);state = motion.update(dt,open&&!fallbackRequested,reduced,options);
      const floating=fallbackRequested||(floatingControls&&!state.ready);if(floating!==floatingControls){floatingControls=floating;dirty=true;}
      paintPose(); return publicState(); },
    reset() { state = motion.reset(); wantsOpen=false;fallbackRequested=false;floatingControls=false;lastBounds = null; dirty = true; paintPose(); },
    get state() { return {...publicState(),arms:[],assemblies:tablets.map(t=>({...t.assembly,point:undefined})),tablets:tablets.map(t=>({...t.pose,target:{...t.target}})),drawBatches:batches.length+6}; },
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); seat.removeFromParent(); resources.forEach(r=>r.dispose()); resources.clear(); }
  };
}
