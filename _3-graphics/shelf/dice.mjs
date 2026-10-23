import * as THREE from 'three';
// Octahedral face normals. The same face table drives labels, results and settling.
export const D8_FACES=Object.freeze([[1,1,1],[-1,-1,-1],[-1,1,1],[1,-1,-1],[1,1,-1],[-1,-1,1],[-1,1,-1],[1,-1,1]].map((normal,i)=>({value:i+1,normal:normal.map(v=>v/Math.sqrt(3))})));
export function d8RestQuaternion(value,yaw=0){const face=D8_FACES.find(f=>f.value===value);if(!face)throw new RangeError('D8 result must be 1–8');return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...face.normal),new THREE.Vector3(0,1,0)));}
export function rollD8(random=Math.random){return 1+Math.min(7,Math.max(0,Math.floor(random()*8)));}
export function createD8({color='#704580',own=r=>r}={}){
 const root=new THREE.Group(),g=own(new THREE.OctahedronGeometry(.25)),material=own(new THREE.MeshStandardMaterial({color,roughness:.55})),mesh=new THREE.Mesh(g,material);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 for(const face of D8_FACES){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#fff4db';ctx.font='bold 78px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(face.value),64,69);const texture=own(new THREE.CanvasTexture(c));texture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Mesh(own(new THREE.PlaneGeometry(.155,.155)),own(new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.03,depthWrite:false})));const normal=new THREE.Vector3(...face.normal);label.position.copy(normal).multiplyScalar(.25/Math.sqrt(3)+.0008);label.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);root.add(label);}return root;
}
