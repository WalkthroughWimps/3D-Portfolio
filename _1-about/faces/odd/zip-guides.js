import * as THREE from 'three';
import {ribbonPoint} from './ribbon-path.mjs?v=addon-layout-2';

/** Exposed zipper-style folding throats: the cloth stays visible between the rails. */
export function createOpenZipGuides(parent,own,metal,dark){
  const guides=[],tangent=new THREE.Vector3(),width=new THREE.Vector3(),normal=new THREE.Vector3(),basis=new THREE.Matrix4();
  const camGeometry=own(new THREE.CylinderGeometry(.011,.011,.009,12));
  function tube(group,points,radius=.002){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const mesh=new THREE.Mesh(own(new THREE.TubeGeometry(curve,12,radius,6,false)),metal);group.add(mesh);
  }
  for(const side of [-1,1])for(let lane=0;lane<4;lane++){
    const group=new THREE.Group();group.name=`Open zip-fold throat ${side<0?'left':'right'} voice ${lane+1}`;parent.add(group);
    const wide=-side;
    for(const edge of [-1,1]){
      tube(group,[[-wide*.04,edge*.022,.005],[0,edge*.029,.009],[wide*.04,edge*.037,.005]]);
      tube(group,[[-wide*.026,edge*.025,.005],[-wide*.026,edge*.025,.029],[-wide*.015,edge*.017,.032]],.0018);
    }
    // A raised arch joins the ears while leaving both sides of the crease open.
    tube(group,[[-wide*.026,-.025,.028],[-wide*.03,0,.036],[-wide*.026,.025,.028]],.0023);
    const cams=[];
    for(const edge of [-1,1]){
      const cam=new THREE.Mesh(camGeometry,metal);cam.name='Faceted zipper feed cam';cam.position.set(-wide*.014,edge*.025,.015);group.add(cam);cams.push(cam);
      const pin=new THREE.Mesh(own(new THREE.CylinderGeometry(.003,.003,.017,8)),dark);pin.position.copy(cam.position);group.add(pin);
    }
    guides.push({group,lane,t:side<0?.285:.715,cams});
  }
  let previous=NaN,wasReduced=false;
  return {
    update(position,reduced=false){
      if(position===previous&&reduced===wasReduced)return;
      for(const guide of guides){
        const p=ribbonPoint(guide.t,position,0,guide.lane),a=ribbonPoint(guide.t-.0001,position,0,guide.lane),b=ribbonPoint(guide.t+.0001,position,0,guide.lane);
        tangent.set(b.x-a.x,b.y-a.y,b.z-a.z).normalize();width.set(p.widthX||0,p.widthY,p.widthZ).addScaledVector(tangent,-(tangent.x*(p.widthX||0)+tangent.y*p.widthY+tangent.z*p.widthZ)).normalize();normal.crossVectors(tangent,width).normalize();
        basis.makeBasis(tangent,width,normal);guide.group.quaternion.setFromRotationMatrix(basis);guide.group.position.set(p.x,p.y,p.z);
        for(const cam of guide.cams)cam.rotation.y=reduced?0:position*.084/.011;
      }
      previous=position;wasReduced=reduced;
    }
  };
}
