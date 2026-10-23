import * as THREE from 'three';
import {SOURCE_SCALE,clamp,slerp} from './marker-player-model.mjs';
import {mountShelfGeometry,BACKING_DEPTH} from './shelf-mounting.mjs';
const tangent=(a,b)=>a*b<=0?0:2*a*b/(a+b);
export function createSourceEnvironment(data,values,scene){
  const root=new THREE.Group(),resources=[],parts=[];scene.add(root);
  for(const part of data.parts){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions.map(v=>v*SOURCE_SCALE),3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));
    for(const group of part.groups)geometry.addGroup(group.start,group.count,group.materialIndex);
    geometry.computeBoundingBox();resources.push(geometry);
    const mounting=part.name.startsWith('Shelf_')?mountShelfGeometry(geometry):null;
    const materials=part.materials.map(m=>{const material=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(...m.color),metalness:m.metalness,roughness:Math.max(.5,m.roughness)});resources.push(material);return material;});
    const obj=new THREE.Mesh(geometry,materials);obj.matrixAutoUpdate=false;obj.receiveShadow=true;obj.castShadow=part.name!=='Wall_Art';root.add(obj);
    const ref=new THREE.Matrix4().set(...part.matrix);ref.elements[12]*=SOURCE_SCALE;ref.elements[13]*=SOURCE_SCALE;ref.elements[14]*=SOURCE_SCALE;
    parts.push({obj,inverse:ref.invert(),mounting});
  }
  // The source wall is an opening. A simple inset backing closes the otherwise
  // transparent space, using its original inner-wall material colour.
  const backingGeometry=new THREE.PlaneGeometry(12,12.6),backingMaterial=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(...data.parts[0].materials[2].color),roughness:.92,side:THREE.DoubleSide});
  const backing=new THREE.Mesh(backingGeometry,backingMaterial);backing.scale.setScalar(SOURCE_SCALE);backing.position.set(0,.3*SOURCE_SCALE,BACKING_DEPTH);backing.receiveShadow=true;parts[0].obj.add(backing);resources.push(backingGeometry,backingMaterial);
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(),matrix=new THREE.Matrix4();
  function update(frame){
    const index=clamp(frame-data.firstFrame,0,data.lastFrame-data.firstFrame),lo=Math.floor(index),hi=Math.min(data.lastFrame-data.firstFrame,lo+1),t=index-lo,t2=t*t,t3=t2*t;
    for(let i=0;i<parts.length;i++){
      const v=(f,k)=>values[clamp(f,0,data.lastFrame-data.firstFrame)*data.stride+i*10+k],sample=[];
      for(const k of [0,1,2,7,8,9]){const a=v(lo,k),b=v(hi,k),d=b-a;sample[k]=(2*t3-3*t2+1)*a+(t3-2*t2+t)*tangent(a-v(lo-1,k),d)+(-2*t3+3*t2)*b+(t3-t2)*tangent(d,v(hi+1,k)-b);}
      sample.splice(3,4,...slerp([3,4,5,6].map(k=>v(lo,k)),[3,4,5,6].map(k=>v(hi,k)),t));
      position.fromArray(sample).multiplyScalar(SOURCE_SCALE);quaternion.fromArray(sample,3);scale.fromArray(sample,7);
      parts[i].obj.matrix.copy(matrix.compose(position,quaternion,scale).multiply(parts[i].inverse));parts[i].obj.matrixWorldNeedsUpdate=true;parts[i].obj.visible=Math.max(...sample.slice(7))>.001;
    }
  }
  update(data.referenceFrame);
  return {root,update,wall:parts[0].obj,mounting:parts.filter(p=>p.mounting).map(p=>p.mounting),dispose(){resources.forEach(r=>r.dispose());scene.remove(root);}};
}
