import * as THREE from 'three';
import {poseBox} from './book-layout.mjs';

function arrowShape(side){
  const sign=side==='previous'?-1:1;
  const shape=new THREE.Shape();
  shape.moveTo(sign*.115,0);
  shape.lineTo(-sign*.012,.093);
  shape.lineTo(-sign*.012,.043);
  shape.lineTo(-sign*.10,.043);
  shape.lineTo(-sign*.10,-.043);
  shape.lineTo(-sign*.012,-.043);
  shape.lineTo(-sign*.012,-.093);
  shape.closePath();
  return shape;
}

export function pageControlPlacements(poses,bounds,grade){
  const index=Math.max(0,Math.min(poses.length-1,grade-1));
  const boxes=poses.map((p,i)=>poseBox(p,Array.isArray(bounds)?bounds[i]:bounds));
  const box=boxes[index],center=box.getCenter(new THREE.Vector3()),height=box.getSize(new THREE.Vector3()).y;
  const halfWidth=Math.max(center.x-box.min.x,box.max.x-center.x);
  const free=(x,y,r)=>boxes.every(b=>x+r+.018<b.min.x||x-r-.018>b.max.x||y+r+.018<b.min.y||y-r-.018>b.max.y);
  const span=Math.max(...boxes.map(b=>Math.max(Math.abs(b.min.x-center.x),Math.abs(b.max.x-center.x))));
  const radius=.154,z=Math.max(...boxes.map(b=>b.max.z))+.055;
  let best=null;
  const outer=Math.min(center.x-Math.min(...boxes.map(b=>b.min.x)),Math.max(...boxes.map(b=>b.max.x))-center.x);
  const insideLimit=outer-radius-.01;
  const offsets=[0];
  for(let delta=.025;delta<=height*.5-radius;delta+=.025)offsets.push(-delta,delta);
  for(const offset of offsets){
    const y=center.y+offset;
    for(let distance=halfWidth+radius+.025;distance<=insideLimit;distance+=.025){
      const left=center.x-distance,right=center.x+distance;
      if(!free(left,y,radius)||!free(right,y,radius))continue;
      const score=distance+Math.abs(offset)*.3;
      if(!best||score<best.score)best={left,right,y,score};
      break;
    }
  }
  if(!best)for(const offset of [0,box.max.y-center.y+radius+.04,box.min.y-center.y-radius-.04]){
    const y=center.y+offset;
    for(let distance=halfWidth+radius+.035;distance<=span+radius+.12;distance+=.025){
      const left=center.x-distance,right=center.x+distance;
      if(free(left,y,radius)&&free(right,y,radius)){best={left,right,y};break;}
    }
    if(best)break;
  }
  const distance=best?null:span+radius+.07;
  const left=best?.left??center.x-distance,right=best?.right??center.x+distance,y=best?.y??center.y;
  return {previous:{position:new THREE.Vector3(left,y,z),radius},next:{position:new THREE.Vector3(right,y,z),radius}};
}

export function overviewPageControlPlacements(poses,bounds){
  const boxes=poses.map((p,i)=>poseBox(p,Array.isArray(bounds)?bounds[i]:bounds));
  const grouped=axis=>{
    const entries=boxes.map(box=>({center:box.getCenter(new THREE.Vector3())[axis],min:box.min[axis],max:box.max[axis]})).sort((a,b)=>a.center-b.center);
    const groups=[];
    for(const entry of entries){const last=groups.at(-1);if(last&&Math.abs(entry.center-last.center)<.15){last.min=Math.min(last.min,entry.min);last.max=Math.max(last.max,entry.max);}else groups.push({...entry});}
    return groups.slice(1).map((group,i)=>({center:(groups[i].max+group.min)/2,width:group.min-groups[i].max}));
  };
  const xGaps=grouped('x'),yGaps=grouped('y'),wide=xGaps.length>=2;
  const spots=wide?[{x:xGaps[0].center,y:yGaps[0].center},{x:xGaps[1].center,y:yGaps[0].center}]:[{x:xGaps[0].center,y:yGaps[1].center},{x:xGaps[0].center,y:yGaps[0].center}];
  const gap=Math.min(...(wide?[xGaps[0].width,xGaps[1].width,yGaps[0].width]:[xGaps[0].width,yGaps[0].width,yGaps[1].width]));
  const radius=Math.max(.025,Math.min(.145,gap/2-.018)),z=Math.max(...boxes.map(b=>b.max.z))+.055;
  return {previous:{position:new THREE.Vector3(spots[0].x,spots[0].y,z),radius},next:{position:new THREE.Vector3(spots[1].x,spots[1].y,z),radius}};
}

export function pageControlsFrame(frame,poses,bounds,grade){
  const fitted=frame.clone();
  for(const {position,radius} of Object.values(pageControlPlacements(poses,bounds,grade))){
    const extent=radius+.02;
    fitted.expandByPoint(position.clone().addScalar(-extent));
    fitted.expandByPoint(position.clone().addScalar(extent));
  }
  return fitted;
}

export function createPageControls(){
  const root=new THREE.Group();root.name='Physical book page controls';
  const resources=[];
  const material=color=>{const value=new THREE.MeshStandardMaterial({color,roughness:.79,metalness:0,depthTest:true,depthWrite:true,side:THREE.DoubleSide});resources.push(value);return value;};
  const tan=material(0xc48860),cream=material(0xffe4ba),blue=material(0x4776a2),dark=material(0x75506b);
  const entries=new Map();
  for(const side of ['previous','next']){
    const group=new THREE.Group();group.name=`Physical ${side} page`;group.userData.pageTurn=side;root.add(group);
    const disc=new THREE.ExtrudeGeometry(new THREE.Shape().absarc(0,0,.145,0,Math.PI*2,false),{depth:.028,bevelEnabled:true,bevelSize:.009,bevelThickness:.007,bevelSegments:2,curveSegments:40});
    const face=new THREE.CircleGeometry(.123,40),outline=new THREE.ShapeGeometry(arrowShape(side)),arrow=new THREE.ShapeGeometry(arrowShape(side));
    resources.push(disc,face,outline,arrow);
    const badge=new THREE.Mesh(disc,tan);badge.castShadow=true;badge.receiveShadow=true;group.add(badge);
    const inset=new THREE.Mesh(face,cream);inset.position.z=.039;group.add(inset);
    const shadow=new THREE.Mesh(outline,dark);shadow.position.set(.006,-.008,.042);group.add(shadow);
    const relief=new THREE.Mesh(arrow,blue);relief.position.z=.044;group.add(relief);
    entries.set(side,{group,materials:[tan,cream,blue,dark]});
  }
  const faceRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
  return {root,entries,
    update({poses,bounds,selected,state,layout,page,target,busy}){
      const focused=selected?.startsWith('book-');
      const grade=focused?Number(selected.split('-')[1]):layout==='grid'&&state==='grid'?(poses[0].gridRows===3?2:3):0;
      const show=!!grade&&!busy&&(state==='grid'||state==='book');
      const placements=show?(focused?pageControlPlacements(poses,bounds,grade):overviewPageControlPlacements(poses,bounds)):null;
      for(const [side,{group}] of entries){
        group.visible=show;
        if(!show)continue;
        const anchor=placements[side];
        group.position.copy(anchor.position);
        group.quaternion.fromArray(poses[grade-1].quaternion).multiply(faceRotation);
        group.scale.setScalar(anchor.radius/.154);
        group.userData.enabled=side==='previous'?target>-.999:target<9.999;
        group.userData.pageTurn=side;
        group.userData.page=page;
      }
    },
    dispose(){root.removeFromParent();resources.forEach(resource=>resource.dispose());}
  };
}
