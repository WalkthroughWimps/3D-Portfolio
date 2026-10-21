import * as THREE from 'three';
import {EXIT_GUIDE,FOLDERS,GUIDE,RIBBON,reelRadii,reelRoutePlan,laneHeight} from './ribbon-path.mjs?v=addon-layout-2';

// The guide pins stay fixed. Their live contact points move around the pins as
// the reels fill, while the fabric follows the same solved circular arc.
export function createTapeGuides(parent,own,metal,dark){
  const group=new THREE.Group();group.name='Eight short-tangent tape exit guides';parent.add(group);
  const guides=[];
  for(const side of [-1,1])for(let lane=0;lane<RIBBON.lanes;lane++){
    const plan=reelRoutePlan(side,lane,RIBBON.coreRadius);
    const body=new THREE.Mesh(own(new THREE.CylinderGeometry(EXIT_GUIDE.bodyRadius,EXIT_GUIDE.bodyRadius*.75,EXIT_GUIDE.bodyLength,24)),metal);
    body.rotation.x=Math.PI/2;body.position.set(plan.O.x,plan.O.y,plan.O.z);
    body.name=(side<0?'Take-up':'Supply')+' lane '+(lane+1)+' tapered exit guide';
    body.userData.oddTapeGuide={side,lane,axis:[0,0,1],center:[plan.O.x,plan.O.y,plan.O.z],bodyRadius:EXIT_GUIDE.bodyRadius,tapeRadius:EXIT_GUIDE.tapeRadius};
    group.add(body);
    const seat=new THREE.Mesh(own(new THREE.CylinderGeometry(.004,.004,.008,12)),dark);
    seat.rotation.x=Math.PI/2;seat.position.set(plan.O.x,plan.O.y,plan.O.z-.014);seat.name='Rear exit-guide axle seat';group.add(seat);
    const rearMountZ=GUIDE.centerZ-GUIDE.tapeRadius-FOLDERS.outerBack-.005;
    const path=[new THREE.Vector3(side*.706,laneHeight(lane),rearMountZ-.007),new THREE.Vector3(plan.O.x,plan.O.y,rearMountZ-.007),new THREE.Vector3(plan.O.x,plan.O.y,plan.O.z-.014)];
    const mount=new THREE.Mesh(own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),12,.0025,6,false)),dark);
    mount.name='Rear-bank-connected exit-guide axle mount';mount.userData.oddReelSupport=true;mount.userData.oddTapeGuideMount=true;group.add(mount);
    guides.push({side,lane,body});
  }
  let previousPosition=NaN;
  return {group,guides,update(position){
    if(position===previousPosition)return;previousPosition=position;
    const radii=reelRadii(position);
    for(const {side,lane,body} of guides){
      const plan=reelRoutePlan(side,lane,side<0?radii.takeup:radii.supply);
      Object.assign(body.userData.oddTapeGuide,{contact:[plan.B.x,plan.B.y,plan.B.z],reelTangent:[plan.T.x,plan.T.y,plan.T.z],turn:plan.turn});
    }
  }};
}
