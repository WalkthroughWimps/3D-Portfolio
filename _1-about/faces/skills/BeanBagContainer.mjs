import * as THREE from 'three';

/** A compact oval basket following the Skills face's deployment. */
export function createBeanBagContainer({assembly, camera, canvas, supply, visuals, getSettings = () => ({})}) {
  const panels = [...assembly.motion.panels.values()];
  const find = name => panels.find(panel => panel.record.panelId === `panel-microsoft-${name}`);
  const word = find('word'), excel = find('excel'), powerPoint = find('powerpoint');
  if (!word || !excel || !powerPoint) throw new Error('Skills basket requires the Microsoft card anchors');
  const sidePanel = panels.find(panel => panel.record.panelId === 'panel-structure-panel-028');
  const sideSpan = sidePanel?.record.bodyDimensions?.lengthM;
  if (!(sideSpan > 0)) throw new Error('Skills basket requires the measured middle bottom-edge panel');
  const radius = .8763; // Authored inner edge of the circular mounting frame.
  const halfWidth = sideSpan / 2;
  const left = -halfWidth, right = halfWidth;
  const lower = x => -Math.sqrt(radius ** 2 - x ** 2);
  // Read the bottom cards' actual neutral and clicked vertices. Their decorative
  // outer mesh extends below the nominal body size and is the clearance limit.
  assembly.rig.deployNode.updateWorldMatrix(true,false);
  const toDeploy=assembly.rig.deployNode.matrixWorld.clone().invert(),vertex=new THREE.Vector3(),delta=new THREE.Vector3();
  let cardLowerY=Infinity;
  for(const panel of [word,excel,powerPoint])for(const mesh of panel.meshes){
    mesh.updateWorldMatrix(true,false);
    const base=mesh.geometry?.attributes?.position,clicked=mesh.geometry?.morphAttributes?.position?.[mesh.morphTargetDictionary?.Clicked];
    if(!base)continue;
    for(let i=0;i<base.count;i++){
      vertex.fromBufferAttribute(base,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(toDeploy);
      cardLowerY=Math.min(cardLowerY,vertex.y);
      if(clicked){vertex.fromBufferAttribute(base,i);delta.fromBufferAttribute(clicked,i);
        if(mesh.geometry.morphTargetsRelative)vertex.add(delta);else vertex.copy(delta);
        vertex.applyMatrix4(mesh.matrixWorld).applyMatrix4(toDeploy);cardLowerY=Math.min(cardLowerY,vertex.y);}
    }
  }
  if(!Number.isFinite(cardLowerY))throw new Error('Skills basket could not measure bottom card clearance');
  // The oval lip rises .012 at its corners (curve plus tube), so its highest
  // actual vertex still clears the neutral card by roughly .028.
  const hingeY = lower(halfWidth) + .006, topY = cardLowerY - .04;
  const faceZ = word.center.z + .085, depth = .13;
  const root = new THREE.Group(); root.name = 'Skills bottom-frame basket mount';
  (assembly.faceCarrier?.group || assembly.rig.deployNode.parent).add(root);
  root.position.copy(assembly.rig.restDeployPosition);
  const carriage = new THREE.Group(); carriage.name = 'Curved retracting basket carriage'; root.add(carriage);
  const resources = new Set(), own = value => {resources.add(value); return value;};
  const brass = own(new THREE.MeshStandardMaterial({color:'#b99a5d', metalness:.66, roughness:.34, emissive:'#503417'}));
  const enamel = own(new THREE.MeshStandardMaterial({color:'#477d80', metalness:.28, roughness:.42, emissive:'#18383b', side:THREE.DoubleSide,transparent:true,opacity:.58,depthWrite:false}));
  const hinge = new THREE.Group(); hinge.name = 'Moving bottom basket hinge'; hinge.position.set(0, hingeY, faceZ); carriage.add(hinge);
  const centerTop = topY - hingeY;
  const bottomY = u => lower(halfWidth*u) - hingeY + .005;
  const topEdge = u => centerTop + .009 * u * u;
  // The open bowl has a continuously rounded oval profile.
  const frontZ = (u, v) => .008 + depth * Math.sqrt(Math.max(0, 1-u*u)) * Math.sin(Math.PI * (.08 + .92*v) / 2);
  function surface(name, zAt, material) {
    const cols = 40, rows = 12, positions = [], indices = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = i / cols * 2 - 1, v = j / rows;
      positions.push(halfWidth*u, THREE.MathUtils.lerp(bottomY(u), topEdge(u), v), zAt(u,v));
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j*(cols+1)+i, b = a+cols+1; indices.push(a,b,a+1,b,b+1,a+1);
    }
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; hinge.add(mesh); return mesh;
  }
  const flap = surface('Smooth rounded oval basket front', frontZ, enamel);
  function line(name, points, material, size=.005) {
    const mesh = new THREE.Mesh(own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), Math.max(32, points.length*2), size, 8, false)), material);
    mesh.name = name; hinge.add(mesh); return mesh;
  }
  const frontRim = [], lowerRim = [];
  for (let i = 0; i <= 40; i++) {
    const u = i/20-1;
    frontRim.push(new THREE.Vector3(halfWidth*u, topEdge(u), frontZ(u,1)+.002));
    lowerRim.push(new THREE.Vector3(halfWidth*u, bottomY(u), frontZ(u,0)+.002));
  }
  line('Wide oval front lip', frontRim, brass, .003);
  line('Circular lower basket seam', lowerRim, brass, .002);
  for (const u of [-1,1]) line('Basket folded side seam', [
    new THREE.Vector3(halfWidth*u,bottomY(u),.005),
    new THREE.Vector3(halfWidth*u,(bottomY(u)+topEdge(u))*.5,.013),
    new THREE.Vector3(halfWidth*u,topEdge(u),.02)
  ],brass,.0025);
  // Replacement IDs share a physical slot; only one of each pair can be present.
  const storedBags = Array.from({length:8},(_,id) => {
    const slot=id%4, x=(slot%2 ? 1 : -1)*.047, y=.032, z=(slot<2 ? .025 : .057);
    const bag = visuals.create(id); bag.name = `Stored bean bag ${id+1}`;
    bag.position.set(x,y,z); bag.rotation.x = .9+[-.035,.025,-.02,.03][slot];
    bag.rotation.y = [-.12,.07,-.06,.11][slot]; bag.scale.setScalar(.55);
    hinge.add(bag); return bag;
  });
  const syncBags = () => {const available = new Set(supply.snapshot().availableIds); storedBags.forEach((bag,id) => {bag.visible=available.has(id);});};
  const unsubscribe = supply.subscribe(syncBags); syncBags();
  const sadMouth = new THREE.Line(own(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-.013,topY-.045-hingeY,depth+.005),
    new THREE.Vector3(0,topY-.041-hingeY,depth+.006),
    new THREE.Vector3(.013,topY-.045-hingeY,depth+.005)
  ])),own(new THREE.LineBasicMaterial({color:'#e4be80'})));
  sadMouth.name='Sad catcher expression'; sadMouth.visible=false; hinge.add(sadMouth);
  // Fit the folding path to the corrected backing. Keep conservative clearance
  // samples for the open side and lower bowl while rolling below the cards.
  const backing=assembly.rawNodes.get('back.skills') || assembly.rawNodes.get('back.skills Export') ||
    assembly.model.getObjectByName('back.skills') || assembly.model.getObjectByName('back.skills Export');
  if(!backing)throw new Error('Skills basket requires its corrected backing');
  const backingMeshes=[];backing.traverse(node=>{if(node.isMesh)backingMeshes.push(node);});
  root.updateWorldMatrix(true,false);backing.updateWorldMatrix(true,true);
  const rootInverse=root.matrixWorld.clone().invert();
  const origin=new THREE.Vector3(),worldDirection=new THREE.Vector3(0,0,-1).transformDirection(root.matrixWorld);
  const surfaceRay=new THREE.Raycaster();surfaceRay.far=4;
  function skinZ(x,y){
    origin.set(x,y,2).applyMatrix4(root.matrixWorld);surfaceRay.set(origin,worldDirection);
    const hit=surfaceRay.intersectObjects(backingMeshes,false)[0];
    return hit?hit.point.clone().applyMatrix4(rootInverse).z:null;
  }
  const clearanceSamples=[];
  for(let i=0;i<=16;i++)for(let j=0;j<=6;j++){
    const u=i/8-1,v=j/6;
    const y=THREE.MathUtils.lerp(bottomY(u),topEdge(u),v);
    clearanceSamples.push(new THREE.Vector3(halfWidth*u,y,-.011));
    clearanceSamples.push(new THREE.Vector3(halfWidth*u,y,frontZ(u,v)+.004));
  }
  for(const x of [-halfWidth*.84,halfWidth*.84])for(const z of [0,depth*.91])
    clearanceSamples.push(new THREE.Vector3(x,.013,z));
  const smooth=t=>t*t*(3-2*t);
  const poseAt=t=>{
    // Roll the curved wall toward the face first, below the Word/Excel/PowerPoint
    // edge; only then lift the folded bowl along the backing's measured slope.
    const angle=1.7*smooth(t),desiredRise=.09*smooth(THREE.MathUtils.clamp((t-.28)/.72,0,1));
    const c=Math.cos(angle),s=Math.sin(angle),highest=Math.max(...clearanceSamples.map(point=>hingeY+point.y*c-point.z*s));
    return{rise:Math.min(desiredRise,cardLowerY-.018-highest),angle};
  };
  const path=Array.from({length:65},(_,i)=>{
    const t=i/64,{rise,angle}=poseAt(t),c=Math.cos(angle),s=Math.sin(angle);
    let required=-Infinity;
    for(const point of clearanceSamples){
      const y=hingeY+rise+point.y*c-point.z*s;
      const surface=skinZ(point.x,y);
      if(surface!==null)required=Math.max(required,surface+.017-(point.y*s+point.z*c));
    }
    if(!Number.isFinite(required))throw new Error('Skills basket could not sample its backing');
    return {rise,angle,z:Math.max(THREE.MathUtils.lerp(faceZ,required,t),required)};
  });
  let retraction=1,sad=0,sadTime=0,catchPulse=0,tucked=true,suspended=false,disposed=false;
  const ray=new THREE.Raycaster(),ndc=new THREE.Vector2();
  const allowed=()=>!disposed&&!suspended&&!assembly.suspended&&assembly.motion.focused&&!assembly.motion.paused&&retraction<.02&&getSettings().about?.skills?.enabled!==false;
  function pickStoredBag(event) {
    if (!allowed()) return null;
    root.updateWorldMatrix(true,true); camera.updateWorldMatrix(true,false);
    const rect=canvas.getBoundingClientRect();
    ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    ray.setFromCamera(ndc,camera);
    // The decorative seam is a LineLoop; its default ray threshold is a full
    // world unit and would falsely select bags across most of this face.
    const pickMeshes=storedBags.filter(bag=>bag.visible).flatMap(bag=>bag.children.filter(child=>child.isMesh));
    for (const hit of ray.intersectObjects(pickMeshes,false)) {
      let node=hit.object;
      while (node && !Number.isInteger(node.userData.beanBagId)) node=node.parent;
      if (node) return {id:node.userData.beanBagId,position:node.getWorldPosition(new THREE.Vector3())};
    }
    return null;
  }
  function hitTray(event) {
    if(!allowed())return false;
    root.updateWorldMatrix(true,true);camera.updateWorldMatrix(true,false);
    const rect=canvas.getBoundingClientRect();ndc.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    ray.setFromCamera(ndc,camera);
    // The hinge and bowl are translated by faceZ in root space. A depth test
    // around zero misses the real tray and can accept a ray through the face.
    // Only the bowl itself should toggle toss mode when a card is clicked above it.
    const hit=ray.intersectObject(flap,true)[0];
    if(!hit)return Boolean(pickStoredBag(event));
    const local=hit.point.clone().applyMatrix4(root.matrixWorld.clone().invert());
    return Math.abs(local.x)<=halfWidth+.045&&local.y>=lower(halfWidth)-.08&&local.y<=topY+.06&&local.z>=faceZ-.045&&local.z<=faceZ+depth+.08;
  }
  function floorAnchor(){
    root.updateWorldMatrix(true,false);
    return new THREE.Vector3(0,hingeY-.075,faceZ+depth*.52).applyMatrix4(root.matrixWorld);
  }
  function poseArms() {
    sadMouth.visible=sad>.35&&retraction<.2;
  }
  function syncPose() {
    // PanelMotion has already updated the rig in the face's update. Its actual
    // deployment also accounts for queued/active card turns and reversals.
    retraction=1-THREE.MathUtils.clamp(assembly.rig.deployment,0,1);
    const index=retraction*64,lo=Math.floor(index),hi=Math.min(64,lo+1),mix=index-lo;
    const from=path[lo],to=path[hi];
    carriage.position.y=THREE.MathUtils.lerp(from.rise,to.rise,mix);
    carriage.position.z=THREE.MathUtils.lerp(from.z,to.z,mix)-faceZ;
    hinge.rotation.x=THREE.MathUtils.lerp(from.angle,to.angle,mix);
    tucked=retraction>.01;
  }
  syncPose();
  function update(dt) {
    if(disposed||suspended||assembly.suspended)return;
    const step=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
    const reduced=assembly.motion.reducedMotion;
    syncPose();
    const contrast=THREE.MathUtils.clamp(getSettings().start?.contrast??.5,0,1);
    const ease=contrast*contrast*(3-2*contrast);
    brass.emissiveIntensity=.08+(2.4-.08)*ease;
    enamel.emissiveIntensity=.06+.75*ease;
    sadTime=Math.max(0,sadTime-step);sad=reduced?Number(sadTime>0):THREE.MathUtils.damp(sad,sadTime>0?1:0,7,step);
    catchPulse=Math.max(0,catchPulse-step*1.8);poseArms();
  }
  poseArms();
  return {
    root,carriage,hinge,flap,storedBags,pickStoredBag,hitTray,floorAnchor,get open(){return retraction<.02;},get travel(){return 1-retraction;},
    get retraction(){return retraction;},get tucked(){return tucked;},get sad(){return sad;},
    get bounds(){return {left,right,topY,hingeY,radius,depth,faceZ,referencePanelId:sidePanel.record.panelId,referenceSpan:sideSpan};},
    get railPath(){return path.map(p=>({...p}));},
    update,
    getRecoveryTarget(id){
      if(disposed)return null;
      catchPulse=1;const bag=storedBags[id];if(!bag)return null;
      bag.updateWorldMatrix(true,false);return bag.getWorldPosition(new THREE.Vector3());
    },
    onCatch(){catchPulse=1;},onDestroy(){sadTime=2.6;sad=Math.max(sad,.2);},
    suspend(){suspended=true;},resume(){suspended=false;update(0);},
    dispose(){if(disposed)return;disposed=true;unsubscribe();root.removeFromParent();resources.forEach(resource=>resource.dispose());resources.clear();}
  };
}
