import * as THREE from 'three';
import {navigationActions} from './groovy-navigation.mjs';

// Keep the source silhouette and tilt, but give every disc a closed, beveled back.
// Some source grades are planes; others have a very thin, differently built rim.
function solidCircle(source){
 const positions=source.attributes.position,normal=new THREE.Vector3().fromBufferAttribute(source.attributes.normal,0).normalize();
 const u=new THREE.Vector3(1,0,0).addScaledVector(normal,-normal.x).normalize(),v=new THREE.Vector3().crossVectors(normal,u),p=new THREE.Vector3(),points=new Map();let front=-Infinity;
 for(let i=0;i<positions.count;i++){p.fromBufferAttribute(positions,i);const x=p.dot(u),y=p.dot(v);points.set(`${x.toFixed(6)},${y.toFixed(6)}`,new THREE.Vector2(x,y));front=Math.max(front,p.dot(normal));}
 const sorted=[...points.values()].sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x),lower=[],upper=[];
 for(const point of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),point)<=1e-10)lower.pop();lower.push(point);}
 for(const point of sorted.slice().reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),point)<=1e-10)upper.pop();upper.push(point);}
 const shape=new THREE.Shape([...lower.slice(0,-1),...upper.slice(0,-1)]),depth=.032,bevel=.004;
 const geometry=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1,curveSegments:1});
 geometry.applyMatrix4(new THREE.Matrix4().makeBasis(u,v,normal));geometry.translate(...normal.clone().multiplyScalar(front-depth-bevel).toArray());geometry.clearGroups();geometry.addGroup(0,geometry.attributes.position.count,0);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

function matteGrain(){
 const size=128,pixels=new Uint8Array(size*size*4);let seed=8319;
 for(let i=0;i<pixels.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const value=112+(seed>>>27);pixels[i]=pixels[i+1]=pixels[i+2]=value;pixels[i+3]=255;}
 const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);texture.name='Subtle grade medallion grain';texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4,4);texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

export function createGradePendants(data,values){
 const grain=matteGrain(),resources=[grain],entries=new Map(),root=new THREE.Group();root.name='Original grade pendants';
 for(const grade of data.grades){
  const group=new THREE.Group();group.name=`Pendant_G${grade.grade}`;group.visible=false;group.rotation.x=-Math.PI/2;root.add(group);
  const relief=new THREE.Group();group.add(relief);
  for(const part of grade.parts){
   let geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(values.subarray(part.offset,part.offset+part.count),3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(values.subarray(part.offset+part.count,part.offset+2*part.count),3));for(const g of part.groups)geometry.addGroup(g.start,g.count,g.materialIndex);
   const circle=part.name.startsWith('circle_');if(circle){const source=geometry;geometry=solidCircle(source);source.dispose();}geometry.computeBoundingBox();geometry.computeBoundingSphere();resources.push(geometry);
   const materials=(circle?part.materials.slice(0,1):part.materials).map(m=>{const material=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(...m.color),roughness:circle?.94:.86,metalness:0,depthTest:true,depthWrite:true,...(circle?{bumpMap:grain,bumpScale:.0007}:{})});resources.push(material);return material;});
   const mesh=new THREE.Mesh(geometry,materials);mesh.name=part.name;mesh.castShadow=true;mesh.receiveShadow=true;relief.add(mesh);
  }
  entries.set(grade.grade,{group,relief,progress:0,wanted:false,action:null});
 }
 let active=null;
 return {root,entries,
  update({context,book,readingBounds,dt=0,reduced=false}){
   const action=navigationActions(context).find(a=>a.grade),wanted=action?.grade;let moving=false;
   for(const [grade,e] of entries){
    const show=grade===wanted&&!!book;e.wanted=show;
    // Anchor only when a new pendant is shown; camera movement never changes it.
    if(show&&active!==`${context.selected}:${grade}:${action.side}`){
     const b=book.localBounds,x=action.side==='left'?(readingBounds.min[0]+b.min[0])/2:(b.max[0]+readingBounds.max[0])/2;
     book.group.add(e.group);e.group.position.set(x,b.max[1]+.025,(b.min[2]+b.max[2])/2);e.group.userData.navigation={id:action.id,grade};active=`${context.selected}:${grade}:${action.side}`;
    }
    e.action=show&&!context.busy?action:null;e.group.userData.enabled=!!e.action;
    const target=show?1:0;e.progress=reduced?target:THREE.MathUtils.clamp(e.progress+(show?1:-1)*dt/(show?11/30:20/30),0,1);
    if(Math.abs(e.progress-target)>.0001)moving=true;
    const t=e.progress*e.progress*(3-2*e.progress);e.group.visible=e.progress>0;e.group.scale.setScalar(.82*t);e.relief.rotation.y=(1-t)*Math.PI/2;
    if(!show&&context.busy){e.group.visible=false;e.progress=0;}
   }
   if(!action)active=null;return moving;
  },
  diagnostics(camera,occluders){
   const ray=new THREE.Raycaster();return [...entries].filter(([,e])=>e.group.visible).map(([grade,e])=>{e.group.updateMatrixWorld(true);const point=e.group.getWorldPosition(new THREE.Vector3()),direction=point.clone().sub(camera.position).normalize();ray.set(camera.position,direction);const hits=ray.intersectObjects([...occluders,e.group],true).filter(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;}),hit=hits[0];let hitRoot=hit?.object;while(hitRoot&&hitRoot!==e.group)hitRoot=hitRoot.parent;return {grade,position:point.toArray(),enabled:!!e.action,occluded:!!hit&&!hitRoot,triangles:e.relief.children.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0)};});
  },
  dispose(){for(const e of entries.values())e.group.removeFromParent();root.removeFromParent();resources.forEach(r=>r.dispose());}
 };
}
