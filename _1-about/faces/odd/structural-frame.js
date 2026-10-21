import * as THREE from 'three';
import {RIBBON,REEL_FRAMES} from './ribbon-path.mjs?v=addon-layout-2';

const vector=p=>new THREE.Vector3(...p);
function sweptBracket(points,width,thickness,own){
  const curve=new THREE.CatmullRomCurve3(points.map(vector)),positions=[],indices=[],side=new THREE.Vector3(1,0,0),normal=new THREE.Vector3();
  for(let i=0;i<=64;i++){
    const t=i/64,p=curve.getPoint(t),tangent=curve.getTangent(t);normal.crossVectors(tangent,side).normalize();
    for(const [x,z]of [[-1,-1],[1,-1],[1,1],[-1,1]])positions.push(p.x+side.x*x*width/2+normal.x*z*thickness/2,p.y+side.y*x*width/2+normal.y*z*thickness/2,p.z+side.z*x*width/2+normal.z*z*thickness/2);
    if(i<64)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4;indices.push(a,b,a+4,b,b+4,a+4);}
  }
  indices.push(0,2,1,0,3,2,256,257,258,256,258,259);
  const geometry=own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Carrier-owned supports with their bearing crossing recessed inside the chassis lip. */
export function createStructuralFrame(parent,own,metal,dark,{statorParent=null}={}){
  const root=new THREE.Group();root.name='Odd rotary frame and structural yoke';parent.add(root);
  function mesh(geometry,material,name,group=root){const item=new THREE.Mesh(own(geometry),material);item.name=name;group.add(item);return item;}
  function tube(points,radius,material,name,group=root){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(vector)),64,radius,8,false),material,name,group);}
  function straightTube(points,radius,material,name){const path=new THREE.CurvePath();for(let i=1;i<points.length;i++)path.add(new THREE.LineCurve3(vector(points[i-1]),vector(points[i])));return mesh(new THREE.TubeGeometry(path,64,radius,8,false),material,name);}
  function spindle(x,y,z,radius,length,name){const item=mesh(new THREE.CylinderGeometry(radius,radius,length,24),metal,name);item.rotation.x=Math.PI/2;item.position.set(x,y,z);return item;}
  const frame=mesh(new THREE.TorusGeometry(.855,.011,10,128),dark,'Snug opening frame');frame.position.z=.221;
  const bead=mesh(new THREE.TorusGeometry(.839,.003,6,128),metal,'Inner frame lip');bead.position.z=.225;
  const stationaryRace=new THREE.Group();stationaryRace.name='Odd stationary chassis bearing race';(statorParent||parent).add(stationaryRace);stationaryRace.position.z=statorParent?RIBBON.recess:0;
  // The .885-radius opening and its original trench/highlight pipes stay exposed.
  // This narrow race sits entirely inside that opening; the hidden bearing
  // transfer passes through the existing solid lip, below its outer surface.
  const raceProfile=[[.869,.215],[.877,.215],[.877,.229],[.874,.232],[.869,.232]].map(([r,z])=>new THREE.Vector2(r,z));
  const race=mesh(new THREE.LatheGeometry(raceProfile,144),dark,'Recessed opening bearing race',stationaryRace);race.rotation.x=Math.PI/2;
  for(let i=0;i<8;i++){const a=i*Math.PI/4,screw=mesh(new THREE.CylinderGeometry(.0025,.0025,.003,6),metal,'Fixed race screw',stationaryRace);screw.rotation.x=Math.PI/2;screw.position.set(Math.cos(a)*.873,Math.sin(a)*.873,.234);}
  for(const sign of [-1,1])for(const x of [-.30,.30]){
    const y=sign*Math.sqrt(.837**2-x*x),tab=mesh(new THREE.BoxGeometry(.027,.067,.021),dark,'Control-cover frame mounting tab');tab.position.set(x,y,.222);tab.rotation.z=-Math.atan2(x,y);
    spindle(x,sign*Math.sqrt(.851**2-x*x),.238,.008,.009,'Frame attachment screw');
  }
  const rear=new THREE.Group();rear.name='Rear structural bracket';rear.userData.oddClearance='rear';root.add(rear);
  // Rig-local Z is cube Y minus .742. The socket center is cube [0,.43,0].
  const coupling=mesh(new THREE.CylinderGeometry(.057,.057,.150,36),dark,'Rotary input coupling',rear);coupling.rotation.x=Math.PI/2;coupling.position.z=-.260;
  for(const z of [-.338,-.286]){const ring=mesh(new THREE.TorusGeometry(.043,.007,8,40),metal,'Rotary coupling bearing',rear);ring.position.z=z;}
  for(let i=0;i<4;i++){const a=i*Math.PI/2,bolt=mesh(new THREE.CylinderGeometry(.005,.005,.008,6),metal,'Coupling rotor bolt',rear);bolt.rotation.x=Math.PI/2;bolt.position.set(Math.cos(a)*.046,Math.sin(a)*.046,-.278);}
  const rearPoints=[[0,0,-.200],[0,.12,-.180],[0,.34,-.125],[0,.60,.004],[0,.75,.090],[0,.80,.145],[0,.83,.175]];
  const rail=new THREE.Mesh(sweptBracket(rearPoints,.058,.008,own),dark);rail.name='Curved load-bearing spheroid bracket';rear.add(rail);
  for(const side of [-1,1])tube(rearPoints.map(p=>[p[0]+side*.024,p[1],p[2]]),.0025,metal,'Bracket edge rib',rear);
  const shoe=mesh(new THREE.BoxGeometry(.074,.022,.013),dark,'Rear race entry bearing shoe',rear);shoe.position.set(0,.830,.175);
  for(const x of [-.027,.027])spindle(x,.830,.166,.004,.006,'Rear race shoe screw');
  // The return crosses the buried bearing seat and emerges inside the opening.
  // No exposed cap or bracket reaches across the original illuminated trench.
  const rimPoints=[[0,.830,.175],[0,.830,.201],[0,.840,.214],[0,.845,.223],[0,.845,.221]];
  const rim=new THREE.Mesh(sweptBracket(rimPoints,.058,.016,own),dark);rim.name='Chassis rim return and frame anchor';rim.userData.oddClearance='rim';root.add(rim);
  spindle(0,.845,.238,.013,.014,'Bracket-to-frame bolt');
  for(const [index,center] of [RIBBON.takeup,RIBBON.supply].entries()){
    const r=Math.hypot(...center),dx=center[0]/r,dy=center[1]/r;
    // Travel over the front of the reel at a fixed depth, then turn down the
    // bearing's tilted empty hub. Straight sections cannot bow through the winding.
    const frame=index?REEL_FRAMES.supply:REEL_FRAMES.takeup,base=RIBBON.reelLift+frame.lift,frontAxial=(.225-base)/Math.cos(frame.angle);
    const frontX=center[0]+Math.sin(frame.angle)*frontAxial;
    const points=[[dx*.825,dy*.825,.217],[dx*.77,dy*.77,.225],[dx*.65,dy*.65,.225],[frontX,center[1],.225],[center[0],center[1],base],[center[0],center[1],RIBBON.reelLift-.012]];
    const support=straightTube(points,.007,dark,'Frame-anchored rear spindle support');support.userData.oddClearance='rear';support.userData.oddReelSupport=true;
    const pedestal=spindle(center[0],center[1],RIBBON.reelLift-.012,.039,.024,'Fixed spindle bearing pedestal');pedestal.userData.oddReelSupport=true;
    spindle(dx*.825,dy*.825,.233,.009,.011,'Reel support frame bolt');
  }
  const cableMaterial=own(new THREE.MeshStandardMaterial({color:'#612f24',roughness:.72,metalness:.12}));
  const cablePoints=[[0,.851,.239],[.16,.835,.239],[.305,.787,.239],[.328,.742,.246],[.30,.70,.248]];
  for(const [offset,material]of [[0,cableMaterial],[.009,dark]])tube(cablePoints.map(p=>[p[0]+offset,p[1],p[2]]),.0028,material,'Frame-to-upper-panel cable');
  for(const p of [cablePoints[0],cablePoints.at(-1)])spindle(p[0],p[1],p[2],.009,.015,'Panel loom strain relief');
  const headDepth=.300;
  for(const x of [-.006,.006])tube([[x,.21,.247],[x,.18,headDepth],[x,0,headDepth],[x,-.18,headDepth],[x,-.21,.247]],.0019,x<0?cableMaterial:dark,'Playhead inter-panel cable');
  for(const y of [-.18,0,.18]){const clip=mesh(new THREE.BoxGeometry(.025,.008,.009),metal,'Playhead loom clamp');clip.position.set(0,y,headDepth+.001);}
  for(const y of [-.19,.19]){const tab=mesh(new THREE.BoxGeometry(.030,.034,.055),dark,'Playhead panel anchor');tab.position.set(0,y,.275);}
  return {root,frame,stationaryRace,inputCubeLocal:Object.freeze([0,.43,0]),fixedArmEndCubeLocal:Object.freeze([0,.40,0]),inputRigLocal:Object.freeze([0,0,-.312]),frameRadius:.855,frameRigDepth:.221,openingRadius:.885,chassisRace:Object.freeze({radius:[.878,.914],cubeY:[.875,.969]}),dispose(){stationaryRace.removeFromParent();root.removeFromParent();}};
}
