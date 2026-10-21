import * as THREE from 'three';
const wrap=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));

/** Screen-relative face roll on a concealed race; no cube face has a privileged up. */
export class FaceCarrierRoll {
  constructor({rig,motion,model,manifest,findRawNode}){
    this.rig=rig;this.motion=motion;this.model=model;this.enabled=true;this.angle=0;this.target=0;this.velocity=0;this.lastRaw=null;this.saved=[];this.hidden=[];
    this.parent=rig.deployNode.parent;this.group=new THREE.Group();this.group.name='Skills rotating bearing carriage';this.parent.add(this.group);model.updateMatrixWorld(true);
    const nodes=[rig.deployNode,...rig.supports.map(s=>s.aim)];
    for(const node of nodes){this.saved.push({node,parent:node.parent,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});this.group.attach(node);}
    for(const support of manifest.supports){const name=manifest.exportNodeNames?.[support.saddleObject]||`${support.saddleObject} GLB`,node=findRawNode(name)||findRawNode(support.saddleObject);
      if(node){this.hidden.push([node,node.visible]);node.visible=false;}}
    const batchedSaddles=findRawNode(manifest.fixedBackingMounts?.exportMeshName||'V9 Eight Fixed Backing Saddles GLB');
    if(batchedSaddles){this.hidden.push([batchedSaddles,batchedSaddles.visible]);batchedSaddles.visible=false;}
    if(!this.hidden.length)throw new Error('Missing fixed saddle binding for rotating carriage');
    const spec=manifest.clearanceMetadata.faceBearing;
    this.allDeploymentRollSafe=spec.allDeploymentRollSafe===true;
    this.material=new THREE.MeshStandardMaterial({color:'#26313d',metalness:.78,roughness:.32});
    const radius=spec.radiusM??spec.stator.centerlineRadiusM;
    this.stator=spec.nativeStationaryRingNodeName?findRawNode(spec.nativeStationaryRingNodeName):null;
    if(spec.nativeStationaryRingNodeName&&!this.stator)throw new Error('Missing native stationary bearing ring');
    this.ownsStator=!this.stator;
    if(this.ownsStator){this.stator=new THREE.Mesh(new THREE.TorusGeometry(radius,spec.statorTubeM??spec.stator.tubeRadiusM,12,144),this.material);this.stator.name='Concealed stationary annular race';this.stator.position.z=spec.statorDepthM??-spec.stator.centerWorld[1];this.parent.add(this.stator);}
    this.runner=new THREE.Mesh(new THREE.TorusGeometry(spec.runner.centerlineRadiusM??radius,spec.runnerTubeM??spec.runner.tubeRadiusM,12,144),this.material);this.runner.name='Rotating annular guide carrier';this.runner.position.z=spec.runnerDepthM??-spec.runner.centerWorld[1];this.group.add(this.runner);
    this.right=new THREE.Vector3();this.up=new THREE.Vector3();this.normal=new THREE.Vector3();this.inverse=new THREE.Matrix4();
  }
  setEnabled(value){this.enabled=Boolean(value);}
  reset(){this.angle=this.target=this.velocity=0;this.lastRaw=null;this.group.rotation.z=0;this.group.updateMatrixWorld(true);}
  canRetract(){return this.allDeploymentRollSafe||this.angle===0;}
  isSettled(){return Math.abs(this.target-this.angle)<.0001&&Math.abs(this.velocity)<.001;}
  update(dt,camera,reduced=false){
    const enabled=this.enabled&&!this.rig.options.showSidePanels;
    const allowed=this.allDeploymentRollSafe||this.rig.deployment===1;
    const requested=enabled&&(this.allDeploymentRollSafe||this.motion.focused&&(this.motion.target>=.999||this.motion.active.size||this.motion.queue.size));
    if(!requested||!allowed){this.target=this.allDeploymentRollSafe?this.angle+wrap(-this.angle):0;this.lastRaw=null;}
    else{
      this.model.updateMatrixWorld(true);camera.updateMatrixWorld(true);this.inverse.copy(this.parent.matrixWorld).invert();
      this.right.setFromMatrixColumn(camera.matrixWorld,0).transformDirection(this.inverse);
      this.normal.setFromMatrixColumn(camera.matrixWorld,2).transformDirection(this.inverse);
      // Cross(face normal, screen right) projects vertically on screen. At grazing
      // or rear views keep the last heading, rather than invent a 180-degree turn.
      if(this.normal.z>.08&&this.right.x*this.right.x+this.right.y*this.right.y>.0064){
        this.up.set(-this.right.y,this.right.x,0).normalize();const raw=Math.atan2(-this.up.x,this.up.y);
        this.target=this.lastRaw===null?this.angle+wrap(raw-this.angle):this.target+wrap(raw-this.lastRaw);
        this.lastRaw=raw;
      }else this.lastRaw=null;
    }
    const delta=this.target-this.angle,step=Math.min(.05,Math.max(0,dt));
    if(reduced){this.angle=this.target;this.velocity=0;}
    else{
      // Critically damped and rate/acceleration limited, including target changes.
      const acceleration=THREE.MathUtils.clamp(36*delta-12*this.velocity,-12,12);
      this.velocity=THREE.MathUtils.clamp(this.velocity+acceleration*step,-2.6,2.6);
      this.angle+=this.velocity*step;
      if(Math.abs(delta)<.0001&&Math.abs(this.velocity)<.001){this.angle=this.target;this.velocity=0;}
    }
    this.group.rotation.z=this.angle;this.group.updateMatrixWorld(true);this.rig.updateTransforms();
    return Math.abs(delta)>1e-6;
  }
  getStats(){return{enabled:this.enabled,angle:this.angle,target:this.target,velocity:this.velocity,allDeploymentRollSafe:this.allDeploymentRollSafe,docked:this.angle===0,deployment:this.rig.deployment};}
  dispose(){for(const {node,parent,position,quaternion,scale}of this.saved){parent.add(node);node.position.copy(position);node.quaternion.copy(quaternion);node.scale.copy(scale);}
    for(const [node,visible]of this.hidden)node.visible=visible;if(this.ownsStator){this.stator.geometry.dispose();this.stator.removeFromParent();}this.runner.geometry.dispose();this.material.dispose();this.group.removeFromParent();}
}
