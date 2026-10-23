import * as THREE from 'three';
import {SOURCE_SCALE} from './marker-player-model.mjs';
// The original finite Wall_Art slab surrounds the open arch. The purple base
// and vertices below its wall/floor seam are excluded; the opening stays empty.
export function boundedWallGeometry(part,minY=-5.31){
 const positions=[],normals=[],groups=[];
 const blend=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 for(const group of part.groups){
  if(group.materialIndex===1)continue;
  const start=positions.length/3;
  for(let i=group.start;i<group.start+group.count;i+=3){
   let polygon=Array.from({length:3},(_,j)=>[...part.positions.slice((i+j)*3,(i+j+1)*3),...part.normals.slice((i+j)*3,(i+j+1)*3)]),clipped=[];
   for(let j=0;j<polygon.length;j++){
    const a=polygon[j],b=polygon[(j+1)%polygon.length],inside=a[1]>=minY,next=b[1]>=minY;
    if(inside)clipped.push(a);if(inside!==next)clipped.push(blend(a,b,(minY-a[1])/(b[1]-a[1])));
   }
   for(let j=1;j+1<clipped.length;j++)for(const v of [clipped[0],clipped[j],clipped[j+1]]){
    positions.push(...v.slice(0,3).map(n=>n*SOURCE_SCALE));const length=Math.hypot(...v.slice(3));normals.push(...v.slice(3).map(n=>n/(length||1)));
   }
  }
  groups.push({start,count:positions.length/3-start,materialIndex:group.materialIndex});
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
 for(const g of groups)geometry.addGroup(g.start,g.count,g.materialIndex);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
