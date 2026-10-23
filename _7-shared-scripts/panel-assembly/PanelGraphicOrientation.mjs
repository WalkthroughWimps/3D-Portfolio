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
    }
  }
  /** Call after the name frame installs its live texture. Artwork owners may replace either map. */
  bindArtwork(){
    for(const [id,pair] of this.prints){
      const frontMaterials=Array.isArray(pair.front.mesh.material)?pair.front.mesh.material:[pair.front.mesh.material];
      const backMaterials=Array.isArray(pair.back.mesh.material)?pair.back.mesh.material:[pair.back.mesh.material];
      const front=frontMaterials.find(m=>/ front print$/i.test(m?.name||''));
      const back=backMaterials.find(m=>/ back print$/i.test(m?.name||''));
      if(!front||!back)throw new Error(`Missing artwork material pair: ${id}`);
      this.artwork.set(id,{front,back,icon:front.map,name:back.map,iconFront:front.map,iconBack:front.map,nameFront:back.map,nameBack:back.map});
      this.syncDisplay(id);
    }
  }
  setArtwork(panelId,{icon,name,iconFront,iconBack,nameFront,nameBack}={}){
    const entry=this.artwork.get(panelId);if(!entry)return false;
    if(icon){entry.icon=icon;entry.iconFront=icon;entry.iconBack=icon;}
    if(name){entry.name=name;entry.nameFront=name;entry.nameBack=name;}
    if(iconFront)entry.iconFront=iconFront;if(iconBack)entry.iconBack=iconBack;
    if(nameFront)entry.nameFront=nameFront;if(nameBack)entry.nameBack=nameBack;
    this.syncDisplay(panelId);return true;
  }
  syncDisplay(panelId,options){
    const entry=this.artwork.get(panelId),panel=this.motion.panels.get(panelId);
    if(!entry||!panel)return false;
    // A click only changes the next resting-side intent. Keep both currently
    // viewable artwork and the committed hover-entry image attached to their
    // surfaces; prepare the hidden return surface after the midpoint.
    const preserveVisible=options?.preserveVisible===true||Boolean(panel.turn);
    const frontVisible=FRONT.clone().applyQuaternion(panel.baseQuaternion).z>=0;
    const desired=this.motion.getLogicalSide(panelId);
    if(preserveVisible){
      if(panel.turn?.hover&&panel.turn.angle<=Math.PI)return true;
      const hiddenFront=!frontVisible;
      const material=hiddenFront?entry.front:entry.back;
      const hiddenSide=panel.turn?desired:(desired==='icon'?'name':'icon');
      const map=hiddenSide==='icon'?(hiddenFront?entry.iconFront:entry.iconBack):(hiddenFront?entry.nameFront:entry.nameBack);
      if(material.map!==map){material.map=map;material.needsUpdate=true;}
      return true;
    }
    const baselineFront=panel.turn?.hover?FRONT.clone().applyQuaternion(panel.turn.start).z>=0:frontVisible;
    const frontMap=(baselineFront?desired==='icon':desired==='name')?entry.iconFront:entry.nameFront;
    const backMap=(baselineFront?desired==='icon':desired==='name')?entry.nameBack:entry.iconBack;
    if(entry.front.map!==frontMap){entry.front.map=frontMap;entry.front.needsUpdate=true;}
    if(entry.back.map!==backMap){entry.back.map=backMap;entry.back.needsUpdate=true;}
    panel.visibleArtworkSide=desired;
    return true;
  }
  /** Predict the landing side and turn its UVs before that side becomes visible. */
  prepareFlip(panelId,axis,{start,desired}={}){
    const panel=this.motion.panels.get(panelId),pair=this.prints.get(panelId);
    if(!panel||!pair)return;
    const hoverEntry=panel.turn?.hover&&start===undefined;
    start??=panel.baseQuaternion;
    const frontVisible=FRONT.clone().applyQuaternion(start).z>0;
    const incoming=frontVisible?pair.back:pair.front;
    // Bind the landing image while its face is still hidden. The old visible
    // print stays intact until the physical turn hides it.
    const artwork=this.artwork.get(panelId);
    if(artwork){
      if(desired===undefined){
        desired=hoverEntry?(panel.turn.startSide==='icon'?'name':'icon'):this.motion.getLogicalSide(panelId);
      }
      const target=desired==='icon'?(frontVisible?artwork.iconBack:artwork.iconFront):(frontVisible?artwork.nameBack:artwork.nameFront);
      const material=frontVisible?artwork.back:artwork.front;
      if(material.map!==target){material.map=target;material.needsUpdate=true;}
    }
    const landing=new THREE.Quaternion().setFromAxisAngle(axis,Math.PI).multiply(start);
    let best=0,score=-Infinity;
    for(let quarter=0;quarter<4;quarter++){
      const angle=quarter*Math.PI/2,inv=incoming.basis.inv;
      // Image +V after UV rotation: M^-1 R(-angle) (0,1).
      const u=Math.sin(angle),v=Math.cos(angle);
      const up=new THREE.Vector3(inv[0]*u+inv[1]*v,inv[2]*u+inv[3]*v,0)
        .transformDirection(incoming.localToPivot).applyQuaternion(landing).normalize();
      if(up.y*incoming.imageUpSign>score){score=up.y*incoming.imageUpSign;best=angle;}
    }
    this.setAngle(incoming,best);
  }
  setAngle(record,angle){
    const uv=record.geometry.getAttribute('uv'),base=record.base;
    const c=Math.cos(angle),s=Math.sin(angle);
    for(let i=0;i<base.length;i+=2){const u=base[i]-.5,v=base[i+1]-.5;
      uv.array[i]=.5+c*u-s*v;uv.array[i+1]=.5+s*u+c*v;}
    uv.needsUpdate=true;record.angle=angle;
  }
  reset(){for(const record of this.owned)this.setAngle(record,0);}
  dispose(){for(const record of this.owned){record.mesh.geometry=record.original;record.geometry.dispose();}
    this.owned.length=0;this.prints.clear();this.artwork.clear();}
}
