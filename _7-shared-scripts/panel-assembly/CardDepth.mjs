import * as THREE from 'three';
export const cardDepthDefaults=Object.freeze({neutralCardThickness:.02,clickedCardThickness:.04,clickedCardOffset:0});
export const cardDepthLimits=Object.freeze({neutralCardThickness:[.015,.05],clickedCardThickness:[.03,.08],clickedCardOffset:[-.01,.01]});

/** Reuse the authored outline and two morph endpoints; deform only local normal depth. */
export class CardDepth {
  constructor(rig){this.rig=rig;this.cards=[];rig.model.updateMatrixWorld(true);
    for(const record of rig.manifest.squarePanels){const pivot=rig.findRawNode(record.exportPivotName),body=rig.findRawNode(record.exportBodyName),meshes=[];
      const ranges=[[Infinity,-Infinity],[Infinity,-Infinity]];
      body.traverse(mesh=>{if(!mesh.isMesh||mesh.morphTargetDictionary?.Clicked===undefined)return;
        const original=mesh.geometry,index=mesh.morphTargetDictionary.Clicked,position=original.attributes.position,morph=original.morphAttributes.position[index];
        const toPivot=pivot.matrixWorld.clone().invert().multiply(mesh.matrixWorld),fromPivot=toPivot.clone().invert(),base=[],clicked=[];
        const v=new THREE.Vector3(),d=new THREE.Vector3();
        for(let i=0;i<position.count;i++){v.fromBufferAttribute(position,i);base.push(v.clone().applyMatrix4(toPivot));d.fromBufferAttribute(morph,i);if(original.morphTargetsRelative)d.add(v);clicked.push(d.clone().applyMatrix4(toPivot));
          for(const [k,p]of [[0,base[i]],[1,clicked[i]]]){ranges[k][0]=Math.min(ranges[k][0],p.z);ranges[k][1]=Math.max(ranges[k][1],p.z);}}
        mesh.geometry=original.clone();meshes.push({mesh,original,index,base,clicked,fromPivot});});
      this.cards.push({meshes,ranges});}
  }
  apply(options){for(const card of this.cards){const [[a,b],[c,d]]=card.ranges,center=(a+b)/2;
      for(const part of card.meshes){const geometry=part.mesh.geometry,pos=geometry.attributes.position,morph=geometry.morphAttributes.position[part.index],clickedPositions=new Float32Array(pos.array.length);
        const v=new THREE.Vector3(),w=new THREE.Vector3();
        for(let i=0;i<pos.count;i++){
          v.copy(part.base[i]);v.z=center+(v.z-center)*options.neutralCardThickness/(b-a);v.applyMatrix4(part.fromPivot);pos.setXYZ(i,v.x,v.y,v.z);
          w.copy(part.clicked[i]);w.z=center+options.clickedCardOffset+(w.z-(c+d)/2)*options.clickedCardThickness/(d-c);w.applyMatrix4(part.fromPivot);
          clickedPositions.set([w.x,w.y,w.z],i*3);if(geometry.morphTargetsRelative)w.sub(v);morph.setXYZ(i,w.x,w.y,w.z);}
        pos.needsUpdate=true;morph.needsUpdate=true;geometry.computeVertexNormals();
        if(geometry.morphAttributes.normal?.[part.index]){const target=geometry.clone();target.setAttribute('position',new THREE.BufferAttribute(clickedPositions,3));target.computeVertexNormals();
          const normal=geometry.attributes.normal,tn=target.attributes.normal,mn=geometry.morphAttributes.normal[part.index];
          for(let i=0;i<normal.count;i++)mn.setXYZ(i,tn.getX(i)-(geometry.morphTargetsRelative?normal.getX(i):0),tn.getY(i)-(geometry.morphTargetsRelative?normal.getY(i):0),tn.getZ(i)-(geometry.morphTargetsRelative?normal.getZ(i):0));mn.needsUpdate=true;target.dispose();}
        geometry.computeBoundingBox();geometry.computeBoundingSphere();
        // Three r159 packs morph targets into a GPU texture on first render.
        // Attribute version bumps refresh vertex buffers but not that cached texture.
        // Release this geometry's renderer allocation so the next draw repacks the
        // edited Clicked position/normal target from the existing CPU attributes.
        geometry.dispose();}}
  }
  dispose(){for(const card of this.cards)for(const part of card.meshes){part.mesh.geometry.dispose();part.mesh.geometry=part.original;}}
}
