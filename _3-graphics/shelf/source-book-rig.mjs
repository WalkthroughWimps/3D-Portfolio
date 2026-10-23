import * as THREE from 'three';
import {createSheetData,poseSheet,WIDTH,HEIGHT,SHEETS} from './page-geometry.mjs';
import {bindingModel,DEFAULT_BINDING,SPINE_SEGMENTS} from './binding-model.mjs';
import {closedShape} from './closed-shape.mjs';
const origin=closedShape().center;
let cachedThickness=null,cachedClosedBounds=null;
function closedBounds(thickness){
  if(thickness!==cachedThickness){const shape=closedShape({pageThickness:DEFAULT_BINDING.pageThickness*thickness});cachedThickness=thickness;cachedClosedBounds={min:shape.size.map((v,i)=>-v/2+shape.center[i]-origin[i]),max:shape.size.map((v,i)=>v/2+shape.center[i]-origin[i])};}
  return cachedClosedBounds;
}
export function createSourceBook({grade,pageSurface,coverSurface,texture}){
  const group=new THREE.Group(),detail=new THREE.Group(),proxy=new THREE.Group();group.add(detail,proxy);
  const resources=[],art=[];
  const colors=[0x8c2436,0xa25c1e,0x9a7721,0x267d7d,0x23466f,0x67447e];
  function material(family,options){const m=family.makeMaterial(options);resources.push(m);return m;}
  const edge=material(pageSurface,{color:0xe3d9bd}),coverEdge=material(coverSurface,{color:colors[grade-1]});
  function face(file,family){const m=material(family,{map:texture(`assets/grade-${grade}/thumbs/${file}`)});art.push({m,file});return m;}
  const frontM=[face('front.jpg',coverSurface),face('inside-front.jpg',pageSurface),coverEdge];
  const backM=[face('inside-back.jpg',pageSurface),face('back.jpg',coverSurface),coverEdge];
  function sheet(parent,nx,nz,mats){
    const data=createSheetData({nx,nz}),g=new THREE.BufferGeometry();resources.push(g);
    g.setAttribute('position',new THREE.BufferAttribute(data.positions,3).setUsage(THREE.DynamicDrawUsage));g.setAttribute('normal',new THREE.BufferAttribute(data.normals,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv',new THREE.BufferAttribute(data.uvs,2));g.setIndex(new THREE.BufferAttribute(data.indices,1));
    for(const item of data.groups)g.addGroup(item.start,item.count,item.materialIndex);
    const mesh=new THREE.Mesh(g,mats);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
    return {mesh,data,apply(pose){data.width=pose.width??WIDTH;data.height=pose.height??HEIGHT;data.thickness=pose.thickness??DEFAULT_BINDING.pageThickness;poseSheet(data,pose);
      for(let i=0;i<data.positions.length;i++)data.positions[i]-=origin[i%3];
      g.attributes.position.needsUpdate=true;g.attributes.normal.needsUpdate=true;g.computeBoundingBox();g.computeBoundingSphere();}};
  }
  const front=sheet(detail,32,3,frontM),back=sheet(detail,32,3,backM),spine=sheet(detail,SPINE_SEGMENTS,2,[coverEdge,coverEdge,coverEdge]);
  const pages=Array.from({length:SHEETS},(_,i)=>sheet(detail,32,4,[face(`page-${String(i*2+1).padStart(2,'0')}.jpg`,pageSurface),face(`page-${String(i*2+2).padStart(2,'0')}.jpg`,pageSurface),edge]));
  const pf=sheet(proxy,8,1,frontM),pb=sheet(proxy,8,1,backM),ps=sheet(proxy,20,1,[coverEdge,coverEdge,coverEdge]),block=sheet(proxy,8,1,[edge,edge,edge]);
  spine.mesh.userData.spine=true;ps.mesh.userData.spine=true;
  let key='',localBounds=null,isClosed=true;
  function update(progress,thickness=1,turns=null,flipStrength=.05){
    const closed=progress<=-.99999||progress>=9.99999;
    const next=closed?`${progress<0?'front':'back'}:${thickness}`:`${progress}:${thickness}:${turns?.join(',')}:${flipStrength}`;if(next===key)return localBounds;key=next;
    isClosed=closed;detail.visible=!isClosed;proxy.visible=isClosed;
    const settings={...DEFAULT_BINDING,pageThickness:DEFAULT_BINDING.pageThickness*thickness},model=bindingModel(progress,settings,.8,0,turns,flipStrength);
    const visible=isClosed?[pf,pb,ps,block]:[front,back,spine,...pages];
    if(isClosed){pf.apply(model.cover('front',pf.data.nx));pb.apply(model.cover('back',pb.data.nx));ps.apply(model.spine());block.apply(model.proxy(block.data.nx));}
    else{front.apply(model.cover('front',front.data.nx));back.apply(model.cover('back',back.data.nx));spine.apply(model.spine());pages.forEach((p,i)=>p.apply(model.page(i,p.data.nx)));}
    const bbox=new THREE.Box3();for(const p of visible)bbox.union(p.mesh.geometry.boundingBox);
    localBounds={min:bbox.min.toArray(),max:bbox.max.toArray()};return localBounds;
  }
  function setArtwork(get){for(const {m,file} of art){const map=get(file)||texture(`assets/grade-${grade}/thumbs/${file}`);if(m.map!==map){m.map=map;m.needsUpdate=true;}}}
  update(-1);
  return {grade,group,update,setArtwork,closedBounds,get closed(){return isClosed;},get localBounds(){return localBounds;},dispose(){resources.forEach(r=>r.dispose());}};
}
