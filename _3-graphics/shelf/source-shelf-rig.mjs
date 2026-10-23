import * as THREE from 'three';
import {SOURCE_SCALE,slerp,worldBounds} from './marker-player-model.mjs';
import {mountShelfGeometry} from './shelf-mounting.mjs';
export function createSourceShelf(data,scene){
  const root=new THREE.Group();root.matrixAutoUpdate=false;scene.add(root);const resources=[];
  function mesh(part){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(part.positions.map(v=>v*SOURCE_SCALE),3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(part.normals,3));g.setIndex(part.indices);resources.push(g);
    if(part.colors)g.setAttribute('color',new THREE.Float32BufferAttribute(part.colors,3));
    for(const item of part.groups)g.addGroup(item.start,item.count,item.materialIndex);
    const mats=part.materials.map(m=>{const color=part.colors?new THREE.Color(1,1,1):new THREE.Color().setRGB(...m.color);const material=new THREE.MeshStandardMaterial({color,vertexColors:!!part.colors,metalness:m.metalness,roughness:Math.max(.5,m.roughness)});resources.push(material);return material;});
    const obj=new THREE.Mesh(g,mats);obj.castShadow=obj.receiveShadow=true;root.add(obj);g.computeBoundingBox();
    return {obj,part};
  }
  const shelf=mesh(data.parts[0]),ends=data.parts.slice(1).map(mesh);
  shelf.obj.position.fromArray(shelf.part.center.map(v=>v*SOURCE_SCALE));shelf.obj.quaternion.fromArray(shelf.part.residual);
  shelf.obj.updateMatrix();const mounting=mountShelfGeometry(shelf.obj.geometry,shelf.obj.matrix);
  const ref=new THREE.Matrix4().set(...data.parts[0].matrix);ref.elements[12]*=SOURCE_SCALE;ref.elements[13]*=SOURCE_SCALE;ref.elements[14]*=SOURCE_SCALE;
  const inverse=ref.clone().invert(),matrix=new THREE.Matrix4(),temp=new THREE.Box3();
  function update(sample,imperfection,storedBooks){
    const minX=Math.min(...storedBooks.map(p=>worldBounds(p).min[0])),maxX=Math.max(...storedBooks.map(p=>worldBounds(p).max[0]));
    const bookends=[];
    for(let i=0;i<ends.length;i++){
      const {obj,part}=ends[i];obj.position.fromArray(part.center.map(v=>v*SOURCE_SCALE));
      obj.position.z+=(imperfection-1)*(i===0?.018:-.014);
      obj.quaternion.fromArray(slerp([0,0,0,1],part.residual,imperfection));obj.updateMatrix();
      temp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrix);
      obj.position.y+=.072971*SOURCE_SCALE+.0004-temp.min.y;
      obj.position.x+=i===0?minX-.007-temp.max.x:maxX+.007-temp.min.x;
      obj.updateMatrix();temp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrix);
      bookends.push({name:part.name,position:obj.position.toArray(),quaternion:obj.quaternion.toArray(),min:temp.min.toArray(),max:temp.max.toArray()});
    }
    matrix.compose(new THREE.Vector3().fromArray(sample.position),new THREE.Quaternion().fromArray(sample.quaternion),new THREE.Vector3().fromArray(sample.scale));
    root.matrix.copy(matrix.multiply(inverse));root.matrixWorldNeedsUpdate=true;
    root.visible=Math.max(...sample.scale)>.00005;
    return {bookends,slot:{minX,maxX,width:maxX-minX},visible:root.visible,bookendTriangles:ends.reduce((n,e)=>n+e.part.indices.length/3,0)};
  }
  return {root,update,mounting,dispose(){resources.forEach(r=>r.dispose());scene.remove(root);}};
}
