import * as THREE from 'three';

// One envelope for the entire layout, including every possible chosen book.
// It is evaluated on layout entry, never from the current animated page bounds.
export function presentationBounds(homePoses,readerPoses,closedBounds,readingBounds,centerOverview=false){
  const box=new THREE.Box3(),home=new THREE.Box3();
  for(const [poses,bounds] of [[homePoses,closedBounds],[readerPoses,readingBounds]])for(const p of poses){
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(p.position),new THREE.Quaternion().fromArray(p.quaternion),new THREE.Vector3().fromArray(p.scaleVector));
    const transformed=new THREE.Box3(new THREE.Vector3().fromArray(bounds.min),new THREE.Vector3().fromArray(bounds.max)).applyMatrix4(matrix);
    box.union(transformed);if(poses===homePoses)home.union(transformed);
  }
  // Keep the authored overview centered, reserving equal room on either side
  // for a reader instead of pulling the grid toward its larger open-book bounds.
  if(centerOverview){
    const center=home.getCenter(new THREE.Vector3());
    for(const axis of ['x','y']){const radius=Math.max(box.max[axis]-center[axis],center[axis]-box.min[axis]);box.min[axis]=center[axis]-radius;box.max[axis]=center[axis]+radius;}
  }
  return box;
}

export function artworkFiles(progress){
  const leaf=Math.max(0,Math.min(8,Math.floor(progress))),files=['front.jpg','back.jpg','inside-front.jpg','inside-back.jpg'];
  for(let i=Math.max(0,leaf-1);i<=Math.min(8,leaf+1);i++)for(let side=1;side<=2;side++)files.push(`page-${String(i*2+side).padStart(2,'0')}.jpg`);
  return files;
}
