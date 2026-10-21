import * as THREE from 'three';

// Skills opts in explicitly: its moving membrane stays inside the card carrier,
// and its spheroid lattice follows this same displacement field before drawing.
export const SPEAKER_FACES = Object.freeze(['about', 'refs', 'skills']);
const surfaces = new WeakMap();
export const getSpeakerSurface = backing => surfaces.get(backing) || null;

export function createSpeakerResponse() {
  const membranes=[];
  let reduced=false,suspended=false,envelope=0,phase=0,settings={};
  function reset() {
    envelope=0;
    for(const item of membranes){item.displacement=0;if(item.changed){item.geometry.attributes.position.array.set(item.rest);item.geometry.attributes.position.needsUpdate=true;item.changed=false;}}
  }
  function detach() {
    reset();
    for(const item of membranes){surfaces.delete(item.root);if(item.mesh.geometry===item.geometry)item.mesh.geometry=item.original;item.geometry.dispose();}
    membranes.length=0;
  }
  return {
    attach(faces) {
      detach();suspended=false;
      for(const id of SPEAKER_FACES){
        const face=faces.get(id);
        if(!face?.backing||(face.components?.length&&id!=='skills'))continue;
        face.backing.traverse(mesh=>{
          if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
          const original=mesh.geometry,geometry=original.clone(),position=geometry.attributes.position;
          geometry.computeBoundingBox();const bounds=geometry.boundingBox,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
          const axis=size.x<size.y&&size.x<size.z?0:size.y<size.z?1:2,other=[0,1,2].filter(i=>i!==axis);
          const radius=.84,rest=new Float32Array(position.array),weights=new Float32Array(position.count),sign=Math.sign(center.getComponent(axis))||1;
          const weightAt=point=>Math.max(0,1-((point.getComponent(other[0])-center.getComponent(other[0]))**2+(point.getComponent(other[1])-center.getComponent(other[1]))**2)/(radius*radius))**2*sign;
          const point=new THREE.Vector3();
          for(let i=0;i<position.count;i++)weights[i]=weightAt(point.fromArray(rest,i*3));
          position.setUsage(THREE.DynamicDrawUsage);geometry.computeBoundingSphere();geometry.boundingSphere.radius+=.01;
          const item={mesh,root:face.backing,face,id,original,geometry,rest,weights,axis,weightAt,displacement:0,span:Math.max(...other.map(i=>size.getComponent(i))),changed:false};
          mesh.geometry=geometry;membranes.push(item);
          // Use the inner bowl rather than its wider metal surround.
          if(!surfaces.has(face.backing)||item.span<surfaces.get(face.backing).span)surfaces.set(face.backing,item);
        });
      }
    },
    update(dt,level=0) {
      if(reduced||suspended){reset();return;}
      const step=Math.max(0,Math.min(.05,dt)),target=Math.min(1,Math.max(0,Number.isFinite(level)?level*6:0));
      envelope+=(target-envelope)*(1-Math.exp(-step/(target>envelope ? .02 : .12)));
      phase=(phase+step*(Math.PI*2*17+envelope*15))%(Math.PI*200);
      const displacement=envelope<.0001?0:envelope*.0048*(Math.sin(phase)+.25*Math.sin(phase*2.31));
      for(const item of membranes){
        const value=settings.about?.[item.id]?.enabled!==false&&(item.root.visible||item.id==='skills')&&!(item.id==='skills'&&item.face.assembly?.userReducedMotion)?displacement:0;item.displacement=value;if(!value&&!item.changed)continue;
        const position=item.geometry.attributes.position;
        for(let i=0;i<position.count;i++)position.array[i*3+item.axis]=item.rest[i*3+item.axis]+value*item.weights[i];
        position.needsUpdate=true;item.changed=Boolean(value);
      }
    },
    applySettings(snapshot){settings=snapshot;reduced=Boolean(snapshot.accessibility?.reducedMotion);if(reduced)reset();},
    suspend(){suspended=true;reset();},resume(){suspended=false;},detach,
    dispose:detach,
    get meshCount(){return membranes.length;}
  };
}
