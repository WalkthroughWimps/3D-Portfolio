import * as THREE from 'three';
import {SOURCE_SCALE} from './marker-player-model.mjs';
export const BACKING_DEPTH=-1.25*SOURCE_SCALE;
// Keep the authored front edge, height and footprint. Extend the rear half of
// the existing bevelled board into the backing rather than shifting its load.
export function mountShelfGeometry(geometry,referenceMatrix=new THREE.Matrix4()){
  const positions=geometry.getAttribute('position'),points=[],point=new THREE.Vector3(),inverse=referenceMatrix.clone().invert();
  for(let i=0;i<positions.count;i++)points.push(point.fromBufferAttribute(positions,i).applyMatrix4(referenceMatrix).clone());
  const rear=Math.min(...points.map(p=>p.z)),front=Math.max(...points.map(p=>p.z)),join=BACKING_DEPTH-.008*SOURCE_SCALE,shift=join-rear;
  points.forEach((p,i)=>{if(p.z<(rear+front)/2)p.z+=shift;p.applyMatrix4(inverse);positions.setXYZ(i,p.x,p.y,p.z);});
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {originalRear:rear,backing:BACKING_DEPTH,mountedRear:join,front,extension:-shift};
}
