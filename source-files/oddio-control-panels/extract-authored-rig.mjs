// Regenerate the geometry snapshot from the live Oddio procedural rig.
// Run: node --experimental-loader ./three-loader.mjs ./extract-authored-rig.mjs
import {createRequire} from 'node:module';
import * as THREE from 'three';
import {createClothTransport} from '../../_1-about/faces/odd/cloth-rig.js';
import {writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require=createRequire(import.meta.url);
let canvasPackage;
try{canvasPackage=require('@napi-rs/canvas');}
catch{canvasPackage=require('C:/Users/spami/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');}
const {createCanvas,Image,Path2D,GlobalFonts}=canvasPackage;
for(const [file,family] of [
  ['C:/Windows/Fonts/arial.ttf','Arial'],
  ['C:/Windows/Fonts/arialbd.ttf','Arial'],
  ['C:/Windows/Fonts/seguisym.ttf','Segoe UI Symbol'],
])GlobalFonts.registerFromPath(file,family);

globalThis.Image=Image;globalThis.Path2D=Path2D;
globalThis.document={createElement(type){if(type!=='canvas')throw Error('Unexpected element '+type);return createCanvas(1,1);}};
const here=path.dirname(fileURLToPath(import.meta.url));
const stage=new THREE.Group();
const rig=createClothTransport(stage,{maxTextureSize:4096});
rig.configure({});
rig.setMode('mix');
rig.update(0,{reduced:true,volume:1,lanes:Array.from({length:4},()=>({gain:.7,tone:18000,echo:0,muted:false}))});
rig.group.updateMatrixWorld(true);
// The canvas runtime on some Windows machines substitutes squares for the two
// transport triangles. Keep the authored plaque geometry but draw these two
// glyphs as simple vector triangles in the extracted artwork.
rig.group.traverse(node=>{
  if(!node.isMesh||!['◀','▶'].includes(node.userData.retroText))return;
  for(const [canvas,glow] of [[node.userData.plaqueFace?.map?.image,false],[node.userData.plaqueFace?.emissiveMap?.image,true]]){
    if(!canvas)return;
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const pixel=ctx.getImageData(20,20,1,1).data;
    ctx.fillStyle=`rgba(${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]/255})`;
    ctx.fillRect(0,0,w,h);
    ctx.strokeStyle=glow?'#584737':'#b99a60';ctx.lineWidth=3;ctx.strokeRect(4,4,w-8,h-8);
    const cx=w/2,cy=h/2,halfW=h*.26,halfH=h*.31,left=node.userData.retroText==='◀';
    ctx.fillStyle='#fff0c9';ctx.beginPath();
    ctx.moveTo(cx+(left?-halfW:halfW),cy);
    ctx.lineTo(cx+(left?halfW:-halfW),cy-halfH);
    ctx.lineTo(cx+(left?halfW:-halfW),cy+halfH);
    ctx.closePath();ctx.fill();
  }
});
const direct=rig.group.children;
const upper=direct.findIndex(x=>x.name==='Curved upper control cover');
const lower=direct.findIndex(x=>x.name==='Curved lower control cover');
const start=direct.findIndex((x,i)=>i>lower&&x.name==='ODDIO');
if(upper<0||lower<0||start<0)throw Error('Authored panel anchors changed');
const excluded=new Set(['Oddio needle and unpicker atelier','Four independent reader withdrawal carriers']);
const chosen=[direct[upper],direct[lower],...direct.slice(start).filter(x=>!excluded.has(x.name))];
const geometries={},materials={},images={},meshes=[];
function imageFor(texture){
  if(!texture?.image?.toBuffer)return null;
  const key=texture.uuid;
  if(!images[key])images[key]={png:texture.image.toBuffer('image/png').toString('base64'),colorSpace:texture.colorSpace};
  return key;
}
function materialFor(mat){
  if(!mat)return null;const key=mat.uuid;
  if(!materials[key])materials[key]={name:mat.name||mat.type,type:mat.type,color:'#'+(mat.color?.getHexString?.()||'ffffff'),metalness:mat.metalness||0,roughness:mat.roughness??.5,opacity:mat.opacity??1,transparent:!!mat.transparent,emissive:'#'+(mat.emissive?.getHexString?.()||'000000'),emissiveIntensity:mat.emissiveIntensity||0,map:imageFor(mat.map),emissiveMap:imageFor(mat.emissiveMap),side:mat.side};
  return key;
}
function geometryFor(g){const key=g.uuid;if(!geometries[key]){
  const attrs={};for(const k of ['position','normal','uv'])if(g.attributes[k])attrs[k]={itemSize:g.attributes[k].itemSize,array:Array.from(g.attributes[k].array)};
  geometries[key]={attributes:attrs,index:g.index?Array.from(g.index.array):null,groups:g.groups.map(x=>({start:x.start,count:x.count,materialIndex:x.materialIndex}))};
}return key;}
for(const root of chosen){
  root.traverse(x=>{
    if(!x.isMesh||!x.visible||x.name.includes('pick target')||x.material?.visible===false)return;
    const mats=Array.isArray(x.material)?x.material:[x.material];if(mats.every(m=>m.visible===false||m.colorWrite===false))return;
    let parent=x,parts=[];while(parent&&parent!==rig.group){parts.unshift(parent.name||parent.type);parent=parent.parent;}
    meshes.push({name:x.name||'Unnamed mesh',path:parts,root:root.name,kind:root===direct[upper]?'upper_panel':root===direct[lower]?'lower_panel':'control',geometry:geometryFor(x.geometry),materials:mats.map(materialFor),worldMatrix:x.matrixWorld.toArray(),action:typeof x.userData.oddAction==='string'?x.userData.oddAction:null});
  });
}
const payload={format:'oddio-authored-rig-v1',units:'meters',source:'_1-about/faces/odd/cloth-rig.js',coordinateSystem:'Three.js +Y up, +Z forward',panels:{upper:direct[upper].name,lower:direct[lower].name},geometries,materials,images,meshes};
const output=path.join(here,'authored-geometry.json.gz');
await writeFile(output,gzipSync(Buffer.from(JSON.stringify(payload)),{level:9}));
console.log(JSON.stringify({output,objects:meshes.length,geometries:Object.keys(geometries).length,materials:Object.keys(materials).length,images:Object.keys(images).length,bytes:(await import('node:fs')).statSync(output).size,roots:chosen.map(x=>x.name)}));
rig.dispose();
