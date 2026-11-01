import * as THREE from 'three';

const FRONT=new THREE.Vector3(0,0,1);

function printSide(mesh){
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(materials.some(material=>/ front print$/i.test(material?.name||'')))return 'front';
  if(materials.some(material=>/ back print$/i.test(material?.name||'')))return 'back';
  return null;
}

function uvBasis(geometry){
  const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  if(!p||!uv||p.count<3)throw new Error('Print needs position/UV triangles');
  const p0x=p.getX(0),p0y=p.getY(0),u0=uv.getX(0),v0=uv.getY(0);
  for(let i=1;i<p.count-1;i++)for(let j=i+1;j<p.count;j++){
    const ax=p.getX(i)-p0x,ay=p.getY(i)-p0y,bx=p.getX(j)-p0x,by=p.getY(j)-p0y;
    const dp=ax*by-ay*bx;if(Math.abs(dp)<1e-7)continue;
    const au=uv.getX(i)-u0,av=uv.getY(i)-v0,bu=uv.getX(j)-u0,bv=uv.getY(j)-v0;
    const duv=au*bv-av*bu;if(Math.abs(duv)>1e-7){
      const a= (au*by-bu*ay)/dp, b=(bu*ax-au*bx)/dp;
      const c= (av*by-bv*ay)/dp, d=(bv*ax-av*bx)/dp;
      const det=a*d-b*c;
      if(Math.abs(det)>1e-7)return {inv:[d/det,-b/det,-c/det,a/det],handedness:Math.sign(det)};
    }
  }
  throw new Error('Degenerate print UV basis');
}

/** Owns only print geometry copies. Body, edge, morph positions and authored pivots remain intact. */
export class PanelGraphicOrientation{
  constructor(motion){
    this.motion=motion;this.prints=new Map();this.owned=[];this.artwork=new Map();
    for(const [id,panel] of motion.panels){if(!panel.record.axes)continue;
      const entry={};for(const mesh of panel.meshes){const side=printSide(mesh);if(!side)continue;
        const original=mesh.geometry,geometry=original.clone(),uv=geometry.getAttribute('uv');
        if(!uv)throw new Error(`Missing print UV: ${id}/${side}`);
        mesh.geometry=geometry;mesh.updateWorldMatrix(true,false);panel.pivot.updateWorldMatrix(true,false);
        const localToPivot=new THREE.Matrix4().copy(panel.pivot.matrixWorld).invert().multiply(mesh.matrixWorld);
        const map=(Array.isArray(mesh.material)?mesh.material[0]:mesh.material)?.map;
        // glTF textures are uploaded with flipY=false: bitmap text-up follows -V.
        const imageUpSign=map?.flipY===false?-1:1;
        const record={mesh,original,geometry,base:uv.array.slice(),basis:uvBasis(geometry),localToPivot,imageUpSign,angle:0};
        this.owned.push(record);entry[side]=record;
      }
      if(!entry.front||!entry.back)throw new Error(`Missing paired prints: ${id}`);
      this.prints.set(id,entry);
      // Establish the two physical print orientations once. The back is
      // upside down in card space, so a north/south half-turn reads upright.
      this._orient(entry.front,panel.baseQuaternion);
      const north=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1,0,0),Math.PI)
        .multiply(panel.baseQuaternion);
      this._orient(entry.back,north);
    }
  }
  _orient(record,pose){
    let best=0,score=-Infinity;
    for(let quarter=0;quarter<4;quarter++){
      const angle=quarter*Math.PI/2,inv=record.basis.inv;
      const u=Math.sin(angle),v=Math.cos(angle);
      const up=new THREE.Vector3(inv[0]*u+inv[1]*v,inv[2]*u+inv[3]*v,0)
        .transformDirection(record.localToPivot).applyQuaternion(pose).normalize();
      const candidate=up.y*record.imageUpSign;
      if(candidate>score){score=candidate;best=angle;}
    }
    this.setAngle(record,best);record.fixedAngle=best;
  }
  /** Call after the name frame installs its live texture. Artwork owners may replace either map. */
  bindArtwork(){
    for(const [id,pair] of this.prints){
      const frontMaterials=Array.isArray(pair.front.mesh.material)?pair.front.mesh.material:[pair.front.mesh.material];
      const backMaterials=Array.isArray(pair.back.mesh.material)?pair.back.mesh.material:[pair.back.mesh.material];
      const front=frontMaterials.find(m=>/ front print$/i.test(m?.name||''));
      const back=backMaterials.find(m=>/ back print$/i.test(m?.name||''));
      if(!front||!back)throw new Error(`Missing artwork material pair: ${id}`);
      this.artwork.set(id,{front,back,icon:front.map,name:back.map});
    }
  }
  setArtwork(panelId,{icon,name,iconFront,nameBack}={}){
    const entry=this.artwork.get(panelId);if(!entry)return false;
    const front=iconFront||icon,back=nameBack||name;
    if(front){entry.icon=front;if(entry.front.map!==front){entry.front.map=front;entry.front.needsUpdate=true;}}
    if(back){entry.name=back;if(entry.back.map!==back){entry.back.map=back;entry.back.needsUpdate=true;}}
    // Legacy mirrored variants never move between physical surfaces.
    return true;
  }
  syncDisplay(panelId){
    const entry=this.artwork.get(panelId),panel=this.motion.panels.get(panelId);
    if(!entry||!panel)return false;
    panel.visibleArtworkSide=FRONT.clone().applyQuaternion(panel.baseQuaternion).z>=0?'icon':'name';
    return true;
  }
  visibleUpScore(panelId,quaternion){
    const pair=this.prints.get(panelId);if(!pair)return 1;
    const frontVisible=FRONT.clone().applyQuaternion(quaternion).z>=0;
    const print=frontVisible?pair.front:pair.back;
    const {angle,basis,localToPivot,imageUpSign}=print;
    const u=Math.sin(angle),v=Math.cos(angle),inv=basis.inv;
    const up=new THREE.Vector3(inv[0]*u+inv[1]*v,inv[2]*u+inv[3]*v,0)
      .transformDirection(localToPivot).applyQuaternion(quaternion).normalize();
    return up.y*imageUpSign;
  }
  setAngle(record,angle){
    const uv=record.geometry.getAttribute('uv'),base=record.base;
    const c=Math.cos(angle),s=Math.sin(angle);
    for(let i=0;i<base.length;i+=2){const u=base[i]-.5,v=base[i+1]-.5;
      uv.array[i]=.5+c*u-s*v;uv.array[i+1]=.5+s*u+c*v;}
    uv.needsUpdate=true;record.angle=angle;
  }
  reset(){for(const record of this.owned)this.setAngle(record,record.fixedAngle);}
  dispose(){for(const record of this.owned){record.mesh.geometry=record.original;record.geometry.dispose();}
    this.owned.length=0;this.prints.clear();this.artwork.clear();}
}
