import {contrastGain} from './theme.mjs?v=contrast-glows-1';
import * as THREE from 'three';
import {laneHeight} from './ribbon-path.mjs?v=addon-layout-2';
import {TRACK_MUTE,stepTrackMute} from './track-mute.mjs?v=conveyor-1';

/** A continuous front hinge spindle returns to the guide carrier outside the cloth edges. */
export function createSelectorRail(group,own,metal,side){
  const rail=new THREE.Group();rail.name=(side<0?'Left destination':'Right mute')+' connected selector rail';group.add(rail);
  const shaft=new THREE.Mesh(own(new THREE.CylinderGeometry(.0032,.0032,.348,16)),metal);shaft.name='Continuous selector hinge spindle';shaft.position.set(side*.700,0,.279);rail.add(shaft);
  for(const sign of[-1,1]){
    const points=[[side*.700,sign*.174,.279],[side*.744,sign*.174,.279],[side*.744,sign*.174,.182]],curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const tie=new THREE.Mesh(own(new THREE.TubeGeometry(curve,24,.0032,8,false)),metal);tie.name='Selector spindle return to guide carrier';rail.add(tie);
  }
  return rail;
}

/** Independent rear sliding yokes; rollers withdraw the cloth from the reader. */
export function createTrackMute(group,own,metal,dark,plaque,targets){
  const root=new THREE.Group();root.name='Four independent reader withdrawal carriers';group.add(root);
  const amounts=[0,0,0,0],tabs=[],carriers=[],withdrawalRollers=[];
  const mesh=(name,geometry,material,parent=root)=>{const m=new THREE.Mesh(own(geometry),material);m.name=name;parent.add(m);return m;};
  // The reader lives in front of the wool; a plunger pushes it inward on mute.
  const rail=mesh('Playhead reader actuator spine',new THREE.CylinderGeometry(.0025,.0025,.338,12),metal);rail.position.set(.038,0,TRACK_MUTE.railZ);
  for(const y of[-.169,.169]){
    const support=mesh('Reader spine to playhead tie',new THREE.BoxGeometry(.040,.007,.009),dark);support.position.set(.019,y,TRACK_MUTE.railZ);
    const foot=mesh('Playhead reader mounting seat',new THREE.BoxGeometry(.014,.014,.024),dark);foot.position.set(0,y,.291);
  }
  const shoulderRollers=[],rubber=own(new THREE.MeshStandardMaterial({color:'#24352f',roughness:.98,metalness:0}));
  for(const side of[-1,1]){
    const x=side*TRACK_MUTE.shoulder,shaft=new THREE.Group();shaft.name='Panel-driven roller shaft '+(side<0?'left':'right');shaft.position.set(x,0,TRACK_MUTE.drumZ);root.add(shaft);
    mesh('Thin rotating roller spindle',new THREE.CylinderGeometry(.0025,.0025,.420,16),metal,shaft);shoulderRollers.push(shaft);
    for(let lane=0;lane<4;lane++){
      const drum=mesh('Rubber cloth support drum '+(lane+1),new THREE.CylinderGeometry(TRACK_MUTE.drumRadius,TRACK_MUTE.drumRadius,.069,24),rubber,shaft);drum.position.y=laneHeight(lane);
      for(const end of[-1,1]){const rim=mesh('Rubber drum shoulder',new THREE.TorusGeometry(.0055,.00045,6,24),rubber,shaft);rim.rotation.x=Math.PI/2;rim.position.y=laneHeight(lane)+end*.033;}
    }
    for(const y of[-.205,.205]){
      const seat=mesh('Control panel roller bearing',new THREE.CylinderGeometry(.010,.010,.026,20),dark);seat.position.set(x,y,TRACK_MUTE.drumZ);
      const collar=mesh('Roller bearing brass lip',new THREE.TorusGeometry(.006,.0015,8,20),metal);collar.rotation.x=Math.PI/2;collar.position.set(x,y-Math.sign(y)*.014,TRACK_MUTE.drumZ);
    }
  }
  const colors=['#304e78','#59416e','#763e50','#245d60'];
  createSelectorRail(group,own,metal,1);
  for(let lane=0;lane<4;lane++){
    const y=laneHeight(lane),carrier=new THREE.Group();carrier.name='Voice '+(lane+1)+' retracting cloth yoke';carrier.position.set(0,y,0);root.add(carrier);
    const tie=mesh('Reader actuator attachment',new THREE.BoxGeometry(.018,.007,.008),dark);tie.position.set(.030,y,TRACK_MUTE.railZ);
    const bridge=mesh('Playhead reader fork bridge',new THREE.BoxGeometry(.030,.071,.006),dark,carrier);bridge.position.set(.012,0,.268);
    for(const end of[-1,1]){
      const fork=mesh('Reader end bearing fork',new THREE.CylinderGeometry(.0015,.0015,.012,10),metal,carrier);fork.rotation.x=Math.PI/2;fork.position.set(0,end*.0355,.262);
      const bearing=mesh('Reader drum end bearing',new THREE.SphereGeometry(.0025,10,8),metal,carrier);bearing.position.set(0,end*.0355,TRACK_MUTE.rollerZ);
    }
    const roller=mesh('Playhead-aligned cloth reader '+(lane+1),new THREE.CylinderGeometry(TRACK_MUTE.rollerRadius,TRACK_MUTE.rollerRadius,TRACK_MUTE.rollerWidth,24),rubber,carrier);
    roller.position.set(0,0,TRACK_MUTE.rollerZ);roller.userData.oddReaderRoller=true;withdrawalRollers.push(roller);
    const guide=mesh('Fixed front reader piston guide',new THREE.CylinderGeometry(.0042,.0042,.018,12),metal);guide.rotation.x=Math.PI/2;guide.position.set(.022,y,TRACK_MUTE.railZ);
    const piston=mesh('Constant-length reader pushrod',new THREE.CylinderGeometry(.0022,.0022,.061,12),metal,carrier);piston.rotation.x=Math.PI/2;piston.position.set(.022,0,.2955);
    carriers.push(carrier);
    const hinge=new THREE.Group();hinge.name='Voice '+(lane+1)+' mute tab';hinge.position.set(.700,y,.279);group.add(hinge);
    const key=plaque('',0,0,0,.078,.045,colors[lane],'#fff2c9','mute:'+lane);key.name='Mute voice '+(lane+1);group.remove(key);hinge.add(key);key.position.set(-.043,0,.004);
    mesh('Mute tab hinge',new THREE.CylinderGeometry(.005,.005,.029,12),metal,hinge);
    const iconMaterial=own(new THREE.MeshStandardMaterial({color:'#efe4bd',emissive:'#eb3b35',emissiveIntensity:.06,roughness:.3}));
    const shape=new THREE.Shape();shape.moveTo(-.023,-.005);shape.lineTo(-.017,-.005);shape.lineTo(-.008,-.012);shape.lineTo(-.008,.012);shape.lineTo(-.017,.005);shape.lineTo(-.023,.005);shape.closePath();
    const speaker=mesh('Illuminated mute speaker',new THREE.ExtrudeGeometry(shape,{depth:.002,bevelEnabled:false}),iconMaterial,hinge);speaker.position.set(-.043,0,.012);speaker.userData.oddAction='mute:'+lane;targets.push(speaker);
    for(const rotation of[-Math.PI/4,Math.PI/4]){const stroke=mesh('Illuminated mute cross',new THREE.BoxGeometry(.020,.0028,.002),iconMaterial,hinge);stroke.position.set(-.034,0,.014);stroke.rotation.z=rotation;stroke.userData.oddAction='mute:'+lane;targets.push(stroke);}
    tabs.push({hinge,key,iconMaterial});
  }
  return {root,amounts,tabs,carriers,update(dt,lanes,reduced,position=0,contrast=.5){
    shoulderRollers.forEach(roller=>{roller.rotation.y=-position*.096/.006;});
    withdrawalRollers.forEach(roller=>{roller.rotation.y=-position*.096/TRACK_MUTE.rollerRadius;});
    const changed=[];for(let i=0;i<4;i++){
      const muted=Boolean(lanes[i]?.muted),prior=amounts[i];amounts[i]=stepTrackMute(prior,muted,dt,reduced);changed[i]=prior!==amounts[i];
      carriers[i].position.z=-TRACK_MUTE.depth*amounts[i];tabs[i].hinge.rotation.y=.18*(1-amounts[i]);
      tabs[i].iconMaterial.color.set(muted?'#ec5149':'#b3bfaf');tabs[i].iconMaterial.emissive.set(muted?'#eb3b35':'#fff0c9');tabs[i].iconMaterial.emissiveIntensity=(muted?1.33:.36)*contrastGain(contrast);
      tabs[i].key.userData.oddMuted=muted;
    }return changed;
  }};
}
