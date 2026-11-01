import * as THREE from 'three';

// One deterministic tile per surface family; no per-page texture allocations.
// RGB stores tangent-space normals; alpha stores fiber/ink variation.
function surfacePixels(type){
  const size=256,heights=new Float32Array(size*size),pixels=new Uint8Array(size*size*4);
  let seed=0x3a94c5d1;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
  const at=(x,y)=>((y+size)%size)*size+(x+size)%size;
  const coarse=Array.from({length:256},random);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const gx=x/16,gy=y/16,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
    const value=(a,b)=>coarse[(b%16)*16+a%16];
    const n=(value(ix,iy)*(1-fx)+value(ix+1,iy)*fx)*(1-fy)+(value(ix,iy+1)*(1-fx)+value(ix+1,iy+1)*fx)*fy;
    heights[at(x,y)]=type==='woven'?.45+.075*Math.cos(x*Math.PI/3)*(.65+.35*Math.cos(y*Math.PI/3))+.075*Math.cos(y*Math.PI/3)+.012*(random()-.5)
      :type==='paper'?.45+.035*n+.025*(random()-.5):.36+.2*n+.06*(random()-.5);
  }
  const splat=(x,y,amount)=>{
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    heights[at(ix,iy)]+=amount*(1-fx)*(1-fy);heights[at(ix+1,iy)]+=amount*fx*(1-fy);
    heights[at(ix,iy+1)]+=amount*(1-fx)*fy;heights[at(ix+1,iy+1)]+=amount*fx*fy;
  };
  for(let fiber=0;fiber<(type==='felt'?2800:700);fiber++){
    const x=random()*size,y=random()*size,angle=random()*Math.PI*2;
    const length=3+random()*10,bow=(random()-.5)*.32,amplitude=(.13+random()*.20)*(type==='felt'?1:.18);
    const dx=Math.cos(angle),dy=Math.sin(angle);
    for(let d=-length/2;d<=length/2;d+=.55){
      const curve=bow*d*d/length;
      splat(x+dx*d-dy*curve,y+dy*d+dx*curve,amplitude);
      splat(x+dx*d-dy*(curve+.8),y+dy*d+dx*(curve+.8),-amplitude*.32);
    }
  }
  const byte=x=>Math.round(THREE.MathUtils.clamp(x,0,1)*255);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const n=at(x,y),dx=(heights[at(x-1,y)]-heights[at(x+1,y)])*2.6,dy=(heights[at(x,y-1)]-heights[at(x,y+1)])*2.6;
    const length=Math.hypot(dx,dy,1);
    pixels[n*4]=byte(dx/length*.5+.5);pixels[n*4+1]=byte(dy/length*.5+.5);pixels[n*4+2]=byte(1/length*.5+.5);
    pixels[n*4+3]=byte((heights[n]-.27)*1.6);
  }
  return pixels;
}

export function createFeltSurface(initial={}){
  const size=256,appearance={type:'felt',strength:1,scale:1,ink:1,...initial};
  const texture=new THREE.DataTexture(surfacePixels(appearance.type),size,size,THREE.RGBAFormat);
  texture.name='Shared surface relief / normal + ink grain';
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(4*appearance.scale,6*appearance.scale);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  const materials=new Set();let enabled=true;
  const inkUniform={value:appearance.strength*appearance.ink};
  const active=()=>enabled&&appearance.strength>0&&appearance.type!=='smooth';
  const apply=material=>{
    const normalMap=active()?texture:null,sheen=active()?(appearance.type==='felt'?.06:appearance.type==='woven'?.05:0):0;
    if(material.normalMap!==normalMap||(material.sheen>0)!==(sheen>0))material.needsUpdate=true;
    material.normalMap=normalMap;material.normalScale.set(.8*appearance.strength,.8*appearance.strength);
    material.sheen=sheen;material.roughness=appearance.type==='paper'?.94:appearance.type==='smooth'?.92:.99;
    material.name=`Screen printed ${appearance.type}`;
  };
  const makeMaterial=({color=0xffffff,map=null}={})=>{
    const material=new THREE.MeshPhysicalMaterial({color,map,roughness:.99,metalness:0,specularIntensity:.06,
      normalMap:texture,normalScale:new THREE.Vector2(.8,.8),sheen:.06,sheenColor:0xffffff,sheenRoughness:1});
    apply(material);
    material.onBeforeCompile=shader=>{
      if(!active())return;
      shader.uniforms.surfaceInk=inkUniform;
      shader.fragmentShader='uniform float surfaceInk;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        // Printing colors the fibers themselves; it is not a glossy decal.
        float feltFiber=texture2D(normalMap,vNormalMapUv).a;
        // Ink grain absorbs a little light; it never brightens the source
        // pigment or adds a pale color over fine text.
        diffuseColor.rgb*=mix(1.0,0.94+0.06*feltFiber,clamp(surfaceInk,0.0,1.0));
      `);
    };
    material.customProgramCacheKey=()=>`printed-surface-v3-${active()}`;
    materials.add(material);return material;
  };
  return {texture,makeMaterial,bytesWithMipmaps:size*size*4*4/3,get appearance(){return {...appearance};},
    setAppearance(values){
      const previous=appearance.type;Object.assign(appearance,values);
      if(!['felt','woven','paper','smooth'].includes(appearance.type))appearance.type='felt';
      appearance.strength=THREE.MathUtils.clamp(appearance.strength,0,2);appearance.scale=THREE.MathUtils.clamp(appearance.scale,.5,3);appearance.ink=THREE.MathUtils.clamp(appearance.ink,0,1);
      if(previous!==appearance.type){texture.image.data.set(surfacePixels(appearance.type));texture.needsUpdate=true;}
      texture.repeat.set(4*appearance.scale,6*appearance.scale);inkUniform.value=appearance.strength*appearance.ink;
      for(const material of materials)apply(material);
    },
    setEnabled(value){
      if(enabled===value)return;enabled=value;
      for(const material of materials)apply(material);
    },
    dispose(){texture.dispose();},
  };
}
