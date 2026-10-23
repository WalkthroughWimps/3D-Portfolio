import * as THREE from 'three';
import {SOURCE_SCALE} from './marker-player-model.mjs';
import {boundedWallGeometry} from './bounded-wall.mjs';

export function createShelfContext(data,values,scene,texture,wallData){
 const root=new THREE.Group();root.name='Bounded source wall and original decorations';scene.add(root);
 const resources=[];
 const materials=data.materials.map(m=>{
  const material=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(...m.color),map:m.texture?texture(m.texture):null,roughness:m.roughness,side:THREE.DoubleSide});
  resources.push(material);return material;
 });
 for(const part of data.parts){
  const v=values.slice(part.start*8,(part.start+part.count)*8);for(let i=0;i<v.length;i+=8){v[i]*=SOURCE_SCALE;v[i+1]*=SOURCE_SCALE;v[i+2]*=SOURCE_SCALE;}
  const buffer=new THREE.InterleavedBuffer(v,8),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(buffer,3,3));geometry.setAttribute('uv',new THREE.InterleavedBufferAttribute(buffer,2,6));
  for(const g of part.groups)geometry.addGroup(g.start,g.count,g.materialIndex);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();resources.push(geometry);
  const obj=new THREE.Mesh(geometry,materials);obj.name=part.name;obj.castShadow=obj.receiveShadow=true;if(part.name.startsWith('Easel'))obj.userData.easel=true;root.add(obj);
 }
 const geometry=boundedWallGeometry(wallData),wallMaterials=wallData.materials.map(m=>new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(...m.color),roughness:Math.max(.65,m.roughness),side:THREE.DoubleSide}));
 resources.push(geometry,...wallMaterials);const wall=new THREE.Mesh(geometry,wallMaterials);wall.name='Original bounded Wall_Art';wall.receiveShadow=true;wall.castShadow=true;root.add(wall);
 root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);
 return {root,wall,bounds,easel:root.children.find(o=>o.name==='Easel.Pic'),dispose(){resources.forEach(r=>r.dispose());scene.remove(root);}};
}
