import * as THREE from 'three';
import {SOURCE_SCALE} from './marker-player-model.mjs';
import {sampleWorldTrack} from './world-track.mjs';
export async function createSourceGames(data,values,scene,anisotropy=4){
  const root=new THREE.Group(),resources=[],textures=new Map(),loader=new THREE.TextureLoader();root.matrixAutoUpdate=false;scene.add(root);
  let cancelled=false;
  try{
    await Promise.all([...new Set(data.materials.map(m=>m.texture).filter(Boolean))].map(async url=>{
      const texture=await loader.loadAsync(new URL(url,import.meta.url).href);if(cancelled){texture.dispose();return;}texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=anisotropy;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;textures.set(url,texture);
    }));
  }catch(error){cancelled=true;textures.forEach(t=>t.dispose());scene.remove(root);throw error;}
  const materials=data.materials.map(m=>{const material=new THREE.MeshStandardMaterial({color:new THREE.Color().setRGB(...m.color),map:textures.get(m.texture)||null,roughness:m.roughness,metalness:0,side:THREE.DoubleSide});resources.push(material);return material;});
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
  function transform(obj,sample){position.fromArray(sample).multiplyScalar(SOURCE_SCALE);quaternion.fromArray(sample,3);scale.fromArray(sample,7);obj.matrix.compose(position,quaternion,scale);obj.matrixWorldNeedsUpdate=true;obj.visible=Math.max(...sample.slice(7))>.001;}
  const parts=data.parts.map(part=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(part.positions.map(v=>v*SOURCE_SCALE),3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));
    const uv=part.uvs.slice();
    for(const group of part.groups){
      geometry.addGroup(group.start,group.count,group.materialIndex);const material=data.materials[group.materialIndex],angle=material.uvRotation||0,c=Math.cos(angle),s=Math.sin(angle),offset=material.uvOffset||[0,0],scale=material.uvScale||[1,1];
      for(let i=group.start;i<group.start+group.count;i++){const x=uv[i*2]*scale[0],y=uv[i*2+1]*scale[1];uv[i*2]=x*c-y*s+offset[0];uv[i*2+1]=x*s+y*c+offset[1];}
    }
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();resources.push(geometry);
    const obj=new THREE.Mesh(geometry,materials);obj.name=part.name;obj.matrixAutoUpdate=false;obj.castShadow=obj.receiveShadow=true;obj.userData.game=part.game;root.add(obj);return {obj,part};
  });
  function update(frame,wallMatrix){
    const stored=frame<data.firstFrame,sampleFrame=stored?6467:frame;
    root.matrix.copy(stored?wallMatrix:new THREE.Matrix4());root.matrixWorldNeedsUpdate=true;
    root.visible=!stored||wallMatrix.getMaxScaleOnAxis()>.001;
    parts.forEach(({obj},i)=>transform(obj,sampleWorldTrack(data,values,sampleFrame,i)));
    return {visibleParts:parts.filter(p=>p.obj.visible).length,triangles:parts.filter(p=>p.obj.visible).reduce((n,p)=>n+p.part.positions.length/9,0)};
  }
  function snapshot(game,frame=6467){
    const result=new THREE.Group();result.name=data.games[game].name;
    parts.forEach(({obj,part},i)=>{if(part.game!==game)return;const copy=new THREE.Mesh(obj.geometry,obj.material);copy.matrixAutoUpdate=false;transform(copy,sampleWorldTrack(data,values,frame,i));copy.castShadow=copy.receiveShadow=false;if(copy.visible)result.add(copy);});
    return result;
  }
  const clipBoxes=new Map();
  function clipBounds(marker){
    if(clipBoxes.has(marker.name))return clipBoxes.get(marker.name).clone();
    const bounds=new THREE.Box3(),matrix=new THREE.Matrix4();
    for(let frame=marker.frame;frame<=marker.endFrame;frame+=1)parts.forEach(({obj},i)=>{
      const sample=sampleWorldTrack(data,values,frame,i);if(Math.max(...sample.slice(7))<=.001)return;
      position.fromArray(sample).multiplyScalar(SOURCE_SCALE);quaternion.fromArray(sample,3);scale.fromArray(sample,7);matrix.compose(position,quaternion,scale);bounds.union(obj.geometry.boundingBox.clone().applyMatrix4(matrix));
    });
    clipBoxes.set(marker.name,bounds.clone());return bounds;
  }
  return {root,parts,data,update,snapshot,clipBounds,dispose(){resources.forEach(r=>r.dispose());textures.forEach(t=>t.dispose());scene.remove(root);}};
}
